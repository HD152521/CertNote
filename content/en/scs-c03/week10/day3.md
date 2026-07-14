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

## 📝 연습 문제

**문제 1.** IAM 사용자의 액세스 키가 공개 GitHub 저장소에 노출된 것을 발견했다. 정상 운영 중인 워크로드도 같은 키를 쓰고 있다. 가장 적절한 첫 조치는?

A) 키를 즉시 delete-access-key로 삭제한다  
B) 키를 update-access-key로 Inactive 처리해 봉쇄한 뒤, CloudTrail로 영향을 추적하고 새 키로 회전한 후 기존 키를 삭제한다  
C) 사용자를 삭제한다  
D) 아무것도 하지 않고 AWS의 자동 격리를 기다린다  

**정답: B**  
해설: 즉시 삭제하면 공격자 활동 추적이 어렵고 정상 워크로드가 장애가 난다. 비활성화로 봉쇄(추적·복구 여지 유지) → CloudTrail 추적 → 새 키 회전·앱 갱신 → 기존 키 삭제 순서가 안전하다. 사용자 삭제는 과도하고, AWS 자동 격리에만 의존하는 것은 위험하다.

---

**문제 2.** 침해된 EC2 역할의 STS 임시 자격증명을 무력화하려 한다. 운영 중인 다른 정상 워크로드는 영향을 최소화하고 싶다. 올바른 방법은?

A) 역할을 삭제한다  
B) 액세스 키를 비활성화한다  
C) 역할에 aws:TokenIssueTime DateLessThan Deny 정책을 추가해 지정 시점 이전 발급 세션만 폐기한다  
D) MFA를 강제한다  

**정답: C**  
해설: 임시 자격증명은 폐기 API가 없으므로, 역할에 aws:TokenIssueTime 기반 Deny(콘솔의 Revoke active sessions)를 추가해 기존 세션만 무효화한다. 역할 삭제는 정상 워크로드를 망가뜨리고, STS 토큰에는 비활성화할 액세스 키가 없으며, MFA 강제는 이미 발급된 토큰을 무력화하지 못한다.

---

**문제 3.** 루트 계정이 피싱으로 침해됐다. 다음 중 루트 침해 대응에서 가장 우선순위가 낮거나 부적절한 것은?

A) 루트 비밀번호·MFA 재설정 및 루트 액세스 키 삭제  
B) CloudTrail로 루트가 만든 IAM 사용자·역할·키·SCP 변경 등 백도어 전수 조사  
C) IAM 사용자 정책만 수정하면 루트 권한도 함께 제한되므로 그것만 한다  
D) 계정 복구 채널까지 침해됐다면 AWS Support/Abuse로 에스컬레이션  

**정답: C**  
해설: 루트는 모든 IAM 정책을 무시하므로 IAM 사용자 정책 수정으로는 루트 권한을 제한할 수 없다 — 이 선택이 부적절하다. 루트 침해는 비밀번호·MFA·키 재설정, CloudTrail 백도어 조사, 복구 채널 침해 시 AWS 에스컬레이션이 정석이다.

---

**문제 4.** 자격증명을 무력화한 직후 반드시 수행해야 하는 후속 단계로 가장 적절한 묶음은?

A) 봉쇄만 했으면 대응 종료  
B) CloudTrail/Athena로 유출 자격증명의 전체 활동·백도어를 추적하고, 공격자가 만든 엔티티·키·정책을 근절한 뒤 새 자격증명으로 회전  
C) 비용 보고서를 확인한다  
D) 모든 IAM 사용자를 삭제한다  

**정답: B**  
해설: 무력화는 출혈을 멈춘 것일 뿐이다. CloudTrail/Athena로 유출 자격증명이 한 모든 행위와 심어둔 백도어(새 사용자·키·넓힌 신뢰 정책)를 추적·근절하고, 새 자격증명으로 회전해 워크로드를 복구해야 대응이 완결된다. 봉쇄만으로 종료하거나 무차별 삭제는 부적절하다.

---

**문제 5.** 자격증명 유출 사고의 재발을 구조적으로 줄이는 가장 효과적인 장기 전략은?

A) 액세스 키를 더 자주 백업한다  
B) 장기 자격증명을 제거하고 사람은 IAM Identity Center(SSO) 임시 자격증명, 워크로드는 IAM 역할/IRSA, 머신 비밀은 Secrets Manager 자동 회전으로 전환 + 루트 사용 탐지 알람  
C) 모든 키를 코드 주석으로 문서화한다  
D) 키 길이를 늘린다  

**정답: B**  
해설: 사고의 근본 원인은 무력화할 장기 자격증명의 존재다. 사람은 SSO 임시 자격증명, 워크로드는 역할/IRSA, 머신 비밀은 Secrets Manager 자동 회전으로 전환하면 노출될 장기 키 자체가 사라지고, 루트 사용 탐지 알람으로 최악의 경로를 감시한다. 키 백업·주석 문서화·길이 증가는 노출 위험을 오히려 키우거나 무관하다.

---
