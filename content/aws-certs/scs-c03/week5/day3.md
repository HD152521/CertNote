# Day 3 - 키 정책·그랜트·교차계정 공유: ViaService 조건과 키 거버넌스

KMS 권한을 통제하는 세 가지 메커니즘은 *키 정책(필수, 영구)*, *IAM 정책(위임 시)*, 그리고 오늘의 주제인 **grant(임시·세밀)**다. 어제까지는 데이터가 어떻게 암호화되는지를 봤다면, 오늘은 "누가, 어떤 조건에서, 얼마 동안 키를 쓸 수 있는가"라는 *접근 거버넌스*를 다룬다. SCS-C03는 교차계정 키 공유, `kms:ViaService` 조건, grant의 동작을 매우 자주 출제한다.

이 주제가 시험에서 유난히 무겁게 다뤄지는 이유가 있다. 암호화 알고리즘은 표준이고 KMS의 HSM은 이미 검증됐다. 실제 사고는 "AES가 뚫려서"가 아니라 **"권한이 있는 주체가 권한을 넘어 썼기 때문에"** 일어난다. 즉 KMS 보안의 실질은 암호학이 아니라 *접근 제어*이고, 오늘 다루는 네 가지 표면 — 키 정책, IAM 위임, grant, 조건 키 — 이 그 전부다.

## KMS 권한 모델의 출발점: 키 정책은 왜 "필수"인가

다른 AWS 리소스는 IAM 정책만으로 접근할 수 있다. S3 버킷은 버킷 정책이 없어도 같은 계정 IAM이 허용하면 읽힌다. **KMS는 다르다.** 모든 KMS 키에는 키 정책이 반드시 하나 붙어 있고, *키 정책이 허용하지 않으면 IAM이 무엇을 허용하든 소용이 없다.* KMS 키는 "리소스 소유자가 먼저 문을 열어야 하는" 모델이다.

콘솔에서 키를 만들면 자동으로 붙는 기본 키 정책은 딱 한 문장이다.

```json
{
  "Version": "2012-10-17",
  "Id": "key-default-1",
  "Statement": [
    {
      "Sid": "Enable IAM User Permissions",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
      "Action": "kms:*",
      "Resource": "*"
    }
  ]
}
```

이 문장을 "루트 사용자에게 전권을 줬다"로 읽으면 오해다. 여기서 `:root`는 *루트 사용자 개인*이 아니라 **"이 계정"** 이라는 뜻이고, 문장 전체의 의미는 **"이 키에 대한 접근 통제를 이 계정의 IAM에 위임한다"** 이다. 이 한 줄이 있어야 비로소 IAM 정책으로 개발자·역할에게 키 권한을 줄 수 있다.

```
[ KMS 요청 하나가 통과해야 하는 관문 ]

  요청: Decrypt   (프린시펄 = 계정 A의 role/app)
    │
    ├─① SCP (Organizations 가드레일)
    │      └─ Deny면 여기서 끝. 키 정책이 뭐라 하든 무의미
    │
    ├─② 키 정책 (리소스 기반 · 필수 · 권한의 1차 원천)
    │      ├─ (a) 프린시펄을 직접 Allow  → IAM 없이도 통과
    │      └─ (b) "Enable IAM User Permissions"로 IAM에 위임
    │
    ├─③ IAM 정책  ── ②가 (b)로 위임했을 때만 의미가 있다
    │
    ├─④ Grant     ── ②·③과 별개로 독립적으로 권한을 만들 수 있다
    │
    └─⑤ 조건 평가 (ViaService · EncryptionContext · CallerAccount · OrgID)
           └─ 하나라도 불일치하면 위에서 다 허용해도 거부
```

이 그림에서 읽어야 할 성질이 두 가지다. 첫째, **키 정책은 우회 불가능한 관문**이다. 둘째, **어느 경로로 허용됐든 마지막 조건 평가는 공통으로 적용된다.** 그래서 조건 키(`ViaService`, `EncryptionContext`)를 키 정책에 걸면 IAM으로 들어온 요청이든 grant로 들어온 요청이든 똑같이 걸러진다 — 조건을 *키 정책*에 거는 것이 가장 강한 통제인 이유다.

| 메커니즘 | 위치 | 수명 | 누가 만드나 | 주 용도 |
|----------|------|------|-------------|---------|
| **키 정책** | 키에 부착(리소스 기반) | 영구, 수동 변경 | 키 소유 계정의 키 관리자 | 권한의 1차 원천, 교차계정 위임, 조건 강제 |
| **IAM 정책** | 프린시펄에 부착(자격 기반) | 영구, 수동 변경 | 각 계정의 IAM 관리자 | 같은 계정 내 세부 배분(키 정책이 위임한 경우) |
| **Grant** | KMS가 별도 저장 | 임시, API로 생성·취소 | 애플리케이션·AWS 서비스 | 세밀·동적·취소 가능한 위임 |
| **SCP** | OU/계정 | 영구 가드레일 | Organizations 관리자 | 조직 차원 상한선(Deny만 실질적) |

> ⚠️ **함정**: `Sid: "Enable IAM User Permissions"` 문장을 "루트 권한이 위험해 보인다"는 이유로 지워 버리는 사고가 실제로 일어난다. 이 문장을 지우고 남은 정책에 자기 자신을 넣지 않으면 **누구도 키 정책을 다시 고칠 수 없는 고아 키**가 된다. IAM 관리자여도, 계정 루트 사용자여도 손을 댈 수 없다 — 키 정책이 허용하지 않기 때문이다. 이 상태는 AWS Support를 통해서만 복구되며, 시험에서 "키 정책을 잘못 수정해 접근이 완전히 차단됐다"는 상황의 정답은 대개 *AWS Support 문의*다. 실무 규칙은 하나다: **키 정책을 바꿀 때는 자기 자신(또는 신뢰하는 관리 역할)의 관리 권한을 절대 먼저 빼지 않는다.**

> 🔍 **더 깊이**: 키 정책 문서에는 크기 상한이 있어 프린시펄을 무한정 나열할 수 없다. 계정이 수십 개인 조직에서 계정마다 한 줄씩 추가하는 방식은 곧 한계에 부딪힌다. 그래서 실무의 확장 패턴은 두 가지다. 하나는 키 정책에는 `aws:PrincipalOrgID` 같은 *조건*을 걸어 조직 전체를 한 문장으로 표현하고 세부 배분은 각 계정 IAM에 맡기는 방식이고, 다른 하나는 프로그래밍적으로 생성·회수되는 **grant**로 옮기는 방식이다. grant는 키 정책 문서에 들어가지 않으므로 문서 크기에 묶이지 않는다. "키 정책이 계속 커진다"는 증상이 나오면 답은 문서를 더 키우는 것이 아니라 조건이나 grant로 옮기는 것이다.

## Grant: 임시·프로그래밍적 권한 위임

키 정책과 IAM이 "정책 문서로 영구히" 권한을 주는 반면, **grant**는 *프로그래밍적으로 부여·취소하는 임시 권한*이다. AWS 서비스가 사용자 대신 일시적으로 키를 써야 할 때(예: EBS 볼륨 생성 시 그 볼륨에 한해 복호화 권한 부여) 주로 쓰인다.

grant의 특징:

- 특정 프린시펄(grantee)에게 *제한된 작업 집합*(예: `Decrypt`, `GenerateDataKey`)만 허용.
- **grant constraint**로 암호화 컨텍스트를 조건화: `EncryptionContextEquals`/`EncryptionContextSubset`.
- `RetiringPrincipal`이 grant를 *은퇴(retire)*시키거나, 권한 있는 주체가 `RevokeGrant`로 *취소(revoke)*.
- 정책을 다시 쓰지 않고도 권한을 동적으로 추가·제거할 수 있어, 키 정책을 비대하게 만들지 않는다.

```bash
aws kms create-grant \
  --key-id alias/app-data-key \
  --grantee-principal arn:aws:iam::111122223333:role/worker \
  --operations Decrypt GenerateDataKey \
  --constraints EncryptionContextSubset={tenant=acme}
```

실무에서는 여기에 이름과 은퇴 주체를 붙여 *나중에 회수할 수 있게* 만든다. 회수 경로를 설계하지 않은 grant는 사실상 영구 권한이 된다.

```bash
# ── 생성: 회수 가능하도록 name과 retiring-principal을 함께 지정 ──
aws kms create-grant \
  --key-id arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-... \
  --grantee-principal arn:aws:iam::111122223333:role/BatchWorker \
  --retiring-principal arn:aws:iam::111122223333:role/GrantManager \
  --operations Decrypt GenerateDataKey DescribeKey \
  --constraints EncryptionContextSubset={tenant=acme} \
  --name batch-worker-acme-2026q3
# 반환:
# {
#   "GrantToken": "AQpAM2RhY2...",      ← 즉시 사용을 위한 '티켓'
#   "GrantId":    "0c237476b39f8bc4..."  ← 회수할 때 쓰는 식별자
# }

# ── 조회 / 회수 ──
aws kms list-grants  --key-id alias/app-data-key
aws kms revoke-grant --key-id alias/app-data-key --grant-id 0c237476b39f8bc4...
aws kms retire-grant --grant-token AQpAM2RhY2...
```

`GrantToken`이 함께 반환되는 데는 이유가 있다. **grant는 즉시 전역 반영되지 않는다.** KMS는 분산 시스템이므로 방금 만든 grant가 모든 엔드포인트에 퍼지기까지 짧은 지연이 있고, 그동안 grantee가 곧바로 `Decrypt`를 호출하면 `AccessDeniedException`이 날 수 있다. 이 창을 메우려고 KMS는 "이 grant는 이미 만들어졌다"를 증명하는 티켓을 주며, 호출자가 `--grant-tokens`로 함께 제시하면 전파 완료를 기다리지 않고 통과한다.

```bash
# grant 생성 직후 곧바로 사용해야 할 때 — 전파 지연을 우회
aws kms decrypt \
  --ciphertext-blob fileb://enc.dat \
  --encryption-context "tenant=acme" \
  --grant-tokens AQpAM2RhY2...
```

> ⚠️ **함정**: "grant를 만들었는데 바로 쓰면 간헐적으로 AccessDenied가 난다"는 증상에 *재시도 루프*나 *sleep*을 넣는 코드가 흔하다. 정답은 `CreateGrant`가 돌려준 **grant token을 첫 호출에 함께 넘기는 것**이다. 시험에서 "grant 생성 직후 즉시 사용해야 한다 / 최종 일관성 때문에 실패한다"는 문장이 나오면 grant token이 정답 신호다.

### constraint: Equals와 Subset의 차이

grant를 세밀하게 만드는 장치가 암호화 컨텍스트 제약이다. 둘의 차이가 시험에 나온다.

| 제약 | 매칭 규칙 | 효과 | 언제 쓰나 |
|------|-----------|------|-----------|
| `EncryptionContextEquals` | 요청의 컨텍스트가 제약과 **완전히 동일**해야 함 | 가장 엄격. 키-값 쌍이 하나라도 더 붙으면 거부 | 컨텍스트 형태가 고정된 내부 워크로드 |
| `EncryptionContextSubset` | 제약의 쌍들이 요청 컨텍스트에 **모두 포함**되면 통과(추가 쌍 허용) | 유연. "tenant=acme는 반드시, 나머지는 자유" | 서비스가 컨텍스트를 자동으로 덧붙이는 경우 |

이 구분이 중요한 이유는 **AWS 서비스가 컨텍스트를 임의로 덧붙이기 때문**이다. 예를 들어 S3는 `aws:s3:arn`을, EBS는 볼륨 식별자를 컨텍스트에 자동으로 넣는다. 여기에 `EncryptionContextEquals`로 `tenant=acme`만 지정하면 서비스가 붙인 쌍 때문에 "완전 동일"이 깨져 전부 거부된다. AWS 서비스 경유 흐름에는 거의 항상 `Subset`이 맞다.

### AWS 서비스가 만드는 grant를 통제하기

EBS 볼륨을 암호화해 붙이거나 RDS 인스턴스를 만들면, 해당 서비스가 사용자를 대신해 `CreateGrant`를 호출한다. 이때 붙는 조건 키가 `kms:GrantIsForAWSResource`다.

```json
{
  "Sid": "AllowGrantCreationOnlyByAWSServices",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:role/AppRole" },
  "Action": "kms:CreateGrant",
  "Resource": "*",
  "Condition": {
    "Bool": { "kms:GrantIsForAWSResource": "true" }
  }
}
```

이 문장은 "AppRole은 **AWS 서비스가 대신 만드는 grant만** 생성할 수 있다"는 뜻이다. 즉 EC2가 볼륨을 붙이며 자동 생성하는 grant는 통과하지만, 사람이 CLI로 임의의 프린시펄에게 grant를 뿌리는 것은 막힌다. `kms:CreateGrant`는 **권한을 다시 나눠 주는 권한**이라 사실상 권한 상승 경로이므로, 이렇게 좁혀 두는 것이 최소 권한 설계의 핵심이다.

> 💡 **관련 이론**: grant vs 키 정책 vs IAM의 선택 기준 — *영구적이고 사람이 검토할 광범위 권한*은 키 정책/IAM, *세밀하고 임시이며 프로그래밍적으로 생성·취소될 권한*은 grant다. AWS 서비스 통합(EBS, Redshift 등)이 내부적으로 grant를 만든다. 시험에서 "정책 수정 없이 임시로, 특정 암호화 컨텍스트에 한해, 취소 가능하게 권한을 주고 싶다" → grant.

> 🔍 **더 깊이**: `RevokeGrant`와 `RetireGrant`는 둘 다 grant를 없애지만 *누가 부르는가*와 *의도*가 다르다. `RevokeGrant`는 키에 대한 `kms:RevokeGrant` 권한을 가진 **관리 주체**가 "이 권한을 강제로 회수한다"는 의미로 부른다 — 사고 대응의 도구다. `RetireGrant`는 grant를 만들 때 지정한 `RetiringPrincipal`이나 grantee가 "이제 이 권한이 필요 없다"며 스스로 반납하는 것으로, 작업이 끝난 뒤의 정상적인 뒷정리다. 설계상 시사점은 명확하다. **사고 대응 경로(revoke)와 정상 종료 경로(retire)를 다른 주체에게 준다.** 배치 잡에는 자기 grant를 retire할 권한만 주고, 강제 회수 권한은 보안팀 역할에만 남긴다.

## kms:ViaService 조건: 키 사용 경로 제한

`kms:ViaService`는 "이 KMS 작업이 *특정 AWS 서비스를 통해서만* 요청될 때 허용"하는 조건이다. 즉 사용자가 KMS를 직접 호출하는 것은 막고, 지정한 서비스(예: S3, EBS)가 사용자를 대신해 호출할 때만 허용한다.

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:role/app" },
  "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "kms:ViaService": "s3.ap-northeast-2.amazonaws.com",
      "kms:CallerAccount": "111122223333"
    }
  }
}
```

위 정책은 "이 역할은 *서울 리전의 S3를 통해서만* 이 키를 쓸 수 있다"는 뜻이다. 같은 역할이 직접 `aws kms decrypt`를 호출하면 거부된다.

값은 배열로 여러 서비스를 나열할 수 있고, 반드시 **리전이 포함된 서비스 엔드포인트 형식**이라는 점이 중요하다.

```json
"Condition": {
  "StringEquals": {
    "kms:ViaService": [
      "s3.ap-northeast-2.amazonaws.com",
      "ec2.ap-northeast-2.amazonaws.com",
      "rds.ap-northeast-2.amazonaws.com"
    ],
    "kms:CallerAccount": "111122223333"
  }
}
```

여기서 리전이 박혀 있다는 사실이 부수 효과를 만든다. 서울 리전만 나열한 키 정책은 **다른 리전의 같은 서비스가 이 키를 쓰는 것도 자동으로 막는다.** 리전 이동 자체를 통제하는 수단으로 쓸 수 있는 반면, 나중에 워크로드를 다른 리전으로 확장할 때 조용히 `AccessDenied`가 나는 원인이 되기도 한다.

이 조건의 동작 원리를 한 줄로 정리하면 이렇다. **KMS를 사람이 직접 호출하면 요청에 `kms:ViaService` 키가 아예 존재하지 않는다.** 그래서 `Allow` + `StringEquals`는 자연스럽게 직접 호출을 걸러 낸다.

```
[ ViaService가 거르는 것 ]

  ① 정상 경로 (허용)
     사용자/역할 ─GetObject─→ S3 ─Decrypt(ViaService=s3....)─→ KMS ✅

  ② 우회 시도 (차단)
     사용자/역할 ─────── aws kms decrypt (ViaService 없음) ──→ KMS ❌
     · S3 객체를 통째로 내려받지 않고 DEK만 풀어 가려는 시도
     · 침해된 자격증명으로 키를 직접 남용하려는 시도
```

> 🎯 **시나리오**: "데이터 키가 오직 RDS 암호화 용도로만 쓰이고, 어떤 사람도 KMS를 직접 호출해 복호화하지 못하게 하라." → 키 정책에 `kms:ViaService`를 `rds.<region>.amazonaws.com`으로 제한. 키 사용을 특정 서비스 경로에 묶어 데이터 유출 표면을 줄인다.

> ⚠️ **함정**: `kms:ViaService`만 걸고 `kms:CallerAccount`를 빠뜨리면, 다른 계정의 동일 서비스가 요청할 여지가 생길 수 있다. 교차계정 시나리오에서는 두 조건을 함께 고려한다.

> ⚠️ **함정**: `kms:ViaService`를 *모든 액션에* 광범위한 `Deny`로 걸면 키 자체를 관리할 수 없게 된다. `PutKeyPolicy`·`ScheduleKeyDeletion`·`EnableKeyRotation` 같은 **관리 작업은 어떤 서비스도 대신 호출해 주지 않으므로 항상 직접 호출**이고, 따라서 ViaService 조건에 걸려 통째로 막힌다. 실무에서는 조건을 *암호 연산*(`Decrypt`, `Encrypt`, `GenerateDataKey*`, `ReEncrypt*`)에만 적용하고, 관리 액션은 별도의 관리자 문장으로 분리한다. "ViaService를 걸었더니 키 회전을 켤 수 없다"는 증상의 원인이 이것이다.

## 교차계정 키 공유: 두 단계가 모두 필요

교차계정으로 KMS 키를 공유하려면 **두 곳을 동시에 설정**해야 한다. 이 "두 단계 모두" 패턴이 시험 단골이다.

1. **키 소유 계정(A)의 키 정책**: 외부 계정(B)의 root 또는 특정 역할에 키 작업 허용.
2. **사용 계정(B)의 IAM 정책**: 자기 계정 프린시펄에게 A의 키 ARN에 대한 KMS 작업 허용.

```json
// 계정 A 키 정책 (소유자가 위임)
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::B_ACCOUNT:root" },
  "Action": ["kms:Decrypt", "kms:DescribeKey"],
  "Resource": "*"
}
```

```json
// 계정 B IAM 정책 (사용자가 행사)
{
  "Effect": "Allow",
  "Action": ["kms:Decrypt", "kms:DescribeKey"],
  "Resource": "arn:aws:kms:ap-northeast-2:A_ACCOUNT:key/abcd-..."
}
```

```
[ 교차계정 접근이 성립하는 조건 — 둘 다 켜져야 열린다 ]

     계정 A (키 소유)                       계정 B (키 사용)
  ┌───────────────────┐                ┌───────────────────┐
  │  KMS key          │                │  role/Consumer    │
  │  ┌─────────────┐  │                │  ┌─────────────┐  │
  │  │  키 정책     │  │◀── 위임 ────── │  │  IAM 정책    │  │
  │  │ Principal:  │  │                │  │ Resource:   │  │
  │  │  B:root  ✅ │  │  ──── 행사 ───▶│  │  A의 키 ARN✅│  │
  │  └─────────────┘  │                │  └─────────────┘  │
  └───────────────────┘                └───────────────────┘
        ①만 있으면 → B의 프린시펄이 IAM 허용을 못 받아 거부
        ②만 있으면 → A가 문을 안 열어 거부 (가장 흔한 실수)
        ①+② 모두   → 통과 ✅
```

> 💡 **관련 이론**: 리소스 기반 정책(키 정책)이 *허용*하고 동시에 사용 계정의 IAM이 *허용*해야 교차계정 접근이 성립한다. 한쪽만 있으면 실패한다 — 이것이 S3 버킷·교차계정 공유 전반의 일관된 원리(양측 동의)다. 시험에서 "교차계정인데 접근이 안 된다"면 둘 중 하나가 빠졌는지 먼저 확인한다.

교차계정 공유의 실제 예: 계정 B가 계정 A의 키로 암호화된 EBS 스냅샷을 공유받아 복원하거나, A의 키로 암호화된 RDS 스냅샷을 공유받는 경우. 스냅샷 공유 자체(RDS/EBS 공유 API)와 *키 접근 권한 부여*는 별개이며 둘 다 필요하다.

```
[ 암호화된 EBS 스냅샷을 계정 B에 공유하는 전체 절차 ]

계정 A                                            계정 B
──────                                            ──────
① 스냅샷이 customer managed key로
   암호화되어 있는지 확인
   (AWS managed key로 암호화된 스냅샷은
    아예 공유할 수 없다 — 정책을 못 고치므로)
                                    │
② 스냅샷 공유 권한 부여              │
   modify-snapshot-attribute        │
   --user-ids B_ACCOUNT             │
                                    ▼
③ 키 정책에 B 허용 ────────────▶  ④ IAM에서 A의 키 ARN에 대해
   Decrypt / DescribeKey /            Decrypt·CreateGrant 허용
   CreateGrant                        │
                                      ▼
                                   ⑤ copy-snapshot 시 B 소유 키로
                                      재암호화 → 이후 A와 독립
```

③에서 `CreateGrant`가 필요한 이유가 시험 포인트다. B가 그 스냅샷으로 볼륨을 만들면 **EC2가 B를 대신해 grant를 만들어야** 볼륨이 그 키를 계속 쓸 수 있다. `Decrypt`만 주고 `CreateGrant`를 빠뜨리면 "스냅샷은 보이는데 볼륨 생성에서 실패"하는 전형적 증상이 나온다.

> ⚠️ **함정**: **AWS managed key(`aws/ebs`, `aws/rds`)로 암호화된 스냅샷은 다른 계정과 공유할 수 없다.** AWS managed key는 키 정책을 사용자가 편집할 수 없어서 외부 계정에 위임할 방법이 없기 때문이다. "스냅샷 공유가 필요하다"는 요구가 있으면 **처음부터 customer managed key로 암호화**해야 하고, 이미 AWS managed key로 만들어졌다면 `copy-snapshot`으로 CMK 재암호화 사본을 만든 뒤 그것을 공유한다. 시험에서 "공유가 안 된다"의 원인 1순위다.

### 리전을 넘는 경우: 멀티 리전 키

계정을 넘는 문제와 *리전*을 넘는 문제는 다르다. KMS 키는 리전 리소스이므로, 서울에서 암호화한 암호문은 원칙적으로 도쿄의 다른 키로 풀 수 없다. **멀티 리전 키(MRK)** 는 같은 키 자료를 여러 리전에 복제해 이 벽을 없앤다.

```bash
# ① 멀티 리전 기본 키 생성 (키 ID가 mrk- 로 시작한다)
aws kms create-key --multi-region --description "cross-region app key"

# ② 다른 리전으로 복제 — 복제본은 자체 키 정책을 갖는다
aws kms replicate-key \
  --key-id arn:aws:kms:ap-northeast-2:111122223333:key/mrk-1234abcd... \
  --replica-region us-east-1 \
  --policy file://replica-key-policy.json

# ③ 필요 시 기본(primary) 리전을 옮길 수도 있다
aws kms update-primary-region \
  --key-id arn:aws:kms:ap-northeast-2:111122223333:key/mrk-1234abcd... \
  --primary-region us-east-1
```

| 항목 | 멀티 리전 키(MRK) | 리전별 독립 키 |
|------|-------------------|----------------|
| 키 자료 | 리전 간 **동일** | 리전마다 다름 |
| 암호문 상호운용 | 서울에서 암호화 → 도쿄에서 복호화 **가능** | 불가 (리전 간 재암호화 필요) |
| 키 정책·grant·별칭 | 복제본마다 **독립적으로** 설정 | 당연히 독립 |
| 회전 | 기본 키를 회전하면 복제본에도 같은 키 자료가 반영 | 리전마다 따로 회전 |
| 격리 수준 | 낮음 — 한 키 자료가 여러 리전에 존재 | 높음 — 리전 사고가 번지지 않음 |
| 대표 용도 | 글로벌 DynamoDB 테이블, 리전 간 DR, 크로스 리전 백업 | 리전별 규제·데이터 주권 요구 |

> 🎯 **시나리오**: "재해 복구를 위해 서울 리전의 암호화된 데이터를 도쿄 리전으로 복제한다. 장애 시 도쿄에서 곧바로 복호화해 서비스를 이어야 하며, 복구 절차에 재암호화 단계가 들어가면 RTO를 맞출 수 없다." → **멀티 리전 키**. 서울을 기본 키로 두고 도쿄에 복제본을 만들면, 서울에서 만들어진 암호문을 도쿄 복제본이 그대로 풀 수 있다. 반대로 "각 리전의 데이터는 그 리전 안에서만 복호화 가능해야 한다"는 데이터 주권 요구가 붙으면 MRK는 오답이고 리전별 독립 키가 정답이다. **같은 기능이 요구 문장에 따라 정답도 되고 오답도 된다** — 판단 기준은 *편의(가용성)* 대 *격리(주권)* 중 무엇을 요구하느냐다.

> ⚠️ **함정**: MRK 복제본은 **키 정책까지 복제되지는 않는다.** `replicate-key` 시 정책을 지정하지 않으면 기본 정책이 붙고, 이후 원본 키 정책을 바꿔도 복제본에 자동 반영되지 않는다. "서울에서는 되는데 도쿄에서만 AccessDenied"의 흔한 원인이 이 정책 드리프트다. MRK를 쓴다면 키 정책을 IaC로 관리해 리전 간 동기화를 강제해야 한다.

## 키 거버넌스: SCP·조건·태그 기반 통제

조직 차원의 키 거버넌스 도구:

- **SCP(Service Control Policy)**: Organizations에서 "특정 키 외 사용 금지", "키 삭제(`kms:ScheduleKeyDeletion`) 금지", "특정 리전 외 키 생성 금지" 등을 *전 계정에 가드레일*로 강제.
- **`aws:PrincipalOrgID` 조건**: 키 정책에서 "우리 조직 소속 프린시펄만" 허용해 교차계정 공유를 조직 내부로 한정.
- **ABAC(태그 기반)**: `aws:ResourceTag`/`kms:ResourceAliases` 등으로 태그·별칭 기반 접근 통제.
- **CloudTrail**: 모든 KMS API(Encrypt/Decrypt/GenerateDataKey/grant 변경)가 기록되어, "누가 언제 어떤 키를 어떤 컨텍스트로 썼는가"를 감사.

```json
// 조직 외부 프린시펄 차단
"Condition": {
  "StringEquals": { "aws:PrincipalOrgID": "o-exampleorgid" }
}
```

가드레일은 "허용"이 아니라 **"막을 수 없는 금지"** 로 표현할 때 힘이 생긴다. SCP의 실물은 다음과 같은 모양이다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyKeyDestructionOutsideSecurityRole",
      "Effect": "Deny",
      "Action": [
        "kms:ScheduleKeyDeletion",
        "kms:DisableKey",
        "kms:PutKeyPolicy",
        "kms:DisableKeyRotation",
        "kms:DeleteAlias"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalARN": "arn:aws:iam::*:role/SecurityKeyAdmin"
        }
      }
    },
    {
      "Sid": "DenyKeyCreationOutsideApprovedRegions",
      "Effect": "Deny",
      "Action": "kms:CreateKey",
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
        }
      }
    }
  ]
}
```

첫 문장은 "`SecurityKeyAdmin` 역할이 아닌 **누구도** 키를 파괴하거나 정책을 바꿀 수 없다"를 조직 전체에 못 박는다. 계정 관리자가 자기 계정에서 IAM을 아무리 넓게 줘도 SCP를 넘을 수 없다는 점이 핵심이다. 두 번째 문장은 데이터 주권·비용 통제를 위해 승인된 리전 밖에서의 키 생성을 봉쇄한다.

태그 기반(ABAC) 통제는 키가 수백 개로 늘었을 때 정책 폭발을 막는다.

```json
{
  "Sid": "AllowUseOfKeysMatchingWorkloadTag",
  "Effect": "Allow",
  "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceTag/Workload": "${aws:PrincipalTag/Workload}",
      "kms:CallerAccount": "111122223333"
    }
  }
}
```

"프린시펄의 `Workload` 태그와 키의 `Workload` 태그가 같을 때만 허용" — 키가 늘어도, 팀이 늘어도 정책 문서는 그대로다. 대신 **태그를 바꿀 수 있는 권한 자체가 권한 상승 경로**가 되므로 `kms:TagResource`·`iam:TagRole`을 반드시 별도로 잠가야 한다.

> 🎯 **시나리오**: "여러 계정이 공유 키를 쓰는데, 키 삭제와 키 정책 변경을 일반 계정에서 못 하게 막고 보안 계정에서만 관리하고 싶다." → SCP로 `kms:ScheduleKeyDeletion`·`kms:PutKeyPolicy`를 보안 OU 외 계정에서 Deny, 키 정책은 보안팀 역할에만 관리 권한 부여. 가드레일(SCP) + 키 정책(세밀)의 조합.

## CloudTrail로 키 사용 읽기

키 거버넌스의 마지막 조각은 "설정한 대로 돌아가고 있는가"를 증명하는 것이다. KMS의 모든 호출은 CloudTrail에 남고, 조사자는 몇 개의 필드만 보면 상황을 판별할 수 있다.

```json
// AWS 서비스가 대신 만든 grant — EBS 볼륨을 붙이는 정상 흐름
{
  "eventName": "CreateGrant",
  "eventSource": "kms.amazonaws.com",
  "userIdentity": { "arn": "arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc" },
  "sourceIPAddress": "ec2.amazonaws.com",
  "requestParameters": {
    "granteePrincipal": "ec2.ap-northeast-2.amazonaws.com",
    "operations": ["Decrypt", "GenerateDataKeyWithoutPlaintext", "CreateGrant"],
    "constraints": { "encryptionContextSubset": { "aws:ebs:id": "vol-0a1b2c3d" } }
  }
}
```

```json
// 사람이 직접 만든 grant — 권한을 다른 프린시펄에게 넘기는 행위
{
  "eventName": "CreateGrant",
  "eventSource": "kms.amazonaws.com",
  "userIdentity": { "arn": "arn:aws:iam::111122223333:user/dev-kim" },
  "sourceIPAddress": "203.0.113.45",
  "requestParameters": {
    "granteePrincipal": "arn:aws:iam::444455556666:root",
    "operations": ["Decrypt"]
  }
}
```

| 관찰 | 해석 |
|------|------|
| `CreateGrant` + `sourceIPAddress`가 서비스 도메인(`ec2.amazonaws.com` 등) | AWS 서비스 통합의 정상 동작. `kms:GrantIsForAWSResource`가 `true`인 경로 |
| `CreateGrant` + 사람 IP + grantee가 **외부 계정** | 권한을 조직 밖으로 내보내는 행위. 최우선 경보 대상 |
| `Decrypt`의 `userIdentity.accountId`와 키 소유 계정이 **다름** | 교차계정 사용. 키 소유 계정의 CloudTrail에도 그대로 남는다 |
| `GenerateDataKey` 없이 `Decrypt`만 대량 발생 | 쓰기 없는 읽기 — 대량 반출 정황일 수 있음 |
| `PutKeyPolicy` 직후 새 프린시펄의 `Decrypt` 성공 | 정책을 스스로 열고 들어간 전형적 권한 상승 시퀀스 |
| `ScheduleKeyDeletion` | 되돌릴 수 있는 시간이 정해져 있는 파괴 행위. 즉시 알림 필요 |
| `ListGrants`·`GetKeyPolicy`가 평소 없던 주체에서 급증 | 권한 구조를 훑어보는 정찰(reconnaissance) 행위 |

> 🔍 **더 깊이**: 교차계정 KMS 사용의 감사에는 비대칭이 있다. 계정 B의 역할이 계정 A의 키로 `Decrypt`를 호출하면, 그 이벤트는 **A의 CloudTrail에도, B의 CloudTrail에도** 기록된다. A는 "외부 계정이 내 키를 썼다"를, B는 "내 역할이 외부 키를 썼다"를 각각 본다. 그래서 키를 빌려준 쪽은 상대 계정의 로그를 볼 수 없어도 자기 트레일만으로 오남용을 탐지할 수 있다 — 키를 공유해도 감사 주권은 유지된다는 뜻이다. 시험에서 "다른 계정에 키를 빌려주되 사용 내역을 우리가 감시해야 한다"는 요구가 나오면, 별도 장치 없이 **키 소유 계정의 CloudTrail로 충분하다**가 정답 방향이다.

## 키 삭제: 되돌릴 수 없는 위험

KMS 키 삭제는 *최소 7일~최대 30일의 대기 기간*을 둔 예약 삭제(`ScheduleKeyDeletion`)로만 가능하다. 대기 중에는 `CancelKeyDeletion`으로 취소할 수 있다. 키가 실제 삭제되면 그 키로 암호화된 *모든 데이터가 영구히 복호화 불가*가 된다(crypto-shredding 효과). 즉시 차단이 필요하면 삭제 대신 **키 비활성화(disable)**를 쓴다 — 가역적이다.

```bash
# 즉시·가역적 무력화 (사고 대응의 1선)
aws kms disable-key --key-id alias/app-data-key

# 되돌릴 수 없는 파기 — 대기 기간은 7~30일 (기본 30일)
aws kms schedule-key-deletion \
  --key-id arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-... \
  --pending-window-in-days 30

# 대기 중 취소
aws kms cancel-key-deletion --key-id arn:aws:kms:...:key/1234abcd-...
```

| 조치 | 즉시성 | 가역성 | 데이터 영향 | 언제 쓰나 |
|------|--------|--------|-------------|-----------|
| `DisableKey` | 즉시 | **가역** | 복호화 일시 불가(다시 켜면 복구) | 유출 의심, 조사 중 긴급 차단 |
| grant 회수 / 키 정책 축소 | 즉시(전파 지연 있음) | 가역 | 해당 주체만 차단 | 특정 워크로드·계정만 끊을 때 |
| `ScheduleKeyDeletion` | 7~30일 후 | 대기 중에만 가역 | **영구 복호화 불가** | GDPR 파기, 확정된 폐기 |
| 별칭 삭제 | 즉시 | 가역 | **없음**(키는 그대로 동작) | 이름 정리용. 통제 수단이 아니다 |

> ⚠️ **함정**: "유출 의심 키를 즉시 무력화" 요구에 삭제를 고르면 안 된다. 삭제는 대기 기간이 있고 비가역적이다. 즉시·가역적 무력화는 *disable*이며, 의심 상황에서는 키 정책/grant 회수도 함께 한다.

> ⚠️ **함정**: 별칭(alias)만 지우고 "키를 막았다"고 착각하는 실수가 잦다. 별칭은 사람이 읽기 좋은 *포인터*일 뿐이라 별칭이 사라져도 키 ID·ARN으로 여전히 모든 암호 연산이 가능하다. 위 표에서 별칭 삭제만 "데이터 영향 없음"인 이유다.

삭제는 대기 기간이 있으므로 *탐지할 시간이 있다*는 점을 활용해야 한다. KMS는 삭제 예약과 실제 삭제를 EventBridge 이벤트로 발행하므로, 여기에 알림을 걸어 두면 오작동이나 악의적 파괴를 대기 기간 안에 되돌릴 수 있다. 실무 순서는 **① SCP로 삭제 권한 자체를 좁히고 → ② EventBridge/CloudTrail로 삭제 예약을 즉시 알리고 → ③ 삭제 전 CloudTrail에서 최근 사용 이력을 확인해 "정말 아무도 안 쓰는 키인지" 검증**하는 3단계다. 마지막 단계가 특히 중요하다. 키를 지우기 전 지난 수개월간의 `Decrypt`·`GenerateDataKey` 기록이 정말 0인지 확인하지 않으면, 분기마다 한 번 도는 배치 잡이 다음 분기에 조용히 죽는다.

> 📚 **사례**: 2019년 공개된 Capital One 침해는 "암호화했는데도 데이터가 나갔다"는 사건의 교과서다. 공격자는 잘못 구성된 WAF(리버스 프록시)를 통해 SSRF로 EC2 인스턴스 메타데이터에 접근해 해당 인스턴스 역할의 임시 자격증명을 얻었고, 그 자격증명으로 S3 버킷 목록을 조회한 뒤 데이터를 내려받았다. 미국·캐나다 신용카드 신청자 약 1억 명 규모의 정보가 영향을 받았다. 여기서 데이터는 저장 암호화되어 있었지만 **훔친 역할이 그 데이터를 읽을 정당한 권한을 갖고 있었기 때문에** 암호화는 아무 방어가 되지 못했다. 봉투 암호화는 *디스크를 훔쳐 간 공격자*를 막지, *권한을 훔쳐 간 공격자*를 막지 않는다. 오늘의 도구들이 정확히 그 빈틈을 메운다 — `kms:ViaService`로 "S3를 통해서만" 쓰게 묶고, 암호화 컨텍스트 조건으로 접근 범위를 좁히고, grant로 필요한 순간에만 권한을 열고, CloudTrail로 `Decrypt` 급증을 탐지한다. 시험에서 "저장 암호화가 켜져 있는데도 유출됐다, 무엇이 부족했나"라는 문항의 답은 언제나 *암호화의 강도*가 아니라 *키 사용 권한의 범위와 탐지*다.

> 📚 **사례**: 2014년 Code Spaces는 침해자가 AWS 콘솔 접근 권한을 확보한 뒤 인스턴스·스토리지·스냅샷·백업을 삭제하면서 사업 자체를 접었다. 데이터가 아니라 **데이터를 되살릴 수단이 통째로 지워진** 사건이다. KMS 맥락에서 이 사례의 교훈은 직접적이다. 키를 지울 수 있는 권한은 페타바이트를 지울 수 있는 권한과 같고, 그래서 `kms:ScheduleKeyDeletion`은 SCP로 조직 차원에서 좁히고, 별도 계정·별도 신뢰 경계에 백업과 키 관리를 분리해 두어야 한다. 위 3단계 절차가 "지나친 관료주의"가 아닌 이유가 여기에 있다.

## 한 줄 요약

키 정책(필수·영구), IAM(위임), grant(임시·세밀)가 KMS 권한의 삼각형이고, 그 위에 SCP가 가드레일로 얹힌다. 키 정책은 우회 불가능한 1차 관문이라 `Enable IAM User Permissions`를 지우면 키가 고아가 된다. grant는 `EncryptionContextSubset`/`Equals` 제약으로 세밀해지고, 최종 일관성 때문에 생성 직후에는 grant token을 함께 넘겨야 하며, 회수는 강제(`Revoke`)와 반납(`Retire`)으로 나뉜다. `kms:ViaService`로 키 사용을 특정 서비스 경로에 묶되 관리 액션까지 막지 않도록 범위를 나누고, `kms:CallerAccount`를 함께 건다. 교차계정은 *키 정책 허용 + 사용 계정 IAM 허용* 양측이 모두 필요하며, AWS managed key로 암호화된 스냅샷은 애초에 공유할 수 없다. 리전을 넘어야 하면 멀티 리전 키를 쓰되 복제본의 키 정책은 따로 관리한다. 마지막으로 즉시 무력화는 삭제가 아니라 disable이고, 삭제 권한은 SCP로 좁히고 CloudTrail·EventBridge로 감시한다.

---

## 📝 연습 문제

**문제 1.** AWS 서비스가 사용자를 대신해 *특정 암호화 컨텍스트에 한해, 임시로, 나중에 취소 가능하게* 키를 쓰도록 허용하되 키 정책 문서는 건드리지 않으려 한다. 가장 적절한 메커니즘은?

A) 키 정책에 새 Statement 추가  
B) IAM 인라인 정책 추가  
C) KMS grant 생성(operations·encryption context constraint 지정, 이후 revoke/retire 가능)  
D) 새 KMS 키 생성  

**정답: C**  
해설: grant는 프로그래밍적으로 생성·취소되는 임시·세밀 권한으로, 허용 작업과 암호화 컨텍스트 제약을 지정할 수 있고 RevokeGrant/retire로 회수된다. 정책 문서를 수정하지 않아 키 정책이 비대해지지 않는다. 키 정책/IAM은 영구적·광범위 권한에 적합하고, 새 키 생성은 이 요구와 무관하다.

---

**문제 2.** 키 정책에서 특정 역할이 KMS를 *직접* 호출하는 것은 막고, 오직 S3가 그 역할을 대신해 호출할 때만 복호화를 허용하려 한다. 어떤 조건 키를 써야 하는가?

A) `aws:SourceIp`  
B) `kms:ViaService`를 `s3.<region>.amazonaws.com`으로 지정  
C) `aws:MultiFactorAuthPresent`  
D) `kms:GrantIsForAWSResource`  

**정답: B**  
해설: `kms:ViaService` 조건은 KMS 작업이 지정한 AWS 서비스 엔드포인트를 통해 요청될 때만 허용하므로, S3를 통한 복호화만 허용하고 직접 호출은 거부한다. `aws:SourceIp`는 IP 기반, MFA 조건은 다중 인증, GrantIsForAWSResource는 grant 관련 조건으로 이 요구와 맞지 않는다.

---

**문제 3.** 계정 B가 계정 A 소유 KMS 키로 암호화된 데이터를 복호화하려 하는데 접근이 거부된다. 올바른 해결 절차는?

A) 계정 B의 IAM 정책만 수정하면 된다  
B) 계정 A의 키 정책에서 B에게 작업을 허용하고, 동시에 계정 B의 IAM 정책에서 A의 키 ARN에 대한 작업을 허용한다(양측 모두)  
C) 키를 public으로 설정한다  
D) 계정 A에서 키를 비활성화한다  

**정답: B**  
해설: 교차계정 KMS 접근은 리소스 기반 정책(A의 키 정책)이 허용하고 동시에 사용 계정(B)의 IAM이 허용해야 성립한다. 어느 한쪽만으로는 실패한다. IAM만 수정하면 키 정책의 위임이 없어 거부되고, 키를 public으로 만드는 옵션은 존재하지 않으며, 비활성화는 데이터를 못 읽게 만든다.

---

**문제 4.** 유출이 의심되는 KMS 키를 *즉시*, 그리고 필요하면 되돌릴 수 있게 무력화해야 한다. 가장 적절한 조치는?

A) `ScheduleKeyDeletion`으로 즉시 삭제  
B) 키를 disable(비활성화)하고, 필요 시 키 정책·grant를 회수하며 조사한다(disable은 즉시·가역적)  
C) 키 별칭만 삭제  
D) 30일 대기 후 자동 삭제되도록 둔다  

**정답: B**  
해설: 키 disable은 즉시 효력이 있고 가역적이어서 의심 상황의 긴급 무력화에 적합하다. `ScheduleKeyDeletion`은 7~30일 대기 후 비가역 삭제이므로 "즉시·되돌릴 수 있게"라는 요구에 맞지 않고, 삭제되면 데이터가 영구 복호화 불가가 된다. 별칭 삭제는 키 사용을 막지 못하고, 자동 삭제 방치는 위험하다.

---

**문제 5.** 조직 전체에서 일반 계정이 KMS 키를 삭제하거나 키 정책을 변경하지 못하게 막고, 보안 OU의 역할만 키를 관리하게 하려 한다. 가장 적절한 조합은?

A) 각 계정에서 IAM 사용자에게만 권한 부여  
B) Organizations SCP로 `kms:ScheduleKeyDeletion`·`kms:PutKeyPolicy`를 보안 OU 외 계정에서 Deny하고, 키 정책에서 관리 권한을 보안팀 역할로 한정  
C) 모든 키를 AWS managed key로 전환  
D) CloudTrail만 활성화  

**정답: B**  
해설: SCP는 조직 차원 가드레일로 일반 계정의 삭제·정책 변경 작업을 Deny하고, 키 정책으로 실제 관리 권한을 보안팀 역할에 한정하는 가드레일+세밀 통제 조합이 정답이다. IAM 사용자 권한만으로는 조직 가드레일이 없고, AWS managed key 전환은 거버넌스 통제력을 오히려 잃으며, CloudTrail은 감사만 할 뿐 행위를 막지 못한다.

---
