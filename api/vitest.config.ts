import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // Argon2id at OWASP parameters is deliberately slow, and the auth contract
    // suite runs it for real rather than stubbing the one thing worth checking.
    testTimeout: 30_000,
    // The DB-backed suites share one database and one settings row.
    fileParallelism: false,
  },
});
