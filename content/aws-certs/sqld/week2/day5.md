# Day 5 - Null 속성과 본질식별자 vs 인조식별자

## 📌 핵심 정리

- NULL은 **아직 정해지지 않았거나 모르는 값**이다. 0이나 공백과 다르다.
- NULL이 들어간 **산술 연산의 결과는 NULL**이다. `=`·`<>` 비교의 결과는 참도 거짓도 아닌 **UNKNOWN**이라 행이 걸러진다.
- NULL 여부는 **`IS NULL` / `IS NOT NULL`** 로만 확인한다.
- 집계 함수는 **NULL을 빼고** 계산한다. `COUNT(*)`만 행 자체를 센다. 그래서 `AVG(COMM)`과 `AVG(NVL(COMM, 0))`은 값이 다르다.
- 인조식별자는 키를 단순하게 만들지만, 본질식별자에 유일 제약을 따로 걸지 않으면 **중복 데이터**가 생기고, 걸면 **인덱스가 하나 더** 필요하다.

## NULL이란

모델링 단계에서 속성마다 "값이 비어도 되는가"를 정한다. 이것이 **Null 허용 여부**다.

- 주식별자는 존재성 때문에 NULL을 허용하지 않는다(Day 1).
- 일반 속성은 업무에 따라 다르다. EMP의 `COMM`(커미션)은 영업직에게만 있어 다른 직무는 NULL이다.
- NULL은 "값이 0"이라는 뜻이 아니다. **값이 없다는 상태**다. 0은 숫자 값이고, 공백 `' '`은 문자 값이다.

| 값 | 뜻 | 예 |
|----|-----|-----|
| `0` | 커미션이 **0원으로 정해졌다** | TURNER |
| `NULL` | 커미션이 **정해지지 않았다** | BLAKE, JAMES |

- Oracle은 길이 0인 문자열 `''`을 NULL로 취급한다. SQL Server는 `''`과 NULL을 구분한다. 2과목 DBMS 차이에서 다시 나온다.

## NULL과 산술 연산

NULL에 무엇을 더하거나 곱해도 결과는 NULL이다. 30번 부서로 확인했다.

```sql
SELECT ENAME, SAL, COMM, SAL + COMM AS TOTAL, SAL + NVL(COMM, 0) AS TOTAL2
FROM EMP WHERE DEPTNO = 30 ORDER BY EMPNO;
```

```text
ENAME             SAL       COMM      TOTAL     TOTAL2
---------- ---------- ---------- ---------- ----------
ALLEN            1600        300       1900       1900
WARD             1250        500       1750       1750
MARTIN           1250       1400       2650       2650
BLAKE            2850                             2850
TURNER           1500          0       1500       1500
JAMES             950                              950
```

- BLAKE와 JAMES는 `COMM`이 NULL이라 `SAL + COMM`도 NULL이 됐다.
- TURNER는 `COMM`이 0이라 정상적으로 1500이 나왔다. 0과 NULL의 차이가 결과에 그대로 드러난다.
- NULL을 0으로 바꿔 계산하려면 `NVL(COMM, 0)`을 쓴다. NULL 관련 함수는 3주차에서 다룬다.

## NULL과 비교 연산

NULL은 어떤 값과도 같거나 다르다고 말할 수 없다. 비교 결과는 **UNKNOWN**이고, WHERE 절은 참인 행만 남기므로 UNKNOWN 행은 빠진다.

```sql
SELECT COUNT(*) FROM EMP WHERE COMM = NULL;
SELECT COUNT(*) FROM EMP WHERE COMM IS NULL;
```

```text
  COUNT(*)
----------
         0

  COUNT(*)
----------
        10
```

- `COMM = NULL`은 오류 없이 실행되지만 결과는 **0건**이다. 모든 행에서 비교가 UNKNOWN이기 때문이다.
- NULL인 사원 10명을 찾으려면 `IS NULL`을 써야 한다.

`<>`도 마찬가지다. "커미션이 0이 아닌 사원"을 찾으면 NULL인 사원은 빠진다.

```sql
SELECT ENAME, COMM FROM EMP WHERE COMM <> 0 ORDER BY EMPNO;
```

```text
ENAME            COMM
---------- ----------
ALLEN             300
WARD              500
MARTIN           1400
```

> ⚠️ **함정**: `WHERE 칼럼 = NULL`은 문법 오류가 아니다. 실행은 되고 **결과가 0건**이다. "오류가 발생한다"는 보기와 "NULL인 행이 조회된다"는 보기 모두 틀린다.

## NULL과 집계 함수

집계 함수(`COUNT`, `SUM`, `AVG`, `MAX`, `MIN`)는 NULL을 **계산에서 제외**한다.

```sql
SELECT COUNT(*) AS CNT, COUNT(COMM) AS COMM_CNT, SUM(COMM) AS COMM_SUM,
       AVG(COMM) AS COMM_AVG, AVG(NVL(COMM, 0)) AS COMM_AVG2
FROM EMP;
```

```text
       CNT   COMM_CNT   COMM_SUM   COMM_AVG  COMM_AVG2
---------- ---------- ---------- ---------- ----------
        14          4       2200        550 157.142857
```

| 식 | 결과 | 계산 |
|----|------|------|
| `COUNT(*)` | 14 | 행 수 전체. NULL 여부와 무관 |
| `COUNT(COMM)` | 4 | NULL이 아닌 값만. 0인 TURNER는 포함 |
| `SUM(COMM)` | 2200 | 300 + 500 + 1400 + 0 |
| `AVG(COMM)` | 550 | 2200 ÷ **4** |
| `AVG(NVL(COMM, 0))` | 157.142857 | 2200 ÷ **14** |

- `AVG`의 분모는 NULL이 아닌 행 수다. "사원 전체의 평균 커미션"이 목적이면 NVL로 바꾼 뒤 평균을 내야 한다.
- 대상 값이 **모두 NULL**이면 `SUM`·`AVG`의 결과는 NULL이다. 0이 아니다.

부서별로 묶으면 마지막 규칙이 보인다.

```sql
SELECT DEPTNO, COUNT(*), COUNT(COMM), SUM(COMM), AVG(COMM)
FROM EMP GROUP BY DEPTNO ORDER BY DEPTNO;
```

```text
    DEPTNO   COUNT(*) COUNT(COMM)  SUM(COMM)  AVG(COMM)
---------- ---------- ----------- ---------- ----------
        10          3           0
        20          5           0
        30          6           4       2200        550
```

- 10번·20번 부서는 `COMM`이 전부 NULL이다. `COUNT(COMM)`은 0이지만 `SUM`·`AVG`는 NULL로 비어 있다.
- 모델링에서 이런 칼럼에 기본값 0을 둘지 정하는 이유다. 기본값을 두면 "정해지지 않음"과 "0원"을 구분할 수 없게 되니 업무 의미를 보고 고른다.

### 정렬에서의 NULL

```sql
SELECT ENAME, COMM FROM EMP WHERE DEPTNO = 30 ORDER BY COMM, ENAME;
```

```text
ENAME            COMM
---------- ----------
TURNER              0
ALLEN             300
WARD              500
MARTIN           1400
BLAKE
JAMES
```

- Oracle은 NULL을 **가장 큰 값**처럼 취급해 오름차순에서 맨 뒤에 둔다. SQL Server는 가장 작은 값처럼 취급해 맨 앞에 둔다.

## 본질식별자와 인조식별자

Day 1의 분류 중 "대체 여부"를 깊게 본다.

| 구분 | 뜻 | 예 |
|------|-----|-----|
| **본질식별자** | 업무에 의해 만들어지는 식별자. 교재에 따라 **원조식별자**라고도 한다 | 주문상품의 `(주문번호, 상품번호)` |
| **인조식별자** | 업무적으로는 없지만 본질식별자가 복잡해 **인위적으로 만든** 식별자 | 주문상품의 `주문상품ID`(일련번호) |

### 인조식별자의 장점

- 복합 식별자 여러 칼럼을 **칼럼 하나**로 대신한다. 키가 단순해진다.
- 자식 엔터티로 상속되는 칼럼이 줄어 **조인 조건이 짧아진다**.
- 본질식별자 값이 바뀌어도 인조식별자는 그대로라 참조가 안정적이다.

### 인조식별자의 단점 — 중복 데이터

일련번호를 PK로 쓰고 `(ORDER_NO, PROD_NO)`에는 아무 제약도 두지 않은 테이블을 만들어 같은 행을 두 번 넣었다.

```sql
CREATE TABLE T_ITEM_SURR (ITEM_ID NUMBER(6) PRIMARY KEY, ORDER_NO NUMBER(4), PROD_NO VARCHAR2(4), QTY NUMBER(3));
INSERT INTO T_ITEM_SURR VALUES (1, 1001, 'P1', 2);
INSERT INTO T_ITEM_SURR VALUES (2, 1001, 'P1', 2);
SELECT * FROM T_ITEM_SURR ORDER BY ITEM_ID;
```

```text
   ITEM_ID   ORDER_NO PROD        QTY
---------- ---------- ---- ----------
         1       1001 P1            2
         2       1001 P1            2
```

- 같은 주문의 같은 상품이 두 행으로 들어갔다. PK `ITEM_ID`가 다르므로 DBMS는 막지 않는다.
- 같은 데이터를 본질식별자 `(ORDER_NO, PROD_NO)`를 PK로 둔 테이블에 넣으면 두 번째 INSERT가 거부된다.

```sql
CREATE TABLE T_ITEM_NAT (ORDER_NO NUMBER(4), PROD_NO VARCHAR2(4), QTY NUMBER(3),
  CONSTRAINT T_ITEM_NAT_PK PRIMARY KEY (ORDER_NO, PROD_NO));
INSERT INTO T_ITEM_NAT VALUES (1001, 'P1', 2);
INSERT INTO T_ITEM_NAT VALUES (1001, 'P1', 2);
```

```text
ERROR at line 1:
ORA-00001: unique constraint (SCOTT.T_ITEM_NAT_PK) violated on table SCOTT.T_ITEM_NAT columns (ORDER_NO, PROD_NO)
```

실습 후 두 테이블은 `DROP TABLE … PURGE`로 지웠다.

### 인조식별자의 단점 — 불필요한 인덱스

- 중복을 막으려면 인조식별자 PK와 별도로 `(ORDER_NO, PROD_NO)`에 **UNIQUE 인덱스**를 하나 더 만들어야 한다.
- PK 인덱스 하나로 충분했을 테이블에 인덱스가 둘이 된다. 저장 공간이 늘고 **입력·수정·삭제 때마다 인덱스 두 개를 갱신**해야 한다.
- 실제 조회는 대개 주문번호로 하므로 `ITEM_ID` PK 인덱스는 잘 쓰이지 않는 인덱스가 될 수 있다.

| 비교 | 본질식별자 | 인조식별자 |
|------|----------|----------|
| 키 구성 | 업무 속성 조합, 복합이 되기 쉽다 | 단일 칼럼(일련번호 등) |
| 중복 방지 | PK가 직접 막는다 | 본질 칼럼에 **별도 제약이 없으면 중복 허용** |
| 인덱스 | PK 인덱스 하나 | PK + 본질 칼럼 UNIQUE, **둘이 될 수 있다** |
| 자식으로 상속 | 칼럼이 여러 개 내려간다 | 칼럼 하나만 내려간다 |

- 그래서 교재는 본질식별자가 복잡하지 않다면 본질식별자를 쓰고, 속성 수가 지나치게 많을 때 인조식별자를 검토하라고 정리한다.

> 다음 주부터는 2과목 SQL로 넘어가 SELECT 문과 함수를 다룬다.

## 📖 용어

- **NULL** : 값이 정해지지 않았거나 모르는 상태. 0이나 공백 문자와 다르다.
- **UNKNOWN** : NULL을 `=`·`<>`로 비교했을 때의 결과. WHERE 절에서는 거짓처럼 걸러진다.
- **IS NULL** : NULL 여부를 확인하는 비교 연산자. 부정형은 `IS NOT NULL`이다.
- **NVL** : NULL을 지정한 값으로 바꾸는 Oracle 함수.
- **Null 허용 여부** : 속성에 값이 비어도 되는지를 모델링 단계에서 정한 것.
- **본질식별자** : 업무에 의해 만들어진 식별자. 원조식별자라고도 한다.
- **인조식별자** : 업무에는 없지만 키를 단순하게 하려고 만든 식별자. 일련번호가 대표적이다.
- **UNIQUE 인덱스** : 칼럼 값의 중복을 막는 인덱스. 인조식별자를 쓸 때 본질 칼럼에 추가로 필요하다.

## 📝 연습 문제

**문제 1.** EMP 테이블의 COMM 값이 `300, 500, 1400, 0`이고 나머지 10명은 NULL이다. `SELECT AVG(COMM) FROM EMP;`의 결과는?

A) 550  
B) 157.142857  
C) NULL  
D) 0  

**정답: A**  
해설: 집계 함수는 NULL을 제외하고 계산한다. 합계 2200을 NULL이 아닌 4건으로 나누므로 550이다. 0은 NULL이 아니므로 분모에 포함된다. 14명 전체로 나누려면 `AVG(NVL(COMM, 0))`처럼 NULL을 먼저 0으로 바꿔야 한다.

---

**문제 2.** `SELECT COUNT(*) FROM EMP WHERE COMM = NULL;`을 실행한 결과에 대한 설명으로 옳은 것은? (COMM이 NULL인 행은 10건이다)

A) 문법 오류가 발생한다  
B) 10이 반환된다  
C) NULL이 반환된다  
D) 0이 반환된다  

**정답: D**  
해설: NULL을 `=`로 비교하면 결과가 UNKNOWN이라 어떤 행도 조건을 만족하지 않는다. 문법 오류는 아니므로 실행되고, `COUNT(*)`는 0을 돌려준다. NULL인 행을 찾으려면 `COMM IS NULL`을 쓴다.

---

**문제 3.** NULL에 대한 설명으로 가장 적절하지 않은 것은?

A) NULL과 숫자의 산술 연산 결과는 NULL이다  
B) NULL은 숫자 0과 같은 의미로 저장된다  
C) `COUNT(*)`는 NULL이 있는 행도 센다  
D) 대상 값이 모두 NULL이면 `SUM`의 결과는 NULL이다  

**정답: B**  
해설: NULL은 값이 정해지지 않은 상태이고, 0은 정해진 숫자 값이다. EMP에서 COMM이 0인 TURNER는 `SAL + COMM`이 정상 계산되지만 NULL인 BLAKE는 결과가 NULL이 된다.

---

**문제 4.** 본질식별자 `(주문번호, 상품번호)` 대신 일련번호 인조식별자를 주문상품의 주식별자로 쓰기로 했다. 이때 생길 수 있는 문제로 가장 알맞은 것은?

A) 자식 엔터티로 상속되는 칼럼 수가 늘어난다  
B) 조인 조건에 들어가는 칼럼 수가 늘어난다  
C) 본질 칼럼에 별도 제약이 없으면 같은 주문·상품이 중복 저장될 수 있다  
D) 주식별자의 존재성을 만족할 수 없다  

**정답: C**  
해설: 일련번호는 행마다 다르므로 같은 주문번호·상품번호 조합이 두 번 들어와도 PK가 막지 못한다. 이를 막으려면 본질 칼럼에 UNIQUE 인덱스를 추가해야 하고, 그러면 인덱스가 하나 더 생긴다. 상속 칼럼과 조인 조건이 줄어드는 것은 인조식별자의 장점이다.

---

**문제 5.** Oracle에서 `SELECT ENAME, COMM FROM EMP ORDER BY COMM;`을 실행했을 때 COMM이 NULL인 행의 위치는?

A) 맨 뒤에 온다  
B) 맨 앞에 온다  
C) 0인 행 바로 앞에 온다  
D) 결과에서 제외된다  

**정답: A**  
해설: Oracle은 정렬할 때 NULL을 가장 큰 값처럼 취급해 오름차순에서 맨 뒤에 둔다. SQL Server는 반대로 가장 작은 값처럼 취급해 맨 앞에 둔다. ORDER BY는 행을 걸러 내지 않으므로 NULL인 행도 결과에 남는다.
