import type { Method, RequestOptions, Transport } from '@/api/client';
import { createHttpTransport } from '@/api/http';
import { API_URL } from '@/config';

/**
 * One switch. Everything else in the app talks to src/api/endpoints.ts and
 * never learns which side of this it is on.
 *
 * The condition reads `import.meta.env` inline rather than the `USE_MOCK_API`
 * constant, and the fake arrives through a dynamic `import()`, for one reason:
 * Vite replaces the env read at build time, Rollup deletes the dead branch, and
 * the dynamic import inside it goes with it. A static import would not — the
 * fake holds module-level state, so it is not side-effect free and survives
 * tree shaking even with every reference gone.
 *
 * `VITE_API_MOCK=false` is documented as removing the fake, the fixtures and
 * the tier switcher from the output. This is what makes that true rather than
 * aspirational.
 */
const useMock = import.meta.env.VITE_API_MOCK !== 'false';

const real: Transport = createHttpTransport(API_URL);

let pending: Promise<Transport> | null = null;

function mockTransport(): Promise<Transport> {
  pending ??= import('@/api/mock/transport').then((module) => module.createMockTransport());
  return pending;
}

export const transport: Transport = {
  request<T>(method: Method, path: string, options?: RequestOptions): Promise<T> {
    if (!useMock) return real.request<T>(method, path, options);
    return mockTransport().then((impl) => impl.request<T>(method, path, options));
  },
};
