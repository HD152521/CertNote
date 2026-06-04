# Day 19 - CloudFront와 Storage Gateway: CDN의 내부 구조와 하이브리드 스토리지 패턴

CloudFront는 단순한 캐시 서버가 아니다. 2008년 출시된 이후 400개가 넘는 엣지 PoP(Point of Presence)로 확장됐고, HTTP 캐시를 넘어 엣지 컴퓨팅, TLS 종료, WAF, 서명 인증, 동적 콘텐츠 가속까지 담당한다. Netflix가 1억 명의 동시 시청자에게 비디오를 스트리밍할 수 있는 것, Amazon Prime Video가 전 세계에서 낮은 레이턴시를 유지할 수 있는 것, 모두 CloudFront 아키텍처 덕분이다.

이 글에서는 CloudFront의 캐시 계층 구조(PoP → Regional Edge Cache → Origin Shield), OAC의 서명 메커니즘, Lambda@Edge와 CloudFront Functions의 실행 위치 차이, Storage Gateway의 4가지 모드의 내부 동작을 다룬다. 그리고 언제 DataSync를 쓰고, 언제 Storage Gateway를 쓰고, 언제 Snow Family를 써야 하는지 판단 기준을 정리한다.

## CloudFront의 3계층 캐시 구조

CloudFront는 단순히 "엣지에 캐시한다"는 설명으로는 부족하다. 실제로는 3계층 구조로 동작한다.

```
[ CloudFront 캐시 계층 ]

사용자 (서울)
    ↓
PoP (Edge Location) - 서울 PoP
    ↓ (캐시 미스 시)
Regional Edge Cache (REC) - ap-northeast 리전 REC
    ↓ (REC도 미스 시)
Origin Shield (선택적 추가 계층)
    ↓ (Origin Shield도 미스 시)
Origin (S3, ALB, EC2 등)
```

**PoP(Point of Presence, Edge Location)**: 사용자와 가장 가까운 곳. 400개 이상 전 세계 도시. 캐시 용량이 작아서 자주 요청되는 인기 콘텐츠만 유지한다.

**Regional Edge Cache(REC)**: 각 지리적 리전(아태, 북미, 유럽 등)당 몇 개씩 배치. PoP보다 큰 캐시를 가져서 덜 인기 있는 콘텐츠를 더 오래 유지한다. PoP가 미스하면 REC를 먼저 확인하므로, 오리진 부하가 크게 줄어든다.

**Origin Shield**: 옵션으로 추가하는 중간 캐시 계층. 특정 AWS 리전에 배치하면 모든 REC의 캐시 미스 요청이 Origin Shield를 거쳐서 오리진으로 간다. 다양한 지역에서 같은 오리진에 접근하는 트래픽을 하나의 경로로 집약해 오리진 동시 요청 수를 최소화한다. 다국적 미디어 회사가 하나의 오리진 서버로 글로벌 배포할 때 특히 효과적이다.

> 💡 **관련 이론**: 이 3계층 캐시 구조는 **계층적 캐싱(Hierarchical Caching)**의 구현이다. CDN 이론에서 계층적 캐시는 L1(소형·빠름·짧은 TTL) → L2(대형·조금 느림·긴 TTL) → Origin의 패턴을 따른다. 각 계층에서 캐시 히트율(Cache Hit Ratio)이 높을수록 오리진 부하와 비용이 줄어든다. CloudFront의 Metrics에서 `CacheHitRate`를 보면 각 계층의 효과를 측정할 수 있다.

> 📚 **사례**: Airbnb는 CloudFront와 Origin Shield를 통해 전 세계 여행자들에게 숙소 이미지를 제공한다. Origin Shield를 us-east-1에 배치해 모든 글로벌 REC의 미스 요청을 집약했다. 이를 통해 오리진 이미지 서버의 요청 수를 90% 이상 줄이고, 전 세계 페이지 로드 시간을 평균 40% 단축했다. (AWS re:Invent 2021 발표 내용 기반)

## 캐시 동작(Cache Behavior): CloudFront의 핵심 설정 단위

Cache Behavior는 URL 패턴별로 다른 캐시 규칙을 적용하는 설정 단위다. 하나의 CloudFront Distribution에 여러 Cache Behavior를 설정할 수 있다.

```
[ Cache Behavior 패턴 예시 ]

Distribution: https://cdn.example.com

Behavior 1: /api/*
  - Origin: ALB (동적 콘텐츠)
  - TTL: 0 (캐시 안 함)
  - 모든 헤더/쿠키 오리진에 전달

Behavior 2: /static/*
  - Origin: S3 버킷
  - TTL: 86400 (1일)
  - 헤더/쿠키 무시 (캐시 키 단순화)

Behavior 3: /images/*.jpg
  - Origin: S3 버킷
  - TTL: 604800 (7일)
  - 쿼리 파라미터 "width", "format"을 캐시 키에 포함

Default: /
  - Origin: S3 버킷 (SPA)
  - TTL: 3600 (1시간)
```

**Cache Policy**: 캐시 키(무엇을 기준으로 같은 캐시인지 결정)와 TTL을 정의한다. 헤더, 쿠키, 쿼리 파라미터 중 어떤 것을 캐시 키에 포함할지가 핵심이다. 쿠키를 캐시 키에 포함하면 같은 URL도 쿠키가 다르면 다른 캐시로 취급한다. 이것이 개인화된 콘텐츠를 캐시할 때 주의해야 하는 이유다.

**Origin Request Policy**: 오리진으로 요청을 보낼 때 어떤 헤더/쿠키/쿼리 파라미터를 포함할지 정의한다. 캐시 키와 독립적으로 오리진 요청을 커스터마이징한다.

> 🔍 **더 깊이**: CloudFront의 TTL 결정은 여러 레이어를 통해 이루어진다. 우선순위: (1) `Cache-Control: no-cache/no-store` 헤더 → 캐시 안 함. (2) `Cache-Control: max-age=X` 또는 `Expires` 헤더 → 해당 값 사용. (3) Cache Policy의 Default TTL → 둘 다 없을 때 사용. Cache Policy에는 Min TTL(오리진이 더 짧은 TTL을 지정해도 이 값 이상), Max TTL(오리진이 더 긴 TTL을 지정해도 이 값 이하), Default TTL(오리진 TTL 없을 때)이 있다.

## OAC vs OAI: S3 보호의 진화

**OAI(Origin Access Identity)**는 2009년에 도입된 레거시 방식이다. CloudFront 전용의 특수 IAM Principal을 만들어 S3 버킷 정책에서 그 Principal만 허용했다. 단점: SigV4를 지원하지 않아 SSE-KMS 암호화 버킷에 사용 불가. 일부 리전에서 제한적.

**OAC(Origin Access Control)**는 2022년 출시된 최신 권장 방식이다.

```
[ OAC 서명 흐름 ]

사용자 요청 → CloudFront 엣지
캐시 미스 시:
  CloudFront가 S3에 요청할 때 AWS Signature V4로 서명

서명 포함 항목:
  - HTTP 메서드
  - 요청 URI
  - 요청 헤더 (host, x-amz-date)
  - 요청 바디 해시
  - CloudFront Distribution ARN

S3 버킷 정책 검증:
  - Principal: cloudfront.amazonaws.com
  - Condition: aws:SourceArn = Distribution ARN
  → 이 Distribution에서 온 요청만 허용
```

OAC의 장점:
- **SSE-KMS 암호화 S3 버킷 지원** (OAI는 불가)
- **모든 AWS 리전 S3 지원** (OAI는 일부 리전 제한)
- SigV4 서명 → 더 강한 인증
- Distribution ARN 조건 → 특정 Distribution에서만 접근 가능

> ⚠️ **함정**: S3 정적 호스팅 엔드포인트(`bucket.s3-website-region.amazonaws.com`)를 오리진으로 사용하면 OAC가 동작하지 않는다. OAC는 S3 REST 엔드포인트(`bucket.s3.region.amazonaws.com`)에서만 동작한다. 정적 호스팅 기능(커스텀 에러 페이지, 인덱스 문서 설정)이 필요하면 REST 엔드포인트 기반 S3를 오리진으로 쓰고, `CustomErrorResponse`로 CloudFront에서 처리해야 한다.

## 엣지 컴퓨팅: Lambda@Edge vs CloudFront Functions

CloudFront에는 두 가지 엣지 컴퓨팅 옵션이 있다. **어디서, 얼마나 무거운 로직을 실행하는가**의 차이다.

```
[ 실행 위치 비교 ]

사용자
  ↓
PoP (Edge Location) ← CloudFront Functions가 여기서 실행
  ↓ (캐시 미스)
Regional Edge Cache ← Lambda@Edge가 여기서 실행
  ↓
Origin Shield
  ↓
Origin
```

**CloudFront Functions**:
- 400+ PoP에서 실행 → 사용자와 가장 가까운 곳
- 런타임: JavaScript ES5 (제한된 API)
- 메모리: 2MB, 실행 시간: 1ms 이내
- 콜드 스타트: 사실상 없음 (100μs 미만)
- 비용: Lambda@Edge의 약 1/6
- 지원 이벤트: Viewer Request, Viewer Response만

**Lambda@Edge**:
- 13개 Regional Edge Cache에서 실행
- 런타임: Node.js 16.x, Python 3.11 (전체 런타임)
- 메모리: 최대 10GB, 실행 시간: 최대 30초 (Origin 이벤트)
- 콜드 스타트: 수십~수백 ms
- 비용: Lambda@Edge 요금 (더 비쌈)
- 지원 이벤트: Viewer Request, Viewer Response, Origin Request, Origin Response 모두

```
[ 이벤트 위치 ]

사용자 → [Viewer Request] → CloudFront → [Origin Request] → Origin
사용자 ← [Viewer Response] ← CloudFront ← [Origin Response] ← Origin
```

**CloudFront Functions 적합한 용도**:
- URL 재작성/리다이렉트
- 요청 헤더 추가/수정 (예: `X-Custom-Header`)
- 간단한 인증 토큰 검증
- 쿼리 파라미터 정규화 (캐시 키 최적화)

**Lambda@Edge 적합한 용도**:
- JWT 토큰 검증 (외부 IAM, OAuth 서버 호출)
- A/B 테스트 (DB/ElastiCache에서 실험 설정 읽기)
- 동적 콘텐츠 개인화
- 오리진 응답 변환 (JSON → HTML)
- 이미지 최적화 (Sharp 라이브러리 사용)

> 💡 **관련 이론**: 엣지 컴퓨팅은 **FaaS(Function as a Service)**를 CDN 엣지로 확장한 개념이다. 기존 서버리스(Lambda)는 리전 내에서 동작하지만, Lambda@Edge와 CloudFront Functions는 사용자와 가까운 곳에서 동작해 RTT(Round-Trip Time)를 줄인다. 이는 **Fog Computing**(엣지와 클라우드 사이의 중간 계층) 아키텍처의 클라우드 구현이라 볼 수 있다.

## Signed URL과 Signed Cookie: 콘텐츠 보호

유료 비디오, 사용자 전용 파일, 시간 제한 다운로드에 Signed URL과 Signed Cookie를 사용한다.

**Signed URL**: 단일 파일에 대한 시간 제한 접근.
- 유효 기간(Expire), IP 제한(CIDR), 특정 경로 제한 포함 가능
- CloudFront Signer(Key Group)의 RSA 사서함으로 서명
- 사용 사례: "이 리포트 PDF를 1시간 동안 다운로드"

**Signed Cookie**: 여러 파일에 대한 시간 제한 접근.
- 쿠키 하나로 패턴 매치되는 모든 URL에 접근 가능
- 사용 사례: "프리미엄 구독자가 로그인하면 모든 동영상에 24시간 접근"

```
[ Signed URL 생성 흐름 ]

1. CloudFront Key Group에 RSA 공개키 등록
2. 서버가 RSA 개인키로 서명 생성:
   - Policy: {"Resource":"https://cdn.example.com/video/*",
              "Condition":{"DateLessThan":{"AWS:EpochTime":1735689600}}}
   - Signature: Base64(RSA_SHA1(Policy))
3. Signed URL = CloudFront URL + ?Policy=...&Signature=...&Key-Pair-Id=...
4. 사용자가 Signed URL로 접근 → CloudFront가 서명 검증 → 유효하면 콘텐츠 반환
```

> 📚 **사례**: Netflix의 콘텐츠 배포는 CloudFront Signed URL 기반이다. 사용자가 재생 버튼을 누르면 Netflix 백엔드가 해당 사용자의 구독 상태를 확인하고, 유효 시간 내의 Signed URL을 발급한다. 이 URL로 CloudFront에서 비디오 세그먼트를 받아 재생한다. URL 공유로 다른 사람이 무료로 시청하는 것을 막는 핵심 메커니즘이다.

## CloudFront + WAF: 엣지 보안 통합

AWS WAF를 CloudFront에 연결하면 요청이 엣지에서 필터링된다. 악성 트래픽이 오리진까지 도달하기 전에 차단된다.

WAF의 주요 기능:
- **SQL Injection, XSS 탐지**: OWASP Top 10 기반 관리형 규칙 그룹
- **Rate Limiting**: 동일 IP에서 초당 요청 수 제한
- **IP 화이트/블랙리스트**: 악성 IP 차단
- **지리적 제한(Geo Match)**: 특정 국가 차단
- **Bot Control**: 알려진 봇 차단, 알 수 없는 봇 CAPTCHA

CloudFront 레벨의 WAF는 **글로벌 WAF**로, 모든 엣지에서 동일한 규칙이 적용된다. ALB 레벨의 WAF는 특정 리전에만 적용된다.

> ⚠️ **함정**: CloudFront Geo Restriction은 국가 단위로만 차단한다. 특정 IP 대역이나 ASN(Autonomous System Number) 기반 제한은 WAF IP Sets나 Rate Based Rule을 사용해야 한다.

## Storage Gateway 4종: 하이브리드 스토리지의 설계

Storage Gateway는 온프레미스 서버에 설치하는 가상 어플라이언스(VM 또는 하드웨어 어플라이언스)다. 온프레미스 애플리케이션이 로컬 파일 시스템/블록 스토리지처럼 사용하지만, 데이터는 AWS에 저장된다.

### S3 File Gateway: NFS/SMB → S3

온프레미스 서버가 NFS 또는 SMB로 마운트해서 파일을 읽고 쓴다. 파일이 백그라운드로 S3에 동기화된다. 자주 쓰는 파일은 게이트웨이의 로컬 캐시에 있어 빠른 응답이 가능하다.

```
[ S3 File Gateway 동작 ]

온프레미스 서버
    ↓ NFS/SMB 마운트
File Gateway (VM)
    ├─ 로컬 캐시 (자주 쓰는 파일)
    └─ HTTPS → S3 버킷
               (파일이 S3 객체로 저장)
```

사용 사례: 온프레미스 파일 서버의 백업, 온프레미스 생성 데이터를 S3에 자동 저장, 여러 사이트에서 공통 데이터 접근.

### FSx File Gateway: SMB → FSx Windows File Server

온프레미스 Windows 클라이언트가 SMB로 파일에 접근한다. File Gateway의 로컬 캐시로 자주 쓰는 파일에 빠른 접근, 덜 쓰는 파일은 FSx Windows File Server에서 직접 가져온다. Active Directory 통합을 그대로 사용할 수 있다.

사용 사례: 지사(Branch Office)에서 본사의 FSx Windows File Server에 WAN을 통해 느리게 접근하는 문제 해결. 로컬 캐시로 지사 내에서 빠른 파일 접근.

### Volume Gateway: iSCSI → S3 + EBS 스냅샷

온프레미스 서버에 iSCSI 블록 볼륨을 제공한다. 두 가지 모드:

**Cached Volumes**: 모든 데이터는 S3에 저장, 자주 쓰는 데이터는 로컬 캐시에. 온프레미스 로컬 스토리지 최소화.

**Stored Volumes**: 모든 데이터가 로컬에 있고, S3에 비동기적으로 백업(EBS 스냅샷 형태). 로컬 접근이 항상 빠르지만 로컬 스토리지가 필요.

사용 사례: 온프레미스 DB의 블록 스토리지를 S3/EBS 스냅샷으로 백업, DR용 스냅샷을 AWS에 유지해 필요 시 EC2에서 복원.

### Tape Gateway: iSCSI VTL → S3/Glacier

온프레미스의 Veritas Backup Exec, Veeam, IBM Spectrum Protect 같은 백업 소프트웨어가 테이프 라이브러리로 인식한다. 실제로는 데이터가 S3 또는 Glacier에 저장된다.

사용 사례: 물리 테이프 인프라를 교체 없이 클라우드로 마이그레이션. 테이프 기반 규제 보관을 유지하면서 테이프 물리 관리 제거.

## 데이터 이동 도구 선택: DataSync vs Storage Gateway vs Snow

세 서비스가 헷갈리는 이유는 모두 "온프레미스 ↔ AWS 데이터 이동"에 관련되기 때문이다. 그러나 사용 목적이 다르다.

| | DataSync | Storage Gateway | Snow Family |
|--|---------|----------------|-------------|
| 주 목적 | 마이그레이션/동기화 | 영구 하이브리드 액세스 | 오프라인 대량 전송 |
| 연결 방식 | 인터넷/Direct Connect | 인터넷/Direct Connect | 물리 장치 배송 |
| 스토리지 타입 | 파일, 객체 | 파일, 블록, 테이프 | 데이터 무엇이든 |
| 실시간 동기화 | 예약/실시간 | 지속적 캐시 동기화 | 해당 없음 |
| 오프라인 가능 | 불가 | 불가 | 가능 |
| 적합한 규모 | TB ~ 수백 TB | 모든 규모 | PB 규모 |

**DataSync 선택**: 온프레미스 파일 서버 → S3/EFS/FSx로 데이터 일괄 이전, 또는 AWS 서비스 간 데이터 복사. "이전(Migration)"이 핵심.

**Storage Gateway 선택**: 온프레미스 앱이 계속 AWS 스토리지를 "로컬처럼" 사용해야 할 때. "영구 하이브리드 운영"이 핵심.

**Snow Family 선택**: 인터넷 대역폭이 너무 좁아서 전송 시간이 수주 이상 걸릴 때. 인터넷 없는 오지, 보안 때문에 인터넷 전송 불가, 페타바이트 이상 대용량. "오프라인 물리 전송"이 핵심.

> 💡 **관련 이론**: Snow Family의 필요성은 **저장의 법칙(Kryder's Law)**과 **네트워크 대역폭 성장률** 사이의 격차에서 온다. HDD 밀도는 연간 40%씩 성장하지만 네트워크 대역폭 성장은 그를 따라가지 못한다. 1PB 데이터를 1Gbps 인터넷으로 전송하면 약 12일이 걸린다. Snowball Edge는 100TB를 배송으로 2-3일에 이전할 수 있다. Jim Gray의 논문(2003, "Distributed Computing Economics")에서 처음 분석된 이 문제가 현재도 유효하다.

## 다른 클라우드와의 CloudFront 비교

| 기능 | AWS CloudFront | GCP Cloud CDN | Azure CDN |
|------|---------------|--------------|-----------|
| 엣지 PoP 수 | 400+ | 127+ | 150+ |
| 엣지 컴퓨팅 | Functions + Lambda@Edge | Cloud Run Edge | Azure Functions Edge |
| WAF 통합 | AWS WAF (글로벌) | Google Cloud Armor | Azure WAF |
| Origin Shield | O | O (Cloud CDN Tiered Caching) | 제한적 |
| 오리진 종류 | S3, ALB, EC2, API GW, 커스텀 | GCS, LB, 커스텀 | Blob, LB, 커스텀 |
| Signed URL | O | O (Cloud CDN Signed URLs) | O |
| HTTP/3 | O | O | 일부 |

GCP Cloud CDN은 Google의 글로벌 네트워크(SDN 기반)를 그대로 활용해서 인프라 효율이 높다. 그러나 엣지 컴퓨팅 기능은 CloudFront Functions/Lambda@Edge보다 성숙도가 낮다.

## CLI로 이해 굳히기

```bash
# OAC 생성
OAC_ID=$(aws cloudfront create-origin-access-control \
  --origin-access-control-config '{
    "Name": "site-oac-2026",
    "Description": "OAC for static site",
    "SigningProtocol": "sigv4",
    "SigningBehavior": "always",
    "OriginAccessControlOriginType": "s3"
  }' \
  --query 'OriginAccessControl.Id' --output text)

# CloudFront Distribution 생성 (S3 + OAC)
aws cloudfront create-distribution \
  --distribution-config '{
    "Origins": {
      "Items": [{
        "Id": "s3-origin",
        "DomainName": "my-site.s3.ap-northeast-2.amazonaws.com",
        "S3OriginConfig": {"OriginAccessIdentity": ""},
        "OriginAccessControlId": "'"$OAC_ID"'"
      }]
    },
    "DefaultCacheBehavior": {
      "TargetOriginId": "s3-origin",
      "ViewerProtocolPolicy": "redirect-to-https",
      "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
      "AllowedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}
    },
    "Enabled": true,
    "DefaultRootObject": "index.html"
  }'

# CloudFront Functions 생성 (URL 정규화)
aws cloudfront create-function \
  --name normalize-uri \
  --function-config '{"Comment":"Remove trailing slash","Runtime":"cloudfront-js-2.0"}' \
  --function-code 'function handler(event) {
    var request = event.request;
    var uri = request.uri;
    if (uri.endsWith("/") && uri !== "/") {
      request.uri = uri.slice(0, -1);
    }
    return request;
  }'

# Origin Shield 활성화 (Distribution 업데이트)
aws cloudfront update-distribution \
  --id E1234ABCD \
  --distribution-config '{
    "Origins": {
      "Items": [{
        "Id": "s3-origin",
        "OriginShield": {
          "Enabled": true,
          "OriginShieldRegion": "ap-northeast-2"
        }
      }]
    }
  }'

# Storage Gateway: S3 File Gateway 캐시 볼륨 만들기
aws storagegateway create-nfs-file-share \
  --gateway-arn arn:aws:storagegateway:ap-northeast-2:123456789012:gateway/sgw-xxx \
  --location-arn arn:aws:s3:::my-data-bucket \
  --role arn:aws:iam::123456789012:role/storagegateway-role \
  --client-token $(date +%s) \
  --nfs-file-share-defaults ReadOnly=false
```

## 정리하며

CloudFront는 3계층 캐시 구조(PoP → REC → Origin Shield)로 글로벌 콘텐츠를 효율적으로 배포한다. S3 보호는 OAC + 사설 버킷이 현재 표준이다. 엣지 컴퓨팅은 경량 URL 조작은 CloudFront Functions, 복잡한 비즈니스 로직은 Lambda@Edge를 선택한다.

Storage Gateway는 온프레미스 앱이 AWS 스토리지를 로컬처럼 영구적으로 사용하는 하이브리드 구조다. DataSync는 이전/복제 작업, Snow Family는 페타바이트 오프라인 전송이다. 이 세 가지는 서로 다른 목적이므로 시나리오에서 키워드를 찾는 것이 중요하다.

---

## 📝 연습 문제

**문제 1.** 미디어 회사가 전 세계 사용자에게 4K 동영상을 스트리밍한다. 오리진 서버가 과부하를 받고 있고, 전 세계 다양한 엣지에서 같은 비디오를 반복 요청한다. 오리진 부하를 최소화하고 캐시 히트율을 높이는 설정은?

A) CloudFront Distribution TTL을 0으로 설정
B) CloudFront Origin Shield를 오리진에 가까운 리전에 활성화
C) CloudFront Geo Restriction으로 일부 국가 차단
D) Lambda@Edge로 모든 요청을 오리진으로 전달

**정답: B**
해설: Origin Shield는 전 세계 Regional Edge Cache들의 캐시 미스 요청을 하나의 경로로 집약해 오리진에 보낸다. 같은 비디오에 대한 전 세계 요청 중 Cache Miss가 발생해도 Origin Shield에서 한 번만 오리진에 요청한다. TTL=0은 캐시를 비활성화한다. Geo Restriction은 접근을 차단한다. Lambda@Edge로 오리진 전달은 오히려 부하를 높인다.

---

**문제 2.** 스트리밍 서비스가 프리미엄 구독자에게만 콘텐츠를 제공하고, 비구독자는 접근 불가해야 한다. 구독자가 로그인하면 그의 구독이 유효한 동안 수천 개의 비디오 파일에 접근 가능해야 한다. 가장 적합한 CloudFront 기능은?

A) CloudFront Signed URL (파일별)
B) CloudFront Signed Cookie (패턴 전체)
C) CloudFront WAF IP 화이트리스트
D) S3 Presigned URL (S3에서 직접)

**정답: B**
해설: Signed Cookie는 쿠키 하나로 패턴 매치(`/videos/*`)되는 모든 파일에 접근을 허용한다. 구독자가 로그인하면 서버가 구독 유효 기간까지의 Signed Cookie를 발급하고, 사용자는 그 쿠키로 모든 비디오에 접근한다. Signed URL은 파일 하나에만 적용되므로 수천 개 파일에 개별 URL을 만들어야 한다. WAF IP 화이트리스트는 동적 사용자 접근 제어에 부적합하다.

---

**문제 3.** 회사가 A/B 테스트를 위해 CloudFront에서 10%의 요청을 새 버전 오리진으로 보내고 싶다. 동시에 사용자의 위치 정보를 오리진에 전달해야 한다. 적합한 솔루션은?

A) CloudFront Functions (Viewer Request 이벤트)
B) Lambda@Edge (Origin Request 이벤트) + CloudFront에서 `CloudFront-Viewer-Country` 헤더 전달
C) ALB Weighted Target Group
D) Route 53 Weighted 정책

**정답: B**
해설: A/B 테스트 로직(DB/ElastiCache에서 실험 설정 읽기, 10% 분기)은 Lambda@Edge의 복잡한 비즈니스 로직 실행 능력이 필요하다. CloudFront는 자동으로 `CloudFront-Viewer-Country` 헤더를 추가하며, Origin Request Policy에서 이 헤더를 오리진에 전달하도록 설정한다. Lambda@Edge는 이 헤더를 읽어 오리진을 선택하거나 오리진에 전달할 수 있다. CloudFront Functions는 외부 시스템 호출이 불가능해 A/B 테스트 로직 구현이 제한적이다.

---

**문제 4.** 제조업체의 공장에 온프레미스 Windows 파일 서버가 있다. 파일을 AWS로 이전하면서도 공장의 기존 Windows 앱들이 SMB로 계속 파일에 접근해야 한다. Active Directory 인증을 유지하면서 AWS에서 파일을 관리하고 싶다. 가장 적합한 솔루션은?

A) AWS DataSync + S3 (일회성 이전 후 S3 직접 접근)
B) AWS Storage Gateway FSx File Gateway + Amazon FSx for Windows File Server
C) AWS Storage Gateway S3 File Gateway + S3 버킷
D) AWS Snowball Edge로 파일 이전 후 S3 접근

**정답: B**
해설: FSx File Gateway는 온프레미스 Windows 클라이언트에 SMB 인터페이스를 제공하면서, 로컬 캐시와 FSx Windows File Server(AD 통합 지원)를 백엔드로 연결한다. 기존 Windows 앱이 SMB 연결을 그대로 유지하면서 데이터는 FSx에 저장된다. A의 S3는 SMB를 직접 지원하지 않는다. C의 S3 File Gateway는 NFS/SMB를 지원하지만 AD 통합이 FSx Windows만큼 네이티브하지 않다. D는 일회성 이전이지 영구 하이브리드 운영이 아니다.

---

**문제 5.** 회사가 온프레미스의 Veeam 백업 소프트웨어를 계속 사용하면서 백업 데이터를 AWS로 이동하고 싶다. 물리 테이프 인프라를 제거하고 싶지만 백업 소프트웨어는 교체하기 어렵다. 가장 적합한 솔루션은?

A) AWS DataSync로 백업 파일을 S3에 동기화
B) AWS Storage Gateway Tape Gateway (iSCSI VTL → S3/Glacier)
C) AWS Backup으로 Veeam 교체
D) Amazon S3 on Outposts로 온프레미스에 S3 구성

**정답: B**
해설: Tape Gateway는 iSCSI 가상 테이프 라이브러리(VTL)로 온프레미스 백업 소프트웨어(Veeam, Veritas 등)에 테이프 라이브러리처럼 보인다. 백업 소프트웨어 교체 없이 물리 테이프 대신 AWS S3/Glacier에 백업이 저장된다. DataSync는 파일 마이그레이션 도구이고 Veeam과 직접 통합되지 않는다. AWS Backup은 별도 도구로 Veeam 교체를 의미한다. Outposts는 온프레미스에 AWS 인프라를 두는 것으로 백업 소프트웨어 통합과 무관하다.

---

**문제 6.** Lambda@Edge와 CloudFront Functions 중 적합한 도구를 선택하시오.

상황 A: CloudFront로 들어오는 요청의 쿼리 파라미터 순서를 정규화해서 캐시 히트율을 높인다 (?b=2&a=1 → ?a=1&b=2)
상황 B: 사용자의 JWT 토큰을 검증하고 유효하지 않으면 401을 반환한다. JWT 검증은 외부 JWKS 엔드포인트를 호출해야 한다.

A) 상황 A: Lambda@Edge / 상황 B: CloudFront Functions
B) 상황 A: CloudFront Functions / 상황 B: Lambda@Edge
C) 둘 다 CloudFront Functions
D) 둘 다 Lambda@Edge

**정답: B**
해설: 상황 A는 쿼리 파라미터 재정렬만 하는 경량 URL 조작으로 CloudFront Functions(1ms 이내, 2MB 메모리)에 최적이다. 상황 B는 외부 JWKS 엔드포인트 HTTP 호출이 필요한데, CloudFront Functions는 외부 네트워크 호출을 지원하지 않는다. Lambda@Edge는 Node.js/Python 전체 런타임과 외부 네트워크 접근이 가능하므로 JWKS 호출로 JWT 검증이 가능하다. 비용과 레이턴시 면에서 적합한 도구를 선택하는 것이 핵심이다.