import { describe, expect, test } from 'vitest';
import { getExamInfo, getExamTips, formatCostKrw, AWS_EXAM_TIPS, USD_KRW_RATE, USD_KRW_RATE_SYNCED_AT } from './examInfo';
import { buildFaqPageLd } from './structuredData';

// Phase2 시험정보 FAQ — 데이터 로딩·섹션별 팁·FAQPage JSON-LD 단위 테스트.

describe('getExamInfo — FAQ 오써링(Phase2)', () => {
  test('saa-c03는 5개 FAQ와 difficulty·source·syncedAt를 갖는다', () => {
    const info = getExamInfo('saa-c03');
    expect(info).not.toBeNull();
    expect(info!.faq).toBeDefined();
    expect(info!.faq!.length).toBe(5);
    expect(info!.difficulty).toBeTruthy();
    expect(info!.source).toBeTruthy();
    expect(info!.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('모든 FAQ 엔트리는 비어있지 않은 q/a 문자열이다(FAQPage 스팸 방지)', () => {
    const info = getExamInfo('saa-c03')!;
    for (const f of info.faq!) {
      expect(typeof f.q).toBe('string');
      expect(f.q.trim().length).toBeGreaterThan(0);
      expect(typeof f.a).toBe('string');
      expect(f.a.trim().length).toBeGreaterThan(0);
    }
  });

  test('FAQ 답변의 핵심 수치가 해당 시험 데이터와 일치한다(허구 방지)', () => {
    const info = getExamInfo('saa-c03')!;
    const joined = info.faq!.map((f) => f.a).join(' ');
    // 합격점수/만점·응시료·유효기간이 스키마 값과 문자열로 일치해야 한다.
    expect(joined).toContain(String(info.passingScore));
    expect(joined).toContain(String(info.scoreMax));
    expect(joined).toContain(String(info.costUsd));
    expect(joined).toContain(String(info.validityYears));
  });
});

describe('getExamTips — 섹션별 꿀팁', () => {
  test('aws(또는 미지정)는 공통 혜택 팁을 반환한다', () => {
    expect(getExamTips('aws')).toEqual(AWS_EXAM_TIPS);
    expect(getExamTips()).toEqual(AWS_EXAM_TIPS);
    expect(getExamTips('aws').length).toBeGreaterThan(0);
  });

  test('linux 등 비-aws 섹션은 AWS 혜택 팁을 노출하지 않는다', () => {
    expect(getExamTips('linux')).toEqual([]);
  });
});

describe('buildFaqPageLd', () => {
  const faq = [
    { q: '응시료는 얼마인가요?', a: '미화 $150입니다.' },
    { q: '유효기간은?', a: '3년입니다.' },
  ];

  test('FAQPage 스키마로 Question/Answer를 매핑한다(화면 텍스트와 1:1)', () => {
    const ld = buildFaqPageLd(faq) as {
      '@type': string;
      mainEntity: { '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }[];
    };
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.mainEntity).toHaveLength(2);
    expect(ld.mainEntity[0].name).toBe(faq[0].q);
    expect(ld.mainEntity[0].acceptedAnswer.text).toBe(faq[0].a);
    expect(ld.mainEntity[0]['@type']).toBe('Question');
    expect(ld.mainEntity[0].acceptedAnswer['@type']).toBe('Answer');
  });

  test('실데이터(saa-c03) faq를 그대로 FAQPage로 직렬화한다', () => {
    const info = getExamInfo('saa-c03')!;
    const ld = buildFaqPageLd(info.faq!) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(ld.mainEntity).toHaveLength(info.faq!.length);
    expect(ld.mainEntity.map((e) => e.name)).toEqual(info.faq!.map((f) => f.q));
    expect(ld.mainEntity.map((e) => e.acceptedAnswer.text)).toEqual(info.faq!.map((f) => f.a));
  });
});

describe('formatCostKrw — 응시료 원화 환산', () => {
  test('만원 단위로 반올림해 "약 N만원"으로 표기한다', () => {
    expect(formatCostKrw(150, 1400)).toBe('약 21만원');
    expect(formatCostKrw(100, 1400)).toBe('약 14만원');
    expect(formatCostKrw(300, 1400)).toBe('약 42만원');
  });

  test('금액이 없거나 음수면 표기하지 않는다(null)', () => {
    expect(formatCostKrw(0)).toBeNull();
    expect(formatCostKrw(-10)).toBeNull();
    expect(formatCostKrw(Number.NaN)).toBeNull();
  });

  test('실데이터(saa-c03) 응시료로 환산값이 나온다', () => {
    const info = getExamInfo('saa-c03')!;
    expect(formatCostKrw(info.costUsd)).toMatch(/^약 \d+만원$/);
  });

  test('환산 기준 상수가 유효하다(기준 시점 없이 원화를 노출하면 안 된다)', () => {
    expect(USD_KRW_RATE).toBeGreaterThan(0);
    expect(USD_KRW_RATE_SYNCED_AT).toMatch(/^\d{4}-\d{2}$/);
  });
});
