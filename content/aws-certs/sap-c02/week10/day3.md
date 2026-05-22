# Day 48 - AI 서비스 (Comprehend, Textract, Rekognition 등)

📅 Week 10 (Day 3)
🎯 주제: AWS Managed AI 서비스 선택
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- AWS의 사전 학습형 AI 서비스를 카테고리별로 안다
- 시나리오별 "어느 서비스를 골라야 하나"를 즉답할 수 있다
- 비동기·동기·배치 패턴 차이를 안다

---

## 🧩 사전 지식 (CS 기초)

- **OCR**: 이미지 → 텍스트 추출
- **NLP**: 자연어 처리 — 감정, 개체명, 토픽 분류
- **STT/TTS**: Speech-to-Text / Text-to-Speech

---

## 📖 이론 내용

### 1. 카테고리 매트릭스

| 카테고리 | 서비스 | 기능 |
|----------|--------|------|
| **NLP** | Comprehend | 감정·엔티티·언어 감지·PII 감지 |
| **NLP-Medical** | Comprehend Medical | 의료 NER |
| **Translate** | Translate | 다국어 번역 |
| **STT** | Transcribe (+ Medical) | 음성 → 텍스트 |
| **TTS** | Polly | 텍스트 → 음성 (Neural) |
| **Document OCR** | Textract | 양식·표·서명 추출 |
| **Image/Video** | Rekognition | 객체·얼굴·콘텐츠 검수 |
| **Search** | Kendra | 엔터프라이즈 시맨틱 검색 |
| **Chatbot** | Lex | 음성·텍스트 봇 (Alexa 엔진) |
| **Forecast** (deprecated 권장 X) | 시계열 예측 |
| **Personalize** | 추천 시스템 |
| **Fraud Detector** | 사기 탐지 |
| **Code Review** | CodeGuru | 코드 리뷰 + 성능 프로파일 |
| **DevOps** | DevOps Guru | 운영 이상 탐지 |
| **Health** | HealthLake / HealthOmics | FHIR 데이터레이크 / 유전체 |

### 2. Textract 심화

- **DetectDocumentText** — 단순 OCR
- **AnalyzeDocument** — 표·양식·서명·쿼리
- **AnalyzeExpense** — 영수증·청구서 전용
- **AnalyzeID** — 신분증
- **Async API** (StartDocumentAnalysis) — 대용량 PDF

### 3. Rekognition 심화

- **Image API**: 객체·얼굴·콘텐츠·텍스트
- **Video API**: 비동기 (S3 입력 → SNS 알림)
- **Custom Labels** — 자체 데이터셋
- **Face Liveness** — 위변조 탐지

### 4. Comprehend

- **DetectSentiment / DetectEntities / DetectKeyPhrases / DetectPiiEntities**
- **Custom Classification·Entity Recognition** — 도메인 특화
- **Topic Modeling** — 비지도 토픽 분류

---

## 🧠 심화 이론

### 시나리오 직답 매핑

| 시나리오 | 답 |
|----------|-----|
| 영수증 청구서 자동 처리 | Textract AnalyzeExpense |
| 콜센터 음성 분석 | Transcribe + Comprehend |
| 이미지 부적절 콘텐츠 차단 | Rekognition Content Moderation |
| PII 탐지·마스킹 | Comprehend DetectPiiEntities (또는 Macie for S3) |
| 다국어 챗봇 | Lex + Translate |
| 추천 엔진 | Personalize |
| 코드 보안·성능 | CodeGuru Reviewer / Profiler |
| 인프라 이상 탐지 | DevOps Guru |
| 의료 텍스트 추출 | Comprehend Medical |

### 함정

- **Macie vs Comprehend PII** — Macie = S3 대상, Comprehend = 임의 텍스트
- **Kendra vs OpenSearch** — Kendra = 시맨틱 + 자연어 / OpenSearch = 키워드
- **Lex** = 봇 / Connect = 콜센터 (둘이 통합 가능)

---

## 🏗️ 아키텍처 — 자동 영수증 처리

```
[S3 업로드] → [EventBridge] → [Lambda]
                                  │
                            [Textract AnalyzeExpense]
                                  │
                            [Comprehend PII]
                                  │
                            [DynamoDB 저장]
                                  │
                            [SNS 알림 - 검토자]
```

---

## ⭐ 핵심 포인트

1. ⭐ NLP = Comprehend / OCR = Textract / Vision = Rekognition
2. ⭐ Textract = 양식/영수증/ID 전용 API 있음
3. ⭐ Kendra = 시맨틱 검색·자연어 질의
4. ⭐ Personalize = 추천 / Fraud Detector = 사기
5. ⭐ CodeGuru / DevOps Guru = 운영 자동화
6. ⭐ Macie(S3) vs Comprehend(임의 텍스트) PII 구분

---

## 💻 AWS CLI 예시

```bash
# Textract 영수증
aws textract analyze-expense \
  --document '{"S3Object":{"Bucket":"docs","Name":"receipt.pdf"}}'

# Comprehend 감정 분석
aws comprehend detect-sentiment \
  --language-code ko \
  --text "정말 좋아요!"
```

---

## 📝 연습 문제

**문제 1.** 사내 문서 자연어 질의 검색.

A) S3 Select
B) Kendra
C) Athena
D) DynamoDB

**정답: B**

---

**문제 2.** 청구서 PDF에서 항목·금액 자동 추출.

A) Rekognition
B) Textract AnalyzeExpense
C) Comprehend
D) Lambda + Tesseract

**정답: B**

---

**문제 3.** 콜센터 통화 녹취 → 감정 분석.

A) Polly + Comprehend
B) Transcribe + Comprehend
C) Lex
D) Connect만

**정답: B**

---

**문제 4.** 사진 부적절 콘텐츠 자동 필터.

A) Rekognition Content Moderation
B) Comprehend
C) Macie
D) GuardDuty

**정답: A**

---

**문제 5.** EC2/RDS 이상 징후 자동 탐지·근본 원인.

A) CloudWatch Alarm
B) DevOps Guru
C) Trusted Advisor
D) Config

**정답: B**

---

**문제 6.** S3 내 PII 데이터 식별.

A) Comprehend
B) Macie
C) Inspector
D) GuardDuty

**정답: B** — S3 대상은 Macie

---

## 📌 오늘의 요약

1. 카테고리(NLP·OCR·Vision·Search·Chatbot·Forecast·Reco) 매핑
2. Textract 4종 API (Text/Document/Expense/ID)
3. Rekognition Image/Video/Custom Labels
4. Kendra = 시맨틱 검색
5. Macie(S3) vs Comprehend(텍스트)
