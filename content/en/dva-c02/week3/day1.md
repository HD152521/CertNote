# Day 1 - Lambda Execution Model: How Firecracker MicroVMs Run Your Function

In 2014, Amazon was facing a serious internal problem. Container-based function execution environments running on top of EC2 had weak multi-tenant security isolation, and cold starts took several seconds. Lambda, announced that same year, initially ran on containers (LXC), but that model had unclear security boundaries and low density (concurrent executions per piece of hardware). As the solution, AWS unveiled **Firecracker** at AWS re:Invent 2018. It is a MicroVM hypervisor written in Rust that boots in under 125ms with a memory overhead of under 5MB. Lambda has run on Firecracker since 2019.

Once you understand Firecracker, Lambda's execution model becomes clear at a glance. A traditional VM (QEMU-based) has an emulation layer that implements hundreds of virtual devices. Firecracker throws most of that away and keeps only a minimal virtual NIC, block device, serial port, and keyboard. As a result, the code base is under 50,000 lines, making the attack surface extremely small. Because it reuses KVM (the hypervisor layer of the Linux kernel) as is, it uses Intel VT-x / AMD-V hardware virtualization, and Rust's memory safety blocks bugs at the source.

## The Lambda Execution Environment Lifecycle: INIT → INVOKE → SHUTDOWN

A Lambda execution environment goes through three phases on top of a Firecracker MicroVM.

The **INIT phase** is the essence of a cold start. The Lambda service first boots the MicroVM and brings up the runtime process (a Python interpreter, a JVM, a Node.js process, and so on). Then it pulls the code out of the ZIP/container and places it in `/var/task`, and `import`s or class loading happen. Finally, the code outside the handler — global variable declarations, DB connection initialization, config file loading — runs. All of this is INIT, and the first request's response is slower by exactly this much time.

The **INVOKE phase** is the execution of the handler function itself. The event is passed to the handler, and when the function returns a response, the Lambda service collects the result. A warm start is fast because only this phase runs.

The **SHUTDOWN phase** is the process in which the Lambda service reclaims the MicroVM when there have been no invocations for a certain period (roughly several minutes to an hour; AWS does not publish the exact value). When a call to the same function arrives afterward, it starts again from INIT.

```python
import json
import boto3
import logging

# Runs in the INIT phase — once per cold start
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Keep the DB connection outside the handler so it is reused on warm starts
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
    logger.info(f"Function: {context.function_name}, remaining time: {context.get_remaining_time_in_millis()}ms")
    
    db = get_db()  # On a warm start, returns the already-connected object
    
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'ok'})
    }
```

## Anatomy of a Cold Start: What Takes How Long

Cold start latency can be divided into three segments.

**Runtime initialization**: Python takes tens of ms, Java (JVM boot) takes hundreds of ms to over 1 second, and Go/Rust take a few ms. The JVM is slow because it needs class loading and JIT compilation warmup.

**Code initialization**: Loading large packages such as `import boto3` or `import pandas`. pandas alone is over 50MB and links numpy's C extensions. Even if you split it into a layer, it still has to be loaded from `/opt`. Code size has a direct effect.

**INIT code execution**: DB connections, HTTP client initialization, loading secrets from SSM/Secrets Manager. This is the biggest variable that developers can control.

| Runtime | Typical cold start | After package optimization |
|--------|----------------|----------------|
| Python 3.12 | 200–500ms | 100–200ms |
| Node.js 20.x | 100–300ms | 50–150ms |
| Java 21 (JVM) | 1000–3000ms | 500–1000ms |
| Java 21 (SnapStart) | 100–300ms | 100–300ms |
| Go 1.x | 50–150ms | 30–100ms |
| .NET 8 | 300–800ms | 200–500ms |

SnapStart implements the idea of **checkpointing** (supported on Java 11+, Python 3.12+, and .NET 8+; the description below uses Java). It draws on a Linux technology called CRIU (Checkpoint/Restore In Userspace), which takes a snapshot of a process's memory state and restores it later. Lambda SnapStart saves the fully initialized JVM state as a snapshot in S3 at the moment a version is published. On later invocations, the MicroVM restores that snapshot as is, so JVM boot and code INIT are skipped. However, things such as the current time, random seeds, and environment-specific credentials need to be re-initialized when the snapshot is restored. You can hook into this point with the `CRaC` (Coordinated Restore at Checkpoint) API.

> ⚠️ **Trap**: SnapStart is **only activated when you publish a version**. It does not work on `$LATEST`. So it must be used together with a Lambda alias, and it is common to also set up CodeDeploy traffic shifting.

## Provisioned Concurrency vs Reserved Concurrency: Completely Different Purposes

The two concepts are easy to confuse.

**Reserved Concurrency** is both the ceiling and the floor of a function's concurrency. If you set it with `put-function-concurrency --reserved-concurrent-executions 100`, this function runs at most 100 MicroVMs at the same time. At the same time, 100 are reserved exclusively for this function out of the account-wide concurrency pool, so other functions cannot use them. If you set it to 0, every invocation immediately receives a ThrottlingException 429 — a way to soft-disable a function. **Reserved has no cost.**

**Provisioned Concurrency** is a feature that eliminates cold starts in advance. If you set `put-provisioned-concurrency-config --provisioned-concurrent-executions 20`, 20 MicroVMs wait at all times in a warm state with INIT already completed. When a request arrives, only the INVOKE phase runs immediately. **This can only be set on a version or an alias, never on `$LATEST`.** It is billed as the number of initialized MicroVMs × time × GB.

```bash
# Set Reserved Concurrency (ceiling + dedicated allocation)
aws lambda put-function-concurrency \
  --function-name payment-service \
  --reserved-concurrent-executions 200

# Provisioned Concurrency (set on a version — $LATEST not allowed)
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

Provisioned Concurrency also integrates with auto scaling. With an Application Auto Scaling **target tracking** policy, you can automatically increase Provisioned Concurrency when the `ProvisionedConcurrencyUtilization` metric exceeds 80%. If you have a predictable traffic pattern (a 9 AM spike), you can also use the pattern of scaling up ahead of time with **scheduled scaling**.

## Lambda Limits: The Numbers That Show Up on the Exam

| Item | Limit | Notes |
|------|------|------|
| Memory | 128MB ~ 10,240MB | Increments of 1MB |
| vCPU | Proportional to memory | 1,769MB = 1 vCPU |
| Timeout | 1 second ~ 900 seconds | 15 minutes |
| /tmp storage | 512MB ~ 10,240MB | |
| Total environment variable size | 4KB | |
| Synchronous payload (request/response) | 6MB | |
| Asynchronous payload | 1MB | Raised from 256KB in October 2025 |
| Response Streaming | 200MB | Raised from 20MB in July 2025 |
| Direct ZIP upload | 50MB | |
| ZIP via S3 | 250MB (unzipped) | |
| Container image | 10GB | |
| Default account/Region concurrency | 1,000 | Increase can be requested |
| Per-function scaling rate | +1,000 every 10 seconds | Per execution environments, applied separately for each function |
| Maximum number of layers | 5 | |
| Layers + code total | 250MB | Measured unzipped |

The number `1,769MB = 1 vCPU` is a ratio fixed when Lambda was designed. A 256MB function gets about 0.145 vCPU. This ratio is the key reason why increasing memory improves performance for CPU-bound work. It is non-linear, so doubling memory does not always mean double the speed, but for CPU-intensive work (image processing, encryption, JSON serialization), increasing memory can shorten execution time enough that the GB-second cost actually goes down.

## VPC Lambda and Hyperplane ENI

VPC Lambda was notorious before 2019. Every time a function connected to a VPC, a new ENI (Elastic Network Interface) was created, and creating an ENI took 10 to 30 seconds. Scaling out required creating dozens of ENIs, so cold starts exploded.

In September 2019, AWS introduced **Hyperplane ENI**. The core idea is that instead of creating an ENI for each function instance, there is a NAT layer that shares the VPC configuration (the subnet + SG combination). The execution environments share the Hyperplane network layer, and that layer maintains the VPC ENI. As a result, ENI creation happens only once at the first VPC connection, and the ENI is reused during later scale-out.

```bash
# Create a VPC-connected Lambda
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

> ⚠️ **Trap**: A Lambda connected to a VPC **cannot access the internet directly**. This is true even if you place it in a public subnet — Lambda enters the VPC through an ENI but does not receive a public IP. If you need the internet, you need a NAT Gateway + private subnet, or a VPC Endpoint (for AWS services). In the scenario "Lambda can't connect to Secrets Manager," a VPC Lambda with no VPC Endpoint is an easy trap.

## The Lambda Permission Model: Two Kinds of Policies

The IAM policies related to a Lambda function are two kinds with completely different natures.

The **Execution Role** is the role the Lambda function uses when it calls other AWS services. When you do `boto3.client('s3').put_object(...)` inside the function code, it operates with this role's permissions.

The **Resource-based Policy (Function Policy)** goes in the opposite direction. It controls "who can invoke this Lambda." For S3 to trigger a Lambda, for SNS to invoke a Lambda, for API Gateway to invoke a Lambda — in every case a principal must be registered in this policy.

```bash
# Grant API Gateway permission to invoke the Lambda
aws lambda add-permission \
  --function-name my-api \
  --statement-id apigateway-prod-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:ap-northeast-2:123456789:abc123/prod/*/orders"
```

## Lambda Extensions: The Sidecar Pattern

Lambda Extensions are separate processes that run alongside the function. An **external extension** runs as an independent process; if you put the binary in the `/opt/extensions/` path, the Lambda service runs it side by side with the function. An **internal extension** runs inside the runtime and takes the form of a per-language wrapper.

A representative one is the **AWS Parameters and Secrets Lambda Extension**. When the function code sends an HTTP request to `localhost:2773`, this extension caches and returns SSM Parameter Store or Secrets Manager values. If the function calls the Secrets Manager API on every invocation, it incurs cost and adds latency, but the extension keeps a cache for the TTL period, so the number of API calls drops dramatically.

APM vendors such as Datadog, Dynatrace, and New Relic use Lambda Extensions. Previously you had to embed an SDK inside the Lambda function code, but with Extensions you can collect metrics and traces without modifying the function code. It was officially announced at AWS re:Invent 2020, and this pattern is philosophically identical to the sidecar pattern of microservices (Envoy, Istio).

## Comparison with Other Clouds: Differences Between FaaS Implementations

| Item | AWS Lambda | GCP Cloud Functions (Gen 2) | Azure Functions |
|------|-----------|----------------------------|-----------------|
| Isolation | Firecracker MicroVM | gVisor (Linux syscall emulation) | Hyper-V container |
| Cold start (Python) | 200–500ms | 100–300ms | 200–600ms |
| Maximum execution time | 15 minutes | 60 minutes (HTTP), 9 minutes (event) | 10 minutes (Consumption) |
| Maximum memory | 10GB | 16GB | 14GB |
| VPC integration | ✅ | ✅ | ✅ |
| Snapshotting | SnapStart (Java, Python, .NET) | None | None |
| Pricing model | Requests + GB-seconds | Requests + GHz-seconds | Requests + GB-seconds |

gVisor is a container sandbox made by Google that inserts a kernel emulation layer written in Go between the app and the Linux kernel. Unlike Firecracker, which is a real MicroVM (hardware virtualization), gVisor intercepts syscalls, so the overhead is different. Because Firecracker uses KVM, it is closer to bare metal for CPU-intensive work, while gVisor's overhead can grow for I/O-intensive work with many system calls.

## Response Streaming: TTFB Optimization

Lambda Response Streaming, released in 2023, lets a function stream its response in chunks instead of building the whole response and sending it at once. It is based on HTTP chunked transfer encoding and can stream up to 200MB (raised from 20MB in July 2025). After the first 6MB, bandwidth is limited to 2MB per second.

**Use cases**: token-by-token streaming after an LLM API call (like OpenAI), large JSON file downloads, video conversion progress notifications.

**Invocation paths**: Stream through a Function URL, the `InvokeWithResponseStream` API, or API Gateway's Lambda proxy integration (response transfer mode: stream). Managed runtimes support only Node.js; other languages use a custom runtime or the Lambda Web Adapter.

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
        "body": generate()  # If you return an iterator, Lambda streams it in chunks
    }
```

## Pricing Model: How to Calculate Cost from Code

Lambda cost comes from two things: **number of requests** and **GB-seconds**.

```
Monthly cost calculation example:
- Function memory: 512MB = 0.5GB
- Daily invocations: 1 million
- Average execution time: 300ms

GB-seconds/month = 0.5 × 0.3 × 1,000,000 × 30 = 4,500,000 GB-seconds
Free tier: 400,000 GB-seconds

Billed GB-seconds: 4,100,000
Cost: 4,100,000 × $0.0000166667 = $68.33/month
Request cost: 30,000,000 × $0.20 / 1,000,000 = $6/month
Total: about $74.33/month
```

Because vCPU is proportional to memory, if you want more CPU you have to buy more memory. This differs from how you choose EC2 instance types (c5 = compute optimized, r5 = memory optimized). With the AWS Power Tuning Tool, you can automatically benchmark execution time and cost at several memory settings to find the optimal one.

## Summary

Lambda's execution model is built on a distinctive piece of infrastructure, the Firecracker MicroVM. A cold start is the unavoidable cost of the INIT phase, and Provisioned Concurrency and SnapStart are two different approaches to reducing that cost. VPC Lambda became practical after Hyperplane ENI, and Extensions make Lambda more observable. Once you understand all of these mechanisms, practical problems such as "why is this function slow on the first request?" or "why can't it connect to RDS?" can be diagnosed immediately.

In the next article, we will dig into which events trigger this Lambda function, and the internal polling mechanism of SQS, Kinesis, and DynamoDB Streams event source mappings.

---

## 📝 Practice Questions

**Question 1.** What is the most accurate description of Lambda SnapStart?

A) It is enabled by default on all runtimes  
B) It creates a snapshot of the initialized JVM at the time a version is published, and it does not work on $LATEST  
C) It incurs additional cost proportional to memory size, even on Java managed runtimes  
D) Provisioned Concurrency must be configured alongside it  

**Answer: B**  
Explanation: SnapStart saves the JVM's initialized state as a snapshot at the time of version publishing (publish-version). It cannot be set on `$LATEST`, so you must invoke through a published version or an alias pointing to that version. A is wrong — it is not available on every runtime (only Java 11+, Python 3.12+, and .NET 8+), and it is disabled by default, so you must publish a version and enable SnapStart. C is wrong — there is no additional cost on Java managed runtimes (Python/.NET incur separate cache and restore charges). D is wrong — Provisioned Concurrency is not required; in fact SnapStart cannot be used together with Provisioned Concurrency.

---

**Question 2.** How many vCPUs does a Lambda function with 1,769MB of memory receive?

A) 0.5 vCPU  
B) 1 vCPU  
C) 2 vCPU  
D) Memory and vCPU are unrelated  

**Answer: B**  
Explanation: Lambda allocates CPU at the ratio 1,769MB = 1 vCPU. 512MB gets about 0.29 vCPU, and 3,008MB gets about 1.7 vCPU. For this reason, in CPU-intensive work (JSON serialization, encryption, image processing), increasing memory can shorten execution time so that the GB-second cost actually goes down. The AWS Lambda Power Tuning tool can find the optimal memory automatically.

---

**Question 3.** A Lambda function connected to a VPC needs to call an internet API. What configuration is required?

A) Remove the VPC connection and switch to a public Lambda  
B) Place the function in a public subnet  
C) Route outbound internet traffic through a private subnet and a NAT Gateway  
D) Add an HTTPS (443) inbound rule to the Security Group  

**Answer: C**  
Explanation: A VPC Lambda gets an address inside the VPC through an ENI but has no public IP. Even if placed in a public subnet, it cannot reach the internet. Internet access requires the combination of a private subnet + NAT Gateway, or a private subnet + VPC Endpoint (for AWS services only). Even if you place it in a public subnet as in B, the Lambda ENI is not routed through the IGW, so it is meaningless.

---

**Question 4.** Which of the following statements about Provisioned Concurrency and Reserved Concurrency is correct?

A) Both features can be set on the $LATEST version  
B) Reserved Concurrency keeps pre-initialized environments to prevent cold starts  
C) Provisioned Concurrency can only be set on a function version or alias, while Reserved Concurrency is set on the function itself including $LATEST  
D) Both features incur additional cost  

**Answer: C**  
Explanation: Provisioned Concurrency is a feature that keeps initialized execution environments, and it must be set on a version number or an alias ($LATEST is not allowed). Reserved Concurrency is a concurrency ceiling applied to the whole function, affects all invocations including $LATEST, and has no cost. B is wrong — Reserved has nothing to do with cold starts. D is wrong — Reserved is free.

---

**Question 5.** Which of the following correctly describes the difference between Destination and DLQ in Lambda asynchronous invocation?

A) DLQ handles both success and failure, while Destination handles only failure  
B) Destination can handle both success and failure, and supports SQS, SNS, EventBridge, and Lambda as targets  
C) DLQ supports EventBridge as a target, but Destination does not  
D) The two features are identical and differ only in cost  

**Answer: B**  
Explanation: For both success (OnSuccess) and failure (OnFailure) of an asynchronous invocation, Destination can send events to SQS, SNS, EventBridge, or Lambda, and it delivers rich context including request and response metadata. A DLQ, on the other hand, sends only the final failure event to SQS or SNS and includes only the basic payload. AWS recommends using Destination for new designs.

---

**Question 6.** What is the correct reason to use global variables in a Lambda function?

A) Lambda is multithreaded, so thread-local storage is needed  
B) To skip INIT code and improve warm start performance when the same execution environment is reused  
C) To share state among multiple function instances  
D) Global variables are not recommended in Lambda  

**Answer: B**  
Explanation: When a Lambda execution environment (MicroVM) is reused in a warm state, the global variable initialization code executed in INIT is not run again. If you put DB connections, boto3 clients, config files, and so on in globals, they are reused on warm starts and response time drops significantly. However, C is wrong — global variables are not shared between different MicroVM instances. Each instance has a completely separate memory space.

---

**Question 7.** Which is a correct statement about Lambda Extensions?

A) Lambda Extensions run only inside the function code  
B) An external extension runs as a separate process from the function and stays running until the SHUTDOWN phase even after the function finishes  
C) Lambda Extensions have no additional charge but share the function timeout  
D) An external extension runs outside the function's memory limit  

**Answer: B**  
Explanation: An external Lambda Extension is an independent process placed in `/opt/extensions/`, which the Lambda service starts side by side with the function. It runs concurrently with the function during the INVOKE phase and performs cleanup work in the SHUTDOWN phase. C is wrong — extensions also share the function's timeout (up to 15 minutes). D is wrong — extensions run within the function's memory limit, so if an extension uses a lot of memory, the memory available to the function shrinks. Therefore you need to increase memory sufficiently when using extensions.
