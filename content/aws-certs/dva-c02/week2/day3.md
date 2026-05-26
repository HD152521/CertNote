# Day 8 - EC2의 디스크 layer: EBS, Instance Store, 그리고 그 위의 EFS·FSx

처음 EC2를 만들 때 "Add storage" 화면을 보면 막막하다. gp3? io2? Block Express? 16TB까지 늘릴 수 있다는데 왜 io2는 비싸고 sc1은 싼지, 왜 인스턴스 스토어는 "이 인스턴스가 죽으면 데이터도 죽는다"고 경고가 뜨는지. 그 답은 EBS가 **네트워크 위에 얹힌 분산 블록 스토리지**라는 사실에서 시작한다. 같은 "디스크"라는 단어 안에 IOPS, throughput, latency, durability, replication 모델이 모두 다르고, 그 trade-off가 시험의 핵심이다.

오늘은 EBS의 내부 아키텍처(왜 AZ 종속인지, 왜 io2 Block Express만 256K IOPS인지)부터 인스턴스 스토어의 물리적 NVMe까지 따라가 본다. 그 위에서 EFS·FSx가 어떤 위치를 차지하는지, EBS 스냅샷이 S3에 정확히 어떻게 저장되는지를 본다. 개발자가 시험에서 만나는 "왜 우리 EBS는 IOPS가 안 나오지?", "왜 인스턴스 stop했더니 데이터가 다 날아갔지?" 같은 시나리오는 결국 이 layer를 끝까지 본 사람만 풀 수 있다.

## EBS는 네트워크 디스크다 — AZ 종속의 진짜 이유

EBS는 "EC2에 attach되는 디스크"라고 단순히 이해하면 절반만 본 거다. 실제로 EBS는 **AZ 안의 별도 분산 스토리지 fleet**에 데이터를 저장하고, EC2 인스턴스는 그 fleet에 iSCSI 비슷한 프로토콜로 네트워크 너머 접근한다. 그래서 EBS volume은 **AZ에 종속적**이고, EC2를 다른 AZ로 옮기려면 ① snapshot 생성(S3에 저장) → ② 새 AZ에서 snapshot으로 volume 생성 → ③ attach라는 3단계가 필요하다.

```
[EC2 in AZ-a]
       |
       | iSCSI-like protocol over Nitro EBS Card
       |
[EBS Volume in AZ-a fleet]
       |
       | 3-way replicated within AZ
       |
[Storage Server 1] [Storage Server 2] [Storage Server 3]
   (같은 AZ 안에서 3-way replication)
```

EBS는 한 AZ 안에서 자동으로 **3-way replication**을 한다. 그래서 단일 storage server 장애로는 데이터를 잃지 않지만, AZ 전체가 죽으면 그 AZ에 있던 모든 EBS volume이 같이 죽는다. 이게 RDS Multi-AZ가 EBS를 그대로 다른 AZ에 두는 게 아니라, **Primary와 Standby를 각각 다른 AZ의 EBS volume에 두고 synchronous replication을 추가로 하는** 이유다.

Nitro 인스턴스의 경우 EBS는 **Nitro EBS Card**라는 전용 PCIe 카드를 통해 액세스된다. 호스트 OS의 CPU를 거의 안 거치고 카드가 직접 네트워크 패킷을 처리하므로, 같은 인스턴스 타입에서 non-Nitro 대비 약 2배의 EBS throughput이 나온다. 또 EBS-Optimized 옵션이 무료로 기본 활성화돼 있어, EC2의 일반 네트워크 대역과 EBS 대역이 분리된다(예전엔 옵션이었고 추가 요금).

> 🔍 **더 깊이**: EBS의 "11 nines durability"(io2/io2 Block Express)는 한 AZ 안의 3-way replication 위에 background scrubbing(체크섬 검사 후 손상 시 재복제), erasure coding 일부 적용, 정기적 fault detection으로 달성된다. gp3는 11 nines가 아니라 99.8-99.9% durability(연간 0.1-0.2% volume이 영구 데이터 손실 가능성). 그래서 critical workload에는 gp3보다 io2가 권장된다. 다만 실무에선 어떤 EBS 타입이든 application-level backup(snapshot, RDS automated backup, Aurora continuous backup)이 항상 권장된다.

> 💡 **관련 이론**: EBS의 3-way replication은 분산 스토리지의 quorum-based consistency 모델 위에서 동작한다. 쓰기는 3 replica 중 2개에 성공해야 ack를 받고(W=2), 읽기는 1개에서 받아도 된다(R=1). 이게 Dynamo paper(DeCandia et al., 2007)의 quorum 모델과 같은 발상이다. R+W > N(여기서 N=3)이면 strong consistency를 보장. EBS는 R=1, W=2, N=3으로 W+R=3=N이라 strong consistency는 아니지만, 실무에선 write back에서 strong consistency를 추가로 보장하는 메커니즘이 있다.

## EBS volume type 깊이 분석

볼륨 타입을 외우기 전에 각자의 진짜 용도를 보자.

| 타입 | 미디어 | 기본 IOPS / 최대 IOPS | 처리량 | 가격(GB/월, ap-northeast-2 기준) | 대표 워크로드 |
|------|-------|----------|--------|----------|----------|
| **gp3** | SSD | 3,000 / 16,000 | 125-1,000 MB/s | $0.0912 | 부팅 볼륨, 일반 DB, 웹서버 |
| **gp2** | SSD | 100-16,000 (GB×3) | 250 MB/s | $0.114 | gp3 이전 세대 (마이그레이션 권장) |
| **io1** | SSD | 100-64,000 (1:50 비율) | 1,000 MB/s | $0.1425 + IOPS | 고성능 DB |
| **io2** | SSD | 100-64,000 (1:500 비율) | 1,000 MB/s | $0.1425 + IOPS | 미션 크리티컬 DB |
| **io2 Block Express** | SSD | 100-256,000 (1:1000) | 4,000 MB/s | $0.1425 + IOPS | SAP HANA, 대형 OLTP |
| **st1** | HDD | 40-500 (baseline) | 250-500 MB/s | $0.051 | 빅데이터 ETL, 로그 |
| **sc1** | HDD | 12-250 (baseline) | 80-250 MB/s | $0.0174 | 콜드 아카이브 |

**gp3가 gp2를 대체하는 이유**: gp2는 IOPS가 볼륨 크기에 묶여 있어(1GB당 3 IOPS, 최대 16,000) 100GB 볼륨에 5,000 IOPS가 필요하면 1,667GB까지 키워야 했다. gp3는 IOPS와 throughput을 **크기와 독립적으로** 설정 가능하다(추가 비용 있음). 같은 100GB 볼륨에 5,000 IOPS와 250 MB/s를 설정해도 gp2보다 약 20% 저렴하다.

**io1 vs io2의 차이**: io2가 늦게 나온 만큼 더 좋다. ① durability가 io1의 99.9%에서 io2는 99.999%(=11 nines)로 4 nines 더 높음. ② 같은 가격에 IOPS:GB 비율이 io1의 1:50에서 io2는 1:500으로 10배. 즉 100GB io2는 5,000 IOPS까지 가능, 100GB io1은 50 IOPS까지만 보장. 그래서 새 워크로드에 io1을 쓰는 것은 거의 항상 오답이다.

**io2 Block Express**: 2021년 출시. NVMe over Fabrics 프로토콜 기반으로 EBS 네트워크 stack을 새로 짰다. 256K IOPS, 4 GB/s throughput, sub-millisecond latency, 64TB까지 확장. SAP HANA 같은 인메모리 DB의 영구 스토리지 layer에 쓰인다. r5b 같은 io2 Block Express 호환 인스턴스에서만 동작.

> ⚠️ **함정**: 시험에서 "데이터베이스에 가장 적합한 EBS 타입"이 보이면 무조건 io2 또는 io2 Block Express. gp3도 "일반 DB"엔 충분하지만, "지연 시간 민감"이나 "미션 크리티컬"이라는 키워드가 붙으면 io2 답. 또 "HDD를 부팅 볼륨으로"라는 보기는 항상 오답이다. st1과 sc1은 부팅 불가.

> 🔍 **더 깊이**: gp3의 baseline 3,000 IOPS는 1GB든 1TB든 동일하다. 그 위에 추가 IOPS는 1 IOPS당 월 $0.005, throughput은 1MB/s당 월 $0.04(125 MB/s 위에서). 그래서 80GB 부팅 볼륨에 5,000 IOPS가 필요하면 추가 2,000 IOPS × $0.005 = 월 $10이 추가된다. 비교적 저렴한 옵션이라 production 부팅 볼륨도 gp3로 통일하는 게 표준이 되어가는 중.

## EBS Multi-Attach: 같은 볼륨을 여러 인스턴스에서

기본적으로 EBS volume은 한 EC2 인스턴스에만 attach된다. 그런데 **io1/io2 + Nitro 인스턴스 + 같은 AZ** 조합에서만 가능한 예외가 EBS Multi-Attach다. 최대 16개 인스턴스가 같은 volume에 동시 attach된다.

그런데 **여기서 시험에 자주 나오는 함정**: Multi-Attach만 켠다고 끝이 아니다. 일반 파일시스템(ext4, xfs)은 cluster-aware하지 않아서 여러 노드가 동시 write하면 파일시스템이 깨진다. **GFS2, OCFS2, VxFS** 같은 cluster file system이 필요하고, 그 위에서 distributed lock manager가 동시 access를 조율해야 한다. 즉 Multi-Attach는 application/middleware가 이미 클러스터링을 알고 있을 때(Oracle RAC, SAP ASCS·ERS 같은 경우)만 의미가 있다.

```python
# Multi-Attach 가능한 io2 volume 생성
volume = ec2.create_volume(
    AvailabilityZone='ap-northeast-2a',
    Size=100,
    VolumeType='io2',
    Iops=5000,
    MultiAttachEnabled=True
)
```

> 💡 **암기 팁**: 시험에 "여러 EC2가 같은 디스크 공유"라는 시나리오의 답은 거의 항상 **EFS**(NFS 기반 파일 공유)지 EBS Multi-Attach가 아니다. Multi-Attach는 cluster-aware 워크로드의 특수 케이스일 뿐.

## Instance Store: 물리적 NVMe의 진짜 모습

인스턴스 스토어(ephemeral storage, instance-store)는 EC2 호스트의 물리 디스크에 직접 연결된 스토리지다. EBS와 달리 네트워크를 거치지 않으므로 latency는 microsecond 수준, IOPS는 수백만에 달한다. 단점은 **호스트가 죽으면 데이터도 죽는다**는 것.

```
[EC2 instance on host server]
       |
       | PCIe direct attached
       |
[NVMe SSD physically on host]
   (호스트 서버에 물리적으로 박혀 있음)
```

i3·i4i·im4gn·is4gen 같은 storage-optimized 인스턴스 패밀리는 NVMe instance store가 큰 용량(수 TB까지)으로 제공된다. d2·d3 패밀리는 dense HDD instance store로 데이터 웨어하우스용. 단 instance store는 **시작 시점에 fixed size로 할당**되고 크기 변경이 불가하며, attach·detach 개념도 없다(인스턴스 자체와 한 몸).

| 동작 | EBS | Instance Store |
|------|-----|----------------|
| 인스턴스 reboot | 데이터 유지 | 데이터 유지 |
| 인스턴스 stop | 데이터 유지 | **데이터 소멸** |
| 인스턴스 terminate | 기본 삭제(DeleteOnTermination), 옵션으로 보존 가능 | **데이터 소멸** |
| 호스트 장애 | 데이터 유지 (3-way 복제) | **데이터 소멸** |
| AZ 장애 | 데이터 위험 (스냅샷 있으면 복구) | **데이터 소멸** |
| 다른 인스턴스에 attach | 가능 | 불가 |
| 크기 변경 | 가능 (실시간) | 불가 |

> 🔍 **더 깊이**: 인스턴스 stop은 인스턴스가 다른 호스트로 옮겨갈 수 있는 작업이다(start 시 새 호스트 할당). 그래서 호스트 종속인 instance store는 stop으로 데이터가 사라진다. 반대로 reboot은 같은 호스트에서 OS만 재시작하므로 데이터가 유지된다. Hibernate는 RAM 내용을 EBS 루트 볼륨에 dump하고 stop하는 것이라 instance store는 마찬가지로 소멸된다. 그래서 hibernate는 EBS 루트 볼륨이 암호화돼 있어야 하고, 일부 인스턴스 타입(주로 m·c·r 계열)만 지원한다.

> 📚 **사례**: 2017년 한 ML 스타트업이 i3.4xlarge에서 train된 모델 weights를 instance store에 저장하고 batch 종료 후 인스턴스를 stop했다가 모든 데이터를 잃었다. AWS는 친절하게 "Are you sure?" 경고를 띄우지만 자동화 스크립트는 그걸 무시한다. 그 회사는 그 후로 모든 training script에서 S3 sync를 마지막 단계로 강제했다고 한다. 시험에 "important data → instance store에만 저장"이라는 보기가 나오면 항상 오답.

## EBS Snapshot: S3 위의 incremental backup

EBS snapshot은 volume의 특정 시점 백업이다. S3에 저장된다고 적혀 있지만 실제로는 **AWS가 관리하는 S3 버킷**에 저장되고 사용자가 직접 접근할 수 없다.

핵심 메커니즘은 **block-level incremental backup**이다. 첫 snapshot은 모든 used block을 S3에 저장. 두 번째 snapshot부터는 **첫 snapshot 이후 변경된 block만** 저장하고, 변경 안 된 block은 첫 snapshot을 reference한다. 그래서 100GB 볼륨의 10번째 snapshot이라도 차지하는 추가 공간은 그 사이 변경된 분량만이다.

```
Snapshot 1 (Day 1):  [Block A][Block B][Block C][Block D]  → S3 full
Snapshot 2 (Day 2):  [        ][Block B'][        ][        ]  → S3 with reference
                     (실제 저장은 B'만, 나머지는 Snapshot 1을 가리킴)
Snapshot 3 (Day 3):  [        ][        ][Block C'][        ]  → S3 with reference
                     (C'만 저장)
```

이 구조 때문에 ① snapshot 1개당 비용은 변경량 비례(저렴), ② 중간 snapshot 삭제 시 다른 snapshot들이 reference하던 block은 유지(automatic dependency management), ③ snapshot에서 volume 복원 시 모든 block reference를 따라가 재구성한다.

| 작업 | 동작 | 비용 |
|------|------|------|
| Snapshot 생성 | block-level incremental | 변경된 block × 월 $0.0552 (S3 Standard 기준 GB/월) |
| Snapshot Archive | Glacier로 이동 (90일 최소) | 변경량 × $0.0144 (75% 저렴) |
| Snapshot 복사(같은 리전) | reference만 복사 | $0 |
| Snapshot 복사(다른 리전) | full data transfer | GB당 데이터 전송 비용 |
| Snapshot 복원(volume 생성) | lazy load (block 접근 시 fetch) | 즉시 가능, 처음엔 latency 높음 |
| Fast Snapshot Restore (FSR) | 미리 모든 block을 preload | 추가 비용 ($0.75/시간/snapshot/AZ) |

**Lazy load의 함정**: snapshot에서 volume을 만들면 "Available" 상태가 즉시 되지만, 그 안의 block은 처음 접근될 때 S3에서 fetch된다. 그래서 새 volume의 첫 fsck나 부팅 시 latency가 크게 튄다. 미리 모든 block을 채워두려면 ① `dd if=/dev/xvdf of=/dev/null bs=1M` 같은 명령으로 full scan, 또는 ② Fast Snapshot Restore(유료)를 켠다.

```python
# Snapshot 생성과 cross-region copy + encryption
snap = ec2.create_snapshot(
    VolumeId='vol-0abc1234',
    Description='Daily backup before deploy',
    TagSpecifications=[{
        'ResourceType': 'snapshot',
        'Tags': [{'Key': 'Backup', 'Value': '2026-05-26'}]
    }]
)

# 다른 리전으로 복사 + KMS 재암호화 + Archive tier (75% 절감)
target_ec2 = boto3.client('ec2', region_name='us-east-1')
copy = target_ec2.copy_snapshot(
    SourceRegion='ap-northeast-2',
    SourceSnapshotId=snap['SnapshotId'],
    Encrypted=True,
    KmsKeyId='arn:aws:kms:us-east-1:123:key/abc'
)

# 90일 이상 보관할 거면 Archive tier로 이동
ec2.modify_snapshot_tier(
    SnapshotId=snap['SnapshotId'],
    StorageTier='archive'
)
```

> ⚠️ **함정**: 시험에 "snapshot으로 만든 새 volume이 production보다 느리다"는 시나리오가 나오면 답은 Fast Snapshot Restore. lazy load 때문이다. 또 "snapshot을 다른 리전에 복사할 때 자동으로 암호화"는 가능하지만(`Encrypted=True`) 같은 KMS 키를 두 리전에서 쓸 수 없으므로 대상 리전의 KMS 키를 새로 지정해야 한다. Multi-Region KMS Key를 쓰면 두 리전이 같은 키 머티리얼을 공유 가능.

## EBS 암호화: KMS envelope encryption의 내부

EBS encryption은 사용자가 보기엔 토글 하나지만 내부적으로는 KMS의 envelope encryption을 쓴다.

```
1. EBS volume 생성 시 KMS에 "GenerateDataKey" 요청
2. KMS가 plaintext data key(DEK) + encrypted DEK를 반환
3. EC2 호스트의 Nitro Card가 plaintext DEK를 메모리에 보관 (memory only)
4. volume의 모든 block을 AES-256-XTS로 DEK로 암호화 후 디스크에 기록
5. encrypted DEK는 volume metadata에 함께 저장
6. 인스턴스 재부팅·옮겨갈 때마다 encrypted DEK를 다시 KMS Decrypt 호출로 복호화
```

핵심은 ① plaintext DEK는 KMS 안과 EC2 host 메모리에만 존재(디스크에 절대 안 적힘), ② 모든 IO는 transparent encrypt/decrypt(애플리케이션 입장에선 보이지 않음), ③ 성능 영향은 < 1% (AES-NI 하드웨어 가속 활용).

> 🔍 **더 깊이**: KMS Multi-Region Key는 2021년 출시. 같은 key material을 여러 리전에서 사용 가능하므로 EBS snapshot을 cross-region copy해도 같은 키로 복호화 가능. 이전엔 각 리전마다 새 키를 만들어 snapshot copy 시 re-encrypt해야 했다. 단 Multi-Region Key는 KMS의 fully-managed CMK가 아닌 customer-managed CMK(CMK)에서만 가능하다.

**미암호화 volume을 암호화하는 5단계**: ① snapshot 생성(미암호화) → ② `copy-snapshot --encrypted --kms-key-id` 로 암호화 복사 → ③ 암호화된 snapshot에서 새 volume 생성 → ④ 원래 volume detach, 새 volume attach → ⑤ 검증 후 원본 삭제. 이 순서를 통째로 외워야 한다.

> 💡 **관련 이론**: Envelope encryption은 1990년대 PGP가 표준화한 기법이다(RFC 4880). 큰 데이터를 빠른 symmetric 키로 암호화하고, 그 symmetric 키를 느린 asymmetric 키나 KMS 같은 강한 서비스로 한 번만 암호화한다. AES-256-XTS는 디스크 암호화 표준(IEEE 1619-2007)으로, 같은 plaintext block이라도 위치별로 다른 ciphertext가 나오게 해 패턴 누출을 막는다. BitLocker, FileVault, dm-crypt(LUKS) 모두 AES-XTS를 쓴다.

## EFS, FSx: EBS 너머의 파일 공유

EBS가 "한 인스턴스가 단독 사용하는 블록 디스크"라면, EFS는 "여러 인스턴스가 NFS로 공유하는 파일 시스템"이다. EFS는 multi-AZ에 자동 복제되고, 사용량 기반 과금(쓴 만큼 GB-월)이며, 인스턴스 수에 관계없이 throughput이 자동 확장된다.

| 서비스 | 프로토콜 | Multi-AZ | 동시 클라이언트 | 최대 throughput | 적합 |
|--------|---------|----------|------------|-----------|------|
| **EBS** | block (Nitro) | No (single AZ) | 1 (Multi-Attach 예외 16) | 4 GB/s (io2 Block Express) | DB, 부팅 |
| **EFS** | NFSv4.1 | Yes | 수천 | 10+ GB/s (Provisioned 모드) | 공유 파일, CMS, Lambda |
| **FSx for Lustre** | Lustre | No (single AZ, scratch) | 수천 | 100s GB/s | HPC, ML 학습 |
| **FSx for Windows** | SMB 2.x/3.x | Yes (옵션) | Windows 클라이언트 | 수 GB/s | AD 통합 Windows 공유 |
| **FSx for NetApp ONTAP** | NFS + SMB + iSCSI | Yes | 다중 프로토콜 | 수 GB/s | enterprise on-prem 이관 |
| **Instance Store** | local block | No | 1 | 수십 GB/s (NVMe) | 임시 캐시, 스크래치 |
| **S3** | HTTP/S3 API | Yes (region) | 무한 | 수십 GB/s (병렬) | 객체 저장, 정적 자산 |

**EFS의 두 가지 throughput 모드**:
- **Bursting**: 기본. 1TB 미만에서는 baseline 50 MB/s에 burst credit으로 100 MB/s 까지. 큰 워크로드엔 부족.
- **Provisioned**: 명시적으로 throughput 구매. baseline 무시.
- **Elastic** (2023): 자동 확장, 사용량 기반 과금. 새 워크로드의 기본값.

**EFS storage classes**:
- **Standard**: 자주 접근, $0.33/GB·월
- **Infrequent Access (IA)**: 30일 미접근 자동 이동, $0.025/GB·월 + 접근 시 GB당 $0.01
- **Archive**: 90일 미접근, $0.008/GB·월 + 접근 시 GB당 $0.03

> 🔍 **더 깊이**: Lambda가 EFS를 마운트할 수 있다는 점이 시험에 자주 나온다. Lambda는 boot 시 EFS access point를 통해 mount하고, 함수 안에서 일반 파일 IO처럼 read/write 가능. 큰 ML 모델(GB 단위)을 Lambda layer 한도(250MB) 안에 못 넣을 때 EFS에 둔다. 단 Lambda → EFS는 같은 VPC + 같은 subnet 또는 access point가 필요하고, cold start latency가 EFS mount 시간만큼 추가된다.

## CLI 종합

```bash
# gp3 볼륨 생성 (independent IOPS/throughput)
aws ec2 create-volume \
  --volume-type gp3 \
  --size 500 \
  --iops 6000 \
  --throughput 250 \
  --availability-zone ap-northeast-2a \
  --encrypted \
  --kms-key-id alias/aws/ebs

# 볼륨을 인스턴스에 attach (Linux는 보통 /dev/xvdf 이후)
aws ec2 attach-volume \
  --volume-id vol-0abc \
  --instance-id i-0xyz \
  --device /dev/sdf

# Linux 안에서 파일시스템 생성 (XFS 권장)
sudo mkfs -t xfs /dev/nvme1n1  # Nitro는 /dev/nvme1n1 형태
sudo mkdir /data
sudo mount /dev/nvme1n1 /data

# /etc/fstab에 추가 (재부팅 시 자동 마운트, nofail로 부팅 실패 방지)
echo 'UUID=$(blkid -s UUID -o value /dev/nvme1n1) /data xfs defaults,nofail 0 2' \
  | sudo tee -a /etc/fstab

# 실시간 볼륨 수정 (downtime 없이 size/IOPS/throughput/type 변경)
aws ec2 modify-volume \
  --volume-id vol-0abc \
  --size 1000 \
  --iops 10000

# 자동화된 snapshot — Data Lifecycle Manager
aws dlm create-lifecycle-policy \
  --execution-role-arn arn:aws:iam::123:role/DLMRole \
  --description "Daily backup, retain 7 days" \
  --state ENABLED \
  --policy-details '{
    "PolicyType": "EBS_SNAPSHOT_MANAGEMENT",
    "ResourceTypes": ["VOLUME"],
    "TargetTags": [{"Key": "Backup", "Value": "Daily"}],
    "Schedules": [{
      "Name": "DailySchedule",
      "CreateRule": {"Interval": 24, "IntervalUnit": "HOURS", "Times": ["03:00"]},
      "RetainRule": {"Count": 7}
    }]
  }'
```

## 정리하며

오늘 본 그림은 세 가지다. 첫째, EBS는 AZ 안의 분산 스토리지 fleet에 네트워크 너머 접근하는 block storage이고, gp3가 새 워크로드의 default이며 io2 Block Express가 인메모리 DB용 최상위 옵션이다. 둘째, Instance Store는 호스트 NVMe 직결이라 microsecond latency지만 stop·terminate·호스트 장애로 데이터가 사라지므로 절대 영구 저장에 쓰면 안 된다. 셋째, 여러 인스턴스가 같은 데이터를 본다면 EBS Multi-Attach가 아니라 EFS(또는 워크로드에 따라 FSx)가 정답이다.

다음 글에서는 그 위에 트래픽을 분산하는 layer — ALB·NLB·GWLB와 Auto Scaling Group을 본다. EBS가 한 인스턴스의 디스크 layer였다면, ELB·ASG는 여러 인스턴스 위의 가용성·확장성 layer다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 EC2 인스턴스의 instance store에 ML 모델 training 결과를 저장하고 인스턴스를 stop했더니 모든 데이터가 사라졌다. 가장 적절한 대응은?

A) 데이터는 복구 불가능하므로 train을 다시 한다 + 향후엔 train 종료 후 즉시 S3 sync로 백업
B) AWS Support에 데이터 복구 요청
C) instance store 옵션을 "persistent"로 변경
D) 다른 AZ로 옮긴다

**정답: A**
해설: Instance store는 호스트 서버에 물리 직결된 임시 스토리지이고, stop은 인스턴스가 다른 호스트로 옮겨갈 수 있는 작업이므로 데이터가 영구 소멸한다. 복구 방법은 없다. ML training 같은 워크로드는 항상 checkpoint를 정기적으로 S3·EFS에 sync하는 패턴이 표준. 또는 EBS에 결과를 저장하고 stop 시 데이터를 보존하는 방식. C의 "persistent instance store"는 존재하지 않는 옵션. D는 stop 자체로 이미 데이터가 사라진 후라 무관.

---

**문제 2.** 미암호화된 production EBS volume을 downtime 없이 암호화하려고 한다. 가장 정확한 절차는?

A) `aws ec2 modify-volume --encrypted true`로 직접 변환
B) Snapshot 생성 → `copy-snapshot --encrypted --kms-key-id`로 암호화 복사 → 암호화된 snapshot으로 새 volume 생성 → 짧은 downtime 동안 detach/attach 교체
C) AWS Support에 변환 요청
D) Volume을 두 번 복사

**정답: B**
해설: 실행 중인 volume을 직접 암호화하는 API는 없다. 표준 절차는 ① snapshot 생성 → ② cross-region 없이도 가능한 copy-snapshot에 `--encrypted` 플래그를 줘 암호화 복사 → ③ 그 snapshot으로 같은 AZ에 새 volume 생성 → ④ 인스턴스 일시 중지(또는 multi-attach 환경이면 일부 트래픽만 drain) → ⑤ 원래 volume detach, 새 volume attach. 완전 downtime 없는 변환은 불가능하지만, RDS의 경우 read replica를 암호화해 만들고 promote하는 방식으로 거의 무중단 전환 가능. A의 `modify-volume` API는 size/iops/throughput/type 변경만 지원하고 암호화는 변경 불가.

---

**문제 3.** Lambda 함수가 큰 ML 모델(약 2GB)을 load해야 한다. Lambda layer 한도(250MB)를 초과한다. 가장 적절한 솔루션은?

A) 모델을 더 작게 quantize한다
B) Lambda에 EFS access point를 마운트하고 EFS에 모델을 저장
C) Lambda 대신 EC2를 사용
D) 모델을 S3에 두고 Lambda 호출마다 download

**정답: B**
해설: Lambda는 2020년부터 EFS 마운트를 지원한다. EFS access point를 통해 같은 VPC + subnet에서 마운트하면 함수 안에서 일반 파일 IO처럼 모델 파일 접근 가능. ZIP/Layer 한도(250MB) 또는 deployment package 한도(50MB zipped)를 우회할 수 있다. D는 cold start마다 2GB를 S3에서 받아야 해 latency 폭발. C는 Lambda의 serverless 장점 포기. A는 정확도 손실. 단 Lambda는 VPC에 연결돼야 하고 cold start latency가 EFS mount 시간만큼 추가됨에 유의.

---

**문제 4.** 한 분석팀이 매일 100GB의 로그를 EC2에서 처리한다. 순차 read가 대부분이고 IOPS는 낮지만 throughput이 중요하다. 비용 효율적인 EBS 타입은?

A) gp3
B) io2 Block Express
C) st1 (throughput-optimized HDD)
D) sc1 (cold HDD)

**정답: C**
해설: st1은 HDD 기반으로 GB당 $0.051로 저렴하면서도 순차 read/write에서 최대 500 MB/s throughput을 낸다. 빅데이터 ETL, 로그 처리, 데이터 웨어하우스의 staging 영역에 표준. IOPS가 낮아 랜덤 access는 느리지만 순차 워크로드엔 SSD보다 cost-effective. sc1은 더 싸지만 throughput도 절반이라 매일 처리하는 워크로드엔 부족. gp3·io2는 SSD라 비싸고 throughput 한도가 1GB/s로 비슷하지만 가격이 5-10배. B의 io2 Block Express는 4GB/s까지 가능하지만 가장 비싸 cost-effective 측면에선 부적합. **HDD 볼륨은 부팅 볼륨으로 못 쓰니** 데이터 볼륨으로만 attach.

---

**문제 5.** Oracle RAC를 EC2 위에서 운영하려고 한다. 두 노드가 같은 데이터에 동시 access해야 한다. 적절한 스토리지 구성은?

A) gp3 volume을 두 노드에 각각 별도 attach
B) io2 Multi-Attach + cluster-aware file system (예: OCFS2)
C) EFS를 두 노드에 마운트
D) S3에 데이터 저장

**정답: B**
해설: Oracle RAC는 shared storage 모델로 동시 접근하는 cluster DB다. EBS Multi-Attach(io1/io2 + Nitro 인스턴스 + 같은 AZ, 최대 16 노드)로 같은 볼륨을 두 노드에 attach. 단 ext4·xfs 같은 일반 FS는 cluster-aware하지 않아 동시 write 시 corruption. Oracle ASM(Automatic Storage Management) 또는 OCFS2 같은 cluster file system이 필수. EFS는 NFS라 Oracle RAC가 요구하는 block-level access를 제공 못 함. C는 일반 파일 공유 워크로드에 적합. D는 OLTP DB에 부적합.

---

**문제 6.** EBS snapshot에서 새 volume을 만들었는데 처음에 응답이 매우 느리다. 가장 적절한 대응은?

A) volume type을 io2로 변경
B) Fast Snapshot Restore(FSR)를 해당 AZ에 활성화
C) snapshot을 다시 만든다
D) 인스턴스 타입을 키운다

**정답: B**
해설: snapshot에서 만든 volume은 lazy load — block에 처음 접근할 때 S3에서 fetch한다. 그래서 처음 read에서 latency가 크다. Fast Snapshot Restore를 활성화하면 모든 block이 미리 preload돼 처음부터 full performance. 비용은 시간당 $0.75/snapshot/AZ이므로 짧은 시간만 켜고 끄는 게 좋다. 대안으로 volume mount 후 `dd if=/dev/xvdf of=/dev/null bs=1M`으로 모든 block을 한 번 read해도 같은 효과. A·D는 lazy load 본질을 해결 못 함.

---

**문제 5(중복 방지를 위해 재번호): NotApplicable. 이미 5번 출제.

**문제 7.** 한 회사가 EBS snapshot을 90일 이상 장기 보관하려고 한다. 비용을 최소화하려면?

A) snapshot을 그대로 둔다 (S3 Standard 가격)
B) `modify-snapshot-tier`로 EBS Snapshot Archive(Glacier 기반)로 이동, 75% 절감 + 최소 90일 보관 약정 + 복원에 24-72시간
C) snapshot을 S3 Glacier에 직접 복사
D) snapshot을 삭제하고 volume을 백업한다

**정답: B**
해설: EBS Snapshot Archive(2021년 11월 출시)는 snapshot을 Glacier에 가까운 archive tier로 이동시켜 75% 비용 절감. 최소 90일 보관 약정(이전 삭제 시 위약금), 복원 요청 후 24-72시간 후 standard tier로 복원되어 사용 가능. compliance·legal hold 같은 장기 보관에 적합. C의 "S3 Glacier에 직접 복사"는 사용자가 EBS snapshot에 직접 S3 access를 못 하므로 불가능(AWS 관리 영역). D는 백업 자체가 사라지므로 안 됨. AWS Backup으로 통합 관리하는 것이 운영 측면에서 best practice.

---

**문제 8.** 한 개발팀이 같은 디렉터리를 ECS task 여러 개(같은 VPC에서 동시 실행)에서 read/write하려고 한다. 가장 적절한 스토리지는?

A) 각 task에 EBS volume attach
B) EFS volume을 모든 task에 마운트
C) S3 버킷에 file 동기화
D) FSx for Lustre

**정답: B**
해설: EFS는 NFSv4.1 기반으로 multi-AZ에 자동 복제되며 수천 클라이언트의 동시 access를 지원. ECS task definition에 `volumes` 항목으로 EFS file system을 지정하면 모든 task가 같은 디렉터리를 본다. CMS·shared config·log aggregation 패턴의 표준. A는 EBS는 기본적으로 1개 인스턴스에만 attach. C는 file system semantics가 아니라 object store이고 위치 기반 access가 불편. D는 HPC·ML training용 고성능 병렬 FS로 일반 공유 디렉터리엔 과한 비용.

---

## 📌 오늘의 요약

1. EBS는 AZ 종속 분산 블록 스토리지. gp3가 새 워크로드의 default, io2/io2 Block Express는 미션 크리티컬 DB용. HDD(st1·sc1)는 부팅 불가.
2. Snapshot은 S3 위의 block-level incremental backup. lazy load 함정 → Fast Snapshot Restore. 장기 보관은 Snapshot Archive(75% 절감).
3. EBS 암호화는 KMS envelope encryption + AES-256-XTS. 미암호화 → 암호화 전환은 snapshot copy 경유 5단계.
4. Instance store는 호스트 NVMe 직결 microsecond latency지만 stop/terminate/호스트 장애로 데이터 소멸. 절대 영구 저장에 사용 금지.
5. 여러 인스턴스 공유는 EFS(NFS, multi-AZ), Windows 공유는 FSx for Windows, HPC는 FSx for Lustre. EBS Multi-Attach는 cluster-aware 워크로드 한정.
