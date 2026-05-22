# Day 1 - 도메인 1·2 복습 (모니터링·로깅·수정 + 안정성·BCP)

📅 날짜: Week 12 (Day 1)
🎯 주제: SOA-C02 도메인 1·2 핵심 압축 정리
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 도메인 1(모니터링·로깅·수정 20%)과 도메인 2(안정성·BCP 16%) 통합 36%의 핵심을 한 번에 정리한다
- 시험 자주 출제되는 "키워드 → 정답 서비스" 매핑을 암기한다
- 도메인 통합 시나리오 5문항으로 점검한다

---

## 🧩 사전 지식 (CS 기초)

- **Observability 3축**: Metric / Log / Trace
- **MTTR**: 평균 복구 시간. 자동화로 줄임
- **RTO/RPO**: 복구 시간 목표 / 복구 시점 목표 (BCP 핵심)
- **Idempotency**: 멱등성. 자동 수정의 안전성 보장

---

## 📖 이론 내용

### 1. 도메인 1: 모니터링·로깅·수정 (20%)

#### 1-1. CloudWatch Metrics

| 항목 | 핵심 |
|------|------|
| 표준 메트릭 | EC2 기본은 5분, Detailed 1분 (추가 비용) |
| 사용자 지정 | PutMetricData API, namespace + dimension |
| **메모리·디스크는 표준 X** | CloudWatch Agent 필수 |
| Anomaly Detection | ML 학습 후 이상치 알람 |

#### 1-2. CloudWatch Logs

| 항목 | 핵심 |
|------|------|
| Log Group / Stream | 그룹 = 보존정책 단위 |
| Subscription Filter | Kinesis/Lambda/OpenSearch 실시간 전송 |
| Metric Filter | 패턴 매칭 → 메트릭 변환 |
| Logs Insights | SQL-like 쿼리. 트러블슈팅 |
| EMF | JSON 로그 안에 메트릭 포함 → 비용 절감 |

#### 1-3. Alarms

| 종류 | 용도 |
|------|------|
| Standard | 단일 메트릭 임계 |
| Composite | 여러 알람 AND/OR 결합 (알람 폭주 방지) |
| Anomaly Detection | 동적 임계 (밴드) |
| M of N | N개 평가 중 M개 위반 시 발동 |

#### 1-4. 감사·이력

| 서비스 | 역할 | 시험 키워드 |
|--------|------|-------------|
| **CloudTrail** | API 호출 이력 (Who/When/What) | "누가 삭제했나?" |
| **Config** | 리소스 구성 이력 + 컴플라이언스 | "이전 SG 설정은?" |
| **CloudTrail Lake** | SQL 검색 가능한 trail 데이터 레이크 | "장기 보존+분석" |
| **Audit Manager** | 컴플라이언스 보고서 자동화 | "PCI 감사" |

#### 1-5. 자동 수정

- **Config Rule + Remediation** (SSM Automation 호출)
- **EventBridge + Lambda/SSM**
- **GuardDuty Finding → EventBridge → 자동 격리**

### 2. 도메인 2: 안정성·BCP (16%)

#### 2-1. 고가용성 (HA)

| 패턴 | 설명 |
|------|------|
| Multi-AZ | 단일 리전, 여러 AZ |
| Multi-Region | 글로벌 배포 |
| Auto Scaling | EC2/ECS/Aurora/DynamoDB |
| ELB + Health Check | 비정상 인스턴스 자동 제거 |

#### 2-2. RDS HA

| 항목 | Multi-AZ | Read Replica |
|------|----------|--------------|
| 목적 | HA (자동 failover) | 읽기 성능 확장 |
| 동기/비동기 | 동기 | 비동기 |
| 엔드포인트 | 동일 (자동 전환) | 별도 |
| Cross-Region | Multi-AZ DB Cluster 일부 가능 | RR로 가능 |

#### 2-3. 백업·DR

| 서비스 | 역할 |
|--------|------|
| **EBS Snapshot + DLM** | EBS 자동 스냅샷 + 보존 |
| **AWS Backup** | 통합 백업 (EBS/RDS/EFS/DynamoDB/S3) |
| **Cross-Region Copy** | 리전 장애 대비 |
| **S3 Replication (CRR/SRR)** | 객체 자동 복제 |
| **Storage Gateway** | 온프레미스 ↔ S3 |
| **Elastic Disaster Recovery** | 서버 단위 DR |

#### 2-4. DR 전략 4종

| 전략 | RTO | 비용 |
|------|-----|------|
| Backup & Restore | 시간 단위 | 가장 저렴 |
| Pilot Light | 분 단위 | 중간 |
| Warm Standby | 분 이내 | 비쌈 |
| Multi-Site Active-Active | 0 | 가장 비쌈 |

#### 2-5. Route 53 라우팅 정책 (DR/HA 연계)

| 정책 | 용도 |
|------|------|
| Failover | Primary 장애 시 Secondary |
| Latency-based | 가장 가까운 리전 |
| Geolocation | 지리적 위치 기준 |
| Weighted | 가중치 분산 (Canary, A/B) |
| Multi-Value Answer | 단순 분산 + 헬스체크 |

### 3. "키워드 → 정답" 통합표

| 키워드 | 도메인 1·2 정답 |
|--------|-----------------|
| "누가 언제 삭제했나" | CloudTrail |
| "이전 SG 설정 추적" | Config |
| "EC2 메모리 메트릭" | CloudWatch Agent |
| "여러 알람 통합" | Composite Alarm |
| "이상치 탐지" | Anomaly Detection |
| "비정상 인스턴스 자동 제거" | ELB Health Check + ASG |
| "리전 장애 대비 RDS" | Cross-Region Read Replica / Aurora Global DB |
| "백업 통합 관리" | AWS Backup |
| "RTO 0 목표" | Multi-Site Active-Active |
| "Primary 장애 시 자동 전환" | Route 53 Failover Routing |

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **CloudWatch Cross-Account/Region** | 단일 대시보드로 통합 | 멀티 계정 운영 |
| **Logs Subscription Filter 비용** | Kinesis Firehose가 가장 저렴 | OpenSearch는 비쌈 |
| **EventBridge vs CloudWatch Events** | 같은 서비스 (리브랜딩) | 동의어 |
| **Aurora Global DB RPO** | 일반적으로 < 1초 | 빠름 |
| **RDS Multi-AZ Cluster (3 인스턴스)** | 신규. Reader Endpoint 제공 | 2023+ |
| **AWS Backup Vault Lock** | WORM 방식, 삭제 방지 | 규제 산업 |

> ⚠️ **함정 1**: Multi-AZ는 HA용이지 읽기 성능 확장 아님. 읽기는 Read Replica.
>
> ⚠️ **함정 2**: CloudWatch 표준 메트릭에 메모리·디스크 없음 → 항상 Agent.
>
> ⚠️ **함정 3**: CloudTrail은 API 호출, Config는 구성 변경. 혼동 주의.
>
> 💡 **암기 팁**: 도메인 1 = "보고/추적/자동수정", 도메인 2 = "장애 대비"

---

## 🏗️ 아키텍처 다이어그램

```
도메인 1·2 통합 운영 흐름
==========================================================

  [관측] ─► [감지] ─► [대응] ─► [복구] ─► [감사]
    │         │         │         │         │
  Metrics    Alarm    Lambda    Auto      CloudTrail
   Logs    Composite   SSM      Scaling      Config
   Traces  Anomaly   EventBridge Multi-AZ  Audit Manager
                                  Backup
                                  DR

  RPO/RTO 충족 ──► 백업 + Multi-Region + Route 53 Failover
```

---

## ⭐ 핵심 포인트 (도메인 1·2 통합)

1. ⭐ **CloudTrail = API 이력, Config = 구성 이력** (헷갈리지 말 것)
2. ⭐ **메모리·디스크 메트릭 = CloudWatch Agent 필수**
3. ⭐ **자동 수정: Config Rule + Remediation 또는 EventBridge + Lambda/SSM**
4. ⭐ **RDS HA = Multi-AZ**, **읽기 확장 = Read Replica**, **글로벌 = Aurora Global DB**
5. ⭐ **DR 4종**: Backup&Restore / Pilot Light / Warm Standby / Multi-Site (RTO·비용 trade-off)

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. CloudTrail 조직 trail (멀티 계정 통합)
aws cloudtrail create-trail \
  --name org-trail \
  --s3-bucket-name central-audit-bucket \
  --is-organization-trail \
  --is-multi-region-trail

# 2. Config Rule 자동 수정
aws configservice put-remediation-configurations \
  --remediation-configurations '[{
    "ConfigRuleName":"s3-bucket-public-read-prohibited",
    "TargetType":"SSM_DOCUMENT",
    "TargetId":"AWS-DisableS3BucketPublicReadWrite",
    "Automatic":true
  }]'

# 3. Composite Alarm (CPU + Memory 모두 위반)
aws cloudwatch put-composite-alarm \
  --alarm-name "WebServer-Degraded" \
  --alarm-rule "ALARM(CPUHigh) AND ALARM(MemoryHigh)" \
  --alarm-actions arn:aws:sns:ap-northeast-2:123:OpsAlerts

# 4. AWS Backup Plan (일일 + 주간 + 월간)
aws backup create-backup-plan --backup-plan '{
  "BackupPlanName":"GoldenPlan",
  "Rules":[
    {"RuleName":"Daily","TargetBackupVaultName":"Default","ScheduleExpression":"cron(0 5 ? * * *)","Lifecycle":{"DeleteAfterDays":30}},
    {"RuleName":"Weekly","TargetBackupVaultName":"Default","ScheduleExpression":"cron(0 5 ? * SUN *)","Lifecycle":{"DeleteAfterDays":90}}
  ]
}'

# 5. Route 53 Failover Record
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123 \
  --change-batch '{"Changes":[{
    "Action":"CREATE",
    "ResourceRecordSet":{
      "Name":"app.example.com","Type":"A",
      "SetIdentifier":"primary",
      "Failover":"PRIMARY",
      "HealthCheckId":"hc-123",
      "AliasTarget":{"HostedZoneId":"Z2FDTNDATAQYW2","DNSName":"primary-alb.region.elb.amazonaws.com","EvaluateTargetHealth":true}
    }
  }]}'
```

---

## 📝 도메인 통합 시나리오 5문항

**문제 1.** EC2가 새벽에 종료됐다. 누가/언제 종료했는지 추적하려면?

A) Config
B) CloudTrail (API 이력 `TerminateInstances`)
C) CloudWatch Logs
D) VPC Flow Logs

**정답: B**
해설: API 호출 이력은 CloudTrail. Config는 리소스 구성 변경 이력이라 결이 다름.

---

**문제 2.** 회사가 "리전 전체 장애" 발생 시 RDS PostgreSQL을 15분 이내 복구해야 한다.

A) Multi-AZ만
B) Cross-Region Read Replica (failover 가능)
C) Snapshot만
D) On-demand 인스턴스

**정답: B**
해설: 단일 리전 장애 대비 = Cross-Region. Aurora는 Global DB가 정답. 일반 RDS는 CRR Read Replica + 수동/자동 promote.

---

**문제 3.** EC2 디스크 사용량 90% 도달 시 알람 + 자동으로 EBS 확장하려면?

A) CloudWatch Alarm만
B) CloudWatch Agent(디스크 메트릭) + Alarm + EventBridge → SSM Automation(`AWS-ExpandVolume`)
C) CloudTrail
D) Trusted Advisor

**정답: B**
해설: 디스크는 Agent 필수. 자동 수정은 SSM Automation Runbook이 표준.

---

**문제 4.** RTO 0, RPO 0에 가까운 글로벌 서비스를 운영하려면 어떤 DR 전략?

A) Backup & Restore
B) Pilot Light
C) Warm Standby
D) Multi-Site Active-Active

**정답: D**
해설: RTO 0 = 모든 리전 항상 active. 가장 비싸지만 가장 빠름.

---

**문제 5.** 회사가 S3 객체 1년 보존이 규제 요건이고 삭제·변경 불가해야 한다.

A) S3 Versioning만
B) S3 Object Lock (Compliance Mode) + Lifecycle
C) S3 Replication
D) AWS Backup Vault Lock

**정답: B**
해설: S3 객체 자체 보존·삭제 불가 요건은 Object Lock Compliance Mode. Vault Lock은 Backup 리소스용.

---

## 📌 오늘의 요약

1. **CloudTrail(API) vs Config(구성)** 헷갈리지 말 것
2. 메모리·디스크 = **CloudWatch Agent**, 동적 임계 = **Anomaly Detection**, 알람 통합 = **Composite**
3. **자동 수정**: Config Rule + Remediation / EventBridge + SSM Automation
4. **RDS HA = Multi-AZ**, 읽기 = Read Replica, 글로벌 = Aurora Global DB
5. **DR 4종** = Backup&Restore / Pilot Light / Warm Standby / Multi-Site (RTO·비용 trade-off)
