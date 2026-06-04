# Day 4 - S3 복제, Storage Gateway, Elastic DR — 파일과 워크로드를 옮기는 법

지금까지 다룬 백업은 블록(EBS)과 데이터베이스(RDS) 단위였다. 이 글은 단위를 셋으로 넓힌다 — **객체**(S3 데이터를 다른 리전·버킷으로), **하이브리드 파일**(온프레미스 NAS/테이프를 클라우드로), **워크로드 전체**(실행 중인 서버를 다른 곳에서 부팅 가능하게). 셋은 대상도 메커니즘도 다르지만 한 가지 질문을 공유한다. **"원본이 사라지는 순간, 어디서 다시 시작할 수 있는가."** 그 답이 비동기 복제(S3), 캐시 기반 게이트웨이(Storage Gateway), 연속 데이터 보호(DRS)로 갈라진다.

핵심은 각 도구가 푸는 문제의 모양이 다르다는 것이다. S3 Replication은 "객체를 다른 곳에 한 벌 더"의 문제고, Storage Gateway는 "온프레미스 앱은 그대로 두고 뒤를 S3로"의 문제고, DRS는 "서버 통째로를 분 단위로 다른 리전에서 켜는" 문제다. 도구를 외우는 게 아니라 문제의 모양으로 도구를 고르는 게 이 영역의 시험 전략이다.

## S3 Replication — Versioning이 전제인 이유와 무엇이 복제 안 되나

S3 Replication은 한 버킷의 객체를 다른 버킷으로 **비동기 복제**한다. 같은 리전이면 SRR(Same-Region Replication), 다른 리전이면 CRR(Cross-Region Replication)이다. 그런데 설정에 들어가기 전에 반드시 걸리는 전제가 하나 있다 — **소스와 대상 버킷 양쪽 모두 Versioning이 켜져 있어야 한다.** 이건 옵션이 아니라 강제다. 왜일까.

이유는 S3 복제가 **객체의 버전을 복제**하기 때문이다. Versioning이 꺼져 있으면 같은 키에 덮어쓸 때 이전 객체가 흔적 없이 사라져, "어떤 버전을 복제했고 무엇이 최신인지" 추적할 수 없다. Versioning이 켜져 있어야 각 PUT이 고유한 version ID를 갖고, 복제 시스템이 "이 version을 대상에 복제했다"를 멱등하게(idempotent) 관리할 수 있다. 비동기 복제에서 같은 작업이 재시도돼도 중복·꼬임이 없으려면 각 객체 버전이 고유 식별자를 가져야 하고, 그걸 Versioning이 보장한다.

복제의 또 다른 함정은 **무엇이 복제되지 않는가**다. Replication을 켜기 **전에** 이미 버킷에 있던 객체는 자동으로 복제되지 않는다 — 규칙은 켠 이후의 새 객체에만 적용된다. 기존 객체까지 옮기려면 **S3 Batch Replication**을 별도로 돌리거나 동기화 작업을 따로 해야 한다. 그 외에도 다른 버킷에서 이미 복제돼 온 객체(이중 복제 방지), SSE-C로 암호화된 객체(기본), 특정 lifecycle 동작 등은 기본 복제 대상에서 빠진다. 삭제 마커는 선택(Delete Marker Replication)으로 켜고 끌 수 있다.

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

**RTC(Replication Time Control)**는 복제에 **15분 SLA(99.99% 객체)**를 거는 유료 옵션이다. 일반 복제는 보통 빠르지만 시간 보장이 없어, 대용량이나 부하 시 수 시간 뒤처질 수도 있다. RTO/RPO가 빡빡한 DR이라면 RTC로 "15분 안에 대상에 도달"을 SLA로 못 박는다.

| 사용 사례 | 복제 종류 |
|-----------|-----------|
| 리전 단위 DR / 지역 데이터 보관 규제 | CRR |
| 계정 간 로그/감사 사본 격리 | SRR (Cross-Account) |
| 같은 리전 다른 비용 클래스로 운영 사본 | SRR |
| 엄격한 복제 시간 보장 | + RTC(15분 SLA) |

> 💡 **관련 이론**: S3 Replication이 "켜기 전 객체는 복제 안 됨"인 건 이것이 **이벤트 기반(event-driven) 비동기 복제**라서다. 규칙은 PUT 이벤트가 발생할 때 트리거되므로, 규칙이 존재하지 않던 과거의 PUT은 트리거된 적이 없어 복제되지 않는다. 이는 메시지 큐·스트림 처리에서 "소비자가 구독을 시작한 이후의 메시지만 받는다"는 것과 같은 원리다. 과거 데이터를 따라잡으려면 별도의 백필(backfill, =Batch Replication)이 필요하다. 비동기 복제는 본질적으로 **최종 일관성(eventual consistency)**이라 대상이 잠깐 뒤처지지만 결국 수렴하며, RTC는 그 "결국"에 시간 상한을 씌우는 장치다.

## S3 Storage Class와 Lifecycle — 데이터의 나이에 따라 비용을 줄인다

S3에 올린 데이터는 시간이 지날수록 접근 빈도가 떨어진다. 어제 로그는 자주 보지만 3년 전 로그는 규제 때문에 보관만 한다. 같은 비싼 Standard 클래스에 영원히 두면 낭비다. S3 **Storage Class**는 "얼마나 자주 접근하나 + 얼마나 빨리 꺼내야 하나"의 트레이드오프로 등급을 나누고, **Lifecycle Policy**가 객체를 나이에 따라 싼 등급으로 자동 이동시킨다.

| 클래스 | 최소 보관 | 복원 속도 | 용도 |
|--------|-----------|-----------|------|
| Standard | - | 즉시 | 자주 접근 |
| Intelligent-Tiering | - | 즉시 | 접근 패턴 불명 (자동 등급화) |
| Standard-IA | 30일 | 즉시 | 가끔 접근 |
| One Zone-IA | 30일 | 즉시 | 재생성 가능한 데이터(단일 AZ) |
| Glacier Instant | 90일 | 즉시(ms) | 분기성 즉시 복구 |
| Glacier Flexible | 90일 | 분~12시간 | 보관, 가끔 복구 |
| Glacier Deep Archive | 180일 | 12~48시간 | 장기 규제 보관, 최저가 |

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

여기서 흔한 함정은 **최소 보관 기간**과 **복원 속도**다. Standard-IA는 30일, Glacier는 90일, Deep Archive는 180일의 최소 보관이 있어, 그 전에 지우거나 다른 등급으로 옮겨도 최소 기간만큼 과금된다 — 자주 바뀌는 데이터를 IA에 넣으면 오히려 비싸진다. 그리고 Deep Archive는 가장 싸지만 복원에 12~48시간이 걸려, RTO가 빡빡한 DR 데이터를 여기 넣으면 정작 장애 때 못 꺼낸다. **접근 패턴을 모르겠으면 Intelligent-Tiering**이 자동으로 등급을 옮겨주니 안전한 기본값이다.

> 🔍 **더 깊이**: **S3 Object Lock**은 Day 1의 Snapshot Lock, Day 2의 Vault Lock과 같은 WORM 모델을 객체에 입힌다. Compliance 모드는 retention 기간 동안 루트 계정조차 객체를 삭제·덮어쓸 수 없고, Governance 모드는 특정 권한자가 해제할 수 있다. Object Lock도 Versioning 활성화가 필수인데, 이유는 같다 — 불변성은 "특정 버전을 고정"하는 것이라 버전 추적이 전제다. 금융·의료 규제(SEC 17a-4, HIPAA)의 변경 불가 보관, 그리고 Ransomware·내부자가 데이터를 지우는 시나리오 방어에 쓴다. 세 가지 Lock(Snapshot/Vault/Object)이 자원만 다를 뿐 "발급자조차 못 푼다"는 동일한 신뢰 모델을 공유한다는 게 Week 10 전체를 관통하는 패턴이다.

## Storage Gateway — 온프레미스 앱은 그대로, 뒤만 S3로

기업의 온프레미스에는 NFS/SMB로 파일을 읽는 앱, iSCSI 블록 볼륨에 쓰는 시스템, 테이프 백업 소프트웨어가 여전히 돌아간다. 이들을 한 번에 클라우드로 옮기는 건 위험하고 비용이 크다. **Storage Gateway**의 전략은 "앱은 건드리지 않는다"이다 — 온프레미스에 가상 어플라이언스(VMware/Hyper-V/EC2)를 띄우고, 기존 앱이 그 게이트웨이에 평소처럼 NFS/SMB/iSCSI/테이프로 접근하면, 게이트웨이가 뒤에서 데이터를 S3·Glacier로 보낸다. 앱 입장에선 로컬 스토리지를 쓰는 것 같지만 실제 데이터는 클라우드에 있다.

세 종류는 프로토콜과 용도로 갈린다.

- **File Gateway** — 온프레미스가 NFS/SMB로 접근하면 게이트웨이가 각 파일을 S3 객체로 저장한다. 자주 쓰는 데이터는 로컬 캐시에 둬 빠르게 응답하고, 전체는 S3에 있다. 파일 백업·미디어 아카이브·S3를 파일처럼 쓰는 데 적합하다.
- **Volume Gateway** — iSCSI 블록 볼륨을 제공한다. **Cached 모드**는 자주 쓰는 블록만 로컬, 전체는 S3(로컬 스토리지 절약). **Stored 모드**는 전체를 로컬에 두고 S3로 비동기 백업(저지연 우선 + 클라우드 백업).
- **Tape Gateway** — 가상 테이프 라이브러리(VTL)를 제공한다. Veritas·NetBackup 같은 기존 백업 SW가 물리 테이프인 줄 알고 쓰지만 실제론 S3→Glacier로 저장된다. 물리 테이프 인프라를 클라우드로 대체하는 데 쓴다.

> 💡 **관련 이론**: Storage Gateway의 로컬 캐시 + 원격 저장 구조는 컴퓨터 시스템 전반의 **캐싱 계층(memory hierarchy)** 원리 그대로다. CPU 캐시가 자주 쓰는 데이터를 빠른 SRAM에 두고 나머지를 느린 메모리/디스크에 두듯, File/Volume Gateway(Cached)는 hot 데이터를 로컬에, cold 데이터를 S3에 둔다. 이게 작동하는 건 데이터 접근에 **지역성(locality of reference)**이 있기 때문 — 최근 쓴 데이터를 또 쓸 확률(temporal locality)이 높아 작은 로컬 캐시로도 대부분의 접근을 빠르게 처리할 수 있다. CDN, OS page cache, DB buffer pool, 그리고 Storage Gateway가 모두 같은 지역성 가정 위에 선다.

## Elastic Disaster Recovery (DRS) — 서버 통째로를 분 단위로 켜다

S3 Replication은 객체를, Storage Gateway는 파일을 다룬다. **DRS(Elastic Disaster Recovery)**는 단위가 다르다 — **실행 중인 서버 전체**(OS, 애플리케이션, 데이터, 설정)를 다른 리전이나 AWS에서 그대로 부팅 가능하게 한다. 온프레미스나 타 클라우드의 서버에 에이전트를 깔면, 그 서버의 디스크를 **블록 레벨로 연속 복제(CDP, Continuous Data Protection)**한다 — 변경이 일어날 때마다 실시간으로 AWS에 흘려보낸다. 그래서 RPO가 초 단위다.

DRS의 비용 영리함은 **Staging Area**에 있다. 평소 복제 데이터는 AWS의 작은 스테이징 환경(저렴한 t3.small EC2 + EBS만)에 쌓인다 — 실제 운영 크기의 비싼 인스턴스를 평소엔 띄우지 않으므로 비용이 최소다. 페일오버(또는 drill 테스트)가 필요한 순간에야 그 복제된 EBS로 **실제 크기의 인스턴스를 launch**한다. 즉 "평소엔 데이터만 싸게 흘려두고, 터질 때만 큰 서버를 켠다."

```
온프레미스/타 클라우드 서버 (에이전트 설치)
        │ 블록 레벨 연속 복제 (CDP)
        ▼
AWS Staging Area
   t3.small EC2 + EBS(전체 데이터)   ← 평소: 작고 저렴
        │ 페일오버 트리거
        ▼
Production Subnet
   m5.large EC2 + EBS(복제본)        ← 그때만: 실제 크기로 launch
```

용도는 명확하다 — 데이터센터를 AWS로 마이그레이션, 멀티 리전 DR, 타 클라우드→AWS 페일오버. 과거 CloudEndure Disaster Recovery가 DRS로 통합됐다(이름 변경, 시험에 가끔 등장).

> ⚠️ **함정**: DRS와 백업/복제 도구를 혼동하면 안 된다. S3 Replication·DLM·AWS Backup은 **데이터**를 복제·보관하지만, 장애 시 그 데이터로 서버를 다시 세우는 건 별도 작업이다. DRS는 **워크로드 전체**를 분 단위 RTO로 즉시 부팅 가능하게 한다 — OS·앱·데이터가 통째로 복제되므로 페일오버하면 그 서버가 다른 곳에서 거의 그대로 살아난다. 시험에서 "데이터센터를 AWS로 DR, 평소 비용 최소화, 페일오버 시 분 단위 복구"는 거의 항상 DRS다. "S3 객체만 다른 리전에"는 CRR, "온프레미스 앱은 그대로 두고 백엔드만 S3"는 Storage Gateway로 구분한다.

## DataSync vs Transfer Family vs Snow — 데이터를 옮기는 세 가지 결

데이터를 AWS로 들이는 도구도 문제 모양에 따라 갈린다. **DataSync**는 대용량 데이터의 **고속 전송·동기화** 엔진이다 — NFS/SMB/HDFS/S3/EFS/FSx 간을 자동 병렬·검증·암호화하며 옮긴다. 1회성 마이그레이션(온프레미스 NAS 50TB → S3)이나 정기 동기화(매일 NAS → S3)에 쓴다. **Transfer Family**는 다른 결이다 — 외부 파트너가 **SFTP/FTPS/FTP/AS2** 같은 표준 프로토콜로 S3/EFS에 접근하게 하는 관리형 게이트웨이다. 레거시 파일 전송 시스템·B2B 파일 교환을 S3 뒤에 붙일 때 쓴다. **Snow Family**(Snowball 등)는 네트워크로 옮기기엔 너무 크거나(페타바이트급) 대역폭이 부족한 환경에서 **물리 장비에 담아 트럭으로** 보낸다.

선택 기준은 단순하다 — 네트워크로 옮길 만한 대용량 전송은 DataSync, 외부와의 표준 프로토콜 파일 교환은 Transfer Family, 네트워크로는 비현실적인 초대용량은 Snow.

> 📚 **사례**: DataSync 같은 전용 전송 도구가 나오기 전엔 대용량 마이그레이션에 `aws s3 sync`나 자체 스크립트를 썼는데, 단일 스레드 전송, 중간 실패 시 처음부터, 검증 부재로 "옮겼는데 일부가 깨졌다"가 흔했다. 수십 TB를 며칠에 걸쳐 옮기다 네트워크가 끊기면 어디까지 갔는지 몰라 다시 시작하는 식이었다. DataSync는 이를 병렬 전송 + 체크섬 검증 + 증분 재시도로 해결했다 — 끊겨도 이어서, 옮긴 뒤 무결성 검증까지 자동이다. "대용량 전송은 직접 짜지 말고 전용 도구를 써라"는 교훈이 도구화된 것으로, 백업·전송 같은 인프라 작업에서 자체 구현보다 검증된 관리형 서비스를 택하는 일반 원칙의 한 사례다.

## 정리하며

Day 4의 도구들은 "원본이 사라질 때 어디서 다시 시작하나"를 단위별로 답한다. S3 Replication은 객체를 다른 리전·버킷에 비동기로 한 벌 더 두고(Versioning 필수, 켠 이후 객체만), Storage Gateway는 온프레미스 앱을 건드리지 않고 캐시 뒤를 S3로 잇고, DRS는 서버 전체를 평소 싸게 흘려두다 장애 때 분 단위로 실제 크기로 켠다.

운영자가 기억할 다섯 가지는 이렇다. ① S3 Replication은 양쪽 Versioning 필수 + 켠 이후 새 객체만(기존은 Batch Replication), CRR(리전 DR)/SRR(같은 리전·계정 간 감사)/RTC(15분 SLA). ② Storage Class + Lifecycle로 나이에 따라 비용 절감, 최소 보관 기간·복원 속도 주의, 패턴 모르면 Intelligent-Tiering. ③ S3 Object Lock도 WORM(Versioning 필수) — Snapshot/Vault Lock과 같은 모델. ④ Storage Gateway 3종: File(NFS/SMB), Volume(iSCSI, Cached/Stored), Tape(VTL). ⑤ DRS는 워크로드 전체 CDP 페일오버(평소 Staging 작게), DataSync는 대용량 전송, Transfer Family는 SFTP, Snow는 물리 초대용량.

다음 글에선 Week 10 전체 — Snapshot·AWS Backup·RDS HA·S3/DRS — 를 시나리오 문제로 묶어 복습한다.

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
