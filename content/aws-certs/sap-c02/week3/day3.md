# Day 3 - Site-to-Site VPN과 Client VPN: IPsec 터널의 모든 것

인터넷 위에 암호화 터널을 올리는 VPN은 1990년대 후반부터 기업 네트워킹의 핵심이었다. AWS가 2011년 Site-to-Site VPN을 출시했을 때 대부분의 기업은 이미 IPsec 기반 VPN에 익숙했다. 그러나 AWS의 VPN은 단순한 IP 터널 그 이상이다. TGW와 결합한 ECMP로 대역폭을 선형으로 확장하고, Global Accelerator와 연동해 전 세계 어디서든 낮은 지연을 보장하며, BGP로 온프레미스 라우팅 변경을 자동으로 반영한다. 오늘은 Site-to-Site VPN의 내부 동작 원리부터 ECMP를 활용한 대역폭 확장, Accelerated VPN, Client VPN의 인증 흐름까지 SAP-C02 수준의 깊이로 다룬다.

## IPsec의 구조: VPN의 기반 기술

AWS Site-to-Site VPN은 IPsec(IP Security) 프로토콜을 기반으로 한다. IPsec은 RFC 4301이 정의하는 L3 보안 프로토콜 스위트로, 두 가지 핵심 구성 요소가 있다.

**AH(Authentication Header, RFC 4302)**: 패킷의 무결성과 인증을 보장하지만 암호화는 하지 않는다. 패킷 내용이 변조되지 않았음을 보장하지만 내용은 평문이다.

**ESP(Encapsulating Security Payload, RFC 4303)**: 패킷을 암호화하고 무결성을 보장한다. AWS VPN은 ESP를 사용한다.

IPsec은 두 가지 모드로 동작한다. **Transport Mode**는 원본 IP 헤더를 유지하고 페이로드만 암호화한다. **Tunnel Mode**는 원본 IP 패킷 전체를 암호화하고 새로운 IP 헤더로 캡슐화한다. AWS Site-to-Site VPN은 항상 **Tunnel Mode**를 사용한다.

> 💡 **관련 이론**: IPsec에서 보안 연결을 수립하는 프로토콜이 IKE(Internet Key Exchange)다. IKEv1(RFC 2409)은 두 단계(Phase 1: 보안 채널 수립, Phase 2: IPsec SA 협상)로 구성되고, IKEv2(RFC 7296)는 이를 단순화하고 NAT Traversal, 재인증, MOBIKE 같은 기능을 추가했다. AWS VPN은 IKEv1과 IKEv2를 모두 지원하지만, **IKEv2를 권장**한다. IKEv2는 핸드쉐이크 메시지 수가 적어 터널 수립이 빠르고, Dead Peer Detection(DPD)이 기본 내장되어 있어 장애 감지가 신뢰성 있다.

## AWS Site-to-Site VPN 아키텍처

AWS Site-to-Site VPN은 Customer Gateway(CGW, 온프레미스 라우터)와 AWS VPN 엔드포인트 사이에 **항상 2개의 IPsec 터널**을 자동으로 생성한다. 두 터널은 서로 다른 AZ에 있는 AWS VPN 엔드포인트와 연결되어 AWS 측의 단일 AZ 장애를 방어한다.

```
[온프레미스 CGW]
       │
       ├── IPsec Tunnel 1 (IKEv2) ──── AWS VPN Endpoint 1 (AZ-a) ──┐
       │   (169.254.10.0/30 링크 넷)                                 │
       │                                                             ├── VGW 또는 TGW
       └── IPsec Tunnel 2 (IKEv2) ──── AWS VPN Endpoint 2 (AZ-b) ──┘
           (169.254.11.0/30 링크 넷)

각 터널: 최대 1.25Gbps 처리량
```

두 터널은 동시에 활성 상태로 유지될 수 있다. BGP를 사용하면 두 터널에서 동일한 경로를 광고하고 트래픽을 나눌 수 있다(Active-Active). Static Route를 사용하면 AWS가 한 터널을 기본으로 선택하고 다른 터널은 백업으로 둔다(Active-Passive).

> 🔍 **더 깊이**: AWS VPN의 터널 내부 IP(Inside CIDR)는 169.254.0.0/16 범위에서 할당된다. 이는 링크-로컬 주소(RFC 3927)로 인터넷 라우팅이 불가능하다. BGP 세션은 이 링크-로컬 주소 사이에서 맺어진다. AWS VPN에서 사용 가능한 Inside CIDR은 169.254.0.0/30 ~ 169.254.255.252/30 범위에서 AWS가 예약한 일부 서브넷을 제외한 범위다. 기업이 여러 VPN 연결을 관리할 때 Inside CIDR 충돌이 발생하지 않도록 체계적으로 할당해야 한다.

## Static vs BGP: 시험이 원하는 답

AWS Site-to-Site VPN은 정적 라우팅과 BGP 동적 라우팅을 모두 지원한다.

**정적 라우팅**: 온프레미스 CIDR을 AWS 콘솔에 수동으로 입력하고, 온프레미스 라우터에도 VPC CIDR로 향하는 정적 라우트를 수동으로 설정한다. 온프레미스 네트워크가 변경되면 양쪽 모두 수동으로 업데이트해야 한다. 터널 장애 시 자동 페일오버가 없다.

**BGP 동적 라우팅**: 온프레미스 라우터와 AWS VPN 엔드포인트 사이에 eBGP 세션을 수립한다. 온프레미스가 자신의 CIDR을 BGP로 광고하고, AWS는 VPC CIDR을 광고한다. 온프레미스 네트워크 변경이 자동으로 반영된다. 터널 장애 시 BGP가 대안 경로를 자동으로 선택한다.

> ⚠️ **함정**: BGP를 사용해도 두 터널이 자동으로 Active-Active ECMP가 되는 것은 아니다. VGW에 연결된 VPN은 두 터널 중 하나만 활성(Active-Passive)으로 동작한다. **TGW에 연결하고 ECMP를 명시적으로 활성화**해야 두 터널이 동시에 활성으로 트래픽을 분담한다. SAP-C02에서 "대역폭을 늘려야 한다"는 시나리오에서 VGW를 TGW로 교체하는 것이 정답인 경우가 있다.

SAP-C02에서 BGP가 거의 항상 정답이다. "페일오버 자동화", "라우트 변경 자동 반영", "동적 라우팅" 키워드가 있으면 BGP다.

## TGW + ECMP: VPN 대역폭의 선형 확장

단일 VPN 연결의 최대 대역폭은 2개 터널 × 1.25Gbps = 2.5Gbps다. 이것으로도 부족하다면 TGW의 ECMP 기능을 활용한다.

ECMP(Equal-Cost Multi-Path)는 동일한 목적지로 향하는 여러 경로가 있을 때 트래픽을 분산하는 기법이다. TGW에서 ECMP를 활성화하고 같은 BGP ASN을 사용하는 여러 VPN 연결을 추가하면, 각 VPN 연결의 터널들이 ECMP 그룹에 포함되어 트래픽이 분산된다.

```
온프레미스 Router-A ─── VPN Connection 1 (Tunnel 1, Tunnel 2) ──┐
온프레미스 Router-B ─── VPN Connection 2 (Tunnel 1, Tunnel 2) ──┤
온프레미스 Router-C ─── VPN Connection 3 (Tunnel 1, Tunnel 2) ──┼── TGW (ECMP)
온프레미스 Router-D ─── VPN Connection 4 (Tunnel 1, Tunnel 2) ──┘

이론적 최대: 4 연결 × 2 터널 × 1.25Gbps = 10Gbps
실제 활용 가능: 약 8~10Gbps (ECMP 해시 불균등 감안)
```

> 💡 **관련 이론**: ECMP의 트래픽 분산은 **플로우 해시(Flow Hash)** 기반이다. 소스 IP, 목적지 IP, 소스 포트, 목적지 포트, 프로토콜의 조합으로 해시 값을 계산하고, 이 값으로 경로를 선택한다. 동일한 플로우(같은 5-tuple)는 항상 같은 경로를 사용하므로 패킷 순서가 보장된다. 단, 플로우 수가 적은 경우(예: 단일 FTP 전송) ECMP의 효과가 미미하다. 이는 ECMP의 근본적 한계로, RFC 2992가 이를 다룬다.

> 🎯 **시나리오**: 미디어 스트리밍 회사가 온프레미스 렌더링 팜에서 AWS의 S3로 매일 밤 100GB의 렌더링 결과물을 전송한다. 현재 1개 VPN 연결로 최대 2.5Gbps를 사용하지만 전송 시간이 너무 길다. DX는 프로비저닝에 몇 달이 걸린다. 즉시 해결책은 TGW로 마이그레이션하고 VPN 연결 4개를 ECMP로 구성해 이론상 10Gbps까지 확장하는 것이다. 비용은 VPN 연결 4개 시간당 요금이 추가되지만 DX 구축 기간보다 훨씬 빠르다.

## Accelerated Site-to-Site VPN: 글로벌 백본 활용

일반 Site-to-Site VPN은 온프레미스 라우터에서 인터넷을 통해 AWS VPN 엔드포인트까지 공개 인터넷 경로를 이용한다. 한국에서 us-east-1의 VPN 엔드포인트까지 수많은 ISP 홉을 거치면 지연시간이 불안정해진다.

**Accelerated Site-to-Site VPN**은 AWS Global Accelerator의 Anycast IP를 VPN 터널의 AWS 측 엔드포인트로 사용한다. 온프레미스에서 인터넷으로 나가는 트래픽이 가장 가까운 AWS 에지 로케이션에 도달하는 순간 AWS 글로벌 백본으로 진입한다. 이후 AWS 백본을 통해 목적지 리전의 TGW로 전달된다.

```
[한국 온프레미스] ──인터넷~~ [서울 AWS 엣지] ──AWS 백본── [us-east-1 TGW]
                  (홉 적음)  (바로 백본 진입)  (안정적 저지연)

일반 VPN:
[한국 온프레미스] ~~인터넷~~ 수많은 ISP 홉 ~~ [us-east-1 VPN 엔드포인트]
                  (홉 많고 지연 변동 큼)
```

> 💡 **관련 이론**: Global Accelerator는 BGP Anycast를 사용한다. AWS는 전 세계 여러 에지 로케이션에서 동일한 두 개의 정적 IPv4 주소를 광고한다. 인터넷 라우터는 BGP의 최단 경로 알고리즘으로 가장 가까운 에지 로케이션을 선택한다. 이는 DNS 기반 라우팅(Route 53)과 달리 TTL 캐시가 없어 즉각적인 경로 변경이 가능하다. Accelerated VPN은 이 메커니즘을 IPsec 터널 엔드포인트에 적용한 것이다.

Accelerated VPN의 제약: **TGW에 연결된 VPN만 지원**한다. VGW에 연결된 VPN에는 사용할 수 없다. 추가 비용(Global Accelerator 시간당 요금 + 데이터 처리 요금)이 발생한다.

## DPD(Dead Peer Detection): 터널 생존 감지

IKEv2에 내장된 DPD(RFC 3706)는 VPN 피어의 생존 여부를 주기적으로 확인한다. AWS VPN의 기본 DPD 타임아웃은 30초다. DPD 패킷에 응답이 없으면 IKE 세션을 종료하고 터널을 재수립하거나 대안 터널로 전환한다.

> 🔍 **더 깊이**: DPD는 "On-Demand" 모드와 "Periodic" 모드로 동작한다. On-Demand는 트래픽이 없는 상태에서 일정 시간 후에만 DPD 패킷을 보내는 방식이다. Periodic은 항상 주기적으로 보낸다. AWS VPN은 On-Demand DPD를 사용한다. 이 때문에 트래픽이 전혀 없는 터널에서 피어 장애 감지가 느려질 수 있다. 항상 트래픽을 유지하거나 Periodic DPD를 지원하는 온프레미스 라우터 설정이 권장된다.

## VPN 이중화 패턴: 무엇이 어디를 방어하는가

| 구성 | 방어 범위 | SLA 수준 | 비용 |
|------|-----------|----------|------|
| 단일 CGW + AWS 2터널 | AWS 측 AZ 장애만 방어 | 중간 | 낮음 |
| 2개 CGW + 4터널 + BGP | AWS 측 + 온프레미스 라우터 장애 | 높음 | 중간 |
| DX Primary + VPN Backup | DX 장애 시 VPN 자동 전환 | DX SLA + VPN 백업 | DX + VPN |

2개 CGW + 4터널 구성이 권장되는 이유는 온프레미스 CGW(라우터) 자체의 장애를 방어하기 때문이다. 단일 CGW 구성에서 CGW 라우터가 다운되면 AWS의 2개 터널이 모두 끊어진다.

```
[온프레미스 Router-A] ── Tunnel 1 ──┐
                    └── Tunnel 2 ──┤
                                   ├── TGW (BGP ECMP)
[온프레미스 Router-B] ── Tunnel 3 ──┤
                    └── Tunnel 4 ──┘

Router-A 장애 → Tunnel 1, 2 중단 → BGP가 Tunnel 3, 4로 자동 전환
```

> 📚 **사례**: 2021년 한 글로벌 제조업체가 온프레미스 → AWS VPN 연결 중 온프레미스 BGP 라우터가 소프트웨어 버그로 재시작됐다. 단일 CGW 구성이었기 때문에 VPN이 완전히 단절됐고, 재수립까지 약 4분이 걸렸다. 이 4분 동안 생산 라인 제어 시스템과 AWS의 통신이 끊어져 알람이 발생했다. 이후 회사는 2개 CGW 구성으로 변경하고 BGP ECMP로 운영해 단일 라우터 재시작 시 트래픽이 다른 CGW로 즉시 전환되도록 했다.

## Client VPN: 원격 직원의 VPC 접근

Site-to-Site VPN이 데이터센터 대 AWS를 연결하는 사이트 VPN이라면, AWS Client VPN은 개별 직원 노트북이나 모바일 기기에서 VPC에 접근하는 솔루션이다.

Client VPN은 **OpenVPN 프로토콜** 기반이다. 클라이언트는 AWS가 제공하는 OpenVPN 클라이언트 또는 호환 클라이언트를 설치하고, 구성 파일을 다운로드해 VPN 서버(Client VPN Endpoint)에 연결한다.

### 인증 방식 3가지

**1. Active Directory 인증**: AWS Directory Service 또는 온프레미스 AD와 연동. 사용자가 도메인 자격증명으로 로그인한다.

**2. SAML 2.0 연합 (IAM Identity Center)**: SAML 2.0을 지원하는 IdP(Okta, Azure AD, 등)와 연동. SSO로 VPN 인증이 가능하다. SAP-C02에서 "운영 부담 최소화 + SSO + Client VPN"이면 이 조합이 정답이다.

**3. 상호 인증서 인증 (Mutual TLS)**: 서버 인증서와 클라이언트 인증서 모두 검증. 사용자 ID/PW 없이 인증서만으로 인증한다. 가장 강력한 인증이지만 인증서 관리 부담이 있다.

> 💡 **관련 이론**: mTLS(Mutual TLS, RFC 8446)는 TLS 핸드쉐이크에서 서버가 클라이언트에게도 인증서를 요청하는 방식이다. 일반 TLS는 서버만 인증서를 제시하고 클라이언트는 ID/PW로 인증한다. mTLS는 클라이언트 인증서가 탈취되지 않은 장치에서만 연결이 가능하므로, BYOD 환경에서 미승인 기기의 접근을 차단하는 효과가 있다. X.509 인증서(RFC 5280)를 PKI(Public Key Infrastructure)로 관리한다.

### Client VPN 비용 구조

Client VPN 비용은 두 가지 요소로 구성된다. **Endpoint 시간당 요금**: Client VPN Endpoint가 존재하는 시간만큼 AZ당 과금. **연결 시간당 요금**: 활성 클라이언트 연결 수 × 연결 시간. 이 구조 때문에 사용자가 없어도 Endpoint를 삭제하지 않으면 비용이 발생한다.

> ⚠️ **함정**: Client VPN Endpoint는 특정 서브넷에 Association하여 AZ에 배치한다. 각 AZ의 가용성을 위해 **여러 AZ에 서브넷을 Association**해야 한다. 단일 AZ 서브넷만 Association하면 해당 AZ 장애 시 Client VPN도 사용 불가능해진다. 시험에서 "고가용성 Client VPN" 시나리오면 멀티 AZ Association이 정답 구성 요소다.

## VGW vs TGW: VPN 연결의 허브 선택

| 항목 | VGW (Virtual Private Gateway) | TGW (Transit Gateway) |
|------|-------------------------------|----------------------|
| VPC 연결 | 단일 VPC | 다중 VPC |
| ECMP 지원 | 미지원 (Active-Passive) | 지원 (Active-Active) |
| Accelerated VPN | 미지원 | 지원 |
| 최대 대역폭 | ~1.25Gbps (단일 터널 활성) | 다중 터널 합산 |
| BGP AS | AWS 고정 | 설정 가능 |
| 비용 | 낮음 | TGW + VPN 연결 비용 |

SAP-C02에서 VPN 문제의 전형적인 정답 흐름: "단일 VPC, 대역폭 무관 → VGW", "다중 VPC 또는 ECMP 또는 Accelerated → TGW".

## IPsec vs SSL VPN: Client VPN의 프로토콜 선택

AWS Client VPN은 OpenVPN(SSL/TLS 기반)을 사용한다. AWS Site-to-Site VPN은 IPsec을 사용한다.

| 항목 | IPsec (Site-to-Site VPN) | SSL/TLS (Client VPN) |
|------|--------------------------|----------------------|
| 계층 | L3 (IP 계층) | L4/L7 |
| 방화벽 통과 | UDP 500/4500 필요 | TCP 443 사용 가능 |
| 설정 복잡성 | 중간 | 낮음 (클라이언트 앱) |
| 성능 | 높음 | 중간 |
| 사용 사례 | 사이트 간 고정 연결 | 원격 개인 사용자 |

> 🔍 **더 깊이**: OpenVPN은 UDP 1194 또는 TCP 443으로 동작한다. 기업 방화벽이 UDP를 차단해도 TCP 443은 HTTPS와 동일한 포트라 거의 모든 네트워크에서 허용된다. AWS Client VPN은 TCP 443을 기본으로 사용한다. 반면 IPsec은 IKE에 UDP 500, NAT 환경에서 UDP 4500(NAT-T)을 사용한다. 엄격한 방화벽 환경에서는 OpenVPN이 더 통과하기 쉽다.

## 다른 클라우드 VPN과의 비교

| 항목 | AWS Site-to-Site VPN | GCP Cloud VPN | Azure VPN Gateway |
|------|----------------------|---------------|-------------------|
| 터널 수 | 2개(자동) | HA VPN: 2개 | Active-Active: 2개 |
| 최대 처리량/연결 | 1.25Gbps/터널 | 3Gbps/터널(HA) | 10Gbps(VpnGw5) |
| BGP 지원 | 지원(eBGP) | 지원 | 지원 |
| ECMP | TGW 연결 시 | 기본 지원 | 지원 |
| 글로벌 가속 | Accelerated VPN | 기본 글로벌 백본 | ExpressRoute + VPN |
| 프로토콜 | IKEv1/v2 | IKEv2 | IKEv2 |

> 📚 **사례**: 한 SaaS 기업이 AWS와 GCP를 동시에 사용하는 멀티클라우드 환경을 구축했다. AWS의 Site-to-Site VPN과 GCP Cloud VPN 사이에 IPsec 터널을 연결했다. 두 클라우드 모두 IKEv2와 BGP를 지원하므로 상호 연동이 가능했다. 단, GCP의 HA VPN은 터널당 3Gbps를 지원해 AWS의 1.25Gbps보다 높아 AWS 측 ECMP 구성이 필요했다.

## 실전 CLI: VPN 완전 구성

```bash
# Customer Gateway 생성 (온프레미스 라우터 IP와 ASN)
aws ec2 create-customer-gateway \
  --type ipsec.1 \
  --bgp-asn 65000 \
  --public-ip 203.0.113.1 \
  --device-name "OnPrem-Router-A"

# TGW에 연결된 VPN (ECMP를 위해 TGW 사용)
aws ec2 create-vpn-connection \
  --type ipsec.1 \
  --customer-gateway-id cgw-aaa \
  --transit-gateway-id tgw-xxx \
  --options '{
    "EnableAcceleration": true,
    "StaticRoutesOnly": false,
    "TunnelOptions": [
      {
        "TunnelInsideCidr": "169.254.10.0/30",
        "PreSharedKey": "MySecretKey1",
        "IKEVersions": [{"Value": "ikev2"}],
        "DPDTimeoutAction": "restart",
        "DPDTimeoutSeconds": 30
      },
      {
        "TunnelInsideCidr": "169.254.11.0/30",
        "PreSharedKey": "MySecretKey2",
        "IKEVersions": [{"Value": "ikev2"}],
        "DPDTimeoutAction": "restart",
        "DPDTimeoutSeconds": 30
      }
    ]
  }'

# TGW ECMP 활성화 확인
aws ec2 describe-transit-gateways \
  --transit-gateway-ids tgw-xxx \
  --query 'TransitGateways[].Options.VpnEcmpSupport'

# Client VPN Endpoint 생성
aws ec2 create-client-vpn-endpoint \
  --client-cidr-block 10.100.0.0/22 \
  --server-certificate-arn arn:aws:acm:us-east-1:ACCT:certificate/SERVER-CERT \
  --authentication-options '[{
    "Type": "federated-authentication",
    "FederatedAuthentication": {
      "SAMLProviderArn": "arn:aws:iam::ACCT:saml-provider/Okta"
    }
  }]' \
  --connection-log-options '{"Enabled": true, "CloudwatchLogGroup": "/client-vpn-logs"}' \
  --dns-servers 10.0.0.2

# Client VPN Endpoint를 멀티 AZ 서브넷에 Association
aws ec2 associate-client-vpn-target-network \
  --client-vpn-endpoint-id cvpn-endpoint-xxx \
  --subnet-id subnet-az-a

aws ec2 associate-client-vpn-target-network \
  --client-vpn-endpoint-id cvpn-endpoint-xxx \
  --subnet-id subnet-az-b
```

Site-to-Site VPN은 빠른 구축, VPN 백업, DX 대안으로서의 즉시 대역폭 확장을 위해 AWS에서 가장 자주 사용되는 하이브리드 연결 솔루션이다. SAP-C02에서 핵심은 시나리오의 요구사항(대역폭, 지연, 이중화 수준, 사용자 수)을 파악해 VGW vs TGW, Static vs BGP, 일반 vs Accelerated, Site-to-Site vs Client VPN 중 올바른 조합을 선택하는 것이다.

---

## 📝 연습 문제

**문제 1.** 온프레미스 데이터센터와 AWS를 즉시(수 분 내) 연결해야 하는 긴급 상황이다. 현재 Direct Connect 프로비저닝을 진행 중이지만 6주가 남았다. 임시 연결로 가장 적합한 것은?

A) Direct Connect Hosted Connection (소형)
B) AWS Site-to-Site VPN + BGP
C) AWS Client VPN (회사 전체 직원에게 배포)
D) VPC Peering

**정답: B**
해설: Site-to-Site VPN은 콘솔에서 몇 분 내에 생성 가능하고 온프레미스 라우터에서 IPsec/IKEv2 설정만 하면 수 시간 내 연결된다. BGP를 사용하면 나중에 DX로 전환할 때도 라우팅 구성 변경이 최소화된다. Hosted Connection도 수 주가 걸린다(A 오답). Client VPN은 사이트 간 연결이 아니라 개별 사용자 단말용이다(C 오답). VPC Peering은 AWS 내부 VPC 간 연결이지 온프레미스 연결 기술이 아니다(D 오답).

---

**문제 2.** 현재 Site-to-Site VPN 1개(VGW 연결)로 온프레미스와 연결 중이다. 피크 시간 대역폭이 2Gbps에 달해 혼잡이 발생한다. DX는 3개월 후 개통 예정이다. 즉시 대역폭을 늘리는 방법은?

A) 기존 VPN의 MTU를 9001로 증가
B) VGW를 TGW로 교체하고 VPN 연결 2개 추가 후 ECMP 활성화
C) 기존 VPN에 터널을 2개 더 추가
D) CloudFront를 경유해 온프레미스로 트래픽 우회

**정답: B**
해설: VGW는 ECMP를 지원하지 않아 Active-Passive로만 동작하며 실질적으로 최대 1.25Gbps다. TGW로 교체하고 ECMP를 활성화하면 여러 VPN 연결의 터널이 동시에 활성화되어 대역폭이 합산된다. VPN 연결 2개(각 2터널) = 최대 5Gbps. MTU 증가(A)는 처리량 자체를 늘리지 않는다. 기존 VPN 터널 추가(C)는 Site-to-Site VPN당 2개 터널이 최대라 추가 불가능하다. CloudFront(D)는 콘텐츠 전송 네트워크로 온프레미스 VPN 대역폭 확장과 무관하다.

---

**문제 3.** 전 세계에 분산된 원격 직원 1,000명이 VPC의 내부 애플리케이션에 안전하게 접근해야 한다. 이미 Okta를 SSO로 사용 중이다. 운영 부담을 최소화하는 구성은?

A) Site-to-Site VPN + 직원 집 라우터에 CGW 구성
B) AWS Client VPN + SAML 2.0 (Okta IdP) 인증
C) Bastion Host + SSH 터널링
D) AWS VPN + AD 인증 (AD 서버를 각 리전에 배포)

**정답: B**
해설: Client VPN은 개별 사용자 단말용이며 OpenVPN 클라이언트로 접근한다. SAML 2.0 연동으로 Okta SSO와 연결하면 직원이 기존 Okta 자격증명으로 VPN 인증이 가능하다. 별도 사용자 계정 관리가 필요 없어 운영 부담이 최소화된다. Site-to-Site VPN은 고정 사이트 간 연결이며 집 라우터에 CGW 구성은 현실적이지 않다(A 오답). Bastion Host는 관리 부담이 크고 확장성이 없다(C 오답). AD 서버를 각 리전에 배포하는 것은 AD 복제·관리 부담이 크다(D 오답).

---

**문제 4.** 회사가 AWS Site-to-Site VPN과 Direct Connect를 함께 운영하며, 평상시 DX를 사용하고 DX 장애 시 VPN으로 자동 전환해야 한다. AWS → 온프레미스 방향(인바운드) 트래픽의 경로 우선순위를 제어하는 BGP 방법은?

A) AWS 콘솔에서 DX를 "Primary"로 표시
B) 온프레미스 BGP에서 DX 경로에 높은 Local Preference 설정
C) VPN 측에서 AS Path Prepending으로 경로를 길게 만들어 AWS가 DX를 선호하게 함
D) DX에 BFD 활성화, VPN에는 BFD 비활성화

**정답: C**
해설: AWS → 온프레미스 방향의 경로 선택은 AWS 측 BGP가 결정한다. AWS 측에서 Local Preference를 조정할 수 없으므로, 온프레미스가 VPN 측에서 광고하는 경로의 AS Path를 길게 만들어(Prepending) AWS가 AS Path가 짧은 DX 경로를 선호하도록 유도한다. AWS는 AS Path가 짧을수록 선호하는 BGP 표준 동작을 따른다. 온프레미스 BGP의 Local Preference(B)는 온프레미스 → AWS 방향 제어에 쓰인다(반대 방향). A는 존재하지 않는 기능이다. BFD(D)는 장애 감지 속도이지 경로 우선순위와 무관하다.

---

**문제 5.** AWS Client VPN Endpoint를 us-east-1에 생성하고 단일 AZ 서브넷(us-east-1a)에만 Association했다. 어떤 위험이 있는가?

A) 최대 동시 연결 수가 줄어든다
B) us-east-1a AZ 장애 시 모든 Client VPN 연결이 끊어진다
C) 비용이 두 배로 증가한다
D) BGP 라우팅이 동작하지 않는다

**정답: B**
해설: Client VPN Endpoint의 가용성은 Association된 서브넷의 AZ에 의존한다. 단일 AZ 서브넷만 Association하면 해당 AZ가 장애가 발생할 때 Client VPN 서비스가 완전히 중단된다. 고가용성을 위해 최소 2개 이상의 AZ에 서브넷을 Association해야 한다. 최대 연결 수는 Endpoint 설정에 따르며 AZ 수와 직접 관련이 없다(A 오답). 비용은 Association한 서브넷 수와 연결 시간에 따르지만 AZ 이중화가 반드시 두 배 비용을 의미하지는 않는다(C 오답). Client VPN은 BGP를 사용하지 않는다(D 오답).

---

**문제 6.** 글로벌 기업이 한국 온프레미스에서 us-east-1 VPC에 VPN으로 연결한다. 한국~미국 구간의 인터넷 지연이 불안정하여 VPN 성능이 들쭉날쭉하다. 가장 적합한 해결책은?

A) 더 빠른 인터넷 회선으로 업그레이드
B) AWS Accelerated Site-to-Site VPN (TGW 연결)
C) CloudFront를 VPN 앞에 배치
D) VPN MTU를 줄여 패킷 단편화 방지

**정답: B**
해설: Accelerated Site-to-Site VPN은 Global Accelerator의 Anycast를 사용해 한국의 가장 가까운 AWS 에지 로케이션(서울)에서 바로 AWS 글로벌 백본으로 진입한다. 한국~서울 에지 구간만 인터넷을 경유하고, 이후 서울~us-east-1 구간은 AWS 백본을 통해 안정적인 지연을 보장한다. 더 빠른 인터넷 회선(A)은 인터넷 경로의 지연 변동 자체를 해결하지 못한다. CloudFront(C)는 HTTP/HTTPS 콘텐츠 전송 서비스로 IPsec VPN과 관련이 없다. MTU 축소(D)는 단편화를 줄이지만 지연 변동을 해결하지 않는다. Accelerated VPN은 TGW에 연결된 VPN에서만 사용 가능하다.
