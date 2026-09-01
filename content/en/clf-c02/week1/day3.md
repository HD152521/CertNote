# Day 3 - The Shared Responsibility Model

There's a very common misconception among first-time cloud users: "If I use AWS, doesn't AWS take care of all the security for me?" That's only half true. AWS and the customer **explicitly split** responsibility for security and operations. The **Shared Responsibility Model** we learn today defines "how far AWS's job goes and where mine begins," and it's a core concept that appears on the exam almost without fail.

## The Core Idea in One Sentence

The Shared Responsibility Model boils down to this single sentence.

> **AWS is responsible for security "OF the cloud"; the customer is responsible for security "IN the cloud."**

A simple analogy is a rented apartment. The **landlord (AWS)** is responsible for the building's structure, electrical wiring, the lock on the shared entrance, and the fire alarms. The **tenant (customer)** locks their own front door, decides who gets a key, and looks after the belongings inside. No matter how sturdy the building is, if the tenant leaves the door open and a burglar gets in — that's not the landlord's fault.

## AWS's Responsibility: Security "OF the Cloud"

AWS is responsible for the **underlying infrastructure** that runs its services. This is an area the customer cannot touch — and doesn't need to.

| What AWS is responsible for | Description |
|-------------------|------|
| Physical facilities (data centers) | Building access control, security guards, fire/power/cooling |
| Hardware | Servers, storage, networking equipment |
| Virtualization (hypervisor) | The underlying software that runs virtual servers |
| Global network infrastructure | The network connecting Regions and AZs |

In short, **everything from the concrete floor up to the virtualization layer** is AWS's domain.

## The Customer's Responsibility: Security "IN the Cloud"

The customer is responsible for **everything they put on top of and configure within** the foundation AWS provides.

| What the customer is responsible for | Description |
|-------------------|------|
| Data | What data to store, how to classify and encrypt it |
| IAM (users and permissions) | Who gets which permissions |
| Guest OS patching (EC2) | Security updates for the virtual server's operating system |
| Network/firewall configuration | Access rules such as security groups |
| Application security | Vulnerabilities in the app code you wrote yourself |

> 💡 **Related theory**: "Data, and who can access it (IAM)" is **always the customer's responsibility, no matter which service you use**. However securely AWS builds the infrastructure, if the customer sets a weak password or exposes data to everyone, an incident happens. These two things are never handled by AWS on your behalf.

## The Boundary Moves Depending on the Type of Service

Here's the key point. **The boundary line in the Shared Responsibility Model is not fixed — it moves up or down depending on which service you use.** The more "managed" the service, the less the customer is responsible for.

```
More customer responsibility  ↑                    More AWS responsibility  ↑
  ┌──────────────────────────────────────┐
  │ EC2 (virtual servers, IaaS)           │ OS patching, apps, and configuration are all on the customer
  │ RDS (managed database)                │ AWS patches the DB engine; data and permissions are on the customer
  │ S3 / Lambda (fully managed)           │ Customer handles only data classification and permissions; AWS does the rest
  └──────────────────────────────────────┘
Less customer responsibility  ↓                    Less AWS responsibility  ↓
```

- **EC2 (virtual servers)**: The customer handles OS patching, app installation, and firewall configuration directly. This carries the most responsibility.
- **RDS (managed database)**: AWS takes care of patching and backing up the database engine. The customer focuses on data and access permissions.
- **S3 / Lambda (fully managed)**: There's no operating system or server to think about at all. The customer is responsible for little more than data classification and access permissions.

> 💡 **Related theory**: Remember the principle "the higher a service's level of abstraction, the narrower the customer's responsibility becomes," and every question becomes solvable. Moving the same workload from EC2 → RDS → Lambda reduces what the customer has to worry about. But data and permissions (IAM) remain the customer's job at every level.

## Common Traps

Let's pre-empt the answer choices the exam uses to trip you up.

| Item | Whose responsibility? | Why |
|------|-----------|------|
| Data center access control | AWS | Physical facility security |
| Hypervisor (virtualization) security | AWS | Underlying infrastructure |
| EC2 guest OS patching | Customer | An OS the customer installed |
| Security group (firewall) configuration | Customer | Network rules the customer configures |
| Data encryption policy | Customer | Always the customer's responsibility |
| IAM users and permission grants | Customer | Always the customer's responsibility |

## Wrapping Up

Today's picture is simple but powerful. **AWS is responsible for the cloud itself ("OF"); the customer is responsible for what's inside it ("IN").** From the concrete floor up through virtualization is AWS; the data, permissions, OS, and apps above that are the customer's. And while the boundary moves upward as you go to more managed services — EC2 → RDS → Lambda — **data and IAM permissions are always the customer's job**. In the next article, we look at the **six pillars of the Well-Architected Framework**, AWS's summary of "what good cloud design looks like."

---

## 📝 Practice Questions

**Question 1.** Which of the following best describes the area AWS is responsible for in the Shared Responsibility Model?

A) Security IN the cloud  
B) Security OF the cloud  
C) The customer's data classification  
D) The customer's IAM permission configuration  

**Answer: B**  
Explanation: AWS is responsible for security OF the cloud — data centers, hardware, and virtualization. Security IN the cloud, data classification, and IAM permission configuration are all areas of customer responsibility.

---

**Question 2.** When operating an EC2 virtual server, which of the following is the customer's responsibility?

A) Physical access control for the data center  
B) Hypervisor (virtualization) security  
C) Guest operating system (OS) security patching  
D) Replacing server hardware  

**Answer: C**  
Explanation: EC2 is IaaS where the customer manages the operating system directly, so guest OS patching is the customer's responsibility. Data center access control, hypervisor security, and hardware replacement are all infrastructure areas that AWS is responsible for.

---

**Question 3.** No matter which AWS service you use, what always remains the customer's responsibility?

A) Hardware maintenance  
B) Managing data and access permissions (IAM)  
C) Data center cooling  
D) Global network infrastructure  

**Answer: B**  
Explanation: Data and who can access it (IAM) are always the customer's responsibility regardless of the type of service. Hardware maintenance, data center cooling, and global network infrastructure are all areas AWS is responsible for.

---

**Question 4.** If you move the same workload from EC2 to a fully managed service like Lambda, how does the responsibility boundary change?

A) The customer's responsibility increases  
B) The customer's responsibility decreases  
C) It does not change  
D) AWS's responsibility disappears  

**Answer: B**  
Explanation: The more managed the service, the more AWS takes over things like operating system patching, so the customer's responsibility decreases. However, data and permissions still remain the customer's job, and AWS's responsibility does not disappear.

---

**Question 5.** Which of the following is the customer's responsibility rather than AWS's?

A) Configuring security groups (firewall rules)  
B) The data center's fire alarm system  
C) Security of the server virtualization layer  
D) Managing network cables between Regions  

**Answer: A**  
Explanation: Network access rules such as security groups are configured directly by the customer, so they are the customer's responsibility. Data center fire alarms, the virtualization layer's security, and inter-Region networking are all underlying infrastructure managed by AWS.

---
