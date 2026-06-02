# Day 15 - Week 3 복습 + 시나리오 10문항

📅 날짜: Week 3 (Day 5)
🎯 주제: 고급 네트워킹 종합
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 멀티 VPC·온프레미스·서드파티 연결 옵션을 정확히 구분
- 트레이드오프 기반 시나리오 정답 선택

---

## 🧩 사전 지식 (CS 기초)

- **Connectivity Pattern**: Hub-Spoke vs Mesh vs Service vs Direct.
- **East-West vs North-South**: 내부(VPC↔VPC) vs 외부(인터넷↔VPC).

---

## 📖 Week 3 핵심 7개

1. 3+ VPC = TGW, 2개 = Peering
2. TGW Route Table로 격리·공유 패턴
3. Cloud WAN = 글로벌 정책, TGW = 리전 라우팅
4. DX VIF: Private/Public/**Transit**, 다중 VPC = DXGW + Transit VIF + TGW
5. DX 최대 복원력 = 2 Location × 2 회선 (99.99%)
6. VPN 대역폭 증가 = TGW + ECMP
7. PrivateLink = 서비스 단위 단방향, CIDR 겹침 OK

---

## 🔄 비교표

| A | B | 차이 |
|---|---|------|
| **Peering** vs **TGW** | 1:1 비전이 vs 허브 전이 | 3+ VPC = TGW |
| **TGW** vs **Cloud WAN** | 리전 vs 글로벌 정책 | 글로벌은 CW |
| **DX** vs **VPN** | 전용선·대역 큼·일관 vs 인터넷·빠른 구축 | DR Backup은 VPN |
| **Private VIF** vs **Transit VIF** | VPC 1개 vs TGW 통합 | 다중 VPC=Transit |
| **PrivateLink** vs **Peering** | 서비스·단방향·CIDR OK vs 양방향·CIDR 불가 | SaaS는 PL |
| **Gateway VPCe** vs **Interface VPCe** | S3/DDB 무료 vs 대부분 유료 | 비용 |
| **Site-to-Site VPN** vs **Client VPN** | 사이트 IPsec vs 직원 OpenVPN | 단말은 Client VPN |

---

## 📝 시나리오 연습 문제 10개

---

**문제 1.** 30개 VPC + 온프레미스 4개 사이트 통합. 단순화·확장성. Best?

A) Full Mesh Peering
B) TGW + DX/VPN Attachment + RAM 공유
C) PrivateLink Mesh
D) 단일 VPC 통합

**정답: B**
해설: 30개 VPC = TGW 허브. DX/VPN 통합 + 멀티 계정은 RAM.

---

**문제 2.** Snowflake에 사설 접속 + CIDR 겹침 우려. Best?

A) Peering
B) PrivateLink (Interface VPCe)
C) NAT GW
D) DX

**정답: B**
해설: PrivateLink만 CIDR 겹쳐도 OK.

---

**문제 3.** 다중 리전(서울·도쿄·버지니아) VPC를 단일 정책으로 관리. Best?

A) 리전별 TGW + Peering 수동
B) Cloud WAN
C) Peering Full Mesh
D) Direct Connect 단일

**정답: B**
해설: 글로벌 정책 관리 = Cloud WAN.

---

**문제 4.** 미션 크리티컬 워크로드. DX SLA 99.99%. Best?

A) 단일 Location 단일 회선
B) 2 Location × 2 회선
C) VPN Mesh
D) Peering

**정답: B**
해설: Maximum Resiliency.

---

**문제 5.** Site-to-Site VPN 대역폭 부족, 즉시 해결. Best?

A) Accelerated VPN
B) TGW + ECMP 다수 터널
C) PrivateLink
D) NAT GW

**정답: B**
해설: TGW ECMP가 가장 빠른 합산.

---

**문제 6.** 모든 VPC 트래픽을 중앙 방화벽 어플라이언스로 검사. Best?

A) NACL
B) Gateway Load Balancer Endpoint (GWLBe) + TGW
C) WAF
D) NAT GW

**정답: B**
해설: GLBe로 트래픽 우회 + TGW로 중앙 라우팅.

---

**문제 7.** 임시 PoC, 빠르게 온프레미스 ↔ AWS 연결. Best?

A) DX (수주 소요)
B) Site-to-Site VPN
C) Cloud WAN
D) Direct Connect Hosted

**정답: B**
해설: 빠른 구축 = VPN.

---

**문제 8.** 100개 계정의 TGW를 네트워크 계정에 중앙 두기. Best?

A) 각 계정 TGW
B) RAM으로 TGW 공유
C) Cross-Account Role
D) PrivateLink

**정답: B**
해설: RAM 공유가 표준.

---

**문제 9.** EC2 Private Subnet에서 S3 + Secrets Manager + KMS 접근, 비용 최소화·인터넷 미경유. Best?

A) NAT GW
B) S3 Gateway + Interface Endpoint(SM, KMS)
C) Interface Endpoint(S3, SM, KMS)
D) PrivateLink 별도 구성

**정답: B**
해설: S3는 Gateway(무료), SM/KMS는 Interface.

---

**문제 10.** 직원 노트북 500대 VPC 사설 접속. SSO 통합. Best?

A) Site-to-Site VPN
B) Client VPN + SAML(IDC)
C) SSH Bastion
D) Direct Connect

**정답: B**
해설: Client VPN + IDC SAML이 직원 단말 표준.

---

## 📌 다음 주 예고

**Week 4: 하이브리드 클라우드**
- Outposts·Local Zones·Wavelength
- Storage Gateway 4종
- Snow Family와 대규모 데이터 전송
- EKS/ECS Anywhere

---

## 📌 오늘의 요약

1. 3+ VPC = TGW, 글로벌 = Cloud WAN
2. DX는 일관성·대역, VPN은 빠른 구축
3. PrivateLink = 서비스 단방향·CIDR OK
4. S3/DDB는 Gateway VPCe, 나머지는 Interface
5. 직원=Client VPN, 사이트=Site-to-Site VPN
