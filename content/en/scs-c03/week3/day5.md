# Day 5 - Week 3 Integration: Network Isolation and Traffic Control as One

This week started from the fact that network is security''s first defense line. If IAM handles "who can do what," network decides the prior question: "who can even reach where." Can''t reach = can''t attack. Four topics covered this week — VPC design, SG/NACL, Flow Logs, private connectivity — aren''t separate topics. They''re one defense system viewed from four angles.

Today we integrate all four into one scenario for comprehensive review. Complex questions on exams almost always ask multiple layers simultaneously. The sentence "RDS exposed to Internet" contains routing, SG, NACL, and Public IP. Thinking in layered separation is passing criteria.

## Network Security Stack at a Glance

```
Request →  [Route Table]       No route = unreachable (implicit block)
           [NACL Inbound]      Subnet boundary, stateless, Deny possible, number-ordered
           [Security Group]    ENI, stateful, Allow-only, comprehensive eval
           [Resource]          Processing
           ── All flows recorded by [Flow Logs] as metadata ──
           External comms via [NAT] or [VPC Endpoint]
           [Endpoint Policy + Bucket Policy] enforce data perimeter
```

| Layer | Role | One-Line Essence |
|------|------|-----------|
| Routing | Reachability | No route = can''t go |
| NACL | Subnet-wide control | stateless, Deny possible, first-match |
| Security Group | Resource-precise control | stateful, Allow-only, SG reference possible |
| Flow Logs | Visibility | Block nothing but see (ACCEPT/REJECT) |
| Endpoint | Private connection | Remove Internet path + enforce data perimeter |

> 💡 **Related Theory**: This entire stack **is Defense in Depth implementation**. Multiple layers ensure one layer''s mistake doesn''t become immediate breach. SG opened wrong but routing blocks = unreachable. Routing open but NACL blocks = possible. All results observed via Flow Logs. Security design goal: "even if one layer breaches, entire system doesn''t collapse."

## Integration Scenario 1: RDS Exposure Incident Analysis

> **Situation**: Security scanner warns "production RDS accessible from Internet." What, in what order, to check and block?

**Reachability Analysis (in order)**:
1. **RDS PubliclyAccessible** — if enabled, gets public DNS/IP. Disable.
2. **Route Table** — does subnet have 0.0.0.0/0 → IGW route? Data Tier shouldn''t.
3. **Security Group** — inbound 3306/5432 open to 0.0.0.0/0? Narrow to App SG reference.
4. **NACL** — can further block at subnet boundary.

> 🎯 **Core**: Internet reachability requires **routing (IGW) + Public address + SG/NACL allow all**. Most fundamental block: place RDS in subnet without Internet path and disable PubliclyAccessible. Narrowing SG alone is surface-level fix. Use Reachability Analyzer to pinpoint exactly which layer opened the path.

```sql
-- Verify actual access attempts before/after with Flow Logs
SELECT srcaddr, dstport, action, count(*)
FROM vpc_flow_logs
WHERE dstport IN (3306, 5432) AND srcaddr NOT LIKE ''10.%''
GROUP BY srcaddr, dstport, action ORDER BY 4 DESC;
```

## Integration Scenario 2: Data Exfiltration Prevention Design

> **Situation**: Sensitive customer data workload. Design so even if breached, data doesn''t leak externally.

```
1. Place workload in App/Data Subnet without Internet path
2. Remove NAT → block indiscriminate egress
3. Private-connect only needed AWS services via VPC Endpoint
   (S3·DynamoDB = Gateway / KMS·SSM·Secrets = Interface)
4. S3 bucket policy with aws:SourceVpce condition → allow only via endpoint
5. Endpoint Policy with aws:PrincipalOrgID condition → only our org
6. Monitor all egress via Flow Logs (include pkt-srcaddr)
```

> 🔍 **Deeper**: This design''s brilliance is **defense after IAM compromise**. Even if attacker steals instance credentials (like Capital One), no network path exists to exfiltrate. PutObject to external bucket fails — NAT doesn''t exist; our bucket only allows SourceVpce condition via that endpoint. Breaks the "stolen credential = immediate data exfiltration" equation. This is the defense-in-depth IAM and network isolation build together.

> 📚 **Case**: Reviewing Capital One through this lens — SSRF stole metadata credentials (same), but if S3 required VPC Endpoint + SourceVpce only and no egress NAT existed, extracting data externally with stolen creds was much harder. Network isolation operates as a "final layer."

## Confusing Comparisons Clarified

| Confusing Pair | Core Distinction |
|-------------|-----------|
| SG vs NACL | stateful/stateless, Allow-only/Deny possible, ENI/subnet |
| Gateway vs Interface EP | S3·DynamoDB free routing / rest ENI pay |
| IGW vs NAT | bidirectional / outbound-only |
| NAT vs VPC Endpoint | indiscriminate egress / specific service private |
| Peering vs PrivateLink | full CIDR exposed / single service exposed |
| srcaddr vs pkt-srcaddr | NAT IP / actual source before NAT |
| ACCEPT vs REJECT (Flow Logs) | success flow / blocked flow (recon signal) |

> ⚠️ **Pitfall Collection**:
> - NACL inbound opened but ephemeral port outbound not = no response (stateless).
> - Can''t block specific IP with SG (no Deny) → use NACL Deny.
> - Same-subnet internal comms don''t apply NACL → isolate via SG only.
> - Gateway Endpoint unreachable from on-premises (VPC-only).
> - Endpoint/bucket/IAM policies AND-combined → one deny = deny overall.
> - IGW path in Main Route Table = unconnected subnets unintentionally Public.

## Troubleshooting Decision Tree

```
Connection Failed?
 ├─ timeout (no response at all)
 │    → Routing path? → SG inbound? → NACL? → Reachability Analyzer
 ├─ Request goes but no response
 │    → NACL outbound ephemeral ports (1024-65535) check (stateless)
 ├─ Specific IP won''t block
 │    → If tried SG = impossible, switch to NACL Deny
 ├─ Built endpoint but traffic to Internet
 │    → Private DNS + VPC DNS properties check
 └─ AccessDenied (network works)
      → Endpoint Policy / bucket policy SourceVpce condition check
```

> 🎯 **Scenario**: "On-premises via DX to S3, getting timeout not AccessDenied." — timeout is network reach failure. If S3 **Gateway** Endpoint created, on-premises can''t reach (VPC-only). Switch to **Interface** Endpoint, configure Route 53 Resolver so on-premises resolver resolves S3 domain to endpoint private IP. AccessDenied means policy problem; timeout means connection layer (endpoint type, DNS, routing). **Using error type to narrow layers is key**.

## Week 3 One-Paragraph Summary

Network security is controlling reachability. **Routing** is invisible blocking where no route = can''t go; **NACL** (stateless, Deny possible, subnet-level) and **security group** (stateful, Allow-only, ENI-level) form two firewall layers. Flowed traffic is recorded by **Flow Logs** as metadata, so breaches (REJECT spike = recon, unexpected large egress = exfil) are read afterward. External comms narrowed via **VPC Endpoint** instead of indiscriminate NAT, and **endpoint/bucket policy SourceVpce and PrincipalOrgID conditions** build data perimeter so stolen credentials don''t exfiltrate data. All layers together achieve defense-in-depth.

## Wrapping Up

Week 3 covered "blocking (control)," "seeing (visibility)," and "removing the path itself (private connectivity)." When facing complex questions, always decompose by layers — routing, SG, NACL, policy? Error timeout means connection layer; AccessDenied means policy layer.

Next Week 4 examines the second pillar of infrastructure security — edge protection and traffic inspection (WAF, Shield, Network Firewall, CloudFront). Up to today was isolation "inside" VPC; next is active defense at VPC "boundary" inspecting and filtering threats.

---

## 📝 연습 문제

**문제 1.** 프로덕션 RDS가 인터넷에서 접근 가능하다는 경고를 받았다. 가장 근본적인(표면적이 아닌) 차단 조치는?

A) 보안 그룹 인바운드의 0.0.0.0/0을 특정 IP로만 좁힌다  
B) RDS를 인터넷 경로가 없는 서브넷에 두고 PubliclyAccessible을 끈다  
C) NACL 아웃바운드 임시 포트를 차단한다  
D) RDS의 자동 백업을 비활성화한다  

**정답: B**  
해설: 인터넷 도달은 라우팅 경로와 퍼블릭 주소, 그리고 통제 허용이 모두 충족돼야 성립한다. 인터넷 경로가 없는 서브넷에 두고 퍼블릭 접근 설정을 끄면 경로와 주소 자체가 사라져 가장 근본적으로 차단된다. 보안 그룹만 좁히는 것은 다른 계층이 다시 열리면 무력화될 수 있는 표면적 처방이다.

---

**문제 2.** 침해된 인스턴스가 탈취한 자격증명으로 회사 S3 데이터를 외부 공격자 버킷으로 빼내려는 시나리오를 네트워크 설계로 막으려고 한다. 가장 효과적인 조합은?

A) NAT Gateway를 두되 보안 그룹 아웃바운드를 443만 허용한다  
B) NAT를 제거하고 필요한 AWS 서비스만 VPC Endpoint로 연결하며 버킷 정책에 SourceVpce 조건을 건다  
C) IAM 정책에서 S3 권한을 모두 제거한다  
D) CloudTrail 로깅을 강화한다  

**정답: B**  
해설: NAT를 제거하면 무분별한 아웃바운드 경로가 사라져 외부 버킷으로의 전송 자체가 막히고, 필요한 서비스만 엔드포인트로 연결한 뒤 버킷 정책에 엔드포인트 경유 조건을 걸면 회사 버킷은 그 경로로만 접근된다. 자격증명을 탈취해도 데이터가 빠져나갈 네트워크 경로가 없어진다. 로깅 강화는 탐지일 뿐 차단이 아니다.

---

**문제 3.** 연결 트러블슈팅 중 "요청은 나가는데 응답이 돌아오지 않는" 증상이 발생했다. 어느 계층을 가장 먼저 의심해야 하는가?

A) 보안 그룹 인바운드 규칙  
B) 라우팅 테이블의 로컬 경로  
C) NACL 아웃바운드의 임시 포트 허용 여부  
D) 엔드포인트 정책의 Resource 범위  

**정답: C**  
해설: 요청은 나가지만 응답만 안 오는 증상은 비저장 방식인 NACL이 응답 트래픽을 막는 전형적 패턴이다. NACL은 상태를 추적하지 않으므로 응답이 나가는 임시 포트 범위를 아웃바운드에 명시 허용해야 한다. 상태를 추적하는 보안 그룹은 응답을 자동 허용하므로 이 증상의 원인이 아니다.

---

**문제 4.** 온프레미스에서 Direct Connect로 S3에 접근하려는데 AccessDenied가 아니라 timeout이 발생한다. 가장 가능성 높은 원인은?

A) 버킷 정책의 SourceVpce 조건이 잘못 설정됨  
B) S3 Gateway Endpoint를 사용 중이라 온프레미스에서 도달할 수 없음  
C) IAM 정책에 s3:GetObject 권한이 없음  
D) KMS 키 정책이 복호화를 거부함  

**정답: B**  
해설: timeout은 정책 거부가 아니라 네트워크 도달 실패를 의미한다. Gateway Endpoint는 라우팅 기반이라 VPC 내부 전용이므로 온프레미스에서 직접 닿을 수 없다. 온프레미스 사설 접근에는 Interface Endpoint와 도메인을 사설 IP로 해석하는 DNS 구성이 필요하다. 정책 문제였다면 timeout이 아니라 AccessDenied가 발생한다.

---

**문제 5.** 다음 중 보안 그룹과 NACL의 차이를 올바르게 설명한 것을 모두 고른 조합은?

(가) 보안 그룹은 상태를 추적하고 NACL은 추적하지 않는다
(나) NACL은 명시적 Deny가 가능하지만 보안 그룹은 Allow만 가능하다
(다) 같은 서브넷 내부 통신에는 NACL이 적용되지 않는다
(라) 보안 그룹은 규칙 번호 순서로 첫 매치에서 평가를 종료한다

A) 가, 나, 다  
B) 가, 나, 라  
C) 나, 다, 라  
D) 가, 다, 라  

**정답: A**  
해설: 보안 그룹은 상태를 추적해 응답을 자동 허용하고 허용 규칙만 지원하며, NACL은 비저장 방식에 거부 규칙도 지원한다. 또 NACL은 서브넷 경계 트래픽만 검사하므로 같은 서브넷 내부 통신에는 적용되지 않는다. 규칙 번호 순서로 첫 매치에서 종료하는 것은 NACL의 평가 방식이며 보안 그룹은 모든 규칙을 종합 평가하므로 (라)는 틀렸다.

---

**문제 6.** Flow Logs 분석에서 "한 내부 호스트가 짧은 시간에 100개 이상의 서로 다른 외부 목적지와 통신"하는 패턴이 보였다. 가장 의심되는 활동과, 침해 호스트를 정확히 특정하기 위해 필요한 필드의 조합은?

A) 데이터 유출 의심 / srcaddr 필드  
B) C2 비콘 또는 횡적 이동 의심 / pkt-srcaddr 필드  
C) 정상 헬스 체크 / az-id 필드  
D) DDoS 공격 의심 / dstport 필드  

**정답: B**  
해설: 한 호스트가 다수의 서로 다른 목적지와 통신하는 패턴은 명령제어 비콘이나 내부 횡적 이동의 징후다. 그리고 NAT를 거치면 일반 출발지 주소 필드에 NAT 주소가 찍히므로, NAT 변환 이전의 실제 송신 호스트를 식별하려면 패킷 원본 출발지 주소 필드가 필요하다. 이 필드가 침해 호스트 특정의 열쇠다.

---
