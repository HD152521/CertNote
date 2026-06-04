# Day 2 - AWS Backup, 백업을 관리자조차 지울 수 없게 만드는 법

백업의 역설은 이렇다. 백업을 지울 수 있는 사람이 있으면, 그 사람의 계정이 뚫리는 순간 백업도 함께 사라진다. 그리고 백업을 만드는 운영자는 거의 항상 그 백업을 지울 권한도 갖고 있다. Ransomware 공격이 진화하면서 공격자가 가장 먼저 노리는 게 바로 이 지점이다 — 데이터를 암호화하기 전에 백업부터 삭제한다. 복구 수단을 없애야 몸값 협상이 성립하기 때문이다. Day 1에서 본 Code Spaces 폐업이 정확히 이 시나리오였다.

AWS Backup의 진짜 가치는 "여러 서비스를 한 정책으로 백업한다"는 편의가 아니다 — 그건 DLM도 EBS 한정으로는 한다. AWS Backup의 핵심은 **백업을 만든 사람조차 지울 수 없는 격리된 금고(Vault)를 만들고, 그 금고를 별도 계정에 두어 운영 계정이 통째로 침해당해도 백업이 살아남게 하는 것**이다. 이 글은 Plan/Vault/Selection이라는 3층 구조가 어떻게 그 불변성을 만들어내는지, Vault Lock의 Compliance 모드가 왜 발급자조차 못 푸는지, PITR이 어떻게 "5초 전"으로 돌아가는지를 파고든다.

## 왜 Plan / Vault / Selection을 분리했나 — 정책·저장소·대상의 직교 분해

AWS Backup의 구성을 처음 보면 용어가 셋이라 복잡해 보인다. **Backup Plan**(언제·얼마나 보관), **Backup Vault**(어디에 저장), **Backup Selection**(무엇을 백업). 이걸 하나로 합치지 않고 셋으로 쪼갠 건 우연이 아니라 **관심사 분리(separation of concerns)**의 의도적 설계다. 백업 정책(주기·보존), 저장 위치(금고·암호화 키·접근 정책), 백업 대상(리소스)은 서로 다른 빈도로, 서로 다른 사람이 바꾼다. 보안팀은 Vault의 암호화 키와 Lock을 관리하고, 운영팀은 대상 리소스의 태그를 바꾸고, 거버넌스팀은 보존 기간을 정한다. 이 셋을 한 덩어리로 묶으면 누구 하나가 바꿀 때마다 전체가 흔들린다.

- **Backup Plan**은 하나 이상의 **Rule**을 담는다. 각 Rule은 "스케줄(cron) + 보존 기간 + Warm→Cold 전환 + Cross-Region/Cross-Account 복사(CopyAction)"를 정의한다. 한 Plan에 "Daily(35일 보존)"와 "Monthly(7년 보존)" Rule을 함께 둘 수 있다.
- **Backup Vault**는 복구 지점(recovery point)이 실제로 저장되는 컨테이너다. 자체 KMS 키로 암호화되고, **Vault Access Policy**(resource-based policy)로 누가 이 금고에 쓰고 읽을 수 있는지를 금고 자신이 통제한다.
- **Backup Selection**은 어떤 리소스를 백업할지를 태그나 ARN으로 지정한다. 태그 기반이면 나중에 같은 태그를 단 신규 리소스가 자동으로 백업 대상에 포함된다 — 사람이 일일이 추가할 필요가 없다.

이 직교 분해의 실익은 명확하다. Vault에 Lock을 걸어 불변으로 만들어도 Plan은 자유롭게 바꿀 수 있고, 대상을 태그로 늘려도 Plan과 Vault는 그대로다. KMS 키를 Vault 단위로 분리하면 "운영 백업 금고"와 "감사 백업 금고"가 서로 다른 키로 암호화돼 한쪽 키가 뚫려도 다른 쪽이 안전하다.

> 💡 **관련 이론**: Vault Access Policy가 IAM과 별개로 존재하는 구조는 Week 9 KMS Key Policy와 정확히 같은 보안 원리다 — 가장 민감한 자산(여기선 백업)에는 **resource-based policy**를 의무화해서, IAM 한 곳이 뚫려도 자산이 자기 방어선을 갖게 한다. IAM(identity-based)은 "이 주체가 무엇을 할 수 있나"를, resource policy는 "이 자원에 누가 접근할 수 있나"를 본다. 둘이 교차 검증되므로 공격자는 IAM 권한만으로는 부족하고 자원 정책의 허용까지 받아야 한다. Cross-Account 백업에서 중앙 금고가 "이 소스 계정만 나에게 복사할 수 있다"를 Vault 정책에 박는 게 이 모델의 핵심 활용이다.

## Vault Lock — Governance와 Compliance, 그리고 되돌릴 수 없는 3일

Vault Lock은 금고 안의 모든 복구 지점을 **변경·삭제 불가**로 만드는 WORM(Write Once Read Many) 장치다. 핵심은 모드 구분이고, 이게 시험과 실무 양쪽에서 가장 자주 틀리는 지점이다.

**Governance 모드**는 `backup:DeleteRecoveryPoint`나 Lock 해제를 특정 IAM 권한(`backup:PutBackupVaultLockConfiguration` 등)을 가진 주체에게만 허용한다. 실수로 백업을 지우는 걸 막는 가드레일이지만, 충분한 권한을 가진 관리자는 풀 수 있다. **Compliance 모드**는 차원이 다르다. 한번 설정하면 **cooling-off 기간(changeable-for-days, 최소 3일) 동안만** 해제·완화가 가능하고, 그 기간이 지나면 **루트 계정도, AWS도, 그 누구도 풀 수 없다.** min/max 보존 기간이 영구히 고정되고, 그 안의 어떤 복구 지점도 보존 기간 전에는 삭제되지 않는다. 계정을 폐쇄해도 잠금은 유지된다.

```bash
# Compliance 모드 - 3일 cooling-off 후 영구 잠금
aws backup put-backup-vault-lock-configuration \
  --backup-vault-name prod-vault \
  --min-retention-days 30 \
  --max-retention-days 2555 \
  --changeable-for-days 3
```

cooling-off 3일이 왜 있는지가 설계의 핵심이다. Compliance Lock은 비가역적이라, 만약 즉시 영구화되면 운영자가 오타 한 번으로 회사를 영원히 잘못된 보존 정책에 가둘 수 있다(예: `max-retention`을 실수로 너무 짧게 박아 규제 위반 상태로 영구 고정). 3일의 유예는 "정말 이대로 영구화할 것인가"를 검증하고 되돌릴 마지막 창이다. 이 창이 닫히는 순간 그 금고는 진짜 불변이 된다.

> ⚠️ **함정**: Compliance 모드의 "절대 못 푼다"는 양날의 검이다. 공격자가 백업을 못 지우는 만큼, 운영자도 실수를 못 되돌린다. min-retention을 너무 길게(예: 7년) 박으면 그 금고의 모든 백업을 7년간 한 건도 지울 수 없어 저장 비용이 영구히 누적된다. 그래서 Compliance Lock은 반드시 cooling-off 기간 동안 테스트 백업으로 동작을 검증한 뒤 영구화해야 한다. 시험에서 "Vault Lock을 적용했는데 후회된다, 풀 수 있나?"는 cooling-off 기간(3일) 내면 가능, 지나면 영구 불가가 정답이다. Governance 모드는 권한자가 언제든 풀 수 있어 이 함정이 없다.

> 🔍 **더 깊이**: AWS Backup Vault Lock은 미국 SEC, FINRA, CFTC가 요구하는 WORM 보관 규정을 **third-party assessor(Cohasset Associates)가 검증**한 컴플라이언스 모드로 제공한다. 이는 단순 기능이 아니라 규제 감사에서 "이 백업은 변조 불가능함"을 법적으로 주장할 수 있는 근거가 된다는 뜻이다. 같은 WORM 모델이 자원별로 세 군데 등장한다 — EBS Snapshot Lock(Day 1), S3 Object Lock(Day 4), 그리고 여기 Backup Vault Lock. 셋의 공통 철학은 "신뢰는 발급자조차 손댈 수 없음을 증명할 때 성립한다"이고, 이는 1990년대 금융권의 물리적 WORM 광디스크(SEC Rule 17a-4)를 소프트웨어로 재현한 것이다.

## Cross-Account 백업 — 운영 계정이 통째로 털려도 살아남는 사본

Vault Lock으로 금고를 불변으로 만들어도 한 가지 시나리오가 남는다. **공격자가 운영 계정 전체의 관리 권한을 장악하면**, Vault Lock이 Compliance 모드가 아닌 한 그는 잠금을 풀거나 금고 자체를 손볼 수 있다. 진짜 강한 방어는 백업을 **물리적으로 다른 계정**에 두는 것이다. 운영 계정과 백업 계정이 다른 보안 경계, 다른 자격증명, 다른 권한 체계 아래 있으면, 운영 계정이 통째로 침해당해도 공격자는 백업 계정의 금고에 손을 댈 수 없다.

AWS Organizations와 결합한 표준 패턴은 이렇다. 각 멤버 계정(Prod, Dev 등)의 Backup Plan이 Rule의 **CopyAction**으로 백업을 **중앙 백업 계정(별도 OU)의 Vault**에 자동 복제한다. 중앙 금고는 Vault Access Policy로 "이 소스 계정들만 나에게 복사할 수 있고, 그 누구도 여기서 삭제할 수 없다"를 박고, 추가로 Compliance Vault Lock을 건다. 멤버 계정의 운영자(또는 그 권한을 탈취한 공격자)는 중앙 금고에 대한 삭제 권한이 아예 없으므로, 멤버 계정이 Ransomware로 초토화돼도 중앙 사본은 멀쩡하다.

```bash
# 중앙 계정의 금고가 소스 계정의 복사만 허용
aws backup put-backup-vault-access-policy \
  --backup-vault-name central-vault \
  --policy '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"AWS":"arn:aws:iam::SOURCE-ACCOUNT:root"},
      "Action":["backup:CopyIntoBackupVault"],
      "Resource":"*"
    }]
  }'
```

이 구조가 3-2-1 백업 규칙의 클라우드 버전이다. **3개의 복사본**(원본 + 운영 금고 + 중앙 금고), **2개의 다른 경계**(운영 계정 + 백업 계정), **1개의 오프사이트/격리 사본**(Cross-Region까지 더하면 다른 리전의 중앙 금고). Cross-Account와 Cross-Region을 함께 쓰면 계정 침해와 리전 장애를 동시에 견딘다.

| 위협 | 방어 수단 |
|------|-----------|
| 운영자 실수 삭제 | Governance Vault Lock, Recycle Bin |
| 자격증명 탈취 후 백업 삭제 | Compliance Vault Lock(발급자도 불가) |
| 운영 계정 전체 침해 | Cross-Account 중앙 금고(다른 경계) |
| 리전 단위 장애 | Cross-Region CopyAction |
| 규제 WORM 요건 | Compliance Lock(Cohasset 검증) |

> 📚 **사례**: 2021년 이후 대형 Ransomware 사건들(Colonial Pipeline 등 인프라 공격 포함)에서 반복된 교훈이 "백업이 운영 네트워크와 같은 도메인·같은 자격증명 아래 있으면 백업도 함께 암호화·삭제된다"였다. 공격자는 도메인 관리자 권한을 얻으면 백업 서버를 1순위로 노린다. AWS의 Cross-Account + Compliance Vault Lock 조합은 이에 대한 클라우드 네이티브 답이다 — 중앙 백업 계정은 멤버 계정의 어떤 권한으로도 접근·삭제할 수 없고, Compliance Lock이 걸린 금고는 중앙 계정의 루트조차 풀 수 없다. 즉 공격자가 모든 멤버 계정 + 중앙 계정 루트까지 장악해도 Compliance Lock이 걸린 복구 지점은 보존 기간 동안 살아남는다. "관리자도 못 지운다"가 곧 "공격자도 못 지운다"다.

## Continuous Backup과 PITR — 어떻게 "5초 전"으로 돌아가나

일반 백업은 "어제 새벽 3시 시점"처럼 스냅샷을 찍은 순간으로만 복원할 수 있다. 그런데 잘못된 `DELETE` 쿼리가 오후 2시 30분 12초에 실행됐다면, 어제 새벽 백업으로 돌아가면 하루치 데이터를 다 잃는다. **PITR(Point-in-Time Recovery)**은 "사고 직전 임의의 초"로 돌아가게 해준다. RDS·Aurora·DynamoDB·S3가 지원하는 이 기능의 비밀은 **스냅샷 + 트랜잭션 로그의 조합**이다.

원리는 이렇다. 주기적으로 전체 스냅샷(베이스)을 만들고, 그 사이의 모든 변경을 **트랜잭션 로그**(RDS의 binlog/WAL, DynamoDB의 변경 스트림)로 연속 기록한다. "오후 2시 30분 11초로 복원해줘"라고 하면, 시스템은 그 직전의 가장 가까운 베이스 스냅샷을 복원한 뒤, 거기서부터 트랜잭션 로그를 **2시 30분 11초까지 재생(replay)**한다. 스냅샷이 출발점이고 로그가 거기서 목표 시점까지 데려가는 길이다. 그래서 PITR의 정밀도는 로그의 세밀함에 달려 있고, RDS는 보통 초~5분 단위, Aurora는 더 세밀하다.

```bash
# RDS를 정확한 시각으로 복원 (새 인스턴스로)
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier prod-db \
  --target-db-instance-identifier prod-db-restored \
  --restore-time 2026-05-22T14:30:11Z
```

PITR이 항상 **새 리소스로 복원**한다는 점이 중요하다. 원본을 덮어쓰지 않고 별도 인스턴스/테이블을 만든다 — 사고 시점을 잘못 짚어도 원본은 그대로라 다시 시도할 수 있다. PITR 윈도우는 RDS 자동 백업 보존 기간(기본 1~35일) 안에서만 작동하고, 그보다 오래된 시점은 Manual Snapshot이나 AWS Backup의 장기 보존으로 따로 잡아둬야 한다.

> 💡 **관련 이론**: PITR의 "스냅샷 + 로그 재생"은 데이터베이스 복구 이론의 **WAL(Write-Ahead Logging)**과 **log-structured recovery**를 그대로 백업에 적용한 것이다. DB는 평상시 모든 변경을 데이터 파일에 쓰기 전에 먼저 로그에 기록한다(write-ahead). 정전 후 재시작하면 마지막 체크포인트(=베이스 스냅샷에 해당)부터 로그를 재생(redo)해 일관된 상태로 복구한다. PITR은 이 메커니즘을 시간 차원으로 확장한 것 — "마지막"이 아니라 "내가 지정한 임의 시점"까지만 로그를 재생한다. 이벤트 소싱(Event Sourcing) 아키텍처가 "상태 = 초기 상태 + 모든 이벤트 재생"으로 임의 시점을 재구성하는 것도 정확히 같은 원리다. 상태를 스냅샷으로, 변화를 로그로 분리하면 시간을 자유롭게 거슬러 오를 수 있다.

## Warm·Cold 라이프사이클과 복원 시간 — 비용과 속도의 트레이드오프

백업은 만들면 끝이 아니라 시간이 지날수록 가치는 떨어지고 양은 쌓인다. AWS Backup의 **Lifecycle**은 복구 지점을 시간에 따라 **Warm Storage → Cold Storage**로 자동 이동시켜 비용을 낮춘다. Warm은 즉시 복원 가능한 대신 비싸고, Cold는 약 75% 저렴한 대신 복원에 시간(수 시간)이 걸린다.

```json
"Lifecycle": {
  "MoveToColdStorageAfterDays": 90,
  "DeleteAfterDays": 2555
}
```

여기 자주 틀리는 제약이 있다. **Cold Storage로 옮긴 백업은 최소 90일을 Cold에 머물러야 한다.** 즉 `MoveToColdStorageAfterDays`(90)와 `DeleteAfterDays`의 차이가 최소 90일 이상이어야 한다 — 90일 만에 Cold로 보내놓고 100일에 지우려 하면 정책이 거부된다. 그리고 복원 속도가 등급마다 다르다. Warm은 즉시, Cold는 옵션에 따라 몇 시간이 걸린다. RTO(복구 목표 시간)가 빡빡한 핵심 시스템의 백업을 비용 아끼겠다고 Cold에 넣으면, 정작 장애 때 복원이 늦어 RTO를 못 맞춘다. **자주 복원할 가능성이 있는 최근 백업은 Warm, 규제 때문에 보관만 하는 오래된 백업은 Cold**가 정석이다.

> ⚠️ **함정**: "백업을 만들었다"와 "복원이 된다"는 다른 얘기다. AWS Backup의 Backup Plan은 백업 **생성**만 자동화하고, 그 백업이 실제로 복원 가능한지는 검증하지 않는다. 손상된 백업, 복원 시 IAM 권한 부족, 의존 리소스(보안 그룹·서브넷) 누락 등으로 정작 장애 때 복원이 실패하는 일이 흔하다. **Restore Testing Plan**으로 정기적으로 자동 복원 테스트를 돌려야 "백업이 진짜 살아 있는지"를 검증한다. "백업은 있는데 복원해본 적이 없다"는 백업이 없는 것과 크게 다르지 않다 — DR은 복원이 증명돼야 DR이다.

## Backup Audit Manager — 백업 정책 준수를 사람이 아니라 규칙이 감시한다

수백 개 계정·수천 개 리소스 환경에서 "모든 prod 리소스가 정말 매일 백업되고 있나?"를 사람이 확인하는 건 불가능하다. 새 EC2 하나가 태그를 잘못 달아 백업에서 누락돼도 아무도 모르다가, 장애 때 "어, 이건 백업이 없네"를 깨닫는다. **Backup Audit Manager**는 이 감시를 **Control(규칙)**로 자동화한다. Framework에 Control을 정의하면 AWS Backup이 지속적으로 환경을 평가하고 위반을 리포트한다.

```bash
aws backup create-framework \
  --framework-name DailyBackupCompliance \
  --framework-controls '[
    {
      "ControlName":"BACKUP_RESOURCES_PROTECTED_BY_BACKUP_PLAN",
      "ControlScope":{"Tags":{"Environment":"prod"}}
    },
    {
      "ControlName":"BACKUP_RECOVERY_POINT_MINIMUM_RETENTION_CHECK",
      "ControlInputParameters":[{"ParameterName":"requiredRetentionDays","ParameterValue":"30"}]
    }
  ]'
```

대표 Control들이 묻는 질문은 직설적이다 — "prod 태그 리소스 중 백업 계획에 포함 안 된 게 있나?", "보존 기간이 30일 미만인 백업이 있나?", "Cross-Region 복사가 없는 백업이 있나?", "Vault에 Lock이 걸려 있나?" 위반이 발견되면 비준수 리소스 목록과 함께 컴플라이언스 리포트(CSV)로 떨어진다. 이건 Week 4의 Config·Audit Manager와 같은 "선언적 준수 검증(declarative compliance)" 철학이다 — 원하는 상태를 규칙으로 선언하면, 시스템이 현실이 그 규칙에 맞는지 끊임없이 대조한다.

> 🔍 **더 깊이**: Backup Audit Manager의 Control은 내부적으로 AWS Config의 평가 엔진 위에서 돈다. Config가 리소스 상태 변화를 추적하고, Audit Manager Control이 그 상태를 백업 관점에서 평가하는 구조다. 그래서 "리소스가 백업 계획에 보호되는가"를 거의 실시간으로 감지할 수 있다 — 새 리소스가 생기면 Config가 그 등장을 포착하고, Control이 즉시 "이게 백업 대상에 들어갔나"를 평가한다. 이 계층 덕에 백업 누락이 장애 때가 아니라 리소스 생성 직후 드러난다. 선언적 준수의 힘은 "사고가 난 뒤"가 아니라 "위반이 발생한 순간" 알려준다는 데 있다.

## 정리하며

AWS Backup의 모든 설계는 "백업을 만든 사람조차 지울 수 없게, 그리고 운영 계정이 통째로 털려도 살아남게"라는 두 목표에서 파생된다. Plan/Vault/Selection을 셋으로 쪼갠 건 정책·저장소·대상을 독립적으로 통제하기 위해서고, Vault Access Policy가 IAM과 별개인 건 백업이 자기 방어선을 갖게 하기 위해서고, Compliance Vault Lock이 발급자조차 못 푸는 건 그게 곧 공격자도 못 푼다는 뜻이기 때문이고, Cross-Account가 표준인 건 다른 보안 경계만이 전면 침해를 견디기 때문이다.

운영자가 기억할 다섯 가지는 이렇다. ① AWS Backup은 멀티 서비스 통합 + 컴플라이언스, DLM은 EBS/AMI 전용. ② Vault Lock Compliance는 cooling-off(3일) 후 발급자·AWS·루트 모두 해제 불가 — 그래서 영구화 전 반드시 검증. ③ Cross-Account 중앙 금고가 전면 침해에 대한 진짜 방어 — 3-2-1의 클라우드 버전. ④ PITR은 스냅샷+트랜잭션 로그 재생으로 임의 시점 복원, 항상 새 리소스로. ⑤ 백업 생성과 복원 가능은 별개 — Restore Testing Plan으로 검증, Cold는 복원이 느리니 RTO를 따져 배치.

다음 글에선 백업·복원의 단위를 넘어, 데이터베이스가 **장애 순간에도 멈추지 않게** 하는 RDS Multi-AZ의 동기 복제와 Aurora의 분산 스토리지 구조를 다룬다.

---

## 📝 연습 문제

**문제 1.** 회사가 RDS·EBS·DynamoDB·EFS를 하나의 정책으로 통합 백업하고 컴플라이언스 보고서까지 자동 생성하려 한다. 가장 적합한 도구는?

A) DLM(Data Lifecycle Manager)
B) AWS Backup — Backup Plan으로 멀티 서비스 통합, Backup Audit Manager Framework로 컴플라이언스 자동 검증
C) 서비스별 수동 스냅샷
D) Lambda 커스텀 스크립트

**정답: B**

해설: DLM은 EBS/AMI 전용이라 RDS·DynamoDB·EFS를 다루지 못한다. AWS Backup은 EBS/RDS/Aurora/DynamoDB/EFS/FSx/S3 등을 하나의 Backup Plan으로 통합 백업하고, Backup Audit Manager의 Control 기반 Framework로 "모든 prod 리소스가 백업되는가, 보존 기간이 충분한가" 등을 지속 검증해 컴플라이언스 리포트를 자동 생성한다.

---

**문제 2.** Ransomware 공격자가 운영 계정의 관리자 권한을 탈취해 백업까지 삭제하는 시나리오를 막아야 한다. 가장 강력한 구조는?

A) 운영 계정 내 IAM 정책으로 삭제 권한만 제거
B) Cross-Account로 백업을 별도 중앙 계정 Vault에 복제하고, 그 금고에 Compliance 모드 Vault Lock을 적용
C) 백업 빈도를 높임
D) MFA를 모든 사용자에게 강제

**정답: B**

해설: 운영 계정이 통째로 침해되면 그 계정 내 IAM 정책(A)은 공격자가 우회한다. 진짜 방어는 백업을 다른 보안 경계(별도 계정)에 두는 것이다. 멤버 계정의 CopyAction이 중앙 백업 계정 금고로 복제하고, 그 금고에 Compliance Vault Lock을 걸면 멤버 계정의 어떤 권한으로도, 심지어 중앙 계정 루트로도 보존 기간 내 복구 지점을 삭제할 수 없다. "관리자도 못 지운다"가 곧 "공격자도 못 지운다"다.

---

**문제 3.** 운영자가 Vault Lock을 Compliance 모드로 적용한 직후 보존 기간 설정이 잘못됐음을 깨달았다. 되돌릴 수 있나?

A) IAM 권한이 있으면 언제든 가능
B) changeable-for-days(cooling-off, 최소 3일) 기간 내라면 변경·해제 가능하지만, 그 기간이 지나면 루트·AWS를 포함해 영구히 불가
C) AWS Support에 요청하면 해제해 준다
D) 절대 불가능, 적용 즉시 영구

**정답: B**

해설: Compliance Vault Lock은 `changeable-for-days`로 지정한 cooling-off 기간(최소 3일) 동안만 변경·해제할 수 있고, 그 기간이 지나면 발급자·루트 계정·AWS 누구도 풀 수 없는 진짜 불변 상태가 된다. 이 유예 기간은 비가역적 영구화 전에 설정을 검증하고 되돌릴 마지막 창이다. Governance 모드는 권한자가 언제든 해제 가능해 이 제약이 없다.

---

**문제 4.** 오후 2시 30분에 실행된 잘못된 DELETE 쿼리 직전 상태로 RDS를 되돌려야 한다. 어제 새벽 스냅샷밖에 없으면 하루치를 잃는다. 어떤 기능이 필요한가?

A) Manual Snapshot 복원
B) Point-in-Time Recovery(PITR) — 베이스 스냅샷 복원 후 트랜잭션 로그를 지정 시각까지 재생해 임의의 초 단위 시점으로 새 인스턴스 복원
C) Read Replica promote
D) Multi-AZ 페일오버

**정답: B**

해설: PITR은 주기적 베이스 스냅샷 + 연속 트랜잭션 로그(binlog/WAL) 조합으로 동작한다. 지정한 시각을 주면 그 직전 베이스 스냅샷을 복원한 뒤 로그를 그 시각까지 재생해 임의 시점 상태를 새 인스턴스로 재구성한다. 항상 새 리소스로 복원하므로 원본은 보존된다. 단 PITR은 자동 백업 보존 기간(기본 1~35일) 내에서만 작동한다.

---

**문제 5.** Backup Plan에서 백업을 90일 후 Cold Storage로 옮기고 100일 후 삭제하도록 설정하려 했더니 정책이 거부된다. 이유는?

A) Cold Storage는 RDS 백업을 지원하지 않는다
B) Cold Storage로 이동한 백업은 최소 90일을 Cold에 머물러야 하므로, 이동 시점과 삭제 시점의 차이가 90일 미만이면 거부된다
C) 보존 기간은 365일 이상이어야 한다
D) Cold Storage 이동은 180일 후에만 가능하다

**정답: B**

해설: AWS Backup은 Cold Storage로 옮긴 복구 지점이 최소 90일간 Cold에 머물도록 강제한다. 따라서 `MoveToColdStorageAfterDays`와 `DeleteAfterDays`의 차이가 최소 90일 이상이어야 한다. 90일 이동 후 100일 삭제는 차이가 10일뿐이라 거부된다. Cold는 Warm보다 약 75% 저렴하지만 복원이 느리므로, RTO가 빡빡한 백업은 Warm에 둬야 한다.

---

**문제 6.** 수백 개 prod 리소스 중 일부가 백업 계획에서 누락됐는지를 장애 전에 자동으로 탐지하려 한다. 어떤 도구가 적합한가?

A) CloudWatch 알람
B) Backup Audit Manager Framework — BACKUP_RESOURCES_PROTECTED_BY_BACKUP_PLAN 등 Control로 미보호 리소스를 지속 평가
C) 수동 태그 점검
D) S3 Inventory

**정답: B**

해설: Backup Audit Manager는 Control 기반으로 환경을 지속 평가한다. `BACKUP_RESOURCES_PROTECTED_BY_BACKUP_PLAN` Control은 지정 범위(예: prod 태그) 리소스 중 백업 계획에 포함되지 않은 것을 찾아내고, 다른 Control은 보존 기간·Cross-Region 복사·Vault Lock 여부를 검증한다. 내부적으로 AWS Config 평가 엔진 위에서 동작해 새 리소스 등장 직후 미보호 상태를 감지하므로, 누락이 장애 때가 아니라 발생 즉시 드러난다.

---

**문제 7.** 회사가 매일 백업은 잘 돌고 있다고 믿었는데, 실제 장애 시 복원이 IAM 권한·의존 리소스 문제로 실패했다. 이를 사전에 방지하려면?

A) 백업 빈도를 더 높인다
B) Restore Testing Plan으로 정기적 자동 복원 테스트를 수행해 백업이 실제 복원 가능한지 검증한다
C) Vault Lock을 적용한다
D) Cold Storage로 옮긴다

**정답: B**

해설: Backup Plan은 백업 생성만 자동화하고 복원 가능 여부는 검증하지 않는다. 손상된 백업, 복원 시 IAM 권한 부족, 보안 그룹·서브넷 등 의존 리소스 누락으로 정작 장애 때 복원이 실패할 수 있다. Restore Testing Plan은 정기적으로 실제 복원을 자동 수행해 "백업이 진짜 살아 있는지"를 증명한다. 복원해본 적 없는 백업은 백업이 없는 것과 크게 다르지 않다.

---
