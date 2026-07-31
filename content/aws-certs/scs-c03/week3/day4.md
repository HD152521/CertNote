# Day 4 - 프라이빗 연결: VPC 엔드포인트와 데이터 유출 봉쇄

Day 1에서 NAT Gateway가 데이터 유출 경로가 될 수 있다고 했다. App Tier가 S3에서 객체를 읽으려면 보통 NAT를 통해 인터넷으로 나간다. 그런데 NAT는 아웃바운드를 폭넓게 허용한다 — S3로 가든, 공격자의 서버로 가든 구분하지 못한다. 침해된 인스턴스가 탈취한 자격증명으로 회사 데이터를 외부 S3 버킷으로 빼낼 때, NAT는 그걸 막지 못한다.

VPC 엔드포인트는 이 문제를 근본적으로 푼다. AWS 서비스(S3, DynamoDB, KMS, Secrets Manager 등)에 **인터넷을 거치지 않고** AWS 백본 내부에서 사설로 연결한다. 인터넷 경로를 아예 제거할 수 있으니, 데이터가 빠져나갈 길 자체가 사라진다. 게다가 엔드포인트 정책으로 "우리 회사 버킷에만, 우리 조직 계정만" 같은 제약을 걸 수 있다. 오늘은 두 종류의 엔드포인트, PrivateLink, 그리고 엔드포인트 정책으로 유출을 봉쇄하는 설계를 본다. SCS-C03 도메인 3의 정점이다.

## 두 종류의 엔드포인트: Gateway vs Interface

| 항목 | Gateway Endpoint | Interface Endpoint (PrivateLink) |
|------|------------------|----------------------------------|
| 지원 서비스 | **S3, DynamoDB 둘 뿐** | 대부분의 AWS 서비스 + 사용자 서비스 |
| 동작 방식 | 라우팅 테이블에 prefix list 경로 추가 | 서브넷에 ENI 생성(사설 IP) |
| 비용 | **무료** | 시간당 + 데이터 처리 요금 |
| 접근 방식 | VPC 내부에서만 | VPC 내부 + 온프레미스(DX/VPN) 가능 |
| DNS | 공용 DNS 그대로 | Private DNS로 서비스 도메인 오버라이드 |
| 보안 그룹 | 적용 안 됨(라우팅) | ENI에 SG 적용 가능 |

표만 보면 외워야 할 목록처럼 보이지만, **패킷이 실제로 어디로 흐르는가**를 그려 보면 나머지가 전부 따라 나온다.

```
[ 같은 "S3 접근"이 세 가지 경로로 갈릴 수 있다 ]

(A) 인터넷 경유 — NAT
    EC2(10.0.10.5) ─▶ 라우팅 0.0.0.0/0 → NAT ─▶ IGW ─▶ 인터넷 ─▶ S3 공용 엔드포인트
    · 목적지 제한 불가(NAT는 어디로든 보낸다)
    · 유출 경로가 함께 열린다

(B) Gateway Endpoint — 라우팅 레이어
    EC2(10.0.10.5) ─▶ 라우팅 pl-xxxx(S3) → vpce-xxxx ─▶ AWS 백본 ─▶ S3
                          └ 접두사 목록으로 표현된 경로
    · ENI 없음 · 사설 IP 없음 · SG 못 붙임 · 무료
    · VPC 내부에서만 동작(온프레미스는 이 라우팅 테이블을 쓰지 않는다)

(C) Interface Endpoint / PrivateLink — ENI 레이어
    EC2(10.0.10.5) ─▶ DNS가 10.0.10.240으로 해석 ─▶ [ENI in subnet] ─▶ AWS 백본 ─▶ 서비스
                                                     └ sg-vpce 적용 가능
    · 서브넷마다 ENI(사설 IP) 생성 · 시간당+처리 요금
    · 온프레미스(DX/VPN)에서도 그 사설 IP로 도달 가능

  ── 셋의 차이는 "무엇으로 목적지를 지정하는가"다.
     (A)는 공인 IP, (B)는 라우팅 경로, (C)는 사설 IP.
     온프레미스에서 닿을 수 있는 것은 사설 IP뿐이므로 (C)만 가능하다.
```

이 그림에서 시험 문제 절반이 나온다. "온프레미스에서 Direct Connect로 S3에 사설 접근"이 Interface Endpoint인 이유는 온프레미스가 **VPC의 라우팅 테이블을 사용하지 않기** 때문이고, Gateway Endpoint는 그 라우팅 테이블에만 존재하는 경로이기 때문이다. 반대로 "VPC 안의 Lambda가 S3에 사설 접근"이 Gateway Endpoint인 이유는, 그 경우엔 라우팅 테이블이 그대로 적용되고 비용이 0이기 때문이다.

> 💡 **관련 이론**: 둘의 차이는 **구현 레이어**가 다르다는 데서 온다. Gateway Endpoint는 **라우팅 레이어**에서 동작한다 — 라우팅 테이블에 S3용 prefix list(`pl-xxxx`)를 향하는 경로를 추가하면, 그 서비스로 향하는 트래픽이 인터넷이 아닌 AWS 내부로 흐른다. Interface Endpoint는 **ENI 레이어**에서 동작한다 — 서브넷에 실제 네트워크 인터페이스(사설 IP)를 만들어, 그 IP로 서비스에 연결한다. 그래서 Interface는 SG가 붙고 온프레미스에서도 접근 가능한 반면, Gateway는 라우팅이라 VPC 내부에서만 동작한다.

```bash
# Gateway Endpoint (S3) — 라우팅 테이블에 경로 추가, 무료
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxxx --service-name com.amazonaws.us-east-1.s3 \
  --vpc-endpoint-type Gateway \
  --route-table-ids rtb-app rtb-data

# Interface Endpoint (KMS) — 서브넷에 ENI 생성, Private DNS 활성
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxxx --service-name com.amazonaws.us-east-1.kms \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-app-a subnet-app-b \
  --security-group-ids sg-vpce \
  --private-dns-enabled
```

> ⚠️ **함정**: 시험에서 단골인 구분 — "S3와 DynamoDB는 Gateway, 나머지는 모두 Interface"다. "Lambda를 VPC 안에서 S3에 사설 접근"이라면 Gateway Endpoint(무료)가 정답이지 Interface가 아니다. 반대로 "온프레미스에서 DX를 통해 S3에 사설 접근"이라면 Gateway는 VPC 내부 전용이라 안 되고, **S3 Interface Endpoint**(2021년 추가됨)가 필요하다. 즉 S3는 둘 다 지원하지만 용도가 다르다 — VPC 내부면 무료 Gateway, 온프레미스 연동이면 Interface.

## Private DNS: 코드를 바꾸지 않고 사설로 보내기

Interface Endpoint의 핵심 기능이 **Private DNS**다. 기본적으로 애플리케이션은 `kms.us-east-1.amazonaws.com` 같은 공용 도메인을 호출한다. Private DNS를 켜면 이 도메인이 VPC 안에서 엔드포인트의 **사설 IP로 해석(resolve)**된다. 코드 한 줄 바꾸지 않아도 트래픽이 사설 경로로 흐른다.

> 🔍 **더 깊이**: Private DNS가 동작하려면 VPC의 `enableDnsSupport`와 `enableDnsHostnames`가 둘 다 켜져 있어야 한다. 이게 꺼져 있으면 Private DNS를 켜도 도메인이 여전히 공용 IP로 해석돼 트래픽이 인터넷으로 샌다. 트러블슈팅 시 "엔드포인트는 만들었는데 여전히 인터넷으로 나간다"면 (1) Private DNS 활성 여부, (2) VPC DNS 속성 두 개, (3) 엔드포인트 ENI 서브넷이 호출하는 인스턴스와 라우팅상 도달 가능한지를 본다. 온프레미스에서 호출할 때는 공용 도메인이 온프레미스 리졸버에서 엔드포인트 사설 IP로 풀리도록 Route 53 Resolver Inbound Endpoint나 조건부 포워딩이 필요하다.

## 엔드포인트 정책: 유출을 봉쇄하는 핵심

엔드포인트에는 **리소스 기반 정책(VPC Endpoint Policy)**을 붙일 수 있다. 이게 데이터 유출 방지의 핵심 무기다. "이 엔드포인트를 통해 접근 가능한 대상"을 제한한다.

```json
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": ["s3:GetObject", "s3:PutObject"],
    "Resource": [
      "arn:aws:s3:::my-company-bucket/*"
    ],
    "Condition": {
      "StringEquals": { "aws:PrincipalOrgID": "o-myorg123" }
    }
  }]
}
```

이 정책의 의미: 이 엔드포인트로는 **오직 `my-company-bucket`에만, 우리 조직(`o-myorg123`) 소속 Principal만** 접근 가능. 침해된 인스턴스가 자격증명을 탈취해 외부 공격자 버킷으로 데이터를 PutObject하려 해도, 그 버킷은 Resource에 없으니 차단된다.

> 💡 **관련 이론**: 이것이 **데이터 경계(Data Perimeter)** 개념이다. AWS가 정립한 모범 사례로, 세 축으로 구성된다 — (1) "신뢰하는 ID만"(`aws:PrincipalOrgID`), (2) "신뢰하는 리소스만"(`aws:ResourceOrgID`), (3) "신뢰하는 네트워크에서만"(`aws:SourceVpce`). 엔드포인트 정책은 이 중 네트워크 축의 핵심 도구다. "우리 VPC 엔드포인트를 거친 요청만 우리 버킷에 허용"을 버킷 정책에서 `aws:SourceVpce` 조건으로 강제하면, 인터넷이나 다른 계정에서의 직접 접근이 차단된다.

### 세 축을 실제 정책으로 옮기면

말로 하면 추상적이니 세 축이 각각 어디에 붙는지를 짝지어 둔다. **같은 조건 키라도 어느 정책에 붙느냐에 따라 막는 것이 완전히 달라진다**는 점이 핵심이다.

| 축 | 막고 싶은 것 | 붙이는 곳 | 대표 조건 키 |
|----|-------------|----------|-------------|
| 신뢰하는 ID | 외부 계정 principal이 우리 리소스를 만지는 것 | 리소스 정책(버킷 정책 등) | `aws:PrincipalOrgID` |
| 신뢰하는 리소스 | 우리 principal이 **외부 리소스**로 데이터를 보내는 것 | 엔드포인트 정책 / SCP | `aws:ResourceOrgID` |
| 신뢰하는 네트워크 | 우리 리소스에 **우리 네트워크 밖에서** 접근하는 것 | 리소스 정책 | `aws:SourceVpce`, `aws:SourceVpc` |

유출 봉쇄에서 결정적인 것은 **두 번째 축**이다. 첫 번째와 세 번째는 "밖에서 안으로"를 막지만, 침해된 인스턴스가 우리 자격증명으로 **공격자 버킷에 데이터를 쓰는** 시나리오는 안에서 밖으로 나가는 방향이라 둘 다 걸리지 않는다. 이 방향을 막는 자리가 엔드포인트 정책이다.

```json
// [엔드포인트 정책] 이 엔드포인트로는 "우리 조직 소유 버킷"에만 나갈 수 있다
// — 안에서 밖으로 향하는 유출을 막는다
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowRequestsFromOurOrgPrincipals",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "*",
      "Condition": {
        "StringEquals": { "aws:PrincipalOrgID": "o-myorg123" }
      }
    },
    {
      "Sid": "DenyAccessToResourcesOutsideOurOrg",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "*",
      "Condition": {
        "StringNotEqualsIfExists": { "aws:ResourceOrgID": "o-myorg123" }
      }
    }
  ]
}
```

```json
// [버킷 정책] 이 버킷에는 "우리 엔드포인트를 거친 요청"만 들어올 수 있다
// — 밖에서 안으로 향하는 접근을 막는다
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnlessThroughOurVpcEndpoint",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::corp-sensitive",
        "arn:aws:s3:::corp-sensitive/*"
      ],
      "Condition": {
        "StringNotEqualsIfExists": {
          "aws:SourceVpce": ["vpce-0aaa1111", "vpce-0bbb2222"]
        },
        "BoolIfExists": { "aws:PrincipalIsAWSService": "false" }
      }
    }
  ]
}
```

두 정책을 나란히 놓고 보면 **방향이 정반대**라는 것이 눈에 들어온다. 엔드포인트 정책은 "이 문으로 어디까지 나갈 수 있는가"를 정하고, 버킷 정책은 "이 방에 어느 문으로 들어올 수 있는가"를 정한다. 유출을 봉쇄하려면 둘 다 필요하다 — 하나만 걸면 반대 방향이 뚫린 채로 남는다.

> ⚠️ **함정**: 위 버킷 정책에서 `StringNotEquals`가 아니라 `StringNotEqualsIfExists`를 쓴 것과, `aws:PrincipalIsAWSService` 예외를 둔 것에 주의한다. `aws:SourceVpce`는 VPC 엔드포인트를 거친 요청에만 존재하는 키이므로, 조건 키가 아예 없는 요청(예: AWS 서비스가 대신 호출하는 경우, CloudFront의 OAC를 통한 접근, 리전 간 복제)에 `StringNotEquals`를 걸면 **전부 Deny로 떨어진다.** 실제로 이 정책을 급하게 적용했다가 CloudFront 배포와 로그 전달, 복제가 동시에 끊기는 사고가 흔하다. 데이터 경계 정책은 반드시 `IfExists` 계열 연산자와 서비스 예외를 함께 설계하고, **Deny를 켜기 전에 CloudTrail로 접근 출처 목록을 먼저 뽑아 본다.**

### 정책은 AND로 평가된다

엔드포인트 정책·리소스 정책·IAM 정책이 어떻게 합쳐지는지 그림으로 고정해 둔다. 시험에서 "AccessDenied가 났다, 어디를 보나"의 답이 여기서 나온다.

```
[ VPC 엔드포인트를 거친 S3 요청이 통과해야 하는 관문 ]

   EC2의 인스턴스 프로파일 역할
        │
   ① IAM 정책 (+ 권한 경계 / SCP)
        │   "이 principal이 이 액션을 해도 되는가"
        ▼
   ② VPC 엔드포인트 정책
        │   "이 문을 통해 이 리소스로 나가도 되는가"
        ▼
   ③ 리소스 정책 (버킷 정책 / KMS 키 정책)
        │   "이 리소스가 이 요청을 받아 주는가"
        ▼
      허용

  · 세 관문이 모두 Allow여야 통과 (AND)
  · 어느 하나라도 명시적 Deny면 즉시 거부 (Deny 우선)
  · 엔드포인트 정책은 권한을 "부여"하지 않는다 — 좁히기만 한다
    (엔드포인트 정책에 s3:* Allow가 있어도 IAM이 막으면 거부)
  · 기본 엔드포인트 정책은 "전체 허용"이므로, 아무것도 안 하면 ②는 통과
```

세 번째 항목이 자주 오해되는 지점이다. 엔드포인트 정책은 **필터이지 권한 부여 수단이 아니다.** "엔드포인트 정책에 허용을 넣었는데 여전히 AccessDenied"라면 IAM이나 버킷 정책을 봐야 한다.

> 🎯 **시나리오**: "민감 데이터가 담긴 S3 버킷이 있다. 직원이 노트북에서 직접, 혹은 침해된 외부 호스트에서 이 버킷에 접근하는 것을 완전히 막고, 오직 사내 VPC를 거친 요청만 허용하고 싶다." — 답: (1) Gateway Endpoint 생성, (2) **버킷 정책**에 `"Condition": {"StringEquals": {"aws:SourceVpce": "vpce-xxxx"}}`로 그 엔드포인트 경유만 허용, (3) `aws:SourceVpc`나 `aws:PrincipalOrgID`도 추가. 이러면 콘솔·CLI로 인터넷에서 직접 접근하면 AccessDenied. 데이터가 네트워크 경계 안에 갇힌다.

> ⚠️ **함정**: 버킷 정책에 `aws:SourceVpce`만 걸면 **그 외 모든 접근을 막아버려** CloudFront·다른 서비스 연동까지 끊길 수 있다. 또 VPC Endpoint 정책과 버킷 정책, IAM 정책은 **AND로 평가**된다 — 셋 중 하나라도 거부하면 거부, 모두 허용해야 허용. 그래서 엔드포인트 정책을 너무 좁히면 정상 트래픽까지 끊기는 사고가 잦다. 엔드포인트 정책의 기본값은 "전체 허용(full access)"이고, 좁힐 때는 단계적으로 검증한다.

## "EC2가 S3에 못 붙는다"를 좁히는 순서

엔드포인트를 도입하면 실패 지점이 늘어난다. 네트워크 계층과 정책 계층이 겹쳐 있어서, 순서 없이 뒤지면 시간이 배로 든다. 아래 순서를 고정해 두면 각 단계에서 배제되는 원인이 명확해진다.

```
[ EC2 → S3 접근 실패, 좁혀 가는 순서 ]

  0. 에러 메시지를 먼저 읽는다  ★ 가장 중요
       timeout / 연결 실패      → 1~3 (네트워크 계층)
       AccessDenied            → 4~6 (정책 계층)
       엉뚱한 IP로 접속 시도     → DNS 문제 (3-b)

  1. 라우팅
       Gateway EP: 그 서브넷 라우팅에 pl-xxxx → vpce 경로가 있는가
                   (엔드포인트 생성 시 --route-table-ids에 넣었는가)
       Interface EP: 엔드포인트 ENI가 있는 서브넷에 도달 가능한가
  2. NACL
       엔드포인트 ENI가 있는 서브넷의 인바운드/아웃바운드 443
       (stateless이므로 응답 임시 포트도)
  3. 보안 그룹
       3-a. Interface EP의 ENI에 붙은 SG가 443 인바운드를 허용하는가
            ★ Gateway EP에는 SG가 없다 — 여기를 찾다 시간을 버리지 않는다
       3-b. Private DNS: 도메인이 사설 IP로 풀리는가
            (VPC의 enableDnsSupport / enableDnsHostnames 두 속성)
  ── 여기까지가 timeout의 영역 ──
  4. 엔드포인트 정책
       기본은 전체 허용. 좁혔다면 Resource·Condition을 본다
  5. 리소스 정책 (버킷 정책 / KMS 키 정책)
       aws:SourceVpce 조건에 이 엔드포인트 ID가 들어 있는가
       SSE-KMS 버킷이면 KMS 키 정책과 kms 엔드포인트도 함께 확인
  6. IAM (인스턴스 프로파일 역할 + 권한 경계 + SCP)
       s3:GetObject 권한이 실제로 있는가

  → 0번의 에러 유형 분류만으로 후보가 절반으로 준다.
     timeout인데 버킷 정책을 들여다보는 것이 가장 흔한 시간 낭비다.
```

5번의 KMS 언급이 실전에서 자주 걸리는 함정이다. **암호화된 S3 버킷에 접근하려면 S3만으로 끝나지 않는다.** 객체가 SSE-KMS로 암호화돼 있으면 클라이언트는 KMS도 호출해야 하고, zero-internet VPC에서는 KMS Interface Endpoint가 따로 있어야 한다. "S3 Gateway Endpoint를 만들었는데 GetObject가 실패한다"는 사례의 상당수가 실은 KMS 호출이 나가지 못해서 생긴다. 에러 메시지가 S3가 아니라 KMS를 가리키는지 확인하는 습관이 필요하다.

```bash
# 이 VPC의 엔드포인트 목록과 각각의 정책 요약
aws ec2 describe-vpc-endpoints \
  --filters "Name=vpc-id,Values=vpc-0abc1234" \
  --query 'VpcEndpoints[].{Id:VpcEndpointId,Svc:ServiceName,Type:VpcEndpointType,
             State:State,PrivateDns:PrivateDnsEnabled,RTs:RouteTableIds,
             Subnets:SubnetIds,SGs:Groups[].GroupId}' \
  --output json

# Gateway Endpoint를 라우팅 테이블에 추가로 연결(빠뜨린 서브넷 구제)
aws ec2 modify-vpc-endpoint \
  --vpc-endpoint-id vpce-0aaa1111 \
  --add-route-table-ids rtb-data-a rtb-data-b

# 엔드포인트 정책 교체 (좁힐 때는 단계적으로)
aws ec2 modify-vpc-endpoint \
  --vpc-endpoint-id vpce-0aaa1111 \
  --policy-document file://endpoint-policy.json

# S3 접두사 목록의 실제 CIDR 확인 — 라우팅에 무엇이 들어간 건지 볼 때
aws ec2 describe-prefix-lists \
  --filters "Name=prefix-list-name,Values=com.amazonaws.us-east-1.s3"
```

> 🔍 **더 깊이**: Interface Endpoint를 만들 때 **어느 서브넷에 ENI를 둘지**가 가용성과 비용을 동시에 결정한다. AZ 하나에만 ENI를 두면 그 AZ가 흔들릴 때 다른 AZ의 인스턴스가 서비스에 접근하지 못하고, 평상시에도 AZ 간 트래픽이 발생한다. 그래서 워크로드가 있는 모든 AZ에 하나씩 두는 것이 기본이다. 반대로 엔드포인트마다 ENI가 늘어나면 시간당 요금이 곱해지므로, "정말 필요한 서비스"의 목록을 관리하는 일이 실제 비용 관리 작업이 된다. 여기서 조직들이 흔히 택하는 절충이 **중앙 공유 엔드포인트 VPC** — 엔드포인트를 한 VPC에 모아 두고 Transit Gateway나 Route 53 Resolver 규칙으로 다른 VPC가 그것을 쓰게 하는 구성이다. 다만 이 구성은 엔드포인트 정책 하나가 여러 VPC의 트래픽을 동시에 통제하게 되므로, 정책을 좁힐 때의 영향 범위도 함께 커진다는 점을 감안해야 한다.

## PrivateLink: 서비스 제공자 패턴

Interface Endpoint의 일반화가 **PrivateLink**다. AWS 서비스뿐 아니라 **다른 계정이 제공하는 사용자 정의 서비스**에도 사설 연결할 수 있다.

```
[소비자 VPC]                          [제공자 VPC]
 Interface Endpoint (ENI) ──사설──→ Endpoint Service ──→ NLB ──→ 백엔드
   (사설 IP로 연결)                  (다른 계정/조직)
```

- 제공자는 NLB 뒤에 서비스를 두고 **Endpoint Service**로 노출.
- 소비자는 Interface Endpoint로 연결. **IP 겹침과 무관**, Peering 불필요.
- 트래픽이 단방향(소비자→제공자)이고 제공자 VPC 전체가 노출되지 않음.

> 🔍 **더 깊이**: PrivateLink가 VPC Peering보다 보안적으로 우월한 점은 **노출 표면의 차이**다. Peering은 두 VPC를 양방향으로 라우팅 연결해 CIDR 전체가 서로 보인다(SG로 좁혀야 함). PrivateLink는 제공자가 노출한 **단 하나의 서비스(NLB 엔드포인트)**만 보이고, 나머지 제공자 VPC는 완전히 가려진다. 그래서 SaaS 제공자가 다수 고객에게 서비스를 줄 때, 고객 VPC와 자사 VPC를 섞지 않고 격리된 채 연결하는 표준 방식이다. CIDR 충돌도 없다(ENI는 소비자 VPC 주소 사용).

> 📚 **사례**: Snowflake, Datadog, MongoDB Atlas 같은 SaaS는 모두 PrivateLink로 고객에게 사설 연결을 제공한다. 고객 입장에서는 자사 데이터가 인터넷을 거치지 않고 SaaS로 흐르므로 컴플라이언스(HIPAA, PCI)를 만족하기 쉽다. 만약 Peering이었다면 SaaS 제공자 VPC 전체가 고객에게 노출되는 위험이 있었다. PrivateLink는 "필요한 서비스 하나만 사설로"라는 최소 노출 원칙을 네트워크에 구현한 것이다.

## 정리: 유출을 막는 3겹

```
1. NAT 제거 → 인터넷 egress 경로 자체 차단
2. VPC Endpoint → 필요한 AWS 서비스만 사설 연결
3. Endpoint Policy + 버킷 정책(aws:SourceVpce) → 어디로/누가만 허용
```

> 🔍 **더 깊이**: 가장 강한 격리는 NAT를 완전히 제거하고 모든 AWS 서비스 접근을 Interface/Gateway Endpoint로만 하는 구성이다. 단 이러면 인스턴스가 OS 패치를 인터넷에서 받을 수 없으므로, Systems Manager(SSM Agent)도 Interface Endpoint(`ssm`, `ssmmessages`, `ec2messages`)로 연결하고, 컨테이너 이미지는 ECR Endpoint로, 로그는 CloudWatch Logs Endpoint로 보낸다. 이렇게 "인터넷 0(zero-internet) VPC"를 구성하면 데이터 유출 경로가 사실상 사라진다. 규제 워크로드(금융·의료)에서 채택하는 패턴이다.

### zero-internet VPC의 최소 엔드포인트 목록

"NAT를 지운다"는 결정은 곧 "필요한 엔드포인트를 빠짐없이 세운다"는 작업이다. 하나라도 빠지면 그 기능만 조용히 실패하고, 대개 배포 당일 밤에 발견된다. 워크로드 유형별로 실제로 필요한 목록을 정리해 둔다.

| 하려는 일 | 필요한 엔드포인트 | 유형 |
|-----------|------------------|------|
| 객체 저장소 접근 | `s3` | Gateway(VPC 내부) / Interface(온프레미스) |
| NoSQL 테이블 접근 | `dynamodb` | Gateway |
| 인스턴스 관리·패치·세션 | `ssm`, `ssmmessages`, `ec2messages` | Interface |
| 암호화 키 사용(SSE-KMS 포함) | `kms` | Interface |
| 비밀 조회 | `secretsmanager` | Interface |
| 컨테이너 이미지 pull | `ecr.api`, `ecr.dkr` **+ s3**(레이어 저장소) | Interface + Gateway |
| 로그 전송 | `logs` | Interface |
| 지표 전송 | `monitoring` | Interface |
| EC2 API 호출(태그 조회 등) | `ec2` | Interface |
| STS로 역할 수임 | `sts` | Interface |

ECR 줄이 특히 자주 빠진다. **이미지 매니페스트는 ECR API로 가져오지만 실제 레이어는 S3에서 받는다.** 그래서 `ecr.api`와 `ecr.dkr`만 만들고 S3 엔드포인트를 빠뜨리면, `docker pull`이 중간까지 진행되다 멈춘다. 마찬가지로 `sts`가 없으면 역할 수임이 필요한 모든 동작이 실패하는데 에러 메시지는 대개 그 하위 서비스를 가리켜 원인을 찾기 어렵다.

> 🎯 **시나리오**: "규제 요건상 인터넷 경로가 없는 VPC에 컨테이너 워크로드를 올렸다. 태스크가 시작되지 않고 이미지 pull에서 멈춘다. 무엇이 빠졌나?" — 대개 **S3 Gateway Endpoint**다. ECR 관련 인터페이스 엔드포인트를 둘 다 만들었더라도 레이어 다운로드는 S3를 거치므로, S3 경로가 없으면 매니페스트까지만 되고 그다음이 멈춘다. 여기에 로그 드라이버가 CloudWatch Logs를 쓰고 있다면 `logs` 엔드포인트도 필요하고, 태스크 역할을 쓰면 `sts`도 필요하다. **"엔드포인트가 하나 빠지면 그 기능만 실패한다"** 는 성질 때문에 증상이 부분적으로 나타나고, 그래서 전체 목록을 체크리스트로 갖고 있는 것이 가장 빠른 해법이다.

## 정리하며

핵심은 넷이다. 첫째, **Gateway Endpoint는 S3·DynamoDB 전용(무료, 라우팅 기반)**이고 나머지는 모두 **Interface Endpoint(PrivateLink, ENI 기반, 유료)**다. 셋의 차이는 결국 "무엇으로 목적지를 지정하는가"이며 — NAT는 공인 IP, Gateway는 라우팅 경로, Interface는 사설 IP — 온프레미스가 닿을 수 있는 것은 사설 IP뿐이라 그 경우엔 Interface만 답이 된다.

둘째, 데이터 경계는 **방향이 반대인 두 정책의 쌍**으로 만든다. 엔드포인트 정책은 "이 문으로 어디까지 나갈 수 있는가"(`aws:ResourceOrgID`)를, 리소스 정책은 "이 방에 어느 문으로 들어올 수 있는가"(`aws:SourceVpce`)를 정한다. 유출 봉쇄에 결정적인 것은 전자다 — 침해된 인스턴스가 우리 자격증명으로 외부 버킷에 쓰는 시나리오는 나가는 방향이라 후자로는 잡히지 않는다. 그리고 조건 키를 걸 때는 반드시 `IfExists` 계열과 서비스 예외를 함께 설계한다. 그러지 않으면 CloudFront·복제·로그 전달이 함께 끊긴다.

셋째, 정책은 **IAM ∩ 엔드포인트 정책 ∩ 리소스 정책의 AND**로 평가되고 명시적 Deny가 우선한다. 엔드포인트 정책은 권한을 부여하지 않고 좁히기만 한다는 점을 기억하면 "엔드포인트 정책에 Allow를 넣었는데 왜 AccessDenied인가"에서 헤매지 않는다. 진단 순서도 고정해 둔다 — **에러가 timeout이면 라우팅→NACL→SG/DNS, AccessDenied면 엔드포인트 정책→리소스 정책→IAM.**

넷째, **PrivateLink는 Peering보다 노출 표면이 작아** SaaS·계정 간 연결의 표준이다. 그리고 zero-internet VPC를 실제로 세울 때는 엔드포인트 체크리스트가 곧 작업 목록이 된다 — 특히 ECR은 `ecr.api`·`ecr.dkr`에 더해 **레이어를 받는 S3**가 필요하고, 역할 수임에는 `sts`, 로그에는 `logs`가 필요하다. 하나가 빠지면 그 기능만 조용히 실패한다.

네트워크 격리의 최종 목표는 "데이터가 흐를 수 있는 경로를 명시적으로 허용한 것만 남기는" 것이다. 다음 글에서는 Week 3 전체 — VPC 설계, SG/NACL, Flow Logs, 프라이빗 연결 — 를 하나의 시나리오로 통합 복습한다.

---

## 📝 연습 문제

**문제 1.** VPC 내부의 Lambda 함수가 S3 버킷에 인터넷을 거치지 않고 사설로 접근해야 한다. 가장 비용 효율적인 방법은?

A) Interface Endpoint(PrivateLink)를 S3용으로 생성한다  
B) Gateway Endpoint를 생성해 라우팅 테이블에 S3 경로를 추가한다  
C) NAT Gateway를 통해 S3로 나가게 한다  
D) VPC Peering으로 S3 서비스 VPC와 연결한다  

**정답: B**  
해설: S3와 DynamoDB는 무료인 Gateway Endpoint를 지원하며, 라우팅 테이블에 해당 서비스 경로를 추가하는 방식으로 VPC 내부에서 사설 접근이 가능하다. Interface Endpoint는 시간당·데이터 처리 요금이 발생하므로 VPC 내부 전용 접근에는 비용 면에서 불리하고, S3는 서비스 VPC와 Peering할 수 있는 대상이 아니다.

---

**문제 2.** 온프레미스 데이터센터에서 Direct Connect를 통해 S3에 사설로 접근해야 한다. 적절한 구성은?

A) S3 Gateway Endpoint를 생성한다  
B) S3 Interface Endpoint를 생성한다  
C) NAT Gateway를 온프레미스 쪽에 둔다  
D) S3 버킷을 퍼블릭으로 전환한다  

**정답: B**  
해설: Gateway Endpoint는 라우팅 기반이라 VPC 내부 전용이며 온프레미스에서 직접 도달할 수 없다. 온프레미스에서 Direct Connect나 VPN을 통해 사설로 접근하려면 서브넷에 ENI를 두는 S3 Interface Endpoint가 필요하다. 버킷을 퍼블릭으로 전환하는 방식은 사설 연결 요구에 어긋난다.

---

**문제 3.** 민감 데이터가 담긴 S3 버킷을 오직 사내 VPC 엔드포인트를 거친 요청만 접근 가능하게 하려고 한다. 가장 효과적인 통제는?

A) 버킷 정책에 aws:SourceVpce 조건으로 특정 엔드포인트 경유만 허용한다  
B) 버킷에 ACL을 적용해 익명 접근을 막는다  
C) 보안 그룹으로 버킷 인바운드를 제한한다  
D) NACL로 S3 IP 범위를 차단한다  

**정답: A**  
해설: 버킷 정책에 특정 VPC 엔드포인트 경유 조건을 걸면, 그 엔드포인트를 통하지 않은 인터넷·콘솔·다른 계정의 직접 접근이 거부되어 데이터가 네트워크 경계 안에 갇힌다. S3는 보안 그룹이나 NACL이 직접 적용되는 대상이 아니며, ACL은 이런 네트워크 출처 기반 제약을 표현하지 못한다.

---

**문제 4.** Interface Endpoint를 생성하고 Private DNS를 켰는데도 트래픽이 여전히 인터넷으로 나간다. 가장 먼저 확인할 항목은?

A) 버킷 정책의 Resource 범위  
B) VPC의 enableDnsSupport와 enableDnsHostnames 속성  
C) NAT Gateway의 임시 포트 범위  
D) NACL의 규칙 번호 순서  

**정답: B**  
해설: Private DNS가 서비스 도메인을 엔드포인트의 사설 IP로 해석하려면 VPC의 DNS 지원과 DNS 호스트네임 속성이 모두 켜져 있어야 한다. 이 속성이 꺼져 있으면 도메인이 공용 IP로 해석되어 트래픽이 인터넷 경로로 흐른다. 임시 포트나 NACL 순서는 DNS 해석 경로와 무관하다.

---

**문제 5.** SaaS 제공자가 다수 고객에게 자사 서비스를 사설로 제공하되, 자사 VPC 전체가 고객에게 노출되지 않도록 하려고 한다. VPC Peering 대비 PrivateLink의 장점은?

A) Peering보다 데이터 전송 비용이 항상 더 저렴하다  
B) 제공자가 노출한 단일 서비스 엔드포인트만 보이고 나머지 VPC는 가려지며 CIDR 충돌도 없다  
C) 양방향 라우팅을 자동으로 구성해 관리가 쉽다  
D) 고객과 제공자의 CIDR이 반드시 겹쳐야 동작한다  

**정답: B**  
해설: Peering은 두 VPC의 CIDR 전체가 양방향으로 보이므로 노출 표면이 크고 CIDR이 겹치면 동작하지 않는다. PrivateLink는 제공자가 NLB로 노출한 단일 서비스만 소비자에게 보이고 나머지 제공자 VPC는 완전히 가려지며, 소비자 VPC 주소를 쓰는 ENI 방식이라 CIDR 충돌도 발생하지 않는다.

---

**문제 6.** 인터넷 경로가 전혀 없는 "zero-internet VPC"에서 EC2 인스턴스를 Systems Manager로 관리하려고 한다. 필요한 구성은?

A) NAT Gateway를 임시로 열어 SSM Agent가 통신하게 한다  
B) ssm, ssmmessages, ec2messages 등에 대한 Interface Endpoint를 생성한다  
C) S3 Gateway Endpoint만 있으면 SSM이 동작한다  
D) 인스턴스에 퍼블릭 IP를 부여한다  

**정답: B**  
해설: 인터넷 경로가 없는 VPC에서 Systems Manager를 사용하려면 SSM 관련 서비스 엔드포인트를 Interface Endpoint로 사설 연결해야 한다. 이렇게 하면 패치·세션 관리 트래픽이 AWS 백본 내부로만 흐른다. NAT를 열거나 퍼블릭 IP를 부여하는 방식은 데이터 유출 경로를 다시 만드는 것이라 격리 목표에 어긋난다.

---
