# Day 3 - Patch Manager (베이스라인, 패치 그룹, 컴플라이언스)

📅 날짜: Week 5 (Day 3)
🎯 주제: OS 패치를 안전하고 컴플라이언트하게 자동화
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Patch Baseline의 구조(승인 규칙, 우선순위)를 이해한다
- Patch Group으로 대상별 다른 베이스라인을 적용한다
- Maintenance Window와 결합한 완전 자동 패치 운영을 구성한다

---

## 🧩 사전 지식 (CS 기초)

- **CVE (Common Vulnerabilities and Exposures)**: 알려진 보안 취약점 식별자
- **CVSS Score**: 취약점 심각도 (0~10)
- **Patch Tuesday**: Microsoft가 매월 둘째 화요일 패치 공개
- **Rolling update**: 점진적으로 일부씩 업데이트
- **Reboot semantics**: 패치 적용 후 재부팅 필요 여부

---

## 📖 이론 내용

### 1. Patch Manager 개요

#### 무엇을 해주나
- 다수 인스턴스에 OS 패치를 자동 점검·적용
- 어떤 패치를 언제 적용할지 정책으로 관리
- 패치 적용 후 컴플라이언스 자동 보고

#### 지원 OS
- Linux: Amazon Linux 2/2023, Ubuntu, RHEL, SUSE, Oracle Linux, CentOS, Rocky/Alma, Debian, macOS
- Windows: 2012 R2 이상

### 2. Patch Baseline

#### 개념
- "어떤 패치를 승인할지" 규칙 모음
- AWS 사전 정의 + 사용자 정의 가능

#### AWS 기본 베이스라인 (`AWS-DefaultPatchBaseline-*`)
- 보안 + Critical만 자동 승인
- 공개 후 7일 자동 승인 대기

#### Custom Baseline 구성 요소

**Approval Rules**
| 필드 | 의미 |
|------|------|
| `ProductVersion` | OS 버전 (예: AmazonLinux2) |
| `Classification` | Security, Critical, Important 등 |
| `Severity` | Critical, Important, Moderate, Low |
| `ApproveAfterDays` | 공개 후 N일 후 자동 승인 |
| `ApproveUntilDate` | 특정 날짜까지 |
| `EnableNonSecurity` | 비보안 패치 포함 여부 |
| `ComplianceLevel` | 패치 누락 시 보고 심각도 |

**Approved/Rejected Patches (수동 목록)**
- 특정 KB 번호 명시적 승인/거부
- Rule보다 우선

#### Linux vs Windows 차이
- **Linux**: 패키지 단위 (예: `kernel-5.10`)
- **Windows**: KB 번호 단위 (예: `KB5034441`)

### 3. Patch Group

#### 개념
- 인스턴스 태그 `Patch Group` 값으로 어느 베이스라인 적용할지 결정
- 한 인스턴스는 정확히 한 Patch Group 소속

#### 표준 패턴

| Tag value | 베이스라인 |
|-----------|-----------|
| `Patch Group = prod-web` | 보수적 (Security/Critical만, 14일 대기) |
| `Patch Group = stage-web` | 중간 (Security/Critical/Important, 7일 대기) |
| `Patch Group = dev` | 공격적 (모든 패치, 즉시 승인) |

→ Stage에서 먼저 적용해보고 prod 적용. 같은 베이스라인 안에서도 그룹별 정책 차이.

### 4. Patch 작업 종류 (Operation)

| Operation | 의미 |
|-----------|------|
| **Scan** | 점검만, 실제 적용 X (컴플라이언스만) |
| **Install** | 점검 + 적용 |
| **InstallRollback** (Windows) | 적용 + 실패 시 롤백 |

#### Reboot 옵션
- **RebootIfNeeded** (기본): 패치가 재부팅 필요하다고 명시한 경우만
- **NoReboot**: 절대 재부팅 X (다음 점검에서 적용 안 됨으로 표시될 수 있음)

### 5. Patch Manager + Maintenance Window 통합

#### 표준 패턴

```
1. Patch Baseline 생성 (Linux/Windows 별)
2. Patch Group으로 인스턴스 분류 (태그)
3. Maintenance Window 생성 (cron 스케줄)
4. Window Target에 태그 등록
5. Window Task로 AWS-RunPatchBaseline 등록
6. Concurrency / Error tolerance 설정
```

#### Patch Policy (신규 기능)
- Quick Setup의 새 방식
- 한 번에 멀티 계정·리전에 패치 정책 일괄 배포
- Maintenance Window 자동 생성

### 6. Patch Compliance

#### 보고 데이터
- **InstalledOtherCount**: 베이스라인과 무관한 패치 설치됨
- **InstalledPendingRebootCount**: 적용됐지만 재부팅 대기
- **InstalledRejectedCount**: 거부 목록에 있는데 설치됨
- **MissingCount**: 베이스라인 승인됐는데 미설치
- **FailedCount**: 설치 실패
- **NotApplicableCount**: 이 OS에 안 맞음

#### 컴플라이언스 점수
- MissingCount > 0 → NON_COMPLIANT
- 콘솔에서 `% Compliant` 대시보드

### 7. 트러블슈팅 패턴

#### 패치가 적용 안 됨
1. Instance가 Managed Instance인가 (PingStatus Online?)
2. IAM Role에 `AmazonSSMManagedInstanceCore`
3. Patch Group 태그 정확한가
4. 베이스라인에 대상 패치 승인 규칙 있는가
5. Maintenance Window Cutoff 시간 안 됐는지

#### 재부팅이 안 됨
- `RebootOption: NoReboot` 설정 확인
- Window Duration 초과

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Multi-OS Baseline** | 한 인스턴스 그룹에 OS별 별도 베이스라인 자동 매핑 | OS 혼재 환경 |
| **Per-Account Default** | 계정당 OS별 1개 default baseline 지정 가능 | 자동 fallback |
| **CVE 기반 패치 점검** | Inspector와 통합 | Week 9 |
| **Pre/Post Hooks** | 패치 전후 스크립트 실행 | 서비스 중단·복원 |
| **Scan + Install 분리** | 먼저 Scan으로 영향 파악 후 Install | 안전 운영 |

> ⚠️ **함정 1**: Patch Group은 인스턴스 태그 **이름이 정확히 `Patch Group`** (공백 포함). 다른 이름은 인식 X.
>
> ⚠️ **함정 2**: AWS 기본 베이스라인은 Security/Critical만 — Important는 미포함. 풀 패치 원하면 Custom Baseline.
>
> 💡 **암기 팁**: Baseline(정책) → Patch Group(대상 분류) → Maintenance Window(언제·어떻게) → Compliance(결과).

### 관련 서비스 Cross-Reference

- **Patch Manager → Week 5 Day 2** (Maintenance Window)
- **Patch Manager → Week 9 Inspector** (CVE 점검과 연계)
- **Patch Manager → Week 7** (Golden AMI에 미리 패치 포함)
- **Patch Manager → Week 12** (시험 시나리오 빈출)

---

## 🏗️ 아키텍처 다이어그램

```
Patch Manager 표준 운영 흐름
==========================================================

   [패치 베이스라인 (정책)]
       Dev:    모든 패치, 0일 대기
       Stage:  Security/Critical/Important, 3일 대기
       Prod:   Security/Critical, 14일 대기
              │
              ▼ (Patch Group 태그로 매핑)
   [Patch Group 분류]
       tag:Patch Group=dev
       tag:Patch Group=stage
       tag:Patch Group=prod-web
              │
              ▼
   [Maintenance Window]
       Dev:    매일 새벽
       Stage:  매주 화요일
       Prod:   매주 일요일 02:00
              │
              ▼
   ┌──────────────────────────────┐
   │  AWS-RunPatchBaseline 실행   │
   │  - Scan → Install            │
   │  - Concurrency 10%           │
   │  - Error tolerance 5%        │
   └──────────────────────────────┘
              │
              ▼
   [Compliance 대시보드]
       Missing / Failed / NotApplicable
              │
              ▼
   [실패 시 OpsCenter OpsItem 자동 생성]
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Patch Group 태그 이름은 정확히 "Patch Group"** (공백 포함) — 시험 함정
2. ⭐ **AWS 기본 베이스라인 = Security + Critical만** — Important 포함하려면 Custom
3. ⭐ **Scan vs Install** — Scan은 점검만, 실제 변경 X. 사전 영향 파악에 활용
4. ⭐ **Dev → Stage → Prod 순으로 점진 적용** — Approve After Days 활용
5. ⭐ **Patch Manager + Maintenance Window가 표준 조합** — 안전·자동·컴플라이언트

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Custom Patch Baseline (Prod용 - 보수적)
aws ssm create-patch-baseline \
  --name "Prod-Linux-Baseline" \
  --operating-system "AMAZON_LINUX_2" \
  --description "Conservative baseline for production" \
  --approval-rules '{
    "PatchRules":[
      {
        "PatchFilterGroup":{
          "PatchFilters":[
            {"Key":"CLASSIFICATION","Values":["Security"]},
            {"Key":"SEVERITY","Values":["Critical","Important"]}
          ]
        },
        "ApproveAfterDays": 14,
        "ComplianceLevel": "CRITICAL",
        "EnableNonSecurity": false
      }
    ]
  }' \
  --approved-patches-compliance-level "CRITICAL"

# 2. Patch Group으로 베이스라인 등록
aws ssm register-patch-baseline-for-patch-group \
  --baseline-id "pb-abc123" \
  --patch-group "prod-web"

# 3. 인스턴스에 Patch Group 태그 부여
aws ec2 create-tags \
  --resources i-0123 i-0456 i-0789 \
  --tags 'Key="Patch Group",Value=prod-web'

# 4. Maintenance Window + Patch Task
WINDOW_ID=$(aws ssm create-maintenance-window \
  --name "ProdWebWeeklyPatch" \
  --schedule "cron(0 2 ? * SUN *)" \
  --duration 4 \
  --cutoff 1 \
  --query 'WindowId' --output text)

TARGET_ID=$(aws ssm register-target-with-maintenance-window \
  --window-id $WINDOW_ID \
  --resource-type INSTANCE \
  --targets 'Key=tag:Patch Group,Values=prod-web' \
  --query 'WindowTargetId' --output text)

aws ssm register-task-with-maintenance-window \
  --window-id $WINDOW_ID \
  --task-arn "AWS-RunPatchBaseline" \
  --task-type RUN_COMMAND \
  --targets "Key=WindowTargetIds,Values=$TARGET_ID" \
  --service-role-arn "arn:aws:iam::123:role/AWSServiceRoleForMW" \
  --max-concurrency "10%" \
  --max-errors "5%" \
  --priority 1 \
  --task-invocation-parameters '{
    "RunCommand": {
      "Parameters": {
        "Operation":["Install"],
        "RebootOption":["RebootIfNeeded"]
      },
      "OutputS3BucketName":"patch-log-bucket",
      "OutputS3KeyPrefix":"prod-web"
    }
  }'

# 5. 즉시 Scan 실행 (점검만)
aws ssm send-command \
  --document-name "AWS-RunPatchBaseline" \
  --parameters 'Operation=Scan' \
  --targets "Key=tag:Patch Group,Values=prod-web" \
  --max-concurrency "20%"

# 6. Patch Compliance 조회
aws ssm describe-instance-patch-states \
  --instance-ids i-0123 \
  --query 'InstancePatchStates[*].[InstanceId,PatchGroup,InstalledCount,MissingCount,FailedCount,NotApplicableCount]'

aws ssm list-compliance-items \
  --resource-ids i-0123 \
  --filters Key=ComplianceType,Values=Patch \
            Key=Status,Values=NON_COMPLIANT
```

---

## 📝 연습 문제

**문제 1.** Patch Group 태그가 설정됐는데 인스턴스에 패치가 적용 안 된다. 가장 흔한 원인은?

A) IAM 권한
B) 태그 이름이 "PatchGroup" (공백 없이) - 정확한 이름은 "Patch Group" (공백 포함)
C) AMI 종류
D) Region

**정답: B**
해설: 시험 빈출 함정. SSM은 정확히 `Patch Group`(공백 포함) 태그 이름만 인식. 카멜케이스나 언더스코어는 무시.

---

**문제 2.** AWS 기본 베이스라인의 한계는?

A) 모든 패치 자동 승인 — 불안정
B) Security + Critical만 자동 승인, Important/Moderate는 제외
C) 너무 빠른 적용
D) Linux 미지원

**정답: B**
해설: 기본 베이스라인은 보안 중심. Important 분류 패치도 풀 적용하려면 Custom Baseline에 추가.

---

**문제 3.** 회사가 운영 환경에 패치를 적용하기 전에 영향을 확인하고 싶다. 어떻게?

A) Install 그냥 실행
B) `AWS-RunPatchBaseline`의 Operation=Scan으로 먼저 점검 → 누락된 패치 목록 확인 후 Install
C) 수동 검증
D) Inspector

**정답: B**
해설: Scan은 적용 없이 점검만. 어떤 패치가 누락됐는지 확인 후 결정. 다음 Maintenance Window에서 Install.

---

**문제 4.** Dev → Stage → Prod로 점진적 패치 적용을 자동화하려 한다. 어떤 설정?

A) 같은 베이스라인 사용
B) Patch Group별 베이스라인 + `ApproveAfterDays` 차이 (Dev 0일, Stage 3일, Prod 14일)
C) Maintenance Window만 다르게
D) IAM Role 다르게

**정답: B**
해설: ApproveAfterDays로 같은 패치가 환경별 다른 시점에 자동 승인. Dev에서 먼저 검증되고 Prod로 흘러감.

---

**문제 5.** 패치 적용 후 인스턴스가 재부팅돼서 서비스 중단이 일어났다. 다음 패치엔 어떻게?

A) Patch Manager 비활성
B) Pre/Post Hook으로 ELB 등록 해제 → 패치 → 헬스체크 → 재등록 시퀀스 구성 또는 Auto Scaling Rolling 활용
C) NoReboot 옵션
D) 수동 패치

**정답: B**
해설: 무중단 패치는 ALB target group에서 인스턴스 deregister → 패치 → register 시퀀스. SSM Automation Runbook으로 구성. NoReboot은 패치 미완료 위험.

---

## 📌 오늘의 요약

1. Patch Baseline: 어떤 패치를 언제 자동 승인할지 규칙. AWS 기본 + Custom
2. Patch Group 태그(정확히 "Patch Group", 공백 포함)로 인스턴스→베이스라인 매핑
3. Operation: Scan(점검만) vs Install(점검+적용). Reboot 옵션 신중히
4. Dev/Stage/Prod 점진 적용은 ApproveAfterDays 차이로 구현
5. Maintenance Window + Patch Manager = 표준 자동 운영 조합
