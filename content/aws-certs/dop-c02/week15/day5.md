# Day 5 - Week 15 종합 시나리오 10문항

📅 날짜: Week 15 (Day 5)
🎯 주제: 멀티 계정 / Hybrid / 컨테이너 / 서버리스 종합 시나리오 점검
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Week 15 전체(day1~day4) 케이스 통합 점검
- 시나리오 문제에서 핵심 단서를 빠르게 잡는 훈련
- 트레이드오프 선택 연습

---

## 🧩 사전 지식 (CS 기초)

- **단서 키워드**: "regulated", "minimum operational overhead", "least cost", "zero internet" 등 — Pro 시험은 단서 1~2개로 정답이 결정.
- **소거법**: 동작은 하지만 비효율/오버킬인 선택지를 먼저 제거.
- **AWS 우선**: 동작은 가능하지만 서드파티 vs 매니지드일 때 매니지드가 정답인 경향.

---

## 📖 이론 내용

### 1. 시나리오 풀이 5단계

1. 핵심 제약 단어 표시(밑줄)
2. 도메인 식별 (CI/CD/IaC/모니터링/보안/복원력/인시던트)
3. 보기에서 "동작 가능 + 제약 부합" 후보 2개로 좁힘
4. 운영 부담/비용/보안 트레이드오프로 최종 1개
5. 자신감 50% 이하면 표시 후 다음 문항

### 2. Week 15 케이스 핵심 요약

- **Day1 멀티 계정**: Landing Zone + AFT, Tooling Hub-Spoke, Service Catalog, Permission Boundary, StackSets
- **Day2 Hybrid**: SSM Hybrid Activation, CodeDeploy On-Prem, IAM Roles Anywhere, PrivateLink, DX 미암호화
- **Day3 컨테이너**: Karpenter, GitOps, Pod Identity, Container Insights, Graviton+Spot
- **Day4 서버리스 인시던트**: EventBridge → Step Functions → Incident Manager + Chatbot

### 3. 단서별 빠른 정답 매핑

| 단서 | 정답 키워드 |
|------|-------------|
| "no internet outbound" | PrivateLink/VPC Endpoint |
| "no static keys" | IAM Roles Anywhere / IRSA / Pod Identity |
| "minimum ops overhead" | Fargate, Managed 서비스, GitOps |
| "across all accounts" | StackSets / Delegated Admin |
| "self-service" | Service Catalog |
| "auto remediation" | EventBridge → SSM Automation/Step Functions |
| "regulated" | Config Conformance + Audit Manager |
| "burst quickly" | Karpenter, Lambda Provisioned Concurrency |

---

## 🧠 심화: 시간 배분

- 75문항 × 180분 = 평균 2분 24초/문항
- 모르면 즉시 표시(Mark for Review)하고 패스 → 시간 보존이 가장 중요
- 마지막 30분은 표시한 문항 + 길이가 매우 긴 시나리오 재검토에 할당

---

## 🏗️ 아키텍처 다이어그램 (week15 종합)

```
Week 15 케이스 통합
==================================================

  Multi-Account (Day1) ─► AFT/Control Tower
  Hybrid (Day2)        ─► SSM Hybrid + Roles Anywhere
  Containers (Day3)    ─► Karpenter + GitOps + Pod Identity
  Serverless IR (Day4) ─► EventBridge → SFN → Incident Manager

   공통 핵심:
   ├─ IaC (CDK/CloudFormation/Terraform)
   ├─ CodePipeline 표준 (Tooling Account Hub)
   ├─ Observability: CW + ADOT + X-Ray
   ├─ Security: GuardDuty/SecurityHub/Config 집계
   └─ Cost: Tag + Cost Categories + Anomaly Detection
```

---

## ⭐ 핵심 포인트 (5개)

1. ⭐ 단서 키워드 → 도메인 → 후보 좁힘 → 트레이드오프
2. ⭐ Pro 시험은 매니지드 > 자체 구축이 기본
3. ⭐ "전체 계정"에는 StackSets / Delegated Admin
4. ⭐ "자동화"의 진입점은 EventBridge
5. ⭐ 시간 표시 후 패스 — 시간 보존이 합격의 기술

---

## 💻 빠른 CLI 점검

```bash
# StackSets Service-Managed (OU 단위)
aws cloudformation create-stack-set \
  --stack-set-name Baseline --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false \
  --template-body file://baseline.yaml

# Service Catalog Portfolio
aws servicecatalog create-portfolio --display-name CICD --provider-name Platform

# EventBridge Cross-Account Bus
aws events put-permission --event-bus-name default \
  --action events:PutEvents --principal 111111111111 --statement-id SpokeAccount
```

---

## 📝 시나리오 종합 10문항

**1.** 회사는 60개 AWS 계정을 운영한다. 모든 계정에 동일한 Config Rule 베이스라인을 자동 배포하고, 신규 계정 가입 시에도 자동 적용되어야 한다. 어떤 조합이 가장 적합한가?
A) 각 계정 Console 수동 설정
B) **AWS Organizations + CloudFormation StackSets Service-Managed (Auto-Deployment Enabled)**
C) Lambda 스크립트로 매일 동기화
D) Config Aggregator만
**정답: B**

**2.** 인터넷 차단된 데이터센터 5,000대 서버를 EC2와 동일하게 패치 관리하려고 한다. 가장 적합한 방법은?
A) Ansible 자체 운영
B) **SSM Hybrid Activation 후 Patch Manager + PrivateLink VPC Endpoint**
C) CodeDeploy On-Prem only
D) Lambda + SSH
**정답: B**

**3.** EKS 클러스터에서 트래픽 변동이 매우 커서 분 단위 노드 확장으로는 부족하다. 다양한 인스턴스 타입을 동적으로 띄우고 Spot도 활용하려면?
A) Cluster Autoscaler B) **Karpenter**
C) Lambda + ASG D) EC2 Fleet
**정답: B**

**4.** 신규 EKS 클러스터에서 IRSA 대신 더 간단한 파드 IAM 부여 표준은?
A) Instance Profile만 B) IAM User
C) **EKS Pod Identity**
D) STS GetSessionToken
**정답: C**

**5.** GuardDuty가 IAM 액세스 키 유출을 탐지. 자동으로 비활성화 + 영향 분석 + 인시던트 오픈까지 가야 한다.
A) Lambda 단독
B) **EventBridge → Step Functions(Runbook) → Incident Manager Response Plan**
C) Config Auto-Remediation D) CloudTrail 알람만
**정답: B**

**6.** 50개 마이크로서비스에 표준 파이프라인을 제공하되 팀이 셀프서비스로 만들 수 있어야 한다.
A) GitOps만 B) Jenkins
C) **AWS Service Catalog Portfolio + CDK Pipelines 템플릿**
D) CodeCatalyst Blueprint 수동
**정답: C**

**7.** Direct Connect로 10Gbps를 사용 중이지만 규제상 회선 암호화가 필수다. 최소 변경?
A) S3 SSE-KMS만 B) TLS만
C) **MACsec 또는 IPSec over DX**
D) VPN으로 교체
**정답: C**

**8.** SQS DLQ가 누적되면 자동 Re-drive를 하되 무한 루프를 방지하려면?
A) Lambda 타임아웃 B) DLQ TTL
C) **메시지 속성에 재처리 카운트 기록 + 임계 초과 시 사람 개입**
D) Step Functions Express만
**정답: C**

**9.** SRE가 Slack에서 제한된 AWS CLI를 안전하게 실행할 수 있도록 하려면?
A) Slack Webhook + Lambda B) **AWS Chatbot + 제한된 IAM Role**
C) Slack Bot OAuth 토큰 D) Direct Console SSO
**정답: B**

**10.** 컨테이너 워크로드 비용을 30% 절감하라는 압박이 있다. 단일 최고의 액션은?
A) RI 구매 B) **Graviton(arm64) 노드 그룹 + Spot/Fargate Spot 적용**
C) Region 변경 D) S3 IA
**정답: B**

---

## 📌 오늘의 요약

1. Pro 시나리오는 단서 → 도메인 → 트레이드오프 5단계
2. StackSets/Delegated Admin이 "모든 계정"의 정답
3. EventBridge가 모든 자동화의 진입점
4. Karpenter, Pod Identity, Service Catalog는 신규 출제 빈도 ↑
5. 시간 보존 > 완벽한 정답 — 표시 후 패스 습관화
