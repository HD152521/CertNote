# Day 3 - S3 보안: 버킷 정책, 암호화, 그리고 접근 제어의 계층 구조

AWS 보안 사고의 상당수는 S3에서 시작된다. 2017년부터 2022년까지 공개된 데이터 유출 사건의 약 35%가 잘못 설정된 S3 버킷과 관련이 있었다. Verizon, Twitch, Toyota, GoDaddy — 이름만 들어도 아는 기업들이 S3 설정 실수로 수천만 건의 개인정보를 노출했다. 이 day에서는 S3 보안 모델의 계층 구조를 이해하고, 암호화 방식의 기술적 차이를 파고들며, 실무에서 흔히 발생하는 함정을 짚는다.

## S3 접근 제어의 계층 구조 — 어떤 순서로 평가되는가

S3에 대한 요청은 다음 순서로 평가된다. 하나라도 Deny가 있으면 최종 거부다.

```
요청 도착
    ↓
① 계정 수준 Block Public Access → Deny면 즉시 거부
    ↓
② 버킷 수준 Block Public Access → Deny면 즉시 거부
    ↓
③ 명시적 Deny (버킷 정책, SCP, IAM 정책) → Deny면 즉시 거부
    ↓
④ IAM 정책 Allow + 버킷 정책 Allow → 허용
   또는 리소스 기반 정책만 있는 경우 → 허용
    ↓
⑤ ACL (Bucket Owner Enforced면 무시됨)
    ↓
기본 거부
```

이 구조에서 가장 강력한 것은 Block Public Access다. 버킷 정책에서 `"Principal": "*"` (퍼블릭)로 허용했더라도 Block Public Access가 활성화되어 있으면 퍼블릭 접근이 차단된다.

> 💡 **관련 이론**: S3의 정책 평가 로직은 AWS IAM의 일반적인 정책 평가 모델에 기반한다(명시적 Deny > 명시적 Allow > 암묵적 Deny). S3는 여기에 Block Public Access라는 추가 레이어를 더했다. 이 계층 구조는 컴퓨터 보안의 **Defense in Depth** 원칙과 일치한다 — 단일 실수로 전체 보안이 무너지지 않도록 여러 독립적인 보안 레이어를 겹친다.

## Block Public Access의 4가지 옵션

Block Public Access는 4개의 독립적인 설정으로 구성된다. 2023년부터 모든 신규 버킷에 기본적으로 4개 모두 활성화된다.

| 옵션 | 차단하는 것 |
|------|------------|
| BlockPublicAcls | 새 ACL에서 퍼블릭 허용 차단 |
| IgnorePublicAcls | 기존 ACL의 퍼블릭 허용 무시 |
| BlockPublicPolicy | 새 버킷 정책에서 퍼블릭 허용 차단 |
| RestrictPublicBuckets | 버킷 정책이 퍼블릭을 허용해도 익명/AWS 계정 외부 접근 차단 |

계정 수준에서도 설정할 수 있으며, 계정 수준 설정이 버킷 수준보다 우선한다. AWS Organizations의 SCP로 "절대 Block Public Access를 끄지 못하게" 강제할 수도 있다 — 대기업 보안팀이 선호하는 방식이다.

> 📚 **사례**: 2019년 Capital One 데이터 유출 사건에서 공격자는 WAF의 SSRF 취약점으로 EC2 메타데이터를 읽어 IAM 자격증명을 탈취한 후 S3 버킷의 데이터를 읽었다. 당시 버킷은 퍼블릭이 아니었지만, 탈취한 IAM 역할이 과도한 S3 읽기 권한을 가지고 있었다. 1억 600만 명의 카드 신청 데이터가 유출됐다. 이 사건은 Block Public Access만으로는 충분하지 않고, **최소 권한 원칙(Least Privilege)**과 IMDSv2 설정이 함께 필요함을 보여준다.

## 버킷 정책 — 리소스 기반 정책의 강력함

버킷 정책은 IAM 정책과 달리 **리소스에 붙는 정책**이다. IAM 사용자가 없는 다른 AWS 계정이나 공용 인터넷 사용자에게도 권한을 부여할 수 있다. 교차 계정 접근의 핵심 도구다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOrganizationReadOnly",
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["s3:GetObject", "s3:GetObjectVersion"],
      "Resource": "arn:aws:s3:::my-company-data/*",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalOrgID": "o-xxxxxxxxxxxx"
        }
      }
    },
    {
      "Sid": "DenyHTTP",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::my-company-data",
        "arn:aws:s3:::my-company-data/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
```

`aws:PrincipalOrgID` 조건은 특정 AWS Organization에 속한 계정만 접근을 허용하는 강력한 패턴이다. 조직 외부 IP나 계정은 `"Principal": "*"`이어도 이 조건에 의해 거부된다.

`aws:SecureTransport` 조건으로 HTTP를 거부하면 모든 S3 통신이 HTTPS를 강제한다. 이것은 전송 중 데이터 보호의 기본이다.

> ⚠️ **함정**: `aws:SecureTransport: false`에 Deny를 거는 것과 `aws:SecureTransport: true`에 Allow를 거는 것은 다르다. Deny를 거는 방식이 올바르다. Allow만 걸면 HTTP는 기본 거부로 빠지는 것이 아니라, 다른 Allow 규칙이 있을 때 함께 허용될 수 있다. HTTPS 강제는 반드시 `false` 조건에 Deny로 설정해야 한다.

## ACL — 레거시가 된 이유와 현재 권장 설정

ACL(Access Control List)은 S3의 초기 설계부터 존재했던 접근 제어 방식이다. 버킷과 객체 각각에 부여할 수 있으며, 다른 AWS 계정에게 특정 권한을 부여하는 간단한 방법이었다. 그러나 2021년 AWS는 Object Ownership 설정을 통해 ACL을 사실상 폐기하는 방향으로 전환했다.

현재 3가지 Object Ownership 옵션:
- **Bucket Owner Enforced(권장)**: ACL 완전 비활성화. IAM 및 버킷 정책만으로 제어. 2023년부터 신규 버킷 기본값.
- **Bucket Owner Preferred**: ACL 가능하지만 bucket-owner-full-control 헤더가 있는 PUT은 버킷 소유자 소유.
- **Object Writer(레거시)**: PUT한 주체가 객체 소유자. 교차 계정 업로드 시 소유권 분쟁 발생 가능.

> 🔍 **더 깊이**: ACL이 문제를 일으켰던 대표적 패턴은 교차 계정 업로드였다. 계정 A가 계정 B의 버킷에 객체를 업로드하면, Object Writer 모드에서는 계정 A가 그 객체의 소유자가 된다. 계정 B는 자신의 버킷에 있는 객체지만 삭제도, 태그 변경도 마음대로 할 수 없는 상황이 됐다. Bucket Owner Enforced로 설정하면 버킷 소유자가 항상 모든 객체의 소유자가 되어 이 문제가 해결된다.

## S3 암호화의 4가지 방식 — 키 관리 주체의 차이

S3 암호화를 이해하는 핵심은 **"누가 암호화 키를 관리하는가"** 다.

**SSE-S3(Server-Side Encryption with S3 Managed Keys)**:
AWS가 키를 완전 관리한다. 키 생성, 로테이션, 보관까지 모두 AWS의 책임이다. 헤더: `x-amz-server-side-encryption: AES256`. 추가 비용 없음. 2023년부터 모든 신규 객체의 기본값이다.

**SSE-KMS(Server-Side Encryption with KMS Keys)**:
AWS KMS에서 고객이 키를 관리한다. 헤더: `x-amz-server-side-encryption: aws:kms`. KMS의 키 정책으로 세밀한 접근 제어가 가능하고, 모든 키 사용이 CloudTrail에 로그된다. 단점은 암호화/복호화마다 KMS API를 호출한다는 것 — 초당 5,500~30,000 요청 한도가 있어 고성능 환경에서 병목이 된다.

**DSSE-KMS(Dual-layer SSE with KMS)**:
두 개의 독립적인 암호화 레이어를 적용한다. FIPS 140-3 Level 3 요건을 충족하는 국방·정부용 옵션이다.

**SSE-C(Server-Side Encryption with Customer Keys)**:
고객이 키를 제공하고 AWS가 암호화를 수행한다. AWS는 키를 저장하지 않는다. 매 요청마다 키를 헤더로 전달해야 한다. **HTTPS 필수** — HTTP로 키를 전송하면 키가 네트워크에 노출된다. 키는 SHA-256 해시로 검증되며 암호화 후 즉시 폐기된다.

**CSE(Client-Side Encryption)**:
클라이언트가 데이터를 암호화한 후 업로드한다. AWS는 암호화된 데이터만 보며 키에 접근할 수 없다. 가장 강력한 보안이지만 클라이언트 코드 복잡도가 높아진다.

| 방식 | 키 관리 | 감사 로그 | HTTPS 필수 | KMS 비용 | 추가 코드 |
|------|---------|----------|-----------|---------|---------|
| SSE-S3 | AWS 완전 관리 | ❌ | ❌ | ❌ | ❌ |
| SSE-KMS | KMS (고객 설정) | ✅ CloudTrail | ❌ | ✅ | ❌ |
| DSSE-KMS | KMS 이중 | ✅ CloudTrail | ❌ | ✅✅ | ❌ |
| SSE-C | 고객 제공 | ❌ | **✅ 필수** | ❌ | 키 관리 필요 |
| CSE | 고객 직접 | ❌ | 권장 | ❌ | 암호화 코드 |

> 💡 **관련 이론**: 현대 암호화 시스템의 설계 원칙 중 "키 분리(Key Separation)"는 암호화 키와 암호화된 데이터를 물리적으로 다른 시스템에 저장하는 것이다. SSE-KMS는 이 원칙을 구현한다 — 데이터는 S3에, 키는 KMS에 분리 저장되며 KMS가 독립적인 키 감사와 접근 제어를 제공한다. SSE-S3는 키와 데이터가 동일한 시스템(S3 서비스) 내에 있어 이 분리가 완전하지 않다.

## S3 Bucket Key — KMS 비용을 99% 절감하는 방법

SSE-KMS의 가장 큰 단점은 매 객체 암호화/복호화마다 KMS GenerateDataKey API를 호출한다는 것이다. 버킷에 초당 1만 개의 요청이 들어온다면 KMS에도 초당 1만 개의 API 호출이 발생한다. KMS API는 리전당 한도가 있어 throttling이 발생하고, 비용도 급증한다.

**S3 Bucket Key**는 이 문제를 해결한다. KMS에서 버킷 레벨의 키를 한 번 생성하고, 이 버킷 키를 사용해 개별 객체를 암호화한다. KMS 호출이 버킷당 1회로 줄어드는 것이다. AWS 발표에 따르면 Bucket Key 활성화 시 KMS 비용이 **최대 99% 절감**된다.

시험 시나리오: "SSE-KMS 사용 중 KMS API 한도를 초과해 S3 요청이 실패한다" → S3 Bucket Key 활성화 또는 KMS 서비스 할당량 증가 요청이 정답이다. Bucket Key가 비용도 절감하고 throttling도 해결하는 더 나은 해법이다.

> 🔍 **더 깊이**: S3 Bucket Key의 동작 원리는 암호화 계층 구조(Key Hierarchy)를 활용한다. KMS CMK(Customer Master Key)가 DEK(Data Encryption Key)를 생성하는데, 일반 SSE-KMS는 객체마다 새 DEK를 KMS에서 받는다. Bucket Key 모드에서는 CMK로 버킷 수준 키를 한 번 만들고, 이 버킷 키가 S3 인프라 내에서 개별 DEK를 생성한다. KMS는 버킷 키 생성/갱신 시에만 호출된다. 단, Bucket Key 활성화 후 객체의 ETag가 변경되므로 ETag를 무결성 검증에 사용하는 워크플로는 주의해야 한다.

## VPC Endpoint — S3에 인터넷 없이 접근하기

EC2 인스턴스나 Lambda 함수가 S3에 접근하는 방법은 두 가지다.

**인터넷 게이트웨이 경유**: VPC에서 인터넷으로 나갔다가 S3 퍼블릭 엔드포인트에 접근. NAT Gateway 비용 + 데이터 전송 비용 발생.

**VPC Endpoint 경유**: AWS 내부 네트워크로 S3에 접근. 인터넷에 나가지 않는다.

VPC Endpoint는 두 종류다.

| 유형 | 비용 | 주소 | 온프레미스 접근 | 교차 리전 |
|------|------|------|---------------|---------|
| Gateway Endpoint | 무료 | 라우팅 테이블에 추가 | ❌ | ❌ (같은 리전만) |
| Interface Endpoint (PrivateLink) | 시간당 요금 + 데이터 처리 요금 | ENI + 사설 IP | ✅ (Direct Connect/VPN) | ✅ |

시험 시나리오: "EC2에서 NAT Gateway 없이 S3에 접근" → Gateway Endpoint(무료). "온프레미스에서 Private IP로 S3에 접근" → Interface Endpoint.

## Cross-Account KMS 암호화의 숨은 함정

다른 계정에서 SSE-KMS로 암호화된 객체를 업로드하거나 다운로드할 때는 추가적인 권한 설정이 필요하다.

시나리오: 계정 A의 KMS 키로 암호화된 객체를 계정 B의 S3 버킷에 업로드하고, 계정 B의 사용자가 이를 다운로드하려 한다.

필요한 권한:
1. 계정 A의 KMS 키 정책에 계정 B의 역할/사용자를 Principal로 추가
2. 계정 B의 IAM 정책에 `kms:Decrypt` 권한 추가
3. CRR 복제 시: 대상 리전 KMS 키에 복제 역할의 `kms:Encrypt` 권한 추가

이 3가지를 모두 설정하지 않으면 "AccessDenied" 또는 "KMS key access denied" 에러가 발생한다. 시험에서 "교차 계정 KMS 암호화 문제" 시나리오가 나오면 이 두 레이어(버킷 정책 + KMS 키 정책)를 모두 확인해야 한다.

> ⚠️ **함정**: KMS 키 정책과 IAM 정책은 **모두** Allow가 있어야 한다. 키 정책에서만 허용하고 IAM 정책에서 허용이 없으면 접근이 거부된다(KMS는 두 정책의 교집합을 요구한다). 반대로 IAM 정책에서만 허용하고 키 정책에서 허용이 없어도 거부된다.

## S3 Access Point — 복잡한 버킷 정책의 단순화

하나의 S3 버킷을 여러 팀이 서로 다른 권한으로 접근할 때, 단일 버킷 정책으로 이를 관리하면 정책이 수천 줄로 복잡해진다. S3 Access Point는 버킷에 여러 개의 가상 입구를 만들어 팀별로 독립적인 접근 정책을 관리하게 해준다.

```
[버킷: company-data]
    ↑
    ├── [Access Point: finance-ap] → 재무팀만 접근 (finance/ prefix)
    ├── [Access Point: hr-ap] → HR팀만 접근 (hr/ prefix, VPC 전용)
    └── [Access Point: engineering-ap] → 엔지니어링팀 (engineering/ prefix)
```

각 Access Point는 자체 DNS 이름과 정책을 가진다. VPC 한정 Access Point를 만들면 해당 VPC 내에서만 접근 가능하며, 인터넷 접근이 원천 차단된다.

시험 시나리오: "한 버킷에 여러 팀이 각자 다른 권한으로 접근해야 한다" → S3 Access Points가 정답.

> 💡 **관련 이론**: Access Point 패턴은 소프트웨어 설계에서 **Facade Pattern**과 유사하다. 복잡한 내부 구조(버킷 정책, 수천 개의 객체)를 단순한 인터페이스(Access Point)로 감싸서 사용자에게 노출한다. 각 팀은 자신의 Access Point만 알면 되며, 버킷 전체 구조를 알 필요가 없다.

## CORS — 브라우저에서 직접 S3 접근 시 필요한 설정

웹 브라우저가 자바스크립트로 S3에 직접 요청을 보낼 때(예: Pre-signed URL로 파일 업로드), 브라우저의 Same-Origin Policy가 요청을 차단한다. S3 버킷에 CORS 설정을 추가해야 한다.

```json
[{
  "AllowedOrigins": ["https://myapp.example.com"],
  "AllowedMethods": ["GET", "PUT", "POST"],
  "AllowedHeaders": ["Content-Type", "x-amz-server-side-encryption"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3000
}]
```

시험 시나리오: "클라이언트 측 JavaScript로 S3에 직접 업로드 시 CORS 오류" → 버킷에 CORS 설정 추가.

오늘 살펴본 S3 보안 계층 — Block Public Access, 버킷 정책, ACL, 암호화 방식, Access Point — 은 모두 독립적이면서 서로 협력하는 방어 레이어다. 다음 day에서는 대용량 데이터를 S3에 빠르게 올리고 내리는 성능 최적화 기법들을 살펴본다.

## 📝 연습 문제

**문제 1.** 다음 중 S3에서 HTTPS만 허용하도록 버킷 정책을 설정하는 올바른 방법은?

A) `aws:SecureTransport: true`에 Allow 추가
B) `aws:SecureTransport: false`에 Deny 추가
C) 버킷의 SSL 설정을 활성화
D) Block Public Access에서 HTTP 차단 옵션 활성화

**정답: B**
해설: HTTPS를 강제하려면 HTTP 요청을 명시적으로 거부해야 한다. `"Condition": {"Bool": {"aws:SecureTransport": "false"}}`에 `"Effect": "Deny"`를 걸면 SecureTransport(HTTPS)가 false인 요청, 즉 HTTP 요청이 거부된다. A처럼 `true`에 Allow만 걸면 다른 Allow 정책과 결합해 HTTP가 허용될 수 있다. C의 "SSL 설정 활성화"라는 별도 버킷 옵션은 존재하지 않는다. Block Public Access는 HTTP/HTTPS와 무관하다.

---

**문제 2.** SSE-KMS 암호화를 사용하는 S3 버킷에서 초당 수천 건의 요청 시 KMS API 한도 오류가 발생한다. 가장 효과적인 해결책은?

A) SSE-S3로 암호화 방식 변경
B) 여러 리전에 버킷을 분산
C) S3 Bucket Key 활성화
D) KMS 서비스 할당량 증가 요청만 제출

**정답: C**
해설: S3 Bucket Key를 활성화하면 버킷 레벨의 키를 한 번 생성한 후 개별 객체 암호화에 재사용하므로 KMS API 호출이 극적으로 줄어든다(최대 99% 절감). SSE-S3로 변경하면(A) KMS 감사 로그와 세밀한 키 제어를 포기해야 한다. 리전 분산(B)은 KMS 한도를 해결하지 못한다. 할당량 증가 요청(D)만으로는 장기적으로 트래픽이 늘어날 때 다시 같은 문제가 발생한다. Bucket Key는 암호화 방식을 유지하면서 근본 원인을 해결한다.

---

**문제 3.** 다른 AWS 계정의 사용자가 SSE-KMS로 암호화된 S3 객체를 다운로드하려 할 때 AccessDenied 오류가 발생한다. 확인해야 할 설정은?

A) Block Public Access 설정만 확인
B) 버킷 정책에서 해당 계정 Allow 추가만 확인
C) KMS 키 정책에서 해당 계정 Principal Allow + 해당 계정 IAM 정책의 kms:Decrypt 권한 모두 확인
D) SSE-C로 암호화 방식 변경

**정답: C**
해설: SSE-KMS 암호화된 객체를 다른 계정에서 다운로드하려면 두 레이어의 권한이 모두 필요하다. ① KMS 키 정책에서 다른 계정의 사용자/역할을 Principal로 허용해야 한다 — 키 정책은 IAM 정책과 독립적으로 평가된다. ② 다른 계정의 IAM 정책에 `kms:Decrypt` 권한이 있어야 한다. 버킷 정책만 설정하고 KMS 키 정책을 빠뜨리는 것이 가장 흔한 실수다. 버킷에 대한 S3 접근 권한과 KMS 키에 대한 KMS 접근 권한을 모두 갖춰야 한다.

---

**문제 4.** 한 회사가 S3 버킷에 세 팀(재무, HR, 개발)이 각자 다른 prefix에 접근해야 하고, HR 팀은 반드시 VPC 내부에서만 접근해야 한다는 요건이 있다. 가장 적합한 솔루션은?

A) 팀별로 별도 S3 버킷 생성
B) 하나의 복잡한 버킷 정책으로 모든 조건을 처리
C) S3 Access Point를 팀별로 생성하고 HR Access Point에 VPC 제한 설정
D) IAM 정책만으로 관리

**정답: C**
해설: S3 Access Point는 팀별로 독립적인 접근 정책을 관리하는 데 최적화되어 있다. 각 팀별 Access Point에 해당 prefix에만 접근하는 정책을 붙이고, HR Access Point에는 VPC 제한(vpc-restriction)을 추가하면 된다. 팀별 별도 버킷(A)은 데이터를 분산시켜 관리가 복잡해진다. 단일 복잡한 버킷 정책(B)은 수천 줄이 될 수 있고 실수 위험이 높다. IAM 정책만으로는(D) VPC 기반 접근 제한 같은 리소스 레벨 조건을 표현하기 어렵다.

---

**문제 5.** SSE-C 암호화에 대한 올바른 설명은?

A) AWS가 고객의 키를 KMS에 안전하게 저장한다
B) 키는 요청 헤더로 전달되며 AWS는 키를 저장하지 않는다. HTTPS 필수.
C) HTTP로도 사용 가능하며 AWS가 키 로테이션을 관리한다
D) CloudTrail에 키 사용 내역이 자동으로 기록된다

**정답: B**
해설: SSE-C에서 고객은 매 요청 시 헤더(`x-amz-server-side-encryption-customer-key`)로 암호화 키를 제공한다. AWS는 암호화/복호화에 이 키를 사용한 직후 키를 폐기하며 저장하지 않는다. 따라서 키를 분실하면 데이터를 복구할 수 없다. HTTPS가 필수인 이유는 키가 HTTP 헤더로 전송될 때 네트워크에서 평문으로 노출되는 것을 막기 위해서다. AWS는 키 자체에 접근할 수 없으므로 CloudTrail에 키 사용 내역이 기록되지 않는다.

---

**문제 6.** S3 버킷에서 계정 수준 Block Public Access가 활성화된 상태에서, 버킷 정책에 `"Principal": "*"`으로 GetObject를 허용했다. 인터넷에서 해당 객체에 접근하면?

A) 버킷 정책이 우선하므로 접근 가능
B) 계정 수준 Block Public Access가 우선하므로 접근 거부
C) 가장 마지막에 적용된 정책이 우선함
D) 두 설정이 충돌하므로 오류 발생

**정답: B**
해설: 계정 수준 Block Public Access는 버킷 정책보다 우선한다. 버킷 정책에서 퍼블릭(`"Principal": "*"`)을 허용했더라도 계정 수준 또는 버킷 수준 Block Public Access가 활성화되어 있으면 퍼블릭 접근이 차단된다. 이것이 Block Public Access가 "최후의 보루"로 동작하는 이유다 — 실수로 버킷 정책을 퍼블릭으로 열어도 Block Public Access가 막아준다. 2023년부터 모든 신규 버킷에 Block Public Access 4개 설정이 모두 기본 활성화된다.

---

**문제 7.** 다음 중 S3 암호화에 대한 2023년 이후의 변경 사항으로 올바른 것은?

A) SSE-KMS가 모든 신규 객체의 기본 암호화 방식이다
B) SSE-S3(AES-256)가 모든 신규 객체의 기본 암호화 방식이다
C) 암호화는 여전히 선택 사항이며 기본적으로 비활성화되어 있다
D) CSE(클라이언트 사이드 암호화)가 기본값이다

**정답: B**
해설: 2023년부터 S3 신규 버킷의 모든 새 객체는 SSE-S3(AES-256)로 자동 암호화된다. 이전에는 암호화가 선택 사항이었지만 이제는 기본 동작이다. 암호화를 비활성화하는 옵션은 없다. 이미 암호화 없이 저장된 기존 객체는 영향을 받지 않으며, 더 강력한 암호화가 필요하다면 버킷 기본 암호화 설정에서 SSE-KMS로 변경할 수 있다. 시험에서 "S3 객체가 암호화되어 있나요?" 질문에는 2023년 이후 "예, 항상 SSE-S3 이상으로 암호화"가 정답이다.

---
