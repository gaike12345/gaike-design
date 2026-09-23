import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      JWT_SECRET: 'test-jwt-secret-for-unit-tests-only-12345',
      IMAGE_SIGNING_SECRET: 'test-image-signing-secret-for-tests-12345',
    },
    coverage: {
      provider: 'v8',
      include: ['src/mank-common/**/*.ts', 'src/mank-infra/middleware/**/*.ts'],
    },
  },
})
