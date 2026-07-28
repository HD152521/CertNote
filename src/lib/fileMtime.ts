import { getManifestMtime } from './contentManifest';

// docs/SEO-indexing-fix-plan.md Step6 후속 — content/ 디렉터리에 대응 파일이 없는 순수 정적 페이지
// (홈·pricing·privacy 등)의 sitemap lastModified 근거. 원래 fs.stat(파일 mtime)을 썼으나, git이
// 파일 mtime을 보존하지 않아 Vercel 체크아웃 시 전부 "빌드 시각"으로 뭉개지는 사고가 났다(실측
// 확인 — 사이트맵 143개 URL 전부 동일 lastmod). 이제 git 커밋 시각 기반 매니페스트
// (src/lib/contentManifest.ts, scripts/build-content-manifest.mjs)를 조회한다 — 빌드 환경의
// mtime과 무관하게 결정적이다. 매니페스트에 없으면 undefined(날짜 추측 금지).
export async function getSourceFileMtime(relativePath: string): Promise<Date | undefined> {
  return getManifestMtime(relativePath);
}
