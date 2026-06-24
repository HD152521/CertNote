# Day 3 - 전체 모의고사 페이스: 4개 도메인 종합

오늘은 실제 시험처럼 4개 영역을 섞어서 풉니다. 한 문제당 약 1분 안에 답을 고르는 **페이스 감각**을 익히는 것이 목표입니다. 모르는 문제는 표시만 해두고 넘어간 뒤 나중에 돌아오는 습관을 연습하세요. 문제는 평소보다 많은 8개입니다.

## 모의고사 풀이 전략

| 상황 | 행동 |
|------|------|
| 바로 답이 보임 | 즉시 선택하고 다음으로 |
| 헷갈림 | 명백한 오답 2개를 먼저 제거 |
| 전혀 모름 | 표시 후 넘기고 시간 남으면 복귀 |
| "가장 적합한/비용 효율적" 질문 | 핵심 키워드 한 단어로 좁히기 |

> 💡 **관련 이론**: CLF-C02는 65문항을 90분에 풀어야 하므로 평균 약 1분 23초/문항입니다. 쉬운 문제를 빠르게 처리해 어려운 문제에 쓸 시간을 확보하는 것이 합격 페이스의 핵심입니다.

## 영역별 단골 키워드 한 줄 복습

- **Domain 1**: 탄력성, 규모의 경제, AZ로 고가용성, IaaS/PaaS/SaaS
- **Domain 2**: 공동 책임, 최소 권한 IAM, CloudTrail(감사)/Config(구성)
- **Domain 3**: EC2/Lambda, S3/EBS/EFS, RDS/DynamoDB/Redshift, CloudFront(CDN)
- **Domain 4**: 온디맨드/RI/스팟, Budgets/Cost Explorer, Support 플랜

이제 실전처럼 풀어보세요.

## 📝 연습 문제

**문제 1.** 트래픽이 급증하면 EC2 인스턴스를 자동으로 늘리고, 줄면 자동으로 줄이는 클라우드의 특성을 무엇이라 하는가?

A) 내구성  
B) 탄력성  
C) 페일오버  
D) 다중 테넌시  

**정답: B**  
해설: 탄력성은 수요 변화에 따라 리소스를 자동으로 늘리고 줄이는 능력으로, Auto Scaling이 대표적입니다. 내구성은 데이터 손실 방지 정도, 페일오버는 장애 시 대체 전환, 다중 테넌시는 여러 고객이 인프라를 공유하는 개념입니다.

---

**문제 2.** 웹 애플리케이션을 SQL 인젝션과 교차 사이트 스크립팅(XSS) 공격으로부터 보호하려면 어떤 서비스를 사용해야 하는가?

A) AWS Shield  
B) Amazon GuardDuty  
C) AWS WAF  
D) AWS KMS  

**정답: C**  
해설: AWS WAF는 웹 애플리케이션 방화벽으로 SQL 인젝션과 XSS 같은 계층 7 공격을 필터링합니다. Shield는 DDoS 방어, GuardDuty는 위협 탐지, KMS는 암호화 키 관리 서비스입니다.

---

**문제 3.** 밀리초 단위의 빠른 응답이 필요한 서버리스 NoSQL 데이터베이스로 가장 적합한 것은?

A) Amazon RDS  
B) Amazon DynamoDB  
C) Amazon Redshift  
D) Amazon Aurora  

**정답: B**  
해설: DynamoDB는 완전관리형 서버리스 NoSQL로 일관된 한 자릿수 밀리초 성능을 제공합니다. RDS와 Aurora는 관계형 데이터베이스, Redshift는 분석용 데이터 웨어하우스로 용도가 다릅니다.

---

**문제 4.** 전 세계 사용자에게 동영상과 이미지를 짧은 지연 시간으로 전달하기 위해 엣지 로케이션에서 콘텐츠를 캐싱하려면 어떤 서비스를 사용해야 하는가?

A) Amazon Route 53  
B) AWS Direct Connect  
C) Amazon CloudFront  
D) Amazon VPC  

**정답: C**  
해설: CloudFront는 콘텐츠 전송 네트워크(CDN)로 엣지 로케이션에 콘텐츠를 캐싱하여 지연 시간을 줄입니다. Route 53은 DNS, Direct Connect는 전용 회선, VPC는 격리된 가상 네트워크입니다.

---

**문제 5.** 여러 AWS 계정의 청구를 하나로 합쳐 볼륨 할인 혜택을 공유하려면 무엇을 사용해야 하는가?

A) AWS Organizations의 통합 결제  
B) AWS Budgets  
C) Savings Plans  
D) AWS Cost Explorer  

**정답: A**  
해설: AWS Organizations의 통합 결제는 여러 계정의 사용량을 합산해 단일 청구서로 만들고 볼륨 기반 할인을 공유합니다. Budgets는 예산 알림, Savings Plans는 사용량 약정 할인, Cost Explorer는 비용 분석 도구입니다.

---

**문제 6.** 코드를 업로드하면 AWS가 용량 프로비저닝, 로드 밸런싱, 확장을 자동으로 처리해 주는 PaaS형 서비스는?

A) Amazon EC2  
B) AWS Lambda  
C) AWS Elastic Beanstalk  
D) Amazon ECS  

**정답: C**  
해설: Elastic Beanstalk는 코드를 업로드하면 인프라 구성과 확장을 자동 처리하는 PaaS 서비스입니다. EC2는 사용자가 직접 관리하는 IaaS, Lambda는 함수 단위 서버리스, ECS는 컨테이너 오케스트레이션입니다.

---

**문제 7.** AWS가 제공하는 규정 준수 보고서(SOC, PCI DSS 등)를 직접 다운로드하려면 어떤 서비스를 사용하는가?

A) AWS Config  
B) AWS Artifact  
C) AWS Trusted Advisor  
D) AWS CloudTrail  

**정답: B**  
해설: AWS Artifact는 SOC, PCI DSS 등 AWS의 규정 준수 보고서를 온디맨드로 제공하는 포털입니다. Config는 리소스 구성 추적, Trusted Advisor는 모범 사례 점검, CloudTrail은 API 감사 로그 서비스입니다.

---

**문제 8.** 안정적이고 지속적으로 실행되는 워크로드에서 1~3년 약정으로 최대 할인을 받으려는 경우 가장 적합한 EC2 요금 모델은?

A) 온디맨드 인스턴스  
B) 스팟 인스턴스  
C) 예약 인스턴스  
D) 전용 인스턴스  

**정답: C**  
해설: 예약 인스턴스(또는 Savings Plans)는 1~3년 사용을 약정하는 대가로 큰 할인을 제공하여 지속적이고 예측 가능한 워크로드에 적합합니다. 온디맨드는 약정·할인이 없고, 스팟은 중단 가능한 작업용, 전용 인스턴스는 격리 요건용입니다.

---
