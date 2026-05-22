# Day 2 - 도메인 3·4 복습 (배포·자동화 + 보안·컴플라이언스)

📅 날짜: Week 12 (Day 2)
🎯 주제: SOA-C02 도메인 3·4 핵심 압축 정리
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 도메인 3(배포·프로비저닝·자동화 18%)과 도메인 4(보안·컴플라이언스 16%) 통합 34%를 정리한다
- IaC·배포 정책·보안 서비스의 차이를 명확히 한다
- 도메인 통합 시나리오 5문항으로 점검한다

---

## 🧩 사전 지식 (CS 기초)

- **IaC**: Infrastructure as Code (CloudFormation, CDK, Terraform)
- **Blue/Green vs Canary vs Rolling**: 배포 정책 3종
- **PoLP**: Principle of Least Privilege (최소 권한 원칙)
- **Defense in Depth**: 다층 방어 (네트워크 + IAM + 암호화 + 모니터링)

---

## 📖 이론 내용

### 1. 도메인 3: 배포·프로비저닝·자동화 (18%)

#### 1-1. CloudFormation 핵심

| 항목 | 핵심 |
|------|------|
| Stack | 배포 단위 |
| Template | YAML/JSON 정의 |
| Change Set | 적용 전 변경 미리보기 |
| Drift Detection | 실제 ↔ 템플릿 차이 |
| Rollback Trigger | 실패 시 자동 롤백 |
| StackSets | 멀티 계정/리전 배포 |
| Nested Stack | 재사용 모듈화 |
| Cross-Stack Ref | Output → Import |

#### 1-2. 배포 정책 (Elastic Beanstalk / CodeDeploy)

| 정책 | 다운타임 | 비용 | 롤백 |
|------|----------|------|------|
| **All at once** | O (짧음) | 0 | 어려움 |
| **Rolling** | 부분 다운 | 0 | 보통 |
| **Rolling with Additional Batch** | 0 | + | 보통 |
| **Immutable** | 0 | ++ (새 ASG) | 쉬움 |
| **Blue/Green** | 0 | ++ (별 환경) | 즉시 |
| **Canary** (CodeDeploy) | 0 | + | 자동 |

#### 1-3. Systems Manager (SSM) - 운영 자동화 핵심

| 컴포넌트 | 역할 |
|----------|------|
| **Run Command** | 즉시 실행 (멀티 EC2 명령) |
| **State Manager** | 원하는 상태 유지 (Association) |
| **Patch Manager** | OS 패치 자동화 (Baseline + Group) |
| **Maintenance Window** | 정기 운영 작업 |
| **Parameter Store** | 설정값/비밀 저장 (SecureString) |
| **Session Manager** | SSH 없는 안전 접속 |
| **Automation Runbook** | 단계별 자동화 워크플로 |

#### 1-4. EC2 Image Builder & Service Catalog

| 서비스 | 역할 |
|--------|------|
| EC2 Image Builder | AMI 자동 빌드 + 보안 패치 |
| Service Catalog | 승인된 IaC 카탈로그 (셀프서비스) |
| AWS Proton | 컨테이너/서버리스 표준 템플릿 |

### 2. 도메인 4: 보안·컴플라이언스 (16%)

#### 2-1. IAM 핵심

| 항목 | 핵심 |
|------|------|
| User/Group/Role | 사용자/그룹/역할 |
| Policy | JSON 권한 |
| Permission Boundary | 최대 권한 제한 |
| SCP | Organizations 단위 가드레일 |
| Identity Center | SSO + Permission Set |
| Access Analyzer | 외부 노출 분석 |

평가 로직: **SCP → Permission Boundary → Identity Policy → Resource Policy → Session Policy**

#### 2-2. 암호화 (KMS)

| 항목 | 핵심 |
|------|------|
| AWS Managed Key | AWS 관리 (회전 자동) |
| Customer Managed Key (CMK) | 사용자 관리 (Key Policy + Grant) |
| 회전 | CMK 매년 자동 회전 가능 |
| Multi-Region Key | 리전 간 동일 키 복제 |
| Envelope Encryption | DEK + KEK |
| CloudHSM | 전용 HSM (FIPS 140-2 Level 3) |

#### 2-3. 비밀 관리

| 서비스 | 특징 |
|--------|------|
| **Secrets Manager** | 자동 회전 + Cross-Region Replication + Lambda 회전 |
| **Parameter Store SecureString** | 무료, 회전 X, 간단한 설정 |

→ DB 패스워드·API 키는 Secrets Manager. 일반 설정은 PS.

#### 2-4. 위협 탐지

| 서비스 | 역할 | 데이터 소스 |
|--------|------|-------------|
| **GuardDuty** | 위협 탐지 | VPC Flow Logs, DNS, CloudTrail |
| **Security Hub** | 통합 보안 대시보드 | GuardDuty/Inspector/Macie/Config 통합 |
| **Inspector** | 취약점 스캔 | EC2/ECR/Lambda |
| **Macie** | S3 PII 탐지 | S3 객체 |
| **IAM Access Analyzer** | 외부 노출 분석 | IAM 정책 |
| **Detective** | 보안 인시던트 조사 | GuardDuty Finding |

#### 2-5. 컴플라이언스

| 서비스 | 역할 |
|--------|------|
| **Config** | 리소스 컴플라이언스 (Rule + Conformance Pack) |
| **Audit Manager** | 컴플라이언스 보고서 자동화 (PCI/SOC/HIPAA) |
| **Artifact** | AWS 컴플라이언스 문서 다운로드 |
| **CloudTrail** | API 감사 |

### 3. "키워드 → 정답" 통합표

| 키워드 | 도메인 3·4 정답 |
|--------|-----------------|
| "변경 사전 검토" | CloudFormation Change Set |
| "템플릿과 실제 차이" | Drift Detection |
| "멀티 계정/리전 IaC" | StackSets |
| "다운타임 0, 즉시 롤백" | Blue/Green |
| "OS 패치 자동화" | SSM Patch Manager |
| "SSH 없는 접속" | Session Manager |
| "Org 단위 가드레일" | SCP |
| "권한 경계 제한" | Permission Boundary |
| "DB 패스워드 자동 회전" | Secrets Manager |
| "S3 PII 탐지" | Macie |
| "EC2/ECR 취약점 스캔" | Inspector |
| "보안 통합 대시보드" | Security Hub |

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **CodeDeploy AppSpec hooks** | BeforeInstall/AfterInstall 등 7단계 | 시나리오 |
| **SSM Run Command vs Automation** | Run = 단발, Automation = 워크플로 | 차이 |
| **Permission Boundary != SCP** | PB = IAM 엔티티, SCP = 계정 | 혼동 주의 |
| **GuardDuty 멀티 계정** | Organizations로 일괄 enable | 운영 |
| **Security Hub Standards** | CIS / PCI-DSS / NIST 등 | 컴플라이언스 |
| **Config Conformance Pack** | 여러 Rule 묶음 + Remediation | 일괄 적용 |

> ⚠️ **함정 1**: Blue/Green = 즉시 롤백 가능 (DNS 전환). Immutable은 새 ASG 생성 후 교체.
>
> ⚠️ **함정 2**: SCP는 권한을 "허용"하지 않고 "제한"만. SCP만 있어선 권한 X.
>
> ⚠️ **함정 3**: Parameter Store SecureString은 회전 X. DB 패스워드는 Secrets Manager.
>
> 💡 **암기 팁**: 도메인 3 = "어떻게 자동 배포할까", 도메인 4 = "어떻게 안전하게 막을까"

---

## 🏗️ 아키텍처 다이어그램

```
도메인 3·4 통합: 안전한 자동 배포 파이프라인
==========================================================

  [코드]──CFN─►[Service Catalog]─►[StackSets 멀티 계정]
                                        │
                                        ▼
                               [Blue/Green Deploy]
                                        │
                                        ▼
        [SSM Patch ◄──┐         [EC2 + ASG + ALB]
         Manager]      │                │
                       │         [Inspector 스캔]
        [Session ◄─────┤                │
         Manager]      │         [GuardDuty + 
                       │          Security Hub]
        [Parameter ◄───┘                │
         Store/Secrets]          [Config + Audit
                                  Manager 컴플라이언스]
```

---

## ⭐ 핵심 포인트 (도메인 3·4 통합)

1. ⭐ **CloudFormation**: Change Set(사전 검토) + Drift(차이) + StackSets(멀티)
2. ⭐ **배포 정책**: Blue/Green = 즉시 롤백, Immutable = 새 ASG, Rolling = 비용 0
3. ⭐ **SSM**: Run Command(단발) / State Manager(유지) / Patch Manager(패치) / Session Manager(접속)
4. ⭐ **IAM 평가**: SCP → PB → Identity → Resource (가장 제한적인 게 우선)
5. ⭐ **보안 서비스**: GuardDuty(위협) / Inspector(취약점) / Macie(PII) / Security Hub(통합)

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. CloudFormation Change Set
aws cloudformation create-change-set \
  --stack-name prod-web \
  --change-set-name update-v2 \
  --template-body file://template.yaml \
  --capabilities CAPABILITY_IAM

aws cloudformation execute-change-set \
  --stack-name prod-web --change-set-name update-v2

# 2. StackSets 멀티 계정 배포
aws cloudformation create-stack-instances \
  --stack-set-name baseline-security \
  --accounts 111122223333 444455556666 \
  --regions ap-northeast-2 us-east-1

# 3. SSM Patch Manager (Baseline)
aws ssm create-patch-baseline \
  --name "ProdLinuxBaseline" \
  --operating-system AMAZON_LINUX_2 \
  --approval-rules '{"PatchRules":[{
    "PatchFilterGroup":{"PatchFilters":[
      {"Key":"CLASSIFICATION","Values":["Security","Bugfix"]},
      {"Key":"SEVERITY","Values":["Critical","Important"]}
    ]},
    "ApproveAfterDays":7
  }]}'

# 4. Secrets Manager 자동 회전 설정
aws secretsmanager rotate-secret \
  --secret-id prod/db/master \
  --rotation-lambda-arn arn:aws:lambda:ap-northeast-2:123:function:RotateRDS \
  --rotation-rules AutomaticallyAfterDays=30

# 5. GuardDuty 조직 일괄 활성화
aws guardduty enable-organization-admin-account \
  --admin-account-id 123456789012

# 6. Config Conformance Pack 적용
aws configservice put-conformance-pack \
  --conformance-pack-name PCI-DSS-Pack \
  --template-s3-uri s3://my-conformance-packs/pci-dss.yaml \
  --delivery-s3-bucket conformance-results-bucket

# 7. Session Manager 접속 (SSH X)
aws ssm start-session --target i-1234567890abcdef0
```

---

## 📝 도메인 통합 시나리오 5문항

**문제 1.** 회사가 100개 계정에 동일한 IAM 가드레일을 적용하려 한다.

A) 각 계정에서 IAM 정책 수동 생성
B) Organizations + SCP (계정 단위 가드레일)
C) Permission Boundary
D) Identity Center

**정답: B**
해설: SCP는 조직 단위 권한 상한. 멀티 계정 일괄 가드레일에 최적. PB는 개별 IAM 엔티티용.

---

**문제 2.** 운영팀이 100개 EC2 인스턴스에 OS 패치를 매월 정기 적용하려 한다.

A) Run Command 수동 실행
B) SSM Patch Manager + Maintenance Window (정기 자동 적용)
C) CloudFormation
D) Lambda

**정답: B**
해설: 정기 + 패치 = Patch Manager + MW 조합이 정답. Run Command는 단발.

---

**문제 3.** 회사가 새 버전 배포 시 다운타임 0 + 문제 발생 시 즉시 이전 버전으로 돌아가야 한다.

A) All at once
B) Rolling
C) Blue/Green (즉시 DNS/Target Group 전환)
D) In-place

**정답: C**
해설: Blue/Green은 두 환경 운영 후 DNS/Target Group 전환. 롤백은 다시 전환만 하면 됨.

---

**문제 4.** S3에 저장된 고객 데이터에 PII(주민번호 등) 노출 위험을 자동 탐지하려면?

A) Inspector
B) Macie (S3 PII 탐지)
C) GuardDuty
D) Security Hub

**정답: B**
해설: Macie는 S3 PII 탐지 전용. GuardDuty는 위협, Inspector는 EC2/ECR 취약점.

---

**문제 5.** 회사가 EC2에 SSH 접속 시 키 관리·감사가 어렵다. 운영 부하 최소 방법?

A) Bastion Host
B) SSM Session Manager (CloudTrail 자동 감사, 키 불필요)
C) VPN
D) IAM 역할

**정답: B**
해설: Session Manager는 SSH 키·22 포트 불필요. CloudTrail/CW Logs로 자동 감사.

---

## 📌 오늘의 요약

1. **CloudFormation**: Change Set / Drift / StackSets / Nested Stack
2. **배포 정책**: All at once / Rolling / Immutable / Blue/Green / Canary
3. **SSM 6대 컴포넌트**: Run / State / Patch / MW / Parameter / Session / Automation
4. **IAM 평가 순서**: SCP → PB → Identity → Resource
5. **보안 서비스**: GuardDuty(위협) / Inspector(취약점) / Macie(PII) / Security Hub(통합) / Detective(조사)
