# Day 3 - 집합 연산자

## 📌 핵심 정리

- **UNION** 은 합집합(중복 제거), **UNION ALL** 은 중복까지 그대로 이어 붙인다. **INTERSECT** 는 교집합, **MINUS** 는 차집합이다. SQL Server 는 MINUS 대신 **EXCEPT** 를 쓴다.
- 위아래 SELECT 는 **열 개수**(ORA-01789)와 **자료형 계열**(ORA-01790)이 맞아야 한다.
- 결과의 열 이름은 **첫 번째 SELECT** 를 따른다. ORDER BY 는 **맨 끝에 한 번**만 쓰고, 첫 SELECT 의 열 이름·별칭이나 위치 번호로 가리킨다.
- UNION·INTERSECT·MINUS 는 중복을 없애려고 정렬이나 해시 비교를 한다. UNION ALL 은 그 단계가 없어 빠르다.
- 집합 연산자끼리는 우선순위가 같아 **위에서 아래로** 차례대로 계산한다. 순서를 바꾸려면 괄호를 쓴다.

## 두 결과를 위아래로 잇는다

조인이 두 테이블을 **옆으로** 붙인다면, 집합 연산자는 두 SELECT 결과를 **위아래로** 합친다. 행 단위로 합치고 빼고 겹치는 부분을 고른다. 오늘은 10번 부서와 20번 부서의 직무로 비교한다.

| 부서 | 직무(사원 수) |
|------|-------------|
| 10 | CLERK(1), MANAGER(1), PRESIDENT(1) — 3행 |
| 20 | ANALYST(2), CLERK(2), MANAGER(1) — 5행 |
| 30 | CLERK(1), MANAGER(1), SALESMAN(4) — 6행 |

| 연산자 | 뜻 | 중복 | 10번 ○ 20번 직무 |
|--------|----|------|---------------|
| `UNION` | 합집합 | 제거 | ANALYST, CLERK, MANAGER, PRESIDENT |
| `UNION ALL` | 합집합 | 유지 | 3 + 5 = 8행 |
| `INTERSECT` | 교집합 | 제거 | CLERK, MANAGER |
| `MINUS` | 차집합 | 제거 | 10 − 20 = PRESIDENT |

## UNION 과 UNION ALL

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION SELECT JOB FROM EMP WHERE DEPTNO = 20 ORDER BY JOB;
```

```text
JOB
---------
ANALYST
CLERK
MANAGER
PRESIDENT
```

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION ALL SELECT JOB FROM EMP WHERE DEPTNO = 20 ORDER BY JOB;
```

```text
JOB
---------
ANALYST
ANALYST
CLERK
CLERK
CLERK
MANAGER
MANAGER
PRESIDENT
```

- UNION 은 두 결과를 합친 뒤 같은 행을 하나만 남긴다. 4행이다.
- UNION ALL 은 10번 3행과 20번 5행을 그대로 이어 8행이다. 한쪽 SELECT 안의 중복(20번 ANALYST 2행)도 남는다.
- UNION 은 한쪽 SELECT 안에서 겹치는 행도 없앤다. 20번 하나만 UNION 해도 ANALYST 는 한 번 나온다.

### 중복을 판단할 때 NULL 은 같은 값으로 본다

WHERE 의 `=`에서 NULL 과 NULL 은 같지 않다. 집합 연산자의 중복 판단은 다르다. 두 NULL 을 같은 행으로 본다.

```sql
SELECT COUNT(*) FROM (SELECT COMM FROM EMP UNION SELECT COMM FROM EMP);
```

```text
  COUNT(*)
----------
         5
```

- COMM 의 값은 300·500·1400·0 과 NULL 10개다. UNION 뒤에는 네 값과 NULL 하나, 5행이 남는다.
- DISTINCT 도 같은 방식으로 NULL 을 하나로 묶는다.

### UNION ALL 이 빠른 이유

| 연산자 | 추가 작업 |
|--------|---------|
| `UNION ALL` | 없다. 결과를 이어 붙이기만 한다 |
| `UNION`, `INTERSECT`, `MINUS` | 중복을 찾기 위해 전체 결과를 정렬하거나 해시로 비교한다 |

- 결과가 클수록 정렬·비교 비용이 커진다. 두 집합이 서로 겹치지 않는다는 것을 알면(예: 부서 조건이 서로 배타적) UNION ALL 로 같은 결과를 더 싸게 얻는다.
- 예전 Oracle 은 정렬로 중복을 없애 UNION 결과가 정렬된 것처럼 보이기도 했다. 이는 보장된 동작이 아니다. 순서가 필요하면 ORDER BY 를 쓴다.

UNION ALL 은 상세 행 아래에 합계 행을 붙이는 데도 쓴다. 상수 `'합계'`가 ENAME 자리에 들어간다.

```sql
SELECT ENAME, SAL FROM EMP WHERE DEPTNO = 10 UNION ALL SELECT '합계', SUM(SAL) FROM EMP WHERE DEPTNO = 10;
```

```text
ENAME             SAL
---------- ----------
CLARK            2450
KING             5000
MILLER           1300
합계             8750
```

- 이 결과는 ORDER BY 가 없어 순서가 보장되지 않는다. 실습 컨테이너에서는 위 순서로 나왔다. 이렇게 소계·합계 행을 붙이는 작업을 SQL 이 대신하는 것이 Day 4 의 ROLLUP 이다.

## INTERSECT 와 MINUS

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 INTERSECT SELECT JOB FROM EMP WHERE DEPTNO = 20 ORDER BY JOB;
```

```text
JOB
---------
CLERK
MANAGER
```

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 MINUS SELECT JOB FROM EMP WHERE DEPTNO = 20 ORDER BY JOB;
```

```text
JOB
---------
PRESIDENT
```

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 20 MINUS SELECT JOB FROM EMP WHERE DEPTNO = 10 ORDER BY JOB;
```

```text
JOB
---------
ANALYST
```

- INTERSECT 는 양쪽 모두에 있는 직무만 남긴다. 순서를 바꿔도 결과가 같다.
- MINUS 는 **앞 결과에서 뒤 결과에 있는 것을 뺀다**. 순서를 바꾸면 결과가 달라진다. 10 − 20 은 PRESIDENT, 20 − 10 은 ANALYST 다.

MINUS 로 "사원이 없는 부서"를 구한다. 어제의 `NOT EXISTS`와 같은 질문을 집합으로 푼 것이다.

```sql
SELECT DEPTNO FROM DEPT MINUS SELECT DEPTNO FROM EMP;
```

```text
    DEPTNO
----------
        40
```

| DBMS | 차집합 키워드 |
|------|------------|
| Oracle | `MINUS` |
| SQL Server | `EXCEPT` |

- SQLD 는 Oracle 은 MINUS, SQL Server 는 EXCEPT 로 구분한다. 이 노트의 실습 컨테이너(Oracle Database 23ai)는 21c 부터 들어온 `EXCEPT`도 받아 MINUS 와 같은 결과를 낸다. 시험에서는 Oracle 차집합을 MINUS 로 본다.

## 열 개수와 자료형을 맞춘다

위아래로 합치려면 같은 위치의 열이 짝을 이뤄야 한다.

```sql
SELECT ENAME, SAL FROM EMP UNION SELECT DNAME FROM DEPT;
```

```text
SELECT ENAME, SAL FROM EMP UNION SELECT DNAME FROM DEPT
*
ERROR at line 1:
ORA-01789: query block has incorrect number of result columns
```

```sql
SELECT ENAME FROM EMP UNION SELECT DEPTNO FROM DEPT;
```

```text
SELECT ENAME FROM EMP UNION SELECT DEPTNO FROM DEPT
       *
ERROR at line 1:
ORA-01790: expression must have same datatype as corresponding expression
```

| 오류 | 원인 |
|------|------|
| ORA-01789 | 위아래 SELECT 의 열 개수가 다르다 |
| ORA-01790 | 같은 위치 열의 자료형 계열이 다르다(문자 ↔ 숫자) |

- 열 이름은 달라도 된다. ENAME 과 DNAME 은 둘 다 문자라 위아래로 합쳐진다.
- 열 수가 모자란 쪽은 `NULL`이나 상수로 자리를 채운다. `SELECT DEPTNO, NULL FROM DEPT`처럼 쓴다.

## 결과 열 이름은 첫 SELECT 가 정한다

```sql
SELECT EMPNO AS ID, ENAME AS NAME FROM EMP WHERE DEPTNO = 10 UNION SELECT DEPTNO, DNAME FROM DEPT ORDER BY ID;
```

```text
        ID NAME
---------- --------------
        10 ACCOUNTING
        20 RESEARCH
        30 SALES
        40 OPERATIONS
      7782 CLARK
      7839 KING
      7934 MILLER
```

- 열 제목은 첫 SELECT 의 별칭 ID·NAME 이다. 두 번째 SELECT 의 DEPTNO·DNAME 은 쓰이지 않는다.
- NAME 열 폭이 14 로 넓어진 것은 DNAME(14자)에 맞춘 것이다. 이름은 첫 SELECT 를 따르고, 자료형 길이는 양쪽을 담을 수 있게 정해진다.

ORDER BY 도 첫 SELECT 의 이름으로만 가리킨다. 두 번째 SELECT 의 별칭이나 열 이름을 쓰면 오류다.

```sql
SELECT ENAME FROM EMP WHERE DEPTNO = 10 UNION SELECT DNAME FROM DEPT WHERE DEPTNO = 10 ORDER BY DNAME;
```

```text
SELECT ENAME FROM EMP WHERE DEPTNO = 10 UNION SELECT DNAME FROM DEPT WHERE DEPTNO = 10 ORDER BY DNAME
                                                                                                *
ERROR at line 1:
ORA-00904: "DNAME": invalid identifier
```

```sql
SELECT ENAME FROM EMP WHERE DEPTNO = 10 UNION SELECT DNAME FROM DEPT WHERE DEPTNO = 10 ORDER BY ENAME;
```

```text
ENAME
--------------
ACCOUNTING
CLARK
KING
MILLER
```

- 위치 번호도 된다. `ORDER BY 2`는 두 번째 열 기준이다.

### ORDER BY 는 맨 끝에 한 번

ORDER BY 는 집합 연산이 끝난 **최종 결과**를 정렬한다. 중간 SELECT 뒤에 쓰면 문법 오류다.

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 ORDER BY JOB UNION SELECT JOB FROM EMP WHERE DEPTNO = 20;
```

```text
SELECT JOB FROM EMP WHERE DEPTNO = 10 ORDER BY JOB UNION SELECT JOB FROM EMP WHERE DEPTNO = 20
                                                   *
ERROR at line 1:
ORA-03048: SQL reserved word 'UNION' is not syntactically valid following '...DEPTNO = 10 ORDER BY JOB '
```

- 실습 컨테이너(23ai)는 ORA-03048 로 어느 단어가 문제인지 알려 준다. 이전 버전 Oracle 은 같은 문장에 ORA-00933(SQL command not properly ended)을 낸다. 어느 쪽이든 오류다.

> ⚠️ **함정**: 집합 연산 문장의 ORDER BY 는 마지막 SELECT 뒤에 한 번만 쓴다. 정렬 기준은 **첫 SELECT** 의 열 이름·별칭이나 위치 번호다. 마지막 SELECT 에만 있는 이름은 쓸 수 없다.

## 여러 집합 연산자를 섞으면

Oracle 의 집합 연산자는 우선순위가 같다. 위에서 아래로 차례대로 계산한다. 30번 부서 직무는 CLERK·MANAGER·SALESMAN 이다.

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION SELECT JOB FROM EMP WHERE DEPTNO = 20 MINUS SELECT JOB FROM EMP WHERE DEPTNO = 30 ORDER BY JOB;
```

```text
JOB
---------
ANALYST
PRESIDENT
```

- (10번 ∪ 20번) = {ANALYST, CLERK, MANAGER, PRESIDENT} 를 먼저 만들고, 30번 직무를 뺀다.

괄호로 MINUS 를 먼저 계산하게 하면 결과가 바뀐다.

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION (SELECT JOB FROM EMP WHERE DEPTNO = 20 MINUS SELECT JOB FROM EMP WHERE DEPTNO = 30) ORDER BY JOB;
```

```text
JOB
---------
ANALYST
CLERK
MANAGER
PRESIDENT
```

- 20번 − 30번 = {ANALYST} 를 먼저 구하고, 10번 직무 {CLERK, MANAGER, PRESIDENT} 와 합친다.
- 표준 SQL 은 INTERSECT 를 UNION·EXCEPT 보다 먼저 계산한다. Oracle 은 앞으로 이를 따를 수 있다고 공식 문서에 적고, 괄호로 순서를 밝혀 쓰기를 권한다.

> 내일은 GROUP BY 에 소계·총계 행을 더하는 ROLLUP 과 CUBE 를 다룬다.

## 📖 용어

- **집합 연산자** : 두 SELECT 결과를 행 단위로 합치거나 빼거나 겹치는 부분을 고르는 연산자.
- **UNION / UNION ALL** : 합집합. UNION 은 중복을 없애고, UNION ALL 은 중복을 그대로 둔다.
- **INTERSECT** : 양쪽 결과에 모두 있는 행만 남기는 교집합.
- **MINUS / EXCEPT** : 앞 결과에서 뒤 결과에 있는 행을 뺀 차집합. Oracle 은 MINUS, SQL Server 는 EXCEPT 다.
- **ORA-01789** : 집합 연산의 위아래 SELECT 열 개수가 다를 때의 오류.
- **ORA-01790** : 같은 위치 열의 자료형이 서로 맞지 않을 때의 오류.
- **중복 제거 비용** : UNION·INTERSECT·MINUS 가 같은 행을 찾으려고 하는 정렬·해시 작업. UNION ALL 에는 없다.

## 📝 연습 문제

**문제 1.** EMP 의 10번 부서는 3명, 20번 부서는 5명이며, 두 부서에 공통으로 있는 직무는 CLERK·MANAGER 다. 다음 SQL 의 결과는?

```sql
SELECT COUNT(*) FROM (SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION ALL SELECT JOB FROM EMP WHERE DEPTNO = 20);
```

A) 8  
B) 4  
C) 2  
D) 6  

**정답: A**  
해설: UNION ALL 은 중복을 없애지 않고 두 결과를 그대로 이어 붙인다. 3 + 5 = 8 행이다. 4 는 중복을 없앤 UNION 의 결과이고, 2 는 공통 직무만 남긴 INTERSECT 의 결과다.

---

**문제 2.** 다음 SQL 을 Oracle 에서 실행한 결과로 알맞은 것은?

```sql
SELECT ENAME FROM EMP WHERE DEPTNO = 10 UNION SELECT DNAME FROM DEPT WHERE DEPTNO = 10 ORDER BY DNAME;
```

A) DNAME 순으로 정렬된 4행이 나온다  
B) 열 제목이 DNAME 인 4행이 나온다  
C) ORA-00904 오류가 난다  
D) ORA-01790 오류가 난다  

**정답: C**  
해설: 집합 연산 결과의 열 이름은 첫 SELECT 를 따라 ENAME 이 된다. ORDER BY 도 그 이름으로만 가리킬 수 있어 DNAME 은 ORA-00904(invalid identifier)다. 열 제목도 DNAME 이 아니라 ENAME 이다. ENAME 과 DNAME 은 모두 문자형이라 ORA-01790 은 나지 않는다.

---

**문제 3.** DEPT 에는 10·20·30·40번 부서가 있고, EMP 에는 10·20·30번 부서 사원만 있다. 사원이 없는 부서 번호 40 만 구하려 할 때 빈칸에 들어갈 연산자는?

```sql
SELECT DEPTNO FROM DEPT ( 빈칸 ) SELECT DEPTNO FROM EMP;
```

A) UNION  
B) MINUS  
C) INTERSECT  
D) UNION ALL  

**정답: B**  
해설: MINUS 는 앞 결과에서 뒤 결과에 있는 행을 뺀다. DEPT 의 {10, 20, 30, 40} 에서 EMP 의 {10, 20, 30} 을 빼면 40 이 남는다. UNION 은 10·20·30·40 을, INTERSECT 는 10·20·30 을 돌려준다. UNION ALL 은 DEPT 4행과 EMP 14행을 이어 18행이다.

---

**문제 4.** 집합 연산자에 대한 설명으로 옳지 않은 것은?

A) 위아래 SELECT 의 열 개수가 같아야 한다  
B) 결과의 열 이름은 첫 번째 SELECT 의 열 이름이나 별칭을 따른다  
C) ORDER BY 는 마지막 SELECT 뒤에 한 번만 쓸 수 있다  
D) UNION ALL 은 중복을 확인하는 정렬을 하므로 UNION 보다 느리다  

**정답: D**  
해설: 중복을 없애기 위해 정렬·해시 비교를 하는 쪽은 UNION 이다. UNION ALL 은 결과를 이어 붙이기만 해서 그 비용이 없고 더 빠르다. 열 개수가 다르면 ORA-01789 가 나고, 결과 열 이름은 첫 SELECT 기준이며, ORDER BY 는 맨 끝에 한 번 쓴다.

---

**문제 5.** 10번 부서 직무는 CLERK·MANAGER·PRESIDENT, 20번은 ANALYST·CLERK·MANAGER, 30번은 CLERK·MANAGER·SALESMAN 이다. 다음 SQL 의 결과는?

```sql
SELECT JOB FROM EMP WHERE DEPTNO = 10 UNION SELECT JOB FROM EMP WHERE DEPTNO = 20 MINUS SELECT JOB FROM EMP WHERE DEPTNO = 30 ORDER BY JOB;
```

A) ANALYST, CLERK, MANAGER, PRESIDENT  
B) ANALYST, PRESIDENT  
C) PRESIDENT  
D) ANALYST  

**정답: B**  
해설: Oracle 의 집합 연산자는 우선순위가 같아 위에서 아래로 계산한다. 10번 ∪ 20번 = {ANALYST, CLERK, MANAGER, PRESIDENT} 에서 30번 직무 {CLERK, MANAGER, SALESMAN} 을 빼면 ANALYST·PRESIDENT 가 남는다. A 는 MINUS 를 괄호로 먼저 계산했을 때의 결과다. C 와 D 는 한 부서끼리만 뺀 결과다.
