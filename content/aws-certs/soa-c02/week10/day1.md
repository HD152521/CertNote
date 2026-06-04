# Day 1 - EBS Snapshot, 변경된 블록만 기억하는 백업의 내부

백업의 가장 순진한 정의는 "데이터를 통째로 한 번 더 복사하는 것"이다. 그런데 1TB 볼륨을 매시간 통째로 복사하면 하루에 24TB, 한 달이면 720TB가 쌓인다. 이건 백업이 아니라 비용 폭탄이다. EBS Snapshot이 영리한 건 이 순진한 정의를 버리고 "지난번 백업 이후 **바뀐 블록만** 기록한다"는 증분(incremental) 모델을 택했기 때문이다. 첫 스냅샷만 전체 크기고, 그 다음부터는 변경분만 쌓인다. 1TB 볼륨이라도 하루에 10GB만 바뀌면 두 번째 스냅샷은 10GB어치만 차지한다.

이 한 가지 설계 결정에서 EBS Snapshot의 모든 특성이 파생된다. 왜 스냅샷을 지워도 다른 스냅샷이 멀쩡한지, 왜 AMI를 지워도 스냅샷이 남는지, 왜 새 볼륨의 첫 IO가 느린지, 왜 비용이 직관과 다르게 나오는지 — 전부 "변경된 블록만 기억한다"는 원리를 따라가면 설명된다. 이 글은 그 내부 구조를 파고든다.

## 스냅샷은 파일이 아니라 블록 포인터의 집합이다 — 증분 백업의 내부

EBS Snapshot이 "S3에 저장된다"는 말은 맞지만 오해를 부른다. 사용자가 보는 S3 버킷에 `snapshot.img` 파일이 놓이는 게 아니다. EBS는 볼륨을 고정 크기 **블록**(보통 512KiB 단위)으로 쪼개 관리하고, 스냅샷은 그 블록들을 가리키는 **포인터의 집합 + 메타데이터(매니페스트)**로 존재한다. AWS가 내부적으로 운영하는 S3 기반 스토리지에 블록 데이터를 저장하고, 각 스냅샷은 "내 볼륨의 이 시점 상태는 이 블록들의 조합"이라는 지도만 갖는다.

첫 스냅샷을 만들면 볼륨의 모든 점유 블록이 백업 스토리지로 복사되고, 스냅샷 매니페스트가 그 블록 전부를 가리킨다. 한 시간 뒤 두 번째 스냅샷을 만들면, EBS는 그 사이 **dirty bit가 켜진(변경된) 블록만** 새로 복사한다. 변경되지 않은 블록에 대해서는 두 번째 매니페스트가 **첫 스냅샷이 이미 저장해둔 블록을 그대로 가리킨다.** 같은 블록을 두 번 저장하지 않는다. 이게 증분 백업의 핵심이고, 동시에 스냅샷들이 블록을 **공유**한다는 뜻이기도 하다.

```
볼륨 블록:   [A][B][C][D][E]   (5개 블록)

Snapshot 1 (전체):
   저장:  A1 B1 C1 D1 E1  (5개 블록 모두 저장)
   매니페스트 → A1 B1 C1 D1 E1

(C, E 블록만 변경됨)

Snapshot 2 (증분):
   저장:  C2 E2  (변경된 2개만 새로 저장)
   매니페스트 → A1 B1 C2 D1 E2
                ↑  ↑     ↑
                Snapshot1의 블록을 재사용
```

여기서 가장 자주 오해되는 지점이 나온다. "Snapshot 1을 지우면 Snapshot 2도 깨지지 않나?" 깨지지 않는다. 스냅샷을 삭제하면 EBS는 **다른 스냅샷이 아무도 참조하지 않는 블록만** 실제로 지운다. Snapshot 1을 삭제해도 A1·B1·D1은 Snapshot 2가 여전히 참조하므로 살아남고, Snapshot 1만 단독으로 쓰던 C1·E1만 제거된다. 사용자 입장에선 각 스냅샷이 독립적인 완전 백업처럼 보이지만, 내부는 블록을 공유하는 포인터 그래프다.

> 💡 **관련 이론**: 이 블록 공유 구조는 함수형 자료구조의 **persistent data structure**(영속 자료구조)와 정확히 같은 아이디어다. 리스트에 원소를 추가할 때 전체를 복사하지 않고 바뀐 부분만 새로 만들고 나머지는 기존 노드를 공유(structural sharing)하는 그 패턴이다. Git이 커밋을 저장하는 방식도 동일하다 — 각 커밋은 전체 트리의 스냅샷처럼 보이지만 변경되지 않은 파일/디렉터리(blob, tree 객체)는 이전 커밋의 객체를 SHA 해시로 그대로 가리킨다. EBS Snapshot, Git, ZFS 스냅샷, copy-on-write 파일시스템이 모두 "변경분만 새로 쓰고 나머지는 공유"라는 한 가지 원리의 변주다.

> 🔍 **더 깊이**: EBS가 변경된 블록을 추적하는 메커니즘이 바로 **CBT(Changed Block Tracking)**다. 볼륨에 쓰기가 일어나면 해당 블록이 dirty로 표시되고, 다음 스냅샷이 이 표시를 보고 무엇을 복사할지 안다. AWS는 이 추적 정보를 **EBS direct API**의 `ListChangedBlocks`로 외부에 노출한다 — 두 스냅샷을 주면 그 사이 바뀐 블록 목록과 오프셋을 반환한다. 백업 SW(예: Veeam, Cohesity)가 EBS를 효율적으로 통합할 수 있는 게 이 API 덕분이다. 전체 볼륨을 스캔하지 않고 "지난 백업 이후 바뀐 블록"만 직접 읽어가기 때문이다. `GetSnapshotBlock`으로 개별 블록 데이터까지 직접 가져올 수 있다.

## AMI는 스냅샷의 묶음 + 부팅 레시피다 — 왜 AMI를 지워도 스냅샷이 남나

AMI(Amazon Machine Image)를 "EC2 부팅 이미지"라고만 외우면 운영에서 사고가 난다. AMI의 실체는 **EBS 스냅샷들에 대한 참조 + 부팅 메타데이터(레시피)**다. 인스턴스에 루트 볼륨 하나와 데이터 볼륨 두 개가 붙어 있으면, `create-image`는 그 세 볼륨 각각의 스냅샷을 만들고, AMI는 "부팅할 때 이 스냅샷들로 이 디바이스 매핑(`/dev/xvda`, `/dev/xvdb`...)을 복원하라"는 레시피만 담는다. AMI 자체는 데이터를 갖지 않는다 — 데이터는 전부 스냅샷에 있고 AMI는 그 조립 설명서다.

이 구조가 운영에서 가장 악명 높은 비용 함정을 만든다. AMI를 `deregister`(등록 해제)하면 **레시피만 사라지고, 그 레시피가 가리키던 스냅샷들은 그대로 남는다.** 사용자는 "AMI를 지웠으니 비용이 줄겠지" 하지만, 실제 데이터(스냅샷)는 계속 GB당 과금된다. 수백 개의 골든 AMI를 버전별로 만들고 지우기를 반복한 계정에서, deregister만 하고 스냅샷을 방치한 결과 "쓰지도 않는 스냅샷이 수 테라바이트" 쌓이는 일이 흔하다. AMI deregister와 스냅샷 삭제는 별개의 작업이고, 이걸 자동으로 묶으려면 DLM의 옵션이나 별도 정리 스크립트가 필요하다.

> ⚠️ **함정**: `aws ec2 create-image`에 `--no-reboot`를 주면 인스턴스를 멈추지 않고 이미지를 만든다. 운영 중단을 피하니 좋아 보이지만, 이건 **crash-consistent** 스냅샷이라 메모리·디스크 버퍼에 떠 있던 데이터가 빠질 수 있다. 데이터베이스처럼 파일시스템 캐시와 디스크 상태가 어긋나면 안 되는 워크로드는 `--no-reboot` 없이(즉 재부팅하며) 만들거나, OS 레벨에서 파일시스템을 flush·freeze한 뒤 만들어야 한다. 반대로 단순 웹 서버 골든 이미지라면 `--no-reboot`가 합리적이다. 시험에서 "운영 중단 없이 일관된 백업"이 나오면 단순 `--no-reboot`가 아니라 application-consistent 처리(아래)가 핵심이다.

## Crash-consistent vs Application-consistent — fsfreeze가 푸는 문제

스냅샷이 "시점 백업"이라는 말에는 함정이 숨어 있다. 1TB 볼륨의 스냅샷은 순간적으로 모든 블록을 동시에 얼리는 게 아니라, 블록을 하나씩 백업 스토리지로 복사하는 과정이다. 그 사이에도 애플리케이션은 계속 디스크에 쓴다. 게다가 OS는 성능을 위해 쓰기를 메모리 버퍼(page cache)에 모았다가 나중에 디스크로 내려보낸다(write-back). 스냅샷을 찍는 순간 디스크에는 아직 내려가지 않은 쓰기가 메모리에 떠 있을 수 있다.

이 상태로 찍힌 스냅샷이 **crash-consistent** 스냅샷이다 — 마치 서버 전원을 갑자기 뽑았을 때 디스크가 처한 상태와 같다. 대부분의 저널링 파일시스템(ext4, NTFS)과 DB는 이런 갑작스러운 정전에서 복구하도록 설계돼 있어 보통은 살아나지만, 보장은 아니다. 진행 중이던 멀티 블록 트랜잭션이 절반만 디스크에 닿았다면 복구 후 데이터가 깨질 수 있다.

**application-consistent** 스냅샷은 이 위험을 없앤다. 스냅샷을 찍기 직전에 애플리케이션과 OS에 "잠깐 쓰기를 멈추고 메모리 버퍼를 디스크로 다 내려보내라"고 명령한다. Linux에서는 `fsfreeze -f`로 파일시스템을 얼려 새 쓰기를 막고 캐시를 flush하고, Windows에서는 **VSS(Volume Shadow Copy Service)**가 DB·Exchange 같은 VSS-aware 애플리케이션에 "지금 일관된 상태를 만들라"고 통지한다. 그 짧은 일관 상태에서 스냅샷을 찍고 즉시 `fsfreeze -u`로 푼다. AWS는 이걸 SSM Document(`AWSEC2-CreateVssSnapshot`, Linux는 pre/post 스크립트)로 자동화한다 — Run Command가 인스턴스 안에서 freeze 명령을 내리고, 얼어 있는 동안 EBS 스냅샷 API를 호출한다.

| 모드 | 무엇을 얼리나 | 위험 | 표준 도구 |
|------|---------------|------|-----------|
| Crash-consistent (기본) | 아무것도 안 얼림 | 메모리 버퍼·진행 중 트랜잭션 유실 가능 | `create-snapshot` 그대로 |
| Filesystem-consistent | 파일시스템 캐시 flush | 앱 레벨 트랜잭션은 미보장 | Linux `fsfreeze` |
| Application-consistent | 앱+FS 모두 정지 | 거의 없음 | Windows VSS / SSM pre-post script |

> 💡 **관련 이론**: 이 문제의 뿌리는 OS의 **write-back caching**이다. 디스크 IO는 메모리보다 수만 배 느리므로, OS는 쓰기를 즉시 디스크에 반영하지 않고 page cache에 모았다가 일괄로 내려보낸다(`pdflush`/`writeback` 커널 스레드). 이 덕에 성능은 좋아지지만 "메모리에 있는 진짜 최신 상태"와 "디스크에 박힌 상태"가 항상 어긋난다. `fsync()` 시스템 콜은 특정 파일의 버퍼를 강제로 디스크에 내려 이 간극을 닫는 호출이고, `fsfreeze`는 파일시스템 전체에 대해 같은 일을 하면서 새 쓰기까지 막는다. DB가 트랜잭션 커밋 시 WAL(Write-Ahead Log)을 `fsync`하는 것도 같은 이유 — "디스크에 진짜 닿았다"를 보장해야 정전에도 트랜잭션이 살아남기 때문이다.

## DLM — 태그 한 줄로 백업 라이프사이클을 자동화한다

스냅샷을 손으로 찍고 손으로 지우면 두 가지가 반드시 터진다. 첫째, 사람이 까먹어서 백업이 누락된다. 둘째, 아무도 옛 스냅샷을 안 지워서 비용이 무한히 쌓인다. **DLM(Data Lifecycle Manager)**은 이 둘을 "정책 + 태그"로 자동화한다. 운영자는 리소스에 `Backup=daily` 같은 태그를 붙이고, DLM 정책에 "이 태그가 붙은 볼륨을 매일 새벽 3시에 스냅샷, 7개만 유지"라고 선언하면 끝이다. 그 다음부터 생성·보존·삭제·Cross-Region 복제가 전부 자동으로 돈다.

DLM의 정책 타입은 대상에 따라 갈린다. **EBS Snapshot Policy**는 `ResourceTypes: VOLUME`으로 볼륨 단위 스냅샷을 찍고, **EBS-backed AMI Policy**는 `ResourceTypes: INSTANCE`로 인스턴스 전체의 AMI(=루트+데이터 볼륨 스냅샷 묶음)를 만든다. **Event-Based Policy**는 좀 특별한데, "다른 계정이 나에게 스냅샷을 공유하는 이벤트"를 트리거로 받아 자동으로 내 계정에 복사한다 — 중앙 백업 계정으로 스냅샷을 끌어모으는 패턴에 쓴다.

보존 규칙(RetainRule)은 **Count(개수)**와 **Age(기간)** 두 방식이 있다. `Count: 7`이면 항상 최신 7개만 남기고 8번째가 생기면 가장 오래된 걸 지운다. `Interval: 7 DAYS`면 7일 지난 스냅샷을 지운다. 둘의 차이가 운영에서 중요하다 — 생성 주기가 들쭉날쭉하면 Count는 보존 기간이 불규칙해지고, Age는 개수가 불규칙해진다.

```bash
# 매일 새벽 3시 AMI, 7개 보존, us-east-1로 Cross-Region 복제
aws dlm create-lifecycle-policy \
  --description "Daily AMI 7-day retention" \
  --state ENABLED \
  --execution-role-arn arn:aws:iam::123:role/AWSDataLifecycleManagerDefaultRole \
  --policy-details '{
    "PolicyType":"IMAGE_MANAGEMENT",
    "ResourceTypes":["INSTANCE"],
    "TargetTags":[{"Key":"Backup","Value":"daily"}],
    "Schedules":[{
      "Name":"Daily AMI",
      "CreateRule":{"CronExpression":"cron(0 3 ? * * *)"},
      "RetainRule":{"Count":7},
      "TagsToAdd":[{"Key":"BackupType","Value":"DailyAMI"}],
      "CrossRegionCopyRules":[{
        "TargetRegion":"us-east-1",
        "Encrypted":true,
        "CmkArn":"arn:aws:kms:us-east-1:123:key/abc",
        "RetainRule":{"IntervalUnit":"DAYS","Interval":7}
      }]
    }]
  }'
```

DLM과 자주 헷갈리는 게 **AWS Backup**(Day 2)이다. 경계는 분명하다 — DLM은 **EBS/AMI 전용**의 가벼운 스냅샷 스케줄러이고, AWS Backup은 RDS·DynamoDB·EFS·FSx·S3까지 아우르는 **멀티 서비스 통합 백업 + 컴플라이언스** 플랫폼이다. EBS만 백업하면 DLM이 가볍고 비용도 거의 안 든다. 여러 서비스를 한 정책으로 묶고 Audit Manager로 감사 보고서까지 뽑아야 하면 AWS Backup이다.

| 항목 | DLM | AWS Backup |
|------|-----|------------|
| 대상 | EBS 볼륨, AMI만 | EBS/RDS/DDB/EFS/FSx/S3 등 다수 |
| 정책 단위 | Lifecycle Policy | Backup Plan(Rule 묶음) |
| 컴플라이언스 | 없음 | Backup Audit Manager |
| Cross-Account | Event-Based로 제한적 | Vault 정책으로 완전 지원 |
| 비용 | 정책 무료(스냅샷 저장만) | 관리 요금 + 저장 |

> 📚 **사례**: 2014년 Code Spaces라는 코드 호스팅 업체가 폐업한 사건은 백업 격리의 교과서적 사례다. 공격자가 AWS 콘솔 자격증명을 탈취해 EC2 인스턴스, S3, **그리고 EBS 스냅샷과 백업까지 한 번에 삭제**했다. 운영 데이터와 백업이 같은 계정·같은 권한 아래 있었기 때문에 한 번의 침해로 전부 증발했고, 복구가 불가능해 회사가 문을 닫았다. 이 사건 이후 업계 표준이 된 원칙이 "백업은 운영과 다른 계정/다른 권한 경계에 둔다"이고, DLM의 Cross-Region·Cross-Account 복제와 Day 2의 Snapshot Lock·Vault Lock이 모두 이 교훈의 구현이다. 백업이 운영자와 같은 키로 지워질 수 있으면 그건 백업이 아니다.

## Snapshot Lock — 백업 자체를 지울 수 없게 만드는 마지막 방어선

DLM으로 백업을 자동화해도 한 가지 구멍이 남는다. **권한 있는 운영자(또는 그 자격증명을 탈취한 공격자)는 스냅샷을 지울 수 있다.** Ransomware 공격의 진화된 형태는 데이터를 암호화하기 전에 먼저 백업부터 삭제한다 — 복구 수단을 없애야 몸값을 받을 수 있기 때문이다. Code Spaces가 정확히 이렇게 무너졌다. **Snapshot Lock**은 이 마지막 구멍을 막는다. 잠긴 스냅샷은 지정한 기간 동안 **그 누구도, 어떤 권한으로도 삭제할 수 없다.**

잠금에는 두 모드가 있고 이 구분이 시험과 실무 모두에서 핵심이다. **Governance 모드**는 특정 IAM 권한(`ec2:UnlockSnapshot`)을 가진 주체가 잠금을 풀 수 있다 — 실수 방지용 가드레일에 가깝다. **Compliance 모드**는 잠금이 한번 활성화되면(cooling-off 기간 후) **루트 계정도, AWS도 풀 수 없다.** SEC 17a-4, HIPAA 같은 규제가 요구하는 WORM(Write Once Read Many) 요건을 만족시키는 진짜 불변 백업이다. Compliance 모드의 무서움과 강력함은 동전의 양면이다 — 공격자가 절대 못 지우지만, 운영자가 실수로 너무 긴 기간을 걸어도 못 푼다.

> 🔍 **더 깊이**: WORM은 새 개념이 아니라 1990년대 금융권의 규제 대응에서 나왔다. 증권사는 거래 기록을 변조 불가능한 매체에 보관해야 했고(SEC Rule 17a-4), 당시엔 물리적으로 한 번만 기록 가능한 광디스크(WORM optical disc)를 썼다. 한 번 구운 디스크는 물리적으로 덮어쓸 수 없으니 변조가 불가능했다. 클라우드 시대에 이 물리적 불변성을 소프트웨어로 재현한 게 Compliance 모드 Lock이다 — Snapshot Lock, S3 Object Lock(Day 4), Backup Vault Lock(Day 2)이 전부 같은 WORM 모델을 각자의 자원에 입힌 것이다. "한번 잠그면 발급자조차 못 푼다"는 제약이 불편해 보여도, 그게 바로 규제가 요구하는 신뢰의 본질이다 — 신뢰는 "관리자도 손댈 수 없음"을 증명할 때 성립한다.

## 새 볼륨의 첫 IO는 왜 느린가 — Lazy Loading과 FSR

스냅샷에서 새 EBS 볼륨을 만들면 `create-volume`은 거의 즉시 끝나고 볼륨이 "available"로 뜬다. 그런데 그 볼륨을 마운트해 처음 읽으면 IO가 답답할 만큼 느리다. 이건 버그가 아니라 **lazy loading**(지연 로딩)이라는 설계다. 스냅샷의 블록은 백업 스토리지(S3 기반)에 있고, 볼륨을 만들었다고 그 블록들이 즉시 EBS로 복사되는 게 아니다. 볼륨의 메타데이터만 먼저 만들어지고, 실제 블록은 **처음 접근되는 순간** 백그라운드로 백업 스토리지에서 끌어온다(hydrate). 그래서 아직 hydrate 안 된 블록을 처음 읽으면 네트워크 왕복이 끼어들어 느리다.

대부분의 워크로드는 이 lazy loading을 견딘다 — 시간이 지나며 블록이 점점 hydrate되면 성능이 정상화되기 때문이다. 하지만 DR 페일오버처럼 "복원된 볼륨이 즉시 풀 성능을 내야 하는" 시나리오에서는 이 초기 지연이 치명적일 수 있다. **FSR(Fast Snapshot Restore)**이 이걸 없앤다. FSR을 켜둔 스냅샷은 AWS가 미리 그 스냅샷을 특정 AZ에 완전히 hydrate된 상태로 준비해둬서, 거기서 만든 볼륨은 첫 IO부터 최대 성능을 낸다. 대가는 비용이다 — FSR은 스냅샷×AZ 조합마다 시간당 과금되므로, 정말 즉각적 복원이 필요한 핵심 DR 스냅샷에만 켜는 게 정석이다.

> ⚠️ **함정**: FSR은 "스냅샷을 빠르게 만드는" 기능이 아니라 "스냅샷에서 볼륨을 빠르게 복원하는" 기능이다. 그리고 FSR은 AZ 단위로 켠다 — `ap-northeast-2a`에 FSR을 켜면 그 AZ에서 만든 볼륨만 빠르고, 2c에서 만들면 다시 lazy load다. DR 리전의 모든 AZ에 FSR을 켜면 비용이 곱절로 뛴다. 시험에서 "스냅샷 복원 후 즉시 최대 IOPS 필요"는 FSR이 답이지만, 비용 최적화 맥락이 같이 나오면 "필요한 AZ에만 선택적으로" 켜는 게 정답이다.

## 정리하며

EBS Snapshot의 거의 모든 특성은 "변경된 블록만 기억하고 나머지는 공유한다"는 증분·블록 공유 모델에서 파생된다. 스냅샷을 지워도 다른 스냅샷이 멀쩡한 건 아무도 참조 안 하는 블록만 지우기 때문이고, AMI를 지워도 스냅샷이 남는 건 AMI가 데이터가 아니라 스냅샷을 가리키는 레시피이기 때문이고, 새 볼륨의 첫 IO가 느린 건 블록을 lazy load하기 때문이다.

운영자가 기억할 다섯 가지는 이렇다. ① 스냅샷은 증분 + 블록 공유 — 비용은 변경량에 비례하고, 삭제는 미참조 블록만 지운다. ② AMI deregister ≠ 스냅샷 삭제 — 비용 함정의 대표주자. ③ `--no-reboot`는 crash-consistent, DB는 fsfreeze/VSS로 application-consistent 백업. ④ DLM은 EBS/AMI 전용 경량 스케줄러, 멀티 서비스는 AWS Backup. ⑤ Snapshot Lock Compliance는 누구도 못 푸는 WORM, FSR은 즉시 복원이 필요한 DR 스냅샷에만.

다음 글에선 EBS 한 종류를 넘어 RDS·DynamoDB·EFS·S3까지 하나의 정책으로 묶고, 백업 자체를 공격자조차 못 건드리게 격리하는 **AWS Backup**의 Vault Lock 구조를 다룬다.

---

## 📝 연습 문제

**문제 1.** 1TB EBS 볼륨의 매시간 스냅샷을 한 달간 찍었는데 청구액이 예상보다 훨씬 적다. 그 이유로 가장 정확한 것은?

A) AWS가 스냅샷에 자동 할인을 적용한다
B) EBS Snapshot은 증분 방식이라 첫 스냅샷만 전체 크기고 이후는 변경된 블록만 저장하며, 변경량이 작으면 누적 비용이 작다
C) Free tier가 스냅샷 비용을 면제한다
D) 스냅샷이 압축되어 저장된다

**정답: B**

해설: EBS Snapshot의 핵심은 블록 단위 증분 백업이다. 첫 스냅샷은 볼륨의 모든 점유 블록을 백업하지만, 이후 스냅샷은 직전 이후 dirty bit가 켜진(변경된) 블록만 새로 저장하고 변경되지 않은 블록은 이전 스냅샷이 저장한 블록을 그대로 참조한다(structural sharing). 따라서 비용은 볼륨 크기가 아니라 시간당 변경량에 비례한다. 1TB라도 변경이 적으면 두 번째 이후 스냅샷은 거의 비용이 들지 않는다.

---

**문제 2.** 운영자가 사용하지 않는 AMI를 deregister했는데 스토리지 비용이 줄지 않았다. 원인과 해결은?

A) AMI 삭제는 비동기라 며칠 기다리면 자동 정리된다
B) AMI deregister는 부팅 레시피만 제거하고 연관 EBS 스냅샷은 남으므로, 스냅샷을 별도로 삭제하거나 DLM 정책으로 정리해야 한다
C) AMI를 다시 등록한 뒤 삭제하면 스냅샷도 같이 지워진다
D) EC2 인스턴스를 종료하면 자동 정리된다

**정답: B**

해설: AMI는 데이터를 직접 갖지 않고 EBS 스냅샷들에 대한 참조 + 디바이스 매핑 메타데이터(부팅 레시피)일 뿐이다. deregister는 이 레시피만 제거하므로 실제 데이터인 스냅샷은 그대로 남아 계속 GB당 과금된다. 골든 AMI를 버전별로 만들고 지우는 환경에서 deregister만 반복하면 미사용 스냅샷이 테라바이트 단위로 누적되는 대표적 비용 함정이다. 스냅샷을 명시적으로 삭제하거나 DLM의 정리 옵션을 써야 한다.

---

**문제 3.** 데이터베이스가 실행 중인 인스턴스의 AMI를 `--no-reboot`로 만들었더니 복원한 DB가 간헐적으로 손상된 상태로 뜬다. 근본 원인은?

A) AMI 생성 자체가 DB를 손상시킨다
B) `--no-reboot`는 crash-consistent 스냅샷이라 OS의 write-back 캐시와 진행 중 트랜잭션이 디스크에 반영되지 않은 채로 백업될 수 있다 — fsfreeze/VSS로 application-consistent 백업이 필요하다
C) DB는 AMI로 백업할 수 없다
D) 스냅샷이 증분이라 일부 블록이 누락됐다

**정답: B**

해설: `--no-reboot`는 인스턴스를 멈추지 않고 스냅샷을 찍어 운영 중단은 없지만, 그 시점 OS의 page cache(write-back)에 떠 있던 쓰기와 진행 중인 멀티 블록 트랜잭션이 디스크에 내려가지 않은 상태일 수 있다(crash-consistent). DB처럼 일관성이 중요한 워크로드는 스냅샷 직전 `fsfreeze`(Linux)나 VSS(Windows)로 캐시를 flush하고 쓰기를 정지시켜 application-consistent 상태에서 백업해야 한다. AWS는 이를 SSM Document로 자동화한다.

---

**문제 4.** Ransomware 공격자가 운영자 자격증명을 탈취해 백업 스냅샷까지 삭제하는 시나리오를 막아야 한다. 규제상 백업은 발급자조차 삭제할 수 없어야 한다. 어떤 조치가 맞나?

A) IAM 정책으로 삭제 권한을 제거
B) Snapshot Lock Compliance 모드 — cooling-off 후에는 루트 계정도 AWS도 해제 불가한 WORM
C) 스냅샷을 더 자주 생성
D) Snapshot Lock Governance 모드

**정답: B**

해설: Snapshot Lock의 Compliance 모드는 cooling-off 기간이 지나면 루트 계정·AWS를 포함해 누구도 잠금을 해제하거나 스냅샷을 삭제할 수 없는 진짜 불변(WORM) 백업이다. SEC 17a-4·HIPAA 같은 규제 요건을 만족한다. Governance 모드(D)는 특정 IAM 권한자가 해제할 수 있어 실수 방지용 가드레일에 가깝고, 자격증명을 탈취한 공격자가 그 권한까지 갖고 있으면 무력하다. IAM(A)도 권한 탈취 시 우회된다.

---

**문제 5.** DR 페일오버 시 큰 스냅샷에서 새 볼륨을 만들었는데 첫 IO가 매우 느려 복구가 지연된다. 비용을 고려하며 해결하려면?

A) 스냅샷을 다시 생성한다
B) 해당 DR 스냅샷에 대해 페일오버 대상 AZ에만 Fast Snapshot Restore(FSR)를 켜 미리 hydrate해 둔다
C) 볼륨 타입을 gp2에서 gp3로 바꾼다
D) 인스턴스 타입을 키운다

**정답: B**

해설: 스냅샷에서 만든 볼륨은 기본적으로 lazy loading이라 블록을 처음 접근할 때 백업 스토리지에서 끌어오므로 초기 IO가 느리다. FSR은 스냅샷을 특정 AZ에 미리 완전히 hydrate해 둬 거기서 만든 볼륨이 첫 IO부터 최대 성능을 내게 한다. 단 FSR은 스냅샷×AZ 조합마다 시간당 과금되므로, 모든 AZ가 아니라 실제 페일오버 대상 AZ에만 선택적으로 켜는 것이 비용 최적화 정답이다.

---

**문제 6.** EBS만 백업하면 되는 단순한 환경에서 매일 스냅샷 생성과 7일 보존을 자동화하려 한다. 가장 가볍고 비용 효율적인 도구는?

A) AWS Backup + Backup Plan + Audit Manager
B) DLM(Data Lifecycle Manager) — EBS/AMI 전용 경량 스케줄러, 정책 자체는 무료
C) Lambda + EventBridge 커스텀 스크립트
D) 수동 스냅샷 + 캘린더 알림

**정답: B**

해설: DLM은 EBS 볼륨과 AMI 전용의 가벼운 라이프사이클 스케줄러로, 태그 기반으로 생성·보존·삭제·Cross-Region 복제를 자동화하며 정책 자체에는 요금이 없다(스냅샷 저장 비용만). AWS Backup(A)은 RDS·DynamoDB·EFS 등 멀티 서비스 통합과 컴플라이언스가 필요할 때 쓰는 더 무거운 플랫폼이라 EBS만 다루는 경우엔 과하다. 단순 EBS 백업 자동화는 DLM이 정석이다.

---

**문제 7.** 한 스냅샷(Snapshot 1)을 삭제했는데, 그 이후에 만든 증분 스냅샷(Snapshot 2)의 복원이 멀쩡히 된다. 이게 가능한 이유는?

A) Snapshot 2가 삭제 직전 Snapshot 1을 전체 복사해 둔다
B) 스냅샷은 블록을 공유하며, 삭제 시 다른 스냅샷이 아무도 참조하지 않는 블록만 실제로 제거되므로 Snapshot 2가 참조하는 블록은 보존된다
C) 삭제된 스냅샷은 Recycle Bin에서 자동 복구된다
D) 증분 스냅샷은 원래 독립적인 전체 백업이다

**정답: B**

해설: 증분 스냅샷들은 변경되지 않은 블록을 포인터로 공유한다(structural sharing). 스냅샷을 삭제하면 EBS는 다른 스냅샷이 여전히 참조하는 블록은 남기고, 삭제 대상 스냅샷만 단독으로 참조하던 블록만 실제로 제거한다. 따라서 Snapshot 1을 지워도 Snapshot 2가 가리키는 블록은 살아남아 각 스냅샷은 독립적인 완전 백업처럼 복원된다. 사용자에게는 독립 백업으로 보이지만 내부는 블록을 공유하는 포인터 그래프다.

---
