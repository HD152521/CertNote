# Day 3 - AWS Organizations and SCPs: Designing Account-Level Guardrails

In an organization with hundreds of accounts, how do you enforce "things no account must ever do"? If you deploy IAM policies account by account, omissions appear every time a new account is added, and the root user cannot even be controlled by IAM policies. The answer to this problem is the **SCP (Service Control Policy) of AWS Organizations**.

The SCP is the top layer of the "permission ceilings" we saw in day1 and day2. It puts guardrails over an entire account, including the root user. It is central to Specialty exam domain 6 (security foundations and governance), and you need to understand OU design, SCP evaluation, and inheritance rules precisely.

To really understand SCPs, you have to flip your perspective once. An IAM policy is a document that writes "what should be made possible," but an SCP is a document that writes **"what must never happen."** The former is a tool for making individual tasks possible, and the latter is a tool for declaring the organization's invariants. Sentences like "CloudTrail is never turned off in any account" and "our data never leaves approved Regions" are what an SCP expresses. If you miss this difference, you end up using SCPs like IAM and falling into an unmanageable state.

## Organizations Structure: A Hierarchical Tree

Organizations organizes accounts into a tree.

```
Root (organization root, only one)
 │
 ├── Management account (payer)
 │
 ├── OU: Security
 │    ├── Log Archive account
 │    └── Audit account
 │
 ├── OU: Production
 │    ├── prod-app-1 account
 │    └── prod-app-2 account
 │
 └── OU: Sandbox
      └── dev-1 account
```

An SCP can be attached to the **Root, an OU, or an individual account** in this tree. And an SCP attached higher up is **inherited by all nodes below**.

> ⚠️ **Pitfall**: **SCPs do not apply to the Management Account.** Attaching an SCP to the management account in the tree has no effect. That is why the security best practice is never to put workloads in the management account and to use it only for billing and organization management. If the management account is compromised, the entire organization is at risk. It is an easy pitfall to confuse.

### Where SCPs Reach and Where They Do Not

Before designing guardrails, you must first establish **the areas the guardrails physically do not reach**. If you get this wrong, holes remain that you thought were blocked but are not.

```
[ SCP application scope map ]

  ✅ Applies
     · All IAM users and roles in member accounts
     · The **root user** of member accounts
     · All temporary sessions obtained by AssumeRole in member accounts
     · Sessions coming in through federation (including Identity Center)

  ❌ Does not apply
     · All principals of the management account (Management Account)
     · **Service-linked roles (service-linked role)**
     · Principals in accounts outside the organization
       └ The path by which an external account calls our resources is outside the SCP
     · Access that a resource-based policy opened to outside the organization
       └ Filling this blind spot is what the RCP is for
```

The third and fourth items on this map are the key. An SCP controls only **"what the principals of our accounts can do."** The opposite direction, that is, **"who can reach our resources,"** is outside the SCP's range. If a developer opens a bucket policy to an external account, the SCP cannot stop it. The thing that emerged to control this direction is the **RCP (Resource Control Policy)**, and so the two policies are not competitors but each other's reverse side.

| | SCP | RCP |
|---|-----|-----|
| Direction controlled | **The outgoing side**: the actions of our principals | **The incoming side**: access to our resources |
| What it blocks | Our staff calling a prohibited API | Principals outside the organization using our resources |
| Target of application | Principals of member accounts | Resources of member accounts |
| Representative condition keys | `aws:RequestedRegion`, `aws:PrincipalArn` | `aws:PrincipalOrgID`, `aws:PrincipalIsAWSService` |
| Supported services | Most AWS services | **Limited to some services** |
| Grants permissions | No | No |

> ⚠️ **Pitfall**: The statement "we blocked data exfiltration with an SCP" is only half right. An SCP can block *our staff copying to an external bucket* (with an `aws:ResourceOrgID` condition), but it cannot block *an external principal reading our bucket*. The latter is the domain of a bucket policy or an RCP. When the exam presents the requirement "block access by principals outside the organization across the whole organization at once," you should look at the RCP side rather than the SCP, with the caveat that the RCP has a limited list of supported services.

### Organizations Policies Are Not Only SCPs

Organizations provides several policy types, each with a different character. The exam asks directly, "which policy type fits this requirement?"

| Policy type | What it does | Character |
|-----------|---------|------|
| SCP | Ceiling on the APIs a principal can call | **Preventive (blocking)** |
| RCP | Ceiling on the principals that can access a resource | **Preventive (blocking)** |
| Tag policy | Standardizes the spelling and allowed values of tag keys | Standardization and reporting focus |
| Backup policy | Deploys an organization-level backup plan | Configuration deployment |
| AI services opt-out policy | Opts out of AI services' use of data | Configuration deployment |

What you must distinguish here is that **a tag policy is not a means of blocking**. A tag policy can *report* noncompliant tags and restrict some operations, but the enforcement "you cannot create a resource without a tag" must be built with the `aws:RequestTag` and `Null` conditions of an SCP. The `Null` operator we saw in day1 is used here.

```bash
# Turn on the SCP feature in the organization (enabling all features must come first)
aws organizations enable-policy-type \
  --root-id r-abcd \
  --policy-type SERVICE_CONTROL_POLICY

# Create an SCP
aws organizations create-policy \
  --name deny-region-and-org-exit \
  --type SERVICE_CONTROL_POLICY \
  --description "Region restriction + block leaving the organization" \
  --content file://scp-guardrail.json

# Attach it to an OU
aws organizations attach-policy \
  --policy-id p-examplepolicyid \
  --target-id ou-abcd-11111111

# List of SCPs actually attached to a specific target (the starting point of troubleshooting)
aws organizations list-policies-for-target \
  --target-id 111122223333 \
  --filter SERVICE_CONTROL_POLICY

# Conversely, reverse lookup of where this policy is attached
aws organizations list-targets-for-policy --policy-id p-examplepolicyid

# Walk up the chain of parents (OUs) the account belongs to, to check the inheritance path
aws organizations list-parents --child-id 111122223333
```

`aws organizations describe-effective-policy` **does not support SCPs.** You can see the merged result of tag policies, backup policies, and AI opt-out policies with this command, but there is no API that shows the SCP's "final effective ceiling" in one shot. So SCP debugging requires **composing it by hand**: walk up the path account -> OU -> Root with `list-parents` and call `list-policies-for-target` at each step. If a choice appears for "the command that queries the SCP effective policy," it is a trap.

## SCPs Do Not Grant Permissions: They Are Only a Filter

As repeated in day1 and day2, an SCP **does not grant permissions.** It determines only the **maximum available permissions** for the account. To actually receive permissions, an IAM policy inside the account must still Allow them.

```
Effective permissions of a principal in the account = range allowed by the SCP ∩ range allowed by the IAM policy
```

Even if the SCP allows `s3:*`, without an IAM policy nothing can be done. Conversely, even if IAM grants `ec2:*`, if the SCP does not allow ec2 it cannot be used.

## Two SCP Strategies: Allow List vs. Deny List

There are two ways to design SCPs.

### 1) Deny List Strategy (Most Common)

Leave the default policy `FullAWSAccess` (allow everything) as is, and **explicitly Deny only the actions to be prohibited**.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyLeaveOrg",
      "Effect": "Deny",
      "Action": ["organizations:LeaveOrganization"],
      "Resource": "*"
    },
    {
      "Sid": "RestrictRegions",
      "Effect": "Deny",
      "NotAction": ["iam:*", "sts:*", "cloudfront:*", "route53:*", "support:*"],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
        }
      }
    }
  ]
}
```

This policy (1) blocks an account from leaving the organization, and (2) blocks operations in Regions other than `ap-northeast-2` and `us-east-1`. However, global services (IAM, STS, CloudFront, and so on) are handled as exceptions with `NotAction`. Global services are not tied to a specific Regional endpoint, so they must be excluded from the Region restriction.

When using a Region restriction SCP, if you do not make exceptions with `NotAction` for global services such as IAM, STS, CloudFront, Route 53, Support, and Organizations, console login and STS token issuance can be blocked, making **the entire account unusable**. Global service APIs are internally routed to `us-east-1` or operate regardless of Region. Cases that omit this exception are common in both practice and the exam.

### 2) Allow List Strategy

Remove `FullAWSAccess` and **specify only the actions to allow**. It is stricter but harder to manage, because you must modify the SCP every time you use a new service.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:*", "ec2:*", "lambda:*", "logs:*"],
    "Resource": "*"
  }]
}
```

The Deny List corresponds to a blacklist and the Allow List to a whitelist. By security principle, the whitelist (Allow List) is safer, but it conflicts with operational agility. In practice AWS recommends a **Deny List + core prohibitions** (Region restriction, blocking root usage, blocking the disabling of security services, and so on). It is a layered strategy: pin down only the guardrails that must never break with a strong Deny, and control the rest finely with IAM and Permission Boundaries.

## SCP Evaluation Rules: Inheritance and Intersection

When SCPs are attached at multiple levels, evaluation works as follows.

```
For an action to be allowed, that action must be allowed at
every level on the path Root → OU → account (AND/intersection).

However, if any one level explicitly Denies → blocked.
```

That is, SCP inheritance **narrows cumulatively (subtraction after subtraction)**. If the parent OU allows only `s3:*`, then even if the lower OU additionally allows `ec2:*`, it is useless, because the parent has already removed ec2.

```
Root SCP:    FullAWSAccess (allow everything)
  └ Prod OU SCP:  Deny ec2:*   (EC2 prohibited)
      └ app-1 account SCP: tries Allow ec2:RunInstances
        → Result: blocked. The parent OU's Deny wins.
```

If you answer "yes" to the question "can an SCP at a lower account reopen permissions?", you are wrong. Through inheritance, an SCP **only gets more restrictive.** What was blocked above cannot be released below. Only IAM policies "grant" permissions, and the SCP merely lowers the ceiling of what that IAM can exercise.

The point that confuses people when computing inheritance is that **the allow list strategy and the deny list strategy behave differently under inheritance**. Summarized in a diagram, it looks like this.

```
[ SCP inheritance calculation: difference between the two strategies ]

── Deny list strategy (FullAWSAccess kept) ─────────────────
   Root      : FullAWSAccess + Deny(organizations:LeaveOrganization)
   Prod OU   : FullAWSAccess + Deny(unapproved Regions)
   Account   : FullAWSAccess + Deny(ec2:TerminateInstances)
                        │
                        ▼
   Effective ceiling = everything allowed − (leaving org ∪ unapproved Regions ∪ terminating instances)
   → The prohibition lists are **combined (union)**. The more levels, the more is blocked.

── Allow list strategy (FullAWSAccess removed) ────────────────
   Root      : Allow(s3:*, ec2:*, lambda:*, iam:*, sts:*)
   Prod OU   : Allow(s3:*, lambda:*)
   Account   : Allow(s3:*, lambda:*, dynamodb:*)
                        │
                        ▼
   Effective ceiling = s3:* ∩ lambda:*  (dynamodb is dropped because it is not above)
   → The allow lists are **whittled down (intersection)**. Adding at a lower level is useless.

  Note: if the two strategies are mixed: at each level only the actions that are
    "allowed and not Denied anywhere" remain. In the end there is a single
    decision rule: "allowed at every level on the path + no Deny at any level."
```

This is the real reason the allow list strategy is hard to manage. To use a new service in a lower OU, **fixing only that account is not enough; you must go all the way up to the Root and modify every level.** The cost grows exponentially as the organization grows, so in practice the deny list is almost always chosen.

The moment you remove `FullAWSAccess`, a situation that is hard to reverse can be created. If you remove `FullAWSAccess` from a higher OU and leave only a narrow Allow list, from that moment every API outside the list dies in all accounts below. This can even include **the APIs that manage the organization itself**, so there are cases where even the work to undo the situation is blocked. So when switching to an allow list, you must (1) apply it first to the lowest test OU, (2) leave recovery paths such as `organizations:*`, `iam:*`, and `sts:*` in the list, and (3) confirm that it can be reverted from the management account before moving it up. SCP incidents usually come not from attacks but from deployments that skipped this order.

> 🎯 **Scenario**: "A `Deny ec2:*` SCP is attached to the Prod OU, yet Auto Scaling keeps launching and terminating instances. Is the SCP not working?" -> SCPs **do not apply to service-linked roles.** The EC2 operations Auto Scaling performs with its own service-linked role are outside the SCP. What you should judge here is not "the SCP is broken" but the property that "an SCP is a tool that controls *people and workload roles*, and the path by which an AWS service performs its own function is not its target." To control even that path, you must restrict the configuration of the Auto Scaling group itself (for example, restricting launch templates and instance types), or block the use of the service itself.

## OU Design Patterns: Separation by Function

The standard OU structure of a mature organization (recommended by AWS Landing Zone / Control Tower) is as follows.

| OU | Purpose | Representative SCP |
|----|------|----------|
| Security | Isolate log and audit accounts | Block disabling CloudTrail |
| Infrastructure | Shared network and DNS | Restrict network changes |
| Workloads/Prod | Production workloads | Region restriction, block root |
| Workloads/SDLC | Development and staging | Cost ceiling, instance type restriction |
| Sandbox | Experiment accounts | Budget guardrails, separate billing |
| Suspended | Accounts slated for decommission | Deny almost everything |

The core design principle is **"blast radius isolation."** If you put prod and dev in different OUs, the looser SCPs applied to dev accounts do not leak into prod.

AWS Control Tower is a managed landing zone that automatically sets up this OU structure along with SCPs, CloudTrail, and Config. Control Tower's "guardrails" are implemented internally as a combination of SCPs (preventive controls) and AWS Config Rules (detective controls). Preventive guardrail = SCP (blocking), detective guardrail = Config (violation detection and notification). Exam questions distinguishing "preventive vs. detective" appear.

## Essential Guardrails to Block with SCPs

These are the SCPs that are almost always applied in practice.

1. **Block leaving the organization**: Deny `organizations:LeaveOrganization`
2. **Block disabling CloudTrail**: Deny `cloudtrail:StopLogging`, `cloudtrail:DeleteTrail`
3. **Block disabling security services**: Deny disabling GuardDuty, Config, and Security Hub
4. **Restrict use of the root user**: Deny when `aws:PrincipalArn` in the `Condition` is root
5. **Region restriction**: Respond to data sovereignty regulations
6. **Block creation of IAM users**: To force Identity Center, Deny `iam:CreateUser`

These guardrails belong to **preventive controls** in the classification of security controls. In NIST's control classification (preventive/detective/corrective), preventive controls are the most cost-effective because they block before an incident occurs. The SCP is the most powerful preventive control in AWS and implements the principle "what can be blocked is better blocked than detected."

### The Guardrail SCP in Full

Putting the six items above into an actual policy document gives the following. Read it together with exactly which bypass each statement targets.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenySecurityServiceTampering",
      "Effect": "Deny",
      "Action": [
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail",
        "cloudtrail:UpdateTrail",
        "config:DeleteConfigurationRecorder",
        "config:StopConfigurationRecorder",
        "config:DeleteDeliveryChannel",
        "guardduty:DeleteDetector",
        "guardduty:UpdateDetector",
        "securityhub:DisableSecurityHub",
        "ec2:DeleteFlowLogs"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalARN": "arn:aws:iam::*:role/OrgSecurityAdmin"
        }
      }
    },
    {
      "Sid": "DenyRootUserActions",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringLike": { "aws:PrincipalArn": "arn:aws:iam::*:root" }
      }
    },
    {
      "Sid": "DenyPublicAccessBlockRemoval",
      "Effect": "Deny",
      "Action": [
        "s3:PutBucketPublicAccessBlock",
        "s3:DeleteAccountPublicAccessBlock"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalARN": "arn:aws:iam::*:role/OrgSecurityAdmin"
        }
      }
    },
    {
      "Sid": "RequireIMDSv2OnLaunch",
      "Effect": "Deny",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringNotEquals": { "ec2:MetadataHttpTokens": "required" }
      }
    },
    {
      "Sid": "DenyResourceCreationWithoutOwnerTag",
      "Effect": "Deny",
      "Action": ["ec2:RunInstances", "rds:CreateDBInstance", "s3:CreateBucket"],
      "Resource": "*",
      "Condition": {
        "Null": { "aws:RequestTag/Owner": "true" }
      }
    },
    {
      "Sid": "DenyLeavingOrganization",
      "Effect": "Deny",
      "Action": [
        "organizations:LeaveOrganization",
        "account:CloseAccount"
      ],
      "Resource": "*"
    }
  ]
}
```

| Sid | Bypass targeted | If omitted |
|-----|---------------|-------------|
| `DenySecurityServiceTampering` | An intruder turning off logging and detection to erase traces | The evidence needed for incident investigation disappears |
| `DenyRootUserActions` | Arbitrary actions by the root user, who is outside MFA and auditing | Each account's root credentials remain a control blind spot |
| `DenyPublicAccessBlockRemoval` | Releasing the public access block setting to expose a bucket | One setting change opens every bucket to the internet |
| `RequireIMDSv2OnLaunch` | Launching instances with IMDSv1 and leaving an SSRF surface | The metadata theft path keeps being reproduced |
| `DenyResourceCreationWithoutOwnerTag` | Mass-producing resources with no owner | Attributing cost and accountability becomes impossible |
| `DenyLeavingOrganization` | An account leaving the organization to shed the guardrails | All controls are nullified by a single API call |

`RequireIMDSv2OnLaunch` deserves special attention because it targets the Capital One-type attack from day1 head-on. IMDSv2 requires obtaining a token with a PUT request before reading instance metadata, so it becomes hard for a simple SSRF (an attack that makes the server send a GET request on the attacker's behalf) to reach the credentials. The real power of the SCP is that it **seals off an architecture-level vulnerable pattern across the whole organization at once**.

A statement that blocks root wholesale with `"Action": "*"`, like `DenyRootUserActions`, is powerful, but you must also consider that **tasks only root can do** exist. Account recovery, some support procedures, and changes to certain account settings need root. So in practice, you either give this statement minimal exceptions with `NotAction`, or document a procedure for temporarily detaching the SCP from the management account when an exception is needed. When applying a control, the principle is to **design the procedure for releasing the control at the same time**.

The pattern of making an exception for a specific administrative role with `ArnNotLike` (`aws:PrincipalARN`) is convenient, but it has the risk that **whoever can create a role with that name becomes someone who can create the exception**. This is because creating a role named `OrgSecurityAdmin` in any account puts it under the exception. So when using this pattern you must always apply a paired defense: Deny again, with an SCP, the actions that *create or modify* a role matching that naming rule, or specify `aws:PrincipalArn` as an exact ARN that pins down even the account number. An exception condition is complete only when it also locks the path by which that exception is obtained.

### The Order for Deploying SCPs Safely

An SCP is the only policy that can stop the entire organization if attached wrongly. So the **deployment procedure** matters as much as the contents.

```
[ The 5 stages of SCP rollout ]

(1) Draft + static validation
   · Syntax validation; for a Region restriction, confirm the global service NotAction exception
   · Confirm that the recovery paths (organizations/iam/sts) remain alive
        │
        ▼
(2) Impact analysis: predict from logs
   · Query CloudTrail and tally "calls that would have been blocked if this policy had existed"
   · Especially check paths with no human, such as batch jobs, CI/CD, and service roles
        │
        ▼
(3) Attach first to the narrowest target
   · A Sandbox OU or a single test account
   · Observe for at least several days: watch out for missing periodic jobs (monthly, quarterly)
        │
        ▼
(4) Gradual expansion
   · In the order Sandbox → SDLC → Prod
   · Monitor for a surge in AccessDenied at each stage
        │
        ▼
(5) Keep rollback ready
   · Pre-designate the detach-policy procedure and the people authorized to do it
   · Confirm that it can be done from the management account (SCPs do not apply to the management account)
```

Stage (2) makes the biggest difference in practice. **Because CloudTrail already holds everything about "who called which API in which Region,"** what a new SCP will block can be computed before deployment. Skipping this calculation and deploying is nearly the only cause of incidents that stop an organization.

### Determining "Is the SCP the Culprit"

Specializing the diagnostic procedure of day1 for SCPs gives the following.

| Signal | Interpretation |
|------|------|
| The error message contains `explicit deny in a service control policy` | SCP confirmed. Trace the path immediately with `list-policies-for-target` |
| Blocked even with `AdministratorAccess` + the Region or service is specific | A Region restriction or service prohibition SCP is likely |
| The simulator says `allowed` but the actual call fails | The simulator does not evaluate SCPs: the number one suspect |
| The same action works in account A but not in account B | The two accounts' **OU paths differ**. Compare with `list-parents` |
| Works in the management account but fails only in member accounts | SCP confirmed (because it does not apply to the management account) |

The last row is especially practical. **Making the same call in the management account settles at once whether it is an SCP**: if it succeeds in the management account and fails in a member account, it is very likely that the SCP is the culprit.

## Summary

The SCP is the backbone of multi-account governance. The key points are (1) it does not grant permissions and only sets a ceiling, (2) it does not apply to the management account, (3) inheritance only narrows cumulatively and cannot be reopened below, (4) a Region restriction must make an exception for global services, and (5) OUs are designed around blast radius isolation. If the Permission Boundary is an individual's ceiling, the SCP is an account's ceiling, and together they form layered guardrails. To these you add (6) it does not apply to service-linked roles, and (7) access coming in from outside the organization is the domain of RCPs and resource policies, not SCPs. Only with these two blind spots added is the map complete.

In 2014, Code Spaces folded its business after an intruder gained AWS console access and deleted instances, storage, snapshots, and backups. It was an incident in which not the data but **the means of restoring the data were erased entirely**. The lesson of this case for SCP design is direct. After a compromise has started, all the defender can rely on is "a ceiling that even the intruder cannot cross," and that ceiling must be *outside* the compromised account. IAM policies inside an account are neutralized the moment the intruder obtains administrator privileges, but an SCP is managed from the management account, so an intruder who has taken over a member account cannot release it. That is why the structure of keeping backup and log storage in a separate account and putting that account in an OU with deletion permissions sealed off became standard. **The only way to create "a copy even an administrator cannot delete" is the combination of an account boundary and an SCP.**

The most frequent SCP incident in real organizations is not an attack but a **deployment mistake**. Representative cases are the incident in which a Region restriction SCP was deployed without making `NotAction` exceptions for IAM and STS, so console login and token issuance died in all accounts at once, and the incident in which `FullAWSAccess` was removed and a narrow Allow list attached to a higher OU, blocking even the recovery APIs so that rollback was possible only from the management account. Both incidents came from skipping the step of querying CloudTrail first to tally "calls that would have been blocked if this policy had existed." Because the SCP is the only control applied to the entire organization at once, the deployment procedure must reflect that **the very fact that its scope of application is wide is the risk**.

### One-Line Summary

An SCP is an account-level **ceiling** and does not grant permissions. It applies to the root of member accounts but **does not apply to the management account or to service-linked roles**, and the direction in which principals outside the organization access our resources is the domain of RCPs and resource policies, not SCPs. Inheritance is an intersection in which every level on the path Root → OU → account must allow for a request to pass, and it cannot be reopened below; in the deny list strategy prohibitions accumulate as a union, and in the allow list strategy allowances are whittled down as an intersection. The essential guardrails are blocking leaving the organization, blocking the disabling of security services, restricting root use, prohibiting the release of public access blocks, enforcing IMDSv2, and prohibiting creation without tags, and a Region restriction must always come with a global service `NotAction` exception. `describe-effective-policy` does not support SCPs, so debug by composing by hand with `list-parents` + `list-policies-for-target`, and "works in the management account but fails only in member accounts" is the fastest signal that identifies an SCP. Deploy in the order CloudTrail-based impact analysis -> first apply to a narrow OU -> gradual expansion -> rollback preparation.

In the next article, we shift our gaze to the side that "grants" permissions. We cover how to safely grant access to people in a multi-account environment with IAM Identity Center and federation, and how ABAC extends tag-based access control.

---

## 📝 Practice Questions

**Question 1.** A security team wants to ensure that CloudTrail is never disabled in any account of the organization. What is the most appropriate method?

A) Deploy CloudTrail protection to each account with IAM policies  
B) Apply an SCP that Denies `cloudtrail:StopLogging` and `cloudtrail:DeleteTrail` at the Root or a higher-level OU  
C) Monitor CloudTrail status with an AWS Config Rule  
D) Apply the SCP only to the management account  

**Answer: B**  
Explanation: An SCP is a preventive control that, once applied to an OU/Root, is inherited by all accounts below. If you Deny the CloudTrail disabling actions, no account, not even root, can turn it off. IAM deployment risks missing new accounts, and Config is only after-the-fact detection and cannot block. SCPs do not apply to the management account, so D is wrong.

---

**Question 2.** A `Deny ec2:*` SCP is attached to the Prod OU. In an account under the Prod OU, an IAM administrator created an `Allow ec2:*` IAM policy, and an additional SCP that also applies `Allow ec2:RunInstances` was applied to that account. Can it launch EC2 instances?

A) Yes, because the lower SCP overrides the upper OU SCP  
B) Yes, because the IAM policy Allows it  
C) No, because the explicit Deny of the upper OU is inherited and wins  
D) It depends on the conditions  

**Answer: C**  
Explanation: SCP inheritance makes restrictions cumulatively stronger. An explicit Deny at the upper OU is inherited downward and cannot be reopened from below with an SCP or IAM. An explicit Deny beats every Allow. A lower SCP does not override the upper one, and an IAM Allow cannot break through an SCP Deny either.

---

**Question 3.** Right after applying a Region-restriction SCP, users started failing to log in to the console and to get STS tokens. What is the most likely cause?

A) The SCP was applied to the management account  
B) Global services such as IAM and STS were not exempted with a `NotAction` exception, so they were blocked as well  
C) A Region restriction inherently blocks login  
D) MFA is not enabled  

**Answer: B**  
Explanation: Global services (IAM, STS, CloudFront, Route 53, and so on) are not tied to a specific Region endpoint and are routed internally to us-east-1 and similar. If they are not exempted with `NotAction` in the Region-restriction Deny, even login and token issuance are blocked and the account becomes unusable. This is a classic mistake with Region-restriction SCPs.

---

**Question 4.** Which statement about the difference between the preventive control of an SCP and the detective control of an AWS Config Rule is correct?

A) An SCP detects violations after the fact, and Config blocks violations in advance  
B) An SCP blocks violating actions in advance, and Config detects and alerts on violating states after the fact  
C) Both work the same way  
D) Config is always stronger than an SCP  

**Answer: B**  
Explanation: An SCP is a preventive control that denies the action itself and blocks it before the event occurs. A Config Rule is a detective control that evaluates the compliance of resources already created and detects and alerts on violations. Where blocking is possible, an SCP is more cost-effective, and Config complements the areas where detection is needed.

---

**Question 5.** An organization is running production workloads in the Management Account. From a security perspective, what is the most appropriate reason this is a problem?

A) The management account costs more  
B) SCPs do not apply to the management account, so it cannot be protected by guardrails, and if it is compromised the entire organization is at risk  
C) EC2 cannot be launched in the management account  
D) The management account does not support CloudTrail  

**Answer: B**  
Explanation: SCPs apply only to member accounts and have no effect on the management account. Therefore, placing workloads in the management account means they do not get the protection of SCP guardrails, and if the account that controls the entire organization is compromised, all member accounts are exposed to risk. The best practice is to use the management account only for billing and organization management.
