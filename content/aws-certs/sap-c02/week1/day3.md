# Day 3 - VPC의 해부학: 라우팅 테이블이 진짜로 결정하는 것

VPC가 SAA에서는 "박스 안에 박스"였다면, Pro에서는 **6개의 결정점이 동시에 작동하는 분산 시스템**이다. 패킷 하나가 EC2에서 S3까지 흘러갈 때 통과하는 결정점을 모두 적으면 다음과 같다.

```
[EC2 ENI] → [Security Group OUT] → [NACL OUT (subnet)] → [Route Table]
        → [IGW/NAT GW/VPC Endpoint] → [전송 경로]
        → [목적지의 NACL IN] → [목적지의 SG IN] → [도착]
```

이 8단계 중 어느 하나에서 막히면 패킷은 사라진다. 그런데 SG는 stateful, NACL은 stateless, Route Table은 가장 긴 prefix가 이긴다(longest prefix match) — 이 모든 규칙을 머릿속에서 동시에 굴려야 한다. 오늘은 SAA 수준의 VPC 그림을 한 번 더 펼치되, **Pro 시험의 함정이 어디서 나오는지**를 정확히 짚는다.

## CIDR 설계: 처음 한 번 잘못 그으면 평생 후회

VPC의 첫 결정은 CIDR 블록이다. AWS는 `/16` ~ `/28`을 지원하고, RFC 1918 사설 IP(10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)를 권장한다. 그런데 **이걸 잘못 그으면 1년 뒤 다른 VPC와 합칠 때 충돌**한다.

| VPC CIDR | 가용 IP 수 | 적합 규모 |
|----------|------------|-----------|
| /16 | 65,536 | 대기업 단일 리전 표준 |
| /20 | 4,096 | 중견 기업 |
| /24 | 256 | 소규모 또는 dev/test |
| /28 | 16 | 시험·실험용 |

> ⚠️ **함정**: 한 회사가 본사 VPC에 `10.0.0.0/16`을 쓰고, 해외 지사 VPC에도 `10.0.0.0/16`을 그어버린다. 나중에 Transit Gateway로 합치려는 순간 CIDR 충돌로 라우팅이 불가능해진다. AWS는 **CIDR overlap이 있으면 Peering·TGW Attach 자체를 거부**한다. 그래서 Pro 멀티 계정 시나리오에서는 처음부터 **IPAM(IP Address Manager, 2021년 출시)**으로 전사 CIDR 풀을 관리하는 게 정답이다.

> 🔍 **더 깊이**: AWS VPC에서 각 서브넷은 5개의 IP를 예약한다. 예를 들어 `10.0.1.0/24` 서브넷에서 사용 가능한 IP는 256 - 5 = 251개. 예약 IP: `10.0.1.0`(네트워크), `10.0.1.1`(VPC 라우터), `10.0.1.2`(VPC DNS), `10.0.1.3`(미래용 예약), `10.0.1.255`(브로드캐스트). 이걸 모르고 "/28 서브넷에 16개 EC2 띄울 수 있다"고 계산하면 실제로는 11개만 가능해서 의외의 실패가 난다.

### Secondary CIDR과 Egress-Only IGW

VPC는 추가로 **secondary CIDR**을 최대 4개까지 붙일 수 있다(2017년 추가). 단 secondary는 primary와 같은 RFC 1918 범위에서만 가능하고, 보통 부족해진 IP를 늘릴 때 쓴다.

IPv6는 별도 트랙이다. AWS는 모든 VPC에 `/56` IPv6 블록을 무료 할당하지만, IPv6 트래픽은 NAT Gateway를 거치지 않고 **Egress-Only Internet Gateway**를 거친다(NAT가 본래 IPv4 주소 부족 해결 메커니즘이므로 IPv6에서는 불필요).

## 서브넷의 진짜 정체: AZ 종속과 라우팅 테이블 1:1 매핑

서브넷은 **하나의 AZ에 종속**되고, 하나의 라우팅 테이블이 붙는다. 같은 라우팅 테이블을 여러 서브넷이 공유할 수는 있지만, 한 서브넷이 두 라우팅 테이블을 가질 수는 없다.

```
VPC (10.0.0.0/16)
├── ap-northeast-2a
│   ├── Public Subnet  10.0.1.0/24  → Route Table: PublicRT
│   └── Private Subnet 10.0.11.0/24 → Route Table: PrivateRT-A
├── ap-northeast-2b
│   ├── Public Subnet  10.0.2.0/24  → Route Table: PublicRT
│   └── Private Subnet 10.0.12.0/24 → Route Table: PrivateRT-B
└── ap-northeast-2c
    ├── Public Subnet  10.0.3.0/24  → Route Table: PublicRT
    └── Private Subnet 10.0.13.0/24 → Route Table: PrivateRT-C
```

Public Subnet과 Private Subnet의 구별은 콘솔에 별도 토글이 있는 게 아니라 **라우팅 테이블이 IGW로 가는지 NAT GW로 가는지**의 차이일 뿐이다.

| 종류 | 정의 | 사용처 |
|------|------|--------|
| Public | 라우팅 테이블에 `0.0.0.0/0 → IGW` | ELB, NAT GW, Bastion |
| Private | `0.0.0.0/0 → NAT GW` 또는 라우트 없음 | EC2 App, DB |
| Isolated | 외부 라우트 없음 (VPC 내부만) | 더 엄격한 DB, ML training |

> 💡 **관련 이론**: 라우팅 테이블은 **longest prefix match** 알고리즘으로 동작한다. 같은 패킷의 목적지에 두 라우트가 있으면, 더 구체적인 prefix(긴 마스크)가 이긴다. 예: `10.0.0.0/16 → VPC local` + `10.0.5.0/24 → TGW`가 있으면 `10.0.5.10`은 TGW로 간다. 이게 BGP·IS-IS 같은 인터넷 라우팅 프로토콜의 기본 원리이고, AWS 라우팅 테이블도 같은 원칙을 따른다.

### 가용 영역 단위 분리: NAT Gateway는 AZ-local

흔히 놓치는 함정. **NAT Gateway는 AZ-local 리소스**라, 한 AZ에 하나씩 두는 게 정공이다. 모든 Private Subnet을 단일 AZ의 NAT Gateway로 라우팅하면, 그 AZ가 죽을 때 모든 outbound가 끊긴다.

```
✗ 잘못된 설계:
   Private Subnet A → NAT GW (AZ-a)
   Private Subnet B → NAT GW (AZ-a)  ← AZ-a 죽으면 B도 outbound 끊김
   Private Subnet C → NAT GW (AZ-a)

✓ 올바른 설계:
   Private Subnet A → NAT GW (AZ-a)
   Private Subnet B → NAT GW (AZ-b)
   Private Subnet C → NAT GW (AZ-c)
```

> 📚 **사례**: 2017년 한 핀테크 스타트업이 production에서 단일 AZ NAT Gateway만 두고 운영하다가, 새벽에 AZ-a 정전으로 NAT Gateway가 죽으면서 모든 Private Subnet의 외부 API 호출(Stripe·Twilio 등)이 끊겼다. 같은 AZ의 EC2들도 자동 페일오버되지 못해 30분 다운타임. 이후 AZ별 NAT Gateway + Multi-AZ ASG로 전환. 운영 비용은 시간당 $0.045 × 3 AZ = $97.2/월 추가됐지만, 다운타임 비용 대비 무시할 수준.

## Security Group vs NACL: 가장 자주 헷갈리는 두 가지

| 항목 | Security Group | NACL (Network ACL) |
|------|----------------|---------------------|
| 적용 단위 | ENI (인스턴스) | 서브넷 |
| 상태 | **Stateful** (return 자동 허용) | **Stateless** (양방향 명시) |
| 평가 | 모든 규칙 평가, allow만 | 번호 순서, allow/deny |
| 기본 동작 | inbound deny, outbound allow | inbound deny, outbound deny |
| 규칙 수 | 60 inbound + 60 outbound (확장 가능) | 20 in + 20 out (소프트 제한 40까지) |

가장 자주 헷갈리는 건 **stateful vs stateless**. SG가 stateful이라는 건, inbound로 들어온 패킷의 return은 outbound 규칙을 검사하지 않고 자동 허용한다는 뜻이다. 반대로 NACL은 stateless라, return 트래픽도 명시적으로 outbound 규칙에 허용해야 한다.

```
[Client] → TCP SYN  → [EC2:80]
[Client] ← TCP SYN-ACK ← [EC2:80]   ← SG: 자동 허용, NACL: outbound 1024-65535 명시 필요
[Client] → TCP ACK  → [EC2:80]
```

> 🔍 **더 깊이**: NACL의 return port range는 **ephemeral port** 범위다. Linux는 32768~60999, Windows는 49152~65535이지만 AWS는 안전하게 **1024-65535** 전체를 권장한다. 만약 NACL outbound가 80·443만 허용되어 있다면, return SYN-ACK가 ephemeral port로 오므로 차단된다 — 이게 "SG는 멀쩡한데 패킷이 안 가는" 현상의 흔한 원인.

> 💡 **관련 이론**: stateful 방화벽은 1992년 Check Point가 FireWall-1에서 처음 상용화한 개념이다. 기존 stateless packet filter는 모든 패킷을 개별로 검사해야 했지만, stateful은 TCP 5-tuple(src IP, src port, dst IP, dst port, protocol)로 connection table을 유지해 return 패킷을 자동 매칭한다. AWS SG도 같은 원리. 단 connection table은 메모리를 쓰므로 한 EC2가 동시에 유지할 수 있는 연결 수에 한계가 있다(보통 수십만).

> 🎯 **시나리오**: "Custom AMI로 만든 EC2가 외부에서 ping이 안 된다. SG에는 ICMP All Allow가 있다. 무엇이 문제인가?" — 답은 보통 (1) NACL이 ICMP 차단, (2) OS 방화벽(iptables/firewalld)이 차단, (3) 인스턴스 메타데이터로 가는 169.254.169.254가 ICMP를 거부(보안 기능). NACL 누락이 가장 흔하다.

## VPC Endpoint: 사설 트래픽의 두 갈래

EC2에서 S3로 갈 때 기본적으로 인터넷(IGW)을 거친다. 같은 리전의 S3인데도 IGW를 거치면 (1) 비용 발생, (2) 보안 위험, (3) latency 증가. 그래서 **VPC Endpoint**로 사설 경로를 만든다.

| 종류 | 통신 방식 | 지원 서비스 | 비용 |
|------|-----------|-------------|------|
| Gateway Endpoint | 라우팅 테이블 항목 | S3, DynamoDB만 | 무료 |
| Interface Endpoint | ENI + DNS | 100+ AWS 서비스 | $0.01/시간 + 데이터 |
| Gateway Load Balancer Endpoint | GLB + ENI | 보안 어플라이언스 | $0.0125/시간 + 데이터 |

> 🔍 **더 깊이**: Gateway Endpoint는 **prefix list**라는 특수 라우팅 항목을 라우팅 테이블에 추가한다. `pl-12345`처럼 표현되며, 내부적으로 S3·DynamoDB의 모든 IP 범위를 자동 추적·업데이트한다. Interface Endpoint는 그와 달리 **PrivateLink** 메커니즘으로 ENI를 VPC에 직접 생성하고, AWS가 Route 53 Private Hosted Zone으로 DNS를 자동 hijack한다(`s3.ap-northeast-2.amazonaws.com`을 ENI IP로 응답).

> 📚 **사례**: 한 금융사가 EC2 → S3 트래픽이 모두 IGW를 통해 나가는 걸 발견했다. 월 데이터 전송 비용이 $30,000을 넘었다. Gateway Endpoint를 추가한 후 같은 트래픽이 무료가 됐다. 또한 보안팀이 "S3 트래픽이 인터넷을 거쳤다"는 이유로 PCI-DSS 감사에서 지적받던 문제도 해소됐다. 트레이드오프: Interface Endpoint(100+ 서비스)는 시간당 비용이 있어, 트래픽이 적으면 IGW + NAT가 더 저렴할 수 있다. 손익분기점은 보통 월 100-200GB.

### PrivateLink와 VPC Endpoint Service

PrivateLink는 "내가 만든 서비스를 다른 VPC에 노출"하는 기능이다. NLB 뒤에 서비스를 두고 Endpoint Service로 등록하면, 다른 계정·VPC가 Interface Endpoint로 접근할 수 있다. **SaaS 회사가 자기 서비스를 고객 VPC 안에서 사용 가능하게 만드는 표준**이다.

```
[Provider VPC]              [Consumer VPC]
  NLB → Service              Interface Endpoint
   ↑                              ↓
   └── PrivateLink ──────────────┘
```

Snowflake, Datadog, MongoDB Atlas가 모두 PrivateLink로 고객 VPC에 연결한다.

## DNS와 hostname: VPC 내부의 이름 해석

VPC는 두 가지 DNS 옵션이 있다.

- `enableDnsSupport` (기본 true): VPC 내부에서 AWS DNS 서버(`x.x.x.2`) 사용 가능
- `enableDnsHostnames` (기본 true for default VPC): EC2에 `ec2-1-2-3-4.ap-northeast-2.compute.amazonaws.com` 같은 public DNS 부여

> ⚠️ **함정**: Custom VPC를 만들 때 `enableDnsHostnames`가 기본 false다. 이걸 안 켜면 Private Hosted Zone(Route 53)이 작동하지 않거나, Interface Endpoint의 자동 DNS hijack이 작동하지 않는다. Pro 시나리오에서 "Endpoint를 만들었는데 EC2가 여전히 public DNS로 응답받는다"는 문제의 절반은 이 토글이다.

## Flow Logs: 보이지 않는 패킷을 보이게

VPC Flow Logs는 ENI를 통과하는 모든 패킷의 5-tuple과 결과(ACCEPT/REJECT)를 기록한다. CloudWatch Logs 또는 S3로 전송 가능.

```
2 123456789012 eni-abc 10.0.1.5 192.168.1.10 8080 443 6 20 4500 1612345678 1612345738 ACCEPT OK
^             ^         ^         ^            ^    ^   ^ ^  ^    ^          ^          ^      ^
version       account   src       dst          spt  dpt p pkt byte start      end       action status
```

> 🔍 **더 깊이**: Flow Logs는 **샘플링이 아니라 모든 트래픽**을 기록한다. 단 패킷 내용(payload)은 캡처하지 않고 메타데이터만. 또한 1분 단위 aggregation이라 실시간 모니터링이 아니다. 보안 사고 사후 분석·트래픽 패턴 분석에 적합. GuardDuty가 Flow Logs를 분석해 비정상 트래픽을 탐지하는 게 대표 활용.

> 🎯 **시나리오**: "한 회사가 production VPC에서 비정상적인 outbound traffic을 의심한다. 어떻게 진단할까?" — 답: Flow Logs 활성화 → Athena/CloudWatch Insights로 분석 → GuardDuty가 자동 패턴 매칭. 직접 tcpdump로 EC2에서 캡처하면 100개 인스턴스 일일이 봐야 해서 운영 부담 큼.

## SG 참조와 Cross-VPC 통신

SG의 inbound·outbound 규칙에서 source/destination을 **CIDR이 아니라 다른 SG ID**로 지정할 수 있다.

```
SG-Web (ALB가 붙음): inbound 80/443 from 0.0.0.0/0
SG-App (EC2가 붙음): inbound 8080 from sg-web   ← CIDR 대신 SG ID 참조
SG-DB  (RDS가 붙음): inbound 3306 from sg-app   ← chained SG reference
```

이 패턴이 **3-tier 아키텍처의 표준**이다. EC2가 늘어나도 SG-Web에 속한 모든 ENI가 자동으로 8080 접근 허용되므로 IP 관리가 필요 없다.

> 📚 **사례**: 한 회사가 ALB → EC2 → RDS 구조를 CIDR 기반 SG로 운영하다가, Auto Scaling으로 EC2 IP가 바뀔 때마다 SG를 업데이트해야 했다. SG ID 참조로 바꾸자 운영 부담이 사라졌다. 단 SG ID 참조는 같은 리전·같은 VPC 또는 Peered VPC 안에서만 작동하고, TGW를 거치는 경우 동작하지 않는다(2022년 일부 시나리오에서 가능해졌지만 제약 있음).

## 정리하며

VPC는 "박스 안에 박스"가 아니라 **8개 결정점의 협력**이다. 패킷 한 통이 흐르려면 SG·NACL·Route Table·IGW/NAT/Endpoint·DNS가 모두 동의해야 한다. CIDR을 처음 그을 때 IPAM으로 전사 관리, NAT GW는 AZ별로, S3·DynamoDB는 Gateway Endpoint로, 그 외 100+ 서비스는 Interface Endpoint로, SG는 ID 참조로 — 이 다섯 가지 원칙이 Pro 시험의 VPC 시나리오 80%를 커버한다.

다음 글에서는 이 네트워크 위에서 실제로 컴퓨팅을 하는 EC2·EBS·ELB·Auto Scaling을 Pro 깊이로 본다. 특히 Auto Scaling의 스케일링 정책 4종은 거의 매 회 출제되니 미리 머리에 박아두자.

---

## 📝 연습 문제

**문제 1.** 한 회사가 Multi-AZ에 Private Subnet 3개를 두고 외부 API를 호출한다. 비용을 최소화하면서 가용성을 확보하려면 NAT Gateway를 어떻게 배치하는가?

A) 단일 NAT Gateway를 AZ-a에 두고 모든 서브넷에서 사용
B) 각 AZ에 NAT Gateway 하나씩 (총 3개) + 각 Private Subnet은 자기 AZ의 NAT 사용
C) NAT Instance를 직접 운영
D) Internet Gateway로 직접 연결

**정답: B**
해설: 키워드는 "가용성 + 비용 최소화". A는 비용은 적지만 AZ 장애 시 전체 outbound 끊김. B는 시간당 $0.045 × 3 AZ = 약 $97/월 추가 비용이지만 가용성 확보. C는 운영 부담 큼. D는 Private Subnet 정의 위반. 트레이드오프: 비용을 더 줄이려면 dev 환경은 단일 NAT, production만 multi-AZ NAT.

---

**문제 2.** EC2가 같은 VPC 내 RDS에 연결되지 않는다. SG에는 RDS에서 3306 inbound 허용. 무엇을 추가로 확인해야 하는가?

A) EC2의 outbound SG 규칙
B) NACL inbound/outbound 둘 다, ephemeral port 포함
C) Route Table의 0.0.0.0/0
D) Internet Gateway 부착 여부

**정답: B**
해설: SG는 stateful이라 outbound 자동 허용되므로 A는 무관. RDS는 VPC 내부 통신이라 IGW(D)와 default route(C)는 무관. NACL은 stateless라 outbound도 명시적으로 ephemeral port(1024-65535) 허용 필요. 흔한 함정: NACL outbound가 80/443만 허용되어 있을 때 RDS return SYN-ACK가 차단.

---

**문제 3.** 한 회사가 S3 트래픽이 NAT Gateway를 거쳐 비용이 발생한다. 가장 효율적인 해결책은?

A) Interface Endpoint 추가
B) Gateway Endpoint 추가
C) VPC Peering 설정
D) S3 Transfer Acceleration 활성화

**정답: B**
해설: S3·DynamoDB는 Gateway Endpoint를 무료로 제공. Interface Endpoint(A)는 다른 서비스용이고 시간당 비용 있음. C는 VPC 간 통신용. D는 글로벌 가속이지 사설 경로가 아님. Gateway Endpoint 추가 시 Route Table에 prefix list가 자동 등록되어 S3 트래픽이 사설 경로로 전환.

---

**문제 4.** 한 SaaS가 자기 서비스를 고객 VPC 안에서 사설 IP로 사용 가능하게 하려면?

A) Cross-Region VPC Peering
B) PrivateLink + Network Load Balancer + Endpoint Service
C) Transit Gateway 공유
D) Direct Connect Public VIF

**정답: B**
해설: PrivateLink는 SaaS가 자기 NLB 뒤 서비스를 Endpoint Service로 등록하면, 고객이 Interface Endpoint로 접근하는 표준 패턴. Snowflake, MongoDB Atlas, Datadog 모두 이 방식. A·C는 양방향 라우팅이 노출되어 SaaS 모델에 부적합. D는 온프레미스용.

---

**문제 5.** 한 회사가 200개 계정 환경에서 CIDR 충돌을 방지하려고 한다. 가장 효율적인 방법은?

A) 각 팀이 자기 CIDR을 결정
B) AWS IPAM(IP Address Manager)로 전사 CIDR 풀 관리
C) Excel 시트로 CIDR 할당 관리
D) Route 53으로 CIDR 추적

**정답: B**
해설: IPAM은 2021년 출시. Organizations와 통합되어 모든 계정의 VPC CIDR을 자동 추적·할당·중복 방지. C는 수동 관리로 실수 가능. 트레이드오프: IPAM은 추가 비용(IP당 약 $0.27/달)이 있지만, 멀티 계정 환경의 CIDR 충돌 사고 비용에 비하면 무시할 수준.

---

**문제 6.** 한 회사가 production VPC의 outbound 트래픽이 의심된다. 모든 패킷을 추적·분석하려면?

A) tcpdump를 EC2에서 실행
B) VPC Flow Logs를 S3로 보내고 Athena 분석
C) GuardDuty 활성화만으로 충분
D) CloudTrail로 패킷 추적

**정답: B**
해설: Flow Logs는 모든 ENI의 5-tuple과 결과를 기록. S3 + Athena로 SQL 분석. A는 100+ 인스턴스에 일일이 적용 어려움. C는 패턴 매칭이지 raw 데이터 아님. D는 API 호출 추적이지 패킷 추적 아님.

---

**문제 7.** SG ID 참조와 CIDR 참조의 차이는?

A) SG ID 참조는 같은 VPC·Peered VPC 안에서만 작동
B) CIDR 참조가 더 빠르다
C) 차이 없음
D) SG ID 참조는 inbound에만 가능

**정답: A**
해설: SG ID 참조는 같은 리전 같은 VPC 또는 Peered VPC 안에서 작동. TGW를 거치는 경우 일부 제약 있음. CIDR보다 운영 부담이 적은 이유는 IP가 바뀌어도 SG가 동일하면 규칙이 자동 적용되기 때문. 3-tier 아키텍처의 표준 패턴.
