# Assets Pro TypeScript SDK

A typed TypeScript client for the Assets Pro API.

Use it to work with:

* Assets
* Uploads and downloads
* Brands, categories, tags, and collections
* Storage connections
* Publications and exports
* Members and invitations
* API tokens
* Share links

The SDK is intended for server-side applications using Node.js 22+ or Bun 1.3+.

Do not expose API tokens in browser applications.

## Installation

Install the package from npm:

```bash
npm install @assetspro/typescript-sdk
```

Or with Bun:

```bash
bun add @assetspro/typescript-sdk
```

The SDK uses ESM.

For Node.js projects, ensure your project supports ESM, for example:

```json
{
  "type": "module"
}
```

## Quick Start

Configure your environment:

```bash
ASSETSPRO_BASE_URL=https://assets.example.com
ASSETSPRO_TOKEN=your-api-token
ASSETSPRO_ORGANIZATION=your-organization-id
```

Create the client:

```ts
import { AssetsPro } from '@assetspro/typescript-sdk';

const sdk = new AssetsPro({
    baseUrl: process.env.ASSETSPRO_BASE_URL!,
    token: process.env.ASSETSPRO_TOKEN!,
    organizationId: process.env.ASSETSPRO_ORGANIZATION!,
});
```

Create an organization-scoped client:

```ts
const workspace = sdk.forOrganization();
```

Then access resources:

```ts
const { data: asset } = await workspace.assets.get(assetId);

const page = await workspace.assets.list();

for await (const asset of workspace.assets.iterate()) {
    console.log(asset.name);
}
```

## Organization Scope

Most operations belong to an organization.

Configure a default organization:

```ts
const sdk = new AssetsPro({
    baseUrl,
    token,
    organizationId,
});
```

Then create a scoped client:

```ts
const workspace = sdk.forOrganization();
```

Or explicitly select another organization:

```ts
const anotherWorkspace = sdk.forOrganization(otherOrganizationId);
```

Creating another scope does not modify the original client.

Organizations themselves can be listed without an organization scope:

```ts
const organizations = await sdk.organizations.list();
```

## Assets

### List assets

```ts
const page = await workspace.assets.list({
    q: 'campaign',
    media_type: 'image',
    per_page: 25,
});
```

Assets can be filtered by search, taxonomy, uploader, dates, dimensions, media type, status, sorting, and lifecycle state.

### Iterate through all results

```ts
for await (const asset of workspace.assets.iterate({
    media_type: 'image',
})) {
    console.log(asset.id, asset.name);
}
```

Iteration fetches additional pages as needed.

### Get an asset

```ts
const { data: asset } = await workspace.assets.get(assetId);
```

### Update an asset

```ts
const { data: asset } = await workspace.assets.update(assetId, {
    name: 'Updated name',
    description: 'Updated description',
});
```

Explicit `null`, `false`, zero, and empty arrays are preserved.

Undefined properties are omitted.

For example:

```ts
await workspace.assets.update(assetId, {
    description: null,
    tag_ids: [],
});
```

This clears the description and tag relationship while leaving other properties unchanged.

### Archive, trash, and restore

```ts
await workspace.assets.archive(assetId);

await workspace.assets.delete(assetId);

const { data: restored } = await workspace.assets.restore(assetId);
```

## Uploads

Create a source from a local file:

```ts
import { sourceFromPath } from '@assetspro/typescript-sdk';

const source = await sourceFromPath(
    './photo.jpg',
    'image/jpeg',
);
```

Upload it:

```ts
const upload = await workspace.upload(source, {
    name: 'Campaign photo',
    collection_ids: [collectionId],
});
```

The high-level upload helper:

1. Initializes the upload
2. Transfers the file to storage
3. Completes the upload

Upload completion does not necessarily mean media processing has finished.

### Wait for processing

```ts
const ready = await workspace.waitForUpload(upload.id);
```

Or wait automatically:

```ts
const upload = await workspace.upload(
    source,
    {
        name: 'Campaign photo',
    },
    {
        wait: true,
    },
);
```

### Replace an existing asset

```ts
const upload = await workspace.upload(source, {
    target_asset_id: assetId,
});
```

### Publish after processing

```ts
const upload = await workspace.upload(source, {
    publish_after_processing: true,
});
```

Then wait for publication when necessary:

```ts
const asset = await workspace.waitForPublication(upload.asset_id!);
```

### Upload progress

```ts
const upload = await workspace.upload(
    source,
    {},
    {
        onProgress(bytes, total) {
            console.log(`${bytes}/${total}`);
        },
    },
);
```

If recovery is important, persist the upload ID as soon as initialization completes:

```ts
const upload = await workspace.upload(
    source,
    {},
    {
        onInitialized(upload) {
            persistUploadId(upload.id);
        },
    },
);
```

## Upload Sources

### Local file

```ts
const source = await sourceFromPath(
    './photo.jpg',
    'image/jpeg',
);
```

### Blob

```ts
import { sourceFromBlob } from '@assetspro/typescript-sdk';

const source = sourceFromBlob(
    blob,
    'photo.jpg',
    'image/jpeg',
);
```

### Custom stream

```ts
const source = {
    name: 'file.bin',
    size: fileSize,
    mimeType: 'application/octet-stream',
    open: () => createReadableStream(),
};
```

Custom upload sources must provide the exact byte size and a fresh readable stream when needed.

## Upload Recovery

Uploads are not blindly retried after ambiguous failures.

If an upload fails after initialization, inspect its current state first.

```ts
import { UploadError } from '@assetspro/typescript-sdk';

try {
    await workspace.upload(source);
} catch (error) {
    if (error instanceof UploadError) {
        const { data: upload } =
            await workspace.uploads.get(error.uploadId);

        console.log(upload.status);
    }
}
```

Retry deliberately:

```ts
const upload = await workspace.retryUpload(
    uploadId,
    source,
);
```

Processing-only retries may not require the original source:

```ts
const upload = await workspace.retryUpload(uploadId);
```

## Downloads

### Get a temporary download URL

```ts
const url = await workspace.getDownloadUrl(assetId);
```

Signed download URLs are temporary and should generally be generated when needed.

### Stream a download

```ts
const stream = await workspace.download(assetId);

await stream.pipeTo(destinationStream);
```

### Download to a file

```ts
await workspace.downloadTo(
    assetId,
    './downloads/photo.jpg',
);
```

Existing files are not overwritten.

Partial files created by failed downloads are removed.

### Download a revision or variant

```ts
const stream = await workspace.download(assetId, {
    revision: revisionId,
    variant: variantId,
});
```

## Public URLs

Retrieve the preferred public URL:

```ts
const url = await workspace.getPublicUrl(assetId);
```

You can explicitly request a source:

```ts
const custom = await workspace.getPublicUrl(
    assetId,
    'custom',
);

const provider = await workspace.getPublicUrl(
    assetId,
    'provider',
);
```

Retrieve both:

```ts
const urls = await workspace.getPublicUrls(assetId);

console.log(urls.custom_url);
console.log(urls.default_url);
```

Public URL helpers report the asset's current publication state.

They do not publish assets automatically.

## Pagination

List methods return paginated API responses:

```ts
const page = await workspace.assets.list({
    per_page: 25,
});
```

For most application code, the iterator is simpler:

```ts
for await (const asset of workspace.assets.iterate()) {
    console.log(asset.name);
}
```

You can stop iteration normally:

```ts
for await (const asset of workspace.assets.iterate()) {
    if (shouldStop(asset)) {
        break;
    }
}
```

No additional pages are requested after the loop exits.

## Taxonomy

Assets Pro supports:

* Brands
* Brand roles
* Categories
* Tags
* Collections

They follow a similar resource pattern:

```ts
const categories = await workspace.categories.list();

const { data: category } =
    await workspace.categories.get(categoryId);

const { data: created } =
    await workspace.categories.create({
        name: 'Photography',
    });
```

Update a record:

```ts
await workspace.categories.update(categoryId, {
    description: 'Updated description',
});
```

Archive it:

```ts
await workspace.categories.archive(categoryId);
```

## Collections

Resolve a collection by name:

```ts
const result = await workspace.collections.resolve({
    name: 'Campaign Assets',
});

const collection = result.data;
```

Collections can also be:

* Archived
* Trashed
* Restored
* Processed in bulk

Some collection lifecycle operations may continue asynchronously.

When an operation is returned:

```ts
const { data: result } = await workspace.collections.trash(
    collectionId,
    {
        include_assets: true,
    },
);

if (result.operation) {
    await workspace.waitForTrashOperation(
        result.operation.id,
    );
}
```

## Storage

Supported providers include:

* Cloudflare R2
* Amazon S3
* S3-compatible providers

Create a connection:

```ts
const { data: connection } =
    await workspace.storageConnections.create({
        name: 'Private storage',
        provider: 'r2',
        region: 'auto',
        private_bucket: 'assets-private',
        use_path_style_endpoint: true,
        endpoint,
        credentials: {
            key: accessKey,
            secret: secretKey,
        },
    });
```

Verify it:

```ts
await workspace.storageConnections.verify(
    connection.id,
);
```

Activate it:

```ts
await workspace.storageConnections.activate(
    connection.id,
);
```

Storage credentials are only used for storage administration.

Normal asset operations do not expose stored credentials.

## Publications

Publish an asset:

```ts
const { data: publication } =
    await workspace.publications.create(assetId);
```

Publishing may continue asynchronously.

Wait until the asset becomes publicly available:

```ts
const asset =
    await workspace.waitForPublication(assetId);
```

Revoke publication:

```ts
await workspace.publications.revoke(assetId);
```

## Exports

Create a ZIP export:

```ts
const { data: exportJob } =
    await workspace.exports.create({
        asset_ids: [
            firstAssetId,
            secondAssetId,
        ],
    });
```

Wait until it is ready:

```ts
const ready =
    await workspace.waitForExport(exportJob.id);
```

Get the download URL:

```ts
const url =
    await workspace.exports.getDownloadUrl(ready.id);
```

Exports are processed asynchronously and remain subject to server limits and expiration rules.

## Members and Invitations

List members:

```ts
const members =
    await workspace.members.list();
```

Update a member role:

```ts
const { data: member } =
    await workspace.members.update(userId, {
        role: 'Editor',
    });
```

Invite someone:

```ts
const { data: invitation } =
    await workspace.invitations.create({
        email: 'user@example.com',
        role: 'Viewer',
    });
```

Available built-in roles are:

```ts
'Owner' | 'Manager' | 'Editor' | 'Viewer'
```

The API enforces final authorization and role restrictions.

## API Tokens

Create a token:

```ts
const result = await workspace.tokens.create({
    name: 'Read-only integration',
    abilities: [
        'assets.view',
        'assets.download',
    ],
});
```

The plaintext token is returned only when created:

```ts
const token = result.token;
```

Store it securely.

Tokens can also be:

* Listed
* Restricted by IP address
* Revoked

## Share Links

Create a share link:

```ts
const { data: share } =
    await workspace.shareLinks.create({
        name: 'Client review',
        asset_id: assetId,
        allow_downloads: false,
    });
```

Share links can target either an asset or a collection.

They can optionally support:

* Expiration
* Password protection
* Downloads

Example with expiration and password protection:

```ts
const { data: share } =
    await workspace.shareLinks.create({
        name: 'Client review',
        collection_id: collectionId,
        allow_downloads: false,
        expires_at: new Date(
            Date.now() + 24 * 60 * 60 * 1000,
        ).toISOString(),
        password_action: 'set',
        password: process.env.CLIENT_REVIEW_PASSWORD!,
    });
```

Update a share:

```ts
await workspace.shareLinks.update(share.id, {
    expires_at: null,
    password_action: 'keep',
});
```

Share targets cannot be changed after creation.

## Waiting for Async Operations

Several operations may continue asynchronously.

The SDK provides helpers for waiting on them:

```ts
await workspace.waitForUpload(uploadId);

await workspace.waitForAsset(assetId);

await workspace.waitForPublication(assetId);

await workspace.waitForExport(exportId);

await workspace.waitForTrashOperation(operationId);
```

Each helper has a bounded timeout and stops when the operation succeeds or reaches a terminal failure.

You can customize waiting:

```ts
await workspace.waitForUpload(uploadId, {
    timeoutMs: 120_000,
    intervalMs: 1_000,
    maxAttempts: 120,
});
```

## Request Cancellation

Most operations support an `AbortSignal`:

```ts
const controller = new AbortController();

const request = workspace.assets.list(
    {},
    {
        signal: controller.signal,
    },
);

controller.abort();
```

You can also specify a request timeout:

```ts
await workspace.assets.list(
    {},
    {
        timeoutMs: 15_000,
    },
);
```

## Client Options

Configure common behavior when creating the SDK:

```ts
const sdk = new AssetsPro({
    baseUrl,
    token,
    organizationId,
    timeoutMs: 60_000,
    readRetries: 2,
    maxRetryDelayMs: 30_000,
});
```

The defaults are suitable for most applications.

Reads may automatically retry temporary network and server failures.

Mutating requests are generally not automatically replayed when doing so could create ambiguous results.

## Errors

The SDK exposes typed error classes:

```ts
import {
    ApiError,
    OperationError,
    UploadError,
} from '@assetspro/typescript-sdk';
```

Example:

```ts
try {
    await workspace.assets.update(assetId, {
        name: 'New name',
    });
} catch (error) {
    if (error instanceof ApiError) {
        console.error(
            error.status,
            error.code,
            error.errors,
        );
    } else if (error instanceof UploadError) {
        console.error(
            error.uploadId,
            error.stage,
        );
    } else if (error instanceof OperationError) {
        console.error(
            error.operationId,
            error.code,
        );
    } else {
        throw error;
    }
}
```

Useful errors include:

* `ApiError`
* `TransportError`
* `ProtocolError`
* `StorageError`
* `UploadError`
* `OperationError`
* `TimeoutError`

Sensitive credentials are redacted from SDK-generated errors.

Successful responses may still contain sensitive values such as:

* Created API tokens
* Signed download URLs
* Share URLs
* Upload authorization URLs

Do not log entire responses indiscriminately.

## Security

Keep API tokens server-side.

The SDK:

* Uses bearer authentication for API requests
* Does not forward API credentials to storage providers
* Separates API and storage requests
* Validates redirects used for downloads
* Redacts known credentials from SDK-generated errors
* Streams large media instead of loading it entirely into memory

Custom transports and application logging remain the responsibility of the consuming application.

## Development

From the SDK directory:

```bash
bun install --frozen-lockfile

bun run build

bun run typecheck

bun run test

bun run test:bun
```

Tests cover the public client, typed resources, pagination, uploads, downloads, retries, cancellation, async waits, and Node/Bun runtime behavior.

## Project Structure

```text
src/
├── index.ts
├── client.ts
├── organization-client.ts
├── resources.ts
├── types.ts
├── streams.ts
└── public-urls.ts

examples/
test/
dist/
```

Most application code only needs to work with:

* `AssetsPro`
* `OrganizationClient`
* Resource groups
* Exported types
* Upload source helpers
* Error classes

Internal transport and stream implementation details should generally not be imported directly.

## License

MIT. [LICENSE](LICENSE)

Copyright © 2026 AssetsPro contributors.
