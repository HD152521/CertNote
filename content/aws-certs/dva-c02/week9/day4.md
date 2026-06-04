# Day 44 - WAF, Shield, ACM: 트래픽이 앱에 닿기 전에 거르는 세 겹

보안에는 두 갈래의 사고방식이 있다. 하나는 "안에서 잘 막자" — 입력을 검증하고, 쿼리를 파라미터화하고, 출력을 이스케이프하는 애플리케이션 레벨 방어다. 다른 하나는 "밖에서 미리 거르자" — 악성 트래픽이 애플리케이션에 닿기 전에 네트워크 가장자리에서 차단하는 엣지 레벨 방어다. 둘 다 필요하다. 애플리케이션 방어만 있으면 DDoS 한 방에 서버가 마비되고, 엣지 방어만 있으면 정교한 로직 공격이 통과한다. AWS의 WAF·Shield·ACM은 이 "밖에서 미리 거르는" 엣지 방어 계층을 각각 다른 위협에 대해 담당한다 — WAF는 7계층 애플리케이션 공격을, Shield는 3·4계층 DDoS를, ACM은 전송 암호화(TLS)를.

DVA-C02 시험에서 이 셋은 "어느 위협에 어느 서비스"를 가르는 분류 문제로 나온다. SQL 인젝션은 WAF, DDoS 비용 폭증은 Shield Advanced, CloudFront HTTPS 인증서는 us-east-1의 ACM — 이런 매핑이 핵심이다. 이번 글은 각 서비스가 OSI 모델의 어느 층을 방어하는지, WAF 규칙이 어떤 순서로 평가되는지, Shield Standard와 Advanced를 가르는 진짜 기준이 무엇인지, 그리고 ACM이 EC2에는 왜 안 되는지를 본다.

## OSI 계층으로 보는 방어 분담

세 서비스를 이해하는 가장 빠른 길은 OSI 7계층 모델 위에 올려놓는 것이다.

| 서비스 | 방어 계층 | 막는 위협 |
|--------|-----------|-----------|
| **Shield** | L3(네트워크) / L4(전송) | SYN flood, UDP reflection 등 볼륨 기반 DDoS |
| **WAF** | L7(애플리케이션) | SQL injection, XSS, 봇, 비정상 요청 패턴 |
| **ACM** | L6/L7(표현/세션, TLS) | 전송 구간 도청·변조(암호화로 방어) |

> 💡 **관련 이론**: DDoS 공격이 OSI 계층별로 다른 이유를 알면 왜 Shield와 WAF가 분리됐는지 보인다. L3/L4 공격(SYN flood)은 "TCP 핸드셰이크를 절반만 열어 연결 테이블을 고갈"시키는 식으로 **프로토콜 자체의 약점**을 노린다 — 요청 내용은 무의미하고 양으로 승부한다. 반면 L7 공격(HTTP flood, 느린 POST)은 "정상처럼 보이는 HTTP 요청"을 대량으로 보내 애플리케이션 처리 능력을 고갈시킨다 — 내용을 봐야 정상/악성을 구분할 수 있다. 그래서 양으로 승부하는 L3/L4는 네트워크 가장자리에서 패턴으로 흡수(Shield)하고, 내용을 봐야 하는 L7은 요청을 파싱해 규칙으로 거른다(WAF). 위협의 성격이 다르니 도구도 다르다.

## WAF: 요청을 파싱해 규칙으로 거르는 7계층 방화벽

WAF(Web Application Firewall)는 HTTP/HTTPS 요청을 파싱해 규칙(Rule)에 맞으면 동작(Action)을 적용한다. 규칙은 Web ACL(Access Control List)에 모여 있고, 위에서 아래로 우선순위 순서대로 평가된다.

| 규칙 유형 | 무엇을 보는가 |
|-----------|---------------|
| **IP Set** | 출발지 IP(CIDR) 허용/차단 |
| **Geo Match** | 출발지 국가 |
| **String/Regex Match** | URL·헤더·바디의 문자열·패턴 |
| **SQLi Match** | SQL 인젝션 패턴 자동 탐지 |
| **XSS Match** | 크로스사이트 스크립팅 패턴 |
| **Size Constraint** | 요청 구성요소 크기 |
| **Rate-based** | IP당 5분간 요청 수 |
| **Managed Rules** | OWASP Top 10, IP Reputation 등 AWS/파트너 사전 정의 |

동작(Action)은 다섯 가지다.

| Action | 동작 |
|--------|------|
| **Allow** | 통과 |
| **Block** | 차단(커스텀 4xx 응답 가능) |
| **Count** | 차단하지 않고 카운트만(테스트용) |
| **CAPTCHA** | 사람 검증 퍼즐 표시 |
| **Challenge** | 백그라운드 JS 챌린지(봇 자동 필터) |

> 🔍 **더 깊이**: **Count 모드**가 운영에서 결정적으로 중요하다. 새 규칙을 바로 Block으로 켜면 잘못된 규칙이 정상 사용자까지 막아 장애를 낸다. Count 모드로 먼저 배포하면 차단은 하지 않고 "이 규칙에 걸렸을 요청"만 CloudWatch 메트릭·샘플 로그로 기록한다. 며칠 관찰해 오탐(false positive)이 없는지 확인한 뒤 Block으로 승격한다. 방화벽 규칙을 "관찰 → 검증 → 시행"의 단계로 배포하는 이 패턴은 IDS의 "monitor mode → prevent mode" 전환과 같은 사고방식이다. 시험에서 "규칙을 테스트하되 트래픽에 영향을 주지 않으려면?"의 답이 Count 모드다.

> 💡 **관련 이론**: **Rate-based Rule**은 토큰 버킷이 아니라 슬라이딩 윈도우 카운터로 동작한다 — IP별로 직전 5분간 요청 수를 세어 임계치를 넘으면 차단한다. 이게 애플리케이션 레벨 rate limiting(예: API Gateway throttling)과 다른 점은 **출발지 IP 단위로 자동 추적**한다는 것이다. 브루트포스 로그인이나 스크래핑처럼 "정상 요청을 한 IP가 비정상적으로 많이" 보내는 패턴을 거른다. 단 NAT 뒤의 여러 사용자가 한 IP를 공유하면 임계치를 공유하므로, 사내망 같은 환경에서는 오탐이 날 수 있다.

WAF를 붙일 수 있는 리소스에는 함정이 있다.

| 리소스 | WAF 지원 |
|--------|----------|
| CloudFront | 지원(Global scope, us-east-1) |
| ALB | 지원(Regional) |
| API Gateway **REST** | 지원(Regional) |
| API Gateway **HTTP** | **미지원** |
| AppSync | 지원 |
| Cognito User Pool | 지원(2022~) |
| NLB | **미지원**(L4라 HTTP 파싱 불가) |

> ⚠️ **함정**: API Gateway **HTTP API**는 WAF를 직접 붙일 수 없다. WAF가 필요하면 앞에 CloudFront를 두고 거기에 붙여야 한다. NLB도 L4 로드밸런서라 HTTP를 파싱하지 않으므로 WAF 대상이 아니다. "HTTP API에 WAF" 또는 "NLB에 WAF"가 보기에 있으면 함정이다. WAF는 L7 도구라 HTTP를 이해하는 리소스(CloudFront·ALB·REST API·AppSync)에만 붙는다.

## Shield: 자동 무료 방어와 유료 강화 방어

Shield는 두 등급이다. **Standard**는 모든 AWS 고객에게 자동·무료로 적용되는 L3/L4 DDoS 방어다 — 별도 설정 없이 EC2·ELB·CloudFront·Route 53이 SYN/UDP flood로부터 보호된다. **Advanced**는 월 $3,000의 유료 서비스로, 단순히 "더 강한 방어"가 아니라 몇 가지 결정적 부가 가치를 더한다.

| 항목 | Standard | Advanced |
|------|----------|----------|
| 비용 | 무료 | $3,000/월 |
| 계층 | L3/L4 | L3/L4/L7 |
| 보호 대상 | 자동(모든 리소스) | 명시 등록(CloudFront, ALB, NLB, EIP, R53, Global Accelerator) |
| **DDoS 비용 보호** | 없음 | **있음**(공격으로 늘어난 비용 크레딧) |
| **SRT 지원** | 없음 | **24/7 Shield Response Team** |
| WAF 비용 | 별도 | 포함 |
| 실시간 가시성 | 없음 | 있음 |

> ⚠️ **함정**: Shield Advanced를 고르는 가장 명확한 신호는 **"DDoS 비용 보호"** 다. DDoS 공격을 받으면 Auto Scaling이 트래픽에 반응해 인스턴스를 늘리거나 CloudFront 데이터 전송이 폭증해 청구서가 치솟는다. Shield Advanced는 이렇게 공격으로 늘어난 AWS 비용을 크레딧으로 돌려준다. 시험에서 "DDoS로 인한 비용 급증을 보호" 또는 "24/7 전문가 대응이 필요"가 보이면 Advanced다. 단순 "기본 DDoS 방어"는 Standard(무료)로 충분하다.

> 💡 **관련 이론**: Shield Response Team(과거 명칭 DRT, DDoS Response Team)은 Advanced의 사람-개입(human-in-the-loop) 요소다. 대규모·정교한 공격은 자동 방어만으로 못 막고, AWS 보안 전문가가 실시간으로 WAF 규칙을 조정하고 트래픽 패턴을 분석해야 하는 경우가 있다. 이건 도구가 아니라 서비스 계약의 일부다 — "공격받을 때 전화할 곳"이 있다는 운영적 안심이 $3,000의 일부 값이다. 자동화로 다 안 되는 영역에 전문 인력을 묶어 파는 모델은 엔터프라이즈 보안의 흔한 패턴이다.

여러 계정에 걸쳐 WAF/Shield Advanced를 중앙 관리하려면 **Firewall Manager**(AWS Organizations 필요)를 쓴다. 새로 만들어지는 리소스에 정책을 자동 적용해, 조직 전체의 방어 일관성을 강제한다.

## ACM: TLS 인증서를 무료로, 단 AWS 서비스에만

ACM(AWS Certificate Manager)은 SSL/TLS 인증서를 무료로 발급·자동 갱신한다. 핵심 제약이 하나 있는데, 이게 시험의 단골이다.

> ⚠️ **함정**: ACM 인증서는 **EC2에 직접 설치할 수 없다**. ACM은 인증서의 개인키(private key)를 export하지 못하게 막기 때문이다 — 개인키가 ACM 경계를 벗어나지 않는다(KMS가 키 재료를 안 내보내는 것과 같은 철학). EC2에 직접 TLS를 종료하려면 개인키 파일이 인스턴스에 있어야 하는데, ACM은 그 파일을 주지 않는다. 그래서 EC2 앞에 ALB/CloudFront를 두고 거기서 TLS를 종료(ACM 인증서 사용)하거나, EC2에는 Let's Encrypt 등으로 별도 인증서를 깔아야 한다. "EC2에 ACM 인증서 직접 설치"는 항상 오답이다.

ACM이 적용되는 서비스: CloudFront, ALB, NLB, API Gateway, App Runner, App Mesh, Cognito, Elastic Beanstalk. 공통점은 모두 **AWS가 관리하는 종단점**이라 개인키를 export하지 않아도 ACM이 내부적으로 TLS를 종료할 수 있다는 것이다.

> ⚠️ **함정**: CloudFront에 쓸 ACM 인증서는 **반드시 us-east-1(버지니아 북부)에서 발급**해야 한다. CloudFront가 글로벌 엣지 서비스이고 그 제어 평면이 us-east-1에 있기 때문이다. ap-northeast-2에서 만든 인증서는 CloudFront에 못 붙인다. 반면 Regional 리소스(ALB 등)는 그 리소스와 같은 리전의 ACM 인증서를 써야 한다. "CloudFront HTTPS 인증서 리전"이 보이면 무조건 us-east-1이다.

검증 방식은 두 가지다.

| 방식 | 속도 | 자동 갱신 |
|------|------|-----------|
| **DNS 검증**(권장) | 빠름 | 자동(CNAME 유지 시) |
| **이메일 검증** | 느림 | 수동(만료마다 사람이) |

> 🔍 **더 깊이**: DNS 검증이 권장되는 핵심 이유는 **자동 갱신** 때문이다. ACM이 도메인 소유를 확인하는 CNAME 레코드를 한 번 DNS에 넣어두면, 인증서 만료가 다가올 때 ACM이 그 CNAME으로 소유를 재확인해 자동 갱신한다. 사람 개입이 전혀 없다. 이메일 검증은 만료마다 도메인 관리자에게 확인 메일이 가고 사람이 클릭해야 하므로, 깜빡하면 인증서가 만료돼 사이트가 죽는다 — "인증서 만료로 인한 장애"의 흔한 원인이다. Route 53을 쓰면 ACM이 CNAME을 자동으로 넣어줘 더 매끄럽다. mTLS·IoT·내부 서비스용 사설 인증서가 필요하면 ACM Private CA($400/월)를 쓴다.

## 함께 보는 엣지 방어 아키텍처

세 서비스는 보통 다음처럼 겹쳐 쌓인다.

```
[인터넷]
   │  ← Shield(Standard 자동 / Advanced 등록)가 L3/L4 DDoS 흡수
   ▼
[CloudFront]  ── ACM 인증서(us-east-1)로 HTTPS 종료
   │  ← WAF(Global scope)가 SQLi/XSS/Rate/Geo 차단
   ▼
[ALB]  ── ACM 인증서(같은 리전)로 HTTPS 종료
   │  ← WAF(Regional) 추가 가능
   ▼
[EC2 / Lambda / ECS]  ← 여기엔 ACM 직접 설치 불가
```

> 📚 **사례**: 한 서비스가 특정 국가에서 오는 봇 트래픽으로 백엔드가 마비됐다. 1차로 WAF Geo Match로 해당 국가를 Block 처리하려 했으나, 정상 사용자도 일부 있어 곧바로 차단하면 항의가 예상됐다. 그래서 ① 먼저 Geo 규칙을 **Count 모드**로 며칠 돌려 실제 트래픽 비율을 측정하고, ② 봇 패턴이 명확한 구간만 **Rate-based + Challenge**(JS 챌린지)로 거르고, ③ 명백한 악성 IP만 IP Set으로 Block했다. 단계적으로 적용해 오탐을 최소화하면서 봇을 걸러낸 것이다. "Block부터 켜지 말고 Count로 관찰하라"는 WAF 운영의 기본기를 보여주는 사례.

## 곁다리 보안 서비스 정리

시험에 가끔 끼어드는 탐지·조사 서비스들도 역할을 구분해두자.

| 서비스 | 무엇을 하는가 |
|--------|---------------|
| **Macie** | S3에 저장된 PII(개인정보)를 ML로 자동 탐지 |
| **GuardDuty** | CloudTrail/VPC Flow/DNS 로그로 계정 활동 이상 탐지 |
| **Inspector** | EC2·ECR 이미지의 취약점 스캔 |
| **Detective** | 보안 사고의 근본 원인 조사·분석 |
| **Security Hub** | 모든 보안 알림을 한 대시보드로 통합 |

> ⚠️ **함정**: "S3의 신용카드 번호·주민번호를 자동 발견"은 **Macie**, "비정상 API 호출·코인 채굴 탐지"는 **GuardDuty**, "EC2 패키지 취약점 스캔"은 **Inspector**다. 이름이 비슷해 헷갈리지만 보는 대상이 완전히 다르다 — Macie는 데이터(S3 내용), GuardDuty는 행위(로그), Inspector는 상태(취약점)다.

## 정리하며

WAF·Shield·ACM은 트래픽이 애플리케이션에 닿기 전 엣지에서 거르는 세 겹이다 — Shield는 L3/L4 DDoS를(Standard 무료/Advanced 비용보호·SRT), WAF는 L7 공격을(Count로 관찰 후 Block 승격), ACM은 TLS 암호화를(EC2 직접 설치 불가, CloudFront는 us-east-1) 맡는다. 위협의 OSI 계층이 다르니 도구가 나뉘었고, "DDoS 비용 보호 → Advanced", "SQLi/XSS → WAF", "CloudFront 인증서 → us-east-1" 같은 매핑이 시험의 뼈대다.

다음 글에서는 Week 9 전체(KMS·Secrets Manager·Cognito·WAF/Shield/ACM)를 시나리오 문제로 묶어 복습한다.

---

## 📝 연습 문제

**문제 1.** 웹 애플리케이션에 대한 SQL 인젝션 공격을 요청 단계에서 탐지·차단하려 한다. 적합한 서비스는?

A) Shield Advanced
B) AWS WAF
C) Network ACL
D) Security Group

**정답: B**

해설: SQL 인젝션은 L7(애플리케이션) 공격으로, HTTP 요청의 쿼리·바디 내용을 파싱해야 탐지된다. WAF의 SQLi Match 규칙(또는 Managed Rules의 SQL database rule set)이 이를 담당한다. A) Shield는 L3/L4 DDoS 방어라 요청 내용을 보지 않는다. C·D) NACL과 Security Group은 L3/L4 IP·포트 필터링이라 HTTP 페이로드를 검사하지 못한다. "내용 기반 웹 공격 차단"이 보이면 WAF다.

---

**문제 2.** DDoS 공격으로 Auto Scaling과 데이터 전송이 폭증해 AWS 청구서가 급증할 위험을 보호받고, 24/7 전문가 대응도 받으려 한다. 적합한 선택은?

A) Shield Standard
B) Shield Advanced
C) WAF Rate-based Rule
D) CloudFront만 추가

**정답: B**

해설: Shield Advanced는 ① DDoS로 늘어난 AWS 비용을 크레딧으로 돌려주는 **비용 보호**와 ② 24/7 **Shield Response Team(SRT)** 대응을 제공한다. 이 두 가지가 Standard와 Advanced를 가르는 결정적 차이다. A) Standard는 무료 기본 방어이지만 비용 보호·SRT가 없다. C) Rate-based Rule은 L7 요청 제한이라 L3/L4 볼륨 DDoS와 비용 보호를 다루지 못한다. "DDoS 비용 보호" 또는 "24/7 전문가"가 보이면 Advanced다.

---

**문제 3.** CloudFront 배포에 HTTPS를 적용하기 위한 ACM 인증서는 어느 리전에서 발급해야 하는가?

A) 배포의 origin이 있는 리전
B) ap-northeast-2
C) us-east-1
D) 아무 리전이나 가능

**정답: C**

해설: CloudFront는 글로벌 엣지 서비스이고 제어 평면이 **us-east-1**에 있어, CloudFront에 붙일 ACM 인증서는 반드시 us-east-1에서 발급해야 한다. 다른 리전에서 만든 인증서는 CloudFront에 연결되지 않는다. 반면 ALB 같은 Regional 리소스는 그 리소스와 같은 리전의 ACM 인증서를 쓴다. "CloudFront 인증서 리전"은 항상 us-east-1이다.

---

**문제 4.** EC2 인스턴스에서 직접 TLS를 종료하기 위해 ACM 인증서를 설치하려 한다. 결과는?

A) 정상적으로 설치 가능하다
B) ACM은 개인키를 export하지 못해 EC2 직접 설치가 불가능하다
C) us-east-1에서 발급하면 가능하다
D) Private CA를 쓰면 가능하다

**정답: B**

해설: ACM은 인증서의 개인키를 export하지 못하게 막는다(키 재료가 ACM 경계를 벗어나지 않음). EC2에서 직접 TLS를 종료하려면 개인키 파일이 인스턴스에 있어야 하는데 ACM은 이를 주지 않으므로 직접 설치가 불가능하다. 대신 EC2 앞에 ALB/CloudFront를 두고 거기서 ACM으로 TLS를 종료하거나, EC2에 Let's Encrypt 등 별도 인증서를 설치해야 한다. ACM은 AWS 관리형 종단점에만 쓰인다.

---

**문제 5.** 새로운 WAF 규칙을 배포하되, 정상 사용자 트래픽에 영향을 주지 않으면서 규칙이 어떤 요청에 걸리는지 먼저 관찰하려 한다. 어떤 Action을 사용해야 하는가?

A) Block
B) Allow
C) Count
D) CAPTCHA

**정답: C**

해설: Count 모드는 요청을 차단하지 않고 "이 규칙에 걸렸을 요청"만 CloudWatch 메트릭·샘플 로그로 기록한다. 신규 규칙을 Count로 며칠 관찰해 오탐이 없음을 확인한 뒤 Block으로 승격하는 것이 안전한 운영 패턴이다. A) Block은 바로 차단해 오탐 시 정상 사용자가 막힌다. B) Allow는 통과시키며 관찰 기능이 아니다. D) CAPTCHA는 사람 검증을 강제한다. "규칙 테스트 + 트래픽 무영향"이 보이면 Count다.

---

**문제 6.** API Gateway **HTTP API** 앞에 WAF를 붙여 SQL 인젝션을 막으려 한다. 그러나 직접 연결되지 않는다. 올바른 해결책은?

A) HTTP API를 REST API로 변경하는 것 외엔 방법이 없다
B) HTTP API 앞에 CloudFront를 두고 CloudFront에 WAF를 연결
C) NLB를 앞에 두고 WAF 연결
D) Security Group으로 SQL 패턴 차단

**정답: B**

해설: API Gateway HTTP API는 WAF를 직접 지원하지 않는다. 해결책은 HTTP API 앞에 CloudFront 배포를 두고 CloudFront에 WAF Web ACL을 붙이는 것이다(REST API는 WAF 직접 지원). C) NLB는 L4라 HTTP를 파싱하지 못해 WAF 대상이 아니다. D) Security Group은 IP/포트 필터링이라 SQL 패턴을 못 본다. A) REST API 전환 외에도 CloudFront 우회라는 유효한 방법이 있으므로 오답.

---

**문제 7.** S3 버킷에 고객의 신용카드 번호·주민등록번호 같은 민감 정보가 저장됐는지 자동으로 탐지하려 한다. 적합한 서비스는?

A) GuardDuty
B) Inspector
C) Macie
D) Detective

**정답: C**

해설: Macie는 S3에 저장된 PII(개인 식별 정보)를 머신러닝으로 자동 탐지·분류하는 서비스다. A) GuardDuty는 CloudTrail/VPC Flow/DNS 로그로 계정 활동의 이상을 탐지(데이터 내용이 아닌 행위). B) Inspector는 EC2·ECR 이미지의 취약점을 스캔(상태). D) Detective는 보안 사고의 근본 원인을 조사. 셋의 차이는 "데이터(Macie) vs 행위(GuardDuty) vs 취약점(Inspector)"이다. "S3 안의 민감 데이터 발견"이 보이면 Macie다.
