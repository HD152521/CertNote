# Day 6 - VPC 서브넷 라우팅: 패킷이 인터넷에 닿는 길

EC2를 하나 띄우고 SSH가 안 되는 순간이 있다. 보안 그룹도 0.0.0.0/0으로 열었는데 안 된다. 라우팅 테이블을 들여다보니 인터넷 게이트웨이로 가는 경로가 없다. 이 한 줄짜리 미스터리가 VPC를 처음 만난 모두가 겪는 통과의례다. 라우팅 한 줄이 빠진 것뿐인데 트래픽 흐름 전체가 막힌다 — 이게 SDN(Software Defined Networking) 위에 짜인 VPC가 가진 결정성의 양면이다.

VPC는 단순히 "내 가상 네트워크"가 아니다. 2009년 출시될 때 AWS는 그 전까지 EC2 인스턴스를 공용 IP만으로 제공했다(EC2-Classic). 즉 모든 인스턴스가 인터넷에 직접 노출되어 있었고, 보안 그룹만이 유일한 방어선이었다. VPC는 이 모델을 뒤집어 "기본은 격리, 명시적으로 열어야 외부 통신"이라는 방향으로 가져갔다. 2013년 12월부터는 신규 계정에 EC2-Classic이 제공되지 않았고, 2022년 EC2-Classic은 완전히 종료됐다. 오늘은 그 새로운 모델의 기초 — VPC, 서브넷, 라우팅 테이블 — 를 한 호흡으로 그린다.

## VPC: 격리된 사설 네트워크

VPC는 **계정·리전 단위로 격리된 가상 네트워크**다. 한 리전 안에 여러 VPC를 만들 수 있고, 각 VPC는 자기만의 CIDR 블록(IPv4·IPv6)을 가진다.

| 속성 | 제약 |
|------|------|
| 리전 범위 | 하나의 리전에만 존재 (여러 AZ 걸침 가능) |
| 계정 격리 | 다른 계정과 자동 통신 불가 (Peering/TGW 필요) |
| CIDR 블록 | /16 ~ /28, 기본 5개까지 추가 가능 |
| AZ 분산 | 서브넷이 AZ 단위, VPC 자체는 리전 단위 |
| 기본 한도 | 리전당 5개 VPC (증가 요청 가능) |

CIDR 블록 선정은 진짜 중요하다. 한 번 만들면 변경이 어렵고, 사내 다른 네트워크나 다른 VPC와 IP가 겹치면 Peering·TGW가 안 된다. AWS 권장은 **RFC 1918 사설 IP 대역**(`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) 안에서 **회사 전체가 IP 충돌 없도록 사전 할당표**를 만들어 쓰는 것. 100/64(`100.64.0.0/10`)은 CGNAT용으로 RFC 6598에 정의되어 있고 AWS EKS의 Pod 전용 secondary CIDR로 흔히 쓴다.

> 📚 **사례**: 2018년 한 다국적 기업이 인수합병 후 두 회사의 VPC를 통합하려 했는데 둘 다 `10.0.0.0/16`을 쓰고 있어서 Peering이 불가능했다. 결국 한 쪽 워크로드 전체를 새 CIDR로 마이그레이션하는 데 6개월이 걸렸다. **CIDR 계획은 회사 전체 차원의 IP 거버넌스**가 필요하다는 교훈. AWS는 이를 도와주는 **IPAM(IP Address Manager)** 을 2021년 출시했다. 비슷한 사례로 2019년 한 한국 대기업의 글로벌 통합 프로젝트에서, 본사 한국·중국·미국 3개 VPC가 각각 다른 `172.16.0.0/12` 서브넷을 쓰고 있어 TGW 도입 후에야 통신이 가능했다.

> 💡 **관련 이론**: RFC 1918(1996)은 사설 IP 대역을 정의한 표준. 그 전까지는 모든 IP가 공인 IP였고 인터넷 라우팅이 점점 포화 상태에 빠졌다. RFC 1918은 NAT(RFC 3022, 2001)와 함께 IPv4 고갈 시대를 30년 이상 연장시킨 결정적 표준이다. AWS VPC의 모든 사설 통신은 이 모델 위에 있다. CIDR 자체는 RFC 4632(2006)에서 정의된 표기법으로, 그 이전 클래스풀(Class A/B/C) 라우팅의 비효율을 해소했다.

## 서브넷: AZ 안의 IP 슬라이스

서브넷은 VPC의 CIDR를 더 작은 조각으로 나눈 것이고, **반드시 하나의 AZ에 묶인다**. 한 서브넷이 두 AZ를 걸칠 수 없다 — 이게 격리의 기본 단위가 AZ인 이유다. 같은 이유로 ELB는 "서브넷을 선택"하지 않고 "AZ를 선택"하는 식으로 보이지만, 내부적으로는 각 AZ에 하나씩 서브넷을 묶는다.

```
VPC: 10.0.0.0/16  (65,536 IP)
 ├── Subnet A: 10.0.1.0/24 (AZ-a, Public)   — 256 IP
 ├── Subnet B: 10.0.2.0/24 (AZ-b, Public)
 ├── Subnet C: 10.0.11.0/24 (AZ-a, Private)
 ├── Subnet D: 10.0.12.0/24 (AZ-b, Private)
 └── Subnet E: 10.0.21.0/24 (AZ-a, DB)
```

각 서브넷의 IP 중 5개는 AWS가 예약한다.

| IP | 용도 |
|----|------|
| `.0` | 네트워크 주소 |
| `.1` | VPC 라우터 |
| `.2` | DNS 서버 (`VpcCidr + 2`) |
| `.3` | 향후 사용 예약 |
| `.255` | 브로드캐스트 (사용 X) |

그래서 `/24` 서브넷은 256 - 5 = 251개 IP만 실제 할당 가능. EKS 노드가 Pod마다 ENI를 만드는 환경에서는 이 IP가 빠르게 고갈되므로 서브넷을 `/22` 같이 크게 잡거나 Custom CNI 모드(secondary CIDR + Pod 전용 서브넷)를 쓴다.

### Public vs Private 서브넷

"Public 서브넷"이라는 명시적 토글은 없다. **라우팅 테이블에 IGW로 가는 경로(`0.0.0.0/0 → igw-xxxx`)가 있으면 Public**이다. 그게 다다. 또 인스턴스에 **Public IP**(또는 EIP)가 붙어야 외부에서 들어올 수 있다.

```
Public Subnet 조건:
1. 라우팅 테이블: 0.0.0.0/0 → IGW
2. 인스턴스에 Public IP 또는 EIP
3. SG/NACL 허용
```

세 가지가 모두 만족돼야 외부와 통신. 한 가지라도 빠지면 안 된다. 트러블슈팅 시 이 3-체크리스트가 가장 빠른 진단이다.

> ⚠️ **함정**: "Public 서브넷"이라는 별도 객체가 있는 것으로 착각하기 쉬운데, AWS 콘솔 UI에 그렇게 표시될 뿐 실제로는 라우팅 테이블의 IGW 경로 + 인스턴스 Public IP 조합으로 결정된다. 시험에서는 "라우팅 테이블 변경으로 Public을 Private으로 바꾸려면?" 같은 질문이 나오고, 답은 "기본 라우트(`0.0.0.0/0`)를 NAT GW로 변경"이다.

## 라우팅 테이블: 패킷의 분기점

라우팅 테이블은 "어떤 목적지 CIDR로 가는 패킷을 어떤 게이트웨이로 보낼지" 정의하는 매핑이다. 각 서브넷은 정확히 하나의 라우팅 테이블과 연결되고, 명시 연결이 없으면 VPC의 **메인 라우팅 테이블**을 쓴다.

```
Destination          Target
10.0.0.0/16          local              ← VPC 내부 (자동, 삭제 불가)
0.0.0.0/0            igw-xxxxx          ← Public 서브넷
0.0.0.0/0            nat-xxxxx          ← Private 서브넷 (NAT 경유)
10.1.0.0/16          pcx-xxxxx          ← VPC Peering
172.16.0.0/12        tgw-xxxxx          ← Transit Gateway
0.0.0.0/0            vgw-xxxxx          ← Site-to-Site VPN
```

**Longest Prefix Match** 규칙이 적용된다. 더 구체적인(더 긴 prefix) 경로가 우선. 예를 들어 `10.0.0.0/8 → tgw-xx`와 `10.0.5.0/24 → nat-xx`가 동시에 있으면 `/24`가 이긴다.

> 🔍 **더 깊이**: Longest Prefix Match는 IP 라우팅의 보편적 알고리즘이고, 라우터 내부에서는 보통 **Patricia Trie** 또는 **Multibit Trie** 자료구조로 구현된다. AWS VPC 라우터는 SDN(Software-Defined Network) 위에서 동작하므로 물리 라우터의 TCAM 같은 하드웨어 제약은 없지만, 라우팅 테이블당 50개(증가 요청 시 1000개)의 한도가 있다. 너무 많은 prefix가 필요하면 Transit Gateway로 라우팅 도메인을 분리하거나 prefix list로 묶어 단일 항목으로 표현한다. VPC의 데이터 플레인은 AWS Nitro System 위에 분산 구현되어 있고, 각 ENI에 매핑된 라우팅 결정이 호스트 노드에서 직접 처리된다(Mapping Service라 부른다).

> 💡 **관련 이론**: VPC 라우팅은 BGP가 아니다. **정적 라우팅(Static)** 이 기본이고, Transit Gateway / Direct Connect / VPN을 통해서만 BGP가 등장한다. 정적 라우팅의 장점은 단순함과 결정성, 단점은 자동 페일오버가 안 된다는 것 — 라우팅 테이블의 NAT GW가 죽으면 패킷이 그냥 사라진다. 이게 NAT 고가용성 패턴(AZ별 NAT)이 필요한 이유다. BGP는 RFC 4271로 정의되어 있고 인터넷 라우팅의 사실상 표준 프로토콜이지만, VPC 내부에는 의도적으로 들이지 않았다 — SDN 모델에서 라우팅을 중앙 컨트롤러가 결정하기 때문이다.

> 📚 **사례**: 2020년 한 SaaS 회사가 Single-AZ NAT Gateway만 두고 운영하다가 그 AZ가 장애를 만나 모든 Private 서브넷의 outbound가 막혔다. ALB는 살아있었지만 백엔드가 외부 API(Stripe, Twilio)에 못 닿아 결제가 30분간 실패. 사후 조치로 AZ별 NAT GW + AZ별 라우팅 테이블을 표준화했다. 이 패턴이 시험에서 "NAT 고가용성"의 정답이다.

## 기본 VPC vs 직접 만든 VPC

새 AWS 계정에는 리전마다 **기본 VPC**가 자동 생성된다. 모든 AZ에 Public 서브넷이 있고, 인터넷 게이트웨이가 붙어 있고, 인스턴스가 자동으로 Public IP를 받는다. 빠른 실험엔 좋지만 운영엔 위험하다 — 모든 서브넷이 Public이므로 보안 그룹 실수가 곧바로 인터넷 노출이다.

실무 표준은 **직접 만든 VPC**를 쓰는 것이다. 기본 VPC를 삭제하거나 SCP로 사용을 금지하는 조직도 많다. Control Tower의 가드레일 중 하나가 "Disallow internet access through the default VPC"인 것도 같은 이유다.

> ⚠️ **함정**: 시험에서 "default VPC와 custom VPC의 차이"가 자주 나온다. 핵심: default VPC는 모든 서브넷이 Public, custom VPC는 명시 설정 전에는 모두 Private 격리. 또 default VPC는 한 번 삭제하면 콘솔에서 다시 못 만들고 AWS Support에 요청해야 한다.

## VPC와 IPv6

IPv6는 AWS에서 점점 표준화되고 있다. `/56` 블록을 AWS가 자동 할당하거나, 자체 BYOIP를 가져올 수 있다. IPv6는 **모든 주소가 globally unique**이므로 NAT가 필요 없다. 대신 **Egress-Only Internet Gateway**(아웃바운드만 허용하는 IGW)를 쓴다.

```
IPv4 Private:  Instance → NAT GW → IGW → Internet
IPv6:          Instance → Egress-Only IGW → Internet (역방향 차단)
```

> 🔍 **더 깊이**: NAT가 IPv6에서 사라진 건 기술적 진보가 아니라 본래 IPv6 설계 철학이다. IPv4 NAT는 주소 부족 해결책이지 보안 메커니즘이 아니다. 사람들이 "NAT가 보안"이라고 착각하는 이유는 inbound가 우연히 차단되기 때문인데, 진짜 보안은 방화벽(SG/NACL)이 담당한다. Egress-Only IGW도 결국 stateful 방화벽일 뿐이다. IPv6에서는 NAT가 안 쓰여도 같은 보안 수준을 달성한다는 게 IPv6의 핵심 설계 원칙(RFC 4864, "Local Network Protection for IPv6").

> 💡 **관련 이론**: NAT가 인터넷 아키텍처에 끼친 부작용은 1999년 RFC 2663에서 정리됐다. End-to-end 원칙(Saltzer, Reed, Clark 1984)을 깨고 양방향 통신을 비대칭으로 만들었으며, P2P 프로토콜 설계를 어렵게 했다. IPv6의 NAT 폐기는 이 원칙으로의 복귀다. 다만 운영 측면에서 IPv6 도입은 여전히 느린데, NAT를 보안 layer로 잘못 인식한 운영자가 많기 때문이다.

## CIDR 설계 패턴

AWS의 **3-Tier VPC 표준 패턴**:

```
VPC: 10.0.0.0/16

AZ-a:
  Public  10.0.0.0/24    (Bastion, ALB, NAT GW)
  Private 10.0.10.0/24   (App, ECS, Lambda VPC ENI)
  DB      10.0.20.0/24   (RDS, ElastiCache)

AZ-b:
  Public  10.0.1.0/24
  Private 10.0.11.0/24
  DB      10.0.21.0/24

AZ-c:
  Public  10.0.2.0/24
  Private 10.0.12.0/24
  DB      10.0.22.0/24
```

핵심은 **AZ 3개 이상 사용**, **계층별 서브넷 분리**, **DB 계층은 인터넷 접근 절대 차단**. 이 3-tier 패턴은 W-AF Reliability/Security Pillar의 표준 권장사항이며 거의 모든 SAA 시나리오 문제의 배경 토폴로지다.

## VPC 생성 실습

```bash
# 1) VPC 생성
aws ec2 create-vpc --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=prod}]'

# 2) 서브넷 생성 (AZ-a Public)
aws ec2 create-subnet --vpc-id vpc-xxx --cidr-block 10.0.0.0/24 \
  --availability-zone ap-northeast-2a

# 3) Internet Gateway 생성 및 attach
aws ec2 create-internet-gateway
aws ec2 attach-internet-gateway --vpc-id vpc-xxx --internet-gateway-id igw-xxx

# 4) Public Route Table 생성 + 경로 추가
aws ec2 create-route-table --vpc-id vpc-xxx
aws ec2 create-route --route-table-id rtb-xxx \
  --destination-cidr-block 0.0.0.0/0 --gateway-id igw-xxx

# 5) 서브넷 ↔ Route Table 연결
aws ec2 associate-route-table --subnet-id subnet-xxx --route-table-id rtb-xxx
```

이 5단계가 "EC2가 SSH로 접근되는" 최소 조건이다. 한 단계라도 빠지면 패킷이 막힌다. 실무에서는 이걸 CloudFormation이나 Terraform/CDK로 코드화해서 한 번에 배포한다.

## 정리하며

VPC는 격리, 서브넷은 AZ에 묶인 IP 슬라이스, 라우팅 테이블은 패킷의 분기점. Public/Private의 차이는 결국 라우팅 테이블에 IGW 경로가 있느냐 없느냐일 뿐이다. 이 한 줄이 머리에 박히면 다음 글의 NAT Gateway, Bastion Host도 자연스럽게 따라온다. 시험에서 VPC 시나리오를 풀 때는 "라우팅 테이블에 어떤 entry가 있어야 하느냐"를 먼저 떠올리고, SG·NACL은 그 다음에 보는 순서가 빠르다.

---

## 📝 연습 문제

**문제 1.** EC2를 새 서브넷에 띄웠는데 인터넷이 안 된다. SG는 모두 허용 상태다. 가장 먼저 확인할 것은?

A) IAM Role 권한
B) 라우팅 테이블의 `0.0.0.0/0 → igw-xxx` 경로와 인스턴스 Public IP 부여 여부
C) S3 Endpoint
D) DNS 서버 설정

**정답: B**
해설: Public 서브넷의 3조건(IGW 경로, Public IP, SG/NACL) 중 어디가 빠졌는지 확인. SG가 열려 있어도 라우팅이 없으면 패킷 자체가 못 나간다. 진단 순서는 항상 "라우팅 → Public IP → SG → NACL → DNS" 다섯 단계.

---

**문제 2.** `/24` 서브넷에서 실제 인스턴스에 할당 가능한 IP는?

A) 256
B) 254
C) 251
D) 255

**정답: C**
해설: 256에서 AWS 예약 5개(`.0`, `.1`, `.2`, `.3`, `.255`) 빼면 251. 일반 네트워크의 -2(네트워크/브로드캐스트)와 다르다. EKS·Fargate 같은 워크로드는 ENI를 많이 만들어서 더 큰 서브넷이 필요하다.

---

**문제 3.** VPC와 서브넷의 관계로 옳은 것은?

A) 서브넷은 여러 AZ를 걸칠 수 있다
B) VPC는 여러 리전을 걸칠 수 있다
C) 서브넷은 하나의 AZ에 묶인다
D) 같은 VPC 안 서브넷끼리는 라우팅이 안 된다

**정답: C**
해설: 서브넷=AZ가 격리 기본 단위. VPC는 리전 단위. 같은 VPC 내 서브넷은 자동 라우팅(`local`). 이 `local` 경로는 삭제 불가다 — VPC 내부 격리는 SG/NACL로만 가능.

---

**문제 4.** 라우팅 테이블에 다음 두 경로가 있다. `10.0.0.0/16 → local`, `10.0.5.0/24 → pcx-abc`. 목적지 `10.0.5.10`인 패킷은?

A) local로 간다
B) Peering Connection으로 간다
C) 드롭된다
D) IGW로 간다

**정답: B**
해설: Longest Prefix Match. `/24`가 `/16`보다 더 구체적이므로 Peering이 우선. 단 `local` 경로는 삭제 불가라 같은 VPC 내부 직접 통신도 가능. 정확히 말하면 `local` 경로의 destination에 정확히 매칭되지 않는 IP만 다른 target으로 흐른다.

---

**문제 5.** Egress-Only Internet Gateway를 쓰는 이유는?

A) IPv4 NAT 대체
B) IPv6 인스턴스의 outbound만 허용, inbound는 차단
C) VPN 게이트웨이 대체
D) S3 비공개 접근

**정답: B**
해설: IPv6는 NAT가 없으므로 outbound-only를 원할 때 EIGW가 쓰임. inbound 차단을 정책적으로 강제하는 방화벽 역할. RFC 4864의 "Local Network Protection for IPv6" 원칙이 이 시나리오의 이론적 배경.

---

**문제 6.** 회사가 인수합병 후 두 VPC를 통합하려는데 모두 `10.0.0.0/16`이다. 가장 적절한 접근은?

A) VPC Peering으로 그냥 연결
B) 한쪽 VPC를 새 CIDR로 마이그레이션 후 Peering 또는 TGW
C) Transit Gateway만 추가
D) NAT Gateway로 IP 충돌 해결

**정답: B**
해설: 겹치는 CIDR는 Peering/TGW로 라우팅 불가. IP 거버넌스 부재가 만든 비용. IPAM 도입이 사후 정답. 현실에서는 마이그레이션 비용이 너무 커서 PrivateLink로 일부 서비스만 노출하는 임시 우회를 쓰는 경우도 흔하다.

---

**문제 7.** EKS에서 Pod가 ENI를 소모해 서브넷 IP가 고갈된다. 가장 적절한 조치는?

A) 더 작은 서브넷으로 변경
B) 서브넷을 `/22` 등으로 확장하거나 Custom CNI 모드 적용
C) NAT Gateway 추가
D) EIP를 더 발급

**정답: B**
해설: EKS의 기본 VPC CNI는 Pod당 ENI Secondary IP를 쓰므로 IP 소모가 크다. 서브넷 크기를 키우거나 Pod 전용 CIDR(100.64.0.0/10 등 CGNAT)를 별도 할당하는 Custom Networking 패턴이 표준 해법. 더 큰 클러스터는 IPv6 모드(IP per Pod)나 prefix delegation으로도 해결 가능.
