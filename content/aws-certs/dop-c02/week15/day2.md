# Day 2 - Hybrid CI/CD 케이스 (온프레미스 + AWS)

📅 날짜: Week 15 (Day 2)
🎯 주제: 온프레미스 데이터센터와 AWS를 함께 운영하는 하이브리드 파이프라인
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 온프레미스 빌드/배포 자산을 그대로 두고 AWS로 점진 확장하는 패턴 이해
- Hybrid Activation, SSM Agent, CodeDeploy On-Prem 통합 흐름 설계
- 네트워크/보안 경계(Direct Connect, VPN, PrivateLink) 의사결정 기준 확립

---

## 🧩 사전 지식 (CS 기초)

- **Hybrid Cloud**: 온프레미스(자체 DC)와 퍼블릭 클라우드를 하나의 운영 모델로 묶은 환경.
- **Pull vs Push 배포**: 에이전트가 끌어오는(Pull) 방식이 방화벽 친화적, 푸시(Push)는 즉시성 좋음.
- **Bastion-less**: SSM Session Manager로 베스천 제거, 인바운드 22번 포트 없이 운영.

---

## 📖 시나리오

**회사 프로필:**
- 5,000대 온프레미스 VM + 200대 EC2
- 빌드 시스템: Jenkins 마스터/슬레이브 (DC)
- 신규 워크로드는 AWS, 레거시 Java/COBOL은 DC 유지
- 보안: 인바운드 인터넷 차단, Egress는 NAT 프록시만 허용
- 목표: 단일 배포 파이프라인으로 두 환경 동시 릴리즈

### 1. 네트워크 토폴로지

- **AWS Direct Connect** 10 Gbps × 2 (이중화) + IPSec VPN 백업
- **Transit Gateway**: 모든 VPC + DC 경로 집중
- **VPC Endpoint (PrivateLink)**: S3, ECR, CodeBuild, SSM, Secrets Manager 인바운드 차단된 환경에서 사용
- DNS는 Route 53 Resolver Inbound/Outbound Endpoint로 양방향 해석

### 2. 빌드 단계 통합

- Jenkins → CodeBuild로 점진 이관, 우선은 **Jenkins → S3 Artifact** 출력 후 AWS 파이프라인이 이어받는 패턴
- 또는 CodePipeline에 **Jenkins Action**(CustomAction 제공자) 추가
- 컨테이너 이미지는 ECR로 통합, On-Prem Docker는 ECR Cross-Region Pull-Through Cache 사용

### 3. 배포 단계 통합 (핵심)

CodeDeploy On-Prem Instances:
1. IAM User 또는 IAM Role Anywhere로 자격 증명 발급
2. `aws deploy register --instance-name dc-app-01 ...` 로 온프레 인스턴스 등록
3. 태그 부여 후 Deployment Group 생성
4. AppSpec 동일 → AWS EC2 + DC 서버 동시 배포

### 4. 구성 관리

**SSM Hybrid Activation:**
- DC 서버에 SSM Agent + 활성화 코드 등록
- 등록 후 `mi-xxxx` ID로 EC2처럼 관리
- Run Command, Patch Manager, State Manager 그대로 사용
- 최근에는 **IAM Roles Anywhere**로 X.509 인증서 기반 통합 권장

### 5. 시크릿/구성

- Secrets Manager + Parameter Store는 PrivateLink로 DC에서 접근
- CodeArtifact는 사내 npm/Maven 미러로 사용 (인터넷 차단 환경)
- 회전된 RDS 자격은 SSM Document로 DC 서버에 일괄 재배포

### 6. 모니터링 통합

- CloudWatch Agent: EC2 + 온프레 모두 동일 설정 (Hybrid Activation Role 사용)
- OpenSearch 또는 CloudWatch Logs로 로그 집계
- X-Ray 데몬을 온프레에도 설치하여 End-to-End Trace
- 메트릭은 ADOT Collector → CloudWatch / Managed Prometheus

### 7. 보안 가드

- 인바운드 0, Egress는 NAT GW + Squid Proxy 경유만 허용
- PrivateLink로 AWS API 호출은 사설 경로
- CloudTrail Lake에서 AWS 측 감사, DC 감사는 OpenSearch
- KMS Multi-Region Key로 양쪽에서 동일 키 ID 참조

---

## 🧠 알아두면 좋은 심화 이론

| 통합 영역 | 권장 서비스 | 이유 |
|-----------|-------------|------|
| 자격 증명 | IAM Roles Anywhere | 정적 키 제거, 인증서 기반 |
| 빌드 점진 이관 | CodePipeline + Jenkins Action | Big-bang 회피 |
| 구성/패치 | SSM Hybrid Activation | EC2와 동일 운영 모델 |
| 배포 | CodeDeploy On-Prem | AppSpec 1세트로 통합 |
| 네트워크 | TGW + PrivateLink | 인터넷 미사용 |

### 함정 포인트

- Hybrid Activation은 만료일이 있는 **활성화 토큰**과 인스턴스 등록 후의 영구 ID(`mi-xxx`)를 혼동하기 쉬움
- CodeDeploy On-Prem은 Auto Scaling 통합 불가 → 정적 인벤토리
- Direct Connect만으로는 암호화 안 됨, MACsec/IPSec over DX 필요

### 팁

- DR을 위해 DC ↔ AWS 양방향이 가능하도록 설계 (한쪽이 마스터 강제 X)
- 인증서 회전을 자동화하지 않으면 6~12개월 후 대형 장애

---

## 🏗️ 아키텍처 다이어그램

```
Hybrid CI/CD
==================================================

  On-Prem DC                       AWS
  ┌──────────────┐    DX 10Gx2    ┌────────────────┐
  │ Jenkins      │ ◄────────────► │ Transit Gateway │
  │ DC Servers   │                 └──────┬──────────┘
  │ + SSM Agent  │                        │
  │ + CodeDeploy │   PrivateLink          ▼
  │   Agent      │ ────────────► VPC Endpoints
  └──────────────┘                (S3, ECR, SSM,
                                   Secrets, CodeBuild)
            │
            ▼
   CodePipeline (Tooling Account)
   ├─ Source (CodeCommit/GitHub via Endpoint)
   ├─ Build (CodeBuild VPC Mode)
   ├─ Deploy AWS  → CodeDeploy → EC2 ASG
   └─ Deploy DC   → CodeDeploy → On-Prem (mi-xxx)

   Observability
   ├─ CloudWatch Agent (EC2 + DC 공통)
   ├─ ADOT Collector → Managed Prometheus
   └─ CloudTrail Lake
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ SSM Hybrid Activation으로 온프레를 EC2처럼 관리
2. ⭐ CodeDeploy On-Prem으로 단일 AppSpec 양쪽 배포
3. ⭐ IAM Roles Anywhere로 정적 키 제거 (시험 신규 출제 트렌드)
4. ⭐ PrivateLink/VPC Endpoint로 인터넷 차단 환경 AWS API 호출
5. ⭐ Direct Connect는 미암호화, MACsec/IPSec 필요

---

## 💻 AWS CLI 예시

```bash
# 1) SSM Hybrid Activation 생성
aws ssm create-activation \
  --description "OnPrem-DC-App" \
  --default-instance-name dc-app \
  --iam-role SSMServiceRole \
  --registration-limit 100

# 출력 ActivationCode + ActivationId를 DC 서버에서 실행
sudo amazon-ssm-agent -register \
  -code "ACTIVATION_CODE" -id "ACTIVATION_ID" -region ap-northeast-2

# 2) CodeDeploy On-Prem 등록
aws deploy register \
  --instance-name dc-server-01 \
  --iam-user-arn arn:aws:iam::ACCT:user/CodeDeployUser \
  --tags Key=Env,Value=Prod

aws deploy add-tags-to-on-premises-instances \
  --instance-names dc-server-01 --tags Key=App,Value=Billing

# 3) IAM Roles Anywhere 신뢰 앵커 (X.509)
aws rolesanywhere create-trust-anchor \
  --name CorpCA --source sourceType=CERTIFICATE_BUNDLE,...

# 4) Direct Connect 가상 인터페이스
aws directconnect create-private-virtual-interface \
  --connection-id dxcon-xxx \
  --new-private-virtual-interface ...
```

---

## 📝 연습 문제 (Pro 시나리오형 6문항)

**1.** 5,000대 온프레미스를 EC2와 동일하게 패치/명령 실행하려면?
A) Run Command만 사용 B) **SSM Hybrid Activation 후 Run Command/Patch Manager**
C) Lambda + SSH D) Jenkins Job
**정답: B**

**2.** 인터넷 차단 환경에서 DC 서버가 Secrets Manager를 조회해야 한다. 최소 변경 방법?
A) Public Endpoint + IAM B) NAT Gateway 추가
C) **PrivateLink Interface Endpoint + DX 경유**
D) Lambda Proxy
**정답: C**

**3.** AWS EC2와 DC 서버를 단일 AppSpec으로 동시 배포?
A) **CodeDeploy + On-Prem Instances 등록**
B) Ansible only
C) SSM State Manager
D) Lambda
**정답: A**

**4.** 온프레 빌드 자산(Jenkins)을 유지하면서 AWS 파이프라인으로 점진 이관?
A) Jenkins 폐기 후 CodeBuild 전환 B) **CodePipeline Jenkins Action + S3 Artifact**
C) CodeBuild만 사용 D) GitOps만 사용
**정답: B**

**5.** DC 서버에 정적 액세스 키를 두지 않고 임시 자격 증명 부여?
A) IAM User Long-term Key
B) **IAM Roles Anywhere (X.509 인증서)**
C) Cognito Identity Pool
D) STS GetSessionToken
**정답: B**

**6.** Direct Connect만으로 회선이 암호화될까?
A) 자동 암호화됨 B) **암호화 안 됨 → MACsec 또는 IPSec over DX 필요**
C) TLS 강제 D) KMS가 처리
**정답: B**

---

## 📌 오늘의 요약

1. SSM Hybrid Activation으로 DC = EC2 운영 모델 통합
2. CodeDeploy On-Prem으로 단일 AppSpec 양쪽 배포
3. IAM Roles Anywhere가 정적 키 제거의 정답
4. PrivateLink + DX/TGW로 인터넷 차단 환경 AWS API 호출
5. DX는 미암호화 → MACsec/IPSec 추가 필요
