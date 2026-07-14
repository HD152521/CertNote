# Day 4 - Audit Manager, Macie, Inspector: Evidence Automation, Data Classification, Vulnerability Scanning Principles

The last piece of the security automation stack is offloading to machines "the three things humans most hate doing." Compliance audit season's manual screenshot and log collection, finding buried SSNs and card numbers in petabyte-scale data lakes, and cross-referencing thousands of incoming CVEs against thousands of workloads. Audit Manager, Macie, and Inspector handle these three respectively. From the console they look like "plug-and-play compliance and security tools," but beneath lies the philosophy of continuous compliance, machine-learning-based data classification with pattern matching, the history of CVE/CVSS vulnerability standardization, and proving least privilege with IAM data. Today we examine what each does internally and how IAM Access Analyzer, Firewall Manager, and CloudTrail Lake complete the overall security automation stack.

In the DOP exam, this domain appears as "automated audit evidence collection + sensitive data discovery + vulnerability management + external exposure detection," with scenarios like "collect SOC2 audit evidence continuously," "auto-discover PII in S3," "scan container images for dependency CVEs at push," and "find resources exposed to external accounts." Distinguishing each tool's role boundaries reveals the answers.

## Continuous Compliance — Transforming Audit from Event to State

Traditional compliance audits were **events** — auditors would arrive quarterly or annually, collect evidence at that point in time, evaluate, and leave. Two problems: First, no one knows the actual state between audits (point-in-time illusion). Second, evidence collection is manual drudgery, expensive and error-prone — taking screenshots, capturing policies, exporting logs, pasting into spreadsheets.

**Continuous compliance** transforms this into **state** — evidence is collected continuously and automatically, so "are we SOC2-compliant right now" can be answered with data at any moment. This is the compliance version of DevOps transforming "release as event" into "continuous delivery flow." Audit Manager is the tool enabling this transition.

> 💡 **Related Theory**: Continuous compliance is the cloud-native evolution of **GRC (Governance, Risk, Compliance)**. Traditional GRC tools (Archer, ServiceNow GRC) required humans to input and manage controls, evidence, and risks. In the cloud, evidence is API-exposed (Config, CloudTrail, Security Hub already know state), so evidence collection can be automated. The core concept is **mapping controls to evidence** — regulatory frameworks (SOC2's trust service criteria, HIPAA's security rules) define abstract controls ("access must follow least privilege"), and concrete evidence proving compliance (IAM policy snapshots, access logs) is automatically collected and mapped. This mapping bridges "abstract regulation → concrete technical evidence," and Audit Manager's Framework pre-lays this bridge.

## AWS Audit Manager — Auto-Mapping Evidence to Controls

Audit Manager provides pre-defined **Frameworks** (SOC2, HIPAA, PCI DSS, GDPR, ISO 27001, etc.). A Framework contains the regulatory controls, and for each control, **evidence is automatically collected** — pulling evidence from CloudTrail (API activity), Config (resource state), and Security Hub (security findings) and mapping it to the control. Custom Frameworks can also be created, and ultimately an **Assessment Report** is generated for auditors.

```bash
aws auditmanager create-assessment --name SOC2-2026 \
  --framework-id <framework-id> \
  --assessment-reports-destination destinationType=S3,destination=s3://audit-reports/ \
  --roles roleType=PROCESS_OWNER,roleArn=arn:aws:iam::...:role/AuditOwner \
  --scope '{"awsAccounts":[{"id":"PROD-ACCT"}]}'
```

> ⚠️ **Pitfall**: Don't confuse Audit Manager with Security Hub/Config roles. **Config/Security Hub evaluate "are we compliant right now" and remediate violations** — they're operational tools. **Audit Manager collects and organizes evidence to prove compliance to auditors** — it's an audit preparation tool. If Config says "S3 is encrypted," Audit Manager says "S3 is encrypted — here's the evidence (Config snapshot, CloudTrail logs) attached to the relevant SOC2 control, packaged in a report." In exams: "auto-fix violations" is Config; "auto-collect audit evidence and create reports" is Audit Manager.

## Amazon Macie — Pattern Matching and ML for Data Classification

Macie automatically discovers **sensitive data** in S3 objects. It classifies data using pre-defined identifiers (credit card numbers, U.S. SSNs, passport numbers, medical records, etc.) and custom identifiers (regex), emitting Findings to Security Hub when discovered.

The core mechanism is two-layered. **Deterministic pattern matching** (regex + validation algorithms) catches structured identifiers like card numbers and SSNs, while **machine learning and contextual analysis** makes non-structural judgments like "does this text block look like a medical record?"

> 🔍 **Deeper**: Credit card detection shows the sophistication of data classification. Card numbers must satisfy the **Luhn algorithm** (1954, Hans Peter Luhn at IBM, ISO/IEC 7812 standardized) — a checksum where the last digit (check digit) must match a value computed from preceding digits. Macie finds 16-digit patterns, then runs Luhn validation to filter false positives (accidentally 16-digit numbers like order IDs). SSNs also validate against issuance rules. This "pattern + validation" dual structure determines classification accuracy — pattern alone causes false positive explosions. This exemplifies the classic text-processing tradeoff between regex and structured validation.

> 💡 **Related Theory**: Macie solves the problem in data governance of "know your data." Regulations like GDPR (2018), CCPA (California), HIPAA demand "you must know where PII is, protect it, and delete it if requested (right to be forgotten)." But finding PII in petabyte-scale lakes is impossible manually — this is the **dark data** problem. Macie illuminates this darkness through automated discovery. The key pattern is "classify before you protect" — without knowing what's sensitive, you can't protect appropriately. Macie's Finding goes to Security Hub and surfaces "SSN in public bucket" as Critical — this is the chain from classification → risk assessment → response. Lesson: response speed is proportional to knowing what you use; asset and dependency inventories are security's prerequisite.

```bash
aws macie2 enable-macie
aws macie2 create-classification-job --job-type ONE_TIME \
  --name pii-scan-prod \
  --s3-job-definition '{"bucketDefinitions":[{"accountId":"111","buckets":["prod-data"]}]}'
```

> ⚠️ **Pitfall**: Macie charges **per-object, per-storage-unit**, and large data lakes can be costly. Running full-scan Discovery Jobs every time balloons costs. Industry practice separates ①automated sensitive data discovery (sampling-based continuous monitoring, low cost) and ②full Discovery Jobs (precise, high cost), scanning only new/changed objects incrementally to control costs. In exams, "large lake PII scan" pitfall is usually "full scan repeats without cost consideration."

## Inspector v2 — CVE and Vulnerability Management Standardization

Inspector v2 (re-released 2021) scans EC2, ECR container images, and Lambda across the board to find **CVEs (Common Vulnerabilities and Exposures)**.

| Target | Scans For |
|--------|----------|
| **EC2** | Known CVEs in OS packages (via SSM Agent) |
| **ECR Container Images** | OS packages + language dependencies (npm·pip·gem, etc.) CVEs |
| **Lambda** | Function code and dependency CVEs |

The key is **continuous monitoring** — not scan-once-and-done, but auto-re-evaluating already-scanned assets when new CVEs are published. "Yesterday's image was safe, but today's published CVE makes it vulnerable" is caught automatically. Findings integrate to Security Hub.

> 🔍 **Deeper**: Understanding **CVE and CVSS history** reveals vulnerability management's structure. **CVE**, started by MITRE in 1999, is a "dictionary assigning unique identifiers to known vulnerabilities (like CVE-2021-44228)." Before CVEs, vendors called the same vulnerability different names — chaos. CVE created "a common language for vulnerabilities." **CVSS** (see Day 2) scores severity 0-10. **NVD** (National Vulnerability Database, NIST-run) is the U.S. government DB attaching CVSS scores and impact analysis to CVEs. Inspector consumes this ecosystem — it extracts asset package inventory, cross-references CVE feeds, scores severity from NVD's CVSS, and reports via ASFF to Security Hub. Inspector's value lies not in "scanning engine" but in "continuously-updated CVE feed × my asset inventory cross at all times."

> 📚 **Case Study**: **Log4Shell (CVE-2021-44228, CVSS 10.0)**, disclosed December 2021, is a remote code execution in Java's Log4j logging library. Nearly every Java app depended on Log4j directly or indirectly, making it "one of the broadest vulnerabilities in internet history." The core lesson: **dependency visibility**. Many organizations couldn't instantly answer "which services use Log4j?" — late response. This is why **SBOM (Software Bill of Materials, software component inventory)** and **SLSA (Supply-chain Levels for Software Artifacts, Google 2021, "salsa")** became critical. SBOM is "list of all components in this build," answering "where does the vulnerable component live?" instantly during Log4Shell-style incidents. Lesson: response speed correlates with knowing what you use — asset and dependency inventory is security's prerequisite.

```bash
aws inspector2 enable --resource-types EC2 ECR LAMBDA
```

> 🔍 **Deeper**: Post-Log4Shell, **SLSA** (Google 2021) is a software supply-chain integrity framework. It proves build provenance, ensuring "this artifact really built from trusted source without tampering" (levels 1-4). ECR already combines image signing (AWS Signer), immutable tags, and Inspector enhanced scanning to harden container supply chains. In DOP context, "ECR push with automatic CVE scan (Inspector enhanced scanning) + signature validation + immutable tags" is the container supply-chain security standard pattern.

## IAM Access Analyzer — Proving Least Privilege with Data

IAM Access Analyzer does four things.

| Capability | Description |
|------------|-------------|
| **External Access Findings** | Auto-discover resources (S3, IAM Role, KMS, etc.) exposed to external (different account, public) |
| **Unused Access Findings** | Find IAM Roles, permissions, access keys unused over a period (2023+) |
| **Policy Validation** | Auto-validate IAM policy syntax and security best practices while writing |
| **Policy Generation** | Auto-generate policy containing only actually-used permissions from CloudTrail activity logs |

> 🔍 **Deeper**: External Access Findings' internal engine is interesting. Access Analyzer uses **automated reasoning** — using mathematical logic to "prove" whether a policy permits external access. AWS's **Zelkova** engine converts IAM policies into logical formulas that SMT (Satisfiability Modulo Theories) solvers can solve, mathematically proving "does a case exist where external principals can access under this policy?" This is **formal verification**, not empirical "test the policy" — it reasons about all possible requests and guarantees correctness. No "unlucky missed case" exists — if the policy allows external access, it's found. Automated reasoning is AWS's core tech used in multiple places (S3 Block Public Access, VPC Reachability Analyzer, etc.) in AWS's "Provable Security" initiative.

> 💡 **Related Theory**: Policy Generation and Unused Access implement the **Principle of Least Privilege** with data. Least Privilege, established by Saltzer & Schroeder's 1975 seminal paper *"The Protection of Information in Computer Systems"* as one of 8 core security design principles, says "subjects should possess only privileges strictly necessary for their task." The practical problem: "strictly necessary" is hard for humans to determine, so permissions usually end up oversized (privilege creep) and never shrink. Access Analyzer inverts this. Policy Generation extracts only **actually-used permissions** from CloudTrail, creating policies (observation-based least privilege); Unused Access finds **unused permissions** for removal. "Achieve least privilege through observation, not guessing" is the principle.

```bash
# Organization-wide analyzer
aws accessanalyzer create-analyzer --analyzer-name org-analyzer --type ORGANIZATION

# CloudTrail-based policy generation (actual-use permissions only)
aws accessanalyzer start-policy-generation \
  --policy-generation-details principalArn=arn:aws:iam::...:role/Analyst,cloudTrailDetails={accessRole=...,trails=[...],startTime=...}
```

## Firewall Manager and CloudTrail Lake — Completing the Stack

**Firewall Manager** manages multi-account WAF, Shield, Network Firewall, and security group policies centrally. Integrated with Organizations, it auto-applies policies to new accounts and resources — "enforce this WAF rule on every ALB across the org" becomes one-time setup.

**CloudTrail Lake** is a SQL-queryable data store of CloudTrail events, retaining up to 7 years and unifying multi-account and multi-region. Security incident investigation becomes answering "what API did this credential call 3 years ago" with SQL.

> 💡 **Related Theory**: Mapping this entire stack to NIST's **Cybersecurity Framework (CSF)** 5 functions — Identify, Protect, Detect, Respond, Recover — completes the picture. **Identify**: Config (inventory), Macie (data classification), Access Analyzer (exposure/unused). **Protect**: Firewall Manager (WAF/SG), Conformance Pack. **Detect**: GuardDuty (threats), Inspector (vulnerabilities), Security Hub (integration). **Respond**: EventBridge→SSM/Lambda auto-remediation. **Recover**: Snapshots, backups. Knowing which AWS service fills which CSF function lets you quickly diagnose in scenarios "what's missing and what should fill it."

```
Comprehensive Security Automation Stack (NIST CSF Mapping)
==================================================
  Identify   ├─ Config(inventory) ├─ Macie(data) └─ Access Analyzer(exposure·unused)
  Protect    ├─ Firewall Manager ├─ Conformance Pack └─ KMS/encryption
  Detect     ├─ GuardDuty(threats) ├─ Inspector(vulnerabilities) └─ Security Hub(integration·ASFF)
  Respond    └─ EventBridge → SSM Automation / Lambda
  Recover    └─ Snapshots / Backups / PITR
  Forensics  └─ CloudTrail Lake (7y, SQL)
```

> 🎯 **Scenario**: "Fintech org needs ①continuous SOC2/PCI audit evidence ②auto-discover card numbers and SSNs in data lake S3, cost-controlled ③ECR push auto-scans npm/pip dependency CVEs + auto-re-evaluates on new CVEs ④discover S3/roles exposed to external accounts via formal proof ⑤shrink over-granted IAM permissions to observation-based least privilege ⑥7-year security incident SQL investigation." → ① Audit Manager Frameworks (SOC2, PCI) + Assessment Report ② Macie auto-discovery (sampling continuous) + incremental Discovery Job for new/changed (cost-controlled) ③ Inspector v2 ECR enhanced scanning (continuous monitoring) ④ Access Analyzer External Findings (Zelkova formal reasoning) ⑤ Access Analyzer Policy Generation (CloudTrail-based) + Unused Access ⑥ CloudTrail Lake (7-year SQL). All Findings integrated ASFF→Security Hub, violations routed EventBridge→SSM auto-remediation.

## Summary

Today we saw four key points. First, **continuous compliance transforms audits from event to state** — a GRC cloud evolution. Audit Manager auto-maps evidence (Config, CloudTrail, Security Hub) to regulatory controls and generates Assessment Reports, proving compliance. Unlike Config (operational "are we compliant now"), Audit Manager is audit preparation ("evidence for auditors"). Second, **Macie classifies dark data's PII/PHI with pattern matching (Luhn validation, etc.) + ML**, implementing "classify before protect" data governance, though per-object cost control is a pitfall. Third, **Inspector v2 consumes the CVE/CVSS/NVD ecosystem** for continuous scanning (EC2, container, Lambda), auto-re-evaluating on new CVEs, and Log4Shell's lesson surfaces SBOM and SLSA supply-chain security. Fourth, **Access Analyzer proves external exposure through Zelkova formal reasoning and observation-based least privilege via Policy Generation**, completing NIST CSF 5 functions with Firewall Manager (central policy) and CloudTrail Lake (7-year SQL).

Next we'll synthesize Week 14 overall with scenario questions verifying end-to-end application.

---

## 📝 연습 문제

**문제 1.** Config/Security Hub와 Audit Manager의 역할 차이로 가장 정확한 것은?

A) 셋 다 같은 일을 한다

B) Config/Security Hub는 "지금 컴플라이언트한가"를 평가·교정하는 운영 도구이고, Audit Manager는 "컴플라이언트함을 감사인에게 증명할 증거를 Config·CloudTrail·Security Hub에서 자동 수집·매핑·보고서화"하는 감사 준비 도구다

C) Audit Manager가 위반을 자동 수정한다

D) Config가 감사 보고서를 생성한다

**정답: B**

해설: Config/Security Hub는 리소스가 "지금 컴플라이언트한가"를 평가하고 위반을 교정하는 운영 도구다. Audit Manager는 그 위에서 "컴플라이언트함을 감사인에게 증명할 증거"(Config 스냅샷·CloudTrail 로그·Security Hub Finding)를 규제 Framework의 컨트롤에 자동 매핑하고 Assessment Report로 정리하는 감사 준비 도구다. "위반 자동 수정"은 Config(C 틀림), "감사 보고서 생성"은 Audit Manager(D 틀림)다. 셋의 역할은 다르다(A 틀림).

---

**문제 2.** Macie가 16자리 숫자를 모두 신용카드 번호로 오탐하지 않고 정확히 분류하는 핵심 메커니즘은?

A) 단순히 16자리 숫자 패턴만 찾는다

B) 16자리 패턴을 찾은 뒤 Luhn 알고리즘(ISO/IEC 7812 체크섬) 검증을 돌려 우연히 16자리인 무작위 숫자(주문번호 등)를 걸러낸다 — "패턴 + 검증" 이중 구조

C) 모든 숫자를 사람이 검토한다

D) 카드번호는 탐지하지 못한다

**정답: B**

해설: 신용카드 번호는 Luhn 알고리즘(1954년 IBM, ISO/IEC 7812 표준)이라는 체크섬을 만족해야 한다 — 마지막 체크 디지트가 앞자리로 계산한 값과 맞아야 유효하다. Macie는 16자리 패턴을 찾은 뒤 Luhn 검증을 돌려 false positive를 걸러낸다. SSN도 발급 규칙을 검증한다. 이 "패턴 + 검증" 이중 구조가 데이터 분류 정확도를 좌우한다 — 패턴만으로는 오탐이 폭발한다. 단순 패턴(A)·수동 검토(C)·탐지 불가(D)는 틀리다.

---

**문제 3.** Inspector v2가 "어제는 안전했던 컨테이너 이미지를 오늘 취약하다고 자동 재평가"할 수 있는 이유는?

A) 매번 이미지를 다시 빌드해서

B) Inspector가 자산의 패키지 인벤토리를 끊임없이 갱신되는 CVE 피드(MITRE CVE·NVD의 CVSS)와 지속적으로 교차하므로, 새 CVE가 공개되면 이미 스캔한 자산을 자동 재평가한다

C) 사람이 매일 수동 스캔해서

D) 이미지가 시간이 지나면 손상돼서

**정답: B**

해설: Inspector의 가치는 일회성 스캔이 아니라 "끊임없이 갱신되는 CVE 피드 × 내 자산 인벤토리의 상시 교차"에 있다. CVE(MITRE의 취약점 식별자 사전, 1999~)와 NVD(NIST의 CVSS 점수 DB)는 매일 새 취약점이 등록되고, Inspector는 자산의 패키지 인벤토리를 이와 지속 대조한다. 그래서 새 CVE 공개 시 이미 스캔한 EC2·컨테이너·Lambda를 자동 재평가한다. 재빌드(A)·수동 스캔(C)·이미지 손상(D)은 메커니즘이 아니다.

---

**문제 4.** IAM Access Analyzer가 "이 정책이 외부 접근을 허용하는 경우가 존재하는가"를 운 나쁘게 놓치는 케이스 없이 보장하는 내부 기술은?

A) 정책을 무작위 요청으로 테스트해 본다

B) Zelkova 엔진의 자동 추론(automated reasoning) — IAM 정책을 SMT 솔버가 풀 논리식으로 변환해 모든 가능한 요청을 수학적으로 추론하는 형식 검증(formal verification)

C) 머신러닝으로 추측한다

D) 운영자가 수동 검토한다

**정답: B**

해설: Access Analyzer의 External Access Findings는 AWS의 Zelkova 엔진을 써 IAM 정책을 SMT(Satisfiability Modulo Theories) 솔버가 풀 수 있는 논리식으로 변환하고, "외부 주체가 접근 가능한 경우가 존재하는가"를 형식 증명한다. 이는 경험적 테스트가 아니라 모든 가능한 요청을 수학적으로 추론하는 형식 검증이라, 놓치는 케이스가 없다(AWS Provable Security). 무작위 테스트(A)·ML 추측(C)·수동 검토(D)는 완전성을 보장하지 못한다.

---

**문제 5.** 과도하게 부여된 IAM 권한을 "추측이 아니라 실제 사용 데이터 기반"으로 최소 권한까지 줄이려 한다. 올바른 도구 조합은?

A) 모든 권한을 일단 삭제하고 오류 나면 추가

B) Access Analyzer Policy Generation(CloudTrail 활동 로그로 실제 사용된 권한만의 정책 생성) + Unused Access Findings(안 쓰는 역할·권한·키 발견)

C) 모든 역할에 AdministratorAccess 부여

D) GuardDuty로 권한 분석

**정답: B**

해설: 최소 권한 원칙(Saltzer & Schroeder, 1975)의 실무 난제는 "꼭 필요한 권한"을 사람이 알기 어렵다는 것이다. Access Analyzer는 이를 관측으로 해결한다 — Policy Generation은 CloudTrail에 기록된 실제 사용 권한만 추출해 정책을 만들고(관측 기반 최소 권한), Unused Access Findings는 안 쓰는 권한을 찾아 회수를 유도한다. "추측이 아니라 관측으로 최소 권한 달성"이 핵심이다. 무작정 삭제(A)·과도 부여(C)는 안티패턴, GuardDuty(D)는 위협 탐지로 권한 분석 도구가 아니다.

---

**문제 6.** Log4Shell(CVE-2021-44228, CVSS 10.0) 사고에서 많은 조직의 대응이 늦어진 근본 원인과, 이를 막기 위해 부상한 개념은?

A) 패치가 없어서 — 백신

B) "우리 어느 서비스가 Log4j를 쓰는지" 즉답하지 못한 의존성 가시성 부재 — SBOM(Software Bill of Materials)으로 빌드 컴포넌트 목록을 관리해 "어디에 취약 컴포넌트가 있나"를 즉시 답하고, SLSA로 공급망 무결성을 보장

C) 네트워크가 느려서 — CDN

D) 비밀번호가 약해서 — MFA

**정답: B**

해설: Log4Shell은 거의 모든 자바 앱이 Log4j를 직간접 의존했기에 광범위했고, 많은 조직이 "어느 서비스가 Log4j를 쓰는지" 즉답하지 못해 대응이 늦었다 — 의존성 가시성 부재가 근본 원인이다. 이것이 SBOM(빌드에 들어간 모든 컴포넌트 목록)과 SLSA(공급망 무결성 프레임워크, 구글 2021)가 중요해진 배경이다. Inspector의 컨테이너/Lambda 의존성 스캔이 이를 돕는다. "취약점 대응 속도는 내가 무엇을 쓰는지 아는 정도에 비례한다." 백신(A)·CDN(C)·MFA(D)는 무관하다.

---

**문제 7.** 종합 보안 자동화 스택을 NIST CSF(식별·보호·탐지·대응·복구)에 매핑할 때, "식별(Identify)" 함수를 채우는 서비스 조합으로 가장 적절한 것은?

A) EventBridge → SSM Automation

B) Config(리소스 인벤토리) + Macie(데이터 분류) + IAM Access Analyzer(외부 노출·미사용 권한)

C) 스냅샷 + 백업 + PITR

D) GuardDuty + Inspector

**정답: B**

해설: NIST CSF의 "식별(Identify)"은 자산·데이터·위험을 파악하는 함수다. Config(리소스 인벤토리·관계 그래프), Macie(데이터 분류·다크 데이터 발견), Access Analyzer(외부 노출·미사용 권한 식별)가 이를 채운다. EventBridge→SSM(A)은 "대응(Respond)", 스냅샷·백업·PITR(C)은 "복구(Recover)", GuardDuty·Inspector(D)는 "탐지(Detect)"에 해당한다. 각 서비스가 CSF의 어느 함수를 채우는지 알면 시나리오에서 빈 단계를 빠르게 진단할 수 있다.

---

## 📌 Today's Summary

Today's key points were four-fold. First, continuous compliance transforms audits from event to state — a GRC cloud-native evolution. Audit Manager auto-maps evidence (Config, CloudTrail, Security Hub) to regulatory Framework controls and generates Assessment Reports proving compliance ("evidence collection for auditors" is its role). Second, Macie classifies dark data's PII/PHI with pattern matching (Luhn, etc.) + ML implementing "classify before protect," though per-object billing is a cost pitfall. Third, Inspector v2 consumes CVE/CVSS/NVD ecosystem for continuous scanning (EC2, container, Lambda), auto-re-evaluating on new CVEs, and Log4Shell's lesson surfaces SBOM and SLSA supply-chain security importance. Fourth, Access Analyzer proves external exposure via Zelkova formal reasoning and observation-based least privilege via Policy Generation, completing NIST CSF 5 functions with Firewall Manager (central policy) and CloudTrail Lake (7-year SQL investigation).
