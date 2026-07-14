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

## 📝 연습 문제

**문제 1.** GitHub Actions에서 AWS에 배포할 때 가장 안전한 자격 증명 관리 방법은?

A) 전용 IAM User의 장기 액세스 키를 GitHub Secrets에 저장하고 주기적으로 회전
B) OIDC 페더레이션으로 IAM Role의 단기 자격 증명 사용
C) EC2 Instance Profile 자격 증명을 추출해 GitHub Secrets에 공유하고 워크플로가 사용
D) GitHub Personal Access Token으로 AWS API Gateway를 거쳐 리소스에 접근

**정답: B**
해설: 정적 키 자체가 없는 OIDC가 표준. A는 키 노출 시 영향 광범위. C/D는 기술적 의미 부정확.

---

**문제 2.** OIDC Trust Policy에 `sub`을 `repo:my-org/*:ref:refs/heads/main`으로 설정하면 어떤 위험이 있는가?

A) 위험 없음 — `ref:refs/heads/main` 조건이 이미 main 브랜치로 컨텍스트를 충분히 제한하므로 안전
B) 조직 내 어떤 리포지토리든 main 브랜치라면 권한 가정 가능 — 한 repo 침해 시 prod 권한 도달
C) main 외 브랜치의 PR 워크플로에서도 이 Role을 assume해 자격 증명을 사용할 수 있게 됨
D) `refs/tags/*` 패턴이 포함돼 임의 Tag 푸시 워크플로에서도 prod Role을 가정 가능

**정답: B**
해설: 와일드카드 repo는 횡적 침해 경로를 만든다. 항상 specific repo로 명시. 가장 안전한 패턴은 `environment:production` 기반.

---

**문제 3.** GitHub Actions 워크플로에서 OIDC 토큰이 발급되지 않는다. 가장 먼저 확인할 것은?

A) `role-to-assume`에 지정한 IAM Role ARN의 이름 오타 또는 계정 ID 불일치
B) 워크플로 YAML에 `permissions: id-token: write` 명시 여부
C) `configure-aws-credentials`의 `aws-region` 누락 또는 STS 리전 엔드포인트 설정
D) GitHub Actions의 월간 무료 분량 소진 또는 동시 실행 사용량 한도 초과

**정답: B**
해설: `id-token: write` 누락이 압도적 1위 원인. 기본값이 `none`이므로 명시 안 하면 토큰 발급 자체가 안 됨.

---

**문제 4.** "프라이빗 RDS에 마이그레이션 스크립트를 실행하는 빌드"가 필요하다. 가장 적절한 구성은?

A) GitHub-hosted Runner가 접근하도록 RDS에 퍼블릭 엔드포인트를 켜고 SG로 runner IP를 허용
B) Self-hosted Runner를 VPC에 배치 또는 CodeBuild VPC 모드 사용
C) VPC 안의 Lambda에 마이그레이션 로직을 옮겨 워크플로가 그 함수를 호출해 실행
D) Bastion EC2에 워크플로가 SSH로 접속해 마이그레이션 스크립트를 원격 실행

**정답: B**
해설: 프라이빗 리소스 접근 = VPC 내부 실행 환경. A는 보안 안티패턴(RDS public 노출). D는 자동화 부재.

---

**문제 5.** GitHub Environments의 Required Reviewers 기능은 어떤 단계의 보호인가?

A) 코드 머지 단계 — PR을 main에 머지하기 전 지정 리뷰어의 승인을 요구
B) 워크플로 실행 단계 (deploy job 시작 전 승인)
C) AWS IAM 단계 — Role assume 시점에 IAM이 승인자를 확인해 자격 발급을 보류
D) CloudFormation Stack 생성 단계 — 스택 변경 적용 전 Change Set 승인을 요구

**정답: B**
해설: GitHub Environments는 deploy job 직전 게이트. PR 머지 보호는 Branch Protection이 담당하는 별도 계층.

---

**문제 6.** Trust Policy의 `aud` 조건 기본값과 변경 이유는?

A) 기본값은 `sts.amazonaws.com`이며 STS가 강제하는 고정값이라 변경할 이유도 방법도 없음
B) 기본 `sts.amazonaws.com`. 다중 조직 공유 환경에서 audience 분리로 토큰 도용 방지
C) 기본값은 `github.com`(IdP 도메인)이며 trust policy에 하드코딩돼 변경 불가
D) 기본값은 OIDC Provider URL 자체(`token.actions.githubusercontent.com`)로 설정됨

**정답: B**
해설: `aud`를 조직별로 다르게 두면 다른 조직의 GitHub Actions가 우리 Role을 훔쳐 사용 불가. 다중 IdP 환경에서 필수 강화.

---

**문제 7.** Reusable workflow를 통해 100개 repo가 공통 deploy 로직을 사용한다. Trust Policy `sub` 조건을 어떻게 작성해야 하는가?

A) 100개 repo 각각의 `repo:my-org/<name>:ref:...` 값을 `StringLike`에 OR 배열로 모두 나열
B) `job_workflow_ref:my-org/shared-workflows/.github/workflows/deploy.yml@refs/heads/main`로 정의 repo + ref 기준
C) 와일드카드 `repo:my-org/*`로 조직 내 모든 repo가 한 조건에 매칭되게 설정
D) repo마다 전용 IAM Role 100개를 만들어 각 trust policy에 해당 repo만 허용

**정답: B**
해설: Reusable workflow의 OIDC sub은 호출 repo가 아닌 정의 repo + ref가 기준. `job_workflow_ref` claim을 trust policy에 사용. 한 trust 조건으로 100개 repo 호출 커버.

---

**문제 8.** Fork된 PR이 base repo의 secrets에 접근하는 시나리오의 위험은?

A) `pull_request` 이벤트는 fork에서 secrets가 비공개로 마스킹되므로 어떤 경우에도 위험 없음
B) `pull_request_target` 이벤트는 base 컨텍스트로 실행되어 fork PR이 secrets/OIDC 권한 접근 가능 → fork에서 임의 코드 실행 시 prod 권한 탈취 위험
C) GitHub Actions는 fork에서 온 PR의 워크플로 실행을 무조건 차단하므로 노출 경로가 없음
D) fork PR은 읽기 전용 토큰만 받으므로 secrets에 닿아도 권한이 없어 위험 없음

**정답: B**
해설: `pull_request`는 fork 안전, `pull_request_target`은 base 컨텍스트라 secrets 접근 가능. 조직 차원에서 `pull_request_target` 사용 금지가 일반적.

---

**문제 9.** OIDC로 발급받은 임시 자격 증명의 기본 유효 시간과 최대치는?

A) 기본 15분, 최대 1시간 — STS 임시 자격의 최소 단위에 맞춰 짧게 고정
B) 기본 1시간, 최대 12시간(Role MaxSessionDuration 설정)
C) 기본 12시간, 최대 24시간 — 야간 대규모 빌드를 한 토큰으로 커버하도록 길게
D) 무제한 — 워크플로가 끝날 때까지 자격 증명이 유지되며 만료되지 않음

**정답: B**
해설: AssumeRoleWithWebIdentity 기본 1시간. Role 속성 `MaxSessionDuration`을 늘리면 최대 12시간까지 가능. 빌드가 12시간 이상이면 워크플로 분할 필요.

---

**문제 10.** OIDC + GitHub Environments + Trust Policy `sub: environment:production` 조합을 만들었다. 누군가 main 브랜치에서 직접 prod deploy job을 실행하려 한다. 어떻게 차단되는가?

A) GitHub Environment의 Required Reviewers가 사람 승인 대기 → 미승인 시 job 시작 안 함 → JWT 발급 안 함 → AWS Role assume 시도조차 발생 안 함
B) AWS IAM이 trust policy의 `sub` 불일치를 감지해 AssumeRoleWithWebIdentity를 자동 거부
C) GitHub이 보호된 environment를 참조하는 main 브랜치 job을 자동 격리해 실행을 차단
D) 차단되지 않음 — main은 기본 브랜치라 environment 게이트가 적용되지 않고 그대로 배포됨

**정답: A**
해설: GitHub Environments의 게이트는 job 시작 전에 적용된다. 승인이 없으면 JWT 자체가 발급되지 않으므로 AWS는 호출조차 받지 않는다. 이게 이중 방어의 핵심 — AWS IAM에 도달하기 전에 GitHub이 막는다.

---

## 📌 오늘의 요약

OIDC 페더레이션은 단순한 "키 없는 인증"이 아니라 **정적 자격 증명 자체를 시스템에서 제거하는 패러다임 전환**이다. JWT의 `sub` claim에 컨텍스트(repo, ref, environment, reusable workflow ref)가 모두 담겨 있어, Trust Policy 조건만 정확히 쓰면 매우 정밀한 권한 제어가 가능하다. GitHub Environments + Required Reviewers와 결합하면 GitHub 게이트와 AWS IAM 게이트의 이중 방어가 완성된다. 실무 함정은 `permissions: id-token: write` 누락, `sub` 와일드카드, `pull_request_target` 오용 세 가지가 단연 많다. 내일은 이걸 CodeBuild의 빌드 시스템 관점에서 다시 본다.
