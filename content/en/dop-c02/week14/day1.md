# Day 1 - GuardDuty and Automatic Isolation: Signal Processing, Statistics, and Auto-Response Principles

Looking long at security operations, it converges to one underlying tension: "Attacks hide among normal traffic — how do we automatically extract that handful of malicious signals and respond instantly without human intervention?" This question splits into two axes: detection and response. On AWS, GuardDuty supports the first axis. In the console, GuardDuty looks like "a managed threat detection service activated with one button," but underneath lies decades-old signal processing from the 1980s onward — signature-based detection, anomaly detection, threat intelligence, and behavioral analysis — directly embedded. Today we explore how that "one button" internally reads what data to judge threats, how EventBridge and SSM Automation auto-isolate detected Findings without human hands, and where that automation becomes risky.

In the DOP exam, GuardDuty appears as the foundation of "threat detection + auto-response," with scenarios like "how do you isolate a compromised instance in 30 seconds without human intervention," "how do you uniformly apply detection across multi-account organizations," or "how do you reduce noise when alert fatigue is drowning your ops team." Once you read which component each choice touches — data source, EventBridge filter, SSM Runbook, or Organizations delegation — the answer emerges.

## Why Intrusion Detection is Hard — Fundamental Tension Between Signatures and Anomalies

The history of threat detection begins with James P. Anderson's 1980 report *"Computer Security Threat Monitoring and Surveillance."* It first proposed "analyze audit logs to find abnormal behavior," and Dorothy Denning's IDES (Intrusion Detection Expert System) model (1986-87) formalized this statistically. There the detection splits into two branches.

**Signature-based detection (misuse detection)** carries a list of "known malicious patterns" and compares traffic against it. Antivirus, Snort rules, blocking known C2 server IPs all use this. Accuracy (low false positive) is high, but **zero-day attacks not on the list go undetected.** **Anomaly-based detection** statistically learns "what is normal," then suspects deviations from that distribution. It can catch new attacks but explodes with false positives if "normal" definition shifts.

GuardDuty mixes both. It uses threat intelligence feeds (known malicious IPs/domains) for signature detection and runs machine learning and statistical models on CloudTrail, VPC Flow, and DNS logs for anomaly detection. A judgment like "this account suddenly mass-creates IAM users in a region it's never used" is impossible from pure signature matching—behavioral baseline is required.

> 💡 **Related Theory**: Anomaly detection's mathematical foundation rests on **statistical hypothesis testing** and **Bayesian inference**. Denning's IDES modeled each subject's (user/process) behavior with mean and variance, measuring anomaly by how many standard deviations (σ) observed values deviated from expected distribution. Modern GuardDuty uses more sophisticated models but the principle remains identical — "this behavior's prior probability is low, yet we observed it (posterior explodes)—suspect it." The fundamental limitation here is **base rate fallacy**. When intrusions are extremely rare (e.g., 1 per million events), a detector 99% accurate still produces mostly false positives in its alarms. GuardDuty's Severity scores and Suppression Rules exist precisely to handle this base rate problem — "detection is easy; detection without alert fatigue is hard."

> 🔍 **Deeper Dive**: GuardDuty's "agentless" design is architecturally critical. Traditional host IDS (HIDS, e.g., OSSEC) deployed agents on servers to monitor logs and file integrity. GuardDuty deploys no agents—instead it reads **AWS's own data plane logs already collected**—CloudTrail records API calls, VPC Flow Logs record network flows, Route 53 Resolver records DNS queries. GuardDuty **directly receives replica streams of these logs internally** for analysis, so users need not separately enable or store them (even without VPC Flow Logs activated, GuardDuty sees flows). That's what the "one button" really is—not building new data collection infrastructure but attaching an analysis engine to logs already flowing. Exceptions are EKS/ECS Runtime Monitoring and EBS Malware Protection, which add lightweight agents or snapshot scanning.

## GuardDuty Data Sources — What It Reads and What It Judges

GuardDuty's detection capability ultimately comes from "which logs it sees." Threat types caught vary by data source.

| Data Source | Reads | Representative Detection |
|------------|-------|--------------------------|
| **CloudTrail Admin Events** | All API calls | Root usage, abnormal region, IAM privilege escalation |
| **CloudTrail S3 Data Events** | S3 object-level access | Abnormal bulk downloads, unauthorized access |
| **VPC Flow Logs** | Network 5-tuple flows | Mining pool communication, C2 channels, port scans |
| **Route 53 DNS Logs** | DNS queries | Known malicious domains, DGA, DNS tunneling |
| **EKS Audit Logs** | Kubernetes API server calls | Privilege escalation, anonymous access, container escape |
| **EBS Malware Protection** | EBS volume snapshot scans | Malware files, trojans |
| **Lambda Network Activity** | Lambda VPC flows | Function abnormal external communication |
| **RDS Login Activity** | Database authentication attempts | Brute force, abnormal login |
| **Runtime Monitoring** | EKS/ECS/EC2 runtime behavior | Process execution, file access anomalies |

> 🔍 **Deeper Dive**: Why **DNS-based detection** is powerful reveals GuardDuty's design philosophy. Malware must almost always resolve domains to communicate with C2 servers, and many attacks use **DGA (Domain Generation Algorithm)** — generating thousands of pseudo-random domains daily to evade blocking (e.g., Conficker worm in 2008). GuardDuty analyzes domain name entropy and ML patterns in DNS queries to catch "non-human random strings," then cross-references known C2 domain feeds. It also detects **DNS tunneling** — encoding data in DNS queries/responses to exfiltrate past firewalls — via query length, frequency, and record type abuse (TXT misuse). That's why Finding types like `CryptoCurrency:EC2/BitcoinTool.B!DNS` carry the `!DNS` suffix—marking signal detection. Crossing network payload (VPC Flow) with DNS lets you suspect encrypted traffic by "where it heads."

The naming convention for representative Finding types is `Threat:ResourceType/ThreatFamily.Variant!Source`. For example, `Backdoor:EC2/C&CActivity.B!DNS` means "backdoor threat, EC2 target, C&C activity variant B, detected via DNS signal." Reading this structure lets you understand from a Finding alone what was caught and how.

## Finding Severity — How Scores Are Set and Why They Matter

GuardDuty assigns every Finding a Severity score 1.0–10.0, labeled in four bands.

- **1.0–3.9: Low** — Reconnaissance, lower risk (port scanning)
- **4.0–6.9: Medium** — Suspicious behavior
- **7.0–8.9: High** — High compromise likelihood
- **9.0–10.0: Critical** — Active compromise strongly suspected

This score becomes the auto-response trigger. "Severity 7+ triggers auto-isolation" is the standard pattern because that threshold is above "no time to wait for humans."

> ⚠️ **Pitfall**: Interpreting Severity only as "attack dangerousness" falls into a trap. GuardDuty's Severity reflects **threat severity × confidence (confidence)**. High scores go to "certainly compromised," not "huge attack but low confidence." Same `SSHBruteForce` scores higher if "successful plus subsequent anomalous activity observed." In DOP exams, "why is this Finding's severity lower than expected?" often answers "detection confidence still low." Also, using Severity ≥ 7 alone for auto-isolation includes all High up to 8.9, risking false-positive operational instance isolation—that's why typically a Finding type prefix filter (e.g., `UnauthorizedAccess:EC2/`) is layered on.

## Auto-Isolation Response Pattern — Automation Chain from Detection to Isolation

Detection alone isn't enough. DOP's essence is "act on detected threats without humans." The standard pattern is a GuardDuty → EventBridge → SSM Automation Runbook chain.

```
GuardDuty Finding (Severity >= 7, type prefix matching)
   │
   ▼ EventBridge Rule (event filtering + routing)
   │
   ▼ SSM Automation Runbook (ordered step execution)
   ├─ 1. Snapshot EBS         ← Forensic evidence preservation (first!)
   ├─ 2. Modify Instance SG → sg-quarantine  ← Network isolation
   ├─ 3. Detach/Replace IAM Role ← Credential nullification
   ├─ 4. Tag with incident ID  ← Tracking
   ├─ 5. Notify Slack/PagerDuty ← Alert operators
   └─ 6. Create Jira ticket     ← Post-response tracking
```

The EventBridge rule's event pattern decides which Findings go to auto-response.

```json
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [{"numeric": [">=", 7]}],
    "type": [{"prefix": "UnauthorizedAccess:EC2/"}]
  }
}
```

> ⚠️ **Pitfall**: The **order** of auto-isolation steps appears in exams. Snapshot must be first—after isolating or terminating the instance, memory and disk state becomes corrupted or lost, making forensics impossible. Also, "isolation" means moving the instance to **a quarantine security group, not terminating it**. Terminate and you never know what the attacker did. A quarantine SG blocks "all outbound + inbound only from forensic jump box," cutting C2 communications while letting investigators access. "GuardDuty Critical found, immediately terminate instance" is almost always wrong—it's evidence destruction.

> 📚 **Case Study**: The 2019 Capital One breach involving ~100 million credit records started when an engineer lost misconfigurated WAF control to SSRF (Server-Side Request Forgery), leading to EC2 IAM role credential theft and S3 bucket exfiltration. Two key lessons: First, **anomalous API calls after credential theft** (different region, bulk S3 access) were detectable as GuardDuty findings like `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration`—had detection been on and auto-response wired, credential nullification would have limited damage. Second, **response speed after detection determines damage scope**—about 4 months elapsed between breach and external report. After this, the industry standard recommendation became "detection (GuardDuty) → auto credential nullification and isolation (EventBridge+SSM)."

## Multi-Account GuardDuty — Unified Application via Organizations

Running GuardDuty separately in each of hundreds of accounts and viewing Findings independently is operationally impossible. GuardDuty centralizes with Organizations integration.

The key is the **Delegated Administrator** account. Typically designating a Security OU's Audit account as delegated administrator lets that account control GuardDuty organization-wide. Turning on `auto-enable` means **existing member accounts and any newly created accounts automatically get GuardDuty activated** — preventing the accident of forgetting to enable on new accounts.

```bash
# Allow AWS Organizations service access
aws organizations enable-aws-service-access --service-principal guardduty.amazonaws.com

# Make Audit account the delegated admin
aws guardduty enable-organization-admin-account --admin-account-id AUDIT-ACCT

# Auto-enable all + new accounts, specify data sources
aws guardduty update-organization-configuration \
  --detector-id <id> --auto-enable-organization-members ALL \
  --features '[{"Name":"EBS_MALWARE_PROTECTION","AutoEnable":"NEW"},{"Name":"EKS_AUDIT_LOGS","AutoEnable":"ALL"}]'
```

> 💡 **Related Theory**: The delegated administrator pattern applies the security principle of **separation of concerns** and **least privilege** at organizational scope. Instead of concentrating all permissions in the management account, GuardDuty operations delegate to Audit account, logging to Log Archive account (AWS Landing Zone/Control Tower recommended structure). This is **blast radius reduction**—distributing permissions so one compromised account doesn't collapse everything. The management account handles billing and org structure only, staying out of daily security operations; if management account credentials leak, detection capabilities still run from separate accounts.

## Findings to ASFF — Security Hub Integration

GuardDuty Findings automatically convert to **ASFF (AWS Security Finding Format)**, a standard JSON schema sent to Security Hub. ASFF normalizes Findings from different sources (GuardDuty, Inspector, Macie) into one format. Security Hub deduplicates and prioritizes.

> 💡 **Related Theory**: ASFF addresses **normalization** of security data. Multiple tools emitting alarms in different formats prevent SIEM (Security Information and Event Management) unified analysis. Industry standards like STIX (MITRE/OASIS) and OCSF (2022, AWS/Splunk joint initiative) compete. ASFF is AWS's internal ecosystem common schema—implementing the **standard interface (adapter pattern)** idea where downstream (EventBridge filters, remediation Lambda) need not be rewritten per source. Standardized format is prerequisite for integrated security automation.

## Noise Control — Suppression, Trusted IP, Threat IP

Even accurate detection, if buried under false positives, causes operators to miss real Critical alerts (practical consequence of base rate fallacy). GuardDuty provides three noise control mechanisms.

- **Suppression Rule**: Automatically "preserve but don't alert" specific patterns. E.g., normal scans from Qualys don't fire every time.
- **Trusted IP List**: Known safe IPs don't generate Findings (e.g., company VPN egress IP).
- **Threat IP List**: Custom malicious IP list—actively detect communication with these.

> ⚠️ **Pitfall**: Suppression Rule and Trusted IP List differ in effect. **Trusted IP List** prevents Finding generation entirely for that IP, so if that IP later becomes compromised, GuardDuty stays silent—creating a blind spot risk. **Suppression Rule** still generates and preserves Findings but hides from console/alerts—data remains for post-incident review. So "briefly suppress false positive" is safer with Suppression; Trusted IP should apply only to truly controlled infrastructure IPs. For exams, "reduce false positive yet keep audit records" → Suppression Rule, not Trusted IP.

## GuardDuty Malware Protection — Agentless EBS Scanning

GuardDuty Malware Protection automatically (or on-demand) scans EBS volumes of EC2s with threat Findings for malware. The key: **scanning without touching the instance**—takes target EBS snapshot, mounts it in isolated GuardDuty service account environment to scan—no performance impact on production, and undetectable to attacker (no agent to disable). Separate billing; container runtime monitoring (EKS, ECS Fargate) also offered.

> 🎯 **Scenario**: "GuardDuty detected `CryptoCurrency:EC2/BitcoinTool.B!DNS`(Severity 8.5) on production EC2. Automate ①forensic evidence preservation ②network isolation ③malware check ④ops team alert without humans." → EventBridge rule filters `severity >= 7` AND `type prefix CryptoCurrency:EC2/` → calls SSM Automation Runbook: (1) create EBS snapshot, (2) trigger GuardDuty Malware Protection on-demand scan, (3) replace instance SG to sg-quarantine, (4) tag instance with incident-id, (5) SNS to Slack/PagerDuty, (6) Lambda create Jira ticket. **Don't terminate instance** (preserve evidence). Multi-account: Delegated admin account's EventBridge receives org-wide Findings, runs target account's SSM Runbook via cross-account role.

## Summary

Today's picture is four-fold. First, **threat detection is tension between signature-based and anomaly detection**; GuardDuty mixes threat intelligence (signatures) and ML behavioral analysis (anomalies), with Denning's statistical IDS model and base rate fallacy as underlying limits. Second, **GuardDuty is agentless, reading AWS's already-collected data plane logs** (CloudTrail, VPC Flow, DNS) directly, and Finding type naming conventions reveal what and how was caught. Third, **auto-isolation is GuardDuty → EventBridge → SSM Runbook chain**; step order (snapshot first, isolation not termination) and Severity/type filters are critical—the Capital One incident proved this automation's value. Fourth, **Organizations delegated admin + auto-enable controls multi-account uniformly**, Suppression/Trusted/Threat lists manage noise, and Findings flow as ASFF to Security Hub.

Next time we explore how those accumulated Findings are **unified, normalized, and auto-corrected through Security Hub**.

---

## 📝 연습 문제

**문제 1.** GuardDuty가 "에이전트 없이(agentless)" 동작할 수 있는 근본 이유는?

A) GuardDuty가 각 EC2에 경량 에이전트를 자동 배포해서

B) AWS가 이미 수집하는 데이터 평면 로그(CloudTrail, VPC Flow, Route 53 DNS)의 복제 스트림을 GuardDuty가 직접 받아 분석하므로 별도 수집 인프라나 에이전트가 필요 없어서

C) GuardDuty가 네트워크 패킷을 직접 가로채서

D) 사용자가 모든 로그를 수동으로 업로드해서

**정답: B**

해설: GuardDuty의 "켜기 버튼 하나"의 정체는 새 데이터 수집 인프라를 까는 게 아니라, AWS가 이미 기록하는 데이터 평면 로그 — CloudTrail(API 호출), VPC Flow Logs(네트워크 흐름), Route 53 Resolver(DNS 쿼리) — 의 복제 스트림을 내부적으로 직접 받아 분석하는 것이다. 그래서 사용자가 VPC Flow Logs를 따로 활성화·저장하지 않아도 GuardDuty는 흐름을 본다. 예외적으로 EKS/ECS Runtime Monitoring과 EBS Malware Protection은 경량 에이전트나 스냅샷 스캔을 추가로 쓴다. 에이전트 자동 배포(A)나 수동 업로드(D)는 GuardDuty의 모델이 아니다.

---

**문제 2.** 침해가 매우 드문 환경(예: 100만 이벤트당 1건)에서 탐지기의 정확도가 99%여도 알람의 대다수가 false positive가 되는 통계적 현상은? GuardDuty가 이에 대응하는 장치는?

A) CAP 정리 — Severity 점수로 대응

B) 기저율의 오류(base rate fallacy) — Severity 점수, Suppression Rule, Trusted IP List로 알람 피로를 줄여 대응

C) 무어의 법칙 — 더 빠른 하드웨어로 대응

D) 비둘기집 원리 — region 분산으로 대응

**정답: B**

해설: 기저율의 오류는 사건의 사전 확률(기저율)이 극히 낮을 때, 탐지기 정확도가 높아도 양성 판정의 대부분이 거짓 양성이 되는 베이즈 추론의 결과다. 침입 탐지의 근본 난제이며, 데닝의 통계적 IDS 모델 이래 핵심 문제로 남아 있다. GuardDuty는 Severity 점수(위협 심각성 × 탐지 신뢰도)로 우선순위를 매기고, Suppression Rule·Trusted IP List로 알려진 정상 패턴을 걸러 운영팀의 알람 피로를 줄인다. "탐지는 쉽고, 알람 피로 없이 탐지하는 게 어렵다"가 핵심이다. CAP(A)·무어(C)·비둘기집(D)은 무관하다.

---

**문제 3.** GuardDuty Severity 점수가 동일한 공격 유형인데도 케이스마다 다르게 나오는 이유로 가장 정확한 것은?

A) Severity는 무작위로 부여된다

B) Severity는 위협의 심각성뿐 아니라 탐지 신뢰도(confidence)를 함께 반영하므로, "성공 후 추가 활동이 관측됨" 같은 확신 요소가 점수를 높인다

C) Severity는 인스턴스 타입에 비례한다

D) Severity는 계정 나이에 따라 정해진다

**정답: B**

해설: GuardDuty Severity는 단순한 "공격 위험도"가 아니라 위협의 심각성 × 신뢰도를 함께 반영한다. 같은 `SSHBruteForce`라도 "성공 후 추가 활동(권한 상승·데이터 접근)이 관측됨"이면 침해 신뢰도가 올라 점수가 뛴다. 반대로 "엄청난 공격처럼 보이지만 확신이 낮음"은 중간 점수에 머문다. DOP에서 "왜 이 Finding의 severity가 예상보다 낮은가"의 답은 종종 "탐지 신뢰도가 아직 낮아서"다. 무작위(A)·인스턴스 타입(C)·계정 나이(D)는 근거 없다.

---

**문제 4.** GuardDuty Critical Finding(`Backdoor:EC2/C&CActivity.B!DNS`) 발견 시 SSM Automation Runbook으로 자동 대응한다. 단계 순서로 가장 올바른 것은?

A) 인스턴스 즉시 종료 → 스냅샷 → 알림

B) EBS 스냅샷(포렌식 보존) → 격리 SG로 교체(네트워크 격리, 종료 아님) → IAM 역할 무력화 → 태그 → 알림

C) 알림 → 운영자 승인 대기 → 수동 종료

D) IAM 역할 삭제 → 인스턴스 재부팅 → 스냅샷

**정답: B**

해설: 자동 격리 단계의 순서가 중요하다. 포렌식 증거 보존을 위해 EBS 스냅샷을 가장 먼저 떠야 한다 — 인스턴스를 종료하거나 오염시킨 뒤엔 메모리·디스크 상태가 사라져 조사가 불가능하다. "격리"는 인스턴스 종료가 아니라 격리 SG(모든 아웃바운드 차단 + 포렌식 점프박스 인바운드만 허용)로 네트워크만 끊어 C2 통신을 차단하면서 조사자 접근은 남기는 것이다. 즉시 종료(A)나 재부팅(D)은 증거 인멸이고, 수동 승인 대기(C)는 "사람 없이 즉시 대응"이라는 자동화 목표에 어긋난다.

---

**문제 5.** 수백 개 계정 조직에서 기존 계정은 물론 앞으로 생성될 모든 신규 계정에도 GuardDuty가 자동 활성되고, Finding이 중앙 집계되게 하려면?

A) 각 계정 관리자가 콘솔에서 수동으로 GuardDuty를 켠다

B) 관리 계정(management account)에서 모든 탐지를 직접 운영한다

C) Audit 계정을 GuardDuty 위임 관리자(Delegated Administrator)로 지정하고 auto-enable을 ALL/NEW로 설정한다

D) Lambda로 매일 신규 계정을 스캔해 GuardDuty를 켜는 스크립트를 돌린다

**정답: C**

해설: GuardDuty는 Organizations와 통합해 Audit 계정을 위임 관리자로 지정하면 조직 전체를 중앙 통제한다. auto-enable을 ALL(기존)·NEW(신규)로 설정하면 새로 만들어지는 계정도 자동으로 GuardDuty가 켜져, 사람이 새 계정마다 켜는 걸 잊는 사고를 원천 차단한다. 위임 관리자 패턴은 관리 계정에 권한을 몰지 않고 보안 운영을 Audit 계정에 분리하는 관심사 분리·폭발 반경 축소 원칙의 적용이다. 수동(A)·관리 계정 직접 운영(B)·커스텀 스크립트(D)는 모두 누락·운영 부담의 위험이 있는 안티패턴이다.

---

**문제 6.** false positive를 줄이고 싶지만, 나중에 그 IP/패턴이 실제로 침해됐을 때를 대비해 사후 조사용 기록은 남기고자 한다. 올바른 선택은?

A) Trusted IP List에 추가해 Finding 생성 자체를 막는다

B) Suppression Rule을 만들어 Finding은 생성·보존하되 콘솔/알림에서만 숨긴다

C) GuardDuty를 끈다

D) 해당 region 전체를 비활성화한다

**정답: B**

해설: Trusted IP List는 해당 IP에 대한 Finding 생성 자체를 막으므로, 그 IP가 나중에 침해돼도 GuardDuty가 침묵하는 사각지대가 된다. 반면 Suppression Rule은 Finding을 여전히 생성·보존하되 콘솔/알림에서만 숨기므로, 사후 조사 시 데이터가 남아 있다. "false positive는 줄이되 감사용 기록은 보존"이라는 요구에는 Suppression Rule이 맞다. GuardDuty를 끄거나(C) region을 비활성화(D)하면 탐지 공백이 생긴다.

---

**문제 7.** GuardDuty Finding이 자동으로 ASFF(AWS Security Finding Format)로 변환되어 Security Hub로 전송되는 설계가 주는 핵심 이점은?

A) Finding의 저장 비용이 사라진다

B) 서로 다른 탐지 소스(GuardDuty·Inspector·Macie)의 출력이 같은 표준 스키마로 정규화되어, 다운스트림(중복 제거·우선순위화·자동 수정 파이프라인)을 소스마다 새로 짤 필요가 없어진다

C) Finding이 자동으로 수정된다

D) GuardDuty가 더 빨리 탐지하게 된다

**정답: B**

해설: ASFF는 보안 데이터의 정규화 문제에 대한 답으로, 여러 탐지기의 서로 다른 출력 형식을 하나의 표준 스키마로 통일한다. 이는 표준 인터페이스(adapter pattern) 사상의 구현으로, Security Hub가 중복 제거·우선순위화를 하고 EventBridge 필터·자동 수정 Lambda 같은 다운스트림을 소스마다 다시 작성하지 않아도 되게 한다 — 통합 보안 자동화의 전제 조건이다. 저장 비용(A)·자동 수정(C)·탐지 속도(D)와는 직접 관련이 없다.

---

## 📌 Today's Summary

Today's key points are four-fold. First, threat detection is tension between signature-based and anomaly detection; GuardDuty mixes threat intelligence and ML behavioral analysis, with Denning's statistical IDS and base rate fallacy as underlying constraints. Second, GuardDuty is agentless, reading AWS's already-collected data plane logs (CloudTrail, VPC Flow, DNS) directly; Finding type naming conventions reveal what and how was caught. Third, auto-isolation is GuardDuty → EventBridge → SSM Runbook chain; step order (snapshot first, isolation not termination) and Severity/type filters are critical; Capital One incident proved this automation's value. Fourth, Organizations delegated admin + auto-enable controls multi-account uniformly, Suppression/Trusted/Threat lists manage noise, and Findings flow as ASFF to Security Hub.
