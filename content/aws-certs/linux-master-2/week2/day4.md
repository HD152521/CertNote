# Day 4 - 부트 매니저: 전원을 켠 순간부터 로그인까지

## 📌 핵심 정리

- 부팅 순서는 **펌웨어(BIOS/UEFI) → 부트로더 → 커널 → initramfs → init(systemd) → 로그인**이다.
- **BIOS는 MBR**을, **UEFI는 GPT와 ESP**를 짝으로 쓴다.
- 리눅스의 표준 부트로더는 **GRUB2**이며, 그 이전에는 **LILO**를 썼다.
- GRUB2에서 사람이 고치는 파일은 **`/etc/default/grub`** 이고, `grub.cfg`는 **직접 편집하지 않는다.**
- 옛 **런레벨**은 systemd에서 **target**으로 바뀌었다. `3`=텍스트, `5`=GUI에 해당한다.

## 부팅의 여섯 단계

```text
 1. 전원 인가
        ▼
 2. 펌웨어 (BIOS 또는 UEFI)     POST — 하드웨어 자체 점검
        ▼                       부팅할 장치 선택
 3. 부트로더 (GRUB2)            커널을 찾아 메모리에 올린다
        ▼
 4. 커널 로드                   하드웨어 초기화
        ▼
 5. initramfs                  루트 파일 시스템을 마운트할 임시 도구 모음
        ▼
 6. init / systemd (PID 1)      서비스 시작 → 로그인 화면
```

- **PID 1** 은 커널이 띄우는 **첫 번째 프로세스**다. 예전엔 `init`, 지금은 대부분 `systemd`다.
- **initramfs**가 필요한 이유: 루트 파일 시스템이 담긴 디스크의 드라이버가 아직 없을 수 있다. 그 드라이버를 담은 임시 파일 시스템을 먼저 메모리에 올린다.

3~5단계에서 읽히는 파일은 모두 **`/boot`** 에 모여 있다. `/boot`를 따로 파티션으로 떼는 이유가 여기 있다.

```text
$ ls /boot
config-5.14.0-362.8.1.el9_3.x86_64
efi
grub2
initramfs-5.14.0-362.8.1.el9_3.x86_64.img
System.map-5.14.0-362.8.1.el9_3.x86_64
vmlinuz-5.14.0-362.8.1.el9_3.x86_64
```

| 파일 | 정체 |
|------|------|
| `vmlinuz-버전` | **커널 본체**(압축된 실행 이미지). 부트로더가 메모리에 올리는 것이 이 파일이다 |
| `initramfs-버전.img` | 5단계의 임시 파일 시스템. 데비안 계열에서는 이름이 `initrd.img-버전`이다 |
| `config-버전` | 이 커널을 만들 때 쓴 설정 |
| `grub2/` | 부트로더의 파일과 설정 |

- 커널을 업데이트하면 이 파일들이 **버전별로 한 벌씩 더** 생긴다. GRUB 메뉴에 옛 커널 항목이 남아 있어, 새 커널로 부팅이 안 될 때 이전 것을 골라 들어갈 수 있다.
- 부팅 중 커널이 출력한 메시지는 지나가 버리지만 `dmesg` 명령으로 다시 볼 수 있다. systemd 환경에서는 `journalctl -b`가 이번 부팅의 기록 전체를 보여준다.

## BIOS와 UEFI

| 구분 | BIOS | UEFI |
|------|------|------|
| 등장 | 오래됨 | 현대적 대체품 |
| 파티션 방식 | **MBR** | **GPT** |
| 부트로더 위치 | 디스크 첫 섹터(MBR) | **ESP**(EFI 시스템 파티션) |
| 디스크 한계 | 2TB | 사실상 없음 |
| 화면 | 텍스트 | 그래픽·마우스 가능 |
| 보안 기능 | 없음 | **Secure Boot** |

- **POST(Power-On Self-Test)** 는 펌웨어가 하는 하드웨어 자체 점검이다. 메모리·키보드·디스크가 정상인지 본다.
- **Secure Boot**는 서명되지 않은 부트로더의 실행을 막는 기능이다. 리눅스 설치 시 이것 때문에 막히는 경우가 있다.

## 부트로더

| 이름 | 설명 |
|------|------|
| **LILO** | LInux LOader. 옛 부트로더. **설정을 바꾸면 다시 설치해야** 반영된다 |
| **GRUB** (legacy) | LILO를 대체. 부팅 시 편집 가능 |
| **GRUB2** | **현재 표준.** 설정 구조가 GRUB과 다르다 |

> LILO와 GRUB의 결정적 차이: LILO는 `/etc/lilo.conf`를 고친 뒤 **`lilo` 명령으로 다시 써 넣어야** 하지만, GRUB은 설정 파일을 읽어 동작하므로 그 과정이 필요 없다.

### GRUB2 설정 파일

| 파일 | 역할 | 직접 고치나? |
|------|------|------------|
| `/etc/default/grub` | 기본 타임아웃, 기본 메뉴 등 | **여기를 고친다** |
| `/etc/grub.d/` | 메뉴 항목을 만드는 스크립트 | 필요할 때만 |
| `/boot/grub2/grub.cfg` | 실제로 읽히는 최종 설정 | **직접 고치지 않는다** |

```bash
# /etc/default/grub 을 고친 뒤 반드시 실행해 grub.cfg 를 다시 만든다
grub2-mkconfig -o /boot/grub2/grub.cfg     # 레드햇 계열
update-grub                                 # 데비안 계열
```

- `grub.cfg`는 **자동 생성되는 파일**이다. 직접 고쳐도 다음 갱신 때 덮어써진다.
- 자주 쓰는 설정: `GRUB_TIMEOUT`(메뉴 대기 시간), `GRUB_DEFAULT`(기본 선택 항목).

```text
$ cat /etc/default/grub
GRUB_TIMEOUT=5
GRUB_DEFAULT=saved
GRUB_DISABLE_SUBMENU=true
GRUB_TERMINAL_OUTPUT="console"
GRUB_CMDLINE_LINUX="crashkernel=auto rhgb quiet"
GRUB_DISABLE_RECOVERY="true"
```

| 항목 | 뜻 |
|------|-----|
| `GRUB_TIMEOUT=5` | 메뉴를 5초 보여준 뒤 기본 항목으로 부팅한다. 0이면 기다리지 않는다 |
| `GRUB_DEFAULT=saved` | 지난번에 고른(저장된) 항목을 기본으로 쓴다. `0`이라고 적으면 **첫 번째** 항목이다 |
| `GRUB_CMDLINE_LINUX` | 커널에 넘길 옵션. `rhgb`는 그래픽 부팅 화면, `quiet`는 부팅 메시지 숨김이다 |

- 부팅이 어디서 막히는지 보고 싶으면 `rhgb quiet`를 지우고 `grub.cfg`를 다시 만든다. 그러면 메시지가 화면에 그대로 흐른다.
- `grub.cfg`의 위치는 배포판과 펌웨어에 따라 다르다. 데비안 계열은 `/boot/grub/grub.cfg`이고, UEFI로 부팅하는 레드햇 계열은 버전에 따라 `/boot/efi/EFI/` 아래에 두기도 한다. **경로는 달라도 "직접 고치지 않는다"는 원칙은 같다.**

### 부팅 메뉴에서 한 번만 바꾸기

GRUB 메뉴가 떠 있을 때 누르는 키가 있다.

| 키 | 동작 |
|----|------|
| `e` | 선택한 항목을 **편집**한다(edit) |
| `c` | GRUB **명령행**으로 들어간다(command) |
| `Ctrl`+`x` | (GRUB2) 편집한 내용으로 부팅한다 |

- 여기서 고친 것은 **이번 부팅에만** 적용되고 저장되지 않는다. root 비밀번호를 잊었을 때 커널 옵션을 임시로 바꿔 복구 모드로 들어가는 데 쓴다.

### 옛 GRUB과 LILO의 설정 파일

구형 시스템이나 기출 지문에는 GRUB2 이전의 설정이 나온다.

```text
# /boot/grub/grub.conf  (GRUB legacy)
default=0
timeout=5
title CentOS (2.6.32-754.el6.x86_64)
        root (hd0,0)
        kernel /vmlinuz-2.6.32-754.el6.x86_64 ro root=/dev/sda3 rhgb quiet
        initrd /initramfs-2.6.32-754.el6.x86_64.img
```

- `title` 한 덩어리가 메뉴 항목 하나다. `default=0`은 **첫 번째 `title`** 을 기본으로 한다는 뜻 — 번호가 **0부터** 시작한다.
- `(hd0,0)`은 **첫 번째 디스크의 첫 번째 파티션**이다. 옛 GRUB은 디스크도 파티션도 0부터 센다. 리눅스 장치명으로는 `/dev/sda1`이다.
- GRUB2에서는 표기가 바뀌어 **디스크는 0부터, 파티션은 1부터** 센다. 같은 파티션이 `(hd0,1)`이다.

| 부트로더 | 설정 파일 | 고친 뒤 할 일 |
|---------|----------|-------------|
| LILO | `/etc/lilo.conf` | `lilo` 명령 실행 |
| GRUB legacy | `/boot/grub/grub.conf` | 없음(파일을 직접 고친다) |
| GRUB2 | `/etc/default/grub` | `grub2-mkconfig` 또는 `update-grub` |

## 런레벨과 systemd target

옛 System V 방식의 **런레벨**은 시스템의 동작 모드를 숫자로 나타냈다.

| 런레벨 | 뜻 | systemd target |
|-------|-----|----------------|
| 0 | 시스템 종료 | `poweroff.target` |
| 1 | 단일 사용자 모드(복구) | `rescue.target` |
| 3 | **텍스트 다중 사용자** | `multi-user.target` |
| 5 | **GUI 다중 사용자** | `graphical.target` |
| 6 | 재시작 | `reboot.target` |

- **0=종료, 6=재시작**을 먼저 외우면 나머지가 정리된다. 이 둘을 기본값으로 두면 부팅이 끝나지 않는다.
- **3과 5의 차이는 X 윈도(GUI)의 유무**다.
- 2와 4는 배포판마다 쓰임이 다르거나 비워둔다. 레드햇 계열의 전통적인 정의는 **2 = NFS(네트워크 파일 공유)를 뺀 다중 사용자, 4 = 사용하지 않음**이다.
- systemd에는 `emergency.target`도 있다. `rescue.target`보다 더 최소한의 상태로, 루트 파일 시스템만 읽기 전용으로 붙인 채 셸을 띄운다.

### init 시절에는 어디에 적었나

System V init은 기본 런레벨을 **`/etc/inittab`** 한 줄로 정했다.

```text
id:3:initdefault:
│  │      │
│  │      └── 동작 — initdefault = "기본 런레벨로 삼는다"
│  └───────── 런레벨
└──────────── 이 줄의 이름표
```

- `id:5:initdefault:`로 바꾸면 다음 부팅부터 그래픽 모드다. 여기에 **0이나 6을 적으면** 켜자마자 꺼지거나 끝없이 재시작한다.
- 런레벨마다 실행할 스크립트는 `/etc/rc.d/rc3.d/` 처럼 **런레벨 번호가 들어간 디렉터리**에 있다. 이름이 **`S`로 시작하면 시작(Start)**, **`K`로 시작하면 종료(Kill)** 스크립트이고, 뒤의 숫자 순서대로 **하나씩 차례로** 실행된다.
- systemd는 이 방식을 대체했다. 서로 의존하지 않는 서비스를 **동시에(병렬로)** 띄워 부팅이 빠르고, `/etc/inittab` 대신 **`default.target`이라는 링크**가 기본 모드를 가리킨다.

```text
$ sudo systemctl set-default multi-user.target
Removed /etc/systemd/system/default.target.
Created symlink /etc/systemd/system/default.target → /usr/lib/systemd/system/multi-user.target.
```

- 출력이 말해 주듯 `set-default`가 하는 일은 **심볼릭 링크 하나를 바꿔 다는 것**이 전부다.

### 지금 모드 확인하고 바꾸기

| 하려는 일 | init 방식 | systemd 방식 |
|----------|----------|-------------|
| 현재 런레벨 확인 | `runlevel`, `who -r` | `systemctl get-default`(기본값) |
| **지금 즉시** 전환 | `init 3`, `telinit 3` | `systemctl isolate multi-user.target` |
| **다음 부팅부터** 변경 | `/etc/inittab` 수정 | `systemctl set-default …` |

```text
$ runlevel
N 5
```

- 앞 글자는 **직전 런레벨**, 뒤 글자가 **현재 런레벨**이다. `N`은 "이전 것이 없다", 곧 부팅 후 한 번도 바꾸지 않았다는 뜻이다.
- **`isolate`는 지금만, `set-default`는 다음 부팅부터** — 이 둘을 맞바꾼 보기가 단골이다.

### 끄고 다시 켜는 명령

런레벨 0과 6은 평소 명령으로 부른다.

| 명령 | 동작 |
|------|------|
| `shutdown -h now` | 지금 종료(halt) |
| `shutdown -r now` | 지금 재시작(reboot) |
| `shutdown -h +10` | 10분 뒤 종료. 로그인한 사용자에게 알림이 간다 |
| `shutdown -c` | 예약한 종료를 취소(cancel) |
| `poweroff`, `halt` | 종료 |
| `reboot` | 재시작 |
| `init 0` / `init 6` | 런레벨을 바꾸는 방식으로 종료 / 재시작 |

## 자주 틀리는 지점

1. **"커널이 부트로더를 불러온다"** → 반대다. 부트로더가 커널을 메모리에 올린다.
2. **"POST는 커널이 수행한다"** → 펌웨어(BIOS/UEFI)가 한다. 커널은 아직 올라오지도 않았다.
3. **"GRUB2 설정은 `grub.cfg`를 고친다"** → `/etc/default/grub`을 고치고 `grub.cfg`는 명령으로 다시 만든다.
4. **"LILO는 설정 파일만 고치면 된다"** → `lilo` 명령을 다시 실행해야 반영된다.
5. **"런레벨 3이 GUI, 5가 텍스트"** → 3이 텍스트, 5가 GUI다.
6. **"`systemctl isolate`로 기본 부팅 모드를 바꾼다"** → 지금만 바뀐다. 기본값은 `set-default`다.
7. **"PID 1은 커널이다"** → 커널이 띄운 **첫 프로세스**(init 또는 systemd)다.

```bash
systemctl get-default              # 현재 기본 target
systemctl set-default multi-user.target   # 텍스트 모드로 부팅하게 변경
systemctl isolate graphical.target        # 지금 즉시 GUI 모드로 전환
```

> 내일은 이번 주에 다룬 설치·파티션·파일 시스템·부팅을 한 장으로 묶는다.

## 📖 용어

- **POST** : 전원을 켰을 때 펌웨어가 수행하는 하드웨어 자체 점검.
- **BIOS** : 전통적인 펌웨어. MBR 파티션과 짝을 이룬다.
- **UEFI** : BIOS를 대체한 현대적 펌웨어. GPT·ESP·Secure Boot를 지원한다.
- **부트로더(Boot Loader)** : 커널을 찾아 메모리에 올리는 프로그램. GRUB2가 표준이다.
- **LILO** : GRUB 이전에 쓰이던 부트로더. 설정 변경 후 재설치가 필요하다.
- **initramfs** : 루트 파일 시스템을 마운트하기 위해 먼저 메모리에 올리는 임시 파일 시스템.
- **PID 1** : 커널이 띄우는 첫 프로세스. init 또는 systemd가 여기 해당한다.
- **런레벨(Runlevel)** : 시스템의 동작 모드를 나타내는 숫자. 0=종료, 3=텍스트, 5=GUI, 6=재시작.
- **target** : systemd에서 런레벨을 대체하는 개념.

## 📝 연습 문제

**문제 1.** 다음 중 리눅스의 부팅 순서로 알맞은 것은?

A) 부트로더 → BIOS → 커널 → init  
B) BIOS/UEFI → 커널 → 부트로더 → init  
C) BIOS/UEFI → 부트로더 → 커널 → init  
D) 커널 → BIOS/UEFI → 부트로더 → init  

**정답: C**  
해설: 전원을 켜면 펌웨어(BIOS 또는 UEFI)가 POST로 하드웨어를 점검하고 부팅 장치를 찾습니다. 그다음 부트로더(GRUB2)가 실행되어 커널을 메모리에 올리고, 커널이 initramfs를 거쳐 하드웨어를 초기화한 뒤 첫 프로세스인 init(또는 systemd)를 실행합니다.

---

**문제 2.** 다음 중 systemd 환경에서 그래픽 로그인 화면으로 부팅되는 target으로 알맞은 것은?

A) graphical.target  
B) multi-user.target  
C) rescue.target  
D) poweroff.target  

**정답: A**  
해설: `graphical.target`은 옛 런레벨 5에 해당하며 X 윈도를 포함한 그래픽 환경으로 부팅합니다. `multi-user.target`은 런레벨 3에 해당하는 텍스트 모드, `rescue.target`은 런레벨 1의 복구 모드, `poweroff.target`은 런레벨 0의 시스템 종료입니다.

---

**문제 3.** 다음 중 GRUB2 사용 시 관리자가 직접 편집해야 하는 설정 파일로 알맞은 것은?

A) /boot/grub2/grub.cfg  
B) /etc/lilo.conf  
C) /etc/inittab  
D) /etc/default/grub  

**정답: D**  
해설: `/etc/default/grub`에서 타임아웃과 기본 메뉴 항목 등을 설정한 뒤 `grub2-mkconfig`(또는 `update-grub`)로 `grub.cfg`를 다시 생성합니다. `grub.cfg`는 자동 생성되는 파일이라 직접 수정해도 다음 갱신 때 덮어써집니다. `lilo.conf`는 옛 LILO 부트로더의 설정 파일입니다.

---

**문제 4.** 다음 중 UEFI 펌웨어와 함께 사용되는 파티션 방식으로 알맞은 것은?

A) MBR  
B) GPT  
C) 확장 파티션  
D) 논리 파티션  

**정답: B**  
해설: UEFI는 GPT 파티션 방식과 짝을 이루며, 부트로더를 담기 위한 EFI 시스템 파티션(ESP)을 별도로 둡니다. MBR은 전통적인 BIOS와 함께 사용되며 2TB·주 파티션 4개의 제약이 있습니다. 확장과 논리는 MBR 안에서 파티션을 나누는 방식입니다.

---

**문제 5.** 다음 중 런레벨과 그 의미의 연결로 알맞지 않은 것은?

A) 0 — 시스템 재시작  
B) 1 — 단일 사용자 모드  
C) 3 — 텍스트 다중 사용자 모드  
D) 5 — 그래픽 다중 사용자 모드  

**정답: A**  
해설: 런레벨 0은 시스템 종료이고 재시작은 6입니다. 이 둘은 기본 런레벨로 지정하면 부팅이 끝나지 않으므로 특히 주의해야 합니다. 1은 복구용 단일 사용자 모드, 3은 GUI 없는 텍스트 모드, 5는 X 윈도가 동작하는 그래픽 모드입니다.
