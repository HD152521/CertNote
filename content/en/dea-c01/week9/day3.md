# Day 3 - Sensitive Data Protection: Macie and Masking

Data lakes unintentionally mix PII (personally identifiable information) and sensitive data. Today: automatically detect (Macie), reduce exposure (masking/tokenization), and prove compliance.

## 1. Amazon Macie: Automatic PII Detection

Macie uses ML and pattern matching to auto-discover and classify sensitive data on S3.

- **Automated sensitive data discovery**: Continuous bucket sampling exposes risk.
- **Classification jobs**: One-time or periodic precise scan of specific buckets/prefixes.
- **Managed data identifiers**: Credit card numbers, SSN, passport, email, etc. built-in.
- **Custom data identifiers**: Regex + keywords + proximity for org-specific patterns (employee ID).
- **Findings**: Locations/types sent to EventBridge/Security Hub for auto-response.

```json
{
  "customDataIdentifier": {
    "name": "internal-employee-id",
    "regex": "EMP-[0-9]{6}",
    "keywords": ["employee", "사번"],
    "maximumMatchDistance": 50
  }
}
```

> 💡 **Related Theory**: Macie controls cost by sampling/pattern-matching without downloading full objects. Findings show "what and where" but don't mask — downstream pipelines handle masking.

## 2. Masking and Tokenization

Post-detection exposure-reduction techniques.

- **Masking**: Hide or partially expose values (`****-****-****-1234`). Irreversible or display-only.
- **Tokenization**: Swap sensitive values for meaningless tokens, store mapping in secure vault. Reversible via de-tokenization.
- **Hashing/encryption**: Deterministic hashing preserves join keys and anonymizes; encryption recovers via key.

AWS implementations:
- **Redshift Dynamic Data Masking (DDM)**: Attach masking policy to columns, role-based visibility.
- **Glue/Spark UDF**: Hash/substitute during ETL.
- **Lake Formation data filters**: Exclude sensitive columns entirely from GRANT.

```sql
-- Redshift DDM: analysts see last 4 digits only
CREATE MASKING POLICY mask_card
WITH (card_number VARCHAR(20))
USING ('****-****-****-' || RIGHT(card_number, 4));

ATTACH MASKING POLICY mask_card
ON payments(card_number)
TO ROLE analyst_role;
```

## 3. Data Filtering for Exposure Minimization

Lake Formation data filters remove sensitive columns or restrict rows — "don't return unviewable data in the first place."

```text
DataCellsFilter (analyst_view):
  ColumnNames: [order_id, region, amount]    # exclude email, ssn
  RowFilter: "country = 'KR'"
```

Masking "shows hidden values"; data filters "don't return them." Combined: layered defense.

> 💡 **Related Theory**: Tokenization keeps joins/analysis while hiding originals—preferred in PCI-DSS. Irreversible masking suits display-only; tokenization suits workflows needing later recovery.

## 4. Compliance

Sensitive data protection directly ties to regulation.

- **GDPR**: Deletion requests (right to be forgotten) → Iceberg/Hudi row-level DELETE.
- **PCI-DSS**: Card data tokenized/encrypted, access restricted.
- **HIPAA**: Health info (PHI) encrypted, access audited.
- **Data residency**: Enforce specific-region storage via SCP/bucket policy.

AWS tool mapping:
- Detection: **Macie**
- Access control: **Lake Formation**, IAM
- Encryption: **KMS**
- Audit: **CloudTrail**, Security Hub

## 5. Auto-Response Pipeline

Macie findings connect to auto-isolation/alerting:

```text
[Macie Finding] --> [EventBridge rule] --> [Lambda]
   --> Isolate sensitive bucket (restrict policy) / Tag object / SNS alert / Security Hub record
```

Link detection to response for consistent protection without ops burden.

## Exam Points Summary

- Macie: S3 PII auto-detect/classify, managed/custom identifiers, findings to EventBridge/Hub. No direct masking.
- Masking (hide, usually irreversible) vs Tokenization (reversible, vault mapping).
- Redshift DDM: role-based column visibility.
- Lake Formation data filter: exclude sensitive columns/rows entirely.
- Regulation-tool map: GDPR delete (Iceberg DELETE), PCI (tokenization), detect (Macie), audit (CloudTrail).

## 📝 연습 문제

**문제 1.** 수천 개의 S3 버킷 중 어디에 신용카드 번호·주민번호가 저장돼 있는지 모른다. 민감 데이터의 위치와 유형을 자동으로 발견하는 서비스는?

A) AWS Config  
B) AWS Glue DataBrew  
C) Amazon Macie  
D) Amazon Inspector  

**정답: C**  
해설: Macie는 ML과 패턴 매칭으로 S3의 PII·민감 데이터를 자동 탐지·분류하고 위치·유형을 발견으로 보고합니다. Config는 리소스 구성, DataBrew는 데이터 준비, Inspector는 워크로드 취약점 스캔용입니다.

---

**문제 2.** 결제 분석을 위해 카드번호로 거래를 조인해야 하지만 원본 카드번호는 숨겨야 한다. 나중에 권한 있는 시스템이 원본을 복원할 수도 있어야 한다. 가장 적합한 기법은?

A) 비가역 마스킹  
B) 컬럼 삭제  
C) Glacier 보관  
D) 토큰화  

**정답: D**  
해설: 토큰화는 민감 값을 토큰으로 치환하되 매핑을 볼트에 보관해 조인 일관성을 유지하고 필요 시 역토큰화로 원복할 수 있습니다. 비가역 마스킹·컬럼 삭제는 복원이 불가능하고, Glacier는 보호 기법이 아닙니다.

---

**문제 3.** Redshift에서 동일 테이블을 두 역할이 조회하되, 분석가에게는 카드번호 뒤 4자리만, 관리자에게는 전체를 보여주려 한다. 가장 적절한 기능은?

A) S3 버킷 정책  
B) Redshift 동적 데이터 마스킹(DDM)  
C) KMS 키 교체  
D) 파티션 프로젝션  

**정답: B**  
해설: Redshift DDM은 컬럼에 마스킹 정책을 붙이고 역할별로 다른 가시성을 제공해 같은 쿼리라도 역할에 따라 다른 값을 반환합니다. 버킷 정책·키 교체·파티션 프로젝션은 컬럼 단위 동적 마스킹을 제공하지 않습니다.

---

**문제 4.** Macie가 민감 데이터를 탐지한 직후 자동으로 해당 버킷을 격리하고 보안팀에 알리고자 한다. 가장 적절한 아키텍처는?

A) Macie 발견 → EventBridge → Lambda(버킷 정책 제한) + SNS 알림  
B) S3 수명주기 정책으로 객체 삭제  
C) CloudFront 배포 생성  
D) Redshift 스냅샷 생성  

**정답: A**  
해설: Macie 발견을 EventBridge로 받아 Lambda가 버킷 접근을 제한하고 SNS로 알림하면 탐지-대응이 자동 연결됩니다. 수명주기 삭제는 증거 손실 위험, CloudFront·Redshift 스냅샷은 민감 데이터 대응과 무관합니다.

---
