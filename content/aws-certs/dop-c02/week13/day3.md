# Day 3 - DR 4종 전략: RTO, RPO, 비용의 트레이드오프와 경제학

재해 복구(Disaster Recovery)를 처음 설계할 때 흔히 빠지는 함정은 "복구를 가능한 한 빠르게 하겠다"는 욕심이다. 그러나 모든 워크로드에 RTO=0(즉시 복구)을 적용하면 비용이 폭발한다. 똑같은 인프라를 두 리전에 상시 띄워 두어야 하기 때문이다. DR의 진짜 역량은 "얼마나 빠르게"가 아니라 **"이 워크로드가 멈추면 분당 얼마를 잃는가"를 먼저 따지고 비용과 저울질해 알맞은 지점을 고르는 것**이다. 결제 시스템은 분당 수백만 원을 잃을 수 있으니 RTO=0을 살 만하다. 사내 분석 대시보드가 반나절 멈추는 것은 회의가 미뤄지는 정도라 가장 저렴한 백업-복원 전략으로 충분하다.

AWS는 이 트레이드오프를 네 가지 전략으로 표준화했다. **Backup & Restore, Pilot Light, Warm Standby, Multi-Site Active-Active**다. 이 넷은 RTO(얼마나 빠른가), RPO(데이터를 얼마나 적게 잃는가), 비용이라는 세 축 위의 점이며, 왼쪽에서 오른쪽으로 갈수록 더 빠르고 안전하지만 더 비싸다. 오늘은 각 전략이 어떤 경제적 논리 위에 서 있는지, 어떤 AWS 서비스로 구현하는지, 그리고 백업 자체를 불변으로 만들어 랜섬웨어까지 막는 방법을 본다.

DR 전략은 거의 모든 DOP 시험에 나온다. "RTO 5분, RPO 수 초, 중간 비용: 어떤 전략인가", "백업까지 암호화하는 랜섬웨어를 막으려면", "Pilot Light 페일오버를 자동화하려면" 같은 문제다. 시나리오의 숫자(RTO/RPO)와 비용 제약을 읽어 네 지점 중 하나에 대응시키는 것이 핵심이다.

## RTO와 RPO — DR을 정의하는 두 축

모든 DR 논의는 두 숫자에서 시작한다. **RTO(Recovery Time Objective)**는 "장애에서 복구 완료까지 허용되는 시간", 즉 얼마나 빨리 돌아와야 하는가다. **RPO(Recovery Point Objective)**는 "허용되는 데이터 손실의 시간 범위", 즉 마지막 백업/복제본이 얼마나 최신이어야 하는가다.

```
        Past ────────────────[Failure]──────────────→ Now
              │←─ RPO ─→│              │←─ RTO ─→│
         Last safe point     Failure occurs   Recovery complete
       (acceptable data loss)     (tolerable downtime)
```

RPO는 복제 빈도로 정해진다(일일 백업이면 RPO 24시간, 실시간 복제면 RPO 수 초). RTO는 대기 인프라를 미리 얼마나 띄워 두느냐로 정해진다. 둘 다 비용을 들일수록 줄어든다. RPO는 더 자주/실시간으로 복제할수록, RTO는 대기 인프라를 더 많이 미리 띄울수록 줄어든다.

> 💡 **관련 이론**: RTO/RPO는 1970년대 메인프레임 시대의 업무 연속성 계획(BCP, Business Continuity Planning)에서 비롯되었고, ISO 22301(업무 연속성 관리 표준)에 공식 정의되어 있다. 핵심 통찰은 "복구 목표는 기술이 아니라 **업무 영향 분석(BIA, Business Impact Analysis)**이 정한다"는 것이다. 먼저 "이 시스템이 멈추면 시간당 얼마를 잃고 어떤 규제/계약 위반이 생기는가"를 묻고, 그에 따라 RTO/RPO를 정한 다음 기술을 고른다. 반대로 BIA 없이 모든 시스템에 "기술적으로 가능한 가장 빠른 복구"를 적용하는 것은 돈을 태우는 안티패턴이다. AWS의 네 전략은 BIA 결과(워크로드 등급)를 기술로 옮기는 매핑 표다.

## 4종 전략 매트릭스 — 왼쪽은 싸고, 오른쪽은 빠르다

| 전략 | RTO | RPO | 상대 비용 | 핵심 구조 |
|--------|-----|-----|-----------|-----------|
| **Backup & Restore** | 수 시간~수 일 | 수 시간 | 낮음 | 백업만 보관, 장애 시 새 환경을 프로비저닝 |
| **Pilot Light** | 10~50분 | 수 분 | 중간 | 데이터 계층은 상시 유지(DB Read Replica, AMI 준비), 앱 계층은 꺼 둠 |
| **Warm Standby** | 수 분 | 수 초~수 분 | 높음 | 축소된 복제 환경을 상시 실행, 페일오버 시 확장 |
| **Multi-Site Active-Active** | 약 0 | 약 0 | 가장 높음 | 두 리전이 동시에 운영 트래픽을 처리 |

모든 행을 관통하는 원칙이 하나 있다. **"평상시에 얼마나 띄워 두느냐가 RTO와 비용을 모두 결정한다."** 아무것도 띄우지 않으면(Backup & Restore) 가장 싸지만 가장 느리다(장애 시 전부 새로 만들어야 한다). 전부 띄우면(Active-Active) 즉시 복구되지만 비싸다. Pilot Light와 Warm Standby는 그 사이의 두 타협점이다.

## Backup & Restore — 가장 싸고 가장 느린 보험

가장 단순한 전략이다. 데이터를 정기적으로 백업하고(EBS 스냅샷, RDS 백업, AWS Backup) 다른 리전으로 복사한다. **DR 리전에는 평상시에 인프라를 전혀 띄우지 않는다.** 장애가 나면 (IaC 스택 배포로) 인프라를 프로비저닝하고 백업에서 데이터를 복원한다.

- RTO: 수 시간~수 일 (환경 전체 구축 + 복원).
- RPO: 백업 주기 (일일 백업이면 최대 24시간 손실).
- 적합: 3등급 비핵심 워크로드, 비용 최소화가 우선인 경우.

> 현대적 반전이 하나 있다. Backup & Restore는 "느리지만, IaC가 잘 갖춰져 있으면 놀랄 만큼 빠르다." 예전에는 DR 환경을 수동으로 재구축하는 데 며칠이 걸렸다. **CloudFormation/Terraform으로 인프라 전체를 코드화**하면 "스택 배포 → 백업 복원"을 자동화해 RTO를 수 시간으로 줄일 수 있다. IaC와 DR이 만나는 지점이다. 인프라를 코드로 두면 "데이터 + 코드"만으로 언제든 재구축할 수 있다(불변 인프라 철학). 그래서 시험에서 "IaC로 복구를 자동화하면서 비용을 최소화"라면 Backup & Restore가 정답인 경우가 많다.

## Pilot Light — 불씨만 살려 두기

이름의 Pilot Light는 가스레인지의 점화용 불씨를 뜻하며, 이것이 전략을 설명해 준다. DR 리전에서 **데이터 계층은 항상 살려 두고**(지속적으로 복제를 받는 DB Read Replica, AMI/Launch Template 준비) **앱 계층은 꺼 둔다**(ASG desired=0). 장애가 나면 "불을 붙인다". Read Replica를 독립 Primary로 승격하고, ASG의 desired capacity를 올려 앱 서버를 띄우고, DNS를 페일오버한다.

```bash
# DR region: Read Replica always replicating (data spark)
aws rds create-db-cluster --replication-source-identifier arn:...:cluster:prod \
  --db-cluster-identifier prod-dr

# App tier off (ASG desired=0)
aws autoscaling create-auto-scaling-group --auto-scaling-group-name prod-dr \
  --min-size 0 --max-size 20 --desired-capacity 0 --launch-template ...

# --- Failover activation (automated Lambda) ---
aws rds promote-read-replica-db-cluster --db-cluster-identifier prod-dr  # Light the spark
aws autoscaling set-desired-capacity --auto-scaling-group-name prod-dr --desired-capacity 4
# Route 53 failover (Day 2)
```

- RTO: 앱 기동 시간 (약 10~50분).
- RPO: DB를 실시간 복제하므로 수 분(또는 수 초).
- 적합: 2등급, RTO 30분을 허용하는 경우.

> ⚠️ **함정**: Pilot Light의 숨은 위험은 "**앱 계층이 꺼져 있는 동안 정말 부팅되는지 아무도 검증하지 않는다**"는 점이다. 오래된 AMI가 기동하지 않을 수 있고, IAM 권한이 빠졌을 수 있고, 보안 그룹이 잘못 설정되었을 수 있다. 이 모든 것이 장애가 나서 처음 띄워 볼 때까지 알려지지 않다가 그때 실패한다. 그래서 Pilot Light는 정기적인 DR 훈련(분기/월 단위)으로 "불씨가 붙는가"를 *반드시* 검증해야 한다. Warm Standby가 더 안전한 이유의 일부도 "축소된 환경이 항상 실행되어 항상 검증되기" 때문이다.

## Warm Standby — 상시 가동되는 축소 복제 환경

Warm Standby는 DR 리전에 **운영 환경의 축소판을 상시 실행**한다(예: ALB 1개 + EC2 2대 + DB Replica). 평상시에는 트래픽을 받지 않거나 읽기 전용 트래픽만 받지만 인프라는 살아서 동작한다. 장애가 나면 즉시 트래픽을 이쪽으로 옮기고 Auto Scaling으로 전체 용량까지 확장한다.

- RTO: 수 분 (환경이 이미 떠 있으므로 트래픽 전환 + 확장만 하면 됨).
- RPO: 수 초~수 분 (DB 실시간 복제).
- 적합: 1등급, RTO 5분.

> Warm Standby와 Pilot Light의 차이는 **"경로 검증"**의 유무로 가장 선명하게 드러난다. 소프트웨어 신뢰성에는 "쓰지 않는 코드 경로는 썩는다"는 격언이 있다. 한 번도 실행되지 않은 페일오버 경로는 조용히 망가졌다가 필요할 때 실패한다. Warm Standby는 축소되어 있어도 항상 실제 트래픽(헬스 체크, 일부 읽기)을 처리하므로 페일오버 경로가 "따뜻하게" 유지되고 계속 검증된다. 이는 AWS Well-Architected의 "정적 안정성(static stability)" 원칙과 닿아 있다. 장애가 났을 때 새로운 동작을 시작하지 말고, 이미 검증된 상태가 계속 실행되게 하라는 것이다. "필요할 때 동작하지 않을" 위험을 줄이기 위해 비용을 더 낸다.

## Multi-Site Active-Active — 페일오버가 곧 트래픽 이동

가장 비싸고 가장 즉각적인 전략이다. **두 리전이 동시에 전체 용량으로 운영 트래픽을 처리한다.** Aurora Global / DynamoDB Global Tables로 두 리전 사이에 데이터를 복제하고, Route 53 Latency 라우팅으로 사용자를 분산한다. 한 리전이 죽어도 별도의 "페일오버" 작업은 없다. 트래픽이 살아 있는 리전으로 옮겨 갈 뿐이다.

- RTO: 약 0 (둘 다 이미 처리 중이므로 전환만 하면 됨).
- RPO: 약 0 (실시간 양방향 복제).
- 적합: 0등급 미션 크리티컬.

> Active-Active의 RTO가 0에 가까운 것은 "복구할 것이 없기" 때문이다. 둘 다 살아 있으니 죽은 쪽을 풀에서 빼기만 하면 된다. 그러나 비용은 세 겹이다. 첫째, **2배 비용**(두 리전 모두 전체 용량). 둘째, **데이터 충돌**(Day 2의 다중 리더 LWW 문제 — 두 리전이 쓰면 같은 아이템의 동시 갱신이 충돌한다). 셋째, **용량 계획의 함정**이다. 평상시 각 리전이 트래픽의 50%를 받다가 한 리전이 죽으면 생존 리전이 100%를 받아야 한다. 따라서 각 리전은 50%가 아니라 **100% 트래픽 기준**으로 크기를 잡아야 한다(그렇지 않으면 페일오버 후 생존 리전이 연쇄 장애를 일으킨다). "시스템의 절반이 죽어도 나머지가 전체 부하를 흡수할 수 있는가"가 Active-Active 설계의 핵심 검증 질문이다.

## AWS Backup — 백업을 통합하고 중앙화하다

서비스마다 백업 방식이 다르면(EBS 스냅샷, RDS 네이티브 백업, DynamoDB PITR...) 관리가 파편화된다. **AWS Backup**은 이를 하나의 정책과 볼트(vault)로 통합한다. 백업 계획(backup plan)에 스케줄, 보존 기간, 리전 복사를 정의하고 태그로 리소스를 선택한다.

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
- Cross-Region Copy + Cross-Account Copy (재해와 계정 탈취를 모두 방어).
- 태그 기반 자동 선택 (태그가 붙은 새 리소스는 자동으로 포함).

> AWS Backup의 태그 기반 선택은 **정책 기반 관리**다. "리소스를 하나씩 등록한다"는 명령형이 아니라 "Backup=prod 태그가 붙은 것은 전부 백업한다"는 선언형이며, 새 리소스에 그 태그가 붙는 즉시 적용된다. Kubernetes 레이블 셀렉터, IAM의 태그 기반 ABAC와 같은 철학이다. 거버넌스는 "실수로 빠뜨릴 수 없는" 상태가 된다. 개발자가 백업 등록을 잊어도 태그 정책이 안전망이 된다.

## Backup Vault Lock — 랜섬웨어에 맞서는 불변 백업

공격자가 관리자 권한을 탈취해 **백업까지 삭제하거나 암호화**하면 백업은 쓸모없다. 랜섬웨어의 공격 절차는 "백업을 먼저 지우고 나서 본 시스템을 암호화한다"이다. **Backup Vault Lock**은 백업을 **불변(immutable)**으로 만든다. 한 번 잠그면 보존 기간 동안 root조차 백업을 삭제하거나 수정할 수 없다.

```bash
aws backup put-backup-vault-lock-configuration \
  --backup-vault-name prod-vault \
  --min-retention-days 30 --max-retention-days 365 \
  --changeable-for-days 3
```

`--changeable-for-days 3`은 **유예 기간(cooling-off period)**이다. 3일 안에는 실수를 고치려고 잠금을 해제할 수 있지만, 그 뒤에는 **Compliance Mode가 완전히 잠긴다.** 누구도 해제할 수 없다.

> 2021년 Colonial Pipeline 랜섬웨어 사건(DarkSide 그룹)은 미국 동부 해안 연료 공급의 약 45%를 며칠간 멈춰 세웠고, 회사는 약 440만 달러의 몸값을 지불했다(일부는 나중에 회수되었다). 교훈 하나는 "백업이 같은 권한 경계 안에 있으면 같이 무너진다"는 것이다. WORM(Write Once Read Many) 즉 한 번 쓰고 여러 번 읽되 수정할 수 없는 방식의 불변 백업이 랜섬웨어 복구의 마지막 보루다. Vault Lock Compliance Mode가 정확히 이를 구현한다(S3 Object Lock Compliance Mode, SEC 17a-4 컴플라이언스 스토리지와 같은 철학이다). 백업은 "공격자가 지울 수 없을 때"에야 비로소 "존재한다."

> Vault Lock의 두 모드는 다음과 같다. **Governance Mode**는 특정 IAM 권한을 가진 사용자가 잠금을 우회/삭제할 수 있다(실수 방지 수준). **Compliance Mode**는 보존 기간이 끝나기 전에는 root도 깨뜨릴 수 없다(진정한 불변성, 규제 대응). 이 구분은 "사고 예방"과 "규제 및 랜섬웨어 방어"를 가른다. 시험에서 "백업이 절대 삭제되지 않도록 규제"는 Compliance Mode, "승인 후 관리자가 해제할 수 있게"는 Governance Mode다. 같은 구분이 S3 Object Lock에도 적용된다.

## DR 활성화 자동화 — 코드로서의 런북

콘솔로 수동 진행하는 DR 활성화는 느리고 실수하기 쉽다. 활성화 절차를 **Step Functions 워크플로 또는 SSM Automation Runbook**으로 코드화한다. "Read Replica 승격 → ASG 확장 → Route 53 페일오버 → 검증 알림"을 한 번의 실행으로 처리한다. 이렇게 코드화하면 **정기 훈련으로 반복 검증**할 수 있어 Pilot Light/Warm Standby의 "경로 부패" 위험을 막는다.

```
DR Runbook (Step Functions)
   ├─ 1. Promote Read Replica → standalone primary
   ├─ 2. ASG set-desired-capacity (0 → N)
   ├─ 3. ALB health check pass wait
   ├─ 4. Route 53 ARC Routing Control switch
   └─ 5. Slack/SNS notify + Resilience Hub validate
```

## 정리

오늘은 네 장의 그림이 나왔다. 첫째, **DR은 "얼마나 빠르게"가 아니라 경제학 문제**다. BIA가 RTO/RPO를 정하고 이를 비용과 저울질한다(ISO 22301). 네 전략은 그 매핑 표다. 둘째, **네 전략은 "평상시에 얼마나 띄워 두는가"의 스펙트럼**이다. Backup & Restore(아무것도 없음, 가장 싸고 느리지만 IaC로 빨라짐) → Pilot Light(데이터만, 앱은 꺼 둠) → Warm Standby(축소 복제 환경 상시 가동, 경로 검증됨) → Active-Active(양쪽 전체 용량, RTO≈0, 비싸고 충돌/용량 계획 과제가 있음)다. 셋째, **AWS Backup은 태그 기반 정책 거버넌스로 백업을 통합**하며, Cross-Region/Account Copy는 재해와 계정 탈취를 모두 방어한다. 넷째, **Vault Lock Compliance Mode의 WORM 불변 백업은 랜섬웨어의 "백업부터 지운다" 전술을 막고**(Colonial Pipeline의 교훈), DR 활성화는 코드(Step Functions/SSM Runbook)로 구동하고 훈련으로 주기적으로 검증해야 한다.

다음에는 이 DR 전략이 실제로 동작하는지 검증한다. **Resilience Hub가 RTO/RPO를 측정하고, FIS가 카오스 엔지니어링을 자동화**해 페일오버를 반복 테스트한다.

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
