# Day 1 - Compute Optimizer, Right Sizing, EC2 인스턴스 패밀리

📅 날짜: Week 11 (Day 1)
🎯 주제: 리소스 적정 사이징과 비용·성능 균형
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Compute Optimizer로 자동 right-sizing 권장사항을 받는다
- EC2 인스턴스 패밀리(범용/컴퓨팅/메모리/스토리지/GPU)를 구분한다
- 메트릭 기반 적정 사이징을 수행한다

---

## 🧩 사전 지식 (CS 기초)

- **Workload profile**: CPU bound / Memory bound / IO bound / Network bound
- **Right sizing**: 워크로드에 맞는 적절한 크기. 과도하면 낭비, 부족하면 성능 ↓
- **ML 추천 시스템**: 사용 패턴 학습 → 최적 권장
- **Burst credit**: t 인스턴스의 누적 신용 기반 burst
- **Generation upgrade**: 신세대 인스턴스가 동가격에 더 빠름

---

## 📖 이론 내용

### 1. AWS Compute Optimizer

#### 개념
- ML 기반 right-sizing 권장 자동 생성
- 14일 CloudWatch 메트릭 분석
- 무료 (기본) 또는 Enhanced (유료, EC2)

#### 지원 리소스
- EC2 인스턴스
- EC2 Auto Scaling Group
- EBS 볼륨
- Lambda 함수
- ECS Fargate Service
- RDS DB 인스턴스 (신규)
- Commercial Software License (SQL Server 등)

#### Finding 유형
- **Under-provisioned**: 부족 (성능 저하 위험)
- **Over-provisioned**: 과다 (비용 낭비)
- **Optimized**: 적정

#### 권장사항 활용
- 다른 인스턴스 타입 권장 (예: t3.large → t3.medium)
- 권장 적용 시 예상 비용 절감 표시
- 메모리 메트릭 있으면 더 정확 (CloudWatch Agent 필요)

### 2. EC2 인스턴스 패밀리

#### 패밀리 분류

| 패밀리 | 의미 | 예시 |
|--------|------|------|
| **T (Burstable)** | 기본 + 신용 burst | t3.medium |
| **M (General)** | 범용 | m5.large, m6i.xlarge |
| **C (Compute)** | 컴퓨팅 최적화 | c5.large, c7g.xlarge |
| **R (Memory)** | 메모리 최적화 | r5.large, r6i.xlarge |
| **X (High Memory)** | 초고메모리 | x2idn.16xlarge |
| **I (Storage I/O)** | NVMe SSD 최적화 | i4i.large |
| **D (Storage Dense)** | HDD 밀집 | d3.xlarge |
| **G (GPU)** | 그래픽 | g5.xlarge |
| **P (GPU ML)** | ML 학습 | p4d.24xlarge |
| **Inf (Inferentia)** | ML 추론 | inf2.xlarge |
| **HPC** | High Performance Computing | hpc7g |

#### 명명 규칙
```
c7g.xlarge
│ │ │ └─ 크기
│ │ └── 옵션 (g=Graviton, n=네트워크, d=NVMe SSD, e=확장 메모리)
│ └──── 세대
└────── 패밀리
```

#### Graviton (ARM)
- Graviton 3/4: ARM 기반 CPU
- 20% 더 저렴 + 더 빠름 (대부분 워크로드)
- 호환성 확인 필요 (대부분 컨테이너·Java·Node·Python·Go 동작)

#### Burstable (t) 함정
- T2/T3: Burst Credit 누적 → 소진 시 baseline까지 떨어짐
- T3.unlimited: 신용 소진 후도 burst (추가 비용)
- 운영 워크로드엔 m/c 패밀리 권장

### 3. Right Sizing 의사결정 흐름

```
1. CloudWatch + Compute Optimizer 데이터 14일 수집
2. 메모리·디스크·네트워크 메트릭 활성화 (Agent)
3. Finding 검토:
   - Over-provisioned → 다운사이즈
   - Under-provisioned → 업사이즈 또는 패밀리 변경
   - Optimized → 유지
4. 다른 패밀리/세대 권장 검토
   - Graviton 호환 시도
   - 최신 세대로 (c5 → c6i → c7g)
5. 적용 (대부분 stop/start 필요)
6. 적용 후 재모니터링
```

### 4. EBS 볼륨 Optimizer

#### 분석
- gp2 → gp3 권장 (성능 ↑ 비용 ↓)
- Provisioned IOPS 과다 (사용량 vs 프로비저닝)
- 미사용 볼륨

#### gp2 vs gp3

| 항목 | gp2 | gp3 |
|------|-----|-----|
| 기본 IOPS | 크기 따라 | 3,000 |
| 처리량 | 250 MB/s | 125 MB/s (확장 가능) |
| 비용 | 더 비쌈 | 20% 저렴 |
| Provisioning | 자동 | 별도 설정 가능 |

### 5. Lambda Right Sizing

#### Power Tuning
- Lambda Power Tuning(OSS 도구)으로 메모리·실행시간 최적 조합 찾기
- Memory ↑ → CPU ↑ → 실행시간 ↓ → 비용 변동
- 비용과 성능의 sweet spot

#### Compute Optimizer Lambda
- 함수별 메모리 권장
- 실제 사용 메모리 vs 프로비저닝 비교

### 6. Auto Scaling 적정성

#### ASG Recommendations
- Mixed Instances로 비용 절감
- Spot 비율 증가 검토
- 인스턴스 패밀리 다양화로 가용성 ↑

### 7. 운영 점검 체크리스트

| 점검 항목 | 도구 |
|-----------|------|
| EC2 over-provisioned | Compute Optimizer |
| EBS gp2 → gp3 | Compute Optimizer / Trusted Advisor |
| 미사용 EBS | Trusted Advisor / Cost Explorer |
| 미사용 EIP | Trusted Advisor |
| 미사용 NAT GW | Cost Explorer (시간당 비용) |
| Idle RDS | Compute Optimizer |
| Lambda 과다 메모리 | Power Tuning |

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Resource Optimization Recommendations** | Cost Explorer의 내장 | 빠른 권장 |
| **AWS Trusted Advisor Recommendations** | Idle 인스턴스, Underutilized 등 | Cost 카테고리 |
| **Savings Plans** | 1년/3년 약정 할인 | Day 4 |
| **Predictive Scaling** | ML 기반 예측 스케일링 | 트래픽 패턴 |
| **Enhanced Monitoring** | RDS OS 레벨 메트릭 | 1초 단위 |

> ⚠️ **함정 1**: Compute Optimizer 권장에는 메모리 데이터가 없으면 부정확 — CloudWatch Agent 필수.
>
> ⚠️ **함정 2**: t 인스턴스의 baseline은 보통의 5~30% — 운영 워크로드엔 부적합.
>
> 💡 **암기 팁**: M(범용) - C(CPU) - R(메모리) - I(IO) - G/P(GPU). 첫 글자로 용도 추정.

### 관련 서비스 Cross-Reference

- **Compute Optimizer → Week 3 Day 3 CloudWatch Agent** (메모리 메트릭)
- **Right Sizing → Week 11 Day 3 Cost Explorer**
- **EBS gp3 → Week 10 Day 1 Snapshot**
- **Graviton → Week 7 Image Builder** (ARM AMI)

---

## 🏗️ 아키텍처 다이어그램

```
Compute Optimizer 권장 흐름
==========================================================

   [EC2 / ASG / Lambda / EBS / ECS Fargate / RDS]
            │
            │ 메트릭 발생
            ▼
   [CloudWatch Metrics (14일 수집)]
            │
            ▼ 메모리 메트릭은
            │  CloudWatch Agent 필요
            │
            ▼
   ┌─────────────────────────────┐
   │  AWS Compute Optimizer       │
   │  - ML 분석                   │
   │  - Right-sizing 권장          │
   │  - 예상 절감 표시            │
   └────────┬────────────────────┘
            │
            ▼
   [운영자 콘솔 검토]
   - Over-provisioned 다운사이즈
   - Under-provisioned 업사이즈
   - 다른 패밀리/세대 권장
   - Graviton 호환 시도
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Compute Optimizer = ML 기반 right-sizing** (14일 분석)
2. ⭐ **메모리 메트릭 있어야 정확** — CloudWatch Agent 활성화 필수
3. ⭐ **gp2 → gp3 전환 = 20% 저렴 + 성능 ↑** (Trusted Advisor 빈출 권장)
4. ⭐ **Graviton (ARM) = 20% 저렴**, 호환 시 적극 검토
5. ⭐ **T 인스턴스는 burstable** — 운영 핵심 워크로드 부적합 (baseline 낮음)

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Compute Optimizer 활성화
aws compute-optimizer update-enrollment-status \
  --status Active \
  --include-member-accounts

# 2. EC2 권장사항 조회
aws compute-optimizer get-ec2-instance-recommendations \
  --filters Name=Finding,Values=Overprovisioned Name=Finding,Values=Underprovisioned \
  --query 'instanceRecommendations[*].[instanceArn,currentInstanceType,recommendationOptions[0].instanceType,recommendationOptions[0].savingsOpportunity.savingsOpportunityPercentage]' \
  --output table

# 3. ASG 권장
aws compute-optimizer get-auto-scaling-group-recommendations \
  --query 'autoScalingGroupRecommendations[*].[autoScalingGroupName,currentConfiguration.instanceType,recommendationOptions[0].configuration.instanceType]'

# 4. EBS 권장 (gp2 → gp3)
aws compute-optimizer get-ebs-volume-recommendations \
  --filters Name=Finding,Values=NotOptimized \
  --query 'volumeRecommendations[*].[volumeArn,currentConfiguration.volumeType,volumeRecommendationOptions[0].configuration.volumeType,volumeRecommendationOptions[0].savingsOpportunity.savingsOpportunityPercentage]'

# 5. Lambda 권장
aws compute-optimizer get-lambda-function-recommendations \
  --query 'lambdaFunctionRecommendations[*].[functionArn,currentMemorySize,memorySizeRecommendationOptions[0].memorySize]'

# 6. 인스턴스 타입 변경
aws ec2 stop-instances --instance-ids i-abc
aws ec2 modify-instance-attribute --instance-id i-abc --instance-type "{\"Value\":\"t3.small\"}"
aws ec2 start-instances --instance-ids i-abc

# 7. EBS gp2 → gp3 변환 (다운타임 없이)
aws ec2 modify-volume \
  --volume-id vol-abc \
  --volume-type gp3 \
  --iops 3000 \
  --throughput 125

# 8. Lambda 메모리 조정
aws lambda update-function-configuration \
  --function-name my-func \
  --memory-size 512

# 9. CloudWatch Agent 메모리 메트릭 (Compute Optimizer 정확도 ↑)
# - Week 3 Day 3 참고
```

---

## 📝 연습 문제

**문제 1.** Compute Optimizer 권장이 부정확하다고 느낀다. 가장 흔한 원인은?

A) 메모리 메트릭이 없음 (CloudWatch Agent 미설치 → CPU/네트워크만으로 권장)
B) IAM 권한
C) 리전
D) 메트릭 보존 부족

**정답: A**
해설: EC2 메모리는 표준 메트릭 X. Agent 미설치 시 메모리 추측 → 권장 정확도 ↓. Agent 설치하면 ML 권장이 더 정확.

---

**문제 2.** 회사가 운영 EC2를 gp2 → gp3로 전환하려 한다. 다운타임 있나?

A) 있음 (인스턴스 중지)
B) 없음 — `modify-volume`으로 온라인 변경 가능
C) Snapshot 필요
D) Migration 도구

**정답: B**
해설: EBS volume type 변경은 온라인. 단, 변경 중 IOPS 일시 저하 가능. 비용/성능 즉시 이득.

---

**문제 3.** T 인스턴스(t3.medium)에서 운영 워크로드가 갑자기 느려진다. 원인은?

A) AWS 장애
B) Burst Credit 소진 → baseline(20%) CPU로 떨어짐
C) Disk 가득
D) 네트워크

**정답: B**
해설: T 인스턴스의 함정. 평소 baseline의 5~30%만 보장, burst는 credit 누적분. 운영 워크로드엔 m/c 권장.

---

**문제 4.** 회사가 Node.js 기반 마이크로서비스 비용을 20% 줄이려 한다. 어떤 옵션?

A) 인스턴스 더 크게
B) Graviton (c6g/c7g) 인스턴스로 전환 - ARM 기반, 20% 저렴 + 더 빠름
C) Spot 무조건
D) Lambda

**정답: B**
해설: Graviton은 대부분 컨테이너·Node·Java·Python·Go에 호환. 20% 저렴 + 더 빠름. 호환성 테스트 후 운영.

---

**문제 5.** Lambda 함수 메모리를 적정값으로 튜닝하려 한다. 어떤 도구?

A) Compute Optimizer Lambda + Lambda Power Tuning (Step Functions OSS)
B) X-Ray만
C) CloudWatch
D) Manual

**정답: A**
해설: Compute Optimizer가 자동 권장. Power Tuning은 메모리별 실행 시간·비용 그래프로 시각화. 두 도구 함께 사용.

---

## 📌 오늘의 요약

1. Compute Optimizer = ML 기반 right-sizing 자동 권장 (14일 분석)
2. EC2 패밀리: M(범용)/C(CPU)/R(메모리)/I(IO)/G·P(GPU)/T(burst). 명명에 g(Graviton)·n(네트워크)·d(NVMe) 옵션
3. Graviton(ARM)은 20% 저렴 + 빠름. 호환 가능한 워크로드에 적극 권장
4. gp2 → gp3 = 20% 저렴 + 성능 ↑. 다운타임 없이 변경
5. T 인스턴스는 burstable — 운영 핵심 워크로드 부적합 (baseline 낮음)
