import { ProtocolError } from './transport.js';
import type { Asset, PublicUrlKind, PublicUrls } from './types.js';

export function getPublicUrls(
    asset: Pick<Asset, 'publication_urls'>,
): PublicUrls {
    const urls = asset.publication_urls;
    if (
        !urls ||
        !['custom_url', 'default_url'].every((key) => {
            const value = urls[key as keyof PublicUrls];
            return (
                value === null ||
                (typeof value === 'string' && value.length > 0)
            );
        })
    )
        throw new ProtocolError(
            'The asset response did not contain valid publication URL fields.',
        );
    return { custom_url: urls.custom_url, default_url: urls.default_url };
}
export function getPublicUrl(
    asset: Pick<Asset, 'publication_urls'>,
    kind: PublicUrlKind = 'auto',
): string | null {
    if (!['auto', 'custom', 'provider'].includes(kind))
        throw new TypeError(
            'Public URL kind must be auto, custom, or provider.',
        );
    const urls = getPublicUrls(asset);
    return kind === 'custom'
        ? urls.custom_url
        : kind === 'provider'
          ? urls.default_url
          : (urls.custom_url ?? urls.default_url);
}
