# Day 2 - AWS Lake Formation 중앙 권한 관리

데이터레이크가 커지면 "누가 어떤 테이블·컬럼·행에 접근할 수 있는가"를 IAM 정책만으로 관리하기 어렵습니다. AWS Lake Formation은 데이터레이크 권한을 중앙에서 세밀하게 관리하는 서비스입니다. 오늘은 권한 모델, 데이터 위치 등록, 블루프린트를 다룹니다.

## Lake Formation이 해결하는 문제

S3 + Glue Data Catalog만 쓰면 권한은 IAM 정책과 S3 버킷 정책으로 흩어집니다. 컬럼 단위, 행 단위 제어가 어렵고 감사도 복잡합니다. Lake Formation은 이를 **데이터베이스/테이블/컬럼/행** 수준의 권한으로 추상화하고, 한곳에서 부여(GRANT)·회수(REVOKE)합니다.

> 💡 **관련 이론**: Lake Formation은 Glue Data Catalog를 권한 제어 지점으로 사용합니다. 카탈로그의 데이터베이스·테이블에 대해 RDBMS의 GRANT/REVOKE와 유사한 모델을 제공합니다.

## 데이터 위치 등록 (Data Location Registration)

Lake Formation으로 S3 경로를 관리하려면 먼저 해당 위치를 **등록(register)**해야 합니다. 등록 시 Lake Formation이 사용할 **서비스 역할(IAM role)**을 지정하며, 이후 Lake Formation이 이 역할로 S3에 접근해 사용자를 대신해 데이터를 읽습니다.

```bash
# S3 위치를 Lake Formation에 등록 (Lake Formation이 사용할 역할 지정)
aws lakeformation register-resource \
  --resource-arn arn:aws:s3:::acme-datalake-clean-prod \
  --role-arn arn:aws:iam::111122223333:role/LakeFormationServiceRole
```

등록된 위치에 대해서는 **자격 증명 벤딩(credential vending)**이 일어납니다. 즉, 분석가는 S3에 직접 권한이 없어도 Lake Formation이 임시 자격 증명을 발급해 데이터를 읽게 합니다. 권한 통제를 Lake Formation으로 일원화하는 핵심 메커니즘입니다.

## 권한 모델: LF-Tags vs 명명형 리소스

Lake Formation은 두 가지 방식으로 권한을 부여합니다.

1. **Named Resource(명명형)**: 특정 데이터베이스/테이블/컬럼을 직접 지정해 부여.
2. **LF-Tags(태그 기반, TBAC)**: 리소스에 태그(예: `classification=pii`)를 붙이고, 태그 조건으로 권한을 부여. 리소스가 많을 때 확장성이 뛰어남.

```sql
-- 명명형: analyst에게 특정 테이블의 일부 컬럼만 SELECT 허용
GRANT SELECT (order_id, region, amount)
ON TABLE sales_db.orders
TO 'arn:aws:iam::111122223333:role/AnalystRole';
```

```bash
# LF-Tag 기반: pii=true 태그가 붙은 모든 리소스 접근을 보안팀에만 부여
aws lakeformation grant-permissions \
  --principal DataLakePrincipalIdentifier=arn:aws:iam::111122223333:role/SecurityRole \
  --permissions "SELECT" \
  --lf-tag-policy 'ResourceType=TABLE,Expression=[{TagKey=classification,TagValues=[pii]}]'
```

> 💡 **관련 이론**: TBAC(Tag-Based Access Control)는 리소스 수가 수천 개로 늘어도 태그 한 번 부여로 권한이 자동 적용되어 RBAC의 폭발적 정책 증가 문제를 완화합니다.

## 컬럼·행·셀 수준 보안

Lake Formation은 세분화된 보안을 제공합니다.

- **컬럼 수준**: GRANT에서 허용 컬럼을 명시하거나, 제외 목록 지정.
- **행 수준(Row-level)**: **데이터 필터(data filter)**로 행 필터 표현식(예: `region = 'us-east-1'`)을 정의해 특정 사용자에게 일부 행만 노출.
- **셀 수준**: 컬럼 + 행 필터를 결합.

```bash
# 행 수준 필터 생성: 미국 동부 지역 행만 노출
aws lakeformation create-data-cells-filter --table-data '{
  "TableCatalogId": "111122223333",
  "DatabaseName": "sales_db",
  "TableName": "orders",
  "Name": "us-east-only",
  "RowFilter": {"FilterExpression": "region = '\''us-east-1'\''"},
  "ColumnWildcard": {}
}'
```

## 블루프린트 (Blueprints)와 워크플로우

**블루프린트**는 흔한 수집 패턴을 템플릿화해 Glue 워크플로우(크롤러 + ETL 잡)를 자동 생성합니다.

- **Database snapshot**: JDBC 소스(RDS 등)의 전체 스냅샷을 데이터레이크로 적재.
- **Incremental database**: 북마크 컬럼 기준으로 증분 적재.
- **Log file**: CloudTrail, ELB, ALB 등 로그를 적재.

블루프린트를 실행하면 Glue 크롤러·잡·트리거로 구성된 워크플로우가 만들어져 반복 수집을 자동화합니다.

> 💡 **관련 이론**: 블루프린트는 Glue 워크플로우의 생성기일 뿐입니다. 실행 결과물은 일반 Glue 크롤러/잡/트리거이며, Glue 콘솔에서 그대로 관리·모니터링됩니다.

## IAM과의 관계 및 하이브리드 모드

Lake Formation 권한과 IAM 권한은 함께 평가됩니다. 분석가는 Athena·Glue API 호출을 위한 IAM 권한과, 데이터 접근을 위한 Lake Formation 권한을 모두 가져야 합니다. 기존 IAM 기반 접근을 유지하면서 점진적으로 전환하려면 **하이브리드 액세스 모드**를 사용합니다.

## 교차 계정 공유

Lake Formation은 LF-Tag 또는 명명형 리소스를 다른 AWS 계정·조직과 공유할 수 있습니다(AWS RAM 기반). 중앙 데이터레이크 계정이 데이터 메시(data mesh) 구조에서 도메인 계정에 권한을 위임할 때 사용합니다.

## 핵심 정리

- S3 위치를 register하면 Lake Formation이 credential vending으로 접근을 통제.
- 권한 부여는 명명형 또는 LF-Tags(TBAC) 방식, 대규모에서는 태그 기반이 유리.
- 컬럼·행(데이터 필터)·셀 수준 세분화 보안 제공.
- 블루프린트로 수집 워크플로우(크롤러+잡+트리거) 자동 생성.
- IAM 권한과 Lake Formation 권한이 모두 필요(함께 평가).

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
