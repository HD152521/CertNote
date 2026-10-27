// 퀴즈 문항·보기·해설 문자열의 인라인 마크다운을 토큰으로 나눈다.
// 퀴즈는 parseQuiz 가 원문에서 떼어 낸 평문이라 MDX 를 거치지 않는다. 그대로 렌더하면
// `**굵게**`·`` `코드` `` 기호가 화면에 노출된다. 블록 요소(목록·표)는 다루지 않는다.
//
// 짝이 맞지 않는 기호는 평문으로 남긴다 — 내용이 사라지는 것보다 기호가 보이는 쪽이 낫다.

export type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'em'; value: string }
  | { kind: 'code'; value: string };

const CODE = /`([^`\n]+)`/g;
const STRONG = /\*\*([^*\n]+?)\*\*/g;
// 기울임은 공백(또는 줄 끝·문장부호)으로 둘러싸인 *단어* 만 인정한다. cron 표기 "(*)" 나
// 글롭 "*.log" 같은 별표를 기울임으로 오인하지 않으려는 것이다.
const EM = /(^|\s)\*([^*\s](?:[^*\n]*[^*\s])?)\*(?=$|[\s.,!?)\]:;])/g;

function splitBy(
  tokens: InlineToken[],
  re: RegExp,
  kind: 'strong' | 'em' | 'code',
  leadGroup = false,
): InlineToken[] {
  return tokens.flatMap((tok) => {
    if (tok.kind !== 'text') return [tok];
    const out: InlineToken[] = [];
    let last = 0;
    for (const m of tok.value.matchAll(re)) {
      const lead = leadGroup ? m[1] : '';
      const inner = leadGroup ? m[2] : m[1];
      const start = (m.index ?? 0) + lead.length;
      if (start > last) out.push({ kind: 'text', value: tok.value.slice(last, start) });
      out.push({ kind, value: inner });
      last = (m.index ?? 0) + m[0].length;
    }
    if (last < tok.value.length) out.push({ kind: 'text', value: tok.value.slice(last) });
    return out;
  });
}

export function tokenizeInlineMd(source: string): InlineToken[] {
  if (!source) return [];
  // 코드를 먼저 떼어야 코드 안의 별표가 굵게·기울임으로 해석되지 않는다.
  const code = splitBy([{ kind: 'text', value: source }], CODE, 'code');
  const strong = splitBy(code, STRONG, 'strong');
  return splitBy(strong, EM, 'em', true);
}
