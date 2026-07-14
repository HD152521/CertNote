# Day 2 - Amazon Detective: Finding Investigation and Root Cause, Behavior Graph, GuardDuty Integration

Once GuardDuty says "something is wrong," the next question is always the same: **"Is it really a breach? How far has it spread? How did it start?"** This *investigation* phase is Amazon Detective's domain. If GuardDuty is *detection*, Detective is *investigation* — it takes one finding and visualizes all surrounding behavior, tracking root cause and blast radius.

Detective's core is "replacing the analyst's manual SQL slog of stitching scattered logs with an automatically built **behavior graph**." In incident investigation, the most expensive resource is analyst time. Detective pre-connects and aggregates data (dozens of days) into a graph, so when a finding lands, the analyst can answer "Did this IAM role behave differently than usual?" or "When did this IP start communicating with our environment?" in a few clicks.

## What It Consumes and What It Produces

Detective re-collects sources similar to GuardDuty's *for investigation purposes*:

```
Input Sources
  ├─ VPC Flow Logs
  ├─ CloudTrail Management Events
  ├─ GuardDuty Findings
  ├─ EKS Audit Logs
  └─ (Detective internally normalizes and connects)

Output
  └─ Behavior Graph: Entity + Relationship
```

- **Entity**: IAM users/roles, EC2 instances, IP addresses, AWS accounts, containers, user agents, S3 buckets, etc. — "nodes" that become investigation subjects.
- **Relationship**: "This role was assumed from this instance," "This IP communicated with this instance" — "edges."

Detective layers **time axis + baseline** on this graph. It creates each entity's *normal behavior profile* and shows how the finding-time behavior deviates from normal.

> 💡 **Related Theory**: This is security operations' *triage* and *root cause analysis* solved with data. Traditional SIEM requires analysts to write queries for correlation, but Detective *materializes* entity-to-entity connections upfront in a *graph data model*. "First-time observation" — this credential calling an API from an unseen region for the first time — is a critical breach investigation signal, and Detective auto-highlights it.

## From Finding to Investigation: Visual Workflow

Investigation typically starts from a GuardDuty finding or Security Hub and jumps via "Investigate in Detective":

```
GuardDuty Finding (e.g., abnormal API call)
   │  "Investigate in Detective"
   ▼
Detective: Entity (IAM role) Profile Page
   ├─ API call volume time-series (normal vs now — spike?)
   ├─ Call locations (region/IP) — new region?
   ├─ User agents used — new tooling (e.g., script)?
   ├─ Associated instances/IPs — where was it assumed from?
   └─ Time range slider to compare before/after incident
```

The analyst judges through this profile whether it's "normal operation's coincidental spike" or "stolen credential abuse." Key questioning patterns:
- **When first seen** — first appearance of new IP/region/agent.
- **How deviant** — call volume/failure rate baseline deviation.
- **How far spread** — other entities connected from one entity (lateral movement).

> ⚠️ **Trap**: Detective does *not* detect or block. It creates no new findings (that's GuardDuty) and blocks no traffic (that's WAF/SG). Detective *investigates and explains* existing findings and logs. "Auto-detect threat" → GuardDuty. "Investigate finding root cause" → Detective.

## Integration with GuardDuty: Partnership

Detective stands alone but shines as GuardDuty's partner:

```
GuardDuty (detect)  ──findings──▶  Security Hub (aggregate)
     │                                  │
     │  (both connected to Detective's behavior graph)
     ▼                                  ▼
        Amazon Detective (investigate)
        - Map GuardDuty findings to graph context
        - Auto-collect and visualize surrounding behavior
        - "Does this finding share credential/IP with other findings"
```

- GuardDuty findings auto-connect to Detective graph entities, letting one click launch investigation context.
- When multiple findings share *same entity (IP, role)*, Detective groups them as "campaign" level.
- **Finding groups**: Detective auto-groups related findings and entities into single investigation units (reduces individual finding noise).

> 💡 **Related Theory**: This solves *alert fatigue* — when detection tools dump hundreds of findings, analysts freeze. Detective's finding groups bundle multiple findings from a single attack campaign into one unit — raising SOC signal-to-noise ratio, a key operational mechanism.

## Multi-Account Investigation

Detective uses the identical **Organizations + Delegated Administrator** model as GuardDuty. Recommended: designate the *same* Security Tooling account as Detective delegated administrator:

```
Management Account ──designate──▶ Detective Delegated Administrator (Security Tooling)
                                       │
                                       └─ Integrate all member data into single behavior graph
```

- Member account data flows into *one* behavior graph, enabling tracking of lateral movement across account boundaries (e.g., role stolen from one account accessing resources in another).
- Aligning GuardDuty, Security Hub, Detective delegated administrators to the same account smooths investigation experience (consistent data and permissions).

> ⚠️ **Trap**: Enabling Detective doesn't instantly create a rich graph. **Data accumulation period (usually 2+ weeks)** is needed to form baseline. "I just enabled Detective but see no past behavior" is normal — it collects data *after* activation. So pre-enabling before incidents is best practice.

## Detective Investigations (Auto-Analysis)

Modern Detective offers **Automated Investigations** for IAM users/roles. Specify a credential, and Detective maps to MITRE ATT&CK tactics, auto-analyzes suspicious behavior (privilege escalation, reconnaissance, etc.), and generates risk summary. Analysts need not manually traverse the graph — "is this role risky?" gets fast signals.

> 🔍 **Deeper Dive**: Precisely positioning Detective in the detect-investigate-respond pipeline is core to exam and practice. *Detection (GuardDuty)* signals "something is wrong," *aggregation (Security Hub)* collects "on one screen," *investigation (Detective)* answers "why, how far, how," *response (EventBridge/Lambda/SSM)* takes "action." Mistaking Detective for "another detection tool" is an exam trap — Detective *explains* findings, not *generates* them.

## Frequently Confused Distinctions

- **Detective vs GuardDuty**: GuardDuty detects (generates findings), Detective investigates (explains findings, root cause). Detective creates no findings.
- **Detective vs CloudTrail Lake/Athena**: Athena/CloudTrail Lake are *manual query* analysis (SQL), Detective is *pre-built graph* for visual investigation. Detective auto-provides baseline and relationships.
- **Detective vs Security Hub**: Security Hub *aggregates* findings from multiple tools (standardizes to ASFF), Detective is *deep investigation*. Aggregation vs depth.
- **Detective vs Inspector**: Inspector is vulnerabilities (weaknesses), Detective is incident investigation (behavior). Completely different axes.

## One-Line Summary Checklist

- [ ] Detective enabled *before* incident to pre-accumulate baseline
- [ ] Detective delegated administrator aligned to same Security Tooling account as GuardDuty and Security Hub
- [ ] Workflow to enter investigation context from finding via "Investigate in Detective"
- [ ] Finding groups bundle related findings to reduce alert fatigue
- [ ] Detective correctly positioned as investigation tool, not detection/prevention

---

## 📝 연습 문제

**문제 1.** GuardDuty가 IAM 역할에 대한 비정상 API 호출 핀딩을 생성했다. 보안 분석가는 "이 자격증명이 언제부터 새 지역에서 활동했고, 어떤 리소스까지 접근했는지" 근본 원인과 영향 범위를 빠르게 파악하려 한다. 가장 적절한 도구는?

A) Amazon Inspector  
B) Amazon Detective  
C) AWS Config  
D) Amazon Macie  

**정답: B**  
해설: 핀딩의 근본 원인·영향 범위를 동작 그래프로 시각화해 "최초 발생 시점, 새 지역·IP, 연관 엔티티"를 추적하는 것은 Detective의 정확한 용도다. Inspector는 취약점 스캔, Config는 리소스 구성 이력, Macie는 S3 민감 데이터 분류로 모두 행위 기반 인시던트 조사와는 다른 목적이다.

---

**문제 2.** 팀이 침해 의심 후 Amazon Detective를 처음 활성화했는데, 사건 발생 이전의 풍부한 행위 데이터가 그래프에 보이지 않는다. 그 이유로 옳은 것은?

A) Detective가 잘못 구성되었다  
B) Detective는 활성화 이후부터 데이터를 축적하므로 베이스라인 형성에 시간이 필요하며, 사고 전 미리 켜두는 것이 모범이다  
C) Detective는 VPC Flow Logs만 분석하기 때문이다  
D) 위임 관리자를 지정하지 않았기 때문이다  

**정답: B**  
해설: Detective는 활성화 시점부터 데이터를 수집·연결하며 의미 있는 베이스라인을 만드는 데 보통 2주 이상이 걸린다. 따라서 사고가 터진 뒤 켜면 과거 컨텍스트가 부족하고, 사고 이전에 상시 켜두는 것이 정답이다. 구성 오류·소스 제한·위임 관리자 미지정 때문이 아니라 데이터 축적 특성 때문이다.

---

**문제 3.** Amazon Detective의 역할에 대한 설명으로 옳은 것은?

A) 자체적으로 새로운 위협 핀딩을 생성하고 악성 트래픽을 차단한다  
B) 기존 핀딩과 로그를 동작 그래프로 연결해 조사·근본원인 분석을 돕지만, 핀딩 생성이나 차단은 하지 않는다  
C) S3 버킷의 PII를 자동 분류한다  
D) EC2와 ECR의 CVE를 스캔한다  

**정답: B**  
해설: Detective는 조사 전용 도구로, GuardDuty가 만든 핀딩과 로그를 그래프로 묶어 "왜·어디까지·어떻게"를 분석한다. 핀딩 생성은 GuardDuty, 차단은 WAF/SG, PII 분류는 Macie, CVE 스캔은 Inspector의 역할이다. Detective를 탐지/차단 도구로 오인하는 것이 대표적 함정이다.

---

**문제 4.** SOC 분석가들이 GuardDuty 핀딩 폭증으로 경보 피로를 겪는다. Detective의 어떤 기능이 관련 핀딩·엔티티를 단일 조사 단위로 묶어 신호 대 잡음비를 높여 주는가?

A) Trusted IP list  
B) Finding groups  
C) Malware Protection  
D) Macie 분류  

**정답: B**  
해설: Detective의 finding groups는 같은 자격증명·IP 등 공통 엔티티를 공유하는 다수 핀딩을 하나의 조사 단위로 자동 그룹핑해 경보 피로를 줄인다. Trusted IP list는 GuardDuty의 핀딩 억제 설정이고, Malware Protection은 멀웨어 스캔, Macie는 데이터 분류로 핀딩 그룹핑과 무관하다.

---

**문제 5.** 한 계정에서 탈취된 IAM 역할이 다른 계정의 리소스에 접근한 횡적 이동(lateral movement)을, 계정 경계를 넘어 단일 화면에서 추적하려 한다. 가장 적절한 Detective 구성은?

A) 각 계정에서 Detective를 개별로 켜고 따로 조사  
B) Organizations 위임 관리자(Security Tooling 계정)로 모든 계정 데이터를 단일 동작 그래프에 통합  
C) Detective 대신 각 계정에서 CloudTrail을 Athena로 수동 쿼리  
D) GuardDuty만으로 충분하므로 Detective는 불필요  

**정답: B**  
해설: 계정 경계를 넘는 횡적 이동 추적은 모든 멤버 계정 데이터를 하나의 동작 그래프로 통합해야 가능하며, 이는 Organizations 위임 관리자 모델(GuardDuty·Security Hub와 동일 계정 정렬)로 달성한다. 계정별 개별 조사나 수동 Athena 쿼리는 통합 시야가 없어 비효율적이고, GuardDuty만으로는 깊은 조사·상관이 부족하다.

---

