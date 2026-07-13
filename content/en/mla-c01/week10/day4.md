# Day 4 - Common Traps and Keywords: "Requirement → SageMaker Function" Translation Table

Exams are hard not from unknown concepts but from **failing to translate scenarios into functions**. "Verify prediction is fair" doesn't immediately trigger "Clarify" — you see four options and waver into traps. Today: **requirement keyword→function translation table** and **single traps**. Memorize this table; compound question speed jumps dramatically.

## Core Translation Table — Requirement → Function

| Requirement Keyword | Answer Function |
|------------------|----------|
| Input distribution changed? | Model Monitor (Data Quality) |
| Performance vs actual labels? | Model Monitor (Model Quality) + ground truth |
| Fair/bias check | SageMaker Clarify |
| Which feature contributed? | Clarify (SHAP) |
| Low-cost/sporadic inference (0-scale) | Serverless inference |
| Cheapest bulk scoring | Batch Transform |
| Training cost cut (resumable) | Spot Instance (Managed Spot Training) |
| Deep learning inference cost cut | AWS Inferentia (inf1/inf2) |
| Hundreds of identical models cost | Multi-Model Endpoint (MME) |
| Train-inference feature consistency | Feature Store / inference pipeline |
| ML workflow automation, CI/CD | SageMaker Pipelines |
| Trigger retraining on event | EventBridge |
| Internet-free S3/ECR access | VPC Endpoint (PrivateLink) |
| At-rest data encryption | KMS |
| Who called what API? | CloudTrail |
| Visual data prep, no code | Data Wrangler |
| Training debug, bottleneck | SageMaker Debugger |

> 💡 **Related Theory**: This table's value: "answer from requirements before seeing options." Test options are crafted traps. If you've decided your answer name first, checking if that name appears in options is safest. Read problem → spot keywords → recall function → scan options.

## Confused Pairs — What's Different

Most-confused pairs. Distinguish precisely.

| Confused Pair | Split Basis |
|-----------|----------|
| Model Monitor vs Clarify | Drift watch in ops=Monitor / Bias·explainability analysis=Clarify |
| Data Quality vs Model Quality | Input distribution shift / Performance drop (label needed) |
| MME vs MCE | Same container, many models / Different frameworks, few (≤15) |
| CloudTrail vs CloudWatch | Who did what (API audit) / System metrics, logs, alarms |
| Pipelines vs Step Functions | SageMaker-native ML CI/CD / Generic service orchestration |
| Serverless vs Async | Small payload, short, sporadic / Large payload, long, queue |
| Bayesian vs Hyperband | Few trials, efficient / Early-stop low-performers, save compute |

> ⚠️ **Trap**: Exams intentionally place confused pairs in same question options. "Monitor bias" has Model Monitor Bias Drift AND Clarify as options. "Pre-check"=Clarify (one-time). "Operations watch"=Model Monitor (+Clarify integrated). Tiny condition words ("before deployment" vs "in operations", "one-time" vs "continuous") split answers. Master nuance.

## Trap Type 1 — Imbalanced, but Accuracy Tempts

Imbalanced data (fraud, disease, churn) has Accuracy as attractive option. 99% normal data → "all normal" model = 99% accuracy, catches nothing. Answer almost always **F1, AUC, Recall**. "Miss fraud/disease"=Recall. "False alarm cost high"=Precision.

> 🔍 **Deeper**: Metric depends on "asymmetric cost." False-negative (miss) costly? → Recall. False-positive (alert) costly? → Precision. Both matter? → F1. Threshold adjustment trades Precision-Recall; medical: lower threshold to raise Recall.

## Trap Type 2 — Algorithm Mapping Shuffled

"Time series" + Linear Learner, "anomaly" + K-Means mix similar-looking wrong answers. Map precisely: time series=**DeepAR**, anomaly=**RCF**, cluster=**K-Means**, dimension reduce=**PCA**, tabular classify/regress=**XGBoost**, sparse recommend=**Factorization Machines**, text=**BlazingText**.

## Trap Type 3 — Real-Time to Zero Scale

"Traffic drops to zero, scale real-time endpoint to 0 instances" is wrong. Real-time **enforces ≥1 instance always**. Zero-scale requires **serverless/async/batch**. Also "XGBoost on GPU (p4d)" is trap — trees don't parallelize like tensors; CPU is right.

> ⚠️ **Trap**: "Cost cut" keywords appear in every option, mixed. "Many models"→MME correct. "DL inference"→Inferentia correct. "Sporadic traffic"→serverless/async correct. "XGBoost to GPU" or "real-time to 0" or "drop data for speed" are cost-cut traps breaking other requirements. Cost wins when it doesn't sacrifice performance/availability.

## Summary

Today's core: **translation speed**. Catch scenario keywords (drift, bias, isolate, encrypt, sporadic, bulk, time series, imbalance) → instantly recall function name → check if name in options → spot traps (confused pair confusion, Accuracy on imbalance, algorithm mismatch, real-time 0-scale/GPU). Three trap types — know them, you dodge instantly. Tomorrow: D-day strategy.

---

## 📝 연습 문제

**문제 1.** 배포 전에 모델 예측이 특정 집단에 불공정한지 한 번 점검하고, 동시에 각 특성의 예측 기여도를 SHAP로 보고하려 한다. 가장 적절한 기능은?

A) Model Monitor (Bias Drift)  
B) SageMaker Clarify  
C) CloudWatch 대시보드  
D) Model Registry  

**정답: B**  
해설: "배포 전 일회 점검 + 편향 측정 + SHAP 기여도"는 Clarify의 정확한 역할이다. A의 Bias Drift는 운영 중 지속 감시용이라 "배포 전 일회" 조건과 어긋나고, C는 운영 지표 시각화, D는 모델 버전 관리로 편향·설명과 무관하다.

---

**문제 2.** 학습 작업이 중단되어도 재시작할 수 있고 비용을 최대한 절감하려 한다. 단, 마감이 빠듯하지는 않다. 가장 적절한 선택은?

A) 온디맨드 인스턴스 고정  
B) Managed Spot Training(Spot 인스턴스)  
C) 더 큰 GPU 인스턴스로 빨리 끝내기  
D) 서버리스 추론으로 전환  

**정답: B**  
해설: Managed Spot Training은 중단 가능한 Spot 인스턴스를 써서 학습 비용을 크게 절감하며 체크포인트로 재시작을 지원하므로 "중단 허용 + 비용 절감 + 여유 있는 마감"에 적합하다. A는 절감이 없고, C는 비용을 늘리며, D는 추론 옵션이라 학습 비용 절감과 무관하다.

---

**문제 3.** 다음 중 요구사항과 기능 매핑이 잘못된 것은?

A) 입력 데이터 분포 변화 감지 → Model Monitor(Data Quality)  
B) 누가 엔드포인트를 삭제했는지 감사 → CloudTrail  
C) 인터넷 없이 S3 접근 → KMS 암호화  
D) 동종 모델 수백 개 비용 절감 → 멀티모델 엔드포인트(MME)  

**정답: C**  
해설: 인터넷 없이 S3·ECR에 접근하는 것은 VPC 엔드포인트(PrivateLink)의 역할이며, KMS는 저장 데이터 암호화로 네트워크 경로와 무관하므로 C가 잘못된 매핑이다. A·B·D는 각각 Data Quality 드리프트 감지, CloudTrail API 감사, MME 다수 모델 비용 절감으로 모두 올바른 매핑이다.

---

**문제 4.** 트래픽이 업무 시간에만 있고 야간·주말엔 거의 0으로 떨어지는 사내 도구의 추론 비용을 줄이려 한다. 첫 호출의 약간의 지연(콜드 스타트)은 허용된다. 가장 적절한 옵션은?

A) 실시간 엔드포인트를 0대로 오토스케일  
B) 서버리스 추론  
C) 배치 변환  
D) 더 큰 인스턴스의 실시간 엔드포인트  

**정답: B**  
해설: 간헐적 트래픽 + 0까지 스케일 + 콜드 스타트 허용은 서버리스 추론의 정확한 조건으로 유휴 시 비용이 0에 가깝다. A는 실시간이 최소 1대를 강제해 0 스케일이 불가능하고, C는 즉시 응답이 아닌 일괄 처리이며, D는 always-on 비용을 오히려 늘린다.

---

**문제 5.** Model Monitor의 Data Quality와 Model Quality 모니터 차이로 가장 정확한 것은?

A) Data Quality는 정답 라벨이 필요하고 Model Quality는 필요 없다  
B) Data Quality는 입력 데이터 분포·스키마 변화를 보고, Model Quality는 실제 정답 대비 예측 성능 저하를 보며 ground truth 수집이 필요하다  
C) 둘 다 편향만 측정한다  
D) Model Quality는 학습 전에만 동작한다  

**정답: B**  
해설: Data Quality는 입력 분포·스키마 드리프트를 베이스라인과 비교하고, Model Quality는 실제 정답과 예측을 대조해 성능 저하를 측정하므로 ground truth 라벨 수집이 필요하다. A는 라벨 필요 주체가 뒤바뀌었고, C는 편향만 본다는 잘못된 한정이며, D는 Model Quality가 운영 중 감시 기능이라 사실과 다르다.

---


## 📝 연습 문제

**문제 1-5** [Practice questions in Korean follow after marker]

---
