# Day 4 - 엣지 보안 통합: CloudFront(OAC, 서명 URL), ACM 인증서, 경계 보안 아키텍처

지금까지의 WAF, Shield, Network Firewall는 각자 한 계층을 방어했다. 오늘은 이들을 *엣지에서 하나의 경계(perimeter)*로 묶는다. CloudFront는 단순 CDN이 아니라 보안 관점에서 "가장 앞에 선 방어선이자 정책 집행점"이다. 여기서 TLS 종료(ACM), 오리진 보호(OAC), 콘텐츠 접근 통제(서명 URL/쿠키), WAF·Shield 통합이 한데 모인다. 보안 시험은 "이 통제들을 어떻게 결합해 공격 표면을 최소화하는가"를 묻는다.

## CloudFront: 보안 통제의 집결지

CloudFront 배포 하나에 다음이 결합된다:
- **TLS 종료**: 뷰어↔CloudFront 구간을 HTTPS로 강제(`Viewer Protocol Policy: redirect-to-https`), 인증서는 ACM.
- **WAF Web ACL**: 엣지에서 L7 위협 차단(Day 1).
- **Shield**: L3/L4 흡수, Advanced 시 L7 통합(Day 2).
- **OAC(Origin Access Control)**: S3/오리진을 CloudFront만 접근하도록 잠금.
- **서명 URL/서명 쿠키**: 콘텐츠 단위 접근 통제.
- **응답 헤더 정책**: HSTS, X-Content-Type-Options 등 보안 헤더 주입.
- **지리적 제한(Geo Restriction)**: 국가 단위 허용/차단.

> 💡 **관련 이론**: 이는 *security perimeter(보안 경계)*를 네트워크 가장자리로 밀어내는 설계다. 전통적 경계는 데이터센터 입구였지만, 클라우드·CDN 시대의 경계는 글로벌 엣지다. 악성 요청을 오리진에 도달하기 전 엣지에서 거르면 오리진의 부하·공격 표면이 줄고, 동시에 정책(인증서, 헤더, 접근 통제)을 한 곳에서 일관되게 집행한다. "경계를 사용자에게 가깝게"가 핵심이다.

## OAC vs OAI: 오리진 잠그기

S3 오리진을 공개 버킷으로 두면 누구나 버킷 URL로 직접 접근해 CloudFront(및 WAF/서명 URL)를 우회한다. 이를 막는 메커니즘이 **Origin Access Control(OAC)** — CloudFront만 S3에 접근하도록 버킷 정책으로 제한한다.

- **OAI(Origin Access Identity)**: 구형 메커니즘. SigV2 기반, SSE-KMS·동적 요청 일부 제한.
- **OAC(Origin Access Control)**: 현행 권장. SigV4 서명, SSE-KMS 지원, 모든 리전·동적 요청 지원, 더 세밀한 제어. 신규 구성은 OAC를 쓴다.

```json
// S3 버킷 정책: 특정 CloudFront 배포만 허용
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontOAC",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-bucket/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::111122223333:distribution/E123ABC"
      }
    }
  }]
}
```

`AWS:SourceArn`으로 *특정 배포만* 허용하는 것이 중요하다. Service principal만 허용하면 다른 계정의 CloudFront도 접근 가능해질 수 있다(confused deputy 방지). 버킷의 **Block Public Access는 켜둔 채** OAC로만 접근하게 하는 것이 정석이다.

> ⚠️ **함정**: OAC를 설정해도 S3 버킷 정책을 갱신하지 않으면 403이 난다. OAC는 CloudFront가 SigV4로 *서명해 요청*하게 만들 뿐, *허용*은 버킷 정책이 한다. 또한 SSE-KMS 암호화 객체라면 KMS 키 정책에 CloudFront service principal의 `kms:Decrypt`를 허용해야 한다 — 이를 누락하면 접근이 실패한다.

## 서명 URL / 서명 쿠키: 콘텐츠 단위 접근 통제

유료 콘텐츠, 사용자별 다운로드, 한시적 링크처럼 "인증된 사용자에게만, 일정 시간만" 접근을 허용하려면 **서명 URL**(개별 객체)이나 **서명 쿠키**(여러 객체/경로)를 쓴다.

- **서명 URL**: 한 객체에 대한 시간 제한 접근. 예: 영화 한 편 다운로드 링크.
- **서명 쿠키**: 경로 패턴 하위 다수 객체 접근. 예: 구독자에게 `/premium/*` 전체 허용. URL을 바꾸고 싶지 않을 때.

서명 정책(policy)에 포함 가능한 제약:
- 만료 시각(`DateLessThan`) — 필수
- 시작 시각(`DateGreaterThan`)
- 소스 IP 대역(`IpAddress`) — 특정 IP에서만 유효

서명 주체는 **trusted key group**(권장, 공개키를 CloudFront에 등록하고 개인키로 서명) 또는 구형 trusted signer(루트 계정 CloudFront key pair)다. 신규는 key group을 쓴다.

```python
# 서명 URL 생성(개념 코드, rsa private key로 정책 서명)
from datetime import datetime, timedelta
from botocore.signers import CloudFrontSigner

def rsa_signer(message):  # 개인키로 서명
    return private_key.sign(message, padding.PKCS1v15(), hashes.SHA1())

signer = CloudFrontSigner(KEY_PAIR_ID, rsa_signer)
url = signer.generate_presigned_url(
    "https://d123.cloudfront.net/premium/movie.mp4",
    date_less_than=datetime.utcnow() + timedelta(minutes=10)
)
```

> 🎯 **시나리오**: "구독자만 `/premium/` 하위 수백 개 동영상에 1시간 동안 접근, 객체마다 URL을 새로 만들기는 번거롭다"는 시험 빈출. 정답은 **서명 쿠키**(경로 패턴 와일드카드 정책). 객체 하나에 한정된 단발 링크면 서명 URL. 둘의 선택 기준(단일 객체 vs 다수/경로)을 묻는다.

> 🔍 **더 깊이**: 서명 URL과 S3 presigned URL을 혼동하면 안 된다. S3 presigned URL은 S3가 직접 서명·검증하며 CloudFront·WAF·엣지 캐싱을 우회한다. CloudFront 서명 URL은 엣지에서 검증되어 WAF·Shield·캐싱·OAC 보호를 모두 거친다. 보안·성능 통제를 엣지에 모으고 싶다면 CloudFront 서명 URL + OAC 잠금이 정답이며, S3 직접 presigned URL은 그 통제들을 건너뛴다.

## ACM: 인증서의 출처와 제약

**AWS Certificate Manager(ACM)**는 TLS 인증서를 무료로 발급·자동 갱신한다. 엣지 보안에서 두 가지 리전 규칙이 결정적이다:

- **CloudFront용 인증서는 반드시 us-east-1(N. Virginia)에 있어야 한다**. 글로벌 엣지 서비스이기 때문이다. 다른 리전에 발급하면 CloudFront에 붙지 않는다.
- **ALB/API Gateway(리전 리소스)용 인증서는 해당 리전**에 있어야 한다.

검증 방식:
- **DNS 검증(권장)**: Route 53 등에 CNAME 추가. ACM이 자동 갱신을 위해 도메인 소유를 지속 확인할 수 있어 *완전 자동 갱신*이 가능.
- **Email 검증**: 도메인 관리자 이메일로 승인. 자동 갱신이 더 취약(수동 개입 가능성).

```bash
aws acm request-certificate \
  --domain-name example.com \
  --subject-alternative-names "*.example.com" \
  --validation-method DNS \
  --region us-east-1   # CloudFront용은 반드시 us-east-1
```

ACM 발급 인증서의 **개인키는 추출 불가**다. ACM이 통합 서비스(CloudFront, ALB, API Gateway)에 안전하게 배포하며 사용자가 개인키를 만질 수 없다 — 키 유출 위험을 구조적으로 제거한다. EC2에 직접 설치할 인증서가 필요하면 ACM 대신 (Private CA 또는) 외부 인증서를 IAM/Secrets에 올려야 한다.

> 💡 **관련 이론**: "개인키를 노출하지 않는다"는 ACM 설계는 *key custody(키 보관 책임)* 최소화 원칙이다. 개인키가 사용자 손에 닿지 않으면 유출·오용 경로가 사라진다. 이는 HSM·KMS와 같은 사상 — "비밀을 직접 다루지 말고 서비스가 대신 사용하게 하라". 자동 갱신과 결합하면 인증서 만료로 인한 장애(흔한 운영 사고)도 구조적으로 줄인다.

## TLS 정책과 보안 헤더

CloudFront의 **Security Policy(Minimum Protocol Version)**로 약한 TLS(1.0/1.1)·약한 cipher를 거부하고 TLSv1.2_2021 이상을 강제한다. **Response Headers Policy**로 다음을 주입한다:
- `Strict-Transport-Security`(HSTS): HTTPS 강제, 다운그레이드 방지
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options` / `Content-Security-Policy`: 클릭재킹·XSS 완화
- `Referrer-Policy`, `Permissions-Policy`

이 헤더들을 CloudFront에서 주입하면 오리진 코드를 건드리지 않고 일관되게 적용된다.

## 경계 보안 아키텍처: 통합 그림

```
[사용자]
   │ HTTPS (TLSv1.2+, ACM 인증서 @us-east-1)
   ▼
[Route 53] ── DNS, Shield 보호
   │
   ▼
[CloudFront 엣지]
   ├─ WAF Web ACL (CLOUDFRONT scope): SQLi/XSS/rate-based
   ├─ Shield (Std 자동 / Adv 등록)
   ├─ Geo Restriction
   ├─ 서명 URL/쿠키: 콘텐츠 접근 통제
   ├─ Response Headers Policy: HSTS/CSP
   └─ OAC: 오리진 잠금
   │  (오리진 SG = CloudFront prefix list, X-Origin-Verify 헤더)
   ▼
[S3 (Block Public Access ON) / ALB → 오리진]
```

설계 원칙 요약:
1. **모든 진입을 엣지로 강제**하고 오리진 직접 접근을 차단(OAC, prefix list, 비밀 헤더).
2. **TLS를 엣지에서 종료·강제**하고 인증서는 ACM 자동 갱신.
3. **L7 위협은 WAF, L3/4는 Shield**로 엣지에서 처리.
4. **콘텐츠 접근은 서명 URL/쿠키**로 세분.
5. **보안 헤더·TLS 정책**을 엣지에서 일관 주입.

> ⚠️ **함정**: WAF를 ALB에 붙였는데 사용자가 CloudFront를 우회해 ALB에 직접 접근하면 일부 통제가 무력화될 수 있다. 경계가 "엣지"라면 WAF는 *CloudFront(CLOUDFRONT scope)*에 붙이고, 오리진 ALB는 CloudFront prefix list로 직접 접근을 막아 경계를 한 줄로 정렬해야 한다. 통제 지점이 분산되면 우회 경로가 생긴다.

---

## 📝 연습 문제

**문제 1.** S3를 오리진으로 하는 CloudFront 배포에서 사용자가 S3 버킷 URL로 직접 접근해 CloudFront(및 WAF)를 우회한다. 가장 적절한 대응은?

A) S3 버킷을 공개로 두고 ACL만 조정  
B) OAC를 구성하고 S3 버킷 정책에서 해당 CloudFront 배포(SourceArn)만 허용, Block Public Access는 켜둔다  
C) S3 presigned URL로 전환  
D) NACL로 S3 트래픽 차단  

**정답: B**  
해설: Origin Access Control(OAC)은 CloudFront가 SigV4로 서명해 S3에 요청하게 하고, 버킷 정책에서 `AWS:SourceArn`으로 특정 배포만 허용하면 다른 경로의 직접 접근이 차단된다. Block Public Access를 켜둔 채 OAC로만 접근하게 하는 것이 정석이다. 공개 버킷·NACL은 우회를 못 막고, presigned URL은 오히려 엣지 통제를 건너뛴다.

---

**문제 2.** 구독자에게 `/premium/` 하위 수백 개 객체를 1시간 동안 접근 허용하되, 객체마다 별도 링크를 만들고 싶지 않다. 가장 적절한 방법은?

A) CloudFront 서명 URL을 객체마다 생성  
B) CloudFront 서명 쿠키(경로 패턴 와일드카드 정책)  
C) S3 버킷을 공개로 전환  
D) OAI 적용  

**정답: B**  
해설: 서명 쿠키는 경로 패턴(`/premium/*`) 하위 다수 객체에 대한 시간 제한 접근을 단일 쿠키로 부여하므로 객체마다 URL을 만들 필요가 없다. 서명 URL은 단일 객체용이라 수백 개를 따로 만들어야 한다. 공개 전환은 통제를 없애고, OAI는 오리진 잠금 메커니즘이지 사용자 접근 통제가 아니다.

---

**문제 3.** CloudFront 배포에 ACM 인증서를 연결하려는데 발급한 인증서가 목록에 나타나지 않는다. 가장 가능성 높은 원인은?

A) 인증서가 us-east-1이 아닌 다른 리전에 발급되어 CloudFront에 붙지 않는다  
B) DNS 검증을 사용했기 때문  
C) 와일드카드 도메인이라서  
D) 인증서가 무료라서  

**정답: A**  
해설: CloudFront는 글로벌 엣지 서비스라서 연결할 ACM 인증서가 반드시 us-east-1(N. Virginia)에 있어야 한다. 다른 리전 인증서는 CloudFront 선택 목록에 나타나지 않는다. DNS 검증은 오히려 자동 갱신에 유리하고, 와일드카드·무료 여부는 연결 가능성과 무관하다.

---

**문제 4.** ACM이 발급한 인증서의 보안상 핵심 특성으로 옳은 것은?

A) 개인키를 다운로드해 EC2에 수동 설치할 수 있다  
B) 개인키를 추출할 수 없고 ACM이 통합 서비스(CloudFront/ALB/API Gateway)에 안전하게 배포·자동 갱신하므로 키 유출 경로가 제거된다  
C) 인증서가 1회용이라 매번 재발급해야 한다  
D) HTTP에서만 사용 가능하다  

**정답: B**  
해설: ACM 발급 인증서는 개인키가 사용자에게 노출되지 않으며, ACM이 지원 통합 서비스에 직접 배포하고 자동 갱신한다. 키를 직접 다루지 않으므로 유출·오용 경로가 구조적으로 사라지고, 자동 갱신으로 만료 장애도 줄인다. 그래서 EC2 직접 설치(개인키 필요)에는 ACM 발급 키를 쓸 수 없다는 점이 A를 틀리게 만든다.

---

**문제 5.** 엣지 경계를 한 줄로 정렬해 우회를 막으려 한다. WAF를 어디에 붙이고 오리진을 어떻게 보호해야 하는가?

A) WAF를 ALB에만 붙이고 ALB를 공개로 둔다  
B) WAF를 CloudFront(CLOUDFRONT scope)에 붙이고, 오리진 ALB는 CloudFront managed prefix list로 직접 접근을 차단하며 CloudFront 비밀 헤더를 검증한다  
C) WAF를 끄고 Security Group만 사용  
D) WAF를 CloudFront와 ALB 둘 다에 붙이되 오리진은 공개  

**정답: B**  
해설: 경계가 엣지라면 WAF를 CloudFront(CLOUDFRONT scope)에 붙여 모든 진입을 엣지에서 평가하고, 오리진 ALB는 CloudFront prefix list로 직접 접근을 차단하고 CloudFront가 주입한 비밀 헤더(X-Origin-Verify)를 검증해 엣지 우회를 막는다. ALB만 보호하거나 오리진을 공개로 두면 우회 경로가 남고, WAF를 끄면 L7 방어가 사라진다.

---
