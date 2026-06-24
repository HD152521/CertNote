# Day 1 - Secrets Manager: 자동 회전(Lambda), Parameter Store 비교, 교차계정 시크릿

시크릿(secret)은 "노출되면 곧바로 침해로 이어지는 자격증명"이다. DB 비밀번호, API 키, OAuth 토큰, TLS 개인키가 여기에 속한다. 보안 시험의 관점에서 시크릿 관리의 본질은 단순한 "암호화 저장"이 아니라 *수명주기 전체의 통제*다. 저장 시 암호화, 접근 시 IAM 인가, 사용 후 회전(rotation), 폐기 시 삭제 유예 — 이 네 단계를 모두 관리해야 한다. AWS Secrets Manager는 이 수명주기를 자동화하기 위해 설계된 서비스다.

## 왜 코드/환경변수에 시크릿을 박으면 안 되는가

시크릿을 소스 코드, Git 저장소, EC2 사용자 데이터, 컨테이너 환경변수에 하드코딩하면 세 가지 문제가 발생한다. 첫째, 코드 접근 권한을 가진 모두가 시크릿을 본다(최소 권한 위반). 둘째, 회전이 불가능하다 — 바꾸려면 재배포해야 한다. 셋째, 감사가 안 된다 — 누가 언제 시크릿을 읽었는지 추적할 수 없다. Secrets Manager는 이 세 가지를 모두 해결한다: KMS로 봉투 암호화하고, IAM/리소스 정책으로 접근을 제어하며, CloudTrail로 `GetSecretValue` 호출을 기록한다.

> 💡 **관련 이론**: 시크릿 관리는 *secret zero* 문제로 귀결된다. "시크릿을 안전하게 가져오려면 또 다른 자격증명이 필요한데, 그 자격증명은 어떻게 보호하나?"라는 무한 후퇴다. AWS는 이를 IAM 역할(role)로 끊는다 — EC2/Lambda/ECS는 인스턴스 메타데이터 또는 태스크 역할로 임시 자격증명을 받고, 그 임시 자격증명으로 Secrets Manager를 호출한다. 즉 "기계 신원(machine identity)"이 secret zero를 대체한다. 디스크에 영속 시크릿이 없다.

## Secrets Manager의 저장·암호화 모델

시크릿 값은 항상 KMS 키로 암호화되어 저장된다. 기본은 AWS 관리형 키 `aws/secretsmanager`지만, 시험에서 권장되는 것은 **고객 관리형 KMS 키(CMK)**다. CMK를 쓰면 키 정책으로 "어떤 보안 주체가 이 시크릿을 복호화할 수 있는가"를 추가로 통제할 수 있고, 교차계정 공유 시 필수가 된다.

```bash
aws secretsmanager create-secret \
  --name prod/db/mysql \
  --description "Production MySQL master credentials" \
  --kms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234 \
  --secret-string '{"username":"admin","password":"P@ssw0rd!","host":"db.internal","port":3306}'
```

시크릿 값은 JSON 구조로 저장하는 것이 관례다 — 회전 Lambda와 RDS 통합이 `username`/`password` 등 표준 키를 기대하기 때문이다.

## 접근 통제: IAM 정책 + 리소스 정책

Secrets Manager 접근은 두 축으로 통제된다. **자격증명 기반 정책**(IAM)은 "이 주체가 어떤 시크릿에 무엇을 할 수 있나", **리소스 기반 정책**(시크릿에 직접 붙는 정책)은 "이 시크릿에 누가 접근할 수 있나"를 정의한다. 교차계정 접근은 반드시 리소스 정책이 있어야 한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowAppRoleRead",
    "Effect": "Allow",
    "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
    "Resource": "arn:aws:secretsmanager:ap-northeast-2:111122223333:secret:prod/db/mysql-*",
    "Condition": {
      "StringEquals": { "aws:PrincipalTag/team": "payments" }
    }
  }]
}
```

> ⚠️ **함정**: 시크릿 ARN 끝의 `-??????` 6자리 무작위 접미사를 잊지 말 것. Secrets Manager는 같은 이름의 시크릿이 삭제·재생성될 때를 구분하려 ARN 끝에 6자 무작위 접미사를 붙인다. IAM 정책 Resource에 `prod/db/mysql`만 쓰면 매칭이 안 된다 — `prod/db/mysql-*`처럼 와일드카드를 붙여야 접미사까지 매칭된다.

## 자동 회전(Rotation): Lambda 기반 4단계

회전은 Secrets Manager의 핵심 가치다. 시크릿이 주기적으로 자동 교체되면 유출된 자격증명의 유효 수명이 짧아진다. 회전은 Lambda 함수가 수행하며, AWS는 RDS·Redshift·DocumentDB용 회전 Lambda 템플릿을 제공한다.

회전 Lambda는 **4단계 step**으로 호출된다:

```
createSecret  → 새 시크릿 값 생성, AWSPENDING 버전 스테이지에 저장
setSecret     → 대상 서비스(예: DB)에 새 자격증명을 실제로 적용(ALTER USER 등)
testSecret    → AWSPENDING 자격증명으로 실제 연결/쿼리 테스트
finishSecret  → AWSPENDING 스테이지를 AWSCURRENT로 승격(이전 CURRENT는 AWSPREVIOUS로)
```

```
[AWSPREVIOUS] ← [AWSCURRENT] ← [AWSPENDING]
   직전 값        현재 사용값      회전 중 신규값
```

> 💡 **관련 이론**: 이 4단계는 *원자적 교체(atomic swap)*를 흉내 낸다. 핵심은 testSecret이 성공해야만 finishSecret로 승격된다는 점이다 — 새 자격증명이 실제로 동작함을 검증한 뒤에야 트래픽을 옮긴다. 만약 setSecret이 DB에 적용됐지만 testSecret이 실패하면, AWSCURRENT는 아직 옛 값을 가리키므로 애플리케이션은 멈추지 않는다. 이것은 무중단 배포의 blue/green 전환과 같은 원리다 — 검증 전까지 트래픽 컷오버를 미룬다.

### 단일 사용자 vs 교대(alternating) 사용자 전략

RDS 회전은 두 가지 전략이 있다:
- **single-user**: 같은 DB 사용자의 비밀번호만 바꾼다. 간단하지만, 비밀번호 변경과 애플리케이션의 캐시 갱신 사이에 짧은 인증 실패 창이 생길 수 있다. 회전 Lambda가 마스터 자격증명을 쓰지 않고 자기 자신을 회전한다.
- **alternating-users**: 두 개의 사용자(예: `app_user_1`, `app_user_2`)를 번갈아 쓴다. 회전 시 사용 중이 아닌 사용자의 비밀번호를 바꾼 뒤 전환하므로 다운타임이 거의 없다. 단, 회전 Lambda가 **마스터(슈퍼유저) 자격증명**을 별도 시크릿으로 가져야 한다(`masterarn` 참조).

> 🎯 **시나리오**: "RDS 비밀번호 회전 중 짧은 인증 오류가 발생하면 안 된다(무중단)"는 빈출이다. 정답은 alternating-users 전략이며, 이를 위해 회전 Lambda에 마스터 자격증명 시크릿을 연결해야 한다. single-user는 구현이 쉽지만 갱신 타이밍에 따라 순간 인증 실패가 가능하다.

```bash
aws secretsmanager rotate-secret \
  --secret-id prod/db/mysql \
  --rotation-lambda-arn arn:aws:lambda:ap-northeast-2:111122223333:function:SecretsManagerRDSMySQLRotation \
  --rotation-rules '{"AutomaticallyAfterDays":30}'
```

회전 Lambda는 VPC 안의 프라이빗 DB에 접근해야 하므로 보통 **DB와 같은 VPC**에 배치되고, Secrets Manager API를 호출하려면 **VPC 엔드포인트(또는 NAT)**가 필요하다. 이 네트워크 경로를 누락하면 회전이 타임아웃으로 실패한다.

## Parameter Store와의 비교: 언제 무엇을

AWS Systems Manager Parameter Store도 비밀값을 `SecureString`으로 KMS 암호화해 저장할 수 있다. 시험은 둘의 선택 기준을 묻는다.

| 항목 | Secrets Manager | Parameter Store (SecureString) |
|------|-----------------|--------------------------------|
| 자동 회전 | 내장(Lambda 통합) | 없음(직접 구현 필요) |
| 교차계정 공유 | 리소스 정책 지원 | 표준 파라미터는 미지원(Advanced도 제한적) |
| 비용 | 시크릿당 월정액 + API 호출 | Standard 무료, Advanced 유료 |
| 크기 한도 | 최대 64KB | Standard 4KB / Advanced 8KB |
| 랜덤 비밀번호 생성 | `GetRandomPassword` 내장 | 없음 |
| RDS/Redshift 통합 | 1급 통합 | 없음 |
| 용도 | 회전·교차계정이 필요한 진짜 시크릿 | 설정값, 회전 불필요한 단순 비밀, 비기밀 구성 |

> ⚠️ **함정**: "비용 최소화 + 회전 불필요한 단순 API 키 저장"이면 Parameter Store SecureString이 정답이다. 반대로 "DB 비밀번호 자동 회전" 또는 "교차계정 시크릿 공유"가 요구되면 Secrets Manager다. 흥미롭게도 Parameter Store는 Secrets Manager 시크릿을 `/aws/reference/secretsmanager/{secret-name}` 경로로 *참조*할 수 있어, 두 서비스를 함께 쓰는 패턴도 가능하다.

## 교차계정 시크릿 공유

계정 A의 시크릿을 계정 B의 역할이 읽게 하려면 **두 가지**가 모두 필요하다:

1. **시크릿 리소스 정책**: 계정 B 주체를 허용
2. **KMS 키 정책**: 계정 B 주체가 그 키로 복호화하도록 허용 — AWS 관리형 키 `aws/secretsmanager`는 키 정책을 수정할 수 없으므로 **반드시 CMK여야 한다**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "CrossAccountRead",
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::444455556666:role/AppReader" },
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "*"
  }]
}
```

그리고 KMS CMK 키 정책에 계정 B의 `kms:Decrypt`를 허용해야 한다. 계정 B 역할의 IAM 정책에도 `secretsmanager:GetSecretValue`와 `kms:Decrypt`가 있어야 한다(세 정책이 교집합으로 인가된다).

> 🎯 **시나리오**: "교차계정 시크릿 공유 시 계정 B에서 `AccessDeniedException`(KMS) 발생"의 전형적 원인은, 시크릿이 AWS 관리형 키로 암호화되어 있어서다. 관리형 키는 키 정책을 편집할 수 없어 외부 계정 복호화를 허용할 방법이 없다. 해결책: 시크릿을 CMK로 재암호화하고 키 정책에 계정 B의 Decrypt를 추가한다.

## 삭제 유예와 복구

`DeleteSecret`은 즉시 삭제가 아니라 **7~30일 복구 대기 기간**을 둔다(기본 30일). 이 기간 동안 `RestoreSecret`으로 복구 가능하다. 실수나 악의적 삭제로부터 보호하는 안전장치다. 즉시 삭제가 정말 필요하면 `--force-delete-without-recovery`를 쓰지만, 시험에서는 "실수 삭제 방지"를 위해 기본 유예 기간을 권장한다.

> 🔍 **더 깊이**: Secrets Manager에는 자동 캐싱 클라이언트 라이브러리가 있어, 애플리케이션이 매 호출마다 `GetSecretValue`를 때리지 않고 메모리에 캐싱하다가 회전 시점에만 갱신한다. 이것은 비용(API 호출당 과금)과 가용성(Secrets Manager 장애 시에도 캐시된 값으로 동작)을 모두 개선한다. 캐시 TTL을 회전 주기보다 짧게 잡는 것이 핵심이다 — 그래야 회전된 새 자격증명을 제때 집어온다.

---

## 📝 연습 문제

**문제 1.** RDS MySQL 마스터 비밀번호를 자동 회전하되, 회전 중 단 한 건의 인증 실패도 발생하면 안 된다. 가장 적절한 회전 전략은?

A) single-user 회전 — 같은 사용자의 비밀번호만 교체  
B) alternating-users 회전 — 두 사용자를 번갈아 쓰고 마스터 자격증명 시크릿을 회전 Lambda에 연결  
C) 회전을 비활성화하고 수동으로 분기마다 교체  
D) Parameter Store SecureString으로 옮긴 뒤 회전  

**정답: B**  
해설: alternating-users 전략은 현재 사용 중이 아닌 사용자의 비밀번호를 먼저 바꾼 뒤 전환하므로 인증 실패 창이 사실상 없다. 이를 위해 회전 Lambda는 슈퍼유저(마스터) 자격증명을 별도 시크릿으로 참조해야 한다. single-user는 비밀번호 변경과 캐시 갱신 사이에 순간 실패가 가능하고, 수동 회전은 자동화 요구에 어긋나며, Parameter Store는 자동 회전 기능 자체가 없다.

---

**문제 2.** 계정 A의 시크릿을 계정 B의 IAM 역할이 읽으려 하자 KMS 관련 `AccessDeniedException`이 발생한다. 시크릿은 `aws/secretsmanager` 관리형 키로 암호화되어 있다. 올바른 조치는?

A) 계정 B 역할에 `secretsmanager:GetSecretValue`만 추가하면 된다  
B) 시크릿을 고객 관리형 KMS 키(CMK)로 암호화하고, 그 키 정책에 계정 B의 kms:Decrypt를 허용한다  
C) 시크릿 복구 대기 기간을 늘린다  
D) 시크릿을 계정 B로 복제한다  

**정답: B**  
해설: 교차계정 복호화에는 시크릿 리소스 정책, KMS 키 정책, 계정 B IAM 정책 세 가지가 모두 필요하다. AWS 관리형 키 `aws/secretsmanager`는 키 정책을 편집할 수 없어 외부 계정에 Decrypt를 부여할 방법이 없다. 따라서 CMK로 재암호화하고 키 정책에 계정 B 주체의 kms:Decrypt를 추가해야 한다. GetSecretValue만으로는 복호화 단계에서 막히고, 복구 기간이나 복제는 무관하다.

---

**문제 3.** 회전 Lambda의 4단계 중, 새 자격증명이 실제로 동작하는지 검증한 뒤에야 현재 버전으로 승격되도록 보장하는 메커니즘은?

A) createSecret이 AWSCURRENT를 즉시 갱신한다  
B) testSecret이 AWSPENDING 자격증명으로 연결을 검증하고, 성공해야만 finishSecret이 AWSPENDING을 AWSCURRENT로 승격한다  
C) setSecret이 검증과 승격을 동시에 수행한다  
D) finishSecret이 먼저 승격한 뒤 testSecret으로 사후 검증한다  

**정답: B**  
해설: 회전은 createSecret(신규 생성, AWSPENDING) → setSecret(대상에 적용) → testSecret(AWSPENDING으로 실제 검증) → finishSecret(승격) 순서다. testSecret이 성공해야 finishSecret이 AWSPENDING을 AWSCURRENT로 올린다. 검증 실패 시 AWSCURRENT는 옛 값을 유지하므로 애플리케이션이 멈추지 않는다. createSecret/setSecret은 승격하지 않으며, 승격을 검증보다 먼저 하면 무중단 보장이 깨진다.

---

**문제 4.** 회전이 필요 없고 비용을 최소화하면서 단순 API 키 하나를 KMS 암호화해 저장하려 한다. 가장 적절한 서비스는?

A) Secrets Manager — 회전 기능을 끄고 사용  
B) Parameter Store의 SecureString 파라미터(Standard 티어)  
C) S3 객체로 SSE-KMS 저장  
D) DynamoDB 항목에 평문 저장  

**정답: B**  
해설: 회전·교차계정 공유가 불필요하고 비용이 우선이면 Parameter Store SecureString(Standard 티어, 무료)이 최적이다. KMS로 암호화 저장하고 IAM으로 접근을 통제한다. Secrets Manager는 시크릿당 월정액이 들어 단순 저장에는 과하고, S3/DynamoDB는 시크릿 전용 수명주기 기능이 없다. DynamoDB 평문 저장은 보안상 부적절하다.

---

**문제 5.** IAM 정책에서 `Resource`를 `arn:aws:secretsmanager:...:secret:prod/db/mysql`로 정확히 지정했는데도 `GetSecretValue`가 거부된다. 가장 가능성 높은 원인은?

A) 시크릿 ARN 끝의 6자 무작위 접미사가 매칭되지 않아서 — `prod/db/mysql-*`처럼 와일드카드를 붙여야 한다  
B) KMS 키가 비활성화되어서  
C) 시크릿 복구 대기 중이라서  
D) Parameter Store와 이름이 충돌해서  

**정답: A**  
해설: Secrets Manager는 같은 이름의 시크릿이 삭제·재생성될 때를 구분하려 ARN 끝에 `-` + 6자 무작위 문자를 붙인다. 정책 Resource에 접미사 없는 정확한 이름만 쓰면 실제 ARN과 매칭되지 않아 거부된다. `prod/db/mysql-*` 또는 `prod/db/mysql-??????`로 접미사를 포함해야 한다. KMS 비활성화는 복호화 단계에서 다른 오류를 내고, 복구 대기·이름 충돌은 이 증상의 원인이 아니다.

---
