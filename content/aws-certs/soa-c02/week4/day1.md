# Day 1 - CloudTrail: API 감사 로그의 설계 원칙과 Organization Trail

새벽 4시, 보안팀에서 전화가 온다. "어떤 IAM 계정이 프로덕션 S3 버킷을 퍼블릭으로 열었어요. 누가 했는지 추적할 수 있나요?" 이 순간 CloudTrail이 켜져 있느냐 없느냐, Trail이 S3에 저장돼 있느냐 없느냐, Log File Validation이 활성화돼 있느냐 없느냐가 사건의 해결 여부를 결정한다. CloudTrail은 AWS에서 일어나는 모든 API 호출의 감사 로그다. 운영자의 관점에서 이 서비스의 설계 원칙과 실무 패턴을 이해하는 것이 오늘의 목표다.

## 감사 로깅의 이론적 배경: Non-repudiation과 Append-only

감사 로그의 가장 중요한 속성 두 가지는 **Non-repudiation(부인 방지)**과 **Tamper-evidence(변조 감지)**다.

Non-repudiation은 암호학 용어다. "나는 그 행위를 하지 않았다"는 주장을 기술적으로 반박할 수 있어야 한다. 디지털 서명이 이 속성을 제공한다. CloudTrail에서는 IAM 자격증명(accessKeyId, sessionToken, userAgent)이 모든 이벤트에 포함되어 "이 자격증명으로 이 API가 호출됐다"는 사실을 입증한다.

Tamper-evidence는 로그가 변조됐음을 감지할 수 있어야 한다는 속성이다. CloudTrail Log File Validation이 SHA-256 해시 체인으로 이를 구현한다.

> 💡 **관련 이론**: 감사 로깅 요구사항은 ISO 27001 A.12.4(Logging and Monitoring), NIST SP 800-92(Guide to Computer Security Log Management), SOC 2 CC7.2(System Operations), PCI-DSS Requirement 10(Track and Monitor) 등 주요 컴플라이언스 프레임워크 모두에서 명시적으로 요구한다. "누가 언제 무엇을 했는가"는 보안 사고 대응, 법적 분쟁, 규제 감사의 공통 요구사항이다.

## CloudTrail이 기록하는 것과 기록하지 않는 것

CloudTrail은 **AWS API 호출**을 기록한다. 콘솔에서 버튼 클릭, CLI 명령 실행, SDK 호출, AWS 서비스 간 호출(S3 이벤트가 Lambda를 트리거하는 것 등) 모두 내부적으로 API 호출이다.

기록하는 것:
- 호출자(userIdentity): ARN, accessKeyId, sessionToken, sourceIPAddress
- 시간(eventTime): ISO 8601 UTC
- API(eventName): `RunInstances`, `PutObject`, `AttachRolePolicy` 등
- 대상 리소스(resources, requestParameters)
- 결과(errorCode, errorMessage 또는 responseElements)
- 리전(awsRegion), 서비스(eventSource)

기록하지 않는 것:
- S3 객체의 **내용**(콘텐츠) — 접근 사실만 기록, 실제 데이터는 아님
- CloudWatch Metrics 데이터
- CloudWatch Logs 내용
- EC2 인스턴스 내부에서 일어나는 OS 레벨 작업

## 이벤트 종류: Management, Data, Insights

```
CloudTrail 이벤트 종류
├── Management Events (기본 ON, 무료)
│   ├── Write: Create, Delete, Update, Put, Attach, Detach
│   └── Read: Describe, List, Get
├── Data Events (기본 OFF, 유료: $0.10/100K)
│   ├── S3: GetObject, PutObject, DeleteObject
│   ├── Lambda: Invoke
│   ├── DynamoDB: GetItem, PutItem, DeleteItem
│   └── 기타: CloudTrail Lake, SNS, SQS, Cognito 등
└── Insights Events (별도 활성화, 유료: $0.35/100K)
    ├── ApiCallRateInsight: 호출량 spike
    └── ApiErrorRateInsight: 에러율 spike
```

**Management Events**는 리소스의 생명주기와 설정 변경이다. `RunInstances`(EC2 시작), `CreateBucket`(S3 버킷 생성), `AttachRolePolicy`(IAM 정책 부여). 이 이벤트들은 인프라 상태를 바꾸는 행위이므로 기본으로 켜져 있고 무료다.

**Data Events**는 리소스 안의 데이터에 접근하는 행위다. S3 버킷의 특정 객체를 다운로드하거나(`GetObject`), Lambda 함수를 호출하거나(`Invoke`), DynamoDB에서 특정 아이템을 읽는(`GetItem`) 것이다. 이 이벤트들은 양이 매우 많아서(프로덕션 S3 버킷에서 초당 수천 건의 GetObject가 발생할 수 있다) 기본으로 꺼져 있고 별도 비용이 발생한다.

> ⚠️ **함정**: "S3 객체 접근을 추적하라"는 요구사항이 나오면 반드시 Data Events 활성화가 답이다. Management Events만으로는 `PutBucketPolicy`(버킷 정책 변경) 같은 설정 변경만 추적되고, 실제 객체 접근(GetObject, PutObject)은 추적되지 않는다. 시험에서 이 구분을 자주 묻는다.

> 📚 **사례**: 2019년 Capital One 데이터 유출 사건. 전직 AWS 직원이 SSRF 취약점으로 EC2 메타데이터에서 IAM 임시 자격증명을 탈취해 S3 버킷 700개에서 100GB 이상의 데이터를 추출했다. 사후 분석에서 S3 Data Events가 활성화되어 있었다면 `GetObject` 호출 패턴(비정상적으로 많은 양, 비정상적인 IAM 자격증명)으로 수 시간 내 탐지할 수 있었다는 분석이 나왔다. 이 사건 후 AWS는 GuardDuty S3 Data Event 모니터링을 강화했고, CloudTrail Data Events 활성화가 보안 모범 사례에서 필수로 격상됐다.

## Trail의 구조와 Multi-Region 설정

Trail은 "어떤 이벤트를 어디에 저장할지"를 정의하는 설정이다.

```bash
# Multi-Region Trail 생성 (권장 표준)
aws cloudtrail create-trail \
  --name "org-master-trail" \
  --s3-bucket-name "org-cloudtrail-archive-111122223333" \
  --is-multi-region-trail \
  --include-global-service-events \
  --enable-log-file-validation \
  --kms-key-id "arn:aws:kms:ap-northeast-2:111122223333:key/abc-def"

aws cloudtrail start-logging --name "org-master-trail"
```

`--is-multi-region-trail`: 모든 리전의 이벤트 수집. 신규 리전 자동 포함.

`--include-global-service-events`: IAM, STS, CloudFront 같은 글로벌 서비스 이벤트 포함. 이것 없으면 IAM 사용자 생성, STS AssumeRole 같은 핵심 보안 이벤트가 누락된다.

`--enable-log-file-validation`: SHA-256 해시 다이제스트 파일 생성. 변조 감지 가능.

`--kms-key-id`: SSE-KMS 암호화. 기본은 SSE-S3. 컴플라이언스 요구사항이 있으면 KMS 키 지정.

## S3 저장 구조와 Log File Validation

CloudTrail 로그는 5분마다 JSON.gz 파일로 S3에 저장된다. 경로 구조:

```
s3://org-cloudtrail-archive-111122223333/
  AWSLogs/
    111122223333/                  ← Account ID
      CloudTrail/
        ap-northeast-2/
          2026/05/26/
            111122223333_CloudTrail_ap-northeast-2_20260526T1200Z_AbCdEfGh.json.gz
      CloudTrail-Digest/           ← Log File Validation 다이제스트
        ap-northeast-2/
          2026/05/26/
            111122223333_CloudTrail-Digest_ap-northeast-2_...json
```

다이제스트 파일은 1시간마다 생성된다. 그 시간대의 모든 로그 파일의 SHA-256 해시값을 포함하며, 이전 다이제스트 파일의 해시도 포함해 **해시 체인**을 형성한다. 중간에 로그 파일이 삭제되거나 수정되면 `aws cloudtrail validate-logs`가 탐지한다.

```bash
# 특정 기간의 로그 무결성 검증
aws cloudtrail validate-logs \
  --trail-arn "arn:aws:cloudtrail:ap-northeast-2:111122223333:trail/org-master-trail" \
  --start-time "2026-05-01T00:00:00Z" \
  --end-time "2026-05-26T23:59:59Z"
# 출력: "Results requested for 2026-05-01T00:00:00Z to 2026-05-26T23:59:59Z
#        Digest files: 600, valid: 600, INVALID: 0
#        Log files: 7200, valid: 7200, INVALID: 0"
```

변조가 있으면 "INVALID" 카운트가 올라가고 어떤 파일이 문제인지 알 수 있다.

> 🔍 **더 깊이**: Log File Validation의 해시 알고리즘은 SHA-256이며, 다이제스트 파일 자체는 CloudTrail 서비스의 RSA 프라이빗 키로 서명된다. 검증 시 AWS의 퍼블릭 키로 서명을 확인한다. 이 구조 덕분에 AWS 직원도 다이제스트 파일을 조작하면 서명 불일치로 탐지된다. 단, 다이제스트 파일이 있는 S3 버킷 자체가 삭제되면 검증할 수 없다. 그래서 S3 Object Lock(WORM: Write Once Read Many)과 MFA Delete를 같이 쓰는 것이 표준이다.

## Organization Trail: 멀티 계정 감사의 표준

AWS Organizations를 쓰는 환경에서 계정마다 Trail을 만들면 관리 부담과 비용이 증가한다. Organization Trail은 관리 계정(Management Account)에서 한 번 만들면 조직 내 **모든 멤버 계정의 이벤트를 자동 수집**한다. 현재 계정뿐 아니라 **미래에 추가되는 계정도 자동 포함**된다.

```bash
# 관리 계정에서 Organization Trail 생성
aws cloudtrail create-trail \
  --name "organization-trail" \
  --s3-bucket-name "log-archive-cloudtrail" \
  --is-organization-trail \
  --is-multi-region-trail \
  --include-global-service-events \
  --enable-log-file-validation

aws cloudtrail start-logging --name "organization-trail"
```

멤버 계정 특성:
- 멤버 계정 사용자는 Organization Trail을 **볼 수 없고 수정할 수 없다** (관리 계정만)
- 멤버 계정 이벤트는 Log Archive Account의 중앙 S3 버킷에 저장됨
- 경로: `AWSLogs/{org-id}/{member-account-id}/CloudTrail/...`

```
[관리 계정] Organization Trail 생성
       │
       ▼ (자동 수집)
[멤버 계정 A] [멤버 계정 B] [멤버 계정 C] ...미래 계정들...
       │           │           │
       └───────────┴───────────┘
                   │
                   ▼
         [Log Archive Account]
          중앙 S3 버킷
          - Object Lock (WORM)
          - SSE-KMS
          - Log File Validation
```

> 💡 **관련 이론**: 중앙 집중식 로그 아카이브는 AWS Landing Zone(현재 Control Tower)의 핵심 설계 패턴이다. Log Archive Account를 별도로 두는 이유는 "침해된 워크로드 계정에서 공격자가 로그를 삭제하지 못하게" 하기 위함이다. 공격자가 계정 A를 침해해도 Log Archive Account의 S3 버킷에 대한 권한이 없으면 로그를 지울 수 없다. 이것이 Account 분리의 보안 가치다.

## EventBridge 연동: 실시간 보안 대응

CloudTrail 이벤트는 모두 EventBridge default bus로 자동 전송된다. 별도 활성화 없이 Rule만 만들면 된다.

가장 많이 쓰는 보안 Rule 패턴들:

```json
// Root 사용자 콘솔 로그인
{
  "source": ["aws.signin"],
  "detail-type": ["AWS Console Sign In via CloudTrail"],
  "detail": { "userIdentity": { "type": ["Root"] } }
}

// IAM 정책 변경 (권한 상승 위험)
{
  "source": ["aws.iam"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventName": [
      "AttachRolePolicy", "PutRolePolicy", "CreatePolicy",
      "CreateAccessKey", "UpdateAccessKey", "DeletePolicy"
    ]
  }
}

// 보안 그룹에 전체 허용 규칙 추가
{
  "source": ["aws.ec2"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventName": ["AuthorizeSecurityGroupIngress"],
    "requestParameters": {
      "ipPermissions": {
        "items": {
          "ipRanges": { "items": { "cidrIp": ["0.0.0.0/0"] } }
        }
      }
    }
  }
}
```

이 Rule에 SNS, Lambda, SSM Automation을 타겟으로 연결하면 탐지 → 대응이 자동화된다.

> 📚 **사례**: 2021년 한 국내 스타트업(익명)에서 인턴 개발자가 실수로 RDS 보안 그룹에 `0.0.0.0/0:3306`(MySQL 전체 허용) 규칙을 추가했다. EventBridge Rule이 `AuthorizeSecurityGroupIngress`를 감지하고 SSM Automation Runbook이 2분 만에 해당 규칙을 자동 제거했다. 인턴은 다음날 슬랙 알림으로 자신의 실수를 알게 됐다. CloudTrail + EventBridge의 "detect and auto-remediate" 패턴이 작동한 사례다.

## S3 Data Events 활성화: 비용 최적화 패턴

모든 S3 버킷의 Data Events를 켜면 비용이 폭발한다. 선택적 활성화 패턴이 중요하다.

```bash
# 특정 민감 버킷만 Data Events 활성화
aws cloudtrail put-event-selectors \
  --trail-name "org-master-trail" \
  --event-selectors '[
    {
      "ReadWriteType": "All",
      "IncludeManagementEvents": true,
      "DataResources": [
        {
          "Type": "AWS::S3::Object",
          "Values": [
            "arn:aws:s3:::financial-data-bucket/",
            "arn:aws:s3:::pii-data-bucket/",
            "arn:aws:s3:::audit-logs-bucket/"
          ]
        },
        {
          "Type": "AWS::Lambda::Function",
          "Values": ["arn:aws:lambda"]
        }
      ]
    }
  ]'
```

`"arn:aws:lambda"`처럼 서비스 ARN만 지정하면 해당 리전의 모든 Lambda 함수 호출을 추적한다. S3는 버킷별로 선택해 PII 데이터, 금융 데이터가 있는 버킷만 추적하면 비용을 통제할 수 있다.

## CloudTrail과 CloudWatch의 통합: Metric Filter 알람

CloudTrail을 CloudWatch Logs에 연동하면 로그 패턴으로 알람을 만들 수 있다.

```bash
# Trail을 CloudWatch Logs에 연동
aws cloudtrail update-trail \
  --name "org-master-trail" \
  --cloud-watch-logs-log-group-arn \
    "arn:aws:logs:ap-northeast-2:111122223333:log-group:CloudTrail/org:*" \
  --cloud-watch-logs-role-arn \
    "arn:aws:iam::111122223333:role/CloudTrail_CWLogs_Role"

# IAM 정책 변경 알람용 Metric Filter
aws logs put-metric-filter \
  --log-group-name "CloudTrail/org" \
  --filter-name "IAMPolicyChanges" \
  --filter-pattern '{ ($.eventName = AttachRolePolicy) ||
                      ($.eventName = PutRolePolicy) ||
                      ($.eventName = CreateAccessKey) ||
                      ($.eventName = DeletePolicy) }' \
  --metric-transformations \
    metricName=IAMPolicyChanges,metricNamespace=Security,metricValue=1

# 해당 메트릭으로 알람 생성
aws cloudwatch put-metric-alarm \
  --alarm-name "IAM-Policy-Changes" \
  --metric-name "IAMPolicyChanges" \
  --namespace "Security" \
  --period 300 \
  --evaluation-periods 1 \
  --datapoints-to-alarm 1 \
  --statistic Sum \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --alarm-actions "arn:aws:sns:ap-northeast-2:111122223333:security-alerts"
```

## 다른 플랫폼과의 비교

| 항목 | CloudTrail | GCP Cloud Audit Logs | Azure Activity Log |
|------|-----------|---------------------|-------------------|
| 기본 보관 | 90일 (Event History) | 400일 | 90일 |
| 장기 보관 | Trail → S3 | Log Router → Cloud Storage | Diagnostic Setting → Storage |
| 조직 통합 | Organization Trail | 조직 감사 로그 자동 집계 | Tenant-level Activity Log |
| 무결성 검증 | Log File Validation (SHA-256) | CMEK + 별도 검증 도구 | Immutable Storage 정책 |
| ML 기반 이상 탐지 | CloudTrail Insights | Cloud Security Command Center | Microsoft Sentinel |
| SQL 분석 | CloudTrail Lake | BigQuery Export | Log Analytics Workspace |

GCP는 관리자 활동 로그(Admin Activity)가 기본으로 켜져 있고 무료며 400일 보관되는 점이 CloudTrail의 90일과 차이가 있다. Azure는 구독 레벨의 Activity Log가 90일 무료 보관된다.

## 마무리

CloudTrail은 "사후 분석"만을 위한 도구가 아니다. EventBridge와 연동하면 "실시간 탐지 및 대응"이 가능하고, CloudWatch Logs와 연동하면 "패턴 기반 알람"이 된다. Organization Trail로 멀티 계정을 통합하면 "전사 감사"가 자동화된다. 이 세 가지 역할을 이해하고, 언제 어떤 이벤트 종류(Management vs Data vs Insights)가 필요한지 판단하는 것이 시험의 핵심이다.

---

## 📝 연습 문제

**문제 1.** 보안팀이 "누가 프로덕션 S3 버킷에서 고객 PII 데이터를 다운로드했는지" 추적해야 한다. 필요한 CloudTrail 설정은?

A) Management Events만 활성화하면 충분하다
B) S3 Data Events 활성화 — 특정 버킷의 GetObject/PutObject 추적
C) CloudTrail Insights 활성화
D) GuardDuty S3 Protection만으로 충분하다

**정답: B**
해설: S3 객체 다운로드(GetObject)는 Data Event다. Management Events는 `PutBucketPolicy`, `CreateBucket` 같은 컨트롤 플레인 작업만 추적한다. Data Events를 대상 버킷에 활성화해야 객체 레벨 접근이 기록된다. 비용($0.10/100K events)이 발생하므로 민감 버킷만 선택적으로 활성화하는 것이 효율적이다.

---

**문제 2.** 회사가 30개 AWS 계정을 운영한다. 모든 계정의 API 호출을 중앙에서 수집하고, 미래에 추가되는 계정도 자동으로 포함하려면?

A) 각 계정에 동일한 Trail 설정을 CloudFormation StackSet으로 배포
B) Organizations 관리 계정에서 Organization Trail 생성 → Log Archive Account의 중앙 S3로 저장
C) EventBridge cross-account 규칙으로 이벤트를 중앙 계정으로 전달
D) CloudWatch Logs로 모든 계정의 로그를 통합

**정답: B**
해설: Organization Trail은 현재 조직 내 모든 멤버 계정 + 미래에 추가되는 계정을 자동으로 포함한다. 멤버 계정 사용자는 이 Trail을 볼 수도, 수정할 수도 없다. StackSet은 현재 계정에만 배포되고 미래 계정에는 수동 배포가 필요하다. Organization Trail이 이 요구사항에 정확히 맞는 답이다.

---

**문제 3.** CloudTrail Log File Validation의 목적은?

A) S3 저장 비용 절감
B) 로그 파일이 변조됐는지 SHA-256 해시 체인으로 감지하는 컴플라이언스 기능
C) 실시간 이벤트 스트리밍 속도 향상
D) CloudWatch Logs 통합 활성화

**정답: B**
해설: Log File Validation은 1시간마다 다이제스트 파일을 생성하고, 각 로그 파일의 SHA-256 해시를 기록한다. 다이제스트 파일 자체도 AWS의 RSA 키로 서명된다. `aws cloudtrail validate-logs`로 지정 기간의 모든 로그 파일 무결성을 검증할 수 있다. 컴플라이언스 감사(SOC 2, PCI-DSS, HIPAA)에서 로그 무결성 입증에 필수다.

---

**문제 4.** Root 사용자가 콘솔에 로그인하면 즉시 SNS 알림을 받으려 한다. 어떤 구성이 필요한가?

A) CloudWatch Alarm + CloudTrail 메트릭
B) EventBridge Rule(aws.signin source + Root userIdentity 패턴) → SNS Target
C) CloudTrail Insights 활성화
D) Config Rule로 Root 로그인 탐지

**정답: B**
해설: CloudTrail의 모든 이벤트는 EventBridge default bus로 자동 전달된다. EventBridge Rule에서 `source: aws.signin`, `detail.userIdentity.type: Root` 패턴을 설정하면 Root 로그인 시 즉시 Rule이 트리거된다. SNS를 타겟으로 연결하면 이메일/SMS 알림이 전송된다. CloudTrail Insights는 API 호출량 패턴 이상을 감지하는 것으로 개별 이벤트 실시간 대응에 적합하지 않다.

---

**문제 5.** CloudTrail Event History 콘솔에서 6개월 전 이벤트를 검색했는데 없다. 이유는?

A) 리전 필터가 잘못 설정됐다
B) Event History는 90일까지만 무료 보관한다. 6개월 데이터는 Trail이 없었다면 영구 소실됐다
C) 해당 이벤트는 Data Event라 별도 조회가 필요하다
D) IAM 권한이 부족하다

**정답: B**
해설: Event History는 계정 생성 시 자동으로 활성화되지만 90일만 보관한다. Trail을 만들어 S3에 저장하지 않았다면 90일 이후 이벤트는 조회 불가다. Trail이 있었다면 S3 객체를 직접 다운로드하거나 Athena, CloudTrail Lake로 쿼리하면 된다. "Trail을 만들지 않아 6개월 전 이벤트를 잃어버린 경우"는 실제 운영에서 보안 감사 시 자주 발생하는 상황이다.

---

**문제 6.** Management Events와 Data Events의 차이를 가장 정확히 설명한 것은?

A) Management Events는 유료, Data Events는 무료다
B) Management Events는 리소스 생명주기 및 설정 변경(Create/Delete/Update), Data Events는 리소스 내부 데이터 접근(S3 GetObject, Lambda Invoke, DynamoDB GetItem)이다. Management는 기본 ON 무료, Data는 기본 OFF 유료
C) Management Events는 콘솔 작업만, Data Events는 API 호출만 기록한다
D) 두 종류 모두 Trail 없이는 기록되지 않는다

**정답: B**
해설: Management Events는 AWS 리소스의 생성/삭제/수정/설정 같은 컨트롤 플레인 작업이다. 기본으로 켜져 있고 무료다. Data Events는 S3 객체 접근, Lambda 호출, DynamoDB Item 수준 접근처럼 데이터 플레인 작업이다. 양이 매우 많아 기본으로 꺼져 있고 건당 비용이 발생한다. Management Events는 Event History에서 90일 무료 조회 가능하고, Trail 없이도 기록된다.
