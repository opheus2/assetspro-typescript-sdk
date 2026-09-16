import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import {
    mkdtemp,
    readFile,
    readdir,
    rm,
    stat,
    writeFile,
} from 'node:fs/promises';
import { inspect } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    AssetsPro,
    sourceFromBlob,
    sourceFromPath,
    UploadError,
    ProtocolError,
    StorageError,
} from '../dist/index.js';

const config = (fetch, storageFetch) => ({
    baseUrl: 'https://api.example.test',
    token: 'test-bearer',
    readRetries: 0,
    fetch,
    storageFetch,
});
const record = {
    id: 'upload',
    status: 'uploading',
    original_filename: 'test.bin',
    file_size: 3,
    mime_type: 'application/octet-stream',
    asset_revision_id: null,
};
const authorization = {
    url: 'https://storage.example.test/file?signature=private',
    method: 'PUT',
    headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'private, no-store',
    },
};
const source = () => sourceFromBlob(new Blob(['abc']), 'test.bin');

test('real Node/Bun fetch streams a known-size PUT and download without forwarding bearer/session credentials', async (t) => {
    const bytes = new Uint8Array(256 * 1024).map((_, index) => index % 251);
    let storagePutBytes = 0,
        initBody,
        completes = 0,
        gets = 0;
    let storageUrl, serverFailure;
    let inspectTemporary = false,
        temporaryMode,
        rejectUploads = false;
    const existingTemporary = new Set(
        (await readdir(tmpdir())).filter((name) =>
            name.startsWith('assets-pro-upload-'),
        ),
    );
    const storage = createServer(async (request, response) => {
        try {
            assert.equal(request.headers.authorization, undefined);
            assert.equal(request.headers.cookie, undefined);
            if (request.method === 'PUT') {
                if (rejectUploads) {
                    response.writeHead(403);
                    response.end('Provider diagnostics must not be exposed.');
                    return;
                }
                if (inspectTemporary && process.versions.bun) {
                    const directories = (await readdir(tmpdir())).filter(
                        (name) =>
                            name.startsWith('assets-pro-upload-') &&
                            !existingTemporary.has(name),
                    );
                    assert.equal(directories.length, 1);
                    temporaryMode =
                        (await stat(join(tmpdir(), directories[0], 'body')))
                            .mode & 0o777;
                }
                assert.equal(
                    request.headers['content-length'],
                    String(bytes.length),
                );
                assert.equal(
                    request.headers['content-type'],
                    'application/octet-stream',
                );
                assert.equal(
                    request.headers['cache-control'],
                    'private, no-store',
                );
                for await (const chunk of request)
                    storagePutBytes += chunk.length;
                response.writeHead(200);
                response.end();
            } else {
                response.writeHead(200, {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': String(bytes.length),
                });
                for (let offset = 0; offset < bytes.length; offset += 8192)
                    if (!response.write(bytes.slice(offset, offset + 8192)))
                        await once(response, 'drain');
                response.end();
            }
        } catch (error) {
            serverFailure = error;
            response.writeHead(500);
            response.end(String(error));
        }
    });
    await new Promise((resolve) => storage.listen(0, '127.0.0.1', resolve));
    storageUrl = `http://127.0.0.1:${storage.address().port}`;
    const api = createServer(async (request, response) => {
        assert.equal(request.headers.authorization, 'Bearer isolated-token');
        assert.equal(request.headers.cookie, undefined);
        if (request.url.endsWith('/download')) {
            response.writeHead(302, {
                Location: `${storageUrl}/download?signature=only-storage`,
            });
            response.end();
            return;
        }
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        if (request.url.endsWith('/complete')) {
            completes++;
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(
                JSON.stringify({
                    data: {
                        ...record,
                        status: 'completed',
                        processing_status: 'processing',
                    },
                }),
            );
            return;
        }
        if (request.method === 'GET') gets++;
        initBody = JSON.parse(Buffer.concat(chunks).toString());
        response.writeHead(201, { 'Content-Type': 'application/json' });
        response.end(
            JSON.stringify({
                data: { ...record, file_size: bytes.length },
                authorization: {
                    ...authorization,
                    url: `${storageUrl}/upload?signature=only-storage`,
                },
            }),
        );
    });
    await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        api.closeAllConnections();
        storage.closeAllConnections();
        api.close();
        storage.close();
    });
    const folder = await mkdtemp(join(tmpdir(), 'assets-pro-sdk-stream-'));
    t.after(() => rm(folder, { recursive: true, force: true }));
    const inputPath = join(folder, 'input.bin');
    await writeFile(inputPath, bytes);
    const client = new AssetsPro({
        baseUrl: `http://127.0.0.1:${api.address().port}`,
        token: 'isolated-token',
        readRetries: 0,
    });
    const progress = [];
    const result = await client
        .upload(
            'org',
            await sourceFromPath(inputPath, 'application/octet-stream'),
            {
                publish_after_processing: false,
                brand_id: null,
                category_ids: ['category'],
            },
            { onProgress: (value) => progress.push(value) },
        )
        .catch((error) => {
            throw serverFailure ?? error;
        });
    assert.equal(result.status, 'completed');
    assert.equal(result.processing_status, 'processing');
    assert.equal(storagePutBytes, bytes.length);
    assert.equal(completes, 1);
    assert.equal(gets, 0);
    assert.equal(initBody.original_filename, 'input.bin');
    assert.equal(initBody.file_size, bytes.length);
    assert.deepEqual(initBody.category_ids, ['category']);
    assert.equal(initBody.brand_id, null);
    assert.equal(initBody.publish_after_processing, false);
    assert.equal(progress.at(-1), bytes.length);
    const genericSource = () => ({
        name: 'generic.bin',
        size: bytes.length,
        mimeType: 'application/octet-stream',
        open: () =>
            new ReadableStream({
                start(controller) {
                    controller.enqueue(bytes.slice(0, bytes.length / 2));
                    controller.enqueue(bytes.slice(bytes.length / 2));
                    controller.close();
                },
            }),
    });
    inspectTemporary = true;
    await client.upload('org', genericSource());
    if (process.versions.bun) assert.equal(temporaryMode, 0o600);
    const temporaryDirectories = async () =>
        new Set(
            (await readdir(tmpdir())).filter((name) =>
                name.startsWith('assets-pro-upload-'),
            ),
        );
    assert.deepEqual(await temporaryDirectories(), existingTemporary);
    inspectTemporary = false;
    const abortController = new AbortController();
    await assert.rejects(
        client.upload(
            'org',
            genericSource(),
            {},
            {
                signal: abortController.signal,
                onProgress: () => abortController.abort(),
            },
        ),
        (error) => error.name === 'AbortError',
    );
    assert.deepEqual(await temporaryDirectories(), existingTemporary);
    rejectUploads = true;
    await assert.rejects(
        client.upload('org', genericSource()),
        (error) =>
            error instanceof UploadError &&
            error.failure instanceof StorageError &&
            error.failure.status === 403,
    );
    assert.deepEqual(await temporaryDirectories(), existingTemporary);
    rejectUploads = false;
    const output = join(folder, 'output.bin');
    await client.downloadTo('org', 'asset', output);
    assert.deepEqual(new Uint8Array(await readFile(output)), bytes);
    await assert.rejects(
        client.downloadTo('org', 'asset', output),
        (error) => error.code === 'EEXIST',
    );
    assert.deepEqual(new Uint8Array(await readFile(output)), bytes);
});

test('upload defaults to private and does not poll, while unknown sizes fail before initialization', async () => {
    const calls = [];
    const client = new AssetsPro(
        config(
            async (url, init) => {
                calls.push(new URL(url).pathname);
                if (!String(url).endsWith('/complete')) {
                    assert.ok(
                        !('publish_after_processing' in JSON.parse(init.body)),
                    );
                    return Response.json({ data: record, authorization });
                }
                return Response.json({
                    data: {
                        ...record,
                        status: 'completed',
                        processing_status: 'processing',
                    },
                });
            },
            async (_, init) => {
                assert.equal(await new Response(init.body).text(), 'abc');
                return new Response(null);
            },
        ),
    );
    await client.upload('org', source());
    assert.equal(calls.length, 2);
    await assert.rejects(
        client.upload('org', { ...source(), size: NaN }),
        TypeError,
    );
    assert.equal(calls.length, 2);
});

test('short/long streams never complete an upload and carry a safe transfer-stage error with upload ID', async () => {
    for (const size of [2, 4]) {
        let completes = 0;
        const client = new AssetsPro(
            config(
                async (url) => {
                    if (String(url).endsWith('/complete')) completes++;
                    return Response.json({ data: record, authorization });
                },
                async (_, init) => {
                    await new Response(init.body).arrayBuffer();
                    return new Response(null);
                },
            ),
        );
        await assert.rejects(
            client.upload('org', { ...source(), size }),
            (error) =>
                error instanceof UploadError &&
                error.uploadId === 'upload' &&
                error.stage === 'transfer' &&
                error.failure instanceof ProtocolError,
        );
        assert.equal(completes, 0);
    }
});

test('PUT is never automatically replayed, redirects are rejected and completion failures retain stage', async () => {
    let puts = 0,
        completes = 0;
    const client = new AssetsPro({
        ...config(
            async (url) => {
                if (String(url).endsWith('/complete')) {
                    completes++;
                    return Response.json(
                        { message: 'Unknown outcome' },
                        { status: 503 },
                    );
                }
                return Response.json({ data: record, authorization });
            },
            async (_, init) => {
                puts++;
                await new Response(init.body).text();
                return new Response(null);
            },
        ),
        readRetries: 3,
    });
    await assert.rejects(
        client.upload('org', source()),
        (error) => error instanceof UploadError && error.stage === 'complete',
    );
    assert.equal(puts, 1);
    assert.equal(completes, 1);
    const redirect = new AssetsPro(
        config(
            async () => Response.json({ data: record, authorization }),
            async () =>
                new Response(null, {
                    status: 307,
                    headers: { Location: 'https://elsewhere.test' },
                }),
        ),
    );
    await assert.rejects(
        redirect.upload('org', source()),
        (error) =>
            error instanceof UploadError &&
            error.failure instanceof StorageError &&
            error.failure.status === 307,
    );
});

test('processing-only retry never needs or uploads a source and transfer retry validates the source first', async () => {
    const methods = [];
    const client = new AssetsPro(
        config(
            async (_, init) => {
                methods.push(init.method);
                return Response.json({
                    data: {
                        ...record,
                        status: 'completed',
                        processing_status:
                            init.method === 'GET' ? 'failed' : 'processing',
                        asset_revision_id: 'revision',
                    },
                });
            },
            async () => {
                throw new Error('Unexpected file upload');
            },
        ),
    );
    assert.equal(
        (await client.retryUpload('org', 'upload')).processing_status,
        'processing',
    );
    assert.deepEqual(methods, ['GET', 'POST']);
    let retries = 0;
    const incomplete = new AssetsPro(
        config(
            async (_, init) => {
                if (init.method === 'POST') retries++;
                return Response.json({ data: record });
            },
            async () => {
                throw new Error('Unexpected');
            },
        ),
    );
    await assert.rejects(incomplete.retryUpload('org', 'upload'), UploadError);
    await assert.rejects(
        incomplete.retryUpload('org', 'upload', { ...source(), size: 9 }),
        TypeError,
    );
    assert.equal(retries, 0);
});

test('storage headers cannot smuggle authorization and errors never retain signed URL bodies', async () => {
    let contactedStorage = false;
    const client = new AssetsPro(
        config(
            async () =>
                Response.json({
                    data: record,
                    authorization: {
                        ...authorization,
                        headers: { Authorization: 'Bearer forbidden' },
                    },
                }),
            async () => {
                contactedStorage = true;
                return new Response(null);
            },
        ),
    );
    await assert.rejects(
        client.upload('org', source()),
        (error) =>
            error instanceof UploadError &&
            error.failure instanceof ProtocolError,
    );
    assert.equal(contactedStorage, false);
    const denied = new AssetsPro(
        config(
            async () =>
                new Response(null, {
                    status: 302,
                    headers: { Location: authorization.url },
                }),
            async () => new Response('secret provider debug', { status: 403 }),
        ),
    );
    await assert.rejects(
        denied.download('org', 'asset'),
        (error) =>
            error instanceof StorageError &&
            error.status === 403 &&
            !JSON.stringify(error).includes('signature'),
    );
});

test('download remains abortable after response headers and removes a partial file', async (t) => {
    let cancelled = false;
    const controller = new AbortController();
    const client = new AssetsPro(
        config(
            async () =>
                new Response(null, {
                    status: 302,
                    headers: { Location: authorization.url },
                }),
            async () =>
                new Response(
                    new ReadableStream({
                        start(stream) {
                            stream.enqueue(
                                new TextEncoder().encode('first chunk'),
                            );
                        },
                        cancel() {
                            cancelled = true;
                        },
                    }),
                ),
        ),
    );
    const directory = await mkdtemp(join(tmpdir(), 'assets-pro-sdk-abort-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, 'partial.bin');
    const pending = client.downloadTo(
        'org',
        'asset',
        path,
        {},
        { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 20);
    await assert.rejects(pending, (error) => error.name === 'AbortError');
    assert.equal(cancelled, true);
    await assert.rejects(readFile(path), (error) => error.code === 'ENOENT');
});

test('an asynchronous source opener honors timeout and cancels a stream that resolves afterward', async () => {
    let resolveOpen,
        cancelled = false;
    const client = new AssetsPro(
        config(
            async () => Response.json({ data: record, authorization }),
            async () => {
                throw new Error('No transfer should start');
            },
        ),
    );
    const pending = client.upload(
        'org',
        {
            ...source(),
            open: () =>
                new Promise((resolve) => {
                    resolveOpen = resolve;
                }),
        },
        {},
        { timeoutMs: 5 },
    );
    await assert.rejects(
        pending,
        (error) =>
            error instanceof UploadError &&
            error.failure?.name === 'TimeoutError',
    );
    resolveOpen(
        new ReadableStream({
            cancel() {
                cancelled = true;
            },
        }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(cancelled, true);
});

test('source DOMExceptions and initialization callbacks cannot expose signed URLs in upload errors', async () => {
    const client = new AssetsPro(
        config(
            async () => Response.json({ data: record, authorization }),
            async () => {
                throw new Error('No transfer should start');
            },
        ),
    );
    await assert.rejects(
        client.upload('org', {
            ...source(),
            open: () => {
                throw new DOMException(
                    'https://storage.test/object?signature=sensitive',
                    'DataError',
                );
            },
        }),
        (error) =>
            error instanceof UploadError &&
            !inspect(error).includes('sensitive'),
    );
    await assert.rejects(
        client.upload(
            'org',
            source(),
            {},
            {
                onInitialized() {
                    throw new Error(
                        'https://storage.test/object?signature=sensitive',
                    );
                },
            },
        ),
        (error) =>
            error instanceof UploadError &&
            error.uploadId === 'upload' &&
            !inspect(error).includes('sensitive'),
    );
});

test('early storage rejection is not blocked by an uncooperative source cancellation promise', async () => {
    let cancelled = false;
    const client = new AssetsPro(
        config(
            async () => Response.json({ data: record, authorization }),
            async () => new Response(null, { status: 403 }),
        ),
    );
    const pending = client.upload(
        'org',
        {
            name: 'test.bin',
            size: 3,
            mimeType: 'application/octet-stream',
            open: () =>
                new ReadableStream({
                    start(controller) {
                        controller.enqueue(new Uint8Array([1]));
                    },
                    cancel() {
                        cancelled = true;
                        return new Promise(() => {});
                    },
                }),
        },
        {},
        { timeoutMs: 20 },
    );
    await assert.rejects(
        pending,
        (error) =>
            error instanceof UploadError &&
            error.failure instanceof StorageError &&
            error.failure.status === 403,
    );
    assert.equal(cancelled, true);
});
