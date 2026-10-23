import { describe, expect, test } from 'vitest';
// scripts/audit-style.mjs 의 순수 함수 단위 테스트. 기준 문서: docs/content-style-guide.md
import {
  auditText,
  extractBody,
  findCheer,
  findFrequency,
  findHonorific,
  findHortative,
  findTerms,
  isCallout,
  isSummaryHeading,
  maskCode,
  normalizeHeading,
  totalOf,
  trackOf,
} from '../../scripts/audit-style.mjs';

const QUIZ = ['## 📝 연습 문제', '', '**문제 1.** 보기를 고르세요!', 'A) 합격을 응원합니다  ', '**정답: A**'].join('\n');

function doc(body: string) {
  return `# Day 1 - 제목\n\n${body}\n\n${QUIZ}\n`;
}

describe('전처리', () => {
  test('연습 문제 헤딩 앞까지만 본문으로 자른다', () => {
    const body = extractBody(doc('본문이다.'));
    expect(body).toContain('본문이다.');
    expect(body).not.toContain('문제 1');
  });

  test('frontmatter 는 빈 줄로 바꿔 줄 번호를 유지한다', () => {
    const body = extractBody('---\ntitle: 응원합니다\n---\n본문\n');
    expect(body.split('\n')[3]).toBe('본문');
    expect(body).not.toContain('응원');
  });

  test('코드블록과 인라인 코드는 지우고 줄 수는 유지한다', () => {
    const src = '앞 줄\n```bash\necho 확인하세요\n```\n`쉘` 은 코드다';
    const masked = maskCode(src);
    expect(masked.split('\n')).toHaveLength(5);
    expect(masked).not.toContain('확인하세요');
    expect(masked).not.toContain('쉘');
  });
});

describe('줄 단위 규칙', () => {
  test('응원 문구를 찾고, 겹친 패턴은 한 건으로 센다', () => {
    expect(findCheer('Fighting!! 합격을 응원합니다.')).toEqual(['Fighting', '합격을 응원합니다']);
    expect(findCheer('VPC를 구축하면 된다.')).toEqual([]);
  });

  test('존댓말 종결(ㅂ니다·세요)을 찾되 따옴표 안 화면 문구는 제외한다', () => {
    expect(findHonorific('이것은 핵심 개념입니다.')).toEqual(['입니다']);
    expect(findHonorific('결과가 다릅니다.')).toEqual(['릅니다']);
    expect(findHonorific('기억하세요.')).toEqual(['세요']);
    expect(findHonorific('콘솔에 "다시 시도하세요"가 뜬다.')).toEqual([]);
    expect(findHonorific('필요한 것은 둘이다. 이것이 중요.')).toEqual([]);
  });

  test('권유·명령 종결을 찾되 ~자 로 끝나는 명사와 연결어미는 제외한다', () => {
    expect(findHortative('이 표를 외워 두자.')).toEqual(['두자']);
    expect(findHortative('정답을 의심하라.')).toEqual(['의심하라']);
    expect(findHortative('접근 주체는 사용자.')).toEqual([]);
    expect(findHortative('파일 확장자.')).toEqual([]);
    expect(findHortative('이는 버그가 아니라, 설계다.')).toEqual([]);
    expect(findHortative('트래픽이 몰리자, 지연이 늘었다.')).toEqual([]);
    expect(findHortative('아무리 늘려 봤자.')).toEqual([]);
  });

  test('출처 없는 빈도 표현을 찾되 접근 빈도·FAQ 는 제외한다', () => {
    expect(findFrequency('시험 단골이다.')).toEqual(['단골']);
    expect(findFrequency('이 보기는 거의 항상 오답이다.')).toEqual(['거의 항상 오답']);
    expect(findFrequency('문항의 절반은 이 구분이다.')).toEqual(['문항의 절반은']);
    expect(findFrequency('데이터를 얼마나 자주 묻는가')).toEqual([]);
    expect(findFrequency('고객이 자주 묻는 질문')).toEqual([]);
    expect(findFrequency('정밀도 60%는 낮다.')).toEqual([]);
  });

  test('용어집의 쓰지 않을 표기를 찾되 괄호 병기와 기능명은 제외한다', () => {
    expect(findTerms('람다 함수를 만든다.')).toEqual(['람다→Lambda']);
    expect(findTerms('람다 아키텍처는 배치와 스트림을 합친다.')).toEqual([]);
    expect(findTerms('Lambda(람다) 함수')).toEqual([]);
    expect(findTerms('현재 Stack의 Template를 비교한다.')).toEqual(['Stack→스택', 'Template→템플릿']);
    expect(findTerms('Nested Stack 과 Launch Template, Stack Policy, StackSets')).toEqual([]);
    expect(findTerms('Public 서브넷과 private subnet')).toEqual([
      'Public 서브넷→퍼블릭 서브넷',
      'private subnet→프라이빗 서브넷',
    ]);
    expect(findTerms('자동 failover 와 Origin Failover')).toEqual(['failover→페일오버']);
  });

  test('이모지 콜아웃을 세되 🎯 시나리오와 헤딩은 제외한다', () => {
    expect(isCallout('> 💡 **관련 이론**: 내용')).toBe(true);
    expect(isCallout('> ⚠️ **함정**: 내용')).toBe(true);
    expect(isCallout('⚠️ **주의**: 인용 없이 쓴 콜아웃')).toBe(true);
    expect(isCallout('> 🎯 **시나리오**: 내용')).toBe(false);
    expect(isCallout('## 📌 핵심 정리')).toBe(false);
    expect(isCallout('> 일반 인용')).toBe(false);
  });

  test('요약 섹션 헤딩을 판정하고 이름을 정규화한다', () => {
    expect(isSummaryHeading('📌 핵심 정리')).toBe(true);
    expect(isSummaryHeading('정리하며 — 앞으로의 지도')).toBe(true);
    expect(isSummaryHeading('한 줄 요약 체크리스트')).toBe(true);
    expect(isSummaryHeading('Closing Thoughts')).toBe(true);
    expect(isSummaryHeading('일상 속 사례로 정리하기')).toBe(false);
    expect(isSummaryHeading('함정 정리')).toBe(false);
    expect(normalizeHeading('📖 최종 핵심 정리')).toBe('최종 핵심 정리');
  });
});

describe('문서 단위 집계', () => {
  test('연습 문제 안의 존댓말·응원은 세지 않는다', () => {
    const result = auditText(doc('## 📌 핵심 정리\n\n- 요점이다.'));
    expect(totalOf(result)).toBe(0);
  });

  test('콜아웃은 2개 초과분, "핵심은" 은 2회째부터 센다', () => {
    const body = [
      '> 💡 **관련 이론**: 하나다.',
      '> 🔍 **더 깊이**: 둘이다.',
      '> 📚 **사례**: 셋이다.',
      '> ⚠️ **함정**: 넷이다.',
      '> 🎯 **시나리오**: 세지 않는다.',
      '핵심은 A다. 핵심은 B다.',
    ].join('\n\n');
    const result = auditText(doc(body));
    expect(result.callout.count).toBe(2);
    expect(result.core.count).toBe(1);
  });

  test('요약 섹션이 둘이면 중복 1건, 허용 이름 밖이면 이름 위반으로 센다', () => {
    const body = '## 📌 핵심 정리\n\n- 요점이다.\n\n## 본문\n\n설명이다.\n\n## 정리하며\n\n끝이다.';
    const result = auditText(doc(body));
    expect(result.summaryDup.count).toBe(1);
    expect(result.summaryName.count).toBe(1);
    expect(result.summaryName.hits[0].match).toBe('정리하며');
  });

  test('위반 줄 번호는 원문 기준이다', () => {
    const result = auditText(doc('```\n코드\n```\n\n외워 두자.'));
    expect(result.hortative.hits[0].line).toBe(7);
  });

  test('트랙 이름은 aws-certs 다음 폴더다', () => {
    expect(trackOf('content/aws-certs/saa-c03/week1/day1.md')).toBe('saa-c03');
    expect(trackOf('C:\\repo\\content\\aws-certs\\linux-master-1\\week2\\day1.md')).toBe('linux-master-1');
  });
});
