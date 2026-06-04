# Day 4 - 위협을 탐지하는 네 개의 눈, 그리고 그것들을 하나로 모으는 법

보안 사고는 거의 항상 "징후가 있었는데 아무도 못 봤다"로 끝난다. SSH 무차별 대입이 며칠간 로그에 찍혔지만 그 로그를 보는 사람이 없었고, 신용카드 번호가 평문으로 S3에 올라가 있었지만 그 버킷을 열어본 사람이 없었고, 패치 안 된 EC2가 6개월째 알려진 CVE를 안고 돌아갔지만 아무도 스캔하지 않았다. 침해의 본질은 "탐지 가능했지만 탐지하지 않은 시간"이다. 보안 업계에는 이걸 재는 지표가 있다 — **MTTD(Mean Time To Detect)**, 평균 탐지 시간. 2023년 IBM의 데이터 침해 비용 보고서는 침해를 식별하고 봉쇄하는 데 평균 277일이 걸렸다고 보고했다. 9개월 동안 공격자가 집 안을 돌아다녔다는 뜻이다.

AWS의 보안 탐지 도구 네 종 — GuardDuty, Inspector, Macie, Security Hub — 은 이 "보지 못하는 시간"을 줄이기 위해 존재한다. 각각이 보는 곳이 다르다. GuardDuty는 네트워크와 API 행동을 보고, Inspector는 소프트웨어 취약점을 보고, Macie는 데이터 자체의 민감도를 보고, Security Hub는 이 셋이 본 것을 한 화면에 모은다. 이 글은 네 도구가 각각 무엇을 "어떻게" 보는지 — 에이전트 없이 어떻게 위협을 잡는지, CVE 데이터베이스를 어떻게 대조하는지, ML이 신용카드 번호를 어떻게 가려내는지 — 그 내부 동작을 따라간다.

## GuardDuty — 에이전트 없이 위협을 보는 법

GuardDuty의 가장 큰 셀링 포인트는 "에이전트가 없다"는 것이다. 인스턴스에 뭔가를 설치할 필요 없이, 콘솔에서 클릭 세 번이면 계정 전체의 위협 탐지가 켜진다. 이게 어떻게 가능한가? 비밀은 GuardDuty가 워크로드를 직접 들여다보지 않고, **AWS가 이미 갖고 있는 메타데이터 스트림**을 분석한다는 데 있다.

세 가지 핵심 데이터 소스가 있다. **VPC Flow Logs**는 누가 누구와 어떤 포트로 통신했는지(패킷 내용은 빼고 헤더만), **CloudTrail**은 누가 어떤 API를 호출했는지, **DNS Logs**(Route 53 Resolver)는 인스턴스가 어떤 도메인을 조회했는지를 담는다. 이 셋은 GuardDuty를 켜기 전에도 AWS 내부에서 흐르고 있던 데이터다 — GuardDuty는 별도로 이 로그를 활성화하거나 저장하지 않고, AWS 백본에서 직접 스트림을 가로채 분석한다. 그래서 사용자의 Flow Logs/CloudTrail 설정과 무관하게 동작하고, 사용자 계정에 로그 저장 비용도 발생시키지 않는다.

분석 엔진은 두 축이다. 첫째는 **Threat Intelligence** — AWS와 CrowdStrike, Proofpoint 등이 관리하는 알려진 악성 IP·도메인 목록과 대조한다. 인스턴스가 비트코인 채굴 풀이나 알려진 C&C(Command and Control) 서버 도메인을 조회하면 즉시 잡힌다. 둘째는 **머신러닝 기반 이상 탐지** — 평소 이 계정의 정상 행동 패턴을 학습한 뒤, 거기서 벗어나는 행동(예: 평소 안 쓰던 리전에서 갑자기 EC2를 대량 생성, 한 번도 안 본 국가에서의 Root 로그인)을 점수화한다.

> 💡 **관련 이론**: GuardDuty의 ML 이상 탐지는 침입 탐지 시스템(IDS)의 두 갈래 중 "이상 기반(anomaly-based)" 접근의 클라우드 구현이다. IDS는 전통적으로 두 방식으로 나뉜다 — **시그니처 기반**(알려진 공격 패턴 DB와 대조, 안티바이러스와 같은 원리)과 **이상 기반**(정상의 기준선을 세우고 거기서 벗어나면 경보). GuardDuty의 Threat Intel은 시그니처 기반에, ML 베이스라이닝은 이상 기반에 해당한다. 이상 기반의 고전적 난점은 거짓 양성(false positive)이다 — 정상이지만 드문 행동을 공격으로 오인한다. 이 개념은 1987년 Dorothy Denning의 논문 "An Intrusion-Detection Model"에서 정립됐고, 거의 모든 현대 IDS/SIEM이 이 두 축의 조합 위에서 동작한다.

GuardDuty의 finding은 이름 자체가 정보다. `위협유형:리소스/세부동작` 구조의 명명 규칙(naming scheme)을 따른다.

| Finding 예시 | 의미 | 데이터 소스 |
|---|---|---|
| `UnauthorizedAccess:EC2/SSHBruteForce` | SSH 무차별 대입 공격 | VPC Flow Logs |
| `Recon:EC2/PortProbeUnprotectedPort` | 외부에서 포트 스캔 정찰 | VPC Flow Logs |
| `CryptoCurrency:EC2/BitcoinTool.B!DNS` | 암호화폐 채굴 도메인 통신 | DNS Logs |
| `Backdoor:EC2/C&CActivity.B!DNS` | C&C 서버와 통신 | DNS Logs |
| `IAMUser:RootCredentialUsage` | Root 자격증명 사용 | CloudTrail |
| `Exfiltration:S3/AnomalousBehavior` | 비정상적 대량 S3 데이터 유출 | CloudTrail S3 Data Events |

각 finding에는 **severity 점수(0.1~8.9+)**가 붙는다. 시험에서 자주 나오는 함정 — 이 점수는 1~10 척도가 아니다. 0.1~3.9가 Low, 4.0~6.9가 Medium, 7.0~8.9가 High다(10에 가까울수록 Critical로 표기되기도 하나 실질 상한은 8.9대). EventBridge 규칙으로 자동 대응을 걸 때 "severity 7 이상만"을 잡으려면 7.0부터 필터링한다.

> 🔍 **더 깊이**: DNS 기반 finding(`!DNS` 접미사)은 VPC의 기본 DNS 리졸버(Route 53 Resolver, AmazonProvidedDNS)를 거치는 쿼리만 본다. 인스턴스가 `/etc/resolv.conf`를 8.8.8.8 같은 외부 DNS로 바꿔놓으면 그 쿼리는 Route 53 Resolver를 안 거치므로 GuardDuty가 못 본다. 정교한 멀웨어가 일부러 외부 DNS나 DNS-over-HTTPS(DoH)를 쓰는 이유가 이것이다. 그래서 Route 53 Resolver DNS Firewall로 외부 DNS 사용 자체를 차단하는 것이 GuardDuty의 사각지대를 막는 보완책이 된다. 또 하나, GuardDuty는 finding을 만들 때 같은 위협이 반복되면 새 finding을 계속 만들지 않고 기존 finding을 업데이트한다 — 이 묶음 주기를 finding aggregation이라 하고, 같은 종류 위협의 알림 폭주를 막는다.

> 📚 **사례**: 2019년 Capital One 침해는 약 1억 건의 신용 신청 데이터가 유출된 미국 최대급 금융 침해였다. 원인은 잘못 구성된 WAF가 SSRF(Server-Side Request Forgery) 공격에 악용되어 EC2 인스턴스의 메타데이터 서비스(IMDSv1)에서 IAM 역할 자격증명을 탈취당하고, 그 자격증명으로 S3 버킷을 통째로 읽힌 것이었다. 주목할 점은 침해 자체보다 탐지 실패였다 — 공격은 2019년 3월에 일어났지만 회사가 인지한 건 4개월 뒤인 7월, 그것도 외부 제보를 통해서였다. 만약 GuardDuty의 `Exfiltration:S3/AnomalousBehavior`(비정상적 대량 S3 접근)나 Recon finding이 활성화되어 EventBridge로 알림이 갔다면 탐지 시간이 며칠로 줄었을 것이다. 이 사건 이후 AWS는 IMDSv2(세션 토큰 필수)를 강하게 권장하기 시작했다.

## Inspector — CVE 데이터베이스와 소프트웨어를 대조하는 법

GuardDuty가 "지금 일어나는 나쁜 행동"을 본다면, Inspector는 "아직 일어나지 않았지만 일어날 수 있는 약점"을 본다. 둘은 시점이 다르다. Inspector는 EC2·ECR 이미지·Lambda 함수 안에 설치된 소프트웨어 패키지의 버전을 수집해서, 그 버전에 알려진 취약점(CVE)이 있는지 데이터베이스와 대조한다.

핵심 개념은 **CVE와 CVSS**다. CVE(Common Vulnerabilities and Exposures)는 발견된 취약점 하나하나에 붙는 전 세계 공통 식별자다 — `CVE-2021-44228`처럼 연도와 일련번호로 표기한다. 이 식별자는 MITRE가 관리하고, 모든 보안 도구가 같은 번호로 같은 취약점을 가리킨다. CVSS(Common Vulnerability Scoring System)는 그 취약점이 얼마나 위험한지를 0.0~10.0으로 점수화한 표준이다. Inspector는 이 CVSS 기본 점수에 "이 취약점이 실제로 악용되고 있는가(exploit available)", "네트워크로 도달 가능한가(network reachability)" 같은 맥락 가중치를 더해 자체 위험 점수를 낸다.

이 명명의 위력은 Inspector가 CVE를 발명하지 않는다는 데 있다. Inspector는 NVD(National Vulnerability Database)와 각 OS 벤더의 보안 권고를 가져와, 수집한 패키지 버전과 기계적으로 매칭한다. EC2에서 패키지 목록을 어떻게 수집하나? **SSM Agent**가 그 일을 한다. Inspector는 자체 에이전트를 설치하지 않고 이미 EC2에 깔린 SSM Agent의 Inventory 기능에 올라탄다 — 그래서 SSM Agent가 없거나 SSM에 등록 안 된 인스턴스는 스캔되지 않는다.

> 💡 **관련 이론**: Inspector가 "취약점을 직접 시험하지 않고 패키지 버전만 대조한다"는 점은 보안 스캐닝의 두 패러다임 중 **SCA(Software Composition Analysis)**에 해당한다. 보안 스캔은 크게 두 갈래다 — **DAST**(Dynamic Application Security Testing, 실행 중인 앱을 실제로 공격해보며 취약점을 찾음)와 **SCA/SAST**(코드·의존성을 정적으로 분석해 알려진 취약 버전을 찾음). Inspector는 후자다. 실제로 공격을 시도하지 않으므로 인스턴스를 망가뜨릴 위험이 없고 빠르지만, "이 버전에 CVE가 있다"는 사실이 곧 "내 환경에서 악용 가능하다"는 뜻은 아니라는 한계가 있다(취약한 함수가 실제로 호출 경로에 없을 수도 있다). 이 간극을 메우려 Inspector는 network reachability 분석을 더해 "외부에서 실제 도달 가능한가"를 함께 평가한다.

스캔 대상별로 동작이 다르다.

| 대상 | 수집 방식 | 트리거 | 보는 것 |
|---|---|---|---|
| **EC2** | SSM Agent Inventory | 지속적(패키지 변경·새 CVE 공개 시 재평가) | OS 패키지 + 네트워크 도달성 |
| **ECR 이미지** | 이미지 레이어 분석 | 푸시 시 자동 + 주기 재스캔 | OS 패키지 + 언어 의존성 |
| **Lambda** | 함수 코드 + 레이어 | 배포 시 자동 | 의존 패키지 + 코드 취약점 |

특히 중요한 건 **지속적(continuous) 스캔**이라는 점이다. Inspector v2는 한 번 스캔하고 끝이 아니라, 새 CVE가 NVD에 공개되면 이미 스캔했던 리소스를 자동으로 재평가한다. 어제는 깨끗했던 이미지가 오늘 새로 공개된 CVE 때문에 갑자기 finding이 뜰 수 있다 — 이게 정상 동작이다.

> 📚 **사례**: 2021년 12월 Log4Shell(`CVE-2021-44228`)은 Java 로깅 라이브러리 Log4j의 원격 코드 실행 취약점으로, CVSS 만점 10.0을 받은 역대급 사건이었다. 한 줄의 로그 문자열(`${jndi:ldap://...}`)만으로 서버에서 임의 코드가 실행됐고, Log4j는 전 세계 거의 모든 Java 애플리케이션에 깔려 있어 며칠 만에 인터넷 전체가 패치 전쟁에 돌입했다. 이때 가치를 증명한 게 SCA 도구들이었다 — "우리 환경 어디에 취약한 Log4j 버전이 있나"를 사람이 일일이 찾는 건 불가능했고, Inspector 같은 도구가 ECR 이미지와 Lambda 레이어를 자동 스캔해 `CVE-2021-44228`이 박힌 아티팩트를 즉시 목록화했다. AWS는 사건 직후 Inspector에 Log4Shell 전용 탐지를 긴급 추가했다. 이 사건은 "내가 직접 안 쓴 의존성도 내 공격 표면"이라는 SCA의 존재 이유를 각인시켰다.

> ⚠️ **함정**: Inspector v1과 v2를 혼동하면 안 된다. 구버전 Inspector(classic, v1)는 사용자가 직접 별도 에이전트를 설치하고 평가 템플릿(assessment template)을 만들어 수동으로 실행하는 방식이었다. 현재 시험과 실무의 표준은 **Inspector v2**로, SSM Agent에 올라타 별도 설치 없이 지속 스캔하며 EC2뿐 아니라 ECR·Lambda까지 본다. 문제에서 "에이전트를 따로 설치하고 스캔을 수동 실행"이라는 설명이 나오면 그건 옛 v1을 가리키는 함정 선택지일 가능성이 높다.

## Macie — ML이 신용카드 번호를 가려내는 법

GuardDuty가 행동을, Inspector가 소프트웨어를 본다면, Macie는 **데이터 그 자체의 내용**을 본다. S3 버킷 안에 신용카드 번호가, 주민번호(SSN)가, 여권 번호가, 심지어 실수로 커밋된 AWS Access Key가 평문으로 들어 있는지를 찾아낸다. 이건 앞의 두 도구와 근본적으로 다른 종류의 스캔이다 — 메타데이터가 아니라 객체의 본문(content)을 읽어야 한다.

어떻게 신용카드 번호인 줄 아는가? 두 단계다. 첫째, **정규식 + 키워드 패턴 매칭**으로 후보를 찾는다. 신용카드 번호는 16자리 숫자라는 형태가 있고, SSN은 `NNN-NN-NNNN` 형태가 있다. 둘째, 여기서 끝내면 거짓 양성이 폭발한다 — 세상의 모든 16자리 숫자가 신용카드는 아니니까. 그래서 Macie는 **체크섬 검증**을 더한다. 신용카드 번호는 **Luhn 알고리즘**이라는 검증식을 통과해야 유효한 번호다. 무작위 16자리 숫자가 Luhn 검증을 우연히 통과할 확률은 1/10이므로, 이 검증만으로 거짓 양성의 90%가 걸러진다. 여기에 ML 기반 분류로 문맥(주변에 "card", "expiry" 같은 단어가 있는가)까지 보면 정확도가 더 올라간다.

> 💡 **관련 이론**: Luhn 알고리즘(모듈로 10 알고리즘)은 1954년 IBM의 Hans Peter Luhn이 고안한 체크섬 공식으로, 신용카드뿐 아니라 IMEI(휴대폰 식별번호), 일부 국가 주민번호에도 쓰인다. 동작은 단순하다 — 오른쪽에서 한 자리 건너 두 배로 만들고(두 배가 9를 넘으면 자릿수를 더함), 전체 합이 10으로 나누어떨어지면 유효. 이건 암호학적 보안 장치가 아니라 **단순 입력 오류(오타, 자리 바꿈)를 잡는 검출 코드**다. 비슷한 계열로 ISBN의 모듈로 11, 바코드의 모듈로 10이 있다. Macie가 이걸 쓰는 이유는 "형태가 맞는 후보"와 "실제 유효한 번호"를 구분해 거짓 양성을 줄이기 위해서다 — 보안 도구의 신뢰도는 거짓 양성을 얼마나 줄이느냐에 달려 있다.

Macie의 비용 구조는 시험과 실무 모두에서 중요하다. Macie는 **스캔한 데이터량에 비례해 과금**한다. 페타바이트급 데이터 레이크를 통째로 스캔하면 비용이 폭발한다. 그래서 Macie는 두 가지 절감 장치를 둔다 — 첫째, 버킷의 일부만 표본 추출(sampling)해 스캔하는 옵션. 둘째, **자동 민감 데이터 발견(automated sensitive data discovery)** 모드로, 전체를 매번 다 읽는 대신 객체를 지능적으로 표본 추출해 "어느 버킷이 위험한지"의 지도를 저비용으로 그린 뒤, 위험 버킷만 정밀 스캔한다.

> ⚠️ **함정**: Macie 비용은 GuardDuty·Inspector와 과금 모델이 다르다는 점을 기억해야 한다. GuardDuty는 분석한 이벤트량(Flow Logs/CloudTrail 이벤트 수), Inspector는 스캔한 리소스 수로 과금하지만, **Macie는 스캔한 데이터의 바이트 수**로 과금한다. 그래서 "수십 TB의 로그가 쌓인 S3 버킷에 Macie를 무필터로 켰다"는 시나리오는 비용 폭탄의 전형이다. 시험에서 "민감 데이터 스캔 비용을 통제하면서 위험 버킷을 식별하라"가 나오면 답은 "자동 민감 데이터 발견(표본 추출) 후 고위험 버킷만 정밀 스캔"이다.

## Security Hub — 흩어진 finding을 한 언어로 모으는 법

네 번째 도구는 앞의 셋과 성격이 다르다. Security Hub는 스스로 위협을 탐지하지 않는다. 대신 GuardDuty·Inspector·Macie·IAM Access Analyzer·Config, 그리고 Palo Alto·Splunk 같은 서드파티 도구가 각자 만든 finding을 **한 곳에 모으고, 한 언어로 통일하고, 보안 표준에 비춰 점수를 매긴다.** 클라우드 보안의 SIEM(Security Information and Event Management) 역할이다.

핵심 메커니즘은 **ASFF(AWS Security Finding Format)**다. 문제는 도구마다 finding을 표현하는 방식이 제각각이라는 것이다 — GuardDuty의 finding과 Inspector의 finding과 서드파티 도구의 알림은 필드 이름도, 심각도 척도도, 시간 형식도 다 다르다. 이걸 그대로 모으면 한 화면에서 비교가 불가능하다. ASFF는 모든 finding을 똑같은 JSON 스키마(같은 필드 이름, 같은 severity 체계, 같은 리소스 표기)로 정규화하는 표준 포맷이다. 모든 통합 도구는 자기 finding을 ASFF로 변환해 Security Hub에 보내고, 그래서 출처가 무엇이든 같은 필터·같은 대시보드로 다룰 수 있다.

> 💡 **관련 이론**: ASFF가 푸는 문제는 데이터 통합에서 고전적인 **"정규화(canonicalization)"** 문제다. 여러 출처의 이종 데이터를 한 시스템에서 다루려면 공통 표현형으로 변환해야 한다는 원칙으로, 로그 통합의 Common Event Format(CEF), 보안 정보 교환의 STIX/TAXII, 네트워크 관리의 SNMP MIB가 모두 같은 발상이다. 핵심 통찰은 "N개의 도구가 서로 M개의 형식으로 대화하면 N×M개의 변환기가 필요하지만, 모두가 하나의 표준 형식으로만 변환하면 N개의 변환기로 충분하다"는 것이다. ASFF는 AWS 보안 생태계의 이 허브 표준이고, 그래서 Security Hub가 SIEM의 "통합 지점" 역할을 할 수 있다.

Security Hub의 두 번째 기능은 **보안 표준 자동 평가**다. finding을 모으는 데서 그치지 않고, 계정 구성이 업계 보안 표준에 맞는지를 자동 채점한다.

| 표준 | 성격 | 대표 점검 항목 |
|---|---|---|
| **AWS FSBP** (Foundational Security Best Practices) | AWS 자체 모범사례 | S3 퍼블릭 차단, 루트 MFA, 암호화 강제 |
| **CIS AWS Foundations Benchmark** | 업계 합의 보안 기준 | IAM 비밀번호 정책, CloudTrail 활성화 |
| **PCI-DSS** | 신용카드 처리 규제 | 카드 데이터 암호화·접근 통제 |
| **NIST 800-53** | 미국 정부 보안 통제 | 광범위한 통제 항목 매핑 |

이 표준 평가는 내부적으로 Config Rule로 구현된다 — 그래서 Security Hub의 표준을 켜면 뒤에서 다수의 Config Rule이 활성화되고, Config 활성화가 전제 조건이 된다.

세 번째는 **멀티 계정·멀티 리전 통합**이다. Organizations와 통합하면 Delegated Administrator(보통 전용 Audit 계정)를 지정해 모든 멤버 계정의 finding을 한 계정에서 본다. 나아가 Cross-Region Aggregation을 켜면 여러 리전의 finding까지 한 리전으로 모은다 — 글로벌 기업이 수십 개 계정·수 개 리전의 보안 상태를 단일 대시보드로 보는 거버넌스의 핵심이다.

> 🔍 **더 깊이**: Security Hub의 자동 대응은 보통 EventBridge를 통한다. Security Hub는 새 finding(또는 finding 상태 변화)을 EventBridge 이벤트로 발행하고, 규칙으로 매칭해 Lambda나 SSM Automation으로 대응을 자동화한다. AWS는 이 패턴을 위한 솔루션으로 **Automated Security Response on AWS**(구 SHARR)라는 사전 제작 Runbook 묶음을 제공한다 — "S3 퍼블릭 접근이 발견되면 자동으로 Block Public Access를 켠다", "노출된 보안 그룹 규칙을 자동으로 제거한다" 같은 표준 교정(remediation)을 버튼 하나로 건다. 시험에서 "finding을 사람이 일일이 처리하지 않고 자동 교정"이 나오면 이 EventBridge → SSM/Lambda 경로가 정답 골격이다.

## 네 도구가 함께 돌아가는 그림

정리하면 각 도구는 보는 층위가 다르고, Security Hub가 그것들을 하나로 꿴다.

```
[GuardDuty]  네트워크·API 행동의 위협    ── Flow Logs/CloudTrail/DNS
[Inspector]  소프트웨어의 알려진 취약점  ── SSM Agent / 이미지 / 코드
[Macie]      데이터 내용의 민감도        ── S3 객체 본문
[Access Analyzer] 외부로 노출된 리소스   ── 리소스 정책 분석
[Config]     구성의 규정 준수 여부       ── 리소스 설정 변경
        │  각자 ASFF로 변환
        ▼
[Security Hub] ── 통합 + 표준 평가 + 점수
        │
        ▼ EventBridge
   ┌────┴─────┐
[Lambda]  [SSM Automation]
   - 의심 인스턴스 격리(SG 교체)
   - 노출된 IAM 키 비활성화
   - 퍼블릭 S3 차단
   - SNS 알림
```

부차적이지만 시험에 나오는 두 가지를 덧붙인다. **Firewall Manager**는 Organizations 전반에 WAF·Shield Advanced·보안 그룹 정책을 중앙에서 강제하는 도구다 — 신규 ALB가 생기면 자동으로 표준 WAF 규칙을 붙이는 식이다. **WAF**는 L7(HTTP) 방화벽으로 SQL Injection·XSS·봇을 막고, **Shield**는 DDoS 방어로 Standard(무료, L3/L4 자동)와 Advanced(유료, 정교한 L7 방어 + 24/7 대응팀)로 나뉜다. GuardDuty가 "이미 들어온 위협"을 탐지한다면 WAF·Shield는 "들어오기 전에 막는" 경계 방어라는 점에서 층위가 다르다.

## 정리하며

네 도구를 한 문장으로 외운다 — **GuardDuty는 행동(위협)을, Inspector는 소프트웨어(취약점)를, Macie는 데이터(민감 정보)를 보고, Security Hub는 이 셋을 ASFF로 모아 표준에 비춘다.** 그리고 모든 자동 대응은 "보안 도구 → EventBridge → Lambda/SSM Automation"이라는 같은 골격을 탄다.

각 도구의 동작 원리를 기억하면 함정을 피할 수 있다. GuardDuty는 에이전트 없이 AWS 내부 메타데이터 스트림을 보지만 Runtime Monitoring만은 에이전트가 필요하고, 외부 DNS를 쓰면 사각지대가 생긴다. Inspector v2는 SSM Agent에 올라타 CVE를 지속 대조하므로 새 CVE 공개 시 과거 리소스가 다시 finding을 띄울 수 있다. Macie는 데이터량으로 과금하므로 무필터 전체 스캔은 비용 폭탄이고, 표본 기반 자동 발견으로 위험 버킷부터 좁혀야 한다. Security Hub는 스스로 탐지하지 않고 모으고 표준화할 뿐이며, 표준 평가는 Config Rule로 구현되어 Config가 전제다.

다음 글에선 이번 주에 다룬 보안·암호화 도구 전체를 시나리오로 묶어 복습한다. KMS의 키 관리부터 네 도구의 탐지 분담까지, 실제 시험에서 어떤 키워드가 어떤 답을 가리키는지를 문제로 굳힌다.

---

## 📝 연습 문제

**문제 1.** EC2 인스턴스가 알려진 암호화폐 채굴 풀 도메인을 DNS로 조회하고 있다. 에이전트 설치 없이 이를 자동 탐지하려면?

A) Inspector v2로 OS 취약점을 스캔한다
B) GuardDuty를 켜면 DNS Logs 분석으로 `CryptoCurrency:EC2/BitcoinTool.B!DNS` finding이 자동 발행된다
C) Macie로 인스턴스 디스크의 민감 데이터를 스캔한다
D) Config Rule로 인스턴스 태그를 검사한다

**정답: B**

해설: GuardDuty는 에이전트 없이 VPC Flow Logs·CloudTrail·DNS Logs를 분석해 위협을 탐지한다. 암호화폐 채굴 도메인 통신은 Threat Intelligence DB와 대조되는 대표적 DNS 기반 finding이다. 단 주의할 점은 인스턴스가 외부 DNS(예: 8.8.8.8)나 DoH를 쓰면 Route 53 Resolver를 안 거쳐 GuardDuty 사각지대가 되므로, DNS Firewall로 외부 DNS를 차단해 보완한다. Inspector는 취약점(아직 일어나지 않은 약점)을, Macie는 데이터 내용을 보는 도구라 이 시나리오와 층위가 다르다.

---

**문제 2.** 새로운 CVE가 어제 NVD에 공개됐다. 일주일 전 Inspector v2로 스캔해 "깨끗함" 판정을 받은 ECR 이미지에서 오늘 갑자기 Critical finding이 떴다. 이 동작에 대한 올바른 해석은?

A) Inspector 오작동이므로 finding을 무시한다
B) Inspector v2는 지속(continuous) 스캔이라, 새 CVE가 공개되면 기존 리소스를 자동 재평가한다 — 정상 동작이다
C) 누군가 이미지를 변조했다는 신호다
D) 이미지를 다시 푸시해야 스캔이 갱신된다

**정답: B**

해설: Inspector v2의 핵심 특성이 지속 스캔이다. 한 번 스캔으로 끝나지 않고, 새 CVE가 NVD/벤더 권고에 추가되면 이미 스캔했던 EC2·ECR·Lambda를 자동으로 재평가한다. 따라서 어제까지 깨끗하던 이미지가 오늘 새 CVE 때문에 finding을 띄우는 것은 버그가 아니라 의도된 동작이다. Log4Shell(CVE-2021-44228) 사태 때 이 지속 스캔이 "우리 환경 어디에 취약 버전이 있나"를 자동 목록화해 가치를 증명했다.

---

**문제 3.** 데이터 분석팀이 운영하는 80TB 규모 S3 데이터 레이크에서 신용카드 번호 노출 위험이 있는 버킷을 찾되, 스캔 비용을 통제해야 한다. 가장 적절한 접근은?

A) Macie로 80TB 전체를 한 번에 정밀 스캔한다
B) Macie의 자동 민감 데이터 발견(표본 추출)으로 위험 버킷 지도를 저비용으로 그린 뒤, 고위험 버킷만 정밀 스캔한다
C) GuardDuty로 S3 버킷을 스캔한다
D) Inspector로 S3 객체를 스캔한다

**정답: B**

해설: Macie는 스캔한 데이터의 바이트 수에 비례해 과금하므로, 80TB 전체를 무필터로 정밀 스캔하면 비용이 폭발한다. 자동 민감 데이터 발견 모드는 객체를 지능적으로 표본 추출해 "어느 버킷이 위험한지"의 지도를 저비용으로 만든다. 그 뒤 고위험으로 식별된 버킷만 정밀 분류 작업(classification job)을 돌리면 비용을 통제하면서 위험을 잡는다. GuardDuty·Inspector는 S3 객체 본문의 민감 데이터를 보는 도구가 아니다.

---

**문제 4.** 회사는 GuardDuty, Inspector, Macie, IAM Access Analyzer, 그리고 서드파티 Palo Alto 도구의 finding을 한 대시보드에서 동일한 형식으로 보고, 동시에 계정이 CIS·PCI-DSS 표준을 충족하는지 자동 채점하려 한다. 어떤 서비스인가?

A) CloudWatch Dashboard
B) Security Hub — ASFF로 모든 finding을 정규화 통합하고, 보안 표준을 자동 평가한다
C) AWS Config 단독
D) Audit Manager

**정답: B**

해설: Security Hub는 스스로 위협을 탐지하지 않고, 여러 도구의 finding을 ASFF(AWS Security Finding Format) 표준 JSON 스키마로 정규화해 한 화면에 모은다. 동시에 FSBP·CIS·PCI-DSS·NIST 800-53 같은 보안 표준을 Config Rule 기반으로 자동 채점한다. 따라서 "통합 + 표준 평가"라는 두 요구를 한 번에 만족하는 유일한 서비스다. Config는 구성 준수를 보지만 멀티 도구 finding 통합 허브는 아니고, Audit Manager는 감사 증거 수집용이다.

---

**문제 5.** GuardDuty가 severity 8.5의 침해 의심 인스턴스를 탐지했다. 사람 개입 없이 해당 인스턴스를 즉시 격리 보안 그룹으로 교체하는 자동 대응을 구성하려 한다. 표준 흐름은?

A) Lambda가 1분마다 GuardDuty를 폴링해 finding을 확인한다
B) GuardDuty Finding → EventBridge Rule(severity 7.0 이상 필터) → SSM Automation Runbook `AWS-IsolateEC2InstanceFromGuardDutyFinding`(또는 Lambda)이 격리 SG로 교체
C) Config Rule이 인스턴스를 자동 종료한다
D) Inspector가 인스턴스를 패치한다

**정답: B**

해설: AWS 보안 자동 대응의 표준 골격은 "보안 도구 → EventBridge → SSM Automation/Lambda"다. GuardDuty는 finding을 EventBridge 이벤트로 발행하고, severity 점수(0.1~8.9 척도, 7.0 이상이 High)로 필터링한 규칙이 매칭되면 SSM Automation Runbook이 인스턴스의 SG를 격리 SG로 교체한다. AWS는 이 용도로 `AWS-IsolateEC2InstanceFromGuardDutyFinding` 같은 표준 Runbook을 제공한다. 폴링(A)은 비효율적이고 실시간성이 떨어지며, AWS의 권장 이벤트 구동 패턴이 아니다.

---

**문제 6.** 보안팀이 Inspector 설정을 검토하다 "별도 에이전트를 설치하고 평가 템플릿을 만들어 수동으로 스캔을 실행한다"는 옛 문서를 발견했다. 현재 시험·실무 기준으로 올바른 설명은?

A) 그 방식이 현재 표준이므로 그대로 따른다
B) 그것은 구버전 Inspector(v1, classic) 방식이다. 현재 표준인 Inspector v2는 SSM Agent에 올라타 별도 설치 없이 EC2·ECR·Lambda를 지속 스캔한다
C) Inspector는 항상 에이전트가 필요 없었다
D) Inspector v2는 EC2만 스캔한다

**정답: B**

해설: 구버전 Inspector(v1, classic)는 사용자가 전용 에이전트를 설치하고 평가 템플릿을 만들어 수동 실행하는 방식이었다. 현재 표준인 Inspector v2는 이미 설치된 SSM Agent의 Inventory에 올라타 별도 설치 없이 동작하고, EC2뿐 아니라 ECR 이미지와 Lambda 함수까지 지속(continuous) 스캔한다. "에이전트 별도 설치 + 수동 실행"이라는 설명은 v1을 가리키는 함정 신호다. 단 v2도 EC2 패키지 수집에는 SSM Agent가 전제이므로, SSM에 등록 안 된 인스턴스는 스캔되지 않는다.

---

**문제 7.** Security Hub에서 CIS AWS Foundations Benchmark 표준을 활성화했는데, 표준 점검 결과가 전혀 채워지지 않는다. 가장 가능성 높은 전제 조건 누락은?

A) GuardDuty가 비활성화되어 있다
B) AWS Config가 비활성화되어 있다 — Security Hub의 보안 표준 점검은 내부적으로 Config Rule로 구현되므로 Config가 전제 조건이다
C) Macie가 비활성화되어 있다
D) WAF 규칙이 없다

**정답: B**

해설: Security Hub의 보안 표준(CIS·FSBP·PCI-DSS 등) 자동 평가는 뒤에서 다수의 AWS Config Rule로 구현된다. 따라서 해당 리전·계정에서 Config가 활성화되어 리소스 구성을 기록하고 있어야 표준 점검이 채워진다. Config가 꺼져 있으면 표준을 켜도 점검 결과가 비어 있다. GuardDuty·Macie는 각자 finding을 Security Hub에 보내는 통합 소스일 뿐, 표준 점검의 전제 조건은 아니다.

---

