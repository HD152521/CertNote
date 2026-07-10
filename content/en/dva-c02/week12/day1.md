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

## 📝 연습 문제

**문제 1.** ECS task definition에 Secrets Manager 비밀을 환경 변수로 주입하도록 설정했는데, 태스크가 시작조차 되지 않고 비밀을 가져오지 못한다. 원인은?

A) taskRole에 DynamoDB 권한이 없다

B) executionRole에 `secretsmanager:GetSecretValue` 권한이 없다

C) 컨테이너 포트가 잘못 설정됐다

D) 네트워크 모드가 bridge다

**정답: B**

해설: Secrets Manager secret을 가져와 환경 변수로 **주입하는 일은 컨테이너가 뜨기 전, ECS 인프라(에이전트)가 하는 작업**이므로 **executionRole**의 권한이 필요하다. 앱이 실행 중 직접 Secrets Manager를 호출하는 게 아니라 시작 시점에 주입되는 것이라, taskRole이 아니다. A) taskRole 권한은 앱이 런타임에 AWS 서비스를 호출할 때 쓰이며, 여기선 태스크가 시작도 못 했으므로 무관하다. C·D는 비밀 주입 실패와 관계없다. "비밀 주입 = 시작 시점 = executionRole"로 기억한다.

---

**문제 2.** Fargate 태스크가 사용할 수 있는 네트워크 모드와 그 이유로 옳은 것은?

A) bridge — 포트 충돌을 피하려고

B) host — 성능이 가장 좋아서

C) awsvpc — Fargate는 호스트를 노출하지 않아 태스크별 ENI를 주는 방식만 일관되기 때문

D) none — 보안상 네트워크를 막으려고

**정답: C**

해설: Fargate는 사용자에게 EC2 호스트를 노출하지 않으므로, "호스트 네트워크를 공유"하는 host나 "호스트의 브리지에 NAT"하는 bridge 개념을 줄 수 없다. 호스트가 보이지 않는데 그 네트워크를 공유할 방법이 없기 때문이다. 그래서 **각 태스크에 VPC 안의 독립 ENI(자체 사설 IP, 자체 보안 그룹)를 부여하는 awsvpc만** 일관된 선택이 되어 강제된다. A·B는 Fargate에서 불가능한 모드이고, D는 외부 통신이 막혀 실용성이 없다.

---

**문제 3.** 비용을 최소화하기 위해 EC2 시작 유형에서 가능한 한 적은 수의 인스턴스에 태스크를 몰아넣고 싶다. 적절한 배치 전략은?

A) spread

B) binpack

C) random

D) Fargate Spot

**정답: B**

해설: **binpack**은 CPU·메모리가 가장 적게 남은 인스턴스부터 채워, 결과적으로 사용하는 인스턴스 수를 최소화한다. 이는 고전적인 빈 패킹 문제의 그리디 휴리스틱으로, 유휴 인스턴스를 없애 비용을 줄인다. A) spread는 정반대로 AZ·인스턴스에 균등 분산해 가용성을 높이지만 인스턴스가 더 많이 필요하다. C) random은 비용·가용성 어느 쪽도 최적화하지 않는다. D) Fargate Spot은 배치 전략이 아니라 용량 공급자 옵션이다.

---

**문제 4.** CI 파이프라인이 길게 실행되던 중 ECR push가 갑자기 "authentication" 오류로 실패하기 시작했다. 가장 가능성 높은 원인은?

A) 이미지가 너무 커서

B) `get-login-password`로 받은 인증 토큰이 12시간을 넘겨 만료됨

C) ECR 수명 주기 정책이 이미지를 삭제함

D) 취약점 스캔이 푸시를 차단함

**정답: B**

해설: ECR의 `get-login-password`가 발급하는 docker 인증 토큰은 **12시간** 유효하다. 파이프라인이 그보다 오래 실행되면 토큰이 만료되어 push/pull이 인증 오류를 낸다. 해결은 작업 직전에 다시 로그인(토큰 재발급)하는 것이다. A) 크기는 인증 오류와 무관하다. C) 수명 주기 정책은 오래된 이미지를 지울 뿐 인증을 막지 않는다. D) 취약점 스캔은 푸시 후 동작하며 인증 단계를 막지 않는다.

---

**문제 5.** 안정적인 기본 용량은 정규 Fargate로, 추가 부하는 비용이 싼 옵션으로 처리하되 일부 중단을 감내하려 한다. 적절한 구성은?

A) 모든 태스크를 EC2 시작 유형으로

B) 용량 공급자 전략으로 Fargate + Fargate Spot 혼합

C) 모든 태스크를 Fargate Spot으로

D) spread 배치 전략만 적용

**정답: B**

해설: **용량 공급자 전략(Capacity Provider Strategy)** 으로 정규 Fargate와 Fargate Spot을 비율로 섞으면, 기본 용량은 회수되지 않는 정규 Fargate로 안정성을 확보하고 추가 용량은 최대 70% 싼 Spot으로 비용을 줄인다. Spot은 2분 전 회수 통보가 오므로 일부 중단을 감내하는 워크로드에 적합하다. A) EC2는 인스턴스 관리 부담이 있다. C) 전부 Spot이면 회수 시 서비스가 통째로 흔들린다. D) 배치 전략만으로는 비용·안정성 배합을 못 한다.

---

**문제 6.** 한 태스크 안에 애플리케이션 컨테이너와 로그 수집용 보조 컨테이너를 함께 실행하려 한다. 이를 가리키는 패턴과 ECS에서의 단위는?

A) 사이드카(sidecar) 패턴 — 한 태스크 안 여러 컨테이너

B) 마이크로서비스 — 각각 별도 서비스

C) 모놀리식 — 단일 컨테이너

D) 팬아웃 — SNS 사용

**정답: A**

해설: 한 태스크 정의 안에 주 컨테이너와 보조(로깅·프록시·모니터링) 컨테이너를 함께 정의해 같은 태스크로 띄우는 것이 **사이드카 패턴**이다. 같은 태스크의 컨테이너들은 네트워크·볼륨을 공유하므로 보조 컨테이너가 주 컨테이너의 로그·트래픽을 가까이서 처리할 수 있다. B는 별도 태스크/서비스로 쪼개는 것이라 한 태스크 안 공존이 아니다. C는 단일 컨테이너라 보조 컨테이너 개념이 없다. D는 메시징 패턴으로 무관하다.

---

**문제 7.** Fargate가 멀티테넌트 환경에서 강한 격리를 빠른 시작 시간과 함께 제공하는 기술적 토대는?

A) 고객마다 전용 물리 서버 할당

B) Firecracker microVM(태스크별 경량 가상화)

C) 단일 공유 커널에 namespace만 적용

D) Docker bridge 네트워크

**정답: B**

해설: Fargate는 각 태스크(또는 작은 묶음)를 **Firecracker microVM**에 넣어, 일반 컨테이너의 "커널 공유로 인한 약한 격리"를 VM 수준 격리로 보강한다. Firecracker는 5MB 미만 오버헤드로 약 125ms 안에 떠서 VM의 강한 격리와 컨테이너의 빠른 시작을 동시에 달성한다. Lambda도 같은 기술을 쓴다. A) 고객별 전용 물리 서버는 비효율적이고 Fargate의 실제 방식이 아니다. C) namespace만으로는 멀티테넌트 격리가 약하다. D) bridge는 네트워크 모드일 뿐 격리 기술이 아니다.
