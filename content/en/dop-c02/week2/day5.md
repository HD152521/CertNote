# Day 5 - Week 2 Synthesis: DevSecOps Thinking Framework From Source Control to Code Signing

After Week 2, the picture you've seen—CodeCommit and EventBridge's trigger model, GitHub Actions + OIDC federation, CodeArtifact's private registry, CodeGuru and Inspector's security automation, and the trust chain made by AWS Signer—distills to one line: **"From the moment code leaves a developer's keyboard until it touches production, placing automatic gates at every path."**

With this thinking embedded, scenarios you encounter in exam room become pattern-matching: "Which gate is missing and which is misconfigured?" Today trains that pattern matching through 12 comprehensive scenarios. Not just keyword matching but **"why this is the answer and why others are traps."**

---

## 🎯 Learning Objectives

- Synthesize Week 2's 5 topics (CodeCommit / GitHub OIDC / CodeArtifact / CodeGuru / Signer) into integrated scenarios
- Apply thinking framework (Shift Left + trust chain) when prioritizing DevSecOps
- Distinguish confusing tool pairs by trade-offs

---

## 🧩 Pre-Knowledge Summary

- **OIDC `sub` claim**: Token subject. GitHub Actions appears as `repo:org/repo:ref:refs/heads/main` form
- **Upstream cache pattern**: Fetch external registry (npmjs, PyPI, Maven Central) once, cache in private repo
- **Lambda Code Signing Enforce**: Reject unsigned code deployment (throws exception)
- **Shift Left**: Move security/quality validation to earlier SDLC stages
- **Dependency Confusion**: Attack uploading package with same name as private, higher version to public (Alex Birsan, 2021)
- **Confused Deputy**: Attack where unintended user assumes same delegated permissions
- **SBOM**: Software Bill of Materials, component inventory

---

## 📖 Week 2 One-Page Compact

### One-Line Summary

1. **CodeCommit**: New signup discontinued (July 2024), existing customers can create new repos. EventBridge trigger + Approval Rule Template core. Migration to GitHub/GitLab
2. **GitHub Actions + OIDC**: Modern standard. Remove long-lived IAM User access keys, separate permissions via sub condition
3. **CodeArtifact**: Domain (asset deduplication + KMS unity) + Repository (permission unit + Upstream cache) + Dependency Confusion defense
4. **CodeGuru Reviewer/Security/Profiler**: Three tools with different timing/targets. Reviewer/Security on PR, Profiler on runtime
5. **AWS Signer**: Only Lambda Enforce mode actually blocks unsigned code. Containers use Notary v2

### Easy-to-Confuse Comparison Table

| A | B | Exam Point |
|---|---|------------|
| CodeCommit Approval Rule | GitHub Required Reviewers | Both PR merge gates, differ in derivation (IAM vs Branch Protection) |
| CodeCommit Trigger | EventBridge Rule | EventBridge is modern standard, hub for all AWS events |
| OIDC sub `repo:org/*:...` | `repo:org/specific-repo:...` | Wildcard expands authority risk—confused deputy possible |
| OIDC `environment:prod` | branch only | Environment condition stronger for prod protection (with Required Reviewers) |
| Domain | Repository | Domain is asset deduplication + KMS, Repository is permission unit + Upstream |
| CodeArtifact Internal | External Connection | Internal self-publishes, External caches npmjs/PyPI |
| CodeGuru Reviewer | CodeGuru Security | Quality vs security (both PR-time, neither blocks) |
| Inspector Standard | Inspector Enhanced (ECR) | Standard: OS only, Enhanced: OS + language dependencies + 24h re-scan |
| AWS Signer | cosign (Sigstore) | KMS-backed vs OIDC keyless, enterprise vs OSS |
| Lambda Signer Warn | Lambda Signer Enforce | Only Enforce actually blocks (CodeSigningConfigNotFoundException) |
| AWS Signer for Lambda | for Containers (Notary v2) | Different platform_ids, different verification points |
| SAST | SCA | Code itself vs dependencies |
| SBOM CycloneDX | SPDX | OWASP vs Linux Foundation, both standards |

### Week 2 Scenario Solving 4 Steps

1. **Identify stage**: IDE / PR / Build / Deploy / Runtime—which stage's problem?
2. **Classify attack model**: Code tampering / dependency / secret leak / privilege escalation / supply chain—which type?
3. **Map AWS tool candidates**: Stage × attack model mapping
4. **Prioritize choice**: Single answer via Shift Left + automation + least privilege

---

## 🧠 12 Real-World Scenarios

### Scenario 1
PR merge to main requires minimum 2 senior approvals + security analysis pass + unit tests pass. Most appropriate CodeCommit configuration?

A) Approval Rule Template naming senior group 2 + CodeGuru Reviewer attached + EventBridge triggering CodeBuild (SAST security + unit tests) + results as PR comment
B) Lambda manual check each time
C) Slack notification only
D) Ops team manually merges daily

**Answer: A**
Explanation: Automate all gates—the standard approach. ① **Approval Rule Template** specifies IAM group ARN (group not person) ② **CodeGuru Reviewer** auto-comments on code ③ **EventBridge** triggers CodeBuild on PR creation ④ CodeBuild runs SAST (CodeGuru Security) and unit tests ⑤ results pushed as PR comment.

---

### Scenario 2
GitHub Actions needs different permissions for prod and staging environments. Cleanest configuration?

A) Shared IAM Role for both + if-branching in workflow
B) Two GitHub Environments + each's OIDC `sub` condition → two separate IAM Roles in Trust Policy + prod environment gets Required Reviewers
C) Create new IAM Role per workflow
D) Issue two IAM User access keys

**Answer: B**
Explanation: GitHub Environments + OIDC answer pattern. ① `sub` includes `environment:prod` in trust policy ② prod role touches only prod resources, staging only staging ③ prod environment gates with Required Reviewers (GitHub Settings)—approvals gate workflow execution itself.

A doesn't separate permissions (if-branching can be bypassed by code changes), C is operational burden, D is IAM User access key anti-pattern itself.

---

### Scenario 3
"CodeArtifact auth token expires mid-build, causing failure." Most appropriate fix?

A) Change token lifetime to 1 year
B) Place `aws codeartifact login` in build's pre_build phase, complete within token lifetime (max 12h). Long builds: re-issue per stage or split/parallelize builds
C) Split builds manually
D) Use external npmjs.com directly

**Answer: B**
Explanation: CodeArtifact auth token **maximum lifetime is 12 hours** (default 12h, can shorten but not extend). Refresh at build start; for long builds, refresh per stage. A ignores 12h limit, C loses automation, D undermines CodeArtifact adoption (security/reproducibility).

---

### Scenario 4
Company wants "rebuild reproducible even if external npm deleted/changed." Most appropriate?

A) `package-lock.json` checked in + CodeArtifact Upstream caching npmjs + periodic cache validation + S3-backed build artifacts
B) Download latest packages every time
C) Manual S3 backup
D) Snyk monitoring only

**Answer: A**
Explanation: Rebuild reproducibility: 3 axes—① **Lock file** (exact version pin) ② **Upstream cache** (external deletion protection) ③ **Validation** (periodic hash comparison). 2016 `left-pad` incident (11-line npm package unpublished → React, Babel, thousands broke) is definitive case for this pattern.

---

### Scenario 5
Lambda function code tampering concerns. Most appropriate defense?

A) Lambda Code Signing Config + Signer Profile + UntrustedArtifactOnDeployment=Enforce + KMS key policy separating Profile usage
B) Layers only
C) S3 versioning only
D) Reserved Concurrency

**Answer: A**
Explanation: Signing + Enforce is standard tampering defense. Plus: ① **Signer Profile permission** separated via KMS key policy (CI bot signs only, devs can't) ② **Profile version** explicitly registered in `allowed-publishers` ③ Renewal updates new version ARN. C (S3 versioning) tracks changes, not verifies tampering (attacker with S3 write tampering new versions).

---

### Scenario 6
"We're GitHub Enterprise users. Most security-strong AWS integration?"

A) PAT (Personal Access Token) stored in AWS Secrets Manager
B) AWS CodeStar Connections + OAuth (person auth)
C) AWS IAM OIDC Provider registration + GitHub Actions OIDC federation
D) Issue IAM User key

**Answer: C**
Explanation: OIDC is the **standard for removing long-lived credentials**. ① PAT = person-held keys → exposure risk ② CodeStar Connections suits CodePipeline source auth, not workflow credentials ③ IAM User access key = static. OIDC: ① short-lived tokens (1h) ② sub conditions for granularity ③ no key management.

---

### Scenario 7
"Block secret leaks at PR stage pre-emptively?"

A) GitHub Secret Scanning + Push Protection + git-secrets pre-commit hook + Secrets Manager centralizing secrets
B) Weekly manual review
C) Public repos only
D) Rotate after leak

**Answer: A**
Explanation: Multi-layer defense is the answer. ① **IDE/Local**: git-secrets blocks AWS key patterns before commit ② **Push**: GitHub Push Protection rejects 30+ provider keys at push time ③ **Repo**: Secret Scanning scans existing commits ④ **Build/Runtime**: Secrets Manager stored, buildspec references via `env.secrets-manager` → no secrets in code. D is reactive.

---

### Scenario 8
"Internal package `@my-org/payments` uploaded to public npmjs with same name, higher version—build fetched fake." Future defense?

A) CodeArtifact private namespace + single Upstream + Lock file + publish permission split (CI bot only) + dependency blocking policy (`allow-publish: my-org-only`)
B) Block external npmjs
C) Block internet
D) Manual build verification each time

**Answer: A**
Explanation: **Dependency Confusion** attack defense (Alex Birsan, 2021). Birsan penetrated 35 companies (Apple, Microsoft, Tesla, PayPal, etc.), earned $130k bounty. Core: "if private package name exists public with same name/higher version, package manager prioritizes public."

Multi-layer defense:
1. **Private namespace**: `@my-org/*` exists only in private repo
2. **Single Upstream path**: external packages only via CodeArtifact → priority ordering
3. **Lock file**: exact version + integrity hash verification
4. **Permission split**: only CI bot publishes to private
5. **Scope protection**: npm enterprise protects scope itself

---

### Scenario 9
Auto-detect OS/language package CVEs on ECR push?

A) Trivy in CodeBuild manually
B) Inspector Enhanced Scanning on ECR → Security Hub auto-aggregation + EventBridge high severity → Slack alert
C) CodeGuru Reviewer
D) AWS Backup

**Answer: B**
Explanation: Enhanced Scanning auto per ECR push + 24h re-scan. A (Trivy) also works, real-world often uses **both**, but single exam answer is native B. Enhanced: ① OS layer + language deps ② Snyk DB-based ③ Security Hub auto-integration ④ auto re-eval on CVE disclosure. C (CodeGuru Reviewer) is code analysis, not image scanning.

---

### Scenario 10
Company asks in Pro exam: "DevSecOps pipeline first-time priority order?" Most appropriate?

A) Runtime → Build → PR → IDE (reverse order)
B) IDE secret scan → PR SAST/SCA → Build image scan → Deploy signature verify → Runtime GuardDuty (Shift Left order)
C) Adopt all at once
D) Runtime only

**Answer: B**
Explanation: **Shift Left order** standard approach. Fast feedback + cumulative security strengthening. ① **IDE**: git-secrets, IDE plugin—near-zero cost ② **PR**: CodeGuru Security, Snyk—automation ③ **Build**: Trivy, Inspector—blocking gates ④ **Deploy**: Signer verify—trust chain completion ⑤ **Runtime**: GuardDuty—post-detection. Satisfies ① cheapest stage first ② fastest feedback ③ cumulative strengthening.

A (reverse) starts most expensive stage, C causes alert fatigue, D is reactive only.

---

### Scenario 11
Company adopting container image signing on EKS. AWS Signer for Containers vs cosign (Sigstore) for enterprise?

A) cosign—free
B) AWS Signer—KMS-backed key management, IAM unity, Notation/ratify native to EKS admission webhook, AWS Organizations governance integration
C) cosign—OIDC keyless stronger
D) AWS Signer—faster

**Answer: B**
Explanation: Enterprise requirements: ① **Key management unity** (KMS) ② **Governance integration** (Organizations, SCP) ③ **Audit trail** (CloudTrail) ④ **IAM consistency**. AWS Signer satisfies all. cosign keyless strong in OSS but enterprise drawbacks: ① Fulcio/Rekor external dependency ② OIDC trust chain management burden ③ AWS governance separation.

---

### Scenario 12
Company wants to revert GitHub Actions to IAM User access key citing "OIDC too complex." Appropriate response as security consultant?

A) Approve revert to IAM User
B) Document OIDC trust policy wildcards/sub claim standards + `aws-actions/configure-aws-credentials` v4 example + Required Reviewers + explicit role-session-name for CloudTrail traceability. **Never revert to IAM User**
C) External consulting
D) Do nothing

**Answer: B**
Explanation: IAM User access key revert is **clear security regression**. Most common incident source: accidentally pushed access keys in GitHub repo. OIDC complexity usually stems from ① trust policy sub condition writing ② Role chaining ③ AssumeRole vs AssumeRoleWithWebIdentity distinction—all solvable via documentation. Standard example:

```yaml
# .github/workflows/deploy.yml
permissions:
  id-token: write   # OIDC token issuance permission
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production  # Required Reviewers gate
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GitHubActionsDeployRole
          role-session-name: gh-actions-${{ github.run_id }}
          aws-region: ap-northeast-2
      - run: aws s3 sync ./dist s3://my-bucket/
```

Explicit `role-session-name` records in CloudTrail as `userIdentity.arn` like `assumed-role/GitHubActionsDeployRole/gh-actions-12345`—traceable workflow run. IAM User access keys lack this traceability.

---

## 📌 Week 2 Key Summary (Confirm)

1. **CodeCommit**: Trigger is **EventBridge** standard entry point, **Approval Rule Template** is PR gate. New signup discontinued (July 2024)—migration planning
2. **GitHub Actions + OIDC**: Short-lived creds + sub condition separates permissions. `environment:prod` + Required Reviewers combo is prod protection standard
3. **CodeArtifact**: Domain (asset dedup + KMS) + Repository (permission·Upstream). Dependency Confusion defense core
4. **CodeGuru**: Reviewer (quality) + Security (security) + Profiler (runtime). None block alone—Approval Rule + bot enforces
5. **AWS Signer**: Lambda **Enforce mode** only blocks unsigned. Containers use Notary v2 (ratify), compare with cosign (Sigstore keyless)
6. **DevSecOps Shift Left priority**: IDE → PR → Build → Deploy → Runtime, 95x cost difference justifies

---

## 🔜 Next Week Preview (Week 3)

**CodeBuild Deep Dive — buildspec, caching, VPC, ARM/Graviton**

Weeks 1-2 covered "DevOps thinking + source-stage security." Week 3 plunges into **build-stage depth**:

- **Day 1**: buildspec phase deep dive (install/pre_build/build/post_build isolation, env var propagation, artifact definition)
- **Day 2**: Build caching (S3/Local Custom) + parallel builds + Batch Build for monorepo
- **Day 3**: Secret injection — Secrets Manager / Parameter Store / Session Manager patterns
- **Day 4**: VPC CodeBuild (private resource access + internet bypass), Custom Image (ECR + privileged), ARM/Graviton cost savings
- **Day 5**: Week 3 scenario synthesis

Core question—**"Same code, different build—how to transform cost/speed, and how does that collide with security?"**—is next week's focus.

---

> 💪 Week 2 complete. **DevSecOps thinking framework from source control to code signing** now in place. Next week: real build-stage trade-offs—cache hit rate, VPC endpoints, ARM compilation, secret injection reliability. Week 2 was "**what input we accept**"; Week 3 is "**how we transform it**."
