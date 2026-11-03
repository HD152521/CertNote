# SQLD 트랙 추가 계획

작성 2026-11-03. 선례: [linux-master-2-plan.md](./linux-master-2-plan.md) (뼈대 → 주차별 집필 → 모의고사 순서).

## 0. 왜 만드는가

- SQLD 는 연 4회 시행되는 데이터 자격증이다. 개발자·데이터 직군 취업 준비생이 많이 응시해서 검색 수요가 크다.
- 지금 CertNote 의 차별점은 "읽은 걸 손으로 쳐 보는 실습, 출력은 실제 시스템과 대조" 이다(리눅스 셸 연습장, 실기 P1·P2).
  SQLD 에서 같은 일을 하면 "SQL 을 실제로 돌려 보고 결과를 확인하는 SQLD 노트" 가 되어, 요약·기출 복원 위주의 기존 자료와 갈라진다.

## 1. 시험 사실 (한국데이터산업진흥원 dataq.or.kr, 2026-11-03 확인)

| 항목 | 내용 |
|---|---|
| 과목 | 1과목 데이터 모델링의 이해 (10문항, 20점) · 2과목 SQL 기본 및 활용 (40문항, 80점) |
| 문항 | 50문항 전부 객관식 (단답형 없음), 문항당 2점 |
| 시간 | 90분 |
| 합격 | 총점 60점 이상, 과목별 40% 미만이면 과락 |
| 응시 자격 | 제한 없음 |
| 시행 | 연 4회 정기 시행 |
| 응시료 | 공식 페이지에서 확인 못 함 — exam-info 에 넣기 전에 접수 페이지에서 확인할 것 |

### 출제 범위 (공식 세부항목)

- 1과목 데이터 모델링의 이해
  - 데이터 모델링의 이해: 데이터모델의 이해, 엔터티, 속성, 관계, 식별자
  - 데이터 모델과 SQL: 정규화, 관계와 조인의 이해, 모델이 표현하는 트랜잭션의 이해, Null 속성의 이해, 본질식별자 vs 인조식별자
- 2과목 SQL 기본 및 활용
  - SQL 기본: 관계형 데이터베이스 개요, SELECT 문, 함수, WHERE 절, GROUP BY·HAVING 절, ORDER BY 절, 조인, 표준 조인
  - SQL 활용: 서브쿼리, 집합 연산자, 그룹 함수, 윈도우 함수, Top N 쿼리, 계층형 질의와 셀프 조인, PIVOT 절과 UNPIVOT 절, 정규 표현식
  - 관리 구문: DML, TCL, DDL, DCL

출처: https://www.dataq.or.kr/www/sub/a_04.do

## 2. 커리큘럼 제안 — 8주 / 40일

배점이 2과목 80점이라 SQL 에 6주를 쓴다. 1과목은 2주로 압축하되 과락(8점 미만)을 피할 만큼은 다룬다.

| 주 | 주제 | 다루는 세부항목 |
|---|---|---|
| W1 | 데이터 모델의 뼈대 | 데이터모델의 이해(3단계 스키마, 개념·논리·물리), 엔터티, 속성, 관계 |
| W2 | 식별자와 정규화 | 식별자, 정규화(1~3NF·BCNF, 반정규화), 관계와 조인, 트랜잭션, Null 속성, 본질 vs 인조식별자 |
| W3 | SELECT 와 함수 | RDB 개요, SELECT, 문자·숫자·날짜·변환 함수, NULL 함수(NVL·NVL2·NULLIF·COALESCE), CASE·DECODE, WHERE |
| W4 | 묶고 정렬하고 잇기 | GROUP BY·HAVING, ORDER BY, 실행 순서, 조인(EQUI·Non-EQUI·Oracle (+)), 표준 조인(INNER·NATURAL·USING·ON·CROSS·OUTER) |
| W5 | 쿼리 안의 쿼리 | 서브쿼리(단일·다중행, 상관, 스칼라, 인라인 뷰), 집합 연산자, 그룹 함수(ROLLUP·CUBE·GROUPING SETS·GROUPING) |
| W6 | 순위와 계층 | 윈도우 함수(순위·집계·LAG/LEAD·비율), Top N(ROWNUM·FETCH FIRST·TOP), 계층형 질의(CONNECT BY), 셀프 조인 |
| W7 | 모양 바꾸기와 관리 구문 | PIVOT·UNPIVOT, 정규 표현식(REGEXP_*), DML, TCL(COMMIT·ROLLBACK·SAVEPOINT), DDL·제약조건, DCL(GRANT·REVOKE·ROLE) |
| W8 | 시험 직전 | 단골 함정 정리(NULL 연산·COUNT(*) vs COUNT(열)·실행 순서·Oracle 과 SQL Server 차이), 실전 모의고사 |

- 하루 노트마다 연습문제 5개(지금 트랙과 같은 형식) → 200문항.
- 모의고사 은행 content/exams/sqld.json: 과목 비율대로 1과목 10 : 2과목 40, 우선 100문항(2회분).

## 3. SQL 실습장 — 차별점의 핵심, 엔진 선택

시험은 Oracle 문법이 기본이고 SQL Server 차이를 묻는 문항이 섞인다(ROWNUM, CONNECT BY, (+) 조인, NVL, DECODE, Oracle 식 PIVOT).

| 방식 | 장점 | 문제 |
|---|---|---|
| SQLite(sql.js)·Postgres(PGlite) 를 브라우저에서 | 진짜 엔진, 빨리 붙는다 | ROWNUM·CONNECT BY·(+)·DECODE·NVL 이 없거나 다르게 동작 — 시험 문법을 못 돌리거나 틀린 결과를 보여 준다 |
| 미리 찍어 둔 결과만 보여 주기 | 정확, 쉽다 | 정해진 쿼리만 — "손으로 바꿔 쳐 보기" 가 안 된다 |
| **Oracle 부분집합 해석기를 직접 만들고, Oracle Database Free 컨테이너 골든으로 대조** | 시험 문법 그대로, 셸 연습장과 같은 신뢰 방식 | 일이 크다 → 단계로 나눈다 |

권장: 셋째 방식. 리눅스 셸 연습장과 같은 구조(해석기 + 실제 시스템 골든 + 상태 기반 채점)라 이미 검증된 방법이다.

- S1: SELECT·WHERE·함수·GROUP BY·HAVING·ORDER BY·조인(ANSI 와 (+)) — W3·W4 실습
- S2: 서브쿼리·집합 연산자·ROLLUP/CUBE/GROUPING SETS·윈도우 함수·ROWNUM·CONNECT BY — W5·W6
- S3: PIVOT·REGEXP·DML·TCL(트랜잭션)·DDL 제약조건 — W7

골든 환경: gvenzl/oracle-free 컨테이너, EMP·DEPT 같은 시험 단골 예제 테이블을 고정 데이터로 넣고 결과 집합을 비교한다. 퀴즈 연결(문항의 SQL 을 바로 실행)도 리눅스와 같은 방식으로 붙인다.

## 4. 사이트 구조

- 새 섹션 `data` (공개 URL `/data/sqld/weekN/dayM`, 사이드바 "Data"). 리눅스를 붙일 때와 같은 자리를 고친다:
  `src/lib/category.ts`(Section·SECTIONS·라벨), `src/lib/levels.ts`, `src/app/data/[slug]/...` 라우트, 사이드바·홈·랜딩, 사이트맵.
- 콘텐츠는 리눅스처럼 `content/aws-certs/sqld/` 에 두고 meta.section 으로 구분한다(물리 이동 없음).
- `scripts/sync-content.mjs` 는 쓰지 않는다(이 저장소에서 직접 집필).

## 5. 집필 안전망 (리눅스 2급과 같음)

- 사실 확인이 필요한 수치(응시료, 일정)는 공식 페이지 확인 날짜를 남긴다.
- 문항 정답 분포 쏠림 점검, 보기 길이 편향 점검(기존 qa 스크립트 재사용).
- SQL 예제의 결과표는 손으로 쓰지 않는다 — Oracle 컨테이너에서 실행한 결과를 붙인다. 실습장(S1) 전이라도 노트의 결과표는 컨테이너로 확인한다.

## 6. 실행 순서

1. 뼈대: meta.json, exam-info/sqld.json, README(커리큘럼), 섹션 `data` 활성화 → 빈 트랙이 사이트에 보이는지 확인.
2. Oracle Free 컨테이너 + 예제 스키마(EMP·DEPT 등) 준비 — 노트의 결과표 검증용.
3. W1~W8 집필(주차마다 커밋, 주차마다 정답 분포 점검).
4. 모의고사 100문항.
5. SQL 실습장 S1 → S2 → S3 (각 단계 골든 통과 후 공개).

## 7. 결정 (2026-11-03)

- 섹션·URL: `/data/sqld` (섹션 `data`, 사이드바 "Data"). ADsP 등은 같은 섹션에 붙인다.
- 순서: W3·W4 와 실습장 S1 을 같이 진행한다("실습되는 SQLD" 를 먼저).
- 기간: 8주 40일 그대로.

## 8. 진행 현황 (2026-11-03)

- 공개: W1~W4(20일, 100문항, PR #41). W5(서브쿼리·집합·ROLLUP·CUBE·GROUPING SETS, 실습장 S3·WITH 절)는 주차 단위 PR 로 올린다(검토 에이전트 `.claude/agents/sqld-week-reviewer.md` PASS 후 머지). meta.json 은 실제 파일 수(4주 20일)로 두고, W5~W8 을 올릴 때 8주 40일로 바꾼다.
- 실습장 엔진 `src/lib/sql-lab`: SELECT·WHERE·함수·GROUP BY·HAVING·ORDER BY·조인(ANSI·(+))·서브쿼리·집합 연산·FETCH FIRST 까지. 윈도우 함수·계층형 질의·ROLLUP·PIVOT·REGEXP·DML 은 "n단계에서 열린다" 안내를 낸다(가짜 ORA 오류를 내지 않는다).
- 골든: `node scripts/sql-lab/cases.mjs && node scripts/sql-lab/golden.mjs` → `src/lib/sql-lab/golden/results.json`. 사례는 직접 쓴 것 + 노트의 ```sql 블록 전부 + 과제 모범 답안. 23ai 와 시험 기준이 다른 곳(FROM 없는 SELECT, HAVING·GROUP BY 의 SELECT 별칭)은 시험 기준 오류에 설명(hint)을 붙이고 테스트의 VERSION_DIFFERENCES 에 적는다.
- 화면: 노트의 ```sql 블록에 "실습장에서 실행하고 고쳐 보기", 퀴즈 해설 아래 "문제의 SQL 직접 실행해 보기", `/lab/sql-select-basics`·`/lab/sql-group-join` 과제 16개(결과 집합으로 채점).
- 남은 일: W5~W8 집필, 실습장 2단계(윈도우 함수·ROWNUM 심화·CONNECT BY·ROLLUP), 3단계(PIVOT·REGEXP·DML·TCL·DDL), 모의고사 100문항, 응시료 확인.
