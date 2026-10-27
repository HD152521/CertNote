import { describe, expect, test } from 'vitest';
import { tokenizeInlineMd } from './inlineMd';

describe('tokenizeInlineMd', () => {
  test('returns no tokens for an empty string', () => {
    expect(tokenizeInlineMd('')).toEqual([]);
  });

  test('keeps plain text as one token', () => {
    expect(tokenizeInlineMd('그냥 문장')).toEqual([{ kind: 'text', value: '그냥 문장' }]);
  });

  test('turns **bold** into a strong token', () => {
    expect(tokenizeInlineMd('도입 전에 **Direct Connect + 본사 DC** 조합')).toEqual([
      { kind: 'text', value: '도입 전에 ' },
      { kind: 'strong', value: 'Direct Connect + 본사 DC' },
      { kind: 'text', value: ' 조합' },
    ]);
  });

  test('turns `code` into a code token', () => {
    expect(tokenizeInlineMd('`ap-northeast-2`는 서울')).toEqual([
      { kind: 'code', value: 'ap-northeast-2' },
      { kind: 'text', value: '는 서울' },
    ]);
  });

  test('does not parse asterisks inside code', () => {
    expect(tokenizeInlineMd('글롭 `**/*.log` 패턴')).toEqual([
      { kind: 'text', value: '글롭 ' },
      { kind: 'code', value: '**/*.log' },
      { kind: 'text', value: ' 패턴' },
    ]);
  });

  test('handles bold and code together', () => {
    const kinds = tokenizeInlineMd('**정답** 은 `s3:GetObject` 권한').map((t) => t.kind);
    expect(kinds).toEqual(['strong', 'text', 'code', 'text']);
  });

  test('leaves an unmatched ** as literal text', () => {
    expect(tokenizeInlineMd('짝 없는 **기호')).toEqual([{ kind: 'text', value: '짝 없는 **기호' }]);
  });

  test('turns a space-bounded *word* into emphasis', () => {
    expect(tokenizeInlineMd('이건 *아닌* 경우')).toEqual([
      { kind: 'text', value: '이건 ' },
      { kind: 'em', value: '아닌' },
      { kind: 'text', value: ' 경우' },
    ]);
  });

  test('does not treat cron or glob asterisks as emphasis', () => {
    expect(tokenizeInlineMd('cron 필드 (*)-월(*) 과 *.log')).toEqual([
      { kind: 'text', value: 'cron 필드 (*)-월(*) 과 *.log' },
    ]);
  });

  test('preserves the full text when tokens are joined', () => {
    const src = 'A는 **굵게**, B는 `코드`, C는 *기울임* 이다.';
    const joined = tokenizeInlineMd(src)
      .map((t) => (t.kind === 'strong' ? `**${t.value}**` : t.kind === 'code' ? `\`${t.value}\`` : t.kind === 'em' ? `*${t.value}*` : t.value))
      .join('');
    expect(joined).toBe(src);
  });
});
