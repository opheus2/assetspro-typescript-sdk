import {
    AssetsPro,
    type Asset,
    type UploadRecord,
    type ShareInput,
    type ShareUpdate,
    type PublicUrls,
    type CursorPage,
} from '../src/index.js';

declare const sdk: AssetsPro;
const assets: Promise<CursorPage<Asset>> = sdk.assets.list('org', {
    archived: false,
    collection_ids: ['collection'],
    per_page: 50,
});
const upload: Promise<UploadRecord> = sdk.upload('org', {
    name: 'photo.heic',
    mimeType: 'image/heic',
    size: 100,
    open: () => new ReadableStream<Uint8Array>(),
});
const publicUrls: Promise<PublicUrls> = sdk.getPublicUrls('org', 'asset');
const create: ShareInput = {
    name: 'Campaign',
    collection_id: 'collection',
    password_action: 'set',
    password: 'eight-chars',
    expires_at: null,
    allow_downloads: false,
};
const update: ShareUpdate = { password_action: 'remove' };
const scoped = sdk.forOrganization('org');
const scopedAssets: Promise<CursorPage<Asset>> = scoped.assets.list({
    archived: false,
});
const defaultPublicUrls: Promise<PublicUrls> = sdk.getPublicUrls('asset');
const defaultPublicUrl: Promise<string | null> = sdk.getPublicUrl(
    'asset',
    'provider',
);
// @ts-expect-error Scoped token resource IDs remain ULID strings.
void scoped.tokens.update(1, { ip_whitelist: [] });
// @ts-expect-error Passwords are only sent with password_action=set.
const invalidPassword: ShareUpdate = {
    password_action: 'remove',
    password: 'do not send',
};
// @ts-expect-error Share targets are mutually exclusive.
const invalidTarget: ShareInput = {
    name: 'Campaign',
    asset_id: 'asset',
    collection_id: 'collection',
};
// @ts-expect-error A brand assignment needs brand_id.
void sdk.assets.bulk('org', { action: 'assign_brand', asset_ids: ['asset'] });
// @ts-expect-error Tokens use ULID strings, not numeric IDs.
void sdk.tokens.update('org', 1, { ip_whitelist: [] });
// @ts-expect-error Resource queries do not accept arbitrary UI-only parameters.
void sdk.assets.list('org', { random: true });
void [
    assets,
    upload,
    publicUrls,
    create,
    update,
    invalidPassword,
    invalidTarget,
    scopedAssets,
    defaultPublicUrls,
    defaultPublicUrl,
];
