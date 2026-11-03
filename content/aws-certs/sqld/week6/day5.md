# Day 5 - 셀프 조인

## 📌 핵심 정리

- 셀프 조인은 한 테이블을 **별칭 둘**로 FROM 에 두고 조인하는 것이다. 별칭이 없으면 열 이름이 겹쳐 ORA-00918 이다.
- EMP 의 사원-관리자는 `E.MGR = M.EMPNO` 로 잇는다. E 는 사원 역할, M 은 관리자 역할을 맡은 같은 EMP 다.
- 내부 조인이면 MGR 이 NULL 인 KING 이 빠져 13행이다. KING 을 남기려면 사원 쪽 기준 외부 조인(`M.EMPNO(+)` 또는 `E LEFT OUTER JOIN M`)을 쓴다.
- 관리자의 관리자는 같은 EMP 를 세 번 쓴다. 단계가 늘 때마다 별칭과 조인 조건이 하나씩 는다.
- 계층형 질의는 깊이와 관계없이 끝까지 따라가고, 셀프 조인은 적어 준 단계만큼만 잇는다.

## 같은 테이블을 두 번 읽는 이유

사원 이름 옆에 관리자 이름을 놓고 싶다. 관리자도 EMP 의 한 행이라, 정보는 같은 테이블에 이미 있다. 문제는 한 행 안에서는 자기 관리자의 이름을 볼 수 없다는 점이다. 그래서 EMP 를 두 개 있는 것처럼 FROM 에 두 번 적는다.

```text
EMP E (사원 역할)                    EMP M (관리자 역할)
EMPNO  ENAME  MGR                   EMPNO  ENAME
7369   SMITH  7902  ── E.MGR = M.EMPNO ──▶ 7902   FORD
7902   FORD   7566  ─────────────────────▶ 7566   JONES
7839   KING   NULL  ── 짝 없음 (내부 조인에서 빠진다)
```

- 물리적으로는 테이블 하나다. 별칭이 각각 다른 **역할**을 맡을 뿐이다.
- 조인 조건 방향이 역할을 정한다. `E.MGR = M.EMPNO` 면 M 이 E 의 관리자다.

## 사원과 관리자

Oracle 조인 문법으로 쓴다.

```sql
SELECT E.EMPNO, E.ENAME, E.MGR, M.ENAME AS MGR_NAME FROM EMP E, EMP M WHERE E.MGR = M.EMPNO ORDER BY E.EMPNO;
```

```text
     EMPNO ENAME             MGR MGR_NAME
---------- ---------- ---------- ----------
      7369 SMITH            7902 FORD
      7499 ALLEN            7698 BLAKE
      7521 WARD             7698 BLAKE
      7566 JONES            7839 KING
      7654 MARTIN           7698 BLAKE
      7698 BLAKE            7839 KING
      7782 CLARK            7839 KING
      7788 SCOTT            7566 JONES
      7844 TURNER           7698 BLAKE
      7876 ADAMS            7788 SCOTT
      7900 JAMES            7698 BLAKE
      7902 FORD             7566 JONES
      7934 MILLER           7782 CLARK
```

- 13행이다. KING 은 MGR 이 NULL 이라 `NULL = M.EMPNO` 가 참이 되지 않아 빠졌다.
- 조인 조건 없이 `FROM EMP E, EMP M` 만 쓰면 14 × 14 = 196 행의 카티션 곱이다.
- ANSI 로는 `FROM EMP E JOIN EMP M ON E.MGR = M.EMPNO` 다. 결과는 같다.

### 조건 방향을 바꾸면 역할이 바뀐다

`M.MGR = E.EMPNO` 로 쓰면 이번에는 M 이 E 의 부하다. JONES 의 부하를 구한다.

```sql
SELECT E.ENAME, M.ENAME AS SUB_NAME FROM EMP E JOIN EMP M ON M.MGR = E.EMPNO WHERE E.ENAME = 'JONES' ORDER BY M.ENAME;
```

```text
ENAME      SUB_NAME
---------- ----------
JONES      FORD
JONES      SCOTT
```

- 별칭 이름 E·M 에는 뜻이 없다. 어느 쪽의 MGR 을 어느 쪽의 EMPNO 와 맞추는지가 관계를 정한다.

### 별칭이 없으면

```sql
SELECT ENAME FROM EMP, EMP WHERE MGR = EMPNO;
```

```text
SELECT ENAME FROM EMP, EMP WHERE MGR = EMPNO
                                       *
ERROR at line 1:
ORA-00918: EMPNO: column ambiguously specified - appears in EMP and EMP
```

- 두 EMP 의 열 이름이 모두 같아 어느 쪽 EMPNO 인지 정할 수 없다.
- 교재에 실린 이전 버전 메시지는 `ORA-00918: column ambiguously defined` 다. 실습 컨테이너(23ai)는 열 이름과 테이블을 함께 알려 주는 메시지로 바뀌었다. 오류 번호는 같다.
- 별칭을 정의하지 않고 쓰면 ORA-00904 다. `FROM EMP E` 만 두고 `M.EMPNO` 를 쓰면 `"M"."EMPNO": invalid identifier` 가 나온다.

## 관리자의 관리자 — 3단계

사원 → 관리자 → 관리자의 관리자는 EMP 를 세 번 쓴다. 별칭 T 가 세 번째 역할이다.

```sql
SELECT E.ENAME, M.ENAME AS MGR_NAME, T.ENAME AS TOP_NAME FROM EMP E, EMP M, EMP T WHERE E.MGR = M.EMPNO AND M.MGR = T.EMPNO ORDER BY E.EMPNO;
```

```text
ENAME      MGR_NAME   TOP_NAME
---------- ---------- ----------
SMITH      FORD       JONES
ALLEN      BLAKE      KING
WARD       BLAKE      KING
MARTIN     BLAKE      KING
SCOTT      JONES      KING
TURNER     BLAKE      KING
ADAMS      SCOTT      JONES
JAMES      BLAKE      KING
FORD       JONES      KING
MILLER     CLARK      KING
```

- 10행이다. 관리자의 관리자가 있어야 남는다.
- 빠진 4명은 KING(관리자 없음)과 BLAKE·CLARK·JONES(관리자가 KING 이고, KING 의 관리자가 없음)다.
- 두 번째 조건 `M.MGR = T.EMPNO` 는 **M** 의 관리자를 찾는다. `E.MGR = T.EMPNO` 로 쓰면 T 가 M 과 같은 사람이 되어 버린다.

| 단계 | FROM 의 EMP 수 | 조인 조건 수 | 내부 조인 결과 |
|------|------------:|---------:|------------:|
| 사원 – 관리자 | 2 | 1 | 13 |
| 사원 – 관리자 – 관리자의 관리자 | 3 | 2 | 10 |

- 테이블 n 개를 이으려면 조인 조건이 최소 n − 1 개 필요하다. W4 의 조인 규칙이 셀프 조인에도 그대로다.

## 셀프 외부 조인 — KING 남기기

사원 14명을 모두 보이고, 관리자가 없으면 빈칸으로 두려면 사원 쪽(E)을 기준으로 외부 조인한다. `(+)` 는 **없을 수도 있는 쪽**, 즉 관리자 M 쪽에 붙인다.

```sql
SELECT E.ENAME, M.ENAME AS MGR_NAME FROM EMP E, EMP M WHERE E.MGR = M.EMPNO(+) ORDER BY E.EMPNO;
```

```text
ENAME      MGR_NAME
---------- ----------
SMITH      FORD
ALLEN      BLAKE
WARD       BLAKE
JONES      KING
MARTIN     BLAKE
BLAKE      KING
CLARK      KING
SCOTT      JONES
KING
TURNER     BLAKE
ADAMS      SCOTT
JAMES      BLAKE
FORD       JONES
MILLER     CLARK
```

- 14행이다. KING 의 MGR_NAME 은 NULL 이다.
- ANSI 로는 `FROM EMP E LEFT OUTER JOIN EMP M ON E.MGR = M.EMPNO` 다. 실습 컨테이너에서 같은 14행이 나왔다.

3단계도 외부 조인으로 바꾸면 14명이 모두 남는다.

```sql
SELECT E.ENAME, M.ENAME AS MGR_NAME, T.ENAME AS TOP_NAME FROM EMP E LEFT OUTER JOIN EMP M ON E.MGR = M.EMPNO LEFT OUTER JOIN EMP T ON M.MGR = T.EMPNO ORDER BY E.EMPNO;
```

```text
ENAME      MGR_NAME   TOP_NAME
---------- ---------- ----------
SMITH      FORD       JONES
ALLEN      BLAKE      KING
WARD       BLAKE      KING
JONES      KING
MARTIN     BLAKE      KING
BLAKE      KING
CLARK      KING
SCOTT      JONES      KING
KING
TURNER     BLAKE      KING
ADAMS      SCOTT      JONES
JAMES      BLAKE      KING
FORD       JONES      KING
MILLER     CLARK      KING
```

- 두 번째 조인도 LEFT 여야 한다. 첫 조인만 LEFT 로 두고 둘째를 내부 조인으로 쓰면 M 이 NULL 인 KING 과 T 가 없는 BLAKE·CLARK·JONES 가 다시 빠진다.

### (+) 를 반대쪽에 붙이면

`E.MGR(+) = M.EMPNO` 는 관리자 쪽(M) 14명을 모두 남긴다. 부하가 없는 사원도 M 자리에 나온다.

| 쓰는 법 | 기준(모두 남는 쪽) | 결과 행 수 | 뜻 |
|--------|---------------|--------:|----|
| `E.MGR = M.EMPNO` | 없음 | 13 | 관리자가 있는 사원 |
| `E.MGR = M.EMPNO(+)` | E (사원) | 14 | 모든 사원 + 관리자(없으면 NULL) |
| `E.MGR(+) = M.EMPNO` | M (관리자 역할) | 21 | 모든 사원을 관리자 자리에 두고 부하를 붙임 |

- 21 은 부하가 있는 6명의 부하 13행에, 부하가 없는 8명이 한 행씩 더해진 수다.
- 부하가 없는 8명만 고르려면 이 외부 조인에 `E.EMPNO IS NULL` 을 건다. ADAMS·ALLEN·JAMES·MARTIN·MILLER·SMITH·TURNER·WARD 가 나온다. Day 4 의 `CONNECT_BY_ISLEAF = 1` 과 같은 8명이다.

> ⚠️ **함정**: `(+)` 는 기준 테이블이 아니라 **NULL 이 채워질 쪽**에 붙인다. "KING 을 남긴다"는 사원 E 가 기준이므로 반대편 M 의 열에 `(+)` 를 붙여 `E.MGR = M.EMPNO(+)` 다.

## 관리자와 비교하기

셀프 조인으로 한 행에 사원과 관리자가 나란히 있으니, 둘의 값을 바로 비교할 수 있다. 관리자보다 급여가 많은 사원이다.

```sql
SELECT E.ENAME, E.SAL, M.ENAME AS MGR_NAME, M.SAL AS MGR_SAL FROM EMP E JOIN EMP M ON E.MGR = M.EMPNO WHERE E.SAL > M.SAL ORDER BY E.ENAME;
```

```text
ENAME             SAL MGR_NAME      MGR_SAL
---------- ---------- ---------- ----------
FORD             3000 JONES            2975
SCOTT            3000 JONES            2975
```

관리자를 기준으로 묶으면 관리자별 부하 수가 된다.

```sql
SELECT M.ENAME, COUNT(*) AS CNT FROM EMP E JOIN EMP M ON E.MGR = M.EMPNO GROUP BY M.ENAME ORDER BY CNT DESC, M.ENAME;
```

```text
ENAME             CNT
---------- ----------
BLAKE               5
KING                3
JONES               2
CLARK               1
FORD                1
SCOTT               1
```

- 직속 부하만 센다. KING 아래의 전체 인원(13명)은 셀프 조인 한 번으로는 나오지 않는다. 그 일은 계층형 질의가 맡는다.

## 계층형 질의와 셀프 조인

계층형 질의에서도 `PRIOR ENAME` 을 SELECT 에 쓰면 부모 이름을 옆에 붙일 수 있다. 결과는 셀프 외부 조인과 같은 14쌍이고, LEVEL 이 더해진다.

```sql
SELECT LEVEL, ENAME, PRIOR ENAME AS MGR_NAME FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR ORDER SIBLINGS BY ENAME;
```

```text
     LEVEL ENAME      MGR_NAME
---------- ---------- ----------
         1 KING
         2 BLAKE      KING
         3 ALLEN      BLAKE
         3 JAMES      BLAKE
         3 MARTIN     BLAKE
         3 TURNER     BLAKE
         3 WARD       BLAKE
         2 CLARK      KING
         3 MILLER     CLARK
         2 JONES      KING
         3 FORD       JONES
         4 SMITH      FORD
         3 SCOTT      JONES
         4 ADAMS      SCOTT
```

| 구분 | 셀프 조인 | 계층형 질의 |
|------|--------|----------|
| 문법 | 같은 테이블에 별칭 둘 이상 + 조인 조건 | START WITH + CONNECT BY PRIOR |
| 표준 여부 | ANSI 조인으로도 쓴다 | Oracle 전용 (SQL Server 는 재귀 CTE) |
| 따라가는 깊이 | 별칭 수만큼 고정 (2단계면 2, 3단계면 3) | 끝까지, 깊이가 달라도 한 문장 |
| 한 행에 보이는 것 | 여러 단계의 값을 **옆으로** 나란히 | 한 단계씩 **아래로** 행이 늘어난다 |
| 깊이 정보 | 직접 세야 한다 | LEVEL, SYS_CONNECT_BY_PATH 로 바로 |
| 잘 맞는 질문 | "사원과 관리자의 급여 비교" | "KING 아래 전체 조직도" |

- 둘 다 같은 EMP 의 MGR → EMPNO 관계를 쓴다. 정해진 단계의 값을 한 행에 놓을 때는 셀프 조인, 깊이를 모르는 트리를 펼칠 때는 계층형 질의가 맞다.

> 다음 주는 행과 열을 바꾸는 PIVOT·UNPIVOT 으로 시작한다.

## 📖 용어

- **셀프 조인** : 같은 테이블을 별칭 둘 이상으로 FROM 에 두고 자기 자신과 조인하는 것.
- **테이블 별칭** : FROM 절에서 테이블에 붙이는 짧은 이름. 셀프 조인에서는 같은 테이블의 역할을 나누는 데 꼭 필요하다.
- **역할** : 셀프 조인에서 별칭이 맡는 의미. 같은 EMP 라도 E 는 사원, M 은 관리자 역할이다.
- **셀프 외부 조인** : 셀프 조인을 외부 조인으로 써서 짝이 없는 행(관리자가 없는 KING)도 남기는 것.
- **ORA-00918** : 여러 테이블에 같은 이름의 열이 있는데 어느 쪽인지 밝히지 않았을 때의 오류.
- **카티션 곱** : 조인 조건 없이 두 테이블의 모든 행을 짝지은 결과. EMP 끼리면 14 × 14 = 196 행이다.

## 📝 연습 문제

**문제 1.** EMP 14명 중 MGR 이 NULL 인 사원은 KING 한 명이다. `SELECT COUNT(*) FROM EMP E, EMP M WHERE E.MGR = M.EMPNO;` 의 결과는?

A) 14  
B) 13  
C) 12  
D) 196  

**정답: B**  
해설: 내부 셀프 조인이라 관리자 행을 찾지 못한 KING 이 빠진다. 나머지 13명은 관리자가 한 명씩이라 13행이다. 14 는 사원 쪽을 기준으로 외부 조인했을 때의 결과다. 196 은 조인 조건이 없는 카티션 곱이다.

---

**문제 2.** 사원 이름과 관리자 이름을 보이되, 관리자가 없는 KING 도 사원으로 결과에 남기는 Oracle 조건은? (`FROM EMP E, EMP M`, E 가 사원, M 이 관리자 역할이다)

A) `WHERE E.MGR = M.EMPNO`  
B) `WHERE E.MGR(+) = M.EMPNO`  
C) `WHERE E.MGR = M.EMPNO AND E.MGR IS NULL`  
D) `WHERE E.MGR = M.EMPNO(+)`  

**정답: D**  
해설: 기준은 사원 E 이고 짝이 없을 수 있는 쪽은 관리자 M 이므로 M 쪽에 `(+)` 를 붙인다. A 는 내부 조인이라 KING 이 빠진다. B 는 관리자 역할 M 을 기준으로 남겨 부하가 없는 사원을 살리는 반대 방향이다. C 는 `NULL = M.EMPNO` 가 참이 될 수 없어 0행이다.

---

**문제 3.** 다음 SQL 의 결과 행 수는? (관리자가 없는 사원은 KING, 관리자가 KING 인 사원은 BLAKE·CLARK·JONES 다)
`SELECT E.ENAME, T.ENAME FROM EMP E, EMP M, EMP T WHERE E.MGR = M.EMPNO AND M.MGR = T.EMPNO;`

A) 10  
B) 13  
C) 14  
D) 8  

**정답: A**  
해설: 관리자의 관리자까지 있어야 남는다. KING 은 관리자가 없고, BLAKE·CLARK·JONES 는 관리자 KING 의 관리자가 없어 빠진다. 14 − 4 = 10 행이다. 13 은 2단계 내부 조인의 결과이고, 14 는 외부 조인으로 모두 남겼을 때다. 8 은 부하가 없는 사원 수다.

---

**문제 4.** `SELECT ENAME FROM EMP, EMP WHERE MGR = EMPNO;` 를 Oracle 에서 실행한 결과는?

A) 13행이 나온다  
B) 0행이 나온다  
C) ORA-00918 오류가 난다  
D) ORA-00904 오류가 난다  

**정답: C**  
해설: 같은 EMP 를 별칭 없이 두 번 써서 열 이름이 어느 쪽인지 정할 수 없다. 그래서 열 이름이 모호하다는 ORA-00918 이 난다. 별칭을 붙여 `E.MGR = M.EMPNO` 로 써야 13행이 나온다. ORA-00904 는 없는 열이나 정의하지 않은 별칭을 쓸 때의 오류다.

---

**문제 5.** 다음 SQL 의 결과는? (SMITH 의 관리자는 FORD, FORD 의 관리자는 JONES, JONES 의 관리자는 KING 이다)
`SELECT T.ENAME FROM EMP E JOIN EMP M ON E.MGR = M.EMPNO JOIN EMP T ON M.MGR = T.EMPNO WHERE E.ENAME = 'SMITH';`

A) JONES  
B) FORD  
C) KING  
D) 결과 없음  

**정답: A**  
해설: E 가 SMITH 이면 M 은 SMITH 의 관리자 FORD 이고, T 는 FORD 의 관리자 JONES 다. FORD 는 M 의 값이다. KING 은 한 단계 더 올라간 JONES 의 관리자라 별칭이 하나 더 필요하다. 두 조인 모두 짝이 있으므로 결과는 비지 않는다.
