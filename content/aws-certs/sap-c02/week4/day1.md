# Day 16 - AWS Outposts, Local Zones, Wavelength

📅 날짜: Week 4 (Day 1)
🎯 주제: AWS 서비스를 데이터센터·엣지로 확장
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Outposts·Local Zones·Wavelength의 차이를 안다
- 각 옵션의 지연·관리 모델·사용처를 안다
- 하이브리드 클라우드 시나리오 정답을 선택할 수 있다

---

## 🧩 사전 지식 (CS 기초)

- **Edge Computing**: 사용자/디바이스 근접 처리. 지연 ↓.
- **MEC (Multi-access Edge Computing)**: 통신사 5G 엣지.
- **Last-mile Latency**: 사용자 ↔ 첫 라우터 구간 지연.
- **Data Gravity**: 데이터가 있는 곳에 컴퓨팅을 끌어들이는 현상.

---

## 📖 이론 내용

### 1. Outposts — AWS를 데이터센터로

- AWS가 직접 설치·운영하는 **물리 랙** 또는 **1U/2U 서버**
- 고객 데이터센터에 위치
- EC2·EBS·S3·ECS·EKS·RDS·EMR 일부 서비스 실행
- 리전과 동일 API·콘솔
- **연결**: Service Link(AWS 백본) 항상 필요

| 구성 | 설명 |
|------|------|
| **Outposts Rack** | 표준 42U 랙, 12kW~ 까지 |
| **Outposts Servers** | 1U/2U 작은 사이트(매장·지점) |
| **Local Gateway (LGW)** | 온프레미스 LAN 연결 |
| **Connectivity** | 항상 AWS 리전에 연결 (Disconnect 모드 X) |

**사용처**:
- 규제·데이터 주권 (데이터가 사옥 밖 못 나감)
- 초저지연 (제조 라인, 의료 영상)
- 기존 온프레미스 시스템과 같은 LAN

### 2. Local Zones — 인구 밀집 도시 엣지

- 리전의 확장. **대도시(LA, 마이애미, 라스베이거스 등)** 에 배치
- 단일 AZ에 EC2·EBS·일부 RDS·ALB
- **1ms 미만 지연** 가능
- 부모 리전과 연결 (Backbone)

**사용처**:
- 게임, 미디어 라이브 편집, 실시간 ML 추론
- 콘솔에서 활성화하면 추가 가용 영역처럼 사용

### 3. Wavelength — 통신사 5G 엣지

- 통신사(Verizon, KDDI, SK Telecom 등) 5G 네트워크 안에 설치
- 5G 디바이스에서 모바일 코어 미통과 → 초저지연
- IoT·실시간 비디오·AR/VR·자율주행

**사용처**:
- 5G 게임 (모바일)
- 자율주행 차량
- 산업용 IoT

### 4. 비교표

| 항목 | Outposts | Local Zones | Wavelength |
|------|----------|-------------|------------|
| 위치 | 고객 DC | AWS 운영 대도시 | 통신사 5G 엣지 |
| 지연 | LAN 수준 (밀리초 미만) | 1ms 미만 | 10ms 이내 (5G 디바이스) |
| 관리 | AWS Managed | AWS Managed | AWS + 통신사 |
| 인터넷 | 고객 LAN | AWS | 5G 모바일 |
| 데이터 주권 | ✅ 고객 데이터센터 | △ | △ |
| 서비스 범위 | EC2·EBS·S3·ECS·EKS·RDS·EMR | EC2·EBS·일부 RDS | EC2·EBS·ECS·EKS |

### 5. 자주 등장하는 선택 시나리오

- "데이터가 사옥 밖으로 못 나감 + AWS 서비스 사용" → **Outposts**
- "LA 게이머 1ms 지연" → **Local Zones**
- "5G 자율주행 디바이스" → **Wavelength**
- "온프레미스 ↔ AWS 빠르게 옮길 데이터" → Snowball (Week 4 Day 3)

---

## 🧠 알아두면 좋은 심화 이론

### Outposts 보안·운영

- AWS Nitro 기반, AWS가 펌웨어·패치 관리
- 고객 시설 보안은 고객 책임
- VPC Subnet이 Outposts에도 확장됨 (Subnet은 AZ 하나에 배치)

### Outposts Local Gateway

- 온프레미스 라우터와 BGP로 통신
- VPC Subnet ↔ 온프레미스 LAN 직접 라우팅 가능

### Cross-Reference

- **Day 17**: Storage Gateway가 더 가벼운 하이브리드
- **Day 19**: EKS Anywhere

---

## 🏗️ 아키텍처 다이어그램 — Outposts 통합

```
AWS 리전 ap-northeast-2
   │
   ├── 일반 VPC (10.0/16)
   │     ├── AZ-a, AZ-b ...
   │
   └── ── ── ── Service Link ── ── ── ──┐
                                         │
        고객 데이터센터                  │
        ┌────────────────────────────┐  │
        │ Outposts Rack (12kW)       │◄─┘
        │   EC2 (Subnet 10.0.100/24) │
        │   EBS, S3 on Outposts      │
        │   Local Gateway (LGW) ──── BGP ──── 온프레 라우터
        │                                       │
        │                                온프레 LAN 10.1/16
        └────────────────────────────┘
```

---

## ⭐ 핵심 포인트

1. ⭐ **데이터 주권 + AWS 서비스 = Outposts**
2. ⭐ **대도시 1ms = Local Zones**, **5G 디바이스 = Wavelength**
3. ⭐ Outposts는 **항상 AWS 리전 연결 필요** (Service Link)
4. ⭐ Outposts Local Gateway로 온프레미스 LAN 통합
5. ⭐ Local Zones는 부모 리전의 AZ처럼 활성화

---

## 💻 실제 예시 - Local Zone 활성화

```bash
# Local Zone 옵션 인 (활성화)
aws ec2 modify-availability-zone-group \
  --group-name us-west-2-lax-1 \
  --opt-in-status opted-in

# 서브넷 생성
aws ec2 create-subnet \
  --vpc-id vpc-xxx \
  --cidr-block 10.0.99.0/24 \
  --availability-zone us-west-2-lax-1a
```

---

## 📝 연습 문제

**문제 1.** 의료기관: 환자 영상 데이터 반출 금지 + AWS 서비스 활용. Best?

A) Local Zones
B) Outposts
C) Wavelength
D) Region

**정답: B**
해설: 데이터 주권 = Outposts.

---

**문제 2.** LA에서 실시간 라이브 미디어 편집, 1ms 지연. Best?

A) Outposts
B) Local Zones (us-west-2-lax-1a)
C) Wavelength
D) CloudFront

**정답: B**
해설: 대도시 초저지연 = Local Zones.

---

**문제 3.** 5G 모바일 게이머에게 5ms 지연. Best?

A) CloudFront
B) Wavelength
C) Local Zones
D) Global Accelerator

**정답: B**
해설: 5G 디바이스 엣지 = Wavelength.

---

**문제 4.** Outposts에서 항상 필요한 것은?

A) Direct Connect 필수
B) AWS 리전에 Service Link 연결
C) Internet Gateway
D) Public IP

**정답: B**
해설: Outposts는 Disconnect 모드 없음. Service Link 필수.

---

**문제 5.** Outposts 서브넷의 EC2가 온프레미스 LAN과 통신하려면?

A) NAT GW
B) Local Gateway (LGW) + BGP
C) VPN
D) PrivateLink

**정답: B**
해설: LGW가 온프레미스 LAN 통합.

---

**문제 6.** Outposts에서 실행되지 않는 서비스는?

A) EC2
B) EBS
C) Lambda (대부분의 리전 기능)
D) RDS

**정답: C**
해설: Lambda는 Outposts에서 제한적. EC2/EBS/S3 on Outposts/일부 RDS만.

---

## 📌 오늘의 요약

1. Outposts = 데이터센터에 AWS 랙·서버
2. Local Zones = 대도시 엣지, Wavelength = 5G 엣지
3. Outposts는 Service Link로 AWS 리전 상시 연결
4. Local Gateway로 Outposts ↔ 온프레미스 LAN
5. 시나리오: 데이터 주권→Outposts, 1ms→Local Zones, 5G→Wavelength
