export type Id = string;
export type UserId = number;
export type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [key: string]: JsonValue };
export type Metadata = Record<string, JsonValue> | JsonValue[];
export type Role = 'Owner' | 'Manager' | 'Editor' | 'Viewer';
export type ProcessingStatus = 'processing' | 'ready' | 'failed';
export type PublicationStatus =
    | 'pending'
    | 'publishing'
    | 'published'
    | 'revoking'
    | 'revoked'
    | 'failed'
    | 'cancelled';
export interface Data<T> {
    data: T;
}
export interface Message {
    message: string;
}
export interface CursorQuery {
    cursor?: string | null;
    per_page?: number;
}
export interface SearchQuery extends CursorQuery {
    q?: string | null;
}
export interface CursorPage<T> extends Data<T[]> {
    links: {
        first?: string | null;
        last?: string | null;
        next: string | null;
        prev: string | null;
    };
    meta: {
        path: string;
        per_page: number;
        next_cursor: string | null;
        prev_cursor: string | null;
    };
}
export interface FlatPagination {
    next_cursor: string | null;
    prev_cursor: string | null;
    next_page_url: string | null;
    prev_page_url: string | null;
}
export interface FlatCursorPage<T> extends Data<T[]>, FlatPagination {}
export interface OffsetPage<T> extends Data<T[]> {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    next_page_url: string | null;
    prev_page_url: string | null;
    first_page_url: string;
    last_page_url: string;
    path: string;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
}
export interface Organization {
    id: Id;
    name: string;
    slug: string;
    role: Role;
    storage_ready: boolean;
    publication_ready: boolean;
}
export interface Uploader {
    id: UserId;
    name: string;
}
export interface Taxonomy {
    id: Id;
    name: string;
    slug: string | null;
    description: string | null;
    website?: string | null;
    metadata: Metadata;
    archived_at: string | null;
    assets_count?: number;
}
export interface Brand extends Taxonomy {
    logo_url: string | null;
}
export interface Collection extends Taxonomy {
    deleted_at: string | null;
    purge_eligible_at: string | null;
    restore_available: boolean;
    can_restore: boolean;
    active_operation_id: Id | null;
    trash_operation_id: Id | null;
    last_activity_at: string | null;
}
export interface TaxonomyInput {
    name: string;
    description?: string | null;
    website?: string | null;
    metadata?: Metadata | null;
    archived_at?: string | null;
}
export type TaxonomyUpdate = Partial<TaxonomyInput>;
export interface TaxonomyQuery extends SearchQuery {
    archived?: boolean;
}
export interface CollectionQuery extends TaxonomyQuery {
    trash?: boolean;
}
export type UploadQuery = Pick<CursorQuery, 'cursor'>;
export interface Variant {
    id: Id;
    type: string;
    mime_type: string;
    width: number | null;
    height: number | null;
    file_size: number;
    metadata: Metadata;
    download_url: string;
}
export interface Revision {
    id: Id;
    original_filename: string;
    extension: string;
    mime_type: string;
    media_type: 'image' | 'document';
    file_size: number;
    width: number | null;
    height: number | null;
    aspect_ratio: number | string | null;
    dominant_color: string | null;
    checksum: string | null;
    metadata: Metadata;
    status: ProcessingStatus;
    failure_code: string | null;
    error_message: string | null;
    created_at: string;
    download_url: string | null;
    variants?: Variant[];
}
export interface Publication {
    id: Id;
    asset_revision_id: Id;
    created_at: string;
    status: PublicationStatus;
    published_at: string | null;
    cache_expires_at: string | null;
    error_message: string | null;
}
export interface PublicUrls {
    custom_url: string | null;
    default_url: string | null;
}
export type PublicUrlKind = 'auto' | 'custom' | 'provider';
export interface Asset {
    id: Id;
    name: string;
    description: string | null;
    alt_text: string | null;
    status: ProcessingStatus;
    metadata: Metadata;
    archived_at: string | null;
    deleted_at: string | null;
    lifecycle_version: number;
    purge_started_at: string | null;
    purge_eligible_at: string | null;
    restore_available: boolean;
    created_at: string;
    updated_at: string;
    brand?: Brand | null;
    brand_role?: Taxonomy | null;
    categories?: Taxonomy[];
    tags?: Taxonomy[];
    collections?: Collection[];
    uploaded_by?: Uploader | null;
    active_revision?: Revision | null;
    pending_revision?: Revision | null;
    revisions?: Revision[];
    revisions_url: string;
    thumbnail_url: string | null;
    preview_url: string | null;
    download_url: string | null;
    publication_url: string | null;
    publication_urls: PublicUrls;
    publications?: Publication[];
}
export interface AssetQuery extends SearchQuery {
    /** A brand ID, or the literal "none" to select assets without a brand. */
    brand_id?: Id | null;
    brand_role_id?: Id | null;
    category_ids?: Id[];
    tag_ids?: Id[];
    collection_ids?: Id[];
    media_type?: 'image' | 'document' | null;
    extension?: string | null;
    uploaded_by?: UserId | null;
    created_from?: string | null;
    created_to?: string | null;
    min_width?: number | null;
    max_width?: number | null;
    min_height?: number | null;
    max_height?: number | null;
    status?: ProcessingStatus | null;
    sort?: 'newest' | 'oldest' | 'name' | 'name_desc' | null;
    view?: 'grid' | 'list';
    archived?: boolean;
    trash?: boolean;
}
export interface AssetUpdate {
    name?: string;
    description?: string | null;
    alt_text?: string | null;
    metadata?: Metadata | null;
    brand_id?: Id | null;
    brand_role_id?: Id | null;
    category_ids?: Id[];
    tag_ids?: Id[];
    collection_ids?: Id[];
}
export type AssetBulkInput = { asset_ids: Id[] } & (
    | { action: 'assign_brand'; brand_id: Id }
    | { action: 'remove_brand' | 'archive' | 'delete' | 'restore' }
    | {
          action:
              | 'add_categories'
              | 'remove_categories'
              | 'add_tags'
              | 'remove_tags'
              | 'add_collections'
              | 'remove_collections';
          ids: Id[];
      }
);
export interface DownloadQuery {
    revision?: Id;
    variant?: Id;
    inline?: boolean;
}
export interface PublicationCreated {
    id: Id;
    asset_id: Id;
    revision_id: Id;
    status: PublicationStatus;
    public_url: string | null;
    created_at: string;
}
export interface UploadInput extends Omit<AssetUpdate, 'metadata' | 'name'> {
    name?: string | null;
    original_filename: string;
    mime_type: string;
    file_size: number;
    target_asset_id?: Id | null;
    publish_after_processing?: boolean;
}
export interface UploadRecord {
    id: Id;
    organization_id: Id;
    status: 'uploading' | 'completed' | 'cancelled' | 'expired' | 'failed';
    original_filename: string;
    file_size: number;
    mime_type: string;
    asset_id: Id | null;
    asset_revision_id: Id | null;
    publish_after_processing: boolean;
    publication_status: PublicationStatus | null;
    publication_error: string | null;
    processing_status: ProcessingStatus | null;
    failure_code: string | null;
    error_message: string | null;
    expires_at: string;
    created_at: string;
}
export interface UploadAuthorization {
    url: string;
    method: 'PUT';
    headers: Record<string, string>;
    expires_at?: string;
}
export interface UploadInitialized extends Data<UploadRecord> {
    authorization: UploadAuthorization;
}
export interface UploadRetried extends Data<UploadRecord> {
    authorization?: UploadAuthorization;
}
export interface UploadStatusBatch extends Data<UploadRecord[]> {
    missing_ids: Id[];
}
export interface StorageInput {
    name: string;
    provider: 'aws' | 'r2' | 's3';
    endpoint?: string | null;
    region: string;
    private_bucket: string;
    publication_bucket?: string | null;
    cdn_url?: string | null;
    default_public_url?: string | null;
    use_path_style_endpoint: boolean;
    credentials: { key: string; secret: string };
}
export interface StorageConnection extends Omit<StorageInput, 'credentials'> {
    id: Id;
    credentials_configured: boolean;
    is_active: boolean;
    verified_at: string | null;
    publication_verified_at: string | null;
    retired_at: string | null;
    last_error_code: string | null;
}
export interface StorageRetired extends Data<StorageConnection | null> {
    deleted: boolean;
}
export interface StorageQuery {
    bucket?: 'private' | 'publication';
    prefix?: string;
    cursor?: string | null;
}
export interface StorageObjectQuery {
    bucket?: 'private' | 'publication';
    key: string;
}
export interface StorageFile {
    key: string;
    name: string;
    size: number;
    last_modified: string | null;
    etag: string | null;
}
export interface StorageFileMetadata extends StorageFile {
    mime_type: string | null;
}
export interface StorageListing {
    files: StorageFile[];
    directories: { key: string; name: string }[];
    prefix: string;
    bucket: string;
    next_cursor: string | null;
}
export interface ExportRecord {
    id: Id;
    status: 'queued' | 'processing' | 'ready' | 'failed' | 'expired';
    file_size: number | null;
    expires_at: string | null;
    failure_code: string | null;
    error_message: string | null;
    download_url: string | null;
}
export interface Member extends Uploader {
    email: string;
    role: Role;
}
export interface Invitation {
    id: Id;
    email: string;
    role: Role;
    created_at?: string;
    expires_at: string;
}
export interface MemberPage extends FlatCursorPage<Member> {
    roles: Role[];
    invitations: Invitation[];
    invitations_pagination: FlatPagination;
}
export interface TokenRecord {
    id: Id;
    name: string;
    abilities: string[];
    ip_whitelist: string[];
    expires_at: string | null;
    created_at?: string;
    last_used_at?: string | null;
}
export interface TokenPage extends FlatCursorPage<TokenRecord> {
    permissions: string[];
}
export interface TokenInput {
    name: string;
    abilities: string[];
    ip_whitelist?: string[];
    expires_at?: string | null;
}
export interface TokenCreated extends Data<TokenRecord> {
    token: string;
}
export type ShareTarget =
    | { asset_id: Id; collection_id?: never }
    | { collection_id: Id; asset_id?: never };
export type SharePassword =
    | { password_action?: 'keep' | 'remove'; password?: never }
    | { password_action: 'set'; password: string };
export type ShareUpdate = {
    name?: string;
    allow_downloads?: boolean;
    expires_at?: string | null;
} & SharePassword;
export type ShareInput = ShareTarget & ShareUpdate & { name: string };
export type ShareQuery = CursorQuery & ShareTarget;
export interface ShareLink {
    id: Id;
    name: string;
    url: string;
    allow_downloads: boolean;
    password_protected: boolean;
    expires_at: string | null;
    revoked_at: string | null;
    status: 'active' | 'expired' | 'revoked' | 'unavailable';
    created_at: string;
    updated_at: string;
    asset_id: Id | null;
    collection_id: Id | null;
    access_version: number;
}
export type CollectionAction = 'trash' | 'restore';
export interface CollectionActionInput {
    include_assets?: boolean;
    request_id?: string | null;
}
export interface CollectionBulkInput extends CollectionActionInput {
    collection_ids: Id[];
    action: CollectionAction;
}
export interface CollectionPreview {
    collection_count: number;
    asset_count: number;
    eligible_asset_count: number;
    shared_asset_count: number;
    unavailable_asset_count: number;
}
export interface CollectionResolved extends Data<Collection> {
    created: boolean;
}
export interface CollectionApplied {
    operation: TrashOperation | null;
    collection_count: number;
    asset_count: number;
}
export interface TrashOperation {
    id: Id;
    action: CollectionAction;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    collection_ids: Id[];
    total: number;
    processed: number;
    changed: number;
    skipped: number;
    failed: number;
    error_code: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
    can_retry: boolean;
}
