import { describe, expect, test } from 'vitest';
import { parseQuiz } from './parseQuiz';

const KOREAN = `# Day 1

본문입니다.

## 📝 연습 문제

**문제 1.** S3 스토리지 클래스는?
A) Standard
B) Glacier
**정답: A**
해설: Standard가 기본이다.

**문제 2.** EC2 과금 단위는?
A) 시간
B) 초
**정답: B**
해설: 초 단위 과금.
`;

const ENGLISH = `# Day 1

Some prose.

## 📝 Practice Questions

**Question 1.** Which S3 storage class is the default?
A) Standard
B) Glacier
**Answer: A**
Explanation: Standard is the default.

**Question 2.** How is EC2 billed?
A) Hourly
B) Per second
**Answer: B**
Explanation: Billed per second.
`;

describe('parseQuiz — Korean source format', () => {
  test('extracts both questions with answers and explanations', () => {
    const r = parseQuiz(KOREAN);
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0].number).toBe(1);
    expect(r.questions[0].answer).toBe('A');
    expect(r.questions[0].choices).toHaveLength(2);
    expect(r.questions[0].explanation).toBe('Standard가 기본이다.');
    expect(r.questions[1].answer).toBe('B');
  });

  test('body before the quiz heading is preserved', () => {
    expect(parseQuiz(KOREAN).before).toContain('본문입니다.');
    expect(parseQuiz(KOREAN).before).not.toContain('문제 1');
  });
});

describe('parseQuiz — English translated format', () => {
  // 영어판 콘텐츠는 Question/Answer/Explanation 토큰을 쓴다. 이걸 못 읽어서
  // day 파일 129개에서 문제가 통째로 렌더링되지 않고 있었다.
  test('extracts questions using English tokens', () => {
    const r = parseQuiz(ENGLISH);
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0].answer).toBe('A');
    expect(r.questions[0].explanation).toBe('Standard is the default.');
    expect(r.questions[1].number).toBe(2);
    expect(r.questions[1].answer).toBe('B');
  });
});

describe('parseQuiz — Problem/Answer variant', () => {
  // 영어판 상당수가 Question 대신 Problem을 쓴다(실측 196회).
  test('extracts questions written as **Problem N.**', () => {
    const body = [
      '# Day',
      '',
      'prose',
      '',
      '## 📝 Practice Problems',
      '',
      '**Problem 1.** Which service syncs on-prem NAS to S3 nightly?',
      'A) DataSync',
      'B) Snowball',
      '**Answer: A**',
      'Explanation: DataSync handles incremental sync.',
      '',
      '**Problem 2.** Fastest one-time 80TB migration?',
      'A) DataSync',
      'B) Snowball',
      '**Answer: B**',
      'Explanation: Network would take too long.',
      '',
    ].join('\n');
    const r = parseQuiz(body);
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0].answer).toBe('A');
    expect(r.questions[1].number).toBe(2);
    expect(r.questions[1].explanation).toBe('Network would take too long.');
  });

  test('handles Problem stems under a Korean heading', () => {
    const body = '# Day\n\n## 📝 연습 문제\n\n**Problem 1.** Q?\nA) a\nB) b\n**Answer: A**\nExplanation: x.\n';
    expect(parseQuiz(body).questions).toHaveLength(1);
  });
});

describe('parseQuiz — heading variants', () => {
  test.each([
    ['## 📝 연습 문제'],
    ['## 📝 시나리오 연습 문제'],
    ['## 연습문제'],
    ['## 📝 Practice Questions'],
    ['## 📝 Week 3 Comprehensive Practice Questions'],
    ['## 📝 Scenario Questions'],
    ['## 📝 Practice Problems'],
    ['## 📝 12 Scenario Problems'],
    ['## Self-Check Questions'],
  ])('recognises %s', (heading) => {
    const body = `# Day\n\nprose\n\n${heading}\n\n**문제 1.** Q?\nA) a\nB) b\n**정답: A**\n해설: because.\n`;
    expect(parseQuiz(body).questions).toHaveLength(1);
  });

  // 번역 과정에서 한글이 중국어·일본어 한자로 치환된 파일이 실제로 존재한다.
  test.each([['## 📝 練習 問題'], ['## 📝 연習 問題'], ['## 📝 連習 問題']])(
    'tolerates corrupted CJK heading %s',
    (heading) => {
      const body = `# Day\n\nprose\n\n${heading}\n\n**Question 1.** Q?\nA) a\nB) b\n**Answer: A**\nExplanation: because.\n`;
      expect(parseQuiz(body).questions).toHaveLength(1);
    },
  );
});

describe('parseQuiz — section boundary is anchored on the questions', () => {
  // 본문에 'Problems'/'Questions'가 들어간 제목이 먼저 나오면, 제목만 보고 자를 경우
  // 실제 퀴즈가 아닌 구간을 잘라내 문제가 통째로 사라진다.
  test('an earlier prose heading containing "Problems" does not hijack the section', () => {
    const body = [
      '# Day',
      '',
      '## Common Problems in Production',
      '',
      'Prose about failures. No questions here.',
      '',
      '## 📝 Practice Problems',
      '',
      '**Problem 1.** Q?',
      'A) a',
      'B) b',
      '**Answer: A**',
      'Explanation: because.',
      '',
    ].join('\n');
    const r = parseQuiz(body);
    expect(r.questions).toHaveLength(1);
    expect(r.before).toContain('Prose about failures.');
  });

  test('a trailing section after the quiz is returned as `after`', () => {
    const body = [
      '# Day',
      '',
      '## 📝 연습 문제',
      '',
      '**문제 1.** Q?',
      'A) a',
      'B) b',
      '**정답: A**',
      '해설: 이유.',
      '',
      '## 📌 오늘의 요약',
      '',
      '요약 내용.',
      '',
    ].join('\n');
    const r = parseQuiz(body);
    expect(r.questions).toHaveLength(1);
    expect(r.after).toContain('오늘의 요약');
    expect(r.after).toContain('요약 내용.');
  });
});

describe('parseQuiz — questions under an unrelated heading', () => {
  // 일부 영어 파일은 문제 블록이 '## Summary' / '## Wrapping Up' 아래에 있다.
  // 제목만 보고 포기하면 문제가 통째로 사라지므로 문제 스템으로 되찾는다.
  test('finds questions even when the heading is not quiz-like', () => {
    const body = `# Day\n\nprose\n\n## Summary\n\nSome recap text.\n\n**Question 1.** Q?\nA) a\nB) b\n**Answer: A**\nExplanation: because.\n`;
    const r = parseQuiz(body);
    expect(r.questions).toHaveLength(1);
    // 제목과 요약 산문은 잃지 않는다.
    expect(r.before).toContain('## Summary');
    expect(r.before).toContain('Some recap text.');
  });
});

describe('parseQuiz — choices packed onto one line', () => {
  // 일부 파일은 보기를 'A) x B) y C) z D) w'처럼 한 줄에 붙여 쓴다.
  // 줄 단위로만 읽으면 보기가 1개로 잡혀 문제 전체가 버려진다.
  test('splits inline choices into separate options', () => {
    const body = [
      '# Day',
      '',
      '## 📝 연습 문제',
      '',
      '**문제 1.** RPO 0과 RTO ~0이 필요하다. 적절한 DR 패턴은?',
      '',
      'A) Backup & Restore B) Pilot Light C) Warm Standby D) Active-Active',
      '',
      '**정답: D**',
      '',
      '해설: Active-Active가 무중단을 제공한다.',
      '',
    ].join('\n');
    const r = parseQuiz(body);
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0].choices.map((c) => c.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(r.questions[0].choices[0].text).toBe('Backup & Restore');
    expect(r.questions[0].choices[3].text).toBe('Active-Active');
    expect(r.questions[0].answer).toBe('D');
  });

  test('does not swallow the answer line into the last choice', () => {
    const body = [
      '# Day',
      '',
      '## 📝 연습 문제',
      '',
      '**문제 1.** Q?',
      'A) alpha B) beta',
      '**정답: B**',
      '해설: 이유.',
      '',
    ].join('\n');
    const r = parseQuiz(body);
    expect(r.questions[0].choices).toHaveLength(2);
    expect(r.questions[0].choices[1].text).toBe('beta');
  });

  test('one-per-line choices still win when present', () => {
    const body = '# Day\n\n## 📝 연습 문제\n\n**문제 1.** Q?\nA) alpha\nB) beta\nC) gamma\n**정답: C**\n해설: x.\n';
    const r = parseQuiz(body);
    expect(r.questions[0].choices).toHaveLength(3);
    expect(r.questions[0].choices[2].text).toBe('gamma');
  });
});

describe('parseQuiz — degenerate input', () => {
  test('returns the whole body when there is no quiz at all', () => {
    const body = '# Day\n\nJust prose, no questions.\n';
    const r = parseQuiz(body);
    expect(r.questions).toHaveLength(0);
    expect(r.before).toBe(body);
  });

  test('ignores a heading whose questions are placeholders', () => {
    const body = '# Day\n\n## 📝 연습 문제\n\n**문제 1 through 8 (Korean, untranslated)**\n';
    expect(parseQuiz(body).questions).toHaveLength(0);
  });

  test('drops a question with fewer than two choices', () => {
    const body = '# Day\n\n## 📝 연습 문제\n\n**문제 1.** Q?\nA) only one\n**정답: A**\n해설: x.\n';
    expect(parseQuiz(body).questions).toHaveLength(0);
  });
});
