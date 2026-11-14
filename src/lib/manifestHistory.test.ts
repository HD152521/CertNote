import { describe, expect, test } from 'vitest';
import { buildHistoryMap } from '../../scripts/manifestHistory.mjs';

// `git log --format="%H %cI" --name-status -M` 형식의 합성 로그(최신 커밋부터).
const sha = (n: number) => n.toString(16).padStart(40, '0');
const commit = (n: number, iso: string, ...lines: string[]) => [`${sha(n)} ${iso}`, ...lines, ''].join('\n');

const NEW = 'src/app/(ko)/about/page.tsx';
const OLD = 'src/app/about/page.tsx';

describe('buildHistoryMap — 이름 변경 추적', () => {
  test('순수 이동(R100) 커밋은 변경 시각이 아니다 — 옛 경로의 마지막 수정 시각이 유지된다', () => {
    const log = [
      commit(3, '2026-11-15T10:00:00+09:00', `R100\t${OLD}\t${NEW}`),
      commit(2, '2026-11-14T02:54:01+09:00', `M\t${OLD}`),
      commit(1, '2026-10-01T00:00:00+09:00', `A\t${OLD}`),
    ].join('');
    expect(buildHistoryMap(log, [NEW]).get(NEW)).toBe('2026-11-14T02:54:01+09:00');
  });

  test('이동 뒤 내용을 고친 커밋은 그 시각이 마지막 변경이다', () => {
    const log = [
      commit(4, '2026-11-16T09:00:00+09:00', `M\t${NEW}`),
      commit(3, '2026-11-15T10:00:00+09:00', `R100\t${OLD}\t${NEW}`),
      commit(2, '2026-11-14T02:54:01+09:00', `M\t${OLD}`),
    ].join('');
    expect(buildHistoryMap(log, [NEW]).get(NEW)).toBe('2026-11-16T09:00:00+09:00');
  });

  test('내용이 바뀐 이름 변경(R090)은 변경으로 센다', () => {
    const log = commit(3, '2026-11-15T10:00:00+09:00', `R090\t${OLD}\t${NEW}`) + commit(2, '2026-11-14T00:00:00+09:00', `M\t${OLD}`);
    expect(buildHistoryMap(log, [NEW]).get(NEW)).toBe('2026-11-15T10:00:00+09:00');
  });

  test('일반(라우트 그룹과 무관한) 이름 변경도 이어 붙인다', () => {
    const log = [
      commit(3, '2026-11-15T10:00:00+09:00', 'R100\tcontent/a/old.md\tcontent/a/new.md'),
      commit(2, '2026-11-01T00:00:00+09:00', 'M\tcontent/a/old.md'),
    ].join('');
    expect(buildHistoryMap(log, ['content/a/new.md']).get('content/a/new.md')).toBe('2026-11-01T00:00:00+09:00');
  });
});

describe('buildHistoryMap — 이동이 아직 커밋되지 않은 상태', () => {
  test('로그에 옛 경로만 있어도 (ko)/(en) 그룹 경로의 이력으로 인정된다', () => {
    const en = 'src/app/(en)/en/about/page.tsx';
    const log = commit(2, '2026-11-14T02:54:01+09:00', 'M\tsrc/app/en/about/page.tsx', `M\t${OLD}`);
    const map = buildHistoryMap(log, [NEW, en]);
    expect(map.get(NEW)).toBe('2026-11-14T02:54:01+09:00');
    expect(map.get(en)).toBe('2026-11-14T02:54:01+09:00');
  });

  test('관심 없는 파일과 삭제는 무시한다', () => {
    const log = commit(2, '2026-11-14T02:54:01+09:00', 'M\tcontent/other.md', `D\t${OLD}`);
    expect(buildHistoryMap(log, [NEW]).has(NEW)).toBe(false);
  });
});
