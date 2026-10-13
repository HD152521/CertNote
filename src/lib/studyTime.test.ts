import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readingTimeMinutes } from './readingTime';
import { DAILY_STUDY_MINUTES } from './studyTime';
import { shellStrings } from './strings/shell';
import { metadata as homeMetadata } from '@/app/page';

// "하루 N분" 문구의 근거를 실제 한국어 day 노트의 읽기 시간 분포로 고정한다.
// 측정(2026-10-13): 752편, 평균 16.5분, 중앙값 17분, 95퍼센타일 27분, 최대 34분.
const ROOT = join(process.cwd(), 'content', 'aws-certs');

function allMinutes(): number[] {
  const out: number[] = [];
  for (const c of readdirSync(ROOT)) {
    const cd = join(ROOT, c);
    if (!existsSync(join(cd, 'meta.json'))) continue;
    for (const w of readdirSync(cd)) {
      if (!/^week\d+$/.test(w)) continue;
      for (const f of readdirSync(join(cd, w))) {
        if (/^day\d+\.md$/.test(f)) out.push(readingTimeMinutes(readFileSync(join(cd, w, f), 'utf8')));
      }
    }
  }
  return out;
}

describe('DAILY_STUDY_MINUTES 는 실제 노트 읽기 시간으로 뒷받침된다', () => {
  const minutes = allMinutes().sort((a, b) => a - b);
  const avg = minutes.reduce((s, v) => s + v, 0) / minutes.length;
  const p95 = minutes[Math.floor(minutes.length * 0.95)];
  const max = minutes[minutes.length - 1];

  it('표본이 충분하다', () => {
    expect(minutes.length).toBeGreaterThan(700);
  });

  it('표기 값은 평균 이상이고 노트의 95% 이상이 그 안에 읽힌다', () => {
    expect(DAILY_STUDY_MINUTES).toBeGreaterThanOrEqual(avg);
    expect(DAILY_STUDY_MINUTES).toBeGreaterThanOrEqual(p95);
  });

  it('표기 값이 과장되지 않았고 최대치도 "안팎" 범위(25%) 안이다', () => {
    expect(max).toBeLessThanOrEqual(DAILY_STUDY_MINUTES * 1.25);
    expect(DAILY_STUDY_MINUTES).toBeLessThanOrEqual(avg * 2);
  });
});

describe('하루 학습 시간 문구가 한 숫자로 일관된다', () => {
  const n = `${DAILY_STUDY_MINUTES}분`;

  it('홈 title, 루트 layout description, 온보딩 문구가 같은 값을 쓴다', () => {
    expect(String(homeMetadata.title)).toContain(`하루 ${n}`);
    const layout = readFileSync(join(__dirname, '..', 'app', 'layout.tsx'), 'utf8');
    expect(layout).toContain('DAILY_STUDY_MINUTES');
    expect(layout).not.toMatch(/하루 \d+분/);
    expect(shellStrings.ko.welcomeStep2Body).toContain(n);
    expect(shellStrings.en.welcomeStep2Body).toContain(`${DAILY_STUDY_MINUTES} minutes`);
    expect(shellStrings.ko.welcomeStep2Body).not.toContain('15분');
  });
});
