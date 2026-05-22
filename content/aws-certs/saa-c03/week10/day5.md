# Day 50 - Week 10 복습 + 시나리오 문제 10

📅 날짜: Week 10 (Day 5)
🎯 주제: 비용 최적화 종합
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 도메인 4 (비용 20%) 시나리오 키워드 매핑이 자동으로 나온다
- 컴퓨팅·스토리지·네트워크·운영 4축 절감을 결합한다

---

## 🧩 사전 지식 (CS 기초)

- **FinOps**: 비용 가시화 + 책임 + 자동화. 클라우드 비용 운영 방법론.

---

## 📖 한 주 핵심 정리

1. **컴퓨팅**: Compute SP / Spot / Graviton / Compute Optimizer.
2. **스토리지**: Intelligent-Tiering / Lifecycle / Bucket Keys / gp3.
3. **네트워크**: S3/DDB Gateway EP / CloudFront / Same-AZ.
4. **거버넌스**: Cost Explorer / Budgets / CUR / Tags / Anomaly Detection.
5. **운영**: Compute Optimizer + TA + Storage Lens.

### 헷갈리기 쉬운 비교표

| 항목 | A | B |
|------|---|---|
| **SP vs RI** | 유연 컴퓨팅 | 특정 타입 / RDS·Redshift |
| **Standard SP vs Compute SP** | 패밀리 고정 | 자유 |
| **Intelligent-Tiering vs Lifecycle** | 자동 모니터링 | 규칙 기반 |
| **Gateway vs Interface Endpoint** | S3/DDB 무료 | 시간당 + GB |
| **Budgets vs Cost Explorer** | 예산·차단 | 가시화·예측 |

---

## 🏗️ 한 주 통합 아키텍처

```
[ 비용 최적화된 풀스택 ]

  Users → CloudFront (캐시·글로벌 단가)
            │
          ALB (Same-AZ 우선)
            │
          ECS Fargate (Graviton + Spot mix)
            │ + Compute SP baseline
            ▼
          Aurora Serverless v2 (변동)
          DynamoDB On-Demand
          S3 (Intelligent-Tiering, Bucket Keys, Gateway EP)

  거버넌스: Cost Explorer / Budgets+Actions / CUR / Cost Allocation Tags
  추천: Compute Optimizer / Trusted Advisor / Storage Lens
```

---

## 📝 시나리오 연습 문제 10

**문제 1.** 24/7 EC2 + 자유 패밀리:

A) RI Standard B) Compute SP C) Spot D) Convertible RI

**정답: B**.

---

**문제 2.** S3 패턴 모름:

A) Standard B) Intelligent-Tiering C) Glacier D) One Zone-IA

**정답: B**.

---

**문제 3.** NAT 비용 폭증 (S3로 빠짐):

A) Interface EP B) S3 Gateway EP C) PrivateLink D) DX

**정답: B**.

---

**문제 4.** 야간 배치 90% 절감:

A) Spot B) RI 3y C) On-Demand D) Convertible

**정답: A**.

---

**문제 5.** RDS 비용 약정:

A) RI B) Compute SP C) Spot D) EC2 SP

**정답: A**.

---

**문제 6.** 부서별 비용 가시화:

A) Cost Allocation Tags + Cost Explorer B) IAM 키 분리 C) Config D) BPA

**정답: A**.

---

**문제 7.** 예산 100% 자동 보호:

A) Budgets Actions B) Lambda Polling C) Config Rule D) SCP

**정답: A**.

---

**문제 8.** ML 기반 EC2 right-sizing:

A) Trusted Advisor B) Compute Optimizer C) X-Ray D) Cost Explorer 단독

**정답: B**.

---

**문제 9.** 글로벌 사용자 인터넷 다운로드 비용:

A) S3 Direct B) CloudFront 가격 클래스 + 캐시 C) DX D) NAT

**정답: B**.

---

**문제 10.** Compute SP 환불 가능 여부:

A) 가능 B) 불가 C) 50% 페널티 D) 1년 후 가능

**정답: B**.

---

## 📌 오늘의 요약 + 다음 주 예고

1. 비용 도메인 20%는 키워드 매핑 시험.
2. 다음 주: **HA / DR / 마이그레이션** — Multi-AZ vs Multi-Region, DMS, Snow 등.
