// 실습장 예제 테이블: 전통적인 SCOTT 스키마(EMP·DEPT·SALGRADE) + DUAL.
// scripts/sql-lab/schema.sql 과 같은 데이터다. 바꾸면 둘 다 바꾸고 골든을 다시 돌린다.
import { dateOf, type Value } from './values';

export type ColumnType = 'NUMBER' | 'VARCHAR2' | 'DATE';

export interface Column {
  name: string;
  type: ColumnType;
  /** 화면 설명용: NUMBER(7,2), VARCHAR2(10) */
  spec: string;
  nullable: boolean;
}

export interface Table {
  name: string;
  columns: Column[];
  rows: Value[][];
  /** 화면 설명 */
  note: string;
}

const col = (name: string, spec: string, nullable = true): Column => ({
  name,
  type: spec.startsWith('NUMBER') ? 'NUMBER' : spec.startsWith('DATE') ? 'DATE' : 'VARCHAR2',
  spec,
  nullable,
});

const d = (s: string) => {
  const [y, m, day] = s.split('-').map(Number);
  return dateOf(y, m, day);
};

export const DEPT: Table = {
  name: 'DEPT',
  note: '부서 4개. 40번 OPERATIONS 에는 사원이 없다.',
  columns: [col('DEPTNO', 'NUMBER(2)', false), col('DNAME', 'VARCHAR2(14)'), col('LOC', 'VARCHAR2(13)')],
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
    col('EMPNO', 'NUMBER(4)', false),
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

export function sampleDatabase(): Database {
  return { EMP, DEPT, SALGRADE, DUAL };
}

/** 화면의 스키마 안내에 보여 줄 순서 */
export const VISIBLE_TABLES = ['EMP', 'DEPT', 'SALGRADE'] as const;
