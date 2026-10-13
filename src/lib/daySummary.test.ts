import { describe, it, expect } from 'vitest';
import { extractDaySummary } from './daySummary';

describe('extractDaySummary', () => {
  it('요약 섹션이 있으면 헤딩을 제외한 불릿만 summary로 뽑고 body에서 제거한다', () => {
    const md = [
      '# Day 1 - 제목',
      '',
      '## 📌 핵심 정리',
      '',
      '- 첫째 포인트',
      '- 둘째 포인트',
      '',
      '## 들어가며',
      '',
      '본문 내용입니다.',
    ].join('\n');

    const { summary, body } = extractDaySummary(md);

    expect(summary).toBe('- 첫째 포인트\n- 둘째 포인트');
    expect(body).not.toContain('핵심 정리');
    expect(body).not.toContain('첫째 포인트');
    expect(body).toContain('# Day 1 - 제목');
    expect(body).toContain('## 들어가며');
    expect(body).toContain('본문 내용입니다.');
  });

  it('요약 섹션이 없으면 summary는 null이고 body는 원본 그대로다(안전 요구사항)', () => {
    const md = ['# Day 2 - 제목', '', '## 들어가며', '', '본문.'].join('\n');

    const { summary, body } = extractDaySummary(md);

    expect(summary).toBeNull();
    expect(body).toBe(md);
  });

  it('빈 문자열이 와도 깨지지 않는다', () => {
    const { summary, body } = extractDaySummary('');
    expect(summary).toBeNull();
    expect(body).toBe('');
  });

  it('"## 📌 핵심 정리"가 여러 번 나오면 첫 번째 것만 요약으로 추출한다', () => {
    const md = [
      '# Day 3',
      '',
      '## 📌 핵심 정리',
      '',
      '- 첫 요약',
      '',
      '## 본문 섹션',
      '',
      '## 📌 핵심 정리',
      '',
      '- 두 번째 핵심 정리(추출 대상 아님)',
    ].join('\n');

    const { summary, body } = extractDaySummary(md);

    expect(summary).toBe('- 첫 요약');
    // 두 번째 "핵심 정리" 헤딩과 그 불릿은 body에 그대로 남는다(첫 섹션만 추출 대상).
    // "핵심 정리"가 헤딩 1회 + 불릿 텍스트 1회, 총 2회 남아 있어야 한다(첫 섹션만 제거됨).
    expect(body).toContain('두 번째 핵심 정리');
    expect(body.match(/핵심 정리/g)).toHaveLength(2);
  });

  it('요약 섹션이 문서 맨 끝인 경우(다음 헤딩이 없음)도 끝까지 전부 뽑는다', () => {
    const md = ['# Day 4', '', '## 📌 핵심 정리', '', '- 포인트 A', '- 포인트 B'].join('\n');

    const { summary, body } = extractDaySummary(md);

    expect(summary).toBe('- 포인트 A\n- 포인트 B');
    // 제거된 섹션 앞의 구분용 빈 줄은 남을 수 있다(무해한 트레일링 공백) — trim 후 비교.
    expect(body.trim()).toBe('# Day 4');
  });

  it('헤딩 레벨이 다르면(### 등 H2가 아니면) 핵심 정리 섹션으로 인식하지 않는다', () => {
    const md = ['# Day 5', '', '### 📌 핵심 정리', '', '- 이건 H3라 요약 아님'].join('\n');

    const { summary, body } = extractDaySummary(md);

    expect(summary).toBeNull();
    expect(body).toBe(md);
  });

  it('요약 섹션 안에 더 깊은 헤딩(H3)이 있어도 섹션 경계로 취급하지 않는다', () => {
    const md = [
      '# Day 6',
      '',
      '## 📌 핵심 정리',
      '',
      '- 포인트 A',
      '### 세부 항목(요약 안의 H3, 경계 아님)',
      '- 포인트 B',
      '',
      '## 다음 섹션',
      '',
      '본문.',
    ].join('\n');

    const { summary, body } = extractDaySummary(md);

    expect(summary).toContain('포인트 A');
    expect(summary).toContain('세부 항목');
    expect(summary).toContain('포인트 B');
    expect(body).toContain('## 다음 섹션');
    expect(body).not.toContain('포인트 A');
  });

  it('이모지가 없어도("## 핵심 정리") 텍스트 매칭으로 인식한다', () => {
    const md = ['# Day 7', '', '## 핵심 정리', '', '- 이모지 없는 요약'].join('\n');

    const { summary } = extractDaySummary(md);

    expect(summary).toBe('- 이모지 없는 요약');
  });

  it('코드펜스 안의 "## 핵심 정리" 유사 텍스트는 헤딩으로 오인하지 않는다', () => {
    const md = [
      '# Day 8',
      '',
      '```',
      '## 핵심 정리',
      '- 이건 코드 예시일 뿐 실제 섹션 아님',
      '```',
      '',
      '본문.',
    ].join('\n');

    const { summary, body } = extractDaySummary(md);

    expect(summary).toBeNull();
    expect(body).toBe(md);
  });

  it('요약 섹션이 공백 불릿만 있어(본문 없이) 트리밍 후 빈 문자열이면 null을 반환한다', () => {
    const md = ['# Day 9', '', '## 📌 핵심 정리', '', '   ', '', '## 다음', '', '본문.'].join('\n');

    const { summary, body } = extractDaySummary(md);

    expect(summary).toBeNull();
    expect(body).toContain('## 다음');
  });
});
