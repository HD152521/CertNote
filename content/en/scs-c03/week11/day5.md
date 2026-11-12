# Day 5 - Week 11 Comprehensive Review: Integrated Governance Scenarios

This week widened our view from *single-account security* to *organization-scale governance*. We defined the permission ceiling with SCPs (Day 1), automatically laid a safe baseline with Control Tower (Day 2), proved compliance with Audit Manager (Day 3), and turned day-to-day operations into a closed loop with Firewall Manager, tags, cost, and automation (Day 4). On the last day, we review how these pieces mesh into *a single governance system* through integrated scenarios.

Domain 6 (Security Foundations and Governance) is about 14% of the exam, but its felt weight is far larger. That is because a considerable share of the questions in the other five domains end in the form **"how do you enforce, verify, and maintain this control across the entire organization?"** Governance is therefore less a separate topic than *the last sentence of every other answer*.

## The Four-Layer Governance Mental Model

Organizational security governance works as four overlapping planes. Exam questions almost always test "which plane's tool is the answer."

```
① Permission boundary plane (the ceiling of what can be done)
     SCP / RCP — a maximum boundary, not a grant of permissions
② Baseline plane (so accounts are born safe)
     Control Tower — landing zone, controls (preventive/detective/proactive), account factory
③ Proof plane (show with evidence that you are compliant)
     Audit Manager ← Config / CloudTrail / Security Hub (evidence sources)
④ Operations plane (day-to-day enforcement, remediation, response)
     Firewall Manager / tag and cost governance / EventBridge automated remediation
```

On top of this, the **central security account model** (management account = billing and organization, Audit = detection, evidence, and response, Log Archive = immutable logs) is laid as the common foundation. Every security service is operated from the Audit account as the *delegated administrator*. Drawn as accounts and OUs, it looks like this.

```
                         Root
                          │
            ┌─────────────┼──────────────┬───────────────┐
            ▼             ▼              ▼               ▼
      OU: Security   OU: Infrastructure  OU: Workloads   OU: Sandbox
      ├ Audit account ├ Network account  ├ OU: Prod       └ Experiment accounts
      │  · GuardDuty  └ Shared Services  │   ├ Account A    (strong SCP,
      │  · SecurityHub                   │   └ Account B     cost cap)
      │  · Config aggregation            └ OU: NonProd
      │  · Audit Manager                     └ Account C
      │  · Firewall Manager
      └ Log Archive account
         · S3 target of the org CloudTrail (Object Lock)
         · Config snapshots / VPC Flow Logs

   [ Management account ] — sits outside the OU tree and SCPs do not apply to it
        · Organizations / billing / only "designates" delegated administrators
        · Never place workloads here  ← Rule #1 of governance

Policy flow:  SCP/RCP  ── attached to Root/OU and inherited downward
              Control Tower controls ── applied per OU
              FMS policy ── deployed to the OUs in IncludeMap
              Evidence and logs ── collected one-way from every account → Audit / Log Archive
```

> 💡 **Related theory**: These four layers follow the time axis of security controls — *prevention up front (SCP/preventive controls)* → *safe defaults (baseline)* → *continuous detection/evaluation (Config, proof)* → *response/remediation (operations plane)*. It maps the Identify, Protect, Detect, and Respond functions of the NIST CSF to organization scale. This is *defense in depth*: even if one layer is breached, the next layer holds. Here, the order of the layers is also the *order of cost* — if you block at prevention, the cost is close to zero; once it passes to the detection stage, investigation and response costs are added; and if it is found at the proof stage, regulatory and contractual costs are added. That is why governance design takes "finish it in the leftmost layer if possible" as a principle.

## Policy Evaluation Order: The Referee Rules of Governance

Governance questions on the Specialty exam ultimately reduce to "when several policies overlap, does this request pass?" If you memorize the decision rules firmly, your answer will not waver even when the question type changes.

```
[ Until a single request reaches ALLOW ]

Request = (Principal, Action, Resource, Condition Context)
   │
   ├─① Explicit Deny ── a single Deny in any policy type ▶ DENY (ends immediately)
   ├─② SCP ───────── if the principal account's effective SCP does not allow ▶ DENY
   ├─③ RCP ───────── if the resource-side organization ceiling does not allow ▶ DENY
   ├─④ Resource policy ── same account + an Allow that names the principal directly can pass (exception path)
   ├─⑤ Permissions boundary ──── if the boundary does not allow ▶ DENY
   ├─⑥ Session policy ──── if it does not allow ▶ DENY
   └─⑦ Identity policy ── no Allow means ▶ implicit DENY
                              ▼
                            ALLOW

Effective permission = (SCP ∩ RCP ∩ permissions boundary ∩ session policy) ∩ (IAM Allow ∪ resource policy Allow) − (all Denies)
```

| Policy type | Attached to | Grants permissions | Limits permissions | Applies to management account | Place in governance |
|---|---|---|---|---|---|
| **SCP** | Root / OU / account | ✗ | ○ (principal ceiling) | **✗** | Region lock, protecting security services, blocking root |
| **RCP** | Root / OU / account | ✗ | ○ (resource access ceiling) | ✗ | Blocking data exposure outside the organization |
| **Identity IAM** | Users, groups, roles | ○ | ○ | ○ | The main body of actual permission grants |
| **Resource policy** | S3, KMS, SQS, Lambda, etc. | ○ (cross-account) | ○ | ○ | Cross-account sharing, allowing service principals |
| **Permissions boundary** | IAM users and roles | ✗ | ○ (ceiling for an individual principal) | ○ | Safely delegating IAM permissions to delegated administrators |
| **Session policy** | AssumeRole sessions | ✗ | ○ (temporary ceiling) | ○ | Narrowing federation and temporary credentials |

Running this table through actual decisions is the heart of the review. The three cases below are the archetypes from which the exam builds its variations.

**Case A - SCP Deny vs IAM AdministratorAccess.** An account administrator holds `AdministratorAccess` and tries to launch EC2 in `eu-west-1`. A Region-lock SCP (Deny when `aws:RequestedRegion` does not match) is attached to a parent OU. → **DENY.** It ends at ①. The strength of the IAM Allow means nothing. This is the archetype of the wrong answer "it passes because they are an administrator."

**Case B - Cross-account S3 access.** A role in Account A reads a bucket in Account B. A's IAM policy has an `s3:GetObject` Allow, and B's bucket policy also Allows A's role. But an RCP is attached to the OU B belongs to, blocking principals outside the organization. If A and B are in the same organization? → **ALLOW.** The RCP blocks principals *outside the organization*, so access within the same organization passes. Conversely, if A were an account outside the organization, it would be blocked at the RCP even with Allows on both sides. **Cross-account access needs an Allow on both sides, and the organization boundary is judged separately by the RCP.**

**Case C - Dividing labor between permissions boundaries and SCPs.** You want to give a developer permission to create IAM roles, but prevent the roles they create from having administrator permissions. → **Permissions boundary.** An SCP cannot pick and attach to individual IAM principals, so it cannot be used for "the ceiling of one specific principal." Conversely, "no one in this entire account may use anything outside us-east-1" cannot be done with a permissions boundary (it would have to be attached to every principal one by one, and new principals would be missed). **If the scope is an account or OU, use an SCP; if it is a single principal, use a permissions boundary** — this one line is the decision criterion.

> ⚠️ **Pitfall**: **SCPs do not apply to principals in the management account.** That is why the recommendation "do not put workloads in the management account" is not a matter of taste but a *structural necessity*. A workload running in the management account bypasses the Region lock, tag enforcement, and the block on disabling security services, all of them. In the same vein, **calls that a service-linked role (SLR) makes with AWS service credentials are also exempt from SCP evaluation.** When the exam presents a situation where "I attached an SCP but only a certain path keeps passing," suspect these two exceptions first. Also, as of launch RCPs support *only some services* such as S3, STS, KMS, SQS, and Secrets Manager, so a statement like "RCP enforces the organization boundary for all services" is a wrong choice.

## Tool Selection Decision Tree (Preventing Confusion)

This organizes the matches that are easy to confuse on the exam.

| Requirement keyword | Correct tool |
|---|---|
| "*Maximum boundary* of permissions," "*block* Region/root/service" | **SCP** |
| "Block external access to organization *resources* (ceiling)" | **RCP** |
| "Lay a multi-account *baseline quickly* and operate consistently" | **Control Tower** |
| "Block non-compliance *before* a resource is created (IaC gate)" | **Proactive controls (CFN Hooks)** |
| "*Evaluate* whether resources already created follow the rules" | **Config (detective controls)** |
| "*Deploy at once* a CIS/PCI rule set across multiple accounts" | **Conformance Pack** |
| "*Automatic evidence collection and reports* for submission to auditors" | **Audit Manager** |
| "Dashboard that *aggregates and scores* security *findings*" | **Security Hub** |
| "*Consistently deploy and automatically protect* WAF/SG/NFW across multiple accounts" | **Firewall Manager** |
| "*Activity log* of who did what and when" | **CloudTrail** |
| "Resource *configuration history* (what changed when)" | **Config configuration item timeline** |
| "*Standardize and report* tag key/value *spelling*" | **Tag Policy** |
| "*Block creation* without required tags" | **SCP (`aws:RequestTag` + Null)** |
| "Sudden *spend* spike (compromise signal)" | **Cost Anomaly Detection / Budgets** |
| "*Automatically enable* security services in new accounts" | **Delegated administrator auto-enable** |

It is enough to carve out separately the three pairs where mistakes cluster in this table.

- **Conformance Pack vs Audit Manager**: Both carry the names CIS and PCI. The one that *lays rules to create a compliant state* is Conformance Pack; the one that *packages an already-created compliant state as evidence* is Audit Manager.
- **Tag Policy vs SCP**: Tag Policy checks *whether the standard is followed when a tag is attached*. It cannot block *creating something without tags*. If blocking is needed, it is always SCP.
- **Config vs CloudTrail**: "Is the current state correct?" is Config; "what happened in the meantime?" is CloudTrail. Auditors usually demand both.

## Governance Question Map by Exam Domain

Governance is not found only in Domain 6. The moment a question in another domain adds the requirement to "scale this to the organization," this week's tools slot into the answer position.

| Domain | Form the question takes | Correct tool on the governance side |
|---|---|---|
| Domain 1 - Detection (~16%) | "So that member account administrators cannot turn off or delete logs" | Organization CloudTrail + SCP Deny + Log Archive Object Lock |
| Domain 2 - Incident Response (~14%) | "See findings from all accounts in one place and respond automatically" | Security Hub delegated administrator + EventBridge → Lambda/SSM |
| Domain 3 - Infrastructure Security (~18%) | "Consistently protect the ALBs, SGs, and DNS of hundreds of accounts, new ones automatically" | **Firewall Manager** |
| Domain 4 - IAM (~20%) | "Enforce the permission ceiling across the whole organization" / "so delegates cannot exceed their own permissions" | SCP / permissions boundary |
| Domain 5 - Data Protection (~18%) | "So snapshot and S3 data cannot leave the organization" | SCP and RCP + `aws:PrincipalOrgID` |
| Domain 6 - Security Foundations and Governance (~14%) | "Baseline automation / audit evidence / proof of compliance" | Control Tower, Config, Audit Manager |

There is one reading tip. When expressions such as **"all accounts," "the entire organization," "created in the future," or "new accounts"** appear in a question, account-level tools (attaching WAF directly, individual Config rules, manual per-account activation) are mostly wrong answers. These expressions are themselves the signal to "use an organization tool."

## Integrated Scenario 1: Building a Regulated Multi-Account Environment

Requirements: a new fintech starts with 30 accounts, uses only ap-northeast-2, prepares for a PCI audit, applies WAF consistently across all accounts, and automatically enables security tools.

Design:
1. Set up the landing zone with **Control Tower** → Audit and Log Archive accounts, with the organization CloudTrail/Config automatic.
2. **SCP**: Region lock (with exceptions for global services + us-east-1), root blocking, prevention of disabling security services.
3. **Account factory (AFT)**: Issue accounts with standard OU placement, tags, and a network baseline.
4. **Delegated administrator (Audit account)**: Operates GuardDuty, Security Hub, Config, Audit Manager, and Firewall Manager.
5. **Firewall Manager**: Automatically deploy common WAF managed rules to the ALBs/API GWs of all accounts.
6. **Audit Manager**: Assess the PCI-DSS framework → automatically collect evidence from Config/CloudTrail/Security Hub, supplement with manual evidence.
7. **EventBridge+Lambda/SSM**: An automated remediation loop for findings.

One more PCI-specific judgment is added here. **Separate the accounts that handle card data into a dedicated OU** to narrow the audit scope. The cheapest control in a PCI audit is always "reducing the scope," and this separation simultaneously narrows the Audit Manager assessment scope, the SCP strength, and the network boundary.

```bash
# ① Attach the Region-lock SCP to Root to establish the ceiling for the whole organization
aws organizations create-policy --name "RegionLock-Seoul" --type SERVICE_CONTROL_POLICY \
  --content file://region-lock.json
aws organizations attach-policy --policy-id p-regionlock --target-id r-exam

# ② Delegate security services to the Audit account (register separately for each service)
aws organizations register-delegated-administrator \
  --account-id 222233334444 --service-principal guardduty.amazonaws.com
aws organizations register-delegated-administrator \
  --account-id 222233334444 --service-principal securityhub.amazonaws.com
aws organizations register-delegated-administrator \
  --account-id 222233334444 --service-principal auditmanager.amazonaws.com
aws fms associate-admin-account --admin-account 222233334444

# ③ Turn on auto-enrollment of new accounts (if even one is missed, only that service silently stays off)
aws guardduty update-organization-configuration \
  --detector-id <id> --auto-enable-organization-members ALL
aws securityhub update-organization-configuration --auto-enable --auto-enable-standards DEFAULT

# ④ Attach the hardening policy additionally only to the PCI scope OU
aws organizations attach-policy --policy-id p-pci-hardening --target-id ou-xxxx-pci
```

```json
// Hardening SCP for the PCI scope OU — enforce encryption + block sharing outside the organization + protect audit logs
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnencryptedEbsVolumeCreation",
      "Effect": "Deny",
      "Action": "ec2:CreateVolume",
      "Resource": "*",
      "Condition": { "Bool": { "ec2:Encrypted": "false" } }
    },
    {
      "Sid": "DenySnapshotSharingOutsideOrg",
      "Effect": "Deny",
      "Action": ["ec2:ModifySnapshotAttribute", "ec2:ModifyImageAttribute"],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": { "aws:PrincipalOrgID": "o-exampleorgid" }
      }
    },
    {
      "Sid": "ProtectDetectionServices",
      "Effect": "Deny",
      "Action": [
        "cloudtrail:StopLogging", "cloudtrail:DeleteTrail",
        "guardduty:DeleteDetector", "guardduty:DisassociateFromMasterAccount",
        "config:StopConfigurationRecorder", "config:DeleteConfigurationRecorder",
        "securityhub:DisableSecurityHub"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalARN": "arn:aws:iam::*:role/OrgSecurityBreakGlassRole"
        }
      }
    }
  ]
}
```

The three Statements each represent a topic from Days 1 to 4 — preventive encryption enforcement, blocking data at the organization boundary, and defense against detection evasion. Without the `ArnNotLike` exception in the last Statement, even the security team itself could not perform maintenance, so the standard is to **always leave exactly one exception role, but monitor the use of that role with CloudTrail**.

## Integrated Scenario 2: Preventing Turning Off Detection to Do Bad Things

Requirements: Prevent account administrators from turning off CloudTrail, GuardDuty, and Config or deleting logs.

Design:
- **SCP**: Deny `cloudtrail:StopLogging/DeleteTrail`, `guardduty:DeleteDetector`, `config:StopConfigurationRecorder`, `securityhub:DisableSecurityHub`, and so on, with an exception only for the security maintenance role through `Condition`.
- **Organization CloudTrail**: Enabled from the management account → member account administrators are read-only and can neither turn it off nor see it.
- **Log Archive**: Make logs immutable with S3 Object Lock + MFA Delete + a dedicated KMS key.
- **Control Tower mandatory controls**: Enforce log integrity and the prohibition on disabling Config in a way that cannot be released.

This combination blocks "defense evasion" attacks in multiple layers. Matching what attempt each layer stops from the attacker's viewpoint makes it clear why all four are needed.

| Attacker's attempt | Layer that stops it | If it were not stopped |
|---|---|---|
| Stop CloudTrail logging | SCP Deny | All subsequent activity goes unrecorded |
| Delete the trail from a member account | **Organization CloudTrail** (members are not the owner) | Account-level evidence disappears |
| Delete or overwrite log objects in S3 | Object Lock + MFA Delete | Even already accumulated evidence disappears retroactively |
| Delete the log KMS key or change its policy | Dedicated KMS + key policy + SCP | Logs remain but cannot be decrypted |
| Stop the Config recorder | SCP + Control Tower mandatory controls | Configuration history is severed → gap in audit evidence |
| Detach the SCP itself | Management account privilege separation + CloudTrail monitoring | The ceiling itself disappears |

The last row is the weak point of this design. **What can protect an SCP is not an SCP but access control on the management account.** Hardware MFA on the management account root, minimizing IAM principals in the management account, and real-time alerts on calls to `organizations:DetachPolicy` and `organizations:DeletePolicy` — without these three, however thick the layers below are, they get stripped away wholesale from above.

In June 2014, **Code Spaces**, a UK code-hosting and project-management company, saw the incident begin when an attacker gained access to its AWS console control panel and demanded money together with a DDoS. When the company tried to regain control of its account, the attacker used a backup account created in advance to **delete most of the EBS snapshots, S3 buckets, AMIs, and instances**. Because the data and the backups were inside the same control plane, a single account takeover meant the destruction of the whole company, and the company shut down its service within days. The reason this incident is cited almost as the starting point of multi-account governance textbooks is clear — **"backups and logs must live where the party that created them cannot delete them."** Today's answers are precisely the separation of the Log Archive account, Object Lock, cross-account backups, and a structure that blocks the delete actions themselves with an SCP. If you place a control as *a different permission within the same account*, it is breached together the moment the account is breached; only when you place it as *a different permission in a different account* does a boundary finally exist.

## Integrated Scenario 3: A Cost Spike Is a Compromise Signal

Requirements: Defend against a mining attack that mass-creates GPU instances with stolen keys.

Design:
- **SCP**: Block creation of large GPU instance types and non-approved Regions (blast radius).
- **Cost Anomaly Detection / Budgets**: Alert immediately on a spend spike.
- **GuardDuty**: Detect mining-related finding types.
- **EventBridge automated response**: Disable the suspicious key + isolate instances + notify.

This is an example of *defense in depth* in which cost, detection, and permission boundaries work crosswise against a single threat. Laid out on the time axis, you can see at which moment each control earns its keep.

```
t0  Key stolen            → (cannot be prevented, already happened)
t0+  Attempt to create in a non-approved Region → SCP Deny                 ★ zero damage
t1   Attempt a large instance in an approved Region → instance type SCP Deny  ★ zero damage
t2   Create many with an allowed type → GuardDuty mining finding type   ▲ detection
t3   Spend spike           → Cost Anomaly Detection alert  ▲ detection (backup signal)
t4   Automated response    → disable key + swap to isolation SG    ● containment
t5   Afterward             → determine scope with CloudTrail · long-term keys → Identity Center
```

The lesson of this picture is that **the further left prevention (SCP) sits, the cheaper it is**. Detection at t2 and t3 comes after cost and exposure have already occurred, and if you design defense with detection alone, it is always after-the-fact response.

## Integrated Scenario 4: Blocking Data Movement Outside the Organization Boundary

Requirements: Prevent stolen credentials or insiders from exfiltrating snapshot and S3 data to accounts outside the organization. Looking only at IAM Allow, this is a flow that appears to be normal API calls, so permission reduction alone does not catch it.

The design must be **bidirectional**. This is because the outgoing door and the incoming door are different.

```
        [ Our organization ]                 [ Outside ]

  Principal ──(snapshot sharing · data copy)──▶  External account
      └── Block with SCP + aws:PrincipalOrgID   (outgoing door)

  Our resource ◀──(access through a bucket policy misconfiguration)── External principal
      └── Block with RCP + aws:PrincipalOrgID   (incoming door)
```

- **Outgoing door (SCP)**: Deny `ec2:ModifySnapshotAttribute`, `ec2:ModifyImageAttribute`, `ram:CreateResourceShare`, and so on when the target is outside the organization.
- **Incoming door (RCP)**: For S3, KMS, STS, and others, Deny when `aws:PrincipalOrgID` is not our organization. Even if a bucket policy is opened wrongly in an individual account, the organization ceiling blocks it first.
- **Detection supplement**: Create the IAM Access Analyzer external access analyzer with the organization as the zone of trust, to continuously list "resources exposed outside the organization."
- **Proof**: Map this control as a control item in an Audit Manager assessment to leave it as audit evidence.

It is easy to misunderstand SCP and RCP as "doing the same thing twice," but the directions are opposite. An SCP is evaluated based on *the account the principal belongs to*, so it locks **the door through which our people go out**, while an RCP is evaluated based on *the account the resource belongs to*, so it locks **the door through which outside people come into our resources**. So if you apply only one of the two, the opposite direction is left open. This is why a considerable share of real data exfiltration incidents take the form "we minimized permissions but the resource policy was open" or "we locked the resource but an internal principal shared a snapshot." However, because RCP has limited supported services, **services that the RCP does not reach must be filled in with SCPs, resource policies, and Access Analyzer detection** — the judgment "we turned on RCP, so the organization boundary is done" is the most dangerous.

> 🎯 **Scenario**: You invited 12 AWS accounts of an acquired company into your organization and onboarded them. What do you do, in priority order, immediately after onboarding? → ① **Put them in a quarantine OU first.** If you put them straight into the existing Prod OU, your SCPs can instantly break the existing workloads in those accounts. A temporary OU that only observes, without strong Denies, is safe. ② **Establish visibility**: Enable GuardDuty, Security Hub, and Config in those accounts, aggregate them in the delegated administrator, and bring them into the organization CloudTrail scope. Attaching SCPs without knowing what is there is the most common incident. ③ **Clean up credentials**: Conduct a full inventory of long-term access keys, root users, and external account trust relationships. The most dangerous asset in an acquired account is not the resources but *the credentials that all former employees and all partners still hold*. ④ **Shrink the boundary**: Apply an `aws:PrincipalOrgID`-based RCP and a snapshot-sharing-blocking SCP to cut the path to the previous owning organization. ⑤ **Gradual enforcement**: Apply the Region-lock and tag-enforcement SCPs in stages in the order warning → exception registration → enforcement. The key order is **quarantine → observe → credentials → boundary → enforce**, and skipping observation to start with enforcement is the incident that happens most often in practice.

## Comprehensive Summary of Pitfalls

- **SCPs do not grant permissions** — effective permission is the intersection with IAM Allow minus the Denies.
- **SCPs do not apply to management account members** — no workloads in the management account.
- **Calls by service-linked roles are exempt from SCP evaluation** — the cause of "only a certain path keeps passing."
- **An explicit Deny is final wherever it is** — neither FullAWSAccess nor AdministratorAccess beats it.
- **Cross-account access needs an Allow on both sides** — a resource policy sole Allow holds only within the same account.
- **If the scope is an account or OU, use SCP; if it is a single principal, use a permissions boundary** — choices that make you swap the two are easily used as wrong answers.
- **RCP has limited supported services** — "it enforces the organization boundary for all services" is a wrong statement.
- If the **Region-lock SCP** omits the exceptions for global services + us-east-1, the console, CloudFront, and ACM break.
- **Controls are applied to OUs** — applying them to individual accounts misses new accounts.
- **Prevention = SCP, detection = Config, proactive = CFN Hooks** — the point of blocking differs.
- **Manually changing Control Tower-managed resources = drift** — reapplication is needed.
- **Conformance Pack deploys rules, Audit Manager packages evidence** — even with the same names (CIS/PCI), the roles differ.
- **Audit Manager does not generate evidence** — Config/CloudTrail/Security Hub must be enabled beforehand.
- **Currently COMPLIANT is not proof over a period** — proving history requires Config configuration history + CloudTrail.
- **Logs and evidence cannot be generated retroactively** — only what you turned on before the audit request arrives becomes evidence.
- **Firewall Manager requires Config** + is operated from the delegated administrator, and if `RemediationEnabled` is off it only reports.
- **CloudFront-scope WAF and Shield Advanced policies** must be created in **us-east-1**.
- **A Tag Policy cannot block creation without tags** — blocking is the job of SCP.
- Security services are operated from the **delegated administrator (Audit account)**, and the management account is for billing and organization only.
- **auto-enable is per service** — if one is missed, only that service stays off in new accounts.
- **Put backups and logs in an account where the party that created them cannot delete them** — privilege separation within the same account is powerless against account takeover.

## Connections to Other Weeks

- The *single policies* of Week 4 (WAF, Shield, Network Firewall) are extended *organization-wide* by this week's Firewall Manager.
- Logging and detection (CloudTrail, GuardDuty, Config, Security Hub) are integrated this week into the *delegated administrator and proof plane*.
- IAM and permissions boundaries are extended into this week's *organization-scale ceiling* of SCP/RCP.
- Data protection (KMS, S3 encryption) becomes an organization-scale control through the SCP's *encryption enforcement* and the RCP's *organization boundary*.
- The per-domain wrap-up in Week 12 continues by tracing this week's four-layer model back onto the question types of each domain.

## 📌 Key Takeaways

Governance is not a single service but a system that stacks four planes — *permission boundary, baseline, proof, and operations* — on top of a central security account, isolates operations with delegated administrators, and runs a closed loop of detection → automated remediation. The exam keeps asking "which plane and which tool does this requirement belong to?"

Compressed into one sentence: **governance is not "the work of creating a good state" but "the work of making it impossible to leave a good state."** One person can configure security settings correctly in a day, but making 500 accounts keep that state three years later is possible only through structure. SCPs forbid leaving it, Control Tower keeps accounts from being born in a departed state, Config and Audit Manager discover and prove departures, and Firewall Manager and automated remediation put back what has departed. This is why, if an exam choice takes the form "people follow the procedure" or "check periodically," it is usually wrong.

We close this week with a final checklist.

- [ ] Are there no workloads in the management account, and are all security services operated from the **delegated administrator (Audit account)**?
- [ ] Can you calculate effective permission as `(SCP ∩ RCP ∩ permissions boundary) ∩ (IAM ∪ resource policy) − Deny`?
- [ ] Can you immediately decide "SCP if the scope is an account/OU, permissions boundary if it is a single principal"?
- [ ] Did the global services and the `us-east-1` exception go into the Region-lock SCP accurately?
- [ ] Do you block disabling security services and deleting logs with an SCP, and monitor the use of the exception role?
- [ ] Are logs and backups kept with Object Lock in a **separate account where the party that created them cannot delete them**?
- [ ] Did you lock the organization boundary in **both the outgoing door (SCP) and the incoming door (RCP)**?
- [ ] Did you choose tools by distinguishing Conformance Pack (rule deployment) from Audit Manager (evidence packaging)?
- [ ] Are the Firewall Manager prerequisites (Organizations, FMS administrator, Config, RAM if needed) all satisfied?
- [ ] Are GuardDuty, Security Hub, and Config turned on in new accounts through auto-enable **each separately**?
- [ ] Does automated response automate only reversible actions, with irreversible actions passing through an approval gate?
- [ ] When you see "all accounts / created in the future" in a choice, do you think of organization tools first?

## 📝 Practice Questions

**Question 1.** A new fintech wants to quickly stand up a PCI-scoped multi-account environment and automatically have a secure baseline (log account, organization CloudTrail/Config, standard OUs). What is the most appropriate starting point?

A) Manually configure Organizations, CloudTrail, and Config one by one  
B) Set up a landing zone with AWS Control Tower to automatically lay down the Audit and Log Archive accounts, organization CloudTrail/Config, and the control baseline  
C) Gather all workloads in a single account  
D) Turn on only GuardDuty  

**Answer: B**  
Explanation: The starting point for quickly and consistently laying down a standard multi-account security baseline is the Control Tower landing zone. The Audit and Log Archive accounts, organization CloudTrail/Config, and controls are configured automatically. Manual configuration is slow and carries a high risk of omissions, consolidating into a single account goes against the isolation and blast radius principles, and GuardDuty alone is only one piece of detection, not the whole baseline.

---

**Question 2.** We want to "prevent account administrators from stopping CloudTrail logging or deleting the GuardDuty detector." What is the most direct control?

A) Grant administrators more permissions with IAM policies  
B) Use an SCP to Deny cloudtrail:StopLogging, guardduty:DeleteDetector, and so on, with an exception through Condition only for the security maintenance role  
C) Raise the Security Hub score  
D) Create an Audit Manager report  

**Answer: B**  
Explanation: The direct control that prevents disabling security services and deleting logs is an explicit Deny in an SCP. Exempting only a specific security role through Condition for maintenance automation secures both operability and enforcement. Granting more permissions through IAM goes in the opposite direction, and Security Hub scores and Audit Manager reports are only detection and attestation tools that do not block actions.

---

**Question 3.** Which of the following requirement-tool matches is NOT correct?

A) "Consistently deploy WAF to ALBs across multiple accounts and automatically protect new ones" -> Firewall Manager  
B) "Automatically collect and report evidence for auditors by framework" -> Audit Manager  
C) "Continuously evaluate whether resources comply with rules" -> AWS Config  
D) "Define maximum permission boundaries and block Regions" -> Security Hub  

**Answer: D**  
Explanation: Defining maximum permission boundaries and blocking Regions is the role of SCPs (Organizations), not Security Hub. Security Hub is a tool for aggregating security findings and scoring. The other matches are accurate: organization-wide firewall deployment is Firewall Manager, evidence collection and reporting is Audit Manager, and configuration evaluation is Config. So the incorrect match is the one that attributes permission boundaries to Security Hub.

---

**Question 4.** In an organization operated with Control Tower, an operator directly modified an SCP in the console. Afterward, applying new controls is blocked. What happened and how should it be handled?

A) It is normal; leave it as is  
B) Drift occurred — re-apply the landing zone to restore the declared state, and keep the discipline of not modifying Control Tower managed resources directly in the console  
C) Permanently disable all controls  
D) Delete the organization and recreate it  

**Answer: B**  
Explanation: Directly modifying an SCP managed by Control Tower in the console causes drift, where the declared state and actual state diverge, blocking subsequent operations. The correct response is to restore the declared state by re-applying the landing zone and to establish the operating discipline of not manually touching managed resources. Leaving it, disabling everything, and recreating the organization are all excessive or dangerous.

---

**Question 5.** GPU instance costs in one account surged to tens of times the usual level. If multiple layers must work together, what is the most appropriate defense-in-depth combination?

A) Respond by adding more instances  
B) Block creation of large GPU types with an SCP (damage limit) + early detection with Cost Anomaly Detection/Budgets + mining detection with GuardDuty + automatic response with EventBridge to disable keys and isolate  
C) Ignore it since cost is unrelated to security  
D) Issue a new root key and keep using it  

**Answer: B**  
Explanation: A cost surge, especially a surge in GPU instances, can be a sign of a mining compromise with stolen credentials. Setting a damage limit with an SCP, detecting early with Cost Anomaly Detection and Budgets, detecting mining with GuardDuty, and tying in key deactivation and isolation through EventBridge automatic response is defense in depth that spans permission boundaries, cost, detection, and response. Scaling up, ignoring, and reusing the root key either raise the risk or leave the compromise unaddressed.

---
