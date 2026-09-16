import {
    ProtocolError,
    Transport,
    segment,
    type RequestOptions,
} from './transport.js';
import { getPublicUrl, getPublicUrls } from './public-urls.js';
import type * as T from './types.js';

const orgPath = (organization: T.Id, suffix: string) =>
    `organizations/${segment(organization)}/${suffix}`;

export class Organizations {
    constructor(private readonly http: Transport) {}
    list(
        query: T.CursorQuery = {},
        options?: RequestOptions,
    ): Promise<T.FlatCursorPage<T.Organization>> {
        return this.http.request(
            'GET',
            'organizations',
            query,
            undefined,
            options,
        );
    }
    iterate(
        query: T.CursorQuery = {},
        options?: RequestOptions,
    ): AsyncGenerator<T.Organization> {
        return this.http.iterate('organizations', query, options);
    }
}
export class Uploaders {
    constructor(private readonly http: Transport) {}
    list(
        organization: T.Id,
        query: T.SearchQuery = {},
        options?: RequestOptions,
    ): Promise<T.FlatCursorPage<T.Uploader>> {
        return this.http.request(
            'GET',
            orgPath(organization, 'uploaders'),
            query,
            undefined,
            options,
        );
    }
    iterate(
        organization: T.Id,
        query: T.SearchQuery = {},
        options?: RequestOptions,
    ): AsyncGenerator<T.Uploader> {
        return this.http.iterate(
            orgPath(organization, 'uploaders'),
            query,
            options,
        );
    }
}
export class Assets {
    constructor(private readonly http: Transport) {}
    list(
        organization: T.Id,
        query: T.AssetQuery = {},
        options?: RequestOptions,
    ): Promise<T.CursorPage<T.Asset>> {
        return this.http.request(
            'GET',
            orgPath(organization, 'assets'),
            query,
            undefined,
            options,
        );
    }
    iterate(
        organization: T.Id,
        query: T.AssetQuery = {},
        options?: RequestOptions,
    ): AsyncGenerator<T.Asset> {
        return this.http.iterate(
            orgPath(organization, 'assets'),
            query,
            options,
        );
    }
    get(
        organization: T.Id,
        asset: T.Id,
        options?: RequestOptions,
    ): Promise<T.Data<T.Asset>> {
        return this.http.request(
            'GET',
            orgPath(organization, `assets/${segment(asset)}`),
            {},
            undefined,
            options,
        );
    }
    update(
        organization: T.Id,
        asset: T.Id,
        input: T.AssetUpdate,
        options?: RequestOptions,
    ): Promise<T.Data<T.Asset>> {
        return this.http.request(
            'PATCH',
            orgPath(organization, `assets/${segment(asset)}`),
            {},
            input,
            options,
        );
    }
    delete(
        organization: T.Id,
        asset: T.Id,
        options?: RequestOptions,
    ): Promise<T.Message> {
        return this.http.request(
            'DELETE',
            orgPath(organization, `assets/${segment(asset)}`),
            {},
            undefined,
            options,
        );
    }
    archive(
        organization: T.Id,
        asset: T.Id,
        options?: RequestOptions,
    ): Promise<T.Message> {
        return this.http.request(
            'POST',
            orgPath(organization, `assets/${segment(asset)}/archive`),
            {},
            {},
            options,
        );
    }
    restore(
        organization: T.Id,
        asset: T.Id,
        options?: RequestOptions,
    ): Promise<T.Data<T.Asset>> {
        return this.http.request(
            'POST',
            orgPath(organization, `assets/${segment(asset)}/restore`),
            {},
            {},
            options,
        );
    }
    bulk(
        organization: T.Id,
        input: T.AssetBulkInput,
        options?: RequestOptions,
    ): Promise<T.Message & { count: number }> {
        return this.http.request(
            'POST',
            orgPath(organization, 'assets/bulk'),
            {},
            input,
            options,
        );
    }
    revisions(
        organization: T.Id,
        asset: T.Id,
        query: T.CursorQuery = {},
        options?: RequestOptions,
    ): Promise<T.CursorPage<T.Revision>> {
        return this.http.request(
            'GET',
            orgPath(organization, `assets/${segment(asset)}/revisions`),
            query,
            undefined,
            options,
        );
    }
    iterateRevisions(
        organization: T.Id,
        asset: T.Id,
        query: T.CursorQuery = {},
        options?: RequestOptions,
    ): AsyncGenerator<T.Revision> {
        return this.http.iterate(
            orgPath(organization, `assets/${segment(asset)}/revisions`),
            query,
            options,
        );
    }
    getDownloadUrl(
        organization: T.Id,
        asset: T.Id,
        query: T.DownloadQuery = {},
        options?: RequestOptions,
    ): Promise<string> {
        return this.http.request(
            'GET',
            orgPath(organization, `assets/${segment(asset)}/download`),
            query,
            undefined,
            options,
            'redirect',
        );
    }
    svg(
        organization: T.Id,
        asset: T.Id,
        options?: RequestOptions,
    ): Promise<string> {
        return this.http.request(
            'GET',
            orgPath(organization, `assets/${segment(asset)}/svg`),
            {},
            undefined,
            options,
            'text',
        );
    }
    async getPublicUrls(
        organization: T.Id,
        asset: T.Id,
        options?: RequestOptions,
    ): Promise<T.PublicUrls> {
        return getPublicUrls(
            (await this.get(organization, asset, options)).data,
        );
    }
    async getPublicUrl(
        organization: T.Id,
        asset: T.Id,
        kind: T.PublicUrlKind = 'auto',
        options?: RequestOptions,
    ): Promise<string | null> {
        return getPublicUrl(
            (await this.get(organization, asset, options)).data,
            kind,
        );
    }
}
export class Publications {
    constructor(private readonly http: Transport) {}
    create(
        organization: T.Id,
        asset: T.Id,
        options?: RequestOptions,
    ): Promise<T.Data<T.PublicationCreated>> {
        return this.http.request(
            'POST',
            orgPath(organization, `assets/${segment(asset)}/publication`),
            {},
            {},
            options,
        );
    }
    revoke(
        organization: T.Id,
        asset: T.Id,
        options?: RequestOptions,
    ): Promise<T.Message> {
        return this.http.request(
            'DELETE',
            orgPath(organization, `assets/${segment(asset)}/publication`),
            {},
            undefined,
            options,
        );
    }
}
export class Taxonomies<
    Entity extends T.Taxonomy = T.Taxonomy,
    Query extends T.TaxonomyQuery = T.TaxonomyQuery,
> {
    constructor(
        protected readonly http: Transport,
        protected readonly kind:
            | 'brands'
            | 'brand-roles'
            | 'categories'
            | 'tags'
            | 'collections',
    ) {}
    list(
        organization: T.Id,
        query?: Query,
        options?: RequestOptions,
    ): Promise<T.CursorPage<Entity>> {
        return this.http.request(
            'GET',
            orgPath(organization, this.kind),
            query,
            undefined,
            options,
        );
    }
    iterate(
        organization: T.Id,
        query?: Query,
        options?: RequestOptions,
    ): AsyncGenerator<Entity> {
        return this.http.iterate(
            orgPath(organization, this.kind),
            query,
            options,
        );
    }
    get(
        organization: T.Id,
        record: T.Id,
        options?: RequestOptions,
    ): Promise<T.Data<Entity>> {
        return this.http.request(
            'GET',
            orgPath(organization, `${this.kind}/${segment(record)}`),
            {},
            undefined,
            options,
        );
    }
    create(
        organization: T.Id,
        input: T.TaxonomyInput,
        options?: RequestOptions,
    ): Promise<T.Data<Entity>> {
        return this.http.request(
            'POST',
            orgPath(organization, this.kind),
            {},
            input,
            options,
        );
    }
    update(
        organization: T.Id,
        record: T.Id,
        input: T.TaxonomyUpdate,
        options?: RequestOptions,
    ): Promise<T.Data<Entity>> {
        return this.http.request(
            'PATCH',
            orgPath(organization, `${this.kind}/${segment(record)}`),
            {},
            input,
            options,
        );
    }
    archive(
        organization: T.Id,
        record: T.Id,
        options?: RequestOptions,
    ): Promise<void> {
        return this.http.request(
            'DELETE',
            orgPath(organization, `${this.kind}/${segment(record)}`),
            {},
            undefined,
            options,
        );
    }
}
export class Collections extends Taxonomies<T.Collection, T.CollectionQuery> {
    constructor(http: Transport) {
        super(http, 'collections');
    }
    resolve(
        organization: T.Id,
        input: { name: string },
        options?: RequestOptions,
    ): Promise<T.CollectionResolved> {
        return this.http.request(
            'POST',
            orgPath(organization, 'collections/resolve'),
            {},
            input,
            options,
        );
    }
    preview(
        organization: T.Id,
        input: Pick<T.CollectionBulkInput, 'collection_ids' | 'action'>,
        options?: RequestOptions,
    ): Promise<T.Data<T.CollectionPreview>> {
        return this.http.request(
            'POST',
            orgPath(organization, 'collections/preview'),
            {},
            input,
            options,
        );
    }
    bulk(
        organization: T.Id,
        input: T.CollectionBulkInput,
        options?: RequestOptions,
    ): Promise<T.Data<T.CollectionApplied>> {
        return this.http.request(
            'POST',
            orgPath(organization, 'collections/bulk'),
            {},
            input,
            options,
        );
    }
    trash(
        organization: T.Id,
        collection: T.Id,
        input: T.CollectionActionInput = {},
        options?: RequestOptions,
    ): Promise<T.Data<T.CollectionApplied>> {
        return this.http.request(
            'POST',
            orgPath(organization, `collections/${segment(collection)}/trash`),
            {},
            input,
            options,
        );
    }
    restore(
        organization: T.Id,
        collection: T.Id,
        input: T.CollectionActionInput = {},
        options?: RequestOptions,
    ): Promise<T.Data<T.CollectionApplied>> {
        return this.http.request(
            'POST',
            orgPath(organization, `collections/${segment(collection)}/restore`),
            {},
            input,
            options,
        );
    }
}
export class Uploads {
    constructor(private readonly http: Transport) {}
    list(
        organization: T.Id,
        query: T.UploadQuery = {},
        options?: RequestOptions,
    ): Promise<T.CursorPage<T.UploadRecord>> {
        return this.http.request(
            'GET',
            orgPath(organization, 'uploads'),
            query,
            undefined,
            options,
        );
    }
    iterate(
        organization: T.Id,
        query: T.UploadQuery = {},
        options?: RequestOptions,
    ): AsyncGenerator<T.UploadRecord> {
        return this.http.iterate(
            orgPath(organization, 'uploads'),
            query,
            options,
        );
    }
    create(
        organization: T.Id,
        input: T.UploadInput,
        options?: RequestOptions,
    ): Promise<T.UploadInitialized> {
        return this.http.request(
            'POST',
            orgPath(organization, 'uploads'),
            {},
            input,
            options,
        );
    }
    status(
        organization: T.Id,
        input: { ids: T.Id[] },
        options?: RequestOptions,
    ): Promise<T.UploadStatusBatch> {
        return this.http.request(
            'POST',
            orgPath(organization, 'uploads/status'),
            {},
            input,
            options,
        );
    }
    get(
        organization: T.Id,
        upload: T.Id,
        options?: RequestOptions,
    ): Promise<T.Data<T.UploadRecord>> {
        return this.http.request(
            'GET',
            orgPath(organization, `uploads/${segment(upload)}`),
            {},
            undefined,
            options,
        );
    }
    complete(
        organization: T.Id,
        upload: T.Id,
        options?: RequestOptions,
    ): Promise<T.Data<T.UploadRecord>> {
        return this.http.request(
            'POST',
            orgPath(organization, `uploads/${segment(upload)}/complete`),
            {},
            {},
            options,
        );
    }
    retry(
        organization: T.Id,
        upload: T.Id,
        options?: RequestOptions,
    ): Promise<T.UploadRetried> {
        return this.http.request(
            'POST',
            orgPath(organization, `uploads/${segment(upload)}/retry`),
            {},
            {},
            options,
        );
    }
    cancel(
        organization: T.Id,
        upload: T.Id,
        options?: RequestOptions,
    ): Promise<T.Data<T.UploadRecord>> {
        return this.http.request(
            'DELETE',
            orgPath(organization, `uploads/${segment(upload)}`),
            {},
            undefined,
            options,
        );
    }
}
export class StorageConnections {
    constructor(private readonly http: Transport) {}
    list(
        organization: T.Id,
        query: { page?: number } = {},
        options?: RequestOptions,
    ): Promise<T.OffsetPage<T.StorageConnection>> {
        return this.http.request(
            'GET',
            orgPath(organization, 'storage-connections'),
            query,
            undefined,
            options,
        );
    }
    iterate(
        organization: T.Id,
        query: { page?: number } = {},
        options?: RequestOptions,
    ): AsyncGenerator<T.StorageConnection> {
        return this.http.iterate(
            orgPath(organization, 'storage-connections'),
            query,
            options,
        );
    }
    create(
        organization: T.Id,
        input: T.StorageInput,
        options?: RequestOptions,
    ): Promise<T.Data<T.StorageConnection>> {
        return this.http.request(
            'POST',
            orgPath(organization, 'storage-connections'),
            {},
            input,
            options,
        );
    }
    verify(
        organization: T.Id,
        connection: T.Id,
        options?: RequestOptions,
    ): Promise<T.Data<T.StorageConnection>> {
        return this.http.request(
            'POST',
            orgPath(
                organization,
                `storage-connections/${segment(connection)}/verify`,
            ),
            {},
            {},
            options,
        );
    }
    activate(
        organization: T.Id,
        connection: T.Id,
        options?: RequestOptions,
    ): Promise<T.Data<T.StorageConnection>> {
        return this.http.request(
            'POST',
            orgPath(
                organization,
                `storage-connections/${segment(connection)}/activate`,
            ),
            {},
            {},
            options,
        );
    }
    rotate(
        organization: T.Id,
        connection: T.Id,
        input: Pick<T.StorageInput, 'credentials'>,
        options?: RequestOptions,
    ): Promise<T.Data<T.StorageConnection>> {
        return this.http.request(
            'POST',
            orgPath(
                organization,
                `storage-connections/${segment(connection)}/rotate`,
            ),
            {},
            input,
            options,
        );
    }
    retire(
        organization: T.Id,
        connection: T.Id,
        options?: RequestOptions,
    ): Promise<T.StorageRetired> {
        return this.http.request(
            'POST',
            orgPath(
                organization,
                `storage-connections/${segment(connection)}/retire`,
            ),
            {},
            {},
            options,
        );
    }
}
export class StorageFiles {
    constructor(private readonly http: Transport) {}
    list(
        organization: T.Id,
        connection: T.Id,
        query: T.StorageQuery = {},
        options?: RequestOptions,
    ): Promise<T.Data<T.StorageListing>> {
        return this.http.request(
            'GET',
            orgPath(
                organization,
                `storage-connections/${segment(connection)}/files`,
            ),
            query,
            undefined,
            options,
        );
    }
    async *iteratePages(
        organization: T.Id,
        connection: T.Id,
        query: T.StorageQuery = {},
        options?: RequestOptions,
    ): AsyncGenerator<T.StorageListing> {
        const seen = new Set<string>();
        let cursor = query.cursor;
        if (cursor) seen.add(cursor);
        for (;;) {
            const { data } = await this.list(
                organization,
                connection,
                { ...query, ...(cursor == null ? {} : { cursor }) },
                options,
            );
            yield data;
            if (!data.next_cursor) return;
            if (seen.has(data.next_cursor))
                throw new ProtocolError(
                    'The API returned a repeated storage cursor.',
                );
            seen.add(data.next_cursor);
            cursor = data.next_cursor;
        }
    }
    metadata(
        organization: T.Id,
        connection: T.Id,
        query: T.StorageObjectQuery,
        options?: RequestOptions,
    ): Promise<T.Data<T.StorageFileMetadata>> {
        return this.http.request(
            'GET',
            orgPath(
                organization,
                `storage-connections/${segment(connection)}/files/metadata`,
            ),
            query,
            undefined,
            options,
        );
    }
    getDownloadUrl(
        organization: T.Id,
        connection: T.Id,
        query: T.StorageObjectQuery,
        options?: RequestOptions,
    ): Promise<string> {
        return this.http.request(
            'GET',
            orgPath(
                organization,
                `storage-connections/${segment(connection)}/files/download`,
            ),
            query,
            undefined,
            options,
            'redirect',
        );
    }
}
export class Exports {
    constructor(private readonly http: Transport) {}
    create(
        organization: T.Id,
        input: { asset_ids: T.Id[] },
        options?: RequestOptions,
    ): Promise<T.Data<T.ExportRecord>> {
        return this.http.request(
            'POST',
            orgPath(organization, 'exports'),
            {},
            input,
            options,
        );
    }
    get(
        organization: T.Id,
        id: T.Id,
        options?: RequestOptions,
    ): Promise<T.Data<T.ExportRecord>> {
        return this.http.request(
            'GET',
            orgPath(organization, `exports/${segment(id)}`),
            {},
            undefined,
            options,
        );
    }
    getDownloadUrl(
        organization: T.Id,
        id: T.Id,
        options?: RequestOptions,
    ): Promise<string> {
        return this.http.request(
            'GET',
            orgPath(organization, `exports/${segment(id)}/download`),
            {},
            undefined,
            options,
            'redirect',
        );
    }
}
export class Members {
    constructor(private readonly http: Transport) {}
    list(
        organization: T.Id,
        query: T.SearchQuery = {},
        options?: RequestOptions,
    ): Promise<T.MemberPage> {
        return this.http.request(
            'GET',
            orgPath(organization, 'members'),
            query,
            undefined,
            options,
        );
    }
    iterate(
        organization: T.Id,
        query: T.SearchQuery = {},
        options?: RequestOptions,
    ): AsyncGenerator<T.Member> {
        return this.http.iterate(
            orgPath(organization, 'members'),
            query,
            options,
        );
    }
    update(
        organization: T.Id,
        member: T.UserId,
        input: { role: T.Role },
        options?: RequestOptions,
    ): Promise<T.Data<T.Member>> {
        return this.http.request(
            'PATCH',
            orgPath(organization, `members/${segment(member)}`),
            {},
            input,
            options,
        );
    }
    delete(
        organization: T.Id,
        member: T.UserId,
        options?: RequestOptions,
    ): Promise<void> {
        return this.http.request(
            'DELETE',
            orgPath(organization, `members/${segment(member)}`),
            {},
            undefined,
            options,
        );
    }
}
export class Invitations {
    constructor(private readonly http: Transport) {}
    list(
        organization: T.Id,
        query: T.CursorQuery = {},
        options?: RequestOptions,
    ): Promise<T.FlatCursorPage<T.Invitation>> {
        return this.http.request(
            'GET',
            orgPath(organization, 'invitations'),
            query,
            undefined,
            options,
        );
    }
    iterate(
        organization: T.Id,
        query: T.CursorQuery = {},
        options?: RequestOptions,
    ): AsyncGenerator<T.Invitation> {
        return this.http.iterate(
            orgPath(organization, 'invitations'),
            query,
            options,
        );
    }
    create(
        organization: T.Id,
        input: { email: string; role: T.Role },
        options?: RequestOptions,
    ): Promise<T.Data<T.Invitation>> {
        return this.http.request(
            'POST',
            orgPath(organization, 'invitations'),
            {},
            input,
            options,
        );
    }
    delete(
        organization: T.Id,
        invitation: T.Id,
        options?: RequestOptions,
    ): Promise<void> {
        return this.http.request(
            'DELETE',
            orgPath(organization, `invitations/${segment(invitation)}`),
            {},
            undefined,
            options,
        );
    }
}
export class Tokens {
    constructor(private readonly http: Transport) {}
    list(
        organization: T.Id,
        query: T.CursorQuery = {},
        options?: RequestOptions,
    ): Promise<T.TokenPage> {
        return this.http.request(
            'GET',
            orgPath(organization, 'tokens'),
            query,
            undefined,
            options,
        );
    }
    iterate(
        organization: T.Id,
        query: T.CursorQuery = {},
        options?: RequestOptions,
    ): AsyncGenerator<T.TokenRecord> {
        return this.http.iterate(
            orgPath(organization, 'tokens'),
            query,
            options,
        );
    }
    create(
        organization: T.Id,
        input: T.TokenInput,
        options?: RequestOptions,
    ): Promise<T.TokenCreated> {
        return this.http.request(
            'POST',
            orgPath(organization, 'tokens'),
            {},
            input,
            options,
        );
    }
    update(
        organization: T.Id,
        token: T.Id,
        input: { ip_whitelist: string[] },
        options?: RequestOptions,
    ): Promise<T.Data<T.TokenRecord>> {
        return this.http.request(
            'PATCH',
            orgPath(organization, `tokens/${segment(token)}`),
            {},
            input,
            options,
        );
    }
    delete(
        organization: T.Id,
        token: T.Id,
        options?: RequestOptions,
    ): Promise<void> {
        return this.http.request(
            'DELETE',
            orgPath(organization, `tokens/${segment(token)}`),
            {},
            undefined,
            options,
        );
    }
}
export class ShareLinks {
    constructor(private readonly http: Transport) {}
    list(
        organization: T.Id,
        query: T.ShareQuery,
        options?: RequestOptions,
    ): Promise<T.CursorPage<T.ShareLink>> {
        return this.http.request(
            'GET',
            orgPath(organization, 'share-links'),
            query,
            undefined,
            options,
        );
    }
    iterate(
        organization: T.Id,
        query: T.ShareQuery,
        options?: RequestOptions,
    ): AsyncGenerator<T.ShareLink> {
        return this.http.iterate(
            orgPath(organization, 'share-links'),
            query,
            options,
        );
    }
    create(
        organization: T.Id,
        input: T.ShareInput,
        options?: RequestOptions,
    ): Promise<T.Data<T.ShareLink>> {
        return this.http.request(
            'POST',
            orgPath(organization, 'share-links'),
            {},
            input,
            options,
        );
    }
    get(
        organization: T.Id,
        shareLink: T.Id,
        options?: RequestOptions,
    ): Promise<T.Data<T.ShareLink>> {
        return this.http.request(
            'GET',
            orgPath(organization, `share-links/${segment(shareLink)}`),
            {},
            undefined,
            options,
        );
    }
    update(
        organization: T.Id,
        shareLink: T.Id,
        input: T.ShareUpdate,
        options?: RequestOptions,
    ): Promise<T.Data<T.ShareLink>> {
        return this.http.request(
            'PATCH',
            orgPath(organization, `share-links/${segment(shareLink)}`),
            {},
            input,
            options,
        );
    }
    revoke(
        organization: T.Id,
        shareLink: T.Id,
        options?: RequestOptions,
    ): Promise<T.Data<T.ShareLink>> {
        return this.http.request(
            'DELETE',
            orgPath(organization, `share-links/${segment(shareLink)}`),
            {},
            undefined,
            options,
        );
    }
}
export class TrashOperations {
    constructor(private readonly http: Transport) {}
    list(
        organization: T.Id,
        query: T.CursorQuery = {},
        options?: RequestOptions,
    ): Promise<T.CursorPage<T.TrashOperation>> {
        return this.http.request(
            'GET',
            orgPath(organization, 'trash-operations'),
            query,
            undefined,
            options,
        );
    }
    iterate(
        organization: T.Id,
        query: T.CursorQuery = {},
        options?: RequestOptions,
    ): AsyncGenerator<T.TrashOperation> {
        return this.http.iterate(
            orgPath(organization, 'trash-operations'),
            query,
            options,
        );
    }
    get(
        organization: T.Id,
        operation: T.Id,
        options?: RequestOptions,
    ): Promise<T.Data<T.TrashOperation>> {
        return this.http.request(
            'GET',
            orgPath(organization, `trash-operations/${segment(operation)}`),
            {},
            undefined,
            options,
        );
    }
    retry(
        organization: T.Id,
        operation: T.Id,
        options?: RequestOptions,
    ): Promise<T.Data<T.TrashOperation>> {
        return this.http.request(
            'POST',
            orgPath(
                organization,
                `trash-operations/${segment(operation)}/retry`,
            ),
            {},
            {},
            options,
        );
    }
}
