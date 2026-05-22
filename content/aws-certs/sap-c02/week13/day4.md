# Day 64 - 비용·지속 가능성 기둥 심화

📅 Week 13 (Day 4)
🎯 주제: Cost·Sustainability
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- Cost Optimization 원칙과 실전
- Sustainability 원칙·도구 (Customer Carbon Footprint Tool)

---

## 🧩 사전 지식 (CS 기초)

- **Unit Economics**: 단위(요청·사용자) 당 비용
- **Carbon Footprint**: 운영의 탄소 배출량
- **Embodied Carbon**: 하드웨어 제조·운반에 포함된 탄소

---

## 📖 이론 내용

### 1. Cost Optimization 원칙

1. **소비 모델** 채택 (사용한 만큼)
2. **전체 효율** 측정
3. 데이터 센터 운영 비용 **중단**
4. **비용 분석** (Cost Allocation Tag)
5. **관리형** 서비스로 운영비↓

### 2. 실전 카드

- SP·RI·Spot·On-Demand 조합
- Auto Scaling으로 유휴 ↓
- Storage Class·Lifecycle
- Right-sizing (Compute Optimizer)
- VPC Endpoint로 NAT 우회
- CloudFront로 egress↓
- Budgets + Cost Anomaly Detection
- Org 통합 결제로 SP·RI 공유

### 3. Sustainability 원칙

1. **영향 이해**
2. **지속 가능성 목표 설정**
3. **사용률 최대화** (유휴 0)
4. **새 기술 적용** (Graviton·Inferentia)
5. **관리형 서비스**
6. 다운스트림 **영향 감소**

### 4. Sustainability 도구·실천

- **Customer Carbon Footprint Tool** — 콘솔에서 탄소 배출 시각화
- **Graviton·Inferentia·Trainium** — 동일 성능 대비 전력 ↓
- **S3 Storage Class** — 콜드 데이터 → 저전력 클래스
- **리전 선택** — 재생에너지 사용 리전 우선 (AWS 공식 데이터)
- **Auto Scaling·서버리스** — 유휴 자원 ↓
- **컴퓨팅 공유** — Fargate Spot·EKS Bin Packing

### 5. AWS의 약속

- 2025년 100% 재생에너지
- 2040 Net-Zero 탄소
- Scope 1·2·3 보고

---

## 🧠 심화 이론

### Pro 함정

- "비용 효율" = Cost
- "탄소·환경" = Sustainability
- "관리형" = 두 기둥 모두 점수 ↑
- "Graviton 전환" = 비용·지속가능성 동시

### 트레이드오프

- Sustainability가 항상 비용↓는 아님 (Graviton은 둘 다 ↑이지만 Lustre는 비용↑·성능↑)

---

## 🏗️ 아키텍처 — 비용·지속 동시 최적화

```
[ALB]
  │
[Graviton Fargate]
  │
[Aurora Serverless v2]
  │
[S3 Intelligent-Tiering + Lifecycle]
  │
[CloudFront 캐싱]
  │
[Compute Optimizer 권고 자동 적용]
[CCFT (Carbon Footprint)]
```

---

## ⭐ 핵심 포인트

1. ⭐ Cost = 소비 모델·Right-size·관리형
2. ⭐ Sustainability = 유휴 0·Graviton·재생에너지 리전
3. ⭐ Customer Carbon Footprint Tool로 시각화
4. ⭐ Storage Class·Lifecycle = 두 기둥 동시
5. ⭐ Serverless·Fargate Spot = 사용률 ↑

---

## 💻 CLI 예시

```bash
# Org 결제 통합
aws organizations enable-aws-service-access \
  --service-principal billingconductor.amazonaws.com

# CCFT는 콘솔(Billing & Cost Management)
```

---

## 📝 연습 문제

**문제 1.** 동일 워크로드·전력·비용 모두 ↓.

A) Intel x86
B) Graviton (ARM)
C) F1
D) Inferentia

**정답: B**

---

**문제 2.** 탄소 배출 시각화.

A) Trusted Advisor
B) Customer Carbon Footprint Tool
C) Cost Explorer
D) Compute Optimizer

**정답: B**

---

**문제 3.** 사용한 만큼만 — 서버리스 DB.

A) RDS Standard
B) Aurora Serverless v2
C) Redshift Provisioned
D) DynamoDB Provisioned

**정답: B**

---

**문제 4.** 콜드 데이터 자동 저비용·저탄소.

A) S3 Standard
B) Lifecycle → Glacier Deep Archive
C) Glacier Instant Retrieval만
D) S3 IA만

**정답: B**

---

**문제 5.** 멀티 계정 SP 공유.

A) 불가능
B) Organization 통합 결제 + Sharing 활성
C) RI만 가능
D) 콘솔 수동

**정답: B**

---

**문제 6.** Fargate 비용 ↓ (중단 OK).

A) Fargate Spot
B) EC2
C) Lambda
D) ECS EC2 Reserved

**정답: A**

---

## 📌 오늘의 요약

1. Cost = 소비·Right-size·관리형
2. Sustainability = 유휴 0·Graviton·관리형
3. CCFT로 탄소 시각화
4. Lifecycle·Serverless = 두 기둥 동시
