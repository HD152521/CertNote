# Day 2 - Permission Boundary and Delegation: The Safe Way to Grant Permissions to Developers

As organizations grow, the security team can't create every IAM role and policy in one place. Developers need to create their own Lambda execution roles, EC2 instance roles, and CI/CD deployment roles to move quickly. But here lies a critical risk: **a developer given IAM permissions can create a role with AdministratorAccess for themselves, causing privilege escalation**.

**Permission Boundary** tackles this problem head-on. In day1, we glanced at this concept as "a ceiling on permissions"—today we'll handle it practically in real delegation scenarios. Blocking privilege escalation is a core topic that appears in nearly every Specialty exam.

## Anatomy of a Privilege Escalation Attack

Before we can defend, we need to understand how the attack works. Suppose a developer is given `iam:CreateRole`, `iam:AttachRolePolicy`, and `iam:PassRole` permissions. Their intent is "I want to create a role for my Lambda." But with these permissions, the following becomes possible:

```
1. Create new role:           iam:CreateRole
2. Attach admin policy:        iam:AttachRolePolicy → arn:aws:iam::aws:policy/AdministratorAccess
3. Switch to that role:        sts:AssumeRole or PassRole to Lambda
→ Result: Developer becomes account administrator
```

This is a textbook **IAM privilege escalation**. The delegated permissions themselves are legitimate, but when combined, they exceed the developer's authority.

> 💡 **Related Theory**: This attack is exemplified in security researcher Spencer Gietzen's (Rhino Security Labs) 2018 documentation of **21 AWS IAM privilege escalation paths**. Known paths include `iam:CreatePolicyVersion`, `iam:SetDefaultPolicyVersion`, `iam:PassRole + lambda:CreateFunction`, `iam:AttachUserPolicy` and others. The common principle: "permissions to manipulate IAM" equals "permissions to obtain all permissions." That's why permissions handling IAM itself must be bounded.

## How Permission Boundary Works

Permission Boundary is a **second policy** attached to a User or Role. It defines the **maximum limit** of permissions this principal can have. The effective permission is the intersection, as we saw in day1.

```
Effective permission = Identity policy (grants) ∩ Permission Boundary (ceiling)
```

The key point: **the Boundary itself grants no permission**. It's simply a ceiling saying "no matter how broad the Identity policy is, access ends here."

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

A developer with this Boundary attached cannot use `iam:*` or `ec2:*` even if their own IAM policy includes them, because those fall outside the Boundary intersection.

## Core Safe Delegation: Mandatory Boundary Attachment

Now for the real technique. When giving developers role creation permissions, you must **force every role they create to have a specific Boundary**. Otherwise, developers can create admin roles without any Boundary.

```json
// Identity policy to attach to developer (delegation permissions)
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

The two Statements work together:

1. **Conditional CreateRole Allow**: Using the `iam:PermissionsBoundary` condition key, role creation is permitted only when `dev-boundary` is attached to the role the developer creates. Roles without Boundary cannot be created.
2. **Boundary Modification Block**: An explicit Deny prevents developers from removing or changing the Boundary on their created roles.

> ⚠️ **Common Trap**: If you only apply condition 1 and skip 2, it can be bypassed. A developer can create a role with the Boundary attached, then immediately use `iam:DeleteRolePermissionsBoundary` to strip it away, leaving an unprotected role. That's why **creation enforcement (Sid 1) + modification block (Sid 2)** must go together. Also, if you don't block `iam:CreatePolicyVersion`, developers can modify the Boundary policy itself to create loopholes.

## Isolation Through Namespacing

Notice how the `Resource` in the policy above is restricted to `role/dev-*`. Developers can only create roles with the `dev-` prefix. By **isolating resource namespaces through naming conventions**, developers cannot touch the security team's `security-` roles or `admin-` roles.

```
Developer's permission scope:
  Can create: role/dev-*, policy/dev-*
  Cannot access: role/security-*, role/admin-*, role/prod-*
```

> 🔍 **Deeper Insight**: This pattern is the standard design for **self-service IAM**. AWS calls it "delegating responsibility with permissions boundaries." A more sophisticated version combines `aws:PrincipalTag` and `aws:RequestTag` to extend this to ABAC (attribute-based access control), where "developers can only create roles tagged with their team's tag." We'll cover this in day4.

## Permission Boundary vs SCP: What's Different?

Both set ceilings, but their scope differs. Exams frequently compare them.

| Aspect | Permission Boundary | SCP |
|--------|---------------------|-----|
| Attached to | Individual User/Role | OU/Account |
| Scope | That single principal | Entire account (all principals except root) |
| Permission Grant | No (ceiling only) | No (ceiling only) |
| Managed by | Account admin / delegator | Organizations management account |
| Primary Use | Blocking privilege escalation during developer delegation | Organization-wide guardrail |
| Effect on root | No effect (admin can change) | Applies even to member account root |

Key difference: **Boundary is "this person's ceiling," SCP is "this account's ceiling."** Used together, they form multi-layered defense. Effective permission is the intersection of SCP ∩ Boundary ∩ Identity.

> 💡 **Related Theory**: Delegating authority while preventing the delegatee from exceeding the delegator is the **constrained delegation** problem in security. Operating system setuid bits, Kerberos constrained delegation, and capability-based security models all solve the same problem. The core invariant: "delegated authority ⊆ authority the delegator can delegate." Permission Boundary is the tool that declaratively enforces this invariant at the IAM level.

## Summary

The core risk of delegation is that IAM manipulation permissions lead to privilege escalation. Permission Boundary works safely when it (1) defines the ceiling for permissions developers receive, (2) forces that Boundary on every role they create, (3) blocks Boundary removal and changes, and (4) isolates resource namespaces by prefix—all four work as a unit. Omit even one and it can be bypassed.

Next, we'll zoom out and cover **AWS Organizations and SCP**, which control the entire account. While Boundary is an individual's ceiling, SCP is an account's ceiling, and together they complete multi-account governance.

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
