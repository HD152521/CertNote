# Day 1 - 접근 제어: IAM과 Lake Formation 권한

## 📌 핵심 정리

- IAM 평가는 명시적 Deny > 명시적 Allow > 묵시적 거부 순이다. 같은 계정은 자격 증명 정책과 리소스 정책 중 하나만 허용해도 되지만, **교차 계정은 양쪽 모두** 허용해야 한다.
- Lake Formation 으로 관리되는 데이터는 IAM 권한과 Lake Formation 권한을 **모두** 통과해야 읽힌다. IAM 은 "API 를 부를 수 있는가", Lake Formation 은 "이 테이블·컬럼·행을 볼 수 있는가"다.
- Lake Formation 은 등록된 S3 위치에 대해 임시 자격 증명을 발급한다(credential vending). 사용자에게 S3 권한을 직접 줄 필요가 없고, 대신 `lakeformation:GetDataAccess` 가 필요하다.
- 세분화는 컬럼 수준, 행 수준, 둘을 합친 셀 수준이며 **데이터 필터**로 구현한다. 필터는 읽기(`SELECT`)에만 걸린다.
- 테이블이 계속 늘어나는 환경은 명명형 권한 대신 LF-Tags(TBAC)로 관리한다. 교차 계정은 신뢰 정책 + 권한 정책 + (암호화 시) KMS 키 정책이 모두 맞아야 한다.

## IAM 기초와 최소 권한 원칙

데이터 보안의 출발점은 "누가 무엇에 접근할 수 있는가"를 정하는 접근 제어다. AWS 분석 환경에서는 IAM 이 서비스 API 수준의 넓은 권한을, Lake Formation 이 카탈로그 수준의 세밀한 권한을 맡는다.

| 정책 종류 | 붙는 곳 | 역할 |
|------|------|------|
| 자격 증명 기반 정책 | 사용자·그룹·역할 | 이 주체가 무엇을 할 수 있는가 |
| 리소스 기반 정책 | S3 버킷, KMS 키, 역할(신뢰 정책) 등 | 이 리소스에 누가 접근할 수 있는가 |
| 권한 경계 | 사용자·역할 | 자격 증명 정책이 줄 수 있는 권한의 상한 |
| 서비스 제어 정책(SCP) | 조직의 계정·OU | 계정 안 누구도 넘을 수 없는 상한 |

- **역할(Role)** 은 임시 자격 증명을 준다. Glue·EMR 같은 서비스가 사용자 대신 일할 때, 그리고 다른 계정이 접근할 때 쓴다.
- **최소 권한(Least Privilege)** 은 작업에 꼭 필요한 권한만 주는 것이다. 와일드카드(`*`)를 남발하지 않고 `Resource` 와 `Condition` 으로 범위를 좁힌다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowReadSpecificPrefix",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::lake-curated/sales/*",
      "Condition": {
        "StringEquals": { "aws:RequestedRegion": "ap-northeast-2" }
      }
    }
  ]
}
```

> 💡 **관련 이론**: IAM 평가 로직은 "명시적 거부(Deny) > 명시적 허용(Allow) > 묵시적 거부"다. 어떤 정책에든 Deny 가 하나라도 맞으면 즉시 차단되고, 어디에도 Allow 가 없으면 기본값인 묵시적 거부로 끝난다. 권한 경계와 SCP 는 권한을 **주지 않는다.** 줄 수 있는 범위를 깎을 뿐이다.

| 상황 | 허용 조건 |
|------|------|
| 같은 계정 안의 접근 | 자격 증명 정책 **또는** 리소스 정책 중 하나가 허용(어디에도 Deny 가 없어야 함) |
| 다른 계정의 리소스 접근 | 요청하는 쪽 계정의 자격 증명 정책 **그리고** 리소스 쪽 계정의 리소스 정책이 모두 허용 |

- 교차 계정 요청은 두 계정에서 각각 평가되고, 둘 다 허용이어야 통과한다. "버킷 정책에 상대 계정을 넣었는데도 거부된다"면 상대 계정의 역할에 S3 권한이 없는 것이다.

## Lake Formation 은 어떻게 접근을 통제하나

Lake Formation 은 Glue Data Catalog 의 데이터베이스·테이블·컬럼 권한을 한곳에서 관리한다. 동작의 핵심은 S3 위치의 **등록(register)** 과 **자격 증명 발급(credential vending)** 이다.

```text
① 관리자가 S3 위치를 Lake Formation 에 등록(등록 시 그 위치를 읽고 쓸 수 있는 역할을 지정)
② 사용자가 Athena 로 쿼리
③ Athena 가 Lake Formation 에 요청 → Lake Formation 이 권한(테이블·컬럼·행)을 확인
④ 통과하면 등록 역할을 맡아 만든 임시 자격 증명을 Athena 에 발급
⑤ Athena 는 그 자격 증명으로 S3 를 읽되, 허용된 컬럼·행만 사용자에게 돌려준다
```

- 사용자는 S3 버킷에 대한 IAM 권한을 직접 갖지 않아도 된다. S3 접근 권한은 등록에 쓴 역할이 갖는다.
- 대신 사용자(또는 서비스의 실행 역할)에게 IAM 권한 `lakeformation:GetDataAccess` 가 있어야 한다. 이 권한의 `Resource` 는 `*` 만 지원된다. Athena 는 사용자 본인에게, 다른 통합 서비스는 실행 역할에 이 권한을 요구한다.
- Lake Formation 은 **S3 API 로 직접 들어오는 접근을 막지 않는다.** 사용자에게 IAM 으로 `s3:GetObject` 가 남아 있으면 컬럼 필터를 건 테이블의 원본 파일을 그대로 내려받을 수 있다. Lake Formation 으로 통제하려면 직접 경로의 S3 권한을 걷어 낸다.

```text
사용자 요청 → [IAM 정책 통과?] → [Lake Formation 권한 통과?] → 데이터 접근
              둘 중 하나라도 거부되면 차단
```

## 기본 설정이 만드는 함정: IAMAllowedPrincipals

Lake Formation 은 기존 Glue 사용자와의 호환을 위해 처음에는 **사실상 꺼진 상태**다.

- 기존 카탈로그 리소스 전부에 `IAMAllowedPrincipals` 그룹이 `Super` 권한을 갖고 있다.
- 새 리소스에는 "IAM 접근 제어만 사용" 설정이 켜져 있다.
- 결과적으로 접근은 IAM 정책만으로 결정되고, 개별 Lake Formation 권한은 효력이 없다.

| 증상 | 원인 |
|------|------|
| 컬럼 권한을 줬는데 사용자가 전체 컬럼을 본다 | 테이블에 `IAMAllowedPrincipals` 의 `Super` 가 남아 있음 |
| 새로 만든 테이블에만 통제가 안 걸린다 | 새 리소스의 기본 권한 설정을 바꾸지 않음 |

- Lake Formation 통제를 실제로 켜려면 새 리소스의 기본 설정을 바꾸고, 기존 리소스에서 `IAMAllowedPrincipals` 권한을 회수한다.
- 한 번에 바꾸기 어려우면 **하이브리드 액세스 모드**를 쓴다. 특정 사용자 집합에만 Lake Formation 권한을 적용하고 나머지 기존 워크로드는 IAM 방식 그대로 둔 채 옮겨 갈 수 있다.

## Lake Formation 권한의 종류

| 권한 | 대상 | 의미 |
|------|------|------|
| `SELECT` / `INSERT` / `DELETE` | 테이블 | 기반 데이터의 읽기·쓰기·삭제 |
| `DESCRIBE` | 데이터베이스·테이블 | 메타데이터 조회 |
| `ALTER` / `DROP` | 데이터베이스·테이블 | 정의 변경·삭제 |
| `CREATE_TABLE` | 데이터베이스 | 테이블 생성 |
| `DATA_LOCATION_ACCESS` | 등록된 S3 위치 | 그 위치를 가리키는 카탈로그 리소스를 만들 수 있음 |
| `Super` | 전체 | 해당 리소스의 모든 작업 |

- 권한은 **부여(grant) 방식**이다. `with grant option` 을 붙이면 받은 사람이 다른 주체에게 다시 줄 수 있다.
- **데이터 위치 권한**은 읽기 권한이 아니다. "이 S3 경로를 가리키는 테이블을 만들어도 되는가"를 통제한다. 누군가 민감 경로 위에 자기 테이블을 만들어 우회하는 것을 막는 장치다. 데이터를 읽고 쓰는 데는 `SELECT`·`INSERT` 면 충분하다.

## 세분화 권한: 컬럼·행·셀과 데이터 필터

| 수준 | 방법 | 예 |
|------|------|------|
| 컬럼 수준 | 포함하거나 제외할 컬럼 지정 | PII 컬럼(email, ssn) 숨기기 |
| 행 수준 | 행 필터 표현식 | 자기 지역 행만 보기 |
| 셀 수준 | 컬럼 지정 + 행 필터 | PII 없이 자기 지역 행만 |

세 수준 모두 **데이터 필터(Data Cells Filter)** 하나로 표현한다. 필터를 만들고, 그 필터에 `SELECT` 를 부여한다.

```json
{
  "Name": "analyst_kr_no_pii",
  "TableCatalogId": "111122223333",
  "DatabaseName": "sales",
  "TableName": "orders",
  "ColumnWildcard": { "ExcludedColumnNames": ["email", "ssn"] },
  "RowFilter": { "FilterExpression": "region = 'ap-northeast-2'" }
}
```

```bash
aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier=arn:aws:iam::111122223333:role/RegionAnalyst \
  --permissions SELECT \
  --resource '{"DataCellsFilter":{"TableCatalogId":"111122223333","DatabaseName":"sales","TableName":"orders","Name":"analyst_kr_no_pii"}}'
```

- 행 필터 표현식은 PartiQL 의 `WHERE` 절 문법을 따른다. 문자열은 작은따옴표로 감싼다. 모든 행을 허용하려면 "모든 행" 와일드카드를 쓴다.
- 필터는 **읽기에만** 적용된다. 필터와 함께 줄 수 있는 권한은 `SELECT` 뿐이다.
- 테이블 하나에 필터를 여러 개 만들고, 역할마다 다른 필터를 부여한다. 같은 쿼리를 날려도 역할에 따라 결과가 달라진다.
- Athena, Redshift Spectrum, EMR 같은 통합 엔진이 이 필터를 적용한다. 셀 수준 필터가 걸린 테이블을 읽는 Glue 잡에서는 잡 북마크, 푸시다운 조건 등 일부 기능을 쓸 수 없다.

## 대규모 권한 관리: LF-Tags(TBAC)

명명형(named resource) 권한은 사용자와 테이블이 늘수록 GRANT 문이 곱으로 늘어난다. **LF-Tags** 는 리소스에 태그를 붙이고, 태그 값에 권한을 부여한다.

```json
{
  "TagPolicy": {
    "Expression": [
      { "TagKey": "sensitivity", "TagValues": ["public", "internal"] },
      { "TagKey": "domain", "TagValues": ["sales"] }
    ],
    "Permissions": ["SELECT", "DESCRIBE"]
  }
}
```

- 위 예시는 `sensitivity` 가 public 또는 internal **이고** `domain` 이 sales 인 리소스에 SELECT 를 준다. 키끼리는 AND, 한 키의 값끼리는 OR 다. `sensitivity=confidential` 리소스는 자동으로 빠진다.
- 태그는 **상속**된다. 데이터베이스의 태그를 테이블이, 테이블의 태그를 컬럼이 물려받고, 아래에서 값을 덮어쓸 수 있다. 컬럼 하나에만 `sensitivity=confidential` 을 붙이면 그 컬럼만 빠지는 컬럼 수준 통제가 된다.
- 새 테이블은 태그만 맞으면 권한이 자동으로 적용된다. GRANT 를 새로 쓸 필요가 없다.
- **LF-Tags 는 IAM 태그가 아니다.** 서로 바꿔 쓸 수 없다. LF-Tags 는 Lake Formation 권한 부여에, IAM 태그는 IAM 정책 조건에 쓴다.

| 비교 | 명명형 권한 | LF-Tags(TBAC) |
|------|------|------|
| 부여 단위 | 리소스 이름 | 태그 표현식 |
| 필요한 작업 수 | 주체 수 × 리소스 수 | 주체 수 + 리소스 수 |
| 새 테이블 | 매번 GRANT 추가 | 태그만 붙이면 끝 |
| 맞는 규모 | 테이블이 적고 고정적 | 테이블이 많고 계속 늘어남 |

## 교차 계정 접근

| 방법 | 동작 | 주의점 |
|------|------|------|
| Lake Formation 교차 계정 공유 | 카탈로그 리소스를 다른 계정·조직·OU 또는 상대 계정의 IAM 주체에 직접 부여. 내부적으로 AWS RAM 으로 공유된다 | 같은 조직이면 즉시 사용 가능, 조직 밖이면 상대 계정이 RAM 초대를 수락해야 한다 |
| S3 버킷 정책 | 버킷에 상대 계정 주체를 허용 | 세분화가 안 된다. 상대 계정의 자격 증명 정책도 필요 |
| 역할 위임(AssumeRole) | 신뢰 정책으로 외부 계정이 역할을 맡게 함 | 역할의 권한 정책과 상대 쪽의 `sts:AssumeRole` 권한이 모두 필요 |

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::444455556666:root" },
  "Action": "sts:AssumeRole"
}
```

- 공유받은 계정에서 Athena·Redshift Spectrum 으로 조회하려면 **리소스 링크(resource link)** 를 만들어야 한다. 공유된 테이블이 쿼리 엔진에 보이게 하는 로컬 포인터다.
- 공유받은 계정의 데이터 레이크 관리자는 받은 권한을 자기 계정의 사용자에게 **다시 부여**해야 한다. 계정에 공유됐다고 그 계정의 모든 사용자가 읽을 수 있는 것은 아니다.
- 데이터가 고객 관리형 KMS 키로 암호화돼 있으면 키 정책에도 교차 계정 주체를 허용해야 한다. AWS 관리형 키(`aws/s3`)는 키 정책을 바꿀 수 없어 교차 계정 공유에 쓸 수 없다.

> 💡 **관련 이론**: 교차 계정 접근은 "신뢰하는 쪽(trust policy)"과 "권한을 주는 쪽(permission policy)" 양쪽이 모두 설정돼야 한다. 암호화된 데이터라면 KMS 키 정책까지 세 겹이 맞아야 성공한다. 문제에서 둘은 맞는데 실패한다면 남은 하나가 답이다.

## 증상 → 원인 → 조치

| 증상 | 원인 | 조치 |
|------|------|------|
| IAM 은 충분한데 Athena 가 "Insufficient permissions" | Lake Formation 에 `SELECT`·`DESCRIBE` 가 없음 | 테이블(또는 필터)에 권한 부여 |
| Lake Formation 권한은 있는데 거부 | `lakeformation:GetDataAccess` IAM 권한 누락 | 사용자·실행 역할에 추가 |
| 컬럼을 숨겼는데 다 보임 | `IAMAllowedPrincipals` 의 `Super` 가 남음 | 회수하고 기본 설정 변경 |
| 필터를 걸었는데 원본 파일을 내려받음 | 사용자에게 S3 직접 권한이 있음 | IAM·버킷 정책에서 직접 접근 제거 |
| 공유받은 테이블이 Athena 에 안 보임 | RAM 초대 미수락 또는 리소스 링크 없음 | 초대 수락, 리소스 링크 생성 |
| 교차 계정 조회가 복호화 단계에서 실패 | KMS 키 정책에 상대 주체 없음 | 키 정책에 `kms:Decrypt` 허용 |
| 새 테이블마다 권한 요청이 밀림 | 명명형 권한 운영 | LF-Tags 로 전환 |

## 지문 단서 → 정답 판별표

| 지문 단서 | 정답 |
|------|------|
| "IAM 정책은 다 허용인데 테이블 조회가 거부" | Lake Formation 권한 누락 |
| "PII 컬럼 제외 + 자기 지역 행만" | 데이터 필터(셀 수준) |
| "테이블이 매주 수백 개 추가, GRANT 부담 제거" | LF-Tags(TBAC) |
| "다른 계정과 카탈로그 테이블을 세분화해 공유" | Lake Formation 교차 계정 공유(RAM) |
| "교차 계정 + 암호화 데이터 접근 실패" | KMS 키 정책 |
| "Deny 와 Allow 가 함께 있을 때" | 명시적 Deny 가 우선 |
| "기존 IAM 기반 워크로드를 깨지 않고 점진 전환" | 하이브리드 액세스 모드 |
| "민감 S3 경로 위에 임의로 테이블을 만들지 못하게" | 데이터 위치 권한 |

내일은 접근을 허용받은 뒤에도 데이터를 보호하는 층, KMS 와 서비스별 암호화를 다룬다.

## 📖 용어

- **최소 권한** : 일을 하는 데 꼭 필요한 권한만 주는 원칙.
- **신뢰 정책** : 역할에 붙어 "누가 이 역할을 맡을 수 있는가"를 정하는 리소스 기반 정책.
- **등록(register)** : S3 위치를 Lake Formation 이 통제하도록 맡기는 일. 이때 그 위치를 읽고 쓸 역할을 지정한다.
- **credential vending** : Lake Formation 이 권한을 확인한 뒤 쿼리 엔진에 임시 자격 증명을 내주는 방식.
- **IAMAllowedPrincipals** : IAM 정책으로 허용된 모든 주체를 뜻하는 가상 그룹. 이 그룹의 권한이 남아 있으면 Lake Formation 통제가 걸리지 않는다.
- **데이터 필터** : 볼 수 있는 컬럼과 행 조건을 하나로 묶은 Lake Formation 객체.
- **LF-Tags** : 카탈로그 리소스에 붙여 권한 부여의 기준으로 쓰는 Lake Formation 전용 태그.
- **명명형 권한** : 데이터베이스·테이블 이름을 하나하나 지정해 주는 권한 부여 방식.
- **리소스 링크** : 다른 계정에서 공유받은 테이블을 내 카탈로그에서 가리키는 포인터.
- **데이터 위치 권한** : 특정 S3 경로를 가리키는 카탈로그 리소스를 만들 수 있는 권한.

## 📝 연습 문제

**문제 1.** 한 분석가가 Athena로 Glue 카탈로그 테이블을 조회하려는데 "Insufficient permissions" 오류가 발생한다. IAM 정책에는 `athena:*`, `glue:GetTable`, `s3:GetObject`가 모두 허용돼 있다. 가장 가능성 높은 원인은?

A) S3 버킷이 버전 관리되지 않음  
B) Athena 워크그룹이 비활성화됨  
C) 테이블이 CSV 포맷임  
D) Lake Formation에서 해당 테이블에 SELECT 권한이 부여되지 않음  

**정답: D**  
해설: Lake Formation으로 관리되는 데이터는 IAM 권한이 충분해도 LF에서 SELECT/DESCRIBE 권한이 별도로 부여돼야 접근됩니다. 버전 관리·워크그룹·포맷은 권한 거부의 직접 원인이 아닙니다.

---

**문제 2.** 수백 개의 테이블이 매주 추가되는 데이터레이크에서, 새 테이블이 생길 때마다 사용자별 GRANT 문을 추가하는 운영 부담을 없애려 한다. 가장 적절한 접근 제어 방식은?

A) 모든 사용자에게 `lakeformation:*` 부여  
B) S3 버킷 정책으로만 제어  
C) LF-Tags(TBAC)로 태그 표현식 기반 권한 부여  
D) 사용자마다 별도 AWS 계정 생성  

**정답: C**  
해설: TBAC는 리소스에 태그를 붙이고 태그 표현식에 권한을 부여하므로, 같은 태그를 가진 새 테이블은 자동으로 권한이 적용됩니다. 와일드카드 부여는 최소 권한 위반, 버킷 정책은 세분화가 약하고, 계정 분리는 과도합니다.

---

**문제 3.** 분석가에게 `orders` 테이블에서 PII 컬럼(email, ssn)을 제외하고, 자신의 지역(`region`) 행만 보여주려 한다. Lake Formation에서 사용할 단일 기능은?

A) 데이터 필터(Data Cells Filter)  
B) S3 Object Lock  
C) 파티션 프로젝션  
D) KMS 키 정책  

**정답: A**  
해설: 데이터 필터는 노출 컬럼 목록과 행 필터 표현식을 하나로 묶어 컬럼·행을 동시에 제어합니다. Object Lock은 삭제 방지, 파티션 프로젝션은 성능, KMS 키 정책은 암호화 권한으로 세분화 접근과 무관합니다.

---

**문제 4.** 계정 A의 데이터레이크 테이블을 계정 B의 역할이 조회하도록 교차 계정 공유를 설정했다. 데이터는 KMS CMK로 암호화돼 있다. 접근이 여전히 실패하는 흔한 원인은?

A) 계정 B에 인터넷 게이트웨이가 없음  
B) 계정 A의 S3 버킷이 비어 있음  
C) 두 계정이 같은 리전에 없음  
D) KMS 키 정책에 계정 B 주체의 복호화 권한이 없음  

**정답: D**  
해설: 암호화된 데이터는 LF/S3 권한이 정렬돼도 KMS 키 정책에 교차 계정 주체의 `kms:Decrypt` 권한이 없으면 복호화에 실패합니다. 게이트웨이·빈 버킷·리전은 일반적 실패 원인이 아닙니다.

---

**문제 5.** IAM 정책 평가에 대한 설명으로 옳은 것은?

A) Allow가 하나라도 있으면 Deny를 무시한다  
B) 묵시적 허용이 기본값이다  
C) 명시적 Deny는 어떤 Allow보다 우선해 항상 차단한다  
D) 리소스 기반 정책은 평가에 포함되지 않는다  

**정답: C**  
해설: IAM은 명시적 Deny가 최우선이며, Allow가 없으면 묵시적 거부가 기본값입니다. 리소스 기반 정책도 평가에 포함됩니다. 나머지 보기는 평가 로직을 반대로 설명한 오답입니다.

---
