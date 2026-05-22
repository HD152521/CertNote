# Day 57 - Compute Optimizer, Rightsizing

📅 Week 12 (Day 2)
🎯 주제: 리소스 사용량 분석·권고
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- Compute Optimizer가 분석하는 리소스와 권고 형식
- Trusted Advisor·Cost Explorer와의 차이
- Rightsizing 자동화 패턴

---

## 🧩 사전 지식 (CS 기초)

- **Rightsizing**: 사용량에 맞춰 인스턴스 사양 조정
- **Workload Profile**: 시간대별 CPU·Mem·Net 패턴

---

## 📖 이론 내용

### 1. Compute Optimizer 대상

| 리소스 | 권고 |
|--------|------|
| **EC2 Instance** | 다운사이즈·업사이즈·family 변경 |
| **Auto Scaling Group** | 권장 인스턴스 타입 |
| **EBS Volume** | gp2→gp3·IOPS·Throughput |
| **Lambda Function** | 메모리 권고 |
| **ECS Fargate Task** | CPU·Memory 권고 |
| **Commercial Software License** | RDS·SQL Server 라이선스 최적화 |
| **RDS** | DB instance 다운사이즈 |

### 2. 권고 카테고리 (EC2)

- **Under-provisioned**: 자원 부족 (업사이즈)
- **Over-provisioned**: 자원 과다 (다운사이즈)
- **Optimized**: 적정
- **Not optimized (general)**: 일반 권고

### 3. 활성화 조건

- 14일 이상 CloudWatch 메트릭 수집
- 메모리 권고는 CW Agent로 수집된 메모리 메트릭 필요

### 4. Trusted Advisor

- **카테고리 5**: 비용·성능·보안·내결함성·서비스 한도
- Business·Enterprise Support 시 전체 체크
- **유휴 RI·낮은 사용률 EC2 등**

### 5. Cost Explorer Rightsizing Recommendations

- Compute Optimizer와 통합 — 약식 권고
- 콘솔 Cost Explorer → Rightsizing

### 6. 자동 Rightsizing 패턴

```
Compute Optimizer 권고 → S3 Export
   ↓
EventBridge Scheduler → Lambda
   ↓
Stop·Modify·Start (또는 ASG LT 갱신)
```

---

## 🧠 심화 이론

### 함정 포인트

- **"메모리 권고 없음"** → CW Agent 미설치
- **"Org 차원 권고"** → 위임 관리자에서 활성
- **"DB 인스턴스 권고"** → Compute Optimizer가 RDS 지원

### 트레이드오프

- Compute Optimizer = 무료 (성능·메모리 기반)
- Cost Explorer Rightsizing = 비용 중심 (CO 데이터 활용)
- Trusted Advisor = 일반적·요약형

---

## 🏗️ 아키텍처 — 자동 Rightsizing

```
[CloudWatch + CW Agent 메트릭]
        │
        ▼
[Compute Optimizer 분석]
        │
        ▼
[S3 Export (일일)]
        │
   [Lambda 파싱]
        │
   ┌────┴────┐
   ▼         ▼
[ASG LT]   [EBS 변경]
 갱신       (gp2→gp3)
        │
   [SNS 승인]
```

---

## ⭐ 핵심 포인트

1. ⭐ EC2·ASG·EBS·Lambda·ECS·RDS 권고
2. ⭐ 14일 메트릭 필요
3. ⭐ 메모리 권고는 CW Agent 필수
4. ⭐ Trusted Advisor = 일반, CO = 정밀
5. ⭐ S3 Export + Lambda로 자동화

---

## 💻 CLI 예시

```bash
# EC2 권고 조회
aws compute-optimizer get-ec2-instance-recommendations

# Export 작업
aws compute-optimizer export-ec2-instance-recommendations \
  --s3-destination-config bucket=co-export,keyPrefix=ec2/
```

---

## 📝 연습 문제

**문제 1.** EC2 over-provisioned 자동 다운사이즈 권고.

A) Trusted Advisor
B) Compute Optimizer
C) Cost Explorer
D) CloudWatch

**정답: B**

---

**문제 2.** Lambda 메모리 권고 받기.

A) X-Ray
B) Compute Optimizer
C) CloudWatch Insights
D) Trusted Advisor

**정답: B**

---

**문제 3.** EBS gp2 → gp3 권고.

A) Cost Explorer
B) Compute Optimizer
C) Storage Lens
D) Trusted Advisor

**정답: B**

---

**문제 4.** 메모리 권고가 안 나옴.

A) Compute Optimizer 미지원
B) CW Agent 미설치 (메모리 메트릭 없음)
C) 권한 부족
D) Trusted Advisor 활성화 필요

**정답: B**

---

**문제 5.** Org 전체 계정 권고 통합.

A) Cost Explorer만
B) Compute Optimizer Org 위임 관리자
C) Config Aggregator
D) Trusted Advisor 통합

**정답: B**

---

**문제 6.** 권고 데이터를 자동 Lambda 처리.

A) Inline API
B) S3 Export + EventBridge + Lambda
C) Trusted Advisor 콜백
D) Config Rule

**정답: B**

---

## 📌 오늘의 요약

1. CO = EC2·ASG·EBS·Lambda·ECS·RDS 권고
2. 14일 메트릭·메모리는 CW Agent
3. S3 Export + Lambda 자동화
4. TA = 일반·요약, CO = 정밀
