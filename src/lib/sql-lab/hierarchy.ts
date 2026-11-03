// 계층형 질의: START WITH … CONNECT BY [NOCYCLE] PRIOR … [ORDER SIBLINGS BY …].
// FROM(과 조인 조건) 결과로 나무를 깊이 우선으로 펼친 뒤, 나머지 WHERE 조건으로 거른다(Oracle 의 처리 순서).
import type { Expr, OrderItem } from './ast';
import { NotSupported, OraError, type Value } from './values';

export interface HierInfo {
  level: number;
  /** 부모 노드의 행(PRIOR 가 읽는다). 뿌리는 null */
  parent: Value[] | null;
  /** 뿌리 노드의 행(CONNECT_BY_ROOT) */
  root: Value[];
  /** 뿌리부터 이 노드까지의 행(SYS_CONNECT_BY_PATH) */
  path: Value[][];
  isLeaf: 0 | 1;
  isCycle: 0 | 1;
}

export interface ConnectBy {
  startWith?: Expr;
  condition: Expr;
  nocycle: boolean;
}

/** 펼친 노드가 이 수를 넘으면 멈춘다(LEVEL 상한이 없는 CONNECT BY 가 끝없이 커지지 않게). */
const MAX_NODES = 20_000;

interface Hooks<C> {
  /** 행과 계층 정보로 계산 문맥을 만든다 */
  ctx: (row: Value[], hier: HierInfo) => C;
  cond: (e: Expr, ctx: C) => boolean | null;
  evaluate: (e: Expr, ctx: C) => Value;
  sortCompare: (a: Value, b: Value, desc: boolean, nulls: 'FIRST' | 'LAST' | undefined) => number;
  checkTime?: () => void;
}

export function hasPrior(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  if ((e as { type?: string; op?: string }).type === 'unary' && (e as { op?: string }).op === 'PRIOR') return true;
  return Object.entries(e as Record<string, unknown>).some(([k, v]) => k !== 'query' && (Array.isArray(v) ? v.some(hasPrior) : hasPrior(v)));
}

/**
 * 나무를 펼친다. 돌려주는 행은 노드마다 새 배열이고(같은 행이 두 부모 밑에 나올 수 있다), info 에 계층 정보가 붙는다.
 */
export function buildHierarchy<C>(
  base: Value[][],
  spec: ConnectBy,
  siblings: OrderItem[] | undefined,
  hooks: Hooks<C>,
  info: WeakMap<Value[], HierInfo>,
): Value[][] {
  const out: Value[][] = [];
  const checkCycle = hasPrior(spec.condition);
  const sortSiblings = <T extends { row: Value[]; ctx: C }>(cands: T[]): T[] => {
    if (!siblings?.length) return cands;
    const keys = cands.map((c) => siblings.map((o) => hooks.evaluate(o.expr, c.ctx)));
    const idx = cands.map((_, i) => i);
    idx.sort((a, b) => {
      for (let t = 0; t < siblings.length; t++) {
        const c = hooks.sortCompare(keys[a][t], keys[b][t], siblings[t].desc, siblings[t].nulls);
        if (c) return c;
      }
      return a - b;
    });
    return idx.map((i) => cands[i]);
  };

  const visit = (row: Value[], hier: HierInfo, baseRow: Value[], ancestors: Value[][]) => {
    if (out.length >= MAX_NODES) throw new NotSupported(`계층이 ${MAX_NODES.toLocaleString('en-US')}행을 넘어서 멈췄어요. CONNECT BY 에 LEVEL 상한을 두거나 조건을 확인해 보세요.`);
    hooks.checkTime?.();
    const node = [...row];
    info.set(node, hier);
    out.push(node);
    const children: { row: Value[]; ctx: C; base: Value[] }[] = [];
    for (const cand of base) {
      const childHier: HierInfo = { level: hier.level + 1, parent: node, root: hier.root, path: [...hier.path, cand], isLeaf: 0, isCycle: 0 };
      const c = hooks.ctx(cand, childHier);
      if (hooks.cond(spec.condition, c) !== true) continue;
      if (checkCycle && (cand === baseRow || ancestors.includes(cand))) {
        if (!spec.nocycle) throw new OraError('ORA-01436', 'CONNECT BY loop in user data');
        hier.isCycle = 1;
        continue;
      }
      children.push({ row: cand, ctx: c, base: cand });
    }
    hier.isLeaf = children.length === 0 ? 1 : 0;
    for (const ch of sortSiblings(children)) {
      const h: HierInfo = { level: hier.level + 1, parent: node, root: hier.root, path: [...hier.path, ch.row], isLeaf: 0, isCycle: 0 };
      visit(ch.row, h, ch.base, [...ancestors, baseRow]);
    }
  };

  const roots: { row: Value[]; ctx: C }[] = [];
  for (const row of base) {
    const hier: HierInfo = { level: 1, parent: null, root: row, path: [row], isLeaf: 0, isCycle: 0 };
    const c = hooks.ctx(row, hier);
    if (!spec.startWith || hooks.cond(spec.startWith, c) === true) roots.push({ row, ctx: c });
  }
  try {
    for (const r of sortSiblings(roots)) {
      visit(r.row, { level: 1, parent: null, root: r.row, path: [r.row], isLeaf: 0, isCycle: 0 }, r.row, []);
    }
  } catch (err) {
    // 깊이가 수천 단계인 계층(CONNECT BY LEVEL <= 5000 등)은 브라우저의 호출 깊이를 넘는다.
    if (err instanceof RangeError) throw new NotSupported('계층이 너무 깊어서(수천 단계) 실습장에서 펼치지 못했어요. LEVEL 상한을 줄여 보세요.');
    throw err;
  }
  return out;
}
