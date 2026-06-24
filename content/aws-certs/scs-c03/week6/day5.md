# Day 5 - Week 6 종합: 시크릿·스토리지·민감데이터 시나리오 통합 복습

이번 주는 데이터 보호의 두 번째 축 — 시크릿(Secrets Manager), 스토리지 보안(S3 암호화·접근통제·노출방지), 인증서(ACM), 민감정보 분류(Macie) — 를 다뤘다. 오늘은 개별 서비스를 *시나리오*로 엮어, 시험이 실제로 묻는 방식(여러 통제를 조합해 하나의 요구를 충족시키기)으로 복습한다. 핵심은 "각 서비스가 무엇을 하느냐"가 아니라 "어떤 요구에 어떤 조합이 정답이냐"다.

## 통합 멘탈 모델: 데이터 보호의 4층

```
[1. 발견·분류]  Macie → "어디에 무엇이 있는가" (민감도 라벨링)
       ↓
[2. 저장 암호화] SSE-KMS / DSSE-KMS / Object Lock → "정지 상태 보호 + 불변성"
       ↓
[3. 접근 통제]  버킷 정책 / Access Point / BPA / VPC 엔드포인트 → "누가·어디서 접근"
       ↓
[4. 채널·시크릿] ACM(TLS) + Secrets Manager(자격증명 회전) → "전송 보호 + 자격증명 수명주기"
```

> 💡 **관련 이론**: 이 4층은 *심층 방어(defense in depth)*의 데이터 평면 구현이다. 어느 한 층이 뚫려도(예: 자격증명 탈취) 다음 층이 막는다 — 탈취된 키로 S3에 접근해도 KMS 키 정책이 복호화를 거부하고(2층), VPC 엔드포인트 조건이 외부 경로를 차단하며(3층), Object Lock Compliance가 데이터 삭제를 물리적으로 막는다(2층). 단일 통제에 의존하지 않고 *독립적으로 실패하는 여러 통제*를 겹치는 것이 핵심이다.

## 시나리오 1: 회전되는 DB 자격증명 + 무중단

**요구**: RDS 마스터 비밀번호를 30일마다 자동 회전하되 인증 실패 0건. 회전 Lambda는 프라이빗 서브넷 DB에 접근.

**조합**:
- Secrets Manager + alternating-users 회전 전략 → 무중단
- 회전 Lambda를 DB와 같은 VPC에 배치 + Secrets Manager용 VPC 엔드포인트(또는 NAT) → API 호출 경로 확보
- CMK로 시크릿 암호화 → 키 정책으로 회전 Lambda 역할만 Decrypt 허용
- 애플리케이션은 캐싱 클라이언트로 GetSecretValue 호출 최소화

> ⚠️ **함정 정리**: single-user는 순간 인증 실패 가능 → alternating-users + 마스터 시크릿 참조. 회전 Lambda가 VPC 안에서 Secrets Manager에 닿지 못하면 회전이 타임아웃. ARN 정책은 `-*` 접미사 와일드카드 필요.

## 시나리오 2: 규제 데이터의 불변 보관

**요구**: 감사 로그를 7년간 보관하되 루트 계정조차 삭제 불가. 이중 암호화 규제 적용.

**조합**:
- 버전 관리 + Object Lock **Compliance 모드**(7년) → 루트도 삭제 불가
- **DSSE-KMS** → 이중 암호화 규제 충족
- 버킷 정책에 `aws:SecureTransport:false` Deny → 전송 보호
- MFA Delete는 Compliance 모드와 중복(Compliance가 이미 절대 불변)

> 🎯 핵심 구분: "권한자도 우회 가능해야 함(운영 유연성)" → Governance. "누구도 절대 불가" → Compliance. "이중 암호화 규제" → DSSE-KMS(아니면 SSE-KMS).

## 시나리오 3: 데이터 유출 방지(exfiltration)

**요구**: 회사 기밀 버킷의 데이터가 회사 VPC 밖으로 절대 나가지 못하게 한다.

**조합**:
- S3 게이트웨이 VPC 엔드포인트 생성
- 버킷 정책: `aws:SourceVpce` StringNotEquals Deny → 지정 엔드포인트 외 모든 경로 차단
- VPC 엔드포인트 정책: `aws:ResourceOrgID` 조건 → 이 엔드포인트는 우리 조직 버킷으로만
- 양방향 봉쇄로 *데이터 경계(data perimeter)* 구축

> 💡 데이터 경계는 신뢰 신원(PrincipalOrgID) + 신뢰 자원(ResourceOrgID) + 신뢰 네트워크(SourceVpce)의 조합이다. 하나만으로는 불완전하다.

## 시나리오 4: 고트래픽 + KMS 비용·스로틀

**요구**: SSE-KMS 버킷에서 KMS ThrottlingException, 비용 급증.

**조합**: **S3 Bucket Key 활성화** — 객체별 KMS 호출을 버킷 수준 키 파생으로 대체해 호출 99% 감소. (DSSE-KMS는 Bucket Key 비호환이므로 이 경우 부적합.)

## 시나리오 5: 민감 데이터 발견 → 자동 대응

**요구**: 공개 버킷에 PII가 업로드되면 즉시 탐지·비공개화.

**조합**:
- Macie 민감 데이터 탐지 + 버킷 보안 자세 평가 → finding 생성
- EventBridge 규칙이 finding 캐치 → Lambda가 BPA 적용·정책 교정
- Security Hub로 멀티계정 집계
- (Macie는 S3 전용 — DB PII는 대상 아님)

## 시나리오 6: 교차계정 시크릿 + 인증서

**요구**: 계정 B 앱이 계정 A 시크릿을 읽고, 앱은 ACM 인증서로 HTTPS 서빙.

**조합**:
- 시크릿: CMK 암호화 + 리소스 정책(계정 B 허용) + KMS 키 정책(계정 B Decrypt) + 계정 B IAM 정책 → 세 정책 교집합
- TLS: ALB + ACM 퍼블릭 인증서(DNS 검증, 자동 갱신). CloudFront면 us-east-1 발급.

## 빠른 결정 표

| 요구 키워드 | 정답 |
|------------|------|
| DB 비밀번호 자동 회전 | Secrets Manager + Lambda 회전 |
| 무중단 회전 | alternating-users 전략 |
| 회전 불필요·비용 최소 단순 비밀 | Parameter Store SecureString |
| 교차계정 시크릿 | CMK + 리소스 정책 + KMS 키 정책 |
| 키 접근 분리·감사 필요 | SSE-KMS |
| 이중 암호화 규제 | DSSE-KMS |
| AWS에 키 안 맡김 | SSE-C |
| KMS 비용·스로틀 완화 | S3 Bucket Key |
| 루트도 삭제 불가 보존 | Object Lock Compliance |
| 권한자 우회 허용 보존 | Object Lock Governance |
| 의도치 않은 공개 차단 | Block Public Access |
| 특정 키만 암호화 강제 | 버킷 정책 조건부 Deny |
| HTTPS 강제 | aws:SecureTransport:false Deny |
| VPC 밖 유출 방지 | aws:SourceVpce Deny + 엔드포인트 정책 |
| 거대 버킷 정책 분할 | S3 Access Point |
| 외부 노출 버킷 상시 탐지 | IAM Access Analyzer |
| S3 PII 탐지·분류 | Macie |
| TLS 인증서 무인 갱신 | ACM + DNS 검증 |
| EC2 직접 TLS 종단 | ALB+ACM 또는 Private CA export |

> 🔍 **더 깊이**: 시험의 함정은 대개 "비슷하지만 미묘하게 틀린" 보기다. SSE-KMS vs DSSE-KMS(이중 암호화 규제 키워드 유무), Governance vs Compliance(우회 가능 여부), single vs alternating(무중단 여부), Macie의 S3 한정(DB는 오답), ACM 퍼블릭 인증서의 EC2 직접 설치 불가, CloudFront 인증서의 us-east-1 발급 — 이 경계들을 정확히 구분하는 것이 합격선과 불합격선을 가른다. "무엇을 하는가"는 모두가 알지만, "언제 이것이고 언제 저것인가"가 Specialty의 깊이다.

---

## 📝 연습 문제

**문제 1.** 감사 로그를 7년간 보관해야 하며, 침해로 루트 자격증명이 탈취되더라도 보존 기간 내 삭제가 절대 불가능해야 한다. 또한 규제가 이중 암호화 계층을 요구한다. 올바른 조합은?

A) SSE-S3 + Object Lock Governance + 버전 관리  
B) DSSE-KMS + Object Lock Compliance + 버전 관리  
C) SSE-KMS + MFA Delete + 버전 관리  
D) SSE-C + Object Lock Governance  

**정답: B**  
해설: "루트조차 삭제 불가"는 Object Lock Compliance(버전 관리 전제)가 유일하게 충족하고, "이중 암호화 규제"는 DSSE-KMS가 충족한다. Governance는 우회 권한자가 삭제할 수 있어 부적합하고, MFA Delete는 MFA를 가진 루트가 여전히 삭제 가능하며, SSE-S3/SSE-C는 이중 암호화가 아니다.

---

**문제 2.** 회사 기밀 버킷의 데이터가 회사가 통제하는 VPC 네트워크 밖으로 나가지 못하게 하려 한다. 가장 완전한 조합은?

A) Block Public Access만 활성화  
B) 버킷 정책에 aws:SourceVpce StringNotEquals Deny를 걸고, VPC 엔드포인트 정책에 ResourceOrgID 조건으로 조직 버킷만 허용  
C) SSE-KMS로 암호화  
D) Macie로 버킷을 스캔  

**정답: B**  
해설: 데이터 경계는 양방향 봉쇄로 완성된다 — 버킷 정책은 `aws:SourceVpce`로 "내 버킷은 이 엔드포인트로만" 접근을 강제하고, 엔드포인트 정책은 `aws:ResourceOrgID`로 "이 엔드포인트는 우리 조직 버킷으로만" 향하게 한다. BPA는 공개 차단일 뿐 VPC 경로를 강제하지 못하고, 암호화는 유출 경로를 막지 못하며, Macie는 탐지 도구다.

---

**문제 3.** RDS 마스터 비밀번호를 자동 회전하려는데 회전 Lambda가 프라이빗 서브넷의 DB에 접근해야 하고, 회전 중 인증 실패가 없어야 한다. 누락하면 회전이 실패하는 핵심 요소 두 가지는?

A) alternating-users 전략과, Lambda를 DB VPC에 두고 Secrets Manager VPC 엔드포인트(또는 NAT) 제공  
B) single-user 전략과 공개 서브넷 배치  
C) Parameter Store 전환과 MFA  
D) DSSE-KMS와 Object Lock  

**정답: A**  
해설: 무중단 회전은 alternating-users 전략으로 달성하고, 프라이빗 DB 접근 + Secrets Manager API 호출을 위해 회전 Lambda를 같은 VPC에 두고 Secrets Manager VPC 엔드포인트(또는 NAT)를 제공해야 한다. 둘 중 하나라도 빠지면 회전이 실패하거나 인증 실패가 발생한다. single-user는 순간 실패 위험, Parameter Store는 회전 미지원, DSSE/Object Lock은 회전과 무관하다.

---

**문제 4.** SSE-KMS를 사용하는 매우 높은 트래픽의 버킷에서 KMS ThrottlingException과 비용 급증이 동시에 발생한다. 단, 이중 암호화 규제는 없다. 최적 해결책은?

A) DSSE-KMS로 전환  
B) S3 Bucket Key를 활성화  
C) SSE-C로 전환  
D) 암호화를 비활성화  

**정답: B**  
해설: S3 Bucket Key는 버킷 수준 키를 KMS에서 한 번 받아 객체 데이터 키를 S3가 로컬 파생하므로 KMS 호출을 최대 99% 줄여 스로틀과 비용을 동시에 해결한다. DSSE-KMS는 KMS 호출이 늘고 Bucket Key와 비호환이며, SSE-C는 키 관리 부담이 크고, 암호화 비활성화는 보안 위반이다.

---

**문제 5.** 계정 B의 애플리케이션이 계정 A의 Secrets Manager 시크릿을 읽어야 한다. 어떤 정책 구성이 모두 필요한가?

A) 계정 B의 IAM 정책만  
B) 시크릿 리소스 정책(계정 B 허용) + CMK 키 정책(계정 B Decrypt 허용) + 계정 B IAM 정책(GetSecretValue·Decrypt)  
C) 버킷 정책과 BPA  
D) 시크릿을 AWS 관리형 키로 암호화하고 리소스 정책만  

**정답: B**  
해설: 교차계정 시크릿 접근은 세 정책의 교집합으로 인가된다 — 시크릿 리소스 정책이 계정 B를 허용하고, 시크릿이 CMK로 암호화되어 그 키 정책이 계정 B의 Decrypt를 허용하며, 계정 B IAM 정책이 GetSecretValue와 kms:Decrypt를 부여해야 한다. IAM 정책만으로는 리소스·키 정책이 막고, AWS 관리형 키는 키 정책 편집이 불가해 교차계정 복호화를 허용할 수 없다. 버킷 정책/BPA는 S3 통제로 무관하다.

---
