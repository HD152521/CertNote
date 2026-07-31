# Day 4 - 로그 무결성·보존·중앙화: S3 Object Lock, 교차 계정 로그 집계, KMS 암호화 로그

지금까지 무엇을 로깅하는지(CloudTrail, Config, Flow Logs, Resolver)를 배웠다. 오늘은 그 로그를 *어떻게 신뢰할 수 있게 보관하는가*를 다룬다. 감사 로그의 가치는 세 가지 속성에 달려 있다: **무결성**(변조되지 않음), **가용성·보존**(필요할 때 존재함), **기밀성**(허가된 자만 봄). 공격자와 내부자 모두 로그를 노린다 — 흔적을 지우기 위해. 그래서 "로그를 만든 사람조차 지울 수 없게" 만드는 것이 보안 로깅의 정점이다.

## 위협 모델: 왜 로그를 따로, 강하게 보호하는가

로그 보관 설계는 명확한 위협 모델에서 출발한다:
1. **공격자가 운영 계정 권한을 탈취** → 로그를 삭제·변조해 침해 흔적 제거.
2. **악의적 내부자** → 자신의 부정 활동 로그를 수정.
3. **실수·랜섬웨어** → 로그 우발적 삭제·암호화.

대응 원칙은 *세 가지*다: ① 로그를 **별도 계정**(로깅 전용 계정)으로 보내 운영 계정 침해와 격리, ② **Object Lock**으로 누구도(루트조차) 보존 기간 내 삭제·변조 불가, ③ **KMS 암호화**로 기밀성과 키 기반 접근 통제.

> 📚 **사례**: 랜섬웨어 사고 대응 보고에서 가장 자주 반복되는 문장은 "백업은 있었지만 백업도 함께 암호화·삭제되었다"이다. 그리고 두 번째로 자주 반복되는 문장이 "정확히 언제 침입했는지 알 수 없었다"이다. 두 문장은 같은 원인에서 나온다 — **백업과 로그가 침해된 자격증명의 사정거리 안에 있었기 때문**이다. 공격자 입장에서 이것은 선택이 아니라 표준 절차다. 복구 수단이 남아 있으면 몸값을 받을 수 없고, 흔적이 남아 있으면 침입 경로가 막힌다. 그래서 성숙한 조직의 로그 보관 설계는 "공격자가 관리자 권한을 가졌다고 가정"한 상태에서 시작한다. 이 가정 아래에서도 살아남는 통제는 딱 두 종류뿐이다 — 그 권한이 닿지 않는 **다른 계정**에 있거나, 권한과 무관하게 작동하는 **불변성(Object Lock Compliance)** 이 걸려 있거나.

### 위협과 통제를 1:1로 맞춰 보기

각 통제가 *어떤 위협을 막는지*를 분리해서 이해해야 과잉·과소 설계를 피한다.

| 위협 | 실패 시나리오 | 이를 막는 통제 | 이것만으로는 부족한 이유 |
|------|--------------|---------------|------------------------|
| 운영 계정 침해 | 공격자가 로그 버킷을 지움 | **별도 로깅 계정** | 로깅 계정 자체가 뚫리면? → Object Lock |
| 로깅 계정 권한 탈취 | 루트 권한으로 삭제 시도 | **Object Lock Compliance** | 애초에 안 남은 이벤트는 못 살림 → 로깅 범위 |
| 로그 내용 변조 | 한 줄만 조용히 수정 | **CloudTrail 무결성 검증** | 막지는 못함, 증명만 함 → Object Lock과 병행 |
| 로그 열람을 통한 정보 수집 | 로그에서 내부 구조·IP·ARN 파악 | **SSE-KMS + 키 정책 분리** | 키 권한을 가진 자는 여전히 읽음 → 최소 권한 |
| 서비스 주체를 빙자한 위조 쓰기 | 남의 로그가 섞임 | **`aws:SourceArn`/`SourceOrgID` 조건** | — |
| 로깅 자체를 끄는 행위 | 침해 직후 `StopLogging` | **조직 트레일 + SCP + 즉시 경보** | 끄기 전 구간은 이미 남아 있음 |
| 리전 전체를 안 보고 있음 | 감시 없는 리전에서 활동 | **멀티리전 트레일 + 전 리전 recorder** | — |

이 표를 보면 **어느 통제도 단독으로 완결되지 않는다**는 점이 드러난다. 그리고 각 행의 마지막 열이 다음 행의 통제를 가리키며 사슬을 이룬다. 보안 설계에서 "이것만 하면 되나요"라는 질문에 늘 "아니오"라고 답하게 되는 구조적 이유가 여기 있다.

> 💡 **관련 이론**: 이것은 보안의 고전 원칙 *separation of duties(직무 분리)*와 *defense in depth(심층 방어)*의 결합이다. 로그를 생성하는 주체와 로그를 보관·통제하는 주체를 분리하면, 한쪽이 침해돼도 다른 쪽이 무너지지 않는다. 회계의 "기록자와 감사자를 분리한다"는 원리와 같다. 로깅 계정은 *write-only inbound*만 받고 운영팀은 접근하지 못하게 해, 침해 시에도 증거의 사슬(chain of custody)이 보존된다.

## S3 Object Lock: WORM으로 변조 불가 보장

**S3 Object Lock**은 객체를 **WORM(Write Once Read Many)** 모델로 보호한다. 보존 기간 동안 객체 버전을 삭제·덮어쓸 수 없다. Object Lock은 *버킷 생성 시점에* 활성화해야 하며(나중 활성화는 지원 요청 필요), **버전 관리가 필수**다.

두 가지 보존 모드:
- **Governance mode**: 특정 IAM 권한(`s3:BypassGovernanceRetention`)을 가진 사용자는 보존을 우회·삭제할 수 있다. 운영 유연성이 필요한 경우.
- **Compliance mode**: **어떤 사용자도(루트 계정 포함) 보존 기간 내 삭제·변경 불가.** 한 번 설정한 보존 기간은 줄일 수도 없다. 규제 준수(SEC 17a-4 등)에 사용.

추가로 **Legal Hold**는 보존 기간과 무관하게 객체를 무기한 잠근다(소송 보존 등). 명시적으로 해제하기 전까지 유지된다.

```bash
# Compliance 모드로 7년 보존 잠금
aws s3api put-object-retention \
  --bucket central-audit-logs \
  --key 2026/06/24/CloudTrail/file.json.gz \
  --retention 'Mode=COMPLIANCE,RetainUntilDate=2033-06-24T00:00:00Z'

# 버킷 기본 보존 규칙
aws s3api put-object-lock-configuration \
  --bucket central-audit-logs \
  --object-lock-configuration \
    'ObjectLockEnabled=Enabled,Rule={DefaultRetention={Mode=COMPLIANCE,Years=7}}'
```

> ⚠️ **함정**: 시험에서 자주 묻는다 — "감사 로그를 *누구도, 심지어 루트 계정도* 보존 기간 내 삭제할 수 없게 하라." 정답은 **Object Lock Compliance mode**다. Governance mode는 `BypassGovernanceRetention` 권한자가 우회할 수 있으므로 "절대 불가" 요구를 만족하지 못한다. 또 Object Lock은 버킷을 *나중에* 켤 수 없고 생성 시 + 버전 관리가 전제임을 기억하라.

> 🎯 **시나리오**: "CloudTrail 로그를 7년간 규제 준수로 보관하되, 1일차의 무결성 검증과 결합해 변조를 *막고 동시에 증명*하라." 정답: organization trail → 로깅 계정 S3 버킷(Object Lock Compliance, 7년) + 로그 파일 무결성 검증 활성화. Object Lock이 변조를 *막고*, 무결성 검증의 해시 체인이 변조를 *증명*한다 — 예방과 탐지를 함께 건다.

### Governance · Compliance · Legal Hold를 한 표로

| 항목 | Governance 모드 | Compliance 모드 | Legal Hold |
|------|-----------------|-----------------|------------|
| 기간 | 객체 버전별 지정 | 객체 버전별 지정 | **기간 없음**(해제할 때까지) |
| 우회 가능 주체 | `s3:BypassGovernanceRetention` 보유자 | **없음**(루트 포함) | `s3:PutObjectLegalHold` 보유자가 해제 |
| 기간 단축 | 가능(우회 권한 필요) | **불가**(연장만 가능) | 해당 없음 |
| 실수 복구 | 가능 | **불가능** | 가능 |
| 수명주기 만료 | 보존 기간 내 삭제 안 됨 | 보존 기간 내 삭제 안 됨 | 해제 전까지 삭제 안 됨 |
| 전형적 용도 | 사내 정책·랜섬웨어 완화 | 법정 보존(SEC 17a-4 등) | 소송 대응(litigation hold) |

Governance와 Compliance의 실질적 차이는 딱 하나, **"실수를 되돌릴 수 있는가"** 다. Compliance로 7년을 걸어 두면 잘못 올린 객체도, 실수로 들어간 개인정보도 7년간 계정에 남아 스토리지 비용을 발생시킨다. 그래서 실무의 정석은 **비프로덕션은 Governance로 검증하고, 검증이 끝난 프로덕션 경로만 Compliance로** 가는 것이다. 시험 지문에 "누구도 삭제할 수 없어야 한다"가 명시되지 않았는데 Compliance를 고르면 과잉 설계다.

```bash
# Governance 모드 객체를 우회 권한으로 삭제하는 실제 형태
aws s3api delete-object \
  --bucket central-audit-logs \
  --key 2026/06/24/CloudTrail/file.json.gz \
  --version-id 3HL4kqtJvjVBH40Nrjfkd \
  --bypass-governance-retention          # Compliance 모드에서는 이 옵션이 통하지 않는다

# 특정 객체 버전에 걸린 보존 상태 확인 — 감사 증빙으로 자주 쓰인다
aws s3api get-object-retention \
  --bucket central-audit-logs \
  --key 2026/06/24/CloudTrail/file.json.gz \
  --version-id 3HL4kqtJvjVBH40Nrjfkd

aws s3api get-object-legal-hold \
  --bucket central-audit-logs \
  --key 2026/06/24/CloudTrail/file.json.gz \
  --version-id 3HL4kqtJvjVBH40Nrjfkd
```

> ⚠️ **함정**: Object Lock은 **객체 버전 단위**로 작동한다. 그래서 버킷 기본 보존 규칙을 *나중에* 설정하면, 그 이전에 이미 올라온 객체들에는 아무 보존도 걸려 있지 않다. "Object Lock을 켰으니 이 버킷의 로그는 전부 안전하다"는 말은 **규칙을 켠 시점 이후에 도착한 객체에 대해서만** 참이다. 기존 객체까지 잠그려면 개별 객체 버전에 보존을 지정하거나 S3 Batch Operations로 일괄 적용해야 한다. 1일차의 "로깅은 소급 적용되지 않는다"와 정확히 같은 형태의 함정이며, 이 주 전체를 관통하는 원리다 — **통제는 언제나 켠 시점부터만 유효하다.**

> ⚠️ **함정**: digest 파일을 빠뜨리는 실수가 잦다. CloudTrail은 로그를 `AWSLogs/…/CloudTrail/…`에, digest를 `AWSLogs/…/CloudTrail-Digest/…`에 **서로 다른 접두사**로 떨군다. 보존 규칙이나 수명주기를 접두사 필터로 걸면서 로그 쪽만 지정하면, 로그는 7년간 잠기지만 digest는 아무 보호 없이 남거나 수명주기로 만료돼 버린다. 그러면 로그는 존재하는데 **그 로그가 진짜인지 증명할 방법이 사라진다.** 무결성 체계는 로그와 digest가 짝일 때만 성립하므로, 두 접두사는 언제나 같은 보존·같은 보호를 받아야 한다.

### 보존·무결성 수단을 무엇으로 고를 것인가

| 수단 | 막는 것 | 못 막는 것 | 되돌릴 수 있나 |
|------|--------|-----------|---------------|
| 버전 관리 | 덮어쓰기·단순 삭제 | 버전 영구 삭제 권한자 | 예 |
| MFA Delete | 자격증명만 탈취한 공격자의 버전 삭제 | MFA를 가진 루트 | 예 |
| Object Lock Governance | 일반 사용자의 삭제 | 우회 권한 보유자 | 예 |
| Object Lock Compliance | **루트를 포함한 모든 삭제** | 애초에 기록 안 된 것 | **아니오** |
| 별도 계정 격리 | 운영 계정 침해의 전파 | 로깅 계정 자체의 침해 | 예 |
| 교차 리전 복제 | 리전 단위 사고·계정 사고 | 복제 이전 시점의 삭제 | 예 |
| 무결성 검증(digest) | (막지 못함) | — | 해당 없음(증명 수단) |
| SCP | 조직 내 주체의 로깅 무력화 | 조직 밖 주체·관리 계정 | 예 |

이 표의 마지막 두 열이 선택의 기준이다. 규제가 "삭제 불가"를 요구하면 되돌릴 수 없는 통제(Compliance)를 써야 하고, 운영 유연성이 필요하면 되돌릴 수 있는 통제를 겹쳐 쌓는다. **되돌릴 수 없는 통제는 강력한 만큼 되돌릴 수 없다** — 이 동어반복이 실제 사고의 원인이 된다.

## KMS 암호화 로그: 기밀성과 키 기반 접근 통제

로그에는 민감 정보(IP, 사용자 ARN, 리소스 이름, 때로 요청 파라미터)가 담긴다. **SSE-KMS**로 로그를 암호화하면 두 가지를 얻는다: ① 저장 데이터 기밀성, ② **KMS 키 정책으로 "복호화할 수 있는 자"를 통제** — 즉 버킷 접근 권한과 *별개의* 두 번째 자물쇠.

CloudTrail은 trail에 KMS 키를 지정하면 로그 파일을 SSE-KMS로 암호화한다. 이때 **KMS 키 정책**이 CloudTrail에 `kms:GenerateDataKey*`를 허용해야 한다.

```json
{
  "Sid": "Allow CloudTrail to encrypt logs",
  "Effect": "Allow",
  "Principal": { "Service": "cloudtrail.amazonaws.com" },
  "Action": "kms:GenerateDataKey*",
  "Resource": "*",
  "Condition": {
    "StringLike": {
      "kms:EncryptionContext:aws:cloudtrail:arn":
        "arn:aws:cloudtrail:*:111122223333:trail/*"
    }
  }
}
```

> 💡 **관련 이론**: 이것이 *cryptographic access control*의 힘이다. 버킷 정책으로 `s3:GetObject`를 허용해도, 객체가 KMS로 암호화돼 있고 그 사용자가 `kms:Decrypt` 권한이 없으면 *암호문만 받고 내용을 못 본다*. 두 자물쇠(S3 접근 + KMS 복호화)를 다른 정책으로 통제하면, 한 정책의 실수가 곧바로 유출로 이어지지 않는다. 특히 cross-account에서 KMS 키 권한을 분리하면 "로그를 받지만 키 소유자만 읽을 수 있는" 비대칭 통제가 가능하다.

> ⚠️ **함정**: cross-account로 로그를 보낼 때 KMS 암호화를 쓰면, *복호화하려는 계정/주체*가 KMS 키 정책에서 `kms:Decrypt` 권한을 받아야 한다. 키 정책과 버킷 정책 *둘 다* 맞아야 읽힌다. "버킷 권한은 줬는데 로그가 안 읽힌다"는 KMS 키 정책 누락이 흔한 원인이다.

CloudWatch Logs를 KMS로 암호화할 때는 키 정책의 모양이 또 다르다. 서비스 주체가 리전별 이름(`logs.<region>.amazonaws.com`)이고, 암호화 컨텍스트도 로그 그룹 ARN을 가리킨다.

```json
{
  "Sid": "Allow CloudWatch Logs to use the key",
  "Effect": "Allow",
  "Principal": { "Service": "logs.ap-northeast-2.amazonaws.com" },
  "Action": [
    "kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*",
    "kms:GenerateDataKey*", "kms:Describe*"
  ],
  "Resource": "*",
  "Condition": {
    "ArnLike": {
      "kms:EncryptionContext:aws:logs:arn":
        "arn:aws:logs:ap-northeast-2:111122223333:log-group:/aws/cloudtrail/*"
    }
  }
}
```

```bash
# 로그 그룹에 CMK 연결
aws logs associate-kms-key \
  --log-group-name /aws/cloudtrail/org-audit-trail \
  --kms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/aaaa-bbbb
```

> 🔍 **더 깊이**: 암호화 컨텍스트(`kms:EncryptionContext:*`)를 조건으로 거는 것이 왜 중요한가. 이 조건이 없으면 서비스 주체에게 "이 키로 무엇이든 복호화해도 좋다"고 허락하는 셈이 되고, 같은 서비스를 통해 만들어진 *다른 리소스*의 데이터까지 이 키로 다룰 수 있게 된다. 암호화 컨텍스트는 암호문에 묶여 저장되는 인증된 추가 데이터(AAD)이므로 위조할 수 없다 — 즉 "이 복호화 요청이 정말 그 로그 그룹의 데이터에 대한 것인가"를 KMS가 검증해 준다. 서비스 주체에게 KMS 권한을 줄 때 **`kms:ViaService`(어느 서비스를 통해서만) + 암호화 컨텍스트(어느 리소스에 대해서만)** 두 조건을 함께 거는 것이 표준 패턴이고, 이 둘이 빠진 키 정책은 사실상 "이 키를 그 서비스에 통째로 위임"한 것과 같다.

> 🎯 **시나리오**: "로그를 SSE-KMS로 암호화했더니 보안팀이 Athena 쿼리를 돌릴 때마다 실패한다." 원인 후보는 셋이다 — (1) 쿼리를 실행하는 역할에 `kms:Decrypt`가 없다, (2) 키 정책이 그 계정을 허용하지 않는다(교차계정이라면 **키 정책과 IAM 정책 양쪽 모두** 필요), (3) Athena 결과 출력 버킷이 다른 키로 암호화돼 있어 `kms:GenerateDataKey`가 필요한데 없다. 세 번째가 특히 잘 잊힌다 — 조사 도구는 로그를 *읽기만* 하는 것이 아니라 결과를 *쓰기도* 하기 때문이다.

## 교차 계정 로그 집계(Cross-Account Log Aggregation)

다계정 환경의 모범은 **중앙 로깅 계정(log archive account)**에 모든 로그를 모으는 것이다. AWS의 다계정 베이스라인(Control Tower의 Log Archive 계정)이 이 패턴을 표준화한다.

집계 방법은 로그 종류마다 다르다:

**S3 기반(CloudTrail, Config, Flow Logs → S3)**: 중앙 로깅 계정의 S3 버킷에 **버킷 정책**으로 다른 계정/서비스의 쓰기를 허용. organization trail은 이를 자동 구성한다.

```json
{
  "Sid": "AllowOrgCloudTrailWrite",
  "Effect": "Allow",
  "Principal": { "Service": "cloudtrail.amazonaws.com" },
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::central-audit-logs/AWSLogs/o-orgid/*/*",
  "Condition": {
    "StringEquals": {
      "s3:x-amz-acl": "bucket-owner-full-control",
      "aws:SourceOrgID": "o-exampleorgid"
    }
  }
}
```

**CloudWatch Logs 기반**: **CloudWatch Logs subscription filter**로 로그를 **Kinesis Data Stream/Firehose**(cross-account destination)로 보내 중앙 계정에 집계. 또는 각 계정의 CloudWatch Logs를 중앙으로 스트리밍.

중앙 계정 쪽에는 **destination**을 만들고 거기에 접근 정책을 붙인다. 이 정책이 "어느 계정이 이 목적지로 로그를 흘려보낼 수 있는가"를 정한다.

```bash
# ① 중앙 계정: 로그를 받을 목적지 생성
aws logs put-destination \
  --destination-name central-log-destination \
  --target-arn arn:aws:kinesis:ap-northeast-2:999988887777:stream/central-logs \
  --role-arn  arn:aws:iam::999988887777:role/CWLtoKinesisRole

# ② 중앙 계정: 조직 전체가 쓸 수 있게 목적지 정책 부여
aws logs put-destination-policy \
  --destination-name central-log-destination \
  --access-policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": "*",
      "Action": "logs:PutSubscriptionFilter",
      "Resource": "arn:aws:logs:ap-northeast-2:999988887777:destination:central-log-destination",
      "Condition": { "StringEquals": { "aws:PrincipalOrgID": "o-exampleorgid" } }
    }]
  }'

# ③ 각 멤버 계정: 구독 필터로 목적지에 연결
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/payments-api \
  --filter-name to-central \
  --filter-pattern "" \
  --destination-arn arn:aws:logs:ap-northeast-2:999988887777:destination:central-log-destination
```

②의 `aws:PrincipalOrgID` 조건이 핵심이다. `Principal: "*"` 만 두고 조건을 빼면 **인터넷상의 아무 AWS 계정이나** 우리 로그 파이프라인에 데이터를 밀어 넣을 수 있다. 로그 목적지는 "누구나 쓸 수 있어야 편한" 리소스처럼 느껴지기 때문에 이 조건이 자주 생략되고, 그 결과 로그 스트림이 오염되거나 비용이 폭증하는 사고가 난다.

| | S3 집계 | CloudWatch Logs 구독 집계 |
|---|--------|--------------------------|
| 지연 | 수 분~십수 분 | 거의 실시간 |
| 보존 | 사실상 무제한(수명주기·Object Lock) | 로그 그룹 보존 기간에 종속 |
| 불변성 | Object Lock 가능 | 불가 |
| 분석 | Athena·Lake·외부 SIEM | 스트림 소비자(Lambda·OpenSearch·SIEM) |
| 비용 | 저장 중심(저렴) | 수집·스트림 중심 |
| 적합한 용도 | **증거 보관·규제 대응** | **실시간 탐지·SIEM 연동** |

두 경로는 대체재가 아니라 **역할이 다른 병렬 경로**다. 규제 증거는 S3로, 실시간 탐지는 스트림으로 보내고 둘 다 유지하는 것이 표준이다. 시험이 "불변 보관·7년"을 말하면 S3, "즉시 SIEM에 전달"을 말하면 구독 필터다.

> ⚠️ **함정**: `bucket-owner-full-control` ACL 조건과 `aws:SourceOrgID`(또는 `aws:SourceArn`) 조건을 함께 쓰는 이유가 있다. 전자는 다른 계정이 쓴 객체의 소유권이 *버킷 소유자*에게 가도록 보장해(아니면 쓴 계정이 객체를 통제) 중앙 계정이 모든 로그를 온전히 관리하게 한다. 후자는 *Confused Deputy* 공격(임의 외부 계정이 서비스 주체를 빙자해 쓰는 것)을 막는다. 둘 다 빠지면 보안 구멍이 된다.

## 종합 아키텍처: 변조 불가 중앙 감사 저장소

세 통제를 결합한 표준 설계:

```
[운영 계정들]                    [로그 아카이브 계정]
 CloudTrail (org trail) ──┐
 Config delivery ─────────┼──▶ S3 버킷
 VPC Flow Logs ───────────┘     ├─ Object Lock (Compliance, 7년)
 Resolver query logs ──────────▶├─ SSE-KMS (전용 CMK, 키 정책 분리)
                                 ├─ 버전 관리 활성화
                                 ├─ 버킷 정책: write-only inbound + SourceOrgID
                                 └─ 무결성 검증(CloudTrail digest)
       운영팀은 접근 불가 ─── 보안/감사팀만 read + kms:Decrypt
```

> 🔍 **더 깊이**: 이 아키텍처의 우아함은 *각 통제가 다른 위협을 막는다*는 데 있다. 별도 계정 = 운영 계정 침해 격리. Object Lock Compliance = 루트조차 보존 기간 내 삭제 불가(내부자·랜섬웨어 방어). KMS = 기밀성 + 복호화 권한 분리. 무결성 검증 = 변조의 암호학적 증명. SourceOrgID/bucket-owner ACL = confused deputy 방어. 어느 하나가 뚫려도 나머지가 버틴다. 그리고 모든 로그가 한 곳에 모이므로 3일차에서 본 다층 상관 분석(CloudTrail + Flow Log + Resolver)이 가능해진다. 내일(5일차)은 이 모든 조각 — 활동(CloudTrail), 구성(Config), 네트워크(Flow/Resolver), 무결성·보존·중앙화 — 을 하나의 침해 조사 시나리오로 엮는다.

## 예방 한 겹 더: SCP로 로깅 무력화 자체를 금지하기

조직 트레일은 멤버가 *그 트레일*을 끄지 못하게 한다. 하지만 멤버 계정에서 Config recorder를 멈추거나, 자기 계정의 flow log를 삭제하거나, 로그 그룹을 지우는 것은 별개의 문제다. 이 층은 **서비스 제어 정책(SCP)** 이 맡는다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyDisablingSecurityLogging",
      "Effect": "Deny",
      "Action": [
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail",
        "cloudtrail:UpdateTrail",
        "cloudtrail:PutEventSelectors",
        "config:StopConfigurationRecorder",
        "config:DeleteConfigurationRecorder",
        "config:DeleteDeliveryChannel",
        "config:DeleteConfigRule",
        "ec2:DeleteFlowLogs",
        "guardduty:DeleteDetector",
        "guardduty:UpdateDetector"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": [
            "arn:aws:iam::*:role/OrgSecurityAutomationRole",
            "arn:aws:iam::*:role/AWSControlTowerExecution"
          ]
        }
      }
    }
  ]
}
```

> ⚠️ **함정**: SCP에는 두 가지 유명한 한계가 있다. 첫째, **관리 계정에는 적용되지 않는다** — 그래서 관리 계정은 그 자체로 조직에서 가장 위험한 자산이며, 일상 작업에 쓰지 않는 것이 원칙이다. 둘째, SCP는 *권한의 상한*을 정할 뿐 권한을 부여하지 않으므로 SCP만으로는 아무것도 허용되지 않는다. 그리고 예외 역할(위 정책의 `ArnNotLike`)을 두는 순간, **그 역할을 맡을 수 있는 사람이 곧 로깅을 끌 수 있는 사람**이 된다. 예외는 반드시 최소한으로 두고, 그 역할의 `AssumeRole` 자체를 별도로 감시해야 한다. 통제에 낸 구멍은 문서에 적어 두지 않으면 몇 달 뒤 아무도 기억하지 못한다.

## 보존 비용과 검증 가능성의 충돌

7년 보존은 비용 문제를 동반하고, 비용을 줄이려 손대는 순간 검증 가능성이 흔들린다.

| 스토리지 계층 | 특징 | 로그 보관 관점의 판단 |
|--------------|------|---------------------|
| S3 Standard | 즉시 접근 | 최근 90일~1년 — 조사에 실제로 쓰이는 구간 |
| S3 Standard-IA | 저렴, 즉시 접근 | 1~2년차 로그에 적합 |
| Glacier Instant Retrieval | 더 저렴, 즉시 접근 | 드물게 보는 규제 보존 구간 |
| Glacier Flexible / Deep Archive | 가장 저렴, **복원 대기 필요** | 순수 규제 보존. 조사에 쓰기 어렵다 |

> ⚠️ **함정**: 로그를 Deep Archive로 내리면 `aws cloudtrail validate-logs`가 그 구간을 검증하지 못한다 — 객체를 즉시 읽을 수 없기 때문이다. "7년 보존 + 언제든 무결성 증명"이라는 두 요구를 동시에 받으면, 수명주기 전환 시점과 감사 시 복원 소요 시간을 함께 설계해야 한다. 실무에서 흔히 쓰는 절충은 **로그 본문은 깊게 내리되 용량이 작은 digest는 즉시 접근 계층에 남기는 것**이다. digest만 살아 있으면 최소한 "체인이 끊기지 않았다"는 사실은 언제든 확인할 수 있고, 전체 검증이 필요한 순간에만 본문을 복원하면 된다. 그리고 Object Lock이 걸린 객체는 보존 기간 내 수명주기로 **삭제되지 않는다** — 계층 이동은 되지만 만료는 안 된다는 구분을 기억해 두자.

```json
{
  "Rules": [
    {
      "ID": "logs-tiering",
      "Status": "Enabled",
      "Filter": { "Prefix": "AWSLogs/o-exampleorgid/" },
      "Transitions": [
        { "Days": 90,  "StorageClass": "STANDARD_IA" },
        { "Days": 365, "StorageClass": "GLACIER_IR" }
      ]
    },
    {
      "ID": "keep-digests-hot",
      "Status": "Enabled",
      "Filter": { "Prefix": "AWSLogs/o-exampleorgid/CloudTrail-Digest/" },
      "Transitions": [
        { "Days": 365, "StorageClass": "STANDARD_IA" }
      ]
    }
  ]
}
```

> 🔍 **더 깊이**: 로그를 여러 계정·여러 형식으로 모으다 보면 결국 "스키마가 제각각이라 상관 분석이 어렵다"는 문제에 도달한다. CloudTrail은 JSON, Flow Log는 공백 구분 텍스트, Resolver 로그는 또 다른 JSON, 서드파티 보안 제품은 자체 포맷이다. AWS **Security Lake**는 이 문제를 겨냥한 서비스로, 여러 소스의 보안 로그를 계정 소유의 S3에 모으면서 **OCSF(Open Cybersecurity Schema Framework)** 라는 공통 스키마로 정규화하고, 구독자(분석 도구·SIEM)에게 표준화된 접근을 제공한다. 시험 관점에서 기억할 구분은 이렇다 — 지금까지 배운 조립(조직 트레일 + 로깅 계정 + Object Lock + KMS)은 **내가 직접 만드는 중앙 저장소**이고, Security Lake는 **정규화와 구독자 관리까지 관리형으로 받는 선택지**다. "여러 소스의 로그를 공통 스키마로 정규화해 분석 도구에 제공"이라는 문구가 나오면 Security Lake를 떠올리되, "최저 비용으로 원본 로그를 불변 보관"이면 여전히 S3 + Object Lock이다.

## 감사 대응 런북: 실제로 무엇을 찍어 보이나

감사관이 "감사 로그가 신뢰할 수 있음을 증명하라"고 요구했을 때 실행할 명령의 순서다. 이 순서 자체가 오늘 배운 통제들의 목록이기도 하다.

```bash
# ① 트레일이 존재하고, 조직 단위이며, 멀티리전이고, 지금 기록 중인가
aws cloudtrail describe-trails --query 'trailList[].{n:Name,org:IsOrganizationTrail,multi:IsMultiRegionTrail,valid:LogFileValidationEnabled,kms:KmsKeyId,bucket:S3BucketName}'
aws cloudtrail get-trail-status --name org-audit-trail --query '{logging:IsLogging,lastDelivery:LatestDeliveryTime,lastError:LatestDeliveryError}'

# ② 로그 버킷이 불변으로 보호되고 있는가
aws s3api get-object-lock-configuration --bucket central-audit-logs
aws s3api get-bucket-versioning        --bucket central-audit-logs
aws s3api get-bucket-encryption        --bucket central-audit-logs
aws s3api get-public-access-block      --bucket central-audit-logs

# ③ 아무나 쓰거나 지울 수 없는가
aws s3api get-bucket-policy --bucket central-audit-logs --query Policy --output text

# ④ 실제로 변조가 없었는가 (감사 대상 구간 전체)
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:ap-northeast-2:111122223333:trail/org-audit-trail \
  --start-time 2026-01-01T00:00:00Z --end-time 2026-06-30T00:00:00Z

# ⑤ 로깅을 끄려 한 시도가 있었는가
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=StopLogging
```

①의 `LatestDeliveryError`가 특히 중요하다. 이 필드에 값이 있으면 **트레일은 켜져 있는데 로그가 버킷에 도착하지 못하고 있다**는 뜻이다. 버킷 정책이 잘못 바뀌었거나, KMS 키가 비활성화됐거나, 버킷이 삭제된 경우다. 콘솔의 트레일 목록에서는 초록색으로 보이기 때문에 이 필드를 직접 확인하지 않으면 몇 주 동안 로그가 유실된 뒤에야 발견하게 된다. **"켜져 있다"와 "도착하고 있다"는 또 다른 말이다.**

## 정리하며

오늘의 주제를 한 문장으로 줄이면 이렇다 — **로그의 가치는 그것을 만든 사람조차 지울 수 없을 때 완성된다.** 그 상태에 도달하기 위해 네 겹이 필요하다. 첫째 **격리**: 로그를 별도 로깅 계정으로 보내 운영 계정의 침해가 증거에 닿지 못하게 한다. 둘째 **불변성**: Object Lock Compliance가 루트를 포함한 누구의 삭제도 막는다(Governance는 우회 가능하므로 "누구도"라는 요구를 만족하지 못한다). 셋째 **기밀성과 권한 분리**: SSE-KMS로 S3 접근과 복호화 권한을 두 개의 독립된 자물쇠로 나누고, `kms:ViaService`와 암호화 컨텍스트로 키 사용 경로를 좁힌다. 넷째 **증명**: CloudTrail digest의 해시 체인이 변조를 사후에 밝힌다.

그리고 이 네 겹 위에 두 개의 조건이 붙는다. 교차계정으로 로그를 받는 모든 리소스 정책에는 `bucket-owner-full-control`과 `aws:SourceArn`/`SourceOrgID`가 함께 있어야 하고(소유권 확보 + confused deputy 차단), SCP로 조직 내 누구도 로깅을 끄지 못하게 상한을 걸어야 한다. 마지막으로 잊지 말 것 — 비용을 줄이려 로그를 깊은 계층으로 내리는 순간 검증 가능성이 흔들린다. digest만이라도 즉시 접근 계층에 남겨 두는 것이 값싼 보험이다.

---

## 📝 연습 문제

**문제 1.** "감사 로그를 보존 기간 동안 *어떤 사용자도, 루트 계정조차* 삭제·변경할 수 없게 하라"는 규제 요구를 만족하는 것은?

A) S3 버전 관리만 활성화  
B) S3 Object Lock Governance 모드  
C) S3 Object Lock Compliance 모드  
D) 버킷 정책으로 Deny Delete 추가  

**정답: C**  
해설: Compliance 모드는 보존 기간 내 어떤 주체도(루트 포함) 객체 버전을 삭제·변경할 수 없으며 보존 기간을 줄일 수도 없다. Governance 모드는 `s3:BypassGovernanceRetention` 권한자가 우회할 수 있어 "절대 불가" 요구를 만족하지 못한다. 버전 관리만으로는 삭제 마커·만료가 가능하고, 버킷 정책 Deny는 정책 변경 권한자가 되돌릴 수 있다.

---

**문제 2.** 다계정 조직에서 한 운영 계정이 침해돼도 감사 로그가 변조·삭제되지 않도록 격리하는 가장 핵심적인 설계 원칙은?

A) 모든 로그를 각 운영 계정 내부에만 보관한다  
B) 로그를 운영팀이 접근할 수 없는 별도 로깅 전용 계정의 S3 버킷에 집계한다  
C) 로그를 CloudWatch Logs에만 보관한다  
D) 로그 보존 기간을 30일로 짧게 한다  

**정답: B**  
해설: 직무 분리·심층 방어 원칙에 따라 로그를 생성하는 운영 계정과 보관·통제하는 로깅 계정을 분리하면, 운영 계정이 침해돼도 공격자가 로그에 접근·변조할 수 없다. 같은 계정 내 보관은 침해 시 함께 노출되고, 짧은 보존은 오히려 증거를 잃으며, CloudWatch Logs 단독은 격리·불변성 보장이 약하다.

---

**문제 3.** 중앙 로깅 계정 버킷에 다른 계정의 CloudTrail이 객체를 쓸 때, 중앙 계정이 그 객체를 온전히 소유·관리하고 임의 외부 계정의 위조 쓰기를 막으려면 버킷 정책에 무엇이 필요한가?

A) `s3:x-amz-acl = bucket-owner-full-control` 조건과 `aws:SourceOrgID`(또는 SourceArn) 조건  
B) 퍼블릭 읽기 허용  
C) `s3:BypassGovernanceRetention` 허용  
D) KMS 키 삭제 권한  

**정답: A**  
해설: `bucket-owner-full-control` ACL 조건은 다른 계정이 쓴 객체의 소유권을 버킷 소유자에게 귀속시켜 중앙 계정이 온전히 관리하게 하고, `aws:SourceOrgID`/`aws:SourceArn` 조건은 서비스 주체를 빙자한 임의 외부 계정의 쓰기(confused deputy)를 차단한다. 퍼블릭 읽기는 위험하고, BypassGovernance·KMS 삭제 권한은 이 목적과 무관하며 오히려 위험하다.

---

**문제 4.** 로그를 SSE-KMS로 암호화한 cross-account 버킷에서, 보안팀 계정이 S3 GetObject 권한은 있는데 로그 내용을 읽지 못한다. 가장 가능성 높은 원인은?

A) Object Lock이 읽기를 막는다  
B) 보안팀 주체에게 KMS 키 정책상 `kms:Decrypt` 권한이 없다  
C) 버전 관리가 꺼져 있다  
D) 로그가 너무 오래됐다  

**정답: B**  
해설: SSE-KMS 객체를 읽으려면 S3 접근 권한과 별개로 KMS 키에 대한 `kms:Decrypt` 권한이 필요하다. 권한이 없으면 암호문은 받지만 복호화하지 못한다. 이 두 자물쇠(S3 + KMS) 분리가 암호학적 접근 통제의 핵심이다. Object Lock은 삭제·변경을 막을 뿐 읽기를 막지 않고, 버전 관리·로그 나이는 복호화 실패와 무관하다.

---

**문제 5.** CloudTrail 로그에 대해 변조를 *예방*하면서 동시에 변조 여부를 *증명*하려 한다. 가장 적절한 조합은?

A) Object Lock Compliance 모드(예방) + CloudTrail 로그 파일 무결성 검증(증명)  
B) KMS 암호화만  
C) 버킷 버전 관리만  
D) CloudWatch 경보만  

**정답: A**  
해설: Object Lock Compliance 모드는 보존 기간 내 삭제·변경 자체를 막아 변조를 *예방*하고, CloudTrail 로그 파일 무결성 검증(SHA-256 해시 체인 + RSA 서명 digest)은 변조가 있었는지를 암호학적으로 *증명*한다. 예방과 탐지를 함께 거는 설계다. KMS는 기밀성, 버전 관리는 이력 보존, 경보는 알림으로 각각 단독으로는 예방+증명을 모두 제공하지 못한다.

---
