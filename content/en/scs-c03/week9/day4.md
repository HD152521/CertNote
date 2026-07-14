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

## 📝 연습 문제

**문제 1.** 보안팀이 GuardDuty, Inspector, Macie의 핀딩을 서로 다른 형식 때문에 따로따로 보고 있어 상관 분석과 자동화가 어렵다. 이들을 표준 형식으로 한곳에 모으고 단일 자동화로 대응하려면?

A) 각 서비스의 콘솔을 북마크해 번갈아 본다  
B) Security Hub를 활성화해 핀딩을 ASFF로 정규화·집계하고 EventBridge로 대응을 단일화한다  
C) Detective로 모든 핀딩을 조사한다  
D) CloudWatch Logs에 모든 핀딩을 저장한다  

**정답: B**  
해설: Security Hub는 통합 서비스들의 핀딩을 공통 스키마인 ASFF로 정규화해 한 화면에 집계하고, 단일 EventBridge 스트림으로 발행해 하나의 자동화로 여러 탐지기를 커버한다. 콘솔 북마크는 통합이 아니고, Detective는 집계가 아닌 심층 조사 도구이며, 단순 로그 저장은 표준화·상관·자동화를 제공하지 않는다.

---

**문제 2.** 50개 계정 조직에서 GuardDuty·Security Hub·Detective·Inspector를 운영할 때 권장되는 멀티계정 베이스라인은?

A) 각 탐지 서비스를 서로 다른 계정에 위임해 분산한다  
B) 모든 탐지 서비스의 위임 관리자를 동일한 Security Tooling 계정으로 정렬하고 auto-enable을 켠다  
C) 모든 탐지 서비스를 관리(management) 계정에서 직접 운영한다  
D) 워크로드 계정마다 개별로 모든 서비스를 켜고 따로 관리한다  

**정답: B**  
해설: AWS SRA 권장 패턴은 GuardDuty·Security Hub·Detective·Inspector 등 모든 탐지 서비스의 위임 관리자를 전용 Security Tooling 계정으로 정렬해 데이터·권한·조사 경험을 일관되게 하고, auto-enable로 신규 계정을 자동 포함하는 것이다. 서비스를 여러 계정에 분산하면 조사가 단절되고, 관리 계정 직접 운영은 루트 권한 집중 계정에 부담을 주며, 계정별 개별 운영은 사각지대를 낳는다.

---

**문제 3.** 멀티리전으로 운영하는 조직이 한 리전 Security Hub 콘솔만 보다가 다른 리전의 critical 핀딩을 놓쳤다. 올바른 구성은?

A) 모든 워크로드를 한 리전으로 이전한다  
B) Security Hub aggregation Region을 지정해 여러 리전의 핀딩을 단일 리전에 크로스리전 집계한다  
C) 리전마다 별도 보안팀을 둔다  
D) GuardDuty만 멀티리전으로 켠다  

**정답: B**  
해설: Security Hub 핀딩은 리전별로 존재하므로, aggregation Region(집계 리전)을 지정해 여러 리전의 핀딩을 단일 리전에서 통합 조회·관리해야 멀티리전 사각지대를 없앤다. 워크로드 이전은 비현실적이고, 리전별 팀 분리는 통합 가시성을 주지 못하며, GuardDuty만 켜는 것은 Security Hub 집계 문제를 해결하지 못한다.

---

**문제 4.** Security Hub의 역할에 대한 설명으로 가장 정확한 것은?

A) 네트워크 트래픽을 직접 검사해 악성 연결을 차단한다  
B) 통합된 탐지 서비스들의 핀딩을 ASFF로 표준화·집계하고 상관·자동화를 오케스트레이션하는 허브이며, 표준 규정 준수 컨트롤도 평가한다  
C) S3의 PII를 분류한다  
D) EBS 볼륨에서 멀웨어를 스캔한다  

**정답: B**  
해설: Security Hub는 GuardDuty·Inspector·Macie 등의 핀딩을 ASFF 공통 스키마로 정규화해 집계하고, Insights·automation rules·EventBridge로 상관과 대응 자동화를 오케스트레이션하며, CIS·FSBP 같은 표준 컨트롤도 평가한다. 트래픽 차단·PII 분류(Macie)·멀웨어 스캔(GuardDuty Malware Protection)은 다른 서비스의 역할이다.

---

**문제 5.** 통합 탐지 아키텍처에서 침해 사건이 발생했을 때 각 서비스의 역할을 올바르게 짝지은 것은?

A) Inspector=조사, GuardDuty=집계, Detective=취약점, Security Hub=차단  
B) Inspector=사전 취약점 식별, GuardDuty=위협 탐지, Detective=근본원인 조사, Security Hub=집계·자동화 오케스트레이션  
C) 모든 서비스가 동일하게 위협을 탐지하고 차단한다  
D) Security Hub=조사, Detective=집계, GuardDuty=취약점, Inspector=차단  

**정답: B**  
해설: 통합 파이프라인에서 Inspector는 악용 가능한 취약점을 사전에 식별하고, GuardDuty는 실제 위협 활동을 탐지하며, Detective는 근본 원인·영향 범위를 조사하고, Security Hub는 이 모두를 집계·표준화하고 EventBridge로 대응을 오케스트레이션한다. 나머지 보기는 역할이 뒤섞이거나 모든 서비스를 동일시해 잘못되었다.

---
