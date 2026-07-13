# Day 4 - S3 Replication, Storage Gateway, Elastic Disaster Recovery: How to Move Files and Workloads

So far we've covered backups in blocks (EBS) and databases (RDS). This article widens scope to three units—**objects** (S3 data across regions/buckets), **hybrid files** (on-prem NAS/tape to cloud), **entire workloads** (running servers bootable elsewhere). Three have different targets and mechanisms but share one question: **"When original disappears, where can we restart?"** Answered by async replication (S3), cache-backed gateway (Storage Gateway), continuous data protection (DRS).

The key: each tool solves differently-shaped problems. S3 Replication is "place object elsewhere once more." Storage Gateway is "leave on-prem app untouched, only backend to S3." DRS is "boot entire server in other region within minutes." Tool selection isn't memorization but problem shape matching—core testing strategy here.

## S3 Replication—Why Versioning Is Required and What Doesn't Replicate

S3 Replication **asynchronously** replicates objects from one bucket to another. Same region is SRR (Same-Region Replication); cross-region is CRR (Cross-Region Replication). But before setup, one mandatory prerequisite: **both source and destination buckets must have Versioning enabled.** Not optional; mandatory. Why?

S3 replication replicates **object versions**. Without Versioning, overwrites on same key erase previous versions without trace—system can't track "which version was replicated and what's latest." Versioning enabled means each PUT gets unique version ID; replication system manages "this version replicated to target" idempotently. For async replication not to duplicate/tangle on retries, each object version must have unique ID, which Versioning guarantees.

Another trap: **what doesn't replicate.** Objects already in bucket **before** enabling Replication don't auto-replicate—rules apply only to new objects after enabling. To move existing objects, run **S3 Batch Replication** separately or sync manually. Beyond that, already-replicated objects (preventing double-replication), SSE-C encrypted objects (by default), specific lifecycle operations are excluded from standard replication. Delete markers can be optional (Delete Marker Replication) enabled/disabled.

```json
{
  "Role": "arn:aws:iam::123:role/s3-replication-role",
  "Rules": [{
    "ID": "ReplicateImportant",
    "Status": "Enabled",
    "Filter": {"Prefix": "important/"},
    "Destination": {
      "Bucket": "arn:aws:s3:::destination-bucket-us",
      "StorageClass": "STANDARD_IA",
      "ReplicationTime": {"Status": "Enabled", "Time": {"Minutes": 15}},
      "Metrics": {"Status": "Enabled"}
    }
  }]
}
```

**RTC (Replication Time Control)** is paid option imposing **15-minute SLA (99.99% of objects)** on replication. Standard replication is usually fast but unguaranteed timing, so hours of lag possible under load. With tight DR RTO/RPO, RTC locks "reach destination in 15 minutes" as SLA.

| Use Case | Replication Type |
|----------|------------------|
| Region-level DR / regional data residency regulation | CRR |
| Cross-account log/audit copy isolation | SRR (Cross-Account) |
| Same-region different cost-class operational copy | SRR |
| Strict replication time guarantee | + RTC (15-min SLA) |

> 💡 **Related Theory**: "Objects before enabling don't replicate" because S3 Replication is **event-driven async replication**. Rules trigger on PUT events, so past PUTs (before rule existed) never triggered, never replicated. Like message queues/streams where consumers receive only post-subscription messages. Past data needs separate backfill (=Batch Replication). Async replication is inherently **eventually consistent**—destination lags slightly but converges; RTC puts time ceiling on "eventually."

## S3 Storage Class and Lifecycle—Reduce Cost by Data Age

S3 data access frequency drops over time. Yesterday's logs get viewed often; 3-year-old logs kept only for compliance. Keeping all on expensive Standard forever wastes. S3 **Storage Class** divides tiers by "how often accessed + how fast to retrieve" tradeoff; **Lifecycle Policy** auto-migrates objects to cheaper tiers by age.

| Class | Min Keep | Restore Speed | Use |
|-------|----------|---------------|-----|
| Standard | - | Instant | Frequent access |
| Intelligent-Tiering | - | Instant | Unknown access (auto-tiering) |
| Standard-IA | 30 days | Instant | Occasional access |
| One Zone-IA | 30 days | Instant | Recreatable data (single AZ) |
| Glacier Instant | 90 days | Instant (ms) | Quarterly instant recovery |
| Glacier Flexible | 90 days | Minutes~12hrs | Archive, occasional recovery |
| Glacier Deep Archive | 180 days | 12~48hrs | Long-term regulation keep, lowest cost |

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

Common traps: **minimum retention** and **restore speed**. Standard-IA is 30 days, Glacier 90, Deep Archive 180 minimum; delete/move before that period and you're billed for minimum anyway—frequent-change data in IA gets pricier. Deep Archive is cheapest but 12~48-hour recovery—tight DR RTO can't pull from there. **Unknown access pattern? Intelligent-Tiering is safe default**, auto-migrating tiers.

> 🔍 **Deeper Dive**: **S3 Object Lock** applies same WORM model as Day 1's Snapshot Lock, Day 2's Vault Lock to objects. Compliance mode: root account can't delete/overwrite during retention. Governance mode: authorized can unlock. Object Lock also requires Versioning enabled—same reason: immutability means "fix specific version," needs version tracking. Used for financial/medical regulation (SEC 17a-4, HIPAA) change-proof keeping and ransomware/insider deletion defense. Three Locks (Snapshot/Vault/Object) share identical trust model across resources: "issuer can't unlock," Week 10's thread-connecting pattern.

## Storage Gateway—On-Prem App Unchanged, Backend to S3

Enterprise on-prem still runs NFS/SMB file-reading apps, iSCSI block-writing systems, tape-backup software. Migrating all to cloud at once is risky and costly. **Storage Gateway** strategy: "don't touch apps." Deploy virtual appliance on-prem (VMware/Hyper-V/EC2); existing apps access gateway via NFS/SMB/iSCSI/tape normally; gateway sends data to S3/Glacier behind scenes. To apps, looks like local storage; really cloud-backed.

Three types split by protocol and purpose:

- **File Gateway**—on-prem NFS/SMB access, gateway stores each file as S3 object. Frequent data stays in local cache for fast response; whole dataset on S3. Fits file backup, media archive, S3-as-filesystem use.
- **Volume Gateway**—provides iSCSI block volumes. **Cached mode**: frequent blocks local, whole on S3 (local storage saving). **Stored mode**: whole local, async S3 backup (low-latency priority + cloud backup).
- **Tape Gateway**—provides virtual tape library (VTL). Veritas/NetBackup legacy backup software thinks physical tape but actually stores via S3→Glacier. Replaces physical tape infra with cloud.

> 💡 **Related Theory**: Storage Gateway's local cache + remote storage is computer systems' **memory hierarchy** principle exactly. CPU cache keeps frequently-used data in fast SRAM, rest in slow memory/disk. File/Volume Gateway (Cached) keeps hot data local, cold on S3. Works because data access has **locality of reference**—recent data reuse probability (temporal locality) is high; small local cache handles most accesses fast. CDN, OS page cache, DB buffer pool, Storage Gateway all stand on locality assumption.

## Elastic Disaster Recovery (DRS)—Boot Entire Server Within Minutes

S3 Replication handles objects; Storage Gateway handles files. **DRS** is different unit—**entire running server** (OS, applications, data, config) bootable elsewhere identically. Install agent on server; it **continuously replicates disk block-level (CDP—Continuous Data Protection)**—real-time per-change AWS stream. So RPO is seconds.

DRS's cost cleverness is in **Staging Area**. Replica data normally sits in tiny AWS staging environment (just cheap t3.small EC2 + EBS)—no expensive full-size instances running, costs minimal. Failover (or drill test) moment comes, **launch real-size instance** with that replicated EBS. Strategy: "cheap data stream offline, big server only when needed."

```
On-Prem/Other Cloud Server (agent installed)
        │ Block-level continuous replication (CDP)
        ▼
AWS Staging Area
   t3.small EC2 + EBS (all data)   ← Usually: small, cheap
        │ Failover trigger
        ▼
Production Subnet
   m5.large EC2 + EBS (replica)    ← Then: real size launch
```

Uses clear: migrate datacenter to AWS, multi-region DR, other cloud→AWS failover. CloudEndure Disaster Recovery unified into DRS (name change, occasional exam appearance).

> ⚠️ **Trap**: Don't confuse DRS with backup/replication tools. S3 Replication, DLM, AWS Backup **replicate/preserve data** but separate work rebuilds servers from that data. DRS **replicates entire workload**, instantly bootable minutes' RTO—OS/apps/data all together, failover brings that server alive elsewhere nearly unchanged. Exam: "datacenter→AWS DR, minimize offline cost, minute-level failover RTO" almost always DRS. "S3 objects only other region" is CRR; "keep on-prem app, S3 backend only" is Storage Gateway.

## DataSync vs Transfer Family vs Snow—Three Ways to Move Data

Data ingestion to AWS splits by problem shape too. **DataSync** is **high-speed transfer/sync engine** for large data—automatically parallelizes/validates/encrypts between NFS/SMB/HDFS/S3/EFS/FSx. Used for one-time migration (on-prem NAS 50TB→S3) or regular sync (daily NAS→S3). **Transfer Family** is different—managed gateway letting external partners access S3/EFS via **SFTP/FTPS/FTP/AS2** standard protocols. Fits legacy file systems, B2B file exchange behind S3. **Snow Family** (Snowball etc.)—too huge for network (petabyte-scale) or insufficient bandwidth—**physical hardware delivered by truck**.

Selection is straightforward—network-viable large transfer uses DataSync; standard protocol file exchange with partners uses Transfer Family; network-impractical huge uses Snow.

> 📚 **Case Study**: Before dedicated DataSync-like tools, bulk migration used `aws s3 sync` or custom scripts—single-threaded transfers, restart-from-beginning on mid-transfer failure, no validation meant "transferred but some corrupted" happened. Transferring 10s TBs over days, network drop meant no way to know progress, restart entire. DataSync solved via parallel transfer + checksum validation + incremental retry—disconnects reconnect seamlessly, post-transfer integrity auto-checked. "Don't roll your own big transfers; use dedicated tools"—lesson codified, and generalizable principle for infrastructure tasks: prefer validated managed services over custom implementations.

## Wrapping Up

Day 4's tools answer "where restart when original vanishes" by unit. S3 Replication keeps objects async-copied elsewhere (Versioning required, post-enable objects only); Storage Gateway leaves on-prem untouched, S3-backed behind cache; DRS keeps servers cheap-streamed until failover flips real-size launch.

Five key takeaways for operators: ① S3 Replication requires Versioning both sides + new objects only (existing need Batch); CRR (region DR)/SRR (same-region/cross-account audit)/RTC (15-min SLA). ② Storage Class + Lifecycle trim cost by age; watch minimum-keep/restore-speed; Intelligent-Tiering if pattern unknown. ③ S3 Object Lock too is WORM (Versioning required)—same model as Snapshot/Vault Lock. ④ Storage Gateway 3 types: File (NFS/SMB), Volume (iSCSI Cached/Stored), Tape (VTL). ⑤ DRS is workload-total CDP failover (Staging small offline), DataSync is bulk transfer, Transfer Family is SFTP, Snow is physical huge.

Next article wraps Week 10 entire—Snapshot·AWS Backup·RDS HA·S3/DRS—as scenario review.

---

## 📝 연습 문제

**문제 1.** 회사가 S3 데이터를 다른 리전 DR 사이트에 자동 복제하려 한다. 설정의 필수 전제와 도구는?

A) DataSync를 주기적으로 실행한다
B) S3 Cross-Region Replication(CRR) — 소스·대상 버킷 양쪽에 Versioning 활성화 + IAM Role + Replication Rule
C) Storage Gateway File Gateway를 둔다
D) Lifecycle Policy로 다른 리전에 이동

**정답: B**

해설: S3 CRR이 리전 간 객체 복제의 표준이며, 소스와 대상 버킷 양쪽 모두 Versioning이 켜져 있어야 한다. 복제 시스템이 각 객체 버전을 고유 version ID로 멱등하게 관리하려면 Versioning이 전제이기 때문이다. IAM Role로 복제 권한을 주고 Replication Rule을 정의하면 켠 이후의 새 객체가 자동 복제된다. DataSync(A)는 전송/동기화 도구로 가능은 하나 S3 네이티브 복제에는 CRR이 정석이다.

---

**문제 2.** S3 Replication을 켰는데 기존에 이미 있던 객체들이 대상 버킷에 복제되지 않는다. 원인과 해결은?

A) IAM 권한 부족
B) Replication 규칙은 켠 이후의 새 객체에만 적용되므로, 기존 객체는 S3 Batch Replication으로 별도 백필해야 한다
C) Versioning이 꺼져 있다
D) 대상 버킷이 다른 계정이다

**정답: B**

해설: S3 Replication은 이벤트 기반 비동기 복제라 PUT 이벤트가 발생할 때 트리거된다. 규칙이 없던 과거의 PUT은 트리거된 적이 없어 복제되지 않는다 — 규칙은 켠 이후 객체에만 적용된다. 기존 객체까지 옮기려면 S3 Batch Replication을 별도로 실행해 백필해야 한다. 이는 메시지 스트림에서 구독 이후 메시지만 받는 것과 같은 원리다.

---

**문제 3.** 온프레미스 백업 소프트웨어(Veritas/NetBackup)가 물리 테이프에 백업하던 방식을 앱 변경 없이 AWS로 옮기려 한다. 어떤 도구인가?

A) S3에 직접 업로드
B) Storage Gateway — Tape Gateway(VTL), 기존 백업 SW가 가상 테이프로 인식하고 실제론 S3→Glacier 저장
C) DataSync
D) AWS Backup

**정답: B**

해설: Tape Gateway는 가상 테이프 라이브러리(VTL)를 제공해, 기존 백업 소프트웨어가 물리 테이프 장치인 줄 알고 그대로 사용하지만 실제 데이터는 S3를 거쳐 Glacier로 저장된다. 백업 SW와 운영 절차를 바꾸지 않고 물리 테이프 인프라만 클라우드로 대체하는 정확한 사용 사례다. Storage Gateway의 "앱은 그대로, 뒤만 클라우드" 전략의 대표 예다.

---

**문제 4.** 운영 데이터센터를 AWS로 DR 페일오버 가능하게 하되, 평소 비용은 최소화하고 페일오버 시 분 단위로 복구해야 한다. 어떤 도구인가?

A) S3 Cross-Region Replication
B) AWS Elastic Disaster Recovery(DRS) — 블록 레벨 CDP로 평소 작은 Staging에 복제, 페일오버 시 실제 크기 인스턴스 launch
C) Storage Gateway Volume Gateway
D) DataSync 정기 동기화

**정답: B**

해설: DRS는 서버 전체(OS·앱·데이터)를 블록 레벨로 연속 복제(CDP)해 RPO 초 단위를 달성하고, 평소엔 저렴한 t3.small + EBS의 Staging Area에만 데이터를 쌓아 비용을 최소화한다. 페일오버 시점에야 복제된 EBS로 실제 크기의 인스턴스를 launch해 분 단위 RTO로 복구한다. S3 Replication(A)은 객체만 복제하고 서버를 세우진 않으므로 워크로드 페일오버에는 DRS가 정답이다.

---

**문제 5.** S3 객체에 5년간 변경·삭제를 절대 불가능하게(규제 WORM) 강제하려 한다. 어떤 기능과 전제가 필요한가?

A) IAM 정책으로 삭제 거부
B) S3 Object Lock Compliance 모드 + 5년 retention, Versioning 활성화 필수
C) Cross-Region Replication
D) Lifecycle Policy로 Glacier 이동

**정답: B**

해설: S3 Object Lock의 Compliance 모드는 retention 기간 동안 루트 계정조차 객체를 삭제·덮어쓸 수 없는 WORM 보관을 제공해 SEC 17a-4·HIPAA 같은 규제를 만족하고 Ransomware·내부자 삭제를 방어한다. Object Lock은 특정 버전을 고정하므로 Versioning 활성화가 필수다. IAM(A)은 권한 탈취 시 우회되어 불변성을 보장하지 못한다. Snapshot Lock·Vault Lock과 같은 WORM 모델이다.

---

**문제 6.** 온프레미스 NAS의 50TB 데이터를 S3로 1회성 마이그레이션하려 한다. 네트워크 대역폭은 충분하다. 무결성 검증과 재시도까지 자동인 도구는?

A) aws s3 sync 스크립트
B) AWS DataSync — 병렬 전송 + 체크섬 검증 + 증분 재시도로 대용량 전송 자동화
C) Snowball
D) Transfer Family(SFTP)

**정답: B**

해설: DataSync는 대용량 데이터 전송·동기화 전용 엔진으로, 자동 병렬 전송, 전송 후 체크섬 무결성 검증, 중단 시 증분 재시도, 암호화를 제공한다. `s3 sync` 스크립트(A)는 단일 스레드·검증 부재·중단 시 재시작 문제가 있다. Snowball(C)은 대역폭이 부족하거나 페타바이트급일 때, Transfer Family(D)는 외부 파트너의 SFTP 파일 교환용이다. 대역폭이 충분한 50TB 전송은 DataSync가 정석이다.

---

**문제 7.** 자주 바뀌는 데이터를 비용 절감하려 Standard-IA로 옮겼더니 오히려 비용이 늘었다. 그리고 접근 패턴을 예측하기 어렵다. 더 나은 선택은?

A) Glacier Deep Archive로 이동
B) S3 Intelligent-Tiering — 접근 패턴에 따라 자동으로 등급을 옮겨 최소 보관 기간 위반 없이 비용 최적화
C) One Zone-IA
D) Standard 그대로 두고 Lifecycle 비활성화

**정답: B**

해설: Standard-IA는 30일 최소 보관 기간이 있어 자주 바뀌는(30일 전에 교체/삭제되는) 데이터를 넣으면 최소 기간만큼 과금돼 오히려 비싸진다. 접근 패턴을 예측하기 어려운 데이터는 Intelligent-Tiering이 적합하다 — 객체별 접근 빈도를 모니터링해 자동으로 Frequent/Infrequent 등급 사이를 옮기므로 최소 보관 위반 없이 비용을 최적화한다. Deep Archive(A)는 복원이 12~48시간이라 자주 접근하는 데이터에 부적합하다.

---
