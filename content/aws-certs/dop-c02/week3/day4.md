# Day 4 - VPC CodeBuild, Custom Image, ARM/Graviton: 빌드 환경의 경계 확장

CodeBuild의 기본 빌드 컨테이너는 퍼블릭 인터넷에 연결된다. npm, pip, Docker Hub에서 패키지를 가져오고, ECR에 이미지를 push한다. 이것은 대부분의 상황에서 충분하다. 하지만 두 가지 상황이 이 가정을 깬다.

첫 번째: 프라이빗 리소스 접근. RDS Aurora가 Private 서브넷에 있고, 빌드가 DB 마이그레이션을 실행해야 한다. 퍼블릭 인터넷에서 Private 서브넷의 DB에는 접근할 수 없다. 빌드가 VPC 안에 있어야 한다.

두 번째: ARM(Graviton) 워크로드. ECS나 EKS 클러스터가 Graviton 인스턴스를 쓴다면, 빌드도 ARM 환경에서 해야 arm64 이미지를 만들 수 있다. x86에서 arm64를 QEMU로 에뮬레이션해 빌드할 수 있지만, 느리고 불안정하다.

이 두 제약을 해결하는 것이 오늘의 주제다.

## VPC CodeBuild: ENI 기반 네트워크 통합

CodeBuild가 VPC 모드로 실행되면, 빌드 시작 시점에 지정된 서브넷에 **ENI(Elastic Network Interface)**를 동적으로 생성한다. 빌드 컨테이너는 이 ENI를 통해 VPC 내부 리소스에 접근한다. 빌드가 끝나면 ENI는 삭제된다.

**VPC 모드가 필요한 상황:**
- Private 서브넷의 RDS/ElastiCache/EFS 접근
- Direct Connect/VPN으로 연결된 온프레미스 Nexus/Artifactory
- VPC Endpoint를 통한 S3/ECR 접근 (NAT 비용 절감)
- Egress 트래픽 통제가 필요한 보안 정책

**VPC 모드 설정:**
```bash
aws codebuild update-project \
  --name myproj \
  --vpc-config vpcId=vpc-abc123,subnets=subnet-1a,subnet-2b,securityGroupIds=sg-xyz
```

**Service Role에 필요한 EC2 권한:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeVpcs",
        "ec2:DescribeDhcpOptions"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "ec2:CreateNetworkInterfacePermission",
      "Resource": "arn:aws:ec2:ap-northeast-2:123456789:network-interface/*",
      "Condition": {
        "StringEquals": {
          "ec2:Subnet": [
            "arn:aws:ec2:ap-northeast-2:123456789:subnet/subnet-1a",
            "arn:aws:ec2:ap-northeast-2:123456789:subnet/subnet-2b"
          ],
          "ec2:AuthorizedService": "codebuild.amazonaws.com"
        }
      }
    }
  ]
}
```

`ec2:CreateNetworkInterfacePermission`에 Condition이 있는 이유: 이 권한이 없으면 CodeBuild가 어느 서브넷에도 ENI를 못 만든다. 하지만 `Resource: "*"`로 열면 다른 서브넷에도 ENI를 만들 수 있게 되어 과도한 권한이 된다. Condition으로 지정된 서브넷과 `codebuild.amazonaws.com` 서비스만 허용하는 것이 최소 권한 원칙에 부합한다.

> ⚠️ **함정**: VPC 모드에서 빌드가 실패하는 가장 흔한 이유 3가지: (1) `ec2:CreateNetworkInterface` 권한 누락, (2) 서브넷에 가용한 IP 주소가 없음 (ENI가 IP를 소비), (3) Security Group의 아웃바운드 규칙이 필요한 포트를 막음. 순서대로 확인하면 대부분 해결된다.

> 💡 **관련 이론**: ENI(Elastic Network Interface)는 AWS 가상 네트워크의 기본 단위다. EC2 인스턴스에 붙여서 IP를 부여하듯, CodeBuild는 빌드마다 임시 ENI를 만들어 VPC에 "일시적으로 참여"한다. 이 방식은 Lambda의 VPC 통합과 동일하다. Lambda도 VPC 모드에서 ENI를 생성해 VPC 리소스에 접근한다. 차이는 Lambda는 Hyperplane ENI(공유 ENI)를 쓰고 CodeBuild는 전용 ENI를 쓴다는 것이다.

## VPC 내 인터넷 접근: NAT vs VPC Endpoint

Private 서브넷의 빌드 컨테이너가 인터넷(npmjs.com, Docker Hub)에 접근하려면:
- **NAT Gateway**: 사설 IP → NAT → 인터넷. 시간당 + 데이터 전송 비용.
- **VPC Endpoint**: 특정 AWS 서비스로 AWS 내부망을 통해 직접 접근.

**VPC Endpoint 종류와 비용:**
| 서비스 | Endpoint 종류 | 비용 |
|--------|--------------|------|
| S3 | Gateway Endpoint | **무료** |
| ECR (ecr.api, ecr.dkr) | Interface Endpoint | 시간당 + 데이터 전송 |
| Secrets Manager | Interface Endpoint | 시간당 + 데이터 전송 |
| KMS | Interface Endpoint | 시간당 + 데이터 전송 |
| CloudWatch Logs | Interface Endpoint | 시간당 + 데이터 전송 |
| Systems Manager | Interface Endpoint | 시간당 + 데이터 전송 |

**S3 Gateway Endpoint는 무조건 추가하라.** 무료이고, CodeBuild가 S3에서 아티팩트와 캐시를 주고받는 트래픽이 NAT를 거치지 않아 NAT 비용이 줄어든다.

인터넷 접근이 필요한 경우(npm, pip 등):
1. NAT Gateway + Private 서브넷 (표준, 비용 발생)
2. CodeArtifact + Upstream Repository (npm, pypi를 내부 저장소로 미러링)
3. ECR Pull Through Cache (Docker Hub 미러)

옵션 2가 보안과 비용 모두에서 가장 좋다 — 외부 패키지가 내부 저장소를 통하면 공급망 공격도 방어할 수 있다.

> 🔍 **더 깊이**: VPC Endpoint의 Interface Endpoint는 내부적으로 AWS PrivateLink 기술로 구현된다. PrivateLink는 서비스 제공자가 NLB를 앞에 두고, 소비자 VPC에 ENI를 생성해 TCP 레벨 연결을 제공한다. 트래픽이 인터넷을 경유하지 않아 보안이 강화되고, 데이터 전송 비용도 NAT보다 낮다(같은 AZ 내는 무료). VPC Endpoint에 DNS Resolution을 활성화하면 `ecr.dkr.ap-northeast-2.amazonaws.com`이 자동으로 VPC 내부 IP로 해석된다.

## Custom Container Image: 빌드 환경을 코드로 정의하기

AWS 제공 표준 이미지(`aws/codebuild/standard:7.0`)에는 많은 도구가 포함되어 있다. 하지만 Terraform, CDK, Helm, kubectl 같은 추가 도구가 필요하다면, 빌드마다 이 도구들을 설치하는 시간이 낭비된다.

해결책: 필요한 모든 도구가 사전 설치된 커스텀 이미지를 ECR에 두고, 빌드 환경으로 사용한다.

```dockerfile
# 커스텀 빌드 이미지 Dockerfile
FROM aws/codebuild/amazonlinux2-x86_64-standard:5.0

# Infrastructure tools
RUN curl -Lo terraform.zip https://releases.hashicorp.com/terraform/1.8.0/terraform_1.8.0_linux_amd64.zip && \
    unzip terraform.zip && mv terraform /usr/local/bin/ && rm terraform.zip

RUN npm install -g aws-cdk@2.140.0

RUN curl -LO "https://dl.k8s.io/release/v1.30.0/bin/linux/amd64/kubectl" && \
    install -m 0755 kubectl /usr/local/bin/kubectl

RUN curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

```yaml
# CodeBuild Project 설정에서 커스텀 이미지 지정
environment:
  type: LINUX_CONTAINER
  image: 123456789.dkr.ecr.ap-northeast-2.amazonaws.com/my-build-image:v1.2
  imagePullCredentialsType: SERVICE_ROLE   # CodeBuild Role로 ECR pull
  privilegedMode: true                     # Docker 빌드가 필요한 경우
```

**`imagePullCredentialsType` 옵션:**
- `SERVICE_ROLE`: CodeBuild Service Role이 ECR 이미지를 pull. 같은 계정 ECR에 적합.
- `CODEBUILD`: CodeBuild 서비스 자체의 권한 사용. 퍼블릭 이미지나 특수 경우.

Cross-account ECR이미지를 pull하려면 `SERVICE_ROLE`이 필요하고, 이미지가 있는 계정의 ECR Repository Policy에서 빌드 계정 Role을 허용해야 한다.

> 📚 **사례**: Airbnb는 2020년 엔지니어링 블로그에서 빌드 환경을 "건설 이미지(builder image)"로 표준화한 사례를 공개했다. 모든 팀이 동일한 버전의 Terraform, kubectl, 내부 도구를 포함한 이미지를 사용함으로써 "내 로컬에서는 됐는데 CI에서 안 됨" 문제가 90% 이상 줄었다. 빌드 환경 자체를 코드(Dockerfile)로 관리하고 버전을 고정하는 것이 핵심이었다.

## ARM/Graviton 빌드: 비용과 성능의 교점

AWS Graviton은 ARM 아키텍처 기반 프로세서로, 동일 vCPU 대비 EC2에서 약 20% 저렴하다. ECS, EKS, Lambda에서 Graviton 인스턴스/런타임을 사용하는 조직이 늘어남에 따라, 빌드도 ARM 환경에서 하는 것이 맞는 경우가 많다.

**CodeBuild ARM 이미지:**
| 이미지 | 아키텍처 | 계산 유형 |
|--------|---------|---------|
| `aws/codebuild/amazonlinux2-aarch64-standard:3.0` | arm64 | ARM_CONTAINER |
| `aws/codebuild/amazonlinux2-x86_64-standard:5.0` | amd64 | LINUX_CONTAINER |
| `aws/codebuild/standard:7.0` | amd64 | LINUX_CONTAINER |

**ARM 빌드가 특히 유리한 경우:**
- C/C++/Rust native code — cross-compilation보다 native 빌드가 안정적
- ECS/EKS ARM 클러스터 워크로드 — 동일 아키텍처에서 빌드한 이미지
- Lambda ARM runtime — arm64 Lambda는 약 20% 저렴하고 arm64 이미지 필요

**ARM + x86 멀티 아키텍처 이미지 생성:**
```yaml
# buildspec.yml (Build Batch)
version: 0.2
batch:
  fast-fail: false
  build-list:
    - identifier: amd64
      env:
        type: LINUX_CONTAINER
        compute-type: BUILD_GENERAL1_LARGE
        image: aws/codebuild/amazonlinux2-x86_64-standard:5.0
        variables:
          ARCH: amd64
    - identifier: arm64
      env:
        type: ARM_CONTAINER
        compute-type: BUILD_GENERAL1_LARGE
        image: aws/codebuild/amazonlinux2-aarch64-standard:3.0
        variables:
          ARCH: arm64

phases:
  pre_build:
    commands:
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR
  build:
    commands:
      - docker build -t $ECR/myapp:$IMAGE_TAG-$ARCH .
      - docker push $ECR/myapp:$IMAGE_TAG-$ARCH
  post_build:
    commands:
      - |
        if [ "$ARCH" = "arm64" ]; then
          docker manifest create $ECR/myapp:$IMAGE_TAG \
            $ECR/myapp:$IMAGE_TAG-amd64 \
            $ECR/myapp:$IMAGE_TAG-arm64
          docker manifest annotate $ECR/myapp:$IMAGE_TAG \
            $ECR/myapp:$IMAGE_TAG-arm64 --arch arm64
          docker manifest push $ECR/myapp:$IMAGE_TAG
        fi
```

또는 `docker buildx`로 단일 명령:
```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --push \
  -t $ECR/myapp:$IMAGE_TAG .
```

`docker buildx`는 내부적으로 QEMU를 사용해 크로스 컴파일한다. Build Batch를 쓰면 각 아키텍처가 자체 환경에서 native 빌드된다 — 더 빠르고 안정적이다.

> 💡 **관련 이론**: Multi-architecture 이미지는 **OCI (Open Container Initiative) Image Specification**의 manifest list 기능을 사용한다. 단일 이미지 URI(`myapp:v1`)가 manifest list를 가리키고, manifest list는 각 플랫폼(linux/amd64, linux/arm64)에 대한 실제 이미지 manifest를 포함한다. Docker pull 시 클라이언트가 자신의 플랫폼에 맞는 이미지를 자동 선택한다. 이것이 `docker pull ubuntu`가 어느 아키텍처에서나 동작하는 이유다.

## Docker Hub Rate Limit: ECR Pull Through Cache

CodeBuild 빌드들이 같은 NAT Gateway를 통해 Docker Hub에 접근하면, 같은 공인 IP에서 요청이 몰린다. Docker Hub의 Anonymous Pull Limit은 **100 pulls/6시간/IP**다. 빌드가 하루 200회이고 각 빌드가 2개 이미지를 pull하면 하루 400번 — 한도를 쉽게 초과한다.

**ECR Pull Through Cache 설정:**
```bash
# Docker Hub를 소스로 하는 Pull Through Cache 규칙 생성
aws ecr create-pull-through-cache-rule \
  --ecr-repository-prefix dockerhub \
  --upstream-registry-url registry-1.docker.io \
  --credential-arn arn:aws:secretsmanager:...:secret:dockerhub-creds

# buildspec에서 사용
# 기존: FROM node:20-alpine
# 변경: FROM 123456789.dkr.ecr.ap-northeast-2.amazonaws.com/dockerhub/node:20-alpine
```

첫 번째 pull만 Docker Hub에서 가져오고 ECR에 캐시된다. 이후 24시간 동안은 ECR에서 직접 반환한다. 캐시 만료 후 재검증.

| 소스 | ECR Prefix |
|------|-----------|
| Docker Hub | `dockerhub/` |
| ECR Public | `public/ecr.aws/` |
| Quay | `quay/` |
| GitHub Container Registry | `ghcr/` |

> 🎯 **시나리오**: "빌드가 자주 `toomanyrequests: You have reached your pull rate limit` 오류로 실패한다." 빠른 진단: CloudWatch Logs에서 이 에러 확인 → 원인은 Docker Hub Rate Limit → 해결: ECR Pull Through Cache 설정 후 Dockerfile의 FROM 이미지를 ECR 경로로 변경. CodeArtifact Upstream도 npm/pypi rate limit 문제의 같은 해법이다.

## GCP vs AWS: VPC 통합 빌드 비교

| 항목 | CodeBuild VPC | GCP Cloud Build Private Pool |
|------|--------------|------------------------------|
| 구현 방식 | ENI 동적 생성 | 전용 Private Pool (별도 VPC) |
| 관리 복잡도 | 낮음 (VPC 설정만) | 중간 (Private Pool 관리) |
| 비용 | ENI + NAT/Endpoint | Private Pool 시간당 + 데이터 |
| VPC Peering | 자체 VPC 내 직접 | Private Pool VPC를 Peer |
| 최소 단위 | 개별 빌드 | Pool 전체 |

CodeBuild의 ENI 방식은 "필요할 때만 VPC에 참여"하는 on-demand 모델이다. GCP의 Private Pool은 "항상 VPC에 연결된 풀"을 유지하는 reserved 모델이다. 빌드 빈도가 낮으면 CodeBuild가 유리하고, 빈도가 높으면 GCP의 풀 방식이 ENI 생성 오버헤드를 없앤다.

> 📚 **사례**: 한 글로벌 금융기관이 2022년 CodeBuild VPC 모드를 도입한 사례: Private 서브넷의 Oracle DB에 마이그레이션 스크립트를 실행하는 빌드를 구성했다. 초기에 `ENI quota exhausted` 오류가 발생했는데, `/24` 서브넷(256 IP)에서 동시 빌드 50개 × ENI 1개 = 50개 IP 소비. 더 큰 `/22` 서브넷(1024 IP)으로 변경하고, `concurrentBuildLimit`으로 동시 빌드를 30개로 제한해 안정화했다.

## 풀 예시: VPC + ARM 매트릭스 + Custom Image

```bash
# 1) VPC 빌드 + 커스텀 이미지 설정
aws codebuild update-project \
  --name myproj \
  --environment "type=LINUX_CONTAINER,
    image=123456789.dkr.ecr.ap-northeast-2.amazonaws.com/my-build-image:v1.2,
    imagePullCredentialsType=SERVICE_ROLE,
    privilegedMode=true,
    computeType=BUILD_GENERAL1_LARGE" \
  --vpc-config "vpcId=vpc-abc,
    subnets=subnet-1a,subnet-2b,
    securityGroupIds=sg-xyz"
```

```yaml
# 2) ARM/x86 멀티 아키텍처 buildspec
version: 0.2

env:
  secrets-manager:
    DB_PASS: prod/myapp-rds:password
  parameter-store:
    DB_HOST: /myapp/prod/db-host

batch:
  fast-fail: false
  build-list:
    - identifier: amd64
      env:
        type: LINUX_CONTAINER
        image: aws/codebuild/amazonlinux2-x86_64-standard:5.0
        compute-type: BUILD_GENERAL1_LARGE
        variables: { ARCH: amd64 }
    - identifier: arm64
      env:
        type: ARM_CONTAINER
        image: aws/codebuild/amazonlinux2-aarch64-standard:3.0
        compute-type: BUILD_GENERAL1_LARGE
        variables: { ARCH: arm64 }

phases:
  pre_build:
    commands:
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR
      - export IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
  build:
    commands:
      # VPC를 통해 Private RDS에 마이그레이션 (amd64 노드에서만)
      - |
        if [ "$ARCH" = "amd64" ]; then
          PGPASSWORD=$DB_PASS psql -h $DB_HOST -U admin -d myapp -f migrations/V$(cat migrations/version).sql
        fi
      - docker build --platform linux/$ARCH -t $ECR/myapp:$IMAGE_TAG-$ARCH .
      - docker push $ECR/myapp:$IMAGE_TAG-$ARCH
  post_build:
    commands:
      - |
        if [ "$ARCH" = "arm64" ]; then
          docker manifest create $ECR/myapp:$IMAGE_TAG \
            $ECR/myapp:$IMAGE_TAG-amd64 \
            $ECR/myapp:$IMAGE_TAG-arm64
          docker manifest push $ECR/myapp:$IMAGE_TAG
        fi

cache:
  paths:
    - /root/.gradle/caches/**/*
```

---

## 📝 연습 문제

**문제 1.** CodeBuild VPC 모드에서 빌드가 "ENI creation failed" 오류로 실패한다. 원인으로 가장 가능성 높은 것은?

A) buildspec.yml 문법 오류
B) Service Role에 `ec2:CreateNetworkInterface` 권한 누락
C) 잘못된 runtime-version 지정
D) ARM 이미지를 x86 compute type으로 실행

**정답: B**
해설: VPC 모드에서 CodeBuild는 빌드 시작 시 지정된 서브넷에 ENI를 생성한다. 이를 위해 Service Role에 `ec2:CreateNetworkInterface`, `ec2:DescribeNetworkInterfaces`, `ec2:DeleteNetworkInterface` 등 EC2 네트워크 관련 권한이 필요하다. 이 권한이 없으면 ENI 생성 단계에서 실패한다.

---

**문제 2.** Private 서브넷의 CodeBuild 빌드가 `npmjs.com`에서 패키지를 다운로드해야 한다. 비용 효율적이고 보안적인 방법은?

A) 서브넷을 Public으로 변경
B) NAT Gateway를 통한 인터넷 접근
C) CodeArtifact Upstream Repository로 npm 미러링 + VPC Endpoint for CodeArtifact
D) Internet Gateway를 직접 Private 서브넷 라우팅 테이블에 추가

**정답: C**
해설: CodeArtifact는 npm, PyPI, Maven 등의 public registry를 upstream으로 설정할 수 있다. VPC Endpoint for CodeArtifact를 추가하면 인터넷 없이 내부망으로 패키지를 가져온다. NAT Gateway(B)는 동작하지만 비용이 발생하고, D는 기술적으로 불가능하다(Private 서브넷 정의상 IGW로 직접 라우팅이 없음).

---

**문제 3.** 커스텀 ECR 이미지를 빌드 환경으로 사용할 때 `imagePullCredentialsType=SERVICE_ROLE`을 설정하는 이유는?

A) Docker Hub 인증을 위해
B) CodeBuild Service Role의 ECR 권한으로 이미지를 pull하기 위해 (같은 계정 또는 Cross-account ECR)
C) ARM 이미지를 x86에서 실행하기 위해
D) privilegedMode를 활성화하기 위해

**정답: B**
해설: `SERVICE_ROLE`은 CodeBuild가 Service Role의 IAM 권한으로 ECR에서 이미지를 pull한다. Service Role에 `ecr:GetAuthorizationToken`과 `ecr:BatchGetImage` 권한이 있어야 한다. Cross-account ECR을 사용하는 경우 이미지가 있는 계정의 ECR Repository Policy에서도 빌드 계정 Role을 허용해야 한다.

---

**문제 4.** ARM Graviton 빌드를 x86 빌드와 함께 진행하여 multi-arch Docker 이미지를 만들어야 한다. 가장 효율적인 방법은?

A) x86 머신에서 QEMU emulation으로 arm64도 함께 빌드
B) Build Batch `build-list`에 ARM_CONTAINER와 LINUX_CONTAINER 두 노드를 정의하고 각각 native 빌드 후 `docker manifest`로 묶기
C) 하나의 buildspec에서 순차적으로 두 번 빌드
D) Lambda Function으로 arm64 빌드 위임

**정답: B**
해설: Build Batch로 두 아키텍처를 동시에 native 빌드하는 것이 가장 빠르고 안정적이다. QEMU emulation(A)은 성능이 낮고, C는 병렬화가 안 되어 시간이 두 배, D는 Lambda에 Docker 빌드 환경이 없다. native arm64 빌드 후 docker manifest로 multi-arch manifest를 생성하는 것이 표준이다.

---

**문제 5.** S3 Gateway Endpoint를 VPC에 추가하는 가장 중요한 이유는?

A) S3 데이터 암호화를 활성화하기 위해
B) 무료로 S3 트래픽을 NAT 없이 AWS 내부망으로 라우팅해 NAT 비용을 절감하기 위해
C) S3 버킷을 Public으로 만들기 위해
D) Cross-region 복제를 활성화하기 위해

**정답: B**
해설: S3 Gateway Endpoint는 유일한 무료 VPC Endpoint 타입이다. 이를 사용하면 VPC 내에서 S3로 가는 트래픽이 NAT Gateway를 거치지 않아 NAT 데이터 전송 비용이 절감된다. CodeBuild가 S3에서 빌드 캐시와 아티팩트를 자주 읽고 쓰므로 효과가 크다.

---

**문제 6.** Docker Hub Rate Limit으로 빌드가 실패한다. 인프라 변경 없이 가장 영구적인 해결책은?

A) Docker Hub 유료 플랜으로 업그레이드
B) ECR Pull Through Cache를 Docker Hub upstream으로 설정하고 Dockerfile의 FROM 이미지를 ECR 경로로 변경
C) 빌드 빈도를 줄임
D) 빌드에 sleep을 추가해 rate limit 회복을 기다림

**정답: B**
해설: ECR Pull Through Cache는 첫 번째 pull만 Docker Hub에서 가져오고 ECR에 캐시한다. 이후 빌드들은 ECR에서 제공받아 Docker Hub Rate Limit에서 자유로워진다. 유료 플랜(A)도 가능하지만 비용이 발생하고 팀 전체 pull을 커버하지 못할 수 있다. 근본적 해결책은 B다.

---

**문제 7.** VPC 모드 빌드에서 동시 빌드가 100개이고 서브넷이 `/24`(256 IP)일 때 발생할 수 있는 문제는?

A) 빌드 컨테이너가 충돌한다
B) 각 빌드가 ENI 1개 = IP 1개를 소비하므로 서브넷 IP가 고갈될 수 있다
C) Security Group 규칙이 초과된다
D) KMS Quota가 초과된다

**정답: B**
해설: 각 VPC 모드 빌드는 지정된 서브넷에 ENI 1개를 생성하고, ENI는 서브넷 IP 풀에서 IP를 소비한다. `/24` 서브넷의 사용 가능한 IP는 약 251개(5개는 AWS 예약). 동시 빌드 100개는 100개의 IP를 소비한다. 추가로 다른 리소스(RDS, Lambda 등)가 같은 서브넷 IP를 쓴다면 고갈될 수 있다. 해결: 더 큰 CIDR 서브넷, 또는 `concurrentBuildLimit`으로 동시 빌드 수 제한.

---
