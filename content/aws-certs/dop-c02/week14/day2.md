# Day 2 - Security Hub: 보안 데이터 정규화·집계·자동 수정의 SIEM 원리

여러 탐지 도구를 한꺼번에 켜 본 사람은 곧 진짜 문제를 만난다. GuardDuty는 GuardDuty 형식으로, Inspector는 Inspector 형식으로, Macie는 또 다른 형식으로 알람을 쏟아낸다. 같은 S3 버킷 하나에 대해 세 도구가 각자 다른 모양의 경보를 내면, 운영자는 그게 같은 문제인지 다른 문제인지조차 알기 어렵다. "여러 소스의 보안 신호를 하나의 언어로 통일하고, 중복을 제거하고, 우선순위를 매겨, 그 위에서 자동 수정을 건다." 이 문제를 푸는 게 Security Hub이고, 이는 수십 년 묵은 SIEM(Security Information and Event Management)의 클라우드 네이티브 재구현이다. 콘솔에서 보면 Security Hub는 "보안 점수를 보여주는 대시보드"처럼 보이지만, 그 밑에는 데이터 정규화, 상관 분석(correlation), 중복 제거, 규칙 기반 자동화라는 SIEM의 고전적 설계가 깔려 있다. 오늘은 이 대시보드가 어떻게 서로 다른 도구의 출력을 ASFF로 통일하고, 컴플라이언스 표준을 어떻게 평가하며, 자동 수정을 Custom Action·Automation Rule·EventBridge 중 무엇으로 거는지를 판다.

DOP 시험에서 Security Hub는 "보안 상태의 단일 진실 출처(single source of truth)"로, "여러 계정·여러 도구의 Finding을 한곳에서 보려면", "특정 컴플라이언스 위반을 사람 없이 자동 수정하려면", "운영자가 콘솔에서 선택한 Finding만 수동으로 대응 트리거하려면" 같은 시나리오로 등장한다. Custom Action(수동)과 Automation Rule(자동), EventBridge 두 이벤트 타입(Imported vs Custom Action)을 구분하면 답이 보인다.

## SIEM은 왜 필요한가 — 정규화와 상관 분석의 역사

SIEM의 뿌리는 1990년대 후반~2000년대 초의 SIM(보안 정보 관리, 로그 장기 저장·분석)과 SEM(보안 이벤트 관리, 실시간 모니터링·상관)이 합쳐진 데서 나온다(가트너가 2005년 SIEM이라는 용어를 정립). ArcSight, Splunk, QRadar 같은 제품이 풀려던 문제는 한결같다 — "수십 개의 보안 도구가 각자 다른 형식으로 내는 로그를, 하나의 분석 평면으로 모아 상관시킨다."

핵심은 두 단계다. **정규화(normalization)**는 방화벽 로그, IDS 알람, OS 감사 로그를 공통 스키마로 변환해 "사과와 오렌지를 같은 단위로" 만든다. **상관(correlation)**은 정규화된 이벤트들을 교차해 "방화벽에서 포트 스캔 + 그 직후 IDS의 익스플로잇 알람 + 그 호스트의 비정상 아웃바운드 = 침해 진행 중"처럼 개별로는 약한 신호들을 묶어 강한 결론을 낸다.

Security Hub는 정확히 이 SIEM 모델을 AWS 네이티브로 구현한다. 정규화는 ASFF가, 소스 통합은 자동 연동(GuardDuty·Inspector·Macie 등이 별도 설정 없이 Finding을 보냄)이, 우선순위화·중복 제거는 Security Hub 엔진이 맡는다.

> 💡 **관련 이론**: SIEM의 상관 분석은 본질적으로 **이벤트 상관(event correlation)**이라는, 네트워크 관리(통신망 장애 진단)에서 먼저 발전한 분야의 응용이다. 개별 이벤트는 노이즈일 수 있지만, 시간·자원·공격 단계로 묶으면 의미가 생긴다. 현대 보안에선 이 묶음을 **MITRE ATT&CK** 프레임워크의 전술(Tactics)·기법(Techniques)에 매핑한다 — "초기 접근(Initial Access) → 권한 상승(Privilege Escalation) → 측면 이동(Lateral Movement) → 데이터 유출(Exfiltration)"이라는 공격 사슬(kill chain, Lockheed Martin이 2011년 정식화한 Cyber Kill Chain의 계보) 위에 각 Finding을 놓는다. ASFF의 `Types` 필드가 `TTPs/Initial Access/...` 형태로 ATT&CK 전술을 담는 이유다 — 개별 Finding을 공격 단계에 위치시켜 "지금 공격이 어디까지 왔는가"를 읽게 한다.

## ASFF — 보안 Finding의 공통 언어

ASFF(AWS Security Finding Format)는 모든 Finding이 따르는 표준 JSON 스키마다. 핵심 필드를 보면 무엇을 표준화하는지 드러난다.

```json
{
  "SchemaVersion": "2018-10-08",
  "Id": "...",
  "ProductArn": "arn:aws:securityhub:...:product/aws/guardduty",
  "GeneratorId": "guardduty/finding-id",
  "AwsAccountId": "111122223333",
  "Types": ["TTPs/Initial Access/UnauthorizedAccess:EC2-SSHBruteForce"],
  "Severity": {"Label": "HIGH", "Normalized": 70},
  "Resources": [{"Type": "AwsEc2Instance", "Id": "i-..."}],
  "Compliance": {"Status": "FAILED"},
  "Workflow": {"Status": "NEW"},
  "RecordState": "ACTIVE"
}
```

여기서 주목할 것이 **Severity의 이중 표현**이다. `Label`(CRITICAL/HIGH/MEDIUM/LOW/INFORMATIONAL)은 사람이 읽고, `Normalized`(0~100 정수)는 기계가 비교·정렬한다. 서로 다른 소스가 각자의 척도(GuardDuty는 1~10, Inspector는 CVSS 0~10)로 심각도를 내도, ASFF로 들어오면 0~100으로 정규화되어 한 줄에 세워 비교할 수 있다.

> 🔍 **더 깊이**: Severity 정규화의 배경엔 **CVSS(Common Vulnerability Scoring System)**가 있다. CVSS는 FIRST(Forum of Incident Response and Security Teams)가 만든 취약점 심각도 표준 점수 체계로, 현재 v3.1/v4.0이 쓰인다. 공격 벡터(네트워크/로컬), 공격 복잡도, 권한 요구, 사용자 상호작용, 영향(기밀성·무결성·가용성)을 조합해 0.0~10.0을 산출한다. Inspector v2의 Finding은 이 CVSS 점수를 그대로 담고, ASFF는 이를 `Normalized` 0~100으로 매핑한다(대략 CVSS × 10). 그래서 Security Hub에서 GuardDuty의 행동 기반 위협과 Inspector의 CVE 취약점을 같은 우선순위 큐에 놓고 비교할 수 있는 것이다 — 정규화가 없으면 "위협 8.5점과 취약점 CVSS 9.1점 중 뭘 먼저 볼지"를 기계가 판단할 수 없다.

> ⚠️ **함정**: ASFF의 `Workflow.Status`와 `RecordState`를 혼동하면 안 된다. **RecordState**(ACTIVE/ARCHIVED)는 Finding이 여전히 유효한 상태인지를 나타낸다 — 문제가 해결되면 소스가 ARCHIVED로 바꾼다. **Workflow.Status**(NEW/NOTIFIED/RESOLVED/SUPPRESSED)는 운영자/자동화가 이 Finding을 처리하는 워크플로 단계다. "Finding을 억제(suppress)한다"는 건 `Workflow.Status`를 SUPPRESSED로 바꾸는 것이지 Finding을 삭제하거나 ARCHIVED하는 게 아니다 — 데이터는 남아 사후 감사에 쓰인다. 시험에서 "의도된 위험을 대시보드에서만 숨기고 기록은 보존"의 답은 Workflow를 SUPPRESSED로 두는 것이다.

## 보안 표준 — 컴플라이언스를 코드로 평가

Security Hub는 사전 정의된 보안 표준(Security Standards)을 활성화하면, 계정의 리소스를 그 표준의 컨트롤들에 대해 자동 평가한다.

- **AWS Foundational Security Best Practices (FSBP)** — AWS가 정의한 기본 보안 권고. 가장 광범위.
- **CIS AWS Foundations Benchmark** — CIS(Center for Internet Security)의 합의 기반 벤치마크.
- **PCI DSS** — 카드 결제 산업 데이터 보안 표준.
- **NIST 800-53** — 미국 연방 정보 시스템 보안 통제 카탈로그.

각 컨트롤은 리소스를 PASS/FAILED/NOT_AVAILABLE로 평가하고, 이 결과들을 종합해 **보안 점수(security score, %)**를 낸다.

> 💡 **관련 이론**: 이 표준들의 번호 체계를 알아두면 시험에 유리하다. **CIS Benchmark**는 보안 전문가 커뮤니티의 **합의(consensus) 기반** 권고로, "최소한 이건 지켜라"의 산업 합의다. **NIST SP 800-53**은 미국 NIST(National Institute of Standards and Technology)가 발행하는 연방 정보 시스템용 보안·프라이버시 통제 카탈로그로, FedRAMP(연방 클라우드 인증)의 기반이다. **PCI DSS**는 PCI SSC(Security Standards Council)가 관리하며 카드 데이터를 다루는 모든 조직에 강제된다. 이들은 각각 다른 권위(산업 합의 / 정부 표준 / 산업 규제)에서 나오지만, Security Hub는 이 모두를 컨트롤 단위로 쪼개 같은 PASS/FAIL 평가 엔진에 태운다 — 규정을 "코드로 평가 가능한 컨트롤"로 환원하는 **Compliance as Code**의 구현이다.

> 🔍 **더 깊이**: Security Hub의 표준 컨트롤 중 다수는 **내부적으로 AWS Config Rule을 사용**한다(Day 3). Security Hub를 켜면 필요한 Config Rule들이 자동 배포되어 리소스 변경을 평가하고, 그 결과가 Security Hub 컨트롤의 PASS/FAIL로 올라온다. 즉 Security Hub Standards = 큐레이션된 Config Rule 묶음 + ASFF 통합 대시보드인 셈이다. 그래서 "Security Hub 표준을 쓰려면 Config가 켜져 있어야 한다"는 전제 조건이 붙는다 — 이 의존성을 모르면 "Security Hub를 켰는데 왜 컨트롤이 NO_DATA인가"의 함정에 빠진다. 컨트롤 일부는 Config 외에 직접 API 점검도 쓴다.

## 멀티 계정 집계 — Delegated Administrator

GuardDuty와 마찬가지로 Security Hub도 Organizations와 통합한다. **위임 관리자(Delegated Administrator)** 계정(보통 Audit)을 지정하면, 모든 멤버 계정의 Finding이 그 계정으로 중앙 집계되고, 표준이 일괄 활성화되며, 신규 계정이 자동 등록된다. 운영자는 한 화면에서 조직 전체의 보안 상태를 본다.

```bash
aws securityhub enable-organization-admin-account --admin-account-id AUDIT-ACCT
aws securityhub update-organization-configuration --auto-enable
```

## 멀티 리전 집계 — Region Aggregator

Security Hub는 리전별 서비스다. 여러 리전에 자원이 흩어진 조직은 리전마다 Security Hub 콘솔을 따로 봐야 하는데, 이를 막는 게 **Cross-Region Aggregation**이다. 하나의 **집계 리전(aggregation region)**을 정하고 다른 리전들을 **연결 리전(linked regions)**으로 묶으면, 모든 리전의 Finding이 집계 리전으로 복제되어 한곳에서 보인다.

> ⚠️ **함정**: 멀티 계정과 멀티 리전은 **직교하는 두 축**이다. Delegated Administrator는 **계정** 차원의 통합이고, Region Aggregator는 **리전** 차원의 통합이다. 둘 다 필요한 경우(여러 계정 × 여러 리전)엔 둘을 함께 설정해야 한다. 시험에서 "us-east-1과 eu-west-1의 Finding을 한 화면에서 보려면"의 답은 Delegated Administrator가 아니라 Region Aggregator이고, "계정 A·B·C의 Finding을 한 화면에서"의 답은 그 반대다.

## 자동 수정 — 세 갈래 길

Security Hub 위에서 "Finding이 떴을 때 무엇을 자동으로 할 것인가"는 세 가지 방식으로 갈린다. 이 셋의 구분이 DOP 시험의 핵심이다.

### 1. Custom Action — 운영자가 콘솔에서 수동 트리거

**Custom Action**은 운영자가 콘솔에서 Finding을 선택하고 "이 액션을 실행"을 누르면, 그 이벤트가 EventBridge로 발행되는 방식이다. 사람이 판단해 트리거하는 "반자동"이다.

```bash
aws securityhub create-action-target \
  --name "Quarantine EC2" --description "Move EC2 to quarantine SG" --id quarantine-ec2
```

이때 EventBridge가 받는 이벤트는 **`Security Hub Findings - Custom Action`** 타입이다.

```json
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Custom Action"],
  "resources": ["arn:aws:securityhub:...:action/custom/quarantine-ec2"]
}
```

### 2. 자동 (스케일) — Imported 이벤트로 모든 Finding 캐치

사람을 거치지 않고 새로 들어오는 모든 Finding을 자동 처리하려면 **`Security Hub Findings - Imported`** 이벤트 타입을 쓴다. 모든 신규/갱신 Finding이 이 이벤트로 흐르므로, 필터로 좁혀 Lambda/SSM으로 보낸다.

```json
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": {
    "findings": {
      "Severity": {"Label": ["CRITICAL", "HIGH"]},
      "Compliance": {"Status": ["FAILED"]},
      "GeneratorId": [{"prefix": "aws-foundational-security-best-practices/v/1.0.0/S3"}]
    }
  }
}
```

### 3. Automation Rule — Lambda 없이 규칙 기반 처리 (2023+)

2023년 추가된 **Automation Rule**은 Security Hub 자체 내장 자동화로, EventBridge·Lambda 없이 규칙만으로 Finding 필드를 갱신한다. 예: "Dev 계정의 Low Finding은 자동 억제."

```bash
aws securityhub create-automation-rule \
  --rule-name "Auto-suppress dev low" \
  --criteria '{"AwsAccountId":[{"Value":"DEV-ACCT","Comparison":"EQUALS"}],"SeverityLabel":[{"Value":"LOW","Comparison":"EQUALS"}]}' \
  --actions '[{"Type":"FINDING_FIELDS_UPDATE","FindingFieldsUpdate":{"Workflow":{"Status":"SUPPRESSED"}}}]'
```

> 💡 **관련 이론**: 이 세 갈래는 자동화의 고전적 스펙트럼 — **수동(human-in-the-loop) → 규칙 기반(rule-based) → 완전 자동(event-driven)** — 을 그대로 보여준다. Custom Action은 사람의 판단을 명시적으로 끼워 넣는 HITL이고(되돌리기 어려운 파괴적 작업에 안전), Automation Rule은 단순 라벨링·억제 같은 결정론적 처리에 적합한 규칙 엔진이며, Imported→Lambda는 복잡한 로직이 필요한 완전 자동이다. 좋은 보안 자동화는 작업의 **위험도와 가역성**에 따라 이 셋을 섞는다 — "S3 퍼블릭 차단"처럼 안전·가역적인 건 완전 자동, "프로덕션 인스턴스 격리"처럼 영향이 큰 건 Custom Action으로 사람 승인을 끼우는 식이다. SOAR(Security Orchestration, Automation and Response)라는 업계 용어가 이 오케스트레이션을 가리킨다.

> ⚠️ **함정**: Automation Rule과 Imported→Lambda를 혼동하면 안 된다. **Automation Rule은 Finding의 필드를 갱신**(Severity 변경, Workflow 억제, 노트 추가)할 뿐, **실제 리소스를 고치지 못한다**. "S3 버킷을 실제로 비공개로 바꾸기" 같은 리소스 수정은 반드시 EventBridge(Imported)→Lambda/SSM Automation을 거쳐야 한다. 시험에서 "Lambda 없이 Finding을 억제·라벨링"은 Automation Rule이 맞지만, "실제로 리소스를 수정"은 Automation Rule로 안 되고 EventBridge+Lambda/SSM이 답이다.

## 자동 수정 사례 — S3 퍼블릭 버킷

전형적 자동 수정 흐름은 이렇다. FSBP의 `S3.1`(S3 Block Public Access 위반) 컨트롤이 FAILED를 내면 → 그 Finding이 Imported 이벤트로 발행 → EventBridge가 필터해 Lambda 호출 → Lambda가 해당 버킷에 Block Public Access를 강제.

```bash
aws events put-rule --name SecHubS3Public \
  --event-pattern '{"source":["aws.securityhub"],"detail-type":["Security Hub Findings - Imported"],"detail":{"findings":{"Compliance":{"Status":["FAILED"]},"GeneratorId":[{"prefix":"aws-foundational-security-best-practices/v/1.0.0/S3.1"}]}}}'
```

> 📚 **사례**: 잘못 설정된 퍼블릭 S3 버킷은 클라우드 데이터 유출의 단골 원인이다. 2017년 미 국방부 관련 INSCOM(육군 정보보안사령부) 협력사가 퍼블릭으로 노출된 S3 버킷에 기밀 데이터를 두어 보안 연구자에게 발견됐고, 같은 해 Verizon 협력사 NICE Systems가 약 600만 고객 기록을 퍼블릭 S3에 노출했다. 이런 사고들이 반복되자 AWS는 2018년 **S3 Block Public Access** 기능을 도입하고, 이후 신규 버킷의 퍼블릭 액세스를 기본 차단으로 바꿨다. 교훈: 보안은 "한 번 잘 설정"이 아니라 "잘못된 설정을 상시 탐지·자동 교정"하는 폐루프(closed loop)가 되어야 한다 — Security Hub FSBP S3.1 컨트롤 + 자동 수정 Lambda가 바로 이 폐루프를 구현한다.

## Insights — 저장된 Finding 쿼리

**Insights**는 자주 보는 Finding 필터를 저장하고 그룹화해 두는 기능이다. "Critical 등급의 S3 관련 Finding을 리소스별로 묶어 보기" 같은 질의를 한 번 정의해 두면 대시보드에서 반복 확인할 수 있다.

```bash
aws securityhub create-insight --name "Critical S3 Findings" \
  --filters '{"ResourceType":[{"Value":"AwsS3Bucket","Comparison":"EQUALS"}],"SeverityLabel":[{"Value":"CRITICAL","Comparison":"EQUALS"}]}' \
  --group-by-attribute ResourceId
```

## Trusted Advisor와의 차이

| | Security Hub | Trusted Advisor |
|---|--------------|-----------------|
| 목적 | 보안 Finding 통합 + 자동화 | AWS 모범 사례 권고 |
| 범위 | 보안 중심 | 비용·성능·보안·내결함성·서비스 한도 5축 |
| 데이터 | ASFF Finding | AWS 자체 점검 결과 |
| 자동화 | EventBridge·Custom Action·Automation Rule | 제한적 (일부 EventBridge) |

Trusted Advisor의 일부 결과도 Security Hub로 전송 가능하지만, 둘은 역할이 다르다 — Trusted Advisor는 폭넓은 권고, Security Hub는 보안 운영의 통합·자동화 허브다.

> 🎯 **시나리오**: "조직에 50개 계정 × 3개 리전이 있다. 모든 계정·리전의 GuardDuty·Inspector·Macie Finding을 한 화면에서 보고, FSBP·CIS 표준 위반을 평가하며, S3 퍼블릭 위반은 사람 없이 즉시 자동 교정하되, 프로덕션 EC2 격리는 운영자 승인 후 실행하고, Dev 계정의 Low Finding은 자동 억제하라." → ① Audit 계정을 Security Hub Delegated Administrator로 지정 + auto-enable(50개 계정 통합), ② Region Aggregator로 3개 리전을 집계 리전에 통합, ③ FSBP·CIS Standards 활성화(내부 Config Rule 자동 배포), ④ S3 퍼블릭: EventBridge `Findings - Imported` 필터(GeneratorId prefix S3) → Lambda 자동 교정(완전 자동), ⑤ 프로덕션 EC2 격리: Custom Action 생성 → 운영자가 콘솔에서 선택 트리거 → EventBridge `Findings - Custom Action` → SSM Runbook(HITL), ⑥ Dev Low 억제: Automation Rule로 Workflow=SUPPRESSED(Lambda 불필요).

## 정리하며

오늘 본 그림은 네 가지다. 첫째, **Security Hub는 SIEM의 클라우드 네이티브 재구현**으로, 정규화(ASFF)·집계·우선순위화·자동화라는 고전적 SIEM 모델을 따르며 ATT&CK 공격 사슬 위에 Finding을 놓는다. 둘째, **ASFF가 서로 다른 소스의 심각도를 0~100으로 정규화**(CVSS 계보)해 위협과 취약점을 한 큐에서 비교하게 하고, Workflow.Status(처리 단계)와 RecordState(유효성)는 다른 축이다. 셋째, **보안 표준(FSBP·CIS·PCI·NIST)은 Compliance as Code**로, 다수가 내부적으로 Config Rule을 써 PASS/FAIL을 평가하므로 Config 의존성이 있다. 넷째, **자동 수정은 Custom Action(수동 HITL)·Automation Rule(규칙 기반 필드 갱신, 리소스 수정 불가)·Imported→Lambda/SSM(완전 자동 리소스 수정)** 세 갈래이며, 작업의 위험도·가역성에 따라 골라 섞는다. 멀티 계정은 Delegated Administrator, 멀티 리전은 Region Aggregator라는 직교하는 두 축이다.

다음 글에서는 이 표준 평가의 엔진인 **AWS Config** — 리소스 컴플라이언스 평가와 자동 수정 — 를 깊이 본다.

---

## 📝 연습 문제

**문제 1.** ASFF가 GuardDuty(1~10 척도)와 Inspector(CVSS 0~10) 같은 서로 다른 소스의 심각도를 한 우선순위 큐에서 비교 가능하게 만드는 메커니즘은?

A) 모든 소스를 강제로 GuardDuty 척도로 변환

B) Severity를 Label(사람용 CRITICAL/HIGH/...)과 Normalized(0~100 정수, 기계 비교용)로 이중 표현해 서로 다른 척도를 0~100으로 정규화

C) 심각도를 무시하고 시간순으로만 정렬

D) 각 소스를 별도 대시보드로 분리

**정답: B**

해설: ASFF의 Severity는 Label(CRITICAL/HIGH/MEDIUM/LOW, 사람이 읽음)과 Normalized(0~100 정수, 기계가 비교·정렬)로 이중 표현된다. GuardDuty의 1~10, Inspector의 CVSS 0~10 등 서로 다른 척도가 ASFF로 들어오면 0~100으로 정규화되어 한 줄에 세워 비교된다(대략 CVSS×10). 정규화가 없으면 "위협 8.5점과 취약점 CVSS 9.1점 중 뭘 먼저 볼지"를 기계가 판단할 수 없다. 강제 단일 척도(A)·시간순(C)·분리(D)는 정규화의 목적과 어긋난다.

---

**문제 2.** Security Hub에서 의도된 위험(accepted risk)을 대시보드에서 숨기되 사후 감사를 위해 기록은 보존하려 한다. 올바른 동작은?

A) Finding의 RecordState를 ARCHIVED로 바꾼다

B) Finding의 Workflow.Status를 SUPPRESSED로 바꾼다 — 데이터는 보존되고 대시보드에서만 숨겨진다

C) Finding을 삭제한다

D) 소스 도구(GuardDuty)를 끈다

**정답: B**

해설: ASFF에서 RecordState(ACTIVE/ARCHIVED)는 Finding이 여전히 유효한지를, Workflow.Status(NEW/NOTIFIED/RESOLVED/SUPPRESSED)는 처리 워크플로 단계를 나타낸다. "억제"는 Workflow.Status를 SUPPRESSED로 두는 것으로, Finding 데이터는 보존되어 사후 감사에 쓰이고 대시보드/알림에서만 숨겨진다. RecordState ARCHIVED(A)는 "유효성 종료"라는 다른 의미이고, 삭제(C)·소스 비활성화(D)는 기록 보존 요구에 어긋난다.

---

**문제 3.** Security Hub 보안 표준(FSBP·CIS 등)을 활성화했는데 다수 컨트롤이 데이터 없음(NO_DATA) 상태다. 가장 가능성 높은 원인은?

A) Security Hub가 리전을 지원하지 않아서

B) 다수 표준 컨트롤이 내부적으로 AWS Config Rule을 사용하므로 Config가 켜져 있어야 하는데, Config Recorder가 비활성이어서

C) 계정에 리소스가 하나도 없어서

D) ASFF 버전이 낮아서

**정답: B**

해설: Security Hub Standards의 다수 컨트롤은 내부적으로 AWS Config Rule을 사용해 리소스 변경을 평가하고 그 결과를 PASS/FAIL로 끌어올린다. 즉 Security Hub Standards = 큐레이션된 Config Rule 묶음 + ASFF 대시보드인 셈이라, Config Recorder가 켜져 있어야 컨트롤이 평가된다. Config가 비활성이면 컨트롤이 NO_DATA로 남는다. 이 의존성을 모르면 함정에 빠진다. 리전 미지원(A)·리소스 없음(C)·ASFF 버전(D)은 일반적 원인이 아니다.

---

**문제 4.** 운영자가 Security Hub 콘솔에서 특정 Finding을 직접 선택해 대응을 트리거하려 한다(파괴적 작업이라 사람 판단 필요). 올바른 구성과 그때 발행되는 EventBridge 이벤트 타입은?

A) Automation Rule — `Security Hub Findings - Imported`

B) Custom Action 생성 → 운영자 선택 트리거 → `Security Hub Findings - Custom Action` 이벤트 → EventBridge → Lambda/SSM

C) Insight — `Security Hub Insight` 이벤트

D) Standard 활성화 — `Compliance Change` 이벤트

**정답: B**

해설: Custom Action은 운영자가 콘솔에서 Finding을 선택해 수동 트리거하는 human-in-the-loop 방식으로, 트리거 시 `Security Hub Findings - Custom Action` 이벤트가 EventBridge로 발행되어 Lambda/SSM Runbook을 호출한다. 파괴적·비가역적 작업에 사람 승인을 끼우는 데 적합하다. 사람을 거치지 않는 모든 신규 Finding 자동 처리는 `Security Hub Findings - Imported`(A의 이벤트 타입은 자동 흐름용)다. Insight(C)는 저장된 쿼리, Standard(D)는 컴플라이언스 평가로 트리거 메커니즘이 아니다.

---

**문제 5.** "Dev 계정의 Low Finding을 Lambda 없이 자동으로 억제"하는 것과 "실제로 퍼블릭 S3 버킷을 비공개로 수정"하는 것의 올바른 구현은?

A) 둘 다 Automation Rule

B) 둘 다 EventBridge → Lambda

C) 억제는 Automation Rule(필드 갱신), 실제 리소스 수정은 EventBridge(Imported) → Lambda/SSM Automation

D) 억제는 Custom Action, 수정은 Insight

**정답: C**

해설: Automation Rule(2023+)은 Lambda·EventBridge 없이 Finding의 필드만 갱신한다(Severity 변경, Workflow 억제, 노트). 따라서 "Dev Low 억제"는 Automation Rule이 맞다. 그러나 Automation Rule은 실제 리소스를 고치지 못한다 — "S3 버킷을 실제로 비공개로 바꾸기"는 반드시 EventBridge(`Findings - Imported`) → Lambda/SSM Automation을 거쳐야 한다. 이 구분이 핵심 함정이다. 둘 다 같은 방식(A·B)이거나 잘못된 매핑(D)은 틀리다.

---

**문제 6.** us-east-1, eu-west-1, ap-northeast-2 세 리전의 Finding을 한 화면에서 보려 한다(계정은 하나). 올바른 설정은?

A) Delegated Administrator 지정

B) Cross-Region Aggregation으로 집계 리전을 정하고 나머지를 연결 리전(linked regions)으로 묶기

C) Custom Action 생성

D) Insight 생성

**정답: B**

해설: Security Hub는 리전별 서비스다. 여러 리전 Finding을 한곳에서 보려면 Cross-Region Aggregation으로 하나의 집계 리전을 정하고 다른 리전을 연결 리전으로 묶어야 한다. Delegated Administrator(A)는 계정 차원 통합으로 직교하는 다른 축이다 — "여러 계정"이면 A, "여러 리전"이면 B다. 둘 다 필요하면 함께 설정한다. Custom Action(C)·Insight(D)는 집계와 무관하다.

---

**문제 7.** ASFF의 `Types` 필드가 `TTPs/Initial Access/...` 형태로 표현되는 이유와 그 활용은?

A) 단순히 알파벳 정렬을 위해

B) MITRE ATT&CK의 전술(Tactics)·기법(Techniques)에 Finding을 매핑해, 개별 Finding을 공격 사슬(kill chain) 단계에 위치시켜 "공격이 지금 어디까지 왔는가"를 읽게 하기 위해

C) Finding의 저장 위치를 지정하기 위해

D) 과금 분류를 위해

**정답: B**

해설: ASFF의 Types 필드는 MITRE ATT&CK 프레임워크의 전술(Initial Access, Privilege Escalation, Lateral Movement, Exfiltration 등)·기법에 Finding을 매핑한다. 이는 Lockheed Martin의 Cyber Kill Chain 계보 위에서 개별 Finding을 공격 단계에 위치시켜, SIEM의 상관 분석으로 "공격이 어느 단계까지 진행됐는가"를 읽게 한다. 개별로는 약한 신호를 공격 사슬로 묶는 것이 SIEM 상관 분석의 핵심이다. 정렬(A)·저장 위치(C)·과금(D)과는 무관하다.

---

## 📌 오늘의 요약

오늘 본 핵심은 네 가지다. 첫째, Security Hub는 SIEM의 클라우드 네이티브 재구현으로 정규화(ASFF)·집계·우선순위화·상관(ATT&CK 매핑)·자동화라는 고전적 SIEM 모델을 따른다. 둘째, ASFF는 서로 다른 소스의 심각도를 Normalized 0~100(CVSS 계보)으로 통일해 위협과 취약점을 한 큐에서 비교하게 하며, Workflow.Status(처리 단계, SUPPRESSED=숨김·보존)와 RecordState(유효성)는 다른 축이다. 셋째, 보안 표준(FSBP·CIS·PCI·NIST)은 Compliance as Code이고 다수가 내부적으로 Config Rule을 써 평가하므로 Config 의존성이 있다. 넷째, 자동 수정은 Custom Action(수동 HITL, Custom Action 이벤트)·Automation Rule(규칙 기반 필드 갱신, 리소스 수정 불가)·Imported→Lambda/SSM(완전 자동 리소스 수정) 세 갈래이며, 멀티 계정은 Delegated Administrator, 멀티 리전은 Region Aggregator라는 직교 축으로 통합한다.
