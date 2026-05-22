# Day 2 - SSM State Manager, Inventory, Compliance

📅 날짜: Week 9 (Day 2)
🎯 주제: 인스턴스 fleet의 원하는 상태 유지 + 컴플라이언스 가시화
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- State Manager Association으로 원하는 상태 정기 강제
- Inventory로 SW/패키지 자동 조사 + Athena 쿼리
- Compliance 대시보드 + Security Hub 통합
- SSM Distributor 패키지 배포

---

## 🧩 사전 지식 (CS 기초)

- **Desired State**: 원하는 상태. K8s, Puppet, Chef의 공통 추상화.
- **Drift Reconciliation**: 실제와 원하는 상태 차이를 자동 정정.
- **Inventory Data Lake**: 수집된 데이터를 S3에 적재, Athena로 쿼리.

---

## 📖 이론 내용

### 1. State Manager Association

```bash
aws ssm create-association \
  --name AWS-ConfigureAWSPackage \
  --association-name Install-CW-Agent \
  --targets Key=tag:Environment,Values=prod \
  --parameters '{
    "action":["Install"],
    "name":["AmazonCloudWatchAgent"]
  }' \
  --schedule-expression "rate(7 days)" \
  --apply-only-at-cron-interval \
  --compliance-severity HIGH
```

- 정기 실행 (cron/rate)
- 자동 컴플라이언스 보고 (성공/실패 인스턴스 수)
- 새 인스턴스 자동 적용

**자주 사용하는 Document:**
- `AWS-ConfigureAWSPackage`: 패키지 설치 (CloudWatch Agent, Inspector 등)
- `AWS-RunPatchBaseline`: 패치 적용
- `AWS-GatherSoftwareInventory`: Inventory 수집
- `AWS-UpdateSSMAgent`: 에이전트 자체 업데이트
- `AWS-ConfigureCloudWatch`: CloudWatch 통합 설정

### 2. Inventory

자동 수집 대상:
- **AWS:Application** — 설치된 앱 목록
- **AWS:Service** — 실행 중 서비스
- **AWS:InstanceInformation** — OS, 아키텍처, 호스트명
- **AWS:Network** — 인터페이스, IP
- **AWS:WindowsRole/WindowsUpdate** — Windows 전용
- **AWS:File** — 특정 파일 메타데이터 (선택)
- **Custom Inventory** — 사용자 정의

```bash
# 활성화 (State Manager Association)
aws ssm create-association \
  --name AWS-GatherSoftwareInventory \
  --targets Key=InstanceIds,Values=* \
  --parameters file://inventory-params.json \
  --schedule-expression "rate(30 minutes)"
```

### 3. Resource Data Sync — Inventory를 S3로

```bash
aws ssm create-resource-data-sync \
  --sync-name InventoryToS3 \
  --s3-destination '{
    "BucketName":"my-inventory-bucket",
    "Region":"ap-northeast-2",
    "SyncFormat":"JsonSerDe",
    "Prefix":"inventory"
  }'
```

데이터가 S3에 적재 → **Athena로 SQL 쿼리** 가능:
```sql
SELECT instanceid, applicationtype, name, version
FROM ssm_inventory.aws_application
WHERE name = 'OpenSSL' AND version < '1.1.1';
```

### 4. Compliance

State Manager Association + Patch Manager 결과가 자동으로 Compliance에 보고:
- `AWS:State` — Association 결과
- `AWS:Patch` — Patch 결과

```bash
aws ssm list-compliance-summaries
aws ssm list-resource-compliance-summaries
```

Security Hub로 자동 finding 전송 → 통합 대시보드.

### 5. Distributor — 패키지 배포

```bash
# 패키지 생성
aws ssm create-document \
  --content file://manifest.json \
  --attachments Key=SourceUrl,Values=s3://my-pkg/ \
  --name my-agent \
  --document-type Package

# State Manager로 배포
aws ssm create-association \
  --name AWS-ConfigureAWSPackage \
  --targets Key=tag:Environment,Values=prod \
  --parameters '{
    "action":["Install"],
    "name":["my-agent"],
    "version":["1.2.0"]
  }' \
  --schedule-expression "rate(1 day)"
```

자체 패키지(예: 보안 에이전트, 모니터링 도구)를 자동 설치 + 정기 갱신.

### 6. SSM Document Types

| 종류 | 용도 |
|------|------|
| `Command` | Run Command 스크립트 |
| `Policy` | State Manager 정책 |
| `Automation` | Runbook (워크플로) |
| `Session` | Session Manager 설정 |
| `Package` | Distributor 패키지 |
| `ApplicationConfiguration` / `ApplicationConfigurationSchema` | AppConfig |
| `DeploymentStrategy` | AppConfig 배포 전략 |

---

## 🧠 알아두면 좋은 심화 이론

### Inventory + Athena 활용

| 쿼리 사례 | SQL |
|----------|-----|
| 특정 CVE 영향 인스턴스 | `WHERE Name='libssl' AND Version IN (...)` |
| 특정 SW 설치된 인스턴스 | `WHERE applicationtype = 'X'` |
| OS 패치 컴플라이언스 | Patch_summary 테이블 |
| 호스트명 패턴 검색 | InstanceInformation |

### Compliance + Security Hub 통합

State Manager의 컴플라이언스 결과가 Security Hub Findings로 → Security Hub Custom Actions로 EventBridge → 자동 대응.

### Custom Inventory

```json
{
  "SchemaVersion": "1.0",
  "TypeName": "Custom:Compliance",
  "Content": {
    "AgentVersion": "1.2.3",
    "AntivirusEnabled": "true"
  }
}
```

`aws ssm put-inventory --instance-id ... --items file://custom.json`

기업별 컴플라이언스 항목 자동 수집.

### Change Calendar

```bash
aws ssm create-document \
  --name FreezeWindow \
  --document-type ChangeCalendar \
  --content file://calendar.json
```

- Open / Closed 시간대 정의
- Automation Runbook이 Change Calendar 상태 확인 후 진행
- 예: 블랙 프라이데이 freeze, 분기 결산일 freeze

### 관련 서비스 Cross-Reference

- **Security Hub** → Week 14 Day 2
- **SSM Automation** → Week 12 Day 2
- **AppConfig** → Week 9 Day 3
- **Athena** → Week 10 Day 2 (Logs Insights와 비교)

---

## 🏗️ 아키텍처 다이어그램

```
Inventory + Compliance + Distributor
==================================================

  State Manager Association (rate 30min)
   └─ AWS-GatherSoftwareInventory
         │
         ▼
   Instance metadata + apps + patches
         │
         ▼
   SSM Inventory (per region)
         │
         │ Resource Data Sync
         ▼
   S3 Bucket (json) → Athena queries

  Patch Manager + State Manager
         │
         ▼
   Compliance Summary
         │
         ▼
   Security Hub Findings
         │
         ▼
   EventBridge → Lambda → auto-remediate

  Distributor packages
   ├─ AmazonCloudWatchAgent
   ├─ CodeDeploy Agent
   └─ Custom security agent
   Deployed via State Manager Association
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ State Manager로 원하는 상태 정기 강제 + 컴플라이언스 자동 보고
2. ⭐ Inventory → Resource Data Sync → S3 → Athena 쿼리 파이프라인
3. ⭐ Distributor + State Manager로 자체 에이전트 자동 배포
4. ⭐ Compliance가 Security Hub Findings로 전송 → 통합 대응
5. ⭐ Change Calendar로 freeze 윈도우 코드화

---

## 💻 실제 예시 - 종합 자동화

```bash
# 1) Inventory 자동 수집
aws ssm create-association \
  --name AWS-GatherSoftwareInventory \
  --targets Key=InstanceIds,Values=* \
  --schedule-expression "rate(30 minutes)" \
  --parameters '{
    "applications":["Enabled"],
    "awsComponents":["Enabled"],
    "services":["Enabled"],
    "networkConfig":["Enabled"]
  }'

# 2) Resource Data Sync (Inventory → S3)
aws ssm create-resource-data-sync \
  --sync-name inv-to-s3 \
  --s3-destination BucketName=my-inv,Region=ap-northeast-2,SyncFormat=JsonSerDe

# 3) Athena 테이블 (Glue Crawler 또는 수동)
# CREATE EXTERNAL TABLE ssm_inventory.aws_application (...) LOCATION 's3://my-inv/...'

# 4) CloudWatch Agent 표준 설치
aws ssm create-association \
  --name AWS-ConfigureAWSPackage \
  --targets Key=tag:Environment,Values=prod \
  --parameters '{"action":["Install"],"name":["AmazonCloudWatchAgent"]}' \
  --schedule-expression "rate(7 days)"

# 5) Compliance 확인
aws ssm list-compliance-summaries \
  --filters Key=ComplianceType,Values=Patch,Type=EQUAL
```

---

## 📝 연습 문제

**문제 1.** State Manager의 가장 큰 가치는?

A) 일회성 명령
B) 원하는 상태를 정기적으로 강제 + 중앙 컴플라이언스 보고
C) IAM 회전
D) Region 분산

**정답: B**
해설: 정기 + 컴플라이언스가 핵심.

---

**문제 2.** Inventory 데이터를 SQL로 분석하려면?

A) DynamoDB
B) Resource Data Sync → S3 → Athena
C) CloudWatch Logs Insights
D) Trusted Advisor

**정답: B**
해설: S3 + Athena 파이프라인.

---

**문제 3.** SSM Distributor의 역할은?

A) 패키지(에이전트)를 정의 + 자동 설치/업데이트
B) IAM 권한 배포
C) Region 동기화
D) Stack 배포

**정답: A**
해설: Custom 에이전트 배포의 표준.

---

**문제 4.** State Manager Association의 새 인스턴스 동작은?

A) 무시
B) 태그 일치 시 자동 적용 → 첫 부팅 후 표준 상태 보장
C) 수동 등록 필요
D) Lambda 트리거

**정답: B**
해설: 새 인스턴스도 자동 적용 — 신규 자원 표준화.

---

**문제 5.** Change Calendar의 용도는?

A) 비용 추적
B) Open/Closed 시간대 정의 — Automation이 변경 freeze 자동 준수
C) IAM 일정
D) Region 자동 선택

**정답: B**
해설: 변경 freeze 코드화.

---

**문제 6.** Inventory 수집 항목이 아닌 것은?

A) Application
B) Service
C) Network
D) IAM 사용자 목록

**정답: D**
해설: IAM은 SSM Inventory 영역 아님.

---

**문제 7.** Patch Compliance를 Security Hub로 자동 전송하려면?

A) Lambda 매번 호출
B) Security Hub에서 SSM Patch finding을 활성 (기본 통합)
C) S3 통합
D) EventBridge만

**정답: B**
해설: Security Hub와 SSM 통합은 native.

---

## 📌 오늘의 요약

1. State Manager = 원하는 상태 정기 강제 + 컴플라이언스 보고
2. Inventory → Resource Data Sync → S3 → Athena 쿼리
3. Distributor + State Manager로 패키지 자동 배포
4. Compliance → Security Hub Findings 자동 전송
5. Change Calendar로 freeze 윈도우 코드화
