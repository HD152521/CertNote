// scripts/build-content-manifest.mjs 의 git 히스토리 해석(순수 함수 — git 을 호출하지 않는다).
// src/lib/manifestHistory.test.ts 가 합성 로그로 시험한다.
//
// 입력은 `git -c core.quotepath=false log --format="%H %cI" --name-status -M -- content src` 의 출력(최신 커밋부터).
// 두 가지를 처리한다:
//  1) 이름 변경 추적 — 순수 이동(R100)은 내용 변경이 아니므로 그 커밋 시각을 파일의 "마지막 변경"으로 치지 않고,
//     옛 경로의 더 오래된 이력을 새 경로로 이어 붙인다(사이트맵 lastmod 가 이동 커밋 날짜로 리셋되는 것을 막는다).
//  2) 라우트 그룹 이동 — `src/app/about/page.tsx` → `src/app/(ko)/about/page.tsx` 처럼 `(ko)`·`(en)` 그룹 세그먼트만
//     달라진 경로는 같은 파일로 본다. 이동이 아직 커밋되지 않아 로그에 옛 경로만 있을 때도 같은 결과가 나온다.

const COMMIT_LINE_RE = /^[0-9a-f]{40} \d{4}-\d{2}-\d{2}T/;
const ROUTE_GROUP_SEGMENT_RE = /\/\((?:ko|en)\)(?=\/)/g;

const toPosix = (p) => p.replaceAll('\\', '/');
const canon = (p) => toPosix(p).replace(ROUTE_GROUP_SEGMENT_RE, '');

/**
 * @param {string} rawLog git log 출력(--name-status -M)
 * @param {string[]} targetFiles 매니페스트 대상(POSIX, 현재 경로)
 * @returns {Map<string, string>} 현재 경로 → 마지막 변경 ISO 시각
 */
export function buildHistoryMap(rawLog, targetFiles) {
  const canonToTarget = new Map(targetFiles.map((t) => [canon(t), t]));
  const alias = new Map(); // 옛 경로(canon) → 현재 경로(canon)
  const resolve = (c) => {
    let cur = c;
    for (let hops = 0; alias.has(cur) && hops < 100; hops += 1) cur = alias.get(cur);
    return cur;
  };

  const map = new Map();
  let currentDate = null;
  const record = (canonPath) => {
    const target = canonToTarget.get(canonPath);
    if (target && currentDate && !map.has(target)) map.set(target, currentDate);
  };

  for (const line of rawLog.split('\n')) {
    if (line === '') continue;
    if (COMMIT_LINE_RE.test(line)) {
      currentDate = line.slice(41);
      continue;
    }
    const [status, first, second] = line.split('\t');
    if (!first) continue;
    if (status.startsWith('R') || status.startsWith('C')) {
      if (status.startsWith('C')) {
        record(resolve(canon(second)));
        continue;
      }
      const to = resolve(canon(second));
      const from = canon(first);
      if (from !== to) alias.set(from, to);
      if (status !== 'R100') record(to); // 내용이 바뀐 이름 변경만 변경으로 센다
      continue;
    }
    if (status === 'D') continue;
    record(resolve(canon(first)));
  }
  return map;
}
