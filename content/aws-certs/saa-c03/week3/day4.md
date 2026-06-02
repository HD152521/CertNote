# Day 14 - Auto Scaling Group & 스케일링 정책

📅 날짜: Week 3 (Day 4)
🎯 주제: 자동 확장의 모든 것
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- ASG 구성요소(Launch Template, Min/Max/Desired, Health Check)를 안다
- 4가지 스케일링 정책(Target Tracking, Step, Simple, Scheduled)을 구분한다
- Lifecycle Hook, Warm Pool 등 운영 기법을 설명한다

---

## 🧩 사전 지식 (CS 기초)

- **수평 vs 수직 확장**: 인스턴스 수 늘리기(Out) vs 인스턴스 키우기(Up). ASG는 수평.
- **PID 컨트롤**: 목표값과 측정값 차이로 액션. Target Tracking이 이 개념.
- **워밍업(Warm-up)**: 새로 뜬 인스턴스가 트래픽 받기 전까지의 준비 시간.
- **부트스트래핑**: 인스턴스 시작 후 자동 설정 (User Data, Ansible, SSM).

---

## 📖 이론 내용

### 1. ASG 구성요소

- **Launch Template** (Launch Configuration은 deprecated).
- **Min / Max / Desired**: 최소·최대·현재 인스턴스 수.
- **AZ / 서브넷**: 다중 AZ 분산.
- **Health Check**: EC2 또는 ELB.
- **Cooldown**: 스케일링 후 다음 액션까지 대기.

### 2. 스케일링 정책 4종

| 정책 | 동작 | 사용 예 |
|------|------|---------|
| **Target Tracking** | "CPU 평균 50% 유지" 같은 목표값 | 가장 단순·권장 |
| **Step Scaling** | 알람 단계별로 +1, +3, +5 | 세밀 제어 |
| **Simple Scaling** | 알람 시 한 번 +/- N | 레거시 |
| **Scheduled** | 시간 기반(매일 9시 +5대) | 트래픽 패턴 예측 가능 |
| **Predictive (예측)** | ML로 사전 확장 | 주기적 패턴 |

### 3. Health Check 종류

- **EC2 Health Check**: 인스턴스 상태(impaired) 기반.
- **ELB Health Check**: ELB의 헬스 체크 결과 기반(더 정확).
- 둘 다 켜는 것이 표준.

### 4. Lifecycle Hooks

- **Pending:Wait → InService** 사이 / **Terminating:Wait → Terminated** 사이 콜백.
- 예: 새 인스턴스에 데이터 워밍업, 종료 전 로그 업로드.
- 시간 초과 시 자동 진행.

### 5. Warm Pool & Instance Refresh

- **Warm Pool**: 미리 stopped/running으로 준비된 인스턴스 풀 → 빠른 스케일아웃.
- **Instance Refresh**: AMI/Launch Template 업데이트 시 점진적 교체.

### 6. Termination Policy

- **OldestInstance / NewestInstance / OldestLaunchConfiguration / ClosestToNextInstanceHour / Default**.
- 디폴트는 "균형 AZ → 가장 오래된 LT → 시간 단위 다음 청구 임박" 순.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Mixed Instances Policy** | Spot + On-Demand 혼합 + 여러 타입 | 비용 + 가용성 |
| **Suspended Process** | ScalingProcess 일시 정지 | 점검·디버깅 시 |
| **Scale-in Protection** | 특정 인스턴스를 ASG가 종료 못하게 | Stateful 보호 |
| **Capacity Rebalancing** | Spot 회수 임박 시 미리 대체 | 가용성 ↑ |
| **EC2 Auto Recovery** | ASG가 아니라 EC2 자체 자동 복구 | StatusCheck 기반 |

> ⚠️ **함정**: "ALB 헬스 체크로만 ASG가 인스턴스 교체하나?" → ASG에 ELB Health Check 활성화 필요.

> 💡 **암기 팁**: 스케일링 정책 추천 순서 **TT > Step > Scheduled > Simple**. 시험에서 Simple은 거의 정답 아님.

### 관련 서비스 Cross-Reference

- ALB 헬스 체크 → Day 3
- Spot Fleet → Day 1
- CloudWatch 메트릭 → Week 9
- Lifecycle Hook + SSM 워밍업 → Week 9

---

## 🏗️ 아키텍처 다이어그램

```
[ ASG + ALB 표준 ]

   CloudWatch
   (CPUUtilization)
       │ Alarm
       ▼
   ASG (min=2, max=10, desired=4)
     ├─ Launch Template (AMI, IAM Role, UserData)
     ├─ AZ-a / AZ-b / AZ-c
     ├─ ELB Health Check (ALB Target Group)
     └─ Lifecycle Hooks
           ├─ Pending:Wait → 워밍업/등록
           └─ Terminating:Wait → 로그 업로드

   ALB → TG → ASG Instances
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Target Tracking이 가장 권장**되는 정책.
2. ⭐ **ASG Health Check는 EC2 + ELB 둘 다 켜는 것이 정답**.
3. ⭐ **Multi-AZ 서브넷 등록**으로 HA.
4. ⭐ **Lifecycle Hook**으로 종료 전 graceful 처리.
5. ⭐ **Mixed Instances + Spot 혼합**으로 비용 ↓ + 가용성 ↑.

---

## 💻 실제 예시 - AWS CLI

```bash
# 런치 템플릿
aws ec2 create-launch-template --launch-template-name app-lt \
  --launch-template-data file://lt.json

# ASG 생성 + Multi-AZ
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name app-asg \
  --launch-template "LaunchTemplateName=app-lt,Version=\$Latest" \
  --min-size 2 --max-size 10 --desired-capacity 4 \
  --vpc-zone-identifier subnet-priv-a,subnet-priv-b,subnet-priv-c \
  --target-group-arns arn:...:tg-web \
  --health-check-type ELB --health-check-grace-period 60

# Target Tracking 정책
aws autoscaling put-scaling-policy --auto-scaling-group-name app-asg \
  --policy-name cpu50 --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {"PredefinedMetricType":"ASGAverageCPUUtilization"},
    "TargetValue": 50.0
  }'
```

---

## 📝 연습 문제

**문제 1.** 가장 권장되는 스케일링 정책은?

A) Simple Scaling B) Target Tracking C) Step Scaling D) Manual

**정답: B**.

---

**문제 2.** ASG 인스턴스 종료 전에 로그를 S3에 업로드하려면?

A) UserData B) Lifecycle Hook (Terminating:Wait) C) Cloudwatch Events D) Scheduled Action

**정답: B**.

---

**문제 3.** ALB 뒤 ASG에서 비정상 인스턴스를 빠르게 교체하려면 ASG 헬스 체크 종류는?

A) EC2 only B) ELB Health Check C) Custom only D) 헬스 체크 비활성

**정답: B**.

---

**문제 4.** Spot + On-Demand를 한 ASG에 함께 사용하려면?

A) 불가능 B) Mixed Instances Policy C) Spread Placement Group D) Capacity Reservation

**정답: B**.

---

**문제 5.** 매일 오전 9시 트래픽이 급증함. 사전 확장 방법은?

A) Target Tracking만 B) Scheduled Scaling (또는 Predictive) C) Lifecycle Hook D) Termination Policy

**정답: B**.

---

## 📌 오늘의 요약

1. ASG는 Launch Template + Min/Max/Desired + 다중 AZ + 헬스 체크 + 스케일링 정책의 조합.
2. Target Tracking이 가장 권장.
3. 헬스 체크는 EC2 + ELB 둘 다.
4. Lifecycle Hook으로 graceful 처리, Warm Pool로 빠른 스케일.
5. 비용 최적화는 Mixed Instances + Spot 혼합.
