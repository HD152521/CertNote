# Day 3 - CodeArtifact and Supply Chain Security: When Dependencies Become Attack Surface

December 2020: SolarWinds, December 2021: Log4Shell, 2022: ua-parser-js malware injection, 2023: PyTorch nightly dependency confusion attack—what do the largest security incidents of the past five years have in common? All **penetrated through the software supply chain**. Not direct code exploitation but through dependent packages.

As this landscape shifts, "where you get packages from" becomes a first-class security concern in CI/CD systems. CodeArtifact is AWS's answer. On the surface it's a "managed npm/Maven/PyPI mirror", but in reality it means **creating a single entry point for supply chain that enables a controllable trust boundary**.

Today covers: ① why CodeArtifact's Domain/Repository layering is designed that way ② how Upstream chaining absorbs external registry failures and package unpublishes ③ how Dependency Confusion attacks work and how CodeArtifact's namespace prevents them ④ the three-layer permission evaluation (IAM + Repository Policy + Domain Policy) ⑤ where emerging standards like SBOM/SLSA/Sigstore fit in.

## Real-World Supply Chain Attacks — Why Using External Registries Directly Is Dangerous

To understand CodeArtifact's value, you must first see "why is using external registries directly risky?" Let me review actual incidents.

| Year | Incident | Mechanism | Impact |
|------|----------|-----------|--------|
| **2016** | `left-pad` unpublish | Author deletes package from npm → React/Babel builds halt entirely | Half the internet's build systems paralyzed. An 11-line function caused havoc |
| **2018** | `event-stream` hijack after takeover | Popular package permissions transferred to malicious developer → Bitcoin wallet theft code injected | 2 million downloads/week |
| **2020** | SolarWinds Orion | Build system infiltrated → backdoor inserted into officially signed updates | 18,000 US government organizations affected |
| **2021** | Log4Shell (Log4j 2.x JNDI) | RCE through Log4j lookup function | Apache ecosystem system-wide, government/enterprise emergency |
| **2021** | Codecov bash uploader | Credential extraction code injected into build script | HashiCorp, Twilio and others affected |
| **2021** | `ua-parser-js` account hijack | Official maintainer account compromised → malware added | 7 million downloads/week at time of discovery |
| **2022** | `colors.js` sabotage | Author added infinite loop code to his own package | Node.js ecosystem disrupted |
| **2023** | PyTorch nightly dependency confusion | Dummy package `torchtriton` published to PyPI → PyTorch build chose PyPI over internal | PyTorch nightly users' credentials leaked |
| **2024** | `xz-utils` backdoor (CVE-2024-3094) | 2-year social engineering gained maintainer access, SSH backdoor inserted | systemd dependency → nearly all Linux distros at risk before discovery |

This list isn't random incidents. **Build systems directly depending on external registries immediately absorb external incidents**—cumulative evidence. Without an intermediate cache and control layer like CodeArtifact, all the incidents above would have entered builds at build time.

> 📚 **Case Detail**: The 2016 left-pad incident started with a single line decision (author ran `npm unpublish`). When npm sided against him in a Kik Messenger package naming dispute, he unpublished all his packages. left-pad was transitively depended on by React, Babel, Webpack, and others; consequently, builds worldwide broke simultaneously. After this incident, npm introduced a 24-hour unpublish window, and many organizations began implementing internal mirrors. CodeArtifact's Upstream cache principle exactly embodies the lesson from this incident.

## Domain and Repository Layers — Why Two Levels?

CodeArtifact isn't a single plane but a **Domain → Repository** two-tier hierarchy. This separation is intentional and frequent on exams.

```
Domain (organizational unit, usually 1-2)
├── KMS Key (encrypt all Domain assets)
├── Asset Storage (deduplication)
├── Domain Policy (broad permissions)
│
├── Repository: production
│   ├── Repository Policy
│   ├── Upstream → shared-cache
│   └── Packages: app-frontend@1.2.3, app-backend@2.0.1, ...
│
├── Repository: development
│   ├── Repository Policy
│   ├── Upstream → shared-cache
│   └── Packages: ...
│
└── Repository: shared-cache
    ├── External Connection → public:npmjs, public:pypi
    └── Packages: lodash@4.17.21, requests@2.28.0, ...
```

| Unit | Design Meaning |
|------|----------------|
| **Domain** | Unified asset storage + single KMS key. Even if same `lodash@4.17.21` exists in multiple Repositories, Domain stores it once. Unit for billing. |
| **Repository** | Unit for permissions, Upstream, external connections. One Domain can have dozens to hundreds of Repositories. |

> 🔍 **Deep Dive**: Domain's KMS key unification is subtle but important. Adding more Repositories within the same Domain needs no new KMS key. However, **moving data between Domains involves different KMS keys**, requiring separate decrypt-encrypt cost. So organizations typically keep Domains small (1-2) and separate environments by Repository. In exams, when "why not create more Domains?", the answer is almost always asset deduplication + KMS unity.

> 💡 **Related Theory**: This two-tier model is an instance of **multi-tenancy in storage** pattern—providing isolated views on shared storage. AWS S3 with multiple prefixes in one bucket, Kubernetes with namespaces in one cluster follow the same philosophy. Shared infrastructure (storage) stays singular; logical isolation (permissions, views) handled at higher layers.

## Upstream and External Connection — The Value of a Single Entry Point

CodeArtifact's most powerful feature is **Upstream chaining**. Connecting Upstream to a Repository automatically fetches and caches packages not found locally.

```
Build tool (npm install lodash@4.17.21)
    |
    | npm config registry = https://...codeartifact.ap-northeast-2.amazonaws.com/npm/production/
    v
[CodeArtifact: production]
    | cache miss
    v
[CodeArtifact: shared-cache]
    | cache miss
    v
[External Connection: public:npmjs]
    v
npmjs.com
    | download
    v
store in shared-cache
view from production (assets stored once in Domain)
    v
deliver to build
```

This structure's value has multiple layers:

| Value | Mechanism |
|-------|-----------|
| **External Outage Isolation** | npmjs.com down? Cached packages still serve normally |
| **Deletion Protection** | Even if unpublished externally, cache copy remains (prevents left-pad incident) |
| **Supply Chain Control** | All external packages pass through shared-cache single entry point → blocking policy, audit, scanning entry |
| **Cost Reduction** | Prevent repeated downloads of identical packages |
| **Speed** | Within-region cache hit = millisecond response |

> ⚠️ **Trap**: External Connection should **only connect to leaf Repositories like shared-cache**, not directly to production Repository. Direct External Connection to production bypasses blocking policy. In exams, "standard CodeArtifact for supply chain control" almost always shows "production → shared → external" 3-tier.

> 🔍 **Deep Dive**: External Connections can attach to `public:npmjs`, `public:maven-central`, `public:maven-googleandroid`, `public:maven-clojars`, `public:maven-commonsware`, `public:pypi`, `public:nuget-org`, `public:ruby-gems-org`, etc. One per Repository, one External Connection handles one package format. Multi-language builds split format by Repository.

> 📚 **Case Study**: A payments company updated all internal builds to Log4j 2.17.1 within 4 hours during December 2021's Log4Shell crisis. The secret: adding a blocking policy to CodeArtifact's shared-cache Repository—"Log4j 2.0-2.16 packages deny ReadFromRepository". Builds automatically requested new versions; all environments upgraded consistently. Without CodeArtifact, this control was impossible with external npm/Maven directly.

## Three Permission Layers — IAM + Repository Policy + Domain Policy Evaluation Order

CodeArtifact controls permissions with three policy layers. This is where exams confuse students.

| Layer | Defined At | Scope | Analogy |
|-------|-----------|-------|---------|
| **IAM Identity Policy** | User/Role | What actions that Principal can take | "What I can do" |
| **Repository Policy** | Repository itself | Who can access that Repository (cross-account included) | "Who can enter this Repository" |
| **Domain Policy** | Domain itself | Broad impact on all assets/Repositories within Domain | "Rules applying to entire Domain" |

Evaluation order:

```
1. Domain Policy evaluation (broad deny first)
   └→ explicit Deny → immediate rejection
2. Repository Policy evaluation
   └→ explicit Deny → immediate rejection
3. IAM Identity Policy evaluation
   └→ explicit Allow required

cross-account requires Allow on both sides (Identity + Resource)
```

> ⚠️ **Trap**: If Repository Policy grants read to another account's Role but Domain Policy blocks that Org, the result is denial. Domain Policy evaluates first at broad level. In exams, "Repository Policy allows cross-account but fails" scenario's answer is almost always Domain Policy or KMS key policy.

```json
// Domain Policy example — only specific Org allowed
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": ["codeartifact:GetAuthorizationToken"],
    "Resource": "*",
    "Condition": {
      "StringEquals": {
        "aws:PrincipalOrgID": "o-abc123"
      }
    }
  }]
}
```

```json
// Repository Policy — only CI bot publishes, all workers read
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublishOnlyByCi",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::111:role/CodeBuildRole"
      },
      "Action": ["codeartifact:PublishPackageVersion", "codeartifact:WriteFromRepository"],
      "Resource": "*"
    },
    {
      "Sid": "ReadByAllWorkers",
      "Effect": "Allow",
      "Principal": {
        "AWS": "*"
      },
      "Action": ["codeartifact:ReadFromRepository", "codeartifact:GetPackageVersionAsset"],
      "Resource": "*",
      "Condition": {
        "StringEquals": { "aws:PrincipalOrgID": "o-abc123" }
      }
    }
  ]
}
```

> 💡 **Related Theory**: AWS's policy evaluation model follows **deny-by-default + explicit Allow + explicit Deny is highest priority**—a consistent rule. When Domain Policy + Repository Policy + IAM Identity Policy + KMS Key Policy + SCP all cross-cut, debugging is hard. AWS IAM Policy Simulator or CloudTrail's `errorCode` reveals which layer denied.

## Dependency Confusion — The Attack CodeArtifact Specifically Prevents

Dependency Confusion is an attack documented in 2021 by Alex Birsan, demonstrated against Microsoft, Apple, PayPal and 34 other companies. Mechanism:

```
[Attack scenario]
1. Company publishes @company/internal-utils@1.0.0 to internal npm
2. Attacker publishes identical-name internal-utils@99.99.99 to npmjs.com (no namespace)
3. Company build calls npm install internal-utils
4. npm searches both → chooses higher version (99.99.99)
5. Attacker code enters company build
```

Two defenses exist:

| Defense | Mechanism |
|---------|-----------|
| **Scoped namespace** | Use `@company/internal-utils` organization scope. npmjs.com can't publish same scope (npm blocks) |
| **Single entry point + lock file** | Force CodeArtifact production as unique npm registry. Commit lock file (`package-lock.json`) to git for exact hash pinning |

> 🔍 **Deep Dive**: Lock files matter not just for version pinning but because they include **integrity hash**. The `integrity: "sha512-..."` field in `package-lock.json` is the package's exact content hash. If package changes in transit, hash mismatch rejects it. yarn's `yarn.lock`, pip's `--require-hashes` work on same principle.

> 📚 **Case Study**: Alex Birsan demonstrated successful code execution on 35 companies via dependency confusion within one month, receiving $1.3M bug bounty. Shocking that even largest firms didn't enforce lock files or use scoped names. In exams, when "Dependency Confusion defense" appears, the answer is always ① scoped namespace ② single registry (CodeArtifact) ③ lock file—all three.

## Authentication Token — 12-Hour Lifetime Meaning and Automation Pattern

CodeArtifact issues **12-hour authentication tokens** in a model similar to STS. You inject this token into `.npmrc`, `pip.conf`, `~/.m2/settings.xml` for build tools to use.

```bash
# Standard all-in-one pattern
aws codeartifact login --tool npm \
  --repository production \
  --domain my-org \
  --domain-owner 111111111111 \
  --region ap-northeast-2

# Internally:
# 1. get-authorization-token called (valid 12 hours)
# 2. ~/.npmrc updated
#    registry=https://my-org-111111111111.d.codeartifact.ap-northeast-2.amazonaws.com/npm/production/
#    //my-org-111111111111.d.codeartifact.ap-northeast-2.amazonaws.com/:_authToken=<token>
# 3. always-auth=true set
```

> 🔍 **Deep Dive**: 12 hours is no accident. 99% of CI/CD builds finish within 1 hour, but overnight large builds or multi-stage release pipelines run 4-8 hours. 12 hours covers all cases while limiting token leak impact. In exams, "token lifetime" answer is always 12 hours.

> ⚠️ **Trap**: What if token expires mid-build? Token is valid from issue time, not build start. So **refresh token right before build** is standard. CodeBuild's `pre_build` phase, GitHub Actions' first step always retrieves fresh.

## SBOM, SLSA, Sigstore — Emerging Standards for Supply Chain Security

CodeArtifact stores packages; determining "are these packages really safe?" is separate tools' job.

| Standard | Meaning | AWS Integration |
|----------|---------|-----------------|
| **SBOM (Software Bill of Materials)** | Software component list. SPDX, CycloneDX formats | Inspector can auto-generate for EC2/ECR |
| **SLSA (Supply-chain Levels for Software Artifacts)** | Google-led supply chain integrity grading (Levels 1-4) | CodeBuild + CodePipeline + Sigstore achieves SLSA L3 |
| **Sigstore (cosign, fulcio, rekor)** | OIDC-based code signing, keyless signing | ECR + cosign for container signing |
| **in-toto** | Build-phase integrity attestation | Foundation of SLSA framework |

> 💡 **Related Theory**: SLSA Framework (2021) is a direct response to SolarWinds incident. Google standardized how its Borg build system guarantees build integrity. Level 1 (build script documentation) → Level 2 (verified provenance) → Level 3 (source/build isolation, tamper-resistant) → Level 4 (2-reviewer + reproducible build). When exam asks "how ensure supply chain integrity", SLSA appearing as choice is almost the answer.

> 📚 **Case Study**: 2023, a SaaS company achieving SLSA L3 by ① building all container images only in CodeBuild + signing with cosign in ECR ② auto-generating SBOM per build stored to S3 ③ verifying signature with cosign before CodeDeploy, blocking on failure. Six months later when npm dependency was hijacked, SBOM diff immediately revealed impact scope.

## CodeArtifact vs S3 vs ECR — What Goes Where

| Use Case | Appropriate Service | Why |
|----------|--------------------|----|
| npm/Maven/PyPI/NuGet/Gradle | **CodeArtifact** | Native package manager protocol |
| Container images (Docker, OCI) | **ECR** | OCI-compliant, integrated image scanning |
| Helm Chart | **ECR (OCI)** or S3 | Helm 3+ OCI-compatible |
| General binary, zip build artifacts | CodeArtifact Generic or **S3** | Generic for search/versioning, S3 for simple storage |
| CodePipeline artifact temp storage | **S3** | Auto-expire via lifecycle policy |
| ML model files | **S3** or SageMaker Model Registry | Latter for metadata + versioning |
| Terraform Module | **CodeArtifact Generic** or S3 | Replaces Terraform Cloud private registry |

> 🎯 **Scenario**: A company wants "50 internal Helm Charts deployed safely". Answer? Not CodeArtifact but **ECR (OCI)**. Helm 3+ is OCI-compatible, so it uses container infrastructure (ECR + cosign signing + scanning). In exams, Helm Chart choice is a trap—looks CodeArtifact but answer is ECR.

## ⭐ Key Points

1. ⭐ **Domain = asset deduplication + KMS unity**. Same package across multiple Repositories stores once.
2. ⭐ **3-tier Upstream structure** (production → shared → external) is standard. Single entry for blocking/audit/scanning.
3. ⭐ Three-layer permission evaluation: Domain Policy → Repository Policy → IAM Identity Policy. Domain Policy evaluates first.
4. ⭐ Auth token 12 hours. Refresh via `aws codeartifact login` right before build.
5. ⭐ **Dependency Confusion defense = scoped namespace + single registry + lock file**.
6. ⭐ Docker/OCI images use ECR, not CodeArtifact. Helm Charts also ECR (OCI) preferred.
7. ⭐ SLSA, SBOM, Sigstore are emerging standards. CodeBuild + ECR + cosign = SLSA L3 achievable.

---

## 📝 Practice Questions

**Question 1.** What is the most appropriate CodeArtifact configuration to defend against Dependency Confusion attacks?

A) Install all packages directly from npmjs.com and check for vulnerabilities after installation with `npm audit`
B) Publish internal packages to a private CodeArtifact repository under a scoped namespace such as `@my-org` + enforce lock files + cache external packages through an upstream
C) Block internet outbound access from the build environment entirely to shut off access to external registries
D) Have the security team manually review every build artifact, including the dependency tree, and approve it before deployment

**Answer: B**
Explanation: Scoped namespace + a single registry + lock files are the standard three-part defense. A does the opposite and exposes the attack surface. C is unrealistic, and D lacks automation.

---

**Question 2.** What is the biggest difference between a domain and a repository?

A) A domain is a separation by package format such as npm/Maven, and a repository is a separation by environment such as dev/prod
B) A domain provides asset deduplication + a single KMS key, and a repository is the unit for permissions and upstreams
C) A domain is a tag-like unit that only separates billing, and a repository handles the actual permissions and storage
D) They are the same container with different names and there is no functional difference

**Answer: B**
Explanation: A domain is a broad container (KMS, deduplication, billing), and a repository is the operational unit.

---

**Question 3.** What is the maximum lifetime of a CodeArtifact authorization token in CodeBuild?

A) 1 hour — a short lifetime identical to the default STS AssumeRole session
B) 12 hours
C) 24 hours — a token once per day covers an overnight multi-stage release
D) Unlimited — after `login`, the token remains valid until it is explicitly revoked

**Answer: B**
Explanation: Both the default and the maximum of `get-authorization-token` are 12 hours. The pattern is to refresh it right before the build.

---

**Question 4.** A dependency that was on npmjs.com has been unpublished. What happens to builds that were pulling it through CodeArtifact?

A) The upstream syncs with the external registry and the unpublish propagates, so builds fail immediately starting with the next build
B) They can keep using it as long as the CodeArtifact upstream cached copy remains (preventing a left-pad incident)
C) The cache is volatile and disappears, so you must ask AWS Support to restore a backup copy
D) CodeArtifact automatically reroutes to another registry such as GitHub Packages and fetches it from there

**Answer: B**
Explanation: The biggest value of the upstream cache — the cached copy is preserved even if the package is deleted externally. The 2016 left-pad incident motivated this feature.

---

**Question 5.** How can you ensure that only the build bot can publish packages while developers can only read?

A) In the repository policy, restrict the Publish permission to the CI role and allow Read for all developer roles
B) Split into two domains, one for Publish and one for Read, to physically separate the permission boundary
C) Control publish and read permissions using only the bucket policy of the S3 bucket holding the packages
D) Use GitHub Branch Protection so that only CI can merge the publishing branch, thereby controlling publishing

**Answer: A**
Explanation: Separate by action using a combination of repository policy + IAM roles. This is the standard pattern.

---

**Question 6.** Which package format does CodeArtifact not support?

A) npm — native support for the Node.js package registry protocol
B) Maven — a Java build dependency repository integrated through `~/.m2/settings.xml`
C) Docker/OCI images
D) PyPI — supports the Python package index protocol

**Answer: C**
Explanation: Docker/OCI images belong in Amazon ECR. CodeArtifact is a repository for library packages (npm/Maven/PyPI/NuGet/Generic/Ruby/Swift/Cargo).

---

**Question 7.** Which arguments are required when using CodeArtifact across accounts?

A) Only `--region` — specifying the same Region as the consumer account makes cross-account work
B) `--domain-owner` (the account ID that owns the domain) + a grant in the repository policy + the KMS key policy
C) Only `--profile` — specifying a named profile that holds the owner account credentials is enough
D) The `--external` flag to explicitly enable access from an external account

**Answer: B**
Explanation: For cross-account use, the domain policy + repository policy + KMS key policy must all grant access. Specifying the owner with `--domain-owner` is required.

---

**Question 8.** You want to respond to a supply chain incident like SolarWinds at the build infrastructure level. What is the most appropriate combination?

A) CodeArtifact + automatic SBOM generation + Sigstore/cosign signing + signature verification before deployment
B) Only tighten GitHub Actions workflow permissions and branch protection to narrow the build entry point
C) Tighten the build role IAM policy to least privilege to reduce the impact of a build system compromise
D) Apply SSE-KMS encryption to the artifact S3 bucket to protect the stored artifacts

**Answer: A**
Explanation: Supply chain integrity cannot be solved by a single tool. The standard has four stages: package storage (CodeArtifact) + a bill of components (SBOM) + signing (cosign) + verification (verify before deployment). This is the SLSA L3 pattern.

---

**Question 9.** You allowed read access to another account through a repository policy, but cross-account access fails. What should you suspect first?

A) The principal matching fails because of the difference between an IAM user and an assumed role
B) A missing cross-account grant in the domain policy or the KMS key policy
C) The network ACL of the consumer account subnet blocks traffic to the CodeArtifact endpoint
D) A Route 53 DNS resolution failure prevents reaching the CodeArtifact endpoint

**Answer: B**
Explanation: The domain policy is evaluated first, as the broader scope. Even if the repository policy allows access, it fails if the domain blocks it. A grant of usage permission in the KMS key policy is also required.

---

**Question 10.** You want to keep 50 Helm charts in a secure internal repository. Which service is most appropriate?

A) Store the chart tarballs as versioned packages in CodeArtifact using the Generic package format
B) Amazon ECR (OCI compatible)
C) Upload the charts to S3 and build and operate a helm registry such as ChartMuseum yourself
D) Store the chart metadata and base64-encoded tarballs in DynamoDB

**Answer: B**
Explanation: Helm 3+ is OCI compatible → ECR supports it natively. You can reuse the same infrastructure as container images (scanning, signing, permissions). CodeArtifact Generic is also possible, but ECR is recommended.

---

## 📌 Today's Summary

The real value of CodeArtifact is not being an "AWS-native npm/Maven mirror" but **creating a single entry point to the software supply chain and drawing a controllable trust boundary**. The domain handles asset deduplication and a single KMS key, and the repository is the unit for permissions, upstreams, and external connections. The standard structure is three tiers, production → shared → external, forcing all external packages through shared to create a single point for blocking, auditing, and scanning. The answer for Dependency Confusion defense is the three-part combination of scoped namespace + a single registry + lock files, and SLSA/SBOM/Sigstore are the emerging standards for supply chain integrity. Do not forget that Docker/OCI belongs in ECR, not CodeArtifact. Tomorrow we move on to how these packages are actually injected into the build environment in CodeBuild.
