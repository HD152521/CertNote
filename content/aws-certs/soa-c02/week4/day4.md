# Day 4 - Audit Manager, License Manager, Resource Explorer

📅 날짜: Week 4 (Day 4)
🎯 주제: 감사 자동화·라이선스 관리·리소스 검색
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- AWS Audit Manager로 컴플라이언스 증거 수집을 자동화한다
- License Manager로 BYOL 라이선스를 추적·강제한다
- Resource Explorer/Tag Editor로 멀티 계정 리소스를 검색한다

---

## 🧩 사전 지식 (CS 기초)

- **Evidence collection (감사 증거)**: 컴플라이언스 입증을 위한 자동 수집된 증거
- **BYOL (Bring Your Own License)**: 자사 라이선스를 클라우드로 옮기는 모델
- **License compliance**: 라이선스 위반 시 벌금. 자동 추적 필수
- **Resource inventory**: 운영 중인 모든 리소스 카탈로그. CMDB와 유사
- **Tag-based search**: 태그를 활용한 리소스 그룹핑·필터링

---

## 📖 이론 내용

### 1. AWS Audit Manager

#### 개념
- AWS 환경의 컴플라이언스 증거를 **자동 수집·정리**해 감사 보고서 작성
- CloudTrail, Config, Security Hub 등에서 데이터 자동 수집
- "외부 감사관에게 제출할 PDF/CSV 보고서"를 한 번에 생성

#### 핵심 구성 요소

| 요소 | 의미 |
|------|------|
| **Framework** | 컴플라이언스 표준 (HIPAA, PCI-DSS, SOC 2 등) |
| **Control** | Framework 내 개별 통제 항목 (예: "MFA 강제") |
| **Data Source** | 증거의 출처 (AWS API, Manual, CloudTrail) |
| **Assessment** | Framework 기반 평가 작업 (수일~수주) |
| **Evidence** | 자동 수집된 증거 (스크린샷, JSON, 로그 발췌) |

#### 사용 흐름
1. Framework 선택 (사전 제공 또는 custom)
2. Assessment 생성 (대상 AWS 계정/리전 지정)
3. Audit Manager가 자동 증거 수집
4. 감사관이 콘솔에서 검토
5. PDF/CSV로 보고서 export

#### 사전 제공 Framework
- HIPAA, PCI-DSS, SOC 2, ISO 27001, NIST 800-53/CSF
- AWS Foundational Security Best Practices
- AWS Operational Best Practices
- GDPR, FedRAMP

#### 자동 수집 vs 수동 증거
- **Automated**: Config Rule 결과, CloudTrail 이벤트, Security Hub finding
- **Manual**: 인터뷰 기록, 정책 문서 등 (콘솔에 업로드)

### 2. AWS License Manager

#### 개념
- 자사 보유 라이선스(Microsoft, Oracle, SAP 등)를 AWS에서 추적·강제
- 라이선스 초과 사용 시 EC2 시작 차단 또는 알림

#### 사용 시나리오
- Windows Server BYOL — Windows 라이선스 수 모니터링
- Oracle DB — vCPU 제한
- SAP NetWeaver
- 자사 SaaS 라이선스 추적

#### License Configuration
- 라이선스 종류 + 카운팅 단위 + 강제 정책

```json
{
  "Name": "Windows Server 2022 Datacenter",
  "LicenseCountingType": "Core",
  "LicenseCount": 100,
  "LicenseCountHardLimit": true,
  "LicenseRules": [
    "#allowedTenancy=EC2-DedicatedHost"
  ]
}
```

- `LicenseCountHardLimit: true` → 초과 시 시작 차단
- `false` → 초과 알림만

#### 통합 서비스
- EC2, RDS, Systems Manager, Service Catalog, AWS Organizations
- AMI에 License Configuration 연결 → 자동 추적

### 3. AWS Resource Explorer

#### 개념
- 멀티 리전·멀티 계정의 AWS 리소스를 **인덱스 기반 검색**
- 검색 결과: 리소스 ARN, 이름, 태그, 리전, 서비스

#### 활성화
1. View 생성 (한 리전을 "집계 인덱스"로 지정)
2. 다른 리전의 인덱스를 "Local index"로 → "Aggregator index"로 데이터 전송
3. 검색 시 모든 리전 결과 한 번에

#### 검색 문법
```
service:ec2 tag.Environment=prod
region:ap-northeast-2 service:lambda
type:ec2:instance state:running
```

### 4. Tag Editor + Resource Groups

#### Tag Editor
- 여러 리소스에 일괄 태그 적용/수정
- 멀티 리전 지원
- "잘못된 태그" 점검 + 수정에 유용

#### Resource Groups
- 태그 기반 동적 리소스 그룹
- SSM Run Command, Patch Manager에서 그룹 단위로 실행
- 그룹별 비용 분석 가능

### 5. AWS Systems Manager Quick Setup

#### 개념
- Config, SSM Agent, CloudWatch Agent, Inspector 등을 한 번에 활성화
- 멀티 계정·멀티 리전 Bulk 설정

#### Configuration Types
- **AWS Config Recording**
- **Default Host Management Configuration**
- **Resource Scheduler**
- **Patch Manager**

### 6. AWS Trusted Advisor (Week 11에서 자세히)

- 5개 카테고리 자동 점검
  - Cost Optimization
  - Security
  - Fault Tolerance
  - Performance
  - Service Limits
- Business/Enterprise Support 플랜에서만 full check

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Audit Manager + Security Hub** | Security Hub finding이 Audit Manager 증거로 자동 등록 | 통합 컴플라이언스 |
| **License Manager Cross-Account** | Organizations 멤버 계정 라이선스 추적 | 멀티 계정 BYOL |
| **Resource Groups in IaC** | CloudFormation으로 동적 그룹 정의 | 자동화 |
| **AWS Service Quotas** | 서비스별 한도 통합 관리 | 운영 가시화 |
| **AWS Health Dashboard** | AWS 서비스 장애·예정 변경 알림 | 운영 사전 대응 |

> ⚠️ **함정 1**: Audit Manager는 PCI-DSS/HIPAA를 "AWS가 대신 컴플라이언트하게 만들어주지 않음" — 증거 수집·정리 도구. 실제 통제는 고객 책임.
>
> ⚠️ **함정 2**: License Manager의 Hard Limit은 초과 시 EC2 시작 자체를 막음 — 운영 충격 주의.
>
> 💡 **암기 팁**: Audit Manager(자동 보고서) ≠ Config(자동 평가) ≠ Trusted Advisor(권고).

### 관련 서비스 Cross-Reference

- **Audit Manager → Week 4 Day 3** (Config 결과를 증거로 활용)
- **License Manager → Week 7** (Image Builder + AMI 추적)
- **Resource Explorer → Week 5 SSM Inventory** (보완)
- **Health Dashboard → Week 12 운영 통합**

---

## 🏗️ 아키텍처 다이어그램

```
컴플라이언스 자동화 풀스택
==========================================================

   [AWS 환경의 모든 활동·상태]
            │
            ├─→ CloudTrail (행위 로그)
            ├─→ Config      (상태 + Rule 평가)
            ├─→ Security Hub (보안 finding)
            ├─→ Inspector   (취약점)
            └─→ GuardDuty   (위협)
                    │
                    ▼
            ┌──────────────────┐
            │  Audit Manager   │
            │  - 증거 자동 수집 │
            │  - Framework 매핑│
            │  - 보고서 export │
            └──────────────────┘
                    │
                    ▼
            ┌──────────────────┐
            │  외부 감사관     │
            │  (PDF/CSV 보고서)│
            └──────────────────┘
```

```
멀티 계정 라이선스·리소스 가시화
==========================================================

   [수십 개 AWS 계정]
        │
        ▼
   ┌──────────────────────┐
   │ License Manager      │ ← 라이선스 카운팅
   │ Resource Explorer    │ ← 리소스 검색
   │ Tag Editor           │ ← 태그 표준화
   │ Resource Groups      │ ← 그룹핑
   └──────────────────────┘
        │
        ▼
   [운영팀] [컴플라이언스팀]
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Audit Manager는 증거 수집 자동화** — Framework 선택 + Assessment → PDF/CSV 보고서
2. ⭐ **License Manager Hard Limit = 라이선스 초과 시 EC2 시작 차단**
3. ⭐ **Resource Explorer = 멀티 리전 리소스 검색** — Tag Editor와 함께 사용
4. ⭐ **Resource Groups = 태그 기반 그룹** — SSM Run Command 대상으로 활용
5. ⭐ **Audit Manager ≠ Config** — Audit는 보고서 자동화, Config는 평가 자체

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Audit Manager Assessment 생성
aws auditmanager create-assessment \
  --name "Q2-2026-PCI-DSS-Assessment" \
  --framework-id "abcd-pci-dss-framework" \
  --assessment-reports-destination 'destinationType=S3,destination=s3://my-audit-reports' \
  --roles 'roleType=PROCESS_OWNER,roleArn=arn:aws:iam::123:role/AuditOwner' \
  --scope 'awsAccounts=[{id=111122223333,name=Prod}],awsServices=[{serviceName=ec2},{serviceName=s3}]'

# 2. License Manager Configuration 생성 (Windows BYOL)
aws license-manager create-license-configuration \
  --name "Windows-2022-Datacenter" \
  --license-counting-type Core \
  --license-count 100 \
  --license-count-hard-limit \
  --license-rules "#allowedTenancy=EC2-DedicatedHost"

# 3. AMI에 License Configuration 연결
aws license-manager update-license-specifications-for-resource \
  --resource-arn arn:aws:ec2:ap-northeast-2:123:image/ami-abc \
  --add-license-specifications "LicenseConfigurationArn=arn:aws:license-manager:ap-northeast-2:123:license-configuration:lic-abc"

# 4. Resource Explorer View 생성 + 검색
aws resource-explorer-2 create-view \
  --view-name "org-view" \
  --included-property '{"Name":"tags"}'

aws resource-explorer-2 search \
  --view-arn "arn:aws:resource-explorer-2:ap-northeast-2:123:view/org-view/abc" \
  --query-string "service:ec2 tag.Environment=prod state:running"

# 5. Tag Editor - 여러 리소스에 일괄 태그
aws resourcegroupstaggingapi tag-resources \
  --resource-arn-list \
    "arn:aws:ec2:ap-northeast-2:123:instance/i-abc" \
    "arn:aws:ec2:ap-northeast-2:123:instance/i-xyz" \
    "arn:aws:s3:::my-bucket" \
  --tags Environment=prod,Project=payment,Owner=team-ops

# 6. Resource Group 생성 (태그 기반)
aws resource-groups create-group \
  --name "prod-payment-resources" \
  --resource-query '{
    "Type": "TAG_FILTERS_1_0",
    "Query": "{\"ResourceTypeFilters\":[\"AWS::AllSupported\"],\"TagFilters\":[{\"Key\":\"Environment\",\"Values\":[\"prod\"]},{\"Key\":\"Project\",\"Values\":[\"payment\"]}]}"
  }'

# 7. AWS Health Dashboard 이벤트 조회
aws health describe-events \
  --filter "regions=ap-northeast-2,eventStatusCodes=open,upcoming"
```

---

## 📝 연습 문제

**문제 1.** 회사가 외부 PCI-DSS 감사를 받는다. 증거 수집을 자동화하려면?

A) CloudTrail만 활성화
B) Audit Manager + 사전 제공 PCI-DSS Framework로 Assessment 생성 → 증거 자동 수집
C) S3에 수동 백업
D) Config Rule만

**정답: B**
해설: Audit Manager의 정확한 사용 사례. PCI-DSS Framework 선택하면 Audit Manager가 Config/CloudTrail/Security Hub에서 자동 증거 수집 → 감사관 제출용 PDF/CSV 보고서.

---

**문제 2.** 회사가 Microsoft Windows Server BYOL 라이선스 100코어 한도를 초과하지 않도록 강제하려 한다. 어떤 도구?

A) Service Quotas
B) License Manager - Hard Limit 활성화 (초과 시 EC2 시작 차단)
C) Config Rule
D) Trusted Advisor

**정답: B**
해설: License Manager는 BYOL 추적 + 강제. Hard Limit이 켜져 있으면 라이선스 초과 시 EC2 RunInstances 자체를 차단. AMI에 License Configuration 연결.

---

**문제 3.** 회사가 모든 계정에서 `Environment=prod` 태그가 붙은 EC2 인스턴스를 찾고 싶다. 가장 빠른 방법은?

A) 각 계정에서 ec2 describe-instances
B) Resource Explorer로 통합 검색 (`service:ec2 tag.Environment=prod`)
C) CloudWatch
D) Logs Insights

**정답: B**
해설: Resource Explorer는 멀티 리전·멀티 계정 리소스 검색에 최적. 인덱스 활성화 후 한 번의 쿼리로 결과.

---

**문제 4.** Audit Manager가 자동으로 수집 못하는 증거는?

A) Config Rule 결과
B) CloudTrail API 호출
C) Security Hub finding
D) 종이로 된 정책 문서 — 수동 업로드 필요

**정답: D**
해설: Audit Manager는 AWS API 호출 결과만 자동 수집. 종이 문서, 인터뷰 기록, 외부 시스템 데이터는 수동으로 콘솔에 업로드해야 함.

---

**문제 5.** 회사가 100대 EC2 인스턴스에 SSM Run Command로 패치를 동시 적용하려 한다. 그룹핑 방법은?

A) 인스턴스 ID를 일일이 나열
B) Resource Group을 태그 기반으로 만들고, SSM 대상에 Resource Group 지정
C) CloudFormation
D) Auto Scaling Group

**정답: B**
해설: Resource Groups는 태그 기반 동적 그룹. SSM Run Command/State Manager/Patch Manager의 대상으로 직접 지정 가능. Tag만 맞으면 자동 포함.

---

## 📌 오늘의 요약

1. Audit Manager: 컴플라이언스 증거 자동 수집·정리. Framework 선택 → Assessment → 보고서 export
2. License Manager: BYOL 라이선스 추적·강제. Hard Limit으로 초과 시 EC2 시작 차단
3. Resource Explorer: 멀티 리전·계정 리소스 통합 검색. Aggregator index 필요
4. Tag Editor + Resource Groups: 일괄 태그 적용 + 태그 기반 그룹핑 → SSM 대상으로 활용
5. AWS Health Dashboard: AWS 측 장애·예정 변경 사전 알림 — 운영 사전 대응
