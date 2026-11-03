#!/usr/bin/env node
// SQL 실습장 골든: cases.json 의 SQL 을 실제 Oracle(certnote-oracle 컨테이너)에서 돌려 결과를 저장한다.
// src/lib/sql-lab/golden.test.ts 가 이 결과와 실습장 엔진을 대조한다.
//
// 준비(한 번):
//   docker run -d --name certnote-oracle -e ORACLE_PASSWORD=certnote -e APP_USER=scott -e APP_USER_PASSWORD=tiger \
//     -p 127.0.0.1:1522:1521 gvenzl/oracle-free:23-slim-faststart
//   docker exec -i certnote-oracle sqlplus -S scott/tiger@localhost/FREEPDB1 < scripts/sql-lab/schema.sql
// 실행:
//   node scripts/sql-lab/golden.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cases = JSON.parse(readFileSync(path.join(root, 'scripts/sql-lab/cases.json'), 'utf8'));
const OUT = path.join(root, 'src/lib/sql-lab/golden/results.json');

// 시나리오가 만든 테이블·뷰를 지운다(EMP·DEPT·SALGRADE 만 남긴다).
const CLEANUP = `BEGIN
  FOR v IN (SELECT VIEW_NAME FROM USER_VIEWS) LOOP EXECUTE IMMEDIATE 'DROP VIEW "' || v.VIEW_NAME || '"'; END LOOP;
  FOR t IN (SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME NOT IN ('EMP', 'DEPT', 'SALGRADE')) LOOP
    EXECUTE IMMEDIATE 'DROP TABLE "' || t.TABLE_NAME || '" CASCADE CONSTRAINTS PURGE';
  END LOOP;
END;
/`;

const script = [
  'SET PAGESIZE 50000 LINESIZE 32767 FEEDBACK OFF TAB OFF TRIMSPOOL ON TRIMOUT ON',
  'SET MARKUP CSV ON QUOTE ON',
  // NULL 을 눈에 보이게 찍는다 — 열 하나짜리 NULL 행이 빈 줄이 되어 사라지지 않게.
  "SET NULL '<NULL>'",
  "ALTER SESSION SET NLS_DATE_FORMAT = 'YYYY-MM-DD';",
  "ALTER SESSION SET NLS_DATE_LANGUAGE = 'AMERICAN';",
  "ALTER SESSION SET NLS_NUMERIC_CHARACTERS = '.,';",
  ...cases.flatMap((c) =>
    c.script
      ? // 여러 문장(DML·DDL·TCL)을 한 세션에서 차례로: 문장마다 표시를 찍고, 끝나면 되돌리고 만든 것을 지운다.
        [
          'SET FEEDBACK ON',
          `PROMPT ###CASE ${c.id}`,
          ...c.script.flatMap((s, k) => [`PROMPT ###STMT ${k}`, s.replace(/;\s*$/, '') + ';']),
          'PROMPT ###DONE',
          'SET FEEDBACK OFF',
          'ROLLBACK;',
          CLEANUP,
        ]
      : [`PROMPT ###CASE ${c.id}`, c.sql.replace(/;\s*$/, '') + ';'],
  ),
  'PROMPT ###END',
].join('\n');

const out = execFileSync('docker', ['exec', '-i', 'certnote-oracle', 'sqlplus', '-S', 'scott/tiger@localhost/FREEPDB1'], {
  input: script,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

/** CSV 한 줄: "문자",숫자,,"따옴표""안" */
function parseCsvLine(line) {
  const cells = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let v = '';
      i++;
      for (;;) {
        if (line[i] === '"' && line[i + 1] === '"') {
          v += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else if (i >= line.length) break;
        else v += line[i++];
      }
      cells.push(v);
      i++; // 쉼표
    } else {
      const j = line.indexOf(',', i);
      const end = j < 0 ? line.length : j;
      cells.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return cells;
}

const FEEDBACK_RE = /^(\d+ rows? (created|updated|deleted|merged)|Table (created|dropped|altered|truncated|renamed)|View (created|dropped)|Commit complete|Rollback complete|Savepoint created)\.$/;
const SELECTED_RE = /^(\d+ rows? selected\.|no rows selected)$/;

/** 문장 하나의 출력 → 결과(오류 / 피드백 문구 / 결과 표) */
function parseOne(body) {
  const ora = /^(ORA-\d{5}): ?(.*)$/m.exec(body);
  if (ora && (/ERROR at line/.test(body) || /^ERROR:\s*$/m.test(body))) return { error: ora[1], message: ora[2].trim() };
  const lines = body.split('\n').filter((l) => l.trim() !== '' && !SELECTED_RE.test(l.trim()));
  const fb = lines.find((l) => FEEDBACK_RE.test(l.trim()));
  if (fb) return { message: fb.trim() };
  if (lines.length === 0) return { columns: null, rows: [] };
  const unNull = (cells) => cells.map((v) => (v === '<NULL>' ? '' : v));
  return { columns: parseCsvLine(lines[0]), rows: lines.slice(1).map((l) => unNull(parseCsvLine(l))) };
}

const results = {};
const sections = out.split(/^###CASE /m).slice(1);
for (const sec of sections) {
  const [head, ...rest] = sec.split('\n');
  const id = head.trim();
  const body = rest.join('\n').replace(/###END[\s\S]*$/, '').trimEnd();
  if (body.includes('###STMT ')) {
    const steps = body.replace(/###DONE[\s\S]*$/, '').split(/^###STMT \d+$/m).slice(1);
    results[id] = { steps: steps.map((s) => parseOne(s.trim())) };
    continue;
  }
  const ora = /^(ORA-\d{5}): ?(.*)$/m.exec(body);
  if (ora && (/ERROR at line/.test(body) || /^ERROR:\s*$/m.test(body))) {
    results[id] = { error: ora[1], message: ora[2].trim() };
    continue;
  }
  const lines = body.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) {
    results[id] = { columns: null, rows: [] };
    continue;
  }
  const unNull = (cells) => cells.map((v) => (v === '<NULL>' ? '' : v));
  results[id] = { columns: parseCsvLine(lines[0]), rows: lines.slice(1).map((l) => unNull(parseCsvLine(l))) };
}

const missing = cases.filter((c) => !results[c.id]).map((c) => c.id);
if (missing.length) {
  console.error('결과가 없는 사례:', missing.join(', '));
  process.exit(1);
}
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(results, null, 2)}\n`);
console.log(`골든 ${Object.keys(results).length}건 저장 → ${path.relative(root, OUT)}`);
