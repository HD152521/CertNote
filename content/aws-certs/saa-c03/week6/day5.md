# Day 30 - Week 6 복습 + 시나리오 문제 10

📅 날짜: Week 6 (Day 5)
🎯 주제: 서버리스 + 컨테이너 종합
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 서버리스/컨테이너 선택을 시나리오로 결정한다
- 인증·실시간·오케스트레이션 패턴을 외운다

---

## 🧩 사전 지식 (CS 기초)

- **운영 부담의 스펙트럼**: EC2 → ECS/EKS EC2 → Fargate → Lambda. 오른쪽일수록 운영 ↓ 추상 ↑.
- **상태 관리**: stateless 함수 + 외부 stateful 저장소(RDB/DDB/Redis/SQS)가 표준.

---

## 📖 한 주 핵심 정리

1. Lambda 15분/메모리 10G/이미지 10G. 콜드 스타트 = Provisioned Concurrency.
2. HTTP API(저렴) / REST(풍부) / WebSocket(실시간).
3. 인증 = IAM / Cognito / Lambda Authorizer / API Key / JWT.
4. Step Functions Standard/Express + waitForTaskToken + Distributed Map.
5. AppSync = 관리형 GraphQL + Subscription.
6. ECS / EKS / Fargate / ECR + Task Role / IRSA.

### 헷갈리기 쉬운 비교표

| 항목 | A | B |
|------|---|---|
| **Reserved vs Provisioned Concurrency** | 동시성 한도 예약 | 워밍 인스턴스 |
| **HTTP vs REST API** | 저렴·JWT | 풍부·API Key |
| **Standard vs Express SFN** | 1년·exactly-once | 5분·at-least/most |
| **ECS EC2 vs Fargate** | 직접 노드 | 서버리스 |
| **AppSync vs API GW** | GraphQL | REST/HTTP/WS |

---

## 🏗️ 한 주 통합 아키텍처

```
[ 서버리스 + 컨테이너 혼합 ]

  Client → CloudFront → API GW (HTTP) ──> Lambda
                                         └─ DynamoDB / S3 / SQS

  Client → AppSync (GraphQL) ───────────> Lambda / DDB / OpenSearch

  Orchestration:
    EventBridge → Step Functions → ECS Fargate / Lambda
                                  → SES / SNS

  Container Service:
    ALB → ECS Fargate (awsvpc) → RDS Proxy → Aurora
```

---

## 📝 시나리오 연습 문제 10

**문제 1.** 콜드 스타트 SLA를 맞추려면:

A) Provisioned Concurrency B) ARM C) 메모리 ↑ D) Reserved Concurrency

**정답: A**.

---

**문제 2.** 외부 파트너에게 API 키 + 사용량 제한:

A) HTTP API B) REST API + Usage Plan C) AppSync D) Lambda URL

**정답: B**.

---

**문제 3.** 모바일 앱 + 변경 push:

A) REST B) AppSync GraphQL Subscription C) WebSocket API D) SNS

**정답: B**.

---

**문제 4.** Lambda + RDS 연결 폭증:

A) Read Replica B) RDS Proxy C) Aurora Serverless D) DynamoDB

**정답: B**.

---

**문제 5.** Fargate 태스크가 S3에 접근:

A) IAM 사용자 키 B) Task Role C) Instance Profile D) NAT

**정답: B**.

---

**문제 6.** 1만 S3 객체 병렬 처리:

A) SQS + Lambda B) Step Functions Distributed Map C) ECS Service D) EventBridge

**정답: B**.

---

**문제 7.** 사람이 승인 후 진행하는 워크플로:

A) EventBridge B) Step Functions waitForTaskToken C) SNS D) AppSync

**정답: B**.

---

**문제 8.** ECS에서 동일 호스트 여러 태스크에 ALB 라우팅:

A) NLB B) host 모드 C) awsvpc (각 ENI) D) bridge + 정적 포트

**정답: C**.

---

**문제 9.** Lambda VPC + 인터넷 호출 필요:

A) Public 서브넷 B) Private + NAT Gateway C) Private + IGW D) Endpoint만

**정답: B**.

---

**문제 10.** EKS Pod 단위 IAM:

A) EC2 Instance Profile B) IRSA C) Task Role D) IAM User

**정답: B**.

---

## 📌 오늘의 요약 + 다음 주 예고

1. 운영 부담 + 트래픽 패턴 + 인증 요구가 서비스 선택의 3축.
2. 다음 주: **메시징/통합** — SQS / SNS / EventBridge / Kinesis.
