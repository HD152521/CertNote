# Day 5 - Week 10 Synthesis: Integrated Incident Response Scenario Review

This week we covered the second axis of threat management: *Response*. Auto response pipelines (EventBridge + SSM + Lambda), compromised instance isolation and forensics, credential exposure revocation, and the NIST IR framework that unifies all of it. Today we integrate these into a single *response decision system*. The exam tests not isolated APIs but *"in what order, by what mechanism, and with what automation/human judgment does this incident flow through the response phases?"* The key is **3D thinking: phase (NIST) × target (instance/credential) × actor (auto/human)**.

## Integrated Decision Matrix: Incident → Response

| Incident/Signal | Containment (immediate) | Evidence & tracking | Eradication & recovery | Automation/Human |
|-----------------|------------------------|---------------------|------------------------|------------------|
| EC2 C2 communication (GuardDuty) | Replace isolation SG (keep running) | EBS snapshot + memory dump | Redeploy from golden AMI, then terminate | Containment auto, termination approval gate |
| Compromised instance role token leaked | aws:TokenIssueTime Deny (session revocation) | CloudTrail for token activity | Narrow trust policy, reissue | Auto (reversible) |
| Access key publicly exposed | update-access-key Inactive | CloudTrail by accessKeyId | Rotate new key → delete old, Secrets Manager | Disable auto, rotate human |
| Root account compromise | Reset password/keys/MFA | Full CloudTrail audit of root activity | Backdoor removal, AWS escalation | Human (high-impact) |
| Config compliance drift | Remediation runbook (auto) | Config timeline | Policy enforcement | Auto (low-impact) |
| Data exposure (Macie) | Bucket policy, Block Public Access | CloudTrail GetObject tracking | Permission tightening, encryption | Human (impact analysis) |
| Multi-account threat aggregate | Security Hub central response | Detective graph investigation | Organizational policy (SCP) | Auto + human |

> 💡 **Related theory**: This matrix backbone is NIST's *containment → eradication → recovery* sequence plus *order of volatility* (preserve evidence alongside containment) plus *graduated automation* (reversible/low-impact auto, irreversible/high-impact human). The "best" answer typically *blocks damage spread fastest without losing evidence and preserves human judgment for irreversible decisions*.

## Flow Thinking: How one incident flows through phases

The same signal's quality of response depends on *what you do at which phase*.

```
GuardDuty finding
   ▼ [Detection & Analysis] classify by severity/type, assess impact scope
EventBridge rule (pattern filter + InputTransformer)
   ├─► SNS → page IR team (human, maintain situational awareness)
   └─► SSM Automation runbook
         ├─ [Evidence Preservation] EBS snapshots + memory dump (concurrent, priority over containment)
         ├─ [Containment]          Replace isolation SG + revoke credentials
         ├─ [aws:approve]          Human approval gate before irreversible action (prod termination)
         ├─ [Eradication]          Redeploy from golden AMI, backdoor removal
         └─ [Recovery]             Strengthen monitoring, staged service restoration
   ▼ [Post-Incident] CloudTrail/Detective timeline, measure MTTR, improve runbook
```

Core insight: **Automation buys time (containment, evidence preservation); humans decide (impact analysis, irreversible actions, root cause).** Not competition but division of labor.

> 🎯 **Integrated Scenario A**: "Production EC2 triggers GuardDuty cryptomining alert (CryptoCurrency:EC2/BitcoinTool). Evidence of S3 access via instance role." Answer: (1) EventBridge receives finding, SNS pages IR team + launches SSM runbook, (2) Runbook preserves evidence: EBS snapshots and memory dump (keep running), (3) Containment: replace isolation SG + add aws:TokenIssueTime Deny to instance role, (4) Track: CloudTrail/Athena for S3 objects accessed and resources created by the role, (5) Approval: prod termination requires IR lead sign-off via aws:approve, (6) Eradication: redeploy from patched golden AMI. All week's mechanisms work in concert.

> 🎯 **Integrated Scenario B**: "Developer pushes access key to public repo. Attacker creates new IAM user and additional keys. Multi-account org environment." Answer: (1) Exposed key Inactive immediately (containment), (2) Full CloudTrail/Athena trace of key activity → identify attacker-created IAM users, keys, widened policies (backdoors), (3) Detective graph analysis for related entities and anomalous behavior, (4) Eradicate backdoors, (5) Migrate secrets to Secrets Manager auto-rotation; humans move to IAM Identity Center temporary credentials, (6) Security Hub org-wide scan for similar risks + add root/long-term key usage detection alarm.

## Frequently confused distinctions

**Isolation vs Termination** — Isolation is network blocking (keep running, preserve volatile evidence); termination destroys evidence. Containment's first measure is isolation.

**Access key neutralization vs STS token neutralization** — Key: `update-access-key Inactive` (explicit disable); STS token: no revoke API, use `aws:TokenIssueTime` Deny (time-based denial).

**Disable vs Delete** — Exposed key: disable first (preserve tracking/recovery), track/rotate later, then delete. Immediate delete obscures attacker activity.

**SSM Automation vs Lambda** — Standard, multi-step, auditable, approval gates → runbook; complex logic, external integration → Lambda.

**Runbook vs Playbook** — Runbook: procedure (automation unit); Playbook: scenario decision flow (which conditions invoke which runbook, who approves).

**Containment vs Eradication vs Recovery** — Block spread / fully remove threat / restore normal operation. Sequence prevents re-compromise and evidence loss.

**GuardDuty vs Security Hub vs Detective** — Threat detection / finding aggregation and normalization (ASFF) / relationship and root cause graph investigation.

**Automation fit vs human need** — Obvious, reversible, low-impact, high-speed → auto; ambiguous, irreversible, high-impact → human approval.

> ⚠️ **Pitfall collection**:
> - Immediately terminate compromised instance, destroying volatile evidence.
> - Replace security group, leave established C2 session running (need NACL/ENI adjunct).
> - Isolate instance but don't revoke leaked STS tokens (valid outside instance until expiration).
> - Delete exposed key before tracking (attacker activity untraceable).
> - Try to limit root privilege via IAM policy modification (root bypasses all policies).
> - Recover without eradicating, causing immediate re-compromise.
> - Full automation cascade causing false positive service destruction.
> - Keep evidence snapshots in original account with public deletion access (chain of custody fails).

## Visibility and Operations: Measure and improve response

Response is proven and improved via *metrics*.
- **MTTD (Detection time)**: Reduce via GuardDuty/Security Hub detection controls.
- **MTTR (Response time)**: Drastically reduce via auto response pipeline (EventBridge + SSM).
- **Dwell time (Attacker residence duration)**: Reduce via combined detection and response.

Track these metrics post-incident to find *bottleneck phases* and invest in automation/controls there. All response is logged in CloudTrail for audit and legal evidence; Detective aids post-investigation. IR is not just technical containment (security team) but also organizational response (legal, PR, executive) — breach notification obligations, regulatory reporting, stakeholder communication are inseparable from technical response.

> 🔍 **Deep dive**: Response maturity measures not just "did we block it?" but "*can we respond consistently, quickly, and provably, and do we learn and self-improve from the experience?"* Auto response reduces MTTR from minutes to seconds (Day 1); evidence integrity preserved across accounts (Day 2); accurate credential neutralization by type (Day 3); NIST phases and automation/human boundaries clear (Day 4). Controls activate; humans focus judgment where it matters most. This is where governance and compliance (next week) follow — evidence/legal/regulatory rigor in response determines whether technical containment translates into organizational resilience.

## One-line summary checklist

- [ ] Map incident to NIST phase (Preparation → Detection & Analysis → Containment, Eradication, Recovery → Post-Incident)
- [ ] Containment via isolation (keep running) with concurrent evidence preservation (snapshots, memory)
- [ ] Differentiate credential neutralization by type (key Inactive / STS TokenIssueTime Deny / root reset)
- [ ] Track full activity and backdoors via CloudTrail/Athena/Detective post-neutralization
- [ ] Auto contain to buy time; gate irreversible/high-impact actions with human approval (aws:approve)
- [ ] Distinguish runbooks (procedure) from playbooks (decision flow); apply graduated automation
- [ ] Maintain evidence integrity (separate account, Object Lock, CloudTrail)
- [ ] Measure MTTD/MTTR/dwell time and feedback lessons to Preparation phase

---

## 📝 연습 문제

**문제 1.** 프로덕션 EC2에서 GuardDuty가 암호화폐 채굴을 탐지했고 인스턴스 역할로 S3에 접근한 흔적이 있다. 가장 적절한 통합 대응 순서는?

A) 인스턴스를 즉시 종료하고 끝낸다  
B) 증거 보존(스냅샷·메모리) → 격리 SG 봉쇄 + 역할 세션 폐기 → CloudTrail로 S3 접근 추적 → prod 종료는 승인 게이트 후 → 골든 AMI 재배포  
C) 보안 그룹만 추가하고 모니터링만 한다  
D) IAM 사용자를 삭제한다  

**정답: B**  
해설: 휘발성 증거를 잃지 않게 실행 상태에서 스냅샷·메모리를 먼저 보존하고, 격리 SG로 봉쇄하며 인스턴스 역할 세션을 aws:TokenIssueTime Deny로 폐기한 뒤, CloudTrail로 역할이 접근한 S3를 추적하고, 비가역인 prod 종료는 승인 게이트 후 골든 AMI로 복구한다. 즉시 종료는 증거를 파괴하고, 모니터링만 하거나 사용자 삭제는 부적절하다.

---

**문제 2.** 액세스 키가 공개 저장소에 노출되어 공격자가 새 IAM 사용자와 추가 키를 만든 정황이 있다. 무력화 직후 가장 중요한 후속 단계는?

A) 봉쇄만 했으면 종료한다  
B) CloudTrail/Athena로 키 활동을 전수 조사해 공격자가 만든 백도어(새 사용자·키·넓힌 정책)를 식별·근절하고, Detective로 연관 관계를 분석한 뒤 자격증명을 회전한다  
C) 비용 보고서를 확인한다  
D) 모든 키를 즉시 삭제하고 추적은 생략한다  

**정답: B**  
해설: 키 비활성화는 출혈을 멈춘 것일 뿐이고, 공격자가 심은 지속성(백도어)을 추적·근절하지 않으면 재침해된다. CloudTrail/Athena로 키 활동을 전수 조사하고 Detective로 연관을 분석해 백도어를 제거한 뒤 회전하는 것이 필수다. 봉쇄만으로 종료하거나 추적 없이 삭제하는 것은 위험하다.

---

**문제 3.** 다음 중 이번 주에 다룬 "함정"으로 자주 지적되는 항목이 아닌 것은?

A) 침해 인스턴스를 즉시 terminate해 휘발성 증거를 파괴  
B) 인스턴스만 격리하고 유출된 STS 토큰은 폐기하지 않아 외부에서 만료까지 유효  
C) 증거 스냅샷을 별도 포렌식 계정으로 공유하고 Object Lock으로 무결성을 보장  
D) 근절 없이 복구해 백도어로 재침해  

**정답: C**  
해설: 증거 스냅샷을 별도 계정 공유·Object Lock으로 보호하는 것은 함정이 아니라 chain of custody의 모범이다. 나머지는 모두 실제 빈출 함정이다: 즉시 종료로 증거 파괴, STS 토큰 미폐기로 외부 유효, 근절 누락 후 복구로 재침해. 함정이 아닌 것을 고르는 문제이므로 정답은 증거 무결성 보장이다.

---

**문제 4.** EventBridge+SSM Automation으로 봉쇄를 자동화하되 프로덕션 자원의 비가역 조치는 사람이 통제하려 한다. 가장 적절한 설계 원칙은?

A) 모든 조치를 완전 자동화한다  
B) graduated automation — 가역·저영향(격리·키 비활성화)은 자동 즉시 실행하고, 비가역·고영향(prod 종료)은 aws:approve 승인 게이트를 두며, 자동화가 한 일을 SNS로 사람이 항상 볼 수 있게 한다  
C) 모든 조치를 사람이 콘솔에서 수동 실행한다  
D) 자동화 결과를 사람에게 알리지 않는다  

**정답: B**  
해설: graduated automation은 가역·저영향 조치를 자동 즉시 실행해 MTTR을 줄이고, 비가역·고영향 조치엔 aws:approve로 사람의 승인을 남기며, SNS 알림으로 상황 인식을 유지해 자동화의 역설(사람이 개입 능력을 잃음)을 방지한다. 전면 자동화는 false positive 위험, 전면 수동은 지연, 무통보는 상황 인식 상실을 낳는다.

---

**문제 5.** 사후(Post-Incident) 단계에서 IR 프로그램을 측정·개선하는 핵심으로 가장 적절한 것은?

A) 인스턴스 비용만 줄인다  
B) MTTD·MTTR·dwell time을 추적해 병목 단계를 찾고, CloudTrail/Detective로 타임라인·근본 원인을 분석해 교훈을 준비 단계(런북·통제)로 환류하며, 침해 통지 등 규제 의무를 이행한다  
C) 로그를 삭제해 저장 비용을 아낀다  
D) 사고를 잊고 다음 작업으로 넘어간다  

**정답: B**  
해설: 사후 단계는 MTTD/MTTR/dwell time으로 어느 단계가 병목인지 찾아 자동화·통제를 투자하고, CloudTrail·Detective로 타임라인·근본 원인을 분석해 교훈을 준비 단계로 환류하며 규제 보고 의무를 이행하는, NIST 생명주기의 순환을 완성하는 단계다. 비용 절감만 보거나 증거 로그 삭제·사고 망각은 개선과 법적 요구에 어긋난다.

---
