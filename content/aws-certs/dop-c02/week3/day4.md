# Day 4 - VPC CodeBuild, Custom Image, ARM/Graviton 빌드

📅 날짜: Week 3 (Day 4)
🎯 주제: 프라이빗 네트워크 빌드, 커스텀 환경, ARM 멀티 아키텍처
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CodeBuild VPC 모드의 네트워크 흐름과 IAM 요구사항을 이해한다
- Custom Container Image를 빌드 환경으로 사용하는 패턴
- ARM(Graviton) 빌드의 비용·성능 이점과 매트릭스 빌드 패턴
- CodeBuild Sample 이미지 vs Public Container Registry 선택 기준

---

## 🧩 사전 지식 (CS 기초)

- **VPC Endpoint vs NAT Gateway**: VPC 안에서 AWS 서비스에 접근하는 두 가지 방식. Endpoint는 사설망 안, NAT는 인터넷 경유.
- **Cross-arch build (Multi-arch image)**: 단일 manifest 안에 amd64/arm64 이미지를 묶음. 클라이언트 아키텍처에 맞는 것을 자동 선택.
- **QEMU emulation**: arm 환경에서 amd64 빌드(또는 반대). 느리지만 가능.
- **ENI (Elastic Network Interface)**: VPC 내 가상 네트워크 인터페이스. CodeBuild가 VPC 빌드 시 ENI를 동적으로 생성.

---

## 📖 이론 내용

### 1. VPC CodeBuild — 언제 필요한가?

- **프라이빗 RDS/ElastiCache/EFS** 등에 빌드 시 접근
- **온프레미스 패키지 저장소(Nexus)에 Direct Connect/VPN으로 접근**
- **VPC Endpoint를 통한 S3/ECR 접근으로 트래픽 절감 + 보안 강화**
- **Egress 통제 (Security Group, NACL)**

설정 요소:
- VPC, 서브넷 2개 이상 (Multi-AZ 권장)
- Security Group (Outbound 규칙)
- Service Role에 추가 권한:
  - `ec2:CreateNetworkInterface`
  - `ec2:DescribeDhcpOptions`
  - `ec2:DescribeNetworkInterfaces`
  - `ec2:DeleteNetworkInterface`
  - `ec2:DescribeSubnets`
  - `ec2:DescribeSecurityGroups`
  - `ec2:DescribeVpcs`
  - `ec2:CreateNetworkInterfacePermission` (특정 조건)

### 2. VPC 빌드 시 인터넷 접근

기본 빌드 컨테이너는 **퍼블릭 인터넷 접근이 기본**이지만, VPC 모드에서는:
- 서브넷이 Private이면 → 인터넷 접근 불가 → NAT Gateway 또는 VPC Endpoint 필요
- 서브넷이 Public이면 → 공인 IP가 부여되지 않으므로 여전히 NAT 필요

**비용 효율 패턴 — VPC Endpoint 사용:**

| 서비스 | Endpoint 종류 |
|--------|----------------|
| S3 | Gateway Endpoint (무료) |
| ECR | Interface Endpoint (`ecr.api`, `ecr.dkr`) |
| Secrets Manager | Interface Endpoint |
| KMS | Interface Endpoint |
| CodeBuild | Interface Endpoint (드물게 필요) |
| Logs | Interface Endpoint (Logs를 VPC 내에서 받으려면) |

### 3. Custom Container Image

빌드 환경 자체를 커스텀 이미지로:

```yaml
# 예: CodeBuild Project 설정
environment:
  type: LINUX_CONTAINER
  image: 111122223333.dkr.ecr.ap-northeast-2.amazonaws.com/my-build-image:v1.2
  imagePullCredentialsType: SERVICE_ROLE   # CodeBuild Role로 ECR pull
  privilegedMode: true                     # Docker-in-Docker 필요 시
```

**Custom Image 요건:**
1. CodeBuild Agent 설치 또는 진입 명령 자동 호출 가능
2. `aws/codebuild/standard:*` 이미지 기반으로 확장 권장
3. 자주 사용하는 도구(Terraform/CDK/Helm/kubectl)를 미리 설치 → 빌드 시간 단축

**이미지 풀 자격 증명:**
- ECR 사용 시 SERVICE_ROLE (CodeBuild Role에 ECR Pull 권한)
- 외부 Docker Hub 등은 시크릿으로 인증 정보 주입

### 4. ARM Graviton 빌드

| 이미지 | 아키텍처 | 시간당 가격 인덱스 | 노트 |
|--------|----------|---------------------|------|
| `aws/codebuild/amazonlinux2-x86_64-standard:5.0` | x86_64 | 1× | 일반 |
| `aws/codebuild/amazonlinux2-aarch64-standard:3.0` | ARM | ~0.8× | Graviton |
| `aws/codebuild/standard:7.0` | x86_64 | 1× | Ubuntu |

**ARM 빌드의 이점:**
- Graviton 인스턴스가 동일 vCPU 대비 ~20% 저렴
- ECS/EKS/Lambda ARM 워크로드 직접 빌드 시 더 빠르고 저렴
- 일부 native code(C/C++) 컴파일은 cross-build보다 안정적

**ARM/x86 멀티 아키텍처 이미지:**
```bash
# Build Batch 결과를 docker manifest로 묶음
docker manifest create $ECR/myapp:v1 \
  $ECR/myapp:v1-amd64 \
  $ECR/myapp:v1-arm64
docker manifest annotate $ECR/myapp:v1 $ECR/myapp:v1-arm64 --arch arm64
docker manifest push $ECR/myapp:v1
```

또는 buildx로 단일 빌드:
```bash
docker buildx build --platform linux/amd64,linux/arm64 --push -t $ECR/myapp:v1 .
```

### 5. Public Build Image Quotas

- Docker Hub Anonymous Pull Limit: 100 pulls / 6 hours per IP
- CodeBuild 환경에서 빌드 시 같은 NAT IP에서 다수 빌드 → 한도 초과 위험
- 대응: ECR Pull Through Cache, CodeArtifact npm/maven은 동일 기능
- ECR Public 사용도 한도 있음

---

## 🧠 알아두면 좋은 심화 이론

### CodeBuild가 VPC에서 ENI를 생성하는 시점

- 빌드 시작 직전 ENI 1개 생성
- 빌드 종료 후 ENI 삭제
- ENI quota는 서브넷 IP 가용 풀에 영향
- 큰 동시 빌드 시: 충분한 IP가 있는 /24 이상 서브넷, 또는 IPv6 사용 고려

### Reserved Capacity + VPC

- Reserved Capacity Fleet도 VPC 모드 지원
- ENI를 미리 생성해 두어 cold start 추가 절감
- VPC + Reserved + Local Cache 조합이 빌드 시간 최저화 패턴

### 컴파일러 캐시 — sccache / ccache

- Rust/C++ 빌드의 캐시 도구
- S3 백엔드 지원 → CodeBuild에서 S3 cache + sccache로 분산 캐시 구성
- BuildKit cache도 sccache와 조합 가능

### Test Containers 패턴

- 통합 테스트에 PostgreSQL/Redis 등을 docker run으로 띄움
- `privilegedMode: true` + Docker daemon 필요
- 대안: 실제 RDS/ElastiCache(개발용 작은 인스턴스)를 VPC 모드 빌드에서 사용

### Self-hosted vs CodeBuild VPC

| 항목 | CodeBuild VPC | GitHub Actions Self-hosted Runner (in VPC) |
|------|---------------|---------------------------------------------|
| 관리 부담 | 낮음 (관리형) | 높음 (EC2/ECS/EKS 관리) |
| 비용 | 분당 과금 | 인스턴스 시간 (Spot 가능) |
| 확장성 | 자동 | 자체 ASG/Karpenter |
| 빌드 동시성 | quota | 자체 결정 |

큰 조직은 둘 다 활용 — 일반 빌드는 CodeBuild, 특수 GPU/대용량은 self-hosted.

### 관련 서비스 Cross-Reference

- **VPC Endpoint** → Week 8 Day 1
- **ECR Pull Through Cache** → Week 6 Day 1
- **Buildx 멀티 아키텍처** → Week 6 Day 2
- **Karpenter** → Week 6 Day 3

---

## 🏗️ 아키텍처 다이어그램

```
CodeBuild VPC Mode
==================================================

   VPC
   ┌─────────────────────────────────────────┐
   │                                         │
   │  Subnet A (Private)        Subnet B    │
   │  ┌──────────────┐         ┌──────────┐  │
   │  │ CodeBuild ENI│         │CodeBuild │  │
   │  │ (created on  │         │  ENI     │  │
   │  │  build start)│         └──────────┘  │
   │  └──────┬───────┘                       │
   │         │                                │
   │  ┌──────▼────────┐    ┌──────────────┐  │
   │  │ S3 GW Endpoint│    │NAT Gateway   │──┼───> Internet
   │  │ (free)        │    │(billed)      │  │  (only if needed)
   │  └───────────────┘    └──────────────┘  │
   │                                          │
   │  ┌────────────────────────────────────┐ │
   │  │ Interface Endpoints                │ │
   │  │  - ecr.api / ecr.dkr               │ │
   │  │  - secretsmanager                  │ │
   │  │  - logs                            │ │
   │  └────────────────────────────────────┘ │
   │                                          │
   │  ┌────────────────────────────────────┐ │
   │  │ RDS, ElastiCache (private)         │ │
   │  └────────────────────────────────────┘ │
   └─────────────────────────────────────────┘

Service Role needs:
  - ec2:CreateNetworkInterface*, DescribeNetworkInterfaces*
  - Subnet/SG describe permissions
  - Plus normal CodeBuild perms (logs, s3, ecr...)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ VPC 빌드 시 Service Role에 ec2:Create/DeleteNetworkInterface 권한 필수
2. ⭐ Private 서브넷 빌드 → NAT Gateway 또는 VPC Endpoint 필요
3. ⭐ S3 Gateway Endpoint는 무료, Interface Endpoint는 시간당 + 데이터 과금
4. ⭐ Custom Image는 ECR에 두고 `imagePullCredentialsType=SERVICE_ROLE`
5. ⭐ ARM Graviton 빌드는 ~20% 저렴 + Graviton 워크로드 직접 빌드 가능

---

## 💻 실제 예시 - VPC 빌드 + ARM 매트릭스

```bash
# 1) VPC 빌드 설정
aws codebuild update-project \
  --name myproj \
  --vpc-config vpcId=vpc-abc,subnets=subnet-1,subnet-2,securityGroupIds=sg-xyz

# 2) Service Role에 EC2 권한 추가
aws iam put-role-policy --role-name CodeBuildServiceRole \
  --policy-name VpcAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
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
      "Resource": "arn:aws:ec2:*:*:network-interface/*",
      "Condition": {
        "StringEquals": {
          "ec2:Subnet": ["arn:aws:ec2:...:subnet/subnet-1", "arn:aws:ec2:...:subnet/subnet-2"],
          "ec2:AuthorizedService": "codebuild.amazonaws.com"
        }
      }
    }]
  }'
```

```yaml
# 3) ARM/x86 매트릭스 buildspec
version: 0.2
batch:
  fast-fail: false
  build-list:
    - identifier: amd64
      env:
        type: LINUX_CONTAINER
        compute-type: BUILD_GENERAL1_LARGE
        image: aws/codebuild/amazonlinux2-x86_64-standard:5.0
        variables: { ARCH: amd64 }
    - identifier: arm64
      env:
        type: ARM_CONTAINER
        compute-type: BUILD_GENERAL1_LARGE
        image: aws/codebuild/amazonlinux2-aarch64-standard:3.0
        variables: { ARCH: arm64 }
phases:
  build:
    commands:
      - docker buildx build --platform linux/$ARCH -t $ECR/app:$IMAGE_TAG-$ARCH . --push
post_build:
  commands:
    - if [ "$ARCH" = "arm64" ]; then
        docker manifest create $ECR/app:$IMAGE_TAG \
          $ECR/app:$IMAGE_TAG-amd64 $ECR/app:$IMAGE_TAG-arm64;
        docker manifest push $ECR/app:$IMAGE_TAG;
      fi
```

---

## 📝 연습 문제

**문제 1.** VPC 모드 빌드에서 ENI 생성 권한이 없어 빌드가 실패한다. Service Role에 추가할 권한은?

A) ec2:CreateNetworkInterface, ec2:DescribeNetworkInterfaces, ec2:DeleteNetworkInterface
B) iam:CreateRole
C) ec2:RunInstances
D) cloudformation:CreateStack

**정답: A**
해설: VPC 모드의 핵심 EC2 권한 묶음.

---

**문제 2.** Private 서브넷에서 빌드가 인터넷 npmjs.com에 접근하려면?

A) Public IP 자동 부여
B) NAT Gateway 또는 NPM 미러를 VPC Endpoint/CodeArtifact로 구성
C) IGW에 직접 라우팅
D) 별도 EC2 Bastion

**정답: B**
해설: Private 서브넷은 NAT 또는 미러 필요. CodeArtifact Upstream이 가장 깔끔.

---

**문제 3.** S3 접근 시 Gateway Endpoint 사용의 이점은?

A) Interface Endpoint보다 비싸다
B) 무료 + VPC 내 사설 라우팅 + S3 트래픽이 NAT를 거치지 않음
C) Region 간 자동 라우팅
D) IAM 정책 불필요

**정답: B**
해설: S3 Gateway Endpoint는 무료 + NAT 비용 절감.

---

**문제 4.** Custom Build Image를 ECR에 두고 빌드 환경으로 쓰려면?

A) imagePullCredentialsType: SERVICE_ROLE + CodeBuild Role에 ECR Pull 권한
B) Docker Hub 자격 증명
C) S3에 직접 zip
D) Lambda Layer

**정답: A**
해설: ECR + Service Role 권한이 표준.

---

**문제 5.** ARM Graviton 빌드를 선택할 이유가 아닌 것은?

A) ECS/EKS ARM 워크로드 직접 빌드
B) ~20% 비용 절감
C) 모든 Docker 이미지가 ARM에서 더 빠르게 동작
D) 일부 native code 컴파일 안정성

**정답: C**
해설: ARM에서 모든 이미지가 빠른 건 아니다. Java/Python 같은 인터프리터는 비슷. C++ 네이티브가 큰 차이.

---

**문제 6.** Docker Hub Rate Limit으로 빌드가 자주 실패한다. 가장 적절한 해결은?

A) ECR Pull Through Cache를 Docker Hub로 구성, 이후 ECR에서 pull
B) IAM 권한 추가
C) Compute Type 키우기
D) Build Batch로 병렬화

**정답: A**
해설: ECR Pull Through Cache가 Public Registry 한도 문제의 표준 해법.

---

**문제 7.** Reserved Capacity Fleet과 VPC 모드를 함께 사용하는 이유는?

A) Provisioning 시간 거의 0 + ENI 사전 생성으로 cold start 최소
B) 비용 절감만
C) Region 분산
D) 라이센스 요구

**정답: A**
해설: Reserved + VPC + Local Cache가 시간 최저화 조합.

---

## 📌 오늘의 요약

1. VPC 빌드: Service Role에 ENI 관리 권한 + 적절한 서브넷·SG
2. Private 서브넷은 NAT 또는 VPC Endpoint(S3 GW 무료) 필수
3. Custom Image는 ECR + SERVICE_ROLE 자격 증명
4. ARM Graviton: 비용 ~20% 절감 + 워크로드 직접 빌드
5. ECR Pull Through Cache로 Docker Hub 한도 우회
