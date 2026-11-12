# Day 1 - Compute Overview: EC2, Lambda, and Containers (ECS/Fargate)

Boil the cloud down to a single sentence and it's "renting someone else's computer." But there isn't just one way to rent that "computer." You can rent an entire virtual server, you can drop off a snippet of code and rent compute only while it runs, or you can rent by the container. Those three approaches are EC2, Lambda, and ECS/Fargate, respectively. The CLF-C02 exam doesn't go deep on any of the three, but it will absolutely ask "which compute do you pick in which situation."

Today we lay out what problem each of these three compute services was born to solve, and how they line up along a single axis: "how much operational responsibility you hand off to AWS."

## 📌 Key Takeaways

- **EC2** = a single virtual server in the cloud. You get a lot of control, and in exchange a lot to manage yourself (IaaS).
- **Lambda** = a **serverless** function that you upload as code and that runs only when an event arrives. There is no server to manage.
- **Containers (ECS/EKS)** = pack the app into a standard box and run it identically anywhere. With **Fargate**, even the server management is AWS's job.
- The three services line up along a single axis: **"how much operational responsibility you hand off to AWS."**
- Easily confused distinctions: **scale up vs scale out**, **On-Demand vs Reserved vs Spot**, **serverless vs managed**.

## What Inconvenience Gave Birth to Compute Services

To see why EC2 was such a great invention, look at **what it was like to add a single server before EC2**.

In the days before the cloud, launching a new service went through these steps. You **estimated** how many people would use it (mostly wrong), got a **quote** for a chosen spec, submitted a **purchase approval**, waited weeks for the equipment to be **delivered**, **installed** it in the server room and hooked up power, cooling, and network, and only after installing and configuring the OS could you put the service on it.

From the day the idea arose to the day the service opened took weeks to months. On top of that, all of this risk hung on the very first step, the **estimate**. Guess high and expensive equipment sits idle; guess low and the service dies. And once you bought equipment, you **could not resell it.**

EC2 turned those six steps into **"a few clicks in the console, a few minutes."** The more important change was psychological. The decision to buy equipment cannot be undone, but **the decision to rent can be undone.** If you got it wrong, you just delete it. This "reversibility" is the real change the cloud made, and it is the substance of the **agility** we learned about earlier.

The E in EC2 stands for **Elastic**. The name itself means "a compute cloud that grows and shrinks as needed." When Elastic appears in an AWS service name (EC2, ELB, EBS, EFS, EKS…), you can generally take it to carry the character of "can flexibly adjust its scale."

## EC2: The Cloud's Virtual Server

EC2 (Elastic Compute Cloud) is AWS's oldest and most foundational compute service. In a word, it is renting **a single virtual server in the cloud**. You pick the operating system (Linux, Windows), pick the CPU and memory size, attach a disk, and within minutes your server is running.

What EC2 gives you is "flexibility and control." You can connect to the server over SSH, install whatever software you want, change OS settings, and do anything at all. In exchange, **your responsibility for management is just as large**: OS patching, security updates, and capacity adjustment are all on you.

EC2 is the representative example of IaaS (Infrastructure as a Service). IaaS is the model of "we rent out only the infrastructure (servers, network, storage), and everything above that is up to the user." In the Shared Responsibility Model, EC2 draws the boundary at "AWS up through the hardware and hypervisor, the user from the OS upward."

### Instance Types: Picking the Shape That Fits the Job

EC2 instances are divided into "types (instance families)" by purpose. On the exam you do not need to memorize every family name; you only need the concept that **"there is a balance suited to each purpose."**

| Type | Characteristics | Suited workloads |
|------|------|--------------|
| General Purpose | Balanced CPU and memory | Web servers, small databases, development environments |
| Compute Optimized | High CPU proportion | Batch processing, game servers, high-performance computation |
| Memory Optimized | High RAM proportion | Large in-memory databases, caches |
| Storage Optimized | High disk I/O | Large data warehouses |
| Accelerated Computing | Accelerators such as GPUs | Machine learning, graphics rendering |

The key is that "there is no single all-purpose server." Using a compute-optimized instance for a memory-heavy workload is expensive and inefficient. Choosing the shape to fit the nature of the job is the first step of cost optimization.

### How to Read Instance Names

In AWS documentation, names like `t3.micro` and `m5.large` keep appearing. They look like ciphers, but the rule is simple.

```
        t3.micro
        │ │  └── Size (nano < micro < small < medium < large < xlarge < 2xlarge …)
        │ └───── Generation (a larger number is newer)
        └─────── Instance family (purpose group)
```

The **family (first letter)** is the purpose group. `t` and `m` are general purpose, `c` is compute optimized (Compute), `r` is memory optimized (RAM), and `g` and `p` are accelerated computing with GPUs attached. The **generation (number)**: the larger, the newer the hardware, and usually the newest generation gives better performance for the same price. The **size (after the dot)** is a scale on which CPU and memory grow step by step within the same family.

You do not need to memorize any specific instance name for the exam. But the sense that **"you can read the purpose and size from the name alone"** makes later study much easier.

### Scale Up vs Scale Out: An Easily Confused Pair

When a server is not enough, there are two ways to grow. The names are similar, so they are often swapped on the exam.

| Category | Scale Up (vertical scaling) | Scale Out (horizontal scaling) |
|------|-------------------------------|----------------------------------|
| Method | Replace **one server with a bigger one** | Increase to **multiple servers** |
| Analogy | Swap a one-person desk for a bigger desk | Put one more desk in |
| Limit | Cannot go beyond the largest spec | Can in theory keep growing |
| Failure impact | If that one server dies, the service stops | If one dies, the rest hold on |
| What it usually needs | Stop the instance and change its type | A traffic-distribution device in front |

The side the cloud does especially well is **scale out**. Splitting across multiple servers gives freedom of expansion and raises stability.

> ⚠️ **Pitfall**: A great many people memorize the two terms backwards. Remember the direction as a picture: **"Up = upward = make one bigger"** and **"Out = sideways = increase the count."** And when the scenario also includes **"high availability"** or **"even if one server dies,"** the answer is almost always scale **out**. Scale up keeps the same number of servers, so it cannot raise availability.

### Two Services That Always Appear Alongside EC2

To actually scale out, you need two things. At the certification-fundamentals level, it is enough to know "what each thing does."

- **Auto Scaling**: A feature that **automatically increases and decreases** the number of EC2 instances according to demand. If you set a range such as "minimum 2, usual 2, maximum 10," it adjusts itself to traffic. This is the tool that realizes the **elasticity** learned on Day 1 on EC2.
- **ELB (Elastic Load Balancing)**: A device that **distributes incoming requests across multiple servers**. It is like the staff member at a restaurant entrance who guides guests to empty tables. Moreover, if a server does not respond, it stops sending requests to that server, so it also has the effect of automatically routing around a failed server.

Combine the two and it looks like this.

```
   User request
       ↓
     [ ELB ]          ← Distributes requests evenly + routes around dead servers
    ↙   ↓   ↘
  EC2  EC2  EC2       ← Auto Scaling adjusts the count automatically
   (AZ-a) (AZ-b) …    ← Spread across multiple AZs for high availability too
```

Suppose an online course site gets traffic only on Monday evenings. In the past, you had to keep servers large around the clock for those two hours. With Auto Scaling, it automatically increases the count when traffic rises and cuts to the minimum in the early morning. ELB meanwhile spreads requests evenly across the servers that are alive. It is the classic combination that captures **performance** and **cost** at once.

### Purchase Options: Same Server, Different Price

With EC2, even the same server varies greatly in price depending on "how you buy it." These purchase methods are in the exam scope.

| Purchase option | Concept | Suited situation |
|-----------|------|--------------|
| On-Demand | Billed hourly for what you use, no commitment | Unpredictable, short-term, test workloads |
| Reserved Instance | Up to ~72% discount with a 1-year/3-year commitment | Steady workloads running 24 hours a day |
| Savings Plans | Discount based on committed usage ($/hour) | Flexible long-term use |
| Spot Instance | Spare capacity up to ~90% cheaper, can be interrupted | Batch and fault-tolerant jobs that are fine being interrupted |
| Dedicated Host | Occupy an entire physical server | Licensing and compliance requirements |

The essence of purchase options is "a trade between predictability and price." The longer the commitment and the more you accept interruption, the cheaper it gets. On-Demand is the most expensive but the freest, and Spot is the cheapest but AWS can reclaim it at any time. This is a core tool of the Cost Optimization pillar of AWS Well-Architected.

> ⚠️ **Pitfall**: The key point about Spot Instances is that "AWS reclaims them with a 2-minute notice when it needs the capacity." That makes them unsuitable for payment processing or work where state matters, and suitable for work such as batch, rendering, and CI builds that can simply restart after an interruption.

Purchase-option questions are almost decided by asking **three questions** of the scenario.

```
① Is it fine for the workload to be interrupted?
      Yes → Spot
      No ↓
② Are you sure you will use it steadily for a year or more?
      Yes → Reserved Instance / Savings Plans
            (if the instance type is fixed too, Reserved; if you want flexibility, Savings Plans)
      No ↓
③ Is there a need to occupy a whole physical server or a specific license/compliance requirement?
      Yes → Dedicated Host
      No → On-Demand
```

Here are the scenario signals too. **"Short-term, test, unpredictable"** means On-Demand, **"1 year/3 years, steady"** means Reserved/Savings Plans, **"fine to be interrupted, fault-tolerant, batch"** means Spot, and **"licensing, rules requiring physical server separation"** means Dedicated Host.

## Lambda: Serverless Compute

If EC2 is "renting a server," Lambda is **"forgetting the server."** If you just upload code (a function), then each time an event occurs, AWS brings up an execution environment on its own, runs the code, and takes it down when finished. There is no server at all to manage.

Lambda's characteristics come down to three:

- **Event-driven execution**: It runs when a file lands in S3, an API request comes in, or a schedule fires.
- **Pay only for what you use**: You are billed only for the time the code ran (in milliseconds) and the number of invocations. If nothing happens, the cost is 0.
- **Automatic scaling**: Whether there is 1 request or 10,000, AWS brings them up in parallel on its own.

Lambda is the leading example of serverless. "Serverless" does not mean there are no servers; it means **the user does not see or manage the servers**. OS patching, capacity planning, and scaling all pass to AWS's responsibility. In the Shared Responsibility Model, the area the user is responsible for becomes much smaller than with EC2.

Think of an image thumbnail generation job that arrives irregularly a few times a day. With EC2, you keep a server on 24 hours and it mostly sits idle. With Lambda, it runs only at the moment an image is uploaded, and the cost arises only then. This kind of "intermittent, event-driven job" is Lambda's classic stage.

### What Lambda Is Not Good At

Lambda is not a cure-all. On the exam, knowing **where it does not fit** matters more.

- **Long-running jobs**: A single execution has a time limit. For hours-long large conversions or training jobs, EC2 or containers are the right fit.
- **Apps that need OS-level control**: A legacy app that changes kernel settings or requires a particular system configuration cannot be deployed there. When you see such a requirement, the answer is EC2.
- **Always-on services with steady traffic**: If requests come in at a constant rate 24 hours a day, the advantage of usage-based billing shrinks.
- **The first run can be a little slow**: When there are no invocations for a while and then one arrives, the response is delayed while the execution environment is prepared (a cold start).

**Pitfall**: An option saying "it's serverless, so it's unconditionally cheap and good" is a wrong-answer signal. Lambda is inexpensive **because it costs nothing when idle**, not because the unit price is low. So **the more idle time a workload has, the more it benefits, and the fuller the workload is 24 hours a day, the more the advantage shrinks.** If the scenario says "intermittent," "irregular," or "only when an event occurs," think Lambda; if "always on" or "steady traffic," suspect EC2/containers first.

## ECS and Fargate: Container Compute

The third is containers. A container is a technology that "packs the application and everything needed to run it into a single standard box and runs it identically anywhere" (the flagship tool is Docker). The flagship AWS service for running containers is **ECS (Elastic Container Service)**.

**How do a virtual server (VM) and a container differ?** Using a moving analogy, a VM is moving **an entire house**. Each one carries its own operating system, so it is heavy and takes time to start. A container moves only the belongings **packed in standard boxes**. The floor (the operating system) is shared by several boxes, so it is light and comes up in a few seconds.

| Category | Virtual server (VM, EC2) | Container |
|------|-------------------|----------|
| What each one has | A whole operating system each | Only the app and the libraries it needs |
| Weight and start speed | Heavy and slow | Light and fast |
| Isolation level | Strong | Weaker than a VM |
| Suited situation | When OS-level control is needed | When deploying the same app identically to multiple environments |

The real appeal of containers is that **"what worked on my laptop works the same on the server."**

Here there is one more distinction to make: **where you run the containers**.

| Launch type | Concept | Management burden |
|-----------|------|----------|
| ECS on EC2 | Run containers on EC2 you rented | Server management is on you |
| ECS on Fargate | Run only containers with no servers (serverless) | Server management is on AWS |

That is, **Fargate is "serverless for containers."** You can rent EC2 yourself and run containers on it (more control, more management burden), or use Fargate and not worry about servers (more convenience).

Besides ECS, AWS also has **EKS (Elastic Kubernetes Service)**. EKS is AWS offering the open-source standard Kubernetes as a managed service. At the exam-intro level, it is enough to know that "ECS is AWS's own way, EKS is the Kubernetes-standard way, and both can run serverlessly with Fargate."

## Three Kinds of Compute on a Single Axis

Rather than memorizing the three services separately, they become clear when viewed on a single axis: **"how much operational responsibility do you hand off to AWS."**

```
[ Spectrum of control ↔ convenience ]

  I manage more            AWS manages more
  More control             Less management burden
  ───────────────────────────────────────►

  EC2  →  ECS on EC2  →  ECS on Fargate  →  Lambda
 (server directly)    (serverless containers) (serverless functions)
```

The further left, the freer but the more hands-on work; the further right, the more convenient but the less control. When the keyword "minimize operational burden" appears in an exam scenario, the right side (Lambda/Fargate) is the answer, and if "fine-grained OS-level control is needed," the left side (EC2) is the answer.

> 🎯 **Scenario**: "An event-driven API that has almost no traffic and then suddenly surges, and we want to run it without operations staff." → Lambda. It meets all three conditions: automatic scaling, pay-as-you-use billing, and no server management. Conversely, "a legacy app that needs specific OS kernel settings" is EC2.

### Keyword → Compute Choice Mapping

| Scenario keyword | What to pick |
|-------------|---------|
| OS kernel settings, installing specific software directly, full control | EC2 |
| Steady 24-hour traffic, stable operation for a year or more | EC2 + Reserved / Savings Plans |
| Batch or rendering that is fine being interrupted, as cheap as possible | EC2 Spot |
| License requirement, occupying a physical server | Dedicated Host |
| Intermittent, event-based, no server management, zero cost when idle | Lambda |
| Deploying as containers, but don't want to manage servers | ECS/EKS on Fargate |
| Containers, but must control the underlying server directly | ECS/EKS on EC2 |
| Already using Kubernetes | EKS |
| Automatically adjust the number of servers to traffic changes | Auto Scaling |
| Distribute requests evenly across multiple servers | ELB |

**Pitfall**: "Minimizing operational burden" and "complete control" **cannot both be satisfied at the same time.** If an option claims to give both, that is the wrong answer. If you read exactly which of the two the scenario demands, most compute-selection questions narrow to two options.

For EC2, just hold two ideas: instance types are "the shape that fits the job," and purchase options are "a trade between predictability and price." The shared keyword for Lambda and Fargate is "serverless = you don't see or manage the servers."

Tomorrow we look at where to store the data that compute produces: the world of storage, running through S3, EBS, and EFS.

---

## 📝 Practice Questions

**Question 1.** You want to run intermittent, event-driven work with irregular traffic without managing servers yourself, paying only for what you use. Which compute service is the best fit?

A) EC2 On-Demand Instance  
B) EC2 Reserved Instance  
C) AWS Lambda  
D) Dedicated Host  

**Answer: C**  
Explanation: Lambda runs only when an event fires, bills only for the time it runs, and requires no server management at all. The conditions "irregular, intermittent, no server management, pay for what you use" all point to Lambda. EC2 On-Demand/Reserved require keeping a server running, so cost accrues even while idle, and a Dedicated Host occupies an entire physical server — the exact opposite.

---

**Question 2.** You want to run a large-scale batch-processing job that can simply be restarted if interrupted, as cheaply as possible. Which EC2 purchase option is the most cost-effective?

A) On-Demand Instance  
B) Spot Instance  
C) Reserved Instance (3-year commitment)  
D) Dedicated Host  

**Answer: B**  
Explanation: Spot Instances use AWS's spare capacity at up to about 90% off, with the downside that AWS can reclaim them when it needs the capacity. That makes them the best fit for "interruption-tolerant" batch and fault-tolerant work. On-Demand is the most expensive, Reserved Instances are for steady 24/7 workloads, and a Dedicated Host is for licensing/compliance purposes — none of which is about cost efficiency.

---

**Question 3.** You want to run a container-based application but you don't want to provision or manage the servers (EC2) that run those containers yourself. Which combination fits?

A) ECS on EC2  
B) ECS on Fargate  
C) EC2 alone  
D) Reserved Instance + EC2  

**Answer: B**  
Explanation: Fargate is a "serverless for containers" launch type in which the user does not provision or manage the underlying servers that run the containers. ECS on EC2 requires the user to manage EC2 directly, which violates the condition, and EC2 alone or a Reserved Instance combination pushes both container orchestration and server management onto the user.

---

**Question 4.** Which of the following most accurately describes the criterion for choosing an EC2 instance type (instance family)?

A) The General Purpose instance is always the best for every workload  
B) You choose a type with a different balance to match the nature of the job (relative weight of CPU, memory, disk, GPU)  
C) The instance type affects only price and is unrelated to performance  
D) A compute-optimized instance is suited to memory-heavy workloads  

**Answer: B**  
Explanation: Instance types are engineered with different balances of CPU, memory, storage, and accelerators to match the nature of the job. There is no all-purpose type (A is wrong), and the type choice affects both performance and cost (C is wrong). Memory-intensive work calls for a memory-optimized instance, and compute-optimized is for CPU-intensive work, so D is wrong.

---

**Question 5.** Which is the most accurate meaning of the term "Serverless"?

A) There are physically no servers at all  
B) Servers exist, but the user doesn't provision or manage them; AWS takes that on  
C) The user has to patch and scale the servers themselves  
D) Only EC2 counts as serverless  

**Answer: B**  
Explanation: Serverless doesn't mean there are no servers — it means the user doesn't bear management responsibilities like provisioning, patching, and scaling; AWS takes them on. So A, "no physical servers," is wrong, and C, "the user manages them directly," contradicts the definition of serverless. EC2 is IaaS where the user manages the server, so it is not serverless (D is wrong). Lambda and Fargate are the poster children of serverless.

---
