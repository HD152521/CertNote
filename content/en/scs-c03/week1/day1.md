# Day 1 - Shared Responsibility Model and SCS-C03's 6 Domains: The Big Picture for Security Engineers

Half of those starting AWS security certification for the first time think "AWS security = writing IAM policies well." If you go in with that mindset, you'll crumble facing SCS-C03's scenario questions. What this exam measures is not policy syntax, but **"at which layer does this threat lie, who is responsible, and what control blocks it?"** — a framework of thinking. The two pillars of that framework are the Shared Responsibility Model and the 6 exam domains.

Today we don't dig deep into any single tool. Instead, we draw a map to understand where every service you'll encounter over the next 12 weeks fits. GuardDuty, KMS, IAM, WAF, Macie, Config — once you grasp that each of these names represents "what kind of control at which responsibility boundary," the correct answers and trap answers in scenario questions will naturally diverge.

## Shared Responsibility Model: "of the cloud" vs "in the cloud"

AWS's Shared Responsibility Model can be summed in one sentence: **AWS is responsible for the security "of the cloud" (infrastructure), and customers are responsible for security "in the cloud" (their data and configurations).** It sounds abstract, but the boundary line is surprisingly sharp.

| Responsible Party | Scope of Responsibility | Examples |
|-----------|----------|------|
| **AWS (of the cloud)** | Hardware, physical facilities, network infrastructure, hypervisor, OS/patching of managed services | Data center access control, EC2 host firmware, S3 durability, RDS engine patching |
| **Customer (in the cloud)** | Data, IAM, OS·network configuration, encryption key management, applications | S3 bucket policies, EC2 guest OS patching, security group rules, KMS key rotation |

The key insight is that this boundary **moves depending on service type**.

- **IaaS (EC2)**: Customer responsibility is largest. Guest OS patching, middleware, firewalls — all customer's responsibility.
- **PaaS (RDS, Lambda)**: AWS owns OS·runtime patching; customer owns data, access control, and encryption configuration.
- **SaaS (S3, DynamoDB)**: AWS owns almost all infrastructure; customer owns only **data classification and access control**. Yet data responsibility never passes to AWS.

> 💡 **Related Theory**: This is called the "shifting line of responsibility." The same "patching" means EC2 OS patching is customer responsibility, but Fargate OS patching is AWS responsibility. In exam questions asking "whose responsibility," almost always the first step is to determine **whether the service is IaaS/PaaS/SaaS**. A trap answer like "patch the Lambda function's OS" — Lambda runtime OS is patched by AWS.

> ⚠️ **Trap**: In S3 data breach cases, "AWS is responsible" is always wrong. S3 durability and availability are AWS responsibility, but **setting the bucket to public (access control) is 100% customer responsibility**. The Capital One incident (2019) wasn't S3 itself being breached — it was customer-side IAM and WAF misconfiguration.

## Three Types of Controls: Preventive, Detective, Responsive

Security engineers must develop the habit of classifying all controls into three categories. SCS-C03's domain structure itself follows this classification.

| Type | Purpose | Question | AWS Example |
|------|------|------|----------|
| **Preventive** | Prevent incidents from happening | "Can we block this action from the start?" | IAM policies, SCP, security groups, KMS key policies, WAF |
| **Detective** | Detect what has happened | "Can we notice anomalies?" | CloudTrail, GuardDuty, Config, Security Hub, Macie |
| **Responsive** | Recover quickly after incidents | "How do we auto-respond to incidents?" | EventBridge → Lambda/SSM auto-remediation, backups |

> 🔍 **Deep Dive**: Mature security architecture stacks these three types **in layers (defense in depth)**. When prevention fails, detection catches it; when detection is slow, response mitigates damage. In exam scenarios asking "the best way to prevent this threat," answers combining "preventive + detective + auto-response" are often correct rather than single controls. However, when asking "first/immediate," preventive controls (SCP, key policies) are usually the answer.

## SCS-C03's 6 Domains Being Measured

The updated SCS-C03 (2024) has 65 questions, 170 minutes, and 750/1000 passing score. The exam blueprint specifies 6 domains and weightings.

| # | Domain | Weight | One-Line Summary |
|---|--------|--------|-----------|
| 1 | **Threat Detection and Incident Response** | 14% | Detect threats with GuardDuty·Detective, incident response playbooks, forensics |
| 2 | **Security Logging and Monitoring** | 18% | Gain visibility with CloudTrail·Config·CloudWatch·Security Hub |
| 3 | **Infrastructure Security** | 20% | Defend network boundaries with VPC·security groups·NACL·WAF·Shield |
| 4 | **Identity and Access Management** | 16% | IAM·STS·Identity Center·federation·policy evaluation |
| 5 | **Data Protection** | 18% | KMS·encryption·S3 protection·Secrets Manager·certificates |
| 6 | **Management and Security Governance** | 14% | Organizations·SCP·Control Tower·compliance·multi-account governance |

Looking at weights, **Domain 3 (infrastructure 20%) + Domain 2 (logging 18%) + Domain 5 (data 18%)** make up more than half the exam. But Domain 4 (IAM 16%) is **the prerequisite for all other domains**. KMS key policies operate on top of IAM evaluation logic, and cross-account logging works on top of AssumeRole. That's why Week 1 is entirely dedicated to IAM.

> 💡 **Related Theory**: The domains aren't 6 separate subjects to memorize — they're **one flow of thinking**. A threat arrives (D1 detect) → to see it, logs must exist (D2) → the entry point is the network (D3) → authorization inside is IAM (D4) → the protected asset is data (D5) → enforce all of this at organizational level (D6). Scenario questions usually bundle 2-3 domains together.

## Data Classification and Least Privilege: Two Starting Points of Security Incidents

In real operations, when you trace root causes of security incidents, they almost always come down to two things. One is **data that was never classified** — not knowing what or how much needs protection. The other is **excessive permissions**.

Data classification is the starting point of protective controls. Where are PII, payment information, health data? That's why Amazon Macie automatically classifies sensitive S3 data using ML. Without classification, you can't answer "does this bucket need KMS encryption?"

Least privilege is the heart of Domain 4 but permeates all domains. Least privilege in KMS key policies, S3 bucket policies, SCP. **"Grant permissions explicitly, revoke by default"** is the philosophy of IAM evaluation logic (we'll explore this deeply on Day 2).

> 📚 **Case Study**: In 2017, multiple companies storing PII in public-read S3 buckets led to large breaches (Verizon, Accenture, etc.). AWS introduced **S3 Block Public Access** in 2018 to stop this pattern, and since 2023 it's enabled by default on new buckets. This exemplifies "enforcement of preventive controls as platform defaults" in governance (Domain 6).

## Multi-Account and Governance: Blast Radius of Security

Why security engineers must move beyond single-account thinking is **blast radius**. If one account is compromised, you want it not to spread to other environments — accounts themselves become a boundary.

Standard multi-account security structure looks like this:

```
[ AWS Organizations Security Foundation ]

  Management Account (billing + SCP management, workload forbidden)
        |
   +----+----+----------------+--------------+
   |         |                |              |
 Security OU  Infrastructure  Workloads OU   Sandbox OU
   |              OU            (Prod/NonProd)
   +-- Log Archive Account (CloudTrail/Config logs immutable storage)
   +-- Audit/Security Tooling Account (GuardDuty·SecurityHub delegated administrator)
```

- **Log Archive Account**: Centralize CloudTrail·Config logs from all accounts; S3 Object Lock prevents tampering. Almost no one logs in here.
- **Security Tooling Account**: **Delegated administrator** for GuardDuty·Security Hub·Detective. See all organization security signals in one place.
- **SCP**: Doesn't grant permissions but **draws upper guardrails with deny**. Applies even to root (except management account root).

> 🔍 **Deep Dive**: GuardDuty, Security Hub, Macie, Config all support "delegated administrator" pattern. Don't operate directly from the management account — **delegate to Security Tooling Account**. This is best practice for least privilege — management account only does billing and org management; adding security operations authority there means when that account is compromised, the entire organization falls.

## Mapping Controls to Domain and Type

Practice classifying key services by the two axes you learned today (control type × responsibility boundary). When you have this table in mind, you can quickly filter trap answers in scenario questions.

| Service | Domain | Control Type | One-Line Role |
|--------|--------|----------|-----------|
| IAM / SCP | 4, 6 | Preventive | Restrict who can do what |
| KMS | 5 | Preventive | Control data access with encryption keys |
| Security Groups / NACL | 3 | Preventive | Filter network traffic |
| WAF / Shield | 3 | Preventive | Block web attacks·DDoS |
| CloudTrail | 2 | Detective | Audit log of API calls |
| GuardDuty | 1, 2 | Detective | ML-based threat detection |
| Config | 2, 6 | Detective | Assess resource compliance |
| Macie | 5, 2 | Detective | Classify sensitive S3 data |
| Security Hub | 2, 1 | Detective | Aggregate findings·run standard checks |
| EventBridge + SSM/Lambda | 1 | Responsive | Auto-remediation |

> 🎯 **Scenario**: "PII in S3 bucket found stored without encryption. What control combination prevents recurrence?" Not a single answer. **Detective** (Macie finds sensitive data + Config rule `s3-bucket-server-side-encryption-enabled`) + **Preventive** (SCP blocks unencrypted PutObject, S3 Block Public Access) + **Responsive** (EventBridge → Lambda auto-encrypt/quarantine). Thinking of all three types at once is how SCS-C03 thinks.

## Summary — The Map Ahead

Remember three pictures we drew today. First, **the Shared Responsibility Model** has a moving boundary depending on service type (IaaS/PaaS/SaaS), but data and access control are always customer responsibility. Second, all controls fall into **three types — preventive, detective, responsive** — and mature architecture stacks them in layers. Third, **the 6 domains** aren't separate subjects to memorize but flow from threat → visibility → network → identity → data → governance — one chain of thinking.

Starting tomorrow, we enter IAM, the spine of that chain. Once you understand what users, groups, roles, and policies are, and exactly how AWS's evaluation logic decides whether to allow or deny a request, you'll start seeing how every other domain rests on top of that foundation.

---

## 📝 연습 문제

**문제 1.** 한 회사가 Amazon RDS for PostgreSQL을 사용 중이다. 공동 책임 모델에서 **AWS의 책임**에 해당하는 것은?

A) 데이터베이스에 저장되는 PII의 분류와 암호화 활성화 결정  
B) 데이터베이스 사용자 계정과 IAM 인증 정책 구성  
C) 데이터베이스 엔진의 보안 패치 적용  
D) 보안 그룹으로 DB 포트 접근을 제한하는 설정  

**정답: C**  
해설: RDS는 관리형(PaaS) 서비스라서 엔진·OS의 패치는 AWS가 책임진다(고객은 유지보수 윈도우만 관리). 데이터 분류·암호화 활성화 여부, DB 사용자/IAM 인증, 보안 그룹 설정은 모두 "클라우드 안(in the cloud)"의 고객 책임이다. 데이터와 접근제어는 어떤 서비스 유형에서도 AWS로 넘어가지 않는다는 점이 핵심이다.

---

**문제 2.** 다음 중 **예방(preventive) 통제**가 아닌 것은?

A) SCP로 특정 리전 외 EC2 실행을 deny  
B) KMS 키 정책으로 특정 계정만 복호화 허용  
C) GuardDuty로 비정상 API 호출 패턴을 탐지  
D) 보안 그룹으로 인바운드 트래픽을 443만 허용  

**정답: C**  
해설: GuardDuty는 이미 발생한(또는 발생 중인) 위협을 알아채는 탐지(detective) 통제다. SCP·KMS 키 정책·보안 그룹은 모두 행위가 일어나기 전에 막는 예방 통제다. "탐지"는 사고를 막지 못하고 알아챌 뿐이라는 차이가 통제 유형 분류의 핵심이며, 시험에서 "가장 먼저 사고를 막을 방법"을 물으면 예방 통제가 답이 된다.

---

**문제 3.** SCS-C03 도메인 중 가중치가 가장 높은 영역과, 그 영역이 다루는 주제로 가장 적절한 조합은?

A) Identity and Access Management — KMS 키 회전 정책  
B) Infrastructure Security — VPC·보안 그룹·WAF 등 네트워크 경계 방어  
C) Data Protection — Organizations SCP로 조직 거버넌스  
D) Threat Detection and Incident Response — CloudTrail 로그 보존 정책  

**정답: B**  
해설: 가중치가 가장 높은 도메인은 Infrastructure Security(20%)이고, VPC·보안 그룹·NACL·WAF·Shield 같은 네트워크 경계 방어를 다룬다. KMS는 Data Protection, SCP는 Management and Governance, CloudTrail 보존은 Logging and Monitoring 영역으로, 나머지 보기는 도메인과 주제가 어긋나 있다.

---

**문제 4.** 멀티 계정 환경에서 GuardDuty와 Security Hub를 운영할 때 AWS 모범 사례로 가장 적절한 것은?

A) Management 계정에서 직접 GuardDuty와 Security Hub를 운영한다  
B) 각 워크로드 계정이 독립적으로 GuardDuty를 켜고 개별 관리한다  
C) 별도의 Security Tooling 계정을 delegated administrator로 지정해 조직 전체를 집계한다  
D) Log Archive 계정에서 GuardDuty를 운영해 로그와 탐지를 한곳에 둔다  

**정답: C**  
해설: GuardDuty·Security Hub·Macie·Config는 delegated administrator(위임 관리자) 패턴을 지원하며, 전용 Security Tooling 계정에 위임하는 것이 모범 사례다. Management 계정은 billing·조직 관리만 맡아야 폭발 반경이 작아지고, 워크로드 계정별 개별 운영은 가시성이 파편화된다. Log Archive 계정은 로그 불변 저장 전용이라 보안 운영 도구를 두지 않는다.

---

**문제 5.** S3 버킷의 PII가 외부에 유출되는 사고가 발생했다. 조사 결과 버킷이 public-read로 설정돼 있었다. 공동 책임 모델 관점에서 가장 정확한 판단은?

A) S3 인프라가 뚫린 것이므로 AWS의 책임이다  
B) 버킷 접근제어 설정은 고객 책임이므로 고객의 구성 오류다  
C) 데이터 내구성 문제이므로 AWS와 고객이 절반씩 책임진다  
D) S3는 SaaS이므로 데이터 보호 책임 전부가 AWS에 있다  

**정답: B**  
해설: S3의 내구성·가용성·물리 인프라는 AWS 책임이지만, 버킷 정책·ACL·Block Public Access 같은 접근제어 설정은 100% 고객 책임이다. SaaS 성격이 강한 S3라도 데이터 분류와 접근제어 책임은 절대 AWS로 넘어가지 않는다. 이런 사고를 막기 위해 AWS는 Block Public Access를 기본 통제로 강제하는 방향으로 발전시켰다.

---
