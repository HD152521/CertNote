// SELECT 밖의 문장(DML·DDL·TCL·DCL) 구문. 파서는 SELECT 파서(Parser)를 이어받아 식·서브쿼리를 그대로 쓴다.
import type { Expr, FromItem, Select } from './ast';
import { Parser, RESERVED, missingExpr } from './parser';
import { OraError } from './values';

export interface SetClause {
  columns: string[];
  /** SET A = 식, 또는 SET (A, B) = (서브쿼리) */
  value: Expr | Select;
}

export interface ColumnDef {
  name: string;
  spec: string;
  default?: Expr;
  notNull: boolean;
  inline: InlineConstraint[];
}

export interface InlineConstraint {
  name?: string;
  kind: 'P' | 'U' | 'C' | 'R' | 'N';
  check?: Expr;
  refTable?: string;
  refColumns?: string[];
  onDelete?: 'CASCADE' | 'SET NULL';
}

export interface TableConstraintDef extends InlineConstraint {
  columns: string[];
}

export type AlterAction =
  | { kind: 'add'; columns: ColumnDef[] }
  | { kind: 'modify'; columns: { name: string; spec?: string; nullable?: boolean; default?: Expr }[] }
  | { kind: 'dropColumn'; columns: string[] }
  | { kind: 'renameColumn'; from: string; to: string }
  | { kind: 'addConstraint'; constraint: TableConstraintDef }
  | { kind: 'dropConstraint'; name: string }
  | { kind: 'dropPrimaryKey' };

export type Statement =
  | { type: 'select'; query: Select }
  | { type: 'insert'; table: string; columns?: string[]; values?: Expr[]; query?: Select }
  | { type: 'update'; table: string; alias?: string; sets: SetClause[]; where?: Expr }
  | { type: 'delete'; table: string; alias?: string; where?: Expr }
  | {
      type: 'merge';
      table: string;
      alias?: string;
      source: FromItem;
      on: Expr;
      matched?: { sets: SetClause[]; where?: Expr; deleteWhere?: Expr };
      notMatched?: { columns?: string[]; values: Expr[]; where?: Expr };
    }
  | { type: 'createTable'; name: string; columns: ColumnDef[]; constraints: TableConstraintDef[] }
  | { type: 'createTableAs'; name: string; columns?: string[]; query: Select }
  | { type: 'createView'; name: string; replace: boolean; columns?: string[]; query: Select }
  | { type: 'dropTable'; name: string; cascade: boolean }
  | { type: 'dropView'; name: string }
  | { type: 'truncate'; name: string }
  | { type: 'alter'; name: string; action: AlterAction }
  | { type: 'rename'; from: string; to: string }
  | { type: 'commit' }
  | { type: 'rollback'; to?: string }
  | { type: 'savepoint'; name: string }
  | { type: 'dcl'; verb: string };

/** DEFAULT 키워드(INSERT VALUES 안) 표시 */
export const DEFAULT_MARK = '\u0000DEFAULT';

const TYPE_WORDS = new Set(['NUMBER', 'VARCHAR2', 'VARCHAR', 'CHAR', 'DATE', 'INTEGER', 'INT', 'NVARCHAR2', 'NCHAR']);

export class StatementParser extends Parser {
  parseStatement(): Statement {
    const t = this.t;
    if (t.kind !== 'word') {
      if (this.isOp('(')) return { type: 'select', query: this.statement() };
      throw new OraError('ORA-00900', 'invalid SQL statement');
    }
    let st: Statement;
    switch (t.value) {
      case 'SELECT':
      case 'WITH':
        return { type: 'select', query: this.statement() };
      case 'INSERT':
        st = this.insert();
        break;
      case 'UPDATE':
        st = this.update();
        break;
      case 'DELETE':
        st = this.del();
        break;
      case 'MERGE':
        st = this.merge();
        break;
      case 'CREATE':
        st = this.create();
        break;
      case 'DROP':
        st = this.drop();
        break;
      case 'TRUNCATE':
        this.i++;
        this.expectWord('TABLE');
        st = { type: 'truncate', name: this.name() };
        break;
      case 'ALTER':
        st = this.alter();
        break;
      case 'RENAME': {
        this.i++;
        const from = this.name();
        this.expectWord('TO');
        st = { type: 'rename', from, to: this.name() };
        break;
      }
      case 'COMMIT':
        this.i++;
        this.acceptWord('WORK');
        st = { type: 'commit' };
        break;
      case 'ROLLBACK': {
        this.i++;
        this.acceptWord('WORK');
        if (this.acceptWord('TO')) {
          this.acceptWord('SAVEPOINT');
          st = { type: 'rollback', to: this.name() };
        } else st = { type: 'rollback' };
        break;
      }
      case 'SAVEPOINT':
        this.i++;
        st = { type: 'savepoint', name: this.name() };
        break;
      case 'FLASHBACK':
      case 'PURGE':
        while (this.t.kind !== 'end') this.i++;
        return { type: 'dcl', verb: t.value };
      case 'GRANT':
      case 'REVOKE':
        // 권한은 사용자가 여럿인 실제 DB 에서만 의미가 있다. 구문은 끝까지 넘기고 안내만 한다.
        while (this.t.kind !== 'end') this.i++;
        return { type: 'dcl', verb: t.value };
      default:
        throw new OraError('ORA-00900', 'invalid SQL statement');
    }
    this.acceptOp(';');
    if (this.t.kind !== 'end') throw this.unexpected();
    return st;
  }

  /** 테이블·열 이름(예약어가 아닌 단어, "따옴표", SCOTT.EMP 의 EMP) */
  private name(): string {
    const tok = this.t;
    if (tok.kind === 'quoted' || (tok.kind === 'word' && !RESERVED.has(tok.value))) {
      this.i++;
      if (this.acceptOp('.')) return this.name();
      return tok.value;
    }
    if (tok.kind === 'word') {
      // DATE·LEVEL 같은 예약어는 테이블 이름이 될 수 없다.
      this.i++;
      return tok.value;
    }
    throw new OraError('ORA-00903', 'invalid table name');
  }

  private nameList(): string[] {
    this.expectOp('(');
    const out = [this.name()];
    while (this.acceptOp(',')) out.push(this.name());
    this.expectOp(')');
    return out;
  }

  private optAlias(): string | undefined {
    const tok = this.t;
    if (tok.kind === 'quoted' || (tok.kind === 'word' && !RESERVED.has(tok.value) && !['SET', 'WHERE', 'USING', 'VALUES'].includes(tok.value))) {
      this.i++;
      return tok.value;
    }
    return undefined;
  }

  private insert(): Statement {
    this.i++;
    if (this.isWord('ALL') || this.isWord('FIRST')) throw new OraError('ORA-00925', 'missing INTO keyword');
    this.expectWord('INTO');
    const table = this.name();
    let columns: string[] | undefined;
    if (this.isOp('(') && !(this.peek().kind === 'word' && (this.peek().value === 'SELECT' || this.peek().value === 'WITH'))) columns = this.nameList();
    if (this.acceptWord('VALUES')) {
      this.expectOp('(');
      const values: Expr[] = [this.valueOrDefault()];
      while (this.acceptOp(',')) values.push(this.valueOrDefault());
      this.expectOp(')');
      return { type: 'insert', table, columns, values };
    }
    if (this.isWord('SELECT') || this.isWord('WITH') || this.isOp('(')) return { type: 'insert', table, columns, query: this.select() };
    throw new OraError('ORA-00926', 'missing VALUES keyword');
  }

  private valueOrDefault(): Expr {
    const start = this.t.start;
    if (this.acceptWord('DEFAULT')) return { type: 'lit', value: DEFAULT_MARK, start, end: start + 7 };
    return this.expr();
  }

  private setList(): SetClause[] {
    const out: SetClause[] = [];
    do {
      if (this.isOp('(')) {
        const columns = this.nameList();
        if (!this.acceptOp('=')) throw new OraError('ORA-00927', 'missing equal sign');
        this.expectOp('(');
        const q = this.select();
        this.expectOp(')');
        out.push({ columns, value: q });
      } else {
        const c = this.name();
        if (this.acceptOp('.')) {
          // SET E.SAL = …(별칭 붙인 열)
          out.push({ columns: [this.name()], value: this.afterEqual() });
          void c;
          continue;
        }
        out.push({ columns: [c], value: this.afterEqual() });
      }
    } while (this.acceptOp(','));
    return out;
  }

  private afterEqual(): Expr {
    if (!this.acceptOp('=')) throw new OraError('ORA-00927', 'missing equal sign');
    const start = this.t.start;
    if (this.acceptWord('DEFAULT')) return { type: 'lit', value: DEFAULT_MARK, start, end: start + 7 };
    return this.expr();
  }

  private update(): Statement {
    this.i++;
    const table = this.name();
    const alias = this.optAlias();
    this.expectWord('SET');
    const sets = this.setList();
    const where = this.acceptWord('WHERE') ? this.expr() : undefined;
    return { type: 'update', table, alias, sets, where };
  }

  private del(): Statement {
    this.i++;
    this.acceptWord('FROM');
    const table = this.name();
    const alias = this.optAlias();
    const where = this.acceptWord('WHERE') ? this.expr() : undefined;
    return { type: 'delete', table, alias, where };
  }

  private merge(): Statement {
    this.i++;
    this.expectWord('INTO');
    const table = this.name();
    const alias = this.optAlias();
    this.expectWord('USING');
    const source = this.tableRef();
    this.expectWord('ON');
    this.expectOp('(');
    const on = this.expr();
    this.expectOp(')');
    const st: Extract<Statement, { type: 'merge' }> = { type: 'merge', table, alias, source, on };
    while (this.acceptWord('WHEN')) {
      if (this.acceptWord('MATCHED')) {
        this.expectWord('THEN');
        this.expectWord('UPDATE');
        this.expectWord('SET');
        const sets = this.setList();
        const where = this.acceptWord('WHERE') ? this.expr() : undefined;
        let deleteWhere: Expr | undefined;
        if (this.acceptWord('DELETE')) {
          this.expectWord('WHERE');
          deleteWhere = this.expr();
        }
        st.matched = { sets, where, deleteWhere };
      } else {
        this.expectWord('NOT');
        this.expectWord('MATCHED');
        this.expectWord('THEN');
        this.expectWord('INSERT');
        const columns = this.isOp('(') ? this.nameList() : undefined;
        this.expectWord('VALUES');
        this.expectOp('(');
        const values = [this.valueOrDefault()];
        while (this.acceptOp(',')) values.push(this.valueOrDefault());
        this.expectOp(')');
        const where = this.acceptWord('WHERE') ? this.expr() : undefined;
        st.notMatched = { columns, values, where };
      }
    }
    if (!st.matched && !st.notMatched) throw new OraError('ORA-00905', 'missing keyword');
    return st;
  }

  private create(): Statement {
    this.i++;
    let replace = false;
    if (this.acceptWord('OR')) {
      this.expectWord('REPLACE');
      replace = true;
    }
    if (this.acceptWord('VIEW')) {
      const name = this.name();
      const columns = this.isOp('(') ? this.nameList() : undefined;
      this.expectWord('AS');
      return { type: 'createView', name, replace, columns, query: this.select() };
    }
    if (this.acceptWord('GLOBAL') || this.isWord('USER') || this.isWord('ROLE') || this.isWord('SEQUENCE') || this.isWord('INDEX') || this.isWord('UNIQUE') || this.isWord('SYNONYM')) {
      const what = this.t.value;
      if (what === 'USER' || what === 'ROLE') {
        while (this.t.kind !== 'end') this.i++;
        return { type: 'dcl', verb: `CREATE ${what}` };
      }
      throw new OraError('ORA-00901', 'invalid CREATE command');
    }
    this.expectWord('TABLE');
    const name = this.name();
    if (this.acceptWord('AS')) return { type: 'createTableAs', name, query: this.select() };
    this.expectOp('(');
    // CREATE TABLE T (A, B) AS SELECT …
    if ((this.t.kind === 'word' || this.t.kind === 'quoted') && this.peek().kind === 'op' && (this.peek().value === ',' || this.peek().value === ')') && !TYPE_WORDS.has(this.peek().value)) {
      const columns = [this.name()];
      while (this.acceptOp(',')) columns.push(this.name());
      this.expectOp(')');
      this.expectWord('AS');
      return { type: 'createTableAs', name, columns, query: this.select() };
    }
    const columns: ColumnDef[] = [];
    const constraints: TableConstraintDef[] = [];
    do {
      if (this.isWord('CONSTRAINT') || this.isWord('PRIMARY') || this.isWord('UNIQUE') || this.isWord('CHECK') || this.isWord('FOREIGN')) {
        constraints.push(this.tableConstraint());
      } else columns.push(this.columnDef());
    } while (this.acceptOp(','));
    this.expectOp(')');
    return { type: 'createTable', name, columns, constraints };
  }

  /** 자료형: NUMBER(7,2), VARCHAR2(10 BYTE), DATE */
  private dataType(): string {
    const tok = this.t;
    if (tok.kind !== 'word') throw new OraError('ORA-00902', 'invalid datatype');
    if (!TYPE_WORDS.has(tok.value)) {
      if (['TIMESTAMP', 'CLOB', 'BLOB', 'FLOAT', 'LONG', 'RAW', 'BOOLEAN'].includes(tok.value)) {
        throw new OraError('ORA-00902', 'invalid datatype', `${tok.value} 형은 실습장에서 아직 지원하지 않아요. NUMBER·VARCHAR2·CHAR·DATE 를 써 주세요.`);
      }
      throw new OraError('ORA-00902', 'invalid datatype');
    }
    this.i++;
    let spec = tok.value === 'VARCHAR' || tok.value === 'NVARCHAR2' ? 'VARCHAR2' : tok.value === 'NCHAR' ? 'CHAR' : tok.value;
    if (this.acceptOp('(')) {
      const a = this.t;
      if (a.kind !== 'number' && !(a.kind === 'op' && a.value === '*')) throw missingExpr();
      this.i++;
      let inner = a.value;
      if (this.acceptOp(',')) {
        const neg = this.acceptOp('-');
        const b = this.t;
        if (b.kind !== 'number') throw missingExpr();
        this.i++;
        inner += `,${neg ? '-' : ''}${b.value}`;
      }
      this.acceptWord('BYTE');
      this.acceptWord('CHAR');
      this.expectOp(')');
      spec += `(${inner})`;
    }
    if ((spec === 'VARCHAR2' || spec === 'NVARCHAR2') && !spec.includes('(')) throw new OraError('ORA-00906', 'missing left parenthesis');
    return spec;
  }

  private columnDef(): ColumnDef {
    const name = this.name();
    const spec = this.dataType();
    const def: ColumnDef = { name, spec, notNull: false, inline: [] };
    for (;;) {
      if (this.acceptWord('DEFAULT')) {
        def.default = this.additive2();
        continue;
      }
      let cname: string | undefined;
      if (this.acceptWord('CONSTRAINT')) cname = this.name();
      if (this.acceptWord('NOT')) {
        this.expectWord('NULL');
        def.notNull = true;
        def.inline.push({ name: cname, kind: 'N' });
      } else if (this.acceptWord('NULL')) {
        /* 기본값과 같다 */
      } else if (this.acceptWord('PRIMARY')) {
        this.expectWord('KEY');
        def.inline.push({ name: cname, kind: 'P' });
      } else if (this.acceptWord('UNIQUE')) def.inline.push({ name: cname, kind: 'U' });
      else if (this.acceptWord('CHECK')) {
        this.expectOp('(');
        def.inline.push({ name: cname, kind: 'C', check: this.expr() });
        this.expectOp(')');
      } else if (this.acceptWord('REFERENCES')) {
        def.inline.push({ name: cname, kind: 'R', ...this.references() });
      } else if (cname) throw new OraError('ORA-02253', 'constraint specification not allowed here');
      else break;
    }
    return def;
  }

  /** DEFAULT 뒤의 값(제약 조건 키워드 앞에서 멈춘다) */
  private additive2(): Expr {
    // DEFAULT 0 NOT NULL 의 NOT 을 식으로 읽지 않도록 비교 연산 앞에서 멈춘다.
    return this.additive();
  }

  private references(): { refTable: string; refColumns?: string[]; onDelete?: 'CASCADE' | 'SET NULL' } {
    const refTable = this.name();
    const refColumns = this.isOp('(') ? this.nameList() : undefined;
    let onDelete: 'CASCADE' | 'SET NULL' | undefined;
    if (this.acceptWord('ON')) {
      this.expectWord('DELETE');
      if (this.acceptWord('CASCADE')) onDelete = 'CASCADE';
      else {
        this.expectWord('SET');
        this.expectWord('NULL');
        onDelete = 'SET NULL';
      }
    }
    return { refTable, refColumns, onDelete };
  }

  private tableConstraint(): TableConstraintDef {
    const name = this.acceptWord('CONSTRAINT') ? this.name() : undefined;
    if (this.acceptWord('PRIMARY')) {
      this.expectWord('KEY');
      return { name, kind: 'P', columns: this.nameList() };
    }
    if (this.acceptWord('UNIQUE')) return { name, kind: 'U', columns: this.nameList() };
    if (this.acceptWord('CHECK')) {
      this.expectOp('(');
      const check = this.expr();
      this.expectOp(')');
      return { name, kind: 'C', columns: [], check };
    }
    if (this.acceptWord('FOREIGN')) {
      this.expectWord('KEY');
      const columns = this.nameList();
      this.expectWord('REFERENCES');
      return { name, kind: 'R', columns, ...this.references() };
    }
    throw new OraError('ORA-00902', 'invalid datatype');
  }

  private drop(): Statement {
    this.i++;
    if (this.acceptWord('VIEW')) return { type: 'dropView', name: this.name() };
    if (this.isWord('USER') || this.isWord('ROLE')) {
      const verb = `DROP ${this.t.value}`;
      while (this.t.kind !== 'end') this.i++;
      return { type: 'dcl', verb };
    }
    this.expectWord('TABLE');
    const name = this.name();
    let cascade = false;
    if (this.acceptWord('CASCADE')) {
      this.expectWord('CONSTRAINTS');
      cascade = true;
    }
    this.acceptWord('PURGE');
    return { type: 'dropTable', name, cascade };
  }

  private alter(): Statement {
    this.i++;
    this.expectWord('TABLE');
    const name = this.name();
    if (this.acceptWord('ADD')) {
      if (this.isWord('CONSTRAINT') || this.isWord('PRIMARY') || this.isWord('UNIQUE') || this.isWord('CHECK') || this.isWord('FOREIGN')) {
        return { type: 'alter', name, action: { kind: 'addConstraint', constraint: this.tableConstraint() } };
      }
      const columns: ColumnDef[] = [];
      if (this.acceptOp('(')) {
        do columns.push(this.columnDef());
        while (this.acceptOp(','));
        this.expectOp(')');
      } else columns.push(this.columnDef());
      return { type: 'alter', name, action: { kind: 'add', columns } };
    }
    if (this.acceptWord('MODIFY')) {
      const one = () => {
        const n = this.name();
        const out: { name: string; spec?: string; nullable?: boolean; default?: Expr } = { name: n };
        if (this.t.kind === 'word' && TYPE_WORDS.has(this.t.value)) out.spec = this.dataType();
        if (this.acceptWord('DEFAULT')) out.default = this.expr();
        if (this.acceptWord('NOT')) {
          this.expectWord('NULL');
          out.nullable = false;
        } else if (this.acceptWord('NULL')) out.nullable = true;
        return out;
      };
      const columns = [];
      if (this.acceptOp('(')) {
        do columns.push(one());
        while (this.acceptOp(','));
        this.expectOp(')');
      } else columns.push(one());
      return { type: 'alter', name, action: { kind: 'modify', columns } };
    }
    if (this.acceptWord('DROP')) {
      if (this.acceptWord('COLUMN')) return { type: 'alter', name, action: { kind: 'dropColumn', columns: [this.name()] } };
      if (this.isOp('(')) return { type: 'alter', name, action: { kind: 'dropColumn', columns: this.nameList() } };
      if (this.acceptWord('CONSTRAINT')) return { type: 'alter', name, action: { kind: 'dropConstraint', name: this.name() } };
      if (this.acceptWord('PRIMARY')) {
        this.expectWord('KEY');
        return { type: 'alter', name, action: { kind: 'dropPrimaryKey' } };
      }
      throw new OraError('ORA-00905', 'missing keyword');
    }
    if (this.acceptWord('RENAME')) {
      if (this.acceptWord('COLUMN')) {
        const from = this.name();
        this.expectWord('TO');
        return { type: 'alter', name, action: { kind: 'renameColumn', from, to: this.name() } };
      }
      this.expectWord('TO');
      return { type: 'rename', from: name, to: this.name() };
    }
    throw new OraError('ORA-01735', 'invalid ALTER TABLE option');
  }
}

export function parseStatement(src: string): Statement {
  return new StatementParser(src).parseStatement();
}
