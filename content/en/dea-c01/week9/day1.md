# Day 1 - Access Control: IAM and Lake Formation Permissions

Data security starts with access control: "Who can access what?" AWS data environments rely on IAM for broad permissions and Lake Formation for data-catalog-level granular control. Today we explore how both layers work together.

## 1. IAM Basics and Least Privilege Principle

IAM (Identity and Access Management) controls AWS resource access.

- **Identity-based policy**: Granted to users/groups/roles, defining what they can do.
- **Resource-based policy**: Attached to resources (e.g., S3 bucket policy), defining who can access.
- **Role**: Temporary credentials, used by services (Glue, EMR) or cross-account access.

**Least Privilege** principle grants only necessary permissions. Avoid wildcard (`*`), use `Condition` to narrow scope.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowReadSpecificPrefix",
    "Effect": "Allow",
    "Action": ["s3:GetObject"],
    "Resource": "arn:aws:s3:::lake-curated/sales/*",
    "Condition": {"StringEquals": {"aws:RequestedRegion": "ap-northeast-2"}}
  }]
}
```

> 💡 **Related Theory**: IAM evaluation logic: explicit Deny > explicit Allow > implicit deny. Any Deny blocks immediately.

## 2. Lake Formation Permission Model

Lake Formation centrally manages database/table/column permissions via Glue Data Catalog. **Register** S3 locations; Lake Formation issues temporary credentials via credential vending.

**Core**: Both IAM and Lake Formation permissions required for data access. IAM controls service API calls; Lake Formation controls data visibility.

```text
User request → [IAM policy pass?] → [Lake Formation permission pass?] → Data access
              Either denial blocks
```

## 3. Fine-Grained Permissions: Column/Row/Tag (TBAC)

Lake Formation provides three control levels:

- **Column-level**: Specify columns to expose/exclude (hide PII).
- **Row-level (data filters)**: `RowFilter` expressions show only specific rows (regional analysts).
- **Cell-level**: Column + row combined.

At scale, **LF-Tags (TBAC)** beats named resources. Tag resources and grant permissions by tag values; new tables automatically get permissions.

```json
{
  "TagPolicy": {
    "Expression": [
      {"TagKey": "sensitivity", "TagValues": ["public", "internal"]},
      {"TagKey": "domain", "TagValues": ["sales"]}
    ],
    "Permissions": ["SELECT", "DESCRIBE"]
  }
}
```

> 💡 **Related Theory**: Named grants explode as resources grow (O(users×tables)); TBAC covers many resources with one expression, dramatically lowering management complexity.

## 4. Data Filters for Row/Column Control

Data Cells Filters combine column selection and row filters:

```text
DataCellsFilter:
  TableName: orders
  ColumnNames: [order_id, region, amount, dt]   # PII excluded
  RowFilter: "region = 'ap-northeast-2'"
```

Applied to a role, it hides PII, restricts to that region. Athena/Redshift Spectrum/EMR all respect this filter.

## 5. Cross-Account Access

Sharing data between AWS accounts:

- **Lake Formation cross-account share**: GRANT catalog resources directly (via RAM).
- **S3 bucket policy + KMS key policy**: Grant cross-account principals to encrypt/decrypt.
- **Role assumption**: Trust policy allows external account to assume role.

```json
{
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::444455556666:root"},
  "Action": "sts:AssumeRole"
}
```

> 💡 **Related Theory**: Cross-account access requires trust policy (source) + permission policy (target) + (if encrypted) KMS key policy — three layers aligned.

## 📝 연습 문제

**문제 1.** 한 분석가가 Athena로 Glue 카탈로그 테이블을 조회하려는데 "Insufficient permissions" 오류가 발생한다. IAM 정책에는 `athena:*`, `glue:GetTable`, `s3:GetObject`가 모두 허용돼 있다. 가장 가능성 높은 원인은?

A) S3 버킷이 버전 관리되지 않음  
B) Athena 워크그룹이 비활성화됨  
C) 테이블이 CSV 포맷임  
D) Lake Formation에서 해당 테이블에 SELECT 권한이 부여되지 않음  

**정답: D**  
해설: Lake Formation으로 관리되는 데이터는 IAM 권한이 충분해도 LF에서 SELECT/DESCRIBE 권한이 별도로 부여돼야 접근됩니다. 버전 관리·워그룹·포맷은 권한 거부의 직접 원인이 아닙니다.

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
