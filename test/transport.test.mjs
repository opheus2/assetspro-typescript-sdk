import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import {
    AssetsPro,
    ApiError,
    ProtocolError,
    TransportError,
} from '../dist/index.js';
import { retryAfterMilliseconds, queryString } from '../dist/transport.js';

const json = (body, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
    });
const config = (fetch) => ({
    baseUrl: 'https://api.example.test',
    token: 'super-private-bearer',
    fetch,
    readRetries: 0,
});

test('query and JSON encoding distinguish false, zero, missing fields, null and empty arrays', async () => {
    assert.equal(
        queryString({
            q: 'a+b &/?',
            archived: false,
            min_width: 0,
            category_ids: ['a/b', 'c+d'],
            unused: undefined,
            absent: null,
        }),
        'q=a%2Bb+%26%2F%3F&archived=0&min_width=0&category_ids%5B%5D=a%2Fb&category_ids%5B%5D=c%2Bd',
    );
    const client = new AssetsPro(
        config(async (_, init) => {
            assert.deepEqual(JSON.parse(init.body), {
                brand_id: null,
                category_ids: [],
                description: null,
            });
            return json({ data: {} });
        }),
    );
    await client.assets.update('org', 'asset', {
        brand_id: null,
        category_ids: [],
        description: null,
        name: undefined,
    });
    assert.throws(() => queryString({ q: { invalid: true } }), TypeError);
});

test('dot-segment resource IDs cannot change the target API route', async () => {
    let called = false;
    const client = new AssetsPro(
        config(async () => {
            called = true;
            return json({});
        }),
    );
    for (const id of ['.', '..'])
        assert.throws(() => client.assets.get('org', id), TypeError);
    assert.equal(called, false);
});

test('safe reads retry bounded transient responses and obey Retry-After without retrying writes', async () => {
    let calls = 0;
    const client = new AssetsPro({
        ...config(async () =>
            ++calls < 3
                ? json({ message: 'Try later' }, 429, { 'Retry-After': '0' })
                : json({ data: [] }),
        ),
        readRetries: 2,
    });
    await client.organizations.list();
    assert.equal(calls, 3);
    calls = 0;
    const writeClient = new AssetsPro({
        ...config(async () => {
            calls++;
            return json({ message: 'Unavailable' }, 503);
        }),
        readRetries: 3,
    });
    await assert.rejects(
        writeClient.tags.create('org', { name: 'A' }),
        ApiError,
    );
    assert.equal(calls, 1);
    calls = 0;
    const bounded = new AssetsPro({
        ...config(async () => {
            calls++;
            return json({ message: 'Wait' }, 429, { 'Retry-After': '3600' });
        }),
        readRetries: 3,
        maxRetryDelayMs: 1000,
    });
    await assert.rejects(
        bounded.organizations.list(),
        (error) => error.retryAfterMs === 3_600_000,
    );
    assert.equal(calls, 1);
    assert.equal(retryAfterMilliseconds('2', 0), 2000);
    assert.equal(
        retryAfterMilliseconds('Thu, 01 Jan 1970 00:00:05 GMT', 1000),
        4000,
    );
    assert.equal(retryAfterMilliseconds('invalid'), undefined);
});

test('network retries are bounded and never expose raw transport exception credentials', async () => {
    let calls = 0;
    const client = new AssetsPro({
        ...config(async () => {
            calls++;
            throw new Error('https://host.test?secret=super-private-bearer');
        }),
        readRetries: 1,
        maxRetryDelayMs: 0,
    });
    await assert.rejects(
        client.getPublicUrl('org', 'asset'),
        (error) =>
            error instanceof TransportError &&
            !inspect(error).includes('super-private-bearer'),
    );
    assert.equal(calls, 2);
});

test('API errors preserve status, fields and code while redacting bearer, credentials, passwords and signed URLs', async () => {
    const client = new AssetsPro(
        config(async () =>
            json(
                {
                    message:
                        'Rejected super-private-bearer storage-key storage-secret https://storage.test/file?X-Amz-Signature=unsafe',
                    code: 'invalid_storage',
                    credentials: {
                        key: 'storage-key',
                        secret: 'storage-secret',
                    },
                    errors: {
                        'credentials.secret': ['Rejected storage-secret'],
                        endpoint: ['https://storage.test?secret=unsafe'],
                    },
                },
                422,
            ),
        ),
    );
    await assert.rejects(
        client.storageConnections.rotate('org', 'connection', {
            credentials: { key: 'storage-key', secret: 'storage-secret' },
        }),
        (error) => {
            assert.ok(error instanceof ApiError);
            assert.equal(error.code, 'invalid_storage');
            assert.equal(error.status, 422);
            const printed = inspect(error);
            for (const secret of [
                'super-private-bearer',
                'storage-key',
                'storage-secret',
                'unsafe',
                'https://storage.test',
            ])
                assert.ok(!printed.includes(secret), printed);
            assert.equal(error.payload.credentials, '[redacted]');
            assert.deepEqual(error.errors['credentials.secret'], [
                'Rejected [redacted]',
            ]);
            return true;
        },
    );
    assert.ok(!inspect(client).includes('super-private-bearer'));
});

test('redirects are explicit: API JSON never follows and download URL helpers do not contact storage', async () => {
    let storageReads = 0;
    const client = new AssetsPro({
        ...config(async (_, init) => {
            assert.equal(init.redirect, 'manual');
            return new Response(null, {
                status: 302,
                headers: {
                    Location: 'https://storage.test/object?signature=abc',
                },
            });
        }),
        storageFetch: async () => {
            storageReads++;
            throw new Error('must not run');
        },
    });
    assert.equal(
        await client.getDownloadUrl('org', 'asset'),
        'https://storage.test/object?signature=abc',
    );
    await assert.rejects(
        client.assets.get('org', 'asset'),
        (error) => error instanceof ApiError && error.status === 302,
    );
    assert.equal(storageReads, 0);
    const unsafe = new AssetsPro(
        config(
            async () =>
                new Response(null, {
                    status: 302,
                    headers: { Location: 'file:///etc/passwd' },
                }),
        ),
    );
    await assert.rejects(unsafe.getDownloadUrl('org', 'asset'), ProtocolError);
});

test('download resolution preserves the exact signed Location and sanitizes malformed redirects', async () => {
    const location =
        'https://STORAGE.Example.test:443/%2ffile?signature=a%2fb+%2B&z=second&x=1';
    const client = new AssetsPro(
        config(
            async () =>
                new Response(null, {
                    status: 302,
                    headers: { Location: location },
                }),
        ),
    );
    assert.equal(await client.getDownloadUrl('org', 'asset'), location);
    const malformed = new AssetsPro(
        config(
            async () =>
                new Response(null, {
                    status: 302,
                    headers: { Location: 'https://%?signature=do-not-print' },
                }),
        ),
    );
    await assert.rejects(
        malformed.getDownloadUrl('org', 'asset'),
        (error) =>
            error instanceof ProtocolError &&
            !inspect(error).includes('do-not-print'),
    );
    const storageRedirect = new AssetsPro({
        ...config(
            async () =>
                new Response(null, {
                    status: 302,
                    headers: { Location: location },
                }),
        ),
        storageFetch: async () =>
            new Response(null, {
                status: 302,
                headers: { Location: 'https://%?signature=do-not-print' },
            }),
    });
    await assert.rejects(
        storageRedirect.download('org', 'asset'),
        (error) =>
            error instanceof ProtocolError &&
            !inspect(error).includes('do-not-print'),
    );
});

test('AbortSignal cancels an in-flight request and a retry wait', async () => {
    const controller = new AbortController();
    const client = new AssetsPro(
        config(
            async (_, init) =>
                new Promise((_, reject) => {
                    init.signal.addEventListener(
                        'abort',
                        () => reject(init.signal.reason),
                        { once: true },
                    );
                }),
        ),
    );
    const pending = client.assets.get('org', 'asset', {
        signal: controller.signal,
    });
    controller.abort();
    await assert.rejects(pending, (error) => error.name === 'AbortError');
    const delayedController = new AbortController();
    let calls = 0;
    const delayed = new AssetsPro({
        ...config(async () => {
            calls++;
            return json({}, 429, { 'Retry-After': '10' });
        }),
        readRetries: 2,
    });
    const waiting = delayed.assets.get('org', 'asset', {
        signal: delayedController.signal,
    });
    setTimeout(() => delayedController.abort(), 5);
    await assert.rejects(waiting, (error) => error.name === 'AbortError');
    assert.equal(calls, 1);
});

test('timeouts and malformed/oversized JSON produce bounded safe errors', async () => {
    const stalled = new AssetsPro(
        config(
            async (_, init) =>
                new Promise((_, reject) => {
                    init.signal.addEventListener(
                        'abort',
                        () => reject(init.signal.reason),
                        { once: true },
                    );
                }),
        ),
    );
    const keepAlive = setTimeout(() => {}, 1000);
    try {
        await assert.rejects(
            stalled.assets.get('org', 'asset', { timeoutMs: 5 }),
            (error) => error.name === 'TimeoutError',
        );
    } finally {
        clearTimeout(keepAlive);
    }
    for (const response of [
        new Response('<html>exception https://private.test?secret=yes</html>', {
            status: 500,
        }),
        new Response('{broken', {
            headers: { 'Content-Type': 'application/json' },
        }),
        new Response('x'.repeat(16 * 1024 * 1024 + 1), {
            headers: { 'Content-Type': 'application/json' },
        }),
    ]) {
        const client = new AssetsPro(config(async () => response));
        await assert.rejects(
            client.assets.get('org', 'asset'),
            (error) =>
                (error instanceof ApiError || error instanceof ProtocolError) &&
                !error.message.includes('private.test'),
        );
    }
});
