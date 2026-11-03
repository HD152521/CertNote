# Day 4 - 계층형 질의

## 📌 핵심 정리

- `START WITH` 는 출발점(루트) 행을, `CONNECT BY` 는 부모와 자식을 잇는 조건을 정한다. EMP 에서 루트는 `MGR IS NULL` 인 KING 이다.
- `PRIOR` 가 붙은 쪽이 이미 찾은 행이다. `PRIOR EMPNO = MGR` 은 부모 → 자식(순방향, 위에서 아래), `PRIOR MGR = EMPNO` 는 자식 → 부모(역방향, 아래에서 위)다.
- `LEVEL` 은 루트가 1 인 깊이다. `LPAD(' ', 2 * (LEVEL - 1))` 로 들여 쓰면 트리 모양이 보인다.
- 형제끼리 정렬하려면 `ORDER SIBLINGS BY` 를 쓴다. 일반 ORDER BY 는 트리 순서를 무너뜨린다.
- WHERE 조건은 트리를 다 만든 뒤 **그 행만** 뺀다. CONNECT BY 의 조건은 그 행과 **아래 가지 전체**를 잘라 낸다.

## 한 테이블 안의 나무 구조

EMP 의 MGR 열에는 관리자의 EMPNO 가 들어 있다. 같은 테이블 안에서 행이 다른 행을 가리키니, 따라가면 조직도가 된다.

```text
KING (7839, MGR 없음)
├─ BLAKE (7698) ── ALLEN · JAMES · MARTIN · TURNER · WARD
├─ CLARK (7782) ── MILLER
└─ JONES (7566) ─┬ FORD (7902) ── SMITH
                 └ SCOTT (7788) ── ADAMS
```

- 이 구조를 한 번의 SELECT 로 위에서 아래로 훑는 문법이 계층형 질의다. Oracle 전용 문법이다.
- 내일 볼 셀프 조인은 한 단계씩만 잇는다. 계층형 질의는 깊이와 관계없이 끝까지 따라간다.

## 기본 문법

```text
SELECT LEVEL, 열 …
FROM 테이블
[WHERE 결과 거르기 조건]
START WITH 루트 조건
CONNECT BY [NOCYCLE] PRIOR 부모쪽 열 = 자식쪽 열 [AND 가지치기 조건]
[ORDER SIBLINGS BY 열];
```

| 요소 | 하는 일 |
|------|-------|
| `START WITH` | 루트가 될 행. 조건에 맞는 행이 여럿이면 트리도 여럿이다 |
| `CONNECT BY` | 이미 찾은 행(PRIOR)과 다음 행을 잇는 조건 |
| `PRIOR` | "직전에 찾은 행의" 라는 뜻의 연산자 |
| `LEVEL` | 루트 1, 자식 2, 손자 3 … 인 의사 열 |
| `ORDER SIBLINGS BY` | 같은 부모 아래 형제끼리만 정렬 |

- 실행 순서는 START WITH → CONNECT BY → WHERE 다. WHERE 가 앞에 적혀 있어도 트리를 만든 뒤 적용된다.
- `START WITH` 를 생략하면 모든 행이 각자 루트가 된다. `SELECT COUNT(*) FROM EMP CONNECT BY PRIOR EMPNO = MGR` 은 실습 컨테이너에서 39 를 돌려줬다. 14명 각자의 아래 가지를 모두 더한 수다.

## 순방향 — 위에서 아래로

KING 에서 출발해 부하 쪽으로 내려간다. `PRIOR EMPNO = MGR` 은 "직전 행의 EMPNO 를 MGR 로 가진 행이 다음"이라는 뜻이다.

```sql
SELECT LEVEL, RPAD(LPAD(' ', 2 * (LEVEL - 1)) || ENAME, 16) AS TREE, EMPNO, MGR FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR ORDER SIBLINGS BY ENAME;
```

```text
     LEVEL TREE                                                                  EMPNO        MGR
---------- ---------------------------------------------------------------- ---------- ----------
         1 KING                                                                   7839
         2   BLAKE                                                                7698       7839
         3     ALLEN                                                              7499       7698
         3     JAMES                                                              7900       7698
         3     MARTIN                                                             7654       7698
         3     TURNER                                                             7844       7698
         3     WARD                                                               7521       7698
         2   CLARK                                                                7782       7839
         3     MILLER                                                             7934       7782
         2   JONES                                                                7566       7839
         3     FORD                                                               7902       7566
         4       SMITH                                                            7369       7902
         3     SCOTT                                                              7788       7566
         4       ADAMS                                                            7876       7788
```

- `LPAD(' ', 2 * (LEVEL - 1))` 는 LEVEL 1 에서 0칸, 2 에서 2칸, 3 에서 4칸의 공백을 만든다. 이름 앞에 붙이면 들여쓰기가 된다.
- 바깥 `RPAD(…, 16)` 은 결과 열의 폭을 줄이려고 붙였다. 빼도 내용은 같다. TREE 열의 긴 구분선은 SQL*Plus 가 열의 최대 바이트 수만큼 그린 것이다.
- 결과는 **깊이 우선**으로 나온다. BLAKE 의 부하를 다 보여 준 뒤에야 CLARK 으로 넘어간다.
- 각 행의 MGR 이 바로 위쪽 부모 행의 EMPNO 와 같다. 그것이 `PRIOR EMPNO = MGR` 이 만든 연결이다.

| LEVEL | 사원 수 | 사원 |
|------:|------:|-----|
| 1 | 1 | KING |
| 2 | 3 | BLAKE, CLARK, JONES |
| 3 | 8 | ALLEN, JAMES, MARTIN, TURNER, WARD, MILLER, FORD, SCOTT |
| 4 | 2 | SMITH, ADAMS |

- `GROUP BY LEVEL` 로 세어도 1, 3, 8, 2 가 나온다. 가장 깊은 LEVEL 은 4 다.

루트를 바꾸면 그 아래만 본다. JONES 의 조직이다.

```sql
SELECT LEVEL, RPAD(LPAD(' ', 2 * (LEVEL - 1)) || ENAME, 16) AS TREE FROM EMP START WITH ENAME = 'JONES' CONNECT BY PRIOR EMPNO = MGR ORDER SIBLINGS BY ENAME;
```

```text
     LEVEL TREE
---------- ----------------------------------------------------------------
         1 JONES
         2   FORD
         3     SMITH
         2   SCOTT
         3     ADAMS
```

- LEVEL 은 테이블 전체 기준이 아니라 **START WITH 로 정한 루트** 기준이다. JONES 가 1 이 된다.

## 역방향 — 아래에서 위로

PRIOR 의 위치를 바꾸면 방향이 뒤집힌다. `PRIOR MGR = EMPNO` 는 "직전 행의 MGR 을 EMPNO 로 가진 행", 즉 관리자가 다음이다.

```sql
SELECT LEVEL, ENAME, MGR FROM EMP START WITH ENAME = 'SMITH' CONNECT BY PRIOR MGR = EMPNO;
```

```text
     LEVEL ENAME             MGR
---------- ---------- ----------
         1 SMITH            7902
         2 FORD             7566
         3 JONES            7839
         4 KING
```

- 위로 가는 길은 한 줄뿐이라 행 순서가 하나로 정해진다.
- 출발점 SMITH 가 LEVEL 1 이다. 역방향에서는 LEVEL 이 클수록 윗사람이다.

| 쓰는 법 | PRIOR 쪽 | 방향 | 읽는 법 |
|--------|---------|-----|-------|
| `PRIOR EMPNO = MGR` | 부모의 EMPNO | 순방향 (부모 → 자식) | 내 번호를 관리자로 둔 사람을 찾는다 |
| `MGR = PRIOR EMPNO` | 위와 같다 | 순방향 | 등호 양쪽을 바꿔도 뜻은 같다 |
| `PRIOR MGR = EMPNO` | 자식의 MGR | 역방향 (자식 → 부모) | 내 관리자를 찾는다 |
| `EMPNO = PRIOR MGR` | 위와 같다 | 역방향 | |

- 방향을 정하는 것은 등호의 좌우가 아니라 **PRIOR 가 어느 열에 붙었는가**다. "PRIOR 자식 열 = 부모 열"이면 역방향, "PRIOR 부모 열 = 자식 열"이면 순방향이다.
- START WITH 와 방향이 맞지 않으면 트리가 자라지 않는다. `START WITH MGR IS NULL CONNECT BY PRIOR MGR = EMPNO` 는 KING 의 MGR 이 NULL 이라 KING 1행만 나온다.

> ⚠️ **함정**: `PRIOR EMPNO = MGR` 과 `EMPNO = PRIOR MGR` 은 등호 왼쪽이 둘 다 EMPNO 처럼 보이지만 방향이 반대다. PRIOR 가 붙은 열이 EMPNO 면 순방향, MGR 이면 역방향이다.

## ORDER SIBLINGS BY

계층형 질의에 일반 ORDER BY 를 쓰면 정렬은 되지만 부모 아래 자식이 오는 모양이 깨진다.

```sql
SELECT ENAME, LEVEL FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR ORDER BY ENAME FETCH FIRST 3 ROWS ONLY;
```

```text
ENAME           LEVEL
---------- ----------
ADAMS               4
ALLEN               3
BLAKE               2
```

- 이름순이 되면서 LEVEL 4 의 ADAMS 가 맨 앞에 왔다. 누가 누구의 부하인지 화면에서 읽을 수 없다.
- `ORDER SIBLINGS BY ENAME` 은 트리 모양을 지킨 채 **같은 부모를 둔 형제끼리만** 정렬한다. 위 순방향 예제에서 BLAKE·CLARK·JONES 와 ALLEN·JAMES·MARTIN·TURNER·WARD 가 각각 이름순인 이유다.
- ORDER SIBLINGS BY 가 없으면 형제의 순서는 보장되지 않는다. 이 노트의 트리 예제에 모두 붙인 이유다.

## 경로와 루트, 잎 노드

| 이름 | 돌려주는 값 |
|------|----------|
| `SYS_CONNECT_BY_PATH(열, '구분자')` | 루트부터 현재 행까지의 값을 구분자로 이은 문자열 |
| `CONNECT_BY_ROOT 열` | 현재 행이 속한 트리의 루트 행 값 (함수가 아니라 연산자라 괄호가 없어도 된다) |
| `CONNECT_BY_ISLEAF` | 자식이 없으면 1, 있으면 0 |

```sql
SELECT ENAME, CONNECT_BY_ROOT ENAME AS ROOT, CONNECT_BY_ISLEAF AS LEAF, SUBSTR(SYS_CONNECT_BY_PATH(ENAME, '/'), 1, 25) AS PATH FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR ORDER SIBLINGS BY ENAME;
```

```text
ENAME      ROOT             LEAF PATH
---------- ---------- ---------- ----------------------------------------------------------------------------------------------------
KING       KING                0 /KING
BLAKE      KING                0 /KING/BLAKE
ALLEN      KING                1 /KING/BLAKE/ALLEN
JAMES      KING                1 /KING/BLAKE/JAMES
MARTIN     KING                1 /KING/BLAKE/MARTIN
TURNER     KING                1 /KING/BLAKE/TURNER
WARD       KING                1 /KING/BLAKE/WARD
CLARK      KING                0 /KING/CLARK
MILLER     KING                1 /KING/CLARK/MILLER
JONES      KING                0 /KING/JONES
FORD       KING                0 /KING/JONES/FORD
SMITH      KING                1 /KING/JONES/FORD/SMITH
SCOTT      KING                0 /KING/JONES/SCOTT
ADAMS      KING                1 /KING/JONES/SCOTT/ADAMS
```

- 경로는 구분자로 **시작**한다. `/KING/JONES/SCOTT/ADAMS` 이지 `KING/JONES/…` 가 아니다.
- SUBSTR 는 열 폭을 줄이려고 붙였다. 경로 내용은 그대로다.
- LEAF 가 1 인 사원은 8명이다. 부하가 없는 사원이다.

루트가 여럿이면 CONNECT_BY_ROOT 가 쓸모 있다. 관리자(MANAGER) 셋을 루트로 두고 잎 노드만 남긴다.

```sql
SELECT ENAME, CONNECT_BY_ROOT ENAME AS ROOT FROM EMP WHERE CONNECT_BY_ISLEAF = 1 START WITH JOB = 'MANAGER' CONNECT BY PRIOR EMPNO = MGR ORDER SIBLINGS BY ENAME;
```

```text
ENAME      ROOT
---------- ----------
ALLEN      BLAKE
JAMES      BLAKE
MARTIN     BLAKE
TURNER     BLAKE
WARD       BLAKE
MILLER     CLARK
SMITH      JONES
ADAMS      JONES
```

- 트리 셋의 루트 순서도 ORDER SIBLINGS BY 가 정한다. 루트끼리도 형제로 본다.

## WHERE 와 CONNECT BY — 조건 위치가 결과를 바꾼다

JONES 를 빼는 조건을 두 곳에 넣어 비교한다. 먼저 WHERE 에 넣는다.

```sql
SELECT LEVEL, RPAD(LPAD(' ', 2 * (LEVEL - 1)) || ENAME, 16) AS TREE FROM EMP WHERE ENAME <> 'JONES' START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR ORDER SIBLINGS BY ENAME;
```

```text
     LEVEL TREE
---------- ----------------------------------------------------------------
         1 KING
         2   BLAKE
         3     ALLEN
         3     JAMES
         3     MARTIN
         3     TURNER
         3     WARD
         2   CLARK
         3     MILLER
         3     FORD
         4       SMITH
         3     SCOTT
         4       ADAMS
```

이번에는 CONNECT BY 에 AND 로 붙인다.

```sql
SELECT LEVEL, RPAD(LPAD(' ', 2 * (LEVEL - 1)) || ENAME, 16) AS TREE FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR AND ENAME <> 'JONES' ORDER SIBLINGS BY ENAME;
```

```text
     LEVEL TREE
---------- ----------------------------------------------------------------
         1 KING
         2   BLAKE
         3     ALLEN
         3     JAMES
         3     MARTIN
         3     TURNER
         3     WARD
         2   CLARK
         3     MILLER
```

| 조건 위치 | 처리 시점 | JONES 의 부하 FORD·SCOTT·SMITH·ADAMS | 결과 행 수 |
|---------|---------|------------------------------|--------:|
| WHERE | 트리를 다 만든 뒤 | 남는다 (LEVEL 도 그대로 3, 4) | 13 |
| CONNECT BY | 트리를 만드는 중 | JONES 로 내려가는 길이 끊겨 함께 빠진다 | 9 |

- WHERE 는 **결과 거르기**다. JONES 한 행만 화면에서 빠지고, 그 부하의 LEVEL 은 바뀌지 않는다.
- CONNECT BY 의 조건은 **가지치기**다. JONES 로 이어지지 않으니 그 아래 가지 전체가 사라진다.
- `LEVEL <= 2` 처럼 깊이를 제한할 때도 같다. WHERE 에 두면 끝까지 만든 뒤 거르고, CONNECT BY 에 두면 3단계로 내려가지 않는다. 결과는 둘 다 KING·BLAKE·CLARK·JONES 4행이다.
- START WITH 의 조건은 루트를 고르는 데만 쓴다. 자식 행에는 적용되지 않는다.

## 순환 — NOCYCLE · CONNECT_BY_ISCYCLE

EMP 에는 없지만, KING 의 MGR 에 SMITH 의 번호가 들어 있다고 가정하면 SMITH → FORD → JONES → KING → SMITH … 로 끝없이 돈다.

- 이런 순환을 만나면 Oracle 은 ORA-01436(CONNECT BY loop in user data) 오류를 낸다.
- `CONNECT BY NOCYCLE PRIOR EMPNO = MGR` 처럼 NOCYCLE 을 쓰면 이미 지나온 행으로 돌아가는 연결을 끊고 결과를 낸다.
- `CONNECT_BY_ISCYCLE` 은 NOCYCLE 과 함께 쓰는 의사 열이다. 현재 행의 자식이 조상이기도 하면 1, 아니면 0 이다.

> 내일은 같은 EMP 를 별칭 둘로 조인해 사원과 관리자를 한 행에 놓는 셀프 조인을 다룬다.

## 📖 용어

- **계층형 질의** : `START WITH … CONNECT BY` 로 한 테이블 안의 부모-자식 관계를 따라가며 행을 뽑는 Oracle 문법.
- **루트 노드** : 트리의 출발점. START WITH 조건에 맞는 행이고 LEVEL 이 1 이다.
- **잎 노드(leaf)** : 자식이 없는 행. CONNECT_BY_ISLEAF 가 1 이다.
- **PRIOR** : CONNECT BY 에서 "직전에 찾은 행의" 열을 가리키는 연산자. 붙은 위치가 방향을 정한다.
- **순방향 / 역방향** : 부모에서 자식으로 내려가는 전개 / 자식에서 부모로 올라가는 전개.
- **LEVEL** : 계층형 질의에서 루트를 1 로 하는 깊이 값을 주는 의사 열.
- **ORDER SIBLINGS BY** : 트리 모양을 유지하고 같은 부모의 형제끼리만 정렬하는 절.
- **가지치기** : CONNECT BY 조건으로 특정 행과 그 아래 가지를 트리에서 빼는 것. WHERE 의 결과 거르기와 다르다.

## 📝 연습 문제

**문제 1.** `SELECT LEVEL, ENAME FROM EMP START WITH ENAME = 'SMITH' CONNECT BY PRIOR MGR = EMPNO;` 에서 LEVEL 이 3 인 사원은? (SMITH 의 관리자는 FORD, FORD 의 관리자는 JONES, JONES 의 관리자는 KING 이다)

A) JONES  
B) FORD  
C) KING  
D) SCOTT  

**정답: A**  
해설: `PRIOR MGR = EMPNO` 는 직전 행의 관리자를 찾는 역방향 전개다. SMITH 1, FORD 2, JONES 3, KING 4 다. FORD 는 LEVEL 2, KING 은 LEVEL 4 다. SCOTT 은 SMITH 의 관리자 줄에 없어 결과에 나오지 않는다.

---

**문제 2.** `SELECT ENAME FROM EMP START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR AND ENAME <> 'JONES';` 의 결과 행 수는? (JONES 아래에는 FORD·SCOTT·SMITH·ADAMS 4명이 있고, EMP 는 14명이다)

A) 13  
B) 14  
C) 9  
D) 5  

**정답: C**  
해설: CONNECT BY 의 조건은 가지치기라 JONES 와 그 아래 4명이 함께 빠진다. 14 − 5 = 9 행이다. 13 은 같은 조건을 WHERE 에 넣어 JONES 한 행만 뺐을 때의 결과다. 14 는 조건이 없을 때이고, 5 는 빠진 행의 수다.

---

**문제 3.** `SELECT COUNT(*) FROM EMP WHERE CONNECT_BY_ISLEAF = 1 START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR;` 의 결과는? (부하가 있는 사원은 KING·BLAKE·CLARK·JONES·FORD·SCOTT 6명이다)

A) 6  
B) 8  
C) 4  
D) 1  

**정답: B**  
해설: CONNECT_BY_ISLEAF 는 자식이 없는 행에서 1 이다. 14명 중 부하가 있는 6명을 빼면 8명이다. 6 은 자식이 있는(LEAF 가 0 인) 행의 수다. 4 는 LEVEL 의 최댓값이고, 1 은 루트 KING 한 명이다.

---

**문제 4.** 계층형 질의의 `ORDER SIBLINGS BY ENAME` 에 대한 설명으로 옳은 것은?

A) 계층과 관계없이 전체 결과를 ENAME 순으로 정렬한다  
B) 루트 행끼리만 정렬하고 나머지 순서는 그대로 둔다  
C) LEVEL 순으로 먼저 정렬한 뒤 ENAME 으로 정렬한다  
D) 부모-자식 순서를 유지하며 같은 부모를 둔 형제끼리 ENAME 순으로 정렬한다  

**정답: D**  
해설: ORDER SIBLINGS BY 는 트리 모양을 지키고 형제 사이의 순서만 정한다. A 는 일반 ORDER BY 의 동작이라 트리 모양이 깨진다. 루트끼리도 형제로 보지만 루트만 정렬하는 것은 아니라 B 는 틀리다. C 는 `ORDER BY LEVEL, ENAME` 의 동작이다.

---

**문제 5.** `START WITH MGR IS NULL CONNECT BY PRIOR EMPNO = MGR` 로 전개할 때 ADAMS 행의 `SYS_CONNECT_BY_PATH(ENAME, '/')` 값은? (ADAMS 의 관리자는 SCOTT, SCOTT 의 관리자는 JONES, JONES 의 관리자는 KING 이다)

A) /ADAMS/SCOTT/JONES/KING  
B) /KING/SCOTT/ADAMS  
C) /KING/JONES/SCOTT/ADAMS  
D) KING/JONES/SCOTT/ADAMS  

**정답: C**  
해설: SYS_CONNECT_BY_PATH 는 루트부터 현재 행까지 값을 구분자로 이으며, 각 값 앞에 구분자를 붙여 `/` 로 시작한다. A 는 역방향 순서라 순방향 전개의 경로가 아니다. B 는 중간의 JONES 가 빠졌다. D 는 맨 앞 구분자가 없다.
