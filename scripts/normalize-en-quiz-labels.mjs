#!/usr/bin/env node
// content/en/** 의 퀴즈 라벨을 한국어 → 영어로 정규화한다.
//
// 왜 필요한가(SEO): 영어판 day 페이지가 `## 📝 연습 문제` / `**문제 N.**` / `**정답: X**` /
// `해설:` 을 그대로 갖고 있어 lang="en" 페이지에 한국어가 렌더된다. 두 경로로 새어나간다:
//   1) src/lib/toc.ts 의 buildToc 은 **원문 h2 를 그대로** 읽으므로 우측 목차에 '연습 문제'가 뜬다
//      (parseQuiz 가 헤더를 삼켜 본문에는 안 보이지만 TOC 는 별개 경로다).
//   2) Quiz 본문(문항·보기·해설)이 한국어면 그대로 화면에 나온다 — 이건 번역 작업이지 이 스크립트 몫이 아니다.
// 구글은 이런 혼합 언어 페이지의 언어를 판정하지 못해 색인에서 제외한다(GSC '크롤링됨-색인 안 됨').
//
// 안전성:
//   - src/lib/parseQuiz.ts 는 이미 이중언어다(문제|Question|Problem|Q / 정답|Answer / 해설|Explanation).
//     따라서 라벨을 영문화해도 런타임 파싱은 그대로 동작한다.
//   - scripts/build-questions-index.mjs 는 한국어 토큰만 보지만 `content/en` 을 통째로 건너뛰므로 무관하다.
//   - 그래도 **헤더 인식 분기가 바뀌면** 퀴즈 구간 경계가 달라진다(헤더를 삼키느냐 본문에 남기느냐).
//     그래서 파일마다 변환 전후의 QUIZ_HEADER 매치 여부를 대조하고, 달라지면 그 파일을 되돌린다.
//
// 검증(이 스크립트가 대신하지 않는다. 반드시 별도로 실행할 것):
//   npx vitest run src/lib/quizContract.test.ts
//
// 사용:
//   node scripts/normalize-en-quiz-labels.mjs content/en/*/week1     # 대상 지정(디렉터리·파일)
//   node scripts/normalize-en-quiz-labels.mjs --dry-run content/en   # 미리보기

import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';

// parseQuiz.ts 의 QUIZ_HEADER 와 동일해야 한다. 변환 전후 분기가 같은지 대조하는 용도.
const QUIZ_HEADER =
  /^##\s+[^\n]*?(?:(?:연습|練習|連習|연習)\s*(?:문제|問題)|(?:Question|Problem)s?)[^\n]*$/im;

// h2 헤더 치환표. **추측하지 않는다** — 표에 없는 한국어 h2 는 건드리지 않고 보고만 한다.
//
// ⚠️ '종합 시나리오 12개' 는 일부러 Question/Problem 을 쓰지 않는다. 원문이 QUIZ_HEADER 에
// 매치되지 않아 헤더가 본문에 남는데, 영문에 'Questions' 를 넣으면 매치돼 헤더가 퀴즈 구간으로
// 빨려들어가 렌더 결과가 바뀐다. 현재 동작을 그대로 보존하는 것이 목적이다.
const HEADING_MAP = new Map([
  ['## 📝 연습 문제 (시나리오 12문항)', '## 📝 Practice Questions (12 Scenarios)'],
  ['## 📝 종합 연습 문제', '## 📝 Comprehensive Practice Questions'],
  ['## 📝 종합 시나리오 12개', '## 📝 Comprehensive Scenarios (12 items)'],
  ['## 📝 연습 문제', '## 📝 Practice Questions'],
]);

const HANGUL = /[가-힣]/g;

function transform(text) {
  let out = text;
  const counts = { heading: 0, stem: 0, answer: 0, explanation: 0 };

  // 1) h2 헤더 — 줄 전체가 표의 키와 정확히 일치할 때만 바꾼다.
  out = out.replace(/^##[^\n]*$/gm, (line) => {
    const hit = HEADING_MAP.get(line.trim());
    if (!hit) return line;
    counts.heading++;
    return hit;
  });

  // 2) 문제 스템: **문제 3.** → **Question 3.**  (마침표 유무 보존)
  out = out.replace(/\*\*문제\s*(\d+)(\.?)\*\*/g, (_m, n, dot) => {
    counts.stem++;
    return `**Question ${n}${dot}**`;
  });

  // 3) 정답 마커: **정답: B** → **Answer: B**
  out = out.replace(/\*\*정답\s*:\s*/g, () => {
    counts.answer++;
    return '**Answer: ';
  });
  // 굵게가 아닌 줄머리 정답도 처리(파서는 둘 다 받는다). 본문 산문 오탐을 막으려 줄머리로 한정.
  out = out.replace(/^정답\s*:\s*/gm, () => {
    counts.answer++;
    return 'Answer: ';
  });

  // 4) 해설: → Explanation:  (줄머리로 한정 — 본문 산문의 '해설'을 건드리지 않기 위해)
  out = out.replace(/^해설\s*:\s*/gm, () => {
    counts.explanation++;
    return 'Explanation: ';
  });

  return { out, counts };
}

function collectFiles(target) {
  const st = statSync(target);
  if (!st.isDirectory()) return /day\d+\.md$/.test(target) ? [target] : [];
  const found = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) found.push(...collectFiles(full));
    else if (/^day\d+\.md$/.test(entry.name)) found.push(full);
  }
  return found;
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const targets = argv.filter((a) => !a.startsWith('--'));
  if (targets.length === 0) {
    console.error('대상 경로가 없다. 예: node scripts/normalize-en-quiz-labels.mjs content/en/saa-c03/week1');
    process.exit(1);
  }

  const files = [...new Set(targets.flatMap(collectFiles))].sort();
  const total = { heading: 0, stem: 0, answer: 0, explanation: 0 };
  let changed = 0;
  const skippedBoundary = [];
  const unknownHeadings = [];
  const residual = [];

  for (const file of files) {
    const rel = path.relative(process.cwd(), file).split(path.sep).join('/');
    if (!rel.startsWith('content/en/')) {
      console.error(`건너뜀(영어판 아님): ${rel}`);
      continue;
    }
    const before = readFileSync(file, 'utf8');
    const { out, counts } = transform(before);

    // 표에 없는 한국어 h2 는 사람이 봐야 한다.
    for (const line of out.split('\n')) {
      if (/^##\s/.test(line) && HANGUL.test(line)) unknownHeadings.push(`${rel}: ${line.trim()}`);
      HANGUL.lastIndex = 0;
    }

    if (out === before) continue;

    // 헤더 인식 분기가 바뀌면 퀴즈 구간 경계가 달라진다 → 그 파일은 변경하지 않는다.
    if (QUIZ_HEADER.test(before) !== QUIZ_HEADER.test(out)) {
      skippedBoundary.push(rel);
      continue;
    }

    changed++;
    for (const k of Object.keys(total)) total[k] += counts[k];
    const left = (out.match(HANGUL) ?? []).length;
    if (left > 0) residual.push({ rel, left });
    if (!dryRun) writeFileSync(file, out, 'utf8');
  }

  console.log(`대상 ${files.length}개 / 변경 ${changed}개${dryRun ? ' (dry-run — 쓰지 않음)' : ''}`);
  console.log(`  헤더 ${total.heading} · 문제스템 ${total.stem} · 정답 ${total.answer} · 해설 ${total.explanation}`);
  if (skippedBoundary.length) {
    console.log(`\n⚠ 헤더 인식 분기가 바뀌어 건너뜀 ${skippedBoundary.length}개:`);
    for (const r of skippedBoundary) console.log(`  ${r}`);
  }
  if (unknownHeadings.length) {
    console.log(`\n⚠ 치환표에 없는 한국어 h2 ${unknownHeadings.length}건(수동 확인):`);
    for (const r of unknownHeadings) console.log(`  ${r}`);
  }
  if (residual.length) {
    console.log(`\nℹ 변환 후에도 한글이 남은 파일 ${residual.length}개(본문 번역 필요):`);
    for (const r of residual) console.log(`  ${r.rel}  한글 ${r.left}자`);
  }
}

main();
