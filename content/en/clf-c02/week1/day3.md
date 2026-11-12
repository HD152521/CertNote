# Day 3 - The Shared Responsibility Model

## 📌 Key Takeaways

- **AWS is responsible for security "OF the cloud"**, and **the customer is responsible for security "IN the cloud."**
- AWS's share: physical facilities, hardware, virtualization, global network = **from the concrete floor up to the virtualization layer**.
- The customer's share: data, IAM permissions, guest OS patching, firewall settings, application security.
- The boundary is not fixed — as you go **EC2 → RDS → S3/Lambda**, the customer's responsibility shrinks.
- However, **data and IAM permissions are always the customer's responsibility** no matter which service you use.

## The Core in One Sentence

The shared responsibility model is summarized in this single sentence.

> **AWS is responsible for security "OF the cloud," and the customer is responsible for security "IN the cloud."**

Using a rental apartment as an analogy:

- **The landlord (AWS)**: the building's frame, electrical wiring, the lock on the shared entrance, fire alarms.
- **The tenant (the customer)**: locking their own front door, deciding who gets a key, managing the belongings inside the home.
- Even if the building is sturdy, **if the tenant leaves the door open, a thief gets in** — that is not the landlord's fault.

### Why Is This Model Needed?

In the on-premises days, this picture was unnecessary. From the building to the code, **everything was our responsibility**. But when you move to the cloud, part is handled by AWS and part by the customer. A dangerous misconception arises here.

> "AWS will protect everything for us, surely."

In reality, a good share of security incidents in the cloud happen not because AWS infrastructure was breached but because **the customer did not configure their own share**. Examples include accidentally making a storage bucket fully public, leaking an administrator key anywhere, or leaving a firewall open to the whole world. The shared responsibility model is closer to a warning label saying **"don't be mistaken about where your share ends."**

Switching to the rental car analogy gives the same picture.

| Rental car | Cloud |
|--------|---------|
| Maintenance, inspection, and recall handling belong to the rental company | Hardware, facilities, and virtualization belong to AWS |
| Fastening the seat belt, locking the doors, and not speeding belong to the driver | IAM settings, encryption, and firewall rules belong to the customer |
| Valuables left behind in the car are the driver's responsibility | The data you store and how widely it is exposed are the customer's responsibility |
| An accident caused by a brake defect is the company's responsibility | A physical infrastructure defect is AWS's responsibility |

> ⚠️ **Pitfall**: If you understand the shared responsibility model as "we split the security work half and half," you will get it wrong. **It is divided into layers with no overlapping section.** The lower layers (facilities, hardware, virtualization) are entirely AWS, and the upper layers (what I put up and how I configured it) are entirely the customer. And the key point of this model is that the layer boundary itself moves up and down depending on the type of service.

## AWS's Responsibility: Security "OF the Cloud"

AWS is responsible for the **underlying infrastructure** that runs the services. It is an area the customer cannot touch and has no need to touch.

| What AWS is responsible for | Description |
|-------------------|------|
| Physical facilities (data centers) | Building access control, guards, fire, power, and cooling |
| Hardware | Servers, storage, and network equipment |
| Virtualization (hypervisor) | The underlying software that runs virtual servers |
| Global network infrastructure | The network connecting Regions and AZs |

In a word, **from the concrete floor up to the virtualization layer** is AWS's domain.

This includes things the customer can neither **see nor touch** at all. Data center addresses are not public, you cannot walk into the server room, and you cannot change hypervisor settings. If you get a feel for **"what the customer cannot touch = AWS's responsibility,"** it becomes a yardstick for solving related questions.

- A disk fails and gets replaced → the customer doesn't even know → **AWS**
- Data center guards and access cards → the customer cannot be involved → **AWS**
- The fiber-optic cables connecting Regions and AZs → the customer cannot touch them → **AWS**
- Physical destruction of retired storage devices → the customer cannot do it → **AWS**

AWS documentation calls this **"Security OF the Cloud."** Conversely, the customer's share is **"Security IN the Cloud."** On the exam, these English phrases often appear **verbatim in the answer choices**, so remember not only the translation but also that **a single preposition, of / in, makes the difference**. `of` = the cloud facility itself (AWS), `in` = what I have put inside it (the customer).

## The Customer's Responsibility: Security "IN the Cloud"

The customer is responsible for **everything they put on and configure** on top of the foundation AWS provides.

| What the customer is responsible for | Description |
|-------------------|------|
| Data | What data to store, and how to classify and encrypt it |
| IAM (users and permissions) | Who gets what permissions |
| Guest OS patching (EC2) | Security updates for the virtual server's operating system |
| Network/firewall settings | Access rules such as security groups |
| Application security | Vulnerabilities in application code you wrote yourself |

"Data, and who can access it (IAM)" is **always the customer's responsibility regardless of which service you use**. No matter how securely AWS builds the infrastructure, an incident occurs if the customer sets a weak password or exposes data to anyone. AWS will never do these two things for you.

## The Boundary Moves Depending on the Type of Service

**The boundary of the shared responsibility model is not fixed; it moves up and down depending on which service you use.** The more "managed" the service you use, the less the customer is responsible for.

![The shared responsibility boundary, where customer responsibility shrinks and AWS responsibility grows as you move from EC2 to S3 and Lambda](/diagrams/shared-responsibility-spectrum.svg)

- **EC2 (virtual server)**: the customer handles everything themselves, including operating system patching, app installation, and firewall settings. Responsibility is greatest.
- **RDS (managed database)**: AWS handles the database engine's patching and backups for you. The customer focuses on data and access permissions.
- **S3 / Lambda (fully managed)**: you don't need to think about operating systems or servers at all. The customer is responsible only for things like data classification and access permissions.

Looking at how the boundary moves per service, item by item, makes it much clearer.

| Item | EC2 | RDS | S3 / Lambda |
|------|-----|-----|-------------|
| Physical facilities and hardware | AWS | AWS | AWS |
| Virtualization (hypervisor) | AWS | AWS | AWS |
| Guest OS installation and patching | **Customer** | AWS | AWS (the customer never even sees it) |
| Database engine patching | **Customer** (if you installed it yourself) | AWS | Not applicable |
| Performing backups | **Customer** (setup and operation) | AWS provides the feature, the customer configures it | AWS manages durability, the customer sets policy |
| Application code | **Customer** | **Customer** | **Customer** |
| Firewall and access rules | **Customer** (security groups) | **Customer** | **Customer** (permission policies) |
| Data classification and choice of encryption | **Customer** | **Customer** | **Customer** |
| IAM users and permissions | **Customer** | **Customer** | **Customer** |

Scanning the table vertically reveals the rule.

- The top rows (**facilities, hardware, virtualization**) are **always AWS** whichever service you use.
- The bottom rows (**applications, access rules, data, IAM**) are **always the customer** whichever service you use.
- The only thing that moves is **the middle rows (OS and engine patching, backups)**. The more managed the service, the more this middle part shifts to AWS's side.

If you remember it by the principle "as a service's level of abstraction rises, the customer's responsibility narrows from the top," every problem can be solved. The more you move the same task from EC2 → RDS → Lambda, the less the customer has to worry about. However, data and permissions (IAM) remain the customer's share at every stage.

Suppose you are moving an in-house database to the cloud. There are two ways. ① Install the database yourself on EC2 — you can use the familiar approach as is and set details however you like, but **OS patching, DB engine patching, backup scripts, and incident response are all the customer's share**. ② Use a managed service such as RDS — you get less fine-grained control, but **AWS takes on repetitive operations such as patching and backups**. It is the same database, yet the amount of overtime for the team differs. If a passage on the exam says "we want to reduce the operational burden" or "we don't want to manage patching," the answer is a **managed service**.

## It Is Not Only Security That Is Divided

Because of the name "shared responsibility model," it is easy to think of it as only about security, but in reality **operations as a whole** are divided in the same way.

| Area | AWS side | Customer side |
|------|--------|--------|
| Patching | Software of the infrastructure and managed services | The guest OS and applications the customer handles |
| Configuration | Provides services so that they operate with safe defaults | Decides what values to actually configure |
| Awareness training | Training for AWS employees | Training for members of your own organization |
| Compliance | Manages the infrastructure so that it meets various certification and audit standards | Responsible for whether the workloads placed on top comply with the standards |

**Compliance** in particular is widely misunderstood. If you think "AWS has been certified, so our service is automatically compliant," you are wrong. What AWS guarantees is **at the underlying infrastructure level**, and how you handle data on top of it is still the customer's share. This structure is called **"inheritance of compliance"** — you inherit the compliance results of the lower layer, but the upper layer must comply on its own.

When a customer undergoes an audit or review, there are times they must provide evidence of "which standards the AWS infrastructure meets." AWS provides a channel where customers can obtain such compliance reports themselves, and that service is **AWS Artifact**. Knowing just the name is enough.

## Easily Confused Pitfalls

Here are the answer choices that tend to confuse you on the exam, sorted out in advance.

| Item | Whose responsibility? | Reason |
|------|-----------|------|
| Data center access control | AWS | Physical facility security |
| Hypervisor (virtualization) security | AWS | Underlying infrastructure |
| EC2 guest OS patching | Customer | The OS the customer put up |
| Security group (firewall) settings | Customer | Network rules the customer configures |
| Data encryption policy | Customer | Always the customer's responsibility |
| Granting IAM users and permissions | Customer | Always the customer's responsibility |

### Two Lists That Don't Change No Matter Which Service You Use

To avoid being shaken by the statement that the boundary moves, it is quicker to memorize **what never moves** first.

**Always the customer's responsibility (a list to memorize)**

- **Classification** of data — judging which information is sensitive
- **IAM credential management** — accounts, passwords, access keys, multi-factor authentication (MFA) setup
- **Granting permissions** — who is allowed to do what
- **Guest OS patching** (where the customer handles the OS, as with EC2)
- Configuring **network access rules such as security groups**
- **The choice of whether to turn encryption on** and its configuration
- Security of the **application code** you wrote yourself

**Always AWS's responsibility (a list to memorize)**

- **Physical facilities** — data center buildings, access control, guards, fire, power, cooling
- **Hardware** — servers, storage, network equipment, replacing failures, physical destruction of retired equipment
- **The virtualization layer (hypervisor)**
- **Global network infrastructure** — the lines connecting Regions and AZs
- **OS and database engine patching for managed services**

> ⚠️ **Pitfall**: **Encryption** is the item that most often catches people in answer choices. AWS provides the **features and tools** that can encrypt, but **deciding whether to turn those features on and which data to apply them to is the customer's job**. Treat a choice like "AWS automatically encrypts all data for you" as wrong. Likewise, for **backups**, AWS provides the feature, but setting the policy is the customer's job.

Incidents in which a storage bucket is accidentally set to fully public and internal documents are exposed to the internet are reported not infrequently in the cloud. In those cases, the AWS infrastructure worked normally without any problem. The storage simply made things "readable by anyone," just as the customer requested. Under the shared responsibility model, **configuring access permissions is the customer's responsibility**, so this incident clearly falls in the customer's domain. Going back to the apartment analogy, the building's entrance was fine, but the tenant left their own front door open.

## How It Appears on the Exam

Shared responsibility model questions mostly take one of two forms: "whose responsibility is this item?" or "in this situation, what should the customer do?"

| If the question contains this wording | The answer is this |
|--------------------------|----------|
| "data center access control," "guards," "physical security" | AWS |
| "replacing servers and disks," "hardware maintenance," "disposing of equipment" | AWS |
| "hypervisor," "virtualization layer" | AWS |
| "network lines between Regions and AZs" | AWS |
| "RDS DB engine patching," "OS patching for a managed service" | AWS |
| "operating system updates on an EC2 instance" | Customer |
| "security group rules," "which ports to open" | Customer |
| "who gets which permissions," "MFA setup," "access key management" | Customer |
| "classifying which data is sensitive" | Customer |
| "deciding and configuring encryption of stored data" | Customer |
| "vulnerabilities in an application you developed yourself" | Customer |
| "want to reduce the operational burden and hand off patching" | Move to a managed service |
| "Security **OF** the cloud" | AWS |
| "Security **IN** the cloud" | Customer |

There are two tricks for judging quickly.

1. **"Can I change it by clicking in the console?"** — if you can change it, it is likely the customer's responsibility.
2. **"Is it work an AWS employee must physically go and do?"** — if so, it is AWS's responsibility.

Let's also sort out the confusing pairs before moving on.

| Pair | Distinction |
|----|------|
| **Providing the encryption feature** vs **deciding to apply encryption** | AWS provides the feature; the customer decides whether to turn it on |
| **Engine patching** of a managed service vs **OS patching** on EC2 | The former is AWS, the latter is the customer |
| **Physical network** (lines and equipment) vs **logical network** (security groups and access rules) | The former is AWS, the latter is the customer |
| **Compliance certification of the infrastructure** vs **compliance of my workload** | The former is AWS, the latter is the customer |
| **Physical destruction** of storage devices vs the **deletion and retention policy** for data | The former is AWS, the latter is the customer |

In the next article, we look at the **six pillars of the Well-Architected Framework**, in which AWS lays out "what good cloud design is."

## 📖 Glossary

- **Shared responsibility model**: a picture that defines where AWS and the customer split responsibility for security and operations.
- **OF the cloud / IN the cloud**: "the cloud itself" (AWS's share) / "what I put up inside the cloud" (the customer's share).
- **Hypervisor (virtualization)**: the underlying software that runs multiple virtual servers on a single physical server. AWS manages it.
- **Guest OS**: the operating system running inside an EC2 virtual server. The customer must apply security patches themselves.
- **Managed service**: a service where AWS handles operational chores such as patching, backups, and scaling for you.
- **IaaS**: a form that rents out only basic infrastructure such as servers and networking. EC2 is the representative example. The customer's responsibility is greatest.
- **Fully managed**: a form where you don't need to think about servers or the OS at all. S3 and Lambda are representative.
- **Security group**: a firewall rule placed in front of AWS resources. The customer is responsible for configuring it.
- **Level of abstraction**: the degree to which internal complexity is hidden. The higher it is, the less the customer has to worry about.
- **Security OF the Cloud / IN the Cloud**: official AWS phrasing. `of` is the facility itself (AWS's share), `in` is what is put inside it (the customer's share).
- **IAM credentials**: means of proving identity such as accounts, passwords, access keys, and MFA. Managing them is always the customer's responsibility.
- **MFA (multi-factor authentication)**: a method that requires an additional means of authentication beyond a password. The customer sets it up.
- **Data classification**: grading which information is sensitive. A typical customer task that AWS cannot do for you.
- **PaaS (managed platform)**: a form where the runtime environment is also provided and AWS takes on OS and engine patching. RDS is the typical example.
- **Operational burden (operational overhead)**: repetitive non-core work such as patching, backups, and monitoring. Managed services reduce it.

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
