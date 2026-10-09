/**
 * Error shape matches what the client parses in web/src/api/http.ts:
 * `{ code, message }` with the status on the response.
 *
 * One rule runs through all of it: outside the ring, "you may not see this" and
 * "this does not exist" have to be the same answer. There is no 403 for a link
 * a viewer cannot see — there is a 404, because a 403 confirms it exists.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const unauthenticated = (message = 'log in first'): ApiError =>
  new ApiError(401, 'unauthenticated', message);

export const forbidden = (message = 'not permitted'): ApiError =>
  new ApiError(403, 'forbidden', message);

/** The answer for anything the caller may not know exists. */
export const notFound = (message = 'not found'): ApiError =>
  new ApiError(404, 'not_found', message);

export const conflict = (code: string, message: string): ApiError =>
  new ApiError(409, code, message);

export const invalid = (message: string, code = 'invalid'): ApiError =>
  new ApiError(400, code, message);

export const rateLimited = (retryAfterSeconds: number): ApiError =>
  new ApiError(429, 'rate_limited', 'too many requests', {
    'Retry-After': String(retryAfterSeconds),
  });
