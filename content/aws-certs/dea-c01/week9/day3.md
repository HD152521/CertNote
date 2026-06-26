# Day 3 - 민감 데이터 보호: Macie와 마스킹

데이터레이크에는 의도치 않게 PII(개인식별정보)나 민감 정보가 섞여 들어옵니다. 이를 자동으로 탐지하고(Macie), 노출을 줄이며(마스킹/토큰화), 규정 준수를 입증하는 것이 오늘의 주제입니다.

## 1. Amazon Macie: PII 자동 탐지

Macie는 머신러닝과 패턴 매칭으로 S3의 민감 데이터를 자동 발견·분류하는 서비스입니다.

- **자동 민감 데이터 탐색(Automated sensitive data discovery)**: 버킷을 지속 샘플링해 위험을 가시화.
- **분류 작업(Classification jobs)**: 특정 버킷·접두사를 일회성/주기적으로 정밀 스캔.
- **관리형 데이터 식별자**: 신용카드 번호, 주민/사회보장번호, 여권번호, 이메일 등 다수 내장.
- **맞춤 데이터 식별자**: 정규식 + 키워드 + 근접성으로 조직 고유 패턴(사번 등) 정의.
- **발견(Findings)**: 민감 데이터 위치·유형을 EventBridge/Security Hub로 전달해 자동 대응.

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

> 💡 **관련 이론**: Macie는 객체 전체를 다운로드하지 않고 샘플링·패턴 매칭으로 비용을 통제합니다. 탐지 결과는 "어디에 무엇이 있는지"를 알려줄 뿐, 직접 마스킹하지는 않으므로 후속 조치(필터·삭제)는 별도 파이프라인이 담당합니다.

## 2. 마스킹과 토큰화

민감 데이터를 탐지한 뒤 노출을 줄이는 기법입니다.

- **마스킹(Masking)**: 값을 가리거나 일부만 노출(`****-****-****-1234`). 원본 복구 불가(비가역) 또는 표시 전용.
- **토큰화(Tokenization)**: 민감 값을 무의미한 토큰으로 치환하고, 매핑을 안전한 볼트(vault)에 보관. 필요 시 역토큰화로 원복 가능(가역).
- **해싱/암호화**: 결정적 해싱은 조인 키를 보존하며 익명화, 암호화는 키로 복원 가능.

AWS 구현 예:
- **Redshift 동적 데이터 마스킹(DDM)**: 컬럼에 마스킹 정책을 붙여 역할별로 다른 가시성 제공.
- **Glue/Spark UDF**: ETL 단계에서 해싱·치환.
- **Lake Formation 데이터 필터**: 민감 컬럼을 아예 제외 GRANT.

```sql
-- Redshift 동적 데이터 마스킹: 분석가에게 카드번호 뒤 4자리만 노출
CREATE MASKING POLICY mask_card
WITH (card_number VARCHAR(20))
USING ('****-****-****-' || RIGHT(card_number, 4));

ATTACH MASKING POLICY mask_card
ON payments(card_number)
TO ROLE analyst_role;
```

## 3. 데이터 필터로 노출 최소화

Lake Formation 데이터 필터는 민감 컬럼을 제거하거나 행을 제한해 "보면 안 되는 데이터를 애초에 반환하지 않는" 방식입니다.

```text
DataCellsFilter (analyst_view):
  ColumnNames: [order_id, region, amount]    # email, ssn 제외
  RowFilter: "country = 'KR'"
```

마스킹이 "가린 값을 보여준다"면, 데이터 필터는 "값 자체를 반환하지 않는다"는 점에서 더 강한 격리입니다. 둘을 조합하면 다층 방어가 됩니다.

> 💡 **관련 이론**: 토큰화는 조인·분석을 유지하면서 원본을 숨길 수 있어 PCI-DSS 같은 결제 규정에서 선호됩니다. 비가역 마스킹은 복원이 불필요한 표시용에, 토큰화는 나중에 원본이 필요한 워크플로우에 적합합니다.

## 4. 규정 준수 (Compliance)

민감 데이터 보호는 규제 준수와 직결됩니다.

- **GDPR**: 삭제 요청(잊힐 권리) → Iceberg/Hudi 행 수준 DELETE로 대응.
- **PCI-DSS**: 카드 데이터 토큰화·암호화·접근 제한.
- **HIPAA**: 보건 정보(PHI) 암호화·접근 감사.
- **데이터 거주(residency)**: 특정 리전에만 저장하도록 SCP/버킷 정책으로 강제.

AWS 도구 매핑:
- 탐지: **Macie**
- 접근 제어: **Lake Formation**, IAM
- 암호화: **KMS**
- 감사: **CloudTrail**, Security Hub

## 5. 자동 대응 파이프라인

Macie 발견을 받아 자동으로 격리·알림하는 흐름:

```text
[Macie Finding] --> [EventBridge 규칙] --> [Lambda]
   --> 민감 버킷 격리(버킷 정책 제한) / 객체 태깅 / SNS 알림 / Security Hub 기록
```

탐지에서 끝내지 않고 자동 대응까지 연결해야 운영 부담 없이 일관된 보호가 유지됩니다.

## 시험 포인트 요약

- Macie: S3 PII 자동 탐지·분류, 관리형/맞춤 식별자, 발견을 EventBridge/Security Hub로 연계. 직접 마스킹은 안 함.
- 마스킹(가림, 보통 비가역) vs 토큰화(가역, 볼트 매핑) 구분.
- Redshift 동적 데이터 마스킹(DDM)은 역할별 컬럼 가시성 제어.
- Lake Formation 데이터 필터는 민감 컬럼/행을 아예 반환하지 않음.
- 규정-도구 매핑: GDPR 삭제(Iceberg DELETE), PCI(토큰화), 탐지(Macie), 감사(CloudTrail).

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

**문제 5.** GDPR "잊힐 권리"에 따라 특정 고객의 데이터를 데이터레이크에서 행 단위로 영구 삭제해야 한다. 가장 적절한 방법은?

A) 전체 테이블을 다시 적재  
B) S3 버킷 버전 관리만 활성화  
C) Macie 분류 작업 재실행  
D) Iceberg/Hudi 테이블에서 행 수준 DELETE 실행  

**정답: D**  
해설: Iceberg/Hudi 같은 오픈 테이블 포맷은 행 수준 DELETE를 지원해 특정 고객 레코드만 효율적으로 제거할 수 있습니다. 전체 재적재는 비효율적, 버전 관리는 오히려 사본을 남기며, Macie는 탐지 도구일 뿐 삭제하지 않습니다.

---
