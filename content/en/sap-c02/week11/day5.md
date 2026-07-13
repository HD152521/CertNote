# Day 5 - Integrated Security: Encryption·Detection·Unified Monitoring·Edge Defense in One Scenario

AWS security doesn't end with a single service. Everything we saw in Week 11 **stacks into 4 layers** — **encryption (KMS·CloudHSM)**, **detection (Macie·GuardDuty·Inspector)**, **unified monitoring (Security Hub·Detective·Audit Manager)**, **edge defense (WAF·Shield·Firewall Manager·Network Firewall·DNS Firewall)**. Production-grade security only completes when these 4 layers combine organically. And SAP-C02 exam security scenarios **almost always have multiple layers appearing simultaneously in one question** — "encrypt the data (L1), detect threats (L2), investigate incidents (L3), defend the edge (L4)."

Today we integrate these 4 layers into one scenario for review, and nail down the most frequently conflicting traps in Pro exams (Macie vs GuardDuty vs Inspector, Shield Standard vs Advanced, Network Firewall vs DNS Firewall, Security Hub vs Detective vs Audit Manager) with keyword → correct answer mapping. The core is "similar names, different roles."

## 4-Layer Security Big Picture

```
[Internet]
    │
─── L4 Edge Defense ──────────────────────────────────
   Route 53(DNS Firewall) → CloudFront(WAF+Shield) → ALB(WAF)
   → VPC(Network Firewall) / Firewall Manager(Org bulk)
    │
─── L1 Encryption ────────────────────────────────────
   KMS(Envelope Encryption·MRK) / CloudHSM(FIPS L3) — protect data at rest·in transit
    │
─── L2 Detection ──────────────────────────────────────
   Macie(S3 content) / GuardDuty(behavior) / Inspector(vulnerabilities)
    │
─── L3 Unified Monitoring ─────────────────────────────
   Security Hub(current posture) / Detective(past investigation) / Audit Manager(compliance proof)
   ── Foundation: Config(setting evaluation) + CloudTrail(API logs)
```

> 💡 **Related Theory**: This 4-layer structure implements security's **defense in depth** principle. NIST SP 800-53 and cyber kill chain models commonly emphasize — assuming single controls are always penetrable, you stack multiple independent layers so if one layer breaks, the next blocks. The 2019 Capital One breach paradoxically proves this: WAF misconfiguration (L4) → SSRF stealing IMDS credentials → bulk S3 exfiltration. If GuardDuty (L2, anomalous behavior detection) and stricter IAM least privilege had worked together, the chain would have been broken. Pro exams ask "multiple layers in one scenario" for this reason — real-world security doesn't end with one layer.

## Layer 1: Encryption — KMS · CloudHSM

| Type | Key Ownership | Auto Rotation | Core Use |
|------|---------|----------------|-----------|
| AWS Managed Key | AWS | 1yr auto (forced) | Service default encryption |
| Customer Managed Key (CMK) | Customer | Activatable | Policy·rotation·audit control |
| Multi-Region Key (MRK) | Customer | Possible | Cross-Region DR·decryption |
| Imported (BYOK) | Customer(external) | **Not possible** | Key origin control·compliance |
| CloudHSM-backed | Customer(dedicated HSM) | Possible | FIPS 140-2 L3·single tenant |

Key reaffirmation — KMS uses **envelope encryption**. The master key (CMK) never leaves HSM, the DEK received via `GenerateDataKey` locally encrypts actual data, and only the encrypted DEK is stored with data. Permissions check with **Key Policy (root) + IAM delegation + Grant (temporary)** triple-check.

> 🔍 **Deeper Dive**: Choosing KMS key type is trading "control vs operational burden." AWS Managed Key has 0 operational burden but nearly no policy/rotation control. CMK gives full control but comes with $1/month per key and policy management responsibility. BYOK completely controls key origin but sacrifices auto rotation. CloudHSM gives single tenant/FIPS L3 but carries cluster operations (HA, backup, user management) burden. The exam asks about this trade-off balance point — "policy/audit control" means CMK, "external creation+expiry" means BYOK, "single tenant+L3" means CloudHSM, no special requirements means defaults are best.

> 📚 **Case Study**: A fintech imported keys created from their own HSM into KMS via BYOK, keeping key material permanently in their HSM (AWS can't permanently recover; KMS only caches, deletes on expiry). Advantage: key origin fully controlled. Disadvantage: no auto rotation — had to manually re-import each rotation. Lesson: BYOK is trading control gain for operational burden and loss of auto rotation.

> ⚠️ **Trap**: "Grant permissions with IAM Policy only" is wrong. Without IAM delegation in Key Policy to account root, IAM permissions are ineffective. Also "immediately delete key" isn't possible — KMS enforces 7-30 day PendingDeletion grace (key deletion = permanent data loss).

## Layer 2: Detection Trinity — Content · Behavior · Defects

| Service | Sees | Data Source | Method |
|--------|------|------------|------|
| **Macie** | S3 object **content** (PII/PCI) | S3 object bytes | ML content classification |
| **GuardDuty** | Account·network **behavior** | VPC FL·CloudTrail·DNS | Threat intel + ML |
| **Inspector v2** | Software **defects** (CVE) | EC2·ECR·Lambda inventory | CVE database matching |

These three have **non-overlapping data sources** — Macie is object bytes, GuardDuty is logs, Inspector is inventory. This difference determines the correct answer.

> 🎯 **Scenario**: "Does S3 bucket contain credit card numbers" → **Macie** (content inspection). "EC2 communicates with known malicious IP" → **GuardDuty** (network behavior). "EC2 OS missing patch CVE scan" → **Inspector v2** (vulnerability DB). "Abnormal access behavior to S3" → **GuardDuty S3 Protection** (not Macie — it's behavior, not content).

> 🔍 **Deeper Dive**: GuardDuty's Protection modules are opt-in with separate billing each — S3 Protection (access anomalies), Malware Protection (EBS snapshot scan, no agent required), EKS Protection (Kubernetes audit+runtime), RDS Protection (DB login anomalies), Lambda Protection (network anomalies). In exams, "EKS runtime suspicious behavior" means EKS Protection, "EC2 malware scan without agent" means Malware Protection. GuardDuty's agent-less operation comes from "analyzing logs AWS already collects."

> 📚 **Case Study**: When Log4Shell (CVE-2021-44228) hit in December 2021, "where in our infrastructure is vulnerable Log4j" itself was the challenge. Organizations with Inspector v2 enabled could **automatically identify all affected resources (EC2, ECR images, Lambda layers) without additional scanning** as soon as the new CVE registered in NVD. Lesson: vulnerability response's first step is "knowing where it is," and continuous scanning + auto re-evaluation determines 0-day response speed. But Inspector detects only; Patch Manager applies patches.

> ⚠️ **Trap**: The misconception that "Inspector applies patches." Inspector **detects and assesses only** ("this instance has this CVE"). **Patch application** is **Systems Manager Patch Manager's** job (complementary). "Find vulnerability" = Inspector, "patch found" = Patch Manager.

## Layer 3: Unified Monitoring — Current · Past · Proof

| Service | Tense | Role |
|--------|------|------|
| **Security Hub** | Current | CSPM·standards checks (CIS/PCI/NIST) + Finding integration (ASFF) |
| **Detective** | Past | Graph-based incident investigation·root cause |
| **Audit Manager** | Proof | Auto-collect compliance evidence·audit reports |

Security Hub asks "are we meeting standards now," Detective asks "how did this incident happen," Audit Manager asks "how do we prove compliance." All three use **Config (setting evaluation)** and **CloudTrail (API logs)** as data foundations.

> 💡 **Related Theory**: Security Hub belongs to **CSPM (Cloud Security Posture Management)** category (third-party: Wiz, Prisma Cloud, Lacework). CSPM's essence is "configuration drift detection + standards violation identification." Many Security Hub standards checks are implemented internally as **Config Rules**, so Config being inactive makes checks show "No data" — frequent exam trap. Config is the evaluation engine; Security Hub is the layer above aggregating and standardizing results from security perspective.

> 🔍 **Deeper Dive**: Audit Manager's decisive difference from Security Hub is **point-in-time vs continuous**. Security Hub sees "right now." Audits demand "sustained compliance during the period" — you can't fix settings just before audit and prove compliance. Audit needs timestamp evidence that controls worked throughout the period. Audit Manager accumulates evidence over time. "Real-time checks" = Security Hub, "period evidence+reports" = Audit Manager.

> 📚 **Case Study**: A healthcare SaaS wasted 3-4 weeks per HIPAA audit having engineers manually capture evidence. After enabling Audit Manager's HIPAA framework, control-mapped evidence from CloudTrail, Config, Security Hub **automatically accumulated with timestamps**, report generation became one button click. Prep time dropped to days. Lesson: audit cost is "proving compliance (evidence collection)," not "maintaining controls."

## Layer 4: Edge and DDoS Defense — Blocking by Layer

| Service | Layer | Targets | Core |
|--------|------|-----------|------|
| **WAF** | L7 | CloudFront·ALB·APIGW·AppSync·App Runner·Cognito | OWASP Managed Rule·Rate-Based |
| **Shield Standard** | L3/L4 | All AWS resources (free) | volumetric/protocol auto mitigation |
| **Shield Advanced** | L3-7 | Designated resources ($3,000/month~) | L7+Cost Protection+SRT 24/7 |
| **Firewall Manager** | Policy | Organization-wide | bulk deployment·auto·drift correction |
| **Network Firewall** | L3-7 | VPC internal | IDS/IPS·TLS Inspection (Suricata) |
| **DNS Firewall** | DNS | VPC-egress queries | block malicious domains (name-based) |

> 💡 **Related Theory**: DDoS divides by OSI layer — Volumetric/Protocol (L3/L4, Shield), Application (L7, Shield Advanced+WAF Rate-Based). Following the principle "block at lower layers before reaching higher layers," Shield absorbs volumetric attacks at AWS edge to prevent application reach. The exam's first question is always "what layer is this attack?"

> 🎯 **Scenario**: "L7 HTTP flood DDoS + auto scale-out cost spike + no specialist during attack" → **Shield Advanced** (L7 protection + Cost Protection waives charges + SRT 24/7). Standard lacks L7 protection+Cost Protection. WAF alone lacks auto DDoS mitigation and cost protection.

> 📚 **Case Study**: In 2020, AWS Shield mitigated record-scale DDoS (approx 2.3 Tbps CLDAP reflection amplification). Such massive volumetric attacks can't be absorbed by single data centers and need AWS's global edge capacity (tens of Tbps). Lesson: volumetric DDoS defense's essence is "absorption capacity exceeding attack," hardest for individuals to build themselves.

> ⚠️ **Trap**: Firewall Manager vs SCP vs Config. **Firewall Manager** = proactively deploy security policies (WAF/Shield/SG/NWF), **SCP** = forbid actions (denial guardrails), **Config** = assess non-compliance. "Org-wide WAF policy + new accounts auto" is Firewall Manager.

## Security Keyword → Answer Mapping (Pre-Exam Memorization Table)

| Keyword | Answer | Layer |
|--------|--------|--------|
| "Envelope encryption·large data + KMS" | GenerateDataKey + DEK | L1 |
| "Multi-Region same-key decrypt·DR" | MRK | L1 |
| "External-created key + expiry + no-rotation" | Imported(BYOK) | L1 |
| "FIPS 140-2 L3 + single tenant" | CloudHSM / Custom Key Store | L1 |
| "Permission via IAM only" | Wrong (Key Policy delegation required) | L1 |
| "Delete key immediately" | Impossible (7~30d PendingDeletion) | L1 |
| "S3 content PII/card numbers" | Macie | L2 |
| "S3 abnormal access behavior" | GuardDuty S3 Protection | L2 |
| "EC2 ↔ malicious IP·credential theft" | GuardDuty | L2 |
| "EC2·ECR·Lambda CVE detection" | Inspector v2 | L2 |
| "Apply patches to detected vulnerabilities" | Patch Manager | L2 |
| "EKS runtime suspected behavior" | GuardDuty EKS Protection | L2 |
| "EC2 malware scan without agent" | GuardDuty Malware Protection | L2 |
| "CIS/PCI standards auto-check + integration" | Security Hub | L3 |
| "Incident timeline graph investigation" | Detective | L3 |
| "HIPAA audit evidence auto-collect·report" | Audit Manager | L3 |
| "Resource non-compliance auto-evaluation" | Config Rule | L3 |
| "CloudTrail event SQL query" | CloudTrail Lake | L3 |
| "OWASP immediate protection + minimal ops" | WAF Managed Rule Groups | L4 |
| "L7 DDoS + Cost Protection + SRT" | Shield Advanced | L4 |
| "Org-wide WAF/SG policy auto" | Firewall Manager | L4 |
| "VPC internal IDS/IPS + TLS Inspection" | Network Firewall | L4 |
| "VPC internal malicious domain blocking" | DNS Firewall | L4 |
| "Block specific country" | WAF Geo Match | L4 |
| "Single IP L7 flood/brute force" | WAF Rate-Based | L4 |
| "EC2 access without SSH" | SSM Session Manager | - |
| "Auto-rotate Secrets" | Secrets Manager | - |

## Summary

AWS security combines 4 layers (encryption → detection → unified monitoring → edge defense). Within each layer, similar names serve different roles — Macie (content) vs GuardDuty (behavior) vs Inspector (defects), Security Hub (current) vs Detective (past) vs Audit Manager (proof), Shield Standard (L3/4) vs Advanced (L7+cost protection), Network Firewall (VPC traffic) vs DNS Firewall (domain names). Pro exams have multiple layers appearing simultaneously, so you need keyword → answer mapping memorized for instant recall and training to think of all 4 layers at once.

Next week (Week 12) is **Cost Optimization Deep-Dive** — Savings Plans math, Compute Optimizer, Cost Explorer, hidden cost areas like S3·NAT Gateway.

---

## 📝 연습 문제

**문제 1.** 멀티 리전 RDS 스냅샷을 두 리전에서 모두 복호화하며 DR 환경을 구성해야 한다. 추가 KMS 호출이나 re-encrypt 없이 즉시 복원하고, 리전별 키 접근 권한은 따로 통제하고 싶다.

A) Cross-Region Copy + 매번 re-encrypt

B) Multi-Region Key (Primary + Replica)

C) AWS Managed Key

D) BYOK를 두 리전에 각각 import

**정답: B**

**해설:** MRK는 같은 키 머터리얼을 여러 리전에 복제하고 키 ID가 동일해, 한 리전의 ciphertext를 다른 리전 Replica로 직접 복호화한다. 리전별 Key Policy로 접근 통제도 분리된다. A는 리전 종속이라 비효율적. C는 정책·회전 통제 불가, 리전 종속. D는 두 import 키가 서로 다른 키가 되어 동일 ciphertext를 양쪽에서 복호화 못 하고 자동 로테이션도 불가. 함정: "Cross-Region 동일 키 복호화 + DR"은 MRK.

---

**문제 2.** S3 버킷에 카드 번호·SSN이 저장된 적 있는지 자동 탐지·분류하고 버킷별 민감도를 우선순위화해야 한다.

A) Inspector v2

B) Macie

C) GuardDuty S3 Protection

D) Config Rule

**정답: B**

**해설:** Macie는 ML로 S3 객체 내용을 스캔해 PII/PCI를 분류하고 민감도 점수를 매긴다. A(Inspector)는 EC2·ECR·Lambda CVE 취약점. C(GuardDuty S3 Protection)는 "접근 행동의 이상"이지 콘텐츠 검사가 아니다. D(Config)는 설정 평가이지 객체 내용 분류가 아니다. 함정: "S3 내용에 민감 데이터"=Macie, "S3 접근 행동 이상"=GuardDuty.

---

**문제 3.** EC2·컨테이너 이미지(ECR)·Lambda에서 알려진 CVE를 지속 자동 탐지하고, 신규 CVE 공개 시 추가 스캔 없이 자동 재평가되어야 한다.

A) Inspector v2

B) Patch Manager

C) GuardDuty

D) Macie

**정답: A**

**해설:** Inspector v2는 EC2·ECR·Lambda 인벤토리를 CVE DB와 지속 대조하고 신규 CVE 등록 시 자동 재평가한다. B(Patch Manager)는 패치 "적용"이지 취약점 "탐지·평가"가 아니다(보완 관계). C(GuardDuty)는 행동·위협 탐지이지 CVE 평가가 아니다. D(Macie)는 S3 데이터. 함정: "CVE 자동 탐지·재평가"=Inspector, "패치 적용"=Patch Manager.

---

**문제 4.** EC2가 알려진 악성 IP와 통신하고 평소 안 쓰던 리전에서 IAM 자격 증명이 사용되는 등 이상 행동을 에이전트 없이 탐지해야 한다.

A) Inspector v2

B) GuardDuty

C) Macie

D) WAF

**정답: B**

**해설:** GuardDuty는 VPC FL·CloudTrail·DNS를 분석하고 위협 인텔(악성 IP)+ML 행동 베이스라이닝으로 이상을 탐지하며 에이전트가 필요 없다. A는 CVE 평가, C는 S3 데이터, D는 L7 웹 필터. 함정: "악성 IP 통신·비정상 행동·에이전트 없음"=GuardDuty.

---

**문제 5.** 30개 계정에서 CIS·PCI 표준 준수 현황을 자동 점검하고 GuardDuty·Inspector·Macie Finding을 단일 대시보드로 통합하려 한다.

A) Trusted Advisor

B) Security Hub (Org 위임 관리자)

C) Audit Manager

D) Detective

**정답: B**

**해설:** Security Hub는 CIS·PCI·NIST 표준을 자동 점검하고 모든 보안 Finding을 ASFF로 통합하며 Org 위임 관리자로 전 계정을 관리한다. A는 일반 모범 사례 점검이지 보안 표준 통합 허브가 아니다. C는 감사 증거 수집이지 실시간 점검·대시보드가 아니다. D는 사건 조사. 함정: "표준 자동 점검 + Finding 통합 대시보드"=Security Hub.

---

**문제 6.** GuardDuty가 EC2 자격 증명 탈취 의심을 탐지했다. 이 인스턴스가 언제부터 어떤 자격 증명으로 어떤 리소스와 통신했는지 시계열 그래프로 깊이 조사해 근본 원인을 파악해야 한다.

A) CloudTrail 콘솔 수동 검색

B) Detective

C) X-Ray

D) Macie

**정답: B**

**해설:** Detective는 VPC FL·CloudTrail·GuardDuty Finding을 통합해 행동 그래프를 만들고 엔티티 관계·시간축을 시각화해 근본 원인 조사를 돕는다(Finding에서 바로 점프). A는 수동 조인이라 느리고 누락이 쉽다. C는 앱 분산 추적. D는 S3 데이터. 함정: "사건 시계열·관계 시각화·근본 원인"=Detective.

---

**문제 7.** L7 HTTP flood DDoS를 받았고, 그로 인한 자동 스케일 아웃 요금 폭증을 면제받고 싶으며, 공격 중 24/7 전문가 지원이 필요하다.

A) Shield Standard

B) Shield Advanced

C) WAF Rate-Based만

D) CloudFront만

**정답: B**

**해설:** Shield Advanced는 L7 DDoS 보호 + Cost Protection(요금 면제) + SRT 24/7을 모두 제공한다. A는 무료지만 L3/4만, L7·Cost Protection·SRT 없음. C는 L7 완화에 일부 도움되나 비용 보호·전문가 지원 없음. D는 캐싱·배포이지 DDoS 비용 보호가 아니다. 함정: "L7 DDoS + Cost Protection + SRT" 세 키워드는 Shield Advanced 전용.

---

**문제 8.** VPC 내부 트래픽에 IDS/IPS를 적용하고 암호화 트래픽도 복호화해 검사(TLS Inspection)해야 한다.

A) WAF

B) Network Firewall

C) Shield

D) GuardDuty

**정답: B**

**해설:** Network Firewall은 Suricata 룰 기반 L3-7 IDS/IPS로 VPC 내부 트래픽을 inline 검사하고 TLS Inspection을 지원한다. A(WAF)는 엣지 L7 웹만, VPC 전반·TLS Inspection 불가. C(Shield)는 DDoS 방어. D(GuardDuty)는 로그 기반 탐지이지 inline IPS·TLS Inspection이 아니다. 함정: "VPC 내부 IDS/IPS + TLS Inspection"=Network Firewall.

---

**문제 9.** VPC 내 EC2가 멀웨어 C2 서버나 알려진 악성 도메인에 접근하지 못하게 이름 해석 단계에서 차단하고 싶다.

A) NACL로 IP 차단

B) WAF

C) Route 53 Resolver DNS Firewall

D) Security Group

**정답: C**

**해설:** DNS Firewall은 VPC 출발 DNS 쿼리를 악성 도메인 리스트로 차단해 이름 해석 단계에서 C2·악성 도메인 접근을 막는다. A·D(NACL/SG)는 IP 기반인데 악성 도메인 IP가 수시로 바뀌어 부적합. B(WAF)는 인바운드 L7 웹 필터이지 아웃바운드 DNS 차단이 아니다. 함정: "악성 도메인 차단(이름 기반)"=DNS Firewall.

---

**문제 10.** 500개 계정 Organization의 모든 인터넷 향 ALB에 동일 WAF Managed Rule을 적용하고, 신규 계정·리소스에도 자동 적용하며, 누군가 WAF를 끄면 자동 탐지·시정하고 싶다.

A) AWS Config Rule

B) Firewall Manager

C) SCP

D) Control Tower

**정답: B**

**해설:** Firewall Manager는 Org 단위로 WAF·Shield·SG·Network Firewall 정책을 일괄 배포하고 신규 계정·리소스에 자동 적용하며 드리프트를 자동 시정한다. A(Config)는 비준수 평가가 본업이지 능동 배포가 아니다. C(SCP)는 행위 금지(거부)이지 정책 배포가 아니다. D(Control Tower)는 랜딩 존 거버넌스. 함정: "보안 정책 멀티 계정 배포 + 신규 자동 + 드리프트 시정"=Firewall Manager.

---

**문제 11.** 단일 테넌트 전용 HSM에서 FIPS 140-2 Level 3 키 관리가 필요하면서, 개발팀은 기존 KMS API(`Encrypt`/`Decrypt`)를 그대로 쓰고 싶다.

A) 순수 KMS CMK(멀티 테넌트)

B) KMS Custom Key Store + CloudHSM

C) Secrets Manager

D) Imported Key Material

**정답: B**

**해설:** Custom Key Store는 KMS API를 유지하면서 실제 키를 고객 전용 CloudHSM(단일 테넌트·FIPS L3)에만 보관한다. A는 멀티 테넌트라 단일 테넌트 L3 요건 미달. C는 비밀 저장소이지 HSM 키 관리가 아니다. D는 import 키도 KMS 멀티 테넌트 HSM에 저장되어 단일 테넌트 요건 미달. 함정: "단일 테넌트 + FIPS L3 + KMS API 유지"=Custom Key Store + CloudHSM.

---

**문제 12.** 연 1회 HIPAA 감사를 위해 통제별 증거(접근 로그·암호화 설정·백업 정책 등)를 감사 기간에 걸쳐 자동 수집하고 감사관 제출용 보고서를 생성해야 한다.

A) Security Hub

B) Audit Manager

C) Detective

D) Config

**정답: B**

**해설:** Audit Manager는 HIPAA 등 프레임워크의 통제별로 CloudTrail·Config·Security Hub 증거를 자동 수집·축적하고 감사 보고서를 생성한다. A(Security Hub)는 현재 시점 표준 점검이지 기간 증거 축적·보고서 자동화가 아니다. C(Detective)는 사건 조사. D(Config)는 평가 엔진(증거 소스 역할)이지 보고서 패키징이 아니다. 함정: "감사 증거 자동 수집 + 보고서"=Audit Manager, "실시간 점검"=Security Hub.

---

## 📌 Today's Summary

AWS security combines 4 organic layers: **L1 Encryption** (KMS·CloudHSM protect data, MRK for multi-region), **L2 Detection** (Macie content·GuardDuty behavior·Inspector defects, non-overlapping data sources), **L3 Unified Monitoring** (Security Hub current·Detective past·Audit Manager proof, all grounded in Config + CloudTrail), **L4 Edge Defense** (Shield DDoS·WAF L7·Network Firewall VPC·DNS Firewall domains). Each layer handles one piece, similar names mean different roles. Pro exams combine all 4 layers into single scenarios — practice keyword-to-answer mapping at instant-recall speed and thinking about all 4 together.

Next week: **Cost Optimization Deep-Dive** — Savings Plans mechanics, Compute Optimizer, Cost Explorer, hidden costs.
