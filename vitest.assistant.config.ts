import { defineConfig } from 'vitest/config';

// The assistant's 20 test questions (plan step 9c) against the real Claude API. Costs money. Not part of `npm test`.
export default defineConfig({
  test: {
    include: ['tests/assistant/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    maxConcurrency: 5,
  },
});
