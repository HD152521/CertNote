# Day 5 - Week 8 종합 복습: X 윈도 이름표

## 📌 핵심 정리

- **화면을 가진 쪽이 X 서버**, **프로그램이 X 클라이언트**다. 웹과 반대다.
- 발전 순서는 **XFree86 → X.org Server → Wayland**.
- 계층은 아래부터 **X 서버 → Xlib·XCB → 툴킷 → 응용 프로그램**. **XCB가 가장 저수준**이다.
- **끝이 `DM`이면 디스플레이 매니저**다. 이 규칙 하나로 분류 문제의 절반이 풀린다.
- `DISPLAY`는 **`호스트:디스플레이.스크린`**, 로컬은 **`:0.0`**.

## 이름표 한 장

이 주차는 **이름을 어느 칸에 넣느냐**가 전부다.

```text
   계층                      이름들
   ─────────────────────────────────────────────────────────────
   X 서버 구현     XFree86 → X.org Server → Wayland
                   (XWayland 는 호환 계층)

   저수준 라이브러리  Xlib · XCB          ← XCB 가 더 아래(저수준)

   툴킷            GTK+(C, GIMP Toolkit) · Qt(C++) · FLTK · Motif · Tk

   윈도 매니저      KWin(KDE) · Mutter(GNOME) · Metacity(GNOME2)
                   Xfwm(Xfce) · Openbox(LXDE) · Marco(MATE) · Muffin(Cinnamon)
                   Windowmaker · Afterstep · Enlightenment · Fluxbox · twm · FVWM

   디스플레이 매니저  XDM(기본) · GDM(GNOME) · KDM(구 KDE)
                   SDDM(KDE Plasma) · LightDM(우분투·Xfce) · LXDM

   데스크톱 환경     GNOME · KDE · Xfce · LXDE · LXQt · MATE · Cinnamon · CDE

   파일 관리자      Nautilus(GNOME) · Dolphin(KDE) · Thunar(Xfce) · PCManFM(LXDE)
```

## 데스크톱 환경 한 줄로 묶기

| 환경 | 툴킷 | 윈도 매니저 | 파일 관리자 | 디스플레이 매니저 |
|------|------|-----------|-----------|----------------|
| **GNOME** | **GTK+** | Mutter | **Nautilus** | **GDM** |
| **KDE** | **Qt** | **KWin** | **Dolphin** | **SDDM** |
| **Xfce** | GTK+ | **Xfwm** | **Thunar** | LightDM |
| LXDE | GTK+ | Openbox | PCManFM | LXDM |
| **CDE** | **Motif** | — | — | — |

> **가로 한 줄을 통째로 외운다.** GNOME 줄과 KDE 줄만 확실히 해도 대부분의 짝짓기 문제가 풀린다.

## 헷갈리는 짝 대조

| 구분 | A | B | 가르는 기준 |
|------|---|---|-----------|
| X 서버 vs X 클라이언트 | **화면을 가진 쪽** | 프로그램 | 자원을 누가 제공하나 |
| Xlib vs XCB | 전통적, 무겁다 | **더 저수준, 가볍다** | X 서버와의 거리 |
| 라이브러리 vs 툴킷 | Xlib·XCB | **GTK+·Qt·FLTK** | 위젯 제공 여부 |
| GTK+ vs Qt | **C**, GNOME | **C++**, KDE | 언어와 진영 |
| **Xfce vs Xfwm** | **데스크톱 환경** | **윈도 매니저** | 한 글자 차이! |
| 윈도 vs 디스플레이 매니저 | **창** | **로그인 화면** | 언제 동작하나 |
| 윈도 매니저 vs 데스크톱 환경 | 창만 | **전부 포함** | 포함 관계 |
| XFree86 vs X.org | 이전 | **현재 표준** | 세대 |
| X vs Wayland | 기존 | **대체 프로토콜** | 새 버전이 아님 |
| `xhost` vs `xauth` | **호스트 단위**, 약함 | 사용자 단위, 강함 | 인증 방식 |
| 런레벨 3 vs 5 | **텍스트** | **그래픽** | 부팅 모드 |

## 자주 틀리는 지점

1. **원격 서버가 X 서버다** → 아니다. **내 앞의 컴퓨터가 X 서버**다.
2. **Xlib이 가장 저수준** → **XCB**가 더 아래다.
3. **GTK+가 C++** → **C**다. **Qt가 C++** 이다.
4. **Xfce가 윈도 매니저** → **데스크톱 환경**이다. 윈도 매니저는 **Xfwm**.
5. **Wayland는 X의 새 버전** → **대체품**이다. 구조가 다르다.
6. **X 윈도가 커널의 일부** → 아니다. **응용 프로그램**이라 없어도 된다.
7. **`xhost +` 를 쓰면 편하다** → **모두에게 화면을 여는 위험한 명령**이다.
8. **`DISPLAY=0:0`** → 순서가 반대다. **`:0.0`** — 콜론이 앞이다.
9. **런레벨 5가 텍스트** → **3이 텍스트, 5가 그래픽**이다.
10. **KDM이 현재 KDE의 디스플레이 매니저** → 지금은 **SDDM**이다. KDM은 예전 것이다.

## 시험에 그대로 나오는 값

| 값 | 무엇 |
|-----|------|
| **1984 / MIT** | X 윈도의 시작 |
| **X11** | 현재까지 쓰이는 버전 |
| **`:0.0`** | 로컬 첫 화면의 DISPLAY 값 |
| **3 / 5** | 텍스트 / 그래픽 런레벨 |
| **`/etc/X11/xorg.conf`** | X 서버 설정 파일 |
| **`~/.Xauthority`** | 매직 쿠키 저장 파일 |
| **MIT-MAGIC-COOKIE-1** | `xauth`의 인증 방식 |

| 줄임말 | 풀네임 |
|-------|-------|
| **XCB** | X protocol C-language Binding |
| **GTK+** | GIMP Toolkit |
| **FLTK** | Fast Light Toolkit |
| **CDE** | Common Desktop Environment |
| **GDM / KDM / XDM** | GNOME / KDE / X Display Manager |

> 다음 주는 네트워크의 개념이다. OSI 7계층, TCP/IP, IP 주소와 서브넷을 다룬다.

## 📖 용어

- **X 서버 / X 클라이언트** : 화면과 입력장치를 가진 쪽 / 화면에 그려 달라고 요청하는 프로그램.
- **XCB** : Xlib보다 얇고 X 서버에 더 가까운 저수준 라이브러리.
- **툴킷** : 버튼·메뉴 같은 위젯을 제공하는 상위 라이브러리. GTK+, Qt 등.
- **윈도 매니저 / 디스플레이 매니저 / 데스크톱 환경** : 창 담당 / 로그인 화면 담당 / 전체 통합 환경.
- **`DISPLAY`** : 출력할 화면을 지정하는 환경 변수.
- **Wayland** : X를 대체하기 위해 새로 설계된 디스플레이 서버 프로토콜.

## 📝 연습 문제

**문제 1.** 다음 중 X 윈도 시스템의 계층에서 가장 아래에 위치해 X 서버와 직접 통신하는 것으로 알맞은 것은?

A) GTK+  
B) Qt  
C) XCB  
D) GNOME  

**정답: C**  
해설: X 윈도는 아래에서부터 X 서버, 저수준 라이브러리, 툴킷, 응용 프로그램 순으로 쌓여 있습니다. XCB는 X 프로토콜을 얇게 감싼 저수준 라이브러리로 Xlib보다 X 서버에 더 가깝습니다. GTK+와 Qt는 툴킷, GNOME은 데스크톱 환경입니다.

---

**문제 2.** 다음 중 디스플레이 매니저에 해당하지 **않는** 것으로 알맞은 것은?

A) KWin  
B) GDM  
C) XDM  
D) LightDM  

**정답: A**  
해설: KWin은 KDE에서 창의 테두리와 이동을 담당하는 윈도 매니저입니다. GDM, XDM, LightDM은 모두 그래픽 로그인 화면을 제공하는 디스플레이 매니저이며 이름이 DM으로 끝나는 것이 공통된 단서입니다.

---

**문제 3.** 다음 중 Xfce 데스크톱 환경이 사용하는 윈도 매니저로 알맞은 것은?

A) KWin  
B) Mutter  
C) Openbox  
D) Xfwm  

**정답: D**  
해설: Xfce는 Xfwm을 윈도 매니저로 사용하며 이름이 비슷해 혼동하기 쉽습니다. Xfce가 데스크톱 환경이고 Xfwm이 그 안의 윈도 매니저입니다. KWin은 KDE, Mutter는 GNOME, Openbox는 LXDE에서 사용합니다.

---

**문제 4.** 다음 중 X 윈도의 텍스트 모드에 해당하는 런레벨로 알맞은 것은?

A) 1  
B) 3  
C) 5  
D) 6  

**정답: B**  
해설: 런레벨 3은 네트워크를 포함한 다중 사용자 텍스트 모드이며 systemd의 `multi-user.target`에 대응합니다. 런레벨 5가 그래픽 모드로 `graphical.target`에 해당하고, 1은 단일 사용자 모드, 6은 재부팅입니다.

---

**문제 5.** 다음 중 Qt 툴킷을 기반으로 만들어진 데스크톱 환경으로 알맞은 것은?

A) KDE  
B) GNOME  
C) Xfce  
D) MATE  

**정답: A**  
해설: KDE는 C++로 작성된 Qt 툴킷을 기반으로 하며 윈도 매니저로 KWin, 파일 관리자로 Dolphin을 사용합니다. GNOME, Xfce, MATE는 모두 C 언어로 작성된 GTK+ 툴킷을 기반으로 합니다.

---

**문제 6.** 다음 중 원격 컴퓨터의 그래픽 프로그램을 암호화된 통신으로 안전하게 내 화면에 띄우는 방법으로 알맞은 것은?

A) xhost + 로 모든 접근을 허용한다  
B) ssh -X 로 접속한다  
C) DISPLAY 를 0:0 으로 설정한다  
D) xkill 로 세션을 연결한다  

**정답: B**  
해설: `ssh -X`는 X11 forwarding 기능으로 X 통신을 SSH의 암호화된 터널로 전달하며 `DISPLAY`도 자동으로 설정해 줍니다. `xhost +`는 모든 호스트에 화면을 열어 주므로 위험하고, `xkill`은 창을 강제 종료하는 명령입니다.
