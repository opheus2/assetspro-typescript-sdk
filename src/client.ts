import * as R from './resources.js';
import { OrganizationClient } from './organization-client.js';
import { getPublicUrl } from './public-urls.js';
import {
    Transport,
    OperationError,
    abortScope,
    delay,
    segment,
    type ClientOptions,
    type RequestOptions,
} from './transport.js';
import {
    downloadStream,
    putSource,
    UploadError,
    validateSource,
    writeDownload,
    type TransferOptions,
    type UploadSource,
} from './streams.js';
import type * as T from './types.js';

export interface WaitOptions extends RequestOptions {
    intervalMs?: number;
    maxAttempts?: number;
}
export interface UploadOptions extends TransferOptions {
    wait?: boolean;
    waitOptions?: WaitOptions;
    onInitialized?: (upload: T.UploadRecord) => void;
}
export type UploadMetadata = Omit<
    T.UploadInput,
    'original_filename' | 'mime_type' | 'file_size'
>;

export function latestPublication(
    asset: Pick<T.Asset, 'active_revision' | 'publications'>,
): T.Publication | null {
    if (!asset.active_revision) return null;
    const candidates = (asset.publications ?? []).filter(
        (item) => item.asset_revision_id === asset.active_revision!.id,
    );
    return (
        candidates.sort(
            (a, b) =>
                b.created_at.localeCompare(a.created_at) ||
                b.id.localeCompare(a.id),
        )[0] ?? null
    );
}

async function waitUntil<TValue>(
    id: string,
    load: (options: RequestOptions) => Promise<TValue>,
    terminal: (value: TValue) => boolean,
    options: WaitOptions = {},
): Promise<TValue> {
    const interval = options.intervalMs ?? 1_000;
    const attempts = options.maxAttempts ?? 300;
    if (
        !Number.isFinite(interval) ||
        interval < 0 ||
        !Number.isInteger(attempts) ||
        attempts < 1 ||
        attempts > 10_000
    )
        throw new TypeError(
            'Wait interval must be nonnegative and maxAttempts must be between 1 and 10000.',
        );
    const scope = abortScope(options, 300_000);
    const deadline = Date.now() + (options.timeoutMs ?? 300_000);
    try {
        for (let attempt = 0; attempt < attempts; attempt++) {
            scope.signal.throwIfAborted();
            const value = await load({
                signal: scope.signal,
                timeoutMs: Math.max(1, deadline - Date.now()),
            });
            scope.signal.throwIfAborted();
            if (terminal(value)) return value;
            if (attempt + 1 < attempts) await delay(interval, scope.signal);
        }
        throw new OperationError(
            'The operation did not finish within the maximum polling attempts.',
            id,
            'wait_exhausted',
        );
    } finally {
        scope.dispose();
    }
}

export class AssetsPro {
    readonly organizations: R.Organizations;
    readonly uploaders: R.Uploaders;
    readonly assets: R.Assets;
    readonly publications: R.Publications;
    readonly brands: R.Taxonomies<T.Brand>;
    readonly brandRoles: R.Taxonomies;
    readonly categories: R.Taxonomies;
    readonly tags: R.Taxonomies;
    readonly collections: R.Collections;
    readonly uploads: R.Uploads;
    readonly storageConnections: R.StorageConnections;
    readonly storageFiles: R.StorageFiles;
    readonly exports: R.Exports;
    readonly members: R.Members;
    readonly invitations: R.Invitations;
    readonly tokens: R.Tokens;
    readonly shareLinks: R.ShareLinks;
    readonly trashOperations: R.TrashOperations;
    private readonly http: Transport;
    readonly #organizationId: T.Id | undefined;

    get organizationId(): T.Id | undefined {
        return this.#organizationId;
    }
    private requireOrganization(): T.Id {
        if (!this.#organizationId)
            throw new TypeError(
                'Provide organizationId at construction or call forOrganization(id).',
            );
        return this.#organizationId;
    }
    forOrganization(
        organizationId: T.Id = this.requireOrganization(),
    ): OrganizationClient {
        segment(organizationId);
        return new OrganizationClient(this, organizationId);
    }

    constructor(options: ClientOptions) {
        if (options.organizationId !== undefined)
            segment(options.organizationId);
        this.#organizationId = options.organizationId;
        this.http = new Transport(options);
        this.organizations = new R.Organizations(this.http);
        this.uploaders = new R.Uploaders(this.http);
        this.assets = new R.Assets(this.http);
        this.publications = new R.Publications(this.http);
        this.brands = new R.Taxonomies<T.Brand>(this.http, 'brands');
        this.brandRoles = new R.Taxonomies(this.http, 'brand-roles');
        this.categories = new R.Taxonomies(this.http, 'categories');
        this.tags = new R.Taxonomies(this.http, 'tags');
        this.collections = new R.Collections(this.http);
        this.uploads = new R.Uploads(this.http);
        this.storageConnections = new R.StorageConnections(this.http);
        this.storageFiles = new R.StorageFiles(this.http);
        this.exports = new R.Exports(this.http);
        this.members = new R.Members(this.http);
        this.invitations = new R.Invitations(this.http);
        this.tokens = new R.Tokens(this.http);
        this.shareLinks = new R.ShareLinks(this.http);
        this.trashOperations = new R.TrashOperations(this.http);
    }
    private resourceArguments<Options extends RequestOptions>(
        first: T.Id,
        second: T.Id | Options | undefined,
        third: Options | undefined,
    ): [T.Id, T.Id, Options | undefined] {
        return typeof second === 'string'
            ? [first, second, third]
            : [this.requireOrganization(), first, second];
    }
    private assetArguments(
        first: T.Id,
        second: T.Id | T.DownloadQuery | undefined,
        third: T.DownloadQuery | RequestOptions | undefined,
        fourth: RequestOptions | undefined,
    ): [T.Id, T.Id, T.DownloadQuery, RequestOptions] {
        return typeof second === 'string'
            ? [first, second, (third ?? {}) as T.DownloadQuery, fourth ?? {}]
            : [
                  this.requireOrganization(),
                  first,
                  second ?? {},
                  (third ?? {}) as RequestOptions,
              ];
    }
    getPublicUrls(asset: T.Id, options?: RequestOptions): Promise<T.PublicUrls>;
    getPublicUrls(
        organization: T.Id,
        asset: T.Id,
        options?: RequestOptions,
    ): Promise<T.PublicUrls>;
    getPublicUrls(
        first: T.Id,
        second?: T.Id | RequestOptions,
        third?: RequestOptions,
    ): Promise<T.PublicUrls> {
        return this.assets.getPublicUrls(
            ...this.resourceArguments(first, second, third),
        );
    }
    getPublicUrl(
        asset: T.Id,
        kind?: T.PublicUrlKind,
        options?: RequestOptions,
    ): Promise<string | null>;
    getPublicUrl(
        organization: T.Id,
        asset: T.Id,
        kind?: T.PublicUrlKind,
        options?: RequestOptions,
    ): Promise<string | null>;
    getPublicUrl(
        first: T.Id,
        second?: string,
        third?: T.PublicUrlKind | RequestOptions,
        fourth?: RequestOptions,
    ): Promise<string | null> {
        if (
            second === undefined ||
            ['auto', 'custom', 'provider'].includes(second)
        )
            return this.assets.getPublicUrl(
                this.requireOrganization(),
                first,
                (second ?? 'auto') as T.PublicUrlKind,
                typeof third === 'object' ? third : undefined,
            );
        return this.assets.getPublicUrl(
            first,
            second,
            typeof third === 'string' ? third : 'auto',
            fourth,
        );
    }
    getDownloadUrl(
        asset: T.Id,
        query?: T.DownloadQuery,
        options?: RequestOptions,
    ): Promise<string>;
    getDownloadUrl(
        organization: T.Id,
        asset: T.Id,
        query?: T.DownloadQuery,
        options?: RequestOptions,
    ): Promise<string>;
    getDownloadUrl(
        first: T.Id,
        second?: T.Id | T.DownloadQuery,
        third?: T.DownloadQuery | RequestOptions,
        fourth?: RequestOptions,
    ): Promise<string> {
        return this.assets.getDownloadUrl(
            ...this.assetArguments(first, second, third, fourth),
        );
    }
    /** Consume or cancel the returned stream to release its network resources. */
    download(
        asset: T.Id,
        query?: T.DownloadQuery,
        options?: RequestOptions,
    ): Promise<ReadableStream<Uint8Array>>;
    download(
        organization: T.Id,
        asset: T.Id,
        query?: T.DownloadQuery,
        options?: RequestOptions,
    ): Promise<ReadableStream<Uint8Array>>;
    async download(
        first: T.Id,
        second?: T.Id | T.DownloadQuery,
        third?: T.DownloadQuery | RequestOptions,
        fourth?: RequestOptions,
    ): Promise<ReadableStream<Uint8Array>> {
        const args = this.assetArguments(first, second, third, fourth);
        return downloadStream(
            this.http,
            await this.assets.getDownloadUrl(...args),
            args[3],
        );
    }
    downloadTo(
        asset: T.Id,
        destination: string | WritableStream<Uint8Array>,
        query?: T.DownloadQuery,
        options?: RequestOptions,
    ): Promise<void>;
    downloadTo(
        organization: T.Id,
        asset: T.Id,
        destination: string | WritableStream<Uint8Array>,
        query?: T.DownloadQuery,
        options?: RequestOptions,
    ): Promise<void>;
    async downloadTo(
        first: T.Id,
        second: string | WritableStream<Uint8Array>,
        third?: string | WritableStream<Uint8Array> | T.DownloadQuery,
        fourth?: T.DownloadQuery | RequestOptions,
        fifth?: RequestOptions,
    ): Promise<void> {
        const explicit =
            typeof third === 'string' || third instanceof WritableStream;
        const organization = explicit ? first : this.requireOrganization();
        const asset = explicit ? (second as T.Id) : first;
        const destination = explicit
            ? (third as string | WritableStream<Uint8Array>)
            : second;
        const query = (explicit ? fourth : third) as
            | T.DownloadQuery
            | undefined;
        const options = explicit
            ? fifth
            : (fourth as RequestOptions | undefined);
        await writeDownload(
            await this.download(organization, asset, query, options),
            destination,
        );
    }
    upload(
        source: UploadSource,
        metadata?: UploadMetadata,
        options?: UploadOptions,
    ): Promise<T.UploadRecord>;
    upload(
        organization: T.Id,
        source: UploadSource,
        metadata?: UploadMetadata,
        options?: UploadOptions,
    ): Promise<T.UploadRecord>;
    upload(
        first: T.Id | UploadSource,
        second?: UploadSource | UploadMetadata,
        third?: UploadMetadata | UploadOptions,
        fourth?: UploadOptions,
    ): Promise<T.UploadRecord> {
        return typeof first === 'string'
            ? this.uploadExplicit(
                  first,
                  second as UploadSource,
                  third as UploadMetadata | undefined,
                  fourth,
              )
            : this.uploadExplicit(
                  this.requireOrganization(),
                  first,
                  second as UploadMetadata | undefined,
                  third as UploadOptions | undefined,
              );
    }
    retryUpload(
        upload: T.Id,
        source?: UploadSource,
        options?: UploadOptions,
    ): Promise<T.UploadRecord>;
    retryUpload(
        organization: T.Id,
        upload: T.Id,
        source?: UploadSource,
        options?: UploadOptions,
    ): Promise<T.UploadRecord>;
    retryUpload(
        first: T.Id,
        second?: T.Id | UploadSource,
        third?: UploadSource | UploadOptions,
        fourth?: UploadOptions,
    ): Promise<T.UploadRecord> {
        return typeof second === 'string'
            ? this.retryUploadExplicit(
                  first,
                  second,
                  third as UploadSource | undefined,
                  fourth,
              )
            : this.retryUploadExplicit(
                  this.requireOrganization(),
                  first,
                  second,
                  third as UploadOptions | undefined,
              );
    }
    private async uploadExplicit(
        organization: T.Id,
        source: UploadSource,
        metadata: UploadMetadata = {},
        options: UploadOptions = {},
    ): Promise<T.UploadRecord> {
        validateSource(source);
        const initialized = await this.uploads.create(
            organization,
            {
                ...metadata,
                original_filename: source.name,
                mime_type: source.mimeType,
                file_size: source.size,
            },
            options,
        );
        try {
            options.onInitialized?.(initialized.data);
        } catch (error) {
            throw new UploadError(
                'The upload initialization callback failed before transfer.',
                initialized.data.id,
                'transfer',
                error,
            );
        }
        return this.finishUpload(organization, initialized, source, options);
    }
    private async retryUploadExplicit(
        organization: T.Id,
        upload: T.Id,
        source?: UploadSource,
        options: UploadOptions = {},
    ): Promise<T.UploadRecord> {
        // Check the old source metadata before requesting a new signed authorization.
        const previous = (await this.uploads.get(organization, upload, options))
            .data;
        if (!source && !previous.asset_revision_id)
            throw new UploadError(
                'This retry needs the original source stream.',
                previous.id,
                'transfer',
                undefined,
            );
        if (source) {
            validateSource(source);
            if (
                previous.original_filename !== source.name ||
                previous.file_size !== source.size ||
                previous.mime_type !== source.mimeType
            )
                throw new TypeError(
                    'The retry source must match the original upload filename, size, and MIME type.',
                );
        }
        const retried = await this.uploads.retry(organization, upload, options);
        if (retried.authorization) {
            if (!source)
                throw new UploadError(
                    'This retry needs the original source stream.',
                    retried.data.id,
                    'transfer',
                    undefined,
                );
            return this.finishUpload(
                organization,
                { data: retried.data, authorization: retried.authorization },
                source,
                options,
            );
        }
        return options.wait
            ? this.waitForUpload(
                  organization,
                  retried.data.id,
                  this.uploadWaitOptions(options),
              )
            : retried.data;
    }
    private uploadWaitOptions(options: UploadOptions): WaitOptions {
        return {
            ...options.waitOptions,
            ...(options.signal ? { signal: options.signal } : {}),
        };
    }
    private async finishUpload(
        organization: T.Id,
        initialized: T.UploadInitialized,
        source: UploadSource,
        options: UploadOptions,
    ): Promise<T.UploadRecord> {
        try {
            await putSource(
                this.http,
                initialized.authorization,
                source,
                options,
            );
        } catch (error) {
            options.signal?.throwIfAborted();
            throw new UploadError(
                'The file transfer could not be confirmed. Use this upload ID to inspect or retry it.',
                initialized.data.id,
                'transfer',
                error,
            );
        }
        let completed: T.UploadRecord;
        try {
            completed = (
                await this.uploads.complete(
                    organization,
                    initialized.data.id,
                    options,
                )
            ).data;
        } catch (error) {
            options.signal?.throwIfAborted();
            throw new UploadError(
                'The transfer finished, but completion could not be confirmed. Retry completion with this upload ID before sending the file again.',
                initialized.data.id,
                'complete',
                error,
            );
        }
        return options.wait
            ? this.waitForUpload(
                  organization,
                  completed.id,
                  this.uploadWaitOptions(options),
              )
            : completed;
    }
    waitForUpload(id: T.Id, options?: WaitOptions): Promise<T.UploadRecord>;
    waitForUpload(
        organization: T.Id,
        id: T.Id,
        options?: WaitOptions,
    ): Promise<T.UploadRecord>;
    waitForUpload(
        first: T.Id,
        second?: T.Id | WaitOptions,
        third?: WaitOptions,
    ): Promise<T.UploadRecord> {
        return this.waitForUploadExplicit(
            ...this.resourceArguments(first, second, third),
        );
    }
    private waitForUploadExplicit(
        organization: T.Id,
        upload: T.Id,
        options: WaitOptions = {},
    ): Promise<T.UploadRecord> {
        return waitUntil(
            upload,
            async (request) =>
                (await this.uploads.get(organization, upload, request)).data,
            (value) => {
                if (value.processing_status === 'ready') return true;
                if (
                    value.processing_status === 'failed' ||
                    ['failed', 'cancelled', 'expired'].includes(value.status)
                )
                    throw this.http.operationError(
                        value.error_message ??
                            'The upload did not complete successfully.',
                        upload,
                        value.failure_code,
                    );
                return false;
            },
            options,
        );
    }
    waitForAsset(id: T.Id, options?: WaitOptions): Promise<T.Asset>;
    waitForAsset(
        organization: T.Id,
        id: T.Id,
        options?: WaitOptions,
    ): Promise<T.Asset>;
    waitForAsset(
        first: T.Id,
        second?: T.Id | WaitOptions,
        third?: WaitOptions,
    ): Promise<T.Asset> {
        return this.waitForAssetExplicit(
            ...this.resourceArguments(first, second, third),
        );
    }
    private waitForAssetExplicit(
        organization: T.Id,
        asset: T.Id,
        options: WaitOptions = {},
    ): Promise<T.Asset> {
        return waitUntil(
            asset,
            async (request) =>
                (await this.assets.get(organization, asset, request)).data,
            (value) => {
                const revision =
                    value.pending_revision ?? value.active_revision;
                if (value.deleted_at || value.archived_at)
                    throw this.http.operationError(
                        'The asset is no longer active.',
                        asset,
                        'asset_unavailable',
                    );
                if (revision?.status === 'failed' || value.status === 'failed')
                    throw this.http.operationError(
                        revision?.error_message ?? 'Asset processing failed.',
                        asset,
                        revision?.failure_code,
                    );
                return revision?.status === 'ready' && !value.pending_revision;
            },
            options,
        );
    }
    waitForPublication(id: T.Id, options?: WaitOptions): Promise<T.Asset>;
    waitForPublication(
        organization: T.Id,
        id: T.Id,
        options?: WaitOptions,
    ): Promise<T.Asset>;
    waitForPublication(
        first: T.Id,
        second?: T.Id | WaitOptions,
        third?: WaitOptions,
    ): Promise<T.Asset> {
        return this.waitForPublicationExplicit(
            ...this.resourceArguments(first, second, third),
        );
    }
    private waitForPublicationExplicit(
        organization: T.Id,
        asset: T.Id,
        options: WaitOptions = {},
    ): Promise<T.Asset> {
        return waitUntil(
            asset,
            async (request) =>
                (await this.assets.get(organization, asset, request)).data,
            (value) => {
                if (value.deleted_at || value.archived_at)
                    throw this.http.operationError(
                        'The asset is no longer available for publication.',
                        asset,
                        'asset_unavailable',
                    );
                const publication = latestPublication(value);
                if (publication?.error_message)
                    throw this.http.operationError(
                        publication.error_message,
                        publication.id,
                        'publication_failed',
                    );
                if (
                    publication &&
                    ['failed', 'revoked', 'cancelled'].includes(
                        publication.status,
                    )
                )
                    throw this.http.operationError(
                        'Publication ended without a public URL.',
                        publication.id,
                        publication.status,
                    );
                return getPublicUrl(value) !== null;
            },
            options,
        );
    }
    waitForExport(id: T.Id, options?: WaitOptions): Promise<T.ExportRecord>;
    waitForExport(
        organization: T.Id,
        id: T.Id,
        options?: WaitOptions,
    ): Promise<T.ExportRecord>;
    waitForExport(
        first: T.Id,
        second?: T.Id | WaitOptions,
        third?: WaitOptions,
    ): Promise<T.ExportRecord> {
        return this.waitForExportExplicit(
            ...this.resourceArguments(first, second, third),
        );
    }
    private waitForExportExplicit(
        organization: T.Id,
        id: T.Id,
        options: WaitOptions = {},
    ): Promise<T.ExportRecord> {
        return waitUntil(
            id,
            async (request) =>
                (await this.exports.get(organization, id, request)).data,
            (value) => {
                if (value.status === 'failed' || value.status === 'expired')
                    throw this.http.operationError(
                        value.error_message ?? 'The export is unavailable.',
                        id,
                        value.failure_code,
                    );
                return value.status === 'ready';
            },
            options,
        );
    }
    waitForTrashOperation(
        id: T.Id,
        options?: WaitOptions,
    ): Promise<T.TrashOperation>;
    waitForTrashOperation(
        organization: T.Id,
        id: T.Id,
        options?: WaitOptions,
    ): Promise<T.TrashOperation>;
    waitForTrashOperation(
        first: T.Id,
        second?: T.Id | WaitOptions,
        third?: WaitOptions,
    ): Promise<T.TrashOperation> {
        return this.waitForTrashOperationExplicit(
            ...this.resourceArguments(first, second, third),
        );
    }
    private waitForTrashOperationExplicit(
        organization: T.Id,
        operation: T.Id,
        options: WaitOptions = {},
    ): Promise<T.TrashOperation> {
        return waitUntil(
            operation,
            async (request) =>
                (
                    await this.trashOperations.get(
                        organization,
                        operation,
                        request,
                    )
                ).data,
            (value) => {
                if (
                    value.status === 'failed' ||
                    (value.status === 'completed' && value.failed > 0)
                )
                    throw this.http.operationError(
                        value.error_message ??
                            'Some files could not be processed.',
                        operation,
                        value.error_code,
                    );
                return value.status === 'completed';
            },
            options,
        );
    }
}
