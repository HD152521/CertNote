// SELECT 문 파서(재귀 하강). Oracle 문법 기준이며, 오류는 Oracle 과 같은 ORA 번호를 낸다.
import type { Expr, FromItem, JoinKind, OrderItem, QueryBlock, Select, SelectItem } from './ast';
import { headingOf, tokenize, type Token } from './lexer';
import { NotSupported, OraError, parseDefaultDate } from './values';

/** 별칭으로 쓸 수 없는 예약어 */
const RESERVED = new Set(
  ('SELECT FROM WHERE GROUP BY HAVING ORDER AND OR NOT IN IS NULL LIKE BETWEEN JOIN ON USING INNER LEFT RIGHT FULL ' +
    'OUTER CROSS NATURAL UNION INTERSECT MINUS DISTINCT ALL AS CASE WHEN THEN ELSE END EXISTS ANY SOME ESCAPE ASC DESC ' +
    'FETCH OFFSET CONNECT START PRIOR WITH INSERT UPDATE DELETE INTO VALUES SET CREATE DROP TABLE PIVOT UNPIVOT').split(' '),
);

const missingExpr = () => new OraError('ORA-00936', 'missing expression');
const notEnded = () => new OraError('ORA-00933', 'SQL command not properly ended');

export class Parser {
  private toks: Token[];
  private i = 0;

  constructor(private src: string) {
    this.toks = tokenize(src);
  }

  private get t(): Token {
    return this.toks[this.i];
  }
  private peek(n = 1): Token {
    return this.toks[Math.min(this.i + n, this.toks.length - 1)];
  }
  private isWord(w: string, tok = this.t) {
    return tok.kind === 'word' && tok.value === w;
  }
  private isOp(o: string, tok = this.t) {
    return tok.kind === 'op' && tok.value === o;
  }
  private acceptWord(w: string): boolean {
    if (!this.isWord(w)) return false;
    this.i++;
    return true;
  }
  private acceptOp(o: string): boolean {
    if (!this.isOp(o)) return false;
    this.i++;
    return true;
  }
  private expectOp(o: string) {
    if (this.acceptOp(o)) return;
    if (o === ')') throw new OraError('ORA-00907', 'missing right parenthesis');
    if (o === '(') throw new OraError('ORA-00906', 'missing left parenthesis');
    throw missingExpr();
  }
  private expectWord(w: string) {
    if (!this.acceptWord(w)) throw new OraError('ORA-00905', 'missing keyword');
  }
  private ident(): string {
    const tok = this.t;
    if (tok.kind === 'quoted' || (tok.kind === 'word' && !RESERVED.has(tok.value))) {
      this.i++;
      return tok.value;
    }
    throw new OraError('ORA-00903', 'invalid table name');
  }

  /** 문장 하나를 끝까지 읽는다. 끝에 ; 는 있어도 없어도 된다. */
  statement(): Select {
    const first = this.t;
    if (first.kind === 'word' && ['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'GRANT', 'REVOKE'].includes(first.value)) {
      throw new NotSupported(`${first.value} 문은 실습장 3단계(DML·TCL·DDL)에서 열려요. 지금은 SELECT 만 실행할 수 있어요.`);
    }
    if (first.kind === 'word' && first.value === 'WITH') throw new NotSupported('WITH 절은 아직 실습장에서 지원하지 않아요.');
    if (!this.isWord('SELECT')) throw new OraError('ORA-00900', 'invalid SQL statement');
    const q = this.select();
    this.acceptOp(';');
    if (this.t.kind !== 'end') throw this.unexpected();
    return q;
  }

  /** 문장이 끝나야 할 자리에 낱말이 더 있을 때. Oracle 23ai 의 문구(ORA-03048/03049)를 따른다. */
  private unexpected(): OraError {
    const tok = this.t;
    const before = this.src.slice(0, tok.start);
    const shown = before.length > 32 ? `...${before.slice(-29)}` : before;
    const word = this.src.slice(tok.start, tok.end);
    if (tok.kind === 'word' && RESERVED.has(tok.value)) {
      return new OraError('ORA-03048', `SQL reserved word '${tok.value}' is not syntactically valid following '${shown}'`);
    }
    if (tok.kind === 'word' || tok.kind === 'quoted') {
      return new OraError('ORA-03049', `SQL keyword '${word.toUpperCase()}' is not syntactically valid following '${shown}'`);
    }
    return notEnded();
  }

  select(): Select {
    let body: Select['body'] = this.queryTerm();
    for (;;) {
      let op: 'UNION' | 'UNION ALL' | 'INTERSECT' | 'MINUS' | null = null;
      if (this.acceptWord('UNION')) op = this.acceptWord('ALL') ? 'UNION ALL' : 'UNION';
      else if (this.acceptWord('INTERSECT')) op = 'INTERSECT';
      else if (this.acceptWord('MINUS') || this.acceptWord('EXCEPT')) op = 'MINUS';
      if (!op) break;
      const right = this.queryTerm();
      body = { type: 'set', op, left: { body }, right: { body: right } };
    }
    const q: Select = { body };
    if (this.isWord('ORDER')) {
      this.i++;
      this.expectWord('BY');
      q.orderBy = this.orderList();
    }
    if (this.isWord('OFFSET') || this.isWord('FETCH')) q.fetch = this.fetchClause();
    return q;
  }

  private fetchClause(): NonNullable<Select['fetch']> {
    let offset = 0;
    if (this.acceptWord('OFFSET')) {
      const n = this.t;
      if (n.kind !== 'number') throw missingExpr();
      this.i++;
      offset = Number(n.value);
      if (!this.acceptWord('ROWS')) this.expectWord('ROW');
    }
    if (!this.acceptWord('FETCH')) return { offset };
    if (!this.acceptWord('FIRST')) this.expectWord('NEXT');
    const count = this.isWord('ROW') || this.isWord('ROWS') ? undefined : this.additive();
    const percent = this.acceptWord('PERCENT');
    if (!this.acceptWord('ROWS')) this.expectWord('ROW');
    let withTies = false;
    if (this.acceptWord('WITH')) {
      this.expectWord('TIES');
      withTies = true;
    } else this.expectWord('ONLY');
    return { offset, count, percent, withTies };
  }

  /** SELECT 블록 하나, 또는 괄호로 싼 쿼리 */
  private queryTerm(): QueryBlock | Select['body'] {
    if (this.isOp('(')) {
      this.i++;
      const inner = this.select();
      this.expectOp(')');
      if (inner.orderBy) throw new OraError('ORA-00907', 'missing right parenthesis');
      return inner.body;
    }
    if (!this.acceptWord('SELECT')) throw missingExpr();
    const distinct = this.acceptWord('DISTINCT') || (this.acceptWord('UNIQUE') ? true : (this.acceptWord('ALL'), false));
    const items = this.selectList();
    if (!this.acceptWord('FROM')) {
      throw new OraError(
        'ORA-00923',
        'FROM keyword not found where expected',
        'Oracle 23ai 부터는 FROM 없는 SELECT 도 되지만, SQLD 시험과 그 이전 버전에서는 오류예요. 함수 결과만 볼 때는 FROM DUAL 을 붙여요.',
      );
    }
    const from = this.fromList();
    const q: QueryBlock = { type: 'query', distinct, items, from };
    if (this.acceptWord('WHERE')) q.where = this.expr();
    if (this.isWord('START') || this.isWord('CONNECT')) {
      throw new NotSupported('계층형 질의(START WITH·CONNECT BY)는 실습장 2단계에서 열려요.');
    }
    if (this.isWord('GROUP')) {
      this.i++;
      this.expectWord('BY');
      if (this.isWord('ROLLUP') || this.isWord('CUBE') || this.isWord('GROUPING')) {
        throw new NotSupported('ROLLUP·CUBE·GROUPING SETS 는 실습장 2단계에서 열려요.');
      }
      q.groupBy = [this.expr()];
      while (this.acceptOp(',')) q.groupBy.push(this.expr());
    }
    if (this.acceptWord('HAVING')) q.having = this.expr();
    // Oracle 은 HAVING 을 GROUP BY 앞에 써도 받아 준다.
    if (!q.groupBy && this.isWord('GROUP')) {
      this.i++;
      this.expectWord('BY');
      q.groupBy = [this.expr()];
      while (this.acceptOp(',')) q.groupBy.push(this.expr());
    }
    if (this.isWord('PIVOT') || this.isWord('UNPIVOT')) throw new NotSupported('PIVOT·UNPIVOT 은 실습장 3단계에서 열려요.');
    return q;
  }

  private selectList(): SelectItem[] {
    const items: SelectItem[] = [];
    do {
      const start = this.t.start;
      if (this.isWord('FROM') || this.t.kind === 'end') throw missingExpr();
      const expr = this.expr();
      const heading = headingOf(this.src, start, this.toks[this.i - 1].end);
      let alias: string | undefined;
      if (this.acceptWord('AS')) alias = this.aliasName(true);
      else if (this.t.kind === 'quoted' || (this.t.kind === 'word' && !RESERVED.has(this.t.value))) alias = this.aliasName(false);
      if (expr.type === 'star' && alias) throw new OraError('ORA-00923', 'FROM keyword not found where expected');
      items.push({ expr, alias, heading });
    } while (this.acceptOp(','));
    return items;
  }

  private aliasName(required: boolean): string {
    const tok = this.t;
    if (tok.kind === 'quoted' || (tok.kind === 'word' && !RESERVED.has(tok.value))) {
      this.i++;
      return tok.value;
    }
    if (required) throw missingExpr();
    throw new OraError('ORA-00923', 'FROM keyword not found where expected');
  }

  private fromList(): FromItem[] {
    const list = [this.joined()];
    while (this.acceptOp(',')) list.push(this.joined());
    return list;
  }

  private joined(): FromItem {
    let left = this.tableRef();
    for (;;) {
      const natural = this.acceptWord('NATURAL');
      let kind: JoinKind | null = null;
      if (this.acceptWord('CROSS')) kind = 'CROSS';
      else if (this.acceptWord('INNER')) kind = 'INNER';
      else if (this.isWord('LEFT') || this.isWord('RIGHT') || this.isWord('FULL')) {
        kind = this.t.value as JoinKind;
        this.i++;
        this.acceptWord('OUTER');
      } else if (this.isWord('JOIN')) kind = 'INNER';
      if (!kind) {
        if (natural) throw new OraError('ORA-00905', 'missing keyword');
        return left;
      }
      this.expectWord('JOIN');
      const right = this.tableRef();
      const join: FromItem = { type: 'join', kind, natural, left, right };
      if (!natural && kind !== 'CROSS') {
        if (this.acceptWord('ON')) join.on = this.expr();
        else if (this.acceptWord('USING')) {
          this.expectOp('(');
          join.using = [this.ident()];
          while (this.acceptOp(',')) join.using.push(this.ident());
          this.expectOp(')');
        } else throw new OraError('ORA-02000', 'missing ON or USING keyword');
      }
      left = join;
    }
  }

  private tableRef(): FromItem {
    if (this.isOp('(')) {
      this.i++;
      if (!this.isWord('SELECT') && !this.isOp('(')) {
        // (EMP JOIN DEPT ...) 처럼 괄호로 싼 조인
        const inner = this.joined();
        this.expectOp(')');
        return inner;
      }
      const query = this.select();
      this.expectOp(')');
      return { type: 'view', query, alias: this.tableAlias() };
    }
    if (this.t.kind !== 'word' && this.t.kind !== 'quoted') throw new OraError('ORA-00903', 'invalid table name');
    let name = this.ident();
    if (this.acceptOp('.')) name = this.ident(); // SCOTT.EMP → EMP
    return { type: 'table', name, alias: this.tableAlias() };
  }

  private tableAlias(): string | undefined {
    if (this.isWord('AS')) throw new OraError('ORA-00933', 'SQL command not properly ended'); // Oracle 은 테이블 별칭에 AS 를 받지 않는다
    if (this.t.kind === 'quoted' || (this.t.kind === 'word' && !RESERVED.has(this.t.value))) return this.ident();
    return undefined;
  }

  private orderList(): OrderItem[] {
    const out: OrderItem[] = [];
    do {
      const expr = this.expr();
      let desc = false;
      if (this.acceptWord('DESC')) desc = true;
      else this.acceptWord('ASC');
      let nulls: OrderItem['nulls'];
      if (this.acceptWord('NULLS')) {
        if (this.acceptWord('FIRST')) nulls = 'FIRST';
        else {
          this.expectWord('LAST');
          nulls = 'LAST';
        }
      }
      out.push({ expr, desc, nulls });
    } while (this.acceptOp(','));
    return out;
  }

  // ── 식 ────────────────────────────────────────────────────────────────────
  expr(): Expr {
    return this.orExpr();
  }

  private span<T extends object>(start: number, node: T): T & { start: number; end: number } {
    return { ...node, start, end: this.toks[this.i - 1].end };
  }

  private orExpr(): Expr {
    const start = this.t.start;
    let left = this.andExpr();
    while (this.acceptWord('OR')) left = this.span(start, { type: 'or' as const, left, right: this.andExpr() });
    return left;
  }

  private andExpr(): Expr {
    const start = this.t.start;
    let left = this.notExpr();
    while (this.acceptWord('AND')) left = this.span(start, { type: 'and' as const, left, right: this.notExpr() });
    return left;
  }

  private notExpr(): Expr {
    const start = this.t.start;
    if (this.acceptWord('NOT')) return this.span(start, { type: 'unary' as const, op: 'NOT' as const, arg: this.notExpr() });
    return this.predicate();
  }

  private predicate(): Expr {
    const start = this.t.start;
    if (this.isWord('EXISTS')) {
      this.i++;
      this.expectOp('(');
      const query = this.select();
      this.expectOp(')');
      return this.span(start, { type: 'exists' as const, query, not: false });
    }
    const left = this.additive();
    if (this.acceptWord('IS')) {
      const not = this.acceptWord('NOT');
      this.expectWord('NULL');
      return this.span(start, { type: 'isnull' as const, arg: left, not });
    }
    const not = this.acceptWord('NOT');
    if (this.acceptWord('BETWEEN')) {
      const low = this.additive();
      this.expectWord('AND');
      const high = this.additive();
      return this.span(start, { type: 'between' as const, arg: left, low, high, not });
    }
    if (this.acceptWord('IN')) {
      this.expectOp('(');
      if (this.isWord('SELECT')) {
        const query = this.select();
        this.expectOp(')');
        return this.span(start, { type: 'insub' as const, arg: left, query, not });
      }
      const list = [this.additive()];
      while (this.acceptOp(',')) list.push(this.additive());
      this.expectOp(')');
      return this.span(start, { type: 'in' as const, arg: left, list, not });
    }
    if (this.acceptWord('LIKE')) {
      const pattern = this.additive();
      const escape = this.acceptWord('ESCAPE') ? this.additive() : undefined;
      return this.span(start, { type: 'like' as const, arg: left, pattern, escape, not });
    }
    if (not) throw new OraError('ORA-00920', 'invalid relational operator');
    const t = this.t;
    if (t.kind === 'op' && ['=', '<>', '!=', '^=', '<', '>', '<=', '>='].includes(t.value)) {
      this.i++;
      const op = t.value === '!=' || t.value === '^=' ? '<>' : t.value;
      if (this.isWord('ANY') || this.isWord('SOME') || this.isWord('ALL')) {
        const quant = this.t.value === 'ALL' ? 'ALL' : 'ANY';
        this.i++;
        this.expectOp('(');
        if (!this.isWord('SELECT')) {
          const list = [this.additive()];
          while (this.acceptOp(',')) list.push(this.additive());
          this.expectOp(')');
          // 목록에 대한 ANY/ALL 은 OR/AND 로 풀어 둔다.
          return list
            .map((x): Expr => ({ type: 'bin', op, left, right: x, start, end: x.end }))
            .reduce((a, b) => ({ type: quant === 'ALL' ? 'and' : 'or', left: a, right: b, start, end: b.end }));
        }
        const query = this.select();
        this.expectOp(')');
        return this.span(start, { type: 'cmpsub' as const, op, quant: quant as 'ANY' | 'ALL', left, query });
      }
      const right = this.additive();
      return this.span(start, { type: 'bin' as const, op, left, right });
    }
    return left;
  }

  /** + - || 는 같은 우선순위(Oracle) */
  private additive(): Expr {
    const start = this.t.start;
    let left = this.multiplicative();
    for (;;) {
      const t = this.t;
      if (t.kind === 'op' && (t.value === '+' || t.value === '-' || t.value === '||')) {
        this.i++;
        left = this.span(start, { type: 'bin' as const, op: t.value, left, right: this.multiplicative() });
      } else return left;
    }
  }

  private multiplicative(): Expr {
    const start = this.t.start;
    let left = this.unary();
    for (;;) {
      const t = this.t;
      if (t.kind === 'op' && (t.value === '*' || t.value === '/')) {
        this.i++;
        left = this.span(start, { type: 'bin' as const, op: t.value, left, right: this.unary() });
      } else return left;
    }
  }

  private unary(): Expr {
    const start = this.t.start;
    if (this.isOp('-') || this.isOp('+')) {
      const op = this.t.value as '-' | '+';
      this.i++;
      return this.span(start, { type: 'unary' as const, op, arg: this.unary() });
    }
    return this.primary();
  }

  private primary(): Expr {
    const t = this.t;
    const start = t.start;
    if (t.kind === 'number') {
      this.i++;
      return this.span(start, { type: 'lit' as const, value: Number(t.value) });
    }
    if (t.kind === 'string') {
      this.i++;
      // Oracle 에서 '' 는 NULL 이다.
      return this.span(start, { type: 'lit' as const, value: t.value === '' ? null : t.value });
    }
    if (t.kind === 'op' && t.value === '(') {
      this.i++;
      if (this.isWord('SELECT')) {
        const query = this.select();
        this.expectOp(')');
        return this.span(start, { type: 'subquery' as const, query });
      }
      const inner = this.expr();
      if (this.isOp(',')) {
        // (JOB, DEPTNO) IN (...) 의 여러 열 묶음
        const items = [inner];
        while (this.acceptOp(',')) items.push(this.expr());
        this.expectOp(')');
        return this.span(start, { type: 'tuple' as const, items });
      }
      this.expectOp(')');
      return this.span(start, { ...inner });
    }
    if (t.kind === 'op' && t.value === '*') {
      this.i++;
      return this.span(start, { type: 'star' as const });
    }
    if (t.kind === 'quoted') {
      this.i++;
      return this.columnTail(start, t.value);
    }
    if (t.kind !== 'word') throw missingExpr();
    const w = t.value;
    if (w === 'NULL') {
      this.i++;
      return this.span(start, { type: 'lit' as const, value: null });
    }
    if (w === 'DATE' && this.peek().kind === 'string') {
      this.i += 2;
      return this.span(start, { type: 'lit' as const, value: parseDefaultDate(this.toks[this.i - 1].value) });
    }
    if (w === 'CASE') return this.caseExpr();
    if (w === 'ROWNUM') {
      this.i++;
      return this.span(start, { type: 'rownum' as const });
    }
    if (w === 'PRIOR' || w === 'LEVEL' || w === 'CONNECT_BY_ROOT' || w === 'SYS_CONNECT_BY_PATH') {
      throw new NotSupported('계층형 질의(LEVEL·PRIOR)는 실습장 2단계에서 열려요.');
    }
    if (RESERVED.has(w)) throw missingExpr();
    this.i++;
    if (this.isOp('(')) return this.call(start, w);
    return this.columnTail(start, w);
  }

  /** 이름 뒤: .열, .*, (+) */
  private columnTail(start: number, first: string): Expr {
    if (this.acceptOp('.')) {
      if (this.acceptOp('*')) return this.span(start, { type: 'star' as const, table: first });
      const name = this.t.kind === 'quoted' || this.t.kind === 'word' ? this.t.value : '';
      if (!name) throw missingExpr();
      this.i++;
      const outer = this.acceptOp('(+)');
      return this.span(start, { type: 'col' as const, table: first, name, outer });
    }
    const outer = this.acceptOp('(+)');
    return this.span(start, { type: 'col' as const, name: first, outer });
  }

  private caseExpr(): Expr {
    const start = this.t.start;
    this.i++;
    const base = this.isWord('WHEN') ? undefined : this.expr();
    const whens: { when: Expr; then: Expr }[] = [];
    while (this.acceptWord('WHEN')) {
      const when = this.expr();
      this.expectWord('THEN');
      whens.push({ when, then: this.expr() });
    }
    if (whens.length === 0) throw new OraError('ORA-00905', 'missing keyword');
    const elseExpr = this.acceptWord('ELSE') ? this.expr() : undefined;
    this.expectWord('END');
    return this.span(start, { type: 'case' as const, base, whens, else: elseExpr });
  }

  private call(start: number, name: string): Expr {
    this.expectOp('(');
    if (name === 'EXTRACT') {
      const field = this.t.value;
      if (!['YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND'].includes(field)) throw new OraError('ORA-00907', 'missing right parenthesis');
      this.i++;
      this.expectWord('FROM');
      const arg = this.expr();
      this.expectOp(')');
      return this.span(start, { type: 'extract' as const, field, arg });
    }
    if (name === 'TRIM') {
      let mode: 'LEADING' | 'TRAILING' | 'BOTH' = 'BOTH';
      let explicitMode = false;
      if (this.isWord('LEADING') || this.isWord('TRAILING') || this.isWord('BOTH')) {
        mode = this.t.value as typeof mode;
        explicitMode = true;
        this.i++;
      }
      let chars: Expr | undefined;
      let arg: Expr;
      if (explicitMode && this.acceptWord('FROM')) arg = this.expr();
      else {
        const first = this.expr();
        if (this.acceptWord('FROM')) {
          chars = first;
          arg = this.expr();
        } else arg = first;
      }
      this.expectOp(')');
      return this.span(start, { type: 'trim' as const, mode, chars, arg });
    }
    if (this.acceptOp(')')) return this.overCheck(this.span(start, { type: 'func' as const, name, args: [] }));
    if (this.isOp('*') && this.peek().kind === 'op' && this.peek().value === ')') {
      this.i += 2;
      return this.overCheck(this.span(start, { type: 'func' as const, name, args: [], star: true }));
    }
    const distinct = this.acceptWord('DISTINCT') || (this.acceptWord('ALL'), false);
    const args = [this.expr()];
    while (this.acceptOp(',')) args.push(this.expr());
    this.expectOp(')');
    return this.overCheck(this.span(start, { type: 'func' as const, name, args, distinct }));
  }

  private overCheck(e: Expr): Expr {
    if (this.isWord('OVER')) throw new NotSupported('윈도우 함수(OVER 절)는 실습장 2단계에서 열려요.');
    if (this.isWord('WITHIN') || this.isWord('KEEP')) throw new NotSupported('WITHIN GROUP·KEEP 은 아직 실습장에서 지원하지 않아요.');
    return e;
  }
}

/** 여러 문장을 ; 기준으로 나눈다(따옴표 안의 ; 는 건드리지 않는다). */
export function splitStatements(src: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    if (c === '-' && src[i + 1] === '-') {
      const nl = src.indexOf('\n', i);
      const stop = nl < 0 ? src.length : nl;
      cur += src.slice(i, stop);
      i = stop - 1;
      continue;
    }
    if (c === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parseSelect(src: string): Select {
  return new Parser(src).statement();
}
