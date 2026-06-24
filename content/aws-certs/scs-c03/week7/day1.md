# Day 1 - CloudTrail: 관리/데이터 이벤트, 조직 트레일, 로그 파일 무결성 검증, CloudTrail Lake

감사(audit)의 본질은 "누가, 언제, 무엇을, 어디서, 어떻게 했는가"를 사후에 재구성할 수 있게 만드는 것이다. AWS에서 이 질문에 답하는 1차 증거는 **CloudTrail**이다. CloudTrail은 계정 안에서 발생한 거의 모든 API 호출을 JSON 이벤트로 기록한다. 보안 시험의 관점에서 핵심은 "CloudTrail이 *무엇을* 기록하고 *무엇을* 기록하지 않는가", 그리고 "그 기록이 *변조되지 않았음*을 어떻게 증명하는가"이다.

CloudTrail은 두 가지 모드로 존재한다. 모든 계정에 기본 활성화되어 최근 90일치 관리 이벤트를 보여주는 **Event history**(저장·내보내기 불가, 단일 리전·읽기 전용 콘솔 뷰), 그리고 사용자가 명시적으로 만들어 S3에 영구 보관하는 **Trail**이다. 시험에서 "장기 보존", "포렌식", "규정 준수"가 나오면 Event history가 아니라 Trail 또는 CloudTrail Lake가 정답이다.

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

## CloudTrail과 실시간 대응 연결

CloudTrail은 기록 도구이지만, **CloudWatch Logs**로 이벤트를 흘려보내거나 **EventBridge** 규칙과 결합하면 거의 실시간 탐지·대응이 가능하다. 예: "루트 계정 로그인" 또는 "CloudTrail 비활성화(`StopLogging`)" 이벤트를 EventBridge로 잡아 SNS 알림·Lambda 자동 대응을 트리거.

> 🔍 **더 깊이**: 공격자가 침투 후 가장 먼저 노리는 것 중 하나가 *로그 무력화*다 — `StopLogging`, `DeleteTrail`, `PutEventSelectors`로 데이터 이벤트 끄기 등. 그래서 성숙한 탐지 설계는 "CloudTrail 구성 변경 자체"를 감시 대상으로 둔다. EventBridge 규칙으로 `eventName in (StopLogging, DeleteTrail, UpdateTrail)`을 잡아 즉시 경보하고, organization trail로 멤버 계정에서 끌 수 없게 만들며, 로그를 별도 계정으로 보내 *공격자가 로그가 있는 계정의 권한을 얻어도 로그를 지울 수 없게* 한다. 이것이 2일차 AWS Config와 함께 "구성·활동 양면 감사"를 이룬다.

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
