# Day 2 - 정규 표현식

## 📌 핵심 정리

- 정규 표현식 함수는 다섯 개다. `REGEXP_LIKE`(조건), `REGEXP_SUBSTR`(잘라 내기), `REGEXP_INSTR`(위치), `REGEXP_REPLACE`(바꾸기), `REGEXP_COUNT`(개수).
- LIKE 는 문자열 **전체**가 패턴과 맞아야 참이다. REGEXP_LIKE 는 패턴이 **어딘가에 한 번** 나오면 참이다. 전체를 맞추려면 `^…$` 로 감싼다.
- `.` 아무 문자 하나, `*` 0회 이상, `+` 1회 이상, `?` 0 또는 1회, `{n,m}` n~m회, `[ ]` 문자 집합, `[^ ]` 제외 집합, `|` 또는, `( )` 묶음이다.
- `( )` 로 묶은 부분은 `\1`, `\2` 로 다시 가리킬 수 있다. REGEXP_REPLACE 의 바꿀 문자열에서 순서를 바꾸는 데 쓴다.
- 일치 옵션은 `'i'`(대소문자 무시), `'c'`(구분, 기본값), `'n'`(`.` 이 줄바꿈과도 일치), `'m'`(여러 줄 모드)이다. 서로 부딪히면 마지막 글자가 이긴다.

## LIKE 로는 부족할 때

LIKE 의 와일드카드는 `%`(0자 이상)와 `_`(정확히 1자) 둘뿐이다. "A 또는 J 로 시작", "같은 글자가 두 번 연달아", "숫자만 3~4자리" 같은 조건은 LIKE 로 쓰기 어렵다. 정규 표현식은 이런 패턴을 한 줄로 적는다.

- Oracle 은 10g 부터 REGEXP_LIKE·REGEXP_SUBSTR·REGEXP_INSTR·REGEXP_REPLACE 를, 11g 부터 REGEXP_COUNT 를 지원한다.
- 패턴 문법은 POSIX 정규 표현식을 따르고, `\d`·`\w`·`\s` 같은 Perl 식 약어도 받는다.

## 메타문자

| 기호 | 뜻 | 예 | 맞는 문자열 |
|-----|----|----|----------|
| `.` | 아무 문자 1개 | `A.E` | ABE, ACE |
| `*` | 앞 문자 0회 이상 | `AB*` | A, AB, ABB |
| `+` | 앞 문자 1회 이상 | `AB+` | AB, ABB |
| `?` | 앞 문자 0회 또는 1회 | `AB?C` | AC, ABC |
| `{n}` / `{n,}` / `{n,m}` | 정확히 n회 / n회 이상 / n~m회 | `L{2}` | LL |
| `^` | 문자열의 시작 | `^A` | A 로 시작 |
| `$` | 문자열의 끝 | `S$` | S 로 끝 |
| `[ ]` | 괄호 안 문자 중 하나 | `[AJ]` | A 또는 J |
| `[^ ]` | 괄호 안 문자를 뺀 하나 | `[^0-9]` | 숫자가 아닌 문자 |
| `\|` | 또는 | `LL\|TT` | LL 이나 TT |
| `( )` | 묶음(그룹) | `(AB)+` | AB, ABAB |
| `\1` | 첫 번째 그룹과 같은 문자열(역참조) | `(.)\1` | AA, LL |

- `^` 는 대괄호 **밖**에서는 시작, 대괄호 **안 맨 앞**에서는 부정이다. `^[AJ]` 와 `[^AJ]` 는 전혀 다른 뜻이다.
- 반복 기호(`*`·`+`·`?`·`{ }`)는 바로 앞 한 글자, 또는 바로 앞 괄호 묶음에만 붙는다.

### 문자 클래스

| POSIX 클래스 | 약어 | 뜻 |
|------------|-----|----|
| `[[:digit:]]` | `\d` | 숫자 0~9 |
| `[[:alpha:]]` | | 영문자 |
| `[[:alnum:]]` | `\w` (밑줄 포함) | 영문자·숫자 |
| `[[:space:]]` | `\s` | 공백·탭·줄바꿈 |
| `[[:upper:]]` / `[[:lower:]]` | | 대문자 / 소문자 |

- 대문자 약어는 반대 뜻이다. `\D` 는 숫자가 아닌 문자, `\S` 는 공백이 아닌 문자다.
- POSIX 클래스는 대괄호를 두 겹으로 쓴다. 바깥 `[ ]` 가 집합, 안쪽 `[:digit:]` 가 클래스 이름이다.

## REGEXP_LIKE — WHERE 절의 조건

`REGEXP_LIKE(문자열, 패턴 [, 옵션])` 은 참·거짓을 돌려주는 조건이다. SELECT 목록에 값처럼 쓸 수는 없고 WHERE·CASE WHEN 같은 조건 자리에 쓴다.
- 이 노트의 실습 환경인 Oracle 23ai 는 BOOLEAN 형이 생겨 `SELECT REGEXP_LIKE(ENAME, 'A') FROM EMP` 가 TRUE·FALSE 를 돌려준다. 시험 기준(그 이전 버전)에서는 SELECT 목록에 쓸 수 없다. 이 사이트의 실습장도 시험 기준을 따른다.

```sql
SELECT ENAME FROM EMP WHERE REGEXP_LIKE(ENAME, '^[AJ]') ORDER BY ENAME;
```

```text
ENAME
----------
ADAMS
ALLEN
JAMES
JONES
```

```sql
SELECT ENAME FROM EMP WHERE REGEXP_LIKE(ENAME, '(.)\1') ORDER BY ENAME;
```

```text
ENAME
----------
ALLEN
MILLER
SCOTT
```

- `(.)` 가 아무 글자 하나를 잡고, `\1` 이 방금 잡은 글자와 같은 글자를 요구한다. ALLEN·MILLER 의 LL, SCOTT 의 TT 가 맞았다.
- `'LL|TT'` 로 써도 같은 세 명이 나왔다. 역참조는 어떤 글자인지 몰라도 "같은 글자 두 번"을 찾는다는 점이 다르다.

이름이 정확히 네 글자인 사원이다.

```sql
SELECT ENAME FROM EMP WHERE REGEXP_LIKE(ENAME, '^.{4}$') ORDER BY ENAME;
```

```text
ENAME
----------
FORD
KING
WARD
```

- `^` 와 `$` 를 빼고 `'.{4}'` 만 쓰면 14명이 모두 나왔다. 다섯 글자 이름 안에도 "연속한 네 글자"가 있기 때문이다.

## LIKE 와의 차이

| 구분 | LIKE | REGEXP_LIKE |
|------|------|------------|
| 판정 | 문자열 전체가 패턴과 맞아야 참 | 패턴이 문자열 어딘가에 있으면 참 |
| 임의 문자 | `_` 1자, `%` 0자 이상 | `.` 1자, `.*` 0자 이상 |
| 시작·끝 고정 | 기본이 전체 일치 | `^`, `$` 를 써야 고정된다 |
| 대소문자 무시 | UPPER·LOWER 로 직접 바꾼다 | `'i'` 옵션 |
| 반복·선택·역참조 | 없다 | `{n,m}`, `\|`, `\1` |

같은 문자 `A` 를 두 방식으로 찾아 세면 차이가 바로 보인다.

```sql
SELECT (SELECT COUNT(*) FROM EMP WHERE ENAME LIKE 'A') AS LIKE_A, (SELECT COUNT(*) FROM EMP WHERE ENAME LIKE '%A%') AS LIKE_PCT, (SELECT COUNT(*) FROM EMP WHERE REGEXP_LIKE(ENAME, 'A')) AS REGEXP_A FROM DUAL;
```

```text
    LIKE_A   LIKE_PCT   REGEXP_A
---------- ---------- ----------
         0          7          7
```

- `LIKE 'A'` 는 이름이 정확히 `A` 한 글자여야 참이라 0명이다.
- `REGEXP_LIKE(ENAME, 'A')` 는 `LIKE '%A%'` 와 같은 뜻이 된다. 둘 다 7명이다.

> ⚠️ **함정**: 정규 표현식의 `%` 와 `_` 는 와일드카드가 아니라 그냥 글자다. 반대로 LIKE 의 `.` 과 `*` 도 그냥 글자다. 보기에서 두 문법을 섞어 쓴 패턴은 기대와 다른 결과를 낸다.

## REGEXP_SUBSTR · REGEXP_INSTR · REGEXP_COUNT

| 함수 | 인자 | 돌려주는 값 | 못 찾으면 |
|------|-----|----------|--------|
| `REGEXP_SUBSTR` | (문자열, 패턴, 시작 위치, n번째, 옵션, 그룹 번호) | 일치한 부분 문자열 | NULL |
| `REGEXP_INSTR` | (문자열, 패턴, 시작 위치, n번째, 반환 옵션, 옵션) | 일치한 위치 | 0 |
| `REGEXP_COUNT` | (문자열, 패턴, 시작 위치, 옵션) | 일치한 횟수 | 0 |

- 시작 위치와 n번째의 기본값은 1 이다.
- REGEXP_INSTR 의 반환 옵션이 0(기본)이면 일치의 시작 위치, 1 이면 일치가 끝난 **다음** 위치다.

30번 부서 사원 이름에서 모음을 찾는다.

```sql
SELECT ENAME, REGEXP_SUBSTR(ENAME, '[AEIOU]') AS V1, REGEXP_SUBSTR(ENAME, '[AEIOU]', 1, 2) AS V2, REGEXP_INSTR(ENAME, '[AEIOU]') AS P1, REGEXP_COUNT(ENAME, '[AEIOU]') AS CNT FROM EMP WHERE DEPTNO = 30 ORDER BY ENAME;
```

```text
ENAME      V1                                       V2                                               P1        CNT
---------- ---------------------------------------- ---------------------------------------- ---------- ----------
ALLEN      A                                        E                                                 1          2
BLAKE      A                                        E                                                 3          2
JAMES      A                                        E                                                 2          2
MARTIN     A                                        I                                                 2          2
TURNER     U                                        E                                                 2          2
WARD       A                                                                                          2          1
```

- WARD 에는 모음이 A 하나뿐이라 두 번째 모음 V2 가 NULL 이다.
- BLAKE 의 첫 모음 A 는 세 번째 글자라 P1 이 3 이다.

문자열 리터럴로 함수의 세부 동작을 확인한다.

```sql
SELECT REGEXP_SUBSTR('02-1234-5678', '[0-9]+', 1, 2) AS A, REGEXP_SUBSTR('02-1234-5678', '\d+$') AS B, REGEXP_COUNT('02-1234-5678', '[[:digit:]]') AS C FROM DUAL;
```

```text
A    B             C
---- ---- ----------
1234 5678         10
```

- `[0-9]+` 는 숫자가 이어진 덩어리 하나다. 두 번째 덩어리가 1234 다.
- `\d+$` 는 끝에 붙은 숫자 덩어리다. `[[:digit:]]` 은 숫자 한 글자라 10번 센다.

```sql
SELECT REGEXP_COUNT('banana', 'a') AS A, REGEXP_COUNT('banana', 'ana') AS B, REGEXP_INSTR('ABCABC', 'B', 1, 2) AS C, REGEXP_INSTR('ABCABC', 'B', 1, 1, 1) AS D FROM DUAL;
```

```text
         A          B          C          D
---------- ---------- ---------- ----------
         3          1          5          3
```

- banana 에 `ana` 는 2-4번, 4-6번 자리에 겹쳐 있지만 1 이다. 한 번 일치한 글자 뒤에서 다음 검색을 시작하기 때문이다.
- 두 번째 B 는 5번째 글자다. 반환 옵션 1 을 주면 첫 B(2번) 다음 위치인 3 을 돌려준다.

그룹 번호를 주면 괄호로 묶은 부분만 꺼낸다.

```sql
SELECT REGEXP_SUBSTR('user@mail.com', '[^@]+') AS ID, REGEXP_SUBSTR('user@mail.com', '@(.+)$', 1, 1, NULL, 1) AS DOM FROM DUAL;
```

```text
ID   DOM
---- --------
user mail.com
```

- `[^@]+` 는 @ 가 아닌 글자의 덩어리라 앞쪽 user 가 나온다.
- 여섯 번째 인자 1 은 첫 번째 괄호 그룹을 뜻한다. 그룹 번호가 없으면 @ 까지 포함한 `@mail.com` 이 나온다.

## REGEXP_REPLACE 와 역참조

`REGEXP_REPLACE(문자열, 패턴, 바꿀 문자열)` 은 일치하는 부분을 모두 바꾼다. 바꿀 문자열을 생략하면 일치한 부분을 지운다.

```sql
SELECT ENAME, SUBSTR(REGEXP_REPLACE(ENAME, '[AEIOU]', '*'), 1, 10) AS MASKED FROM EMP WHERE DEPTNO = 10 ORDER BY ENAME;
```

```text
ENAME      MASKED
---------- ----------------------------------------
CLARK      CL*RK
KING       K*NG
MILLER     M*LL*R
```

- SUBSTR 는 열 폭을 줄이려고 붙였다. 바뀐 내용은 그대로다.
- MILLER 의 I 와 E 가 모두 바뀌었다. REGEXP_REPLACE 는 기본으로 모든 일치를 바꾼다.

바꿀 문자열 안의 `\1`, `\2`, `\3` 은 패턴에서 괄호로 잡은 부분이다. 날짜 순서를 뒤집고, 전화번호 가운데를 가린다.

```sql
SELECT REGEXP_REPLACE('2026-11-03', '(\d{4})-(\d{2})-(\d{2})', '\3/\2/\1') AS D, REGEXP_REPLACE('010-1234-5678', '(\d{3})-(\d{4})-(\d{4})', '\1-****-\3') AS P, REGEXP_REPLACE('a1b2c3', '\D') AS N FROM DUAL;
```

```text
D          P             N
---------- ------------- ---
03/11/2026 010-****-5678 123
```

- 그룹 번호는 여는 괄호가 나온 순서다. 연도가 `\1`, 월이 `\2`, 일이 `\3` 이다.
- `\D` 는 숫자가 아닌 글자다. 바꿀 문자열이 없으니 지워지고 숫자만 남는다. `[^[:digit:]]` 로 써도 결과가 같았다.

## 일치 옵션

| 옵션 | 뜻 |
|-----|----|
| `'i'` | 대소문자를 구분하지 않는다 |
| `'c'` | 대소문자를 구분한다 (기본값) |
| `'n'` | `.` 이 줄바꿈 문자와도 일치한다 (기본은 일치하지 않는다) |
| `'m'` | 여러 줄 모드. `^`·`$` 가 문자열의 시작·끝뿐 아니라 각 줄의 시작·끝에도 맞는다 |
| `'x'` | 패턴 안의 공백 문자를 무시한다 |

EMP 의 이름은 모두 대문자라, 소문자 `a` 로 찾으면 옵션이 결과를 가른다.

```sql
SELECT (SELECT COUNT(*) FROM EMP WHERE REGEXP_LIKE(ENAME, 'a')) AS C_DEFAULT, (SELECT COUNT(*) FROM EMP WHERE REGEXP_LIKE(ENAME, 'a', 'i')) AS C_I, (SELECT COUNT(*) FROM EMP WHERE REGEXP_LIKE(ENAME, 'a', 'ic')) AS C_IC FROM DUAL;
```

```text
 C_DEFAULT        C_I       C_IC
---------- ---------- ----------
         0          7          0
```

- 기본은 대소문자 구분이라 0명이다. `'i'` 를 주면 7명이다.
- `'ic'` 처럼 서로 반대인 옵션을 함께 주면 마지막 `c` 가 적용되어 다시 0명이다. `'ci'` 로 순서를 바꾸면 7명이었다.

`'n'` 과 `'m'` 은 줄바꿈이 든 문자열에서 차이가 난다. `CHR(10)` 이 줄바꿈 문자다.

```sql
SELECT REGEXP_COUNT('ab' || CHR(10) || 'ac', '^a') AS NO_M, REGEXP_COUNT('ab' || CHR(10) || 'ac', '^a', 1, 'm') AS M, CASE WHEN REGEXP_LIKE('a' || CHR(10) || 'b', 'a.b') THEN 'Y' ELSE 'N' END AS NO_N, CASE WHEN REGEXP_LIKE('a' || CHR(10) || 'b', 'a.b', 'n') THEN 'Y' ELSE 'N' END AS N FROM DUAL;
```

```text
      NO_M          M N N
---------- ---------- - -
         1          2 N Y
```

- 기본에서 `^` 는 문자열 맨 앞 하나뿐이라 1 이다. `'m'` 이면 둘째 줄 시작도 맞아 2 다.
- 세 번째 열이 NO_N, 네 번째 열이 N 이다. SQL*Plus 가 값 폭(1자)에 맞춰 열 머리를 잘랐다.
- 기본에서 `.` 은 줄바꿈과 맞지 않아 `a.b` 가 거짓이다. `'n'` 을 주면 참이 된다.

> 내일은 테이블의 행을 넣고 고치고 지우는 DML(INSERT·UPDATE·DELETE·MERGE)을 다룬다.

## 📖 용어

- **정규 표현식** : 문자열의 모양을 기호로 적은 패턴. 반복·선택·위치 조건을 한 줄로 표현한다.
- **메타문자** : `.`·`*`·`^`·`$` 처럼 글자 그대로가 아니라 특별한 뜻으로 쓰이는 기호.
- **문자 집합** : `[ ]` 안에 적은 글자 중 하나와 일치하는 표현. `[^ ]` 는 그 글자들을 뺀 나머지다.
- **POSIX 문자 클래스** : `[[:digit:]]`·`[[:alpha:]]` 처럼 이름으로 부르는 글자 묶음.
- **그룹** : 괄호로 묶은 패턴의 한 부분. 반복을 함께 걸거나 나중에 다시 가리키는 데 쓴다.
- **역참조** : `\1`·`\2` 로 앞에서 괄호로 잡은 문자열을 다시 가리키는 것.
- **일치 옵션** : `'i'`·`'c'`·`'n'`·`'m'` 처럼 대소문자·줄바꿈 처리 방식을 바꾸는 인자.

## 📝 연습 문제

**문제 1.** EMP 에서 이름에 A 가 들어간 사원은 7명이다. `SELECT COUNT(*) FROM EMP WHERE ENAME LIKE 'A';` 와 `SELECT COUNT(*) FROM EMP WHERE REGEXP_LIKE(ENAME, 'A');` 의 결과를 순서대로 고르면?

A) 0, 0  
B) 7, 7  
C) 0, 7  
D) 7, 0  

**정답: C**  
해설: LIKE 는 문자열 전체가 패턴과 맞아야 해서 `LIKE 'A'` 는 이름이 정확히 A 인 행만 찾는다. 그런 사원은 없어 0 이다. REGEXP_LIKE 는 패턴이 어딘가에 있으면 참이라 7 이다. A 와 B 는 두 함수의 판정 방식이 같다고 본 답이다. D 는 두 방식을 반대로 적용했다.

---

**문제 2.** `SELECT REGEXP_COUNT('banana', 'ana') FROM DUAL;` 의 결과는?

A) 1  
B) 2  
C) 3  
D) 0  

**정답: A**  
해설: REGEXP_COUNT 는 일치한 부분의 바로 뒤에서 다음 검색을 이어 간다. 2~4번 글자에서 ana 를 찾은 뒤 5번 글자부터 보니 na 만 남아 1 이다. 2 는 4~6번의 겹친 ana 까지 센 답이다. 3 은 `'a'` 한 글자를 셌을 때의 결과다. 0 은 일치가 없을 때의 값이다.

---

**문제 3.** `SELECT REGEXP_REPLACE('2026-11-03', '(\d{4})-(\d{2})-(\d{2})', '\3/\2/\1') FROM DUAL;` 의 결과는?

A) 2026/11/03  
B) \3/\2/\1  
C) 11/03/2026  
D) 03/11/2026  

**정답: D**  
해설: 그룹 번호는 여는 괄호 순서라 `\1` 이 2026, `\2` 가 11, `\3` 이 03 이다. 바꿀 문자열 `\3/\2/\1` 에 넣으면 03/11/2026 이다. A 는 순서를 바꾸지 않고 구분자만 바꿨다. B 는 역참조가 글자 그대로 들어간다고 본 답이다. C 는 월과 일의 그룹 번호를 바꿔 읽었다.

---

**문제 4.** EMP 의 이름은 모두 대문자이고 A 가 든 사원은 7명이다. `SELECT COUNT(*) FROM EMP WHERE REGEXP_LIKE(ENAME, 'a', 'ic');` 의 결과는?

A) 7  
B) 0  
C) 일치 옵션이 서로 부딪혀 오류가 난다  
D) 14  

**정답: B**  
해설: 서로 반대인 옵션을 함께 주면 마지막 글자가 적용된다. `'ic'` 의 마지막 c 는 대소문자 구분이라 소문자 a 는 대문자 이름과 맞지 않아 0 이다. 7 은 `'i'` 나 `'ci'` 를 줬을 때다. 옵션이 부딪혀도 오류는 나지 않는다. 14 는 전체 사원 수다.

---

**문제 5.** 이름이 정확히 네 글자인 사원(FORD·KING·WARD)만 찾는 REGEXP_LIKE 패턴은?

A) `'^.{4}$'`  
B) `'.{4}'`  
C) `'^....'`  
D) `'[4]'`  

**정답: A**  
해설: `^` 와 `$` 로 시작과 끝을 고정하고 그 사이에 아무 글자 4개를 두어야 전체 길이가 4 로 정해진다. B 는 연속한 네 글자가 어딘가에 있으면 참이라 14명이 모두 나온다. C 는 처음 네 글자만 확인해 다섯 글자 이상 이름도 맞는다. D 는 숫자 4 라는 글자 하나를 찾아 0명이다.
