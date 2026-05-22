# Day 24 - Global Accelerator vs CloudFront

📅 날짜: Week 5 (Day 4)
🎯 주제: 글로벌 가속 — 언제 CF, 언제 AGA, 언제 둘 다
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Global Accelerator(AGA)와 CloudFront의 차이를 안다
- 정적 Anycast IP의 의미와 사용 시나리오를 안다
- AGA Endpoint 그룹과 트래픽 다이얼을 이해한다

---

## 🧩 사전 지식 (CS 기초)

- **Anycast IP**: 같은 IP가 여러 위치에 광고됨 → 가장 가까운 노드에 라우팅.
- **Unicast vs Anycast**: 1:1 vs 1:Nearest.
- **TCP/UDP Acceleration**: 백본으로 빠르게 진입.

---

## 📖 이론 내용

### 1. Global Accelerator 본질

- **정적 Anycast IP 2개** 제공 (글로벌 고정)
- 사용자 ↔ 가장 가까운 AWS Edge Location까지 ISP 인터넷 최소
- 이후 AWS 백본으로 Origin까지 빠르게
- 비-HTTP(UDP·TCP·게임·VoIP·API)까지

### 2. CloudFront vs AGA

| 항목 | CloudFront | Global Accelerator |
|------|------------|--------------------|
| 계층 | L7 (HTTP/HTTPS) | L4 (TCP/UDP) |
| 캐싱 | ✅ | ❌ |
| 동적 콘텐츠 가속 | ✅ (캐싱 + Origin) | ✅ |
| 정적 IP | ❌ (도메인 변경) | ✅ |
| 사용처 | 웹 콘텐츠·API·미디어 | 게임·VoIP·IoT·non-HTTP |
| Health Check·Failover | ✅ | ✅ |

### 3. 언제 무엇을?

- **HTTP·미디어·API 캐싱** → CloudFront
- **UDP 게임·VoIP·IoT·SMTP** → AGA
- **정적 IP 필수 (방화벽 화이트리스트)** → AGA
- **HTTP라도 정적 IP 필요** → AGA + (백엔드는 ALB)

### 4. AGA 구성

```
Accelerator
   └── Listener (포트·프로토콜)
         ├── Endpoint Group (ap-northeast-2, 트래픽 다이얼 100%)
         │     ├── ALB / NLB / EC2 / EIP
         └── Endpoint Group (us-east-1, 0% — 대기)
```

- **트래픽 다이얼**: 그룹에 흐를 트래픽 비율 (0-100%)
- **Health Check**: 자동 페일오버

### 5. Bring Your Own IP (BYOIP)

- 회사 보유 IP를 AWS로 가져와 AGA 사용
- 변경 없이 클라이언트 호환 유지

### 6. AGA + CloudFront 함께

- 두 서비스가 **상호 보완**
- 예: CloudFront 뒤에 ALB Origin, ALB 앞에 AGA (정적 IP)
- 또는 AGA로 동적 API + CF로 정적 자산

---

## 🧠 알아두면 좋은 심화 이론

### Cross-Reference

- **Day 23**: CloudFront
- **Day 22**: Route 53 LBR vs AGA (LBR은 DNS, AGA는 IP)

### LBR vs AGA

- LBR(Route 53): DNS 단계, TTL 캐싱 의존
- AGA: 패킷 단계, 즉시 페일오버 (수십초)

---

## 🏗️ 아키텍처 다이어그램 — 게임 매칭 서버

```
글로벌 플레이어
   │  Anycast IP 198.51.100.1 (정적)
   ▼
가장 가까운 AWS Edge ── AWS 백본 ─→ ap-northeast-2 NLB (게임 서버, UDP)
                              └─→ us-east-1 NLB (트래픽 다이얼 0%, 백업)

장애 시: Health Check 실패 → us-east-1로 자동 페일오버 (수초)
```

---

## ⭐ 핵심 포인트

1. ⭐ **CloudFront = L7 캐싱, AGA = L4 + 정적 IP**
2. ⭐ UDP·게임·VoIP·SMTP·IoT는 **AGA**
3. ⭐ **정적 IP 필요한 방화벽 화이트리스트 = AGA**
4. ⭐ AGA Health Check + 트래픽 다이얼로 자동 페일오버
5. ⭐ BYOIP으로 회사 IP 그대로 사용

---

## 💻 실제 예시 - Accelerator 생성

```bash
aws globalaccelerator create-accelerator \
  --name MyGameAccelerator --ip-address-type IPV4

aws globalaccelerator create-listener \
  --accelerator-arn arn:... \
  --port-ranges FromPort=7777,ToPort=7777 \
  --protocol UDP

aws globalaccelerator create-endpoint-group \
  --listener-arn arn:... \
  --endpoint-group-region ap-northeast-2 \
  --endpoint-configurations EndpointId=eipalloc-xxx \
  --traffic-dial-percentage 100
```

---

## 📝 연습 문제

**문제 1.** UDP 게임 글로벌 서비스 + 정적 IP. Best?

A) CloudFront
B) Global Accelerator
C) Route 53 LBR
D) ALB

**정답: B**
해설: UDP + 정적 IP = AGA.

---

**문제 2.** 정적 웹 + API 글로벌 캐싱. Best?

A) AGA
B) CloudFront
C) Route 53 Latency
D) NLB

**정답: B**
해설: HTTP 캐싱 = CF.

---

**문제 3.** 기업 방화벽이 IP 화이트리스트만 허용. 글로벌 가속 필요. Best?

A) CF
B) AGA (정적 IP)
C) Route 53
D) Direct Connect

**정답: B**
해설: 정적 IP = AGA.

---

**문제 4.** AGA Endpoint Group의 "트래픽 다이얼"은?

A) 비용 제어
B) 그룹별 트래픽 비율 (0-100%)
C) Health Check 간격
D) Cache TTL

**정답: B**
해설: 트래픽 다이얼 = 비율 분배.

---

**문제 5.** Route 53 LBR vs AGA, 페일오버가 더 빠른 것은?

A) LBR (DNS TTL 영향)
B) AGA (수초)
C) 동일
D) Static IP 사용 시 LBR

**정답: B**
해설: AGA는 패킷 단계 즉시.

---

**문제 6.** 회사 보유 공개 IP를 AGA에서 사용. Best?

A) 불가
B) BYOIP
C) EIP만
D) Cross-Region

**정답: B**
해설: BYOIP로 자체 IP 가져오기.

---

## 📌 오늘의 요약

1. CF = L7 캐싱, AGA = L4 + 정적 IP
2. UDP·게임·정적 IP는 AGA
3. CF는 캐싱·동적 + WAF·Shield
4. 트래픽 다이얼로 비율·페일오버
5. BYOIP로 회사 IP 호환
