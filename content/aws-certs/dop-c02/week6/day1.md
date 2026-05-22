# Day 1 - ECR - 이미지 스캔, 수명 주기, 복제

📅 날짜: Week 6 (Day 1)
🎯 주제: 컨테이너 이미지 레지스트리 운영
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- ECR Private vs Public Registry 구분
- Basic vs Enhanced Scanning 차이
- Lifecycle Policy로 이미지 정리 자동화
- Cross-Account/Cross-Region 복제 패턴
- Pull Through Cache로 외부 레지스트리 캐시

---

## 🧩 사전 지식 (CS 기초)

- **OCI (Open Container Initiative)**: 컨테이너 이미지 표준. Docker도 OCI 호환.
- **Image Tag vs Digest**: 태그는 가변, Digest(sha256:...)는 불변.
- **Layer**: 이미지는 여러 레이어. 같은 레이어는 한 번만 저장.
- **Manifest List**: 멀티 아키텍처 이미지를 묶는 매니페스트.
- **Vulnerability Database**: CVE 데이터베이스. Inspector가 사용.

---

## 📖 이론 내용

### 1. ECR 종류

| 종류 | 용도 | URL |
|------|------|-----|
| **Private** | 계정 내 사설 이미지 | `<accountid>.dkr.ecr.<region>.amazonaws.com/<repo>` |
| **Public (ECR Public Gallery)** | 공용 배포 | `public.ecr.aws/<alias>/<repo>` |

### 2. 이미지 스캔 — Basic vs Enhanced

| 항목 | Basic Scanning | Enhanced Scanning (Inspector) |
|------|----------------|-------------------------------|
| 엔진 | Clair (오픈소스) | AWS Inspector |
| OS 패키지 | ✅ | ✅ |
| 언어 의존성 (npm/pip/maven) | ❌ | ✅ |
| 지속 모니터링 | 푸시 시 1회 | 푸시 + 신규 CVE 등록 시 자동 재평가 |
| Security Hub 통합 | 부분적 | ✅ 자동 |
| 비용 | 무료 | 이미지당 과금 |

**전환 방법:**
```bash
# 계정 수준에서 Enhanced 활성화
aws inspector2 enable --resource-types ECR
aws ecr put-registry-scanning-configuration \
  --scan-type ENHANCED \
  --rules '[{
    "scanFrequency": "CONTINUOUS_SCAN",
    "repositoryFilters": [{"filter": "*", "filterType": "WILDCARD"}]
  }]'
```

### 3. Lifecycle Policy — 이미지 자동 정리

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Untagged images > 7 days",
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
      "description": "Keep last 10 prod tagged",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["prod-"],
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": {"type": "expire"}
    },
    {
      "rulePriority": 3,
      "description": "Remove dev tagged > 30 days",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["dev-"],
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 30
      },
      "action": {"type": "expire"}
    }
  ]
}
```

> ⚠️ Priority가 낮을수록 먼저 평가. 한 이미지가 여러 룰에 해당하면 첫 일치 룰의 action.

### 4. Cross-Region Replication

```bash
aws ecr put-replication-configuration \
  --replication-configuration '{
    "rules": [{
      "destinations": [
        {"region": "us-east-1", "registryId": "111111111111"},
        {"region": "eu-west-1", "registryId": "111111111111"}
      ],
      "repositoryFilters": [
        {"filter": "prod/*", "filterType": "PREFIX_MATCH"}
      ]
    }]
  }'
```

- 동일 계정 cross-region 자동 복제
- 일부 리포지토리만 (prefix 필터)
- 비용: 데이터 전송 + 대상 리전 저장

### 5. Cross-Account Replication

```json
{
  "rules": [{
    "destinations": [
      {"region": "ap-northeast-2", "registryId": "222222222222"}
    ],
    "repositoryFilters": [{"filter": "shared/*", "filterType": "PREFIX_MATCH"}]
  }]
}
```

- 다른 계정으로 자동 복제
- 대상 계정에 Registry Permission 필요
- DR 또는 멀티 환경 패턴

### 6. Pull Through Cache

ECR이 외부 registry를 자동 캐시:

```bash
aws ecr create-pull-through-cache-rule \
  --ecr-repository-prefix dockerhub \
  --upstream-registry-url registry-1.docker.io

# 사용
docker pull <acct>.dkr.ecr.<region>.amazonaws.com/dockerhub/library/nginx:latest
# 첫 pull은 Docker Hub에서 → 이후 ECR 캐시
```

지원 upstream:
- Docker Hub
- ECR Public Gallery
- Quay.io
- Kubernetes Container Image Registry (registry.k8s.io)
- Microsoft Container Registry
- GitHub Container Registry

### 7. ECR 권한 모델

- **Repository Policy**: 리포지토리 수준 (Cross-Account)
- **Registry Permission**: 레지스트리 수준 (Cross-Account replication, Pull Through 등)
- **IAM Identity Policy**: 사용자/Role 수준

```json
// Repository Policy 예 - Cross-Account read
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::222222222222:root"},
    "Action": [
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:BatchCheckLayerAvailability"
    ]
  }]
}
```

---

## 🧠 알아두면 좋은 심화 이론

### Image Tag Mutability

```bash
aws ecr put-image-tag-mutability \
  --repository-name myapp \
  --image-tag-mutability IMMUTABLE
```

- `MUTABLE`: 같은 태그 덮어쓰기 가능 (기본)
- `IMMUTABLE`: 한 번 푸시된 태그 변경 불가 — 재현성/감사

### KMS Encryption

기본은 AES-256, KMS CMK도 사용 가능. Cross-Account 시 KMS Key Policy도 grant 필요.

### ECR + IRSA (EKS)

EKS Pod이 ECR pull하려면:
- Pod Service Account에 IRSA로 IAM Role 매핑
- Role에 `ecr:GetAuthorizationToken` + `ecr:BatchGetImage` 등 권한

OIDC Provider 등록 + Trust Policy의 `sub` 조건이 `system:serviceaccount:<ns>:<sa>`.

### 컨테이너 이미지 서명 — Notary v2 / cosign

ECR은 OCI Image Signing 지원:
- AWS Signer for Containers (Notary v2)
- cosign (Sigstore)

EKS Admission Controller(policy-controller, Connaisseur)로 검증 강제.

### Pull Through Cache 토큰 자동 갱신

ECR이 Upstream 인증 정보를 Secrets Manager에서 자동 회전 — 사용자가 인증 정보 보관 부담 X.

### 관련 서비스 Cross-Reference

- **Inspector** → Week 14 Day 4
- **AWS Signer** → Week 2 Day 4
- **IRSA** → Week 6 Day 3
- **Security Hub** → Week 14 Day 2

---

## 🏗️ 아키텍처 다이어그램

```
ECR Operations
==================================================

  Source code
       |
       v
   docker build → docker push
       |
       v
   ECR (Region A)
   ├─ Lifecycle Policy (자동 정리)
   ├─ Enhanced Scanning (Inspector)
   │    └─ Findings → Security Hub
   ├─ Cross-Region Replication ─► ECR (Region B)
   └─ Cross-Account Replication ─► ECR (Account B)

  EKS/ECS Pod
       |
       v
   docker pull ECR
       ├─ via IRSA (Pod SA → IAM Role)
       └─ or Task Execution Role

  Pull Through Cache:
   docker pull <ecr>/dockerhub/library/nginx
              |
              v
   ECR (cache miss) → Docker Hub → ECR cache
   Next pull → ECR (no Docker Hub trip)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Basic vs Enhanced Scanning — Enhanced만 의존성 + 지속 모니터링
2. ⭐ Lifecycle Policy로 이미지 비용 자동 통제
3. ⭐ Cross-Region/Account Replication으로 DR + 멀티 환경
4. ⭐ Pull Through Cache로 Docker Hub Rate Limit 우회
5. ⭐ IMMUTABLE 태그로 재현성/감사 보장

---

## 💻 실제 예시 - 멀티 환경 ECR 표준 구성

```bash
# 1) 리포지토리 생성 (Immutable + Enhanced Scan)
aws ecr create-repository \
  --repository-name myapp \
  --image-tag-mutability IMMUTABLE \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=KMS,kmsKey=alias/ecr-cmk

# 2) Lifecycle Policy
aws ecr put-lifecycle-policy \
  --repository-name myapp \
  --lifecycle-policy-text file://lifecycle.json

# 3) Enhanced Scanning 계정 수준 활성
aws ecr put-registry-scanning-configuration \
  --scan-type ENHANCED \
  --rules file://scan-rules.json

# 4) Cross-Region Replication
aws ecr put-replication-configuration \
  --replication-configuration file://replication.json

# 5) Pull Through Cache (Docker Hub)
aws ecr create-pull-through-cache-rule \
  --ecr-repository-prefix dockerhub \
  --upstream-registry-url registry-1.docker.io \
  --credential-arn arn:aws:secretsmanager:...:secret:ecr-pullthrough-dockerhub

# 6) buildspec에서 사용
- aws ecr get-login-password | docker login --username AWS --password-stdin $REGISTRY
- docker build -t $REGISTRY/myapp:$IMAGE_TAG .
- docker push $REGISTRY/myapp:$IMAGE_TAG
```

---

## 📝 연습 문제

**문제 1.** "npm 의존성에 새 CVE가 발견되면 자동 알람"을 구현하려면?

A) Basic Scanning
B) Enhanced Scanning (Inspector) + Security Hub 통합
C) Lambda로 매일 폴링
D) Lifecycle Policy

**정답: B**
해설: Enhanced만 지속 모니터링 + 의존성 스캔.

---

**문제 2.** Image Tag Mutability를 IMMUTABLE로 설정하는 이유는?

A) 비용 절감
B) 같은 태그 덮어쓰기 차단 → 재현성/감사 보장
C) 자동 압축
D) Pull 속도 향상

**정답: B**
해설: prod-v1.2.3 같은 태그를 누가 덮어쓸 수 없게.

---

**문제 3.** Pull Through Cache의 가장 적절한 사용 사례는?

A) 빌드 캐시
B) Docker Hub Rate Limit 우회 + 외부 registry 의존성 캐싱
C) Cross-Account 공유
D) IAM 단순화

**정답: B**
해설: 외부 registry 캐시가 핵심.

---

**문제 4.** ECR Cross-Region Replication이 자동 적용되지 않을 때 확인할 것은?

A) repositoryFilters 패턴 일치 여부 + Replication Configuration 활성
B) Lambda 함수 등록
C) S3 버킷 생성
D) VPC Endpoint

**정답: A**
해설: 필터 매칭 + 활성 상태 점검.

---

**문제 5.** EKS Pod이 같은 계정 ECR pull하려면 가장 안전한 패턴은?

A) Pod Service Account에 IRSA로 IAM Role 매핑 + Role에 ECR 권한
B) Pod에 IAM User 액세스 키
C) 노드 EC2 IAM Role에 ECR 권한 (모든 Pod이 공유)
D) Public Registry 사용

**정답: A**
해설: IRSA가 EKS의 최소 권한 표준.

---

**문제 6.** Lifecycle Policy로 "untagged 7일 후 삭제 + prod 태그 10개만 유지"를 구현하려면?

A) 두 Rule을 priority 1, 2로 설정 + tagStatus 조건
B) Lambda 매일 호출
C) IAM 정책으로 제한
D) Cross-Region Replication

**정답: A**
해설: Lifecycle Policy의 표준 패턴.

---

**문제 7.** ECR Repository Policy의 Cross-Account 사용 시나리오는?

A) 다른 계정이 이 리포지토리에서 직접 pull (replication 없이)
B) IAM Identity Center 통합
C) S3 동기화
D) Lambda 트리거

**정답: A**
해설: Repository Policy가 cross-account read의 표준.

---

## 📌 오늘의 요약

1. Enhanced Scanning (Inspector) = 의존성 + 지속 모니터링 + Security Hub
2. Lifecycle Policy로 이미지 자동 정리 (priority 낮을수록 먼저)
3. Cross-Region/Account Replication으로 DR + 멀티 환경
4. Pull Through Cache로 Docker Hub Rate Limit 우회
5. IMMUTABLE 태그로 재현성/감사 보장
