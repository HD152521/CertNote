# Day 2 - 빌드 속도의 물리학: 캐시·병렬·컴퓨트의 트레이드오프

새벽 배포가 긴박한 상황에서 빌드가 8분 걸린다는 것은 8분의 긴장을 의미한다. 이 8분 중 "npm install 4분"이 차지한다면, 그 4분은 매번 인터넷에서 같은 패키지를 다시 받는 데 쓰이는 낭비다. 이론상 캐시가 있으면 40초로 줄일 수 있다. 하지만 실제로 CodeBuild의 캐시는 "어디에 저장하느냐"에 따라 동작 방식이 완전히 다르고, 잘못 설정하면 오히려 느려지는 역설도 있다.

CodeBuild의 빌드 시간 최적화는 다섯 층의 레이어로 이루어진다: (1) 컴퓨트 리소스 선택, (2) 캐시 전략, (3) 소스 클론 최적화, (4) Docker 레이어 캐시, (5) Build Batch 병렬화. 이 중 하나만 잘못 선택해도 전체 효과가 반감된다.

## CodeBuild 캐시 모드 4종: 무엇이 어디에 사는가

| 모드 | 저장 위치 | 빌드 간 공유 | 호스트 의존 | 비용 |
|------|-----------|-------------|------------|------|
| No Cache | 없음 | - | - | 없음 |
| S3 Cache | S3 버킷 | ✅ (모든 빌드) | ❌ | S3 비용 |
| Local Source Cache | 빌드 호스트 | ❌ (같은 호스트만) | ✅ | 없음 |
| Local Docker Layer Cache | 빌드 호스트 | ❌ (같은 호스트만) | ✅ | 없음 |
| Local Custom Cache | 빌드 호스트 | ❌ (같은 호스트만) | ✅ | 없음 |

이 표에서 결정적인 것은 "호스트 의존" 여부다. CodeBuild는 요청이 들어올 때마다 빌드 컨테이너를 동적으로 어딘가의 호스트에 띄운다. 다음 빌드가 같은 호스트에 떨어질지는 보장되지 않는다. 그래서 **Local 캐시는 같은 호스트에 연속으로 빌드가 배정될 때만** 효과가 있다. S3 캐시는 어느 호스트에 떨어지든 S3에서 가져오기 때문에 항상 동작한다.

```yaml
# buildspec.yml의 cache 블록
cache:
  paths:
    - 'node_modules/**/*'      # npm 의존성
    - '/root/.npm/**/*'        # npm 글로벌 캐시
    - '/root/.m2/**/*'         # Maven 로컬 저장소
    - '/root/.gradle/caches/**/*'  # Gradle 캐시
    - '/root/.cache/pip/**/*'  # pip 캐시
```

```bash
# 프로젝트 수준에서 캐시 설정
aws codebuild update-project \
  --name myproj \
  --cache type=S3,location=my-build-cache-bucket/prefix
  
# Local 캐시 + S3 조합
aws codebuild update-project \
  --name myproj \
  --cache type=LOCAL,modes=LOCAL_CUSTOM_CACHE,LOCAL_SOURCE_CACHE \
  --no-cache-modes  # 초기화
```

> ⚠️ **함정**: `node_modules/**/*`를 S3 캐시에 넣으면 처음에는 빠르게 느껴지지만, `node_modules`가 100MB를 넘으면 S3 업로드·다운로드 시간이 npm install 시간보다 길어질 수 있다. 실제로 캐시 적용 후 오히려 느려지는 팀이 있다. 측정 없이 캐시를 넣으면 안 된다. CloudWatch의 `BuildDuration`, `DownloadSourceDuration`을 before/after로 비교하라.

> 💡 **관련 이론**: 캐시 효과를 평가하는 핵심 지표는 **Cache Hit Rate(캐시 적중률)**다. 적중률이 90%라면 10번 중 9번은 캐시에서 빠르게 처리되고 1번만 실제 인터넷에서 가져온다. CodeBuild의 S3 캐시 적중률은 "캐시 키"의 설계에 달려 있다 — 캐시 경로가 너무 넓으면 캐시 크기가 커져서 다운로드 오버헤드가 생기고, 너무 좁으면 적중률이 낮아진다. 이것은 CPU 캐시 설계의 capacity miss vs conflict miss 트레이드오프와 동일한 문제다.

## S3 캐시의 작동 원리: zip, 해시, 버킷

CodeBuild가 S3 캐시를 처리하는 방식은 다음과 같다:

1. **빌드 시작 시 Restore**: S3에서 캐시 아카이브(zip)를 다운로드하고 추출. 지정된 `paths`로 배치.
2. **빌드 완료 후 Save**: `cache.paths`에 해당하는 파일들을 zip으로 압축해 S3에 업로드. **변경된 파일만이 아니라 전체 경로를 다시 압축**한다.

이 "전체 재압축" 방식이 오버헤드의 원인이다. 예를 들어 `node_modules`가 500MB라면, 매 빌드마다 500MB zip을 다운로드하고 압축해서 올린다. 빌드 시간이 3분인데 캐시 업로드가 2분이면 의미가 없다.

캐시 버킷과 아티팩트 버킷은 보통 다른 S3 버킷이다. Cross-account 환경에서는 두 버킷의 KMS 키가 달라 암호화 정합성 문제가 생길 수 있다.

> 🔍 **더 깊이**: S3 캐시의 파일 경로는 프로젝트 이름과 브랜치를 포함한 키로 저장된다. 즉, `main` 브랜치 캐시와 `feature/xyz` 브랜치 캐시는 별도로 관리된다. 처음 새 브랜치에서 빌드하면 캐시 미스가 발생한다(Cold start). 이것이 trunk-based development가 캐시 효율 면에서 feature branch 전략보다 유리한 이유 중 하나다 — 모든 빌드가 같은 `main` 브랜치 캐시를 공유한다.

## Docker Layer Cache: 레이어 불변성의 활용

Docker 이미지는 레이어의 스택이다. `Dockerfile`의 각 `RUN`, `COPY`, `ADD` 명령이 레이어를 만든다. 이미 만든 레이어는 변경되지 않으면(Content-addressable) 재사용된다. 이것이 Docker Layer Cache의 핵심이다.

```bash
# CodeBuild 프로젝트에 Local Docker Layer Cache 활성화
aws codebuild update-project \
  --name myproj \
  --cache type=LOCAL,modes=LOCAL_DOCKER_LAYER_CACHE
```

**중요**: Local Docker Layer Cache는 `privilegedMode: true`가 필수다. Docker-in-Docker(DinD)가 동작해야 하기 때문이다. DinD는 컨테이너 안에서 Docker daemon을 실행하는 패턴으로, 보안상 elevated privileges가 필요하다.

하지만 Local Docker Layer Cache는 "호스트 의존" 문제가 있다. 다음 빌드가 다른 호스트에 배정되면 레이어 캐시가 없어 처음부터 빌드해야 한다. 이 문제를 해결한 것이 **BuildKit + ECR Registry Cache**다.

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

`--cache-from type=registry,ref=$ECR/myapp:cache`는 ECR에 저장된 캐시 레이어를 가져온다. `--cache-to`는 새 레이어를 ECR에 저장한다. 호스트가 바뀌어도 ECR에서 가져오기 때문에 항상 캐시가 적중한다. 이것이 **호스트 의존을 제거하는 모던 패턴**이다.

> 💡 **관련 이론**: Docker의 Content-Addressable Storage(CAS)는 각 레이어를 내용의 SHA256 해시로 식별한다. 동일한 내용의 레이어는 해시가 같아서 어느 호스트에서나 동일한 식별자로 참조된다. ECR에 캐시를 저장하면 이 해시 기반 식별이 클라우드 스토리지로 확장된다 — 호스트가 달라도 SHA256이 일치하면 레이어를 재사용한다. 이것은 분산 빌드 시스템의 **원격 실행 캐시(Remote Execution Cache)** 개념과 같다.

> 📚 **사례**: Pinterest는 2021년 블로그에서 ECR Registry Cache 도입 후 Docker 빌드 시간이 평균 72% 단축됐다고 공개했다. 특히 Python + Node.js 의존성이 많은 이미지에서 `RUN pip install`과 `RUN npm install` 레이어가 매번 재실행되는 문제를 해결했다. Dockerfile의 레이어 순서 최적화(변경이 적은 레이어 먼저, 변경이 잦은 레이어 나중에)와 함께 적용했다.

## Compute Type 선택: vCPU와 RAM의 트레이드오프

| Type | vCPU | RAM | 상대 비용 | 적합한 빌드 |
|------|------|-----|----------|------------|
| `BUILD_GENERAL1_SMALL` | 3 | 3 GiB | 1× | 경량 Node.js, Go |
| `BUILD_GENERAL1_MEDIUM` | 4 | 7 GiB | 2× | 일반적인 Java/Python |
| `BUILD_GENERAL1_LARGE` | 8 | 15 GiB | 4× | Android, 대형 Gradle |
| `BUILD_GENERAL1_2XLARGE` | 72 | 144 GiB | 32× | ML 모델 컴파일, 대형 C++ |
| Lambda compute | 가변 | 가변 | Lambda 과금 | 경량 테스트, 짧은 스크립트 |

**Lambda compute**(2023년 추가): CodeBuild를 Lambda 위에서 실행. 콜드 스타트가 빠르고, 짧은 빌드(30초 미만)에서 비용 효율적이다. 단, Docker daemon이 없어서 Docker 빌드 불가, 디스크 크기가 제한적이다.

> ⚠️ **함정**: "Compute Type을 키우면 빌드가 빠르다"는 선형 관계가 아니다. I/O 바운드 빌드(네트워크 다운로드, 디스크 쓰기)는 vCPU를 늘려도 속도가 거의 안 변한다. CPU 바운드 빌드(컴파일, 암호화)는 확실한 효과가 있다. 측정 없이 Compute Type을 키우면 비용만 늘고 속도는 그대로인 경우가 흔하다.

> 🔍 **더 깊이**: Compute Type 선택은 암달의 법칙(Amdahl's Law)이 작동하는 영역이다. 순차 실행 부분(S)과 병렬 가능 부분(1-S)이 있을 때, 최대 속도 향상은 1/(S + (1-S)/N)이다. 빌드의 "SSM Parameter Store 조회 1초", "ECR 이미지 push 30초" 같은 순차 부분은 vCPU를 늘려도 줄지 않는다. 실제 컴파일 단계만 병렬화 이득을 본다. 이것이 "LARGE를 써도 2배 빠르지 않은" 이유다.

## Build Batch: 의존 그래프로 보는 CI/CD 파이프라인

```yaml
batch:
  fast-fail: false      # 한 빌드 실패해도 나머지 계속
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

이 그래프의 실행 시간은 "가장 긴 경로(Critical Path)"다:
- `lint` 병렬 → 완료 후 대기
- `unit_test` → `integration_test` → `package_x86` + `package_arm` 병렬
- Critical path: `unit_test` + `integration_test` + `package` (하나 선택)

`fast-fail: true`면 하나가 실패할 때 나머지도 취소된다. `fast-fail: false`면 다른 경로가 계속 실행된다. 비용 vs 피드백 속도의 트레이드오프다.

각 빌드 노드는 독립 컨테이너이기 때문에 파일시스템을 공유하지 않는다. 노드 간 아티팩트 전달은 S3를 경유해야 한다. 이것이 Build Batch에서 S3 캐시가 특히 중요한 이유다.

> 💡 **관련 이론**: Build Batch의 의존 그래프는 **방향성 비순환 그래프(DAG)**다. GNU Make의 Makefile 의존 관계, Apache Airflow의 DAG, Kubernetes Job 순서 의존이 모두 같은 자료구조를 쓴다. DAG는 순환(cycle)이 없어야 하는데, CodeBuild는 `depend-on`에 순환이 있으면 빌드 생성 시점에 오류를 반환한다. 위상 정렬(Kahn's algorithm 또는 DFS-based)로 실행 순서를 결정한다.

> 🎯 **시나리오**: "5개 마이크로서비스가 있다. 각각 ARM/x86 이미지를 만들어야 한다. 일부는 공통 라이브러리에 의존한다." 최적 설계는: (1) `build-graph`로 공통 라이브러리를 첫 번째 노드로, 나머지 서비스를 `depend-on: [common_lib]`으로 설정 → (2) 각 서비스 내에서 ARM/x86을 `build-list`로 병렬 처리 → (3) S3 캐시로 공통 라이브러리 컴파일 결과 공유. 총 실행 시간 = common_lib 빌드 시간 + max(서비스 빌드 시간).

## Reserved Capacity (Fleet): Provisioning을 제거하는 방법

빌드 컨테이너가 시작되는 데 걸리는 시간이 "Provisioning time"이다. 빈도가 낮은 빌드에서는 무시해도 되지만, 하루 200번 빌드하는 팀에서 Provisioning이 30초라면 하루 100분이 낭비된다.

**Reserved Capacity (Fleet)**는 빌드 컨테이너를 미리 워밍업해두는 pool을 유지한다. 빌드 요청이 오면 이미 준비된 컨테이너로 바로 시작한다.

```bash
# Fleet 생성
aws codebuild create-fleet \
  --name myapp-fleet \
  --base-capacity 4 \
  --environment-type LINUX_CONTAINER \
  --compute-type BUILD_GENERAL1_MEDIUM \
  --scaling-configuration scalingType=TARGET_TRACKING_SCALING,targetTrackingScalingConfigs=[{metricType=FLEET_UTILIZATION_RATE,targetValue=0.7}]
```

Fleet은 시간당 약정 비용을 낸다. 빌드 빈도가 높을 때 이득이고, 빈도가 낮으면 손해다. 손익분기점은 "Fleet 비용 < (Provisioning 시간 절감 × 빌드 빈도 × 시간당 컴퓨트 비용)"으로 계산한다.

VPC 모드와 결합하면 ENI 생성 시간도 제거되어 추가 단축이 가능하다.

> 📚 **사례**: 2022년 Shopify가 Engineering Blog에 공개한 사례에 따르면, 하루 약 12만 건의 CI 빌드를 처리하는 과정에서 Provisioning 오버헤드가 누적 CPU 시간의 8%를 차지했다. Reserved Capacity(유사 개념)를 도입한 뒤 이 오버헤드가 1% 미만으로 줄었다. 빌드 빈도가 클수록 Provisioning 최적화의 ROI가 크다는 교훈이다.

## GCP Cloud Build vs CodeBuild: 캐시 전략 비교

| 항목 | CodeBuild | Cloud Build |
|------|-----------|-------------|
| 캐시 저장소 | S3 (영속) / 로컬 (호스트) | GCS (영속) / 호스트 |
| Docker 레이어 캐시 | Local Mode + BuildKit+ECR | `--cache` 옵션 + Artifact Registry |
| 캐시 키 설정 | 자동 (프로젝트+브랜치 기반) | 커스텀 키 지원 |
| 분산 캐시 | BuildKit + ECR registry cache | Kaniko + Artifact Registry |
| 캐시 비용 | S3 저장 + GET/PUT 비용 | GCS 저장 + 작업 비용 |
| 캐시 만료 | 30일 미사용 자동 삭제 | GCS lifecycle 정책으로 제어 |

Cloud Build의 장점은 캐시 키를 파일 해시 기반으로 커스텀할 수 있어 더 세밀한 캐시 전략이 가능하다는 것이다. CodeBuild는 캐시 키 커스터마이징이 제한적이지만 S3와의 통합이 자연스럽다.

> 💡 **관련 이론**: 캐시 무효화(Cache Invalidation)는 컴퓨터 과학에서 "가장 어려운 두 가지 문제"(Phil Karlton) 중 하나다. 빌드 캐시에서 언제 캐시를 버리고 새로 빌드해야 하는가는 간단한 문제가 아니다. `package-lock.json`이 바뀌면 `node_modules` 캐시를 무효화해야 하지만, CodeBuild의 캐시는 경로 기반이라 이 논리를 자동으로 처리하지 않는다. 이것이 Gradle Wrapper, Maven Wrapper, Bazel 같은 도구들이 자체 캐시 무효화 논리를 가진 이유다.

## 빌드 시간 측정: CloudWatch 지표 활용

```bash
# 빌드 단계별 시간 확인
aws codebuild batch-get-builds --ids <build-id> \
  --query 'builds[0].phases[*].{Phase:phaseType,Status:phaseStatus,Duration:durationInSeconds}'
```

CloudWatch에서 CodeBuild 지표:
- `BuildDuration` — 전체 빌드 시간
- `QueuedDuration` — 빌드 큐 대기 시간
- `SubmittedDuration` — 제출 후 시작까지 시간
- `ProvisioningDuration` — 컨테이너 provisioning 시간
- `DownloadSourceDuration` — 소스 클론 시간

캐시 최적화 전후를 비교할 때 이 지표들을 사용한다. 단순히 "빌드 시간"만 보면 캐시 오버헤드가 다른 단계의 단축과 상쇄되어 효과를 오판할 수 있다.

## 풀 예시: 멀티 노드 병렬 빌드 buildspec

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

빌드 캐시는 "설정하면 끝"이 아니다. 캐시 적중률을 CloudWatch로 추적하고, 캐시가 너무 크면 경로를 좁히거나 BuildKit+ECR 방식으로 전환한다. 내일은 이 파이프라인에서 비밀번호를 안전하게 다루는 방법으로 들어간다.

---

## 📝 연습 문제

**문제 1.** S3 캐시와 Local Custom Cache의 가장 중요한 차이는 무엇인가?

A) S3 캐시가 항상 더 빠르다
B) S3 캐시는 빌드 간 영속적이고 모든 호스트에서 접근 가능하다; Local 캐시는 동일 빌드 호스트에만 유지된다
C) Local 캐시만 `node_modules`를 저장할 수 있다
D) S3 캐시는 Lambda compute에서만 동작한다

**정답: B**
해설: 핵심 차이는 영속성과 호스트 의존성이다. CodeBuild는 빌드마다 다른 호스트에 배정될 수 있어 Local 캐시는 같은 호스트가 다시 배정될 때만 효과가 있다. S3 캐시는 어느 호스트에서든 동일한 버킷을 참조해 항상 이전 빌드의 캐시를 재사용할 수 있다. 대신 S3 캐시는 다운로드/업로드 오버헤드가 있다.

---

**문제 2.** Local Docker Layer Cache를 활성화하려면 반드시 필요한 설정은?

A) S3 Cache와 함께 활성화
B) `privilegedMode: true` (Docker-in-Docker를 위한 elevated privileges)
C) VPC 모드 활성화
D) ARM 컨테이너 타입 사용

**정답: B**
해설: Local Docker Layer Cache는 빌드 컨테이너 안에서 Docker daemon을 실행해야 한다(Docker-in-Docker). 이를 위해 `privilegedMode: true`가 필수다. privilegedMode 없이 Docker Layer Cache를 설정하면 빌드가 시작은 되지만 레이어 캐시가 실제로 동작하지 않는다.

---

**문제 3.** `npm install`이 매 빌드 4분을 차지한다. 빌드 호스트가 매번 달라지는 환경에서 가장 효과적인 캐시 전략은?

A) Local Custom Cache로 `node_modules/**/*` 캐시
B) S3 Cache로 `node_modules/**/*`와 `/root/.npm/**/*` 캐시
C) BuildKit + ECR Registry Cache로 Docker 레이어에 `npm install` 포함
D) Compute Type을 2XLARGE로 업그레이드

**정답: C**
해설: 빌드 호스트가 매번 달라지면 Local 캐시는 효과가 없다. S3 캐시(B)도 가능하지만, `node_modules`가 크면 다운로드 오버헤드가 크다. BuildKit + ECR Registry Cache(C)는 Docker 레이어 단위로 캐시가 저장되어 ECR에서 가져오기 때문에 호스트 의존이 없고, `npm install` 레이어만 선택적으로 재사용할 수 있다. D는 I/O 바운드 문제에 CPU를 늘리는 잘못된 접근이다.

---

**문제 4.** Build Batch의 `fast-fail: false`로 설정했다. `unit_test`가 실패했을 때 `lint`의 동작은?

A) `lint`도 즉시 중단된다
B) `lint`는 `unit_test`에 의존하지 않으므로 계속 실행된다
C) 전체 Batch가 중단된다
D) `lint`가 `unit_test`를 재실행한다

**정답: B**
해설: `fast-fail: false`이면 의존 관계가 없는 빌드 노드는 다른 노드의 실패에 영향받지 않고 계속 실행된다. `unit_test`와 `lint`가 병렬로 실행 중이라면, `unit_test`가 실패해도 `lint`는 독립적으로 완료된다. `fast-fail: true`라면 `lint`도 취소된다.

---

**문제 5.** Reserved Capacity (Fleet) 도입이 효과적인 시나리오는?

A) 하루 5회 미만의 빌드, 빌드당 30분
B) 하루 200회 이상의 빌드, Provisioning 오버헤드가 전체 시간의 20%
C) 단일 대용량 배치 빌드
D) Lambda compute를 사용하는 빌드

**정답: B**
해설: Reserved Capacity는 워밍업된 컨테이너 pool을 유지하므로 고정 비용이 발생한다. 빌드 빈도가 높고 Provisioning 시간이 전체에서 의미있는 비중을 차지할 때 ROI가 양수가 된다. 하루 5회 빌드에서는 Fleet 유지 비용이 절감 효과를 초과한다. 빌드당 Provisioning 30초, 하루 200회면 1시간이 절감된다 — 이 시간의 비용이 Fleet 비용보다 크면 도입이 합리적이다.

---

**문제 6.** ECR Pull Through Cache를 사용하는 가장 중요한 이유는?

A) ECR에 이미지를 직접 빌드하기 위해
B) Docker Hub의 anonymous pull limit(100 pulls/6시간/IP)을 우회하고 CodeBuild 빌드가 ECR에서 base image를 가져오게 하기 위해
C) Cross-region 이미지 복제를 위해
D) Multi-arch 이미지 생성을 위해

**정답: B**
해설: CodeBuild 빌드들이 NAT Gateway를 공유하면 같은 공인 IP에서 Docker Hub에 pull 요청이 몰린다. Rate Limit(100 pulls/6시간)을 초과하면 빌드가 "toomanyrequests" 오류로 실패한다. ECR Pull Through Cache를 설정하면 첫 번째 pull만 Docker Hub에서 가져오고, 이후 pull은 ECR에서 처리된다. 비용 절감과 신뢰성 향상이 동시에 된다.

---

**문제 7.** Build Batch로 실행 중인 빌드의 총 실행 시간을 결정하는 것은?

A) 모든 빌드 노드의 시간 합계
B) 의존 그래프에서 Critical Path(가장 긴 경로)의 시간
C) 가장 빠른 노드의 시간
D) 첫 번째 노드의 시간

**정답: B**
해설: 병렬 빌드에서 전체 실행 시간은 Critical Path, 즉 의존 관계 체인에서 가장 긴 경로의 시간이다. 예를 들어 `lint(2분)`, `unit_test(5분)`, `integration_test(3분, depends on unit_test)`, `package(4분, depends on lint+integration_test)`가 있다면 Critical Path는 `unit_test + integration_test + package = 12분`이다. `lint`는 병렬로 2분에 끝나지만 전체를 결정하지 않는다. 이것이 프로젝트 관리의 Critical Path Method(CPM)와 동일한 개념이다.

---
