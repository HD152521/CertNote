# Day 4 - 2차 실기 종합 모의: 단답·작업형 실전 훈련

리눅스마스터 1급은 **1차 필기 합격 후 2차 실기**를 봐야 최종 합격이다. 2차는 객관식이 아니라 **단답형·작업형**으로, 명령어·옵션·설정 파일 항목·시나리오 처리를 직접 써야 한다. "대충 알면 찍을 수 있는" 필기와 달리 **정확한 철자와 옵션**을 손으로 써야 하므로 체감 난도가 훨씬 높다. 오늘은 명령어 단답, 설정 파일 항목, 실무 시나리오를 혼합한 종합 모의로 실기 감각을 끌어올린다. 보기 형태로 제공하되 실제 시험에선 직접 기술해야 함을 염두에 두자.

## 작업형 핵심 1: 사용자·권한 관리 명령

실기 단골인 계정/권한 명령을 손에 익힌다.

| 작업 | 명령 |
|------|------|
| 사용자 추가 | `useradd -m -s /bin/bash 이름` |
| 비밀번호 설정 | `passwd 이름` |
| 사용자 수정 | `usermod -G 그룹 이름` |
| 사용자 삭제 | `userdel -r 이름`(홈까지) |
| 그룹 추가 | `groupadd 그룹` |
| 권한 변경 | `chmod 755 파일` |
| 소유자 변경 | `chown user:group 파일` |
| 특수권한 | `chmod u+s`(SetUID) |

> 💡 **실기 포인트**: `useradd`의 `-m`(홈 생성), `-s`(셸 지정), `-G`(보조 그룹), `-u`(UID)를 정확히. `userdel -r`의 `-r`은 홈 디렉터리·메일까지 삭제.

## 작업형 핵심 2: 파일 검색과 텍스트 처리

`find`, `grep`, `awk`, `sed`는 실기 작업형의 핵심 도구다.

| 명령 | 용도 | 예시 |
|------|------|------|
| `find` | 파일 검색 | `find / -name "*.log" -type f` |
| `grep` | 패턴 검색 | `grep -rn "error" /var/log` |
| `awk` | 필드 처리 | `awk '{print $1}' file` |
| `sed` | 스트림 편집 | `sed 's/old/new/g' file` |
| `sort`/`uniq` | 정렬·중복 | `sort file | uniq -c` |
| `wc` | 개수 세기 | `wc -l file` |

> 🔍 **find 옵션 집중**: `-name`(이름), `-type f/d`(파일/디렉터리), `-mtime +7`(7일 초과 수정), `-size +100M`(크기), `-perm`(권한), `-exec ... {} \;`(실행). 실기에서 `-exec rm {} \;` 형태가 자주 출제된다.

## 작업형 핵심 3: 디스크·마운트 시나리오

디스크 추가→파티션→포맷→마운트→fstab 등록의 흐름을 통째로 묻는다.

```
fdisk /dev/sdb        # 파티션 생성
mkfs.ext4 /dev/sdb1   # 파일시스템 생성
mkdir /data           # 마운트 포인트
mount /dev/sdb1 /data # 임시 마운트
# /etc/fstab에 영구 등록:
# /dev/sdb1  /data  ext4  defaults  0  0
```

> ⚠️ **실기 함정**: 임시 마운트(`mount`)는 재부팅 시 사라진다. **영구 마운트는 반드시 `/etc/fstab` 등록**. fstab 6필드(장치·마운트점·타입·옵션·dump·fsck순서)를 정확히 써야 감점이 없다.

## 작업형 핵심 4: 프로세스·작업 스케줄링

cron과 at, 프로세스 제어를 다룬다.

| 작업 | 명령/형식 |
|------|-----------|
| 주기 작업 등록 | `crontab -e` |
| cron 형식 | `분 시 일 월 요일 명령` |
| 일회성 예약 | `at 시간` |
| 프로세스 확인 | `ps -ef | grep 이름` |
| 강제 종료 | `kill -9 PID` |
| 이름으로 종료 | `killall 프로세스명` |

cron 필드 예: `0 3 * * 1 /backup.sh` = 매주 월요일 03:00 실행.

> 📚 **cron 필드 순서**: 분(0-59) 시(0-23) 일(1-31) 월(1-12) 요일(0-7, 0·7=일). `*`는 매번, `*/10`은 10단위, `1-5`는 범위, `1,15`는 목록.

## 작업형 핵심 5: 네트워크·서비스 설정 시나리오

서비스 설정 파일의 핵심 항목을 직접 쓰게 한다.

| 서비스 | 설정 파일 | 핵심 항목 |
|--------|-----------|-----------|
| 네트워크 | `/etc/sysconfig/network-scripts/ifcfg-*` | IPADDR, NETMASK, GATEWAY |
| DNS 클라이언트 | `/etc/resolv.conf` | nameserver |
| 호스트명 | `/etc/hostname` | 호스트명 |
| SSH | `/etc/ssh/sshd_config` | Port, PermitRootLogin |
| 방화벽 | `firewall-cmd` | --add-port, --permanent |

> 💡 **방화벽 실기**: 포트 영구 개방은 `firewall-cmd --permanent --add-port=80/tcp` 후 `firewall-cmd --reload`. `--permanent` 없이는 재부팅 시 사라진다.

## 작업형 핵심 6: 서비스 관리(systemctl)

systemd 서비스 제어 명령은 실기 필수다.

| 작업 | 명령 |
|------|------|
| 시작 | `systemctl start 서비스` |
| 중지 | `systemctl stop 서비스` |
| 재시작 | `systemctl restart 서비스` |
| 설정 재로드 | `systemctl reload 서비스` |
| 부팅 시 활성화 | `systemctl enable 서비스` |
| 상태 확인 | `systemctl status 서비스` |

> ⚠️ **enable vs start 구분**: `start`는 **지금** 시작, `enable`은 **부팅 시 자동** 시작. 둘은 별개라 둘 다 필요하면 `systemctl enable --now 서비스`.

## 작업형 핵심 7: 로그 분석 시나리오

장애 진단 시 로그를 읽고 원인을 찾는 작업도 실기에 나온다.

| 로그 | 경로 | 용도 |
|------|------|------|
| 시스템 일반 | `/var/log/messages` | 커널·서비스 일반 |
| 인증·보안 | `/var/log/secure` | 로그인·sudo 기록 |
| 부팅 | `/var/log/boot.log` | 부팅 메시지 |
| 메일 | `/var/log/maillog` | 메일 송수신 |

실시간 모니터링은 `tail -f /var/log/messages`, 특정 패턴 추출은 `grep "Failed" /var/log/secure`.

> 💡 **journalctl 실기**: systemd 환경에선 `journalctl -u 서비스명`(특정 서비스 로그), `journalctl -b`(이번 부팅), `journalctl -f`(실시간)도 자주 출제된다.

## 작업형 핵심 8: 셸 스크립트 기초

간단한 스크립트 작성·해석이 작업형으로 나올 수 있다.

| 요소 | 문법 |
|------|------|
| 셔뱅 | `#!/bin/bash` |
| 변수 | `VAR=값` (공백 금지) |
| 조건문 | `if [ 조건 ]; then ... fi` |
| 반복문 | `for i in 목록; do ... done` |
| 인자 | `$1 $2 ... $#`(개수) `$@`(전체) |

> 🔍 **테스트 연산자**: `-f`(파일 존재), `-d`(디렉터리), `-z`(빈 문자열), `-eq/-ne/-lt/-gt`(숫자 비교). `[ ]` 안 양옆 공백은 필수다.

> ⚠️ **변수 대입 함정**: `VAR = 값`처럼 `=` 양옆에 공백을 넣으면 에러. 반드시 `VAR=값`으로 붙여 쓴다. 참조는 `$VAR` 또는 `${VAR}`.

## 작업형 핵심 9: 권한 시나리오 종합

복합 권한 문제는 chmod 숫자 계산을 직접 해야 한다.

| 요구 | 숫자 | 명령 |
|------|------|------|
| 소유자 전체, 그룹·기타 읽기·실행 | 755 | `chmod 755` |
| 소유자 읽기·쓰기, 나머지 읽기 | 644 | `chmod 644` |
| SetUID + 755 | 4755 | `chmod 4755` |
| Sticky + 777 | 1777 | `chmod 1777` |

> 📚 **계산 한 줄**: rwx=7, rw-=6, r-x=5, r--=4. 특수권한은 맨 앞 4자리(SetUID 4·SetGID 2·Sticky 1)에 더한다. `/tmp`의 권한은 1777(Sticky+777).

## 작업형 핵심 10: 서비스 설정 파일 직접 작성

실기에선 설정 파일의 특정 라인을 직접 채우게 한다. 자주 나오는 단편을 손에 익힌다.

NFS 공유(`/etc/exports`):
```
/srv/share  192.168.1.0/24(rw,sync,no_subtree_check)
```

Samba 공유(`/etc/samba/smb.conf`):
```
[data]
   path = /srv/data
   writable = yes
   valid users = @staff
```

cron 등록(`crontab -e`):
```
30 2 * * * /usr/local/bin/backup.sh
```

> ⚠️ **exports 공백 함정**: `클라이언트(옵션)` 사이에 공백을 넣으면 안 된다. `192.168.1.0/24 (rw)`처럼 띄우면 모든 호스트에 rw가 열린다. 실기 감점 1순위.

## 작업형 핵심 11: 명령 조합과 파이프

작업형은 단일 명령보다 **파이프·리다이렉션 조합**을 자주 요구한다.

| 기호 | 의미 |
|------|------|
| `|` | 앞 출력 → 뒤 입력 |
| `>` | 출력 덮어쓰기 |
| `>>` | 출력 이어붙이기 |
| `2>` | 표준 에러 리다이렉트 |
| `&&` | 앞 성공 시 뒤 실행 |
| `;` | 순차 실행(성패 무관) |

예: `ps -ef | grep nginx | grep -v grep | awk '{print $2}'`(nginx PID만 추출).

> 💡 **빈출 조합**: `du -sh * | sort -rh | head`(용량 큰 순), `cat access.log | grep 404 | wc -l`(404 개수). 파이프로 필터를 이어 붙이는 사고가 실기의 핵심.

## 작업형 핵심 12: 부팅·복구 시나리오

장애 복구는 고난도 작업형이다. 핵심 상황을 정리한다.

| 상황 | 대응 |
|------|------|
| root 비밀번호 분실 | GRUB에서 `rescue`/single 모드 진입 후 `passwd` |
| fstab 오류로 부팅 실패 | 응급 모드에서 fstab 수정 |
| 서비스 시작 실패 | `systemctl status`·`journalctl -xe`로 원인 추적 |
| 디스크 꽉 참 | `du`로 큰 파일 찾아 정리, 로그 로테이트 |

> 🔍 **단일 사용자 모드**: GRUB 메뉴에서 커널 라인에 `single` 또는 `rd.break`를 추가해 진입하면 root 권한으로 복구 작업이 가능하다. 비밀번호 복구의 표준 절차.

## 마무리

2차 실기는 **정확한 명령·옵션·경로를 직접 써내는** 시험이다. 오늘 다룬 6영역(계정/권한, 텍스트 처리, 디스크/마운트, 스케줄링, 네트워크/서비스 설정, systemctl)은 작업형의 출제 축이다. 필기처럼 "고르는" 게 아니라 "쓰는" 것이므로 철자와 옵션을 손으로 반복 연습해야 한다. 아래 모의로 점검하자.

## 📝 연습 문제

**문제 1.** 사용자 'kim'을 홈 디렉터리와 함께 생성하고 로그인 셸을 bash로 지정하는 명령으로 옳은 것은?

A) `useradd kim`
B) `useradd -m -s /bin/bash kim`
C) `usermod -m kim`
D) `adduser -s kim`

**정답: B**
해설: `-m`은 홈 디렉터리 생성, `-s /bin/bash`는 로그인 셸 지정이다. 옵션 없는 `useradd kim`은 배포판에 따라 홈이 생성되지 않거나 기본 셸이 적용될 수 있다.

---

**문제 2.** `/var/log` 아래에서 "error" 문자열을 줄 번호와 함께 재귀적으로 검색하는 명령은?

A) `grep error /var/log`
B) `grep -rn "error" /var/log`
C) `find /var/log -name error`
D) `awk '/error/' /var/log`

**정답: B**
해설: `-r`은 디렉터리 재귀 검색, `-n`은 줄 번호 출력이다. `grep error /var/log`는 디렉터리라서 재귀 옵션 없이는 동작하지 않는다.

---

**문제 3.** 추가한 디스크 파티션 `/dev/sdb1`을 재부팅 후에도 `/data`에 자동 마운트되도록 등록해야 하는 파일은?

A) `/etc/mtab`
B) `/etc/fstab`
C) `/etc/exports`
D) `/proc/mounts`

**정답: B**
해설: 영구 마운트는 `/etc/fstab`에 등록한다. `mount` 명령만으로는 임시이며 재부팅 시 해제된다. `/etc/exports`는 NFS 공유 설정이다.

---

**문제 4.** 매주 월요일 오전 3시에 `/backup.sh`를 실행하는 crontab 항목으로 옳은 것은?

A) `0 3 * * 1 /backup.sh`
B) `3 0 1 * * /backup.sh`
C) `* * 1 3 0 /backup.sh`
D) `0 3 1 * * /backup.sh`

**정답: A**
해설: cron 필드는 분 시 일 월 요일 순이다. `0 3 * * 1`은 분0·시3·매일·매월·요일1(월요일)을 뜻한다. D는 매월 1일 3시를 의미해 틀리다.

---

**문제 5.** firewalld에서 80/tcp 포트를 재부팅 후에도 유지되도록 영구 개방하는 절차로 옳은 것은?

A) `firewall-cmd --add-port=80/tcp` 만 실행
B) `firewall-cmd --permanent --add-port=80/tcp` 후 `firewall-cmd --reload`
C) `iptables -A INPUT -p tcp --dport 80`
D) `systemctl restart firewalld` 만 실행

**정답: B**
해설: `--permanent`로 영구 규칙을 추가한 뒤 `--reload`로 런타임에 반영해야 한다. `--permanent` 없는 규칙은 재부팅 시 사라진다.

---

**문제 6.** httpd 서비스를 지금 시작하고 부팅 시에도 자동 실행되도록 한 번에 설정하는 명령은?

A) `systemctl start httpd`
B) `systemctl enable httpd`
C) `systemctl enable --now httpd`
D) `systemctl reload httpd`

**정답: C**
해설: `enable --now`는 즉시 시작(start)과 부팅 자동 실행(enable)을 동시에 처리한다. start만 하면 재부팅 후 꺼지고, enable만 하면 지금은 안 켜진다.

---

**문제 7.** `find`로 `/tmp` 아래에서 7일을 초과해 수정되지 않은 파일을 찾아 삭제하는 명령은?

A) `find /tmp -mtime 7 -delete`
B) `find /tmp -mtime +7 -exec rm {} \;`
C) `find /tmp -atime -7 -rm`
D) `rm -rf /tmp/*7*`

**정답: B**
해설: `-mtime +7`은 수정된 지 7일을 초과한 파일을 의미하며, `-exec rm {} \;`로 각 결과에 rm을 실행한다. `-mtime 7`(부호 없음)은 정확히 7일 전을 뜻해 의미가 다르다.

---

**문제 8.** 텍스트 파일에서 모든 "old"를 "new"로 치환해 출력하는 sed 명령은?

A) `sed 's/old/new/' file`
B) `sed 's/old/new/g' file`
C) `sed 'old/new' file`
D) `awk 's/old/new/g' file`

**정답: B**
해설: `s/old/new/g`에서 끝의 `g`(global)가 한 줄에 등장하는 모든 일치를 치환한다. `g`가 없으면 각 줄의 첫 번째 일치만 바뀐다.

---

**문제 9.** 실행 중인 프로세스 'nginx'를 이름으로 한꺼번에 종료하는 명령은?

A) `kill nginx`
B) `kill -9 nginx`
C) `killall nginx`
D) `pkill -l nginx`

**정답: C**
해설: `killall 프로세스명`은 해당 이름의 모든 프로세스에 시그널을 보낸다. `kill`은 PID를 인자로 받으므로 이름으로는 동작하지 않는다.

---

**문제 10.** 파일 `report.sh`에 SetUID 권한을 추가하는 명령으로 옳은 것은?

A) `chmod u+s report.sh`
B) `chmod o+t report.sh`
C) `chmod g+s report.sh`
D) `chown +s report.sh`

**정답: A**
해설: `u+s`는 소유자 실행 권한에 SetUID를 부여한다. `g+s`는 SetGID, `o+t`는 Sticky Bit다. SetUID/SetGID/Sticky를 정확히 구분해야 한다.

---
