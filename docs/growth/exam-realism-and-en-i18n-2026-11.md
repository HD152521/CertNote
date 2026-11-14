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
- 보류 항목 재검증(11-14, 공식 문서 대조):
  - SnapStart 서술(dop week7/day3·day5): 고침. 공식 문서(lambda/latest/dg/snapstart.html, 2026-11-14 확인)는 "Java 11 and later, Python 3.12 and later, .NET 8 and later", ZIP·컨테이너 이미지 모두 지원, Provisioned Concurrency·EFS·512MB 초과 임시 스토리지 미지원, Java 관리형 런타임은 추가 비용 없음. 지원 런타임/패키지 표, 컨테이너 "SnapStart 불가" 서술 4곳, 근거 없는 단가($0.0000015625/GB-s)를 고침(한국어·영어 동시). dop week7/day2 는 이미 시점 표기("2024년 12월 기준")가 있어 유지.
  - Aurora "30초"(saa week5 day1·day2·day5): 고침. Aurora 문서(AuroraUserGuide/Concepts.AuroraHighAvailability.html)는 "service is typically restored in less than 60 seconds, and often less than 30 seconds". "30초 이내" 단정을 "보통 60초 미만, 종종 30초 미만"으로 바꾸고 보기 C의 "30초 페일오버"는 "빠른 페일오버"로 바꿈(정답 글자 불변).
  - en/saa-c03 week3/day2 "Multi-AZ 30초": 이 문장은 RDS가 아니라 FSx for Windows 이야기. FSx 문서(fsx/latest/WindowsGuide/high-availability-multiAZ.html)는 "typically completes in less than 30 seconds" 라서 "보통 30초 미만"으로만 다듬음(한국어 원문도 같이). RDS Multi-AZ 인스턴스는 공식 "typically 60–120 seconds"(Concepts.MultiAZ.Failover.html)이며 본문 표기와 일치.
  - 정답이 둘로 읽히는 문제: dva week7/day1 문제6("A도 부분 정답" 꼬리표 삭제), dva week7/day5 문제2(문제문에 "Aurora가 아닌" 조건 추가, "또는 C도 가능" 삭제, 해설 보정)만 정리. 나머지는 보류 유지: dva week7/day1 문제7(B/C 중 C가 우월하다는 "가장 적합" 문제), dva week7/day5 문제3·7, week13/day4 문제6("B 또는 D"), sap week1/day2("C 또는 B"), soa week4/day2("B 또는 C"), saa week3/day5·week4/day5("A, B 모두") — 문제문 제약을 새로 지어내야 해서 공식 문서 근거만으로는 고칠 수 없음.
  - Aurora Serverless v1 수치: 보류 유지. 공식 문서로 확인된 것은 종료일(2025-03-31, 문서 안내)뿐이며, "2배 단위 점프·분 단위 확장·일시정지 후 ~30초" 수치는 공식 문서 원문을 가져오지 못해 확인 불가.
  - 따로 발견(미수정): saa week6/day1·day5, sap week8/day1·day5, dva week13/day1·day4 에 "SnapStart = Java(또는 Java/Python/.NET 무료)" 표기가 남아 있음(Java만 무료, Python/.NET 은 과금). dva week7/day5 문제2·10 등의 "동기 quorum 복제"는 공식 표현이 semisynchronous(Multi-AZ DB 클러스터 문서). 페일오버 "35초 이내"는 공식("typically under 35 seconds")과 일치.
  - 위 "따로 발견" 항목 처리(11-14, 공식 문서 snapstart.html 대조): sap week8/day1·day5, dva week13/day1·day4, saa week6/day1, dva week3/day1·day3·day5 의 SnapStart 서술을 "Java 관리형 런타임 추가 비용 없음, Python/.NET 캐시·복원 요금, Java 11+/Python 3.12+/.NET 8+" 로 고침(가격 수치는 쓰지 않음). dva week3/day1 문제1: 정답 B 유지, 오답 A/C 해설을 정확한 근거로 다시 씀. 보기 D("PC와 동시 활성화 불가")는 공식 문서상 사실이라 정답이 둘이 되므로 "PC가 반드시 함께 구성되어야 한다"로 바꿈(키 불변). dop week7/day2 문제2·5 는 (2024년 말 기준) 표기를 유지하고 해설 끝에 "현재는 Python·.NET·컨테이너 이미지도 지원 — 시점 주의" 덧붙임.
  - 검증: quizContract·enContentLanguage 시험 4건 통과, 손댄 9쌍 ko/en 문제 수·정답 글자 일치, 영어 파일 한글 0.
- 남은 일: 위 보류 항목 중 미수정분, 색인 감소 원인(GSC 캡처 필요).
- 보류: `<html lang>` 서버 반영(라우트 구조 변경이 커서 SEO 영향 대비 비용이 큼), `/lab` 영어화.

## 4. 사용자 쪽 일정(변동 없음)

- SQLD 시험 전날(11-13): 카페·에브리타임 글, 오픈채팅은 저녁.
- GSC: cert 사이트맵 재제출, 11-20 전후 재확인, 11-24 전후 애드센스 검토 요청.
