# Day 4 - S3 복제(CRR/SRR), Storage Gateway, Elastic Disaster Recovery

📅 날짜: Week 10 (Day 4)
🎯 주제: 파일 백업·하이브리드 스토리지·재해 복구 전문 도구
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- S3 Replication(CRR/SRR/RTC) 동작과 사용 사례를 안다
- Storage Gateway 3가지 종류와 활용을 이해한다
- AWS Elastic Disaster Recovery로 워크로드 페일오버를 구성한다

---

## 🧩 사전 지식 (CS 기초)

- **Eventual consistency**: 결국 일관됨. S3 Replication은 비동기
- **Cold storage tier**: 자주 접근 안 하는 데이터 (S3 Glacier 등)
- **Hybrid storage**: 온프레미스 + 클라우드 통합
- **Block vs File vs Object storage**: EBS / EFS·FSx / S3
- **CDP (Continuous Data Protection)**: 실시간 복제로 거의 0 RPO

---

## 📖 이론 내용

### 1. S3 Replication

#### 종류

| 종류 | 의미 |
|------|------|
| **CRR (Cross-Region)** | 다른 리전으로 복제 |
| **SRR (Same-Region)** | 같은 리전 다른 버킷으로 복제 |
| **RTC (Replication Time Control)** | SLA 15분 이내 99.99% 복제 보장 (유료) |

#### 요건
- 양쪽 버킷에 **Versioning 활성화** 필수
- Source/Destination이 같은 또는 다른 계정 가능
- 적절한 IAM Role
- 새 객체만 복제 (기존 객체는 별도 명령 또는 Replication 후 동기화)

#### 사용 사례

| 사용 사례 | 종류 |
|-----------|------|
| **DR (지리적 분산)** | CRR |
| **Compliance (지역 데이터 보관)** | CRR |
| **로그 통합 (계정 간)** | SRR Cross-Account |
| **운영 효율 (다른 비용 클래스)** | SRR |
| **Audit 사본 분리** | SRR Cross-Account |

#### 복제 안 되는 항목
- Replication 활성화 전 객체 (별도 Sync 필요)
- Glacier 직접 PUT 객체
- SSE-C 암호화 객체 (별도 옵션)
- 삭제 마커 (선택 — Delete Marker Replication)

#### 비용
- 데이터 전송 + 대상 Storage
- RTC는 추가 비용

### 2. S3 Storage Class

#### 클래스 비교

| 클래스 | 가용성 | 최소 보관 | 사용 사례 |
|--------|--------|-----------|-----------|
| **Standard** | 99.99% | - | 자주 접근 |
| **Intelligent-Tiering** | 99.9% | - | 패턴 모르는 데이터 |
| **Standard-IA** | 99.9% | 30일 | 자주 안 접근 |
| **One Zone-IA** | 99.5% | 30일 | 재생성 가능한 데이터 |
| **Glacier Instant** | 99.9% | 90일 | 분기·즉시 복구 필요 |
| **Glacier Flexible** | 99.99% | 90일 | 1분~12시간 복구 |
| **Glacier Deep Archive** | 99.99% | 180일 | 12~48시간 복구. 가장 저렴 |

#### Lifecycle Policy
- 객체를 시간 따라 다른 클래스로 이동
- 또는 만료(삭제)

```json
{
  "Rules": [{
    "Status": "Enabled",
    "Transitions": [
      {"Days": 30, "StorageClass": "STANDARD_IA"},
      {"Days": 90, "StorageClass": "GLACIER"},
      {"Days": 365, "StorageClass": "DEEP_ARCHIVE"}
    ],
    "Expiration": {"Days": 2555}
  }]
}
```

### 3. AWS Storage Gateway

#### 3가지 종류

##### File Gateway
- 온프레미스에서 NFS/SMB로 접근 → S3에 저장
- 캐시 활용 (로컬 빠른 접근)
- 사용 사례: 백업, 미디어 아카이브

##### Volume Gateway
- iSCSI 블록 스토리지
- 두 모드:
  - **Cached Volumes**: 자주 쓰는 데이터만 로컬, 전체는 S3
  - **Stored Volumes**: 전체 로컬, 비동기 S3 백업

##### Tape Gateway
- 가상 테이프 라이브러리 (VTL)
- 백업 소프트웨어(Veritas, NetBackup)가 테이프처럼 사용
- S3 → Glacier 자동

#### 운영 패턴
- 온프레미스 SAN/NAS 점진적 클라우드 이전
- AWS Backup과 통합

### 4. AWS Elastic Disaster Recovery (DRS)

#### 개념
- 온프레미스/타 클라우드 워크로드를 AWS로 페일오버
- 블록 레벨 연속 복제 (CDP)
- RPO 초 단위, RTO 분 단위

#### 동작
1. Source 서버에 Agent 설치
2. Staging Subnet (작은 t3.small EC2)에 데이터 복제 진행
3. 페일오버 시점에 Staging 데이터로 실제 EC2 시작 (큰 인스턴스 타입)
4. 평소엔 비용 ↓ (Staging은 작음 + EBS만 청구)

#### 사용 사례
- 데이터센터 마이그레이션
- 멀티 리전 DR
- 타 클라우드 → AWS 페일오버

### 5. AWS DataSync

#### 개념
- 대용량 데이터 전송 (온프레미스 ↔ AWS, AWS ↔ AWS)
- 자동 스케줄링, 검증, 암호화
- NFS/SMB/HDFS/S3/EFS/FSx 지원

#### 사용 사례
- 1회성 대량 마이그레이션
- 정기 동기화 (예: 매일 NAS → S3)
- AWS 간 데이터 이동 (S3 → EFS 등)

### 6. AWS Transfer Family

- SFTP/FTP/FTPS/AS2로 S3에 접근
- 레거시 파일 전송 시스템 통합
- 외부 파트너와 표준 프로토콜로 데이터 교환

### 7. EFS / FSx

#### EFS
- 관리형 NFS (Linux)
- Multi-AZ 자동
- Throughput Bursting / Provisioned

#### FSx
- **FSx for Windows**: SMB (Active Directory 통합)
- **FSx for Lustre**: HPC 고성능
- **FSx for NetApp ONTAP**: NetApp 호환
- **FSx for OpenZFS**: ZFS 호환

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **S3 Object Lock** | WORM. Compliance/Governance | Ransomware 방어 |
| **S3 Replication Time Control** | 15분 SLA 99.99% | RTO 엄격 |
| **AWS Snow Family** | 페타바이트 데이터 물리 전송 | 인터넷 비효율 시 |
| **CloudEndure → DRS** | 구 CloudEndure가 DRS로 통합 | 이름 변경 |
| **Cross-Region Replication for KMS** | Replica는 KMS Multi-Region Key 권장 | |

> ⚠️ **함정 1**: S3 Replication은 기존 객체 자동 복제 X. 활성화 전 객체는 별도 Sync.
>
> ⚠️ **함정 2**: Storage Gateway는 온프레미스에 가상 어플라이언스 배포 필요 (VMware, Hyper-V, EC2).
>
> 💡 **암기 팁**: S3 Replication(파일 비동기), DRS(워크로드 CDP), Storage Gateway(하이브리드 파일·블록·테이프).

### 관련 서비스 Cross-Reference

- **S3 Replication → Week 9 KMS Multi-Region Key**
- **Storage Gateway → Week 10 Day 2 AWS Backup** (Backup Gateway)
- **DRS → Week 1 Day 1 DR 전략**
- **DataSync → Week 8 PrivateLink**

---

## 🏗️ 아키텍처 다이어그램

```
S3 Cross-Region Replication
==========================================================

   Source Bucket (ap-northeast-2)
   ─────────────────────────────
   Versioning: ON
        │
        │ Replication Rule
        │ (Filter: prefix + tag)
        ▼
   Destination Bucket (us-east-1)
   ──────────────────────────────
   Versioning: ON
   Storage Class: GLACIER (옵션)
   Owner: 같은 또는 다른 계정

   추가 옵션:
   - RTC: 15분 SLA
   - Delete Marker Replication
   - Replica Modification Sync
```

```
AWS Elastic Disaster Recovery 동작
==========================================================

   온프레미스 / 타 클라우드
   ┌──────────────────────────┐
   │  Source Server           │
   │  (Agent 설치)            │
   └────────┬─────────────────┘
            │ 블록 레벨 연속 복제
            ▼
   AWS Account
   ┌──────────────────────────┐
   │  Staging Subnet          │
   │  ┌──────────────────┐   │
   │  │  t3.small EC2    │   │ ← 평소엔 작음 (비용 절감)
   │  │  + EBS (전체 데이터)│   │
   │  └──────────────────┘   │
   └────────┬─────────────────┘
            │ 페일오버 트리거
            ▼
   ┌──────────────────────────┐
   │  Production Subnet       │
   │  ┌──────────────────┐   │
   │  │  m5.large EC2    │   │ ← 실제 크기로 launch
   │  │  + EBS (복제본)   │   │
   │  └──────────────────┘   │
   └──────────────────────────┘
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **S3 Replication은 Versioning 필수** + 새 객체만 복제 (기존 객체 별도 Sync)
2. ⭐ **CRR(다른 리전 DR)** vs **SRR(같은 리전 다른 버킷 - 운영·감사)**
3. ⭐ **Storage Gateway 3종**: File(NFS/SMB) / Volume(iSCSI) / Tape(VTL)
4. ⭐ **DRS = 워크로드 페일오버** — CDP, RPO 초·RTO 분 단위
5. ⭐ **DataSync는 대용량 1회성/정기 전송**, Transfer Family는 SFTP/FTP 표준

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. S3 Versioning 활성화 (Replication 전제)
aws s3api put-bucket-versioning \
  --bucket source-bucket \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-versioning \
  --bucket destination-bucket \
  --versioning-configuration Status=Enabled

# 2. Replication 설정 (CRR + RTC)
cat > replication.json <<'EOF'
{
  "Role": "arn:aws:iam::123:role/s3-replication-role",
  "Rules": [{
    "ID": "ReplicateAll",
    "Status": "Enabled",
    "Priority": 1,
    "DeleteMarkerReplication": {"Status": "Enabled"},
    "Filter": {"Prefix": "important/"},
    "Destination": {
      "Bucket": "arn:aws:s3:::destination-bucket-us",
      "StorageClass": "STANDARD_IA",
      "ReplicationTime": {
        "Status": "Enabled",
        "Time": {"Minutes": 15}
      },
      "Metrics": {"Status": "Enabled", "EventThreshold": {"Minutes": 15}},
      "EncryptionConfiguration": {
        "ReplicaKmsKeyID": "arn:aws:kms:us-east-1:123:key/abc"
      }
    },
    "SourceSelectionCriteria": {
      "SseKmsEncryptedObjects": {"Status": "Enabled"}
    }
  }]
}
EOF

aws s3api put-bucket-replication \
  --bucket source-bucket \
  --replication-configuration file://replication.json

# 3. S3 Lifecycle (Tier 자동 이동)
aws s3api put-bucket-lifecycle-configuration \
  --bucket my-data \
  --lifecycle-configuration '{
    "Rules":[{
      "ID":"ArchiveOldData",
      "Status":"Enabled",
      "Filter":{"Prefix":"logs/"},
      "Transitions":[
        {"Days":30,"StorageClass":"STANDARD_IA"},
        {"Days":90,"StorageClass":"GLACIER"},
        {"Days":365,"StorageClass":"DEEP_ARCHIVE"}
      ],
      "Expiration":{"Days":2555}
    }]
  }'

# 4. S3 Object Lock (Compliance Mode)
aws s3api put-object-lock-configuration \
  --bucket immutable-bucket \
  --object-lock-configuration '{
    "ObjectLockEnabled":"Enabled",
    "Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":365}}
  }'

# 5. DataSync Task (NFS → S3)
aws datasync create-location-nfs \
  --server-hostname onprem-nas.example.com \
  --on-prem-config AgentArns=arn:aws:datasync:ap-northeast-2:123:agent/agent-abc \
  --subdirectory /export/data

aws datasync create-location-s3 \
  --s3-bucket-arn arn:aws:s3:::my-data \
  --s3-config BucketAccessRoleArn=arn:aws:iam::123:role/DataSyncS3Role

aws datasync create-task \
  --source-location-arn arn:aws:datasync:ap-northeast-2:123:location/loc-nfs \
  --destination-location-arn arn:aws:datasync:ap-northeast-2:123:location/loc-s3 \
  --options 'VerifyMode=ONLY_FILES_TRANSFERRED,LogLevel=BASIC' \
  --schedule 'ScheduleExpression=cron(0 1 * * ? *)'

# 6. DRS - Source Server 등록 (Agent가 자동 수행)
# Agent를 source 서버에 설치 후:
aws drs initialize-service

aws drs list-source-servers
aws drs describe-source-servers \
  --query 'items[*].[sourceServerID,hostname,dataReplicationInfo.dataReplicationState]'

# 페일오버 (Recovery Instance 시작)
aws drs start-recovery \
  --source-servers sourceServerID=s-abc,recoverySnapshotID=snap-latest

# 7. Storage Gateway (File Gateway)
aws storagegateway create-nfs-file-share \
  --gateway-arn arn:aws:storagegateway:ap-northeast-2:123:gateway/sgw-abc \
  --location-arn arn:aws:s3:::my-files \
  --role arn:aws:iam::123:role/StorageGatewayRole \
  --client-list 10.0.0.0/16 \
  --squash AllSquash
```

---

## 📝 연습 문제

**문제 1.** 회사가 S3 데이터를 다른 리전 DR 사이트에 자동 복제하려 한다. 어떤 기능?

A) DataSync 주기 실행
B) S3 Cross-Region Replication (CRR) - 양쪽 Versioning 필수 + Replication Rule
C) Storage Gateway
D) Manual sync

**정답: B**
해설: S3 CRR이 표준. 양쪽 버킷 Versioning 활성화 + IAM Role + Replication Rule. 새 객체만 자동 복제.

---

**문제 2.** 회사가 운영 데이터센터를 AWS로 DR로 페일오버 가능하게 하려 한다. 평소 비용은 최소화. 어떤 도구?

A) S3 Replication
B) AWS Elastic Disaster Recovery (DRS) - 평소 Staging은 t3.small + EBS만, 페일오버 시 큰 인스턴스
C) Storage Gateway
D) DataSync

**정답: B**
해설: DRS의 정확한 사용 사례. 블록 레벨 CDP + 평소 비용 최소화 + 페일오버 시 실제 크기로 launch. RPO 초·RTO 분.

---

**문제 3.** 온프레미스 백업 소프트웨어가 가상 테이프에 백업하던 방식을 AWS로 옮기려 한다. 어떤 도구?

A) S3 직접
B) Storage Gateway - Tape Gateway (VTL)
C) DataSync
D) Backup

**정답: B**
해설: Tape Gateway가 정확히 가상 테이프 라이브러리. 기존 백업 SW(Veritas/NetBackup 등)가 그대로 사용. S3 → Glacier 자동.

---

**문제 4.** S3 객체에 5년간 변경·삭제 불가 컴플라이언스 강제하려면?

A) IAM
B) S3 Object Lock - Compliance Mode + 5년 retention
C) Replication
D) Versioning만

**정답: B**
해설: S3 Object Lock의 Compliance Mode는 절대 해제 불가. Ransomware/내부자 방어. Versioning 활성화 필수.

---

**문제 5.** 온프레미스 NAS의 5TB 데이터를 S3로 1회성 마이그레이션하려 한다. 어떤 도구?

A) S3 CLI sync (느림, 비효율)
B) AWS DataSync - 자동 스케줄링·검증·암호화, 대용량 효율
C) Storage Gateway (지속 운영용)
D) Snowball (페타바이트급에 더 적합)

**정답: B**
해설: DataSync가 1회성/정기 대용량 전송 표준. 자동 병렬 + 검증 + 암호화. 5TB는 인터넷으로 가능. Snowball은 페타바이트급 또는 저대역 환경.

---

## 📌 오늘의 요약

1. S3 Replication: Versioning 필수, CRR(리전 간)/SRR(같은 리전)/RTC(15분 SLA)
2. S3 Storage Class + Lifecycle로 비용 최적화 (Standard → IA → Glacier → Deep Archive)
3. Storage Gateway 3종: File(NFS/SMB), Volume(iSCSI), Tape(VTL)
4. DRS = 워크로드 페일오버 (CDP). 평소 Staging 작게, 페일오버 시 실제 크기로
5. DataSync(대용량 전송), Transfer Family(SFTP), Snowball(페타바이트 물리)
