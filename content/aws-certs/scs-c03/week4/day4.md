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

### 접근 통제의 네 가지 도구를 먼저 구분하자

CloudFront에는 이름이 비슷해 헷갈리는 접근 통제가 넷 있다. 이들은 **서로 대체재가 아니라 서로 다른 질문에 답한다.** 이 구분이 4일차 문제의 절반을 차지한다.

| 도구 | 답하는 질문 | 통제하는 방향 | 대상 | 상태 |
|------|-------------|---------------|------|------|
| **OAI**(Origin Access Identity) | 오리진에 누가 접근하는가 | CloudFront → S3 | S3 오리진만 | 레거시(SigV2, SSE-KMS 제약) |
| **OAC**(Origin Access Control) | 오리진에 누가 접근하는가 | CloudFront → S3·Lambda URL·MediaStore 등 | 더 넓은 오리진 | **현행 권장**(SigV4, SSE-KMS 지원) |
| **서명 URL** | 이 사용자가 이 **객체 하나**를 볼 자격이 있는가 | 뷰어 → CloudFront | 단일 URL | 현행 |
| **서명 쿠키** | 이 사용자가 이 **경로 전체**를 볼 자격이 있는가 | 뷰어 → CloudFront | 경로 패턴(와일드카드) | 현행 |

**핵심은 방향이다.** OAC/OAI는 *뒷문을 잠그는* 통제이고(오리진 직접 접근 차단), 서명 URL/쿠키는 *앞문에서 표를 검사하는* 통제다(누가 콘텐츠를 받을 자격이 있는가). 둘 중 하나만 하면 반드시 구멍이 남는다.

- 서명 URL만 쓰고 OAC를 빠뜨리면 → 사용자가 S3 버킷 URL로 직접 받아 가면 그만이다.
- OAC만 쓰고 서명 URL을 빠뜨리면 → CloudFront URL을 아는 누구나 유료 콘텐츠를 받는다.

> 🎯 **시나리오**: "유료 회원만 볼 수 있는 동영상을 CloudFront로 서비스한다. 회원은 링크를 공유해도 다른 사람이 못 보게 하고, 동시에 누구도 S3 버킷에서 원본을 직접 내려받지 못하게 하라"가 나오면 정답은 **서명 URL(또는 쿠키) + OAC + Block Public Access**의 세 겹 조합이다. 하나만 고르는 보기는 모두 오답이며, "IP 제한 조건을 서명 정책에 넣는다"는 링크 공유 방지를 강화하는 보조 수단으로 함께 제시될 수 있다.

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

SSE-KMS 버킷을 오리진으로 쓸 때 함께 필요한 KMS 키 정책 문장은 이렇다. 여기서도 `AWS:SourceArn`으로 **특정 배포만** 한정하는 것이 요령이며, 이것이 confused deputy 방어의 실물이다.

```json
{
  "Sid": "AllowCloudFrontOACDecrypt",
  "Effect": "Allow",
  "Principal": { "Service": "cloudfront.amazonaws.com" },
  "Action": ["kms:Decrypt", "kms:DescribeKey"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "AWS:SourceArn": "arn:aws:cloudfront::111122223333:distribution/E123ABC"
    }
  }
}
```

> 💡 **관련 이론**: 여기서 두 번 반복된 `AWS:SourceArn` 조건이 바로 **혼동된 대리인(confused deputy) 문제**의 표준 해법이다. 문제의 구조는 이렇다 — 서비스 주체(`cloudfront.amazonaws.com`)에게 권한을 주면, 그 권한은 "CloudFront라는 서비스"에게 주어지는 것이지 "내 CloudFront 배포"에게 주어지는 것이 아니다. 조건이 없으면 **다른 계정의 누군가가 자기 배포를 만들어 내 버킷을 오리진으로 지정하는 것만으로** 내 데이터를 읽어 갈 수 있다. 서비스가 내 권한을 빌려 남의 요청을 대신 수행하는 것 — 그래서 "혼동된 대리인"이다. 해법은 언제나 같다: **서비스 주체에 권한을 줄 때는 반드시 `aws:SourceArn`이나 `aws:SourceAccount`로 호출 주체를 못 박는다.** 이 패턴은 S3·KMS뿐 아니라 SNS·SQS·Lambda·EventBridge의 리소스 정책 전반에서 동일하게 등장하므로, 한 번 이해해 두면 시험 전 영역에서 회수된다.

```bash
# OAC 생성 → 배포에 연결 → 버킷 정책 갱신, 세 단계가 모두 끝나야 동작한다
aws cloudfront create-origin-access-control \
  --origin-access-control-config '{
    "Name": "s3-oac-prod",
    "OriginAccessControlOriginType": "s3",
    "SigningBehavior": "always",
    "SigningProtocol": "sigv4"
  }'

# 배포 설정에서 오리진에 OAC가 붙었는지 확인 (붙지 않았으면 서명 자체를 안 한다)
aws cloudfront get-distribution-config --id E123ABC \
  --query 'DistributionConfig.Origins.Items[].{Domain:DomainName,OAC:OriginAccessControlId,OAI:S3OriginConfig.OriginAccessIdentity}'

# 버킷 쪽 가드레일 확인 — BPA가 켜져 있어야 정석
aws s3api get-public-access-block --bucket my-bucket
aws s3api get-bucket-policy --bucket my-bucket --query Policy --output text
```

> ⚠️ **함정**: OAI에서 OAC로 이전할 때 **기존 OAI를 버킷 정책에서 즉시 지우면 안 된다.** 배포 설정이 전 세계 엣지에 전파되는 동안 일부 엣지는 여전히 옛 방식으로 요청하기 때문이다. 올바른 순서는 (1) 버킷 정책에 OAC 허용문을 *추가*, (2) 배포에 OAC 연결·전파 완료 확인, (3) 그 다음에 OAI 허용문 제거다. 보안 강화 작업이 장애를 만드는 전형적 경로가 **"새 것을 켜기 전에 옛 것을 먼저 껐다"**이며, 이 순서 감각은 인증서 교체·키 회전 등 이 시험의 여러 주제에서 똑같이 요구된다.

## 서명 URL / 서명 쿠키: 콘텐츠 단위 접근 통제

유료 콘텐츠, 사용자별 다운로드, 한시적 링크처럼 "인증된 사용자에게만, 일정 시간만" 접근을 허용하려면 **서명 URL**(개별 객체)이나 **서명 쿠키**(여러 객체/경로)를 쓴다.

- **서명 URL**: 한 객체에 대한 시간 제한 접근. 예: 영화 한 편 다운로드 링크.
- **서명 쿠키**: 경로 패턴 하위 다수 객체 접근. 예: 구독자에게 `/premium/*` 전체 허용. URL을 바꾸고 싶지 않을 때.

서명 정책(policy)에 포함 가능한 제약:
- 만료 시각(`DateLessThan`) — 필수
- 시작 시각(`DateGreaterThan`)
- 소스 IP 대역(`IpAddress`) — 특정 IP에서만 유효

서명 주체는 **trusted key group**(권장, 공개키를 CloudFront에 등록하고 개인키로 서명) 또는 구형 trusted signer(루트 계정 CloudFront key pair)다. 신규는 key group을 쓴다.

커스텀 정책(custom policy)의 실물은 다음과 같다. 이 JSON을 개인키로 서명한 결과가 서명 URL의 `Policy`·`Signature` 파라미터, 또는 서명 쿠키의 `CloudFront-Policy`·`CloudFront-Signature` 값이 된다.

```json
{
  "Statement": [
    {
      "Resource": "https://d123abcdef.cloudfront.net/premium/*",
      "Condition": {
        "DateLessThan":    { "AWS:EpochTime": 1785000000 },
        "DateGreaterThan": { "AWS:EpochTime": 1784996400 },
        "IpAddress":       { "AWS:SourceIp": "203.0.113.0/24" }
      }
    }
  ]
}
```

세 조건이 각각 다른 위험을 덮는다. `DateLessThan`은 **링크의 수명**을 끊어 유출된 URL이 영원히 유효해지는 것을 막고(유일한 필수 조건), `DateGreaterThan`은 예약 공개(사전 발급 후 특정 시각부터 유효)를 만들며, `IpAddress`는 **링크 공유를 억제**한다. 다만 `IpAddress`는 모바일 네트워크에서 IP가 바뀌면 정상 사용자도 끊기고, 기업 NAT 뒤에서는 같은 IP를 수백 명이 공유하므로 통제 효과가 희석된다 — **좋은 통제일수록 사용 맥락을 따진 뒤에 켠다.**

```bash
# 1) 공개키 등록 (개인키는 서버가 보관하고 절대 배포하지 않는다)
aws cloudfront create-public-key \
  --public-key-config 'CallerReference=key-2026-07,Name=signing-key-2026-07,EncodedKey=file://public_key.pem'

# 2) 키 그룹으로 묶기 — 그룹에 키를 2개 두면 무중단 회전이 가능하다
aws cloudfront create-key-group \
  --key-group-config 'Name=premium-signers,Items=K1ABCDEF,K2GHIJKL'

# 3) 어떤 캐시 동작에 서명 검증을 요구할지 확인
aws cloudfront get-distribution-config --id E123ABC \
  --query 'DistributionConfig.CacheBehaviors.Items[].{Path:PathPattern,TrustedKeyGroups:TrustedKeyGroups.Items}'
```

> 🔍 **더 깊이**: 서명 키를 **그룹**으로 관리하는 설계에는 이유가 있다. 서명에 쓰는 개인키가 유출되면 그 키로 만든 모든 링크가 위조 가능해지므로 즉시 교체해야 하는데, 키가 하나뿐이면 교체하는 순간 이미 발급된 정상 링크가 전부 죽는다. 키 그룹에 신·구 키를 동시에 두면 **새 키로 서명을 시작하면서 기존 링크의 만료를 기다렸다가 옛 키를 제거**하는 무중단 회전이 가능하다. 이 "겹쳐 두고 갈아탄다"는 형태는 KMS 키 회전, 인증서 교체, API 키 로테이션에서 똑같이 반복되는 패턴이다. **회전 가능성은 설계 시점에 확보하는 것이지 사고 이후에 만드는 것이 아니다.**

> ⚠️ **함정**: 서명 URL/쿠키는 **캐시 키와 상호작용**한다. 서명 파라미터가 캐시 키에 포함되면 사용자마다 다른 URL이 되어 캐시 적중률이 무너지고, 오리진 부하가 폭증한다. CloudFront는 서명 파라미터를 캐시 키에서 제외하도록 처리하지만, 커스텀 쿼리 문자열 전달 정책을 잘못 설정하면 같은 문제가 재현된다. 또한 **서명 쿠키는 쿠키를 오리진까지 전달하도록 설정하면 역시 캐시 분할이 일어난다** — 접근 통제는 엣지에서 끝내고 오리진에는 전달하지 않는 것이 기본이다.

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

## 엣지에서의 TLS 종단: 인증서를 어디에 붙이고 어디서 끊는가

> 인증서의 *수명주기 관리*(발급 방식, DNS·Email 검증, 자동 갱신 조건, Private CA, 갱신 실패 모니터링)는 **week6 day4**에서 별도로 다룬다. 오늘 다루는 것은 그 인증서를 **엣지에 어떻게 배치하고 TLS를 어느 구간에서 끊을 것인가**라는 아키텍처 결정이다.

엣지 보안에서 ACM과 관련해 결정적인 것은 **리전 규칙**과 **종단 지점** 두 가지다.

- **CloudFront용 인증서는 반드시 us-east-1(N. Virginia)에 있어야 한다.** 글로벌 엣지 서비스이기 때문이다. 다른 리전에 발급하면 CloudFront 선택 목록에 아예 나타나지 않는다.
- **ALB/API Gateway(리전 리소스)용 인증서는 해당 리전**에 있어야 한다. 즉 CloudFront + ALB 구성에서는 **인증서가 두 장 필요**하다 — 뷰어용(us-east-1)과 오리진용(서비스 리전).

```bash
# 엣지용: 반드시 us-east-1
aws acm request-certificate \
  --domain-name cdn.example.com \
  --validation-method DNS \
  --region us-east-1

# 오리진 ALB용: 서비스 리전
aws acm request-certificate \
  --domain-name origin.example.com \
  --validation-method DNS \
  --region ap-northeast-2
```

ACM 발급 인증서의 **개인키는 추출 불가**다. ACM이 통합 서비스(CloudFront, ALB, API Gateway)에 안전하게 배포하며 사용자가 개인키를 만질 수 없다 — 키 유출 위험을 구조적으로 제거한다. EC2에 직접 설치할 인증서가 필요하면 ACM 퍼블릭 인증서로는 불가능하고 다른 경로를 써야 한다(자세한 갈림길은 week6 day4).

> 💡 **관련 이론**: "개인키를 노출하지 않는다"는 ACM 설계는 *key custody(키 보관 책임)* 최소화 원칙이다. 개인키가 사용자 손에 닿지 않으면 유출·오용 경로가 사라진다. 이는 HSM·KMS와 같은 사상 — "비밀을 직접 다루지 말고 서비스가 대신 사용하게 하라". 자동 갱신과 결합하면 인증서 만료로 인한 장애(흔한 운영 사고)도 구조적으로 줄인다.

### 두 구간, 두 개의 프로토콜 정책

CloudFront가 관여하는 TLS 구간은 둘이고, 각각 별도의 설정으로 통제된다. 이 둘을 하나로 착각하면 "HTTPS를 쓰고 있는데 왜 평문 구간이 있다고 하지?"라는 혼란이 생긴다.

```
[ 엣지 구성의 두 TLS 구간 ]

  뷰어 ──①──→ [CloudFront 엣지] ──②──→ [ALB/오리진] ──③──→ [EC2]

  ① Viewer Protocol Policy        : 뷰어 ↔ CloudFront
      - allow-all           (평문 허용)          ← 쓰지 않는다
      - redirect-to-https   (평문 요청을 301/302로 유도)  ← 일반적
      - https-only          (평문은 403으로 거부)         ← 가장 강함
    + Security Policy(Minimum Protocol Version)로 TLS 버전·cipher 하한 설정
    + 인증서: ACM @ us-east-1

  ② Origin Protocol Policy        : CloudFront ↔ 오리진
      - http-only           (오리진까지 평문)     ← 규제 환경에서 문제
      - https-only          (재암호화)            ← 전 구간 암호화의 핵심
      - match-viewer        (뷰어가 쓴 것을 따라감) ← 의도치 않은 평문 위험
    + 인증서: 오리진 쪽의 리전 인증서(공개 신뢰 필요)

  ③ 오리진 내부 구간              : ALB ↔ 백엔드
      - 대상 그룹 프로토콜을 HTTPS로 두면 여기도 암호화
      - "전 구간 암호화(end-to-end encryption)" 요구는 ①②③ 모두를 뜻한다
```

> ⚠️ **함정**: `match-viewer`는 편해 보이지만 위험한 선택이다. 뷰어가 HTTP로 접속하면 **CloudFront도 오리진에 HTTP로 요청**하므로, 오리진 구간이 조용히 평문이 된다. `redirect-to-https`와 `match-viewer`를 함께 쓰면 리다이렉트 이전의 첫 요청에서 이런 일이 벌어질 수 있다. 규제가 "전송 중 암호화"를 요구하는 환경에서는 **뷰어는 `https-only` 또는 `redirect-to-https`, 오리진은 `https-only`로 명시적으로 고정**하는 것이 정석이다.

> 🎯 **시나리오**: "감사에서 '전 구간 암호화'가 요구되었다. 현재 CloudFront는 HTTPS를 쓰지만 오리진 ALB로는 HTTP로 전달하고 있다"가 나오면, 정답은 **Origin Protocol Policy를 `https-only`로 바꾸고 오리진에 해당 리전의 ACM 인증서를 붙이는 것**이며, ALB에서 백엔드까지도 요구되면 대상 그룹 프로토콜을 HTTPS로 올린다. "CloudFront에서 HTTPS를 쓰고 있으니 이미 충족한다"는 보기는 ② 구간을 놓친 오답이고, "NLB로 TLS 패스스루한다"는 보기는 WAF·경로 라우팅을 잃으므로 이 맥락에서 대개 적절하지 않다.

### 대체 도메인 이름(CNAME)과 도메인 프론팅

CloudFront 배포에 자체 도메인(`cdn.example.com`)을 붙이려면 **대체 도메인 이름(Alternate Domain Name, CNAME)**을 등록하고 그 이름을 포함한 인증서를 연결해야 한다. 여기서 두 가지 보안 함의가 나온다.

첫째, **한 도메인 이름은 하나의 배포에만 등록될 수 있다.** 그래서 조직이 소유한 도메인을 다른 계정이 자기 배포에 몰래 등록해 가로채는 일은 원칙적으로 불가능하다. 다만 **사용하지 않게 된 CloudFront 배포를 지웠는데 DNS 레코드를 남겨 두면**, 그 DNS 이름이 아무 배포도 가리키지 않는 상태가 되어 **서브도메인 탈취(subdomain takeover)** 위험이 생긴다. 리소스를 지울 때 DNS를 함께 정리하는 것은 위생이 아니라 보안 조치다.

둘째, 뷰어 요청의 **SNI(TLS 핸드셰이크의 도메인)와 Host 헤더가 다를 수 있다**는 성질이 있다. 이를 악용해 검열·필터를 우회하는 기법이 **도메인 프론팅(domain fronting)** — 겉으로는 허용된 도메인으로 접속하는 것처럼 보이지만 실제로는 다른 목적지로 요청이 전달된다.

> 📚 **사례**: 도메인 프론팅은 한때 검열 우회 도구로 쓰였지만, 동시에 공격자가 **C2(명령·제어) 통신을 평판 좋은 CDN 도메인 뒤에 숨기는 수단**으로도 널리 악용됐다. 2018년 봄, 주요 CDN·클라우드 사업자들이 잇따라 이 동작을 차단하면서 SNI와 Host 헤더가 불일치하는 요청은 더 이상 통과하지 않게 됐다. 이 사건에서 얻을 교훈은 두 가지다. 첫째, **평판 기반 통제(도메인 허용 목록)는 그 도메인 뒤에 무엇이 있는지 보지 못한다** — 3일차의 SNI 기반 필터링이 갖는 근본 한계와 정확히 같은 지점이다. 둘째, 그래서 아웃바운드 통제는 도메인 목록 하나에 기대지 않고 **DNS 계층 통제·연결 계층 통제·행위 기반 탐지를 겹쳐** 두어야 한다. 어떤 단일 식별자(도메인, IP, UA)도 신뢰의 근거가 되기에는 약하다는 것이 이 주 전체를 관통하는 교훈이다.

## TLS 정책과 보안 헤더

CloudFront의 **Security Policy(Minimum Protocol Version)**로 약한 TLS(1.0/1.1)·약한 cipher를 거부하고 TLSv1.2_2021 이상을 강제한다. **Response Headers Policy**로 다음을 주입한다:
- `Strict-Transport-Security`(HSTS): HTTPS 강제, 다운그레이드 방지
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options` / `Content-Security-Policy`: 클릭재킹·XSS 완화
- `Referrer-Policy`, `Permissions-Policy`

이 헤더들을 CloudFront에서 주입하면 오리진 코드를 건드리지 않고 일관되게 적용된다.

```bash
aws cloudfront create-response-headers-policy \
  --response-headers-policy-config '{
    "Name": "secure-baseline",
    "SecurityHeadersConfig": {
      "StrictTransportSecurity": {
        "Override": true,
        "AccessControlMaxAgeSec": 31536000,
        "IncludeSubdomains": true,
        "Preload": true
      },
      "ContentTypeOptions": { "Override": true },
      "FrameOptions": { "Override": true, "FrameOption": "DENY" },
      "ReferrerPolicy": { "Override": true, "ReferrerPolicy": "strict-origin-when-cross-origin" },
      "ContentSecurityPolicy": {
        "Override": true,
        "ContentSecurityPolicy": "default-src '\''self'\''; object-src '\''none'\''; frame-ancestors '\''none'\''"
      }
    }
  }'

# 뷰어 구간의 TLS 하한과 프로토콜 정책을 함께 감사한다
aws cloudfront get-distribution-config --id E123ABC \
  --query 'DistributionConfig.{
    MinTLS:ViewerCertificate.MinimumProtocolVersion,
    SNI:ViewerCertificate.SSLSupportMethod,
    Viewer:DefaultCacheBehavior.ViewerProtocolPolicy,
    WebACL:WebACLId,
    Geo:Restrictions.GeoRestriction.RestrictionType
  }'
```

> ⚠️ **함정**: `Strict-Transport-Security`의 `preload`는 **되돌리기가 매우 어렵다.** 브라우저 preload 목록에 등재되면 그 도메인은 모든 하위 도메인까지 HTTPS 전용으로 강제되고, 목록에서 빠지기까지 오랜 시간이 걸린다. 내부 도구나 레거시 시스템이 아직 HTTP로 서비스되는 하위 도메인을 갖고 있다면 `includeSubDomains`와 `preload`가 그것들을 한꺼번에 죽인다. **보안 헤더는 강할수록 좋은 것이 아니라, 되돌릴 수 있는 것부터 순서대로 켜는 것**이 옳다 — max-age를 짧게 시작해 점진적으로 늘리는 것이 표준 절차다.

> 🔍 **더 깊이**: 보안 헤더를 CloudFront에서 주입하는 결정에는 숨은 트레이드오프가 있다. 장점은 명확하다 — 오리진이 여러 개(S3, ALB, Lambda URL)여도 헤더가 한 곳에서 일관되게 적용되고, 애플리케이션 팀이 각자 구현할 필요가 없다. 단점은 **정책이 애플리케이션과 분리되어 표류**한다는 것이다. 특히 CSP는 애플리케이션이 어떤 스크립트·스타일을 쓰는지에 강하게 의존하는데, 그 지식은 엣지가 아니라 애플리케이션에 있다. 그래서 실무의 절충은 **HSTS·nosniff·frame-options처럼 애플리케이션과 무관한 헤더는 엣지에서 강제하고, CSP처럼 애플리케이션 종속적인 헤더는 애플리케이션이 내보내되 엣지는 덮어쓰지 않는(`Override: false`) 형태**다. 통제를 어디에 두는가는 "어디에 지식이 있는가"를 따라가야 한다.

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

### 경계가 새는 다섯 가지 경로

경계 아키텍처를 검토할 때는 "무엇을 켰는가"가 아니라 **"어디로 빠져나갈 수 있는가"**를 먼저 센다. 실제 감사에서 반복해서 발견되는 누수 경로는 다음 다섯이다.

| 누수 경로 | 어떻게 생기나 | 막는 방법 |
|-----------|---------------|-----------|
| 오리진 직접 접근 | ALB/EC2가 인터넷에 열려 있음 | CloudFront prefix list SG + `X-Origin-Verify` 헤더 검증 |
| S3 직접 접근 | 버킷이 공개이거나 정책이 느슨함 | OAC + `AWS:SourceArn` + Block Public Access |
| 옛 DNS 레코드 | 이전 오리진 이름이 DNS·CT 로그에 남음 | 미사용 레코드 정리, 오리진 이름을 엣지 이전 후 교체 |
| 다른 CloudFront 배포 | 서비스 주체만 허용해 타 계정 배포가 접근 | 리소스 정책에 `AWS:SourceArn` 필수 |
| 대체 진입점 | API Gateway·Lambda URL·NLB 등 별도 공개 엔드포인트 | 모든 공개 엔드포인트를 목록화하고 동일 통제 적용 |

마지막 행이 특히 중요하다. 잘 만든 CloudFront 경계를 갖춘 조직에서도, 팀 하나가 급하게 만든 Lambda 함수 URL이나 별도 ALB가 통제 밖에 존재하는 경우가 흔하다. **경계는 가장 약한 진입점의 수준으로 결정된다.** 그래서 경계 설계의 마지막 작업은 언제나 "우리 계정에 인터넷에서 도달 가능한 엔드포인트가 몇 개인가"를 세는 일이며, 이 질문에 답하는 도구가 5주차에서 다룰 탐지·자산 가시성 서비스들이다.

```bash
# 경계 점검용 훑기 — 인터넷에 면한 것들을 세어 본다
aws elbv2 describe-load-balancers \
  --query 'LoadBalancers[?Scheme==`internet-facing`].{Name:LoadBalancerName,DNS:DNSName,Type:Type}'

aws cloudfront list-distributions \
  --query 'DistributionList.Items[].{Id:Id,Aliases:Aliases.Items,WebACL:WebACLId,Enabled:Enabled}'

aws lambda list-function-url-configs --function-name my-func \
  --query 'FunctionUrlConfigs[].{Url:FunctionUrl,Auth:AuthType}'
```

`lambda list-function-url-configs`에서 `AuthType`이 `NONE`인 항목은 **인증 없이 인터넷에 열린 엔드포인트**다. 경계 감사에서 가장 먼저 확인해야 할 값이며, 필요하다면 함수 URL 앞에도 CloudFront + OAC를 세워 같은 경계 안으로 끌어들일 수 있다.

## 정리하며

오늘의 주제를 한 문장으로 줄이면 **"모든 진입을 하나의 문으로 모으고, 그 문에 모든 통제를 건다"**이다. CloudFront는 CDN이기 이전에 그 문이며, 여기에 TLS 종단·WAF·Shield·접근 통제·보안 헤더·지역 제한이 한꺼번에 붙는다.

이 설계를 성립시키는 조건은 두 가지뿐이다. **첫째, 문이 실제로 유일한가.** 오리진이 직접 열려 있거나, 옛 DNS가 살아 있거나, 다른 팀의 엔드포인트가 통제 밖에 있으면 문은 장식이 된다. OAC·prefix list·비밀 헤더·BPA는 모두 이 한 가지 목적을 위한 서로 다른 자물쇠다. **둘째, 문에서 무엇을 검사하는가.** 오리진 잠금이 "뒷문 차단"이라면 서명 URL·쿠키는 "앞문의 표 검사"이고, 이 둘은 서로를 대체하지 않는다.

TLS와 관련해서는 **구간을 나눠 보는 습관**이 답을 만든다. 뷰어 구간과 오리진 구간은 별도의 정책과 별도의 인증서를 갖고, "전 구간 암호화"라는 요구는 두 구간 모두를 뜻한다. CloudFront용 인증서는 us-east-1, 리전 리소스용은 해당 리전 — 이 한 줄이 시험에서 매번 한 문제 값을 한다. 인증서를 *어떻게 발급하고 갱신할 것인가*는 week6 day4의 몫이고, 오늘은 *어디에 붙이고 어디서 끊을 것인가*가 주제였다.

마지막으로, 이번 주 나흘이 하나의 문장으로 합쳐진다. **WAF는 요청의 의미를 읽고(1일), Shield는 규모를 흡수하며(2일), Network/DNS Firewall은 내부에서 나가는 길을 통제하고(3일), CloudFront와 오리진 잠금은 이 모든 통제가 우회되지 않도록 경계를 한 줄로 정렬한다(4일).** 어느 하나가 빠지면 나머지가 지키는 범위도 함께 줄어든다는 것이 엣지·경계 방어의 본질이다.

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
