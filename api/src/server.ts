import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { env } from './env.js';

/**
 * The self-hosted entry point. `api/index.ts` is the Vercel one, and both wrap
 * the same `createApp()` — one application, two thin adapters, so the two
 * deployments cannot quietly drift apart.
 */
const config = env();

serve({ fetch: createApp().fetch, port: config.port }, (info) => {
  console.log(`okmeme api on http://localhost:${info.port}`);
  console.log(`  auth provider: ${config.authProvider}`);
  console.log(`  blob store:    ${config.blobStore}`);
  console.log(`  web origins:   ${config.webOrigins.join(', ')}`);
  if (config.setupToken !== null) {
    console.log(`  setup:         ${config.publicUrl}/setup?token=…  (one time, ever)`);
  }
});
