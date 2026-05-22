# 🏆 AWS Certified Solutions Architect - Professional (SAP-C02) 16주 학습 커리큘럼

> **목표**: AWS Certified Solutions Architect - Professional 자격증 취득
> **총 학습 기간**: 16주 × 5일 = 80일
> **타겟**: 시니어 아키텍트/엔지니어 출퇴근 학습 (하루 15-25분 핵심 / 주말 심화)
> **선수 자격**: SAA-C03 (권장), 2년 이상 AWS 실무 경험

---

## 📋 시험 정보

| 항목 | 내용 |
|------|------|
| 시험 코드 | SAP-C02 |
| 시험 시간 | 180분 |
| 문제 수 | 75문항 (객관식·복수응답) |
| 합격 점수 | 750 / 1000 |
| 시험 비용 | USD $300 |
| 유효 기간 | 3년 |
| 응시 자격 | 권장: AWS 2년 이상 실무 |

---

## 📊 시험 도메인 및 비중

| 도메인 | 내용 | 비중 |
|--------|------|------|
| 1. 복잡한 조직을 위한 설계 | 멀티 계정, Organizations, SCP, 네트워크 통합 | 26% |
| 2. 신규 솔루션 설계 | 가용성·성능·보안·비용을 모두 만족하는 신규 아키텍처 | 29% |
| 3. 기존 솔루션의 마이그레이션·현대화 | 7R 전략, MGN/DMS, 컨테이너화·서버리스화 | 20% |
| 4. 지속적 개선 | 운영 우수성, 자동화, 비용·성능·복원력 최적화 | 25% |

---

## 🎯 SAA와 SAP의 결정적 차이

| 항목 | SAA (Associate) | SAP (Professional) |
|------|-----------------|--------------------|
| 질문 길이 | 짧음 (2-4줄) | 매우 길음 (10줄+ 시나리오) |
| 선택지 | 단순 | 모두 그럴듯해 보임 — "가장 비용 효율적"·"가장 운영 부담 적은" 키워드로 가려야 함 |
| 서비스 수 | 단일 서비스 | 5-10개 서비스 통합 |
| 답안 깊이 | "정답" | "트레이드오프 기반 최적해" |
| 키워드 | "가장 가용성 높은" | "운영 오버헤드 최소"·"비용 최소"·"확장성"·"장애 격리" |

---

## 📅 16주 학습 계획

### Week 1: SAA 핵심 빠른 복습 + Pro 시험 전략
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week1/day1.md](week1/day1.md) | SAP 시험 전략과 질문 분해 기법 |
| 화 | [week1/day2.md](week1/day2.md) | IAM·STS·Identity Federation 복습 심화 |
| 수 | [week1/day3.md](week1/day3.md) | VPC·서브넷·라우팅·보안 그룹 복습 심화 |
| 목 | [week1/day4.md](week1/day4.md) | EC2/EBS/ELB/Auto Scaling 복습 심화 |
| 금 | [week1/day5.md](week1/day5.md) | Week 1 복습 + 시나리오 10문항 |

### Week 2: 멀티 계정 아키텍처
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week2/day1.md](week2/day1.md) | AWS Organizations 구조와 OU 설계 |
| 화 | [week2/day2.md](week2/day2.md) | SCP (Service Control Policy) 패턴 |
| 수 | [week2/day3.md](week2/day3.md) | AWS Control Tower와 Landing Zone |
| 목 | [week2/day4.md](week2/day4.md) | IAM Identity Center, Permission Set, 통합 결제 |
| 금 | [week2/day5.md](week2/day5.md) | Week 2 복습 + 시나리오 10문항 |

### Week 3: 고급 네트워킹
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week3/day1.md](week3/day1.md) | VPC Peering vs Transit Gateway 선택 |
| 화 | [week3/day2.md](week3/day2.md) | Direct Connect 아키텍처와 이중화 |
| 수 | [week3/day3.md](week3/day3.md) | Site-to-Site VPN과 Client VPN 패턴 |
| 목 | [week3/day4.md](week3/day4.md) | PrivateLink, VPC Endpoint, Service Endpoint |
| 금 | [week3/day5.md](week3/day5.md) | Week 3 복습 + 시나리오 10문항 |

### Week 4: 하이브리드 클라우드
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week4/day1.md](week4/day1.md) | AWS Outposts, Local Zones, Wavelength |
| 화 | [week4/day2.md](week4/day2.md) | Storage Gateway 4종 비교 |
| 수 | [week4/day3.md](week4/day3.md) | Snow Family와 대규모 데이터 전송 |
| 목 | [week4/day4.md](week4/day4.md) | EKS Anywhere, ECS Anywhere, 하이브리드 컨테이너 |
| 금 | [week4/day5.md](week4/day5.md) | Week 4 복습 + 시나리오 10문항 |

### Week 5: 글로벌 아키텍처
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week5/day1.md](week5/day1.md) | Multi-Region 아키텍처 패턴 |
| 화 | [week5/day2.md](week5/day2.md) | Route 53 라우팅 정책 7종 |
| 수 | [week5/day3.md](week5/day3.md) | CloudFront 심화, Origin Failover, OAC |
| 목 | [week5/day4.md](week5/day4.md) | Global Accelerator vs CloudFront |
| 금 | [week5/day5.md](week5/day5.md) | Week 5 복습 + 시나리오 10문항 |

### Week 6: 마이그레이션
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week6/day1.md](week6/day1.md) | 7R 마이그레이션 전략 (Retire ~ Refactor) |
| 화 | [week6/day2.md](week6/day2.md) | AWS Application Migration Service (MGN) |
| 수 | [week6/day3.md](week6/day3.md) | AWS Database Migration Service (DMS) + SCT |
| 목 | [week6/day4.md](week6/day4.md) | App2Container, AWS MAP, Migration Hub |
| 금 | [week6/day5.md](week6/day5.md) | Week 6 복습 + 시나리오 10문항 |

### Week 7: 컨테이너
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week7/day1.md](week7/day1.md) | ECS vs EKS vs Fargate 선택 기준 |
| 화 | [week7/day2.md](week7/day2.md) | EKS 심화 — 노드 그룹, IRSA, Karpenter |
| 수 | [week7/day3.md](week7/day3.md) | Fargate 패턴과 비용 최적화 |
| 목 | [week7/day4.md](week7/day4.md) | App Mesh, Service Connect, Cloud Map |
| 금 | [week7/day5.md](week7/day5.md) | Week 7 복습 + 시나리오 10문항 |

### Week 8: 서버리스 심화
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week8/day1.md](week8/day1.md) | Lambda 고급 — 동시성, Provisioned, SnapStart |
| 화 | [week8/day2.md](week8/day2.md) | Step Functions 워크플로우 패턴 |
| 수 | [week8/day3.md](week8/day3.md) | EventBridge — Bus, Pipes, Scheduler |
| 목 | [week8/day4.md](week8/day4.md) | AppSync, SQS·SNS 패턴, 이벤트 기반 아키텍처 |
| 금 | [week8/day5.md](week8/day5.md) | Week 8 복습 + 시나리오 10문항 |

### Week 9: 데이터 아키텍처
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week9/day1.md](week9/day1.md) | 데이터 레이크 아키텍처 (S3 + Glue + Athena) |
| 화 | [week9/day2.md](week9/day2.md) | Redshift 심화와 RA3, Spectrum |
| 수 | [week9/day3.md](week9/day3.md) | EMR, Glue, MWAA — 빅데이터 파이프라인 |
| 목 | [week9/day4.md](week9/day4.md) | Lake Formation, 데이터 거버넌스, MSK |
| 금 | [week9/day5.md](week9/day5.md) | Week 9 복습 + 시나리오 10문항 |

### Week 10: ML/AI 아키텍처
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week10/day1.md](week10/day1.md) | SageMaker 전체 라이프사이클 |
| 화 | [week10/day2.md](week10/day2.md) | Bedrock, GenAI 아키텍처, RAG 패턴 |
| 수 | [week10/day3.md](week10/day3.md) | AI 서비스 (Comprehend, Textract, Rekognition 등) |
| 목 | [week10/day4.md](week10/day4.md) | ML 운영 (MLOps), Feature Store, Model Registry |
| 금 | [week10/day5.md](week10/day5.md) | Week 10 복습 + 시나리오 10문항 |

### Week 11: 보안 심화
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week11/day1.md](week11/day1.md) | KMS 심화 — Key Policy, Grant, 멀티 리전 키 |
| 화 | [week11/day2.md](week11/day2.md) | Macie, GuardDuty, Inspector — 데이터·위협·취약점 |
| 수 | [week11/day3.md](week11/day3.md) | Security Hub, Detective, Audit Manager 통합 |
| 목 | [week11/day4.md](week11/day4.md) | WAF·Shield·Firewall Manager — 엣지 보안 |
| 금 | [week11/day5.md](week11/day5.md) | Week 11 복습 + 시나리오 10문항 |

### Week 12: 비용 최적화 심화
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week12/day1.md](week12/day1.md) | Savings Plans·RI 전략 완전 정복 |
| 화 | [week12/day2.md](week12/day2.md) | Compute Optimizer, Rightsizing |
| 수 | [week12/day3.md](week12/day3.md) | Cost Explorer, Budgets, CUR (Cost & Usage Report) |
| 목 | [week12/day4.md](week12/day4.md) | S3 비용 최적화, 데이터 전송 비용, NAT Gateway |
| 금 | [week12/day5.md](week12/day5.md) | Week 12 복습 + 시나리오 10문항 |

### Week 13: 운영 우수성 (Well-Architected 6 기둥)
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week13/day1.md](week13/day1.md) | Well-Architected Framework 개요·Tool |
| 화 | [week13/day2.md](week13/day2.md) | 운영 우수성·보안 기둥 심화 |
| 수 | [week13/day3.md](week13/day3.md) | 안정성·성능 효율성 기둥 심화 |
| 목 | [week13/day4.md](week13/day4.md) | 비용·지속 가능성 기둥 심화 |
| 금 | [week13/day5.md](week13/day5.md) | Week 13 복습 + 시나리오 10문항 |

### Week 14: 복원력·DR
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week14/day1.md](week14/day1.md) | DR 4가지 전략과 RTO/RPO 매핑 |
| 화 | [week14/day2.md](week14/day2.md) | 백업 — AWS Backup, Cross-Region Copy |
| 수 | [week14/day3.md](week14/day3.md) | Resilience Hub, Fault Injection Simulator |
| 목 | [week14/day4.md](week14/day4.md) | RDS·Aurora·DynamoDB Global의 DR |
| 금 | [week14/day5.md](week14/day5.md) | Week 14 복습 + 시나리오 10문항 |

### Week 15: 종합 시나리오 케이스
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week15/day1.md](week15/day1.md) | 대기업 - 글로벌 ERP 마이그레이션 |
| 화 | [week15/day2.md](week15/day2.md) | 스타트업 - 빠른 성장·비용 최적화 |
| 수 | [week15/day3.md](week15/day3.md) | 금융 - 규제·감사·격리·DR |
| 목 | [week15/day4.md](week15/day4.md) | 미디어 - 글로벌 스트리밍·CDN·실시간 |
| 금 | [week15/day5.md](week15/day5.md) | 정부·헬스케어 - 컴플라이언스 종합 |

### Week 16: 최종 복습 + 모의고사
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week16/day1.md](week16/day1.md) | 도메인 1 (복잡한 조직 설계) 종합 |
| 화 | [week16/day2.md](week16/day2.md) | 도메인 2 (신규 솔루션) 종합 |
| 수 | [week16/day3.md](week16/day3.md) | 도메인 3 (마이그레이션) 종합 |
| 목 | [week16/day4.md](week16/day4.md) | 도메인 4 (지속 개선) 종합 |
| 금 | [week16/day5.md](week16/day5.md) | 최종 모의고사 25문항 + 시험 당일 전략 |

---

## 📚 학습 방법

### 출퇴근 학습 (하루 15-25분)
1. **학습 목표 + 사전 지식 (CS 기초)** — 3분
2. **핵심 포인트** — 5분
3. **시나리오 연습 문제 한두 개** — 7분
4. 못 본 부분은 메모해두고 주말 보강

### 주말 심화 (하루 1-2시간)
1. **아키텍처 다이어그램** 직접 손으로 그려보기
2. **트레이드오프 비교표** 정독·자기 말로 다시 정리
3. **AWS CLI 실습** 또는 콘솔에서 만들어보기 (가능한 범위)
4. **연습 문제 전부** 풀고 오답 분석

### Pro 시험 핵심 키워드 사전 (시나리오 해석법)
| 키워드 | 의도 | 우선순위 |
|--------|------|----------|
| "운영 오버헤드 최소" | Managed 우선, Serverless 선호 | Lambda > Fargate > EC2 |
| "비용 효율적" | 사용한 만큼만, Spot/Savings Plans | S3 IA/Glacier, Spot, SP |
| "확장성·탄력성" | Auto Scaling·Serverless | ASG, Lambda, DynamoDB On-Demand |
| "장애 격리" | 멀티 AZ→멀티 리전→멀티 계정 | Org, Cross-Account |
| "최소 권한" | IAM 세분화·SCP·Permission Boundary | IAM Identity Center, SCP |
| "감사·규제" | CloudTrail·Config·Audit Manager | Control Tower |

---

## 🔗 유용한 자료

- [AWS 공식 시험 가이드 (SAP-C02)](https://d1.awsstatic.com/training-and-certification/docs-sa-pro/AWS-Certified-Solutions-Architect-Professional_Exam-Guide.pdf)
- [AWS 공식 샘플 문제](https://aws.amazon.com/ko/certification/certified-solutions-architect-professional/)
- [AWS Skill Builder - SAP 학습 경로](https://skillbuilder.aws/)
- [AWS Well-Architected Framework](https://aws.amazon.com/ko/architecture/well-architected/)
- [AWS Architecture Center](https://aws.amazon.com/ko/architecture/)
- [AWS Decision Guides](https://aws.amazon.com/getting-started/decision-guides/)

---

> 💪 80일의 여정, 매일 한 걸음씩. Pro는 "정답"이 아닌 "최적해"를 고르는 시험입니다. Fighting!
