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

## 📝 Practice Questions

**Question 1.** In a company that uses AWS SSO/federation, all developers are forced to use MFA. What is the most standard way to enable git push to CodeCommit?

A) Create an IAM User for each developer, issue HTTPS Git Credentials, and store them in the OS keychain
B) Register a personal SSH public key on each developer's IAM User and connect through the `ssh://APKAxxx@` endpoint
C) Install git-remote-codecommit (GRC) and use the `codecommit::region://profile@repo` URL
D) Export the temporary Access Key received through SSO as environment variables and configure git to use it as is

**Answer: C**
Explanation: In a federation/SSO environment there are no IAM Users or they are not used, so A/B are unsuitable. GRC signs every git request with SigV4 using the current AWS profile's credentials (including the SSO session token), so it combines naturally with MFA and SSO. D is a security anti-pattern, and because a separate SigV4 signing conversion is required, it does not work directly.

---

**Question 2.** You want to git push to CodeCommit from an EC2 instance. What is the safest and most standard authentication method?

A) Store IAM User access keys in ~/.aws/credentials and have the CLI authenticate git with those credentials
B) Store an HTTPS Git Credential (username/password) issued in the IAM Console on the instance and use it
C) EC2 IAM Role + AWS CLI Credential Helper(HTTPS)
D) Inject the Root user's long-term credentials as environment variables and push with all permissions

**Answer: C**
Explanation: For EC2, an Instance Profile/IAM Role is the standard. The Credential Helper fetches temporary credentials from IMDS and injects them into git with SigV4 signing. There is no need to store static keys. B cannot be issued to an IAM Role, so it does not suit an EC2 environment.

---

**Question 3.** An Account B CodePipeline wants to use Account A's CodeCommit as its source. Which of the following is NOT required?

A) In Account A's CodeCommit Resource Policy, allow Account B's Pipeline Role as the Principal
B) Specify a `roleArn` for cross-account access in the Account B CodePipeline Source Action
C) Grant CodeCommit permissions such as `codecommit:GitPull` in the Identity Policy of the Account B Pipeline Role
D) Configure a private network path between the two accounts' VPCs with Direct Connect or VPC Peering

**Answer: D**
Explanation: CodeCommit cross-account works with just IAM/Resource Policy + roleArn. No additional connectivity is needed on the network side (public endpoint + SigV4). A KMS key policy is also additionally required, but D is never necessary.

---

**Question 4.** When a PR is merged into the main branch, the prod pipeline must start automatically. What is the most suitable configuration?

A) An EventBridge Rule catches `CodeCommit Repository State Change` with `event=referenceUpdated` and `referenceName=main` → CodePipeline StartExecution
B) CodeCommit uploads an artifact to S3 on merge, and the pipeline is triggered by that S3 PutObject event
C) Connect a CodeCommit Trigger to an SNS topic and have the pipeline periodically poll that topic
D) A Lambda function polls `git log` every minute, and when it detects a new commit on main, calls StartPipelineExecution

**Answer: A**
Explanation: EventBridge is the standard. `pullRequestMergedStatusUpdated` can also be used, but a main branch ref update is more general and triggers consistently even for squash/rebase merges. D is a polling anti-pattern.

---

**Question 5.** You want to implement, with IAM/CodeCommit, the policy "block direct pushes to the Production main branch without a PR." What is the most suitable approach?

A) Apply `codecommit:GitPush` Deny + `Condition: codecommit:References = refs/heads/main` to all developer Roles through an IAM Policy
B) Create only an Approval Rule Template to enforce 2 approvals for main, and let that rule also block direct pushes
C) Switch the whole repository to read-only through a Resource Policy and have only administrators perform merges
D) A Lambda function receives main push events and automatically reverts after the fact any commits that arrived without a PR

**Answer: A**
Explanation: With CodeCommit's IAM condition key `codecommit:References`, pushes can be blocked per specific ref (branch). An Approval Rule enforces approval at PR merge time and is not a feature that blocks direct pushes. In practice, A is combined with an Approval Rule Template.

---

**Question 6.** You built an automatic build system triggered by PR creation with CodeCommit + EventBridge. The same PR notification occasionally occurs twice. What is the most suitable solution?

A) Delete the EventBridge rule and recreate it to reset the rule state that was causing duplicate delivery
B) In Lambda, dedup with a DynamoDB conditional put using `pullRequestId + sourceCommit` as the key
C) Replace EventBridge with SNS and guarantee single delivery with the deduplication feature of a FIFO topic
D) Set the EventBridge target's retry policy to 0 and shorten the maximum event age

**Answer: B**
Explanation: EventBridge has at-least-once delivery, so duplicates are possible. The standard pattern is idempotency handling on the consumer side. A DynamoDB conditional write is the safest. D is an option that cannot be set directly in EventBridge.

---

**Question 7.** You want to replicate a CodeCommit repository from us-east-1 to us-west-2 for DR. What is the most suitable pattern?

A) CodeCommit provides automatic cross-region replication for Region failures, so no additional work is needed
B) EventBridge `referenceUpdated` → Lambda → mirror to CodeCommit in the other Region with `git push --mirror`
C) Enable Cross-Region Replication on the S3 that holds the repository data and replicate the objects to us-west-2
D) Replicate the repository metadata with an RDS Cross-Region Read Replica and serve reads from the DR Region

**Answer: B**
Explanation: CodeCommit has no native cross-region support. Lambda mirroring is the standard. The mirror destination must block pushes (read-only) with a Resource Policy to prevent data from being overwritten.

---

**Question 8.** You need to access AWS resources from GitHub Actions. What is the safest authentication method?

A) Create a dedicated IAM User, store long-term Access Keys in GitHub Secrets, and rotate them every 90 days
B) Put the root account's credentials in GitHub Secrets for broad access to all AWS resources
C) Register GitHub OIDC in the AWS IAM Identity Provider + a condition `sub=repo:org/repo:ref:refs/heads/main` in the IAM Role trust policy → AssumeRoleWithWebIdentity with `aws-actions/configure-aws-credentials@v4`
D) Register one EC2 instance as a self-hosted GitHub runner and access resources with Instance Profile permissions

**Answer: C**
Explanation: OIDC + Role assumption is the standard. No static keys → zero leak risk. The `sub` condition in the trust policy can restrict access to a specific repo/branch. A carries a risk of key exposure.

---

**Question 9.** You want to create an Approval Rule Template and apply it to 30 repositories in bulk. What is the most efficient way?

A) Manually create the same approval rule in each of the 30 repositories' consoles and update all of them whenever it changes
B) Create one Approval Rule Template at the account level → call the `AssociateApprovalRuleTemplateWithRepository` API for all repositories (a loop or IaC)
C) Upload an approval policy file to S3 and have each repository poll that file at merge time to evaluate the rule
D) Use a Step Functions workflow to dynamically evaluate approval conditions for every PR and decide whether to allow the merge

**Answer: B**
Explanation: The Approval Rule Template is deliberately designed to be defined at the account level and separated from repository association. This is exactly the design for this scenario.

---

**Question 10.** It is known that CodeCommit has been sunset. Our company has used CodeCommit for 5 years and needs a repo for a new microservice. What is the most accurate fact?

A) With new sign-ups halted, even existing users are blocked from creating additional repos and a GitHub migration is forced
B) Existing users can continue normal use, including creating new repos
C) Even existing customers must obtain an exception approval through an AWS Support ticket to create a new repo
D) Under the sunset policy, existing repos are automatically switched to read-only after a grace period

**Answer: B**
Explanation: Only new customer sign-ups were halted after 2024-07-25. Existing customers have all features working normally, including creating new repos. This is a subtle boundary frequently asked about on the exam.

---

## 📌 Today's Summary

The value of CodeCommit is not the outer shell of "Git hosting made by AWS" but the **combination of the Git protocol with IAM/STS**. This combination makes possible all of the following: ① the four authentication methods, ② native EventBridge events, ③ Approval Rule Templates, and ④ multi-account Resource Policy patterns. Although migration scenarios have increased since new sign-ups were halted in 2024, it remains a frequently tested area on the exam, and it is also good to learn the newly emerging GitHub OIDC federation pattern together. Tomorrow we look more deeply at the Git workflow itself (trunk-based vs GitFlow) and branching strategies on top of CodeCommit.
