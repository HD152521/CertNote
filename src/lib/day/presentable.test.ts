import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { isIndexableDay } from './indexPolicy';
import { containsHangul, enPresentableWeek, isEnPresentableDay, isPresentableDay, resetPresentableCache } from './presentable';

const REAL_EN_ROOT = path.join(process.cwd(), 'content', 'en');
const HANGUL_G = /[가-힣]/g;

function realCerts(): string[] {
  const idx = JSON.parse(readFileSync(path.join(REAL_EN_ROOT, 'index.json'), 'utf8')) as { certs: { slug: string }[] };
  return idx.certs.map((c) => c.slug);
}
function weekFiles(slug: string, week: number): string[] {
  const dir = path.join(REAL_EN_ROOT, slug, `week${week}`);
  try {
    return readdirSync(dir).filter((f) => /^day\d+\.md$/.test(f)).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}
const hangulCount = (file: string) => (readFileSync(file, 'utf8').match(HANGUL_G) ?? []).length;

// 이 파일의 핵심 계약: 영어 day 를 "보여줘도 된다"고 선언하려면 실제 파일에 한글이 0자여야 한다.
// 표를 손으로 올려서는 이 테스트를 통과할 수 없다 — 한도는 파일에서만 나온다.
describe('실제 content/en 파일 스캔', () => {
  beforeEach(() => resetPresentableCache());

  test('한도 이하의 모든 영어 day 파일에는 한글(U+AC00–U+D7A3)이 0자다', () => {
    const certs = realCerts();
    expect(certs.length).toBe(11);
    for (const slug of certs) {
      const limit = enPresentableWeek(slug);
      for (let w = 1; w <= limit; w++) {
        const files = weekFiles(slug, w);
        expect(files.length, `${slug} week${w} 에 day 파일이 있어야 한다`).toBeGreaterThan(0);
        for (const f of files) expect(hangulCount(f), f).toBe(0);
      }
    }
  });

  test('한도는 최대다 — 한도+1 주차(있다면)에는 한글이 남은 파일이 하나 이상 있다', () => {
    for (const slug of realCerts()) {
      const next = weekFiles(slug, enPresentableWeek(slug) + 1);
      if (next.length === 0) continue; // 마지막 주차까지 깨끗한 자격증
      expect(next.some((f) => hangulCount(f) > 0), `${slug} week${enPresentableWeek(slug) + 1}`).toBe(true);
    }
  });

  test('모든 자격증의 1주차는 열려 있다(한도 >= 1)', () => {
    for (const slug of realCerts()) expect(enPresentableWeek(slug), slug).toBeGreaterThanOrEqual(1);
  });
});

describe('판정 함수', () => {
  test('한국어 category 는 항상 보여주고 영어만 한도를 적용한다', () => {
    expect(isPresentableDay('aws', 'saa-c03', 12)).toBe(true);
    expect(isPresentableDay('linux', 'linux-master-2', 9)).toBe(true);
    const limit = enPresentableWeek('saa-c03');
    expect(isPresentableDay('en', 'saa-c03', limit)).toBe(true);
    expect(isPresentableDay('en', 'saa-c03', limit + 1)).toBe(false);
  });

  test('isIndexableDay 는 영어에서 presentable 과 정확히 일치한다', () => {
    for (const slug of realCerts()) {
      for (let w = 1; w <= 16; w++) expect(isIndexableDay('en', slug, w), `${slug} w${w}`).toBe(isEnPresentableDay(slug, w));
    }
    expect(isIndexableDay('aws', 'saa-c03', 2)).toBe(true);
  });

  test('0·음수·소수·존재하지 않는 slug·경로 조작 slug 는 보여주지 않는다', () => {
    expect(isEnPresentableDay('saa-c03', 0)).toBe(false);
    expect(isEnPresentableDay('saa-c03', -1)).toBe(false);
    expect(isEnPresentableDay('saa-c03', 1.5)).toBe(false);
    expect(isEnPresentableDay('nope-c99', 1)).toBe(false);
    expect(enPresentableWeek('../aws-certs/saa-c03')).toBe(0);
    expect(enPresentableWeek('')).toBe(0);
  });
});

describe('containsHangul 경계', () => {
  test('음절 블록 양 끝은 한글이고 바로 바깥은 아니다', () => {
    expect(containsHangul('가')).toBe(true);
    expect(containsHangul('힣')).toBe(true);
    expect(containsHangul('꯿')).toBe(false);
    expect(containsHangul('힤')).toBe(false);
    expect(containsHangul('Plain English, emoji 😀, 日本語, ü')).toBe(false);
  });

  test('퀴즈 라벨만 한글인 파일도 한글이 있는 파일이다(label-only 도 보여주지 않는다)', () => {
    expect(containsHangul('## 📝 연습 문제\n\n**문제 1.** What is S3?\n**정답: A**\n해설: ok')).toBe(true);
  });
});

// 임시 content 트리로 도출 규칙 자체를 검증한다.
describe('도출 규칙(임시 content 트리)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'presentable-'));
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    resetPresentableCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });
  const put = (slug: string, week: number, day: number, body: string) => {
    const dir = path.join(root, 'content', 'en', slug, `week${week}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `day${day}.md`), body);
  };

  test('연속으로 깨끗한 주차의 끝이 한도다', () => {
    for (const w of [1, 2, 3]) for (const d of [1, 2]) put('x-c01', w, d, '# Clean');
    expect(enPresentableWeek('x-c01')).toBe(3);
  });

  test('한 주 안의 day 한 개에만 한글이 있어도 그 주는 열리지 않는다', () => {
    put('x-c01', 1, 1, '# Clean');
    put('x-c01', 2, 1, '# Clean');
    put('x-c01', 2, 2, '# Dirty 가');
    expect(enPresentableWeek('x-c01')).toBe(1);
  });

  test('중간 주차가 더러우면 그 뒤 주차가 깨끗해도 열리지 않는다', () => {
    put('x-c01', 1, 1, '# Clean');
    put('x-c01', 2, 1, '# 더러움');
    put('x-c01', 3, 1, '# Clean');
    expect(enPresentableWeek('x-c01')).toBe(1);
  });

  test('주차가 비어 있거나 건너뛰면 거기서 멈춘다', () => {
    put('x-c01', 1, 1, '# Clean');
    put('x-c01', 3, 1, '# Clean');
    expect(enPresentableWeek('x-c01')).toBe(1);
    expect(enPresentableWeek('missing')).toBe(0);
  });

  test('1주차가 더러우면 한도는 0이다(어떤 day 도 열리지 않는다)', () => {
    put('x-c01', 1, 1, '한글');
    expect(enPresentableWeek('x-c01')).toBe(0);
    expect(isEnPresentableDay('x-c01', 1)).toBe(false);
  });

  test('결과는 메모이즈되고, 리셋하면 파일에서 다시 도출한다', () => {
    put('x-c01', 1, 1, '# Clean');
    expect(enPresentableWeek('x-c01')).toBe(1);
    put('x-c01', 1, 1, '# 이제 더러움');
    expect(enPresentableWeek('x-c01')).toBe(1);
    resetPresentableCache();
    expect(enPresentableWeek('x-c01')).toBe(0);
  });
});
