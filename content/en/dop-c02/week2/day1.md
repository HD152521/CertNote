# Day 1 - CodeCommit Deep Dive: What Changes When Git Hosting is Integrated with IAM

CodeCommit appears on the surface to be "a Git server built by AWS". However, falling for this one-liner explanation leads to confusion in both exam questions and real-world operations. The true identity of CodeCommit is **a managed repository with the Git protocol layered on top of the IAM/STS authentication system**, and this single design decision makes its security model, automation patterns, and cross-account operations fundamentally different from GitHub.

Today's discussion covers: ① how IAM underpins Git and its four authentication variants ② how Git events flow into EventBridge as automation entry points ③ how Approval Rules emulate GitHub's Required Reviewers with branch protection ④ how cross-account CodeCommit works in multi-account environments ⑤ what exam patterns emerge after the July 2024 new customer signup discontinuation.

Once you internalize this picture, it naturally becomes clear where CodeCommit stands in its trade-offs compared to GitHub Enterprise, GitLab, and Bitbucket.

## How CodeCommit Integrates with IAM — Internal Workings of Four Authentication Methods

GitHub authenticates via OAuth tokens or SSH keys. GitLab works similarly. CodeCommit, however, regardless of which authentication method is used, ultimately routes through **temporary credentials issued by STS to be evaluated by IAM Policy**. Let's first understand what this means.

Git protocol (HTTPS or SSH) is originally based on username/password or SSH keys. CodeCommit keeps that protocol intact while diverting the authentication information flowing through it to the IAM evaluation engine. So even though the same `git clone` command is used, one of four different mechanisms occurs on the backend.

| Method | Flow | Best Fit Environment |
|--------|------|----------------------|
| **HTTPS Git Credentials** | Username/password issued from IAM Console stored plaintext or in OS keychain → CodeCommit maps that username to IAM User then evaluates permissions | Developer workstations. Non-MFA environments. |
| **SSH Keys** | Public SSH key uploaded to IAM User → git connects to `ssh://APKAxxx@git-codecommit.region.amazonaws.com` → IAM identifies User by SSH key ID then evaluates permissions | Developers or CI bots. Difficult to apply MFA separately. |
| **HTTPS + AWS CLI Credential Helper** | When git requests credentials, AWS CLI calls STS GetSessionToken → converts temporary credentials to SigV4 signature and injects into git | EC2/CodeBuild/Lambda. IAM Role based. |
| **HTTPS + git-remote-codecommit (GRC)** | Installed as Python package, uses `codecommit::region://profile@repo` URL format. Signs each request with SigV4. Works with SSO/MFA/federation environments | Federated users, MFA-enforcing orgs, AWS SSO environments |

> 🔍 **Deep Dive**: Git Credentials (first method) can **only be issued to IAM Users**, not IAM Roles. Why? Because a Role's credentials are temporary (STS), while Git Credentials must be permanent username/password form. Therefore, in Role-based environments like EC2/Lambda, Credential Helper or GRC is mandatory. This is a decisive hint in exam questions like "how to git push from EC2?"

> 💡 **Related Theory**: These four authentication paths are fundamentally an Adapter pattern (Gamma et al., Design Patterns 1994) that bridges the gap between "credential types Git understands" and "credentials IAM requires". When Linus Torvalds designed Git in the late 1990s as a BitKeeper alternative, it only assumed username/password or SSH keys. IAM, by contrast, standardizes on SigV4 signatures + temporary credentials. CodeCommit supporting all four authentication paths is a design compromise to work around this impedance mismatch.

> ⚠️ **Trap**: A common exam choice says "storing IAM User's access key in ~/.aws/credentials enables git push". False. That's a credential meant for AWS CLI, not one Git protocol recognizes. Git would need to convert that credential to SigV4 signature to send it, and the tool that performs this conversion is exactly the **Credential Helper** (`!aws codecommit credential-helper $@`). Without registering this helper in git config, IAM credentials alone won't make git work.

```bash
# Register Credential Helper (standard on EC2/Cloud9/CodeBuild)
git config --global credential.helper '!aws codecommit credential-helper $@'
git config --global credential.UseHttpPath true
# Afterward: git clone https://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/MyApp
```

> 📚 **Case Study**: A fintech company migrating from GitHub Enterprise to CodeCommit in the early 2020s hit a roadblock with their "MFA enforcement" policy. Federated SSO developers logging into the console couldn't git push. Reason: HTTPS Git Credentials are IAM User-only, so federated users couldn't obtain them. Solution: **switch to git-remote-codecommit (GRC)**. GRC generates SigV4 signatures on every git request using the current AWS profile's credentials (including SSO tokens), so it integrates naturally with MFA and SSO. This case study frequently appears in exams as "CodeCommit access in MFA-enforced organizations" variants.

## How Git Events Flow into EventBridge — Automation Entry Point

The point where CodeCommit **decisively differs** from GitHub is that **all repository events are natively published to EventBridge by default**. GitHub requires separate webhook setup, you must operate a webhook reception endpoint, and you implement retry, signature verification, and deduplication yourself. CodeCommit delegates that work to EventBridge.

The types of events published are:

| Event Type | Occurrence | Key detail fields |
|-----------|-----------|-------------------|
| `CodeCommit Repository State Change` | push, branch create/delete, tag changes | `event` (referenceCreated/Updated/Deleted), `referenceFullName`, `commitId` |
| `CodeCommit Pull Request State Change` | PR created/closed/merged, source branch updated, approval added/cancelled | `event` (pullRequestCreated etc.), `pullRequestId`, `destinationReference`, `sourceCommit` |
| `CodeCommit Comment on Pull Request` | PR comment added | `commentId`, `pullRequestId` |
| `CodeCommit Comment on Commit` | Commit comment added | `commentId`, `commitId` |
| `CodeCommit Approval Rule Override` | When overriding Approval Rule | `pullRequestId`, `overrideStatus` |

After these events flow into EventBridge, usage patterns are nearly limitless. A few standard patterns:

```json
// Auto-trigger build on PR creation
{
  "source": ["aws.codecommit"],
  "detail-type": ["CodeCommit Pull Request State Change"],
  "detail": {
    "event": ["pullRequestCreated", "pullRequestSourceBranchUpdated"],
    "repositoryNames": ["MyApp"]
  }
}
```

```json
// main branch merge → start prod pipeline
{
  "source": ["aws.codecommit"],
  "detail-type": ["CodeCommit Repository State Change"],
  "detail": {
    "event": ["referenceUpdated"],
    "referenceType": ["branch"],
    "referenceName": ["main"]
  }
}
```

> 🔍 **Deep Dive**: Don't forget EventBridge's **at-least-once delivery** characteristic. The same PR creation event can rarely be delivered twice. If a single build should run per PR, you must create an idempotency key from `pullRequestId + sourceCommit` in Lambda and prevent duplicates via DynamoDB conditional write. CodePipeline has built-in behavior to not create new executions for the same source revision (behavior varies by change detection enabled/disabled), but Lambda direct invocation paths must handle dedup themselves.

> 💡 **Related Theory**: EventBridge's PutEvents is the practical consequence of "exactly-once is impossible in distributed systems" (Two Generals Problem, 1975, Akkoyunlu·Ekanadham·Huber). All AWS event buses (SQS, SNS, EventBridge, Kinesis) choose at-least-once and shift idempotency responsibility to the consumer. This contrasts with Kafka's exactly-once semantics (EOS), which imposes transactional IDs and sequences on both producer and consumer.

> 📚 **Case Study**: A game company built an "auto-Slack notification on PR creation" system with CodeCommit + Lambda. A month later, the same PR alerts occasionally appeared twice in Slack. Root cause: EventBridge's at-least-once delivery occurred once or twice monthly. Solution: Lambda added DynamoDB TTL 5-minute conditional put using `pullRequestId + eventVersion` as key, and the function exits immediately if already exists. This experience taught the team: "dedup in event-driven automation is not optional; it's mandatory".

Legacy trigger menus (the Triggers tab in the repository) can only directly connect to SNS and Lambda, with limited event filtering. **Modern recommendation: EventBridge single path**, and AWS official guidance explicitly states that new automations should standardize on EventBridge. In exams, if "latest recommended pattern" is mentioned, EventBridge is the answer.

## Approval Rule Template — IAM Version of GitHub's Required Reviewers

GitHub's Required Reviewers operate based on GitHub users/teams. CodeCommit performs the same function **based on IAM Principal**. This difference becomes its strength in multi-account and federation environments.

Approval Rule Template is structured as follows:

```json
{
  "Version": "2018-11-08",
  "DestinationReferences": ["refs/heads/main", "refs/heads/release/*"],
  "Statements": [
    {
      "Type": "Approvers",
      "NumberOfApprovalsNeeded": 2,
      "ApprovalPoolMembers": [
        "arn:aws:sts::123456789012:assumed-role/SeniorDeveloperRole/*",
        "arn:aws:sts::123456789012:assumed-role/SecurityReviewerRole/*"
      ]
    }
  ]
}
```

The key trick is using **assumed-role ARN patterns** in `ApprovalPoolMembers`. `arn:aws:sts::ACCOUNT:assumed-role/RoleName/*` means "any session that assumed that Role qualifies as an approver". This is why federated users entering via SSO in the console can naturally approve PRs.

> ⚠️ **Trap**: "Can I put IAM User ARN in ApprovalPoolMembers?" Yes, technically possible. However, in federation/SSO environments, users aren't IAM Users but assumed-roles, so User ARN won't match. In exam choices, answers with "User ARN for Approval Pool composition" are rare. The answer is almost always **assumed-role ARN pattern**.

> 🔍 **Deep Dive**: Approval Rule Template is created **at the account level, not repository level**. After creation, you connect it to repositories via the `AssociateApprovalRuleTemplateWithRepository` API. This separation is intentional—when you have 50 repositories in an account, you can define a standard like "main branch requires 2 approvals" in one template and apply it to all repositories. In exams, when the scenario says "enforce identical PR approval rules org-wide", the answer is **Approval Rule Template + bulk association**, not per-repository rules.

> 💡 **Related Theory**: This pattern is **declarative separation** of policy. Think Kubernetes's ClusterRole + ClusterRoleBinding, OPA's policy/data separation. Policy definitions are centralized, application happens through a separate mechanism. Without this separation, you'd copy-paste the same policy 50 times across repositories, and policy changes cause drift.

```bash
# Define template at account level
aws codecommit create-approval-rule-template \
  --approval-rule-template-name "Standard-Main-2Reviews" \
  --approval-rule-template-content file://template.json

# Apply to multiple repos in bulk (bash loop or IaC)
for REPO in app-frontend app-backend app-worker; do
  aws codecommit associate-approval-rule-template-with-repository \
    --approval-rule-template-name "Standard-Main-2Reviews" \
    --repository-name $REPO
done
```

## CodeCommit vs GitHub Actions/GitLab CI/Bitbucket — Differences Pro Exams Ask About

Pro exams love tool comparisons. You must know exactly how CodeCommit differs from other Git hosting, and what trade-offs exist.

| Dimension | CodeCommit | GitHub.com / Enterprise | GitLab | Bitbucket |
|-----------|-----------|--------------------------|--------|-----------|
| **Authentication** | IAM/STS, GRC, Git Credentials | OAuth, PAT, SSH, GitHub Apps + **OIDC to AWS** | OAuth, PAT, SSH, OIDC | OAuth, PAT, SSH |
| **PR Approval** | Approval Rule Template (IAM-based) | Required Reviewers + CODEOWNERS | Merge Request Approvals + CODEOWNERS | Default Reviewers + Branch Permissions |
| **Built-in CI** | None — CodeBuild/CodePipeline separate | GitHub Actions built-in | GitLab CI built-in | Bitbucket Pipelines built-in |
| **Secrets** | Secrets Manager / SSM Parameter Store | Repo Secrets / Org Secrets / Environments | CI/CD Variables | Repository/Workspace Variables |
| **Events** | EventBridge native | Webhook | Webhook / System Hook | Webhook |
| **DR/Replication** | Manual mirroring (Lambda) | Geo-replication (Enterprise) | Geo (Premium) | Smart Mirroring |
| **New Signups** | Discontinued 2024-07-25 | General signup available | General signup available | General signup available |
| **AWS Integration** | Native | OIDC + IAM Role (`AssumeRoleWithWebIdentity`) | OIDC | OIDC |

> 🔍 **Deep Dive**: Recent exam trends increasingly ask about "**OIDC federation from GitHub Actions to AWS**". The pattern is established: ① Register GitHub OIDC provider (`https://token.actions.githubusercontent.com`) in AWS IAM Identity Provider ② Create IAM Role with trust policy containing `aud=sts.amazonaws.com` + `sub=repo:org/repo:ref:refs/heads/main` conditions ③ In GitHub Actions workflow, use `aws-actions/configure-aws-credentials@v4` with AssumeRoleWithWebIdentity. This is safer than storing static access keys because the keys don't exist. In exams, when asked "how should GitHub Actions safely access AWS?", the answer is almost always OIDC + Role assumption.

> 💡 **Related Theory**: OIDC (OpenID Connect, OpenID Foundation 2014) is a standard that adds an authentication layer on top of OAuth 2.0. The key is an ID Token, a JWT containing claims (iss, sub, aud, exp) that verify it was issued by a trustworthy IdP. AWS's OIDC federation converts this JWT via `AssumeRoleWithWebIdentity`. Compared to static access keys, it's superior in **ephemerality, non-sharing, and auditability**.

> 📚 **Case Study**: In early 2023, a SaaS company storing GitHub Actions AWS access keys statically suffered a key leak when PR logs exposed environment variables (reason: someone added debug `echo` in PR). Key revocation + rotation + impact analysis took 36 hours. The company then switched to OIDC + IAM Role pattern, making leaks impossible because keys themselves don't exist. In exams, "fork PR secrets access risk" phrasing is almost always a signal about OIDC.

## Cross-Account CodeCommit — Standard Configuration for Hub/Spoke Pipelines

In multi-account environments, the standard pattern has CodeCommit in Account A and CodePipeline in Shared Services Account B. For this configuration to work, you must correctly align **three IAM surfaces**:

1. **Account A's CodeCommit Resource Policy**: Declares who can read this repository
2. **Account B's Pipeline Role's Identity Policy**: States that Role has permission to call CodeCommit
3. **Pipeline's Source Action's `roleArn`**: Which Role to assume when accessing CodeCommit

All three must align for cross-account to work. If even one is missing, the error message is cryptic (usually "access denied"), making debugging difficult.

```json
// Account A: CodeCommit Repository Resource Policy
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "CrossAccountReadFromB",
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::B-ACCOUNT-ID:role/CodePipeline-SourceAccess-Role"
    },
    "Action": [
      "codecommit:GitPull",
      "codecommit:GetBranch",
      "codecommit:GetCommit",
      "codecommit:GetCommitHistory",
      "codecommit:UploadArchive",
      "codecommit:GetUploadArchiveStatus",
      "codecommit:CancelUploadArchive"
    ],
    "Resource": "arn:aws:codecommit:ap-northeast-2:A-ACCOUNT-ID:MyApp"
  }]
}
```

```json
// Account B: CodePipeline Source Action configuration
{
  "name": "Source",
  "actionTypeId": {
    "category": "Source",
    "owner": "AWS",
    "provider": "CodeCommit",
    "version": "1"
  },
  "roleArn": "arn:aws:iam::B-ACCOUNT-ID:role/CodePipeline-SourceAccess-Role",
  "configuration": {
    "RepositoryName": "MyApp",
    "BranchName": "main",
    "PollForSourceChanges": "false"
  }
}
```

> ⚠️ **Trap**: If **KMS keys** are missing from the above configuration, it will fail at the artifact encryption stage. CodePipeline's artifact bucket is usually encrypted with customer-managed KMS keys, and in cross-account scenarios, that key's **key policy must grant Decrypt/GenerateDataKey permissions to the Role in Account A** (or Principals that can assume that Role). In exams, when "cross-account pipeline works on all permissions but fails on artifacts", the answer is almost always missing KMS key policy.

> 🔍 **Deep Dive**: CodeCommit's cross-account pattern demonstrates AWS's design philosophy of **separating data plane (Git protocol) from control plane (IAM)**. Git protocol itself uses the HTTPS endpoint directly (public internet), but authentication is handled by IAM, so you need neither VPC peering nor Direct Connect at the network level. This is a frequent exam trap—"VPC Peering required for cross-account CodeCommit access" is always wrong.

> 💡 **Related Theory**: **Dual evaluation** of Resource Policy + Identity Policy is IAM's core principle. In cross-account scenarios, both policies must Allow for access to be granted—"Both policies must allow" rule. Within the same account, only one policy needs to Allow (with certain service exceptions), but cross-account always requires both. This asymmetry, if confusing, warrants re-checking the evaluation order of SCP + Permission Boundary + Resource Policy + Identity Policy.

> 📚 **Case Study**: A media company operating CodePipeline across multi-accounts added an SCP guardrail saying "no PR can access prod account's CodeCommit". They wrote `codecommit:GitPull` with Deny in the SCP but incorrectly configured `NotPrincipal`, inadvertently blocking even Shared Services' Pipeline Role. Prod deployment was stuck for 30 minutes. Lesson: SCP Deny + NotPrincipal combination is tricky for allowlists—using `aws:PrincipalArn` conditions or `aws:PrincipalOrgID` to explicitly specify positive lists is safer.

## CodeCommit Sunset — Exam Patterns After July 25, 2024

On July 25, 2024, AWS **discontinued new customer signups for CodeCommit**. This decision casts a subtle shadow on exam question patterns.

| Fact | Exam Pattern |
|------|--------------|
| Existing customers can continue normal use including creating new repositories | "Our company already uses CodeCommit and needs a new microservice repo" → "can be created" is the answer |
| New customers cannot sign up | "New startup wants AWS-native source control" → GitHub + OIDC is the answer, not CodeCommit |
| Pro exams still treat CodeCommit as frequent topic | If CodeCommit appears in choices, don't assume "can't use it anymore" |
| Migration scenarios increasingly appear | CodeCommit → GitHub mirroring, gradual transition patterns are newly tested |

> 🔍 **Deep Dive**: The reason for CodeCommit's sunset is unstated, but industry speculation is twofold: ① GitHub (Microsoft)/GitLab's market dominance has stalled new CodeCommit adoption ② AWS internal Amazon Q Developer/CodeWhisperer prioritizes GitHub integration. Exams don't ask about politics, but **migration patterns** (CodeCommit → GitHub Enterprise → OIDC) are increasingly tested.

> 📚 **Case Study**: A large financial institution progressively migrated from CodeCommit to GitHub Enterprise Cloud in late 2024. Pattern: ① Add GitHub repo as mirror destination, sync all pushes bidirectionally via EventBridge → Lambda ② Incrementally transition CodePipeline source actions to GitHub ③ Migrate developer tool chains (Git Credentials → SSH/OIDC) ④ Finally archive CodeCommit repositories as read-only. This sequence is a textbook example of the **dual-write/dual-read migration pattern**.

## Auto Mirroring and DR — Why CodeCommit Doesn't Do Native Cross-Region Replication

CodeCommit doesn't automatically replicate to other regions. This is intentional design. Git itself is a distributed VCS, so "replication" already happens through developer clones, and AWS views additional mirroring as operations responsibility. However, from a DR perspective, it's insufficient—a region-wide outage stops CI/CD.

The standard mirroring pattern is:

```
[Source Region: ap-northeast-2]
    CodeCommit MyApp
        |
        | EventBridge: referenceUpdated
        v
    Lambda Mirror Function
        |
        | git clone --bare + git push --mirror
        v
[DR Region: us-east-1]
    CodeCommit MyApp-mirror
```

> ⚠️ **Trap**: `git push --mirror` **force-pushes all refs** (`refs/heads/*`, `refs/tags/*`, `refs/notes/*` included). If someone pushed directly to the mirror destination, that change would be overwritten. Therefore, the mirror destination must always be read-only (GitPush blocked via Resource Policy).

> 💡 **Related Theory**: Git's term "distributed" is easily misunderstood. Git is distributed in data model (merkle DAG) but **workflow is almost always centralized** (GitHub, GitLab, CodeCommit, etc.). True distributed workflow (p2p, mesh) is used by only a tiny fraction like Linux kernel. So the assumption "it's distributed, so replication must be automatic" is broken—if the central host dies, developer local clones survive but CI/CD stops.

> 📚 **Case Study**: A global game studio running CodeCommit and CodePipeline in us-east-1 saw all deployments blocked during the 2021 us-east-1 IAM/STS outage. Post-analysis: ① Mirror CodeCommit to us-west-2, ② configure identical CodePipeline in us-west-2, connect both via EventBridge cross-region targets ③ use Route 53 health check for active/passive failover. After adopting this structure, the next us-east-1 outage saw us-west-2 deployment line automatically activate with ~8-minute RTO.

## CodeCommit + CodeGuru Reviewer — Automation Layer for Code Review

CodeGuru Reviewer ML-analyzes PRs to add automated comments. When you associate a CodeCommit repository, automatic analysis starts at PR creation.

| Reviewer Feature | Target | Exam Point |
|------------------|--------|------------|
| **Code Quality** | Function length, complexity, race condition, resource leak | Covers some OWASP/CWE |
| **Security Detector** | Hardcoded secrets, SQL injection patterns, weak crypto | Java/Python/JavaScript |
| **CodeGuru Profiler Integration** | Runtime data to identify hotspots | Requires separate integration |

> 🔍 **Deep Dive**: From 2024 onward, CodeGuru Reviewer is essentially merging into Amazon Q Developer Code Review. Pro exams still ask "connect CodeGuru Reviewer" choices, but in practice Amazon Q is increasingly becoming standard. In exams, choose CodeGuru Reviewer for "automated PR analysis", but be aware that **Amazon Q Developer may appear in that role in 2025+ materials**.

## Frequently Asked Traps and Scenario Patterns in Exams

> 🎯 **Scenario**: A company wants "direct push to Production branch (`main`) forbidden; PR + 2-approval only". Which answer best fits? (a) IAM Policy with `codecommit:GitPush` Deny + Resource ARN as main branch (b) Create Approval Rule Template requiring 2 approvals for main + Resource Policy blocking push (c) Approval Rule Template + IAM Policy with `codecommit:GitPush` Deny + Condition `codecommit:References` = `refs/heads/main`. Answer is **c**. CodeCommit's IAM Policy condition key `codecommit:References` controls push to specific branches, combined with Approval Rule for GitHub-equivalent Branch Protection.

> 🎯 **Scenario**: A company wants "auto-build + code coverage on PR creation, post coverage as PR comment". EventBridge → CodeBuild → on build end Lambda → CodeCommit `PostCommentForPullRequest` API. Which EventBridge event should trigger? (a) `pullRequestCreated` only (b) both `pullRequestCreated` and `pullRequestSourceBranchUpdated` (c) `referenceUpdated`. Answer is **b**. Build must re-run both when PR is first created and when source branch updates for PR to stay current.

> ⚠️ **Trap Summary**:
> - **Trap 1**: IAM User access key usable directly in git → impossible. Requires Git Credentials or GRC/Credential Helper.
> - **Trap 2**: Cross-account needs VPC Peering → unnecessary. IAM/Resource Policy + Pipeline roleArn suffices.
> - **Trap 3**: CodeCommit auto cross-region replicates → doesn't. Lambda mirroring is standard.
> - **Trap 4**: Approval Rule Template is per-repository → no. Defined at account level + association to repositories.
> - **Trap 5**: Signup discontinued means existing customers can't create new repos → they can.
> - **Trap 6**: CodeGuru Reviewer needs separate IAM Role → service-linked role auto-created, but analysis trigger is event-based after association.

## ⭐ Key Points (High Exam Frequency)

1. ⭐ CodeCommit's four authentication methods — Git Credentials (User-only), SSH (User-only), Credential Helper (Role possible), GRC (SSO/MFA). Answer hinges on whether scenario user is IAM User or Role/federation.
2. ⭐ All git events auto-published to EventBridge — automation entry point. No separate webhook operation.
3. ⭐ Approval Rule Template is account-level, applied via association to repos. `ApprovalPoolMembers` uses assumed-role ARN patterns.
4. ⭐ Cross-account = Resource Policy(A) + Identity Policy(B) + Pipeline Source Action's roleArn + KMS Key Policy. Missing even one causes failure.
5. ⭐ July 25, 2024 new signup discontinued; existing customers can still create new repos normally. Migration scenarios increasingly appear.
6. ⭐ No native cross-region replication. EventBridge → Lambda → `git push --mirror` pattern.
7. ⭐ GitHub Actions → AWS via OIDC + `AssumeRoleWithWebIdentity` is the answer pattern.

---

## 📝 연습 문제

**문제 1.** AWS SSO/페더레이션을 쓰는 회사에서 모든 개발자가 MFA를 강제받는다. CodeCommit에 git push를 가능하게 하는 가장 표준적인 방법은?

A) 개발자마다 IAM User를 만들어 HTTPS Git Credentials를 발급하고 OS keychain에 저장해 사용
B) Personal SSH 공개키를 각 개발자 IAM User에 등록하고 `ssh://APKAxxx@` 엔드포인트로 접속
C) git-remote-codecommit(GRC)를 설치하고 `codecommit::region://profile@repo` URL 사용
D) SSO로 받은 임시 Access Key를 환경 변수로 export하고 git이 그대로 사용하게 설정

**정답: C**
해설: 페더레이션/SSO 환경에서는 IAM User가 없거나 사용하지 않으므로 A/B는 부적합. GRC는 매 git 요청을 현재 AWS profile의 자격 증명(SSO 세션 토큰 포함)으로 SigV4 서명하므로 MFA·SSO와 자연스럽게 결합된다. D는 보안 안티패턴이고 SigV4 서명 변환이 별도 필요해 직접 동작 안 함.

---

**문제 2.** EC2 인스턴스에서 CodeCommit으로 git push 하려 한다. 가장 안전하고 표준적인 인증 방식은?

A) IAM User 액세스 키를 ~/.aws/credentials에 저장하고 CLI가 그 자격으로 git을 인증
B) IAM Console에서 발급한 HTTPS Git Credential(username/password)을 인스턴스에 저장해 사용
C) EC2 IAM Role + AWS CLI Credential Helper(HTTPS)
D) Root 사용자의 장기 자격 증명을 환경 변수로 주입해 모든 권한으로 push

**정답: C**
해설: EC2에는 Instance Profile/IAM Role이 표준. Credential Helper가 IMDS에서 임시 자격 증명을 가져와 SigV4 서명으로 git에 주입한다. 정적 키 보관 불필요. B는 IAM Role에 발급 불가하므로 EC2 환경에 어울리지 않음.

---

**문제 3.** Account A의 CodeCommit을 Account B의 CodePipeline이 소스로 쓰려 한다. 다음 중 필수가 아닌 것은?

A) Account A의 CodeCommit Resource Policy에서 Account B의 Pipeline Role을 Principal로 허용
B) Account B의 CodePipeline Source Action에 cross-account 접근용 `roleArn` 지정
C) Account B Pipeline Role의 Identity Policy에 `codecommit:GitPull` 등 CodeCommit 권한 부여
D) 두 계정 VPC 간 Direct Connect 또는 VPC Peering으로 사설 네트워크 경로 구성

**정답: D**
해설: CodeCommit cross-account는 IAM/Resource Policy + roleArn만으로 동작. 네트워크 측면에서 추가 연결 불필요(공용 endpoint + SigV4). KMS 키 정책도 추가로 필요하지만 D는 절대 불필요.

---

**문제 4.** PR이 main 브랜치로 머지되면 자동으로 prod 파이프라인이 시작되어야 한다. 가장 적합한 구성은?

A) EventBridge Rule이 `CodeCommit Repository State Change`의 `event=referenceUpdated`, `referenceName=main`을 캐치 → CodePipeline StartExecution
B) CodeCommit이 머지 시 아티팩트를 S3에 올리고 그 S3 PutObject 이벤트로 파이프라인을 트리거
C) CodeCommit Trigger를 SNS 토픽에 연결하고 파이프라인이 그 토픽을 주기적으로 polling
D) Lambda가 매분 `git log`를 polling해 main의 새 커밋을 감지하면 StartPipelineExecution 호출

**정답: A**
해설: EventBridge가 표준. `pullRequestMergedStatusUpdated`도 사용 가능하지만 main 브랜치 ref 업데이트가 더 일반적이고 squash/rebase 머지에도 일관되게 트리거된다. D는 polling 안티패턴.

---

**문제 5.** "Production main 브랜치에 PR 없이 직접 push를 막아라"는 정책을 IAM/CodeCommit으로 구현하려 한다. 가장 적합한 것은?

A) IAM Policy로 `codecommit:GitPush` Deny + `Condition: codecommit:References = refs/heads/main`을 모든 개발자 Role에 적용
B) Approval Rule Template만 만들어 main 대상 2명 승인을 강제하고 직접 push도 그 룰이 막게 함
C) 저장소 전체를 Resource Policy로 read-only 전환하고 머지는 관리자만 수행하게 함
D) Lambda가 main push 이벤트를 받아 PR 없이 올라온 커밋을 자동으로 사후 revert

**정답: A**
해설: CodeCommit의 IAM condition key `codecommit:References`로 특정 ref(브랜치) 단위 push 차단이 가능. Approval Rule은 PR 머지 시점 승인 강제용이지 직접 push 차단 기능이 아님. 실무에서는 A + Approval Rule Template을 조합한다.

---

**문제 6.** CodeCommit + EventBridge로 PR 생성 시 자동 빌드 시스템을 구축했다. 같은 PR 알림이 가끔 두 번씩 발생한다. 가장 적합한 해결책은?

A) EventBridge 규칙을 삭제 후 재생성해 중복 전달을 유발하던 규칙 상태를 초기화
B) Lambda에서 `pullRequestId + sourceCommit`을 키로 DynamoDB conditional put으로 dedup
C) EventBridge 대신 SNS로 대체해 FIFO 토픽의 중복 제거 기능으로 단일 전달 보장
D) EventBridge 타깃의 retry 정책을 0으로 설정하고 최대 이벤트 수명을 짧게 줄임

**정답: B**
해설: EventBridge는 at-least-once delivery로 중복 가능. 표준 패턴은 consumer 측 idempotency 처리. DynamoDB conditional write가 가장 안전. D는 EventBridge에서 직접 설정 불가능한 옵션.

---

**문제 7.** CodeCommit 저장소를 us-east-1에서 us-west-2로 DR 복제하려 한다. 가장 적합한 패턴은?

A) CodeCommit이 리전 장애에 대비해 자동 cross-region 복제를 제공하므로 추가 작업 불필요
B) EventBridge `referenceUpdated` → Lambda → `git push --mirror`로 타 리전 CodeCommit에 미러
C) 저장소 데이터가 담긴 S3에 Cross-Region Replication을 켜서 us-west-2로 객체를 복제
D) RDS Cross-Region Read Replica로 저장소 메타데이터를 복제해 DR 리전에서 읽기 제공

**정답: B**
해설: CodeCommit native cross-region 미지원. Lambda 미러링이 표준. Mirror destination은 Resource Policy로 push 차단(read-only)해야 데이터 덮어쓰기 방지.

---

**문제 8.** GitHub Actions에서 AWS 리소스에 접근해야 한다. 가장 안전한 인증 방식은?

A) 전용 IAM User를 만들어 장기 Access Key를 GitHub Secrets에 저장하고 90일 주기로 회전
B) 루트 계정의 자격 증명을 GitHub Secrets에 넣어 모든 AWS 리소스에 폭넓게 접근
C) AWS IAM Identity Provider에 GitHub OIDC 등록 + IAM Role trust policy에 `sub=repo:org/repo:ref:refs/heads/main` 조건 → `aws-actions/configure-aws-credentials@v4`로 AssumeRoleWithWebIdentity
D) EC2 인스턴스 한 대를 self-hosted GitHub runner로 등록하고 Instance Profile 권한으로 접근

**정답: C**
해설: OIDC + Role assumption이 표준. 정적 키 없음 → 누출 위험 0. trust policy의 `sub` 조건으로 특정 repo/branch만 허용 가능. A는 키 노출 위험.

---

**문제 9.** Approval Rule Template를 만들어 30개 저장소에 일괄 적용하려 한다. 어떻게 해야 가장 효율적인가?

A) 30개 저장소 각각의 콘솔에서 동일한 승인 룰을 수동 생성하고 변경 시마다 모두 갱신
B) 계정 수준에 Approval Rule Template 1개 생성 → `AssociateApprovalRuleTemplateWithRepository` API를 모든 저장소에 호출(루프 또는 IaC)
C) 승인 정책 파일을 S3에 올려두고 각 저장소가 머지 시 그 파일을 polling해 규칙 평가
D) Step Functions 워크플로로 PR마다 승인 조건을 매번 동적 평가해 머지 허용 여부 결정

**정답: B**
해설: Approval Rule Template은 의도적으로 계정 수준에 정의 + 저장소 association으로 분리됐다. 정확히 이 시나리오를 위한 설계.

---

**문제 10.** CodeCommit이 sunset됐다고 알려져 있다. 우리 회사는 5년 전부터 CodeCommit을 사용 중이고 새 마이크로서비스 repo가 필요하다. 가장 정확한 사실은?

A) 신규 가입 중단으로 기존 사용자도 추가 repo 생성이 막히고 GitHub 마이그레이션이 강제됨
B) 기존 사용자는 신규 repo 생성을 포함해 정상 사용 가능
C) 기존 고객도 신규 repo는 AWS Support 티켓으로 예외 승인을 받아야 생성 가능
D) sunset 정책에 따라 기존 repo가 일정 유예 후 read-only로 자동 전환됨

**정답: B**
해설: 2024-07-25 이후 신규 고객 가입만 중단. 기존 고객은 신규 repo 생성 포함 모든 기능 정상. 시험에서 자주 묻는 미묘한 경계.

---

## 📌 오늘의 요약

CodeCommit의 가치는 "AWS가 만든 Git 호스팅"이라는 외피가 아니라 **Git protocol과 IAM/STS의 결합**이다. 이 결합이 ① 4종의 인증 방식 ② EventBridge 네이티브 이벤트 ③ Approval Rule Template ④ 멀티 계정 Resource Policy 패턴을 모두 가능하게 한다. 2024년 신규 가입 중단 이후 마이그레이션 시나리오가 늘었지만 시험에서는 여전히 빈출 영역이고, GitHub OIDC 페더레이션 패턴이 새로 등장하는 점도 함께 익혀두면 좋다. 내일은 Git 워크플로우 자체(trunk-based vs GitFlow)와 CodeCommit 위에서의 brunch 전략을 더 깊이 본다.
