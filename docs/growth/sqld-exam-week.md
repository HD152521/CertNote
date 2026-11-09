# SQLD 63회(11-14) 직전 글 초안

올리기 전에: 게시판이 홍보를 막는지 확인하고, 막으면 링크 줄을 빼고 올린다. 링크의 `utm_source` 는 올리는 곳에 맞게 바꾼다.

---

## A. 카페·에브리타임용 (긴 글)

**제목:** SQLD 시험 전에 Oracle 에서 직접 돌려 보면 바로 정리되는 것 6가지

SQLD 는 Oracle 문법 기준인데, 책으로만 보면 결과가 어떻게 나오는지 헷갈리는 게 몇 개 있어요. 시험에 자주 나오는 것만 추렸어요.

1. **빈 문자열 '' 은 NULL 이다.** 그래서 `WHERE COMM = ''` 는 한 행도 안 나와요. `IS NULL` 로 써야 해요.
2. **NOT IN 서브쿼리에 NULL 이 하나라도 있으면 결과가 0행.** `WHERE EMPNO NOT IN (SELECT MGR FROM EMP)` 는 MGR 에 NULL 이 있어서 아무것도 안 나와요.
3. **COUNT(*) 와 COUNT(열)은 다르다.** COUNT(COMM) 은 NULL 을 빼고 셉니다. AVG 도 NULL 을 빼고 나눠요.
4. **ROWNUM 은 ORDER BY 보다 먼저 붙는다.** 정렬한 뒤 위에서 3명을 자르려면 정렬을 인라인 뷰 안에 넣어야 해요.
5. **RANK·DENSE_RANK·ROW_NUMBER.** 동점이 있을 때 RANK 는 1,1,3 / DENSE_RANK 는 1,1,2 / ROW_NUMBER 는 1,2,3.
6. **ROLLUP(A, B) 는 3단계, CUBE(A, B) 는 4단계로 묶는다.** (A,B) (A) 전체 vs 여기에 (B) 까지.

이걸 직접 쳐 보고 싶어서 브라우저에서 바로 SQL 을 돌릴 수 있는 실습장을 만들었어요. 설치나 가입 없이 EMP·DEPT 테이블로 바로 실행되고, 결과와 오류 문구를 실제 Oracle 에서 찍은 결과와 맞춰 뒀어요. 제가 만든 사이트라 참고만 해 주세요.

https://cert.juganlab.com/lab?utm_source=cafe&utm_campaign=sqld63#lab-sql

모의고사 100문항(2회분)도 있는데 이건 무료 가입 후에 풀 수 있어요.

다들 이번 주 토요일 잘 보세요!

---

## B. 오픈채팅·댓글용 (짧게)

SQLD 문제 풀다가 결과가 헷갈리면 바로 쳐 볼 수 있는 곳이에요. 설치 없이 브라우저에서 Oracle 문법 그대로 EMP·DEPT 로 돌아가요. 제가 만든 거라 써 보고 이상한 거 있으면 알려 주세요.
https://cert.juganlab.com/lab?utm_source=openchat&utm_campaign=sqld63#lab-sql

---

## C. 질문 글에 답할 때

누가 "NOT IN 결과가 왜 0건이에요?" 같은 질문을 올리면, 이유를 먼저 답하고 마지막에 한 줄만:

> 직접 돌려 보면 바로 보여요: https://cert.juganlab.com/lab/sql-subquery-rollup?utm_source=answer&utm_campaign=sqld63
