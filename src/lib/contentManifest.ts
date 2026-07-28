import { promises as fs } from 'node:fs';
import path from 'node:path';

// docs/SEO-indexing-fix-plan.md Step6 후속 — git은 파일 mtime을 보존하지 않는다. Vercel이
// 체크아웃하면 모든 파일 mtime이 체크아웃(=빌드) 시각으로 리셋되어, fs.stat 기반
// lastModified/dateModified가 프로덕션에서 전부 "빌드 시각"으로 뭉개졌다(사이트맵 143개 URL
// 전부 동일 lastmod로 실측 확인). scripts/build-content-manifest.mjs가 로컬(전체 git 히스토리
// 보유)에서 파일별 마지막 커밋 시각을 뽑아 커밋해 두면, 런타임은 파일시스템이 아니라 이 매니페스트만
// 읽으므로 빌드 환경의 mtime과 완전히 무관해진다. src/lib/content.ts(getDayMtime/getCertMetaMtime)와
// src/lib/fileMtime.ts(getSourceFileMtime)가 이 모듈을 공유한다.
const MANIFEST_PATH = path.join(process.cwd(), 'src', 'data', 'content-manifest.json');

interface ContentManifestFile {
  version: number;
  files: Record<string, string>;
}

// 모듈 단위로 1회만 읽는다 — 매니페스트는 빌드 산출물(정적 커밋 파일)이라 요청마다 다시 읽을
// 이유가 없다(콘텐츠 캐시와 동일한 이유, content.ts의 CONTENT_CACHE 주석 참고).
let manifestFiles: Record<string, string> | undefined;
let manifestLoaded = false;

async function loadManifestFiles(): Promise<Record<string, string> | undefined> {
  if (manifestLoaded) return manifestFiles;
  manifestLoaded = true;
  try {
    const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw) as ContentManifestFile;
    manifestFiles = parsed.files;
  } catch {
    // 매니페스트가 아직 생성되지 않았거나(로컬 최초 클론) 손상된 경우. 조용히 undefined —
    // 호출부가 lastModified/dateModified를 생략하는 안전한 폴백으로 이어진다(가짜 날짜 금지).
    manifestFiles = undefined;
  }
  return manifestFiles;
}

/**
 * 저장소 루트 기준 상대경로(POSIX 슬래시 또는 OS 구분자 모두 허용)의 마지막 변경 시각을
 * 매니페스트에서 조회한다. 매니페스트가 없거나 해당 경로가 없으면 undefined — 절대 추측값
 * (new Date(), 고정 폴백 날짜)을 대신 반환하지 않는다. 호출부는 undefined일 때 반드시
 * lastModified/dateModified 필드 자체를 생략해야 한다.
 */
export async function getManifestMtime(relativePath: string): Promise<Date | undefined> {
  const files = await loadManifestFiles();
  if (!files) return undefined;
  const key = relativePath.split(path.sep).join('/');
  const iso = files[key];
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
