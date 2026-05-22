# Day 47 - Bedrock, GenAI 아키텍처, RAG 패턴

📅 Week 10 (Day 2)
🎯 주제: 생성형 AI 아키텍처
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- Bedrock의 위치와 주요 FM(Foundation Model) 라인업을 안다
- RAG(Retrieval Augmented Generation) 패턴의 핵심 구성 요소를 안다
- Agents·Knowledge Bases·Guardrails의 역할

---

## 🧩 사전 지식 (CS 기초)

- **Embedding**: 텍스트→벡터. 의미 유사도를 코사인 거리로 측정
- **Vector DB**: ANN(Approximate Nearest Neighbor) 검색
- **Prompt Injection**: 사용자 입력으로 시스템 프롬프트를 우회

---

## 📖 이론 내용

### 1. Bedrock 개요

- **서버리스 FM API** — 모델 호스팅 없이 호출만
- **다중 벤더**: Anthropic Claude, Meta Llama, Mistral, Cohere, Amazon Titan, Stability AI
- **데이터 미학습** — 입력 데이터는 모델 학습에 사용되지 않음
- **PrivateLink 지원** — VPC에서 인터넷 없이 호출 가능

### 2. Bedrock 주요 기능

| 기능 | 설명 |
|------|------|
| **Knowledge Bases** | 관리형 RAG (S3·OpenSearch·Aurora pgvector) |
| **Agents** | 함수 호출형 자율 에이전트 |
| **Guardrails** | 유해 콘텐츠·PII 필터링 |
| **Model Customization** | Fine-tuning·Continued Pre-training |
| **Provisioned Throughput** | 보장 처리량 (장기 할인) |

### 3. RAG 표준 흐름

```
Query → Embedding → Vector Search → Top-K Context → LLM Prompt → Answer
```

- **Indexing**: 문서를 청크 분할 → 임베딩 → Vector DB에 저장
- **Retrieval**: 질문 임베딩 → 유사 청크 검색
- **Generation**: 검색 결과를 컨텍스트로 LLM 호출

### 4. 벡터 DB 선택

| 옵션 | 특징 |
|------|------|
| **OpenSearch Serverless (Vector Engine)** | 관리형, Bedrock KB 기본 |
| **Aurora PostgreSQL + pgvector** | SQL과 함께 |
| **Neptune Analytics** | 그래프 + 벡터 |
| **DocumentDB Vector** | Mongo 호환 |
| **Kendra** | 엔터프라이즈 검색 (RAG 친화) |

### 5. Bedrock vs SageMaker JumpStart

- **Bedrock**: 호출형 API, 인프라 관리 0
- **JumpStart**: 모델을 SageMaker Endpoint에 직접 배포 (커스터마이징 자유도↑)

---

## 🧠 심화 이론

### 함정 포인트

- "사내 문서 기반 챗봇" → 무조건 RAG. 모델 학습 답안은 거의 오답
- "데이터 유출 우려" → Bedrock + PrivateLink + Guardrails
- "처리량 SLA 보장" → Provisioned Throughput

### 암기팁

- **Agents** = Tool Use (외부 API 호출까지)
- **Guardrails** = WAF for LLM
- **KB** = RAG 인프라 자동 셋업

---

## 🏗️ 아키텍처 — 사내 RAG 챗봇

```
[User] → [API GW] → [Lambda] ──▶ [Bedrock Knowledge Base]
                                      │
                                      ├─▶ [S3 문서]
                                      └─▶ [OpenSearch Vector]
                                      │
                                  [Bedrock Claude]
                                      │
                                  [Guardrails 필터]
                                      ▼
                                   [응답 반환]
```

---

## ⭐ 핵심 포인트

1. ⭐ Bedrock = 서버리스 FM API + 데이터 미학습
2. ⭐ Knowledge Bases = 관리형 RAG (S3 + Vector DB)
3. ⭐ Agents = Function Calling + Orchestration
4. ⭐ Guardrails = 유해·PII 필터
5. ⭐ Provisioned Throughput = SLA 처리량
6. ⭐ Bedrock vs JumpStart 트레이드오프

---

## 💻 AWS CLI 예시

```bash
# Bedrock 모델 호출
aws bedrock-runtime invoke-model \
  --model-id anthropic.claude-3-sonnet-20240229-v1:0 \
  --body '{"messages":[{"role":"user","content":"Hello"}],"max_tokens":100,"anthropic_version":"bedrock-2023-05-31"}' \
  --cli-binary-format raw-in-base64-out \
  output.json
```

---

## 📝 연습 문제

**문제 1.** 사내 문서 검색 + 답변 챗봇. 운영 부담 최소.

A) Claude를 직접 호출
B) Bedrock Knowledge Base + OpenSearch Serverless
C) 자체 벡터 DB 구축
D) SageMaker JumpStart에 모델 배포

**정답: B** — 관리형 RAG가 가장 운영 부담 적음

---

**문제 2.** 응답 시 PII 마스킹·유해 표현 차단.

A) WAF
B) Bedrock Guardrails
C) Macie
D) Lambda 후처리

**정답: B** — LLM 응답에 특화

---

**문제 3.** 호출량 예측 가능·SLA 필요.

A) On-Demand
B) Provisioned Throughput
C) Spot
D) Savings Plans

**정답: B**

---

**문제 4.** Bedrock 호출을 인터넷 미경유.

A) NAT Gateway
B) Internet Gateway
C) PrivateLink (Interface Endpoint)
D) VPN

**정답: C**

---

**문제 5.** 외부 API 호출까지 자동 수행하는 챗봇.

A) Knowledge Base만
B) Bedrock Agents (Function Calling)
C) Lambda + Claude
D) Step Functions

**정답: B**

---

**문제 6.** 학습 가중치 직접 수정 필요.

A) Bedrock 호출
B) Bedrock Fine-tuning / Continued Pre-training
C) Knowledge Base
D) Guardrails

**정답: B**

---

## 📌 오늘의 요약

1. Bedrock = 서버리스 FM API
2. RAG = Embedding + Vector + LLM
3. Knowledge Bases·Agents·Guardrails 역할 구분
4. Provisioned Throughput으로 SLA
5. PrivateLink로 인터넷 미경유 호출
