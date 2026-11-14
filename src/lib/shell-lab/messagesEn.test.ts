import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shellStrings } from '../../components/shell-lab/i18n';
import { hasHangul, translateShellMessageEn } from './messagesEn';
import { runLine } from './run';
import { createInitialState } from './state';

const ENGINE_DIR = __dirname;
const COMPONENT_DIR = join(__dirname, '../../components/shell-lab');

const engineFiles = [
  ...readdirSync(join(ENGINE_DIR, 'commands')).map((f) => join(ENGINE_DIR, 'commands', f)),
  ...['fs.ts', 'parse.ts', 'run.ts', 'state.ts', 'format.ts', 'quizSandbox.ts', 'mode.ts', 'types.ts', 'complete.ts', 'baseFiles.ts'].map((f) =>
    join(ENGINE_DIR, f),
  ),
].filter((f) => f.endsWith('.ts'));

/** Hangul string literals that are real code (not comments). Template placeholders become a sample word. */
function koreanLiterals(file: string): string[] {
  const out: string[] = [];
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const t = raw.trim();
    if (!hasHangul(t) || /^(\/\/|\/\*|\*)/.test(t)) continue;
    const re = /(['"`])((?:\\.|(?!\1).)*?)\1/g;
    for (const m of t.matchAll(re)) {
      if (hasHangul(m[2])) out.push(m[2].replace(/\$\{[^}]*\}/g, 'x').replace(/\\(.)/g, '$1'));
    }
  }
  return out;
}

describe('simulator guidance messages in English', () => {
  it('every Korean string literal in the engine has an English rule', () => {
    const literals = engineFiles.flatMap((f) => koreanLiterals(f).map((s) => ({ f, s })));
    expect(literals.length).toBeGreaterThan(20);
    for (const { f, s } of literals) {
      // parse.ts returns the unsupported feature name, which run.ts wraps in a sentence.
      const text = f.endsWith('parse.ts') ? `${s} 은(는) 연습장에서 아직 지원하지 않아요.` : s;
      const en = translateShellMessageEn(text);
      expect(hasHangul(en), `${f}: ${s}`).toBe(false);
      expect(en, `${f}: ${s}`).not.toMatch(/only available in Korean/);
    }
  });

  it('translates real simulator output and leaves real command output alone', () => {
    const r = runLine('tail -f /etc/passwd', createInitialState());
    expect(hasHangul(r.note ?? '')).toBe(true);
    expect(translateShellMessageEn(r.note ?? '')).toMatch(/tail -f/);
    expect(hasHangul(translateShellMessageEn(r.note ?? ''))).toBe(false);
    const bad = runLine('cat /nope', createInitialState());
    expect(translateShellMessageEn(bad.stderr)).toBe(bad.stderr);
    const parse = runLine('echo $(whoami)', createInitialState());
    expect(hasHangul(translateShellMessageEn(parse.note ?? ''))).toBe(false);
    const help = runLine('help', createInitialState());
    expect(translateShellMessageEn(help.note ?? '')).toMatch(/^Supported commands:/);
  });

  it('passes real command errors that contain a typed Hangul name through verbatim', () => {
    for (const line of [
      'cat: 한글: No such file or directory',
      'bash: 한글: command not found',
      'ls: cannot access 한글.txt: No such file or directory',
      'rm: cannot remove 가: Is a directory',
    ]) {
      expect(translateShellMessageEn(line), line).toBe(line);
    }
    const r = runLine('cat 한글', createInitialState());
    expect(translateShellMessageEn(r.stderr)).toBe(r.stderr);
  });

  it('still translates guidance lines, including ones that mention a command', () => {
    expect(translateShellMessageEn('useradd 다음에 만들 사용자 이름을 하나 적어 주세요. 예: bob')).toMatch(/^Give one user name/);
    expect(translateShellMessageEn('지원하는 명령: ls, cat. 그 밖에 clear(화면 정리), reset(처음 상태로).')).toMatch(/^Supported commands/);
    const find = translateShellMessageEn('find 의 -regex 조건은 연습장에서 아직 지원하지 않아요. -name -type -exec 를 쓸 수 있어요.');
    expect(find).toContain('-name, -type, -exec');
  });

  it('falls back to a plain English line for unknown Korean text', () => {
    expect(hasHangul(translateShellMessageEn('알 수 없는 안내'))).toBe(false);
  });
});

describe('shell component text', () => {
  const ko = shellStrings('ko');
  const en = shellStrings('en');
  // Call every function-valued entry with sample arguments; the extra arguments are ignored by smaller signatures.
  const flatten = (s: ReturnType<typeof shellStrings>): string[] =>
    Object.values(s).flatMap((v): string[] => {
      if (typeof v === 'string') return [v];
      const call = v as unknown as (...args: unknown[]) => string;
      return [call(1, 3, 'T'), call(2, true, 'T'), call('x', 'y', 'z')].map(String);
    });

  it('English dictionary has the same keys as Korean and no Hangul', () => {
    expect(Object.keys(en)).toEqual(Object.keys(ko));
    for (const text of flatten(en)) expect(hasHangul(text), text).toBe(false);
  });

  it('keeps the existing Korean wording', () => {
    expect(ko.inputLabel).toBe('리눅스 명령 입력');
    expect(ko.stepPassed(2, '제목')).toBe('STEP 2 통과 · 제목');
    expect(ko.conditions).toBe('[조건]');
    expect(ko.problemAria(3, true, 'x')).toBe('문제 3 정답: x');
  });

  it('no component other than i18n.ts hard-codes user-visible Korean', () => {
    const files = readdirSync(COMPONENT_DIR).filter((f) => /\.tsx?$/.test(f) && f !== 'i18n.ts' && !f.endsWith('.test.ts'));
    for (const f of files) {
      const src = readFileSync(join(COMPONENT_DIR, f), 'utf8');
      const bad = src
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => hasHangul(l) && !/^(\/\/|\/\*|\*|\{\/\*)/.test(l));
      // Whatever is left may only be a trailing comment, never a string literal or JSX text.
      const real = bad.filter((l) => {
        const code = l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        return hasHangul(code);
      });
      expect(real, f).toEqual([]);
    }
  });
});
