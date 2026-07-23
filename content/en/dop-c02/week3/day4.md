# Day 4 - VPC CodeBuild, Custom Images, ARM/Graviton: Expanding the Boundary of the Build Environment

CodeBuild's default build container is connected to the public internet. It pulls packages from npm, pip, and Docker Hub, and pushes images to ECR. That's sufficient in most situations. But two situations break this assumption.

First: access to private resources. RDS Aurora sits in a private subnet and the build has to run a DB migration. You cannot reach a DB in a private subnet from the public internet. The build has to be inside the VPC.

Second: ARM (Graviton) workloads. If your ECS or EKS cluster uses Graviton instances, the build must also run in an ARM environment to produce arm64 images. You can build arm64 on x86 by emulating with QEMU, but it's slow and unstable.

Resolving these two constraints is today's topic.

## VPC CodeBuild: ENI-based Network Integration

When CodeBuild runs in VPC mode, it dynamically creates an **ENI (Elastic Network Interface)** in the specified subnets at build start. The build container accesses resources inside the VPC through this ENI. When the build ends, the ENI is deleted.

**Situations that require VPC mode:**
- Accessing RDS/ElastiCache/EFS in private subnets
- On-premises Nexus/Artifactory connected via Direct Connect/VPN
- S3/ECR access through VPC Endpoints (reducing NAT costs)
- Security policies that require egress traffic control

**Configuring VPC mode:**
```bash
aws codebuild update-project \
  --name myproj \
  --vpc-config vpcId=vpc-abc123,subnets=subnet-1a,subnet-2b,securityGroupIds=sg-xyz
```

**EC2 permissions required on the Service Role:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeVpcs",
        "ec2:DescribeDhcpOptions"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "ec2:CreateNetworkInterfacePermission",
      "Resource": "arn:aws:ec2:ap-northeast-2:123456789:network-interface/*",
      "Condition": {
        "StringEquals": {
          "ec2:Subnet": [
            "arn:aws:ec2:ap-northeast-2:123456789:subnet/subnet-1a",
            "arn:aws:ec2:ap-northeast-2:123456789:subnet/subnet-2b"
          ],
          "ec2:AuthorizedService": "codebuild.amazonaws.com"
        }
      }
    }
  ]
}
```

Why `ec2:CreateNetworkInterfacePermission` carries a Condition: without this permission, CodeBuild cannot create an ENI in any subnet. But opening it with `Resource: "*"` would also allow creating ENIs in other subnets, which is excessive privilege. Allowing only the subnets specified in the Condition and the `codebuild.amazonaws.com` service is what conforms to the principle of least privilege.

> ⚠️ **Pitfall**: The three most common reasons builds fail in VPC mode: (1) missing `ec2:CreateNetworkInterface` permission, (2) no available IP addresses in the subnet (each ENI consumes an IP), (3) the Security Group's outbound rules block a required port. Check them in that order and most cases are resolved.

> 💡 **Related theory**: An ENI (Elastic Network Interface) is the basic unit of the AWS virtual network. Just as you attach one to an EC2 instance to give it an IP, CodeBuild creates a temporary ENI per build to "join the VPC temporarily." This approach is identical to Lambda's VPC integration. Lambda also creates ENIs in VPC mode to access VPC resources. The difference is that Lambda uses Hyperplane ENIs (shared ENIs) while CodeBuild uses dedicated ENIs.

## Internet Access Within a VPC: NAT vs VPC Endpoint

For a build container in a private subnet to reach the internet (npmjs.com, Docker Hub):
- **NAT Gateway**: private IP → NAT → internet. Hourly + data transfer costs.
- **VPC Endpoint**: direct access to specific AWS services over the AWS internal network.

**VPC Endpoint types and costs:**
| Service | Endpoint type | Cost |
|--------|--------------|------|
| S3 | Gateway Endpoint | **free** |
| ECR (ecr.api, ecr.dkr) | Interface Endpoint | hourly + data transfer |
| Secrets Manager | Interface Endpoint | hourly + data transfer |
| KMS | Interface Endpoint | hourly + data transfer |
| CloudWatch Logs | Interface Endpoint | hourly + data transfer |
| Systems Manager | Interface Endpoint | hourly + data transfer |

**Always add the S3 Gateway Endpoint.** It's free, and the traffic in which CodeBuild exchanges artifacts and cache with S3 no longer goes through NAT, reducing NAT costs.

When internet access is required (npm, pip, etc.):
1. NAT Gateway + private subnets (standard, costs money)
2. CodeArtifact + Upstream Repository (mirror npm, pypi into an internal repository)
3. ECR Pull Through Cache (Docker Hub mirror)

Option 2 is best for both security and cost — routing external packages through an internal repository also defends against supply-chain attacks.

> 🔍 **Going deeper**: A VPC Endpoint's Interface Endpoint is implemented internally with AWS PrivateLink technology. PrivateLink places an NLB in front on the service provider side and creates an ENI in the consumer VPC to provide a TCP-level connection. Traffic never traverses the internet, so security is stronger and data transfer cost is lower than NAT (free within the same AZ). Enabling DNS Resolution on a VPC Endpoint makes `ecr.dkr.ap-northeast-2.amazonaws.com` automatically resolve to an IP inside the VPC.

## Custom Container Images: Defining the Build Environment as Code

AWS-provided standard images (`aws/codebuild/standard:7.0`) include many tools. But if you need additional tools such as Terraform, CDK, Helm, or kubectl, the time spent installing them on every build is waste.

The solution: keep a custom image with all required tools pre-installed in ECR and use it as the build environment.

```dockerfile
# Dockerfile for a custom build image
FROM aws/codebuild/amazonlinux2-x86_64-standard:5.0

# Infrastructure tools
RUN curl -Lo terraform.zip https://releases.hashicorp.com/terraform/1.8.0/terraform_1.8.0_linux_amd64.zip && \
    unzip terraform.zip && mv terraform /usr/local/bin/ && rm terraform.zip

RUN npm install -g aws-cdk@2.140.0

RUN curl -LO "https://dl.k8s.io/release/v1.30.0/bin/linux/amd64/kubectl" && \
    install -m 0755 kubectl /usr/local/bin/kubectl

RUN curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

```yaml
# specify the custom image in the CodeBuild Project configuration
environment:
  type: LINUX_CONTAINER
  image: 123456789.dkr.ecr.ap-northeast-2.amazonaws.com/my-build-image:v1.2
  imagePullCredentialsType: SERVICE_ROLE   # pull from ECR with the CodeBuild Role
  privilegedMode: true                     # when Docker builds are needed
```

**The `imagePullCredentialsType` option:**
- `SERVICE_ROLE`: the CodeBuild Service Role pulls the ECR image. Suitable for same-account ECR.
- `CODEBUILD`: uses the CodeBuild service's own permissions. For public images or special cases.

To pull a cross-account ECR image you need `SERVICE_ROLE`, and the ECR Repository Policy in the account holding the image must allow the build account's Role.

> 📚 **Case study**: In a 2020 engineering blog post, Airbnb shared how it standardized its build environment as a "builder image." By having every team use an image containing the same versions of Terraform, kubectl, and internal tools, "it worked on my machine but not in CI" problems dropped by more than 90%. The key was managing the build environment itself as code (a Dockerfile) and pinning versions.

## ARM/Graviton Builds: Where Cost and Performance Intersect

AWS Graviton is an ARM-architecture-based processor that costs roughly 20% less on EC2 for the same vCPU count. As more organizations use Graviton instances/runtimes on ECS, EKS, and Lambda, it often makes sense for builds to run in ARM environments too.

**CodeBuild ARM images:**
| Image | Architecture | Compute type |
|--------|---------|---------|
| `aws/codebuild/amazonlinux2-aarch64-standard:3.0` | arm64 | ARM_CONTAINER |
| `aws/codebuild/amazonlinux2-x86_64-standard:5.0` | amd64 | LINUX_CONTAINER |
| `aws/codebuild/standard:7.0` | amd64 | LINUX_CONTAINER |

**Cases where ARM builds are especially advantageous:**
- C/C++/Rust native code — a native build is more stable than cross-compilation
- ECS/EKS ARM cluster workloads — images built on the same architecture
- Lambda ARM runtime — arm64 Lambda is roughly 20% cheaper and requires arm64 images

**Creating an ARM + x86 multi-architecture image:**
```yaml
# buildspec.yml (Build Batch)
version: 0.2
batch:
  fast-fail: false
  build-list:
    - identifier: amd64
      env:
        type: LINUX_CONTAINER
        compute-type: BUILD_GENERAL1_LARGE
        image: aws/codebuild/amazonlinux2-x86_64-standard:5.0
        variables:
          ARCH: amd64
    - identifier: arm64
      env:
        type: ARM_CONTAINER
        compute-type: BUILD_GENERAL1_LARGE
        image: aws/codebuild/amazonlinux2-aarch64-standard:3.0
        variables:
          ARCH: arm64

phases:
  pre_build:
    commands:
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR
  build:
    commands:
      - docker build -t $ECR/myapp:$IMAGE_TAG-$ARCH .
      - docker push $ECR/myapp:$IMAGE_TAG-$ARCH
  post_build:
    commands:
      - |
        if [ "$ARCH" = "arm64" ]; then
          docker manifest create $ECR/myapp:$IMAGE_TAG \
            $ECR/myapp:$IMAGE_TAG-amd64 \
            $ECR/myapp:$IMAGE_TAG-arm64
          docker manifest annotate $ECR/myapp:$IMAGE_TAG \
            $ECR/myapp:$IMAGE_TAG-arm64 --arch arm64
          docker manifest push $ECR/myapp:$IMAGE_TAG
        fi
```

Or in a single command with `docker buildx`:
```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --push \
  -t $ECR/myapp:$IMAGE_TAG .
```

`docker buildx` cross-compiles using QEMU internally. With Build Batch, each architecture is built natively in its own environment — faster and more stable.

> 💡 **Related theory**: Multi-architecture images use the manifest list feature of the **OCI (Open Container Initiative) Image Specification**. A single image URI (`myapp:v1`) points to a manifest list, and the manifest list contains the actual image manifests for each platform (linux/amd64, linux/arm64). On `docker pull`, the client automatically selects the image matching its own platform. This is why `docker pull ubuntu` works on any architecture.

## Docker Hub Rate Limit: ECR Pull Through Cache

When CodeBuild builds reach Docker Hub through the same NAT Gateway, requests converge from the same public IP. Docker Hub's anonymous pull limit is **100 pulls/6 hours/IP**. With 200 builds a day each pulling 2 images, that's 400 pulls per day — easily exceeding the limit.

**Configuring ECR Pull Through Cache:**
```bash
# create a Pull Through Cache rule with Docker Hub as the source
aws ecr create-pull-through-cache-rule \
  --ecr-repository-prefix dockerhub \
  --upstream-registry-url registry-1.docker.io \
  --credential-arn arn:aws:secretsmanager:...:secret:dockerhub-creds

# use it in the buildspec
# before: FROM node:20-alpine
# after:  FROM 123456789.dkr.ecr.ap-northeast-2.amazonaws.com/dockerhub/node:20-alpine
```

Only the first pull comes from Docker Hub and gets cached in ECR. For the next 24 hours it is served directly from ECR. After cache expiration it revalidates.

| Source | ECR prefix |
|------|-----------|
| Docker Hub | `dockerhub/` |
| ECR Public | `public/ecr.aws/` |
| Quay | `quay/` |
| GitHub Container Registry | `ghcr/` |

> 🎯 **Scenario**: "Builds frequently fail with `toomanyrequests: You have reached your pull rate limit`." Rapid diagnosis: confirm the error in CloudWatch Logs → the cause is the Docker Hub rate limit → the fix: configure ECR Pull Through Cache and change the Dockerfile's FROM image to the ECR path. CodeArtifact Upstream is the same remedy for npm/pypi rate limit problems.

## GCP vs AWS: Comparing VPC-integrated Builds

| Item | CodeBuild VPC | GCP Cloud Build Private Pool |
|------|--------------|------------------------------|
| Implementation | dynamic ENI creation | dedicated Private Pool (separate VPC) |
| Management complexity | low (just VPC configuration) | medium (managing the Private Pool) |
| Cost | ENI + NAT/Endpoint | Private Pool hourly + data |
| VPC Peering | direct within your own VPC | peer the Private Pool VPC |
| Minimum unit | an individual build | the whole Pool |

CodeBuild's ENI approach is an on-demand model that "joins the VPC only when needed." GCP's Private Pool is a reserved model that maintains "a pool permanently connected to a VPC." When build frequency is low CodeBuild is advantageous; when it's high GCP's pool approach eliminates ENI creation overhead.

> 📚 **Case study**: A global financial institution adopted CodeBuild VPC mode in 2022: it configured a build that runs migration scripts against an Oracle DB in a private subnet. Initially it hit `ENI quota exhausted` errors — in a `/24` subnet (256 IPs), 50 concurrent builds × 1 ENI each consumed 50 IPs. It stabilized by moving to a larger `/22` subnet (1024 IPs) and limiting concurrency to 30 with `concurrentBuildLimit`.

## Full Example: VPC + ARM Matrix + Custom Image

```bash
# 1) configure VPC build + custom image
aws codebuild update-project \
  --name myproj \
  --environment "type=LINUX_CONTAINER,
    image=123456789.dkr.ecr.ap-northeast-2.amazonaws.com/my-build-image:v1.2,
    imagePullCredentialsType=SERVICE_ROLE,
    privilegedMode=true,
    computeType=BUILD_GENERAL1_LARGE" \
  --vpc-config "vpcId=vpc-abc,
    subnets=subnet-1a,subnet-2b,
    securityGroupIds=sg-xyz"
```

```yaml
# 2) ARM/x86 multi-architecture buildspec
version: 0.2

env:
  secrets-manager:
    DB_PASS: prod/myapp-rds:password
  parameter-store:
    DB_HOST: /myapp/prod/db-host

batch:
  fast-fail: false
  build-list:
    - identifier: amd64
      env:
        type: LINUX_CONTAINER
        image: aws/codebuild/amazonlinux2-x86_64-standard:5.0
        compute-type: BUILD_GENERAL1_LARGE
        variables: { ARCH: amd64 }
    - identifier: arm64
      env:
        type: ARM_CONTAINER
        image: aws/codebuild/amazonlinux2-aarch64-standard:3.0
        compute-type: BUILD_GENERAL1_LARGE
        variables: { ARCH: arm64 }

phases:
  pre_build:
    commands:
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR
      - export IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
  build:
    commands:
      # migrate the private RDS through the VPC (only on the amd64 node)
      - |
        if [ "$ARCH" = "amd64" ]; then
          PGPASSWORD=$DB_PASS psql -h $DB_HOST -U admin -d myapp -f migrations/V$(cat migrations/version).sql
        fi
      - docker build --platform linux/$ARCH -t $ECR/myapp:$IMAGE_TAG-$ARCH .
      - docker push $ECR/myapp:$IMAGE_TAG-$ARCH
  post_build:
    commands:
      - |
        if [ "$ARCH" = "arm64" ]; then
          docker manifest create $ECR/myapp:$IMAGE_TAG \
            $ECR/myapp:$IMAGE_TAG-amd64 \
            $ECR/myapp:$IMAGE_TAG-arm64
          docker manifest push $ECR/myapp:$IMAGE_TAG
        fi

cache:
  paths:
    - /root/.gradle/caches/**/*
```

---

## 📝 연습 문제

**문제 1.** A build in CodeBuild VPC mode fails with an "ENI creation failed" error. What is the most likely cause?

A) A syntax error in buildspec.yml
B) The Service Role is missing the `ec2:CreateNetworkInterface` permission
C) An incorrect runtime-version specification
D) Running an ARM image on an x86 compute type

**정답: B**
해설: In VPC mode, CodeBuild creates an ENI in the specified subnets at build start. For that, the Service Role needs EC2 network permissions such as `ec2:CreateNetworkInterface`, `ec2:DescribeNetworkInterfaces`, and `ec2:DeleteNetworkInterface`. Without them, it fails at the ENI creation step.

---

**문제 2.** A CodeBuild build in a private subnet must download packages from `npmjs.com`. What is the cost-efficient and secure approach?

A) Change the subnet to public
B) Internet access through a NAT Gateway
C) Mirror npm with a CodeArtifact Upstream Repository + a VPC Endpoint for CodeArtifact
D) Add an Internet Gateway directly to the private subnet's route table

**정답: C**
해설: CodeArtifact can be configured with public registries such as npm, PyPI, and Maven as upstreams. Adding a VPC Endpoint for CodeArtifact lets you fetch packages over the internal network without the internet. A NAT Gateway (B) works but incurs cost, and D is technically impossible (by definition a private subnet has no direct route to an IGW).

---

**문제 3.** Why do you set `imagePullCredentialsType=SERVICE_ROLE` when using a custom ECR image as the build environment?

A) For Docker Hub authentication
B) To pull the image using the CodeBuild Service Role's ECR permissions (same-account or cross-account ECR)
C) To run ARM images on x86
D) To enable privilegedMode

**정답: B**
해설: `SERVICE_ROLE` makes CodeBuild pull the image from ECR using the Service Role's IAM permissions. The Service Role must have `ecr:GetAuthorizationToken` and `ecr:BatchGetImage`. When using cross-account ECR, the ECR Repository Policy in the account holding the image must also allow the build account's Role.

---

**문제 4.** You need to build ARM Graviton alongside x86 to produce a multi-arch Docker image. What is the most efficient approach?

A) Build arm64 as well on an x86 machine with QEMU emulation
B) Define two nodes, ARM_CONTAINER and LINUX_CONTAINER, in Build Batch `build-list`, build each natively, then combine with `docker manifest`
C) Build twice sequentially in a single buildspec
D) Delegate the arm64 build to a Lambda Function

**정답: B**
해설: Building both architectures natively in parallel with Build Batch is the fastest and most stable. QEMU emulation (A) has poor performance, C cannot be parallelized so it takes twice as long, and D — Lambda has no Docker build environment. The standard is native arm64 builds followed by creating a multi-arch manifest with docker manifest.

---

**문제 5.** What is the most important reason to add an S3 Gateway Endpoint to a VPC?

A) To enable S3 data encryption
B) To route S3 traffic over the AWS internal network without NAT, for free, reducing NAT costs
C) To make S3 buckets public
D) To enable cross-region replication

**정답: B**
해설: The S3 Gateway Endpoint is the only free VPC Endpoint type. Using it means traffic from within the VPC to S3 does not traverse the NAT Gateway, saving NAT data transfer costs. Since CodeBuild frequently reads and writes build caches and artifacts in S3, the effect is significant.

---

**문제 6.** Builds are failing due to the Docker Hub rate limit. What is the most permanent solution without infrastructure changes?

A) Upgrade to a paid Docker Hub plan
B) Configure ECR Pull Through Cache with Docker Hub as the upstream and change the Dockerfile's FROM image to the ECR path
C) Reduce build frequency
D) Add a sleep to the build to wait for the rate limit to recover

**정답: B**
해설: ECR Pull Through Cache fetches from Docker Hub only on the first pull and caches it in ECR. Subsequent builds are served from ECR and are free of the Docker Hub rate limit. A paid plan (A) is possible too, but it incurs cost and may not cover pulls across the whole team. The fundamental solution is B.

---

**문제 7.** In VPC mode builds, what problem can occur with 100 concurrent builds and a `/24` subnet (256 IPs)?

A) The build containers crash
B) Each build consumes 1 ENI = 1 IP, so the subnet's IPs can be exhausted
C) The Security Group rule limit is exceeded
D) The KMS quota is exceeded

**정답: B**
해설: Each VPC mode build creates one ENI in the specified subnet, and an ENI consumes an IP from the subnet's IP pool. A `/24` subnet has about 251 usable IPs (5 are reserved by AWS). 100 concurrent builds consume 100 IPs. If other resources (RDS, Lambda, etc.) also use IPs in the same subnet, exhaustion can occur. Remedies: a subnet with a larger CIDR, or limiting concurrency with `concurrentBuildLimit`.

---
