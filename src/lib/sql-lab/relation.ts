// FROM 절이 만드는 작업 테이블(열 목록 + 행). 이름 해석(열 모호성, 별칭, USING·NATURAL 규칙)은 여기서 한다.
import { NotSupported, OraError, type Value } from './values';

/** 조인 결과 행 수 상한. 예제 테이블(14행)로는 3중 곱(2,744행)도 넉넉하다. 넘으면 탭이 멈추기 전에 멈춘다. */
export const MAX_JOIN_ROWS = 50_000;

const tooBig = () =>
  new NotSupported(`결과가 ${MAX_JOIN_ROWS.toLocaleString('en-US')}행을 넘어서 실행을 멈췄어요. 조인 조건이 빠졌는지(카테시안 곱) 확인해 보세요.`);

export interface RelCol {
  /** 테이블 별칭(없으면 테이블 이름). USING·NATURAL 로 합쳐진 열은 null */
  qual: string | null;
  name: string;
  /** 테이블 열의 자료형(NVL 등의 형 변환에 쓴다). 뷰·식에서 온 열은 모를 수 있다. */
  type?: 'NUMBER' | 'VARCHAR2' | 'DATE';
  /** CHAR(n) 열: 비교할 때 끝 공백을 채워 비교한다(blank-padded) */
  fixed?: boolean;
  /** 이름으로 찾을 수 없는 열(ANSI 조인 뷰의 SELECT * 가 만든 같은 이름 열 — Oracle 이 안에서 이름을 바꿔 둔다). SELECT * 로만 보인다. */
  hidden?: boolean;
  /** 인라인 뷰·WITH 에서 온 열. Oracle 은 모호성 오류에 이 열의 출처 이름을 비워서 보인다. */
  fromView?: boolean;
  /** 합쳐진 열의 출처 — 원래 별칭으로 접근하면 오류(ORA-25154/25155) */
  merged?: 'USING' | 'NATURAL';
}

export interface Relation {
  cols: RelCol[];
  rows: Value[][];
  /** "E.DEPTNO" → 합쳐져서 접두사로 부를 수 없는 열 */
  banned: Map<string, 'USING' | 'NATURAL'>;
  /** FROM 에 나온 별칭(자기 자신 포함) */
  quals: Set<string>;
}

export const emptyRelation = (): Relation => ({ cols: [], rows: [[]], banned: new Map(), quals: new Set() });

export type Resolved = { index: number } | null;

/** 이름 → 열 위치. 없으면 null(바깥 쿼리에서 찾는다), 모호하면 오류. */
export function resolveColumn(rel: Relation, table: string | undefined, name: string): Resolved {
  if (table !== undefined) {
    const banned = rel.banned.get(`${table}.${name}`);
    if (banned === 'USING') throw new OraError('ORA-25154', 'column part of USING clause cannot have qualifier');
    if (banned === 'NATURAL') throw new OraError('ORA-25155', 'column used in NATURAL join cannot have qualifier');
    const qhits = rel.cols.map((c, i) => (c.qual === table && c.name === name && !c.hidden ? i : -1)).filter((i) => i >= 0);
    // 같은 이름 열이 둘인 뷰·WITH(SELECT * FROM EMP, DEPT)는 접두사를 붙여도 모호하다.
    if (qhits.length > 1) throw ambiguous(rel, qhits, name);
    return qhits.length ? { index: qhits[0] } : null;
  }
  const hits = rel.cols.map((c, i) => (c.name === name && !c.hidden ? i : -1)).filter((i) => i >= 0);
  if (hits.length > 1) throw ambiguous(rel, hits, name);
  return hits.length ? { index: hits[0] } : null;
}

/** ORA-00918. 테이블 열이면 "appears in DEPT and EMP", 뷰에서 온 열이면 출처가 비어 "appears in  and " 로 보인다. */
function ambiguous(rel: Relation, hits: number[], name: string): OraError {
  const named = [...new Set(hits.filter((i) => !rel.cols[i].fromView).map((i) => rel.cols[i].qual ?? ''))];
  const blank = hits.filter((i) => rel.cols[i].fromView).map(() => '');
  const where = [...named, ...blank].sort();
  return new OraError('ORA-00918', `${name}: column ambiguously specified - appears in ${where.join(' and ')}`);
}

export function invalidIdentifier(table: string | undefined, name: string): OraError {
  return new OraError('ORA-00904', table ? `"${table}"."${name}": invalid identifier` : `"${name}": invalid identifier`);
}

/** 열 이름만 필요한 자리(이름 검사)에 쓰는 빈 조인 — 행을 만들지 않는다. */
export function joinShape(left: Relation, right: Relation): Relation {
  return { cols: [...left.cols, ...right.cols], rows: [], banned: new Map([...left.banned, ...right.banned]), quals: new Set([...left.quals, ...right.quals]) };
}

/** 두 작업 테이블을 잇는다. on 이 없으면 곱(CROSS). kind 에 따라 짝 없는 행을 NULL 로 채운다. */
export function joinRelations(
  left: Relation,
  right: Relation,
  kind: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS',
  test: ((row: Value[]) => boolean) | null,
): Relation {
  const cols = [...left.cols, ...right.cols];
  const rows: Value[][] = [];
  const nullsL = left.cols.map(() => null);
  const nullsR = right.cols.map(() => null);
  const rightMatched = new Set<number>();
  for (const l of left.rows) {
    let matched = false;
    right.rows.forEach((r, ri) => {
      const row = [...l, ...r];
      if (test === null || test(row)) {
        if (rows.length >= MAX_JOIN_ROWS) throw tooBig();
        rows.push(row);
        matched = true;
        rightMatched.add(ri);
      }
    });
    if (!matched && (kind === 'LEFT' || kind === 'FULL')) rows.push([...l, ...nullsR]);
  }
  if (kind === 'RIGHT' || kind === 'FULL') {
    right.rows.forEach((r, ri) => {
      if (!rightMatched.has(ri)) rows.push([...nullsL, ...r]);
    });
  }
  // RIGHT 조인의 행 순서: Oracle 은 오른쪽 기준으로 돌지만, 순서는 ORDER BY 없이는 보장되지 않는다.
  return { cols, rows, banned: new Map([...left.banned, ...right.banned]), quals: new Set([...left.quals, ...right.quals]) };
}

/**
 * USING·NATURAL: 같은 이름 열을 하나로 합쳐 맨 앞에 둔다(SELECT * 순서도 Oracle 과 같다).
 * 합친 값은 왼쪽 값, 왼쪽이 NULL(외부 조인으로 채워진 행)이면 오른쪽 값이다.
 */
export function mergeColumns(rel: Relation, leftCount: number, names: string[], kind: 'USING' | 'NATURAL'): Relation {
  const pairs = names.map((name) => {
    const li = rel.cols.findIndex((c, i) => i < leftCount && c.name === name);
    const ri = rel.cols.findIndex((c, i) => i >= leftCount && c.name === name);
    return { name, li, ri };
  });
  const drop = new Set(pairs.flatMap((p) => [p.li, p.ri]));
  const banned = new Map(rel.banned);
  for (const p of pairs) {
    for (const i of [p.li, p.ri]) {
      const q = rel.cols[i].qual;
      if (q) banned.set(`${q}.${p.name}`, kind);
    }
  }
  const cols: RelCol[] = [...pairs.map((p) => ({ qual: null, name: p.name, type: rel.cols[p.li]?.type, merged: kind })), ...rel.cols.filter((_, i) => !drop.has(i))];
  const rows = rel.rows.map((r) => [...pairs.map((p) => r[p.li] ?? r[p.ri]), ...r.filter((_, i) => !drop.has(i))]);
  return { cols, rows, banned, quals: rel.quals };
}
