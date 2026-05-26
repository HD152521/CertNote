# Day 5 - Week 3 복습: CodeBuild 통합 시나리오와 실전 판단력

이번 주를 관통하는 하나의 질문은 "빌드 환경을 얼마나 코드처럼 다루는가"였다. buildspec.yml은 빌드 절차를, 캐시 전략은 빌드 속도를, secrets 설정은 보안 경계를, VPC 모드는 네트워크 경계를 코드로 표현한다. ARM 빌드까지 더하면 아키텍처 선택도 빌드 파이프라인 안으로 들어온다.

DOP-C02 시험은 이 요소들을 따로 묻지 않는다. "이 회사에 이런 제약이 있을 때 어떤 구성이 맞는가"라는 통합 형태로 묻는다. 오늘은 그 통합 판단력을 연습한다. 먼저 핵심 비교 구도를 한눈에 정리한 다음, 함정 패턴을 짚고, 시나리오 12문항으로 판단력을 검증한다.

주간 복습이 단순한 요약이 되면 안 된다. "왜 A이고 왜 B가 아닌지"를 스스로 설명할 수 있는 수준이 목표다. 설명을 못하면 시험장에서 90%가 맞아 보이는 보기 두 개 앞에서 멈춘다.

> 💡 **복습의 목적**: Week 3 각 Day의 내용은 독립적으로 배웠지만, 실제 문제는 이 지식이 섞인다. "VPC 모드 빌드에서 Secrets Manager를 쓰는데 네트워크 에러가 난다" 같은 문제는 VPC + Secrets Manager + 엔드포인트를 동시에 알아야 풀린다. 오늘은 그 연결을 만드는 날이다.

---

## Week 3 핵심 개념 재구성

### buildspec.yml 구조: 단계와 흐름

buildspec.yml의 4단계(`install → pre_build → build → post_build`)는 순서에 의미가 있다. `install`은 런타임 자체를 준비하고, `pre_build`는 로그인·환경 확인, `build`는 실제 컴파일·테스트, `post_build`는 이미지 push·태그·알림을 담당한다. `finally` 블록은 어느 단계에서든 실패해도 실행된다 — 정리 작업(임시 파일 삭제, 실패 알림)에 쓴다.

```yaml
version: 0.2
phases:
  install:
    runtime-versions:
      java: corretto17
    commands:
      - echo "도구 설치"
  pre_build:
    commands:
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
  build:
    commands:
      - mvn test
      - docker build -t $IMAGE_TAG .
  post_build:
    commands:
      - docker push $IMAGE_TAG
    finally:
      - echo "빌드 종료 (성공/실패 무관)"
env:
  secrets-manager:
    DB_PASS: prod/myapp:db_password
  exported-variables:
    - IMAGE_TAG
reports:
  JUnitResults:
    files:
      - '**/surefire-reports/*.xml'
    file-format: JUNITXML
cache:
  paths:
    - '/root/.m2/**/*'
```

> 🔍 **더 깊이**: `exported-variables`는 CodePipeline과 통합 시 중요하다. CodeBuild가 생성한 변수(예: `IMAGE_TAG`)를 다음 Action이 참조할 수 있게 한다. ECS Blue/Green 파이프라인에서 CodeBuild가 이미지 URI를 `exported-variables`로 내보내고, Deploy Action이 이를 받아 Task Definition에 주입하는 패턴이 시험에 자주 등장한다.

> 💡 **관련 이론**: `finally` 블록은 프로그래밍 언어의 `try-finally` 패턴을 빌드 단계에 적용한 것이다. 실패 시에도 반드시 실행되어야 하는 "정리 작업"을 `finally`에 두는 것은 **Resource Acquisition Is Initialization(RAII)** 원칙과 맥락이 같다 — 자원(로그, 임시 파일, 외부 서비스 상태)은 사용 후 반드시 정리되어야 한다.

---

### 캐시 전략 비교: 언제 무엇을 쓰는가

캐시는 "어디에 저장하는가"와 "무엇을 캐시하는가"로 나뉜다.

| 캐시 유형 | 저장 위치 | 호스트 이동 시 | 적합한 대상 | 주의점 |
|-----------|-----------|--------------|-------------|--------|
| Local Source | 빌드 호스트 디스크 | 미스 | Git 소스 클론 시간 절감 | 호스트 고정 환경에서만 효과 |
| Local Docker Layer | 빌드 호스트 Docker | 미스 | Dockerfile 레이어 재사용 | `privilegedMode: true` 필수 |
| S3 Custom | S3 버킷 | 히트 | node_modules, .m2, .gradle | 오브젝트 크기 주의 (500MB+) |
| BuildKit + ECR Registry | ECR | 히트 | Docker 레이어 (npm install 포함) | ECR Pull Through Cache 조합 |

```yaml
# S3 캐시 예시
cache:
  type: S3
  location: my-codebuild-cache/java-build
  paths:
    - '/root/.m2/**/*'
    - '/root/.gradle/caches/**/*'
```

```yaml
# Local Docker Layer 캐시 (privilegedMode 필요)
cache:
  type: LOCAL
  modes:
    - LOCAL_DOCKER_LAYER_CACHE
    - LOCAL_SOURCE_CACHE
```

> ⚠️ **함정**: `node_modules`를 S3 캐시로 올릴 때 디렉토리가 500MB 이상이면 S3 업로드/다운로드 오버헤드가 `npm install` 시간보다 길어지는 역효과가 난다. 이 경우 Dockerfile에 `npm install` 레이어를 분리하고 BuildKit + ECR Registry Cache를 쓰는 것이 더 효율적이다.

> 📚 **사례**: 대형 Java 프로젝트(Maven 의존성 3GB+)에서 S3 캐시를 적용했더니 오히려 빌드가 느려진 사례가 있다. 원인은 3GB S3 다운로드 시간(2분)이 Maven 의존성 해결(40초)보다 길었기 때문이다. 해결책은 S3 캐시 경로를 `~/.m2/repository/com/mycompany/**/*`처럼 내부 아티팩트만 포함하도록 좁히는 것이었다.

---

### Secrets Manager vs Parameter Store: 선택 기준 트리

```
비밀값인가?
  ├─ 자동 회전 필요?
  │   └─ YES → Secrets Manager ($0.40/시크릿/월)
  │           ├─ RDS 자격 증명: RDS Rotation Lambda 자동 생성
  │           ├─ 커스텀 값: 직접 Rotation Lambda 작성
  │           └─ buildspec: env.secrets-manager
  └─ 단순 설정값, 회전 불필요?
      ├─ 무료면 충분? → Parameter Store Standard (무료)
      │               └─ buildspec: env.parameter-store
      └─ TPS > 40 필요? → Parameter Store Advanced ($0.05/1만 API 호출)
```

Cross-account 시나리오: 다른 계정의 Secrets Manager에 있는 비밀을 CodeBuild가 읽으려면
1. 비밀값에 Resource-based Policy 추가 (빌드 계정의 Role ARN 허용)
2. 비밀값을 암호화한 KMS 키에 Grant 추가
3. CodeBuild Service Role에 `secretsmanager:GetSecretValue` + `kms:Decrypt` 권한

> 💡 **관련 이론**: Secrets Manager의 자동 회전은 **Rotation Lambda**가 실제 교체를 수행하는 구조다. Lambda가 새 비밀을 생성하고(`createSecret`) → DB에 적용하고(`setSecret`) → 검증하고(`testSecret`) → 활성화(`finishSecret`)하는 4단계 프로토콜이다. 이 프로토콜 이해가 "회전 중 서비스 다운타임이 없는 이유"를 설명한다 — `AWSPENDING` 라벨의 새 버전이 준비되고 검증된 후에야 `AWSCURRENT`로 승격된다.

> 🔍 **더 깊이**: Parameter Store의 40 TPS 제한은 대규모 Lambda 환경에서 실제 병목이 된다. 콜드 스타트 시 수백 개 Lambda가 동시에 Parameter Store에서 설정을 읽으면 `ThrottlingException`이 발생한다. 해결 방법: (1) Parameter Store Advanced로 업그레이드(TPS 한도 증가), (2) Lambda 초기화 시 설정을 메모리에 캐시(같은 실행 환경은 재사용), (3) Secrets Manager(더 높은 TPS 한도) 사용.

---

### VPC 모드 아키텍처: 엔드포인트 설계

VPC 모드 CodeBuild는 일반 인터넷에 직접 접근할 수 없다. 외부 서비스마다 적절한 경로가 필요하다.

```
[CodeBuild Container in Private Subnet]
    │
    ├─ S3 (artifact, cache) → S3 Gateway Endpoint (무료, 라우팅 테이블)
    ├─ Secrets Manager → Interface Endpoint ($0.01/시간)
    ├─ KMS → Interface Endpoint ($0.01/시간)
    ├─ ECR API → Interface Endpoint ($0.01/시간)
    ├─ ECR DKR (Docker 레이어) → Interface Endpoint ($0.01/시간)
    ├─ CloudWatch Logs → Interface Endpoint 또는 NAT Gateway
    └─ 외부 인터넷 (npm, Maven Central 등) → NAT Gateway 필수
```

> ⚠️ **함정**: "VPC 모드 켰더니 S3 권한 에러가 난다"의 원인은 거의 S3 Gateway Endpoint 미설정이다. Gateway Endpoint는 라우팅 테이블에 자동 추가되지 않는다 — 직접 VPC 설정에서 연결하고, 빌드 서브넷의 라우팅 테이블에 포함해야 한다. Interface Endpoint와 달리 무료이므로 VPC 빌드에서는 항상 설정한다.

> 📚 **사례**: 한 팀이 VPC 모드로 CodeBuild를 마이그레이션한 후 빌드 비용이 월 $200 증가했다. 원인을 추적하니 NAT Gateway를 통해 S3에 접근하는 데이터 전송 비용이었다. S3 Gateway Endpoint를 추가하자 비용이 $0으로 줄었다. ECR Interface Endpoint도 추가해 Docker 레이어 pull 비용도 절감했다. VPC 모드는 네트워크 경로 최적화가 비용에 직결된다.

---

### Custom Docker Image vs AWS Managed Image

| 항목 | AWS Managed Image | Custom Image (ECR) |
|------|------------------|-------------------|
| 유지보수 | AWS가 패치 | 팀이 직접 빌드·푸시 |
| 빌드 시작 속도 | 빠름 (사전 준비) | 느릴 수 있음 (이미지 pull) |
| 도구 커스터마이징 | 제한적 | 완전 자유 |
| `imagePullCredentialsType` | `CODEBUILD` | `SERVICE_ROLE` |
| `privilegedMode` | 불필요 (보통) | Docker 빌드 시 필요 |
| 비용 | 없음 | ECR 저장 + 전송 |

Custom Image의 `imagePullCredentialsType: SERVICE_ROLE`은 CodeBuild Service Role이 ECR에서 이미지를 pull하는 권한을 쓴다는 뜻이다. 이 Role에 `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage`, `ecr:GetAuthorizationToken` 권한이 필요하다.

> 💡 **관련 이론**: Custom Image를 쓰는 핵심 이유는 **빌드 재현성(Reproducibility)**이다. 팀이 직접 관리하는 이미지는 "언제 빌드해도 같은 도구 버전으로 같은 결과"를 보장한다. AWS Managed Image는 AWS가 업데이트하면 빌드 결과가 달라질 수 있다 (Python 3.11.1 → 3.11.4 패치 등). 금융·의료 같이 감사 추적이 필요한 환경에서는 Custom Image + 이미지 다이제스트(태그 아닌 SHA256) 지정이 표준이다.

---

### Build Batch: 병렬화 전략

| Batch 유형 | 구조 | 적합한 케이스 |
|-----------|------|--------------|
| `build-list` | 독립 빌드 병렬 실행 | 멀티 아키텍처 (x86/ARM), 멀티 서비스 |
| `build-matrix` | 변수 조합의 모든 경우 | 멀티 런타임 × 멀티 OS 조합 |
| `build-graph` | 의존 관계 있는 DAG | 공통 빌드 → 의존 빌드 순서 보장 |

```yaml
# build-matrix 예시: Python 3.9/3.10/3.11 × Linux/ARM
batch:
  build-matrix:
    static:
      ignore-failure: false
    dynamic:
      buildspec:
        - buildspec_linux.yml
        - buildspec_arm.yml
      env:
        variables:
          PYTHON_VERSION:
            - "3.9"
            - "3.10"
            - "3.11"
```

이 설정은 2 × 3 = 6개 빌드를 병렬로 실행한다.

> 🔍 **더 깊이**: `build-graph`는 DAG(Directed Acyclic Graph) 의존성을 지원한다. "공통 라이브러리를 먼저 빌드하고, 성공하면 그 아티팩트를 사용하는 서비스 A/B/C를 병렬 빌드"하는 패턴이다. 모노레포에서 특히 유용하다. `depend-on` 필드로 의존성을 선언하면 CodeBuild가 토폴로지 정렬을 자동으로 수행한다.

---

### Reserved Capacity Fleet vs On-Demand: 경제성 계산

| 항목 | On-Demand | Reserved Capacity Fleet |
|------|-----------|------------------------|
| 과금 방식 | 빌드 시간(분) 단위 | Fleet 유지 시간 (빌드 여부 무관) |
| Provisioning 대기 | 10~30초 | 거의 0초 |
| 적합 환경 | 산발적 빌드 | 연속적·고빈도 빌드 |
| 최소 Fleet 크기 | N/A | 1대 |

손익분기점 계산 예:
- Provisioning 낭비: 하루 300빌드 × 30초 = 2.5시간/일
- Fleet 고정 비용이 이 2.5시간의 On-Demand 비용보다 낮으면 Fleet이 유리

> 💡 **관련 이론**: Fleet의 경제성은 **고정비 vs 변동비** 선택이다. 수요가 예측 가능하고 지속적이면 고정비(Fleet)가 유리하고, 수요가 불규칙하면 변동비(On-Demand)가 유리하다. AWS의 Reserved Instance와 동일한 논리다. "하루 중 특정 시간에만 집중"하는 빌드 패턴이라면 Fleet 크기를 시간대별로 달리 설정하거나, Auto Scaling이 지원되는 Fleet을 고려한다.

---

## 함정 패턴 종합

**함정 1: "빠르게 하려면 Compute Type을 올려라"**
항상 틀리다. I/O 바운드 빌드(패키지 다운로드, S3 업로드, ECR push)는 CPU를 올려도 속도가 안 변한다. CloudWatch의 `BuildDuration`과 각 페이즈 시간을 먼저 측정하고, 병목 페이즈에 맞는 수단(캐시, 병렬, 네트워크 경로)을 쓴다.

**함정 2: "시크릿은 env.variables에 KMS로 암호화하면 된다"**
`env.variables`는 buildspec.yml에 평문으로 적히고 빌드 로그에 노출된다. KMS 암호화 여부와 무관하게, 값을 buildspec에 직접 쓰면 누출 위험이 있다. 반드시 `env.secrets-manager` 또는 `env.parameter-store`를 쓴다.

**함정 3: "Local Cache를 쓰면 항상 빠르다"**
빌드 호스트가 바뀌면 캐시 미스. S3 Cache가 더 안정적이다. 단, S3 Cache도 오브젝트가 너무 크면 다운로드 오버헤드가 역효과를 낸다.

**함정 4: "ARM 빌드는 QEMU로 해도 된다"**
동작은 하지만 느리고, native code(C/C++/Rust) 컴파일에서 에뮬레이션 불안정 문제가 생길 수 있다. ARM_CONTAINER + native 빌드가 표준이다.

**함정 5: "VPC 모드면 모든 AWS 서비스에 자동 접근된다"**
틀리다. VPC 모드는 빌드 컨테이너를 VPC에 붙이는 것뿐이다. 각 AWS 서비스에 접근하려면 VPC Endpoint(Gateway 또는 Interface)를 별도 설정해야 한다. 인터넷이 필요하면 NAT Gateway도 필요하다.

**함정 6: "Secrets Manager는 항상 Parameter Store보다 낫다"**
비용이 다르다. 회전 불필요한 단순 설정값 95개에 Secrets Manager를 쓰면 월 $38이지만, Parameter Store Standard를 쓰면 $0이다. 요구사항(회전 필요 여부)에 따라 도구를 선택한다.

> ⚠️ **함정 종합**: 이 함정들의 공통 패턴은 "요구사항을 보지 않고 도구 이름으로 답을 고른다"는 것이다. 시험 문제에서 요구사항 키워드를 먼저 찾는 습관이 핵심이다. "자동 회전" → Secrets Manager, "호스트 고정" → Local Cache, "ARM 워크로드" → ARM_CONTAINER, "Private 리소스" → VPC 모드 + 엔드포인트.

> 🎯 **시나리오**: 한 팀이 "빌드가 느리다"고 보고했다. CloudWatch를 보니 전체 빌드 8분 중 `DOWNLOAD_SOURCE` 2분 + `PRE_BUILD`(npm install) 4분 + 실제 `BUILD` 2분이었다. 어디부터 최적화할까? 정답은 **PRE_BUILD(npm install)**가 최대 병목이므로 S3 Cache 또는 BuildKit + ECR Cache 적용이 첫 번째다. `DOWNLOAD_SOURCE`는 Local Source Cache로 줄일 수 있지만 빌드 호스트가 바뀌면 효과가 없으므로 Git shallow clone 설정도 고려한다. Compute Type 업그레이드는 이 케이스에서 효과 없다.

---

## 마무리: Week 3 지식의 연결

한 주 동안 배운 내용을 하나의 흐름으로 연결하면:

**buildspec.yml** → 빌드 절차를 코드로 표현. 각 페이즈는 명확한 역할이 있고, `finally`는 정리 작업이다.

**캐시** → 빌드 속도의 실질적 개선. 호스트 고정 여부와 오브젝트 크기가 전략을 결정한다.

**Secrets** → 비밀값은 반드시 `env.secrets-manager` 또는 `env.parameter-store`로. 회전 필요 여부가 Secrets Manager/Parameter Store를 가른다.

**VPC 모드** → Private 리소스 접근의 유일한 방법. 엔드포인트 설계와 서브넷 크기가 운영 품질을 결정한다.

**Build Batch** → 병렬화 전략. 독립 빌드는 `build-list`, 조합은 `build-matrix`, 의존성은 `build-graph`.

**Custom Image** → 재현성이 중요한 환경에서 AWS Managed Image 대신. `SERVICE_ROLE` 자격 증명 유형이 필수.

**Reserved Fleet** → 고빈도 빌드에서 Provisioning 오버헤드 제거. 고정비와 변동비의 손익분기점 계산이 도입 결정을 만든다.

> 📚 **Week 3 전체 사례**: 어떤 회사가 모노레포에서 10개 마이크로서비스를 빌드한다. 각 서비스는 x86과 ARM 이미지가 필요하고(20개 빌드), DB 마이그레이션 SQL도 실행해야 하며, 모든 비밀번호는 30일마다 회전한다. 네트워크는 Private VPC 안에 있다. 이 시나리오에서의 정답 조합: **Build Batch build-list**(20개 병렬) + **VPC 모드**(Private DB 접근) + **S3 Gateway Endpoint**(artifact 업로드) + **Secrets Manager with Rotation**(DB 비밀번호) + **ARM_CONTAINER + LINUX_CONTAINER 혼합**(멀티 아키텍처) + **Reserved Fleet**(하루 수십 번 빌드) + **ECR Pull Through Cache**(Docker Hub Rate Limit 방지).

---

## 📝 연습 문제

**문제 1.** `npm install`이 매 빌드 4분을 차지한다. 빌드 호스트는 매번 다를 수 있다. 가장 효과적인 개선은?

A) Compute Type을 `BUILD_GENERAL1_2XLARGE`로 업그레이드
B) S3 Cache로 `node_modules/**/*` 캐시; 또는 BuildKit + ECR Registry Cache로 Docker 레이어에 npm install 포함
C) Local Source Cache만 활성화
D) npm 대신 yarn을 사용

**정답: B**
해설: 호스트가 매번 달라지면 Local Cache는 효과가 없다. S3 Cache는 어느 호스트에서든 이전 빌드의 캐시를 재사용할 수 있다. 단, `node_modules`가 500MB 이상이면 S3 업로드/다운로드 오버헤드가 생기므로 BuildKit + ECR Registry Cache(npm install 레이어만 캐시)가 더 효율적일 수 있다. A는 I/O 바운드 문제에 CPU를 늘리는 잘못된 접근이고, C는 호스트 의존적이라 호스트가 바뀌면 미스가 난다.

---

**문제 2.** 빌드가 Private 서브넷의 Aurora PostgreSQL에 마이그레이션 SQL을 실행해야 한다. 가장 적절한 구성은?

A) Aurora를 Public 서브넷으로 이동
B) CodeBuild VPC 모드 + Aurora와 같은 VPC + Security Group으로 5432 포트 허용 + Service Role에 ENI 생성 권한
C) Lambda 함수를 통해 우회
D) EC2 Bastion에서 수동 실행

**정답: B**
해설: Private 리소스 접근 = VPC 모드가 정답이다. Aurora와 같은 VPC에서 빌드 컨테이너가 실행되어야 Private IP로 접근이 가능하다. Security Group에서 빌드 컨테이너 SG → Aurora SG의 5432 포트를 허용해야 한다. A는 보안상 불가, C는 복잡도를 불필요하게 높임, D는 자동화가 안 됨. Service Role에는 `ec2:CreateNetworkInterface`, `ec2:DescribeNetworkInterfaces`, `ec2:DeleteNetworkInterface` 권한이 필요하다.

---

**문제 3.** DB 비밀번호가 30일마다 자동 회전된다. 빌드가 항상 현재 유효한 비밀번호로 DB 마이그레이션을 실행해야 한다. 가장 적절한 구성은?

A) Secrets Manager에 비밀번호 저장 + 자동 Rotation Lambda + buildspec `env.secrets-manager`로 참조
B) Parameter Store Standard에 평문으로 저장하고 회전 시 수동 업데이트
C) buildspec `env.variables`에 평문으로 하드코딩
D) IAM Database Authentication으로 비밀번호 없이 연결

**정답: A** (D도 고급 선택지)
해설: 자동 회전 = Secrets Manager가 명확한 답이다. buildspec의 `env.secrets-manager`는 빌드 시작 시 `AWSCURRENT` 라벨의 최신 비밀번호를 가져온다. 회전 후 다음 빌드부터 자동으로 새 비밀번호를 사용한다. B는 사람이 매달 수동 업데이트해야 하고, C는 하드코딩으로 보안상 최악이다. D(IAM Database Authentication)도 유효하지만 Aurora + IAM 설정이 추가로 필요하다.

---

**문제 4.** Docker Hub Rate Limit으로 매일 오전 빌드가 실패한다. 장기적으로 가장 효과적인 해결은?

A) ECR Pull Through Cache를 Docker Hub upstream으로 설정하고 Dockerfile FROM을 ECR 경로로 변경
B) 빌드 시간을 Rate Limit이 리셋되는 시간으로 스케줄링
C) Docker Hub 유료 플랜 구매
D) 동시 빌드를 1개로 제한

**정답: A**
해설: ECR Pull Through Cache는 첫 번째 pull만 Docker Hub에서 가져오고 이후는 ECR에서 제공한다. Docker Hub Rate Limit에서 근본적으로 자유로워지고, ECR은 VPC 내에서 Interface Endpoint로 빠르게 접근할 수 있다. B는 임시방편이고 빌드 지연이 생긴다. C는 비용이 들고 고트래픽 팀에서는 여전히 한도 초과 가능하다. D는 빌드 처리량이 감소하고 근본 해결이 아니다.

---

**문제 5.** Java와 Python 서비스를 동시에 빌드하고, 각각 ARM/x86 이미지를 만들어야 한다. 총 4개 빌드 조합이 필요하다. 가장 효율적인 구성은?

A) 4개 별도 CodeBuild 프로젝트를 순차 실행
B) Build Batch `build-list`에 4개 노드 정의 (Java-x86, Java-ARM, Python-x86, Python-ARM) + 병렬 실행
C) 하나의 buildspec에서 순차적으로 4번 빌드
D) Jenkins 매트릭스 빌드로 위임

**정답: B**
해설: Build Batch `build-list`로 의존 관계 없는 4개 빌드를 동시에 실행한다. 전체 실행 시간은 가장 긴 단일 빌드 시간과 같다(병렬이므로). 순차 실행(A, C)은 4배 오래 걸린다. 각 노드에 적절한 compute type(`ARM_CONTAINER` 또는 `LINUX_CONTAINER`)을 지정하고, 결과 이미지를 `docker manifest`로 묶어 multi-arch 이미지를 완성한다.

---

**문제 6.** 빌드당 Provisioning 시간이 30초이고 하루 300번 빌드한다. 월 150시간이 Provisioning 낭비다. 가장 직접적인 해결은?

A) Compute Type을 키워서 빌드 자체를 빠르게
B) Reserved Capacity Fleet으로 워밍업된 컨테이너를 유지해 Provisioning 시간을 거의 0으로 단축
C) 빌드 주기를 줄임
D) VPC 모드를 비활성화

**정답: B**
해설: Provisioning 시간은 컨테이너를 시작하는 오버헤드다. Reserved Capacity Fleet은 미리 워밍업된 컨테이너 풀을 유지해 이 오버헤드를 제거한다. 하루 300번 × 30초 = 2.5시간이 절감된다. Fleet의 고정 비용과 절감 효과를 비교해 도입 여부를 결정한다. A는 Provisioning과 무관한 단계를 최적화하고, C는 빌드 횟수를 줄여 개발 속도에 영향을 준다.

---

**문제 7.** 100개 시크릿 중 회전 필요한 것은 5개다. 월 비용을 최소화하는 구성은?

A) 5개 Secrets Manager + 95개 Parameter Store Standard (약 $2/월)
B) 100개 Secrets Manager (약 $40/월)
C) 100개 Parameter Store Advanced (약 $5/월)
D) 5개 Secrets Manager + 95개 Parameter Store Advanced (약 $6.75/월)

**정답: A**
해설: Parameter Store Standard는 파라미터당 비용이 없다(API 호출도 무료). 회전이 필요한 5개만 Secrets Manager($0.40 × 5 = $2/월)에 두고, 나머지 95개는 Parameter Store Standard(무료)에 두는 것이 최저 비용이다. TPS 한도(40 TPS)가 문제가 되는 대규모 환경이 아니라면 이 구성이 최적이다. 요구사항 없이 비싼 도구를 선택하는 것은 DOP-C02에서 항상 틀린 보기다.

---

**문제 8.** VPC 빌드를 시작하니 `The maximum number of network interfaces has been reached for subnet` 에러가 난다. 가장 적절한 대응은?

A) NAT Gateway를 추가한다
B) 더 큰 CIDR의 서브넷으로 교체하거나 서브넷을 추가, `concurrentBuildLimit`으로 동시 빌드 수를 제한
C) Internet Gateway를 추가한다
D) Service Role에 추가 권한을 부여한다

**정답: B**
해설: 각 VPC 빌드는 서브넷에 ENI 1개를 생성하고 IP를 소비한다. `/24` 서브넷의 가용 IP(약 251개)를 초과하면 이 에러가 발생한다. 해결: (1) 더 큰 서브넷(`/22` = 1019 IP), (2) 여러 서브넷을 VPC 설정에 추가, (3) `concurrentBuildLimit`으로 동시 빌드 상한 설정. 권한 문제나 네트워크 게이트웨이 추가는 이 에러와 무관하다.

---

**문제 9.** 빌드 컨테이너에서 실패를 디버깅하려고 내부에 직접 접속이 필요하다. 가장 적절한 방법은?

A) EC2 Bastion을 경유해 SSH
B) `--debug-session-enabled`로 빌드 시작 후 SSM Session Manager로 컨테이너에 접속 (최대 7시간)
C) 빌드가 끝날 때까지 기다렸다가 새 EC2에 동일 환경을 재현
D) CloudWatch Logs에서 에러 메시지만 확인

**정답: B**
해설: CodeBuild Debug Session은 빌드가 실패한 페이즈에서 멈추고 7시간 동안 SSM Session Manager로 컨테이너에 직접 접속할 수 있게 한다. 컨테이너 내부에서 같은 명령을 수동으로 실행하고 환경 변수, 파일 시스템, 네트워크 상태를 점검할 수 있다. 이것이 "CodeBuild에서만 실패하는" 버그를 잡는 가장 직접적인 방법이다. A는 SSH 포트가 없고, C는 환경 재현이 어렵고, D는 맥락 정보가 부족하다.

---

**문제 10.** JUnit 테스트 결과를 CodeBuild 콘솔에서 시각화하고, 실패 시 SNS 알림을 보내려면?

A) buildspec `reports` 블록에 `JUNITXML` 지정 + EventBridge Rule(CodeBuild 빌드 상태 변경) → SNS Topic
B) S3에 XML 파일을 수동 업로드하고 Lambda로 파싱
C) CloudWatch Logs에 XML 텍스트 출력
D) Secondary artifact로 XML만 저장

**정답: A**
해설: `reports` 블록이 있어야 CodeBuild 콘솔에서 테스트 Pass/Fail이 시각화되고 이력이 추적된다. 단순히 Secondary artifact로 저장하면(D) 파일은 S3에 있지만 콘솔 시각화가 없다. SNS 알림은 EventBridge Rule로 CodeBuild 빌드 상태(`FAILED`) 이벤트를 감지해 SNS로 라우팅한다. 이 두 가지 조합이 표준이다.

---

**문제 11.** 멀티 계정 환경에서 CodeBuild가 Account B의 Secrets Manager 시크릿을 읽으려 한다. Account A에 CodeBuild가 있다. 필요한 구성 두 가지는?

A) Account B의 시크릿에 Resource-based Policy 추가(Account A의 CodeBuild Service Role ARN 허용) + Account B의 KMS 키에 Grant 추가
B) Account B의 IAM User를 만들어 Access Key를 Account A에 공유
C) Account A에서 sts:AssumeRole로 Account B IAM Role을 assume
D) Account B의 S3에 시크릿 값을 평문으로 복사

**정답: A**
해설: Secrets Manager는 Resource-based Policy로 크로스 계정 접근을 제어한다. Account B의 시크릿에 Account A CodeBuild Service Role이 `secretsmanager:GetSecretValue`를 허용받아야 하고, 그 시크릿을 암호화하는 KMS 키도 Account A Role에 Decrypt를 허용하는 Key Policy 또는 Grant가 필요하다. B는 장기 자격 증명 사용으로 보안상 좋지 않고, C는 IAM Role assume도 가능하지만 이 시나리오의 Secrets Manager 직접 접근 요건을 충족하려면 추가 설정이 필요하다. D는 보안 위반이다.

---

**문제 12.** CodeBuild 빌드에서 SBOM(Software Bill of Materials)을 생성해 공급망 보안을 강화하려 한다. 가장 적합한 구현 방식은?

A) post_build 페이즈에서 `syft` 또는 `trivy` 같은 도구로 SBOM 파일 생성 → Secondary artifact로 S3에 저장 + `reports` 블록으로 취약점 리포트 추가
B) IAM Policy에 SBOM 생성 권한을 부여
C) CloudFormation으로 SBOM 템플릿을 관리
D) CodeArtifact에서 자동으로 SBOM을 생성

**정답: A**
해설: SBOM은 "무슨 라이브러리가 포함됐는지"를 기록하는 파일이다. `syft`(Anchore), `trivy`, `cdxgen` 같은 오픈소스 도구로 빌드 산출물(JAR, 컨테이너 이미지, npm 패키지)을 분석해 SPDX 또는 CycloneDX 형식의 SBOM을 생성한다. Secondary artifact로 S3에 저장하면 감사 시 추적이 가능하다. 취약점 리포트는 `reports` 블록으로 CodeBuild 콘솔에서 시각화한다. buildspec.yml이 Git에 있으므로 이 절차 자체가 SLSA Level 2를 만족한다.

---
