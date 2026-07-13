# Day 3 - Full-Length Practice Test: Four-Domain Integrated Scenarios

Today runs exam-pace **full scenarios** mixing four domains without labels. Real exam won't say "this is Domain 1." Instead: "Fintech fraud detection with imbalanced data, real-time inference, cost limit, multi-team tracking" blends Domains 1, 2, 3, 4. Core skill: **spot decision keywords, translate to functions fast.**

## Practice Test Method

Eight scenarios below. Try to finish in ~16 minutes (2 min/question), then check answers. Before looking, ask yourself: "What domain(s)? Which keywords unlock the answer?" If wrong, explain "why this trap, why that's best."

> 💡 **Related Theory**: Compound questions usually hide 2-3 keywords each. "Hundreds of identical models (→MME) + sporadic calls (→cost cut) + same framework (→MME confirmed)." Extract each, map to function, pick option satisfying all. Mismatch-hunting eliminates traps.

## Quick Reference by Domain

| Domain | Keywords → Function |
|--------|--------|
| 1 Data | Real-time→Kinesis, visual prep→Data Wrangler, feature match→Feature Store, bias→Clarify |
| 2 Model | Time series→DeepAR, anomaly→RCF, efficient tune→Bayesian/Hyperband, imbalance→F1/Recall |
| 3 Deploy | Sporadic+0-scale→serverless, bulk→batch, ML CI/CD→Pipelines, event trigger→EventBridge |
| 4 Monitor | Drift→Model Monitor, isolate→VPC Endpoint, encrypt at-rest→KMS, audit→CloudTrail |

Now eight scenarios.

---

## 📝 연습 문제

**문제 1.** 핀테크 회사가 신용카드 사기를 실시간으로 탐지하려 한다. 거래의 99.7%가 정상이며, 사기를 놓치는 비용이 매우 크다. 어떤 평가 지표를 우선해야 하는가?

A) Accuracy  
B) Recall(과 보조로 F1·AUC-ROC)  
C) RMSE  
D) R² 결정계수  

**정답: B**  
해설: 극심한 불균형(99.7% 정상)에서 사기를 놓치는 비용이 크면 거짓음성을 최소화하는 Recall을 우선하고 전반 균형은 F1·AUC로 본다. A는 "전부 정상" 예측만으로 99.7%가 나와 사기 탐지력을 못 보여주고, C·D는 회귀 지표라 분류 평가에 부적합하다.

---

**문제 2.** 전국 2,000개 매장에 매장별 수요 예측 XGBoost 모델이 있다. 각 모델은 하루 몇 번만 호출되며, 2,000개 엔드포인트 비용이 부담이다. 가장 비용 효율적인 배포는?

A) 매장마다 별도 실시간 엔드포인트  
B) 멀티모델 엔드포인트(MME)  
C) 멀티컨테이너 엔드포인트(MCE)  
D) 2,000개를 묶은 추론 파이프라인  

**정답: B**  
해설: "같은 프레임워크(XGBoost) 모델이 매우 많고 개별 호출 빈도가 낮다"는 MME의 정확한 조건으로, 소수 인스턴스에 모델을 동적 로드·공유해 비용을 크게 낮춘다. A는 2,000개 엔드포인트로 비용이 폭발하고, C는 서로 다른 프레임워크 소수 모델용이며, D는 전처리→추론 순차 체인이라 다수 모델 서빙과 무관하다.

---

**문제 3.** 의료 영상 모델이 개별 요청당 250MB 이미지를 받아 약 8분간 추론하며, 결과는 완료 후 S3에서 수령한다. 가장 적절한 추론 옵션은?

A) 실시간 엔드포인트  
B) 서버리스 추론  
C) 비동기 추론  
D) 배치 변환  

**정답: C**  
해설: 페이로드 250MB와 처리 8분은 실시간/서버리스 한계(6MB·4MB / 60초)를 초과하고, 개별 요청을 큐로 받아 결과를 S3에 저장하는 패턴은 비동기 추론(최대 1GB·60분)과 정확히 일치한다. A·B는 페이로드·시간 제약으로 탈락하고, D는 전체 데이터셋 일괄 방식이라 "개별 요청" 패턴과 다르다.

---

**문제 4.** 규제 대상 데이터로 학습하는데, 학습 컨테이너가 인터넷을 거치지 않고 S3·ECR에 접근하고 외부로의 데이터 유출을 차단해야 한다. 가장 적절한 구성은?

A) IAM 정책만 강화  
B) VPC 내 학습 + S3·ECR VPC 엔드포인트 + 네트워크 격리(EnableNetworkIsolation)  
C) KMS 암호화만 적용  
D) 퍼블릭 서브넷 + 보안그룹  

**정답: B**  
해설: VPC 내부 학습 + VPC 엔드포인트로 인터넷 비경유 접근 + 네트워크 격리로 외부 통신 차단의 조합이 요구를 정확히 충족한다. A는 권한만으로 네트워크 격리가 안 되고, C는 저장 암호화일 뿐 네트워크와 무관하며, D는 퍼블릭 노출이 남아 유출 차단 요구에 어긋난다.

---

**문제 5.** 데이터 사이언티스트가 코드를 거의 작성하지 않고 S3 데이터셋을 시각적으로 탐색·정제하고 결측 대치·인코딩을 적용한 뒤 그 흐름을 학습 파이프라인으로 내보내려 한다. 가장 적절한 도구는?

A) Amazon EMR(Spark 직접 코딩)  
B) SageMaker Data Wrangler  
C) Amazon Athena  
D) AWS Lambda  

**정답: B**  
해설: Data Wrangler는 비주얼 인터페이스로 데이터 탐색·정제·특성 변환을 코드 없이 수행하고 그 흐름을 처리 작업·파이프라인으로 내보낼 수 있어 요구와 일치한다. A는 직접 Spark 코딩이 필요하고, C는 SQL 분석 쿼리 도구이며, D는 범용 함수 실행으로 비주얼 데이터 준비 기능이 없다.

---

**문제 6.** 운영 중인 모델의 예측 정확도가 시간이 지나며 떨어지는지(실제 정답 대비) 감시하려 한다. 어떤 구성이 필요한가?

A) Model Monitor — Data Quality 모니터만  
B) Model Monitor — Model Quality 모니터 + 실제 정답(ground truth) 수집  
C) Clarify 편향 분석 일회 실행  
D) CloudTrail 로그 분석  

**정답: B**  
해설: 예측 성능 저하(정답 대비)를 감시하려면 Model Quality 모니터가 필요하며, 이를 계산하려면 실제 정답 라벨을 수집해 예측과 대조해야 한다. A의 Data Quality는 입력 분포 변화만 보고 정답 대비 성능을 평가하지 못하고, C는 일회성 편향 분석이며, D는 API 감사 로그라 모델 성능과 무관하다.

---

**문제 7.** 다변량 시계열 판매 데이터로 향후 30일 수요를 예측하려 한다. 여러 관련 시계열의 패턴을 함께 학습하는 데 가장 적합한 SageMaker 빌트인 알고리즘은?

A) Linear Learner  
B) DeepAR  
C) K-Means  
D) Random Cut Forest  

**정답: B**  
해설: DeepAR은 여러 관련 시계열을 함께 학습해 미래 구간을 예측하는 데 특화된 빌트인 알고리즘으로 다변량 수요 예측에 적합하다. A는 단순 회귀로 시계열 구조를 못 살리고, C는 클러스터링, D는 이상 탐지 알고리즘이라 예측 목적과 다르다.

---

**문제 8.** 새 학습 데이터가 S3에 들어올 때마다 자동으로 재학습→평가→(기준 통과 시)등록을 수행하고, 모델 버전과 승인 상태를 관리하려 한다. 가장 적절한 조합은?

A) cron으로 단일 학습 작업만 반복  
B) EventBridge 트리거 → SageMaker Pipeline(ConditionStep) → Model Registry 등록/승인  
C) 사람이 수동으로 노트북 실행  
D) Model Monitor가 재학습을 직접 수행  

**정답: B**  
해설: EventBridge가 S3 이벤트로 Pipeline을 시작하고, ConditionStep이 평가 기준 통과 시에만 Model Registry에 등록·승인 관리하게 하는 것이 자동 재학습 MLOps의 표준 패턴이다. A는 평가·조건·버전관리가 없고, C는 자동화가 아니며, D는 Model Monitor가 재학습 실행 주체가 아니라 부적절하다.

---


## 📝 연습 문제

**문제 1-5** [Practice questions in Korean follow after marker]

---
