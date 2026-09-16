import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { readFile } from 'node:fs/promises';
import { AssetsPro, OperationError } from '../dist/index.js';
const { fixtures } = JSON.parse(
    await readFile(
        new URL('../contracts/fixtures.json', import.meta.url),
        'utf8',
    ),
);
const fixtureClient = (sequence) => {
    let reads = 0;
    return {
        reads: () => reads,
        client: new AssetsPro({
            baseUrl: 'https://api.example.test',
            token: 'test',
            readRetries: 0,
            fetch: async () =>
                Response.json(sequence[Math.min(reads++, sequence.length - 1)]),
        }),
    };
};
const wait = { intervalMs: 0, maxAttempts: 3, timeoutMs: 1000 };

test('upload waits separate processing from optional publication and report processing failure', async () => {
    const state = fixtureClient([
        fixtures.upload_completed,
        fixtures.upload_publishing,
    ]);
    assert.equal(
        (await state.client.waitForUpload('org', 'upload', wait))
            .processing_status,
        'ready',
    );
    assert.equal(state.reads(), 2);
    const failed = fixtureClient([fixtures.upload_processing_failed]);
    await assert.rejects(
        failed.client.waitForUpload('org', 'upload', wait),
        OperationError,
    );
    const publishingFailed = fixtureClient([
        fixtures.upload_publication_failed,
    ]);
    assert.equal(
        (await publishingFailed.client.waitForUpload('org', 'upload', wait))
            .processing_status,
        'ready',
    );
});

test('publication waits use the current revision, ignoring historical cleanup and older failed generations', async () => {
    const asset = structuredClone(fixtures.asset_public);
    const current = asset.data.publications[0];
    asset.data.publications.push({
        ...current,
        id: 'older',
        asset_revision_id: 'old-revision',
        status: 'revoking',
        error_message: 'Old cleanup',
    });
    asset.data.publications.push({
        ...current,
        id: '000',
        status: 'revoked',
        error_message: 'Old failure',
    });
    assert.equal(
        (
            await fixtureClient([asset]).client.waitForPublication(
                'org',
                'asset',
                wait,
            )
        ).id,
        asset.data.id,
    );
    const failed = structuredClone(fixtures.asset_private);
    failed.data.publications = [
        {
            ...current,
            status: 'revoking',
            error_message: 'Public delivery was denied.',
        },
    ];
    await assert.rejects(
        fixtureClient([failed]).client.waitForPublication('org', 'asset', wait),
        (error) =>
            error instanceof OperationError &&
            error.message === 'Public delivery was denied.',
    );
});

test('asset waits do not return a ready old revision while replacement is processing', async () => {
    const state = fixtureClient([
        fixtures.asset_pending_replacement,
        fixtures.asset_public,
    ]);
    await state.client.waitForAsset('org', 'asset', wait);
    assert.equal(state.reads(), 2);
    await assert.rejects(
        fixtureClient([fixtures.asset_archived]).client.waitForAsset(
            'org',
            'asset',
            wait,
        ),
        OperationError,
    );
});

test('export waits finish, while stalled jobs exhaust an explicit bound and partial trash failures are not success', async () => {
    const state = fixtureClient([
        fixtures.export_queued,
        fixtures.export_ready,
    ]);
    assert.equal(
        (await state.client.waitForExport('org', 'export', wait)).status,
        'ready',
    );
    const stalled = fixtureClient([fixtures.export_queued]);
    await assert.rejects(
        stalled.client.waitForExport('org', 'export', {
            ...wait,
            maxAttempts: 2,
        }),
        (error) =>
            error instanceof OperationError && error.code === 'wait_exhausted',
    );
    assert.equal(stalled.reads(), 2);
    await assert.rejects(
        fixtureClient([
            {
                data: {
                    id: 'op',
                    status: 'completed',
                    failed: 1,
                    error_message: 'A file failed.',
                    error_code: 'partial',
                },
            },
        ]).client.waitForTrashOperation('org', 'op', wait),
        OperationError,
    );
});

test('failed transfer status is terminal without a revision and polling errors redact configured bearer tokens', async () => {
    const client = new AssetsPro({
        baseUrl: 'https://api.example.test',
        token: 'private-bearer',
        fetch: async () =>
            Response.json({
                data: {
                    ...fixtures.upload_initialized.data,
                    status: 'failed',
                    processing_status: null,
                    error_message: 'Rejected private-bearer',
                    failure_code: 'private-bearer',
                },
            }),
    });
    await assert.rejects(
        client.waitForUpload('org', 'upload', wait),
        (error) =>
            error instanceof OperationError &&
            !inspect(error).includes('private-bearer'),
    );
});
