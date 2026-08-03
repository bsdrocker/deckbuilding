import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Integration tests hit the dev Postgres; give them room and run serially.
    testTimeout: 30000,
    fileParallelism: false,
  },
});
