import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    AssetsPro,
    ApiError,
    ProtocolError,
    getPublicUrl,
    getPublicUrls,
} from '../dist/index.js';

const { operations } = JSON.parse(
    await readFile(
        new URL('../contracts/operations.json', import.meta.url),
        'utf8',
    ),
);
const { fixtures } = JSON.parse(
    await readFile(
        new URL('../contracts/fixtures.json', import.meta.url),
        'utf8',
    ),
);
const json = (body, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
    });
const options = (fetch) => ({
    baseUrl: 'https://api.example.test',
    token: 'fixture-bearer',
    fetch,
    readRetries: 0,
});
const ids = {
    organization: '01J00000000000000000000001',
    asset: 'asset /?&',
    record: 'record /?&',
    collection: 'collection /?&',
    upload: 'upload /?&',
    connection: 'connection /?&',
    export: 'export /?&',
    member: 42,
    invitation: 'invitation /?&',
    token: 'token /?&',
    shareLink: 'share /?&',
    operation: 'operation /?&',
};
const aliases = {
    index: 'list',
    store: 'create',
    show: 'get',
    destroy: 'delete',
    download: 'getDownloadUrl',
};
const taxonomies = [
    'brands',
    'brand-roles',
    'categories',
    'tags',
    'collections',
];
const camel = (value) =>
    value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

assert.equal(operations.length, 81);
for (const operation of operations)
    test(`typed resource request: ${operation.id}`, async () => {
        const [group, action] = operation.id.split('.');
        let resource = camel(group),
            method = aliases[action] ?? action;
        if (taxonomies.includes(group) && action === 'destroy')
            method = 'archive';
        if (group === 'publications' || group === 'share-links') {
            if (action === 'destroy') method = 'revoke';
        }
        if (group === 'uploads' && action === 'destroy') method = 'cancel';
        if (group === 'storage-files' && action === 'show') method = 'metadata';
        if (group === 'downloads') {
            resource = 'assets';
            method = action === 'show' ? 'getDownloadUrl' : 'svg';
        }
        const query = {};
        for (const parameter of operation.query_parameters) {
            const name = parameter.name.replace(/\[\]$/, '');
            let value = parameter.example;
            if (parameter.name.endsWith('[]')) value = [value, 'second /?&'];
            if (['archived', 'trash', 'inline'].includes(name)) value = false;
            query[name] = value;
        }
        if (group === 'share-links' && action === 'index')
            delete query.collection_id;
        const redirect =
            (group === 'downloads' && action === 'show') ||
            action === 'download';
        const text = group === 'downloads' && action === 'svg';
        const client = new AssetsPro(
            options(async (url, init) => {
                assert.equal(init.method, operation.method);
                assert.equal(
                    new URL(url).pathname,
                    operation.path.replace(/\{([^}]+)\}/g, (_, parameter) =>
                        encodeURIComponent(String(ids[parameter])),
                    ),
                );
                assert.equal(
                    new Headers(init.headers).get('Authorization'),
                    'Bearer fixture-bearer',
                );
                assert.equal(
                    new Headers(init.headers).get('Accept'),
                    'application/json',
                );
                assert.equal(init.redirect, 'manual');
                assert.equal(init.credentials, 'omit');
                for (const [key, value] of Object.entries(query)) {
                    if (Array.isArray(value))
                        assert.deepEqual(
                            new URL(url).searchParams.getAll(`${key}[]`),
                            value.map(String),
                        );
                    else
                        assert.equal(
                            new URL(url).searchParams.get(key),
                            typeof value === 'boolean' ? '0' : String(value),
                        );
                }
                if (operation.request_body)
                    assert.deepEqual(
                        JSON.parse(init.body),
                        operation.request_body,
                    );
                if (redirect)
                    return new Response(null, {
                        status: 302,
                        headers: {
                            Location:
                                'https://storage.example.test/object?signature=temporary',
                        },
                    });
                if (text)
                    return new Response('<svg></svg>', {
                        headers: { 'Content-Type': 'text/plain' },
                    });
                if (
                    operation.method === 'DELETE' &&
                    [
                        'brands',
                        'brand-roles',
                        'categories',
                        'tags',
                        'collections',
                        'members',
                        'invitations',
                        'tokens',
                    ].includes(group)
                )
                    return new Response(null, { status: 204 });
                return json({ data: { accepted: true } });
            }),
        );
        assert.equal(
            typeof client[resource]?.[method],
            'function',
            `${resource}.${method}`,
        );
        const args = operation.path_parameters.map((name) => ids[name]);
        if (Object.keys(query).length) args.push(query);
        if (operation.request_body) args.push(operation.request_body);
        const result = await client[resource][method](...args);
        const scopedArguments = [...args];
        if (operation.path_parameters[0] === 'organization')
            scopedArguments.shift();
        const scopedResult = await client
            .forOrganization(ids.organization)
            [resource][method](...scopedArguments);
        assert.deepEqual(scopedResult, result);
        if (redirect)
            assert.equal(
                result,
                'https://storage.example.test/object?signature=temporary',
            );
        if (text) assert.equal(result, '<svg></svg>');
    });

test('shared resource fixtures preserve sparse relations, HEIC, decimals, metadata and publication selection', async () => {
    for (const name of [
        'asset_public',
        'asset_private',
        'asset_provider_only',
        'asset_custom_only',
        'asset_heic',
        'asset_svg',
        'asset_archived',
        'asset_processing',
        'asset_pending_replacement',
        'asset_sparse',
    ]) {
        const client = new AssetsPro(options(async () => json(fixtures[name])));
        assert.deepEqual(
            await client.assets.get(ids.organization, 'asset'),
            fixtures[name],
        );
        const urls = fixtures[name].data.publication_urls;
        assert.deepEqual(
            await client.getPublicUrls(ids.organization, 'asset'),
            urls,
        );
        assert.deepEqual(getPublicUrls(fixtures[name].data), urls);
        assert.equal(
            await client.getPublicUrl(ids.organization, 'asset'),
            urls.custom_url ?? urls.default_url,
        );
        assert.equal(
            getPublicUrl(fixtures[name].data, 'custom'),
            urls.custom_url,
        );
        assert.equal(
            await client.getPublicUrl(ids.organization, 'asset', 'provider'),
            urls.default_url,
        );
    }
});

test('extra envelope fields are retained for uploads, tokens, collection resolution and storage retirement', async () => {
    const cases = [
        [
            'upload_initialized',
            (client) =>
                client.uploads.create(ids.organization, {
                    original_filename: 'photo.jpg',
                    file_size: 23456,
                    mime_type: 'image/jpeg',
                }),
        ],
        [
            'upload_retry_processing',
            (client) => client.uploads.retry(ids.organization, 'upload'),
        ],
        [
            'upload_retry_transfer',
            (client) => client.uploads.retry(ids.organization, 'upload'),
        ],
        [
            'upload_status_partial',
            (client) =>
                client.uploads.status(ids.organization, { ids: ['upload'] }),
        ],
        ['members_page', (client) => client.members.list(ids.organization)],
        [
            'collection_resolved',
            (client) =>
                client.collections.resolve(ids.organization, {
                    name: 'Example',
                }),
        ],
        [
            'storage_retired',
            (client) =>
                client.storageConnections.retire(
                    ids.organization,
                    'connection',
                ),
        ],
    ];
    for (const [name, call] of cases)
        assert.deepEqual(
            await call(
                new AssetsPro(options(async () => json(fixtures[name]))),
            ),
            fixtures[name],
        );
    const token = {
        data: { id: 'token', abilities: ['assets.view'] },
        token: 'returned-once',
    };
    assert.deepEqual(
        await new AssetsPro(options(async () => json(token))).tokens.create(
            ids.organization,
            { name: 'Example', abilities: ['assets.view'] },
        ),
        token,
    );
});

test('public URL helpers never convert authorization, missing-resource or validation failures into null', async () => {
    for (const [name, status] of [
        ['error_unauthenticated', 401],
        ['error_forbidden', 403],
        ['error_not_found', 404],
        ['error_validation', 422],
        ['error_conflict', 409],
        ['error_nested_code', 503],
    ]) {
        const client = new AssetsPro(
            options(async () => json(fixtures[name], status)),
        );
        await assert.rejects(
            client.getPublicUrl(ids.organization, 'asset'),
            (error) => {
                assert.ok(error instanceof ApiError);
                assert.equal(error.status, status);
                if (name === 'error_nested_code')
                    assert.equal(error.code, 'storage_unavailable');
                return true;
            },
        );
    }
});

test('all three HTTP pagination envelopes and storage opaque cursors are followed without losing results', async () => {
    for (const [first, last, resource] of [
        ['resource_cursor_page', 'resource_cursor_last_page', 'assets'],
        ['flat_cursor_page', 'flat_cursor_last_page', 'organizations'],
        ['offset_page', 'offset_last_page', 'storageConnections'],
    ]) {
        let reads = 0;
        const client = new AssetsPro(
            options(async () => json(fixtures[reads++ ? last : first])),
        );
        const values = [];
        const iterator =
            resource === 'organizations'
                ? client.organizations.iterate()
                : client[resource].iterate(ids.organization);
        for await (const value of iterator) values.push(value);
        assert.deepEqual(values, [
            ...fixtures[first].data,
            ...fixtures[last].data,
        ]);
        assert.equal(reads, 2);
    }
    let reads = 0;
    const client = new AssetsPro(
        options(async (url) => {
            assert.equal(
                new URL(url).searchParams.get('prefix'),
                'folder /nested/',
            );
            assert.equal(
                new URL(url).searchParams.get('cursor'),
                reads ? 'opaque+cursor/=' : null,
            );
            return json({
                data: {
                    files: [{ key: `file${++reads}` }],
                    directories: [],
                    next_cursor: reads === 1 ? 'opaque+cursor/=' : null,
                },
            });
        }),
    );
    const pages = [];
    for await (const page of client.storageFiles.iteratePages(
        ids.organization,
        'connection',
        { prefix: 'folder /nested/' },
    ))
        pages.push(page);
    assert.equal(pages.length, 2);
});

test('pagination rejects credential leakage through a foreign next URL and repeated links', async () => {
    for (const next of [
        'https://attacker.invalid/api/v1/organizations',
        'https://api.example.test/api/v1/organizations',
    ]) {
        let reads = 0;
        const client = new AssetsPro(
            options(async () => {
                reads++;
                return json({ data: [], next_page_url: next });
            }),
        );
        await assert.rejects(async () => {
            for await (const item of client.organizations.iterate()) void item;
        }, ProtocolError);
        assert.equal(reads, 1);
    }
});

test('storage pagination rejects a repeated initial cursor before making another request', async () => {
    let reads = 0;
    const client = new AssetsPro(
        options(async () => {
            reads++;
            return json({
                data: {
                    files: [],
                    directories: [],
                    prefix: '',
                    bucket: 'private',
                    next_cursor: 'same-cursor',
                },
            });
        }),
    );
    await assert.rejects(async () => {
        for await (const page of client.storageFiles.iteratePages(
            'org',
            'connection',
            { cursor: 'same-cursor' },
        ))
            void page;
    }, ProtocolError);
    assert.equal(reads, 1);
});
