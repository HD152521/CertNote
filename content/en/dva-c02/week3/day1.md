# Day 1 - The Lambda Execution Model: How Firecracker MicroVMs Run Your Functions

In 2014, Amazon was facing a serious internal problem. The container-based function execution environment running on top of EC2 had weak multi-tenancy security isolation, and cold starts stretched into several seconds. Lambda, announced that same year, initially ran on containers (LXC), but this model had fuzzy security boundaries and low density (the number of concurrent executions per unit of hardware). As the solution, AWS unveiled **Firecracker** at AWS re:Invent 2018. Written in Rust, this MicroVM hypervisor achieves sub-125ms boot times and under 5MB of memory overhead. Lambda has run on top of Firecracker since 2019.

Once you understand Firecracker, Lambda's execution model comes into focus at a glance. A traditional VM (QEMU-based) implements hundreds of virtual devices in its emulation layer. Firecracker throws away most of them, keeping only a minimal virtual NIC, block device, serial port, and keyboard. As a result its code size stays under 50,000 lines, making the attack surface extremely small. Because it uses KVM (the hypervisor layer in the Linux kernel) directly, it leverages Intel VT-x / AMD-V hardware virtualization, and Rust's memory safety cuts off entire classes of bugs at the root.

## The Lifecycle of a Lambda Execution Environment: INIT → INVOKE → SHUTDOWN

A Lambda execution environment goes through three phases on top of a Firecracker MicroVM.

**The INIT phase** is the essence of a cold start. The Lambda service first boots the MicroVM, then brings up the runtime process (the Python interpreter, JVM, Node.js process, and so on). Next it pulls the code out of the ZIP/container and lands it in `/var/task`, at which point `import` or class loading happens. Finally, the code outside the handler — global variable declarations, DB connection initialization, config file loading — runs. This whole thing is INIT, and the first request's response is delayed by exactly this much time.

**The INVOKE phase** is the execution of the handler function itself. The event is passed to the handler, and when the function returns a response, the Lambda service collects the result. A warm start is fast because only this phase runs.

**The SHUTDOWN phase** is the process by which the Lambda service reclaims the MicroVM when there have been no invocations for a certain period (roughly a few minutes to an hour — AWS does not publish the exact value). When the next invocation of the same function arrives afterward, everything starts again from INIT.

```python
import json
import boto3
import logging

# Runs in the INIT phase — once per cold start
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Put the DB connection outside the handler so it is reused on warm starts
s3_client = boto3.client('s3')
_db_connection = None

def get_db():
    global _db_connection
    if _db_connection is None:
        # In practice, an RDS Proxy or pymysql connection
        _db_connection = create_connection()
    return _db_connection

def lambda_handler(event, context):
    """Runs in the INVOKE phase — on every invocation"""
    logger.info(f"Function: {context.function_name}, time remaining: {context.get_remaining_time_in_millis()}ms")
    
    db = get_db()  # On a warm start, returns the already-connected object
    
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'ok'})
    }
```

> 💡 **Related theory**: Lambda's rule that "one environment processes only one request at a time" is the same as **shared-nothing functional programming**. A pure function returns the same output for the same input and has no side effects. But Lambda caches state in global variables — this is a deliberately permitted optimization. The key point is that this state is visible to the next invocation in the same environment, but completely invisible to a different environment (a different MicroVM). In distributed systems design, this is called a "local cache".

## Dissecting the Cold Start: What Takes How Long

Cold start latency can be broken into three segments.

**Runtime initialization**: Python takes tens of ms, Java (JVM boot) takes hundreds of ms to over a second, Go/Rust take a few ms. The reason the JVM is slow is that it needs class loading and JIT compilation warmup.

**Code initialization**: Loading large packages like `import boto3`, `import pandas`. pandas itself is over 50MB and links native numpy C extensions. Even if you split it into a layer, you still have to load it from `/opt` in the end. Code size directly affects this.

**INIT code execution**: DB connections, HTTP client initialization, loading secrets from SSM/Secrets Manager. This part is the single biggest variable a developer can control.

| Runtime | Typical cold start | After package optimization |
|--------|----------------|----------------|
| Python 3.12 | 200–500ms | 100–200ms |
| Node.js 20.x | 100–300ms | 50–150ms |
| Java 21 (JVM) | 1000–3000ms | 500–1000ms |
| Java 21 (SnapStart) | 100–300ms | 100–300ms |
| Go 1.x | 50–150ms | 30–100ms |
| .NET 8 | 300–800ms | 200–500ms |

> 💡 **Related theory**: SnapStart is an implementation of the **checkpointing** idea in Java. It draws on a Linux technology called CRIU (Checkpoint/Restore In Userspace), which snapshots a process's memory state and restores it later. Lambda SnapStart saves a snapshot to S3 of the fully-initialized JVM state at the moment a version is published. On subsequent invocations, the MicroVM restores that snapshot as-is, skipping JVM boot and code INIT. That said, things like the current time, random seeds, and environment-specific credentials need to be re-initialized when the snapshot is restored. The `CRaC` (Coordinated Restore at Checkpoint) API lets you hook into this moment.

> ⚠️ **Trap**: SnapStart is **only activated when you publish a version**. It does not work on `$LATEST`. So you have to use it together with a Lambda alias, and it is common to configure CodeDeploy traffic shifting alongside it.

## Provisioned Concurrency vs Reserved Concurrency: Completely Different Purposes

Confusing these two concepts is the single most common cause of failing the exam.

**Reserved Concurrency** is both the ceiling and the floor of a function's concurrency. If you set `put-function-concurrency --reserved-concurrent-executions 100`, this function runs at most 100 MicroVMs concurrently. At the same time, 100 slots are reserved exclusively for this function out of the account-wide concurrency pool, so no other function can use them. If you set it to 0, every invocation immediately gets a ThrottlingException 429 — a way to soft-disable a function. **Reserved has no cost.**

**Provisioned Concurrency** is the feature that eliminates cold starts in advance. If you set `put-provisioned-concurrency-config --provisioned-concurrent-executions 20`, 20 MicroVMs are always kept on standby in a warm state, having completed INIT. Even when a request arrives, only the INVOKE phase runs immediately. **This can only be set on a version or an alias — never on `$LATEST`.** The cost is billed as the number of initialized MicroVMs × time × GB.

```bash
# Set Reserved Concurrency (ceiling + dedicated allocation)
aws lambda put-function-concurrency \
  --function-name payment-service \
  --reserved-concurrent-executions 200

# Provisioned Concurrency (set on a version — not allowed on $LATEST)
aws lambda publish-version \
  --function-name payment-service
# Output: {"Version": "5"}

aws lambda put-provisioned-concurrency-config \
  --function-name payment-service \
  --qualifier 5 \
  --provisioned-concurrent-executions 20

# Or set it on an alias
aws lambda create-alias \
  --function-name payment-service \
  --name prod \
  --function-version 5

aws lambda put-provisioned-concurrency-config \
  --function-name payment-service \
  --qualifier prod \
  --provisioned-concurrent-executions 20
```

> 💡 **Related theory**: Provisioned Concurrency also integrates with auto scaling. With an Application Auto Scaling **target tracking** policy, you can automatically increase Provisioned Concurrency when the `ProvisionedConcurrencyUtilization` metric exceeds 80%. If you have a predictable traffic pattern (a 9 AM spike), it is also common to raise it ahead of time with **scheduled scaling**.

## Lambda Limits: The Numbers That Show Up on the Exam

| Item | Limit | Notes |
|------|------|------|
| Memory | 128MB – 10,240MB | Increases in 64MB steps |
| vCPU | Proportional to memory | 1,769MB = 1 vCPU |
| Timeout | 1s – 900s | 15 minutes |
| /tmp storage | 512MB – 10,240MB | |
| Total environment variable size | 4KB | |
| Synchronous payload (request/response) | 6MB | |
| Asynchronous payload | 256KB | |
| Response Streaming | 20MB | Function URL or API Gateway |
| Direct ZIP upload | 50MB | |
| ZIP via S3 | 250MB (uncompressed) | |
| Container image | 10GB | |
| Account/region default concurrency | 1,000 | Increase can be requested |
| Initial burst limit | 500–3,000 | Varies by region |
| Additional concurrency per minute | +500 | |
| Maximum number of layers | 5 | |
| Layers + code total | 250MB | Uncompressed basis |

> 🔍 **Going deeper**: The number `1,769MB = 1 vCPU` is a ratio fixed at Lambda's design time. A 256MB function gets about 0.145 vCPU. This ratio is the core reason that increasing memory improves performance on CPU-bound work. Because it is nonlinear, doubling memory does not always mean double the speed, but for CPU-intensive work (image processing, encryption, JSON serialization), a memory increase can shorten execution time so much that the GB-second cost actually goes down.

## VPC Lambda and the Hyperplane ENI

VPC Lambda was notorious before 2019. Every time a function attached to a VPC, it created a new ENI (Elastic Network Interface), and ENI creation took 10–30 seconds. On scale-out you had to create dozens of ENIs, so cold starts exploded.

In September 2019, AWS introduced the **Hyperplane ENI**. The core idea is that instead of creating an ENI per function instance, you place a NAT layer shared across a VPC configuration (a subnet + SG combination). Execution environments share the Hyperplane network layer, and that layer maintains the VPC ENI. As a result, ENI creation happens only once on the first VPC attachment, and ENIs are reused on subsequent scaling.

```bash
# Create a VPC-attached Lambda
aws lambda create-function \
  --function-name rds-connector \
  --runtime python3.12 \
  --handler handler.lambda_handler \
  --role arn:aws:iam::123:role/LambdaVpcRole \
  --zip-file fileb://function.zip \
  --vpc-config SubnetIds=subnet-abc,subnet-def,SecurityGroupIds=sg-xyz \
  --timeout 30 \
  --memory-size 256
```

> ⚠️ **Trap**: A Lambda attached to a VPC **cannot access the internet directly**. Placing it in a public subnet makes no difference — Lambda enters the VPC through an ENI but does not receive a public IP. If you need the internet, you need a NAT Gateway + private subnet, or a VPC Endpoint (for AWS services). A common trap in the scenario "my Lambda can't reach Secrets Manager" is that the VPC Lambda has no VPC Endpoint.

## Lambda's Permission Model: Two Kinds of Policy

The IAM policies related to a Lambda function are two completely different kinds.

**The Execution Role** is the role Lambda uses when the function calls other AWS services. When you do `boto3.client('s3').put_object(...)` inside the function code, it acts with this role's permissions.

**The Resource-based Policy (Function Policy)** points the other way. It controls "who is allowed to invoke this Lambda". For S3 to trigger the Lambda, for SNS to invoke it, for API Gateway to invoke it — all of these require the principal to be registered in this policy.

```bash
# Grant API Gateway permission to invoke the Lambda
aws lambda add-permission \
  --function-name my-api \
  --statement-id apigateway-prod-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:ap-northeast-2:123456789:abc123/prod/*/orders"
```

> 💡 **Related theory**: These two policies correspond exactly to IAM's distinction between **identity-based policy and resource-based policy**. Identity-based is "what can I (the principal) do", resource-based is "who can access this resource". The same dichotomy applies to S3 bucket policies, SQS queue policies, and KMS key policies.

## Lambda Extensions: The Sidecar Pattern

A Lambda Extension is a separate process that runs alongside the function. An **external extension** runs as an independent process; if you place a binary at the `/opt/extensions/` path, the Lambda service runs it side by side with the function. An **internal extension** runs inside the runtime, in the form of a language-specific wrapper.

The one used most in practice is the **AWS Parameters and Secrets Lambda Extension**. When the function code sends an HTTP request to `localhost:2773`, this extension caches and returns SSM Parameter Store or Secrets Manager values. If the function calls the Secrets Manager API on every invocation, it incurs cost and adds latency, but because the extension keeps a cache for the duration of the TTL, the number of API calls drops dramatically.

> 📚 **Case study**: APM vendors like Datadog, Dynatrace, and New Relic make use of Lambda Extensions. Previously you had to embed an SDK inside the Lambda function code, but through an Extension you can collect metrics and traces without modifying the function code. It was officially announced at AWS re:Invent 2020, and this pattern is philosophically identical to the sidecar pattern in microservices (Envoy, Istio).

## Comparing With Other Clouds: Differences Between FaaS Implementations

| Item | AWS Lambda | GCP Cloud Functions (Gen 2) | Azure Functions |
|------|-----------|----------------------------|-----------------|
| Isolation | Firecracker MicroVM | gVisor (Linux syscall emulation) | Hyper-V container |
| Cold start (Python) | 200–500ms | 100–300ms | 200–600ms |
| Max execution time | 15 min | 60 min (HTTP), 9 min (event) | 10 min (Consumption) |
| Max memory | 10GB | 16GB | 14GB |
| VPC integration | ✅ | ✅ | ✅ |
| Snapshotting | SnapStart (Java) | None | None |
| Pricing model | Requests + GB-seconds | Requests + GHz-seconds | Requests + GB-seconds |

> 🔍 **Going deeper**: gVisor is a container sandbox built by Google that inserts a kernel emulation layer, written in Go, between the app and the Linux kernel. Unlike Firecracker, which is a real MicroVM (hardware virtualization), gVisor is syscall interception, so its overhead profile differs. Because Firecracker uses KVM, it is closer to bare-metal on CPU-intensive work, whereas gVisor can incur higher overhead on I/O-intensive work with many system calls. Academically, the 2018 OSDI paper "gVisor: Reducing Security Overhead with OS-level Virtualization" is the reference.

## Response Streaming: TTFB Optimization

Lambda Response Streaming, released in 2023, lets a function stream its response in chunks instead of building the whole response and sending it all at once. It is based on HTTP chunked transfer encoding and can stream up to 20MB.

**Use cases**: token-by-token streaming after an LLM API call (like OpenAI), downloading large JSON files, notifying progress of a video conversion.

**Limitation**: Supported only on Function URLs or API Gateway HTTP API (payload v2.0). REST API is not supported.

```python
import json

def lambda_handler(event, context):
    # Use the streamify decorator (Node.js) or
    # use awslambdaric's streaming response directly in Python
    def generate():
        for i in range(10):
            yield json.dumps({"chunk": i, "data": "..." * 100}) + "\n"
    
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/x-ndjson"},
        "body": generate()  # Returning an iterator makes Lambda stream it in chunks
    }
```

## The Billing Model: How to Calculate Cost From Code

Lambda cost comes from two things: **number of requests** and **GB-seconds**.

```
Example monthly cost calculation:
- Function memory: 512MB = 0.5GB
- Daily invocations: 1,000,000
- Average execution time: 300ms

GB-seconds/month = 0.5 × 0.3 × 1,000,000 × 30 = 4,500,000 GB-seconds
Free tier: 400,000 GB-seconds

Billed GB-seconds: 4,100,000
Cost: 4,100,000 × $0.0000166667 = $68.33/month
Request cost: 30,000,000 × $0.20 / 1,000,000 = $6/month
Total: about $74.33/month
```

> 💡 **Related theory**: Lambda's GB-second billing is, economically, a variant of **time-based pricing**. Since vCPU is proportional to memory, if you want more CPU you have to buy more memory. This is a different approach from EC2's instance type selection (c5 = compute optimized, r5 = memory optimized). If you use the AWS Lambda Power Tuning tool, it automatically benchmarks execution time and cost across multiple memory settings to find the optimal configuration.

## Wrapping Up

Lambda's execution model is built on top of the inventive infrastructure that is the Firecracker MicroVM. Cold starts are the inevitable cost of the INIT phase, and Provisioned Concurrency and SnapStart are two different approaches to reducing that cost. VPC Lambda became practical after the Hyperplane ENI, and Extensions make Lambda more observable. Once you understand all of these mechanisms, real-world problems like "why is this function slow on the first request?" or "why can't it reach RDS?" get diagnosed instantly.

In the next article, we dig into what events trigger this Lambda function, and into the internal polling mechanism of the SQS, Kinesis, and DynamoDB Streams event source mappings.

---

## 📝 연습 문제

**문제 1.** What is the most accurate description of Lambda SnapStart?

A) It is enabled by default on all runtimes  
B) It creates a snapshot of the initialized JVM at the moment a version is published, and does not work on $LATEST  
C) It incurs an additional cost proportional to the memory size  
D) It cannot be activated at the same time as Provisioned Concurrency  

**정답: B**  
해설: SnapStart saves the initialized JVM state as a snapshot at the moment of publish-version. It cannot be set on `$LATEST`, so you must invoke it through a published version or an alias that points to that version. A is wrong — only the Java runtime is supported, and it is disabled by default. C is wrong — SnapStart itself is free (only a negligible S3 cost for storing the snapshot). D is wrong — they can be used together.

---

**문제 2.** How many vCPUs does a Lambda function with 1,769MB of memory get?

A) 0.5 vCPU  
B) 1 vCPU  
C) 2 vCPU  
D) Memory and vCPU are unrelated  

**정답: B**  
해설: Lambda allocates CPU at a ratio of 1,769MB = 1 vCPU. 512MB is about 0.29 vCPU, and 3,008MB is about 1.7 vCPU. Because of this, for CPU-intensive work (JSON serialization, encryption, image processing), increasing memory can shorten execution time so that the GB-second cost actually goes down. The AWS Lambda Power Tuning tool can automatically find the optimal memory.

---

**문제 3.** A Lambda function is attached to a VPC and needs to call an internet API. What configuration is required?

A) Remove the VPC attachment and switch to a public Lambda  
B) Place the function in a public subnet  
C) Route outbound internet traffic through a private subnet and a NAT Gateway  
D) Add an HTTPS (443) inbound rule to the Security Group  

**정답: C**  
해설: A VPC Lambda receives a VPC-internal address through an ENI but has no public IP. Placing it in a public subnet does not let it out to the internet. Internet access requires a private subnet + NAT Gateway, or a private subnet + VPC Endpoint (for AWS services only). As in B, placing it in a public subnet is meaningless because the Lambda ENI is not routed through an IGW.

---

**문제 4.** Which of the following about Provisioned Concurrency and Reserved Concurrency is correct?

A) Both features can be set on the $LATEST version  
B) Reserved Concurrency keeps pre-initialized environments to prevent cold starts  
C) Provisioned Concurrency can only be set on a function version or alias, while Reserved Concurrency is set on the function itself, including $LATEST  
D) Both features incur additional cost  

**정답: C**  
해설: Provisioned Concurrency is the feature that keeps initialized execution environments and must be set on a version number or an alias (not allowed on $LATEST). Reserved Concurrency is a concurrency ceiling applied to the whole function that affects all invocations including $LATEST, and has no cost. B is wrong — Reserved has nothing to do with cold starts. D is wrong — Reserved is free.

---

**문제 5.** Which is correct about the difference between Destination and DLQ in Lambda asynchronous invocation?

A) DLQ handles both success and failure, and Destination handles only failure  
B) Destination can handle both success and failure, and supports SQS, SNS, EventBridge, and Lambda as targets  
C) DLQ supports EventBridge as a target, but Destination does not  
D) The two features are functionally identical and differ only in cost  

**정답: B**  
해설: A Destination can send events for both the success (OnSuccess) and failure (OnFailure) of an asynchronous invocation, to SQS, SNS, EventBridge, and Lambda targets, and it delivers rich context including request and response metadata. A DLQ, by contrast, sends only the final failure event to SQS or SNS, and includes only the basic payload. AWS recommends using Destinations for new designs.

---

**문제 6.** What is the correct reason to use global variables in a Lambda function?

A) Lambda is multi-threaded, so it needs thread-local storage  
B) To skip INIT code and improve warm-start performance when the same execution environment is reused  
C) To share state across multiple function instances  
D) Global variables are not recommended in Lambda  

**정답: B**  
해설: When a Lambda execution environment (MicroVM) is reused in a warm state, the global variable initialization code run during INIT is not run again. If you put DB connections, boto3 clients, config files, and so on in globals, they are reused on warm starts, greatly reducing response time. But C is wrong — global variables are not shared across different MicroVM instances. Each instance has a completely separate memory space.

---

**문제 7.** What is the correct description of Lambda Extensions?

A) Lambda Extensions run only inside the function code  
B) An external extension runs as a separate process from the function and keeps running through the SHUTDOWN phase even after the function finishes  
C) Lambda Extensions incur no additional charge but share the function timeout  
D) An external extension runs outside the function's memory limit  

**정답: B**  
해설: An external Lambda Extension is an independent process placed at `/opt/extensions/` that the Lambda service starts side by side with the function. It runs concurrently with the function during the INVOKE phase and performs cleanup during the SHUTDOWN phase. C is wrong — the extension also shares the function's timeout (max 15 minutes). D is wrong — the extension runs within the function's memory limit, so if the extension uses a lot of memory, the memory available to the function decreases. Therefore, when using extensions, you should increase memory sufficiently.
