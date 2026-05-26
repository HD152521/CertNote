# Day 6 - VPC 서브넷 라우팅: 패킷이 인터넷에 닿는 길

EC2를 하나 띄우고 SSH가 안 되는 순간이 있다. 보안 그룹도 0.0.0.0/0으로 열었는데 안 된다. 라우팅 테이블을 들여다보니 인터넷 게이트웨이로 가는 경로가 없다. 이 한 줄짜리 미스터리가 VPC를 처음 만난 모두가 겪는 통과의례다. 라우팅 한 줄이 빠진 것뿐인데 트래픽 흐름 전체가 막힌다 — 이게 SDN(Software Defined Networking) 위에 짜인 VPC가 가진 결정성의 양면이다. 결정적이라는 건 "예측 가능하다"는 뜻이지만, 동시에 "한 줄을 잘못 적으면 일관되게 망가진다"는 뜻이기도 하다.

VPC는 단순히 "내 가상 네트워크"가 아니다. 2009년 출시될 때 AWS는 그 전까지 EC2 인스턴스를 공용 IP만으로 제공했다(EC2-Classic). 즉 모든 인스턴스가 인터넷에 직접 노출되어 있었고, 보안 그룹만이 유일한 방어선이었다. VPC는 이 모델을 뒤집어 "기본은 격리, 명시적으로 열어야 외부 통신"이라는 방향으로 가져갔다. 2013년 12월부터는 신규 계정에 EC2-Classic이 제공되지 않았고, 2022년 EC2-Classic은 완전히 종료됐다. 이 전환은 보안 모델의 근본 변화였다 — *default deny*가 클라우드 네트워크의 기본값이 됐고, 그 패러다임이 GCP·Azure에도 그대로 이식됐다. 오늘은 그 새로운 모델의 기초 — VPC, 서브넷, 라우팅 테이블 — 를 한 호흡으로 그린다.

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

> 📚 **사례**: 2018년 한 다국적 기업이 인수합병 후 두 회사의 VPC를 통합하려 했는데 둘 다 `10.0.0.0/16`을 쓰고 있어서 Peering이 불가능했다. 결국 한 쪽 워크로드 전체를 새 CIDR로 마이그레이션하는 데 6개월이 걸렸다. **CIDR 계획은 회사 전체 차원의 IP 거버넌스**가 필요하다는 교훈. AWS는 이를 도와주는 **IPAM(IP Address Manager)** 을 2021년 출시했다. 비슷한 사례로 2019년 한 한국 대기업의 글로벌 통합 프로젝트에서, 본사 한국·중국·미국 3개 VPC가 각각 다른 `172.16.0.0/12` 서브넷을 쓰고 있어 TGW 도입 후에야 통신이 가능했다. 더 최근 사례로는 2022년 한 글로벌 SaaS 회사가 EKS 도입 시 Pod CIDR 충돌로 6개월 마이그레이션을 한 일이 있다 — 기본 VPC CNI가 노드 서브넷에서 IP를 빼다 보니 `/24` 서브넷이 60대 노드에 도달하기 전에 고갈됐다.

> 💡 **관련 이론**: RFC 1918(1996)은 사설 IP 대역을 정의한 표준. 그 전까지는 모든 IP가 공인 IP였고 인터넷 라우팅이 점점 포화 상태에 빠졌다. RFC 1918은 NAT(RFC 3022, 2001)와 함께 IPv4 고갈 시대를 30년 이상 연장시킨 결정적 표준이다. AWS VPC의 모든 사설 통신은 이 모델 위에 있다. CIDR 자체는 RFC 4632(2006)에서 정의된 표기법으로, 그 이전 클래스풀(Class A/B/C) 라우팅의 비효율을 해소했다. CIDR 표기법(`10.0.0.0/16`)은 prefix length를 비트 수로 명시함으로써 라우터의 라우팅 테이블 크기를 절반 이상 줄였고, 이게 1990년대 후반 인터넷이 폭증하는 동안 IPv4 라우팅 테이블이 폭증하지 않게 막은 결정적 발명이다.

> 🔍 **더 깊이**: VPC CIDR 설계는 사실 "현재 워크로드 + 향후 5년 확장 + 다른 회사 인수 가능성"을 모두 고려해야 한다. 큰 조직은 `10.0.0.0/8` 전체를 4비트씩 쪼개서 리전·환경·팀에 할당하는 *hierarchical IPAM* 방식을 쓴다. 예: `10.0.0.0/12` = us-east-1, `10.16.0.0/12` = eu-west-1, 각 리전 안에서 다시 `/16`을 환경별로 할당. 이렇게 하면 라우팅 테이블에 prefix를 적게 적어도 되고(요약 가능), 신규 VPC 발급 시 IP 충돌이 자동으로 회피된다. AWS IPAM은 이 hierarchical 모델을 자동화한다.

> ⚠️ **함정**: VPC CIDR는 한 번 만들면 *축소 불가*. *확장*은 secondary CIDR로 4개까지 추가 가능하지만 primary는 못 바꾼다. 그래서 처음에 `/16`(65,536 IP)을 잡는 게 표준이고, `/24` 같은 작은 VPC는 EKS 도입하면 곧 후회한다. 또 `198.18.0.0/15`(RFC 2544 벤치마크용)와 `169.254.0.0/16`(링크로컬)은 AWS가 내부적으로 쓰므로 VPC CIDR로 못 쓴다.

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

> 🔍 **더 깊이**: `.2`가 VPC DNS resolver인 게 시험에 자주 나오는데, 정확히는 `VpcCidr.AmazonProvidedDNS`(예: `10.0.0.2`)다. 이 DNS resolver는 동시에 169.254.169.253(링크로컬 IP)으로도 접근 가능하고, 둘은 같은 백엔드를 가리킨다. Route 53 Resolver Inbound/Outbound Endpoint를 만들면 이 resolver를 온프레미스 DNS와 양방향으로 전달할 수 있다. 그리고 `.3`이 "향후 사용 예약"이라는 게 거의 10년째 같은 상태인데, 사실 AWS가 향후 IPv4 멀티캐스트 같은 기능을 도입할 여지를 남긴 것으로 알려져 있다.

> 💡 **관련 이론**: 서브넷 마스크 산술은 1985년 RFC 950에서 처음 정의됐고, 1993년 RFC 1519의 CIDR(Classless Inter-Domain Routing)에서 가변 길이 prefix로 발전했다. AWS VPC의 서브넷 분할은 이 표준을 그대로 따른다. 서브넷 크기 계산은 `2^(32-prefix) - 5`(AWS 예약 5개)로 외워두면 시험에서 빠르다. `/28`=11, `/27`=27, `/26`=59, `/25`=123, `/24`=251, `/23`=507, `/22`=1019, `/21`=2043, `/20`=4091, `/16`=65,531.

### Public vs Private 서브넷

"Public 서브넷"이라는 명시적 토글은 없다. **라우팅 테이블에 IGW로 가는 경로(`0.0.0.0/0 → igw-xxxx`)가 있으면 Public**이다. 그게 다다. 또 인스턴스에 **Public IP**(또는 EIP)가 붙어야 외부에서 들어올 수 있다.

```
Public Subnet 조건:
1. 라우팅 테이블: 0.0.0.0/0 → IGW
2. 인스턴스에 Public IP 또는 EIP
3. SG/NACL 허용
```

세 가지가 모두 만족돼야 외부와 통신. 한 가지라도 빠지면 안 된다. 트러블슈팅 시 이 3-체크리스트가 가장 빠른 진단이다.

> ⚠️ **함정**: "Public 서브넷"이라는 별도 객체가 있는 것으로 착각하기 쉬운데, AWS 콘솔 UI에 그렇게 표시될 뿐 실제로는 라우팅 테이블의 IGW 경로 + 인스턴스 Public IP 조합으로 결정된다. 시험에서는 "라우팅 테이블 변경으로 Public을 Private으로 바꾸려면?" 같은 질문이 나오고, 답은 "기본 라우트(`0.0.0.0/0`)를 NAT GW로 변경"이다. 다만 이미 띄운 인스턴스의 Public IP는 변경되지 않으므로, 진짜 격리하려면 EIP 해제 + Auto-assign Public IP 끄기까지 해야 한다.

> 📚 **사례**: 2020년 한 미국 SaaS 회사가 "Private 서브넷"이라고 이름 붙은 서브넷에 운영 DB를 두고 안전하다고 믿었는데, 알고 보니 라우팅 테이블에 IGW 경로가 들어있어 사실상 Public이었다. 인스턴스에 Public IP 자동 할당이 꺼져 있어서 외부에서 직접 보이진 않았지만, 한 임시 EC2가 디버깅 중 자동 Public IP를 받으면서 외부 노출 5분이 발생했다. **이름이 아니라 라우팅 테이블이 진실**이라는 교훈. AWS Config Rule `subnet-auto-assign-public-ip-disabled`가 이런 실수를 자동 감지한다.

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

> 🔍 **더 깊이**: Longest Prefix Match는 IP 라우팅의 보편적 알고리즘이고, 라우터 내부에서는 보통 **Patricia Trie** 또는 **Multibit Trie** 자료구조로 구현된다. AWS VPC 라우터는 SDN(Software-Defined Network) 위에서 동작하므로 물리 라우터의 TCAM 같은 하드웨어 제약은 없지만, 라우팅 테이블당 50개(증가 요청 시 1000개)의 한도가 있다. 너무 많은 prefix가 필요하면 Transit Gateway로 라우팅 도메인을 분리하거나 prefix list로 묶어 단일 항목으로 표현한다. VPC의 데이터 플레인은 AWS Nitro System 위에 분산 구현되어 있고, 각 ENI에 매핑된 라우팅 결정이 호스트 노드에서 직접 처리된다(Mapping Service라 부른다). 이 Mapping Service는 2017년 SIGCOMM 논문 "A retrospective on the design of Amazon's Virtual Private Cloud"에서 그 일부가 공개됐고, AWS가 어떻게 수십만 개의 VPC를 단일 물리 네트워크 위에 올리는지를 보여준다.

> 💡 **관련 이론**: VPC 라우팅은 BGP가 아니다. **정적 라우팅(Static)** 이 기본이고, Transit Gateway / Direct Connect / VPN을 통해서만 BGP가 등장한다. 정적 라우팅의 장점은 단순함과 결정성, 단점은 자동 페일오버가 안 된다는 것 — 라우팅 테이블의 NAT GW가 죽으면 패킷이 그냥 사라진다. 이게 NAT 고가용성 패턴(AZ별 NAT)이 필요한 이유다. BGP는 RFC 4271로 정의되어 있고 인터넷 라우팅의 사실상 표준 프로토콜이지만, VPC 내부에는 의도적으로 들이지 않았다 — SDN 모델에서 라우팅을 중앙 컨트롤러가 결정하기 때문이다. GCP의 VPC도 비슷하게 글로벌 컨트롤 플레인이 라우팅을 결정하고, Azure VNet은 더 전통적인 라우팅 테이블 모델을 쓴다.

> 📚 **사례**: 2020년 한 SaaS 회사가 Single-AZ NAT Gateway만 두고 운영하다가 그 AZ가 장애를 만나 모든 Private 서브넷의 outbound가 막혔다. ALB는 살아있었지만 백엔드가 외부 API(Stripe, Twilio)에 못 닿아 결제가 30분간 실패. 사후 조치로 AZ별 NAT GW + AZ별 라우팅 테이블을 표준화했다. 이 패턴이 시험에서 "NAT 고가용성"의 정답이다. 또 2021년 Fastly CDN 장애로 글로벌 인터넷의 큰 부분이 1시간 영향받은 사건은 BGP가 아닌 *VCL 설정 파일의 한 줄*이 원인이었는데, "라우팅·설정의 결정성"이 양날의 검이라는 걸 다시 보여준다.

> ⚠️ **함정**: `local` 경로는 삭제 불가이고 우선순위가 *항상 최고*다. 즉 VPC CIDR 안의 IP는 다른 어떤 target으로도 우회할 수 없다. 그래서 같은 VPC 안에 있지만 격리하고 싶은 워크로드는 별도 VPC로 쪼개거나 SG/NACL로 차단해야 한다. 같은 이유로 PrivateLink endpoint도 VPC CIDR 안의 IP를 가지면 라우팅이 꼬일 수 있어, AWS가 endpoint 생성 시 충돌 검사를 한다.

## 기본 VPC vs 직접 만든 VPC

새 AWS 계정에는 리전마다 **기본 VPC**가 자동 생성된다. 모든 AZ에 Public 서브넷이 있고, 인터넷 게이트웨이가 붙어 있고, 인스턴스가 자동으로 Public IP를 받는다. 빠른 실험엔 좋지만 운영엔 위험하다 — 모든 서브넷이 Public이므로 보안 그룹 실수가 곧바로 인터넷 노출이다.

실무 표준은 **직접 만든 VPC**를 쓰는 것이다. 기본 VPC를 삭제하거나 SCP로 사용을 금지하는 조직도 많다. Control Tower의 가드레일 중 하나가 "Disallow internet access through the default VPC"인 것도 같은 이유다.

> ⚠️ **함정**: 시험에서 "default VPC와 custom VPC의 차이"가 자주 나온다. 핵심: default VPC는 모든 서브넷이 Public, custom VPC는 명시 설정 전에는 모두 Private 격리. 또 default VPC는 한 번 삭제하면 콘솔에서 다시 못 만들고 AWS Support에 요청해야 한다. AWS CLI로도 못 재생성하고, `aws ec2 create-default-vpc`는 한정된 조건에서만 동작한다.

> 📚 **사례**: 2019년 한 스타트업이 기본 VPC에서 운영하던 API 서버의 SG에서 실수로 `0.0.0.0/0`로 22 포트를 열었다가 5분 만에 스캐닝 봇에 감지되어 brute-force SSH 공격을 받았다. 운영 환경 첫 30분 안에 사건이 터졌고, 사후 분석에서 "기본 VPC를 쓰지 말았어야 했다"가 결론. 같은 사고가 GCP·Azure에서도 default VPC/VNet에서 반복적으로 발생한다.

## VPC와 IPv6

IPv6는 AWS에서 점점 표준화되고 있다. `/56` 블록을 AWS가 자동 할당하거나, 자체 BYOIP를 가져올 수 있다. IPv6는 **모든 주소가 globally unique**이므로 NAT가 필요 없다. 대신 **Egress-Only Internet Gateway**(아웃바운드만 허용하는 IGW)를 쓴다.

```
IPv4 Private:  Instance → NAT GW → IGW → Internet
IPv6:          Instance → Egress-Only IGW → Internet (역방향 차단)
```

> 🔍 **더 깊이**: NAT가 IPv6에서 사라진 건 기술적 진보가 아니라 본래 IPv6 설계 철학이다. IPv4 NAT는 주소 부족 해결책이지 보안 메커니즘이 아니다. 사람들이 "NAT가 보안"이라고 착각하는 이유는 inbound가 우연히 차단되기 때문인데, 진짜 보안은 방화벽(SG/NACL)이 담당한다. Egress-Only IGW도 결국 stateful 방화벽일 뿐이다. IPv6에서는 NAT가 안 쓰여도 같은 보안 수준을 달성한다는 게 IPv6의 핵심 설계 원칙(RFC 4864, "Local Network Protection for IPv6"). 다만 운영자가 IPv6 주소를 정적으로 관리하기 어렵다는 점에서 IPv6 NPT(Network Prefix Translation, RFC 6296)가 제안됐지만 AWS는 도입하지 않았다.

> 💡 **관련 이론**: NAT가 인터넷 아키텍처에 끼친 부작용은 1999년 RFC 2663에서 정리됐다. End-to-end 원칙(Saltzer, Reed, Clark 1984)을 깨고 양방향 통신을 비대칭으로 만들었으며, P2P 프로토콜 설계를 어렵게 했다. IPv6의 NAT 폐기는 이 원칙으로의 복귀다. 다만 운영 측면에서 IPv6 도입은 여전히 느린데, NAT를 보안 layer로 잘못 인식한 운영자가 많기 때문이다. 2023년 기준 글로벌 IPv6 도입률은 약 45%(Google 통계), AWS 내부 워크로드 중 IPv6 사용 비율은 약 20% 수준으로 추정된다. 2024년부터 AWS는 신규 Public IPv4 주소에 시간당 $0.005 과금을 시작했고, 이게 IPv6 도입을 가속하는 경제적 압박이 되고 있다.

> ⚠️ **함정**: IPv6 only 서브넷은 *AWS 자체 서비스 일부와 호환되지 않는다*. RDS는 2024년에야 IPv6 endpoint를 지원하기 시작했고, 일부 third-party SaaS는 아직 IPv6 endpoint가 없다. 그래서 현실은 *dual-stack*(IPv4 + IPv6)으로 운영하면서 점진 마이그레이션하는 게 표준이다. AWS 권장도 dual-stack부터 시작.

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

핵심은 **AZ 3개 이상 사용**, **계층별 서브넷 분리**, **DB 계층은 인터넷 접근 절대 차단**. 이 3-tier 패턴은 W-AF Reliability/Security Pillar의 표준 권장사항이며 거의 모든 SAA 시나리오 문제의 배경 토폴로지다. 더 큰 조직은 4-tier(Public / App / Data / Management)로 확장하기도 한다.

> 🔍 **더 깊이**: 3-tier 아키텍처 자체는 1990년대 후반 *Multi-tier Application Architecture*에서 유래했다. Presentation(웹) / Application(비즈니스 로직) / Data 세 계층을 물리적으로 분리해서 각 계층의 확장과 보안을 독립시키는 모델. AWS VPC 서브넷 설계는 이 아키텍처를 그대로 네트워크 격리로 옮긴 것이다. 같은 모델이 Kubernetes에서는 NetworkPolicy로, 서비스 메시(Istio, Linkerd)에서는 mTLS + AuthorizationPolicy로 표현된다. 클라우드 네이티브 환경에서는 *namespace per environment + NetworkPolicy*가 같은 격리를 더 세밀하게 구현한다.

> 💡 **관련 이론**: 이 패턴은 *Defense in Depth*(심층 방어, NSA Information Assurance)의 직접 구현이다. 외부 → ALB → App → DB로 한 계층을 뚫어도 다음 계층에서 막힌다. 같은 원칙이 *Bell-LaPadula Model*(군사 보안, 1973)의 "No read up, no write down"과 닿아 있다. 클라우드에서는 외부 인터넷 → Public(L7 방화벽) → Private(앱) → DB의 한 방향만 허용하고, DB에서 Public 인터넷으로 직접 나가지 못하게 막는다(예: NACL outbound 차단).

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

이 5단계가 "EC2가 SSH로 접근되는" 최소 조건이다. 한 단계라도 빠지면 패킷이 막힌다. 실무에서는 이걸 CloudFormation이나 Terraform/CDK로 코드화해서 한 번에 배포한다. 또한 모든 단계가 idempotent하지 않으므로(예: 이미 attached인 IGW를 다시 attach하면 에러), 운영 환경에서는 항상 IaC를 통해 상태 관리해야 한다.

## 정리하며

VPC는 격리, 서브넷은 AZ에 묶인 IP 슬라이스, 라우팅 테이블은 패킷의 분기점. Public/Private의 차이는 결국 라우팅 테이블에 IGW 경로가 있느냐 없느냐일 뿐이다. 이 한 줄이 머리에 박히면 다음 글의 NAT Gateway, Bastion Host도 자연스럽게 따라온다. 시험에서 VPC 시나리오를 풀 때는 "라우팅 테이블에 어떤 entry가 있어야 하느냐"를 먼저 떠올리고, SG·NACL은 그 다음에 보는 순서가 빠르다. 이 라우팅 우선 사고법은 실무 트러블슈팅에서도 가장 빠른 진단 경로다 — "패킷이 어디서 멈췄나"를 추적할 때 라우팅 → 게이트웨이 → NACL → SG → 인스턴스 OS 방화벽 순서로 보면 95%의 케이스가 5분 안에 해결된다.

---

## 📝 연습 문제

**문제 1.** EC2를 새 서브넷에 띄웠는데 인터넷이 안 된다. SG는 모두 허용 상태다. 가장 먼저 확인할 것은?

A) IAM Role 권한
B) 라우팅 테이블의 `0.0.0.0/0 → igw-xxx` 경로와 인스턴스 Public IP 부여 여부
C) S3 Endpoint
D) DNS 서버 설정

**정답: B**
해설: Public 서브넷의 3조건(IGW 경로, Public IP, SG/NACL) 중 어디가 빠졌는지 확인. SG가 열려 있어도 라우팅이 없으면 패킷 자체가 못 나간다. 진단 순서는 항상 "라우팅 → Public IP → SG → NACL → DNS" 다섯 단계. VPC Reachability Analyzer를 쓰면 이 진단을 자동으로 한다.

---

**문제 2.** `/24` 서브넷에서 실제 인스턴스에 할당 가능한 IP는?

A) 256
B) 254
C) 251
D) 255

**정답: C**
해설: 256에서 AWS 예약 5개(`.0`, `.1`, `.2`, `.3`, `.255`) 빼면 251. 일반 네트워크의 -2(네트워크/브로드캐스트)와 다르다. EKS·Fargate 같은 워크로드는 ENI를 많이 만들어서 더 큰 서브넷이 필요하다. 외워두면 좋은 수치: `/28`=11, `/27`=27, `/26`=59, `/25`=123, `/24`=251.

---

**문제 3.** VPC와 서브넷의 관계로 옳은 것은?

A) 서브넷은 여러 AZ를 걸칠 수 있다
B) VPC는 여러 리전을 걸칠 수 있다
C) 서브넷은 하나의 AZ에 묶인다
D) 같은 VPC 안 서브넷끼리는 라우팅이 안 된다

**정답: C**
해설: 서브넷=AZ가 격리 기본 단위. VPC는 리전 단위. 같은 VPC 내 서브넷은 자동 라우팅(`local`). 이 `local` 경로는 삭제 불가다 — VPC 내부 격리는 SG/NACL로만 가능. 그래서 "같은 VPC 안에서 두 서브넷을 완전히 격리"하는 건 라우팅으로는 불가능하고 SG/NACL 또는 별도 VPC 분리가 필요하다.

---

**문제 4.** 라우팅 테이블에 다음 두 경로가 있다. `10.0.0.0/16 → local`, `10.0.5.0/24 → pcx-abc`. 목적지 `10.0.5.10`인 패킷은?

A) local로 간다
B) Peering Connection으로 간다
C) 드롭된다
D) IGW로 간다

**정답: A**
해설: 함정 문제다. 이론적으로 LPM에 따르면 `/24`가 이겨야 하지만, **VPC 내부 CIDR(`local`)는 항상 우선**이다. `10.0.5.0/24`가 VPC CIDR(`10.0.0.0/16`) 안에 있으면 `local`이 이긴다. 그래서 같은 VPC 안의 IP를 다른 target으로 우회할 수 없다. 이게 바로 "같은 VPC 안 격리는 라우팅이 아니라 SG/NACL로"인 이유. 만약 `pcx-abc`의 destination이 VPC CIDR 밖이라면 그제야 LPM이 적용된다.

---

**문제 5.** Egress-Only Internet Gateway를 쓰는 이유는?

A) IPv4 NAT 대체
B) IPv6 인스턴스의 outbound만 허용, inbound는 차단
C) VPN 게이트웨이 대체
D) S3 비공개 접근

**정답: B**
해설: IPv6는 NAT가 없으므로 outbound-only를 원할 때 EIGW가 쓰임. inbound 차단을 정책적으로 강제하는 방화벽 역할. RFC 4864의 "Local Network Protection for IPv6" 원칙이 이 시나리오의 이론적 배경. IPv4 인스턴스에는 EIGW가 적용되지 않으므로 NAT GW를 그대로 써야 한다.

---

**문제 6.** 회사가 인수합병 후 두 VPC를 통합하려는데 모두 `10.0.0.0/16`이다. 가장 적절한 접근은?

A) VPC Peering으로 그냥 연결
B) 한쪽 VPC를 새 CIDR로 마이그레이션 후 Peering 또는 TGW
C) Transit Gateway만 추가
D) NAT Gateway로 IP 충돌 해결

**정답: B**
해설: 겹치는 CIDR는 Peering/TGW로 라우팅 불가. IP 거버넌스 부재가 만든 비용. IPAM 도입이 사후 정답. 현실에서는 마이그레이션 비용이 너무 커서 PrivateLink로 일부 서비스만 노출하는 임시 우회를 쓰는 경우도 흔하다. 또 다른 우회는 NAT 인스턴스를 중간에 두고 SNAT로 CIDR를 위장하는 방식이지만 운영이 복잡해서 잘 안 쓴다.

---

**문제 7.** EKS에서 Pod가 ENI를 소모해 서브넷 IP가 고갈된다. 가장 적절한 조치는?

A) 더 작은 서브넷으로 변경
B) 서브넷을 `/22` 등으로 확장하거나 Custom CNI 모드 적용
C) NAT Gateway 추가
D) EIP를 더 발급

**정답: B**
해설: EKS의 기본 VPC CNI는 Pod당 ENI Secondary IP를 쓰므로 IP 소모가 크다. 서브넷 크기를 키우거나 Pod 전용 CIDR(100.64.0.0/10 등 CGNAT)를 별도 할당하는 Custom Networking 패턴이 표준 해법. 더 큰 클러스터는 IPv6 모드(IP per Pod)나 prefix delegation으로도 해결 가능. 2021년 출시된 *prefix delegation* 기능은 ENI당 IP가 아니라 `/28` prefix를 할당받아 노드 한 대당 사용 가능한 Pod IP 수를 16배 늘린다.
