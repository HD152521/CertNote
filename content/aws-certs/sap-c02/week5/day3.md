# Day 23 - CloudFront 심화: CDN이 단순 캐시가 아닌 이유

인터넷 사용자가 서울에서 미국 동부 서버에 요청을 보내면 약 180ms의 왕복 지연이 생긴다. 광속 한계다. CDN(Content Delivery Network)의 출발점은 이 물리 법칙을 우회하는 것이었다. 1998년 Akamai가 처음 상용 CDN을 시작했을 때 아이디어는 단순했다. "콘텐츠를 사용자 가까이 복사해두면 된다." 그런데 2024년의 CloudFront는 단순 캐시를 훨씬 넘어섰다. **보안 계층(WAF, Shield, OAC), 컴퓨팅 계층(Lambda@Edge, CloudFront Functions), 접근 제어(Signed URL/Cookie, Field-Level Encryption)**를 통합한 엣지 플랫폼이다.

SAP-C02에서 CloudFront는 단독으로도 출제되지만, WAF·Shield·S3·API Gateway·ALB와의 조합 시나리오로 더 자주 나온다. 각 기능이 왜 존재하는지 역사적·기술적 맥락을 이해하면 새로운 조합 문제도 원칙에서 풀린다.

## CloudFront의 물리적 구조: PoP와 Region Edge

CloudFront의 네트워크는 단일 레이어가 아니다. 세 계층으로 구성된다.

```
사용자
  │
  ▼
Edge Location (PoP) — 400+ 개, 전 세계 도시 단위
  │ Cache Miss 시
  ▼
Regional Edge Cache — 12개 리전, 대형 캐시
  │ Cache Miss 시
  ▼
Origin Shield — 선택적 추가 캐시 계층 (특정 AWS 리전 1곳)
  │ Cache Miss 시
  ▼
Origin (S3, ALB, API Gateway, Custom HTTP 등)
```

**왜 이 계층이 중요한가?** Origin Shield 없이 400개 PoP가 모두 직접 Origin을 호출하면, 동시 Cache Miss 시 Origin에 400개 요청이 쏟아진다. Origin Shield가 추가 캐싱 레이어로 동작해 Origin 부하를 최대 99% 감소시킬 수 있다. 이것이 글로벌 서비스에서 Origin Shield를 쓰는 이유다.

> 💡 **관련 이론**: Cache Stampede(Thundering Herd) 문제. 인기 있는 캐시 항목이 동시에 만료되면, 수많은 요청이 동시에 Origin으로 몰리는 현상이다. 해결책: (1) Cache-Control stale-while-revalidate: 만료 후에도 stale 응답을 제공하면서 백그라운드에서 갱신. (2) Request Collapsing: CloudFront는 동시 Cache Miss를 "하나의 Origin 요청"으로 합친다(기본 동작). (3) Origin Shield로 지역별 Cache Miss를 한 층에서 흡수.

> 📚 **사례**: 2022년 월드컵 결승전 중계. 아르헨티나 vs 프랑스 경기 당시 전 세계 수천만 동시 시청자가 발생했다. AWS CloudFront를 사용한 스트리밍 서비스들은 Origin Shield를 통해 Origin 서버 부하를 관리하고 Cache Hit Ratio 99% 이상을 유지했다. Edge Location에서 HLS 세그먼트(10초짜리 .ts 파일)를 캐시하면 동시 시청자가 많아도 Origin 부하는 캐시 만료 주기마다만 발생한다.

## Origin Access Control (OAC): S3 보안의 표준

S3 버킷에 CloudFront만 접근하도록 제한하는 것이 왜 중요한가? S3 버킷을 퍼블릭으로 열면 누구나 직접 접근할 수 있어 CloudFront의 WAF, 지역 제한, Signed URL 보호가 모두 우회된다. CloudFront를 통해서만 접근을 강제해야 모든 보안 계층이 의미 있다.

**OAI (Origin Access Identity) - 레거시**:
- CloudFront가 IAM-like 특수 신원(OAI)으로 S3에 접근
- S3 Bucket Policy: `Principal: { "CanonicalUser": "<OAI>" }`
- 한계: SigV4 서명 미지원, 특정 리전(ap-southeast-2 등)에서 SSE-KMS 버킷 불가

**OAC (Origin Access Control) - 현재 표준**:
- SigV4 서명 지원 (S3의 모든 요청에 서명)
- 모든 AWS 리전 지원 (신규 리전 포함)
- SSE-KMS 암호화 버킷 완전 지원
- 버킷 정책: `Principal: { "Service": "cloudfront.amazonaws.com" }` + `Condition: { "ArnLike": { "aws:SourceArn": "arn:aws:cloudfront::ACCOUNT:distribution/DIST_ID" } }`

> 🔍 **더 깊이**: OAC의 SigV4 지원이 중요한 이유. S3는 SSE-KMS 버킷에 대한 `GetObject` 요청을 KMS로 복호화할 때, 요청 헤더에 SigV4 서명이 있어야 한다. OAI는 SigV4를 지원하지 않아 KMS 버킷에 접근 시 `AccessDenied`가 발생한다. OAC는 CloudFront가 SigV4로 S3 요청에 서명하므로 SSE-KMS 버킷에 완전히 동작한다.

```
# OAC Bucket Policy 예시
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "cloudfront.amazonaws.com"},
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-bucket/*",
    "Condition": {
      "StringEquals": {
        "aws:SourceArn": "arn:aws:cloudfront::123456789012:distribution/EXXXXXXXX"
      }
    }
  }]
}
```

## Origin Failover: CloudFront 레벨 고가용성

CloudFront Origin Group은 Primary와 Secondary Origin을 묶어 자동 페일오버를 제공한다. Route 53 Failover와의 차이는 작동 계층이다.

| 항목 | CloudFront Origin Failover | Route 53 Failover |
|-----|-------------------------|-----------------|
| 작동 위치 | CDN 엣지 (HTTP 응답 코드 기반) | DNS 레이어 |
| 페일오버 트리거 | HTTP 4xx/5xx 응답 | Health Check 실패 |
| 페일오버 속도 | 요청 단위 즉시 | DNS TTL + Health Check 간격 |
| 캐싱 | Primary 응답은 캐시됨 | DNS 응답 캐시됨 |

Origin Failover의 실제 동작:
1. CloudFront가 Primary Origin(예: ap-northeast-2 ALB)에 요청
2. 5xx 또는 설정한 오류 코드 반환
3. 동일 요청을 자동으로 Secondary Origin(예: us-east-1 ALB)으로 재시도
4. 사용자는 지연 없이 Secondary 응답 받음

> ⚠️ **함정**: Origin Failover는 "요청 단위"다. CloudFront는 상태를 기억하지 않아서, 다음 요청에서 다시 Primary를 시도한다. Primary가 계속 실패하면 모든 요청이 Primary 시도 → 실패 → Secondary 전환의 2홉을 거친다. 이 지연이 문제가 되면 Route 53 Failover와 조합해 DNS 레벨에서 Primary를 완전히 비활성화해야 한다.

## Lambda@Edge vs CloudFront Functions: 엣지 컴퓨팅

CloudFront는 요청/응답 처리 흐름의 4개 지점에 코드를 실행할 수 있다.

```
사용자 ──── Viewer Request ──► CloudFront ──── Origin Request ──► Origin
           (1)                               (3)
사용자 ◄─── Viewer Response ── CloudFront ◄─── Origin Response ── Origin
           (2)                               (4)
```

**Lambda@Edge**: 4개 이벤트 모두 지원. Node.js·Python. Regional Edge Cache에서 실행.

**CloudFront Functions**: Viewer Request(1)와 Viewer Response(2)만 지원. JavaScript(경량). Edge Location에서 실행.

| 항목 | CloudFront Functions | Lambda@Edge |
|-----|---------------------|-------------|
| 실행 위치 | Edge Location (400+) | Regional Edge Cache (12) |
| 지원 이벤트 | Viewer Req/Res | 4개 모두 |
| 최대 실행 시간 | 1ms 미만 | Viewer: 5초, Origin: 30초 |
| 최대 메모리 | 2MB | 128MB~10GB |
| 네트워크 호출 | ❌ | ✅ |
| 비용 (100만 호출) | $0.10 | $0.60+ |
| 사용 케이스 | URL 재작성, 헤더 조작, 간단 인증 | A/B 테스트, 동적 렌더링, 외부 API 호출 |

> 💡 **관련 이론**: V8 Isolates (Cloudflare Workers, CloudFront Functions의 기반). 전통 서버리스(Lambda)는 VM 또는 컨테이너를 시작하는 "콜드 스타트"가 수백 ms 걸린다. CloudFront Functions는 Chromium의 V8 JavaScript 엔진에서 Isolate로 코드를 실행한다. Isolate는 같은 프로세스 내에서 메모리 공간만 격리하는 방식으로 시작 오버헤드가 1ms 미만이다. 네트워크 호출이 불가능한 이유는 Isolate 환경이 극도로 제한적이기 때문이다.

CloudFront Functions 사용 예시 (URL 재작성):

```javascript
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  
  // SPA 라우팅: /products/123 → /index.html
  if (uri.match(/^\/products\/\d+$/)) {
    request.uri = '/index.html';
  }
  
  // 보안 헤더 추가 (Viewer Response에서)
  // response.headers['strict-transport-security'] = {value: 'max-age=31536000'};
  
  return request;
}
```

Lambda@Edge 사용 예시 (A/B 테스트):

```javascript
// Origin Request 이벤트에서 쿠키 기반 A/B 분기
exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  const cookie = request.headers.cookie;
  
  if (cookie && cookie[0].value.includes('experiment=B')) {
    request.origin.custom.domainName = 'b-version-origin.example.com';
  }
  
  return request;
};
```

> 🔍 **더 깊이**: Lambda@Edge의 Region 제약. Lambda@Edge 함수는 반드시 **us-east-1 리전에서 배포**해야 한다. CloudFront가 전 세계 Regional Edge Cache에 함수를 복제한다. 이 제약은 Lambda@Edge 함수의 환경 변수를 사용하기 어렵게 만든다(함수 코드 내에 직접 값을 포함하거나, SSM Parameter Store를 us-east-1에서 읽는 패턴 필요). 2023년부터 Lambda@Edge Functions URL을 통한 일부 개선이 있었지만 근본적 제약은 동일하다.

## 콘텐츠 보호: Signed URL vs Signed Cookies

프리미엄 콘텐츠(유료 동영상, 개인화 문서)를 CloudFront로 보호할 때 두 가지 메커니즘이 있다.

**Signed URL**:
- URL 자체에 서명·만료시간·IP 제한이 포함
- 파일 하나에 하나의 Signed URL
- 사용처: 다운로드 링크, 공유 링크

**Signed Cookies**:
- 쿠키에 서명 정보 저장
- 한 번 쿠키 발급으로 여러 파일 접근 가능
- 사용처: 미디어 스트리밍 (HLS: 수백 개 .ts 세그먼트에 동일 쿠키 적용)

```
# Signed URL 구조 예
https://cdn.example.com/video.mp4
  ?Expires=1700000000
  &Signature=XXXXXXXX
  &Key-Pair-Id=KPXXXXXXXX

# Signed Cookie (3개 쿠키 세트)
CloudFront-Policy: base64(정책JSON)
CloudFront-Signature: RSA 서명
CloudFront-Key-Pair-Id: 키 ID
```

**Key Group**: 서명에 사용하는 RSA 키를 AWS CloudFront Key Pair 대신 Key Group으로 관리하는 신규 방식. AWS 계정 root 키 없이 IAM으로 관리 가능.

> ⚠️ **함정**: Signed URL/Cookie는 Origin이 S3인 경우 OAC 또는 OAI와 함께 써야 의미가 있다. CloudFront에서 Signed URL을 요구해도, S3 버킷이 퍼블릭이면 직접 S3 URL로 접근하면 우회된다. 반드시 S3 버킷을 비공개로 하고 OAC로 CloudFront만 접근하도록 해야 완전한 보호가 된다.

## Field-Level Encryption: 필드 단위 보호

HTTPS는 전송 중 데이터를 암호화하지만, CloudFront Edge → Origin 구간에서 복호화된다. 신용카드 번호, 주민번호 같은 민감 데이터가 잠시 CloudFront의 메모리에 평문으로 존재한다.

Field-Level Encryption(FLE)은 특정 폼 필드를 **CloudFront Edge에서 비대칭 키(RSA 공개키)로 추가 암호화**한다. Origin까지 암호화된 채로 전달되고, 오직 개인키를 가진 서비스(예: 결제 처리 서비스)만 복호화할 수 있다.

```
사용자 → HTTPS → CloudFront Edge
              │ FLE: card_number를 RSA 공개키로 암호화
              ↓
     Origin (ALB) → 암호화된 card_number 수신
              │ 결제 서비스만 개인키로 복호화
```

적용 대상: POST 요청의 특정 필드 최대 10개.
표준: RSA with OAEP (SHA-256).

> 💡 **관련 이론**: End-to-End Encryption(E2EE) vs Point-to-Point Encryption. HTTPS는 각 홉(클라이언트→CloudFront, CloudFront→Origin)에서 암호화-복호화가 일어나는 Point-to-Point다. FLE는 클라이언트에서 최종 복호화 서비스까지 중간에 누구도 볼 수 없는 E2EE다. PCI-DSS는 카드 데이터에 E2EE를 권장하며, FLE가 이 요건을 충족하는 AWS 표준 패턴이다.

## 지역 제한 (Geo Restriction)

CloudFront Distribution 레벨에서 특정 국가를 허용(Allowlist) 또는 차단(Blocklist)한다. 국가 판별은 CloudFront가 내부적으로 가지는 GeoIP 데이터베이스를 사용한다.

- **Allowlist**: 지정 국가만 접근 허용 (나머지 차단)
- **Blocklist**: 지정 국가만 차단 (나머지 허용)

Route 53 Geolocation과의 차이: Geolocation은 라우팅(어디로 보낼지), Geo Restriction은 차단(접근 허용/거부).

> 📚 **사례**: Netflix 지역별 콘텐츠 잠금 우회 문제 (2016). Netflix가 VPN 사용자를 차단하기 시작한 배경에는 콘텐츠 라이선스가 있다. 특정 영화가 미국에서는 Netflix에서 스트리밍 가능하지만, 한국에서는 다른 플랫폼이 독점 계약을 맺은 경우, CloudFront Geo Restriction으로 한국 IP를 차단해야 라이선스를 준수할 수 있다. VPN으로 IP를 우회하는 사용자를 완벽히 막는 것은 불가능하지만, Geo Restriction은 라이선스 준수 노력의 증거로 법적 의미가 있다.

## 실시간 로그와 표준 로그

**Standard Logs** (Access Logs): S3에 저장, 수 시간 지연. Athena로 쿼리.

**Real-time Logs**: Kinesis Data Streams로 즉시 스트리밍. 수 초 지연. 원하는 필드만 선택 가능.

```
CloudFront → Kinesis Data Streams → Kinesis Data Firehose → S3/Redshift
                                 → Lambda (실시간 처리)
                                 → OpenSearch (실시간 검색·대시보드)
```

실시간 로그 사용 케이스: DDoS 공격 패턴 즉시 감지, A/B 테스트 결과 실시간 모니터링, 비정상 User-Agent 차단.

## 캐싱 전략: Cache-Control과 Invalidation

CloudFront의 캐싱 동작은 Origin의 HTTP 헤더와 CloudFront 설정이 함께 결정한다.

**우선순위** (높을수록 우선):
1. CloudFront Behavior의 TTL 설정 (Maximum/Minimum/Default TTL)
2. Origin의 `Cache-Control: max-age=<seconds>`
3. Origin의 `Expires` 헤더

**Cache Invalidation**: 이미 캐시된 파일을 즉시 무효화한다. `/*` 패턴으로 전체 무효화 또는 특정 경로만. 처음 1,000개 패스 무료, 이후 경로당 $0.005.

**Cache Key 커스터마이징**: 기본적으로 URL만 Cache Key다. 특정 헤더·쿠키·쿼리스트링을 Cache Key에 추가하면 그 조합마다 별도 캐시 항목이 생긴다. Cache Hit Ratio와 개인화의 트레이드오프.

> 🔍 **더 깊이**: Cache Key에 헤더를 추가하면 Cache Hit Ratio가 떨어진다. 예: `Accept-Language`를 Cache Key에 추가하면 `en-US`, `ko-KR`, `fr-FR` 사용자가 각자 다른 캐시 항목을 사용해 Hit Ratio가 1/언어수로 줄어든다. 대신 언어별 다른 응답을 캐시할 수 있다. Origin에서 `Vary: Accept-Language`를 반환해도 같은 효과. 캐시 효율 vs 개인화 정도에 따라 트레이드오프를 결정해야 한다.

## CloudFront + WAF + Shield: 다층 보안

```
인터넷 트래픽
    │
    ▼
AWS Shield Advanced (L3/L4 DDoS 자동 완화)
    │
    ▼
AWS WAF (L7 웹 공격 차단)
    │ SQL Injection, XSS, Rate Limiting, IP Blacklist, Managed Rules
    ▼
CloudFront Distribution
    │ Geo Restriction, Signed URL, Cache
    ▼
Origin (S3, ALB, API Gateway)
```

WAF + CloudFront 조합의 이점: WAF는 CloudFront의 단일 진입점에서 전 세계 트래픽을 필터링한다. WAF를 각 ALB에 붙이는 것보다 효율적이고 일관성 있다.

> 💡 **관련 이론**: DDoS 완화 계층. Layer 3 (Network): IP Spoofing, ICMP flood → Shield가 처리. Layer 4 (Transport): SYN flood, UDP flood → Shield가 처리. Layer 7 (Application): HTTP flood, SQL Injection, CC 공격 → WAF가 처리. CloudFront는 BGP Anycast로 트래픽을 분산시켜 볼류메트릭 공격을 자연스럽게 흡수한다.

> 📚 **사례**: 2020년 GitHub DDoS 사건(1.35Tbps). Memcached 반사 증폭 공격으로 1.35Tbps 트래픽이 발생했다. GitHub는 Cloudflare(AWS와 유사한 CDN)의 Anycast 네트워크가 트래픽을 여러 PoP에 분산시켜 서비스를 유지했다. CloudFront + Shield Advanced의 조합이 유사한 공격을 방어하는 방식이다.

## 아키텍처 다이어그램: CloudFront 종합 패턴

```
사용자 ──► [Shield Advanced] ──► CloudFront Distribution
                                   │
                           ┌───────┴───────┐
                    WAF Rule Group    Geo Restriction
                    (SQL, XSS, Rate)  (차단 국가 목록)
                           │
                  ┌────────┴────────┐
         Behavior (정적)      Behavior (동적)
           /images/*           /api/*
              │                    │
         Origin Shield        (Origin Shield 없음)
              │                    │
       Origin Group A        Origin Group B
         │        │             │        │
       Primary  Secondary    Primary  Secondary
       (S3+OAC) (S3+OAC)    (ALB-1) (ALB-2)
                                │
                         Lambda@Edge
                         (Origin Request:
                          A/B 테스트)
```

## 📝 연습 문제

**문제 1.** CloudFront에서 S3 Private 버킷(SSE-KMS 암호화)의 콘텐츠를 서빙하려 한다. 현재 OAI를 쓰는데 KMS 버킷에서 AccessDenied가 발생한다. 어떻게 해결하는가?

A) S3 버킷 암호화를 SSE-S3로 변경
B) OAI 대신 OAC로 전환 (SigV4 지원)
C) CloudFront에 KMS 권한 IAM Role 연결
D) Lambda@Edge로 KMS 복호화 처리

**정답: B**
해설: OAI는 SigV4를 지원하지 않아 SSE-KMS 버킷에 접근 시 AccessDenied가 발생한다. OAC는 SigV4로 S3 요청에 서명하므로 KMS 버킷에 완전히 동작한다. OAC로 전환하고 S3 Bucket Policy에서 CloudFront Service Principal + SourceArn 조건을 설정한다.

---

**문제 2.** 글로벌 미디어 스트리밍 서비스가 Origin 서버 부하를 줄이고 싶다. 전 세계 400개 PoP의 Cache Miss가 모두 Origin으로 직접 오는 것이 문제다. 가장 효과적인 해결책은?

A) CloudFront TTL을 높인다
B) Origin Shield를 활성화한다
C) Lambda@Edge를 Origin Request에 추가한다
D) WAF로 과도한 요청을 차단한다

**정답: B**
해설: Origin Shield는 Regional Edge Cache와 Origin 사이에 추가 캐시 계층을 놓아 400개 PoP의 Cache Miss를 한 리전의 Origin Shield에서 흡수한다. Origin 부하를 최대 99% 감소시킨다. TTL 높이기는 캐시 효율을 높이지만 신선도 문제가 생길 수 있다.

---

**문제 3.** URL 재작성(SPA 라우팅)과 보안 헤더 추가를 CloudFront에서 처리해야 한다. 요청이 초당 수백만이라 비용이 중요하다. 가장 비용 효율적인 방법은?

A) Lambda@Edge (Origin Request)
B) CloudFront Functions (Viewer Request/Response)
C) ALB Lambda Target
D) API Gateway + Lambda

**정답: B**
해설: CloudFront Functions는 1ms 미만 실행 + 100만 호출당 $0.10으로 Lambda@Edge($0.60+)보다 6배 저렴하다. URL 재작성과 헤더 조작은 CloudFront Functions의 전형적인 사용 케이스. Lambda@Edge는 외부 API 호출이나 복잡한 로직이 필요할 때 쓴다.

---

**문제 4.** 유료 비디오 스트리밍 서비스가 HLS(HTTP Live Streaming)로 콘텐츠를 제공한다. 각 HLS 세그먼트(.ts 파일)는 수백 개이며, 구독 사용자에게만 접근을 허용하고 싶다. 가장 적합한 방법은?

A) 각 .ts 파일에 Signed URL 발급
B) Signed Cookies 발급 (로그인 시 1회)
C) CloudFront Functions로 인증 처리
D) S3 버킷 퍼블릭으로 열고 Lambda로 인증

**정답: B**
해설: HLS 스트리밍은 수백 개의 .ts 세그먼트 파일 요청이 발생한다. 각 파일에 Signed URL을 발급하는 것은 서버 부하와 복잡도가 매우 높다. Signed Cookies는 로그인 시 한 번 발급하면 쿠키가 모든 세그먼트 요청에 자동 포함되어 효율적이다.

---

**문제 5.** 결제 폼의 신용카드 번호 필드가 CloudFront를 통과할 때 추가 암호화가 필요하다. HTTPS만으로는 CloudFront 엣지에서 복호화되므로 End-to-End 보호가 안 된다고 보안팀이 요구했다. 어떤 기능을 사용하는가?

A) HTTPS Certificate Manager
B) Field-Level Encryption
C) WAF SQL Injection 규칙
D) S3 Server-Side Encryption

**정답: B**
해설: Field-Level Encryption은 CloudFront Edge에서 특정 폼 필드를 RSA 공개키로 추가 암호화해, Origin까지 암호화된 채로 전달한다. 오직 개인키를 가진 결제 서비스만 복호화 가능하여 End-to-End 보호를 제공한다. PCI-DSS 요건을 충족하는 AWS 표준 패턴이다.

---

**문제 6.** CloudFront에서 A/B 테스트를 구현하려 한다. 사용자의 쿠키 값에 따라 버전 A 또는 B의 Origin으로 분기해야 하고, 외부 실험 서비스 API를 호출해야 한다. 어떤 컴퓨팅 옵션이 적합한가?

A) CloudFront Functions (Viewer Request)
B) Lambda@Edge (Origin Request)
C) CloudFront Functions (Origin Request)
D) AWS Step Functions

**정답: B**
해설: 외부 API 호출은 CloudFront Functions에서 불가능(네트워크 호출 금지). Lambda@Edge는 Origin Request 이벤트에서 외부 API 호출이 가능하고, 쿠키 기반으로 Origin을 동적으로 변경할 수 있다. CloudFront Functions는 1ms 제한과 네트워크 호출 불가로 이 케이스에 부적합.

---

**문제 7.** 한 SaaS 회사가 us-east-1 ALB와 eu-west-1 ALB를 Origin으로 하는 CloudFront를 운영 중이다. us-east-1 ALB가 5xx 오류를 반환할 때 자동으로 eu-west-1으로 페일오버되어야 한다. 어떤 구성이 필요한가?

A) Route 53 Failover 라우팅만 사용
B) CloudFront Origin Group (Primary: us-east-1 ALB, Secondary: eu-west-1 ALB)
C) Lambda@Edge로 오류 감지 후 Origin 변경
D) CloudFront + Route 53 Health Check 조합

**정답: B**
해설: CloudFront Origin Group은 Primary Origin에서 5xx 응답 시 자동으로 Secondary Origin으로 재시도하는 Origin Failover 기능이다. HTTP 응답 코드 기반으로 즉각 전환되어 DNS TTL 지연 없이 동작한다.

---
