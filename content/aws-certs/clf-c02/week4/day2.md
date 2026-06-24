# Day 2 - 보안 서비스 한눈에 보기: 어떤 위협을 막는가

어제 IAM으로 "누가 무엇을 할 수 있는가"를 정했다. 하지만 권한 관리만으로 모든 위협을 막을 수는 없다. 외부에서 들어오는 공격 트래픽, 몰래 숨어든 악성 행위, 패치되지 않은 취약점, 실수로 노출된 민감 데이터 — 각각을 전담하는 보안 서비스들이 따로 있다.

오늘 다룰 서비스는 여섯 개다. WAF, Shield, GuardDuty, Inspector, Macie, Security Hub. 이름이 비슷비슷해서 처음엔 헷갈리지만, **"무슨 위협을 다루는가"**를 한 줄씩 잡아두면 시험에서 시나리오만 봐도 답이 떠오른다. CLF 시험은 깊은 설정이 아니라 "이 상황엔 이 서비스"라는 매칭을 묻기 때문이다.

## WAF: 웹 애플리케이션 방화벽

**AWS WAF(Web Application Firewall)**는 웹 애플리케이션을 노린 공격을 막는다. SQL 인젝션, 크로스 사이트 스크립팅(XSS) 같은 **레이어 7(애플리케이션 계층) 공격**을 필터링한다. 규칙을 정의해 특정 패턴의 요청을 차단하거나, 특정 IP·국가를 막을 수 있다.

흔히 CloudFront, Application Load Balancer, API Gateway 앞단에 붙여 들어오는 HTTP/HTTPS 요청을 검사한다.

> 💡 **관련 이론**: "SQL 인젝션/XSS 같은 웹 공격을 막아라", "특정 악성 요청 패턴을 필터링하라"가 보이면 WAF다. 핵심 키워드는 **웹 애플리케이션 계층(L7) 공격**이다.

## Shield: DDoS 방어

**AWS Shield**는 **DDoS(분산 서비스 거부) 공격**을 방어한다. 수많은 곳에서 동시에 트래픽을 퍼부어 서비스를 마비시키는 공격을 막아준다.

- **Shield Standard**: 모든 AWS 고객에게 **무료로 기본 제공**되며, 일반적인 네트워크/전송 계층 DDoS를 자동 방어한다.
- **Shield Advanced**: 유료 구독 서비스로, 더 정교한 대규모 공격 방어, 전문가 대응팀(DRT) 지원, 공격으로 인한 요금 급증 보호 등을 제공한다.

> 💡 **관련 이론**: "대량 트래픽으로 서비스를 마비시키는 공격(DDoS)을 막아라"가 보이면 Shield다. WAF가 "내용(요청 패턴)"을 본다면, Shield는 "물량(트래픽 폭주)"을 막는다고 구분하면 쉽다.

## GuardDuty: 위협 탐지

**Amazon GuardDuty**는 **지능형 위협 탐지** 서비스다. CloudTrail 로그, VPC 흐름 로그, DNS 로그 등을 머신러닝으로 분석해 **비정상적이고 악의적인 활동**을 자동으로 찾아낸다. 예를 들어 평소와 다른 위치에서의 API 호출, 암호화폐 채굴 행위, 손상된 인스턴스의 통신 등을 탐지한다.

별도 에이전트 설치 없이 켜기만 하면 동작하는 점이 특징이다.

> 💡 **관련 이론**: "계정·워크로드의 의심스러운/악의적인 활동을 자동으로 탐지하라"가 보이면 GuardDuty다. 키워드는 **위협 탐지(threat detection)**와 **로그 기반 이상 분석**이다.

## Inspector: 취약점 평가

**Amazon Inspector**는 **취약점을 자동으로 점검**한다. EC2 인스턴스, 컨테이너 이미지(ECR), Lambda 함수를 스캔해 알려진 소프트웨어 취약점(CVE)이나 네트워크 노출 문제를 찾아 우선순위와 함께 보고한다.

GuardDuty가 "지금 일어나는 악의적 행동"을 찾는다면, Inspector는 "공격당하기 쉬운 약점이 있는지"를 미리 점검하는 쪽이다.

> 💡 **관련 이론**: "EC2/컨테이너의 소프트웨어 취약점을 점검하라", "패치되지 않은 약점을 찾아라"가 보이면 Inspector다. 키워드는 **취약점 평가(vulnerability assessment)**다.

## Macie: 민감 데이터 보호

**Amazon Macie**는 **S3에 저장된 민감 데이터를 찾아 보호**한다. 머신러닝으로 S3 버킷을 스캔해 개인 식별 정보(PII), 신용카드 번호, 자격 증명 같은 민감 데이터가 어디에 있는지 자동으로 발견하고 분류한다.

> 💡 **관련 이론**: "S3 안의 개인정보(PII)/민감 데이터를 찾아내라"가 보이면 Macie다. 키워드는 **S3 + 민감 데이터 발견·분류**다. 데이터 자체에 초점을 둔 서비스라는 점이 핵심이다.

## Security Hub: 보안 통합 대시보드

**AWS Security Hub**는 여러 보안 서비스의 결과를 **한 곳에 모아 보여주는** 통합 대시보드다. GuardDuty, Inspector, Macie 등에서 나온 탐지 결과(findings)를 한 화면에 모으고, 모범 사례(예: CIS 벤치마크) 대비 보안 상태를 점수로 보여준다.

> 💡 **관련 이론**: "여러 보안 서비스의 결과를 한곳에서 통합 관리/모니터링하라"가 보이면 Security Hub다. 개별 탐지가 아니라 **중앙 집중식 가시성(central view)**이 키워드다.

## 한 줄 정리표

| 서비스 | 한 줄 정체성 |
|--------|--------------|
| WAF | 웹 공격(SQL 인젝션·XSS, L7) 필터링 |
| Shield | DDoS(트래픽 폭주) 방어 (Standard 무료) |
| GuardDuty | 로그 분석으로 악의적 활동 탐지 |
| Inspector | EC2·컨테이너·Lambda 취약점 점검 |
| Macie | S3 내 민감 데이터(PII) 발견·분류 |
| Security Hub | 보안 결과 통합 대시보드 |

## 정리하며

여섯 서비스를 "무슨 위협을 다루는가"로 묶었다. WAF는 웹 공격, Shield는 DDoS, GuardDuty는 악의적 활동 탐지, Inspector는 취약점, Macie는 S3 민감 데이터, Security Hub는 통합 가시성. 이 한 줄씩만 또렷하면 시험 시나리오에서 헷갈릴 일이 거의 없다.

다음 글에서는 보안에서 한 걸음 더 나아가 **규정 준수(Compliance)**를 다룬다. AWS Artifact로 규정 준수 보고서를 받는 법, 데이터가 어느 나라/리전에 저장되는지(데이터 주권) 같은 주제다.

---

## 📝 연습 문제

**문제 1.** SQL 인젝션과 크로스 사이트 스크립팅(XSS) 같은 웹 애플리케이션 계층 공격으로부터 웹 앱을 보호하려 한다. 가장 적합한 서비스는?

A) AWS Shield  
B) AWS WAF  
C) Amazon GuardDuty  
D) Amazon Macie  

**정답: B**  
해설: WAF는 L7(애플리케이션 계층)에서 SQL 인젝션·XSS 같은 웹 공격 패턴을 필터링한다. Shield는 DDoS(트래픽 폭주)를 막고, GuardDuty는 악의적 활동을 탐지하며, Macie는 S3 민감 데이터를 다루므로 웹 공격 차단과는 거리가 있다.

---

**문제 2.** 모든 AWS 고객에게 무료로 기본 제공되며 일반적인 DDoS 공격을 자동으로 방어하는 서비스는?

A) AWS Shield Standard  
B) AWS WAF  
C) Amazon Inspector  
D) AWS Security Hub  

**정답: A**  
해설: Shield Standard는 추가 비용 없이 모든 고객에게 제공되어 네트워크/전송 계층 DDoS를 자동 방어한다. WAF는 웹 공격 필터링, Inspector는 취약점 점검, Security Hub는 통합 대시보드로 DDoS 방어 서비스가 아니다.

---

**문제 3.** S3 버킷에 저장된 개인 식별 정보(PII) 같은 민감 데이터를 자동으로 발견하고 분류하려 한다. 가장 적합한 서비스는?

A) Amazon GuardDuty  
B) Amazon Inspector  
C) Amazon Macie  
D) AWS WAF  

**정답: C**  
해설: Macie는 머신러닝으로 S3 내 민감 데이터(PII 등)를 발견·분류하는 데 특화되어 있다. GuardDuty는 악의적 활동 탐지, Inspector는 취약점 점검, WAF는 웹 공격 필터링으로 S3 데이터 분류 기능은 없다.

---

**문제 4.** EC2 인스턴스와 컨테이너 이미지에 존재하는 알려진 소프트웨어 취약점을 자동으로 점검하려 한다. 가장 적합한 서비스는?

A) Amazon Inspector  
B) Amazon Macie  
C) AWS Shield  
D) AWS Security Hub  

**정답: A**  
해설: Inspector는 EC2·컨테이너·Lambda를 스캔해 알려진 취약점(CVE)과 노출 문제를 점검한다. Macie는 S3 민감 데이터, Shield는 DDoS 방어, Security Hub는 결과 통합 대시보드라서 취약점 평가 도구가 아니다.

---

**문제 5.** GuardDuty, Inspector, Macie 등 여러 보안 서비스의 탐지 결과를 한곳에 모아 통합적으로 모니터링하려 한다. 가장 적합한 서비스는?

A) AWS WAF  
B) AWS Security Hub  
C) Amazon GuardDuty  
D) AWS Shield Advanced  

**정답: B**  
해설: Security Hub는 여러 보안 서비스의 결과(findings)를 한 화면에 모으고 모범 사례 대비 보안 상태를 보여주는 중앙 집중식 대시보드다. WAF·GuardDuty·Shield는 각각 특정 위협을 다루는 개별 서비스이지 통합 가시성 도구가 아니다.

---
