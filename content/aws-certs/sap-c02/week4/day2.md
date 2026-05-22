# Day 17 - Storage Gateway 4종 비교

📅 날짜: Week 4 (Day 2)
🎯 주제: 온프레미스 ↔ S3 하이브리드 스토리지
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Storage Gateway 4종(S3 File·FSx File·Volume·Tape)의 차이를 안다
- 각 모드의 캐싱·저장 방식과 적용 시나리오를 안다
- 백업·아카이브 대체로 어떤 모드를 쓰는지 안다

---

## 🧩 사전 지식 (CS 기초)

- **NFS / SMB**: 네트워크 파일 시스템 — Linux/macOS NFS, Windows SMB.
- **iSCSI**: 블록 스토리지 네트워크 프로토콜.
- **VTL (Virtual Tape Library)**: 테이프 백업 소프트웨어가 보는 가상 테이프.
- **Cache vs Stored**: 일부만 로컬 캐시 vs 전체 로컬 저장 + S3 비동기.

---

## 📖 이론 내용

### 1. Storage Gateway 4종 개요

| 종류 | 프로토콜 | 백엔드 | 사용처 |
|------|----------|--------|--------|
| **S3 File Gateway** | NFS/SMB | S3 | 파일을 S3 객체로 |
| **FSx File Gateway** | SMB | FSx for Windows File Server | Windows 파일 공유 캐시 |
| **Volume Gateway (Cached/Stored)** | iSCSI | S3 (EBS Snapshot) | 블록 스토리지 + 백업 |
| **Tape Gateway** | iSCSI (VTL) | S3 + Glacier | 테이프 백업 대체 |

### 2. S3 File Gateway

- 온프레미스 서버가 NFS/SMB로 마운트
- 파일 단위로 S3 객체로 저장
- 로컬 캐시(자주 쓰는 파일)
- 오브젝트 → S3 표준·IA·Glacier (lifecycle)

**사용처**: 미디어 아카이브, 데이터 레이크 적재, 파일 백업.

### 3. FSx File Gateway

- 온프레미스에서 FSx for Windows File Server를 SMB로 마운트
- 자주 쓰는 파일 로컬 캐시 → AWS 측 FSx에 동기화
- AD 통합 + ACL 보존

**사용처**: 글로벌 본사·지사 간 Windows 파일 공유.

### 4. Volume Gateway

#### Cached Mode
- 데이터는 S3에 저장, 로컬은 캐시만 (작은 디스크)
- iSCSI로 마운트
- **EBS Snapshot으로 백업 자동 가능**

#### Stored Mode
- 데이터 전부 로컬, S3에 비동기 백업
- 로컬 디스크가 충분히 크면 사용
- DR 시 EBS Volume으로 복구

**사용처**: 온프레미스 DB·VM 블록 스토리지 백업.

### 5. Tape Gateway

- 백업 소프트웨어(Veeam, NetBackup 등)가 보는 가상 테이프
- iSCSI VTL 프로토콜
- 백엔드: S3(Virtual Tape Library) + Glacier(Deep Archive)
- 물리 테이프 운영 대체 (테이프 폐기·운반 X)

**사용처**: 기존 테이프 백업 인프라 클라우드 이전.

### 6. 선택 가이드

- 파일 (NFS/SMB) → **S3 File Gateway** 또는 **FSx File Gateway**
- 블록 (iSCSI) → **Volume Gateway** (Cached/Stored)
- 테이프 백업 → **Tape Gateway**
- Windows AD ACL 유지 → **FSx File Gateway**

> ⚠️ **함정**: "기존 NetBackup·Veeam을 그대로 사용 + S3·Glacier 백엔드" → **Tape Gateway**.

---

## 🧠 알아두면 좋은 심화 이론

### DataSync vs Storage Gateway

| | DataSync | Storage Gateway |
|---|----------|------------------|
| 목적 | 일회성·정기 동기화 | **상시 하이브리드 액세스** |
| 모드 | 배치 전송 | 마운트 |
| 사용처 | 마이그레이션·DR 동기 | 일상 운영 |

### Direct Connect vs Storage Gateway

- DX는 네트워크 회선, SG는 스토리지 추상화 — 직교 개념.
- 함께 자주 사용 (SG over DX).

### Cross-Reference

- **Day 18**: Snow Family (대량 전송)
- **Week 14**: 백업·DR

---

## 🏗️ 아키텍처 다이어그램 — S3 File Gateway

```
On-Premises
  Linux/Windows 서버 ── NFS/SMB ──┐
                                  │
                          Storage Gateway VM/HW
                          (캐시 디스크)
                                  │
                                  ▼  HTTPS
                              AWS Region
                                  │
                              S3 Bucket
                                  │
                              Lifecycle → S3 IA → Glacier
```

---

## ⭐ 핵심 포인트

1. ⭐ 4종: **S3 File / FSx File / Volume / Tape**
2. ⭐ Windows AD ACL 유지 = **FSx File Gateway**
3. ⭐ 기존 백업 SW + 테이프 운영 → **Tape Gateway**
4. ⭐ Volume Cached(작은 로컬·S3) vs Stored(전체 로컬·S3 백업)
5. ⭐ Storage Gateway = 상시 마운트, **DataSync = 배치/정기 전송**

---

## 💻 실제 예시 - S3 File Gateway 흐름

```
NFS mount:
mount -t nfs -o nfsvers=4.1 gateway-ip:/export/share /mnt/data

cp ./report.csv /mnt/data/
→ 백엔드 S3 버킷에 report.csv 객체 생성 (S3 표준)
→ 30일 후 Lifecycle로 S3 IA, 90일 후 Glacier
```

---

## 📝 연습 문제

**문제 1.** 온프레미스 Windows 파일 공유 + AD ACL 유지. 클라우드 백업과 캐시. Best?

A) S3 File Gateway
B) FSx File Gateway
C) Volume Gateway
D) Tape Gateway

**정답: B**
해설: FSx File Gateway가 Windows AD/ACL 지원.

---

**문제 2.** 기존 NetBackup 사용, 테이프 폐기. S3+Glacier로 백엔드. Best?

A) S3 File Gateway
B) DataSync
C) Tape Gateway
D) Snow

**정답: C**
해설: Tape Gateway = VTL 호환 + S3/Glacier 백엔드.

---

**문제 3.** 온프레미스 VM의 블록 스토리지를 S3에 백업, 로컬엔 캐시만. Best?

A) Volume Gateway Cached
B) Volume Gateway Stored
C) S3 File Gateway
D) Tape Gateway

**정답: A**
해설: Cached = S3 주 저장 + 로컬 캐시.

---

**문제 4.** 100TB 일회성 데이터 마이그레이션. Best?

A) Storage Gateway
B) DataSync 또는 Snow Family
C) Tape Gateway
D) VPN

**정답: B**
해설: 일회성 대량은 DataSync 또는 Snow. SG는 상시.

---

**문제 5.** 미디어 회사가 영상 아카이브를 NFS로 마운트, S3에 저장, lifecycle로 Glacier. Best?

A) S3 File Gateway
B) FSx File Gateway
C) Tape Gateway
D) DataSync

**정답: A**
해설: NFS + S3 + Lifecycle = S3 File Gateway 표준.

---

**문제 6.** Volume Gateway에서 빠른 DR을 위해 EBS Volume으로 즉시 복구하려면?

A) S3 객체 다운로드
B) EBS Snapshot 사용 (Volume GW가 자동 생성)
C) Storage Gateway 재설치
D) DataSync

**정답: B**
해설: Volume GW는 EBS Snapshot 자동 생성, EBS로 즉시 복구.

---

## 📌 오늘의 요약

1. 4종: S3 File·FSx File·Volume·Tape
2. Windows AD = FSx File, 일반 NFS/SMB = S3 File
3. 기존 백업 SW + 테이프 대체 = Tape Gateway
4. SG는 상시 마운트, DataSync는 배치
5. Volume Cached = S3 저장 + 로컬 캐시, Stored = 로컬 전체 + S3 백업
