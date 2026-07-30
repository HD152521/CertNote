import { describe, expect, test } from 'vitest';
import { getRoadmapRole, getRoadmapRoles, loadRoadmapRoles } from './roadmap';

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
