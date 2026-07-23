# Day 2 - The Physics of Build Speed: Trade-offs Among Cache, Parallelism, and Compute

In the tense moments of an early-morning deployment, an 8-minute build means 8 minutes of anxiety. If "npm install, 4 minutes" accounts for half of those 8 minutes, those 4 minutes are waste spent re-downloading the same packages from the internet every time. In theory, a cache could cut that to 40 seconds. But in practice CodeBuild's cache behaves completely differently depending on "where it's stored," and there's a paradox where a misconfigured cache actually makes things slower.

Optimizing CodeBuild's build time consists of five layers: (1) compute resource selection, (2) cache strategy, (3) source clone optimization, (4) Docker layer cache, and (5) Build Batch parallelization. Choosing wrong on even one of these halves the overall effect.

## The Four CodeBuild Cache Modes: What Lives Where

| Mode | Storage location | Shared across builds | Host-dependent | Cost |
|------|-----------|-------------|------------|------|
| No Cache | none | - | - | none |
| S3 Cache | S3 bucket | ✅ (all builds) | ❌ | S3 cost |
| Local Source Cache | build host | ❌ (same host only) | ✅ | none |
| Local Docker Layer Cache | build host | ❌ (same host only) | ✅ | none |
| Local Custom Cache | build host | ❌ (same host only) | ✅ | none |

The decisive column in this table is "host-dependent." CodeBuild dynamically spins up a build container on some host each time a request comes in. There is no guarantee the next build lands on the same host. So **local caches only help when consecutive builds happen to be scheduled onto the same host**. The S3 cache always works because it pulls from S3 regardless of which host the build lands on.

```yaml
# the cache block in buildspec.yml
cache:
  paths:
    - 'node_modules/**/*'      # npm dependencies
    - '/root/.npm/**/*'        # npm global cache
    - '/root/.m2/**/*'         # Maven local repository
    - '/root/.gradle/caches/**/*'  # Gradle cache
    - '/root/.cache/pip/**/*'  # pip cache
```

```bash
# configure the cache at the project level
aws codebuild update-project \
  --name myproj \
  --cache type=S3,location=my-build-cache-bucket/prefix

# Local cache + S3 combination
aws codebuild update-project \
  --name myproj \
  --cache type=LOCAL,modes=LOCAL_CUSTOM_CACHE,LOCAL_SOURCE_CACHE \
  --no-cache-modes  # reset
```

> ⚠️ **Pitfall**: Putting `node_modules/**/*` into the S3 cache feels fast at first, but once `node_modules` exceeds 100 MB, S3 upload/download time can exceed the npm install time. Some teams genuinely get slower after enabling caching. Never add a cache without measuring. Compare CloudWatch's `BuildDuration` and `DownloadSourceDuration` before and after.

> 💡 **Related theory**: The key indicator for evaluating cache effectiveness is the **Cache Hit Rate**. At a 90% hit rate, 9 out of 10 times are served quickly from cache and only 1 goes out to the internet. CodeBuild's S3 cache hit rate depends on the design of the "cache key" — if the cache paths are too broad, the cache grows and download overhead appears; if too narrow, the hit rate drops. This is the same problem as the capacity-miss vs conflict-miss trade-off in CPU cache design.

## How the S3 Cache Works: zip, Hashes, and Buckets

Here is how CodeBuild handles the S3 cache:

1. **Restore at build start**: download the cache archive (zip) from S3 and extract it. Place it at the specified `paths`.
2. **Save after build completion**: compress the files matching `cache.paths` into a zip and upload it to S3. It **re-compresses the entire path, not just the changed files**.

This "full re-compression" approach is the source of overhead. For example, if `node_modules` is 500 MB, every build downloads a 500 MB zip and compresses and uploads it again. If the build takes 3 minutes and the cache upload takes 2, it's pointless.

The cache bucket and the artifact bucket are usually different S3 buckets. In cross-account environments, the two buckets may use different KMS keys, causing encryption consistency issues.

> 🔍 **Going deeper**: The S3 cache's file path is stored under a key that includes the project name and branch. That is, the `main` branch cache and the `feature/xyz` branch cache are managed separately. Building on a new branch for the first time produces a cache miss (cold start). This is one reason trunk-based development is more favorable than a feature-branch strategy in terms of cache efficiency — every build shares the same `main` branch cache.

## Docker Layer Cache: Exploiting Layer Immutability

A Docker image is a stack of layers. Each `RUN`, `COPY`, and `ADD` instruction in the `Dockerfile` creates a layer. An already-built layer is reused as long as it hasn't changed (content-addressable). That is the core of the Docker layer cache.

```bash
# enable Local Docker Layer Cache on a CodeBuild project
aws codebuild update-project \
  --name myproj \
  --cache type=LOCAL,modes=LOCAL_DOCKER_LAYER_CACHE
```

**Important**: Local Docker Layer Cache requires `privilegedMode: true`. That's because Docker-in-Docker (DinD) has to work. DinD is the pattern of running a Docker daemon inside a container, which requires elevated privileges for security reasons.

But Local Docker Layer Cache has the "host-dependent" problem. If the next build is scheduled on a different host, there is no layer cache and everything must be built from scratch. What solved this problem is **BuildKit + ECR Registry Cache**.

```yaml
phases:
  pre_build:
    commands:
      - docker buildx create --use --name builder
      - docker buildx inspect --bootstrap
  build:
    commands:
      - docker buildx build \
          --platform linux/amd64,linux/arm64 \
          --cache-from type=registry,ref=$ECR/myapp:cache \
          --cache-to   type=registry,ref=$ECR/myapp:cache,mode=max \
          --push -t $ECR/myapp:$IMAGE_TAG .
```

`--cache-from type=registry,ref=$ECR/myapp:cache` pulls cache layers stored in ECR. `--cache-to` stores new layers into ECR. Even if the host changes, the cache always hits because it is fetched from ECR. This is the **modern pattern that eliminates host dependence**.

> 💡 **Related theory**: Docker's Content-Addressable Storage (CAS) identifies each layer by the SHA256 hash of its content. Layers with identical content have identical hashes and are therefore referenced by the same identifier on any host. Storing the cache in ECR extends this hash-based identification to cloud storage — even on a different host, if the SHA256 matches, the layer is reused. This is the same concept as the **Remote Execution Cache** in distributed build systems.

> 📚 **Case study**: In a 2021 blog post, Pinterest disclosed that after adopting ECR Registry Cache, Docker build times dropped by an average of 72%. In particular, it solved the problem of `RUN pip install` and `RUN npm install` layers being re-executed every time in images with many Python + Node.js dependencies. It was applied together with layer-order optimization in the Dockerfile (rarely-changing layers first, frequently-changing layers later).

## Choosing a Compute Type: The vCPU and RAM Trade-off

| Type | vCPU | RAM | Relative cost | Suitable builds |
|------|------|-----|----------|------------|
| `BUILD_GENERAL1_SMALL` | 3 | 3 GiB | 1× | lightweight Node.js, Go |
| `BUILD_GENERAL1_MEDIUM` | 4 | 7 GiB | 2× | typical Java/Python |
| `BUILD_GENERAL1_LARGE` | 8 | 15 GiB | 4× | Android, large Gradle |
| `BUILD_GENERAL1_2XLARGE` | 72 | 144 GiB | 32× | ML model compilation, large C++ |
| Lambda compute | variable | variable | Lambda billing | lightweight tests, short scripts |

**Lambda compute** (added in 2023): runs CodeBuild on top of Lambda. Cold start is fast and it's cost-efficient for short builds (under 30 seconds). However, there is no Docker daemon, so Docker builds are impossible, and disk size is limited.

> ⚠️ **Pitfall**: "Bigger compute type means faster builds" is not a linear relationship. For I/O-bound builds (network downloads, disk writes), adding vCPUs barely changes the speed. For CPU-bound builds (compilation, encryption), the effect is clear. Increasing the compute type without measuring commonly results in higher cost and unchanged speed.

> 🔍 **Going deeper**: Compute type selection is a domain where Amdahl's Law operates. With a serial portion (S) and a parallelizable portion (1-S), the maximum speedup is 1/(S + (1-S)/N). Serial portions of a build such as "1 second for an SSM Parameter Store lookup" or "30 seconds to push an ECR image" do not shrink when you add vCPUs. Only the actual compilation stage sees parallelization gains. This is why "using LARGE isn't twice as fast."

## Build Batch: A CI/CD Pipeline Viewed as a Dependency Graph

```yaml
batch:
  fast-fail: false      # if one build fails, the rest continue
  build-graph:
    - identifier: lint
      env:
        compute-type: BUILD_GENERAL1_SMALL
        variables:
          STEP: lint
    - identifier: unit_test
      env:
        compute-type: BUILD_GENERAL1_MEDIUM
    - identifier: integration_test
      depend-on: [unit_test]
      env:
        compute-type: BUILD_GENERAL1_MEDIUM
    - identifier: package_x86
      depend-on: [lint, integration_test]
      env:
        type: LINUX_CONTAINER
        compute-type: BUILD_GENERAL1_LARGE
    - identifier: package_arm
      depend-on: [lint, integration_test]
      env:
        type: ARM_CONTAINER
        compute-type: BUILD_GENERAL1_LARGE
```

The execution time of this graph is the "longest path (Critical Path)":
- `lint` runs in parallel → waits after completion
- `unit_test` → `integration_test` → `package_x86` + `package_arm` in parallel
- Critical path: `unit_test` + `integration_test` + `package` (pick one)

With `fast-fail: true`, when one fails the rest are canceled. With `fast-fail: false`, other paths keep running. It's a trade-off between cost and feedback speed.

Because each build node is an independent container, they do not share a filesystem. Passing artifacts between nodes must go through S3. This is why the S3 cache is especially important in Build Batch.

> 💡 **Related theory**: Build Batch's dependency graph is a **directed acyclic graph (DAG)**. GNU Make's Makefile dependencies, Apache Airflow DAGs, and Kubernetes Job ordering dependencies all use the same data structure. A DAG must be free of cycles, and CodeBuild returns an error at build creation time if `depend-on` contains a cycle. It determines execution order with a topological sort (Kahn's algorithm or DFS-based).

> 🎯 **Scenario**: "There are 5 microservices. Each needs ARM/x86 images. Some depend on a shared library." The optimal design is: (1) with `build-graph`, make the shared library the first node and set the remaining services to `depend-on: [common_lib]` → (2) within each service, handle ARM/x86 in parallel with `build-list` → (3) share the shared library's compilation output via the S3 cache. Total execution time = common_lib build time + max(service build times).

## Reserved Capacity (Fleet): How to Eliminate Provisioning

The time it takes for a build container to start is "provisioning time." For infrequent builds it's negligible, but for a team building 200 times a day, 30 seconds of provisioning wastes 100 minutes per day.

**Reserved Capacity (Fleet)** maintains a pool of pre-warmed build containers. When a build request comes in, it starts immediately on an already-prepared container.

```bash
# create a Fleet
aws codebuild create-fleet \
  --name myapp-fleet \
  --base-capacity 4 \
  --environment-type LINUX_CONTAINER \
  --compute-type BUILD_GENERAL1_MEDIUM \
  --scaling-configuration scalingType=TARGET_TRACKING_SCALING,targetTrackingScalingConfigs=[{metricType=FLEET_UTILIZATION_RATE,targetValue=0.7}]
```

A Fleet incurs a committed hourly cost. It pays off when build frequency is high and loses money when it's low. Compute the break-even point as "Fleet cost < (provisioning time saved × build frequency × hourly compute cost)."

Combined with VPC mode, ENI creation time is also eliminated, enabling further reduction.

> 📚 **Case study**: According to a case Shopify published on its Engineering Blog in 2022, while processing roughly 120,000 CI builds per day, provisioning overhead accounted for 8% of cumulative CPU time. After introducing Reserved Capacity (a similar concept), that overhead dropped below 1%. The lesson: the higher the build frequency, the greater the ROI of provisioning optimization.

## GCP Cloud Build vs CodeBuild: Cache Strategy Comparison

| Item | CodeBuild | Cloud Build |
|------|-----------|-------------|
| Cache store | S3 (persistent) / local (host) | GCS (persistent) / host |
| Docker layer cache | Local Mode + BuildKit+ECR | `--cache` option + Artifact Registry |
| Cache key configuration | automatic (project + branch based) | custom keys supported |
| Distributed cache | BuildKit + ECR registry cache | Kaniko + Artifact Registry |
| Cache cost | S3 storage + GET/PUT costs | GCS storage + operation costs |
| Cache expiration | auto-deleted after 30 days unused | controlled by GCS lifecycle policy |

Cloud Build's advantage is that cache keys can be customized based on file hashes, enabling more fine-grained cache strategies. CodeBuild has limited cache-key customization but integrates naturally with S3.

> 💡 **Related theory**: Cache invalidation is one of the "two hardest problems" in computer science (Phil Karlton). Deciding when to discard a build cache and rebuild is not a simple problem. When `package-lock.json` changes, the `node_modules` cache must be invalidated, but CodeBuild's cache is path-based and does not handle this logic automatically. This is why tools like Gradle Wrapper, Maven Wrapper, and Bazel carry their own cache invalidation logic.

## Measuring Build Time: Using CloudWatch Metrics

```bash
# check the time of each build phase
aws codebuild batch-get-builds --ids <build-id> \
  --query 'builds[0].phases[*].{Phase:phaseType,Status:phaseStatus,Duration:durationInSeconds}'
```

CodeBuild metrics in CloudWatch:
- `BuildDuration` — total build time
- `QueuedDuration` — time waiting in the build queue
- `SubmittedDuration` — time from submission to start
- `ProvisioningDuration` — container provisioning time
- `DownloadSourceDuration` — source clone time

Use these metrics when comparing before and after cache optimization. If you only look at "build time," cache overhead can offset reductions in other stages and lead you to misjudge the effect.

## Full Example: A Multi-node Parallel Build buildspec

```yaml
version: 0.2

batch:
  fast-fail: false
  build-graph:
    - identifier: lint
      env:
        compute-type: BUILD_GENERAL1_SMALL
      buildspec: build/lint.yml
    - identifier: unit
      env:
        compute-type: BUILD_GENERAL1_MEDIUM
      buildspec: build/unit.yml
    - identifier: integration
      depend-on: [unit]
      env:
        compute-type: BUILD_GENERAL1_MEDIUM
      buildspec: build/integration.yml
    - identifier: package_x86
      depend-on: [lint, integration]
      env:
        type: LINUX_CONTAINER
        compute-type: BUILD_GENERAL1_LARGE
        image: aws/codebuild/amazonlinux2-x86_64-standard:5.0
      buildspec: build/package.yml
    - identifier: package_arm
      depend-on: [lint, integration]
      env:
        type: ARM_CONTAINER
        compute-type: BUILD_GENERAL1_LARGE
        image: aws/codebuild/amazonlinux2-aarch64-standard:3.0
      buildspec: build/package.yml
```

```yaml
# build/package.yml
version: 0.2

cache:
  paths:
    - /root/.gradle/caches/**/*

phases:
  pre_build:
    commands:
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR
  build:
    commands:
      - docker buildx build \
          --cache-from type=registry,ref=$ECR/myapp:buildcache \
          --cache-to   type=registry,ref=$ECR/myapp:buildcache,mode=max \
          --platform linux/$ARCH \
          --push -t $ECR/myapp:$IMAGE_TAG-$ARCH .
  post_build:
    commands:
      - |
        if [ "$ARCH" = "arm64" ]; then
          docker manifest create $ECR/myapp:$IMAGE_TAG \
            $ECR/myapp:$IMAGE_TAG-amd64 \
            $ECR/myapp:$IMAGE_TAG-arm64
          docker manifest push $ECR/myapp:$IMAGE_TAG
        fi
```

A build cache is not "set it and forget it." Track the cache hit rate with CloudWatch, and when the cache grows too large, narrow the paths or switch to the BuildKit+ECR approach. Tomorrow we move into how to handle secrets safely in this pipeline.

---

## 📝 연습 문제

**문제 1.** What is the most important difference between the S3 cache and the Local Custom Cache?

A) The S3 cache is always faster
B) The S3 cache is persistent across builds and accessible from any host; a local cache persists only on the same build host
C) Only the local cache can store `node_modules`
D) The S3 cache only works with Lambda compute

**정답: B**
해설: The key differences are persistence and host dependence. CodeBuild may schedule each build on a different host, so a local cache only helps when the same host is assigned again. The S3 cache references the same bucket from any host, so the previous build's cache can always be reused. In exchange, the S3 cache carries download/upload overhead.

---

**문제 2.** What setting is absolutely required to enable Local Docker Layer Cache?

A) Enabling it together with S3 Cache
B) `privilegedMode: true` (elevated privileges for Docker-in-Docker)
C) Enabling VPC mode
D) Using the ARM container type

**정답: B**
해설: Local Docker Layer Cache requires running a Docker daemon inside the build container (Docker-in-Docker). For that, `privilegedMode: true` is mandatory. If you configure the Docker layer cache without privilegedMode, the build will start but the layer cache won't actually work.

---

**문제 3.** `npm install` takes 4 minutes on every build. In an environment where the build host differs every time, what is the most effective caching strategy?

A) Cache `node_modules/**/*` with Local Custom Cache
B) Cache `node_modules/**/*` and `/root/.npm/**/*` with S3 Cache
C) Include `npm install` in a Docker layer with BuildKit + ECR Registry Cache
D) Upgrade the Compute Type to 2XLARGE

**정답: C**
해설: When the build host differs every time, a local cache is ineffective. The S3 cache (B) is possible too, but when `node_modules` is large the download overhead is significant. BuildKit + ECR Registry Cache (C) stores the cache per Docker layer and fetches it from ECR, so there is no host dependence and the `npm install` layer alone can be selectively reused. D is the wrong approach of adding CPU to an I/O-bound problem.

---

**문제 4.** You set Build Batch's `fast-fail: false`. When `unit_test` fails, what happens to `lint`?

A) `lint` is also immediately aborted
B) `lint` does not depend on `unit_test`, so it keeps running
C) The whole Batch is aborted
D) `lint` re-runs `unit_test`

**정답: B**
해설: With `fast-fail: false`, build nodes that have no dependency relationship keep running unaffected by another node's failure. If `unit_test` and `lint` are running in parallel, `lint` completes independently even when `unit_test` fails. With `fast-fail: true`, `lint` would also be canceled.

---

**문제 5.** In which scenario is adopting Reserved Capacity (Fleet) effective?

A) Fewer than 5 builds per day, 30 minutes per build
B) 200 or more builds per day, with provisioning overhead at 20% of total time
C) A single large batch build
D) Builds that use Lambda compute

**정답: B**
해설: Reserved Capacity maintains a pool of warmed containers, so it incurs a fixed cost. ROI turns positive when build frequency is high and provisioning time accounts for a meaningful share of the total. At 5 builds per day, the cost of maintaining the Fleet exceeds the savings. At 30 seconds of provisioning per build and 200 builds per day, you save 1 hour — if the cost of that hour exceeds the Fleet cost, adoption is rational.

---

**문제 6.** What is the most important reason to use ECR Pull Through Cache?

A) To build images directly in ECR
B) To bypass Docker Hub's anonymous pull limit (100 pulls/6 hours/IP) and have CodeBuild builds fetch base images from ECR
C) For cross-region image replication
D) For creating multi-arch images

**정답: B**
해설: When CodeBuild builds share a NAT Gateway, pull requests to Docker Hub converge on the same public IP. Exceeding the rate limit (100 pulls/6 hours) makes builds fail with a "toomanyrequests" error. With ECR Pull Through Cache configured, only the first pull goes to Docker Hub, and subsequent pulls are served from ECR. You get cost savings and improved reliability at the same time.

---

**문제 7.** What determines the total execution time of a build running under Build Batch?

A) The sum of the times of all build nodes
B) The time of the Critical Path (longest path) in the dependency graph
C) The time of the fastest node
D) The time of the first node

**정답: B**
해설: In parallel builds, the total execution time is the Critical Path — the time of the longest path in the dependency chain. For example, with `lint (2 min)`, `unit_test (5 min)`, `integration_test (3 min, depends on unit_test)`, and `package (4 min, depends on lint+integration_test)`, the Critical Path is `unit_test + integration_test + package = 12 minutes`. `lint` finishes in 2 minutes in parallel but does not determine the total. This is the same concept as the Critical Path Method (CPM) in project management.

---
