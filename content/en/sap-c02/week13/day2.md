# Day 2 - Operational Excellence & Security Pillars Deep Dive — GitOps Roots, Shared Responsibility Model Boundaries, Three Types of Traceability Internals

There are two ways production infrastructure collapses. One is an operator accidentally clicking something wrong on the console (Operational Excellence failure), and the other is an attacker exploiting weak credentials, open ports, or excessive permissions (Security failure). Interestingly, both pillars share essentially the same philosophical solution: **Replace manual human intervention with code and automation, and make all actions traceable.** When you replace operations with code, human error disappears. When you replace security with code, consistency and auditability emerge.

In SAP-C02, Operational Excellence and Security are relentlessly tested with keywords like "minimize operational burden," "people access without SSH," "auto-rotate password every 30 days," "who called the API?" Today we dive deep into the historical roots of GitOps, the precise boundaries of the Shared Responsibility Model, the internal differences of three traceability types (CloudTrail, Config, Logs), and multi-account security delegation.

## Operational Excellence — What It Means to Make Operations Code

The five design principles of Operational Excellence summarize to one sentence: **"Perform operations as code, make small changes frequently, make them reversible, learn, and automate everything."** The first principle, "Perform operations as code," is the starting point for everything.

| Principle | Meaning | AWS Mapping |
|-----------|---------|------------|
| Perform operations as code | Codify infrastructure and operational procedures | CloudFormation, CDK, Terraform, SSM Automation |
| Small, frequent, reversible changes | Deploy small and often instead of big, with rollback capability | CodeDeploy (Canary, Blue/Green) |
| Regularly improve operational procedures | Evolve procedures through retrospectives and Game Days | WA Review, Game Day |
| Anticipate failures and learn | Assume failures and conduct post-mortems | FIS, post-mortem culture |
| Automate all operational tasks | Exclude human hands from repetitive work | SSM, EventBridge, Lambda |

> 💡 **Related Theory**: The philosophical roots of "perform operations as code" trace back to **GitOps**, named by Weaveworks in 2017. The core idea is to "treat the Git repository as the single source of truth for the system, and if the actual infrastructure state differs from the Git declaration, automatically reconcile (reconcile) it." This is a shift toward a **declarative** rather than **imperative** model for infrastructure — instead of "execute this command," you declare "the final state should be like this," and the system closes the gap. CloudFormation's drift detection and Terraform's plan/apply are all examples of this convergence loop. In exams, when you see "detect and correct manual changes" or "declarative infrastructure," the IaC + drift detection combination is a signal for the correct answer.

> 🔍 **Deeper Dive**: The "small, frequent, reversible changes" principle is implemented through deployment strategies. **Blue/Green** spins up a new environment (Green) entirely and switches traffic at once—on problems, immediately rolls back to Blue (high reversibility, higher cost—both environments run simultaneously). **Canary** sends only 5-10% of traffic to the new version for observation before gradually expanding (minimize risk exposure). **Rolling** replaces instances sequentially (lower cost, slower rollback). In SAP exams, "minimize deployment risk + instant rollback" maps to Blue/Green; "validate with a small group first" maps to Canary. CodeDeploy provides all three strategies as a managed service.

## Operational Excellence Tooling Landscape — Systems Manager Is Central

| Tool | Core Use | Exam Keywords |
|------|----------|---------------|
| **CloudFormation, CDK** | Declarative IaC | "Infrastructure as code" |
| **Service Catalog** | Self-service deployment of approved products only | "No arbitrary infrastructure creation" |
| **Systems Manager** | Patch, Session, Parameter, Inventory, Automation, OpsCenter | "No SSH," "Auto patch," "Runbook" |
| **CloudWatch** | Metrics, Logs, Alarms, Dashboard, Synthetics | "Observability," "Synthetic monitoring" |
| **X-Ray, ServiceLens, ADOT** | Distributed tracing | "Track microservice latency" |
| **CodePipeline, CodeDeploy** | CI/CD, deployment strategy | "Automated deployment pipeline" |
| **Health Dashboard** | Service, account health events | "AWS-side outage notification" |
| **Chatbot** | Slack, Teams operational alerts | "ChatOps" |

Systems Manager (SSM) is the Swiss Army knife of Operational Excellence. The two functions appearing most often in exams are **Session Manager** (shell access via IAM permissions without opening SSH/RDP ports—all sessions recorded in CloudTrail and S3) and **Patch Manager** (automatically patch on schedule after defining a patch baseline). Additionally, **Automation Document** automates incident response by defining multi-step runbooks (start EC2 → patch → validate → restart) in code.

> ⚠️ **Pitfall**: Don't confuse SSM's two types of documents. **Run Document (Command document)** executes a single command on EC2 (e.g., a shell script line). **Automation Document** orchestrates multiple AWS APIs in sequence—a multi-step workflow (e.g., snapshot → create AMI → replace instance → validate). In exams, "automate a multi-step recovery/operational workflow" is Automation Document; "run a command inside an instance" is Run Document. Mixing them up is a wrong answer.

## Security — Precise Boundaries of the Shared Responsibility Model

To understand the Security pillar, you must precisely draw the boundaries of the **Shared Responsibility Model**. AWS takes responsibility for "of the cloud" (the cloud itself), while customers take responsibility for "in the cloud" (inside the cloud).

```
[Customer Responsibility — Security IN the cloud]
  • Data encryption (at rest, in transit)
  • IAM permissions and credential management
  • OS and app patching (for EC2)
  • Network and firewall configuration (SG, NACL)
  • Application security
─────────────────────────────────
[AWS Responsibility — Security OF the cloud]
  • Physical data centers and hardware
  • Hypervisor and host OS
  • Managed service infrastructure operations
  • Global network backbone
```

The key insight is that **as abstraction level increases, customer responsibility decreases**. EC2 (IaaS) puts OS patching on the customer, but RDS (managed) has AWS patch the DB engine, and Lambda (serverless) has AWS manage the runtime. So "reduce operational and security burden" is the same as "move to more managed services."

> 💡 **Related Theory**: The security philosophy of the Shared Responsibility Model has evolved into **Zero Trust**. Traditional security used a "perimeter" model—trust inside the network boundary, distrust outside. Zero Trust, as defined in NIST SP 800-207, states: **"Don't base trust on network location; verify every request each time."** In AWS, this is implemented via IAM permission verification, SG segmentation even inside VPC, IMDSv2's token requirement, and mTLS. The 2019 Capital One breach (SSRF led to theft of IAM credentials from EC2 metadata → 100M people's data leaked) was the direct trigger for IMDSv2 becoming mandatory—the metadata endpoint once trusted as inside the perimeter became an attack surface.

> 📚 **Case Study**: The 2019 Capital One data breach is a textbook incident in the "customer responsibility" zone of the Shared Responsibility Model. The cause: misconfigured WAF (customer responsibility) allowed SSRF; IAM role with excessive permissions (customer responsibility) was compromised by metadata service v1 (token unnecessary) and read S3 buckets. AWS infrastructure itself (AWS responsibility) was not breached. Lessons: (1) IMDSv2 mandate blocks metadata access without a token, (2) IAM least privilege, (3) limit metadata access paths via VPC Endpoint and SG. After this breach, GuardDuty added credential theft detection patterns, and all new workloads began recommending IMDSv2 as default.

## Security Tooling Landscape — Three Layers of Detection, Protection, Response

| Domain | Tool | Core Role |
|--------|------|-----------|
| **ID** | IAM, IAM Identity Center, STS, Cognito | Authentication, Authorization, Temporary Credentials, User Pool |
| **Detection** | GuardDuty, Macie, Inspector, Security Hub, Detective | Threat Detection, Sensitive Data, Vulnerabilities, Integration, Root Cause |
| **Infrastructure Protection** | SG, NACL, WAF, Shield, Network Firewall, Firewall Manager | Firewalls, DDoS, L7 Protection, Org-wide Management |
| **Data Protection** | KMS, CloudHSM, Secrets Manager, ACM | Key Management, HSM, Secrets, Certificates |
| **Incident Response** | EventBridge, Lambda, SSM Incident Manager, Detective | Auto Isolation, Pager, Runbook, Investigation |
| **Compliance** | Artifact, Audit Manager, Config | Evidence Documents, Audit Evidence, Rule Evaluation |

Role division among detection tools is exam gold. **GuardDuty** analyzes VPC Flow Logs, DNS, and CloudTrail with ML to detect threats (abnormal API calls, crypto mining, credential theft). **Macie** auto-classifies sensitive data (PII, credit cards) in S3. **Inspector** scans EC2, ECR, Lambda for software vulnerabilities (CVE). **Security Hub** aggregates all results in standard format and scores them. **Detective** visualizes the root cause of detected threats as a graph.

> 🔍 **Deeper Dive**: **Secrets Manager automatic rotation** must be distinguished from Parameter Store in exams. Secrets Manager not only stores secrets but **automatically invokes a rotation Lambda on a schedule** to rotate passwords for RDS, Redshift, DocumentDB without downtime (four steps: createSecret → setSecret → testSecret → finishSecret). Applications always query the "current version (AWSCURRENT)," so replacement happens seamlessly. SSM Parameter Store (SecureString) encrypts secrets with KMS but **does not natively support automatic rotation**. In exams, "auto-rotate DB password every 30 days + no downtime" is the direct answer: Secrets Manager.

## Multi-Account Security — Delegated Administrators and Organization-Wide Controls

SAP exam security scenarios almost always assume a **multi-account Organization**. The core pattern is **Delegated Administrator**—delegate security tools (GuardDuty, Security Hub, Macie, Config) not to the management account but to a dedicated **Security account**, from which you view the aggregated detection results for the entire Org.

```
[Organizations Management Account]
   │ (delegate)
   ▼
[Dedicated Security Account — Delegated Admin]
   ├── GuardDuty (aggregate threats from all accounts)
   ├── Security Hub (aggregate scores/integration across all accounts)
   ├── Macie (aggregate sensitive data in S3 from all accounts)
   └── EventBridge → Lambda (auto-isolate and respond)
```

> 🎯 **Scenario**: "An Organization runs 50 accounts. Whenever a threat is detected in any account, the central security team must be immediately notified, and resources must be auto-isolated. What's the pro design?" — Answer: **Set GuardDuty and Security Hub as delegated admins in a dedicated Security account → centrally aggregate detection results from all accounts → EventBridge rules receive threat events and auto-isolate via Lambda/SSM Automation (replace SG, isolate instance).** Having each account separately manage security tools (distributed) creates blind spots and operational burden. "Central aggregation + auto response" is the hallmark of pro answers.

> 🔍 **Deeper Dive**: Another axis of multi-account security is **SCP (Service Control Policy)**. SCP sets an organization-level "hard ceiling that no IAM in that account can exceed, regardless of what it permits"—a preventive control. In contrast, Config and GuardDuty are detective controls that flag violations after the fact. Their role division is exam gold: if you must **prevent before it happens** (like "ban a specific region," "block root user actions"), SCP is the answer; if "flag violations and auto-remediate," it's Config Rule + auto remediation. The strongest design combines SCP to set broad boundaries (prevent) with Config and GuardDuty to monitor the rest (detect).

> ⚠️ **Pitfall**: You must precisely distinguish the three traceability types. **CloudTrail** records "who called which API and when" (action audit), **Config** tracks "how a resource's configuration changed + compliance evaluation" (state and compliance), **CloudWatch Logs** captures "what the application and system logged." In exams, "which API an IAM user called" is CloudTrail, not Config—Config doesn't record API calls themselves but tracks resource configuration changes. Conversely, "how did a security group change state and is it a compliance violation?" is perfect for Config.

## Summary

Operational Excellence and Security share a common philosophy: "replace manual with code and automation, make all actions traceable." Operational Excellence is implemented through GitOps, declarative IaC, deployment strategies (Blue/Green, Canary), and Systems Manager (Session, Patch, Automation). Security evolves from the Shared Responsibility Model to Zero Trust, implementing detection (GuardDuty, Macie, Inspector, Security Hub, Detective), data protection (KMS, Secrets Manager), and incident response (EventBridge, Incident Manager) via multi-account delegated admins.

SAP exam frequent mappings: (1) "Access via IAM without SSH/RDP + session logging" → **SSM Session Manager**, (2) "Auto-rotate DB password every 30 days + no downtime" → **Secrets Manager rotation** (not Parameter Store), (3) "Automate multi-step operational workflow" → **SSM Automation Document** (not Run Document), (4) "Who called the API?" → **CloudTrail**, (5) "Resource config change and compliance" → **Config**, (6) "Ban arbitrary infrastructure creation + self-service" → **Service Catalog**, (7) "Org-wide threat aggregation + auto-isolate" → **GuardDuty/Security Hub delegated admin + EventBridge + Lambda**, (8) "Instant rollback on deployment" → **Blue/Green**. Next day dives into Reliability and Performance Efficiency through distributed systems theory.

---

## 📝 연습 문제

**문제 1.** 한 회사가 관리자들이 production EC2에 디버깅을 위해 접속해야 하지만, SSH 포트(22)를 인터넷에 열거나 Bastion 호스트를 운영하고 싶지 않다. 또한 모든 접속 세션을 감사 로그로 남겨야 한다. 가장 적합한 솔루션은?

A) Bastion 호스트에 SSH 키 배포

B) SSM Session Manager로 IAM 권한 기반 접속, 세션을 CloudTrail·S3에 기록

C) Client VPN으로 VPC 접속 후 SSH

D) Direct Connect 전용선 구성

**정답: B**
해설: SSM Session Manager는 22 포트 개방이나 Bastion 없이 IAM 권한으로 셸을 열고, 모든 세션 로그를 CloudTrail·S3·CloudWatch Logs에 기록한다. 공격 표면이 0이고 감사가 자동이다. A(Bastion)는 22 포트와 SSH 키 관리 부담·공격 표면을 만든다. C(Client VPN)도 결국 SSH 포트가 필요하고 세션 기록이 자동이 아니다. D(Direct Connect)는 네트워크 연결 수단이지 접속·감사 솔루션이 아니다. 함정: "SSH 없이 + 세션 기록"은 Session Manager의 직답이다.

---

**문제 2.** 한 애플리케이션이 RDS를 사용하며, 보안 정책상 DB 비밀번호를 30일마다 자동으로 교체하되 애플리케이션 중단이 없어야 한다. 가장 적합한 솔루션은?

A) SSM Parameter Store(SecureString)에 비밀번호 저장

B) Secrets Manager에 비밀번호 저장 후 RDS 네이티브 통합으로 자동 로테이션 활성화

C) KMS로 비밀번호 암호화 후 S3에 저장

D) IAM 데이터베이스 인증으로 비밀번호 제거

**정답: B**
해설: Secrets Manager는 로테이션 Lambda를 스케줄로 자동 호출해 RDS 비밀번호를 무중단으로 교체하며(createSecret→setSecret→testSecret→finishSecret), 앱은 항상 AWSCURRENT 버전을 조회하므로 끊김이 없다. A(Parameter Store)는 비밀 저장은 되지만 자동 로테이션을 네이티브로 지원하지 않는다. C는 수동 관리로 자동 교체가 없다. D(IAM DB 인증)는 유효한 대안이나 "비밀번호 30일 자동 교체"라는 명시 요건에는 Secrets Manager가 직접 답이다. 함정: 자동 로테이션은 Parameter Store가 아니라 Secrets Manager다.

---

**문제 3.** 한 운영팀이 장애 발생 시 "EBS 스냅샷 생성 → AMI 빌드 → 새 인스턴스 교체 → 헬스 검증"의 여러 단계를 사람 개입 없이 자동 실행하는 런북을 만들고 싶다. Systems Manager의 어떤 기능이 적합한가?

A) Run Document(Command document)

B) Automation Document

C) Session Manager

D) Parameter Store

**정답: B**
해설: Automation Document는 여러 AWS API를 순서대로 엮는 다단계 워크플로(스냅샷→AMI→교체→검증)를 코드로 정의해 사고 대응·운영을 자동화한다. A(Run Document)는 EC2 안에서 단일 명령(셸 스크립트 등)을 실행하는 용도로 다단계 AWS API 오케스트레이션이 아니다. C는 셸 접속, D는 파라미터 저장이다. 함정: "여러 단계 워크플로 자동화"는 Automation Document, "인스턴스 내부 명령 실행"은 Run Document다.

---

**문제 4.** 2019년 Capital One 데이터 유출 사고의 근본 원인과 AWS의 대응으로 가장 정확한 것은?

A) AWS 데이터센터 물리 침입 → AWS가 펜스를 강화

B) SSRF로 EC2 메타데이터(v1)에서 IAM 자격증명 탈취 → IMDSv2(token 기반) 도입·권장

C) RDS 엔진 취약점 → AWS가 자동 패치

D) KMS 키 유출 → AWS가 키를 회전

**정답: B**
해설: 공격자는 잘못 구성된 WAF(고객 책임)를 통한 SSRF로 token 불필요한 메타데이터 서비스 v1에서 과도한 권한의 IAM 자격증명을 탈취해 S3를 읽었다. AWS 인프라(AWS 책임)는 뚫리지 않았다. 대응으로 token 기반 IMDSv2가 도입·권장됐고 GuardDuty에 탐지 패턴이 추가됐다. A·C·D는 사실과 다르며, 이 사고는 "고객 책임" 영역(WAF·IAM 구성)의 실패다. 함정: 책임 공유 모델에서 구성 실패는 고객 책임이며, 메타데이터 v1 → IMDSv2 전환이 핵심 교훈이다.

---

**문제 5.** 한 Organization이 50개 계정을 운영한다. 모든 계정의 위협 탐지(GuardDuty)와 보안 점수(Security Hub)를 중앙 보안팀이 한곳에서 보고, 위협 발생 시 자동으로 리소스를 격리하려 한다. 가장 적합한 설계는?

A) 각 멤버 계정이 개별적으로 GuardDuty·Security Hub를 보고 수동 대응

B) 전용 Security 계정을 GuardDuty·Security Hub 위임 관리자로 설정해 전 계정 결과를 중앙 집계하고, EventBridge + Lambda/SSM Automation으로 자동 격리

C) 관리 계정에서만 GuardDuty를 켜고 멤버 계정은 비활성

D) CloudTrail 로그를 수동으로 검토

**정답: B**
해설: 멀티 계정 보안의 표준은 전용 Security 계정을 위임 관리자로 지정해 GuardDuty·Security Hub·Macie 결과를 중앙 집계하고, EventBridge 규칙이 위협 이벤트를 받아 Lambda/SSM Automation으로 자동 격리(SG 교체·인스턴스 격리)하는 것이다. A는 사각지대·운영 부담이 크고, C는 멤버 계정 위협을 놓치며, D는 자동 대응이 없다. 함정: "중앙 집계 + 자동 대응"이 멀티 계정 보안 Pro 정답의 전형이며, 각 계정 분산 관리는 오답이다.

---

**문제 6.** 한 회사가 새 애플리케이션 버전을 배포할 때 위험을 최소화하고, 문제가 발견되면 즉시 이전 버전으로 전체 롤백하고 싶다. 두 환경을 동시에 운영할 비용 여력은 있다. 가장 적합한 배포 전략은?

A) Rolling 배포

B) Blue/Green 배포 (CodeDeploy)

C) In-place 단일 배포

D) 수동 콘솔 배포

**정답: B**
해설: Blue/Green은 새 환경(Green)을 통째로 띄우고 트래픽을 전환하며, 문제 시 Blue로 즉시 전체 롤백한다(가역성 최대, 두 환경 동시 운영 비용 발생). "위험 최소화 + 즉시 전체 롤백 + 비용 여력 있음" 요건에 정확히 맞는다. A(Rolling)는 순차 교체라 롤백이 느리다. C·D는 가역성·안전성이 낮다. 함정: "즉시 전체 롤백"은 Blue/Green, "소수 트래픽 점진 검증"은 Canary로 갈린다.

---