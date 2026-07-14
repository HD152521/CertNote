# Day 5 - Week 7 Integration: Audit Trail Scenario Review

This week covered "the ability to reconstruct truth after the fact" — audit trails. Four pillars: **CloudTrail** (activity: who did what), **AWS Config** (configuration: resource state at each point), **VPC Flow Logs and Resolver query logs** (network: what traffic/DNS flowed), and **integrity, retention, centralization** (storing evidence trustworthily). Today we weave these pieces into *one breach investigation*.

## Five Pillars at a Glance

| Tool | Answers | Enabled by Default | Core Pitfall |
|------|---------|-------------------|--------------|
| CloudTrail management events | Who called control-plane API | Yes (Event history 90 days) | Long retention needs trail |
| CloudTrail data events | Who accessed object/function | **No** | Selector add-on, cost |
| CloudTrail Lake | SQL query without code | No | Max 10 years, separate cost |
| AWS Config | Resource state, history, relationships | No (per-region) | Recorder per region |
| VPC Flow Logs | IP traffic metadata | No | No payload, pkt-srcaddr for NAT |
| Resolver query log | VPC-internal DNS queries | No | Resolver bypass risk |

## Data vs Management Events: Don't Confuse to the End

Most frequent exam pitfall. Memorize this:

| Action | Event Type | Logged by Default? |
|--------|-----------|-------------------|
| `RunInstances`, `CreateBucket`, `AttachRolePolicy` | Management | Yes |
| `ConsoleLogin`, `AssumeRole` | Management | Yes |
| S3 `GetObject`/`PutObject`/`DeleteObject` | Data | **No** |
| Lambda `Invoke` | Data | **No** |
| DynamoDB `PutItem`/`GetItem` | Data | **No** |

> ⚠️ **Pitfall Recap**: "Who *created bucket*" = management event (logged). "Who *downloaded bucket object*" = data event (selector needed). This one sentence solves half the trap questions.

## Preventive vs Detective vs Responsive: Control Layer Mapping

Week 7 tools sorted by security control classification:

- **Preventive**: SCP, IAM policy, security groups/NACL, Object Lock, KMS key policy — *block before happening*.
- **Detective**: CloudTrail, Config rules (evaluations), Flow Logs, Resolver logs, GuardDuty — *find what happened*.
- **Responsive**: Config auto-remediation (SSM Automation), EventBridge→Lambda, SNS alerts — *undo or notify*.

> 💡 **Related Theory**: Exams often ask "preventive or detective." Hint: *timing*. "Block S3 public creation" = SCP/Block Public Access (preventive), "create then auto-revert" = Config rule + remediation (detective+responsive). They are not mutually exclusive; *layering* both is best practice — preventive failing means detective+responsive catches it.

## Integrated Scenario 1: S3 Data Exfiltration Breach Investigation

> **Situation**: Security team receives report of data exfiltration. Investigate.

Investigation flow and tool roles:

1. **What was accessed, by whom** → CloudTrail **data events** (S3 `GetObject`) show `userIdentity.arn`, `sourceIPAddress`, MFA status accessing objects. (Prerequisite: data event selector was pre-enabled for evidence to exist.)
2. **How was that credential obtained** → CloudTrail **management events** trace `AssumeRole`, `ConsoleLogin`, suspicious permission grants (`AttachRolePolicy`).
3. **When was bucket exposed** → **Config** configuration timeline shows when bucket policy/Block Public Access settings changed.
4. **Where did data actually go** → VPC **Flow Logs** (egress volume, `pkt-srcaddr` identifying original instance, destination IP).
5. **What domain/C2 contacted** → **Resolver query logs** correlate suspicious domain queries.
6. **Can we trust this evidence** → Logs protected via separate account + Object Lock + integrity validation (tampering ruled out).

> 🎯 **Scenario Point**: No single tool completes the picture. CloudTrail (who/how) + Config (when exposed) + Flow Logs (how much egressed) + Resolver (where to) *cross-correlated* complete the timeline. This correlation requires day 4's *centralization*.

## Integrated Scenario 2: Security Group Misconfiguration Trace

> **Situation**: 0.0.0.0/0:3389 (RDP) suddenly open in operations. Who, when, why?

- **Config**: Configuration timeline exactly *when* inbound rule added, CI before/after comparison.
- **CloudTrail**: Same time `AuthorizeSecurityGroupIngress` caller, source IP, session.
- **Config Rule**: `restricted-ssh`/`restricted-common-ports` managed rule should've caught this `NON_COMPLIANT`. If not caught, rule not deployed.
- **Auto-remediation**: Future prevention via SSM Automation dangerously-open rules in conformance pack.

> 💡 **Related Theory**: Config shows *state and time* ("3389 was open starting 14:02"), CloudTrail shows *action and actor* ("Alice's role added that rule at 14:02"). Their combination is audit essence — connecting *state changes* to *causing actions*.

## Integrated Scenario 3: Building Tamper-Proof Central Audit Baseline

> **Situation**: 300-account organization: build audit "undeletable by any admin, root cannot delete, security-only read."

Correct architecture (Week 7 complete integration):
1. Management account **organization trail** (multi-region, all management events + needed data events) → member accounts cannot disable.
2. Logs to **separate logging account** S3 (bucket policy: `aws:SourceOrgID` + `bucket-owner-full-control`).
3. Bucket: **Object Lock Compliance** (retention period) + versioning + **SSE-KMS** (dedicated CMK, key policy limits decryption principals).
4. **Log file integrity validation** enabled for tampering proof.
5. **Organization conformance pack** (encryption, public access block rules) deployed uniformly + auto-remediation.
6. **EventBridge** immediate alerts on `StopLogging`/`DeleteTrail`.

> 🔍 **Deeper Dive**: This baseline is what AWS **Control Tower** automates (Log Archive account + guard rails). For "build audit baseline *from scratch*," manual assembly above; for "already-structured," Control Tower. Either way, components (org trail, logging account, Object Lock, KMS, conformance pack) are identical. Week 7's every piece integrates here — auditing/monitoring foundation. Next week's threat detection (GuardDuty, Security Hub, Detective) layers *automatic analysis atop this foundation*. Centralization is prerequisite.

## Final Checklist

- [ ] Management vs data events (S3 object, Lambda invoke = data)
- [ ] CloudTrail Lake = no-code SQL, max 10 years
- [ ] Integrity validation = SHA-256 hash chain + RSA signed digest (proves tampering)
- [ ] Config = state/history/relationships, per-region recorder, custom = Lambda/Guard
- [ ] Conformance Pack = rules+remediation bundle, organization deployment
- [ ] Auto-remediation = SSM Automation, loop/downtime risk
- [ ] Flow Logs = metadata (no payload), pkt-srcaddr for NAT tracking
- [ ] Resolver query log = DNS visibility, bypass risk, DNS Firewall blocks
- [ ] Object Lock Compliance = root cannot delete (preventive)
- [ ] Separate logging account + KMS split = isolation + cryptographic access control

---

## 📝 연습 문제

**문제 1.** S3 데이터 유출 침해를 조사하는데, 어느 자격증명이 민감 객체를 다운로드했는지 CloudTrail에서 찾을 수 없다. 사전에 무엇이 누락됐기 때문인가?

A) 로그 파일 무결성 검증  
B) trail에 S3 객체 수준 데이터 이벤트 selector  
C) Config recorder  
D) Resolver 쿼리 로깅  

**정답: B**  
해설: S3 `GetObject`는 데이터 이벤트로 기본 기록되지 않으므로, 사전에 trail에 S3 데이터 이벤트 selector(또는 advanced event selector)가 켜져 있어야 다운로드 주체를 추적할 수 있다. 무결성 검증은 변조 증명용, Config는 구성 상태, Resolver 로그는 DNS로 객체 접근 주체 추적과 무관하다. 데이터 이벤트는 사후에 소급 기록되지 않으므로 사전 활성화가 핵심이다.

---

**문제 2.** "퍼블릭 S3 버킷의 *생성 자체를 거부*하라"와 "퍼블릭 버킷이 *생성되면 자동으로 되돌려라*"는 각각 어떤 통제 유형인가?

A) 둘 다 예방 통제  
B) 전자는 예방(SCP/Block Public Access), 후자는 탐지+대응(Config 규칙 + 자동 교정)  
C) 전자는 대응, 후자는 예방  
D) 둘 다 탐지 통제  

**정답: B**  
해설: 시점이 단서다. "생성 자체를 거부"는 행위가 일어나기 전에 막는 예방 통제(SCP, S3 Block Public Access)이고, "생성되면 되돌려라"는 일어난 위반을 탐지(Config 규칙)하고 자동 교정(SSM Automation)으로 되돌리는 탐지+대응이다. 둘은 배타적이지 않고 계층으로 함께 쓰는 것이 모범이다.

---

**문제 3.** 보안 그룹에 0.0.0.0/0:3389이 열린 *시점*과 그 변경을 *일으킨 API 호출자*를 각각 어떤 서비스로 확인하는가?

A) 시점은 CloudTrail, 호출자는 Config  
B) 시점은 AWS Config 구성 타임라인, 호출자는 CloudTrail의 `AuthorizeSecurityGroupIngress` 이벤트  
C) 둘 다 VPC Flow Logs  
D) 둘 다 Resolver 쿼리 로그  

**정답: B**  
해설: Config는 리소스의 구성 항목(CI) 타임라인으로 규칙이 *언제* 추가됐는지(상태 변화 시점)를 보여주고, CloudTrail은 같은 시각의 `AuthorizeSecurityGroupIngress` 호출에서 *누가/어디서* 변경했는지(행위·주체)를 보여준다. 상태 변화는 Config, 원인 행위는 CloudTrail이라는 역할 구분이 핵심이다. Flow Logs·Resolver는 트래픽/DNS로 구성 변경 추적과 무관하다.

---

**문제 4.** 300개 계정 조직에 "멤버 관리자가 끌 수 없고, 루트조차 보존 기간 내 삭제 불가하며, 보안팀만 읽는" 감사 로그 기반을 직접 구성하려 한다. 올바른 구성 요소 조합은?

A) 각 계정 개별 trail + 단일 KMS 키 공유  
B) organization trail(멀티리전) → 별도 로깅 계정 S3(Object Lock Compliance + SSE-KMS 키 정책 분리 + SourceOrgID 버킷 정책) + 무결성 검증  
C) Event history 90일 + 버전 관리  
D) CloudWatch Logs만 + Governance 모드 Object Lock  

**정답: B**  
해설: organization trail은 멤버 관리자가 끌 수 없게 하고, 별도 로깅 계정은 운영 침해와 격리하며, Object Lock Compliance는 루트조차 보존 기간 내 삭제 불가, SSE-KMS 키 정책 분리는 복호화 주체를 보안팀으로 제한, SourceOrgID 버킷 정책은 confused deputy를 막고, 무결성 검증은 변조를 증명한다. 개별 trail은 일관성·강제성 부족, Event history는 90일·내보내기 불가, Governance 모드는 권한자가 우회 가능해 "루트조차 불가" 요구를 못 채운다.

---

**문제 5.** 침해 조사에서 "감염된 EC2가 외부 C2 서버와 통신했고, 어떤 도메인을 통해 연결했는지" 완전한 그림을 그리려 한다. 어떤 로그들의 *상관 분석*이 필요한가?

A) CloudTrail 관리 이벤트만으로 충분하다  
B) VPC Flow Logs(egress 볼륨·목적지 IP·pkt-srcaddr)와 Route 53 Resolver 쿼리 로그(조회 도메인)를 시간으로 상관 분석  
C) Config 구성 타임라인만  
D) S3 데이터 이벤트만  

**정답: B**  
해설: Flow Logs는 어느 인스턴스가 어떤 IP로 얼마나 egress했는지(pkt-srcaddr로 NAT 뒤 원본 특정)를, Resolver 쿼리 로그는 그 인스턴스가 어떤 도메인을 조회해 그 IP를 받았는지를 보여준다. 둘을 시간 기준으로 상관하면 "IP만으로는 모호한 통신"에 도메인 맥락이 더해져 C2 통신의 전체 그림이 완성된다. CloudTrail·Config·S3 이벤트는 네트워크·DNS 차원의 통신 경로를 직접 드러내지 못한다.

---
