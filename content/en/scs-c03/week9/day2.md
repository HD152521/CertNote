# Day 2 - Amazon Detective: Finding Investigation and Root Cause, Behavior Graph, GuardDuty Integration

When GuardDuty tells you "something is wrong," the next question is always the same: **"Is it really a compromise? How far has it spread? How did it start?"** This *investigation* stage is the domain of Amazon Detective. If GuardDuty is *detect*, Detective is *investigate* — it takes a single finding, visualizes all the behavior around it, and traces the root cause and the blast radius.

The core of Detective is that it "replaces the SQL grunt work of analysts piecing together scattered logs by hand with an automatically built **behavior graph**." The most expensive resource in incident investigation is the analyst's time. Detective pre-links and aggregates normal-time data (many days' worth) into a graph, so that the moment a finding appears, an analyst can answer "Did this IAM role behave differently than usual?" or "Since when has this IP been communicating with our environment?" in a few clicks.

## What It Consumes and What It Produces

Detective re-collects and links sources similar to GuardDuty's *for investigation purposes*:

```
Input sources
  ├─ VPC Flow Logs
  ├─ CloudTrail management events
  ├─ GuardDuty findings
  ├─ EKS audit logs
  └─ (Detective normalizes and links internally)

Output
  └─ Behavior Graph: Entities + Relationships
```

- **Entity**: IAM users/roles, EC2 instances, IP addresses, AWS accounts, containers, user agents, S3 buckets, and so on — the "nodes" that become investigation targets.
- **Relationship**: The "edges," such as "this role was assumed from this instance" or "this IP communicated with this instance."

Detective layers a **time axis + baseline** onto this graph. That is, it builds each entity's *usual behavior profile* in advance and shows how far the behavior at the time of the finding deviates from the norm.

This is the way security operations solves *triage* and *root cause analysis* with data. A traditional SIEM has analysts write queries themselves to find correlations, but Detective pre-materializes the connections between entities with a *graph data model*. A *first-time observation* such as "this credential called an API it had never called, from a region it had never been seen in" is a key signal in a compromise investigation, and Detective highlights it automatically.

### The Axis for Choosing Investigation Tools: Same Logs, Different Questions

Multiple services share the *same sources*, CloudTrail and VPC Flow. On the exam, the axis that distinguishes them is not the data but **the form of the questions they can answer**.

| Tool | How it holds the data | Questions it answers well | What it cannot do |
|------|----------------------|---------------------------|-------------------|
| **GuardDuty** | Analyzes streams in real time, does not return the originals | "Is there malicious activity right now?" | Arbitrary queries over the past |
| **Detective** | Pre-builds an entity/relationship **graph + baseline** | "How does this principal differ from usual?", "How far did it spread?" | Generating findings, blocking, arbitrary SQL |
| **Athena (CloudTrail in S3)** | Original files as they are, queries written by the user | "Pull every event with exactly this condition" | Providing baselines/relationships automatically |
| **CloudTrail Lake** | Managed event data store + SQL | Long-retention audit queries | Visual relationship exploration |
| **Security Lake** | Central data lake normalized to OCSF | Supplying data to third-party analysis tools | Not an investigation UI by itself |

The key contrast is **Detective vs Athena**. Athena is powerful for analysts who "already know what to ask," and Detective is powerful in **"the first 30 minutes when you don't know what to ask."** The early part of a compromise investigation is always the latter — the value of Detective is getting instant answers to "What is this role's usual call volume?" and "When did this IP first appear?" when you do not yet know what is abnormal. Conversely, an exhaustive investigation with a settled condition, such as "aggregate by principal every `GetObject` against a specific bucket over the past 90 days," is right for Athena/CloudTrail Lake.

> ⚠️ **Pitfall**: An option like "use Detective to pull a specific API call from 90 days ago with SQL" is wrong. Detective **provides no query language** — it is a tool for exploring predefined profiles, timelines, and relationship views. Conversely, choosing Athena for "quickly determine the root cause and blast radius of a finding" is also wrong. Because you must join by hand, it does not satisfy the condition *quickly*. When the question carries **"quickly / with minimal operational overhead,"** it tilts toward the managed graph.

## From Finding to Investigation: The Visual Workflow

An investigation usually starts from a GuardDuty finding or Security Hub and jumps to Detective with "Investigate in Detective":

```
GuardDuty finding (e.g., anomalous API call)
   │  "Investigate in Detective"
   ▼
Detective: profile page of that entity (IAM role)
   ├─ API call volume time series (usual vs now — a spike?)
   ├─ Call locations (region/IP) — a new region?
   ├─ User agents used — a new tool (e.g., a script)?
   ├─ Associated instances/IPs — where was it assumed from?
   └─ Time-range slider to compare before and after the incident
```

Through this profile, the analyst judges whether it is "a coincidental spike in normal operations" or "abuse of stolen credentials." The key question patterns:
- **When was it first seen** — the point at which a new IP/region/agent first appeared.
- **How far did it deviate** — the deviation of call volume and failure rate from baseline.
- **How far did it spread** — other entities connected from one entity (lateral movement).

> ⚠️ **Pitfall**: Detective does not *detect* or *block*. It does not create new findings (that is GuardDuty), and it does not block traffic (that is WAF/SG). Detective is a tool that *investigates and explains* findings and logs that *already exist*. The answer to "automatically detect threats" is GuardDuty, and the answer to "investigate the root cause of a finding" is Detective.

### How One Finding Decomposes into Five Investigation Questions

To understand Detective properly, you need to see "which field of the finding becomes which axis of the graph." Let us bring back the credential exfiltration finding from day1 and follow what each field turns into in the investigation.

```json
{
  "Type": "UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS",
  "Severity": 8,
  "AccountId": "111122223333",
  "Resource": {
    "ResourceType": "AccessKey",
    "AccessKeyDetails": {
      "AccessKeyId": "ASIAEXAMPLEKEYID",
      "PrincipalId": "AROAEXAMPLE:i-0abc123def4567890",
      "UserType": "AssumedRole",
      "UserName": "app-server-role"
    }
  },
  "Service": {
    "Action": {
      "ActionType": "AWS_API_CALL",
      "AwsApiCallAction": {
        "Api": "ListBuckets",
        "CallerType": "Remote IP",
        "RemoteIpDetails": {
          "IpAddressV4": "198.51.100.24",
          "Organization": { "Asn": "64500", "AsnOrg": "EXAMPLE-HOSTING" }
        }
      }
    },
    "EventFirstSeen": "2026-03-14T02:11:07Z",
    "EventLastSeen": "2026-03-14T02:29:52Z"
  }
}
```

| Finding field | What it becomes in Detective | The question it prompts |
|---------------|------------------------------|-------------------------|
| `AccessKeyDetails.UserName: app-server-role` | Profile page of the **role entity** | "What are this role's usual API call volume and call list? Is the present inside or outside that distribution?" |
| `:i-0abc...` in `PrincipalId` | Role ↔ **EC2 instance** entity relationship | "Is this role normally assumed only from this instance? Was it also assumed elsewhere?" |
| `RemoteIpDetails.IpAddressV4` | **IP address entity** | "When did we first see this IP? Did this IP also communicate with *other* roles and instances in our environment?" |
| `AsnOrg: EXAMPLE-HOSTING` | The ASO (autonomous system organization) of the IP profile | "Have there been calls from this organization's network in the past — is this its first appearance?" |
| `EventFirstSeen/LastSeen` | **Time-range scope** | "What else did the same entity do before and after these 18 minutes?" |
| `Api: ListBuckets` | API call breakdown on the role profile | "Was there an actual `GetObject` after the enumeration — did it move from reconnaissance to exfiltration?" |

What is decisive here is **what came after `ListBuckets`**. The finding says only that "enumeration was done," but what the investigation must answer is "so what did they take?" The answer to this question is not inside the finding; it comes only from looking at the *entire before-and-after behavior* of the same credentials — and that is Detective's reason for existing.

The most expensive judgment in an investigation is "when to stop." Compromise scoping can easily expand without limit — the resources this role accessed, other principals that accessed those resources, other resources those principals touched... a graph naturally extends endlessly. Practical investigations stop **"where the indicators of compromise (IoC) break."** That is, activity not connected to any of the three axes — attacker IP, time window, credentials — is regarded as normal and expansion stops. What Detective's time-range slider and entity profiles actually do is this **boundary-drawing**. Its purpose is to answer the question "how far must I dig" with data, not to draw a pretty graph.

### Investigation Indicators: Anomaly Signals Detective Points Out Automatically

Detective's automated investigation sweeps the target principal's activity and extracts anomaly signals in the form of **indicators**. Knowing the indicator types gives you a checklist of "what to look at in an investigation."

| Indicator type | What it catches | Why it is a sign of compromise |
|----------------|-----------------|--------------------------------|
| **TTPs** (tactics and techniques) | API call patterns mapped to MITRE ATT&CK tactics | If you see the *order* reconnaissance → privilege escalation → persistence, it is no coincidence |
| **New geolocation** | A call from a geographic location this principal has never been seen at | The credentials have left where they should be |
| **New ASO** | A call from an autonomous system organization (a hosting provider, etc.) not seen before | A call from somewhere other than the office or CI |
| **New user agent** | An SDK/CLI/script string not seen before | The tool a human used has changed into an attack script |
| **Flagged IP** | A connection to an IP listed in threat intelligence | Known malicious infrastructure |
| **Impossible travel** | Geographic movement within a time interval that is physically impossible | Two or more parties are using the same credentials simultaneously |
| **Related findings/finding group** | Other findings sharing the same entity | Not a single event but a campaign |

The common grammar of these indicators is the **"first-time observation."** In security analysis, "something never seen before" is itself a signal — because normal operations are repetitive and attacks are novel. This is also why it covers the area that signature-based detection misses. Attack tools change every time, but the fact "these credentials were used for the first time in this region" holds regardless of the tool. There is a cost, though — normal changes (expanding to a new Region, introducing a new CI, an office move) are equally "firsts," so indicators must be treated as **questions, not verdicts**. Using indicators as triggers for automatic blocking will cut off normal operations.

## Integration with GuardDuty: A Paired Relationship

Detective can be used alone, but it shows its true value when paired with GuardDuty:

```
GuardDuty (detect)  ──findings──▶  Security Hub (aggregate)
     │                                  │
     │  (both are linked to the Detective behavior graph)
     ▼                                  ▼
        Amazon Detective (investigate)
        - Maps GuardDuty findings to graph context
        - Automatically collects and visualizes behavior around a finding
        - Correlates "does this finding share the same credentials/IP as other findings?"
```

- GuardDuty findings are automatically linked to entities in the Detective graph, so one click on a finding enters the investigation context.
- When several findings share the *same entity (IP, role)*, Detective groups them so they are viewed at the "campaign" level.
- **Finding groups**: Detective automatically groups related findings and entities and presents them as a single investigation unit (reducing the noise of individual findings).

This is the solution to the problem of *alert fatigue*. When a detection tool pours out hundreds of findings, analysts are paralyzed. Detective's finding groups bundle the many findings derived from a single attack campaign into one, reducing the "units to investigate" — the key mechanism for raising the signal-to-noise ratio of SOC operations.

## Multi-Account Investigation

Detective also uses the same **Organizations + delegated administrator** model as GuardDuty. The recommended configuration is to designate the *same* Security Tooling account as the Detective delegated administrator as for GuardDuty:

```
Management account ──designates──▶ Detective delegated administrator (Security Tooling account)
                          │
                          └─ Integrates all organization accounts' data into a single behavior graph
```

- Member account data converges in *one* behavior graph, so lateral movement across account boundaries (for example, a role stolen in one account accessing resources in another account) can be traced.
- Aligning the delegated administrators of GuardDuty, Security Hub, and Detective to the same account makes the investigation experience seamless (consistent data and permissions).

Turning on Detective does not immediately produce a rich graph. Forming a baseline requires a **data accumulation period (usually two weeks or more)**. "I just turned on Detective but can't see past behavior" is normal — it accumulates data from *after* activation. That is why turning it on in advance, *before* an incident, is the best practice.

```
[ Multi-account Detective wiring ]

 Organizations management account
   │  enable-organization-admin-account  (management account only)
   ▼
 Security Tooling account = Detective delegated administrator
   │  1 behavior graph (per Region)
   │  update-organization-configuration --auto-enable
   │
   ├── Member account A ──┐
   ├── Member account B ──┼── Logs and findings merge into one graph
   └── New account N ─────┘
                    │
                    ▼
   Relationships that cross account boundaries become "visible"
     e.g.) Role stolen in account A → access to account B resources
           With per-account graphs, this edge would not even exist

 * Align to the same account as the delegated administrators of GuardDuty, Security Hub, and Inspector.
 * The graph is also per Region — you must turn on Detective in every Region you want to investigate.
```

### Real CLI: From Graph Creation to Automated Investigation

```bash
# 1) Create a behavior graph in this Region = turn on Detective (one graph per Region)
aws detective create-graph --tags Owner=security-tooling

GRAPH=$(aws detective list-graphs --query 'GraphList[0].Arn' --output text)

# 2) (Management account) Designate the security account as the Detective delegated administrator
aws detective enable-organization-admin-account --account-id 999988887777

# 3) (Delegated administrator) Automatically enroll new organization accounts in the graph
aws detective update-organization-configuration \
  --graph-arn "$GRAPH" --auto-enable

# 4) Start an automated investigation of a specific IAM role — specify the incident time window
aws detective start-investigation \
  --graph-arn "$GRAPH" \
  --entity-arn "arn:aws:iam::111122223333:role/app-server-role" \
  --scope-start-time 2026-03-14T00:00:00Z \
  --scope-end-time   2026-03-14T06:00:00Z

# 5) Check the investigation summary and indicators
aws detective get-investigation \
  --graph-arn "$GRAPH" --investigation-id "in-abc123def456"

aws detective list-indicators \
  --graph-arn "$GRAPH" --investigation-id "in-abc123def456"
```

Practicing reading the form `list-indicators` returns is itself investigative skill.

```json
{
  "investigationId": "in-abc123def456",
  "indicators": [
    {
      "indicatorType": "NEW_ASO",
      "indicatorDetail": {
        "newAsoDetail": { "aso": "EXAMPLE-HOSTING", "isNewForEntireAccount": true }
      }
    },
    {
      "indicatorType": "TTP_OBSERVED",
      "indicatorDetail": {
        "tTPsObservedDetail": {
          "tactic": "Discovery", "technique": "Cloud Infrastructure Discovery",
          "apiName": "ListBuckets", "apiSuccessCount": 12, "apiFailureCount": 0
        }
      }
    },
    {
      "indicatorType": "IMPOSSIBLE_TRAVEL",
      "indicatorDetail": {
        "impossibleTravelDetail": {
          "startingIpAddress": "203.0.113.10", "endingIpAddress": "198.51.100.24",
          "hourlyTimeDelta": 1
        }
      }
    }
  ]
}
```

The fact that the three indicators appeared together produces a much stronger conclusion than any individual indicator.

- `NEW_ASO` + `isNewForEntireAccount: true` — a call from this hosting provider's network is the **first in the entire history of the account**. It means the anomaly is not just this role's but the account's, which is far heavier.
- `TTP_OBSERVED` with `tactic: Discovery` + `apiFailureCount: 0` — it is the reconnaissance stage and **everything succeeded with no failures**. Many failures would indicate an unauthorized party fumbling around, but zero failures means these credentials actually hold those permissions. That is, it is also a side finding that least privilege was not observed.
- `IMPOSSIBLE_TRAVEL`, time interval 1 hour — the same credentials were used from two points physically impossible to travel between. It is strong evidence that **a legitimate user and an attacker are using the same credentials at the same time**, and it effectively rules out benign interpretations like "a legacy batch suddenly spiked."

> 🎯 **Scenario**: If it says "The team is split over a single GuardDuty finding between 'isn't a normal batch job just spiking?' and 'it's a compromise.' Determine it in minimal time," the answer is to **open a Detective investigation on that principal and check the indicators**. In particular, if `IMPOSSIBLE_TRAVEL` or `NEW_ASO` appears for the first time on an account-wide basis, the normal-operations hypothesis collapses. Here the answer "query CloudTrail with Athena to verify" is *possible but slow* — it is treated as wrong if the question carries "quickly / minimal operational overhead." Conversely, "wait for one more GuardDuty finding" is a choice that simply hands the response time to the attacker.

### Investigation Playbook: 30 Minutes on a Suspected Stolen Credential

Knowing the tools is different from knowing the order. The standard order for a suspected credential compromise is as follows, and which service does each step is the real content of the exam.

```
0 min   Receive finding         GuardDuty → EventBridge → on-call
        ↓
2 min   First-pass judgment     Decide "attacked side / attacking side" from the finding Type, ResourceRole, Count
        ↓
5 min   Containment             Invalidate role session · isolation SG for the instance (do not terminate)
        ↓                       * Containment comes before investigation — exfiltration continues during the investigation
10 min  Scoping                 Detective: entity profile · indicators · before and after the time window
        ↓
20 min  Check lateral movement  Detective: other entities reached by the same IP and same role
        ↓                       Whether it crossed account boundaries = visible only with a single graph
25 min  Judge data impact       Sensitivity of accessed S3 buckets → compare with Macie classification results
        ↓
30 min  Eradication/recovery    Rotate credentials, block the initial intrusion path (IMDSv2, patching, SG)
        ↓
After   Prevent recurrence      Strengthen SCPs, Config rules, detection rules; document the timeline
```

What is easy to get wrong in this order is **the sequence of containment and investigation**. The sentence "first identify the root cause, then take action" sounds plausible but is wrong in both practice and on the exam. An investigation takes time, and the attacker keeps operating in the meantime. The form of the correct answer is always **"reversible containment first, investigation in parallel"** — invalidating the session and moving to an isolation SG can be undone even if misjudged, but exfiltrated data cannot be undone. Conversely, taking *irreversible* actions (terminating the instance, deleting volumes) before the investigation is also wrong. The criterion is not "fast" but **"is it reversible."**

The 2021 tampering with Codecov's bash uploader shows why the investigation stage is a separate competency. The attacker planted a single line in a script executed in CI and sent the build environment's environment variables (that is, many customers' cloud credentials and tokens) outside. The hard part here was not detection but **scoping** — "since when did our CI use that script, which secrets were in environment variables during that period, and what happened afterward with those secrets" is a question that cannot be answered by a single alert. The way this question is answered on the cloud side is exactly Detective's form of work. You place the suspected leaked credentials as an entity, sweep the activity after the estimated leak time, the IPs that appeared for the first time, and the unusual APIs, and judge "was it actually used?" The lesson is clear. **What determines the scale of the response is not the fact that credentials leaked but whether they were used.** And that judgment cannot be made by turning on the tool after the incident — because the data from the time of the leak is not in the graph.

## Detective Investigations (Automated Investigation)

The latest Detective provides **automated investigation (Detective Investigations)** for IAM users/roles. When you specify particular credentials, Detective automatically analyzes suspicious behavior (privilege escalation, reconnaissance, and so on) mapped to MITRE ATT&CK tactics and generates a risk summary. Without the analyst digging through the graph one step at a time, it gives clues to quickly judge "is this role risky?"

Pinning down Detective's place in the detect-investigate-respond pipeline is the key for both the exam and practice. *Detection (GuardDuty)* handles "anomaly signals," *aggregation (Security Hub)* handles "one-screen collection," *investigation (Detective)* handles "why, how far, and how," and *response (EventBridge/Lambda/SSM)* handles "action." If you mistake Detective for "yet another detection tool," you fall into an exam trap — Detective *does not create findings; it explains them*.

## Distinctions Often Gotten Wrong

- **Detective vs GuardDuty**: GuardDuty is detection (generating findings), Detective is investigation (explaining findings, root cause). Detective does not create findings.
- **Detective vs CloudTrail Lake/Athena**: Athena/CloudTrail Lake are *manual query* analysis (SQL), Detective is visual investigation with a *pre-built graph*. Detective provides baselines and relationships automatically.
- **Detective vs Security Hub**: Security Hub *aggregates and standardizes (ASFF)* the findings of many tools, Detective does *deep investigation*. Aggregation vs depth.
- **Detective vs Inspector**: Inspector covers vulnerabilities (weaknesses), Detective covers incident investigation (behavior). Completely different axes.
- **Detective vs Security Lake**: Security Lake is a data lake that normalizes logs to OCSF and *supplies* them, whereas Detective is a managed graph that itself provides an investigation UI. If it is "hand the data to a third-party SIEM," it is Security Lake; if it is "investigate right away within AWS," it is Detective.

## Summary

There is one sentence to hold onto for Detective from the exam perspective — **"It does not create findings; it explains them."** The rest derives from this one line.

- Because it does not create, it **cannot be the answer to a detection requirement** (that is GuardDuty), and it does not block either (that is SG/WAF).
- To explain, it **needs past data**, so turning it on after an incident is too late. The characteristic "accumulates from activation onward" becomes the operating principle "keep it on at all times."
- The unit of explanation is **entities and relationships**, so to see lateral movement across account boundaries, the entire organization must be in **one behavior graph**. With a Detective turned on separately in each account, that edge does not exist in the first place.
- The basis of explanation is **deviation from baseline**, so indicators are questions, not verdicts. A single new region, new ASO, or new user agent may be a normal change, but when several overlap, and especially when *impossible travel* appears with them, the normal hypothesis collapses.

And more important than using the investigation tool well is the order. **Containment before investigation, but only reversible actions.** The attacker works for as long as the investigation takes, and rushing irreversible actions destroys evidence. Inspector on day3 handles "before it blows up," today's Detective handles "after it blows up," and Security Hub on day4 ties the two onto one screen.

### One-Line Summary Checklist

- [ ] Did you turn on Detective *before* an incident to accumulate the baseline in advance?
- [ ] Did you align the Detective delegated administrator to the same Security Tooling account as GuardDuty and Security Hub?
- [ ] Do you have a workflow that enters the investigation context from a finding via "Investigate in Detective"?
- [ ] Do you reduce alert fatigue by grouping related findings with finding groups?
- [ ] Did you position Detective accurately as an investigation tool, not a detection/blocking tool?

---

## 📝 Practice Questions

**Question 1.** GuardDuty generated a finding of anomalous API calls for an IAM role. The security analyst wants to quickly determine the root cause and scope of impact: "since when has this credential been active in a new location, and which resources did it access?" What is the most appropriate tool?

A) Amazon Inspector  
B) Amazon Detective  
C) AWS Config  
D) Amazon Macie  

**Answer: B**  
Explanation: Visualizing a finding's root cause and scope of impact as a behavior graph to trace "first occurrence time, new Region/IP, and related entities" is exactly what Detective is for. Inspector is vulnerability scanning, Config is resource configuration history, and Macie is S3 sensitive data classification, all of which serve purposes different from behavior-based incident investigation.

---

**Question 2.** A team enabled Amazon Detective for the first time after suspecting a breach, but the rich behavior data from before the incident is not visible in the graph. Which reason is correct?

A) Detective was misconfigured  
B) Detective accumulates data only from activation onward, so it needs time to form a baseline, and the best practice is to turn it on before an incident  
C) Detective analyzes only VPC Flow Logs  
D) A delegated administrator was not designated  

**Answer: B**  
Explanation: Detective collects and links data from the moment of activation, and it usually takes two weeks or more to build a meaningful baseline. Therefore, turning it on after an incident leaves past context lacking, and the correct approach is to keep it on at all times before an incident. The cause is not a configuration error, a source limitation, or a missing delegated administrator, but the data accumulation characteristic.

---

**Question 3.** Which statement about the role of Amazon Detective is correct?

A) It generates new threat findings on its own and blocks malicious traffic  
B) It connects existing findings and logs into a behavior graph to assist investigation and root cause analysis, but does not generate findings or block  
C) It automatically classifies PII in S3 buckets  
D) It scans EC2 and ECR for CVEs  

**Answer: B**  
Explanation: Detective is an investigation-only tool that bundles findings and logs created by GuardDuty into a graph to analyze "why, how far, and how." Finding generation is GuardDuty's role, blocking is WAF/SG, PII classification is Macie, and CVE scanning is Inspector. Mistaking Detective for a detection/blocking tool is a typical pitfall.

---

**Question 4.** SOC analysts suffer alert fatigue from a flood of GuardDuty findings. Which Detective feature groups related findings and entities into a single investigation unit to improve the signal-to-noise ratio?

A) Trusted IP list  
B) Finding groups  
C) Malware Protection  
D) Macie classification  

**Answer: B**  
Explanation: Detective's finding groups automatically group many findings that share common entities such as the same credential or IP into one investigation unit, reducing alert fatigue. The Trusted IP list is a GuardDuty finding suppression setting, Malware Protection is malware scanning, and Macie is data classification, so none relates to grouping findings.

---

**Question 5.** You want to trace, in a single pane across account boundaries, lateral movement in which an IAM role stolen in one account accessed resources in another account. What is the most appropriate Detective configuration?

A) Turn on Detective individually in each account and investigate separately  
B) Integrate all account data into a single behavior graph with an Organizations delegated administrator (Security Tooling account)  
C) Instead of Detective, manually query CloudTrail with Athena in each account  
D) GuardDuty alone is sufficient, so Detective is unnecessary  

**Answer: B**  
Explanation: Tracing lateral movement across account boundaries is possible only by integrating all member account data into one behavior graph, which is achieved with the Organizations delegated administrator model (aligned to the same account as GuardDuty and Security Hub). Per-account investigation or manual Athena queries lack a unified view and are inefficient, and GuardDuty alone is insufficient for deep investigation and correlation.

---

