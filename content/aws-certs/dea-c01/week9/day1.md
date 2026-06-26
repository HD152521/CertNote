# Day 1 - 접근 제어: IAM과 Lake Formation 권한

데이터 보안의 출발점은 "누가 무엇에 접근할 수 있는가"를 정의하는 접근 제어입니다. AWS 데이터 분석 환경에서는 IAM이 광역 권한을, Lake Formation이 데이터 카탈로그 수준의 세분화된 권한을 담당합니다. 오늘은 두 계층이 어떻게 결합되어 동작하는지 살펴봅니다.

## 1. IAM 기초와 최소 권한 원칙

IAM(Identity and Access Management)은 AWS 리소스 접근을 제어하는 기본 메커니즘입니다.

- **자격 증명 기반 정책(Identity-based policy)**: 사용자/그룹/역할에 부여, 무엇을 할 수 있는지 정의.
- **리소스 기반 정책(Resource-based policy)**: S3 버킷 정책처럼 리소스에 직접 부여, 누가 접근 가능한지 정의.
- **역할(Role)**: 임시 자격 증명. 서비스(Glue, EMR 등)나 교차 계정 접근에 사용.

**최소 권한(Least Privilege)** 원칙은 작업에 꼭 필요한 권한만 부여하는 것입니다. 와일드카드(`*`)를 남발하지 말고, 조건(`Condition`)으로 범위를 좁힙니다.

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

> 💡 **관련 이론**: IAM 평가 로직은 "명시적 거부(Deny) > 명시적 허용(Allow) > 묵시적 거부"입니다. 어떤 정책이든 Deny가 하나라도 있으면 즉시 차단됩니다.

## 2. Lake Formation 권한 모델

Lake Formation은 Glue Data Catalog의 데이터베이스/테이블/컬럼에 대한 권한을 중앙에서 관리합니다. S3 위치를 **등록(register)**하면 Lake Formation이 credential vending(임시 자격 증명 발급)을 통해 접근을 일원화합니다.

핵심: **IAM 권한과 Lake Formation 권한이 모두 충족되어야** 데이터에 접근할 수 있습니다. IAM은 "서비스 API를 호출할 수 있는가", Lake Formation은 "이 테이블/컬럼의 데이터를 볼 수 있는가"를 결정합니다.

```text
사용자 요청 → [IAM 정책 통과?] → [Lake Formation 권한 통과?] → 데이터 접근
              둘 중 하나라도 거부되면 차단
```

## 3. 세분화 권한: 컬럼/행/태그(TBAC)

Lake Formation은 세 가지 수준의 세분화 접근 제어를 제공합니다.

- **컬럼 수준**: GRANT 시 노출/제외할 컬럼을 지정 (PII 컬럼 숨기기).
- **행 수준(데이터 필터)**: `RowFilter` 표현식으로 특정 행만 노출 (지역별 분석가).
- **셀 수준**: 컬럼 + 행 필터 조합.

대규모 환경에서는 명명형(named-resource) 권한 대신 **LF-Tags(TBAC, Tag-Based Access Control)**가 확장적입니다. 리소스에 태그를 붙이고, 태그 값에 권한을 부여하면 새 테이블이 추가돼도 태그만 맞으면 자동으로 권한이 적용됩니다.

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

위 예시는 `sensitivity` 태그가 public/internal이고 `domain`이 sales인 모든 리소스에 SELECT를 부여합니다. `sensitivity=confidential` 리소스는 자동 제외됩니다.

> 💡 **관련 이론**: 명명형 권한은 리소스가 늘어날수록 GRANT 문이 폭증(O(사용자×테이블))하지만, TBAC는 태그 표현식 하나로 다수 리소스를 커버해 권한 관리 복잡도를 크게 낮춥니다.

## 4. 데이터 필터로 행/컬럼 동시 제어

데이터 필터(Data Cells Filter)는 컬럼 선택과 행 필터를 하나의 객체로 묶습니다.

```text
DataCellsFilter:
  TableName: orders
  ColumnNames: [order_id, region, amount, dt]   # PII(email, ssn) 제외
  RowFilter:
    FilterExpression: "region = 'ap-northeast-2'"
```

이 필터를 특정 역할에 GRANT하면, 해당 역할은 PII 컬럼 없이 자기 지역 행만 조회합니다. Athena/Redshift Spectrum/EMR이 모두 이 필터를 존중합니다.

## 5. 교차 계정 접근

여러 AWS 계정 간 데이터를 공유할 때:

- **Lake Formation 교차 계정 공유**: 카탈로그 리소스를 다른 계정(또는 AWS Organizations 단위)에 직접 GRANT. RAM(Resource Access Manager)으로 공유 수락.
- **S3 버킷 정책 + KMS 키 정책**: 데이터가 암호화돼 있으면 KMS 키 정책에도 교차 계정 주체를 허용해야 함.
- **역할 위임(AssumeRole)**: 신뢰 정책(trust policy)으로 외부 계정이 역할을 맡도록 허용.

```json
{
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::444455556666:root" },
  "Action": "sts:AssumeRole"
}
```

> 💡 **관련 이론**: 교차 계정 접근은 "신뢰하는 쪽(trust policy)"과 "권한을 주는 쪽(permission policy)" 양쪽이 모두 설정돼야 합니다. 암호화된 데이터라면 KMS 키 정책까지 3중으로 정렬되어야 접근이 성공합니다.

## 시험 포인트 요약

- IAM 평가: 명시적 Deny가 항상 최우선. Allow가 없으면 묵시적 거부.
- Lake Formation 데이터 접근에는 IAM 권한 + LF 권한이 **모두** 필요.
- 세분화: 컬럼 GRANT, 행 데이터 필터, 셀(둘 조합).
- 대규모 권한 관리는 LF-Tags(TBAC)가 명명형보다 확장적.
- 교차 계정: trust policy + permission policy + (암호화 시) KMS 키 정책.

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
