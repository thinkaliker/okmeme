export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  readonly query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The seam between the app and the API. There are two implementations: real
 * HTTP, and the in-browser fake in src/api/mock that stands in for the server
 * until it exists. Everything above this line is written against the interface.
 */
export interface Transport {
  request<T>(method: Method, path: string, options?: RequestOptions): Promise<T>;
}

export function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}
