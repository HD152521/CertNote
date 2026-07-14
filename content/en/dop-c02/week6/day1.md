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

## 📝 연습 문제

**문제 1.** "Python 라이브러리(requests 패키지)에서 발견된 새 CVE를 ECR 이미지에서 자동으로 감지하고 Security Hub에 통합"하려면 어떤 구성이 필요한가?

A) Basic Scanning (scanOnPush: true) + CloudWatch Events
B) Enhanced Scanning (Inspector) + CONTINUOUS_SCAN + Security Hub 통합
C) Lambda가 매일 이미지를 다운로드하고 pip audit 실행
D) Trusted Advisor의 이미지 스캔 기능

**정답: B**
해설: Basic Scanning은 OS 패키지(apt, yum)만 스캔하고 Python pip 같은 언어 패키지를 감지하지 못한다. Enhanced Scanning(Inspector)만이 언어별 의존성 스캔을 지원한다. CONTINUOUS_SCAN은 이미지가 ECR에 있는 동안 새 CVE가 발표되면 자동으로 재평가하므로 "사후에 발견된 CVE"도 감지한다. Inspector Findings는 Security Hub와 자동 통합되어 중앙 보안 대시보드에 표시된다.

---

**문제 2.** ECR Lifecycle Policy에서 rulePriority 1, 2, 3이 있을 때, 한 이미지가 규칙 1과 규칙 3에 동시에 매칭된다면 어떻게 처리되는가?

A) 가장 높은 우선순위(숫자가 큰 것)의 규칙이 적용된다
B) 가장 낮은 rulePriority 숫자(즉 규칙 1)가 먼저 평가되어 규칙 1의 action이 적용된다
C) 양쪽 규칙이 모두 적용되어 이미지가 두 번 삭제된다
D) 가장 최근에 추가된 규칙이 우선한다

**정답: B**
해설: rulePriority는 숫자가 낮을수록 먼저 평가된다. 이미지가 규칙 1과 규칙 3에 모두 매칭되면 규칙 1(priority 1)이 먼저 적용되고, 규칙 3은 이미 처리된 이미지에 다시 적용되지 않는다. "낮은 숫자 = 높은 우선순위"라는 직관에 반하는 설계지만 이것이 ECR Lifecycle Policy의 동작 방식이다. 드라이런(`get-lifecycle-policy-preview`)으로 실제 결과를 확인하는 것이 실수를 방지하는 방법이다.

---

**문제 3.** EKS Pod이 ECR Private 이미지를 pull할 때 가장 안전한 IAM 구성은?

A) EKS 노드 EC2 Role에 AmazonEC2ContainerRegistryReadOnly 정책 첨부 (모든 Pod 공유)
B) 각 서비스별 Kubernetes ServiceAccount에 IRSA로 별도 IAM Role 매핑, Role에 필요한 ECR 리포지토리만 접근 허용
C) Pod Spec에 ECR 자격 증명을 환경 변수로 직접 주입
D) ECR Repository Policy를 EKS 클러스터 VPC에서 허용으로 설정

**정답: B**
해설: IRSA(IAM Roles for Service Accounts)가 EKS 권한의 표준이다. 노드 Role(A)은 해당 노드의 모든 Pod이 같은 권한을 갖는 overly permissive 접근이다. 어떤 Pod이 침해되면 노드의 모든 권한을 사용할 수 있다. IRSA는 Pod별 최소 권한을 구현한다—결제 서비스 Pod은 결제 관련 ECR 리포지토리만, 인증 서비스 Pod은 인증 리포지토리만 접근 가능하다. 환경 변수 주입(C)은 장기 자격 증명 노출 위험이 있다.

---

**문제 4.** "prod 이미지가 빌드된 후 태그를 변경하거나 같은 태그로 다른 이미지를 push하는 것을 방지"하는 ECR 구성은?

A) ECR 리포지토리에 별도 IAM Policy로 PutImage 권한을 제거
B) 리포지토리의 Image Tag Mutability를 IMMUTABLE로 설정
C) Lifecycle Policy로 오래된 이미지를 자동 삭제
D) Cross-Region Replication으로 이미지를 복제

**정답: B**
해설: IMMUTABLE 설정은 한 번 push된 태그를 덮어쓰기 불가능하게 만든다. `docker push myapp:prod-v1.2.3`을 두 번 실행하면 두 번째 push가 오류로 실패한다. IAM Policy로 PutImage를 제거(A)하면 아무도 이미지를 push할 수 없어서 CI/CD가 깨진다. Lifecycle Policy(C)는 삭제 제어이고 수정 방지가 아니다.

---

**문제 5.** Docker Hub Rate Limit으로 인해 EKS 클러스터에서 nginx 공식 이미지 pull이 간헐적으로 실패한다. 가장 근본적인 해결책은?

A) EKS 노드 수를 줄여 pull 횟수 감소
B) ECR Pull Through Cache를 Docker Hub와 연결하고, 클러스터의 모든 nginx pull을 ECR 경유로 변경
C) Docker Hub 계정을 유료로 업그레이드
D) nginx 이미지를 S3에 저장하고 필요 시 다운로드

**정답: B**
해설: ECR Pull Through Cache가 근본적 해결책이다. 첫 번째 pull은 Docker Hub에서 가져와 ECR에 저장하고, 이후 pull은 ECR에서 직접 제공한다. ECR이 Docker Hub 인증 정보를 Secrets Manager에서 관리하므로 인증된 계정의 Rate Limit(훨씬 높음)이 적용된다. Kubernetes 매니페스트에서 `image: nginx:1.25`를 `image: <account>.dkr.ecr.<region>.amazonaws.com/dockerhub/library/nginx:1.25`로 변경만 하면 된다. 노드 감소(A)는 임시방편이고, 유료 업그레이드(C)도 가능하지만 AWS 서비스 안에서의 해결이 권장된다.

---

**문제 6.** ECR Cross-Region Replication을 설정했는데 새 이미지가 목적 리전에 복제되지 않는다. 가장 먼저 확인해야 할 것은?

A) 목적 리전의 IAM 권한
B) repositoryFilters의 PREFIX_MATCH 패턴이 리포지토리 이름과 일치하는지, 그리고 목적 리전에 해당 리포지토리가 사전에 생성되어 있는지
C) KMS 키 설정
D) ECR 스캔 설정

**정답: B**
해설: Replication이 동작하지 않는 가장 흔한 원인 두 가지다. (1) repositoryFilters의 PREFIX_MATCH 패턴이 리포지토리 이름과 매칭되지 않는 경우—예: `filter: "prod/"` 설정인데 리포지토리 이름이 `myapp`(prod/ 프리픽스 없음)이면 복제 안 됨. (2) 목적 리전에 동일 이름의 리포지토리가 없는 경우—설정에 따라 자동 생성이 안 될 수 있어서 리포지토리를 수동으로 먼저 생성해야 함. 복제는 비동기라서 즉시 확인해도 보이지 않을 수 있다.

---

**문제 7.** ECR 이미지의 SBOM(Software Bill of Materials)과 CVE 정보를 지속적으로 모니터링하고, 새 CRITICAL 취약점 발견 시 운영팀에 자동 알림을 보내는 아키텍처는?

A) Inspector Enhanced Scanning + CONTINUOUS_SCAN → Inspector Finding 생성 → Security Hub → EventBridge → SNS → 이메일/Slack
B) Basic Scanning + CloudWatch 알람
C) Lambda가 매일 ECR describe-images 호출 후 취약점 데이터베이스와 비교
D) Trusted Advisor 대시보드 주기적 모니터링

**정답: A**
해설: Inspector Enhanced Scanning이 CVE 데이터베이스 업데이트 시 자동 재평가(CONTINUOUS_SCAN)하고 Findings를 생성한다. Security Hub가 이 Findings를 수집하고, EventBridge Rule이 "CRITICAL Inspector Finding"을 필터링해 SNS로 라우팅, 이메일과 Slack(Chatbot)으로 즉시 알림이 간다. 이 전체 파이프라인이 완전 자동이고 새 CVE 발표 후 수 시간 이내에 감지/알림이 완료된다. 나머지 옵션은 의존성 스캔(B)을 하지 않거나(C, D) 자동화가 불완전하다.

---
