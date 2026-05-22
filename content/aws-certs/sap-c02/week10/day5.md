# Day 50 - Week 10 복습 + 시나리오 10문항

📅 Week 10 (Day 5)
🎯 주제: ML/AI 종합 복습
⏱️ 약 90분

---

## 🎯 학습 목표

- 한 주 내용을 한 페이지로 통합
- 시나리오형 문제로 약점 점검

---

## 📌 핵심 요약 (한 페이지)

### SageMaker 4종 Endpoint
- **Real-Time**: 동기·저지연
- **Serverless**: 가변·콜드 OK
- **Async**: 큰 페이로드(≤1GB)·15분
- **Batch Transform**: 대량 일괄

### 비용 절감
- Managed Spot Training 90%↓ + Checkpoint
- Inferentia/Trainium 칩
- Serverless Inference로 유휴 비용 0

### MLOps 핵심 3종
- Pipelines (DAG)
- Model Registry (버전·승인)
- Feature Store (Online/Offline)

### Bedrock
- 서버리스 FM API
- Knowledge Bases = 관리형 RAG
- Agents = Function Calling
- Guardrails = 유해·PII 필터
- Provisioned Throughput = SLA

### AI 매니지드 매핑
| 시나리오 | 답 |
|----------|-----|
| OCR 영수증·양식 | Textract |
| 이미지·영상 객체·콘텐츠 검수 | Rekognition |
| 음성 → 텍스트 | Transcribe |
| 텍스트 → 음성 | Polly |
| 감정·엔티티·PII | Comprehend |
| 시맨틱 검색 | Kendra |
| 추천 | Personalize |
| 챗봇 | Lex (+ Connect) |
| 운영 이상 탐지 | DevOps Guru |
| 코드 리뷰 | CodeGuru |

---

## 📝 시나리오 10문항

**문제 1.** 사내 위키 기반 챗봇. 운영 부담 최소·인터넷 미경유.

A) SageMaker Endpoint에 LLM 직접 호스팅
B) Bedrock + Knowledge Base + VPC Interface Endpoint
C) Kendra만
D) OpenSearch + Lambda

**정답: B**

---

**문제 2.** 학습 비용 90% 절감 + 중단 복구.

A) Reserved Instance
B) Managed Spot Training + Checkpoint
C) Compute Savings Plans
D) On-Demand

**정답: B**

---

**문제 3.** 큰 입력(800MB) 비동기 추론.

A) Real-Time
B) Async Inference
C) Serverless
D) Lambda

**정답: B**

---

**문제 4.** 운영 트래픽 일부를 새 모델로 미러링 후 비교.

A) Canary
B) A/B
C) Shadow Endpoint
D) Multi-Model

**정답: C**

---

**문제 5.** 모델 운영 중 정확도 하락 자동 탐지.

A) CloudWatch만
B) Model Monitor (Model Quality)
C) Clarify Bias만
D) X-Ray

**정답: B**

---

**문제 6.** 사내 PDF 양식·표·서명 자동 추출.

A) Comprehend
B) Textract AnalyzeDocument
C) Rekognition Text
D) Kendra

**정답: B**

---

**문제 7.** LLM 응답에 PII·욕설 차단.

A) WAF
B) Bedrock Guardrails
C) Macie
D) Comprehend Lambda 후처리

**정답: B**

---

**문제 8.** Feature Store Online/Offline 차이.

A) Online = S3, Offline = DDB
B) Online = 저지연 추론, Offline = S3 학습·분석
C) 동일
D) Offline = 실시간

**정답: B**

---

**문제 9.** 모델 승인되면 자동 배포.

A) Manual
B) Model Registry Approved → EventBridge → Lambda 배포
C) CodeDeploy 수동
D) CFN 수동

**정답: B**

---

**문제 10.** 추론 비용 최적화 칩.

A) Trainium
B) Inferentia (Inf1/Inf2)
C) Graviton
D) F1 FPGA

**정답: B**

---

## 📌 Week 10 한 줄 정리

> "SageMaker = ML 플랫폼, Bedrock = GenAI 서버리스, Managed AI = 즉시 사용. MLOps는 Pipelines·Registry·Feature Store·Monitor 4종 세트."

---

## 🎯 다음 주 (Week 11) 예고

보안 심화 — KMS·Macie·GuardDuty·Inspector·Security Hub·WAF·Shield.
