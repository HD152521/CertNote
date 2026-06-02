# Day 13 - Site-to-Site VPN과 Client VPN

📅 날짜: Week 3 (Day 3)
🎯 주제: IPsec VPN — 사이트 + 사용자 단말
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Site-to-Site VPN 구조와 BGP/Static 차이를 안다
- Accelerated VPN과 일반 VPN의 차이를 안다
- Client VPN과 AppStream/Workspaces·VDI 시나리오를 안다
- VPN 이중화 패턴을 안다

---

## 🧩 사전 지식 (CS 기초)

- **IPsec**: L3 IP 패킷 암호화. AH/ESP 모드.
- **IKEv1/IKEv2**: 키 교환 프로토콜.
- **Tunnel vs Transport mode**: AWS는 Tunnel mode 사용.
- **mTLS (Mutual TLS)**: 양방향 인증서 검증. Client VPN의 옵션.

---

## 📖 이론 내용

### 1. Site-to-Site VPN 구조

```
On-Prem CGW (Customer Gateway)
       │  IPsec (Tunnel 1)
       ├──────── AWS VPN Endpoint #1 (AZ-a)
       │  IPsec (Tunnel 2)
       └──────── AWS VPN Endpoint #2 (AZ-b)
                       │
                       ▼
                    VGW or TGW
```

- AWS는 **2개 터널 자동 제공** (HA)
- 각 터널 1.25Gbps
- ECMP로 합산 가능 (TGW에서)

### 2. Static vs BGP 라우팅

| 항목 | Static | BGP (Dynamic) |
|------|--------|---------------|
| 설정 | 수동 라우트 추가 | 자동 광고 |
| 페일오버 | 수동 | 자동 |
| 변경 시 | 양쪽 수정 | 광고로 자동 반영 |
| 권장 | 작은 정적 환경 | **대부분** |

> 💡 Pro 시험: 대부분 BGP가 정답.

### 3. Accelerated Site-to-Site VPN

- Global Accelerator를 통해 AWS 백본 진입을 가속
- 장거리·고지연 환경에서 일관성 향상
- TGW와 함께 사용 시 활성화 가능
- VGW는 미지원

### 4. Site-to-Site VPN 이중화 패턴

- **단일 CGW + AWS 2개 터널**: 기본 — AWS 측만 HA
- **2개 CGW + 4개 터널**: 양쪽 모두 HA, 가장 권장
- **DX Primary + VPN Backup**: 비용·복원력 균형

### 5. Client VPN (사용자 단말)

- 원격 직원·모바일이 VPC에 IPsec 없이 OpenVPN으로 접속
- 인증: AD, SAML(IDC), mTLS 인증서
- 연결당 시간 + 활성 endpoint당 시간 비용
- AZ별 association 필요

### 6. Workspaces/VDI 시나리오

- 직원이 PC 대신 클라우드 VDI 사용
- Workspaces / AppStream
- 데이터가 AWS에 남고 단말은 화면만 → 보안·DLP

---

## 🧠 알아두면 좋은 심화 이론

### VPN 처리량 증가

- TGW + ECMP: 동일 BGP ASN으로 다수 터널 활성 → 대역폭 합산
- Accelerated VPN: 지연 감소
- DX로 마이그레이션이 근본 해결

### Cross-Reference

- **Day 12**: DX와 비교
- **Week 11**: VPN 로깅
- **Week 14**: DR Backup VPN

---

## 🏗️ 아키텍처 다이어그램 — TGW + 2 CGW + ECMP

```
On-Prem DC-A (Router A) ─── VPN (2 tunnels) ┐
                                            │
On-Prem DC-B (Router B) ─── VPN (2 tunnels) ┼─── TGW (ECMP enabled)
                                            │       │
                                            ┘       ▼
                                                  VPCs
4개 터널 동시 활성 = 약 5Gbps 합산
```

---

## ⭐ 핵심 포인트

1. ⭐ **AWS Site-to-Site VPN = 2개 터널 자동 HA**
2. ⭐ **BGP 권장** (자동 페일오버·라우트 변경)
3. ⭐ **TGW + ECMP**로 다수 터널 합산
4. ⭐ **Accelerated VPN**은 장거리 지연 감소 (TGW 전용)
5. ⭐ Client VPN = OpenVPN 기반, SAML(IDC) 인증 권장

---

## 💻 실제 예시 - Site-to-Site VPN

```bash
# CGW
aws ec2 create-customer-gateway \
  --type ipsec.1 --bgp-asn 65000 --public-ip 203.0.113.1

# VPN Connection (TGW에 부착)
aws ec2 create-vpn-connection \
  --type ipsec.1 \
  --customer-gateway-id cgw-xxx \
  --transit-gateway-id tgw-yyy \
  --options TunnelOptions='[{TunnelInsideCidr=169.254.10.0/30},{TunnelInsideCidr=169.254.11.0/30}]'
```

---

## 📝 연습 문제

**문제 1.** 온프레미스 DC와 VPC 빠른 임시 연결 필요. Best?

A) DX
B) Site-to-Site VPN
C) PrivateLink
D) Peering

**정답: B**
해설: 빠른 구축(수분)·임시 = VPN. DX는 수주.

---

**문제 2.** Site-to-Site VPN 대역폭이 부족. 운영 부담 최소·바로 해결. Best?

A) TGW + ECMP로 다수 터널 활성
B) VPN 대신 PrivateLink
C) DX 즉시 도입
D) IPsec MTU 증가

**정답: A**
해설: TGW ECMP가 가장 빠른 해결.

---

**문제 3.** 원격 직원 500명 노트북에서 VPC에 안전하게 접근. Best?

A) Site-to-Site VPN
B) Client VPN + SAML(IDC) 인증
C) SSH Bastion
D) Direct Connect

**정답: B**
해설: Client VPN이 사용자 단말용. SAML(IDC) 인증으로 SSO.

---

**문제 4.** 장거리(미국-한국) VPN 지연 일관성 향상. Best?

A) 일반 VPN
B) Accelerated Site-to-Site VPN
C) VGW
D) PrivateLink

**정답: B**
해설: AGA를 통해 백본 진입 가속.

---

**문제 5.** 두 사이트(A, B) 양쪽 모두 HA. 최적 구성?

A) 단일 CGW 단일 터널
B) 2개 CGW + 4개 터널 + BGP
C) PrivateLink
D) Static Route

**정답: B**
해설: 양쪽 HA = 2 CGW × 2 터널.

---

**문제 6.** Client VPN endpoint 인증 옵션이 아닌 것은?

A) Active Directory
B) SAML 2.0 (IDC)
C) mTLS 인증서
D) IAM User Access Key

**정답: D**
해설: Client VPN은 AD/SAML/mTLS.

---

## 📌 오늘의 요약

1. Site-to-Site VPN = IPsec, 2개 터널 HA 기본
2. BGP가 정적 라우트보다 권장
3. TGW + ECMP로 다수 터널 합산
4. Accelerated VPN으로 장거리 지연 감소 (TGW 전용)
5. Client VPN은 직원 노트북용, SAML(IDC) 인증 권장
