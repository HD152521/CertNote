# Day 5 - 네트워크·서비스 작업형 모의 + 오답노트

## 📌 핵심 정리

- 이번 주 축은 **네트워크·서비스 작업형** — 주소 설정(Day 1), 서비스 설정 지시어(Day 2), 셸 스크립트(Day 3), 보안(Day 4).
- 오늘은 한 주를 **12문항 모의고사**로 압축해 점검한다. 해설은 왜 다른 보기가 함정인지까지 짚는 오답노트다.
- 작업형은 **한 글자(옵션·지시어·방향)가 합격을 가른다**. 부분 점수가 박한 영역이다.
- 보기 4개 중 3개는 방향·옵션·철자 중 하나가 틀린 함정이므로, **틀린 곳을 찾아 지우는 소거법**이 빠르다.
- 문제를 읽으면 ① 어느 영역인가 ② **임시인가 영구인가** ③ 어느 파일·명령인가를 순서대로 떠올린다.

## 이번 주 핵심 한눈에 복습

- **네트워크 설정** : 임시(`ip addr add`/`ip route add`)와 영구(`ifcfg-*`의 `BOOTPROTO`/`ONBOOT=yes`/`IPADDR`, `nmcli con`)를 가른다.
- nmcli는 수정 후 `con up`으로 재활성화해야 반영된다.
- 진단 사다리는 `ip a → ping gw → ping 8.8.8.8 → dig`. 포트 확인은 `ss -tuln`.
- **서비스 설정 파일** : httpd `DocumentRoot`/`Listen`, named `type master` + SOA `Serial` + 레코드(A/MX/CNAME/PTR).
- dhcpd `range`/`fixed-address`, vsftpd `anonymous_enable`/`chroot_local_user`, smb.conf `path`/`writable`.
- exports는 괄호 앞 공백 금지와 `root_squash`, sshd는 `PermitRootLogin no`.
- **셸 스크립트** : 대입 `=` 공백 금지, `if [ -gt/-eq/-f/-d ]`의 대괄호 안 공백, `for/while/case`(done/done/esac).
- 함수는 괄호 없이 호출하고, `$(...)`·`$?`·`while read ... done < file`·`sort|uniq -c|sort -rn`을 패턴으로 외운다.
- **보안** : iptables 방향(INPUT/OUTPUT/FORWARD)·`-A/-I/-P/-j`·ACCEPT/DROP/REJECT·`service iptables save`.
- firewalld는 `--permanent` 후 `--reload`, SELinux는 모드와 `chcon`/`restorecon`.
- rsyslog는 `facility.priority`(`.none`/`.=`), logrotate는 `rotate N`/`compress`.

> 💡 **합격 신호**: 작업형은 "이 기능을 하는 정확한 명령/지시어"를 묻는다. 방향·옵션·철자가 정확하면 맞고, 하나라도 틀리면 0점인 영역이다.

> 🔍 **풀이 전략**: 문제를 읽으면 ① 어느 영역인가(네트워크/서비스/스크립트/보안) ② 임시인가 영구인가 ③ 어느 파일·명령인가를 순서대로 떠올린다. 보기 4개 중 3개는 방향·옵션·철자 중 하나가 틀린 함정이므로, 정답을 고르기보다 **틀린 곳을 찾아 지우는** 소거법이 빠르다.

## 📖 용어

- **임시 설정 / 영구 설정** : 재부팅하면 사라지는 설정(`ip`) / 파일에 남아 유지되는 설정(`ifcfg-*`, `nmcli con`).
- **ONBOOT** : `ifcfg-*`에서 부팅 시 인터페이스를 자동으로 올릴지 정하는 지시어. `yes`가 아니면 안 올라온다.
- **진단 사다리** : IP → 게이트웨이 → 외부 IP → 도메인 순으로 끊어 보며 어디서 막히는지 좁히는 방법.
- **SOA Serial** : 존 데이터의 판번호. 올려야 보조(slave) 서버가 변경을 가져간다.
- **exports 공백 함정** : 클라이언트와 괄호 사이에 공백이 있으면 모든 호스트에 옵션이 열리는 NFS 문법 함정.
- **PermitRootLogin** : SSH로 root가 직접 로그인할 수 있는지 정하는 지시어. 차단은 `no`.
- **`done < 파일`** : `while read`가 파일을 한 줄씩 읽도록 입력을 붙이는 리다이렉션. 위치가 `done` 뒤다.
- **`--permanent` + `--reload`** : firewalld에서 영구 저장 후 현재 세션에 반영하는 두 단계. 하나만 하면 반쪽이다.
- **SELinux 컨텍스트** : 파일·프로세스에 붙는 라벨. 권한은 맞는데 접근이 막히면 여기를 의심한다.
- **facility.priority** : rsyslog가 로그를 나누는 "출처.심각도" 짝. `.none`은 제외, `.=`는 그 수준만, 기본은 그 수준 이상.

## 📝 연습 문제

**문제 1.** eth0에 192.168.0.50/24 주소를 임시로 부여하고 기본 게이트웨이를 192.168.0.1로 설정하는 명령 조합으로 옳은 것은?

A) ip addr add 192.168.0.50/24 dev eth0; ip route add default via 192.168.0.1
B) ip addr set 192.168.0.50 eth0; route default 192.168.0.1
C) ip link add 192.168.0.50/24 eth0; ip route default 192.168.0.1
D) ifconfig eth0 192.168.0.50; ip route add 192.168.0.1 default

**정답: A**

해설: 주소는 `ip addr add 주소/프리픽스 dev 인터페이스`, 기본 경로는 `ip route add default via 게이트웨이`가 정확한 문법이다. B의 `set`은 ip addr 동작이 아니고, C의 `ip link`는 인터페이스 자체용이며, D는 게이트웨이와 default 순서가 뒤바뀌었다.

---

**문제 2.** `ifcfg-eth0` 파일에서 정적 IP를 쓰면서 재부팅 후에도 인터페이스가 자동 활성화되도록 하는 지시어 조합은?

A) BOOTPROTO=dhcp, ONBOOT=no
B) BOOTPROTO=static, ONBOOT=yes
C) BOOTPROTO=auto, ONBOOT=yes
D) BOOTPROTO=static, ONBOOT=no

**정답: B**

해설: 정적 IP는 `BOOTPROTO=static`(또는 none), 부팅 시 자동 활성화는 `ONBOOT=yes`다. A는 DHCP에 자동활성화도 꺼져 있고, C의 `auto`는 nmcli 값이지 ifcfg의 BOOTPROTO 값이 아니며, D는 `ONBOOT=no`라 재부팅 후 인터페이스가 안 올라온다.

---

**문제 3.** `ping 8.8.8.8`은 성공하지만 `ping www.example.com`은 실패한다. 점검해야 할 파일은?

A) /etc/hosts.allow
B) /etc/resolv.conf
C) /etc/sysconfig/iptables
D) /etc/exports

**정답: B**

해설: IP 도달은 정상이고 도메인만 실패하므로 이름 해석(DNS) 문제다. 네임서버는 `/etc/resolv.conf`의 `nameserver` 항목에 정의되니 이를 점검한다. `hosts.allow`는 TCP Wrapper 접근제어, `iptables`는 방화벽, `exports`는 NFS 공유 설정으로 이름 해석과 무관하다.

---

**문제 4.** BIND 존 파일을 수정한 뒤 보조(slave) 서버에 변경을 전파하려면 반드시 해야 하는 작업은?

A) Refresh 값을 0으로 낮춘다
B) SOA의 Serial 값을 증가시킨다
C) Expire 값을 증가시킨다
D) TTL을 0으로 설정한다

**정답: B**

해설: slave는 master의 SOA `Serial`을 비교해 자신보다 크면 존 전송을 받는다. 따라서 수정 후 Serial을 반드시 증가시켜야 변경이 전파된다. Refresh/Expire/TTL은 갱신 주기·만료·캐시 시간으로, 값을 조정해도 변경 감지를 직접 유발하지 않는다.

---

**문제 5.** 다음 `/etc/exports` 항목 중 의도와 달리 모든 호스트에 rw가 열리는 잘못된 설정은?

A) /data 192.168.1.0/24(rw,sync)
B) /data 192.168.1.0/24 (rw,sync)
C) /data 192.168.1.10(ro)
D) /data *(ro)

**정답: B**

해설: 클라이언트와 괄호 사이에 공백이 있으면 NFS는 "192.168.1.0/24에 기본 옵션"과 "모든 호스트(*)에 rw,sync" 두 항목으로 해석해 전체에 쓰기가 열린다. A·C·D는 공백 없이 올바르게 작성됐다(D는 의도적으로 전체에 ro).

---

**문제 6.** SSH 서버에서 root의 직접 원격 로그인을 차단하는 `sshd_config` 설정으로 옳은 것은?

A) PermitRootLogin yes
B) PermitRootLogin no
C) PasswordAuthentication no
D) PermitEmptyPasswords no

**정답: B**

해설: `PermitRootLogin no`가 root의 직접 SSH 로그인을 차단한다. `yes`는 허용이고, `PasswordAuthentication no`는 암호 인증 자체를 끄는 것(키 인증 강제), `PermitEmptyPasswords no`는 빈 암호 차단으로 root 로그인 차단과는 다른 목적이다.

---

**문제 7.** 다음 셸 스크립트 조각에서 문법 오류가 있는 줄은?

A) name="linux"
B) if [ "$count" -gt 5 ]; then
C) for i in 1 2 3; do
D) total = $((a + b))

**정답: D**

해설: 변수 대입의 `=` 양옆에는 공백이 없어야 하므로 `total=$((a + b))`로 써야 한다. D는 `total = ...`처럼 공백이 있어 `total`을 명령으로 해석해 오류가 난다. A는 올바른 대입, B는 올바른 if(대괄호 안 공백 정상), C는 올바른 for다.

---

**문제 8.** 파일 `users.txt`를 한 줄씩 읽어 사용자 계정을 만드는 스크립트의 빈칸으로 옳은 것은?
`while read u; do useradd "$u"; done ____ users.txt`

A) > users.txt
B) < users.txt
C) | users.txt
D) >> users.txt

**정답: B**

해설: `done < 파일`로 입력 리다이렉션해야 파일이 `read`로 한 줄씩 공급된다. `>`/`>>`는 출력(덮어쓰기/추가)으로 오히려 파일을 비우거나 망가뜨리고, `|`는 파이프로 파일명을 바로 받지 못한다. 파일 읽기 관용구는 `while read ... done < file`.

---

**문제 9.** 외부에서 들어오는 443번 포트(HTTPS) TCP 접속만 허용하는 iptables 명령으로 옳은 것은?

A) iptables -A OUTPUT -p tcp --sport 443 -j ACCEPT
B) iptables -A INPUT -p tcp --dport 443 -j ACCEPT
C) iptables -A FORWARD -p udp --dport 443 -j DROP
D) iptables -P INPUT -p tcp --dport 443 -j ACCEPT

**정답: B**

해설: 서버로 들어오는 접속이므로 `INPUT`, TCP, 목적지 포트 `--dport 443`, `-j ACCEPT`다. A는 OUTPUT/sport로 방향이 틀리고, C는 FORWARD/udp/DROP으로 잘못됐으며, D는 정책(-P)에 포트 조건을 잘못 결합했다(정책은 단일 기본 동작만 지정).

---

**문제 10.** firewalld에서 8080/tcp 포트를 재부팅 후에도 유지되게 허용하고 즉시 반영하려면?

A) firewall-cmd --add-port=8080/tcp 만 실행
B) firewall-cmd --permanent --add-port=8080/tcp 후 firewall-cmd --reload
C) firewall-cmd --permanent --add-port=8080/tcp 만 실행
D) firewall-cmd --add-service=8080 --reload

**정답: B**

해설: `--permanent`로 영구 저장 후 `--reload`로 현재 세션에 반영해야 "영구 + 즉시"가 된다. A는 재부팅 시 사라지고, C는 지금 적용되지 않으며, D는 포트를 서비스명처럼 잘못 지정했다(포트는 `--add-port=8080/tcp` 형식).

---

**문제 11.** "파일 권한(rwx)은 올바른데 웹 서버가 특정 디렉터리에 접근하지 못한다. `setenforce 0` 후 접근이 된다." 가장 적절한 영구 조치는?

A) SELinux를 Disabled로 영구 비활성화한다
B) restorecon 또는 semanage fcontext로 올바른 컨텍스트를 적용한다
C) chmod 777로 권한을 모두 연다
D) 방화벽에서 80번 포트를 막는다

**정답: B**

해설: `setenforce 0`(Permissive)으로 해결되면 SELinux 컨텍스트 문제다. 운영에서는 SELinux를 끄지 말고 `restorecon`(기본 컨텍스트 복원)이나 `semanage fcontext` 등록으로 올바른 type을 적용하는 것이 정석이다. A는 보안을 포기하는 우회, C는 권한 문제도 아닌데 위험하게 여는 것, D는 무관하다.

---

**문제 12.** logrotate 설정 `daily`, `rotate 7`, `compress`의 동작 설명으로 옳은 것은?

A) 매주 순환하며 7개를 보관한다
B) 매일 순환하며 최근 7개(약 1주일치)를 압축 보관하고 초과분은 삭제한다
C) 로그가 7MB를 넘으면 순환한다
D) 7일마다 한 번 순환하되 압축은 하지 않는다

**정답: B**

해설: `daily`는 매일 순환, `rotate 7`은 최근 7세대를 보관(초과 시 가장 오래된 것 삭제), `compress`는 순환된 로그를 gzip 압축한다. 따라서 약 1주일치가 압축 보관된다. 크기 기준 순환은 `size`이고, daily는 7일에 한 번이 아니라 매일 순환이다.

---

## 틀리기 쉬운 함정 총정리

모의고사에서 자주 걸리는 함정을 한 표로 모았다. 시험 직전 이 표만 다시 봐도 좋다.

| 함정 | 정답 / 주의 |
|------|------------|
| `ip addr` vs `ip route` | 주소는 addr add, 경로는 route add default via |
| 임시 vs 영구 | ip=휘발, ifcfg `ONBOOT=yes`/nmcli con=영구 |
| nmcli 적용 | modify 후 `con up`해야 반영 |
| ping IP 성공·도메인 실패 | DNS(`/etc/resolv.conf`) 문제 |
| SOA Serial | 존 수정 시 반드시 증가 |
| exports 공백 | `클라이언트(옵션)` 사이 공백 금지 |
| 변수 대입 | `=` 양옆 공백 금지 |
| if 조건 | `[ ` 와 ` ]` 안 공백 필수, 숫자 `-gt`/문자열 `=` |
| 파일 읽기 | `while read ... done < file` |
| iptables 방향 | 들어옴 INPUT, 나감 OUTPUT |
| iptables 정책 변경 | 원격이면 SSH 먼저 허용 |
| firewalld 적용 | `--permanent` 후 `--reload` |
| SELinux 접근불가 | 컨텍스트 의심 → `restorecon` |
| rsyslog | `.none`=제외, `.=`=정확히, `.수준`=이상 |
| logrotate | `rotate N`=세대수, 주기는 daily/weekly |

> ⚠️ **시험장 멘탈**: 작업형은 부분 점수가 박하다. 방향(INPUT/OUTPUT) 하나, 공백 하나, `--reload` 누락 하나로 통째로 틀린다. 명령을 쓴 뒤 "이걸 실행하면 정확히 무슨 일이 일어나는가"를 머릿속으로 한 번 실행해 검산하자.

## 마무리

12문항으로 한 주를 압축했다. 네트워크 작업형의 핵심은 **임시/영구의 구분**(`ip`는 휘발, `ifcfg ONBOOT=yes`/`nmcli con`은 영구)과 **계층별 진단**(IP는 되나 도메인 실패 = DNS)이다. 서비스 설정은 **지시어의 1:1 매핑**(DocumentRoot, SOA Serial, range, PermitRootLogin no, exports 공백 함정)을 정확한 철자로 외우는 싸움이다. 스크립트는 **문법의 엄밀함**(`=` 공백 금지, 대괄호 안 공백, `done < file`)이 생명이고, 보안은 **방향·옵션·`--reload`·컨텍스트**가 합격을 가른다. 틀린 문제는 보기마다 "무엇이 왜 틀렸는지"를 말로 설명할 수 있을 때까지 다시 보자. 작업형은 아는 것을 정확히 쓰는 시험이다.
