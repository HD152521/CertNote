# Day 18 - Snow Family와 대규모 데이터 전송

📅 날짜: Week 4 (Day 3)
🎯 주제: 페타바이트 데이터 이동·엣지 컴퓨팅
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Snow Family 3종(Snowcone·Snowball·Snowmobile) 차이를 안다
- DataSync·Storage Gateway·Snow의 선택 기준을 안다
- 네트워크 vs 물리 전송 비용·시간 트레이드오프를 계산할 수 있다

---

## 🧩 사전 지식 (CS 기초)

- **Throughput vs Latency Trade-off**: 디스크에 담아 트럭으로 보내는 게 인터넷보다 빠를 수도 있음 (Andrew Tanenbaum: "Never underestimate the bandwidth of a station wagon full of tapes").
- **Air-Gapped Network**: 외부 네트워크와 물리적 격리.

---

## 📖 이론 내용

### 1. Snow Family 비교

| 장비 | 용량 | 컴퓨팅 | 사용처 |
|------|------|--------|--------|
| **Snowcone** | 8/14TB | 2vCPU, 4GB | 작은 엣지, 휴대형 |
| **Snowball Edge Storage Optimized** | 80TB | 약간 | 대량 전송 위주 |
| **Snowball Edge Compute Optimized** | 28TB | 52vCPU, 208GB | 엣지 컴퓨팅 |
| **Snowmobile** | 100PB (트럭) | - | 익스아바이트급 |

> 💡 **Snowmobile**은 2024년 단종. 큰 데이터는 다수의 Snowball 또는 DX/네트워크로.

### 2. 사용 모드

- **Data Transfer**: 데이터 입출력만
- **Edge Computing**: EC2·Lambda 실행 (네트워크 단절 환경 — 선박, 군기지)
- **GPU 옵션**: ML 추론 엣지

### 3. 흐름

```
1. AWS Console에서 Job 생성
2. 장비 배송
3. 고객 데이터센터에서 NFS/S3 API로 데이터 적재
4. AWS로 발송
5. AWS가 S3 버킷으로 복사
6. 장비 안전 폐기 (NIST 800-88 wipe)
```

### 4. 네트워크 vs Snow 비교

10Gbps 회선으로 100TB:
- 이론상 22.2시간 — 실제로는 50% 효율 → 1.8일
- Snow Edge 80TB × 2개: 배송 7-10일·왕복 14일

**Snow가 유리할 때**:
- 회선 100Mbps 이하
- 데이터 1PB 이상
- 물리 격리·해상·전쟁 지역

### 5. DataSync vs Snow vs SG

| 도구 | 시나리오 |
|------|---------|
| **DataSync** | 회선 있음 + 1TB~수십TB + 자동 검증 + 정기 |
| **Snow** | 회선 부족·격리 환경·페타바이트 |
| **Storage Gateway** | 상시 마운트 액세스 |
| **DMS** | 데이터베이스 |
| **MGN** | 서버 lift-and-shift |

---

## 🧠 알아두면 좋은 심화 이론

### DataSync 주요 기능

- 다중 스레드, 자동 무결성 검증
- 온프레미스 ↔ S3·EFS·FSx
- 스케줄링·필터
- AWS Storage 간 (S3 → EFS) 도 지원

### Cross-Reference

- **Day 17**: Storage Gateway
- **Week 6**: MGN·DMS

---

## 🏗️ 아키텍처 다이어그램 — Snow Edge 사용

```
1. 주문 ─→ AWS 배송 (2일)
2. 설치 ─→ 고객 DC LAN 연결
3. 데이터 적재 (NFS/S3 API)
   ┌────────────────────┐
   │ Snowball Edge      │ ◄── 온프레 서버
   │  80TB Storage      │
   │  암호화 (KMS)      │
   └────────────────────┘
4. 반환 ─→ AWS 데이터센터 (2-3일)
5. AWS가 S3 버킷에 import
6. 검증 + 장비 wipe
```

---

## ⭐ 핵심 포인트

1. ⭐ **회선 100Mbps 이하 또는 PB급 = Snow**
2. ⭐ **회선 있음 + 자동 검증 + 정기 = DataSync**
3. ⭐ Snowball Edge **Compute**는 엣지 EC2/Lambda 실행
4. ⭐ Snowmobile 단종, 다수 Snowball 사용
5. ⭐ KMS 암호화·NIST wipe로 보안 보장

---

## 💻 실제 예시 - Snow Job 생성 (콘솔 흐름)

```
Console → Snow Family → Create job
  - Job type: Import to S3
  - Device: Snowball Edge Storage Optimized
  - S3 bucket: my-migration-bucket
  - KMS Key
  - Shipping address
→ 2-3일 후 장비 도착
```

---

## 📝 연습 문제

**문제 1.** 500TB 데이터를 회선 100Mbps 환경에서 AWS로 옮긴다. Best?

A) DataSync
B) Snowball Edge 다수
C) Site-to-Site VPN
D) Storage Gateway

**정답: B**
해설: 회선 협소 + 대량 = Snow.

---

**문제 2.** 1TB 데이터를 매주 S3로 동기화, 회선 1Gbps. Best?

A) Snow
B) DataSync 스케줄
C) Tape Gateway
D) Direct Connect만

**정답: B**
해설: 정기 + 회선 있음 = DataSync.

---

**문제 3.** 선박 위 군용 환경, 네트워크 단절 자주. 엣지 EC2 실행. Best?

A) Snowball Edge Compute Optimized
B) Outposts
C) Storage Gateway
D) Direct Connect

**정답: A**
해설: 격리 환경 + 엣지 컴퓨팅 = Snow Compute.

---

**문제 4.** Snow 데이터 보안 (분실 우려)?

A) 평문 저장
B) KMS 256bit 암호화 + NIST 800-88 wipe
C) 사용자 비밀번호
D) MFA

**정답: B**
해설: Snow는 KMS 암호화 기본 + 폐기 wipe.

---

**문제 5.** Snow 장비 도착 후 데이터 적재 방법은?

A) AWS Console에서 직접 업로드
B) NFS / S3 API (장비가 제공)
C) HTTPS PUT
D) FTP

**정답: B**
해설: Snow는 로컬 NFS·S3 API 제공.

---

**문제 6.** 100TB를 1Gbps 회선, 정기 동기화·자동 검증. Best?

A) Snow
B) DataSync (병렬·검증·스케줄)
C) Tape Gateway
D) Direct Connect 일회성 카피

**정답: B**
해설: DataSync가 자동 검증·병렬·정기.

---

## 📌 오늘의 요약

1. Snow Family = 페타바이트 물리 전송 / 엣지 컴퓨팅
2. 회선 협소·격리 환경은 Snow, 회선 충분은 DataSync
3. Snowmobile 단종 — 다수 Snowball 사용
4. Snow는 KMS + NIST wipe 보안
5. DataSync vs SG vs MGN vs DMS는 시나리오로 구분
