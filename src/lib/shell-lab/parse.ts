// bash 한 줄 해석: 따옴표·\ 이스케이프, 연산자(| ; && ||), 리다이렉트(> >> 2> 2>&1 <),
// 확장(~, $VAR, $?, 와일드카드 * ? [..]). 지원하지 않는 문법은 unsupported 로 돌려 안내한다.

export interface Word {
  /** 따옴표를 벗긴 글자 */
  text: string;
  /** 글자마다 따옴표 안이었는지 — 와일드카드·~ 확장은 따옴표 밖 글자에만 */
  quoted: boolean[];
  /** '' 나 "" 처럼 따옴표가 있었나 — 빈 따옴표는 빈 인자로 남는다 */
  hadQuotes?: boolean;
}

export interface Redirect {
  fd: 1 | 2 | 0;
  op: '>' | '>>' | '<' | '>&1';
  target?: Word;
}

export interface SimpleCommand {
  words: Word[];
  redirects: Redirect[];
}

export interface Pipeline {
  commands: SimpleCommand[];
}

export interface ListItem {
  pipeline: Pipeline;
  /** 이 파이프라인 다음에 오는 연산자 */
  next?: ';' | '&&' | '||';
}

export type ParseResult = { ok: true; items: ListItem[] } | { ok: false; error: string; unsupported?: string };

type Token = { kind: 'word'; word: Word } | { kind: 'op'; op: string };

const OPERATORS = ['&&', '||', '2>>', '2>&1', '&>', '2>', '>>', '>&', '|', ';', '>', '<', '&'];

function tokenize(line: string): { tokens: Token[] } | { error: string; unsupported?: string } {
  const tokens: Token[] = [];
  let i = 0;
  let cur: Word | null = null;
  const push = (ch: string, quoted: boolean) => {
    cur ??= { text: '', quoted: [] };
    cur.text += ch;
    cur.quoted.push(quoted);
  };
  const flush = () => {
    if (cur) tokens.push({ kind: 'word', word: cur });
    cur = null;
  };
  while (i < line.length) {
    const ch = line[i];
    if (ch === ' ' || ch === '\t') {
      flush();
      i++;
      continue;
    }
    if (ch === '#' && !cur) break;
    if (ch === '\\') {
      if (i + 1 < line.length) push(line[i + 1], true);
      i += 2;
      continue;
    }
    if (ch === "'") {
      const end = line.indexOf("'", i + 1);
      if (end < 0) return { error: 'unterminated', unsupported: '따옴표가 닫히지 않았어요' };
      cur ??= { text: '', quoted: [] };
      cur.hadQuotes = true;
      for (const c of line.slice(i + 1, end)) push(c, true);
      i = end + 1;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      cur ??= { text: '', quoted: [] };
      cur.hadQuotes = true;
      while (j < line.length && line[j] !== '"') {
        if (line[j] === '\\' && /["\\$`]/.test(line[j + 1] ?? '')) {
          push(line[j + 1], true);
          j += 2;
        } else if (line[j] === '$') {
          // 큰따옴표 안의 $ 는 확장 대상 — 표시만 해 두고 expand 에서 처리
          push('\u0000', false);
          j++;
        } else {
          push(line[j], true);
          j++;
        }
      }
      if (j >= line.length) return { error: 'unterminated', unsupported: '따옴표가 닫히지 않았어요' };
      i = j + 1;
      continue;
    }
    if (ch === '`' || (ch === '$' && line[i + 1] === '(')) {
      return { error: 'unsupported', unsupported: '명령 치환($(...), `...`)' };
    }
    const op = OPERATORS.find((o) => line.startsWith(o, i));
    // 2> 는 단어 맨 앞에서만 연산자다 (abc2>x 는 abc2 > x)
    if (op && !(op.startsWith('2') && cur)) {
      flush();
      tokens.push({ kind: 'op', op });
      i += op.length;
      continue;
    }
    push(ch, false);
    i++;
  }
  flush();
  return { tokens };
}

export function parseLine(line: string): ParseResult {
  const t = tokenize(line);
  if ('error' in t) return { ok: false, error: t.error, unsupported: t.unsupported };
  const items: ListItem[] = [];
  let pipeline: Pipeline = { commands: [] };
  let command: SimpleCommand = { words: [], redirects: [] };
  const syntax = (tok: string) => ({ ok: false as const, error: `-bash: syntax error near unexpected token \`${tok}'` });
  const endCommand = (tok: string) => {
    if (command.words.length === 0 && command.redirects.length === 0) return false;
    pipeline.commands.push(command);
    command = { words: [], redirects: [] };
    return tok !== '';
  };
  const { tokens } = t;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.kind === 'word') {
      command.words.push(tok.word);
      continue;
    }
    const { op } = tok;
    if (op === '&') return { ok: false, error: 'background', unsupported: '백그라운드 실행(&)' };
    if (op === '|') {
      if (!endCommand(op)) return syntax(op);
      continue;
    }
    if (op === ';' || op === '&&' || op === '||') {
      if (!endCommand(op)) return syntax(op);
      items.push({ pipeline, next: op });
      pipeline = { commands: [] };
      continue;
    }
    if (op === '2>&1') {
      command.redirects.push({ fd: 2, op: '>&1' });
      continue;
    }
    const target = tokens[i + 1];
    if (!target || target.kind !== 'word') return syntax(target?.kind === 'op' ? target.op : 'newline');
    i++;
    if (op === '>' || op === '>>') command.redirects.push({ fd: 1, op, target: target.word });
    else if (op === '2>') command.redirects.push({ fd: 2, op: '>', target: target.word });
    else if (op === '2>>') command.redirects.push({ fd: 2, op: '>>', target: target.word });
    else if (op === '&>' || op === '>&') {
      command.redirects.push({ fd: 1, op: '>', target: target.word });
      command.redirects.push({ fd: 2, op: '>&1' });
    } else if (op === '<') command.redirects.push({ fd: 0, op: '<', target: target.word });
  }
  if (command.words.length || command.redirects.length) pipeline.commands.push(command);
  else if (pipeline.commands.length) return syntax('newline');
  if (pipeline.commands.length) items.push({ pipeline });
  else if (items.length && items[items.length - 1].next !== ';') return syntax('newline');
  return { ok: true, items };
}

export interface ExpandEnv {
  vars: Record<string, string>;
  home: (user?: string) => string | undefined;
  /** 와일드카드 패턴에 맞는 경로 목록(정렬됨). 없으면 빈 배열. */
  glob: (pattern: string) => string[];
}

const VAR_RE = /^(\?|[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})/;

/** 단어 하나를 확장한다. 와일드카드가 맞으면 여러 단어가 된다. */
export function expandWord(word: Word, env: ExpandEnv): string[] {
  let text = '';
  const globbable: boolean[] = [];
  const chars = [...word.text];
  const quoted = word.quoted;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const q = quoted[i];
    const inDouble = c === '\u0000';
    if ((c === '$' && !q) || inDouble) {
      const rest = chars.slice(i + 1).join('');
      const m = VAR_RE.exec(rest);
      if (m) {
        const name = m[1].replace(/[{}]/g, '');
        const value = env.vars[name] ?? '';
        for (const v of value) {
          text += v;
          globbable.push(false);
        }
        i += m[1].length;
        continue;
      }
      text += '$';
      globbable.push(false);
      continue;
    }
    if (c === '~' && !q && i === 0) {
      const m = /^~([a-z_][a-z0-9_-]*)?(?=\/|$)/.exec(chars.join(''));
      const home = m ? env.home(m[1]) : undefined;
      if (m && home !== undefined) {
        for (const v of home) {
          text += v;
          globbable.push(false);
        }
        i += m[0].length - 1;
        continue;
      }
    }
    text += c;
    globbable.push(!q && /[*?[]/.test(c));
  }
  if (globbable.some(Boolean)) {
    const matches = env.glob(text);
    if (matches.length) return matches;
  }
  // 따옴표 없이 쓴 단어가 확장 뒤 비면 bash 는 인자에서 뺀다(ls $NOPE → ls).
  if (text === '' && !word.hadQuotes) return [];
  return [text];
}

/** 와일드카드 한 조각을 정규식으로. [z-a] 처럼 잘못된 패턴이면 null — bash 는 그 단어를 글자 그대로 둔다. */
export function globToRegExp(pattern: string): RegExp | null {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '[') {
      const end = pattern.indexOf(']', i + 2);
      if (end < 0) {
        re += '\\[';
        continue;
      }
      let body = pattern.slice(i + 1, end);
      if (body.startsWith('!')) body = `^${body.slice(1)}`;
      re += `[${body.replace(/\\/g, '\\\\')}]`;
      i = end;
    } else re += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  try {
    return new RegExp(`^${re}$`);
  } catch {
    return null;
  }
}
