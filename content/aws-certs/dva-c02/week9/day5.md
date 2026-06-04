# Day 45 - Week 9 복습: 보안은 한 줄의 설정이 아니라 계층의 합이다

한 주 동안 KMS, Secrets Manager, Parameter Store, Cognito, WAF, Shield, ACM을 차례로 봤다. 처음 보면 서로 무관한 서비스들의 나열처럼 느껴지지만, 실제로는 하나의 요청이 인터넷에서 출발해 애플리케이션의 데이터에 닿기까지 거치는 **방어 계층(defense in depth)** 의 단면들이다. DDoS는 Shield가 흡수하고, 악성 HTTP 패턴은 WAF가 거르고, 신원은 Cognito가 증명하고, 전송은 ACM의 TLS가 감싸고, 저장된 비밀은 Secrets Manager가, 그 비밀을 푸는 키는 KMS가 지킨다. 이 순서를 머릿속에 그릴 수 있으면 Week 9의 거의 모든 문제는 "이 계층 어디서 막아야 하는가"라는 단일 질문으로 환원된다.

DVA-C02 보안 섹션이 어려운 이유는 개념 자체가 아니라 **비슷한 두 서비스 사이의 미세한 경계** 때문이다. Secrets Manager와 Parameter Store는 둘 다 비밀을 저장하지만 자동 회전 유무가 다르고, User Pool과 Identity Pool은 둘 다 Cognito지만 하나는 인증을 다른 하나는 인가를 맡는다. Shield Standard와 Advanced는 둘 다 DDoS를 막지만 비용 보호 여부가 갈린다. 이번 복습은 그 경계선들을 한 번 더 또렷하게 긋고, 실제 보안 사고가 왜 이 경계를 무시했을 때 터졌는지를 짚은 뒤, 시험 유형의 시나리오로 마무리한다.

## 방어 계층을 한 요청의 여정으로 다시 그리기

사용자의 HTTP 요청 하나가 시스템에 들어와 데이터를 읽고 나가기까지를 따라가 보면, 이번 주 서비스들이 어디에 끼어드는지가 자연스럽게 보인다. 트래픽이 CloudFront 엣지에 도착하면 먼저 **Shield** 가 볼류메트릭 공격(SYN flood, UDP reflection)을 흡수한다. 그다음 **WAF** 가 요청의 L7 내용 — SQL 인젝션 문자열, XSS 페이로드, 비정상적으로 잦은 IP — 을 규칙으로 검사한다. 통과한 요청은 **ACM** 이 발급한 인증서로 맺어진 TLS 터널 안에서 오리진으로 전달된다. 애플리케이션은 요청에 담긴 **Cognito** JWT를 검증해 "누구인가"를 확인하고, S3 같은 AWS 리소스에 접근해야 하면 Identity Pool로 IAM 임시 자격을 받는다. 마지막으로 DB 비밀번호는 **Secrets Manager** 에서, 그 비밀을 암호화한 **KMS** 키로 복호화해 가져온다.

> 💡 **관련 이론**: 이 구조가 바로 정보보안의 고전 원칙인 **defense in depth(심층 방어)** 다. 미 국가안보국(NSA)의 정보보증 모델에서 유래한 이 개념은 단일 방어선의 실패가 곧 전체 붕괴로 이어지지 않도록 독립적인 방어 계층을 겹쳐 쌓는다. 핵심은 각 계층이 **서로 다른 위협 모델** 을 담당한다는 점이다 — Shield는 가용성(availability), WAF는 무결성(integrity)을 노리는 주입 공격, Cognito/IAM은 인증·인가(authentication/authorization), KMS는 기밀성(confidentiality)을 지킨다. CIA 삼원칙(Confidentiality, Integrity, Availability)이 각 계층에 어떻게 분산되는지를 보면, 왜 한 서비스로 모든 보안을 해결할 수 없는지가 명확해진다.

> ⚠️ **함정**: 시험은 종종 "이 위협을 어디서 막느냐"를 물으며 인접 계층을 오답으로 깐다. SQL 인젝션을 NACL이나 Security Group으로 막을 수 있냐고 물으면 답은 No다 — NACL/SG는 L3/L4(IP·포트)에서 동작하고, SQL 인젝션은 HTTP 페이로드(L7) 안에 숨으므로 WAF만 볼 수 있다. 반대로 특정 국가의 IP 대역 전체를 막는 건 WAF의 Geo match로도 되지만, 순수 IP 차단이면 NACL이 더 싸고 빠르다. "어느 OSI 계층의 문제인가"를 먼저 판단하는 습관이 이 함정을 피하는 길이다.

## 비밀 저장: Secrets Manager와 Parameter Store의 갈림길

이번 주 가장 자주 헷갈리는 쌍이 Secrets Manager와 Parameter Store다. 둘 다 민감한 값을 안전하게 보관하고 KMS로 암호화하지만, 결정적 차이는 **자동 회전(automatic rotation)** 이다. Secrets Manager는 Lambda 함수를 내장해 RDS·Redshift·DocumentDB 자격 증명을 주기적으로 스스로 교체하고, 새 비밀번호를 DB와 비밀 저장소 양쪽에 동시에 반영한다. Parameter Store는 이런 회전 기능이 없다 — 값을 저장하고 계층적으로 조회하는 데 특화돼 있고, 표준 파라미터는 **무료** 다.

| 항목 | Secrets Manager | Parameter Store |
|------|-----------------|-----------------|
| 자동 회전 | 내장 (RDS 등 통합) | 없음 |
| 비용 | 비밀당 $0.40/월 + API | 표준 무료 / 고급 $0.05 |
| 크기 한도 | 64KB | 표준 4KB / 고급 8KB |
| 암호화 | KMS 필수 | SecureString만 KMS |
| 계층 구조 | 제한적 | `/app/prod/db/...` 경로 트리 |
| 교차 참조 | — | CloudFormation `{{resolve:ssm:...}}` |

> 🔍 **더 깊이**: Secrets Manager의 자동 회전이 무중단으로 동작하는 비결은 **두 벌의 비밀을 번갈아 쓰는 전략** 에 있다. RDS 회전 Lambda는 네 단계(`createSecret` → `setSecret` → `testSecret` → `finishSecret`)를 거치는데, Single-User 전략은 한 사용자의 비밀번호를 바꾸므로 변경 순간 짧은 틈이 생길 수 있는 반면, **Alternating-Users** 전략은 두 개의 DB 사용자를 두고 한 쪽이 활성일 때 다른 쪽을 갱신한 뒤 전환하므로 다운타임이 사실상 없다. 시험에서 "회전 중 무중단이 필요하다"가 나오면 Alternating-Users가 정답이다. 이 four-step 모델은 비밀의 `AWSCURRENT`/`AWSPENDING`/`AWSPREVIOUS` 스테이지 레이블로 구현되는데, 회전 실패 시 `AWSPREVIOUS`로 롤백할 수 있는 안전장치를 제공한다.

> 📚 **사례**: 2021년 Codecov 공급망 침해 사건은 비밀 관리가 왜 중요한지를 극적으로 보여준다. 공격자가 Codecov의 Bash Uploader 스크립트를 변조해, CI 환경변수에 평문으로 노출돼 있던 수많은 고객사의 자격 증명·토큰·키를 외부로 빼돌렸다. 피해 기업들이 AWS 키, GitHub 토큰을 환경변수에 그대로 두고 있었던 게 화근이었다. 만약 이 비밀들이 Secrets Manager에 있었고 짧은 주기로 자동 회전됐다면, 유출된 값은 이미 무효화돼 피해가 제한됐을 것이다. "비밀을 환경변수·코드에 평문으로 두지 말고, 회전 가능한 저장소에 두라"는 교훈이 이 사건의 핵심이다.

## 인증과 인가: User Pool은 "누구인가", Identity Pool은 "무엇을 할 수 있는가"

Cognito의 두 풀을 가르는 한 문장은 이것이다. **User Pool은 인증(authentication), Identity Pool은 인가(authorization)** 를 담당한다. User Pool은 회원가입·로그인·MFA를 처리하고 성공하면 세 종류의 JWT(ID·Access·Refresh Token)를 발급한다. 이 토큰은 "이 사람은 검증된 user_a"라는 신원 증명일 뿐, S3나 DynamoDB에 직접 접근할 권한은 아니다. AWS 리소스에 손을 대려면 그 JWT를 Identity Pool에 제출해 **IAM 임시 자격 증명** 으로 교환해야 한다.

| 토큰 | 담긴 정보 | 용도 |
|------|-----------|------|
| **ID Token** | 사용자 속성(email, name 등) | 사용자 신원 확인, REST API Cognito Authorizer 기본값 |
| **Access Token** | 스코프·그룹 | API 접근 권한, HTTP API JWT Authorizer |
| **Refresh Token** | (불투명) | 만료된 ID/Access Token 재발급, 최대 10년 |

> 💡 **관련 이론**: Cognito의 JWT는 인터넷 표준 **RFC 7519(JSON Web Token)** 를 따른다. 토큰은 `header.payload.signature` 세 부분이 점으로 이어진 Base64URL 문자열이고, 서명은 User Pool의 비대칭 키(RS256)로 만들어진다. 검증하는 쪽은 Cognito가 공개한 JWKS(JSON Web Key Set) 엔드포인트에서 공개키를 받아 서명을 확인하는데, 이 구조 덕분에 **검증에 Cognito를 호출할 필요가 없다** — 공개키만 캐싱해두면 오프라인으로도 서명·만료·issuer를 검증할 수 있다. 이게 JWT가 세션 토큰보다 확장성에서 유리한 핵심 이유다. 상위 표준으로는 인증 계층을 정의한 **OpenID Connect(OIDC)** 가 있고, Cognito User Pool은 OIDC 호환 IdP로 동작한다.

> 🔍 **더 깊이**: REST API(API Gateway)의 Cognito Authorizer는 기본적으로 **ID Token** 을 받지만, HTTP API의 JWT Authorizer는 보통 **Access Token** 을 검증한다. 이 미묘한 차이가 시험 단골이다. ID Token은 "누구인가"(사용자 속성)에, Access Token은 "무엇을 할 수 있는가"(scope, groups)에 초점이 있다. OAuth 2.0의 원래 설계 철학상 API 인가에는 Access Token을 쓰는 게 정석이라, HTTP API가 Access Token을 기본으로 두는 것이 더 표준에 가깝다. 또 User Pool은 PreSignUp, PostConfirmation, PreTokenGeneration 등 **11종의 Lambda 트리거** 로 인증 흐름에 커스텀 로직(도메인 화이트리스트, 토큰에 커스텀 클레임 주입 등)을 끼워 넣을 수 있다.

> ⚠️ **함정**: 로그인 흐름 `USER_SRP_AUTH`와 `USER_PASSWORD_AUTH`를 혼동하면 안 된다. SRP(Secure Remote Password, **RFC 2945** 계열)는 비밀번호를 네트워크로 절대 보내지 않고 영지식 증명에 가까운 방식으로 인증하므로 더 안전하다. `USER_PASSWORD_AUTH`는 비밀번호를 (TLS 위로) 전송하므로 레거시 마이그레이션 같은 제한적 상황에서만 쓴다. "가장 안전한 인증 흐름"을 물으면 SRP다.

## 엣지 방어: WAF와 Shield의 분업

WAF와 Shield는 둘 다 "외부의 악의적 트래픽"을 막지만 노리는 위협이 다르다. **WAF는 L7 콘텐츠** 를, **Shield는 L3/L4 볼륨** 을 본다. WAF는 SQL 인젝션·XSS·잘못된 요청 패턴·과도한 요청 빈도(rate-based rule)를 규칙으로 거르고, Shield는 대량의 패킷으로 대역폭이나 연결 테이블을 고갈시키는 DDoS를 흡수한다.

| 항목 | Shield Standard | Shield Advanced |
|------|-----------------|-----------------|
| 비용 | 무료(자동) | $3,000/월 + 데이터 |
| 방어 계층 | L3/L4 | L3/L4/L7 |
| 비용 보호 | 없음 | DDoS 급증 비용 크레딧 |
| 대응팀 | 없음 | SRT(Shield Response Team) 24/7 |
| WAF 연동 | 별도 | 통합·자동 규칙 |

> 📚 **사례**: 2020년 2월 AWS는 분당 2.3Tbps에 달하는, 당시 기록상 최대 규모의 DDoS 공격을 Shield로 흡수했다고 공개했다. 이 공격은 CLDAP(Connection-less LDAP) 리플렉션 기법으로 증폭됐는데, 공격자가 출발지 IP를 피해자로 위조해 LDAP 서버에 작은 요청을 보내면 서버가 수십 배 큰 응답을 피해자에게 쏟아붓는 방식이다. 핵심 교훈은 이런 볼류메트릭 공격은 **개별 애플리케이션이 자력으로 막을 수 없다** 는 점이다 — AWS 백본 수준의 흡수 용량이 필요하다. 이게 Shield가 EC2가 아니라 CloudFront·ALB·Route 53 같은 엣지 서비스 앞단에 붙는 이유이고, "엣지에 트래픽을 모아 흡수하라"는 DDoS 방어의 기본 원칙이기도 하다.

> 🔍 **더 깊이**: WAF의 **rate-based rule** 은 5분 슬라이딩 윈도우로 같은 IP의 요청 수를 세어 임계치를 넘으면 차단한다. 여기서 자주 놓치는 점은, WAF가 **HTTP API(API Gateway v2)에는 직접 붙지 않는다** 는 것이다 — REST API(v1), ALB, CloudFront, AppSync에는 붙지만 HTTP API는 지원 대상이 아니다. 그래서 HTTP API를 WAF로 보호하려면 앞에 CloudFront를 두는 우회가 필요하다. 또 WAF 규칙 액션에는 Block 외에 **Count** 모드가 있는데, 차단 없이 매칭 건수만 기록해 새 규칙을 프로덕션에 적용하기 전에 오탐(false positive)을 안전하게 측정하는 용도다.

## 전송 암호화: ACM의 리전 제약과 설치 불가 원칙

ACM은 무료로 공개 SSL/TLS 인증서를 발급·자동 갱신한다. 두 가지가 시험 포인트다. 첫째, **CloudFront에 쓰는 인증서는 반드시 us-east-1(버지니아 북부)에서 발급** 해야 한다 — CloudFront가 전역 서비스라 인증서를 글로벌 컨트롤 플레인이 있는 us-east-1에서만 읽기 때문이다. ALB 같은 리전 서비스는 해당 리전에서 발급한 인증서를 쓴다. 둘째, **ACM 공개 인증서는 EC2에 직접 설치할 수 없다** — 개인키를 추출할 수 없도록 막아놨기 때문에, CloudFront·ALB·API Gateway 같은 AWS 관리형 서비스에 연결하는 방식으로만 쓴다.

> 💡 **관련 이론**: ACM이 개인키를 내보내지 못하게 하는 설계는 Day 41의 KMS가 키 재료를 추출 못 하게 한 것과 정확히 같은 **키 격리** 철학이다. 인증서의 개인키가 한 번도 사용자 손에 닿지 않으면 유출될 표면이 사라진다. TLS 자체는 인터넷 표준 **RFC 8446(TLS 1.3)** 으로 정의되며, 핸드셰이크에서 서버가 인증서로 신원을 증명하고 키 교환으로 세션 키를 합의하는데, ACM은 이 인증서의 라이프사이클(발급·검증·갱신)을 자동화해준다. 내부망 전용 인증서가 필요하면 **ACM Private CA**(월 $400)로 사설 인증 기관을 운영해 mTLS 같은 시나리오를 지원한다.

> ⚠️ **함정**: "EC2 웹서버에 ACM 인증서를 설치하라"는 선택지는 항상 오답이다. EC2에서 TLS를 종료하려면 직접 인증서를 nginx 등에 설치해야 하는데 ACM 공개 인증서는 그게 불가능하다. EC2 앞에 ALB를 두고 ALB에 ACM 인증서를 붙이는 것이 정답 패턴이다. "관리형 서비스에만 연결 가능"을 기억하면 이 함정을 피한다.

## Macie와 GuardDuty: 탐지의 두 방향

마지막으로 데이터 보호의 탐지 계층을 짚는다. **Macie는 S3 안의 민감 데이터(PII)** 를 머신러닝으로 찾아내고, **GuardDuty는 계정 전반의 위협 활동** — 비정상 API 호출, 알려진 악성 IP와의 통신, 크립토마이닝 패턴 — 을 CloudTrail·VPC Flow Logs·DNS 로그로 탐지한다. 하나는 "무엇이 저장돼 있나(데이터 중심)", 다른 하나는 "무슨 일이 벌어지고 있나(행위 중심)"를 본다.

> 📚 **사례**: 2019년 Capital One 침해는 1억 명 이상의 개인정보가 유출된 대형 사건으로, 잘못 구성된 WAF가 SSRF(Server-Side Request Forgery) 공격에 악용돼 EC2 인스턴스의 메타데이터 서비스에서 IAM 자격 증명이 탈취된 것이 원인이었다. 공격자는 그 자격으로 S3 버킷의 데이터를 통째로 빼냈다. 이 사건은 여러 계층의 교훈을 동시에 준다 — WAF 규칙의 오구성, 과도한 IAM 권한, 그리고 만약 GuardDuty가 비정상적 S3 대량 접근을, Macie가 그 버킷에 PII가 있음을 미리 알렸다면 탐지·차단이 빨랐으리란 점이다. 이 사건 이후 AWS가 인스턴스 메타데이터 서비스 v2(IMDSv2, 세션 토큰 요구)를 도입한 것도 SSRF 방어를 강화하기 위해서였다.

## 정리하며

Week 9의 일곱 서비스는 따로 외우는 카드가 아니라, 한 요청이 인터넷에서 데이터까지 가는 길에 놓인 검문소들이다. Shield가 양을, WAF가 내용을, Cognito가 신원을, IAM이 권한을, ACM이 전송을, Secrets Manager가 비밀을, KMS가 그 비밀의 키를 지킨다. 시험 함정은 늘 인접한 두 서비스의 경계 — User Pool vs Identity Pool, Secrets Manager vs Parameter Store, Shield Standard vs Advanced, WAF L7 vs NACL L4 — 에 숨어 있다. 각 경계가 "어느 위협 모델, 어느 OSI 계층, 어느 비용 모델"에서 갈리는지를 한 문장으로 말할 수 있으면, 아래 시나리오들은 대부분 즉답이 된다.

---

## 📝 연습 문제

**문제 1.** 모바일 앱이 Cognito로 사용자를 로그인시킨 뒤, 그 사용자가 자기 전용 S3 폴더에 사진을 직접 업로드해야 한다. 올바른 흐름은?

A) User Pool JWT를 그대로 S3 요청 헤더에 넣어 접근

B) User Pool로 로그인 → Identity Pool에 JWT 제출 → IAM 임시 자격 증명 → S3 직접 접근

C) Lambda를 거쳐 S3에 업로드

D) API Gateway 프록시를 통해서만 가능

**정답: B**

해설: User Pool은 인증(누구인가)을 담당해 JWT를 발급할 뿐, AWS 리소스 접근 권한은 주지 않는다. S3에 직접 접근하려면 그 JWT를 Identity Pool에 제출해 IAM 임시 자격 증명으로 교환해야 한다. A)는 JWT를 S3가 이해하지 못하므로 불가능 — S3는 SigV4 서명된 IAM 자격을 요구한다. C·D)는 동작은 하지만 "직접 접근"이라는 요구를 충족하지 못하고 불필요한 중간 계층을 추가한다. Identity Pool의 역할은 "JWT를 IAM 자격으로 바꾸는 인가 브로커"임을 기억한다.

---

**문제 2.** RDS 프로덕션 자격 증명을 30일마다 **무중단** 으로 회전해야 한다. 가장 적합한 구성은?

A) Parameter Store SecureString + EventBridge 스케줄

B) Secrets Manager + Single-User 회전 전략

C) Secrets Manager + Alternating-Users 회전 전략

D) Lambda로 직접 비밀번호 변경 로직 구현

**정답: C**

해설: Parameter Store는 자동 회전 기능 자체가 없으므로 A)는 탈락이다. Secrets Manager는 회전을 내장하는데, **Single-User** 는 한 사용자의 비밀번호를 바꾸므로 전환 순간 짧은 틈이 생길 수 있는 반면 **Alternating-Users** 는 두 DB 사용자를 번갈아 갱신해 다운타임이 사실상 없다. "무중단"이 핵심 요구이므로 C)가 정답이다. D)는 회전의 네 단계(createSecret/setSecret/testSecret/finishSecret)와 롤백 안전장치를 직접 재구현하는 안티패턴이다.

---

**문제 3.** 웹 애플리케이션이 SQL 인젝션과 XSS 공격을 받고 있다. 이를 탐지·차단할 가장 적합한 서비스는?

A) Security Group

B) Network ACL

C) AWS WAF

D) Shield Standard

**정답: C**

해설: SQL 인젝션·XSS는 HTTP 요청 본문/파라미터(L7) 안에 숨는 공격이다. Security Group(L4 상태 기반)과 NACL(L3/L4 IP·포트)은 패킷의 IP·포트만 보므로 페이로드 내용을 검사할 수 없다. Shield는 볼류메트릭 DDoS(L3/L4)를 흡수하지 가용성 공격이지 주입 공격을 막는 도구가 아니다. WAF만이 HTTP 레이어의 콘텐츠를 규칙으로 검사해 SQL/XSS 패턴을 차단한다. "어느 OSI 계층의 공격인가"를 먼저 판단하면 즉답이다.

---

**문제 4.** 15MB 설정 파일을 KMS로 암호화해 S3에 저장하려 한다. 올바른 접근은?

A) `kms:Encrypt` API로 파일을 직접 암호화

B) `GenerateDataKey`로 데이터 키를 받아 로컬에서 봉투 암호화

C) Secrets Manager에 파일 전체를 저장

D) Parameter Store 표준 파라미터에 저장

**정답: B**

해설: `kms:Encrypt`의 직접 암호화 한도는 4KB라 15MB에는 쓸 수 없다(A 탈락). 봉투 암호화로 `GenerateDataKey`를 호출해 평문 DEK와 암호화된 DEK를 동시에 받고, 평문 DEK로 파일을 로컬에서 암호화한 뒤 평문 DEK를 폐기한다. C) Secrets Manager 한도는 64KB라 15MB를 못 담는다. D) Parameter Store 표준은 4KB, 고급도 8KB라 불가능하다. 대용량 데이터 암호화는 항상 봉투 암호화가 정답이다.

---

**문제 5.** REST API(API Gateway v1)에 Cognito Authorizer를 붙이면 기본적으로 어떤 토큰을 검증하는가?

A) Access Token

B) ID Token

C) Refresh Token

D) IAM 임시 자격 증명

**정답: B**

해설: REST API의 Cognito Authorizer는 기본적으로 **ID Token** 을 검증한다(사용자 신원 속성 중심). 반면 HTTP API(v2)의 JWT Authorizer는 보통 Access Token(scope·groups 중심)을 검증한다. 이 둘의 기본값 차이가 시험 단골이다. C) Refresh Token은 만료된 토큰을 재발급받는 용도이지 API 인가에 직접 쓰지 않는다. D) IAM 임시 자격은 Identity Pool이 발급하는 것으로 Authorizer 검증 대상이 아니다.

---

**문제 6.** CloudFront 배포에 HTTPS를 적용하려 한다. ACM 인증서는 어느 리전에서 발급해야 하며, EC2에 직접 설치할 수 있는가?

A) 배포가 속한 리전 / 설치 가능

B) us-east-1 / 설치 불가

C) 아무 리전 / 설치 가능

D) us-west-2 / 설치 불가

**정답: B**

해설: CloudFront는 전역 서비스라 인증서를 글로벌 컨트롤 플레인이 있는 **us-east-1** 에서만 읽는다. 따라서 다른 리전에서 발급한 인증서는 CloudFront에 붙일 수 없다. 또 ACM 공개 인증서는 개인키를 추출할 수 없게 막아두어 **EC2에 직접 설치가 불가능** 하다 — CloudFront·ALB·API Gateway 같은 관리형 서비스에 연결하는 방식으로만 쓴다. EC2에서 TLS가 필요하면 앞에 ALB를 두고 ALB에 ACM 인증서를 붙인다.

---

**문제 7.** DDoS 공격으로 Auto Scaling이 대량 확장돼 청구액이 급증했다. 이 추가 비용을 크레딧으로 보호받으려면?

A) Shield Standard

B) Shield Advanced

C) WAF rate-based rule

D) CloudFront 캐싱 강화

**정답: B**

해설: DDoS로 인한 스케일링 비용 급증에 대해 **크레딧을 제공하는 것은 Shield Advanced 뿐** 이다($3,000/월). Standard는 무료지만 비용 보호와 SRT 지원이 없다. C) WAF rate-based rule은 L7 요청 빈도를 줄여 공격 자체를 완화하는 데 도움은 되지만 비용 환급과는 무관하다. D) 캐싱은 오리진 부하를 줄일 뿐 청구액 보호 기능이 아니다. "DDoS 비용 보호"라는 키워드가 보이면 Shield Advanced가 정답이다.

---

**문제 8.** HTTP API(API Gateway v2) 앞에 WAF를 붙여 SQL 인젝션을 막으려 한다. 그런데 WAF가 직접 연결되지 않는다. 올바른 해법은?

A) HTTP API 대신 NACL로 차단

B) HTTP API 앞에 CloudFront를 두고 CloudFront에 WAF 연결

C) Shield Advanced로 대체

D) Security Group 규칙 추가

**정답: B**

해설: WAF는 REST API(v1)·ALB·CloudFront·AppSync에는 붙지만 **HTTP API(v2)에는 직접 연결되지 않는다.** 그래서 HTTP API를 WAF로 보호하려면 앞에 CloudFront 배포를 두고 CloudFront에 WAF를 연결하는 우회 패턴을 쓴다. A·D) NACL/SG는 L4까지만 보므로 L7 SQL 인젝션을 못 막는다. C) Shield는 DDoS용이지 주입 공격 차단 도구가 아니다. "HTTP API + WAF"의 비호환은 자주 나오는 함정이다.

---

**문제 9.** 비밀번호를 네트워크로 전송하지 않는 가장 안전한 Cognito 인증 흐름은?

A) `USER_PASSWORD_AUTH`

B) `ADMIN_USER_PASSWORD_AUTH`

C) `USER_SRP_AUTH`

D) `CUSTOM_AUTH`

**정답: C**

해설: `USER_SRP_AUTH`는 SRP(Secure Remote Password) 프로토콜을 사용해 비밀번호를 네트워크로 보내지 않고 인증한다 — 클라이언트와 서버가 비밀번호 자체를 교환하지 않고 증명만 주고받는 방식이라 가장 안전하다. A·B) `*_PASSWORD_AUTH` 계열은 비밀번호를 (TLS 위로) 전송하므로 레거시·관리자 시나리오에만 제한적으로 쓴다. D) `CUSTOM_AUTH`는 Lambda 트리거로 커스텀 챌린지를 구현하는 흐름이지 "비밀번호 미전송"을 보장하는 표준 흐름은 아니다.

---

**문제 10.** S3 버킷에 고객 개인정보(PII)가 실수로 저장됐는지 자동으로 발견하고 싶다. 적합한 서비스는?

A) GuardDuty

B) Macie

C) Inspector

D) Config

**정답: B**

해설: **Macie** 는 머신러닝으로 S3 객체를 스캔해 신용카드 번호·주민번호 같은 PII와 민감 데이터를 자동 식별한다(데이터 중심 탐지). A) GuardDuty는 비정상 API 호출·악성 IP 통신 등 계정 행위 기반 위협을 탐지하지 데이터 내용을 분류하지 않는다. C) Inspector는 EC2/컨테이너의 취약점·CVE를 스캔한다. D) Config는 리소스 구성 규정 준수를 추적한다. "S3 안의 PII 발견"이면 Macie가 정답이다.

---

**문제 11.** 규제상 암호화 키를 **전용 하드웨어** 에 보관하고 AWS도 키 재료에 접근하지 못해야 한다. 또한 기존 KMS API 호환성도 유지하고 싶다. 적합한 선택은?

A) KMS Customer Managed Key

B) KMS AWS Managed Key

C) CloudHSM을 KMS custom key store로 연결

D) Secrets Manager에 키를 저장

**정답: C**

해설: KMS 기본 키는 멀티테넌트 HSM(논리적 격리) 위에서 동작하므로 "전용 HW + AWS도 접근 불가"라는 강한 규제 요구를 단독으로는 못 채운다(A·B 탈락). CloudHSM은 싱글테넌트 전용 HW(FIPS 140-2 Level 3)이고, 이를 KMS의 **custom key store** 로 연결하면 키 재료는 전용 HW에 보관하면서도 친숙한 KMS API를 그대로 쓸 수 있어 두 요구를 동시에 만족한다. D) Secrets Manager는 비밀 저장 서비스이지 키 격리 HW가 아니다.

---

**문제 12.** 새로 만든 WAF 규칙을 프로덕션에 적용하기 전에, 정상 트래픽을 잘못 차단하지 않는지(오탐) 안전하게 측정하려 한다. 가장 적합한 방법은?

A) 규칙 액션을 Block으로 두고 로그 관찰

B) 규칙 액션을 Count로 두고 매칭 건수 관찰

C) 규칙을 비활성화한 채 CloudWatch 알람 설정

D) Shield Advanced로 대체 검증

**정답: B**

해설: WAF 규칙 액션의 **Count** 모드는 트래픽을 차단하지 않고 규칙에 매칭된 건수만 기록한다. 새 규칙을 Count로 먼저 돌려 정상 요청이 얼마나 잡히는지(오탐 비율) 측정한 뒤, 안전이 확인되면 Block으로 승격하는 것이 표준 운영 패턴이다. A)는 검증 단계에서 실제 사용자를 차단해버려 위험하다. C) 비활성 규칙은 매칭 통계를 만들지 않는다. D) Shield는 DDoS용이라 WAF 규칙 검증과 무관하다. "WAF 규칙 안전 검증"이면 Count 모드가 정답이다.
