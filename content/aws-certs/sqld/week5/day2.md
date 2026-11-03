# Day 2 - 상관 서브쿼리·스칼라 서브쿼리·인라인 뷰

## 📌 핵심 정리

- **비상관 서브쿼리**는 메인쿼리와 무관하게 한 번 실행된 값을 넘긴다. **상관 서브쿼리**는 메인쿼리의 열을 참조해 바깥 행마다 다시 평가된다.
- **스칼라 서브쿼리**는 SELECT 절 등에서 값 하나를 대신한다. 한 행 한 열이어야 하고, 행이 없으면 NULL, 2행 이상이면 ORA-01427 이다.
- **인라인 뷰**는 FROM 절의 서브쿼리다. 바깥에서는 인라인 뷰가 SELECT 한 열(별칭 포함)만 보인다.
- **뷰**는 SELECT 문에 이름을 붙여 저장한 가상 테이블이다. 데이터를 따로 저장하지 않고, 장점은 독립성·편리성·보안성이다.
- `WITH 이름 AS (서브쿼리)`는 인라인 뷰에 이름을 붙여 문장 앞에 꺼내 두는 표기다.

## 비상관과 상관 — 바깥 열을 보느냐

어제의 서브쿼리는 대부분 바깥과 상관없이 혼자 실행할 수 있었다. `(SELECT AVG(SAL) FROM EMP)`는 떼어 내 돌려도 2073.21… 이 나온다. 이런 서브쿼리가 **비상관(Non-Correlated) 서브쿼리**다.

"자기 부서 평균보다 급여가 많은 사원"은 다르다. 평균을 구할 부서가 바깥 행마다 바뀐다.

```sql
SELECT E.ENAME, E.DEPTNO, E.SAL FROM EMP E WHERE E.SAL > (SELECT AVG(S.SAL) FROM EMP S WHERE S.DEPTNO = E.DEPTNO) ORDER BY E.DEPTNO, E.ENAME;
```

```text
ENAME          DEPTNO        SAL
---------- ---------- ----------
KING               10       5000
FORD               20       3000
JONES              20       2975
SCOTT              20       3000
ALLEN              30       1600
BLAKE              30       2850
```

- 서브쿼리 안의 `E.DEPTNO`가 메인쿼리의 열이다. 이 참조가 있으면 **상관(Correlated) 서브쿼리**다.
- 부서별 평균은 10번 2916.67, 20번 2175, 30번 1566.67 이다. KING 은 10번 평균, ALLEN 은 30번 평균과 비교된다.
- 서브쿼리만 떼어 내면 `E.DEPTNO`가 무엇인지 몰라 실행할 수 없다.

### 실행 방식 차이

| 구분 | 비상관 서브쿼리 | 상관 서브쿼리 |
|------|---------------|-------------|
| 바깥 열 참조 | 없다 | 있다 |
| 실행 횟수(개념상) | 한 번. 결과를 메인쿼리에 넘긴다 | 메인쿼리 행마다 다시 평가한다 |
| 실행 순서 | 서브쿼리 → 메인쿼리 | 메인쿼리 행을 읽고 → 그 값으로 서브쿼리 |
| 혼자 실행 | 된다 | 안 된다 |

- 위 표는 논리적 동작이다. 실제로는 옵티마이저가 상관 서브쿼리를 조인으로 바꾸거나 같은 값의 결과를 재사용할 수 있다.
- 참조 방향은 한쪽뿐이다. 서브쿼리는 메인쿼리 열을 볼 수 있지만, 메인쿼리는 서브쿼리 안의 열을 볼 수 없다.

같은 틀로 "자기 부서 최고 급여자"도 구한다. 어제의 다중 컬럼 서브쿼리 `(DEPTNO, SAL) IN (...)`과 같은 결과다.

```sql
SELECT E.ENAME, E.SAL FROM EMP E WHERE E.SAL = (SELECT MAX(SAL) FROM EMP S WHERE S.DEPTNO = E.DEPTNO) ORDER BY E.ENAME;
```

```text
ENAME             SAL
---------- ----------
BLAKE            2850
FORD             3000
KING             5000
SCOTT            3000
```

- 바깥 행마다 서브쿼리는 값 하나(그 부서의 MAX)만 돌려준다. 그래서 단일행 연산자 `=`를 써도 ORA-01427 이 나지 않는다.

EXISTS 는 거의 언제나 상관 서브쿼리로 쓴다. 부하가 한 명이라도 있는 사원, 즉 관리자 수다.

```sql
SELECT COUNT(*) FROM EMP E WHERE EXISTS (SELECT 1 FROM EMP M WHERE M.MGR = E.EMPNO);
```

```text
  COUNT(*)
----------
         6
```

## 스칼라 서브쿼리 — 값 하나 자리

**스칼라 서브쿼리**는 값 하나가 올 자리에 들어가는 서브쿼리다. 주로 SELECT 절에 쓰며, 결과가 **한 행 한 열**이어야 한다. 부서별 인원을 DEPT 기준으로 붙인다.

```sql
SELECT D.DNAME, (SELECT COUNT(*) FROM EMP E WHERE E.DEPTNO = D.DEPTNO) AS CNT FROM DEPT D ORDER BY D.DEPTNO;
```

```text
DNAME                 CNT
-------------- ----------
ACCOUNTING              3
RESEARCH                5
SALES                   6
OPERATIONS              0
```

- DEPT 4행마다 서브쿼리가 한 번씩 평가된다. 바깥 열 `D.DEPTNO`를 쓰므로 상관 서브쿼리이기도 하다.
- OPERATIONS 는 사원이 없지만 `COUNT(*)`가 0 을 돌려준다. 결과 행은 DEPT 기준 4행 그대로다.

조인 대신 코드값의 이름을 가져올 때도 쓴다.

```sql
SELECT E.ENAME, (SELECT D.DNAME FROM DEPT D WHERE D.DEPTNO = E.DEPTNO) AS DNAME FROM EMP E WHERE E.JOB = 'MANAGER' ORDER BY E.ENAME;
```

```text
ENAME      DNAME
---------- --------------
BLAKE      SALES
CLARK      ACCOUNTING
JONES      RESEARCH
```

### 한 행 한 열을 어기면

| 서브쿼리 결과 | 스칼라 서브쿼리의 값 |
|-------------|------------------|
| 1행 1열 | 그 값 |
| 0행 | NULL (오류 아님) |
| 2행 이상 | ORA-01427 |
| 2열 이상 | ORA-00913 |

0행이면 NULL 이 된다. 부서마다 PRESIDENT 를 찾으면 10번 말고는 찾을 행이 없다.

```sql
SELECT D.DNAME, (SELECT E.ENAME FROM EMP E WHERE E.DEPTNO = D.DEPTNO AND E.JOB = 'PRESIDENT') AS PRES FROM DEPT D ORDER BY D.DEPTNO;
```

```text
DNAME          PRES
-------------- ----------
ACCOUNTING     KING
RESEARCH
SALES
OPERATIONS
```

- 서브쿼리가 0행인 세 부서는 오류 없이 NULL 이다. 바깥 DEPT 4행은 그대로 남는다. INNER JOIN 이었다면 짝이 없는 부서는 빠진다.
- `MAX`처럼 집계를 쓰면 빈 집합에서도 1행(값 NULL)이 나온다. 결과는 같은 NULL 이지만, `COUNT`는 0 을 돌려준다는 점이 다르다(W4 Day 1).

한 부서에 사원이 여럿이면 ENAME 을 하나로 고를 수 없다.

```sql
SELECT D.DNAME, (SELECT ENAME FROM EMP E WHERE E.DEPTNO = D.DEPTNO) AS ENAME FROM DEPT D;
```

```text
SELECT D.DNAME, (SELECT ENAME FROM EMP E WHERE E.DEPTNO = D.DEPTNO) AS ENAME FROM DEPT D
                 *
ERROR at line 1:
ORA-01427: single-row subquery returns more than one row
```

열을 둘 돌려줘도 값 하나 자리에 넣을 수 없다. 급여 5000 이상은 KING 한 명이라 행은 1행이지만 열이 2개다.

```sql
SELECT D.DNAME, (SELECT ENAME, SAL FROM EMP E WHERE E.DEPTNO = D.DEPTNO AND E.SAL >= 5000) AS X FROM DEPT D;
```

```text
SELECT D.DNAME, (SELECT ENAME, SAL FROM EMP E WHERE E.DEPTNO = D.DEPTNO AND E.SAL >= 5000) AS X FROM DEPT D
                 *
ERROR at line 1:
ORA-00913: too many values
```

> ⚠️ **함정**: 스칼라 서브쿼리 결과가 0행이면 오류가 아니라 **NULL** 이다. 오류는 2행 이상(ORA-01427)이거나 2열 이상(ORA-00913)일 때만 난다.

## 인라인 뷰 — FROM 절의 서브쿼리

FROM 절에 넣은 서브쿼리를 **인라인 뷰(Inline View)** 라 부른다. 실행 결과가 그 자리에서 임시 테이블처럼 쓰인다. 부서별 평균을 인라인 뷰로 만들고 EMP 와 조인한다.

```sql
SELECT E.ENAME, E.SAL, A.AVG_SAL FROM EMP E, (SELECT DEPTNO, ROUND(AVG(SAL)) AS AVG_SAL FROM EMP GROUP BY DEPTNO) A WHERE E.DEPTNO = A.DEPTNO AND E.SAL > A.AVG_SAL ORDER BY E.ENAME;
```

```text
ENAME             SAL    AVG_SAL
---------- ---------- ----------
ALLEN            1600       1567
BLAKE            2850       1567
FORD             3000       2175
JONES            2975       2175
KING             5000       2917
SCOTT            3000       2175
```

- 위의 상관 서브쿼리와 같은 6명이다. 차이는 부서 평균 `AVG_SAL`을 **결과 열로 보여 줄 수 있다**는 점이다. WHERE 절 서브쿼리의 값은 SELECT 에 꺼낼 수 없다.
- 인라인 뷰 `A`는 3행(부서 수)짜리 표이고, EMP 14행과 DEPTNO 로 조인된다.

### 바깥에서 보이는 것은 인라인 뷰의 SELECT 목록뿐

인라인 뷰 밖에서는 안쪽 SELECT 가 내놓은 열 이름으로만 참조한다. 식에 별칭을 붙이면 그 별칭이 열 이름이 된다.

```sql
SELECT DEPTNO, AVG_SAL FROM (SELECT DEPTNO, ROUND(AVG(SAL)) AS AVG_SAL FROM EMP GROUP BY DEPTNO) WHERE AVG_SAL > 2000 ORDER BY DEPTNO;
```

```text
    DEPTNO    AVG_SAL
---------- ----------
        10       2917
        20       2175
```

안쪽에서 SELECT 하지 않은 열은 바깥에서 보이지 않는다.

```sql
SELECT X.ENAME FROM (SELECT ENAME FROM EMP WHERE DEPTNO = 10) X WHERE X.SAL > 1000;
```

```text
SELECT X.ENAME FROM (SELECT ENAME FROM EMP WHERE DEPTNO = 10) X WHERE X.SAL > 1000
                                                                      *
ERROR at line 1:
ORA-00904: "X"."SAL": invalid identifier
```

- 인라인 뷰 X 의 열은 ENAME 하나다. 원래 EMP 에 SAL 이 있어도 X 에는 없다.

인라인 뷰는 SELECT 별칭을 WHERE 에서 쓰고 싶을 때도 쓴다. 같은 쿼리 수준의 WHERE 는 SELECT 보다 먼저 처리되어 별칭을 모른다.

```sql
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL >= 36000;
```

```text
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL >= 36000
                                                *
ERROR at line 1:
ORA-00904: "ANNUAL": invalid identifier
```

```sql
SELECT ENAME, ANNUAL FROM (SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP) WHERE ANNUAL >= 36000 ORDER BY ANNUAL DESC, ENAME;
```

```text
ENAME          ANNUAL
---------- ----------
KING            60000
FORD            36000
SCOTT           36000
```

- 인라인 뷰 안에서 별칭이 만들어지고, 바깥 WHERE 는 그 결과를 받으므로 `ANNUAL`이 보인다.
- 인라인 뷰 자체에도 별칭(`X`, `A`)을 붙일 수 있다. Oracle 에서 테이블 별칭 앞에는 `AS`를 쓰지 않는다.

## 뷰(VIEW)

인라인 뷰는 그 문장 안에서만 쓰인다. 같은 SELECT 를 여러 곳에서 쓰려면 이름을 붙여 데이터베이스에 저장한다. 이것이 **뷰**다.

```text
CREATE VIEW 뷰이름 AS
SELECT 문;

CREATE OR REPLACE VIEW V_EMP10 AS
SELECT EMPNO, ENAME, JOB FROM EMP WHERE DEPTNO = 10;

SELECT * FROM V_EMP10;      -- 테이블처럼 조회한다
DROP VIEW V_EMP10;          -- 뷰 정의만 지운다. EMP 데이터는 그대로다
```

- 뷰는 **SELECT 문만 저장**한다. 조회할 때마다 정의된 SELECT 가 기반 테이블에서 실행된다. 그래서 가상 테이블이라 부른다.
- 기반 테이블의 데이터가 바뀌면 뷰 조회 결과도 바로 바뀐다.
- `CREATE OR REPLACE`는 같은 이름의 뷰가 있으면 정의를 바꾼다. 뷰는 `ALTER VIEW`로 정의를 고치지 않는다.

| 장점 | 내용 | V_EMP10 의 경우 |
|------|------|---------------|
| 독립성 | 테이블 구조가 바뀌어도 뷰 정의만 고치면 뷰를 쓰는 쪽은 그대로 둘 수 있다 | EMP 열 이름이 바뀌어도 V_EMP10 정의만 수정 |
| 편리성 | 복잡한 조인·집계를 뷰 하나로 감춰 짧게 조회한다 | 조건을 매번 쓰지 않고 `SELECT * FROM V_EMP10` |
| 보안성 | 보여 줄 열·행만 담아 나머지를 숨긴다 | SAL·COMM 을 빼고 이 뷰에만 권한을 준다 |

- 단점도 있다. 뷰에는 인덱스를 만들 수 없고, 정의를 바꾸려면 다시 만들어야 한다. 조인·집계가 들어간 뷰는 INSERT·UPDATE·DELETE 에 제약이 있다.
- 결과를 실제로 저장하는 머티리얼라이즈드 뷰(Materialized View)는 별개의 객체다. 일반 뷰는 데이터를 저장하지 않는다.

## WITH 절 — 서브쿼리에 이름 붙이기

`WITH`는 인라인 뷰를 문장 앞으로 꺼내 이름을 붙인다. 위의 인라인 뷰 조인을 WITH 로 다시 쓴 것이다.

```sql
WITH DEPT_AVG AS (SELECT DEPTNO, ROUND(AVG(SAL)) AS AVG_SAL FROM EMP GROUP BY DEPTNO) SELECT E.ENAME, E.SAL, A.AVG_SAL FROM EMP E JOIN DEPT_AVG A ON E.DEPTNO = A.DEPTNO WHERE E.SAL > A.AVG_SAL ORDER BY E.ENAME;
```

```text
ENAME             SAL    AVG_SAL
---------- ---------- ----------
ALLEN            1600       1567
BLAKE            2850       1567
FORD             3000       2175
JONES            2975       2175
KING             5000       2917
SCOTT            3000       2175
```

- 결과는 인라인 뷰 버전과 같다. `DEPT_AVG`는 이 문장 안에서만 쓰이는 이름이다. 뷰처럼 저장되지 않는다.
- 같은 서브쿼리를 한 문장에서 여러 번 참조할 때 한 번만 정의하면 된다. 이런 이름 붙은 서브쿼리를 CTE(Common Table Expression)라고도 한다.

| 비교 | 인라인 뷰 | WITH 절 | 뷰 |
|------|---------|--------|----|
| 정의 위치 | FROM 절 안 | 문장 맨 앞 | 데이터베이스 객체 |
| 쓰이는 범위 | 그 자리 한 번 | 그 문장 안 | 지울 때까지 어디서나 |
| 저장 | 안 한다 | 안 한다 | 정의(SELECT 문)만 저장 |

> 내일은 두 SELECT 의 결과를 위아래로 합치거나 빼는 집합 연산자를 다룬다.

## 📖 용어

- **비상관 서브쿼리** : 메인쿼리 열을 참조하지 않아 혼자 실행할 수 있는 서브쿼리.
- **상관 서브쿼리** : 메인쿼리 열을 참조해 바깥 행마다 다시 평가되는 서브쿼리.
- **스칼라 서브쿼리** : 값 하나 자리에 쓰는 한 행 한 열 서브쿼리. 결과가 없으면 NULL 이다.
- **인라인 뷰** : FROM 절에 쓴 서브쿼리. 그 문장 안에서 임시 테이블처럼 쓰인다.
- **뷰(VIEW)** : SELECT 문에 이름을 붙여 저장한 가상 테이블. 데이터는 저장하지 않는다.
- **독립성·편리성·보안성** : 뷰의 세 가지 장점. 구조 변경 흡수, 복잡한 쿼리 단순화, 열·행 숨김.
- **WITH 절** : 서브쿼리에 이름을 붙여 문장 앞에 정의하는 표기. CTE 라고도 한다.
- **ORA-00904** : 그 자리에서 보이지 않는 열 이름이나 별칭을 썼을 때의 오류(invalid identifier).

## 📝 연습 문제

**문제 1.** 부서별 최고 급여는 10번 5000(KING), 20번 3000(FORD·SCOTT), 30번 2850(BLAKE)이다. 다음 SQL 의 결과 행 수는?

```sql
SELECT E.ENAME FROM EMP E WHERE E.SAL = (SELECT MAX(SAL) FROM EMP S WHERE S.DEPTNO = E.DEPTNO);
```

A) 1  
B) 4  
C) 3  
D) ORA-01427 오류가 난다  

**정답: B**  
해설: 서브쿼리가 메인쿼리의 `E.DEPTNO`를 참조하는 상관 서브쿼리다. 바깥 행마다 그 사원 부서의 최고 급여 하나를 돌려주므로 `=`를 써도 오류가 나지 않는다. 20번은 3000 이 두 명이라 KING·FORD·SCOTT·BLAKE 4행이다. 1 은 전체 최고 급여(KING)와 비교했을 때, 3 은 부서 수다.

---

**문제 2.** DEPT 는 4개 부서이고 10·20·30번 부서에는 사원이 여러 명 있다. 다음 SQL 을 Oracle 에서 실행한 결과로 알맞은 것은?

```sql
SELECT D.DNAME, (SELECT ENAME FROM EMP E WHERE E.DEPTNO = D.DEPTNO) FROM DEPT D;
```

A) 부서마다 첫 사원 이름이 붙어 4행이 나온다  
B) 사원마다 한 행씩 14행이 나온다  
C) ORA-00913 오류가 난다  
D) ORA-01427 오류가 난다  

**정답: D**  
해설: SELECT 절의 스칼라 서브쿼리는 한 행 한 열이어야 한다. 10번 부서에서 사원 3명의 이름이 나오므로 ORA-01427 이 난다. Oracle 이 첫 행을 골라 주지 않으며, 행을 늘려 14행으로 펼치지도 않는다. ORA-00913 은 열이 2개 이상일 때의 오류다.

---

**문제 3.** DEPT 40(OPERATIONS)에는 사원이 없다. 다음 SQL 의 결과에 대한 설명으로 알맞은 것은?

```sql
SELECT D.DNAME, (SELECT MAX(SAL) FROM EMP E WHERE E.DEPTNO = D.DEPTNO) AS MAX_SAL FROM DEPT D;
```

A) 4행이 나오고 OPERATIONS 의 MAX_SAL 은 NULL 이다  
B) 4행이 나오고 OPERATIONS 의 MAX_SAL 은 0 이다  
C) OPERATIONS 행이 빠져 3행이 나온다  
D) 짝이 없는 부서가 있어 오류가 난다  

**정답: A**  
해설: 스칼라 서브쿼리는 바깥 행을 줄이지 않는다. DEPT 4행이 그대로 나오고, 40번은 `MAX`가 빈 집합에서 NULL 을 돌려준다. 0 이 되는 것은 `COUNT`일 때다. 행이 빠지는 것은 INNER JOIN 의 동작이고, 값이 없는 것은 오류가 아니다.

---

**문제 4.** 뷰(VIEW)에 대한 설명으로 옳지 않은 것은?

A) 테이블 구조가 바뀌어도 뷰 정의만 고치면 뷰를 쓰는 프로그램은 그대로 둘 수 있다  
B) 복잡한 조인 질의를 뷰로 만들어 두면 짧은 SELECT 로 조회할 수 있다  
C) 뷰는 조회 결과를 별도로 저장해 두므로 기반 테이블이 바뀌어도 결과가 유지된다  
D) 보여 줄 열만 담은 뷰에 권한을 주어 나머지 열을 숨길 수 있다  

**정답: C**  
해설: 일반 뷰는 SELECT 문 정의만 저장하는 가상 테이블이다. 조회할 때마다 기반 테이블에서 실행되므로 테이블 데이터가 바뀌면 뷰 결과도 바뀐다. A 는 독립성, B 는 편리성, D 는 보안성으로 모두 뷰의 장점이다.

---

**문제 5.** 다음 중 Oracle 에서 오류 없이 실행되는 것은?

A) `SELECT DEPTNO, AVG_SAL FROM (SELECT DEPTNO, ROUND(AVG(SAL)) AS AVG_SAL FROM EMP GROUP BY DEPTNO) WHERE AVG_SAL > 2000;`  
B) `SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL >= 36000;`  
C) `SELECT X.ENAME FROM (SELECT ENAME FROM EMP WHERE DEPTNO = 10) X WHERE X.SAL > 1000;`  
D) `SELECT DEPTNO, AVG(SAL) FROM (SELECT DEPTNO, ROUND(AVG(SAL)) AS AVG_SAL FROM EMP GROUP BY DEPTNO);`  

**정답: A**  
해설: 인라인 뷰 안에서 붙인 별칭 AVG_SAL 은 바깥에서 열 이름이 되어 WHERE 에 쓸 수 있다. B 는 같은 수준의 WHERE 가 SELECT 별칭을 몰라 ORA-00904 가 난다. C 는 인라인 뷰 X 가 SAL 을 내놓지 않아 ORA-00904 다. D 도 인라인 뷰에 SAL 열이 없어 `AVG(SAL)`에서 ORA-00904 가 난다.
