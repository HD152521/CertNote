# Day 2 - AWS Lake Formation 중앙 권한 관리

## 📌 핵심 정리

- Lake Formation 은 Glue Data Catalog 위에서 **데이터베이스·테이블·컬럼·행** 단위 권한을 GRANT/REVOKE 로 관리한다. S3 버킷 정책과 IAM 정책에 흩어진 데이터 권한을 한곳으로 모은다.
- S3 위치를 **등록(register)** 하면 통합 엔진(Athena·Glue·EMR·Redshift Spectrum)이 Lake Formation 에서 임시 자격 증명을 받아 읽는다(**credential vending**). 사용자에게 S3 직접 권한이 없어도 된다.
- 권한 부여는 **명명형 리소스** 또는 **LF-Tags(LF-TBAC)** 방식이다. 리소스가 많으면 태그 기반이 권장된다.
- **데이터 필터**로 컬럼·행·셀 수준 보안을 건다. 필터는 읽기에만 적용되므로 SELECT 권한에만 붙는다.
- IAM 과 Lake Formation 권한은 **둘 다** 필요하다. 기본 설정의 `IAMAllowedPrincipals` 권한이 남아 있으면 Lake Formation 권한은 강제되지 않는다.

## Lake Formation 이 해결하는 문제

데이터 레이크가 커지면 "누가 어떤 테이블·컬럼·행에 접근할 수 있는가"를 IAM 정책만으로 관리하기 어렵다. S3 + Glue Data Catalog 만 쓰면 권한이 두 군데로 갈린다.

- **메타데이터**: IAM 정책의 `glue:GetTable` 같은 액션과 Glue 리소스 정책.
- **데이터**: S3 버킷 정책과 IAM 정책의 `s3:GetObject`.

이 구조에서는 권한의 최소 단위가 **S3 프리픽스**다. "이 테이블에서 주민번호 컬럼만 빼고", "자기 지역 행만"을 표현할 수 없다. 컬럼을 가리려면 컬럼을 뺀 사본 테이블을 따로 만들어야 한다.

Lake Formation 은 이를 RDBMS 식 권한 모델로 바꾼다. 권한은 두 층으로 걸린다.

- **메타데이터 권한**: Data Catalog 의 데이터베이스·테이블에 대한 권한. 권한이 없는 테이블은 `GetTables` 응답에 아예 나오지 않는다.
- **스토리지 접근 관리**: 등록된 S3 위치의 데이터를 통합 엔진이 대신 읽도록 임시 자격 증명을 내준다.

> 💡 **관련 이론**: Lake Formation 은 Glue Data Catalog 를 권한 제어 지점으로 쓴다. 별도의 카탈로그를 만드는 것이 아니라 같은 카탈로그의 데이터베이스·테이블에 GRANT/REVOKE 를 얹는 것이다. 그래서 크롤러·ETL 잡·Athena 테이블은 그대로 두고 권한 계층만 바뀐다.

## 쿼리 한 번이 거치는 네 단계

분석가가 Athena 로 Lake Formation 관리 테이블을 조회하면 다음 순서로 진행된다.

```text
① 메타데이터 요청   Athena → Data Catalog : 이 테이블의 정의를 달라
② 권한 확인         Data Catalog → Lake Formation : 이 사용자가 볼 수 있는가
                    → 허용된 컬럼만 담긴 메타데이터를 엔진에 반환
③ 자격 증명 요청    Athena → Lake Formation : 등록된 위치의 데이터 접근 권한을 달라
                    → Lake Formation 이 등록 시 지정한 역할로 임시 자격 증명 발급
④ 데이터 읽기       Athena → S3 : 임시 자격 증명으로 읽고, 컬럼·행·셀 필터 적용 후 결과 반환
```

- ③④가 **자격 증명 벤딩**이다. 사용자의 IAM 정책에는 S3 권한이 없어도 된다. S3 권한은 "등록할 때 지정한 역할"이 갖고 있다.
- 테이블 위치가 Lake Formation 에 등록되어 있지 않으면 ③이 없다. 엔진이 사용자 권한으로 S3 를 직접 읽고, 버킷 정책과 IAM 정책이 평가된다.
- 행·셀 필터를 실제로 적용하는 것은 **엔진**이다. 그래서 Lake Formation 과 통합된 엔진을 거쳐야만 필터가 지켜진다.

## 데이터 위치 등록

```bash
# S3 위치를 Lake Formation 에 등록 (Lake Formation 이 맡을 역할 지정)
aws lakeformation register-resource \
  --resource-arn arn:aws:s3:::acme-datalake-clean-prod \
  --role-arn arn:aws:iam::111122223333:role/LakeFormationServiceRole
```

등록 대상은 버킷 또는 버킷 아래 프리픽스다(개별 객체는 안 된다). 등록 역할은 두 종류다.

| 역할 | 특징 | 반드시 사용자 정의 역할을 써야 하는 경우 |
|------|------|------|
| 서비스 연결 역할 | 가장 간단. 필요한 권한이 자동 부여 | - |
| 사용자 정의 역할 | S3 읽기·쓰기 인라인 정책과 `lakeformation.amazonaws.com` 신뢰 관계를 직접 구성 | 다른 계정의 위치 등록, AWS 관리형 키(`aws/s3`)로 암호화된 위치, Amazon EMR 로 접근할 위치 |

- 등록하는 관리자는 그 역할에 대한 `iam:PassRole` 이 있어야 한다.
- 위치가 KMS 키로 암호화되어 있으면 등록 역할이 그 키를 쓸 수 있어야 한다. "권한은 다 줬는데 Access Denied"의 흔한 원인이다.
- 요청자 지불(Requester Pays) 버킷은 등록을 피한다. 등록 역할이 항상 요청자로 취급된다.

## 권한의 종류와 "둘 다 필요하다"의 의미

| 대상 | 주요 권한 |
|------|------|
| 데이터베이스 | `CREATE_TABLE`, `ALTER`, `DROP`, `DESCRIBE` |
| 테이블 | `SELECT`, `INSERT`, `DELETE`, `ALTER`, `DROP`, `DESCRIBE` |
| 데이터 위치 | `DATA_LOCATION_ACCESS` |
| LF-Tag | `DESCRIBE`, `ASSOCIATE` |

- **IAM 은 거친 문, Lake Formation 은 세밀한 문**이다. 사용자는 Athena·Glue API 를 호출할 IAM 권한에 더해 `lakeformation:GetDataAccess` IAM 권한이 있어야 하고(이 권한이 있어야 임시 자격 증명을 요청할 수 있다), 그 위에 Lake Formation 의 `SELECT` 등을 받아야 한다. Athena 는 사용자에게, 다른 엔진은 실행 역할에 이 IAM 권한이 필요하다.
- **데이터 위치 권한**은 읽기 권한이 아니다. "이 S3 위치를 가리키는 테이블·데이터베이스를 만들 수 있는가"를 통제한다. 읽고 쓰는 데는 `SELECT`·`INSERT` 로 충분하다. 임의 위치에 테이블을 만들어 데이터를 빼내는 것을 막는 장치다.
- 한 주체가 여러 경로로 권한을 받으면 **합집합**이 된다. 명명형으로 col1~3, 태그로 col5~6 을 받았다면 다섯 컬럼을 볼 수 있다.
- `WITH GRANT OPTION` 으로 받은 권한은 다른 주체에게 다시 부여할 수 있다. 권한 관리를 도메인 팀에 위임할 때 쓴다.
- 데이터 레이크 관리자는 모든 리소스에 대한 `DESCRIBE`, 모든 위치의 데이터 위치 권한, GRANT/REVOKE 권한을 암묵적으로 갖는다. 테이블을 만든 사람은 그 테이블의 모든 권한을 암묵적으로 갖는다.

## 기본 설정의 함정: IAMAllowedPrincipals

Lake Formation 은 기존 Glue 사용자를 깨뜨리지 않으려고, 기본적으로 모든 데이터베이스·테이블에 `IAMAllowedPrincipals` 라는 가상 그룹의 권한(Super)을 걸어 둔다. 이 그룹은 "IAM 정책으로 카탈로그 리소스에 접근할 수 있는 모든 주체"다.

- 이 권한이 남아 있는 동안에는 **IAM 만으로 접근이 결정된다.** Lake Formation 에서 컬럼을 제한해 GRANT 해도, IAM 으로 접근 가능한 사용자는 전체를 본다.
- 세밀한 권한을 강제하려면 해당 리소스에서 `IAMAllowedPrincipals` 권한을 **회수**하고, 새 데이터베이스·테이블에 이 권한이 자동으로 붙지 않도록 계정 설정을 바꾼다.

> ⚠️ **함정**: "Lake Formation 에서 컬럼 제한을 걸었는데 분석가가 여전히 전체 컬럼을 본다"의 원인은 대개 둘 중 하나다. `IAMAllowedPrincipals` 권한이 남아 있거나, 분석가의 IAM 정책에 S3 직접 권한이 있어 Lake Formation 을 우회하는 경로가 열려 있다. Lake Formation 의 권한 모델은 S3 API 로 직접 읽는 것을 막지 못한다. S3 직접 권한을 걷어 내야 통제가 완성된다.

## 하이브리드 액세스 모드

한 번에 전환하기 어려우면 **하이브리드 액세스 모드**로 위치를 등록한다. 같은 카탈로그 객체에 두 경로를 동시에 열어 둔다.

- **옵트인한 주체**: Lake Formation 권한이 강제된다(IAM 권한도 함께 필요).
- **그 외 주체**: 기존처럼 IAM·S3 정책만으로 접근한다.

"기존 ETL 잡은 건드리지 않고 새 분석가 그룹에만 컬럼 제한을 적용"이 이 모드의 용도다.

## 명명형 리소스 vs LF-Tags

```bash
# 명명형: AnalystRole 에 특정 테이블의 일부 컬럼만 SELECT 허용
aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier=arn:aws:iam::111122223333:role/AnalystRole \
  --permissions "SELECT" \
  --resource '{"TableWithColumns": {"DatabaseName": "sales_db", "Name": "orders",
               "ColumnNames": ["order_id", "region", "amount"]}}'
```

```bash
# LF-Tag 기반: classification=pii 태그가 붙은 모든 테이블을 SecurityRole 에만 허용
aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier=arn:aws:iam::111122223333:role/SecurityRole \
  --permissions "SELECT" \
  --resource '{"LFTagPolicy": {"ResourceType": "TABLE",
               "Expression": [{"TagKey": "classification", "TagValues": ["pii"]}]}}'
```

| 축 | 명명형 리소스 | LF-Tags(LF-TBAC) |
|------|------|------|
| 부여 단위 | 데이터베이스·테이블·컬럼을 이름으로 지정 | 태그 표현식에 맞는 모든 리소스 |
| 필요한 작업 수 | 주체 수 × 리소스 수 | 주체 수 + 리소스 수 |
| 새 테이블이 생기면 | 다시 GRANT | 태그만 붙이면(또는 상속받으면) 자동 적용 |
| 맞는 규모 | 테이블 몇 개, 예외적 권한 | 테이블이 많고 빠르게 느는 환경 |
| 상속 | 없음 | 데이터베이스 → 테이블 → 컬럼으로 상속, 하위에서 재정의 가능 |

- LF-Tag 는 `department=sales` 같은 키-값이고, 키 하나에 값을 여러 개 정의할 수 있다.
- **LF-Tag 는 IAM 태그·AWS 리소스 태그와 다르다.** Lake Formation 안에서만 보이고 서로 호환되지 않는다. "S3 객체 태그로 Lake Formation 권한을 제어"는 오답이다.
- 태그로 권한이 제대로 들어가는 것을 확인했으면, 전에 명명형으로 준 권한은 회수하는 것이 권장된다. 남겨 두면 합집합으로 계속 살아 있다.

## 컬럼·행·셀 수준 보안

세분화 보안은 **데이터 필터**라는 객체로 만든다. 필터는 특정 테이블에 속하고, 컬럼 명세와 행 필터 표현식을 담는다.

| 수준 | 필터 구성 | 예 |
|------|------|------|
| 컬럼 | 포함/제외 컬럼 지정 + 모든 행 | PII 컬럼을 뺀 나머지만 |
| 행 | 모든 컬럼 + 행 필터 표현식 | `region = 'us-east-1'` 인 행만 |
| 셀 | 컬럼 지정 + 행 필터 표현식 | 미국 행에서만 주소 컬럼 노출 |

```bash
# 셀 수준 필터: 미국 동부 행만, customer_name 컬럼은 제외
aws lakeformation create-data-cells-filter --table-data '{
  "TableCatalogId": "111122223333",
  "DatabaseName": "sales_db",
  "TableName": "orders",
  "Name": "us-east-no-name",
  "RowFilter": {"FilterExpression": "region = '\''us-east-1'\''"},
  "ColumnWildcard": {"ExcludedColumnNames": ["customer_name"]}
}'
```

- 행 필터 표현식은 PartiQL 의 WHERE 절 문법을 (일부 제약과 함께) 따른다. 문자열 리터럴은 작은따옴표로 감싼다.
- 필터는 **읽기에만** 적용된다. 필터와 함께 줄 수 있는 권한은 `SELECT` 뿐이다.
- 필터를 만들고 끝이 아니다. `SELECT` 를 부여할 때 리소스로 그 필터(`DataCellsFilter`)를 지정해야 적용된다.
- 한 테이블에 필터를 여러 개 만들어 두고 주체마다 다른 필터로 부여한다. 관리자에게는 필터 없이, 지역 분석가에게는 지역 필터로.
- 단순한 컬럼 제한은 필터 없이도 된다. 명명형 GRANT 에서 포함 컬럼(`ColumnNames`)이나 제외 컬럼(`ColumnWildcard.ExcludedColumnNames`)을 지정하면 된다.

## 블루프린트와 워크플로우

**블루프린트**는 흔한 수집 패턴의 템플릿이고, 실행하면 Glue 크롤러·잡·트리거로 이루어진 **워크플로우**가 생성된다.

| 블루프린트 | 동작 | 고르는 기준 |
|------|------|------|
| Database snapshot | JDBC 원천의 모든 테이블을 통째로 적재·재적재(제외 패턴 지정 가능) | 스키마가 자유롭게 바뀐다(컬럼 이름 변경·삭제), 원천과 완전히 일치해야 한다 |
| Incremental database | 북마크 컬럼 기준으로 새 데이터만 적재. 대상 테이블을 하나씩 지정 | 컬럼이 추가만 된다, 새 행만 들어오고 기존 행은 수정되지 않는다 |
| Log file | CloudTrail, ELB, ALB 로그를 일괄 적재 | AWS 서비스 로그 |

- Incremental database 블루프린트를 처음 실행하면 전체를 적재하고 북마크를 잡는다. 이후 실행부터 증분이다.
- 북마크 방식은 "북마크 컬럼 값이 커진 행"만 본다. **기존 행의 UPDATE·DELETE 는 잡지 못한다.** 변경과 삭제까지 따라가야 하면 DMS 의 CDC 가 맞는 도구다.
- 워크플로우는 Glue 콘솔에서 DAG 로 보이고 노드별 상태를 추적할 수 있다. 워크플로우가 끝나면 실행한 사용자에게 생성된 테이블의 `SELECT` 가 부여된다.

블루프린트는 Glue 워크플로우의 생성기다. 결과물은 일반 Glue 크롤러·잡·트리거이므로 Glue 콘솔에서 그대로 모니터링하고, 비용도 그 크롤러·잡이 돈 만큼 Glue 쪽에서 발생한다. 단, Lake Formation 이 만든 블루프린트와 워크플로우는 사용자가 편집할 수 없다.

## 교차 계정 공유와 데이터 메시

Lake Formation 은 카탈로그 리소스를 다른 계정·조직·OU, 또는 다른 계정의 IAM 주체에게 직접 공유한다. 내부적으로 **AWS RAM** 을 쓴다.

1. 생산자 계정이 외부 계정에 권한을 부여한다(명명형 또는 LF-Tags. 태그 방식이 권장된다).
2. 같은 조직이면 바로 보이고, 조직 밖이면 수신 계정 관리자가 RAM 초대를 수락해야 한다.
3. 수신 계정에서 공유받은 리소스를 가리키는 **리소스 링크**를 만든다. Athena·Redshift Spectrum 은 리소스 링크가 있어야 공유 테이블을 쿼리에 넣을 수 있다.
4. 수신 계정 관리자가 자기 계정의 주체들에게 다시 권한을 부여한다.

- 데이터는 복사되지 않는다. 생산자 계정의 S3 에 그대로 있고 메타데이터와 접근 권한만 공유된다.
- 도메인 계정이 데이터를 소유하고 중앙 거버넌스 계정이 카탈로그와 권한을 관리하는 **데이터 메시** 구성에 쓰인다.
- 교차 계정 접근 기록은 CloudTrail 에 남는다. 감사 요구가 지문에 있으면 CloudTrail 이 답이다.

## 증상 → 원인 → 조치

| 증상 | 원인 | 조치 |
|------|------|------|
| 컬럼 제한을 걸었는데 전체가 보인다 | `IAMAllowedPrincipals` 권한 잔존 | 해당 리소스에서 회수, 기본 설정 변경 |
| Lake Formation 을 우회해 S3 로 읽는다 | 사용자 IAM 에 S3 직접 권한 | S3 직접 권한 제거 |
| `SELECT` 를 줬는데 Access Denied | `lakeformation:GetDataAccess` 없음, 위치 미등록, 등록 역할의 S3·KMS 권한 부족 | IAM 권한 추가, 위치 등록, 역할 정책 보완 |
| 테이블 생성이 실패한다 | 데이터 위치 권한 없음 | `DATA_LOCATION_ACCESS` 부여 |
| 공유받은 테이블이 Athena 에 안 보인다 | RAM 초대 미수락, 리소스 링크 없음 | 초대 수락, 리소스 링크 생성 |
| EMR 에서 등록 위치를 못 읽는다 | 서비스 연결 역할로 등록됨 | 등록 해제 후 사용자 정의 역할로 재등록 |

## 지문 단서 → 정답 판별표

| 지문 단서 | 정답 |
|------|------|
| "S3 직접 권한 없이 테이블을 조회하게" | 위치 등록 + credential vending |
| "테이블이 수천 개, 권한 관리를 확장 가능하게" | LF-Tags(LF-TBAC) |
| "PII 컬럼을 숨긴다" | 컬럼 수준 권한(포함/제외 컬럼) |
| "자기 지역·부서의 행만" | 데이터 필터의 행 필터 |
| "행에 따라 볼 수 있는 컬럼이 다르다" | 셀 수준 보안(컬럼 + 행 필터) |
| "기존 IAM 기반 접근을 유지하면서 일부 사용자만 전환" | 하이브리드 액세스 모드 |
| "다른 계정에 테이블을 복사 없이 공유" | Lake Formation 교차 계정 공유(RAM) + 리소스 링크 |
| "JDBC 원천을 증분으로 적재하는 워크플로우를 자동 생성" | Incremental database 블루프린트 |
| "누가 어떤 데이터에 접근했는지 감사" | CloudTrail |

내일은 S3 의 Parquet 위에 트랜잭션 계층을 올려 행 단위 수정·삭제와 시간 여행을 가능하게 하는 오픈 테이블 포맷을 다룬다.

## 📖 용어

- **데이터 위치 등록** : S3 경로를 Lake Formation 의 관리 대상으로 올리는 것. 이후 그 경로의 데이터 접근을 Lake Formation 이 중개한다.
- **자격 증명 벤딩(credential vending)** : Lake Formation 이 통합 엔진에 임시 자격 증명을 내주어 사용자 대신 S3 를 읽게 하는 방식.
- **명명형 리소스 방식** : 데이터베이스·테이블·컬럼을 이름으로 직접 지정해 권한을 부여하는 방식.
- **LF-Tag / LF-TBAC** : 카탈로그 리소스에 붙이는 Lake Formation 전용 태그와, 그 태그 조건으로 권한을 부여하는 방식.
- **데이터 필터** : 테이블에 정의하는 컬럼 명세 + 행 필터 표현식. 컬럼·행·셀 수준 보안을 구현한다.
- **데이터 위치 권한** : 특정 S3 위치를 가리키는 테이블·데이터베이스를 만들 수 있는 권한.
- **IAMAllowedPrincipals** : IAM 정책으로 접근 가능한 모든 주체를 뜻하는 가상 그룹. 이 권한이 남아 있으면 IAM 만으로 접근이 결정된다.
- **하이브리드 액세스 모드** : 옵트인한 주체에게만 Lake Formation 권한을 강제하고 나머지는 IAM 방식을 유지하는 모드.
- **블루프린트** : 수집 패턴 템플릿. 실행하면 Glue 크롤러·잡·트리거로 된 워크플로우가 만들어진다.
- **리소스 링크** : 다른 계정에서 공유받은 데이터베이스·테이블을 내 카탈로그에서 가리키는 참조 객체.

## 📝 연습 문제

**문제 1.** 분석가가 S3 버킷에 직접 IAM 권한이 없어도 Lake Formation을 통해 등록된 위치의 데이터를 읽을 수 있게 하는 메커니즘은?

A) S3 버킷 정책 와일드카드  
B) 자격 증명 벤딩(credential vending)  
C) STS 페더레이션 토큰 직접 발급  
D) VPC 엔드포인트 정책  

**정답: B**  
해설: 위치를 Lake Formation에 register하면, 지정된 서비스 역할로 Lake Formation이 임시 자격 증명을 벤딩해 사용자를 대신해 S3에 접근합니다. 분석가에게 S3 직접 권한이 없어도 됩니다. 나머지는 권한 일원화 메커니즘과 다릅니다.

---

**문제 2.** 데이터레이크 테이블이 수천 개로 늘었을 때, 리소스에 `classification=pii` 같은 태그를 붙이고 태그 조건으로 권한을 부여해 확장성을 높이는 Lake Formation 방식은?

A) 명명형 리소스 권한  
B) S3 ACL  
C) LF-Tags 기반 TBAC  
D) IAM 인라인 정책  

**정답: C**  
해설: LF-Tags 기반 TBAC는 태그 조건으로 권한을 부여해 리소스가 많아도 정책 폭증 없이 관리됩니다. 명명형은 리소스를 일일이 지정해야 하고, S3 ACL/IAM 인라인 정책은 세분화·확장성 면에서 부적합합니다.

---

**문제 3.** Lake Formation에서 특정 사용자에게 `region = 'us-east-1'` 행만 노출하려면 무엇을 사용하는가?

A) 컬럼 와일드카드  
B) 데이터 필터(행 수준 필터)  
C) 블루프린트  
D) 워크그룹  

**정답: B**  
해설: 행 수준 보안은 데이터 필터(data cells filter)의 RowFilter 표현식으로 구현합니다. 컬럼 와일드카드는 컬럼 선택, 블루프린트는 수집 워크플로우 생성, 워크그룹은 Athena 비용·격리 개념입니다.

---

**문제 4.** RDS 같은 JDBC 소스를 북마크 컬럼 기준으로 증분 적재하는 Glue 워크플로우를 자동 생성하려면 어떤 Lake Formation 블루프린트를 사용하는가?

A) Incremental database 블루프린트  
B) Database snapshot 블루프린트  
C) Log file 블루프린트  
D) Streaming 블루프린트  

**정답: A**  
해설: Incremental database 블루프린트는 북마크 컬럼 기준 증분 적재 워크플로우를 만듭니다. Database snapshot은 전체 스냅샷, Log file은 로그 적재용이며, Streaming은 표준 블루프린트 유형이 아닙니다.

---

**문제 5.** 분석가가 Athena로 Lake Formation 관리 테이블을 쿼리할 때 반드시 필요한 권한 조합은?

A) S3 버킷 정책만  
B) Lake Formation 권한만  
C) KMS 키 정책만  
D) IAM 권한(Athena/Glue API)과 Lake Formation 데이터 권한 모두  

**정답: D**  
해설: Lake Formation 권한과 IAM 권한은 함께 평가됩니다. Athena/Glue API 호출용 IAM 권한과 데이터 접근용 Lake Formation 권한을 모두 가져야 쿼리가 성공합니다. 어느 한쪽만으로는 부족합니다.

---
