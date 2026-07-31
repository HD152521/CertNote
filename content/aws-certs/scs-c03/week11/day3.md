# Day 3 - Audit Manager와 규정 준수: 증거 자동 수집, 프레임워크(CIS/PCI), Config와 연계

거버넌스를 깔았다면 다음 질문은 "그래서 우리가 규정을 지키고 있다는 것을 어떻게 *증명*하느냐"다. 감사는 본질적으로 *증거 수집·매핑·보고*의 반복 노동이다. **AWS Audit Manager**는 이 과정을 자동화한다 — 미리 정의된 규제 프레임워크의 통제 항목에 AWS 활동·구성 증거를 자동으로 매핑·수집해 감사 준비 보고서를 만든다. 보안 시험에서 Audit Manager는 "지속적 규정 준수 증거를 자동으로 모으는 도구"로 등장하며, Config·CloudTrail·Security Hub와의 *연계*가 핵심이다.

## Audit Manager의 핵심 개념

```
프레임워크(Framework)  ── 규제/표준의 통제 모음 (CIS, PCI-DSS, SOC2, HIPAA, GDPR ...)
  └ 통제(Control)      ── 개별 요구사항 (예: "루트 계정 MFA 활성화")
      └ 데이터 소스      ── 증거를 어디서 가져올지 (Config 규칙, CloudTrail, API 호출, 수동)
평가(Assessment)       ── 특정 프레임워크를 특정 계정/리전 범위에 적용한 실행 단위
  └ 증거(Evidence)     ── 자동/수동으로 수집된 준수 근거 (스냅샷·로그·설정·체크 결과)
평가 보고서             ── 증거를 묶어 감사자에게 제출 가능한 형태로 출력
```

핵심 가치는 **증거의 자동·지속 수집**이다. 감사 직전에 몰아서 스크린샷을 찍는 대신, Audit Manager가 평가 기간 내내 증거를 모아 둔다.

> 💡 **관련 이론**: 이것은 *Continuous Compliance / Compliance as Code*다. 전통적 감사는 시점(point-in-time) 표본 검사였지만, 클라우드에서는 구성·활동이 API로 관측 가능하므로 *지속적 통제 모니터링(Continuous Control Monitoring)*이 가능하다. NIST의 RMF(Risk Management Framework)에서 "지속적 모니터링" 단계를 자동 증거 파이프라인으로 구현하는 셈이다.

## 증거의 네 가지 출처

Audit Manager는 통제마다 어디서 증거를 가져올지 매핑한다. 출처는 크게 넷이다.

1. **AWS Config 규칙 평가 결과**: 리소스 구성의 준수/비준수. "EBS 암호화됨", "S3 퍼블릭 액세스 차단됨" 같은 *구성 증거*. → 탐지적 통제의 핵심 소스.
2. **AWS Security Hub 검사 결과**: CIS·FSBP 등 보안 표준 검사 결과를 증거로 흡수.
3. **AWS CloudTrail 이벤트**: "누가 언제 무엇을 했는가"의 *활동 증거*. 예: 루트 로그인, KMS 키 정책 변경, 보안 그룹 수정.
4. **AWS API 호출 결과(리소스 스냅샷)**: 특정 시점 리소스 상태를 API로 직접 조회한 스냅샷.

여기에 자동으로 못 얻는 항목(물리 보안, 정책 문서, 인적 절차)은 **수동 증거(manual evidence)**로 업로드한다. 실제 감사 준비는 "자동 증거 + 수동 증거"의 합이다.

| 증거 출처 | 증거의 성격 | 답할 수 있는 질문 | 전제 조건 |
|---|---|---|---|
| **Config 규칙 평가** | 구성(configuration) | "이 리소스가 규칙을 지키는 상태인가" | Config 레코더 + 규칙 활성 |
| **Security Hub 검사** | 표준 대비 준수 | "CIS/FSBP 기준에서 통과했는가" | Security Hub 활성 + 표준 구독 |
| **CloudTrail 이벤트** | 활동(activity) | "누가 언제 무엇을 바꿨는가" | CloudTrail 추적 활성 |
| **API 호출 스냅샷** | 시점 상태 | "그 시점 리소스의 실제 설정값은" | 평가 역할의 조회 권한 |
| **수동 증거 업로드** | 문서·절차 | "정책 문서·교육 이수·물리 통제가 있는가" | 사람이 수집·업로드 |

증거의 성격 차이가 시험 판단의 축이다. **구성 증거는 "지금 상태가 옳은가"를, 활동 증거는 "그동안 무슨 일이 있었는가"를 답한다.** 감사자는 대부분 둘 다 요구한다 — "지금 모든 EBS가 암호화되어 있다"만으로는 부족하고 "지난 분기 동안 암호화가 꺼진 적이 없다"까지 보여야 하기 때문이다. 그래서 Config(현재 상태 + 구성 이력)와 CloudTrail(변경 행위)이 함께 켜져 있어야 감사가 성립한다.

> 💡 **관련 이론**: 감사 증거는 법정 증거와 같은 세 가지 성질을 요구받는다 — **완전성(completeness)**, **무결성(integrity)**, **출처 추적성(provenance)**. 완전성은 평가 기간 전체에 빠짐없이 수집됐다는 것(→ Config 레코더가 계속 켜져 있어야 함), 무결성은 수집 후 변조되지 않았다는 것(→ CloudTrail 로그 파일 검증, S3 Object Lock, KMS), 출처 추적성은 이 증거가 어떤 시스템에서 어떻게 생성됐는지 설명 가능하다는 것(→ Audit Manager의 데이터 소스 매핑)이다. Audit Manager의 가치는 스크린샷 대신 이 세 성질을 만족하는 증거 사슬을 자동으로 만든다는 데 있다.

## Config와의 연계: 증거 파이프라인의 토대

Audit Manager의 자동 구성 증거 대부분은 **Config 규칙 평가**에서 나온다. 따라서 다음 선행 조건이 충족돼야 한다:

```
Config 레코더 활성화(전 리전/계정) 
   → Config 규칙(관리형/커스텀) 평가 수행 
   → Audit Manager가 해당 규칙 결과를 통제에 매핑 
   → 평가 기간 내내 준수/비준수 증거 누적
```

Config가 꺼져 있거나 규칙이 없으면 Audit Manager는 그 통제에 대한 자동 구성 증거를 만들 수 없다 — 이것이 시험 함정이다. 즉 **Audit Manager는 Config·CloudTrail·Security Hub가 *먼저* 켜져 있어야 진가를 발휘**한다. Audit Manager는 데이터를 *생성*하는 게 아니라 기존 데이터를 통제 프레임워크 언어로 *번역·집계*한다.

```bash
# 전제: Config 레코더와 규칙이 활성화되어 있어야 함
aws configservice put-configuration-recorder ...
aws configservice put-config-rule --config-rule '{
  "ConfigRuleName": "encrypted-volumes",
  "Source": { "Owner": "AWS", "SourceIdentifier": "ENCRYPTED_VOLUMES" }
}'

# Audit Manager 평가 생성 (프레임워크를 범위에 적용)
aws auditmanager create-assessment \
  --name "PCI-DSS-Q2-2026" \
  --framework-id <PCI_FRAMEWORK_ID> \
  --scope '{ "awsAccounts": [{"id":"111122223333"}], "awsServices": [{"serviceName":"s3"},{"serviceName":"ec2"},{"serviceName":"kms"}] }' \
  --assessment-reports-destination '{ "destinationType":"S3","destination":"s3://audit-reports-bucket/pci/" }' \
  --roles '[{"roleType":"PROCESS_OWNER","roleArn":"arn:aws:iam::111122223333:role/AuditOwner"}]'
```

### Config Rule · Conformance Pack · Audit Manager: 세 층의 역할 분담

이 셋의 관계를 정확히 잡아야 시험에서 흔들리지 않는다. **규칙 하나 → 규칙 묶음 → 규제 언어로의 번역**이라는 세 층으로 이해하면 된다.

| | Config Rule | Conformance Pack | Audit Manager |
|---|---|---|---|
| 단위 | 개별 규칙 1개 | 규칙 + 교정 액션의 **묶음(팩)** | 규제 **프레임워크**(통제 집합) |
| 배포 방식 | 계정·리전별 규칙 생성 | YAML 템플릿을 계정/조직 전역 배포 | 평가(Assessment)를 범위에 적용 |
| 산출물 | COMPLIANT / NON_COMPLIANT | 팩 단위 준수 점수·대시보드 | **감사 제출용 증거 + 보고서** |
| 교정 | 규칙별 SSM Automation 연결 | 팩 안에 교정 정의 포함 가능 | 교정 기능 없음(증거 수집 전용) |
| 조직 배포 | 조직 Config 규칙으로 가능 | 조직 Conformance Pack으로 가능 | 위임 관리자에서 조직 평가 |
| 답이 되는 상황 | "특정 조건 하나를 평가·교정" | "CIS/PCI 규칙 세트를 다계정에 한 번에 배포" | "감사자에게 낼 증거·보고서를 자동화" |

핵심 구분선은 마지막 행이다. **Conformance Pack은 "규칙을 깔아 준수 상태를 만드는" 도구이고, Audit Manager는 "이미 만들어진 준수 상태를 증거로 포장하는" 도구다.** 둘 다 CIS·PCI라는 같은 이름을 달고 나오기 때문에 헷갈리기 딱 좋다. 보기에서 "다계정에 CIS 규칙 세트를 신속히 배포" → Conformance Pack, "CIS 감사 보고서를 분기마다 제출" → Audit Manager로 갈린다.

```yaml
# Conformance Pack 템플릿 발췌 — 규칙 + 자동 교정을 한 묶음으로
Resources:
  S3PublicReadProhibited:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: s3-bucket-public-read-prohibited
      Source:
        Owner: AWS
        SourceIdentifier: S3_BUCKET_PUBLIC_READ_PROHIBITED
  S3PublicReadRemediation:
    Type: AWS::Config::RemediationConfiguration
    Properties:
      ConfigRuleName: s3-bucket-public-read-prohibited
      TargetType: SSM_DOCUMENT
      TargetId: AWS-DisableS3BucketPublicReadWrite
      Automatic: true
      MaximumAutomaticAttempts: 3
      RetryAttemptSeconds: 60
```

> 🔍 **더 깊이**: Conformance Pack은 배포될 때 각 계정에 **Config 규칙 + 교정 구성 + 전용 S3 딜리버리 버킷**을 생성한다. 여기서 흔히 놓치는 제약이 있다 — 팩 안의 규칙은 그 계정·리전의 Config 레코더가 기록하는 리소스 타입만 평가할 수 있다. 비용을 아끼려고 레코더 범위를 특정 리소스 타입으로 좁혀 놓으면, 팩을 배포해도 상당수 규칙이 평가 데이터 없이 `INSUFFICIENT_DATA`로 남는다. 그리고 이 `INSUFFICIENT_DATA`는 Audit Manager로 넘어갈 때 "준수도 비준수도 아닌" 상태가 되어 감사에서 **증거 공백**으로 지적된다. "Config를 켰는데 왜 증거가 비었나"의 두 번째 원인이 바로 이 레코더 범위 축소다.

## 프레임워크: 표준 vs 커스텀

Audit Manager는 **사전 구축 프레임워크**를 다수 제공한다: CIS AWS Foundations Benchmark, PCI-DSS, SOC 2, HIPAA, GDPR, NIST 800-53, FedRAMP, AWS Well-Architected 등. 각 프레임워크는 통제 목록과 권장 데이터 소스 매핑을 이미 갖고 있다.

- **CIS AWS Foundations Benchmark**: IAM·로깅·모니터링·네트워킹의 인프라 위생 통제. AWS 환경에 가장 직접 매핑된다.
- **PCI-DSS**: 카드 데이터 보호. 암호화, 접근 통제, 로깅, 네트워크 분리 등. 다수가 Config 규칙으로 자동 증거화되지만, 일부(물리·정책)는 수동 증거 필요.

**커스텀 프레임워크**는 표준 통제를 조합하거나 자체 통제를 정의해 만든다. 내부 보안 정책이나 특정 계약 요건을 코드화할 때 쓴다. 표준 프레임워크의 통제를 복제·수정해 자사 환경에 맞춘다.

커스텀 통제를 만들 때 지정하는 것은 결국 **"이 요구사항의 증거를 어디서 가져올 것인가"**의 매핑이다.

```bash
# 커스텀 통제 정의: Config 규칙 2개 + CloudTrail 이벤트 1개를 증거원으로 매핑
aws auditmanager create-control \
  --name "INT-SEC-014-RootAccountHygiene" \
  --description "루트 계정에 MFA가 있고 액세스 키가 없으며 로그인이 감시된다" \
  --testing-information "루트 MFA 상태, 루트 액세스 키 존재 여부, 루트 로그인 이벤트를 확인" \
  --action-plan-title "루트 계정 위생 조치" \
  --action-plan-instructions "MFA 미설정 시 하드웨어 토큰 등록, 액세스 키 발견 시 즉시 삭제" \
  --control-mapping-sources '[
    {
      "sourceName": "root-mfa-enabled",
      "sourceSetUpOption": "System_Controls_Mapping",
      "sourceType": "AWS_Config",
      "sourceKeyword": {"keywordInputType":"SELECT_FROM_LIST","keywordValue":"ROOT_ACCOUNT_MFA_ENABLED"},
      "sourceFrequency": "DAILY"
    },
    {
      "sourceName": "no-root-access-key",
      "sourceSetUpOption": "System_Controls_Mapping",
      "sourceType": "AWS_Config",
      "sourceKeyword": {"keywordInputType":"SELECT_FROM_LIST","keywordValue":"IAM_ROOT_ACCESS_KEY_CHECK"},
      "sourceFrequency": "DAILY"
    },
    {
      "sourceName": "root-console-login",
      "sourceSetUpOption": "System_Controls_Mapping",
      "sourceType": "AWS_Cloudtrail",
      "sourceKeyword": {"keywordInputType":"SELECT_FROM_LIST","keywordValue":"ConsoleLogin"},
      "sourceFrequency": "DAILY"
    }
  ]'

# 커스텀 통제들을 묶어 커스텀 프레임워크 생성
aws auditmanager create-assessment-framework \
  --name "Internal-Security-Standard-2026" \
  --compliance-type "INTERNAL" \
  --control-sets '[{
    "name": "IAM 및 계정 위생",
    "controls": [{"id":"<control-id-1>"},{"id":"<control-id-2>"}]
  }]'

# 표준 프레임워크를 복제해 자사 환경에 맞게 수정하는 경로
aws auditmanager list-assessment-frameworks --framework-type Standard
aws auditmanager get-assessment-framework --framework-id <id>
```

이 CLI가 드러내는 사실이 하나 있다. `sourceType`이 `AWS_Config` 또는 `AWS_Cloudtrail`이라는 것은 곧 **Audit Manager가 증거 생산자가 아니라 증거 소비자**라는 구조적 선언이다. 소스가 비어 있으면 통제는 껍데기만 남는다.

```bash
# 수집된 증거 확인 및 수동 증거 보완
aws auditmanager get-evidence-folders-by-assessment \
  --assessment-id <assessment-id> --max-results 50

aws auditmanager batch-import-evidence-to-assessment-control \
  --assessment-id <assessment-id> \
  --control-set-id "IAM 및 계정 위생" \
  --control-id <control-id> \
  --manual-evidence '[{"s3ResourcePath":"s3://audit-manual-evidence/2026Q2/security-training-completion.pdf"}]'

# 감사 보고서 생성 → 지정한 S3로 출력
aws auditmanager create-assessment-report \
  --name "PCI-DSS-2026Q2-Report" \
  --description "2026년 2분기 PCI-DSS 감사 제출본" \
  --assessment-id <assessment-id>
```

> ⚠️ **함정**: 평가(Assessment)는 **생성 시점에 지정한 범위(계정·서비스)에 대해서만** 증거를 모은다. 분기 중간에 새 계정이 조직에 들어오거나 새 서비스를 도입했는데 평가 범위를 갱신하지 않으면, 그 대상은 증거가 전혀 없는 채로 감사 기간이 끝난다. 더 나쁜 것은 보고서에 "비준수"로 나오는 게 아니라 **아예 나타나지 않는다**는 점이다 — 감사자가 발견하면 통제 누락이 아니라 감사 범위 신뢰성 문제로 번진다. 계정 발급 파이프라인(AFT/CfCT)에 "평가 범위 갱신" 단계를 넣는 것이 실무 해법이다.

## 멀티계정 감사: 위임 관리자

Audit Manager도 Organizations와 통합해 **위임 관리자 계정**(통상 Audit 계정)에서 조직 전역 평가를 운영한다. 그러면 한 평가가 여러 계정의 증거를 집계한다.

```bash
# 관리 계정에서 Audit Manager 위임 관리자 등록
aws auditmanager register-account \
  --delegated-admin-account 222233334444
```

이로써 어제(중앙 보안 계정 모델)와 일관되게 — GuardDuty·Security Hub·Config·Audit Manager가 모두 동일한 Audit 계정에서 위임 운영되어 증거·탐지·보고가 한곳에 모인다.

> 💡 **관련 이론**: 증거를 단일 *권한 분리된* 계정에 집중하는 것은 *감사 추적의 무결성* 요구(증거를 평가 대상이 직접 조작하지 못하게) 때문이다. 평가 대상 계정과 증거 보관·평가 계정을 분리하면, 비준수를 감추기 위한 증거 변조 경로를 구조적으로 차단한다.

## 증거 보호와 보고

수집된 증거는 평가 설정 시 지정한 S3 버킷에 저장되며 KMS로 암호화한다. 증거 자체는 변경 불가에 가깝게 다뤄야 하므로 Log Archive 계정의 불변 패턴(Object Lock 등)과 결합하는 것이 좋다. 평가 보고서는 PDF/CSV로 출력해 감사자에게 제출한다.

증거 파이프라인 전체를 하나로 그리면 이렇게 된다.

```
[ 워크로드 계정들 ]
   │ 리소스 구성 변경        │ API 호출
   ▼                        ▼
AWS Config 레코더        CloudTrail (조직 추적)
   │ 규칙 평가               │ 이벤트
   ▼                        │
Config Rules /              │        Security Hub
Conformance Packs           │        (CIS·FSBP 검사)
   │ COMPLIANT/NON_COMPLIANT│             │ findings
   └────────────┬───────────┴─────────────┘
                ▼
      ┌──────────────────────────────────┐
      │  Audit 계정 (위임 관리자)          │
      │  AWS Audit Manager               │
      │   · 프레임워크 통제 ← 증거 매핑    │
      │   · 평가 기간 내내 증거 누적       │
      │   + 수동 증거(정책문서·교육이수)   │
      └───────────────┬──────────────────┘
                      ▼
      평가 보고서(PDF/CSV) ──▶ S3 (KMS 암호화)
                                 └─ Object Lock / 버전 관리 / 접근 제한
                                          │
                                          ▼
                                   외부 감사자 제출

주의: 평가 대상 계정의 관리자는 이 경로의 증거를 수정·삭제할 수 없어야 한다.
```

> 🎯 **시나리오**: 외부 감사자가 "지난 12개월 동안 프로덕션 RDS의 저장 시 암호화가 한 번이라도 해제된 적이 있는지 증명하라"고 요구했다. 현재 Config 규칙은 모두 COMPLIANT이고 Audit Manager 평가는 3개월 전에 만들었다. 무엇이 문제이고 어떻게 답하는가. → 현재 상태가 COMPLIANT라는 것은 *지금 시점의 구성 증거*일 뿐 12개월 이력을 증명하지 못한다. 필요한 것은 ① **Config 구성 이력(configuration item timeline)** — 해당 리소스의 속성 변경 이력을 기간으로 조회, ② **CloudTrail 이벤트** — `ModifyDBInstance` 등 변경 행위의 존재 여부, ③ 그리고 이 두 소스가 **12개월 전부터 켜져 있었는지**. 평가를 3개월 전에 만들었다면 Audit Manager 자동 증거는 3개월치뿐이므로, 그 이전 구간은 Config 이력·CloudTrail 로그에서 직접 추출해 수동 증거로 보완해야 한다. 이 상황의 진짜 교훈은 **감사 요구가 오기 전에 증거 수집을 켜 두어야 한다**는 것 — 나중에 소급해서 만들 수 없는 유일한 자산이 로그다.

> 📚 **사례**: 미국 통화감독청(OCC)은 2020년 8월 **Capital One에 8천만 달러의 민사 제재금**을 부과했다. 표면적 계기는 2019년의 대규모 데이터 유출(잘못 구성된 방화벽에 대한 SSRF로 EC2 인스턴스 메타데이터의 IAM 역할 자격증명을 획득해 S3 데이터를 열람한 사건)이었지만, OCC가 문제 삼은 것은 유출 자체보다 **클라우드 마이그레이션 과정에서 위험 평가와 내부 통제 모니터링이 미흡했고, 내부 감사가 그 미흡함을 식별·보고하지 못했다**는 점이었다. 즉 규제기관의 관심사는 "사고가 났는가"가 아니라 "통제가 설계되고 지속적으로 검증되고 있음을 증명할 수 있는가"였다. 이것이 Audit Manager 같은 지속적 증거 수집 도구가 규제 산업에서 선택이 아닌 이유다 — 통제가 존재했다는 사실만으로는 부족하고, 통제가 *작동하고 있었음*을 기간 단위로 보여야 한다.

> 🎯 **시나리오**: 조직에 계정이 120개 있고, 감사 대상은 그중 카드 데이터를 다루는 12개 계정뿐이다. 감사 비용과 노이즈를 줄이면서 PCI 범위를 명확히 하려 한다. 어떻게 설계하는가. → ① 카드 데이터 계정을 **전용 OU(예: OU: PCI-Scope)** 로 분리해 네트워크·권한 경계를 물리적으로 좁힌다. ② Audit Manager 평가의 `scope.awsAccounts`를 그 12개 계정으로 한정한다. 조직 전역 평가는 증거가 폭증하고 감사 범위(scope) 자체가 모호해져 오히려 불리하다. ③ 해당 OU에 PCI 전용 Conformance Pack과 강화된 SCP(리전 제한, 암호화 강제)를 걸어 준수 상태를 먼저 만든다. ④ 범위 밖 계정에서 카드 데이터 계정으로의 접근 경로를 SCP·RCP로 차단해 **범위 축소(scope reduction)** 를 증명 가능하게 만든다. PCI 감사에서 가장 값싼 통제는 언제나 "범위를 줄이는 것"이다.

## 다른 서비스와의 역할 구분 (혼동 방지)

| 서비스 | 역할 | "이 서비스가 답인 경우" |
|---|---|---|
| **Config** | 리소스 구성을 기록·평가(준수/비준수) | "구성이 규칙을 지키는지 *탐지/평가*" |
| **Security Hub** | 보안 표준 검사·findings 집계 | "보안 점수·통합 findings 대시보드" |
| **Audit Manager** | 규제 프레임워크에 증거 자동 매핑·*감사 보고서* | "감사자에게 제출할 *증거/보고서* 자동화" |
| **CloudTrail** | API 활동 로그(누가·언제·무엇) | "활동 추적·포렌식 원천 로그" |

시험은 이 구분을 집요하게 묻는다. "감사 준비를 위한 증거를 *자동 수집·보고*" → Audit Manager. "리소스가 규칙을 지키는지 *평가*" → Config. "보안 findings *집계·점수*" → Security Hub.

## 함정 정리

- Audit Manager는 증거를 *생성*하지 않는다 — Config·CloudTrail·Security Hub가 먼저 켜져 있어야 자동 증거가 모인다.
- 모든 통제가 자동화되지 않는다. 물리·정책·절차는 *수동 증거* 업로드가 필요하다.
- Config 비활성 상태면 구성 증거가 비어 평가가 불완전해진다.
- 조직 전역 감사는 *위임 관리자* 계정에서 운영해 증거를 집계·격리한다.
- "평가/탐지"는 Config, "증거/보고서"는 Audit Manager — 역할 혼동이 단골 오답.
- Conformance Pack은 *규칙을 배포*하고, Audit Manager는 *증거를 포장*한다. 이름이 같아도(CIS/PCI) 역할이 다르다.
- Config 레코더 범위를 좁히면 규칙이 `INSUFFICIENT_DATA`가 되고, 이것이 감사에서 *증거 공백*으로 지적된다.
- 평가는 *생성 시 지정한 범위*만 본다 — 신규 계정·서비스는 범위를 갱신하지 않으면 아예 나타나지 않는다.
- 현재 상태 COMPLIANT는 *기간 증명*이 아니다. 이력 증명에는 Config 구성 이력 + CloudTrail이 필요하다.
- 로그·증거는 소급 생성이 불가능하다 — 감사 요구가 오기 전에 켜 둔 것만 증거가 된다.

## 한 줄 요약 체크리스트

- [ ] Config 레코더가 **모든 대상 계정·리전**에서, **필요한 리소스 타입 전부**를 기록하는가
- [ ] CloudTrail 조직 추적이 다중 리전 + 로그 파일 검증으로 켜져 있는가
- [ ] Security Hub 표준(CIS/FSBP)을 구독해 검사 결과를 증거원으로 확보했는가
- [ ] Audit Manager를 Audit 계정에 위임해 평가 대상과 증거 보관을 분리했는가
- [ ] 평가 범위(계정·서비스)를 신규 계정 발급 파이프라인과 동기화하는 절차가 있는가
- [ ] 자동화 불가 통제(물리·정책·교육)의 수동 증거 업로드 담당자와 주기가 정해져 있는가
- [ ] 증거·보고서 S3 버킷이 KMS 암호화 + 버전 관리 + Object Lock + 최소 권한으로 보호되는가
- [ ] "규칙 배포는 Conformance Pack, 증거·보고는 Audit Manager"를 구분해 도구를 골랐는가
- [ ] 감사 범위를 전용 OU로 좁혀 증명 부담과 노이즈를 줄였는가
- [ ] 기간 증명이 필요한 통제에 대해 Config 구성 이력과 CloudTrail 보존 기간이 충분한가

## 📝 연습 문제

**문제 1.** 감사팀이 PCI-DSS 감사를 위해 분기마다 수작업으로 스크린샷과 설정을 모아 왔다. 이를 자동화하려 한다. 가장 적절한 서비스는?

A) AWS Config만 사용  
B) AWS Audit Manager로 PCI-DSS 프레임워크 평가를 만들고 Config·CloudTrail·Security Hub 증거를 자동 수집·보고  
C) CloudTrail만 사용  
D) GuardDuty  

**정답: B**  
해설: 규제 프레임워크의 통제에 증거를 자동 매핑·수집하고 감사 보고서까지 만드는 것은 Audit Manager의 핵심 용도다. PCI-DSS 사전 구축 프레임워크로 평가를 만들면 Config·CloudTrail·Security Hub의 데이터가 통제별 증거로 누적된다. Config·CloudTrail 단독은 증거 원천일 뿐 프레임워크 매핑·보고를 하지 않고, GuardDuty는 위협 탐지로 감사 보고와 무관하다.

---

**문제 2.** Audit Manager 평가를 만들었는데 다수 통제의 자동 구성 증거가 비어 있다. 가장 가능성 높은 원인은?

A) Audit Manager가 증거를 직접 생성하지 못해서  
B) AWS Config 레코더/규칙이 비활성 상태라 구성 증거의 원천이 없어서  
C) 프레임워크가 잘못 선택돼서  
D) S3 버킷이 암호화되어서  

**정답: B**  
해설: Audit Manager의 자동 구성 증거는 Config 규칙 평가 결과에서 나온다. Config가 꺼져 있거나 규칙이 없으면 매핑할 데이터가 없어 통제 증거가 비게 된다. Audit Manager는 데이터를 생성하지 않고 기존 데이터를 번역·집계하므로, 선행 서비스 활성화가 전제다. 프레임워크 선택 오류나 버킷 암호화는 이 증상의 일반적 원인이 아니다.

---

**문제 3.** 물리 데이터센터 보안과 직원 보안 교육 이수 같은 통제는 어떻게 Audit Manager 평가에 반영하는가?

A) Config 규칙으로 자동 수집  
B) 자동 수집이 불가하므로 수동 증거(manual evidence)로 문서를 업로드  
C) CloudTrail 이벤트로 수집  
D) 반영할 수 없다  

**정답: B**  
해설: AWS API로 관측 불가능한 물리 보안·인적 절차·정책 문서는 자동 증거로 모을 수 없으므로 수동 증거로 업로드한다. 실제 감사 준비는 자동 증거와 수동 증거의 합이다. Config·CloudTrail은 AWS 구성·활동만 다루므로 이 항목을 수집하지 못하고, 반영할 수 없다는 설명은 틀렸다.

---

**문제 4.** 조직 전역 다계정 감사 증거를 한곳에 집계하고 평가 대상이 증거를 조작하지 못하게 하려 한다. 가장 적절한 설계는?

A) 각 계정에서 개별 Audit Manager 평가를 따로 운영  
B) Audit Manager 위임 관리자를 Audit 계정으로 등록해 조직 전역 평가를 그 계정에서 운영하고 증거를 격리·집계  
C) 관리 계정에서 모든 평가를 운영  
D) 워크로드 계정마다 증거를 로컬 저장  

**정답: B**  
해설: 위임 관리자(통상 Audit 계정)에서 조직 전역 평가를 운영하면 증거를 한곳에 집계하면서 평가 대상 계정과 증거 보관·평가 계정을 분리해 증거 변조 경로를 차단한다. 이는 GuardDuty·Security Hub·Config 위임 모델과도 일관된다. 계정별 분산 운영은 집계·무결성을 잃고, 관리 계정 집중은 공격 표면을 키우며, 로컬 저장은 탈취 시 함께 조작·삭제될 위험이 있다.

---

**문제 5.** 다음 설명 중 서비스 역할 매칭이 옳은 것은?

A) "리소스 구성이 규칙을 지키는지 평가" → Audit Manager  
B) "감사자 제출용 증거를 프레임워크별로 자동 수집·보고" → Audit Manager  
C) "API 활동 로그를 누가·언제 남겼는지 기록" → Config  
D) "위협 행위를 탐지" → Audit Manager  

**정답: B**  
해설: 규제 프레임워크별 증거를 자동 수집해 감사 보고서를 만드는 것은 Audit Manager의 고유 역할이다. 리소스 구성 평가는 Config, API 활동 기록은 CloudTrail, 위협 탐지는 GuardDuty의 몫이므로 나머지는 서비스 매칭이 어긋난다. 시험은 이 네 서비스의 역할 경계를 자주 묻는다.

---
