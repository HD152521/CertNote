# Day 43 - AWS Config, Systems Manager

📅 날짜: Week 9 (Day 3)
🎯 주제: 컴플라이언스·운영 관리
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Config의 Rule / Conformance Pack / Aggregator를 안다
- Systems Manager 6대 기능을 안다
- Patch Manager / Session Manager / Parameter Store 사용을 익힌다

---

## 🧩 사전 지식 (CS 기초)

- **Desired State**: 시스템이 어떠해야 하는가. Config의 Rule이 이를 표현.
- **Drift**: 원하는 상태와 실제 상태의 불일치.
- **에이전트 기반 관리**: 호스트에 에이전트 설치 후 중앙에서 제어.

---

## 📖 이론 내용

### 1. AWS Config

- 리소스의 **구성 변경 기록** + **Rule 평가**.
- **Managed Rules** + **Custom (Lambda / Guard)**.
- **Conformance Pack**: 규제 묶음(PCI / HIPAA / NIST).
- **Aggregator**: 멀티 계정/리전 통합.
- 위반 시 **EventBridge** → 자동 대응.
- **Remediation Action**: Systems Manager Document로 자동 수정.

### 2. Systems Manager 핵심 기능

| 기능 | 설명 |
|------|------|
| **Session Manager** | SSH 키 없이 셸 (Week 2) |
| **Patch Manager** | OS·앱 패치 자동 |
| **Run Command** | 다수 EC2에 명령 실행 |
| **State Manager** | 원하는 상태 강제 |
| **Maintenance Windows** | 점검 시간대 정의 |
| **Parameter Store** | 구성/시크릿 (Week 8) |
| **Inventory** | 설치 패키지/구성 가시성 |
| **Compliance** | 패치·구성 컴플라이언스 |
| **Automation** | 운영 작업 자동화 (Document = Runbook) |

### 3. SSM Agent

- Amazon Linux / Ubuntu / Windows에 기본 사전 설치.
- 인스턴스에 **AmazonSSMManagedInstanceCore** IAM Role 필요.

### 4. Patch Manager

- **Patch Baseline**: 어떤 패치 분류 / 자동 승인 일수.
- **Patch Group**: 태그로 그룹화.
- 정기 점검 윈도우와 결합.

### 5. Config + SSM Automation 연계

- Config Rule 위반 → SSM Automation → 자동 교정.
- 예: 미암호화 EBS 발견 → 알람·격리.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Config Recording 비용** | 구성 항목 단위 | 큰 환경 비용 ↑ |
| **Aggregator Authorization** | 계정 간 승인 필요 | 멀티 계정 |
| **OpsCenter** | 운영 이슈 중앙 관리 | SSM |
| **Distributor** | 패키지 배포 | SSM |
| **AppConfig** | 동적 구성 안전 배포 | 신규 |

> ⚠️ **함정**: "리소스 사고 시 누가 변경?" → CloudTrail. "현재 상태와 정책 준수 여부?" → **Config**.

> 💡 **암기 팁**: 거버넌스 = Config, 운영 = SSM, 감사 = CloudTrail.

### 관련 서비스 Cross-Reference

- Organizations → Week 1
- CloudTrail → Day 2
- Trusted Advisor → Day 4

---

## 🏗️ 아키텍처 다이어그램

```
[ Config 자동 교정 ]

  Resource 변경 (CloudTrail)
      │
      ▼
  Config Recording → Config Rule 평가
      │ 위반
      ▼
  EventBridge → SSM Automation Runbook
      │
      ▼
  자동 수정 (예: EBS 암호화 토글, SG 회수)

[ SSM 운영 ]

  Patch Manager → Maintenance Window → 100대 동시 패치
  Run Command   → 명령 실행
  Session Mgr   → 셸 접속
  Inventory     → 설치 패키지 가시성
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Config = 구성 상태 + Rule 평가 + 자동 교정**.
2. ⭐ Aggregator로 멀티 계정/리전 통합.
3. ⭐ **Patch Manager + Maintenance Windows**로 일괄 패치.
4. ⭐ Session Manager = SSH 키 없이 셸.
5. ⭐ Run Command / Automation으로 운영 자동화.

---

## 💻 실제 예시 - AWS CLI

```bash
# Config 활성화
aws configservice put-configuration-recorder \
  --configuration-recorder name=default,roleARN=arn:...:role/Config

aws configservice put-delivery-channel \
  --delivery-channel name=default,s3BucketName=config-logs-bucket

aws configservice start-configuration-recorder \
  --configuration-recorder-name default

# 관리형 Rule (S3 BPA 활성 강제)
aws configservice put-config-rule --config-rule '{
  "ConfigRuleName":"s3-bpa",
  "Source":{"Owner":"AWS","SourceIdentifier":"S3_ACCOUNT_LEVEL_PUBLIC_ACCESS_BLOCKS"}
}'

# Patch Manager Baseline
aws ssm create-patch-baseline --name "saa-baseline" \
  --operating-system AMAZON_LINUX_2 \
  --approval-rules 'PatchRules=[{...}]'
```

---

## 📝 연습 문제

**문제 1.** "S3 버킷이 BPA 활성된 채로 유지되는지 자동 점검":

A) CloudTrail B) Config Rule C) Inspector D) Macie

**정답: B**.

---

**문제 2.** 100대 EC2에 OS 패치 자동 적용:

A) Run Command만 B) Patch Manager + Maintenance Window C) UserData D) ASG Refresh

**정답: B**.

---

**문제 3.** SSM 사용을 위한 인스턴스 요건:

A) Public IP B) AmazonSSMManagedInstanceCore Role + SSM Agent C) NACL 22 open D) IGW

**정답: B**.

---

**문제 4.** 멀티 계정 컴플라이언스 통합:

A) Trusted Advisor B) Config Aggregator C) Security Hub만 D) Organizations 직접

**정답: B**.

---

**문제 5.** Config 위반 시 자동 교정 도구:

A) Lambda 단독 B) SSM Automation Runbook + EventBridge C) Step Functions D) Inspector

**정답: B**.

---

## 📌 오늘의 요약

1. Config = 구성·Rule·자동 교정.
2. SSM 6대 기능 = Session/Run/State/Patch/Window/Parameter/Inventory.
3. Aggregator로 멀티 계정 통합.
4. 자동 교정은 Config + SSM Automation 조합.
5. SSM 사용은 Role + Agent 필수.
