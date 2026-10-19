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
    // 콘텐츠 파일 1,400여 개를 훑는 테스트(contentExists·sitemap·quizContract 등)는 혼자 돌면 1초 안에 끝나지만,
    // 전체를 병렬로 돌리면 파일시스템 경합으로 기본 5초를 넘겨 매번 다른 테스트가 시간 초과로 떨어졌다.
    testTimeout: 20_000,
  },
});
