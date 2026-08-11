// restore-quiz 앵커 오인 피해 진단(일회성).
//
// 배경: scripts/restore-quiz.mjs 의 quizStart() 가 QUIZ_HEADER 를 "파일 내 첫 매치"로 잡는데,
// QUIZ_HEADER 정규식이 영어 Question/Problem 을 포함한다. 그래서 본문에 `## Problem Definition …`
// 이나 `## Self-Check Questions` 같은 제목이 있으면 그것을 퀴즈 헤더로 오인하고,
// git 원본에서 그 지점부터 되붙여 **본문 섹션을 되살리는** 사고가 난다(실제 발생).
//
// 실행: node scripts/audit-quiz-anchor.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const QUIZ_HEADER = /^##\s+[^\n]*?(?:(?:연습|練習|連習|연習)\s*(?:문제|問題)|(?:Question|Problem)s?)[^\n]*$/im;
const STEM = /^\*\*(?:문제|Question|Problem|Q)\s*\d+/m;

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/^day\d+\.md$/.test(e.name)) out.push(full);
  }
  return out;
}

const rel = (p) => path.relative(process.cwd(), p).split(path.sep).join('/');

const files = walk('content').sort();
const risky = [];
const broken = [];

for (const f of files) {
  const t = readFileSync(f, 'utf8');
  const stem = t.match(STEM);
  const stemAt = stem ? stem.index : -1;
  const head = t.match(QUIZ_HEADER);
  const headAt = head ? head.index : -1;

  // 오인 조건: 첫 QUIZ_HEADER 매치가 첫 스템보다 앞인데, 그것이 실제 '연습 문제' 헤더가 아님
  if (headAt >= 0 && stemAt >= 0 && headAt < stemAt && !/연습\s*문제/.test(head[0])) {
    risky.push(`${rel(f)}  ← ${head[0].trim().slice(0, 60)}`);
  }

  // 증상: '## 📖 용어' 다음이 '## 📝 연습 문제' 가 아님(규격 위반)
  const heads = [...t.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
  const i2 = heads.indexOf('📖 용어');
  const i3 = heads.findIndex((h) => /📝\s*연습 문제/.test(h));
  if (i2 >= 0 && i3 >= 0 && i3 !== i2 + 1) {
    broken.push(`${rel(f)}  (용어 다음: ${heads[i2 + 1] ?? '?'})`);
  }
}

console.log(`전체 day 파일: ${files.length}`);
console.log(`\n[1] 앵커 오인 위험(본문 제목이 Question/Problem 포함): ${risky.length}`);
risky.slice(0, 20).forEach((x) => console.log(`  ${x}`));
if (risky.length > 20) console.log(`  … 외 ${risky.length - 20}건`);
console.log(`\n[2] 실제 규격 위반(📖 용어 다음이 퀴즈 아님): ${broken.length}`);
broken.forEach((x) => console.log(`  ${x}`));
