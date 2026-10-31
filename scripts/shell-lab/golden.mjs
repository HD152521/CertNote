// 리눅스 셸 연습장 골든 파일 수집기.
// src/lib/shell-lab/golden/scenarios.json 의 명령을 실제 Rocky Linux 8.8 컨테이너에서 실행하고
// 명령마다 stdout·stderr·종료 코드를 results.json 에 적는다. 시뮬레이터 테스트가 이 값과 비교한다.
//
//   docker build -t certnote-rocky88 scripts/shell-lab
//   node scripts/shell-lab/golden.mjs
//
// 명령은 시나리오마다 새 컨테이너에서, 같은 bash 하나로 차례대로 실행한다(cd·umask 가 이어진다).
// ls 는 터미널에 찍을 때처럼 여러 칸(-C, 80칸)으로 받는다. 파이프·리다이렉트가 있으면 그대로 둔다.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE = 'certnote-rocky88';
const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../src/lib/shell-lab/golden');
const scenarios = JSON.parse(readFileSync(join(DIR, 'scenarios.json'), 'utf8'));

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s) => Buffer.from(s ?? '', 'base64').toString('utf8');

// 터미널에 바로 찍는 ls 는 -C 로 받는다(파일로 받으면 한 줄에 하나씩 나오기 때문).
const asTerminal = (cmd) => (/^ls\b/.test(cmd) && !/[|>]/.test(cmd) ? cmd.replace(/^ls/, 'ls -C') : cmd);

function buildScript(scenario) {
  const lines = ['export COLUMNS=80', 'mkdir -p /g'];
  for (const cmd of scenario.prelude ?? []) lines.push(cmd);
  scenario.steps.forEach((step, i) => {
    const cmd = asTerminal(step.cmd);
    lines.push(`CMD=$(echo ${b64(cmd)} | base64 -d)`);
    // 다른 사용자로 실행하는 단계: 같은 디렉터리에서 그 사용자의 셸로.
    const run = step.as ? `runuser -u ${step.as} -- bash -c "cd \\"$PWD\\" && $CMD"` : 'eval "$CMD"';
    lines.push(`{ ${run}; } >/g/o${i} 2>/g/e${i}; echo $? >/g/c${i}`);
  });
  lines.push(`for i in $(seq 0 ${scenario.steps.length - 1}); do echo "$i $(base64 -w0 /g/o$i) $(base64 -w0 /g/e$i) $(cat /g/c$i)"; done`);
  return lines.join('\n');
}

// bash -c / eval 안에서 난 셸 오류는 "bash: line 3: " 로 시작한다. 대화형 로그인 셸의 모양("-bash: ")으로 맞춘다.
const interactiveStderr = (s) => s.replace(/^bash: (?:eval: )?(?:line \d+: )?/gm, '-bash: ');

const results = {};
for (const scenario of scenarios) {
  const out = execFileSync('docker', ['run', '--rm', '-i', IMAGE, 'bash', '-s'], {
    input: buildScript(scenario),
    encoding: 'utf8',
  });
  const rows = out.trim().split('\n').map((l) => l.split(' '));
  results[scenario.id] = scenario.steps.map((step, i) => {
    const [, o, e, c] = rows.find((r) => Number(r[0]) === i) ?? [];
    return { cmd: step.cmd, stdout: unb64(o), stderr: interactiveStderr(unb64(e)), exitCode: Number(c) };
  });
  console.log(`${scenario.id}: ${scenario.steps.length}개`);
}
writeFileSync(join(DIR, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
