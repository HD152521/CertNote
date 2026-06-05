# Day 3 - 시스템 초기화: init·런레벨에서 systemd·target까지

PID 1번 프로세스는 시스템 전체의 시작점이자 모든 프로세스의 조상이다. 어제 우리는 그 1번이 고아를 입양한다는 것을 배웠다. 오늘은 그 1번이 부팅 직후 **무슨 순서로 시스템을 깨우는지**, 그 초기화(initialization) 체계를 다룬다.

리눅스 부팅 관리에는 두 세대가 있다. 전통적인 **SysV init**(런레벨 기반)과, 현대 대부분의 배포판이 채택한 **systemd**(target·unit 기반)다. 리눅스마스터 1급은 두 체계를 모두 묻는다 — 특히 옛 **런레벨 숫자**와 새 **target**이 어떻게 대응되는지, 그리고 `systemctl`·`journalctl`·unit 파일의 사용법이 핵심이다.

## SysV init과 런레벨

전통적 부팅에서는 PID 1번 `init`이 `/etc/inittab` 파일을 읽어 시스템을 어느 **런레벨(runlevel)**로 띄울지 결정했다. 런레벨은 "시스템이 제공하는 서비스의 묶음 상태"를 숫자 0~6으로 나눈 것이다.

| 런레벨 | 의미 | 설명 |
|--------|------|------|
| 0 | Halt(종료) | 시스템 전원 끔 |
| 1 (S, single) | 단일 사용자 모드 | 복구·점검용, root만, 네트워크 없음 |
| 2 | 다중 사용자(NFS 없음) | 네트워크 일부 |
| 3 | 다중 사용자 + 네트워크 | **텍스트(CLI) 환경** — 서버 표준 |
| 4 | 미사용(사용자 정의) | 예약됨 |
| 5 | 다중 사용자 + 네트워크 + GUI | **그래픽(X11) 환경** |
| 6 | Reboot(재부팅) | 시스템 재시작 |

```bash
runlevel             # 현재 런레벨 확인 (예: N 3 → 이전 N, 현재 3)
who -r               # 런레벨과 전환 시각 확인
init 3               # 런레벨 3(텍스트)으로 전환
init 0               # 시스템 종료 (init 6 = 재부팅)
telinit 5            # init과 동일하게 런레벨 전환
```

> ⚠️ **함정**: 런레벨 **0과 6을 부팅 기본값으로 지정하면 절대 안 된다**. 0(종료)이나 6(재부팅)을 기본 런레벨로 두면 시스템이 켜지자마자 꺼지거나 무한 재부팅에 빠진다. 기본값은 보통 텍스트 서버는 3, GUI 데스크톱은 5다. 그리고 1번 = 단일 사용자(복구) 모드라는 점도 자주 출제된다.

> 💡 **개념**: 런레벨 3과 5의 차이는 딱 하나, **GUI(X 윈도)의 유무**다. 3은 텍스트 콘솔, 5는 그래픽 로그인 화면까지 띄운다. 서버는 자원을 아끼려 3을, 데스크톱은 5를 기본으로 쓴다. 런레벨별 스크립트는 `/etc/rc.d/rc{0~6}.d/`에 S(시작)·K(종료) 접두사로 들어 있었다.

## systemd의 등장과 target

systemd는 init의 한계(순차적 느린 부팅, 의존성 관리 부족)를 극복하려 등장했다. 서비스를 **병렬로** 띄우고, 의존성을 명시적으로 관리하며, 모든 것을 **unit**이라는 단위로 통일했다. 현대의 RHEL 7+, CentOS 7+, Ubuntu 16.04+, Fedora 등이 모두 systemd를 쓴다.

systemd에서는 런레벨 대신 **target**을 쓴다. 옛 런레벨과의 대응을 외워야 한다.

| 런레벨 | systemd target | 의미 |
|--------|----------------|------|
| 0 | poweroff.target | 종료 |
| 1 | rescue.target | 단일 사용자(복구) |
| 2 | multi-user.target | 다중 사용자(텍스트) |
| 3 | multi-user.target | 다중 사용자 + 네트워크(텍스트) |
| 4 | multi-user.target | (사용자 정의) |
| 5 | graphical.target | 그래픽(GUI) |
| 6 | reboot.target | 재부팅 |

```bash
systemctl get-default                      # 현재 기본 target 확인
systemctl set-default multi-user.target    # 기본을 텍스트 모드로
systemctl set-default graphical.target     # 기본을 GUI 모드로
systemctl isolate multi-user.target        # 즉시 텍스트 target으로 전환(init 3 격)
systemctl rescue                           # 단일 사용자(복구) 모드로
systemctl reboot                           # 재부팅
systemctl poweroff                         # 종료
```

> 💡 **개념**: 런레벨 2·3·4가 모두 **multi-user.target 하나**로 합쳐진 점이 핵심이다(텍스트 다중 사용자). GUI는 graphical.target(옛 5). 따라서 "GUI에서 텍스트로 바꿔라"는 `systemctl set-default multi-user.target`이고, "즉시 전환"은 `systemctl isolate`(옛 init N 역할)다. `set-default`는 다음 부팅부터, `isolate`는 지금 당장이다.

> 📚 **유래/사례**: systemd는 2010년 레드햇의 Lennart Poettering이 발표했다. init의 셸 스크립트 기반 순차 부팅은 서비스가 늘수록 느려졌는데, systemd는 소켓·D-Bus를 미리 만들어 두고 서비스를 동시에 띄워 부팅 시간을 크게 줄였다. 도입 당시 "유닉스 철학을 깬다"는 논쟁이 컸지만, 현재는 사실상 표준이 되었다.

## systemctl — 서비스 제어의 만능 도구

systemd 환경에서 서비스(데몬)를 다루는 단일 명령이 `systemctl`이다. 옛 `service`·`chkconfig`를 모두 대체한다.

| 명령 | 동작 | 옛 SysV 대응 |
|------|------|-------------|
| `systemctl start 서비스` | 지금 즉시 시작 | `service X start` |
| `systemctl stop 서비스` | 지금 즉시 중지 | `service X stop` |
| `systemctl restart 서비스` | 재시작 | `service X restart` |
| `systemctl reload 서비스` | 설정만 다시 읽기(무중단) | `service X reload` |
| `systemctl status 서비스` | 상태·최근 로그 확인 | `service X status` |
| `systemctl enable 서비스` | **부팅 시 자동 시작** 등록 | `chkconfig X on` |
| `systemctl disable 서비스` | 부팅 시 자동 시작 해제 | `chkconfig X off` |
| `systemctl is-enabled 서비스` | 자동 시작 여부 확인 | — |
| `systemctl list-units` | 활성 unit 목록 | — |

```bash
systemctl start sshd          # SSH 데몬 즉시 시작
systemctl enable sshd         # 부팅 때마다 자동 시작 등록
systemctl enable --now sshd   # 등록 + 즉시 시작 한 번에
systemctl status sshd         # 상태(active/inactive)와 로그 일부
systemctl is-active sshd      # 동작 중이면 active 출력
```

> ⚠️ **함정**: **`start`와 `enable`은 다르다.** `start`는 "지금 한 번 켠다"(재부팅하면 다시 꺼질 수 있음), `enable`은 "부팅할 때마다 자동으로 켠다"(지금 당장 켜지는 건 아님)이다. 둘 다 하려면 `systemctl enable --now`를 쓴다. 시험에서 이 둘을 바꿔 묻는 함정이 단골이다.

> 🔍 **직접 쳐보기**: `systemctl status sshd`(또는 crond)를 실행해 `Active:` 줄과 `Loaded:` 줄을 보자. `Active: active (running)`이면 실행 중, 괄호 안 `enabled`/`disabled`가 부팅 자동 시작 여부다. 실행 여부(active)와 자동 시작 여부(enabled)가 별개 정보임을 한 화면에서 확인할 수 있다.

## unit 파일 — 서비스의 설계도

systemd가 관리하는 모든 대상은 **unit**이다. unit에는 여러 종류가 있고, 파일 확장자로 구분된다.

| unit 종류 | 확장자 | 대상 |
|-----------|--------|------|
| service | `.service` | 데몬/서비스 |
| target | `.target` | 런레벨 같은 상태 묶음 |
| socket | `.socket` | 소켓 기반 활성화 |
| mount | `.mount` | 파일시스템 마운트 |
| timer | `.timer` | 예약 실행(cron 대체) |
| device | `.device` | 장치 |

unit 파일은 두 곳에 있다. 패키지가 제공하는 원본은 `/usr/lib/systemd/system/`(또는 `/lib/systemd/system/`)에, 관리자가 수정·추가한 것은 `/etc/systemd/system/`에 둔다. **`/etc`의 것이 `/usr/lib`의 것보다 우선**한다.

서비스 unit 파일의 기본 구조는 세 섹션으로 이루어진다.

```ini
[Unit]
Description=My Web Service
After=network.target          # network.target 이후에 시작

[Service]
ExecStart=/usr/bin/myapp      # 시작 명령
Restart=on-failure            # 실패 시 자동 재시작
User=myuser

[Install]
WantedBy=multi-user.target    # enable 시 어느 target에 연결할지
```

unit 파일을 새로 만들거나 고친 뒤에는 systemd가 변경을 인식하도록 다시 읽혀야 한다.

```bash
systemctl daemon-reload       # unit 파일 변경 후 반드시 실행
systemctl start myapp         # 새 서비스 시작
systemctl enable myapp        # WantedBy의 target에 자동 시작 등록
```

> 💡 **개념**: `[Install]`의 `WantedBy=multi-user.target`이 `enable` 시 동작의 핵심이다. enable하면 이 target의 `.wants/` 디렉터리에 심볼릭 링크가 생겨, 부팅 때 해당 target에 도달하면 자동 시작된다. `[Unit]`의 `After=`/`Before=`는 시작 순서를, `Requires=`/`Wants=`는 의존성을 정의한다.

> ⚠️ **함정**: unit 파일을 수정한 뒤 `systemctl daemon-reload`를 빼먹으면 변경이 반영되지 않는다. systemd는 unit 파일을 메모리에 캐시하기 때문에, 디스크의 파일을 고쳐도 daemon-reload 전까지는 옛 내용으로 동작한다. "unit 수정 → daemon-reload → restart" 순서를 한 세트로 외운다.

## journalctl — systemd의 통합 로그

systemd는 모든 서비스의 로그를 **journal**이라는 바이너리 형식으로 모아 관리한다. 이것을 조회하는 도구가 `journalctl`이다. 옛날의 `/var/log/messages` 텍스트 로그를 보완(또는 대체)한다.

```bash
journalctl                    # 전체 로그(오래된 것부터)
journalctl -u sshd            # sshd 서비스의 로그만
journalctl -f                 # 실시간 로그 추적(tail -f 같음)
journalctl -b                 # 이번 부팅 이후 로그만
journalctl --since "1 hour ago"   # 최근 1시간 로그
journalctl -p err             # 에러(우선순위 err 이상)만
journalctl -k                 # 커널 메시지(dmesg 격)
```

| 옵션 | 의미 |
|------|------|
| `-u 서비스` | 특정 unit의 로그 |
| `-f` | 실시간 추적(follow) |
| `-b` | 현재 부팅 세션 로그 |
| `-p` | 우선순위 필터(emerg~debug) |
| `-r` | 최신순 역정렬 |
| `--since`/`--until` | 시간 범위 지정 |

> 💡 **개념**: `journalctl -u 서비스 -f`는 특정 서비스의 로그를 실시간으로 보는 가장 유용한 조합이다. journal은 기본적으로 메모리/임시 저장이라 재부팅하면 사라질 수 있는데, `/etc/systemd/journald.conf`에서 `Storage=persistent`로 바꾸면 디스크(`/var/log/journal/`)에 영구 보존된다.

> 🔍 **직접 쳐보기**: `journalctl -b -p err`로 이번 부팅에서 발생한 에러만 추려 보자. 시스템에 문제가 있었다면 빨갛게 표시된다. 이어 `journalctl -u sshd --since "today"`로 오늘 SSH 관련 로그만 좁혀 보면, 필터 조합의 위력을 체감할 수 있다.

## 오늘의 정리

전통 init은 `/etc/inittab`을 읽어 런레벨(0~6)로 시스템을 띄웠다 — 0 종료, 1 단일 사용자, 3 텍스트, 5 GUI, 6 재부팅(0·6은 기본값 금지). 현대 systemd는 target으로 대체했고, 2·3·4는 multi-user.target, 5는 graphical.target에 대응한다. 서비스는 `systemctl`로 다루며 start(지금)·enable(부팅 자동)을 구분한다. unit 파일은 `[Unit]`·`[Service]`·`[Install]` 구조로 `/etc/systemd/system`(우선)·`/usr/lib/systemd/system`에 두고, 수정 후 `daemon-reload`가 필수다. 로그는 `journalctl -u -f`로 본다.

## 📝 연습 문제

**문제 1.** 전통적 SysV init 체계에서 텍스트(CLI) 기반 다중 사용자 + 네트워크 환경에 해당하는 런레벨은?

A) 런레벨 1

B) 런레벨 3

C) 런레벨 5

D) 런레벨 6

**정답: B**

해설: 런레벨 3은 네트워크가 활성화된 텍스트 다중 사용자 모드로 서버의 표준이다. A(1)은 복구용 단일 사용자, C(5)는 GUI까지 띄우는 그래픽 모드, D(6)은 재부팅이다. 3과 5의 차이는 X 윈도(GUI)의 유무뿐이다.

---

**문제 2.** 런레벨을 부팅 기본값으로 지정하면 절대 안 되는 것끼리 묶은 것은?

A) 1과 3

B) 3과 5

C) 0과 6

D) 2와 4

**정답: C**

해설: 0(종료)과 6(재부팅)을 기본 런레벨로 두면 시스템이 켜지자마자 꺼지거나 무한 재부팅에 빠진다. A·B·D의 런레벨들은 기본값으로 쓸 수 있다(보통 서버 3, 데스크톱 5). 기본 런레벨에서 0과 6은 반드시 제외해야 한다.

---

**문제 3.** systemd 환경에서 옛 런레벨 5(GUI)에 대응하는 target은?

A) multi-user.target

B) graphical.target

C) rescue.target

D) poweroff.target

**정답: B**

해설: 런레벨 5(그래픽)는 graphical.target에 대응한다. A(multi-user.target)는 텍스트 다중 사용자로 옛 런레벨 2·3·4가 합쳐진 것, C(rescue.target)는 런레벨 1(복구), D(poweroff.target)는 런레벨 0(종료)이다. 런레벨↔target 대응은 자주 출제된다.

---

**문제 4.** `systemctl start httpd`와 `systemctl enable httpd`의 차이로 옳은 것은?

A) start는 부팅 시 자동 시작 등록, enable은 지금 즉시 시작이다

B) start는 지금 즉시 시작, enable은 부팅 시마다 자동 시작 등록이다

C) 둘 다 동일하게 지금 즉시 시작한다

D) 둘 다 동일하게 부팅 시 자동 시작만 등록한다

**정답: B**

해설: `start`는 서비스를 지금 한 번 시작하고(재부팅하면 다시 꺼질 수 있음), `enable`은 부팅 때마다 자동 시작되도록 등록한다(지금 당장 켜지진 않음). 둘 다 하려면 `systemctl enable --now`를 쓴다. A는 둘을 뒤바꿨고, C·D는 둘의 역할을 같다고 본 오답이다.

---

**문제 5.** systemd unit 파일을 수정한 뒤 변경 사항을 systemd가 인식하도록 반드시 실행해야 하는 명령은?

A) `systemctl restart unit`

B) `systemctl daemon-reload`

C) `systemctl enable unit`

D) `journalctl -u unit`

**정답: B**

해설: systemd는 unit 파일을 메모리에 캐시하므로, 파일을 수정한 뒤 `systemctl daemon-reload`로 다시 읽혀야 변경이 반영된다. A(restart)는 서비스 재시작이지만 변경된 unit 파일을 자동으로 다시 읽지는 않는다. C는 자동 시작 등록, D는 로그 조회다. "수정→daemon-reload→restart" 순서를 외운다.

---

**문제 6.** systemd unit 파일에서 `enable` 시 서비스를 연결할 target을 지정하는 섹션과 지시어로 옳은 것은?

A) `[Unit]` 섹션의 `After=`

B) `[Service]` 섹션의 `ExecStart=`

C) `[Install]` 섹션의 `WantedBy=`

D) `[Unit]` 섹션의 `Description=`

**정답: C**

해설: `[Install]` 섹션의 `WantedBy=`가 enable 시 어느 target의 `.wants/`에 링크를 걸어 자동 시작할지 지정한다(예: `WantedBy=multi-user.target`). A(`After=`)는 시작 순서, B(`ExecStart=`)는 시작 명령, D(`Description=`)는 설명이다. enable 동작의 핵심은 `[Install]`의 `WantedBy`다.

---

**문제 7.** sshd 서비스의 로그만 실시간으로 추적하려 한다. 올바른 journalctl 명령은?

A) `journalctl -b sshd`

B) `journalctl -u sshd -f`

C) `journalctl -p sshd`

D) `journalctl -k sshd`

**정답: B**

해설: `-u sshd`로 특정 서비스(unit) 로그를 한정하고 `-f`로 실시간 추적(follow)한다. A(`-b`)는 부팅 세션 필터, C(`-p`)는 우선순위 필터, D(`-k`)는 커널 메시지 옵션이라 용도가 다르다. 특정 서비스를 실시간으로 보는 표준 조합이 `-u 서비스 -f`다.

---
