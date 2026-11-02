import { describe, expect, it } from 'vitest';
import questions from '@/data/questions.json';
import { LAB_CATALOG } from './labCatalog';
import { SHELL_COMMAND_NAMES, isRunnable, quizShellPlan } from './quizShellLink';
import { COMMANDS } from './shell-lab/run';
import { quizSandboxState } from './shell-lab/quizSandbox';
import { runLine } from './shell-lab/run';

interface Q {
  id: string;
  slug: string;
  prompt: string;
  choices: { label: string; text: string }[];
  answer: string;
  explanation?: string;
}

const linux = (questions as Q[]).filter((q) => q.slug.startsWith('linux-master'));
const plan = (q: Q) => quizShellPlan({ slug: q.slug, prompt: q.prompt, choices: q.choices, answer: q.answer, explanation: q.explanation });

describe('quizShellLink', () => {
  it('keeps the command list in sync with the simulator', () => {
    expect([...SHELL_COMMAND_NAMES].sort()).toEqual([...Object.keys(COMMANDS), 'll'].sort());
  });

  it('only links to labs that exist', () => {
    const ids = new Set(LAB_CATALOG.map((l) => l.id));
    for (const q of linux) {
      const p = plan(q);
      if (p?.labId) expect(ids.has(p.labId), `${q.id} → ${p.labId}`).toBe(true);
    }
  });

  it('ignores non-linux questions', () => {
    expect(quizShellPlan({ slug: 'saa-c03', prompt: '`ls -l`', choices: [], answer: 'A' })).toBeNull();
  });

  it('puts the correct choice first and maps by command', () => {
    const p = quizShellPlan({
      slug: 'linux-master-1',
      prompt: '파일 권한을 rwxr-xr-x 로 바꾸는 명령은?',
      choices: [
        { label: 'A', text: 'chmod 644 file' },
        { label: 'B', text: 'chmod 755 file' },
      ],
      answer: 'B',
    });
    expect(p).toEqual({ commands: ['chmod 755 file', 'chmod 644 file'], labId: 'linux-perm-basics' });
  });

  it('sends special-bit questions to the shared directory lab', () => {
    const p = quizShellPlan({ slug: 'linux-master-2', prompt: '`chmod 2775 dir` 의 효과는?', choices: [], answer: 'A' });
    expect(p?.labId).toBe('linux-shared-dir');
  });

  it('rejects syntax summaries and placeholders', () => {
    expect(isRunnable('chmod [옵션] 모드 파일')).toBe(false);
    expect(isRunnable('echo 결과')).toBe(false);
    expect(isRunnable('chmod <mode> <file>')).toBe(false);
    expect(isRunnable('exit 1')).toBe(false);
    expect(isRunnable('chmod')).toBe(false);
    expect(isRunnable('umask')).toBe(true);
    expect(isRunnable('find . -type f -name "*.conf"')).toBe(true);
  });
});

describe('quizSandboxState', () => {
  it('prepares the files, users and groups a command touches', () => {
    const st = quizSandboxState(['chown alice:dev report.txt', 'chmod g-w,o-r file.txt']);
    expect(runLine('chown alice:dev report.txt', st).exitCode).toBe(0);
    const r = runLine('chmod g-w,o-r file.txt', st);
    expect(r.exitCode).toBe(0);
    expect(runLine('wc -l file.txt', st).stdout).toBe('6 file.txt\n');
  });

  it('does not pre-create what the command itself creates', () => {
    const st = quizSandboxState(['useradd -m -G wheel kim', 'groupadd dev']);
    expect(runLine('useradd -m -G wheel kim', st).exitCode).toBe(0);
    expect(runLine('groupadd dev', st).exitCode).toBe(0);
  });

  it('makes files for a simple wildcard', () => {
    const st = quizSandboxState(['rm *.log']);
    expect(runLine('ls', st).stdout).toBe('a.log  b.log\n');
  });

  it('runs every command found in the real question bank without crashing', () => {
    let total = 0;
    for (const q of linux) {
      const p = plan(q);
      if (!p?.commands.length) continue;
      const st = quizSandboxState(p.commands);
      for (const line of p.commands) {
        expect(() => runLine(line, st), `${q.id}: ${line}`).not.toThrow();
        total++;
      }
    }
    expect(total).toBeGreaterThan(150);
  });
});

describe('initial states', () => {
  it('shows recent files with a time, not a year (no future timestamps)', () => {
    const st = quizSandboxState(['cat file.txt']);
    expect(runLine('ls -l', st).stdout).toMatch(/ Oct 31 09:00 file\.txt\n$/);
  });
});

describe('quizSandboxState option clusters and directories', () => {
  it('reads -aG as an option with a value, not a user name', () => {
    const st = quizSandboxState(['usermod -aG wheel kim', 'useradd -mG dev lee']);
    expect(runLine('id wheel', st).exitCode).toBe(1);
    expect(runLine('usermod -aG wheel kim', st).exitCode).toBe(0);
    expect(runLine('useradd -mG dev lee', st).exitCode).toBe(0);
  });

  it('makes sticky/setgid targets without an extension into directories', () => {
    const st = quizSandboxState(['chmod 1777 /tmp/shared', 'chmod g+s team', 'chmod u+s tool', 'chmod 2755 run.sh']);
    expect(runLine('ls -ld /tmp/shared team', st).stdout).toMatch(/^d.*\/tmp\/shared\nd.*team\n$/);
    expect(runLine('ls -l tool run.sh', st).stdout).toMatch(/^-.*run\.sh\n-.*tool\n$/);
  });

  it('creates a missing find start directory', () => {
    const st = quizSandboxState(['find /data -perm -4000']);
    expect(runLine('find /data -perm -4000', st).stderr).toBe('');
  });

  it('never throws on odd names', () => {
    expect(() => quizSandboxState(["rm 'a'b*", 'cat "x y.txt"', 'chmod 755 $(id)'])).not.toThrow();
  });
});
