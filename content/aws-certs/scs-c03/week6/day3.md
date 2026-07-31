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

### 실제 평가 순서: 어디서 막혔는지 알아내려면

`AccessDenied` 하나를 보고 원인을 짚으려면 평가가 어떤 순서로 이뤄지는지 알아야 한다. 요청 하나는 다음 관문을 차례로 통과한다.

```
S3 요청
  │
  ├─(1) Organizations SCP        ← 계정 전체의 권한 상한. Deny면 여기서 끝
  ├─(2) VPC 엔드포인트 정책       ← 이 경로로 이 리소스에 갈 수 있나
  ├─(3) 리소스 기반 정책(버킷/AP)  ← 이 리소스가 이 주체를 받아 주나
  ├─(4) 권한 경계(permissions boundary)
  ├─(5) 세션 정책(AssumeRole 시 전달한 인라인 정책)
  ├─(6) 자격증명 기반 정책(IAM)
  └─(7) Block Public Access       ← 익명·공개 판정이면 여기서 무력화
        ↓
    최종 허용
```

시험이 노리는 지점은 두 가지다. 첫째, **어느 한 곳의 명시적 Deny면 나머지를 다 보지 않고 거부**된다. 둘째, **교차계정 요청은 양쪽 계정 모두에서 Allow가 필요**하다 — 리소스 소유 계정의 버킷 정책과 요청자 계정의 IAM 정책이 모두 허용해야 한다. 반면 같은 계정 안에서는 버킷 정책이나 IAM 정책 중 **하나만** 허용해도 통과한다. 이 비대칭이 "같은 정책인데 계정 안에서는 되고 밖에서는 안 되는" 증상의 정체다.

| 증상 | 가장 먼저 의심할 곳 |
|------|--------------------|
| 같은 계정 안에서도 거부 | 명시적 Deny(버킷 정책·SCP) 또는 KMS 키 정책 |
| 다른 계정에서만 거부 | 버킷 정책에 상대 계정 Allow 누락 |
| 특정 네트워크에서만 거부 | `aws:SourceVpce` / `aws:SourceIp` 조건 |
| 익명 요청만 거부 | Block Public Access |
| 오류가 KMS를 가리킴 | 키 정책 또는 `kms:ViaService` 조건 |
| SCP가 있는 조직에서 전체 거부 | SCP의 Deny 또는 허용 목록에서 누락 |

## ACL은 왜 비권장인가

S3 ACL은 객체/버킷 소유권 시대의 레거시 통제다. 문제는 객체 단위로 흩어져 *중앙 가시성이 없고*, "AllUsers"/"AuthenticatedUsers" 그룹 부여로 의도치 않은 공개를 만들기 쉽다는 점이다. AWS는 **S3 Object Ownership을 "Bucket owner enforced"**로 설정해 **ACL을 완전히 비활성화**하고 버킷 정책으로만 통제하길 권장한다. 이 설정에서는 모든 객체를 버킷 소유자가 소유하고, ACL 기반 권한은 무시된다.

```bash
aws s3api put-bucket-ownership-controls \
  --bucket my-secure-bucket \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
```

> ⚠️ **함정**: 교차계정으로 객체를 업로드받는 버킷에서 "업로더 계정이 객체를 소유해 버킷 소유자가 읽지 못하는" 고전적 문제가 BucketOwnerEnforced로 해결된다. 예전에는 `bucket-owner-full-control` ACL을 강제했지만, 이제는 Object Ownership 설정이 정답이다.

### 네 가지 통제 메커니즘 비교

| 항목 | IAM 정책 | 버킷 정책 | ACL(레거시) | Access Point |
|------|----------|-----------|-------------|--------------|
| 붙는 대상 | 주체(역할·사용자) | 버킷 | 버킷/객체 개별 | 버킷에 대한 명명된 진입점 |
| 익명·교차계정 허용 | 불가 | 가능 | 가능(그래서 위험) | 가능(정책으로) |
| 조건 키 사용 | 가능 | 가능 | **불가** | 가능 |
| 크기 한도 | 정책별 한도 | **20KB** | 부여 항목 수 제한 | AP마다 별도 정책 |
| 중앙 가시성 | 있음 | 있음 | **없음**(객체마다 흩어짐) | 있음 |
| 네트워크 출처 제한 | 조건 키로 | 조건 키로 | 불가 | **AP 자체를 VPC 전용으로** |
| 현재 권장 | 기본 | 기본 | **비활성화 권장** | 대규모 공유 버킷 |

> ⚠️ **함정**: 버킷 정책의 **20KB 한도**는 시험에도 실무에도 등장한다. 팀·애플리케이션이 늘 때마다 Statement를 덧붙이면 결국 한도에 부딪히고, 그 시점의 정답은 "정책을 더 압축한다"가 아니라 **Access Point로 분할**하거나 **조건 키(태그·조직 ID)로 열거를 대체**하는 것이다. `aws:PrincipalTag`나 `aws:PrincipalOrgID`를 쓰면 주체를 하나씩 적지 않아도 되어 정책이 계정 증가에 따라 커지지 않는다.

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

> 🔍 **더 깊이**: 두 Deny 문에서 조건 연산자가 다른 이유를 짚고 넘어가야 한다. 첫 번째는 `StringNotEquals`로, 헤더가 **없으면 조건이 매칭되어 Deny**가 걸린다(키가 존재하지 않을 때 `StringNotEquals`는 참으로 평가된다). 두 번째는 `StringNotEqualsIfExists`로, 헤더가 **없으면 조건을 건너뛴다**. 이 조합이라야 "암호화 헤더가 아예 없으면 첫 번째 문에서 거부, 헤더는 있는데 다른 키면 두 번째 문에서 거부"가 성립한다. 만약 두 번째도 `StringNotEquals`로 썼다면, SSE-KMS 헤더 없이 올린 요청이 두 문 모두에 걸려 동작은 같아 보이지만, 반대로 첫 번째를 `IfExists`로 쓰면 헤더 없는 평문 업로드가 통과한다. **조건 연산자의 `IfExists` 유무가 정책의 강제력을 좌우한다**는 것이 이 패턴의 핵심 교훈이다.

> 📚 **사례**: 공개로 잘못 설정된 S3 버킷에서 개인정보가 대량 노출되는 사고는 특정 회사의 일이 아니라 클라우드 초기부터 반복돼 온 구조적 패턴이다. 사고 보고에서 공통으로 지목되는 원인은 세 가지다 — (1) 개발·테스트용으로 잠시 공개했다가 되돌리지 않음, (2) `AuthenticatedUsers` ACL을 "우리 회사 사용자"로 오해(실제로는 *AWS 계정을 가진 전 세계 누구나*를 뜻한다), (3) 버킷은 잠갔지만 그 버킷을 오리진으로 삼는 다른 경로가 열려 있음. 이 셋을 각각 막는 통제가 정확히 Block Public Access(되돌리지 않아도 애초에 공개 불가), Object Ownership = BucketOwnerEnforced(ACL 자체를 무력화), IAM Access Analyzer(모든 경로의 외부 접근 가능성을 상시 분석)다. 사고의 역사가 곧 이 기능들의 설계 이유다.

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

Access Point를 도입할 때 반드시 함께 이해해야 할 것은 **위임(delegation) 구조**다. Access Point 정책만으로는 권한이 생기지 않는다. 버킷 정책이 "이 버킷에 대한 접근 결정을 내 계정의 Access Point에 위임한다"고 선언해야, Access Point 정책이 실제로 효력을 갖는다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DelegateToAccessPoints",
      "Effect": "Allow",
      "Principal": { "AWS": "*" },
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::data-lake",
        "arn:aws:s3:::data-lake/*"
      ],
      "Condition": {
        "StringEquals": {
          "s3:DataAccessPointAccount": "111122223333"
        }
      }
    },
    {
      "Sid": "DenyDirectBucketAccessOutsideAccessPoints",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::data-lake/*",
      "Condition": {
        "Null": { "s3:DataAccessPointArn": "true" },
        "StringNotEquals": { "aws:PrincipalArn": "arn:aws:iam::111122223333:role/DataPlatformAdmin" }
      }
    }
  ]
}
```

두 번째 문장이 이 패턴의 핵심이다. `s3:DataAccessPointArn`이 `Null`(요청에 존재하지 않음)이라는 것은 "버킷 이름으로 **직접** 접근했다"는 뜻이다. 관리자 역할 하나만 예외로 두고 나머지 직접 접근을 모두 Deny하면, **모든 데이터 접근이 반드시 Access Point를 지나게** 만들 수 있다. 그러면 각 Access Point 정책이 진짜 경계가 되고, 버킷 정책은 얇게 유지된다.

| 조건 키 | 의미 | 쓰이는 곳 |
|---------|------|-----------|
| `s3:DataAccessPointArn` | 요청이 경유한 Access Point의 ARN | 특정 AP 경유 강제, 직접 접근 차단(`Null`) |
| `s3:DataAccessPointAccount` | Access Point를 소유한 계정 | 버킷 → AP 위임 선언 |
| `s3:AccessPointNetworkOrigin` | `Internet` 또는 `VPC` | VPC 출처 AP만 허용 |

> 🔍 **더 깊이**: **S3 Object Lambda Access Point**는 접근 통제의 한 걸음 더 나아간 형태다. 일반 Access Point가 "이 요청을 허용할까"만 결정한다면, Object Lambda는 GetObject 응답이 클라이언트에 도달하기 전에 Lambda 함수를 태워 **내용 자체를 변형**한다. 같은 객체를 놓고 분석팀에는 주민등록번호를 마스킹한 버전을, 감사팀에는 원본을 돌려주는 식이다. 데이터를 두 벌로 복제해 관리하는 대신 하나의 원본에 뷰를 씌우는 접근이며, "동일 데이터에 대해 역할별로 다른 민감도의 결과를 제공하라"가 나오면 이것이 정답이다. 데이터 사본이 늘수록 유출면도 늘어난다는 원칙과 맞닿아 있다.

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

### 데이터 경계의 3축과 조건 키 지도

데이터 경계(data perimeter)는 세 개의 질문을 각각 정책으로 못 박은 것이다. 이 세 축을 조건 키로 외워 두면 시나리오 문항이 훨씬 빨리 풀린다.

| 축 | 질문 | 어디에 거는가 | 조건 키 |
|----|------|--------------|---------|
| 신뢰 신원 | 우리 조직의 주체만 우리 자원에 접근하는가 | 리소스 정책(버킷 정책) | `aws:PrincipalOrgID`, `aws:PrincipalArn`, `aws:PrincipalIsAWSService` |
| 신뢰 자원 | 우리 주체가 우리 자원에만 접근하는가 | SCP, VPC 엔드포인트 정책 | `aws:ResourceOrgID`, `s3:ResourceAccount` |
| 신뢰 네트워크 | 우리가 통제하는 경로로만 오가는가 | 리소스 정책, SCP | `aws:SourceVpce`, `aws:SourceVpc`, `aws:SourceIp`, `aws:ViaAWSService` |

"신뢰 자원" 축이 왜 필요한지가 초보자에게 가장 안 잡히는 부분이다. 신원과 네트워크만 잠그면 *외부에서 우리 데이터를 읽는 것*은 막지만, *우리 직원이 회사 네트워크에서 자기 개인 버킷으로 데이터를 복사하는 것*은 막지 못한다. 아래처럼 VPC 엔드포인트 정책에 `aws:ResourceOrgID`를 걸면 그 경로로는 조직 밖 버킷에 아예 닿을 수 없다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOnlyOrgOwnedBuckets",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:ResourceOrgID": "o-abcd1234ef",
          "aws:PrincipalOrgID": "o-abcd1234ef"
        }
      }
    }
  ]
}
```

같은 발상을 SCP로 계정 전체에 강제할 수도 있다. SCP에 `s3:ResourceAccount`를 조건으로 걸어 "이 계정의 어떤 주체도 승인되지 않은 계정의 S3 버킷을 호출할 수 없다"고 못 박는 방식이다. 다만 이 경우 AWS 서비스가 소유한 공용 버킷(예: 일부 서비스의 배포 아티팩트)에 대한 정당한 접근까지 막힐 수 있어, 예외를 신중히 열어 줘야 한다.

> ⚠️ **함정**: `aws:SourceIp`와 `aws:SourceVpce`를 혼동하면 안 된다. 요청이 **VPC 엔드포인트를 경유하면 `aws:SourceIp`는 매칭되지 않는다** — 엔드포인트 경유 트래픽에는 퍼블릭 소스 IP가 없기 때문이다. 회사 사무실 IP 대역만 허용하는 정책을 걸어 두고 나중에 VPC 엔드포인트를 도입하면, 그 순간 모든 워크로드가 막힌다. 온프레미스·사무실은 `aws:SourceIp`, VPC 내부 워크로드는 `aws:SourceVpce`로 각각 조건을 나누어 `OR`(같은 Condition 블록 안의 여러 키가 아니라 별도 Statement 또는 `ArnLike` 배열)로 열어 주는 것이 정석이다.

## AccessDenied를 진단하는 순서

시험의 상당수 문항은 "설정은 다 했는데 왜 안 되는가"를 묻는다. 다음 순서로 좁히면 대부분 잡힌다.

```
1. 오류 메시지가 S3인가 KMS인가?
      KMS → 키 정책 / kms:ViaService / 교차계정 Decrypt 누락
2. 익명(비인증) 요청인가?
      예 → Block Public Access, bucket-policy-status의 IsPublic 확인
3. 같은 계정인가 다른 계정인가?
      다른 계정 → 양쪽 Allow 필요(버킷 정책 + 상대 IAM)
4. 어떤 경로로 왔는가?
      VPC 엔드포인트 → aws:SourceVpce 조건, 엔드포인트 정책
5. 조직에 SCP가 있는가?
      있음 → SCP Deny가 계정 전체 상한을 깎고 있지 않은지
6. Access Point를 쓰는가?
      예 → 버킷의 위임 선언(s3:DataAccessPointAccount)과 AP 정책 둘 다 확인
```

```bash
# 특정 주체가 특정 작업을 할 수 있는지 시뮬레이션 (실제 호출 없이 평가)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/AnalyticsRole \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::corp-sensitive/reports/q2.csv

# 버킷에 실제로 붙어 있는 정책과 공개 판정 확인
aws s3api get-bucket-policy --bucket corp-sensitive --output text
aws s3api get-bucket-policy-status --bucket corp-sensitive

# Access Point 목록과 각각의 네트워크 출처 확인
aws s3control list-access-points --account-id 111122223333 --bucket data-lake
```

> 🎯 **시나리오**: "분석 팀 역할에 `s3:GetObject`를 부여했는데도 SSE-KMS 버킷의 객체를 읽지 못한다"가 나오면 답은 거의 항상 **KMS 키 정책 또는 역할의 `kms:Decrypt` 누락**이다. S3 권한과 KMS 권한은 별개의 관문이고, 오류 메시지가 KMS를 가리키는지 확인하는 것이 첫 단서다. 여기에 `kms:ViaService` 조건이 걸려 있다면 그 값이 해당 리전의 S3 서비스 주체와 일치하는지도 봐야 한다.

## S3 Access Analyzer로 노출 점검

IAM Access Analyzer는 버킷 정책·ACL·Access Point를 분석해 "외부(계정 밖/공개)에서 접근 가능한 버킷"을 자동 탐지한다. 설정 실수로 인한 노출을 사후가 아니라 사전·상시로 잡아낸다. "어떤 S3 버킷이 외부에 노출되었는지 지속적으로 확인"이 요구되면 Access Analyzer가 정답이다.

Access Analyzer의 핵심은 **신뢰 영역(zone of trust)**을 계정 또는 조직으로 정하고, 그 밖에서 접근 가능한 리소스를 자동 증명(automated reasoning)으로 찾아낸다는 점이다. 사람이 정책을 눈으로 읽어 "이건 공개인가?"를 판단하는 것과 달리, 조건 키 조합까지 논리적으로 풀어서 결론을 낸다. 비슷한 이름의 도구들과 역할이 헷갈리기 쉬우므로 구분해 둔다.

| 도구 | 무엇을 답하는가 |
|------|-----------------|
| IAM Access Analyzer(외부 접근) | "이 버킷/키/역할이 조직 밖에서 접근 가능한가" |
| IAM Access Analyzer(미사용 접근) | "부여했지만 실제로는 쓰이지 않는 권한이 무엇인가" |
| Macie | "이 버킷 안에 민감 데이터가 있는가"(내일 다룬다) |
| AWS Config | "이 버킷이 정해진 구성 규칙을 지키는가"(암호화 켜짐, BPA 켜짐 등) |
| GuardDuty(S3 보호) | "이 버킷에 대한 접근 패턴이 이상한가" |
| CloudTrail 데이터 이벤트 | "실제로 누가 어떤 객체를 읽었는가" |

시험 문항은 이 여섯 개 중 하나를 정확히 요구한다. "노출 여부 상시 점검"은 Access Analyzer, "구성 준수 평가와 자동 교정"은 Config(+ 교정 규칙), "민감 데이터 발견"은 Macie, "이상 행위 탐지"는 GuardDuty, "누가 읽었는지 사후 추적"은 CloudTrail 데이터 이벤트다. 이 대응만 정확해도 데이터 보호 도메인의 상당수 문항이 즉답이 된다.

> 🎯 **시나리오**: "정적 웹사이트를 서비스해야 하는데, 버킷은 절대 공개하지 말라"가 나오면 답은 **CloudFront + OAC(Origin Access Control)**다. 버킷에는 BPA를 유지한 채, 버킷 정책에서 CloudFront 서비스 주체(`cloudfront.amazonaws.com`)를 허용하되 `AWS:SourceArn` 조건으로 **특정 배포에서 온 요청만** 받도록 좁힌다. 조건을 빼면 아무 CloudFront 배포나 그 버킷을 오리진으로 삼을 수 있는 혼동된 대리자(confused deputy) 문제가 생긴다. 구형 OAI(Origin Access Identity) 대신 OAC를 쓰는 이유는 SSE-KMS 객체 지원과 서명 방식 때문이며, 신규 구성에서 OAI를 고르는 답은 오답 처리된다.

## 한 줄 요약

S3 접근 통제의 문법은 세 문장으로 압축된다. **하나, 명시적 Deny는 언제나 이긴다** — 그래서 강제(암호화·HTTPS·네트워크 경로)는 전부 조건부 Deny로 구현된다. **둘, 교차계정은 양쪽 모두의 Allow가 필요하다** — 같은 계정 안의 직관을 그대로 가져가면 반드시 틀린다. **셋, 규모가 커지면 정책을 키우지 말고 진입점을 나눈다** — Access Point가 그 답이며, 버킷 정책은 위임 선언만 남기고 얇게 유지한다. 여기에 데이터 경계 3축(신뢰 신원·신뢰 자원·신뢰 네트워크)을 얹으면, "권한은 맞는데 경로가 틀린" 유출까지 함께 막힌다.

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
