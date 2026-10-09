import {
  ApiError,
  buildQuery,
  type Method,
  type RequestOptions,
  type Transport,
} from '@/api/client';

interface ErrorBody {
  code?: string;
  message?: string;
}

export function createHttpTransport(baseUrl: string): Transport {
  const root = baseUrl.replace(/\/+$/, '');

  return {
    async request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
      const init: RequestInit = {
        method,
        // Session cookies are opaque and httponly; the client never reads them.
        credentials: 'include',
        headers: { Accept: 'application/json' },
        ...(options.signal ? { signal: options.signal } : {}),
      };

      if (options.body !== undefined) {
        init.headers = { ...init.headers, 'Content-Type': 'application/json' };
        init.body = JSON.stringify(options.body);
      }

      const response = await fetch(`${root}${path}${buildQuery(options.query)}`, init);

      if (response.status === 204) return undefined as T;

      const text = await response.text();
      const payload: unknown = text ? JSON.parse(text) : null;

      if (!response.ok) {
        const body = (payload ?? {}) as ErrorBody;
        throw new ApiError(
          response.status,
          body.code ?? 'unknown',
          body.message ?? response.statusText,
        );
      }

      return payload as T;
    },
  };
}
