# Day 40 - Week 8 종합: 보안 도메인 시나리오 12

이번 주 동안 본 KMS·Secrets Manager·Cognito·WAF·Shield·GuardDuty·Inspector·Macie·Detective·Security Hub는 각각 독립된 서비스이지만, 실제 SAA 시험과 운영 현장에서는 거의 항상 둘 이상이 한 아키텍처 안에서 협력한다. 예를 들어 "모바일 앱 사용자가 S3에 이미지를 업로드한다"는 단순해 보이는 요구도, 그 뒤에는 Cognito User Pool(사용자 인증) + Identity Pool(STS Role) + S3 SSE-KMS(저장 암호화) + Macie(업로드 후 PII 스캔) + WAF(악성 트래픽 차단) + GuardDuty(비정상 접근 탐지)가 동시에 동작한다.

이 글에서는 이번 주의 모든 도구를 시나리오 단위로 조합해 풀어본다. SAA 보안 도메인(30% 비중, 시험에서 가장 큰 영역)에서 자주 나오는 12가지 시나리오를 다루고, 각각에 대해 "왜 이 답이고 왜 다른 답이 아닌가"를 풀이한다. 단일 서비스를 외우는 것보다 시나리오 → 조합을 떠올리는 훈련이 시험뿐 아니라 실무 보안 설계에도 직접적으로 도움이 된다.

## 한 주의 핵심 정리: 분업과 조합

이번 주의 도구들을 "차단 / 탐지 / 분석 / 통합" 4개 축과 "암호화 / 비밀 / 사용자" 3개 축으로 재정렬하면 다음과 같다.

| 축 | 도구 | 핵심 역할 |
|----|------|----------|
| 키 관리 | KMS | 봉투 암호화, CMK·AWS Managed·CloudHSM 분류 |
| 비밀·구성 | Secrets Manager / Parameter Store / CloudHSM | 자동 회전 / 무료 구성 / FIPS L3 전용 |
| 사용자 인증 | Cognito User Pool | 디렉터리·JWT·소셜·SAML SSO |
| 사용자 인가 | Cognito Identity Pool | STS Role 임시 위임 |
| 차단 (L7) | WAF | OWASP, Rate Limit, Bot Control |
| 차단 (L3/L4) | Shield Standard / Advanced | DDoS, Cost Protection |
| 탐지 (행위) | GuardDuty | CloudTrail/VPC Flow/DNS ML 분석 |
| 탐지 (취약점) | Inspector | EC2/ECR/Lambda CVE 스캔 |
| 탐지 (PII) | Macie | S3 객체 콘텐츠 분류 |
| 분석 | Detective | 그래프 기반 근본 원인 |
| 통합 | Security Hub | 멀티 서비스 + 컴플라이언스 점수 |
| 조직 가드레일 | Firewall Manager | Organizations 단위 WAF/Shield/SG 일괄 |

이 표에서 가장 자주 헷갈리는 비교 쌍을 따로 정리하면 다음과 같다.

| 헷갈리는 쌍 | 구분 키 |
|-------------|--------|
| KMS vs CloudHSM | multi-tenant vs single-tenant, AWS 명의 인증 vs 고객 명의 인증 |
| Secrets Manager vs Parameter Store | 자동 회전·유료 vs 무료·회전 없음 |
| User Pool vs Identity Pool | JWT 발급(우리 API용) vs STS 자격증명(AWS API용) |
| Cognito vs IAM Identity Center | 외부 앱 사용자 vs 직원의 AWS 콘솔 SSO |
| WAF vs Shield | L7 응용 공격 vs L3/L4 DDoS |
| GuardDuty vs Inspector | 행위 기반 탐지 vs 정적 취약점 스캔 |
| GuardDuty vs Macie | 위협 탐지(VPC/CloudTrail) vs PII 탐지(S3 콘텐츠) |
| Security Hub vs Detective | 통합 점수·대시보드 vs 근본 원인 그래프 |
| Firewall Manager vs WAF | 조직 단위 정책 강제 vs 개별 Web ACL |

```
[ 풀스택 보안 아키텍처 ]

  Internet
     │ Shield Standard (자동, L3/L4)
     │ + Shield Advanced (Cost Protection)
  CloudFront ── WAF (Managed Rules + Rate Limit + Geo Block)
     │
  ALB ── (옵션) WAF, Cognito 통합 인증
     │
  ECS Fargate (Task Role / IRSA, Secrets Manager 환경 변수 주입)
     │
  RDS Aurora (KMS SSE, Secrets Manager 자동 회전 30일, RDS Proxy)
     │
  S3 (SSE-KMS + Bucket Keys, BPA, OAC, Macie PII 스캔)

  사용자 인증:
    Mobile/Web → Cognito User Pool (또는 SAML SSO)
              → Identity Pool → STS Role → 일부 직접 AWS API

  관제:
    GuardDuty (위협) + Inspector (CVE) + Macie (PII) + Config (구성)
              → Security Hub (CIS/AFSBP 점수)
              → EventBridge → Lambda/SNS 자동 대응
              → Detective (사후 분석)

  조직 가드레일:
    Firewall Manager로 모든 계정의 WAF/Shield/SG 일괄 강제
```

> 💡 **관련 이론**: 이런 다층 구조를 **defense in depth** 또는 **swiss cheese model**(스위스 치즈 모델, James Reason 1990)이라고 부른다. 어떤 단일 보안 계층도 완벽하지 않지만(치즈에 구멍이 있듯), 여러 계층을 쌓으면 구멍이 일직선으로 정렬될 확률이 매우 낮아진다. CloudFront WAF가 SQLi를 못 잡아도 ALB WAF가 잡고, 둘 다 못 잡아도 RDS의 IAM DB Auth + Secrets Manager 회전이 비밀번호 유출 영향을 줄이고, 그래도 데이터가 새면 SSE-KMS가 디스크 유출을 막는다. 클라우드 보안은 "한 가지 강한 도구"가 아니라 "여러 가벼운 도구의 조합"이다.

> 🔍 **더 깊이**: 보안 도메인은 SAA-C03 시험에서 30%로 가장 큰 비중을 차지하지만, 시나리오 문제는 보통 "이 키워드 → 이 서비스"로 단순 매핑된다. 단 함정이 두 가지 있다 — ① "비슷한 서비스 중 정확한 하나"(예: GuardDuty vs Inspector vs Macie), ② "조합이 필요한 경우 단일 서비스 답"(예: 모바일 S3 업로드 = User Pool만 X, Identity Pool 필요). 이 두 함정을 피하려면 "이 키워드는 어떤 서비스의 정의에 해당하나"를 명확히 외워두고, 시나리오의 모든 요구를 빠뜨리지 말고 체크해야 한다.

## 자주 마주치는 안티패턴들

시나리오 문제를 풀기 전에, 실무와 시험 양쪽에서 가장 자주 보는 보안 안티패턴 다섯 가지를 짚어둔다.

| 안티패턴 | 문제 | 올바른 패턴 |
|---------|------|------------|
| 비밀을 코드/환경변수에 평문 박기 | git 노출, log 누출 | Secrets Manager + IAM 권한 |
| S3 버킷 Public Read/Write | 데이터 유출 사고 1위 | BPA(Block Public Access) + OAC + CloudFront |
| IAM User 키를 EC2에 박기 | 키 유출 시 무제한 권한 | IAM Instance Profile |
| SSE-KMS에 AWS Managed Key + 권한 분리 X | 모든 IAM이 복호화 | CMK + 키 정책 + kms:ViaService |
| 단일 region DR 가정 | region 장애 시 복호화 불가 | Multi-Region Keys + Secrets Manager Replication |

> ⚠️ **함정**: 시나리오에 "비용을 최소화"라는 표현이 있어도 보안을 다운그레이드하면 안 된다. 예를 들어 "S3 SSE-KMS 비용을 줄이고 싶다"는 표현에 "SSE-S3로 전환"이 답이 되는 경우는 거의 없다. 정답은 보통 "S3 Bucket Keys 활성화"이고, 이는 보안 수준을 유지하면서 KMS 호출 비용만 99% 줄인다.

## 시나리오 연습 문제 12

**문제 1.** 한 모바일 게임이 글로벌 출시 후 DDoS 공격을 받았다. CloudFront 트래픽이 평소의 200배로 폭증해 AWS 청구서가 예상보다 $80,000 늘었다. 향후 같은 사고에서 추가 비용을 환불받고 싶다. 가장 적합한 솔루션은?

A) 이미 무료로 적용 중인 Shield Standard를 그대로 두고 CloudWatch 청구 알람으로 비용 급증만 감시
B) Shield Advanced 가입 ($3,000/월 + Cost Protection)
C) 공격 동안 CloudFront 배포를 비활성화해 트래픽을 차단하고 오리진 비용을 줄임
D) Route 53 health check + failover로 트래픽을 대기 리전으로 우회시켜 부하 분산

**정답: B**

해설: Shield Advanced의 가장 큰 가치 중 하나가 **Cost Protection** 이다. DDoS로 인한 ELB/CloudFront/Route 53/EC2 스케일아웃 비용을 AWS가 환불해주므로 청구서 폭탄을 막을 수 있다. Standard(A)는 cost protection이 없고, C·D는 보호 솔루션이 아니다. Shield Advanced 가입은 워크로드 단위가 아니라 계정 단위이고, 24/7 DDoS Response Team과 L7 자동 mitigation도 함께 제공된다.

---

**문제 2.** 한 핀테크 회사가 PCI DSS 컴플라이언스를 받기 위해 "키 자료에 AWS 직원도 접근할 수 없으며 FIPS 140-2 Level 3 인증을 회사 명의로" 요구받았다. 가장 적합한 키 저장소는?

A) KMS Customer Managed Key — multi-tenant HSM 위에서 FIPS 140-2 Level 3 모듈을 쓰되 AWS 명의 인증, 키 정책으로 접근 통제
B) Secrets Manager에 키 자료를 보관하고 자동 회전 + KMS 봉투 암호화로 보호
C) CloudHSM (single-tenant FIPS 140-2 Level 3, 고객 명의 인증)
D) Parameter Store SecureString + KMS CMK로 암호화해 AWS 직원 접근 차단

**정답: C**

해설: CloudHSM은 single-tenant이고 AWS 직원도 키 자료에 접근할 수 없으며 FIPS 140-2 Level 3 인증을 고객 명의로 받는다. KMS CMK(A)도 FIPS L3 HSM 위에서 동작하지만 multi-tenant이고 AWS 명의 인증이라 이 요구를 충족하지 못한다. 컴플라이언스 요구가 명시적으로 "AWS 직원 접근 불가 + 고객 명의"이면 CloudHSM이 유일한 답이다. 일반적으로는 KMS CMK로 충분하지만, 일부 강한 규제 환경에서는 CloudHSM이 필수다.

---

**문제 3.** 한 회사가 RDS Aurora PostgreSQL의 admin 비밀번호를 90일마다 자동 회전하고, 회전 도중 어떤 다운타임도 발생하면 안 된다. 가장 적합한 솔루션은?

A) Parameter Store SecureString + cron Lambda
B) Secrets Manager + AWS 제공 RDS rotation Lambda + 90일 일정
C) CloudHSM에 비밀번호 저장
D) EC2 환경 변수 + Ansible cron

**정답: B**

해설: Secrets Manager는 RDS / Aurora / Redshift / DocumentDB에 대해 AWS가 제공하는 회전 Lambda 템플릿을 그대로 쓸 수 있다. 4단계 라이프사이클(createSecret → setSecret → testSecret → finishSecret)에서 AWSCURRENT가 testSecret 성공 후에만 승격되므로 다운타임 없는 회전이 보장된다. AWSPREVIOUS도 일정 기간 살아 있어 활성 커넥션은 끊기지 않는다. A·D는 직접 dual-credential 패턴을 구현해야 해서 위험. C는 회전 자동화 안 됨.

---

**문제 4.** 한 회사의 SPA 웹 앱이 인증된 사용자에게 S3에 이미지를 직접 업로드할 권한을 임시로 부여해야 한다. 가장 적합한 인증·인가 흐름은?

A) User Pool 단독 + JWT로 S3 호출
B) Cognito User Pool로 로그인 → JWT → Identity Pool → STS AssumeRoleWithWebIdentity → 임시 자격증명으로 S3 PUT
C) IAM 사용자 키를 SPA에 박기
D) S3 버킷 정책으로 Public Write

**정답: B**

해설: 모바일/SPA가 S3 API를 직접 호출하려면 SigV4 서명 가능한 IAM 자격증명이 필요하고, Cognito Identity Pool이 이를 STS AssumeRoleWithWebIdentity로 발급한다. 사용자 인증은 User Pool로 처리하고 JWT를 Identity Pool에 넘기는 게 표준 흐름이다. A는 JWT만으로 AWS API 호출 불가. C는 보안 최악. D는 데이터 유출 직결.

---

**문제 5.** 한 회사가 사용자 가입 시 회사 도메인 이메일(`@mycompany.com`)만 허용하고, 가입 후에는 사용자 정보를 자체 DynamoDB와 자동 동기화하고 싶다. 가장 적합한 솔루션은?

A) PreSignUp Lambda Trigger (도메인 검증) + PostConfirmation Lambda Trigger (DDB 복제)
B) 백엔드 코드에서 직접 처리
C) IAM 정책으로 제어
D) Identity Pool에서 처리

**정답: A**

해설: Cognito User Pool의 Lambda Triggers는 로그인 흐름의 각 단계에 사용자 정의 코드를 끼워 넣는 표준 메커니즘이다. PreSignUp은 가입 직전 호출되어 도메인 검증 + 예외로 차단 가능하고, PostConfirmation은 이메일/SMS 검증 완료 후 호출되어 DDB 복제·환영 메일 발송에 쓰인다. B는 가능하지만 가입 흐름 통합이 어려움. C·D는 시나리오와 무관.

---

**문제 6.** 한 회사가 S3 버킷에 들어 있는 객체 중 신용카드 번호, 주민번호 같은 PII가 들어 있는 것을 자동으로 탐지하고, 발견되면 즉시 격리하고 SecOps에 알리고 싶다. 가장 적합한 솔루션은?

A) GuardDuty + EventBridge
B) Macie + EventBridge → Lambda (객체를 격리 버킷으로 이동) + SNS (SecOps)
C) Inspector + Lambda
D) Config + SNS

**정답: B**

해설: Macie는 S3 객체 콘텐츠를 ML로 분석해 100가지 이상의 PII 패턴을 자동 분류하는 유일한 서비스다. finding이 EventBridge에 publish되므로 Lambda로 자동 격리 + SNS 알림이 가능하다. GuardDuty(A)는 행위 기반 위협 탐지이지 콘텐츠 분류가 아님. Inspector(C)는 취약점 스캔, Config(D)는 구성 평가.

---

**문제 7.** 한 회사가 EC2 인스턴스 500대의 OS·패키지에 새로 공개된 Log4Shell 류 CVE가 영향을 미치는지 자동으로 평가하고, 그 결과를 컴플라이언스 대시보드에 통합하고 싶다. 가장 적합한 조합은?

A) Inspector v2 (자동/지속 스캔) + Security Hub (통합 대시보드 + 점수)
B) GuardDuty + Macie
C) Config + CloudTrail
D) Lambda + S3

**정답: A**

해설: Inspector v2는 SSM Agent로 패키지 인벤토리를 수집하고 CVE DB와 자동 대조하며, 새 CVE 공개 시 모든 영향받는 인스턴스를 즉시 재평가한다. finding은 자동으로 Security Hub에 통합되어 CIS·AFSBP·PCI DSS 같은 표준의 점수에 반영된다. GuardDuty는 행위 기반이라 정적 CVE 스캔 도구가 아니다.

---

**문제 8.** 한 SaaS 회사가 직원이 사내 Okta SSO로 우리 SaaS에 로그인할 수 있게 만들고 싶다. 사용자 디렉터리는 Cognito에 자체적으로 두고 싶지만, 비밀번호 관리는 Okta가 해야 한다. 가장 적합한 구성은?

A) IAM Identity Center로 통합
B) Cognito User Pool + 외부 SAML IdP로 Okta 등록 + attribute mapping
C) Cognito Identity Pool 단독
D) AD Connector

**정답: B**

해설: B2B SaaS의 엔터프라이즈 SSO 시나리오는 거의 항상 "User Pool + 외부 SAML IdP"가 답이다. Okta SAML AuthnRequest로 인증 위임하고, Okta가 반환한 SAML Assertion의 attribute를 Cognito 사용자 속성으로 매핑한다. IAM Identity Center(A)는 직원이 AWS 콘솔/CLI에 SSO하는 용도이지 외부 앱 인증용이 아니다. C는 사용자 디렉터리가 없어 단독 불가.

---

**문제 9.** 한 회사가 us-east-1과 ap-northeast-2에서 active-active 운영을 한다. 한 region에서 SSE-KMS로 암호화한 S3 객체를 다른 region에 복제(CRR)했을 때 즉시 복호화 가능해야 하고, RDS 비밀번호도 두 region에서 동일하게 유지되어야 한다. 가장 적합한 조합은?

A) 각 region에 별개 CMK + 별개 비밀 + 수동 동기화
B) KMS Multi-Region Keys + Secrets Manager Replication
C) CloudHSM 멀티 리전
D) Parameter Store + Lambda 동기화

**정답: B**

해설: KMS Multi-Region Keys(2021년 6월 출시)는 같은 key material을 여러 region에 동기 복제하면서 같은 keyId(접두사 `mrk-`)로 노출한다. CRR 복제본을 즉시 복호화 가능. Secrets Manager Replication도 원본 회전이 복제본에 자동 반영되어 두 region 비밀이 항상 동기화된다. A·D는 수동 동기화 부담·실패 가능성, C는 멀티 리전 CloudHSM은 매우 복잡·고비용.

---

**문제 10.** 한 회사가 글로벌 웹 서비스 앞단에서 OWASP Top 10 공격을 자동 차단하고, 봇 트래픽을 분류하고, IP당 5분 2000 요청 초과 시 차단하고, 한국·미국·일본 외 국가는 차단하고 싶다. 가장 적합한 구성은?

A) Shield Standard만
B) CloudFront + WAF Web ACL (AWS Managed Rules CommonRuleSet + Bot Control + Rate-based Rule + Geo Match Rule)
C) Network Firewall
D) Security Group + NACL

**정답: B**

해설: WAFv2의 Web ACL은 여러 Rule을 priority 순으로 평가한다 — AWS Managed Rules(OWASP), Bot Control(봇 분류), Rate-based Rule(IP 속도 제한), Geo Match Statement(국가 차단)을 모두 한 Web ACL에 묶을 수 있다. CloudFront에 attach하면 edge에서 검사해 origin 부담을 크게 줄인다. Shield(A)는 L3/L4 DDoS, Network Firewall(C)·SG/NACL(D)은 L7 응용 공격 차단 도구가 아니다.

---

**문제 11.** 한 회사가 GuardDuty에서 "EC2가 알려진 암호화폐 채굴 풀과 통신" finding이 발생하면 5분 내 자동으로 인스턴스를 격리 SG로 이동하고, 사후 분석을 위해 그래프로 IAM Role의 활동을 추적하고, 결과를 SecOps 대시보드에 통합하고 싶다. 가장 적합한 조합은?

A) GuardDuty → EventBridge (severity≥7) → Lambda (격리 SG 교체) + SNS (SecOps) + Detective (그래프 분석) + Security Hub (통합 대시보드)
B) CloudTrail Insights만
C) Config만
D) WAF만

**정답: A**

해설: GuardDuty finding은 즉시 EventBridge에 publish되어 자동 대응 Lambda를 트리거할 수 있다. 격리 SG로 ENI를 교체하면 인스턴스가 외부와 단절된다. 사후 분석은 Detective가 GuardDuty + VPC Flow + CloudTrail을 그래프 DB로 통합해 시각화한다. Security Hub는 모든 finding을 통합 대시보드로 보여주고 컴플라이언스 점수를 매긴다. 이 4개 서비스 조합이 표준 보안 운영 파이프라인이다.

---

**문제 12.** 한 엔터프라이즈가 AWS Organizations로 80개 계정을 운영하면서 ① 모든 계정의 모든 ALB/CloudFront에 동일한 WAF Managed Rule 강제, ② 모든 계정에 Shield Advanced 자동 적용, ③ 신규 계정에도 자동 적용, ④ CIS·AFSBP 표준 점수 통합 모니터링이 필요하다. 가장 적합한 조합은?

A) Firewall Manager (조직 단위 WAF/Shield 일괄 적용 + 신규 자동) + Security Hub (CIS/AFSBP 통합 점수)
B) 각 계정에 수동 설정
C) Lambda로 매일 점검
D) Config Rule만

**정답: A**

해설: Firewall Manager는 AWS Organizations 전체에 WAF Web ACL, Shield Advanced, Security Group, Network Firewall, Route 53 Resolver DNS Firewall 정책을 일괄 적용하는 전용 서비스이고, 신규 계정·리소스에도 자동 적용된다. Security Hub는 모든 계정의 보안 finding을 통합하고 CIS AWS Foundations Benchmark, PCI DSS, AWS Foundational Security Best Practices 점수를 자동 평가한다. 이 두 서비스가 멀티 계정 보안의 표준 조합이다.

---

## 다음 주 예고: 운영·모니터링 도메인

다음 주는 Week 9 — 모니터링과 운영이다. 이번 주에 본 보안 서비스들이 "사고가 났을 때 알리는 finding"을 만든다면, 다음 주의 CloudWatch·CloudTrail·Config·SSM·X-Ray는 "평소에 시스템이 어떻게 동작하는지" 그리고 "사고가 났을 때 어떻게 추적·복구하는지"를 다룬다.

| Day | 주제 |
|-----|------|
| Day 41 | CloudWatch Metrics·Logs·Alarms·Dashboards — 관측성의 기본 축 |
| Day 42 | CloudTrail·Config — 감사와 구성 컴플라이언스 |
| Day 43 | Systems Manager (Session Manager·Patch Manager·Automation) — 운영 자동화 |
| Day 44 | X-Ray·OpenTelemetry — 분산 추적 |
| Day 45 | Week 9 종합 시나리오 |

특히 이번 주에 본 GuardDuty·Inspector·Macie의 finding이 모두 CloudWatch Events(EventBridge)로 흘러가고, CloudTrail 로그를 GuardDuty가 분석한다는 점에서, 보안과 운영은 사실상 같은 데이터 파이프라인을 공유한다. 다음 주 학습을 시작하기 전에 이번 주 시나리오 12개를 한 번 더 풀어두는 게 도움이 된다.

---

해설 보강: SAA-C03의 보안 도메인(30%)은 시험의 가장 큰 영역이지만, 시나리오의 90%는 키워드 → 서비스 매핑으로 풀린다. ① "자동 회전" = Secrets Manager, ② "PII 탐지" = Macie, ③ "행위 기반 위협" = GuardDuty, ④ "CVE 스캔" = Inspector, ⑤ "L7 공격" = WAF, ⑥ "L3/L4 DDoS + Cost Protection" = Shield Advanced, ⑦ "모바일 S3 직접 업로드" = Cognito Identity Pool, ⑧ "엔터프라이즈 SAML SSO" = User Pool + SAML, ⑨ "Multi-Region 암호화" = Multi-Region Keys, ⑩ "조직 단위 보안 일괄" = Firewall Manager, ⑪ "통합 컴플라이언스 점수" = Security Hub, ⑫ "근본 원인 그래프" = Detective. 이 12개 매핑을 외워두면 보안 도메인의 거의 모든 시나리오에 빠르게 답할 수 있다. 그리고 두 가지 함정만 추가로 기억하자 — ① "비용 최소화"가 보안 다운그레이드를 의미하지 않는다(S3 Bucket Keys 같은 비용 최적화 옵션이 답), ② 두 서비스 조합이 필요한 시나리오(User Pool + Identity Pool 같은)에서 단일 서비스 답을 고르지 말 것.
