# Day 12 - EBS, Instance Store, EFS, FSx

📅 날짜: Week 3 (Day 2)
🎯 주제: EC2 스토리지 옵션 — 블록 vs 파일
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- EBS 볼륨 타입 5가지의 IOPS/Throughput 차이를 안다
- Instance Store vs EBS의 휘발성 차이를 설명한다
- EFS, FSx 4종(Windows/Lustre/ONTAP/OpenZFS)을 시나리오로 매핑한다

---

## 🧩 사전 지식 (CS 기초)

- **블록 vs 파일 vs 객체 스토리지**:
  - 블록(EBS) = "디스크" 추상. 임의 위치 R/W. OS가 파일 시스템 포맷.
  - 파일(EFS/FSx) = NFS/SMB 공유. 여러 클라이언트가 동시 접근.
  - 객체(S3) = HTTP API. 키-값. 대용량·내구성.
- **IOPS vs Throughput**: 초당 I/O 요청 수 vs 초당 데이터량. 작은 랜덤 = IOPS, 큰 시퀀셜 = Throughput.
- **휘발성(Volatile)**: 전원 끄면 사라짐. 인스턴스 스토어가 휘발성.

---

## 📖 이론 내용

### 1. EBS 볼륨 타입

| 타입 | 용도 | 성능 |
|------|------|------|
| **gp3** (디폴트) | 범용 SSD | 3,000~16,000 IOPS, 125~1000 MB/s 별도 |
| **gp2** | 구버전 범용 | 1GB당 3 IOPS, 16K 상한 |
| **io2 Block Express** | 미션 크리티컬 DB | 256K IOPS, ms 지연 |
| **io1/io2** | 고성능 DB | 64K IOPS |
| **st1** | 스루풋 HDD | 빅데이터·로그 |
| **sc1** | 콜드 HDD | 거의 안 쓰는 백업 |

- **gp3가 gp2보다 저렴 + 빠름** → 새로 만들면 gp3.
- 볼륨은 **AZ 종속**. 다른 AZ 인스턴스에 붙일 수 없음 → 스냅샷 후 복원.

### 2. EBS 스냅샷

- S3에 저장(보이지 않음). 증분 백업.
- **다른 리전/계정 복사 가능** → 마이그레이션·DR.
- **EBS Snapshot Archive**: 75% 비용 절감, 24~72시간 복원.
- **FSR (Fast Snapshot Restore)**: 첫 액세스 지연 제거(추가 비용).

### 3. Instance Store

- **물리 호스트에 부착된 NVMe**.
- 가장 빠름. 그러나 **인스턴스 중지/종료/실패 시 데이터 손실**.
- 사용 사례: 캐시, 임시 데이터, 분산 DB의 노드 디스크.

### 4. EFS (Elastic File System)

- **NFS v4.1**, **Linux 전용**.
- 자동 확장. Multi-AZ 동시 접근.
- 스토리지 클래스: Standard / IA / One Zone / Archive.
- Performance mode: General Purpose / Max I/O.
- Throughput mode: Bursting / Provisioned / Elastic.

### 5. FSx 4종

| 서비스 | 프로토콜 | 사용 사례 |
|--------|----------|-----------|
| **FSx for Windows File Server** | SMB, NTFS, AD 통합 | Windows 워크로드, 파일 공유 |
| **FSx for Lustre** | POSIX, 초고속 병렬 | HPC, ML 학습, S3 연동 |
| **FSx for NetApp ONTAP** | NFS/SMB + iSCSI, 스냅샷·SnapMirror | 멀티 프로토콜, 마이그레이션 |
| **FSx for OpenZFS** | NFS, ZFS 스냅샷·복제 | Linux 워크로드, 데이터 무결성 |

> 💡 시험에서 "Lustre = HPC/ML / Windows = AD·SMB / ONTAP = 멀티 프로토콜 + NetApp 마이그레이션".

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Multi-Attach (io1/io2)** | 한 볼륨을 여러 EC2가 동시 마운트 (클러스터 SW만) | 시나리오 등장 |
| **EBS 암호화** | 신규 볼륨 / 스냅샷 / 복원 시 자동 가능 | 기본 활성화 권장 |
| **EFS Access Point** | POSIX 사용자/디렉토리별 분리 마운트 | 멀티 테넌트 |
| **DataSync** | 온프레↔AWS 파일 마이그레이션 | "수 TB 마이그레이션" 시나리오 |
| **Storage Gateway** | 온프레→AWS 캐시/백업 게이트웨이 | 하이브리드 |

> ⚠️ **함정**: "Windows 파일 서버 + AD" → EFS ❌, **FSx for Windows** ✅.

> 💡 **암기 팁**: 블록 = **E**BS, 파일(Linux) = **E**FS, 파일(Windows) = FSx **W**indows, ML/HPC = FSx **L**ustre.

### 관련 서비스 Cross-Reference

- S3 Storage Gateway → Week 4
- DataSync 마이그레이션 → Week 11
- KMS 암호화 → Week 8

---

## 🏗️ 아키텍처 다이어그램

```
[ 스토리지 선택 결정 트리 ]

  사용처가 EC2 한 대?
   ├─ 예 → 휘발성 OK?
   │        ├─ 예  → Instance Store (NVMe)
   │        └─ 아니오 → EBS (gp3 디폴트)
   └─ 아니오 (여러 대 공유)
            ├─ Linux NFS → EFS
            ├─ Windows SMB + AD → FSx for Windows
            ├─ HPC / ML 학습 → FSx for Lustre
            └─ NetApp 마이그레이션 → FSx ONTAP

  파일 단위 vs 객체 단위?
   └─ 객체 / 정적 / 백업 → S3
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **EBS는 AZ 종속**. Cross-AZ 이동은 스냅샷.
2. ⭐ **gp3가 디폴트** (gp2보다 저렴·빠름).
3. ⭐ **Instance Store는 휘발성**.
4. ⭐ **EFS = Linux NFS / FSx Windows = SMB·AD / FSx Lustre = HPC·ML**.
5. ⭐ **io1/io2 Multi-Attach**는 클러스터 SW가 있을 때만.

---

## 💻 실제 예시 - AWS CLI

```bash
# gp3 EBS 생성 (베이스라인 + 추가 IOPS/Throughput 별도)
aws ec2 create-volume \
  --availability-zone ap-northeast-2a \
  --size 100 --volume-type gp3 \
  --iops 6000 --throughput 250

# 스냅샷 + 다른 리전 복사
aws ec2 create-snapshot --volume-id vol-...
aws ec2 copy-snapshot --source-region ap-northeast-2 \
  --source-snapshot-id snap-... --destination-region us-east-1

# EFS 생성
aws efs create-file-system --performance-mode generalPurpose \
  --throughput-mode elastic

# FSx for Lustre (S3 연동)
aws fsx create-file-system --file-system-type LUSTRE \
  --storage-capacity 1200 --subnet-ids subnet-... \
  --lustre-configuration ImportPath=s3://my-bucket/
```

---

## 📝 연습 문제

**문제 1.** EBS gp2를 사용 중인데 IOPS와 비용을 같이 줄이고 싶다. 권장은?

A) sc1 전환 B) gp3 전환 C) io2 전환 D) Instance Store

**정답: B**.

---

**문제 2.** Linux EC2 여러 대가 공유 파일 시스템 필요. 멀티 AZ.

A) EBS Multi-Attach B) EFS C) FSx Windows D) S3

**정답: B**.

---

**문제 3.** Windows AD 통합 공유 파일 서버:

A) EFS B) FSx for Windows C) FSx Lustre D) S3 + Storage Gateway

**정답: B**.

---

**문제 4.** ML 학습 데이터셋(수십 TB)에 초고속 병렬 읽기 + S3 연동:

A) EFS Max I/O B) FSx Lustre C) FSx ONTAP D) gp3 EBS

**정답: B**.

---

**문제 5.** EC2 종료 시 데이터가 사라지면 안 됨. 부팅 디스크는?

A) Instance Store B) EBS C) EFS D) S3

**정답: B** — EBS는 인스턴스 종료에도 보존(별도 옵션).

---

## 📌 오늘의 요약

1. EBS는 블록·AZ 종속. gp3가 디폴트.
2. Instance Store는 휘발성, 캐시·임시 워크로드만.
3. 공유 파일은 EFS(Linux) / FSx Windows / FSx Lustre / FSx ONTAP.
4. 스냅샷은 cross-region/account 복사 가능.
5. 시나리오 키워드 → 정답: AD·SMB → FSx Windows, HPC·ML → Lustre, NFS → EFS, NetApp → ONTAP.
