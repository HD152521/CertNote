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

> 🎯 **시나리오**: "민감 데이터가 담긴 S3 버킷이 있다. 직원이 노트북에서 직접, 혹은 침해된 외부 호스트에서 이 버킷에 접근하는 것을 완전히 막고, 오직 사내 VPC를 거친 요청만 허용하고 싶다." — 답: (1) Gateway Endpoint 생성, (2) **버킷 정책**에 `"Condition": {"StringEquals": {"aws:SourceVpce": "vpce-xxxx"}}`로 그 엔드포인트 경유만 허용, (3) `aws:SourceVpc`나 `aws:PrincipalOrgID`도 추가. 이러면 콘솔·CLI로 인터넷에서 직접 접근하면 AccessDenied. 데이터가 네트워크 경계 안에 갇힌다.

> ⚠️ **함정**: 버킷 정책에 `aws:SourceVpce`만 걸면 **그 외 모든 접근을 막아버려** CloudFront·다른 서비스 연동까지 끊길 수 있다. 또 VPC Endpoint 정책과 버킷 정책, IAM 정책은 **AND로 평가**된다 — 셋 중 하나라도 거부하면 거부, 모두 허용해야 허용. 그래서 엔드포인트 정책을 너무 좁히면 정상 트래픽까지 끊기는 사고가 잦다. 엔드포인트 정책의 기본값은 "전체 허용(full access)"이고, 좁힐 때는 단계적으로 검증한다.

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

## 정리하며

핵심은 셋이다. 첫째, **Gateway Endpoint는 S3·DynamoDB 전용(무료, 라우팅 기반)**이고 나머지는 모두 **Interface Endpoint(PrivateLink, ENI 기반, 유료)**다. 둘째, 엔드포인트 정책과 버킷 정책의 `aws:SourceVpce` 조건으로 **데이터 경계**를 만들어 인터넷·외부 계정의 직접 접근을 차단한다 — 침해 자격증명으로도 데이터를 빼낼 길을 없앤다. 셋째, **PrivateLink는 Peering보다 노출 표면이 작아** SaaS·계정 간 연결의 표준이다.

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
