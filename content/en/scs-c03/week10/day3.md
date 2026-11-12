# Day 3 - Credential Exposure Response: Access Key Exposure, Root Compromise, IAM Neutralization and Rotation Playbook

Credential leakage is the most common entry point of a cloud compromise. An access key carelessly committed to GitHub, a root password stolen by phishing, an STS token that escaped from a compromised instance: attackers don't break through vulnerabilities, they *walk in through the front door with valid credentials*. The essence of the response is *"how quickly you neutralize the exposed credential, trace what happened with it, and safely reissue."* The exam relentlessly asks that *the neutralization mechanism differs* by credential type (IAM user key / root / temporary STS / federation).

Three core principles: ① **For neutralization, deactivation or revocation takes priority over deletion** (preserving evidence and room for recovery), ② **each type has a different revocation mechanism**, ③ **after neutralization, always trace activity (CloudTrail) and rotate.**

## Neutralization Mechanisms by Type (Most Important)

| Credential type | How to neutralize | Tracing |
|---------------|-------------|------|
| IAM user access key | `update-access-key Status=Inactive` (immediate), later `delete-access-key` | CloudTrail accessKeyId |
| IAM user console password | `delete-login-profile` or password reset + enforce MFA | CloudTrail userIdentity |
| STS temporary credentials (role) | `aws:TokenIssueTime` Deny on the role (session revocation), isolate the instance/role | sts AssumeRole events |
| Root account | Reset password, delete root access keys, reset root MFA, AWS Support | Root userIdentity |
| Federation (IdP) | Invalidate the session at the IdP + restrict the IAM role trust policy | SAML/OIDC events |

Credentials split into *long-term* (IAM user keys and passwords, which require explicit revocation) and *short-term* (STS tokens, which have no revoke API and are neutralized with a date-based deny). This distinction is the basis for "why do we deactivate access keys but reject STS tokens by TokenIssueTime?" In the zero-trust principle every credential must be revocable at any time (revocability), but AWS temporary credentials *only verify the signature and keep no central revocation list* for performance, so revocation is implemented through the policy on the role side that receives the token.

### How the Response Differs by Type

It is not only the neutralization API that differs. **The blast radius, time pressure, tracing axis, and recurrence prevention all differ.** The exam changes one cell of this table to create a wrong answer.

| Axis | IAM user access key leak | Root account compromise | Role session (STS) theft |
|---|---|---|---|
| Blast radius | The permission scope of that user | **The entire account: neither IAM policies nor SCPs can fully block it** | The permission scope of that role |
| First action | `update-access-key --status Inactive` | Reset password and MFA, delete root access keys | `aws:TokenIssueTime` Deny |
| Blocking new issuance | Deactivating the key is the block | Reset credentials + re-register MFA | Detach profile, narrow trust policy |
| Time pressure | High (minutes) | **Highest (seconds): backdoors are planted immediately** | High (until the token expires) |
| Tracing key | `userIdentity.accessKeyId` | `userIdentity.type = Root` | Session name in `userIdentity.arn`, `accessKeyId` (ASIA…) |
| Suitability for automation | **High (reversible and mechanical)** | Low: needs human judgment and organizational response | High |
| Characteristic trap | If a healthy workload uses the same key, an immediate outage | Root cannot be restricted by IAM policy | Healthy sessions using the same role are cut too |
| Root-cause measure | Remove long-term keys (roles, OIDC, Secrets Manager) | Seal root + hardware MFA + usage detection alarm | Enforce IMDSv2, shorten session lifetime |

One sentence divides the three columns: **a key is "turned off," a session must be "denied," and root must be "taken back."** An access key has a switch that can be turned off, an STS token has no switch and can only be rejected by a condition, and root is not a target of neutralization but *a matter of taking back control itself*, so it does not end with technical measures alone.

```
                    Signal that credentials have leaked
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      Key string starts with AKIA…?      Starts with ASIA… / session ARN?
      = long-term access key             = temporary STS credentials
              │                               │
              ▼                               ▼
   update-access-key Inactive        aws:TokenIssueTime Deny on the role
              │                               │
              │                     ┌─────────┴─────────┐
              │                     ▼                   ▼
              │            Instance profile?      Federation (SSO/SAML)?
              │            → detach the profile   → revoking the session at the IdP is fundamental,
              │                                     AWS assists by narrowing the trust policy
              ▼
    Is the principal root?  ──yes──▶ Reset password and MFA, delete root keys,
              │                    if it is the org management account, escalate immediately to the highest level
              no
              ▼
    ── Common follow-up ────────────────────────────────────────────
    Full CloudTrail trace → eradicate backdoors → rotate → improve structure
```

The first branch of this decision tree (`AKIA` vs `ASIA`) is the fastest way to tell in practice. The prefix alone determines which neutralization path to take.

## Scenario 1: An Access Key Was Exposed in a Public Repository

The most common case. AWS sometimes automatically detects publicly exposed keys and automatically attaches the `AWSCompromisedKeyQuarantineV3` policy, but *do not rely on it*; respond immediately.

```bash
# 1) Deactivate immediately (not delete: leaves room for tracing and recovery)
aws iam update-access-key --user-name app-user \
  --access-key-id AKIAEXAMPLE --status Inactive

# 2) Trace what happened with this key
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIAEXAMPLE \
  --start-time 2026-06-20T00:00:00Z

# 3) (After impact analysis) issue a new key → update the app → delete the old key
aws iam create-access-key --user-name app-user
aws iam delete-access-key --user-name app-user --access-key-id AKIAEXAMPLE

# 4) Move the exposed secret to Secrets Manager + set up automatic rotation
```

**Playbook order**: deactivate (containment) → trace impact with CloudTrail → rotate (issue new key, update app) → delete the old key → root cause (why was the key in the code? switch to Secrets Manager or an IAM role).

> ⚠️ **Trap: deleting the key immediately**: If you `delete` an exposed key right away, tracing the attacker's activity becomes difficult (it is already neutralized anyway), and if a healthy workload was using the same key, there is an immediate outage. The order deactivate → trace → rotate → delete is safe. However, in a clear active compromise, deactivation itself is the containment, so execute it without delay.

### Why You Must Not Trust AWS's Automatic Quarantine Policy

When AWS detects an access key exposed in a public repository or similar, it may send a notification to the account and attach a managed policy of the `AWSCompromisedKeyQuarantine` family to the IAM user. This policy broadly `Deny`s privilege escalation and resource creation actions, an **emergency measure** intended to reduce damage. But there are three reasons the responder must not lean on it.

1. **Detection is not always immediate.** The time between exposure and quarantine is not guaranteed, and keys that leaked through paths other than public repositories (a leaked laptop, a wrongly shared document, a compromised CI log) are not detected at all.
2. **The quarantine policy does not block every action.** Actions outside the quarantine scope, such as data reads, may remain, which means *data exfiltration can continue*.
3. **Attaching a policy is not neutralization.** The key is still valid. If the policy is removed or bypassed, it comes back to life as is. The only certain containment is to make the key itself `Inactive`.

In other words, AWS's quarantine is *a device that buys response time*, not a substitute for response. On the exam, the choice "wait for AWS's automatic quarantine" is placed as a wrong answer.

### The Exposed-Key Response Playbook and the Rationale for Each Step

```
① Deactivate the key                → Containment. Why not delete: the accessKeyId must remain so the CloudTrail
                               query axis is preserved, and so it can be revived immediately if it was a misjudgment.
② Check usage history immediately   → get-access-key-last-used gives a one-line summary of "when, where, what."
                               The step that gauges severity in 30 seconds before the full investigation.
③ Full CloudTrail/Athena investigation → Separate legitimate use from attacker use by source IP, Region, and User-Agent.
                               The actual size of the incident and whether a backdoor exists are decided here.
④ Eradicate backdoors               → Remove users, keys, roles, trust policies, and Lambdas the attacker created.
                               If you do ④ without ③, you will surely miss something.
⑤ Rotate                            → Issue the new key → update workloads → verify. Following this order is what gives zero downtime.
⑥ Delete the old key                → Last, after rotation is done and investigation artifacts are secured.
⑦ Improve structure                 → Why was the key in the code? Switch to roles, OIDC, or Secrets Manager.
                               If you skip this step, the same incident repeats.
```

The separation of ② and ③ matters in practice. A full investigation takes time, but `get-access-key-last-used` answers immediately: one line, **"was this key actually used, was it used in a Region we don't use,"** governs the initial severity judgment.

```bash
# ② 30-second severity judgment
aws iam get-access-key-last-used --access-key-id AKIAEXAMPLE

# See the state of all of a user's keys at a glance (also used to find unused and old keys)
aws iam list-access-keys --user-name app-user

# Account-wide credential hygiene check: root key existence, MFA not set, unrotated keys, all at once
aws iam generate-credential-report
aws iam get-credential-report --query Content --output text | base64 -d

# ⑤ Rotate: create the new key first, and delete the old one only after confirming workloads run on the new key
aws iam create-access-key --user-name app-user
aws iam update-access-key --user-name app-user --access-key-id AKIAEXAMPLE --status Inactive
aws iam delete-access-key --user-name app-user --access-key-id AKIAEXAMPLE
```

```json
// A self-quarantine policy attached immediately to the exposed user: buys investigation time while blocking data exfiltration
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyEverythingExceptFromCorporateNetwork",
      "Effect": "Deny",
      "NotAction": ["iam:GetUser", "iam:ListAccessKeys"],
      "Resource": "*",
      "Condition": {
        "NotIpAddress": { "aws:SourceIp": ["203.0.113.0/24"] },
        "Bool": { "aws:ViaAWSService": "false" }
      }
    },
    {
      "Sid": "DenyPersistenceAndExfiltration",
      "Effect": "Deny",
      "Action": [
        "iam:CreateUser", "iam:CreateAccessKey", "iam:AttachUserPolicy", "iam:PutUserPolicy",
        "iam:CreateRole", "iam:UpdateAssumeRolePolicy", "iam:CreateLoginProfile",
        "s3:GetObject", "s3:PutBucketPolicy", "ec2:RunInstances", "lambda:CreateFunction",
        "cloudtrail:StopLogging", "cloudtrail:DeleteTrail"
      ],
      "Resource": "*"
    }
  ]
}
```

The two Statements have different roles. The first cuts by *origin* to produce "nothing can be done from outside our network," and the second cuts by *action* to block persistence and data exfiltration. Without the `aws:ViaAWSService` condition, even paths where AWS services call on the user's behalf are blocked and healthy workloads break wholesale; it is the partner that must accompany any quarantine policy.

The large-scale data breach at **Uber** in 2016 shows the proposition of this unit, "the keys were lying next to the code," in its most widely known form. The attacker gained access to a **private GitHub repository** used by engineers, found AWS credentials inside it, and used those credentials to access S3 containing user data. Three things make this incident a textbook case. ① **The assumption "it's a private repository so it's fine" is not a control**: repository access leaks through account takeover, insiders, third-party integrations, and other paths, and at that moment every secret in the repository leaks with it. So the root-cause measure is not strengthening repository permissions but *not keeping secrets in the repository.* ② What leaked was not a vulnerability but **validly issued, legitimate credentials**, and the calls made with them look like normal calls in the logs; they are caught only when least privilege and anomaly detection are both present. ③ The company's subsequent **way of handling the incident without disclosing it** grew into a legal liability issue. The fact that technical containment alone is not incident response is covered again in Day 4.

## Scenario 2: Root Account Compromise (the Worst)

The root account *ignores all IAM policies*, can be restricted only partially even by *SCPs*, and some operations (closing the account, changing the support plan, etc.) can be done only by root. On compromise, the blast radius is the entire account.

```
Root compromise response playbook
1. Reset the root password immediately (if email access is still alive)
2. If a root access key exists, delete it immediately (a root key should not exist in the first place)
3. Reset the root MFA (invalidate the stolen MFA: re-register virtual/hardware)
4. Full investigation of root activity with CloudTrail (new IAM users/roles created? SCP changes? key issuance?)
5. Remove backdoors the attacker created (IAM users/roles/keys/trust policies)
6. If even recovery channels such as email and phone are compromised, escalate immediately to AWS Support/Abuse
7. If it is the Organizations management account, block damage to member accounts with SCPs
```

**Prevention matters more than response**: for root, *no daily use, no access keys, hardware MFA, a CloudWatch alarm on use*. The key control is detecting `userIdentity.type = Root` events with EventBridge and notifying immediately.

```json
// EventBridge pattern for detecting root usage
{
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "userIdentity": { "type": ["Root"] }
  }
}
```

Root is the archetypal *break-glass account*. Seal it in normal times, and monitor so that its use is itself an event. That root has exactly one exception to bypassing SCPs (the management account's root is not subject to SCPs) is the structural reason root protection must be prioritized above any other credential.

The point at which root response differs fundamentally from other credentials lies in the **rationale for the order**. It is not about why you should do MFA before password, or backdoor removal before MFA; rather, the three must proceed virtually at the same time, and among them **confirming control of the account recovery channels (email, phone) is the real step zero.**

```
Step 0  Are the account recovery channels still mine?
       First check that the root email address and phone number have not been changed.
       ← Why first: if they have already changed, resetting the password itself is impossible.
         From that moment, escalation to AWS Support/Abuse is the only path, not technical response.
Step 1  Reset the root password + re-register MFA (remove the existing MFA device and register anew)
       ← Why together: if you change only the password, the attacker re-enters the reset flow through the MFA device they registered.
Step 2  Check whether a root access key exists → delete immediately if so
       ← A root access key is an asset that should not exist in the first place. Its existence is itself an incident.
Step 3  Full investigation of root activity with CloudTrail
       ← Until you confirm what was created with root (users, roles, keys, trust policies, SCP changes),
         you cannot say "we got it back." If a backdoor remains, control is still shared.
Step 4  Remove backdoors + organization-level containment (if it is the management account, block damage to member accounts with SCPs)
Step 5  Rebuild the root seal: hardware MFA, no access keys, root usage detection alarm, redundant recovery channels
```

```json
// A detection pattern that makes root usage an "event": it also catches console sign-in
{
  "detail-type": ["AWS API Call via CloudTrail", "AWS Console Sign In via CloudTrail"],
  "detail": {
    "userIdentity": { "type": ["Root"] }
  }
}
```

```json
// An SCP that blocks at the source risky actions by the member accounts' root at the organization level
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyRootUserActionsInMemberAccounts",
    "Effect": "Deny",
    "Action": "*",
    "Resource": "*",
    "Condition": {
      "StringLike": { "aws:PrincipalArn": "arn:aws:iam::*:root" }
    }
  }]
}
```

This SCP comes with a decisive caveat. **SCPs do not apply to principals in the organization's management account, so the management account's root cannot be blocked by this policy.** That is why the management account's root must be protected not by policy but by *physical controls* (hardware MFA, separately stored credentials, immediate alarm on use). This is why a choice saying "just restrict root with an IAM policy or SCP" is wrong: it works partially for member accounts and does not work for the management account, which is the most dangerous.

There is also a structural solution. If you enable **centralized root access management** in AWS Organizations, you can remove the member accounts' root credentials (password, MFA, access keys) themselves, and when the few operations only root can perform are needed, you replace them by obtaining a short-term root session from the management account side. **Making sure there are no root credentials in each account to neutralize** is the strongest prevention for this type of incident.

## Scenario 3: Temporary Credential and Federation Leakage

When the STS token of an EC2/Lambda role or an SSO federation session has been stolen. Unlike an access key, there is no key to deactivate.

```json
// Inline policy on the role: deny every session issued before the point in time (= Revoke active sessions)
{
  "Effect": "Deny",
  "Action": "*",
  "Resource": "*",
  "Condition": {
    "DateLessThan": { "aws:TokenIssueTime": "2026-06-24T10:00:00Z" }
  }
}
```

- **Role sessions**: Neutralize existing sessions with the `aws:TokenIssueTime` Deny above. Block new issuance by narrowing the role trust policy or temporarily disabling the role (emptying the trust policy).
- **Federation**: Fundamental neutralization requires revoking the user's sessions and credentials *on the IdP side*. The AWS side assists with role trust policy restriction and session revocation.
- **Keys derived through STS GetSessionToken/AssumeRole**: If you neutralize the original credentials (IAM user/role), *new derivations* are blocked, but already-issued derived tokens are invalidated by expiry or a TokenIssueTime Deny.

> ⚠️ **Trap**: The common misconception that "deleting the role immediately invalidates the tokens." Deleting a role or changing a policy applies to *permission evaluation from that point on*, so it can be used to neutralize tokens, but it breaks the running workloads. The standard approach is to keep the role and cut *only the existing sessions* with a TokenIssueTime Deny.

## After Neutralization: Tracing and Rotation

Neutralization only stops the bleeding; it is half of the response.

1. **Activity tracing (CloudTrail / Athena)**: every call the leaked credential made, in chronological order. Identify in full the new IAM entities created, keys issued, policies changed, data accessed (S3 GetObject, etc.), and resources created (mining instances, etc.).

```sql
-- Query the leaked key's activity from CloudTrail with Athena
SELECT eventtime, eventname, awsregion, sourceipaddress, errorcode
FROM cloudtrail_logs
WHERE useridentity.accesskeyid = 'AKIAEXAMPLE'
  AND eventtime > '2026-06-20'
ORDER BY eventtime;
```

2. **Rotation**: issue new credentials and update dependent workloads. In the long run, move to a structure of *removing long-term keys → IAM roles/IRSA/instance profiles/Secrets Manager automatic rotation*.

3. **Backdoor removal**: remove every persistence mechanism the attacker created (new IAM users, additional access keys, widened trust policies, Lambda backdoors, tampered SCPs) based on the tracing results.

```
Integrated credential leak playbook
[Contain] Deactivate / revoke sessions (per-type mechanism)
   ▼
[Trace] Identify scope of impact and backdoors with CloudTrail/Athena
   ▼
[Eradicate] Remove entities, keys, policies, and resources the attacker created
   ▼
[Rotate] Issue new credentials, update workloads
   ▼
[Harden] Long-term keys → roles/Secrets Manager, enforce MFA, add detection controls
```

Credential leak response is an area where *partial automation* is very effective. If you automate immediate key deactivation and session revocation with GuardDuty's `UnauthorizedAccess:IAMUser/*` and `CredentialAccess:*` findings → EventBridge → Lambda (Day 1), mean time to respond (MTTR) drops from minutes to seconds. However, *tracing, eradication, and rotation* need impact analysis, so human judgment often enters; setting the boundary between automation (immediate containment) and humans (impact analysis and recovery) is the key (Day 4). Also, the fundamental solution is *to eliminate long-term credentials entirely*: temporary credentials through IAM Identity Center (SSO) for people, roles/IRSA for workloads, and Secrets Manager automatic rotation for machine secrets. If there is no long-term key to neutralize, incidents of this type themselves decrease.

### Backdoor Hunting: You Find Only What You Know to Look For

The instruction "remove the backdoors" cannot be executed without a list of what to look for. The ways an attacker establishes persistence in AWS are standardized, and the response runbook should contain that list as a checklist.

| Persistence technique | CloudTrail events left | How to check |
|---|---|---|
| Creating new IAM users and keys | `CreateUser`, `CreateAccessKey` | Recently created users in the credential report |
| Granting console sign-in to an existing user | `CreateLoginProfile`, `UpdateLoginProfile` | Whether a login profile appeared on a programmatic-only user |
| Adding an external account to a role trust policy | `UpdateAssumeRolePolicy` | **IAM Access Analyzer external access findings** |
| Inserting a new policy version and setting it as default | `CreatePolicyVersion`, `SetDefaultPolicyVersion` | Compare policy version history |
| Lambda and EventBridge backdoors | `CreateFunction`, `PutRule`, `AddPermission` | Recently created functions and their execution roles |
| Opening S3 and KMS resource policies | `PutBucketPolicy`, `PutKeyPolicy`, `CreateGrant` | Access Analyzer + public access status |
| Sharing snapshots and AMIs externally | `ModifySnapshotAttribute`, `ModifyImageAttribute` | List of accounts shared with |
| Registering an EC2 key pair | `ImportKeyPair`, `CreateKeyPair` | List of recent key pairs |
| **Disabling logging** | `StopLogging`, `DeleteTrail`, `PutEventSelectors`, `DeleteFlowLogs` | The *gap period* in the logs is itself a signal |
| Disabling MFA | `DeactivateMFADevice`, `DeleteVirtualMFADevice` | List of users without MFA |

The second-to-last row is the most important in an investigation. **If the attacker turns off CloudTrail, that very fact is left as CloudTrail's last record.** So the investigation must look not only at "what was recorded" but also **"where there is no record."** This is exactly why you create an organization-level CloudTrail (Organization Trail) in the management account and lock it with an SCP so member accounts cannot turn it off.

```sql
-- Whether the leaked credential created persistence: pick out only the creation and permission-change family
SELECT eventtime, eventname, useridentity.arn, sourceipaddress,
       requestparameters, errorcode
FROM cloudtrail_logs
WHERE useridentity.accesskeyid = 'AKIAEXAMPLE'
  AND eventname IN (
    'CreateUser','CreateAccessKey','CreateLoginProfile','AttachUserPolicy',
    'PutUserPolicy','CreateRole','UpdateAssumeRolePolicy','CreatePolicyVersion',
    'CreateFunction','PutBucketPolicy','StopLogging','DeleteTrail')
ORDER BY eventtime;

-- The fastest axis for separating legitimate use from attacker use: source IP and Region distribution
SELECT sourceipaddress, awsregion, count(*) AS calls,
       min(eventtime) AS first_seen, max(eventtime) AS last_seen
FROM cloudtrail_logs
WHERE useridentity.accesskeyid = 'AKIAEXAMPLE'
GROUP BY sourceipaddress, awsregion
ORDER BY calls DESC;

-- Follow the activity that spread to the "secondary credentials" the attacker created
SELECT eventtime, eventname, awsregion, requestparameters
FROM cloudtrail_logs
WHERE useridentity.username = 'backup-svc-2'   -- the attacker-created user found in ①
ORDER BY eventtime;
```

The third query is the step often skipped in investigations. **If you look only at the leaked key's activity, the investigation ends halfway.** If the attacker created a new user with that key, later activity happens with *the new user's credentials* and is not caught by queries centered on the original key. An investigation is a **recursive task** that goes around once more for each entity discovered, and Amazon Detective is a tool that reduces this repetition with a relationship graph among entities.

```bash
# Check at once whether trust policies are open externally: the standard tool for backdoor hunting
aws accessanalyzer list-findings \
  --analyzer-arn arn:aws:access-analyzer:ap-northeast-2:111122223333:analyzer/org-analyzer \
  --filter '{"status":{"eq":["ACTIVE"]},"resourceType":{"eq":["AWS::IAM::Role"]}}'

# Monitor the very action that creates gaps in the logs
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=StopLogging
```

> 🎯 **Scenario**: On a Friday evening, an outside tip arrives in the security channel: "I saw your company's access key in a public GitHub repository." On checking, the commit was 6 days ago, and that key is a production key that three batch job servers use every hour. What do you do, and in what order? → ① **Deactivation comes first.** The judgment to keep it alive until rotation finishes because "production will stop" is a choice that keeps extending 6 days of exposure. A batch stoppage is recoverable but data exfiltration is not: the principle of ranking priority by reversibility applies here too. ② Within 30 seconds, check with `get-access-key-last-used` and the CloudTrail source IP distribution **whether there were calls from IPs other than our batch servers.** This is the single judgment that separates "exposed but not used" from "already compromised." ③ If there were external IP calls, raise the incident level immediately and run the backdoor checklist above in full, especially `CreateUser`, `UpdateAssumeRolePolicy`, and `StopLogging`. ④ In parallel, rotate to a new key and update the batch servers, then ⑤ delete the old key. ⑥ The last step is the real response: **why were the batch servers using a long-term key?** Switch to an instance role for EC2, GitHub OIDC federation for CI, and IAM Roles Anywhere for on-premises. If you skip this step, the same incident returns next quarter.

If you understand rotation as "create a new key and immediately delete the old one," an outage is certain. Safe rotation is the five steps **① issue the new key → ② deploy to workloads → ③ verify that calls are actually made with the new key → ④ deactivate the old key → ⑤ delete after an observation period**, and the gap between ④ and ⑤ is room for rollback. However, **in a clear active compromise this order is reversed**: containment takes priority over availability, so deactivate first and rotate afterward. In exam choices, when the clue "a healthy workload is using it" is attached, rotation first, and when there is "evidence that the attacker already used it," deactivation first. That one line of clue changes the correct answer.

## Trap Summary

- If you `delete` an exposed key right away, you lose the CloudTrail query axis (accessKeyId) and healthy workloads stop immediately too.
- AWS's automatic quarantine policy is only an emergency measure: detection can be late, and it does not block every action either.
- If you cannot distinguish `AKIA` (long-term key) from `ASIA` (temporary session), you get the neutralization method itself wrong.
- STS tokens have no revoke API: since there is nothing to deactivate, an `aws:TokenIssueTime` conditional deny is the only means.
- A `TokenIssueTime` Deny **also cuts healthy sessions using the same role**; understand the scope of impact first.
- Trying to invalidate tokens by deleting the role brings down production workloads with it.
- A federation session is not fundamentally neutralized unless revoked at the IdP; AWS-side actions are auxiliary.
- Root cannot be restricted by IAM policy, and **SCPs do not apply to management account principals**.
- If you reset only the root password and do not clean up the MFA devices, the attacker re-enters the reset flow.
- If the account recovery channels (email, phone) have already been changed, AWS escalation is the only path, not technical response.
- Investigating only the leaked key's activity and **not following the activity of secondary credentials the attacker created**.
- Not reading the *gap period* in the logs (StopLogging, DeleteTrail) as a signal.
- Understanding rotation as "issue a new key and immediately delete the old one," creating an outage with no room for verification or rollback.
- Doing only containment and rotation and not fixing the structural question "why was a long-term key there," so the incident repeats.

## Summary

- [ ] Did you pick exactly the right neutralization mechanism for each credential type (user key/password/STS/root/federation)?
- [ ] Did you distinguish long-term from temporary by key prefix (`AKIA`/`ASIA`) and split the response path?
- [ ] Did you perform invalidation of existing sessions and blocking of new issuance **as a pair**?
- [ ] Did you contain directly without leaning on AWS's automatic quarantine?
- [ ] Did you fully check the backdoor hunting checklist (users, keys, trust policies, policy versions, Lambda, logging disablement)?
- [ ] Did you run the investigation one more round, centered on the secondary entities the attacker created?
- [ ] Did you perform rotation safely in five steps (issue → deploy → verify → deactivate → delete)?
- [ ] Did you make root usage a detection event and make the recovery channels redundant?
- [ ] Did you first deactivate (contain) the access key rather than delete it, preserving room for tracing and recovery?
- [ ] Did you revoke STS and role sessions with an aws:TokenIssueTime Deny (not deletion)?
- [ ] On a root compromise, did you reset the password, keys, and MFA, do a full investigation of root activity, and remove backdoors?
- [ ] Did you trace the leaked credential's full activity and backdoors with CloudTrail/Athena?
- [ ] Did you rotate to new credentials and update dependent workloads?
- [ ] Did you reflect that for federation, revoking the session on the IdP side is the fundamental neutralization?
- [ ] In the long run, did you apply long-term key removal (roles/SSO/Secrets Manager) + a root usage detection alarm?

---

## 📝 Practice Questions

**Question 1.** You discovered that an IAM user's access key was exposed in a public GitHub repository. A legitimately running workload is using the same key. What is the most appropriate first action?

A) Delete the key immediately with delete-access-key  
B) Contain by setting the key to Inactive with update-access-key, then trace the impact with CloudTrail, rotate to a new key, and delete the old key  
C) Delete the user  
D) Do nothing and wait for AWS automatic quarantine  

**Answer: B**  
Explanation: Deleting immediately makes it hard to trace attacker activity and causes an outage for the legitimate workload. The safe order is to contain by deactivating (keeping room for tracing and recovery), trace with CloudTrail, rotate to a new key and update the application, and then delete the old key. Deleting the user is excessive, and relying only on AWS automatic quarantine is risky.

---

**Question 2.** You want to neutralize the STS temporary credentials of a compromised EC2 role while minimizing the impact on other legitimately running workloads. What is the correct method?

A) Delete the role  
B) Deactivate the access key  
C) Add an aws:TokenIssueTime DateLessThan Deny policy to the role to revoke only sessions issued before the specified time  
D) Enforce MFA  

**Answer: C**  
Explanation: Temporary credentials have no revocation API, so add an aws:TokenIssueTime-based Deny to the role (Revoke active sessions in the console) to invalidate only the existing sessions. Deleting the role breaks legitimate workloads, STS tokens have no access key to deactivate, and enforcing MFA does not neutralize tokens that have already been issued.

---

**Question 3.** The root account was compromised through phishing. Which of the following is the lowest priority or inappropriate in a root compromise response?

A) Reset the root password and MFA, and delete root access keys  
B) Exhaustively investigate backdoors such as IAM users, roles, keys, and SCP changes created by root using CloudTrail  
C) Only modify IAM user policies, since that also restricts root permissions  
D) Escalate to AWS Support/Abuse if the account recovery channels have also been compromised  

**Answer: C**  
Explanation: Root ignores all IAM policies, so modifying IAM user policies cannot restrict root permissions; this choice is inappropriate. The standard root compromise response is to reset the password, MFA, and keys, investigate backdoors in CloudTrail, and escalate to AWS if the recovery channels are compromised.

---

**Question 4.** Which set of follow-up steps is most appropriate to perform immediately after neutralizing the credentials?

A) The response is over once containment is done  
B) Trace the leaked credentials' full activity and backdoors with CloudTrail/Athena, eradicate the entities, keys, and policies the attacker created, and then rotate to new credentials  
C) Check the cost report  
D) Delete all IAM users  

**Answer: B**  
Explanation: Neutralization only stops the bleeding. The response is complete only when you trace and eradicate everything the leaked credentials did and the backdoors planted (new users, keys, widened trust policies) with CloudTrail/Athena, and rotate to new credentials to restore the workloads. Ending at containment or deleting indiscriminately is inappropriate.

---

**Question 5.** What is the most effective long-term strategy to structurally reduce recurrence of credential leak incidents?

A) Back up access keys more often  
B) Eliminate long-term credentials: use IAM Identity Center (SSO) temporary credentials for people, IAM roles/IRSA for workloads, and Secrets Manager automatic rotation for machine secrets, plus a root usage detection alarm  
C) Document all keys in code comments  
D) Increase the key length  

**Answer: B**  
Explanation: The root cause of the incident is the existence of long-term credentials that must be neutralized. Switching to SSO temporary credentials for people, roles/IRSA for workloads, and Secrets Manager automatic rotation for machine secrets removes the long-term keys that could be exposed, and a root usage detection alarm watches the worst-case path. Backing up keys, documenting them in comments, and increasing length either raise the exposure risk or are irrelevant.

---
