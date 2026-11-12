# Day 1 - ECR: Solving the Problems that Container Image Registries Must Solve

"Where and how to store container images" is more complex than it initially appears. Simply uploading to Docker Hub falls apart as scale increases. Docker Hub's Rate Limit (100 pulls without authentication in 6 hours, as of 2020) has caused actual incidents where pull requests from EKS cluster nodes numbering in the hundreds were blocked. Supply chain attacks with hidden malware in external registry images, similar to malicious code embedded in npm packages, are real threats. For multi-region deployments, pulling images repeatedly through the internet creates latency and cost issues.

ECR (Elastic Container Registry) solves these problems within the AWS ecosystem—not just as a storage repository, but as a unified service providing security scanning (vulnerabilities), lifecycle management (costs), replication (availability), and caching (external dependency isolation).

## OCI Standards and ECR's Foundation

ECR implements the Docker Registry API v2 and follows the OCI (Open Container Initiative) image specification. OCI, established in 2015 by Docker and CoreOS, defines container runtime and image formats as neutral standards.

Understanding OCI image structure makes ECR's operations clear:

```
OCI Image Structure:
├── Image Manifest (JSON)
│   ├── mediaType
│   ├── config: { digest: sha256:abc, mediaType, size }
│   └── layers: [
│       { digest: sha256:111, size: 100MB },  ← Layer 1 (base OS)
│       { digest: sha256:222, size: 50MB },   ← Layer 2 (runtime)
│       { digest: sha256:333, size: 10MB }    ← Layer 3 (app code)
│   ]
├── Image Config (JSON)
│   ├── architecture: amd64
│   ├── os: linux
│   └── history: [...]
└── Layers (tar.gz)
    ├── sha256:111...  ← Reusable, stored once
    ├── sha256:222...
    └── sha256:333...
```

The key insight is the content-addressable storage method for layers. If 100 images in ECR use `FROM ubuntu:22.04`, the ubuntu layer is stored only once. This is why ECR's actual storage cost is much lower than the sum of all image file sizes.

> 💡 **Related Theory**: OCI image layer structure implements **Content-Addressable Storage (CAS)**—an addressing method where file content determines the address (digest, sha256 hash). Identical content always has the same address. This is the same principle Git uses to store files with SHA-1 hashes. As a result, layer deduplication occurs automatically (Deduplication), layer integrity verification becomes possible (Integrity), and multiple images can share identical layers (Sharing).

**Image Tag vs Digest**:
- **Tag** (`myapp:v1.2.3`, `myapp:latest`): Mutable pointer. If someone pushes a different image with the same tag, the tag points to the new image.
- **Digest** (`myapp@sha256:abc123...`): Immutable identifier. SHA-256 hash of the image Manifest. If this value changes, it's a different image.

Using `image: myapp:latest` in production deployment is risky—you don't know if "latest" was from yesterday or today. `image: myapp@sha256:abc123` guarantees exactly the image you tested.

## ECR Private vs Public: When to Use What

| Characteristic | ECR Private | ECR Public |
|-------|------------|-----------|
| **URL** | `<account>.dkr.ecr.<region>.amazonaws.com/<repo>` | `public.ecr.aws/<alias>/<repo>` |
| **Access** | IAM authentication required | Pull without authentication |
| **Use Case** | Internal application images | Public distribution (open source, public base images) |
| **Scanning** | Basic/Enhanced scanning available | Limited |
| **Replication** | Cross-region/account replication | Automatic global CDN distribution |
| **KMS Encryption** | Supported | Not supported |

The DOP-C02 exam focuses primarily on Private Registry. Public Gallery hosts AWS public base images (amazon-linux-2, eks-anywhere, etc.) and sometimes appears as a distractor in exam questions.

## Basic vs Enhanced Scanning: Understanding the Internal Differences

The two scanning modes differ not just in features but in **fundamental differences in scanning engines and data sources**.

**Basic Scanning**: Uses open-source Clair engine. Clair searches known vulnerabilities in OS packages (apt, yum, apk) based on the CVE (Common Vulnerabilities and Exposures) database. Single scan at push—images are only checked when they arrive in ECR.

**Enhanced Scanning (AWS Inspector)**: Inspector uses a richer database including Amazon Guard vulnerability intelligence. Beyond OS packages, it scans language-specific dependencies: Python pip, Node.js npm, Java Maven, .NET NuGet, and others. **Continuous Scanning**—if new CVEs are published while an image exists in ECR, it automatically re-evaluates. An image that passed scanning yesterday can become CRITICAL today due to a new CVE, and Inspector automatically detects this, notifying via Security Hub and EventBridge.

```bash
# Enable Enhanced Scanning at account level
aws inspector2 enable \
  --resource-types ECR

# Configure ECR scanning (continuous scanning for all repositories)
aws ecr put-registry-scanning-configuration \
  --scan-type ENHANCED \
  --rules '[
    {
      "scanFrequency": "CONTINUOUS_SCAN",
      "repositoryFilters": [
        {"filter": "*", "filterType": "WILDCARD"}
      ]
    }
  ]'

# Certain repositories scan only on push
aws ecr put-registry-scanning-configuration \
  --scan-type ENHANCED \
  --rules '[
    {
      "scanFrequency": "CONTINUOUS_SCAN",
      "repositoryFilters": [
        {"filter": "prod/*", "filterType": "PREFIX_MATCH"}
      ]
    },
    {
      "scanFrequency": "SCAN_ON_PUSH",
      "repositoryFilters": [
        {"filter": "dev/*", "filterType": "PREFIX_MATCH"}
      ]
    }
  ]'

# View scan results
aws inspector2 list-findings \
  --filter-criteria '{
    "resourceType": [{"comparison": "EQUALS", "value": "AWS_ECR_CONTAINER_IMAGE"}],
    "severity": [{"comparison": "EQUALS", "value": "CRITICAL"}]
  }'
```

> 📚 **Case Study**: During the 2021 log4shell (CVE-2021-44228) vulnerability announcement, Enhanced Scanning's power became evident. Log4Shell was a remote code execution vulnerability in the Log4j library used by Java applications. Basic Scanning only looks at OS packages, so it missed Log4j in Java dependencies. Enhanced Scanning analyzes Java classpath within images, so it identified images affected by Log4Shell. AWS Inspector re-evaluated millions of ECR images worldwide in hours and sent alerts via Security Hub—a real-world example of the difference.

> 🔍 **Deep Dive**: Enhanced Scanning scans language dependencies through Software Composition Analysis (SCA). It unpacks image layers to find Python's requirements.txt and site-packages/, Node's node_modules/, Java's pom.xml and JAR MANIFEST.MF, etc., and compares against known vulnerable versions. It internally generates SBOM (Software Bill of Materials) and compares against the CVE database. SBOM is a concept mandated by EO 14028 (2021 US Presidential Executive Order on Software Supply Chain Security), and Inspector's Enhanced Scanning implements this standard as an AWS service.

## Lifecycle Policy: Automatically Controlling Image Costs

Most ECR costs come from storage ($0.10/GB/month). Untagged images (generated on every build from layers) and old development tags accumulate, causing storage costs to explode. Lifecycle Policy automatically deletes old images based on rules.

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Delete untagged images after 7 days",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": {"type": "expire"}
    },
    {
      "rulePriority": 2,
      "description": "Keep only 30 most recent prod-tagged images",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["prod-", "release-"],
        "countType": "imageCountMoreThan",
        "countNumber": 30
      },
      "action": {"type": "expire"}
    },
    {
      "rulePriority": 3,
      "description": "Delete dev-tagged images after 14 days",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["dev-", "pr-", "branch-"],
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 14
      },
      "action": {"type": "expire"}
    },
    {
      "rulePriority": 4,
      "description": "Delete remaining tagged images after 90 days",
      "selection": {
        "tagStatus": "tagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 90
      },
      "action": {"type": "expire"}
    }
  ]
}
```

**Lifecycle Policy Evaluation Trap**: rulePriority **lower numbers are evaluated first**. If an image matches multiple rules, the action of the first matching rule applies. Priority 1 = "untagged images after 7 days" rule is evaluated first.

Dry-run to confirm actual results before deletion:
```bash
aws ecr get-lifecycle-policy-preview \
  --repository-name myapp \
  --filter "{'tagStatus': 'UNTAGGED'}"
```

> ⚠️ **Trap**: Lifecycle Policy and IMMUTABLE tag settings interact. When IMMUTABLE tagging is enabled and you try to re-push with the same tag, an error occurs and the existing image is not deleted. However, Lifecycle Policy deletes images that meet expiration criteria regardless of IMMUTABLE tags. IMMUTABLE means "cannot re-push with the same tag," not "cannot be deleted." For compliance requiring permanent image retention, either don't apply Lifecycle Policy or implement a separate backup strategy.

## Image Tag Mutability: The Foundation of Reproducibility and Security

```bash
# Set to IMMUTABLE (recommended)
aws ecr put-image-tag-mutability \
  --repository-name myapp \
  --image-tag-mutability IMMUTABLE

# Revert to MUTABLE (not recommended)
aws ecr put-image-tag-mutability \
  --repository-name myapp \
  --image-tag-mutability MUTABLE
```

**Practical effects of IMMUTABLE**:
1. Once `prod-v1.2.3` tag is pushed, that tag always points to the same image—nobody can accidentally overwrite it
2. Audit trail: "What code was executed when prod-v1.2.3 was deployed?" becomes clear
3. Supply chain attack defense: External attackers cannot replace existing tags with malicious images

> 💡 **Related Theory**: IMMUTABLE tags are a **human-friendly interface to content-addressable systems**. Digest (sha256) is the real immutable image identifier, but humans can't remember it. IMMUTABLE tags map human-readable names (`prod-v1.2.3`) to immutable Digests, ensuring "this name always points to this content." This is similar to DNS CNAME vs A records—tags are aliases (CNAMEs) and Digests are actual addresses (IPs). MUTABLE tags are like CNAMEs that can point to different IPs, while IMMUTABLE tags are CNAMEs frozen to one IP.

## Cross-Region Replication: Disaster Recovery and Multi-Region Architecture

ECR Cross-Region Replication automatically copies images to other regions. Used for disaster recovery (DR) scenarios and reducing deployment latency in global multi-region services.

```bash
aws ecr put-replication-configuration \
  --replication-configuration '{
    "rules": [
      {
        "destinations": [
          {
            "region": "us-east-1",
            "registryId": "111111111111"
          },
          {
            "region": "eu-west-1",
            "registryId": "111111111111"
          }
        ],
        "repositoryFilters": [
          {
            "filter": "prod/*",
            "filterType": "PREFIX_MATCH"
          },
          {
            "filter": "shared/base-images",
            "filterType": "PREFIX_MATCH"
          }
        ]
      }
    ]
  }'
```

Important considerations when configuring replication:
- **Repository must exist first**: If a repository with the same name doesn't exist in the destination region, automatic creation may not occur (depends on configuration).
- **Lifecycle Policy is independent**: Lifecycle Policy applied to replicated images uses the destination region's settings. Deleting images in source region doesn't delete replicated images.
- **Replication delay**: Replication is asynchronous, so pulling images from another region immediately after pushing may retrieve older versions that haven't replicated yet.

**Cross-Account Replication**: Automatically replicate from Prod account ECR to DR account.

```json
{
  "rules": [{
    "destinations": [
      {"region": "ap-northeast-2", "registryId": "DR-ACCOUNT-ID"}
    ],
    "repositoryFilters": [
      {"filter": "prod/*", "filterType": "PREFIX_MATCH"}
    ]
  }]
}
```

Configure Registry Permission in destination account (DR-ACCOUNT-ID):
```bash
aws ecr put-registry-policy \
  --policy-text '{
    "Version": "2012-10-17",
    "Statement": [{
      "Sid": "AllowSourceAccountReplication",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::SOURCE-ACCOUNT-ID:root"
      },
      "Action": [
        "ecr:CreateRepository",
        "ecr:ReplicateImage"
      ],
      "Resource": "arn:aws:ecr:ap-northeast-2:DR-ACCOUNT-ID:repository/*"
    }]
  }'
```

## Pull Through Cache: Isolating External Registry Dependencies

The Docker Hub Rate Limit incident (November 2020, limiting unauthenticated pulls to 100 in 6 hours) stopped many companies' EKS nodes. Pull Through Cache solves this problem fundamentally.

```bash
# Create cache rule for Docker Hub
aws ecr create-pull-through-cache-rule \
  --ecr-repository-prefix dockerhub \
  --upstream-registry-url registry-1.docker.io \
  --credential-arn arn:aws:secretsmanager:ap-northeast-2:111:secret:ecr-pullthrough-dockerhub-xxxxx

# Usage (modify existing Docker Hub pull commands)
# Before: docker pull nginx:1.25
# After: docker pull 111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/dockerhub/library/nginx:1.25

# Usage in Kubernetes
# image: 111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/dockerhub/library/nginx:1.25
```

Supported Upstream Registries:
- Docker Hub (`registry-1.docker.io`)
- ECR Public Gallery (`public.ecr.aws`)
- Quay.io (`quay.io`)
- Kubernetes Container Registry (`registry.k8s.io`)
- GitHub Container Registry (`ghcr.io`)
- Microsoft Container Registry (`mcr.microsoft.com`)

Operation flow:
```
First pull:
  ECR cache → not found → pull from Docker Hub → store in ECR → respond

Subsequent pulls:
  ECR cache → found → respond directly from ECR (no Docker Hub access)

Cache TTL:
  ECR auto-refreshes when upstream image updates detected
```

**Pull Through Cache + Lifecycle Policy combination**: Cached images also follow Lifecycle Policy for automatic cleanup. Prevents accumulation of old cache versions.

> 📚 **Case Study**: 2022, Cloudflare experienced intermittent CI pipeline failures due to Docker Hub Rate Limit. Their solution was using an internal Nexus Repository Manager as a proxy. AWS customers solve this more simply with ECR Pull Through Cache. ECR Pull Through Cache stores Docker Hub credentials in Secrets Manager, extending rate limit to the authenticated account limit (unlimited or premium plan).

## ECR Permission Model: Three Layers

ECR uses three different access control levels. Confusing these causes "I have permission but it doesn't work" problems.

| Level | Policy Type | Scope | Primary Use |
|------|-----------|--------|-----------|
| **Registry** | Registry Policy | Entire account Registry | Cross-Account replication, Pull Through Cache |
| **Repository** | Repository Policy | Specific repository | Cross-Account pull, restrict specific service access |
| **IAM** | IAM Identity Policy | User/Role | Internal CI/CD, ECS Task Role, EKS IRSA |

```json
// Repository Policy Example — Cross-Account pull
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowDRAccountPull",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::DR-ACCOUNT-ID:root"
      },
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:GetAuthorizationToken"
      ]
    }
  ]
}
```

Cross-Account pull specifics: `ecr:GetAuthorizationToken` is a Registry-level IAM permission, not included in Repository Policy Principals. For other accounts to pull images, that account's IAM must have `ecr:GetAuthorizationToken` permission.

## Container Image Signing: The Frontline of Supply Chain Security

ECR supports OCI Image Signing. Signing cryptographically proves "this image was built from a trusted source and hasn't been tampered with."

```bash
# Use AWS Signer for Containers (based on Notary v2)
SIGNING_PROFILE_ARN=$(aws signer create-signing-profile \
  --platform-id "Notation-OCI-SHA384-ECDSA" \
  --signing-profile-name checkout-images \
  --query 'arn' --output text)

# Sign the image
notation sign \
  --plugin "com.amazonaws.signer.notation.plugin" \
  --id "$SIGNING_PROFILE_ARN" \
  111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/myapp@sha256:abc123

# Enforce signature verification in EKS (Kyverno policy example)
# Unsigned images are blocked from cluster entry
```

> 💡 **Related Theory**: Container image signing is the application of **PKI (Public Key Infrastructure) and Code Signing** to the container world. Windows code signing certificates and macOS Developer Certificates work the same principle—sign with private key, verify with public key. Sigstore (cosign), becoming the OCI Image Signing standard, uses transparency logs (RFC 9162) to record signing events in a public immutable log. This is the same approach as CT (Certificate Transparency, RFC 6962) tracking HTTPS certificate issuance, ensuring supply chain transparency for container images.

## ECR KMS Encryption: Protecting Data at Rest

ECR Private repositories are encrypted by default with AWS-managed key (aws/ecr). For compliance (FIPS 140-2, PCI DSS) or when key rotation control is needed, use customer-managed CMK (Customer Managed Key).

```bash
# Create repository encrypted with CMK
aws ecr create-repository \
  --repository-name checkout-service \
  --encryption-configuration '{
    "encryptionType": "KMS",
    "kmsKey": "arn:aws:kms:ap-northeast-2:111:key/your-key-id"
  }'

# Existing repositories cannot change encryption method
# Must create new repository and migrate images
```

> ⚠️ **Trap**: If you configure CMK on an ECR repository and then disable or delete that KMS key, image pulls become impossible—images are encrypted with that key. KMS key deletion has a 7-30 day wait period, but key disabling takes effect immediately. CMK rotation (`enable-key-rotation`) is automatic rotation so image access is unaffected. For cross-account pull, the destination account's IAM needs `kms:Decrypt` permission on that CMK—ECR Repository Policy alone is insufficient.

> 💡 **Related Theory**: ECR encryption structure uses the same **Envelope Encryption** method as S3 server-side encryption (SSE-KMS). Each image layer is encrypted with a Data Key, and the Data Key is encrypted with CMK and stored in image metadata. When a pull request arrives, ECR decrypts the Data Key with CMK, then decrypts the layer with Data Key, and responds. This process is recorded in CloudTrail as `kms:Decrypt` events, allowing you to track "which images were pulled when" via KMS audit logs.

## From buildspec.yml to ECR: Complete Pipeline

```yaml
# buildspec.yml — including ECR push
version: 0.2

env:
  variables:
    ECR_REGISTRY: "111111111111.dkr.ecr.ap-northeast-2.amazonaws.com"
    REPOSITORY_NAME: "checkout-service"
  exported-variables:
    - IMAGE_TAG
    - IMAGE_URI
    - IMAGE_DIGEST

phases:
  pre_build:
    commands:
      # ECR login
      - aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin $ECR_REGISTRY
      # Image tag: first 8 chars of git SHA
      - export IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
      - export IMAGE_URI="${ECR_REGISTRY}/${REPOSITORY_NAME}:${IMAGE_TAG}"

  build:
    commands:
      - docker build -t $IMAGE_URI --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) .

  post_build:
    commands:
      # Push image
      - docker push $IMAGE_URI
      # Extract Digest (precise reference for IMMUTABLE image)
      - export IMAGE_DIGEST=$(aws ecr describe-images --repository-name $REPOSITORY_NAME --image-ids imageTag=$IMAGE_TAG --query 'imageDetails[0].imageDigest' --output text)
      # Generate imagedefinitions.json (for ECS Rolling deployment)
      - printf '[{"name":"checkout","imageUri":"%s"}]' "${ECR_REGISTRY}/${REPOSITORY_NAME}@${IMAGE_DIGEST}" > imagedefinitions.json
      # Generate imageDetail.json (for ECS Blue/Green deployment)
      - printf '{"ImageURI": "%s"}' "${ECR_REGISTRY}/${REPOSITORY_NAME}@${IMAGE_DIGEST}" > imageDetail.json

artifacts:
  files:
    - imagedefinitions.json
    - imageDetail.json
    - cloudformation/template.yaml
```

> 🎯 **Scenario**: A security team requires "automatically block ECS deployment for ECR images with CRITICAL vulnerabilities." Implementation approach: (1) Enable Enhanced Scanning, (2) Send Inspector Findings to Security Hub, (3) EventBridge Rule detects "CRITICAL Inspector Finding + ECR image", (4) Lambda blocks deployment of ECS service containing that image or stops CodePipeline. Alternative simpler approach: CodeBuild post_build stage calls Inspector API to check scan results, exits with 1 if CRITICAL exists. Both approaches are valid, but the latter is simpler to implement.

## Summary

ECR is not just a Docker Hub replacement. OCI-standard content-addressable storage, Enhanced Scanning's continuous vulnerability monitoring, Lifecycle Policy's automatic cost control, cross-region/account replication for availability, Pull Through Cache for external dependency isolation—these five functions together create an enterprise container image registry. IMMUTABLE tags are the foundation of reproducibility and security, and signing is the frontline of supply chain security. On exams: "dependency CVE monitoring" → Enhanced Scanning, "Docker Hub Rate Limit" → Pull Through Cache, "prod image reproducibility" → IMMUTABLE tags.

---

## 📝 Practice Questions

**Question 1.** What configuration is needed to "automatically detect a new CVE found in a Python library (the requests package) in an ECR image and integrate it into Security Hub"?

A) Basic Scanning (scanOnPush: true) + CloudWatch Events
B) Enhanced scanning (Inspector) + CONTINUOUS_SCAN + Security Hub integration
C) Lambda downloads the image daily and runs pip audit
D) The Trusted Advisor image scanning feature

**Answer: B**
Explanation: Basic scanning scans only OS packages (apt, yum) and does not detect language packages such as Python pip. Only enhanced scanning (Inspector) supports language-specific dependency scanning. CONTINUOUS_SCAN automatically re-evaluates when a new CVE is published while the image is in ECR, so it also detects "CVEs discovered after the fact." Inspector findings are automatically integrated with Security Hub and shown on the central security dashboard.

---

**Question 2.** In an ECR lifecycle policy with rulePriority 1, 2, and 3, how is an image handled if it matches both rule 1 and rule 3?

A) The rule with the highest priority (the larger number) is applied
B) The lowest rulePriority number (that is, rule 1) is evaluated first and the action of rule 1 is applied
C) Both rules are applied and the image is deleted twice
D) The most recently added rule takes precedence

**Answer: B**
Explanation: The lower the rulePriority number, the earlier it is evaluated. If an image matches both rule 1 and rule 3, rule 1 (priority 1) is applied first, and rule 3 is not applied again to an image that has already been processed. The design is counterintuitive ("lower number = higher priority"), but this is how ECR lifecycle policies work. Checking the actual result with a dry run (`get-lifecycle-policy-preview`) is how you prevent mistakes.

---

**Question 3.** What is the most secure IAM configuration for an EKS pod to pull images from ECR private?

A) Attach the AmazonEC2ContainerRegistryReadOnly policy to the EKS node EC2 role (shared by all pods)
B) Map a separate IAM role to each service Kubernetes ServiceAccount with IRSA, allowing the role to access only the ECR repositories it needs
C) Inject ECR credentials directly into the pod spec as environment variables
D) Configure the ECR repository policy to allow the EKS cluster VPC

**Answer: B**
Explanation: IRSA (IAM Roles for Service Accounts) is the standard for EKS permissions. The node role (A) is an overly permissive approach in which all pods on that node have the same permissions. If any pod is compromised, all of the node permissions can be used. IRSA implements least privilege per pod — a payment service pod can access only payment-related ECR repositories, and an authentication service pod can access only the authentication repository. Injecting environment variables (C) carries the risk of exposing long-term credentials.

---

**Question 4.** Which ECR configuration "prevents changing a tag or pushing a different image with the same tag after the prod image is built"?

A) Remove the PutImage permission with a separate IAM policy on the ECR repository
B) Set the repository image tag mutability to IMMUTABLE
C) Automatically delete old images with a lifecycle policy
D) Replicate the images with cross-Region replication

**Answer: B**
Explanation: The IMMUTABLE setting makes a tag that has been pushed once impossible to overwrite. If you run `docker push myapp:prod-v1.2.3` twice, the second push fails with an error. Removing PutImage with an IAM policy (A) means no one can push images, which breaks CI/CD. A lifecycle policy (C) controls deletion and does not prevent modification.

---

**Question 5.** Because of the Docker Hub rate limit, pulling the official nginx image intermittently fails on an EKS cluster. What is the most fundamental solution?

A) Reduce the number of EKS nodes to reduce the number of pulls
B) Connect an ECR pull through cache to Docker Hub and change all nginx pulls in the cluster to go through ECR
C) Upgrade the Docker Hub account to a paid plan
D) Store the nginx image in S3 and download it when needed

**Answer: B**
Explanation: The ECR pull through cache is the fundamental solution. The first pull fetches from Docker Hub and stores in ECR, and subsequent pulls are served directly from ECR. ECR manages the Docker Hub credentials in Secrets Manager, so the (much higher) rate limit of an authenticated account applies. In the Kubernetes manifest you only need to change `image: nginx:1.25` to `image: <account>.dkr.ecr.<region>.amazonaws.com/dockerhub/library/nginx:1.25`. Reducing nodes (A) is a stopgap, and a paid upgrade (C) is also possible, but a solution within AWS services is recommended.

---

**Question 6.** You configured ECR cross-Region replication, but new images are not replicated to the destination Region. What should you check first?

A) IAM permissions in the destination Region
B) Whether the PREFIX_MATCH pattern in repositoryFilters matches the repository name, and whether the repository was created in advance in the destination Region
C) KMS key settings
D) ECR scan settings

**Answer: B**
Explanation: These are the two most common causes of replication not working. (1) The PREFIX_MATCH pattern in repositoryFilters does not match the repository name — for example, if the filter is `"prod/"` but the repository name is `myapp` (no prod/ prefix), it is not replicated. (2) There is no repository with the same name in the destination Region — depending on the configuration it may not be created automatically, so you must create the repository manually first. Replication is asynchronous, so it may not be visible even if you check immediately.

---

**Question 7.** Which architecture continuously monitors the SBOM (software bill of materials) and CVE information of ECR images and automatically sends an alert to the operations team when a new CRITICAL vulnerability is found?

A) Inspector enhanced scanning + CONTINUOUS_SCAN → Inspector finding created → Security Hub → EventBridge → SNS → email/Slack
B) Basic scanning + CloudWatch alarm
C) Lambda calls ECR describe-images daily and compares against a vulnerability database
D) Periodically monitor the Trusted Advisor dashboard

**Answer: A**
Explanation: Inspector enhanced scanning automatically re-evaluates (CONTINUOUS_SCAN) when the CVE database is updated and generates findings. Security Hub collects these findings, an EventBridge rule filters "CRITICAL Inspector findings" and routes them to SNS, and an alert goes out immediately by email and Slack (Chatbot). This whole pipeline is fully automated, and detection and alerting complete within a few hours after a new CVE is published. The other options either do not perform dependency scanning (B) or have incomplete automation (C, D).

---
