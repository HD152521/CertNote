# Day 72 - 스타트업 빠른 성장·비용 최적화

📅 Week 15 (Day 2)
🎯 주제: 서버리스 우선·MVP→Scale
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- 서버리스 우선 아키텍처
- 빠른 반복·비용 효율
- 사용량 변동 대응

---

## 📖 시나리오

> 시드 단계 SaaS. 3명 엔지니어. 빠른 출시·비용 최소.
> 6개월 후 100x 사용자 증가 예상.

### 요구사항

- 초기 비용 최소
- 운영 부담 최소 (관리형)
- 100x 확장 가능
- 글로벌 사용자

---

## 📖 솔루션

### 1. 컴퓨트

- **API**: API Gateway + Lambda (또는 AppSync GraphQL)
- **Workers**: SQS + Lambda
- **Cron**: EventBridge Scheduler + Lambda

### 2. 데이터

- **DynamoDB On-Demand** (오토 스케일·서버 0)
- **Aurora Serverless v2** (관계형 필요 시)
- **S3 Intelligent-Tiering**

### 3. 인증

- **Cognito User Pools** (소셜 로그인 통합)
- **Cognito Identity Pools** (AWS 리소스 액세스)

### 4. 글로벌

- **CloudFront** + S3 (정적·SPA)
- **Route 53** (Latency Routing)
- **Lambda@Edge**·**CloudFront Functions**으로 엣지 로직

### 5. 관측성

- **CloudWatch Logs + Metrics + Alarms**
- **X-Ray**·**CloudWatch ServiceLens** (분산 추적)
- **CloudWatch Synthetics** (가동 모니터링)

### 6. CI/CD

- **CodePipeline + CodeBuild + CodeDeploy** 또는 GitHub Actions + OIDC
- **SAM** 또는 **CDK** 인프라 코드

### 7. 비용

- **AWS Free Tier** 활용
- **Budgets** 알림·자동 정지
- 100x 시: **Compute Savings Plans** (Lambda·Fargate)
- **CloudFront Free Tier** (1TB/월)

---

## 🧠 함정 회피

- "관리형" 키워드 = Lambda·Fargate·DDB·Aurora Serverless
- "100x 확장" = 서버리스·DDB On-Demand
- "글로벌" = CloudFront + Route 53 Latency

---

## 🏗️ 아키텍처

```
[Users → Route 53 Latency]
   │
[CloudFront] ───── [S3 (SPA)]
   │
[API GW] ─── [Lambda]
                  │
              [DDB On-Demand]
                  │
              [Cognito]

[EventBridge Scheduler] ─▶ [Lambda]
[SQS] ─▶ [Lambda Worker]
```

---

## ⭐ 핵심 포인트

1. ⭐ Lambda·DDB On-Demand·Aurora Serverless v2 = 사용량 0이면 비용 0
2. ⭐ Cognito = 인증 관리형
3. ⭐ CloudFront + Lambda@Edge = 글로벌
4. ⭐ 100x 후 Compute SP 1년 약정
5. ⭐ CDK/SAM = IaC

---

## 📝 연습 문제

**문제 1.** 트래픽 0일 때 컴퓨트 비용 0.

A) EC2 t2.micro
B) Lambda
C) Fargate
D) ECS EC2

**정답: B**

---

**문제 2.** 사용량 변동 큰 RDB.

A) RDS Provisioned
B) Aurora Serverless v2
C) Redshift
D) DynamoDB

**정답: B**

---

**문제 3.** 글로벌 정적 + SPA 빠른 배포.

A) S3 공개
B) CloudFront + S3 (OAC)
C) ALB
D) Lightsail

**정답: B**

---

**문제 4.** 100x 확장 후 비용 절감.

A) Spot
B) Compute Savings Plans
C) RI Standard
D) EC2 Instance SP

**정답: B** — Lambda·Fargate 통합 SP

---

**문제 5.** GitHub Actions에서 AWS 권한.

A) Access Key 저장
B) OIDC + IAM Role
C) IAM User 공유
D) SSM Parameter

**정답: B**

---

**문제 6.** 가동·SLA 모니터링.

A) X-Ray
B) CloudWatch Synthetics
C) Trusted Advisor
D) Config

**정답: B**

---

## 📌 오늘의 요약

1. 서버리스 우선 (Lambda·DDB·Aurora SLS v2)
2. Cognito·CloudFront로 인증·글로벌
3. CDK/SAM IaC
4. 100x 후 Compute SP
5. Synthetics·X-Ray 관측성
