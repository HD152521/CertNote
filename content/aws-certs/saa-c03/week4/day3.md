# Day 18 - S3 보안: 접근 제어의 계층 구조, 암호화 키 관리, 그리고 데이터 유출 방지

S3 보안 사고의 대부분은 설정 실수에서 온다. 2017년부터 2023년까지 수십 건의 대규모 데이터 유출이 "잘못 설정된 S3 버킷"으로 인해 발생했다. 미국 군 기밀 문서, 대형 항공사 고객 데이터, 수백만 명의 의료 기록이 Public으로 열린 S3 버킷에서 노출됐다. 이 중 많은 경우 버킷 정책에 Allow를 주면서 Block Public Access를 끈 것이 원인이었다.

이 글에서는 S3 접근 제어의 5개 계층이 어떻게 평가되는지 내부 로직을 따라가고, 각 암호화 방식의 키 관리 구조와 실제 차이를 다룬다. 또한 VPC Endpoint 정책으로 데이터 유출을 방지하는 패턴과, 멀티 테넌트 환경에서 S3 Access Points를 활용하는 방법까지 다룬다.

## S3 접근 제어의 역사: 왜 이렇게 복잡한가

S3가 처음 출시됐을 때(2006년), 접근 제어는 ACL(Access Control List) 하나뿐이었다. S3 버킷과 객체에 누가 접근할 수 있는지를 XML로 정의했다. 이것이 AWS 최초의 접근 제어 메커니즘이었다.

2008년 IAM(Identity and Access Management)이 출시되면서 사용자와 그룹에 정책을 부여하는 방식이 추가됐다. S3는 이제 IAM 정책도 지원하기 시작했다. 그러나 IAM 정책은 누가(identity) 무엇을 할 수 있는지를 정의하고, ACL은 특정 버킷/객체에 누구의 접근을 허용하는지를 정의했다. 둘을 함께 쓰다 보니 규칙이 충돌하거나 복잡해졌다.

2012년 버킷 정책(Bucket Policy)이 추가됐다. JSON 기반 리소스 정책으로 더 세밀한 조건(IP, VPC, 암호화 여부 등)을 설정할 수 있었다.

그리고 수천 개의 퍼블릭 버킷 노출 사고 이후, 2018년 AWS는 **Block Public Access(BPA)**를 출시했다. "아무리 정책이나 ACL에 Public Allow가 있어도 이 스위치를 켜면 강제로 차단"하는 최후 안전장치였다.

이것이 현재 S3 접근 제어가 5개 계층으로 이루어진 역사적 이유다.

## 접근 평가 계층: 순서대로 이해하기

S3 요청이 들어오면 AWS는 다음 순서로 접근 허용 여부를 평가한다.

```
[ S3 접근 평가 계층 (평가 순서) ]

1. Block Public Access (BPA)
   → Public ACL/정책 차단. Deny면 즉시 거부.

2. SCP (Service Control Policy)
   → AWS Organizations의 조직 수준 가드레일

3. VPC Endpoint Policy
   → VPC Endpoint를 통한 접근일 경우

4. IAM Identity Policy
   → 요청자(사용자/역할)의 정책

5. Bucket Policy (Resource-based Policy)
   → 버킷에 붙은 JSON 정책

6. Object ACL (오브젝트 소유권 설정에 따라)
   → Bucket Owner Enforced면 무시됨

7. KMS Key Policy (SSE-KMS면)
   → KMS 키에 접근 권한이 있는지
```

핵심 평가 원칙: **어느 계층이든 명시적 Deny가 있으면 즉시 거부**. 모든 계층에서 Allow(또는 묵시적 Allow)가 확인되어야 최종 허용.

교차 계정 접근의 경우 두 계층이 모두 필요하다. 계정 A의 EC2가 계정 B의 S3 버킷에 접근하려면, 계정 A의 IAM 역할이 s3:GetObject를 허용하고, 계정 B의 버킷 정책이 계정 A의 역할을 신뢰해야 한다. 어느 하나만 있으면 안 된다.

> 💡 **관련 이론**: 이 다층 접근 제어 구조는 정보 보안의 **심층 방어(Defense in Depth)** 원칙을 구현한 것이다. NIST SP 800-53의 "Access Control(AC)" 컨트롤 패밀리에서 강조하는 "최소 권한 원칙(Principle of Least Privilege)"과 "직무 분리(Separation of Duties)"를 계층별로 실현한다. BPA는 실수로 인한 설정 오류를 마지막에 잡는 "Fail-Safe Default" 원칙의 구현이다.

## Block Public Access: 4가지 옵션의 세부 의미

BPA는 4개의 독립적인 스위치로 이루어진다.

| 옵션 | 역할 |
|------|------|
| `BlockPublicAcls` | 새로운 Public ACL 추가 차단. 기존 Public ACL은 여전히 동작할 수 있음. |
| `IgnorePublicAcls` | 기존 Public ACL을 무시. 현재 Public ACL로 인한 접근 차단. |
| `BlockPublicPolicy` | 버킷을 Public으로 만드는 버킷 정책 추가/수정 차단. |
| `RestrictPublicBuckets` | 기존 Public 버킷 정책의 효력 차단. Public 정책이 이미 있어도 무효화. |

권장 설정: **4개 모두 true**. 신규 버킷의 기본값이 모두 true다.

BPA를 계정 수준(AWS 계정 전체)에서 활성화하면, 계정 내 모든 버킷에 적용된다. 개별 버킷에서 BPA를 비활성화하더라도 계정 수준 BPA가 있으면 차단된다. 계층 관계다.

> 📚 **사례**: 2019년 Capital One 데이터 유출 사고 이후, AWS는 AWS Config 규칙 `s3-bucket-public-access-prohibited`을 제공해 BPA가 비활성화된 버킷을 자동 감지한다. AWS Security Hub의 "S3 controls" 표준에도 이 검사가 포함된다. 많은 기업이 AWS Organizations SCP로 `s3:PutBucketPublicAccessBlock`의 특정 설정을 강제해서 BPA가 절대 비활성화되지 못하게 한다.

## S3 암호화: 4종의 키 관리 구조

암호화는 **누가 암호화 키를 통제하는가**로 구분한다. 알고리즘(AES-256)은 모두 동일하다.

### SSE-S3: AWS가 모두 관리

```
[ SSE-S3 암호화 흐름 ]

1. 클라이언트가 PutObject 요청
2. S3가 자동으로 데이터 키(DEK) 생성
3. DEK로 데이터를 AES-256 암호화
4. S3가 관리하는 마스터 키로 DEK를 암호화
5. 암호화된 DEK를 암호화된 데이터와 함께 저장
6. GetObject 요청 시 S3가 DEK를 복호화하고 데이터를 복호화해서 반환
```

2023년부터 **모든 신규 S3 객체에 SSE-S3가 기본 적용**된다. 추가 설정 없이도 저장 데이터는 암호화된다. 키를 AWS가 완전히 관리하므로 고객이 키 관리를 할 필요 없다. 단점은 키 접근 감사 로그가 없고, 키 정책을 통한 세밀한 접근 제어가 불가능하다.

### SSE-KMS: KMS 키를 사용한 암호화

```
[ SSE-KMS 봉투 암호화 흐름 ]

1. PutObject 시 S3가 KMS API 호출 (GenerateDataKey)
2. KMS가 DEK(평문)와 암호화된 DEK를 반환
3. S3가 평문 DEK로 데이터 암호화, 메모리에서 평문 DEK 삭제
4. 암호화된 DEK를 암호화된 데이터와 함께 저장

5. GetObject 시 S3가 KMS API 호출 (Decrypt)
6. KMS가 DEK를 복호화해서 반환
7. S3가 DEK로 데이터 복호화 후 반환
```

SSE-KMS의 장점:
- **KMS 키 정책**으로 누가 어떤 키를 쓸 수 있는지 세밀하게 제어
- **CloudTrail에 KMS API 호출 로그** → 누가 언제 어떤 객체에 접근했는지 감사 가능
- **키 자동 회전**: KMS 관리형 키는 연간 자동 회전
- **키 비활성화**: 특정 키를 비활성화하면 그 키로 암호화된 모든 데이터에 접근 불가 (데이터 보관 종료 메커니즘)

단점: **KMS API 호출 비용**. 객체를 쓰고 읽을 때마다 KMS를 호출하므로, 초당 수천 건의 S3 요청이 발생하면 KMS 호출 비용도 높아진다.

**S3 Bucket Keys**: 이 비용을 줄이기 위한 기능이다. Bucket Key는 KMS에서 생성한 데이터 암호화 키(DEK)를 S3 레벨에서 일시적으로 캐시해서, 모든 객체 요청마다 KMS를 호출하지 않고 Bucket Key로 DEK를 생성한다. KMS 호출 수를 99% 줄일 수 있다.

> 🔍 **더 깊이**: 봉투 암호화(Envelope Encryption)는 NIST SP 800-57에서 권장하는 방식이다. 마스터 키(KMS CMK)가 데이터 키(DEK)를 암호화하고, DEK가 실제 데이터를 암호화한다. 마스터 키는 절대 KMS 밖으로 나오지 않는다. 이 구조의 이점은 마스터 키 노출 없이 수많은 객체를 독립적인 DEK로 암호화할 수 있다는 것이다. 마스터 키를 교체(rotation)하면 기존 DEK를 새 키로 재암호화하면 되고, 데이터 자체를 재암호화할 필요가 없다.

### SSE-C: 고객이 키를 제공

```
[ SSE-C 흐름 ]

PUT 요청 헤더:
  x-amz-server-side-encryption-customer-algorithm: AES256
  x-amz-server-side-encryption-customer-key: [Base64 인코딩된 256비트 키]
  x-amz-server-side-encryption-customer-key-MD5: [키의 MD5]

S3가 제공된 키로 데이터 암호화 후, 키를 즉시 폐기(저장 안 함)
→ 같은 키 없이는 복호화 불가
```

SSE-C는 AWS가 키를 보관하지 않는다. 고객이 직접 키를 관리하고, 요청 시마다 헤더에 포함해야 한다. 키를 잃으면 데이터를 영구 잃는다. HTTPS 필수(평문 전송 불가).

규제 환경에서 "암호화 키가 AWS 인프라에 존재해서는 안 된다"는 요건을 충족하지만 키 관리 부담이 크다. 현업에서는 자체 HSM(Hardware Security Module)이나 키 관리 시스템과 통합해 쓴다.

### CSE: 클라이언트 측 암호화

클라이언트(SDK, 앱)가 데이터를 암호화한 후 S3에 업로드한다. S3는 이미 암호화된 Blob을 받아서 저장할 뿐이다. S3도, AWS도 평문 데이터를 볼 수 없다.

가장 강력한 보안이지만 애플리케이션 코드 복잡도가 높고, S3의 서버 측 기능(Object Lambda, S3 Select 등)을 사용할 수 없다. FIPS 140-3 Level 3 이상의 HSM이 필요한 최고 규제 환경에서 쓴다.

> 💡 **관련 이론**: 암호화 방식 비교는 **신뢰 경계(Trust Boundary)** 개념으로 정리된다. SSE-S3는 AWS 인프라 전체를 신뢰. SSE-KMS는 AWS 인프라를 신뢰하되 키 접근은 IAM+KMS 정책으로 제한. SSE-C는 S3 서비스를 신뢰하되 키는 절대 AWS에 두지 않음. CSE는 AWS 서비스 자체를 신뢰하지 않음. 이 스펙트럼은 Zero Trust 보안 모델에서 "누구도 기본적으로 신뢰하지 않는다"는 원칙과 연결된다.

### DSSE-KMS: 이중 암호화

DSSE-KMS는 KMS 키로 데이터를 두 번 암호화한다. FIPS 140-3 규정이나 미국 정부 기관의 일부 데이터 요건을 위해 설계됐다. 일반 기업에서는 오버스펙이다.

## Object Ownership: ACL의 종말

역사적으로 S3 ACL은 다른 AWS 계정이 업로드한 객체의 소유권 문제를 해결하기 위해 쓰였다. 계정 A의 버킷에 계정 B가 객체를 업로드하면, 계정 A가 그 객체를 읽거나 삭제하려면 ACL에서 계정 A에 권한을 줘야 했다.

AWS는 이를 간소화하기 위해 **Object Ownership** 설정을 도입했다.

- `BucketOwnerPreferred`: 다른 계정이 업로드 시 `bucket-owner-full-control` ACL을 포함하면 버킷 소유자가 객체를 소유.
- **`BucketOwnerEnforced`(권장)**: ACL 완전 비활성화. 버킷 소유자가 모든 객체를 소유. 접근 제어는 버킷 정책으로만.

`BucketOwnerEnforced`는 ACL이라는 레거시 메커니즘을 제거하고 접근 제어를 버킷 정책 하나로 단순화한다. AWS는 이 모드를 강력하게 권장한다.

## S3 Access Points: 멀티 테넌트 접근 제어

큰 데이터 레이크 버킷에 여러 팀이 접근할 때, 각 팀은 자신의 prefix(/team-a/, /team-b/)에만 접근해야 한다. 버킷 정책 하나에 모든 팀의 규칙을 담으면 정책이 너무 복잡해지고, 팀이 늘어날수록 관리가 어려워진다.

S3 Access Points는 버킷에 대한 네임드 네트워크 엔드포인트다. 각 Access Point에 자체 정책을 붙일 수 있고, 버킷 정책에서는 Access Points를 통한 접근만 허용할 수 있다.

```
[ S3 Access Points 구조 ]

S3 버킷 (data-lake)
  │
  ├─ Access Point: team-a-ap
  │     정책: s3:Get* on arn:...data-lake/team-a/*
  │     VPC 제한: vpc-aaa
  │
  ├─ Access Point: team-b-ap
  │     정책: s3:Get* s3:Put* on arn:...data-lake/team-b/*
  │
  └─ Access Point: analytics-ap
        정책: s3:Get* on arn:...data-lake/*
        VPC 제한: vpc-analytics
```

Access Points의 특수 타입인 **Multi-Region Access Points**는 여러 리전의 버킷을 하나의 글로벌 엔드포인트로 제공한다. Route 53 Anycast 기반으로 가장 가까운 리전의 버킷으로 라우팅된다.

## VPC Endpoint와 S3: 데이터 유출 방지

S3는 기본적으로 인터넷을 통해 접근한다. EC2에서 S3에 접근할 때도 NAT Gateway나 인터넷 게이트웨이를 통한다. 이 경로에서 데이터가 AWS 네트워크 밖으로 나갈 수 있고, 아웃바운드 전송 비용도 발생한다.

**VPC Gateway Endpoint for S3**: 인터넷 없이 VPC 내에서 S3에 직접 접근하는 경로를 제공한다. 추가 비용 없음. Route Table에 S3의 Prefix List를 추가하면 S3 트래픽이 자동으로 이 경로를 사용한다.

**Endpoint 정책**: VPC Endpoint에 정책을 붙여서 "이 VPC에서는 특정 버킷에만 접근 가능"하게 제한할 수 있다. 데이터 유출(Exfiltration) 방지에 핵심이다.

```json
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": [
      "arn:aws:s3:::company-data-bucket",
      "arn:aws:s3:::company-data-bucket/*"
    ]
  }]
}
```

이 Endpoint 정책과 함께, S3 버킷 정책에서 `aws:SourceVpce` 조건으로 특정 VPC Endpoint를 통한 접근만 허용하면, 인터넷을 통한 S3 접근이 차단된다.

```json
{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::company-data-bucket/*"],
  "Condition": {
    "StringNotEquals": {
      "aws:SourceVpce": "vpce-1234abcd"
    }
  }
}
```

> 📚 **사례**: 금융 서비스 회사들은 종종 이 패턴을 사용해 데이터 분석 인스턴스가 승인된 데이터 버킷에만 접근하고, 개인 S3 계정이나 외부 버킷으로 데이터를 유출하지 못하도록 막는다. VPC Endpoint 정책을 "특정 계정의 버킷만 허용"으로 설정하면 같은 AWS 서비스라도 다른 계정의 S3로 데이터를 보내는 것이 차단된다.

## CORS 설정: 브라우저 보안 정책과의 상호작용

CORS(Cross-Origin Resource Sharing)는 브라우저의 동일 출처 정책(Same-Origin Policy)을 제어하는 HTTP 메커니즘이다. `https://app.example.com`에서 로드된 JavaScript가 `https://my-bucket.s3.amazonaws.com`의 파일에 접근하면, 브라우저가 CORS 정책을 확인한다.

S3 버킷의 CORS 설정:
```json
[{
  "AllowedHeaders": ["*"],
  "AllowedMethods": ["GET", "PUT"],
  "AllowedOrigins": ["https://app.example.com"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}]
```

Presigned URL을 통한 브라우저 직접 업로드 패턴에서 CORS 설정이 필수다. 브라우저가 PUT 전에 `OPTIONS` preflight 요청을 보내고, S3가 CORS 설정을 기반으로 허용 여부를 응답한다.

## 정적 웹사이트 호스팅: OAC와의 연계

S3 정적 웹사이트 호스팅은 버킷을 HTTP 서버처럼 동작하게 한다. 그러나 직접 노출하면 BPA를 비활성화해야 하고, HTTPS도 지원하지 않는다.

현대적 패턴은 **CloudFront + OAC(Origin Access Control)** 조합이다.

```
[ CloudFront + OAC 아키텍처 ]

사용자 (HTTPS) → CloudFront
                   ├─ 캐시 HIT: 바로 응답
                   └─ 캐시 MISS: OAC 서명된 요청 → S3 버킷 (Private)
                                   ← S3 응답 → CloudFront 캐시 → 사용자

버킷 정책: CloudFront OAC Principal만 허용
BPA: 완전 활성화 (외부 직접 접근 차단)
```

OAC(Origin Access Control)는 OAI(Origin Access Identity)의 후계자로, CloudFront가 S3에 접근할 때 AWS Signature V4로 서명한 요청을 보낸다. S3 버킷은 이 특정 CloudFront Distribution의 요청만 허용하도록 버킷 정책을 설정한다.

> ⚠️ **함정**: OAI(Origin Access Identity)는 레거시이고 OAC(Origin Access Control)가 권장된다. OAC는 SSE-KMS로 암호화된 S3 버킷도 지원하고, 모든 리전의 S3를 지원한다. 시험 문제에서 최신 기능을 묻는다면 OAC가 맞다.

## CLI로 이해 굳히기

```bash
# Block Public Access 4개 모두 활성화
aws s3api put-public-access-block \
  --bucket my-bucket \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,\
    BlockPublicPolicy=true,RestrictPublicBuckets=true

# 계정 수준 BPA 활성화
aws s3control put-public-access-block \
  --account-id 123456789012 \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,\
    BlockPublicPolicy=true,RestrictPublicBuckets=true

# SSE-KMS 기본 암호화 설정 (Bucket Keys 포함)
aws s3api put-bucket-encryption \
  --bucket my-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "arn:aws:kms:ap-northeast-2:123456789012:key/abc123"
      },
      "BucketKeyEnabled": true
    }]
  }'

# HTTPS 강제 버킷 정책
aws s3api put-bucket-policy \
  --bucket my-bucket \
  --policy '{
    "Statement": [{
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::my-bucket",
        "arn:aws:s3:::my-bucket/*"
      ],
      "Condition": {
        "Bool": {"aws:SecureTransport": "false"}
      }
    }]
  }'

# Object Ownership = BucketOwnerEnforced (ACL 비활성화)
aws s3api put-bucket-ownership-controls \
  --bucket my-bucket \
  --ownership-controls '{
    "Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]
  }'

# S3 Access Point 생성 (VPC 제한)
aws s3control create-access-point \
  --account-id 123456789012 \
  --name team-a-access-point \
  --bucket my-data-lake \
  --vpc-configuration VpcId=vpc-12345678

# Access Point 정책 설정
aws s3control put-access-point-policy \
  --account-id 123456789012 \
  --name team-a-access-point \
  --policy '{
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::123456789012:role/team-a-role"},
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:ap-northeast-2:123456789012:accesspoint/team-a-access-point/object/team-a/*"
    }]
  }'
```

## 정리하며

S3 보안은 단일 설정이 아닌 계층적 방어(Defense in Depth)다. BPA가 실수에 의한 퍼블릭 노출을 막고, IAM + 버킷 정책이 정상 접근을 제어하고, VPC Endpoint 정책이 네트워크 경로를 제한하고, KMS가 데이터 자체를 보호한다.

암호화는 "누가 키를 통제하는가"가 핵심이다. 감사 추적과 세밀한 키 접근 제어가 필요하면 SSE-KMS, 비용 최적화가 필요하면 Bucket Keys, AWS에 키를 두기 싫으면 SSE-C, 완전한 제어를 원하면 CSE.

---

## 📝 연습 문제

**문제 1.** 보안 감사팀이 S3 버킷의 모든 데이터 접근(누가 언제 어떤 객체를 읽었는지)을 감사해야 한다. 또한 규정 준수를 위해 암호화 키의 자동 연간 회전도 필요하다. 가장 적합한 암호화 방식은?

A) SSE-S3 (기본 암호화)
B) SSE-KMS (고객 관리형 KMS 키, CloudTrail 로깅 활성화)
C) SSE-C (고객 제공 키)
D) CSE (클라이언트 측 암호화)

**정답: B**
해설: SSE-KMS는 KMS API 호출이 CloudTrail에 기록되어 누가 언제 어떤 키로 어떤 작업을 했는지 감사 로그를 제공한다. KMS 고객 관리형 키(CMK)는 연간 자동 회전을 설정할 수 있다. SSE-S3는 AWS가 키를 완전 관리하므로 감사 로그나 키 회전 제어가 불가능하다. SSE-C는 키를 AWS에 보관하지 않아 CloudTrail 감사 추적이 약하다. CSE는 S3 서비스 자체가 데이터를 볼 수 없어 S3 레벨의 접근 감사가 제한된다.

---

**문제 2.** 회사가 중앙 데이터 레이크 S3 버킷에 데이터 분석팀(prefix: /analytics/), 마케팅팀(prefix: /marketing/), HR팀(prefix: /hr/)이 접근한다. 각 팀은 자신의 prefix에만 접근해야 하며, 접근 경로를 팀별로 독립적으로 관리하고 싶다. 버킷 정책을 단순하게 유지하는 방법은?

A) 팀마다 별도의 S3 버킷을 생성한다
B) S3 Access Points를 팀별로 생성하고 각 Access Point에 prefix 제한 정책을 설정한다
C) 하나의 버킷 정책에 팀별 조건을 추가한다
D) ACL로 팀별 접근을 제어한다

**정답: B**
해설: S3 Access Points는 각 팀에 독립적인 엔드포인트와 정책을 제공한다. 팀이 늘어나도 Access Point를 추가하면 되고, 버킷 정책은 "Access Points를 통한 접근만 허용"으로 단순하게 유지된다. A는 데이터가 분산되어 교차 분석이 어렵다. C는 버킷 정책이 팀이 늘어날수록 복잡해진다. D는 ACL이 레거시이고 prefix별 세밀한 제어가 어렵다.

---

**문제 3.** 데이터 분석 EC2 인스턴스가 S3 버킷에서 민감한 데이터를 읽는다. 보안팀이 인터넷을 통한 데이터 유출을 방지하고, 이 인스턴스가 승인된 버킷 외의 S3에 접근하지 못하게 하고 싶다. 어떻게 구성하는가?

A) S3 버킷 정책에 EC2 인스턴스의 IP를 화이트리스트로 추가
B) VPC Gateway Endpoint for S3 + Endpoint 정책(특정 버킷만 허용) + S3 버킷 정책(VPC Endpoint에서만 접근 허용)
C) NAT Gateway + Security Group으로 트래픽 제한
D) CloudFront OAC로 S3 접근 제한

**정답: B**
해설: VPC Gateway Endpoint는 인터넷 없이 S3에 접근하는 경로를 제공한다. Endpoint 정책에서 특정 버킷만 허용하면 다른 S3 버킷으로의 접근이 차단된다. S3 버킷 정책에서 `aws:SourceVpce` 조건으로 이 VPC Endpoint만 허용하면 인터넷을 통한 접근도 차단된다. A는 EC2 IP가 변할 수 있고 NAT Gateway IP는 여러 인스턴스가 공유한다. C는 트래픽이 인터넷을 통해 S3에 가는 것을 막지 못한다. D는 정적 컨텐츠 배포용이지 데이터 유출 방지 목적이 아니다.

---

**문제 4.** 개발팀이 React 앱을 S3 버킷에서 호스팅하고, CloudFront를 통해 배포한다. S3 버킷에 직접 접근(Public)을 차단하고 CloudFront를 통해서만 접근 가능하게 하려면?

A) S3 버킷을 Public으로 설정 + CloudFront 앞단 배치
B) CloudFront Distribution에 OAC(Origin Access Control) 설정 + S3 버킷 BPA 완전 활성화 + 버킷 정책에 CloudFront OAC Principal만 허용
C) CloudFront Distribution에 OAI(Origin Access Identity) 설정 + S3 버킷 BPA 비활성화
D) S3 Transfer Acceleration + CloudFront 없이 직접 배포

**정답: B**
해설: OAC는 OAI의 최신 후계자로 SSE-KMS 버킷도 지원한다. BPA를 완전 활성화하면 S3 버킷에 직접 접근이 차단된다. 버킷 정책에서 CloudFront의 OAC Service Principal(`cloudfront.amazonaws.com`)을 허용하면 CloudFront만 S3에 접근할 수 있다. A는 S3를 Public으로 열어야 한다. C의 OAI는 레거시이고 BPA 비활성화는 다른 경로로 Public 접근 가능성이 생긴다.

---

**문제 5.** 회사가 모든 S3 요청에 HTTPS만 허용하고, HTTP를 통한 접근을 차단하고 싶다. 어떻게 구성하는가?

A) CloudFront에서 HTTP를 HTTPS로 리다이렉트 설정
B) 버킷 정책에 `aws:SecureTransport: "false"` 조건의 Deny 문(Statement)을 추가
C) S3 버킷 설정에서 "HTTP 비활성화" 옵션 체크
D) 보안 그룹으로 포트 80 트래픽 차단

**정답: B**
해설: `aws:SecureTransport: "false"` 조건의 Deny는 TLS(HTTPS) 없이 오는 모든 S3 요청을 차단한다. 이 정책을 버킷 정책에 추가하면 SDK, CLI, 직접 HTTP 요청 모두 차단된다. A는 CloudFront를 경유하는 트래픽만 리다이렉트하고 직접 S3 API 호출은 막지 못한다. S3에는 "HTTP 비활성화" 옵션이 없다. S3는 퍼블릭 서비스이므로 보안 그룹이 없다.

---

**문제 6.** SSE-KMS로 암호화된 S3 버킷에서 초당 10,000개 이상의 객체를 읽는 분석 워크로드가 있다. KMS API 호출 비용이 예상보다 높다. 암호화를 유지하면서 KMS 비용을 줄이는 방법은?

A) SSE-S3로 암호화 방식을 변경
B) S3 Bucket Keys 기능을 활성화
C) 데이터를 로컬로 복호화해서 캐시에 저장
D) KMS 키를 삭제하고 새 키를 매주 생성

**정답: B**
해설: S3 Bucket Keys는 KMS에서 생성한 임시 키를 S3 레벨에서 캐시해, 모든 객체 요청마다 KMS API를 호출하는 대신 Bucket Key로 DEK를 생성한다. KMS 호출 수를 최대 99% 줄일 수 있다. SSE-KMS와 감사 추적 기능은 그대로 유지된다. A는 KMS 감사 추적이 없어져 규정 준수 요건을 충족하지 못한다. C는 로컬 캐시에 평문 데이터를 두는 보안 위험이 있다. D는 기존 데이터 복호화 불가 위험이 있다.

---

**문제 7.** 다음 중 S3 접근 평가에서 "명시적 Deny"가 발생하는 경우를 모두 고르시오.

A) SCP에서 s3:DeleteObject를 Deny
B) 버킷 정책에 aws:SecureTransport=false 요청을 Deny
C) IAM 정책에 s3:PutObject가 없음(Allow가 없음)
D) Block Public Access가 활성화된 버킷에 Public ACL로 접근
E) VPC Endpoint 정책에서 특정 버킷만 허용하고 다른 버킷에 접근

**정답: A, B, D, E**
해설: A - SCP의 Deny는 조직 전체에 적용되는 명시적 Deny. B - 버킷 정책의 Deny 문. D - BPA가 Public ACL을 강제 차단하므로 명시적 Deny 효과. E - VPC Endpoint 정책에서 허용되지 않은 버킷은 Deny 처리. C는 "명시적 Deny"가 아니라 "묵시적 Deny(Allow 부재)"다. IAM 정책에 Allow가 없다고 해서 명시적 Deny는 아니며, 다른 계층(버킷 정책)에서 Allow가 있으면 접근 가능할 수 있다. 단, 교차 계정 접근에서는 양쪽 모두 Allow가 필요하다.