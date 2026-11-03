// 실습장 예제 테이블: 전통적인 SCOTT 스키마(EMP·DEPT·SALGRADE) + DUAL.
// scripts/sql-lab/schema.sql 과 같은 데이터다. 바꾸면 둘 다 바꾸고 골든을 다시 돌린다.
import type { Expr, Select } from './ast';
import { dateOf, type Value } from './values';

export type ColumnType = 'NUMBER' | 'VARCHAR2' | 'DATE';

export interface Column {
  name: string;
  type: ColumnType;
  /** 화면 설명용: NUMBER(7,2), VARCHAR2(10) */
  spec: string;
  nullable: boolean;
  /** CHAR(n) 는 VARCHAR2 로 다루되 오른쪽을 공백으로 채운다 */
  fixed?: boolean;
  /** VARCHAR2·CHAR 의 최대 길이 */
  length?: number;
  /** NUMBER(p, s) */
  precision?: number;
  scale?: number;
  /** DEFAULT 식 */
  default?: Expr;
  /** NOT NULL 을 명시한 열의 제약 조건 이름(기본 키 때문에 생긴 NOT NULL 은 여기 없다 — CTAS 는 이것만 복사한다) */
  notNullName?: string;
}

/** 제약 조건: P(기본 키) U(고유) C(CHECK) R(외래 키) */
export interface Constraint {
  name: string;
  kind: 'P' | 'U' | 'C' | 'R';
  columns: string[];
  check?: Expr;
  /** CHECK 조건의 원문(USER_CONSTRAINTS.SEARCH_CONDITION_VC) */
  checkText?: string;
  refTable?: string;
  refColumns?: string[];
  onDelete?: 'CASCADE' | 'SET NULL';
}

export interface Table {
  name: string;
  columns: Column[];
  rows: Value[][];
  /** 화면 설명 */
  note: string;
  constraints?: Constraint[];
  /** 뷰면 그 쿼리(행은 쓰지 않는다) */
  view?: Select;
}

/** 'NUMBER(7,2)'·'VARCHAR2(10)'·'CHAR(1)'·'DATE' → 열 정의 */
export function columnFromSpec(name: string, spec: string, nullable = true): Column {
  const up = spec.toUpperCase().replace(/\s+/g, '');
  const m = /^(\w+)(?:\((\d+)(?:,(-?\d+))?\))?$/.exec(up);
  const base = m?.[1] ?? up;
  const a = m?.[2] !== undefined ? Number(m[2]) : undefined;
  const b = m?.[3] !== undefined ? Number(m[3]) : undefined;
  if (base === 'NUMBER' || base === 'INTEGER' || base === 'INT') {
    return { name, type: 'NUMBER', spec, nullable, ...(a !== undefined ? { precision: a, scale: b ?? 0 } : base !== 'NUMBER' ? { precision: 38, scale: 0 } : {}) };
  }
  if (base === 'DATE') return { name, type: 'DATE', spec, nullable };
  return { name, type: 'VARCHAR2', spec, nullable, length: a ?? 1, ...(base === 'CHAR' ? { fixed: true } : {}) };
}

const col = (name: string, spec: string, nullable = true): Column => columnFromSpec(name, spec, nullable);

const d = (s: string) => {
  const [y, m, day] = s.split('-').map(Number);
  return dateOf(y, m, day);
};

export const DEPT: Table = {
  name: 'DEPT',
  note: '부서 4개. 40번 OPERATIONS 에는 사원이 없다.',
  columns: [col('DEPTNO', 'NUMBER(2)'), col('DNAME', 'VARCHAR2(14)'), col('LOC', 'VARCHAR2(13)')],
  rows: [
    [10, 'ACCOUNTING', 'NEW YORK'],
    [20, 'RESEARCH', 'DALLAS'],
    [30, 'SALES', 'CHICAGO'],
    [40, 'OPERATIONS', 'BOSTON'],
  ],
};

export const EMP: Table = {
  name: 'EMP',
  note: '사원 14명. KING 은 관리자(MGR)가 없고, COMM 은 영업직만 있다(TURNER 는 0).',
  columns: [
    col('EMPNO', 'NUMBER(4)'),
    col('ENAME', 'VARCHAR2(10)'),
    col('JOB', 'VARCHAR2(9)'),
    col('MGR', 'NUMBER(4)'),
    col('HIREDATE', 'DATE'),
    col('SAL', 'NUMBER(7,2)'),
    col('COMM', 'NUMBER(7,2)'),
    col('DEPTNO', 'NUMBER(2)'),
  ],
  rows: [
    [7369, 'SMITH', 'CLERK', 7902, d('1980-12-17'), 800, null, 20],
    [7499, 'ALLEN', 'SALESMAN', 7698, d('1981-02-20'), 1600, 300, 30],
    [7521, 'WARD', 'SALESMAN', 7698, d('1981-02-22'), 1250, 500, 30],
    [7566, 'JONES', 'MANAGER', 7839, d('1981-04-02'), 2975, null, 20],
    [7654, 'MARTIN', 'SALESMAN', 7698, d('1981-09-28'), 1250, 1400, 30],
    [7698, 'BLAKE', 'MANAGER', 7839, d('1981-05-01'), 2850, null, 30],
    [7782, 'CLARK', 'MANAGER', 7839, d('1981-06-09'), 2450, null, 10],
    [7788, 'SCOTT', 'ANALYST', 7566, d('1987-04-19'), 3000, null, 20],
    [7839, 'KING', 'PRESIDENT', null, d('1981-11-17'), 5000, null, 10],
    [7844, 'TURNER', 'SALESMAN', 7698, d('1981-09-08'), 1500, 0, 30],
    [7876, 'ADAMS', 'CLERK', 7788, d('1987-05-23'), 1100, null, 20],
    [7900, 'JAMES', 'CLERK', 7698, d('1981-12-03'), 950, null, 30],
    [7902, 'FORD', 'ANALYST', 7566, d('1981-12-03'), 3000, null, 20],
    [7934, 'MILLER', 'CLERK', 7782, d('1982-01-23'), 1300, null, 10],
  ],
};

export const SALGRADE: Table = {
  name: 'SALGRADE',
  note: '급여 등급 5단계. EMP.SAL 이 LOSAL~HISAL 사이면 그 등급이다(Non-EQUI 조인 예제).',
  columns: [col('GRADE', 'NUMBER'), col('LOSAL', 'NUMBER'), col('HISAL', 'NUMBER')],
  rows: [
    [1, 700, 1200],
    [2, 1201, 1400],
    [3, 1401, 2000],
    [4, 2001, 3000],
    [5, 3001, 9999],
  ],
};

export const DUAL: Table = {
  name: 'DUAL',
  note: '한 행짜리 가상 테이블. 함수 결과만 볼 때 쓴다.',
  columns: [col('DUMMY', 'VARCHAR2(1)')],
  rows: [['X']],
};

export type Database = Record<string, Table>;

DEPT.constraints = [{ name: 'PK_DEPT', kind: 'P', columns: ['DEPTNO'] }];
EMP.constraints = [
  { name: 'PK_EMP', kind: 'P', columns: ['EMPNO'] },
  { name: 'FK_DEPTNO', kind: 'R', columns: ['DEPTNO'], refTable: 'DEPT', refColumns: ['DEPTNO'] },
];

/** 표 하나를 깊게 복사한다(실행마다 새 데이터에서 시작하고, ROLLBACK 이 이전 상태로 돌아갈 수 있게). */
export function cloneTable(t: Table): Table {
  return {
    ...t,
    columns: t.columns.map((c) => ({ ...c })),
    rows: t.rows.map((r) => [...r]),
    ...(t.constraints ? { constraints: t.constraints.map((c) => ({ ...c, columns: [...c.columns] })) } : {}),
  };
}

export function cloneDatabase(db: Database): Database {
  return Object.fromEntries(Object.entries(db).map(([k, t]) => [k, cloneTable(t)]));
}

/** 실습장의 처음 상태. 실행할 때마다 새로 복사하므로 INSERT·DELETE 를 해도 다음 실행에는 원래 데이터로 돌아온다. */
export function sampleDatabase(): Database {
  return cloneDatabase({ EMP, DEPT, SALGRADE, DUAL });
}

/** 화면의 스키마 안내에 보여 줄 순서 */
export const VISIBLE_TABLES = ['EMP', 'DEPT', 'SALGRADE'] as const;
