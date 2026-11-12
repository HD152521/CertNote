# Day 2 - Permission Boundaries and Delegation: The Art of Safely Handing Permissions to Developers

As an organization grows, a single security team cannot create every IAM role and policy. To move fast, you have to let developers create their own Lambda execution roles, EC2 instance roles, and CI/CD deployment roles. But there is a critical risk here. **A developer who has been delegated IAM permissions can create a role that attaches AdministratorAccess to themselves and cause privilege escalation.**

The thing that tackles this problem head-on is the **Permission Boundary**. We briefly saw the concept as a "permission ceiling" in day1, and today we handle it in practice in a delegation scenario. On the Specialty exam, blocking privilege escalation is a core topic that appears in nearly every sitting.

## Anatomy of a Privilege Escalation Attack

You first need to understand how the attack happens before the defense becomes visible. Suppose you have given a developer the permissions `iam:CreateRole`, `iam:AttachRolePolicy`, and `iam:PassRole`. The developer's intent is "I want to create a role for my Lambda." But with these permissions, the following is possible.

```
1. Create a new role:          iam:CreateRole
2. Attach an admin policy:     iam:AttachRolePolicy → arn:aws:iam::aws:policy/AdministratorAccess
3. Switch to that role:        sts:AssumeRole or PassRole to Lambda
→ Result: the developer effectively becomes the account administrator
```

This is a classic **IAM privilege escalation**. The delegated permissions themselves are legitimate, but combined they go beyond the developer's own authority.

This attack is a representative case of the **21 AWS IAM privilege escalation paths** compiled in 2018 by security researcher Spencer Gietzen (Rhino Security Labs). Several paths are known, such as `iam:CreatePolicyVersion`, `iam:SetDefaultPolicyVersion`, `iam:PassRole + lambda:CreateFunction`, and `iam:AttachUserPolicy`. The common principle is that "the permission to manipulate IAM" is the same as "the permission to obtain every permission." That is why permissions that handle IAM itself must always be bound by a boundary.

### There Is More Than One Escalation Path

"Create a role and attach an admin policy" is only one of several paths. To design a defense you need to know the **types of paths**, which fall roughly into three branches.

```
[ Three branches of privilege escalation paths ]

(1) Directly widen your own permissions
   iam:AttachUserPolicy / iam:PutUserPolicy
   iam:AttachRolePolicy / iam:PutRolePolicy
   iam:CreatePolicyVersion + iam:SetDefaultPolicyVersion
     └ Swap out the "contents" of a policy document that is already attached.
       The attachment relationship is unchanged, so the audit log stays quiet.

(2) Create a stronger identity and switch to it
   iam:CreateRole + iam:AttachRolePolicy + sts:AssumeRole
   iam:UpdateAssumeRolePolicy
     └ Add yourself to the "trust policy" of an existing admin role.
       No new role or policy is created, so it is hard to notice.
   iam:CreateAccessKey (for another user)
   iam:CreateLoginProfile / iam:UpdateLoginProfile (for another user)
     └ Create a means of logging in as someone else's identity.

(3) Hand a strong role to compute and have it run on your behalf  ← the iam:PassRole family
   iam:PassRole + lambda:CreateFunction + lambda:InvokeFunction
   iam:PassRole + ec2:RunInstances
   iam:PassRole + cloudformation:CreateStack
   iam:PassRole + glue:CreateDevEndpoint
     └ You do not become that role yourself; you create code that runs as that role.
       The result is the same: you exercise all of that role's permissions.
```

The property that runs through all three branches is that **in IAM, the "permission to grant permissions" and the "permission to use permissions" are not distinguished**. `iam:AttachRolePolicy` by itself reads no data, but in practice it is equivalent to the permission to read all data in the account. So when designing IAM delegation, you must look not at the list of actions but at **"what final state is reachable through this combination."**

| Path type | Representative actions | What must be blocked |
|-----------|-----------|--------------------|
| (1) Expanding own permissions | `iam:AttachUserPolicy`, `iam:PutRolePolicy`, `iam:CreatePolicyVersion` | Fix the ceiling with a permissions boundary + make the boundary policy itself unmodifiable |
| (2) Forging/switching identity | `iam:CreateRole`, `iam:UpdateAssumeRolePolicy`, `iam:CreateAccessKey`, `iam:CreateLoginProfile` | Enforce the boundary at creation + limit the targets of trust policy modification to a namespace |
| (3) Passing a role (PassRole) | `iam:PassRole` + the creation actions of compute services | Pin down "which roles can be passed where" with `iam:PassedToService` and resource restrictions |

> ⚠️ **Pitfall**: Among the three branches, the combination of `iam:CreatePolicyVersion` + `iam:SetDefaultPolicyVersion` in (1) is the easiest to miss. People pay attention only to the permission to *attach* policies to developers and carelessly leave the permission to *modify* policy documents. With this combination, a developer can create a new version of the permissions boundary policy attached to themselves, fill it with `"Action": "*"`, and set it as the default version. It becomes a state where **the boundary cannot protect itself**. That is why the first sentence of a permissions boundary design must always be "a Deny that protects the boundary policy itself."

## iam:PassRole: The Most Misunderstood Permission

The reason branch (3) is especially hard is that `iam:PassRole` **grants the caller no permissions at all**. This action is merely a permit saying "you may hand this role to an AWS service," and it is the service that receives the role that actually exercises the permissions.

```
[ Difference between AssumeRole and PassRole ]

  ── sts:AssumeRole ──────────────────────────────
     person/role  ──"I will become that role"──▶  STS
                                        │
                                        ▼
                            You hold the temporary credentials in hand
                            CloudTrail: an AssumeRole event is recorded
                            The trust policy (on the role side) must allow it

  ── iam:PassRole ────────────────────────────────
     person/role  ──"attach this role to Lambda"──▶  Lambda
                                             │
                                             ▼
                            The Lambda function runs as that role
                            The caller cannot see the credentials directly
                            The trust policy allows "lambda.amazonaws.com"
                            The caller needs the iam:PassRole permission
```

The key difference is **who the trust policy allows**. On the AssumeRole path, the role's trust policy must allow a *person/role*, but on the PassRole path, the trust policy allows a *service principal* (`lambda.amazonaws.com`). That is why roles exist that "cannot be assumed but can be passed," and if you attach such a role to Lambda and run code, you end up using all of that role's permissions.

Therefore `iam:PassRole` must always pin down **which roles (Resource) can be passed to which services (Condition)**.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PassOnlyLambdaExecutionRolesToLambda",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::111122223333:role/dev-lambda-*",
      "Condition": {
        "StringEquals": { "iam:PassedToService": "lambda.amazonaws.com" }
      }
    }
  ]
}
```

This statement narrows in two layers. `Resource` limits **the namespace of roles that can be passed** to `dev-lambda-*`, and the `iam:PassedToService` condition limits **the destination services they can be passed to** to Lambda. With only one of the two, it is breached: if you narrow only `Resource`, that role can also be passed to EC2 and CloudFormation, and if you set only the condition, *every* role in the account can be attached to Lambda.

> ⚠️ **Pitfall**: `"Action": "iam:PassRole", "Resource": "*"` is a configuration found with surprising frequency in practice, because tutorials and quick-start documents use this form. This single line means "any role in the account can be attached to any service," and if the account has even one admin-level role, it is **effectively administrator permission**. When the exam says "grant PassRole with least privilege," the correct answer always includes a resource restriction or an `iam:PassedToService` condition.

`iam:PassRole` is **not recorded in CloudTrail as an independent event.** That is because passing a role is evaluated as *part of* a higher-level API call such as `lambda:CreateFunction` or `ec2:RunInstances`. So to audit "who passed which role," you should not look for an `iam:PassRole` event; you should look at the role ARN fields (`roleArn`, `iamInstanceProfile`, and so on) in the `requestParameters` of the compute creation event. Because of this property, PassRole abuse tends to be detected late, which makes it a permission where *prevention* (narrowing with policy) matters far more than detection.

## How a Permission Boundary Works

A Permission Boundary is a **second policy** attached to a User or Role. It defines the **maximum limit** of the permissions this principal can have. As we saw in day1, the effective permissions are an intersection.

```
Effective permissions = Identity policy (grant) ∩ Permission Boundary (ceiling)
```

The key is that **the Boundary itself grants no permissions**. It is only a ceiling saying "no matter how broad the Identity policy is, only up to here."

```json
// Example Permission Boundary to attach to developers
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowedServices",
      "Effect": "Allow",
      "Action": [
        "s3:*",
        "dynamodb:*",
        "lambda:*",
        "logs:*",
        "cloudwatch:*"
      ],
      "Resource": "*"
    }
  ]
}
```

A developer with this Boundary attached cannot use `iam:*` or `ec2:*` even if their own IAM policy has them, because they drop out of the Boundary intersection.

```
[ How a permissions boundary cuts the effective permissions ]

   What the Identity policy grants      What the permissions boundary allows
   ┌───────────────────────┐          ┌───────────────────────┐
   │ s3:*                  │          │ s3:*                  │
   │ dynamodb:*            │          │ dynamodb:*            │
   │ iam:*        ← danger │          │ lambda:*              │
   │ ec2:*                 │          │ logs:*                │
   └───────────────────────┘          └───────────────────────┘
               │                                  │
               └──────────── ∩ ───────────────────┘
                             │
                             ▼
                  Actual effective permissions
                  ┌───────────────────────┐
                  │ s3:*                  │
                  │ dynamodb:*            │
                  └───────────────────────┘
                  iam:*  → not in the boundary, dropped  ✂
                  ec2:*  → not in the boundary, dropped  ✂
                  lambda:*, logs:* → not in the Identity policy, dropped ✂
                     (the boundary does not "grant" permissions)
```

The last line of this figure is the point most often tested on the exam. Even if `lambda:*` is in the boundary, if it is not in the Identity policy you **cannot use Lambda.** A boundary is not a key that opens a door but the size of the door frame.

A boundary has several scope constraints, and these turn directly into exam questions.

| Item | Behavior of a permissions boundary |
|------|------------------|
| What it can be attached to | IAM **users** and **roles**. It cannot be attached to groups |
| Count | **One** per principal. You cannot stack several |
| Resource-based policies | An Allow in a resource-based policy that names the principal directly is documented as an exception to boundary evaluation |
| Service-linked roles | A boundary cannot be attached |
| Granting permissions | Never. It sets only a ceiling |
| Conditions/resource restrictions | Condition and Resource can be used inside the boundary policy too (it need not be a simple list of actions) |

The constraint "one boundary per principal" has a large effect on design. Even if you want to stack different boundaries per team, it is impossible, so organizations usually **fix the boundary as a small number of standard templates (for example, `dev-boundary`, `data-boundary`) and apply differences on the Identity policy side.** If you start making boundaries different for each person, the number of things to manage explodes, and eventually control collapses as someone approves a request to widen a boundary. The principle is to design boundaries *few, broad, and almost never changing*.

If you make use of the fact that a permissions boundary can also hold conditions, you can create controls beyond an "action list." For example, you can put an `aws:RequestedRegion` condition in the boundary to enforce "everything this principal creates must stay inside the Seoul Region," or pin down "resources tagged prod cannot be touched" with an `aws:ResourceTag/Env` condition. It may look like it overlaps with an SCP, but the target of application differs: an SCP applies to the whole account and a boundary only to the delegated principal, so when you need **a different ceiling per person within an account**, the boundary is the only answer.

## The Core of Safe Delegation: Forced Boundary Attachment

Now the real technique. You must give developers the permission to create roles but **force every role the developer creates to have a specific Boundary attached**. Otherwise, a developer can create an admin role with no Boundary.

```json
// Identity policy attached to developers (delegation permission)
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CreateRoleOnlyWithBoundary",
      "Effect": "Allow",
      "Action": ["iam:CreateRole", "iam:AttachRolePolicy", "iam:PutRolePolicy"],
      "Resource": "arn:aws:iam::*:role/dev-*",
      "Condition": {
        "StringEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::ACCOUNT:policy/dev-boundary"
        }
      }
    },
    {
      "Sid": "DenyBoundaryModification",
      "Effect": "Deny",
      "Action": ["iam:DeleteRolePermissionsBoundary", "iam:PutRolePermissionsBoundary"],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::ACCOUNT:policy/dev-boundary"
        }
      }
    }
  ]
}
```

The two Statements work together.

1. **Conditional allow of CreateRole**: With the `iam:PermissionsBoundary` condition key, creation is allowed only when the role the developer creates has `dev-boundary` attached. A role without a Boundary cannot be created.
2. **Blocking Boundary changes**: An explicit Deny blocks the act of removing the Boundary from a role the developer created or replacing it with another one.

If you set only condition 1 and omit 2, it is bypassed. A developer creates a role with the Boundary attached, then immediately removes that boundary with `iam:DeleteRolePermissionsBoundary`, and it becomes an unprotected role. So **enforcement at creation (Sid 1) + blocking changes (Sid 2)** must go as a pair. Also, if you do not block `iam:CreatePolicyVersion` too, the Boundary policy itself can be modified to punch a hole.

### Full Delegation Policy for Real Use

The two statements above are only a skeleton, and a delegation policy that is actually deployable must also have **self-defense statements**. Below is the finished form locked in four layers.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S1_CreateAndModifyOnlyBoundedRolesInNamespace",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:AttachRolePolicy",
        "iam:PutRolePolicy",
        "iam:DetachRolePolicy",
        "iam:DeleteRolePolicy"
      ],
      "Resource": "arn:aws:iam::111122223333:role/dev-*",
      "Condition": {
        "StringEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::111122223333:policy/dev-boundary"
        }
      }
    },
    {
      "Sid": "S2_ReadOnlyIamAndCleanup",
      "Effect": "Allow",
      "Action": ["iam:Get*", "iam:List*", "iam:DeleteRole", "iam:TagRole", "iam:UpdateRoleDescription"],
      "Resource": "arn:aws:iam::111122223333:role/dev-*"
    },
    {
      "Sid": "S3_PassOnlyBoundedRolesToApprovedServices",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::111122223333:role/dev-*",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": [
            "lambda.amazonaws.com",
            "ecs-tasks.amazonaws.com"
          ]
        }
      }
    },
    {
      "Sid": "S4_ProtectTheBoundaryItself",
      "Effect": "Deny",
      "Action": [
        "iam:DeleteRolePermissionsBoundary",
        "iam:DeleteUserPermissionsBoundary",
        "iam:CreatePolicyVersion",
        "iam:DeletePolicyVersion",
        "iam:SetDefaultPolicyVersion",
        "iam:DeletePolicy"
      ],
      "Resource": "arn:aws:iam::111122223333:policy/dev-boundary"
    },
    {
      "Sid": "S5_DenySwappingBoundaryForAnotherOne",
      "Effect": "Deny",
      "Action": ["iam:PutRolePermissionsBoundary", "iam:PutUserPermissionsBoundary"],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::111122223333:policy/dev-boundary"
        }
      }
    }
  ]
}
```

The specific bypass attempts each statement blocks are as follows.

| Sid | Bypass attempt blocked | Result if omitted |
|-----|----------------|--------------------|
| S1 | Creating a role without a boundary, manipulating roles outside `dev-` | The developer freely creates unprotected admin roles |
| S3 | Passing a strong role to an arbitrary service | Executing another role's permissions via PassRole |
| S4 | Modifying the boundary **policy document itself** | Changing the boundary to `"Action": "*"` and removing the ceiling |
| S5 | Replacing the boundary with **another, looser policy** | Attaching a `weak-boundary` the developer created to bypass it |

Why the `StringNotEquals` in S5 is paired with `Deny` connects directly to the condition operator discussion in day1. If you write "do not allow anything other than the specified boundary" as `Allow` + `StringNotEquals`, *that statement merely does not allow it*, and it passes if another Allow exists. A prohibition must always be expressed as a Deny.

> 🎯 **Scenario**: "The security team deployed the policy above, but a few days later an audit found that one role with the `dev-` prefix had permission to delete everything in S3. Was the boundary breached?" -> No. This situation is a result that occurred normally **because the boundary allowed `s3:*`**. A boundary is not "a device that blocks dangerous things" but "the ceiling of an allow list," and it does not block whatever the developer does inside the ceiling. The action needed here is to carve destructive actions (`s3:DeleteBucket`, `s3:DeleteObjectVersion`, and so on) out of the boundary policy with a Deny, or to exclude prod resources with tag and resource conditions. **The proposition "we attached a boundary, so it is safe" does not hold unless you review the contents of the boundary.**

### CLI for Operating Boundaries

```bash
# Attach the boundary together when creating the role (creation without a boundary is blocked by the S1 condition)
aws iam create-role \
  --role-name dev-payments-lambda \
  --assume-role-policy-document file://trust-lambda.json \
  --permissions-boundary arn:aws:iam::111122223333:policy/dev-boundary

# Attach a boundary to an existing role later
aws iam put-role-permissions-boundary \
  --role-name dev-payments-lambda \
  --permissions-boundary arn:aws:iam::111122223333:policy/dev-boundary

# Check that the boundary is actually attached: look at the PermissionsBoundary field
aws iam get-role --role-name dev-payments-lambda \
  --query 'Role.PermissionsBoundary'

# Reverse lookup of which principals the boundary policy is attached to
aws iam list-entities-for-policy \
  --policy-arn arn:aws:iam::111122223333:policy/dev-boundary \
  --entity-filter Role

# Calculate whether specific actions pass with the boundary applied (pre-deployment verification)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/dev-payments-lambda \
  --action-names iam:CreateRole s3:GetObject \
  --resource-arns "*"
```

Finding roles that have no boundary attached is a basic governance check item. Periodically list the roles whose `PermissionsBoundary` in `get-role` is empty, and treat the existence of such a role inside the `dev-` namespace as an incident in itself.

For a boundary, "**is it too broad**" matters as much as "is it attached." IAM Access Analyzer's unused access analysis finds the actions and services that were not actually called over a past period, so it becomes the evidence for narrowing boundaries and Identity policies empirically. It is a tool that refutes with data the practice of "leave it open wide because we might need it in theory." This is the direction of the correct answer to an exam question like "to identify excessively granted permissions and reduce them to least privilege."

## Isolating with Namespaces

It is worth noting that the policy above restricts `Resource` to `role/dev-*`. Developers can create only `dev-`-prefixed roles. When you **isolate the resource namespace with a naming convention** like this, developers cannot touch the security team's `security-` roles or `admin-` roles.

```
Developer permission scope:
  Can create: role/dev-*, policy/dev-*
  No access:  role/security-*, role/admin-*, role/prod-*
```

This pattern is the standard design for **self-service IAM**. AWS calls it "delegating responsibility with permissions boundaries." A more sophisticated version extends to ABAC (attribute-based access control), combining `aws:PrincipalTag` and `aws:RequestTag` so that "developers can create only roles carrying their own team's tag." We will cover that in day4.

## Permission Boundary vs. SCP: What Is Different

Both are "ceilings," but their scope of application differs. They are often compared on the exam.

| Category | Permission Boundary | SCP |
|------|---------------------|-----|
| Attached to | An individual User/Role | OU/Account |
| Scope of application | That one principal | The whole account (every principal except root) |
| Grants permissions | No (ceiling only) | No (ceiling only) |
| Managed by | Account administrator/delegate | Organizations management account |
| Main use | Blocking privilege escalation when delegating to developers | Organization-level guardrails |
| Effect on root | No effect (an administrator can change it) | Also applies to member account root |

The key difference: **a Boundary is "this person's ceiling," and an SCP is "the ceiling for this whole account."** The two are used together to form defense in depth. The effective permissions are the intersection of SCP ∩ Boundary ∩ Identity.

Delegating permissions while preventing the delegate from exceeding the delegator is, in security, the problem of **constrained delegation**. The setuid bit of operating systems, Kerberos constrained delegation, and capability-based security models all solve the same problem. The core invariant is "delegated permissions ⊆ permissions the delegator is able to delegate." A Permission Boundary is a tool that declaratively enforces this invariant at the IAM level.

### Comparing the Five Policy Types at a Glance

The exam often has you compare **five at once**, not two. Here is a single table.

| Category | SCP | Permissions boundary | Identity policy | Resource policy | Session policy |
|------|-----|-----------|---------------|-------------|-----------|
| Attached to | Root/OU/account | Users, roles | Users, groups, roles | Resources (buckets, keys, queues) | Passed at the AssumeRole call |
| Managed by | Organization management account | Account IAM administrator | Account IAM administrator | **The account that owns the resource** | The code that calls AssumeRole |
| Grants permissions | No (ceiling) | No (ceiling) | **Yes** | **Yes** | No (ceiling) |
| Lifetime | Permanent | Permanent | Permanent | Permanent | Only for that session |
| Member account root | Applies | N/A | N/A | Applies | N/A |
| Management account | **Does not apply** | Applies normally | Applies normally | Applies normally | Applies normally |
| Service-linked roles | Does not apply | Cannot be attached | (managed by the service) | Applies normally | N/A |
| In cross-account | Applies to the caller's account | Applies to the caller's account | Required on the caller side | **Required on the resource side** | Applies to the caller's session |
| Typical use | Organization guardrails | Blocking privilege escalation on delegation | Actual permission granting | Opening cross-account access | Minimizing temporary permissions |

The fact that **only two cells in the "grants permissions" row are Yes** reconfirms the key point of day1. The other three cannot create new permissions no matter how broadly they are written. The wrong answer "I put `s3:*` in the boundary, so I can use S3" is filtered out here.

### Procedure to Confirm Whether the Boundary Is the Culprit

When an AccessDenied occurs, there are signals for putting the permissions boundary on the suspect list, and an order for checking.

```
[ Determine "is it the boundary" within 5 minutes ]

(1) Does the error message contain the phrase "permissions boundary"?
     Yes → confirmed. Skip to (4)
     No  → (2)

(2) Is a boundary even attached to that principal?
     aws iam get-role --role-name X --query 'Role.PermissionsBoundary'
     Empty → the boundary is not the culprit. Move to SCPs and resource policies

(3) Is the blocked action in the Identity policy but not in the boundary?
     → If so, the boundary is the culprit (typical symptom: "I attached the policy but it doesn't work")

(4) Reproduce with the simulator
     aws iam simulate-principal-policy \
       --policy-source-arn <principal ARN> \
       --action-names <blocked action> --resource-arns <target>
     → Check which document filtered it in MatchedStatements

(5) There are two courses of action
     · The action is truly needed → widen the boundary policy (approval required)
     · It is not needed           → the boundary did its job. Re-examine the request
```

It is important to make the second branch of (5) the default. That the boundary blocked something means **it tried to do something outside the scope that the delegation design set**, and in most cases the correct answer is not to widen the boundary but to redesign that task inside the boundary or move it to a separate approval path.

The worst response to a symptom blocked by a boundary is "temporarily attach `AdministratorAccess` to the developer and remove it later." If a boundary is attached, it is still blocked even when you attach `AdministratorAccess` (intersection), so a hurried administrator ends up going down the path of **removing the boundary**. And that boundary usually does not get reattached. That is why, when you deploy a boundary, you must also create a formal request path for widening it. A control with no bypass path is eventually bypassed by having the control itself removed.

## Summary

The essential risk of delegating permissions is that the permission to manipulate IAM leads to privilege escalation. A Permission Boundary becomes safe only when these four work as a set: (1) it defines the ceiling of permissions to give developers, (2) it forces that Boundary to be attached to every role developers create, (3) it blocks changing or deleting the Boundary, and (4) it isolates the resource namespace by prefix. If any one is missing, it gets bypassed. On top of that, you must add (5) a statement that narrows `iam:PassRole` with the resource and `iam:PassedToService`, so that the third escalation branch is closed too.

The 2019 Capital One breach showed that "the scope of delegation" is "the scope of damage." The attacker used SSRF through a misconfigured WAF to reach EC2 instance metadata and obtained the temporary credentials of that instance's role, then used those credentials to list S3 buckets and download data. Information on roughly 106 million US and Canadian credit card applicants was affected. What was decisive here was that **the instance role had broader S3 permissions than necessary**. Blocking the attack path (SSRF) is important, but if the permissions in hand when that path opened had been narrow, the damage would have been far smaller. A permissions boundary works at exactly this point: if you apply a boundary to a workload role and lower the ceiling, then even if that role is stolen it cannot go outside the boundary. When the exam asks "to minimize damage if credentials are stolen," the answer is not detection but *reducing permissions*.

Much more common inside organizations is the **drift of self-service IAM** with no malice. It starts with "let's let developers create Lambda roles themselves" and a narrow delegation policy is deployed, but each time a deployment is blocked, one exception is added. The `Resource` of `iam:PassRole` changes to `*`, `iam:*` goes into the boundary temporarily and stays, and a role with no boundary is issued to an urgent team. After a few quarters, only the shape of the original control remains. There are three practical devices to stop this drift: **manage the boundary policy as IaC so changes pass through code review**, put a policy diff check of the `check-no-new-access` kind as a gate in the deployment pipeline, and periodically pull the list of roles without a boundary to make exceptions visible.

### One-Line Summary

The risk of IAM delegation comes from the equation "the permission to manipulate IAM = every permission," and the escalation paths are three branches: (1) expanding your own policy, (2) creating a new identity or modifying a trust policy, and (3) passing a strong role to compute with `iam:PassRole`. A permissions boundary is a **ceiling** attached only one per principal, leaving only the intersection with the Identity policy and granting no permissions. Safe delegation holds only when five go as a set: (1) enforcing the boundary at creation with the `iam:PermissionsBoundary` condition, (2) a Deny on removing or replacing the boundary, (3) a Deny on version manipulation of the boundary policy document itself, (4) `role/dev-*` namespace isolation, and (5) restricting `iam:PassRole` with the resource and `iam:PassedToService`. A boundary is an individual's ceiling and an SCP is an account's ceiling; the two are not substitutes. When blocked, narrow down in the order error message -> whether the boundary is attached -> the set difference between the Identity policy and the boundary -> the simulator, and the default response is not to widen the boundary but to redesign the request inside the boundary.

In the next article, we move up one level to **AWS Organizations and SCPs**, which control entire accounts. If the Boundary is an individual's ceiling, the SCP is the account's ceiling, and the two meet to complete multi-account governance.

---

## 📝 Practice Questions

**Question 1.** A company wants to grant developers the `iam:CreateRole` and `iam:AttachRolePolicy` permissions. What must be added to delegate while preventing privilege escalation?

A) Enforce MFA on developer accounts  
B) Enforce, as a condition on CreateRole, attaching a specific Permission Boundary, and Deny changing the Boundary  
C) Monitor role creation after the fact with CloudTrail  
D) Give developers read-only permissions only  

**Answer: B**  
Explanation: The key mechanism for blocking privilege escalation is to enforce Boundary attachment with the `iam:PermissionsBoundary` condition key and, at the same time, block the actions that detach or change that Boundary with an explicit Deny. MFA or after-the-fact monitoring does not block escalation in advance, and read-only does not achieve the delegation purpose (creating roles).

---

**Question 2.** A developer with a Permission Boundary attached tries to remove the Boundary from a role they created. What is the most direct way to prevent this?

A) Block all IAM actions with an SCP  
B) Add `iam:DeleteRolePermissionsBoundary` as an explicit Deny in the developer policy  
C) Make the role read-only  
D) Set the Boundary more broadly  

**Answer: B**  
Explanation: Enforcing Boundary creation alone is not enough; you must block `iam:DeleteRolePermissionsBoundary`, which removes the Boundary after creation, and `iam:PutRolePermissionsBoundary`, which changes it, with an explicit Deny to prevent bypass. Blocking all IAM with an SCP makes delegation itself impossible, and the others do not solve the problem.

---

**Question 3.** Which statement about the difference between a Permission Boundary and an SCP is correct?

A) A Boundary grants permissions and an SCP restricts permissions  
B) A Boundary is the upper limit for an individual principal, and an SCP is the upper limit for an entire account  
C) Both apply equally to the root user of a member account  
D) Developers can manage SCPs themselves  

**Answer: B**  
Explanation: A Permission Boundary is the permission upper limit for a single specific User/Role, while an SCP is applied to an OU/Account and sets the upper limit for all principals in the account. Neither grants permissions; they only set an upper limit. An SCP also applies to the member account root while a Boundary does not, and SCPs are managed only in the Organizations management account.

---

**Question 4.** What is the most appropriate reason for restricting `Resource` so that developers can create only roles matching the `role/dev-*` pattern?

A) To speed up role creation  
B) To isolate the namespace so developers cannot touch roles of the security or operations teams (for example, role/admin-*)  
C) To reduce the number of roles  
D) To allow the Boundary to be omitted  

**Answer: B**  
Explanation: Restricting the resource by name prefix prevents developers from creating or modifying highly privileged roles outside their own namespace (`dev-`). This is the standard pattern for implementing isolation in self-service IAM, and it is used together with the Boundary rather than replacing it.

---

**Question 5.** We want to calculate the effective permissions of a role created by a developer. The role has the Identity policy `s3:*, ec2:*` and the Permission Boundary `s3:*, dynamodb:*`, and the account SCP allows only `s3:*`. What are this role's effective permissions?

A) All of `s3:*, ec2:*, dynamodb:*`  
B) Only `s3:*`  
C) `s3:*, dynamodb:*`  
D) No permissions at all  

**Answer: B**  
Explanation: The effective permissions are the intersection of SCP ∩ Boundary ∩ Identity. The SCP allows only `s3:*`, the Boundary allows `s3:*` and `dynamodb:*`, and the Identity policy allows `s3:*` and `ec2:*`. Only `s3:*` is common to all three sets. `ec2` is not in the SCP or Boundary, and `dynamodb` is not in the SCP or Identity policy, so both are dropped.
