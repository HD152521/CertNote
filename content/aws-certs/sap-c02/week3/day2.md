# Day 12 - Direct Connect 아키텍처와 이중화

📅 날짜: Week 3 (Day 2)
🎯 주제: 전용선 연결 — Direct Connect, LAG, Resiliency
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Direct Connect(DX)의 구조와 VIF 3종을 안다
- LAG, DX Gateway, SiteLink를 구분한다
- DX 이중화 권장 아키텍처(SLA 별)를 안다
- DX vs VPN 선택 기준을 안다

---

## 🧩 사전 지식 (CS 기초)

- **L1/L2/L3**: 물리·데이터 링크·네트워크 계층. DX는 L1(전용선)·L2(VLAN VIF)·L3(BGP).
- **LACP (Link Aggregation Control Protocol)**: 다수의 물리 링크를 하나로 묶기 — LAG.
- **MACsec (IEEE 802.1AE)**: 데이터 링크 계층 암호화. DX 일부 포트에서 지원.
- **BFD (Bidirectional Forwarding Detection)**: 빠른 장애 감지 (1초 미만).

---

## 📖 이론 내용

### 1. Direct Connect 개요

- 전용선으로 온프레미스 ↔ AWS 직접 연결
- 인터넷 미경유 → **일관된 지연·대역폭, 데이터 전송 비용 절감**
- 1Gbps, 10Gbps, 100Gbps (호스티드 50/100/200/300/400Mbps도 있음)
- 프로비저닝에 수주~수개월 (전용선 공사)

### 2. VIF (Virtual Interface) 3종

| VIF | 용도 | 라우팅 |
|-----|------|--------|
| **Private VIF** | VPC 사설 IP 접속 | VPC Route Table + VGW/DXGW |
| **Public VIF** | AWS 공개 서비스(S3, DynamoDB 등) 사설망으로 접근 | AWS 공개 BGP 광고 수신 |
| **Transit VIF** | TGW 연결 (멀티 VPC) | DX Gateway + TGW |

> ⚠️ **함정**: Private VIF는 단일 VGW(VPC) 연결. **여러 VPC 또는 여러 리전 = Transit VIF + DXGW + TGW**.

### 3. Direct Connect Gateway (DXGW)

- 단일 DX 연결에서 여러 리전·여러 VPC에 라우팅
- 글로벌 (모든 리전)
- 자체 비용 없음 (DX 회선·VIF만)

### 4. LAG (Link Aggregation Group)

- 여러 DX 포트를 LACP로 묶어 단일 논리 회선
- 대역폭 증가 + 자동 페일오버
- 최대 4개 포트 (동일 대역, 동일 위치)

### 5. SiteLink

- DX Location 간 글로벌 직접 통신 (백본 활용)
- AWS 거치지 않고 두 온프레미스 데이터센터를 AWS DX 백본으로 연결
- 멀티 리전 사설 백본 대체

### 6. DX 이중화 아키텍처 (⭐ Pro 시험 핵심)

#### 최대 복원력 (Maximum Resiliency) — 99.99% SLA
- **다른 DX Location 2개 + 각 Location당 2개 회선 (총 4개)**
- 다른 디바이스 + 다른 케이블 경로
- 미션 크리티컬·금융

#### 고가용성 (High Resiliency) — 99.9% SLA
- 다른 DX Location 2개 + 각 1개 회선 (총 2개)
- 일반 엔터프라이즈

#### 개발/테스트 (Development) — 99% SLA
- 같은 Location 2개 회선 또는 1개 회선
- + Site-to-Site VPN 백업

#### 가장 흔한 패턴: **DX + VPN Backup**
- DX 정상 시: BGP가 DX를 우선 (Local Preference 또는 AS Path)
- DX 장애 시: VPN으로 자동 페일오버

### 7. DX vs VPN 선택

| 기준 | DX | VPN |
|------|----|----|
| 대역폭 | 1G/10G/100G | ~1.25Gbps (per tunnel) |
| 지연 | 일관·낮음 | 인터넷 의존·변동 |
| 보안 | 사설망(MACsec 옵션) | IPsec 암호화 기본 |
| 프로비저닝 | 수주~수개월 | 수분 |
| 비용 | 포트·시간·데이터 | 시간 + 데이터 |
| 사용처 | 대용량·일관성·규제 | 백업·임시·소규모 |

> 💡 **Pro 정답**: "대역폭 큼·일관 지연·규제·비용 절감" → DX. "빠른 구축·임시·DR 백업" → VPN.

---

## 🧠 알아두면 좋은 심화 이론

### MACsec

- L2 암호화 (IEEE 802.1AE)
- DX 일부 포트(10Gbps, 100Gbps)에서 지원
- 사설망이지만 추가 암호화 필요한 규제 산업

### Jumbo Frames

- DX는 1500 또는 9001 MTU 지원 — 대용량 전송 효율

### BFD on DX

- 기본 BGP keepalive 30초/holdtime 90초
- BFD 활성화 시 1초 미만 장애 감지
- 페일오버 시간 단축

### Cross-Reference

- **Day 13**: Site-to-Site VPN
- **Day 14**: PrivateLink
- **Week 14**: DR — DX + Hot Standby

---

## 🏗️ 아키텍처 다이어그램 — DX + VPN Backup

```
On-Premises DC1                       AWS
                  ┌──────────────────┐
On-Prem Router ───┤ DX Location A    ├── DXGW ── TGW ── VPCs
                  │ (Primary)        │
                  └──────────────────┘
                  ┌──────────────────┐
On-Prem Router ───┤ DX Location B    │
                  │ (Secondary)      │
                  └──────────────────┘
                  ┌──────────────────┐
On-Prem Router ───┤ VPN over Internet│ (Backup, BGP AS Path 우회)
                  └──────────────────┘
```

---

## ⭐ 핵심 포인트

1. ⭐ **VIF 3종**: Private(단일 VPC) / Public(AWS 공개) / **Transit(TGW)**
2. ⭐ **여러 VPC·리전 = DXGW + Transit VIF + TGW**
3. ⭐ **최대 복원력 = 2개 DX Location × 2개 회선** (99.99%)
4. ⭐ **DX + VPN Backup**이 비용 효율 표준
5. ⭐ DX 빠른 페일오버 = **BFD 활성화** (1초 미만)

---

## 💻 실제 예시 - DX Gateway 생성

```bash
# DX Gateway
aws directconnect create-direct-connect-gateway \
  --direct-connect-gateway-name MainDXGW \
  --amazon-side-asn 64512

# Transit VIF
aws directconnect create-transit-virtual-interface \
  --connection-id dxcon-xxx \
  --new-transit-virtual-interface "virtualInterfaceName=TGW-VIF,vlan=100,asn=65000,directConnectGatewayId=dxgw-yyy"

# DXGW ↔ TGW 연결
aws directconnect associate-transit-gateway-with-direct-connect-gateway \
  --direct-connect-gateway-id dxgw-yyy \
  --transit-gateway-id tgw-zzz
```

---

## 📝 연습 문제

**문제 1.** 100개 VPC를 단일 DX 회선으로 연결. Best?

A) 각 VPC에 Private VIF 100개
B) DX Gateway + Transit VIF + TGW
C) PrivateLink
D) VPN Mesh

**정답: B**
해설: DXGW + Transit VIF + TGW가 다중 VPC 정답.

---

**문제 2.** 미션 크리티컬 워크로드. DX SLA 99.99% 필요. Best?

A) 단일 Location 단일 회선
B) 단일 Location 2 회선
C) 2개 Location × 2 회선 (Maximum Resiliency)
D) Site-to-Site VPN

**정답: C**
해설: AWS 권장 Maximum Resiliency = 2 Location × 2 회선.

---

**문제 3.** DX 페일오버 시간을 1초 미만으로 단축. 어떤 기술?

A) Jumbo Frames
B) BFD
C) LACP
D) MACsec

**정답: B**
해설: BFD = 빠른 BGP 장애 감지.

---

**문제 4.** 두 온프레미스 데이터센터를 AWS 백본으로 직접 연결. Best?

A) Direct Connect SiteLink
B) Site-to-Site VPN Mesh
C) Cloud WAN만
D) Transit Gateway

**정답: A**
해설: SiteLink = DX Location 간 백본 통신.

---

**문제 5.** DX 회선 + VPN Backup. 평시 DX 우선시. 어떤 메커니즘?

A) Static Route
B) BGP AS Path Prepending (VPN 측)·또는 Longer AS Path → DX 우선
C) NAT GW
D) Lambda 자동화

**정답: B**
해설: BGP AS Path/MED 조작으로 우선순위.

---

**문제 6.** 사설망이지만 추가 L2 암호화가 규제 요구. 어떤 옵션?

A) IPsec VPN over DX
B) DX MACsec
C) TLS만
D) NACL

**정답: B**
해설: MACsec이 DX L2 암호화.

---

## 📌 오늘의 요약

1. VIF: Private(VPC)·Public(AWS 공개)·Transit(TGW)
2. 다중 VPC·리전 = DXGW + Transit VIF + TGW
3. 최대 복원력 = 2 Location × 2 회선
4. DX + VPN Backup이 비용 효율 표준
5. BFD로 페일오버 시간 단축, MACsec으로 L2 암호화
