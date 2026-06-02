# Day 2 - CodeBuild 캐싱(S3/Local) + 병렬 빌드

📅 날짜: Week 3 (Day 2)
🎯 주제: 빌드 속도 최적화 — 캐시·병렬·Compute Type 선택
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- S3 cache vs Local cache 모드 4종을 정확히 구분한다
- Docker Layer Cache의 의미와 한계
- Compute Type별 비용·시간 트레이드오프
- Build Batch로 병렬 빌드 시 의존 그래프 설계

---

## 🧩 사전 지식 (CS 기초)

- **Cache hit rate**: 캐시 적중률. 1%만 올려도 빌드 시간 크게 단축.
- **Cold start**: 첫 빌드. 캐시 없음.
- **Layer cache**: Docker가 RUN/COPY 단위로 캐시. 변경되지 않은 레이어 재사용.
- **Distributed build**: 빌드를 여러 노드에 분산. Bazel/Buck/Nx가 대표적.
- **Memoization**: 동일 입력에 대해 결과 캐시. 함수형 프로그래밍의 기본 최적화.

---

## 📖 이론 내용

### 1. CodeBuild Cache 모드 4종

| 모드 | 위치 | 사용 사례 |
|------|------|-----------|
| **No cache** | 없음 | 매 빌드 fresh |
| **S3 cache** | S3 버킷 | 멀티 빌드 공유, 영속적 |
| **Local source cache** | 빌드 호스트 | Git 히스토리 캐시 (얕은 클론 방지) |
| **Local Docker layer cache** | 빌드 호스트 | Docker 이미지 빌드 캐시 |
| **Local custom cache** | 빌드 호스트 | buildspec `cache.paths` 경로 |

> 💡 **Local cache는 빌드 호스트가 살아 있는 동안만** — 다음 빌드가 같은 호스트에 떨어져야 적중. **S3 cache는 영속적**이지만 다운/업로드 비용.

### 2. buildspec에서 cache.paths 지정

```yaml
cache:
  paths:
    - 'node_modules/**/*'
    - '/root/.npm/**/*'
    - '/root/.m2/**/*'
    - '/root/.gradle/caches/**/*'
    - '/root/.cache/pip/**/*'
    - '/root/.docker/**/*'
```

CodeBuild가 자동으로:
- 빌드 시작 시 cache restore (S3에서 zip 다운로드 + extract)
- 빌드 끝나면 변경된 파일만 다시 zip → S3 업로드

> ⚠️ **함정**: 너무 큰 경로 캐시는 다운/업로드 시간이 빌드보다 길어질 수 있음. 측정 필수.

### 3. Docker Layer Cache 활성화

CodeBuild Project 설정에서:

```bash
aws codebuild update-project \
  --name myproj \
  --cache type=LOCAL,modes=LOCAL_DOCKER_LAYER_CACHE,LOCAL_SOURCE_CACHE
```

**중요**: Local Docker Layer Cache 사용 시 `privilegedMode: true` 필수 (Docker-in-Docker).

### 4. Compute Type 선택

| Type | vCPU | RAM | 시간당 가격 인덱스 |
|------|------|-----|---------------------|
| BUILD_GENERAL1_SMALL | 3 | 3 GiB | 1× |
| BUILD_GENERAL1_MEDIUM | 4 | 7 GiB | 2× |
| BUILD_GENERAL1_LARGE | 8 | 15 GiB | 4× |
| BUILD_GENERAL1_2XLARGE | 72 | 144 GiB | 32× |
| BUILD_GENERAL1_XLARGE (Lambda 컴퓨트) | 다양 | | Lambda 과금 |

> 💡 **시험 포인트**: 작은 빌드에 큰 compute는 낭비. 큰 빌드(Android/Native)에 작은 compute는 OOM. Compute Optimizer가 권장도 안 함 — 측정 + 경험.

**Lambda 컴퓨트(2023+)**: CodeBuild를 Lambda 위에서 실행. 콜드 스타트 짧고 가벼운 빌드에 저렴. 제한: 디스크 크기, Docker 빌드 불가.

### 5. Build Batch로 병렬 빌드

```yaml
batch:
  fast-fail: false  # 한 빌드 실패해도 나머지 계속
  build-graph:
    - identifier: lint
      env:
        compute-type: BUILD_GENERAL1_SMALL
        variables:
          STEP: lint
    - identifier: unit_test
      env:
        compute-type: BUILD_GENERAL1_MEDIUM
        variables:
          STEP: unit_test
    - identifier: integration_test
      depend-on: [unit_test]
      env:
        variables:
          STEP: integration_test
    - identifier: package
      depend-on: [lint, integration_test]
      env:
        variables:
          STEP: package
```

- `build-graph`로 의존 관계 DAG 정의
- `fast-fail: true`면 실패 시 나머지도 중단
- 각 노드는 독립 컨테이너 → 캐시 공유 못 함 → S3 cache로 공유

### 6. 빌드 시간 측정과 개선

| 단계 | 측정 |
|------|------|
| Provisioning | 컨테이너 부팅 (변경 어려움, Lambda 컴퓨트로 단축 가능) |
| Download Source | git clone 시간 |
| Restore Cache | S3 다운로드 + extract |
| Install | runtime 설치, OS 패키지 |
| Pre-build | login, prep |
| Build | 실제 빌드 |
| Post-build | push, deploy |
| Upload Artifacts | S3 업로드 |

**CloudWatch 지표**: `BuildDuration`, `Queued time`, `Provisioning time`이 별도 제공.

---

## 🧠 알아두면 좋은 심화 이론

### Reserved Capacity (Fleet)

- 2023+ 기능
- 빌드 컨테이너 워밍업 풀
- Provisioning time이 거의 0
- 시간당 약정 비용 → 빌드 빈도 높을 때만 이득
- VPC, ARM, Lambda compute 모두 지원

### Source Caching 함정

- 기본은 매번 full clone
- Local Source Cache 활성화 시 점진적 클론
- **하지만** branch가 자주 바뀌면 캐시 적중 낮음 → S3 cache가 더 안정적

### Docker BuildKit + buildx

```yaml
phases:
  pre_build:
    commands:
      - docker buildx create --use --name builder
      - docker buildx inspect --bootstrap
  build:
    commands:
      - docker buildx build --platform linux/amd64,linux/arm64 \
          --cache-from type=registry,ref=$ECR/myapp:cache \
          --cache-to type=registry,ref=$ECR/myapp:cache,mode=max \
          --push -t $ECR/myapp:$IMAGE_TAG .
```

ECR을 캐시 저장소로 사용 → 빌드 호스트 캐시 의존 제거.

### CodeBuild 동시 빌드 제한 (Concurrency)

- 프로젝트당 동시 빌드 수 제한 가능
- 계정 수준 quota (서비스 한도, 기본 60)
- `concurrentBuildLimit` 프로젝트 설정으로 cap 가능
- Build Batch는 단일 빌드 카운트지만 내부 노드는 별도 카운트

### CodePipeline과 Cache 상호작용

- CodePipeline은 InputArtifact를 S3에 저장
- 그 위에 CodeBuild가 캐시를 별도 S3에 저장
- 두 S3 KMS 키 정합성 주의 (cross-account 시)

### 관련 서비스 Cross-Reference

- **Pipeline 변수** → Week 5 Day 4
- **ECR** → Week 6 Day 1
- **VPC CodeBuild** → Week 3 Day 4
- **CloudWatch 빌드 지표** → Week 10 Day 1

---

## 🏗️ 아키텍처 다이어그램

```
Build Cache Strategy
==================================================

Cold Start (no cache)
  Provision -> Source -> Install (npm: 4min) -> Build (2min) -> Push
  Total: ~8min

With S3 Custom Cache
  Provision -> Source -> Restore S3 cache (30s)
                          -> npm ci uses cache (40s) -> Build -> Push
  Total: ~4min

With Local Docker Layer Cache (same host)
  Source -> docker build (cached layers, 15s) -> Push
  Total: ~2min  (best case)

With BuildKit + ECR cache (cross-host stable)
  Source -> buildx with --cache-from $ECR/cache -> Push
  Total: ~3min stable

Parallel Build Batch
   build-graph:
        lint  ┐
              ├─ package
   unit_test ─┤
              │
   int_test ──┘
  Total: max(longest path) = lint || int_test || package
       not sum of all
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Local Cache는 빌드 호스트 동안만, S3 Cache는 영속적
2. ⭐ Docker Layer Cache 사용 시 `privilegedMode: true` 필수
3. ⭐ Build Batch `build-graph`로 의존 DAG 병렬 빌드
4. ⭐ Reserved Capacity로 Provisioning 시간 거의 0
5. ⭐ BuildKit + ECR 캐시는 빌드 호스트 의존을 제거하는 모던 패턴

---

## 💻 실제 예시 - 멀티 노드 병렬 빌드

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
      buildspec: build/package.yml
    - identifier: package_arm
      depend-on: [lint, integration]
      env:
        type: ARM_CONTAINER
        compute-type: BUILD_GENERAL1_LARGE
      buildspec: build/package.yml
```

```bash
# 시작 (Build Batch API)
aws codebuild start-build-batch --project-name my-batch-proj
```

```bash
# 캐시 설정 변경
aws codebuild update-project \
  --name myproj \
  --cache type=S3,location=my-build-cache-bucket/cache-prefix \
  --cache modes=LOCAL_DOCKER_LAYER_CACHE,LOCAL_SOURCE_CACHE
```

---

## 📝 연습 문제

**문제 1.** Docker 빌드 시 매번 base image부터 다시 다운로드한다. 가장 효과적인 개선은?

A) Compute Type을 2XLARGE로 증가
B) Local Docker Layer Cache 활성화 + privilegedMode + BuildKit + ECR registry cache
C) Source 캐시만 활성화
D) Lambda compute로 전환

**정답: B**
해설: Docker 캐시 + ECR Registry cache 조합이 표준. 단순히 Compute 키워도 다운로드 자체는 안 줄어듦.

---

**문제 2.** S3 cache와 Local cache의 차이는?

A) S3는 빌드 간 영속, Local은 호스트 살아있는 동안만
B) S3는 빠르고 Local은 느림
C) Local은 무료, S3는 비쌈
D) 둘 다 동일

**정답: A**
해설: 영속성 차이가 핵심. S3는 다운/업 비용 있지만 다음 빌드가 다른 호스트에 떨어져도 적중.

---

**문제 3.** Build Batch의 `build-graph`와 `build-list` 차이는?

A) build-list는 의존 정의, build-graph는 병렬
B) build-list는 단순 병렬, build-graph는 의존 DAG 정의
C) 동일
D) build-list는 deprecated

**정답: B**
해설: build-graph가 `depend-on`을 지원.

---

**문제 4.** "Provisioning time이 매 빌드 30초씩 든다. 빈도가 높아 큰 비중이다." 해결은?

A) Reserved Capacity (Fleet)로 워밍업된 컨테이너 풀 유지
B) Compute Type 키우기
C) buildspec 단순화
D) Source clone 생략

**정답: A**
해설: Reserved Capacity는 Provisioning을 거의 0으로 만듦. 빈도 높을 때 비용 효율적.

---

**문제 5.** Local Docker Layer Cache 활성화 시 필수 설정은?

A) privilegedMode: true (Docker-in-Docker)
B) VPC 모드 활성화
C) S3 cache도 함께 활성화
D) ARM 컴퓨트

**정답: A**
해설: Docker가 빌드 컨테이너 안에서 돌려면 privileged 모드.

---

**문제 6.** CodeBuild Lambda compute의 제한은?

A) 멀티 아키텍처 빌드만 가능
B) Docker 빌드 불가, 디스크 제한, 짧은 빌드용
C) Reserved Capacity와 충돌
D) S3 캐시 불가

**정답: B**
해설: Lambda compute는 가벼운 빌드용. Docker daemon 없음.

---

**문제 7.** 동시 빌드가 너무 많아 quota를 초과한다. 가장 적절한 대응은?

A) 모든 빌드를 직렬화
B) 프로젝트 `concurrentBuildLimit` + 계정 quota 증가 요청 + Reserved Capacity 사용 검토
C) 다른 리전으로 분산
D) Jenkins로 이전

**정답: B**
해설: 한도 관리 + 증가 요청 + Reserved Capacity로 안정화.

---

## 📌 오늘의 요약

1. Cache 모드 4종: No / S3(영속) / Local Source / Local Docker / Local Custom
2. Docker Layer Cache는 privilegedMode + Local 또는 BuildKit + ECR
3. Build Batch build-graph로 의존 DAG 병렬 빌드
4. Reserved Capacity로 Provisioning 시간 단축
5. Compute Type 선택은 측정 기반 — 큰 게 항상 답 아님
