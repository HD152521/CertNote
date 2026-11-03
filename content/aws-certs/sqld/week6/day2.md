# Day 2 - 집계·행 순서 윈도우 함수

## 📌 핵심 정리

- `SUM(SAL) OVER (PARTITION BY DEPTNO)` 는 부서 합계를 그 부서의 모든 행에 붙인다. OVER 안에 ORDER BY 가 없으면 파티션 전체가 계산 범위다.
- OVER 안에 ORDER BY 를 주면 기본 범위가 `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` 가 되어 **누적 합**이 된다. RANGE 라서 동점 행은 함께 더해진다.
- ROWS 는 물리적인 행 수로, RANGE 는 정렬 값의 범위로 창을 잡는다. 동점을 한 행씩 나누려면 ROWS 를 쓴다.
- `LAG`·`LEAD(열, 오프셋, 기본값)` 은 앞뒤 행 값을 가져온다. 없는 행이면 NULL, 기본값을 주면 그 값이다.
- `LAST_VALUE` 는 기본 범위가 현재 행까지라 현재 행 값을 돌려준다. 파티션 끝 값을 원하면 `UNBOUNDED FOLLOWING` 까지 넓힌다.

## 집계 함수에 OVER 를 붙이면

부서 합계와 각 사원의 급여를 한 화면에 놓으려면 GROUP BY 로는 부족하다. GROUP BY 는 부서마다 한 행만 남기기 때문이다. 집계 함수에 OVER 를 붙이면 행은 그대로 두고 집계 값만 옆에 붙는다.

```sql
SELECT DEPTNO, ENAME, SAL, SUM(SAL) OVER (PARTITION BY DEPTNO) AS DEPT_SUM, ROUND(AVG(SAL) OVER (PARTITION BY DEPTNO)) AS DEPT_AVG, COUNT(*) OVER () AS CNT FROM EMP WHERE DEPTNO IN (10, 20) ORDER BY DEPTNO, ENAME;
```

```text
    DEPTNO ENAME             SAL   DEPT_SUM   DEPT_AVG        CNT
---------- ---------- ---------- ---------- ---------- ----------
        10 CLARK            2450       8750       2917          8
        10 KING             5000       8750       2917          8
        10 MILLER           1300       8750       2917          8
        20 ADAMS            1100      10875       2175          8
        20 FORD             3000      10875       2175          8
        20 JONES            2975      10875       2175          8
        20 SCOTT            3000      10875       2175          8
        20 SMITH             800      10875       2175          8
```

- `OVER ()` 는 WHERE 를 통과한 행 전체를 한 파티션으로 본다. CNT 가 14 가 아니라 8 인 이유다.
- SUM·AVG·COUNT·MAX·MIN 모두 같은 방식으로 쓴다. 순위 함수와 달리 OVER 안을 비워도 된다.
- 붙인 값으로 바로 계산할 수 있다. `SAL - AVG(SAL) OVER (PARTITION BY DEPTNO)` 는 부서 평균과의 차이다.

- 30번 평균은 1566.66… 이라 ALLEN(1600)의 차이는 33, JAMES(950)는 −617 이다. W5 에서는 부서 평균을 상관 서브쿼리로 구했다. 윈도우 함수는 테이블을 한 번만 읽고 같은 결과를 낸다.

이 집계형도 WHERE 에는 쓸 수 없다. 다만 오류 번호가 순위 함수와 다르다.

```sql
SELECT ENAME, SAL FROM EMP WHERE SAL > AVG(SAL) OVER ();
```

```text
SELECT ENAME, SAL FROM EMP WHERE SAL > AVG(SAL) OVER ()
                                       *
ERROR at line 1:
ORA-00934: group function is not allowed here
```

- 실습 컨테이너(23ai)는 집계 함수 이름에서 먼저 걸려 ORA-00934 를 냈다. 어느 쪽이든 WHERE 에 쓸 수 없다는 결론은 같다. 인라인 뷰로 감싸 거른다.

## 누적 합 — ORDER BY 를 넣는 순간

OVER 안에 ORDER BY 를 넣으면 같은 SUM 이 전혀 다른 값을 낸다. 30번 부서를 급여 오름차순으로 본다.

```sql
SELECT ENAME, SAL, SUM(SAL) OVER (ORDER BY SAL, ENAME) AS CUM FROM EMP WHERE DEPTNO = 30 ORDER BY SAL, ENAME;
```

```text
ENAME             SAL        CUM
---------- ---------- ----------
JAMES             950        950
MARTIN           1250       2200
WARD             1250       3450
TURNER           1500       4950
ALLEN            1600       6550
BLAKE            2850       9400
```

- 파티션 첫 행부터 현재 행까지 더한 값, 즉 누적 합이다. 마지막 행은 부서 합계 9400 이다.
- ORDER BY 가 있을 때의 기본 범위는 다음과 같다. 명시하지 않아도 이 절이 붙은 것으로 본다.

```text
RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
```

| OVER 안 | 계산 범위 | SUM 의 의미 |
|---------|---------|-----------|
| 비어 있음 / PARTITION BY 만 | 파티션 전체 | 파티션 합계 |
| ORDER BY 있음, 윈도우 절 없음 | 처음 ~ 현재 행 (RANGE) | 누적 합 |
| ORDER BY + 윈도우 절 | 적어 준 범위 | 그 범위의 합 |

## RANGE 의 함정 — 동점은 같이 더한다

위 예제는 `ORDER BY SAL, ENAME` 으로 동점을 갈랐다. `ORDER BY SAL` 만 쓰면 MARTIN·WARD(1250)의 누적 합이 같아진다.

```sql
SELECT ENAME, SAL, SUM(SAL) OVER (ORDER BY SAL) AS RANGE_SUM, SUM(SAL) OVER (ORDER BY SAL, ENAME ROWS UNBOUNDED PRECEDING) AS ROWS_SUM FROM EMP WHERE DEPTNO = 30 ORDER BY SAL, ENAME;
```

```text
ENAME             SAL  RANGE_SUM   ROWS_SUM
---------- ---------- ---------- ----------
JAMES             950        950        950
MARTIN           1250       3450       2200
WARD             1250       3450       3450
TURNER           1500       4950       4950
ALLEN            1600       6550       6550
BLAKE            2850       9400       9400
```

- RANGE 의 CURRENT ROW 는 "현재 행"이 아니라 **현재 행과 정렬 값이 같은 행 전부**다. MARTIN 의 창에 WARD 가 함께 들어가 950 + 1250 + 1250 = 3450 이 된다.
- ROWS 는 물리적인 행 하나하나를 센다. MARTIN 까지 2200, WARD 까지 3450 이다.
- `ROWS UNBOUNDED PRECEDING` 은 `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` 를 줄인 꼴이다.

> ⚠️ **함정**: "ORDER BY 만 주면 한 행씩 더하는 누적 합"이라고 외우면 틀린다. 기본은 RANGE 라서 정렬 값이 같은 행은 같은 누적 값을 받는다. 동점이 있는 보기에서는 동점 행의 값을 먼저 확인한다.

## ROWS 와 RANGE, 윈도우 절 읽기

윈도우 절은 `ROWS|RANGE BETWEEN 시작 AND 끝` 모양이다.

| 경계 | 뜻 |
|------|----|
| `UNBOUNDED PRECEDING` | 파티션 첫 행 |
| `n PRECEDING` | 현재 행에서 n 앞 (RANGE 면 정렬 값 − n) |
| `CURRENT ROW` | 현재 행 (RANGE 면 같은 값의 행 전부) |
| `n FOLLOWING` | 현재 행에서 n 뒤 (RANGE 면 정렬 값 + n) |
| `UNBOUNDED FOLLOWING` | 파티션 마지막 행 |

- `BETWEEN` 을 생략하고 시작만 쓰면 끝은 CURRENT ROW 다.
- 시작이 끝보다 뒤에 오면 안 된다. `BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING` 은 "현재 행부터 끝까지"의 합이고, 순서를 뒤집으면 ORA-30486 이다.

### 앞뒤 한 행씩 — 이동 평균

`ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING` 은 바로 앞 행·현재 행·바로 뒤 행, 최대 세 행이다.

```sql
SELECT ENAME, SAL, AVG(SAL) OVER (ORDER BY SAL, ENAME ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS MOV_AVG, SUM(SAL) OVER (ORDER BY SAL, ENAME ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS MOV_SUM FROM EMP WHERE DEPTNO = 30 ORDER BY SAL, ENAME;
```

```text
ENAME             SAL    MOV_AVG    MOV_SUM
---------- ---------- ---------- ----------
JAMES             950       1100       2200
MARTIN           1250       1150       3450
WARD             1250 1333.33333       4000
TURNER           1500       1450       4350
ALLEN            1600 1983.33333       5950
BLAKE            2850       2225       4450
```

- 첫 행 JAMES 는 앞 행이 없어 두 행(950 + 1250)만 더한다. 평균도 2로 나눈 1100 이다.
- 마지막 BLAKE 도 뒤 행이 없어 ALLEN 과 BLAKE 두 행이다.

### RANGE 에 숫자를 주면 값의 범위다

`RANGE BETWEEN 150 PRECEDING AND 150 FOLLOWING` 은 "현재 급여 ±150 안에 드는 행"이다. 행 개수와 관계없다.

```sql
SELECT ENAME, SAL, COUNT(*) OVER (ORDER BY SAL RANGE BETWEEN 150 PRECEDING AND 150 FOLLOWING) AS NEAR_CNT FROM EMP WHERE DEPTNO = 30 ORDER BY SAL, ENAME;
```

```text
ENAME             SAL   NEAR_CNT
---------- ---------- ----------
JAMES             950          1
MARTIN           1250          2
WARD             1250          2
TURNER           1500          2
ALLEN            1600          2
BLAKE            2850          1
```

- TURNER(1500)의 범위는 1350~1650 이라 TURNER·ALLEN 두 명이다.
- RANGE 에 숫자를 쓰려면 ORDER BY 열이 숫자나 날짜 하나여야 한다. `ORDER BY SAL, ENAME` 처럼 둘을 주면 ORA-30486 이다.

## LAG · LEAD — 앞뒤 행 값

`LAG(열)` 은 정렬 순서상 바로 앞 행, `LEAD(열)` 은 바로 뒤 행의 값을 가져온다. 30번 부서를 입사일 순으로 본다.

```sql
SELECT ENAME, HIREDATE, SAL, LAG(SAL) OVER (ORDER BY HIREDATE) AS PREV_SAL, LEAD(SAL) OVER (ORDER BY HIREDATE) AS NEXT_SAL FROM EMP WHERE DEPTNO = 30 ORDER BY HIREDATE;
```

```text
ENAME      HIREDATE          SAL   PREV_SAL   NEXT_SAL
---------- ---------- ---------- ---------- ----------
ALLEN      1981-02-20       1600                  1250
WARD       1981-02-22       1250       1600       2850
BLAKE      1981-05-01       2850       1250       1500
TURNER     1981-09-08       1500       2850       1250
MARTIN     1981-09-28       1250       1500        950
JAMES      1981-12-03        950       1250
```

- 첫 행은 앞 행이 없어 PREV_SAL 이 NULL, 마지막 행은 NEXT_SAL 이 NULL 이다.
- 문법은 `LAG(열, 오프셋, 기본값)` 이다. 오프셋 기본은 1, 기본값을 생략하면 NULL 이다.

```sql
SELECT ENAME, HIREDATE, SAL, LAG(SAL, 2) OVER (ORDER BY HIREDATE) AS LAG2, LAG(SAL, 2, 0) OVER (ORDER BY HIREDATE) AS LAG2_0, LEAD(ENAME, 1, 'NONE') OVER (ORDER BY HIREDATE) AS NEXT_EMP FROM EMP WHERE DEPTNO = 30 ORDER BY HIREDATE;
```

```text
ENAME      HIREDATE          SAL       LAG2     LAG2_0 NEXT_EMP
---------- ---------- ---------- ---------- ---------- ----------
ALLEN      1981-02-20       1600                     0 WARD
WARD       1981-02-22       1250                     0 BLAKE
BLAKE      1981-05-01       2850       1600       1600 TURNER
TURNER     1981-09-08       1500       1250       1250 MARTIN
MARTIN     1981-09-28       1250       2850       2850 JAMES
JAMES      1981-12-03        950       1500       1500 NONE
```

- `LAG(SAL, 2)` 는 두 행 앞이다. 앞쪽 두 행은 가져올 행이 없어 NULL 이다.
- 세 번째 인자 0 을 주면 NULL 대신 0 이 나온다. `NVL(LAG(SAL, 2), 0)` 과 같은 결과다.
- PARTITION BY 를 주면 파티션 경계를 넘지 않는다. 부서가 바뀌는 첫 행의 LAG 는 다시 NULL 이다. 입사일 순 `LAG(ENAME) OVER (PARTITION BY DEPTNO ORDER BY HIREDATE)` 에서 10번 첫 입사자 CLARK 과 20번 첫 입사자 SMITH 는 NULL 을 받는다.
- LAG·LEAD 는 ORDER BY 가 필수이고 윈도우 절을 받지 않는다. `LAG(SAL) OVER (ORDER BY SAL ROWS 1 PRECEDING)` 은 ORA-03097 이다.

## FIRST_VALUE · LAST_VALUE

FIRST_VALUE 는 창의 첫 행, LAST_VALUE 는 창의 마지막 행 값이다. 창의 범위가 결과를 정한다.

```sql
SELECT ENAME, SAL, FIRST_VALUE(ENAME) OVER (ORDER BY SAL DESC, ENAME) AS TOP_EMP, LAST_VALUE(ENAME) OVER (ORDER BY SAL DESC, ENAME) AS LAST_DEF, LAST_VALUE(ENAME) OVER (ORDER BY SAL DESC, ENAME ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS LAST_FULL FROM EMP WHERE DEPTNO = 30 ORDER BY SAL DESC, ENAME;
```

```text
ENAME             SAL TOP_EMP    LAST_DEF   LAST_FULL
---------- ---------- ---------- ---------- ----------
BLAKE            2850 BLAKE      BLAKE      JAMES
ALLEN            1600 BLAKE      ALLEN      JAMES
TURNER           1500 BLAKE      TURNER     JAMES
MARTIN           1250 BLAKE      MARTIN     JAMES
WARD             1250 BLAKE      WARD       JAMES
JAMES             950 BLAKE      JAMES      JAMES
```

- FIRST_VALUE 는 기본 범위(처음 ~ 현재 행)로도 첫 행이 늘 BLAKE 라 문제가 없다.
- LAST_VALUE 는 기본 범위의 끝이 현재 행이다. 그래서 LAST_DEF 는 자기 이름이 나온다.
- 파티션의 마지막 값(최저 급여자 JAMES)을 원하면 끝을 `UNBOUNDED FOLLOWING` 으로 넓힌다. LAST_FULL 이 그 결과다.

## 비율과 분포

| 함수 | 계산 | 범위 |
|------|-----|-----|
| `RATIO_TO_REPORT(열) OVER ()` | 값 / 파티션 합계 | 0 ~ 1 (양수 값 기준) |
| `PERCENT_RANK() OVER (ORDER BY …)` | (RANK − 1) / (행 수 − 1) | 0 ~ 1, 첫 행이 0 |
| `CUME_DIST() OVER (ORDER BY …)` | 현재 값 이하인 행 수 / 행 수 | 0 초과 ~ 1 |
| `NTILE(n) OVER (ORDER BY …)` | 행을 n 개 묶음으로 나눈 번호 | 1 ~ n |

```sql
SELECT ENAME, SAL, ROUND(RATIO_TO_REPORT(SAL) OVER (), 3) AS RATIO, ROUND(SAL / SUM(SAL) OVER (), 3) AS SAME FROM EMP WHERE DEPTNO = 30 ORDER BY SAL DESC, ENAME;
```

```text
ENAME             SAL      RATIO       SAME
---------- ---------- ---------- ----------
BLAKE            2850       .303       .303
ALLEN            1600        .17        .17
TURNER           1500        .16        .16
MARTIN           1250       .133       .133
WARD             1250       .133       .133
JAMES             950       .101       .101
```

- RATIO_TO_REPORT 는 `SAL / SUM(SAL) OVER ()` 와 같다. OVER 안에 ORDER BY 를 넣으면 ORA-30487 이다.

```sql
SELECT ENAME, SAL, RANK() OVER (ORDER BY SAL) AS RNK, PERCENT_RANK() OVER (ORDER BY SAL) AS PR, ROUND(CUME_DIST() OVER (ORDER BY SAL), 4) AS CD FROM EMP WHERE DEPTNO = 30 ORDER BY SAL, ENAME;
```

```text
ENAME             SAL        RNK         PR         CD
---------- ---------- ---------- ---------- ----------
JAMES             950          1          0      .1667
MARTIN           1250          2         .2         .5
WARD             1250          2         .2         .5
TURNER           1500          4         .6      .6667
ALLEN            1600          5         .8      .8333
BLAKE            2850          6          1          1
```

- TURNER 의 PERCENT_RANK 는 (4 − 1) / (6 − 1) = 0.6 이다.
- TURNER 의 CUME_DIST 는 1500 이하인 4명 / 6명 = 0.6667 이다. 동점 MARTIN·WARD 는 둘 다 3/6 = 0.5 다.
- PERCENT_RANK 는 첫 행이 늘 0 이고, CUME_DIST 는 첫 행도 0 보다 크다.

```sql
SELECT ENAME, SAL, NTILE(4) OVER (ORDER BY SAL DESC, ENAME) AS GRP FROM EMP ORDER BY SAL DESC, ENAME;
```

```text
ENAME             SAL        GRP
---------- ---------- ----------
KING             5000          1
FORD             3000          1
SCOTT            3000          1
JONES            2975          1
BLAKE            2850          2
CLARK            2450          2
ALLEN            1600          2
TURNER           1500          2
MILLER           1300          3
MARTIN           1250          3
WARD             1250          3
ADAMS            1100          4
JAMES             950          4
SMITH             800          4
```

- 14행을 4묶음으로 나누면 몫 3, 나머지 2 다. 나머지 2행은 앞 묶음부터 하나씩 더 받아 4, 4, 3, 3 이 된다.
- NTILE 은 동점을 보지 않는다. 행 수만 보고 자른다. 동점이 묶음 경계에 걸리면 같은 급여가 다른 묶음에 들어갈 수 있다.

> 내일은 ROWNUM 과 FETCH FIRST 로 상위 n 행만 남기는 Top N 쿼리를 다룬다.

## 📖 용어

- **집계 윈도우 함수** : SUM·AVG·COUNT·MAX·MIN 에 OVER 를 붙인 형태. 행을 줄이지 않고 집계 값을 붙인다.
- **윈도우 절** : `ROWS|RANGE BETWEEN … AND …`. 현재 행 기준으로 계산에 넣을 행의 범위를 정한다.
- **ROWS** : 물리적인 행 개수로 범위를 잡는다. 동점도 한 행씩 따로 센다.
- **RANGE** : 정렬 값의 범위로 창을 잡는다. 같은 값의 행은 한꺼번에 들어간다.
- **누적 합** : 첫 행부터 현재 행까지의 합. OVER 에 ORDER BY 만 주면 기본으로 이 모양이 된다.
- **LAG / LEAD** : 정렬 순서상 앞 / 뒤 n 번째 행의 값을 가져온다. 없으면 기본값(생략 시 NULL).
- **CUME_DIST** : 현재 값 이하인 행의 비율. 누적 분포라 부른다.
- **NTILE** : 정렬된 행을 n 개 묶음으로 나눠 묶음 번호를 붙인다. 나머지는 앞 묶음부터 하나씩 더 받는다.

## 📝 연습 문제

**문제 1.** 30번 부서의 급여는 950(JAMES), 1250(MARTIN), 1250(WARD), 1500(TURNER), 1600(ALLEN), 2850(BLAKE)이다. `SELECT ENAME, SUM(SAL) OVER (ORDER BY SAL) AS S FROM EMP WHERE DEPTNO = 30;` 에서 MARTIN 의 S 값은?

A) 2200  
B) 1250  
C) 3450  
D) 9400  

**정답: C**  
해설: ORDER BY 만 준 기본 범위는 `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` 다. RANGE 는 정렬 값이 같은 WARD 까지 창에 넣어 950 + 1250 + 1250 = 3450 이다. 2200 은 ROWS 로 한 행씩 더했을 때 MARTIN 이 앞에 온 경우의 값이다. 9400 은 ORDER BY 가 없을 때의 부서 합계다.

---

**문제 2.** 30번 부서를 입사일 순으로 보면 ALLEN 이 가장 먼저 입사했다. `SELECT ENAME, LAG(SAL, 1, 0) OVER (ORDER BY HIREDATE) AS P FROM EMP WHERE DEPTNO = 30;` 에서 ALLEN 의 P 는?

A) 0  
B) NULL  
C) 1250  
D) 1600  

**정답: A**  
해설: ALLEN 은 첫 행이라 앞 행이 없다. 세 번째 인자로 기본값 0 을 줬으므로 NULL 대신 0 이 나온다. NULL 은 기본값을 생략했을 때의 결과다. 1250 은 다음 행 WARD 의 급여로 LEAD 의 값이고, 1600 은 ALLEN 자신의 급여다.

---

**문제 3.** `SELECT ENAME, LAST_VALUE(ENAME) OVER (ORDER BY SAL DESC, ENAME) AS LV FROM EMP WHERE DEPTNO = 30;` 에서 ALLEN 행의 LV 는? (급여 내림차순: BLAKE, ALLEN, TURNER, MARTIN, WARD, JAMES)

A) JAMES  
B) BLAKE  
C) NULL  
D) ALLEN  

**정답: D**  
해설: 윈도우 절이 없고 ORDER BY 만 있으므로 범위는 첫 행부터 현재 행까지다. 창의 마지막 행이 현재 행 ALLEN 이다. JAMES 는 `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` 으로 넓혔을 때의 값이다. BLAKE 는 FIRST_VALUE 의 결과다.

---

**문제 4.** 14행에 `NTILE(4) OVER (ORDER BY SAL DESC, ENAME)` 을 적용했을 때 1~4번 묶음의 행 수는 차례로?

A) 4, 4, 4, 2  
B) 4, 4, 3, 3  
C) 3, 3, 4, 4  
D) 3, 3, 3, 5  

**정답: B**  
해설: 14 ÷ 4 는 몫 3, 나머지 2 다. 나머지 2행을 앞 묶음부터 하나씩 더 줘서 4, 4, 3, 3 이 된다. A 와 D 는 묶음 크기 차이가 2 이상이라 NTILE 의 분배가 아니다. C 는 나머지를 뒤 묶음에 준 경우다.

---

**문제 5.** 30번 부서 6명에게 `PERCENT_RANK() OVER (ORDER BY SAL)` 을 적용했다. TURNER(1500)는 RANK 기준 4위다. TURNER 의 값은?

A) 0.6  
B) 0.6667  
C) 0.5  
D) 0.8  

**정답: A**  
해설: PERCENT_RANK 는 (RANK − 1) / (행 수 − 1) 이라 (4 − 1) / (6 − 1) = 0.6 이다. 0.6667 은 1500 이하인 4명 / 6명으로 계산한 CUME_DIST 다. 0.5 는 MARTIN·WARD 의 CUME_DIST 이고, 0.8 은 5위 ALLEN 의 PERCENT_RANK 다.
