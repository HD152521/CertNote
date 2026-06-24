# Day 3 - 키 정책·그랜트·교차계정 공유: ViaService 조건과 키 거버넌스

KMS 권한을 통제하는 세 가지 메커니즘은 *키 정책(필수, 영구)*, *IAM 정책(위임 시)*, 그리고 오늘의 주제인 **grant(임시·세밀)**다. 어제까지는 데이터가 어떻게 암호화되는지를 봤다면, 오늘은 "누가, 어떤 조건에서, 얼마 동안 키를 쓸 수 있는가"라는 *접근 거버넌스*를 다룬다. SCS-C03는 교차계정 키 공유, `kms:ViaService` 조건, grant의 동작을 매우 자주 출제한다.

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

> 💡 **관련 이론**: grant vs 키 정책 vs IAM의 선택 기준 — *영구적이고 사람이 검토할 광범위 권한*은 키 정책/IAM, *세밀하고 임시이며 프로그래밍적으로 생성·취소될 권한*은 grant다. AWS 서비스 통합(EBS, Redshift 등)이 내부적으로 grant를 만든다. 시험에서 "정책 수정 없이 임시로, 특정 암호화 컨텍스트에 한해, 취소 가능하게 권한을 주고 싶다" → grant.

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

> 🎯 **시나리오**: "데이터 키가 오직 RDS 암호화 용도로만 쓰이고, 어떤 사람도 KMS를 직접 호출해 복호화하지 못하게 하라." → 키 정책에 `kms:ViaService`를 `rds.<region>.amazonaws.com`으로 제한. 키 사용을 특정 서비스 경로에 묶어 데이터 유출 표면을 줄인다.

> ⚠️ **함정**: `kms:ViaService`만 걸고 `kms:CallerAccount`를 빠뜨리면, 다른 계정의 동일 서비스가 요청할 여지가 생길 수 있다. 교차계정 시나리오에서는 두 조건을 함께 고려한다.

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

> 💡 **관련 이론**: 리소스 기반 정책(키 정책)이 *허용*하고 동시에 사용 계정의 IAM이 *허용*해야 교차계정 접근이 성립한다. 한쪽만 있으면 실패한다 — 이것이 S3 버킷·교차계정 공유 전반의 일관된 원리(양측 동의)다. 시험에서 "교차계정인데 접근이 안 된다"면 둘 중 하나가 빠졌는지 먼저 확인한다.

교차계정 공유의 실제 예: 계정 B가 계정 A의 키로 암호화된 EBS 스냅샷을 공유받아 복원하거나, A의 키로 암호화된 RDS 스냅샷을 공유받는 경우. 스냅샷 공유 자체(RDS/EBS 공유 API)와 *키 접근 권한 부여*는 별개이며 둘 다 필요하다.

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

> 🎯 **시나리오**: "여러 계정이 공유 키를 쓰는데, 키 삭제와 키 정책 변경을 일반 계정에서 못 하게 막고 보안 계정에서만 관리하고 싶다." → SCP로 `kms:ScheduleKeyDeletion`·`kms:PutKeyPolicy`를 보안 OU 외 계정에서 Deny, 키 정책은 보안팀 역할에만 관리 권한 부여. 가드레일(SCP) + 키 정책(세밀)의 조합.

## 키 삭제: 되돌릴 수 없는 위험

KMS 키 삭제는 *최소 7일~최대 30일의 대기 기간*을 둔 예약 삭제(`ScheduleKeyDeletion`)로만 가능하다. 대기 중에는 `CancelKeyDeletion`으로 취소할 수 있다. 키가 실제 삭제되면 그 키로 암호화된 *모든 데이터가 영구히 복호화 불가*가 된다(crypto-shredding 효과). 즉시 차단이 필요하면 삭제 대신 **키 비활성화(disable)**를 쓴다 — 가역적이다.

> ⚠️ **함정**: "유출 의심 키를 즉시 무력화" 요구에 삭제를 고르면 안 된다. 삭제는 대기 기간이 있고 비가역적이다. 즉시·가역적 무력화는 *disable*이며, 의심 상황에서는 키 정책/grant 회수도 함께 한다.

## 한 줄 요약

키 정책(필수·영구), IAM(위임), grant(임시·세밀)가 KMS 권한의 삼각형이다. `kms:ViaService`로 키 사용을 특정 서비스 경로에 묶고, 교차계정은 *키 정책 허용 + 사용 계정 IAM 허용* 양측이 모두 필요하다. SCP·`aws:PrincipalOrgID`·CloudTrail로 조직 거버넌스를 세우고, 즉시 무력화는 삭제가 아니라 disable이다.

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
