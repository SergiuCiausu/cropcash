import { defineConfig } from 'vitest/config';

// Integration tests hit the real Supabase project from .env. Not part of `npm test`.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
