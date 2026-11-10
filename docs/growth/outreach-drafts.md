# 외부 글 초안 — 긱뉴스 Show GN · 개발 블로그 · GitHub 소개 (2026-11-10)

왜: 구글 "크롤링됨-색인 안 됨" 832개는 기술 문제가 아니라 사이트 신뢰도(외부 링크·방문 없음) 문제로 판단했다(`docs/growth-100.md` 11-10 기록). 사람이 실제로 와서 써 보는 링크를 몇 군데 만든다.

게시는 사용자가 직접 한다. 원칙은 `docs/growth-100.md` 와 같다: 내가 만든 것이라고 밝힌다, 겪지 않은 경험·지어낸 반응·과장은 쓰지 않는다, 링크에 `utm_source` 를 단다, 게시판 규칙을 먼저 본다.

이미 있는 SQLD 시험 직전 글(`docs/growth/sqld-exam-week.md`)의 6가지(빈 문자열 NULL, NOT IN 과 NULL, COUNT(*)·COUNT(열), ROWNUM, RANK 3종, ROLLUP·CUBE)는 아래 블로그 글에서 다시 쓰지 않았다. 루트 사이트(juganlab.com)에 따로 쓰는 "SQL 실습장을 Oracle 과 대조한 개발기"와 겹치지 않게, 블로그 글은 수험생이 쓸 내용만 담고 만든 과정은 한 문단으로 줄였다.

---

## 0. 글에 쓴 숫자와 근거

2026-11-10, `origin/main` f2422a1 기준으로 직접 세고 돌려 봤다. 글을 고칠 때 숫자를 바꾸면 이 표도 같이 고친다.

| 숫자 | 값 | 어떻게 셌나 |
| --- | --- | --- |
| SQL 골든 사례 | 957개 | `scripts/sql-lab/cases.json` 길이. `results.json` 키도 957개 |
| 그중 엔진이 일부러 Oracle 23ai 를 따르지 않는 것 | 3개 | `golden.test.ts` 의 `VERSION_DIFFERENCES`(FROM 없는 SELECT, HAVING 의 별칭, SELECT 목록의 REGEXP_LIKE) — 시험 기준 동작을 따른다 |
| SQL 골든 테스트 통과 | 954개 | `npx vitest run src/lib/sql-lab/golden.test.ts` → 954 passed |
| 여러 문장(DML·DDL·TCL) 사례 | 60개, 문장 423개 | `cases.json` 에서 `script` 가 있는 것 |
| 오류로 끝나는 골든 | 178개, 서로 다른 ORA 번호 69개 | `results.json` 의 `error` |
| 노트 본문 SQL 예제 | 394개 | `note-` 로 시작하는 사례. 노트의 예제도 같은 골든으로 맞춘다 |
| SQL 실습 과제 | 5묶음 38과제 | `src/lib/sql-lab/tasks.json` |
| 대조한 Oracle | Oracle Database 23ai Free | `gvenzl/oracle-free:23-slim-faststart` 컨테이너(`scripts/sql-lab/golden.mjs` 주석) |
| 셸 골든 시나리오 | 26개, 423단계 | `src/lib/shell-lab/golden/scenarios.json`. 단계마다 stdout·stderr·종료 코드를 비교 |
| 셸 골든 테스트 통과 | 26개 | `npx vitest run src/lib/shell-lab/golden.test.ts` → 26 passed |
| 대조한 리눅스 | `rockylinux:8.8` 이미지 + findutils·passwd | `scripts/shell-lab/Dockerfile`. 리눅스마스터 1급 실기 환경이 Rocky Linux 8.8 (KAIT 공식 페이지, `docs/P7-cli-lab-plan.md`) |
| 셸 명령 | 33개(+ `ll` 별칭) | `src/lib/shell-lab/run.ts` 의 `COMMANDS` |
| 셸 실습 | 리눅스 셸 7개 + 실기 대비 2세트(7문제·8문제) | `src/lib/labCatalog.ts` |
| 서버 호출 | 없음 | `src/components/sql-lab`·`shell-lab` 에 `fetch` 없음, 엔진은 클라이언트에서 돈다. SQLite·WASM 같은 DB 의존성도 없다(`package.json`) |

두 골든 테스트를 한 번에 돌린 결과: `Tests 980 passed (980)`.

셸은 "출력이 같다"의 범위를 정확히 말해야 한다. 실행 환경마다 달라지는 `ls`·`stat` 의 시각, `stat` 의 장치·inode 번호, `ls -li` 의 inode 번호(같은 번호끼리 같은지는 유지), `passwd -S` 의 날짜만 양쪽 다 같은 자리표시로 바꾼 뒤 비교한다. find·grep -r 은 실제로 디스크 순서라 매번 다르므로 정렬해서 비교한다.

### 링크 (모두 2026-11-10 curl 로 200 확인)

| 쓰는 곳 | 주소 |
| --- | --- |
| 실습 모음 | https://cert.juganlab.com/lab (`#lab-linux` `#lab-practical` `#lab-sql` `#lab-aws` 앵커 있음) |
| 셸 실습 예 | https://cert.juganlab.com/lab/linux-perm-basics |
| 실기 대비 | https://cert.juganlab.com/lab/linux-practical-perm |
| SQL 실습 | https://cert.juganlab.com/lab/sql-select-basics , `/lab/sql-group-join` , `/lab/sql-subquery-rollup` , `/lab/sql-window-hierarchy` , `/lab/sql-pivot-dml` |
| SQLD 노트 | `/data/sqld/week3/day1`(SELECT) `/week3/day2`(문자·숫자 함수) `/week3/day5`(WHERE) `/week4/day1`(집계) `/week4/day2`(HAVING) `/week4/day3`(ORDER BY) `/week4/day4`(조인 (+)) `/week5/day1`(서브쿼리) |
| 골든 테스트 코드 | https://github.com/HD152521/CertNote/blob/main/src/lib/sql-lab/golden.test.ts , https://github.com/HD152521/CertNote/blob/main/src/lib/shell-lab/golden.test.ts |
| 남은 차이 목록 | https://github.com/HD152521/CertNote/blob/main/docs/sql-lab-backlog.md |

레포 `HD152521/CertNote` 는 공개(public)지만 LICENSE 파일이 없다. 글에서 "오픈소스"라고 부르지 않는다. 코드를 "볼 수 있다"고만 쓴다.

---

## 1. 긱뉴스 Show GN

긱뉴스 규칙(https://news.hada.io/guidelines, 2026-11-10 확인)에서 이 글에 걸리는 것:
- 본인이 만든 서비스는 뉴스가 아니라 **Show** 로 올린다.
- **직접 써 볼 수 있는 것**만 올린다. 소개 페이지·블로그 글은 안 된다 → 링크는 실습 페이지로 건다.
- 가입·이메일 없이 바로 써 볼 수 있게 → 실습장은 로그인 없이 된다(모의고사만 가입 필요. 글에서 모의고사는 말하지 않는다).
- 같은 프로젝트는 일정 기간 다시 올릴 수 없다 → **한 번만, 다듬어서** 올린다. AWS·리눅스·SQL 을 나눠 여러 번 올리지 않는다.
- 단축 URL·리다이렉트 금지 → utm 이 붙은 원래 주소를 그대로 쓴다.
- 제목·내용이 클릭을 유도하면 운영자가 고친다 → 제목은 사실만.

**타입:** Show

**제목:** Show GN: 설치 없이 브라우저에서 돌리는 리눅스 셸·Oracle SQL 실습장 — 출력을 실제 Rocky Linux 8.8·Oracle 결과와 골든 테스트로 맞춤

(짧게 줄여야 하면: `Show GN: 실제 Rocky 8.8·Oracle 출력과 대조한 브라우저 셸·SQL 실습장`)

**URL:** https://cert.juganlab.com/lab?utm_source=geeknews&utm_campaign=show_gn

**본문:**

```
한국어 자격증 학습 사이트(CertNote)를 혼자 만들고 있습니다. 그 안에 리눅스마스터·SQLD 수험생이 명령과 SQL 을 직접 쳐 볼 수 있는 실습장을 넣었고, 가입 없이 쓸 수 있어 소개합니다.

무엇을 하나
- 리눅스 셸: 가상 파일 시스템(inode·권한 비트·특수 권한·소유자·하드/심볼릭 링크)과 계정·그룹 상태를 들고 명령을 해석합니다. ls·chmod·chown·umask·ln·useradd·usermod·su·find·grep 등 33개 명령, 파이프와 리다이렉션을 지원합니다. 일반 사용자로 바꾸면 Permission denied 가 실제처럼 납니다.
- SQL: Oracle 문법을 TypeScript 로 직접 짠 엔진으로 실행합니다(SQLite·WASM 이 아닙니다). EMP·DEPT·SALGRADE 테이블, 조인·(+)·서브쿼리·집합 연산·ROLLUP/CUBE/GROUPING SETS·윈도우 함수·계층형 질의·PIVOT·정규식·DML·트랜잭션까지 SQLD 범위를 다룹니다. 오류도 ORA 번호와 문구로 냅니다.
- 둘 다 브라우저 안에서만 돌고 서버로 보내는 요청이 없습니다.

출력을 어떻게 맞췄나
- 셸: rockylinux:8.8 컨테이너(리눅스마스터 1급 실기 환경과 같은 버전)에서 같은 명령을 실행해 stdout·stderr·종료 코드를 저장하고, 시뮬레이터 출력과 비교합니다. 26개 시나리오 423단계입니다. 시각·inode 번호처럼 실행할 때마다 바뀌는 값만 양쪽 다 자리표시로 바꿔 비교합니다.
- SQL: Oracle Database 23ai Free 컨테이너에서 찍은 결과와 957개 사례(여러 문장짜리 60개 포함)를 대조합니다. 23ai 에서만 달라진 동작 3개(FROM 없는 SELECT, HAVING 에서 SELECT 별칭, SELECT 목록의 REGEXP_LIKE)는 일부러 시험 기준 동작을 따르고, 나머지 954개는 결과·오류 번호·오류 문구가 같아야 테스트가 통과합니다(동점 순서가 정해지지 않는 3건은 행 집합·행 수만 비교).
- 골든 없이 명령이나 문법을 추가하지 않는 것을 규칙으로 두고 있습니다. 추측으로 쓴 오류 문구가 틀리면 학습용으로는 오히려 해가 된다고 봤습니다.

일부러 실제와 다르게 둔 것 / 아직 다른 것
- 셸은 C 로케일(영어 메시지)이고, ls -l 뒤의 SELinux 점은 없습니다(컨테이너 기준). find·grep -r 은 이름순으로 돕니다. vi·tar·systemctl 등은 "command not found" 로 속이지 않고 아직 지원하지 않는다고 안내합니다.
- SQL 은 희귀한 문법 조합에서 Oracle 과 다른 곳이 남아 있고, 찾은 것은 목록으로 공개해 두었습니다.
  https://github.com/HD152521/CertNote/blob/main/docs/sql-lab-backlog.md

골든 테스트 코드
- https://github.com/HD152521/CertNote/blob/main/src/lib/shell-lab/golden.test.ts
- https://github.com/HD152521/CertNote/blob/main/src/lib/sql-lab/golden.test.ts

실제 출력과 다른 걸 찾으시면 명령이나 SQL 을 그대로 알려 주시면 고치고 골든 사례로 넣겠습니다.
```

분량: 긱뉴스 Show 글은 링크 + 몇 문단 설명이 보통이다. 위 본문은 약 1,500자로, 더 줄여야 하면 "일부러 실제와 다르게 둔 것"을 두 줄로 합친다. 이 칸은 빼지 않는다 — 기술 독자에게는 한계를 먼저 밝히는 편이 낫다.

### 게시 전 체크리스트 (Show GN)

- [ ] https://news.hada.io/guidelines 의 "Show GN 이용방법"을 다시 읽는다(규칙은 바뀔 수 있다). 타입을 **Show** 로 고른다.
- [ ] 같은 프로젝트(CertNote) 를 전에 올린 적이 없는지 확인한다. 한 번 올리면 일정 기간 다시 못 올린다.
- [ ] 올리기 직전에 https://cert.juganlab.com/lab 을 PC·폰에서 열어 SQL 한 줄, 셸 한 줄을 직접 실행해 본다. (`SELECT ENAME, COMM FROM EMP WHERE COMM <> 300`, `ls -l /etc/passwd`)
- [ ] 숫자는 올리는 날 다시 센다: `node -e "console.log(require('./scripts/sql-lab/cases.json').length)"`, 셸 단계 수는 0절 표의 방법으로. 바뀌었으면 본문과 0절 표를 같이 고친다.
- [ ] URL 은 `utm_source=geeknews&utm_campaign=show_gn`. 본문 안 GitHub 링크에는 utm 을 달지 않는다(우리 사이트가 아니다).
- [ ] 댓글로 "실제와 다르다"는 제보가 오면 재현해 보고, 맞으면 `scripts/sql-lab/cases.mjs` 또는 셸 시나리오에 넣고 고친 뒤 답한다. 재현 안 되면 그대로 말한다.
- [ ] 올릴 시간: SQLD 시험 주(11-14)와 묶을 이유는 없다(독자가 수험생이 아니다). 평일 오전(출근 시간대 9~10시)을 제안한다 — 측정한 근거가 있는 건 아니고, 하루 동안 첫 화면에 머물 시간을 길게 잡자는 뜻이다. 사용자가 댓글에 바로 답할 수 있는 날을 고른다.
- [ ] 올린 날짜와 주소를 `docs/growth-100.md` 기록에 남기도록 메인 세션에 알린다.

---

## 2. 개발 블로그 글 (티스토리 또는 velog)

**어디에:** 이미 운영 중인 티스토리(https://tmi-t.tistory.com/, GitHub 프로필에 링크된 블로그)를 먼저 권한다. 새 velog 계정보다 기존 블로그 쪽이 글이 쌓여 있다. 두 곳에 똑같이 올리면 서로 중복 글이 되므로 **한 곳에만** 올린다. velog 에 올리면 아래 utm 의 `tistory` 를 `velog` 로 바꾼다.

**제목:** SQLD 시험에 나오는 Oracle 함정 8가지, 실제로 돌려 본 결과

**태그:** SQLD, SQL, Oracle, 자격증, NULL

**본문:**

````markdown
SQLD 는 Oracle 문법 기준이라, 다른 DB 에 익숙하거나 책으로만 본 사람이 결과를 거꾸로 고르는 문제가 꽤 있습니다. 시험에 자주 나오는 것 중에서 "알고 있다고 생각했는데 직접 돌려 보면 헷갈리는 것"만 8개 골랐습니다.

아래 결과는 모두 EMP·DEPT 예제 테이블(사원 14명, 부서 4개)로 실제 Oracle 에서 실행한 값입니다. 출력은 보기 좋게 표로 옮겼고, NULL 은 빈칸으로 나옵니다.

> 이 글의 SQL 은 제가 만든 무료 실습장에서 설치·가입 없이 그대로 실행해 볼 수 있습니다. 링크는 글 끝에 있습니다.

---

## 1. `||` 로 NULL 을 이어 붙이면 NULL 이 아니다

```sql
SELECT ENAME || NULL || JOB FROM EMP WHERE EMPNO = 7839;
```

| ENAME\|\|NULL\|\|JOB |
| --- |
| KINGPRESIDENT |

산술 연산(`SAL + NULL`)은 NULL 이 되지만, Oracle 의 문자열 연결 `||` 는 NULL 을 빈 문자열처럼 건너뜁니다. `'A' || NULL || 'B'` 도 `AB` 입니다. "NULL 이 섞이면 결과는 무조건 NULL" 로 외우면 이 문제에서 틀립니다.

## 2. `<>` 조건은 NULL 행을 조용히 뺀다

```sql
SELECT ENAME, COMM FROM EMP WHERE COMM <> 300;
```

| ENAME | COMM |
| --- | --- |
| WARD | 500 |
| MARTIN | 1400 |
| TURNER | 0 |

"300 이 아닌 사람" 이니 14명 중 13명이 나올 것 같지만 3명입니다. COMM 이 NULL 인 10명은 `NULL <> 300` 이 참도 거짓도 아닌 UNKNOWN 이라 빠집니다. NULL 인 사람까지 원하면 `WHERE COMM <> 300 OR COMM IS NULL` 처럼 따로 적어야 합니다. (ORDER BY 가 없으니 행 순서는 보장되지 않습니다.)

## 3. `SUM(SAL + COMM)` 과 `SUM(SAL) + SUM(COMM)` 은 다르다

```sql
SELECT SUM(SAL + COMM), SUM(SAL) + SUM(COMM) FROM EMP;
```

| SUM(SAL+COMM) | SUM(SAL)+SUM(COMM) |
| --- | --- |
| 7800 | 31225 |

왼쪽은 행마다 `SAL + COMM` 을 먼저 계산합니다. COMM 이 NULL 인 10명은 그 합이 NULL 이 되고, SUM 은 NULL 을 빼고 더하니 COMM 이 있는 4명 몫만 남습니다. 오른쪽은 열마다 따로 더한 뒤(NULL 은 빼고) 합칩니다. 더하는 순서 하나로 4배가 차이 납니다.

## 4. `(+)` 를 한쪽 조건에만 붙이면 외부 조인이 풀린다

부서마다 급여 2900 넘는 사원을 붙이되, 그런 사원이 없는 부서도 남기고 싶다고 해 봅니다.

```sql
-- (+) 를 두 조건 모두에
SELECT D.DNAME, E.ENAME
FROM EMP E, DEPT D
WHERE E.DEPTNO(+) = D.DEPTNO
  AND E.SAL(+) > 2900
ORDER BY D.DNAME, E.ENAME;
```

| DNAME | ENAME |
| --- | --- |
| ACCOUNTING | KING |
| OPERATIONS | |
| RESEARCH | FORD |
| RESEARCH | JONES |
| RESEARCH | SCOTT |
| SALES | |

```sql
-- 급여 조건에 (+) 를 빠뜨리면
SELECT D.DNAME, E.ENAME
FROM EMP E, DEPT D
WHERE E.DEPTNO(+) = D.DEPTNO
  AND E.SAL > 2900
ORDER BY D.DNAME, E.ENAME;
```

| DNAME | ENAME |
| --- | --- |
| ACCOUNTING | KING |
| RESEARCH | FORD |
| RESEARCH | JONES |
| RESEARCH | SCOTT |

OPERATIONS·SALES 가 사라졌습니다. 외부 조인으로 채운 행은 E.SAL 이 NULL 인데, `E.SAL > 2900` 이 그 행을 걸러 내서 결국 내부 조인과 같아집니다. ANSI 문법으로 치면 조건을 `ON` 에 두느냐 `WHERE` 에 두느냐의 차이와 같습니다.

## 5. NULL 은 오름차순에서 맨 뒤, 내림차순에서 맨 앞

```sql
SELECT ENAME, COMM FROM EMP WHERE DEPTNO = 30 ORDER BY COMM, ENAME;
```

| ENAME | COMM |
| --- | --- |
| TURNER | 0 |
| ALLEN | 300 |
| WARD | 500 |
| MARTIN | 1400 |
| BLAKE | |
| JAMES | |

```sql
SELECT ENAME, COMM FROM EMP WHERE DEPTNO = 30 ORDER BY COMM DESC, ENAME;
```

| ENAME | COMM |
| --- | --- |
| BLAKE | |
| JAMES | |
| MARTIN | 1400 |
| WARD | 500 |
| ALLEN | 300 |
| TURNER | 0 |

Oracle 은 NULL 을 "가장 큰 값"처럼 정렬합니다. SQL Server 는 반대(NULL 이 가장 작음)라서 문제에 "Oracle 기준" 이 붙어 있는지 꼭 봐야 합니다. 위치를 바꾸려면 `NULLS FIRST`·`NULLS LAST` 를 붙입니다.

## 6. `> ALL (빈 결과)` 는 모든 행이 참이다

```sql
SELECT COUNT(*) FROM EMP WHERE SAL > ALL (SELECT SAL FROM EMP WHERE DEPTNO = 40);
```

| COUNT(*) |
| --- |
| 14 |

40번 부서에는 사원이 없어서 서브쿼리가 0행입니다. "아무와도 비교할 게 없으니 0명"이 아니라, "비교 대상 전부보다 크다"가 반례 없이 성립해서 14명 전부가 나옵니다. 30번 부서(사원 있음)로 바꾸면 `> ALL` 은 4명, `> ANY` 는 12명입니다.

## 7. 음수의 ROUND·TRUNC·CEIL·FLOOR, 음수 자릿수

```sql
SELECT ROUND(-2.5) A, TRUNC(-2.5) B, CEIL(-2.5) C, FLOOR(-2.5) D FROM DUAL;
```

| A | B | C | D |
| --- | --- | --- | --- |
| -3 | -2 | -2 | -3 |

```sql
SELECT ROUND(1234.567, -2) A, TRUNC(1234.567, -2) B, ROUND(1250, -2) C, TRUNC(1239, -1) D FROM DUAL;
```

| A | B | C | D |
| --- | --- | --- | --- |
| 1200 | 1200 | 1300 | 1230 |

TRUNC 는 0 쪽으로 자르고(-2), FLOOR 는 작은 쪽으로 내립니다(-3). ROUND 는 절댓값 기준으로 반올림해서 -2.5 가 -3 입니다. 자릿수가 음수면 소수점 왼쪽에서 반올림·버림합니다 — `ROUND(1250, -2)` 는 1300.

## 8. SELECT 별칭은 WHERE·HAVING 에서 못 쓴다 (최신 Oracle 로 연습할 때 주의)

```sql
SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP WHERE ANNUAL > 30000;
```

```
ORA-00904: "ANNUAL": invalid identifier
```

WHERE 는 SELECT 보다 먼저 처리되어 ANNUAL 이라는 이름을 모릅니다. 인라인 뷰로 한 번 감싸면 됩니다.

```sql
SELECT ENAME, ANNUAL
FROM (SELECT ENAME, SAL * 12 AS ANNUAL FROM EMP)
WHERE ANNUAL >= 36000
ORDER BY ANNUAL DESC, ENAME;
```

| ENAME | ANNUAL |
| --- | --- |
| KING | 60000 |
| FORD | 36000 |
| SCOTT | 36000 |

HAVING 도 같은 이유로 SELECT 별칭을 쓰면 시험 기준으로는 오류입니다. 그런데 **Oracle 23ai 는 HAVING 에서 별칭을 받아 줍니다.** 같은 SQL 을 23ai 에서 돌리면 오류가 아니라 결과가 나옵니다.

```sql
SELECT DEPTNO, COUNT(*) AS CNT FROM EMP GROUP BY DEPTNO HAVING CNT > 3 ORDER BY DEPTNO;
```

| DEPTNO | CNT |
| --- | --- |
| 20 | 5 |
| 30 | 6 |

23ai 는 FROM 없는 SELECT 도 받아 줍니다(시험 기준은 ORA-00923). 최신 Oracle 이나 온라인 실행기로 연습하다가 "되네?" 하고 넘어가면 시험에서 틀릴 수 있습니다. 시험 기준으로는 오류로 봅니다. 시험 대비로는 `HAVING COUNT(*) > 3` 처럼 식을 그대로 적는 습관이 안전합니다.

---

## 짧게 두 개 더

- `BETWEEN 3000 AND 1000` 처럼 작은 값을 뒤에 쓰면 오류가 아니라 0행입니다(`SAL >= 3000 AND SAL <= 1000` 이 되니까). `SELECT COUNT(*) FROM EMP WHERE SAL BETWEEN 3000 AND 1000` → 0.
- `WHERE COMM = NULL` 은 0행이지만, `DECODE(NULL, NULL, '같다', '다르다')` 는 `같다` 입니다. DECODE 는 NULL 끼리를 같다고 봅니다.

---

## 결과는 어떻게 확인했나

이 글의 결과는 Oracle Database 23ai Free 컨테이너에서 실행한 값입니다. 같은 SQL 을 제가 만든 브라우저 실습장에서도 돌려서 결과가 같은지 테스트로 묶어 두었습니다(8번의 HAVING 별칭만 실습장은 시험 기준대로 ORA-00904 를 내고, 23ai 는 결과를 냅니다).

## 직접 쳐 보기

설치·가입 없이 브라우저에서 EMP·DEPT 로 바로 실행됩니다. 위 SQL 을 복사해서 숫자나 조건을 바꿔 보면 감이 빨리 옵니다. 제가 만든 사이트라는 점은 감안해 주세요. 결과가 실제 Oracle 과 다른 걸 찾으면 댓글로 알려 주세요.

- SQL 실습장: https://cert.juganlab.com/lab?utm_source=tistory&utm_campaign=sqld_oracle_traps#lab-sql
- 1번(연결 연산자): https://cert.juganlab.com/data/sqld/week3/day1?utm_source=tistory&utm_campaign=sqld_oracle_traps
- 2번(WHERE 와 NULL 비교): https://cert.juganlab.com/data/sqld/week3/day5?utm_source=tistory&utm_campaign=sqld_oracle_traps
- 3번(집계 함수): https://cert.juganlab.com/data/sqld/week4/day1?utm_source=tistory&utm_campaign=sqld_oracle_traps
- 4번(조인과 (+)): https://cert.juganlab.com/data/sqld/week4/day4?utm_source=tistory&utm_campaign=sqld_oracle_traps
- 5번(ORDER BY): https://cert.juganlab.com/data/sqld/week4/day3?utm_source=tistory&utm_campaign=sqld_oracle_traps
- 6번(서브쿼리): https://cert.juganlab.com/data/sqld/week5/day1?utm_source=tistory&utm_campaign=sqld_oracle_traps
- 7번(숫자 함수): https://cert.juganlab.com/data/sqld/week3/day2?utm_source=tistory&utm_campaign=sqld_oracle_traps
- 8번(HAVING 과 실행 순서): https://cert.juganlab.com/data/sqld/week4/day2?utm_source=tistory&utm_campaign=sqld_oracle_traps
````

### 결과 확인 기록 (블로그 글)

모든 결과는 두 군데에서 확인했다. ① 실습장 엔진(`src/lib/sql-lab/run.ts` 의 `runStatement`)을 `vite-node` 로 직접 실행, ② 같은 SQL 의 Oracle 23ai 골든(`src/lib/sql-lab/golden/results.json`). 골든 테스트가 통과하므로 ①과 ②는 같다(8번 HAVING 별칭만 의도적으로 다름).

| 글 번호 | 골든 사례 id | 비고 |
| --- | --- | --- |
| 1 | `note-w3d1-12`, `note-w8d3-1`(`'A' \|\| NULL \|\| 'B'`) | |
| 2 | `note-w3d5-12` | Oracle 이 낸 행 순서 그대로. COMM NULL 10명은 엔진 `COUNT(*) … COMM IS NULL` = 10, 골든 `gb-nullgroup` 의 NULL 묶음 10 |
| 3 | `note-w4d1-7` | |
| 4 | `note-w4d4-16`, `note-w4d4-17` | |
| 5 | `note-w4d3-10`, `note-w4d3-11` | |
| 6 | `note-w5d1-6`, `note-w8d5-2`(30번 부서 ALL 4 · ANY 12) | |
| 7 | `note-w3d2-13`, `note-w3d2-12` | |
| 8 | `note-w4d2-13`, `note-w5d2-13`, `note-w4d2-15`(23ai 결과, `VERSION_DIFFERENCES`), `err-923`(FROM 없는 SELECT) | 엔진은 HAVING 별칭에 ORA-00904 + "23ai 는 받아 주지만 시험 기준으로는 오류" 안내 |
| 덧붙임 | `wh-between-rev`, `cs-decode-nodefault` | `WHERE COMM = NULL` 0행은 `wh-eqnull` 로 확인 |

"SQL Server 는 NULL 이 가장 작다"(5번)는 레포에서 확인한 것이 아니라 일반 지식이다. 걸리면 그 문장을 빼도 글이 성립한다.

### 게시 전 체크리스트 (블로그)

- [ ] 티스토리·velog 는 본인 블로그라 홍보 규칙은 없다. 다만 글을 다른 커뮤니티(카페·오픈채팅)에 다시 퍼 나를 때는 `docs/growth/sqld-exam-week.md` 의 규칙을 따른다(홍보 금지 게시판이면 링크 줄을 뺀다).
- [ ] utm: 티스토리면 `utm_source=tistory`, velog 면 `utm_source=velog`. `utm_campaign=sqld_oracle_traps` 는 그대로.
- [ ] 한 곳에만 올린다(같은 글 두 곳 = 중복 콘텐츠).
- [ ] 올릴 때 위 SQL 을 실습장에 하나씩 붙여 넣어 결과가 글과 같은지 본다(배포된 엔진이 바뀌었을 수 있다).
- [ ] 표 안의 `\|\|` 는 마크다운 이스케이프다. 티스토리 에디터에서 표가 깨지면 1번 표 머리글을 `연결 결과` 로 바꾼다.
- [ ] 올릴 시간: SQLD 63회가 11-14(토)다. **11-11(수)~11-12(목) 저녁**을 제안한다 — 시험 직전 복습 수요가 이번 주에 몰린다. 시험이 지나도 글은 다음 회차까지 검색으로 읽힐 수 있게 날짜·회차를 제목에 넣지 않았다.
- [ ] 루트 사이트의 "SQL 실습장을 Oracle 과 대조한 개발기"가 먼저 나오면, "결과는 어떻게 확인했나" 문단 끝에 그 글 링크를 한 줄 단다(지금은 주소가 없어 넣지 않았다).

---

## 3. GitHub 프로필·README 소개 문구

현재 상태(2026-11-10 확인):
- 프로필 README(`HD152521/HD152521` 의 `Readme.md`)에 "🚀 Projects" 칸이 있고 Eventee·Cooperation Center·URR 3개가 있다. CertNote 는 없다.
- CertNote 레포 설명은 "자격증 공부용", 홈페이지 칸은 `https://cert-note.vercel.app`(→ cert.juganlab.com 으로 301). README 는 create-next-app 기본 문구 그대로다.

### 제안 1 — CertNote 레포 About (설명·Website 칸)

- Description: `무료 한국어 자격증 학습 사이트 — AWS·리눅스마스터·SQLD. 실제 Rocky Linux 8.8·Oracle 출력과 골든 테스트로 맞춘 브라우저 셸·SQL 실습장`
- Website: `https://cert.juganlab.com/?utm_source=github&utm_campaign=repo_about`
  (리다이렉트를 한 번 덜 거치게 vercel 주소 대신 실제 도메인으로)

### 제안 2 — CertNote README 맨 위 (기본 문구 대신)

```markdown
# CertNote

무료 한국어 자격증 학습 사이트 — https://cert.juganlab.com/?utm_source=github&utm_campaign=readme

브라우저 안에서 도는 리눅스 셸·Oracle SQL 실습장이 있습니다. 출력은 실제 Rocky Linux 8.8 컨테이너(셸 26개 시나리오 423단계)와 Oracle Database 23ai Free(SQL 957개 사례)에서 찍은 결과와 골든 테스트로 맞춥니다.
```

아래의 create-next-app 기본 문구(Getting Started 등)는 지우거나 "개발 실행" 정도로 줄인다. README 를 바꾸는 건 레포 커밋이라 사용자가 정하면 따로 PR 로 한다(이 PR 에서는 바꾸지 않았다).

### 제안 3 — 프로필 README 의 "🚀 Projects" 칸

기존 프로젝트와 같은 모양으로 맨 위나 맨 아래에 한 항목:

```markdown
### CertNote — 무료 한국어 자격증 학습 사이트

AWS·리눅스마스터·SQLD 학습 노트와 브라우저 실습장. 리눅스 셸·Oracle SQL 시뮬레이터의 출력을 실제 Rocky Linux 8.8·Oracle 결과와 골든 테스트로 맞췄습니다.
→ https://cert.juganlab.com/?utm_source=github&utm_campaign=profile
```

기간·역할·스택 표는 사용자가 채운다(기간을 레포에서 단정하지 않았다).

### 게시 전 체크리스트 (GitHub)

- [ ] 레포 About 은 GitHub 웹에서 레포 오른쪽 톱니바퀴로 고친다.
- [ ] utm: `utm_source=github`, `utm_campaign` 은 `repo_about` / `readme` / `profile` 로 나눠 어디서 왔는지 구분한다.
- [ ] 숫자(26·423·957)는 README 에 박히면 금방 낡는다. 숫자를 빼고 "골든 테스트로 맞춥니다"만 남겨도 된다.
- [ ] LICENSE 가 없으므로 "오픈소스" 라고 쓰지 않는다.
- [ ] 시간 제약 없음. Show GN 을 올리기 **전에** 해 두면 긱뉴스에서 레포로 들어온 사람이 기본 README 를 보지 않는다.

---

## 4. 올리는 순서 제안

1. GitHub About·README 정리 (Show GN 에 레포 링크가 들어가므로 먼저)
2. 블로그 글 — 11-11~12 저녁 (SQLD 63회 직전)
3. Show GN — 위 두 개가 끝난 뒤 평일 오전, 댓글에 답할 수 있는 날

올린 곳·날짜는 메인 세션이 `docs/growth-100.md` "지금까지 한 것"에 기록한다(이 PR 에서는 그 문서를 고치지 않았다).
