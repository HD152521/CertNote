#!/usr/bin/env node
// day.md 보강 후, 퀴즈 블록을 git 원본에서 그대로 되붙인다.
//
// 왜 필요한가(콘텐츠 보강 최대 리스크 차단):
//   src/lib/parseQuiz.ts 는 정규식으로 퀴즈를 파싱한다. 에이전트가 본문을 보강하면서 퀴즈 블록을
//   조금이라도 재포맷하면 문제가 **조용히** 사라진다(빌드는 성공, 화면에서만 증발).
//   실제 파손 경로: ① 문제 스템 이후 h2 삽입 → 이후 문제 전부 소실 ② 본문에 '**문제 N.' 문구가
//   생겨 앵커 이동 ③ 보기/정답 마커 변형 → 해당 문제 드롭.
//
// 해결: "조심해서 편집한다"가 아니라 **퀴즈 바이트를 아예 손대지 않는다**.
//   보강된 파일에서는 본문만 취하고, 퀴즈 이후 전체를 git HEAD 원본에서 바이트 그대로 가져와 잇는다.
//   따라서 에이전트가 퀴즈를 어떻게 망가뜨렸든 결과물의 퀴즈는 항상 원본과 동일하다.
//
// 사용:
//   node scripts/restore-quiz.mjs content/aws-certs/scs-c03/week5           # 디렉터리
//   node scripts/restore-quiz.mjs content/aws-certs/scs-c03/week5/day1.md   # 개별 파일
//   node scripts/restore-quiz.mjs --ref HEAD~1 content/aws-certs/scs-c03    # 기준 커밋 지정
//
// 검증은 별도: npx vitest run src/lib/quizContract.test.ts

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';

// parseQuiz.ts 와 동일한 퀴즈 제목 인식(번역본 한자 변형 포함).
const QUIZ_HEADER = /^##\s+[^\n]*?(?:(?:연습|練習|連習|연習)\s*(?:문제|問題)|(?:Question|Problem)s?)[^\n]*$/im;
// parseQuiz.ts 의 문제 스템과 동일.
const STEM = /^\*\*(?:문제|Question|Problem|Q)\s*\d+/m;

/**
 * 퀴즈 구간의 시작 오프셋을 찾는다. **parseQuiz.ts 의 locateQuizSection 과 동일한 규칙**이어야 한다.
 *
 * 규칙: 첫 문제 스템에 앵커를 두고, 그 앞의 **마지막 h2** 가 퀴즈 제목처럼 보일 때만 제목까지 거슬러
 * 올라간다. 스템이 아예 없으면 그때만 퀴즈 제목 매치로 판단한다.
 *
 * ⚠️ 예전 구현은 "파일 내 첫 QUIZ_HEADER 매치"를 우선했는데 **실제 사고를 냈다.**
 * QUIZ_HEADER 는 영어 Question/Problem 을 포함하므로 본문 제목
 * (`## Problem Definition …`, `## Self-Check Questions`, `## The Problem MLOps Solves`)이
 * 퀴즈 제목으로 오인됐고, git 원본에서 그 지점부터 되붙이는 바람에
 * **본문 섹션이 되살아났다**(mls-c01 week1/day1·week3/day5 에서 발생, 사후 복구).
 */
function quizStart(text) {
  const stem = text.match(STEM);
  if (stem?.index !== undefined) {
    const stemAt = stem.index;
    let last = null;
    for (const m of text.slice(0, stemAt).matchAll(/^##\s+[^\n]*$/gm)) last = m;
    if (last && QUIZ_HEADER.test(last[0])) return last.index;
    return stemAt;
  }
  const head = text.match(QUIZ_HEADER);
  return head?.index ?? null;
}

function gitShow(ref, relPath) {
  const spec = `${ref}:${relPath.split(path.sep).join('/')}`;
  return execFileSync('git', ['show', spec], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function collectFiles(target) {
  const st = statSync(target);
  if (st.isFile()) return /day\d+\.md$/.test(target) ? [target] : [];
  const out = [];
  for (const e of readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, e.name);
    if (e.isDirectory()) out.push(...collectFiles(full));
    else if (/^day\d+\.md$/.test(e.name)) out.push(full);
  }
  return out.sort();
}

function main() {
  const argv = process.argv.slice(2);
  let ref = 'HEAD';
  const targets = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ref') ref = argv[++i];
    else targets.push(argv[i]);
  }
  if (targets.length === 0) {
    console.error('사용: node scripts/restore-quiz.mjs [--ref HEAD] <파일|디렉터리> ...');
    process.exit(1);
  }

  const files = targets.flatMap(collectFiles);
  let restored = 0;
  let unchanged = 0;
  let skipped = 0;
  const warnings = [];

  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    let original;
    try {
      original = gitShow(ref, rel);
    } catch {
      warnings.push(`${rel}: git ${ref} 에 없음(신규 파일) — 건너뜀`);
      skipped++;
      continue;
    }

    const origAt = quizStart(original);
    if (origAt === null) {
      // 원본에 퀴즈가 없다 → 보호할 대상 없음.
      skipped++;
      continue;
    }
    const originalTail = original.slice(origAt); // 퀴즈 + 그 이후 전체(바이트 그대로)

    const current = readFileSync(file, 'utf8');
    const curAt = quizStart(current);
    // 보강된 파일에서 '본문'만 취한다. 퀴즈가 사라졌다면 파일 전체가 본문.
    const newBody = (curAt === null ? current : current.slice(0, curAt)).replace(/\s+$/, '');

    if (curAt === null) {
      warnings.push(`${rel}: 보강본에 퀴즈 구간이 없어 원본 퀴즈를 되붙임`);
    }

    const merged = `${newBody}\n\n${originalTail.replace(/^\s+/, '')}`;
    if (merged === current) {
      unchanged++;
      continue;
    }
    writeFileSync(file, merged, 'utf8');
    restored++;
  }

  console.log(`[restore-quiz] 대상 ${files.length}개 · 되붙임 ${restored} · 변경없음 ${unchanged} · 건너뜀 ${skipped}`);
  for (const w of warnings) console.log(`  ! ${w}`);
  console.log('[restore-quiz] 검증: npx vitest run src/lib/quizContract.test.ts');
}

main();
