# 🏆 AWS Certified DevOps Engineer - Professional (DOP-C02) 16주 학습 커리큘럼

> **목표**: AWS Certified DevOps Engineer - Professional 자격증 취득
> **총 학습 기간**: 16주 × 5일 = 80일
> **타겟**: DevOps/플랫폼/SRE 엔지니어 출퇴근 학습 (하루 15-20분 핵심 / 주말 심화)

---

## 📋 시험 정보

| 항목 | 내용 |
|------|------|
| 시험 코드 | DOP-C02 |
| 시험 시간 | 180분 |
| 문제 수 | 75문항 (객관식/복수 선택형) |
| 합격 점수 | 750점 (1000점 만점) |
| 시험 비용 | $300 USD |
| 사전 권장 | Associate 자격증 1개 이상, 2년 이상 AWS 운영 경험 |

## 📊 시험 도메인 및 비중

| 도메인 | 내용 | 비중 |
|--------|------|------|
| 도메인 1 | SDLC 자동화 (CI/CD, 빌드/테스트/배포) | 22% |
| 도메인 2 | 구성 관리 및 IaC (CloudFormation/CDK, SSM) | 17% |
| 도메인 3 | 복원력 있는 클라우드 솔루션 (DR, Multi-AZ/Region) | 15% |
| 도메인 4 | 모니터링 및 로깅 (CloudWatch, X-Ray, OpenSearch) | 15% |
| 도메인 5 | 인시던트 및 이벤트 대응 (EventBridge, SSM Automation) | 14% |
| 도메인 6 | 보안 및 컴플라이언스 (GuardDuty, Config, Audit Manager) | 17% |

## 🎯 Professional 시험의 특징

- 시나리오 기반 문제 다수 — "다음 중 가장 적합한 솔루션은?" 형태
- 단순 정의 X, **다중 서비스 통합** 패턴 중심
- 트레이드오프 비교: "RTO 5분 vs 비용 최저화" 같은 우선순위
- 답이 2~3개가 다 동작은 하지만 1개만 가장 적합한 경우가 많음
- 자동화·복구·롤백 전략 자주 등장 (Lambda + Step Functions + EventBridge 조합)

---

## 📅 16주 학습 계획

### Week 1: DevOps 철학 + AWS DevOps 도구 개관
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week1/day1.md](week1/day1.md) | DevOps 개요, CALMS 모델, DORA 4 metrics |
| 화 | [week1/day2.md](week1/day2.md) | Well-Architected Framework - DevOps 관점 |
| 수 | [week1/day3.md](week1/day3.md) | AWS DevOps 도구 지도 - Code* 시리즈 개관 |
| 목 | [week1/day4.md](week1/day4.md) | 멀티 계정 전략, AWS Organizations, Control Tower |
| 금 | [week1/day5.md](week1/day5.md) | Week 1 복습 + 시나리오 문제 10개 |

### Week 2: 소스 제어 심화 - CodeCommit, GitHub Actions, CodeArtifact
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week2/day1.md](week2/day1.md) | CodeCommit 심화 - 트리거, 브랜치 보호, 크로스 계정 |
| 화 | [week2/day2.md](week2/day2.md) | GitHub Actions ↔ AWS OIDC 통합 |
| 수 | [week2/day3.md](week2/day3.md) | CodeArtifact + 외부 레지스트리(npm/Maven) 프록시 |
| 목 | [week2/day4.md](week2/day4.md) | 코드 서명, 보안 스캔 (CodeGuru Reviewer, Snyk) |
| 금 | [week2/day5.md](week2/day5.md) | Week 2 복습 + 시나리오 문제 10개 |

### Week 3: CodeBuild 심화
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week3/day1.md](week3/day1.md) | buildspec.yml 구조와 페이즈 |
| 화 | [week3/day2.md](week3/day2.md) | CodeBuild 캐싱(S3/Local) + 병렬 빌드 |
| 수 | [week3/day3.md](week3/day3.md) | 시크릿 주입 - Secrets Manager, Parameter Store |
| 목 | [week3/day4.md](week3/day4.md) | VPC CodeBuild, Custom Image, ARM/Graviton 빌드 |
| 금 | [week3/day5.md](week3/day5.md) | Week 3 복습 + 시나리오 문제 10개 |

### Week 4: CodeDeploy 심화 + 배포 전략
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week4/day1.md](week4/day1.md) | In-place vs Blue/Green, AppSpec 파일 구조 |
| 화 | [week4/day2.md](week4/day2.md) | EC2/On-Prem 배포 + Auto Scaling 통합 |
| 수 | [week4/day3.md](week4/day3.md) | Lambda 배포 (Linear/Canary/AllAtOnce) + Alias |
| 목 | [week4/day4.md](week4/day4.md) | ECS Blue/Green + CodeDeploy 트래픽 시프트 |
| 금 | [week4/day5.md](week4/day5.md) | Week 4 복습 + 시나리오 문제 10개 |

### Week 5: CodePipeline 심화
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week5/day1.md](week5/day1.md) | Pipeline 구조 - Stage, Action, Artifact |
| 화 | [week5/day2.md](week5/day2.md) | 멀티 계정 파이프라인 + Cross-Account IAM |
| 수 | [week5/day3.md](week5/day3.md) | Action Providers - Lambda, Step Functions, 수동 승인 |
| 목 | [week5/day4.md](week5/day4.md) | 동적 파이프라인 - V2 + 변수, 트리거 필터링 |
| 금 | [week5/day5.md](week5/day5.md) | Week 5 복습 + 시나리오 문제 10개 |

### Week 6: 컨테이너 CI/CD
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week6/day1.md](week6/day1.md) | ECR - 이미지 스캔, 수명 주기, 복제 |
| 화 | [week6/day2.md](week6/day2.md) | ECS 자동 배포 - Task Definition 자동화 |
| 수 | [week6/day3.md](week6/day3.md) | EKS CI/CD - Helm, ArgoCD, Flux (GitOps) |
| 목 | [week6/day4.md](week6/day4.md) | App Runner / Copilot - 컨테이너 추상화 |
| 금 | [week6/day5.md](week6/day5.md) | Week 6 복습 + 시나리오 문제 10개 |

### Week 7: 서버리스 CI/CD
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week7/day1.md](week7/day1.md) | AWS SAM - 템플릿, 로컬 테스트, 배포 |
| 화 | [week7/day2.md](week7/day2.md) | Serverless Framework / CDK Lambda 패턴 |
| 수 | [week7/day3.md](week7/day3.md) | Lambda 버전/별칭 + CodeDeploy Canary |
| 목 | [week7/day4.md](week7/day4.md) | Step Functions로 배포 워크플로 오케스트레이션 |
| 금 | [week7/day5.md](week7/day5.md) | Week 7 복습 + 시나리오 문제 10개 |

### Week 8: IaC 심화 - CloudFormation/CDK/Terraform
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week8/day1.md](week8/day1.md) | CloudFormation 고급 - Nested Stack, Cross-Stack |
| 화 | [week8/day2.md](week8/day2.md) | StackSets - 멀티 계정/리전 배포 |
| 수 | [week8/day3.md](week8/day3.md) | Drift Detection, Change Set, Custom Resource |
| 목 | [week8/day4.md](week8/day4.md) | CDK + Terraform 통합 패턴 + CDK Pipelines |
| 금 | [week8/day5.md](week8/day5.md) | Week 8 복습 + 시나리오 문제 10개 |

### Week 9: 구성 관리 - SSM, AppConfig, Secrets
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week9/day1.md](week9/day1.md) | Systems Manager - Run Command, Patch Manager |
| 화 | [week9/day2.md](week9/day2.md) | SSM State Manager, Inventory, Compliance |
| 수 | [week9/day3.md](week9/day3.md) | AppConfig - 피처 플래그, 점진적 롤아웃 |
| 목 | [week9/day4.md](week9/day4.md) | Parameter Store + Secrets Manager 자동 회전 |
| 금 | [week9/day5.md](week9/day5.md) | Week 9 복습 + 시나리오 문제 10개 |

### Week 10: 모니터링 심화 - CloudWatch
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week10/day1.md](week10/day1.md) | CloudWatch Metrics - 사용자 정의 지표, 차원 |
| 화 | [week10/day2.md](week10/day2.md) | CloudWatch Logs - 그룹/스트림, Subscription, Insights |
| 수 | [week10/day3.md](week10/day3.md) | Container/Lambda Insights, Embedded Metric Format |
| 목 | [week10/day4.md](week10/day4.md) | Synthetics, RUM, Evidently |
| 금 | [week10/day5.md](week10/day5.md) | Week 10 복습 + 시나리오 문제 10개 |

### Week 11: 관찰성 - X-Ray, ADOT
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week11/day1.md](week11/day1.md) | X-Ray 기본 - 세그먼트, 서브세그먼트, Trace |
| 화 | [week11/day2.md](week11/day2.md) | X-Ray 샘플링, 그룹, Service Map 운영 |
| 수 | [week11/day3.md](week11/day3.md) | ADOT (AWS Distro for OpenTelemetry) |
| 목 | [week11/day4.md](week11/day4.md) | OpenSearch / Prometheus / Grafana 통합 |
| 금 | [week11/day5.md](week11/day5.md) | Week 11 복습 + 시나리오 문제 10개 |

### Week 12: 인시던트 대응 자동화
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week12/day1.md](week12/day1.md) | EventBridge - 규칙 패턴, 버스, Pipes |
| 화 | [week12/day2.md](week12/day2.md) | SSM Automation Runbook + Approval |
| 수 | [week12/day3.md](week12/day3.md) | Lambda 자동 복구 패턴 - Auto-Healing |
| 목 | [week12/day4.md](week12/day4.md) | AWS Chatbot, Slack/Teams 통합, Incident Manager |
| 금 | [week12/day5.md](week12/day5.md) | Week 12 복습 + 시나리오 문제 10개 |

### Week 13: 복원력 - DR, Multi-Region
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week13/day1.md](week13/day1.md) | Multi-AZ 패턴 - RDS, Aurora, ElastiCache |
| 화 | [week13/day2.md](week13/day2.md) | Multi-Region - Route 53 페일오버, Global DB |
| 수 | [week13/day3.md](week13/day3.md) | DR 4종 전략 - Backup/Pilot/Warm/Active |
| 목 | [week13/day4.md](week13/day4.md) | Resilience Hub + Fault Injection Simulator |
| 금 | [week13/day5.md](week13/day5.md) | Week 13 복습 + 시나리오 문제 10개 |

### Week 14: 보안 자동화
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week14/day1.md](week14/day1.md) | GuardDuty + 자동 격리 응답 패턴 |
| 화 | [week14/day2.md](week14/day2.md) | Security Hub - Findings 집계, 자동 수정 |
| 수 | [week14/day3.md](week14/day3.md) | AWS Config - Rules, Conformance Pack, Remediation |
| 목 | [week14/day4.md](week14/day4.md) | Audit Manager, Macie, Inspector |
| 금 | [week14/day5.md](week14/day5.md) | Week 14 복습 + 시나리오 문제 10개 |

### Week 15: 종합 시나리오
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week15/day1.md](week15/day1.md) | 멀티 계정 엔터프라이즈 CI/CD 케이스 |
| 화 | [week15/day2.md](week15/day2.md) | Hybrid CI/CD - 온프레미스 + AWS |
| 수 | [week15/day3.md](week15/day3.md) | 대규모 EKS 운영 케이스 - GitOps + Observability |
| 목 | [week15/day4.md](week15/day4.md) | 규제 산업 컴플라이언스 자동화 케이스 |
| 금 | [week15/day5.md](week15/day5.md) | Week 15 복습 + 시나리오 문제 10개 |

### Week 16: 최종 복습 + 모의고사
| 일차 | 파일 | 주제 |
|------|------|------|
| 월 | [week16/day1.md](week16/day1.md) | 도메인 1·2 복습 - SDLC + IaC |
| 화 | [week16/day2.md](week16/day2.md) | 도메인 3·4 복습 - 복원력 + 모니터링 |
| 수 | [week16/day3.md](week16/day3.md) | 도메인 5·6 복습 - 인시던트 + 보안 |
| 목 | [week16/day4.md](week16/day4.md) | 모의고사 75문항 + 해설 |
| 금 | [week16/day5.md](week16/day5.md) | 약점 분석 + 시험 D-Day 체크리스트 |

---

## 📚 학습 방법

- 출퇴근 15-20분: day.md의 🎯 학습 목표 + ⭐ 핵심 포인트 + 📝 연습문제만 훑기
- 주말 1~2시간: 🧠 심화 이론 + 🏗️ 다이어그램 + 💻 CLI 실습
- 매주 금요일 day5: 그 주의 시나리오 문제 10개로 약점 점검
- 마지막 Week 16: 모의고사 후 오답 정리에 집중

## 🔗 유용한 자료

- [DOP-C02 공식 시험 가이드](https://d1.awsstatic.com/training-and-certification/docs-devops-pro/AWS-Certified-DevOps-Engineer-Professional_Exam-Guide.pdf)
- [AWS Well-Architected DevOps Lens](https://docs.aws.amazon.com/wellarchitected/latest/devops-guidance/)
- [AWS Builders' Library](https://aws.amazon.com/builders-library/)
- [AWS Architecture Center - DevOps](https://aws.amazon.com/architecture/devops/)
- [AWS Skill Builder - Exam Readiness: DOP-C02](https://skillbuilder.aws/)

---

> 💪 매일 꾸준히! Professional은 시나리오 싸움입니다. Fighting!
