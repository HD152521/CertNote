# Day 1 - The Real Meaning of buildspec.yml: The Moment a Pipeline Specification Becomes Code

Before the idea of CI infrastructure — the forerunner of CodeBuild — was first mentioned at AWS re:Invent in 2011, AWS users typically either ran Jenkins directly on EC2 or used an external SaaS CI service. The problem was that Jenkins was "a server you had to install." You had to manage the server, plugins conflicted, and when the build queue backed up you had to upgrade to a bigger instance. When CodeBuild was officially released in 2016, AWS took a different approach — spin up the build environment itself as a container, and throw it away when the build finishes. And "how do we build this" was to be captured in a single file called `buildspec.yml`.

This is the CodeBuild version of Pipeline-as-Code. Understanding buildspec.yml isn't simply memorizing YAML syntax. It's understanding the philosophy that "the build procedure becomes code," and grasping how security, caching, artifacts, and test visualization interlock on top of it.

## The Full Structure of buildspec.yml: A Build Contract You Can Read in One File

```yaml
version: 0.2  # 0.1 was deprecated in 2017. Always use 0.2.

env:
  variables:
    NODE_ENV: production          # plaintext environment variable
  parameter-store:
    DB_HOST: /myapp/prod/db-host  # SSM Parameter Store fetch
  secrets-manager:
    DB_PASS: prod/db:password::AWSCURRENT
    #         secretId:jsonKey:versionStage:versionId
  exported-variables:
    - BUILD_ID                    # passed to the next Pipeline Stage

phases:
  install:
    runtime-versions:
      nodejs: 20
      python: 3.11
    commands:
      - npm ci
  pre_build:
    commands:
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR
  build:
    commands:
      - docker build -t myapp:$CODEBUILD_BUILD_NUMBER .
  post_build:
    commands:
      - docker push $ECR/myapp:$CODEBUILD_BUILD_NUMBER
    on-failure: ABORT

reports:
  unit-tests:
    files: ['reports/junit-*.xml']
    file-format: JUNITXML

artifacts:
  files:
    - dist/**/*
    - appspec.yml
  base-directory: build
  secondary-artifacts:
    docs:
      files: docs/**/*

cache:
  paths:
    - node_modules/**/*
    - /root/.m2/**/*
```

`version: 0.2` looks trivial but it actually matters. 0.1 and 0.2 differ in environment-variable naming rules and in some phase behaviors. Since 2017, official AWS documentation only describes 0.2, and the exam assumes 0.2 as well.

> 💡 **Related theory**: buildspec.yml is a **declarative build definition**. Where a Makefile is imperative in style ("run these commands in order"), buildspec takes the form of a contract: "in this phase, these commands must run." This philosophy sits in the same lineage as Kubernetes Pod specs and Docker Compose. All of them follow the paradigm of "describe the desired state and the system achieves it."

> 🔍 **Going deeper**: buildspec.yml is version-controlled. Put it at the root of the code repository and `git blame` tracks "when and by whom the build procedure was changed." The biggest problem with pre-2015 Jenkins GUI pipelines was that configuration lived in the Jenkins database and could not be version-controlled. buildspec.yml solves that problem — the build procedure becomes subject to PR review.

## Phase Execution Order and Failure Handling: The Logic of the Container Lifecycle

CodeBuild spins up a new container for a single build, runs it in the following order, and deletes the container when it's done.

```
[Container Provision] → [Source Download] → [Restore Cache]
  → install → pre_build → build → post_build
  → [reports] → [artifacts] → [Save Cache]
  → [Container Terminate]
```

| Phase | Default behavior on failure | How to change | Practical use |
|--------|-------------------|-----------|-----------|
| install | ABORT (later phases skipped) | `on-failure: CONTINUE` | runtime install failure = build is meaningless |
| pre_build | ABORT | same | ECR login, environment validation |
| build | **post_build still runs** | `on-failure: ABORT/CONTINUE` | actual build, tests |
| post_build | affects the build result | same | push, artifact cleanup |

The reason `post_build` runs even when the `build` phase fails is for "cleanup code." Work such as Docker logout, temporary file cleanup, and failure notifications must always happen regardless of whether the build succeeded.

```yaml
post_build:
  commands:
    - docker push $ECR/myapp:$IMAGE_TAG
  finally:                          # always runs, success or failure
    - docker logout $ECR
    - echo "Build complete: $CODEBUILD_BUILD_ID"
```

A `finally` block can be placed inside each phase. This means exactly the same thing as Java's `try-finally` — execution is guaranteed regardless of whether an exception occurred.

> ⚠️ **Pitfall**: If you set `on-failure: CONTINUE` on the `build` phase, the pipeline can keep going even when the build fails. Incidents where a test failure is ignored and the change goes all the way to deployment originate from this setting. `on-failure` should only be used for "CONTINUE for resource cleanup"; for core build steps, the default (ABORT) is correct.

> 💡 **Related theory**: The phase order maps exactly onto the traditional stages of a software build. **Configure → Compile → Test → Package** maps to install → build → post_build. pre_build comes from the CI/CD best practice of "precondition validation" — first verify the environment is correct, then start the real work.

## Three Tiers of Environment Variables: The Layered Structure of Security

| Method | Store | Exposure scope | IAM permission |
|------|--------|-----------|----------|
| `env.variables` | plaintext in buildspec | can be exposed in logs | none |
| `env.parameter-store` | SSM Parameter Store | not exposed in logs | `ssm:GetParameter` |
| `env.secrets-manager` | Secrets Manager | never exposed in logs | `secretsmanager:GetSecretValue` + `kms:Decrypt` |

```yaml
env:
  parameter-store:
    DB_HOST: /myapp/prod/db-host          # String or SecureString
  secrets-manager:
    DB_PASS: prod/db-secret:password::AWSCURRENT
    #         ^secret-id  ^json-key ^version-stage
    API_KEY: prod/api-key
```

In the Secrets Manager reference format `secret-id:json-key:version-stage:version-id`, the `json-key` extracts a specific field when the secret is in JSON form. For a secret of `{"username":"admin","password":"secret123"}`, `prod/db:password` extracts only `secret123`.

The CodeBuild Service Role needs two permissions:
1. `secretsmanager:GetSecretValue` — retrieve the secret value
2. `kms:Decrypt` — decrypt a secret encrypted with a CMK (Customer Managed Key)

If you use the AWS managed key (`aws/secretsmanager`) instead of a CMK, `kms:Decrypt` is implicitly allowed; but in organizations whose security policy mandates CMKs, a missing version of this permission is the single most common cause of failure.

> 🔍 **Going deeper**: Secrets Manager environment-variable injection happens exactly once, at build start. Even if the secret rotates while the build runs for 30 minutes, the value already loaded into memory does not change. However, if code calls `GetSecretValue` again via the SDK during the build, it receives the new value. In environments where the secret rotation period overlaps with build duration, this distinction matters.

> 📚 **Case study**: The 2019 Capital One data breach was caused by credential theft through the EC2 metadata service. After that incident, AWS made IMDSv2 mandatory and pushed Secrets Manager even harder as the standard for "never putting credentials in code." buildspec's `env.secrets-manager` is precisely the practical tool of that lesson — a structural enforcement that makes it impossible for a developer to write a password directly into the buildspec.

## The Reports Block: Managing Test Results Alongside Code

```yaml
reports:
  pytest_reports:
    files: ['reports/pytest.xml']
    file-format: JUNITXML         # JUNITXML, NUNITXML, CUCUMBERJSON, TESTNGXML, VISUALSTUDIOTRX
  coverage:
    files: ['coverage.xml']
    file-format: COBERTURAXML     # COBERTURAXML, JACOCOXML, CLOVERXML, SIMPLECOV
```

Supported formats:
- Test results: JUnitXML, NUnitXML, CucumberJSON, TestNG XML, VisualStudio TRX
- Code coverage: Clover, Cobertura, JaCoCo XML, SimpleCov

When the Reports block is present, the CodeBuild console gains per-build Pass/Fail visualization and history tracking. The difference between "printing test results as text in a log" and "tracking them as structured reports" in a CI pipeline is exactly this block.

> 💡 **Related theory**: Structured test reports implement the software-engineering principle of **Test Visibility**. Jez Humble's "Continuous Delivery" (2010) stresses that "test results must be immediately visible to every team member." A text log has to be parsed by a human, but JUnit XML is aggregated automatically by tooling. Measuring the DORA 4 metrics' "Change Failure Rate" also requires this kind of structured data to be automated.

## The Artifacts Block: The Flow of Build Outputs

```yaml
artifacts:
  files:
    - 'dist/**/*'
    - appspec.yml
    - taskdef.json
  name: build-$(date +%Y%m%d-%H%M%S)   # custom S3 object key
  base-directory: build                  # relative paths are based on this directory
  discard-paths: no                      # yes ignores the directory structure
  secondary-artifacts:
    sourcemap:
      files: '**/*.map'
      base-directory: build/source-maps
    sbom:
      files: 'sbom.json'
```

The primary artifact flows to the next Stage of CodePipeline (`InputArtifact`). Secondary artifacts are stored in a separate S3 location and are used for analysis, auditing, and documentation.

The pattern of exporting an SBOM (Software Bill of Materials) as a secondary artifact has recently become important because of SLSA (Supply chain Levels for Software Artifacts) compliance. Since the 2021 US executive order (EO 14028) required SBOMs for software procured by the federal government, many companies have begun adopting automatic SBOM generation during the build as a standard.

> 💡 **Related theory**: The SLSA (Supply chain Levels for Software Artifacts) framework is a software supply-chain security model proposed by Google in 2021. Level 1 is "a build script exists and is version-controlled," Level 2 is "the build is reproducible and signed," Level 3 is "the build environment is isolated," and Level 4 is "fully reproducible and auditable." CodeBuild satisfies SLSA Level 2 by default — it runs in an isolated container, build logs are retained in CloudWatch, and the buildspec lives in Git.

## CODEBUILD_* Built-in Environment Variables: Accessing Build Context

| Variable | Meaning | Use |
|------|------|------|
| `CODEBUILD_BUILD_ID` | "project:uuid" format | build tracking ID |
| `CODEBUILD_BUILD_NUMBER` | integer incrementing from 1 | image tag |
| `CODEBUILD_BUILD_ARN` | build ARN | audit logs |
| `CODEBUILD_SOURCE_VERSION` | git SHA / tag / PR number | code tracking |
| `CODEBUILD_RESOLVED_SOURCE_VERSION` | the actually resolved git SHA | reproducibility guarantee |
| `CODEBUILD_WEBHOOK_TRIGGER` | "branch/main", "pr/42", etc. | conditional builds |
| `CODEBUILD_INITIATOR` | "user/dev" or "codepipeline/..." | origin tracking |

```yaml
pre_build:
  commands:
    - export IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
    # first 8 characters of the git SHA as the image tag — reproducibility and traceability at once
```

The difference between `CODEBUILD_SOURCE_VERSION` and `CODEBUILD_RESOLVED_SOURCE_VERSION`: the former may be a branch name like "main," while the latter is always the actual commit SHA. For image tags and artifact names, using the Resolved version is better for reproducibility.

## Build Batch: Expanding One Build Across Multiple Dimensions

Running builds in parallel, or as a dependency graph, is Build Batch.

```yaml
batch:
  fast-fail: true          # if one fails, abort the rest
  build-list:              # simple parallel (no dependencies)
    - identifier: build_arm
      env:
        compute-type: BUILD_GENERAL1_LARGE
        type: ARM_CONTAINER
        image: aws/codebuild/amazonlinux2-aarch64-standard:3.0
    - identifier: build_x86
      env:
        type: LINUX_CONTAINER
        image: aws/codebuild/amazonlinux2-x86_64-standard:5.0
  build-graph:             # dependency DAG (ordered)
    - identifier: lint
    - identifier: unit_test
    - identifier: integration_test
      depend-on: [unit_test]
    - identifier: package
      depend-on: [lint, integration_test]
  build-matrix:            # auto-generate variable combinations
    static:
      ignore-failure: false
    dynamic:
      buildspec:
        - build/node18.yml
        - build/node20.yml
      env:
        variables:
          ARCH: [amd64, arm64]
```

`build-list` is simple parallelism, `build-graph` defines dependencies as a DAG (Directed Acyclic Graph), and `build-matrix` automatically generates builds from the Cartesian product of variable combinations.

> 🔍 **Going deeper**: The dependency graph of Build Batch is implemented on top of **topological sort** from compiler theory. The way each build node waits for its dependency nodes to complete is the same algorithm as GNU Make's dependency handling. The difference is that CodeBuild runs each node as a separate container — there is no shared filesystem between nodes. So passing artifacts between nodes must go through S3, and this is why the S3 cache is especially important in Batch builds.

> 📚 **Case study**: As of 2022, Netflix runs thousands of builds per day. While standardizing multi-architecture images (ARM/x86), it aggressively adopted the Build Batch pattern. According to a blog post published by Netflix's "Metaflow" ML platform team (2023), after adopting ARM builds, build costs dropped by about 18% and inference performance improved on ARM-based EKS nodes. The lesson was that aligning build and runtime architectures increases the accuracy of performance measurement.

## Debug Session and Local Build: Two Ways to Dig Into Build Failures

**Debug Session (remote):**
```bash
# Start the build in debug mode
aws codebuild start-build \
  --project-name myproj \
  --debug-session-enabled

# Connect to the build container with SSM Session Manager
aws ssm start-session --target codebuild:<build-id>
```
The build pauses at the failing phase and you can connect to the container. Up to 7 hours.

**Local Build (local):**
```bash
# Run the same environment locally with the CodeBuild Agent
./codebuild_build.sh \
  -i aws/codebuild/standard:7.0 \
  -a /tmp/artifacts \
  -e .env.local
```
Same idea as GitHub Actions' `act` tool — reproduce the identical environment locally to debug CI failures.

> 🎯 **Scenario**: A team's build fails "only in CodeBuild" and succeeds locally. The order of root-cause investigation is (1) identify the failing phase in CloudWatch Logs → (2) connect to the container with a Debug Session and run the same commands manually → (3) check for environment-variable differences (`env | sort`) → (4) reproduce the buildspec.yml with a local Local Build. This sequence is the standard troubleshooting flow.

## Comparison with GCP Cloud Build: A Difference in Design Philosophy

| Item | AWS CodeBuild | GCP Cloud Build |
|------|--------------|-----------------|
| Config file | buildspec.yml | cloudbuild.yaml |
| Unit of execution | Phase (install/build/...) | Step (independent container) |
| Cache | S3 / Local Docker | GCS / Docker Layer |
| Secrets | Secrets Manager / Parameter Store | Secret Manager |
| Parallel builds | Build Batch (graph/list/matrix) | parallelism (step level) |
| ARM support | aarch64 standard images | arm machine types |
| VPC integration | Native (creates an ENI) | Private Pool |
| Pricing model | per-minute billing (by compute type) | per-minute billing (by machine type) |

The biggest philosophical difference: CodeBuild runs ordered stages called "phases" inside a single container. In Cloud Build, each "Step" is an independent container — extremely flexible, but file sharing between Steps must go through the `/workspace` volume. CodeBuild's phase model is simpler and doesn't carry the complexity of "you must manage state between Steps via a volume."

> 💡 **Related theory**: CodeBuild's phase-based model and Cloud Build's Step-based model reflect the software-engineering difference between **procedural and component-based** architectures. The procedural model is easy to understand but has low reusability; the component-based model has high reusability but comes with composition complexity. GitHub Actions took a third path with an ecosystem of reusable components at the "Action" level.

## exported-variables: Beyond Phases, Into Stages

```yaml
phases:
  build:
    commands:
      - export VERSION=$(cat version.txt)
      - export IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
env:
  exported-variables:
    - VERSION
    - IMAGE_TAG
```

In CodePipeline V2, the next Stage references these values as `#{BuildAction.IMAGE_TAG}`. For example, the ECS Action in a Deploy Stage can receive the image URI dynamically. This is not supported in V1 pipelines.

Why this matters: the entire pipeline gets to share "an immutable artifact identifier determined at build time." The image tag the build produced flows consistently into the test Stage, the approval Stage, and the deploy Stage.

## A Full buildspec Example: Production-grade Integration

```yaml
version: 0.2

env:
  parameter-store:
    GIT_TOKEN: /myapp/github/pat
  secrets-manager:
    DB_PASS: prod/db:password
    ECR_REGISTRY: prod/ecr:registry
  exported-variables:
    - IMAGE_TAG
    - BUILD_VERSION

phases:
  install:
    runtime-versions:
      nodejs: 20
      docker: 20
    commands:
      - npm install -g pnpm
      - aws codeartifact login --tool npm --repository prod --domain my-org

  pre_build:
    commands:
      - echo "Build $CODEBUILD_BUILD_NUMBER from $CODEBUILD_RESOLVED_SOURCE_VERSION"
      - export IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
      - export BUILD_VERSION=$(cat package.json | jq -r '.version')-$IMAGE_TAG
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
      - docker buildx create --use --name builder

  build:
    commands:
      - pnpm install --frozen-lockfile
      - pnpm test --reporter=junit --output-file=reports/junit.xml
      - pnpm build
      - docker buildx build \
          --platform linux/amd64,linux/arm64 \
          --cache-from type=registry,ref=$ECR_REGISTRY/myapp:cache \
          --cache-to type=registry,ref=$ECR_REGISTRY/myapp:cache,mode=max \
          --push \
          -t $ECR_REGISTRY/myapp:$IMAGE_TAG \
          -t $ECR_REGISTRY/myapp:latest .

  post_build:
    commands:
      - aws ecs describe-task-definition --task-definition myapp --query taskDefinition > taskdef.json
      - sed -i "s|<IMAGE>|$ECR_REGISTRY/myapp:$IMAGE_TAG|g" appspec.yml
    finally:
      - docker logout $ECR_REGISTRY
      - echo "Build complete: $BUILD_VERSION"

reports:
  unit:
    files: ['reports/junit.xml']
    file-format: JUNITXML
  coverage:
    files: ['coverage/cobertura.xml']
    file-format: COBERTURAXML

artifacts:
  files:
    - taskdef.json
    - appspec.yml
  secondary-artifacts:
    sbom:
      files: 'sbom.json'
    sourcemap:
      files: '**/*.map'
      base-directory: build

cache:
  paths:
    - /root/.npm/**/*
    - /root/.docker/**/*
```

Wrapping up: beyond making the build procedure into code, buildspec.yml is also the single document through which the whole team shares "how this gets built." Bugs that reproduce only in the CI environment, incidents where a password gets printed into logs, confusion where image tags get mixed up — these three are the most common problems that a correctly designed buildspec can prevent. Tomorrow we move into the caching strategies that make this pipeline fast.

---

## 📝 연습 문제

**문제 1.** Which of the following correctly describes the behavior of `post_build` when the `build` phase fails?

A) `post_build` does not run
B) `post_build` runs, but the build result is marked FAILED
C) `post_build` also inherits the `on-failure: ABORT` setting and is aborted
D) A notification is sent to AWS Support

**정답: B**
해설: `post_build` still runs after a `build` phase failure. This is why cleanup code (Docker logout, temporary file deletion, sending notifications) belongs in `post_build`. However, the build result remains FAILED. This differs from a failure in `install` or `pre_build`, after which no later phases run at all.

---

**문제 2.** You referenced a secret in buildspec via `env.secrets-manager` and the build fails with "AccessDenied: decryption." What is the most likely cause?

A) Exceeding a Secrets Manager service quota
B) The CodeBuild Service Role is missing the `kms:Decrypt` permission (secret encrypted with a CMK)
C) The buildspec version is 0.1
D) The secret name contains a slash

**정답: B**
해설: When a Secrets Manager secret is encrypted with a Customer Managed Key (CMK), `secretsmanager:GetSecretValue` alone is not enough. For decryption, the Service Role must also have `kms:Decrypt`. The AWS managed key (`aws/secretsmanager`) is implicitly allowed, but a CMK requires an explicit permission. This is the most common mistake and a perennial exam favorite.

---

**문제 3.** Which most accurately describes the difference between Build Batch's `build-graph` and `build-list`?

A) `build-graph` is parallel, `build-list` is sequential
B) `build-list` is simple parallelism (no dependencies); `build-graph` defines a dependency DAG with `depend-on`
C) They are identical, just aliases
D) `build-graph` is Lambda-only

**정답: B**
해설: `build-list` is simple parallelism in which all builds start at the same time. `build-graph` uses the `depend-on` field to define dependencies where a build starts only after its predecessors complete. For example, the pattern where a `package` build waits for `lint` and `unit_test` to complete is `build-graph`. Execution order is determined with a topological sort algorithm.

---

**문제 4.** How do you build ARM (Graviton) and x86 images simultaneously from a single buildspec?

A) Define two `build` phases in the buildspec
B) Define two entries in `batch.build-list`, ARM_CONTAINER and LINUX_CONTAINER, build each, then combine them with `docker manifest`
C) Build both in a single container with QEMU emulation
D) Trigger a Lambda to run twice in a row

**정답: B**
해설: The standard pattern is to build both architectures in parallel with Build Batch's `build-list`, push each to ECR, and then create a multi-arch manifest with `docker manifest create`. QEMU is emulation and therefore slow, and two build phases within a single buildspec are not supported. Handling it in one command with `docker buildx build --platform linux/amd64,linux/arm64` is also possible, but Build Batch is faster.

---

**문제 5.** In CodePipeline V2, how do you use the build stage's `IMAGE_TAG` variable in the deploy stage?

A) Save it as a file in the S3 artifact and read the file in the deploy stage
B) Declare `IMAGE_TAG` in `env.exported-variables` and reference it in the deploy Stage as `#{BuildAction.IMAGE_TAG}`
C) Send it to CloudWatch as a metric
D) Have a Lambda function store it in DynamoDB

**정답: B**
해설: CodePipeline V2's variable system lets environment variables declared through `exported-variables` be referenced in a later Stage/Action in the form `#{ActionName.VariableName}`. This lets an image tag determined in the build flow all the way to the ECS deploy Action. It is not supported in V1 pipelines.

---

**문제 6.** From an SLSA (Supply chain Levels for Software Artifacts) perspective, what security benefit does keeping buildspec.yml in a Git repository provide?

A) Builds become faster
B) The build procedure is version-controlled and auditable, and malicious modifications can be blocked through PR review
C) Docker images are automatically signed
D) IAM permissions are automatically minimized

**정답: B**
해설: One of the core requirements of SLSA Level 2 is that "the build definition must live in a version control system." When buildspec.yml is in Git, change history is preserved and unauthorized modification of the build specification can be prevented through the PR review process. Since the "SolarWinds supply chain attack" (2020), the integrity of the build procedure itself has become an important axis of security.

---

**문제 7.** What is the most direct way to debug an error that reproduces "only inside the CodeBuild container"?

A) Search for the error message in CloudWatch Logs
B) Start the build with the `--debug-session-enabled` option and connect to the container with SSM Session Manager
C) Delete and recreate the build project
D) Change the IAM Role to AdministratorAccess

**정답: B**
해설: A Debug Session pauses the build container at a specific phase and lets you connect via SSM Session Manager for up to 7 hours. You can run commands directly inside the container and inspect environment variables, filesystem state, and network connectivity. Local Build is the approach of running the same buildspec on a developer machine; both are standard debugging tools.

---
