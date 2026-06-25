# Day 2 - 도메인 3·4 통합 복습: 배포·오케스트레이션 + 모니터링·보안

어제 데이터와 모델을 묶었다. 오늘은 그 모델을 **운영**하는 후반 두 도메인을 정리한다. **도메인 3(배포·오케스트레이션, 22%)** 은 추론 옵션 선택과 ML 파이프라인 자동화이고, **도메인 4(모니터링·보안, 24%)** 는 배포 후 모델을 감시하고 인프라를 안전하게 지키는 일이다. 두 도메인을 합치면 시험의 46%다.

핵심 메시지. **모델은 배포하고 끝이 아니라, 반복 가능하게(파이프라인) 만들고 지속적으로 감시(모니터링)하며 안전하게(보안) 지켜야 한다.** 추론 옵션은 요청 패턴이, 모니터링은 "무엇이 변했는가"가, 보안은 "최소 권한 + 격리 + 암호화"가 핵심이다.

## 도메인 3: 추론 옵션 — 요청 패턴이 결정한다

추론 4옵션은 알고리즘이 아니라 **요청 패턴**으로 고른다.

| 옵션 | 응답 | 트래픽 | 페이로드/시간 | always-on 비용 |
|------|------|--------|---------------|----------------|
| 실시간 | 동기, ms~초 | 꾸준 | <6MB, <60초 | 있음(최소 1대) |
| 서버리스 | 동기, ms~초 | 간헐 | <4MB, <60초 | 없음(0 스케일) |
| 비동기 | 큐 기반 | 가변·긴 처리 | <1GB, <60분 | 없음(0 스케일) |
| 배치 변환 | 작업 단위 | 일괄 | 전체 데이터셋 | 없음(끝나면 종료) |

> 💡 **관련 이론**: 결정 축은 "즉시성·트래픽·페이로드·비용"이다. 즉시 응답+꾸준한 트래픽이면 실시간, 즉시 응답이지만 간헐적이고 콜드스타트를 허용하면 서버리스, 큰 페이로드·긴 처리·개별 요청이면 비동기, 전체 데이터셋 일괄이면 배치다. 비용이 걸리면 다수 동종 모델은 MME, 딥러닝 추론은 Inferentia, 유휴가 많으면 0 스케일 옵션으로 줄인다.

## 도메인 3: SageMaker Pipelines와 MLOps

**SageMaker Pipelines**는 데이터 처리→학습→평가→등록→배포를 DAG로 묶는 ML 전용 CI/CD 오케스트레이터다. 단계(Step)들을 연결하고, 조건 단계(ConditionStep)로 "정확도가 기준 이상이면 등록"같은 게이트를 건다. **Model Registry**는 모델 버전을 카탈로그·승인 상태로 관리한다.

| MLOps 요구 | 서비스 |
|------------|--------|
| ML 워크플로 DAG 오케스트레이션 | SageMaker Pipelines |
| 모델 버전·승인 관리 | Model Registry |
| 범용 워크플로(서버리스 함수 체인) | Step Functions |
| 코드형 인프라 | CloudFormation / CDK |
| 코드 커밋→빌드→배포 CI/CD | CodePipeline + CodeBuild |
| 이벤트 기반 트리거(재학습) | EventBridge |

> 🔍 **더 깊이**: Pipelines vs Step Functions를 헷갈리지 말자. Pipelines는 **SageMaker 단계에 특화**되어 ML 워크플로를 가장 자연스럽게 표현하고 lineage·Registry와 통합된다. Step Functions는 더 범용적이어서 Lambda·Glue 등 다양한 AWS 서비스를 엮는 비-ML 단계가 많이 섞일 때 적합하다. "재학습을 새 데이터 도착 시 자동 트리거"는 EventBridge가 Pipeline을 시작하는 패턴이 정답이다.

## 도메인 4: Model Monitor — 무엇이 변했는가

배포 후 모델은 **데이터/세상이 변하면서** 조용히 나빠진다. SageMaker Model Monitor가 네 종류를 감시한다.

| 모니터 유형 | 감시 대상 |
|-------------|-----------|
| Data Quality | 입력 데이터 통계·스키마 변화(공변량 드리프트) |
| Model Quality | 실제 정답 대비 예측 성능 저하 |
| Bias Drift | 운영 중 편향 변화(Clarify 연동) |
| Feature Attribution Drift | 특성 기여도 변화(Clarify 연동) |

작동 방식은 **베이스라인(학습 시 통계) 생성 → 운영 데이터를 주기적으로 비교 → 위반 시 CloudWatch 알림**이다.

> ⚠️ **함정**: "드리프트 감지"는 거의 항상 Model Monitor가 정답이다. 입력 분포가 변하면 Data Quality, 정답 대비 성능이 떨어지면 Model Quality다. 단 Model Quality는 **실제 정답(ground truth)** 이 필요하므로 정답이 지연 도착하는 환경에서는 라벨 수집 파이프라인이 함께 필요하다는 점을 기억하자. 편향·특성 기여도 변화는 Clarify와 연동한 Bias/Attribution Drift 모니터다.

## 도메인 4: 보안 — IAM, VPC, KMS

ML 보안의 세 기둥은 **권한(IAM)·격리(VPC)·암호화(KMS)** 다.

- **IAM**: 최소 권한 원칙. SageMaker 실행 역할(execution role)에 S3·ECR 등 필요한 권한만 부여한다. 사용자가 아닌 서비스에 권한을 줄 땐 역할 신뢰관계를 쓴다.
- **VPC**: 학습/엔드포인트를 VPC 내부에 두고, 인터넷 없이 S3·ECR에 접근하려면 **VPC 엔드포인트(PrivateLink)** 를 쓴다. `EnableNetworkIsolation`으로 컨테이너의 외부 통신을 차단한다.
- **KMS**: 저장 데이터 암호화 — S3 데이터, EBS 볼륨, 모델 아티팩트를 KMS 키로 암호화한다. 전송 중 암호화는 TLS다.

> 💡 **관련 이론**: 보안 시나리오는 세 질문으로 환원된다. "누가 무엇을 할 수 있나"(IAM), "어디서 통신하나"(VPC/엔드포인트/격리), "데이터가 보호되나"(KMS 저장 + TLS 전송). "민감 데이터를 인터넷 노출 없이 처리"는 VPC + VPC 엔드포인트 + 네트워크 격리, "저장 데이터 규제 준수 암호화"는 KMS, "노트북이 과도한 권한을 가짐"은 IAM 최소 권한이다.

## 도메인 4: 거버넌스·감사

운영 추적·감사 도구도 자주 묻는다. **CloudTrail**은 API 호출 감사 로그, **CloudWatch**는 지표·로그·알람, **SageMaker Model Cards**는 모델 문서화·거버넌스, **Lineage Tracking**은 데이터→학습→모델 계보 추적이다.

> 🔍 **더 깊이**: "누가 엔드포인트를 삭제했는가" 같은 **감사**는 CloudTrail(API 기록), "엔드포인트 지연·오류율 모니터링과 알람"은 CloudWatch다. 둘을 헷갈리지 말자 — CloudTrail은 "누가 무슨 행위를 했나(거버넌스)", CloudWatch는 "시스템이 어떻게 동작하나(운영 지표)"다. 모델의 출처·재현성 추적은 Lineage, 모델의 의도·성능·한계 문서화는 Model Cards다.

## 정리하며

도메인 3·4를 묶으면 "배포 후 라이프사이클"이다. **추론 옵션**은 요청 패턴(즉시성·트래픽·페이로드)으로 고르고, **Pipelines/Registry/Step Functions/EventBridge**로 반복 가능한 MLOps를 만든다. 배포 후엔 **Model Monitor**로 데이터·품질·편향·기여도 드리프트를 감시하고, **IAM(권한)·VPC(격리)·KMS(암호화)** 로 안전을 지키며, **CloudTrail/CloudWatch/Lineage/Model Cards**로 감사·거버넌스를 갖춘다. 키워드 "드리프트→Monitor, 편향→Clarify, 격리→VPC 엔드포인트, 암호화→KMS"를 반사적으로 떠올리자.

내일은 4개 도메인을 섞은 종합 시나리오 8문제로 실전 페이스를 잡는다.

---

## 📝 연습 문제

**문제 1.** 운영 중인 분류 엔드포인트의 입력 데이터 분포가 시간이 지나며 학습 시점과 달라지는지(공변량 드리프트) 자동으로 감지하고 위반 시 알림을 받으려 한다. 가장 적절한 것은?

A) SageMaker Clarify 단독 실행  
B) SageMaker Model Monitor — Data Quality 모니터 + CloudWatch 알람  
C) CloudTrail 로그 분석  
D) 엔드포인트를 매주 재배포  

**정답: B**  
해설: Model Monitor의 Data Quality 모니터는 학습 시 베이스라인 통계와 운영 입력 데이터를 주기적으로 비교해 분포 변화(공변량 드리프트)를 감지하고 위반 시 CloudWatch로 알림을 보낸다. A는 일회성 편향·설명 분석이고, C는 API 감사 로그라 데이터 분포와 무관하며, D는 감지 없이 무작정 재배포하는 비효율적 방법이다.

---

**문제 2.** 새 학습 데이터가 S3에 도착할 때마다 데이터 처리→학습→평가→(정확도 기준 통과 시)모델 등록을 자동 실행하고 싶다. 가장 적절한 구성은?

A) 사람이 매번 수동으로 노트북 실행  
B) EventBridge 규칙이 SageMaker Pipeline을 트리거하고, 파이프라인 내 ConditionStep으로 기준 통과 시 Model Registry 등록  
C) 단일 학습 작업만 cron으로 반복  
D) Model Monitor로 학습을 트리거  

**정답: B**  
해설: EventBridge가 S3 이벤트로 Pipeline을 시작하고, Pipeline의 ConditionStep이 평가 정확도가 기준을 넘을 때만 Model Registry에 등록하도록 게이트를 거는 것이 표준 MLOps 자동화 패턴이다. A는 자동화가 아니고, C는 평가·조건·등록 단계가 없으며, D는 Model Monitor가 학습 트리거 용도가 아니라 부적절하다.

---

**문제 3.** 규제 산업에서 SageMaker 학습 작업이 민감 데이터를 처리하며, 인터넷을 거치지 않고 S3·ECR에 접근하고 컨테이너의 외부 통신을 차단해야 한다. 가장 적절한 구성은?

A) 퍼블릭 서브넷에 배포하고 보안그룹만 설정  
B) VPC 내 학습 + S3·ECR용 VPC 엔드포인트(PrivateLink) + 네트워크 격리(EnableNetworkIsolation)  
C) IAM 정책만 강화  
D) KMS 키로 암호화만 적용  

**정답: B**  
해설: VPC 내부에 학습을 두고 VPC 엔드포인트로 인터넷 없이 S3·ECR에 접근하며 네트워크 격리로 컨테이너 외부 통신을 차단하는 조합이 "인터넷 비경유 + 외부 통신 차단" 요구를 정확히 충족한다. A는 퍼블릭 노출이 남고, C는 권한 제어만으로 네트워크 격리가 안 되며, D는 저장 암호화일 뿐 네트워크 격리와 무관하다.

---

**문제 4.** 보안 감사에서 "지난달 누가 프로덕션 엔드포인트를 삭제했는지" 확인해야 한다. 가장 적절한 서비스는?

A) Amazon CloudWatch 지표  
B) AWS CloudTrail  
C) SageMaker Model Monitor  
D) SageMaker Clarify  

**정답: B**  
해설: CloudTrail은 AWS API 호출을 기록하므로 누가 언제 어떤 자격증명으로 엔드포인트 삭제(DeleteEndpoint) API를 호출했는지 감사할 수 있다. A는 운영 지표·로그용이지 API 행위자 추적용이 아니고, C는 모델 드리프트 모니터링, D는 편향·설명가능성 분석으로 모두 감사 목적과 다르다.

---

**문제 5.** SageMaker Pipelines와 AWS Step Functions의 선택 기준으로 가장 정확한 것은?

A) Pipelines는 비-ML 워크플로 전용, Step Functions는 ML 전용이다  
B) Pipelines는 SageMaker 단계에 특화되어 lineage·Model Registry와 통합되고, Step Functions는 Lambda·Glue 등 다양한 서비스를 엮는 범용 오케스트레이션에 적합하다  
C) 둘은 기능이 완전히 동일해 아무거나 써도 된다  
D) Step Functions는 모델 학습을 할 수 없다  

**정답: B**  
해설: Pipelines는 SageMaker 단계와 lineage·Registry 통합에 특화된 ML 전용 오케스트레이터이고, Step Functions는 Lambda·Glue 등 다양한 AWS 서비스를 엮는 범용 워크플로에 적합하다는 것이 선택 기준이다. A는 역할이 뒤바뀌었고, C는 특화/범용 차이를 무시하며, D는 Step Functions가 SageMaker 학습 단계를 호출할 수 있어 사실과 다르다.

---
