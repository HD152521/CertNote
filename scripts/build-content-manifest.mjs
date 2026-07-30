// scripts/build-content-manifest.mjs
// day 마크다운·meta.json·사이트맵이 참조하는 소스 파일의 "실제 마지막 변경 시각"을
// git 커밋 시각에서 뽑아 src/data/content-manifest.json 으로 커밋한다.
//
// 왜 필요한가(docs/SEO-indexing-fix-plan.md Step6 후속 사고):
// git은 파일 mtime을 보존하지 않는다. Vercel이 저장소를 체크아웃하면 모든 파일의 mtime이
// 체크아웃(=빌드) 시각으로 리셋되고, fs.stat 기반 lastModified/dateModified는 프로덕션에서
// 전부 "빌드 시각"으로 뭉개져버렸다(사이트맵 143개 URL 전부 동일 lastmod로 실측 확인).
// git 커밋 시각은 로컬(전체 히스토리 보유)에서만 신뢰할 수 있으므로, 이 스크립트를 로컬에서
// 명시적으로 실행해 결과를 JSON으로 커밋해 둔다. 런타임(src/lib/contentManifest.ts)은
// 파일시스템이 아니라 이 매니페스트만 읽으므로 빌드 환경의 mtime과 완전히 무관해진다.
//
// 실행: npm run content:manifest
// 절대 prebuild에 넣지 않는다 — Vercel은 얕은 클론이라 git log로 파일별 히스토리를 못 구한다.

import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const OUTPUT = path.join(ROOT, 'src', 'data', 'content-manifest.json');

// 사이트맵이 lastModified 근거로 쓰는, content/ 밖의 소스 파일(src/app/sitemap.ts 참고).
// 로드맵(Phase2): 페이지 소스 + 데이터 파일 둘 다 lastmod 근거로 추적한다.
const SOURCE_FILES = [
  'src/app/page.tsx',
  'src/app/pricing/page.tsx',
  'src/app/privacy/PrivacyContent.tsx',
  'src/app/roadmap/page.tsx',
  'content/roadmaps.json',
];

const DAY_FILE_RE = /week\d+[\\/]day\d+\.md$/;
const META_FILE_RE = /meta\.json$/;

// POSIX 슬래시로 정규화 — Windows(path.join이 \\ 사용)에서 생성해도 매니페스트 키는
// 플랫폼 독립적이어야 런타임(리눅스 Vercel)에서 그대로 조회 가능하다.
function toPosix(p) {
  return p.split(path.sep).join('/');
}

async function walk(dir, out) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (DAY_FILE_RE.test(full) || META_FILE_RE.test(full)) {
      out.push(full);
    }
  }
}

// 대상 파일 목록: content/**/week*/day*.md, content/**/meta.json, 사이트맵 참조 소스 파일.
async function collectTargetFiles() {
  const contentFiles = [];
  await walk(CONTENT_DIR, contentFiles);

  const sourceFiles = [];
  for (const rel of SOURCE_FILES) {
    const full = path.join(ROOT, rel);
    try {
      await fs.access(full);
      sourceFiles.push(full);
    } catch {
      console.warn(`[manifest] 소스 파일 없음 — 건너뜀: ${rel}`);
    }
  }

  return [...contentFiles, ...sourceFiles].map((f) => toPosix(path.relative(ROOT, f)));
}

// git log를 파일마다 부르면(1300개+) 매우 느리다. --name-only로 전체 히스토리를 한 번만 훑어
// "파일 → 그 파일이 등장하는 가장 최근 커밋의 커밋 시각" 맵을 만든다. git log는 최신 커밋부터
// 출력하므로, 파일을 "처음" 만난 시점이 곧 최신 변경 시각이다(그 뒤 같은 파일이 다시 나와도 무시).
const COMMIT_LINE_RE = /^[0-9a-f]{40} \d{4}-\d{2}-\d{2}T/;

function buildGitHistoryMap(targetFiles) {
  const targetSet = new Set(targetFiles);
  const pathspecs = ['content', ...SOURCE_FILES];
  const raw = execFileSync('git', ['log', '--format=%H %cI', '--name-only', '--', ...pathspecs], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  const map = new Map();
  let currentDate = null;
  for (const line of raw.split('\n')) {
    if (line === '') continue;
    if (COMMIT_LINE_RE.test(line)) {
      currentDate = line.slice(41); // "<40자 해시> " 다음이 ISO 날짜
      continue;
    }
    const file = toPosix(line);
    if (!targetSet.has(file)) continue; // 관심 없는 content 파일(index.json 등)은 무시
    if (map.has(file)) continue; // 이미 더 최근 커밋에서 기록됨
    if (currentDate) map.set(file, currentDate);
  }
  return map;
}

async function main() {
  const start = Date.now();

  const historyDepth = execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  console.log(`[manifest] git 히스토리 깊이: ${historyDepth} 커밋`);

  const targetFiles = await collectTargetFiles();
  console.log(`[manifest] 대상 파일: ${targetFiles.length}개`);

  const historyMap = buildGitHistoryMap(targetFiles);

  const files = {};
  let fallbackCount = 0;
  for (const rel of targetFiles) {
    const iso = historyMap.get(rel);
    if (iso) {
      files[rel] = iso;
      continue;
    }
    // git 히스토리에 없음(아직 커밋되지 않은 신규 파일) — fs mtime으로 폴백하고 로그를 남긴다.
    try {
      const stat = await fs.stat(path.join(ROOT, rel));
      files[rel] = stat.mtime.toISOString();
      fallbackCount += 1;
      console.warn(`[manifest] git 히스토리 없음(신규/미커밋 파일) — fs mtime 폴백: ${rel}`);
    } catch {
      console.warn(`[manifest] git 히스토리도 fs.stat도 실패 — 매니페스트에서 제외: ${rel}`);
    }
  }

  // 결정론적 직렬화: 키를 정렬해 써서 재생성해도 데이터가 그대로면 바이트 단위로 동일한 파일이
  // 나온다(불필요한 git diff 방지). generatedAt 같은 시각 필드는 의도적으로 넣지 않는다.
  const sortedFiles = {};
  for (const key of Object.keys(files).sort()) {
    sortedFiles[key] = files[key];
  }
  const manifest = { version: 1, files: sortedFiles };

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const elapsedMs = Date.now() - start;
  console.log(`[manifest] ${Object.keys(sortedFiles).length}개 항목 기록 (fs mtime 폴백 ${fallbackCount}건)`);
  console.log(`[manifest] 출력: ${path.relative(ROOT, OUTPUT)}`);
  console.log(`[manifest] 소요 시간: ${elapsedMs}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
