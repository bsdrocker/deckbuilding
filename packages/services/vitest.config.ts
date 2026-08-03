import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only pure unit tests here; DB-backed flows are covered by API integration tests.
    include: ['src/**/*.test.ts'],
  },
});
