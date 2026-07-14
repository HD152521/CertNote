# Day 1 - Amazon GuardDuty: Threat Detection Principles, Finding Types, Threat Intelligence, Multi-Account Delegated Administrator

Detection presumes prevention has been breached. No matter how much firewalls, IAM, and encryption block, credential theft, insiders, and zero-days get through. So the second pillar of security operations is "recognizing malicious activity already happening (or underway) with *evidence-based* detection." Amazon GuardDuty is the first entry point to this detection layer — **agentless**, it continuously analyzes telemetry across the account and outputs threats as findings.

GuardDuty's essence is not a service that "*collects* logs" but an "analysis engine that *reads logs and assigns meaning*." GuardDuty doesn't depend on turning on CloudTrail to see things — it *directly subscribes* to CloudTrail, VPC Flow, and DNS streams to analyze them. Users don't need to configure logs for storage and forwarding; the moment you enable it, data sources connect — this "enable and done" characteristic is frequent on exams.

## What It Analyzes: Three Core Data Sources

Three *foundational* sources that GuardDuty always consumes at no extra cost or configuration:

```
CloudTrail Management Events  → API call behavior (who did what)
CloudTrail S3 Data Events (optional) → S3 object-level access
VPC Flow Logs                 → Network flows (connected where)
DNS Query Logs                → Domain resolution (looked up what)
```

Important nuance: GuardDuty **does not replicate** these logs. Even if you haven't enabled VPC Flow Logs on your account, GuardDuty receives flow data internally and analyzes it (stores nothing separately). DNS analysis is only possible when using the **VPC default DNS resolver (Route 53 Resolver)** — with custom DNS or external resolvers, GuardDuty's DNS-based findings (e.g., DNS exfiltration) become blind spots.

> 💡 **Related Theory**: This exemplifies *behavioral detection*. Rather than relying solely on signature matching (known malicious IPs and hashes), it catches *anomalies* against baseline using statistics and ML. GuardDuty learns per-account "normal" profiles (APIs usually called, regions and ports usually communicating with) and scores activities differing from normal as threats. This corresponds to NIST CSF's "Detect" function, specifically "Anomalies and Events (DE.AE)."

## Protection Plans: Extended Detection on Foundational Layers

Beyond foundational sources, *Protection Plans* activate additional data sources. Each incurs separate charges and generates separate finding types:

- **S3 Protection**: Analyze CloudTrail S3 data events → suspicious S3 access patterns
- **EKS Protection**: Analyze EKS audit logs → Kubernetes API-level threats
- **Runtime Monitoring**: Lightweight agent (EKS/ECS/EC2) for **inside-host** behavior visibility (processes, files, network) → container and instance runtime threats
- **Malware Protection (EBS)**: Snapshot suspected EC2's EBS volumes and scan for malware (no agent needed)
- **Malware Protection for S3**: Scan uploaded objects
- **RDS Protection**: Analyze Aurora login activity → DB credential attacks
- **Lambda Protection**: Analyze Lambda network activity

> ⚠️ **Trap**: The scenario "GuardDuty enabled but cannot see inside-host compromise (malicious process)" typically answers with **Runtime Monitoring activation**. Foundational GuardDuty only sees network and API perspectives. Also, "EC2 suspected of malware → scan it" → **Malware Protection (EBS)**.

## Anatomy of Findings

Findings are GuardDuty detection outputs. Finding types follow a consistent naming scheme:

```
ThreatPurpose:ResourceTypeAffected/ThreatFamilyName.DetectionMechanism!Artifact

Examples: UnauthorizedAccess:EC2/SSHBruteForce
          Backdoor:EC2/C&CActivity.B!DNS
          CryptoCurrency:EC2/BitcoinTool.B!DNS
          Recon:IAMUser/UserPermissions
          Exfiltration:S3/AnomalousBehavior
          Trojan:EC2/DNSDataExfiltration
          PenTest:IAMUser/KaliLinux
          Policy:S3/BucketBlockPublicAccessDisabled
```

- **ThreatPurpose** (threat intent): Backdoor, Behavior, CryptoCurrency, Exfiltration, Impact, PenTest, Persistence, Policy, PrivilegeEscalation, Recon, Stealth, Trojan, UnauthorizedAccess, etc. — represents attack *phase or intent*.
- **ResourceTypeAffected**: EC2, IAMUser, S3, EKSCluster, RDS, Lambda, etc.
- **DetectionMechanism**: Like `.B!DNS` showing how it was detected (DNS-based, etc.).

Each finding has a **severity** score 0.1–8.0+: Low (1.0–3.9), Medium (4.0–6.9), High (7.0–8.9). On exams, *what each finding means as a threat* matters more than the score itself.

> 💡 **Related Theory**: ThreatPurpose classification is essentially **MITRE ATT&CK** tactics mapping — Recon (reconnaissance), PrivilegeEscalation (privilege escalation), Persistence (persistence), Exfiltration (exfiltration), Impact (impact) etc. align with ATT&CK kill chain phases. Reading findings from an ATT&CK lens lets you gauge "how far has the attack progressed" to prioritize response.

## Threat Intelligence: Known Malicious + Custom

GuardDuty embeds threat intelligence feeds curated by AWS and third parties (CrowdStrike, Proofpoint, etc.). Communication with known malicious IPs and domains immediately becomes findings.

Additionally, users can register two custom lists:
- **Trusted IP list**: Activities from these IPs do not generate findings (whitelist). Corporate offices, VPN IPs, etc.
- **Threat IP list**: Communication with these IPs generates findings (custom blacklist). Integrate your own threat intelligence.

```
GuardDuty Threat Assessment
  ├─ AWS Curated Intelligence (automatic)
  ├─ Trusted IP list  → Suppress findings on match
  └─ Threat IP list   → Generate findings on match
```

> ⚠️ **Trap**: Trusted/Threat IP lists are managed at **delegated administrator (or individual account)** level; member accounts cannot add their own lists (admin manages centrally in org mode). Also, GuardDuty is *not* a prevention tool — adding an IP to Trusted doesn't *allow* its access, just *stops generating findings*. Access control is SG/NACL/WAF's job.

## Multi-Account: Delegated Administrator

Enterprises use dozens to hundreds of accounts. Enabling GuardDuty per account and viewing separately is impractical. **AWS Organizations + Delegated Administrator** is the answer:

```
Management Account ──designate──▶ Delegated Administrator Account (usually Security Tooling)
                                       │
                                       ├─ Enable GuardDuty org-wide
                                       ├─ Set "Auto-enable for new accounts"
                                       └─ Centralize and manage all member findings
```

- Management account designates one account (recommended: separate *Security Tooling* account) as **GuardDuty Delegated Administrator**.
- Delegated administrator enables GuardDuty across all org accounts and uses **auto-enable** to include new accounts automatically.
- Member account findings are *aggregated* in delegated administrator console for single-pane viewing.

> 💡 **Related Theory**: This is AWS's *multi-account security baseline* best practice. Security tools (GuardDuty, Security Hub, Detective, Macie, etc.) are delegated to a dedicated *Security Tooling* account separate from workload accounts, preventing workload account admins from disabling detection or hiding findings (permission separation). The delegated administrator pattern gives organization-wide visibility without burdening the management account (concentrated root privileges).

> ⚠️ **Trap**: Member accounts *cannot* disable GuardDuty on their own account (delegated administrator enforces org mode). "New account escapes detection" → **enable auto-enable**. Also, designating a delegated administrator is **only** the management account's privilege.

## After Findings: Automation Integration

Findings cannot end at viewing. GuardDuty publishes findings to **Amazon EventBridge** (near-real-time). Trigger downstream:

```
GuardDuty Finding ──▶ EventBridge Rule ──▶ Lambda (isolate/snapshot/tag)
                                        ├─▶ SNS (alert)
                                        ├─▶ Step Functions (response workflow)
                                        └─▶ Security Hub (aggregation, auto-integrate)
```

Example: `UnauthorizedAccess:EC2/SSHBruteForce` finding → EventBridge → Lambda moves EC2 to isolation SG + forensic snapshot + ticket creation. New findings emit to EventBridge instantly; subsequent occurrences of existing findings aggregate and publish at default 6-hour intervals (configurable 15 min–).

> 🔍 **Deeper Dive**: GuardDuty findings' value completes with *correlation* and *response*. A single finding may be noise, but when investigated with Detective (Day 2), correlated with other detections in Security Hub (Day 4), and automated response triggered via EventBridge, it delivers operations value. Viewing GuardDuty as just an "alert generator" is using half its value — design it as the entry to detection → investigation → response pipeline.

## Frequently Confused Distinctions

- **GuardDuty vs CloudTrail**: CloudTrail *records logs*, GuardDuty *analyzes logs and judges threats*. CloudTrail is source; GuardDuty interprets.
- **GuardDuty vs Inspector**: GuardDuty is *runtime threats* (live malicious activity happening now), Inspector is *vulnerabilities* (exploitable weaknesses). Detection timing differs (Day 3).
- **GuardDuty vs Macie**: Macie is *sensitive data (PII) classification* in S3, GuardDuty is threat behavior. Purposes differ.
- **GuardDuty vs WAF/SG**: GuardDuty *detects* (detect), does not *prevent* (block). Prevention is other controls' and automation's job.

## One-Line Summary Checklist

- [ ] GuardDuty enabled on organization delegated administrator (Security Tooling account) with auto-enable
- [ ] Using VPC default Route 53 Resolver for DNS-based detection
- [ ] Runtime Monitoring enabled for inside-host threats, Malware Protection for malware
- [ ] Findings connected to EventBridge for alerts and auto-remediation
- [ ] Trusted/Threat IP lists managed aligned with threat intelligence

---

## 📝 연습 문제

**문제 1.** 보안팀이 50개 계정 조직에서 GuardDuty를 운영하려 한다. 신규로 생성되는 계정이 자동으로 탐지에 포함되고, 워크로드 계정 관리자가 GuardDuty를 끄지 못하게 하려면?

A) 관리 계정에서만 GuardDuty를 켜고 다른 계정은 수동 초대  
B) 별도 Security Tooling 계정을 GuardDuty 위임 관리자로 지정하고 조직 모드로 auto-enable을 켠다  
C) 각 계정 관리자에게 GuardDuty를 켜도록 이메일로 요청  
D) CloudTrail만 조직 추적으로 켜면 GuardDuty가 자동 활성화된다  

**정답: B**  
해설: 멀티계정 베이스라인의 정답은 전용 Security Tooling 계정을 위임 관리자로 지정하고 조직 모드 + auto-enable로 신규 계정까지 자동 포함하는 것이다. 조직 모드에서는 위임 관리자가 멤버 계정의 GuardDuty를 중앙 관리하므로 워크로드 관리자가 임의로 끌 수 없다. 수동 초대·이메일 요청은 누락·사각지대를 낳고, CloudTrail을 켠다고 GuardDuty가 자동으로 켜지지는 않는다.

---

**문제 2.** EC2 인스턴스 안에서 실행 중인 악성 프로세스와 파일 변경을 GuardDuty로 탐지하고 싶다. 기초 GuardDuty만으로는 보이지 않았다. 무엇을 해야 하는가?

A) VPC Flow Logs를 별도로 S3에 저장한다  
B) GuardDuty Runtime Monitoring을 활성화한다  
C) CloudTrail 데이터 이벤트를 켠다  
D) Inspector를 활성화한다  

**정답: B**  
해설: 기초 GuardDuty는 네트워크 흐름·DNS·API 관점만 분석하므로 호스트 *내부*의 프로세스·파일 행위는 보지 못한다. 호스트 런타임 가시성은 경량 에이전트를 배포하는 Runtime Monitoring이 제공한다. Flow Logs 저장은 GuardDuty 동작과 무관하고, CloudTrail 데이터 이벤트는 API/S3 관점이며, Inspector는 런타임 위협이 아닌 취약점 스캔 도구다.

---

**문제 3.** GuardDuty가 DNS 기반 데이터 유출(DNS exfiltration) 핀딩을 전혀 생성하지 않는다. 조사 결과 해당 VPC는 커스텀 외부 DNS resolver를 사용한다. 원인은?

A) GuardDuty는 DNS를 분석하지 않는다  
B) DNS 기반 탐지는 VPC 기본 Route 53 Resolver를 사용할 때만 동작하므로, 외부 resolver 사용 시 사각지대가 된다  
C) DNS exfiltration 핀딩은 유료 플랜에만 있다  
D) Trusted IP 리스트에 모든 IP가 등록되어 있다  

**정답: B**  
해설: GuardDuty의 DNS 쿼리 분석은 VPC 기본 DNS(Route 53 Resolver)를 통과하는 질의에만 적용된다. 커스텀/외부 DNS resolver를 사용하면 GuardDuty가 DNS 질의를 볼 수 없어 DNS 기반 핀딩이 누락된다. GuardDuty는 기초 소스로 DNS를 분석하므로 A는 틀리고, DNS exfiltration은 기초 핀딩이며, 모든 IP를 신뢰 목록에 넣는 비정상 구성은 시나리오와 무관하다.

---

**문제 4.** `CryptoCurrency:EC2/BitcoinTool.B!DNS` 핀딩이 발생했다. 이 핀딩이 알려주는 것과 가장 적절한 1차 대응은?

A) EC2가 비트코인 채굴/통신 활동을 보이며, EventBridge로 해당 인스턴스 격리·스냅샷 자동화를 트리거한다  
B) 단순 정보성 핀딩이므로 무시한다  
C) S3 버킷이 공개되었다는 의미다  
D) IAM 사용자의 권한이 과도하다는 의미다  

**정답: A**  
해설: 핀딩 명명 규칙상 ThreatPurpose가 CryptoCurrency, 대상이 EC2, DNS 기반 탐지(`.B!DNS`)이므로 인스턴스가 암호화폐 채굴/관련 도메인과 통신 중임을 뜻한다 — 흔히 침해의 강한 신호다. 적절한 대응은 핀딩을 EventBridge로 받아 인스턴스 격리·포렌식 스냅샷·티켓팅을 자동화하는 것이다. 무시는 위험하고, S3 공개나 IAM 과다 권한은 다른 핀딩 유형(Policy:S3, Recon:IAMUser 등)이다.

---

**문제 5.** GuardDuty의 Trusted IP list에 대한 설명으로 옳은 것은?

A) 등록된 IP로부터의 접근을 네트워크 수준에서 허용(allow)한다  
B) 등록된 IP의 활동에 대해 GuardDuty가 핀딩을 생성하지 않도록 억제하지만, 접근 자체를 허용하는 통제는 아니다  
C) 등록된 IP와의 통신을 무조건 차단한다  
D) 멤버 계정마다 자유롭게 추가할 수 있다  

**정답: B**  
해설: Trusted IP list는 해당 IP의 활동에 대한 핀딩 생성을 억제하는 탐지 측 설정일 뿐, 접근 허용/차단 같은 네트워크 예방 통제가 아니다. 접근 통제는 SG/NACL/WAF의 역할이다. 통신을 차단하는 것은 Threat IP list의 핀딩 생성과도 다른 개념이며, 조직 모드에서 이 리스트는 위임 관리자가 중앙 관리하므로 멤버가 임의 추가하지 못한다.

---

