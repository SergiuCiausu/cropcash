import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.{ts,tsx}', 'farm-app/live/**/*.test.ts', 'web/lib/**/*.test.ts'],
    environment: 'node',
  },
});
