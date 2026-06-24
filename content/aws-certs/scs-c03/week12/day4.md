# Day 4 - 전체 모의고사 페이스: 6개 도메인 종합 시나리오 점검

오늘은 학습이 아니라 *실전 페이스 훈련*이다. 실제 SCS-C03은 65문항, 170분 — 문항당 약 2.6분이다. 길고 복합적인 시나리오를 빠르게 *분해*하는 근육을 만든다. 짧은 복습 후 6개 도메인을 가로지르는 종합 문제를 풀이 중심으로 다룬다. 문제 비중이 오늘의 핵심이다.

## 페이스 전략: 시나리오 분해 4단계

긴 지문은 다음 순서로 1분 안에 뼈대를 추린다.

1. **요구의 핵심 동사 찾기** — "automatically(자동)", "without managing servers(서버리스)", "least privilege(최소권한)", "cannot be deleted(불변)", "centrally(중앙)", "private(비공개)". 동사가 답의 패턴을 결정한다.
2. **제약 조건 표시** — "multi-account", "no internet", "regulatory", "cost-effective", "existing X". 오답을 거르는 필터다.
3. **명백한 오답 2개 제거** — 요구를 정면으로 어기는 보기(예: 키 하드코딩, 퍼블릭화, 수동 절차)는 즉시 탈락.
4. **남은 2개에서 "best" 선택** — 더 자동화·더 관리형·더 최소권한·더 우회불가능한 쪽.

> 💡 **관련 이론**: Specialty 문제는 대개 "틀린 답"이 아니라 "덜 좋은 답"을 가린다. 두 보기가 모두 작동해도, AWS는 *managed > self-managed*, *automated > manual*, *defense in depth > 단일 통제*, *prevent > detect > respond*를 선호한다. 막판 2지선다에서는 이 선호 위계를 떠올려라.

## 빠른 키워드 → 도메인 매핑(워밍업)

| 지문 키워드 | 가리키는 영역 |
|-------------|---------------|
| "데이터 유출 의심·악성 IP 통신" | GuardDuty(탐지) → Detective(조사) |
| "S3에 PII가 있는지" | Macie |
| "서버리스 자동 교정" | EventBridge → Lambda |
| "인터넷 경유 없이 S3" | VPC Gateway Endpoint |
| "키를 우리가 단독 소유" | CloudHSM/custom key store |
| "조직 전체에 강제" | SCP / Firewall Manager / Conformance Pack |
| "삭제·변조 불가" | S3 Object Lock(WORM) + MFA Delete |
| "서드파티 교차계정 안전 위임" | AssumeRole + External ID |
| "DB 자격증명 자동 로테이션" | Secrets Manager |
| "신규 계정에 가드레일 자동" | Control Tower |

> ⚠️ **막판 함정 주의**: "us-east-1에서만 발급"(CloudFront용 ACM), "데이터 이벤트 별도 활성화"(S3 객체 추적), "NACL 임시 포트"(stateless 응답), "SCP는 권한을 주지 않음", "KMS 키 정책이 root를 신뢰해야 IAM 위임 가능" — 이 다섯은 마지막 2지선다를 가르는 단골이다.

---

## 📝 연습 문제

**문제 1.** (도메인 2·6) 한 기업이 200개 계정의 모든 API 활동을 변조 불가능하게 중앙 보관하고, 어떤 계정도 로깅을 끄지 못하게 하며, 신규 계정에도 자동 적용되길 원한다. 가장 적절한 설계는?

A) 각 계정 관리자가 개별 trail을 만들고 로컬 S3에 저장  
B) Organization trail로 중앙 S3(다른 계정·log file validation·Object Lock) + SCP로 StopLogging/DeleteTrail Deny + Control Tower로 신규 계정 자동 적용  
C) CloudWatch Logs에 90일 보관 후 자동 삭제  
D) 계정마다 Lambda로 로그를 수집  

**정답: B**  
해설: 다계정 중앙 집약은 organization trail이 신규 계정까지 자동 포함하고, 별도 로깅 계정 S3 버킷 + log file validation + Object Lock(WORM)으로 변조 불가능을 보장한다. SCP로 StopLogging/DeleteTrail을 Deny해 비활성화를 예방하고, Control Tower가 신규 계정에 가드레일을 자동 적용한다. 개별·로컬 보관, 단기 삭제, 커스텀 Lambda 수집은 중앙성·불변성·자동성을 모두 충족하지 못한다.

---

**문제 2.** (도메인 1·2) GuardDuty가 EC2의 암호화폐 채굴 멀웨어 통신을 탐지했다. 보안팀은 (1) 즉시 인스턴스를 격리하고 (2) 침해 범위를 조사하며 (3) 향후 같은 finding을 사람 개입 없이 자동 격리하길 원한다. 가장 적절한 조합은?

A) 인스턴스를 종료하고 수동으로 로그를 뒤진다  
B) 격리 보안 그룹으로 교체(+스냅샷) → Detective로 범위 조사 → EventBridge가 해당 finding 타입을 Lambda/SSM 자동 격리에 라우팅  
C) NACL로 모든 트래픽을 차단하고 끝낸다  
D) Inspector로 취약점만 스캔한다  

**정답: B**  
해설: 격리(종료 아님)로 휘발성 증거를 보존하며 스냅샷으로 증거를 캡처하고, Detective로 behavior graph 기반 범위를 조사하며, EventBridge로 해당 GuardDuty finding을 Lambda/SSM Automation 자동 격리에 라우팅해 향후 사람 개입을 없앤다. 종료·수동은 증거 파괴·비자동화이고, NACL 단발 차단은 조사·자동화가 없으며, Inspector는 취약점 스캔으로 침해 대응 도구가 아니다.

---

**문제 3.** (도메인 3·4) 프라이빗 서브넷의 Lambda가 DynamoDB와 특정 S3 버킷에 인터넷 경유 없이 접근해야 하고, 자격증명 하드코딩은 금지다. 비용도 최소화하려 한다. 가장 적절한 설계는?

A) Lambda를 퍼블릭 서브넷에 두고 NAT Gateway로 접근  
B) VPC에 S3·DynamoDB Gateway Endpoint(무료) 구성 + Lambda 실행 역할에 해당 리소스 최소 권한 부여 + 버킷 정책 SourceVpce 조건  
C) Lambda 환경 변수에 IAM 액세스 키 저장  
D) Interface Endpoint를 S3·DynamoDB에 사용  

**정답: B**  
해설: S3와 DynamoDB는 Gateway Endpoint(라우팅 기반·무료)를 지원하므로 인터넷 비경유·비용 최소를 동시에 만족하고, Lambda 실행 역할로 임시 자격증명을 부여해 하드코딩을 없애며, 버킷 정책 SourceVpce 조건으로 접근 경로를 잠근다. NAT 경유는 인터넷을 거치고 비용이 들며, 환경 변수 키 저장은 금지 사항이고, S3/DynamoDB에 Interface Endpoint는 불필요한 유료 옵션이다.

---

**문제 4.** (도메인 5) 의료 규제 데이터를 S3에 저장하며, (1) 저장·전송 모두 암호화, (2) 키 사용 감사, (3) 7년간 누구도(관리자 포함) 삭제·변조 불가를 요구한다. 가장 적절한 조합은?

A) SSE-S3 + 버전 관리만  
B) SSE-KMS(CMK, 키 정책) + 버킷 정책 aws:SecureTransport 강제 + CloudTrail KMS 감사 + S3 Object Lock(Compliance 모드, 7년 보존)  
C) SSE-C + MFA Delete  
D) 클라이언트 측 암호화만  

**정답: B**  
해설: 저장 암호화·감사·접근 통제는 SSE-KMS(CMK + 키 정책 + CloudTrail KMS API 감사), 전송 암호화는 aws:SecureTransport 강제, 누구도 삭제·변조 불가(관리자 포함)는 S3 Object Lock Compliance 모드의 7년 보존으로 충족한다. SSE-S3는 감사·키 통제가 약하고, SSE-C는 키 관리·감사가 부족하며, Object Lock 없는 구성은 불변성 요건을 못 채운다.

---

**문제 5.** (도메인 4·6) 서드파티 보안 감사 업체가 조직의 50개 계정을 읽기 전용으로 점검해야 한다. 장기 키 공유 없이, confused deputy를 방지하며, 중앙에서 관리하려 한다. 가장 적절한 방법은?

A) 각 계정에 IAM 사용자를 만들어 액세스 키를 업체에 이메일로 전달  
B) 교차 계정 읽기 전용 역할 + trust policy에 업체 계정 Principal·External ID 조건, CloudFormation StackSets로 50개 계정 일괄 배포  
C) 루트 자격증명을 공유  
D) 버킷을 퍼블릭으로 공개  

**정답: B**  
해설: 장기 키 없이 안전한 교차 계정 접근은 읽기 전용 역할 + AssumeRole이며, trust policy의 External ID로 confused deputy를 방지하고, StackSets로 50개 계정에 역할을 일괄·중앙 배포한다. 액세스 키 이메일 전달·루트 공유·버킷 공개는 모두 심각한 보안 위반으로 즉시 탈락한다.

---

**문제 6.** (도메인 2·3) 글로벌 웹앱이 (1) SQLi 시도, (2) 로그인 무차별 대입, (3) 간헐적 L3/4 대규모 flood를 받는다. 오리진 직접 접근도 차단해야 한다. 가장 적절한 통합 설계는?

A) ALB에만 WAF를 붙인다  
B) CloudFront 전면 + CLOUDFRONT scope WAF(SQLi managed + /login rate-based) + Shield Advanced + 오리진 직접 접근 차단(prefix list/비밀 헤더)  
C) EC2 보안 그룹만 강화  
D) Route 53 라우팅으로 트래픽 분산  

**정답: B**  
해설: 서로 다른 계층의 위협이므로 엣지에 결합 통제가 정답이다. CloudFront로 진입을 모으고 WAF로 SQLi(L7 필터)와 로그인 브루트포스(rate-based)를, Shield Advanced로 L3/4 flood 흡수와 비용 보호를 처리하며, 오리진 직접 접근을 prefix list/비밀 헤더로 차단해 우회를 막는다. ALB 단독·보안 그룹 강화·트래픽 분산은 이 복합 위협을 막지 못한다.

---

**문제 7.** (도메인 1·5) 보안팀이 "어느 S3 버킷에 신용카드 번호·주민번호 등 민감 데이터가 있는지" 자동으로 발견·분류하고, 결과를 중앙 보안 대시보드에 모으려 한다. 가장 적절한 조합은?

A) 직접 스크립트로 모든 객체를 다운로드해 정규식 검사  
B) Amazon Macie로 S3 민감 데이터 자동 발견·분류 → finding을 Security Hub로 집약  
C) GuardDuty를 S3 버킷에 설치  
D) Config 규칙으로 객체 내용을 검사  

**정답: B**  
해설: S3 내 PII·금융 데이터의 자동 발견·분류는 Macie의 전용 기능이며, finding은 Security Hub로 정규화·집약해 중앙 대시보드에서 본다. 직접 다운로드·정규식은 비효율·위험하고, GuardDuty는 행위 위협 탐지로 데이터 내용 분류가 아니며, Config는 설정 평가로 객체 내용을 검사하지 않는다.

---

**문제 8.** (도메인 6) 조직 전체에서 모든 ALB·CloudFront에 표준 WAF 규칙을 강제하고, 신규로 생성되는 리소스에도 자동 적용하며, 위반을 중앙에서 가시화하려 한다. 가장 적절한 서비스는?

A) 각 계정에서 WAF를 수동으로 구성  
B) AWS Firewall Manager로 조직 차원 WAF 정책을 정의·강제(신규 리소스 자동 적용)  
C) SCP로 WAF를 강제  
D) Config 규칙으로 탐지만  

**정답: B**  
해설: Firewall Manager는 Organizations와 통합해 WAF·Shield·SG 정책을 조직 차원에서 정의하고, 신규 생성 리소스에도 자동 적용하며 위반을 중앙 가시화한다. 수동 구성은 드리프트가 생기고, SCP는 권한 가드레일이지 WAF 규칙 배포 도구가 아니며, Config는 탐지만 하고 강제 적용은 하지 못한다.

---

**문제 9.** (도메인 3·4) EC2 애플리케이션이 RDS 자격증명을 사용해야 한다. 자격증명은 정기적으로 자동 로테이션되어야 하고 코드에 박지 않아야 한다. 가장 적절한 조합은?

A) RDS 비밀번호를 환경 변수에 저장  
B) Secrets Manager에 RDS 자격증명 저장(Lambda 로테이터로 자동 로테이션) + EC2 인스턴스 역할에 해당 시크릿 GetSecretValue 권한  
C) SSM Parameter Store String(평문)에 저장  
D) 코드에 하드코딩 후 정기 수동 변경  

**정답: B**  
해설: 자동 로테이션이 필요한 DB 자격증명은 Secrets Manager가 Lambda 로테이터로 주기적으로 교체하고, EC2 인스턴스 역할에 GetSecretValue만 부여해 최소 권한·무하드코딩을 달성한다. 환경 변수·평문 파라미터·하드코딩은 로테이션이 없거나 노출 위험이 크다. (로테이션 불필요한 설정값이면 Parameter Store SecureString도 후보지만, 자동 로테이션 요건엔 Secrets Manager가 정답.)

---

**문제 10.** (도메인 2) 한 팀이 "S3 객체가 누구에 의해 다운로드됐는지"를 못 찾고 있다. 기본 CloudTrail은 켜져 있다. 원인은?

A) VPC Flow Logs가 꺼져 있다  
B) S3 객체 수준 접근은 CloudTrail 데이터 이벤트를 별도로 활성화해야 기록된다(관리 이벤트는 미기록)  
C) GuardDuty가 비활성  
D) 버킷 로깅이 KMS로 암호화돼 보이지 않는다  

**정답: B**  
해설: 기본 CloudTrail 관리 이벤트는 S3 객체 GET/PUT 같은 데이터 평면 접근을 기록하지 않으므로, 객체 수준 추적은 데이터 이벤트를 명시적으로 켜야 한다. Flow Logs는 객체 식별을 못 하고, GuardDuty는 감사 원천이 아니며, KMS 암호화는 로그 가시성과 무관하다. 데이터 이벤트 별활성화는 빈출 함정이다.

---
