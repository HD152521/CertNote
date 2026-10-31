// 골든 테스트: 실제 Rocky Linux 8.8 컨테이너에서 찍은 출력(golden/results.json)과 시뮬레이터 출력을 비교한다.
// 결과를 다시 찍으려면: docker build -t certnote-rocky88 scripts/shell-lab && node scripts/shell-lab/golden.mjs
import { describe, expect, it } from 'vitest';
import results from './golden/results.json';
import scenarios from './golden/scenarios.json';
import { runLine } from './run';
import { accountByName, createInitialState, session } from './state';
import type { ShellState } from './types';

interface Step {
  cmd: string;
  as?: string;
  norm?: string[];
}

interface Golden {
  cmd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

// 시각·장치 번호·inode 번호는 실행 환경마다 다르므로 양쪽 모두 같은 자리표시로 바꾼다.
const LS_DATE = /\b[A-Z][a-z]{2} [ \d]\d (?:\d\d:\d\d| \d{4})\b/g;

function normalize(text: string, norm: string[] = []): string {
  let t = text.replace(LS_DATE, 'DATE');
  if (norm.includes('stat')) {
    t = t
      .replace(/^Device: .*?\tInode: \d+ +/m, 'Device: DEV\tInode: INO  ')
      .replace(/^(Access|Modify|Change| Birth): \d{4}-.*$/gm, '$1: TIME');
  }
  if (norm.includes('isodate')) t = t.replace(/\d{4}-\d\d-\d\d/g, 'DAY');
  if (norm.includes('inode')) {
    const seen = new Map<string, string>();
    t = t.replace(/^ *(\d+) /gm, (_, n: string) => {
      if (!seen.has(n)) seen.set(n, `I${seen.size + 1}`);
      return `${seen.get(n)} `;
    });
  }
  if (norm.includes('dotdot')) t = t.split('\n').filter((l) => !l.endsWith(' ..')).join('\n');
  if (norm.includes('sort')) {
    const lines = t.split('\n');
    const last = lines.pop();
    t = [...lines.sort(), last].join('\n');
  }
  return t;
}

/** 다른 사용자로 한 줄 실행 (runuser -u 와 같다: 같은 디렉터리, umask 그대로). */
function runAs(state: ShellState, user: string, line: string) {
  const account = accountByName(state, user);
  if (!account) throw new Error(`no user ${user}`);
  const base = session(state);
  const pushed: ShellState = { ...state, sessions: [...state.sessions, { ...base, uid: account.uid, login: false }] };
  const r = runLine(line, pushed);
  return { ...r, state: { ...r.state, sessions: r.state.sessions.slice(0, -1) } };
}

describe.each(scenarios as { id: string; prelude?: string[]; steps: Step[] }[])('golden: $id', (scenario) => {
  const golden = (results as Record<string, Golden[]>)[scenario.id];

  it('matches Rocky Linux 8.8 output step by step', () => {
    let state = createInitialState();
    for (const line of scenario.prelude ?? []) {
      const r = runLine(line, state);
      expect(r.exitCode, `prelude: ${line}\n${r.stderr}${r.note ?? ''}`).toBe(0);
      state = r.state;
    }
    // 틀린 단계를 모두 모아 한 번에 보여 준다(앞 단계가 틀려도 뒤 단계 상태는 시뮬레이터 기준으로 이어 간다).
    const mismatches: string[] = [];
    scenario.steps.forEach((step, i) => {
      const r = step.as ? runAs(state, step.as, step.cmd) : runLine(step.cmd, state);
      state = r.state;
      const want = golden[i];
      const got = { stdout: normalize(r.stdout, step.norm), stderr: normalize(r.stderr, step.norm), exit: r.exitCode };
      const exp = { stdout: normalize(want.stdout, step.norm), stderr: normalize(want.stderr, step.norm), exit: want.exitCode };
      if (JSON.stringify(got) !== JSON.stringify(exp)) {
        mismatches.push(`#${i} ${step.as ? `(${step.as}) ` : ''}${step.cmd}\n  want ${JSON.stringify(exp)}\n  got  ${JSON.stringify(got)}`);
      }
    });
    expect(mismatches.join('\n')).toBe('');
  });
});
