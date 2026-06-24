# Day 3 - 관리·모니터링 도구: 시스템을 지켜보고 추적하기

시스템을 만들어 돌리기 시작하면 새로운 질문이 생긴다. "지금 서버가 느린데 CPU가 높은 건가?", "어제 누가 이 보안 설정을 바꿨지?", "우리 리소스가 회사 규칙을 잘 지키고 있나?", "서버 100대에 패치를 한 번에 깔 수 없을까?" 이 네 질문에 답하는 도구가 오늘의 주제다 — CloudWatch, CloudTrail, Config, Systems Manager.

처음에는 이름이 다 비슷해 보이지만, **"무엇을 본다"**가 서로 다르다. CloudWatch는 성능, CloudTrail은 누가 무엇을 했는지, Config는 설정 상태, Systems Manager는 운영 작업이다. 이 한 줄 차이를 잡는 게 오늘의 목표다.

## Amazon CloudWatch: 성능과 상태를 지켜보는 눈

**Amazon CloudWatch**는 AWS 리소스와 애플리케이션의 **지표(metrics), 로그(logs), 경보(alarms)**를 모아 보여주는 모니터링 서비스다. EC2의 CPU 사용률, RDS의 연결 수, 람다 실행 시간 같은 숫자를 시간에 따라 그래프로 보고, 임계값을 넘으면 알림을 보내거나 자동 조치를 취한다.

- **Metrics**: CPU, 네트워크, 디스크 등 수치 데이터를 시계열로 수집.
- **Logs**: 애플리케이션·시스템 로그를 한곳에 모아 검색.
- **Alarms**: "CPU 80% 넘으면 알림" 같은 임계값 기반 경보. Auto Scaling을 트리거하기도 함.
- **Dashboards**: 여러 지표를 한 화면으로.

> 💡 **관련 이론**: CloudWatch는 Well-Architected의 **Operational Excellence(운영 우수성)** 핵심 도구다. "관찰성(observability)" — 즉 시스템 내부 상태를 밖에서 알 수 있게 하는 능력 — 의 기반이 된다. "성능 지표", "임계값 경보", "로그 수집"이 보이면 CloudWatch다.

## AWS CloudTrail: 누가, 언제, 무엇을 했는가

**AWS CloudTrail**은 계정 안에서 일어난 **API 호출·활동 기록(감사 로그)**을 남기는 서비스다. 누군가 EC2를 종료했거나, S3 버킷 정책을 바꿨거나, IAM 사용자를 만들었다면 — 누가, 언제, 어디서(IP), 무엇을 했는지가 전부 기록된다.

CloudWatch가 "시스템이 어떻게 동작하는가(성능)"를 본다면, CloudTrail은 "사람과 서비스가 무엇을 했는가(행위)"를 본다. 보안 감사, 사고 조사, 규정 준수 증빙의 핵심이다.

| 항목 | CloudWatch | CloudTrail |
|------|------------|------------|
| 본다 | 성능 지표·로그·경보 | API 호출/활동 기록 |
| 질문 | "지금 잘 돌아가나?" | "누가 무엇을 했나?" |
| 용도 | 모니터링·알림·자동확장 | 감사·보안 조사·규정 준수 |

> 💡 **관련 이론**: "누가 이 작업을 했는지 추적", "감사(audit)", "보안 사고 조사", "규정 준수 증빙"이 보이면 CloudTrail. CloudWatch(성능)와 헷갈리지 않도록 "성능 vs 행위 기록"으로 구분하면 된다.

## AWS Config: 설정이 규칙을 지키는가

**AWS Config**는 리소스의 **설정(configuration) 상태를 기록하고, 정해진 규칙을 지키는지 평가**하는 서비스다. 예를 들어 "모든 S3 버킷은 암호화되어야 한다", "보안 그룹에 0.0.0.0/0으로 SSH를 열면 안 된다" 같은 규칙을 만들고, 위반하는 리소스를 자동으로 찾아낸다.

또한 리소스 설정이 시간에 따라 어떻게 바뀌었는지 **이력(history)**을 남긴다. "이 보안 그룹이 일주일 전엔 어떤 상태였지?"를 되돌아볼 수 있다.

```
CloudTrail : "누가 변경했나"   (행위/누구)
AWS Config : "지금 설정이 규칙에 맞나, 어떻게 바뀌어 왔나"  (상태/적합성)
```

> 💡 **관련 이론**: "설정 규정 준수(compliance) 확인", "리소스 설정 이력", "규칙 위반 탐지"가 보이면 Config다. CloudTrail("누가 했나")과 묶여 보안·거버넌스를 이루지만, Config는 **결과 상태가 규칙에 맞느냐**에 초점이 있다는 점이 다르다.

## AWS Systems Manager: 운영 작업을 한곳에서

**AWS Systems Manager(SSM)**는 EC2 인스턴스와 온프레미스 서버를 **대규모로 운영·관리**하는 도구 모음이다. 서버 한 대 한 대 SSH로 들어가지 않고, 중앙에서 명령을 내리고 설정을 관리할 수 있다.

자주 나오는 기능 몇 가지:

- **Patch Manager**: 수많은 서버에 OS 패치를 일괄 적용.
- **Session Manager**: SSH 키나 열린 포트 없이 안전하게 서버 셸 접속(감사 로그 포함).
- **Parameter Store**: 설정값·비밀번호·DB 연결 문자열 등을 안전하게 저장·공유.
- **Run Command**: 여러 서버에 명령을 한 번에 실행.

> 💡 **관련 이론**: "여러 서버 일괄 패치", "SSH 키 없이 안전 접속", "설정값/시크릿 중앙 저장", "운영 자동화"가 보이면 Systems Manager. 특히 Session Manager는 22번 포트를 열지 않고도 접속하므로 보안(Security 기둥)에서 자주 언급된다.

## 네 도구를 한 장으로 구분하기

| 신호(키워드) | 서비스 |
|--------------|--------|
| 성능 지표, 경보, 로그, 대시보드 | CloudWatch |
| 누가 무엇을 했나, 감사, 보안 조사 | CloudTrail |
| 설정 규정 준수, 설정 이력, 규칙 위반 | AWS Config |
| 서버 일괄 운영, 패치, 안전 접속, 시크릿 저장 | Systems Manager |

CLF 시험은 이 네 가지를 자주 섞어서 헷갈리게 낸다. 가장 빠른 구분법은 **"무엇을 본다/한다"**다. 성능을 보면 CloudWatch, 행위를 보면 CloudTrail, 설정 적합성을 보면 Config, 운영 작업을 하면 Systems Manager.

## 정리하며

오늘은 시스템을 지켜보고 관리하는 네 가지 도구를 봤다. CloudWatch(성능 모니터링), CloudTrail(행위 감사), Config(설정 규정 준수), Systems Manager(대규모 운영). 이들은 따로가 아니라 함께 쓰인다 — CloudWatch로 이상 징후를 잡고, CloudTrail로 원인 행위를 추적하고, Config로 규칙 위반을 찾고, Systems Manager로 수정을 일괄 적용하는 식이다.

다음 글에서는 이런 인프라를 **코드로 자동 생성·배포**하는 방법 — CloudFormation, Elastic Beanstalk, 그리고 컨테이너·서버리스 — 을 본다.

---

## 📝 연습 문제

**문제 1.** EC2 인스턴스의 CPU 사용률을 시계열로 추적하고, 80%를 넘으면 알림을 보내려 한다. 가장 적합한 서비스는?

A) AWS CloudTrail  
B) Amazon CloudWatch  
C) AWS Config  
D) AWS Systems Manager  

**정답: B**  
해설: CloudWatch는 성능 지표를 수집하고 임계값 기반 경보(Alarm)를 제공하는 모니터링 서비스다. CloudTrail은 API 활동 기록(감사), Config는 설정 규정 준수, Systems Manager는 운영 작업용이라 성능 경보 용도가 아니다.

---

**문제 2.** 보안 조사를 위해 "누가, 언제, 어떤 IP에서 S3 버킷 정책을 변경했는지"를 확인해야 한다. 가장 적합한 서비스는?

A) Amazon CloudWatch  
B) AWS Config  
C) AWS CloudTrail  
D) Amazon SNS  

**정답: C**  
해설: CloudTrail은 계정 내 API 호출·활동을 기록하는 감사 로그 서비스로, 누가 언제 무엇을 했는지 추적한다. CloudWatch는 성능 모니터링, Config는 설정 상태 평가, SNS는 알림 발송이라 행위 추적에는 맞지 않는다.

---

**문제 3.** "모든 S3 버킷은 암호화되어야 한다"는 회사 규칙을 위반하는 리소스를 자동으로 탐지하고 설정 이력을 추적하려 한다. 가장 적합한 서비스는?

A) AWS Config  
B) Amazon CloudWatch  
C) AWS Systems Manager  
D) Amazon SQS  

**정답: A**  
해설: AWS Config는 리소스 설정을 기록하고 규칙(예: 버킷 암호화)에 대한 적합성을 평가하며 설정 이력을 남긴다. CloudWatch는 성능, Systems Manager는 운영 작업, SQS는 메시지 큐라서 설정 규정 준수 평가 기능이 없다.

---

**문제 4.** 수백 대의 EC2 인스턴스에 SSH 키나 열린 포트 없이 OS 패치를 일괄 적용하려 한다. 가장 적합한 서비스는?

A) Amazon CloudWatch  
B) AWS CloudTrail  
C) AWS Systems Manager  
D) AWS Config  

**정답: C**  
해설: Systems Manager는 Patch Manager로 대규모 패치를 일괄 적용하고 Session Manager로 키/포트 없이 안전하게 접속하는 운영 도구 모음이다. CloudWatch·CloudTrail·Config는 각각 모니터링·감사·설정 평가용이라 일괄 운영 작업을 수행하지 않는다.

---

**문제 5.** CloudWatch와 CloudTrail의 역할 차이로 가장 정확한 설명은?

A) CloudWatch는 API 행위를 기록하고, CloudTrail은 성능을 모니터링한다  
B) CloudWatch는 성능 지표·로그·경보, CloudTrail은 누가 무엇을 했는지의 활동 기록이다  
C) 둘 다 설정 규정 준수만 평가한다  
D) 둘 다 서버 패치를 자동화한다  

**정답: B**  
해설: CloudWatch는 성능(지표·로그·경보)을 보고, CloudTrail은 행위(누가 무엇을 했는지)를 기록한다. A는 둘을 뒤바꾼 설명이고, 설정 규정 준수는 Config, 서버 패치는 Systems Manager의 역할이다.

---
