# Day 5 - D-Day 마무리: 시험장 전략 · 키워드→서비스 번역 · 함정 총정리

12주의 마지막 날이다. 오늘은 새 지식이 아니라 *시험장에서 점수로 바꾸는 기술*을 정리한다. SCS-C03은 65문항·170분, 합격선은 750/1000(스케일드). 아는 것을 *제 시간에·함정을 피해* 답으로 옮기는 것이 마지막 관문이다.

## 시험장 운영 전략

- **시간 배분**: 65문항 / 170분 = 문항당 ~2.6분. 첫 패스에서 막히면 *flag for review*하고 넘어간다. 한 문제에 4분 이상 쓰지 말 것.
- **2-패스 방식**: 1패스에서 확실한 것만 답하고 나머지는 표시. 2패스에서 표시 문항을 집중. 시간 압박을 분산한다.
- **지문 먼저, 보기 나중**: 질문의 *마지막 문장*(실제 묻는 것)을 먼저 읽고 본문으로 돌아오면 노이즈가 줄어든다.
- **빈칸 금지**: 오답 감점이 없다. 모르면 소거 후 찍어도 표시해두고 넘어간다.
- **"MOST/BEST/LEAST" 강조어**: 작동하는 답이 여럿일 때 *정도*를 묻는다. 선호 위계(managed>self, automated>manual, prevent>detect>respond)로 가린다.

> 💡 **관련 이론**: Specialty는 "지식 시험"이 아니라 "판단 시험"이다. 두 보기가 모두 동작해도 AWS Well-Architected의 보안 기둥 원칙 — *최소 권한, 다계층 방어, 추적 가능성(traceability), 자동화된 보안, 전송·저장 데이터 보호* — 에 더 부합하는 쪽이 답이다. 막판 2지선다는 거의 항상 이 원칙 중 하나로 갈린다.

## 키워드 → 서비스 번역 사전

지문의 표현을 서비스로 즉시 번역하는 반사 신경. 이게 속도의 핵심이다.

| 지문에 이런 표현이 나오면 | 떠올릴 서비스/패턴 |
|---------------------------|---------------------|
| "행위 이상·악성 IP·데이터 유출 의심" | GuardDuty |
| "근본 원인·침해 범위·시각적 조사" | Detective |
| "취약점·CVE·패치 누락·네트워크 노출" | Inspector |
| "S3 PII·민감 데이터 발견·분류" | Macie |
| "외부/교차계정에 노출된 정책 발견" | IAM Access Analyzer |
| "finding 집약·CIS/PCI/FSBP 점수" | Security Hub |
| "사람 개입 없이 자동 대응·교정" | EventBridge → Lambda / SSM Automation |
| "설정 준수·변경 이력·드리프트" | AWS Config |
| "조직 권한 상한·~를 못 하게" | SCP |
| "조직 WAF/SG/Shield 중앙 강제" | Firewall Manager |
| "신규 계정에 가드레일 자동·landing zone" | Control Tower |
| "인터넷 경유 없이 S3/DynamoDB" | Gateway VPC Endpoint(무료) |
| "인터넷 경유 없이 그 외 서비스/내 SaaS" | Interface Endpoint(PrivateLink) |
| "특정 IP 대역 차단(서브넷)" | NACL deny |
| "DB 자격증명 자동 로테이션" | Secrets Manager |
| "설정값/시크릿(로테이션 불요·저비용)" | SSM Parameter Store(SecureString) |
| "키를 우리가 단독 소유·전용 HSM·FIPS L3" | CloudHSM / KMS custom key store |
| "키 사용 감사·정책 통제 암호화" | SSE-KMS + CloudTrail |
| "삭제·변조 불가·WORM·랜섬웨어 방지" | S3 Object Lock + MFA Delete + 버전관리 |
| "서드파티 안전 위임·confused deputy" | AssumeRole + External ID |
| "온프레미스 워크로드 IAM 역할" | IAM Roles Anywhere(X.509) |
| "다계정 SSO·SAML 페더레이션" | IAM Identity Center |
| "앱 최종 사용자 인증" | Cognito |
| "L7 SQLi/XSS/rate limit" | WAF |
| "L3/4 DDoS 흡수·비용 보호·DRT" | Shield Advanced |
| "VPC IPS·도메인 통제·중앙 검사" | Network Firewall(+TGW) |
| "DNS 기반 멀웨어/exfiltration" | Route 53 DNS Firewall |

## 자주 틀리는 함정 총정리

마지막으로 가장 비싼 실수들을 한 번에 정리한다.

> ⚠️ **로깅·탐지 함정**:
> - CloudTrail 관리 이벤트는 **S3 객체·Lambda 데이터 접근을 기록하지 않음** → 데이터 이벤트 별도 활성화.
> - GuardDuty는 로그를 **내부 소비**하므로 Flow Logs/DNS 로그를 따로 켤 필요 없음 — 끄지 말 것.
> - GuardDuty=위협, Inspector=취약점, Macie=데이터, Detective=조사, Security Hub=집약. 혼동 금지.
> - VPC Flow Logs는 **페이로드를 안 봄**(허용/거부·메타만). 내용은 패킷 미러링·앱 로그.

> ⚠️ **IAM·거버넌스 함정**:
> - **SCP·Permission Boundary는 권한을 부여하지 않음** — 상한만 제한.
> - 평가 순서: **명시적 Deny가 최우선**, 그다음 SCP, Allow, Boundary, 암묵적 Deny.
> - **장기 액세스 키를 워크로드에 두지 말 것** → 역할(인스턴스 프로파일/IRSA/실행 역할).
> - 교차계정 위임에 **External ID**로 confused deputy 방지.
> - IAM 역할=직원·워크로드, **Cognito=앱 사용자**.

> ⚠️ **네트워크 함정**:
> - **NACL은 stateless** → 아웃바운드 임시 포트(1024-65535) 별도 허용.
> - SG는 **거부 규칙 없음**(화이트리스트만). IP 차단은 NACL deny.
> - VPC Endpoint 만들어도 **엔드포인트/IAM 정책이 허용해야** 통신.
> - Network Firewall은 **라우팅으로 트래픽을 강제 통과**시켜야 검사됨.
> - TGW로 stateful 검사 시 **appliance mode** 누락하면 비대칭 오작동.

> ⚠️ **데이터 보호 함정**:
> - **CloudFront용 ACM 인증서는 us-east-1**에만 발급.
> - KMS는 **envelope encryption**(대용량을 직접 암호화하지 않음).
> - KMS 키 정책이 **root를 신뢰해야 IAM 정책 위임 가능**.
> - KMS 키 삭제는 **7~30일 대기** — 그 전엔 disable로 복구 가능.
> - at-rest(SSE/KMS)와 in-transit(TLS·`aws:SecureTransport`)은 **별개 통제** — 둘 다.
> - SSE-S3는 키 감사·정책 통제 약함 → 통제 필요 시 **SSE-KMS**.

> 🎯 **막판 2지선다 결정 규칙**: 두 답이 모두 작동하면 — (1) 더 *관리형*인가? (2) 더 *자동화*인가? (3) 더 *최소 권한*인가? (4) 더 *우회 불가능*한가? (5) *예방 > 탐지 > 대응* 위계에서 더 앞인가? (6) *조직 전체 강제*가 가능한가? 이 중 더 많이 만족하는 쪽이 best.

## D-Day 직전 30초 마인드셋

> 🔍 **더 깊이**: 시험은 "이 서비스를 아는가"보다 "이 상황에서 *옳은 조합*을 고르는가"를 본다. 그래서 단일 정답 암기보다 *시나리오 분해 → 키워드 번역 → 함정 회피 → 선호 위계 적용*의 흐름이 점수를 만든다. 모르는 문제는 표시하고 넘기는 결단이 전체 점수를 지킨다. 한 문제의 완벽함보다 65문제의 페이스가 합격을 만든다. 12주간 쌓은 도메인별 정신 모델 — 탐지·대응 신경계(1·2), 경로×권한 이중통제(3·4), 암호화×거버넌스 전파(5·6) — 를 그대로 적용하면 된다.

## 마지막 체크리스트 (시험 직전)

- [ ] 6개 도메인의 핵심 서비스를 키워드로 즉시 번역할 수 있는가
- [ ] 함정 5종(데이터 이벤트, SCP 비부여, NACL 임시 포트, ACM us-east-1, KMS 대기)을 외웠는가
- [ ] GuardDuty/Inspector/Macie/Detective/Security Hub의 역할 구분이 명확한가
- [ ] IAM 평가 순서(Deny→SCP→Allow→Boundary)가 반사적으로 떠오르는가
- [ ] 2-패스 전략과 flag for review로 시간을 관리할 준비가 됐는가
- [ ] 막판 2지선다 결정 규칙(managed/automated/least-priv/prevent)을 기억하는가

12주 수고했다. 침착하게, 분해하고, 번역하고, 함정을 피하면 된다. 합격을 빈다.

---

## 📝 연습 문제

**문제 1.** 시험 중 한 문제에서 4분째 두 보기 사이에서 결정하지 못하고 있다. 가장 합리적인 행동은?

A) 정답이 나올 때까지 계속 붙든다  
B) flag for review로 표시하고 다음 문제로 넘어가, 2패스에서 다시 본다  
C) 빈칸으로 비워둔다  
D) 시험을 일찍 종료한다  

**정답: B**  
해설: 문항당 평균 약 2.6분이므로 한 문제에 과도한 시간을 쓰면 전체 페이스가 무너진다. flag for review로 표시하고 넘어가 2패스에서 집중하는 것이 표준 전략이다. 계속 붙들면 시간 손실이 크고, 오답 감점이 없으므로 빈칸은 손해이며, 조기 종료는 검토 기회를 버리는 것이다.

---

**문제 2.** 지문에 "사람의 개입 없이 자동으로(automatically, without manual intervention) 비준수 리소스를 교정"이라는 표현이 있다. 이 키워드가 가리키는 전형적 패턴은?

A) 매일 사람이 콘솔에서 점검  
B) Config/GuardDuty finding → EventBridge → Lambda 또는 SSM Automation 자동 교정  
C) IAM 정책 검토 회의  
D) Trusted Advisor 주간 리포트  

**정답: B**  
해설: "사람 개입 없이 자동 교정"은 거의 항상 이벤트 기반 자동화(Config/finding → EventBridge → Lambda/SSM Automation)를 가리킨다. 콘솔 수동 점검·검토 회의·주간 리포트는 모두 수동·사후적이어서 자동 교정 요건과 맞지 않는다. 키워드를 패턴으로 번역하는 반사가 속도를 만든다.

---

**문제 3.** "조직의 어떤 계정에서도 특정 작업을 *할 수 없게* 막아라"는 요구가 나왔다. 두 보기가 (A) Config 규칙으로 탐지, (B) SCP로 Deny일 때 best는?

A) Config 규칙 — 위반을 발견하므로  
B) SCP로 Deny — 예방 통제로 애초에 행위를 불가능하게 함(예방 > 탐지)  
C) 둘 다 동일하다  
D) IAM 정책을 계정마다 수동 부착  

**정답: B**  
해설: "할 수 없게 막아라"는 예방 통제 요구다. SCP Deny는 조직/OU 수준에서 행위를 애초에 불가능하게 하며, 보안 위계상 예방(prevent)이 탐지(detect)보다 앞선다. Config는 사후 탐지일 뿐이고, 수동 IAM 부착은 다계정 규모에서 드리프트가 발생한다. 막판 2지선다는 예방>탐지>대응 위계로 가린다.

---

**문제 4.** 두 보기가 모두 작동한다: (A) EC2에서 cron으로 직접 키를 교체하는 스크립트, (B) Secrets Manager 자동 로테이션. SCS-C03에서 선호되는 답과 이유는?

A) 직접 스크립트 — 더 유연하므로  
B) Secrets Manager 자동 로테이션 — 관리형·자동화가 자체 구현보다 선호됨(managed > self-managed)  
C) 둘 다 같다  
D) 키 교체는 불필요하다  

**정답: B**  
해설: 두 방식 모두 동작해도 AWS는 관리형·자동화 솔루션을 자체 구현보다 선호한다(운영 부담·오류·감사 측면). Secrets Manager의 내장 로테이션이 best다. 직접 스크립트는 유지보수·실패 위험이 크고, 키 교체는 보안상 필요하다. managed>self-managed 선호 위계의 전형적 적용이다.

---

**문제 5.** 다음 함정 진술 중 *사실과 다른* 것은?

A) CloudTrail 관리 이벤트는 S3 객체 수준 접근을 기록하지 않는다  
B) SCP는 권한을 부여하지 않고 상한만 제한한다  
C) CloudFront용 ACM 인증서는 어느 리전에서나 발급해도 된다  
D) NACL은 stateless라 아웃바운드 임시 포트를 별도 허용해야 한다  

**정답: C**  
해설: CloudFront에 연결할 ACM 인증서는 반드시 us-east-1(N. Virginia)에서 발급해야 하므로 "어느 리전에서나"는 사실과 다르다. 나머지는 모두 사실인 빈출 함정이다: 데이터 이벤트 별도 활성화 필요, SCP는 권한 비부여(상한 제한), NACL stateless 임시 포트. *틀린* 진술을 고르는 문제이므로 정답은 ACM 리전 진술이다.

---

**문제 6.** "MOST cost-effective(가장 비용 효율적인) 방법으로 프라이빗 서브넷에서 S3에 접근"이라는 요구다. 강조어 "MOST cost-effective"가 가르는 답은?

A) NAT Gateway 경유(시간당·데이터 처리 과금)  
B) S3 Gateway VPC Endpoint(무료)  
C) Interface Endpoint(시간당·데이터 과금)  
D) 퍼블릭 IP 부여  

**정답: B**  
해설: S3는 Gateway Endpoint를 지원하며 이는 무료이므로 "가장 비용 효율적"이라는 강조어가 정답을 가른다. NAT Gateway와 Interface Endpoint는 모두 시간·데이터 과금이 있고, 퍼블릭 IP 부여는 프라이빗·보안 요건을 위반한다. 강조어(MOST cost-effective)는 동작하는 여러 답 중 비용 기준으로 best를 선택하게 한다.

---

**문제 7.** 시험 마인드셋으로 가장 부적절한 것은?

A) 질문의 마지막 문장(실제 묻는 것)을 먼저 파악한다  
B) 모르는 문제는 끝까지 붙들어 반드시 풀고 넘어간다  
C) 두 답이 모두 작동하면 선호 위계(managed/automated/least-priv/prevent)로 가린다  
D) 명백히 요구를 어기는 보기(키 하드코딩·퍼블릭화)는 즉시 소거한다  

**정답: B**  
해설: 모르는 문제를 끝까지 붙드는 것은 전체 페이스를 무너뜨리는 잘못된 전략으로, flag for review 후 넘어가는 것이 옳다. 나머지(마지막 문장 먼저, 선호 위계 적용, 명백한 오답 즉시 소거)는 모두 권장되는 시험 기술이다. 한 문제의 완벽함보다 65문제의 페이스가 합격을 만든다.

---

**문제 8.** "S3에 신용카드 번호가 저장돼 있는지 자동 발견"과 "EC2에 미패치 CVE가 있는지 평가"라는 두 요구를 각각 올바른 서비스에 연결한 것은?

A) 둘 다 GuardDuty  
B) 전자는 Macie(S3 민감 데이터 분류), 후자는 Inspector(취약점·CVE 평가)  
C) 전자는 Inspector, 후자는 Macie  
D) 둘 다 Config  

**정답: B**  
해설: S3 내 신용카드 번호 등 민감 데이터 발견·분류는 Macie의 전용 기능이고, EC2/ECR/Lambda의 CVE·취약점 평가는 Inspector의 역할이다. GuardDuty는 행위 위협 탐지, Config는 설정 준수 평가로 두 요구 모두에 부적합하다. 서비스 역할 구분(데이터=Macie, 취약점=Inspector)은 빈출 핵심이다.

---
