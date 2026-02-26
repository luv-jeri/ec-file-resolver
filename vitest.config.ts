import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [],
  test: {
    include: ['electron/**/*.test.ts'],
    environment: 'node',
  },
});
