# Day 2 - Trusted Advisor 5개 체크 카테고리

📅 날짜: Week 11 (Day 2)
🎯 주제: AWS의 자동 운영 권장사항 점검
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Trusted Advisor 5대 카테고리 체크를 이해한다
- Support 플랜별 접근 차이를 안다
- EventBridge 통합으로 자동 점검·알림한다

---

## 🧩 사전 지식 (CS 기초)

- **Best practice automation**: 모범 사례 자동 점검
- **Drift from baseline**: 표준에서 벗어남 자동 감지
- **Continuous compliance**: 정기 감사가 아닌 실시간 평가
- **Recommendation engine**: 권장사항 자동 산출

---

## 📖 이론 내용

### 1. Trusted Advisor 5대 카테고리

#### Cost Optimization
- 미사용 EBS 볼륨
- 미사용 Elastic IP
- 활동 없는 RDS DB
- 미사용 Load Balancer
- 활용도 낮은 EC2
- RI 활용 최적화 권장
- Savings Plans 활용 권장
- gp2 → gp3 권장

#### Performance
- 활용도 매우 높은 EC2 (과부하)
- 활용도 매우 높은 EBS
- 큰 보안 그룹 (규칙 다수 → 평가 지연)
- CloudFront Header Forwarding 권장
- CloudFront 캐시 활용도

#### Security
- 보안 그룹의 0.0.0.0/0 SSH/RDP
- S3 버킷 공개
- MFA 없는 Root 사용자
- IAM Access Key 회전 안 됨 (90일+)
- 활성 IAM 사용자 (운영 모범사례 위배)
- CloudTrail 비활성
- KMS 키 회전 비활성

#### Fault Tolerance
- Multi-AZ 없는 RDS
- EBS Snapshot 없음
- ELB 없는 Auto Scaling
- 단일 AZ 배포
- Route 53 헬스 체크
- Aurora Cluster 백업 비활성

#### Service Limits
- 한도의 80% 도달 시 알림
- VPC 개수, EIP 개수, 보안 그룹 등

### 2. Support 플랜별 접근

| 플랜 | 접근 가능 |
|------|-----------|
| **Basic / Developer** | 7개 핵심 체크만 (보안 + 서비스 한도) |
| **Business / Enterprise / Enterprise On-Ramp** | 100+ 전체 체크 |

#### 무료 7개 체크
1. S3 Bucket Permissions (공개)
2. Security Groups - Specific Ports Unrestricted
3. Service Limits
4. IAM Use (Root 사용)
5. MFA on Root Account
6. EBS Public Snapshots
7. RDS Public Snapshots

### 3. Trusted Advisor 운영 패턴

#### 정기 검토
- 주간/월간 검토
- Findings을 OpsCenter에 자동 등록 → 추적

#### EventBridge 통합
- Trusted Advisor → EventBridge → Lambda/SNS
- 새 Finding 발생 시 즉시 알림

#### Refresh API
- 일부 체크는 수동 refresh 필요 (변경 즉시 반영)
- 자동 refresh: 5분 ~ 1주일

### 4. Trusted Advisor + 자동 대응

#### 자동 대응 패턴
```
Trusted Advisor Finding (예: SG에 0.0.0.0/0 SSH)
   ↓
EventBridge Rule
   ↓
Lambda or SSM Automation
   ↓
- SG 규칙 자동 제거
- SNS 알림
- OpsItem 생성
```

#### Multi-Account
- Organizations 통합 (Management Account에서 모든 계정 view)
- Enterprise Support 필요

### 5. AWS Trusted Advisor와 다른 도구 비교

| 도구 | 역할 |
|------|------|
| **Trusted Advisor** | 자동 점검 + 5대 카테고리 권장 |
| **Config** | 컴플라이언스 평가 (커스텀 Rule) |
| **Security Hub** | 보안 finding 통합 + 표준 평가 |
| **Compute Optimizer** | Right-sizing 자동 권장 |
| **Cost Explorer** | 비용 분석 시각화 |

→ 보완 관계. Trusted Advisor는 가장 광범위.

### 6. AWS Health Dashboard

#### Service Health
- AWS 서비스 장애·예정 변경 알림
- 일반 사용자 view

#### Personal Health Dashboard (PHD)
- 내 계정에 영향 주는 이벤트만
- EC2 retirement, EBS 성능 저하, RDS Maintenance 등
- EventBridge 통합

### 7. AWS Cost Anomaly Detection

#### 개념
- ML 기반 비용 spike 자동 감지
- 갑작스러운 사용량 증가 알림

#### 동작
- 비용 패턴 학습 (서비스/태그/계정별)
- 비정상 spike → SNS/이메일 알림
- 원인 분석 도움

```bash
aws ce create-anomaly-monitor \
  --anomaly-monitor '{
    "MonitorName": "ServiceMonitor",
    "MonitorType": "DIMENSIONAL",
    "MonitorDimension": "SERVICE"
  }'

aws ce create-anomaly-subscription \
  --anomaly-subscription '{
    "SubscriptionName": "DailyAlert",
    "Threshold": 100,
    "Frequency": "DAILY",
    "MonitorArnList": ["arn:aws:ce:us-east-1:123:anomalymonitor/abc"],
    "Subscribers": [{"Type":"EMAIL","Address":"ops@company.com"}]
  }'
```

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Trusted Advisor API** | 프로그래밍 조회 | 자동 점검 |
| **Support API** | 케이스 자동 생성 | 운영 자동화 |
| **Marketplace 제품 권장** | Trusted Advisor가 일부 제품 권장 | 가끔 출제 |
| **Trusted Advisor Priority** | Enterprise Support 전용 우선순위 | 운영 효율 |
| **Cost Optimizer Hub** | 다양한 비용 도구 통합 (Compute Optimizer + TA + 등) | 신기능 |

> ⚠️ **함정 1**: 무료 7개 체크는 보안 + 한도만. 비용 최적화는 Business+ 필요.
>
> ⚠️ **함정 2**: 일부 체크는 자동 refresh 안 됨 — 변경 후 수동 refresh로 즉시 결과 확인.
>
> 💡 **암기 팁**: Trusted Advisor 5대 = Cost / Performance / Security / Fault Tolerance / Service Limits.

### 관련 서비스 Cross-Reference

- **Trusted Advisor → Week 9 Day 3 Access Analyzer** (보안 보완)
- **Trusted Advisor → Week 11 Day 1 Compute Optimizer** (right-sizing 보완)
- **Cost Anomaly → Week 11 Day 3 Cost Explorer**
- **Health Dashboard → Week 7 Day 4 EC2 Recover**

---

## 🏗️ 아키텍처 다이어그램

```
Trusted Advisor 통합 운영
==========================================================

   [Trusted Advisor]
   ──────────────────
   Cost / Performance / Security / Fault Tolerance / Limits
        │
        │ Findings 발생
        ▼
   ┌─────────────────────────────┐
   │  EventBridge Rule            │
   │  source: aws.trustedadvisor  │
   └────────┬────────────────────┘
            │
   ┌────────┼─────────┬────────────┐
   ▼        ▼         ▼            ▼
   [SNS]  [Lambda]  [SSM Automation] [OpsCenter OpsItem]
   알림    자동 대응   자동 복구       추적
```

```
운영자 정기 검토 체크리스트
==========================================================

   매주:
   - Security: 0.0.0.0/0 SG, Public S3 점검
   - Service Limits: 80% 이상 도달
   
   매월:
   - Cost: 미사용 EBS·EIP·LB 정리
   - Performance: 과부하 인스턴스 right-sizing
   - Fault Tolerance: Multi-AZ 누락 확인
   
   분기:
   - 전체 리뷰
   - RI/Savings Plans 활용 최적화
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Trusted Advisor 5대 카테고리**: Cost / Performance / Security / Fault Tolerance / Service Limits
2. ⭐ **무료는 7개 보안 + 한도만** — 전체는 Business+ Support
3. ⭐ **EventBridge 통합으로 자동 대응** — Trusted Advisor → Lambda/SSM
4. ⭐ **Service Limits 80% 도달 시 사전 알림** — 운영 사전 대응
5. ⭐ **Cost Anomaly Detection으로 비정상 비용 spike 자동 감지**

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. 모든 Trusted Advisor 체크 목록
aws support describe-trusted-advisor-checks --language en

# 2. 특정 체크 결과 (예: Security Group)
aws support describe-trusted-advisor-check-result \
  --check-id "HCP4007jGY" \
  --query 'result.flaggedResources[*].metadata'

# 3. 모든 체크 결과 요약 (Summary)
aws support describe-trusted-advisor-check-summaries \
  --check-ids \
    "Pfx0RwqBli" \  # Security Groups
    "HCP4007jGY" \  # IAM Access Key Rotation
    "Yw2K9puPzl"    # MFA on Root

# 4. 체크 Refresh (변경 즉시 반영)
aws support refresh-trusted-advisor-check --check-id "Pfx0RwqBli"

# 5. EventBridge로 자동 알림
aws events put-rule \
  --name "TrustedAdvisorAlert" \
  --event-pattern '{
    "source":["aws.trustedadvisor"],
    "detail-type":["Trusted Advisor Check Item Refresh Notification"],
    "detail":{"status":["ERROR","WARN"]}
  }'

aws events put-targets \
  --rule TrustedAdvisorAlert \
  --targets "Id=1,Arn=arn:aws:sns:us-east-1:123:ops-alerts"

# 6. Service Limits 점검
aws service-quotas list-service-quotas \
  --service-code ec2 \
  --query 'Quotas[?Value>`0`].[QuotaName,Value]' \
  --output table

# 7. Cost Anomaly Detection 설정
aws ce create-anomaly-monitor \
  --anomaly-monitor '{
    "MonitorName": "PerServiceMonitor",
    "MonitorType": "DIMENSIONAL",
    "MonitorDimension": "SERVICE"
  }'

aws ce create-anomaly-subscription \
  --anomaly-subscription '{
    "SubscriptionName": "DailyAnomalyAlert",
    "Threshold": 100,
    "Frequency": "DAILY",
    "MonitorArnList": ["arn:aws:ce::123:anomalymonitor/abc"],
    "Subscribers": [{"Type":"EMAIL","Address":"finops@company.com"}]
  }'

# 8. Personal Health Dashboard
aws health describe-events \
  --filter "eventStatusCodes=open,upcoming,regions=ap-northeast-2"

aws health describe-affected-entities \
  --filter "eventArns=arn:aws:health:..."
```

---

## 📝 연습 문제

**문제 1.** Trusted Advisor의 5개 카테고리가 아닌 것은?

A) Cost Optimization
B) Performance
C) Security
D) Compliance (실제는 Service Limits, Fault Tolerance)

**정답: D**
해설: 5대 = Cost / Performance / Security / Fault Tolerance / Service Limits. Compliance는 Audit Manager·Config 영역.

---

**문제 2.** 무료 계정에서 Trusted Advisor의 비용 최적화 권장(미사용 EBS 등)을 받으려면?

A) 그대로 가능
B) Business 또는 Enterprise Support 플랜 가입
C) IAM 권한
D) Region 변경

**정답: B**
해설: 무료는 7개 보안 + 서비스 한도만. 전체 100+ 체크는 Business($100/월) 이상.

---

**문제 3.** 회사의 EBS 볼륨 한도가 80% 도달하기 전 알림받으려면?

A) Manual 점검
B) Trusted Advisor Service Limits 카테고리 + EventBridge 알림
C) Lambda
D) CloudWatch

**정답: B**
해설: Trusted Advisor가 한도의 80% 자동 점검. EventBridge로 알림 자동화.

---

**문제 4.** 한 달 비용이 갑자기 3배 spike 됐다. 원인을 자동 감지하려면?

A) Cost Explorer 수동 점검
B) AWS Cost Anomaly Detection - ML 기반 자동 감지 + 알림
C) Trusted Advisor
D) CloudWatch

**정답: B**
해설: Cost Anomaly Detection이 정확한 도구. ML로 정상 패턴 학습 → 비정상 spike 자동 알림. 서비스/태그/계정별 monitor.

---

**문제 5.** EC2 인스턴스가 호스트 retirement 예정이라는 알림을 받으려면?

A) Trusted Advisor
B) AWS Personal Health Dashboard + EventBridge
C) CloudTrail
D) Inspector

**정답: B**
해설: AWS 측의 예정 변경(인프라 교체)은 PHD. EventBridge로 사전 알림 자동화 → 사전 마이그레이션.

---

## 📌 오늘의 요약

1. Trusted Advisor 5대 카테고리: Cost / Performance / Security / Fault Tolerance / Service Limits
2. 무료 = 7개 (보안 + 한도). 전체 = Business+ Support
3. EventBridge 통합으로 자동 알림 + 자동 대응 (Lambda/SSM)
4. AWS Cost Anomaly Detection으로 비용 spike 자동 감지
5. Personal Health Dashboard로 AWS 측 예정 변경 사전 대응
