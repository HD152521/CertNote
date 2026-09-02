import { describe, expect, test } from 'vitest';
import { getExamInfo, getExamTips, formatCost, AWS_EXAM_TIPS } from './examInfo';
import { readdirSync } from 'node:fs';
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

describe('formatCost — 통화별 응시료 표기', () => {
  test('KRW는 천단위 구분 + 원, USD는 $', () => {
    expect(formatCost({ amount: 55000, currency: 'KRW' })).toBe('55,000원');
    expect(formatCost({ amount: 77000, currency: 'KRW' })).toBe('77,000원');
    expect(formatCost({ amount: 150, currency: 'USD' })).toBe('$150');
  });

  test('천단위 구분은 ICU 비의존 — 빌드 환경이 달라도 같은 문자열이 나온다', () => {
    expect(formatCost({ amount: 1000, currency: 'KRW' })).toBe('1,000원');
    expect(formatCost({ amount: 999, currency: 'KRW' })).toBe('999원');
    expect(formatCost({ amount: 1234567, currency: 'KRW' })).toBe('1,234,567원');
  });
});

describe('스키마 확장 — 다단계 시험(리눅스마스터)', () => {
  test('linux-master-1을 로드한다(신규 스키마가 타입 가드를 통과한다)', () => {
    const info = getExamInfo('linux-master-1');
    expect(info).not.toBeNull();
    expect(info!.phases).toHaveLength(2);
    expect(info!.passingCriteria).toBeTruthy();
  });

  test('다단계 시험은 단일형 필드를 갖지 않는다(정본이 갈리면 안 된다)', () => {
    const info = getExamInfo('linux-master-1')!;
    expect(info.questionCount).toBeUndefined();
    expect(info.durationMin).toBeUndefined();
    expect(info.costUsd).toBeUndefined();
    expect(info.passingScore).toBeUndefined();
  });

  test('갱신 규정이 고시되지 않은 자격은 validityYears를 비워둔다(지어내지 않는다)', () => {
    expect(getExamInfo('linux-master-1')!.validityYears).toBeUndefined();
  });

  test('배점 비중 미고시 과목은 weight 없이 표기한다', () => {
    const info = getExamInfo('linux-master-1')!;
    expect(info.domains).toHaveLength(3);
    expect(info.domains.every((d) => d.weight === undefined)).toBe(true);
  });

  test('FAQ 답변의 핵심 수치가 phases 데이터와 일치한다(허구 방지)', () => {
    const info = getExamInfo('linux-master-1')!;
    const joined = info.faq!.map((f) => f.a).join(' ');
    for (const ph of info.phases!) {
      expect(joined).toContain(String(ph.durationMin));
      if (ph.cost) expect(joined).toContain(formatCost(ph.cost));
    }
    expect(joined).toContain(info.passingCriteria!.replace(/ \(.*$/, ''));
  });
});

describe('회귀 — 기존 AWS 시험정보는 단일형 그대로여야 한다', () => {
  const awsSlugs = readdirSync('content/exam-info')
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .filter((slug) => !slug.startsWith('linux-'));

  test('AWS 파일이 11개 이상 로드된다', () => {
    expect(awsSlugs.length).toBeGreaterThanOrEqual(11);
  });

  test.each(awsSlugs)('%s — 단일형 필드가 그대로 살아있다', (slug) => {
    const info = getExamInfo(slug);
    expect(info).not.toBeNull();
    expect(typeof info!.questionCount).toBe('number');
    expect(typeof info!.durationMin).toBe('number');
    expect(typeof info!.costUsd).toBe('number');
    expect(typeof info!.passingScore).toBe('number');
    expect(typeof info!.scoreMax).toBe('number');
    expect(typeof info!.validityYears).toBe('number');
    expect(typeof info!.format).toBe('string');
    expect(info!.phases).toBeUndefined();
    // AWS는 도메인 비중이 고시되므로 막대 렌더 조건을 유지해야 한다.
    expect(info!.domains.every((d) => typeof d.weight === 'number')).toBe(true);
  });
});
