import type {
    AssetsPro,
    UploadMetadata,
    UploadOptions,
    WaitOptions,
} from './client.js';
import type * as R from './resources.js';
import type * as T from './types.js';
import type { RequestOptions } from './transport.js';
import type { UploadSource } from './streams.js';

export type ScopedResource<Resource> = {
    [Key in keyof Resource]: Resource[Key] extends (
        organization: string,
        ...args: infer Arguments
    ) => infer Result
        ? (...args: Arguments) => Result
        : never;
};

function bindOrganization<Resource extends object>(
    resource: Resource,
    organization: T.Id,
): ScopedResource<Resource> {
    const methods: Record<string, unknown> = {};
    let prototype = Object.getPrototypeOf(resource);
    while (prototype && prototype !== Object.prototype) {
        for (const name of Object.getOwnPropertyNames(prototype)) {
            if (name === 'constructor' || name in methods) continue;
            const method: unknown = Reflect.get(resource, name);
            if (typeof method === 'function')
                methods[name] = (...args: unknown[]) =>
                    Reflect.apply(method, resource, [organization, ...args]);
        }
        prototype = Object.getPrototypeOf(prototype);
    }
    return methods as ScopedResource<Resource>;
}

/** Resource methods on this immutable facade use its organization automatically. */
export class OrganizationClient {
    readonly #organizationId: T.Id;
    get organizationId(): T.Id {
        return this.#organizationId;
    }
    readonly organizations: R.Organizations;
    readonly uploaders: ScopedResource<R.Uploaders>;
    readonly assets: ScopedResource<R.Assets>;
    readonly publications: ScopedResource<R.Publications>;
    readonly brands: ScopedResource<R.Taxonomies<T.Brand>>;
    readonly brandRoles: ScopedResource<R.Taxonomies>;
    readonly categories: ScopedResource<R.Taxonomies>;
    readonly tags: ScopedResource<R.Taxonomies>;
    readonly collections: ScopedResource<R.Collections>;
    readonly uploads: ScopedResource<R.Uploads>;
    readonly storageConnections: ScopedResource<R.StorageConnections>;
    readonly storageFiles: ScopedResource<R.StorageFiles>;
    readonly exports: ScopedResource<R.Exports>;
    readonly members: ScopedResource<R.Members>;
    readonly invitations: ScopedResource<R.Invitations>;
    readonly tokens: ScopedResource<R.Tokens>;
    readonly shareLinks: ScopedResource<R.ShareLinks>;
    readonly trashOperations: ScopedResource<R.TrashOperations>;

    constructor(
        private readonly client: AssetsPro,
        organizationId: T.Id,
    ) {
        this.#organizationId = organizationId;
        this.organizations = client.organizations;
        this.uploaders = bindOrganization(client.uploaders, organizationId);
        this.assets = bindOrganization(client.assets, organizationId);
        this.publications = bindOrganization(
            client.publications,
            organizationId,
        );
        this.brands = bindOrganization(client.brands, organizationId);
        this.brandRoles = bindOrganization(client.brandRoles, organizationId);
        this.categories = bindOrganization(client.categories, organizationId);
        this.tags = bindOrganization(client.tags, organizationId);
        this.collections = bindOrganization(client.collections, organizationId);
        this.uploads = bindOrganization(client.uploads, organizationId);
        this.storageConnections = bindOrganization(
            client.storageConnections,
            organizationId,
        );
        this.storageFiles = bindOrganization(
            client.storageFiles,
            organizationId,
        );
        this.exports = bindOrganization(client.exports, organizationId);
        this.members = bindOrganization(client.members, organizationId);
        this.invitations = bindOrganization(client.invitations, organizationId);
        this.tokens = bindOrganization(client.tokens, organizationId);
        this.shareLinks = bindOrganization(client.shareLinks, organizationId);
        this.trashOperations = bindOrganization(
            client.trashOperations,
            organizationId,
        );
    }
    forOrganization(organizationId: T.Id): OrganizationClient {
        return this.client.forOrganization(organizationId);
    }
    getPublicUrls(
        asset: T.Id,
        options?: RequestOptions,
    ): Promise<T.PublicUrls> {
        return this.client.assets.getPublicUrls(
            this.#organizationId,
            asset,
            options,
        );
    }
    getPublicUrl(
        asset: T.Id,
        kind: T.PublicUrlKind = 'auto',
        options?: RequestOptions,
    ): Promise<string | null> {
        return this.client.assets.getPublicUrl(
            this.#organizationId,
            asset,
            kind,
            options,
        );
    }
    getDownloadUrl(
        asset: T.Id,
        query: T.DownloadQuery = {},
        options?: RequestOptions,
    ): Promise<string> {
        return this.client.assets.getDownloadUrl(
            this.#organizationId,
            asset,
            query,
            options,
        );
    }
    download(
        asset: T.Id,
        query: T.DownloadQuery = {},
        options?: RequestOptions,
    ): Promise<ReadableStream<Uint8Array>> {
        return this.client.download(
            this.#organizationId,
            asset,
            query,
            options,
        );
    }
    downloadTo(
        asset: T.Id,
        destination: string | WritableStream<Uint8Array>,
        query: T.DownloadQuery = {},
        options?: RequestOptions,
    ): Promise<void> {
        return this.client.downloadTo(
            this.#organizationId,
            asset,
            destination,
            query,
            options,
        );
    }
    upload(
        source: UploadSource,
        metadata: UploadMetadata = {},
        options?: UploadOptions,
    ): Promise<T.UploadRecord> {
        return this.client.upload(
            this.#organizationId,
            source,
            metadata,
            options,
        );
    }
    retryUpload(
        upload: T.Id,
        source?: UploadSource,
        options?: UploadOptions,
    ): Promise<T.UploadRecord> {
        return this.client.retryUpload(
            this.#organizationId,
            upload,
            source,
            options,
        );
    }
    waitForUpload(
        upload: T.Id,
        options?: WaitOptions,
    ): Promise<T.UploadRecord> {
        return this.client.waitForUpload(this.#organizationId, upload, options);
    }
    waitForAsset(asset: T.Id, options?: WaitOptions): Promise<T.Asset> {
        return this.client.waitForAsset(this.#organizationId, asset, options);
    }
    waitForPublication(asset: T.Id, options?: WaitOptions): Promise<T.Asset> {
        return this.client.waitForPublication(
            this.#organizationId,
            asset,
            options,
        );
    }
    waitForExport(id: T.Id, options?: WaitOptions): Promise<T.ExportRecord> {
        return this.client.waitForExport(this.#organizationId, id, options);
    }
    waitForTrashOperation(
        operation: T.Id,
        options?: WaitOptions,
    ): Promise<T.TrashOperation> {
        return this.client.waitForTrashOperation(
            this.#organizationId,
            operation,
            options,
        );
    }
}
