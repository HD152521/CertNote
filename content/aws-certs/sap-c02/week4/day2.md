# Day 2 - Storage Gateway 4종 비교: 온프레미스 스토리지를 클라우드로 확장하는 방법

온프레미스 인프라와 AWS 클라우드를 통합하는 과정에서 가장 먼저 맞닥뜨리는 현실적 문제는 스토리지다. 기존 시스템이 NFS, SMB, iSCSI, 테이프 드라이브 같은 전통적 프로토콜로 데이터를 쓰고 읽는다. 이 시스템들을 수정하지 않고 클라우드 스토리지(S3, Glacier)를 뒤에서 조용히 사용하게 하는 것이 AWS Storage Gateway의 핵심 역할이다. Storage Gateway는 온프레미스 애플리케이션이 기존 프로토콜로 데이터를 쓰면 그것을 S3 객체, EBS 스냅샷, Glacier 아카이브로 투명하게 변환한다. 오늘은 4종의 게이트웨이 각각의 내부 동작, 캐싱 메커니즘, 사용 시나리오를 깊이 이해한다.

## Storage Gateway의 배포 모델: 가상 어플라이언스

Storage Gateway는 온프레미스에 **가상 어플라이언스(VM)** 또는 **하드웨어 어플라이언스**로 배포된다. VMware ESXi, Microsoft Hyper-V, KVM, Linux KVM 환경에 OVA 이미지를 배포하거나, AWS가 판매하는 전용 하드웨어 어플라이언스(Dell EMC PowerEdge 기반)를 사용한다.

가상 어플라이언스에는 두 종류의 디스크가 연결된다. **캐시 디스크**: 로컬 캐시 데이터를 저장한다. **업로드 버퍼 디스크**: AWS로 전송되기 전 데이터를 임시 저장한다. 이 두 디스크의 크기 설정이 Storage Gateway 성능을 결정하는 핵심 파라미터다.

> 💡 **관련 이론**: Storage Gateway의 캐싱은 **LRU(Least Recently Used)** 알고리즘을 기반으로 한다. 가장 최근에 접근된 데이터가 캐시에 남고, 캐시가 가득 차면 가장 오래 접근되지 않은 데이터가 제거된다. 이는 지역성(Locality of Reference) 원칙에 근거한다. 자주 쓰는 파일이 캐시에 유지되면 클라우드 왕복 없이 로컬 속도로 접근 가능하다. 워킹셋(자주 쓰는 데이터 집합)이 캐시 크기 내에 들어오도록 캐시 디스크를 설계하는 것이 핵심이다.

네트워크 연결은 인터넷 또는 DX를 통해 AWS 리전의 Storage Gateway 서비스 엔드포인트와 HTTPS로 통신한다. DX를 사용하면 일관된 대역폭과 지연으로 대용량 파일 전송 성능이 향상된다.

## S3 File Gateway: 파일을 S3 객체로 투명하게

S3 File Gateway는 NFS(v3, v4.1)와 SMB(v2, v3) 마운트 포인트를 제공하며, 파일 쓰기/읽기를 S3 GetObject/PutObject API 호출로 변환한다. 온프레미스 서버 입장에서는 일반 파일 시스템처럼 보이지만 실제로는 S3 버킷에 데이터가 저장된다.

```
[온프레미스 서버]
  cp video.mp4 /mnt/media-share/2024/video.mp4
        │
        ↓ NFS write
  [Storage Gateway VM]
    캐시에 저장
    업로드 버퍼로 이동
        │
        ↓ HTTPS PutObject
  [S3 Bucket]
    s3://company-media/2024/video.mp4
    메타데이터: Content-Type, Last-Modified, ETag 등
        │
        ↓ S3 Lifecycle 규칙
    30일 후 → S3 Standard-IA
    90일 후 → Glacier Instant Retrieval
```

S3 File Gateway의 중요한 특성은 파일이 S3에 **네이티브 S3 객체**로 저장된다는 점이다. Gateway를 거치지 않고 직접 S3 API, S3 콘솔, Athena, EMR에서 같은 객체에 접근할 수 있다. 이는 데이터 레이크 구축에서 특히 유용하다. 온프레미스 시스템이 파일을 쓰면 자동으로 S3 데이터 레이크의 원시 데이터가 된다.

> 🔍 **더 깊이**: S3 File Gateway가 파일을 S3 객체로 변환할 때 파일 시스템 메타데이터(소유자, 권한, 타임스탬프)는 S3 객체의 사용자 정의 메타데이터(x-amz-meta-*)에 저장된다. 이 메타데이터는 나중에 파일을 다시 온프레미스로 읽을 때 파일 권한을 복원하는 데 사용된다. NFS와 SMB의 권한 모델이 다르므로, S3 File Gateway는 마운트 프로토콜에 따라 POSIX 권한(NFS) 또는 Windows ACL(SMB)을 메타데이터로 보존한다.

**S3 File Gateway의 멀티사이트 고려사항**: 여러 지점에서 같은 S3 버킷을 공유할 때 한 게이트웨이가 쓴 파일이 다른 게이트웨이에서 즉시 보이지 않을 수 있다. 각 게이트웨이가 독립적인 캐시를 유지하기 때문이다. 이를 해결하려면 S3 이벤트 알림이나 Lambda를 통해 캐시 무효화(RefreshCache API)를 트리거해야 한다.

> ⚠️ **함정**: 여러 온프레미스 사이트가 같은 S3 File Gateway를 통해 동일 버킷에 쓸 때 동시 쓰기 충돌이 발생할 수 있다. S3는 강력한 일관성(Strong Consistency)을 2020년 12월부터 지원하지만, Storage Gateway의 캐시 레이어가 있어 두 게이트웨이가 동시에 같은 파일을 수정하면 마지막 쓰기가 이전 쓰기를 덮어쓴다. 동시 편집이 필요한 환경에서는 FSx for Windows File Server + FSx File Gateway가 더 안전하다(NTFS 락 메커니즘 지원).

## FSx File Gateway: Windows 파일 공유의 클라우드 확장

FSx File Gateway는 온프레미스 Windows 환경을 위한 특화 솔루션이다. 온프레미스 서버가 SMB로 게이트웨이에 마운트하면, 게이트웨이는 자주 쓰는 파일을 로컬 캐시에 유지하고 실제 데이터는 AWS FSx for Windows File Server에 저장한다.

```
[온프레미스 Windows PC]
  \\gateway-ip\share → 로컬 캐시 히트면 즉시 반환
                     → 캐시 미스면 FSx for Windows에서 가져와 캐시 업데이트
        │
        ↓ SMB v2/v3
  [Storage Gateway VM]
    Windows ACL, NTFS 메타데이터 보존
    AD 통합 (도메인 조인)
        │
        ↓ 동기화
  [FSx for Windows File Server]
    AWS 관리형 Windows 파일 서버
    Multi-AZ 가용성
    VSS(볼륨 섀도우 복사본) 백업
```

> 💡 **관련 이론**: SMB(Server Message Block) 프로토콜의 핵심은 **파일 잠금(File Locking)** 메커니즘이다. Windows 파일 공유에서 여러 클라이언트가 같은 파일에 동시 접근할 때 NTFS의 OpLock(Opportunistic Lock)이 캐싱 권한을 협상한다. FSx File Gateway는 이 잠금 메커니즘을 올바르게 구현해 동시 편집 충돌을 방지한다. S3 File Gateway가 S3의 객체 모델(잠금 없음)에 의존하는 것과 달리, FSx File Gateway는 진정한 Windows 파일 시스템 의미를 유지한다.

FSx File Gateway가 S3 File Gateway와 다른 결정적 차이: **Active Directory 통합**과 **NTFS ACL 보존**. 기업의 AD 그룹 정책으로 파일 접근을 제어하는 환경에서 S3 File Gateway로 전환하면 이 권한 체계가 깨진다. FSx File Gateway는 도메인 조인을 지원해 기존 AD 정책이 그대로 적용된다.

## Volume Gateway: 블록 스토리지의 클라우드 확장

Volume Gateway는 iSCSI(Internet Small Computer Systems Interface) 프로토콜로 온프레미스 서버에 블록 스토리지 볼륨을 제공한다. 서버는 이 볼륨을 일반 디스크처럼 포맷하고 파일시스템을 올릴 수 있다.

> 💡 **관련 이론**: iSCSI(RFC 7143)는 SCSI 명령을 TCP/IP 네트워크 위에서 전송하는 프로토콜이다. 물리 디스크에 SCSI 명령으로 데이터를 쓰는 것처럼, iSCSI로 원격 스토리지에 접근한다. Initiator(클라이언트, 온프레미스 서버)가 Target(서버, Storage Gateway)에 SCSI 명령을 보내면 Target이 블록 I/O를 처리하고 결과를 반환한다. 이 추상화 덕분에 운영체제는 iSCSI 볼륨을 로컬 디스크와 동일하게 취급한다.

### Cached Mode vs Stored Mode

**Cached Mode**: 주 저장소는 S3이고 로컬에는 자주 쓰는 데이터만 캐시로 유지한다.
- 로컬 디스크는 캐시 용도로만 필요 → 작은 로컬 스토리지로 대용량 데이터 처리 가능
- S3에 저장된 데이터는 EBS 스냅샷으로 자동 변환되어 AWS 내 데이터 복구 용이
- 캐시 미스 시 S3에서 데이터를 가져오는 지연이 발생

**Stored Mode**: 전체 데이터가 로컬에 저장되고 S3에 비동기로 백업된다.
- 로컬 디스크에 전체 데이터가 있으므로 최저 지연
- 로컬 디스크 크기만큼 데이터가 제한됨
- S3 백업은 EBS 스냅샷 형태로 저장되어 DR 시 EC2에 EBS로 마운트 가능

| 항목 | Cached Mode | Stored Mode |
|------|-------------|-------------|
| 주 저장소 | S3 | 로컬 디스크 |
| 로컬 역할 | 캐시 (자주 쓰는 데이터) | 주 저장소 |
| 지연 | 캐시 히트: 낮음 / 캐시 미스: 높음 | 항상 낮음 (로컬 디스크) |
| 로컬 디스크 크기 | 작아도 됨 | 전체 데이터 크기 필요 |
| DR 복구 방법 | S3 → EBS 스냅샷 복원 | S3 비동기 백업 → EBS 복원 |

> 🎯 **시나리오**: 지방 병원이 의료 영상 시스템(PACS)을 운영한다. 영상 데이터 총 50TB인데 로컬 스토리지는 5TB밖에 없다. 자주 보는 최근 3개월 영상은 빠르게 접근해야 하고, 오래된 영상은 S3에 있어도 된다. Volume Gateway Cached Mode를 쓰면 5TB 캐시로 최근 영상을 로컬 속도로 제공하고, 나머지 45TB는 S3에서 필요할 때 가져온다. S3 데이터는 EBS 스냅샷으로 자동 변환되어 DR 시 EC2에서 즉시 복원할 수 있다.

## Tape Gateway: 가상 테이프 라이브러리

수십 년간 테이프 드라이브는 기업 백업의 표준이었다. Veeam, Veritas NetBackup, CommVault, IBM Spectrum Protect 같은 백업 소프트웨어가 iSCSI VTL(Virtual Tape Library) 인터페이스를 통해 테이프 드라이브에 데이터를 기록한다. Tape Gateway는 이 백업 소프트웨어가 AWS를 테이프처럼 인식하게 만든다.

```
[백업 서버: Veeam/NetBackup]
  iSCSI VTL 인터페이스로 테이프에 백업 job 실행
        │
        ↓ iSCSI (VTL 프로토콜)
  [Tape Gateway VM]
    가상 테이프 미디어 에뮬레이션
        │
        ↓ 테이프 쓰기 완료
  [S3 버킷] - Virtual Tape Library (현재 사용 중 테이프)
        │
        ↓ 테이프 보관(Archive) 명령
  [S3 Glacier Deep Archive] - Virtual Tape Shelf (보관 테이프)
        │
        복구 시: Glacier 테이프 꺼내기 → S3 복원 → 백업 SW에서 복원
```

> 📚 **사례**: 한 방송사가 20년치 방송 콘텐츠를 물리 테이프 6만 개로 보관하고 있었다. 테이프 운반, 검색, 복원에 드는 인력 비용이 연간 수억 원이었다. Tape Gateway로 전환 후 물리 테이프 운반 없이 Veeam 백업 소프트웨어를 그대로 유지하면서 모든 백업이 S3와 Glacier Deep Archive에 저장됐다. 테이프 복원 시간이 수 일에서 수 시간으로 단축됐고 물리 테이프 재구매 비용이 없어졌다.

**Tape Gateway 비용 모델**: S3 Virtual Tape Library 저장 비용 + Glacier Deep Archive 저장 비용(GB당 $0.00099) + 검색 비용. 물리 테이프 대비 GB당 비용이 낮고 검색이 훨씬 빠르다.

> 🔍 **더 깊이**: Tape Gateway의 가상 테이프 크기는 100GB ~ 5TB로 설정 가능하다. 물리 테이프 드라이브 종류(LTO-5부터 LTO-9까지)에 따른 테이프 크기를 에뮬레이션한다. 백업 소프트웨어가 큰 테이프를 사용하도록 구성하면 테이프 수가 줄어 관리가 단순해진다. 가상 테이프의 "꺼내기(Eject)"와 "보관(Archive)" 명령이 S3 → Glacier Deep Archive 이동으로 구현된다.

## Storage Gateway vs DataSync vs Transfer Family

혼동하기 쉬운 세 서비스의 차이를 명확히 정리한다.

| 서비스 | 목적 | 사용 패턴 | 프로토콜 |
|--------|------|-----------|----------|
| Storage Gateway | 상시 하이브리드 스토리지 접근 | 온프레미스 앱이 지속적으로 클라우드 스토리지를 사용 | NFS, SMB, iSCSI, VTL |
| DataSync | 일회성/정기 데이터 동기화 | 마이그레이션, 정기 백업, 대량 전송 | NFS, SMB, S3, EFS, FSx |
| Transfer Family | SFTP/FTP/FTPS 엔드포인트 제공 | 외부 파트너가 SFTP로 S3/EFS에 업로드 | SFTP, FTP, FTPS, AS2 |

> 💡 **관련 이론**: DataSync는 전송 작업(Task)을 실행하는 에이전트 기반 서비스다. 에이전트가 소스(온프레미스 NFS/SMB)를 스캔하고 목적지(S3, EFS, FSx)와 차이를 계산해 변경된 파일만 전송한다. 병렬 전송과 네트워크 가속으로 1Gbps DX 환경에서 약 30% 높은 실효 처리량을 달성한다. Storage Gateway가 "상시 마운트"라면 DataSync는 "효율적 배치 전송"이다. 마이그레이션 완료 후에는 DataSync 에이전트를 중지하고 Storage Gateway만 유지하는 것이 일반적인 패턴이다.

## 다른 클라우드와의 비교

| 항목 | AWS Storage Gateway | GCP Storage Transfer Service | Azure File Sync |
|------|--------------------|-----------------------------|----------------|
| 상시 마운트 | 지원 (NFS/SMB/iSCSI) | 미지원 (배치 전송) | 지원 (SMB) |
| 파일→오브젝트 | S3 File Gateway | - | 불가(Azure Blob 별도) |
| Windows AD 통합 | FSx File Gateway | - | Azure AD 통합 |
| 테이프 에뮬레이션 | Tape Gateway | - | Azure Import/Export |
| 블록 스토리지 | Volume Gateway | - | Azure Disk 별도 |

> 📚 **사례**: 글로벌 미디어 그룹이 온프레미스와 AWS의 하이브리드 편집 워크플로를 구축했다. NAS에 저장된 원본 영상 파일을 S3 File Gateway로 마운트해 AWS 편집 시스템이 S3 API로 직접 접근한다. 완성된 영상은 자동 S3 Lifecycle으로 아카이브된다. 동시에 편집 프로젝트 파일(Adobe Premiere, Avid)은 FSx File Gateway를 통해 온프레미스 편집실과 AWS 클라우드 편집 워크스테이션이 공유한다. Windows 도메인 환경의 파일 잠금이 올바르게 동작해 충돌 없이 공동 작업이 가능하다.

## 실전 CLI: Storage Gateway 구성

```bash
# Storage Gateway 활성화
aws storagegateway activate-gateway \
  --activation-key XXXXX-XXXXX-XXXXX-XXXXX-XXXXX \
  --gateway-name "Seoul-FileGateway" \
  --gateway-timezone "GMT+9:00" \
  --gateway-region ap-northeast-2 \
  --gateway-type FILE_S3

# 로컬 디스크를 캐시로 구성
aws storagegateway add-cache \
  --gateway-arn arn:aws:storagegateway:ap-northeast-2:ACCT:gateway/sgw-xxx \
  --disk-ids /dev/sdb

# S3 File Share 생성 (NFS)
aws storagegateway create-nfs-file-share \
  --client-token "unique-token-123" \
  --gateway-arn arn:aws:storagegateway:...:gateway/sgw-xxx \
  --role "arn:aws:iam::ACCT:role/StorageGatewayS3Role" \
  --location-arn "arn:aws:s3:::company-media-bucket" \
  --default-storage-class S3_STANDARD \
  --squash RootSquash \
  --nfs-file-share-defaults '{"FileMode":"0666","DirectoryMode":"0777","GroupId":0,"OwnerId":0}'

# Volume Gateway - Cached Volume 생성
aws storagegateway create-cachedi-scsi-volume \
  --gateway-arn arn:aws:storagegateway:...:gateway/sgw-yyy \
  --volume-size-in-bytes 107374182400 \  # 100GB
  --target-name TargetA \
  --network-interface-id 10.0.1.100 \
  --client-token "unique-token-456"

# Tape Gateway - 가상 테이프 생성
aws storagegateway create-tapes \
  --gateway-arn arn:aws:storagegateway:...:gateway/sgw-zzz \
  --tape-size-in-bytes 107374182400 \  # 100GB
  --tape-barcode-prefix AMZN \
  --num-tapes-to-create 5
```

Storage Gateway의 핵심은 "기존 프로토콜 그대로, 백엔드만 클라우드"다. 온프레미스 애플리케이션을 수정하지 않고 클라우드 스토리지의 비용 효율성, 가용성, 확장성을 바로 활용할 수 있다. SAP-C02에서 Storage Gateway 문제의 핵심 판단 기준은 프로토콜(NFS/SMB/iSCSI/VTL)과 AD 통합 여부, 그리고 상시 접근이냐 일회성 전송이냐다.

---

## 📝 연습 문제

**문제 1.** 글로벌 컨설팅 회사가 15개 지사에서 Windows 파일 서버를 운영한다. 직원이 본사와 지사에서 동일한 파일을 편집하며 Windows AD 그룹 정책으로 파일 접근을 제어한다. 지사 직원의 파일 접근 지연을 줄이고 중앙 백업을 AWS에서 관리하고 싶다. 적합한 AWS 솔루션은?

A) S3 File Gateway (각 지사에 배포)
B) FSx File Gateway (각 지사에 배포) + 중앙 FSx for Windows File Server
C) Storage Gateway Volume (Cached Mode) + AD 정책
D) DataSync로 일 1회 동기화

**정답: B**
해설: Windows AD ACL과 파일 잠금(동시 편집 충돌 방지)을 요구하는 환경에서 FSx File Gateway가 필요하다. 각 지사에 FSx File Gateway를 배포하면 자주 쓰는 파일이 로컬 캐시에 유지되어 지연이 낮고, 실제 데이터는 중앙 FSx for Windows File Server에 저장된다. AD 통합으로 기존 그룹 정책이 그대로 적용된다. S3 File Gateway(A)는 Windows ACL과 파일 잠금을 완전히 지원하지 않는다. Volume Gateway(C)는 블록 스토리지(iSCSI)이지 파일 공유 프로토콜(SMB)이 아니다. DataSync(D)는 배치 동기화로 실시간 파일 공유에 부적합하다.

---

**문제 2.** 방송사가 물리 LTO 테이프 4만 개로 30년치 방송 아카이브를 보관한다. 테이프 운반, 복원 시간(평균 3일), 관리 인력 비용이 문제다. 기존 NetBackup 소프트웨어를 그대로 유지하면서 클라우드로 이전하려 한다. 가장 적합한 솔루션은?

A) S3 File Gateway + S3 Glacier Deep Archive
B) Tape Gateway (VTL) + S3 Glacier Deep Archive
C) DataSync + Glacier
D) Snowball + S3

**정답: B**
해설: "기존 NetBackup 소프트웨어를 그대로 유지"가 핵심이다. Tape Gateway는 iSCSI VTL 인터페이스를 제공해 NetBackup이 물리 테이프처럼 인식한다. 소프트웨어 변경 없이 백업 job이 그대로 실행된다. 데이터는 S3 VTL에 저장되고 Archive 명령 시 Glacier Deep Archive로 이동한다. S3 File Gateway(A)는 NFS/SMB 파일 공유이지 VTL 인터페이스가 없어 NetBackup이 인식하지 못한다. DataSync(C)는 배치 전송으로 백업 소프트웨어 통합이 없다. Snowball(D)은 일회성 물리 데이터 이동으로 지속적인 백업에 부적합하다.

---

**문제 3.** 지방 의원이 의료 영상(DICOM) 총 80TB를 저장한다. 로컬 스토리지는 10TB만 있다. 최근 6개월 영상은 자주 접근하고 오래된 영상은 가끔만 접근한다. 온프레미스 PACS 시스템이 iSCSI로 스토리지에 접근한다. 비용 최적화하면서 로컬 스토리지 한계를 극복하는 방법은?

A) Volume Gateway Stored Mode
B) Volume Gateway Cached Mode
C) S3 File Gateway
D) FSx File Gateway

**정답: B**
해설: iSCSI 접근 방식이므로 Volume Gateway가 필요하다(C, D는 파일 프로토콜). Cached Mode는 주 저장소를 S3로 두고 로컬에는 자주 쓰는 데이터만 캐시로 유지한다. 10TB 로컬로 80TB 전체를 처리할 수 있다. 최근 6개월 영상이 10TB 이하라면 캐시 히트율이 높아 지연도 낮다. Stored Mode(A)는 전체 데이터(80TB)를 로컬에 저장해야 하므로 10TB 로컬로는 불가능하다.

---

**문제 4.** 온프레미스에서 3개월치 로그 파일(2TB)을 S3로 이전한다. 이전 후에는 온프레미스 시스템이 계속 S3에 새 로그를 저장해야 한다. 가장 적합한 조합은?

A) DataSync로 초기 3TB 이전 + Storage Gateway(S3 File Gateway)로 이후 상시 저장
B) Snowball로 초기 이전 + Storage Gateway
C) Storage Gateway만으로 전체 진행
D) DataSync만 사용 (매일 정기 실행)

**정답: A**
해설: 두 단계 요구사항이 있다: (1) 기존 2TB 빠른 이전, (2) 이후 지속적 로그 저장. DataSync는 NFS/SMB 소스를 S3로 빠르고 효율적으로 전송하는 배치 도구다(초기 마이그레이션). S3 File Gateway는 온프레미스 시스템이 NFS로 마운트해 지속적으로 파일을 쓸 수 있는 상시 솔루션이다(이후 운영). 이 두 가지를 조합하는 것이 마이그레이션 + 지속 운영의 표준 패턴이다. Storage Gateway만으로(C) 초기 2TB를 이전하면 느리고 비효율적이다. DataSync만으로(D) 지속적 실시간 쓰기가 불가능하다.

---

**문제 5.** S3 File Gateway를 사용하는 온프레미스 서버가 업로드한 파일이 같은 버킷을 쓰는 다른 사이트의 S3 File Gateway에서 바로 보이지 않는다. 원인과 해결책은?

A) S3 강력한 일관성 문제 — 잠시 기다리면 해결됨
B) 각 게이트웨이가 독립 캐시를 유지하므로 캐시 무효화(RefreshCache) 필요
C) S3 버킷 정책 문제 — 교차 계정 접근 허용 필요
D) NFS 버전 불일치 — NFS v4.1로 통일

**정답: B**
해설: S3 File Gateway는 각 사이트에서 독립적인 로컬 캐시를 운영한다. 사이트 A의 게이트웨이가 파일을 S3에 업로드해도 사이트 B의 게이트웨이는 자신의 캐시에 그 정보가 없어 파일이 보이지 않는다. RefreshCache API를 호출하거나 S3 이벤트 알림 → Lambda → RefreshCache를 자동화하면 해결된다. S3는 2020년 12월부터 강력한 일관성을 제공하므로 일관성 자체는 문제가 아니다(A 오답). 버킷 정책(C)은 접근 권한 문제이지 가시성 지연 문제가 아니다. NFS 버전(D)은 관련 없다.

---

**문제 6.** Storage Gateway(S3 File)와 DataSync 중 온프레미스 파일 서버를 AWS로 최종 이전(마이그레이션)하기 위한 일회성 대량 복사에 더 적합한 서비스는?

A) Storage Gateway S3 File Gateway
B) AWS DataSync
C) 두 서비스 모두 동일하게 적합
D) AWS Transfer Family

**정답: B**
해설: DataSync는 대량 데이터의 고속 배치 전송에 최적화되어 있다. 네트워크 가속, 병렬 처리, 체크섬 검증, 변경 파일만 전송하는 증분 동기화를 지원한다. 1Gbps DX 환경에서 DataSync가 일반 cp 또는 Storage Gateway보다 30% 이상 높은 실효 처리량을 달성한다. Storage Gateway(A)는 상시 하이브리드 접근을 위한 서비스이고, 대량 일회성 전송보다 일상 운영에 최적화되어 있다. Transfer Family(D)는 SFTP/FTP 엔드포인트 제공 서비스로 마이그레이션 도구가 아니다.
