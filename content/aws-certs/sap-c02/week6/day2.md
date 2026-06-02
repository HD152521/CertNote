# Day 27 - AWS Application Migration Service (MGN)

📅 날짜: Week 6 (Day 2)
🎯 주제: 서버 lift-and-shift 표준 도구
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- MGN의 동작 원리(에이전트·연속 복제)를 안다
- Test → Cutover 흐름과 RPO/RTO를 안다
- MGN vs SMS vs Server Migration Connector·CloudEndure 관계를 안다

---

## 🧩 사전 지식 (CS 기초)

- **Block-Level Replication**: 디스크 블록 단위 연속 복제. 파일 단위보다 일관성 높음.
- **Cutover**: 실제 서비스를 신규 환경으로 전환.
- **Pilot Lighting**: 짧은 시간 부팅·검증.

---

## 📖 이론 내용

### 1. MGN 본질

- 구 CloudEndure Migration의 후속
- **블록 레벨 연속 복제** → AWS Staging Area
- 짧은 컷오버 윈도우 (수분)
- 다양한 원본 OS (Linux·Windows) 지원

### 2. 흐름

```
1. Replication Agent 설치 (원본 서버)
2. 디스크 블록을 AWS Staging Area로 연속 복제
3. Test 인스턴스 부팅 (테스트 가능, 원본 무중단)
4. Cutover: 최종 동기화 → 새 EC2 인스턴스 출범
5. 원본 폐기·운영 시작
```

### 3. 장점

- **저지연 컷오버** (수분~수십분)
- 원본 운영 중에도 연속 복제 (다운타임 최소)
- 자동 인스턴스 유형 매핑 (right-size)
- AWS 콘솔에서 일괄 관리

### 4. MGN vs SMS

- **SMS (Server Migration Service)**: 이전 도구, 단종 예정
- **MGN**: 신규 표준
- 시험에서는 MGN을 정답으로

### 5. 대규모 마이그레이션 패턴

- Wave (배치)로 100~1000대씩 그룹
- 의존성 매핑 (ADS) → Wave 설계
- 자동 인스턴스 유형 선택 + 사후 Right-Sizing(Compute Optimizer)

---

## 🧠 알아두면 좋은 심화 이론

### Disaster Recovery 활용

- MGN은 DR에도 사용 가능 — **AWS Elastic Disaster Recovery (DRS)**
- 동일 블록 복제 메커니즘 + DR용 RPO 짧음

### Cross-Reference

- **Day 26**: 7R
- **Day 28**: DMS (DB는 별도)
- **Week 14**: DRS (DR)

---

## 🏗️ 아키텍처 다이어그램 — MGN

```
On-Prem / Other Cloud
   Server (Replication Agent)
            │
            │  블록 복제 (TLS)
            ▼
   AWS Staging Area (저비용 EBS·t3)
            │
            │  Test Launch (필요 시 반복)
            ▼
   Test Instance ────── 검증
            │
            │  Cutover
            ▼
   Production EC2 (자동 유형 매핑)
```

---

## ⭐ 핵심 포인트

1. ⭐ **MGN = lift-and-shift 표준** (Rehost)
2. ⭐ **블록 레벨 연속 복제**, 다운타임 최소
3. ⭐ Test → Cutover 흐름
4. ⭐ **DRS는 MGN과 동일 엔진** (DR용)
5. ⭐ SMS는 종료, 시험에서 MGN을 정답으로

---

## 💻 실제 예시 - Agent 설치

```bash
# 원본 서버에서
wget https://aws-application-migration-service-ap-northeast-2.s3.amazonaws.com/latest/linux/aws-replication-installer-init.py
sudo python3 aws-replication-installer-init.py
# IAM 액세스 키/지역 입력 → Agent 등록 → AWS 콘솔에 표시
```

---

## 📝 연습 문제

**문제 1.** 1000대 VM 마이그레이션 표준. Best?

A) SMS
B) MGN
C) Server Migration Connector
D) Snow

**정답: B**
해설: MGN이 현재 표준.

---

**문제 2.** MGN 복제 방식은?

A) 파일 단위
B) 블록 레벨 연속
C) Snapshot 주기
D) Database Replication

**정답: B**
해설: 블록 레벨 연속 복제.

---

**문제 3.** 운영 중인 원본 무중단으로 신규 EC2 출범. Best?

A) Snapshot copy
B) MGN (Cutover)
C) DataSync
D) Snow

**정답: B**
해설: MGN이 무중단 컷오버.

---

**문제 4.** MGN과 동일 엔진을 DR에 활용. Best?

A) AWS Backup
B) DRS (Elastic Disaster Recovery)
C) MGN을 그대로
D) DMS

**정답: B**
해설: DRS = MGN 기반 DR.

---

**문제 5.** 마이그레이션 의존성 매핑하여 Wave 설계. Best?

A) MGN만
B) ADS + Migration Hub
C) DMS
D) Snow

**정답: B**
해설: ADS가 종속성 발견, Hub가 통합 추적.

---

**문제 6.** 마이그레이션 후 인스턴스 유형 최적화. Best?

A) Trusted Advisor
B) Compute Optimizer
C) Cost Explorer
D) Budgets

**정답: B**
해설: Compute Optimizer = Right-Sizing.

---

## 📌 오늘의 요약

1. MGN = Rehost 표준 도구, 블록 레벨 연속 복제
2. Test → Cutover (수분 다운타임)
3. SMS는 구식, MGN 정답
4. DRS는 MGN 엔진 DR용
5. ADS + Hub + Compute Optimizer로 완성
