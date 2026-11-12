# Day 1 - The Shared Responsibility Model in Depth and IAM Fundamentals

## 📌 Key Takeaways

- Cloud security is **divided** between AWS and the customer — that boundary line is the **Shared Responsibility Model**.
- AWS is in charge of security **of the cloud** itself; the customer is in charge of security **in the cloud**.
- **Data and access permissions are always the customer's responsibility, whatever the service.** The more managed the service, the greater AWS's share.
- The core tool for the customer's side is **IAM** — a free, global service made up of four parts: users, groups, roles, and policies.
- **The root user is not for everyday use and requires MFA**, and permissions follow the **principle of least privilege**: start narrow and widen only when needed.

## What Was Security Like Before the Cloud?

Today we weigh "how far does AWS go for me," but before the cloud there was nothing to weigh. **Everything was your job.**

In the days when a company bought its own servers and kept them in a server room, a security officer's to-do list looked like this.

- Put a lock on the server room door and record who came and went
- When hardware broke, swap the parts, and when retiring it, physically destroy the disks
- Apply operating system security patches yourself, and buy and configure firewall equipment
- Build the login and permissions for our own programs running on top of all that

The problem was that most of this list had **nothing to do with the company's core business**. A company that builds an online shop wrestles with the server room's air conditioner. Doing it well goes unnoticed, and doing it badly even once causes an incident.

The cloud cut this list in half. **The lower half (buildings, power, hardware, virtualization) is taken over entirely by AWS, and the upper half (the data I uploaded and the settings I made) stays with the customer.** That cut line is exactly today's topic, the shared responsibility model.

The shared responsibility model is neither a claim that "AWS does all the security" nor a claim that "the cloud is dangerous." It is closer to **nailing down the boundary of responsibility in advance**. That is why the exam asks about this boundary so persistently.

## The Shared Responsibility Model: "of the cloud" vs "in the cloud"

Security is the domain with the largest weight on the exam (30%), and the shared responsibility model is the starting point for every answer in it. If you can answer "Does AWS handle this, or do I?", you will solve a large share of the exam questions. The most famous one-line summary goes like this — AWS is responsible for **security OF the cloud (the cloud itself)**, and the customer is responsible for **security IN the cloud (what's inside it)**.

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

The responsibility boundary shifts depending on the service type. With EC2 (IaaS), OS patching is on the customer, but as you move toward managed services like RDS and Lambda, AWS takes on more of the operational responsibility. "The more managed the service, the greater AWS's responsibility" is the key pattern. That said, **data and access permissions are always the customer's responsibility, regardless of the service**.

### Understanding the Responsibility Boundary Through an Apartment

The analogy that works best is an apartment building.

- **The building itself** — exterior walls, elevators, access control at the shared entrance, fire safety equipment. This is the **management office's** job.
- **Inside your own home** — what you set as the door lock password, whether you put valuables in a safe or leave them on the dining table, whether you tell a friend the password. This is **entirely your** job.

No matter how excellent the management office is, if you leave the front door open when you go out, a burglar can get in. And that is not the management office's fault.

| Apartment | AWS |
|--------|-----|
| Building structure, exterior walls, fire safety equipment | Data center buildings, power, cooling |
| Shared-entrance access control, security desk | Physical access control of the data center |
| Plumbing and electrical wiring | Server hardware, network infrastructure |
| The structure that divides floors and units | Hypervisor (virtualization layer) |
| **My home's door lock password** | **IAM users, passwords, MFA** |
| **Valuables kept inside the home** | **Data uploaded to S3 and EBS** |
| **Whom I make a copy of the key for** | **Access permission policies** |

Notice that the three bolded rows at the bottom are all the customer's responsibility.

### The Line Moves Depending on the Type of Service

The boundary is not a fixed wall but **a line that moves up and down depending on the type of service**. The more there is for you to handle directly, the larger the customer's share; the more a service takes care of things on its own, the larger AWS's share.

| How I use it | Example | OS patching | Engine/runtime management | My data and permissions |
|---------------|------|--------------|-----------------|-----------------|
| Operating a virtual server myself | EC2 | Customer | Customer | Customer |
| Managed database | RDS | AWS | AWS | Customer |
| Running only code, with no servers | Lambda | AWS | AWS | Customer |
| Using a finished storage service | S3 | AWS | AWS | Customer |

Scan the rightmost column of the table from top to bottom. **It never changes to "AWS" on any row.** Whatever service you use, data and access permissions remain the customer's responsibility to the end. This one line is the most widely applicable piece of today's material for deciding exam answers.

> ⚠️ **Pitfall**: An option such as "If you use a managed service, you don't need to worry about security" is wrong. With RDS, AWS patches the engine, but **who can connect and whether to encrypt the data are still decided by the customer**. "S3 is operated by AWS, so AWS is also responsible for data leaks" is wrong for the same reason.

An online education startup backed up its students' materials to S3 and, for development convenience, briefly opened the bucket as "anyone can read" — and then forgot about it. Over time the backup files were exposed to the outside and it became an incident. There was nothing wrong with the AWS infrastructure at that point — the data center, the virtualization layer, and the S3 service itself were all normal. The cause was **a single setting the customer had changed**, and the responsibility lay entirely with the customer. This is why the shared responsibility model should be read not as "who to blame" but as "a list of things I need to check."

AWS guards the building, and I lock my own front door. Handing off building management made things far easier, but it does not extend to locking my own door for me.

## What Is IAM?

Among the customer's responsibilities, the one dealt with most often is deciding "who can do what," and the service in charge of this is **AWS IAM (Identity and Access Management)**.

- IAM is **free**, and it is a **global service** spanning all Regions (you do not create it separately per Region).
- **Authentication**: "Who are you?" — verifying that the user is who they claim to be.
- **Authorization**: "What can you do?" — deciding which actions to allow.

### Why Is IAM Needed?

When you first create an AWS account, there is just one account with the highest privileges. When you use it alone, there is no problem. But as the team grows, this happens.

- A new developer joins and needs to connect to a server → you tell them the account password
- The accounting person needs to view invoices → you tell them the same password
- One of them leaves the company → **you change the password and tell everyone who remains again**

It is like keeping a single master key in the office and having everyone copy it. You cannot tell who came in and when, and if even one person loses a key, everyone is at risk.

IAM is a system that **replaces this master key with a different card key for each person and designates separately which doors each card opens**. The accounting person's card opens only the invoice room, and when someone leaves, you only need to suspend that one card.

### Authentication and Authorization Are Different Things

These two words always accompany explanations of IAM and are easy to confuse, so we separate them in a table.

| Category | Authentication | Authorization |
|------|---------------------|--------------------|
| What it asks | "Who are you?" | "Are you allowed to do that?" |
| Means of verification | Password, access key, MFA code | Allow/deny written in a policy |
| Building analogy | Tap the pass and get through the lobby | The floors and rooms that pass opens are predetermined |
| If it fails | You cannot log in at all | You logged in but get a "no permission" error |

If the login succeeded but only a specific action was refused, authentication passed and you were blocked at authorization.

## The Four Core Components of IAM

To understand IAM, you need to distinguish four things: users, groups, roles, and policies.

- **1. User**: A credential corresponding to one person or one application. It holds a login password or access keys.
- **2. Group**: A unit that bundles users together.
  - Example: if you grant permissions to the "Developers" group, every user in that group gets the same permissions.
  - It is much cleaner to manage by group than to give permissions to each person one by one.
  - A group can contain only users; you cannot put a group inside a group.
- **3. Role**: A credential with no password or access keys, used to **lend temporary permissions**.
  - Example: when an EC2 instance needs to access S3, if you attach a role to the EC2 instance, it obtains permissions safely without embedding access keys in the code.
- **4. Policy**: A JSON document that defines permissions.
  - It states "which action (Action), on which resource (Resource), to allow (Allow) or deny (Deny)."
  - You grant permissions by attaching a policy to a user, group, or role.

```
[Policy]  ── defines the permission rules (JSON)
      │ attach
      ▼
[User/Group/Role] ── applies the permissions to the actual credentials
```

If a question asks, "An EC2 instance needs to access S3 — what is the safe way to grant permissions?", the answer is almost always an **IAM role**. Hardcoding access keys into code or onto an instance is the worst choice from a security standpoint.

### What Is the Difference Between a User and a Role?

This is a pair among the four components that is easy to confuse.

| Category | User | Role |
|------|-------------|-----------|
| Who it is for | One specific person (or app) | Whoever needs it at the moment — a service, an app, an external user |
| Credentials | **Holds** a password and access keys | **Has no** fixed credentials; borrowed when needed |
| Validity period | Lasts until deleted | Temporary — expires after a set time |
| Analogy | An employee ID issued to a staff member | A temporary visitor pass lent out at the visitor desk |
| Typical use | A person's console login | EC2 accessing S3, delegating permissions between services |

The key difference is "do you keep it all the time, or borrow it for a while." An employee ID is always in your wallet, but a temporary pass is returned when your business is done. A credential that gets returned is far safer, because even if it leaks it soon becomes useless.

### A Policy Does Not Only List Allows

You do not need to memorize the document syntax; holding on to the three points below is enough at this exam level.

- **The default is deny.** A user with no policy attached can do nothing. Permissions exist only when explicitly allowed.
- **An explicit Deny always wins.** If one side allows and another side denies, the result is deny.
- Policies can be attached to a user, group, or role, and several can be layered together.

```
[No policy at all]       → can do nothing (the default is deny)
[Allow policy attached]  → only that action is possible
[Both allow and deny]    → deny (explicit deny takes precedence)
```

### Why Use Groups?

With three users, it is fine to give permissions one person at a time. With thirty, the story changes. Suppose you attached the same permissions separately to each of 12 developers. When the whole development team needs a new permission, you have to repeat the same job 12 times, and if you miss one person, the "Why does it only fail for me?" begins. Conversely, if you attach a single policy to the **"Developers" group, a change is done in one step**, and a new team member only needs to be added to the group.

> ⚠️ **Pitfall**: A group can contain **only users**. You cannot put another group inside a group to create a hierarchy. Also, you cannot log in with a group name, or have access keys issued to a group — a group is just a box that bundles permissions and is not a credential.

A logistics company with about 40 employees moved to AWS and, for convenience, initially had the whole team share a single account. One day a server was deleted by a deployment mistake, but when they opened the records, every action was logged under the same account name, so **it was impossible to tell who had done what**. Afterward the company created an IAM user for every person and split permissions through job-based groups. Sharing an account is dangerous not only because the permissions are broad but because **accountability becomes blurred**.

A user is an individual who has been issued an employee ID, and a group is a unit for managing similar people together. Services are lent a temporary pass (a role), and the list of doors that can be opened is written in a policy.

## Protecting the Root User and MFA

When you first create an AWS account, a **root user** is created. It is the highest-privilege holder who can do everything, so if it is taken over it is a disaster, and AWS strongly recommends the following.

- **Do not use** the root user for everyday tasks. Create and use an IAM user instead.
- Always enable **MFA (multi-factor authentication)** on the root user.
- Do not create root access keys, and delete them if they exist.

What is **MFA (Multi-Factor Authentication)**?

- A method that requires, in addition to a password (something you know), a one-time code from a phone app or a security key (something you have).
- Even if the password leaks, you cannot log in without the second factor, so security is greatly strengthened.

When the exam asks for "the best first step to strengthen account security," the correct bundle is almost always **enable MFA on the root user + avoid using root + create IAM users**.

### So When Is Root Used at All?

If you only say "don't use it," people wonder "then why does it exist?" The root user is needed for **some tasks about the account itself**. These include changing account settings, changing the support plan, and closing the account. Since these do not come up often, the principle is to keep it locked away normally and take it out only when needed.

```
1. Create the account              → the root user is created
2. Enable MFA on root              ← the first thing to do
3. Create an IAM user for administrators
4. From then on, all daily work is done as IAM users
5. Store the root credentials as if putting them in a safe
```

In house terms, root is the **master key that opens every door**. You put it in a safe, and ordinary entry is done with each person's own key.

**Pitfall**: If you see an option such as "restrict permissions by attaching a least-privilege policy to the root user," it is wrong. Root is not an object to be made safe by cutting its permissions; it is protected **by not using it at all**. Likewise, "create a root access key and use it for automation" is wrong in any situation.

The root account, the equivalent of the master key, gets MFA and goes into the safe.

## The Principle of Least Privilege

This is the golden rule of IAM permission design.

- Grant permissions "only as much as the job truly requires."
- Rather than granting broadly from the start and trimming later, the safe direction is to **start narrow and add as needed**.

| Bad example | Good example (least privilege) |
|---------|--------------------|
| Administrator permissions for every user | Only the service permissions each role needs |
| Granting full S3 access | Read permission on one specific bucket only |
| Improvising permissions for each person | Standardizing through groups/policies |

For questions asking about "a permission-granting approach that fits security best practices," the answer is mostly the principle of least privilege. "Broader permissions than necessary" is a wrong-answer signal.

### Why Does Granting Broadly and Trimming Later Not Work?

The temptation is strong: "let's grant administrator permissions for now and trim them if problems arise." In reality, the day to trim never comes. To take back permissions you need to know everything "this person is using right now," and the cost of that check is far greater than the cost of granting narrowly in the first place. So we reverse the order — **grant the minimum, and add more when a request says it is insufficient.**

## How It Shows Up on the Exam

The security questions on the CLF exam are fairly formulaic in wording. When you see the phrases below, the direction of the answer is nearly fixed.

| Phrase in the question | Answer direction |
|-------------------|----------|
| Data center physical security, hardware disposal, hypervisor | AWS's responsibility (of the cloud) |
| Data I uploaded, access permissions, encryption settings | Customer's responsibility (in the cloud) |
| OS patching on EC2 / patching the underlying software of RDS and Lambda | Customer's responsibility / AWS's responsibility |
| "EC2 needs to access S3," "Is it OK to put access keys in the code?" | IAM role |
| "Give the same permissions to multiple users efficiently" | IAM group |
| "The first step to strengthen account security" | MFA on root + avoid using root |
| "The best practice for granting permissions is" | Principle of least privilege |
| IAM's pricing and Region | Free and a global service |

In the next article, we cover the security services beyond IAM — WAF, Shield, GuardDuty, Inspector, Macie, and Security Hub — and sort them out one line at a time by "what threat they block."

## 📖 Glossary

- **Shared responsibility model** : The way AWS and the customer divide cloud security. "The cloud itself" is AWS's share, and "what you put in the cloud" is the customer's share.
- **Hypervisor** : The virtualization layer that runs multiple virtual servers on one physical server. AWS is responsible for it.
- **IAM** : The AWS service that decides "who can do what." It is free and has no Region distinction.
- **Role** : A credential that lends permissions temporarily without a password. It is attached to services such as EC2.
- **Policy** : A JSON rule document that states which actions are allowed or denied on which resources.
- **Root user** : The highest-privilege account created when you make the account. The principle is to keep it locked away rather than use it normally.
- **Access key** : A string credential that programs use when calling AWS. Hardcoding it into code carries a high risk of leakage.
- **MFA (multi-factor authentication)** : A login method that requires a second verification means, such as a phone code, in addition to the password.
- **Principle of least privilege** : The principle of granting only as much permission as the job truly requires. Instead of granting broadly and trimming, start narrow.
- **Authentication** : The step of verifying "who you are." You pass it with a password or MFA code.
- **Authorization** : The step of deciding "whether you may do that action." It is determined by what is written in the policy.
- **Group** : A box that bundles users so the same permissions can be given at once. You cannot put a group inside a group.
- **Explicit Deny** : A deny written in a policy. Even if another policy allows, the deny wins. If there is no policy at all, the default is deny.
- **Managed service** : A service where AWS handles operating system and engine management on your behalf (RDS, Lambda, and so on). Even so, data and permissions are the customer's responsibility.
- **of the cloud / in the cloud** : Expressions that separate security of the cloud "itself" (AWS's share) from security of "what you put inside" the cloud (the customer's share).

## 📝 Practice Questions

**Question 1.** In the shared responsibility model, which of the following is always the **customer's responsibility**?

A) Physical security of the data center  
B) Security of the hypervisor (virtualization layer)  
C) Configuring access permissions for data stored in S3  
D) Maintenance of server hardware  

**Answer: C**  
Explanation: Data and its access permissions are always the customer's responsibility ("in the cloud"), regardless of the service used. Data center physical security, the hypervisor, and hardware maintenance all fall in the "of the cloud" area that AWS is responsible for.

---

**Question 2.** An application running on an EC2 instance needs to access an S3 bucket. What is the most secure way to grant permissions?

A) Hardcode the access keys into the application code  
B) Attach an IAM Role to the EC2 instance  
C) Use the root user's credentials  
D) Grant administrator permissions to all users  

**Answer: B**  
Explanation: An IAM Role safely provides temporary permissions to EC2 without exposing access keys. Hardcoding keys into code or using root credentials carries high security risk, and granting administrator permissions violates the principle of least privilege.

---

**Question 3.** Which of the following is NOT a best practice for strengthening AWS account security?

A) Enable MFA on the root user  
B) Perform daily work with an IAM user instead of root  
C) Create root user access keys and use them for automation  
D) Grant permissions according to the principle of least privilege  

**Answer: C**  
Explanation: It is recommended not to create root access keys, and if compromised they put the entire account at risk. Enabling MFA, refraining from using root in favor of an IAM user, and the principle of least privilege are all correct best practices.

---

**Question 4.** What is the most appropriate way to efficiently grant and manage the same permissions across multiple IAM users?

A) Write a separate policy individually for each user  
B) Attach a policy to an IAM group and add users to the group  
C) Consolidate all users into the root user  
D) Create a separate role for each user  

**Answer: B**  
Explanation: Granting a policy to a group gives every user in the group the same permissions consistently, making management simple. Individual per-user policies are cumbersome to manage, consolidating into root is impossible and dangerous, and roles are for temporary permission delegation — not a tool for standardizing user permissions.

---

**Question 5.** Which of the following statements about IAM is correct?

A) IAM is a Regional service that must be configured separately per Region  
B) Using IAM incurs an additional charge  
C) IAM is a global service and there is no additional charge to use it  
D) IAM policies can only define Allow  

**Answer: C**  
Explanation: IAM is a global service spanning all Regions, and there is no additional charge for using it. It does not require per-Region configuration, and policies can define not only Allow but also explicit Deny.

---
