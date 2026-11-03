// SQL 낱말 나누기. 따옴표 없는 이름은 Oracle 처럼 대문자로 바꾸고, "큰따옴표" 이름은 그대로 둔다.
import { OraError } from './values';

export type TokenKind = 'word' | 'quoted' | 'number' | 'string' | 'op' | 'end';

export interface Token {
  kind: TokenKind;
  /** word 는 대문자, quoted 는 원문, string 은 따옴표를 푼 값 */
  value: string;
  /** 원문 위치 — 열 제목(SELECT 식의 원문)과 오류 위치에 쓴다 */
  start: number;
  end: number;
}

const OPS = ['<>', '!=', '^=', '<=', '>=', '||', '(+)', '=', '<', '>', '+', '-', '*', '/', '(', ')', ',', '.', ';'];

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // 주석: -- 한 줄, /* 여러 줄 */
    if (src.startsWith('--', i)) {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (src.startsWith('/*', i)) {
      const close = src.indexOf('*/', i + 2);
      i = close < 0 ? src.length : close + 2;
      continue;
    }
    const start = i;
    if (c === "'") {
      let value = '';
      i++;
      for (;;) {
        if (i >= src.length) throw new OraError('ORA-01756', 'quoted string not properly terminated');
        if (src[i] === "'") {
          if (src[i + 1] === "'") {
            value += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        value += src[i++];
      }
      out.push({ kind: 'string', value, start, end: i });
      continue;
    }
    if (c === '"') {
      const close = src.indexOf('"', i + 1);
      if (close < 0) throw new OraError('ORA-01740', 'missing double quote in identifier');
      const value = src.slice(i + 1, close);
      if (!value) throw new OraError('ORA-01741', 'illegal zero-length identifier');
      i = close + 1;
      out.push({ kind: 'quoted', value, start, end: i });
      continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] ?? ''))) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i))!;
      i += m[0].length;
      out.push({ kind: 'number', value: m[0], start, end: i });
      continue;
    }
    // 문서에서 복사한 굽은 따옴표·전각 기호는 이름이 아니라 잘못된 글자다(Oracle: ORA-00911).
    if (/[‘’“”＇＂（），；]/.test(c)) {
      throw new OraError('ORA-00911', `${c}: invalid character`, "굽은 따옴표(‘ ’ “ ”)나 전각 괄호·쉼표가 들어 있어요. 문서에서 복사했다면 곧은 따옴표(' \")로 바꿔 주세요.");
    }
    if (/[A-Za-z_$#À-￿]/.test(c)) {
      const m = /^[A-Za-z_$#À-￿][A-Za-z0-9_$#À-￿]*/.exec(src.slice(i))!;
      i += m[0].length;
      out.push({ kind: 'word', value: m[0].toUpperCase(), start, end: i });
      continue;
    }
    // (+) 는 사이 공백을 허용한다: ( + )
    const outer = /^\(\s*\+\s*\)/.exec(src.slice(i));
    if (outer) {
      i += outer[0].length;
      out.push({ kind: 'op', value: '(+)', start, end: i });
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new OraError('ORA-00911', `${c}: invalid character`);
    i += op.length;
    out.push({ kind: 'op', value: op, start, end: i });
  }
  out.push({ kind: 'end', value: '', start: src.length, end: src.length });
  return out;
}

/** 열 제목: Oracle 은 식의 원문에서 공백을 지우고 대문자로 바꾼 것을 제목으로 쓴다(따옴표 안도 같다). */
export function headingOf(src: string, start: number, end: number): string {
  return src.slice(start, end).replace(/\s+/g, '').toUpperCase();
}
