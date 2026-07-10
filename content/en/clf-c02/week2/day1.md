# Day 1 - Compute Overview: EC2, Lambda, and Containers (ECS/Fargate)

Boil the cloud down to a single sentence and it's "renting someone else's computer." But there isn't just one way to rent that "computer." You can rent an entire virtual server, you can drop off a snippet of code and rent runtime only when it executes, or you can rent by the container. Those three approaches are EC2, Lambda, and ECS/Fargate, respectively. The CLF-C02 exam doesn't go deep on any of the three, but it will absolutely ask "which compute do you pick in which situation."

Today we'll lay out what problem each of these three compute services was born to solve, and how they line up along a single axis: "how much operational responsibility you hand off to AWS."

## EC2: The Cloud's Virtual Server

EC2 (Elastic Compute Cloud) is AWS's oldest and most foundational compute service. In a word, it's renting **a single virtual server in the cloud**. You pick the operating system (Linux, Windows), pick the CPU and memory size, attach a disk, and within minutes your server is up.

What EC2 gives you is "flexibility and control." You can SSH into the server, install whatever software you want, change OS settings, and do anything at all. But in exchange, **your management responsibility is just as large** — OS patching, security updates, and capacity adjustments are all on you.

> 💡 **Related theory**: EC2 is the textbook example of IaaS (Infrastructure as a Service). IaaS is the model of "we rent you the infrastructure (servers, networking, storage) and everything above that is up to you." Under the Shared Responsibility Model, EC2 draws the boundary at "AWS handles up through the hardware and hypervisor; the user handles the OS and up."

### Instance Types — Picking the Right Shape for the Job

EC2 instances are divided into "types (instance families)" by purpose. On the exam you don't need to memorize each family name — you just need the concept that **"there's a balance suited to each use case."**

| Type | Characteristics | Suited workloads |
|------|------|--------------|
| General Purpose | Balanced CPU and memory | Web servers, small databases, dev environments |
| Compute Optimized | CPU-heavy | Batch processing, game servers, high-performance computation |
| Memory Optimized | RAM-heavy | Large in-memory databases, caches |
| Storage Optimized | High disk I/O | Large data warehouses |
| Accelerated Computing | Accelerators such as GPUs | Machine learning, graphics rendering |

The key point is that "there's no one all-purpose server." Using a compute-optimized instance for a memory-heavy workload is expensive and inefficient. Choosing the shape to fit the nature of the job is the first step in cost optimization.

### Purchase Options — Same Server, Different Price

With EC2, the very same server can cost wildly different amounts depending on "how you buy it." This comes up on the exam a lot.

| Purchase option | Concept | Suited situation |
|-----------|------|--------------|
| On-Demand | Billed per hour for what you use, no commitment | Unpredictable, short-term, or test workloads |
| Reserved Instance | Up to ~72% off with a 1-year/3-year commitment | Steady workloads running 24/7 |
| Savings Plans | Discount based on a committed usage amount ($/hour) | Flexible long-term use |
| Spot | Spare capacity up to ~90% cheaper, interruptible | Fault-tolerant batch jobs that can survive interruption |
| Dedicated Host | Occupy an entire physical server | Licensing or compliance requirements |

> 💡 **Related theory**: The essence of purchase options is "trading predictability for price." The longer you commit and the more interruption you accept, the cheaper it gets. On-Demand is the most expensive but the most flexible; Spot is the cheapest but AWS can reclaim it at any time. This is a core tool of the Cost Optimization pillar of AWS Well-Architected.

> ⚠️ **Pitfall**: The key thing about Spot Instances is that "if AWS needs the capacity, it reclaims it after a 2-minute notice." That makes them unsuitable for payment processing or stateful workloads, but a great fit for batch jobs, rendering, or CI builds that can simply restart if interrupted.

## Lambda: Serverless Compute

If EC2 is "renting a server," Lambda is **"forgetting about the server."** You just upload your code (a function), and every time an event fires, AWS spins up an execution environment on its own, runs your code, and tears it down when it's done. There's no server for you to manage at all.

Lambda's characteristics boil down to three:

- **Event-driven execution**: It runs when a file lands in S3, an API request comes in, or a schedule fires.
- **Pay only for what you use**: You're billed only for execution time (in milliseconds) and number of invocations. When nothing happens, the cost is zero.
- **Automatic scaling**: Whether there's 1 request or 10,000, AWS spins them up in parallel for you.

> 💡 **Related theory**: Lambda is the poster child for Serverless. "Serverless" doesn't mean there are no servers — it means **the user doesn't see or manage the servers**. OS patching, capacity planning, and scaling all shift to AWS's responsibility. Under the Shared Responsibility Model, the area the user is responsible for shrinks far below what it is with EC2.

> 📚 **Case study**: Consider an image-thumbnail-generation job that comes in a few times a day, irregularly. Do it with EC2 and you keep a server on 24 hours a day while it mostly sits idle. Do it with Lambda and it runs only at the moment an image is uploaded, and cost accrues only then. This kind of "intermittent, event-driven work" is Lambda's classic stage.

## ECS and Fargate: Container Compute

The third approach is containers. A container is the technology of "packing an application and everything it needs to run into a single standard box so it runs identically anywhere" (the flagship tool being Docker). The flagship AWS service for running containers is **ECS (Elastic Container Service)**.

Here you have to make one more distinction — **where you run the containers**.

| Launch type | Concept | Management burden |
|-----------|------|----------|
| ECS on EC2 | Run containers on EC2 you've rented | Server management is on you |
| ECS on Fargate | Run just the containers, no servers (serverless) | Server management is on AWS |

In other words, **Fargate is "serverless for containers."** You can rent EC2 directly and run containers on top of it (more control, more management burden), or use Fargate and never think about servers (more convenience).

> 💡 **Related theory**: Besides ECS, AWS also has **EKS (Elastic Kubernetes Service)**. EKS is AWS's managed offering of the open-source standard Kubernetes. At the exam-intro level, it's enough to know that "ECS is AWS's own approach, EKS is the Kubernetes-standard approach, and both can run serverless via Fargate."

## The Three Compute Options on a Single Axis

Rather than memorizing the three services separately, they become clear when you view them on a single axis: **"how much operational responsibility do you hand off to AWS."**

```
[ Control ↔ Convenience spectrum ]

  You manage more          AWS manages more
  More control             Less management burden
  ───────────────────────────────────────►

  EC2  →  ECS on EC2  →  ECS on Fargate  →  Lambda
 (server directly)    (serverless containers)  (serverless functions)
```

The further left you go, the more freedom you have but the more hands-on work it takes; the further right, the more convenient it is but the less control you have. In an exam scenario, when the keyword "minimize operational burden" shows up, the right side (Lambda/Fargate) is the answer; when "fine-grained control at the OS level is needed," the left side (EC2) is the answer.

> 🎯 **Scenario**: "An event-driven API that sits nearly idle then suddenly spikes, and I want to run it with no ops staff." → Lambda. It satisfies all three conditions: automatic scaling + pay-as-you-go + no server management. Conversely, "a legacy app that needs specific OS kernel settings" → EC2.

## Wrapping Up

The picture we saw today is simple. AWS compute is **a single spectrum**. As you move from EC2 (virtual server) → containers (ECS/Fargate) → Lambda (functions), the amount the user manages shrinks and the amount AWS takes on grows. For EC2, you just need to grasp two ideas: instance types are "the right shape for the job" and purchase options are "trading predictability for price." The shared keyword for Lambda and Fargate is "serverless = you don't see and don't manage the servers."

Tomorrow we look at where the data that compute produces gets stored — the world of storage, running through S3, EBS, and EFS.

---

## 📝 연습 문제

**문제 1.** You want to run intermittent, event-driven work with irregular traffic without managing servers yourself, paying only for what you use. Which compute service is the best fit?

A) EC2 On-Demand Instance  
B) EC2 Reserved Instance  
C) AWS Lambda  
D) Dedicated Host  

**정답: C**  
해설: Lambda runs only when an event fires, bills only for the time it runs, and requires no server management at all. The conditions "irregular, intermittent, no server management, pay for what you use" all point to Lambda. EC2 On-Demand/Reserved require keeping a server running, so cost accrues even while idle, and a Dedicated Host occupies an entire physical server — the exact opposite.

---

**문제 2.** You want to run a large-scale batch-processing job that can simply be restarted if interrupted, as cheaply as possible. Which EC2 purchase option is the most cost-effective?

A) On-Demand Instance  
B) Spot Instance  
C) Reserved Instance (3-year commitment)  
D) Dedicated Host  

**정답: B**  
해설: Spot Instances use AWS's spare capacity at up to about 90% off, with the downside that AWS can reclaim them when it needs the capacity. That makes them the best fit for "interruption-tolerant" batch and fault-tolerant work. On-Demand is the most expensive, Reserved Instances are for steady 24/7 workloads, and a Dedicated Host is for licensing/compliance purposes — none of which is about cost efficiency.

---

**문제 3.** You want to run a container-based application but you don't want to provision or manage the servers (EC2) that run those containers yourself. Which combination fits?

A) ECS on EC2  
B) ECS on Fargate  
C) EC2 alone  
D) Reserved Instance + EC2  

**정답: B**  
해설: Fargate is a "serverless for containers" launch type in which the user does not provision or manage the underlying servers that run the containers. ECS on EC2 requires the user to manage EC2 directly, which violates the condition, and EC2 alone or a Reserved Instance combination pushes both container orchestration and server management onto the user.

---

**문제 4.** Which of the following most accurately describes the criterion for choosing an EC2 instance type (instance family)?

A) The General Purpose instance is always the best for every workload  
B) You choose a type with a different balance to match the nature of the job (relative weight of CPU, memory, disk, GPU)  
C) The instance type affects only price and is unrelated to performance  
D) A compute-optimized instance is suited to memory-heavy workloads  

**정답: B**  
해설: Instance types are engineered with different balances of CPU, memory, storage, and accelerators to match the nature of the job. There is no all-purpose type (A is wrong), and the type choice affects both performance and cost (C is wrong). Memory-intensive work calls for a memory-optimized instance, and compute-optimized is for CPU-intensive work, so D is wrong.

---

**문제 5.** Which is the most accurate meaning of the term "Serverless"?

A) There are physically no servers at all  
B) Servers exist, but the user doesn't provision or manage them; AWS takes that on  
C) The user has to patch and scale the servers themselves  
D) Only EC2 counts as serverless  

**정답: B**  
해설: Serverless doesn't mean there are no servers — it means the user doesn't bear management responsibilities like provisioning, patching, and scaling; AWS takes them on. So A, "no physical servers," is wrong, and C, "the user manages them directly," contradicts the definition of serverless. EC2 is IaaS where the user manages the server, so it is not serverless (D is wrong). Lambda and Fargate are the poster children of serverless.

---
