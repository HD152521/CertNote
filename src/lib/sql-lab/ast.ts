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
  | ({ type: 'unary'; op: '-' | '+' | 'NOT'; arg: Expr } & Span)
  | ({ type: 'bin'; op: string; left: Expr; right: Expr } & Span)
  | ({ type: 'and' | 'or'; left: Expr; right: Expr } & Span)
  | ({ type: 'isnull'; arg: Expr; not: boolean } & Span)
  | ({ type: 'between'; arg: Expr; low: Expr; high: Expr; not: boolean } & Span)
  | ({ type: 'in'; arg: Expr; list: Expr[]; not: boolean } & Span)
  | ({ type: 'insub'; arg: Expr; query: Select; not: boolean } & Span)
  | ({ type: 'like'; arg: Expr; pattern: Expr; escape?: Expr; not: boolean } & Span)
  | ({ type: 'func'; name: string; args: Expr[]; distinct?: boolean; star?: boolean } & Span)
  | ({ type: 'case'; base?: Expr; whens: { when: Expr; then: Expr }[]; else?: Expr } & Span)
  | ({ type: 'subquery'; query: Select } & Span)
  | ({ type: 'exists'; query: Select; not: boolean } & Span)
  | ({ type: 'cmpsub'; op: string; quant: 'ANY' | 'ALL'; left: Expr; query: Select } & Span)
  | ({ type: 'rownum' } & Span)
  | ({ type: 'tuple'; items: Expr[] } & Span)
  | ({ type: 'extract'; field: string; arg: Expr } & Span)
  | ({ type: 'trim'; mode: 'LEADING' | 'TRAILING' | 'BOTH'; chars?: Expr; arg: Expr } & Span);

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
  groupBy?: Expr[];
  having?: Expr;
}

export interface SetOp {
  type: 'set';
  op: 'UNION' | 'UNION ALL' | 'INTERSECT' | 'MINUS';
  left: Select;
  right: Select;
}

/** 쿼리 하나: 블록 또는 집합 연산, 그리고 맨 바깥 ORDER BY·FETCH */
export interface Select {
  body: QueryBlock | SetOp;
  orderBy?: OrderItem[];
  fetch?: { offset: number; count?: Expr; percent?: boolean; withTies?: boolean };
}
