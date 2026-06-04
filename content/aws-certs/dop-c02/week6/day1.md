# Day 1 - ECR: 컨테이너 이미지 레지스트리가 해결하는 문제들

"컨테이너 이미지를 어디에 어떻게 저장할 것인가"는 생각보다 복잡한 문제다. Docker Hub에 올리면 되지 않느냐는 접근은 규모가 커지면 깨진다. Docker Hub의 Rate Limit(인증 없이 6시간에 100 pull, 2020년 기준)이 EKS 클러스터 수백 개 노드의 이미지 pull을 막는 사고가 실제로 있었다. npm 패키지에 숨겨진 악성 코드처럼 외부 레지스트리의 이미지에 백도어가 심어진 공급망 공격도 현실 위협이다. 멀티 리전 배포에서 매번 인터넷을 거쳐 이미지를 pull하면 레이턴시와 비용 문제가 생긴다.

ECR은 이 문제들을 AWS 생태계 안에서 해결하는 컨테이너 이미지 레지스트리다. 단순한 저장소가 아니라 보안 스캔(취약점), 수명 주기 관리(비용), 복제(가용성), 캐시(외부 의존성 격리)를 하나의 서비스로 제공한다.

## OCI 표준과 ECR의 기반

ECR은 Docker Registry API v2를 구현하고 OCI(Open Container Initiative) 이미지 스펙을 따른다. OCI는 2015년 Docker와 CoreOS가 설립한 표준화 기구로, 컨테이너 런타임과 이미지 형식을 중립적인 표준으로 정의했다.

OCI 이미지의 구조를 이해하면 ECR의 동작이 명확해진다:

```
OCI Image 구조:
├── Image Manifest (JSON)
│   ├── mediaType
│   ├── config: { digest: sha256:abc, mediaType, size }
│   └── layers: [
│       { digest: sha256:111, size: 100MB },  ← Layer 1 (base OS)
│       { digest: sha256:222, size: 50MB },   ← Layer 2 (runtime)
│       { digest: sha256:333, size: 10MB }    ← Layer 3 (app code)
│   ]
├── Image Config (JSON)
│   ├── architecture: amd64
│   ├── os: linux
│   └── history: [...]
└── Layers (tar.gz)
    ├── sha256:111...  ← 재사용 가능, 한 번만 저장
    ├── sha256:222...
    └── sha256:333...
```

레이어의 content-addressable 저장 방식이 핵심이다. `FROM ubuntu:22.04`를 사용하는 이미지 100개가 ECR에 있어도 ubuntu 레이어는 한 번만 저장된다. 이것이 ECR의 실제 저장 비용이 이미지 파일 총 크기보다 훨씬 작은 이유다.

> 💡 **관련 이론**: OCI 이미지의 레이어 구조는 **Content-Addressable Storage(CAS)**의 구현이다. 파일의 내용(content)으로 주소(digest, sha256 해시)를 결정하는 방식—같은 내용은 항상 같은 주소를 갖는다. Git이 파일을 SHA-1 해시로 저장하는 것과 동일한 원리다. 이 덕분에 레이어 중복이 자동으로 제거되고(Deduplication), 레이어의 무결성 검증이 가능하며(Integrity), 동일 레이어를 여러 이미지가 공유할 수 있다(Sharing).

**Image Tag vs Digest**:
- **Tag** (`myapp:v1.2.3`, `myapp:latest`): 가변 포인터. 누군가 같은 태그로 다른 이미지를 push하면 태그가 새 이미지를 가리킨다.
- **Digest** (`myapp@sha256:abc123...`): 불변 식별자. 이미지 Manifest의 SHA-256 해시. 이 값이 바뀌면 다른 이미지다.

프로덕션 배포에서 `image: myapp:latest`는 위험하다—"latest"가 어제의 것인지 오늘의 것인지 모른다. `image: myapp@sha256:abc123`은 정확히 테스트한 이미지와 동일하다는 것을 보장한다.

## ECR Private vs Public: 언제 무엇을 쓰는가

| 특성 | ECR Private | ECR Public |
|------|------------|-----------|
| **URL** | `<account>.dkr.ecr.<region>.amazonaws.com/<repo>` | `public.ecr.aws/<alias>/<repo>` |
| **접근** | IAM 인증 필수 | 인증 없이 pull 가능 |
| **용도** | 내부 애플리케이션 이미지 | 공개 배포 (오픈소스 프로젝트, 공용 base image) |
| **스캔** | Basic/Enhanced 스캔 가능 | 제한적 |
| **복제** | 리전/계정 간 복제 | 글로벌 CDN으로 자동 배포 |
| **KMS 암호화** | 가능 | 불가 |

DOP-C02 시험에서는 대부분 Private Registry를 다룬다. Public Gallery는 AWS 공개 베이스 이미지(amazon-linux-2, eks-anywhere 등)를 호스팅하는 데 사용되며, 시험 함정으로 등장하기도 한다.

## Basic vs Enhanced Scanning: 내부 동작의 차이

취약점 스캔의 두 모드는 단순한 기능 차이가 아니라 **스캔 엔진과 데이터 소스의 근본적 차이**다.

**Basic Scanning**: Clair 오픈소스 엔진 사용. Clair는 CVE(Common Vulnerabilities and Exposures) 데이터베이스를 기반으로 OS 패키지(apt, yum, apk)의 알려진 취약점을 검색한다. Push 시 1회 스캔—이미지가 ECR에 올라가는 시점에만 검사한다.

**Enhanced Scanning (AWS Inspector)**: Inspector는 Amazon Guard의 취약점 인텔리전스를 포함하는 더 풍부한 데이터베이스를 사용한다. OS 패키지 외에 Python pip, Node.js npm, Java Maven, .NET NuGet 등 언어별 의존성도 스캔한다. **지속 스캔(Continuous Scan)**—이미지가 ECR에 있는 동안 새 CVE가 발표되면 자동으로 재평가한다. 어제 스캔에서 OK였던 이미지가 오늘 새 CVE로 CRITICAL이 될 수 있고, Inspector가 이를 자동으로 감지해 Security Hub와 EventBridge로 알린다.

```bash
# 계정 수준에서 Enhanced Scanning 활성화
aws inspector2 enable \
  --resource-types ECR

# ECR 스캔 설정 (모든 리포지토리에 지속 스캔)
aws ecr put-registry-scanning-configuration \
  --scan-type ENHANCED \
  --rules '[
    {
      "scanFrequency": "CONTINUOUS_SCAN",
      "repositoryFilters": [
        {"filter": "*", "filterType": "WILDCARD"}
      ]
    }
  ]'

# 특정 리포지토리는 Push 시에만 스캔
aws ecr put-registry-scanning-configuration \
  --scan-type ENHANCED \
  --rules '[
    {
      "scanFrequency": "CONTINUOUS_SCAN",
      "repositoryFilters": [
        {"filter": "prod/*", "filterType": "PREFIX_MATCH"}
      ]
    },
    {
      "scanFrequency": "SCAN_ON_PUSH",
      "repositoryFilters": [
        {"filter": "dev/*", "filterType": "PREFIX_MATCH"}
      ]
    }
  ]'

# 스캔 결과 확인
aws inspector2 list-findings \
  --filter-criteria '{
    "resourceType": [{"comparison": "EQUALS", "value": "AWS_ECR_CONTAINER_IMAGE"}],
    "severity": [{"comparison": "EQUALS", "value": "CRITICAL"}]
  }'
```

> 📚 **사례**: 2021년 log4shell(CVE-2021-44228) 취약점 발표 시 Enhanced Scanning의 위력이 드러났다. Log4Shell은 Java 애플리케이션의 Log4j 라이브러리에 있는 원격 코드 실행 취약점이었다. Basic Scanning은 OS 패키지만 보므로 Java 의존성에 있는 Log4j를 발견하지 못했다. Enhanced Scanning은 이미지 내의 Java classpath까지 분석하므로 Log4Shell 영향을 받는 이미지를 자동으로 식별했다. AWS Inspector가 전 세계 수백만 ECR 이미지를 몇 시간 만에 재평가해서 Security Hub로 알림을 보낸 것이 실제 사례로 보고됐다.

> 🔍 **더 깊이**: Enhanced Scanning이 언어 의존성을 스캔하는 방법은 소프트웨어 구성 분석(Software Composition Analysis, SCA)이다. 이미지 레이어를 뜯어서 Python의 requirements.txt, site-packages/, Node의 node_modules/, Java의 pom.xml, JAR 파일 MANIFEST.MF 등을 찾아 알려진 취약 버전과 대조한다. SBOM(Software Bill of Materials, 소프트웨어 구성 명세서)을 내부적으로 생성해서 CVE 데이터베이스와 비교한다. SBOM은 EO 14028(2021 미국 대통령 행정명령, 소프트웨어 공급망 보안)에서 의무화된 개념으로, Inspector의 Enhanced Scanning이 이 표준을 AWS 서비스로 구현한 것이다.

## Lifecycle Policy: 이미지 비용을 자동으로 통제하는 방법

ECR 비용의 대부분은 저장 비용이다($0.10/GB/월). 태그 없는 이미지(매 빌드마다 생성되는 레이어)와 오래된 개발 태그가 쌓이면 저장 비용이 급증한다. Lifecycle Policy는 규칙 기반으로 오래된 이미지를 자동 삭제한다.

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "태그 없는 이미지 7일 후 삭제",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": {"type": "expire"}
    },
    {
      "rulePriority": 2,
      "description": "prod 태그 이미지 최근 30개만 유지",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["prod-", "release-"],
        "countType": "imageCountMoreThan",
        "countNumber": 30
      },
      "action": {"type": "expire"}
    },
    {
      "rulePriority": 3,
      "description": "dev 태그 이미지 14일 후 삭제",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["dev-", "pr-", "branch-"],
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 14
      },
      "action": {"type": "expire"}
    },
    {
      "rulePriority": 4,
      "description": "나머지 태그 이미지 90일 후 삭제",
      "selection": {
        "tagStatus": "tagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 90
      },
      "action": {"type": "expire"}
    }
  ]
}
```

**Lifecycle Policy 평가 순서의 함정**: rulePriority **낮은 숫자가 먼저** 평가된다. 한 이미지가 여러 규칙에 매칭되면 첫 번째로 매칭되는 규칙의 action이 적용된다. Priority 1 = "태그 없는 이미지 7일" 규칙이 가장 먼저 평가된다.

Dry-run으로 실제 삭제 없이 결과 미리 확인:
```bash
aws ecr get-lifecycle-policy-preview \
  --repository-name myapp \
  --filter "{'tagStatus': 'UNTAGGED'}"
```

> ⚠️ **함정**: Lifecycle Policy와 IMMUTABLE 태그 설정은 상호 작용한다. IMMUTABLE 태그가 설정된 리포지토리에서 동일 태그로 재push하면 오류가 발생하고 기존 이미지를 삭제하지 않는다. 그러나 Lifecycle Policy는 IMMUTABLE 태그와 관계없이 만료 기준을 충족하면 이미지를 삭제한다. 즉 IMMUTABLE은 "같은 태그로 다시 push 불가"이지 "삭제 불가"가 아니다. 규정 준수를 위해 이미지를 영구 보관해야 하면 Lifecycle Policy를 아예 적용하지 않거나 별도 백업 전략이 필요하다.

## Image Tag Mutability: 재현성과 보안의 핵심

```bash
# IMMUTABLE 설정 (권장)
aws ecr put-image-tag-mutability \
  --repository-name myapp \
  --image-tag-mutability IMMUTABLE

# MUTABLE로 되돌리기 (비권장)
aws ecr put-image-tag-mutability \
  --repository-name myapp \
  --image-tag-mutability MUTABLE
```

**IMMUTABLE의 실용적 효과**:
1. `prod-v1.2.3` 태그가 push되면 그 태그는 항상 동일한 이미지를 가리킨다—누가 실수로 덮어쓸 수 없다
2. 감사 추적: 특정 태그로 배포된 이미지가 언제나 동일하므로 "prod-v1.2.3이 배포됐을 때 어떤 코드가 실행됐는가"가 명확하다
3. Supply chain 공격 방어: 외부 공격자가 기존 태그를 악성 이미지로 교체하는 것을 방지한다

> 💡 **관련 이론**: IMMUTABLE 태그는 **Content-Addressable 시스템의 인간 친화적 인터페이스**다. Digest(sha256)가 이미지의 진짜 불변 식별자이지만 사람이 기억하기 어렵다. IMMUTABLE Tag는 사람이 읽을 수 있는 이름(`prod-v1.2.3`)을 불변 Digest에 매핑해서, "이 이름은 항상 이 내용을 가리킨다"는 보장을 만든다. 이것은 DNS의 CNAME vs A 레코드와 유사하다—태그가 CNAME(별명)이고 Digest가 IP 주소(실제 주소)다. MUTABLE 태그는 CNAME이 다른 IP를 가리킬 수 있는 것이고, IMMUTABLE 태그는 한번 설정된 CNAME이 변경 불가한 것과 같다.

## Cross-Region Replication: DR과 멀티 리전 아키텍처

ECR Cross-Region Replication은 이미지를 자동으로 다른 리전에 복사한다. DR(재해 복구) 시나리오와 글로벌 멀티 리전 서비스의 배포 레이턴시 감소에 사용된다.

```bash
aws ecr put-replication-configuration \
  --replication-configuration '{
    "rules": [
      {
        "destinations": [
          {
            "region": "us-east-1",
            "registryId": "111111111111"
          },
          {
            "region": "eu-west-1",
            "registryId": "111111111111"
          }
        ],
        "repositoryFilters": [
          {
            "filter": "prod/*",
            "filterType": "PREFIX_MATCH"
          },
          {
            "filter": "shared/base-images",
            "filterType": "PREFIX_MATCH"
          }
        ]
      }
    ]
  }'
```

복제 설정 시 주의사항:
- **리포지토리 사전 생성 필요**: 복제 대상 리전에 동일한 이름의 리포지토리가 없으면 자동 생성이 안 된다(설정에 따라 다름).
- **Lifecycle Policy 독립**: 복제된 이미지에 적용되는 Lifecycle Policy는 대상 리전의 것이다. 소스 리전에서 삭제해도 복제된 이미지는 삭제되지 않는다.
- **복제 지연**: 복제는 비동기이므로 이미지를 push한 직후 다른 리전에서 pull하면 아직 복제되지 않을 수 있다.

**Cross-Account Replication**: Prod 계정의 ECR에서 DR 계정으로 자동 복제.

```json
{
  "rules": [{
    "destinations": [
      {"region": "ap-northeast-2", "registryId": "DR-ACCOUNT-ID"}
    ],
    "repositoryFilters": [
      {"filter": "prod/*", "filterType": "PREFIX_MATCH"}
    ]
  }]
}
```

대상 계정(DR-ACCOUNT-ID)에서 Registry Permission 설정:
```bash
aws ecr put-registry-policy \
  --policy-text '{
    "Version": "2012-10-17",
    "Statement": [{
      "Sid": "AllowSourceAccountReplication",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::SOURCE-ACCOUNT-ID:root"
      },
      "Action": [
        "ecr:CreateRepository",
        "ecr:ReplicateImage"
      ],
      "Resource": "arn:aws:ecr:ap-northeast-2:DR-ACCOUNT-ID:repository/*"
    }]
  }'
```

## Pull Through Cache: 외부 Registry 의존성 격리

Docker Hub Rate Limit 사건(2020년 11월, 인증 없이 6시간 100 pull로 제한)은 많은 회사의 EKS 노드를 멈추게 했다. Pull Through Cache는 이 문제를 근본적으로 해결한다.

```bash
# Docker Hub 캐시 규칙 생성
aws ecr create-pull-through-cache-rule \
  --ecr-repository-prefix dockerhub \
  --upstream-registry-url registry-1.docker.io \
  --credential-arn arn:aws:secretsmanager:ap-northeast-2:111:secret:ecr-pullthrough-dockerhub-xxxxx

# 사용법 (기존 Docker Hub pull 명령 변경)
# 이전: docker pull nginx:1.25
# 이후: docker pull 111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/dockerhub/library/nginx:1.25

# Kubernetes에서 사용
# image: 111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/dockerhub/library/nginx:1.25
```

지원하는 Upstream Registry:
- Docker Hub (`registry-1.docker.io`)
- ECR Public Gallery (`public.ecr.aws`)
- Quay.io (`quay.io`)
- Kubernetes Container Registry (`registry.k8s.io`)
- GitHub Container Registry (`ghcr.io`)
- Microsoft Container Registry (`mcr.microsoft.com`)

동작 방식:
```
첫 번째 pull:
  ECR 캐시 → 없음 → Docker Hub에서 pull → ECR에 저장 → 응답

이후 pull:
  ECR 캐시 → 있음 → ECR에서 직접 응답 (Docker Hub 접근 없음)

캐시 TTL:
  ECR이 업스트림 이미지 업데이트를 감지하면 자동 갱신
```

**Pull Through Cache + Lifecycle Policy 조합**: 캐시된 이미지도 Lifecycle Policy의 적용을 받아 자동 정리된다. 오래된 캐시 버전이 쌓이는 것을 방지한다.

> 📚 **사례**: 2022년 Cloudflare가 Docker Hub Rate Limit으로 인해 내부 CI 파이프라인이 간헐적으로 실패하는 문제를 경험했다. 해결책으로 Cloudflare는 내부 Nexus Repository Manager를 프록시로 사용했지만, AWS 고객들은 ECR Pull Through Cache로 더 단순하게 해결했다. ECR Pull Through Cache는 Docker Hub 인증 정보를 Secrets Manager에 저장해서 Rate Limit을 인증된 계정 한도(무제한 또는 유료 계획)로 확장한다.

## ECR 권한 모델의 세 계층

ECR은 세 가지 다른 레벨의 접근 제어를 사용한다. 이 세 계층을 혼동하면 "권한이 있는데 안 된다"는 문제가 생긴다.

| 레벨 | 정책 종류 | 적용 범위 | 주요 용도 |
|------|-----------|-----------|-----------|
| **Registry 수준** | Registry Policy | 전체 계정 Registry | Cross-Account 복제 허용, Pull Through Cache |
| **Repository 수준** | Repository Policy | 특정 리포지토리 | Cross-Account pull, 특정 서비스 접근 제한 |
| **IAM 수준** | IAM Identity Policy | 사용자/Role | 내부 CI/CD, ECS Task Role, EKS IRSA |

```json
// Repository Policy 예시 — Cross-Account pull
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowDRAccountPull",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::DR-ACCOUNT-ID:root"
      },
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:GetAuthorizationToken"
      ]
    }
  ]
}
```

Cross-Account pull의 특수성: `ecr:GetAuthorizationToken`은 Registry 수준 IAM 권한이고, Repository Policy의 Principal에는 포함되지 않는다. 다른 계정이 이미지를 pull하려면 그 계정의 IAM에 `ecr:GetAuthorizationToken` 권한이 있어야 한다.

## 컨테이너 이미지 서명: Supply Chain 보안의 최전선

ECR은 OCI Image Signing을 지원한다. 서명은 "이 이미지가 신뢰된 소스에서 빌드됐고 변조되지 않았음"을 cryptographic하게 증명한다.

```bash
# AWS Signer for Containers (Notary v2 기반) 사용
SIGNING_PROFILE_ARN=$(aws signer create-signing-profile \
  --platform-id "Notation-OCI-SHA384-ECDSA" \
  --signing-profile-name checkout-images \
  --query 'arn' --output text)

# 이미지 서명
notation sign \
  --plugin "com.amazonaws.signer.notation.plugin" \
  --id "$SIGNING_PROFILE_ARN" \
  111111111111.dkr.ecr.ap-northeast-2.amazonaws.com/myapp@sha256:abc123

# EKS에서 서명 검증 강제 (Kyverno 정책 예시)
# 서명되지 않은 이미지는 클러스터 진입 차단
```

> 💡 **관련 이론**: 컨테이너 이미지 서명은 **PKI(Public Key Infrastructure)와 코드 서명(Code Signing)**의 컨테이너 세계 적용이다. Windows의 코드 서명 인증서, macOS의 Developer Certificate과 동일한 원리다—개인 키로 서명하고 공개 키로 검증한다. OCI Image Signing의 표준이 되어가는 Sigstore(cosign)는 투명성 로그(transparency log, RFC 9162)를 사용해 서명 이벤트를 공개 불변 로그에 기록한다. 이는 CT(Certificate Transparency, RFC 6962)가 HTTPS 인증서 발급을 공개 로그로 추적하는 것과 동일한 방식으로 컨테이너 이미지 공급망의 투명성을 확보한다.

## ECR KMS 암호화: 저장 데이터 보호

ECR Private 리포지토리는 기본적으로 AWS-managed key(aws/ecr)로 암호화된다. 규정 준수(FIPS 140-2, PCI DSS) 환경이나 키 로테이션 제어가 필요한 경우 고객 관리 CMK(Customer Managed Key)를 사용한다.

```bash
# CMK로 암호화된 리포지토리 생성
aws ecr create-repository \
  --repository-name checkout-service \
  --encryption-configuration '{
    "encryptionType": "KMS",
    "kmsKey": "arn:aws:kms:ap-northeast-2:111:key/your-key-id"
  }'

# 기존 리포지토리는 암호화 방식 변경 불가
# 새 리포지토리 생성 후 이미지 이전 필요
```

> ⚠️ **함정**: ECR 리포지토리에 CMK를 설정한 후 해당 KMS 키를 비활성화하거나 삭제하면 이미지 pull이 불가능해진다—이미지가 그 키로 암호화되어 있기 때문이다. KMS 키 삭제에는 7-30일의 대기 기간이 있지만, 키 비활성화는 즉시 효과가 있다. CMK 로테이션(`enable-key-rotation`)은 자동 로테이션이므로 이미지 접근에 영향을 주지 않는다. 또한 Cross-Account pull 시 대상 계정의 IAM에 해당 CMK에 대한 `kms:Decrypt` 권한이 필요하다—ECR Repository Policy만으로는 부족하다.

> 💡 **관련 이론**: ECR의 암호화 구조는 S3 서버측 암호화(SSE-KMS)와 동일한 Envelope Encryption 방식이다. 각 이미지 레이어는 Data Key로 암호화되고, Data Key는 CMK로 암호화되어 이미지 메타데이터에 저장된다. pull 요청이 오면 ECR이 CMK로 Data Key를 복호화하고, Data Key로 레이어를 복호화해서 응답한다. 이 과정이 CloudTrail에 `kms:Decrypt` 이벤트로 기록되므로 "어떤 이미지가 언제 pull됐는가"를 KMS 감사 로그로 추적할 수 있다.

## buildspec.yml에서 ECR까지: 완전한 파이프라인

```yaml
# buildspec.yml — ECR push 포함
version: 0.2

env:
  variables:
    ECR_REGISTRY: "111111111111.dkr.ecr.ap-northeast-2.amazonaws.com"
    REPOSITORY_NAME: "checkout-service"
  exported-variables:
    - IMAGE_TAG
    - IMAGE_URI
    - IMAGE_DIGEST

phases:
  pre_build:
    commands:
      # ECR 로그인
      - aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin $ECR_REGISTRY
      # 이미지 태그: git SHA의 첫 8자
      - export IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
      - export IMAGE_URI="${ECR_REGISTRY}/${REPOSITORY_NAME}:${IMAGE_TAG}"

  build:
    commands:
      - docker build -t $IMAGE_URI --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) .

  post_build:
    commands:
      # 이미지 push
      - docker push $IMAGE_URI
      # Digest 추출 (IMMUTABLE 이미지의 정확한 참조)
      - export IMAGE_DIGEST=$(aws ecr describe-images --repository-name $REPOSITORY_NAME --image-ids imageTag=$IMAGE_TAG --query 'imageDetails[0].imageDigest' --output text)
      # imagedefinitions.json 생성 (ECS Rolling 배포용)
      - printf '[{"name":"checkout","imageUri":"%s"}]' "${ECR_REGISTRY}/${REPOSITORY_NAME}@${IMAGE_DIGEST}" > imagedefinitions.json
      # imageDetail.json 생성 (ECS Blue/Green 배포용)
      - printf '{"ImageURI": "%s"}' "${ECR_REGISTRY}/${REPOSITORY_NAME}@${IMAGE_DIGEST}" > imageDetail.json

artifacts:
  files:
    - imagedefinitions.json
    - imageDetail.json
    - cloudformation/template.yaml
```

> 🎯 **시나리오**: 한 보안 팀이 "ECR에 push된 이미지 중 CRITICAL 취약점이 있는 것은 ECS 배포를 자동으로 차단해야 한다"는 요구사항을 제시했다. 구현 방법: (1) Enhanced Scanning 활성화, (2) Inspector Findings를 Security Hub로 전송, (3) EventBridge Rule로 "CRITICAL Inspector Finding + ECR 이미지"를 감지, (4) Lambda가 해당 이미지가 포함된 ECS 서비스의 배포를 차단하거나 CodePipeline을 중단. 더 간단한 접근: CodeBuild post_build에서 Inspector API를 호출해 스캔 결과를 확인하고 CRITICAL이 있으면 `exit 1`로 빌드 실패처리. 두 방법 모두 유효하지만 후자가 구현이 단순하다.

## 정리하며

ECR은 단순한 Docker Hub 대체재가 아니다. OCI 표준 기반의 content-addressable 저장, Enhanced Scanning의 지속적 취약점 모니터링, Lifecycle Policy의 비용 자동 통제, Cross-Region/Account 복제의 가용성, Pull Through Cache의 외부 의존성 격리—이 다섯 가지 기능이 함께 엔터프라이즈 컨테이너 이미지 레지스트리를 만든다. IMMUTABLE 태그는 재현성과 보안의 기초이고, 서명은 공급망 보안의 최전선이다. 시험에서 "의존성 CVE 모니터링"이 나오면 Enhanced Scanning, "Docker Hub Rate Limit"이 나오면 Pull Through Cache, "prod 이미지 재현성"이 나오면 IMMUTABLE 태그가 답이다.

---

## 📝 연습 문제

**문제 1.** "Python 라이브러리(requests 패키지)에서 발견된 새 CVE를 ECR 이미지에서 자동으로 감지하고 Security Hub에 통합"하려면 어떤 구성이 필요한가?

A) Basic Scanning (scanOnPush: true) + CloudWatch Events
B) Enhanced Scanning (Inspector) + CONTINUOUS_SCAN + Security Hub 통합
C) Lambda가 매일 이미지를 다운로드하고 pip audit 실행
D) Trusted Advisor의 이미지 스캔 기능

**정답: B**
해설: Basic Scanning은 OS 패키지(apt, yum)만 스캔하고 Python pip 같은 언어 패키지를 감지하지 못한다. Enhanced Scanning(Inspector)만이 언어별 의존성 스캔을 지원한다. CONTINUOUS_SCAN은 이미지가 ECR에 있는 동안 새 CVE가 발표되면 자동으로 재평가하므로 "사후에 발견된 CVE"도 감지한다. Inspector Findings는 Security Hub와 자동 통합되어 중앙 보안 대시보드에 표시된다.

---

**문제 2.** ECR Lifecycle Policy에서 rulePriority 1, 2, 3이 있을 때, 한 이미지가 규칙 1과 규칙 3에 동시에 매칭된다면 어떻게 처리되는가?

A) 가장 높은 우선순위(숫자가 큰 것)의 규칙이 적용된다
B) 가장 낮은 rulePriority 숫자(즉 규칙 1)가 먼저 평가되어 규칙 1의 action이 적용된다
C) 양쪽 규칙이 모두 적용되어 이미지가 두 번 삭제된다
D) 가장 최근에 추가된 규칙이 우선한다

**정답: B**
해설: rulePriority는 숫자가 낮을수록 먼저 평가된다. 이미지가 규칙 1과 규칙 3에 모두 매칭되면 규칙 1(priority 1)이 먼저 적용되고, 규칙 3은 이미 처리된 이미지에 다시 적용되지 않는다. "낮은 숫자 = 높은 우선순위"라는 직관에 반하는 설계지만 이것이 ECR Lifecycle Policy의 동작 방식이다. 드라이런(`get-lifecycle-policy-preview`)으로 실제 결과를 확인하는 것이 실수를 방지하는 방법이다.

---

**문제 3.** EKS Pod이 ECR Private 이미지를 pull할 때 가장 안전한 IAM 구성은?

A) EKS 노드 EC2 Role에 AmazonEC2ContainerRegistryReadOnly 정책 첨부 (모든 Pod 공유)
B) 각 서비스별 Kubernetes ServiceAccount에 IRSA로 별도 IAM Role 매핑, Role에 필요한 ECR 리포지토리만 접근 허용
C) Pod Spec에 ECR 자격 증명을 환경 변수로 직접 주입
D) ECR Repository Policy를 EKS 클러스터 VPC에서 허용으로 설정

**정답: B**
해설: IRSA(IAM Roles for Service Accounts)가 EKS 권한의 표준이다. 노드 Role(A)은 해당 노드의 모든 Pod이 같은 권한을 갖는 overly permissive 접근이다. 어떤 Pod이 침해되면 노드의 모든 권한을 사용할 수 있다. IRSA는 Pod별 최소 권한을 구현한다—결제 서비스 Pod은 결제 관련 ECR 리포지토리만, 인증 서비스 Pod은 인증 리포지토리만 접근 가능하다. 환경 변수 주입(C)은 장기 자격 증명 노출 위험이 있다.

---

**문제 4.** "prod 이미지가 빌드된 후 태그를 변경하거나 같은 태그로 다른 이미지를 push하는 것을 방지"하는 ECR 구성은?

A) ECR 리포지토리에 별도 IAM Policy로 PutImage 권한을 제거
B) 리포지토리의 Image Tag Mutability를 IMMUTABLE로 설정
C) Lifecycle Policy로 오래된 이미지를 자동 삭제
D) Cross-Region Replication으로 이미지를 복제

**정답: B**
해설: IMMUTABLE 설정은 한 번 push된 태그를 덮어쓰기 불가능하게 만든다. `docker push myapp:prod-v1.2.3`을 두 번 실행하면 두 번째 push가 오류로 실패한다. IAM Policy로 PutImage를 제거(A)하면 아무도 이미지를 push할 수 없어서 CI/CD가 깨진다. Lifecycle Policy(C)는 삭제 제어이고 수정 방지가 아니다.

---

**문제 5.** Docker Hub Rate Limit으로 인해 EKS 클러스터에서 nginx 공식 이미지 pull이 간헐적으로 실패한다. 가장 근본적인 해결책은?

A) EKS 노드 수를 줄여 pull 횟수 감소
B) ECR Pull Through Cache를 Docker Hub와 연결하고, 클러스터의 모든 nginx pull을 ECR 경유로 변경
C) Docker Hub 계정을 유료로 업그레이드
D) nginx 이미지를 S3에 저장하고 필요 시 다운로드

**정답: B**
해설: ECR Pull Through Cache가 근본적 해결책이다. 첫 번째 pull은 Docker Hub에서 가져와 ECR에 저장하고, 이후 pull은 ECR에서 직접 제공한다. ECR이 Docker Hub 인증 정보를 Secrets Manager에서 관리하므로 인증된 계정의 Rate Limit(훨씬 높음)이 적용된다. Kubernetes 매니페스트에서 `image: nginx:1.25`를 `image: <account>.dkr.ecr.<region>.amazonaws.com/dockerhub/library/nginx:1.25`로 변경만 하면 된다. 노드 감소(A)는 임시방편이고, 유료 업그레이드(C)도 가능하지만 AWS 서비스 안에서의 해결이 권장된다.

---

**문제 6.** ECR Cross-Region Replication을 설정했는데 새 이미지가 목적 리전에 복제되지 않는다. 가장 먼저 확인해야 할 것은?

A) 목적 리전의 IAM 권한
B) repositoryFilters의 PREFIX_MATCH 패턴이 리포지토리 이름과 일치하는지, 그리고 목적 리전에 해당 리포지토리가 사전에 생성되어 있는지
C) KMS 키 설정
D) ECR 스캔 설정

**정답: B**
해설: Replication이 동작하지 않는 가장 흔한 원인 두 가지다. (1) repositoryFilters의 PREFIX_MATCH 패턴이 리포지토리 이름과 매칭되지 않는 경우—예: `filter: "prod/"` 설정인데 리포지토리 이름이 `myapp`(prod/ 프리픽스 없음)이면 복제 안 됨. (2) 목적 리전에 동일 이름의 리포지토리가 없는 경우—설정에 따라 자동 생성이 안 될 수 있어서 리포지토리를 수동으로 먼저 생성해야 함. 복제는 비동기라서 즉시 확인해도 보이지 않을 수 있다.

---

**문제 7.** ECR 이미지의 SBOM(Software Bill of Materials)과 CVE 정보를 지속적으로 모니터링하고, 새 CRITICAL 취약점 발견 시 운영팀에 자동 알림을 보내는 아키텍처는?

A) Inspector Enhanced Scanning + CONTINUOUS_SCAN → Inspector Finding 생성 → Security Hub → EventBridge → SNS → 이메일/Slack
B) Basic Scanning + CloudWatch 알람
C) Lambda가 매일 ECR describe-images 호출 후 취약점 데이터베이스와 비교
D) Trusted Advisor 대시보드 주기적 모니터링

**정답: A**
해설: Inspector Enhanced Scanning이 CVE 데이터베이스 업데이트 시 자동 재평가(CONTINUOUS_SCAN)하고 Findings를 생성한다. Security Hub가 이 Findings를 수집하고, EventBridge Rule이 "CRITICAL Inspector Finding"을 필터링해 SNS로 라우팅, 이메일과 Slack(Chatbot)으로 즉시 알림이 간다. 이 전체 파이프라인이 완전 자동이고 새 CVE 발표 후 수 시간 이내에 감지/알림이 완료된다. 나머지 옵션은 의존성 스캔(B)을 하지 않거나(C, D) 자동화가 불완전하다.

---

