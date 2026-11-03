# Day 2 - 문자·숫자 함수

## 📌 핵심 정리

- **단일행 함수**는 행마다 결과를 하나씩 낸다. **다중행 함수**(SUM, COUNT 등)는 여러 행을 묶어 하나를 낸다.
- `SUBSTR(문자열, 시작, 길이)` 의 시작 위치는 **1부터** 센다. 음수면 뒤에서부터 센다.
- `INSTR` 은 위치를, `LENGTH` 는 글자 수를 숫자로 돌려준다. 못 찾으면 `INSTR` 은 0 이다.
- `ROUND`·`TRUNC` 의 자릿수가 **음수면 정수부**에서 반올림·버림한다. `ROUND(1250, -2)` 는 1300 이다.
- 음수에서 `CEIL` 은 0 쪽으로, `FLOOR` 는 0 에서 먼 쪽으로 간다. `CEIL(-2.5) = -2`, `FLOOR(-2.5) = -3`.

## 함수는 두 부류다

SQLD 의 함수 문제는 먼저 "몇 행을 받아 몇 개를 돌려주는가"로 갈린다.

| 구분 | 입력 → 출력 | 예 | 쓰는 곳 |
|------|------|------|------|
| **단일행 함수** | 한 행 → 결과 하나 | `UPPER`, `SUBSTR`, `ROUND`, `NVL`, `TO_CHAR` | SELECT, WHERE, ORDER BY 등 |
| **다중행 함수** | 여러 행 → 결과 하나 | `SUM`, `AVG`, `COUNT`, `MAX`, `MIN` | SELECT, HAVING, ORDER BY |

- 단일행 함수는 문자·숫자·날짜·변환·NULL 관련 함수로 다시 나눈다. 오늘은 문자와 숫자, 내일은 날짜와 변환이다.
- 단일행 함수는 **중첩**할 수 있다. 안쪽 결과가 바깥 함수의 입력이 된다. `UPPER(SUBSTR(ENAME, 1, 3))` 처럼 쓴다.
- 다중행 함수(집계 함수)는 4주차에 자세히 다룬다.

두 부류를 한 SELECT 에 섞으면 행 수가 맞지 않아 오류가 난다. 14행짜리 결과와 1행짜리 결과를 나란히 놓을 수 없다.

```sql
SELECT UPPER(ENAME), SUM(SAL) FROM EMP;
```

```text
SELECT UPPER(ENAME), SUM(SAL) FROM EMP
             *
ERROR at line 1:
ORA-00937: not a single-group group function
```

## 대소문자 바꾸기

| 함수 | 하는 일 | 예 → 결과 |
|------|------|------|
| `LOWER` | 전부 소문자 | `'SQL Expert'` → `sql expert` |
| `UPPER` | 전부 대문자 | `'sql expert'` → `SQL EXPERT` |
| `INITCAP` | 단어 첫 글자만 대문자, 나머지 소문자 | `'sql EXPERT dev'` → `Sql Expert Dev` |

```sql
SELECT ENAME, LOWER(ENAME) LOW, INITCAP(ENAME) CAP FROM EMP WHERE DEPTNO = 10;
```

```text
ENAME      LOW        CAP
---------- ---------- ----------
CLARK      clark      Clark
KING       king       King
MILLER     miller     Miller
```

- 값 비교는 대소문자를 가린다. `WHERE ENAME = 'king'` 은 KING 을 못 찾는다. `WHERE LOWER(ENAME) = 'king'` 처럼 한쪽을 맞춰 비교한다.

## 잇고 자르기 — CONCAT, SUBSTR

`CONCAT(a, b)` 는 `a || b` 와 같다. 시험 기준으로 인자는 **두 개**다. 셋을 이으려면 중첩한다.

```sql
SELECT CONCAT(CONCAT(ENAME, ' - '), JOB) AS EJ FROM EMP WHERE DEPTNO = 10;
```

```text
EJ
----------------------
CLARK - MANAGER
KING - PRESIDENT
MILLER - CLERK
```

- 실습장의 Oracle 23ai 는 `CONCAT('A', 'B', 'C')` 처럼 인자 셋도 받는다(결과 `ABC`). 23ai 이전 Oracle 에서는 오류이므로, 문제에서는 두 개짜리로 본다.

`SUBSTR(문자열, 시작 위치, 길이)` 는 문자열 일부를 잘라 낸다.

| 호출 | 결과 | 읽는 법 |
|------|------|------|
| `SUBSTR('DATABASE', 3, 4)` | `TABA` | 3번째부터 4글자 |
| `SUBSTR('DATABASE', 5)` | `BASE` | 길이를 빼면 끝까지 |
| `SUBSTR('DATABASE', -4, 2)` | `BA` | 뒤에서 4번째(B)부터 2글자 |
| `SUBSTR('DATABASE', 0, 3)` | `DAT` | 0 은 1 로 취급 |

```sql
SELECT SUBSTR('DATABASE', 3, 4) A, SUBSTR('DATABASE', 5) B, SUBSTR('DATABASE', -4, 2) C, SUBSTR('DATABASE', 0, 3) D FROM DUAL;
```

```text
A    B    C  D
---- ---- -- ---
TABA BASE BA DAT
```

- 위치는 **1부터** 센다. 프로그래밍 언어의 0부터 세기와 다르다.
- 시작 위치가 문자열보다 길면(`SUBSTR('SQLD', 10)`) 오류가 아니라 NULL 이 나온다.

## 길이와 위치 — LENGTH, INSTR

`LENGTH` 는 글자 수를 센다. 공백도 한 글자다.

```sql
SELECT LENGTH('SQLD') A, LENGTH('SQL 개발자') B, LENGTHB('SQL 개발자') C, LENGTH(' ') D FROM DUAL;
```

```text
         A          B          C          D
---------- ---------- ---------- ----------
         4          7         13          1
```

- `LENGTHB` 는 바이트 수다. 이 DB 는 UTF-8 이라 한글 한 글자가 3바이트다(`3 + 1 + 3×3 = 13`). 바이트 수는 문자 집합 설정에 따라 다르다.
- `LENGTH('')` 는 0 이 아니라 NULL 이다. Oracle 은 빈 문자열을 NULL 로 다룬다(Day 4).

`INSTR(문자열, 찾을 문자열, 시작 위치, 몇 번째)` 는 찾은 **위치**를 돌려준다.

```sql
SELECT INSTR('DATABASE', 'A') A, INSTR('DATABASE', 'A', 3) B, INSTR('DATABASE', 'A', 1, 3) C, INSTR('DATABASE', 'Z') D FROM DUAL;
```

```text
         A          B          C          D
---------- ---------- ---------- ----------
         2          4          6          0
```

- `D-A-T-A-B-A-S-E` 에서 A 는 2·4·6번째에 있다. 3번째 위치부터 찾으면 4, 처음부터 세 번째 A 는 6 이다.
- 못 찾으면 **0** 이다. NULL 이나 -1 이 아니다.

## 다듬기 — TRIM, PAD, REPLACE

| 함수 | 하는 일 |
|------|------|
| `LTRIM(s [, 집합])` | 왼쪽에서 집합에 든 문자를 계속 지운다. 집합을 빼면 공백 |
| `RTRIM(s [, 집합])` | 오른쪽에서 같은 일 |
| `TRIM([LEADING\|TRAILING\|BOTH] 문자 FROM s)` | 양쪽(기본)에서 **한 글자**를 지운다 |
| `LPAD(s, n [, 채울 문자])` | 왼쪽을 채워 전체 길이를 n 으로. 채울 문자를 빼면 공백 |
| `RPAD(s, n [, 채울 문자])` | 오른쪽을 채운다 |
| `REPLACE(s, 찾을 것 [, 바꿀 것])` | 바꿀 것을 빼면 찾은 문자열을 지운다 |

```sql
SELECT '[' || LTRIM('  SQL  ') || ']' L, '[' || RTRIM('  SQL  ') || ']' R, '[' || TRIM('  SQL  ') || ']' T FROM DUAL;
```

```text
L       R       T
------- ------- -----
[SQL  ] [  SQL] [SQL]
```

```sql
SELECT LTRIM('xxSQLxx', 'x') A, RTRIM('xxSQLxx', 'x') B, TRIM('x' FROM 'xxSQLxx') C, TRIM(LEADING 'x' FROM 'xxSQLxx') D FROM DUAL;
```

```text
A     B     C   D
----- ----- --- -----
SQLxx xxSQL SQL SQLxx
```

- `LTRIM`·`RTRIM` 의 두 번째 인자는 문자열이 아니라 **문자 집합**이다. `LTRIM('ABCABCSQL', 'CBA')` 는 A·B·C 중 하나인 동안 계속 지워 `SQL` 이 된다.
- `TRIM` 은 지울 문자로 한 글자만 받는다. 두 글자를 주면 오류다.

```sql
SELECT TRIM('xy' FROM 'xxSQLxx') FROM DUAL;
```

```text
SELECT TRIM('xy' FROM 'xxSQLxx') FROM DUAL
       *
ERROR at line 1:
ORA-30001: trim set should have only one character
```

```sql
SELECT LPAD('SQL', 6, '*') A, RPAD('SQL', 6, '-') B, LPAD('DATABASE', 4) C, LPAD('7', 3, '0') D FROM DUAL;
```

```text
A      B      C    D
------ ------ ---- ---
***SQL SQL--- DATA 007
```

- `LPAD('DATABASE', 4)` 처럼 n 이 원래 길이보다 짧으면 **잘린다**. 왼쪽 함수라도 남는 쪽은 앞의 4글자다.
- `REPLACE('A-B-C', '-')` 는 `ABC` 다. 세 번째 인자를 빼면 찾은 문자열을 지운다.

`ASCII` 는 첫 글자의 문자 코드를, `CHR` 는 코드에 맞는 문자를 돌려준다.

```sql
SELECT ASCII('A') A, ASCII('a') B, CHR(65) C, CHR(97) D, ASCII('ABC') E FROM DUAL;
```

```text
         A          B C D          E
---------- ---------- - - ----------
        65         97 A a         65
```

- `ASCII('ABC')` 는 첫 글자 A 만 보고 65 를 돌려준다.

## 숫자 함수

| 함수 | 하는 일 | 예 → 결과 |
|------|------|------|
| `ROUND(n [, d])` | 소수 d 자리로 **반올림** (d 기본 0) | `ROUND(1234.567, 1)` → 1234.6 |
| `TRUNC(n [, d])` | 소수 d 자리로 **버림** | `TRUNC(1234.567, 1)` → 1234.5 |
| `CEIL(n)` | n 이상인 가장 작은 정수 | `CEIL(2.1)` → 3 |
| `FLOOR(n)` | n 이하인 가장 큰 정수 | `FLOOR(2.9)` → 2 |
| `MOD(m, n)` | m 을 n 으로 나눈 나머지 | `MOD(10, 3)` → 1 |
| `ABS(n)` | 절댓값 | `ABS(-15)` → 15 |
| `SIGN(n)` | 양수 1, 0 은 0, 음수 -1 | `SIGN(-15)` → -1 |
| `POWER(m, n)` | m 의 n 제곱 | `POWER(2, 10)` → 1024 |
| `SQRT(n)` | 제곱근 | `SQRT(16)` → 4 |

### 음수 자릿수

자릿수 d 가 음수면 소수점 **왼쪽**으로 간다. -1 은 일의 자리, -2 는 십의 자리에서 처리해 그 아래를 0 으로 만든다.

```sql
SELECT ROUND(1234.567, -2) A, TRUNC(1234.567, -2) B, ROUND(1250, -2) C, TRUNC(1239, -1) D FROM DUAL;
```

```text
         A          B          C          D
---------- ---------- ---------- ----------
      1200       1200       1300       1230
```

- `ROUND(1250, -2)` 는 십의 자리 5 를 보고 올려 1300 이다. `TRUNC(1239, -1)` 은 일의 자리 9 를 버려 1230 이다.

> ⚠️ **음수에서 방향이 바뀐다.** `CEIL` 은 수직선의 오른쪽(큰 쪽), `FLOOR` 는 왼쪽(작은 쪽)이다. `TRUNC` 는 0 쪽으로 자르고, `ROUND(-2.5)` 는 절댓값을 올려 -3 이다.

```sql
SELECT ROUND(-2.5) A, TRUNC(-2.5) B, CEIL(-2.5) C, FLOOR(-2.5) D FROM DUAL;
```

```text
         A          B          C          D
---------- ---------- ---------- ----------
        -3         -2         -2         -3
```

### MOD — 나머지

```sql
SELECT MOD(10, 3) A, MOD(-10, 3) B, MOD(10, -3) C, MOD(10, 0) D, MOD(5.5, 2) E FROM DUAL;
```

```text
         A          B          C          D          E
---------- ---------- ---------- ---------- ----------
         1         -1          1         10        1.5
```

- `MOD` 결과의 부호는 **앞 수(m)** 를 따른다. `MOD(-10, 3)` 은 -1, `MOD(10, -3)` 은 1 이다.
- `MOD(10, 0)` 은 오류가 아니라 10 이다. 0 으로 나누면 m 을 그대로 돌려준다.
- `ABS`·`SIGN`·`POWER`·`SQRT` 는 표의 예 그대로 동작한다. `SQRT` 에 음수를 주면 ORA-01428 오류다.

## SQL Server 와 다른 이름

같은 일을 하는 함수의 이름이 다른 경우가 있다. 보기에 SQL Server 이름이 섞이면 Oracle 에서는 오류다.

| 하는 일 | Oracle | SQL Server |
|------|------|------|
| 글자 수 | `LENGTH` | `LEN` |
| 문자열 연결 | `\|\|`, `CONCAT` | `+`, `CONCAT` |
| 올림 | `CEIL` | `CEILING` |
| 부분 문자열 | `SUBSTR` | `SUBSTRING` |
| 나머지 | `MOD(m, n)` | `m % n` |

```sql
SELECT LEN('A') FROM DUAL;
```

```text
SELECT LEN('A') FROM DUAL
       *
ERROR at line 1:
ORA-00904: "LEN": invalid identifier
```

- `CEILING(2.1)` 도 Oracle 에서는 같은 ORA-00904 오류가 난다. 8주차 Day 3 에서 두 DB 의 차이를 한 번 더 모은다.

내일은 날짜를 더하고 빼는 날짜 함수와, 문자·숫자·날짜를 서로 바꾸는 변환 함수를 다룬다.

## 📖 용어

- **단일행 함수** : 행 하나를 받아 결과 하나를 내는 함수. 행마다 따로 계산된다.
- **다중행 함수** : 여러 행을 묶어 결과 하나를 내는 함수. 집계 함수라고도 한다.
- **중첩** : 함수의 결과를 다른 함수의 입력으로 넣는 것. 안쪽부터 계산한다.
- **문자 집합(TRIM 인자)** : `LTRIM`·`RTRIM` 이 지울 문자들의 모음. 순서와 상관없이 하나라도 맞으면 지운다.
- **패딩(padding)** : 정해진 길이가 되도록 문자를 덧붙이는 것. `LPAD`·`RPAD` 가 한다.
- **음수 자릿수** : `ROUND`·`TRUNC` 에서 소수점 왼쪽 자리를 가리키는 값. -1 은 일의 자리다.
- **LENGTHB** : 글자 수 대신 바이트 수를 세는 함수. 문자 집합에 따라 값이 달라진다.

## 📝 연습 문제

**문제 1.** 다음 SQL 의 결과로 알맞은 것은?

```sql
SELECT SUBSTR('SQL DEVELOPER', 5, 3) FROM DUAL;
```

A) SQL  
B) DEVE  
C) DEV  
D) L D  

**정답: C**  
해설: `SUBSTR` 은 1번째 글자부터 센다. `S-Q-L-공백-D` 이므로 5번째는 D 이고, 거기서 3글자를 자르면 `DEV` 다. 공백도 한 글자로 센다는 점을 놓치면 `L D` 를 고르게 된다.

---

**문제 2.** 다음 SQL 의 결과로 알맞은 것은?

```sql
SELECT ROUND(1250.567, -2) FROM DUAL;
```

A) 1300  
B) 1200  
C) 1250.57  
D) 1251  

**정답: A**  
해설: 자릿수 -2 는 십의 자리에서 반올림해 백의 자리까지 남긴다는 뜻이다. 십의 자리가 5 이므로 올림되어 1300 이 된다. 1250.57 은 자릿수 2, 1251 은 자릿수 0 의 결과이고, 1200 은 `TRUNC(1250.567, -2)` 의 결과다.

---

**문제 3.** 다음 중 여러 행을 입력받아 하나의 결과를 돌려주는 다중행 함수는?

A) LENGTH  
B) ROUND  
C) SUBSTR  
D) COUNT  

**정답: D**  
해설: `COUNT`, `SUM`, `AVG`, `MAX`, `MIN` 은 여러 행을 묶어 결과 하나를 내는 다중행(집계) 함수다. `LENGTH`, `ROUND`, `SUBSTR` 은 행마다 결과를 하나씩 내는 단일행 함수다.

---

**문제 4.** 다음 중 결과가 -3 인 것은?

A) `CEIL(-2.5)`  
B) `FLOOR(-2.5)`  
C) `TRUNC(-2.5)`  
D) `ROUND(-2.4)`  

**정답: B**  
해설: `FLOOR` 는 주어진 수 이하의 가장 큰 정수라서 -2.5 에서는 -3 이다. `CEIL(-2.5)` 는 이상인 가장 작은 정수 -2, `TRUNC(-2.5)` 는 소수부를 버려 -2, `ROUND(-2.4)` 는 반올림해 -2 다.

---

**문제 5.** 다음 SQL 의 결과로 알맞은 것은?

```sql
SELECT INSTR('DATABASE', 'A', 1, 3) FROM DUAL;
```

A) 6  
B) 4  
C) 2  
D) 0  

**정답: A**  
해설: `INSTR(문자열, 찾을 문자, 시작 위치, 몇 번째)` 는 시작 위치부터 찾아 n번째로 나온 위치를 돌려준다. `DATABASE` 에서 A 는 2, 4, 6번째에 있으므로 세 번째 A 의 위치는 6 이다. 찾지 못했을 때가 0 이다.
