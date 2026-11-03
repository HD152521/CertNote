# Day 1 - 서브쿼리 기본

## 📌 핵심 정리

- 서브쿼리는 괄호로 감싼 SELECT 다. SELECT·FROM·WHERE·HAVING 절에 들어갈 수 있고, 자리마다 부르는 이름이 다르다.
- **단일행 서브쿼리**에는 `=`·`>`·`<` 같은 단일행 연산자를, **다중행 서브쿼리**에는 `IN`·`ANY`·`ALL`·`EXISTS`를 쓴다. 섞으면 ORA-01427 이다.
- `> ANY`는 "최솟값보다 크다", `> ALL`은 "최댓값보다 크다"와 같다. 서브쿼리가 비면 `ALL`은 참, `ANY`는 거짓이다.
- `NOT IN` 목록에 NULL 이 하나라도 있으면 결과는 **0행**이다. `NOT EXISTS`나 `IS NOT NULL` 조건으로 피한다.
- WHERE 절 서브쿼리 안에는 ORDER BY 를 쓸 수 없다(ORA-00907). FROM 절의 인라인 뷰에는 쓸 수 있다.

## 쿼리 안에 쿼리를 넣는 이유

"JONES 보다 급여가 많은 사원"을 구하려면 JONES 의 급여부터 알아야 한다. 값을 먼저 찾아 손으로 옮겨 적는 대신, 그 값을 구하는 SELECT 를 괄호에 넣어 조건 자리에 그대로 쓴다.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL > (SELECT SAL FROM EMP WHERE ENAME = 'JONES') ORDER BY SAL DESC, ENAME;
```

```text
ENAME             SAL
---------- ----------
KING             5000
FORD             3000
SCOTT            3000
```

- 괄호 안이 **서브쿼리**(안쪽 쿼리), 바깥이 **메인쿼리**다.
- 서브쿼리 `SELECT SAL FROM EMP WHERE ENAME = 'JONES'`가 2975 를 돌려주고, 메인쿼리는 `SAL > 2975`로 실행된 것과 같다.
- 서브쿼리는 반드시 괄호로 감싼다.

## 서브쿼리가 들어가는 자리

| 위치 | 이름 | 돌려줘야 하는 모양 | 예 |
|------|------|-----------------|----|
| SELECT 절 | 스칼라 서브쿼리 | 한 행 한 열 | `(SELECT ROUND(AVG(SAL)) FROM EMP)` |
| FROM 절 | 인라인 뷰 | 표(여러 행·여러 열) | `FROM (SELECT DEPTNO, COUNT(*) ...) D` |
| WHERE 절 | 중첩 서브쿼리 | 연산자에 맞는 모양 | `SAL > (SELECT ...)` |
| HAVING 절 | 중첩 서브쿼리 | 연산자에 맞는 모양 | `HAVING AVG(SAL) > (SELECT ...)` |

SELECT 절에 넣으면 모든 행에 같은 값이 붙고, FROM 절에 넣으면 결과가 테이블처럼 쓰인다. HAVING 절에 넣으면 그룹을 전체 값과 비교할 수 있다. 전체 평균 급여(2073.21…)보다 부서 평균이 높은 부서다.

```sql
SELECT DEPTNO, AVG(SAL) FROM EMP GROUP BY DEPTNO HAVING AVG(SAL) > (SELECT AVG(SAL) FROM EMP) ORDER BY DEPTNO;
```

```text
    DEPTNO   AVG(SAL)
---------- ----------
        10 2916.66667
        20       2175
```

- 30번 부서 평균은 1566.66… 이라 빠졌다.
- 스칼라 서브쿼리와 인라인 뷰는 Day 2 에서 자세히 다룬다. 오늘은 WHERE·HAVING 의 비교 규칙이 중심이다.

## 단일행 서브쿼리와 다중행 서브쿼리

서브쿼리는 **돌려주는 행 수**로도 나눈다. 행 수에 따라 쓸 수 있는 연산자가 정해진다.

| 구분 | 결과 행 수 | 쓰는 연산자 |
|------|----------|-----------|
| 단일행 서브쿼리 | 0 또는 1행 | `=`, `<>`, `>`, `>=`, `<`, `<=` |
| 다중행 서브쿼리 | 여러 행 | `IN`, `NOT IN`, `ANY`(`SOME`), `ALL`, `EXISTS` |
| 다중 컬럼 서브쿼리 | 여러 열 | `(열1, 열2) IN (...)` |

### 단일행 연산자에 여러 행이 오면 — ORA-01427

30번 부서의 최고 급여를 받는 사원은 `MAX`로 값을 하나로 줄이면 된다.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL = (SELECT MAX(SAL) FROM EMP WHERE DEPTNO = 30);
```

```text
ENAME             SAL
---------- ----------
BLAKE            2850
```

`MAX`를 빼면 서브쿼리가 30번 부서 6명의 급여 6행을 돌려준다. `=`는 값 하나와만 비교할 수 있다.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL = (SELECT SAL FROM EMP WHERE DEPTNO = 30);
```

```text
SELECT ENAME, SAL FROM EMP WHERE SAL = (SELECT SAL FROM EMP WHERE DEPTNO = 30)
                                        *
ERROR at line 1:
ORA-01427: single-row subquery returns more than one row
```

- 오류는 실행 중에 결과가 2행 이상으로 나왔을 때 난다. 같은 문장도 데이터가 바뀌어 1행만 나오면 오류가 나지 않는다.
- 서브쿼리가 **0행**이면 오류가 아니다. 비교 값이 NULL 이 되어 조건이 참이 되지 않고, 결과는 0행이다.
- `IN`은 서브쿼리가 1행만 돌려줘도 문제없다. 결과가 몇 행일지 모르면 다중행 연산자가 안전하다.

### IN — 목록 중 하나와 같으면

- `IN`은 `= OR = OR =`를 줄인 것이다. `SAL IN (SELECT MIN(SAL) FROM EMP GROUP BY DEPTNO)`는 부서별 최저 급여 800·950·1300 중 하나와 같은 사원을 고른다.
- "자기 부서의 최저 급여인지"까지는 따지지 않는다. 그 비교는 아래 다중 컬럼 서브쿼리가 맡는다.

### ANY 와 ALL

`ANY`는 목록 중 **하나라도** 조건을 만족하면 참이고, `ALL`은 **모두** 만족해야 참이다. 30번 부서 급여는 950·1250·1250·1500·1600·2850 이다.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL > ALL (SELECT SAL FROM EMP WHERE DEPTNO = 30) ORDER BY SAL DESC, ENAME;
```

```text
ENAME             SAL
---------- ----------
KING             5000
FORD             3000
SCOTT            3000
JONES            2975
```

- `> ALL`: 가장 큰 2850 보다 커야 한다. BLAKE 자신(2850)은 `2850 > 2850`이 거짓이라 빠진다.
- 같은 자리에 `> ANY`를 쓰면 가장 작은 950 보다만 크면 된다. 30번 밖에서는 SMITH(800)만 빠진다.

| 식 | 같은 뜻 |
|----|--------|
| `> ANY (목록)` | `> MIN(목록)` |
| `< ANY (목록)` | `< MAX(목록)` |
| `> ALL (목록)` | `> MAX(목록)` |
| `< ALL (목록)` | `< MIN(목록)` |
| `= ANY (목록)` | `IN (목록)` |
| `<> ALL (목록)` | `NOT IN (목록)` |

서브쿼리가 **0행**일 때 두 연산자는 반대로 움직인다. DEPT 40 에는 사원이 없다.

```sql
SELECT COUNT(*) FROM EMP WHERE SAL > ALL (SELECT SAL FROM EMP WHERE DEPTNO = 40);
SELECT COUNT(*) FROM EMP WHERE SAL > ANY (SELECT SAL FROM EMP WHERE DEPTNO = 40);
```

```text
  COUNT(*)
----------
        14

  COUNT(*)
----------
         0
```

- `ALL`: 어긋나는 값이 하나도 없으니 참이다. 14행이 모두 나온다.
- `ANY`: 만족하는 값이 하나도 없으니 거짓이다. 그래서 `> ALL`과 `> (SELECT MAX ...)`는 서브쿼리가 빌 때만 결과가 다르다. MAX 쪽은 NULL 과 비교해 0행이다.

### EXISTS — 있느냐 없느냐

`EXISTS`는 서브쿼리가 **1행이라도 돌려주면 참**이다. 무슨 값을 돌려주는지는 보지 않아서 `SELECT 1`처럼 쓴다. 급여 3000 이상인 사원이 있는 부서다.

```sql
SELECT DNAME FROM DEPT D WHERE EXISTS (SELECT 1 FROM EMP E WHERE E.DEPTNO = D.DEPTNO AND E.SAL >= 3000) ORDER BY DNAME;
```

```text
DNAME
--------------
ACCOUNTING
RESEARCH
```

- 서브쿼리 안의 `D.DEPTNO`는 메인쿼리의 열이다. 바깥 행마다 서브쿼리를 다시 확인하는 이 형태가 Day 2 의 상관 서브쿼리다.
- EXISTS 는 조건을 만족하는 행을 하나 찾으면 더 찾지 않고 참으로 끝낼 수 있다.

## 다중 컬럼 서브쿼리

비교할 열이 둘 이상이면 괄호로 묶어 **쌍**으로 비교한다. 부서별 최고 급여자를 구하는 문장이다.

```sql
SELECT ENAME, DEPTNO, SAL FROM EMP WHERE (DEPTNO, SAL) IN (SELECT DEPTNO, MAX(SAL) FROM EMP GROUP BY DEPTNO) ORDER BY DEPTNO, ENAME;
```

```text
ENAME          DEPTNO        SAL
---------- ---------- ----------
KING               10       5000
FORD               20       3000
SCOTT              20       3000
BLAKE              30       2850
```

- 서브쿼리 결과는 (10, 5000), (20, 3000), (30, 2850) 세 쌍이다. 20번은 3000 이 둘이라 FORD·SCOTT 가 함께 나온다.
- 왼쪽 열 개수와 서브쿼리 SELECT 열 개수가 같아야 한다.

쌍 비교와 열을 따로 비교하는 것은 다르다. SMITH(20, CLERK)와 ALLEN(30, SALESMAN)의 (부서, 직무) 조합으로 확인한다.

```sql
SELECT ENAME, DEPTNO, JOB FROM EMP WHERE (DEPTNO, JOB) IN (SELECT DEPTNO, JOB FROM EMP WHERE ENAME IN ('SMITH', 'ALLEN')) ORDER BY DEPTNO, ENAME;
```

```text
ENAME          DEPTNO JOB
---------- ---------- ---------
ADAMS              20 CLERK
SMITH              20 CLERK
ALLEN              30 SALESMAN
MARTIN             30 SALESMAN
TURNER             30 SALESMAN
WARD               30 SALESMAN
```

```sql
SELECT ENAME, DEPTNO, JOB FROM EMP WHERE DEPTNO IN (SELECT DEPTNO FROM EMP WHERE ENAME IN ('SMITH', 'ALLEN')) AND JOB IN (SELECT JOB FROM EMP WHERE ENAME IN ('SMITH', 'ALLEN')) ORDER BY DEPTNO, ENAME;
```

```text
ENAME          DEPTNO JOB
---------- ---------- ---------
ADAMS              20 CLERK
SMITH              20 CLERK
ALLEN              30 SALESMAN
JAMES              30 CLERK
MARTIN             30 SALESMAN
TURNER             30 SALESMAN
WARD               30 SALESMAN
```

- 따로 비교하면 부서는 {20, 30}, 직무는 {CLERK, SALESMAN} 안에만 들면 된다. 그래서 (30, CLERK)인 JAMES 가 끼어든다.
- 쌍 비교는 (20, CLERK)와 (30, SALESMAN) 두 조합만 인정한다. 6행 대 7행이다.

단일행 연산자 `=` 앞에 열 하나를 두고 서브쿼리에서 두 열을 돌려주면 개수가 맞지 않는다.

```sql
SELECT ENAME FROM EMP WHERE DEPTNO = (SELECT DEPTNO, DNAME FROM DEPT WHERE DEPTNO = 10);
```

```text
SELECT ENAME FROM EMP WHERE DEPTNO = (SELECT DEPTNO, DNAME FROM DEPT WHERE DEPTNO = 10)
                                      *
ERROR at line 1:
ORA-00913: too many values
```

- **ORA-01427** 은 행이 많을 때, **ORA-00913** 은 열이 많을 때다.

## NOT IN 과 NULL

관리자가 아닌 사원, 즉 누구의 MGR 로도 등장하지 않는 사원을 `NOT IN`으로 구해 본 결과다.

```sql
SELECT COUNT(*) FROM EMP WHERE EMPNO NOT IN (SELECT MGR FROM EMP);
```

```text
  COUNT(*)
----------
         0
```

부하가 없는 사원은 8명인데 0 이 나왔다. MGR 열에 KING 의 **NULL** 이 섞여 있기 때문이다.

- `EMPNO NOT IN (7902, 7698, …, NULL)`은 `EMPNO <> 7902 AND … AND EMPNO <> NULL`이다.
- `EMPNO <> NULL`은 참도 거짓도 아닌 UNKNOWN 이다. AND 로 묶인 조건에 UNKNOWN 이 하나라도 있으면 전체가 참이 될 수 없다.
- `IN`은 OR 로 풀리므로 NULL 이 섞여도 다른 값과 같으면 참이 된다. 문제는 `NOT IN`에서만 생긴다.

> ⚠️ **함정**: `NOT IN` 서브쿼리 결과에 NULL 이 하나라도 있으면 결과는 오류 없이 **0행**이다. 서브쿼리에 `WHERE MGR IS NOT NULL`을 넣거나 `NOT EXISTS`로 바꾼다.

```sql
SELECT COUNT(*) FROM EMP WHERE EMPNO NOT IN (SELECT MGR FROM EMP WHERE MGR IS NOT NULL);
```

```text
  COUNT(*)
----------
         8
```

```sql
SELECT COUNT(*) FROM EMP E WHERE NOT EXISTS (SELECT 1 FROM EMP M WHERE M.MGR = E.EMPNO);
```

```text
  COUNT(*)
----------
         8
```

- `NOT EXISTS`는 "짝이 되는 행이 없는가"만 본다. NULL 비교가 끼어들 자리가 없어 결과가 8명으로 맞는다.

## 서브쿼리 안의 ORDER BY

WHERE 절 서브쿼리는 값의 목록을 넘길 뿐이라 순서가 의미가 없다. Oracle 은 여기에 ORDER BY 를 쓰면 문법 오류를 낸다.

```sql
SELECT COUNT(*) FROM EMP WHERE DEPTNO IN (SELECT DEPTNO FROM DEPT ORDER BY DEPTNO);
```

```text
SELECT COUNT(*) FROM EMP WHERE DEPTNO IN (SELECT DEPTNO FROM DEPT ORDER BY DEPTNO)
                                                                  *
ERROR at line 1:
ORA-00907: missing right parenthesis
```

- 오류 문구는 "오른쪽 괄호가 없다"이다. 파서가 ORDER BY 앞에서 괄호가 닫혀야 한다고 보기 때문이다.
- FROM 절의 인라인 뷰에는 ORDER BY 를 쓸 수 있다. 정렬한 뒤 `ROWNUM`으로 앞의 몇 행을 자르는 Top N 쿼리가 이 성질을 쓴다(W6).

| 위치 | ORDER BY |
|------|---------|
| WHERE·HAVING 절 서브쿼리 | 쓸 수 없다 (ORA-00907) |
| FROM 절 인라인 뷰 | 쓸 수 있다 |
| 메인쿼리 | 맨 끝에 한 번 |

- Oracle 12c 부터는 ORDER BY 뒤에 `FETCH FIRST n ROWS ONLY` 를 붙이면 WHERE 절 서브쿼리에서도 받아 준다. 정렬이 "앞의 n 행" 을 고르는 데 쓰이기 때문이다. 이 노트의 설명과 문항은 FETCH 없이 ORDER BY 만 쓴 경우를 기준으로 한다.

> 내일은 바깥 행을 참조하는 상관 서브쿼리, SELECT 절의 스칼라 서브쿼리, FROM 절의 인라인 뷰와 뷰를 다룬다.

## 📖 용어

- **서브쿼리** : 다른 SQL 문 안에 괄호로 넣은 SELECT 문. 바깥 문장은 메인쿼리라 부른다.
- **단일행 서브쿼리** : 결과가 0행 또는 1행인 서브쿼리. `=`·`>` 같은 단일행 연산자와 쓴다.
- **다중행 서브쿼리** : 결과가 여러 행일 수 있는 서브쿼리. `IN`·`ANY`·`ALL`·`EXISTS`와 쓴다.
- **다중 컬럼 서브쿼리** : 여러 열을 돌려줘 `(A, B) IN (...)`처럼 쌍으로 비교하는 서브쿼리.
- **ANY / ALL** : 목록 중 하나라도 / 전부 조건을 만족하면 참. 빈 목록에서 ANY 는 거짓, ALL 은 참이다.
- **EXISTS** : 서브쿼리 결과가 1행 이상이면 참. 돌려주는 값은 보지 않는다.
- **ORA-01427** : 단일행 연산자 뒤 서브쿼리가 2행 이상을 돌려줬을 때의 오류.
- **ORA-00913** : 비교할 자리보다 서브쿼리가 돌려준 열이 많을 때의 오류(too many values).

## 📝 연습 문제

**문제 1.** EMP 의 30번 부서에는 사원이 6명 있다. 다음 SQL 을 Oracle 에서 실행한 결과로 알맞은 것은?

```sql
SELECT ENAME FROM EMP WHERE SAL = (SELECT SAL FROM EMP WHERE DEPTNO = 30);
```

A) 30번 부서 사원 6행이 나온다  
B) 30번 부서 최고 급여자 BLAKE 1행이 나온다  
C) ORA-01427 오류가 난다  
D) ORA-00913 오류가 난다  

**정답: C**  
해설: `=`는 단일행 연산자라 값 하나와만 비교한다. 서브쿼리가 30번 부서 급여 6행을 돌려주므로 ORA-01427(single-row subquery returns more than one row)이 난다. 여러 값과 비교하려면 `IN`을 써야 하고, BLAKE 1행은 `MAX(SAL)`로 줄였을 때의 결과다. ORA-00913 은 행이 아니라 열이 많을 때의 오류다.

---

**문제 2.** EMP 의 MGR 열에는 KING 의 NULL 이 하나 있고, 부하 직원이 없는 사원은 8명이다. 다음 SQL 의 결과는?

```sql
SELECT COUNT(*) FROM EMP WHERE EMPNO NOT IN (SELECT MGR FROM EMP);
```

A) 0  
B) 8  
C) 6  
D) 14  

**정답: A**  
해설: `NOT IN`은 목록의 모든 값과 `<>`로 비교해 AND 로 묶는다. 목록에 NULL 이 있으면 `EMPNO <> NULL`이 UNKNOWN 이 되어 어떤 행도 참이 될 수 없다. 그래서 0 이다. 8 은 `WHERE MGR IS NOT NULL`을 넣거나 `NOT EXISTS`로 바꿨을 때의 결과이고, 6 은 `IN`으로 센 관리자 수다.

---

**문제 3.** 30번 부서에는 사원이 있다. `SAL > ALL (SELECT SAL FROM EMP WHERE DEPTNO = 30)` 과 같은 결과를 내는 조건은?

A) `SAL > (SELECT MIN(SAL) FROM EMP WHERE DEPTNO = 30)`  
B) `SAL >= (SELECT MAX(SAL) FROM EMP WHERE DEPTNO = 30)`  
C) `SAL IN (SELECT SAL FROM EMP WHERE DEPTNO = 30)`  
D) `SAL > (SELECT MAX(SAL) FROM EMP WHERE DEPTNO = 30)`  

**정답: D**  
해설: `> ALL`은 목록의 모든 값보다 커야 하므로 가장 큰 값보다 크다는 뜻이다. `> MIN`은 `> ANY`와 같은 조건이다. `>= MAX`는 최댓값과 같은 사원(BLAKE)까지 포함해 결과가 다르다. `IN`은 목록 중 하나와 같은지를 본다.

---

**문제 4.** 다음 중 Oracle 에서 실행하면 오류가 나는 것은?

A) `SELECT COUNT(*) FROM (SELECT ENAME FROM EMP ORDER BY ENAME);`  
B) `SELECT COUNT(*) FROM EMP WHERE DEPTNO IN (SELECT DEPTNO FROM DEPT ORDER BY DEPTNO);`  
C) `SELECT DEPTNO, COUNT(*) FROM EMP GROUP BY DEPTNO HAVING COUNT(*) > (SELECT COUNT(*) FROM EMP WHERE DEPTNO = 10);`  
D) `SELECT COUNT(*) FROM EMP WHERE DEPTNO IN (SELECT DEPTNO FROM DEPT WHERE LOC = 'DALLAS');`  

**정답: B**  
해설: WHERE 절 서브쿼리 안에는 ORDER BY 를 쓸 수 없어 ORA-00907(missing right parenthesis)이 난다. A 는 FROM 절 인라인 뷰라 ORDER BY 가 허용되고 14 가 나온다. C 는 HAVING 절 단일행 서브쿼리로 20·30번 부서가 나온다. D 는 다중행 연산자 IN 이라 정상이다.

---

**문제 5.** SMITH 는 (20, CLERK), ALLEN 은 (30, SALESMAN)이다. EMP 에서 (20, CLERK)는 2명, (30, SALESMAN)은 4명, (30, CLERK)는 1명이다. 다음 SQL 의 결과는?

```sql
SELECT COUNT(*) FROM EMP WHERE (DEPTNO, JOB) IN (SELECT DEPTNO, JOB FROM EMP WHERE ENAME IN ('SMITH', 'ALLEN'));
```

A) 2  
B) 7  
C) ORA-00913 오류가 난다  
D) 6  

**정답: D**  
해설: 다중 컬럼 서브쿼리는 (부서, 직무)를 쌍으로 비교한다. 인정되는 조합은 (20, CLERK)와 (30, SALESMAN)뿐이라 2 + 4 = 6 이다. 7 은 DEPTNO 와 JOB 을 따로 IN 으로 비교해 (30, CLERK)인 JAMES 까지 들어갔을 때의 결과다. 왼쪽 열 수와 서브쿼리 열 수가 2개로 같으므로 오류는 나지 않는다.
