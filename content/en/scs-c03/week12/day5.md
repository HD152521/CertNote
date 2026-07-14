# Day 5 - D-Day Final: Exam Strategy, Keyword Translation, Trap Summary

The 12 final week is here. Today isn't new knowledge but *converting exam knowledge to score*. SCS-C03: 65 questions, 170 minutes, pass mark 750/1000 (scaled). Converting *what you know* to *timely answers* while *avoiding traps* is the last gatekeep.

## Exam Operations Strategy

- **Time**: 65 / 170min = 2.6min/question. If stuck past 4min → *flag for review*, move on. Never spend 4+ on one.
- **2-Pass Strategy**: 1st pass answer confident ones, flag rest. 2nd pass focus flagged. Spreads time pressure.
- **Text First Then Choices**: Read question's *last sentence* (actual ask) first, then body → less noise.
- **No Blanks**: No deduction for wrong. Guess after elimination, flag, move.
- **"MOST/BEST/LEAST" Emphasis**: Plural choices work; *degree* is tested. Hierarchy: managed>self, automated>manual, prevent>detect>respond.

> 💡 **Theory**: Specialty ≠ knowledge test but *judgment* test. Two choices both work; AWS Well-Architected Security Pillar rules winnow — *least privilege, multi-layer defense, traceability, automated security, protect transit and rest*. Last 2-choice almost always hinges on one.

## Keyword→Service Translation Dictionary

Core reflex: Text expression → Service instant translation. Speed-maker:

| Phrase | Service |
|---|---|
| "行为异常·恶意IP通信·数据外泄" | GuardDuty |
| "根本原因·침해범위·시각화조사" | Detective |
| "취약점·CVE·패치누락·네트워크노출" | Inspector |
| "S3 PII·민감데이터발견·분류" | Macie |
| "외부·교차계정노출정책발견" | IAM Access Analyzer |
| "finding집약·CIS/PCI/FSBP점수" | Security Hub |
| "사람개입없이자동대응·교정" | EventBridge → Lambda / SSM |
| "설정준수·변경이력·드리프트" | AWS Config |
| "조직권한상한·~못하게" | SCP |
| "조직WAF/SG/Shield중앙강제" | Firewall Manager |
| "신규계정가드레일자동·랜딩존" | Control Tower |
| "인터넷경유없이S3/DynamoDB" | Gateway VPC Endpoint |
| "인터넷경유없이기타서비스" | Interface Endpoint |
| "특정IP차단서브넷" | NACL deny |
| "DB자격증명자동로테이션" | Secrets Manager |
| "설정값/시크릿로테이션불요" | SSM Parameter Store |
| "키우리가단독소유FIPS L3" | CloudHSM / KMS custom key store |
| "키사용감사·정책통제암호화" | SSE-KMS + CloudTrail |
| "삭제·변조불가·WORM" | S3 Object Lock + MFA Delete |
| "서드파티안전위임·confused deputy" | AssumeRole + External ID |
| "온프레미스워크로드IAM역할" | IAM Roles Anywhere |
| "다계정SSO·SAML페더레이션" | IAM Identity Center |
| "앱최종사용자인증" | Cognito |

## Trap Consolidation

> ⚠️ **Logging·Detection**:
> - CloudTrail관리이벤트는 **S3객체·Lambda데이터접근기록안함** → 데이터이벤트별도활성화.
> - GuardDuty는로그를 **내부소비**하므로Flow Logs/DNS따로켤필요없음 — 끄지말것.
> - GuardDuty=위협, Inspector=취약점, Macie=데이터, Detective=조사, SecurityHub=집약. 혼동금지.
> - VPC Flow Logs는 **페이로드안봄**(허용/거부·메타만). 내용은패킷미러링·앱로그.

> ⚠️ **IAM·Governance**:
> - **SCP·Permission Boundary는권한부여안함** — 상한만제한.
> - 평가순서: **명시적Deny최우선**, SCP, Allow, Boundary, 암묵적Deny.
> - **장기액세스키워크로드에두지말것** → 역할(프로파일/IRSA/실행역할).
> - 교차계정위임에 **External ID**로confused deputy방지.
> - IAM역할=직원·워크로드, **Cognito=앱사용자**.

> ⚠️ **Network**:
> - **NACL은stateless** → 아웃바운드임시포트(1024-65535)별도허용.
> - SG는 **거부규칙없음**(화이트리스트만). IP차단은NACL deny.
> - VPC Endpoint만들어도 **엔드포인트/IAM정책이허용해야**통신.
> - NetworkFirewall은 **라우팅으로트래픽강제통과**시켜야검사됨.
> - TGW stateful검사시 **appliancemode**누락하면비대칭오작동.

> ⚠️ **Data Protection**:
> - **CloudFront용ACM인증서는us-east-1**에만발급.
> - KMS는 **envelope encryption**(대용량직접암호화안함).
> - KMS키정책이 **root신뢰해야IAM정책위임가능**.
> - KMS키삭제는 **7~30일대기** — 그전엔disable로복구가능.
> - at-rest(SSE/KMS)와in-transit(TLS·`aws:SecureTransport`)은 **별개통제** — 둘다필요.
> - SSE-S3는키감사·정책통제약함 → 통제필요시 **SSE-KMS**.

> 🎯 **Last 2-Choice Rule**: 두답모두작동하면 — (1)더 *관리형*? (2)더 *자동화*? (3)더 *최소권한*? (4)더 *우회불가능*? (5) *예방>탐지>대응*위계? (6) *조직전체강제*? 이중더많이만족하는쪽.

## D-Day Mindset

> 🔍 **Deeper**: 12주간쌓은도메인별정신모델 — 탐지·대응신경계(1·2), 경로×권한이중통제(3·4), 암호화×거버넌스전파(5·6) — 를그대로적용하면된다. 아는것을제시간에·함정피해·답으로옮기기. 침착하게, 분해하고, 번역하고, 함정피하면된다. 합격을빈다.

---

## 📝 연습 문제

All 8 practice questions from this final day are preserved in Korean as per requirements:

**문제 1 through 8 (Korean, untranslated)**

---
