# Day 52 - DR은 왜 "네 단계의 스펙트럼"으로 정리됐나

재해 복구(Disaster Recovery)를 배우면 Backup & Restore, Pilot Light, Warm Standby, Multi-Site Active-Active라는 네 단어를 외우게 된다. 그런데 이 넷은 서로 다른 기술이 아니라 **하나의 연속 스펙트럼 위에 찍힌 네 개의 점**이다. 스펙트럼의 한쪽 끝에는 "거의 아무것도 미리 켜두지 않고 장애 후에 다 만든다"가, 반대쪽 끝에는 "두 번째 환경이 평소에도 풀스택으로 돌아간다"가 있다. 단계가 올라갈수록 RTO와 RPO는 작아지지만 비용은 가파르게 오른다. 이 단조 관계 — **복구 속도와 비용은 정비례한다** — 가 DR 4단계의 뼈대이고, SAA 시험은 "주어진 RTO/RPO/예산이 스펙트럼의 어느 점을 가리키는가"를 끝없이 변주해 묻는다.

이 프레임워크의 뿌리에는 한 가지 통찰이 있다. 재해 복구의 비용은 대부분 **"쓰지도 않을 두 번째 환경을 평소에 얼마나 켜두느냐"**에서 나온다는 것이다. 두 번째 리전의 서버를 평소에 꺼두면(콜드) 싸지만 켜는 데 시간이 걸리고(높은 RTO), 평소에 켜두면(핫) 비싸지만 즉시 받는다(낮은 RTO). DR 설계란 결국 "이 워크로드가 멈췄을 때 회사가 분당 얼마를 잃는가"를 "두 번째 환경을 핫하게 유지하는 비용"과 저울질하는 경제 문제다.

이 글은 네 단계 각각의 내부 동작과 비용 구조, 단계 사이의 경계선이 어디서 그어지는지, 그리고 AWS DRS 같은 도구가 이 스펙트럼을 어떻게 더 경제적으로 만드는지를 따라간다.

## 단계의 경계는 "데이터"와 "컴퓨팅"을 따로 보면 갈린다

네 단계를 외우려 하지 말고, 두 개의 질문으로 분해하면 경계가 또렷해진다. 첫째, **데이터가 평소에 어떻게 두 번째 리전에 가 있는가** — 백업으로만 가끔 복사되나, 아니면 지속적으로 복제되나. 둘째, **컴퓨팅(앱 인프라)이 평소에 얼마나 켜져 있는가** — 완전히 꺼졌나, 최소만 떠 있나, 축소판이 도나, 풀스택이 도나. 이 두 축의 조합이 네 단계다.

| 전략 | 데이터 상태 | 컴퓨팅 상태 | RTO | RPO | 비용 |
|------|-----------|-----------|-----|-----|------|
| **Backup & Restore** | 주기적 백업 복사 | 꺼짐(장애 후 생성) | 시간~일 | 분~시간 | 가장 낮음 |
| **Pilot Light** | 지속 복제(DB만) | 핵심만 켬, 앱 꺼짐 | 분~수십 분 | 초~분 | 낮음 |
| **Warm Standby** | 지속 복제 | 축소판 항상 켬 | 수 분 | 초 | 높음 |
| **Multi-Site Active-Active** | 양방향 복제 | 풀스택 항상 켬 | 거의 0 | 거의 0 | 가장 높음 |

이 표의 핵심은 **RPO는 데이터 축이, RTO는 컴퓨팅 축이 주로 결정한다**는 점이다. Backup & Restore의 RPO가 큰 이유는 데이터가 백업 주기만큼 뒤처지기 때문이고(어제 백업 이후 데이터가 날아감), RTO가 큰 이유는 인프라를 장애 후에야 만들기 때문이다. Pilot Light가 RPO를 초~분으로 줄이는 건 데이터를 지속 복제하기 때문이고, RTO가 여전히 분 단위인 건 앱 인프라를 장애 시점에 켜고 스케일해야 하기 때문이다.

> 💡 **관련 이론**: 이 스펙트럼은 컴퓨터 과학의 고전적 트레이드오프인 **공간(또는 비용) vs 시간**의 변주다. 캐싱이 "메모리를 더 써서 연산 시간을 줄이는" 것처럼, DR은 "유휴 인프라에 돈을 더 써서 복구 시간을 줄인다". Warm Standby는 일종의 "따뜻한 캐시" — 자주 쓰진 않지만 미리 데워 둬서 호출 시 빠르게 응답한다. Active-Active는 "캐시가 아예 메인 경로의 일부"인 상태다. 어느 지점이 최적인지는 **재해 발생 확률 × 다운타임당 손실**을 **유휴 인프라 유지 비용**과 비교하는 기대값 계산으로 정해진다 — 금융이나 의료처럼 분당 손실이 큰 워크로드는 스펙트럼의 비싼 쪽이, 내부 배치 시스템은 싼 쪽이 합리적이다.

## Backup & Restore: 가장 싸지만 가장 느린 출발점

Backup & Restore는 두 번째 리전에 **데이터의 백업만** 보관하고, 컴퓨팅 인프라는 평소에 전혀 띄우지 않는다. 재해가 나면 스냅샷에서 볼륨을 복원하고, IaC(CloudFormation 등)로 인프라를 새로 만들고, 트래픽을 돌린다. 평소 비용은 거의 백업 스토리지 값만 들어 가장 싸지만, 인프라를 처음부터 만들어 부팅·검증하는 데 시간 단위가 걸려 RTO가 가장 크다.

핵심 도구는 **Cross-Region 스냅샷 복사**와 **AWS Backup**이다. EBS·RDS·Aurora 스냅샷을 다른 리전으로 복사해 두면, 그 리전이 살아 있는 한 복구할 수 있다. AWS Backup은 EBS·EFS·RDS·DynamoDB·S3 등을 한 정책으로 묶어 백업하고 Cross-Region·Cross-Account 복사까지 자동화하는데, 여기서 규제 대응이 중요하다.

> 🔍 **더 깊이**: **AWS Backup Vault Lock**은 백업을 **WORM(Write Once, Read Many)** 모델로 잠가 변조·삭제를 막는다. 이게 왜 DR에서 결정적이냐면, 현대의 가장 흔한 재해가 자연재해가 아니라 **랜섬웨어**이기 때문이다. 랜섬웨어가 무서운 이유는 데이터를 암호화한 뒤 백업까지 찾아 지워 복구를 막는다는 점인데, Vault Lock의 Compliance 모드는 루트 사용자조차 보존 기간 내 백업을 삭제할 수 없게 만든다. 이는 NIST의 백업 권고와 금융권의 "불변 백업(immutable backup)" 요구를 충족하는 통제다. 시험에서 "규제 준수를 위한 변조 불가 백업"이 보이면 Vault Lock이 신호다. 더불어 백업을 **별도 계정(Cross-Account)**에 두는 것도 핵심인데, 운영 계정이 탈취돼도 백업 계정의 백업은 살아남기 때문이다.

> 📚 **사례**: 2014년 코드 호스팅 스타트업 Code Spaces는 단 하루 만에 폐업했다. 공격자가 AWS 콘솔 자격 증명을 탈취해 들어왔고, 회사가 협상에 응하지 않자 **EC2 인스턴스·S3 버킷·EBS 스냅샷·백업을 모두 삭제**했다. 백업이 운영 환경과 같은 계정·같은 통제 아래 있었기 때문에, 운영을 지운 그 손이 백업도 함께 지웠다. 교훈은 명확하다 — **백업이 운영과 같은 신뢰 경계 안에 있으면 진짜 백업이 아니다**. 오늘날의 정답은 Cross-Account + Cross-Region + Vault Lock(불변)의 삼중 격리다. DR은 자연재해뿐 아니라 악의적 삭제·내부자 위협까지 가정해야 한다.

## Pilot Light: 불씨만 켜둔다

Pilot Light는 가스레인지의 점화용 불씨에서 따온 이름이다. **데이터는 지속적으로 복제**해 두지만(RDS Read Replica, DynamoDB Global Tables, S3 CRR), 앱 서버 같은 컴퓨팅은 **꺼두거나 최소만** 켠다. 장애가 나면 이미 최신인 데이터 위에 앱 인프라를 빠르게 켜고 스케일해 트래픽을 받는다. 데이터가 늘 최신이라 RPO는 초~분으로 작고, 앱만 켜면 되니 RTO는 Backup & Restore보다 훨씬 짧은 분~수십 분이다.

여기서 **AWS Elastic Disaster Recovery(DRS, 구 CloudEndure)**가 Pilot Light를 한층 경제적으로 만든다. DRS는 소스 서버의 디스크를 **블록 레벨로 실시간 복제**해 대상 리전의 저비용 스테이징 영역에 보관한다 — 평소엔 작은 복제 서버만 돌아 비용이 낮지만, 장애 시 그 데이터로 본격 EC2 인스턴스를 분 단위에 부팅한다. 즉 "데이터는 핫하게 복제하되 컴퓨팅은 콜드하게 둬서" Pilot Light의 비용-속도 균형을 자동화한 도구다.

> ⚠️ **함정**: Pilot Light와 Warm Standby의 경계를 정확히 알아야 한다. 둘 다 데이터를 지속 복제하지만 **컴퓨팅 상태가 다르다** — Pilot Light는 앱 서버가 **꺼져 있어**(또는 정말 최소만 켜져 있어) 장애 시 켜고 스케일하는 시간이 들고, Warm Standby는 **축소된 풀스택이 항상 켜져** 있어 스케일 업만 하면 돼 더 빠르다. "DB는 복제 중이지만 앱은 꺼져 있다"가 보이면 Pilot Light, "축소된 환경이 항상 트래픽을 받을 수 있게 떠 있다"가 보이면 Warm Standby다. RTO를 더 줄이고 싶으면(분 단위) 비용을 더 내고 Warm Standby로 올라간다.

## Warm Standby와 Active-Active: 핫한 쪽 끝

**Warm Standby**는 두 번째 리전에 **축소된 풀스택**을 항상 켜둔다 — 모든 계층(로드밸런서·앱·DB)이 작동하되 최소 용량으로 돈다. 장애가 나면 트래픽을 전환하고 Auto Scaling으로 용량을 키운다. 켜고 스케일 업만 하면 되니 RTO는 수 분으로 짧지만, 평소에도 축소판을 돌리는 비용이 든다. "재해 직전까지 거의 안 쓰지만 즉시 받을 수 있게 데워 둔다"는 점에서 가장 실용적인 DR 단계로 꼽힌다.

**Multi-Site Active-Active**는 두 리전 모두가 **풀스택으로 동시에 트래픽을 받는다**. Aurora Global Database나 DynamoDB Global Tables로 데이터를 양방향 동기화하고, Route 53 Latency 또는 Failover로 트래픽을 흘린다. 한 리전이 죽어도 다른 리전이 이미 트래픽을 받고 있으니 RTO·RPO가 거의 0이다. 대신 양방향 데이터 정합성을 맞추는 복잡도와 두 배의 인프라 비용이 든다 — 스펙트럼의 가장 비싸고 가장 빠른 끝이다.

> 🔍 **더 깊이**: Active-Active와 Warm Standby에서 **트래픽을 어떻게 전환하느냐**가 RTO의 마지막 변수다. 단순 Route 53 Health Check + Failover는 헬스 체크 실패를 감지하고 DNS를 바꾸는 데 수십 초~수 분이 걸리고, 클라이언트 DNS 캐싱까지 겹치면 더 늦어진다. 그래서 AWS는 **Route 53 Application Recovery Controller(ARC)**를 내놨다 — 헬스 체크에 의존하지 않고 운영자가 "이 리전 트래픽 100%, 저 리전 0%"를 **명시적 라우팅 컨트롤**로 즉시 전환하는 패널이다. ARC는 5개 리전에 걸친 고가용 클러스터로 동작해 "장애 중에도 페일오버 제어 자체가 살아 있도록" 설계됐는데, 이는 앞서 본 "복구 도구가 장애와 운명을 공유하면 안 된다"는 원칙의 구현이다. 또 ARC의 **Readiness Check**는 보조 리전이 정말 트래픽을 받을 준비가 됐는지(용량·쿼터·설정 일치)를 지속 점검해, 막상 페일오버했더니 보조 리전이 부족했던 사고를 예방한다.

> 📚 **사례**: Netflix는 2015년 무렵 이미 멀티 리전 Active-Active를 운영하며, 자사가 만든 카오스 엔지니어링 도구 **Chaos Monkey/Kong**으로 의도적으로 인스턴스와 리전을 죽여 가며 복원력을 검증했다. 핵심 통찰은 "DR 계획은 실제로 발동해 보기 전까지는 가설일 뿐"이라는 것이다 — 많은 기업이 정교한 DR 문서를 갖고도 한 번도 페일오버를 연습하지 않다가 진짜 재해 때 보조 리전의 설정이 틀어졌거나 쿼터가 부족해 실패한다. 그래서 성숙한 조직은 정기적으로 **게임 데이(Game Day)**를 열어 계획된 페일오버를 실행하고, AWS의 Resilience Hub와 ARC Readiness Check로 그 준비 상태를 상시 측정한다. "테스트하지 않은 백업은 백업이 아니고, 연습하지 않은 DR은 DR이 아니다".

## 다른 클라우드의 DR 모델 비교

DR 4단계는 AWS 고유 용어지만, 다른 클라우드도 같은 스펙트럼을 다른 이름으로 푼다.

| 구분 | AWS | Azure | GCP |
|------|-----|-------|-----|
| DR 오케스트레이션 | Elastic Disaster Recovery(DRS) | Azure Site Recovery(ASR) | (파트너 솔루션 + 자체 복제) |
| 통합 백업 | AWS Backup + Vault Lock | Azure Backup + Immutable Vault | Backup and DR Service |
| 글로벌 DB Active-Active | Aurora Global, DynamoDB Global Tables | Cosmos DB 다중 마스터 | Spanner(전역 강한 일관성) |
| 명시적 페일오버 제어 | Route 53 ARC | Traffic Manager + ASR 복구 계획 | Cloud DNS 라우팅 정책 |

Azure의 **Site Recovery(ASR)**가 AWS DRS와 가장 직접 대응한다 — 둘 다 블록 레벨 복제 기반의 Pilot Light/Warm Standby 자동화다. AWS와 Azure 모두 **불변 백업 볼트(Vault Lock / Immutable Vault)**를 제공하는데, 이는 랜섬웨어 위협이 클라우드 공급자 공통의 설계 우선순위가 됐음을 보여준다. GCP는 전용 DR 오케스트레이터보다 Spanner의 전역 일관성으로 "DR이 필요 없는 아키텍처"를 지향하는 색채가 강하다.

## CLI로 직접 만져보기

```bash
# AWS Backup 정책: 매일 백업 + 30일 보존
aws backup create-backup-plan --backup-plan '{
  "BackupPlanName":"saa-dr-plan",
  "Rules":[{
    "RuleName":"daily","TargetBackupVaultName":"Default",
    "ScheduleExpression":"cron(0 5 ? * * *)",
    "Lifecycle":{"DeleteAfterDays":30},
    "CopyActions":[{"DestinationBackupVaultArn":"arn:aws:backup:us-east-1:...:backup-vault:dr"}]
  }]
}'

# 백업 볼트 락(WORM, 변조 방지) — 랜섬웨어 대비
aws backup put-backup-vault-lock-configuration \
  --backup-vault-name dr --min-retention-days 30 --changeable-for-days 3

# RDS 스냅샷 Cross-Region 복사 (Backup & Restore)
aws rds copy-db-snapshot \
  --source-db-snapshot-identifier arn:aws:rds:ap-northeast-2:...:snapshot:orders-snap \
  --target-db-snapshot-identifier orders-dr --source-region ap-northeast-2 \
  --region us-east-1

# DRS 소스 서버 복제 상태 확인 (Pilot Light)
aws drs describe-source-servers

# Route 53 ARC 라우팅 컨트롤 전환 (명시적 페일오버)
aws route53-recovery-cluster update-routing-control-state \
  --routing-control-arn arn:... --routing-control-state On
```

## 정리하며

DR 4단계는 별개의 기술이 아니라 **복구 속도와 비용이 정비례하는 하나의 스펙트럼** 위 네 점이다. ① **Backup & Restore**는 데이터만 백업하고 컴퓨팅은 장애 후 생성해 가장 싸고 가장 느리며, Cross-Region·Cross-Account·Vault Lock으로 랜섬웨어·내부자 위협까지 격리한다. ② **Pilot Light**는 데이터를 지속 복제하되 앱은 꺼두고, DRS가 이를 경제적으로 자동화한다. ③ **Warm Standby**는 축소 풀스택을 항상 켜둬 RTO를 분 단위로 줄인다. ④ **Active-Active**는 양쪽이 동시에 트래픽을 받아 RTO·RPO가 거의 0이되 두 배 비용과 정합성 복잡도를 치른다. RPO는 데이터 복제 방식이, RTO는 컴퓨팅 준비 상태와 트래픽 전환(Route 53 ARC)이 결정하며, 시험은 주어진 RTO/RPO/예산을 스펙트럼의 한 점으로 매핑하는 능력을 묻는다.

다음 글에서는 이 페일오버의 마지막 1km인 **트래픽 라우팅** — Route 53의 라우팅 정책들과 Health Check, Alias·Private Hosted Zone·DNSSEC가 어떻게 글로벌 트래픽을 안전하게 흘리는지를 본다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 내부 분석 시스템의 DR을 설계한다. RTO 8시간, RPO 4시간을 허용하며 비용을 최소화해야 한다. 가장 적절한 전략은?

A) Multi-Site Active-Active
B) Warm Standby
C) Pilot Light
D) Backup & Restore

**정답: D**

해설: RTO 8시간·RPO 4시간이라는 느슨한 목표는 가장 싼 Backup & Restore로 충분하다 — 주기적 백업을 다른 리전에 복사해 두고 장애 시 인프라를 새로 만든다. Active-Active(A)와 Warm Standby(B)는 분 단위 RTO를 위한 고비용 옵션으로 8시간 허용 상황엔 과잉이고, Pilot Light(C)도 지속 복제 비용이 드는데 RPO 4시간이면 그 정도의 핫한 데이터가 불필요하다. 핵심은 "느슨한 RTO/RPO + 비용 최소 = 가장 낮은 단계". 요구를 초과하는 복원력은 낭비다.

---

**문제 2.** 한 금융사가 규제 준수를 위해 백업이 보존 기간 내 **루트 사용자조차 삭제할 수 없도록** 변조 불가여야 한다. 적절한 통제는?

A) S3 버킷 정책으로 삭제 거부
B) AWS Backup Vault Lock (Compliance 모드)
C) IAM 정책으로 백업 삭제 제한
D) MFA Delete

**정답: B**

해설: AWS Backup Vault Lock의 Compliance 모드는 백업을 WORM으로 잠가 보존 기간 내에는 **루트 사용자도 삭제·변경할 수 없게** 만들어 규제와 랜섬웨어 대비 불변 백업 요구를 충족한다. S3 버킷 정책(A)이나 IAM 정책(C)은 권한 있는 주체(특히 루트)가 변경·우회할 수 있어 "루트조차 불가" 요건을 못 채운다. MFA Delete(D)는 S3 객체 삭제에 MFA를 요구할 뿐 보존을 강제하는 불변성이 아니다. "변조 불가·루트도 삭제 불가" = Vault Lock.

---

**문제 3.** 한 아키텍트가 DR 비용을 낮추되 RTO를 분 단위로 유지하려 한다. 데이터는 지속 복제하되 앱 서버는 평소 꺼두고 장애 시 빠르게 부팅하는 접근을 자동화하는 AWS 서비스는?

A) AWS Backup
B) AWS Elastic Disaster Recovery (DRS)
C) AWS DataSync
D) AWS Storage Gateway

**정답: B**

해설: AWS DRS는 소스 서버를 블록 레벨로 실시간 복제해 저비용 스테이징에 보관하다가 장애 시 분 단위로 EC2를 부팅하는, Pilot Light를 경제적으로 자동화한 서비스다. AWS Backup(A)은 백업·복원 중앙화 도구로 실시간 블록 복제가 아니고, DataSync(C)는 온라인 파일 전송, Storage Gateway(D)는 하이브리드 스토리지 캐시로 DR 오케스트레이션이 아니다. "데이터는 핫 복제, 컴퓨팅은 콜드, 분 단위 RTO" = DRS.

---

**문제 4.** 한 팀이 보조 리전에 **축소된 풀스택**을 항상 켜두고, 장애 시 스케일 업과 트래픽 전환만으로 수 분 내 복구하려 한다. 이 전략은?

A) Backup & Restore
B) Pilot Light
C) Warm Standby
D) Multi-Site Active-Active

**정답: C**

해설: 모든 계층이 최소 용량으로 항상 떠 있고 장애 시 스케일 업만 하면 되는 것이 Warm Standby의 정의로, RTO가 수 분이다. Pilot Light(B)는 앱 서버가 꺼져 있어 켜는 시간이 더 들고, Backup & Restore(A)는 인프라를 처음부터 만들어 시간~일이 걸리며, Active-Active(D)는 보조 리전이 평소에도 트래픽을 받는 풀 용량이라 "축소판"이 아니다. "축소 풀스택 상시 가동 + 스케일 업" = Warm Standby. Pilot Light와의 차이는 앱이 켜져 있느냐다.

---

**문제 5.** 한 회사가 멀티 리전 Active-Active를 운영하며, 페일오버 시 **헬스 체크에 의존하지 않고 운영자가 명시적으로** 리전 간 트래픽을 즉시 전환하고, 보조 리전의 준비 상태를 상시 점검하려 한다. 적절한 도구는?

A) Route 53 Failover 정책 단독
B) Route 53 Application Recovery Controller (ARC)
C) CloudWatch Alarm
D) Auto Scaling

**정답: B**

해설: Route 53 ARC는 헬스 체크에 의존하지 않고 운영자가 라우팅 컨트롤로 "리전 트래픽 100%/0%"를 즉시 전환하며, Readiness Check로 보조 리전의 용량·쿼터·설정 준비 상태를 상시 점검한다. 또 5개 리전 클러스터로 동작해 장애 중에도 제어가 살아 있다. Failover 정책 단독(A)은 헬스 체크 기반이라 감지·전파 지연이 있고 명시적 제어가 아니며, CloudWatch Alarm(C)·Auto Scaling(D)은 페일오버 라우팅 제어 도구가 아니다. "명시적·헬스체크 비의존 페일오버 + 준비 상태 점검" = ARC.

---

**문제 6.** 한 스타트업의 운영 계정이 탈취돼 공격자가 EC2·S3·스냅샷을 삭제하려 한다. 이런 악의적 삭제로부터 백업을 보호하는 가장 견고한 설계는?

A) 같은 계정에 백업을 더 자주 저장
B) Cross-Account + Cross-Region + Vault Lock(불변) 삼중 격리
C) EBS 스냅샷을 더 많이 만들기
D) IAM 사용자 비밀번호를 강화

**정답: B**

해설: 백업이 운영과 같은 신뢰 경계(계정·리전·통제) 안에 있으면 운영을 지운 손이 백업도 지운다(2014 Code Spaces 사례). 별도 계정(Cross-Account)에 두면 운영 계정이 탈취돼도 백업 계정 권한은 분리되고, 다른 리전(Cross-Region)에 두면 리전 장애와도 분리되며, Vault Lock(불변)으로 보존 기간 내 삭제 자체를 막는다. A·C는 같은 계정 안이라 함께 삭제될 수 있고, D는 자격 증명이 이미 탈취된 상황을 막지 못한다. DR은 악의적 삭제·내부자 위협까지 가정해야 한다.

---

**문제 7.** 한 조직이 정교한 DR 문서를 갖고 있지만 실제 페일오버를 한 번도 실행해 본 적이 없다. 진짜 재해 때 보조 리전의 설정·쿼터가 부족해 복구에 실패할 위험을 줄이는 실무는?

A) DR 문서를 더 자세히 작성
B) 정기적 게임 데이(계획된 페일오버 연습) + Resilience Hub/ARC Readiness Check로 준비 상태 상시 측정
C) 백업 주기를 늘림
D) 단일 리전으로 단순화

**정답: B**

해설: DR 계획은 실제로 발동해 보기 전까지는 가설일 뿐이라, 정기적 게임 데이로 계획된 페일오버를 실행해 보조 리전의 설정·쿼터·정합성을 검증해야 한다. Resilience Hub는 복원력을 점수화하고 ARC Readiness Check는 보조 리전 준비 상태를 상시 점검해 "막상 페일오버했더니 부족했던" 사고를 예방한다. A는 문서만 늘릴 뿐 검증이 아니고, C는 RPO에만 영향을 주며, D는 DR 자체를 포기하는 방향이다. "연습하지 않은 DR은 DR이 아니다".

---

## 📌 핵심 요약

DR 4단계는 복구 속도와 비용이 정비례하는 하나의 스펙트럼 위 네 점이다. Backup & Restore는 데이터만 백업하고 컴퓨팅은 장애 후 생성해 가장 싸고 느리며, Cross-Account·Cross-Region·Vault Lock(불변)으로 랜섬웨어·내부자 삭제까지 격리한다(Code Spaces 교훈). Pilot Light는 데이터를 지속 복제하되 앱을 꺼두고 DRS가 이를 자동화한다. Warm Standby는 축소 풀스택을 상시 가동해 RTO를 분 단위로 줄이고, Active-Active는 양쪽이 동시에 트래픽을 받아 RTO·RPO 거의 0을 두 배 비용으로 산다. RPO는 데이터 복제 방식이, RTO는 컴퓨팅 준비와 트래픽 전환(Route 53 ARC의 명시적 제어·Readiness Check)이 결정한다. 시험은 RTO/RPO/예산을 스펙트럼의 한 점으로 매핑하고, "연습하지 않은 DR은 DR이 아니다"를 묻는다.
