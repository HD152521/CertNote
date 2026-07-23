# Day 5 - Week 3 Review: Integrated CodeBuild Scenarios and Practical Judgment

The single question running through this week was "how much do you treat the build environment like code?" buildspec.yml expresses the build procedure, cache strategy expresses build speed, secrets configuration expresses the security boundary, and VPC mode expresses the network boundary — all as code. Add ARM builds and even architecture selection moves inside the build pipeline.

The DOP-C02 exam does not ask about these elements separately. It asks in integrated form: "given these constraints at this company, which configuration is correct?" Today we practice that integrated judgment. First we lay out the core comparison structures at a glance, then point out the trap patterns, then verify judgment with 12 scenario questions.

A weekly review must not become a mere summary. The goal is a level where you can explain to yourself "why A and why not B." If you can't explain it, you'll freeze in the exam room in front of two options that both look 90% right.

> 💡 **The purpose of review**: You learned the content of each Day of Week 3 independently, but real problems mix that knowledge. A problem like "there's a network error when using Secrets Manager in a VPC mode build" is only solvable if you know VPC + Secrets Manager + endpoints at the same time. Today is the day we build those connections.

---

## Reconstructing the Core Concepts of Week 3

### The Structure of buildspec.yml: Phases and Flow

The four phases of buildspec.yml (`install → pre_build → build → post_build`) have meaning in their order. `install` prepares the runtime itself, `pre_build` handles login and environment checks, `build` does the actual compilation and tests, and `post_build` handles image push, tagging, and notifications. The `finally` block runs even if the phase fails — use it for cleanup work (deleting temporary files, sending failure notifications).

```yaml
version: 0.2
phases:
  install:
    runtime-versions:
      java: corretto17
    commands:
      - echo "installing tools"
  pre_build:
    commands:
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
  build:
    commands:
      - mvn test
      - docker build -t $IMAGE_TAG .
  post_build:
    commands:
      - docker push $IMAGE_TAG
    finally:
      - echo "build finished (regardless of success/failure)"
env:
  secrets-manager:
    DB_PASS: prod/myapp:db_password
  exported-variables:
    - IMAGE_TAG
reports:
  JUnitResults:
    files:
      - '**/surefire-reports/*.xml'
    file-format: JUNITXML
cache:
  paths:
    - '/root/.m2/**/*'
```

> 🔍 **Going deeper**: `exported-variables` matters when integrating with CodePipeline. It lets a variable produced by CodeBuild (e.g., `IMAGE_TAG`) be referenced by the next Action. The pattern where, in an ECS Blue/Green pipeline, CodeBuild exports the image URI via `exported-variables` and the Deploy Action receives it and injects it into the Task Definition appears frequently on the exam.

> 💡 **Related theory**: The `finally` block applies the `try-finally` pattern from programming languages to build phases. Putting "cleanup work" that must run even on failure into `finally` is in the same spirit as the **Resource Acquisition Is Initialization (RAII)** principle — resources (logs, temporary files, external service state) must always be cleaned up after use.

---

### Comparing Cache Strategies: When to Use What

Caching divides into "where you store it" and "what you cache."

| Cache type | Storage location | On host change | Suitable targets | Caution |
|-----------|-----------|--------------|-------------|--------|
| Local Source | build host disk | miss | reducing Git source clone time | effective only in host-pinned environments |
| Local Docker Layer | build host Docker | miss | reusing Dockerfile layers | `privilegedMode: true` required |
| S3 Custom | S3 bucket | hit | node_modules, .m2, .gradle | watch object size (500MB+) |
| BuildKit + ECR Registry | ECR | hit | Docker layers (including npm install) | combine with ECR Pull Through Cache |

```yaml
# S3 cache example
cache:
  type: S3
  location: my-codebuild-cache/java-build
  paths:
    - '/root/.m2/**/*'
    - '/root/.gradle/caches/**/*'
```

```yaml
# Local Docker Layer cache (requires privilegedMode)
cache:
  type: LOCAL
  modes:
    - LOCAL_DOCKER_LAYER_CACHE
    - LOCAL_SOURCE_CACHE
```

> ⚠️ **Pitfall**: When you push `node_modules` into the S3 cache and the directory exceeds 500MB, S3 upload/download overhead becomes longer than the `npm install` time — a counterproductive result. In that case, splitting the `npm install` layer in the Dockerfile and using BuildKit + ECR Registry Cache is more efficient.

> 📚 **Case study**: In a large Java project (3GB+ of Maven dependencies), applying the S3 cache actually made builds slower. The cause was that the 3GB S3 download time (2 minutes) exceeded Maven dependency resolution (40 seconds). The fix was narrowing the S3 cache paths to include only internal artifacts, like `~/.m2/repository/com/mycompany/**/*`.

---

### Secrets Manager vs Parameter Store: The Selection Decision Tree

```
Is it a secret value?
  ├─ Automatic rotation needed?
  │   └─ YES → Secrets Manager ($0.40/secret/month)
  │           ├─ RDS credentials: RDS Rotation Lambda auto-generated
  │           ├─ Custom values: write your own Rotation Lambda
  │           └─ buildspec: env.secrets-manager
  └─ Simple configuration value, no rotation needed?
      ├─ Free tier sufficient? → Parameter Store Standard (free)
      │                       └─ buildspec: env.parameter-store
      └─ Need TPS > 40? → Parameter Store Advanced ($0.05 per 10,000 API calls)
```

Cross-account scenario: for CodeBuild to read a secret in another account's Secrets Manager, you need
1. A resource-based policy added to the secret (allowing the build account's Role ARN)
2. A grant added on the KMS key that encrypted the secret
3. `secretsmanager:GetSecretValue` + `kms:Decrypt` permissions on the CodeBuild Service Role

> 💡 **Related theory**: Secrets Manager's automatic rotation is structured so that a **Rotation Lambda** performs the actual replacement. It's a 4-step protocol in which the Lambda creates the new secret (`createSecret`) → applies it to the DB (`setSecret`) → verifies it (`testSecret`) → activates it (`finishSecret`). Understanding this protocol explains "why there is no service downtime during rotation" — the new version under the `AWSPENDING` label is promoted to `AWSCURRENT` only after it has been prepared and verified.

> 🔍 **Going deeper**: Parameter Store's 40 TPS limit becomes a real bottleneck in large-scale Lambda environments. When hundreds of Lambdas read configuration from Parameter Store simultaneously during cold starts, `ThrottlingException` occurs. Remedies: (1) upgrade to Parameter Store Advanced (higher TPS limit), (2) cache the configuration in memory at Lambda initialization (the same execution environment is reused), (3) use Secrets Manager (higher TPS limit).

---

### VPC Mode Architecture: Endpoint Design

CodeBuild in VPC mode cannot directly reach the general internet. Each external service needs an appropriate path.

```
[CodeBuild Container in Private Subnet]
    │
    ├─ S3 (artifact, cache) → S3 Gateway Endpoint (free, route table)
    ├─ Secrets Manager → Interface Endpoint ($0.01/hour)
    ├─ KMS → Interface Endpoint ($0.01/hour)
    ├─ ECR API → Interface Endpoint ($0.01/hour)
    ├─ ECR DKR (Docker layers) → Interface Endpoint ($0.01/hour)
    ├─ CloudWatch Logs → Interface Endpoint or NAT Gateway
    └─ External internet (npm, Maven Central, etc.) → NAT Gateway required
```

> ⚠️ **Pitfall**: "I turned on VPC mode and now I get S3 permission errors" is almost always caused by a missing S3 Gateway Endpoint. A Gateway Endpoint is not added to the route table automatically — you must attach it in the VPC configuration yourself and include it in the build subnet's route table. Unlike Interface Endpoints it's free, so always configure it for VPC builds.

> 📚 **Case study**: After one team migrated CodeBuild to VPC mode, build costs increased by $200 per month. Tracing the cause revealed data transfer costs for reaching S3 through the NAT Gateway. Adding an S3 Gateway Endpoint brought that cost down to $0. They also added an ECR Interface Endpoint to cut Docker layer pull costs. In VPC mode, network path optimization translates directly into cost.

---

### Custom Docker Image vs AWS Managed Image

| Item | AWS Managed Image | Custom Image (ECR) |
|------|------------------|-------------------|
| Maintenance | AWS patches it | the team builds and pushes it |
| Build start speed | fast (pre-prepared) | can be slower (image pull) |
| Tool customization | limited | fully free |
| `imagePullCredentialsType` | `CODEBUILD` | `SERVICE_ROLE` |
| `privilegedMode` | usually unnecessary | required for Docker builds |
| Cost | none | ECR storage + transfer |

A Custom Image's `imagePullCredentialsType: SERVICE_ROLE` means the CodeBuild Service Role's permissions are used to pull the image from ECR. That Role needs `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage`, and `ecr:GetAuthorizationToken`.

> 💡 **Related theory**: The core reason to use a Custom Image is **build reproducibility**. An image the team manages itself guarantees "the same tool versions and the same result no matter when you build." With an AWS Managed Image, build results can change when AWS updates it (e.g., Python 3.11.1 → 3.11.4 patch). In environments requiring audit trails, such as finance and healthcare, Custom Image + specifying the image digest (SHA256, not a tag) is the standard.

---

### Build Batch: Parallelization Strategies

| Batch type | Structure | Suitable cases |
|-----------|------|--------------|
| `build-list` | independent builds run in parallel | multi-architecture (x86/ARM), multi-service |
| `build-matrix` | every combination of variables | multi-runtime × multi-OS combinations |
| `build-graph` | a DAG with dependencies | guaranteeing common-build → dependent-build ordering |

```yaml
# build-matrix example: Python 3.9/3.10/3.11 × Linux/ARM
batch:
  build-matrix:
    static:
      ignore-failure: false
    dynamic:
      buildspec:
        - buildspec_linux.yml
        - buildspec_arm.yml
      env:
        variables:
          PYTHON_VERSION:
            - "3.9"
            - "3.10"
            - "3.11"
```

This configuration runs 2 × 3 = 6 builds in parallel.

> 🔍 **Going deeper**: `build-graph` supports DAG (Directed Acyclic Graph) dependencies. It's the pattern of "build the shared library first, and on success build services A/B/C in parallel using that artifact." It's especially useful in monorepos. When you declare dependencies with the `depend-on` field, CodeBuild performs the topological sort automatically.

---

### Reserved Capacity Fleet vs On-Demand: The Economics

| Item | On-Demand | Reserved Capacity Fleet |
|------|-----------|------------------------|
| Billing model | per build minute | per hour the Fleet is maintained (regardless of builds) |
| Provisioning wait | 10-30 seconds | nearly 0 seconds |
| Suitable environment | sporadic builds | continuous, high-frequency builds |
| Minimum Fleet size | N/A | 1 instance |

An example break-even calculation:
- Provisioning waste: 300 builds/day × 30 seconds = 2.5 hours/day
- If the Fleet's fixed cost is lower than the On-Demand cost of those 2.5 hours, the Fleet wins

> 💡 **Related theory**: The economics of a Fleet is a choice between **fixed cost and variable cost**. When demand is predictable and continuous, fixed cost (Fleet) wins; when demand is irregular, variable cost (On-Demand) wins. It's the same logic as AWS Reserved Instances. If your build pattern "concentrates in specific hours of the day," consider setting different Fleet sizes per time window, or a Fleet that supports Auto Scaling.

---

## Trap Patterns, Consolidated

**Trap 1: "To go faster, raise the Compute Type"**
Always wrong. I/O-bound builds (package downloads, S3 uploads, ECR pushes) don't get faster with more CPU. Measure CloudWatch's `BuildDuration` and per-phase times first, then apply the means appropriate to the bottleneck phase (cache, parallelism, network path).

**Trap 2: "Secrets are fine in env.variables as long as they're KMS-encrypted"**
`env.variables` is written in plaintext in buildspec.yml and exposed in build logs. Regardless of KMS encryption, writing the value directly into the buildspec risks leakage. Always use `env.secrets-manager` or `env.parameter-store`.

**Trap 3: "Local Cache is always faster"**
If the build host changes, you get a cache miss. The S3 cache is more reliable. That said, the S3 cache also backfires when the object is too large due to download overhead.

**Trap 4: "ARM builds are fine with QEMU"**
It works, but it's slow, and compiling native code (C/C++/Rust) can hit emulation instability. ARM_CONTAINER + native builds is the standard.

**Trap 5: "In VPC mode, every AWS service is automatically reachable"**
Wrong. VPC mode only attaches the build container to the VPC. To reach each AWS service, you must configure a VPC Endpoint (Gateway or Interface) separately. If you need the internet, you also need a NAT Gateway.

**Trap 6: "Secrets Manager is always better than Parameter Store"**
The costs differ. Using Secrets Manager for 95 simple configuration values that need no rotation costs $38/month, whereas Parameter Store Standard costs $0. Choose the tool according to the requirement (whether rotation is needed).

> ⚠️ **Traps, consolidated**: The common pattern in these traps is "picking an answer by tool name without looking at the requirements." The essential habit is to find the requirement keyword in the exam question first. "Automatic rotation" → Secrets Manager, "host-pinned" → Local Cache, "ARM workload" → ARM_CONTAINER, "private resources" → VPC mode + endpoints.

> 🎯 **Scenario**: A team reported "builds are slow." Looking at CloudWatch, of the total 8-minute build, `DOWNLOAD_SOURCE` was 2 minutes + `PRE_BUILD` (npm install) 4 minutes + actual `BUILD` 2 minutes. Where do you optimize first? The answer is that **PRE_BUILD (npm install)** is the biggest bottleneck, so applying an S3 Cache or BuildKit + ECR Cache comes first. `DOWNLOAD_SOURCE` can be reduced with a Local Source Cache, but that's ineffective when the build host changes, so also consider configuring a Git shallow clone. Upgrading the Compute Type has no effect in this case.

---

## Wrapping Up: Connecting Week 3's Knowledge

Connecting what we learned over the week into a single flow:

**buildspec.yml** → expresses the build procedure as code. Each phase has a clear role, and `finally` is for cleanup work.

**Cache** → the practical improvement to build speed. Whether the host is pinned and how large the objects are determine the strategy.

**Secrets** → secret values must always go through `env.secrets-manager` or `env.parameter-store`. Whether rotation is needed is what separates Secrets Manager from Parameter Store.

**VPC mode** → the only way to reach private resources. Endpoint design and subnet size determine operational quality.

**Build Batch** → the parallelization strategy. Independent builds use `build-list`, combinations use `build-matrix`, dependencies use `build-graph`.

**Custom Image** → used instead of an AWS Managed Image in environments where reproducibility matters. The `SERVICE_ROLE` credentials type is required.

**Reserved Fleet** → removes provisioning overhead in high-frequency builds. Calculating the break-even point between fixed and variable costs drives the adoption decision.

> 📚 **Week 3 end-to-end case**: A company builds 10 microservices in a monorepo. Each service needs x86 and ARM images (20 builds), it must also run DB migration SQL, and every password rotates every 30 days. The network is inside a private VPC. The correct combination for this scenario: **Build Batch build-list** (20 in parallel) + **VPC mode** (private DB access) + **S3 Gateway Endpoint** (artifact upload) + **Secrets Manager with Rotation** (DB passwords) + **a mix of ARM_CONTAINER and LINUX_CONTAINER** (multi-architecture) + **Reserved Fleet** (dozens of builds per day) + **ECR Pull Through Cache** (avoiding the Docker Hub rate limit).

---

## 📝 연습 문제

**문제 1.** `npm install` takes 4 minutes on every build. The build host may differ every time. What is the most effective improvement?

A) Upgrade the Compute Type to `BUILD_GENERAL1_2XLARGE` to increase vCPU and memory, raising npm install parallel throughput
B) Cache `node_modules/**/*` with an S3 Cache; or include npm install in a Docker layer with BuildKit + ECR Registry Cache
C) Enable Local Source Cache and Local Custom Cache together to preserve dependencies on the host disk
D) Switch from npm to yarn berry (PnP) and accelerate lockfile-based installs with the `--immutable` flag

**정답: B**
해설: When the host differs every time, a local cache is ineffective. The S3 cache lets the previous build's cache be reused from any host. However, if `node_modules` exceeds 500MB, S3 upload/download overhead appears, so BuildKit + ECR Registry Cache (caching only the npm install layer) can be more efficient. A is the wrong approach of adding CPU to an I/O-bound problem, and C is host-dependent, so it misses when the host changes.

---

**문제 2.** The build must run migration SQL against an Aurora PostgreSQL instance in a private subnet. What is the most appropriate configuration?

A) Move Aurora to a public subnet and restrict the Security Group to the build host's public IP
B) CodeBuild VPC mode + the same VPC as Aurora + allowing port 5432 in the Security Group + ENI creation permissions on the Service Role
C) Move the migration logic into a Lambda function placed in the same VPC and have CodeBuild call it indirectly with Invoke
D) Place an EC2 Bastion in the same subnet and run the migration SQL manually with SSM Run Command

**정답: B**
해설: Private resource access = VPC mode is the answer. The build container must run in the same VPC as Aurora to reach it over a private IP. The Security Group must allow port 5432 from the build container's SG to Aurora's SG. A is unacceptable for security, C raises complexity unnecessarily, and D isn't automated. The Service Role needs `ec2:CreateNetworkInterface`, `ec2:DescribeNetworkInterfaces`, and `ec2:DeleteNetworkInterface`.

---

**문제 3.** The DB password rotates automatically every 30 days. The build must always run the DB migration with the currently valid password. What is the most appropriate configuration?

A) Store the password in Secrets Manager + an automatic Rotation Lambda + reference it in buildspec via `env.secrets-manager`
B) Store it in Parameter Store Standard SecureString and update it manually after receiving an EventBridge notification on rotation
C) Hardcode it in plaintext in buildspec `env.variables` and encrypt the build logs with KMS
D) Use IAM Database Authentication for token-based RDS connections without a password (requires Aurora + IAM authentication enabled)

**정답: A** (D is also an advanced option)
해설: Automatic rotation = Secrets Manager is the clear answer. buildspec's `env.secrets-manager` fetches the latest password under the `AWSCURRENT` label at build start. After rotation, the next build automatically uses the new password. B requires a human to update it manually every month, and C is the worst option for security because of hardcoding. D (IAM Database Authentication) is also valid but requires additional Aurora + IAM configuration.

---

**문제 4.** Builds fail every morning due to the Docker Hub rate limit. What is the most effective long-term fix?

A) Configure ECR Pull Through Cache with Docker Hub as the upstream and change the Dockerfile's FROM to the ECR path
B) Use EventBridge Scheduler to spread build times across the windows where the rate limit resets every 6 hours
C) Purchase a paid Docker Hub Team plan to obtain a higher pull limit than anonymous access
D) Set `concurrentBuildLimit` to 1 to reduce concurrent pulls and slow down rate limit consumption

**정답: A**
해설: ECR Pull Through Cache fetches from Docker Hub only on the first pull and serves from ECR afterwards. You become fundamentally free of the Docker Hub rate limit, and ECR can be reached quickly from within a VPC via an Interface Endpoint. B is a stopgap that introduces build delays. C costs money and a high-traffic team can still exceed the limit. D reduces build throughput and is not a fundamental fix.

---

**문제 5.** You must build Java and Python services simultaneously and produce ARM/x86 images for each. Four build combinations are needed in total. What is the most efficient configuration?

A) Create 4 separate CodeBuild projects and run them as sequential Actions in CodePipeline
B) Define 4 nodes in a Build Batch `build-list` (Java-x86, Java-ARM, Python-x86, Python-ARM) and run them in parallel
C) Build the 4 combinations sequentially with docker buildx in the build phase of a single buildspec
D) Delegate to a Jenkins matrix build and have CodeBuild handle only source synchronization

**정답: B**
해설: Build Batch `build-list` runs the 4 builds, which have no dependencies, simultaneously. Total execution time equals the longest single build (because they're parallel). Sequential execution (A, C) takes four times as long. Specify the appropriate compute type (`ARM_CONTAINER` or `LINUX_CONTAINER`) on each node and combine the resulting images with `docker manifest` to complete the multi-arch image.

---

**문제 6.** Provisioning takes 30 seconds per build and you run 300 builds per day. That's 150 hours per month wasted on provisioning. What is the most direct fix?

A) Increase the Compute Type to a larger instance to shorten the build execution itself and reduce total daily build time
B) Use a Reserved Capacity Fleet to maintain warmed containers, reducing provisioning time to nearly zero
C) Batch build triggers to reduce the build cadence from 300 to 50 per day, reducing the number of provisioning events
D) Disable VPC mode to remove the provisioning delay caused by ENI creation

**정답: B**
해설: Provisioning time is the overhead of starting a container. A Reserved Capacity Fleet maintains a pool of pre-warmed containers and eliminates that overhead. 300 builds/day × 30 seconds = 2.5 hours saved. Compare the Fleet's fixed cost with the savings to decide on adoption. A optimizes a stage unrelated to provisioning, and C reduces build counts, hurting development speed.

---

**문제 7.** Of 100 secrets, only 5 need rotation. What configuration minimizes monthly cost?

A) 5 in Secrets Manager + 95 in Parameter Store Standard (about $2/month)
B) 100 in Secrets Manager (about $40/month)
C) 100 in Parameter Store Advanced (about $5/month)
D) 5 in Secrets Manager + 95 in Parameter Store Advanced (about $6.75/month)

**정답: A**
해설: Parameter Store Standard has no per-parameter cost (API calls are free too). Putting only the 5 that need rotation in Secrets Manager ($0.40 × 5 = $2/month) and the other 95 in Parameter Store Standard (free) is the lowest cost. Unless you're in a large-scale environment where the TPS limit (40 TPS) is a problem, this configuration is optimal. Choosing an expensive tool without a requirement for it is always a wrong option in DOP-C02.

---

**문제 8.** Starting a VPC build produces the error `The maximum number of network interfaces has been reached for subnet`. What is the most appropriate response?

A) Add a NAT Gateway to increase the outbound IP allocation paths for the build container
B) Replace the subnet with one with a larger CIDR or add subnets, and limit concurrency with `concurrentBuildLimit`
C) Add an Internet Gateway and convert the subnet to public so the ENIs receive public IPs
D) Add the `ec2:CreateNetworkInterfacePermission` permission to the Service Role to lift the ENI creation limit

**정답: B**
해설: Each VPC build creates one ENI in the subnet and consumes an IP. Exceeding a `/24` subnet's usable IPs (about 251) produces this error. Remedies: (1) a larger subnet (`/22` = 1019 IPs), (2) adding multiple subnets to the VPC configuration, (3) setting an upper bound on concurrency with `concurrentBuildLimit`. Permission issues and adding network gateways have nothing to do with this error.

---

**문제 9.** You need to connect directly into the build container to debug a failure. What is the most appropriate method?

A) Place an EC2 Bastion in the same VPC and SSH into port 22 of the build container
B) Start the build with `--debug-session-enabled` and connect to the container with SSM Session Manager (up to 7 hours)
C) Wait until the build finishes, then launch a new EC2 with the same image and manually reproduce even the environment variables
D) Just check the error message and stack trace in CloudWatch Logs and the reports block output

**정답: B**
해설: A CodeBuild Debug Session pauses at the failing phase and lets you connect directly to the container with SSM Session Manager for up to 7 hours. You can run the same commands manually inside the container and inspect environment variables, the filesystem, and network state. This is the most direct way to catch bugs that "fail only in CodeBuild." A has no SSH port, C makes environment reproduction difficult, and D lacks contextual information.

---

**문제 10.** How do you visualize JUnit test results in the CodeBuild console and send an SNS notification on failure?

A) Specify `JUNITXML` in the buildspec `reports` block + an EventBridge Rule (CodeBuild build state change) → SNS Topic
B) Upload the XML file to S3 as a secondary artifact, parse it with a Lambda, and publish the result to SNS
C) Print the XML text to CloudWatch Logs, detect failure patterns with a Metric Filter, and alarm → SNS
D) Store only the XML as a secondary artifact and manually attach it to a CodeBuild Test Report group

**정답: A**
해설: The `reports` block is what makes test Pass/Fail visualized in the CodeBuild console with history tracking. Merely storing it as a secondary artifact (D) puts the file in S3 but gives no console visualization. For SNS notifications, an EventBridge Rule detects the CodeBuild build state (`FAILED`) event and routes it to SNS. The combination of these two is the standard.

---

**문제 11.** In a multi-account environment, CodeBuild tries to read a Secrets Manager secret in Account B. CodeBuild is in Account A. What two configurations are required?

A) Add a resource-based policy on Account B's secret (allowing Account A's CodeBuild Service Role ARN) + add a grant on Account B's KMS key
B) Create an IAM User in Account B, issue a long-lived access key, and store it in Account A's Secrets Manager for the build to use
C) Assume Account B's IAM Role from Account A with sts:AssumeRole and call GetSecretValue with the temporary credentials
D) Copy Account B's secret value, KMS-encrypted, into a shared S3 bucket and have the build download it

**정답: A**
해설: Secrets Manager controls cross-account access with resource-based policies. Account B's secret must allow `secretsmanager:GetSecretValue` for Account A's CodeBuild Service Role, and the KMS key encrypting that secret also needs a Key Policy or grant allowing Decrypt for the Account A Role. B uses long-lived credentials, which is poor for security; C — assuming an IAM Role is possible too, but meeting this scenario's requirement of direct Secrets Manager access needs additional configuration. D requires copying and synchronizing the secret, so values drift on rotation and it breaks the single-source-of-truth principle.

---

**문제 12.** You want to generate an SBOM (Software Bill of Materials) in a CodeBuild build to strengthen supply chain security. What is the most suitable implementation?

A) Generate the SBOM file in the post_build phase with a tool such as `syft` or `trivy` → store it in S3 as a secondary artifact + add a vulnerability report via the `reports` block
B) Grant SBOM generation permission in an IAM Policy and delegate inventory production to the build Service Role
C) Declare the dependency list in a CloudFormation template and manage the SBOM as a stack deployment output
D) Have the build download and attach the SBOM automatically generated during dependency resolution in a CodeArtifact repository

**정답: A**
해설: An SBOM is a file recording "which libraries are included." Open-source tools such as `syft` (Anchore), `trivy`, and `cdxgen` analyze build outputs (JARs, container images, npm packages) and generate an SBOM in SPDX or CycloneDX format. Storing it in S3 as a secondary artifact makes it traceable during audits. Vulnerability reports are visualized in the CodeBuild console via the `reports` block. Because buildspec.yml lives in Git, this procedure itself satisfies SLSA Level 2.

---
