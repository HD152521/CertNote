# Day 3 - IAM Access Analyzer와 Trusted Advisor, 권한을 코드로 증명하는 법

권한 관리에서 가장 어려운 질문은 "누가 무엇을 할 수 있나"가 아니라 "누가 **하지 말아야 할 것**을 할 수 있나"다. IAM 정책을 한 줄씩 읽어 외부 노출 여부를 사람이 판단하는 건 사실상 불가능하다. S3 버킷 정책, KMS 키 정책, IAM 역할의 신뢰 정책이 서로 얽히면 "이 버킷이 외부 계정에 열려 있나"라는 단순한 질문조차 사람의 눈으로는 안정적으로 답할 수 없다. 정책 조합의 경우의 수가 폭발하기 때문이다.

IAM Access Analyzer의 본질은 이 질문을 **수학적으로 증명**하는 엔진이다. 정책을 실행해보고 결과를 관찰하는 게 아니라(그러면 모든 경우를 시도할 수 없다), 정책 자체를 논리식으로 변환해 "외부 접근이 가능한 입력이 존재하는가"를 형식 논리로 푼다. 왜 이게 "탐지"가 아니라 "증명"인지, automated reasoning이라는 기술이 어떻게 무한한 경우의 수를 유한 시간에 판정하는지, Trusted Advisor가 어떻게 모범 사례를 자동 점검하는지 — 이 도구들이 단순한 스캐너가 아닌 이유를 따라가는 게 이 글이다.

## "탐지"가 아니라 "증명" — Access Analyzer가 형식 논리를 쓰는 이유

보안 스캐너 대부분은 패턴 매칭으로 동작한다. "이런 모양의 정책은 위험하다"는 규칙 목록을 두고, 정책이 그 패턴에 맞으면 경고한다. 문제는 정책 언어(IAM)가 너무 표현력이 풍부해서 위험한 패턴을 전부 열거할 수 없다는 것이다. `Condition` 절의 조합, 와일드카드, `NotPrincipal`, `NotAction` 같은 부정 연산자가 얽히면 "겉보기엔 안전한데 실제로는 외부에 열린" 정책이 무수히 만들어진다. 패턴 목록으로는 이런 우회를 다 잡지 못한다.

Access Analyzer는 근본적으로 다른 접근을 쓴다. **Automated Reasoning(자동 추론)** — 정책을 수리 논리(formal logic) 명제로 변환하고, "Zone of Trust(신뢰 경계) 밖의 주체가 이 리소스에 접근 가능한 입력이 존재하는가?"라는 질문을 **SMT(Satisfiability Modulo Theories) 솔버**로 푼다. 솔버가 "그런 입력이 존재한다"는 해를 찾으면 그게 finding이고, "존재하지 않음"을 증명하면 안전하다고 단정한다. 이건 시도해보는 게 아니라 **모든 가능한 경우를 수학적으로 한 번에 판정**하는 것이다.

차이가 결정적이다. 패턴 매칭은 "내가 아는 위험 패턴에 안 걸렸다"까지만 말할 수 있다 — 모르는 우회가 있을 수 있다. 형식 증명은 "외부 접근이 가능한 입력이 논리적으로 존재하지 않는다"를 단언한다 — 거짓 음성(false negative)이 원리적으로 없다. AWS는 이 기술을 사내 Automated Reasoning Group이 개발한 Zelkova라는 엔진으로 구현했고, Access Analyzer·S3 Block Public Access·일부 IAM 검증이 모두 이 엔진 위에서 돈다.

> 💡 **관련 이론**: SMT 솔버는 SAT(boolean satisfiability) 문제를 정수·문자열·집합 같은 풍부한 이론으로 확장한 것이다. SAT는 "이 논리식을 참으로 만드는 변수 할당이 있는가"를 푸는 NP-complete 문제인데, 1962년 DPLL 알고리즘 이후 실용적 솔버(Z3, CVC 등)가 발전해 수백만 변수 규모도 초 단위로 푼다. IAM 정책 분석에 SMT를 쓴다는 건, "이 정책을 만족하는 (Principal, Action, Resource, Condition) 조합 중 Zone of Trust 밖의 것이 존재하는가"를 충족 가능성 문제로 환원한다는 뜻이다. 같은 기술이 하드웨어 검증(CPU 회로가 사양을 만족하는지 증명)과 프로그램 검증에 쓰인다 — Access Analyzer는 클라우드 권한에 정리 증명(theorem proving)을 적용한 사례다.

> 🔍 **더 깊이**: Zelkova 엔진은 IAM 정책 두 개를 비교해 "정책 A가 정책 B보다 더 많은 접근을 허용하는가(A ⊇ B)"도 판정할 수 있다. 이게 Policy Validation의 "이 변경이 권한을 넓히는가"를 검사하는 기반이고, S3 Block Public Access가 "이 버킷 정책이 public 접근을 허용하는가"를 즉시 판정하는 원리다. 핵심은 두 정책의 허용 집합을 논리식으로 표현해 포함 관계를 증명하는 것 — 무한히 많은 요청을 일일이 대입하지 않고 집합의 포함 관계를 한 번에 판정한다. 이 때문에 Access Analyzer는 "스캔 주기"가 따로 없고 정책이 바뀌면 거의 실시간으로 재평가한다.

## Zone of Trust — "외부"를 어떻게 정의하는가

Access Analyzer의 External Access 분석은 "Zone of Trust 밖의 접근"만 finding으로 보고한다. 같은 계정 안에서의 접근은 정상으로 간주해 무시한다. 그런데 "외부"란 정확히 무엇인가? 이 경계를 어떻게 잡느냐가 분석의 의미를 결정한다.

Analyzer를 만들 때 Zone of Trust를 **계정 단위** 또는 **Organization 단위**로 정한다. 계정 단위 Analyzer는 그 계정 밖의 모든 주체를 "외부"로 본다 — 다른 AWS 계정, 다른 Organization, 익명 접근(`Principal: *`)이 전부 finding 대상이다. 같은 Organization 내 형제 계정도 외부로 잡힌다. Organization 단위 Analyzer는 Organization 전체를 신뢰 경계로 잡아, 조직 내 계정 간 접근은 정상으로 보고 조직 밖만 finding으로 보고한다.

이 구분이 중요한 이유는 **거버넌스 모델에 따라 "정상적인 공유"의 범위가 다르기** 때문이다. 멀티 계정 조직에서 형제 계정 간 S3 공유는 의도된 정상 동작인 경우가 많다 — 이걸 계정 단위 Analyzer로 보면 수많은 정상 공유가 finding으로 쏟아져 노이즈가 된다. Organization 단위로 잡으면 조직 내 공유는 조용히 넘어가고 "조직 밖으로 새는" 진짜 위험만 남는다. 반대로 단일 계정의 엄격한 격리가 목표라면 계정 단위가 맞다. Zone of Trust는 "무엇을 정상으로 볼지"를 정의하는 정책 결정이지 기술적 디테일이 아니다.

분석 대상은 외부 노출이 데이터 유출로 직결되는 리소스들이다 — S3 버킷, IAM 역할(신뢰 정책), KMS 키, Lambda(리소스 정책), SQS 큐, Secrets Manager 시크릿, EBS/RDS 스냅샷, ECR 저장소, EFS 등. 공통점은 모두 **resource-based policy로 외부 접근을 열 수 있는 리소스**라는 것이다.

> ⚠️ **함정**: Access Analyzer는 Zone of Trust **밖**의 접근만 본다. 계정 내부의 과도한 권한(예: 한 부서가 다른 부서 데이터에 접근)은 External Access 분석으로 잡히지 않는다. 내부의 미사용·과잉 권한은 별도의 **Unused Access Analyzer**가 담당한다. 시험에서 "외부 노출 탐지"는 External, "안 쓰는 권한·역할 발견"은 Unused로 구분된다. 또 Access Analyzer는 리전별로 만들어야 하며(글로벌이 아님), 멀티 리전 거버넌스는 각 리전에 Analyzer를 두거나 Security Hub로 통합해야 한다.

## Unused Access — 권한의 엔트로피와 싸우는 법

권한은 시간이 지나면 반드시 늘어난다. 새 기능을 위해 권한을 추가하지만, 그 기능이 사라져도 권한은 남는다. 임시로 넓힌 권한을 다시 좁히는 사람은 드물다. 결과적으로 IAM 역할과 사용자의 권한은 단조 증가하며, 실제로 쓰는 것보다 훨씬 많은 권한을 들고 있게 된다. 이걸 **권한 크리프(permission creep)** 또는 권한의 엔트로피라 부른다 — 가만히 두면 무질서가 늘어난다.

Unused Access Analyzer는 이 엔트로피를 측정한다. CloudTrail 활동 기록을 분석해 지정한 기간(예: 90일) 동안 실제로 쓰이지 않은 것들을 찾아낸다 — 활동 없는 IAM 사용자, 90일 이상 안 쓰인 역할, 부여됐지만 한 번도 호출되지 않은 API 권한, 미사용 액세스 키. 이 목록이 곧 "줄여도 안전한 권한"의 후보다.

이게 왜 보안에 중요한가? **최소 권한 원칙(Principle of Least Privilege)**의 실천이 사실상 불가능했던 이유가 여기 있다. 최소 권한이 옳다는 건 누구나 알지만, "실제로 무엇이 최소인가"를 사람이 알 방법이 없었다. 권한을 좁히려다 멀쩡한 기능을 깨뜨릴까 봐 아무도 손대지 않는다. Unused Access Analyzer는 실제 사용 데이터로 "이건 90일간 안 썼으니 빼도 된다"는 근거를 제공해, 추측이 아닌 데이터 기반으로 권한을 줄이게 한다.

> 💡 **관련 이론**: 최소 권한 원칙은 1975년 Saltzer와 Schroeder의 고전 논문 "The Protection of Information in Computer Systems"에서 정립된 8대 보안 설계 원칙 중 하나다. "모든 프로그램과 모든 사용자는 작업을 완수하는 데 필요한 최소한의 권한으로만 동작해야 한다." 이유는 단순하다 — 권한이 적을수록 그 주체가 침해됐을 때의 피해(폭발 반경)가 작고, 우발적 사고의 가능성도 낮다. 50년 된 이 원칙이 클라우드에서 새삼 어려워진 건 권한의 종류와 양이 폭증했기 때문이다. Unused Access Analyzer + Policy Generation은 이 오래된 원칙을 자동화로 다시 실천 가능하게 만든 도구다.

## Policy Generation — "일단 넓게, 나중에 좁힌다"의 자동화

새 애플리케이션이나 역할을 만들 때 정확히 어떤 권한이 필요한지 미리 아는 건 거의 불가능하다. 그래서 현실의 운영은 "일단 `*`로 넓게 열어 돌려보고, 동작하면 나중에 좁힌다"가 된다. 문제는 이 "나중에"가 영영 오지 않는다는 것이다. 좁히는 작업은 위험하고(잘못 좁히면 기능이 깨진다) 귀찮으니, `*` 권한이 프로덕션에 그대로 남는다.

Policy Generation은 이 "나중에 좁히기"를 자동화한다. 역할을 지정하면 Access Analyzer가 **CloudTrail의 지난 90일 활동**을 스캔해, 그 역할이 실제로 호출한 API만 추려 최소 권한 정책 JSON을 생성한다. Action뿐 아니라 어떤 Resource ARN에 어떤 Condition으로 접근했는지까지 분석해 구체적인 정책을 만든다. 운영자는 생성된 정책을 검토하고 기존 `*` 정책을 교체하면 된다.

이 흐름이 우아한 건 **이론과 현실의 순서를 뒤집기** 때문이다. 전통적 접근은 "필요한 권한을 미리 설계 → 정책 작성 → 배포"인데, 현실에선 필요 권한을 미리 알 수 없어 실패한다. Policy Generation은 "일단 넓게 배포 → 실제 사용 관찰 → 사용 데이터로 정책 역산"이라는, 현실에 맞는 순서를 자동화한다. 추측으로 설계하는 대신 관측된 행동에서 정책을 끌어낸다.

> 🔍 **더 깊이**: Policy Generation이 정확하려면 CloudTrail이 충분히 오래(이상적으로 90일) 켜져 있어야 하고, 분석 기간 동안 그 역할의 **모든 정상 경로가 실행됐어야** 한다. 분기 말에만 도는 배치 작업이 분석 기간에 안 돌았다면 그 권한이 생성된 정책에서 누락돼, 정책 교체 후 분기 말에 그 배치가 깨진다. 그래서 Policy Generation으로 만든 정책은 즉시 적용하지 말고, 우선 IAM Access Advisor(서비스 마지막 접근 정보)와 교차 검증하거나, 분석 기간을 충분히 길게(드물게 도는 작업까지 포함되도록) 잡아야 한다. 자동 생성은 출발점이지 그대로 믿을 최종 답이 아니다.

> 📚 **사례**: 권한 크리프가 일으킨 대표적 사고가 2019년 Capital One 데이터 유출이다. 한 WAF 역할에 부여된 과도한 S3 권한이 SSRF(Server-Side Request Forgery) 공격과 결합해, 공격자가 그 역할의 임시 자격증명으로 1억 건 이상의 고객 정보가 든 S3 버킷을 읽어냈다. 핵심 교훈 중 하나가 "그 역할은 그렇게 넓은 S3 권한이 필요 없었다"는 것 — 최소 권한이었다면 침해된 역할로 읽을 수 있는 데이터가 훨씬 적었을 것이다. Policy Generation과 Unused Access Analyzer는 정확히 이런 "쓰지도 않는데 들고 있는 넓은 권한"을 찾아 줄이기 위한 도구다.

## Policy Validation — 작성 시점에 막는 100가지 검사

Access Analyzer는 사후 탐지만 하는 게 아니라 정책 **작성 시점**에도 개입한다. Policy Validation은 IAM 정책을 작성·수정할 때 100가지 이상의 검사를 실시간으로 돌려 보안 경고, 문법 오류, 개선 제안을 띄운다. IAM 콘솔의 정책 편집기에 자동으로 붙어 있어, "이 정책에 와일드카드가 너무 넓다", "이 Action은 이 Resource 타입에 적용 안 된다" 같은 피드백을 즉시 준다.

이게 사후 탐지보다 가치 있는 이유는 **시프트 레프트(shift left)** — 문제를 라이프사이클의 더 이른 단계에서 잡을수록 고치는 비용이 싸기 때문이다. 위험한 정책이 프로덕션에 배포된 뒤 finding으로 잡히는 것보다, 작성하는 순간 "이건 위험하다"고 막는 게 훨씬 저렴하고 안전하다.

Custom Policy Checks(유료)는 한 단계 더 나아가, 회사 고유의 가드레일을 코드로 강제한다. "어떤 정책도 `s3:DeleteBucket`을 허용해선 안 된다", "이 변경이 기존보다 권한을 넓혀선 안 된다" 같은 규칙을 CI/CD 파이프라인에 넣어, 정책 변경 PR이 가드레일을 위반하면 머지를 막는다. 이건 위에서 본 Zelkova의 정책 비교(A ⊇ B 판정) 능력을 활용한 것으로, "이 PR이 권한을 확대하는가"를 형식적으로 증명해 차단한다.

> 💡 **관련 이론**: 시프트 레프트는 소프트웨어 품질 공학에서 "결함은 발견이 늦을수록 수정 비용이 기하급수적으로 증가한다"는 경험칙(Boehm의 비용 곡선)에서 나왔다. 설계 단계 결함을 고치는 비용을 1이라 하면, 코딩 단계는 ~6배, 테스트 단계는 ~15배, 프로덕션은 ~100배에 이른다는 고전적 추정이다. Policy Validation(작성 시점)과 Custom Policy Checks(CI/CD)는 보안 결함을 가장 왼쪽(작성·머지 시점)에서 잡아, 프로덕션에서 finding으로 발견해 사고 대응하는 비싼 경로를 피한다. "보안을 파이프라인에 넣는다(DevSecOps)"는 흐름의 구체적 구현이다.

## Trusted Advisor — 모범 사례를 자동으로 채점하는 시스템

Access Analyzer가 권한의 형식 검증이라면, Trusted Advisor는 계정 전반의 모범 사례 자동 채점기다. AWS가 수많은 고객 운영에서 축적한 모범 사례를 규칙으로 만들어 계정을 스캔하고, 위반 항목을 다섯 카테고리로 보고한다 — Cost Optimization, Performance, Security, Fault Tolerance, Service Limits.

| 카테고리 | 점검 예시 | 운영 의미 |
|----------|-----------|-----------|
| Cost Optimization | 미사용 EBS 볼륨, 유휴 EC2, RI 미활용 | 낭비 제거 |
| Performance | 과부하 EBS, 과프로비저닝 EC2, CloudFront 미활용 | 병목 발견 |
| Security | MFA 없는 root, public S3, 0.0.0.0/0 SG, 노출된 액세스 키 | 위험 노출 |
| Fault Tolerance | Multi-AZ 없음, RDS 백업 비활성, 단일 AZ ASG | 가용성 약점 |
| Service Limits | 한도의 80% 도달 | 한도 초과 사전 경고 |

Service Limits 점검이 특히 운영에 유용하다. AWS의 많은 리소스에는 계정·리전별 한도가 있고(EC2 인스턴스 수, EIP 수, VPC 수 등), 한도에 부딪히면 새 리소스 생성이 실패한다 — 트래픽 급증으로 오토스케일링이 인스턴스를 더 띄우려는데 한도에 막혀 확장이 멈추는 사고가 대표적이다. Trusted Advisor가 한도의 80%에 도달하면 미리 경고해, 한도 증액 요청을 사고 전에 넣을 수 있게 한다.

핵심 제약은 **Support 플랜에 따라 접근 범위가 다르다**는 것이다. Basic/Developer 플랜은 7개 핵심 보안 점검과 서비스 한도만 볼 수 있고, 100개 이상의 전체 점검은 Business($100/월) 또는 Enterprise 플랜에서만 열린다. 시험에서 "Trusted Advisor 전체 점검을 쓰려면?"의 답은 항상 "Business 이상 Support"다.

> 🔍 **더 깊이**: Trusted Advisor는 콘솔에서 눈으로 보는 도구를 넘어 API(`describe-trusted-advisor-checks`, `describe-trusted-advisor-check-result`)와 EventBridge 통합을 제공한다. 점검 결과가 바뀌면(예: 새 public S3 버킷이 생기면) EventBridge 이벤트를 발행해 SNS 알림이나 Lambda 자동 대응을 트리거할 수 있다. `refresh-trusted-advisor-check`로 즉시 재점검도 가능하다. 다만 Trusted Advisor는 "권장 사항"을 줄 뿐 자동으로 고치지 않는다 — 자동 교정은 AWS Config의 remediation action이나 별도 Lambda로 구현한다. Trusted Advisor는 "무엇이 잘못됐는지" 알려주는 진단기이지 치료기가 아니다.

## Access Analyzer vs Trusted Advisor vs Config — 겹쳐 보이는 셋의 분업

세 도구 모두 "잘못된 설정을 찾는다"는 점에서 겹쳐 보여 시험에서 자주 혼동된다. 분업은 명확하다. **Access Analyzer는 권한의 외부 노출을 형식 증명**하고, **Trusted Advisor는 광범위한 모범 사례를 점검**하고, **Config는 리소스 구성의 변경 추적과 규칙 평가**를 한다.

Access Analyzer는 "이 리소스가 외부에 열려 있나"라는 권한 질문에 수학적으로 답하는 전문 도구다. 좁고 깊다. Trusted Advisor는 비용·성능·보안·가용성·한도를 두루 점검하는 넓은 건강검진이다 — 깊이는 얕지만 폭이 넓다. Config는 "이 리소스가 시점 T에 어떤 구성이었나", "구성이 규칙(예: 모든 EBS는 암호화돼야 함)을 따르나"를 추적·평가하며, 변경 이력과 컴플라이언스 상태를 관리한다(다음 글의 Security Hub가 이들을 통합한다).

| 질문 | 적합한 도구 |
|------|-------------|
| 이 S3 버킷이 외부 계정에 노출됐나 | Access Analyzer (External) |
| 안 쓰는 IAM 권한·역할은 무엇인가 | Access Analyzer (Unused) |
| 이 정책이 안전한가 (작성 시점) | Access Analyzer (Validation) |
| MFA 없는 root, public S3 등 모범 사례 위반 | Trusted Advisor (Security) |
| EC2 인스턴스 한도가 80%에 도달했나 | Trusted Advisor (Service Limits) |
| 모든 EBS가 암호화돼 있나, 규칙 위반 추적 | AWS Config |
| 이 리소스 구성이 언제 어떻게 바뀌었나 | AWS Config |

여기에 더해 **AWS Health Dashboard**는 성격이 완전히 다르다 — 위 셋이 "고객의 설정 문제"를 보는 반면, Health Dashboard는 "AWS 측의 이슈"(인스턴스 retirement 예정, EBS 성능 저하, 서비스 deprecation)를 고객에게 알린다. 그리고 **AWS Artifact**는 점검 도구가 아니라 AWS의 컴플라이언스 보고서(SOC, PCI, ISO 등)를 무료로 다운로드하는 창구다 — 감사관에게 "AWS 인프라가 이 표준을 준수한다"는 증빙을 제출할 때 쓴다.

> ⚠️ **함정**: "컴플라이언스 보고서가 필요하다"는 시나리오에서 AWS Artifact와 Audit Manager를 헷갈리기 쉽다. AWS Artifact는 **AWS가 준수하는** SOC/PCI 등의 보고서를 받는 곳(AWS의 책임 영역 증빙)이고, Audit Manager는 **고객 자신의** 환경이 표준을 준수함을 증거로 모아 감사 보고서를 만드는 도구(고객의 책임 영역 증빙)다. 공유 책임 모델에서 Artifact는 "AWS 쪽", Audit Manager는 "고객 쪽"을 증명한다.

## 정리하며

이 글의 도구들은 모두 "사람의 눈으로는 안정적으로 답할 수 없는 질문"을 자동화한다. Access Analyzer는 권한의 외부 노출을 패턴 매칭이 아닌 형식 증명(automated reasoning)으로 판정해 거짓 음성을 원리적으로 없애고, Unused Access와 Policy Generation은 50년 된 최소 권한 원칙을 실제 사용 데이터로 실천 가능하게 만들고, Policy Validation은 시프트 레프트로 위험을 작성 시점에 막고, Trusted Advisor는 AWS의 축적된 모범 사례로 계정 전반을 채점한다.

운영자가 기억할 다섯 가지는 이렇다. ① Access Analyzer External은 Zone of Trust(계정 또는 Organization) 밖의 접근만 형식 증명으로 탐지. ② Unused Access Analyzer는 안 쓰는 권한·역할·키를 CloudTrail 기반으로 발견해 최소 권한 강화. ③ Policy Generation은 CloudTrail 90일 활동에서 최소 권한 정책을 역산하되 드물게 도는 작업 누락에 주의. ④ Trusted Advisor 5대 카테고리(Cost/Performance/Security/Fault Tolerance/Service Limits), 전체는 Business+ Support. ⑤ Artifact(AWS 준수 증빙) vs Audit Manager(고객 준수 증빙), Health Dashboard(AWS 측 이슈)를 구분.

다음 글에선 설정의 정적 점검을 넘어 **실시간 위협**으로 넘어간다. 누군가 실제로 공격하고 있는지(GuardDuty), 시스템에 알려진 취약점이 있는지(Inspector), 데이터에 민감 정보가 노출됐는지(Macie)를 탐지하고, 이 모든 finding을 한 곳에 통합하는(Security Hub) 네 도구를 본다.

---

## 📝 연습 문제

**문제 1.** 보안팀이 "우리 S3 버킷 중 외부 계정에 노출된 게 하나도 없음을 증명하라"고 요구한다. 패턴 기반 스캐너보다 IAM Access Analyzer가 나은 근본적 이유는?

A) 더 많은 위험 패턴 목록을 갖고 있어서
B) 정책을 형식 논리로 변환해 SMT 솔버로 "외부 접근 가능한 입력이 존재하지 않음"을 증명하므로 거짓 음성이 원리적으로 없다
C) 실시간으로 모든 요청을 시도해봐서
D) AWS 직원이 수동 검토하므로

**정답: B**

해설: 패턴 매칭 스캐너는 "내가 아는 위험 패턴에 안 걸렸다"까지만 말할 수 있어 모르는 우회(Condition 조합, NotPrincipal 등)를 놓칠 수 있다. Access Analyzer는 Automated Reasoning을 써서 정책을 논리 명제로 변환하고, "Zone of Trust 밖의 주체가 접근 가능한 입력이 존재하는가"를 SMT 솔버로 푼다. 존재하지 않음을 증명하면 안전을 단언할 수 있어 거짓 음성이 원리적으로 없다. AWS의 Zelkova 엔진이 이를 구현하며, 같은 기술이 하드웨어·프로그램 검증에 쓰인다. C처럼 모든 요청을 시도하는 건 경우의 수가 무한해 불가능하다.

---

**문제 2.** 멀티 계정 Organization에서 형제 계정 간 S3 공유는 의도된 정상 동작이다. External Access finding에서 이 정상 공유를 노이즈로 보지 않으려면?

A) 각 버킷 정책을 수동으로 예외 처리
B) Analyzer의 Zone of Trust를 Organization 단위로 설정 — 조직 내 접근은 정상으로 보고 조직 밖만 finding으로 보고
C) Access Analyzer를 끄고 Trusted Advisor만 쓴다
D) GuardDuty로 대체

**정답: B**

해설: Zone of Trust는 "무엇을 정상으로 볼지"를 정의하는 신뢰 경계다. 계정 단위로 잡으면 같은 조직의 형제 계정도 외부로 잡혀 정상 공유가 finding으로 쏟아진다. Organization 단위로 잡으면 조직 내 계정 간 접근은 정상으로 넘어가고 조직 밖으로 새는 진짜 위험만 남는다. 거버넌스 모델(단일 계정 격리 vs 조직 차원 공유)에 따라 Zone of Trust를 선택해야 하며, 이는 기술 디테일이 아니라 정책 결정이다.

---

**문제 3.** 새 IAM 역할에 `*` 권한을 주고 운영 중이다. 실제 사용 패턴에 맞는 최소 권한 정책으로 자동 축소하려면?

A) 수동으로 모든 API 호출을 추적해 정책을 작성
B) Access Analyzer Policy Generation — CloudTrail의 지난 90일 활동에서 실제 호출한 API·Resource·Condition만 추려 최소 권한 정책 JSON을 역산
C) Inspector로 스캔
D) Trusted Advisor Security 점검

**정답: B**

해설: Policy Generation은 "일단 넓게 배포 → 실제 사용 관찰 → 사용 데이터로 정책 역산"이라는 현실적 순서를 자동화한다. CloudTrail 90일 활동을 스캔해 그 역할이 실제 호출한 API만 포함한 정책을 생성한다. 단, CloudTrail이 충분히 오래 켜져 있어야 하고 분석 기간에 모든 정상 경로(분기 말 배치 등)가 실행됐어야 정확하다 — 드물게 도는 작업이 누락되면 정책 교체 후 깨질 수 있으므로 자동 생성 결과는 출발점이지 그대로 믿을 최종 답이 아니다.

---

**문제 4.** 회사가 "어떤 IAM 정책 변경도 기존보다 권한을 넓혀선 안 된다"는 가드레일을 CI/CD에 강제하려 한다. 어떤 기능이 적합한가?

A) Trusted Advisor
B) Access Analyzer Custom Policy Checks — Zelkova의 정책 비교(A ⊇ B) 능력으로 변경이 권한을 확대하는지 형식 증명해 머지를 차단
C) GuardDuty
D) Config Rule

**정답: B**

해설: Custom Policy Checks는 회사 고유의 가드레일(특정 Action 금지, 권한 확대 금지 등)을 CI/CD에 넣어, 정책 변경 PR이 위반하면 머지를 막는다. "이 변경이 권한을 넓히는가"는 두 정책의 허용 집합 포함 관계(A ⊇ B)를 형식적으로 증명하는 것으로, Zelkova 엔진이 이를 판정한다. 시프트 레프트 원칙대로 프로덕션에서 finding으로 발견하는 비싼 경로 대신 머지 시점에 차단한다.

---

**문제 5.** Trusted Advisor의 100개 이상 전체 점검에 접근하려면 무엇이 필요한가?

A) 무료 Basic 플랜이면 충분
B) Business 또는 Enterprise Support 플랜 (Basic/Developer는 7개 핵심 보안 + 서비스 한도만)
C) Free Tier 가입
D) GuardDuty 활성화

**정답: B**

해설: Trusted Advisor는 Support 플랜에 따라 접근 범위가 다르다. Basic/Developer 플랜은 7개 핵심 보안 점검과 서비스 한도만 볼 수 있고, Cost Optimization·Performance·Fault Tolerance를 포함한 100개 이상 전체 점검은 Business($100/월) 이상에서만 열린다. 시험에서 "전체 점검을 쓰려면?"의 답은 항상 Business 이상 Support다.

---

**문제 6.** EC2 인스턴스 한도의 80%에 도달해 트래픽 급증 시 오토스케일링이 막힐 위험을 사전에 알고 싶다. 어떤 도구·카테고리인가?

A) Trusted Advisor — Service Limits 카테고리가 한도 80% 도달 시 경고
B) GuardDuty
C) Access Analyzer
D) Macie

**정답: A**

해설: Trusted Advisor의 Service Limits 카테고리는 EC2 인스턴스 수, EIP, VPC 등 계정·리전별 한도의 80% 도달을 미리 경고한다. 한도에 부딪히면 새 리소스 생성이 실패해, 트래픽 급증으로 오토스케일링이 인스턴스를 더 띄우려는데 막히는 사고가 대표적이다. 사전 경고로 한도 증액 요청을 사고 전에 넣을 수 있다. EventBridge 통합으로 점검 결과 변화 시 자동 알림도 가능하다.

---

**문제 7.** 외부 감사관이 "AWS 인프라가 SOC 2를 준수한다"는 증빙을 요구한다. 별도로 우리 회사 환경이 PCI-DSS를 준수함도 증거로 모아 보고서를 만들어야 한다. 각각 어떤 도구인가?

A) 둘 다 Trusted Advisor
B) AWS 인프라 준수 증빙은 AWS Artifact(무료 다운로드), 고객 환경 준수 증거 수집·보고는 Audit Manager
C) 둘 다 Access Analyzer
D) 둘 다 AWS Artifact

**정답: B**

해설: 공유 책임 모델에서 AWS Artifact는 **AWS가 준수하는** SOC/PCI/ISO 등의 보고서를 무료로 받는 창구(AWS 책임 영역 증빙)이고, Audit Manager는 **고객 자신의** 환경이 표준을 준수함을 증거로 자동 수집해 감사 보고서를 만드는 도구(고객 책임 영역 증빙)다. Artifact는 "AWS 쪽", Audit Manager는 "고객 쪽"을 증명한다. 둘은 다른 책임 경계를 다루므로 시나리오에 따라 정확히 구분해야 한다.

---
