# Day 3 - IAM Access Analyzer, Trusted Advisor 보안 체크

📅 날짜: Week 9 (Day 3)
🎯 주제: 의도치 않은 접근 탐지 + AWS 자동 권장사항
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- IAM Access Analyzer로 외부 공유와 미사용 권한을 발견한다
- IAM Policy Validation·Generation 기능을 활용한다
- Trusted Advisor의 5대 카테고리 자동 점검을 이해한다

---

## 🧩 사전 지식 (CS 기초)

- **Least privilege**: 최소 권한 원칙
- **Unintended access**: 의도치 않은 외부 노출
- **Static analysis**: 코드/정책을 실행 없이 분석
- **Drift detection**: 실제 사용 패턴과 정책 격차
- **Best practices**: 업계 모범 사례 자동 점검

---

## 📖 이론 내용

### 1. IAM Access Analyzer

#### 4가지 주요 기능

| 기능 | 설명 |
|------|------|
| **External access analysis** | 외부 공유 자동 탐지 |
| **Unused access analysis** | 미사용 IAM 객체·권한 발견 |
| **Policy generation** | CloudTrail 기반 정책 자동 생성 |
| **Policy validation** | 정책 작성 시 정적 검증 |

### 2. External Access Analyzer

#### 대상 리소스
- S3 Bucket
- IAM Role
- KMS Key
- Lambda Function (Resource Policy)
- SQS Queue
- Secrets Manager Secret
- EBS Snapshot
- RDS Snapshot
- ECR Repository
- EFS

#### Zone of Trust
- 분석 범위 정의: 계정 또는 Organization
- Zone 외부의 접근만 finding으로 보고
- 같은 계정 내 접근은 무시 (정상)

#### Finding 예시
```
S3 Bucket: my-backup-bucket
   → 외부 AWS 계정 999988887777에 GetObject 허용 (의도치 않음?)

IAM Role: ExternalIntegrationRole
   → 다른 AWS 계정의 임의 사용자가 AssumeRole 가능

KMS Key: alias/secrets
   → External SAML IdP에 Decrypt 권한
```

#### 자동화
- Finding 발생 → EventBridge → SNS/Lambda → 즉시 알림 또는 차단

### 3. Unused Access Analyzer

#### 발견 항목
- **Unused IAM users**: 활동 없는 사용자
- **Unused IAM roles**: 마지막 사용 90일 이상
- **Unused permissions**: 사용 안 한 API 권한
- **Unused access keys**: 미사용 Access Key

#### 활용
- 정기 점검 (월/분기)
- 보안 reductio → 최소 권한 원칙 강화

### 4. Policy Generation

#### 동작
- CloudTrail 이벤트(과거 90일)에서 실제 사용된 API 추출
- 그 권한만 포함한 정책 자동 생성

#### 사용 흐름
1. Generation 시작 (Role 지정)
2. Access Analyzer가 CloudTrail 스캔
3. 사용된 API 목록 + Resource ARN 분석
4. JSON 정책 생성 (Action + Resource + Condition)
5. 검토 후 적용

→ "처음엔 `*` 허용 → 운영 후 실제 사용 패턴으로 축소"의 자동화

### 5. Policy Validation

#### IAM Policy Checks
- 정책 작성 시 정적 분석
- 100+ 종류의 검사:
  - **Security warnings**: 보안 위험
  - **Errors**: 문법 오류
  - **Suggestions**: 개선 권장

#### Custom Policy Checks (유료)
- 회사 표준 정책 위반 검증
- "절대 `s3:*` 허용 금지" 등 정책 가드레일

### 6. AWS Trusted Advisor

#### 5대 카테고리

| 카테고리 | 점검 예시 |
|----------|-----------|
| **Cost Optimization** | 미사용 EBS, 활동 없는 EC2, RI 미활용 |
| **Performance** | 과부하 EBS, 과부하 EC2, CloudFront 미활용 |
| **Security** | MFA 없는 Root, 공개 S3, 0.0.0.0/0 SG |
| **Fault Tolerance** | Multi-AZ 없음, RDS 백업 OFF, 단일 AZ |
| **Service Limits** | 한도의 80% 도달 |

#### Support 플랜별 접근

| 플랜 | 접근 가능 |
|------|-----------|
| Basic/Developer | 7개 핵심 보안 + 서비스 한도 |
| Business/Enterprise | 모든 체크 (100+) |

#### 자동화
- Trusted Advisor → EventBridge → Lambda/SNS
- 또는 Trusted Advisor Refresh API로 정기 fetch

### 7. AWS Health Dashboard

- AWS 서비스 장애·예정 변경 알림
- 계정별 영향 받는 리소스 (Personal Health Dashboard)
- EventBridge 통합

#### 자주 보는 이벤트
- 인스턴스 retirement 예정 (호스트 하드웨어 교체)
- EBS 볼륨 성능 저하
- 계정 단위 이슈

### 8. AWS Artifact

- 컴플라이언스 문서 다운로드 (SOC, PCI 보고서 등)
- 감사관에게 제공
- 무료

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Access Analyzer Multi-Account** | Organizations 통합 — 모든 계정 통합 분석 | 멀티 계정 거버넌스 |
| **Trusted Advisor API** | 프로그래밍 조회 가능 | 자동 점검 |
| **AWS Config + Security Hub** | 자동 컴플라이언스 평가 | Day 4에서 |
| **CloudTrail + Access Analyzer** | 정책 생성에 90일 데이터 활용 | CloudTrail 활성화 필요 |

> ⚠️ **함정 1**: External Access Analyzer는 Zone of Trust 외부만 분석. 같은 계정 내는 무시.
>
> ⚠️ **함정 2**: Trusted Advisor 핵심 보안 7개만 무료, 나머지는 Business 이상.
>
> 💡 **암기 팁**: Access Analyzer(외부 노출 + 미사용) ↔ Trusted Advisor(5대 자동 점검) ↔ Health Dashboard(AWS 측 이슈).

### 관련 서비스 Cross-Reference

- **Access Analyzer → Week 1 IAM** (정책 관리)
- **Access Analyzer → Week 4 CloudTrail** (정책 생성 소스)
- **Trusted Advisor → Week 11 비용** (비용 최적화 권장)
- **Health Dashboard → Week 3 알람** (예정 변경 사전 대응)

---

## 🏗️ 아키텍처 다이어그램

```
IAM Access Analyzer 통합 운영
==========================================================

   [Analyzer 활성화]
   Zone of Trust = Organization
       │
       ▼
   ┌─────────────────────────────┐
   │  지속 분석                   │
   │  - S3 / IAM Role / KMS 등   │
   │  - 외부 공유 자동 탐지       │
   └─────┬───────────────────────┘
         │
         ▼ Finding 발견
   ┌─────────────────────────────┐
   │  EventBridge Rule            │
   │  source: aws.access-analyzer │
   └─────┬───────────────────────┘
         │
         ├─→ SNS (보안팀 알림)
         ├─→ Security Hub (통합 finding)
         └─→ Lambda (자동 차단)


   [Policy Generation]
   IAM Role → CloudTrail (90일) → 실제 사용 API 분석
                                  → 자동 정책 생성 → 검토 → 적용
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Access Analyzer = 외부 공유 자동 탐지** (Zone of Trust 외부)
2. ⭐ **Policy Generation = CloudTrail 기반 자동 정책** (90일 활동 분석)
3. ⭐ **Unused Access Analyzer = 미사용 권한·Role·Key 발견** — 최소 권한 강화
4. ⭐ **Trusted Advisor 5대 카테고리** — Cost/Performance/Security/Fault Tolerance/Limits
5. ⭐ **무료는 7개 보안 + 서비스 한도만** — Business 이상에서 전체

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. IAM Access Analyzer 활성화
aws accessanalyzer create-analyzer \
  --analyzer-name "org-analyzer" \
  --type ORGANIZATION

# 2. External Findings 조회
aws accessanalyzer list-findings \
  --analyzer-arn arn:aws:access-analyzer:ap-northeast-2:123:analyzer/org-analyzer \
  --filter '{"status":{"eq":["ACTIVE"]}}' \
  --query 'findings[*].[resource,resourceType,principal,action]' \
  --output table

# 3. Policy Generation 시작
JOB_ID=$(aws accessanalyzer start-policy-generation \
  --policy-generation-details '{"principalArn":"arn:aws:iam::123:role/MyExistingRole"}' \
  --cloud-trail-details '{
    "trails":[{"cloudTrailArn":"arn:aws:cloudtrail:ap-northeast-2:123:trail/org-trail","regions":["ap-northeast-2"]}],
    "accessRole":"arn:aws:iam::123:role/AccessAnalyzerCloudTrailAccess",
    "startTime":"2026-02-22T00:00:00Z"
  }' \
  --query 'jobId' --output text)

# 결과 (생성 완료 후)
aws accessanalyzer get-generated-policy \
  --job-id $JOB_ID

# 4. Validate Policy
cat > my-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "*",
    "Resource": "*"
  }]
}
EOF

aws accessanalyzer validate-policy \
  --policy-document file://my-policy.json \
  --policy-type IDENTITY_POLICY

# 5. EventBridge로 Finding 알림 자동화
aws events put-rule \
  --name "AccessAnalyzerFinding" \
  --event-pattern '{
    "source":["aws.access-analyzer"],
    "detail-type":["Access Analyzer Finding"]
  }'

aws events put-targets \
  --rule AccessAnalyzerFinding \
  --targets "Id=1,Arn=arn:aws:sns:ap-northeast-2:123:security-alerts"

# 6. Trusted Advisor 체크 조회 (Business+ 플랜 필요)
aws support describe-trusted-advisor-checks --language en

aws support describe-trusted-advisor-check-result \
  --check-id "Pfx0RwqBli" \
  --query 'result.flaggedResources'

# Refresh 실행 (최신 상태로)
aws support refresh-trusted-advisor-check --check-id "Pfx0RwqBli"

# 7. AWS Health 이벤트 조회
aws health describe-events \
  --filter "regions=ap-northeast-2,eventStatusCodes=open,upcoming"

aws health describe-affected-entities \
  --filter "eventArns=arn:aws:health:ap-northeast-2::event/EC2/AWS_EC2_INSTANCE_RETIREMENT_SCHEDULED/abc"

# 8. Unused Access Analyzer (별도 Analyzer)
aws accessanalyzer create-analyzer \
  --analyzer-name "unused-access" \
  --type ACCOUNT_UNUSED_ACCESS \
  --configuration '{"unusedAccess":{"unusedAccessAge":90}}'
```

---

## 📝 연습 문제

**문제 1.** 회사가 S3 버킷이 의도치 않게 외부 계정에 공유됐는지 자동 감지하려 한다. 어떤 도구?

A) GuardDuty
B) IAM Access Analyzer (External Access)
C) Trusted Advisor
D) Config Rule

**정답: B**
해설: Access Analyzer의 정확한 사용 사례. Zone of Trust 외부의 접근 자동 탐지. S3·IAM Role·KMS·Lambda·SQS·Secrets Manager 등 광범위 지원. EventBridge로 알림 자동화.

---

**문제 2.** 처음 만든 IAM Role에 `*` 권한 주고 운영 중이다. 실제 사용 패턴에 맞게 최소 권한 정책으로 줄이려면?

A) 수동으로 API 호출 추적
B) Access Analyzer Policy Generation - CloudTrail 90일 분석 → 사용 API만 포함한 정책 자동 생성
C) Inspector
D) Trusted Advisor

**정답: B**
해설: Policy Generation의 정확한 사용 사례. CloudTrail에서 실제 사용된 API만 포함한 정책 JSON 자동 생성. 검토 후 기존 정책 교체.

---

**문제 3.** Trusted Advisor에서 모든 100+ 체크에 접근하려면?

A) 무료 계정
B) Business 또는 Enterprise Support 플랜
C) Free Tier
D) AWS Activate

**정답: B**
해설: 7개 핵심 보안 + 서비스 한도만 무료. 전체 체크는 Business($100/월) 이상에서.

---

**문제 4.** EC2 인스턴스가 곧 retirement(호스트 교체)된다는 알림을 받고 싶다. 어떤 도구?

A) Trusted Advisor
B) AWS Health Dashboard + EventBridge (Personal Health 이벤트)
C) GuardDuty
D) CloudTrail

**정답: B**
해설: AWS 측의 예정 변경(인프라 교체, 서비스 deprecation 등)은 Health Dashboard. EventBridge로 자동 알림.

---

**문제 5.** 회사가 외부 감사를 위해 SOC 2 / PCI 컴플라이언스 보고서가 필요하다. 어디서 받나?

A) Audit Manager
B) AWS Artifact (무료 컴플라이언스 문서 다운로드)
C) Trusted Advisor
D) Inspector

**정답: B**
해설: AWS Artifact는 AWS의 SOC/PCI/HIPAA 등 컴플라이언스 보고서를 무료 제공. 자사 컴플라이언스 입증은 Audit Manager.

---

## 📌 오늘의 요약

1. IAM Access Analyzer: External Access 자동 탐지 + Unused 발견 + Policy Generation/Validation
2. Policy Generation = CloudTrail 90일 → 실제 사용 API → 최소 권한 정책 자동 생성
3. Trusted Advisor 5대: Cost/Performance/Security/Fault Tolerance/Service Limits
4. 무료는 7개 보안 + 한도만. 전체는 Business+ Support
5. AWS Health Dashboard로 AWS 측 이슈/예정 변경 사전 대응. Artifact로 컴플라이언스 보고서
