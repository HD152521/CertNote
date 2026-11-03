# SQL 실습장 — Oracle 과의 알려진 차이 (밀린 일)

주차 검토(`.claude/agents/sqld-week-reviewer.md`)에서 "고치면 좋은 것" 으로 나온 차이를 모은다. 모두 희귀 문법이거나 main 부터 있던 것이라 주차 배포를 막지 않는다. 고치면 `scripts/sql-lab/cases.mjs` 에 골든 사례를 더하고 이 목록에서 지운다.

## W5 검토(2026-11-03)에서 나온 것

- 한 단계 더 감싼 ANSI 조인 뷰(`SELECT * FROM (SELECT * FROM (SELECT * FROM EMP E JOIN DEPT D ON …))`)는 Oracle 이 행을 내는데 엔진은 ORA-00918. 숨긴 열 표시가 바깥 뷰로 전해지지 않는다. USING 조인의 키가 아닌 같은 이름 열, ANSI 조인 별표 뷰 둘의 UNION ALL 도 같다.
- 숨긴 열의 제목: Oracle 은 `QCSJ_C000000000300000` 같은 내부 이름을, 엔진은 원래 이름(DEPTNO)을 보인다.
- 뷰에서 쓰지 않는 열은 Oracle 이 계산하지 않는다(`SELECT COUNT(*) FROM (SELECT 1/0 X FROM DUAL)` → 1). 엔진은 ORA-01476.
- EXISTS 서브쿼리의 SELECT 목록 오류(ORA-00979·00918)를 Oracle 은 내지 않는다.
- `FROM EMP E, DEPT E` 를 Oracle 은 받아 준다(엔진 ORA-00918). `E.*` 와 NATURAL·USING 조인 → Oracle ORA-25155/25154. `SELECT *, 1` → Oracle ORA-00923.
- `DISTINCT * … ORDER BY 식`, `DISTINCT JOB … ORDER BY LOWER(JOB)` 를 23ai 는 받아 주는데 엔진은 ORA-01791(시험 기준 버전의 동작은 따로 확인할 것).
- CASE 안 스칼라 서브쿼리의 형 불일치 ORA-00932 를 엔진이 내지 않는다.
- 집계 없는 `HAVING 1 = 1` 이 빈 입력에서 1행(Oracle 0행).
- `ORDER BY SUM(별칭)` → Oracle ORA-00935(엔진 00934). 그룹 쿼리의 상관 서브쿼리 안 `X.SAL > AVG(E.SAL)` → Oracle ORA-00936(엔진 00934).
- `ORDER BY 1 OFFSET (SELECT 1 FROM DUAL) ROWS` 를 엔진이 파싱하지 못한다(ORA-00936).
- 이름 없는 인라인 뷰 두 개의 `SELECT *` → Oracle 은 결과, 엔진 ORA-00918.
- `ORDER BY E.ENAME` 이 없는 열일 때 문구: Oracle `"E"."ENAME"`, 엔진 `"ENAME"`.
- ORA-01722 메시지의 `%s` 자리(23ai 는 두 줄 문구를 낸다).
- 재귀 WITH(열 목록이 있는 자기 참조)는 안내만 낸다.

## W5 7차 검토(PASS)에서 더 나온 것

- 쓰지 않는 WITH 안의 ORA-00938·00939·00978 을 엔진은 내지만 Oracle 23ai 는 내지 않는다(00909 는 둘 다 낸다). exec.ts NAME_ERRORS 에서 셋을 빼면 된다.
- `GREATEST()` 인자 없음: Oracle ORA-00938, 엔진은 NULL 1행.
- `GROUPING_ID()` 인자 없음: Oracle ORA-00909, 엔진은 결과를 낸다.
- `1 IN (SELECT ENAME, COUNT(*) FROM EMP)`: Oracle 은 00913 을 먼저, 엔진은 00937.
- CUBE 7개(128 묶음) + SELECT 목록 오류: Oracle ORA-00979, 엔진은 묶음 상한 안내.
- 큰 교차 조인 위 상관 서브쿼리: 3초 상한 안내로 멈춘다(의도된 동작이지만, 계산을 줄이는 방법이 있으면 결과를 낼 수 있다).

## W6 1차 검토에서 나온 것

윈도우 함수
- `ROWS UNBOUNDED FOLLOWING`·`ROWS 1 FOLLOWING` 단축형: Oracle ORA-02000, 엔진은 결과.
- `LAG(SAL, -1)` → Oracle ORA-01428, `LAG(SAL, 1, 'X')` → ORA-01722, `NTILE(0)` → ORA-01428(엔진 30489), `ROWS -1 PRECEDING` → ORA-01428(엔진 00936).
- `ROWS 1.5 PRECEDING` 을 Oracle 은 실행한다(엔진 안내).
- 문자열 키 `RANGE n`: Oracle ORA-00902(엔진 01722).
- `COUNT(DISTINCT JOB) OVER (ORDER BY …)`: Oracle ORA-30487, 엔진은 결과.
- `SUM(RANK() OVER …)`: Oracle ORA-30483, 엔진 14. `HAVING SUM(SAL) > AVG(SUM(SAL)) OVER ()`: Oracle ORA-00935(엔진 30483).
- `UPPER(…) OVER`·`NVL(…) OVER`: Oracle ORA-00923.
- `MEDIAN OVER` 를 Oracle 은 계산한다(엔진 30484). `LAST_VALUE(… IGNORE NULLS)` 는 안내로 바꾸는 편이 낫다(지금 ORA-00907).
- `RANK() WITHIN GROUP`(인자 없음)·`ROW_NUMBER(1) WITHIN GROUP` 오류 번호.
- 동점 행의 순서가 Oracle 과 반대로 나오는 경우(FORD·SCOTT, MARTIN·WARD). Oracle 도 보장하지 않는 순서라 결과 자체는 틀리지 않다.

계층형 질의·Top N
- NOCYCLE 없는 `CONNECT_BY_ISCYCLE`: Oracle ORA-30930, 엔진 0.
- `ORDER SIBLINGS BY 1`(위치)·별칭: 엔진이 위치로 보지 않고 별칭은 ORA-00904.
- `CONNECT BY ROWNUM <= 4` 는 안내만. `PRIOR PRIOR`·START WITH 안의 PRIOR 는 Oracle 오류.
- `CONNECT PRIOR …`(BY 빠짐): Oracle ORA-00924(엔진 00905).
- `CONNECT BY LEVEL <= 6000` 이상: 재귀가 깊어 처리하지 못한다는 안내.
- 큰 교차 조인 위의 계층형 질의(EMP A, EMP B …): 3초 상한 안내로 멈춘다(자식 찾기를 색인으로 바꾸면 결과를 낼 수 있다).
- 집합 연산 뒤 `FETCH … WITH TIES` 가 무시된다(`UNION ALL … ORDER BY 1 FETCH FIRST 2 ROWS WITH TIES`: 엔진 2행, Oracle 4행).

## W6 2차 검토에서 나온 것

- 집합 연산 뒤의 `FETCH … WITH TIES`(위 항목과 같음).
- 가짜 성공: `SUM(RANK() OVER (…))`(ORA-30483), `COUNT(DISTINCT JOB) OVER (ORDER BY SAL)`(ORA-30487), NOCYCLE 없는 `CONNECT_BY_ISCYCLE`(ORA-30930), `START WITH PRIOR …`(ORA-00976).
- `ORDER SIBLINGS BY 1`·별칭.
- 프레임 오프셋에 식(`RANGE BETWEEN 100+100 PRECEDING …`): Oracle 은 실행, 엔진 ORA-00905.
- `RANGE -100 PRECEDING`: Oracle ORA-01428, 엔진 ORA-00936(ROWS 와 같은 항목).
- `SUM(DISTINCT SAL) OVER (ORDER BY …)`·`AVG(DISTINCT …) OVER (ORDER BY …)`: Oracle ORA-30487, 엔진은 결과(COUNT DISTINCT 와 같은 항목).
- `ROWS 99999999999999999999 PRECEDING`: Oracle 은 NULL, 엔진은 합계.

## W7 3차 검토에서 미룬 것(막지 않음)
- RENAME COLUMN: CHECK 를 다시 만들지 정규식으로 판단해 문자열 리터럴 속 같은 글자에도 걸린다(`CHECK (LOT > 0 AND S <> 'LO')` 에서 LO→LOW). 바꾸기 전 `k.check` 식에 해당 열 노드가 있는지로 판단할 것.
- 문자 리터럴끼리 비교에 공백 채움이 없다: `WHERE 'A ' = 'A'` Oracle 1, 엔진 0(main 부터).
- NUMBER(p,s) 에서 s>p 또는 s<0: `CAST(0.01 AS NUMBER(2,3))` Oracle .01 / 엔진 01438, `CAST(1234.5 AS NUMBER(6,-2))` Oracle 1200 / 엔진 00907.
- `CAST(HIREDATE AS VARCHAR2(5))`: Oracle ORA-01801, 엔진 ORA-25137.
- USER_CONSTRAINTS 에 `SEARCH_CONDITION` 열이 없다(_VC 만 있음).
- `PIVOT … IN (10, 10)`: Oracle ORA-56907, 엔진 ORA-00918 이고 메시지에 빈칸이 남는다.
- `REGEXP_SUBSTR('x','x',0)`: Oracle ORA-01428, 엔진은 'x'.
- ORA-01722 메시지에 `%s` 가 그대로 보인다(values.ts, main 부터).
