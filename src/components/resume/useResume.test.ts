// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { findResume } from './useResume';

const KEY = 'cert-notes:progress';

function entry(href: string, at: number, title = 'Day 1 - 제목') {
  return { week: 1, day: 1, title, href, at };
}

function seed(state: Record<string, { lastVisited?: ReturnType<typeof entry> }>) {
  window.localStorage.setItem(KEY, JSON.stringify(state));
}

describe('findResume', () => {
  beforeEach(() => window.localStorage.clear());

  it('기록이 없으면 null 이다', () => {
    expect(findResume(undefined, 'ko')).toBeNull();
    expect(findResume(undefined, 'en')).toBeNull();
  });

  it('손상된 JSON 이어도 던지지 않고 null 이다', () => {
    window.localStorage.setItem(KEY, '{not json');
    expect(findResume(undefined, 'ko')).toBeNull();
  });

  it('한국어는 /en/ 이 아닌 기록 중 가장 최근 것만 고른다', () => {
    seed({
      'saa-c03': { lastVisited: entry('/aws/saa-c03/week-1/day-1', 10) },
      'clf-c02': { lastVisited: entry('/en/clf-c02/week-1/day-1', 99) },
      'sqld': { lastVisited: entry('/data/sqld/week-1/day-1', 20) },
    });
    const r = findResume(undefined, 'ko');
    expect(r?.slug).toBe('sqld');
    expect(r?.href.startsWith('/en/')).toBe(false);
  });

  it('언어를 생략하면 한국어로 동작한다(기존 ResumeLink 동작 보존)', () => {
    seed({
      'saa-c03': { lastVisited: entry('/aws/saa-c03/week-1/day-1', 10) },
      'clf-c02': { lastVisited: entry('/en/clf-c02/week-1/day-1', 99) },
    });
    expect(findResume(undefined)?.slug).toBe('saa-c03');
  });

  it('영어는 /en/ 기록만 고른다', () => {
    seed({
      'saa-c03': { lastVisited: entry('/aws/saa-c03/week-1/day-1', 99) },
      'clf-c02': { lastVisited: entry('/en/clf-c02/week-1/day-1', 10) },
    });
    expect(findResume(undefined, 'en')?.slug).toBe('clf-c02');
  });

  it('언어에 맞는 기록이 하나도 없으면 null 이다', () => {
    seed({ 'saa-c03': { lastVisited: entry('/aws/saa-c03/week-1/day-1', 10) } });
    expect(findResume(undefined, 'en')).toBeNull();
  });

  it('slug 를 주면 그 자격증 기록만 본다', () => {
    seed({
      'saa-c03': { lastVisited: entry('/aws/saa-c03/week-1/day-1', 10) },
      'sqld': { lastVisited: entry('/data/sqld/week-1/day-1', 20) },
    });
    expect(findResume('saa-c03', 'ko')?.slug).toBe('saa-c03');
    expect(findResume('clf-c02', 'ko')).toBeNull();
  });

  it('lastVisited 없는 항목은 무시한다', () => {
    seed({ 'saa-c03': {} });
    expect(findResume(undefined, 'ko')).toBeNull();
  });
});
