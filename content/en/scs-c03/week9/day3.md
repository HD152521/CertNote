# Day 3 - Amazon Inspector: EC2/ECR/Lambda Vulnerability Scanning, CVE, Automated Assessment

If GuardDuty sees "right now someone is conducting malicious activity," then Amazon Inspector sees "before exploitation, where are the weaknesses?" GuardDuty detects *threats* (actual hostile activity) while Inspector detects *vulnerabilities* (exploitable weaknesses). The timing differs — vulnerabilities are potential weak points, threats are real activities exploiting those weak points (or entering by other routes). Secure operations require both: reduce weak points (Inspector) and catch breaches (GuardDuty).

The essence of Inspector (current Amazon Inspector, often called "Inspector v2") is: "**automatically and continuously** scan resources to find known vulnerabilities (CVEs) and dangerous exposures, and assign **prioritized scores** reflecting environmental context." Unlike the old v1 requiring manual assessment runs, enabling Inspector makes it rescan automatically as new resources arrive and new CVEs are disclosed.

## What Gets Scanned: Three Targets

```
Amazon Inspector Scan Targets
  ├─ EC2 instances           → OS package CVEs + network reachability
  ├─ ECR container images    → OS/language package CVEs in image layers
  └─ Lambda functions        → Function code + dependency package CVEs (+ code vulnerabilities)
```

- **EC2**: Examines two aspects — (1) **CVEs** in installed OS/application packages, (2) **network reachability analysis** (can the internet reach this port). Reachable vulnerabilities are higher risk.
- **ECR**: Scans container images as they are pushed. **on-push** (once at push) + **continuous** (repeated rescan) options. When new CVEs are disclosed, already-pushed images are re-evaluated.
- **Lambda**: Scans dependency package vulnerabilities (standard scanning) + optionally code vulnerabilities themselves (code scanning, e.g., hardcoded secrets, injection patterns).

## How Scanning Works: SSM Agent and Agentless

Two approaches exist for EC2 scanning:
- **Agent-based**: Collects in-instance package inventory via **SSM Agent** (Systems Manager). Works without additional installation if the instance is SSM-managed.
- **Agentless**: Takes EBS snapshots for analysis (covers instances not managed by SSM). Inspector intelligently chooses between them.

> ⚠️ **Trap**: Common reason "EC2 is registered with Inspector but not scanning" is **SSM Agent not installed/managed**. Agent-based scanning requires the instance to be SSM-managed (SSM Agent running + proper instance profile IAM role + SSM connectivity). Exams frequently test "Inspector can't scan instance → check SSM management state."

```
EC2 ── SSM Agent ── Systems Manager ── Inspector(collects package inventory, evaluates CVEs)
      OR
EC2 ── (No SSM) ── Inspector agentless(analyzes EBS snapshot)
```

> 💡 **Related Theory**: Vulnerability management belongs to NIST's *Identify* (ID.RA, risk assessment) function. The core loop is "discover → assess → prioritize → remediate → verify," ongoing. Old Inspector was *periodic assessment*, current Inspector is *continuous*. Why does this matter? The vulnerability landscape is not static. An image clean yesterday can become vulnerable today when new CVEs are disclosed. Only continuous scanning keeps up with "new risk in already-deployed assets."

## CVEs and Prioritization: Inspector Score vs CVSS

Inspector attaches a **CVE** identifier and **CVSS** base score to each found vulnerability. But prioritizing on CVSS alone creates noise. Inspector produces its own **Inspector score** reflecting environmental context:

```
Inspector Priority = CVSS base score
                   × Network reachability (can internet reach it?)
                   × Exploit availability (known exploit exists?)
                   × ... environment context
```

Example: Same CVSS 9.0, but (a) a vulnerability reachable from internet-facing port with public exploit = top priority, (b) a vulnerability unreachable in isolated subnet = lower priority. This *context-based prioritization* tells analysts "what to patch first."

> 💡 **Related Theory**: This is *risk-based vulnerability management*. You cannot patch thousands of vulnerabilities at once, so weighting "exploitability × exposure × impact" prioritizes. CVSS is the vulnerability's *intrinsic* severity, Inspector score is *your environment's* risk. External signals like EPSS (Exploit Prediction Scoring System) and KEV (Known Exploited Vulnerabilities) inform this weighting.

## Automated Assessment and Integration

Inspector's operational value comes from *automation*:

```
Inspector (continuous scanning)
   │  Findings
   ├─▶ Security Hub (auto-integrate, ASFF normalization)
   ├─▶ EventBridge ──▶ Lambda/SSM (auto-patch, ticket, isolate)
   └─▶ Inspector console (dashboard, risk score sorted)
```

- New resource (EC2 start, ECR push, Lambda deploy) → auto-scanned.
- New CVE disclosed → affected existing assets auto-re-evaluated.
- Finding → auto-aggregated in Security Hub + EventBridge auto-response (e.g., SSM Patch Manager auto-applies patch, or creates Jira ticket).

> ⚠️ **Trap**: ECR scanning with **on-push only** catches vulnerabilities at push time but misses CVEs disclosed *later*. Answer to "track new vulnerabilities in old images" is **enable continuous scanning** + retention period.

## Multi-Account: Delegated Administrator Alignment

Inspector follows the **Organizations + delegated administrator** pattern too. Aligning the **same Security Tooling account** as Inspector delegated admin (as with GuardDuty/Detective/Security Hub) is recommended multi-account baseline:

```
Management Account ──designate──▶ Inspector Delegated Admin (Security Tooling Account)
                                         ├─ Enable Inspector org-wide + auto-enable
                                         ├─ Central policy for scan targets per account (EC2/ECR/Lambda)
                                         └─ Centralize all findings
```

> 🔍 **Deeper**: Viewing Inspector as a standalone vulnerability scanner turns it into "yet another report generator." The key is connecting it to *remediation loop* — Inspector findings → Security Hub aggregation → EventBridge → SSM Patch Manager (auto-patch) or ECR image rebuild pipeline (CI/CD blocks vulnerable image deploy). Especially in CI/CD: gate on ECR scan results (deploy fails if CRITICAL CVE exists) creates "shift-left" preventing vulnerabilities from reaching production before remediation.

## Common Confusions

- **Inspector vs GuardDuty**: Inspector finds *vulnerabilities* (exploitable weak points, preventive), GuardDuty detects *threats* (real malicious activity, detective). Different timing, targets.
- **Inspector vs Patch Manager (SSM)**: Inspector is *discovery* (what is vulnerable), Patch Manager is *remedy* (apply patches). Inspector diagnoses, Patch Manager prescribes. Connect via EventBridge.
- **Inspector vs Config**: Config is *configuration compliance* (does setting match policy), Inspector is *software vulnerability* (CVE). Different axes.
- **Inspector v1 vs current**: v1 was agent-based, manual assessment, rule packages; current is SSM/agentless, continuous scanning, auto. Current is the standard.

## One-Sentence Checklist

- [ ] EC2/ECR/Lambda scanning enabled per need; EC2 verified SSM-managed (or agentless)
- [ ] ECR using continuous scanning to track post-disclosure CVEs
- [ ] Using Inspector score (context-based priority) to remediate reachable/exploitable vulnerabilities first
- [ ] Findings connected to Security Hub, EventBridge, SSM Patch Manager for remediation automation
- [ ] Org delegated admin (Security Tooling account) aligned with other detection services

---

## 📝 연습 문제

**문제 1.** 보안팀이 EC2 인스턴스를 Amazon Inspector에 등록했지만 일부 인스턴스가 스캔되지 않는다. 에이전트 기반 스캔을 사용 중일 때 가장 먼저 확인할 것은?

A) 인스턴스의 보안 그룹이 모든 포트를 열고 있는지  
B) 인스턴스가 SSM Agent 실행 + 적절한 IAM 인스턴스 프로파일로 Systems Manager 관리 상태인지  
C) 인스턴스에 퍼블릭 IP가 있는지  
D) 인스턴스가 us-east-1에 있는지  

**정답: B**  
해설: Inspector의 EC2 에이전트 기반 스캔은 인스턴스가 SSM으로 관리되어야 패키지 인벤토리를 수집할 수 있다. 따라서 SSM Agent 실행 여부와 SSM 권한을 가진 인스턴스 프로파일, SSM 연결 상태를 먼저 점검한다(또는 agentless 스캔으로 대체). 보안 그룹 개방·퍼블릭 IP·특정 리전은 스캔 가능 여부의 핵심 조건이 아니다.

---

**문제 2.** ECR에 저장된 컨테이너 이미지가 푸시 당시에는 취약점이 없었으나, 이후 새로 공시된 CVE에 취약해졌다. 이를 자동으로 따라잡으려면?

A) ECR 스캔을 on-push(1회)만 활성화한다  
B) ECR continuous(지속) 스캔을 활성화해 새 CVE 공시 시 기존 이미지를 자동 재평가한다  
C) 이미지를 매번 수동으로 다시 푸시한다  
D) GuardDuty Malware Protection을 켠다  

**정답: B**  
해설: on-push 스캔은 푸시 시점만 평가하므로 사후 공시 CVE를 놓친다. continuous 스캔은 새 CVE가 나올 때 이미 푸시된 이미지를 자동 재평가해 사후 취약점을 따라잡는다. 수동 재푸시는 비현실적이고, GuardDuty Malware Protection은 멀웨어 스캔이지 CVE 취약점 관리가 아니다.

---

**문제 3.** 동일하게 CVSS 9.0인 두 취약점 중 하나만 우선 패치하라는 요구가 있다. Amazon Inspector가 우선순위를 더 높게 매기는 쪽은?

A) 격리된 프라이빗 서브넷에 있어 인터넷에서 도달 불가능한 취약점  
B) 인터넷에서 도달 가능한 포트에 노출되고 공개 익스플로잇이 존재하는 취약점  
C) 두 취약점의 우선순위는 항상 동일하다  
D) 최근에 발견된 취약점이 무조건 우선이다  

**정답: B**  
해설: Inspector score는 CVSS 기본 점수에 네트워크 도달성과 익스플로잇 가능성 등 환경 컨텍스트를 곱해 위험을 가중한다. 같은 CVSS라도 인터넷 도달 가능 + 공개 exploit이 있는 취약점이 실제 위험이 훨씬 크므로 우선순위가 높다. 도달 불가능한 취약점은 후순위이고, 단순 발견 시점만으로 우선순위가 정해지지 않는다.

---

**문제 4.** Inspector 취약점 발견을 받아 영향받는 EC2 인스턴스에 자동으로 패치를 적용하는 교정 파이프라인을 구성하려 한다. 가장 적절한 연계는?

A) Inspector 발견 → EventBridge → SSM Patch Manager로 자동 패치 적용  
B) Inspector가 직접 인스턴스를 패치한다  
C) Inspector 발견 → Macie → 자동 패치  
D) Inspector → Detective → 자동 패치  

**정답: A**  
해설: Inspector는 발견(진단)만 하고 교정은 다른 서비스가 한다. 발견을 EventBridge로 받아 SSM Patch Manager(또는 Lambda)로 자동 패치를 적용하는 것이 정석적인 교정 자동화 파이프라인이다. Inspector가 직접 패치하지 않으며, Macie는 데이터 분류, Detective는 조사 도구로 패치 교정과 무관하다.

---

**문제 5.** Amazon Inspector와 GuardDuty의 역할 차이를 가장 정확히 설명한 것은?

A) 둘 다 동일하게 실시간 악성 트래픽을 차단한다  
B) Inspector는 악용 가능한 취약점(CVE 등)을 사전에 발견하고, GuardDuty는 실제 악성 활동(위협)을 탐지한다  
C) Inspector는 위협을, GuardDuty는 취약점을 다룬다  
D) Inspector는 S3 PII를 분류하고 GuardDuty는 CVE를 스캔한다  

**정답: B**  
해설: Inspector는 EC2/ECR/Lambda의 취약점(약점)을 사전에 찾아 우선순위화하고, GuardDuty는 자격증명 오남용·악성 통신 등 실제 위협 활동을 탐지한다 — 예방(약점 축소)과 탐지(공격 포착)의 보완 관계다. C는 역할이 뒤바뀌었고, 둘 다 트래픽을 차단하지 않으며, PII 분류는 Macie의 몫이다.

---
