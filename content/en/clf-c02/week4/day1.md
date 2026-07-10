# Day 1 - The Shared Responsibility Model in Depth and IAM Fundamentals

Security is the domain with the largest weight on the exam (30%). But before anything else, there's one question worth pinning down: "Who is responsible for cloud security?" The answer is "both." AWS and the customer **divide** the responsibility for security between them. Drawing that dividing line precisely is what the **Shared Responsibility Model** is about. Today we'll sharpen our understanding of that model once more, then move into **IAM (Identity and Access Management)** — the core tool for the parts the customer is responsible for.

We touched on the shared responsibility model briefly last week, but in the security domain this model is the starting point for every answer. If you can answer "Does AWS handle this, or do I?", you'll solve a large share of the exam questions.

## The Shared Responsibility Model: "of the cloud" vs "in the cloud"

There's a famous one-line summary. AWS is responsible for **security OF the cloud (the cloud itself)**, and the customer is responsible for **security IN the cloud (what's inside it)**.

- **AWS's responsibility (Security OF the Cloud)**: physical security of data centers, server hardware, network infrastructure, the virtualization layer, and the underlying software of managed services.
- **Customer's responsibility (Security IN the Cloud)**: the data itself, data encryption settings, OS and application patching (in the case of EC2), network firewall rules, and **access management through IAM**.

| Item | Responsible party |
|------|-----------|
| Data center access control | AWS |
| OS patching of EC2 instances | Customer |
| Disk destruction when decommissioning physical servers | AWS |
| Access permissions for data uploaded to an S3 bucket | Customer |
| IAM user/password policies | Customer |
| Hypervisor (virtualization layer) security | AWS |

> 💡 **Related theory**: The responsibility boundary shifts depending on the service type. With EC2 (IaaS), OS patching is on the customer, but as you move toward managed services like RDS and Lambda, AWS takes on more of the operational responsibility. "The more managed the service, the greater AWS's responsibility" is the key pattern. That said, **data and access permissions are always the customer's responsibility, regardless of the service**.

## What Is IAM?

Among the customer's responsibilities, the one dealt with most often is deciding "who can do what." The global service that handles this is **AWS IAM (Identity and Access Management)**. IAM is free, and it's a **global service** spanning all Regions (you don't create it per Region).

The two big questions IAM addresses:

- **Authentication**: "Who are you?" — verifying that a user is who they claim to be.
- **Authorization**: "What are you allowed to do?" — deciding which actions to permit.

## The Four Core Components of IAM

To understand IAM, you need to distinguish four things: users, groups, roles, and policies.

**1. User**: A credential that maps to a single person or application. It holds a login password or access keys.

**2. Group**: A unit for bundling users together. For example, if you grant permissions to a "Developers" group, every user in that group gets the same permissions. Managing permissions at the group level rather than handing them out to each person individually is far cleaner. (A group can only contain users; you can't nest a group inside a group.)

**3. Role**: A credential with no password or access keys, used to **lend temporary permissions**. The classic case: when an EC2 instance needs to access S3, you attach a role to the EC2 instance so it can obtain permissions safely without embedding access keys in the code.

**4. Policy**: A JSON document that defines permissions. It states "which Action, on which Resource, is Allowed or Denied." You grant permissions by attaching policies to users, groups, or roles.

```
[Policy]  ── defines the permission rules (JSON)
      │ attach
      ▼
[User/Group/Role] ── applies permissions to an actual credential
```

> 💡 **Related theory**: If a question asks "An EC2 instance needs to access S3 — what's the secure way to grant permissions?", the answer is almost always an **IAM Role**. Hardcoding access keys into code or onto the instance is the worst possible choice from a security standpoint.

## Protecting the Root User and MFA

When you first create an AWS account, a **root user** is created. This account can do everything as the highest-privilege identity, so if it's compromised, it's a catastrophe. That's why AWS strongly recommends the following.

- **Do not use** the root user for day-to-day work. Create and use an IAM user instead.
- Be sure to enable **MFA (Multi-Factor Authentication)** on the root user.
- Do not create root access keys; if any exist, delete them.

**MFA (Multi-Factor Authentication)** is a method that requires, in addition to a password (something you know), a one-time code from a phone app or a security key (something you have). Even if a password leaks, no one can log in without the second factor, so security is greatly strengthened.

> 💡 **Related theory**: When the exam asks for "the best first step to strengthen account security," the answer is almost always the bundle of **enabling MFA on the root user + refraining from using root + creating an IAM user**.

## The Principle of Least Privilege

The golden rule of IAM permission design is the **principle of least privilege**. That is, grant "only as much as the job strictly requires." Rather than granting broadly at first and narrowing later, it's safer to start narrow and add permissions when needed.

| Bad example | Good example (least privilege) |
|---------|--------------------|
| Administrator permissions for every user | Only the service permissions each role needs |
| Granting full S3 access | Only read access to a specific bucket |
| Handing out permissions ad hoc per person | Standardizing with groups/policies |

> 💡 **Related theory**: The answer to a question asking for "the way to grant permissions that fits security best practices" is usually the principle of least privilege. "Permissions broader than necessary" is always a wrong-answer signal.

## Wrapping Up

Today we revisited the shared responsibility model — the starting point of security — and looked at IAM, the core tool of the customer's responsibilities. Distinguishing the roles of users, groups, roles, and policies; protecting the root user with MFA; and the principle of least privilege — these four things cover 90% of IAM questions.

In the next article, we'll lay out the security services beyond IAM — WAF, Shield, GuardDuty, Inspector, Macie, and Security Hub — each with a one-line identity. Their names are similar and easy to confuse, but if you group them by "what threat does it stop," they become easy to memorize.

---

## 📝 연습 문제

**문제 1.** In the shared responsibility model, which of the following is always the **customer's responsibility**?

A) Physical security of the data center  
B) Security of the hypervisor (virtualization layer)  
C) Configuring access permissions for data stored in S3  
D) Maintenance of server hardware  

**정답: C**  
해설: Data and its access permissions are always the customer's responsibility ("in the cloud"), regardless of the service used. Data center physical security, the hypervisor, and hardware maintenance all fall in the "of the cloud" area that AWS is responsible for.

---

**문제 2.** An application running on an EC2 instance needs to access an S3 bucket. What is the most secure way to grant permissions?

A) Hardcode the access keys into the application code  
B) Attach an IAM Role to the EC2 instance  
C) Use the root user's credentials  
D) Grant administrator permissions to all users  

**정답: B**  
해설: An IAM Role safely provides temporary permissions to EC2 without exposing access keys. Hardcoding keys into code or using root credentials carries high security risk, and granting administrator permissions violates the principle of least privilege.

---

**문제 3.** Which of the following is NOT a best practice for strengthening AWS account security?

A) Enable MFA on the root user  
B) Perform daily work with an IAM user instead of root  
C) Create root user access keys and use them for automation  
D) Grant permissions according to the principle of least privilege  

**정답: C**  
해설: It is recommended not to create root access keys, and if compromised they put the entire account at risk. Enabling MFA, refraining from using root in favor of an IAM user, and the principle of least privilege are all correct best practices.

---

**문제 4.** What is the most appropriate way to efficiently grant and manage the same permissions across multiple IAM users?

A) Write a separate policy individually for each user  
B) Attach a policy to an IAM group and add users to the group  
C) Consolidate all users into the root user  
D) Create a separate role for each user  

**정답: B**  
해설: Granting a policy to a group gives every user in the group the same permissions consistently, making management simple. Individual per-user policies are cumbersome to manage, consolidating into root is impossible and dangerous, and roles are for temporary permission delegation — not a tool for standardizing user permissions.

---

**문제 5.** Which of the following statements about IAM is correct?

A) IAM is a Regional service that must be configured separately per Region  
B) Using IAM incurs an additional charge  
C) IAM is a global service and there is no additional charge to use it  
D) IAM policies can only define Allow  

**정답: C**  
해설: IAM is a global service spanning all Regions, and there is no additional charge for using it. It does not require per-Region configuration, and policies can define not only Allow but also explicit Deny.

---
