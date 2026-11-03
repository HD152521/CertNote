// SQL 실습장 구문 트리.
import type { Value } from './values';

export interface Span {
  start: number;
  end: number;
}

export type Expr =
  | ({ type: 'lit'; value: Value } & Span)
  | ({ type: 'col'; table?: string; name: string; outer?: boolean } & Span)
  | ({ type: 'star'; table?: string } & Span)
  | ({ type: 'unary'; op: '-' | '+' | 'NOT' | 'PRIOR' | 'ROOT'; arg: Expr } & Span)
  /** 계층형 질의의 가상 열 */
  | ({ type: 'pseudo'; name: 'LEVEL' | 'CONNECT_BY_ISLEAF' | 'CONNECT_BY_ISCYCLE' } & Span)
  | ({ type: 'bin'; op: string; left: Expr; right: Expr } & Span)
  | ({ type: 'and' | 'or'; left: Expr; right: Expr } & Span)
  | ({ type: 'isnull'; arg: Expr; not: boolean } & Span)
  | ({ type: 'between'; arg: Expr; low: Expr; high: Expr; not: boolean } & Span)
  | ({ type: 'in'; arg: Expr; list: Expr[]; not: boolean } & Span)
  | ({ type: 'insub'; arg: Expr; query: Select; not: boolean } & Span)
  | ({ type: 'like'; arg: Expr; pattern: Expr; escape?: Expr; not: boolean } & Span)
  | ({ type: 'func'; name: string; args: Expr[]; distinct?: boolean; star?: boolean; over?: WindowSpec; withinGroup?: OrderItem[] } & Span)
  | ({ type: 'case'; base?: Expr; whens: { when: Expr; then: Expr }[]; else?: Expr } & Span)
  | ({ type: 'subquery'; query: Select } & Span)
  | ({ type: 'exists'; query: Select; not: boolean } & Span)
  | ({ type: 'cmpsub'; op: string; quant: 'ANY' | 'ALL'; left: Expr; query: Select } & Span)
  | ({ type: 'rownum' } & Span)
  | ({ type: 'tuple'; items: Expr[] } & Span)
  /** SELECT * 가 펼친 열(이름으로 못 찾는 숨은 열도 위치로 가리킨다) */
  | ({ type: 'slot'; index: number; table?: string; name: string } & Span)
  | ({ type: 'extract'; field: string; arg: Expr } & Span)
  | ({ type: 'trim'; mode: 'LEADING' | 'TRAILING' | 'BOTH'; chars?: Expr; arg: Expr } & Span);

export interface WindowBound {
  kind: 'UNBOUNDED PRECEDING' | 'UNBOUNDED FOLLOWING' | 'CURRENT ROW' | 'PRECEDING' | 'FOLLOWING';
  offset?: number;
}

/** OVER (PARTITION BY … ORDER BY … ROWS|RANGE BETWEEN … AND …) */
export interface WindowSpec {
  partitionBy: Expr[];
  orderBy: OrderItem[];
  frame?: { unit: 'ROWS' | 'RANGE'; start: WindowBound; end: WindowBound };
}

export interface SelectItem {
  expr: Expr;
  alias?: string;
  /** 별칭이 없을 때의 열 제목(식 원문) */
  heading: string;
}

export type JoinKind = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';

export type FromItem =
  | { type: 'table'; name: string; alias?: string }
  | { type: 'view'; query: Select; alias?: string }
  | { type: 'join'; kind: JoinKind; natural: boolean; left: FromItem; right: FromItem; on?: Expr; using?: string[] };

export interface OrderItem {
  expr: Expr;
  desc: boolean;
  nulls?: 'FIRST' | 'LAST';
}

export interface QueryBlock {
  type: 'query';
  distinct: boolean;
  items: SelectItem[];
  from: FromItem[];
  where?: Expr;
  /** GROUP BY 에 나온 식 전부(중복 없이). ROLLUP·CUBE 안의 식도 여기 있다. */
  groupBy?: Expr[];
  /** ROLLUP·CUBE·GROUPING SETS 를 펼친 묶음 목록. 없으면 groupBy 하나로만 묶는다. */
  groupingSets?: Expr[][];
  /** START WITH … CONNECT BY … */
  connectBy?: { startWith?: Expr; condition: Expr; nocycle: boolean };
  /** GROUP BY () 만 쓴 경우: 행이 없어도 총계 한 행을 낸다(GROUPING SETS(()) 는 0행이다) */
  grandTotalOnly?: boolean;
  having?: Expr;
}

export interface SetOp {
  type: 'set';
  op: 'UNION' | 'UNION ALL' | 'INTERSECT' | 'MINUS';
  left: Select;
  right: Select;
}

/** WITH 절의 이름 붙은 쿼리 하나 */
export interface WithQuery {
  name: string;
  columns?: string[];
  query: Select;
}

/** 쿼리 하나: 블록 또는 집합 연산, 그리고 맨 바깥 ORDER BY·FETCH */
export interface Select {
  with?: WithQuery[];
  body: QueryBlock | SetOp;
  /** ORDER SIBLINGS BY: 계층형 질의에서 형제끼리만 정렬 */
  orderSiblings?: OrderItem[];
  orderBy?: OrderItem[];
  fetch?: { offset: number; count?: Expr; percent?: boolean; withTies?: boolean };
}
