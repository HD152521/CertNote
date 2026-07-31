# Day 5 - Week 5 종합: 암호화·키 관리 시나리오 통합 복습

이번 주는 데이터 보호의 첫 번째 축인 *암호화와 키 관리*를 다뤘다. KMS key의 종류와 이중 권한 모델(Day 1), 봉투 암호화와 데이터 키·암호화 컨텍스트(Day 2), 키 정책·grant·교차계정·ViaService(Day 3), 전송/저장 암호화와 키 회전(Day 4). 오늘은 이들을 하나의 결정 체계로 묶는다. 시험은 단편 지식보다 *"이 데이터 보호 요구에 어떤 키, 어떤 권한, 어떤 암호화 위치를 고르는가"*를 묻는다. 핵심 축은 **키 통제 수준 × 권한 메커니즘 × 암호화 위치(전송/저장/계층)**의 3차원이다.

복습을 시작하기 전에 이번 주 전체를 관통한 명제 하나를 확인하자. **암호화 자체는 거의 실패하지 않는다.** AES-256도, KMS의 HSM도, TLS 1.3도 뚫려서 사고가 나지는 않는다. 이번 주에 본 모든 실패는 예외 없이 *그 주변*에서 일어났다 — 평문 데이터 키를 디스크에 남기고, 암호화 컨텍스트에 비밀을 넣고, 키 정책의 위임 문장을 지우고, 교차계정에서 한쪽만 설정하고, 미암호화 스냅샷을 지우지 않고, 옛 키를 성급히 파기하는 식이다. 그래서 SCS의 데이터 보호 문항은 "무엇으로 암호화하는가"가 아니라 **"암호화를 둘러싼 운영과 권한이 어디서 깨지는가"** 를 묻는다.

## 주간 지도: 4일치를 하나의 그림으로

```
                          ┌──────────────────────────────┐
                          │      KMS key (CMK)           │  ← Day 1
                          │  · AWS owned / managed / CMK │
                          │  · 대칭 / 비대칭 / HMAC       │
                          │  · 키 자료는 HSM 밖으로 안 나옴 │
                          └───────────┬──────────────────┘
                                      │
        ┌─────────────────────────────┼──────────────────────────────┐
        │                             │                              │
   [ 누가 쓰는가 ]  Day 3        [ 어떻게 쓰는가 ] Day 2        [ 어디에 쓰는가 ] Day 4
        │                             │                              │
  ┌─────┴──────┐              ┌───────┴────────┐             ┌───────┴────────┐
  │ 키 정책 (필수)│              │ GenerateDataKey│             │ 저장: SSE-KMS   │
  │ IAM  (위임)  │              │  → 평문 DEK    │             │      EBS/RDS   │
  │ Grant(임시)  │              │  → 암호문 DEK  │             │ 전송: TLS 강제  │
  │ SCP (가드레일)│              │ 암호화 컨텍스트 │             │ 회전: 자동/수동 │
  └─────┬──────┘              └───────┬────────┘             └───────┬────────┘
        │                             │                              │
        └────────────┬────────────────┴──────────────┬───────────────┘
                     ▼                               ▼
            [ 조건으로 좁힌다 ]                [ 로그로 증명한다 ]
        ViaService · CallerAccount        CloudTrail (Decrypt/GenerateDataKey/
        EncryptionContext · PrincipalOrgID  CreateGrant/PutKeyPolicy)
        ResourceTag · RequestedRegion       AWS Config · Security Hub
```

이 그림의 아래 두 상자가 이번 주의 실질이다. 위쪽 세 갈래(키 종류·권한 메커니즘·암호화 위치)는 *선택지*이고, 아래 두 상자(조건으로 좁히기 · 로그로 증명하기)는 **어떤 선택을 하든 반드시 따라붙는 공통 요구**다. 시험에서 "가장 적절한 조치"를 고를 때, 두 보기가 비슷해 보이면 **조건으로 범위를 좁히고 로그로 증명까지 하는 쪽**이 거의 항상 정답이다.

## 통합 결정 매트릭스: 요구 → 선택

| 요구/상황 | 핵심 선택 | 이유 |
|-----------|-----------|------|
| 키 정책 편집·회전 통제·교차계정 공유 | customer managed key | AWS managed key는 정책 고정 |
| KMS 호출 권한 없는 외부가 암호화 | 비대칭 키(퍼블릭 배포) | 프라이빗 키 KMS 내부 유지 |
| 디지털 서명/검증 | 비대칭 키(SIGN_VERIFY) | 프라이빗 서명, 퍼블릭 검증 |
| 대용량 데이터 암호화 | 봉투 암호화(GenerateDataKey) | KMS는 4KB 한계 |
| 키 생성/암호화 주체 분리 | GenerateDataKeyWithoutPlaintext | 평문 키 노출 최소화 |
| 암호문을 특정 맥락에 바인딩 | 암호화 컨텍스트(AAD) | 무결성+권한 조건 |
| 임시·세밀·취소 가능 권한 | grant | 정책 비대화 방지 |
| grant 생성 직후 즉시 사용 | grant token 동봉 | 최종 일관성 전파 지연 우회 |
| grant를 AWS 서비스 경유로만 허용 | `kms:GrantIsForAWSResource` | CreateGrant는 권한 상승 경로 |
| 키 사용을 특정 서비스로 제한 | `kms:ViaService` 조건 | 직접 호출 차단 |
| 교차계정 키 사용 | 키 정책 허용 + 사용 계정 IAM | 양측 모두 필요 |
| 암호화된 스냅샷을 타 계정에 공유 | **customer managed key로 암호화** + 키 정책 위임 | AWS managed key는 공유 불가 |
| 리전을 넘어 같은 암호문을 복호화 | 멀티 리전 키(MRK) | 리전별 키는 암호문 상호운용 불가 |
| 리전별 데이터 주권·격리 요구 | 리전별 독립 키 | MRK는 키 자료가 여러 리전에 존재 |
| 조직 차원 키 가드레일 | SCP + `aws:PrincipalOrgID` | 삭제·외부공유 차단 |
| 키가 수백 개로 늘어난 환경의 권한 배분 | ABAC(`aws:ResourceTag` 매칭) | 정책 문서 폭발 방지 |
| S3 전송 암호화 강제 | `aws:SecureTransport` Deny | HTTP 원천 차단 |
| S3에 특정 KMS 키만 쓰도록 강제 | 버킷 기본 암호화 + `s3:x-amz-server-side-encryption-aws-kms-key-id` 조건 | 다른 키로의 저장 차단 |
| 기존 미암호화 RDS/EBS 암호화 | 스냅샷 → 암호화 복사 → 복원 | 토글 불가 |
| 운영 부담 없는 정기 회전 | 대칭 CMK 자동 회전 | 키 자료만 투명 갱신 |
| 비대칭/BYOK 키 회전 | 수동(새 키 + 별칭 갱신) | 자동 회전 미지원 |
| 옛 키 의존을 완전히 끊기 | `ReEncrypt` 배치 | 회전은 과거 데이터를 옮기지 않음 |
| KMS API 비용·throttling 완화 | S3 Bucket Key / DEK 캐싱 | 호출 횟수 감소 |
| 객체 단위 KMS 감사 로그 필수 | Bucket Key **끄기** | 컨텍스트가 버킷 단위로 바뀜 |
| 의심 키 즉시·가역 무력화 | 키 disable | 삭제는 비가역·대기 |
| 특정 고객 데이터만 영구 파기 | 고객별 키 + `ScheduleKeyDeletion` | crypto-shredding |
| 인증서 프라이빗 키 유출 위험 최소화 | ACM 발급 인증서 | 키를 추출할 수 없음 |

> 💡 **관련 이론**: 이 매트릭스의 바탕은 *"키를 통제하는 자가 데이터를 통제한다"*는 원칙이다. 암호화 알고리즘은 표준화·고정되어 있으므로 보안 설계의 변수는 거의 전부 *키의 소유·접근·수명·사용 경로*에 있다. 시험의 "best" 답은 보통 요구되는 통제 수준을 *정확히* 만족하면서 운영 부담과 노출 표면을 최소화하는 선택이다.

## 결정 트리: 요구 문장에서 정답으로

시험장에서는 매트릭스를 훑을 시간이 없다. 문장의 *동사와 제약*을 보고 두세 번 분기하면 답이 나오도록 미리 길을 만들어 둔다.

```
문항을 읽는다
  │
  ├─ "키 정책을 바꿔야" / "교차계정" / "회전 주기를 정해야" 가 나오는가?
  │    └─ YES → customer managed key 계열 보기만 남긴다
  │             (AWS managed / AWS owned key 보기는 즉시 탈락)
  │
  ├─ 데이터가 4KB보다 큰가? / "대용량", "파일", "볼륨"이 나오는가?
  │    └─ YES → 봉투 암호화(GenerateDataKey). Encrypt 직접 호출 보기 탈락
  │
  ├─ "KMS 호출 권한이 없는 상대" / "서명·검증"이 나오는가?
  │    └─ YES → 비대칭 키. 대칭 키 공유 보기 탈락
  │
  ├─ "임시" · "취소 가능" · "정책 수정 없이" 가 나오는가?
  │    └─ YES → grant
  │
  ├─ "직접 호출을 막아라" · "오직 <서비스>를 통해서만" 인가?
  │    └─ YES → kms:ViaService (+ kms:CallerAccount)
  │
  ├─ "테넌트/맥락별로 격리" 인가?
  │    ├─ 논리적 격리로 충분 → 단일 키 + 암호화 컨텍스트 조건
  │    └─ "개별 파기"·"암호학적 격리" 요구 → 테넌트별 키
  │
  ├─ "강제(enforce)" · "보장(ensure)" · "예외 없이" 가 나오는가?
  │    └─ YES → 옵션을 켜는 보기가 아니라 Deny 정책 / SCP / 기본값+Config 조합
  │
  ├─ "즉시" + "되돌릴 수 있게" 인가?
  │    ├─ YES → DisableKey
  │    └─ "영구히" · "복구 불가" → ScheduleKeyDeletion
  │
  └─ "다른 리전에서도" 인가?
       ├─ 복호화까지 필요 → 멀티 리전 키
       └─ 리전 격리가 요구 → 리전별 키 + 재암호화
```

이 트리에서 가장 자주 쓰이는 분기는 위에서 첫 번째와 일곱 번째다. **"customer managed key인가"** 와 **"강제인가 설정인가"** — 이 둘만 정확히 걸러도 보기 네 개 중 둘은 사라진다.

## 통합 시나리오

> 🎯 **시나리오 A — 멀티테넌트 SaaS 데이터 보호**: "수많은 테넌트의 큰 파일을 S3에 저장한다. 테넌트별로 복호화를 격리하고, KMS 호출 비용을 관리하며, 모든 키 사용을 감사하고, 키는 정기 회전해야 한다." 답: (1) **SSE-KMS** + customer managed key(감사·통제), (2) 객체별 **암호화 컨텍스트**에 `tenant=<id>`를 넣고 IAM/키 정책에서 `kms:EncryptionContext:tenant` 조건으로 테넌트 격리, (3) **S3 Bucket Key** 활성화로 KMS 호출 비용·throttling 완화, (4) **자동 키 회전**으로 운영 부담 없이 정기 회전, (5) **CloudTrail**로 모든 KMS 사용 감사. 이번 주 4일치 개념이 하나의 설계에 협력한다.

> ⚠️ **함정**: 시나리오 A에는 조용한 상충이 하나 숨어 있다. (3)의 **Bucket Key를 켜면 KMS로 가는 암호화 컨텍스트가 객체 ARN이 아니라 버킷 ARN 단위가 된다.** 만약 테넌트 격리를 `aws:s3:arn`의 객체 경로에 기대는 방식으로 설계했다면 Bucket Key 활성화와 동시에 그 조건이 깨진다. 그래서 시나리오 A의 격리는 **경로가 아니라 명시적 `tenant` 컨텍스트**로 잡아야 하고, 문항에 "객체 단위 KMS 감사 로그가 규제 요건"이라는 단서가 추가되면 Bucket Key 자체가 오답이 된다. *비용 최적화와 감사 해상도는 같은 축의 양 끝*이라는 점을 기억한다.

> 🎯 **시나리오 B — 교차계정 데이터 공유 + 거버넌스**: "보안 계정이 KMS 키를 소유·관리하고, 워크로드 계정들이 그 키로 암호화된 데이터를 쓰되, 일반 계정은 키를 삭제하거나 정책을 바꿀 수 없어야 한다." 답: (1) 보안 계정의 **키 정책**에서 워크로드 계정 역할에 `Decrypt`/`GenerateDataKey` 허용 + 워크로드 계정 **IAM**에서 키 ARN 작업 허용(양측), (2) `aws:PrincipalOrgID`로 조직 내부로 한정, (3) **SCP**로 일반 계정의 `kms:ScheduleKeyDeletion`·`kms:PutKeyPolicy` Deny, (4) 키 관리 권한은 보안팀 역할에만. 키 정책(세밀) + IAM(위임) + SCP(가드레일)의 3층 거버넌스.

이 설계를 키 정책 한 장으로 옮기면 다음과 같다. 이번 주에 배운 조건 키들이 한 문서 안에서 각자의 역할을 맡는 모습을 확인해 두자.

```json
{
  "Version": "2012-10-17",
  "Id": "shared-workload-key",
  "Statement": [
    {
      "Sid": "KeyAdministrationBySecurityTeamOnly",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::999988887777:role/SecurityKeyAdmin" },
      "Action": [
        "kms:Create*", "kms:Describe*", "kms:Enable*", "kms:List*",
        "kms:Put*", "kms:Update*", "kms:Revoke*", "kms:Disable*",
        "kms:ScheduleKeyDeletion", "kms:CancelKeyDeletion"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AllowWorkloadUseWithinOrganizationViaS3Only",
      "Effect": "Allow",
      "Principal": { "AWS": "*" },
      "Action": ["kms:Decrypt", "kms:GenerateDataKey*", "kms:DescribeKey"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalOrgID": "o-exampleorgid",
          "kms:ViaService": "s3.ap-northeast-2.amazonaws.com"
        }
      }
    },
    {
      "Sid": "AllowServiceCreatedGrantsOnly",
      "Effect": "Allow",
      "Principal": { "AWS": "*" },
      "Action": ["kms:CreateGrant", "kms:ListGrants", "kms:RevokeGrant"],
      "Resource": "*",
      "Condition": {
        "StringEquals": { "aws:PrincipalOrgID": "o-exampleorgid" },
        "Bool": { "kms:GrantIsForAWSResource": "true" }
      }
    },
    {
      "Sid": "DenyAnyUseWithoutTenantContext",
      "Effect": "Deny",
      "Principal": "*",
      "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey*"],
      "Resource": "*",
      "Condition": {
        "Null": { "kms:EncryptionContext:tenant": "true" }
      }
    }
  ]
}
```

네 문장의 역할이 각각 다르다. ①은 **관리 권한을 한 역할로 좁히고**(Day 3), ②는 **조직 경계 + 서비스 경로**로 사용을 이중으로 가두며(Day 3), ③은 **권한 재배포 경로를 AWS 서비스 통합으로만 한정**하고(Day 3), ④는 **컨텍스트 누락 자체를 금지**해 테넌트 격리를 우회할 수 없게 만든다(Day 2). `Principal: "*"` 이 조건과 함께 쓰였다는 점에 주의하자 — 조건이 없으면 이 문장은 전 세계 공개가 되지만, `aws:PrincipalOrgID`가 붙어 있으므로 실제 범위는 조직 내부다.

> 🎯 **시나리오 C — 외부 파트너 암호화 + 서명**: "KMS 호출 권한이 없는 파트너가 데이터를 암호화해 보내고, 우리가 발행한 문서의 무결성을 파트너가 검증할 수 있어야 한다." 답: (1) 파트너 암호화용 **비대칭 키(암호화/복호화)** — 퍼블릭 키 배포, 우리만 프라이빗 키로 복호화, (2) 문서 서명용 **비대칭 키(SIGN_VERIFY)** — 우리가 프라이빗 키로 서명, 파트너가 퍼블릭 키로 검증. 대칭 키로는 풀 수 없는 요구다.

> 🎯 **시나리오 D — 리전 장애에 대비한 암호화 데이터 DR**: "서울 리전의 암호화된 S3 데이터와 DynamoDB 테이블을 도쿄로 복제한다. 서울 리전 전체가 사용 불가가 되어도 도쿄에서 즉시 서비스를 이어야 하며, 복구 절차에 재암호화 단계가 들어가면 목표 복구 시간을 맞출 수 없다." 답: (1) **멀티 리전 키**를 만들고 도쿄에 복제본을 둔다 — 서울에서 만들어진 암호문을 도쿄 복제본이 그대로 푼다. (2) 복제본의 **키 정책은 자동 동기화되지 않으므로** IaC로 두 리전의 정책을 함께 관리한다. (3) S3 교차 리전 복제(CRR)에서는 대상 버킷의 암호화 키를 지정하고, 복제 역할에 원본 키의 `Decrypt`와 대상 키의 `GenerateDataKey`를 함께 준다. (4) 정기적으로 **도쿄에서만** 복호화가 되는지 실제로 검증하는 DR 훈련을 돌린다. 여기서 (4)가 실무의 핵심이다 — 키 정책 드리프트는 평시에 아무 증상이 없다가 장애 순간에만 드러난다.

> ⚠️ **함정**: 시나리오 D에서 "멀티 리전 키를 썼으니 리전 간 접근은 자동으로 된다"고 생각하면 안 된다. MRK는 *키 자료*를 공유할 뿐 **키 정책·grant·별칭은 리전마다 독립**이다. 서울에서 잘 돌던 워크로드가 도쿄에서 `AccessDenied`를 내는 전형적 원인이 이 독립성이다. 반대로 이 독립성은 장점이기도 하다 — 도쿄 복제본에는 DR 역할만 접근할 수 있게 좁혀 평시 노출을 줄일 수 있다.

> 🎯 **시나리오 E — 키 유출 의심 신고**: "개발자 노트북이 침해됐고, 그 노트북에 있던 자격증명으로 프로덕션 KMS 키가 사용됐을 가능성이 있다는 신고가 들어왔다. 서비스는 계속 돌아야 한다." 이 요구의 어려움은 *무력화*와 *가용성*이 정면으로 부딪힌다는 데 있다. 키를 disable하면 확실히 막히지만 서비스도 함께 죽는다. 그래서 순서가 답이 된다 — **범인을 끊고, 키는 살린다.** (1) 침해된 프린시펄의 자격증명을 먼저 무효화하고, (2) 그 프린시펄에 걸린 grant를 `RevokeGrant`로 회수하고, (3) 키 정책에서 해당 역할 문장을 제거하거나 조건을 좁히고, (4) CloudTrail로 실제 사용 흔적을 확인한 뒤, (5) 노출이 확인되면 회전(대칭이면 온디맨드 회전, 비대칭이면 새 키+별칭 갱신)을 수행한다. 키 자체의 `DisableKey`는 "전면 차단이 서비스 중단보다 낫다"고 판단될 때만 쓰는 최후 수단이다.

## 사고 대응 플레이북: 명령과 로그

시나리오 E를 실제 명령으로 옮기면 이번 주에 본 CLI가 한 줄기로 이어진다.

```bash
# ① 이 키에 누가 어떤 권한을 갖고 있는지 즉시 파악
aws kms get-key-policy --key-id alias/prod-data --policy-name default
aws kms list-grants     --key-id alias/prod-data

# ② 침해 프린시펄에 걸린 grant를 강제 회수 (반납이 아니라 회수)
aws kms revoke-grant --key-id alias/prod-data --grant-id 0c237476b39f8bc4...

# ③ 최후 수단 — 즉시·가역적 전면 차단 (서비스 중단을 각오할 때만)
aws kms disable-key --key-id alias/prod-data
#    오탐으로 판명되면 즉시 복구 가능
aws kms enable-key  --key-id alias/prod-data

# ④ 노출이 확정되면 키 자료를 갈아 끼운다 (대칭 CMK)
aws kms rotate-key-on-demand --key-id alias/prod-data
aws kms list-key-rotations   --key-id alias/prod-data
```

그리고 "실제로 쓰였는가"는 CloudTrail로만 답할 수 있다. Athena로 트레일을 조회할 때 쓰는 형태는 다음과 같다.

```sql
-- 특정 역할이 최근 7일간 이 키로 무엇을 했는가
SELECT eventtime,
       eventname,
       useridentity.arn                    AS principal,
       sourceipaddress,
       json_extract_scalar(requestparameters, '$.encryptionContext.tenant') AS tenant
FROM   cloudtrail_logs
WHERE  eventsource = 'kms.amazonaws.com'
  AND  eventname IN ('Decrypt','GenerateDataKey','GenerateDataKeyWithoutPlaintext','CreateGrant')
  AND  useridentity.arn LIKE '%role/SuspectRole%'
ORDER  BY eventtime DESC;
```

| CloudTrail에서 본 것 | 무엇을 말하는가 | 다음 행동 |
|----------------------|-----------------|-----------|
| `Decrypt`가 사람 IP에서, `sourceIPAddress`가 서비스 도메인이 **아님** | KMS 직접 호출. 정상 앱 경로가 아니다 | `kms:ViaService` 조건이 없거나 뚫린 것 — 정책 점검 |
| `Decrypt` 건수가 평소의 수십 배, 컨텍스트의 객체 경로가 순차적 | 대량 반출 정황 | 즉시 자격증명 무효화 + 범위 산정 |
| `CreateGrant`의 grantee가 **외부 계정** | 권한을 조직 밖으로 내보낸 행위 | `RevokeGrant` + `aws:PrincipalOrgID` 강제 |
| `PutKeyPolicy` 직후 새 프린시펄의 `Decrypt` 성공 | 스스로 문을 열고 들어간 권한 상승 | SCP로 `PutKeyPolicy` 봉쇄 + 정책 롤백 |
| `GetKeyPolicy`·`ListGrants`만 반복 | 권한 구조 정찰 | 아직 사용 전 — 선제 차단의 기회 |
| `Decrypt` 실패(`KMSInvalidStateException`) 다수 | 삭제 예약/비활성 키를 계속 참조 중 | 삭제 취소 여부 판단, 의존 워크로드 식별 |
| 대상 키에 대한 이벤트가 수개월간 **0** | 미사용 키 | 정리 후보. 단 분기·연 단위 배치를 반드시 확인 |

> 🔍 **더 깊이**: 마지막 두 줄이 짝을 이룬다는 점이 실무의 묘미다. "이벤트가 0이니 지워도 된다"는 판단은 *관측 기간이 충분히 길 때만* 성립한다. 분기 마감 배치, 연말 정산 잡, 장기 아카이브 복원처럼 **호출 주기가 관측 창보다 긴 워크로드**가 존재하기 때문이다. 그래서 키 정리의 표준 절차는 "① 최소 1년치 CloudTrail을 확인 → ② `DisableKey`로 먼저 비활성화 → ③ 수 주간 `KMSInvalidStateException`이 발생하지 않는지 관찰 → ④ 그제서야 `ScheduleKeyDeletion`"이다. **disable을 삭제 전 리허설로 쓰는 것** — 가역적 조치를 비가역적 조치의 안전 장치로 삼는 이 패턴은 KMS 밖에서도 통용되는 일반 원리다.

## 조건 키 총정리

이번 주에 등장한 조건 키는 그 자체가 시험 범위다. 각각이 *무엇을 좁히는가*로 묶어 두면 헷갈리지 않는다.

| 조건 키 | 무엇을 좁히나 | 대표 용도 |
|---------|---------------|-----------|
| `kms:ViaService` | **경로** — 어떤 서비스를 통해 왔는가 | 직접 호출 차단, S3/EBS 전용 키 |
| `kms:CallerAccount` | **주체의 계정** | ViaService와 짝지어 타 계정 서비스 차단 |
| `kms:EncryptionContext:<키>` | **맥락** — 어떤 컨텍스트로 호출했는가 | 테넌트·객체 단위 격리 |
| `kms:GrantIsForAWSResource` | **grant의 출처** — 서비스가 만든 grant인가 | `CreateGrant` 권한 상승 차단 |
| `kms:GrantOperations` | grant가 허용하는 작업 집합 | "Decrypt만 담긴 grant"만 허용 |
| `aws:PrincipalOrgID` | **조직 경계** | 교차계정 공유를 조직 내부로 한정 |
| `aws:PrincipalARN` | 특정 역할/사용자 | SCP에서 관리 역할만 예외 처리 |
| `aws:RequestedRegion` | **리전** | 승인된 리전 밖 키 생성 차단 |
| `aws:ResourceTag/<태그>` | **태그** | ABAC — 키가 늘어도 정책은 그대로 |
| `aws:SecureTransport` | **전송 계층** — TLS인가 | S3·EFS 평문 접근 차단 |
| `s3:x-amz-server-side-encryption` | 저장 암호화 **방식** | SSE-KMS 아닌 저장 거부 |
| `s3:x-amz-server-side-encryption-aws-kms-key-id` | 저장에 쓰인 **키** | 승인된 키 외 사용 거부 |

> ⚠️ **함정**: 조건 키를 *거는 것*과 조건 키의 *존재를 강제하는 것*은 다르다. `kms:EncryptionContext:tenant`에 값 조건만 걸어 두면, 컨텍스트를 아예 넣지 않은 호출은 그 조건 자체가 평가 대상이 되지 않아 다른 문장으로 통과할 수 있다. 그래서 값 조건(`StringEquals`)과 누락 금지(`Null: true`인 Deny)를 **쌍으로** 써야 격리가 완결된다. 이 "값 조건 + 누락 금지" 패턴은 SCS 전반에서 반복되는 사고 방식이다.

## 자주 틀리는 구분들

**키 정책 vs IAM vs grant** — 키 정책은 필수·영구·리소스 기반(권한의 1차 원천), IAM은 위임받았을 때 자격 기반, grant는 임시·세밀·프로그래밍적. 교차계정은 키 정책+IAM 양측.

**GenerateDataKey vs Encrypt** — 큰 데이터는 봉투 암호화(`GenerateDataKey` + 로컬 암호화), 4KB 이하 작은 비밀만 `Encrypt` 직접.

**암호화 컨텍스트는 암호화되지 않는다** — AAD로 무결성·권한 조건에만 쓰고 비밀을 넣지 않는다(CloudTrail 평문 기록).

**저장 vs 전송 암호화** — SSE-KMS/EBS/RDS는 저장, TLS 강제(`aws:SecureTransport`/`force_ssl`/redirect-to-https)는 전송. 둘은 별개로 모두 필요.

**자동 회전 vs 수동 회전** — 자동은 키 자료만 갱신(식별자 유지, 대칭 CMK), 옛 데이터 재암호화 안 함. 수동은 새 키+별칭 갱신(비대칭·BYOK).

**회전 vs 재암호화** — 회전은 *앞으로 만들 암호문*의 키 자료를 바꾸고, `ReEncrypt`는 *이미 있는 암호문*을 새 키로 옮긴다. "옛 키를 지우고 싶다"는 요구는 회전이 아니라 재암호화의 영역이다.

**revoke vs retire** — `RevokeGrant`는 관리 주체가 **강제 회수**(사고 대응), `RetireGrant`는 grantee/은퇴 주체가 **자진 반납**(정상 종료). 두 권한을 다른 주체에게 준다.

**disable vs 삭제** — disable은 즉시·가역, 삭제는 7~30일 대기·비가역(crypto-shredding).

**별칭 삭제는 통제가 아니다** — 별칭은 포인터일 뿐이라 지워도 키 ID로 모든 연산이 그대로 가능하다.

**SSE-S3 vs SSE-KMS** — SSE-S3는 S3가 키 관리(감사·통제 없음), SSE-KMS는 KMS 통제·CloudTrail 감사·교차계정 가능.

**멀티 리전 키 vs 리전별 키** — MRK는 키 자료를 공유해 암호문이 리전 간 상호운용되지만 키 정책은 리전마다 독립. 데이터 주권 요구에는 리전별 독립 키.

**컨텍스트 격리 vs 키 격리** — 컨텍스트는 *정책이 강제하는 논리적 격리*, 키 분리는 *암호학적 격리*. "개별 파기(crypto-shredding)"가 요구되면 키를 나눠야 한다.

> ⚠️ **함정 모음**:
> - 키 정책의 `Enable IAM User Permissions` 삭제로 키가 고아가 됨.
> - 교차계정에서 키 정책만 또는 IAM만 설정하고 한쪽 누락.
> - AWS managed key로 암호화한 스냅샷을 타 계정에 공유하려 함(정책을 못 고쳐 불가).
> - 암호화 컨텍스트에 비밀을 넣어 CloudTrail에 평문 노출.
> - 컨텍스트 값 조건만 걸고 누락 금지(`Null` Deny)를 빠뜨림.
> - `kms:ViaService`를 모든 액션에 Deny로 걸어 키 관리 작업까지 막음.
> - grant 생성 직후 grant token 없이 호출해 최종 일관성으로 실패.
> - `EncryptionContextEquals`를 AWS 서비스 경유 흐름에 걸어 서비스가 덧붙인 컨텍스트로 전부 거부됨.
> - 기존 미암호화 RDS/EBS를 "토글로 암호화"하려 함(스냅샷 경유가 정답).
> - 전환 후 미암호화 원본·중간 스냅샷을 지우지 않아 평문 사본이 남음.
> - 자동 회전이 기존 데이터를 재암호화한다고 오해.
> - 수동 회전 후 옛 키를 삭제해 과거 데이터가 영구 복구 불가가 됨.
> - 비대칭/BYOK 키에 자동 회전을 켜려 함.
> - 의심 키를 즉시 무력화하려 삭제를 선택(disable이 정답).
> - 별칭만 지우고 키를 막았다고 착각.
> - 단일 리전 키로 암호화한 데이터를 다른 리전에서 그대로 복호화하려 함(멀티 리전 키 필요).
> - MRK 복제본의 키 정책이 원본과 어긋나 장애 시점에만 AccessDenied 발생.
> - SQS/SNS를 CMK로 암호화한 뒤 서비스 프린시펄에 키 권한을 주지 않아 메시지 유입 실패.

## 가시성: 암호화를 증명하라

데이터 보호도 *증명*되어야 한다. **CloudTrail**이 모든 KMS API(Encrypt/Decrypt/GenerateDataKey/grant 변경/키 정책 변경)를 기록하고, **AWS Config**가 암호화 준수(`encrypted-volumes`, `s3-bucket-server-side-encryption-enabled`, `rds-storage-encrypted`)를 지속 평가하며, **Security Hub**가 암호화 미준수를 발견으로 집계한다. 통제를 켜는 것은 시작이고, 데이터로 통제를 검증·감사하는 것이 운영 보안의 본체다.

세 도구의 역할은 겹치지 않는다. 이 분업을 정확히 말할 수 있어야 "무엇을 추가해야 하는가" 유형의 문항이 풀린다.

| 도구 | 답하는 질문 | 시제 | 한계 |
|------|-------------|------|------|
| **CloudTrail** | "누가 언제 이 키를 어떻게 썼는가" | **과거**(이벤트) | 설정이 옳은지는 알려주지 않는다 |
| **AWS Config** | "지금 이 리소스가 규칙을 지키고 있는가" | **현재**(상태) + 변경 이력 | 행위자를 알려주지 않는다 |
| **Security Hub** | "조직 전체에서 무엇이 어긋나 있는가" | 집계 | 스스로 막지는 못한다 |
| **SCP / 키 정책** | "애초에 못 하게 한다" | **예방** | 이미 일어난 일은 다루지 못한다 |
| **EventBridge** | "지금 막 일어난 위험 행위를 즉시 알린다" | 실시간 | 알림일 뿐, 차단은 별도 |

```
[ 하나의 통제가 완성되는 4단 구성 — 어느 하나도 나머지를 대체하지 못한다 ]

  예방(SCP·키 정책·Deny)  ─▶  탐지(Config·Security Hub)
          ▲                            │
          │                            ▼
     교정(자동 remediation)  ◀─  대응(EventBridge → Lambda/SNS)

  시험 문항이 "탐지되었지만 계속 재발한다" 면 → 예방(SCP/정책)이 빠진 것
           "설정은 옳은데 오남용을 못 잡는다" 면 → 탐지·대응(CloudTrail 분석)이 빠진 것
```

> 📚 **사례**: 2017년 11월 공개된 Uber의 침해는 이번 주 내용의 마지막 못을 박는다. 공격자는 Uber 엔지니어들이 쓰던 비공개 GitHub 저장소에서 AWS 자격증명을 찾아냈고, 그 자격증명으로 S3에 있던 백업 데이터에 접근해 약 5,700만 명의 승객·기사 정보를 가져갔다. 사건은 2016년에 일어났지만 1년 넘게 공개되지 않았고, Uber가 버그 바운티를 가장해 공격자에게 10만 달러를 지급한 사실과 이후 전 최고보안책임자가 사법 처리된 과정까지 알려지며 "은폐" 자체가 더 큰 문제가 됐다. 기술적으로 이 사건의 핵심은 단순하다 — **암호화는 아무 문제가 없었고, 자격증명이 문제였다.** 저장 암호화가 켜져 있었더라도 정당한 자격증명을 쥔 상대에게는 아무 방어가 되지 않는다. 그래서 이번 주의 도구들이 필요하다. `kms:ViaService`로 "S3를 통해서만" 쓰게 묶고, 암호화 컨텍스트 조건으로 접근 범위를 테넌트 단위로 좁히고, grant로 필요한 순간에만 권한을 열고, CloudTrail에서 `Decrypt` 급증을 탐지한다. 그리고 애초에 자격증명이 코드 저장소에 놓이지 않게 하는 것 — 그것이 다음 주 Secrets Manager의 주제다. 시험에서 "암호화가 되어 있었는데도 유출됐다"는 문장을 보면, 답은 언제나 *암호화를 더 강하게*가 아니라 *자격증명과 키 사용 권한의 통제*다.

## 시험장에서 쓰는 키워드 → 정답 매핑

문항의 표현이 정답을 거의 그대로 지시하는 경우가 많다. 아래 대응은 외워 두면 즉답이 된다.

| 문항에 나오는 표현 | 곧바로 떠올릴 것 |
|--------------------|------------------|
| "키 정책을 편집해야", "교차계정 공유" | customer managed key |
| "수 GB", "대용량 파일", "볼륨 전체" | 봉투 암호화 / `GenerateDataKey` |
| "KMS 접근 권한이 없는 외부", "공개키 배포" | 비대칭 키 |
| "서명하고 검증" | 비대칭 키(SIGN_VERIFY) |
| "정책을 수정하지 않고", "임시로", "취소 가능하게" | grant |
| "직접 호출을 막고", "오직 <서비스>를 통해서만" | `kms:ViaService` |
| "테넌트가 수천 개", "키를 늘릴 수 없다" | 암호화 컨텍스트 격리 |
| "특정 고객 데이터만 영구 파기", "불변 백업" | 고객별 키 + crypto-shredding |
| "예외 없이", "보장하라", "강제하라" | Deny 정책 / SCP / 기본값 + Config |
| "즉시" + "되돌릴 수 있게" | `DisableKey` |
| "영구히 복구 불가능하게" | `ScheduleKeyDeletion` |
| "운영 부담 없이 정기적으로 교체" | 대칭 CMK 자동 회전 |
| "비대칭 키를 교체" | 수동 회전(새 키 + 별칭 갱신) |
| "옛 키를 더 이상 쓰지 않도록" | `ReEncrypt` |
| "throttling", "KMS 비용 급증" | S3 Bucket Key / DEK 캐싱 |
| "객체 단위 감사 로그가 필요" | Bucket Key **비활성** |
| "다른 리전에서도 복호화" | 멀티 리전 키 |
| "리전 밖으로 데이터가 나가면 안 됨" | 리전별 독립 키 + `aws:RequestedRegion` |
| "인증서 프라이빗 키를 노출하지 않고" | ACM |

## 한 줄 요약 체크리스트

- [ ] 거버넌스 요구(정책·회전·교차계정)가 있으면 customer managed key를 골랐는가
- [ ] 대용량은 봉투 암호화, 외부 암호화/서명은 비대칭 키를 골랐는가
- [ ] 암호화 컨텍스트로 맥락 바인딩·권한 조건을 걸되 비밀을 넣지 않았는가
- [ ] 컨텍스트 값 조건과 함께 *누락 금지* Deny를 쌍으로 걸었는가
- [ ] 임시·세밀 권한은 grant, 키 사용 경로 제한은 `kms:ViaService`를 썼는가
- [ ] `CreateGrant` 권한을 `kms:GrantIsForAWSResource`로 좁혔는가
- [ ] 교차계정은 키 정책+IAM 양측을 설정했는가, 공유할 스냅샷은 CMK로 암호화했는가
- [ ] 리전을 넘는 요구에는 MRK를 쓰되 복제본 키 정책을 함께 관리했는가
- [ ] 전송 암호화를 *강제*(HTTP 차단)했는가, 저장 암호화 기본값을 켰는가
- [ ] 암호화 전환 후 미암호화 원본·중간 스냅샷을 파기했는가
- [ ] 정기 회전을 자동(대칭)/수동(비대칭·BYOK)으로 맞게 구성했고, 옛 키를 성급히 지우지 않았는가
- [ ] 의심 키는 disable(가역)로 대응했는가, 삭제 전 disable 리허설을 거쳤는가
- [ ] 모든 KMS 사용을 CloudTrail로 감사하고 Config·Security Hub로 지속 평가하는가

## 정리하며

이번 주의 결론은 한 문장으로 압축된다. **암호화는 통제가 아니라 통제의 *전제*다.** 데이터를 암호화하는 순간 보안 문제는 "이 데이터를 누가 읽을 수 있는가"에서 "이 키를 누가 쓸 수 있는가"로 옮겨 갈 뿐, 사라지지 않는다. 그래서 이번 주 내내 진짜 주제는 알고리즘이 아니라 **키의 소유·경로·수명·증적**이었다.

시험 대비 관점에서 남길 것은 세 가지다. 첫째, 키 종류를 고르는 기준은 *통제와 감사의 필요*이고, 그 필요가 조금이라도 언급되면 customer managed key다. 둘째, 권한은 키 정책(1차 원천) → IAM(위임) → grant(임시)의 층위로 이해하고, 그 위에 SCP 가드레일과 조건 키가 얹힌다 — 특히 `ViaService`·`EncryptionContext`·`PrincipalOrgID`는 문항의 요구 문장을 거의 그대로 번역한 조건이다. 셋째, "강제"를 요구하는 문장에는 옵션이 아니라 Deny가 답이고, "즉시·가역"에는 disable, "영구 파기"에는 예약 삭제가 답이다.

다음 주는 데이터 보호의 두 번째 축 — Secrets Manager, 인증서, S3 고급 보호 — 로 이어진다. 오늘 마지막 사례에서 봤듯 이번 주의 모든 통제는 *자격증명이 안전하게 관리된다는 가정* 위에 서 있고, 다음 주가 바로 그 가정을 떠받치는 층이다.

---

## 📝 연습 문제

**문제 1.** 멀티테넌트 SaaS가 S3에 테넌트별 대용량 파일을 저장한다. 테넌트별 복호화 격리, KMS 비용 관리, 전체 감사, 정기 회전을 모두 만족하는 설계는?

A) SSE-S3 + 객체마다 별도 KMS 키  
B) SSE-KMS(customer managed key) + 객체별 암호화 컨텍스트 `tenant=<id>`와 `kms:EncryptionContext` 조건 + S3 Bucket Key + 자동 회전 + CloudTrail  
C) 클라이언트가 평문으로 업로드하고 IAM으로만 통제  
D) 모든 테넌트가 AWS managed key 공유  

**정답: B**  
해설: customer managed key 기반 SSE-KMS가 감사·통제·회전을 제공하고, 암호화 컨텍스트의 테넌트 조건으로 복호화를 테넌트별 격리하며, S3 Bucket Key가 KMS 호출 비용·throttling을 완화하고, 자동 회전이 운영 부담 없이 정기 교체를, CloudTrail이 전체 감사를 담당한다. SSE-S3는 감사·통제가 없고, 평문 업로드는 저장 암호화를 포기하며, AWS managed key 공유는 정책·격리 통제가 불가능하다.

---

**문제 2.** 보안 계정이 KMS 키를 소유·관리하고 워크로드 계정들이 사용하되, 일반 계정이 키를 삭제하거나 정책을 변경하지 못하게 하려 한다. 가장 적절한 조합은?

A) 워크로드 계정 IAM 정책만 설정  
B) 보안 계정 키 정책 허용 + 워크로드 계정 IAM 허용(양측) + `aws:PrincipalOrgID` 한정 + SCP로 삭제·정책변경 Deny  
C) 키를 모든 계정에 복제  
D) AWS managed key로 전환  

**정답: B**  
해설: 교차계정 사용은 키 정책과 사용 계정 IAM 양측이 모두 허용해야 하고, `aws:PrincipalOrgID`로 조직 내부로 한정하며, SCP로 일반 계정의 `kms:ScheduleKeyDeletion`·`kms:PutKeyPolicy`를 Deny하는 가드레일을 더하는 3층 거버넌스가 정답이다. IAM만으로는 위임이 없어 실패하고, 키 복제·AWS managed key 전환은 중앙 통제 요구와 어긋난다.

---

**문제 3.** KMS 호출 권한이 없는 외부 파트너가 데이터를 암호화해 보내야 하고, 동시에 우리가 발행하는 문서의 무결성을 파트너가 검증할 수 있어야 한다. 가장 적절한 키 구성은?

A) 대칭 키 하나를 공유  
B) 암호화/복호화용 비대칭 키(퍼블릭 키를 파트너에 배포) + 서명/검증용 비대칭 키(우리가 프라이빗 서명, 파트너가 퍼블릭 검증)  
C) SSE-S3  
D) grant를 파트너 계정에 부여  

**정답: B**  
해설: 파트너에게 KMS 호출 권한 없이 암호화만 시키려면 비대칭 키(퍼블릭 배포, 프라이빗은 KMS 내부)를, 문서 무결성 검증에는 서명용 비대칭 키(프라이빗 서명·퍼블릭 검증)를 쓴다. 대칭 키 공유는 복호화 권한까지 노출되고, SSE-S3는 외부 암호화·서명과 무관하며, grant는 KMS 호출 권한 자체가 없는 파트너에게는 부적합하다.

---

**문제 4.** 다음 중 이번 주 데이터 보호 설계에서 *함정*으로 자주 지적되는 항목이 아닌 것은?

A) 기존 미암호화 RDS를 "암호화 토글"로 켜려 함  
B) 자동 회전이 기존 데이터를 새 키로 재암호화한다고 오해  
C) 교차계정에서 키 정책과 사용 계정 IAM을 *둘 다* 설정함  
D) 암호화 컨텍스트에 비밀번호를 넣어 CloudTrail에 평문 노출  

**정답: C**  
해설: 교차계정 KMS 접근은 키 정책 허용과 사용 계정 IAM 허용이 *둘 다* 필요하므로, 둘 다 설정하는 것은 함정이 아니라 올바른 설계다. 나머지는 모두 실제 빈출 함정이다: RDS는 토글로 암호화할 수 없고(스냅샷 경유), 자동 회전은 기존 데이터를 재암호화하지 않으며, 암호화 컨텍스트는 암호화되지 않아 비밀을 넣으면 평문 노출된다. 함정이 *아닌* 것을 고르는 문제이므로 정답은 양측 설정이다.

---

**문제 5.** 유출이 의심되는 customer managed key를 즉시 무력화하되 오탐일 경우 신속히 복구할 수 있어야 한다. 가장 적절한 조치는?

A) `ScheduleKeyDeletion`으로 7일 후 삭제 예약  
B) 키를 disable(비활성화)하고 관련 grant·정책을 회수하며 조사 — disable은 즉시 효력·가역적  
C) 키 별칭만 삭제  
D) 멀티 리전 복제본을 만든다  

**정답: B**  
해설: 키 disable은 즉시 효력이 있고 가역적이어서 의심 상황의 긴급·복구 가능 무력화에 적합하며, grant·정책 회수를 병행해 노출을 줄인다. `ScheduleKeyDeletion`은 대기 후 비가역 삭제라 데이터가 영구 복호화 불가가 되고, 별칭 삭제는 키 사용을 막지 못하며, 복제본 생성은 무력화와 무관하다.

---
