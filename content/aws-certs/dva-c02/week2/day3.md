# Day 8 - EC2 스토리지: EBS, 인스턴스 스토어

📅 날짜: 2026년 5월 26일 (화요일)  
🎯 주제: EC2 스토리지 옵션  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- EBS(Elastic Block Store)의 볼륨 유형과 특성을 이해한다
- 인스턴스 스토어와 EBS의 차이점을 구분한다
- EBS 스냅샷의 동작 방식과 활용 방법을 이해한다
- EBS 암호화 방식을 이해한다

---

## 📖 이론 내용

### 1. Amazon EBS (Elastic Block Store)

EBS는 EC2 인스턴스에 연결할 수 있는 네트워크 기반 블록 스토리지입니다.

**EBS 특징:**
- 인스턴스와 독립적으로 존재 (인스턴스 종료 후에도 데이터 보존 가능)
- 하나의 AZ에 종속적
- 네트워크를 통해 인스턴스에 연결 (약간의 지연 발생)
- **⭐ 기본적으로 하나의 인스턴스에만 연결 가능** (EBS Multi-Attach 제외)
- 최대 16TB 크기

**EBS 볼륨 유형:**

| 유형 | 특성 | IOPS | 사용 사례 |
|------|------|------|-----------|
| **gp3** (범용 SSD) | 기본, 저렴 | 3,000~16,000 | 일반 워크로드, 부팅 볼륨 |
| **gp2** (범용 SSD) | gp3 이전 세대 | 최대 16,000 | 부팅 볼륨, 소/중 워크로드 |
| **io1/io2** (프로비저닝 IOPS SSD) | 고성능, 비쌈 | 최대 64,000 | 고성능 DB, 지연 시간 민감 |
| **st1** (처리량 최적화 HDD) | 순차 읽기/쓰기 | 최대 500MB/s | 빅데이터, 데이터 웨어하우스 |
| **sc1** (콜드 HDD) | 최저 비용 | 최대 250MB/s | 자주 접근 안 하는 데이터 |

**⭐ 핵심 차이:**
- gp3 > gp2: IOPS와 처리량을 독립적으로 설정 가능 (비용 절감)
- io2 > io1: 더 높은 내구성 (99.999% vs 99.9%)
- **HDD(st1, sc1)는 부팅 볼륨으로 사용 불가**

### 2. EBS 스냅샷 (Snapshot)

스냅샷은 EBS 볼륨의 특정 시점 백업입니다.

**스냅샷 특성:**
- **증분식 백업**: 첫 번째 스냅샷은 전체, 이후는 변경분만 저장
- Amazon S3에 저장 (직접 접근 불가, S3 API 사용 불가)
- 리전 내에서 생성되며, 다른 리전으로 복사 가능
- 스냅샷으로 새 EBS 볼륨 생성 (다른 AZ나 리전 가능)

**스냅샷 기능:**
- **EBS Snapshot Archive**: 75% 저렴한 Glacier로 아카이브 (복구에 24~72시간)
- **Recycle Bin**: 삭제된 스냅샷을 일정 기간 보존 (실수 복구용)
- **Fast Snapshot Restore (FSR)**: 스냅샷에서 즉시 전체 성능 복원 (비용 추가)

### 3. 인스턴스 스토어 (Instance Store)

인스턴스 스토어는 EC2 호스트 서버에 물리적으로 연결된 임시 스토리지입니다.

**특징:**
- **⭐ 임시(Ephemeral) 스토리지**: 인스턴스 중지/종료 시 데이터 소멸
- EBS보다 훨씬 높은 I/O 성능 (수백만 IOPS)
- 비용이 EC2 인스턴스 비용에 포함
- 재부팅 시 데이터 유지, 중지/종료 시 소멸

**사용 사례:**
- 임시 데이터 (캐시, 버퍼, 스크래치 파일)
- 분산 처리 (각 노드가 독립적 데이터 사용)
- 고성능 I/O가 필요한 임시 워크로드

### 4. EBS vs 인스턴스 스토어 비교

| 특성 | EBS | 인스턴스 스토어 |
|------|-----|----------------|
| 지속성 | 영구 (인스턴스와 독립) | 임시 (인스턴스 종료 시 소멸) |
| 성능 | 최대 64,000 IOPS (io2) | 수백만 IOPS |
| 연결 | 네트워크 | 물리적 (로컬) |
| 스냅샷 | 지원 | 미지원 |
| 크기 변경 | 가능 (실시간) | 불가 |
| 비용 | 별도 과금 | 인스턴스에 포함 |

### 5. EBS 암호화

- AWS KMS 키를 사용한 AES-256 암호화
- 암호화된 볼륨에서 생성된 스냅샷도 암호화
- 암호화된 스냅샷으로 생성된 볼륨도 암호화
- **⭐ 미암호화 볼륨 암호화 방법**: 스냅샷 생성 → 스냅샷 복사 시 암호화 → 암호화된 스냅샷으로 새 볼륨 생성

---

## 🧠 알아두면 좋은 심화 이론

### EBS Multi-Attach - 시험 특이 사례

- io1/io2 볼륨만 지원
- **같은 AZ 내** 최대 16개 인스턴스에 동시 연결 (Nitro 인스턴스만)
- 일반 파일시스템(ext4/xfs)은 클러스터링 미지원 → 클러스터 파일시스템(GFS2 등) 필요
- 사용 사례: 공유 스토리지가 필요한 클러스터 DB (Oracle RAC 등)

> ⚠️ **함정**: "EBS 하나를 여러 EC2가 동시 사용" → 일반 gp3/gp2로는 불가. io1/io2 + Multi-Attach + 클러스터 FS 필요.

### EBS vs EFS vs FSx vs Instance Store (가장 자주 출제되는 비교)

| 서비스 | 유형 | 다중 인스턴스 | AZ |
|--------|------|--------------|-----|
| **EBS** | 블록 | 기본 X (Multi-Attach 예외) | 단일 AZ |
| **EFS** | NFS 파일 | ✅ 수천 개 | 다중 AZ |
| **FSx for Lustre** | 고성능 HPC 파일 | ✅ | 단일 AZ |
| **FSx for Windows** | SMB Windows 파일 | ✅ | 다중 AZ 옵션 |
| **FSx for NetApp ONTAP** | 다중 프로토콜 | ✅ | 다중 AZ |
| **Instance Store** | 로컬 블록 | X (호스트 종속) | - |
| **S3** | 객체 | ✅ 무한 | 리전 (단일 AZ 옵션) |

> 💡 시나리오 키워드:
> - "여러 EC2가 동일 파일 공유" → **EFS**
> - "Windows 파일 공유" → **FSx for Windows**
> - "고성능 임시 스토리지" → **Instance Store** (또는 io2)
> - "HPC 병렬 파일시스템" → **FSx for Lustre**

### EBS 성능 - IOPS vs Throughput

```
gp3:  최대 16,000 IOPS  /  최대 1,000 MB/s
io2:  최대 64,000 IOPS  /  최대 1,000 MB/s
io2 Block Express:  최대 256,000 IOPS  /  최대 4,000 MB/s
st1:  최대 500 IOPS    /  최대 500 MB/s  (HDD, 처리량 우선)
sc1:  최대 250 IOPS    /  최대 250 MB/s  (HDD, 최저비용)
```

> ⚠️ **함정**: HDD는 IOPS 낮아 보여도 **대용량 순차 읽기/쓰기 처리량은 높음** (빅데이터 처리에 적합). 작은 랜덤 액세스에는 SSD 필수.

### EBS 스냅샷 고급 기능

| 기능 | 설명 |
|------|------|
| **Snapshot Archive** | 75% 저렴, 복구 24~72시간, 최소 90일 보관 |
| **Fast Snapshot Restore (FSR)** | 즉시 전체 성능, AZ별 활성화 (비용 ↑) |
| **EBS Recycle Bin** | 삭제된 스냅샷/AMI 일정 기간 보존 |
| **Snapshot Lock** | 거버넌스/규정 준수용 변경 금지 |
| **Cross-Region Copy** | 다른 리전으로 복사 (KMS 재암호화 필수) |
| **Cross-Account Sharing** | 다른 계정에 스냅샷 공유 (암호화는 키 정책 필요) |

### Data Lifecycle Manager (DLM)

- EBS 스냅샷/AMI 자동 백업 정책
- 시험 시나리오: "매일 자동 백업 + 7일 보관" → DLM 정책
- AWS Backup으로 통합되어 가는 추세

### EBS-Optimized 인스턴스

- EC2와 EBS 사이 전용 네트워크 대역 제공
- 최신 인스턴스(Nitro)는 기본 활성화 + 무료
- 구형 인스턴스는 옵션 활성화 시 추가 요금

### 실무 사례 - 스토리지 선택 가이드

```
요구사항                           → 선택
─────────────────────────────────────────
부팅 디스크 (소~중규모)            → gp3
데이터베이스 (지연 시간 민감)      → io2 / io2 Block Express
빅데이터 / 로그 처리 (순차 IO)     → st1 (HDD 처리량)
콜드 아카이브 (가끔 접근)          → sc1
임시 캐시/스크래치                → 인스턴스 스토어 (NVMe)
여러 EC2 파일 공유                → EFS
컨테이너 영구 볼륨                → EBS CSI Driver + gp3 / EFS
ML 학습 데이터셋                  → FSx for Lustre (S3 연동)
```

### 관련 서비스 Cross-Reference

- **EBS ↔ AWS Backup** → 통합 백업 관리
- **EBS ↔ KMS** → [Week 9 Day 1] 봉투 암호화
- **EFS ↔ Lambda** → Lambda가 EFS 마운트 가능 (서버리스 파일 공유)
- **S3 ↔ EBS 스냅샷** → 사용자 직접 접근 불가, AWS 관리

---

## 아키텍처 다이어그램

```
EC2 스토리지 구조
================================

     AZ-a                    AZ-b
+-------------+         +-------------+
|             |         |             |
| EC2 인스턴스 |         | EC2 인스턴스 |
|             |         |             |
| [인스턴스   |         |             |
|  스토어]    |         |             |
|  (임시)     |         |             |
|             |         |             |
+------+------+         +-------------+
       |
       | (네트워크)
       |
+------+------+    [스냅샷 복사]
|   EBS 볼륨  +-------------------> S3 (스냅샷)
| (gp3, io2)  |                      |
|   영구 저장  |                      | [다른 AZ/리전으로]
+------+------+                      | 볼륨 복원 가능
       |
       | (연결 해제 후)
       | (다른 인스턴스에 재연결 가능)


EBS 볼륨 유형 성능 비교
================================

io2 Block Express:  |||||||||||||||||||||  최대 256,000 IOPS
io1/io2:            ||||||||||||          최대 64,000 IOPS
gp3:                |||||||               최대 16,000 IOPS
gp2:                |||||||               최대 16,000 IOPS
st1 (HDD):          ||||                  최대 500 MB/s
sc1 (HDD):          ||                    최대 250 MB/s

(HDD 볼륨은 부팅 볼륨으로 사용 불가!)


EBS 암호화 상속 관계
================================

[암호화된 EBS 볼륨]
        |
        | 스냅샷 생성
        v
[암호화된 스냅샷] --> [암호화된 볼륨 생성]
        |
        | 복사 (암호화 적용)
        v
[암호화된 스냅샷 복사본] (다른 리전/계정)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **인스턴스 스토어 = 임시 스토리지**: 중지/종료 시 데이터 소멸 (재부팅은 유지)
2. ⭐ **HDD 볼륨(st1, sc1)**: 부팅 볼륨으로 사용 불가
3. ⭐ **gp3 > gp2**: IOPS/처리량 독립 설정 가능, 더 저렴
4. ⭐ **EBS는 AZ 종속적**: 볼륨은 하나의 AZ에만 존재
5. ⭐ **미암호화 → 암호화**: 스냅샷 생성 → 암호화 복사 → 새 볼륨 생성

---

## 💻 실제 예시 - EBS CLI 명령어

```bash
# EBS 볼륨 생성 (gp3, 100GB)
aws ec2 create-volume \
  --volume-type gp3 \
  --size 100 \
  --availability-zone ap-northeast-2a \
  --iops 3000 \
  --throughput 125 \
  --encrypted \
  --tag-specifications 'ResourceType=volume,Tags=[{Key=Name,Value=MyDataVolume}]'

# 볼륨을 인스턴스에 연결
aws ec2 attach-volume \
  --volume-id vol-1234567890abcdef0 \
  --instance-id i-1234567890abcdef0 \
  --device /dev/sdf

# EBS 스냅샷 생성
aws ec2 create-snapshot \
  --volume-id vol-1234567890abcdef0 \
  --description "Backup before major update" \
  --tag-specifications 'ResourceType=snapshot,Tags=[{Key=Name,Value=pre-update-backup}]'

# 스냅샷을 다른 리전으로 복사 (암호화 적용)
aws ec2 copy-snapshot \
  --source-region ap-northeast-2 \
  --source-snapshot-id snap-1234567890abcdef0 \
  --destination-region us-east-1 \
  --encrypted \
  --kms-key-id arn:aws:kms:us-east-1:123456789:key/mrk-xxx

# 스냅샷에서 볼륨 생성 (다른 AZ)
aws ec2 create-volume \
  --snapshot-id snap-1234567890abcdef0 \
  --availability-zone ap-northeast-2b \
  --volume-type gp3

# 볼륨 수정 (실시간 크기/유형 변경)
aws ec2 modify-volume \
  --volume-id vol-1234567890abcdef0 \
  --volume-type io2 \
  --size 200 \
  --iops 5000
```

**Linux에서 새 EBS 볼륨 마운트:**
```bash
# 파일 시스템 확인
lsblk

# 파일 시스템 생성 (새 볼륨)
sudo mkfs -t xfs /dev/xvdf

# 마운트 포인트 생성 및 마운트
sudo mkdir /data
sudo mount /dev/xvdf /data

# 재부팅 후 자동 마운트 (/etc/fstab 편집)
echo "/dev/xvdf /data xfs defaults,nofail 0 2" | sudo tee -a /etc/fstab
```

---

## 📝 연습 문제

**문제 1.** EC2 인스턴스 스토어에 대한 올바른 설명은?

A) 인스턴스 종료 후에도 데이터가 보존된다  
B) 스냅샷을 통해 백업이 가능하다  
C) 인스턴스 재부팅 시 데이터가 소멸된다  
D) 인스턴스 중지 및 종료 시 데이터가 소멸된다  

**정답: D**  
해설: 인스턴스 스토어는 임시 스토리지로 인스턴스 중지 또는 종료 시 데이터가 소멸됩니다. 재부팅 시에는 데이터가 유지됩니다.

---

**문제 2.** 부팅 볼륨으로 사용할 수 없는 EBS 볼륨 유형은?

A) gp2  
B) gp3  
C) io2  
D) st1  

**정답: D**  
해설: HDD 유형(st1, sc1)은 부팅 볼륨으로 사용할 수 없습니다. SSD 유형(gp2, gp3, io1, io2)은 부팅 볼륨으로 사용 가능합니다.

---

**문제 3.** 미암호화된 EBS 볼륨을 암호화하는 올바른 방법은?

A) 볼륨 설정에서 직접 암호화 활성화  
B) AWS 지원팀에 요청  
C) 스냅샷 생성 → 암호화하여 복사 → 암호화된 스냅샷으로 새 볼륨 생성  
D) KMS 키를 볼륨에 직접 적용  

**정답: C**  
해설: 실행 중인 볼륨을 직접 암호화할 수는 없습니다. 스냅샷을 만들고, 암호화 옵션을 적용하여 복사한 후, 그 스냅샷으로 새 볼륨을 생성해야 합니다.

---

**문제 4.** gp3와 gp2의 주요 차이점은?

A) gp3는 HDD이고 gp2는 SSD이다  
B) gp3는 IOPS와 처리량을 독립적으로 설정 가능하다  
C) gp2가 gp3보다 더 저렴하다  
D) gp3는 최대 64,000 IOPS를 지원한다  

**정답: B**  
해설: gp3는 IOPS(최대 16,000)와 처리량(최대 1,000 MB/s)을 스토리지 크기와 독립적으로 설정할 수 있습니다. gp2에서는 IOPS가 볼륨 크기(GB당 3 IOPS)에 연동됩니다.

---

**문제 5.** EBS 스냅샷의 저장 위치는?

A) EC2 인스턴스의 로컬 디스크  
B) Amazon S3 (AWS 관리)  
C) Amazon EFS  
D) Amazon Glacier (직접)  

**정답: B**  
해설: EBS 스냅샷은 Amazon S3에 저장되지만, 사용자가 직접 S3 콘솔이나 API로 접근할 수는 없습니다. 스냅샷은 AWS에서 자동으로 관리합니다.

---

## 📌 오늘의 요약

1. EBS는 영구 블록 스토리지로 인스턴스와 독립적으로 존재하며, AZ에 종속적이다
2. EBS 볼륨 유형: gp3/gp2(범용 SSD), io1/io2(고성능 SSD), st1/sc1(HDD, 부팅 불가)
3. 인스턴스 스토어는 고성능 임시 스토리지로 중지/종료 시 데이터가 소멸된다
4. EBS 스냅샷은 S3에 증분식으로 저장되며, 다른 AZ/리전에서 볼륨 복원이 가능하다
5. 미암호화 볼륨 암호화: 스냅샷 → 암호화 복사 → 새 볼륨 생성 (직접 암호화 불가)
