# Day 3 - S3 접근 통제 심화: 버킷 정책·ACL·Access Points, 암호화 강제, 데이터 유출 방지

어제(day2)는 S3 데이터를 *어떻게 암호화·보존*하는지 다뤘다. 오늘은 *누가 접근하는가*를 결정하는 인가 계층을 깊게 파고든다. S3의 접근 통제는 여러 메커니즘이 겹쳐 평가되며, 시험은 "여러 정책이 동시에 존재할 때 최종 결과가 무엇인가"를 끊임없이 묻는다. 핵심은 *명시적 Deny가 항상 이긴다*는 IAM 평가 모델과, *암호화·전송보안·네트워크 경로를 정책 조건으로 강제*하는 패턴이다.

## S3 접근 통제 메커니즘의 지형도

S3 객체 하나에 접근하려는 요청은 다음 메커니즘들의 결합으로 평가된다:

- **IAM 자격증명 정책**: 호출 주체(역할/사용자)에 붙은 정책
- **버킷 정책(리소스 기반)**: 버킷에 붙는 정책. 교차계정·익명 접근의 핵심
- **객체/버킷 ACL**: 레거시 메커니즘. 이제 비권장
- **S3 Access Points**: 버킷에 대한 명명된 접근 진입점, 각자 고유 정책
- **VPC 엔드포인트 정책**: 네트워크 경로 수준의 통제
- **Block Public Access**: 공개 설정 무력화 가드레일

```
요청 → [최종 인가 = (모든 적용 정책의 Allow 합집합) - (어떤 정책의 Deny)]
        명시적 Deny가 하나라도 있으면 → 거부 (다른 Allow 무시)
        교차계정이면 → 양쪽(소유자·요청자) 정책 모두 Allow 필요
```

> 💡 **관련 이론**: S3 인가는 IAM의 *default-deny + explicit-deny-wins* 모델을 따른다. 모든 요청은 기본 거부에서 출발하고, 적용 가능한 정책 중 하나라도 Allow하면 허용 후보가 되지만, 단 하나의 명시적 Deny가 모든 Allow를 뒤엎는다. 이 비대칭성(Deny 우선)이 가드레일 설계의 토대다 — "절대 일어나면 안 되는 것"을 Deny로 못 박으면 하위의 어떤 Allow도 그것을 뚫지 못한다. 암호화 강제·전송보안 강제가 모두 이 Deny 패턴으로 구현된다.

## ACL은 왜 비권장인가

S3 ACL은 객체/버킷 소유권 시대의 레거시 통제다. 문제는 객체 단위로 흩어져 *중앙 가시성이 없고*, "AllUsers"/"AuthenticatedUsers" 그룹 부여로 의도치 않은 공개를 만들기 쉽다는 점이다. AWS는 **S3 Object Ownership을 "Bucket owner enforced"**로 설정해 **ACL을 완전히 비활성화**하고 버킷 정책으로만 통제하길 권장한다. 이 설정에서는 모든 객체를 버킷 소유자가 소유하고, ACL 기반 권한은 무시된다.

```bash
aws s3api put-bucket-ownership-controls \
  --bucket my-secure-bucket \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
```

> ⚠️ **함정**: 교차계정으로 객체를 업로드받는 버킷에서 "업로더 계정이 객체를 소유해 버킷 소유자가 읽지 못하는" 고전적 문제가 BucketOwnerEnforced로 해결된다. 예전에는 `bucket-owner-full-control` ACL을 강제했지만, 이제는 Object Ownership 설정이 정답이다.

## 암호화 강제: 비암호화 업로드를 막기

버킷 기본 암호화가 켜져 있어도, 시험은 "정책으로 특정 암호화를 *강제*"하는 패턴을 묻는다. 버킷 정책에 조건부 Deny를 넣어 원하는 암호화 헤더가 없는 PutObject를 거부한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnencryptedUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::my-secure-bucket/*",
      "Condition": {
        "StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" }
      }
    },
    {
      "Sid": "DenyWrongKMSKey",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::my-secure-bucket/*",
      "Condition": {
        "StringNotEqualsIfExists": {
          "s3:x-amz-server-side-encryption-aws-kms-key-id": "arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234"
        }
      }
    }
  ]
}
```

> 🎯 **시나리오**: "모든 객체가 반드시 특정 CMK로만 암호화되도록 강제하라"가 나오면, 두 개의 Deny를 조합한다 — (1) SSE-KMS가 아니면 거부, (2) 지정한 KMS 키 ID가 아니면 거부. `StringNotEqualsIfExists`를 쓰면 헤더가 아예 없는 경우와 다른 키인 경우를 함께 처리한다. 버킷 기본 암호화만으로는 "다른 키 사용"을 막지 못한다.

## 전송 중 암호화 강제(HTTPS 강제)

평문 HTTP 요청을 막으려면 `aws:SecureTransport` 조건으로 비-TLS 요청을 Deny한다.

```json
{
  "Sid": "DenyInsecureTransport",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": [
    "arn:aws:s3:::my-secure-bucket",
    "arn:aws:s3:::my-secure-bucket/*"
  ],
  "Condition": { "Bool": { "aws:SecureTransport": "false" } }
}
```

> ⚠️ **함정**: Resource에 버킷 ARN(`:::bucket`)과 객체 ARN(`:::bucket/*`) **둘 다** 넣어야 한다. 버킷 수준 작업(ListBucket)과 객체 수준 작업(GetObject)이 다른 ARN을 평가하기 때문이다. 하나만 넣으면 일부 작업이 강제에서 빠진다.

## S3 Access Points: 접근을 분할 통치

대규모 공유 버킷(데이터 레이크 등)은 단일 버킷 정책이 비대해지고 관리가 어렵다. **S3 Access Point**는 버킷에 대한 명명된 접근 진입점으로, 각자 고유한 정책과 네트워크 출처(VPC 전용/인터넷)를 가진다. 애플리케이션마다 별도 Access Point를 주면, 거대한 단일 정책 대신 *작고 명확한 정책들*로 분리할 수 있다.

```bash
aws s3control create-access-point \
  --account-id 111122223333 \
  --name finance-ap \
  --bucket data-lake \
  --vpc-configuration VpcId=vpc-0abc123 \
  --public-access-block-configuration 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'
```

`--vpc-configuration`을 주면 그 Access Point는 **해당 VPC 내부에서만** 접근 가능하다 — 인터넷 경유 접근이 원천 차단된다. **Multi-Region Access Point**는 여러 리전 버킷에 단일 글로벌 엔드포인트로 접근하며 자동 라우팅·페일오버를 제공한다.

> 💡 **관련 이론**: Access Point는 *능력 분리(capability segregation)*의 응용이다. 하나의 자원(버킷)에 여러 진입점을 두고 각 진입점에 최소 권한을 부여하면, 한 애플리케이션의 권한 오남용이 다른 진입점으로 번지지 않는다. 이것은 객체지향의 인터페이스 분리 원칙(ISP)과 닮았다 — 클라이언트는 자신이 쓰는 능력만 보이는 좁은 인터페이스로 자원에 접근한다.

## 데이터 유출 방지: VPC 엔드포인트 조건

S3 데이터 유출(exfiltration)의 한 시나리오는, 탈취된 자격증명으로 회사 데이터를 *공용 인터넷 경유로* 외부 계정 버킷에 복사하거나, 회사 네트워크 밖에서 읽어가는 것이다. 이를 막는 핵심 조건 키는 다음과 같다:

- `aws:SourceVpce`: 특정 VPC 엔드포인트를 경유한 요청만 허용
- `aws:SourceVpc`: 특정 VPC 출처만 허용
- `aws:SourceIp`: 특정 IP 대역만 허용
- `s3:DataAccessPointAccount`: 특정 계정의 Access Point 경유만 허용

버킷 정책으로 "지정한 VPC 엔드포인트가 아니면 거부"를 강제한다:

```json
{
  "Sid": "RestrictToVPCE",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": [
    "arn:aws:s3:::corp-sensitive",
    "arn:aws:s3:::corp-sensitive/*"
  ],
  "Condition": {
    "StringNotEquals": { "aws:SourceVpce": "vpce-0a1b2c3d4e" }
  }
}
```

이 정책은 지정 VPC 엔드포인트를 통하지 않은 모든 접근(인터넷 경유, 다른 VPC, 다른 계정)을 거부한다. 데이터가 회사가 통제하는 네트워크 경계 안에서만 흐르도록 못 박는다.

> 🎯 **시나리오**: "회사 데이터가 회사 VPC 외부로 절대 빠져나가지 못하게 하라"가 나오면, S3 게이트웨이 VPC 엔드포인트를 만들고 버킷 정책에 `aws:SourceVpce` 조건 Deny를 건다. 동시에 VPC 엔드포인트 정책에는 "회사 버킷만 접근 허용"을 걸어 *양방향*으로 봉쇄한다 — 버킷 정책은 "내 버킷은 이 VPCe로만", 엔드포인트 정책은 "이 VPCe는 회사 버킷으로만". 이 두 조합이 데이터 유출 방지의 표준이다.

> 🔍 **더 깊이**: AWS는 이 패턴을 조직 전체로 확장하기 위해 **VPC 엔드포인트 정책에 `aws:PrincipalOrgID`나 `aws:ResourceOrgID` 조건**을 쓴다. 예컨대 "이 VPC 엔드포인트를 통한 S3 접근은 우리 Organization에 속한 버킷으로만 가능"이라고 강제하면, 직원이 회사 네트워크에서 외부의 개인 버킷으로 데이터를 빼돌리는 것을 막는다. 이것이 *데이터 경계(data perimeter)*의 핵심 구현이며, 신뢰할 수 있는 신원·신뢰할 수 있는 자원·신뢰할 수 있는 네트워크의 세 조건을 조합해 구축한다.

## S3 Access Analyzer로 노출 점검

IAM Access Analyzer는 버킷 정책·ACL·Access Point를 분석해 "외부(계정 밖/공개)에서 접근 가능한 버킷"을 자동 탐지한다. 설정 실수로 인한 노출을 사후가 아니라 사전·상시로 잡아낸다. "어떤 S3 버킷이 외부에 노출되었는지 지속적으로 확인"이 요구되면 Access Analyzer가 정답이다.

---

## 📝 연습 문제

**문제 1.** 한 버킷에 IAM 정책은 GetObject를 Allow하지만 버킷 정책에 동일 객체에 대한 명시적 Deny가 있다. 최종 결과는?

A) IAM Allow가 우선하므로 접근 허용  
B) 명시적 Deny가 모든 Allow를 뒤엎으므로 접근 거부  
C) 두 정책이 충돌해 평가 오류  
D) 더 최근에 만들어진 정책이 우선  

**정답: B**  
해설: IAM 평가 모델에서 명시적 Deny는 어떤 Allow보다 항상 우선한다. IAM 정책의 Allow가 있어도 버킷 정책에 명시적 Deny가 있으면 요청은 거부된다. 정책 충돌은 오류가 아니라 Deny 우선 규칙으로 결정론적으로 해결되며, 생성 시점은 평가에 영향을 주지 않는다.

---

**문제 2.** 모든 PutObject가 반드시 특정 CMK로만 암호화되도록 강제하려 한다. 버킷 기본 암호화만으로 충분한가, 아니면 무엇이 필요한가?

A) 버킷 기본 암호화만으로 충분하다  
B) 버킷 정책에 SSE-KMS가 아니면 Deny, 그리고 지정 KMS 키 ID가 아니면 Deny하는 두 조건을 추가한다  
C) ACL을 BucketOwnerEnforced로 설정한다  
D) Block Public Access를 켠다  

**정답: B**  
해설: 버킷 기본 암호화는 헤더 없이 올린 객체에 기본값을 적용할 뿐, 클라이언트가 *다른 키*를 명시해 올리는 것을 막지 못한다. 특정 CMK 강제는 `s3:x-amz-server-side-encryption`과 `s3:x-amz-server-side-encryption-aws-kms-key-id` 조건으로 두 개의 Deny를 걸어야 완성된다. ACL 비활성화와 BPA는 암호화 강제와 무관하다.

---

**문제 3.** 회사 데이터가 담긴 버킷에 대해, 지정된 VPC 엔드포인트를 경유하지 않은 모든 접근(인터넷·타 VPC·타 계정)을 차단하려 한다. 올바른 조건 키는?

A) `aws:SecureTransport`  
B) `s3:x-amz-server-side-encryption`  
C) `aws:SourceVpce`를 StringNotEquals로 Deny  
D) `s3:max-keys`  

**정답: C**  
해설: `aws:SourceVpce` 조건으로 "지정한 VPC 엔드포인트가 아니면 Deny"를 걸면, 그 엔드포인트를 경유하지 않은 모든 경로(인터넷, 다른 VPC, 다른 계정)의 접근이 차단되어 데이터 유출을 막는다. `aws:SecureTransport`는 HTTPS 강제, 암호화 헤더 조건은 저장 암호화 강제, `s3:max-keys`는 페이지네이션 제어로 네트워크 경로 통제와 무관하다.

---

**문제 4.** 교차계정 업로드를 받는 버킷에서, 업로더 계정이 객체를 소유해 버킷 소유자가 객체를 읽지 못한다. 가장 권장되는 해결책은?

A) 업로더에게 매번 `bucket-owner-full-control` ACL을 요청한다  
B) Object Ownership을 BucketOwnerEnforced로 설정해 ACL을 비활성화하고 모든 객체를 버킷 소유자 소유로 만든다  
C) 버킷을 공개로 전환한다  
D) 버전 관리를 켠다  

**정답: B**  
해설: Object Ownership을 BucketOwnerEnforced로 설정하면 ACL이 완전히 비활성화되고 모든 객체를 버킷 소유자가 소유하므로 교차계정 소유권 문제가 근본적으로 사라진다. ACL 강제 방식은 레거시이고 누락 위험이 있으며, 공개 전환은 심각한 보안 위반, 버전 관리는 소유권과 무관하다.

---

**문제 5.** 거대한 공유 데이터 레이크 버킷에서 애플리케이션마다 접근 정책이 달라 단일 버킷 정책이 비대해지고 관리가 어렵다. 가장 적절한 접근은?

A) 모든 권한을 버킷 정책에 계속 누적한다  
B) 애플리케이션별 S3 Access Point를 만들어 각자 고유 정책과 VPC 제한을 부여한다  
C) 버킷을 애플리케이션 수만큼 복제한다  
D) 객체 ACL로 애플리케이션별 권한을 부여한다  

**정답: B**  
해설: S3 Access Point는 하나의 버킷에 여러 명명된 진입점을 두고 각자 작고 명확한 정책과 네트워크 출처(VPC 전용 등)를 부여해, 비대한 단일 정책을 분할 통치한다. 버킷 정책 누적은 관리성과 가독성을 악화시키고, 버킷 복제는 데이터 중복·비용·정합성 문제를 낳으며, ACL은 레거시로 중앙 가시성이 없다.

---
