# Day 3 - DR 4종 전략: RTO·RPO·비용의 트레이드오프와 그 경제학

재해 복구(Disaster Recovery)를 처음 설계할 때 흔히 빠지는 함정이 있다. "최대한 빨리 복구되게 만들자"는 욕심이다. 그런데 RTO 0(즉시 복구)을 모든 워크로드에 적용하면 비용이 폭발한다 — 두 리전에 똑같은 인프라를 상시 켜둬야 하기 때문이다. DR의 진짜 기술은 "얼마나 빨리"가 아니라 **"이 워크로드가 멈추면 분당 얼마를 잃는가"를 비용과 저울질해 적정 지점을 고르는 것**이다. 결제 시스템은 1분 다운에 수천만 원을 잃을 수 있으니 RTO 0을 살 가치가 있지만, 사내 분석 대시보드는 반나절 멈춰도 회의 한 번 미루면 되니 가장 싼 백업 복원으로 충분하다.

AWS는 이 트레이드오프를 네 개의 표준 전략으로 정리했다 — **Backup & Restore, Pilot Light, Warm Standby, Multi-Site Active-Active.** 이 넷은 RTO(얼마나 빨리)·RPO(얼마나 적게 잃고)·비용이라는 세 축 위의 네 점이고, 왼쪽에서 오른쪽으로 갈수록 빠르고 안전하지만 비싸다. 오늘은 이 네 전략이 각각 어떤 경제 논리 위에 서 있는지, AWS의 무엇으로 구현하는지, 그리고 백업 자체를 어떻게 통합·불변(immutable)으로 만들어 랜섬웨어까지 막는지를 깊이 본다.

DOP 시험에서 DR 전략은 거의 매번 나온다 — "RTO 5분·RPO 초·비용 중간이면 어느 전략?", "랜섬웨어로 백업까지 암호화당하는 걸 막으려면?", "Pilot Light DR을 자동 발동하는 절차는?" 같은 식이다. 핵심은 시나리오의 숫자(RTO/RPO)와 비용 제약을 읽어 네 점 중 하나로 매핑하는 것이다.

## RTO와 RPO — DR을 정의하는 두 축

모든 DR 논의는 두 숫자로 시작한다. **RTO(Recovery Time Objective)**는 "장애 발생부터 복구 완료까지 허용 시간" — 얼마나 빨리 돌아와야 하는가다. **RPO(Recovery Point Objective)**는 "복구 후 잃어도 되는 데이터의 시간 범위" — 마지막 백업/복제 시점이 얼마나 최근이어야 하는가다.

```
        과거 ────────────────[장애]──────────────→ 현재
              │←─ RPO ─→│              │←─ RTO ─→│
         마지막 안전 시점   장애 발생      복구 완료
         (이만큼 데이터 손실 허용)    (이만큼 다운 허용)
```

RPO는 데이터 복제 주기가 결정하고(매일 백업 = RPO 24시간, 실시간 복제 = RPO 초), RTO는 인프라를 얼마나 미리 띄워 두느냐가 결정한다. 이 둘이 작을수록 비용이 오른다 — RPO를 줄이려면 더 자주/실시간 복제해야 하고, RTO를 줄이려면 대기 인프라를 더 많이 켜둬야 한다.

> 💡 **관련 이론**: RTO/RPO는 1970년대 메인프레임 시대 비즈니스 연속성 계획(BCP, Business Continuity Planning)에서 나온 개념으로, ISO 22301(비즈니스 연속성 관리 표준)에 공식 정의돼 있다. 핵심 통찰은 "복구 목표는 기술이 아니라 **비즈니스 영향 분석(BIA, Business Impact Analysis)**이 정한다"는 것이다 — 먼저 "이 시스템이 멈추면 시간당 얼마를 잃고, 어떤 규제·계약 위반이 생기는가"를 따져 RTO/RPO를 정하고, 그에 맞는 기술 전략을 고른다. 거꾸로 "기술적으로 가능한 가장 빠른 복구"를 모든 시스템에 적용하는 것은 BIA 없이 돈을 태우는 안티패턴이다. AWS의 4 전략은 이 BIA 결과(워크로드 티어)를 기술로 옮기는 매핑 테이블이다.

## 네 전략 매트릭스 — 왼쪽은 싸고 오른쪽은 빠르다

| 전략 | RTO | RPO | 상대 비용 | 핵심 구조 |
|------|-----|-----|-----------|-----------|
| **Backup & Restore** | 시간~일 | 시간 | 낮음 | 백업만 보관, 장애 시 새 환경 프로비저닝 |
| **Pilot Light** | 10분~수십분 | 분 | 중간 | DB replica + AMI만 상시, 앱 tier는 꺼둠 |
| **Warm Standby** | 분 | 초~분 | 높음 | 축소된 환경 상시 가동, 페일오버 시 확장 |
| **Multi-Site Active-Active** | ~0 | ~0 | 최고 | 양 리전 동시 트래픽, 트래픽 시프트만 |

이 표를 관통하는 원리는 하나다 — **"평소에 얼마나 켜두느냐"가 RTO와 비용을 동시에 결정한다.** 아무것도 안 켜두면(Backup & Restore) 싸지만 장애 때 처음부터 다 띄워야 해 느리고, 다 켜두면(Active-Active) 즉시 복구되지만 비싸다. Pilot Light와 Warm Standby는 그 사이의 두 타협점이다.

## Backup & Restore — 가장 싸고 가장 느린 보험

가장 단순한 전략이다. 정기적으로 데이터를 백업(EBS Snapshot, RDS Backup, AWS Backup)하고 다른 리전에 복사해 둔다. 평소 DR 리전에는 **아무 인프라도 켜지 않는다.** 장애가 나면 그때 인프라를 프로비저닝(IaC로 스택 배포)하고 백업에서 데이터를 복원한다.

- RTO: 새 환경 전체를 띄우고 데이터를 복원하므로 수 시간~하루.
- RPO: 백업 주기(매일이면 최대 24시간 손실).
- 적합: Tier 3 비중요 워크로드, 비용 최우선.

> 🔍 **더 깊이**: Backup & Restore가 "느리지만 IaC가 잘 돼 있으면 생각보다 빠를 수 있다"는 점이 현대적 반전이다. 과거엔 DR 리전에 환경을 손으로 재구축하느라 며칠이 걸렸지만, **CloudFormation/Terraform으로 전체 인프라가 코드화**돼 있으면 "스택 배포 → 백업 복원"이 자동화돼 RTO가 한두 시간으로 줄 수 있다. 이것이 IaC와 DR이 만나는 지점이다 — 인프라가 코드면, DR 리전은 "데이터 + 코드"만 있으면 언제든 재현 가능하다(불변 인프라, immutable infrastructure의 사상). 그래서 시험에서 "비용을 최소화하면서도 IaC로 복구를 자동화"는 Backup & Restore가 정답이 되곤 한다.

## Pilot Light — 불씨만 켜둔다

Pilot Light(가스레인지의 점화용 불씨)라는 이름이 전략을 그대로 설명한다. DR 리전에 **데이터 계층만 상시 살려두고**(DB Read Replica가 계속 복제를 받음, AMI/Launch Template 준비), **애플리케이션 계층(EC2/컨테이너)은 꺼둔다**(ASG desired=0). 장애가 나면 이 "불씨"에 불을 붙인다 — Read Replica를 standalone primary로 promote하고, ASG desired를 올려 앱 서버를 띄우고, DNS를 페일오버한다.

```bash
# DR 리전: Read Replica 상시 복제 (데이터 불씨)
aws rds create-db-cluster --replication-source-identifier arn:...:cluster:prod \
  --db-cluster-identifier prod-dr

# 앱 tier는 꺼둠 (ASG desired=0)
aws autoscaling create-auto-scaling-group --auto-scaling-group-name prod-dr \
  --min-size 0 --max-size 20 --desired-capacity 0 --launch-template ...

# --- DR 발동 (자동화 Lambda) ---
aws rds promote-read-replica-db-cluster --db-cluster-identifier prod-dr  # 불씨에 불
aws autoscaling set-desired-capacity --auto-scaling-group-name prod-dr --desired-capacity 4
# Route 53 페일오버 (Day 2)
```

- RTO: 앱 서버 기동 시간 정도(10분~수십분).
- RPO: DB가 실시간 복제 중이므로 분 단위(또는 초).
- 적합: Tier 2, RTO 30분 허용.

> ⚠️ **함정**: Pilot Light의 숨은 위험은 "**앱 tier를 꺼두는 동안 그 환경이 실제로 뜰 수 있는지 아무도 검증하지 않는다**"는 점이다. AMI가 오래돼 부팅이 안 되거나, IAM 권한이 빠졌거나, 보안 그룹이 막혀 있어도 평소엔 모른다 — 정작 장애 때 처음 띄우다 실패한다. 그래서 Pilot Light는 반드시 정기 DR drill(분기/월)로 "불씨에 불이 붙는지" 검증해야 한다. Warm Standby가 Pilot Light보다 안전한 큰 이유 중 하나가 바로 "축소된 환경이 평소에도 떠 있어 항상 검증된 상태"라는 것이다.

## Warm Standby — 축소된 복제본을 상시 가동

Warm Standby는 DR 리전에 **운영 환경의 축소판을 항상 떠 있게** 둔다(예: 1 ALB + 2 EC2 + DB Replica). 평소엔 트래픽이 없거나 일부 읽기만 받지만, 인프라는 전부 살아 동작 중이다. 장애가 나면 트래픽을 즉시 이 환경으로 보내고, Auto Scaling으로 풀 용량까지 키운다.

- RTO: 환경이 이미 떠 있으니 트래픽 전환 + 스케일업으로 분 단위.
- RPO: DB 실시간 복제로 초~분.
- 적합: Tier 1, RTO 5분.

> 💡 **관련 이론**: Warm Standby와 Pilot Light의 차이는 "**경로 검증(path validation)**"의 유무로 이해하면 명확하다. 소프트웨어 신뢰성 공학에는 "사용되지 않는 코드 경로는 부패한다(unused paths rot)"는 격언이 있다 — 평소 실행 안 되는 페일오버 경로는 조용히 깨져 있다가 정작 필요할 때 실패한다. Warm Standby는 축소판이나마 환경이 항상 살아 트래픽(헬스 체크·일부 read)을 처리하므로, 페일오버 경로가 늘 "따뜻하게(warm)" 검증된 상태다. 이것이 AWS Well-Architected의 "static stability"(장애 시 새로운 동작을 시작하지 말고, 이미 검증된 상태로 굴러가게 하라) 원칙과 닿는다. 비용을 더 내는 대가로 "정작 필요할 때 작동 안 할 위험"을 줄이는 것이다.

## Multi-Site Active-Active — 페일오버가 곧 트래픽 시프트

가장 비싸고 가장 빠른 전략이다. **두 리전 모두 풀 용량으로 동시에 운영 트래픽을 처리**한다. Aurora Global / DynamoDB Global Tables로 데이터를 양 리전에 복제하고, Route 53 Latency Routing으로 사용자를 분산한다. 한 리전이 죽으면 — 사실상 "페일오버"라는 별도 절차가 없다. 트래픽이 살아 있는 리전으로 시프트될 뿐이다.

- RTO: ~0(이미 둘 다 처리 중이라 시프트만).
- RPO: ~0(실시간 양방향 복제).
- 적합: Tier 0 mission-critical.

> 🔍 **더 깊이**: Active-Active의 RTO가 0에 가까운 진짜 이유는 "복구할 게 없어서"다 — 둘 다 살아 있으니 죽은 쪽을 트래픽 풀에서 빼면 끝이다. 하지만 대가가 셋이다. 첫째, **비용 2배**(양 리전 풀 용량). 둘째, **데이터 충돌**(Day 2의 멀티 마스터 LWW 문제 — Active-Active로 양 리전에서 쓰면 같은 항목 동시 수정 충돌). 셋째, **용량 계획의 함정** — 평소 각 리전이 50%씩 처리하다 한 리전이 죽으면 남은 리전이 100%를 받아야 하므로, 각 리전을 50%가 아니라 **장애 시 100%를 감당할 용량**으로 잡아야 한다(아니면 페일오버 직후 남은 리전도 과부하로 무너진다, cascading failure). 이 "절반이 죽어도 나머지가 전부 받을 수 있는가"가 Active-Active 설계의 핵심 검증 항목이다.

## AWS Backup — 백업을 통합·중앙화하다

서비스마다 백업 방식이 다르면(EBS는 스냅샷, RDS는 자체 백업, DynamoDB는 PITR...) 관리가 흩어진다. **AWS Backup**은 이들을 하나의 정책·볼트로 통합한다. 백업 계획(plan)에 스케줄·보존·리전 복사를 정의하고, 태그로 대상 리소스를 선택한다.

```bash
aws backup create-backup-plan --backup-plan '{
  "BackupPlanName":"prod-daily",
  "Rules":[{
    "RuleName":"DailyBackup",
    "TargetBackupVaultName":"prod-vault",
    "ScheduleExpression":"cron(0 5 * * ? *)",
    "Lifecycle":{"DeleteAfterDays":30},
    "CopyActions":[{
      "DestinationBackupVaultArn":"arn:aws:backup:us-east-1:...:backup-vault:dr-vault",
      "Lifecycle":{"DeleteAfterDays":90}
    }]
  }]
}'
```

- 통합 지원: EBS, EFS, RDS, Aurora, DynamoDB, S3, FSx, Storage Gateway, Neptune, DocumentDB, Redshift 등.
- Cross-Region Copy + Cross-Account Copy(재해·계정 침해 양쪽 방어).
- 태그 기반 자동 선택(새 리소스가 태그만 달면 자동 백업 대상).

> 💡 **관련 이론**: AWS Backup의 태그 기반 선택은 **정책 기반 관리(policy-based management)**의 한 형태다 — "리소스를 하나하나 백업 등록"하는 명령형이 아니라, "Backup=prod 태그가 붙은 모든 것을 백업"이라는 선언적 정책을 두면, 새 리소스가 그 태그를 다는 순간 자동으로 정책이 적용된다. 이는 Kubernetes의 라벨 셀렉터, IAM의 태그 기반 ABAC(Attribute-Based Access Control)와 같은 사상이다. 거버넌스가 "사람이 빠뜨리지 않는" 방향으로 자동화된다 — 개발자가 백업을 잊어도, 태그 정책이 안전망이 된다.

## Backup Vault Lock — 불변 백업으로 랜섬웨어를 막다

백업이 있어도, 공격자가 운영 권한을 탈취해 **백업까지 삭제·암호화**하면 무용지물이다. 실제 랜섬웨어 공격의 정석이 "백업부터 지운 뒤 본체를 암호화"하는 것이다. **Backup Vault Lock**은 백업을 **불변(immutable)**으로 만든다 — 잠금이 걸리면 보존 기간 내 백업은 root 사용자조차 삭제·변경할 수 없다.

```bash
aws backup put-backup-vault-lock-configuration \
  --backup-vault-name prod-vault \
  --min-retention-days 30 --max-retention-days 365 \
  --changeable-for-days 3
```

`--changeable-for-days 3`은 **유예 기간(cooling-off)**이다. 잠금 설정 후 3일간은 실수 교정을 위해 해제 가능하지만, 그 후에는 **Compliance Mode로 완전히 잠겨** 누구도 풀 수 없다.

> 📚 **사례**: 2021년 Colonial Pipeline 랜섬웨어 사건(DarkSide 그룹)은 미 동부 연료 공급의 약 45%를 며칠간 마비시켰고, 회사는 약 440만 달러의 몸값을 지불했다(일부는 이후 회수). 사건의 교훈 중 하나가 "백업이 같은 권한 경계 안에 있으면 함께 당한다"였다. WORM(Write Once Read Many) 원칙 — 한 번 쓰면 읽기만 가능하고 수정 불가 — 에 기반한 불변 백업이 랜섬웨어 복구의 마지막 보루다. Backup Vault Lock의 Compliance Mode가 정확히 이 WORM을 구현한다(같은 사상이 S3 Object Lock Compliance Mode, 금융권의 SEC 17a-4 규제 준수 스토리지다). 교훈: 백업은 "있다"가 아니라 "공격자도 못 지운다"여야 진짜 백업이다.

> 🔍 **더 깊이**: Vault Lock의 두 모드 — **Governance Mode**는 특정 IAM 권한을 가진 사용자가 잠금을 우회·삭제할 수 있어 "실수 방지" 수준이고, **Compliance Mode**는 root를 포함 누구도 보존 기간 전엔 삭제 불가능한 진짜 불변이다. 둘의 차이가 "운영 실수 방지"와 "규제·랜섬웨어 방어"를 가른다. 시험에서 "규제 준수로 백업을 절대 삭제 불가하게"는 Compliance Mode, "실수로 지우는 것만 막되 관리자는 예외"는 Governance Mode다. 이 구분은 S3 Object Lock에도 동일하게 적용되니 함께 기억해야 한다.

## DR 발동 자동화 — Runbook을 코드로

DR을 사람이 콘솔에서 수동으로 발동하면 느리고 실수가 난다. 발동 절차를 **Step Functions 워크플로나 SSM Automation Runbook**으로 코드화한다 — "Read Replica promote → ASG 확장 → Route 53 페일오버 → 검증 알림"을 한 번의 실행으로. 이렇게 코드화하면 정기 drill로 **반복 검증**할 수 있고, 이것이 Pilot Light/Warm Standby의 "경로 부패" 위험을 막는다.

```
DR Runbook (Step Functions)
   ├─ 1. Promote Read Replica → standalone primary
   ├─ 2. ASG set-desired-capacity (0 → N)
   ├─ 3. ALB 헬스 체크 통과 대기
   ├─ 4. Route 53 ARC Routing Control 전환
   └─ 5. Slack/SNS 알림 + Resilience Hub 검증
```

## 정리하며

오늘 본 그림은 네 가지다. 첫째, **DR은 "얼마나 빨리"가 아니라 BIA로 RTO/RPO를 정하고 비용과 저울질하는 경제 문제**이며(ISO 22301), 4 전략은 그 매핑 테이블이다. 둘째, **네 전략은 "평소에 얼마나 켜두느냐"의 스펙트럼** — Backup & Restore(아무것도 안 켬, 싸고 느림, IaC면 빨라짐) → Pilot Light(데이터만, 앱 꺼둠) → Warm Standby(축소판 상시, 경로 검증됨) → Active-Active(풀 용량 둘 다, RTO 0, 비싸고 충돌·용량 계획 필요)다. 셋째, **AWS Backup이 태그 기반 정책으로 백업을 통합·중앙화**하고 Cross-Region/Account Copy로 재해·침해를 양쪽 방어한다. 넷째, **Vault Lock의 Compliance Mode가 WORM 불변 백업으로 랜섬웨어의 "백업부터 삭제"를 막는** 마지막 보루이며, DR 발동은 Runbook으로 코드화해 정기 검증해야 한다.

다음 글에서는 이 DR 전략들이 **정말 작동하는지를 검증하는 법 — Resilience Hub로 RTO/RPO를 측정하고 FIS로 카오스 엔지니어링**을 자동화하는 법을 깊이 본다.

---

## 📝 연습 문제

**문제 1.** 한 워크로드가 "RTO 5분, RPO 초~분, 비용은 중간 수준 허용"으로 요구된다. 환경이 평소에도 떠 있어 페일오버 경로가 항상 검증된 상태여야 한다. 가장 적합한 DR 전략은?

A) Backup & Restore

B) Warm Standby — 축소된 환경을 상시 가동, 페일오버 시 트래픽 전환 + Auto Scaling 확장

C) Pilot Light

D) Multi-Site Active-Active

**정답: B**

해설: Warm Standby는 DR 리전에 운영 환경의 축소판을 항상 떠 있게 둬 RTO를 분 단위로, RPO를 초~분으로 만든다(DB 실시간 복제). 환경이 평소에도 살아 트래픽(헬스 체크·일부 read)을 처리하므로 페일오버 경로가 항상 "검증된(warm)" 상태라는 게 핵심 — "사용 안 되는 경로는 부패한다"는 위험을 막는 static stability 사상이다. Backup & Restore(A)는 RTO가 시간 단위라 너무 느리고, Pilot Light(C)는 앱 tier가 꺼져 있어 경로가 미검증이며 RTO도 더 길고, Active-Active(D)는 RTO 0이지만 비용이 최고라 "중간 비용"과 안 맞는다.

---

**문제 2.** Pilot Light DR 전략의 가장 흔한 운영 위험과 그 완화책은?

A) 비용이 너무 높다 — 인스턴스 타입을 줄인다

B) 앱 tier를 꺼두는 동안 그 환경이 실제로 부팅·동작 가능한지 검증되지 않아, 정작 장애 때 실패할 수 있다 — 정기 DR drill로 발동 경로를 검증

C) 데이터가 복제되지 않는다 — Read Replica를 추가

D) Route 53이 페일오버를 지원하지 않는다

**정답: B**

해설: Pilot Light는 데이터 계층(Read Replica + AMI)만 상시 살리고 앱 tier(ASG desired=0)는 꺼둔다. 그래서 그 앱 환경이 실제로 뜰 수 있는지 — AMI가 부팅되는지, IAM/보안 그룹이 맞는지 — 가 평소에 검증되지 않아, 정작 장애 때 처음 띄우다 실패하는 게 가장 흔한 위험이다. 완화책은 정기 DR drill(분기/월)로 "불씨에 불이 붙는지"를 반복 검증하는 것이며, 발동 절차를 Step Functions/SSM Runbook으로 코드화하면 검증이 쉬워진다. 비용(A)은 Pilot Light의 장점이지 위험이 아니고, 데이터는 Read Replica로 복제 중(C)이며, Route 53은 페일오버를 지원한다(D).

---

**문제 3.** Multi-Site Active-Active를 설계할 때, 두 리전이 평소 트래픽을 50:50으로 처리한다. 용량 계획에서 반드시 검증해야 할 핵심은?

A) 각 리전을 평소 부하인 50% 용량으로만 잡으면 된다

B) 한 리전이 죽으면 남은 리전이 100%를 받아야 하므로, 각 리전을 "장애 시 전체 트래픽을 감당할 용량"으로 잡아야 한다(아니면 페일오버 직후 cascading failure)

C) 용량 계획은 불필요하다 — Auto Scaling이 알아서 한다

D) 두 리전 합쳐 100% 용량이면 충분하다

**정답: B**

해설: Active-Active에서 한 리전이 죽으면 남은 리전이 트래픽의 100%를 받아야 한다. 각 리전을 평소 부하인 50%로만 잡으면(A·D), 페일오버 직후 남은 리전이 2배 부하에 과부하로 함께 무너지는 cascading failure가 난다. 따라서 각 리전을 "혼자서도 전체 트래픽을 감당할 용량"으로 설계해야 한다 — 이것이 Active-Active 비용이 단순 2배 이상으로 비싼 이유이기도 하다. Auto Scaling(C)이 보조하지만 급격한 2배 스파이크를 즉시 흡수하지 못할 수 있어, 기본 용량 자체를 충분히 잡는 게 안전하다(static stability).

---

**문제 4.** 랜섬웨어 공격자가 운영 권한을 탈취해 백업까지 삭제하려 한다. 규제 준수로 보존 기간 내에는 root조차 백업을 삭제할 수 없게 만들려면?

A) AWS Backup Vault Lock을 Governance Mode로 설정

B) AWS Backup Vault Lock을 Compliance Mode로 설정 — WORM 불변, 보존 기간 내 누구도(root 포함) 삭제 불가

C) 백업 볼트에 IAM 정책으로 삭제 거부

D) 백업을 더 자주 수행

**정답: B**

해설: Backup Vault Lock의 Compliance Mode는 WORM(Write Once Read Many) 원칙을 구현해, 보존 기간 내에는 root를 포함 누구도 백업을 삭제·변경할 수 없는 진짜 불변 상태를 만든다 — 랜섬웨어의 "백업부터 삭제" 전술에 대한 마지막 보루다(S3 Object Lock Compliance Mode, SEC 17a-4 규제 스토리지와 같은 사상). Governance Mode(A)는 특정 IAM 권한자가 우회·삭제 가능해 "실수 방지" 수준이라 규제·랜섬웨어 방어엔 부족하다. IAM 거부(C)는 권한 탈취 시 변경될 수 있고, 자주 백업(D)해도 삭제되면 무용지물이다.

---

**문제 5.** 비용을 최소화해야 하는 Tier 3 워크로드인데, 전체 인프라가 CloudFormation으로 코드화돼 있다. 가장 적합한 DR 전략과 그 RTO 특성은?

A) Active-Active — 항상 빠르게

B) Backup & Restore — DR 리전에 아무것도 안 켜 비용 최소, 장애 시 IaC로 스택 배포 + 백업 복원을 자동화하면 RTO를 한두 시간으로 단축 가능

C) Warm Standby — 축소 환경 상시

D) Pilot Light — DB만 상시

**정답: B**

해설: Tier 3 비중요 워크로드에서 비용 최소화가 우선이면 Backup & Restore가 정답이다 — DR 리전에 인프라를 전혀 켜두지 않아 가장 싸다. 과거엔 RTO가 며칠이었지만, 전체 인프라가 IaC(CloudFormation/Terraform)로 코드화돼 있으면 "스택 배포 → 백업 복원"을 자동화해 RTO를 한두 시간으로 줄일 수 있다(불변 인프라 사상 — 데이터+코드만 있으면 재현 가능). Active-Active(A)·Warm Standby(C)·Pilot Light(D)는 모두 평소 인프라를 켜둬 비용이 더 들어 "비용 최소화"와 맞지 않는다.

---

**문제 6.** AWS Backup에서 새로 만든 리소스가 백업 정책에 누락되는 일을 사람이 잊지 않고 자동으로 방지하려 한다. 표준 방법은?

A) 리소스를 하나씩 백업 selection에 수동 등록

B) 태그 기반 선택(예: Backup=prod 태그) — 새 리소스가 그 태그를 다는 순간 자동으로 백업 정책 대상이 됨(정책 기반 거버넌스)

C) 매일 사람이 리소스 목록을 점검

D) Backup을 비활성화

**정답: B**

해설: AWS Backup은 태그 기반 선택을 지원해, "Backup=prod 태그가 붙은 모든 리소스를 백업"이라는 선언적 정책을 두면 새 리소스가 그 태그를 다는 순간 자동으로 백업 대상이 된다. 이는 명령형(하나씩 등록, A·C)이 아니라 정책 기반 관리로, Kubernetes 라벨 셀렉터·IAM ABAC와 같은 사상이다 — 개발자가 백업 등록을 잊어도 태그 정책이 안전망이 된다. 거버넌스를 "사람이 빠뜨리지 않는" 방향으로 자동화하는 것이 핵심이다.

---

**문제 7.** DR 발동 절차(Read Replica promote → ASG 확장 → Route 53 페일오버)를 사람의 수동 콘솔 작업이 아니라 반복 검증 가능한 형태로 만들려 한다. 가장 적합한 것은?

A) 운영 매뉴얼 문서(위키)에 단계를 적어 둔다

B) Step Functions 워크플로 또는 SSM Automation Runbook으로 발동 절차를 코드화 — 정기 DR drill로 반복 검증해 경로 부패를 방지

C) 장애 시 엔지니어가 기억에 의존해 수동 실행

D) Lambda 하나에 모든 로직을 하드코딩하고 테스트하지 않는다

**정답: B**

해설: DR 발동을 Step Functions 워크플로나 SSM Automation Runbook으로 코드화하면, 절차가 결정적·재현 가능해지고 정기 DR drill로 반복 검증할 수 있다 — 이것이 Pilot Light/Warm Standby의 "사용 안 되는 페일오버 경로는 부패한다"는 위험을 막는 핵심이다. 위키 문서(A)나 기억 의존(C)은 장애 시 실수·누락을 부르고, 검증 안 된 Lambda(D)는 정작 발동 때 실패할 수 있다. DR은 "문서로 있다"가 아니라 "코드로 정기 검증된다"여야 신뢰할 수 있다.

---

## 📌 오늘의 요약

오늘 본 핵심은 네 가지다. 첫째, DR은 "얼마나 빨리"가 아니라 BIA(비즈니스 영향 분석)로 RTO/RPO를 정하고 비용과 저울질하는 경제 문제이며(ISO 22301), 4 전략은 그 매핑 테이블이다. 둘째, 네 전략은 "평소에 얼마나 켜두느냐"의 스펙트럼 — Backup & Restore(아무것도 안 켬, 가장 싸고 느리지만 IaC면 한두 시간으로 단축) → Pilot Light(데이터만 상시·앱 꺼둠, 경로 미검증 위험) → Warm Standby(축소판 상시·경로 검증됨) → Active-Active(풀 용량 둘 다·RTO 0이나 비싸고 충돌·"절반 죽어도 전부 받는" 용량 계획 필요)다. 셋째, AWS Backup이 태그 기반 정책 거버넌스로 백업을 통합하고 Cross-Region/Account Copy로 재해·계정 침해를 양쪽 방어한다. 넷째, Vault Lock Compliance Mode가 WORM 불변 백업으로 랜섬웨어의 "백업부터 삭제"를 막는 마지막 보루이며(Colonial Pipeline 교훈), DR 발동은 Step Functions/SSM Runbook으로 코드화해 정기 drill로 검증해야 한다.
