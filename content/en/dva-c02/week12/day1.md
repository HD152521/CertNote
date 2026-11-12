# Day 1 - ECS and Fargate: What "Running Containers Without Servers" Really Means

Running a single container is easy. But when you need to run hundreds of containers across multiple servers, restart them when they die, and scale them according to traffic, you're faced with an entirely different problem. This "orchestrating multiple containers" is container orchestration, and Amazon ECS is AWS's answer. Fargate takes a step further — "don't even manage the servers that run those containers" — offering a serverless container model.

In DVA-C02, ECS/Fargate/ECR are central to the Deployment domain. Simple memorization (awsvpc mode, executionRole vs taskRole) does appear, but scenario questions asking "why does Fargate enforce awsvpc only," "what error happens when executionRole and taskRole are confused," and "what's the root cause of ECR pull failure" are more common. This article digs deep into: what Linux kernel capabilities container isolation comes from, how ECS separates control plane from data plane, how Fargate realizes "serverless" with isolation technology, and why the two IAM roles diverge at their roots.

## Containers Started Here: cgroups and namespace

Containers are not magic — they're a combination of two Linux kernel features. **Namespaces** show a process "its own world" — PID namespace makes the container process see itself as PID 1, network namespace gives it its own network interfaces and routing table, mount namespace gives it its own filesystem view. **cgroups (control groups)** put a ceiling on what resources (CPU, memory, I/O) that process can use. Namespaces "isolate what is visible," and cgroups "restrict what can be used." Together they create containers — "multiple isolated execution environments on one kernel."

This is fundamentally different from virtual machines. A VM launches a guest OS kernel entirely on top of a hypervisor, but a container **shares the host kernel** and only provides isolation on top. That's why containers are lightweight and boot quickly (hundreds of milliseconds), but because they share a kernel, their isolation strength is weaker than VMs. This "weak isolation from kernel sharing" becomes the starting point for why Fargate uses special isolation technology later.

> 💡 **Related theory**: cgroups was contributed to the Linux kernel in 2007 by Google engineers under the name "process containers." The concept of containers itself is older — FreeBSD's jail (2000) and Solaris Zones (2004) were ancestors, and going further back, Unix's chroot (1979) was the first seed of "isolating a process by changing its root directory." Docker (2013) popularized containers by bundling these kernel capabilities with easy-to-use tooling and an image format/registry ecosystem — it didn't invent the isolation technology itself. ECS layered on top "scheduling across multiple hosts" as one more level.

> 🔍 **Going deeper**: Container images have a **union filesystem** layered structure. On top of a base image (e.g., `python:3.12-slim`), dependency installation and application code layers stack up, with each layer identified by content hash. This yields two benefits. First, **caching**: if only code changes, only the code layer rebuilds/pushes while the rest is reused. Second, **sharing**: multiple images using the same base layer store that layer only once on disk. This is why ECR "uploads only changed layers on image push" and Docker "doesn't re-fetch already-received layers" — all thanks to this structure. The common advice to put frequently-changing commands (`COPY . .`) at the bottom of a Dockerfile is to minimize cache invalidation.

## ECS's Two Planes: Control Plane and Data Plane

The key to understanding ECS is that "the brain that decides scheduling" and "the body where containers actually run" are separated. This is a universal structure for distributed orchestrators.

- **Control plane**: Fully managed by AWS. Stores cluster state, decides "which task goes on which instance" through scheduling, and keeps desired and actual counts of a service in sync. Users don't operate this part.
- **Data plane**: The actual computing where containers run. Whether it's EC2 or Fargate is the fork in the road of "launch type."

Core components form this hierarchy:

- **Cluster**: A logical boundary holding compute resources and services.
- **Task Definition**: A blueprint for container execution. It specifies image, CPU/memory, port mappings, environment variables, logging setup, and the two IAM roles go here. **Immutable and versioned** — modify it and a new revision (`my-app:2`) is born.
- **Task**: An instantiation of a task definition, the unit of execution. Multiple containers can run together in one task (sidecar pattern).
- **Service**: A long-running manager that maintains the desired count of tasks, restarts dead ones, connects to load balancers, and manages rolling deployments.

```json
{
  "family": "my-app",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::...:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::...:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "my-app",
      "image": "123456789.dkr.ecr.ap-northeast-2.amazonaws.com/my-app:latest",
      "portMappings": [{ "containerPort": 8080, "protocol": "tcp" }],
      "secrets": [
        {
          "name": "DB_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:...:secret:prod/myapp/db"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/my-app",
          "awslogs-region": "ap-northeast-2",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

> 💡 **Related theory**: ECS service's behavior of "constantly matching desired to actual count" is the **reconciliation loop** pattern that became famous in Kubernetes. Declare the "desired state" and the controller observes "current state," repeatedly taking action to reduce the gap. When a task dies and actual count drops from 3 to 2, the controller detects this gap and launches a new task to bring it back to 3. This "declarative model" is more self-healing than the imperative model ("launch a task" as a one-time command). CloudFormation's stack state management, DynamoDB Auto Scaling, and Auto Scaling Groups all share this philosophy.

> ⚠️ **Trap**: Task definitions are immutable and versioned — this becomes an exam trap. "How do I change environment variables?" The answer isn't "modify the existing task definition" but "**register a new revision and update the service to that revision**." Also, updating a service to `:latest` without a specific revision can cause unintended deployments, so most often deploy with explicit revision numbers.

## How Fargate Creates "Serverless": Firecracker

The surface-level difference between EC2 launch type and Fargate is "do I manage EC2 instances myself," but underneath is fascinating isolation technology. On Fargate, users don't see or manage EC2 instances. But if AWS just put all customers' containers on one giant shared kernel, isolation would be risky — as we saw, containers share the kernel, making isolation weak in multitenant environments.

AWS's solution is **Firecracker**. Firecracker is lightweight virtualization technology (microVM) that AWS created and open-sourced, aiming to capture both "VM's strong isolation" and "container's fast startup." While general VMs carry hundreds of MB memory overhead and tens of seconds boot time, Firecracker microVMs boot in under 125ms with **less than 5MB overhead**. Fargate puts each task (or small batches) in its own microVM, providing strong isolation between customers — they don't share kernels — while starting as fast as containers. The magic of "not managing servers" is that AWS operates these microVMs on your behalf.

| Trait | EC2 launch type | Fargate |
|------|--------------|---------|
| Data plane | I operate EC2 directly | AWS operates microVMs |
| Isolation | Share host kernel | Task-per-microVM (Firecracker) |
| Billing | Instance-hours (charged even idle) | Task vCPU·memory·execution time |
| Patching·AMI | My responsibility | AWS responsibility |
| Network mode | Choice: bridge/host/awsvpc/none | **awsvpc enforced** |
| Suited for | Cost optimization, GPU, special hardware, daemons | Convenience, quick scaling, minimal ops burden |

> 🔍 **Going deeper**: Firecracker is written in Rust and runs on top of KVM (Linux Kernel Virtual Machine). The core design is "only keep what's absolutely necessary, minimal device model" — unlike QEMU-based VMs that emulate all sorts of legacy hardware, Firecracker provides only a few essential devices: network, block, serial console. Small attack surface means strong security, little to boot means fast. Lambda also uses the same Firecracker — so Lambda and Fargate share the same "serverless computing" root. Released at re:Invent 2018, this technology is AWS's answer to "how can serverless isolation be safe yet fast?"

> 📚 **Case study**: Before Firecracker's public release in 2018, Fargate internally isolated EC2 instances per customer, incurring resource waste and slow startup costs. After Firecracker adoption, Fargate can safely bin-pack thousands of microVMs on one bare-metal host. This density improvement was the technical foundation for Fargate price cuts (circa 2019, about 20% reduction). Behind "serverless getting cheaper" is evolving isolation technology.

## Why Fargate Enforces awsvpc Only

Network mode determines how a container sees the network. EC2 launch type lets you choose from four; Fargate uses **awsvpc only**. This isn't just a constraint — it's a necessary outcome of Fargate's isolation model.

| Mode | Behavior | Limitation |
|------|------|------|
| **bridge** | Docker default. NAT-connected to host's virtual bridge | Port conflicts, performance overhead |
| **host** | Container directly uses host network | Weak isolation, port sharing impossible |
| **awsvpc** | **Each task gets its own ENI (elastic network interface)** | ENI count limit |
| **none** | No network | External communication impossible |

In awsvpc mode, each task receives its own real network interface (ENI) in the VPC. So a task **has its own private IP**, can have security groups attached per-task, and appears individually in VPC flow logs. Each task looks like a small EC2 instance on the network. Fargate doesn't expose hosts to users, so it can't offer "host networking" concepts like host or bridge — the host isn't visible, so there's no way to share its network. That makes "give each task an independent ENI" the only logically consistent choice, hence awsvpc is enforced.

> ⚠️ **Trap**: awsvpc consumes one ENI per task, so if available IPs in a subnet run out or the EC2 instance hits its ENI limit, you get "can't launch tasks" failures (especially in EC2 launch type). On the exam, when you see "Fargate tasks won't start + subnet IP exhaustion," the answer is "add a larger-CIDR subnet" type. Also, awsvpc tasks in private subnets need NAT gateways or VPC endpoints to reach ECR/Secrets Manager — put them in a private subnet without NAT and you get "image pull failure."

## executionRole vs taskRole: Why Two Roles Diverge at Their Roots

Confusing these is the single most common exam trap for ECS. The key is "**who, when, and for what**" the permission is used at completely different times.

- **executionRole (task execution role)**: Used by the **ECS agent/infrastructure while starting the task**. Things needed before the container even launches — ECR image pull, CloudWatch Logs group/stream creation, fetching secrets from Secrets Manager/SSM and injecting as environment variables. It's "permission for getting the container on stage."
- **taskRole (task role)**: Used by the **application code inside the container after it launches**. The app writing to DynamoDB, reading S3, polling SQS, publishing to SNS — runtime business logic permissions.

Remember by timing: **executionRole = pre-launch infrastructure permissions, taskRole = runtime app permissions.** If the image won't pull from ECR, it's an executionRole issue. If the app gets AccessDenied on DynamoDB, it's a taskRole issue.

> 💡 **Related theory**: This separation is a clean application of the **Principle of Least Privilege**. If you lump ECR pull, log writing, and DynamoDB access into one role, and that container gets compromised, the attacker gets ECR and logging infrastructure permissions too. Splitting them means "credentials exposed inside the container" are only taskRole (what the app gets via IMDS or similar), while executionRole is held by the ECS agent outside the container, unreachable by app code. This reduces the "blast radius" of permissions.

> 📚 **Case study**: Two most common operational incidents. (1) Putting `secrets` in task definition to inject DB password from Secrets Manager as an environment variable, but **executionRole lacks `secretsmanager:GetSecretValue` permission** — the task won't even start. This is an executionRole problem, not taskRole (injection happens at startup, infrastructure does it). (2) App starts fine but S3 upload gets AccessDenied — taskRole problem. On exams, "secret injection failure" → executionRole, "runtime app AWS call failure" → taskRole, and you almost never get it wrong.

## Task Placement and Capacity: The Tug of War Between Cost and Availability

In EC2 launch type, you must decide "where among multiple instances to place tasks" (Fargate doesn't apply). This is **task placement strategy**.

| Strategy | Behavior | Intent |
|------|------|------|
| **binpack** | Fill instances with least CPU/memory remaining first | Minimize instances → **cost savings** |
| **spread** | Even distribution across instances/AZs/hosts | If one dies, impact is minimal → **high availability** |
| **random** | Random | Simple, testing only |

binpack and spread have opposite goals. binpack "tightly packs fewer instances" to eliminate idle machines and save costs. spread "scatters across AZs" so if an entire AZ dies, the service survives. In practice, teams often combine: "spread across AZs, binpack within each AZ."

**Capacity Provider** is abstraction one level up. Mix Fargate, Fargate Spot, and EC2 Auto Scaling Group — "core N on stable Fargate, rest on 70% cheaper Fargate Spot." Spot receives 2-minute termination notice, so it's for batch jobs and fault-tolerant workloads.

> 🔍 **Going deeper**: binpack is actually the classic computer science **bin packing problem** itself — "pack items of various sizes into the minimum number of boxes," an NP-hard problem with no fast optimal solution, so we use heuristics (e.g., First-Fit Decreasing). ECS's binpack is likewise "greedy heuristic" not perfect optimization: "fill the instance with least remaining capacity." Much of cloud cost optimization boils down to "how to pack resources densely with no idle room" — the same game Firecracker plays by bin-packing microVMs on one host.

## ECR: Where Do You Store Images and How Do You Authenticate

**Amazon ECR (Elastic Container Registry)** is a fully managed container image registry. Though it looks like simple storage, exam details are quite nuanced.

```bash
# ECR authentication: get 12-hour-valid token for docker login
aws ecr get-login-password --region ap-northeast-2 | \
    docker login --username AWS --password-stdin \
    123456789.dkr.ecr.ap-northeast-2.amazonaws.com

docker build -t my-app .
docker tag my-app:latest 123456789.dkr.ecr.ap-northeast-2.amazonaws.com/my-app:latest
docker push 123456789.dkr.ecr.ap-northeast-2.amazonaws.com/my-app:latest
```

| Item | Detail |
|------|------|
| **Authentication** | IAM-based. Token from `get-login-password` is **12 hours** valid |
| **Vulnerability scanning** | Basic (free, CVE-based, scan on push) / Enhanced (Amazon Inspector integration, paid, continuous) |
| **Lifecycle policy** | Auto-delete old images by tag/count/days |
| **Replication** | Auto-replicate across regions/accounts |
| **Pull-through cache** | Cache Docker Hub/ECR Public images in ECR → speed + rate limit evasion |
| **Immutable tags** | Prevent overwriting tags like `latest` for deployment traceability |

> ⚠️ **Trap**: "Fargate task can't pull ECR image" usually has one of three causes. (1) **executionRole lacks ECR permission**, (2) **Private subnet without NAT/VPC endpoint** can't reach ECR, (3) `get-login-password` token expired (12 hours) — if CI runs long, token expires and push fails. "Auth token valid for 12 hours" is a number that appears in standalone questions too.

> 📚 **Case study**: When Docker Hub imposed free/anonymous image pull rate limit (100-200 pulls per 6 hours) in 2020, many CI pipelines directly pulling base images broke with "Too Many Requests." AWS's recommended fix is **ECR pull-through cache** — fetch Docker Hub images once, cache in ECR, then all subsequent pulls come from ECR, avoiding both rate limits and external dependency. This "solve external dependency issues with caching" is a pattern that repeats across cloud.

## Summary

ECS's core thesis is "maintain desired container state through a declarative reconciliation loop, choosing whether to run that data plane on EC2 directly or delegate to Fargate." Container isolation comes from namespace and cgroups kernel features. Fargate reinforces that weak isolation with Firecracker microVM for "serverless" safe multitenancy. awsvpc enforcement is Fargate's necessary outcome from hiding the host. executionRole and taskRole split separate "pre-launch infrastructure" from "runtime app" permissions by time, a least-privilege design. ECR backs the image supply chain with 12-hour tokens, layer caching, and pull-through cache. Most exam traps ask "which layer is the root cause of this symptom" on this pipeline.

Next we'll move into CloudFormation's world where we declare all this infrastructure without clicking by hand.

---

## 📝 Practice Questions

**Question 1.** You configured an ECS task definition to inject a Secrets Manager secret as an environment variable, but the task does not even start and cannot retrieve the secret. What is the cause?

A) The taskRole lacks DynamoDB permissions

B) The executionRole lacks the `secretsmanager:GetSecretValue` permission

C) The container port is configured incorrectly

D) The network mode is bridge

**Answer: B**

Explanation: **Fetching the Secrets Manager secret and injecting it as an environment variable is done by the ECS infrastructure (agent) before the container starts**, so it requires the permissions of the **executionRole**. It is not the taskRole, because the app does not call Secrets Manager directly while running; the secret is injected at startup. A) taskRole permissions are used when the app calls AWS services at runtime, and here the task could not even start, so it is irrelevant. C and D have nothing to do with the secret injection failure. Remember: "secret injection = startup time = executionRole".

---

**Question 2.** Which is the correct network mode available to a Fargate task, and the reason?

A) bridge - to avoid port conflicts

B) host - because it has the best performance

C) awsvpc - because Fargate does not expose the host, so only the approach of giving each task its own ENI is consistent

D) none - to block the network for security

**Answer: C**

Explanation: Fargate does not expose the EC2 host to the user, so it cannot offer the host mode that "shares the host network" or the bridge concept that "NATs through the host's bridge". Since the host is invisible, there is no way to share its network. Therefore **only awsvpc, which gives each task an independent ENI in the VPC (its own private IP and its own security group)**, is a consistent choice and is enforced. A and B are modes that are not possible on Fargate, and D blocks external communication, which makes it impractical.

---

**Question 3.** To minimize cost, you want to pack tasks onto as few instances as possible with the EC2 launch type. What is the appropriate placement strategy?

A) spread

B) binpack

C) random

D) Fargate Spot

**Answer: B**

Explanation: **binpack** fills the instance with the least remaining CPU or memory first, which ultimately minimizes the number of instances in use. It is a greedy heuristic for the classic bin packing problem, and it reduces cost by eliminating idle instances. A) spread does the opposite: it distributes tasks evenly across AZs and instances to improve availability, but needs more instances. C) random optimizes neither cost nor availability. D) Fargate Spot is not a placement strategy but a capacity provider option.

---

**Question 4.** In a long-running CI pipeline, ECR push suddenly started failing with an "authentication" error. What is the most likely cause?

A) The image is too large

B) The authentication token obtained with `get-login-password` expired after exceeding 12 hours

C) An ECR lifecycle policy deleted the image

D) Vulnerability scanning blocked the push

**Answer: B**

Explanation: The docker authentication token issued by ECR's `get-login-password` is valid for **12 hours**. If the pipeline runs longer than that, the token expires and push/pull produce authentication errors. The fix is to log in again (reissue the token) right before the job. A) Size is unrelated to authentication errors. C) A lifecycle policy only deletes old images and does not block authentication. D) Vulnerability scanning runs after the push and does not block the authentication step.

---

**Question 5.** You want to handle stable baseline capacity with regular Fargate and extra load with a cheaper option, tolerating some interruptions. What is the appropriate configuration?

A) Run all tasks with the EC2 launch type

B) Mix Fargate + Fargate Spot with a capacity provider strategy

C) Run all tasks on Fargate Spot

D) Apply only the spread placement strategy

**Answer: B**

Explanation: By mixing regular Fargate and Fargate Spot by ratio with a **Capacity Provider Strategy**, you get stability for baseline capacity from regular Fargate, which is not reclaimed, and cut cost for additional capacity with Spot, which is up to 70% cheaper. Spot gives a 2-minute reclaim notice, so it suits workloads that can tolerate some interruptions. A) EC2 carries the burden of managing instances. C) With all Spot, the whole service is shaken when capacity is reclaimed. D) A placement strategy alone cannot blend cost and stability.

---

**Question 6.** You want to run an application container and a helper container for log collection together in one task. What is this pattern called, and what is the unit in ECS?

A) Sidecar pattern - multiple containers in one task

B) Microservices - each as a separate service

C) Monolithic - a single container

D) Fan-out - using SNS

**Answer: A**

Explanation: Defining a main container and helper (logging, proxy, monitoring) containers together in one task definition and launching them as the same task is the **sidecar pattern**. Containers in the same task share the network and volumes, so the helper container can process the main container's logs and traffic up close. B splits them into separate tasks/services, so they do not coexist within one task. C is a single container, so there is no helper container concept. D is a messaging pattern and is irrelevant.

---

**Question 7.** What is the technical foundation that lets Fargate provide strong isolation together with fast start times in a multi-tenant environment?

A) Allocating a dedicated physical server to each customer

B) Firecracker microVM (lightweight per-task virtualization)

C) A single shared kernel with only namespaces applied

D) Docker bridge network

**Answer: B**

Explanation: Fargate puts each task (or a small group of tasks) in a **Firecracker microVM**, reinforcing the "weak isolation from a shared kernel" of ordinary containers with VM-level isolation. Firecracker starts in about 125 ms with less than 5 MB of overhead, achieving both the strong isolation of a VM and the fast start of a container. Lambda uses the same technology. A) Dedicated physical servers per customer are inefficient and not how Fargate actually works. C) Namespaces alone give weak multi-tenant isolation. D) Bridge is just a network mode, not an isolation technology.
