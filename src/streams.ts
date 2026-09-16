import { createReadStream } from 'node:fs';
import { open, stat, unlink } from 'node:fs/promises';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { bunFile, defaultStorageFetch } from './storage-fetch.js';
import {
    AssetsProError,
    TransportError,
    ProtocolError,
    abortScope,
    httpUrl,
    resolveStorageLocation,
    type Transport,
    type RequestOptions,
} from './transport.js';
import type { UploadAuthorization } from './types.js';

export interface UploadSource {
    name: string;
    size: number;
    mimeType: string;
    open: () =>
        | ReadableStream<Uint8Array>
        | Promise<ReadableStream<Uint8Array>>;
}
const nativeSources = new WeakMap<UploadSource['open'], string | Blob>();
export interface TransferOptions extends RequestOptions {
    /** Bytes consumed from the local stream; this is not server-side processing progress. */
    onProgress?: (bytes: number, total: number) => void;
}
export class UploadError extends AssetsProError {
    override name = 'UploadError';
    readonly failure: AssetsProError | DOMException | undefined;
    constructor(
        message: string,
        public readonly uploadId: string,
        public readonly stage: 'transfer' | 'complete',
        failure: unknown,
    ) {
        super(message);
        this.failure =
            failure === undefined
                ? undefined
                : failure instanceof AssetsProError
                  ? failure
                  : failure instanceof DOMException &&
                      ['AbortError', 'TimeoutError'].includes(failure.name)
                    ? new DOMException(
                          failure.name === 'TimeoutError'
                              ? 'The operation timed out.'
                              : 'The operation was aborted.',
                          failure.name,
                      )
                    : new TransportError(
                          'The upload source or transfer could not be read.',
                      );
    }
}
export class StorageError extends AssetsProError {
    override name = 'StorageError';
    constructor(
        message: string,
        public readonly status: number,
    ) {
        super(message);
    }
}
export function sourceFromBlob(
    blob: Blob,
    name: string,
    mimeType = blob.type || 'application/octet-stream',
): UploadSource {
    const source = {
        name,
        size: blob.size,
        mimeType,
        open: () => blob.stream(),
    };
    nativeSources.set(source.open, blob);
    return source;
}
export async function sourceFromPath(
    path: string,
    mimeType: string,
    name = basename(path),
): Promise<UploadSource> {
    const details = await stat(path);
    if (!details.isFile())
        throw new TypeError('The upload source must be a regular file.');
    const source = {
        name,
        size: details.size,
        mimeType,
        open: () =>
            Readable.toWeb(
                createReadStream(path),
            ) as ReadableStream<Uint8Array>,
    };
    nativeSources.set(source.open, path);
    return source;
}

function openSource(
    source: UploadSource,
    signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        Promise.resolve()
            .then(() => {
                signal.throwIfAborted();
                return source.open();
            })
            .then(
                (stream) => {
                    signal.removeEventListener('abort', abort);
                    if (signal.aborted) {
                        if (stream && typeof stream.cancel === 'function')
                            void stream.cancel(signal.reason).catch(() => {});
                        reject(signal.reason);
                    } else resolve(stream);
                },
                (error) => {
                    signal.removeEventListener('abort', abort);
                    reject(error);
                },
            );
    });
}
export function validateSource(source: UploadSource): void {
    if (!Number.isSafeInteger(source.size) || source.size <= 0)
        throw new TypeError(
            'The source size must be a positive known byte count.',
        );
    if (!source.name || /[\\/\r\n\0]/.test(source.name))
        throw new TypeError(
            'The upload name must be a filename without a directory path.',
        );
    if (!source.mimeType || /[\r\n]/.test(source.mimeType))
        throw new TypeError('A valid MIME type is required.');
}

export async function putSource(
    http: Transport,
    authorization: UploadAuthorization,
    source: UploadSource,
    options: TransferOptions = {},
): Promise<void> {
    validateSource(source);
    if (authorization.method !== 'PUT')
        throw new ProtocolError('The upload authorization must use PUT.');
    const url = httpUrl(authorization.url);
    const headers = new Headers();
    for (const [key, value] of Object.entries(authorization.headers)) {
        if (
            /^(authorization|proxy-authorization|cookie|cookie2|host|origin|referer|connection|transfer-encoding|x-xsrf-token|x-csrf-token)$/i.test(
                key,
            )
        )
            throw new ProtocolError(
                'The upload authorization included a forbidden transport header.',
            );
        if (
            key.toLowerCase() === 'content-length' &&
            value !== String(source.size)
        )
            throw new ProtocolError(
                'The authorized Content-Length differs from the source size.',
            );
        headers.set(key, value);
    }
    headers.set('Content-Length', String(source.size));
    const scope = abortScope(options, http.timeoutMs);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let consumed = 0;
    let ended = false;
    let sourceFailure: unknown;
    const cancel = () => {
        void reader?.cancel(scope.signal.reason).catch(() => {});
    };
    try {
        scope.signal.throwIfAborted();
        const nativeSource = nativeSources.get(source.open);
        if (
            process.versions.bun &&
            http.storageFetch === defaultStorageFetch &&
            nativeSource
        ) {
            const body =
                typeof nativeSource === 'string'
                    ? bunFile(nativeSource)
                    : nativeSource;
            if (body.size !== source.size)
                throw new ProtocolError(
                    'The file size changed after the source was created.',
                );
            let response: Response;
            try {
                response = await http.storageFetch(url, {
                    method: 'PUT',
                    headers,
                    body,
                    redirect: 'manual',
                    credentials: 'omit',
                    signal: scope.signal,
                });
            } catch {
                scope.signal.throwIfAborted();
                throw new TransportError(
                    'The storage transfer failed; the uploaded byte count could not be confirmed.',
                );
            }
            await response.body?.cancel();
            if (!response.ok)
                throw new StorageError(
                    'The storage service rejected the upload.',
                    response.status,
                );
            options.onProgress?.(source.size, source.size);
            return;
        }
        reader = (await openSource(source, scope.signal)).getReader();
        scope.signal.throwIfAborted();
        scope.signal.addEventListener('abort', cancel, { once: true });
        const stream = new ReadableStream<Uint8Array>({
            async pull(controller) {
                try {
                    scope.signal.throwIfAborted();
                    const chunk = await reader!.read();
                    if (chunk.done) {
                        ended = true;
                        if (consumed !== source.size)
                            throw new ProtocolError(
                                'The upload stream ended before its declared size.',
                            );
                        controller.close();
                        return;
                    }
                    if (!(chunk.value instanceof Uint8Array))
                        throw new ProtocolError(
                            'Upload streams must yield Uint8Array chunks.',
                        );
                    consumed += chunk.value.byteLength;
                    if (consumed > source.size)
                        throw new ProtocolError(
                            'The upload stream exceeded its declared size.',
                        );
                    if (consumed === source.size) {
                        let final = await reader!.read();
                        while (!final.done && final.value.byteLength === 0)
                            final = await reader!.read();
                        if (!final.done)
                            throw new ProtocolError(
                                'The upload stream exceeded its declared size.',
                            );
                        ended = true;
                    }
                    options.onProgress?.(consumed, source.size);
                    controller.enqueue(chunk.value);
                    if (ended) controller.close();
                } catch (error) {
                    sourceFailure = error;
                    controller.error(error);
                    void reader?.cancel(error).catch(() => {});
                }
            },
            cancel(reason) {
                void reader?.cancel(reason).catch(() => {});
            },
        });
        const init: RequestInit & { duplex: 'half' } = {
            method: 'PUT',
            headers,
            body: stream,
            duplex: 'half',
            redirect: 'manual',
            credentials: 'omit',
            signal: scope.signal,
        };
        let response: Response;
        try {
            response = await http.storageFetch(url, init);
        } catch {
            scope.signal.throwIfAborted();
            if (sourceFailure instanceof ProtocolError) throw sourceFailure;
            throw new TransportError(
                'The storage transfer failed; the uploaded byte count could not be confirmed.',
            );
        }
        await response.body?.cancel();
        if (!response.ok)
            throw new StorageError(
                'The storage service rejected the upload.',
                response.status,
            );
        if (sourceFailure instanceof ProtocolError) throw sourceFailure;
        if (!ended || consumed !== source.size)
            throw new ProtocolError(
                'Storage responded before the complete upload stream was consumed.',
            );
    } finally {
        scope.signal.removeEventListener('abort', cancel);
        void reader?.cancel().catch(() => {});
        reader?.releaseLock();
        scope.dispose();
    }
}

export async function downloadStream(
    http: Transport,
    location: string,
    options: RequestOptions = {},
): Promise<ReadableStream<Uint8Array>> {
    httpUrl(location);
    const scope = abortScope(options, http.timeoutMs);
    let url = location;
    try {
        for (let redirects = 0; ; redirects++) {
            scope.signal.throwIfAborted();
            let response: Response;
            try {
                response = await http.storageFetch(url, {
                    method: 'GET',
                    redirect: 'manual',
                    credentials: 'omit',
                    signal: scope.signal,
                });
            } catch {
                scope.signal.throwIfAborted();
                throw new TransportError(
                    'The storage download request failed.',
                );
            }
            if ([301, 302, 303, 307, 308].includes(response.status)) {
                await response.body?.cancel();
                const next = response.headers.get('Location');
                if (!next || redirects >= 4)
                    throw new ProtocolError(
                        'Storage returned an invalid or excessive redirect chain.',
                    );
                url = resolveStorageLocation(next, url);
                continue;
            }
            if (!response.ok) {
                await response.body?.cancel();
                throw new StorageError(
                    'The storage service rejected the download.',
                    response.status,
                );
            }
            if (!response.body)
                throw new ProtocolError(
                    'The storage download did not contain a body.',
                );
            const reader = response.body.getReader();
            let disposed = false;
            const dispose = () => {
                if (!disposed) {
                    disposed = true;
                    scope.signal.removeEventListener('abort', abort);
                    scope.dispose();
                }
            };
            const abort = () => {
                void reader.cancel(scope.signal.reason).catch(() => {});
            };
            scope.signal.addEventListener('abort', abort, { once: true });
            return new ReadableStream<Uint8Array>({
                async pull(controller) {
                    try {
                        scope.signal.throwIfAborted();
                        const chunk = await reader.read();
                        scope.signal.throwIfAborted();
                        if (chunk.done) {
                            controller.close();
                            reader.releaseLock();
                            dispose();
                        } else controller.enqueue(chunk.value);
                    } catch {
                        const error = scope.signal.aborted
                            ? scope.signal.reason
                            : new TransportError(
                                  'The storage download was interrupted.',
                              );
                        controller.error(error);
                        void reader.cancel().catch(() => {});
                        reader.releaseLock();
                        dispose();
                    }
                },
                cancel(reason) {
                    void reader.cancel(reason).catch(() => {});
                    reader.releaseLock();
                    dispose();
                },
            });
        }
    } catch (error) {
        scope.dispose();
        throw error;
    }
}

/** A file destination is created exclusively; a failed transfer removes the partial file. */
export async function writeDownload(
    stream: ReadableStream<Uint8Array>,
    destination: string | WritableStream<Uint8Array>,
): Promise<void> {
    if (typeof destination !== 'string') {
        await stream.pipeTo(destination);
        return;
    }
    let file;
    try {
        file = await open(destination, 'wx');
    } catch (error) {
        await stream.cancel().catch(() => {});
        throw error;
    }
    const reader = stream.getReader();
    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            let offset = 0;
            while (offset < chunk.value.byteLength) {
                const { bytesWritten } = await file.write(
                    chunk.value,
                    offset,
                    chunk.value.byteLength - offset,
                );
                if (!bytesWritten)
                    throw new Error(
                        'The destination did not accept download bytes.',
                    );
                offset += bytesWritten;
            }
        }
        await file.close();
    } catch (error) {
        void reader.cancel().catch(() => {});
        await file.close().catch(() => {});
        await unlink(destination).catch(() => {});
        throw error;
    } finally {
        reader.releaseLock();
    }
}
