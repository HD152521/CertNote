import { describe, expect, test } from 'vitest';
import { getRoadmapRole, getRoadmapRoles, loadRoadmapRoles, totalsOf } from './roadmap';
import type { EnrichedStep } from './roadmap';

// Phase2 직무별 로드맵 — 데이터 검증·enrich·graceful 단위 테스트.

describe('loadRoadmapRoles', () => {
  test('유효한 역할들을 로드한다(각 slug는 kebab-case)', () => {
    const roles = loadRoadmapRoles();
    expect(roles.length).toBeGreaterThan(0);
    for (const r of roles) {
      expect(r.slug).toMatch(/^[a-z0-9-]+$/);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.steps.length).toBeGreaterThan(0);
    }
  });

  test('솔루션스 아키텍트 경로는 clf → saa → sap 순서다', () => {
    const roles = loadRoadmapRoles();
    const sa = roles.find((r) => r.slug === 'solutions-architect');
    expect(sa).toBeDefined();
    expect(sa!.steps.map((s) => s.cert)).toEqual(['clf-c02', 'saa-c03', 'sap-c02']);
  });
});

describe('getRoadmapRoles (enrich)', () => {
  test('모든 단계가 cert 메타로 enrich되어 code·name·href를 갖는다', async () => {
    const roles = await getRoadmapRoles();
    expect(roles.length).toBeGreaterThan(0);
    for (const role of roles) {
      expect(role.steps.length).toBeGreaterThan(0);
      for (const s of role.steps) {
        expect(s.code.length).toBeGreaterThan(0);
        expect(s.name.length).toBeGreaterThan(0);
        // aws 자격증이므로 공개 URL은 /aws/<slug> 형태여야 한다(레거시 /aws-certs 아님).
        expect(s.href).toBe(`/aws/${s.slug}`);
        expect(s.note.length).toBeGreaterThan(0);
      }
    }
  });

  test('enrich 후에도 단계 순서가 데이터 순서와 일치한다', async () => {
    const role = await getRoadmapRole('developer');
    expect(role).not.toBeNull();
    expect(role!.steps.map((s) => s.slug)).toEqual(['clf-c02', 'dva-c02', 'dop-c02']);
  });
});

describe('getRoadmapRole', () => {
  test('존재하지 않는 slug는 null', async () => {
    expect(await getRoadmapRole('nonexistent-role')).toBeNull();
  });

  test('경로 조작 시도(비 kebab-case)는 null', async () => {
    expect(await getRoadmapRole('../secrets')).toBeNull();
    expect(await getRoadmapRole('a/b')).toBeNull();
  });
});

// 역할 페이지가 서로 비슷해지면(=공통 설명만 나열) 구글이 중복으로 접는다. 차별화의 재료가
// "자격증마다 달라지는 사실"이므로, 그 사실이 실제로 실려 있고 합계가 정직한지 고정한다.
describe('로드맵 단계의 시험 사실(역할 페이지 차별화 재료)', () => {
  test('모든 단계가 커리큘럼 분량을 싣는다', async () => {
    for (const role of await getRoadmapRoles()) {
      for (const s of role.steps) {
        expect(s.weeks).toBeGreaterThan(0);
        expect(s.dayCount).toBeGreaterThan(0);
      }
    }
  });

  test('AWS 단계는 공식 시험 정보가 붙는다(문항·시간·합격점·응시료)', async () => {
    for (const role of await getRoadmapRoles()) {
      for (const s of role.steps) {
        expect(s.exam, `${role.slug}/${s.slug} 의 exam-info 누락`).not.toBeNull();
        expect(s.exam!.questionCount).toBeGreaterThan(0);
        expect(s.exam!.durationMin).toBeGreaterThan(0);
        // 로드맵은 AWS 자격증만 담는다 = 전부 단일형(phases 없음). 다단계 시험이 섞였다면
        // 여기서 undefined 로 잡힌다.
        const passingScore = s.exam!.passingScore ?? 0;
        expect(passingScore).toBeGreaterThan(0);
        expect(s.exam!.scoreMax).toBeGreaterThanOrEqual(passingScore);
        expect(s.exam!.costUsd).toBeGreaterThan(0);
        expect(s.exam!.phases).toBeUndefined();
      }
    }
  });

  test('역할마다 합계가 실제로 달라진다(6개 페이지가 같은 숫자를 쓰지 않는다)', async () => {
    const roles = await getRoadmapRoles();
    expect(roles.length).toBeGreaterThan(1);
    const fingerprints = roles.map((r) => `${r.totals.weeks}/${r.totals.days}/${r.totals.costUsd}`);
    // 전부 동일하면 차별화 재료로서 무의미하다.
    expect(new Set(fingerprints).size).toBeGreaterThan(1);
  });

  test('합계는 단계 값의 단순 합이다', async () => {
    for (const role of await getRoadmapRoles()) {
      expect(role.totals.certCount).toBe(role.steps.length);
      expect(role.totals.weeks).toBe(role.steps.reduce((n, s) => n + s.weeks, 0));
      expect(role.totals.days).toBe(role.steps.reduce((n, s) => n + s.dayCount, 0));
    }
  });
});

describe('totalsOf — 모르는 값은 합계를 내지 않는다', () => {
  const step = (weeks: number, dayCount: number, costUsd: number | null): EnrichedStep => ({
    slug: 's', code: 'C', name: 'n', level: 'associate', href: '/aws/s', note: 'x',
    weeks, dayCount,
    exam: costUsd === null ? null : ({ costUsd } as EnrichedStep['exam']),
  });

  test('전 단계에 시험 정보가 있으면 응시료를 합산한다', () => {
    expect(totalsOf([step(6, 30, 100), step(12, 60, 150)]).costUsd).toBe(250);
  });

  test('한 단계라도 시험 정보가 없으면 costUsd 는 null(부분 합계 금지)', () => {
    // 0으로 더해 $100 을 내보내면 화면에 조용히 틀린 총액이 나간다.
    expect(totalsOf([step(6, 30, 100), step(10, 50, null)]).costUsd).toBeNull();
  });

  test('단계가 없으면 costUsd 는 null', () => {
    expect(totalsOf([]).costUsd).toBeNull();
  });
});

// 역할 페이지의 중복 색인 방지. 자격증 목록·시험 사실은 역할끼리 겹치므로(CLF-C02 는 6개 역할
// 전부에 등장) 차별화가 되지 않는다 — 실제로 단계별 시험 사실을 6페이지에 똑같은 형태로
// 얹었더니 상호 유사도가 0.66 → 0.84 로 **악화**했다. 고유 산문(why)만이 재료다.
describe('역할별 고유 산문(why)', () => {
  test('모든 역할이 why 를 가진다', () => {
    for (const r of loadRoadmapRoles()) {
      expect(r.why, `${r.slug} 에 why 없음`).toBeTruthy();
      expect(r.why!.length).toBeGreaterThan(120);
    }
  });

  test('why 는 역할마다 서로 다르다', () => {
    const whys = loadRoadmapRoles().map((r) => r.why);
    expect(new Set(whys).size).toBe(whys.length);
  });

  test('enrich 후에도 why 가 보존된다', async () => {
    const role = await getRoadmapRole('security');
    expect(role!.why).toBeTruthy();
  });

  test('why 없는 역할도 graceful(선택 필드)', () => {
    // 스키마 검증이 why 부재를 거부하면 기존 데이터가 통째로 사라진다.
    const roles = loadRoadmapRoles();
    expect(roles.length).toBeGreaterThan(0);
  });
});

describe('totalsOf — 원화·다단계 응시료가 섞이면 USD 합계를 내지 않는다', () => {
  // 회귀 배경: exam-info 스키마가 섹션 중립으로 확장되며 costUsd 가 optional 이 됐다(c200db6).
  // 그런데 totalsOf 는 'exam !== null' 로만 가격 유무를 판단하고 있어서, 리눅스마스터처럼
  // exam 은 있지만 costUsd 가 없는(원화·phases) 시험이 섞이면 합계가 성립하지 않는데도
  // 총액을 내보낼 수 있었다. 타입 에러로만 드러났고 동작 테스트는 없었다.
  const step = (slug: string, exam: unknown) =>
    ({ slug, code: slug, name: slug, level: 'associate', href: `/aws/${slug}`, note: '', weeks: 12, dayCount: 60, exam }) as Parameters<typeof totalsOf>[0][number];

  const usdExam = (costUsd: number) => ({ costUsd });
  // 최상위 costUsd 없이 phases 로 응시료를 갖는 시험(리눅스마스터 형태).
  const krwExam = { phases: [{ name: '1차', cost: { amount: 55000, currency: 'KRW' } }] };

  test('전 단계가 USD 단일 응시료면 합계를 낸다', () => {
    const t = totalsOf([step('a', usdExam(150)), step('b', usdExam(300))]);
    expect(t.costUsd).toBe(450);
    expect(t.certCount).toBe(2);
  });

  test('costUsd 없는 단계가 하나라도 섞이면 null 이다(부분 합계 금지)', () => {
    expect(totalsOf([step('a', usdExam(150)), step('b', krwExam)]).costUsd).toBeNull();
  });

  test('exam 자체가 없는 단계가 섞여도 null 이다(기존 동작 유지)', () => {
    expect(totalsOf([step('a', usdExam(150)), step('b', null)]).costUsd).toBeNull();
  });

  test('단계가 없으면 null 이다', () => {
    expect(totalsOf([]).costUsd).toBeNull();
  });

  test('weeks·days 는 가격과 무관하게 항상 합산한다', () => {
    const t = totalsOf([step('a', usdExam(150)), step('b', krwExam)]);
    expect(t.weeks).toBe(24);
    expect(t.days).toBe(120);
  });
});
