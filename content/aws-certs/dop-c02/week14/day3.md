# Day 3 - AWS Config: 상태 기록·드리프트·자동 수정의 폐루프 제어 원리

인프라를 코드로 정의하고 배포한 다음 날, 누군가 콘솔에서 보안 그룹 한 줄을 손으로 바꾼다. 그 한 줄이 며칠 뒤 사고가 된다. 클라우드 운영의 가장 끈질긴 문제는 "선언한 상태(desired state)와 실제 상태(actual state)가 시간이 지나며 벌어진다"는 것 — 바로 드리프트(drift)다. AWS Config는 이 문제를 정면으로 다룬다. "모든 리소스의 상태 변화를 빠짐없이 기록하고, 정책에 맞는지 끊임없이 평가하고, 어긋나면 자동으로 되돌린다." 콘솔에서 보면 Config는 "리소스 인벤토리와 컴플라이언스 점수를 보여주는 서비스"처럼 보이지만, 그 밑에는 제어 이론의 폐루프(closed-loop control), 형상 관리(configuration management)의 역사, 그리고 선언적 정책 평가라는 개념이 깔려 있다. 오늘은 Config가 어떻게 모든 변경을 Configuration Item으로 기록하고, Rule이 어떻게 컴플라이언스를 평가하며, Remediation이 어떻게 SSM Automation으로 어긋난 상태를 자동 교정하는지, 그리고 그 비용과 함정이 어디 있는지를 판다.

DOP 시험에서 Config는 "컴플라이언스 평가 + 드리프트 자동 수정"의 핵심으로, "특정 정책 위반을 사람 없이 즉시 교정하려면", "여러 표준을 한꺼번에 배포하려면", "멀티 계정·리전의 컴플라이언스를 한곳에서 보려면" 같은 시나리오로 등장한다. Rule 3종(Managed/Custom Lambda/Custom Policy), Remediation의 SSM Automation 연결, Conformance Pack, Aggregator를 구분하면 답이 보인다.

## 형상 관리와 폐루프 제어 — Config의 사상적 뿌리

Config의 발상은 새롭지 않다. **형상 관리(Configuration Management)**는 1950년대 미 국방·항공 산업에서 "복잡한 시스템의 모든 부품 상태를 추적하고, 승인된 기준선(baseline)에서 벗어나지 않게 통제한다"는 규율로 출발했다. 소프트웨어로 넘어와 CFEngine(1993), Puppet(2005), Chef(2009), Ansible(2012)이 "서버를 선언한 상태로 수렴시키고 유지한다(convergence)"는 도구로 이를 구현했다.

이 도구들의 공통 원리가 **폐루프 제어**다. 제어 이론에서 폐루프(closed-loop, feedback control) 시스템은 ①목표 상태(setpoint)와 ②측정된 실제 상태를 비교해 ③오차(error)를 계산하고 ④그 오차를 줄이는 방향으로 조작(actuate)한다. 온도조절기(thermostat)가 고전적 예다 — 설정 온도와 실제 온도를 비교해 히터를 켜고 끈다.

AWS Config는 정확히 이 폐루프를 인프라에 건다. **목표 상태**는 Config Rule(정책)이, **측정**은 Configuration Recorder(상태 기록)가, **오차 판정**은 Rule 평가(COMPLIANT/NON_COMPLIANT)가, **조작**은 Remediation(자동 수정)이 맡는다. 드리프트가 생기면 오차가 검출되고, Remediation이 실제 상태를 목표로 되돌린다 — 온도조절기가 방을 설정 온도로 되돌리듯.

> 💡 **관련 이론**: 형상 관리 도구는 크게 **수렴형(convergent)**과 **멱등형(idempotent)** 사상을 공유한다. 멱등성(idempotency)은 "같은 작업을 여러 번 적용해도 결과가 한 번 적용한 것과 같다"는 성질로(수학에서 `f(f(x)) = f(x)`), Ansible의 "이미 목표 상태면 아무것도 안 한다"가 이 원리다. Config의 Remediation도 멱등적이어야 한다 — NON_COMPLIANT를 교정하는 SSM 문서를 여러 번 실행해도 부작용이 없어야 한다. 또 하나의 구분이 **명령형(imperative, "이 명령들을 실행하라") vs 선언형(declarative, "이 상태가 되게 하라")**이다. Config는 철저히 선언형이다 — "S3는 암호화돼 있어야 한다"는 목표만 선언하고, 어떻게 거기 도달할지는 Remediation에 위임한다. 선언형의 장점은 현재 상태가 어떻든 목표로 수렴시킨다는 것이다.

## Configuration Item — 모든 변경의 시점 스냅샷

Config의 토대는 **Configuration Item(CI)**이다. CI는 특정 리소스의 한 시점 상태를 담은 스냅샷이다 — 속성, 관계(이 EC2가 붙은 SG·서브넷·EBS), 메타데이터, 그리고 변경을 일으킨 CloudTrail 이벤트 연결까지 포함한다. 리소스가 바뀔 때마다 새 CI가 생성되어 **Configuration History**를 이룬다. 이 히스토리는 S3에 저장되고, 변경 시 SNS로 알릴 수 있다.

CI가 강력한 이유는 **시간 축**이다. "이 보안 그룹이 6개월 전 어떤 상태였나", "이 변경 직전 무엇이 바뀌었나"를 되짚을 수 있다. 이것이 사고 조사(forensics)와 변경 감사의 토대가 된다.

> 🔍 **더 깊이**: Config가 리소스 간 **관계(relationship)**를 기록하는 게 단순 속성 기록보다 중요하다. CI는 "EC2 i-xxx는 SG sg-yyy에 연결됨, 서브넷 subnet-zzz에 있음, EBS vol-www를 붙임"처럼 그래프 구조를 담는다. 이 덕분에 Config는 단순 리스트가 아니라 **리소스 의존성 그래프(resource dependency graph)**를 구성한다. "이 SG를 지우면 영향받는 리소스는?", "이 서브넷에 무엇이 들어 있나" 같은 질의가 가능해진다. 이는 CMDB(Configuration Management Database) — ITIL이 정의한 IT 자산·관계의 중앙 저장소 — 의 클라우드 네이티브 구현이다. Advanced Query(뒤에서 볼)가 SQL로 이 그래프를 질의할 수 있는 이유가 여기 있다.

> ⚠️ **함정**: Config와 CloudTrail을 혼동하면 안 된다. **CloudTrail**은 "누가 무슨 API를 언제 호출했나"(행위·감사 로그)를 기록하고, **Config**는 "리소스가 그 결과 어떤 상태가 됐나"(상태·형상)를 기록한다. "누가 이 SG를 바꿨나"는 CloudTrail, "그 SG가 지금/과거에 어떤 규칙을 가졌나"는 Config다. 둘은 보완 관계로, CI는 변경을 일으킨 CloudTrail 이벤트를 연결해 "누가 → 무엇을 → 어떤 상태로" 전체 그림을 준다. 시험에서 "리소스 상태 변화 추적·컴플라이언스 평가"는 Config, "API 호출 감사·사용자 추적"은 CloudTrail이다.

## Config Rule — 세 종류의 정책 평가

Config Rule은 리소스가 정책을 지키는지 평가한다. 세 종류가 있고, 이 구분이 시험에 직접 나온다.

| 종류 | 정의 방식 | 언제 |
|------|----------|------|
| **AWS Managed Rule** | AWS가 제공(수백 개) | 표준 정책 — 가장 먼저 검토 |
| **Custom Lambda Rule** | Lambda 함수로 평가 로직 작성 | 복잡한 커스텀 로직, 외부 호출 필요 시 |
| **Custom Policy Rule** | Guard DSL로 선언적 정책 | Lambda 없이 코드로 정책 표현 (2021+) |

대표 Managed Rule: `s3-bucket-public-read-prohibited`, `encrypted-volumes`, `iam-password-policy`, `restricted-ssh`, `root-account-mfa-enabled`, `rds-storage-encrypted`.

평가 트리거는 두 가지다. **Configuration change 트리거**는 리소스가 바뀔 때마다 평가하고(거의 실시간), **Periodic 트리거**는 정해진 주기(예: 24시간)로 평가한다. 외부 상태에 의존하는 규칙은 주기 평가를, 변경 즉시 잡아야 하는 규칙은 변경 트리거를 쓴다.

> 🔍 **더 깊이**: **Custom Policy Rule의 Guard DSL**이 왜 중요한가. AWS **CloudFormation Guard**는 정책을 선언적으로 표현하는 도메인 특화 언어로(policy-as-code), `Resources.*[ Type == "AWS::S3::Bucket" ] { Properties.BucketEncryption EXISTS }`처럼 "이 리소스 타입은 이 속성을 가져야 한다"를 룰로 쓴다. 이는 Kubernetes 생태계의 **OPA(Open Policy Agent)/Rego**, HashiCorp의 **Sentinel**과 같은 계보의 정책 엔진이다. 핵심 가치는 "Lambda 코드(명령형)로 평가 로직을 짜는 대신, 정책을 선언적으로 기술해 사람이 읽고 검증·버전 관리할 수 있게" 하는 것이다. Guard 룰은 배포 전(CI/CD에서 `cfn-guard validate`로 템플릿 검사)과 배포 후(Config Custom Policy Rule로 실제 리소스 평가) 양쪽에 같은 룰을 재사용할 수 있어, "shift-left"(배포 전 차단)와 "런타임 평가"를 하나의 정책 언어로 통일한다.

```
rule s3_bucket_must_be_encrypted {
  Resources.*[ Type == "AWS::S3::Bucket" ] {
    Properties.BucketEncryption EXISTS
  }
}
```

## Conformance Pack — 정책의 묶음 배포

규칙을 하나씩 배포하는 건 수십 개 규칙·수백 계정에선 비현실적이다. **Conformance Pack**은 여러 Config Rule + Remediation을 하나의 YAML로 묶어 한 번에 배포하는 단위다. 사전 정의 팩(PCI DSS, NIST 800-53, FedRAMP, HIPAA, AWS Well-Architected 등)이 제공되고, 사용자 정의 YAML도 가능하다.

```yaml
Resources:
  S3PublicProhibitedRead:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: s3-public-read
      Source:
        Owner: AWS
        SourceIdentifier: S3_BUCKET_PUBLIC_READ_PROHIBITED
      Scope:
        ComplianceResourceTypes: [AWS::S3::Bucket]
```

```bash
aws configservice put-conformance-pack --conformance-pack-name security-baseline \
  --template-s3-uri s3://conformance-packs/security-baseline.yaml
```

> 🔍 **더 깊이**: Conformance Pack은 **내부적으로 CloudFormation StackSets를 사용**해 조직 전체(OU)에 배포된다. 즉 "규칙 묶음을 정의하면 StackSets가 각 계정·리전에 동일하게 푸시"하는 구조다. 이 때문에 Conformance Pack은 StackSets의 배포 모델(병렬·순차, 실패 허용 임계값)을 물려받는다. 둘의 관계를 정리하면: **StackSets**는 임의의 CloudFormation 리소스를 멀티 계정 배포하는 범용 도구이고, **Conformance Pack**은 그 위에 "Config Rule + Remediation 묶음"이라는 특화 추상을 얹은 것이다. 시험에서 "PCI/NIST 같은 컴플라이언스 묶음을 OU 전체에 배포"는 Conformance Pack, "임의의 인프라 리소스를 멀티 계정 배포"는 StackSets다.

## Auto-Remediation — 폐루프를 닫는 조작 단계

평가만으로는 폐루프가 닫히지 않는다. NON_COMPLIANT를 발견하면 실제로 고쳐야 한다. Config의 **Remediation**은 규칙에 **SSM Automation Document**를 연결해, 위반 발견 시 그 문서를 실행해 상태를 교정한다.

```bash
aws configservice put-remediation-configurations \
  --remediation-configurations '[{
    "ConfigRuleName":"s3-bucket-public-read-prohibited",
    "TargetType":"SSM_DOCUMENT",
    "TargetId":"AWS-DisableS3BucketPublicReadWrite",
    "Parameters":{
      "AutomationAssumeRole":{"StaticValue":{"Values":["arn:aws:iam::...:role/RemediationRole"]}},
      "S3BucketName":{"ResourceValue":{"Value":"RESOURCE_ID"}}
    },
    "Automatic":true,
    "MaximumAutomaticAttempts":5,
    "RetryAttemptSeconds":60
  }]'
```

`Automatic: true`면 위반 발견 즉시 자동 수정, `false`면 운영자가 콘솔에서 수동 트리거한다. `MaximumAutomaticAttempts`와 `RetryAttemptSeconds`로 재시도를 제어한다.

> ⚠️ **함정**: 자동 Remediation에는 위험한 시나리오가 있다 — **수정-재위반 루프(flapping)**. 어떤 외부 프로세스가 계속 리소스를 NON_COMPLIANT 상태로 되돌리면(예: 다른 자동화가 SG를 열고, Config가 닫고, 다시 열고…), Config가 무한 수정을 시도해 API 스로틀·비용 폭증·소음을 일으킨다. `MaximumAutomaticAttempts`가 이 루프를 끊는 안전장치다. 또 Remediation이 **파괴적**일 수 있다 — "퍼블릭 버킷을 비공개로 강제"가 정당한 퍼블릭 웹사이트 버킷을 망가뜨릴 수 있다. 그래서 프로덕션에선 중요 리소스에 예외 태그를 두거나, 파괴적 수정은 `Automatic:false`로 사람 승인을 끼운다. 시험에서 "자동 수정이 무한 반복된다"의 답은 보통 "외부에서 계속 위반 상태로 되돌림 + MaximumAutomaticAttempts 미설정"이다.

> 📚 **사례**: 드리프트와 잘못된 수정의 위험을 보여준 유명한 사고로 2017년 GitLab의 데이터베이스 삭제 사건이 있다. 한 엔지니어가 복제 지연 문제를 수습하다 프로덕션 DB 디렉터리를 수동으로 지웠고, 다섯 개의 백업 메커니즘이 모두 작동하지 않아 약 6시간의 데이터가 유실됐다. 핵심 교훈은 "수동 개입은 형상 관리의 적이며, 안전망(백업·검증)이 실제로 작동하는지 상시 확인해야 한다"는 것이다. Config의 가치가 여기 있다 — 백업 설정·암호화·복제 같은 안전망 자체가 켜져 있는지를 규칙으로 상시 평가하고(예: `db-instance-backup-enabled`), 누군가 꺼 두면 NON_COMPLIANT로 잡아 자동 교정한다. "안전망이 켜져 있다고 믿지 말고, 켜져 있음을 상시 증명하라"가 폐루프 컴플라이언스의 정신이다.

## Aggregator — 멀티 계정·리전 통합 조회

Config도 리전·계정별이라, 조직 전체 컴플라이언스를 한곳에서 보려면 **Aggregator**가 필요하다. Audit 계정에 Aggregator를 만들고 Organization을 소스로 지정하면, 모든 멤버 계정·모든 리전의 Config 데이터가 통합 조회된다.

```bash
aws configservice put-configuration-aggregator --configuration-aggregator-name org-aggregator \
  --organization-aggregation-source RoleArn=arn:aws:iam::...:role/AWSConfigOrgRole,AllAwsRegions=true
```

## Advanced Queries — SQL로 인벤토리 질의

**Advanced Query**는 Config 데이터를 SQL DSL로 질의한다. CloudWatch Logs Insights와 비슷한 문법으로, Aggregator를 통해 cross-account 질의도 된다.

```sql
SELECT
  configuration.targetResource.resourceType,
  COUNT(*) as count
WHERE configuration.complianceType = 'NON_COMPLIANT'
GROUP BY configuration.targetResource.resourceType
```

이것이 앞서 말한 리소스 의존성 그래프(CMDB)를 질의 가능하게 만드는 인터페이스다 — "암호화 안 된 EBS가 어느 계정에 몇 개인가"를 한 쿼리로 답한다.

## Config + EventBridge — 컴플라이언스 변화 라우팅

Config는 컴플라이언스 상태가 바뀔 때 EventBridge로 이벤트를 발행한다. 이를 받아 Slack 알림·Lambda·SSM으로 라우팅할 수 있다(Remediation과는 별개의, 더 유연한 경로).

```json
{
  "source": ["aws.config"],
  "detail-type": ["Config Rules Compliance Change"],
  "detail": {"newEvaluationResult": {"complianceType": ["NON_COMPLIANT"]}}
}
```

## 비용 통제 — recordingMode

Config는 **리소스 변경(CI 생성)당 과금**된다. 자주 바뀌는 리소스(예: Auto Scaling으로 끊임없이 뜨고 지는 EC2, 빈번히 갱신되는 메타데이터)는 비용을 키운다. **recordingMode**로 모든 리소스를 기록할지, 특정 타입만 기록할지, 변경 빈도가 높은 리소스를 일별로 묶을지를 조절한다.

> 💡 **관련 이론**: 이 비용 구조는 **관측 가능성(observability)의 근본 트레이드오프** — "더 많이 기록할수록 더 잘 보이지만 더 비싸다" — 의 한 사례다. 분산 추적(distributed tracing)에서 **샘플링(sampling)**으로 일부 트레이스만 저장하는 것과 같은 발상이다. Config에선 "모든 변경을 빠짐없이 기록(완전 감사 가능, 고비용)"과 "중요 리소스만 선택 기록(저비용, 사각지대)" 사이를 골라야 한다. 컴플라이언스가 강제되는 리소스(IAM·S3·SG)는 빠짐없이, 노이즈가 많고 규제 무관한 리소스는 제외하는 식의 선별이 실무 패턴이다. "관측은 공짜가 아니다"라는 원칙이 Config 비용 설계의 핵심이다.

## Config vs Security Hub Standards

| | AWS Config | Security Hub Standards |
|---|-----------|------------------------|
| 역할 | 리소스 상태 기록 + 규칙 평가 + 자동 수정 엔진 | Config 규칙을 큐레이션·통합한 보안 대시보드 |
| 관계 | 하위 엔진 | Config Rule을 내부적으로 활용 |
| 단독 사용 | 가능 | Config 의존 |

Day 2에서 봤듯 Security Hub Standards의 다수 컨트롤은 내부적으로 Config Rule을 돌린다. 즉 Config가 평가 엔진이고, Security Hub는 그 결과를 ASFF로 통합·시각화하는 상위 계층이다.

> 🎯 **시나리오**: "조직 전체(OU)에 ①모든 신규/기존 계정의 S3 버킷이 퍼블릭이 아니고 암호화돼 있어야 하며, 위반 시 사람 없이 즉시 자동 교정 ②EBS는 암호화돼 있어야 함 ③모든 계정·리전의 비준수 리소스를 Audit 계정 한 화면에서 조회 ④자체 정책(태그 필수)은 Lambda 없이 코드로 표현 ⑤자동 수정이 무한 반복되지 않도록 보호하라." → ① S3 퍼블릭·암호화 Managed Rule을 Conformance Pack에 묶어 StackSets 흐름으로 OU 배포 + 각 규칙에 SSM Automation Remediation(`Automatic:true`) 연결, ② `encrypted-volumes` Managed Rule + Remediation, ③ Audit 계정에 Organization Aggregator(AllAwsRegions) + Advanced Query, ④ 태그 필수 정책은 Custom Policy Rule(Guard DSL)로 작성, ⑤ Remediation에 `MaximumAutomaticAttempts`·`RetryAttemptSeconds` 설정 + 정당한 예외 리소스에 제외 태그. 컴플라이언스 변화는 EventBridge(`Config Rules Compliance Change`)로 Slack 알림.

## 정리하며

오늘 본 그림은 네 가지다. 첫째, **Config는 폐루프 제어의 인프라 적용**이다 — 목표(Rule)·측정(Recorder)·오차 판정(평가)·조작(Remediation)이라는 온도조절기 모델로, 선언형·멱등 형상 관리의 계보 위에 있다. 둘째, **Configuration Item이 리소스의 시점 상태와 관계 그래프(CMDB)를 기록**하며, 이는 "리소스 상태"를 다루는 점에서 "API 호출"을 다루는 CloudTrail과 보완 관계다. 셋째, **Rule은 Managed/Custom Lambda/Custom Policy(Guard DSL, OPA·Sentinel 계보) 3종**이고, Conformance Pack이 StackSets로 묶음 배포하며, Remediation이 SSM Automation으로 폐루프를 닫되 flapping·파괴적 수정이라는 함정을 `MaximumAutomaticAttempts`·예외 태그로 막는다. 넷째, **Aggregator로 멀티 계정·리전을 통합 조회**하고 Advanced Query로 SQL 질의하며, recordingMode가 관측 가능성의 비용 트레이드오프를 조절하고, Security Hub Standards는 Config를 하위 엔진으로 쓴다.

다음 글에서는 컴플라이언스를 **감사 증거 자동화·데이터 분류·취약점 스캔**으로 확장하는 Audit Manager·Macie·Inspector를 깊이 본다.

---

## 📝 연습 문제

**문제 1.** AWS Config가 구현하는 "목표 상태(Rule)와 실제 상태(Recorder)를 비교해 오차(NON_COMPLIANT)를 검출하고 자동으로 되돌린다(Remediation)"는 구조의 제어 이론적 이름은?

A) 개루프(open-loop) 제어

B) 폐루프(closed-loop / feedback) 제어 — 온도조절기처럼 목표와 측정을 비교해 오차를 줄이는 방향으로 조작

C) 무상태(stateless) 처리

D) 배치 처리

**정답: B**

해설: Config는 폐루프(피드백) 제어를 인프라에 적용한다. 목표 상태(Config Rule), 측정(Configuration Recorder), 오차 판정(COMPLIANT/NON_COMPLIANT 평가), 조작(Remediation)이 온도조절기 모델 그대로다 — 드리프트가 생기면 오차가 검출되고 Remediation이 실제 상태를 목표로 수렴시킨다. 이는 선언형·멱등 형상 관리(Puppet/Chef/Ansible 계보)의 사상이다. 개루프(A)는 피드백이 없는 제어이고, 무상태(C)·배치(D)는 무관하다.

---

**문제 2.** "누가 이 보안 그룹을 언제 바꿨나"와 "그 보안 그룹이 6개월 전 어떤 규칙을 가졌나"를 각각 답하는 서비스는?

A) 둘 다 CloudTrail

B) 둘 다 Config

C) "누가 바꿨나"는 CloudTrail(API 호출·행위 감사), "과거 상태가 어땠나"는 Config(리소스 상태·형상 기록)

D) 둘 다 GuardDuty

**정답: C**

해설: CloudTrail은 "누가 무슨 API를 언제 호출했나"(행위·감사 로그)를, Config는 "리소스가 그 결과 어떤 상태가 됐나"(상태·형상, Configuration History)를 기록한다. 둘은 보완 관계로, Config의 CI는 변경을 일으킨 CloudTrail 이벤트를 연결해 "누가→무엇을→어떤 상태로"의 전체 그림을 준다. "리소스 상태 변화·컴플라이언스"는 Config, "API 호출·사용자 추적"은 CloudTrail이다. 둘을 한 서비스로 보는 A·B·D는 틀리다.

---

**문제 3.** Lambda 함수를 작성하지 않고, 정책을 선언적 코드로 표현해 Config Rule로 평가하려 한다. 올바른 선택과 그 계보는?

A) Custom Lambda Rule

B) Custom Policy Rule (CloudFormation Guard DSL) — OPA/Rego, HashiCorp Sentinel과 같은 policy-as-code 계보로, 배포 전(cfn-guard) 검사와 런타임 평가에 같은 룰 재사용 가능

C) Managed Rule만 가능

D) Conformance Pack

**정답: B**

해설: Custom Policy Rule은 CloudFormation Guard DSL로 정책을 선언적으로 기술한다(`Resources.*[Type=="AWS::S3::Bucket"]{Properties.BucketEncryption EXISTS}`). 이는 Kubernetes의 OPA/Rego, HashiCorp Sentinel과 같은 policy-as-code 계보로, Lambda 코드(명령형) 없이 사람이 읽고 버전 관리할 수 있다. 같은 Guard 룰을 배포 전 템플릿 검사(cfn-guard, shift-left)와 배포 후 런타임 평가에 재사용한다. Custom Lambda(A)는 코드 작성이 필요하고, Conformance Pack(D)은 규칙 묶음 배포 단위이지 평가 방식이 아니다.

---

**문제 4.** PCI DSS·NIST 800-53 같은 컴플라이언스 규칙 묶음을 조직 전체(OU)에 일괄 배포하려 한다. 올바른 도구와 그 내부 메커니즘은?

A) 규칙을 계정마다 하나씩 수동 생성

B) Conformance Pack — 여러 Config Rule + Remediation을 YAML로 묶어 내부적으로 CloudFormation StackSets를 통해 OU 전체에 배포

C) Aggregator

D) Advanced Query

**정답: B**

해설: Conformance Pack은 여러 Config Rule과 Remediation을 하나의 YAML로 묶어 배포하는 단위로, 사전 정의 팩(PCI/NIST/HIPAA/FedRAMP 등)과 사용자 정의 모두 지원한다. 내부적으로 CloudFormation StackSets를 사용해 각 계정·리전에 동일하게 푸시하므로 StackSets의 배포 모델을 물려받는다. "컴플라이언스 묶음을 OU 전체에"는 Conformance Pack, "임의 인프라 리소스 멀티 계정 배포"는 StackSets다. 수동 생성(A)은 비현실적이고, Aggregator(C)는 조회 통합, Advanced Query(D)는 SQL 질의로 배포 도구가 아니다.

---

**문제 5.** 자동 Remediation을 켰는데 같은 리소스가 끊임없이 수정-재위반을 반복(flapping)하며 API 스로틀과 비용 폭증이 일어난다. 원인과 안전장치는?

A) 정상 동작이므로 무시

B) 외부 프로세스가 계속 리소스를 NON_COMPLIANT로 되돌리는 상황 + MaximumAutomaticAttempts 미설정이 원인 — MaximumAutomaticAttempts·RetryAttemptSeconds로 재시도를 제한하고, 정당한 예외엔 제외 태그를 둔다

C) Config를 끈다

D) 리전을 바꾼다

**정답: B**

해설: 어떤 외부 자동화가 계속 리소스를 위반 상태로 되돌리면 Config가 무한 수정을 시도해 flapping이 발생한다. MaximumAutomaticAttempts와 RetryAttemptSeconds가 이 루프를 끊는 안전장치다. 또 Remediation이 정당한 리소스(예: 의도된 퍼블릭 웹사이트 버킷)를 망가뜨리지 않도록 예외 태그를 두거나, 파괴적 수정은 Automatic:false로 사람 승인을 끼운다. "자동 수정이 무한 반복"의 답은 보통 "외부에서 계속 위반 + MaximumAutomaticAttempts 미설정"이다. Config 비활성화(C)·리전 변경(D)은 해결이 아니다.

---

**문제 6.** 50개 계정 × 모든 리전의 NON_COMPLIANT 리소스를 Audit 계정 한 화면에서 조회하고, "암호화 안 된 EBS가 어느 계정에 몇 개인가"를 한 쿼리로 답하려 한다. 올바른 조합은?

A) 각 계정 콘솔을 일일이 확인

B) Audit 계정에 Organization Aggregator(AllAwsRegions) 설정 + Advanced Query(SQL DSL)로 cross-account 질의

C) Conformance Pack만 배포

D) EventBridge 규칙만 생성

**정답: B**

해설: Config는 리전·계정별이라 통합 조회엔 Aggregator가 필요하다. Audit 계정에 Organization 소스 Aggregator를 만들고 AllAwsRegions로 모든 리전을 묶으면 전 계정·리전 데이터가 통합된다. 그 위에서 Advanced Query(SQL DSL)로 "complianceType='NON_COMPLIANT'인 리소스를 타입별 COUNT" 같은 cross-account 질의를 한 번에 실행한다. 이는 리소스 의존성 그래프(CMDB)를 질의 가능하게 만드는 인터페이스다. 수동 확인(A)은 비현실적, Conformance Pack(C)은 배포, EventBridge(D)는 라우팅으로 통합 조회 도구가 아니다.

---

**문제 7.** AWS Config 비용이 예상보다 크게 나왔다. Auto Scaling으로 끊임없이 생성·삭제되는 EC2와 빈번히 갱신되는 메타데이터가 주범으로 보인다. 올바른 통제는?

A) Config를 완전히 끈다

B) recordingMode로 기록 범위를 조절 — 컴플라이언스가 강제되는 리소스(IAM·S3·SG)는 빠짐없이, 노이즈 많고 규제 무관한 자주 바뀌는 리소스는 제외하거나 일별로 묶기

C) 인스턴스 타입을 키운다

D) 리전을 줄인다

**정답: B**

해설: Config는 리소스 변경(CI 생성)당 과금되므로 자주 바뀌는 리소스가 비용을 키운다. 이는 관측 가능성의 근본 트레이드오프("더 많이 기록할수록 잘 보이지만 비싸다", 분산 추적의 샘플링과 같은 발상)다. recordingMode로 모든 리소스 기록 vs 선택 기록 vs 고빈도 리소스 일별 묶기를 골라, 규제 대상 리소스는 빠짐없이 기록하고 규제 무관 노이즈는 제외하는 선별이 실무 패턴이다. Config 비활성화(A)는 컴플라이언스 사각지대를 만들고, 인스턴스 타입(C)·리전 축소(D)는 근본 원인과 무관하다.

---

## 📌 오늘의 요약

오늘 본 핵심은 네 가지다. 첫째, Config는 폐루프(피드백) 제어를 인프라에 적용한 것으로 목표(Rule)·측정(Recorder)·오차 판정(평가)·조작(Remediation)의 온도조절기 모델이며, 선언형·멱등 형상 관리의 계보 위에 있다. 둘째, Configuration Item이 리소스의 시점 상태와 관계 그래프(CMDB)를 기록하고, 이는 "API 호출"을 다루는 CloudTrail과 "리소스 상태"를 다루는 점에서 보완 관계다. 셋째, Rule은 Managed/Custom Lambda/Custom Policy(Guard DSL, OPA·Sentinel 계보) 3종이고, Conformance Pack이 StackSets로 묶음 배포하며, Remediation이 SSM Automation으로 폐루프를 닫되 flapping·파괴적 수정은 MaximumAutomaticAttempts·예외 태그로 막는다. 넷째, Aggregator로 멀티 계정·리전을 통합 조회하고 Advanced Query로 SQL 질의하며, recordingMode가 관측 비용 트레이드오프를 조절하고, Security Hub Standards는 Config를 하위 평가 엔진으로 활용한다.
