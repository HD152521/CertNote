# Day 1 - 멀티 계정 엔터프라이즈 CI/CD 케이스

📅 날짜: Week 15 (Day 1)
🎯 주제: 실제 운영되는 50+ 계정 환경의 CI/CD 설계
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Landing Zone + Account Factory로 자동 프로비저닝
- Tooling Account 중심 Hub-Spoke 멀티 계정 파이프라인
- 50+ 마이크로서비스를 위한 표준 파이프라인 템플릿
- 거버넌스 + 셀프서비스 균형

---

## 🧩 사전 지식 (CS 기초)

- **Inner Source**: 사내 OSS — 팀 간 코드 공유.
- **Platform Engineering**: 개발자 셀프서비스 플랫폼 제공.
- **Golden Path**: 권장 경로 — 표준 패턴.

---

## 📖 시나리오

**회사 프로필:**
- 50개 마이크로서비스
- 5개 환경 (sandbox, dev, staging, pre-prod, prod)
- 60+ AWS 계정
- 100명 개발자, 5명 플랫폼 엔지니어
- 규제 산업 (Fin/Health 일부)

### 1. 계정 구조

```
Root
├─ Security OU
│   ├─ Log Archive Account
│   ├─ Audit Account (Security Hub admin)
│   └─ Forensics Account
├─ Workloads OU
│   ├─ Dev OU
│   │   └─ {service}-dev accounts
│   ├─ Staging OU
│   ├─ PreProd OU
│   └─ Prod OU
│       ├─ {service}-prod accounts (regulated workloads isolated)
│       └─ Shared Services Prod
├─ Sandbox OU
│   └─ Developer playground accounts
├─ Tooling OU
│   └─ CICD Account
└─ Suspended OU
```

### 2. Landing Zone + Account Factory

- AWS Control Tower로 베이스라인
- AFT(Account Factory for Terraform)로 커스터마이징
- 새 서비스 = ServiceNow 요청 → AFT 파이프라인 → 5개 계정 자동 프로비저닝
- 각 계정에 표준: VPC, IAM Role, Config, CloudTrail, GuardDuty, Backup, KMS CMK

### 3. CI/CD 파이프라인 표준화

**Service Catalog Portfolio:**
- 표준 파이프라인 템플릿 (CDK Pipelines)
- 언어별 (Java/Python/Node/Go)
- 컨테이너/Lambda 유형별

개발자는 Service Catalog Product 선택 → 자기 서비스 파이프라인 자동 생성.

### 4. Tooling Account 중심

```
Tooling Account (CICD)
├─ CodePipeline x 50 (서비스별)
├─ CodeBuild
├─ ECR (모든 컨테이너 이미지)
├─ CodeArtifact Domain (모든 패키지)
├─ Artifact S3 + KMS Multi-Region Key
└─ Cross-Account Deploy Roles (Trust 관계 Spoke 계정으로)

각 Spoke (Workload Account)
├─ CrossAccountDeployRole
├─ CloudFormationExecutionRole (실제 리소스 생성)
└─ Application resources
```

### 5. 보안 통제

- SCP로 OU 수준 가드레일 (root 차단, prod region 제한 등)
- Service Control Policy + Permission Boundary 조합
- Tag 강제 (Config Rule + Auto-Remediation 삭제)
- GuardDuty + Security Hub + Config + Audit Manager (Audit OU에 집계)
- IAM Identity Center로 사람 SSO

### 6. 거버넌스 게이트

```
PR open
  └─ CodeGuru Reviewer + Snyk SAST
PR merged to main
  └─ CodeBuild test
Build artifact
  └─ Inspector scan + Signer
Deploy to dev (auto)
Deploy to staging (auto + smoke test)
Deploy to pre-prod (manual approval)
  └─ Change Calendar check (no freeze)
Deploy to prod
  └─ Canary (CodeDeploy/Lambda Alias)
  └─ Auto-rollback on alarms
```

### 7. 셀프서비스 + 거버넌스 균형

| 영역 | 셀프서비스 | 거버넌스 |
|------|-------------|----------|
| 새 계정 | AFT 자동 | SCP 자동 적용 |
| 새 파이프라인 | Service Catalog | 템플릿 검증 |
| 시크릿 추가 | Secrets Manager | KMS Policy 표준 |
| 새 IAM Role | OK | Permission Boundary 강제 |
| Direct Console Access | Read-only | Write는 Just-In-Time |

---

## 🧠 알아두면 좋은 심화 이론

### Permission Boundary

```json
{
  "Statement": [{
    "Effect": "Allow",
    "Action": "*",
    "Resource": "*",
    "Condition": {
      "StringEquals": {"aws:RequestedRegion": ["ap-northeast-2"]}
    }
  }]
}
```

개발자가 새 Role 만들 때 Boundary 강제 → 어떤 권한 부여해도 Boundary를 넘지 못함.

### CodePipeline V2 + Variables

다중 환경 + 동적 파라미터:
- 입력 변수 (Environment)
- 출력 변수 (BuildAction.VERSION)
- 트리거 필터 (filePaths)

### Cross-Account Observability

Monitoring Account가 모든 Workload Account의 CloudWatch/X-Ray 통합 조회. (Week 10 Day 1)

### 비용 가시화

- 모든 리소스 태그 강제 → Cost Allocation Tag
- Cost Explorer + Cost Categories로 팀/서비스별 분류
- Anomaly Detection으로 갑작스러운 비용 증가 알람

---

## 🏗️ 아키텍처 다이어그램

```
Enterprise Multi-Account CI/CD
==================================================

  Control Tower (Management Account)
        │
        ▼
  Landing Zone OUs
  ├─ Security: Log Archive, Audit, Forensics
  ├─ Tooling: CICD
  ├─ Workloads: Dev/Staging/PreProd/Prod
  └─ Sandbox

  Tooling Account
   ├─ CodePipeline (per service)
   ├─ CodeBuild
   ├─ ECR + CodeArtifact (shared)
   ├─ Artifact S3 + KMS Multi-Region
   └─ Service Catalog Portfolio (standard pipelines)

         │ Cross-Account AssumeRole
         ▼
  Workload Account (e.g., service-prod)
   ├─ CrossAccountDeployRole (trusts Tooling)
   ├─ CFN Execution Role
   └─ Application resources (ECS/Lambda/RDS/...)

  Security/Compliance (auto-deployed via StackSets)
   ├─ GuardDuty (Audit aggregator)
   ├─ Security Hub (Audit aggregator)
   ├─ Config (Audit aggregator)
   ├─ CloudTrail (Log Archive)
   └─ Backup (cross-region copy to DR region)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Landing Zone + AFT로 새 계정 자동 프로비저닝
2. ⭐ Tooling Account 중심 Hub-Spoke 표준
3. ⭐ Service Catalog로 파이프라인 셀프서비스 + 표준화
4. ⭐ Permission Boundary로 셀프서비스 권한 안전 확장
5. ⭐ Security/Config 베이스라인을 StackSets로 모든 계정 자동 적용

---

## 💻 실제 예시

```bash
# AFT로 새 워크로드 계정 (ServiceNow 트리거 가정)
# request.json → CodeCommit → CodeBuild → AFT pipeline → 새 계정

# Service Catalog Portfolio
aws servicecatalog create-portfolio --display-name CICD-Templates \
  --provider-name PlatformTeam
aws servicecatalog create-product --name StandardLambdaPipeline \
  --product-type CLOUD_FORMATION_TEMPLATE ...

# Permission Boundary
aws iam put-role-permissions-boundary \
  --role-name DevRole --permissions-boundary arn:aws:iam::ACCT:policy/DevBoundary

# Cross-Account Pipeline (Day 5 Week 5 참조)
```

---

## 📝 연습 문제

**1.** 50 마이크로서비스에 표준 파이프라인 셀프서비스?  A) Service Catalog Portfolio + CDK Pipelines  **정답: A**

**2.** 신규 마이크로서비스 dev/staging/prod 계정 자동 프로비저닝?  A) AFT (Account Factory for Terraform)  **정답: A**

**3.** 개발자가 만든 Role의 권한이 회사 정책을 넘지 못하게?  A) Permission Boundary  **정답: A**

**4.** 모든 계정에 동일 GuardDuty/Config 적용?  A) StackSets + Control Tower (또는 Audit Delegated Admin Auto-enable)  **정답: A**

**5.** Tooling Account가 50 Spoke 계정에 배포?  A) Cross-Account AssumeRole + Artifact S3/KMS Cross-Account  **정답: A**

**6.** prod 배포 freeze 기간?  A) SSM Change Calendar  **정답: A**

**7.** 다중 계정 통합 비용 가시화?  A) 태그 강제 + Cost Explorer + Cost Categories + Anomaly Detection  **정답: A**

---

## 📌 오늘의 요약

1. Landing Zone + AFT로 계정 자동 프로비저닝
2. Tooling Account Hub-Spoke 중앙 파이프라인
3. Service Catalog로 셀프서비스 + 표준
4. Permission Boundary로 안전 권한 확장
5. StackSets로 베이스라인 자동 + Audit 집계
