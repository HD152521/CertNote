# Day 5 - Week 5 종합 복습: 책임 있는 AI·보안·거버넌스를 하나로 묶기

이번 주는 "AI를 어떻게 책임 있게 만들고 운영하는가"라는 어른스러운 질문을 통과했다. 월요일엔 책임 있는 AI의 원칙(공정성·편향·투명성·설명가능성·견고성·프라이버시), 화요일엔 그것을 구현하는 AWS 도구(Clarify·Model Monitor·Guardrails·AI Service Cards), 수요일엔 기술적 방어(IAM·암호화·PII·PrivateLink·책임 공유), 목요일엔 조직적 관리(데이터·모델 거버넌스·감사·생성형 AI 법·윤리)를 봤다.

오늘은 이 네 조각을 하나의 큰 그림으로 묶는다. 시험은 "이 시나리오에 맞는 원칙/도구/방어는?"으로 엮어 묻기 때문에, 개념 간 연결을 잡는 것이 핵심이다. 새 내용보다 핵심을 다시 꿰고 자주 나오는 매핑과 함정을 정리한다.

## 한 장으로 보는 Week 5

```
[Day1] 원칙 (무엇을 지켜야 하나)
        공정성·편향 / 투명성·설명가능성 / 견고성·프라이버시 / 안전성·HITL
          │  (이 원칙들을 AWS로 어떻게?)
          ▼
[Day2] 책임 있는 AI 도구 (원칙 → AWS 구현)
        Clarify(편향+설명) / Model Monitor(운영감시)
        Guardrails(안전+PII) / AI Service Cards(투명성)
          │  (신뢰의 토대엔 기술 방어가 필요)
          ▼
[Day3] 보안 (기술적 방어)
        책임 공유 모델 / IAM 최소권한 / 암호화(저장·전송)
        PII 보호(Macie·Comprehend) / PrivateLink
          │  (방어 위에 조직적 관리·증명)
          ▼
[Day4] 거버넌스·규정 준수 (관리·추적·증명)
        데이터(출처·품질) / 모델(버전·문서·승인)
        감사(CloudTrail·CloudWatch·Config) / 생성형 AI 법·윤리
```

이 흐름 하나면 Week 5의 80%가 복습된다. "원칙 → 도구 → 보안 → 거버넌스"로 점점 구체화·조직화된다고 기억하면 된다.

## 핵심 용어 빠른 정리

| 용어 | 한 줄 정의 |
|------|-----------|
| 공정성 | 특정 집단을 차별하지 않는 결과 |
| 편향 | 데이터·모델의 편견(불공정의 원인) |
| 투명성 | 시스템의 용도·한계를 공개 |
| 설명가능성 | 특정 출력이 왜 나왔는지 설명 |
| 견고성 | 이상 입력·공격에도 안정적 |
| 프라이버시 | 개인정보(PII) 보호 |
| Human-in-the-Loop | 고위험 결정에 사람 검토 |
| SageMaker Clarify | 편향 측정 + 설명가능성 |
| Model Monitor | 배포 후 드리프트·품질 감시 |
| Bedrock Guardrails | 유해 콘텐츠·PII·주제 제한 |
| AI Service Cards | AWS AI 서비스 투명성 문서 |
| 책임 공유 모델 | AWS=인프라, 고객=데이터·접근 |
| IAM 최소 권한 | 꼭 필요한 만큼만 권한 부여 |
| KMS | 암호화 키 관리(저장 중 암호화) |
| Macie | S3 PII 자동 탐지 |
| Comprehend(PII) | 텍스트 PII 탐지·마스킹 |
| PrivateLink | 인터넷 안 거치는 프라이빗 연결 |
| 데이터 출처(lineage) | 데이터의 출처·변환 추적 |
| CloudTrail | API 호출 감사 로그 |

> 💡 **관련 이론**: 이 용어들은 "원칙 → 그 원칙을 지키는 AWS 수단"의 짝으로 외우면 오래 간다. 공정성/편향→Clarify, 안전·프라이버시→Guardrails, 투명성→AI Service Cards, 접근→IAM, 데이터 보호→KMS·Macie·Comprehend, 경로→PrivateLink, 증명→CloudTrail.

## 자주 나오는 비교 정리

**투명성 vs 설명가능성**: 투명성은 "이 시스템이 무엇인지 공개", 설명가능성은 "이 결정이 왜 나왔는지 설명". 전자는 AI Service Cards, 후자는 Clarify와 연결.

**Clarify vs Model Monitor**: Clarify는 편향 측정·설명(주로 학습 전후), Model Monitor는 배포 후 드리프트·품질 감시. 둘은 연동돼 편향 드리프트도 감시.

**CloudTrail vs CloudWatch**: CloudTrail="누가 무엇을 했나"(감사·추적), CloudWatch="시스템이 어떻게 동작하나"(성능·지표).

**암호화 vs PrivateLink**: 암호화는 내용 보호(저장·전송), PrivateLink는 경로 보호(인터넷 우회). 다른 층의 방어.

**Macie vs Comprehend PII**: Macie는 S3 저장 데이터에서 PII 탐지, Comprehend는 텍스트에서 PII 식별·마스킹.

> ⚠️ **함정**: 시험에서 가장 헷갈리는 것들. ① "편향 = 나쁜 의도"가 아니다(대개 무의도적, 데이터로 유입). ② "데이터가 많으면 편향이 사라진다"는 틀림(치우치면 그대로 학습). ③ "Model Monitor가 모델을 자동 수정한다"는 틀림(감지·경보만). ④ "책임 공유 모델에서 데이터 접근 제어는 AWS 책임"은 틀림(고객 책임). ⑤ "투명성과 설명가능성은 같다"는 틀림.

## AWS 서비스 매핑 (AIF에서 자주 묻는 연결)

| 필요 | AWS 서비스/기능 |
|------|-----------------|
| 데이터·모델 편향 측정 + 결정 설명 | SageMaker Clarify |
| 배포된 모델 품질·드리프트 감시 | SageMaker Model Monitor |
| 생성형 AI 유해 콘텐츠·PII·주제 제한 | Bedrock Guardrails |
| AI 서비스 용도·한계 투명성 문서 | AI Service Cards |
| 접근 권한 최소화 관리 | IAM(최소 권한) |
| 저장 데이터 암호화 키 관리 | AWS KMS |
| S3 내 PII 자동 탐지 | Amazon Macie |
| 텍스트 PII 탐지·마스킹 | Amazon Comprehend |
| 인터넷 안 거치는 프라이빗 연결 | AWS PrivateLink |
| API 호출 감사 로그 | AWS CloudTrail |
| 모델 버전·승인 관리 | SageMaker Model Registry |

> 🔍 **더 깊이**: 시험 시나리오는 "문제 상황 → 적합한 수단"으로 묻는다. "편향 점검"→Clarify, "배포 후 성능 하락 감지"→Model Monitor, "출력에서 욕설·개인정보 차단"→Guardrails, "누가 모델을 배포했는지 감사"→CloudTrail, "데이터가 인터넷을 안 거치게"→PrivateLink. 키워드와 서비스의 짝을 외우면 변형 문제도 풀린다.

## 셀프 체크 (머릿속으로 답해보기)

1. 공정성과 편향의 관계를 한 문장으로?
2. 투명성과 설명가능성의 차이는?
3. 편향에 대한 두 가지 흔한 오해는?
4. Clarify와 Model Monitor의 역할 차이는?
5. 책임 공유 모델에서 고객이 책임지는 것 세 가지는?
6. IAM 최소 권한 원칙이 왜 중요한가?
7. 저장 중·전송 중 암호화의 수단은 각각?
8. Macie와 Comprehend PII의 적용 대상 차이는?
9. PrivateLink가 해결하는 문제는?
10. CloudTrail과 CloudWatch의 차이는?
11. 생성형 AI의 법적·윤리 쟁점 세 가지는?
12. 고위험 결정을 보강하는 안전장치는?

막히는 항목이 있으면 그 날의 글로 돌아가자. 답이 술술 나오면 Week 5는 합격이다.

> 📚 **사례**: 한 핀테크가 생성형 AI 대출 상담 서비스를 책임 있게 출시했다. ① 학습 데이터의 출처·품질을 점검하고 PII를 Comprehend로 마스킹(거버넌스+프라이버시), ② Clarify로 특정 집단 편향을 측정·완화(공정성), ③ IAM 최소 권한과 KMS 암호화, PrivateLink로 데이터를 보호(보안), ④ Bedrock Guardrails로 출력에서 부적절한 투자·금융 조언과 PII를 차단(안전), ⑤ 대출 거절 같은 고위험 결정은 사람이 검토(HITL)하고 설명을 제공(설명가능성), ⑥ 모든 작업을 CloudTrail로 로깅하고 Model Monitor로 운영을 감시(거버넌스·감사). Week 5의 모든 조각이 하나의 시스템에서 맞물린 사례다.

## 정리하며 — 그리고 다음으로

Week 5에서 우리는 "AI를 책임 있게 만들고 지키는 법"을 한 바퀴 돌았다. 핵심은 세 문장으로 압축된다. **책임 있는 AI는 공정성·투명성·설명가능성·프라이버시 등의 원칙을 SageMaker Clarify·Model Monitor·Bedrock Guardrails·AI Service Cards로 구현하고, IAM·암호화·PII 보호·PrivateLink로 기술적으로 방어하며, 데이터·모델 거버넌스와 CloudTrail 감사로 추적·증명한다.** 그리고 그 모든 것의 전제는 "고객은 클라우드 안에서의 보안을 책임진다"는 책임 공유 모델이다.

이 한 장의 그림이 시험장에서 시나리오 문제를 만났을 때, "이건 어느 원칙이고 어느 도구인가"를 빠르게 짚어주는 나침반이 되어줄 것이다.

---

## 📝 연습 문제

**문제 1.** Week 5의 흐름을 종합할 때, 다음을 "원칙 → AWS 구현 도구"로 올바르게 연결한 것은?

A) 투명성 - SageMaker Clarify  
B) 편향·설명가능성 - SageMaker Clarify  
C) 안전성·PII 보호 - AWS CloudTrail  
D) 운영 감시 - AI Service Cards  

**정답: B**  
해설: SageMaker Clarify는 편향 측정과 설명가능성을 함께 구현한다. A는 투명성에 AI Service Cards가, C는 안전성·PII에 Bedrock Guardrails가, D는 운영 감시에 Model Monitor가 맞으므로 짝이 어긋났다.

---

**문제 2.** 다음 중 책임 공유 모델에서 "고객의 책임"으로 보기 어려운 것은?

A) IAM으로 데이터 접근 권한을 설정하는 것  
B) 데이터를 분류하고 암호화 정책을 정하는 것  
C) AWS 데이터센터의 물리적 보안을 운영하는 것  
D) VPC 네트워크 구성을 설정하는 것  

**정답: C**  
해설: 데이터센터의 물리적 보안은 "클라우드 자체의 보안"으로 AWS의 책임이다. A·B·D는 모두 "클라우드 안에서의 보안"으로 고객이 책임지는 영역이다.

---

**문제 3.** 한 팀이 배포된 모델의 성능이 시간이 지나며 떨어지는지 감지하고, 동시에 편향이 심해지는지(편향 드리프트)도 감시하려 한다. 가장 적절한 조합은?

A) AI Service Cards 단독  
B) SageMaker Model Monitor(+ Clarify 연동)  
C) AWS PrivateLink 단독  
D) Amazon Macie 단독  

**정답: B**  
해설: Model Monitor는 배포 후 데이터·모델 품질 드리프트를 감시하며, Clarify와 연동해 편향 드리프트도 감시할 수 있다. A는 투명성 문서, C는 네트워크 경로 보호, D는 S3 PII 탐지로 운영 중 모델 감시 용도가 아니다.

---

**문제 4.** 다음 함정 중 옳은(올바른) 설명은?

A) 데이터가 충분히 많으면 편향은 자동으로 사라진다  
B) Model Monitor는 문제를 감지하면 모델을 자동으로 재학습·재배포한다  
C) CloudTrail은 "누가 무엇을 했는지" 감사 로그를 남기고, CloudWatch는 성능·지표를 모니터링한다  
D) 책임 공유 모델에서 고객 데이터 접근 제어는 AWS의 책임이다  

**정답: C**  
해설: CloudTrail은 API 호출 감사, CloudWatch는 성능·지표 모니터링으로 올바른 구분이다. A는 데이터가 치우치면 편향이 남으므로 틀렸고, B는 Model Monitor가 감지·경보만 하므로 틀렸으며, D는 접근 제어가 고객 책임이라 틀렸다.

---

**문제 5.** 한 기업이 생성형 AI 서비스를 책임 있게 출시하려 한다. 다음 중 가장 적절하지 않은 조치는?

A) Bedrock Guardrails로 출력의 유해 콘텐츠와 PII를 차단한다  
B) 고위험 결정은 Human-in-the-Loop로 사람이 검토한다  
C) 모든 작업을 CloudTrail로 로깅해 사후 감사 가능성을 확보한다  
D) 모든 직원에게 모델·데이터 전체 접근 권한을 부여해 협업을 극대화한다  

**정답: D**  
해설: 전체 접근 권한 부여는 IAM 최소 권한 원칙과 거버넌스에 정면으로 반하는 위험한 조치다. A의 Guardrails, B의 HITL, C의 CloudTrail 감사 로깅은 모두 책임 있는 AI·보안·거버넌스의 올바른 실천이다.

---
