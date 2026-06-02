# Day 13 - ELB: ALB / NLB / GLB 비교

📅 날짜: Week 3 (Day 3)
🎯 주제: AWS Elastic Load Balancing
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- ALB / NLB / GLB / CLB(레거시) 4종 차이를 안다
- Target Group / Health Check / 라우팅 정책을 설명한다
- 시나리오 키워드(HTTP/TLS/UDP/IPS) → 정답 매핑이 자동으로 나온다

---

## 🧩 사전 지식 (CS 기초)

- **OSI L4 vs L7**: L4 = TCP/UDP 포트 / L7 = HTTP 헤더·경로·호스트.
- **헬스 체크**: 백엔드가 살아있는지 주기 호출. 실패 횟수/통과 횟수로 판정.
- **Sticky Session**: 같은 클라이언트를 같은 백엔드로. 쿠키 기반.
- **Anycast IP**: 동일 IP가 여러 위치에 라우팅. NLB의 고정 IP·Anycast 특성.

---

## 📖 이론 내용

### 1. 4종 비교표

| 항목 | ALB | NLB | GLB | CLB (구) |
|------|-----|-----|-----|----------|
| OSI 계층 | L7 | L4 | L3 (Gateway) | L4/L7 |
| 프로토콜 | HTTP/HTTPS, WS, gRPC | TCP/UDP/TLS | IP | HTTP/TCP |
| 지연 | ~수십 ms | 100 µs | - | - |
| 고정 IP | X (DNS) | **O (EIP 가능)** | - | X |
| 동일 인스턴스 다중 포트 | O | O | - | X |
| 컨테이너(동적 포트) | O | O | - | X |
| 사용 사례 | 웹앱·MS·gRPC | 게임·IoT·트레이딩·MQTT | 3rd-party 방화벽·IPS | 레거시 |

> 💡 시험 키워드: HTTP 호스트/경로 라우팅 → **ALB**, 초저지연 TCP/UDP 또는 고정 IP → **NLB**, 보안 어플라이언스 체이닝 → **GLB**.

### 2. ALB의 라우팅 규칙

- **Host-based**: `api.example.com` vs `app.example.com`.
- **Path-based**: `/api/*` vs `/static/*`.
- **Header / Query / Source IP / HTTP Method** 조건도 가능.
- **Target Type**: Instance / IP / Lambda / Application Load Balancer (NLB target).

### 3. NLB의 특수성

- **각 AZ에 고정 IP 1개**(EIP 할당 가능).
- TLS 종료 지원.
- **Static IP** + Cross-zone(옵션) → 화이트리스트하기 좋음.
- 헬스 체크에 HTTP/HTTPS/TCP 사용 가능.

### 4. GLB (Gateway Load Balancer)

- **L3 GENEVE 터널링**으로 3rd-party 어플라이언스 체인.
- 사용 사례: IPS/IDS, DPI, NGFW 체이닝.
- 어플라이언스의 무중단 스케일·HA.

### 5. Target Group & 헬스 체크

- ELB가 트래픽을 보내는 백엔드 그룹.
- **Healthy threshold**: 연속 N회 성공 → healthy.
- **Unhealthy threshold**: 연속 N회 실패 → unhealthy → 트래픽 차단.
- **Slow Start**: 새 인스턴스에 트래픽을 점진 증가.
- **Stickiness**: ALB 쿠키 / NLB는 source IP.

### 6. Cross-Zone Load Balancing

- ALB: **기본 활성화 + 무료**.
- NLB / GLB: **기본 비활성 + cross-AZ 트래픽 비용**.
- 비활성화 시 한 AZ만 살아남으면 그 AZ로만 트래픽.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **TLS 종료** | ALB/NLB에서 TLS 해제 가능 | ACM 인증서 사용 |
| **SNI** | 하나의 ELB에 여러 도메인 인증서 | ALB/NLB 지원 |
| **WAF + ALB** | L7 보안 통합 | CLB는 WAF 미지원 |
| **HTTP/2, gRPC** | ALB만 지원 | NLB는 TCP |
| **Connection Draining (Deregistration Delay)** | 정상 종료 대기 시간 | ASG 종료 시 |

> ⚠️ **함정**: "초저지연 TCP + 고정 IP + UDP" → 정답은 **NLB**. ALB는 HTTP만.

> 💡 **암기 팁**: A = **A**pplication(L7), N = **N**etwork(L4), G = **G**ateway(L3).

### 관련 서비스 Cross-Reference

- ASG와 통합 → Day 4
- CloudFront 앞단 → Week 4
- WAF → Week 8
- 글로벌 Anycast → Global Accelerator (Day 1)

---

## 🏗️ 아키텍처 다이어그램

```
[ ALB Host/Path 라우팅 ]

  Internet
     ↓
   ALB (api.example.com / app.example.com)
     ├─ Host: api.* → TG-api (ECS Fargate)
     ├─ Path: /static/* → TG-static (S3 prefix via Lambda)
     └─ Default → TG-web (EC2 ASG)


[ NLB + EIP + 고정 IP 화이트리스트 ]

  파트너 IP 화이트리스트 → NLB EIP (AZ-a, AZ-b)
                                  ↓
                            TG (TCP 443 → EC2)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **ALB는 L7 HTTP/HTTPS, 호스트·경로·헤더 라우팅**.
2. ⭐ **NLB는 L4, 초저지연, EIP 고정 IP**.
3. ⭐ **GLB는 보안 어플라이언스 체이닝**.
4. ⭐ **ALB Cross-Zone은 기본 ON 무료** / NLB는 기본 OFF.
5. ⭐ **TLS 종료 + ACM 인증서** = ALB/NLB.

---

## 💻 실제 예시 - AWS CLI

```bash
# ALB 만들기 (Public Subnet 2개)
aws elbv2 create-load-balancer --name web-alb \
  --subnets subnet-pub-a subnet-pub-b \
  --security-groups sg-alb --type application --scheme internet-facing

# Target Group + Health Check
aws elbv2 create-target-group --name tg-web \
  --protocol HTTP --port 80 --target-type instance \
  --health-check-path /health --vpc-id vpc-aaa

# Path 기반 룰
aws elbv2 create-rule --listener-arn arn:... \
  --priority 10 \
  --conditions Field=path-pattern,Values='/api/*' \
  --actions Type=forward,TargetGroupArn=arn:tg-api
```

---

## 📝 연습 문제

**문제 1.** HTTP 호스트 기반 라우팅 + WAF 적용이 필요:

A) NLB B) ALB C) GLB D) CLB

**정답: B**.

---

**문제 2.** 게임 서버(UDP) + 초저지연 + 고정 IP 필요:

A) ALB B) NLB C) Global Accelerator만 D) CloudFront

**정답: B** — NLB가 UDP 지원하고 고정 IP. 글로벌까지 가속하려면 GA+NLB 조합.

---

**문제 3.** 3rd-party IPS 어플라이언스를 클러스터로 두고 트래픽 검사하려면:

A) ALB B) NLB C) GLB D) CLB

**정답: C**.

---

**문제 4.** ASG 인스턴스 종료 시 진행 중 요청을 끊지 않으려면:

A) Termination Protection B) Deregistration Delay (Connection Draining) C) Health Check D) Sticky Session

**정답: B**.

---

**문제 5.** ALB Cross-Zone Load Balancing에 대한 설명으로 옳은 것은?

A) 기본 비활성, 활성 시 추가 비용 B) 기본 활성, 추가 비용 없음 C) NLB와 동일 D) ALB는 cross-zone 미지원

**정답: B**.

---

## 📌 오늘의 요약

1. ALB=L7, NLB=L4(고정IP), GLB=L3(어플라이언스).
2. Cross-Zone: ALB 기본 ON, NLB 기본 OFF.
3. Sticky / TLS / WAF는 ALB의 강점.
4. NLB는 EIP + Anycast로 IP 화이트리스트에 강함.
5. GLB는 NGFW/IPS 체이닝 전용.
