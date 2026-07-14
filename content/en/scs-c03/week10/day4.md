# Day 4 - Incident Response Framework: NIST Phases, Runbooks, Automation vs Human Judgment Boundary

So far (Day 1~3) we've covered *specific techniques*: auto response pipelines, compromised instance isolation, credential revocation. Today we examine the *framework* that ties them together. No matter how sophisticated the tools, without a system for *when, what, and who decides*, incident response descends into chaos. The essence of IR (Incident Response) is *structure that enables consistent decision-making amid pressure and uncertainty*. The exam tests NIST IR phase definitions, AWS services' roles in each phase, and the critical *boundary between what to automate and what to leave to human judgment*.

AWS adopts NIST SP 800-61's IR lifecycle in its *AWS Security Incident Response Guide*, adapted for the cloud. Knowing this precisely is the foundation of this exam domain.

## NIST IR Lifecycle: 4 Phases

```
[1. Preparation] ──► [2. Detection &      ──► [3. Containment,      ──► [4. Post-Incident
   Preparation        Analysis              Eradication,             Activity
                                            Recovery
        ▲                                                              │
        └──────────────── Lessons fed back to Preparation ──────────────┘
```

The lifecycle is *cyclical*. Post-incident lessons strengthen preparation.

### 1. Preparation (Preparation)
Build response capability *before* incidents happen. Cloud preparation:
- **Logging & visibility foundation**: CloudTrail (all accounts/regions), VPC Flow Logs, GuardDuty/Security Hub/Config enabled. *After incident is too late* — no logs means no analysis.
- **Isolation and forensics infrastructure**: Isolation security groups/subnets, forensics account/AMI, evidence buckets with Object Lock pre-staged.
- **Permissions and access**: Break-glass role for IR personnel, automation execution role (least privilege).
- **Runbooks and contacts**: Scenario-specific runbooks, escalation paths, delegation defined.
- **Drills**: game day and tabletop exercises.

### 2. Detection & Analysis
Identify signals as incidents and assess scope/severity:
- GuardDuty (threats), Security Hub (aggregation, normalized ASFF), Config (config drift), Macie (data sensitivity), CloudTrail/Athena (investigation).
- Triage findings: true/false positive, severity, impact scope, incident classification.

### 3. Containment, Eradication, Recovery
- **Containment**: Block damage spread. Instance isolation (Day 2), credential revocation (Day 3), security groups/NACL/SCP. Distinguish short-term (immediate) vs long-term (temporary recovery) containment.
- **Eradication**: Remove threat. Malware/backdoor removal, patch vulnerabilities, dispose compromised resources.
- **Recovery**: Restore normal operations. Redeploy from patched golden AMI, restore from backup, strengthen monitoring while staged service recovery.

### 4. Post-Incident Activity
- Root cause analysis, timeline reconstruction (CloudTrail), lessons learned meeting, runbook/control improvements, metric updates (MTTD/MTTR).

> 💡 **Related theory**: NIST separates *eradication* from *recovery* for deep reasons. If you recover without fully eradicating (e.g., restart instance with backdoor still present), re-compromise happens immediately. If you attempt eradication before containment, the attacker notices detection and destroys evidence or hides deeper. The sequence (containment → eradication → recovery) is game-theoretic design to *minimize attacker behavioral options*. SANS' 6-phase model (Preparation, Identification, Containment, Eradication, Recovery, Lessons Learned) is essentially identical logic.

## Runbooks and Playbooks

- **Runbook**: Step-by-step procedure for a *specific task* (e.g., "EC2 isolation runbook" — snapshot, replace isolation SG, tag). Good for automation (SSM Automation Document).
- **Playbook**: Decision flow for an *entire scenario* (e.g., "ransomware response playbook" — under what conditions do you invoke which runbook and who approves?).

Attributes of a good runbook:
- **Deterministic**: Same input → same procedure. Reduces judgment burden under pressure.
- **Idempotent**: Safe to re-execute.
- **Auditable**: Every step logged.
- **Tested**: Validated via game day.

```yaml
# Incident severity-based playbook skeleton (decision flow)
Incident detected (GuardDuty/Security Hub)
  ├─ Severity LOW   → Auto ticket creation, review during business hours (human)
  ├─ Severity MED   → Auto alert + impact analysis (human) → runbook execute if needed (manual)
  └─ Severity HIGH  → Auto containment runbook execute immediately (auto)
                      + simultaneous IR team page (human)
                      + high-impact actions (prod termination, etc.) require aws:approve gate (human approval)
```

## Automation vs Human Judgment Boundary (Core)

The essence of this section: *what goes to machines, what stays with humans?* Wrong boundaries fail in both directions: too much automation destroys normal services with false positives; too much manual slows response until damage is severe.

| Dimension | Suited for Automation | Requires Human Judgment |
|-----------|---------------------|-------------------------|
| Clarity | Obvious threats (public RDP brute force success) | Ambiguous signals (unusual API pattern) |
| Reversibility | Reversible actions (disable key, isolation SG) | Irreversible, high-impact (terminate prod, delete data) |
| Impact scope | Single resource, low impact | Broad scope, critical services |
| Speed requirement | Seconds decisive (credential revocation) | Analysis and context more important |
| Frequency | Repetitive, high volume | Rare, novel situations |

**Graduated automation**: As confidence grows, move human → automated.
1. Initially *alert only* (human-in-the-loop) — validate automation logic.
2. As confidence builds, *automate reversible, low-impact actions* (disable key, isolation).
3. High-impact actions get *approval gate* (SSM `aws:approve`) — execute auto but require human approval.

```yaml
# Insertion of human approval gate in SSM Automation
mainSteps:
  - name: snapshotAndIsolate     # Auto: reversible containment
    action: aws:executeAutomation
    inputs: { DocumentName: IsolateInstance }
  - name: approveTermination     # Human: approval before irreversible action
    action: aws:approve
    inputs:
      Approvers: ["arn:aws:iam::111122223333:role/IR-Lead"]
      Message: "Approve termination of production instance i-xxx"
  - name: terminate              # Auto: execute after approval
    action: aws:executeAwsApi
    inputs: { Service: ec2, Api: TerminateInstances }
```

> 💡 **Related theory**: This is the *automation paradox* from high-risk industries (aviation, nuclear). As automation increases, humans lose *situational awareness*, so when automation fails in rare moments, people lack ability to intervene. The remedy: *keep automation transparent to humans* (SNS alerts, dashboards), and *keep humans in the loop for high-impact, irreversible decisions*. The goal isn't full automation but *directing human judgment to most valuable decisions*. Zero human involvement is not the target.

## AWS Services IR Phase Mapping

| NIST Phase | Key AWS Services |
|-----------|------------------|
| Preparation | CloudTrail, Config, GuardDuty (enabled), Organizations/SCP, IAM (break-glass), forensics account |
| Detection & Analysis | GuardDuty, Security Hub, Config, Macie, Detective, CloudTrail/Athena, CloudWatch |
| Containment | SSM Automation, EC2 (SG/isolation), IAM (session revocation), NACL, SCP, WAF |
| Eradication | Systems Manager (patching), SSM Automation, EC2 (redeployment), Lambda |
| Recovery | Golden AMI, Backup restore, CloudFormation/IaC redeployment, CloudWatch monitoring |
| Post-Incident | CloudTrail/Athena (timeline), Detective (investigation), Security Hub (insights), runbook updates |

**Amazon Detective** especially helps the *analysis and post-incident* phases by showing *context and relationships* from GuardDuty findings — which entities communicated with what, behavioral baseline deviation — aiding root cause analysis via graph visualization.

> 🔍 **Deep dive**: IR maturity is measured and improved via *metrics*: MTTD (mean time to detect), MTTR (mean time to respond), dwell time (attacker residence duration). Auto response (Day 1) dramatically cuts MTTR; detection controls (GuardDuty/Security Hub) reduce MTTD. Post-incident, track these metrics to find *where the bottleneck is* and invest in automation/controls there. IR also has *legal and regulatory dimensions* — evidence integrity (chain of custody, Day 2), breach notification obligations (GDPR 72 hours, etc.), regulatory reporting. So IR planning includes security, legal, PR, and executive roles with contacts and delegation. Technical containment and organizational response are inseparable.

## One-line summary checklist

- [ ] Understand NIST 4 phases (Preparation → Detection & Analysis → Containment, Eradication, Recovery → Post-Incident) and cyclical structure
- [ ] Built logging, isolation infrastructure, runbooks, break-glass role *before* incidents (Preparation)
- [ ] Know containment → eradication → recovery logic (re-compromise prevention, evidence protection)
- [ ] Distinguish runbooks (procedures) from playbooks (scenario decision flows)
- [ ] Judge automation/human boundary via clarity, reversibility, impact scope, speed
- [ ] Apply graduated automation: reversible/low-impact auto, high-impact with approval gate (aws:approve)
- [ ] Map each IR phase to AWS services
- [ ] In post-incident: measure MTTD/MTTR, improve, reflect legal/regulatory obligations

---

## 📝 연습 문제

**문제 1.** NIST IR 생명주기에서 근절(Eradication)을 복구(Recovery)보다 먼저 수행해야 하는 이유로 가장 적절한 것은?

A) 복구가 더 비싸므로 미뤄야 한다  
B) 위협(백도어·멀웨어)을 완전히 제거하지 않고 정상 운영을 복원하면 즉시 재침해가 일어나기 때문  
C) AWS가 그 순서만 허용하므로  
D) 근절은 자동화할 수 없으므로  

**정답: B**  
해설: 근절을 건너뛰고 복구하면 남은 백도어·멀웨어로 곧장 재침해된다. 그래서 봉쇄로 확산을 막고, 근절로 위협을 완전히 제거한 뒤, 복구로 정상 운영을 복원하는 순서가 필수다. 비용·AWS 강제·자동화 가능 여부는 순서의 근거가 아니다.

---

**문제 2.** 어떤 대응 조치를 완전 자동화할지, 사람 승인 게이트를 둘지 판단하는 기준으로 가장 적절한 묶음은?

A) 조치 이름의 길이와 알파벳 순서  
B) 위협의 명확성, 조치의 가역성, 영향 범위, 속도 요구 — 명백·가역·저영향·고속이면 자동화, 모호·비가역·고영향이면 사람 승인  
C) 무조건 모두 자동화하는 것이 항상 최선  
D) 무조건 모두 수동이 항상 최선  

**정답: B**  
해설: 자동화/사람 경계는 명확성·가역성·영향 범위·속도 요구로 판단한다. 명백하고 가역적이며 저영향이고 속도가 결정적이면 자동화하고, 모호·비가역·고영향이면 사람의 승인을 둔다. 과도한 자동화는 false positive로 서비스를 파괴하고, 전면 수동은 대응을 지연시킨다.

---

**문제 3.** 자동 봉쇄는 즉시 실행하되 프로덕션 인스턴스 종료 같은 비가역 조치 전에는 IR 리드의 승인을 받게 하려 한다. SSM Automation에서 적절한 메커니즘은?

A) Lambda를 두 번 호출  
B) 런북 중간에 aws:approve 단계를 삽입해 지정된 승인자의 승인 후 종료 단계가 진행되도록 구성  
C) 보안 그룹 규칙 추가  
D) CloudTrail 알람  

**정답: B**  
해설: SSM Automation의 aws:approve 액션은 런북 흐름 중간에 사람 승인 게이트를 삽입해, 지정 승인자가 승인해야 다음(고영향) 단계가 진행된다. 이것이 graduated automation에서 자동 봉쇄와 사람의 비가역 조치 승인을 결합하는 표준 메커니즘이다. 나머지는 승인 게이트 기능을 제공하지 않는다.

---

**문제 4.** NIST IR의 준비(Preparation) 단계에서 클라우드 환경에 반드시 갖춰야 할 것으로 가장 적절한 것은?

A) 사고가 난 뒤에 CloudTrail을 켠다  
B) 사고 전에 CloudTrail·VPC Flow Logs·GuardDuty 등 로깅·탐지 기반, 격리 보안 그룹·포렌식 계정·증거 버킷, 런북과 break-glass 역할을 미리 구축  
C) 준비 단계에는 아무것도 하지 않는다  
D) 모든 인스턴스를 미리 종료한다  

**정답: B**  
해설: 준비는 사고 전에 대응 능력을 구축하는 단계다. 로그가 없으면 사고 후 분석 자체가 불가능하므로 CloudTrail·Flow Logs·GuardDuty와 격리·포렌식 인프라, 런북, break-glass 역할을 미리 갖춰야 한다. 사고 후 로깅 활성화나 무위·무차별 종료는 부적절하다.

---

**문제 5.** 사후 활동(Post-Incident) 단계에서 IR 프로그램을 개선하기 위해 추적하는 핵심 지표와 활동으로 가장 적절한 것은?

A) 인스턴스 시간당 비용만 본다  
B) MTTD·MTTR·dwell time을 측정하고, CloudTrail/Detective로 타임라인·근본 원인을 분석하며 교훈을 런북·통제에 환류하고 규제 보고 의무를 이행  
C) 사고를 잊고 다음 작업으로 넘어간다  
D) 모든 로그를 즉시 삭제한다  

**정답: B**  
해설: 사후 단계는 MTTD/MTTR/dwell time 같은 지표로 병목을 찾고, CloudTrail·Detective로 타임라인과 근본 원인을 분석해 교훈을 준비 단계(런북·통제)로 환류하며, 침해 통지 등 규제 의무를 이행한다. 비용만 보거나 사고를 잊거나 증거 로그를 삭제하는 것은 개선·법적 요구에 모두 어긋난다.

---
