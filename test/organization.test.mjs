import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AssetsPro, sourceFromBlob } from '../dist/index.js';
const { fixtures } = JSON.parse(
    await readFile(
        new URL('../contracts/fixtures.json', import.meta.url),
        'utf8',
    ),
);

test('constructor organization powers scalar helpers and immutable scoped resource groups', async () => {
    const requested = [];
    const client = new AssetsPro({
        baseUrl: 'https://api.example.test',
        token: 'test',
        organizationId: 'default-org',
        fetch: async (url) => {
            requested.push(new URL(url).pathname);
            return Response.json(fixtures.asset_public);
        },
    });
    const original = client.forOrganization();
    const other = client.forOrganization('second-org');
    const third = other.forOrganization('third-org');
    assert.equal(
        await client.getPublicUrl('asset'),
        fixtures.asset_public.data.publication_urls.custom_url,
    );
    assert.equal(
        await client.getPublicUrl('asset', 'provider'),
        fixtures.asset_public.data.publication_urls.default_url,
    );
    assert.deepEqual(
        await client.getPublicUrls('asset'),
        fixtures.asset_public.data.publication_urls,
    );
    await Promise.all([
        original.assets.get('asset'),
        other.assets.get('asset'),
        third.getPublicUrl('asset', 'custom'),
    ]);
    assert.equal(client.organizationId, 'default-org');
    assert.equal(original.organizationId, 'default-org');
    assert.equal(other.organizationId, 'second-org');
    assert.equal(third.organizationId, 'third-org');
    assert.throws(() => {
        other.organizationId = 'changed';
    }, TypeError);
    assert.throws(() => {
        client.organizationId = 'changed';
    }, TypeError);
    assert.deepEqual(
        requested.map((path) => path.split('/')[4]),
        [
            'default-org',
            'default-org',
            'default-org',
            'default-org',
            'second-org',
            'third-org',
        ],
    );
    await client.getPublicUrl('explicit-org', 'asset', 'custom');
    assert.ok(requested.at(-1).includes('/explicit-org/'));
    await original.getPublicUrl('asset');
    assert.ok(requested.at(-1).includes('/default-org/'));
});

test('missing default organization fails before a request while explicit and scoped calls remain available', async () => {
    let requests = 0;
    const client = new AssetsPro({
        baseUrl: 'https://api.example.test',
        token: 'test',
        fetch: async () => {
            requests++;
            return Response.json(fixtures.asset_private);
        },
    });
    assert.throws(() => client.getPublicUrl('asset'), /organizationId/);
    assert.throws(() => client.getPublicUrls('asset'), /organizationId/);
    assert.throws(() => client.forOrganization(), /organizationId/);
    assert.throws(() => client.forOrganization(''), TypeError);
    assert.throws(() => client.waitForAsset('asset'), /organizationId/);
    assert.throws(
        () => client.upload(sourceFromBlob(new Blob(['abc']), 'file.txt')),
        /organizationId/,
    );
    assert.equal(requests, 0);
    assert.equal(
        await client.forOrganization('org').getPublicUrl('asset'),
        null,
    );
    assert.equal(await client.getPublicUrl('org', 'asset'), null);
    assert.equal(requests, 2);
});

test('default-org download helpers preserve revision filters, options and stream destinations', async () => {
    const requested = [];
    const client = new AssetsPro({
        baseUrl: 'https://api.example.test',
        token: 'test',
        organizationId: 'default-org',
        fetch: async (url) => {
            requested.push(new URL(url));
            return new Response(null, {
                status: 302,
                headers: {
                    Location:
                        'https://storage.example.test/signed?signature=temporary',
                },
            });
        },
        storageFetch: async () => new Response('asset bytes'),
    });
    assert.equal(
        await client.getDownloadUrl('asset', {
            revision: 'revision',
            inline: false,
        }),
        'https://storage.example.test/signed?signature=temporary',
    );
    assert.equal(requested[0].searchParams.get('revision'), 'revision');
    assert.equal(requested[0].searchParams.get('inline'), '0');
    assert.equal(
        await new Response(await client.download('asset')).text(),
        'asset bytes',
    );
    let output = '';
    await client.downloadTo(
        'asset',
        new WritableStream({
            write(chunk) {
                output += new TextDecoder().decode(chunk);
            },
        }),
        { variant: 'variant' },
    );
    assert.equal(output, 'asset bytes');
    assert.equal(requested.at(-1).searchParams.get('variant'), 'variant');
    assert.ok(
        requested.every((url) =>
            url.pathname.includes('/default-org/assets/asset/download'),
        ),
    );
    await assert.rejects(
        client.getDownloadUrl('asset', {}, { signal: AbortSignal.abort() }),
        (error) => error.name === 'AbortError',
    );
});

test('default-org upload and retry stay bound through initialization, transfer and completion', async () => {
    const paths = [];
    let retry = false;
    const client = new AssetsPro({
        baseUrl: 'https://api.example.test',
        token: 'test',
        organizationId: 'default-org',
        fetch: async (url, init) => {
            paths.push(new URL(url).pathname);
            if (retry)
                return Response.json(
                    init.method === 'GET'
                        ? fixtures.upload_processing_failed
                        : fixtures.upload_retry_processing,
                );
            if (new URL(url).pathname.endsWith('/complete'))
                return Response.json(fixtures.upload_completed);
            assert.equal(
                JSON.parse(init.body).name,
                'Default workspace upload',
            );
            return Response.json(fixtures.upload_initialized);
        },
        storageFetch: async (_, init) => {
            await new Response(init.body).text();
            return new Response(null);
        },
    });
    await client.upload(
        sourceFromBlob(new Blob(['abc']), 'photo.jpg', 'image/jpeg'),
        { name: 'Default workspace upload' },
    );
    retry = true;
    assert.equal(
        (await client.retryUpload('upload')).processing_status,
        'processing',
    );
    assert.equal(paths.length, 4);
    assert.ok(paths.every((path) => path.includes('/default-org/uploads')));
});

test('each default-org wait helper resolves the requested resource without mutating scope', async () => {
    const paths = [];
    const client = new AssetsPro({
        baseUrl: 'https://api.example.test',
        token: 'test',
        organizationId: 'default-org',
        fetch: async (url) => {
            const path = new URL(url).pathname;
            paths.push(path);
            if (path.includes('/uploads/'))
                return Response.json(fixtures.upload_ready);
            if (path.includes('/exports/'))
                return Response.json(fixtures.export_ready);
            if (path.includes('/trash-operations/'))
                return Response.json({
                    data: { id: 'operation', status: 'completed', failed: 0 },
                });
            return Response.json(fixtures.asset_public);
        },
    });
    const options = { intervalMs: 0, maxAttempts: 1 };
    await client.waitForUpload('upload', options);
    await client.waitForAsset('asset', options);
    await client.waitForPublication('asset', options);
    await client.waitForExport('export', options);
    await client.waitForTrashOperation('operation', options);
    assert.equal(paths.length, 5);
    assert.ok(paths.every((path) => path.includes('/default-org/')));
});
