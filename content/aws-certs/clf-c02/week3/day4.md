# Day 4 - 배포·자동화·기타: 인프라를 코드로, 그리고 서버 없이

지금까지 우리는 서비스들을 콘솔에서 클릭으로 만들었다. 그런데 같은 환경을 개발·테스트·운영용으로 세 벌 만들어야 하거나, 실수 없이 똑같이 재현해야 한다면 클릭은 위험하고 느리다. 오늘은 **인프라를 코드로 다루는 방법(IaC)**과, 배포를 단순화하는 도구, 그리고 서버 관리 부담을 줄이는 컨테이너·서버리스 개념을 정리한다.

핵심 질문은 하나다: "어디까지를 내가 직접 관리하고, 어디부터를 AWS에 맡길까?" 오늘 보는 도구들은 그 책임 경계를 점점 위로 올려준다.

## AWS CloudFormation: 인프라를 코드로 (IaC)

**AWS CloudFormation**은 **인프라를 코드(IaC, Infrastructure as Code)로 정의**하는 서비스다. EC2, VPC, S3, RDS 같은 리소스를 JSON/YAML 템플릿에 적어두면, CloudFormation이 그대로 생성·수정·삭제해준다.

왜 좋을까. 콘솔 클릭은 사람마다 다르게 하고 기록도 안 남지만, 템플릿은 **버전 관리되고 반복 재현 가능**하다. "개발 환경을 운영과 똑같이" 만들고 싶으면 같은 템플릿을 한 번 더 배포하면 된다. 실수로 지운 환경도 템플릿만 있으면 그대로 되살아난다.

```
[수동 클릭]   환경마다 제각각, 기록 없음, 재현 어려움
[CloudFormation] 템플릿 1개 → 동일 환경 반복 생성/삭제, 버전 관리 가능
```

> 💡 **관련 이론**: IaC는 Well-Architected의 **Operational Excellence(운영 우수성)** 핵심 실천이다. "인프라를 코드로", "반복 재현 가능한 환경", "템플릿으로 자동 프로비저닝"이 보이면 CloudFormation. (참고로 CDK는 프로그래밍 언어로 같은 일을 하지만, CLF에서는 CloudFormation 개념이 핵심이다.)

## AWS Elastic Beanstalk: 코드만 올리면 배포 끝

**AWS Elastic Beanstalk**는 애플리케이션 코드를 업로드하면 **실행에 필요한 인프라(EC2, 로드밸런서, Auto Scaling 등)를 자동으로 구성·배포**해주는 서비스다. 개발자는 인프라 세부 설정을 몰라도 코드에 집중할 수 있다.

CloudFormation과의 차이가 자주 헷갈리는데, 초점이 다르다. CloudFormation은 "원하는 모든 리소스를 내가 템플릿으로 정밀하게 정의", Elastic Beanstalk은 "웹 앱을 빠르게 배포하게 알아서 표준 환경을 구성"이다. Beanstalk도 내부적으로는 CloudFormation을 사용한다.

| 항목 | CloudFormation | Elastic Beanstalk |
|------|----------------|-------------------|
| 초점 | 인프라 전체를 코드로 정밀 정의 | 앱 코드만 올리면 배포 자동화 |
| 통제 수준 | 세밀(모든 리소스 명시) | 단순(표준 환경 자동 구성) |
| 대상 | 인프라 엔지니어/광범위 자원 | 빠르게 배포하려는 앱 개발자 |

> 💡 **관련 이론**: "코드만 올리면 알아서 배포", "인프라 세부 설정 없이 웹 앱 빠르게 출시"가 보이면 Elastic Beanstalk. "모든 리소스를 템플릿으로 직접 정의"면 CloudFormation이다.

## 컨테이너: ECS, EKS, Fargate

**컨테이너**는 애플리케이션과 실행 환경을 하나로 묶어 어디서나 똑같이 돌아가게 하는 기술이다. "내 컴퓨터에선 됐는데 서버에선 안 돼" 문제를 줄여준다. AWS의 대표 컨테이너 서비스는 다음과 같다.

- **Amazon ECS(Elastic Container Service)**: AWS의 컨테이너 오케스트레이션 서비스. 컨테이너를 어디서 몇 개 띄울지 관리.
- **Amazon EKS(Elastic Kubernetes Service)**: 표준 오픈소스 Kubernetes를 관리형으로 제공. 이미 쿠버네티스를 쓰는 팀에 적합.
- **AWS Fargate**: ECS/EKS에서 **서버(EC2)를 직접 관리하지 않고** 컨테이너만 실행하는 서버리스 컴퓨팅. 노드 패치·확장을 신경 쓸 필요 없음.

> 💡 **관련 이론**: "AWS 방식 컨테이너 관리" → ECS, "표준 Kubernetes" → EKS, "서버 관리 없이 컨테이너만 실행" → Fargate. CLF에서는 깊은 운영보다 이 셋의 한 줄 차이를 묻는다.

## 서버리스: Lambda

**서버리스(serverless)**는 서버를 우리가 전혀 관리하지 않고, 코드 실행에만 비용을 내는 모델이다. 대표가 **AWS Lambda**다. 코드를 올려두면 이벤트(파일 업로드, API 호출 등)가 발생할 때만 실행되고, 실행한 시간만큼만 과금된다. 트래픽이 없으면 비용도 0에 가깝다.

```
[관리 책임이 줄어드는 순서]
EC2 (서버 직접 관리)
  → ECS/EKS on EC2 (컨테이너 + 노드 관리)
    → Fargate (컨테이너만, 노드 관리 없음)
      → Lambda (코드만, 서버 개념 없음)
```

> 💡 **관련 이론**: "서버 관리 없이", "이벤트가 있을 때만 실행", "사용한 만큼만 과금", "짧은 단위 작업"이 보이면 Lambda(서버리스)다. 위 사다리는 추상화가 올라갈수록 고객의 운영 책임이 줄어드는 공동 책임 모델의 연장선이다.

## 한 장으로 정리

| 신호(키워드) | 서비스 |
|--------------|--------|
| 인프라를 템플릿(코드)으로 정의·반복 | CloudFormation |
| 코드만 올리면 배포 자동화 | Elastic Beanstalk |
| AWS 방식 컨테이너 / 표준 쿠버네티스 | ECS / EKS |
| 서버 관리 없이 컨테이너 실행 | Fargate |
| 이벤트 기반, 사용한 만큼 과금, 서버 없음 | Lambda |

## 정리하며

오늘은 배포와 자동화, 그리고 운영 책임을 줄이는 흐름을 봤다. CloudFormation으로 인프라를 코드화하고, Elastic Beanstalk으로 앱 배포를 단순화하며, 컨테이너(ECS/EKS/Fargate)와 서버리스(Lambda)로 점점 더 많은 운영을 AWS에 맡긴다. 관통하는 원리는 어제까지 본 공동 책임 모델이다 — 추상화가 올라갈수록 내 책임은 줄고, 나는 비즈니스 로직에 더 집중할 수 있다.

다음 글에서는 Week 3 전체 — 데이터베이스, 통합, 관리 도구, 배포 — 를 한 번에 복습하고 정리한다.

---

## 📝 연습 문제

**문제 1.** 동일한 인프라 환경(개발·테스트·운영)을 반복 가능하고 버전 관리되는 방식으로 자동 생성하려 한다. 가장 적합한 서비스는?

A) AWS Elastic Beanstalk  
B) AWS CloudFormation  
C) AWS Lambda  
D) Amazon ECS  

**정답: B**  
해설: CloudFormation은 인프라를 JSON/YAML 템플릿(코드)으로 정의해 반복 재현·버전 관리하는 IaC 서비스다. Elastic Beanstalk은 앱 배포 단순화에 초점이 있고, Lambda는 서버리스 코드 실행, ECS는 컨테이너 오케스트레이션이라 인프라 전체 정의 용도가 아니다.

---

**문제 2.** 개발자가 인프라 세부 설정을 직접 다루지 않고, 코드만 업로드하면 EC2·로드밸런서·Auto Scaling을 알아서 구성해 웹 앱을 빠르게 배포하려 한다. 가장 적합한 서비스는?

A) AWS CloudFormation  
B) AWS Config  
C) AWS Elastic Beanstalk  
D) Amazon EKS  

**정답: C**  
해설: Elastic Beanstalk은 코드를 올리면 실행에 필요한 표준 인프라를 자동 구성·배포해 개발자가 코드에 집중하게 해준다. CloudFormation은 모든 리소스를 직접 정의해야 하고, Config는 설정 평가, EKS는 쿠버네티스 관리라 목적이 다르다.

---

**문제 3.** 컨테이너를 실행하되 그 아래의 EC2 서버(노드)를 직접 패치·확장하지 않는 서버리스 방식을 원한다. 가장 적합한 것은?

A) Amazon EC2  
B) AWS Fargate  
C) Amazon RDS  
D) AWS CloudTrail  

**정답: B**  
해설: Fargate는 ECS/EKS에서 노드(EC2) 관리 없이 컨테이너만 실행하는 서버리스 컴퓨팅이다. EC2는 서버를 직접 관리해야 하고, RDS는 데이터베이스, CloudTrail은 감사 로그라 컨테이너 실행과 무관하다.

---

**문제 4.** 이벤트(예: 파일 업로드)가 발생할 때만 코드를 실행하고, 실행한 시간만큼만 과금되며 서버를 전혀 관리하지 않으려 한다. 가장 적합한 서비스는?

A) AWS Lambda  
B) Amazon EC2  
C) Amazon EKS  
D) AWS Elastic Beanstalk  

**정답: A**  
해설: Lambda는 이벤트 기반으로만 실행되고 사용한 시간만큼 과금되는 서버리스 컴퓨팅이다. EC2·EKS·Beanstalk은 정도의 차이는 있지만 서버나 환경을 유지·관리해야 하므로 "서버 전혀 없음" 조건에 맞지 않는다.

---

**문제 5.** 이미 표준 오픈소스 Kubernetes를 사용 중인 팀이 AWS에서 관리형 Kubernetes를 쓰려 한다. 가장 적합한 서비스는?

A) Amazon ECS  
B) Amazon EKS  
C) AWS Lambda  
D) AWS CloudFormation  

**정답: B**  
해설: EKS는 표준 Kubernetes를 관리형으로 제공하므로 기존 쿠버네티스 워크로드와 잘 맞는다. ECS는 AWS 고유 방식의 컨테이너 오케스트레이션, Lambda는 서버리스 함수, CloudFormation은 IaC라서 쿠버네티스 관리 서비스가 아니다.

---
