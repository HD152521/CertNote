/**
 * SQL 실습 엔진(src/lib/sql-lab)이 만드는 한국어 안내문의 영어 대응.
 * 영어 화면에서만 쓴다. 엔진 문구가 바뀌면 여기 패턴도 같이 고친다(engineMessagesEn.test.ts 가 원문 표본으로 확인).
 * 패턴에 걸리지 않는 한글 문구는 호출한 쪽이 일반 안내로 대체한다.
 */
type Rule = readonly [RegExp, (m: RegExpMatchArray) => string];

const SLOW =
  'Execution stopped because it ran past 3 seconds. Check whether a subquery or an ON condition is being re-evaluated for every row of a large table or join.';
const TOO_BIG =
  'Execution stopped because the amount of computation is too large. Check whether a correlated subquery is being re-run for every row of a large join.';

const RULES: readonly Rule[] = [
  [/^실행이 3초를 넘어서 멈췄어요\..*MERGE.*취소됐어요/, () => `${SLOW} (This statement was cancelled.)`],
  [/^실행이 3초를 넘어서 멈췄어요/, () => SLOW],
  [/^계산량이 너무 커서 실행을 멈췄어요/, () => TOO_BIG],
  [
    /^계산량\(묶음 (\d+)개 × ([\d,]+)행\)이 너무 커서 실행하지 않았어요/,
    (m) =>
      `Not executed: the amount of computation (${m[1]} grouping sets × ${m[2]} rows) is too large. Reduce the joins or the arguments of ROLLUP/CUBE.`,
  ],
  [
    /^묶음\(소계 단위\)이 ([\d,]+)개를 넘어서 실행하지 않았어요/,
    (m) =>
      `Not executed: there are more than ${m[1]} grouping sets. CUBE with n arguments produces 2^n sets. Use fewer arguments.`,
  ],
  [
    /^(\S+) 는 휴지통\(RECYCLEBIN\)이 있는 실제 Oracle/,
    (m) =>
      `${m[1]} only works on a real Oracle database that has a recycle bin. The practice lab does not keep dropped tables in a recycle bin, so it does not simulate FLASHBACK TABLE … TO BEFORE DROP.`,
  ],
  [
    /^(\S+) 는 사용자·권한이 여럿인 실제 DB/,
    (m) =>
      `${m[1]} only makes sense on a real database with several users and privileges. The practice lab has a single user, so it only checks the syntax and does not execute it.`,
  ],
  [
    /^뷰를 통한 INSERT·UPDATE·DELETE/,
    () => 'INSERT, UPDATE and DELETE through a view are not supported in the practice lab yet. Run them directly on the base table.',
  ],
  [
    /^(\S+) 문은 실습장 3단계\(DML·TCL·DDL\)에서 열려요/,
    (m) => `${m[1]} statements are not available at this stage of the practice lab. For now only SELECT can be executed.`,
  ],
  [/^PIVOT XML 은/, () => 'PIVOT XML is not supported in the practice lab.'],
  [
    /^PIVOT 의 IN 에 서브쿼리·ANY/,
    () => 'A subquery or ANY in the IN list of PIVOT only works with PIVOT XML, which the practice lab does not support.',
  ],
  [/^여러 열을 한 번에 UNPIVOT/, () => 'UNPIVOT on several columns at once is not supported in the practice lab yet.'],
  [
    /^GROUP_ID 는/,
    () => 'GROUP_ID is not supported in the practice lab yet. Use GROUPING or GROUPING_ID to tell subtotal rows apart.',
  ],
  [
    /^WITHIN GROUP·KEEP 은/,
    () =>
      'In the practice lab, WITHIN GROUP and KEEP are supported only for the hypothetical-rank forms of RANK, DENSE_RANK, PERCENT_RANK and CUME_DIST.',
  ],
  [
    /^자기 자신을 부르는 재귀 WITH/,
    () => 'Recursive WITH (a query that refers to itself) is not supported in the practice lab yet. Use CONNECT BY for hierarchies.',
  ],
  [
    /^TIMESTAMP 형은/,
    () => 'The TIMESTAMP type is not supported in the practice lab yet. Use SYSDATE instead.',
  ],
  [
    /^조건이 와야 할 자리에 값이 왔어요/,
    () => 'A value appeared where a condition is expected. Add a comparison (=, >, IN, etc.) to make it a condition.',
  ],
  [
    /^조건식\(비교·AND·OR\)을 SELECT 의 값으로/,
    () => 'Using a condition (comparison, AND, OR) as a value in SELECT is not supported in the practice lab. Rewrite it with CASE WHEN.',
  ],
  [/^(\S+) 는 아직 실습장에서 지원하지 않아요\.$/, (m) => `${m[1]} is not supported in the practice lab yet.`],
  [
    /^반복 안에 또 반복이 있는 정규식/,
    () =>
      'Regular expressions with a repeat inside a repeat, such as (A+)+, can take a very long time in the browser, so the practice lab does not run them. Reduce them to a single repeat.',
  ],
  [/^(.+) 로의 CAST 는 실습장에서 아직 지원하지 않아요/, (m) => `CAST to ${m[1]} is not supported in the practice lab yet.`],
  [/^REVERSE 는 Oracle 에 문서화되지 않은 함수/, () => 'REVERSE is an undocumented Oracle function, so it is not included in the practice lab.'],
  [
    /^LPAD·RPAD 의 길이는/,
    () => 'The practice lab accepts LPAD and RPAD lengths only up to 4000 (the VARCHAR2 limit).',
  ],
  [
    /^계층이 ([\d,]+)행을 넘어서 멈췄어요/,
    (m) => `The hierarchy exceeded ${m[1]} rows, so execution stopped. Put a LEVEL limit on CONNECT BY or check the condition.`,
  ],
  [
    /^계층이 너무 깊어서/,
    () => 'The hierarchy is too deep (thousands of levels) for the practice lab to expand. Lower the LEVEL limit.',
  ],
  [
    /^결과가 ([\d,]+)행을 넘어서 실행을 멈췄어요/,
    (m) => `The result exceeded ${m[1]} rows, so execution stopped. Check whether a join condition is missing (a Cartesian product).`,
  ],
  [
    /^실습장이 이 문장을 처리하지 못했어요/,
    () => 'The practice lab could not process this statement. Change it slightly and run it again.',
  ],
  [/^실습장이 실행하지 못한 문장이에요/, () => 'The practice lab could not run this statement.'],
];

/** 한국어 엔진 문구를 영어로 옮긴다. 대응이 없으면 undefined. */
export function translateEngineMessageEn(text: string): string | undefined {
  for (const [re, make] of RULES) {
    const m = text.match(re);
    if (m) return make(m);
  }
  return undefined;
}
