# Day 4 - 탐지 통합: GuardDuty + Security Hub + Detective + Inspector 한 그림, 멀티계정 탐지 베이스라인

지난 사흘은 탐지 계층의 개별 도구를 봤다. GuardDuty(위협 탐지), Detective(조사), Inspector(취약점). 그런데 실제 보안 운영에서 이들은 *따로* 쓰이지 않는다 — 각자 핀딩을 쏟아내면 분석가는 네 개의 콘솔을 오가며 같은 사건을 네 번 본다. 오늘의 주제는 이 도구들을 **하나의 일관된 탐지 아키텍처**로 묶는 것이다. 그 접착제가 **AWS Security Hub**다.

핵심 통찰: GuardDuty·Inspector·Detective·Macie·IAM Access Analyzer 등은 각자 *전문 탐지기*이고, Security Hub는 이들의 출력을 *표준 형식으로 모아 한 화면에서 우선순위화·상관·자동화*하는 **집계·오케스트레이션 허브**다. 시험은 "이 신호들을 어떻게 단일 운영 창으로 통합하는가"를 반복해서 묻는다.

## Security Hub: 집계의 중심과 ASFF

Security Hub의 두 가지 기능:

```
1) 표준 검사(Security Standards): CIS, AWS FSBP, PCI DSS, NIST 등의
   규정 준수 컨트롤을 자동 평가 → "구성이 모범에 맞나"

2) 핀딩 집계(Findings aggregation): 통합된 서비스들의 핀딩을
   ASFF(AWS Security Finding Format)로 표준화해 한곳에 모음
```

**ASFF(AWS Security Finding Format)**가 통합의 열쇠다. GuardDuty 핀딩, Inspector 발견, Macie 결과는 원래 형식이 제각각인데, Security Hub가 이를 *공통 JSON 스키마(ASFF)*로 정규화한다. 덕분에 출처가 달라도 동일한 필드(severity, resource, type)로 검색·필터·상관할 수 있다.

```
GuardDuty ─┐
Inspector ─┤
Macie     ─┼─▶ Security Hub ─(ASFF 정규화)─▶ 단일 핀딩 뷰
Access Analyzer ┤                              ├─ severity·리소스로 정렬/필터
서드파티(파트너)┘                              ├─ Insights(상관 그룹)
                                               └─ EventBridge로 발행
```

> 💡 **관련 이론**: 이것은 *SIEM/SOAR* 패러다임의 클라우드 네이티브 구현이다. SIEM(Security Information and Event Management)은 흩어진 보안 이벤트를 *정규화·집계*하고, SOAR(Security Orchestration, Automation and Response)는 그 위에서 *자동 대응*을 건다. Security Hub는 ASFF로 정규화(SIEM의 정규화 계층)하고 EventBridge·자동화 규칙으로 대응(SOAR)을 트리거한다. 표준 스키마 없이는 도구마다 다른 형식 때문에 상관·자동화가 불가능하다 — ASFF가 그 공통어다.

### ASFF 실물: 같은 사건, 다른 껍데기, 같은 스키마

day1에서 본 GuardDuty 핀딩이 Security Hub에 들어오면 어떤 모습이 되는지가 통합의 실체다.

```json
{
  "SchemaVersion": "2018-10-08",
  "Id": "arn:aws:guardduty:ap-northeast-2:111122223333:detector/12abc.../finding/ac1b2c...",
  "ProductArn": "arn:aws:securityhub:ap-northeast-2::product/aws/guardduty",
  "GeneratorId": "arn:aws:guardduty:ap-northeast-2:111122223333:detector/12abc34d567e8fa901bc2d34e56789f0",
  "AwsAccountId": "111122223333",
  "Types": ["TTPs/Initial Access/UnauthorizedAccess:IAMUser-InstanceCredentialExfiltration.OutsideAWS"],
  "CreatedAt": "2026-03-14T02:11:07Z",
  "UpdatedAt": "2026-03-14T02:29:52Z",
  "Severity": { "Label": "HIGH", "Normalized": 80, "Original": "8" },
  "Title": "Credentials created exclusively for an EC2 instance are being used from an external IP address.",
  "Resources": [
    {
      "Type": "AwsIamAccessKey",
      "Id": "AWS::IAM::AccessKey:ASIAEXAMPLEKEYID",
      "Region": "ap-northeast-2",
      "Details": {
        "AwsIamAccessKey": {
          "PrincipalId": "AROAEXAMPLE:i-0abc123def4567890",
          "PrincipalType": "AssumedRole",
          "PrincipalName": "app-server-role"
        }
      }
    }
  ],
  "ProductFields": {
    "aws/guardduty/service/action/awsApiCallAction/api": "ListBuckets",
    "aws/guardduty/service/action/awsApiCallAction/remoteIpDetails/ipAddressV4": "198.51.100.24",
    "aws/securityhub/ProductName": "GuardDuty"
  },
  "Workflow": { "Status": "NEW" },
  "RecordState": "ACTIVE"
}
```

여기서 통합의 문법이 드러난다.

| ASFF 필드 | 통합에서 하는 일 |
|-----------|------------------|
| `ProductArn` | **어느 탐지기가 만들었는가.** 이 필드 하나로 GuardDuty·Inspector·Macie·서드파티가 구분되며, 필터·라우팅의 기준이 된다. |
| `Types` | 원래 서비스의 유형 이름을 **공통 분류 체계**로 다시 표현. GuardDuty의 `UnauthorizedAccess:...`가 `TTPs/Initial Access/...`로 매핑된다. 출처가 달라도 같은 축으로 정렬 가능해진다. |
| `Severity.Normalized` | **0–100 정규화 점수.** GuardDuty는 0.1–8.9, Inspector는 CVSS 0–10을 쓰는데, 이것들이 한 눈금 위에 놓여야 "지금 가장 위험한 것"을 정렬할 수 있다. `Original`에 원래 값이 보존된다. |
| `Resources[]` | **어떤 리소스인가**를 표준 타입(`AwsIamAccessKey`, `AwsEc2Instance`, `AwsS3Bucket`…)으로 표현. 서로 다른 탐지기의 핀딩을 *같은 리소스* 기준으로 묶는 상관의 열쇠. |
| `ProductFields` | 원래 서비스의 고유 정보를 잃지 않도록 담아 두는 자리. 정규화가 정보를 버리지 않는다는 보장. |
| `Workflow.Status` | `NEW` → `NOTIFIED` → `RESOLVED`/`SUPPRESSED`. **운영 상태**를 핀딩에 붙여 티켓 시스템처럼 쓴다. |
| `RecordState` | `ACTIVE`/`ARCHIVED`. 위 `Workflow`와 혼동 주의 — 이쪽은 *핀딩 자체의 생존*, 저쪽은 *사람의 처리 상태*다. |

`Severity.Normalized` 눈금은 외워 둘 값이다: INFORMATIONAL 0, LOW 1–39, MEDIUM 40–69, HIGH 70–89, CRITICAL 90–100. EventBridge 규칙에서 "70 이상만 자동 대응"처럼 임계값을 걸 때 이 숫자를 쓴다.

> ⚠️ **함정**: `Workflow.Status`와 `RecordState`를 뒤바꿔 쓰는 것이 흔한 실수다. 분석가가 "처리 완료"로 표시하는 것은 `Workflow.Status = RESOLVED`이고, 노이즈를 접는 것은 `SUPPRESSED`다. `RecordState = ARCHIVED`는 핀딩 제공자(GuardDuty 등)가 더 이상 유효하지 않다고 판단해 접은 상태다. 자동화 규칙으로 노이즈를 죽일 때 `RecordState`를 건드리려 하면 의도대로 동작하지 않는다.

### 커스텀 핀딩: ASFF는 AWS 서비스 전용이 아니다

ASFF의 진짜 확장성은 **자체 도구의 결과도 같은 스키마로 밀어 넣을 수 있다**는 점에 있다. 사내 정적 분석기, 자체 위협 인텔, 서드파티 스캐너의 결과를 Security Hub에 넣으면 같은 대시보드·같은 자동화가 그대로 적용된다.

```bash
aws securityhub batch-import-findings --findings '[
  {
    "SchemaVersion": "2018-10-08",
    "Id": "internal-scanner/2026-03-14/finding-001",
    "ProductArn": "arn:aws:securityhub:ap-northeast-2:111122223333:product/111122223333/default",
    "GeneratorId": "internal-iac-scanner",
    "AwsAccountId": "111122223333",
    "Types": ["Software and Configuration Checks/Vulnerabilities"],
    "CreatedAt": "2026-03-14T05:00:00Z",
    "UpdatedAt": "2026-03-14T05:00:00Z",
    "Severity": { "Label": "HIGH", "Normalized": 75 },
    "Title": "Terraform 모듈이 0.0.0.0/0 인바운드 SSH를 허용",
    "Description": "modules/network/sg.tf 에서 관리 포트가 전체 개방으로 정의됨",
    "Resources": [
      { "Type": "AwsEc2SecurityGroup", "Id": "sg-0a1b2c3d4e5f", "Region": "ap-northeast-2" }
    ],
    "Workflow": { "Status": "NEW" },
    "RecordState": "ACTIVE"
  }
]'
```

> 🔍 **더 깊이**: 커스텀 핀딩을 넣을 때의 `ProductArn` 형식(`.../product/<계정ID>/default`)이 의미하는 바는, **계정 자신이 하나의 "제품"으로 등록된다**는 것이다. 이 설계 덕분에 사내 도구가 늘어나도 Security Hub 쪽 구조를 바꿀 필요가 없고, `GeneratorId`로 도구를 구분한다. 실무에서 이것이 값을 내는 지점은 *대시보드*가 아니라 **자동화의 재사용**이다. 이미 "Normalized ≥ 70이면 온콜 호출 + 티켓 생성"이라는 파이프라인이 있다면, 새 도구를 붙일 때 파이프라인을 다시 짜지 않고 ASFF로 밀어 넣기만 하면 된다. 통합 아키텍처의 비용 절감은 화면 통합이 아니라 **자동화 표면의 단일화**에서 나온다.

## 네 도구가 한 사건에서 협력하는 법

한 침해 시나리오를 통해 네 도구의 협업을 보자:

```
[사전 예방]  Inspector: "이 EC2의 OpenSSL이 critical CVE에 취약 + 인터넷 도달 가능"
                 │ (Security Hub 집계 — 우선순위 패치 대상)
                 ▼ (패치 전에 공격받음)
[탐지]       GuardDuty: "UnauthorizedAccess:EC2/SSHBruteForce → 이후 비정상 아웃바운드"
                 │ (Security Hub 집계, severity High)
                 ▼
[조사]       Detective: "이 인스턴스의 역할이 새 지역에서 IAM API 정찰 시작,
                          같은 IP가 다른 인스턴스와도 통신 — 횡적 이동 의심"
                 ▼
[대응]       Security Hub → EventBridge → Lambda/SSM:
                 인스턴스 격리 SG 이동 + 포렌식 스냅샷 + 자격증명 회수 + 티켓
```

- **Inspector**가 약점을 미리 표시(패치 우선순위).
- **GuardDuty**가 실제 공격을 탐지.
- **Detective**가 근본 원인·영향 범위를 조사.
- **Security Hub**가 이 모두를 한 화면에 모으고, **EventBridge**로 자동 대응을 트리거.

> ⚠️ **함정**: GuardDuty·Inspector 핀딩은 Security Hub에 **자동 통합**되지만, 통합을 *활성화*해야 한다(integration 켜기). 또 Security Hub가 *조사*를 하지 않고(그건 Detective), *위협 탐지*를 직접 하지 않는다(그건 GuardDuty/Inspector). Security Hub는 *집계·표준화·자동화 오케스트레이션*이다. 역할 혼동은 단골 함정이다.

## Security Hub Insights와 상관

Security Hub **Insights**는 핀딩을 특정 기준으로 그룹핑한 *저장된 필터/상관 뷰*다. 예: "퍼블릭으로 노출된 + critical severity + 특정 계정"의 핀딩을 모아 추세를 본다. 관리형 Insight도 있고 커스텀도 만든다. 이는 수천 개 핀딩에서 "지금 가장 위험한 것"을 추려내는 상관 도구다.

또 Security Hub의 **automation rules**는 핀딩 속성에 따라 자동으로 severity 조정·억제·필드 갱신을 한다(예: 알려진 테스트 계정의 핀딩은 자동 억제). 이는 경보 피로를 줄이는 운영 장치다.

```bash
# 개발 계정의 MEDIUM 이하 핀딩은 자동 억제 (노이즈 절감)
aws securityhub create-automation-rule \
  --rule-name suppress-dev-noise \
  --rule-order 1 \
  --rule-status ENABLED \
  --description "개발 계정의 중간 이하 핀딩 자동 억제" \
  --criteria '{
    "AwsAccountId": [{"Value":"444455556666","Comparison":"EQUALS"}],
    "SeverityLabel": [{"Value":"MEDIUM","Comparison":"EQUALS"},
                      {"Value":"LOW","Comparison":"EQUALS"}]
  }' \
  --actions '[{
    "Type":"FINDING_FIELDS_UPDATE",
    "FindingFieldsUpdate":{
      "Workflow":{"Status":"SUPPRESSED"},
      "Note":{"Text":"dev 계정 자동 억제 규칙","UpdatedBy":"automation-rule"}
    }
  }]'

# 반대로: 프로덕션 태그가 붙은 리소스의 핀딩은 심각도를 올려 앞으로 끌어낸다
aws securityhub create-automation-rule \
  --rule-name escalate-prod \
  --rule-order 2 --rule-status ENABLED \
  --description "프로덕션 리소스 핀딩 심각도 상향" \
  --criteria '{
    "ResourceTags": [{"Key":"Env","Value":"prod","Comparison":"EQUALS"}],
    "SeverityLabel": [{"Value":"HIGH","Comparison":"EQUALS"}]
  }' \
  --actions '[{"Type":"FINDING_FIELDS_UPDATE",
               "FindingFieldsUpdate":{"Severity":{"Label":"CRITICAL"}}}]'
```

> ⚠️ **함정**: automation rules는 **핀딩이 들어오는 시점에 적용**되며 `rule-order` 순서대로 평가된다. 이미 저장된 과거 핀딩을 소급해 바꾸지 않는다 — 그건 `batch-update-findings`로 따로 해야 한다. 또 억제 규칙을 넓게 걸면 "조용해졌으니 안전해졌다"는 착시가 생긴다. 억제는 **정확히 무엇을, 왜 접었는지가 문서화될 때만** 운영 개선이고, 그렇지 않으면 탐지를 끈 것과 같다. `Note` 필드를 반드시 채우는 이유가 이것이다.

> 🎯 **시나리오**: "핀딩이 하루 수천 건이라 분석가가 아무것도 처리하지 못한다. 노이즈를 줄이되 사각지대는 만들지 마라"가 나오면 답은 **자동화 규칙으로 억제/상향 + Insights로 상위 위험 추출**이다. 여기서 오답 후보는 두 가지다. (1) "GuardDuty Trusted IP list에 넣는다" — 그건 핀딩을 *만들지 않으므로* 사각지대를 만든다. (2) "통합을 꺼서 핀딩 유입을 줄인다" — 원천 가시성을 버리는 선택이다. 정답의 형태는 항상 **핀딩은 다 받되, 우선순위로 접는다**이다.

## 멀티계정 탐지 베이스라인: 한 장의 청사진

엔터프라이즈 멀티계정에서 탐지 베이스라인의 권장 구성:

```
AWS Organizations
  │
  ├─ 관리 계정(management) — 위임만, 운영 부담 최소화
  │
  ├─ Security Tooling 계정 ◀── 모든 탐지 서비스의 위임 관리자 정렬
  │     ├─ GuardDuty 위임 관리자 (조직 + auto-enable)
  │     ├─ Security Hub 위임 관리자 (조직 + 표준 + 집계)
  │     ├─ Detective 위임 관리자 (단일 동작 그래프)
  │     ├─ Inspector 위임 관리자 (EC2/ECR/Lambda 지속 스캔)
  │     ├─ Macie / IAM Access Analyzer 위임 관리자
  │     └─ 중앙 EventBridge 버스 → 대응 자동화(Lambda/SSM/Step Functions)
  │
  ├─ Log Archive 계정 — CloudTrail/Config/로그 불변 보관(write-once)
  │
  └─ 워크로드 계정들 — 탐지 멤버(끄지 못함), 핀딩은 Security Tooling로 흐름
```

핵심 원칙:
- **모든 탐지 서비스의 위임 관리자를 동일한 Security Tooling 계정으로 정렬**한다(데이터·권한·조사 경험의 일관성).
- **auto-enable**로 신규 계정을 자동 포함 — 사각지대 없음.
- **Security Hub 크로스리전 집계(aggregation Region)**로 여러 리전 핀딩을 단일 리전에서 본다.
- **로그는 별도 Log Archive 계정에 불변 보관**(탐지 계정과 분리 — 권한 분리).

> 💡 **관련 이론**: 이는 AWS *Security Reference Architecture(SRA)*의 핵심 패턴이다. 보안 도구를 워크로드와 분리된 전용 계정에 위임하면 *권한 분리(separation of duties)*가 성립한다 — 워크로드 팀이 자기 탐지를 끄거나 핀딩을 지울 수 없고, 로그는 침해자가 닿지 못하는 별도 계정에 불변 보관된다. SRA는 "관리 계정에는 운영 부담을 지우지 말고 위임하라"를 강조하는데, 관리 계정은 조직 루트 권한이 집중되어 가장 보호해야 할 대상이기 때문이다.

> ⚠️ **함정**: Security Hub 핀딩은 **리전별**이다. 멀티리전 환경에서 한 리전 콘솔만 보면 다른 리전 위협을 놓친다 — **aggregation Region(집계 리전)**을 지정해 크로스리전 집계를 켜야 한다. 또 위임 관리자 지정은 *각 서비스마다* 해야 한다(GuardDuty 위임 따로, Security Hub 위임 따로). 한 번에 전부 위임되지 않는다.

### 베이스라인을 CLI로 세우기

```bash
# 1) Security Hub 켜기 + 기본 표준(FSBP 등) 자동 활성화
aws securityhub enable-security-hub --enable-default-standards

# 2) (관리 계정) Security Hub 위임 관리자 지정 — GuardDuty와 같은 계정으로
aws securityhub enable-organization-admin-account --admin-account-id 999988887777

# 3) (위임 관리자) 조직 계정 자동 등록
aws securityhub update-organization-configuration --auto-enable --auto-enable-standards DEFAULT

# 4) (집계 리전에서 실행) 모든 리전 핀딩을 이 리전으로 모은다
aws securityhub create-finding-aggregator --region-linking-mode ALL_REGIONS

# 5) 지금 조직에서 가장 위험한 것 추리기
aws securityhub get-findings \
  --filters '{
    "SeverityLabel":  [{"Value":"CRITICAL","Comparison":"EQUALS"}],
    "WorkflowStatus": [{"Value":"NEW","Comparison":"EQUALS"}],
    "RecordState":    [{"Value":"ACTIVE","Comparison":"EQUALS"}]
  }' \
  --query 'Findings[].{Acct:AwsAccountId,Product:ProductFields."aws/securityhub/ProductName",
                       Title:Title,Res:Resources[0].Id}'

# 6) 조사 완료 건을 일괄 종결
aws securityhub batch-update-findings \
  --finding-identifiers '[{"Id":"<finding-id>","ProductArn":"<product-arn>"}]' \
  --workflow Status=RESOLVED \
  --note 'Text=인시던트 INC-2026-0314 로 처리 완료,UpdatedBy=soc-analyst'
```

> ⚠️ **함정**: 4번의 `create-finding-aggregator`는 **집계 리전이 될 리전에서 실행해야** 한다. 아무 리전에서나 실행하고 "왜 서울에 안 모이지"라고 묻는 상황이 흔하다. 그리고 집계는 **핀딩을 복사해 오는 것**이지 원본 리전의 Security Hub를 대체하는 것이 아니다 — 각 리전에서 Security Hub 자체는 켜져 있어야 하고, 그래서 "쓰지 않는 리전에도 켠다"는 GuardDuty와 같은 원칙이 여기서도 성립한다.

### 표준 검사(CSPM)는 탐지와 다른 축이다

Security Hub의 두 얼굴 중 자주 과소평가되는 쪽이 **표준 검사**다. CIS Benchmark·AWS 기초 보안 모범 사례(FSBP)·PCI DSS·NIST 800-53 같은 컨트롤 묶음을 켜면, 계정 구성이 각 컨트롤을 통과하는지 지속 평가해 **컨트롤 핀딩**을 만든다. 이 핀딩도 ASFF이지만 결정적으로 다른 필드를 갖는다.

```json
{
  "ProductArn": "arn:aws:securityhub:ap-northeast-2::product/aws/securityhub",
  "Types": ["Software and Configuration Checks/Industry and Regulatory Standards/AWS-Foundational-Security-Best-Practices"],
  "Title": "S3.8 S3 general purpose buckets should block public access",
  "Severity": { "Label": "HIGH", "Normalized": 70 },
  "Compliance": { "Status": "FAILED", "SecurityControlId": "S3.8" },
  "Resources": [{ "Type": "AwsS3Bucket", "Id": "arn:aws:s3:::prod-uploads" }],
  "Workflow": { "Status": "NEW" },
  "RecordState": "ACTIVE"
}
```

`Compliance.Status`(PASSED/FAILED/WARNING/NOT_AVAILABLE)와 `SecurityControlId`가 위협 핀딩에는 없는 필드다. 즉 **"공격이 있었다"가 아니라 "구성이 기준에서 벗어났다"**를 말한다. 대응도 다르다 — 온콜 호출이 아니라 구성 교정이다.

| 축 | 위협 핀딩(GuardDuty 등) | 컨트롤 핀딩(표준 검사) |
|----|------------------------|------------------------|
| 무엇을 말하나 | 사건이 일어났다 | 구성이 기준을 벗어났다 |
| 핵심 필드 | `Types: TTPs/...`, `Severity` | `Compliance.Status`, `SecurityControlId` |
| 사라지는 조건 | 활동이 멈추면 아카이브 | **고칠 때까지 계속 FAILED** |
| 대응 주체 | SOC·온콜 | 플랫폼·워크로드 팀 |
| 지표 성격 | 사건 수 | **준수율(%)** — 추세로 관리 |

> 💡 **관련 이론**: 이 두 축이 각각 *탐지(detection)*와 *태세 관리(posture management, CSPM)*다. 태세 관리는 "공격이 없어도 존재하는 위험"을 다루므로 지표가 사건 수가 아니라 **준수율**이고, 개선이 선형적으로 측정된다. 반대로 탐지 지표를 준수율처럼 다루면(핀딩 0건을 목표로 삼으면) 억제·비활성화라는 잘못된 최적화가 일어난다. **두 축은 같은 화면에 모여 있지만 다른 KPI로 관리해야 한다** — 통합 대시보드를 운영할 때 가장 먼저 무너지는 원칙이 이것이다.

> 📚 **사례**: 대형 클라우드 침해의 사후 보고서에서 반복되는 문장이 있다 — "관련 신호는 이미 로그에 있었다." 2019년 Capital One 사건에서도 침해 자체보다 *외부 제보로 알게 되기까지 걸린 시간*이 문제로 지적됐고, 2020년 SolarWinds 공급망 공격도 결국 한 보안 기업이 자사 환경에서 이상을 발견하면서 드러났다. 두 사건의 공통 교훈은 도구의 부재가 아니라 **신호가 사람에게 도달하는 경로의 부재**다. 탐지기가 핀딩을 만들어도, 그것이 정규화되지 않아 우선순위를 매길 수 없고, 여러 콘솔에 흩어져 상관되지 않으며, 자동으로 대응 큐에 들어가지 않으면 — 실질적으로 탐지하지 않은 것과 같다. Security Hub 중심 통합의 존재 이유가 "화면이 하나라서 편하다"가 아니라 **"신호가 사람과 자동화에 닿는 경로를 하나로 보장한다"**는 데 있다는 점을 이 사례들이 말해 준다.

## 핀딩에서 대응까지: 통합 자동화

통합 아키텍처의 출구는 항상 *자동 대응*이다:

```
Security Hub(집계) ──▶ EventBridge(custom event bus)
                          ├─▶ Lambda: 리소스 격리/태깅/자격증명 회수
                          ├─▶ SSM Automation: 패치/구성 교정
                          ├─▶ Step Functions: 다단계 대응 워크플로
                          ├─▶ SNS: 온콜 알림(Slack/PagerDuty)
                          └─▶ Jira/ServiceNow: 티켓 생성
```

Security Hub는 모든 통합 서비스의 핀딩을 단일 EventBridge 스트림으로 발행하므로, *하나의* 대응 자동화로 여러 탐지기를 커버할 수 있다 — 도구마다 자동화를 따로 짤 필요가 없다(통합의 운영 이득).

전체 배선을 한 장으로 그리면 다음과 같다. 이것이 week9가 도달하는 그림이다.

```
[ 탐지 4종 → ASFF 집계 → 대응 파이프라인 : 전체 배선 ]

  ┌─────────────── 워크로드 계정들 (멤버, 끄지 못함) ───────────────┐
  │                                                                  │
  │  GuardDuty        Inspector        Macie        Access Analyzer  │
  │  (위협 행위)      (취약점)        (민감데이터)  (외부 노출 권한) │
  │      │                │               │               │          │
  └──────┼────────────────┼───────────────┼───────────────┼──────────┘
         │                │               │               │
         └────────┬───────┴───────┬───────┴───────┬───────┘
                  ▼               ▼               ▼
        ┌───────────────────────────────────────────────────┐
        │   Security Hub (Security Tooling 계정, 위임 관리자) │
        │   ├─ ASFF 정규화: ProductArn / Types / Severity     │
        │   │                Normalized(0–100) / Resources    │
        │   ├─ 표준 검사(CSPM): Compliance.Status·ControlId   │
        │   ├─ automation rules: 억제·상향·필드 갱신          │
        │   ├─ Insights: 상관 뷰                              │
        │   └─ finding aggregator: 전 리전 → 집계 리전        │
        └───────────────────────┬───────────────────────────┘
                                │ 단일 EventBridge 스트림
                                ▼
                    ┌───────────────────────┐
                    │  EventBridge 규칙      │  ← Severity.Normalized·ProductArn·
                    │  (중앙 이벤트 버스)    │     Types·ResourceTags로 분기
                    └───┬────┬────┬────┬────┘
                        │    │    │    │
      가역적 자동조치 ──┘    │    │    └── SNS → 온콜(Slack/PagerDuty)
      Lambda: 격리 SG 이동   │    └─────── Jira/ServiceNow 티켓
              세션 무효화    │
              태깅·스냅샷    └── SSM Automation: 패치·구성 교정
                                Step Functions: 승인 게이트가 필요한 다단계 대응
                                │
                                ▼
                   ┌──────────────────────────┐
                   │ Detective (같은 위임 계정) │ ← 사람의 조사 진입점
                   │ 단일 동작 그래프           │   "왜·어디까지"
                   └──────────────────────────┘

  ┌─ Log Archive 계정 ──────────────────────────────────────────┐
  │  CloudTrail(조직 추적) · Config · VPC Flow → 불변 보관       │
  │  (탐지 계정과 분리 = 침해자도 운영자도 지울 수 없음)          │
  └──────────────────────────────────────────────────────────────┘
```

이 그림에서 시험이 반복해 찌르는 지점은 네 곳이다. (1) **탐지기는 여럿, 집계는 하나** — 도구별 자동화를 각각 짜는 설계는 오답. (2) **위임 관리자는 서비스마다 지정하되 같은 계정으로 정렬** — 분산 위임은 오답. (3) **집계 리전** 없이는 멀티리전 사각지대. (4) **로그는 탐지 계정이 아니라 별도 Log Archive 계정에** — 권한 분리.

> ⚠️ **함정**: 위 다이어그램에서 "자동 조치" 상자에 들어갈 수 있는 것과 없는 것의 기준은 **가역성**이다. 격리 SG로 옮기기·태깅·스냅샷·세션 무효화는 오탐이어도 되돌릴 수 있지만, **인스턴스 종료·볼륨 삭제·역할 삭제**는 되돌릴 수 없고 포렌식 증거까지 파괴한다. 시험에서 "자동 대응 설계" 문항의 오답은 대개 비가역적 조치를 무인 자동화에 넣은 보기다. 비가역 조치는 Step Functions의 승인 단계나 티켓을 경유시켜 **사람을 한 번 거치게** 한다.

> 🔍 **더 깊이**: 통합의 진짜 가치는 "단일 창(single pane of glass)"이라는 구호가 아니라 *상관(correlation)*과 *자동화의 단일화*다. 네 도구를 따로 운영하면 (1) 같은 사건을 네 번 보고, (2) 도구별 자동화를 네 벌 유지하며, (3) 사건의 전체 그림(취약점→공격→영향)을 손으로 짜맞춰야 한다. Security Hub 중심 통합은 ASFF로 상관을, EventBridge로 자동화 단일화를, Detective 연계로 조사 깊이를 한 파이프라인에 묶는다. SCS-C03가 묻는 "best detection architecture"의 답은 거의 항상 *이 통합 패턴 + Security Tooling 계정 위임*이다.

## 자주 틀리는 구분

- **Security Hub vs GuardDuty/Inspector**: 후자는 *탐지기*(핀딩 생성), Security Hub는 *집계기·오케스트레이터*. Security Hub는 직접 위협을 탐지하지 않는다(자체 표준 검사 컨트롤은 예외적으로 평가함).
- **Security Hub vs Detective**: Security Hub는 *집계/표준화*, Detective는 *심층 조사*. 넓고 얕게 vs 좁고 깊게.
- **ASFF**: 핀딩의 *공통 스키마* — 통합·상관·자동화의 전제.
- **위임 관리자 정렬**: 모든 탐지 서비스를 *같은* Security Tooling 계정으로 — 시험의 베이스라인 정답.
- **Security Hub vs Security Lake**: Security Hub는 *핀딩*(판단 결과)을 ASFF로 모으고, Security Lake는 *로그*(원천 데이터)를 OCSF로 모아 외부 분석 도구에 공급한다. "서드파티 SIEM에 원천 로그를 넘겨라"면 Security Lake, "탐지 결과를 한곳에서 우선순위화·자동화하라"면 Security Hub.
- **automation rules vs EventBridge 규칙**: 전자는 Security Hub *안에서* 핀딩 필드를 바꾸는 것(억제·상향), 후자는 핀딩을 *밖으로* 내보내 조치하는 것. 노이즈 정리는 automation rules, 실제 대응은 EventBridge.

## 통합 아키텍처 점검표: 무엇이 빠지면 무엇이 안 보이는가

통합은 "켰다/껐다"가 아니라 여러 전제가 겹쳐 성립한다. 하나라도 빠지면 조용한 사각지대가 생기고, 시험 문제는 정확히 그 빈칸을 짚는다.

| 빠진 것 | 생기는 사각지대 | 증상 |
|---------|-----------------|------|
| 통합(integration) 미활성화 | 그 탐지기의 핀딩이 Security Hub에 안 옴 | "GuardDuty는 뜨는데 Security Hub엔 없다" |
| aggregation Region 미지정 | 다른 리전 핀딩 | "critical을 나중에 알았다" |
| auto-enable 미설정 | 신규 계정 전체 | "새 팀 계정이 탐지 밖에 있었다" |
| 위임 관리자 분산 | 조사 컨텍스트 단절 | "핀딩은 A계정, 그래프는 B계정" |
| Detective 미활성화 | 근본 원인·횡적 이동 | "무슨 일이 있었는지 재구성 불가" |
| 로그를 탐지 계정에 보관 | 권한 분리 실패 | 침해 시 증거 훼손 가능 |
| 비활동 리전 미커버 | 그 리전의 모든 활동 | 미사용 리전에서의 채굴·정찰 |

## 정리하며

오늘의 내용을 한 문장으로 줄이면 **"전문 탐지기가 각자 발견하고, ASFF가 공통어가 되고, EventBridge가 단일 출구가 되며, Security Tooling 계정이 그 모두를 소유한다"**이다.

통합의 값을 오해하지 않는 것이 중요하다. "단일 창"은 결과이지 목적이 아니다. 진짜 이득은 세 가지다. **상관** — 서로 다른 탐지기의 핀딩을 같은 리소스·같은 주체 기준으로 묶을 수 있게 되는 것(Inspector의 취약점과 GuardDuty의 공격이 같은 인스턴스를 가리킬 때 비로소 이야기가 완성된다). **자동화 표면의 단일화** — 탐지기가 늘어나도 대응 파이프라인은 하나로 유지되는 것. **거버넌스** — 워크로드 팀이 탐지를 끌 수 없고 로그를 지울 수 없게 만드는 계정 구조.

그리고 통합의 마지막 조각은 언제나 **가역성 판단**이다. 자동화가 강력해질수록 오탐이 만드는 피해도 커지므로, 무인 자동화에는 되돌릴 수 있는 조치만 넣고 나머지는 사람을 한 번 경유시킨다. day5에서는 이 전체 그림을 시나리오 형태로 다시 통과시킨다.

## 한 줄 요약 체크리스트

- [ ] Security Hub를 켜고 GuardDuty·Inspector·Macie 등 통합을 활성화했는가
- [ ] 모든 탐지 서비스의 위임 관리자를 동일 Security Tooling 계정으로 정렬했는가
- [ ] auto-enable로 신규 계정을 자동 포함, 사각지대를 없앴는가
- [ ] aggregation Region으로 멀티리전 핀딩을 단일 리전에 집계했는가
- [ ] Security Hub → EventBridge로 대응 자동화를 단일화했는가
- [ ] 로그는 별도 Log Archive 계정에 불변 보관해 권한을 분리했는가

---

## 📝 연습 문제

**문제 1.** 보안팀이 GuardDuty, Inspector, Macie의 핀딩을 서로 다른 형식 때문에 따로따로 보고 있어 상관 분석과 자동화가 어렵다. 이들을 표준 형식으로 한곳에 모으고 단일 자동화로 대응하려면?

A) 각 서비스의 콘솔을 북마크해 번갈아 본다  
B) Security Hub를 활성화해 핀딩을 ASFF로 정규화·집계하고 EventBridge로 대응을 단일화한다  
C) Detective로 모든 핀딩을 조사한다  
D) CloudWatch Logs에 모든 핀딩을 저장한다  

**정답: B**  
해설: Security Hub는 통합 서비스들의 핀딩을 공통 스키마인 ASFF로 정규화해 한 화면에 집계하고, 단일 EventBridge 스트림으로 발행해 하나의 자동화로 여러 탐지기를 커버한다. 콘솔 북마크는 통합이 아니고, Detective는 집계가 아닌 심층 조사 도구이며, 단순 로그 저장은 표준화·상관·자동화를 제공하지 않는다.

---

**문제 2.** 50개 계정 조직에서 GuardDuty·Security Hub·Detective·Inspector를 운영할 때 권장되는 멀티계정 베이스라인은?

A) 각 탐지 서비스를 서로 다른 계정에 위임해 분산한다  
B) 모든 탐지 서비스의 위임 관리자를 동일한 Security Tooling 계정으로 정렬하고 auto-enable을 켠다  
C) 모든 탐지 서비스를 관리(management) 계정에서 직접 운영한다  
D) 워크로드 계정마다 개별로 모든 서비스를 켜고 따로 관리한다  

**정답: B**  
해설: AWS SRA 권장 패턴은 GuardDuty·Security Hub·Detective·Inspector 등 모든 탐지 서비스의 위임 관리자를 전용 Security Tooling 계정으로 정렬해 데이터·권한·조사 경험을 일관되게 하고, auto-enable로 신규 계정을 자동 포함하는 것이다. 서비스를 여러 계정에 분산하면 조사가 단절되고, 관리 계정 직접 운영은 루트 권한 집중 계정에 부담을 주며, 계정별 개별 운영은 사각지대를 낳는다.

---

**문제 3.** 멀티리전으로 운영하는 조직이 한 리전 Security Hub 콘솔만 보다가 다른 리전의 critical 핀딩을 놓쳤다. 올바른 구성은?

A) 모든 워크로드를 한 리전으로 이전한다  
B) Security Hub aggregation Region을 지정해 여러 리전의 핀딩을 단일 리전에 크로스리전 집계한다  
C) 리전마다 별도 보안팀을 둔다  
D) GuardDuty만 멀티리전으로 켠다  

**정답: B**  
해설: Security Hub 핀딩은 리전별로 존재하므로, aggregation Region(집계 리전)을 지정해 여러 리전의 핀딩을 단일 리전에서 통합 조회·관리해야 멀티리전 사각지대를 없앤다. 워크로드 이전은 비현실적이고, 리전별 팀 분리는 통합 가시성을 주지 못하며, GuardDuty만 켜는 것은 Security Hub 집계 문제를 해결하지 못한다.

---

**문제 4.** Security Hub의 역할에 대한 설명으로 가장 정확한 것은?

A) 네트워크 트래픽을 직접 검사해 악성 연결을 차단한다  
B) 통합된 탐지 서비스들의 핀딩을 ASFF로 표준화·집계하고 상관·자동화를 오케스트레이션하는 허브이며, 표준 규정 준수 컨트롤도 평가한다  
C) S3의 PII를 분류한다  
D) EBS 볼륨에서 멀웨어를 스캔한다  

**정답: B**  
해설: Security Hub는 GuardDuty·Inspector·Macie 등의 핀딩을 ASFF 공통 스키마로 정규화해 집계하고, Insights·automation rules·EventBridge로 상관과 대응 자동화를 오케스트레이션하며, CIS·FSBP 같은 표준 컨트롤도 평가한다. 트래픽 차단·PII 분류(Macie)·멀웨어 스캔(GuardDuty Malware Protection)은 다른 서비스의 역할이다.

---

**문제 5.** 통합 탐지 아키텍처에서 침해 사건이 발생했을 때 각 서비스의 역할을 올바르게 짝지은 것은?

A) Inspector=조사, GuardDuty=집계, Detective=취약점, Security Hub=차단  
B) Inspector=사전 취약점 식별, GuardDuty=위협 탐지, Detective=근본원인 조사, Security Hub=집계·자동화 오케스트레이션  
C) 모든 서비스가 동일하게 위협을 탐지하고 차단한다  
D) Security Hub=조사, Detective=집계, GuardDuty=취약점, Inspector=차단  

**정답: B**  
해설: 통합 파이프라인에서 Inspector는 악용 가능한 취약점을 사전에 식별하고, GuardDuty는 실제 위협 활동을 탐지하며, Detective는 근본 원인·영향 범위를 조사하고, Security Hub는 이 모두를 집계·표준화하고 EventBridge로 대응을 오케스트레이션한다. 나머지 보기는 역할이 뒤섞이거나 모든 서비스를 동일시해 잘못되었다.

---
