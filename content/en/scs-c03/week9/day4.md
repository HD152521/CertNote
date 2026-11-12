# Day 4 - Detection Integration: GuardDuty + Security Hub + Detective + Inspector One Picture, Multi-Account Detection Baseline

The past four days examined individual detection-layer tools: GuardDuty (threat detection), Detective (investigation), Inspector (vulnerability). But in real security operations, they are not used *separately* — each spills findings, and analysts hop between four consoles viewing the same incident four times. Today's theme is to unify these tools into **one consistent detection architecture**. The glue holding it together is **AWS Security Hub**.

Core insight: GuardDuty, Inspector, Detective, Macie, IAM Access Analyzer etc. are each *specialized detectors*, while Security Hub is the **aggregation and orchestration hub** that collects their outputs into *standard format, prioritizes, correlates, and automates* them on one screen. Exams repeatedly ask "how do you unify these signals into a single operations window?"

## Security Hub: The Aggregation Center and ASFF

Security Hub has two functions:

```
1) Standard Checks (Security Standards): Automatically evaluates compliance
   controls from CIS, AWS FSBP, PCI DSS, NIST, etc. → "Is configuration compliant?"

2) Findings Aggregation: Takes findings from integrated services and
   standardizes them into ASFF (AWS Security Finding Format) in one place
```

**ASFF (AWS Security Finding Format)** is the unification key. GuardDuty findings, Inspector results, Macie findings are originally different formats — Security Hub normalizes them to *common JSON schema (ASFF)*. So despite different sources, you can search, filter, and correlate by identical fields (severity, resource, type).

```
GuardDuty ─┐
Inspector ─┤
Macie     ─┼─▶ Security Hub ─(ASFF normalization)─▶ Single findings view
Access Analyzer ┤                                    ├─ Sort/filter by severity, resource
Third-party ────┘                                    ├─ Insights (correlation groups)
                                                     └─ Published to EventBridge
```

> 💡 **Related Theory**: This is the cloud-native implementation of *SIEM/SOAR* paradigm. SIEM (Security Information and Event Management) *normalizes and aggregates* scattered security events, SOAR (Security Orchestration, Automation and Response) triggers *automated response* on top. Security Hub normalizes via ASFF (SIEM's normalization layer) and triggers response via EventBridge and automation rules (SOAR). Without a standard schema, different tool formats make correlation and automation impossible — ASFF is that lingua franca.

## How Four Tools Collaborate on One Incident

Let's see the four tools' cooperation through one breach scenario:

```
[Prevention]  Inspector: "This EC2's OpenSSL has critical CVE + reachable from internet"
                 │ (aggregated by Security Hub — patch priority target)
                 ▼ (attacked before patch)
[Detection]   GuardDuty: "UnauthorizedAccess:EC2/SSHBruteForce → followed by anomalous outbound"
                 │ (aggregated by Security Hub, severity High)
                 ▼
[Investigation] Detective: "This instance's role started IAM API reconnaissance from new region,
                            same IP also contacted other instances — lateral movement suspected"
                 ▼
[Response]    Security Hub → EventBridge → Lambda/SSM:
                 Move instance to isolation SG + forensic snapshot + revoke credentials + ticket
```

- **Inspector** pre-identifies weak points (patch priority).
- **GuardDuty** detects actual attack.
- **Detective** investigates root cause and blast radius.
- **Security Hub** collects all on one screen and triggers auto-response via **EventBridge**.

> ⚠️ **Trap**: GuardDuty and Inspector findings integrate into Security Hub **automatically**, but integration must be *enabled* (turn on integration). Also, Security Hub does NOT do *investigation* (that's Detective), does NOT directly *detect threats* (that's GuardDuty/Inspector). Security Hub is *aggregation, normalization, and automation orchestration*. Role confusion is a frequent trap.

## Security Hub Insights and Correlation

Security Hub **Insights** are *saved filter/correlation views* grouping findings by specific criteria. Example: gather findings that are "publicly exposed + critical severity + specific account" to see trends. Managed Insights exist and custom ones can be created. This extracts "what's most dangerous now" from thousands of findings — the correlation tool.

Security Hub's **automation rules** automatically adjust severity, suppress, or update fields per finding attributes (e.g., findings from known test account auto-suppress). This reduces alert fatigue operationally.

## Multi-Account Detection Baseline: One Blueprint

Recommended detection baseline config for enterprise multi-account:

```
AWS Organizations
  │
  ├─ Management Account — designation only, minimal operational burden
  │
  ├─ Security Tooling Account ◀── Aligned delegated admin of all detection services
  │     ├─ GuardDuty delegated admin (org + auto-enable)
  │     ├─ Security Hub delegated admin (org + standards + aggregation)
  │     ├─ Detective delegated admin (single activity graph)
  │     ├─ Inspector delegated admin (EC2/ECR/Lambda continuous scan)
  │     ├─ Macie / IAM Access Analyzer delegated admin
  │     └─ Central EventBridge bus → auto-response (Lambda/SSM/Step Functions)
  │
  ├─ Log Archive Account — immutable retention of CloudTrail/Config/logs (write-once)
  │
  └─ Workload Accounts — detection members (cannot disable), findings flow to Security Tooling
```

Core principles:
- **Align delegated admin of all detection services to the same Security Tooling account** (data, authority, investigation experience consistency).
- **auto-enable** for new accounts automatically included — no blind spots.
- **Security Hub cross-region aggregation** pulls multi-region findings into single region.
- **Logs immutably retained in separate Log Archive account** (separated from detection account — duty separation).

> 💡 **Related Theory**: This is the core pattern of AWS *Security Reference Architecture (SRA)*. Delegating security tools to a dedicated account separate from workloads achieves *separation of duties* — workload teams cannot disable their own detection or erase findings, logs are immutably stored in a separate account attackers cannot touch. SRA emphasizes "don't burden the management account with operations, delegate it" because the management account concentrates organization root credentials and must be most protected.

> ⚠️ **Trap**: Security Hub findings are **per-region**. In multi-region environments viewing only one region console misses threats in other regions — must enable **aggregation Region** to turn on cross-region aggregation. Also, delegated admin designation must be done *per service* (GuardDuty delegated separately, Security Hub delegated separately). It doesn't happen all at once.

## From Findings to Response: Unified Automation

The exit of the unified architecture is always *automated response*:

```
Security Hub (aggregation) ──▶ EventBridge (custom event bus)
                                  ├─▶ Lambda: isolate resource/tag/revoke credentials
                                  ├─▶ SSM Automation: patch/configuration remediation
                                  ├─▶ Step Functions: multi-step response workflow
                                  ├─▶ SNS: on-call notification (Slack/PagerDuty)
                                  └─▶ Jira/ServiceNow: ticket creation
```

Security Hub publishes all integrated service findings to a single EventBridge stream, so *one* auto-response covers multiple detectors — no need to write separate automation per tool (operational benefit of integration).

> 🔍 **Deeper**: Real value of integration is not the "single pane of glass" slogan but *correlation* and *automation unification*. Running four tools separately means (1) seeing the same incident four times, (2) maintaining four separate per-tool automations, (3) manually assembling the full picture (vulnerability → attack → impact). Security Hub-centered integration binds correlation via ASFF, automation unification via EventBridge, investigation depth via Detective into one pipeline. "Best detection architecture" on SCS-C03 almost always answers with *this integration pattern + Security Tooling account delegation*.

## Common Confusions

- **Security Hub vs GuardDuty/Inspector**: The latter are *detectors* (generate findings), Security Hub is *aggregator and orchestrator*. Security Hub does not directly detect threats (except for its own standard check controls, which it evaluates).
- **Security Hub vs Detective**: Security Hub is *aggregation/normalization*, Detective is *deep investigation*. Broad and shallow vs narrow and deep.
- **ASFF**: The *common schema for findings* — prerequisite for integration, correlation, automation.
- **Delegated admin alignment**: Align all detection services to the *same* Security Tooling account — exam baseline answer.

## One-Sentence Checklist

- [ ] Enabled Security Hub and activated integrations with GuardDuty, Inspector, Macie, etc.
- [ ] Aligned all detection service delegated admins to same Security Tooling account
- [ ] auto-enable enabled for new accounts automatically included, no blind spots
- [ ] aggregation Region set to collect multi-region findings in single region
- [ ] Security Hub → EventBridge unified auto-response
- [ ] Logs immutably retained in separate Log Archive account, duty separation achieved

---

## 📝 Practice Questions

**Question 1.** The security team views the findings of GuardDuty, Inspector, and Macie separately because of their different formats, making correlation analysis and automation difficult. How can they be gathered in one place in a standard format and responded to with a single automation?

A) Bookmark each service's console and switch between them  
B) Enable Security Hub to normalize and aggregate findings in ASFF and unify the response with EventBridge  
C) Investigate all findings with Detective  
D) Store all findings in CloudWatch Logs  

**Answer: B**  
Explanation: Security Hub normalizes the findings of integrated services into the common schema ASFF, aggregates them in one pane, and publishes them as a single EventBridge stream so that one automation covers multiple detectors. Bookmarking consoles is not integration, Detective is an in-depth investigation tool rather than an aggregator, and simply storing logs provides no standardization, correlation, or automation.

---

**Question 2.** What is the recommended multi-account baseline when operating GuardDuty, Security Hub, Detective, and Inspector in a 50-account organization?

A) Distribute by delegating each detection service to a different account  
B) Align the delegated administrator of all detection services to the same Security Tooling account and turn on auto-enable  
C) Operate all detection services directly in the management account  
D) Turn on all services individually in each workload account and manage them separately  

**Answer: B**  
Explanation: The AWS SRA recommended pattern is to align the delegated administrator of all detection services, such as GuardDuty, Security Hub, Detective, and Inspector, to a dedicated Security Tooling account for consistent data, permissions, and investigation experience, and to include new accounts automatically with auto-enable. Distributing services across accounts fragments investigation, operating directly in the management account burdens an account with concentrated root privileges, and per-account individual operation creates blind spots.

---

**Question 3.** An organization operating in multiple Regions looked only at the Security Hub console in one Region and missed critical findings in another Region. What is the correct configuration?

A) Move all workloads to one Region  
B) Designate a Security Hub aggregation Region to aggregate findings from multiple Regions into a single Region cross-Region  
C) Have a separate security team in each Region  
D) Turn on only GuardDuty in multiple Regions  

**Answer: B**  
Explanation: Security Hub findings exist per Region, so you must designate an aggregation Region to view and manage findings from multiple Regions in a single Region and eliminate multi-Region blind spots. Moving workloads is impractical, separating teams per Region does not provide unified visibility, and turning on only GuardDuty does not solve the Security Hub aggregation problem.

---

**Question 4.** Which statement about the role of Security Hub is most accurate?

A) It directly inspects network traffic and blocks malicious connections  
B) It is a hub that standardizes and aggregates the findings of integrated detection services in ASFF and orchestrates correlation and automation, and it also evaluates standards compliance controls  
C) It classifies PII in S3  
D) It scans EBS volumes for malware  

**Answer: B**  
Explanation: Security Hub normalizes the findings of GuardDuty, Inspector, Macie, and others into the common ASFF schema and aggregates them, orchestrates correlation and response automation with Insights, automation rules, and EventBridge, and also evaluates standards controls such as CIS and FSBP. Traffic blocking, PII classification (Macie), and malware scanning (GuardDuty Malware Protection) are the roles of other services.

---

**Question 5.** In an integrated detection architecture, which option correctly matches the role of each service when a breach occurs?

A) Inspector=investigation, GuardDuty=aggregation, Detective=vulnerabilities, Security Hub=blocking  
B) Inspector=proactive vulnerability identification, GuardDuty=threat detection, Detective=root cause investigation, Security Hub=aggregation and automation orchestration  
C) All services detect and block threats in the same way  
D) Security Hub=investigation, Detective=aggregation, GuardDuty=vulnerabilities, Inspector=blocking  

**Answer: B**  
Explanation: In an integrated pipeline, Inspector proactively identifies exploitable vulnerabilities, GuardDuty detects actual threat activity, Detective investigates root cause and scope of impact, and Security Hub aggregates and standardizes all of this and orchestrates the response through EventBridge. The other options are wrong because they mix up the roles or treat all services as identical.

---
