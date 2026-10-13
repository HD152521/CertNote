import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAllQuestions } from './questions';
import { buildHomeStats, sumDayCount } from './homeStats';

const ROOT = join(process.cwd(), 'content', 'aws-certs');

function listMetas(): { slug: string; dayCount: number }[] {
  return readdirSync(ROOT)
    .filter((d) => existsSync(join(ROOT, d, 'meta.json')))
    .map((d) => ({ slug: d, ...(JSON.parse(readFileSync(join(ROOT, d, 'meta.json'), 'utf8')) as { dayCount: number }) }));
}

function countDayFiles(slug: string): number {
  const dir = join(ROOT, slug);
  let n = 0;
  for (const w of readdirSync(dir)) {
    if (!/^week\d+$/.test(w)) continue;
    n += readdirSync(join(dir, w)).filter((f) => /^day\d+\.md$/.test(f)).length;
  }
  return n;
}

describe('sumDayCount', () => {
  it('dayCount 를 합산하고 빈 목록은 0', () => {
    expect(sumDayCount([{ dayCount: 3 }, { dayCount: 4 }])).toBe(7);
    expect(sumDayCount([])).toBe(0);
  });
});

describe('홈에 노출하는 규모 수치가 실제 데이터와 일치한다', () => {
  it('각 meta.json 의 dayCount 는 실제 day*.md 파일 수와 같다(합계 = 홈 "심화 노트" 수치)', () => {
    const metas = listMetas();
    for (const m of metas) expect(countDayFiles(m.slug), m.slug).toBe(m.dayCount);
    expect(sumDayCount(metas)).toBe(metas.reduce((s, m) => s + countDayFiles(m.slug), 0));
  });

  it('연습 문항 수는 인덱스(questions.json) 길이이며 비어 있지 않다', () => {
    expect(getAllQuestions().length).toBeGreaterThan(0);
  });
});

describe('buildHomeStats', () => {
  it('작은 픽스처에서 certCount·pageCount 를 계산하고 questionCount 는 인덱스 길이다', () => {
    const stats = buildHomeStats([{ dayCount: 10 }, { dayCount: 5 }, { dayCount: 1 }]);
    expect(stats.certCount).toBe(3);
    expect(stats.pageCount).toBe(16);
    expect(stats.questionCount).toBe(getAllQuestions().length);
    expect(buildHomeStats([]).certCount).toBe(0);
    expect(buildHomeStats([]).pageCount).toBe(0);
  });
});

describe('page.tsx 소스 가드', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'page.tsx'), 'utf8');

  it('Landing 에 규모 수치를 숫자 리터럴로 넘기지 않고 buildHomeStats 결과를 펼친다', () => {
    expect(src).not.toMatch(/(?:pageCount|questionCount|certCount)\s*=\s*\{\s*\d/);
    expect(src).not.toMatch(/(?:PAGE_COUNT|QUESTION_COUNT)\s*=\s*\d/);
    expect(src).toMatch(/<Landing\s+\{\.\.\.buildHomeStats\(certs\)\}/);
  });
});
