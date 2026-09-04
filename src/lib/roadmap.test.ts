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

  // exam-info 는 섹션 중립 스키마라 수치가 전부 optional 이다(다단계 시험은 phases[] 사용).
  // 로드맵 합계가 실제로 의존하는 값은 costUsd 하나뿐이므로 그것만 계약으로 고정한다 —
  // 화면에 렌더하지 않는 값(문항수·합격점)까지 단언하면 쓰지도 않는 데이터를 테스트가 붙잡는다.
  test('AWS 단계는 단일 응시 비용(costUsd)을 가진다 — 합계의 전제', async () => {
    for (const role of await getRoadmapRoles()) {
      for (const s of role.steps) {
        expect(s.exam, `${role.slug}/${s.slug} 의 exam-info 누락`).not.toBeNull();
        expect(typeof s.exam?.costUsd, `${role.slug}/${s.slug} 의 costUsd 없음`).toBe('number');
        expect(s.exam!.costUsd!).toBeGreaterThan(0);
      }
    }
  });

  test('costUsd 가 없는 단계가 섞이면 합계를 내지 않는다(다단계 시험 대비)', () => {
    const priced = { slug: 'a', code: 'A', name: 'n', level: 'associate', href: '/aws/a', note: 'x',
      weeks: 6, dayCount: 30, exam: { costUsd: 100 } } as unknown as Parameters<typeof totalsOf>[0][number];
    const unpriced = { slug: 'b', code: 'B', name: 'n', level: 'grade-1', href: '/linux/b', note: 'x',
      weeks: 10, dayCount: 50, exam: { phases: [{ costKrw: 1 }] } } as unknown as Parameters<typeof totalsOf>[0][number];
    expect(totalsOf([priced, unpriced]).costUsd).toBeNull();
    expect(totalsOf([priced]).costUsd).toBe(100);
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

  // enrichRole 은 getCertMeta 실패 시 그 단계를 조용히 버린다. 살아남은 것만 더하면
  // 3단계 로드맵이 "자격증 2개 · $250" 이라는 확정된 총액처럼 보인다.
  test('선언된 단계보다 적게 남으면 costUsd 는 null(부분합 금지)', () => {
    const survived = [step(6, 30, 100), step(12, 60, 150)];
    expect(totalsOf(survived, 3).costUsd).toBeNull();
    expect(totalsOf(survived, 2).costUsd).toBe(250);
  });

  test('유실이 있어도 certCount/weeks/days 는 남은 것 기준으로 보고한다', () => {
    const t = totalsOf([step(6, 30, 100), step(12, 60, 150)], 3);
    expect(t.certCount).toBe(2);
    expect(t.weeks).toBe(18);
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
