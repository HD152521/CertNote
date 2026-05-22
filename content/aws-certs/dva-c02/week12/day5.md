# Day 60 - Week 12 복습 + 연습문제 (컨테이너/IaC)

📅 날짜: 2026년 8월 6일 (목요일)  
🎯 주제: 컨테이너 및 IaC 종합 복습  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- ECS, CloudFormation, SAM, CDK의 핵심을 종합 정리한다
- 실전 시험 유형의 컨테이너/IaC 문제를 풀어 실력을 점검한다

---

## 📖 Week 12 핵심 정리

### IaC 도구 비교
```
CloudFormation: YAML/JSON, 범용 IaC
SAM: 서버리스 특화 CloudFormation 확장
CDK: 프로그래밍 언어, CloudFormation으로 변환
Elastic Beanstalk: PaaS, 코드만 배포
```

### 컨테이너 핵심 암기
```
ECS: Docker 컨테이너 오케스트레이션
Fargate: 서버리스 컨테이너, EC2 관리 불필요
ECR: 컨테이너 이미지 레지스트리, 취약점 스캔
태스크 정의: CPU/메모리/이미지/포트/환경변수
executionRole: ECR pull, CloudWatch Logs
taskRole: 컨테이너가 AWS 서비스 접근
```

---

## 아키텍처 다이어그램

```
컨테이너 + IaC 배포 파이프라인
================================

[개발자]
  코드 수정 + sam.yaml / cdk.py 수정
     |
     v
[CodeCommit]
     |
     v
[CodeBuild]
  - sam build 또는 cdk synth
  - docker build → ECR push
     |
     v
[CodeDeploy / CloudFormation]
  - ECS 서비스 업데이트
  - Lambda 함수 업데이트
  - 인프라 변경 적용
```

---

## 🧠 Week 12 시험 함정 & 약어

### 헷갈리는 비교

| A | B | 핵심 |
|---|---|------|
| ECS EC2 시작 | Fargate | 직접 관리 vs 서버리스 |
| executionRole | taskRole | ECR/Logs vs 앱→AWS 서비스 |
| awsvpc | bridge | ENI per task vs Docker NAT |
| ECS | EKS | AWS 자체 vs 쿠버네티스 |
| ECR Basic Scan | Enhanced Scan | 무료·CVE vs Inspector·유료 |
| Fargate | Fargate Spot | 정규 vs 회수·70% 저렴 |
| CloudFormation | SAM | 범용 vs 서버리스 특화 |
| SAM | CDK | YAML 매크로 vs 프로그래밍 |
| Change Set | Direct Update | 미리보기 vs 즉시 적용 |
| DeletionPolicy: Retain | Snapshot | 그대로 유지 vs 스냅샷 생성 |
| Stack Policy | Termination Protection | 업데이트 보호 vs 삭제 방지 |
| !Ref | !GetAtt | 리소스 자체 vs 속성 |
| !Sub | !Join | ${} 치환 vs 문자열 연결 |
| Nested Stack | Stack Set | 한 계정 vs 다중 계정/리전 |
| Custom Resource | Hook | 사용자 정의 리소스 vs 검증 |
| Drift Detection | Change Set | 실제 차이 감지 vs 미리보기 |

### Week 12 시험 함정 15가지

1. **Fargate는 awsvpc만**
2. **executionRole vs taskRole 헷갈리지 않기**
3. **ECR 인증 토큰 12시간**
4. **Fargate Spot은 2분 알림 후 회수**
5. **CloudFormation Drift 자동 감지 안 됨**
6. **Change Set은 안전한 업데이트 표준**
7. **DeletionPolicy Retain ≠ Termination Protection** (다른 개념)
8. **!ImportValue는 같은 리전 내 스택끼리만** (cross-region X)
9. **SAM Transform 선언 필수**
10. **`sam local`은 Docker 필요**
11. **SAM Policy Templates 외워두면 점수 ↑**
12. **CDK는 cdk synth → CFN으로 변환**
13. **CDK bootstrap은 계정·리전당 1회**
14. **Stack Set은 Organizations로 다중 계정**
15. **Lambda→Lambda 직접 호출은 안티 패턴** (SQS/SNS 사용)

### Week 12 약어 정리

| 약어 | 풀네임 |
|------|--------|
| **ECS** | Elastic Container Service |
| **EKS** | Elastic Kubernetes Service |
| **ECR** | Elastic Container Registry |
| **CFN** | CloudFormation |
| **SAM** | Serverless Application Model |
| **SAR** | Serverless Application Repository |
| **CDK** | Cloud Development Kit |
| **IaC** | Infrastructure as Code |
| **ENI** | Elastic Network Interface |
| **CVE** | Common Vulnerabilities and Exposures |
| **mTLS** | Mutual TLS |
| **DLM** | Data Lifecycle Manager |
| **Saga** | 분산 트랜잭션 보상 |
| **OCI** | Open Container Initiative |
| **PaaS** | Platform as a Service |
| **Well-Architected** | 6 Pillars Framework |

---

## 📝 Week 12 종합 연습문제

**문제 1.** EC2 없이 컨테이너를 실행하려면?

A) ECS EC2 시작 유형  
B) ECS Fargate  
C) EC2 + Docker  
D) ECR  

**정답: B** - Fargate는 서버리스 컨테이너 서비스로 EC2 인스턴스를 관리할 필요가 없습니다.

---

**문제 2.** SAM 템플릿의 필수 선언은?

A) Globals 섹션  
B) Transform: AWS::Serverless-2016-10-31  
C) Parameters 섹션  
D) Outputs 섹션  

**정답: B** - SAM 템플릿에는 반드시 `Transform: AWS::Serverless-2016-10-31`을 선언해야 합니다.

---

**문제 3.** ECS 태스크가 S3에서 파일을 읽으려면 어떤 역할이 필요한가?

A) executionRoleArn  
B) taskRoleArn  
C) 인스턴스 프로파일  
D) 서비스 역할  

**정답: B** - taskRole은 컨테이너 내 애플리케이션이 AWS 서비스(S3, DynamoDB 등)에 접근하는 데 사용합니다.

---

**문제 4.** CloudFormation 스택 업데이트 전에 변경 사항을 미리 확인하는 방법은?

A) 바로 업데이트 실행  
B) Change Set 생성 후 검토  
C) 드리프트 감지  
D) 스냅샷 생성  

**정답: B** - Change Set을 생성하면 실제 업데이트 전에 추가/삭제/수정될 리소스 목록을 확인할 수 있습니다.

---

**문제 5.** CDK와 CloudFormation의 관계는?

A) 완전히 별개의 서비스  
B) CDK는 프로그래밍 언어로 인프라 정의, 배포 시 CloudFormation으로 변환  
C) CloudFormation이 CDK의 일부  
D) 동일한 기능, 다른 인터페이스  

**정답: B** - CDK는 TypeScript, Python 등으로 인프라를 정의하고 `cdk synth`/`cdk deploy` 시 CloudFormation 템플릿으로 변환됩니다.

---

**문제 6.** ECR의 이미지 취약점 스캔 기능의 역할은?

A) 이미지 압축  
B) Docker 이미지에서 보안 취약점 탐지  
C) 이미지 암호화  
D) 이미지 크기 감소  

**정답: B** - ECR의 취약점 스캔은 컨테이너 이미지 내 OS 패키지와 라이브러리의 보안 취약점을 탐지합니다.

---

**문제 7.** CloudFormation에서 다른 스택의 VPC ID를 참조하려면?

A) !Ref VPCId  
B) !ImportValue vpc-stack-VPCId  
C) !GetAtt VPC.Id  
D) !FindInMap [VPC, Id, Value]  

**정답: B** - !ImportValue 함수로 다른 스택에서 Export한 값을 가져올 수 있습니다.

---

**문제 8.** SAM 로컬 API 테스트를 위해 필요한 도구는?

A) Kubernetes  
B) Docker  
C) VirtualBox  
D) EC2 인스턴스  

**정답: B** - SAM 로컬 실행은 Docker 컨테이너를 기반으로 Lambda 환경을 시뮬레이션합니다.

---

## 📌 오늘의 요약

1. ECS: 컨테이너 오케스트레이션, EC2 또는 Fargate 시작 유형
2. Fargate: 서버리스 컨테이너, EC2 관리 불필요, awsvpc 네트워크
3. ECR: 컨테이너 이미지 레지스트리, 취약점 스캔, 수명 주기 정책
4. CloudFormation: YAML IaC, Change Set으로 안전한 업데이트
5. SAM: 서버리스 특화, Transform 필수, sam local로 로컬 테스트
