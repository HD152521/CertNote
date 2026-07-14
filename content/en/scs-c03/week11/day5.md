# Day 5 - Week 11 Comprehensive Review: Integrated Governance Scenarios

This week broadened perspective from *single-account security* to *organization-scale governance*. We defined permission ceilings with SCP (Day 1), automatically established secure baselines with Control Tower (Day 2), proved compliance with Audit Manager (Day 3), and made operations a closed loop with Firewall Manager, tags, cost, and automation (Day 4). The final day reviews how these pieces mesh as *one governance system* through integrated scenarios.

## Four-Layer Governance Mental Model

Organizational security governance operates as four overlapping planes. Exam questions almost always mask "which tool from which plane is the answer?"

```
① Permission Boundary Plane (ceiling of what can be done)
     SCP / RCP — not granting permission but maximum boundary
② Baseline Plane (accounts born secure)
     Control Tower — landing zone, controls (preventive/detective/proactive), account factory
③ Proof Plane (prove compliance via evidence)
     Audit Manager ← Config / CloudTrail / Security Hub (evidence sources)
④ Operations Plane (daily enforcement, remediation, response)
     Firewall Manager / tag/cost governance / EventBridge auto-remediation
```

Beneath this sits the **central security account model** (Management Account=billing/organization, Audit=detection/evidence/response, Log Archive=immutable logs) as common foundation. All security services operate as *delegated administrators* from Audit account.

> 💡 **Related Theory**: These four layers follow security control's time axis — *preventive (SCP/preventive controls)* → *secure defaults (baseline)* → *continuous detect/evaluate (Config·proof)* → *respond/remediate (operations)*. This maps NIST CSF's Identify·Protect·Detect·Respond functions to organizational scale. If one layer is breached, the next one catches — *defense in depth*.

## Tool Selection Decision Tree (Avoid Confusion)

Most frequently confused matchings in exams:

| Requirement Keyword | Answer Tool |
|---|---|
| "*maximum* permission boundary," "*block* region/root/service" | **SCP** |
| "Organization *resources* prevent external access (ceiling)" | **RCP** |
| "Multi-account *baseline quickly and consistently* maintain" | **Control Tower** |
| "*Before* resource creation block non-compliance (IaC gate)" | **Proactive Control (CFN Hooks)** |
| "Already-created resources *evaluate* follow rule" | **Config (Detective Control)** |
| "Auditor submission *evidence auto-collect and report*" | **Audit Manager** |
| "Security *findings aggregate and score* dashboard" | **Security Hub** |
| "Multiple accounts WAF/SG/NFW *consistently deploy, auto-protect*" | **Firewall Manager** |
| "Who did what when *activity log*" | **CloudTrail** |
| "Abnormal *spending spike* (breach signal)" | **Cost Anomaly Detection / Budgets** |

## Integrated Scenario 1: Building Regulated Multi-Account Environment

Requirement: New fintech starting with 30 accounts, ap-northeast-2 only, PCI audit readiness, consistent WAF across all accounts, security tools auto-activate.

Design:
1. **Control Tower** to configure landing zone → Audit/Log Archive accounts, organization CloudTrail/Config automatic.
2. **SCP**: Region lock (global services + us-east-1 exception), root block, security service disable prevention.
3. **Account Factory (AFT)**: Issue accounts with standard OU placement, tags, network baseline.
4. **Delegated Administrators (Audit account)**: Run GuardDuty, Security Hub, Config, Audit Manager, Firewall Manager.
5. **Firewall Manager**: Deploy common WAF managed rules to all account ALBs/API GWs automatically.
6. **Audit Manager**: PCI-DSS framework assessment → auto-collect Config/CloudTrail/Security Hub evidence, supplement manual evidence.
7. **EventBridge+Lambda/SSM**: Auto-remediate findings loop.

## Integrated Scenario 2: Prevent "Turn Off Detection and Do Bad Things"

Requirement: Account administrators cannot disable CloudTrail, GuardDuty, Config, or erase logs.

Design:
- **SCP**: Deny `cloudtrail:StopLogging/DeleteTrail`, `guardduty:DeleteDetector`, `config:StopConfigurationRecorder`, `securityhub:DisableSecurityHub`, etc., but exception via `Condition` for security maintenance role.
- **Organization CloudTrail**: Activated from Management Account → member account admins get read-only, cannot disable or view.
- **Log Archive**: S3 Object Lock + MFA Delete + dedicated KMS blocks log immutability.
- **Control Tower Mandatory Controls**: Log integrity, Config disable prevention are un-disableable.

This combination blocks defense evasion attack with multiple layers.

## Integrated Scenario 3: Cost Spike as Breach Signal

Requirement: Defend against stolen keys mass-creating GPU instances for cryptomining.

Design:
- **SCP**: Block large GPU instance types and unauthorized regions (limit blast radius).
- **Cost Anomaly Detection / Budgets**: Alert immediately on spend spike.
- **GuardDuty**: Detect cryptomining-related findings.
- **EventBridge auto-response**: Suspect key disable + instance isolation + alert.

Cost, detection, and permission boundary cross-fire one threat — *defense in depth* example.

## Trap Consolidation

- **SCP does not grant permissions** — only IAM Allow + SCP intersection minus Deny = effective.
- **SCP does not apply to Management Account members** → No workloads in Management Account.
- **Region lock SCP** missing global services+us-east-1 exception breaks console, CloudFront, ACM.
- **Controls apply to OUs** → New account inheritance; individual application causes omission.
- **Preventive=SCP, Detective=Config, Proactive=CFN Hooks** — block timing differs.
- **Control Tower managed resources manual change = drift** → Re-apply required.
- **Audit Manager does not generate evidence** — Config/CloudTrail/Security Hub must pre-activate.
- **Firewall Manager requires Config** + operate from delegated admin.
- Security services run from **delegated admin (Audit account)**, Management Account only for billing/org.

## Connection to Other Weeks

- Week 4 (WAF·Shield·Network Firewall) *single policies* expanded this week to Firewall Manager *organization-wide*.
- Logging and detection (CloudTrail, GuardDuty, Config, Security Hub) unified this week under *delegated admin and proof plane*.
- IAM and permission boundaries this week expand to SCP/RCP *organization-scale ceilings*.

Governance is not one service but four planes (permission boundary, baseline, proof, operations) stacked over a central security account, operated via delegated admins, running detection→auto-remediate closed loops. Exams relentlessly ask "which plane, which tool?"

## 📝 연습 문제

**문제 1.** 신규 핀테크가 PCI 대상 다계정 환경을 빠르게 세우고 안전한 베이스라인(로그 계정, 조직 CloudTrail/Config, 표준 OU)을 자동으로 갖추려 한다. 출발점으로 가장 적절한 것은?

A) 수동으로 Organizations·CloudTrail·Config를 하나씩 구성  
B) AWS Control Tower로 랜딩 존을 구성해 Audit·Log Archive 계정과 조직 CloudTrail/Config, 컨트롤 베이스라인을 자동으로 깐다  
C) 단일 계정에 모든 워크로드를 모은다  
D) GuardDuty만 켠다  

**정답: B**  
해설: 표준 멀티계정 보안 베이스라인을 빠르고 일관되게 까는 출발점은 Control Tower 랜딩 존이다. Audit·Log Archive 계정, 조직 CloudTrail/Config, 컨트롤이 자동 구성된다. 수동 구성은 느리고 누락 위험이 크며, 단일 계정 통합은 격리·blast radius 원칙에 반하고, GuardDuty 단독은 탐지 한 조각일 뿐 베이스라인 전체가 아니다.

---

**문제 2.** "계정 관리자가 CloudTrail 로깅을 중지하거나 GuardDuty 탐지기를 삭제하지 못하게" 하려 한다. 가장 직접적인 통제는?

A) IAM 정책으로 관리자에게 권한을 더 준다  
B) SCP로 cloudtrail:StopLogging·guardduty:DeleteDetector 등을 Deny하되 보안 유지보수 역할만 Condition으로 예외  
C) Security Hub 점수를 높인다  
D) Audit Manager 보고서를 만든다  

**정답: B**  
해설: 보안 서비스 비활성화·로그 삭제를 막는 직접 통제는 SCP의 명시적 Deny다. 유지보수 자동화를 위해 특정 보안 역할만 Condition으로 예외하면 운영성과 강제력을 동시에 확보한다. IAM으로 권한을 더 주는 것은 반대 방향이고, Security Hub 점수·Audit Manager 보고서는 탐지·증명 도구일 뿐 행위를 차단하지 않는다.

---

**문제 3.** 다음 요구-도구 매칭 중 옳지 않은 것은?

A) "여러 계정 ALB에 WAF 일관 배포·신규 자동 보호" → Firewall Manager  
B) "감사자 제출용 증거를 프레임워크별 자동 수집·보고" → Audit Manager  
C) "리소스가 규칙을 지키는지 지속 평가" → AWS Config  
D) "권한의 최대 경계 정의·리전 차단" → Security Hub  

**정답: D**  
해설: 권한의 최대 경계 정의와 리전 차단은 SCP(Organizations)의 역할이지 Security Hub가 아니다. Security Hub는 보안 findings 집계·점수 도구다. 나머지 매칭은 정확하다: 조직 전역 방화벽 배포는 Firewall Manager, 증거 수집·보고는 Audit Manager, 구성 평가는 Config다. 따라서 잘못된 매칭은 권한 경계를 Security Hub에 귀속시킨 것이다.

---

**문제 4.** Control Tower로 운영 중인 조직에서 한 운영자가 콘솔로 SCP를 직접 수정했다. 이후 새 컨트롤 적용이 막힌다. 무슨 일이 일어났고 어떻게 대응하는가?

A) 정상이며 그대로 둔다  
B) 드리프트가 발생했다 — 랜딩 존을 재적용해 선언 상태로 복구하고, Control Tower 관리 리소스를 콘솔에서 직접 수정하지 않는 규율을 지킨다  
C) 모든 컨트롤을 영구 비활성화한다  
D) 조직을 삭제하고 다시 만든다  

**정답: B**  
해설: Control Tower가 관리하는 SCP를 콘솔에서 직접 수정하면 선언 상태와 실제 상태가 어긋나는 드리프트가 발생해 후속 작업이 막힌다. 올바른 대응은 랜딩 존 재적용으로 선언 상태를 복구하고, 관리 리소스를 수동으로 손대지 않는 운영 규율을 세우는 것이다. 방치·전체 비활성화·조직 재생성은 모두 과하거나 위험하다.

---

**문제 5.** 한 계정에서 평소의 수십 배 GPU 인스턴스 비용이 급증했다. 여러 계층이 함께 작동해야 한다면 가장 적절한 심층 방어 조합은?

A) 인스턴스를 더 늘려 대응  
B) SCP로 대형 GPU 타입 생성 차단(피해 한계) + Cost Anomaly Detection/Budgets로 조기 탐지 + GuardDuty 채굴 탐지 + EventBridge로 키 비활성화·격리 자동 대응  
C) 비용은 보안과 무관하므로 무시  
D) 루트 키를 새로 발급해 계속 사용  

**정답: B**  
해설: 비용 급증, 특히 GPU 인스턴스 급증은 탈취 자격증명에 의한 채굴 침해의 신호일 수 있다. SCP로 피해 한계를 두고, Cost Anomaly Detection·Budgets로 조기 탐지하며, GuardDuty로 채굴을 탐지하고, EventBridge 자동 대응으로 키 비활성화·격리까지 묶는 것이 권한 경계·비용·탐지·대응을 가로지르는 심층 방어다. 확장·무시·루트 키 재사용은 위험을 키우거나 침해를 방치한다.

---
