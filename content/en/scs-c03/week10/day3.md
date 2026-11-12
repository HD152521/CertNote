# Day 3 - Credential Exposure Response: Access Key Exposure, Root Compromise, IAM Neutralization and Rotation Playbook

Credential exposure is the most common entry point for cloud breaches. An access key carelessly committed to GitHub, a root password phished from employees, STS tokens leaked from a compromised instance — attackers enter through the *front door with valid credentials* rather than exploiting vulnerabilities. The essence of response is *"how quickly can you neutralize exposed credentials, track what happened with them, and safely reissue?"* The exam relentlessly tests that *different credential types have different neutralization mechanisms*. 

Three core principles: ① **Neutralization prioritizes disabling/revoking over deletion** (preserve evidence and recovery options), ② **Each type has different revocation mechanisms**, ③ **After neutralization, always track activity (CloudTrail) and rotate**.

## Neutralization mechanisms by type (most critical)

| Credential Type | Neutralization Method | Tracking |
|-----------------|----------------------|----------|
| IAM user access key | `update-access-key Status=Inactive` (immediate), later `delete-access-key` | CloudTrail accessKeyId |
| IAM user console password | `delete-login-profile` or password reset + force MFA | CloudTrail userIdentity |
| STS temporary credentials (role) | Add `aws:TokenIssueTime` Deny to role (session revocation), isolate instance/role | sts AssumeRole events |
| Root account | Reset password, delete root access keys, reset root MFA, AWS Support escalation | root userIdentity |
| Federation (IdP) | Invalidate session at IdP + restrict IAM role trust policy | SAML/OIDC events |

> 💡 **Related theory**: Credentials split into *long-term* (IAM user keys/passwords — require explicit revocation) and *short-term* (STS tokens — no revoke API, neutralized via time-based denial). This distinction explains "why do we disable access keys but deny STS tokens via TokenIssueTime?" In zero-trust, all credentials must be revocable at any time (revocability), but AWS temporary credentials verify only the signature for performance — they don't maintain a central revocation list, so revocation is implemented via policy on the role receiving the token.

## Scenario 1: Access key exposed in public repository

Most common case. AWS auto-detects publicly exposed keys and sometimes auto-attaches `AWSCompromisedKeyQuarantineV3` policy, but *don't rely on this* — respond immediately.

```bash
# 1) Immediately disable (not delete — preserve tracking/recovery options)
aws iam update-access-key --user-name app-user \
  --access-key-id AKIAEXAMPLE --status Inactive

# 2) Track what happened with this key
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIAEXAMPLE \
  --start-time 2026-06-20T00:00:00Z

# 3) (After impact analysis) Issue new key → update app → delete old key
aws iam create-access-key --user-name app-user
aws iam delete-access-key --user-name app-user --access-key-id AKIAEXAMPLE

# 4) Move exposed secrets to Secrets Manager + configure auto-rotation
```

**Playbook sequence**: Disable (contain) → track via CloudTrail → rotate (new key, update app) → delete old key → root cause (why was key in code — migrate to Secrets Manager/IAM role).

> ⚠️ **Pitfall — Delete key immediately**: Deleting exposed key with `delete` makes attacker activity tracking harder (already neutralized), and if legitimate workloads use the same key, you cause immediate outage. Disable → track → rotate → delete sequence is safer. However, in clear active compromise, disabling itself is containment, so act without delay.

## Scenario 2: Root account compromise (worst case)

Root account *ignores all IAM policies* and *SCP provides only partial restrictions*, with some operations (account closure, support plan changes) only root can perform. Compromise has account-wide blast radius.

```
Root compromise response playbook
1. Immediately reset root password (if email access is intact)
2. Delete root access keys if they exist (root shouldn't have keys)
3. Reset root MFA (invalidate compromised MFA — re-register virtual/hardware)
4. Full CloudTrail audit of root activity (new IAM users/roles created? SCP changed? keys issued?)
5. Remove attacker-created backdoors (IAM users/roles/keys/trust policies)
6. If email/phone account recovery channels compromised, escalate immediately to AWS Support/Abuse
7. If management account in Organizations, use SCP to block member account damage
```

**Prevention more important than response**: Root must be *never used daily, no access keys, hardware MFA, CloudWatch alert on use*. EventBridge detecting `userIdentity.type = Root` events and immediately alerting is critical.

```json
// EventBridge pattern for root usage detection
{
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "userIdentity": { "type": ["Root"] }
  }
}
```

> 💡 **Related theory**: Root is the classic *break-glass (emergency) account*. Keep it sealed in normal times, make its use itself an event triggering monitoring. Root's unique property of bypassing SCP (management account root is SCP-exempt) is the structural reason to prioritize root protection above all other credentials.

## Scenario 3: Temporary credentials and federation leakage

STS tokens from EC2/Lambda roles or SSO federation sessions exfiltrated. No access key to disable like with long-term credentials.

```json
// Add inline policy to role: deny all sessions issued before a time (= Revoke active sessions)
{
  "Effect": "Deny",
  "Action": "*",
  "Resource": "*",
  "Condition": {
    "DateLessThan": { "aws:TokenIssueTime": "2026-06-24T10:00:00Z" }
  }
}
```

- **Role sessions**: Use `aws:TokenIssueTime` Deny above to neutralize existing sessions. Block new issuance by narrowing role trust policy or temporarily disabling the role (empty trust policy).
- **Federation**: *Root neutralization must happen at the IdP side* — IdP invalidates user session and credentials. AWS assists with role trust policy restriction and session revocation.
- **Keys derived from STS GetSessionToken/AssumeRole**: Neutralizing the original credential (IAM user/role) blocks *new derivations* but already-issued derived tokens remain until expiration or TokenIssueTime Deny.

> ⚠️ **Pitfall**: Common misconception: "Deleting the role immediately invalidates the token." Role deletion/policy changes apply to *future permission evaluations*, so they can be used for token neutralization, but destroy running workloads. The standard: keep the role, use TokenIssueTime Deny to *terminate only existing sessions*.

## After neutralization: Tracking and rotation

Neutralization only stops the bleeding — it's half of response.

1. **Track activity (CloudTrail/Athena)**: Chronologically list every call the exposed credential made. New IAM entities created, keys issued, policies modified, data accessed (S3 GetObject, etc.), resources created (mining instances, etc.) — full picture.

```sql
-- Query CloudTrail for exposed key activity via Athena
SELECT eventtime, eventname, awsregion, sourceipaddress, errorcode
FROM cloudtrail_logs
WHERE useridentity.accesskeyid = 'AKIAEXAMPLE'
  AND eventtime > '2026-06-20'
ORDER BY eventtime;
```

2. **Rotate (rotation)**: Issue new credentials, update dependent workloads. Long-term: *remove long-term keys → migrate to IAM roles/IRSA/instance profiles/Secrets Manager auto-rotation*.

3. **Remove backdoors**: Eliminate persistence mechanisms the attacker created — new IAM users, additional keys, widened trust policies, Lambda backdoors, modified SCPs — based on tracking results.

```
Integrated credential exposure playbook
[Contain] Disable/revoke session (type-specific mechanism)
   ▼
[Track] CloudTrail/Athena for impact scope and backdoors
   ▼
[Eradicate] Remove attacker-created entities, keys, policies, resources
   ▼
[Rotate] Issue new credentials, update workloads
   ▼
[Harden] Long-term keys → roles/Secrets Manager, force MFA, add detection controls
```

> 🔍 **Deep dive**: Credential exposure response is a *partial automation* domain very effective for automation. Automate immediate key disable/session revocation (Day 1) via GuardDuty's `UnauthorizedAccess:IAMUser/*`, `CredentialAccess:*` findings → EventBridge → Lambda, reducing mean time to response (MTTR) from minutes to seconds. However, *tracking, eradication, rotation* require impact analysis, often needing human judgment — the boundary between automation (immediate containment) and human (impact analysis, recovery) is key. The fundamental fix: *eliminate long-term credentials altogether*: humans via IAM Identity Center (SSO) get temporary credentials, workloads via roles/IRSA, machine secrets via Secrets Manager auto-rotation. If no long-term keys exist to neutralize, this class of incident drops significantly.

## One-line summary checklist

- [ ] Correctly identified neutralization mechanism for each credential type (user key/password/STS/root/federation)
- [ ] Disabled access keys first, not delete — preserved tracking and recovery options
- [ ] Revoked STS and role sessions via aws:TokenIssueTime Deny (not deletion)
- [ ] On root compromise: reset password/keys/MFA + full CloudTrail root activity audit + backdoor removal
- [ ] Tracked full activity and backdoors via CloudTrail/Athena/Detective
- [ ] Rotated to new credentials and updated dependent workloads
- [ ] Recognized federation: IdP-side session revocation is the fundamental neutralization
- [ ] Implemented long-term: eliminate long-term keys (roles/SSO/Secrets Manager) + root usage detection alarm

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
