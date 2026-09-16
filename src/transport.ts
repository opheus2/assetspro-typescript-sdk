import { defaultStorageFetch } from './storage-fetch.js';

export type Fetch = (
    input: string | URL | Request,
    init?: RequestInit,
) => Promise<Response>;
export interface RequestOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}
export interface ClientOptions {
    baseUrl: string;
    token: string;
    organizationId?: string;
    fetch?: Fetch;
    storageFetch?: Fetch;
    timeoutMs?: number;
    readRetries?: number;
    maxRetryDelayMs?: number;
}
export type Query = object;
export type ResponseKind = 'json' | 'text' | 'redirect';

export class AssetsProError extends Error {
    override name = 'AssetsProError';
}
export class ApiError extends AssetsProError {
    override name = 'ApiError';
    constructor(
        message: string,
        public readonly status: number,
        public readonly code: string | undefined,
        public readonly errors: Record<string, string[]>,
        public readonly payload: Record<string, unknown>,
        public readonly retryAfterMs: number | undefined,
    ) {
        super(message);
    }
}
export class TransportError extends AssetsProError {
    override name = 'TransportError';
}
export class ProtocolError extends AssetsProError {
    override name = 'ProtocolError';
}
export class OperationError extends AssetsProError {
    override name = 'OperationError';
    constructor(
        message: string,
        public readonly operationId: string,
        public readonly code?: string | null,
    ) {
        super(redact(message) as string);
    }
}

export function queryString(query: Query = {}): string {
    const values = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        const add = (name: string, item: unknown) => {
            if (typeof item === 'boolean')
                values.append(name, item ? '1' : '0');
            else if (
                typeof item === 'string' ||
                (typeof item === 'number' && Number.isFinite(item))
            )
                values.append(name, String(item));
            else
                throw new TypeError(
                    'Query values must be strings, finite numbers, booleans, or arrays of them.',
                );
        };
        if (Array.isArray(value))
            value.forEach((item) => add(`${key}[]`, item));
        else add(key, value);
    }
    return values.toString();
}

export function retryAfterMilliseconds(
    value: string | null,
    now = Date.now(),
): number | undefined {
    if (!value?.trim()) return undefined;
    const result = /^\d+$/.test(value.trim())
        ? Number(value) * 1000
        : Date.parse(value) - now;
    return Number.isFinite(result) ? Math.max(0, result) : undefined;
}

function secretValues(value: unknown): string[] {
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([key, item]) =>
        /^(token|password|secret|credentials|authorization|key|access_token|refresh_token)$/i.test(
            key,
        )
            ? typeof item === 'string'
                ? [item]
                : secretValues(item)
            : typeof item === 'object'
              ? secretValues(item)
              : [],
    );
}
export function redact(value: unknown, secrets: string[] = []): unknown {
    if (typeof value === 'string') {
        let text = value.replace(/https?:\/\/[^\s"'<>]+/gi, '[redacted URL]');
        for (const secret of secrets)
            if (secret) text = text.split(secret).join('[redacted]');
        return text;
    }
    if (Array.isArray(value)) return value.map((item) => redact(item, secrets));
    if (value && typeof value === 'object')
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
                key,
                key === 'errors' &&
                item &&
                typeof item === 'object' &&
                !Array.isArray(item)
                    ? Object.fromEntries(
                          Object.entries(item).map(([field, messages]) => [
                              field,
                              redact(messages, secrets),
                          ]),
                      )
                    : /token|password|secret|credentials|authorization|signature/i.test(
                            key,
                        )
                      ? '[redacted]'
                      : redact(item, secrets),
            ]),
        );
    return value;
}

export function httpUrl(value: string | URL): URL {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new TypeError('Expected a valid HTTP(S) URL.');
    }
    if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.hash
    )
        throw new TypeError(
            'Expected an HTTP(S) URL without embedded credentials or fragments.',
        );
    return url;
}
export function resolveStorageLocation(
    location: string,
    base: string | URL,
): string {
    try {
        if (location !== location.trim()) throw new Error();
        const resolved = new URL(location, base);
        httpUrl(resolved);
        return /^[a-z][a-z\d+.-]*:/i.test(location)
            ? location
            : resolved.toString();
    } catch {
        throw new ProtocolError(
            'The download response contained an invalid storage URL.',
        );
    }
}
export function segment(value: string | number): string {
    if (
        value === '' ||
        value === '.' ||
        value === '..' ||
        (typeof value === 'number' && !Number.isSafeInteger(value))
    )
        throw new TypeError('A valid resource ID is required.');
    return encodeURIComponent(String(value));
}
export function abortScope(
    options: RequestOptions,
    fallbackMs: number,
): { signal: AbortSignal; dispose: () => void } {
    const timeoutMs = options.timeoutMs ?? fallbackMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
        throw new TypeError('timeoutMs must be a positive finite number.');
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
        () =>
            controller.abort(
                new DOMException('The operation timed out.', 'TimeoutError'),
            ),
        timeoutMs,
    );
    return {
        signal: controller.signal,
        dispose: () => {
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', abort);
        },
    };
}
export function delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const abort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            reject(signal.reason);
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', abort);
            resolve();
        }, ms);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
    });
}
async function boundedText(
    response: Response,
    maximum = 16 * 1024 * 1024,
): Promise<string> {
    if (!response.body) return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0,
        text = '';
    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > maximum) {
                await reader.cancel();
                throw new ProtocolError(
                    'Response exceeded the supported JSON/text size.',
                );
            }
            text += decoder.decode(chunk.value, { stream: true });
        }
        return text + decoder.decode();
    } finally {
        reader.releaseLock();
    }
}

export class Transport {
    readonly base: URL;
    readonly timeoutMs: number;
    readonly storageFetch: Fetch;
    private readonly fetch: Fetch;
    readonly #token: string;
    private readonly retries: number;
    private readonly maxRetryDelay: number;
    operationError(
        message: string,
        id: string,
        code?: string | null,
    ): OperationError {
        return new OperationError(
            redact(message, [this.#token]) as string,
            redact(id, [this.#token]) as string,
            code == null ? code : (redact(code, [this.#token]) as string),
        );
    }
    constructor(options: ClientOptions) {
        this.base = httpUrl(options.baseUrl);
        if (this.base.search)
            throw new TypeError('baseUrl cannot contain a query.');
        this.base.pathname =
            this.base.pathname.replace(/\/$/, '').replace(/\/api\/v1$/, '') +
            '/api/v1/';
        if (!options.token || /[\r\n]/.test(options.token))
            throw new TypeError('A nonempty bearer token is required.');
        this.#token = options.token;
        this.fetch = options.fetch ?? globalThis.fetch;
        this.storageFetch = options.storageFetch ?? defaultStorageFetch;
        this.timeoutMs = options.timeoutMs ?? 60_000;
        this.retries = options.readRetries ?? 2;
        this.maxRetryDelay = options.maxRetryDelayMs ?? 30_000;
        if (
            !Number.isInteger(this.retries) ||
            this.retries < 0 ||
            this.retries > 10
        )
            throw new TypeError('readRetries must be between 0 and 10.');
        if (!Number.isFinite(this.maxRetryDelay) || this.maxRetryDelay < 0)
            throw new TypeError(
                'maxRetryDelayMs must be nonnegative and finite.',
            );
    }
    url(path: string, query: Query = {}): URL {
        let url: URL;
        try {
            url = new URL(path, this.base);
        } catch {
            throw new ProtocolError('The API returned an invalid request URL.');
        }
        if (
            url.origin !== this.base.origin ||
            !url.pathname.startsWith(this.base.pathname) ||
            url.username ||
            url.password ||
            url.hash
        )
            throw new ProtocolError(
                'Refused an API request outside the configured API origin and path.',
            );
        const parameters = queryString(query);
        if (parameters) url.search = parameters;
        return url;
    }
    async request<T>(
        method: string,
        path: string,
        query: Query = {},
        body?: unknown,
        options: RequestOptions = {},
        kind: ResponseKind = 'json',
    ): Promise<T> {
        const url = this.url(path, query);
        const scope = abortScope(options, this.timeoutMs);
        const secrets = [this.#token, ...secretValues(body)];
        const safeRead = method === 'GET' || method === 'HEAD';
        try {
            for (let attempt = 0; ; attempt++) {
                scope.signal.throwIfAborted();
                let response: Response;
                try {
                    response = await this.fetch(url, {
                        method,
                        headers: {
                            Accept: 'application/json',
                            Authorization: `Bearer ${this.#token}`,
                            ...(body === undefined
                                ? {}
                                : { 'Content-Type': 'application/json' }),
                        },
                        ...(body === undefined
                            ? {}
                            : { body: JSON.stringify(body) }),
                        redirect: 'manual',
                        credentials: 'omit',
                        signal: scope.signal,
                    });
                } catch {
                    scope.signal.throwIfAborted();
                    if (safeRead && attempt < this.retries) {
                        await delay(
                            Math.min(250 * 2 ** attempt, this.maxRetryDelay),
                            scope.signal,
                        );
                        continue;
                    }
                    throw new TransportError(
                        'The API request failed before a response was received.',
                    );
                }
                const retryAfter = retryAfterMilliseconds(
                    response.headers.get('Retry-After'),
                );
                const retryDelay = retryAfter ?? 250 * 2 ** attempt;
                if (
                    safeRead &&
                    attempt < this.retries &&
                    [408, 429, 500, 502, 503, 504].includes(response.status) &&
                    retryDelay <= this.maxRetryDelay
                ) {
                    await response.body?.cancel();
                    await delay(retryDelay, scope.signal);
                    continue;
                }
                if (
                    kind === 'redirect' &&
                    [301, 302, 303, 307, 308].includes(response.status)
                ) {
                    const location = response.headers.get('Location');
                    await response.body?.cancel();
                    if (!location)
                        throw new ProtocolError(
                            'Download response did not include a Location header.',
                        );
                    return resolveStorageLocation(location, url) as T;
                }
                if (response.status === 204 && kind === 'json')
                    return undefined as T;
                let text: string;
                try {
                    text = await boundedText(
                        response,
                        response.ok ? undefined : 64 * 1024,
                    );
                } catch (error) {
                    scope.signal.throwIfAborted();
                    if (error instanceof ProtocolError) throw error;
                    throw new TransportError(
                        'The API response was interrupted.',
                    );
                }
                let payload: unknown;
                try {
                    payload = text ? JSON.parse(text) : {};
                } catch {
                    payload = {};
                }
                if (!response.ok) {
                    const safe = redact(payload, secrets) as Record<
                        string,
                        unknown
                    >;
                    const fields =
                        safe && typeof safe === 'object' && !Array.isArray(safe)
                            ? safe
                            : {};
                    const errors: Record<string, string[]> = {};
                    if (fields.errors && typeof fields.errors === 'object')
                        for (const [key, values] of Object.entries(
                            fields.errors,
                        ))
                            if (Array.isArray(values))
                                errors[key] = values.filter(
                                    (value): value is string =>
                                        typeof value === 'string',
                                );
                    const nested =
                        fields.error && typeof fields.error === 'object'
                            ? (fields.error as Record<string, unknown>)
                            : {};
                    throw new ApiError(
                        typeof fields.message === 'string'
                            ? fields.message
                            : typeof nested.message === 'string'
                              ? nested.message
                              : `API request failed (HTTP ${response.status}).`,
                        response.status,
                        typeof fields.code === 'string'
                            ? fields.code
                            : typeof nested.code === 'string'
                              ? nested.code
                              : undefined,
                        errors,
                        fields,
                        retryAfter,
                    );
                }
                if (kind === 'redirect')
                    throw new ProtocolError(
                        'Expected a redirect from the download endpoint.',
                    );
                if (kind === 'text') return text as T;
                if (
                    !response.headers.get('Content-Type')?.includes('json') ||
                    !text
                )
                    throw new ProtocolError(
                        'Expected a JSON response from the API.',
                    );
                try {
                    return JSON.parse(text) as T;
                } catch {
                    throw new ProtocolError('The API returned invalid JSON.');
                }
            }
        } finally {
            scope.dispose();
        }
    }
    async *iterate<T>(
        path: string,
        query: Query = {},
        options: RequestOptions = {},
    ): AsyncGenerator<T> {
        let next = this.url(path, query);
        const seen = new Set<string>();
        while (!seen.has(next.toString())) {
            seen.add(next.toString());
            const page = await this.request<{
                data: T[];
                links?: { next?: string | null };
                next_page_url?: string | null;
            }>('GET', next.toString(), {}, undefined, options);
            if (!Array.isArray(page.data))
                throw new ProtocolError('Expected a paginated data array.');
            for (const item of page.data) {
                options.signal?.throwIfAborted();
                yield item;
            }
            const link = page.next_page_url ?? page.links?.next;
            if (!link) return;
            const candidate = this.url(link);
            if (candidate.pathname !== next.pathname)
                throw new ProtocolError(
                    'Pagination attempted to change resource paths.',
                );
            next = candidate;
        }
        throw new ProtocolError('The API returned a repeated pagination link.');
    }
}
