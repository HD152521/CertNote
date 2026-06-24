# Day 4 - 인시던트 대응 프레임워크: NIST 단계, 런북, 자동화 vs 사람 판단의 경계

지금까지(Day 1~3) 자동 대응 파이프라인, 침해 인스턴스 격리, 자격증명 회수라는 *구체적 기술*을 다뤘다. 오늘은 그것들을 묶는 *프레임워크*를 본다. 도구가 아무리 정교해도 *언제 무엇을 누가 판단하는가*의 체계가 없으면 사고 대응은 혼란에 빠진다. 인시던트 대응(IR, Incident Response)의 본질은 *압박과 불확실성 속에서도 일관된 의사결정을 가능하게 하는 구조*다. 시험은 NIST IR 단계의 정의, 각 단계에서 AWS 서비스의 역할, 그리고 *무엇을 자동화하고 무엇을 사람에게 남길지*의 경계 판단을 묻는다.

AWS는 자체 *AWS Security Incident Response Guide*에서 NIST SP 800-61의 IR 생명주기를 클라우드에 맞춰 채택한다. 이를 정확히 아는 것이 이 영역 시험의 토대다.

## NIST IR 생명주기 4단계

```
[1. 준비] ──► [2. 탐지 및 분석] ──► [3. 봉쇄·근절·복구] ──► [4. 사후 활동]
   Preparation    Detection &           Containment,           Post-Incident
                  Analysis              Eradication,           Activity
                                        Recovery
        ▲                                                              │
        └──────────────── 교훈을 준비 단계로 환류 ──────────────────────┘
```

생명주기는 *순환*한다. 사후 활동의 교훈이 준비를 강화한다.

### 1. 준비 (Preparation)
사고가 *나기 전에* 대응 능력을 구축. 클라우드에서의 준비:
- **로깅·가시성 기반**: CloudTrail(모든 계정·리전), VPC Flow Logs, GuardDuty/Security Hub/Config 활성화. *사고 후엔 늦다* — 로그가 없으면 분석 자체가 불가능.
- **격리·포렌식 인프라**: 격리 보안 그룹·서브넷, 포렌식 계정·AMI, Object Lock 증거 버킷을 미리 준비.
- **권한·접근**: IR 담당자의 break-glass 역할, 자동화 실행 역할(최소 권한).
- **런북·연락망**: 시나리오별 런북, 에스컬레이션 경로, 권한 위임 정의.
- **훈련**: game day / tabletop 연습.

### 2. 탐지 및 분석 (Detection & Analysis)
신호를 사고로 식별하고 범위·심각도를 판단:
- GuardDuty(위협), Security Hub(집계·정규화 ASFF), Config(구성 일탈), Macie(데이터 민감도), CloudTrail/Athena(조사).
- 핀딩을 분류(triage): true/false positive, 심각도, 영향 범위, 사고 등급(severity classification).

### 3. 봉쇄·근절·복구 (Containment, Eradication, Recovery)
- **봉쇄(Containment)**: 피해 확산 차단. 인스턴스 격리(Day 2), 자격증명 폐기(Day 3), 보안 그룹·NACL·SCP. 단기 봉쇄(즉시) vs 장기 봉쇄(임시 복구) 구분.
- **근절(Eradication)**: 위협 제거. 멀웨어·백도어 제거, 취약점 패치, 침해 리소스 폐기.
- **복구(Recovery)**: 정상 운영 복원. 패치된 골든 AMI 재배포, 백업 복원, 모니터링 강화하며 단계적 서비스 복귀.

### 4. 사후 활동 (Post-Incident Activity)
- 근본 원인 분석(root cause), 타임라인 재구성(CloudTrail), lessons learned 회의, 런북·통제 개선, 지표(MTTD/MTTR) 갱신.

> 💡 **관련 이론**: NIST가 *근절(eradication)*을 *복구(recovery)*와 분리한 이유는 깊다. 위협을 완전히 제거하지 않은 채 복구하면(예: 백도어를 남긴 채 인스턴스만 재시작) 재침해가 즉시 일어난다. 반대로 봉쇄 전에 근절을 시도하면 공격자가 탐지를 눈치채고 증거를 파괴하거나 더 깊이 숨는다. 순서(봉쇄→근절→복구)는 *공격자의 행동 가능성을 최소화하는* 게임이론적 설계다. SANS의 6단계 모델(Preparation, Identification, Containment, Eradication, Recovery, Lessons Learned)도 본질적으로 동일한 논리다.

## 런북(Runbook)과 플레이북(Playbook)

- **런북(Runbook)**: *특정 작업*의 단계별 절차(예: "EC2 격리 런북" — 스냅샷→격리 SG→태깅). 자동화하기 좋음(SSM Automation Document).
- **플레이북(Playbook)**: *시나리오 전반*의 의사결정 흐름(예: "랜섬웨어 대응 플레이북" — 어떤 조건에서 어떤 런북을 호출하고 누가 승인하는가).

좋은 런북의 속성:
- **결정론적**: 같은 입력 → 같은 절차. 압박 속 판단 부담 감소.
- **멱등적**: 중복 실행해도 안전.
- **감사 가능**: 모든 단계가 기록.
- **테스트됨**: game day로 검증.

```yaml
# 사고 등급별 플레이북 골격 (의사 결정 흐름)
사고 탐지 (GuardDuty/Security Hub)
  ├─ 심각도 LOW  → 자동 티켓 생성, 영업시간 내 검토 (사람)
  ├─ 심각도 MED  → 자동 알림 + 영향 분석 (사람) → 필요 시 런북 수동 실행
  └─ 심각도 HIGH → 자동 봉쇄 런북 즉시 실행 (자동)
                   + 동시에 IR팀 호출 (사람)
                   + 고영향 조치(prod 종료 등)는 aws:approve 게이트 (사람 승인)
```

## 자동화 vs 사람 판단의 경계 (핵심)

이 단원의 정수는 *무엇을 기계에, 무엇을 사람에게 맡기는가*다. 잘못된 경계 설정은 두 방향으로 실패한다: 너무 자동화하면 false positive로 정상 서비스를 파괴하고, 너무 수동이면 대응이 느려 피해가 커진다.

| 차원 | 자동화에 적합 | 사람 판단 필요 |
|------|---------------|----------------|
| 명확성 | 명백한 위협(공개 RDP brute force 성공) | 모호한 신호(비정상 API 패턴) |
| 가역성 | 가역적 조치(키 비활성화, 격리 SG) | 비가역·고영향(prod 종료, 데이터 삭제) |
| 영향 범위 | 단일 리소스·낮은 영향 | 광범위·핵심 서비스 |
| 속도 요구 | 초 단위가 결정적(자격증명 폐기) | 분석·맥락이 더 중요 |
| 빈도 | 반복적·대량 | 드물고 새로운 상황 |

**graduated automation(단계적 자동화)**: 신뢰가 쌓일수록 사람→자동으로 이동.
1. 처음엔 *알림만*(human-in-the-loop) — 자동화 로직 검증.
2. 신뢰 쌓이면 *가역적·저영향 조치 자동화*(키 비활성화, 격리).
3. 고영향 조치는 *승인 게이트*(SSM `aws:approve`) — 자동 실행하되 사람이 한 번 승인.

```yaml
# SSM Automation에 사람 승인 게이트 삽입
mainSteps:
  - name: snapshotAndIsolate     # 자동: 가역적 봉쇄
    action: aws:executeAutomation
    inputs: { DocumentName: IsolateInstance }
  - name: approveTermination     # 사람: 비가역 조치 전 승인
    action: aws:approve
    inputs:
      Approvers: ["arn:aws:iam::111122223333:role/IR-Lead"]
      Message: "프로덕션 인스턴스 i-xxx 종료 승인 요청"
  - name: terminate              # 자동: 승인 후 실행
    action: aws:executeAwsApi
    inputs: { Service: ec2, Api: TerminateInstances }
```

> 💡 **관련 이론**: 이것은 항공·원자력 등 고위험 산업의 *automation paradox(자동화의 역설)*다. 자동화가 늘수록 사람은 *상황 인식(situational awareness)*을 잃어, 정작 자동화가 실패하는 드문 순간에 개입할 능력이 떨어진다. 그래서 모범은 *자동화가 무엇을 했는지 사람이 항상 볼 수 있게*(SNS 알림, 대시보드) 하고, *고영향·비가역 결정에는 사람을 루프에 유지*하는 것이다. 완전 자동화가 목표가 아니라, *사람의 판단을 가장 가치 있는 곳에 집중*시키는 것이 목표다.

## AWS 서비스의 IR 단계 매핑

| NIST 단계 | 주요 AWS 서비스 |
|-----------|------------------|
| 준비 | CloudTrail, Config, GuardDuty(활성화), Organizations/SCP, IAM(break-glass), 포렌식 계정 |
| 탐지·분석 | GuardDuty, Security Hub, Config, Macie, Detective, CloudTrail/Athena, CloudWatch |
| 봉쇄 | SSM Automation, EC2(SG/격리), IAM(세션 폐기), NACL, SCP, WAF |
| 근절 | Systems Manager(패치), SSM Automation, EC2(재배포), Lambda |
| 복구 | 골든 AMI, Backup 복원, CloudFormation/IaC 재배포, CloudWatch 모니터링 |
| 사후 | CloudTrail/Athena(타임라인), Detective(조사), Security Hub(인사이트), 런북 갱신 |

**Amazon Detective**는 특히 *분석·사후* 단계에서 GuardDuty 핀딩의 *맥락과 연관 관계*(어떤 엔티티가 무엇과 통신했는가, 행동 기준선 대비 이상)를 그래프로 보여줘 근본 원인 분석을 돕는다.

> 🔍 **더 깊이**: IR 성숙도는 *지표*로 측정·개선된다. MTTD(평균 탐지 시간)·MTTR(평균 대응 시간)·dwell time(공격자 잠복 기간). 자동 대응(Day 1)은 MTTR을 극적으로 줄이고, 탐지 통제(GuardDuty/Security Hub)는 MTTD를 줄인다. 사후 단계에서 이 지표를 추적해 *어느 단계가 병목인지* 찾고 거기에 자동화·통제를 투자한다. 또한 IR은 *법적·규제적* 차원이 있다 — 증거 무결성(chain of custody, Day 2), 침해 통지 의무(GDPR 72시간 등), 규제 보고. 그래서 IR 계획에는 보안팀뿐 아니라 법무·홍보·경영진의 역할과 연락망이 포함된다. 기술적 봉쇄와 조직적 대응은 분리되지 않는다.

## 한 줄 요약 체크리스트

- [ ] NIST 4단계(준비→탐지·분석→봉쇄·근절·복구→사후)와 순환 구조를 이해했는가
- [ ] 준비 단계에서 로깅·격리 인프라·런북·break-glass를 *사고 전에* 갖췄는가
- [ ] 봉쇄→근절→복구 순서의 논리(재침해 방지·증거 보호)를 아는가
- [ ] 런북(작업 절차)과 플레이북(시나리오 의사결정)을 구분하는가
- [ ] 자동화/사람 경계를 명확성·가역성·영향 범위·속도로 판단하는가
- [ ] graduated automation으로 가역·저영향은 자동, 고영향은 승인 게이트(aws:approve)를 두는가
- [ ] 각 IR 단계에 맞는 AWS 서비스를 매핑할 수 있는가
- [ ] 사후 단계에서 MTTD/MTTR로 개선하고 법적·규제 의무를 반영하는가

---

## 📝 연습 문제

**문제 1.** NIST IR 생명주기에서 근절(Eradication)을 복구(Recovery)보다 먼저 수행해야 하는 이유로 가장 적절한 것은?

A) 복구가 더 비싸므로 미뤄야 한다  
B) 위협(백도어·멀웨어)을 완전히 제거하지 않고 정상 운영을 복원하면 즉시 재침해가 일어나기 때문  
C) AWS가 그 순서만 허용하므로  
D) 근절은 자동화할 수 없으므로  

**정답: B**  
해설: 근절을 건너뛰고 복구하면 남은 백도어·멀웨어로 곧장 재침해된다. 그래서 봉쇄로 확산을 막고, 근절로 위협을 완전히 제거한 뒤, 복구로 정상 운영을 복원하는 순서가 필수다. 비용·AWS 강제·자동화 가능 여부는 순서의 근거가 아니다.

---

**문제 2.** 어떤 대응 조치를 완전 자동화할지, 사람 승인 게이트를 둘지 판단하는 기준으로 가장 적절한 묶음은?

A) 조치 이름의 길이와 알파벳 순서  
B) 위협의 명확성, 조치의 가역성, 영향 범위, 속도 요구 — 명백·가역·저영향·고속이면 자동화, 모호·비가역·고영향이면 사람 승인  
C) 무조건 모두 자동화하는 것이 항상 최선  
D) 무조건 모두 수동이 항상 최선  

**정답: B**  
해설: 자동화/사람 경계는 명확성·가역성·영향 범위·속도 요구로 판단한다. 명백하고 가역적이며 저영향이고 속도가 결정적이면 자동화하고, 모호·비가역·고영향이면 사람의 승인을 둔다. 과도한 자동화는 false positive로 서비스를 파괴하고, 전면 수동은 대응을 지연시킨다.

---

**문제 3.** 자동 봉쇄는 즉시 실행하되 프로덕션 인스턴스 종료 같은 비가역 조치 전에는 IR 리드의 승인을 받게 하려 한다. SSM Automation에서 적절한 메커니즘은?

A) Lambda를 두 번 호출  
B) 런북 중간에 aws:approve 단계를 삽입해 지정된 승인자의 승인 후 종료 단계가 진행되도록 구성  
C) 보안 그룹 규칙 추가  
D) CloudTrail 알람  

**정답: B**  
해설: SSM Automation의 aws:approve 액션은 런북 흐름 중간에 사람 승인 게이트를 삽입해, 지정 승인자가 승인해야 다음(고영향) 단계가 진행된다. 이것이 graduated automation에서 자동 봉쇄와 사람의 비가역 조치 승인을 결합하는 표준 메커니즘이다. 나머지는 승인 게이트 기능을 제공하지 않는다.

---

**문제 4.** NIST IR의 준비(Preparation) 단계에서 클라우드 환경에 반드시 갖춰야 할 것으로 가장 적절한 것은?

A) 사고가 난 뒤에 CloudTrail을 켠다  
B) 사고 전에 CloudTrail·VPC Flow Logs·GuardDuty 등 로깅·탐지 기반, 격리 보안 그룹·포렌식 계정·증거 버킷, 런북과 break-glass 역할을 미리 구축  
C) 준비 단계에는 아무것도 하지 않는다  
D) 모든 인스턴스를 미리 종료한다  

**정답: B**  
해설: 준비는 사고 전에 대응 능력을 구축하는 단계다. 로그가 없으면 사고 후 분석 자체가 불가능하므로 CloudTrail·Flow Logs·GuardDuty와 격리·포렌식 인프라, 런북, break-glass 역할을 미리 갖춰야 한다. 사고 후 로깅 활성화나 무위·무차별 종료는 부적절하다.

---

**문제 5.** 사후 활동(Post-Incident) 단계에서 IR 프로그램을 개선하기 위해 추적하는 핵심 지표와 활동으로 가장 적절한 것은?

A) 인스턴스 시간당 비용만 본다  
B) MTTD·MTTR·dwell time을 측정하고, CloudTrail/Detective로 타임라인·근본 원인을 분석하며 교훈을 런북·통제에 환류하고 규제 보고 의무를 이행  
C) 사고를 잊고 다음 작업으로 넘어간다  
D) 모든 로그를 즉시 삭제한다  

**정답: B**  
해설: 사후 단계는 MTTD/MTTR/dwell time 같은 지표로 병목을 찾고, CloudTrail·Detective로 타임라인과 근본 원인을 분석해 교훈을 준비 단계(런북·통제)로 환류하며, 침해 통지 등 규제 의무를 이행한다. 비용만 보거나 사고를 잊거나 증거 로그를 삭제하는 것은 개선·법적 요구에 모두 어긋난다.

---
