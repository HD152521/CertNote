# Day 2 - Detection Trinity: Internal Operations of Macie·GuardDuty·Inspector and Threat Detection

The biggest pitfall when first designing security detection in the cloud is the misconception that "all security services look the same." Macie, GuardDuty, and Inspector are not distinguishable by name alone in what they detect, and the SAP-C02 exam is designed to exploit exactly this confusion. The key is that three services **see completely different data in completely different ways**. Macie looks at **the content of data** (is there a card number in the S3 object), GuardDuty looks at **abnormal behavior** (is the account doing something it doesn't normally do), and Inspector looks at **software defects** (does this EC2 have a known vulnerability).

If you embed these three in your mind as a triangle of "content · behavior · defects," nearly every detection problem on the exam will be solved. Today we'll organize the internal operating principles of each service (ML classification, threat intelligence, CVE matching) and the integration pattern where they're tied together via Security Hub and EventBridge to become an automated response pipeline.

## At a Glance — What to Check, Where to Check, and How to Check

| Service | Detection Target (Where) | Detection Content (What) | Detection Method (How) |
|---------|----------------|----------------|------------------|
| **Macie** | S3 Objects | Sensitive Data (PII·PCI·Credentials) | ML-Based Content Classification |
| **GuardDuty** | Account·Network·Runtime | Anomalous Behavior·Malicious Communication·Breach | Log Analysis + Threat Intel + ML |
| **Inspector** | EC2·ECR·Lambda | CVE·Software Vulnerabilities·Network Exposure | CVE Database Matching |

The three services have **non-overlapping data sources**. Macie reads S3 object bytes, GuardDuty reads VPC Flow Logs·CloudTrail·DNS logs, and Inspector reads software inventory. This "input difference" is the key that determines the correct answer.

## Macie — Reading What's Inside S3 with ML

Macie's essence is a **data classifier**. It samples and scans S3 bucket objects to determine whether they contain sensitive data using machine learning and pattern matching. AWS's pre-trained **managed data identifiers** recognize dozens of types including credit card numbers, US SSNs, AWS credentials, passport numbers, and medical information, and you can also define **custom identifiers** with regex and keywords.

- **Sensitivity Score (0~100)**: Each bucket receives a score based on the amount and types of sensitive data found, prioritizing action.
- **Bucket Inventory**: Automatically evaluates encryption, public access, and sharing status of all S3 buckets (whether data is exposed in structure).
- **Organization Integration**: Scan S3 across all accounts in bulk from delegated administrator account.

> 💡 **Related Theory**: The fact that Macie "does not read entire objects but samples them" is the core of the cost/accuracy tradeoff. If you scan every byte of a petabyte bucket each time, costs explode. Macie extracts representative samples based on object type/size for classification, and charges based on **scanned data volume (in GB)**. This is the principle of **sampling** from statistics — rather than a census of the entire population (all objects), estimation using representative samples. In practice, "establish a baseline with a one-time full scan, then automatically scan only new/changed objects afterward" is the pattern to control costs. In the exam, "Macie cost optimization" is oriented toward "limiting scan scope to new/sensitive-estimated buckets."

> ⚠️ **Trap**: "Does S3 contain sensitive data" is Macie, "Is there suspicious access to S3" is **GuardDuty S3 Protection**. Both look at S3 but in different dimensions — Macie examines **object content** (presence of card numbers), GuardDuty S3 Protection detects **abnormal access behavior** (bulk GetObject from abnormal IP, API use that's not normally used). When both appear together in exam options, distinguish as "content inspection = Macie, behavior anomaly = GuardDuty."

## GuardDuty — Catching Abnormal Behavior with Threat Intel and ML

GuardDuty is a **threat detection** service that analyzes logs AWS already collects without agent installation. The three primary data sources are **VPC Flow Logs** (network metadata), **CloudTrail** (API call records), and **DNS Logs** (domain lookups). Combined with AWS threat intelligence (lists of known malicious IPs, domains, cryptocurrency mining pools) and ML comparing to "this account's normal behavioral baseline," it detects anomalies.

Finding categories: **Recon** (port scanning, reconnaissance), **UnauthorizedAccess** (abnormal login, credential theft suspicion), **Backdoor** (C2 server communication), **Trojan**, **CryptoCurrency** (mining pool communication), **Impact** (data breach suspicion), etc.

Beyond the basics, **opt in to Protection modules** to expand detection scope (each charged separately):

- **S3 Protection**: S3 data event analysis — abnormal access behavior
- **Malware Protection**: Snapshot EC2/EBS disk and scan for malware — **no agent required**
- **EKS Protection**: Kubernetes audit logs (Audit) + runtime (Runtime) monitoring
- **RDS Protection**: Anomaly detection in RDS login activity
- **Lambda Protection**: Lambda network activity anomalies

> 🔍 **Deeper Dive**: The way GuardDuty's ML anomaly detection works is **behavioral baselining**. Over the first days to weeks, it learns the account's normal patterns (which regions, which time periods, which APIs, which IAM principals call them) to create a baseline. After that, it flags behavior that deviates statistically significantly from the baseline (API use from regions not normally used, large data downloads at 3 AM) as "anomalous." This **anomaly detection** differs from signature-based detection (only catches known patterns) — it can even catch brand new attacks never seen before as "different from normal." Tradeoff: false positives occur before baseline learning completes or when normal behavior changes rapidly.

> 📚 **Case Study**: The 2019 Capital One breach involved an SSRF (Server-Side Request Forgery) vulnerability that bypassed WAF to steal IAM role credentials from EC2 instance metadata (IMDS), then used that permission to leak over 100 million customer data records from S3 buckets. The attacker performed bulk `ListBuckets`·`GetObject` using the stolen credentials — exactly the kind of behavior GuardDuty's **UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration** and abnormal data access patterns could catch. The lesson: vulnerabilities (SSRF) are caught by Inspector and code review, while abnormal behavior after credential theft is caught by GuardDuty — multi-layered defense is necessary. No single service can break this chain. (Afterward, AWS made SSRF-based metadata theft structurally harder with IMDSv2.)

> 🔍 **Deeper Dive**: GuardDuty Malware Protection's "no-agent" implementation is clever. Traditional antivirus requires agent installation on each host (operational burden, performance impact), but GuardDuty **takes an EBS volume snapshot of the EC2 with suspicious findings and scans it in AWS-managed environments**. It doesn't consume host CPU, requires no agent deployment/patching, and even if an attacker breaches the host, it's hard to interfere with scanning in a separate environment. Tradeoff: scanning is at the snapshot point in time, not real-time, and snapshot costs are incurred each scan.

## Inspector — Matching Known Software Defects to CVE

Inspector (v2) is a **vulnerability assessment** service. It collects software inventory from EC2·ECR (container images)·Lambda and **matches against the CVE (Common Vulnerabilities and Exposures) database**. It's like checking "does the OpenSSL version installed on this instance correspond to CVE-2014-0160 (Heartbleed)?"

- **EC2**: Continuous scanning of OS and installed packages via SSM Agent. When a new CVE is disclosed, automatically re-evaluates without additional scanning.
- **ECR**: Scan on container image push + periodic rescanning (OS packages and library vulnerabilities inside the image).
- **Lambda**: Function code and layer dependency vulnerabilities + (optional) security flaws in code itself.
- **Risk Score**: Adjusts priority by reflecting CVSS base score with environment context (network exposure, exploit availability).

> 💡 **Related Theory**: CVE is the **open vulnerability identification system** MITRE started in 1999. Each vulnerability receives a unique ID `CVE-year-serial` (e.g., CVE-2021-44228, Log4Shell) so the world uses the same language for vulnerabilities. Severity is standardized by **CVSS (Common Vulnerability Scoring System, 0~10)** (NIST's NVD manages scoring). Inspector's value comes from the fact that no human can manually check "thousands of packages × daily deluge of new CVEs" — it automatically collects inventory and continuously checks against NVD/vendor feeds. In the exam, "automatic detection of missed patches and known vulnerabilities" is Inspector, while "actual patch application of detected vulnerabilities" is Systems Manager Patch Manager (complementary relationship).

> ⚠️ **Trap**: The misconception that "Inspector applies patches." Inspector **detects and assesses only** ("this instance has this CVE"). The actual **patch application** is the job of **Systems Manager Patch Manager**. If exam scenario is "find vulnerabilities," it's Inspector; if "automatically patch found vulnerabilities," it's Patch Manager (+ EventBridge integration). They're complementary, not replacements.

> 📚 **Case Study**: When Log4Shell (CVE-2021-44228) erupted in December 2021, nearly all servers using Java's Log4j logging library were exposed to remote code execution. The problem was knowing "where in our infrastructure does vulnerable Log4j version exist" — it was buried in thousands of container images, EC2s, and Lambda dependencies. Organizations with GuardDuty v2 enabled could **automatically identify all affected resources (EC2·ECR images·Lambda layers) without additional scanning** as soon as the new CVE was registered in NVD. Lesson: the first step in vulnerability response is "knowing where it is," and continuous scanning + automatic re-evaluation determines 0-day response speed.

## Integration — Collecting via Security Hub and Automated Response via EventBridge

The Findings from the three services are unmanageable if viewed separately. That's why **Security Hub** collects all Findings in the **ASFF (AWS Security Finding Format)** standard schema, and **EventBridge** triggers automated response (Lambda·SNS·Step Functions) using Findings as triggers.

```
Macie Finding     ─┐
GuardDuty Finding ─┼──▶ Security Hub (ASFF Integration) ──▶ EventBridge Rule ──▶ Lambda / SNS / SOAR
Inspector Finding ─┘                                                        (Isolation·Snapshot·Notification)
```

In a multi-account environment, the **Organization delegated administrator** in one place activates and manages all detection services across all accounts. New accounts are automatically included when added.

> 🎯 **Scenario**: "When GuardDuty detects suspected credential theft on an EC2 (InstanceCredentialExfiltration), immediately isolate that EC2 without human intervention and create a forensic snapshot to alert the security team." → **GuardDuty Finding → EventBridge Rule → Lambda**. Lambda performs: (1) Replace EC2 with isolated security group (block all traffic), (2) Create EBS snapshot (preserve forensic evidence), (3) Notify security team via SNS. Collect Findings via Security Hub for visibility, and in multi-account deployments, operate in bulk from delegated administrator. This "detection → automatic isolation/evidence preservation → notification" is the standard SOAR (cloud security automation) pattern.

> 🔍 **Deeper Dive**: Why is ASFF important? GuardDuty·Inspector·Macie·third parties (F5, Crowdstrike, etc.) each produce Findings in different formats. To feed these into SIEM or automation, you need to standardize formats — Security Hub normalizes all to ASFF (JSON standard schema). Thanks to this, a single EventBridge rule consistently handles Findings from different sources, and when sending to Splunk or external SIEM, you only need to parse one format. This is the **canonical schema** pattern in data integration — reducing N sources × M consumers to N+M integration (avoiding N×M adapter hell).

## Summary

The detection trinity is a triangle of "content · behavior · defect" — **Macie** classifies the **content** (sensitive data) of S3 objects with ML, **GuardDuty** catches **behavior** (anomalies, malicious communication) of accounts and networks with threat intel and ML, and **Inspector** assesses **defects** (CVEs) of software via database matching. The point that data sources don't overlap (S3 bytes vs logs vs inventory) determines the correct answer. They're integrated via Security Hub in ASFF and automated response via EventBridge.

SAP exam frequent mappings: (1) "Whether credit card number·SSN stored in S3" → **Macie**, (2) "Abnormal S3 access behavior" → **GuardDuty S3 Protection** (not Macie), (3) "EC2 ↔ malicious IP communication·credential theft" → **GuardDuty**, (4) "Automatic CVE detection in EC2·containers·Lambda" → **Inspector v2**, (5) "Apply patches to detected vulnerabilities" → **Patch Manager** (not Inspector), (6) "EKS runtime suspected behavior" → **GuardDuty EKS Protection**, (7) "EC2 malware scan without agent" → **GuardDuty Malware Protection**, (8) "Integrate all account Findings" → **Security Hub + delegated administrator**. Next day we'll look at integrated monitoring (Security Hub·Detective·Audit Manager) that collects these Findings.

---

## 📝 연습 문제

**문제 1.** S3 버킷에 신용카드 번호나 SSN 같은 민감 데이터가 저장된 적이 있는지 자동으로 탐지·분류하고, 버킷별 민감도 점수로 우선순위를 매기고 싶다. 가장 적합한 것은?

A) GuardDuty S3 Protection

B) Macie

C) Inspector v2

D) Config Rule

**정답: B**

**해설:** Macie는 ML 기반으로 S3 객체의 내용을 스캔해 PII·PCI·자격 증명 등 민감 데이터를 분류하고 버킷별 민감도 점수(0~100)를 매긴다. A(GuardDuty S3 Protection)는 객체 내용이 아니라 "접근 행동의 이상"을 탐지한다(비정상 IP에서 대량 GetObject 등) — 콘텐츠 검사가 아니다. C(Inspector)는 EC2·ECR·Lambda의 CVE 취약점 스캔이다. D(Config Rule)는 리소스 설정 평가이지 객체 내용 분류가 아니다. 함정: "S3 내용에 민감 데이터" = Macie, "S3 접근 행동 이상" = GuardDuty.

---

**문제 2.** EC2 인스턴스가 알려진 악성 IP와 통신하고, 평소 사용하지 않던 리전에서 IAM 자격 증명이 사용되는 등 이상 행동을 에이전트 설치 없이 탐지해야 한다. 가장 적합한 것은?

A) Inspector v2

B) GuardDuty

C) Macie

D) AWS WAF

**정답: B**

**해설:** GuardDuty는 VPC Flow Log·CloudTrail·DNS 로그를 분석하고 AWS 위협 인텔리전스(악성 IP 목록) + ML 행동 베이스라이닝으로 이상을 탐지한다. 에이전트 설치가 필요 없다. A(Inspector)는 소프트웨어 취약점(CVE) 평가이지 네트워크·행동 이상 탐지가 아니다. C(Macie)는 S3 데이터 분류. D(WAF)는 L7 웹 요청 필터링이지 계정·네트워크 행동 분석이 아니다. 함정: "악성 IP 통신·비정상 행동·에이전트 없음" = GuardDuty.

---

**문제 3.** 수백 개의 컨테이너 이미지(ECR)와 EC2, Lambda 함수에서 알려진 CVE 취약점을 지속적으로 자동 탐지하고, 신규 CVE가 공개되면 추가 스캔 없이 자동 재평가되어야 한다. 가장 적합한 것은?

A) GuardDuty

B) Inspector v2

C) Macie

D) Systems Manager Patch Manager

**정답: B**

**해설:** Inspector v2는 EC2·ECR·Lambda의 소프트웨어 인벤토리를 CVE 데이터베이스와 지속 대조하며, 신규 CVE가 NVD에 등록되면 추가 스캔 없이 영향 리소스를 자동 재평가한다. A(GuardDuty)는 행동·위협 탐지이지 CVE 평가가 아니다. C(Macie)는 S3 데이터. D(Patch Manager)는 패치를 "적용"하는 도구이지 취약점을 "탐지·평가"하는 도구가 아니다. 함정: "CVE 자동 탐지·재평가" = Inspector, "패치 적용" = Patch Manager.

---

**문제 4.** EKS 클러스터에서 Pod의 런타임 의심 동작(권한 상승 시도, 의심 프로세스 실행)을 탐지해야 한다. 가장 적합한 것은?

A) Inspector ECR 스캔

B) GuardDuty EKS Protection (Runtime Monitoring)

C) Macie

D) Config

**정답: B**

**해설:** GuardDuty EKS Protection은 쿠버네티스 감사 로그(Audit)와 런타임(Runtime Monitoring)을 분석해 Pod의 런타임 의심 동작을 탐지한다. A(Inspector ECR)는 이미지의 정적 CVE 취약점을 스캔하지만 런타임 행동은 보지 못한다. C(Macie)는 S3 데이터. D(Config)는 설정 평가. 함정: "EKS 이미지 취약점(정적)" = Inspector ECR, "EKS 런타임 행동(동적)" = GuardDuty EKS Protection.

---

**문제 5.** GuardDuty가 EC2 자격 증명 탈취 의심을 탐지하면 사람 개입 없이 즉시 해당 EC2를 격리하고, 포렌식 스냅샷을 생성하고, 보안팀에 알림을 보내야 한다. 어떤 구성인가?

A) GuardDuty Finding → SNS만

B) GuardDuty Finding → EventBridge Rule → Lambda(격리 SG 교체 + 스냅샷 + SNS)

C) Macie → Security Hub

D) Inspector → Patch Manager

**정답: B**

**해설:** GuardDuty Finding을 EventBridge Rule이 트리거로 받아 Lambda를 실행해, EC2를 격리 보안 그룹으로 교체하고 EBS 스냅샷을 떠서 증거를 보존하며 SNS로 알린다 — 탐지 → 자동 격리·증거 보존 → 알림의 표준 SOAR 패턴. A(SNS만)는 알림만 하고 자동 격리·증거 보존이 없다. C·D는 시나리오(EC2 자격 증명 탈취 자동 대응)와 무관. 함정: "탐지 후 자동 격리·증거 보존"은 EventBridge → Lambda 자동화.

---

**문제 6.** 50개 계정으로 구성된 Organization에서 GuardDuty·Inspector·Macie를 모든 계정에 일괄 활성화하고, 신규 계정도 자동 포함되며, 모든 Finding을 한 콘솔에서 통합 관리하고 싶다. 가장 적합한 구성은?

A) 계정마다 수동으로 각 서비스 활성화

B) Organization 위임 관리자 + Security Hub 통합

C) 각 계정의 Finding을 S3로 내보내 ETL

D) CloudTrail만 활성화

**정답: B**

**해설:** 각 탐지 서비스의 Organization 위임 관리자(delegated administrator)에서 전 계정 일괄 활성화·관리가 가능하고 신규 계정이 자동 포함되며, Security Hub가 모든 Finding을 ASFF로 통합해 단일 콘솔에서 본다. A는 50개 계정 수동 관리가 비현실적이고 신규 계정 자동 포함이 안 된다. C는 통합·자동화가 빈약하고 운영 부담이 크다. D(CloudTrail)는 API 로그일 뿐 탐지·통합이 아니다. 함정: "멀티 계정 일괄 + 신규 자동 + 통합 콘솔"은 위임 관리자 + Security Hub.

---

**문제 7.** EC2의 EBS 디스크에 멀웨어가 있는지 검사하되, 인스턴스에 에이전트를 설치하지 않고 호스트 성능에도 영향을 주지 않아야 한다. 가장 적합한 것은?

A) 각 EC2에 ClamAV 에이전트 설치

B) GuardDuty Malware Protection

C) Inspector v2

D) Macie

**정답: B**

**해설:** GuardDuty Malware Protection은 의심 Finding이 발생한 EC2의 EBS 볼륨 스냅샷을 떠서 AWS 관리 환경에서 멀웨어를 스캔한다 — 호스트에 에이전트 불필요, CPU 영향 없음. A는 에이전트 설치·관리 부담이 있어 요건("에이전트 없이")에 어긋난다. C(Inspector)는 CVE 취약점 평가이지 멀웨어 스캔이 아니다. D(Macie)는 S3 데이터 분류. 함정: "에이전트 없이 EC2 멀웨어 스캔"은 GuardDuty Malware Protection.

---

## 📌 Today's Summary

Today's core: detection services have non-overlapping data sources — **content (Macie on S3 bytes), behavior (GuardDuty on logs), defects (Inspector on software inventory)**. Macie detects sensitive data in S3; GuardDuty detects anomalies and malicious behavior in account/network actions; Inspector detects software vulnerabilities by CVE matching. Don't confuse S3 content inspection (Macie) with S3 access anomalies (GuardDuty S3 Protection), or vulnerability detection (Inspector) with patch application (Patch Manager). Security Hub collects all Findings in ASFF standard format, and EventBridge automates response. In multi-account environments, use delegated administrator + Security Hub for unified management.
