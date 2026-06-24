# Day 3 - Managed AI 서비스 심화: 사전 학습형 AI의 선택 논리와 동기·비동기 패턴

머신러닝 프로젝트의 80%는 사실 "모델을 처음부터 만들 필요가 없는" 문제다. 영수증에서 금액을 뽑고, 음성을 텍스트로 바꾸고, 이미지에서 부적절한 콘텐츠를 거르고, 텍스트의 감정을 분석하는 일은 이미 잘 풀린 문제다. 직접 데이터를 모아 모델을 학습시키는 건 시간·비용·전문성 측면에서 낭비다. AWS의 **Managed AI(사전 학습형 AI) 서비스**는 이 "이미 풀린 문제"를 API 한 번으로 쓰게 해준다. SAP-C02 시험에서 이 영역은 깊은 이론보다 **"이 시나리오에는 어느 서비스를 골라야 하나"를 즉답**하는 매핑 능력으로 출제된다. 다만 함정이 있다 — Macie vs Comprehend PII, Kendra vs OpenSearch처럼 비슷해 보이는 서비스의 경계를 정확히 알아야 한다.

오늘은 서비스를 나열하는 대신, 이들이 어떤 카테고리 논리로 갈라지는지, 동기·비동기·배치 호출 패턴이 왜 다른지, 그리고 시험에서 헷갈리는 경계들을 분해한다.

## 사전 학습형 AI의 가치 — "build vs buy"의 명확한 답

직접 OCR 모델을 만든다고 상상해보자. 수만 장의 문서를 레이블링하고, CNN 아키텍처를 설계하고, GPU로 며칠 학습하고, 정확도를 튜닝하고, 서빙 인프라를 구축해야 한다. 수개월과 수십만 달러가 든다. 그런데 그 결과물이 AWS Textract보다 나을 가능성은 거의 없다 — Textract는 수억 장의 문서로 학습됐고 AWS가 계속 개선한다. 이게 사전 학습형 AI가 "build vs buy"에서 거의 항상 "buy"인 이유다.

이 서비스들의 공통 특성은 (1) **API 호출만으로 즉시 사용**, (2) **인프라·모델 관리 0**, (3) **사용량 기반 과금**(처리한 페이지·분·이미지당)이다. 직접 모델이 필요한 경우는 "AWS 서비스가 못 푸는 도메인 특화 문제"뿐이고, 그때조차 Custom Labels(Rekognition)·Custom Classification(Comprehend)처럼 **전이학습 기반 커스터마이징**으로 적은 데이터로 해결하는 길이 있다.

> 💡 **관련 이론**: 사전 학습형 AI 서비스의 기반은 **전이학습(transfer learning)**과 대규모 사전학습이다. AWS는 거대한 일반 데이터셋으로 모델을 학습시켜 두고(예: Rekognition의 객체 인식, Comprehend의 언어 이해), 사용자는 그 위에 자기 데이터를 약간 얹어 도메인에 맞춘다(Custom Labels). 이는 "바닥부터 학습"하는 것보다 데이터가 수백~수천 배 적게 든다. 사전학습된 표현(representation)이 이미 일반적 특징을 담고 있어, 마지막 층만 자기 문제에 맞게 조정하면 되기 때문이다. ImageNet 사전학습이 컴퓨터 비전을 대중화한 것과 같은 원리다.

## 카테고리 매트릭스 — 무엇이 어느 칸에 들어가는가

| 카테고리 | 서비스 | 핵심 기능 |
|----------|--------|-----------|
| **NLP(텍스트 이해)** | Comprehend | 감정·엔티티·언어 감지·PII 탐지·토픽 모델링 |
| **NLP-의료** | Comprehend Medical | 의료 텍스트 NER(진단·약물·용량) |
| **번역** | Translate | 다국어 실시간 번역 |
| **음성→텍스트(STT)** | Transcribe (+Medical) | 음성 인식, 화자 분리, 자동 자막 |
| **텍스트→음성(TTS)** | Polly | Neural TTS 음성 합성 |
| **문서 OCR** | Textract | 양식·표·서명·영수증·ID 추출 |
| **이미지/영상** | Rekognition | 객체·얼굴·콘텐츠 검수·텍스트·라이브니스 |
| **검색** | Kendra | 엔터프라이즈 시맨틱(자연어) 검색 |
| **챗봇** | Lex | 음성·텍스트 봇(Alexa 엔진) |
| **추천** | Personalize | 실시간 개인화 추천 |
| **사기 탐지** | Fraud Detector | 온라인 사기 점수화 |
| **코드/운영** | CodeGuru / DevOps Guru | 코드 리뷰·프로파일 / 운영 이상 탐지 |
| **헬스케어** | HealthLake / HealthOmics | FHIR 데이터레이크 / 유전체 분석 |

이 매트릭스에서 시험이 묻는 건 "입력이 무엇이고 출력이 무엇인가"다. 입력이 음성이면 Transcribe, 이미지면 Rekognition, 문서(레이아웃이 있는)면 Textract, 자유 텍스트면 Comprehend. 출력이 음성이면 Polly, 추천이면 Personalize.

## Textract 심화 — 단순 OCR이 아닌 구조 이해

Textract가 일반 OCR과 다른 점은 **문서의 구조(레이아웃)를 이해**한다는 것이다. 단순 OCR은 "이미지에서 글자를 뽑기"만 하지만, 청구서·계약서·신분증은 "이 숫자가 총액이고, 이 표의 3행 2열이 수량"이라는 구조적 의미가 중요하다. Textract는 이를 위해 용도별 API를 분리한다.

- **DetectDocumentText**: 단순 텍스트 추출(기본 OCR)
- **AnalyzeDocument**: 표(Table)·양식(Form, key-value)·서명·쿼리 추출 — 구조화된 문서
- **AnalyzeExpense**: 영수증·청구서 전용(품목·금액·세금 자동 식별)
- **AnalyzeID**: 신분증(여권·면허증)에서 필드 추출
- **비동기 API(StartDocumentAnalysis)**: 대용량 다중 페이지 PDF — S3 입력, 작업 완료 후 결과 조회

> 🔍 **더 깊이**: Textract의 비동기 API가 별도로 있는 이유는 처리 시간 때문이다. 한 장짜리 영수증은 동기 API로 수백 ms에 끝나지만, 수백 페이지 PDF는 수십 초~수 분이 걸려 동기 HTTP 응답으로는 타임아웃이 난다. 그래서 대용량은 `StartDocumentAnalysis`로 작업을 시작하고(JobId 반환), 처리 후 SNS 알림을 받거나 `GetDocumentAnalysis`로 폴링해 결과를 가져온다. 이 "동기는 소량, 비동기는 대용량" 패턴은 Rekognition Video, Transcribe, Comprehend 배치 작업에서 똑같이 반복된다 — 처리 시간이 HTTP 타임아웃을 넘으면 무조건 비동기다.

> 🎯 **시나리오**: "월 수만 건의 공급사 청구서 PDF를 자동 처리해 품목·금액·세금을 추출하고, 추출된 데이터에서 담당자 개인정보를 마스킹한 뒤 DB에 저장해야 한다. 어떤 조합인가?" — 답은 **Textract AnalyzeExpense(청구서 항목·금액 추출) + Comprehend DetectPiiEntities(텍스트 내 PII 탐지·마스킹) + DynamoDB**. AnalyzeExpense는 영수증·청구서에 특화돼 품목·금액·세금을 자동 식별한다(범용 AnalyzeDocument보다 정확). 추출된 텍스트의 PII는 Comprehend로 탐지·마스킹한다. 함정: 청구서는 AnalyzeExpense(전용)가 AnalyzeDocument보다 정확하고, 임의 텍스트 PII는 Comprehend(S3 대상이면 Macie).

## Comprehend vs Macie — PII 탐지의 두 경계

이게 시험의 단골 함정이다. 둘 다 PII를 탐지하지만 **대상이 다르다**.

- **Comprehend DetectPiiEntities**: **임의의 텍스트**에서 PII 탐지. API에 텍스트를 보내면 이름·주민번호·카드번호 등의 위치를 반환. 애플리케이션 흐름 중 텍스트를 실시간 검사할 때.
- **Macie**: **S3 버킷**에 저장된 데이터에서 PII 탐지. S3를 스캔해 민감 정보가 든 객체를 찾아 보안 알림을 낸다. 데이터 거버넌스·규정 준수(어느 버킷에 민감 데이터가 있나)용.

기준은 "대상이 흘러가는 텍스트인가, S3에 저장된 데이터인가"다.

> ⚠️ **함정**: "PII를 탐지하라"는 문제에서 대상이 명시되지 않으면 둘 다 답처럼 보인다. 결정 키워드는 **S3**다. "S3 버킷에 저장된 데이터의 PII를 식별·분류"면 Macie. "콜센터 대화 텍스트/문서 내용/API로 들어온 텍스트의 PII"면 Comprehend. Macie를 임의 텍스트 검사에 쓰거나 Comprehend를 S3 데이터 거버넌스에 쓰는 건 둘 다 오답. 보너스: GuardDuty(위협 탐지), Inspector(취약점 스캔)는 PII와 무관하니 PII 문제에서 보이면 함정.

## Kendra vs OpenSearch — 시맨틱 검색 vs 키워드 검색

또 다른 단골 경계다. 둘 다 검색이지만 작동 방식이 다르다.

- **Kendra**: **시맨틱(자연어) 검색**. "작년 4분기 휴가 정책이 뭐야?" 같은 자연어 질문에 의미를 이해해 답한다. 사내 데이터 소스(SharePoint, S3, Confluence 등) 커넥터와 문서 수준 권한(ACL)을 지원해 엔터프라이즈 검색에 특화. ML 기반.
- **OpenSearch**: **키워드·풀텍스트 검색**(역색인). 빠르고 유연하지만 기본은 단어 매칭. 벡터 검색을 추가하면 시맨틱도 가능하나, "관리형 자연어 질의"는 Kendra가 즉답.

> 💡 **관련 이론**: Kendra의 시맨틱 검색과 RAG(Day 47)는 사촌 관계다. 둘 다 "질문의 의미에 맞는 문서를 찾기"가 목표다. 차이는 Kendra가 검색 결과(문서·발췌)를 직접 반환하는 검색 엔진인 반면, RAG는 검색된 문서를 LLM에 넣어 생성형 답변을 만든다는 것이다. 실제로 Kendra는 Bedrock Knowledge Bases의 검색 백엔드로 쓰일 수 있다(Kendra retriever). 시험에서 "자연어 질의로 사내 문서 검색"이면 Kendra, "검색 + 생성형 대화 답변"이면 Bedrock RAG(KB), "키워드·로그 검색"이면 OpenSearch.

## 동기 vs 비동기 vs 배치 — 호출 패턴의 논리

Managed AI 서비스의 호출 패턴은 **처리 시간과 데이터 크기**로 갈린다.

- **동기(synchronous)**: 작은 입력, 빠른 처리. API 호출에 즉시 결과 반환(Comprehend 단문 감정 분석, Rekognition 단일 이미지, Textract 한 장 영수증).
- **비동기(asynchronous)**: 큰 입력, 긴 처리. 작업을 시작하고(JobId) S3에 결과를 쓰며 SNS로 알림(Rekognition Video, Textract 대용량 PDF, Transcribe 긴 녹취).
- **배치(batch)**: 대량 데이터셋 일괄 처리(Comprehend 배치 분석 작업).

> 🔍 **더 깊이**: Rekognition이 이미지는 동기, 비디오는 비동기인 건 본질적 차이 때문이다. 단일 이미지 분석은 수십~수백 ms로 끝나 동기 응답이 가능하지만, 1시간짜리 비디오는 프레임을 추출하고 객체·얼굴·장면을 추적하는 데 수 분~수십 분이 걸린다. 그래서 비디오 API는 S3의 비디오를 입력으로 받아 `StartLabelDetection`으로 작업을 시작하고, 완료되면 SNS 토픽으로 알림을 보낸다. 이벤트 기반 아키텍처(S3 → Lambda → Rekognition async → SNS → 후처리)가 자연스럽게 따라온다. 시험에서 "긴 비디오/대용량 문서 분석"은 비동기 + SNS 알림 패턴이 정석.

## Lex, Connect, Personalize, Fraud Detector — 그 외 핵심 경계

**Lex**는 음성·텍스트 대화 봇(인텐트·슬롯 기반)을 만드는 빌더로, Alexa와 같은 엔진을 쓴다. **Connect**는 클라우드 콜센터 플랫폼이고, 둘은 통합된다(Connect가 Lex 봇으로 IVR을 구성). 시험에서 "봇 자체"는 Lex, "콜센터 인프라"는 Connect. 한편 **Personalize**는 Amazon.com의 추천 기술을 API화한 실시간 개인화 추천 엔진이고, **Fraud Detector**는 온라인 거래 사기를 점수화한다. 둘 다 "이미 풀린 문제"의 전형으로, 추천 알고리즘이나 사기 모델을 직접 만들 이유가 없다.

> 🔍 **더 깊이**: Lex의 봇은 NLU(자연어 이해)로 사용자 발화에서 **인텐트(의도)**와 **슬롯(파라미터)**을 추출한다. "내일 오후 3시에 회의 잡아줘"에서 인텐트는 "회의 예약", 슬롯은 날짜=내일·시간=오후 3시다. 이는 RAG/LLM 챗봇과 근본적으로 다른 접근이다 — Lex는 미리 정의된 인텐트 구조에 맞춰 동작하는 결정적 대화 흐름이고, Bedrock Agents는 LLM의 유연한 추론으로 동작한다. 정해진 업무 흐름(예약·주문·FAQ)은 Lex가, 개방형 지식 대화는 Bedrock이 맞다. 시험에서 "구조화된 음성·텍스트 봇"은 Lex, "사내 지식 기반 개방형 챗봇"은 Bedrock RAG.

## 정리하며

Managed AI 서비스의 핵심은 "이미 풀린 ML 문제를 직접 만들지 말고 API로 사라"는 build-vs-buy 판단이다. 입력·출력 타입으로 서비스를 매핑하고(음성→Transcribe, 문서→Textract, 이미지→Rekognition, 텍스트→Comprehend), 비슷한 서비스의 경계(Macie=S3 vs Comprehend=임의 텍스트, Kendra=시맨틱 vs OpenSearch=키워드)를 정확히 구분하며, 처리 시간이 길면 비동기 + SNS 패턴을 쓴다.

SAP 시험 단골 매핑: (1) "청구서·영수증 추출" → Textract AnalyzeExpense, (2) "콜센터 음성→감정" → Transcribe + Comprehend, (3) "이미지 부적절 콘텐츠" → Rekognition Content Moderation, (4) "S3 PII 식별" → Macie / "텍스트 PII" → Comprehend, (5) "사내 자연어 검색" → Kendra, (6) "운영 이상 탐지" → DevOps Guru, (7) "긴 비디오/대용량 PDF" → 비동기 API + SNS. 다음 day는 이 모든 ML을 운영 자동화하는 MLOps를 본다.

---

## 📝 연습 문제

**문제 1.** 사내 위키와 SharePoint에 흩어진 문서를 직원이 "작년 출장비 정산 규정이 뭐야?" 같은 자연어로 질문해 검색하게 하고, 문서별 접근 권한도 반영해야 한다. 가장 적합한 서비스는?

A) Amazon OpenSearch
B) Amazon Kendra
C) Amazon Athena
D) S3 Select

**정답: B**
해설: Kendra는 시맨틱(자연어) 검색에 특화된 엔터프라이즈 검색 서비스로, 자연어 질의를 이해하고 SharePoint·S3 등 커넥터와 문서 수준 권한(ACL)을 지원한다. A(OpenSearch)는 기본이 키워드·풀텍스트 검색으로 자연어 질의·권한 커넥터가 약하다(벡터를 직접 구성하면 가능하나 관리형 자연어 검색은 Kendra). C·D는 정형 데이터 쿼리용이지 문서 검색이 아니다. 함정: "자연어 질의 + 사내 문서 + 권한"은 Kendra, "키워드·로그 검색"은 OpenSearch.

---

**문제 2.** 월 수만 건의 공급사 청구서 PDF에서 품목·금액·세금을 자동 추출해야 한다. 가장 정확하고 적합한 API는?

A) Rekognition DetectText
B) Textract AnalyzeExpense
C) Comprehend
D) Lambda + 오픈소스 Tesseract OCR

**정답: B**
해설: Textract AnalyzeExpense는 영수증·청구서 전용 API로 품목·금액·세금·공급사를 구조적으로 자동 식별한다. 범용 AnalyzeDocument나 단순 OCR보다 청구서 도메인에서 정확하다. A(Rekognition DetectText)는 이미지 속 텍스트 검출용이지 청구서 구조 이해가 없다. C(Comprehend)는 텍스트 이해용이지 OCR/문서 추출이 아니다. D는 직접 구축 부담·정확도 열위. 함정: 청구서·영수증은 전용 AnalyzeExpense가 정답.

---

**문제 3.** 콜센터 통화 녹취(음성 파일)를 분석해 고객 감정(긍/부정)과 자주 언급되는 주제를 추출하려 한다. 어떤 조합인가?

A) Polly + Comprehend
B) Transcribe + Comprehend
C) Lex만
D) Connect만

**정답: B**
해설: 음성을 먼저 Transcribe(STT)로 텍스트화한 뒤, Comprehend로 감정 분석(DetectSentiment)과 주제 추출(토픽 모델링)을 한다. A(Polly)는 텍스트→음성(TTS)이라 방향이 반대. C(Lex)는 챗봇 봇 빌더. D(Connect)는 콜센터 플랫폼이지 자체 감정·주제 분석 엔진이 아니다(Contact Lens가 내부적으로 Transcribe+Comprehend를 쓴다). 함정: 음성 분석은 Transcribe(텍스트화) 후 Comprehend(분석).

---

**문제 4.** S3 버킷에 저장된 수백만 개 객체에 민감한 개인정보(PII)가 들어 있는지 식별하고 분류해 규정 준수를 점검해야 한다. 어떤 서비스인가?

A) Comprehend DetectPiiEntities
B) Amazon Macie
C) Amazon Inspector
D) Amazon GuardDuty

**정답: B**
해설: Macie는 S3에 저장된 데이터를 스캔해 PII·민감 정보를 식별·분류하고 보안 알림을 내는 데이터 보안·거버넌스 서비스다. A(Comprehend PII)는 API로 들어온 임의 텍스트의 PII 탐지용이지 S3 대량 스캔용이 아니다. C(Inspector)는 EC2/컨테이너 취약점 스캔, D(GuardDuty)는 위협 탐지로 PII와 무관. 함정: 대상이 S3면 Macie, 임의 텍스트면 Comprehend.

---

**문제 5.** 사용자가 업로드하는 사진에서 폭력·성인 콘텐츠를 자동으로 탐지해 차단해야 한다. 어떤 서비스/기능인가?

A) Rekognition Content Moderation
B) Comprehend
C) Macie
D) Textract

**정답: A**
해설: Rekognition Content Moderation(콘텐츠 검수)은 이미지·영상에서 폭력·성인·부적절 콘텐츠를 사전 학습된 모델로 탐지·분류한다. B(Comprehend)는 텍스트 NLP, C(Macie)는 S3 PII, D(Textract)는 문서 OCR로 모두 이미지 콘텐츠 검수와 무관. 함정: "이미지·영상 부적절 콘텐츠"는 Rekognition Content Moderation.

---

**문제 6.** EC2·RDS·Lambda로 구성된 운영 환경에서 비정상 지표·장애 징후를 자동으로 탐지하고 근본 원인과 권고를 받고 싶다. 어떤 서비스인가?

A) CloudWatch Alarm만
B) Amazon DevOps Guru
C) AWS Trusted Advisor
D) AWS Config

**정답: B**
해설: DevOps Guru는 ML로 운영 지표의 이상 패턴을 자동 탐지해 장애 징후·근본 원인·권고를 제시하는 운영 이상 탐지 서비스다. A(CloudWatch Alarm)는 임계값 기반 단순 알람으로 ML 이상 탐지·근본 원인 분석이 없다. C(Trusted Advisor)는 모범 사례 점검, D(Config)는 구성 규정 준수 평가로 운영 이상 탐지가 아니다. 함정: "운영 이상 자동 탐지 + 근본 원인"은 DevOps Guru.

---

**문제 7.** 1시간 분량의 강의 영상에서 등장하는 객체·장면·텍스트를 추출해야 한다. 처리에 수 분이 걸린다. 올바른 호출 패턴은?

A) Rekognition 이미지 동기 API를 프레임마다 호출
B) Rekognition Video 비동기 API(StartLabelDetection) + SNS 알림
C) Textract 비동기 API
D) Comprehend 배치 작업

**정답: B**
해설: 긴 비디오 분석은 처리에 수 분~수십 분이 걸려 동기 응답이 불가하므로, Rekognition Video 비동기 API(StartLabelDetection 등)로 S3의 비디오를 받아 작업을 시작하고 완료 시 SNS로 알림받는 패턴이 정석이다. A(프레임마다 동기 호출)는 비효율적이고 장면·움직임 추적이 안 된다. C(Textract)는 문서 OCR용. D(Comprehend)는 텍스트 분석용. 함정: "긴 비디오/대용량 처리"는 비동기 + SNS 알림.

---

## 📌 오늘의 요약

1. **사전 학습형 AI = build vs buy의 buy** — 이미 풀린 ML 문제는 API로. 도메인 특화는 Custom Labels/Classification(전이학습)
2. **입력·출력으로 매핑** — 음성→Transcribe, 텍스트→Comprehend, 문서→Textract, 이미지→Rekognition, 추천→Personalize
3. **Textract 4종** — DetectText(OCR)/AnalyzeDocument(표·양식)/AnalyzeExpense(청구서)/AnalyzeID(신분증)
4. **Macie vs Comprehend PII** — S3 저장 데이터=Macie, 임의 텍스트=Comprehend(결정 키워드: S3)
5. **Kendra vs OpenSearch** — 시맨틱(자연어)·권한=Kendra, 키워드·로그=OpenSearch
6. **DevOps Guru** = 운영 이상 탐지 + 근본 원인, **CodeGuru** = 코드 리뷰·프로파일
7. **동기 vs 비동기** — 소량·빠름=동기, 대용량·긴 처리(비디오/대형 PDF)=비동기 + SNS 알림
