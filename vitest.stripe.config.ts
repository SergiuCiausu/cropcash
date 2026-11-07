import { defineConfig } from 'vitest/config';

// End-to-end Stripe sandbox + Supabase flow. Slow; not part of `npm test`.
export default defineConfig({
  test: {
    include: ['tests/stripe/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
