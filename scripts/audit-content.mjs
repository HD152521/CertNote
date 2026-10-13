// 이번 보강 작업 전수 검증(일회성 감사).
//
// 자격증마다 적용한 포맷이 다르므로 두 축으로 나눠 본다.
//  - 공통(전 파일): 퀴즈 파싱 무결성은 quizContract.test.ts 가 담당. 여기서는 '앵커 오염'
//    (본문에 문제 스템이 섞여 파서 앵커가 앞으로 당겨지는 상태)과 크기·읽기시간을 본다.
//  - 규격 적용 자격증(mla·mls): docs/content-format.md 4항목을 추가로 검사.
//
// 실행: node scripts/audit-content.mjs

import { readFileSync, existsSync } from 'node:fs';

const SPEC = new Set(['mla-c01', 'mls-c01']); // 새 규격을 적용한 자격증
const CERTS = [
  ['saa-c03', 12], ['soa-c02', 12], ['dop-c02', 16], ['scs-c03', 12],
  ['dva-c02', 13], ['sap-c02', 16], ['clf-c02', 6], ['aif-c01', 6],
  ['mla-c01', 10], ['mls-c01', 12], ['dea-c01', 10], ['linux-master-1', 14],
];

// 퀴즈 제목은 문서마다 다르다(`## 📝 연습 문제`·`## 📝 종합 시나리오 10개`·`## 📝 최종 모의고사` …).
// 그래서 본문 경계는 **parseQuiz.ts 의 locateQuizSection 과 동일한 규칙**으로 잡아야 한다.
// 고정 문자열 indexOf 로 자르면 복습일(W*D5)에서 퀴즈가 본문에 포함돼 대량 오탐이 난다(실측 54건).
const QUIZ_HEADER = /^##\s+[^\n]*?(?:(?:연습|練習|連習|연習)\s*(?:문제|問題)|(?:Question|Problem)s?)[^\n]*$/im;
const STEM = /^\*\*(?:문제|Question|Problem|Q)\s*\d+/m;

/** 본문(퀴즈 구간 앞) 을 파서와 같은 기준으로 잘라 반환. */
function bodyOf(text) {
  const stem = text.match(STEM);
  if (stem?.index !== undefined) {
    let last = null;
    for (const m of text.slice(0, stem.index).matchAll(/^##\s+[^\n]*$/gm)) last = m;
    return text.slice(0, last && QUIZ_HEADER.test(last[0]) ? last.index : stem.index);
  }
  const head = text.match(QUIZ_HEADER);
  return head?.index !== undefined ? text.slice(0, head.index) : text;
}

/** 앱의 readingTime 과 동일 산식(코드블록 제외, 한국어 450자/분). */
function readingMinutes(text) {
  const s = text
    .replace(/```[\s\S]*?```/g, '   ')
    .replace(/`[^`]+`/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_~>`-]/g, '')
    .replace(/\s+/g, '');
  return Math.max(1, Math.round(s.length / 450));
}

const rows = [];
for (const [cert, weeks] of CERTS) {
  let n = 0, bytes = 0, mins = 0;
  const problems = [];
  let specOk = 0, specTotal = 0;

  for (let w = 1; w <= weeks; w++) {
    for (let d = 1; d <= 10; d++) {
      const p = `content/aws-certs/${cert}/week${w}/day${d}.md`;
      if (!existsSync(p)) continue;
      const t = readFileSync(p, 'utf8');
      const id = `W${w}D${d}`;
      n += 1;
      bytes += Buffer.byteLength(t);

      const body = bodyOf(t);
      mins += readingMinutes(body);

      // 공통: 본문에 문제 스템이 있으면 파서 앵커가 앞으로 당겨져 퀴즈가 잘린다.
      if (/^\*\*문제 \d+\./m.test(body)) problems.push(`${id}:본문스템`);

      // 규격 자격증만: docs/content-format.md 4항목
      if (SPEC.has(cert)) {
        specTotal += 1;
        const heads = [...t.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
        const i1 = heads.indexOf('📌 핵심 정리');
        const i2 = heads.indexOf('📖 용어');
        const i3 = heads.findIndex((h) => /📝\s*연습 문제/.test(h));
        const g = (t.match(/^- \*\*[^*]+\*\* : /gm) ?? []).length;
        const errs = [];
        if (i1 !== 0) errs.push('📌위치');
        if (i2 < 0) errs.push('용어없음');
        else if (i3 !== i2 + 1) errs.push('📖→퀴즈');
        if (/^\*[^*]/m.test(body)) errs.push('별표하나');
        if (g < 5 || g > 10) errs.push(`용어${g}`);
        if (errs.length) problems.push(`${id}:${errs.join(',')}`); else specOk += 1;
      }
    }
  }
  rows.push({ cert, n, kb: Math.round(bytes / n / 1024), min: Math.round(mins / n), specOk, specTotal, problems });
}

console.log('자격증          레슨  평균KB  읽기분  규격      문제');
for (const r of rows) {
  const spec = r.specTotal ? `${r.specOk}/${r.specTotal}` : '—';
  const prob = r.problems.length ? r.problems.slice(0, 4).join(' ') + (r.problems.length > 4 ? ` 외${r.problems.length - 4}` : '') : '없음';
  console.log(
    `${r.cert.padEnd(15)} ${String(r.n).padStart(3)}   ${String(r.kb).padStart(4)}    ${String(r.min).padStart(3)}   ${spec.padEnd(8)} ${prob}`,
  );
}
const total = rows.reduce((s, r) => s + r.n, 0);
const bad = rows.reduce((s, r) => s + r.problems.length, 0);
console.log(`\n총 ${total}개 레슨 · 문제 ${bad}건`);
