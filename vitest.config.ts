import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// 단위/서비스 테스트용. @/ 별칭은 tsconfig와 맞춘다.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
