# Day 5 - Week 11 종합 복습: 모니터링·MLOps·보안·운영

이번 주는 "모델을 만든 뒤"의 세계였다. 배포된 모델을 감시하고(모니터링), 재학습·배포를 자동화하고(MLOps), 데이터·모델·권한을 지키고(보안), 비용·감사·복구를 운영(운영)하는 전체 루프를 다뤘다. 오늘은 이 조각들이 하나의 운영 시스템으로 어떻게 맞물리는지 통합하고, 시험에서 가장 자주 갈리는 판단 지점을 정리한다.

## 전체 그림: 운영 루프 한 장

```text
[학습 데이터 S3]──(KMS 암호화, VPC 엔드포인트)──┐
                                               ▼
                 [SageMaker Pipeline] 처리→학습→평가
                                               │ ConditionStep(품질 게이트)
                                               ▼
                        [Model Registry] 버전·승인(Approved)
                                               │ EventBridge
                                               ▼
                 [배포: Blue/Green·Canary] → [Endpoint]
                          │                        │
                  CloudTrail(감사)          DataCapture(S3)
                          │                        ▼
                          │              [Model Monitor] 드리프트 감지
                          │                        │ CloudWatch Alarm
                          └────────────────────────┘ EventBridge → 재학습(루프 시작)
```

이 루프 전체가 IAM 실행 역할(최소 권한), VPC 격리, KMS 암호화 위에서 돈다.

## Day별 핵심 한 줄 요약

| Day | 주제 | 한 줄 요약 |
|-----|------|-----------|
| 1 | 모니터링 | 정답 없이 입력 분포 변화를 보는 Data Quality가 1차 방어, 위반→재학습 트리거 |
| 2 | MLOps | Pipelines(DAG·ConditionStep) + Model Registry(버전·승인) + CI/CD(Projects) |
| 3 | 보안 | IAM 실행 역할(최소 권한) + VPC 격리 + KMS(키 정책으로 복호화 통제) |
| 4 | 운영 | 비용(Spot/Serverless/Async) + 로깅(CloudWatch vs CloudTrail) + DR(교차 리전·Multi-AZ) |

## 가장 자주 갈리는 판단 지점

```text
1) 모니터링 유형
   정답 없음 → Data Quality / 정답 있음 → Model Quality
   기여도 변화 → Feature Attribution / 편향 변화 → Bias Drift

2) 로깅 서비스
   성능·실패 디버깅 → CloudWatch / 누가 무엇을 했나(감사) → CloudTrail

3) 추론 비용
   간헐 트래픽 → Serverless / 큰 페이로드·긴 처리 → Async
   많은 모델 공유 → Multi-Model Endpoint / 변동 트래픽 → Auto Scaling

4) 권한 문제
   학습/엔드포인트의 AccessDenied → 실행 역할(Execution Role) 권한

5) 인터넷 차단 요건
   프라이빗 서브넷 + VPC 엔드포인트 + 네트워크 격리
```

> 💡 **관련 이론**: Specialty 시험의 운영 영역은 "기능을 아느냐"보다 "상황에 무엇을 고르느냐"를 묻는다. 위 다섯 갈림길은 거의 모든 운영 문제를 커버한다. 키워드(정답 없음, 누가, 간헐적, AccessDenied, 인터넷 금지)를 보면 곧장 분기로 연결하는 훈련이 점수를 만든다.

## 통합 시나리오로 점검

상황: 의료 데이터로 학습한 분류 모델을 운영한다. (1) 데이터는 인터넷에 노출되면 안 되고, (2) 입력 분포가 바뀌면 자동 재학습해야 하며, (3) 누가 엔드포인트를 변경했는지 감사해야 하고, (4) 트래픽이 간헐적이라 유휴 비용을 줄이고 싶다.

```text
(1) VPC 프라이빗 서브넷 + S3 VPC 엔드포인트 + KMS(CMK) + 실행 역할 최소 권한
(2) DataCapture → Model Monitor(Data Quality) → CloudWatch Alarm
       → EventBridge → SageMaker Pipeline 재학습 → Model Registry 승인 → 재배포
(3) CloudTrail로 API 호출 감사, S3에 로그 보관
(4) Serverless Inference로 유휴 비용 0
```

하나의 문제처럼 보이지만 이번 주 4일치 지식이 정확히 한 조각씩 들어간다.

## 흔한 함정 정리

```text
- 베이스라인을 재학습 후에도 갱신하지 않아 오탐 폭증 (Day1)
- ConditionStep 없이 평가 미달 모델이 자동 배포됨 (Day2)
- 사용자 권한만 보고 실행 역할을 못 보는 권한 디버깅 (Day3)
- CloudWatch로 "누가 했나"를 찾으려는 시도 → CloudTrail이 정답 (Day4)
- 항상 켜진 GPU 엔드포인트로 간헐 트래픽을 처리하는 낭비 (Day4)
```

## 정리하며

Week 11은 ML을 "완성된 모델"이 아니라 "살아 있는 시스템"으로 본다. 모니터링이 드리프트를 잡고, MLOps가 재학습·배포를 자동화하며, 보안이 전체를 감싸고, 운영이 비용·감사·복구를 책임진다. 이 네 가지가 EventBridge와 Pipeline으로 연결되어 하나의 닫힌 루프가 된다. 시험에서는 키워드를 분기로 번역하는 다섯 갈림길을 기억하면 운영 영역의 대부분을 정확히 답할 수 있다.

다음 주는 전체 과정을 마무리하는 종합 정리와 실전 대비로 이어진다.

---

## 📝 연습 문제

**문제 1.** 운영 모델이 시간이 지나며 정확도가 떨어진다고 의심되지만 정답 레이블은 즉시 얻을 수 없다. 또한 입력 피처 일부의 통계가 학습 시점과 달라 보인다. 가장 먼저 적용할 모니터링은?

A) Model Quality 모니터링  
B) Data Quality 모니터링  
C) CloudTrail 분석  
D) A/B 프로덕션 변형  

**정답: B**  
해설: 정답 없이 입력 분포 변화를 감지하는 Data Quality 모니터링이 1차 방어선이다. Model Quality(A)는 정답이 필요하고, CloudTrail(C)은 API 감사, A/B(D)는 배포 비교용이다.

---

**문제 2.** 자동화된 ML 파이프라인에서 평가 지표가 임계값 미달인 모델이 절대 운영에 배포되지 않도록 하려 한다. 필요한 조합으로 가장 적절한 것은?

A) ConditionStep + Model Registry 승인(Approved) 게이트  
B) Multi-Model Endpoint + Auto Scaling  
C) Serverless Inference + Async Inference  
D) KMS CMK + VPC 엔드포인트  

**정답: A**  
해설: ConditionStep으로 지표 미달 시 등록을 막고, Model Registry 승인 게이트로 사람이 최종 통제하면 나쁜 모델의 자동 배포를 이중으로 차단한다. B·C는 추론 비용/호스팅, D는 보안 구성으로 품질 게이트와 무관하다.

---

**문제 3.** 보안 사고 조사에서 "어떤 IAM 주체가 언제 SageMaker 엔드포인트 구성을 변경했는가"를 추적해야 한다. 올바른 서비스는?

A) CloudWatch Metrics  
B) SageMaker Debugger  
C) AWS CloudTrail  
D) Amazon Macie  

**정답: C**  
해설: CloudTrail은 API 호출 주체·시각·소스 IP를 기록해 변경 감사를 지원한다. CloudWatch Metrics(A)는 성능 지표, Debugger(B)는 학습 분석, Macie(D)는 PII 탐지로 API 감사 용도가 아니다.

---

**문제 4.** 학습 데이터가 절대 인터넷을 거치지 않아야 하고, 팀별로 모델 아티팩트 복호화를 격리해야 한다. 가장 적절한 구성은?

A) 퍼블릭 서브넷 + 공유 KMS 관리형 키  
B) 프라이빗 서브넷 + S3 VPC 엔드포인트 + 팀별 KMS CMK와 키 정책  
C) NAT 게이트웨이 + 평문 저장  
D) 인터넷 게이트웨이 + IAM 사용자 분리만  

**정답: B**  
해설: 프라이빗 서브넷과 S3 VPC 엔드포인트로 인터넷을 배제하고, 팀별 CMK·키 정책으로 복호화 주체를 격리한다. 퍼블릭/NAT/IGW(A·C·D)는 인터넷 경로를 만들고 공유 키·평문은 격리 요건을 못 지킨다.

---

**문제 5.** 트래픽이 하루 중 일부 시간에만 몰리고 나머지는 거의 없는 추론 워크로드의 유휴 비용을 줄이면서, 동시에 트래픽 급증 시에도 견디게 하려 한다. 가장 적절한 조합은?

A) 단일 대형 GPU 인스턴스를 항상 가동  
B) Serverless Inference 또는 Auto Scaling이 적용된 실시간 엔드포인트  
C) Managed Spot Training으로 추론  
D) 엔드포인트를 수동으로 매일 켜고 끄기  

**정답: B**  
해설: 간헐 트래픽은 Serverless로 유휴 비용을 없애거나, 변동이 크면 Auto Scaling으로 급증을 흡수하는 실시간 엔드포인트가 적합하다. 항상 가동(A)은 낭비, Spot Training(C)은 학습용, 수동 운영(D)은 신뢰성이 낮다.

---
