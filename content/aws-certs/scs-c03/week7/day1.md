# Day 1 - CloudTrail: 관리/데이터 이벤트, 조직 트레일, 로그 파일 무결성 검증, CloudTrail Lake

감사(audit)의 본질은 "누가, 언제, 무엇을, 어디서, 어떻게 했는가"를 사후에 재구성할 수 있게 만드는 것이다. AWS에서 이 질문에 답하는 1차 증거는 **CloudTrail**이다. CloudTrail은 계정 안에서 발생한 거의 모든 API 호출을 JSON 이벤트로 기록한다. 보안 시험의 관점에서 핵심은 "CloudTrail이 *무엇을* 기록하고 *무엇을* 기록하지 않는가", 그리고 "그 기록이 *변조되지 않았음*을 어떻게 증명하는가"이다.

CloudTrail은 두 가지 모드로 존재한다. 모든 계정에 기본 활성화되어 최근 90일치 관리 이벤트를 보여주는 **Event history**(저장·내보내기 불가, 단일 리전·읽기 전용 콘솔 뷰), 그리고 사용자가 명시적으로 만들어 S3에 영구 보관하는 **Trail**이다. 시험에서 "장기 보존", "포렌식", "규정 준수"가 나오면 Event history가 아니라 Trail 또는 CloudTrail Lake가 정답이다.

> 📚 **사례**: 2014년 코드 호스팅 업체 Code Spaces는 공격자가 AWS 콘솔 제어권을 얻은 뒤 인스턴스·스토리지·스냅샷·백업을 차례로 삭제해 사실상 하루 만에 서비스를 접었다. 널리 알려진 이 사건이 남긴 교훈은 단순하다 — **백업과 로그가 침해된 계정과 같은 통제 경계 안에 있으면 그것은 백업도 로그도 아니다.** 침해 대응의 순서를 공격자 입장에서 뒤집어 보면 더 분명해진다. 공격자는 데이터를 가져가기 전에 *자신이 보이지 않게* 만들고 싶어 하고, 그래서 클라우드 로깅 무력화는 MITRE ATT&CK에 "Impair Defenses: Disable or Modify Cloud Logs"라는 독립된 기법으로 등재돼 있다. 오늘 배울 조직 트레일, 별도 로깅 계정, digest 서명 체인은 전부 이 한 가지 기법을 무력화하기 위해 존재하는 장치다.

### Event history · Trail · Lake: 세 저장소의 역할 분담

| 항목 | Event history | Trail (S3) | CloudTrail Lake |
|------|---------------|-----------|-----------------|
| 보존 | 최근 90일 | 사실상 무기한(S3 수명주기에 따름) | 최대 10년(보존 기간 지정) |
| 담기는 이벤트 | 관리 이벤트 | 관리 + 데이터 + Insights | 관리 + 데이터 + Insights + **외부 소스** |
| 저장 위치 | CloudTrail 내부(사용자 버킷 아님) | 지정한 S3 버킷(+ CloudWatch Logs 선택) | CloudTrail이 관리하는 불변 이벤트 데이터 스토어 |
| 조회 방법 | 콘솔 · `lookup-events` API | Athena 테이블 구성 또는 직접 파싱 | SQL 직접 실행 |
| 리전 범위 | 그 리전만 | 멀티리전 가능 | 조직·멀티리전 집계 가능 |
| 비용 | 무료 | 관리 이벤트 첫 사본 무료 + S3 저장·요청 비용 | 수집·보존 기반 별도 과금 |
| 전형적 용도 | "방금 뭐가 바뀌었지?" 즉석 확인 | 장기 보존·포렌식·중앙 집계의 **기본형** | 코드 없는 대화형 조사 |

세 가지는 배타적이지 않다. 실무 표준은 **Trail을 베이스라인으로 깔고**(증거의 원본은 S3에 남긴다), 조사 편의를 위해 Lake나 Athena를 얹는 구조다. Event history는 어디까지나 "지난 90일 안의 관리 이벤트를 콘솔에서 빠르게 훑는" 보조 창구이지 증거 보관소가 아니다.

> ⚠️ **함정**: "CloudTrail은 기본으로 켜져 있다"는 문장은 절반만 참이다. Event history는 켜져 있지만 **어떤 trail도 자동으로 만들어지지 않는다.** 90일이 지나면 그 이벤트는 사라진다. 시험 지문에 "6개월 전 사건을 조사하라"가 있고 trail 구성에 대한 언급이 없다면, 이미 증거가 없다는 것이 함정의 정답인 경우가 많다. 로깅은 *소급 적용되지 않는다* — 켜 두지 않은 순간은 영원히 공백으로 남는다.

## 이벤트의 세 종류: Management / Data / Insights

CloudTrail이 기록하는 이벤트는 성격이 다른 세 부류로 나뉜다. 이 구분을 모르면 "왜 내 S3 GetObject가 로그에 안 보이지?" 같은 함정에 빠진다.

- **Management events**(관리 이벤트): 리소스에 대한 *제어 평면(control plane)* 작업. `RunInstances`, `CreateBucket`, `AttachRolePolicy`, `ConsoleLogin` 등. 기본으로 기록되며, 첫 trail의 관리 이벤트 사본 1개는 무료다.
- **Data events**(데이터 이벤트): 리소스 안의 데이터에 대한 *데이터 평면(data plane)* 작업. S3 `GetObject`/`PutObject`/`DeleteObject`, Lambda `Invoke`, DynamoDB `PutItem` 등. **기본으로 꺼져 있고**, 볼륨이 크며 추가 요금이 든다.
- **Insights events**: 비정상적인 API 호출 *비율* 변화를 ML로 탐지(예: `RunInstances`가 평소의 10배). 별도 활성화 필요.

```json
{
  "eventVersion": "1.09",
  "eventTime": "2026-06-24T08:14:22Z",
  "eventSource": "s3.amazonaws.com",
  "eventName": "GetObject",
  "awsRegion": "ap-northeast-2",
  "sourceIPAddress": "203.0.113.10",
  "userIdentity": {
    "type": "AssumedRole",
    "arn": "arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc",
    "sessionContext": { "attributes": { "mfaAuthenticated": "false" } }
  },
  "resources": [
    { "type": "AWS::S3::Object", "ARN": "arn:aws:s3:::secret-data/payroll.csv" }
  ],
  "readOnly": true,
  "managementEvent": false,
  "eventCategory": "Data"
}
```

> ⚠️ **함정**: 시험 단골이다. "S3 버킷에서 객체를 다운로드한 사람을 추적하라"는 요구에 기본 trail만으로는 답이 안 나온다. `GetObject`는 *데이터 이벤트*라서 trail에 S3 data event selector를 명시적으로 추가해야 기록된다. 마찬가지로 Lambda 함수 호출자 추적은 Lambda data event가 필요하다. `userIdentity.sessionContext`로 MFA 사용 여부, 어떤 역할을 assume했는지까지 보이는 점도 기억하라.

### 세 종류를 한 표로 비교하기

| 항목 | 관리 이벤트(Management) | 데이터 이벤트(Data) | Insights 이벤트 |
|------|------------------------|--------------------|-----------------|
| 대상 평면 | 제어 평면(리소스 자체를 만들고 바꾸는 호출) | 데이터 평면(리소스 *안의* 데이터를 읽고 쓰는 호출) | 다른 이벤트로부터 파생된 분석 결과 |
| 대표 호출 | `CreateBucket`, `AttachRolePolicy`, `AssumeRole`, `ConsoleLogin` | S3 `GetObject`, Lambda `Invoke`, DynamoDB `PutItem` | 없음(이벤트가 아니라 이상 신호) |
| 기본값 | **켜짐** | **꺼짐** | **꺼짐** |
| 볼륨 | 상대적으로 적음 | 폭발적 | 매우 적음 |
| 과금 | 첫 사본 무료, 추가 사본 과금 | 이벤트 수 기반 과금 | 분석 대상 이벤트 기반 과금 |
| 답하는 질문 | "누가 이 리소스를 만들고 권한을 바꿨나" | "누가 이 데이터를 실제로 읽어 갔나" | "지금 평소와 다른 일이 벌어지고 있나" |
| 조사에서의 위치 | 침해 *경로* 재구성 | 침해 *피해 범위* 확정 | 침해 *발견* 계기 |

이 표의 마지막 두 줄이 실무에서 제일 중요하다. 관리 이벤트만으로는 "공격자가 어떤 권한을 어떻게 얻었는가"까지만 말할 수 있고, "그래서 실제로 무엇을 가져갔는가"는 데이터 이벤트가 없으면 **영원히 답할 수 없다.** 유출 통지 의무가 있는 조직에서 이 차이는 법적 판단을 바꾼다 — "접근 가능했다"와 "접근했다"는 다른 문장이기 때문이다.

> 🔍 **더 깊이**: Insights는 흔히 "호출 *비율* 이상 탐지"로만 소개되지만, 실제로는 두 유형이 있다. 하나는 API 호출량이 평소 기준선에서 급격히 벗어나는 경우(`ApiCallRateInsight`), 다른 하나는 특정 API의 **오류 응답 비율**이 급증하는 경우(`ApiErrorRateInsight`)다. 후자가 보안 관점에서 더 흥미롭다. 탈취한 자격증명을 손에 쥔 공격자가 가장 먼저 하는 일은 "이 자격증명으로 무엇을 할 수 있는지" 훑어보는 것이고, 그 과정에서 `AccessDenied`가 대량으로 발생하기 때문이다. 정상 자동화는 성공하도록 미리 짜여 있어서 오류율이 낮게 유지된다. 즉 **오류율 급증은 그 자체로 정찰(reconnaissance)의 지문**이다.

## `userIdentity` 해부: "누가"를 정확히 읽는 법

CloudTrail 조사에서 가장 오래 들여다보게 되는 블록이 `userIdentity`다. 여기서 `type` 값이 무엇이냐에 따라 그다음에 던져야 할 질문이 완전히 달라진다.

| `type` | 의미 | 곧바로 이어져야 할 질문 |
|--------|------|------------------------|
| `Root` | 계정 루트 자격증명을 직접 사용 | 거의 항상 즉시 경보. 왜 루트를 썼나? MFA는 붙었나? |
| `IAMUser` | 장기 액세스 키 또는 콘솔 비밀번호 | `accessKeyId`가 무엇인가, 유출·공유된 키인가 |
| `AssumedRole` | STS로 역할을 맡은 임시 세션 | *누가 그 역할을 맡았나* → `sessionContext.sessionIssuer`를 봐야 한다 |
| `AWSService` | AWS 서비스가 사용자 대신 호출 | `invokedBy`의 서비스 주체. 정상 자동화 경로인가 |
| `AWSAccount` | 다른 계정의 주체(상세는 그 계정에만 보임) | 어떤 교차계정 신뢰가 걸려 있나 |
| `FederatedUser` | `GetFederationToken`으로 만든 임시 세션 | 어떤 IAM 사용자가 이 토큰을 발급했나 |
| `Unknown` | 유형을 판별하지 못함 | 드물다. 원본 레코드 전체를 읽어야 한다 |

`AssumedRole`이 실무에서 압도적으로 많고, 동시에 가장 오해받는 유형이다. 아래 레코드를 보자.

```json
{
  "userIdentity": {
    "type": "AssumedRole",
    "principalId": "AROAEXAMPLEID:alice-session",
    "arn": "arn:aws:sts::111122223333:assumed-role/AdminRole/alice-session",
    "accountId": "111122223333",
    "accessKeyId": "ASIAEXAMPLEKEY",
    "sessionContext": {
      "sessionIssuer": {
        "type": "Role",
        "principalId": "AROAEXAMPLEID",
        "arn": "arn:aws:iam::111122223333:role/AdminRole",
        "accountId": "111122223333",
        "userName": "AdminRole"
      },
      "attributes": {
        "creationDate": "2026-06-24T07:58:11Z",
        "mfaAuthenticated": "false"
      }
    }
  },
  "eventName": "PutBucketPolicy",
  "sourceIPAddress": "203.0.113.10",
  "userAgent": "aws-cli/2.15.0 Python/3.11 Linux/5.10"
}
```

여기서 읽어야 할 네 가지.

1. **`arn`은 역할 ARN이 아니라 세션 ARN이다.** `assumed-role/AdminRole/alice-session`의 마지막 조각이 세션 이름이고, 이것은 `AssumeRole`을 호출한 쪽이 마음대로 정한 문자열이다. 즉 세션 이름은 *주장*이지 *증명*이 아니다. 진짜 신원은 이 세션을 만든 `AssumeRole` 호출을 역추적해야 나온다.
2. **`accessKeyId`의 접두사가 단서다.** `AKIA`로 시작하면 IAM 사용자에게 발급된 장기 액세스 키이고, `ASIA`로 시작하면 STS가 발급한 임시 자격증명이다. 침해 조사에서 "이 키가 어디서 나왔나"를 가르는 첫 갈림길이 이 두 글자다.
3. **`mfaAuthenticated`는 세션 속성이다.** 역할을 맡을 때 MFA를 거쳤는지를 말한다. 이 값이 `false`인데 민감한 관리 작업을 하고 있다면 그 자체로 정책 위반 후보다.
4. **`creationDate`가 세션의 시작 시각이다.** 이 시각으로 `AssumeRole` 이벤트를 찾으면 원 주체(사람인지, EC2 인스턴스 프로파일인지, 다른 계정인지)가 드러난다.

```
[ 세션 역추적: "누가"의 진짜 답을 찾는 두 단계 ]

  ① 문제의 이벤트           ② sessionIssuer + creationDate로 되짚기
  PutBucketPolicy           AssumeRole
  arn: .../AdminRole/       roleArn: .../AdminRole
       alice-session        roleSessionName: alice-session
  creationDate: 07:58:11    eventTime: 07:58:11
                            userIdentity.type: IAMUser  ← 여기서 진짜 신원이 나온다
                            arn: .../user/alice
                            sourceIPAddress: 198.51.100.77
                            ↑ ①의 203.0.113.10과 다르다 = 세션이 옮겨 다녔다는 신호
```

②의 소스 IP와 ①의 소스 IP가 다르다는 것은 **세션 토큰이 발급된 곳과 사용된 곳이 다르다**는 뜻이다. 정상적으로는 같은 호스트에서 발급받아 그대로 쓰므로 대개 일치한다. 불일치는 임시 자격증명이 유출돼 다른 곳에서 재생(replay)되고 있다는 대표적 지표다.

> ⚠️ **함정**: `sourceIPAddress`에 IP가 아니라 `cloudformation.amazonaws.com` 같은 **서비스 DNS 이름**이 들어 있는 경우가 있다. 이는 그 호출이 사용자가 직접 한 것이 아니라 AWS 서비스가 사용자를 대신해 수행했다는 뜻이며, 같은 레코드의 `invokedBy` 필드에도 그 서비스가 표시된다. "소스 IP가 이상하다"고 놀라기 전에 `invokedBy`를 먼저 확인해야 한다. 반대로 이 조합을 악용하는 시나리오도 있다 — 공격자가 CloudFormation·SSM 같은 서비스를 *경유해* 작업하면, 그의 IP는 로그에 남지 않고 서비스 이름만 남는다. 그래서 조사에서는 "서비스가 대신 한 호출"에 대해 *그 서비스를 그렇게 시킨 관리 이벤트*까지 한 단계 더 거슬러 올라가야 한다.

```json
{
  "userIdentity": { "type": "AWSService", "invokedBy": "cloudformation.amazonaws.com" },
  "eventSource": "iam.amazonaws.com",
  "eventName": "CreateRole",
  "sourceIPAddress": "cloudformation.amazonaws.com",
  "eventType": "AwsApiCall"
}
```

## 이벤트 레코드의 나머지 절반: 실패·경로·맥락 필드

`userIdentity`와 `eventName`만 보고 조사를 끝내면 절반을 놓친다. 실전에서 결정적인 필드들은 오히려 뒤쪽에 있다.

| 필드 | 무엇을 말해 주나 | 조사에서의 쓸모 |
|------|-----------------|----------------|
| `errorCode` / `errorMessage` | 호출이 **실패**했다면 그 이유 | `AccessDenied`가 몰려 있으면 권한 열거 정찰의 흔적 |
| `requestParameters` | 호출에 실제로 넣은 인자 | 어떤 버킷·어떤 정책·어떤 CIDR을 지정했는지 |
| `responseElements` | 변경 작업의 결과 | 새로 만들어진 리소스 ID·ARN. 읽기 전용 호출에서는 비어 있다 |
| `additionalEventData` | 서비스별 부가 정보 | `ConsoleLogin`의 `MFAUsed`, S3의 전송 바이트 등 |
| `tlsDetails` | TLS 버전·암호 스위트·클라이언트가 보낸 호스트 헤더 | 구식 TLS를 쓰는 이례적 클라이언트 식별 |
| `vpcEndpointId` | 호출이 VPC 엔드포인트를 경유했는지 | 인터넷 경유 vs 사설 경로 구분 |
| `userAgent` | 호출 도구 | `aws-cli`, SDK 버전, 콘솔 여부. 평소와 다른 도구는 신호 |
| `recipientAccountId` | 이 이벤트를 받은 계정 | 교차계정 이벤트에서 `userIdentity.accountId`와 달라진다 |
| `sharedEventID` | 여러 계정에 동시에 기록된 같은 사건의 공통 ID | 교차계정 KMS 사용 등을 양쪽에서 이어 붙일 때 |
| `eventType` | `AwsApiCall` / `AwsServiceEvent` / `AwsConsoleAction` / `AwsConsoleSignIn` | 사람이 콘솔에서 한 일과 프로그램 호출을 구분 |

> 🔍 **더 깊이**: `errorCode`는 초심자가 가장 자주 흘려보내는 필드이면서, 침해 탐지에서 가장 값싼 신호다. 정상적인 애플리케이션은 자기가 할 수 있는 일만 호출하도록 짜여 있어 `AccessDenied`를 거의 만들지 않는다. 반면 탈취한 자격증명을 손에 넣은 공격자는 `ListBuckets`, `GetCallerIdentity`, `ListRoles`, `DescribeInstances`처럼 "일단 뭐가 되는지" 찔러 보는 호출을 연달아 던지고, 그중 상당수가 거부된다. 그래서 성숙한 탐지 규칙에는 거의 예외 없이 **"동일 주체가 짧은 시간에 다수의 서로 다른 API에서 `AccessDenied`를 받은 경우"** 가 들어간다. 이 규칙의 아름다움은 공격 도구가 무엇이든, 어떤 취약점을 썼든 상관없이 *행동의 형태*만으로 걸린다는 점이다.

```sql
-- Athena: 한 시간 안에 여러 API에서 거부당한 주체 — 권한 열거 정찰 후보
SELECT useridentity.arn                AS principal,
       sourceipaddress,
       count(DISTINCT eventname)       AS distinct_denied_apis,
       count(*)                        AS denied_calls,
       min(eventtime)                  AS first_seen,
       max(eventtime)                  AS last_seen
FROM cloudtrail_logs
WHERE errorcode IN ('AccessDenied', 'UnauthorizedOperation', 'Client.UnauthorizedOperation')
  AND eventtime >= '2026-06-24T00:00:00Z'
GROUP BY useridentity.arn, sourceipaddress
HAVING count(DISTINCT eventname) >= 5
ORDER BY distinct_denied_apis DESC;
```

> ⚠️ **함정**: `requestParameters`에 **모든 것이 다 들어 있지는 않다.** CloudTrail은 민감한 값을 의도적으로 기록하지 않는다. 예컨대 Secrets Manager의 `GetSecretValue`는 어떤 시크릿을 읽었는지는 남기지만 시크릿 값 자체는 남기지 않고, KMS의 `Decrypt`도 평문을 남기지 않으며, 비밀번호·키 자료가 오가는 파라미터는 생략되거나 마스킹된다. 이는 설계상 옳은 동작이다 — 로그가 그 자체로 유출 대상이 되면 안 되기 때문이다. 조사에서 기대해야 할 것은 "무엇을 읽었는가"이지 "읽은 내용이 무엇인가"가 아니다. 그래서 시크릿 유출 조사는 언제나 *접근 사실*을 근거로 **해당 시크릿을 전부 회전(rotate)**하는 것으로 마무리된다.

## Advanced event selectors: 정밀한 데이터 이벤트 필터링

데이터 이벤트는 양이 폭발하기 쉬우므로 **advanced event selectors**로 좁힌다. 특정 prefix의 S3 객체만, 특정 함수만, 읽기/쓰기 중 하나만 등 `eventName`·`resources.ARN`·`readOnly` 등의 필드로 필터링한다.

```json
{
  "AdvancedEventSelectors": [
    {
      "Name": "Log writes to sensitive prefix only",
      "FieldSelectors": [
        { "Field": "eventCategory", "Equals": ["Data"] },
        { "Field": "resources.type", "Equals": ["AWS::S3::Object"] },
        { "Field": "resources.ARN", "StartsWith": ["arn:aws:s3:::secret-data/payroll/"] },
        { "Field": "readOnly", "Equals": ["false"] }
      ]
    }
  ]
}
```

이렇게 하면 민감 prefix의 *쓰기*만 기록해 비용을 통제하면서도 핵심 증거를 확보한다. 시험에서 "데이터 이벤트 비용을 줄이면서 특정 버킷 변경만 감사"는 advanced event selector가 정답이다.

selector를 설계할 때 쓸 수 있는 연산자는 `Equals`, `NotEquals`, `StartsWith`, `NotStartsWith`, `EndsWith`, `NotEndsWith`다. 이 중 부정 연산자가 실무에서 특히 유용하다 — "노이즈가 심한 로그·임시 prefix만 빼고 나머지 전부 기록"이라는, 화이트리스트보다 안전한 설계를 만들 수 있기 때문이다.

```json
{
  "AdvancedEventSelectors": [
    {
      "Name": "Log all object activity except noisy temp prefixes",
      "FieldSelectors": [
        { "Field": "eventCategory", "Equals": ["Data"] },
        { "Field": "resources.type", "Equals": ["AWS::S3::Object"] },
        { "Field": "resources.ARN", "NotStartsWith": [
            "arn:aws:s3:::app-scratch/tmp/",
            "arn:aws:s3:::app-scratch/cache/"
        ]}
      ]
    }
  ]
}
```

> 💡 **관련 이론**: 로깅 범위 설계는 보안에서 흔한 *허용목록 vs 차단목록* 문제의 한 사례다. "민감한 것만 골라 기록"(허용목록)은 비용은 싸지만 **목록에 없는 새 버킷은 조용히 사각지대가 된다** — 그리고 새 버킷은 계속 생긴다. "노이즈만 빼고 전부 기록"(차단목록)은 비용이 더 들지만 사각지대가 기본적으로 생기지 않는다. 탐지 설계의 일반 원칙은 *기본값이 안전한 쪽*을 고르는 것이고, 로깅에서 안전한 기본값은 "기록됨"이다. 예산이 허용하는 한 차단목록형으로 가고, 예산이 부족하면 허용목록을 쓰되 **새 리소스가 목록에 자동 반영되는 절차**(태그 기반, IaC 강제)를 함께 둬야 한다.

## 손에 익혀야 할 CLI

조사 상황에서 콘솔보다 빠른 것은 결국 CLI다. 시험에서도 명령 이름 수준으로 자주 등장한다.

```bash
# 1) 이 계정에 어떤 trail이 있는가 — 감사의 첫 명령
aws cloudtrail describe-trails --include-shadow-trails

# 2) 그 trail이 지금 실제로 기록 중인가 (IsLogging=false면 누군가 껐다는 뜻)
aws cloudtrail get-trail-status --name org-audit-trail

# 3) 데이터 이벤트가 어떻게 걸려 있는가
aws cloudtrail get-event-selectors --trail-name org-audit-trail

# 4) 최근 90일 관리 이벤트를 조건으로 조회
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=ConsoleLogin \
  --start-time 2026-06-20T00:00:00Z \
  --end-time   2026-06-25T00:00:00Z \
  --max-results 50

# 5) 유출 의심 액세스 키로 무슨 짓을 했는지 훑기
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIAEXAMPLEKEY \
  --query 'Events[].{t:EventTime,n:EventName,u:Username}' \
  --output table

# 6) 특정 리소스에 손댄 이력만
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=corp-sensitive
```

`lookup-events`의 `--lookup-attributes`에는 `EventId`, `EventName`, `ReadOnly`, `Username`, `ResourceType`, `ResourceName`, `EventSource`, `AccessKeyId`를 쓸 수 있고, **한 번에 하나의 속성만** 지정할 수 있다. 여러 조건을 AND로 걸고 싶다면 CLI 조회로는 불가능하고 Athena나 CloudTrail Lake로 넘어가야 한다.

> ⚠️ **함정**: `lookup-events`는 **관리 이벤트만, 최근 90일만** 조회한다. Event history를 API로 감싼 것이기 때문이다. "데이터 이벤트를 `lookup-events`로 찾아보자"는 접근은 아무것도 반환하지 않는다. 데이터 이벤트를 조회하려면 trail이 떨군 S3 객체를 Athena로 읽거나 CloudTrail Lake를 써야 한다. 이 경계는 시험에서 오답 보기로 자주 등장한다.

## S3에 쌓인 로그를 Athena로 읽기

trail은 로그를 gzip JSON으로 S3에 떨군다. 이걸 사람이 읽는 방법은 사실상 Athena 한 가지다(콘솔의 CloudTrail 화면에서 Athena 테이블 생성을 자동화해 준다).

```sql
-- 루트 계정이 사용된 모든 순간 — 어느 조직에서든 첫 번째 탐지 규칙
SELECT eventtime, eventname, sourceipaddress, useragent, errorcode
FROM cloudtrail_logs
WHERE useridentity.type = 'Root'
  AND eventtype != 'AwsServiceEvent'
ORDER BY eventtime DESC;

-- MFA 없이 성공한 콘솔 로그인
SELECT eventtime, useridentity.arn, sourceipaddress,
       json_extract_scalar(additionaleventdata, '$.MFAUsed') AS mfa
FROM cloudtrail_logs
WHERE eventname = 'ConsoleLogin'
  AND json_extract_scalar(responseelements, '$.ConsoleLogin') = 'Success'
  AND json_extract_scalar(additionaleventdata, '$.MFAUsed') = 'No';

-- 로깅 무력화 시도 — 이 쿼리가 한 줄이라도 반환하면 즉시 대응 대상
SELECT eventtime, useridentity.arn, eventname, requestparameters, errorcode
FROM cloudtrail_logs
WHERE eventname IN ('StopLogging', 'DeleteTrail', 'UpdateTrail',
                    'PutEventSelectors', 'DeleteEventDataStore')
ORDER BY eventtime;

-- 특정 IP가 건드린 모든 것 — 침해 지표(IoC)를 받은 직후 던지는 쿼리
SELECT eventtime, useridentity.arn, eventsource, eventname, errorcode
FROM cloudtrail_logs
WHERE sourceipaddress = '203.0.113.10'
ORDER BY eventtime;
```

> 🎯 **시나리오**: "조사 때마다 수 TB의 CloudTrail 로그를 Athena로 스캔하는데 쿼리 비용과 시간이 감당이 안 된다." 정답 방향은 **파티션**이다. CloudTrail은 `AWSLogs/<account>/CloudTrail/<region>/<yyyy>/<mm>/<dd>/` 구조로 객체를 떨구므로, 이 경로를 계정·리전·날짜 파티션으로 잡아 두면 쿼리가 필요한 날짜 구간만 읽는다. 파티션 없이 만든 테이블은 매번 전체 버킷을 스캔하며, 이것이 "Athena가 느리고 비싸다"는 인상의 거의 유일한 원인이다. 조사 편의성이 최우선이고 파티션 관리를 아예 하기 싫다면 그때 CloudTrail Lake로 간다.

## 멀티리전 트레일: 한 곳에 다 모으기

Trail은 단일 리전 또는 **멀티리전(multi-region)**으로 만든다. 멀티리전 trail은 모든 리전의 이벤트를 하나의 S3 버킷으로 모은다. IAM·STS·CloudFront 같은 **글로벌 서비스 이벤트**는 특정 리전(주로 us-east-1)에서 발생하므로, 멀티리전 trail이거나 글로벌 서비스 이벤트 로깅이 켜져 있어야 빠짐없이 잡힌다.

> 💡 **관련 이론**: 감사 로그 설계의 제1원칙은 *completeness(완전성)*다. 보안 사고 조사에서 "그 리전은 로그가 없습니다"는 치명적이다. 그래서 베이스라인 권고는 항상 "전 리전 + 모든 관리 이벤트(읽기·쓰기 모두)"를 켠 단일 멀티리전 trail이다. 공격자가 모니터링이 없는 리전(예: 잘 안 쓰는 리전)에 리소스를 띄우는 *region hopping* 회피 기법을 막기 위함이다.

## 조직 트레일(Organization Trail): 다계정 일괄 감사

AWS Organizations 관리 계정(또는 위임 관리자)에서 **organization trail**을 만들면, 조직의 *모든 멤버 계정*에 동일한 trail이 자동으로 적용된다. 멤버 계정 관리자는 이 trail을 보거나 끌 수 없다(읽기 전용으로도 노출 가능하지만 삭제·변경 불가). 새 계정이 조직에 합류하면 자동으로 포함된다.

```bash
aws cloudtrail create-trail \
  --name org-audit-trail \
  --s3-bucket-name central-audit-logs-111122223333 \
  --is-organization-trail \
  --is-multi-region-trail \
  --kms-key-id arn:aws:kms:us-east-1:111122223333:key/aaaa-bbbb
```

> 🎯 **시나리오**: "200개 계정 조직에서 어느 계정 관리자도 끌 수 없는 중앙 집중 감사를 보장하라." 정답: 관리 계정에서 organization trail을 멀티리전으로 생성하고 로그를 별도 로깅 전용 계정의 S3 버킷에 집계. 멤버 계정에서 개별 trail을 만드는 방식은 일관성·강제성이 없어 오답이다.

### 로그가 실제로 어디에 어떤 이름으로 떨어지는가

조사에서 S3 콘솔을 열었을 때 길을 잃지 않으려면 경로 규칙을 알아야 한다.

```
s3://central-audit-logs/
└── AWSLogs/
    ├── 111122223333/                       ← 단일 계정 trail
    │   ├── CloudTrail/
    │   │   └── ap-northeast-2/2026/06/24/  ← 로그 파일(.json.gz)
    │   └── CloudTrail-Digest/
    │       └── ap-northeast-2/2026/06/24/  ← digest 파일(무결성 검증용)
    └── o-exampleorgid/                     ← 조직 trail은 조직 ID 한 단계가 더 붙는다
        ├── 111122223333/CloudTrail/...
        ├── 444455556666/CloudTrail/...
        └── 777788889999/CloudTrail/...
```

조직 trail은 `AWSLogs/` 바로 아래에 **조직 ID 디렉터리**가 하나 더 생기고 그 안에 계정별로 갈라진다는 점이 핵심이다. 버킷 정책의 `Resource` ARN을 쓸 때 이 구조를 반영하지 않으면 쓰기가 거부되어 로그가 전달되지 않는다. 그리고 digest는 로그와 **별도 접두사**에 저장된다 — 나중에 보존 정책을 걸 때 로그만 잠그고 digest를 빠뜨리면 무결성 검증이 무의미해지므로, 두 접두사 모두 같은 보호를 받아야 한다.

### 로그 버킷 정책: CloudTrail이 쓸 수 있게 하되 아무나 쓰지 못하게

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AWSCloudTrailAclCheck",
      "Effect": "Allow",
      "Principal": { "Service": "cloudtrail.amazonaws.com" },
      "Action": "s3:GetBucketAcl",
      "Resource": "arn:aws:s3:::central-audit-logs",
      "Condition": {
        "StringEquals": {
          "aws:SourceArn": "arn:aws:cloudtrail:us-east-1:111122223333:trail/org-audit-trail"
        }
      }
    },
    {
      "Sid": "AWSCloudTrailWrite",
      "Effect": "Allow",
      "Principal": { "Service": "cloudtrail.amazonaws.com" },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::central-audit-logs/AWSLogs/o-exampleorgid/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control",
          "aws:SourceArn": "arn:aws:cloudtrail:us-east-1:111122223333:trail/org-audit-trail"
        }
      }
    },
    {
      "Sid": "DenyEverythingButTheTrailAndAuditors",
      "Effect": "Deny",
      "Principal": "*",
      "Action": ["s3:DeleteObject", "s3:DeleteObjectVersion", "s3:PutBucketPolicy"],
      "Resource": [
        "arn:aws:s3:::central-audit-logs",
        "arn:aws:s3:::central-audit-logs/*"
      ],
      "Condition": {
        "StringNotEquals": {
          "aws:PrincipalArn": "arn:aws:iam::999988887777:role/LogArchiveBreakGlass"
        }
      }
    }
  ]
}
```

세 개의 문장이 각각 다른 일을 한다. 첫 번째는 CloudTrail이 버킷 소유권을 확인하기 위해 필요한 `s3:GetBucketAcl`이고(이게 빠지면 trail 생성 자체가 실패한다), 두 번째가 실제 쓰기 허용이며, 세 번째는 그 누구도 로그를 지우지 못하게 하는 Deny다.

> ⚠️ **함정**: `aws:SourceArn` 조건을 빠뜨리면 **Confused Deputy** 문이 열린다. `cloudtrail.amazonaws.com`이라는 서비스 주체는 전 세계 모든 계정이 공유하는 이름이므로, 조건 없이 허용하면 *아무 계정이나* 자기 trail을 만들어 남의 로그 버킷에 데이터를 쏟아부을 수 있다. 로그 버킷이 쓰레기로 오염되면 조사 비용과 저장 비용이 함께 오르고, 최악의 경우 위조된 로그가 진짜 로그 사이에 섞인다. 서비스 주체를 허용하는 모든 리소스 정책에서 `aws:SourceArn` 또는 `aws:SourceAccount`/`aws:SourceOrgID` 조건은 선택이 아니라 필수라고 외워 두는 편이 낫다.

> 🔍 **더 깊이**: 조직 trail을 설계할 때 자주 놓치는 결정이 **위임 관리자(delegated administrator)** 를 쓸 것인가다. 관리 계정에서 직접 trail을 만들면 감사 구성을 바꾸려는 사람이 곧 조직 전체의 최고 권한을 가진 계정에 들어가야 한다 — 즉 감사 운영을 위해 가장 위험한 계정을 자주 열게 된다. CloudTrail은 조직 내 특정 계정을 위임 관리자로 지정해 그 계정에서 조직 trail을 관리하게 할 수 있고, 이렇게 하면 "일상적 감사 운영"과 "조직 최상위 권한"을 분리할 수 있다. 최소 권한은 정책 문서만의 문제가 아니라 *어떤 계정에 얼마나 자주 로그인해야 하는가*의 문제이기도 하다.

```
[ 멀티계정 감사 데이터의 흐름 ]

  관리 계정 / 위임 관리자
  ┌──────────────────────────┐
  │ organization trail 정의   │  ← 멤버는 조회만 가능, 끄거나 지울 수 없다
  └───────────┬──────────────┘
              │ 구성이 조직 전체에 자동 전파(신규 계정 자동 포함)
   ┌──────────┼───────────────┬───────────────┐
   ▼          ▼               ▼               ▼
 계정 A     계정 B          계정 C        (내일 합류할 계정 D)
 모든 리전  모든 리전       모든 리전       가입 즉시 자동 적용
   │          │               │               │
   └──────────┴───────┬───────┴───────────────┘
                      ▼
            로그 아카이브 계정 (별도 자격증명 경계)
            s3://central-audit-logs
              ├─ 버킷 정책: 서비스 주체 + SourceArn만 쓰기
              ├─ 버전 관리 + Object Lock (4일차)
              ├─ SSE-KMS 전용 CMK (4일차)
              └─ 운영팀 접근 권한 없음 / 보안팀만 읽기
```

이 그림에서 화살표가 **한 방향뿐**이라는 점이 설계의 전부다. 로그는 운영 계정에서 아카이브 계정으로 들어가기만 하고, 반대로 아카이브 계정의 데이터를 운영 계정 쪽에서 건드릴 경로가 없다. 운영 계정이 전부 장악당해도 이미 도착한 로그는 손대지 못한다.

## 로그 파일 무결성 검증(Log File Integrity Validation)

감사 로그의 가치는 "변조되지 않았다"는 신뢰에서 나온다. CloudTrail은 이를 암호학적으로 보장하는 **log file integrity validation**을 제공한다. 활성화하면 CloudTrail은 매시간 **digest 파일**을 생성해 S3에 별도로 저장한다.

작동 원리:
1. 각 로그 파일의 SHA-256 **해시**를 계산한다.
2. 시간별 digest 파일에 그 해시들과 *이전 digest 파일의 해시*를 함께 기록한다 — 즉 digest들이 **해시 체인(hash chain)**으로 연결된다.
3. digest 파일은 CloudTrail 비공개 키로 **RSA 서명**된다. 검증은 AWS 공개 키로 수행한다.

```bash
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:us-east-1:111122223333:trail/org-audit-trail \
  --start-time 2026-06-20T00:00:00Z
```

> 💡 **관련 이론**: 이 구조는 블록체인·Git이 쓰는 *Merkle 체인/append-only 무결성*과 같은 발상이다. 누군가 과거 로그 파일 하나를 지우거나 내용을 바꾸면 해당 파일의 SHA-256이 digest의 기록과 어긋나고, digest를 위조하려 해도 RSA 서명과 이전 digest로 이어지는 체인이 깨진다. 즉 *탐지 가능한 변조(tamper-evident)*를 만든다. 단, 이것은 변조를 *막는* 것이 아니라 *증명*하는 메커니즘이다. 변조 자체를 막으려면 S3 Object Lock(4일차)이 필요하다.

> ⚠️ **함정**: 무결성 검증은 "로그가 변경되지 않았음을 증명"하지 처음부터 누락된(애초에 기록 안 된) 이벤트를 복구하지 못한다. 또 digest 파일까지 삭제되면 그 구간의 검증이 불가능해지므로, 로그·digest를 별도 계정·Object Lock으로 보호하는 것이 완성된 통제다.

### digest 파일 안을 열어 보기

digest는 그냥 해시 목록이 아니다. *이전 digest를 가리키는 포인터와 그 해시*를 함께 들고 있어서 시간 순으로 끊기지 않는 사슬을 이룬다.

```json
{
  "awsAccountId": "111122223333",
  "digestStartTime": "2026-06-24T07:00:00Z",
  "digestEndTime":   "2026-06-24T08:00:00Z",
  "digestS3Bucket": "central-audit-logs",
  "digestS3Object": "AWSLogs/111122223333/CloudTrail-Digest/ap-northeast-2/2026/06/24/…json.gz",
  "digestPublicKeyFingerprint": "d1a2b3c4…",
  "digestSignatureAlgorithm": "SHA256withRSA",
  "previousDigestS3Bucket": "central-audit-logs",
  "previousDigestS3Object": "AWSLogs/111122223333/CloudTrail-Digest/ap-northeast-2/2026/06/24/…json.gz",
  "previousDigestHashValue": "9f2c…",
  "previousDigestHashAlgorithm": "SHA-256",
  "logFiles": [
    {
      "s3Bucket": "central-audit-logs",
      "s3Object": "AWSLogs/111122223333/CloudTrail/ap-northeast-2/2026/06/24/…json.gz",
      "hashValue": "4b8e…",
      "hashAlgorithm": "SHA-256",
      "newestEventTime": "2026-06-24T07:59:41Z",
      "oldestEventTime": "2026-06-24T07:00:12Z"
    }
  ]
}
```

digest 자체의 RSA 서명은 파일 본문이 아니라 그 **S3 객체의 메타데이터**에 담긴다. 그래서 digest를 다운로드해 눈으로 읽을 때는 서명이 보이지 않고, 검증 도구가 객체 메타데이터를 함께 읽어 확인한다.

```
[ 무결성 검증 체인: 무엇이 무엇을 보증하는가 ]

  07시 digest ◀────┐          08시 digest ◀────┐          09시 digest
  ├ logFiles[]     │          ├ logFiles[]     │          ├ logFiles[]
  │  └ SHA-256 ──▶ 07시 로그   │  └ SHA-256 ──▶ 08시 로그   │  └ SHA-256 ──▶ 09시 로그
  ├ prevHash ──────┘(06시)    ├ prevHash ──────┘(07시)    ├ prevHash ──┘(08시)
  └ RSA 서명(AWS 개인키)       └ RSA 서명                  └ RSA 서명
        ▲                            ▲                          ▲
        └──────── 검증은 AWS 공개키로 수행 ───────────────────────┘

  ① 로그 한 줄만 고쳐도  → 그 파일의 SHA-256이 digest의 기록과 불일치
  ② digest를 고쳐서 맞추려 하면 → RSA 서명이 깨진다
  ③ digest를 통째로 갈아 끼우면 → 다음 digest의 prevHash와 사슬이 끊긴다
  ④ digest를 삭제하면 → 그 구간이 "검증 불가"로 뜬다 (조용히 통과하지 않는다)
```

④가 실무에서 가장 중요하다. 무결성 검증의 목적은 "모두 정상"이라는 초록 불을 보는 것이 아니라, **비정상이 절대 조용히 지나가지 않게** 만드는 것이다. 지워진 구간은 "없는 것"이 아니라 "구멍"으로 보고된다.

```bash
# 지정 구간의 로그·digest를 내려받아 해시와 서명을 모두 검증한다
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:ap-northeast-2:111122223333:trail/org-audit-trail \
  --start-time 2026-06-20T00:00:00Z \
  --end-time   2026-06-25T00:00:00Z \
  --verbose
```

출력에서 눈여겨봐야 하는 세 가지 문장은 (1) 검증한 digest·로그 파일 개수, (2) 유효하지 않은 것으로 판정된 파일 목록, (3) **찾을 수 없는(삭제된) 파일 목록**이다. 감사관에게 제출할 증거는 (1)만이 아니라 (2)와 (3)이 비어 있다는 사실까지 포함해야 완성된다.

> ⚠️ **함정**: 무결성 검증은 **검증하려는 로그와 digest가 원래 위치에 그대로 있을 때만** 동작한다. 비용 절감을 위해 로그를 Glacier Deep Archive로 내리거나 다른 버킷으로 옮겨 두었다면 `validate-logs`는 파일을 찾지 못한다. 그래서 "7년 보존 + 무결성 검증"을 요구받았을 때는 수명주기 정책의 계층 이동 시점과 감사 시 복원(restore) 소요 시간을 함께 설계해야 한다. 보존 요구를 만족시키려다 검증 가능성을 잃는 것은 흔한 자책골이다.

> 💡 **관련 이론**: 여기서 무결성 검증이 보증하는 것과 보증하지 못하는 것을 정확히 나눠 두자. 보증하는 것은 "CloudTrail이 **기록한 뒤** 아무도 그것을 바꾸지 않았다"이다. 보증하지 못하는 것은 "CloudTrail이 **기록하기 전** 단계에서 일어난 일"이다. 즉 데이터 이벤트가 꺼져 있어서 애초에 남지 않은 활동, trail이 정지돼 있던 시간대, 로깅되지 않는 API — 이런 공백은 아무리 완벽한 해시 체인으로도 메울 수 없다. 증거의 사슬(chain of custody)은 *증거가 생성되는 순간*부터 시작되고, 그 이전은 사슬이 아니라 신뢰의 문제다. 그래서 "무결성 검증을 켰으니 안전하다"는 말은 성립하지 않으며, 반드시 **로깅 범위(무엇을 남기는가) + 지속성(끊기지 않는가) + 무결성(변조되지 않는가)** 세 가지를 함께 이야기해야 한다.

## CloudTrail Lake: 감사 로그를 쿼리 가능한 데이터 레이크로

전통적 trail은 로그를 S3에 JSON으로 떨군다. 조사하려면 Athena 테이블을 만들거나 직접 파싱해야 한다. **CloudTrail Lake**는 이벤트를 *불변(immutable)* 데이터 스토어에 저장하고 **SQL로 직접 쿼리**하게 해준다. 보존 기간은 최대 10년(extendable retention).

```sql
SELECT eventTime, userIdentity.arn, eventName, sourceIPAddress
FROM event_data_store_id
WHERE eventName = 'ConsoleLogin'
  AND element_at(additionalEventData, 'MFAUsed') = 'No'
  AND eventTime > '2026-06-01 00:00:00'
ORDER BY eventTime DESC;
```

CloudTrail Lake의 강점:
- **즉시 쿼리**: ETL·Athena 설정 없이 SQL 실행.
- **이벤트 데이터 스토어**: 관리·데이터·Insights 이벤트뿐 아니라 **외부 소스**(다른 AWS 서비스, on-prem, SaaS 감사 로그)도 수집 가능.
- **조직 단위 집계**와 federation을 통한 Athena 연동 지원.

> 🎯 **시나리오**: "보안 분석가가 코딩 없이 지난 2년치 CloudTrail을 SQL로 임시 조사하길 원한다." 정답은 CloudTrail Lake. S3 + Athena도 가능하지만 테이블·파티션 관리 오버헤드가 있고, Lake는 보존·불변성·쿼리를 한 번에 제공한다. 단 Lake는 수집·저장 비용 모델이 trail과 다르므로 "최저 비용 단순 보관"이 목표면 여전히 S3 trail이 낫다.

### Trail(S3+Athena) vs Lake: 무엇을 기준으로 고르나

| 판단 기준 | Trail + S3 (+Athena) | CloudTrail Lake |
|-----------|----------------------|-----------------|
| 조사 준비 비용 | 테이블 DDL·파티션·권한 구성 필요 | 없음(만들면 바로 SQL) |
| 저장 비용 | 낮음(S3 요금 + 수명주기로 계층화 가능) | 상대적으로 높음 |
| 원본 증거 보관 | S3 객체 자체가 원본, Object Lock으로 잠글 수 있음 | 스토어가 불변이지만 객체 단위 통제는 불가 |
| 무결성 검증 | `validate-logs`의 해시 체인 사용 가능 | 스토어 불변성에 의존 |
| 외부 로그 통합 | 별도 ETL 필요 | 외부 소스 수집 지원 |
| 보존 상한 | S3 정책에 따름(사실상 제한 없음) | 최대 10년 |
| 다른 도구로 내보내기 | 자유(모든 도구가 S3를 읽는다) | 쿼리 결과 내보내기 중심 |

시험이 **"규정 준수·장기 보존·최저 비용"** 을 말하면 S3 trail이고, **"분석가가 코드 없이 즉시 조사"** 를 말하면 Lake다. 그리고 실무의 정답은 대개 둘 다다 — 증거의 원본은 Object Lock이 걸린 S3에 두고, 조사 편의를 위한 사본을 Lake에 둔다. 원본과 작업 사본을 나누는 것은 디지털 포렌식의 기본 원칙이기도 하다.

```sql
-- Lake: 특정 액세스 키의 활동 전체를 시간 순으로 (조사 타임라인 만들기)
SELECT eventTime, eventSource, eventName, sourceIPAddress, errorCode
FROM event_data_store_id
WHERE userIdentity.accessKeyId = 'ASIAEXAMPLEKEY'
ORDER BY eventTime;

-- Lake: 조직 전체에서 IAM 권한이 확대된 순간들만 골라내기
SELECT eventTime, recipientAccountId, userIdentity.arn, eventName
FROM event_data_store_id
WHERE eventSource = 'iam.amazonaws.com'
  AND eventName IN ('AttachUserPolicy', 'AttachRolePolicy', 'PutUserPolicy',
                    'PutRolePolicy', 'CreateAccessKey', 'UpdateAssumeRolePolicy')
  AND eventTime > '2026-06-01 00:00:00'
ORDER BY eventTime DESC;
```

두 번째 쿼리가 침해 조사에서 특히 자주 쓰인다. 공격자의 목표가 초기 접근 그 자체인 경우는 거의 없고, 대부분 **권한 상승(privilege escalation)** 을 거쳐 목표 데이터에 닿는다. 그래서 "IAM 관련 쓰기 호출"만 따로 뽑아 시간 순으로 늘어놓으면 공격 서사의 뼈대가 그대로 드러난다. `recipientAccountId`를 함께 뽑는 이유는 조직 단위 스토어에서 어느 계정의 사건인지 구분하기 위해서다.

> 🔍 **더 깊이**: CloudTrail Lake의 이벤트 데이터 스토어는 생성할 때 **보존 기간과 수집 범위를 정하고, 그 뒤에는 이미 수집된 이벤트를 개별로 지울 수 없다.** 이 불변성이 감사 도구로서의 가치이지만 동시에 함정이기도 하다 — 넓게 잡아 만든 스토어는 나중에 "너무 많이 담긴다"고 판단해도 이미 들어온 데이터의 비용을 되돌릴 수 없기 때문이다. 그래서 Lake를 도입할 때는 (1) 좁은 범위·짧은 보존으로 시작해 실제 쿼리 패턴을 관찰하고, (2) 조사에 정말 필요한 이벤트 종류가 확인된 뒤 범위를 넓히는 순서가 안전하다. 불변 저장소는 "지울 수 없다"가 장점이자 청구서라는 점을 늘 함께 기억해야 한다.

## CloudTrail과 실시간 대응 연결

CloudTrail은 기록 도구이지만, **CloudWatch Logs**로 이벤트를 흘려보내거나 **EventBridge** 규칙과 결합하면 거의 실시간 탐지·대응이 가능하다. 예: "루트 계정 로그인" 또는 "CloudTrail 비활성화(`StopLogging`)" 이벤트를 EventBridge로 잡아 SNS 알림·Lambda 자동 대응을 트리거.

```json
{
  "Name": "detect-cloudtrail-tampering",
  "EventPattern": {
    "source": ["aws.cloudtrail"],
    "detail-type": ["AWS API Call via CloudTrail"],
    "detail": {
      "eventSource": ["cloudtrail.amazonaws.com"],
      "eventName": ["StopLogging", "DeleteTrail", "UpdateTrail",
                    "PutEventSelectors", "DeleteEventDataStore"]
    }
  },
  "Targets": [
    { "Id": "notify-secops", "Arn": "arn:aws:sns:ap-northeast-2:999988887777:secops-critical" },
    { "Id": "auto-restart",  "Arn": "arn:aws:lambda:ap-northeast-2:999988887777:function:ReenableTrail" }
  ]
}
```

같은 탐지를 CloudWatch Logs 쪽에서 만들 수도 있다. trail을 CloudWatch Logs로도 보내고 있다면 **메트릭 필터 + 경보**가 고전적인 구현이며, CIS AWS Foundations Benchmark가 요구하는 다수의 모니터링 항목이 정확히 이 형태다.

```bash
# 루트 계정 사용을 메트릭으로 뽑아 경보에 연결하는 고전 패턴
aws logs put-metric-filter \
  --log-group-name /aws/cloudtrail/org-audit-trail \
  --filter-name RootAccountUsage \
  --filter-pattern '{ $.userIdentity.type = "Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != "AwsServiceEvent" }' \
  --metric-transformations \
      metricName=RootAccountUsageCount,metricNamespace=CISBenchmark,metricValue=1

aws cloudwatch put-metric-alarm \
  --alarm-name RootAccountUsageAlarm \
  --namespace CISBenchmark --metric-name RootAccountUsageCount \
  --statistic Sum --period 300 --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:ap-northeast-2:999988887777:secops-critical
```

필터 패턴의 `$.userIdentity.invokedBy NOT EXISTS` 조건이 중요하다. 이것이 없으면 AWS 서비스가 계정을 대신해 수행하는 정상 동작까지 "루트 사용"으로 잡혀 경보가 늑대 소년이 된다. **탐지 규칙의 품질은 무엇을 잡느냐보다 무엇을 걸러내느냐로 결정된다** — 오탐이 잦은 규칙은 몇 주 안에 무시되고, 무시되는 규칙은 없는 규칙과 같다.

> ⚠️ **함정**: EventBridge 기반 탐지와 S3 전달은 **속도가 다르다.** EventBridge로 흐르는 관리 이벤트는 거의 실시간에 가깝지만, trail이 S3에 로그 파일을 떨구는 것은 일반적으로 API 호출 후 수 분에서 15분 안팎이 걸린다. 그래서 "즉시 탐지·차단"이 요구되면 답은 EventBridge(또는 CloudWatch Logs 구독)이지 "S3 로그를 주기적으로 스캔"이 아니다. 반대로 "지난 분기 전체를 훑어 이상을 찾아라"면 실시간 경로가 아니라 S3/Lake의 배치 분석이 답이다. 시험은 *실시간이냐 사후냐*를 단서로 이 둘을 가른다.

> 🔍 **더 깊이**: 공격자가 침투 후 가장 먼저 노리는 것 중 하나가 *로그 무력화*다 — `StopLogging`, `DeleteTrail`, `PutEventSelectors`로 데이터 이벤트 끄기 등. 그래서 성숙한 탐지 설계는 "CloudTrail 구성 변경 자체"를 감시 대상으로 둔다. EventBridge 규칙으로 `eventName in (StopLogging, DeleteTrail, UpdateTrail)`을 잡아 즉시 경보하고, organization trail로 멤버 계정에서 끌 수 없게 만들며, 로그를 별도 계정으로 보내 *공격자가 로그가 있는 계정의 권한을 얻어도 로그를 지울 수 없게* 한다. 이것이 2일차 AWS Config와 함께 "구성·활동 양면 감사"를 이룬다.

> 📚 **사례**: 공개된 클라우드 침해 대응 보고에서 반복적으로 확인되는 순서가 있다. ① 유출된 장기 액세스 키나 취약한 애플리케이션으로 초기 접근, ② `GetCallerIdentity`·`ListRoles`류 호출로 자신이 가진 권한 확인, ③ IAM 사용자·액세스 키를 새로 만들어 **지속성(persistence)** 확보, ④ 로깅·경보 무력화 시도, ⑤ 목표 데이터 접근. 이 순서가 중요한 이유는 **로그 무력화가 ①이 아니라 ④에 온다**는 점이다. 즉 공격자가 로그를 끄기 전까지의 ①~③은 이미 CloudTrail에 남아 있고, 조사에서 우리가 되찾아야 할 것이 바로 그 구간이다. 그래서 조직 trail(멤버가 끌 수 없음) + 별도 계정 전달(지울 수 없음) + `StopLogging` 경보(끄는 순간 알림)의 세 겹은 각각 다른 시점을 방어한다 — 끄지 못하게, 지우지 못하게, 껐다면 즉시 알게.

## 한 줄 요약

CloudTrail은 감사의 1차 증거이지만, **켜 두지 않은 것은 남지 않고 남지 않은 것은 조사할 수 없다.** 그래서 이 서비스의 학습은 세 개의 질문으로 압축된다. 첫째 *무엇을 남기는가* — 관리 이벤트는 기본이지만 "누가 데이터를 실제로 가져갔나"에 답하려면 데이터 이벤트를 미리 켜야 하고, 비용은 advanced event selector로 좁혀 감당한다. 둘째 *누가 끌 수 있는가* — 조직 트레일로 멤버가 끄지 못하게 하고, 로그를 별도 계정에 보내 지우지 못하게 하며, `StopLogging` 계열 호출은 EventBridge로 즉시 경보한다. 셋째 *그 기록을 믿을 수 있는가* — 로그 파일 무결성 검증의 SHA-256 해시 체인과 RSA 서명이 변조를 *증명*하고, 변조를 *막는* 일은 4일차의 Object Lock이 맡는다. 그리고 조사 현장에서 실제로 손이 가는 것은 결국 `userIdentity` 한 블록이다 — `type`으로 주체의 성격을 가르고, `AssumedRole`이면 `sessionContext`를 되짚어 진짜 신원을 찾고, `errorCode`가 몰린 구간에서 정찰의 지문을 읽는다.

---

## 📝 연습 문제

**문제 1.** S3 버킷에서 특정 객체를 누가 다운로드했는지 추적하려는데 기본 multi-region trail에 해당 `GetObject` 호출이 보이지 않는다. 원인과 해결로 옳은 것은?

A) `GetObject`는 글로벌 서비스 이벤트라서 us-east-1 trail이 필요하다  
B) `GetObject`는 데이터 이벤트라서 기본으로 기록되지 않으며, trail에 S3 data event selector를 추가해야 한다  
C) 로그 파일 무결성 검증을 켜야 데이터 이벤트가 기록된다  
D) Insights 이벤트를 활성화해야 한다  

**정답: B**  
해설: S3 객체 수준 작업(`GetObject`/`PutObject` 등)은 데이터 평면 작업인 데이터 이벤트이며 기본적으로 꺼져 있다. trail에 S3 data event selector(또는 advanced event selector)를 명시적으로 추가해야 기록된다. `GetObject`는 글로벌 서비스 이벤트가 아니고, 무결성 검증은 변조 탐지용이지 기록 대상을 늘리지 않으며, Insights는 호출 *비율* 이상 탐지로 개별 다운로드 추적과 무관하다.

---

**문제 2.** 200개 계정 조직에서 어떤 멤버 계정 관리자도 끄거나 변경할 수 없는 중앙 집중 감사를 보장해야 한다. 가장 적절한 설계는?

A) 각 멤버 계정에서 개별 trail을 만들고 정기적으로 점검한다  
B) 관리 계정에서 멀티리전 organization trail을 만들어 로그를 별도 로깅 전용 계정 S3 버킷에 집계한다  
C) Event history를 90일마다 내보내 보관한다  
D) 각 계정의 CloudWatch Logs를 수동으로 모은다  

**정답: B**  
해설: organization trail은 관리 계정(또는 위임 관리자)에서 생성되어 모든 멤버 계정에 자동 적용되며, 멤버 계정 관리자는 이를 끄거나 삭제할 수 없다. 새 계정도 자동 포함된다. 로그를 별도 로깅 계정으로 보내면 멤버 계정이 권한을 얻어도 로그를 변조할 수 없다. 개별 trail은 일관성·강제성이 없고, Event history는 90일·내보내기 불가, 수동 집계는 누락·변조에 취약하다.

---

**문제 3.** 컴플라이언스 감사관이 지난 3개월간 CloudTrail 로그 파일이 변조되지 않았음을 암호학적으로 증명하라고 요구한다. 어떤 기능이 이를 직접 제공하는가?

A) S3 버킷 버전 관리  
B) CloudTrail 로그 파일 무결성 검증(SHA-256 해시 + RSA 서명된 digest 체인)  
C) Insights 이벤트  
D) KMS 봉투 암호화  

**정답: B**  
해설: 로그 파일 무결성 검증은 각 로그 파일의 SHA-256 해시를 계산하고, 이를 RSA로 서명된 시간별 digest 파일에 기록하며, digest를 이전 digest와 해시 체인으로 연결한다. 따라서 로그나 digest의 어떤 변조도 검증 단계에서 탐지된다. 버전 관리는 덮어쓰기 이력만 남기고 암호학적 증명을 제공하지 않으며, Insights는 이상 탐지, KMS 암호화는 기밀성 통제로 무결성 *증명*과는 다르다.

---

**문제 4.** 보안 분석가가 별도 ETL나 Athena 테이블 구성 없이 지난 2년치 CloudTrail 이벤트를 SQL로 즉시 조사하길 원한다. 가장 적합한 것은?

A) Event history 콘솔에서 필터링  
B) CloudTrail Lake 이벤트 데이터 스토어에서 SQL 쿼리  
C) S3에 저장된 JSON을 매번 수동 파싱  
D) Insights 대시보드  

**정답: B**  
해설: CloudTrail Lake는 이벤트를 불변 데이터 스토어에 저장하고 SQL로 직접 쿼리하게 하며 최대 10년 보존을 지원한다. ETL이나 Athena 테이블·파티션 관리가 필요 없다. Event history는 90일·내보내기 불가, 수동 JSON 파싱은 비효율, Insights는 호출 비율 이상 탐지용 대시보드로 임의 SQL 조사를 제공하지 않는다.

---

**문제 5.** 침해 대응팀이 "공격자가 침투 후 CloudTrail을 끄는 행위(`StopLogging`)를 즉시 탐지·경보하라"고 요청한다. 가장 적절한 구성은?

A) trail의 로그 파일 무결성 검증만 켠다  
B) CloudTrail 관리 이벤트를 EventBridge 규칙(`eventName in [StopLogging, DeleteTrail, UpdateTrail]`)으로 매칭해 SNS·Lambda로 실시간 대응을 트리거한다  
C) 데이터 이벤트 선택기를 추가한다  
D) Insights 이벤트를 켜고 매주 검토한다  

**정답: B**  
해설: `StopLogging`/`DeleteTrail`/`UpdateTrail`은 관리 이벤트로 기록되며, EventBridge 규칙으로 이 이벤트를 실시간 매칭해 SNS 경보나 Lambda 자동 대응을 트리거할 수 있다. 무결성 검증은 사후 변조 증명이라 실시간 경보가 아니고, 데이터 이벤트 선택기는 데이터 평면 작업용이며, Insights는 비율 이상 탐지로 즉시성과 정밀도가 떨어진다. organization trail로 멤버 계정에서 끌 수 없게 하는 것도 보완책이다.

---
