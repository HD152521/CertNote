# Day 2 - GitHub Actions ↔ AWS OIDC: Eliminating Static Keys Permanently Through Federation

For the past decade, securely handling AWS credentials in CI/CD systems has been a chronic headache for nearly every DevOps team. Embedding IAM User access keys in GitHub Secrets is familiar, but that familiarity is itself the source of incidents. According to a 2022 Snyk report, AWS access keys discovered in public GitHub repositories exceeded 10,000 per year. Capital One's 2019 incident, Twitter's 2023 internal key leak—the root cause is the same: **"static credentials issued once, copied to unknown locations, lost to audit trails"**.

OIDC federation solves this problem from a fundamentally different direction. **It doesn't issue credentials.** Instead, GitHub creates a short-lived JWT proving its identity every workflow run, and AWS STS validates it to issue a 1-hour temporary credential. Since static keys don't exist, there's nothing to leak.

Today covers: ① the exact mechanism of how this works and its six-step flow ② which conditions in the IAM Trust Policy determine security ③ how it combines with GitHub Environments to create dual defense ④ what trade-offs exist with Self-hosted Runners and CodeBuild.

## Exact Sequence of How OIDC Federation Works — Six Steps Where JWT Becomes STS Credential

Let's view one complete flow of GitHub Actions calling AWS APIs in slow motion.

```
1. GitHub Actions runner starts workflow
   permissions: id-token: write must be present
        |
        v
2. runner requests token from GitHub OIDC provider
   POST https://token.actions.githubusercontent.com/...
   Body: { audience: "sts.amazonaws.com" }
        |
        v
3. GitHub issues JWT
   header: { alg: "RS256", kid: "..." }
   payload: {
     iss: "https://token.actions.githubusercontent.com",
     aud: "sts.amazonaws.com",
     sub: "repo:my-org/my-app:environment:production",
     ref: "refs/heads/main",
     repository: "my-org/my-app",
     workflow: "Deploy",
     ...
   }
   signature: RSA signature (verifiable via JWKS endpoint)
        |
        v
4. aws-actions/configure-aws-credentials@v4 calls STS
   AssumeRoleWithWebIdentity {
     RoleArn: "arn:aws:iam::ACCOUNT:role/GHActionsProdRole",
     WebIdentityToken: <above JWT>,
     RoleSessionName: "github-actions-<run-id>"
   }
        |
        v
5. STS validates
   - JWT signature verification (GitHub JWKS endpoint)
   - iss == OIDC Provider URL
   - aud matches trust policy condition
   - sub matches trust policy condition (StringEquals/StringLike)
   - Role's trust policy is "Allow"
        |
        v
6. Returns temporary credentials (default 1h, max 12h)
   AccessKeyId: "ASIA..."
   SecretAccessKey: "..."
   SessionToken: "..."
   Expiration: "..."
```

Let's examine each stage's details.

> 🔍 **Deep Dive**: The JWT issued in step 2 is signed with **RS256** (RSA signature), and AWS STS validates it by retrieving the public key from GitHub's JWKS endpoint (`https://token.actions.githubusercontent.com/.well-known/jwks`). When registering an IAM Identity Provider, you were asked for a thumbprint—this is that step: pre-trusting GitHub's identity via TLS certificate thumbprint. Since July 2023, AWS began auto-validating thumbprints for well-known IdPs (GitHub, GitLab, etc.), reducing the need for manual entry. This change prevents incidents during thumbprint rotation.

> 💡 **Related Theory**: OIDC (OpenID Foundation 2014) is a standard that adds an authentication layer on top of OAuth 2.0 (RFC 6749, 2012). While OAuth 2.0 handles "authorization delegation", OIDC handles "proving user identity". The key is an **ID Token, a JWT (RFC 7519)**, containing standard claims (iss, sub, aud, exp, iat, nbf) that the IdP issued it, enabling self-verification. SAML 2.0 (OASIS 2005) serves the same role but is XML-based and heavy for mobile/API environments. AWS supports both, but GitHub Actions integration uses OIDC only.

> 📚 **Case Study**: In 2022, a fintech company discontinued IAM User access key policy and migrated to GitHub Actions OIDC. Immediately after, a workflow stopped working. Root cause: they forgot the `permissions:` block in the workflow YAML, and GitHub defaults to `id-token: none`, so it doesn't issue OIDC tokens. The error message was cryptic (`Could not assume role`). After 30 minutes of debugging, they found it. Afterward, the team made `permissions: id-token: write, contents: read` standard in all workflow templates. In exams, when "OIDC isn't working → what to check first?", the answer is almost always this one line.

## The `sub` Condition in Trust Policy — Security Hinges Here

The security of OIDC integration depends almost entirely on **how precise the `sub` condition in Trust Policy is**. If `sub` is a wildcard, the blast radius of a breach explodes.

The `sub` value GitHub issues in JWT varies by context:

| Workflow Context | sub Value |
|------------------|-----------|
| `push` to main | `repo:my-org/my-repo:ref:refs/heads/main` |
| `push` to feature/x | `repo:my-org/my-repo:ref:refs/heads/feature/x` |
| `pull_request` | `repo:my-org/my-repo:pull_request` |
| Tag push | `repo:my-org/my-repo:ref:refs/tags/v1.0` |
| Environment used | `repo:my-org/my-repo:environment:production` |
| Reusable workflow | `repo:my-org/my-repo:job_workflow_ref:org/shared/.github/workflows/deploy.yml@refs/heads/main` |

How you write the trust policy condition determines security level:

```json
// 1) Too loose — any repo in org with main branch can assume Role
"StringLike": {
  "token.actions.githubusercontent.com:sub": "repo:my-org/*:ref:refs/heads/main"
}

// 2) Moderate — only specific repo's main branch
"StringEquals": {
  "token.actions.githubusercontent.com:sub": "repo:my-org/my-app:ref:refs/heads/main"
}

// 3) Safest — specific repo + specific environment + workflow passing Required Reviewers only
"StringEquals": {
  "token.actions.githubusercontent.com:sub": "repo:my-org/my-app:environment:production"
}
```

> ⚠️ **Trap**: The danger of pattern 1 is a frequent exam and real-world topic. With 100 repos in the org, if even one is compromised, that repo's main branch can assume prod Role. In exams, when asked "what's the risk of wildcard `repo:org/*` sub condition?", the answer is always "if any other repo is compromised, prod credentials can be stolen."

> 🔍 **Deep Dive**: Pattern 3's `environment:production` is safest because GitHub Environment can have **Required Reviewers** or **wait timer**. To use `environment: production`, the workflow must first pass GitHub's gate; only then does GitHub issue a JWT with `sub` = `environment:production`. This means AWS Role assumption doesn't happen without human approval. **AWS IAM restriction + GitHub Environment gate** completes the dual defense.

> 💡 **Related Theory**: This pattern is a textbook application of **defense in depth** (NIST SP 800-160). Even if one layer (GitHub Environment) breaches, the next (IAM trust policy sub condition) blocks. It's also an implementation of **principle of least privilege** (Saltzer & Schroeder 1975) in OIDC federation—the Role's Permission Policy only touches prod resources, and the contexts that can assume that Role are narrowed.

> 📚 **Case Study**: In 2023, a SaaS company almost suffered an incident where fork PRs triggered workflows accessing secrets. GitHub's default is that secrets aren't exposed in fork PRs, but a developer misused `pull_request_target` event, making fork code access base repo secrets. Fortunately, the OIDC token's `sub` was `pull_request`, and prod IAM Role's trust policy only allowed `sub: ref:refs/heads/main`, so the fork PR couldn't assume the Role. Critical blocking point. After this, the company org-wide banned `pull_request_target` usage.

## GitHub Environments — A People Gate Right Before Workflow Execution

GitHub Environments aren't just labels; they're **protection layers that intervene right before workflow execution**. Available gates:

| Gate | Behavior |
|------|----------|
| **Required Reviewers** | Specified person or team must approve before deploy job starts (max 6, some required) |
| **Wait Timer** | Wait N minutes (max 30 days) even after approval. Creates emergency rollback window |
| **Deployment Branches** | Restrict which branches/tags can deploy to this environment |
| **Environment Secrets** | Separate secrets storage per environment |
| **Custom Protection Rules** | (GitHub Apps) external tool evaluates gate |

```yaml
jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://app.example.com  # Link for post-deploy verification
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::222:role/GHA-Production
          aws-region: ap-northeast-2
      - run: ./deploy.sh production
```

> 🔍 **Deep Dive**: Wait Timer is often overlooked but highly valuable in practice. "5-minute wait after approval" gives someone 5 minutes to shout "stop". Combined with CodeDeploy's `BlockTraffic` auto hook, you get 4-stage protection: human approval → wait → auto-validation → traffic shift.

> 💡 **Related Theory**: GitHub Environments + Required Reviewers is fundamentally the **manual gating** pattern (Google SRE Book, Chapter 16). Full automation is fast but has wide blast radius; full manual is safe but slow. Gating is compromise—"ask humans only where human judgment has value". AWS CodePipeline's Manual Approval Action embodies the same philosophy.

## AWS Code* vs GitHub Actions — Which Excels in What Scenario

Pro exams frequently ask the selection criteria for both tools. The key is "AWS-native depth vs multi-cloud + developer experience".

| Dimension | GitHub Actions | AWS CodePipeline/CodeBuild |
|-----------|----------------|---------------------------|
| **AWS Native Integration** | OIDC + AWS Action, general depth | Native, all steps in one console |
| **Multi-Cloud** | Excellent, GCP/Azure identical | AWS-only |
| **Build Environment** | GH-hosted runner (per-minute billing) + Self-hosted | CodeBuild (per-minute billing, VPC-native) |
| **PR Integration** | Native PR comments, status checks | CodeStar Connections + Notifications |
| **Approval Gate** | Environments + Required Reviewers | Manual Approval Action |
| **Secrets** | Repo/Org/Environment Secrets | Secrets Manager / SSM Parameter Store |
| **Multi-Account** | OIDC + per-environment IAM Role | Cross-account Role + Pipeline roleArn |
| **Free Tier** | Certain free allocation | 100 minutes/month free (CodeBuild) |
| **Strengths** | Developer UX, rich marketplace actions | AWS fine-grained control, IAM/KMS consistency, VPC-native |

> 🎯 **Scenario**: A company runs "main builds in GitHub Actions, multi-account prod deployment in AWS CodePipeline". Why? GitHub Actions excels at build/test developer experience; CodePipeline's Cross-account Role + Manual Approval + KMS integration suits prod deployment precision. In exams when "which of these?" choices appear, look at the scenario's **"what's most important?"**—auto build/test PR = GH Actions, multi-account precision deploy = CodePipeline.

## Self-hosted Runner vs CodeBuild VPC Mode — Two Paths to Building Private Resources

GitHub-hosted runners run on GitHub's public infrastructure, so they can't access VPC-internal resources (private RDS, internal ELB, EFS). Two solutions exist:

```
[Option A: Self-hosted Runner on AWS]
  ASG of EC2 (or ECS Fargate)
    |
    | GitHub Actions Runner Controller (ARC) on EKS
    | or actions-runner installation script
    v
  VPC private subnet
    |
    v
  Private RDS / internal ALB / EFS access

[Option B: CodeBuild VPC mode]
  GitHub webhook → CodeBuild project
    |
    | vpcConfig: { vpcId, subnets, securityGroupIds }
    v
  Build runs in VPC private subnet
```

| Dimension | Self-hosted Runner | CodeBuild VPC Mode |
|-----------|---------------------|-------------------|
| **Maintenance** | You patch runner, OS updates | AWS fully managed |
| **Scaling** | ASG or ARC scales with GitHub queue | CodeBuild auto-scales |
| **Cost** | EC2/Fargate + operational time | Per-build-minute |
| **VPC Integration** | Instance lives inside VPC | ENI attachment |
| **GitHub Integration Depth** | 100% (native GH Actions) | GH webhook + status API |
| **Startup Latency** | Instant if runner always running | Cold start tens of seconds |

> ⚠️ **Trap**: Connecting Self-hosted Runner to a **public repo** risks external PRs executing arbitrary code on the runner. GitHub explicitly warns "use self-hosted runners for private repos only". In exams, when asked about "public repo + self-hosted runner" danger, it's almost always the right answer.

> 🔍 **Deep Dive**: GitHub Actions Runner Controller (ARC) is a Kubernetes operator that dynamically spins up runners. When PR queue grows, it provisions EKS pods; when done, it reclaims. AWS commonly pairs this with Karpenter for spot nodes, significantly reducing self-hosted runner operational costs.

## Reusable Workflows and Composite Actions — Deploying Policies Consistently Across 100 Repos

As orgs grow, copying deploy logic to 100 repos becomes inevitable. That's when reusable workflows pay dividends.

```yaml
# .github/workflows/shared-deploy.yml in org/shared-workflows
on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
      role-arn:
        required: true
        type: string

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ inputs.role-arn }}
          aws-region: ap-northeast-2
      - run: ./deploy.sh
```

```yaml
# All 100 service repos call this
jobs:
  prod-deploy:
    uses: my-org/shared-workflows/.github/workflows/shared-deploy.yml@v1
    with:
      environment: production
      role-arn: arn:aws:iam::222:role/GHA-Production
```

> 🔍 **Deep Dive**: The crucial detail: reusable workflow's OIDC `sub` value differs from normal. It's not the calling workflow's repo but the **called reusable workflow's repo + ref** that goes into sub. Pattern: `repo:my-org/shared-workflows:job_workflow_ref:my-org/shared-workflows/.github/workflows/shared-deploy.yml@refs/heads/main`. Trust policy conditions must be written against this. Exams almost always ask this detail when reusable workflow + OIDC appear together.

> 💡 **Related Theory**: Reusable workflows are essentially **DRY (Don't Repeat Yourself, Hunt & Thomas 1999)** applied to CI/CD. With the same logic in 100 repos, one security patch (e.g., changing AssumeRole region) requires 100 applications. Shared workflows change once and automatically apply on next invocation. This is CALMS's Sharing axis expressed in code.

## Practical OIDC Integration Traps

> ⚠️ **Trap 1**: Missing `permissions: id-token: write` — most common mistake. Must be explicit at workflow or job level.

> ⚠️ **Trap 2**: `sub` condition with wildcard `repo:org/*` — any compromised repo in org reaches prod.

> ⚠️ **Trap 3**: Changing `aud` without updating trust policy — if `aws-actions/configure-aws-credentials@v4` `audience` option changes, trust policy `aud` must match.

> ⚠️ **Trap 4**: Attempting session duration > 12 hours — default 1h, max 12h. Increase Role's `MaxSessionDuration` property and specify `RoleSessionDuration` in call.

> ⚠️ **Trap 5**: Assuming same workflow_run executed twice uses cached OIDC token on second execution — actually a new token each time. In exams: "Is OIDC token cached?" → No.

> ⚠️ **Trap 6**: Thinking `pull_request` event can access secrets → fork PRs have secrets masked. But `pull_request_target` runs in base repo context so secrets are accessible → fork malicious code execution risk. Frequent exam topic.

## ⭐ Key Points

1. ⭐ **OIDC = eliminates long-lived credentials**. Storing AWS Access Keys in GitHub Secrets is an antipattern.
2. ⭐ Trust Policy `sub` condition is security's core. `environment:production` safest, `repo:org/*` risky.
3. ⭐ GitHub Environments Required Reviewers + AWS IAM restriction = dual defense.
4. ⭐ `permissions: id-token: write` is OIDC's absolute requirement. Missing is the most common failure.
5. ⭐ Self-hosted Runner for private repos only. Public repo + self-hosted runner = arbitrary code execution risk.
6. ⭐ Reusable workflow OIDC `sub` is by definition repo, not calling repo. Careful writing trust policy.
7. ⭐ Default credential validity 1 hour, max 12 hours (requires Role MaxSessionDuration setting).

---

## 📝 Practice Questions

**Question 1.** What is the most secure way to manage credentials when deploying to AWS from GitHub Actions?

A) Store the long-term access keys of a dedicated IAM user in GitHub Secrets and rotate them periodically
B) Use short-term credentials from an IAM role through OIDC federation
C) Extract EC2 instance profile credentials, share them in GitHub Secrets, and have the workflow use them
D) Use a GitHub personal access token to reach resources through Amazon API Gateway

**Answer: B**
Explanation: OIDC is the standard because there are no static keys at all. In A, an exposed key has a wide blast radius. C and D are technically meaningless.

---

**Question 2.** What is the risk of setting `sub` in the OIDC trust policy to `repo:my-org/*:ref:refs/heads/main`?

A) No risk — the `ref:refs/heads/main` condition already restricts the context sufficiently to the main branch
B) Any repository in the organization can assume the role as long as it is on the main branch — a compromise of one repo reaches prod permissions
C) PR workflows from branches other than main can also assume this role and use the credentials
D) The `refs/tags/*` pattern is included, so workflows triggered by any tag push can assume the prod role

**Answer: B**
Explanation: A wildcard repo creates a lateral compromise path. Always specify the exact repo. The safest pattern is one based on `environment:production`.

---

**Question 3.** An OIDC token is not issued in a GitHub Actions workflow. What should be checked first?

A) A typo in the name of the IAM role ARN specified in `role-to-assume`, or an account ID mismatch
B) Whether `permissions: id-token: write` is specified in the workflow YAML
C) A missing `aws-region` in `configure-aws-credentials`, or the STS regional endpoint setting
D) Exhaustion of the monthly free minutes of GitHub Actions, or exceeding the concurrent job usage limit

**Answer: B**
Explanation: A missing `id-token: write` is by far the number one cause. The default is `none`, so if it is not specified, no token is issued at all.

---

**Question 4.** A build that "runs a migration script against a private RDS database" is required. What is the most appropriate configuration?

A) Enable a public endpoint on RDS and allow the runner IP in the security group so that a GitHub-hosted runner can reach it
B) Place a self-hosted runner in the VPC, or use CodeBuild VPC mode
C) Move the migration logic into a Lambda function in the VPC and have the workflow invoke that function
D) Have the workflow connect over SSH to a bastion EC2 instance and run the migration script remotely

**Answer: B**
Explanation: Accessing private resources = an execution environment inside the VPC. A is a security anti-pattern (exposing RDS publicly). D lacks automation.

---

**Question 5.** At which stage does the Required Reviewers feature of GitHub Environments provide protection?

A) The code merge stage — it requires approval from designated reviewers before a PR is merged into main
B) The workflow execution stage (approval before the deploy job starts)
C) The AWS IAM stage — IAM checks the approver at role assumption time and withholds credential issuance
D) The CloudFormation stack creation stage — it requires change set approval before stack changes are applied

**Answer: B**
Explanation: GitHub Environments is a gate right before the deploy job. Protection for PR merges is handled by Branch Protection, a separate layer.

---

**Question 6.** What is the default value of the `aud` condition in the trust policy, and why would you change it?

A) The default is `sts.amazonaws.com`, a fixed value enforced by STS, so there is neither a reason nor a way to change it
B) The default is `sts.amazonaws.com`. In an environment shared by multiple organizations, separating the audience prevents token misuse
C) The default is `github.com` (the IdP domain), hardcoded in the trust policy and unchangeable
D) The default is the OIDC provider URL itself (`token.actions.githubusercontent.com`)

**Answer: B**
Explanation: If `aud` is set differently per organization, GitHub Actions from another organization cannot steal and use our role. It is a required hardening in multi-IdP environments.

---

**Question 7.** 100 repos use common deploy logic through a reusable workflow. How should the trust policy `sub` condition be written?

A) List the `repo:my-org/<name>:ref:...` value of each of the 100 repos in `StringLike` as an OR array
B) Define it with `job_workflow_ref:my-org/shared-workflows/.github/workflows/deploy.yml@refs/heads/main`, based on the defining repo + ref
C) Use the wildcard `repo:my-org/*` so that all repos in the organization match a single condition
D) Create 100 dedicated IAM roles, one per repo, and allow only that repo in each trust policy

**Answer: B**
Explanation: For a reusable workflow, the OIDC sub is based on the defining repo + ref, not the calling repo. Use the `job_workflow_ref` claim in the trust policy. One trust condition covers calls from all 100 repos.

---

**Question 8.** What is the risk in a scenario where a forked PR accesses the base repo secrets?

A) With the `pull_request` event, secrets are masked as private from forks, so there is no risk in any case
B) The `pull_request_target` event runs in the base context, so a fork PR can access secrets/OIDC permissions → if arbitrary code runs from the fork, prod permissions can be stolen
C) GitHub Actions unconditionally blocks workflow runs for PRs from forks, so there is no exposure path
D) Fork PRs receive only a read-only token, so even if they reach secrets they have no permissions and there is no risk

**Answer: B**
Explanation: `pull_request` is safe for forks, while `pull_request_target` runs in the base context and can access secrets. Prohibiting `pull_request_target` at the organization level is common.

---

**Question 9.** What are the default and maximum validity periods of temporary credentials issued through OIDC?

A) Default 15 minutes, maximum 1 hour — fixed short to match the minimum unit of STS temporary credentials
B) Default 1 hour, maximum 12 hours (set by the role MaxSessionDuration)
C) Default 12 hours, maximum 24 hours — long enough to cover large overnight builds with a single token
D) Unlimited — the credentials remain valid until the workflow ends and do not expire

**Answer: B**
Explanation: AssumeRoleWithWebIdentity defaults to 1 hour. Increasing the role `MaxSessionDuration` attribute allows up to 12 hours. If a build takes longer than 12 hours, the workflow must be split.

---

**Question 10.** You built a combination of OIDC + GitHub Environments + trust policy `sub: environment:production`. Someone tries to run the prod deploy job directly from the main branch. How is this blocked?

A) The GitHub Environment Required Reviewers wait for human approval → if not approved, the job does not start → no JWT is issued → an AWS role assumption is never even attempted
B) AWS IAM detects the `sub` mismatch in the trust policy and automatically denies AssumeRoleWithWebIdentity
C) GitHub automatically isolates jobs on the main branch that reference a protected environment and blocks their execution
D) It is not blocked — main is the default branch, so the environment gate does not apply and the deployment proceeds as is

**Answer: A**
Explanation: The GitHub Environments gate is applied before the job starts. Without approval, the JWT itself is never issued, so AWS never even receives the call. This is the key to the dual defense — GitHub blocks it before it reaches AWS IAM.

---

## 📌 Today's Summary

OIDC federation is not just "keyless authentication" but **a paradigm shift that removes static credentials from the system entirely**. Because the JWT `sub` claim carries the full context (repo, ref, environment, reusable workflow ref), writing the trust policy conditions precisely enables very fine-grained access control. Combined with GitHub Environments + Required Reviewers, it completes a dual defense of a GitHub gate and an AWS IAM gate. The three most common practical pitfalls by far are a missing `permissions: id-token: write`, a `sub` wildcard, and misuse of `pull_request_target`. Tomorrow we revisit this from the perspective of the CodeBuild build system.
