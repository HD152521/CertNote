# Day 5 - Week 2 Wrap-Up: From Source Control to Code Signing, Cementing the DevSecOps Mindset Through Scenarios

The picture we saw across Week 2 (the trigger model of CodeCommit and EventBridge, GitHub Actions + OIDC federation, CodeArtifact's private registry, security automation with CodeGuru and Inspector, and the chain of trust built with AWS Signer) boils down to one line: **"from the moment code leaves the developer's keyboard until it reaches production, put an automated gate on every path."**

Once this mindset is lodged in your head, the scenarios you meet in the exam room become a pattern-matching job of "which gate is missing and which gate is misconfigured." Today we train that pattern matching with 12 integrated scenarios. We look not only at keyword matching but at **"why this is the answer and why the other options are traps."**

---

## 🎯 Learning Objectives

- Work through the 5 topics of Week 2 (CodeCommit / GitHub OIDC / CodeArtifact / CodeGuru / Signer) as integrated scenarios
- Apply the mental framework (Shift Left + chain of trust) when deciding DevSecOps priorities
- Distinguish easily confused tool pairs through their trade-offs

---

## 🧩 Prerequisites Recap

- **OIDC `sub` claim**: the subject of the token. For GitHub Actions it looks like `repo:org/repo:ref:refs/heads/main`
- **Upstream cache pattern**: fetch an external registry (npmjs, PyPI, Maven Central) once and cache it in a private repository
- **Lambda Code Signing Enforce**: rejects deployment of unsigned code (throws an exception)
- **Shift Left**: moving security and quality verification to earlier stages of the SDLC
- **Dependency Confusion**: an attack that hijacks a build by publishing a package with the same name as a private package to the public registry at a higher version (Alex Birsan, 2021)
- **Confused Deputy**: an attack in which, when permissions are delegated, someone other than the intended user uses the same credentials
- **SBOM**: Software Bill of Materials, a list of components

---

## 📖 Week 2 on One Compact Page

### One-Line Summaries

1. **CodeCommit**: new sign-ups stopped (July 2024); existing customers can still create new repositories. EventBridge triggers + Approval Rule Templates are the core. Migration is to GitHub/GitLab
2. **GitHub Actions + OIDC**: the modern standard. Remove long-lived IAM User access keys and separate permissions with sub conditions
3. **CodeArtifact**: Domain (asset deduplication + unified KMS) + Repository (permission unit + Upstream cache) + Dependency Confusion defense
4. **CodeGuru Reviewer/Security/Profiler**: three tools with different timing and targets. Reviewer/Security work at the PR, Profiler at runtime
5. **AWS Signer**: only Lambda's Enforce mode actually blocks unverified code. For containers, Notary v2

### Comparison Table of Easily Confused Items

| A | B | Exam point |
|---|---|-------------|
| CodeCommit Approval Rule | GitHub Required Reviewers | Both are PR merge gates, but the mechanism differs (IAM vs Branch Protection) |
| CodeCommit Trigger | EventBridge Rule | EventBridge is the modern standard, the hub for all AWS events |
| OIDC sub `repo:org/*:...` | `repo:org/specific-repo:...` | Wildcards risk expanding permissions, so a confused deputy is possible |
| OIDC `environment:prod` | branch only | The Environment condition is strong for protecting prod (combined with Required Reviewers) |
| Domain | Repository | Domain is asset deduplication + KMS; Repository is the permission unit + Upstream |
| CodeArtifact Internal | External Connection | Internal is your own publish; External caches npmjs/PyPI |
| CodeGuru Reviewer | CodeGuru Security | Quality vs security (both at PR time, neither blocks) |
| Inspector Standard | Inspector Enhanced (ECR) | Standard covers only the OS; Enhanced covers OS + language dependencies + 24h rescan |
| AWS Signer | cosign (Sigstore) | KMS-backed vs OIDC keyless, enterprise vs OSS |
| Lambda Signer Warn | Lambda Signer Enforce | Only Enforce actually blocks (CodeSigningConfigNotFoundException) |
| AWS Signer for Lambda | for Containers (Notary v2) | The platform_id differs, and so does the verification point |
| SAST | SCA | The code itself vs dependencies |
| SBOM CycloneDX | SPDX | OWASP vs Linux Foundation, both standards |

### The 4 Steps of Solving a Week 2 Scenario

1. **Identify the stage**: which of IDE / PR / Build / Deploy / Runtime is the problem in
2. **Classify the attack model**: which of code tampering / dependencies / secret leakage / permission hijacking / supply chain
3. **AWS tool candidates**: map tools by stage × attack model
4. **Choose the priority**: a single answer by Shift Left + automation + the principle of least privilege

---

## 🧠 12 Practice Scenarios

### Scenario 1
When a PR is merged, the main branch requires at least 2 senior approvals + a passing security analysis + passing unit tests. In a CodeCommit environment, what is the most appropriate configuration?

A) An Approval Rule Template specifying 2 members of the senior group + the CodeGuru Reviewer repository association + an EventBridge trigger for CodeBuild (security SAST + unit tests) + the status results posted as PR comments
B) A Lambda that does a manual check every time
C) Slack notifications only
D) The operations team merges manually every day

**Answer: A**
Explanation: This is the standard approach of automating every gate. (1) An **Approval Rule Template** specifies the IAM group ARN (a group, not specific people). (2) **CodeGuru Reviewer** adds automatic code review comments. (3) **EventBridge** triggers CodeBuild when a PR is created. (4) CodeBuild runs SAST (CodeGuru Security) and unit tests. (5) The results are pushed as PR comments.

> 🔍 **Going deeper**: The key to a CodeCommit Approval Rule Template is that "**the rule is tied to IAM but at the group/role level, not at the person level**." If you hardcode a specific user name, you must recreate it when that person leaves; if you hardcode a group ARN (`arn:aws:iam::123:group/SeniorEngineers`), membership changes are reflected automatically. The CODEOWNERS of GitHub Required Reviewers follows the same idea.

---

### Scenario 2
GitHub Actions needs different permissions for the prod and staging environments. What is the cleanest configuration?

A) Share the same IAM Role across both environments + an if branch inside the workflow
B) Define two GitHub Environments + two IAM Roles with Trust Policies separated by their respective OIDC `sub` conditions + apply Required Reviewers to the prod environment
C) Create a new IAM Role for every workflow
D) Issue two IAM User access keys

**Answer: B**
Explanation: This is the right pattern for GitHub Environments + OIDC. (1) Write the trust policy so that `sub` includes `environment:prod`. (2) The prod role can access only prod resources and the staging role only staging resources. (3) If you apply Required Reviewers to the prod environment (GitHub Settings), there is a human approval gate on the workflow run itself.

```json
// Trust Policy of the prod role
{
  "Effect": "Allow",
  "Principal": {"Federated": "arn:aws:iam::123:oidc-provider/token.actions.githubusercontent.com"},
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:environment:prod"
    }
  }
}
```

A does not separate permissions (the if branch can be bypassed by modifying the workflow code), C is an operational burden, and D is a security anti-pattern in itself because an IAM User access key is used.

> ⚠️ **Pitfall**: A wildcard such as `sub: repo:my-org/my-repo:ref:refs/heads/*` lets **every branch** assume the same role, so even a PR branch can obtain prod permissions. In the exam, a wildcard is almost always a trap.

---

### Scenario 3
"The CodeArtifact authentication token expires in the middle of a build, causing the build to fail." What is the most appropriate fix?

A) Change the token lifetime to 1 year
B) Put `aws codeartifact login` in the build's pre_build phase and finish the build within the token lifetime (max 12h). For long builds, reissue at each stage, or split and parallelize the build itself
C) Split the build manually
D) Use the external npmjs.com directly

**Answer: B**
Explanation: The maximum lifetime of a CodeArtifact authentication token is **12 hours** (the default is 12 hours; it can be shortened but not extended). Refresh it at the start of the build, and for a long build, refresh it per stage. A is a wrong option that ignores the 12-hour limit, C lacks automation, and D negates the very intent (security and reproducibility) of adopting CodeArtifact.

> CodeArtifact tokens are short-lived because of the principle of **minimizing damage on exposure**. Even if a token is accidentally printed in a build log or the build container's memory is dumped, it is neutralized after 12 hours. In the same spirit, an STS AssumeRole token is 1 hour by default, and an AWS Signer signature expiry defaults to 12 months. In the exam, "extending the token lifetime" is almost always a trap.

---

### Scenario 4
A company wants "builds to remain reproducible even if external npm packages are deleted or changed." What is the most appropriate configuration?

A) Check in `package-lock.json` + a CodeArtifact Upstream caching npmjs + periodic cache verification + keep build artifacts in S3
B) Download the latest packages every time
C) Back up manually to S3
D) Monitoring only with Snyk

**Answer: A**
Explanation: The three axes of build reproducibility are (1) a **lock file** (pinning exact versions), (2) an **Upstream cache** (protection against external deletion), and (3) **verification** (periodic hash comparison). The 2016 `left-pad` incident (an 11-line npm package was unpublished, breaking the builds of thousands of projects such as React and Babel) is the defining case for this pattern. After that incident npm tightened its unpublish policy (allowed only within 72 hours and with 25 or fewer downloads), but you still cannot trust external dependencies 100%.

> In March 2022, the maintainer of the `node-ipc` package planted code that deletes files for Russian and Belarusian IPs (protestware). Even with a lock file, a new minor version was installed automatically and affected users. The lesson: **a lock file must also be put through regular dependency scanning (Snyk/Dependabot) to be safe.**

---

### Scenario 5
You are concerned about the threat of Lambda function code tampering. What is the most appropriate defense?

A) Lambda Code Signing Config + Signer Profile + UntrustedArtifactOnDeployment=Enforce + separating the permission to use the Profile with a KMS key policy
B) Use Layers only
C) Enable S3 versioning only
D) Set Reserved Concurrency

**Answer: A**
Explanation: Signing + Enforce is the standard defense against tampering. In addition, (1) separate the **permissions on the Signer Profile itself** with a KMS key policy (only the build bot can sign, developers cannot), (2) explicitly register the **Profile version** in `allowed-publishers`, and (3) add the new version ARN when renewing on expiry. C (S3 versioning) tracks changes but does not verify tampering (if an attacker gets S3 write permission, a new version can be tampered with too). D is concurrency control and is unrelated to security.

> Lambda signature verification happens at **deployment time**. Once verified, the code is not re-verified every time the function runs. Therefore (1) an attack that injects code directly into the memory of the function environment after deployment (a monkey patch after RCE) cannot be stopped by signing. That is stopped by GuardDuty Lambda Protection and the read-only `/var/task` of the Lambda execution environment. Signing is a gate that verifies "**who deployed it**," not a gate that verifies "**what is running at runtime**."

---

### Scenario 6
"We are a GitHub Enterprise user. What is the most secure authentication method for integrating with AWS?"

A) Store a PAT (Personal Access Token) in AWS Secrets Manager
B) AWS CodeStar Connections + OAuth (human authentication)
C) Register an AWS IAM OIDC Provider + OIDC federation from GitHub Actions
D) Issue IAM User keys

**Answer: C**
Explanation: OIDC is **the standard for eliminating long-lived credentials**. (1) A PAT is a key held by a person, so there is exposure risk. (2) CodeStar Connections suits CodePipeline's source authentication, but the credentials for the workflow itself come from OIDC. (3) An IAM User access key is a static credential. OIDC offers (1) short-lived tokens (1 hour), (2) fine-grained control by the sub condition, and (3) no key management.

> OIDC (OpenID Connect) is an ID token standard built on top of OAuth 2.0. GitHub Actions obtains an OIDC ID token inside `actions/runner` on every workflow run and passes it to AWS STS's `AssumeRoleWithWebIdentity` API. STS verifies the token's signature against GitHub's JWKS (`https://token.actions.githubusercontent.com/.well-known/jwks`) and, if the claim conditions match the trust policy, issues temporary credentials. GitLab, Bitbucket Pipelines, CircleCI, and Jenkins can integrate the same way if they support issuing OIDC tokens.

---

### Scenario 7
"How can you block secret leaks in advance at the PR stage?"

A) GitHub Secret Scanning + Push Protection + a git-secrets pre-commit hook + consolidating secrets in Secrets Manager
B) A person reviews manually every week
C) Scan only public repositories
D) Rotate through Secrets Manager after a leak

**Answer: A**
Explanation: Layered defense is the answer. (1) **IDE/Local**: git-secrets blocks the AWS key pattern (`AKIA[A-Z0-9]{16}`) before the commit. (2) **Push**: GitHub Push Protection rejects keys from 30+ providers at push time. (3) **Repository**: Secret Scanning also scans existing commits. (4) **Build/runtime**: store in Secrets Manager and reference it in buildspec with `env.secrets-manager` → a structure where the secret itself no longer exists in the code. D is reactive: rotating after a leak is mandatory, but prevention comes first.

> 🎯 **Scenario**: A company turned on PR-stage secret scanning, and looking at a month of data, 47% of the keys that push protection blocked **were dummy test keys that matched the AWS key pattern in format**. There are two solutions: (1) adjust the regex pattern to exclude the dummy prefix, or (2) since dummy keys can accidentally get mixed up with real keys, simply consolidate all keys into Secrets Manager. **In real operations the answer is the latter.** In the exam too, the answer splits when "shift left + consolidation" are both required.

---

### Scenario 8
"The internal package `@my-org/payments` was published to the public npmjs under the same name at a higher version, and the build pulled in a fake package." What is the defense going forward?

A) A CodeArtifact private namespace + going through a single Upstream + a lock file + separated publish permission (only the build bot publishes) + a dependency blocking policy (`allow-publish: my-org-only`)
B) Block the external npmjs
C) Block the internet
D) Verify the build manually every time

**Answer: A**
Explanation: This is the right defense against a **Dependency Confusion** attack (Alex Birsan, 2021). Birsan breached 35 companies, including Apple, Microsoft, Tesla, and PayPal, with the same technique and received \$130,000 in bug bounties. The core mechanism is that "if a private package's name exists publicly under the same name at a higher version, the package manager prefers the public one."

Layered defense:
1. **CodeArtifact private namespace**: `@my-org/*` exists only in the private repository
2. **Going through a single Upstream**: external packages must come only through CodeArtifact → priority can be ordered
3. **Lock file**: exact version + integrity hash verification
4. **Separated publish permission**: no one but the build bot can publish to the private repository
5. **Scope protection**: npm enterprise protects the scope itself (blocks public publishing under the same scope)

---

### Scenario 9
To automatically detect CVEs in the OS and language packages of a container image when it is pushed to ECR?

A) Run Trivy manually in CodeBuild
B) Enable Inspector Enhanced Scanning on ECR → automatic aggregation in Security Hub + a Slack notification via EventBridge for high severity
C) CodeGuru Reviewer
D) AWS Backup

**Answer: B**
Explanation: Enhanced Scanning runs automatically on every ECR push + rescans every 24h. A (Trivy) is also possible and **in practice the two are often used together**, but the single answer on the exam is the native B. Enhanced offers (1) the OS layer + language dependencies, (2) a Snyk DB basis, (3) automatic Security Hub integration, and (4) automatic re-evaluation when a new CVE is published. C (CodeGuru Reviewer) is static code analysis, not image scanning.

> The practical combination pattern is **"Trivy at the build stage (fast blocking) + Inspector at the push stage (official record)."** Trivy gets results immediately inside the build container and can fail CodeBuild, while Inspector is asynchronous after the push, so it is too late for blocking builds. So if you need "blocking at the PR," use Trivy; if you need "tracking operational state," use Inspector. In the exam, if the keywords are "native + automatic aggregation," Inspector is the answer.

---

### Scenario 10
In a Pro-level exam, a company asks about "the priority when first adopting a DevSecOps pipeline." What is the most appropriate order?

A) Runtime → Build → PR → IDE (reverse order)
B) IDE secret scanning → PR SAST/SCA → Build image scanning → Deploy signature verification → Runtime GuardDuty (Shift Left order)
C) Adopt everything at once
D) Adopt only Runtime

**Answer: B**
Explanation: This is the standard **Shift Left order**: fast feedback + cumulative security hardening. (1) **IDE**: git-secrets, IDE plugins, with almost zero cost. (2) **PR**: CodeGuru Security, Snyk, automation. (3) **Build**: Trivy, Inspector, a blocking gate. (4) **Deploy**: Signer verification, which completes the chain of trust. (5) **Runtime**: GuardDuty, post-hoc detection. This order satisfies three things at once: (1) start from the cheapest place, (2) the fastest feedback, (3) cumulative hardening.

A (reverse order) starts from the stage with the most expensive incident cost, C causes bypasses through alert fatigue when adopted all at once, and D, with post-hoc response alone, cannot prevent incidents themselves.

> According to the IBM Cost of a Data Breach Report 2024, of an average incident cost of \$4.88M, fixing a defect at the code-writing stage costs \$80 versus \$7,600 to fix after a prod incident, **a difference of about 95x**. That is why Shift Left is not just theory but a direct cost saving.

---

### Scenario 11
A company wants to introduce container image signature verification on EKS. Between AWS Signer for Containers and cosign (Sigstore), which is the better choice for an enterprise environment, and why?

A) cosign, because it is free
B) AWS Signer: KMS-backed key management, unified IAM, native to EKS admission webhooks through Notation/ratify, and integrated with AWS Organizations governance
C) cosign, because OIDC keyless is stronger
D) AWS Signer, because it is faster

**Answer: B**
Explanation: The core requirements in an enterprise environment are (1) **unified key management** (KMS), (2) **governance integration** (Organizations, SCP), (3) **audit trail** (CloudTrail), and (4) **IAM permission consistency**. AWS Signer satisfies all of them. cosign keyless is strong in OSS projects, but in an enterprise its drawbacks are (1) an external dependency on Fulcio/Rekor, (2) the burden of managing the OIDC provider trust chain, and (3) being separate from AWS governance.

```bash
# Signing flow for AWS Signer for Containers
notation sign 123.dkr.ecr.ap-northeast-2.amazonaws.com/myapp:v1.0 \
  --plugin com.amazonaws.signer.notation.plugin \
  --id arn:aws:signer:ap-northeast-2:123:/signing-profiles/MyProfile

# The EKS ratify admission webhook verifies
```

> The X.509 certificate issued by cosign keyless has a **10-minute lifetime**, but the signature itself is permanently attached to the OCI artifact. At verification time, the Rekor transparency log confirms the fact that "that OIDC identity signed at that moment." AWS Signer's KMS key is permanent, so the same key can sign many times. The security trade-offs of the two models are (1) **the risk of key loss** (AWS Signer has it, cosign keyless does not) and (2) **how long an attacker can sign during a temporary intrusion** (for AWS Signer, as long as they hold KMS permission; for cosign keyless, 10 minutes).

---

### Scenario 12
A company wants to put IAM User access keys back into GitHub Actions because "OIDC federation is too complicated." As a security consultant, what is the most appropriate response?

A) Go back to IAM Users
B) Document the OIDC trust policy wildcard trap and the standard sub claim patterns + provide a `aws-actions/configure-aws-credentials` v4 example + Required Reviewers + strengthen CloudTrail traceability by specifying role-session-name. Going back to IAM Users is absolutely not acceptable
C) External consulting
D) Do nothing

**Answer: B**
Explanation: Going back to IAM User access keys is **a clear security regression**. The most common cause of security incidents is an access key accidentally pushed to a GitHub repository. The reasons OIDC looks complicated are usually (1) how to write the sub condition in the trust policy, (2) role chaining, and (3) distinguishing AssumeRole from AssumeRoleWithWebIdentity, all of which can be solved with documentation. A standard example:

```yaml
# .github/workflows/deploy.yml
permissions:
  id-token: write   # permission to issue the OIDC token
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production  # Required Reviewers applied
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GitHubActionsDeployRole
          role-session-name: gh-actions-${{ github.run_id }}
          aws-region: ap-northeast-2
      - run: aws s3 sync ./dist s3://my-bucket/
```

If you specify `role-session-name`, CloudTrail records `userIdentity.arn` as `assumed-role/GitHubActionsDeployRole/gh-actions-12345`, so you can trace which workflow run did what. An IAM User access key does not even have this traceability.

> 🎯 **Scenario**: In 2024 a startup accidentally pushed a GitHub Actions IAM User access key to a public repository. A bot harvested the key within 14 minutes, and within 30 minutes 8 `p5.48xlarge` instances were running in us-east-1. When it was discovered 8 hours later, the bill was \$76,000. They got a partial refund by negotiating with AWS Support, but the policy afterward changed to **"OIDC is mandatory for all CI/CD, and IAM User access keys are prohibited."** When another company running on OIDC around the same time made a similar mistake (printing a secret in the workflow yaml), the token had already expired, so the damage was zero. What the CISO said in the post-incident interview: "We should have done OIDC long ago."

---

## 📌 Week 2 Key Summary (Recap)

1. **CodeCommit**: **EventBridge** is the standard entry point for triggers, and the **Approval Rule Template** is the PR gate. New sign-ups stopped (July 2024), so consider migration
2. **GitHub Actions + OIDC**: short-lived credentials + permission separation with sub conditions. The combination of the `environment:prod` condition + Required Reviewers is the standard way to protect prod
3. **CodeArtifact**: Domain (asset deduplication + KMS) + Repository (permissions, Upstream). The core of Dependency Confusion defense
4. **CodeGuru**: Reviewer (quality) + Security (security) + Profiler (runtime). None of the three blocks on its own, so enforce with an Approval Rule + a bot
5. **AWS Signer**: Lambda actually blocks only in **Enforce mode**. For containers, Notary v2 (ratify), and the comparison is cosign (Sigstore keyless)
6. **DevSecOps Shift Left priority**: IDE → PR → Build → Deploy → Runtime, justified by the 95x cost difference

---

## 🔜 Next Week Preview (Week 3)

**CodeBuild Deep Dive: buildspec, Caching, VPC, ARM/Graviton**

If Weeks 1-2 were "the DevOps mindset + source-stage security," Week 3 goes into the **depth of the build stage** in earnest.

- **Day 1**: digging into buildspec phases (isolation of install/pre_build/build/post_build, environment variable propagation, artifact definitions)
- **Day 2**: build caching (S3/Local Custom) + parallel builds + handling monorepos with Batch Build
- **Day 3**: secret injection: Secrets Manager / Parameter Store / Session Manager patterns
- **Day 4**: VPC CodeBuild (access to private resources + bypassing the Internet), Custom Images (ECR + privileged), cost savings with ARM/Graviton
- **Day 5**: Week 3 scenario wrap-up

The key question, "**with the same code, how do you change cost and speed just by building differently, and how does that collide with security**," is next week's theme.

---

> Week 2 complete. You now have **the DevSecOps mental framework from source control to code signing**. From next week we deal in earnest with the trade-offs that arise at the stage where that code is actually built: cache hit rate, VPC endpoints, ARM compilation, and the stability of secret injection. If Week 2 was about "**what you take as input**," Week 3 is the week of "**how you process it**."
