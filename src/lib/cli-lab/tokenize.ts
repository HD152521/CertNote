// 셸 한 줄을 인자 배열로 나눈다. bash 전체가 아니라 AWS CLI 연습에 필요한 만큼만:
// 작은따옴표(그대로), 큰따옴표(\" \\ 이스케이프), 줄 끝 역슬래시 이어 쓰기, 토큰 첫머리 # 주석.

export type TokenizeResult = { ok: true; tokens: string[] } | { ok: false; error: string };

export function tokenize(line: string): TokenizeResult {
  const src = line.replace(/\\\r?\n/g, ' ');
  const tokens: string[] = [];
  let current = '';
  let inToken = false;
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    if (ch === "'") {
      const end = src.indexOf("'", i + 1);
      if (end === -1) return { ok: false, error: "unexpected EOF while looking for matching `''" };
      current += src.slice(i + 1, end);
      inToken = true;
      i = end + 1;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let value = '';
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\' && (src[j + 1] === '"' || src[j + 1] === '\\')) {
          value += src[j + 1];
          j += 2;
        } else {
          value += src[j];
          j += 1;
        }
      }
      if (j >= src.length) return { ok: false, error: 'unexpected EOF while looking for matching `"\'' };
      current += value;
      inToken = true;
      i = j + 1;
      continue;
    }
    if (/\s/.test(ch)) {
      if (inToken) tokens.push(current);
      current = '';
      inToken = false;
      i += 1;
      continue;
    }
    if (ch === '#' && !inToken) break;
    current += ch;
    inToken = true;
    i += 1;
  }
  if (inToken) tokens.push(current);
  return { ok: true, tokens };
}
