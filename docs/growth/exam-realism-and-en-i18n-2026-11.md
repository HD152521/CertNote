# 모의고사 상황 상세화 + 영어판 전체 번역 (2026-11-12 ~ 11-13)

PR #62~#70 에서 한 일을 한곳에 정리한다. 세부 근거는 각 PR 설명에 있다.

## 1. 모의고사 문제를 실제 시험 수준으로 상세화 (#63, #64)

- 문제: 문제문이 덤프(실제 시험) 대비 너무 짧았다. 실제 문항은 회사·현황·제약 조건을 길게 준다.
- 한 일: AWS 11개 자격증 `content/exams/*.json` 의 문제문을 시나리오(상황 → 제약 → 질문) 형태로 확장.
  덤프 문항을 가져오지 않고, 같은 수준의 상세도로 새로 썼다.
- 길이 중앙값(글자): CLF 163 · AIF 157 · SAA 348 · DVA 341 · SOA 335 · DEA 346 · MLA 365 · SCS 397 · MLS 391 · SAP 564 · DOP 562.
- 가드: `src/lib/exam/examStyle.test.ts` 의 길이 기준을 등급별로 올림
  (foundational / associate / specialty / professional). 정답 보기가 가장 긴 비율 40% 이하도 유지.
- 사실 검증: 정답을 숨기고 푸는 검토 + 공식 문서 대조로 오류 수정
  (CLF 22/60/62, SAA 7/16/19/33/37/43, DEA 8/15/38, SCS 40/42/51/53/54, DVA 10/13/38/47, SOA 33, SAP 37/52/67/73, DOP 10/13).
  SCS 8 은 검토자가 틀렸고 원문이 맞았다(blue/green 에서도 CMK 지정 가능).
- 작성 규칙: `docs/exam-style-guide.md` 10절.

## 2. 영어 전환 시 모든 페이지가 영어로 (#65~#70)

### 모의고사·시험 정보 (#65)
- 영어 문제은행 `content/exams-en/<slug>.json` 11개(735문항) → `scripts/build-exam-index.mjs` 가
  `src/data/exam-questions-en.json` 생성. 정답은 한국어 은행의 것을 쓴다.
- `/api/exam/start|check|submit` 은 요청 본문의 `lang`(`'en'|'ko'`)을 받는다. 영역 키는 한국어로 두고(필터·집계),
  화면에는 `domainLabel` 을 보여 준다. 영어 문항이 없으면(SQLD·리눅스마스터) 한국어로 대체.
- 시험 정보 카드: `content/exam-info-en/<slug>.json` 을 `localizeExamInfo` 가 병합(수치·URL 은 한국어 원본).
- 테스트: `examI18n.test.ts`(영어 완전성·한글 없음·라벨·대체), `examInfoEn.test.ts`.

### 영어 노트 (#66~#70)
- #66: 영어 노트 연습 문제 약 8,900줄 번역(마커·소제목 변환 포함).
- #67: 영어판에 빠져 있던 연습 문제 약 490개를 한국어 원문에서 채움.
- #68~#70: 요약본·자리표시였던 영어 노트 305개(50 + 127 + 128)의 본문을 한국어 원문 기준으로 전체 번역.
  결과: 영어 노트 625개 중 본문이 한국어의 100% 미만인 파일 없음(전체 번역은 보통 1.4~2.1배).
- 운영 확인(11-13): `/en/mla-c01/week9/day3`, `/en/mls-c01/week8/day3`, `/en/soa-c02/week11/day2`,
  `/en/aif-c01/week4/day1` 모두 200, 한글은 사이트 태그라인과 운영자명 "주간랩스"뿐.

## 3. 이후 진행(11-13~14, #72~#74)와 남은 일

- #72: 영어판 전 주차 공개(`EN_INDEXABLE_WEEK` 제거)와 낡은 영어 노트 120개 재번역. 번호가 어긋났던 영어 문제 묶음(DVA week11, DOP week7/12, SAP week15/16)과 SAP week15/day1 의 자리표시도 이때 해소됐다(11-14 재확인: 영어 노트 전체에 한글·자리표시 0건, 문제 수 부족 파일 0개).
- #73: SQLD·리눅스마스터 1·2급 영어판 167쪽, 영어 모의고사·시험 정보, 다이어그램 SVG 32개, 언어 전환 버튼(`enEdition.ts`).
- #74: 영어 화면의 한글 잔존 수정(사이드바 레벨 라벨, SQLD·리눅스마스터 시험 정보 카드, 영어 허브 JSON-LD 설명, SQL 실행 버튼, 작업 잔재 줄 4곳).
  운영 사이트맵 1,648개 전수 크롤(11-14)에서 비200·canonical·noindex·H1·hreflang 이상 0건.
- #75: 영어 SQL 실습 UI(엔진 안내문 28종 영어 매핑 포함)와 영어 OG 카드 라벨.
- 영어 정보 페이지: /en/about·how-we-make·roadmap(+직무 6개)·changelog·contact·terms·privacy 와 푸터·헤더·언어 전환 연결, hreflang·사이트맵 등록.
- 한국어 원문 오류 정정(11-14): PR #66~#73 의 의심 항목 43개를 분류해 공식 문서로 확인된 것만 한국어·영어 같이 고침.
  고친 것: DynamoDB 트랜잭션 100개, Secrets Manager 64KB, Control Tower 2019, GuardDuty severity 1.0–10.0, IAM 평가 7단계, SnapStart 시점 표기(문제 2·5), Aurora 페일오버 "보통 60초 미만", SQS 가시성 타임아웃 부등호, Redis 해시 태그 보기, 침해 대응 체크리스트 순서, 100ms 지연 인용 출처, 소제목·중복 정답 줄.
  보류(근거 불충분): 정답이 둘로 읽히는 문제(dva week7/day1·day5, week13/day4, sap week1/day2, soa week4/day2, saa week3/day5·week4/day5 등), SnapStart 보기 자체, IAM 다이어그램 순서, Aurora Serverless v1 수치,
  saa week5/day2·day5 의 "30초" 시험 키워드·보기, en/saa-c03 week3/day2 의 Multi-AZ 30초, dop week7/day3·day5 등의 SnapStart Java 전용 서술.
- 남은 일: 위 보류 항목 정리, 색인 감소 원인(GSC 캡처 필요).
- 보류: `<html lang>` 서버 반영(라우트 구조 변경이 커서 SEO 영향 대비 비용이 큼), `/lab` 영어화.

## 4. 사용자 쪽 일정(변동 없음)

- SQLD 시험 전날(11-13): 카페·에브리타임 글, 오픈채팅은 저녁.
- GSC: cert 사이트맵 재제출, 11-20 전후 재확인, 11-24 전후 애드센스 검토 요청.
