// 실습장 엔진 ↔ 실제 Oracle 대조. 기대값은 scripts/sql-lab/golden.mjs 가 Oracle 컨테이너에서 찍은 결과다.
// 사례를 더하려면 scripts/sql-lab/cases.mjs 를 고치고 cases.mjs → golden.mjs 순서로 다시 돌린다.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { runStatement } from './run';
import { display } from './values';

interface Case {
  id: string;
  sql: string;
  match?: 'code';
}
type Golden = { columns: string[] | null; rows: string[][] } | { error: string; message: string };

const root = process.cwd();
const cases = JSON.parse(readFileSync(path.join(root, 'scripts/sql-lab/cases.json'), 'utf8')) as Case[];
const golden = JSON.parse(readFileSync(path.join(root, 'src/lib/sql-lab/golden/results.json'), 'utf8')) as Record<string, Golden>;

/**
 * Oracle 23ai 에서만 달라진 동작(시험은 이전 버전 기준)이라 엔진이 일부러 따르지 않는 사례.
 * - err-923: 23ai 는 FROM 없는 SELECT 를 받아 준다. 실습장은 시험 기준(ORA-00923)을 따른다.
 * - note-w4d2-15: 23ai 는 HAVING 에서 SELECT 별칭을 받아 준다. 실습장은 시험 기준(ORA-00904 + 설명)을 따른다.
 */
const VERSION_DIFFERENCES = new Set(['err-923', 'note-w4d2-15']);

/** 정렬 키가 같은 행의 순서가 정해지지 않음을 보여 주는 노트 예제 — 행 집합만 맞춘다. */
const TIE_ORDER = new Set(['note-w4d3-1']);

describe('SQL 실습장 골든 (Oracle Database 23ai Free 대조)', () => {
  test.each(cases.filter((c) => !VERSION_DIFFERENCES.has(c.id)))('$id', (c) => {
    const want = golden[c.id];
    expect(want, `골든 결과 없음: ${c.id} — node scripts/sql-lab/golden.mjs`).toBeDefined();
    const got = runStatement(c.sql);
    if ('error' in want) {
      expect(got.kind === 'error' ? got.code : `${got.kind} 결과`).toBe(want.error);
      if (c.match !== 'code' && got.kind === 'error') expect(got.message).toBe(want.message);
      return;
    }
    if (got.kind !== 'rows') throw new Error(`${got.kind}: ${got.kind === 'error' ? `${got.code} ${got.message}` : got.message}`);
    const rows = got.rows.map((r) => r.map(display));
    // CSV 제목 줄은 따옴표가 든 제목에서 깨진다(Oracle 이 제목 속 " 를 이스케이프하지 않는다). 폭이 맞을 때만 비교한다.
    if (want.columns && want.columns.length === got.columns.length) expect(got.columns).toEqual(want.columns);
    if (TIE_ORDER.has(c.id)) expect([...rows].sort()).toEqual([...want.rows].sort());
    else expect(rows).toEqual(want.rows);
  });
});
