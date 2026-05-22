# Day 68 - Resilience Hub·Fault Injection Simulator

📅 Week 14 (Day 3)
🎯 주제: 복원력 검증 자동화
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- Resilience Hub로 RTO/RPO 정책 평가
- FIS로 카오스 엔지니어링 실행
- DRS와 MGN의 DR 위치 차이

---

## 🧩 사전 지식 (CS 기초)

- **Chaos Engineering**: 의도적 장애 주입으로 시스템 회복력 검증
- **Game Day**: 운영팀이 실제 시뮬레이션 훈련하는 날
- **Blast Radius**: 장애 영향 범위

---

## 📖 이론 내용

### 1. AWS Resilience Hub

- 워크로드 RTO/RPO 목표 정의 → **정책 위반·격차 식별**
- 리소스 검색: CFN·Terraform·ResourceGroup
- **추천 사항** (Multi-AZ 추가·백업 강화 등)
- FIS 실험 자동 생성

### 2. Fault Injection Simulator (FIS)

- AWS 관리형 카오스 엔지니어링 서비스
- **Experiment Template** → Targets + Actions
- 액션 예: EC2 중지·CPU 스트레스·API throttle·네트워크 지연·RDS Failover

### 3. FIS 안전장치

- **Stop Condition**: CloudWatch Alarm 발동 시 자동 중단
- IAM Role 권한 분리
- 영향 범위 사전 정의

### 4. AWS Elastic Disaster Recovery (DRS)

- **온프레/타 클라우드 → AWS DR** (블록 레벨 복제)
- 또는 AWS Region → 다른 AWS Region
- RPO 초·RTO 분
- MGN과 동일 엔진 (이전: CloudEndure DR/Migration)

### 5. MGN vs DRS

| 항목 | MGN (Migration) | DRS (Disaster Recovery) |
|------|----------------|--------------------------|
| 목적 | 일회성 마이그레이션 | 지속적 DR |
| 컷오버 | 한 번 | 반복 가능 (Drill) |
| 비용 | 이전 후 종료 | 지속 |

### 6. Route 53 ARC (Application Recovery Controller)

- **Readiness Check**: DR 사이트 준비 상태 확인
- **Routing Control**: Failover 결정을 정밀 제어 (의도적 사람 의사결정)
- **Zonal Shift**: 특정 AZ 트래픽 제외

---

## 🧠 심화 이론

### 함정 포인트

- **"DR 정책 자동 평가·격차 식별"** → Resilience Hub
- **"운영 중 의도적 장애 시뮬레이션"** → FIS
- **"온프레 → AWS DR"** → DRS
- **"사람 의사결정으로 Failover"** → Route 53 ARC Routing Control
- **"문제 AZ만 트래픽 제외"** → Zonal Shift

### Game Day 자동화

- FIS Template + EventBridge Schedule + Step Functions

---

## 🏗️ 아키텍처 — 카오스 + 복원력

```
[Resilience Hub]
    │ RTO/RPO 정책 정의
    ▼
[FIS Experiment]
    ├─ EC2 stop
    ├─ Network latency
    └─ RDS failover
    │
[Stop Condition: CW Alarm]
    │
[결과: HRI·개선 권고]
```

---

## ⭐ 핵심 포인트

1. ⭐ Resilience Hub = RTO/RPO 정책·격차
2. ⭐ FIS = 관리형 카오스 (Stop Condition 필수)
3. ⭐ DRS = 지속적 DR / MGN = 일회성 마이그레이션
4. ⭐ Route 53 ARC = 정밀 Failover 제어
5. ⭐ Zonal Shift = 문제 AZ 격리

---

## 💻 CLI 예시

```bash
# FIS 실험 시작
aws fis start-experiment \
  --experiment-template-id EXTxxxx
```

---

## 📝 연습 문제

**문제 1.** 워크로드 RTO 격차 자동 식별·권고.

A) Trusted Advisor
B) Resilience Hub
C) Well-Architected Tool
D) Config

**정답: B**

---

**문제 2.** 운영 중 EC2 의도적 중지·CPU 스트레스.

A) Systems Manager Run Command
B) FIS
C) Auto Scaling
D) Chaos Monkey 자체

**정답: B**

---

**문제 3.** 카오스 실험 도중 알람 발생 시 자동 중단.

A) Lambda
B) FIS Stop Condition
C) Step Functions
D) EventBridge

**정답: B**

---

**문제 4.** 온프레 → AWS DR.

A) MGN
B) DRS (Elastic Disaster Recovery)
C) DataSync
D) Snowball

**정답: B**

---

**문제 5.** 의도적 사람 의사결정으로 Multi-Region Failover.

A) Route 53 Health Check만
B) Route 53 ARC Routing Control
C) Global Accelerator
D) Lambda

**정답: B**

---

**문제 6.** 문제 AZ만 즉시 트래픽 차단.

A) NACL 변경
B) Route 53 ARC Zonal Shift
C) ASG Detach
D) ALB Drain

**정답: B**

---

## 📌 오늘의 요약

1. Resilience Hub = 정책·격차·권고
2. FIS = 카오스·Stop Condition 안전
3. DRS = 지속 DR / MGN = 일회성
4. Route 53 ARC·Zonal Shift 정밀 제어
