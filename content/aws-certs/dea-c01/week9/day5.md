# Day 5 - Week 9 종합: 보안·거버넌스 복습

이번 주는 데이터 보안과 거버넌스의 네 축 — 접근 제어, 암호화, 민감 데이터 보호, 거버넌스 — 를 다뤘습니다. 오늘은 이를 하나의 종단 시나리오로 엮어 복습합니다.

## 1. 접근 제어 (Day 1)

- **IAM**: 광역 권한. 평가 로직은 명시적 Deny > Allow > 묵시적 거부. 최소 권한 원칙.
- **Lake Formation**: 카탈로그 수준 세분화 권한. 데이터 접근에는 **IAM + LF 권한 모두** 필요.
- **세분화**: 컬럼 GRANT / 행 데이터 필터 / 셀(조합).
- **TBAC(LF-Tags)**: 대규모 권한을 태그 표현식으로 확장적으로 관리.
- **교차 계정**: trust policy + permission policy + (암호화 시) KMS 키 정책 정렬.

> 💡 **관련 이론**: IAM은 "API를 호출할 수 있는가", Lake Formation은 "이 데이터를 볼 수 있는가"를 결정합니다. 둘은 AND 관계입니다.

## 2. 암호화 (Day 2)

- **저장 중**: SSE-S3(키 제어 없음) / SSE-KMS(정책·감사·버킷 키) / SSE-C(고객 키) / 클라이언트 측(AWS가 평문 못 봄).
- **전송 중**: TLS, `aws:SecureTransport: false` 거부, Redshift `require_ssl`.
- **봉투 암호화**: KMS 키 → 데이터 키 → 데이터.
- **키 정책**: KMS 접근의 핵심. 교차 계정·서비스 역할은 여기에 허용.
- **S3 Bucket Key**로 KMS 호출 비용 절감.

## 3. 민감 데이터 보호 (Day 3)

- **Macie**: S3 PII 자동 탐지·분류. 발견을 EventBridge/Security Hub로 연계. 직접 마스킹은 안 함.
- **마스킹**(가림, 보통 비가역) vs **토큰화**(가역, 볼트 매핑).
- **Redshift DDM**: 역할별 컬럼 가시성.
- **Lake Formation 데이터 필터**: 민감 컬럼/행을 아예 반환하지 않음.
- **규정 매핑**: GDPR 삭제(Iceberg DELETE), PCI(토큰화), 탐지(Macie), 감사(CloudTrail).

## 4. 데이터 거버넌스 (Day 4)

- **Glue Data Catalog**: 엔진 공유 메타데이터. 크롤러로 스키마 등록.
- **계보(Lineage)**: 영향/근본 원인 분석·감사. 소스→ETL→타깃→BI.
- **공유**: Data Exchange(데이터 전달) vs Clean Rooms(원본 비노출 공동 분석). LF 교차 계정 공유, Redshift datashare.
- **감사**: CloudTrail 관리 이벤트(기본) vs 데이터 이벤트(S3 객체, 옵션·과금).

> 💡 **관련 이론**: 거버넌스는 "찾기(카탈로그) → 신뢰(계보) → 협업(공유) → 추적(감사)"의 사이클입니다. 한 축만 갖추면 규정 위반·신뢰 상실 위험이 생깁니다.

## 통합 시나리오: 규제 대상 고객 데이터 플랫폼

요구사항: 결제 데이터를 데이터레이크에 적재하되, PII는 탐지·보호하고, 분석가에겐 마스킹된 데이터만, 파트너와는 원본 노출 없이 협업하고, 모든 접근을 감사하며, GDPR 삭제에 대응한다.

```text
[결제 소스] --Glue ETL(KMS 암호화, 토큰화)--> s3://lake-clean/payments/ (Iceberg)
   --Macie 스캔--> [PII 발견] --EventBridge--> [Lambda: 격리/알림]
   --Lake Formation(데이터 필터, TBAC)--> [분석가: 마스킹 뷰]
   --Clean Rooms--> [파트너: 합의 집계만]
   모든 활동 --> CloudTrail(데이터 이벤트) --> 감사
```

설계 결정:
1. **암호화**: S3는 SSE-KMS(고객 관리형 키 + Bucket Key), 전송은 TLS 강제. 카드번호는 ETL에서 **토큰화**.
2. **탐지**: Macie 자동 탐색으로 PII 위치 파악, 발견을 EventBridge→Lambda로 자동 격리.
3. **접근 제어**: Lake Formation **TBAC**로 권한 관리, **데이터 필터**로 분석가에게 PII 컬럼 제외 + 지역 행만 노출.
4. **공유**: 파트너와는 **Clean Rooms**로 원본 비노출 공동 분석.
5. **감사·규정**: CloudTrail **데이터 이벤트**로 객체 접근 추적, GDPR 삭제는 **Iceberg DELETE**.

```sql
-- GDPR 삭제 (Iceberg on Athena)
DELETE FROM lake_clean.payments WHERE customer_id = 'GDPR-REQ-2026-042';
```

```json
// 분석가용 데이터 필터: PII 제외 + 지역 행 제한
{
  "Name": "analyst_payments_filter",
  "ColumnNames": ["txn_id", "region", "amount_token", "dt"],
  "RowFilter": { "FilterExpression": "region = 'ap-northeast-2'" }
}
```

> 💡 **관련 이론**: 보안·거버넌스는 단일 통제가 아니라 다층 방어입니다. 암호화(기밀성) + 접근 제어(권한) + 탐지(가시성) + 감사(책임 추적)가 함께 작동해야 규제와 신뢰 요건을 충족합니다.

## 시험 포인트 요약

- IAM과 Lake Formation은 AND 관계(둘 다 통과해야 데이터 접근).
- SSE 유형·봉투 암호화·키 정책·전송 중 암호화 강제를 구분.
- Macie는 탐지, 마스킹/토큰화/데이터 필터는 노출 최소화.
- Data Exchange(전달) vs Clean Rooms(비노출 협업)를 시나리오로 구분.
- 감사는 CloudTrail, 객체 수준은 데이터 이벤트(과금·옵션) 활성 필요.

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
