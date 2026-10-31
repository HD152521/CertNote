// 골든 파일로 잡을 수 없는 연습장 동작(대화형 셸, 확인 질문, 안내 문구)과 과제 판정.
import { describe, expect, it } from 'vitest';
import { complete } from './complete';
import { SHELL_LABS, labInitialState } from './labs';
import { prompt, runLine } from './run';
import { createInitialState } from './state';
import type { ShellState } from './types';

function run(lines: string[], start: ShellState = createInitialState()) {
  let st = start;
  let last = runLine('', st);
  for (const line of lines) {
    last = runLine(line, st);
    st = last.state;
  }
  return last;
}

describe('interactive shell', () => {
  it('starts as root in /root with the Rocky prompt', () => {
    expect(prompt(createInitialState())).toBe('[root@localhost ~]# ');
  });

  it('su - switches user, home and umask; exit returns to root', () => {
    const r = run(['useradd -m kim', 'su - kim', 'pwd', 'umask']);
    expect(prompt(r.state)).toBe('[kim@localhost ~]$ ');
    expect(r.stdout).toBe('0002\n');
    const back = runLine('exit', r.state);
    expect(back.stdout).toBe('logout\n');
    expect(prompt(back.state)).toBe('[root@localhost ~]# ');
  });

  it('su without - keeps the directory', () => {
    const r = run(['useradd kim', 'cd /tmp', 'su kim', 'pwd']);
    expect(r.stdout).toBe('/tmp\n');
  });

  it('does not let a normal user su back with a password it cannot type', () => {
    const r = run(['useradd kim', 'su kim', 'su -']);
    expect(r.exitCode).toBe(1);
    expect(r.note).toMatch(/exit/);
  });

  it('asks before removing a write-protected file and treats it as no', () => {
    const r = run(['useradd kim', 'chmod 777 /tmp', 'cd /tmp', 'su kim', 'touch f', 'chmod 444 f', 'rm f']);
    expect(r.stderr).toBe("rm: remove write-protected regular empty file 'f'? \n");
    expect(runLine('ls', r.state).stdout).toBe('f\n');
    expect(runLine('rm -f f', r.state).exitCode).toBe(0);
  });

  it('explains real commands that are not simulated yet instead of claiming they do not exist', () => {
    const r = run(['vi notes.txt']);
    expect(r.stderr).toBe('');
    expect(r.note).toMatch(/아직 지원하지 않아요/);
  });

  it('keeps the original state untouched (copy on every line)', () => {
    const st = createInitialState();
    const before = JSON.stringify(st);
    runLine('mkdir /x; useradd kim', st);
    expect(JSON.stringify(st)).toBe(before);
  });

  it('runs find -exec through the same command table', () => {
    const r = run(['mkdir /w', 'cd /w', 'touch a.c b.c', 'find . -name "*.c" -exec chmod 600 {} \\;', 'stat -c "%a %n" a.c b.c']);
    expect(r.stdout).toBe('600 a.c\n600 b.c\n');
  });
});

describe('tab completion', () => {
  it('completes command names and paths', () => {
    const st = createInitialState();
    expect(complete('user', st).candidates).toEqual(['useradd', 'userdel', 'usermod']);
    expect(complete('whoa', st).line).toBe('whoami ');
    expect(complete('ls /et', st).line).toBe('ls /etc/');
    expect(complete('cat /etc/pas', st).line).toBe('cat /etc/passwd ');
  });
});

describe('shell labs', () => {
  const solve = (labId: string) => {
    const lab = SHELL_LABS.find((l) => l.id === labId)!;
    let st = labInitialState(lab);
    const done: string[] = [];
    for (const step of lab.steps) {
      for (const line of step.answer.split('\n')) {
        const result = runLine(line, st);
        st = result.state;
        for (const s of lab.steps) if (!done.includes(s.id) && s.isDone({ state: st, result })) done.push(s.id);
      }
    }
    return { lab, done };
  };

  it.each(SHELL_LABS.map((l) => l.id))('%s: following every answer passes every step', (id) => {
    const { lab, done } = solve(id);
    expect(done).toEqual(lab.steps.map((s) => s.id));
  });

  it('L1 step 2 passes even after an earlier chmod -x (user report 2026-10-31)', () => {
    const lab = SHELL_LABS.find((l) => l.id === 'linux-perm-basics')!;
    let st = labInitialState(lab);
    const passed: string[] = [];
    for (const line of ['chmod 754 report.txt', 'chmod -x report.txt', 'chmod u-x,g+w report.txt']) {
      const result = runLine(line, st);
      st = result.state;
      for (const s of lab.steps) if (!passed.includes(s.id) && s.isDone({ state: st, result })) passed.push(s.id);
    }
    expect(passed).toEqual(['octal', 'symbolic']);
  });

  it('does not pass the symbolic step with a numeric chmod', () => {
    const lab = SHELL_LABS.find((l) => l.id === 'linux-perm-basics')!;
    const result = runLine('chmod 674 report.txt', labInitialState(lab));
    expect(lab.steps[1].isDone({ state: result.state, result })).toBe(false);
  });

  it('starts each lab in its work directory with a clean history', () => {
    for (const lab of SHELL_LABS) {
      const st = labInitialState(lab);
      expect(runLine('pwd', st).stdout).toBe(`${lab.workdir}\n`);
      expect(st.lastExit).toBe(0);
    }
  });
});

describe('aliases', () => {
  it('ll is ls -l like the Rocky interactive shell', () => {
    const st = createInitialState();
    expect(runLine('ll /etc/skel', st).stdout).toBe(runLine('ls -l /etc/skel', st).stdout);
  });
});

describe('alias in lab checks', () => {
  it('ll -i counts as ls -i for the inode step', () => {
    const lab = SHELL_LABS.find((l) => l.id === 'linux-links')!;
    const result = runLine('ll -i', labInitialState(lab));
    expect(lab.steps.find((s) => s.id === 'inode')!.isDone({ state: result.state, result })).toBe(true);
  });
});
