import { describe, expect, test } from 'vitest';
import { certLevelLabel, isHighlightLevel, groupCertsByLevel, SECTION_TIERS } from './levels';

describe('certLevelLabel — 섹션별 티어 라벨', () => {
  test('AWS는 영문 티어명을 그대로 쓴다', () => {
    expect(certLevelLabel('foundational', 'aws')).toBe('Foundational');
    expect(certLevelLabel('associate', 'aws')).toBe('Associate');
    expect(certLevelLabel('professional', 'aws')).toBe('Professional');
    expect(certLevelLabel('specialty', 'aws')).toBe('Specialty');
  });

  test('리눅스는 국내 자격 표기(1급/2급)를 쓴다 — 폴백은 "Grade 1"을 내보냈다', () => {
    expect(certLevelLabel('grade-1', 'linux')).toBe('1급');
    expect(certLevelLabel('grade-2', 'linux')).toBe('2급');
  });

  test('linux 티어 두 개 모두 라벨이 있다(SECTION_TIERS와 누락 없이 일치)', () => {
    for (const tier of SECTION_TIERS.linux) {
      expect(certLevelLabel(tier, 'linux')).not.toMatch(/^Grade/i);
    }
  });

  test('미등록 레벨은 title-case로 폴백한다(회귀 안전)', () => {
    expect(certLevelLabel('some-new-tier', 'kubernetes')).toBe('Some New Tier');
  });
});

describe('isHighlightLevel — 섹션의 최상위 티어', () => {
  test('linux는 1급이 최상위다(2급이 아니다)', () => {
    expect(isHighlightLevel('grade-1', 'linux')).toBe(true);
    expect(isHighlightLevel('grade-2', 'linux')).toBe(false);
  });
});

describe('groupCertsByLevel — 티어 순 정렬', () => {
  test('linux는 2급이 1급보다 먼저 온다(입문 → 상위)', () => {
    const groups = groupCertsByLevel(
      [
        { level: 'grade-1', order: 7 },
        { level: 'grade-2', order: 6 },
      ],
      'linux',
    );
    expect(groups.map((g) => g.level)).toEqual(['grade-2', 'grade-1']);
  });
});
