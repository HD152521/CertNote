# 🏆 AWS Certified CloudOps Engineer - Associate (SOA-C02) 12주 학습 커리큘럼

> **목표**: AWS Certified CloudOps Engineer - Associate (구 SysOps Administrator) 자격증 취득
> **총 학습 기간**: 12주 × 5일 = 60일
> **타겟**: 개발자/엔지니어 출퇴근 학습 (하루 10-20분 핵심 / 주말 심화)

---

## 📋 시험 정보

| 항목 | 내용 |
|------|------|
| 시험 코드 | SOA-C02 |
| 시험 시간 | 180분 |
| 문제 수 | 65문항 (객관식 + 다중 응답) |
| 합격 점수 | 720점 / 1000점 |
| 시험 비용 | $150 USD |
| 비고 | 2024년부터 실습 랩(Exam Labs) 일시 제외, 시나리오형 객관식 비중 ↑ |

## 📊 시험 도메인 및 비중

| 도메인 | 내용 | 비중 |
|--------|------|------|
| 도메인 1 | 모니터링·로깅·수정 (Monitoring, Logging, Remediation) | 20% |
| 도메인 2 | 안정성·BCP (Reliability & Business Continuity) | 16% |
| 도메인 3 | 배포·프로비저닝·자동화 (Deployment, Provisioning, Automation) | 18% |
| 도메인 4 | 보안·컴플라이언스 (Security & Compliance) | 16% |
| 도메인 5 | 네트워킹·콘텐츠 전송 (Networking & Content Delivery) | 18% |
| 도메인 6 | 비용·성능 최적화 (Cost & Performance Optimization) | 12% |

> 💡 SOA-C02는 "운영자(Operator) 관점"의 시험입니다. 어떤 서비스가 무엇인지보다 **"이런 장애가 발생했을 때 어떻게 대응할 것인가"**, **"메트릭/로그를 어떻게 자동화할 것인가"**가 핵심입니다.

---

## 📅 12주 학습 계획

### Week 1: AWS 기초 & 멀티 계정 운영
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week1/day1.md](week1/day1.md) | AWS 글로벌 인프라, 공동 책임 모델 (운영자 관점) |
| 화 | [week1/day2.md](week1/day2.md) | IAM - 사용자, 그룹, 역할, 정책 평가 로직 |
| 수 | [week1/day3.md](week1/day3.md) | IAM 심화 - 권한 경계, SCP, Identity Center |
| 목 | [week1/day4.md](week1/day4.md) | AWS Organizations & 멀티 계정 거버넌스 |
| 금 | [week1/day5.md](week1/day5.md) | Week 1 복습 + 시나리오 10문제 |

### Week 2: CloudWatch Metrics & Logs 기초
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week2/day1.md](week2/day1.md) | CloudWatch Metrics - Namespace, Dimension, 표준/사용자 지정 |
| 화 | [week2/day2.md](week2/day2.md) | CloudWatch Logs - Log Group, Stream, Retention, Subscription |
| 수 | [week2/day3.md](week2/day3.md) | Logs Insights - 쿼리 문법, 트러블슈팅 패턴 |
| 목 | [week2/day4.md](week2/day4.md) | Metric Filter, Embedded Metric Format, Anomaly Detection |
| 금 | [week2/day5.md](week2/day5.md) | Week 2 복습 + 시나리오 10문제 |

### Week 3: 모니터링 심화 (Alarms, Dashboards, Synthetics, RUM)
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week3/day1.md](week3/day1.md) | CloudWatch Alarms - Composite, Anomaly Detection, M of N |
| 화 | [week3/day2.md](week3/day2.md) | Dashboards & 자동 새로고침, Cross-Account/Cross-Region |
| 수 | [week3/day3.md](week3/day3.md) | CloudWatch Agent - 메모리/디스크 메트릭, 통합 로그 수집 |
| 목 | [week3/day4.md](week3/day4.md) | Synthetics Canary, RUM, ServiceLens, X-Ray |
| 금 | [week3/day5.md](week3/day5.md) | Week 3 복습 + 시나리오 10문제 |

### Week 4: 로깅·감사 (CloudTrail, Config, Audit Manager)
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week4/day1.md](week4/day1.md) | CloudTrail - Management/Data Event, Organization Trail |
| 화 | [week4/day2.md](week4/day2.md) | CloudTrail Lake, Insights, EventBridge 연동 |
| 수 | [week4/day3.md](week4/day3.md) | AWS Config - Rule, Conformance Pack, Remediation |
| 목 | [week4/day4.md](week4/day4.md) | Audit Manager, License Manager, Resource Explorer |
| 금 | [week4/day5.md](week4/day5.md) | Week 4 복습 + 시나리오 10문제 |

### Week 5: Systems Manager (운영 자동화의 핵심)
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week5/day1.md](week5/day1.md) | SSM 개요, Agent, Fleet Manager, Inventory |
| 화 | [week5/day2.md](week5/day2.md) | Run Command, State Manager, Maintenance Window |
| 수 | [week5/day3.md](week5/day3.md) | Patch Manager - 베이스라인, 패치 그룹, 컴플라이언스 |
| 목 | [week5/day4.md](week5/day4.md) | Parameter Store, Session Manager, Automation Runbook |
| 금 | [week5/day5.md](week5/day5.md) | Week 5 복습 + 시나리오 10문제 |

### Week 6: IaC - CloudFormation 운영
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week6/day1.md](week6/day1.md) | CloudFormation 기초 - Stack, Template, Resource |
| 화 | [week6/day2.md](week6/day2.md) | Change Set, Drift Detection, Rollback Trigger |
| 수 | [week6/day3.md](week6/day3.md) | Nested Stack, Cross-Stack Reference, StackSets |
| 목 | [week6/day4.md](week6/day4.md) | Service Catalog, AppConfig, AppRegistry |
| 금 | [week6/day5.md](week6/day5.md) | Week 6 복습 + 시나리오 10문제 |

### Week 7: 배포·프로비저닝 (Beanstalk, OpsWorks, CodeDeploy)
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week7/day1.md](week7/day1.md) | Elastic Beanstalk - 배포 정책(All at once/Rolling/Immutable/Blue-Green) |
| 화 | [week7/day2.md](week7/day2.md) | CodeDeploy - In-place vs Blue-Green, AppSpec, Hooks |
| 수 | [week7/day3.md](week7/day3.md) | EC2 Image Builder, AMI 수명주기, Golden Image 운영 |
| 목 | [week7/day4.md](week7/day4.md) | OpsWorks, AWS Proton, Launch Templates 운영 |
| 금 | [week7/day5.md](week7/day5.md) | Week 7 복습 + 시나리오 10문제 |

### Week 8: 네트워킹 운영 (VPC 트러블슈팅)
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week8/day1.md](week8/day1.md) | VPC - 서브넷, 라우팅, NACL vs SG, IPv6 |
| 화 | [week8/day2.md](week8/day2.md) | VPC Flow Logs, Traffic Mirroring, Reachability Analyzer |
| 수 | [week8/day3.md](week8/day3.md) | NAT Gateway, VPC Endpoint, PrivateLink |
| 목 | [week8/day4.md](week8/day4.md) | Transit Gateway, VPN, Direct Connect, Route 53 운영 |
| 금 | [week8/day5.md](week8/day5.md) | Week 8 복습 + 시나리오 10문제 |

### Week 9: 보안 운영 (KMS, Secrets, GuardDuty, Security Hub)
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week9/day1.md](week9/day1.md) | KMS - Key Policy, Grant, 회전, CloudHSM |
| 화 | [week9/day2.md](week9/day2.md) | Secrets Manager 운영 - 자동 회전, Cross-Region Replication |
| 수 | [week9/day3.md](week9/day3.md) | IAM Access Analyzer, Trusted Advisor 보안 체크 |
| 목 | [week9/day4.md](week9/day4.md) | GuardDuty, Security Hub, Inspector, Macie |
| 금 | [week9/day5.md](week9/day5.md) | Week 9 복습 + 시나리오 10문제 |

### Week 10: 백업·DR 운영
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week10/day1.md](week10/day1.md) | EBS Snapshot, AMI, DLM(Data Lifecycle Manager) |
| 화 | [week10/day2.md](week10/day2.md) | AWS Backup - Plan, Vault, Cross-Region/Cross-Account |
| 수 | [week10/day3.md](week10/day3.md) | RDS Multi-AZ vs Read Replica, Aurora Global DB |
| 목 | [week10/day4.md](week10/day4.md) | S3 복제(CRR/SRR), Storage Gateway, Elastic Disaster Recovery |
| 금 | [week10/day5.md](week10/day5.md) | Week 10 복습 + 시나리오 10문제 |

### Week 11: 성능·비용 최적화
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week11/day1.md](week11/day1.md) | Compute Optimizer, Right Sizing, EC2 인스턴스 패밀리 |
| 화 | [week11/day2.md](week11/day2.md) | Trusted Advisor - 5개 체크 카테고리 |
| 수 | [week11/day3.md](week11/day3.md) | Cost Explorer, AWS Budgets, Cost Allocation Tag |
| 목 | [week11/day4.md](week11/day4.md) | Savings Plans, Reserved Instances, Spot 운영 |
| 금 | [week11/day5.md](week11/day5.md) | Week 11 복습 + 시나리오 10문제 |

### Week 12: 최종 복습 & 시나리오 모의고사
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week12/day1.md](week12/day1.md) | 도메인 1·2 복습 (모니터링·로깅 + 안정성·BCP) |
| 화 | [week12/day2.md](week12/day2.md) | 도메인 3·4 복습 (배포·자동화 + 보안·컴플라이언스) |
| 수 | [week12/day3.md](week12/day3.md) | 도메인 5·6 복습 (네트워킹 + 비용·성능) |
| 목 | [week12/day4.md](week12/day4.md) | 트러블슈팅 케이스 모음 (실전 시나리오 20제) |
| 금 | [week12/day5.md](week12/day5.md) | 최종 모의고사 + 약점 분석 |

---

## 📚 학습 방법

- **출퇴근 15-20분**: day.md의 학습 목표 + ⭐ 핵심 포인트 + 연습문제 빠르게 훑기
- **저녁 30-40분**: 이론 본문 + 심화 이론 + 다이어그램 정독
- **주말 1-2시간**: AWS 콘솔 실습 (CloudWatch Alarm 생성, SSM Run Command 실행, CloudFormation 배포 등)
- **금요일**: 그 주 복습 + 시나리오 10문제 풀이

## 🧠 CloudOps 시험 합격 팁

1. **"운영자처럼 생각하기"**: 개발자 시험과 달리, 코드를 짜는 게 아니라 "이미 돌아가는 시스템을 어떻게 모니터링·자동화·복구할 것인가"가 핵심
2. **CloudWatch + SSM 출제 비중 최고**: 두 서비스만 깊이 파도 30점은 확보
3. **시나리오 키워드 캐치**: "비용 효율적", "운영 부하 최소", "자동 복구", "감사 요건 충족" 같은 키워드가 정답의 단서
4. **트러블슈팅 사고 흐름**: 메트릭 → 로그 → CloudTrail → Config 이력 순으로 점검하는 패턴 익히기
5. **차이점 비교 강화**: SG vs NACL, Multi-AZ vs Read Replica, In-place vs Blue-Green, NAT GW vs Endpoint

## 🔗 유용한 자료

- [AWS 공식 시험 가이드 PDF](https://d1.awsstatic.com/training-and-certification/docs-cloudops-engineer-associate/AWS-Certified-CloudOps-Engineer-Associate_Exam-Guide.pdf)
- [AWS Skill Builder - CloudOps Path](https://skillbuilder.aws/)
- [AWS Well-Architected Framework - Operational Excellence Pillar](https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/welcome.html)
- [AWS Systems Manager User Guide](https://docs.aws.amazon.com/systems-manager/)
- [Amazon CloudWatch User Guide](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/)

---

> 💪 운영의 즐거움은 "문제 발생 → 자동 복구"의 미학에 있습니다. 매일 꾸준히, Fighting!
