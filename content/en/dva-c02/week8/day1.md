# Day 1 - CodeCommit and CodeBuild: The First Two Squares of CI/CD as Drawn by AWS

Developers who first encounter the term "CI/CD" usually start with "I've set up Jenkins once." But after experiencing a build server going down, build queues backing up, or build scripts only working on one person's laptop, the thought naturally arises: "I wish someone would do this for me." The AWS Code* series is exactly a bundle of services aimed at that exact point. CodeCommit handles Git hosting, CodeBuild handles build execution, CodePipeline handles flow orchestration, and CodeDeploy handles deployment. This article looks deeply at the first two squares of that 4-step pipeline — source storage and build execution.

The weight these two services carry in the DVA-C02 exam is not insignificant. The exam continues to ask about operational principles, authentication methods, and buildspec.yml syntax even after AWS stopped accepting new CodeCommit signups in July 2024. The reason is simple — AWS's IAM-integrated Git model and buildspec.yml's phase structure are standard vocabulary reused almost identically whether you go to GitHub Actions, GitLab CI, Bitbucket Pipelines, or anywhere else after passing the exam.

## The Problem CodeCommit Aimed to Solve

When CodeCommit launched in July 2015, GitHub Enterprise's self-hosted license was approaching $250 per user annually, and GitLab was just entering the self-hosted market. AWS saw clearly that customers in finance, government, and healthcare existed who found "keeping enterprise code in external SaaS" problematic for compliance reasons. CodeCommit arrived with the promise of "a Git repository inside your AWS account, authenticated with IAM, encrypted with KMS, with audit logs via CloudTrail."

The core value proposition was threefold: ① **Unlimited scaling**: No limits on repository size or file count (in practice). ② **IAM integration**: Controlling push/pull permissions via existing IAM policy without separate user systems. ③ **Automatic encryption**: Enabled by default on both transit (HTTPS/SSH) and storage (KMS).

> 💡 **Related theory**: The Git protocol originally supports three wire protocols: SSH, HTTPS, and git://. CodeCommit intentionally blocks git:// (port 9418) because git:// **provides neither authentication nor encryption** — it is a plaintext protocol. When Linus Torvalds designed git, he created this protocol for fast read-only mirroring over LAN, but in a cloud environment the security model breaks down. The fact that CodeCommit supports only SSH + HTTPS(SigV4) is the result of this threat model analysis.

> 🔍 **Going deeper**: CodeCommit's IAM integration is not merely "a user exists in IAM" but rather **each git operation (push, pull, branch creation) maps 1:1 to an IAM action**. For example, `git push origin main` internally invokes the `codecommit:GitPush` action, and you can attach a condition like `aws:ResourceTag/branch=main` to prevent a specific user from directly pushing to the main branch. This is one level deeper enforcement at the IAM layer compared to GitHub's branch protection rules, which was the differentiation point.

```bash
# IAM policy blocking direct push to main branch
{
  "Effect": "Deny",
  "Action": "codecommit:GitPush",
  "Resource": "arn:aws:codecommit:ap-northeast-2:111122223333:my-repo",
  "Condition": {
    "StringEqualsIfExists": {
      "codecommit:References": ["refs/heads/main"]
    },
    "Null": {
      "codecommit:References": false
    }
  }
}
```

However, on July 25, 2024, AWS **halted new customer signups** for CodeCommit. Existing customers can continue using it, and it remains on exams, but AWS has essentially announced its retreat from market competition. The background is the growth of GitHub's (acquired by Microsoft in 2018) and GitLab's SaaS market share, combined with GitHub Actions absorbing CI, reducing the demand for "Git hosting as a separate service."

> 📚 **Case study**: AWS did not explicitly state this in their official announcement, but AWS internal teams are known to have moved to GitHub Enterprise Cloud. At re:Invent 2023 keynote, AWS announced CodeCatalyst, a new unified DevOps platform, which is positioning itself as the successor to CodeCommit + CodeBuild + CodePipeline + Cloud9. CodeCatalyst hasn't been heavily featured on exams yet, but it will likely be coming soon.

## Three Authentication Methods for CodeCommit

To use git with CodeCommit, you must pass authentication. There are three methods, and since the exam asks about them each time, here's how they differ.

| Method | Credential Form | Refresh Cycle | Best Use |
|--------|---------|----------|-------------|
| **SSH Public Key** | SSH public key registered with IAM user | Permanent (until developer rotates key) | Individual developer workstation |
| **Git Credentials** (HTTPS) | Username/password generated per IAM user | Permanent (until disabled in IAM) | 2 pairs per user maximum, simple GUI clients |
| **AWS Credential Helper** (HTTPS) | IAM access key → SigV4 signature per request | Renewed per git operation | EC2/Lambda/CodeBuild instance roles |

> ⚠️ **Trap**: The reason the answer to "Can you log into CodeCommit with username/password directly?" is No is here. HTTPS Git Credentials are **a separate username/password issued by IAM**, not the IAM console login password. That is, if an IAM user has "only a console password without Git Credentials issued," git push is impossible. In the exam, answers like D) "input username/password directly" are almost always incorrect.

```bash
# 1) SSH method
ssh-keygen -t ed25519 -C "dev@example.com"
# Upload the generated public key to IAM user → Security credentials → SSH keys for AWS CodeCommit
# Map the returned SSH Key ID (e.g., APKAEIBAERJR2EXAMPLE) in SSH config

# ~/.ssh/config
Host git-codecommit.*.amazonaws.com
  User APKAEIBAERJR2EXAMPLE
  IdentityFile ~/.ssh/codecommit_rsa

git clone ssh://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/my-repo

# 2) Credential Helper (frequently used on EC2/CodeBuild)
git config --global credential.helper '!aws codecommit credential-helper $@'
git config --global credential.UseHttpPath true
git clone https://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/my-repo
# Internally aws-cli creates a SigV4 signature and passes it each time as a new temporary password
```

> 🔍 **Going deeper**: The Credential Helper's operation is the SigV4 signature itself. When git sends username/password in the HTTPS basic auth header, the helper fills in the username as the IAM access key ID and the password as a signature string created with the `AWS4-HMAC-SHA256` algorithm. Since the signature includes a timestamp, a different password is generated with each request. This is the secret by which EC2 instance profiles or Lambda execution roles can automatically access CodeCommit — even when temporary credentials rotate, the helper creates a new signature each time.

## CodeBuild's Internal Structure: Building a Build Environment on Top of Docker

CodeBuild is, in short, "running the commands written in buildspec.yml inside an AWS-provided container, such that the build disappears after it completes." Several design decisions are hidden in that short sentence.

First, **each build runs in a fresh container**. If build hosts were reused, dependency caching would be faster, but environment pollution (files left by other builds, environment variables) would occur. CodeBuild prioritizes isolation and boots a new container per build. The trade-off is startup latency (typically 10-30 seconds). This is the opposite of Jenkins agent's "long-running worker" model.

Second, **build images are either AWS managed images or custom ECR images**. AWS managed images are based on Amazon Linux 2 / Ubuntu with major runtimes (Node, Python, Java, Go, .NET, Docker, etc.) pre-installed. With custom images, CodeBuild pulls from ECR and starts the build — this pull time is additional, so choosing a small base image is important.

Third, **compute options are very diverse**.

| Compute Type | vCPU | Memory | Disk | Approximate Price per Hour |
|--------------|------|--------|--------|------------------|
| BUILD_GENERAL1_SMALL | 3 | 3GB | 64GB | $0.005 |
| BUILD_GENERAL1_MEDIUM | 4 | 7GB | 128GB | $0.01 |
| BUILD_GENERAL1_LARGE | 8 | 15GB | 128GB | $0.02 |
| BUILD_GENERAL1_2XLARGE | 72 | 145GB | 824GB | $0.20 |
| BUILD_LAMBDA_*** (2023~) | 1-10 | 1-10GB | Temporary | Very inexpensive |

> 💡 **Related theory**: CodeBuild's **Lambda-based compute** option announced in late 2023 reduces build startup to under 1 second. Internally, it runs the build container on Lambda's Firecracker microVM. Firecracker is a microVM monitor that AWS open-sourced in 2018, designed to boot virtual machines in under 100ms on KVM (used internally in Lambda and Fargate). It's ideal for work like builds that is "short and frequently occurring." The downside is memory ceilings and disk limits, making it unsuitable for large monorepo builds.

> 🔍 **Going deeper**: To use Docker in the build container, CodeBuild requires the `privileged: true` flag. This is the **Docker-in-Docker** (DinD) pattern of running containers inside containers, which weakens isolation by one level (containers can access host devices from inside). While commonly used when pushing Docker images to ECR after a build, AWS instead recommends using daemon-less builders like **kaniko** or **buildah**.

## buildspec.yml: The Constitution of a CI Pipeline

buildspec.yml defines all CodeBuild behavior. The most frequently tested part of the exam is phase order and each phase's responsibility.

```yaml
version: 0.2   # Currently the only stable version (0.1 is deprecated)

env:
  variables:
    NODE_ENV: production
  parameter-store:
    GITHUB_TOKEN: /myapp/github/token    # Plaintext/SecureString from SSM
  secrets-manager:
    DOCKER_REGISTRY_PW: prod/docker:password    # Specific JSON field possible
  exported-variables:
    - IMAGE_TAG    # Pass to subsequent CodePipeline stages

phases:
  install:
    runtime-versions:
      nodejs: 20
      docker: 24
    commands:
      - npm ci

  pre_build:
    commands:
      - echo "Login to ECR"
      - aws ecr get-login-password | docker login --username AWS --password-stdin $REPO_URI
      - export IMAGE_TAG=$(git rev-parse --short HEAD)
      - npm test -- --reporters=default --reporters=jest-junit

  build:
    commands:
      - docker build -t $REPO_URI:$IMAGE_TAG .
      - docker push $REPO_URI:$IMAGE_TAG

  post_build:
    commands:
      - printf '[{"name":"app","imageUri":"%s"}]' $REPO_URI:$IMAGE_TAG > imagedefinitions.json

artifacts:
  files:
    - imagedefinitions.json
    - appspec.yml
    - taskdef.json
  discard-paths: yes

reports:
  jest_reports:
    files:
      - 'junit.xml'
    file-format: JUNITXML

cache:
  paths:
    - 'node_modules/**/*'
    - '/root/.npm/**/*'
```

Clearly separating each phase's responsibility is a good pattern.

| Phase | Responsibility | Failure Behavior |
|-------|------|-------------|
| `install` | Runtime + OS package installation | Build fails, subsequent phases skipped |
| `pre_build` | Authentication, variable export, static validation, unit tests | Build fails, build/post_build skipped |
| `build` | Actual compile, bundle, image build | Build fails, post_build **still runs** |
| `post_build` | Push, tag, Slack notification, artifact metadata generation | Build fails marked |

> ⚠️ **Trap**: The point that `build` phase failure still runs `post_build` comes up once per exam. This behavior enables "Slack notification on build failure" to be handled in `post_build`, but conversely, a push command written assuming "build success" can malfunction. In `post_build` it is a safe pattern to always check the `CODEBUILD_BUILD_SUCCEEDING` environment variable (0/1) and branch accordingly.

```bash
# Safe branching in post_build
- |
  if [ "$CODEBUILD_BUILD_SUCCEEDING" = "1" ]; then
    aws sns publish --topic-arn $TOPIC --message "Build OK: $CODEBUILD_BUILD_ID"
  else
    aws sns publish --topic-arn $TOPIC --message "Build FAILED: $CODEBUILD_BUILD_ID"
  fi
```

> 💡 **Related theory**: buildspec.yml's phase model traces back to GNU Make's target dependency graph or Apache Maven's build lifecycle (validate → compile → test → package → install → deploy). The thought pattern of "explicitly separating stages and isolating each stage's output and responsibility" has barely changed since 1977 when Stuart Feldman created make at Bell Labs. GitHub Actions' jobs/steps and CircleCI's stages use the same model too.

## Safe Injection of Environment Variables and Secrets

Everything written as plaintext in buildspec.yml risks exposure in build logs. CodeBuild supports three variable sources.

| Source | Safety | Rotation | Exam Keyword |
|--------|--------|------|-------------|
| `variables` (plaintext) | Low | Manual | General config values, environment distinction |
| `parameter-store` | Safe if using SecureString | Manual or Lambda automation | Passwords, API keys |
| `secrets-manager` | Safe | Automatic rotation supported | DB credentials, OAuth tokens |

```yaml
env:
  parameter-store:
    DB_HOST: /myapp/db/host           # Plaintext String parameter
    DB_PASSWORD: /myapp/db/password   # SecureString → KMS decryption
  secrets-manager:
    OAUTH: prod/google-oauth:client_secret    # Specific field from JSON
```

> 🔍 **Going deeper**: Specifying a key after the colon in `secrets-manager` extracts only that field from the JSON secret. For example, if the secret is `{"username":"admin","password":"abc123"}`, `myapp:password` gets only the password. Additional stage/version specification like `:AWSCURRENT:1` is also possible. This syntax doesn't appear on exams but is commonly used in practice.

> ⚠️ **Trap**: Environment variables in CodeBuild build logs are usually masked, but running a command like `echo $SECRET` by mistake will print it as-is. Also, if build artifacts (artifact zip) contain files with environment variables embedded, they go up to S3 as-is. Since AWS preserves build logs permanently in CloudWatch Logs after build completion, once a secret is exposed, rotation is practically the only mitigation.

## VPC Integration and Network Isolation

By default, the CodeBuild container runs in an AWS managed VPC where internet outbound is free, but it cannot access private resources in your VPC (e.g., private subnet RDS, in-house NAS). If private resource access is needed, CodeBuild is run in **VPC mode**.

```bash
aws codebuild create-project \
  --name my-build \
  --vpc-config "vpcId=vpc-xxx,subnets=subnet-aaa,subnet-bbb,securityGroupIds=sg-xxx" \
  ...
```

VPC mode trade-off: Internet outbound disappears, so explicit routing via NAT Gateway or VPC Endpoint is required. ECR pull, S3 artifact upload, CloudWatch Logs send, Secrets Manager fetch — all require endpoints. Build startup also takes an additional 30 seconds to 1 minute due to ENI (Elastic Network Interface) provisioning.

> 📚 **Case study**: A financial customer case. Due to in-house policy, the build host couldn't access the external npm registry directly, so they registered npmjs.org as upstream in CodeArtifact and configured access only via the VPC endpoint to CodeArtifact. Result: all npm installs in the build environment were logged in the company audit logs, and unauthorized external package adoption was blocked. The CodeBuild VPC mode + CodeArtifact combination is one pattern for supply chain security.

## Build Cache: The Fastest Way to Buy Time

`npm ci` or `pip install` often takes up 70% of build time. CodeBuild supports three cache modes.

| Mode | Storage | Sharing Scope | Suitability |
|------|----------|----------|--------|
| **NO_CACHE** | - | - | One-off builds, security-sensitive |
| **LOCAL** | Build host disk | Subsequent builds of same project (when host reused) | Repeat builds within short time |
| **S3** | User S3 bucket | All builds permanent sharing | Build acceleration regardless of quarter/hour |

LOCAL mode has three sub-options:

- `DOCKER_LAYER_CACHE`: Layer cache for Docker image builds. Requires `privileged: true`.
- `SOURCE_CACHE`: Git metadata cache. Shallow clone effect.
- `CUSTOM_CACHE`: Paths specified in `cache.paths`.

> 🔍 **Going deeper**: LOCAL cache only works when "the same build host is reassigned," and CodeBuild keeps hosts in a warm pool for a certain time after build completion before reusing them. That is, projects with frequent builds have high LOCAL cache hit rate, while idle projects almost always miss. LOCAL is sufficient for 24/7 production CI/CD, but for builds running only at night/weekends, S3 cache is more stable.

## CodeCommit Triggers vs Notifications

When an event occurs in CodeCommit, there are two ways to notify.

| Aspect | Triggers | Notifications |
|--------|----------|---------------|
| Target | SNS, Lambda direct invocation | EventBridge → SNS, AWS Chatbot(Slack/Chime) |
| Filtering | Branch/path matching | Event type (PR creation, comment, push, etc.) |
| Limit | 10 per repository | Virtually unlimited |
| Launch Time | Exists from beginning | 2019 (after Notifications integration) |
| Exam Keyword | "Invoke Lambda on specific branch push" | "Slack notification on PR creation, comment, merge" |

> ⚠️ **Trap**: In the exam, if "Slack channel notification when PR is created" appears, the answer is **Notifications + AWS Chatbot**, not Triggers. Triggers support only SNS/Lambda, so to reach Slack you need to go through one additional Lambda step to call a webhook. Notifications natively integrate Slack/Chime via Chatbot.

## Comparison with Other CI Services

| Dimension | CodeBuild | GitHub Actions | GitLab CI | Jenkins |
|-----------|-----------|----------------|-----------|---------|
| Hosting Model | Fully managed | SaaS or self-hosted runner | SaaS or self-hosted runner | self-hosted (or CloudBees SaaS) |
| Pricing | Per build minute | Per minute (public free) | Per minute (limited free) | License free, infrastructure cost |
| Build Definition | buildspec.yml | .github/workflows/*.yml | .gitlab-ci.yml | Jenkinsfile |
| IAM Integration | Native | OIDC for AWS temporary credentials | OIDC | Plugin |
| Marketplace | Limited | Very active (Actions Marketplace) | Active | 13,000+ Plugins |
| Build Isolation | Fresh container per build | Fresh runner per job | Fresh runner per job | Worker reusable |

> 💡 **Related theory**: With GitHub Actions' rise, CodeBuild's market share has declined, but in workflows where **AWS resources are extensively touched during build** (ECR push, CodeDeploy deploy, CloudFormation stack changes), IAM integration makes CodeBuild still superior. Since 2022, GitHub Actions can receive IAM temporary credentials via OIDC, narrowing the gap.

## Hands-On with CLI

```bash
# 1) Create CodeCommit repository (existing customers only)
aws codecommit create-repository \
  --repository-name my-app \
  --repository-description "Sample app"

# 2) Create CodeBuild project
aws codebuild create-project \
  --name my-app-build \
  --source type=CODECOMMIT,location=https://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/my-app \
  --artifacts type=S3,location=my-artifact-bucket \
  --environment type=LINUX_CONTAINER,image=aws/codebuild/standard:7.0,computeType=BUILD_GENERAL1_SMALL \
  --service-role arn:aws:iam::111122223333:role/CodeBuildServiceRole

# 3) Start build
aws codebuild start-build --project-name my-app-build

# 4) Tail build logs in real-time (CloudWatch Logs)
aws logs tail /aws/codebuild/my-app-build --follow
```

## Wrapping Up

The problem CodeCommit aimed to solve was "IAM-integrated Git hosting suited to enterprise environments," and that value remains valid, but the market has shifted to GitHub. The problem CodeBuild aimed to solve was "finish CI with one buildspec instead of managing build infrastructure directly," and for workloads deeply integrated with AWS resources, this remains a reasonable choice.

Next article, we look at the two squares behind these — **CodeDeploy** and **CodePipeline**. How to safely flow build artifacts to EC2, Lambda, and ECS, how blue/green and canary are implemented differently, and the pattern of managing the pipeline itself as code.

---

## 📝 연습 문제

**문제 1.** Which of the following is NOT a supported authentication method for CodeCommit?

A) SSH key
B) HTTPS Git Credentials
C) AWS Credential Helper (SigV4)
D) Direct input of IAM console login password

**정답: D**

해설: CodeCommit supports three methods: SSH public key, HTTPS Git Credentials (IAM-issued username/password), and AWS Credential Helper (SigV4 signature per request). The IAM console login password cannot be used for git authentication — Git Credentials must be issued separately. This is why "direct username/password input" is the wrong answer. On EC2/Lambda and similar instance environments, C) Credential Helper is the best fit, as it uses the instance profile's temporary credentials to create a SigV4 signature for each git operation.

---

**문제 2.** Which phase in buildspec.yml **continues to run even if the build phase fails**? (EC2 In-Place basis)

A) install
B) pre_build
C) build
D) post_build

**정답: D**

해설: The key is that ApplicationStop runs **the script from the previous revision**, making it the very first phase regardless of how the new revision's other phases fail. If ApplicationStop fails, that instance's deployment is marked failed but subsequent phases are not affected. B/C/D are all downstream phases and are skipped if earlier phases fail. When "ApplicationStop's special nature" appears on the exam, "previous revision's script runs" is the answer.

---

**문제 3.** A Lambda function triggering CodeBuild during burst traffic encounters burdensome 10-30 second container boot times per build, both cost and time. What is the most suitable solution?

A) Switch to larger BUILD_GENERAL1_2XLARGE
B) Switch to BUILD_LAMBDA compute type
C) Enable Local cache
D) Set privileged: true in build container

**정답: B**

해설: The BUILD_LAMBDA compute type introduced in late 2023, based on Firecracker microVM, reduces build startup to under 1 second. Ideal for short, frequently occurring build workloads (e.g., PR validation, lint checks). A) Larger instances might actually slow startup and definitely increase costs. C) Local cache only helps with dependency caching when the host is reused, doesn't reduce startup itself. D) privileged mode is for Docker-in-Docker and unrelated to this problem. Note that Lambda compute has memory/disk limits unsuitable for large monorepo builds.

---

**문제 4.** A CodeBuild project needs to use a DB access password during builds. What is the safest approach?

A) Write plaintext variable in buildspec.yml
B) Set as CodeBuild project environment variable (Plaintext)
C) Store in Secrets Manager and reference via `secrets-manager:` key
D) Store in S3 text file and download during build

**정답: C**

해설: Secrets Manager provides ① automatic KMS encryption ② automatic rotation (native support for RDS, Redshift, DocumentDB) ③ CloudTrail audit ④ extracting only specific JSON fields (`mysecret:password` syntax). While SSM Parameter Store SecureString offers similar protection, automatic rotation is Secrets Manager's strength. A) Plaintext means the secret is permanently recorded in the git repository — worst anti-pattern. B) Plaintext environment variables expose in console. D) S3 files risk exposure if bucket policy omits permission + no automated rotation.

---

**문제 5.** A CodeBuild project needs to run a migration script on a private subnet RDS instance. What additional configuration is required?

A) No additional config needed (CodeBuild can access all VPCs by default)
B) Switch CodeBuild project to VPC mode and specify appropriate subnet + security group
C) Change RDS to public
D) Access RDS through Lambda

**정답: B**

해설: By default CodeBuild runs in AWS managed VPC and cannot access private resources in your VPC. Switching to VPC mode creates ENI in specified subnet, enabling private resource access. Trade-off: ① ENI provisioning adds +30s to 1m startup ② internet outbound disappears → ECR/S3/CloudWatch Logs/Secrets Manager each need VPC endpoints ③ without NAT Gateway, can't download external packages. C) Exposing RDS publicly is security anti-pattern. D) Lambda bypass is unnecessary complexity. When "CodeBuild accesses private resources" appears on exam, VPC mode is the answer.

---

**문제 6.** To send Slack channel notification whenever Pull Request is created in CodeCommit, what is the most suitable configuration?

A) CodeCommit Triggers → Slack Incoming Webhook
B) CodeCommit Notifications → AWS Chatbot → Slack
C) CodeCommit Triggers → SNS → Slack email subscription
D) CloudWatch Events → Direct Slack call

**정답: B**

해설: CodeCommit Notifications based on EventBridge provides rich event filtering (PR creation, comments, merge, push, etc.) and AWS Chatbot **natively integrates** Slack/Chime. Messages go to channel without additional Lambda. A) Triggers support only SNS/Lambda, so reaching Slack requires additional Lambda + webhook code — inefficient. C) SNS email subscription goes to personal email, not Slack channel. D) CloudWatch Events cannot directly call Slack. When "Slack notification + minimum code" appears on exam, Notifications + Chatbot is the answer.

---

**문제 7.** In buildspec.yml v0.2, to pass a variable to subsequent CodePipeline stages, which item should be used?

A) `env.variables`
B) `env.exported-variables`
C) `artifacts.files`
D) Save to SSM in `phases.post_build.commands`

**정답: B**

해설: Variables listed in `exported-variables` become accessible to the next CodePipeline stage using the `#{BuildVariables.VAR_NAME}` syntax at build end. When a dynamically-determined value (e.g., `IMAGE_TAG=$(git rev-parse --short HEAD)`) needs to flow to the deploy stage, this is the standard pattern. A) variables is simple static variable definition. C) artifacts is for file artifact passing, not variable passing. D) Saving to SSM is possible but requires separate permissions and fetch logic in the downstream stage — inefficient. When "CodeBuild → CodeDeploy/CodePipeline variable passing" appears on exam, exported-variables is the answer.
