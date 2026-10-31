// 명령 구현이 공통으로 쓰는 것: 실행 문맥, GNU 식 옵션 해석, 오류 문구 모양.
import { ERRNO_TEXT, FsError, type Errno } from '../fs';
import type { ShellState } from '../types';

export interface Io {
  stdin: string;
  /** 표준 출력이 터미널이면 ls 가 여러 칸으로 찍는다(파이프·리다이렉트면 한 줄에 하나). */
  stdoutTty: boolean;
  out: (s: string) => void;
  err: (s: string) => void;
  note: (s: string) => void;
}

export interface Ctx {
  st: ShellState;
  name: string;
  args: string[];
  io: Io;
  /** find -exec 처럼 다른 명령을 실행할 때 */
  exec: (argv: string[], io: Io) => number;
}

export type Command = (ctx: Ctx) => number;

export interface Parsed {
  flags: Record<string, true>;
  values: Record<string, string>;
  operands: string[];
}

/**
 * GNU getopt 처럼: -abc 묶음, -n 5 / -n5, 옵션이 피연산자 뒤에 와도 된다, -- 뒤는 전부 피연산자.
 * 모르는 옵션이면 문구를 stderr 에 쓰고 null.
 */
export function getopt(
  ctx: Ctx,
  spec: { flags: string; values?: string; long?: Record<string, string> },
  usageExit = 1,
): Parsed | { exit: number } {
  const flags: Record<string, true> = {};
  const values: Record<string, string> = {};
  const operands: string[] = [];
  const { args, name, io } = ctx;
  const tryHelp = `Try '${name} --help' for more information.\n`;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      operands.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const long = spec.long?.[a.slice(2)];
      if (long) {
        flags[long] = true;
        continue;
      }
      if (a === '--help') {
        io.note(`${name} --help 는 연습장에서 지원하지 않아요. 실제 시스템에서는 사용법 전체가 나와요.`);
        return { exit: 0 };
      }
      io.err(`${name}: unrecognized option '${a}'\n${tryHelp}`);
      return { exit: usageExit };
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const c = a[j];
        if (spec.values?.includes(c)) {
          const rest = a.slice(j + 1);
          const value = rest || args[++i];
          if (value === undefined) {
            io.err(`${name}: option requires an argument -- '${c}'\n${tryHelp}`);
            return { exit: usageExit };
          }
          values[c] = value;
          break;
        }
        if (!spec.flags.includes(c)) {
          io.err(`${name}: invalid option -- '${c}'\n${tryHelp}`);
          return { exit: usageExit };
        }
        flags[c] = true;
      }
      continue;
    }
    operands.push(a);
  }
  return { flags, values, operands };
}

export const isExit = (p: Parsed | { exit: number }): p is { exit: number } => 'exit' in p;

export function missingOperand(ctx: Ctx, after?: string): number {
  const what = ctx.name === 'cp' || ctx.name === 'mv' || ctx.name === 'ln' ? 'file operand' : 'operand';
  const tail = after === undefined ? '' : ` after '${after}'`;
  const label = after !== undefined && what === 'file operand' ? 'destination file operand' : what;
  ctx.io.err(`${ctx.name}: missing ${label}${tail}\nTry '${ctx.name} --help' for more information.\n`);
  return 1;
}

export const errnoOf = (e: unknown): Errno => (e instanceof FsError ? e.errno : 'EINVAL');
export const errText = (e: unknown) => ERRNO_TEXT[errnoOf(e)];
export const q = (s: string) => `'${s}'`;
