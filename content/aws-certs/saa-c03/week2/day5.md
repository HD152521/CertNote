# Day 10 - Week 2 복습 + 시나리오 문제 10

📅 날짜: Week 2 (Day 5)
🎯 주제: VPC 네트워킹 종합 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- VPC 네트워킹 핵심 7개를 그림으로 설명할 수 있다
- 시나리오 문제 10개로 약점 도메인을 점검한다

---

## 🧩 사전 지식 (CS 기초)

- **광역 vs 미세 단위 보안**: 서브넷(광역) NACL, 인스턴스(미세) SG.
- **수직 vs 수평 확장**: NAT GW는 수평 확장으로 자동 스케일.
- **하이브리드 클라우드**: 온프레 + 클라우드. DX/VPN/TGW가 그 다리.

---

## 📖 한 주 핵심 정리

1. **VPC = 리전, Subnet = AZ, Route Table = Subnet 종속**.
2. **Public = IGW 라우트 존재**, Private = NAT로만 외부.
3. **NAT GW는 아웃바운드 전용, AZ별 1개**.
4. **SG = stateful Allow / NACL = stateless Allow+Deny**.
5. **Flow Logs는 메타데이터만**.
6. **Peering은 전이성 X, TGW는 전이성 O**.
7. **S3/DDB는 무료 Gateway Endpoint**.

### 헷갈리기 쉬운 비교표

| 항목 | A | B |
|------|---|---|
| **SG vs NACL** | 인스턴스/Stateful/Allow | 서브넷/Stateless/Allow+Deny |
| **NAT GW vs NAT Instance** | 관리형/HA/45Gbps | EC2/포트포워딩 가능 |
| **Peering vs TGW** | 1:1/전이성 X | 허브/전이성 O |
| **Gateway vs Interface Endpoint** | S3/DDB 무료 | 그 외 유료 |
| **VPN vs DX** | 인터넷/즉시/저렴 | 전용선/일관/고대역폭 |

---

## 🏗️ 한 주 통합 아키텍처

```
[ Multi-AZ + 하이브리드 + 사설 엔드포인트 통합 ]

  온프레미스 ──DX──┐                        ┌── Site-to-Site VPN (백업)
                  ▼                        ▼
                         [ Transit Gateway ]
                       /        |         \
                  VPC-A      VPC-B      VPC-C
                    │
            ┌───────┴────────┐
            │     IGW         │
            │  Public-a/b      │
            │   NAT-a / NAT-b │
            │  Private-a/b    │
            │  (S3 Gateway EP)│
            │  (SSM Interface)│
            │   SG/NACL        │
            │  Flow Logs → S3 │
            └─────────────────┘
```

---

## 📝 시나리오 연습 문제 10

**문제 1.** Public Subnet의 EC2가 외부 인터넷에 통신 못함. 가장 먼저 확인할 것은?

A) DB 백업 B) RT의 IGW 라우트 / 공인 IP / SG / NACL C) S3 D) Cognito

**정답: B**.

---

**문제 2.** 단일 AZ에만 NAT GW 두었을 때 그 AZ 장애 시 결과?

A) 영향 없음 B) 다른 AZ도 인터넷 단절 C) IGW가 자동 페일오버 D) AWS가 복구

**정답: B**.

---

**문제 3.** 특정 IP에서 들어오는 트래픽 차단:

A) SG inbound deny B) NACL inbound deny C) IAM D) Route Table

**정답: B**.

---

**문제 4.** 50개 VPC + 본사 ↔ 클라우드. 가장 적합한 구조:

A) 풀메시 Peering B) Transit Gateway C) VPN만 D) IGW

**정답: B**.

---

**문제 5.** Lambda가 같은 리전의 S3와 DynamoDB에 빈번히 접근. NAT 비용을 줄이려면?

A) Lambda를 인터넷으로 B) S3/DDB Gateway Endpoint C) Interface Endpoint D) PrivateLink

**정답: B** — 무료.

---

**문제 6.** SaaS 사업자가 사내 고객 VPC에 자신의 서비스만 사설로 노출:

A) Peering B) TGW C) PrivateLink (Interface Endpoint) D) NAT

**정답: C**.

---

**문제 7.** SSH 키 관리 없이 Private EC2에 셸 접근:

A) Bastion B) NAT Instance C) Session Manager D) VPN

**정답: C**.

---

**문제 8.** Stateful 방화벽의 특징?

A) 응답 자동 허용 B) 서브넷 단위 C) 번호 순 평가 D) Deny 가능

**정답: A**.

---

**문제 9.** EC2 외부 API 호출에 응답이 안 옴. NACL outbound에 1024-65535이 없다. 원인?

A) IGW 부재 B) SG 문제 C) Ephemeral 포트 NACL outbound 부재 D) RT 부재

**정답: C**.

---

**문제 10.** DX와 VPN을 함께 쓸 때 일반적 패턴?

A) DX 메인 + VPN 백업 B) VPN 메인 + DX 백업 C) 둘 다 메인 D) 양립 불가

**정답: A**.

---

## 📌 오늘의 요약 + 다음 주 예고

1. SAA에서 네트워킹은 보안/복원력 도메인의 절반 이상을 차지.
2. SG/NACL, NAT, Endpoint, Peering/TGW의 시나리오 매핑을 외워둘 것.
3. 다음 주: **EC2 + Auto Scaling + ELB** — 컴퓨팅과 탄력성 핵심.
