# Day 5 - Week 9 Synthesis: Integrated Review of Threat Detection Scenarios

This week covered the entire threat detection layer: GuardDuty (agentless threat detection), Detective (finding investigation, root cause), Inspector (vulnerability scanning), and Security Hub-centric unified architecture. Today we bind these into one decision framework. Exams test less on individual service features and more on *"which detection tool, in what role, deployed where for this situation?"* The key is **2D thinking: purpose (what do you want to know?) × integration (how do you bind it into one pipeline?).**

## Unified Decision Matrix: Requirement → Tool

| Requirement/Situation | Primary Tool | Core Reason |
|-----------|----------|-----------|
| Detect credential misuse, malicious communication real-time | GuardDuty (Foundation) | Agentless, analyzes CloudTrail/Flow/DNS |
| Host-internal process, file malicious behavior | GuardDuty Runtime Monitoring | Runtime visibility (lightweight agent) |
| EC2 malware infection suspected scan | GuardDuty Malware Protection (EBS) | Snapshot-based, no agent required |
| EC2/ECR/Lambda CVE vulnerability discovery | Inspector | Continuous scan + context-based priority |
| Track images through post-disclosure CVEs | Inspector ECR continuous scanning | Re-evaluate after push |
| Finding root cause, blast radius, lateral movement investigation | Detective | Activity graph, baseline comparison |
| Bundle related findings to reduce alert fatigue | Detective finding groups | Campaign-level grouping |
| Standardize, aggregate findings from multiple tools | Security Hub (ASFF) | Single pane + correlation |
| Evaluate compliance controls (CIS/FSBP) | Security Hub standard checks | Configuration best practice assessment |
| Single view of multi-region findings | Security Hub aggregation Region | Cross-region aggregation |
| Detect → auto-response (isolate/patch/ticket) | Security Hub → EventBridge → Lambda/SSM | SOAR unification |
| Automatically include new accounts | Delegated admin + auto-enable | Eliminate blind spots |
| S3 sensitive data (PII) classification | Macie | Data classification (not threat detection) |

> 💡 **Related Theory**: This matrix's foundation is NIST CSF's *Detect* function and the division of prevention-detection-response. When prevention (IAM, encryption, WAF) is breached, the detection layer discovers "threats (GuardDuty) + vulnerabilities (Inspector)," investigation (Detective) interprets findings, and aggregation/automation (Security Hub+EventBridge) operates. Exam "best" answers usually combine *purpose-matched specialist tool + Security Hub integration + Security Tooling account delegation*.

## Purpose-Driven Thinking: "Detect" vs "Investigate" vs "Block"

The same incident can split across different answers by *verb*. Read the problem's verb first:

- **"Detect"** → GuardDuty (threats) or Inspector (vulnerabilities). Finds *generate* findings.
- **"Investigate, root cause"** → Detective. Tool *explains* findings (generates none).
- **"Aggregate, standardize, single pane"** → Security Hub. Tool *collects* findings.
- **"Prevent/block"** → WAF/SG/NACL/Network Firewall. Detection tools do NOT block.
- **"Auto-respond"** → EventBridge + Lambda/SSM/Step Functions.

> ⚠️ **Trap Collection**:
> - Mistaking Detective for "detection tool" (actually investigation — generates no findings).
> - Mistaking Security Hub for "threat detection tool" (actually aggregation, orchestration).
> - Mistaking GuardDuty/Inspector for "blocking tools" (detects only — blocking is separate automation).
> - Assuming GuardDuty Foundation sees inside hosts (only network/API — Runtime Monitoring needed).
> - Assuming Inspector EC2 scan works without SSM management (agent-based needs SSM).
> - Assuming GuardDuty DNS findings work with custom DNS resolvers (needs VPC default resolver).
> - Assuming ECR on-push catches post-disclosure CVEs (needs continuous).
> - Assuming Security Hub findings are global (per-region — aggregation Region needed).

## Integrated Scenario A: Full Pipeline for Single Breach

> 🎯 **Scenario A**: "Internet-exposed EC2 appears breached. Should have known weakness beforehand, detected attack, investigated root cause, auto-isolated and ticketed. 50-account organization."
>
> **Answer**:
> 1. **Inspector**: Continuously identify critical CVEs on exposed EC2 (reachability, exploit weighting priority).
> 2. **GuardDuty**: Detect `UnauthorizedAccess:EC2/SSHBruteForce` + anomalous outbound. Host-internal suspicion → Runtime Monitoring, malware suspicion → Malware Protection.
> 3. **Detective**: Investigate breached instance role's new-region, new-API reconnaissance, same IP contacting other instances (lateral movement).
> 4. **Security Hub**: Aggregate findings 1–3 to ASFF → **EventBridge** → Lambda (move to isolation SG + snapshot + revoke credentials) + Jira ticket.
> 5. **Baseline**: Align all service delegated admins to Security Tooling account + auto-enable.

## Integrated Scenario B: Multi-Account, Multi-Region Detection Baseline

> 🎯 **Scenario B**: "Hundreds of accounts, multiple regions. Auto-include new accounts, prevent workload teams from disabling detection, view all findings in one pane, store logs where attackers can't touch."
>
> **Answer**:
> - Align **Security Tooling account** as *common delegated admin* for GuardDuty, Security Hub, Detective, Inspector, Macie, Access Analyzer.
> - Organization mode + **auto-enable** auto-includes new accounts, members cannot disable.
> - Security Hub **aggregation Region** aggregates multi-region findings into single region.
> - **Log Archive account** immutably (write-once) retains CloudTrail/Config logs — separated from detection account (duty separation).
> - Central EventBridge bus → unified response automation.

## Complete Summary of Common Confusions

**GuardDuty vs Inspector** — threat (real malicious activity, detective) vs vulnerability (exploitable weakness, preventive). Different timing.

**GuardDuty vs Detective** — detection (generates finding) vs investigation (explains finding). Detective generates no findings.

**Detective vs Security Hub** — deep investigation (narrow and deep, activity graph) vs aggregation and normalization (broad and shallow, ASFF). Complementary.

**Security Hub vs GuardDuty/Inspector** — aggregation and orchestration hub vs specialist detectors. Security Hub does not directly detect threats (standard control evaluation is an exception).

**Detection tools vs Prevention tools** — GuardDuty/Inspector/Detective/Security Hub *detect, investigate, aggregate* only. Blocking is WAF/SG/NACL/Network Firewall + automation's job.

**GuardDuty Malware Protection vs Inspector** — former *scans malware* (malicious files), latter *scans CVE vulnerabilities* (packages). Different targets.

**Macie vs Detection tools** — Macie is S3 *sensitive data classification* (PII), not threat detection.

## Visibility and Operations: Detection Completes as Pipeline

Detection maturity splits not on "findings emerge" but "findings *correlate, investigate, respond*":

```
[Prevention fails] → Inspector (weakness) + GuardDuty (threat) → Security Hub (aggregate, ASFF)
                                                                  ├─ Detective (investigate)
                                                                  └─ EventBridge → auto-respond
                                                                       (isolate/patch/ticket/alert)
```

Signal and integration per tool:
- **GuardDuty**: Finding → EventBridge (real-time) + Security Hub auto-integration.
- **Inspector**: Discovery → Security Hub + EventBridge → SSM Patch Manager (remediate).
- **Detective**: Investigation — from finding "Investigate in Detective" entry.
- **Security Hub**: ASFF aggregation + Insights correlation + automation rules + single EventBridge publication.

These signals connect to *actual isolation, forensics, recovery* workflows next week (incident response) — detection is incident response's entrance.

> 🔍 **Deeper**: The entire detection layer in one sentence: *"Discover with specialist tools, integrate via ASFF, investigate with Detective, respond via EventBridge, delegate to Security Tooling account."* On exams, "best" answers for detection nearly always contain some piece of this unified pattern. Traps usually stem from role confusion (investigation as detection, aggregation as detection, detection as blocking) or missing prerequisites (no SSM management, custom DNS, on-push only, auto-enable not set, aggregation Region not specified). Read verb and prerequisites first.

## One-Sentence Checklist

- [ ] Read the problem's verb (detect/investigate/aggregate/block/respond) first to choose tool
- [ ] Distinguish GuardDuty Foundation vs protective plans (Runtime/Malware) per situation
- [ ] Verify Inspector scan prerequisites (SSM management, ECR continuous)
- [ ] Position Detective precisely as investigation, not detection
- [ ] Understand Security Hub as aggregation, orchestration hub (ASFF)
- [ ] Align all detection service delegated admins to Security Tooling account + auto-enable
- [ ] Bind multi-region and auto-response via aggregation Region and EventBridge automation

---

## 📝 연습 문제

**문제 1.** 인터넷에 노출된 EC2가 침해된 것으로 보인다. 50개 계정 조직에서 (a) 사전에 약점을 알고, (b) 공격을 탐지하고, (c) 근본원인을 조사하고, (d) 자동으로 격리·티켓팅하려 한다. 가장 적절한 통합 설계는?

A) GuardDuty 하나만 켜고 나머지는 수동으로 처리한다  
B) Inspector(취약점) + GuardDuty(위협) + Detective(조사) + Security Hub 집계 → EventBridge → Lambda/SSM 자동 대응, 모두 Security Tooling 계정에 위임  
C) WAF와 Shield만으로 모든 것을 처리한다  
D) CloudTrail 로그를 Athena로 수동 쿼리해 사람이 분석한다  

**정답: B**  
해설: 네 요구가 서로 다른 탐지 기능에 대응하므로 전문 도구를 통합해야 한다. Inspector가 사전 약점을, GuardDuty가 공격을, Detective가 근본원인을 담당하고, Security Hub가 ASFF로 집계해 EventBridge로 격리·티켓 자동화를 트리거하며, 모든 서비스를 Security Tooling 계정에 위임해 멀티계정 일관성을 확보한다. GuardDuty 단독·WAF/Shield(예방)·수동 Athena 분석은 이 통합 요구를 충족하지 못한다.

---

**문제 2.** 한 분석가가 "Amazon Detective로 위협을 실시간 탐지하고 악성 트래픽을 차단하겠다"고 설계했다. 이 설계의 오류는?

A) Detective는 멀티계정에서 동작하지 않는다  
B) Detective는 탐지나 차단을 하지 않고, 기존 핀딩·로그를 조사·근본원인 분석하는 도구다 — 탐지는 GuardDuty, 차단은 WAF/SG의 역할이다  
C) Detective는 EC2만 지원한다  
D) Detective는 비용이 너무 비싸다  

**정답: B**  
해설: Detective는 핀딩을 생성하거나 트래픽을 차단하지 않으며, GuardDuty 등이 만든 핀딩과 로그를 동작 그래프로 조사해 "왜·어디까지·어떻게"를 분석하는 조사 전용 도구다. 위협 탐지는 GuardDuty, 차단은 WAF/SG/NACL의 역할이다. Detective는 멀티계정을 지원하며 EC2 외 다양한 엔티티를 다루므로 나머지 보기는 틀렸다.

---

**문제 3.** Inspector를 켰는데 일부 EC2가 스캔되지 않고, GuardDuty는 호스트 내부 악성 프로세스를 탐지하지 못한다. 두 문제의 올바른 해결 조합은?

A) Inspector는 SSM 관리 상태(또는 agentless) 확인, GuardDuty는 Runtime Monitoring 활성화  
B) 둘 다 VPC Flow Logs를 S3에 저장하면 해결된다  
C) Inspector는 ECR continuous를 켜고, GuardDuty는 Trusted IP를 추가한다  
D) 둘 다 Security Hub만 켜면 자동 해결된다  

**정답: A**  
해설: Inspector의 EC2 에이전트 기반 스캔은 인스턴스가 SSM으로 관리되어야 하므로 SSM 상태를 확인(또는 agentless 사용)해야 하고, GuardDuty 기초는 네트워크/API만 보므로 호스트 내부 프로세스 가시성은 Runtime Monitoring으로 확보한다. Flow Logs 저장·ECR continuous(이미지 대상)·Trusted IP(핀딩 억제)·Security Hub(집계)는 이 두 문제의 직접 해결책이 아니다.

---

**문제 4.** 멀티리전·다계정 조직에서 신규 계정이 자동으로 탐지에 포함되고, 모든 리전 핀딩을 단일 창에서 보며, 워크로드 팀이 탐지를 끄지 못하게 하려 한다. 가장 적절한 베이스라인은?

A) 각 계정·리전에서 서비스를 수동으로 켜고 콘솔을 번갈아 본다  
B) 탐지 서비스를 Security Tooling 계정에 위임 + auto-enable + Security Hub aggregation Region 구성  
C) 관리(management) 계정에서 모든 것을 직접 운영한다  
D) 핀딩을 이메일로만 받는다  

**정답: B**  
해설: 위임 관리자(Security Tooling 계정) + 조직 모드 auto-enable은 신규 계정 자동 포함과 멤버의 임의 비활성화 방지를 동시에 달성하고, Security Hub aggregation Region은 멀티리전 핀딩을 단일 리전에 집계한다. 수동 활성화·콘솔 순회는 사각지대를 낳고, 관리 계정 직접 운영은 권한 집중 위험이며, 이메일 수신만으로는 통합·자동화가 불가능하다.

---

**문제 5.** 다음 중 이번 주 탐지 통합에서 "함정"으로 자주 지적되는 항목이 아닌 것은?

A) Detective를 위협 탐지·차단 도구로 오인하는 것  
B) GuardDuty 기초만으로 호스트 내부 프로세스를 본다고 가정하는 것  
C) 모든 탐지 서비스의 위임 관리자를 동일 Security Tooling 계정으로 정렬하고 auto-enable을 켜는 것  
D) Security Hub 핀딩이 모든 리전에 글로벌로 보인다고 가정하는 것  

**정답: C**  
해설: 모든 탐지 서비스를 동일 Security Tooling 계정에 위임하고 auto-enable을 켜는 것은 함정이 아니라 *권장 베이스라인*이다 — 데이터·권한·조사 일관성과 신규 계정 자동 포함을 보장한다. 나머지는 모두 실제 빈출 함정이다: Detective는 조사 도구이지 탐지·차단이 아니고, GuardDuty 기초는 호스트 내부를 못 보며(Runtime Monitoring 필요), Security Hub 핀딩은 리전별이라 aggregation Region이 필요하다. 함정이 *아닌* 것을 고르는 문제이므로 정답은 위임 정렬 구성이다.

---
