# Day 2 - State Manager·Inventory·Compliance: 원하는 상태라는 추상화

어제 본 Run Command는 강력하지만 한 가지 약점이 있다. **일회성**이라는 점이다. nginx를 재시작하는 명령을 던지면 그 순간엔 다 재시작되지만, 30분 뒤 새 인스턴스가 ASG로 뜨면 그 인스턴스는 아무도 손대지 않은 맨몸 상태다. CloudWatch Agent를 fleet 전체에 깔아도, 다음 주에 누군가 한 대에서 그걸 지워버리면 그 한 대는 조용히 표준에서 벗어난다. fleet은 살아 움직이는 생물이라 한 번 명령을 친다고 그 상태가 유지되지 않는다.

State Manager는 이 문제를 "**원하는 상태(desired state)**"라는 추상화로 푼다. 명령을 "한 번 실행"하는 게 아니라 "이 상태가 항상 참이어야 한다"고 선언하고, SSM이 주기적으로 실제 상태를 그 선언에 맞춘다. 오늘은 이 desired state 모델이 Kubernetes·Puppet·Chef와 어떻게 같은 뿌리를 갖는지, Inventory로 fleet의 소프트웨어 지형을 수집해 S3로 흘려 Athena로 SQL 질의하는 데이터 레이크 패턴, 그리고 이 모든 결과가 Compliance로 모여 Security Hub까지 흘러가는 거버넌스 파이프라인을 본다. DOP 시험에서 "새 인스턴스에 자동으로 X 설치", "100만 대 인벤토리를 SQL로 분석", "fleet 컴플라이언스 통합 가시화"는 단골 시나리오다.

## State Manager — 명령형에서 선언형으로

State Manager의 핵심 단위는 **Association**이다. Association은 세 가지를 묶는다. (1) 무엇을 할지(SSM Document, 예: `AWS-ConfigureAWSPackage`), (2) 누구에게(타겟, 보통 태그), (3) 얼마나 자주(스케줄). 이 셋을 선언하면 SSM이 알아서 그 상태를 유지한다.

```bash
aws ssm create-association \
  --name AWS-ConfigureAWSPackage \
  --association-name Install-CW-Agent \
  --targets Key=tag:Environment,Values=prod \
  --parameters '{"action":["Install"],"name":["AmazonCloudWatchAgent"]}' \
  --schedule-expression "rate(7 days)" \
  --apply-only-at-cron-interval \
  --compliance-severity HIGH
```

이 Association은 세 가지 일을 한다. 첫째, **정기 실행** — 7일마다 모든 prod 인스턴스에 CloudWatch Agent 설치를 강제한다. 누가 지웠어도 다음 주기에 다시 깔린다. 둘째, **새 인스턴스 자동 적용** — `Environment=prod` 태그가 붙은 인스턴스가 새로 뜨면 즉시 association이 걸려 첫 부팅 직후 표준 상태가 보장된다. 셋째, **컴플라이언스 보고** — 몇 대가 성공했고 몇 대가 실패했는지가 자동으로 SSM Compliance에 기록된다.

이게 cron과 결정적으로 다른 점이다. cron은 각 인스턴스 안에서 따로 돌고, 새 인스턴스에 자동으로 배포되지 않으며, 실패 여부를 중앙에서 집계할 방법이 없다. State Manager는 fleet 전체의 상태를 한 곳에서 선언하고 한 곳에서 결과를 본다.

> 💡 **관련 이론**: desired state(원하는 상태)는 선언형 구성 관리의 핵심 추상화다. Kubernetes의 컨트롤러가 "ReplicaSet은 항상 3개여야 한다"를 선언하면 컨트롤 루프가 실제 Pod 수를 계속 그 값으로 reconcile(조정)하는 것, Puppet/Chef가 "이 패키지는 설치되어 있어야 한다"를 매니페스트로 선언하고 에이전트가 주기적으로 적용하는 것이 정확히 같은 모델이다. 명령형(imperative)은 "이 명령을 실행하라", 선언형(declarative)은 "이 상태가 되어라"다. 선언형의 장점은 **멱등성(idempotency)** — 몇 번을 적용해도 결과가 같고, drift가 나면 자동으로 되돌아간다. State Manager는 SSM에 이 선언형 패러다임을 가져온 것이다.

> 🔍 **더 깊이**: Association은 `apply-only-at-cron-interval` 옵션에 따라 동작이 미묘하게 달라진다. 이 플래그가 없으면 association을 새로 만들거나 수정한 직후 즉시 한 번 실행되고, 그 다음부터 스케줄대로 돈다. 새 인스턴스가 뜨면 스케줄과 무관하게 즉시 적용한다. 이 플래그를 켜면 "오직 cron 시점에만" 실행되어, 인스턴스 생성 직후 폭주를 막는다. 대규모 환경에서 수백 대가 동시에 부팅하며 association을 동시에 실행하면 패키지 미러나 다운스트림 의존성에 부하가 몰리는데, 이 플래그로 cron 시점에 분산시킨다. 시험에서 직접 묻지는 않지만 "새 인스턴스에 자동 적용 vs 즉시 실행 폭주 방지"의 트레이드오프를 이해해두면 좋다.

> 🎯 **시나리오**: "ASG가 트래픽에 따라 인스턴스를 수시로 띄우고 내린다. 모든 인스턴스에 CloudWatch Agent와 보안 에이전트가 반드시 깔려 있어야 하고, 누가 지워도 자동 복구되어야 한다. AMI에 굽는 것 외의 방법은?" — 답은 State Manager Association으로 두 패키지를 태그 기반으로 선언하고 주기 실행한다. AMI 베이킹은 가능하지만 에이전트 버전 업데이트마다 AMI를 다시 굽고 ASG Launch Template을 교체해야 하는 부담이 있다. State Manager는 association의 패키지 버전만 바꾸면 다음 주기에 전 fleet이 갱신되고, 새 인스턴스도 자동 포함되며, 누가 지워도 reconcile된다. AMI 베이킹(부팅 속도)과 State Manager(런타임 강제)는 보완 관계다.

State Manager가 자주 쓰는 표준 Document는 몇 가지로 정해져 있다.

| Document | 용도 |
|----------|------|
| `AWS-ConfigureAWSPackage` | 패키지 설치/제거 (CloudWatch Agent, Inspector, Distributor 패키지) |
| `AWS-RunPatchBaseline` | 패치 적용 (Day 1 Patch Manager와 공유) |
| `AWS-GatherSoftwareInventory` | Inventory 수집 활성화 |
| `AWS-UpdateSSMAgent` | 에이전트 자체 자동 업데이트 |

## Inventory — fleet의 소프트웨어 지형 수집

Inventory는 fleet의 "지형도"를 그린다. 각 인스턴스에 어떤 OS가 깔려 있고, 어떤 애플리케이션과 버전이 설치돼 있고, 어떤 서비스가 돌고 있고, 네트워크 인터페이스가 어떻게 구성돼 있는지를 자동 수집한다. 수집 자체는 State Manager Association으로 켠다 — Inventory도 결국 "이 인스턴스의 정보를 30분마다 수집한다"는 desired state다.

```bash
aws ssm create-association \
  --name AWS-GatherSoftwareInventory \
  --targets Key=InstanceIds,Values=* \
  --schedule-expression "rate(30 minutes)" \
  --parameters '{
    "applications":["Enabled"],
    "awsComponents":["Enabled"],
    "services":["Enabled"],
    "networkConfig":["Enabled"]
  }'
```

수집 항목은 정해진 스키마(`AWS:Application`, `AWS:Service`, `AWS:InstanceInformation`, `AWS:Network`, Windows 전용의 `AWS:WindowsUpdate` 등)로 구조화된다. 여기에 더해 **Custom Inventory**로 기업 고유 항목 — 안티바이러스 활성화 여부, 자체 에이전트 버전 같은 — 을 인스턴스에서 직접 밀어넣을 수 있다.

```json
{
  "SchemaVersion": "1.0",
  "TypeName": "Custom:Compliance",
  "Content": {"AgentVersion": "1.2.3", "AntivirusEnabled": "true"}
}
```

`aws ssm put-inventory --instance-id i-... --items file://custom.json`로 올린다. 이로써 "표준 수집 항목 + 우리만의 컴플라이언스 항목"을 한 인벤토리에 담는다.

> 📚 **사례**: Inventory의 진가는 취약점 대응 속도에서 드러난다. 2021년 Log4Shell(Log4j 원격 코드 실행) 사태 때, "우리 fleet 중 취약한 Log4j 버전이 깔린 인스턴스가 어디 어디냐"를 몇 분 안에 답할 수 있는 조직과 며칠씩 수동 조사한 조직의 대응 속도가 갈렸다. Inventory가 애플리케이션·라이브러리 정보를 미리 수집해 S3에 적재해뒀다면, 다음 절에서 볼 Athena SQL 한 줄로 영향받는 인스턴스를 즉시 추려낸다. 인벤토리는 평시에는 지루한 데이터지만 인시던트 때는 생명줄이다.

## Resource Data Sync — 인벤토리를 데이터 레이크로

수집한 Inventory는 리전별 SSM 안에 쌓인다. 그런데 SSM 콘솔의 인벤토리 뷰는 단순 조회만 가능하고, 복잡한 질의나 멀티 리전 통합 분석에는 약하다. 그래서 등장하는 게 **Resource Data Sync**다. fleet 전체의 인벤토리를 S3 버킷으로 지속 동기화하면, S3에 쌓인 JSON을 Athena로 SQL 질의할 수 있다.

```bash
aws ssm create-resource-data-sync \
  --sync-name InventoryToS3 \
  --s3-destination '{
    "BucketName":"my-inventory-bucket",
    "Region":"ap-northeast-2",
    "SyncFormat":"JsonSerDe",
    "Prefix":"inventory"
  }'
```

이제 S3에 적재된 데이터를 Athena 테이블로 매핑하면 SQL이 열린다.

```sql
SELECT instanceid, applicationtype, name, version
FROM   ssm_inventory.aws_application
WHERE  name = 'log4j-core'
  AND  version < '2.17.0';
```

이 한 줄이 "취약한 Log4j가 깔린 인스턴스를 다 찾아라"라는 인시던트 질의의 답이다. fleet이 10만 대든 100만 대든 Athena는 S3의 데이터를 스캔해 답을 준다. 멀티 계정·멀티 리전 환경에서는 Resource Data Sync를 **Organizations 전체 계정에서 한 중앙 S3 버킷으로** 모을 수 있어, 조직 전체의 인벤토리를 한 데이터 레이크에서 질의한다.

> 💡 **관련 이론**: 이 패턴은 데이터 엔지니어링의 **ELT(Extract-Load-Transform) + 데이터 레이크** 그 자체다. 정형/반정형 데이터를 일단 S3(객체 스토리지)에 raw로 적재하고(Load), 질의 시점에 스키마를 적용해(schema-on-read) Athena로 변환·분석한다(Transform). 전통적인 데이터 웨어하우스(schema-on-write, 적재 전에 스키마 고정)와 대비된다. SSM Inventory → Resource Data Sync → S3 → Athena는 운영 데이터를 데이터 레이크 패턴으로 다루는 전형이다. 같은 구조가 CloudTrail 로그, VPC Flow Logs, ALB 액세스 로그를 S3에 모아 Athena로 질의하는 데도 그대로 쓰인다.

> 🔍 **더 깊이**: Athena가 S3의 JSON을 효율적으로 읽으려면 테이블 스키마가 필요하다. Glue Crawler를 돌려 자동으로 스키마를 추론하거나, `CREATE EXTERNAL TABLE`로 직접 정의한다. 그리고 인벤토리 데이터가 누적되며 S3 객체가 많아지면, Parquet 같은 컬럼형 포맷으로 변환하고 날짜·계정으로 파티셔닝하면 Athena 스캔량(=비용)이 크게 준다. Resource Data Sync 자체는 JSON으로 떨구지만, ETL 잡으로 Parquet 변환을 한 단계 두는 게 대규모에서 표준이다. Athena는 스캔한 바이트 기준 과금이므로 "질의 비용 = 스캔량"이라는 점을 기억하면 파티셔닝의 가치가 보인다.

## Distributor — 자체 패키지의 fleet 배포

AWS가 제공하는 CloudWatch Agent 같은 패키지는 `AWS-ConfigureAWSPackage`로 바로 깔 수 있지만, 회사 자체 보안 에이전트나 모니터링 도구는 어떻게 배포할까. **Distributor**가 이 자리를 채운다. 자체 소프트웨어를 SSM 패키지로 정의해 등록하고, State Manager Association으로 fleet에 자동 설치·갱신한다.

```bash
# 1) 패키지 정의 (manifest + S3의 설치 바이너리)
aws ssm create-document \
  --content file://manifest.json \
  --attachments Key=SourceUrl,Values=s3://my-pkg/ \
  --name my-security-agent \
  --document-type Package

# 2) State Manager로 버전 고정 배포
aws ssm create-association \
  --name AWS-ConfigureAWSPackage \
  --targets Key=tag:Environment,Values=prod \
  --parameters '{"action":["Install"],"name":["my-security-agent"],"version":["1.2.0"]}' \
  --schedule-expression "rate(1 day)"
```

핵심은 Distributor 패키지도 결국 State Manager의 desired state로 배포된다는 점이다. version을 `1.2.0`으로 고정하면 "전 fleet이 항상 이 버전을 유지"한다. 버전을 `1.3.0`으로 바꾸면 다음 주기에 fleet 전체가 롤링 업그레이드된다. 패키지 버전 하나가 fleet 전체 에이전트 버전의 single source of truth가 된다.

## Compliance와 Security Hub — 거버넌스 파이프라인의 완성

지금까지의 모든 활동 — State Manager Association의 성공/실패, Patch Manager의 패치 적용 결과 — 은 자동으로 **SSM Compliance**로 모인다. 두 가지 컴플라이언스 타입이 있다.

- `AWS:State` — Association 실행 결과(원하는 상태가 유지되는가)
- `AWS:Patch` — 패치 적용 결과(필요한 패치가 다 깔렸는가)

```bash
aws ssm list-compliance-summaries
aws ssm list-resource-compliance-summaries --resource-type ManagedInstance
```

그리고 이 컴플라이언스 결과는 **Security Hub로 네이티브 통합**된다. Security Hub에서 SSM Patch 통합을 켜면 비준수 인스턴스가 Finding으로 올라오고, 다른 서비스(GuardDuty, Inspector, Config)의 Finding과 한 대시보드에 모인다. Security Hub의 Custom Action으로 EventBridge 규칙을 트리거하면, 비준수 발견 → Lambda 자동 대응까지 이어지는 폐루프가 완성된다.

```
State Manager / Patch Manager 결과
        ▼
   SSM Compliance (AWS:State / AWS:Patch)
        ▼  (네이티브 통합)
   Security Hub Findings  ← GuardDuty/Inspector/Config Finding과 통합
        ▼  (Custom Action)
   EventBridge → Lambda → 자동 격리/패치/알림
```

> 💡 **관련 이론**: 이 파이프라인은 보안 운영의 **detect → assess → respond** 루프이자 SOAR(Security Orchestration, Automation and Response)의 한 형태다. 각 단계가 분리되어 있다는 점이 중요하다. SSM은 상태를 평가(assess)하고, Security Hub는 여러 소스의 Finding을 집계(aggregate)하고, EventBridge + Lambda는 대응(respond)을 자동화한다. 한 도구가 모든 걸 하지 않고 책임을 분리(separation of concerns)해, 새 탐지 소스를 추가하거나 대응 로직을 바꿔도 다른 단계에 영향이 없다. NIST의 사이버보안 프레임워크(Identify-Protect-Detect-Respond-Recover)가 이 구조의 이론적 토대다.

> ⚠️ **함정**: SSM Inventory에는 IAM 사용자·역할 목록 같은 **계정 수준 자원**이 포함되지 않는다. Inventory는 어디까지나 "관리 대상 인스턴스 안의 소프트웨어·서비스·네트워크" 정보다. IAM 같은 계정 자원의 컴플라이언스가 필요하면 AWS Config(리소스 수준 평가)나 IAM Access Analyzer를 써야 한다. 시험에서 "Inventory로 수집되지 않는 것"을 고르는 문제에 IAM 사용자 목록이 정답으로 자주 나온다. Inventory는 인스턴스 내부, Config는 AWS 리소스라는 경계를 기억하라.

## Change Calendar — 변경 freeze의 코드화

마지막으로 거버넌스의 시간 축을 다루는 도구가 **Change Calendar**다. "블랙 프라이데이 주간에는 모든 prod 변경을 동결한다", "분기 결산일에는 배포 금지" 같은 변경 동결(freeze) 정책을 코드로 정의한다.

```bash
aws ssm create-document \
  --name FreezeWindow \
  --document-type ChangeCalendar \
  --content file://calendar.json
# calendar.json: Open/Closed 시간대를 iCalendar 형식으로 정의
```

Change Calendar는 OPEN/CLOSED 상태를 시간대별로 정의하고, Automation Runbook이나 파이프라인이 실행 전에 이 상태를 조회해 "지금이 freeze 기간이면 진행하지 않는다"를 강제한다. 사람이 "오늘 배포해도 되나?"를 기억으로 판단하는 대신, 캘린더가 기계적으로 게이트를 건다. 이건 Week 12의 Automation Runbook과 묶여 "freeze 기간에는 자동 복구만 허용하고 일반 배포는 차단" 같은 정교한 정책으로 발전한다.

> 🎯 **시나리오**: "전자상거래 회사가 블랙 프라이데이 주간에 실수로 prod 배포가 나가 장애가 난 적이 있다. 사람 실수에 의존하지 않고 그 주간 동안 자동 배포 파이프라인을 차단하고 싶다." — 답은 Change Calendar에 해당 주간을 CLOSED로 정의하고, 파이프라인의 배포 단계 앞에 캘린더 상태를 확인하는 게이트(Automation Runbook 또는 Lambda)를 둔다. CLOSED면 파이프라인이 진행을 멈춘다. 긴급 핫픽스는 별도의 승인 경로로 우회시킨다. freeze 정책이 사람의 기억이 아니라 코드로 강제된다.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **State Manager의 Association은 desired state 추상화**로, Kubernetes·Puppet과 같은 선언형·멱등성 모델이며 새 인스턴스 자동 적용과 drift 자동 복구가 cron 대비 결정적 차이다. 둘째, **Inventory는 fleet의 소프트웨어 지형을 수집**하고 Custom Inventory로 기업 고유 항목까지 담는다 — IAM 같은 계정 자원은 포함하지 않는다. 셋째, **Resource Data Sync → S3 → Athena**는 운영 데이터를 데이터 레이크(schema-on-read) 패턴으로 다루는 전형이고, 인시던트 때 SQL 한 줄로 영향 인스턴스를 추려낸다. 넷째, **Distributor는 자체 패키지를 State Manager로 배포**해 버전을 fleet의 single source of truth로 삼는다. 다섯째, **Compliance → Security Hub → EventBridge → Lambda**는 detect-assess-respond를 책임 분리한 거버넌스 폐루프이고, Change Calendar가 시간 축의 freeze를 코드화한다.

다음 글에서는 AppConfig로 넘어간다. 지금까지가 "인프라의 상태를 강제"하는 이야기였다면, AppConfig는 "애플리케이션의 동작을 코드 배포 없이 바꾸는" 피처 플래그·동적 구성의 세계다.

---

## 📝 연습 문제

**문제 1.** ASG가 인스턴스를 수시로 띄우고 내린다. 모든 인스턴스에 보안 에이전트가 항상 설치돼 있어야 하고, 누가 지워도 자동 복구되어야 한다. AMI 베이킹 외의 방법은?

A) 인스턴스마다 cron으로 설치 스크립트 실행
B) State Manager Association으로 태그 기반 패키지 설치를 선언 + 주기 실행 — 새 인스턴스 자동 적용 + drift 자동 복구
C) Run Command를 한 번 실행
D) Lambda로 매시간 SSH 접속해 설치

**정답: B**

해설: State Manager는 desired state를 선언해 주기적으로 reconcile한다. 새 인스턴스는 태그만 맞으면 자동 포함되고, 누가 지워도 다음 주기에 다시 설치된다. cron(A)은 새 인스턴스에 자동 배포되지 않고 중앙 컴플라이언스가 없다. Run Command(C)는 일회성이라 새 인스턴스에 적용 안 됨. Lambda+SSH(D)는 SSM이 이미 제공하는 기능의 비효율적 재발명이다.

---

**문제 2.** Log4Shell 같은 긴급 취약점이 터졌다. "취약한 라이브러리 버전이 설치된 인스턴스가 fleet 어디에 있는지"를 수십만 대 규모에서 즉시 답하려면 미리 준비할 것은?

A) 모든 인스턴스에 SSH 접속해 grep
B) SSM Inventory 수집 + Resource Data Sync → S3 → Athena, 인시던트 시 SQL 질의
C) CloudWatch Logs Insights
D) Trusted Advisor

**정답: B**

해설: Inventory가 애플리케이션·라이브러리 버전을 미리 수집해 S3 데이터 레이크에 적재해두면, 인시던트 시 `WHERE name='log4j-core' AND version<'2.17.0'` 같은 Athena SQL 한 줄로 영향 인스턴스를 즉시 추려낸다. 평시 데이터 수집이 인시던트 대응 속도를 좌우한다. SSH grep(A)은 규모에서 불가능, Logs Insights(C)는 로그 분석용이지 인벤토리 질의가 아님, Trusted Advisor(D)는 모범사례 점검이지 fleet 인벤토리가 아니다.

---

**문제 3.** State Manager Association이 cron과 다른 결정적 차이가 아닌 것은?

A) 새 인스턴스가 태그 일치 시 자동 적용
B) 성공/실패가 중앙 Compliance로 자동 보고
C) drift 발생 시 다음 주기에 자동 복구
D) 인스턴스 타입을 자동으로 변경

**정답: D**

해설: State Manager는 소프트웨어 상태(패키지 설치, 구성)를 강제하는 도구이지 인스턴스 타입 같은 인프라 속성을 바꾸지 않는다. A(새 인스턴스 자동 적용), B(중앙 컴플라이언스), C(drift 자동 복구)는 모두 cron 대비 State Manager의 핵심 장점이다. 인스턴스 타입 변경은 EC2/CloudFormation/ASG의 영역이다.

---

**문제 4.** SSM Inventory가 수집하지 않는 것은?

A) 설치된 애플리케이션과 버전
B) 실행 중인 서비스
C) 네트워크 인터페이스 정보
D) 계정의 IAM 사용자·역할 목록

**정답: D**

해설: Inventory는 관리 대상 인스턴스 "내부"의 소프트웨어·서비스·네트워크 정보를 수집한다. IAM 사용자·역할 같은 계정 수준 AWS 리소스는 Inventory 영역이 아니다 — AWS Config나 IAM Access Analyzer가 담당한다. Inventory는 인스턴스 내부, Config는 AWS 리소스라는 경계가 시험 포인트다.

---

**문제 5.** Resource Data Sync → S3 → Athena 파이프라인이 따르는 데이터 패턴은?

A) schema-on-write 데이터 웨어하우스
B) schema-on-read 데이터 레이크(ELT) — raw JSON을 S3에 적재하고 질의 시점에 스키마 적용
C) 인메모리 캐시
D) 그래프 데이터베이스

**정답: B**

해설: 인벤토리 JSON을 일단 S3에 raw로 적재(Load)하고, Athena 질의 시점에 스키마를 적용(schema-on-read)해 분석한다. 전형적인 데이터 레이크 + ELT 패턴이다. 같은 구조가 CloudTrail·VPC Flow Logs·ALB 로그 분석에도 쓰인다. 대규모에서는 Parquet 변환 + 파티셔닝으로 Athena 스캔 비용을 줄인다.

---

**문제 6.** 자체 개발한 보안 에이전트를 전 fleet에 배포하고 버전을 통일 관리하려면?

A) 각 인스턴스에 수동 설치
B) Distributor로 패키지 정의 후 State Manager Association으로 version 고정 배포 — 버전이 fleet의 single source of truth
C) S3에 올리고 알아서 받게 함
D) AMI에만 굽기

**정답: B**

해설: Distributor가 자체 소프트웨어를 SSM 패키지로 정의하고, State Manager가 version을 고정해 desired state로 배포한다. version을 바꾸면 다음 주기에 fleet 전체가 롤링 업그레이드되고 새 인스턴스도 자동 포함된다. AMI 베이킹(D)만으로는 런타임 강제와 버전 갱신이 어렵다.

---

**문제 7.** SSM Patch Compliance를 다른 보안 Finding과 한 대시보드에서 보고 자동 대응까지 연결하려면?

A) Lambda로 매번 폴링
B) Security Hub의 SSM Patch 통합 활성화 → Finding 집계 → Custom Action으로 EventBridge → Lambda 자동 대응
C) S3에 결과 저장 후 수동 검토
D) CloudWatch Dashboard 위젯

**정답: B**

해설: SSM Compliance는 Security Hub로 네이티브 통합되어 GuardDuty·Inspector·Config Finding과 한 대시보드에 모인다. Security Hub Custom Action이 EventBridge를 트리거하고 Lambda가 자동 대응하면 detect-assess-respond 폐루프가 완성된다. 각 단계(평가/집계/대응)가 책임 분리되어 확장이 쉽다. 수동 폴링(A)이나 수동 검토(C)는 자동화의 이점을 잃는다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, State Manager Association은 desired state(선언형·멱등성) 추상화로 Kubernetes·Puppet과 같은 뿌리이며, 새 인스턴스 자동 적용과 drift 자동 복구가 cron 대비 결정적 차이다. 둘째, Inventory는 인스턴스 내부의 소프트웨어·서비스·네트워크를 수집하고 Custom Inventory로 기업 고유 항목까지 담되, IAM 같은 계정 자원은 포함하지 않는다(그건 Config의 영역). 셋째, Resource Data Sync → S3 → Athena는 schema-on-read 데이터 레이크 패턴으로, 인시던트 때 SQL 한 줄로 영향 인스턴스를 추린다. 넷째, Distributor는 자체 패키지를 State Manager로 배포해 버전을 fleet의 single source of truth로 삼는다. 다섯째, Compliance → Security Hub → EventBridge → Lambda는 detect-assess-respond를 책임 분리한 거버넌스 폐루프이고, Change Calendar가 시간 축의 freeze를 코드화한다.
