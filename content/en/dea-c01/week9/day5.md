# Day 5 - Week 9 Synthesis: Security and Governance Review

This week covered four pillars of data security and governance — access control, encryption, sensitive-data protection, governance. Today we weave them into one end-to-end scenario.

## 1. Access Control (Day 1)

- **IAM**: Broad permissions. Logic: explicit Deny > Allow > implicit deny. Least privilege.
- **Lake Formation**: Catalog-level fine-grained. Data access requires **both IAM + LF perms**.
- **Granularity**: Column GRANT / row data filter / cell (combo).
- **TBAC (LF-Tags)**: Large-scale permissions as tag expressions.
- **Cross-account**: Align trust policy + permission policy + (if encrypted) KMS key policy.

> 💡 **Related Theory**: IAM = "can call API?", Lake Formation = "can see this data?" AND relationship.

## 2. Encryption (Day 2)

- **At rest**: SSE-S3 (no control) / SSE-KMS (policy/audit/bucket key) / SSE-C (customer key) / client-side (AWS sees no plaintext).
- **In transit**: TLS, deny `aws:SecureTransport: false`, Redshift `require_ssl`.
- **Envelope**: KMS key → data key → data.
- **Key policy**: Central to KMS access. Cross-account/service roles allowed here.
- **S3 Bucket Key** cuts KMS call costs.

## 3. Sensitive Data Protection (Day 3)

- **Macie**: S3 PII auto-detect/classify. Findings to EventBridge/Hub. No direct masking.
- **Masking** (hide, irreversible) vs **Tokenization** (reversible, vault mapping).
- **Redshift DDM**: Role-based column visibility.
- **Lake Formation data filter**: Exclude sensitive columns/rows entirely.
- **Regulation mapping**: GDPR delete (Iceberg DELETE), PCI (tokenization), detect (Macie), audit (CloudTrail).

## 4. Data Governance (Day 4)

- **Glue Data Catalog**: Shared engine metadata. Crawlers auto-register.
- **Lineage**: Impact/root-cause analysis, audit. Source→ETL→target→BI.
- **Sharing**: Data Exchange (transfer) vs Clean Rooms (orig-hidden collab). LF cross-account, Redshift datashare.
- **Audit**: CloudTrail management (default) vs data events (S3 objects, optional/billable).

> 💡 **Related Theory**: Governance cycles "find (catalog) → trust (lineage) → collab (sharing) → track (audit)." Single-pillar gaps risk compliance, trust loss.

## Integrated Scenario: Regulated Customer Payment Platform

Requirements: Load payment data to lake, detect/protect PII, give analysts masked data only, partner collab without original exposure, audit all access, support GDPR deletion.

```text
[Payment source] --Glue ETL(KMS encrypt, tokenize)--> s3://lake-clean/payments/ (Iceberg)
   --Macie scan--> [PII found] --EventBridge--> [Lambda: isolate/alert]
   --Lake Formation(data filter, TBAC)--> [Analyst: masked view]
   --Clean Rooms--> [Partner: agreed-aggregate only]
   All activity --> CloudTrail(data events) --> audit
```

Design decisions:
1. **Encryption**: S3 SSE-KMS (customer-managed + Bucket Key), transit TLS forced. Card# **tokenized** in ETL.
2. **Detection**: Macie auto-discovery finds PII, EventBridge→Lambda auto-isolates.
3. **Access**: Lake Formation **TBAC** manages perms, **data filter** excludes PII columns + region rows to analysts.
4. **Sharing**: Partner via **Clean Rooms**, orig-hidden collab.
5. **Audit/compliance**: CloudTrail **data events** track object access, GDPR delete via **Iceberg DELETE**.

```sql
-- GDPR deletion (Iceberg on Athena)
DELETE FROM lake_clean.payments WHERE customer_id = 'GDPR-REQ-2026-042';
```

```json
// Analyst data filter: exclude PII + region limit
{
  "Name": "analyst_payments_filter",
  "ColumnNames": ["txn_id", "region", "amount_token", "dt"],
  "RowFilter": { "FilterExpression": "region = 'ap-northeast-2'" }
}
```

> 💡 **Related Theory**: Security/governance = layered defense. Encryption (confidentiality) + access control (authorization) + detection (visibility) + audit (accountability) together meet regulation and trust.

## Exam Points Summary

- IAM and Lake Formation = AND (both pass = access).
- SSE types, envelope, key policy, in-transit TLS enforcement.
- Macie detects, masking/tokenization/data filter minimize exposure.
- Data Exchange (transfer) vs Clean Rooms (no-exposure collab).
- Audit via CloudTrail, object-level needs data-events (billable) enable.

## 📝 연습 문제

**문제 1.** 결제 데이터 플랫폼에서 분석가에게 카드번호는 토큰으로, 자기 지역 행만 노출하고, 새 테이블이 추가돼도 권한이 자동 적용되게 하려 한다. 가장 적절한 조합은?

A) IAM 와일드카드 정책 + SSE-S3  
B) S3 버킷 정책 + 클라이언트 측 암호화  
C) Lake Formation TBAC + 데이터 필터 + ETL 토큰화  
D) Redshift 스냅샷 공유 + 파티션 프로젝션  

**정답: C**  
해설: TBAC는 새 테이블에 태그만 맞으면 권한이 자동 적용되고, 데이터 필터가 컬럼·행을 제한하며, ETL 토큰화가 카드번호 원본을 숨깁니다. 와일드카드는 최소 권한 위반, 버킷 정책은 세분화가 약하고, 스냅샷 공유는 요건과 무관합니다.

---

**문제 2.** 보안팀이 "어떤 IAM 역할이 지난달 결제 버킷의 특정 객체를 읽었는지"를 입증해야 한다. 필요한 설정은?

A) CloudTrail 데이터 이벤트(S3 객체 수준) 활성화  
B) Macie 맞춤 식별자 추가  
C) KMS 키 자동 교체  
D) Lake Formation TBAC 적용  

**정답: A**  
해설: S3 객체 읽기 추적은 CloudTrail 데이터 이벤트로 기록되며 기본 비활성이라 명시적으로 켜야 합니다. Macie는 탐지, 키 교체는 암호화 위생, TBAC는 접근 제어로 객체 접근 감사 로그를 생성하지 않습니다.

---

**문제 3.** 외부 파트너와 캠페인 효과를 공동 분석하되 양사 고객 원본은 노출하지 않아야 한다. 동시에 사내 분석가에게는 PII를 제외한 데이터를 제공한다. 올바른 서비스 조합은?

A) 파트너는 Data Exchange, 분석가는 IAM 와일드카드  
B) 둘 다 S3 교차 계정 버킷 공유  
C) 둘 다 Redshift datashare  
D) 파트너는 Clean Rooms, 분석가는 Lake Formation 데이터 필터  

**정답: D**  
해설: 원본 비노출 공동 분석은 Clean Rooms, PII 제외 사내 제공은 Lake Formation 데이터 필터가 각각 정답입니다. Data Exchange·버킷 공유·datashare는 원본을 상대에게 전달하므로 파트너 요건을 위반합니다.

---

**문제 4.** SSE-KMS로 암호화된 결제 버킷에서 대량 객체를 읽는 ETL이 KMS 스로틀링과 비용 급증을 겪는다. 동시에 평문 HTTP 접근도 막아야 한다. 가장 적절한 조치 조합은?

A) SSE-S3로 전환 + 버전 관리  
B) S3 Bucket Key 활성화 + `aws:SecureTransport: false` 거부  
C) 클라이언트 측 암호화 + Glacier 전환  
D) KMS 키 매일 교체 + Object Lock  

**정답: B**  
해설: Bucket Key는 객체별 KMS 호출을 줄여 비용·스로틀링을 완화하고, SecureTransport 거부는 평문 HTTP를 차단합니다. SSE-S3 전환은 키 제어 상실, 클라이언트 측·Glacier는 ETL 부담, 매일 교체·Object Lock은 문제와 무관합니다.

---

**문제 5.** 데이터 보안·거버넌스의 "다층 방어"를 가장 정확히 설명한 것은?

A) 암호화 하나만 충분히 강하면 다른 통제는 불필요하다  
B) 접근 제어만 있으면 감사는 필요 없다  
C) 암호화·접근 제어·탐지·감사가 함께 작동해야 규제·신뢰 요건을 충족한다  
D) 모든 통제를 IAM 하나로 대체할 수 있다  

**정답: C**  
해설: 보안·거버넌스는 기밀성(암호화)·권한(접근 제어)·가시성(탐지)·책임 추적(감사)이 결합된 다층 방어이며, 어느 하나로 나머지를 대체할 수 없습니다. A·B·D는 단일 통제로 충분하다는 잘못된 전제를 담고 있습니다.

---
