import { AssetsPro, sourceFromPath } from '@assets-pro/typescript-sdk';

// Run with Bun: bun examples/usage.ts

const {
    ASSETSPRO_BASE_URL,
    ASSETSPRO_TOKEN,
    ASSETSPRO_ORGANIZATION,
    ASSETSPRO_UPLOAD_PATH,
} = process.env;
if (!ASSETSPRO_BASE_URL || !ASSETSPRO_TOKEN || !ASSETSPRO_ORGANIZATION)
    throw new Error(
        'Set ASSETSPRO_BASE_URL, ASSETSPRO_TOKEN, and ASSETSPRO_ORGANIZATION.',
    );
const sdk = new AssetsPro({
    baseUrl: ASSETSPRO_BASE_URL,
    token: ASSETSPRO_TOKEN,
    organizationId: ASSETSPRO_ORGANIZATION,
});

for await (const asset of sdk.forOrganization().assets.iterate({
    media_type: 'image',
    per_page: 50,
})) {
    console.log(asset.id, asset.name);
    const publicUrl = await sdk.getPublicUrl(asset.id);
    console.log('Public URL:', publicUrl ?? 'This asset is private.');
    break;
}

if (ASSETSPRO_UPLOAD_PATH) {
    const mimeType = process.env.ASSETSPRO_UPLOAD_MIME;
    if (!mimeType)
        throw new Error('Set ASSETSPRO_UPLOAD_MIME to the file MIME type.');
    const source = await sourceFromPath(ASSETSPRO_UPLOAD_PATH, mimeType);
    const upload = await sdk.upload(source, {
        publish_after_processing: false,
    });
    const ready = await sdk.waitForUpload(upload.id, {
        timeoutMs: 120_000,
    });
    if (ready.asset_id) {
        const asset = (await sdk.forOrganization().assets.get(ready.asset_id))
            .data;
        console.log('Uploaded asset:', asset.id, asset.name);
    }
}
