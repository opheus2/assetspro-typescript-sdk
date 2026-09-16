import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Fetch } from './transport.js';

export function bunFile(path: string): Blob {
    return (
        globalThis as typeof globalThis & { Bun: { file(path: string): Blob } }
    ).Bun.file(path);
}

// Bun 1.3 drops Content-Length on stream bodies. File-backed PUTs preserve it with bounded memory.
export const defaultStorageFetch: Fetch = async (input, init) => {
    if (
        !process.versions.bun ||
        init?.method !== 'PUT' ||
        !(init.body instanceof ReadableStream)
    )
        return globalThis.fetch(input, init);
    init.signal?.throwIfAborted();
    const directory = await mkdtemp(join(tmpdir(), 'assets-pro-upload-'));
    const path = join(directory, 'body');
    const reader = init.body.getReader();
    const abort = () => {
        void reader.cancel(init.signal?.reason).catch(() => {});
    };
    let file;
    try {
        file = await open(path, 'wx', 0o600);
        init.signal?.addEventListener('abort', abort, { once: true });
        let size = 0;
        for (;;) {
            init.signal?.throwIfAborted();
            const chunk = await reader.read();
            init.signal?.throwIfAborted();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            let offset = 0;
            while (offset < chunk.value.byteLength) {
                init.signal?.throwIfAborted();
                const { bytesWritten } = await file.write(
                    chunk.value,
                    offset,
                    chunk.value.byteLength - offset,
                );
                if (!bytesWritten)
                    throw new Error(
                        'The temporary upload file could not be written.',
                    );
                offset += bytesWritten;
            }
        }
        if (String(size) !== new Headers(init.headers).get('Content-Length'))
            throw new Error(
                'The temporary upload size differs from Content-Length.',
            );
        await file.close();
        file = undefined;
        init.signal?.throwIfAborted();
        return await globalThis.fetch(input, { ...init, body: bunFile(path) });
    } finally {
        init.signal?.removeEventListener('abort', abort);
        void reader.cancel().catch(() => {});
        reader.releaseLock();
        await file?.close().catch(() => {});
        await rm(directory, { recursive: true, force: true });
    }
};
