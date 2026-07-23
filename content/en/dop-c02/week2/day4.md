# Day 4 - DevSecOps Shift Left: Automated Security Gates Built with Code Signing, CodeGuru, and Inspector

The direct cause of the 2019 Capital One breach that leaked 106 million customers' data was an SSRF vulnerability in a WAF, but the real reason it grew into an incident that large is that **nowhere in the build pipeline was there an automated security gate that could catch SSRF**. One line of SAST, one code review step, one IMDS hop-limit check wired into the PR stage would have stopped the incident before it happened. DevSecOps' "Shift Left" is the work of moving those gates from **operations (right) to PR/IDE (left)**.

Today we map those gates onto AWS tooling: the three CodeGuru services, the chain of trust built with AWS Signer, Inspector's automatic CVE scanning, and how all of it weaves together with industry standards like SLSA, SBOM, and OCI into a single pipeline. The exam does not ask for tool names — it asks "at which stage of this scenario should which verification go in?"

---

## 🎯 Learning Objectives

- Clearly understand how CodeGuru Reviewer/Security/Profiler differ in timing and target
- Be able to draw the full flow of signing Lambda, containers, and generic code with AWS Signer
- Understand how Inspector's EC2/ECR/Lambda scanning integrates with Security Hub
- Understand how supply chain standards like SLSA, SBOM, and in-toto map onto AWS tools
- Apply the "Shift Left" principle to prioritization decisions in exam scenarios

---

## 🧩 Prerequisite Knowledge (CS Fundamentals)

- **SAST (Static Application Security Testing)**: Static analysis of source code. Pre-build stage. Taint analysis, data flow.
- **DAST (Dynamic)**: Analysis while running. Usually tools like OWASP ZAP or Burp in a staging environment.
- **IAST (Interactive)**: Analysis via instrumentation injected at runtime. Halfway between SAST and DAST.
- **SCA (Software Composition Analysis)**: Dependency vulnerability analysis. CVE DB matching.
- **SBOM (Software Bill of Materials)**: Component inventory. SPDX / CycloneDX / SWID standards. Effectively mandated for US federal procurement by EO 14028 (2021).
- **Code Signing**: Sign a code hash with a private key only the signer holds → verifiers check it with the public key.
- **Supply Chain Attack**: Attacking the build/deploy path itself. SolarWinds (2020), Codecov (2021), 3CX (2023).
- **SLSA**: Supply-chain Levels for Software Artifacts (Google, 2021). A four-level (L1-L4) assurance model.
- **in-toto**: NYU's attestation framework. Signed metadata describing what each pipeline stage did and how.
- **Shift Left**: Moving security checks as early in the SDLC as possible.

---

## 📖 Theory

### 1. The Three CodeGuru Services — Differences in Timing and Target

| Service | Timing | Analysis Target | Output | Can Block |
|--------|------|-----------|------|-----------|
| **CodeGuru Reviewer** | On PR/code change | Java, Python source (static) | PR comments (performance, security, best practices) | ❌ (comments only) |
| **CodeGuru Security** | On PR/Build | Multi-language security patterns | Findings (CWE/CVSS mapped) | ❌ (needs an external gate) |
| **CodeGuru Profiler** | Runtime | Java/Python/Node processes | Flame graphs, cost optimization advice | ❌ (observability) |

> 💡 Reviewer and Security have been increasingly consolidated since 2024. Security is evolving faster on a Bedrock LLM foundation. CodeGuru Reviewer's Java/Python analysis is scheduled to end in June 2025 → CodeGuru Security and Amazon Q Developer are the successors.

**How to connect repositories:**
- Register CodeCommit / GitHub / GitLab / Bitbucket / S3 repositories through the **Associate** API
- Automatic analysis when a PR is created, webhook-based
- Findings are **automatically forwarded to Security Hub** (ASFF format)

> 🔍 **Deep Dive**: CodeGuru Reviewer's analysis engine works in two stages. ① **Program analysis**: AST (Abstract Syntax Tree) based data-flow analysis. For example, it traces SQL injection patterns (`request.getParameter()` → `Statement.executeQuery()`) with taint propagation. ② **ML augmentation**: a model trained on billions of lines of Amazon's internal codebase pattern-matches "this shape of code usually leads to an incident." That is why false positives are lower than with plain grep. But **it is still LLM-based and therefore not 100%** — on the exam, an option claiming "CodeGuru catches every security problem" is always a trap.

> 💡 **Related Theory**: The precision-recall trade-off of SAST tools. When there are too many false positives (bogus alerts), developers start ignoring them (alert fatigue) and real findings get buried too. SonarQube, Checkmarx, Snyk Code, and CodeGuru Security all pick their own position on that trade-off. Data from the OWASP Benchmark Project (an annual SAST tool evaluation) comparing each tool's Youden Index (TPR - FPR) leads to one conclusion: there is no perfect tool.

### 2. AWS Signer — The Starting Point of the Chain of Trust

A managed code signing service. AWS manages the KMS-backed signing keys and the customer only creates a Signing Profile.

| Use Case | Signing Target | Verification Point | Profile platform_id |
|-----------|-----------|-----------|---------------------|
| **Lambda** | Lambda function code zip | At Lambda deployment | `AWSLambda-SHA384-ECDSA` |
| **Containers (Notary v2)** | OCI container images | EKS Admission / ECS task launch | `Notation-OCI-SHA384-ECDSA` |
| **IoT** | IoT device OTA firmware | Device boot | `AmazonFreeRTOS-*` |
| **SAM/Generic** | Arbitrary binaries | User-defined verification | `AWSIoTDeviceManagement-SHA256-ECDSA` |

**Signing Profile**: a bundle of signing key and policy. When the profile version changes, a new ARN is issued (`/profile/v123`).

```bash
aws signer put-signing-profile \
  --profile-name LambdaProdSigner \
  --platform-id AWSLambda-SHA384-ECDSA \
  --signature-validity-period value=12,type=MONTHS \
  --tags Env=Production,Team=SRE
```

**Lambda Code Signing Config:**
- `UntrustedArtifactOnDeployment`: `Warn` or `Enforce`
- `Enforce`: code that is unsigned or signed by an untrusted profile is rejected at deployment (CodeSigningConfigNotFoundException)
- `Warn`: only records a warning in CloudWatch Logs; the deployment proceeds

> ⚠️ **Trap**: It is a common incident to switch `Warn` mode on "for testing" and leave it that way in prod. The Capital One post-mortem shows the same recurring pattern: "the security tooling existed, but it was not in blocking mode." On the exam, if "enforce signature verification" is the keyword, the answer is always Enforce.

> 🔍 **Deep Dive**: AWS Signer's verification stage checks two things. ① **Signature validity**: can the signature be verified with the profile's public key? ② **Profile trust**: is this profile in the `allowed-publishers` list? Both conditions must pass. Profile version is checked as well, so after key rotation you must add the new profile version ARN to `allowed-publishers` (the previous version coexists until it expires).

### 3. Inspector — Automatic Scanning of Dependency, Image, and OS Vulnerabilities

Inspector v2 automatically scans three resource types.

| Resource | Trigger | Analysis Target |
|------|--------|-----------|
| **EC2 instances** | Inventory changes via SSM Agent | OS packages + language libraries (Java, Python, .NET, etc.) |
| **Container images (ECR)** | Automatically on ECR push + rescan every 24h | OS layer + language dependencies |
| **Lambda functions** | On function update (Code & Layer) | Code + dependencies |

**Core mechanisms:**
- Based on CVE databases (NVD + per-vendor advisories)
- Provides both a **CVSS score and an Inspector score** (adjusted for exploitability)
- Findings are automatically sent to Security Hub in ASFF format
- EventBridge can trigger Lambda/SNS when a finding appears

**Standard vs Enhanced (ECR):**
- Standard (free): Clair-based, one scan on push, OS layer only
- Enhanced (Inspector v2): Snyk-based, continuous scanning, OS + language dependencies, rescan every 24h

> 🔍 **Deep Dive**: The reason ECR Enhanced Scanning does a "24h rescan" is that **CVEs are newly discovered even when the code never changes**. An image built once may have been clean yesterday, but if a new CVE like Log4j is disclosed at dawn today, the same image suddenly becomes vulnerable. Inspector rematches the CVE database against image manifests every day to surface "now-known vulnerabilities." This is the heart of security for containers already running in prod — scanning at build time alone is not enough.

> 💡 **Related Theory**: The biggest lesson from Log4Shell (CVE-2021-44228, CVSS 10.0), disclosed on December 9, 2021, is that "you must track the dependencies of workloads already running in prod in real time." AWS added Lambda function code scanning to Inspector the very next month, in January 2022, and that is no coincidence. SBOM being effectively mandated by the US executive order EO 14028 (2021) belongs to the same current.

### 4. The DevSecOps Shift-Left Pipeline — The Whole Picture

```
Pre-commit (developer local)
   ├─ pre-commit hook (git-secrets, lint)
   ├─ IDE integration: CodeWhisperer + Amazon Q Developer security review
   └─ block AWS key leaks with git-secrets

Pull Request
   ├─ CodeGuru Reviewer/Security (automatic comments)
   ├─ SAST: Snyk Code, Checkmarx, SonarQube
   ├─ SCA: npm audit, pip-audit, Snyk Open Source
   ├─ Secret scan: GitHub Secret Scanning + Push Protection
   ├─ Branch Protection: Required Status Check
   └─ Approval Rule Template (CodeCommit) / Required Reviewers (GitHub)

Build (CodeBuild)
   ├─ Inspector (image scan on ECR push)
   ├─ Trivy / Grype (container OSS scanning, IaC scanning)
   ├─ SBOM generation (Syft → CycloneDX / SPDX)
   ├─ SLSA provenance generation (in-toto attestation)
   └─ signing with AWS Signer (Lambda zip or OCI image)

Deploy (CodeDeploy / EKS Admission)
   ├─ Signer verification
   ├─ Admission Controller (ECS/EKS): Kyverno, Gatekeeper, ratify
   ├─ Policy as Code (OPA)
   └─ Pre-deploy hook (smoke test)

Runtime
   ├─ GuardDuty (runtime threats + Malware Protection)
   ├─ CodeGuru Profiler
   ├─ Macie (S3 PII detection)
   ├─ Security Hub (aggregation + automatic remediation)
   └─ AWS Config (drift detection)
```

### 5. SLSA Levels and the AWS Tool Mapping

SLSA (Supply-chain Levels for Software Artifacts) is a four-level model Google created after the 2021 SolarWinds incident.

| Level | Requirements | AWS Mapping |
|-------|---------|----------|
| **L1** | Documented build process, provenance generation | CodeBuild + buildspec checked in |
| **L2** | Version control + hosted build service + signed provenance | CodeCommit/GitHub + CodeBuild + Signer |
| **L3** | Source/build platform isolation, isolated build, non-falsifiable provenance | VPC CodeBuild + isolated IAM Role + in-toto attestation |
| **L4** | 2-person review + hermetic/reproducible build | + Approval Rule Template + guaranteed build determinism |

> 📚 **Case Study**: The December 2020 SolarWinds Orion incident was a case where the build system itself was penetrated and the SUNBURST backdoor injected into otherwise legitimate code. 18,000 organizations were affected, among them the US Treasury, the Department of Homeland Security, Microsoft, and FireEye. The post-mortem found: ① permissions granting direct access to the build server were far too broad ② there was no provenance, so a legitimate build could not be distinguished from a compromised one ③ signatures existed, but the signing key itself sat on the build server and was stolen along with everything else. SLSA L3 is precisely the standard for blocking those three things.

> 🔍 **Deep Dive**: SLSA L3's "non-falsifiable provenance" means signing the provenance with a **signing key outside the build service**. On AWS, the pattern is that after CodeBuild finishes, a separate Lambda creates an in-toto attestation signed with KMS and pushes it as a separate layer of the ECR OCI artifact. AWS Signer for Containers (Notation-based) standardizes this. Compared with cosign/Sigstore's keyless mode, AWS is KMS-backed so key rotation and access control are clearer, but it lacks the simplicity of OIDC keyless where "there is no key at all."

### 6. Preventing Secret Leaks — Defense in Depth

```
[ 4 layers of secret-leak defense ]

  Layer 1: IDE/Local
    git-secrets (pre-commit hook)
    IDE plugin (CodeWhisperer security review)
            ↓
  Layer 2: Push
    GitHub Secret Scanning + Push Protection
    (rejects the push itself)
            ↓
  Layer 3: Repository
    GitHub Advanced Security
    TruffleHog / GitGuardian webhook
            ↓
  Layer 4: Build/Runtime
    Secrets Manager automatic rotation
    CodeBuild env.secrets-manager integration
    never keep a .env file in the repository
```

- **git-secrets**: matches AWS key patterns (`AKIA[A-Z0-9]{16}`), pre-commit hook
- **GitHub Push Protection**: rejects 30+ providers' keys at push time (GA in 2023)
- **AWS Secrets Manager**: Lambda-based automatic rotation (native for RDS, Redshift, DocumentDB)
- **CodeBuild's `env.secrets-manager`**: reference a secrets-manager ARN directly from buildspec

---

## 🧠 Deeper Theory Worth Knowing

### The Full Lambda Code Signing Flow

```
Developer → CodeBuild build → upload zip to S3
                                |
                                v
                       aws signer start-signing-job
                       (source S3 → destination S3)
                                |
                                v
                          Signed S3 object
                       (zip + signed metadata)
                                |
                                v
                    aws lambda update-function-code
                          --code-signing-config-arn ...
                                |
                                v
                  Lambda verifies the Signing Profile
                  Untrusted → CodeSigningConfigNotFoundException
                  Trusted   → normal deployment
```

> ⚠️ **Trap**: `UntrustedArtifactOnDeployment=Warn` only leaves a warning in CloudWatch Logs and lets the deployment proceed. Actual deployment blocking is `Enforce`. On the exam, if "enforce (strict)" is the keyword, the answer is Enforce.

### Multi-Region Signature Verification

- Signing Profiles are **per-region** (not global)
- To deploy the same code to multiple regions:
  - Option 1: create a profile with the same name and platform in each region (the profile ARN differs per region)
  - Option 2: sign in one region and register that ARN in the other region's Lambda `allowed-publishers` (cross-region trust)
- Option 1 carries less operational burden but risks key sprawl. Option 2 is better for keeping keys centralized.

### Container Signing - AWS Signer vs cosign

| Tool | Standard | Key Management | Verification Tool |
|------|------|---------|---------|
| **AWS Signer for Containers** | Notary v2 (Notation) | KMS-backed | `ratify` (CNCF, AWS-sponsored) |
| **cosign (Sigstore)** | OCI 1.1 + Fulcio CA | OIDC-based keyless (short-lived X.509) | `cosign verify`, `policy-controller` |
| **Notary v1** | Docker Content Trust | TUF + local | Being deprecated |

Enforcing image policy on EKS uses the **`ratify` admission webhook** (AWS Signer) or the **Sigstore `policy-controller`** (cosign). Both can express policy through OPA Gatekeeper / Kyverno.

> 🔍 **Deep Dive**: Sigstore's keyless signing is a combination of **short-lived X.509 certificates and a transparency log (Rekor)**. When a developer submits a GitHub OIDC token to the Fulcio CA, a 10-minute X.509 certificate is issued; the developer signs with that certificate and records it in the Rekor transparency log. There is no key management, so there is no risk of losing a key, but the downside is depending on Fulcio + Rekor at verification time. AWS Signer keeps the key permanently in KMS, giving a different operating model — **AWS Signer suits enterprise environments with centralized IAM**, while **cosign suits open source projects with distributed trust**.

### CodeGuru Reviewer Cost/Benefit + Limits

- Priced by lines of code (monthly, $30 for 100K LOC + per additional line)
- Additional LLM insights on Bedrock (2024+)
- Does not block the build — PR comments only. To enforce, either ① Approval Rule + bot check or ② CodeBuild status check
- **Limits**: languages other than Java/Python go to CodeGuru Security (TypeScript, JavaScript, C#, Go, Ruby supported)

### Inspector vs Trivy vs Snyk

| Tool | Strength | AWS Integration | Pricing Model |
|------|------|----------|-----------|
| **Inspector** | Native to ECR/EC2/Lambda, automatic Security Hub, 24h rescan | Strongest | Per resource |
| **Trivy** | Free OSS, multipurpose for IaC/SBOM/images, fast | Run in CodeBuild | Free |
| **Snyk** | Developer-friendly UX, IDE integration, automatic fix PRs | External SaaS, AWS Marketplace | License |
| **CodeGuru Security** | LLM-based code analysis, multi-language | Native | Per line |

Combination pattern: CodeGuru Security (SAST) at the PR stage + Trivy (images) at the build stage + Inspector on ECR push + GuardDuty at runtime.

### Related Services Cross-Reference

- **Security Hub** → Week 14 Day 2 (aggregation hub, ASFF format)
- **Inspector** → Week 14 Day 4
- **Secrets Manager** → Week 9 Day 4
- **ECR Image Scan** → Week 6 Day 1
- **GuardDuty Malware Protection** → Week 14 Day 3 (EBS/Lambda/S3 scanning)

---

## 🏗️ Architecture Diagram

```
Shift-Left Security Pipeline (Full)
==================================================

  Developer Laptop
    ├─ git-secrets (pre-commit)
    ├─ IDE: Amazon Q Developer / CodeWhisperer security
    └─ pre-commit framework (lint + sast)
            |
            v
  CodeCommit / GitHub
    ├─ CodeGuru Reviewer (PR auto-comment)
    ├─ CodeGuru Security (PR Finding → Security Hub)
    ├─ GitHub Secret Scanning + Push Protection
    └─ Approval Rule Template
            |
            v
  CodeBuild
    ├─ SAST (CodeGuru Security or Snyk Code)
    ├─ SCA (Snyk Open Source / npm audit / pip-audit)
    ├─ Container build → Trivy → ECR
    ├─ SBOM generation (Syft → CycloneDX)
    └─ SLSA L3 provenance (in-toto attestation)
            |
            v
  ECR (Push)
    ├─ Inspector Enhanced Scanning (24h rescan)
    ├─ Image signing (AWS Signer Notary v2)
    └─ Attestation push (OCI artifact)
            |
            v
  CodeDeploy / EKS Admission Controller
    ├─ Verify signature (ratify)
    ├─ OPA Gatekeeper / Kyverno policy
    ├─ Verify SBOM attestation
    └─ Pre-deploy smoke test
            |
            v
  Production
    ├─ GuardDuty Runtime + Malware Protection
    ├─ Macie (S3 PII)
    ├─ Security Hub aggregation (ASFF)
    └─ EventBridge → SSM Automation auto-remediation
```

---

## ⭐ Key Points (High Exam Frequency)

1. ⭐ CodeGuru **Reviewer** (code quality) vs **Security** (security patterns, multi-language) vs **Profiler** (runtime)
2. ⭐ Lambda Code Signing blocks only when `UntrustedArtifactOnDeployment=Enforce`
3. ⭐ Inspector scans EC2/Container/Lambda alike → automatically aggregated into Security Hub
4. ⭐ "Shift Left" — pull security checks as far forward as the PR stage
5. ⭐ Inject secrets at build time with Secrets Manager + CodeBuild `env.secrets-manager`; never keep them in the repository
6. ⭐ Generate the SBOM at the build stage (Syft/Trivy) and verify it before deployment
7. ⭐ Container signing: either AWS Signer (Notary v2) or cosign works; verification happens in an admission webhook

---

## 💻 Practical Example - Full Signer + Lambda Code Signing Flow

```bash
# 1) Create a Signing Profile
aws signer put-signing-profile \
  --profile-name LambdaProd \
  --platform-id AWSLambda-SHA384-ECDSA \
  --signature-validity-period value=12,type=MONTHS

# 2) Create a Code Signing Config
aws lambda create-code-signing-config \
  --description "Prod CodeSigning" \
  --allowed-publishers SigningProfileVersionArns=arn:aws:signer:ap-northeast-2:123456789012:/signing-profiles/LambdaProd/abc123 \
  --code-signing-policies UntrustedArtifactOnDeployment=Enforce

# 3) Upload the build zip to S3, then sign it
aws signer start-signing-job \
  --source 's3={bucketName=builds,key=app.zip,version=abc123}' \
  --destination 's3={bucketName=signed,prefix=signed/}' \
  --profile-name LambdaProd \
  --client-request-token unique-request-id-12345

# 4) Update the Lambda function (linked to the Code Signing Config)
aws lambda update-function-code \
  --function-name MyFn \
  --s3-bucket signed \
  --s3-key signed/abc123/app.zip

# 5) Attach the Code Signing Config to the Lambda
aws lambda put-function-code-signing-config \
  --function-name MyFn \
  --code-signing-config-arn arn:aws:lambda:ap-northeast-2:123456789012:code-signing-config:csc-xxx
```

**When attempting to deploy unsigned code (Enforce mode):**
```
An error occurred (CodeSigningConfigNotFoundException) when calling UpdateFunctionCode:
  Code signing config not found, or artifact is not signed by trusted publisher
```

### Example of Integrating Trivy + SBOM in CodeBuild

```yaml
# buildspec.yml
version: 0.2
phases:
  pre_build:
    commands:
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
  build:
    commands:
      - docker build -t $ECR_URI:$IMAGE_TAG .
      - trivy image --severity CRITICAL,HIGH --exit-code 1 $ECR_URI:$IMAGE_TAG
      - syft $ECR_URI:$IMAGE_TAG -o cyclonedx-json > sbom.json
      - aws s3 cp sbom.json s3://my-sbom-bucket/$IMAGE_TAG.json
  post_build:
    commands:
      - docker push $ECR_URI:$IMAGE_TAG
      # Inspector Enhanced Scanning scans automatically at the moment of the push
artifacts:
  files:
    - sbom.json
```

---

## 📝 연습 문제

**문제 1.** Which of the following is the most appropriate AWS service for automated code review at the PR stage?

A) CodeGuru Profiler — comment on the PR with runtime flame-graph code hotspots
B) CodeGuru Reviewer + CodeGuru Security
C) Inspector — statically scan the PR's code changes for CVEs and dependency vulnerabilities
D) GuardDuty — receive commit events and analyze malicious code patterns as threat detection

**정답: B**
해설: Profiler covers runtime performance, Inspector covers dependencies/images/OS, and GuardDuty covers runtime threats. Code analysis at the PR stage is Reviewer (quality) + Security (security). Both register the repository through the same Associate API and analyze automatically on PRs.

---

**문제 2.** Which setting is required to enforce signature verification on Lambda deployments?

A) `UntrustedArtifactOnDeployment=Warn` — record a warning in CloudWatch Logs when untrusted code is deployed
B) `UntrustedArtifactOnDeployment=Enforce`
C) Add a Lambda Layer containing signature verification logic to check integrity at runtime
D) Enable Provisioned Concurrency so only signed versions are pre-initialized and pinned

**정답: B**
해설: Warn only leaves a warning in CloudWatch Logs and lets the deployment proceed; Enforce is what actually blocks (CodeSigningConfigNotFoundException). On the exam, the keywords "enforce," "strict," and "reject untrusted code" mean Enforce.

---

**문제 3.** How do you automatically scan every image pushed to ECR, including OS and language dependencies?

A) Enable ECR Enhanced Scanning (Inspector v2 integration)
B) Trigger a Lambda on the ECR push event to run Trivy on every push and aggregate the results
C) Export ECR images to S3 and invoke an external scanner via S3 object notifications
D) Analyze CloudTrail's ECR PutImage logs to identify vulnerable images after the fact

**정답: A**
해설: Inspector Enhanced Scanning scans automatically on every ECR push plus a rescan every 24 hours. Standard scanning covers only the OS layer; Enhanced also includes language dependencies. Results are forwarded to Security Hub automatically.

---

**문제 4.** Which action best matches the "Shift Left" principle?

A) Periodically run DAST-based post-hoc penetration testing in staging after production deployment
B) Automate SAST, SCA, and secret scanning at the IDE/PR stage
C) Have the security team manually review the entire codebase once a quarter as a release gate
D) Run a bug bounty so external researchers report vulnerabilities for you to fix

**정답: B**
해설: Shift Left = moving security checks to earlier stages of the SDLC. The PR/IDE stage is the earliest, and the cost of an incident is lowest there (IBM Cost of a Data Breach Report: fixing at the code-writing stage costs 1/100 of a prod incident). A is a right shift, C has too long an interval, and D is reactive.

---

**문제 5.** A build needs a DB password. What is the safest way to inject it?

A) Hardcode the DB password directly into an env variable in buildspec.yml and inject it into the build
B) Store it in plaintext in GitHub Secrets and have the workflow pass it to CodeBuild as an environment variable
C) Store it in Secrets Manager and reference it from CodeBuild via env.secrets-manager
D) Encrypt the password with KMS, keep it in S3, and have the build fetch and decrypt it

**정답: C**
해설: The Secrets Manager + CodeBuild env.secrets-manager integration is the standard. Automatic rotation, audit logs, single source of truth. GitHub Secrets is standard for GitHub Actions, but in an AWS context (CodeBuild) Secrets Manager is the answer.

```yaml
env:
  secrets-manager:
    DB_PASSWORD: "prod/db:password"
```

---

**문제 6.** How do you make CodeGuru Reviewer a mandatory gate for PR merges?

A) CodeGuru Reviewer blocks the PR merge by itself when there are findings
B) Approval Rule + a bot that checks CodeGuru findings and approves or rejects
C) Branch Protection's Required Status Check + CodeBuild pushing a failure status when findings are not zero
D) Both B and C work

**정답: D**
해설: CodeGuru itself only leaves comments; it does not block. An external enforcement mechanism is required. B (Approval Rule + a Lambda bot querying findings through the CodeGuru API) and C (Branch Protection + CodeBuild reporting a failure through the GitHub Status API) are both industry-standard patterns. On the exam, "CodeGuru blocks directly" is always a trap.

---

**문제 7.** Which tooling is appropriate for generating and managing an SBOM (Software Bill of Materials)?

A) Syft / CycloneDX / SPDX
B) CloudTrail — collect API call history to reconstruct the component list included in a build
C) AWS Config — manage a dependency inventory from resource configuration snapshots
D) Trusted Advisor — report a list of dependency vulnerabilities from its security/cost checks

**정답: A**
해설: SBOMs use standard formats (CycloneDX, SPDX, SWID). Syft is the OSS generation tool. Trivy also supports SBOM generation. CodeArtifact is a package repository, not an SBOM generator. EO 14028 (2021) effectively made SBOMs mandatory for US federal procurement.

---

**문제 8.** What does a build pipeline need in order to reach SLSA L3?

A) Build with CodeBuild and check the buildspec into the repository to document the build process (an L1-level measure)
B) An isolated build environment (VPC + least-privilege IAM Role) + non-falsifiable provenance (an in-toto attestation signed with a key outside the build) + version control
C) Add a Trivy vulnerability scan to the build artifacts to guarantee there are no CVEs
D) Move the build to Lambda so function-level isolation blocks interference from other builds

**정답: B**
해설: SLSA L3's requirements are ① source/build platform isolation ② isolated build (unaffected by other builds) ③ non-falsifiable provenance (the signing key lives outside the build environment, so even a compromised build cannot forge provenance). On AWS this is implemented with VPC CodeBuild + KMS signing + in-toto attestation. It is the standard for preventing incidents like SolarWinds.

---

**문제 9.** A company wants to enforce "never run an unsigned container image" on production EKS. Which mechanism is most appropriate?

A) Use an IAM policy to deny Pull permissions on ECR repositories holding unsigned images
B) Sign images with AWS Signer + deploy the ratify (or Sigstore policy-controller) admission webhook on EKS + express the policy with Kyverno/OPA
C) Block egress to untrusted registries with a Calico NetworkPolicy so images cannot be pulled
D) Enforce readOnlyRootFilesystem and non-root execution in the Pod SecurityContext to restrict unsigned images

**정답: B**
해설: This is the standard pattern for container signature verification. ① Sign the image with AWS Signer for Containers (Notary v2) or with cosign keyless signing ② Deploy the ratify (AWS) or policy-controller (Sigstore) admission webhook on EKS ③ Write a "reject unsigned images" policy with Kyverno or OPA Gatekeeper. IAM, NetworkPolicy, and SecurityContext are controls on other dimensions (access, network, privilege), not signature verification.

---

**문제 10.** A new CVE has been found in a Lambda function's dependencies, but the function code has not changed. What is the fastest way to learn about it?

A) Since no rescan happens when the code does not change, wait until the next function update or deployment
B) Inspector Lambda scanning (2023+) — Inspector detects CVE database changes, rematches them against existing functions, and notifies through EventBridge
C) Analyze CloudTrail's function invocation and update logs to detect vulnerable dependency usage after the fact
D) Force a redeployment of the Lambda every day so a deployment-time dependency scan runs each time

**정답: B**
해설: The lesson of Log4Shell (2021) — "already deployed functions become vulnerable too when a new CVE is disclosed." Inspector v2 supports Lambda scanning (GA in 2023) and reevaluates dependencies on function update plus every 24 hours. When a new CVE is found, an EventBridge event fires → notify Lambda/SNS → auto-patch via SSM Automation. CloudTrail tracks API calls; it does not detect CVEs.

---

**문제 11.** A company worried about supply chain attacks wants to strengthen the trustworthiness of its build artifacts. Which combination is most suitable for reaching SLSA L3?

A) Add only a Trivy CVE scan of the build artifacts to guarantee no known vulnerabilities
B) Isolate CodeBuild inside a VPC + sign an in-toto attestation with a KMS key (key kept outside the build environment) + ECR Enhanced Scanning + sign the final image with AWS Signer
C) Use only GitHub-hosted Actions runners to delegate build infrastructure management outside AWS
D) Have the security team manually review every build artifact before release to check for compromise

**정답: B**
해설: This combination satisfies all three of SLSA L3's core requirements. ① **Isolation**: VPC CodeBuild + a build-only IAM Role (least privilege) ② **Non-falsifiable provenance**: the KMS key lives outside the build environment, so even a compromised build cannot forge an attestation ③ **Verifiable artifacts**: AWS Signer signatures + Inspector scanning. The SolarWinds incident was precisely the absence of these three.

---

**문제 12.** A security team receives a report that "there are so many security gates at the PR stage that developers are routing around them." What is the most appropriate response?

A) Remove all PR-stage security gates and move the checks to post-deployment stages to restore development speed
B) Risk-based gating — block PRs only on Critical/High, notify only on Medium/Low + weekly tracking + introduce automatic fix PRs (Dependabot/Snyk)
C) Have the security team review every finding by hand and decide case by case whether to block
D) Turn off PR-stage checks and detect threats only at production runtime (GuardDuty, etc.)

**정답: B**
해설: **Alert fatigue plus workarounds** is the most common failure pattern of security automation. The answer is not "more gates" but "smarter gates." Risk-based gating means ① classification by CVSS score (block only Critical 9.0+ and High 7.0+) ② minimizing developer burden with automatic fix PRs ③ tracking Medium/Low on a dashboard while allowing the merge. The CodeGuru Security + Snyk + Dependabot combination is standard. A and D are security regressions, and C denies the very point of automation.

> 🎯 **Scenario**: A fintech configured every finding to block PRs, and developers responded by creating a separate branch strategy "for bypassing the security gates." The post-mortem found ① 80% of alerts were false positives ② there was no prioritization, so critical and low carried the same weight ③ developers did not know how to fix the issues. The fix was to switch to CodeGuru Security's CVSS-based automatic classification + Snyk's auto-PRs + a risk-based policy that blocks only Critical. The PR pass rate improved from 12% to 89%, and the average time to resolve a finding from 14 days to 1.2 days.

---

## 📌 Today's Summary

1. **The three CodeGuru services**: Reviewer (quality) + Security (multi-language security) + Profiler (runtime cost/performance) — different timing, different targets
2. **AWS Signer**: signs Lambda, containers, and generic code. Lambda actually blocks only when `UntrustedArtifactOnDeployment=Enforce`
3. **Inspector v2**: automatic scanning of ECR/EC2/Lambda + 24h rescan, automatically aggregated into Security Hub
4. **Shift Left**: IDE → PR → Build → Deploy → Runtime, move checks as far left as possible
5. **SLSA L3**: isolated build + non-falsifiable provenance + verifiable artifacts. The SolarWinds lesson
6. **SBOM**: generated at the build stage with Syft/Trivy, CycloneDX/SPDX standards, effectively mandated by EO 14028
7. **Four layers of secret defense**: IDE git-secrets → push GitHub Secret Scanning → repository stream scanning → build-time Secrets Manager
