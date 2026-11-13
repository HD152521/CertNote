# Day 5 - Week 8 Comprehensive Review: The X Window Name Tag Sheet

## 📌 Key Takeaways

- **The side with the screen is the X server** and **the program is the X client**. It is the opposite of the web.
- The evolution order is **XFree86 → X.org Server → Wayland**.
- The layers from the bottom are **X server → Xlib · XCB → toolkit → application**. **XCB is the lowest level.**
- **A name ending in `DM` is a display manager.** This one rule can sort a good share of classification questions.
- `DISPLAY` is **`host:display.screen`**, and local is **`:0.0`**.

## One Sheet of Name Tags

This week is all about **which slot a name goes into**.

```text
   Layer                     Names
   ─────────────────────────────────────────────────────────────
   X server impl.   XFree86 → X.org Server → Wayland
                    (XWayland is a compatibility layer)

   Low-level libs   Xlib · XCB          ← XCB is further down (lower level)

   Toolkits         GTK+ (C, GIMP Toolkit) · Qt (C++) · FLTK · Motif · Tk

   Window managers  KWin (KDE) · Mutter (GNOME) · Metacity (GNOME 2)
                    Xfwm (Xfce) · Openbox (LXDE) · Marco (MATE) · Muffin (Cinnamon)
                    Windowmaker · Afterstep · Enlightenment · Fluxbox · twm · FVWM

   Display managers XDM (default) · GDM (GNOME) · KDM (old KDE)
                    SDDM (KDE Plasma) · LightDM (Ubuntu · Xfce) · LXDM

   Desktop environments  GNOME · KDE · Xfce · LXDE · LXQt · MATE · Cinnamon · CDE

   File managers    Nautilus (GNOME) · Dolphin (KDE) · Thunar (Xfce) · PCManFM (LXDE)
```

## Bundling Desktop Environments on One Line

| Environment | Toolkit | Window manager | File manager | Display manager |
|------|------|-----------|-----------|----------------|
| **GNOME** | **GTK+** | Mutter | **Nautilus** | **GDM** |
| **KDE** | **Qt** | **KWin** | **Dolphin** | **SDDM** |
| **Xfce** | GTK+ | **Xfwm** | **Thunar** | LightDM |
| LXDE | GTK+ | Openbox | PCManFM | LXDM |
| **CDE** | **Motif** | — | — | — |

> **Memorize each horizontal line as a whole.** Even just being sure of the GNOME line and the KDE line solves most pairing questions.

## Contrasting the Confusing Pairs

| Item | A | B | Deciding criterion |
|------|---|---|-----------|
| X server vs X client | **The side with the screen** | The program | Who provides the resource |
| Xlib vs XCB | Traditional, heavy | **Lower level, light** | Distance from the X server |
| Library vs toolkit | Xlib · XCB | **GTK+ · Qt · FLTK** | Whether it provides widgets |
| GTK+ vs Qt | **C**, GNOME | **C++**, KDE | Language and camp |
| **Xfce vs Xfwm** | **Desktop environment** | **Window manager** | They differ by one letter |
| Window vs display manager | **Windows** | **Login screen** | When it operates |
| Window manager vs desktop environment | Windows only | **Includes everything** | Containment relationship |
| XFree86 vs X.org | Former | **Current standard** | Generation |
| X vs Wayland | Existing | **Replacement protocol** | Not a new version |
| `xhost` vs `xauth` | **Per host**, weak | Per user, strong | Authentication method |
| Runlevel 3 vs 5 | **Text** | **Graphical** | Boot mode |

## Commonly Missed Points

1. **The remote server is the X server** → No. **The computer in front of me is the X server.**
2. **Xlib is the lowest level** → **XCB** is further down.
3. **GTK+ is C++** → It is **C**. **Qt is C++.**
4. **Xfce is a window manager** → It is a **desktop environment**. The window manager is **Xfwm**.
5. **Wayland is a new version of X** → It is a **replacement**. The structure is different.
6. **The X Window System is part of the kernel** → No. It is an **application**, so you can do without it.
7. **Using `xhost +` is convenient** → It is a **dangerous command that opens your screen to everyone**.
8. **`DISPLAY=0:0`** → The order is reversed. **`:0.0`** — the colon comes first.
9. **Runlevel 5 is text** → **3 is text and 5 is graphical.**
10. **KDM is the current KDE display manager** → It is **SDDM** now. KDM is the old one.

## Values That Appear on the Exam as They Are

| Value | What it is |
|-----|------|
| **1984 / MIT** | The start of the X Window System |
| **X11** | The version still in use today |
| **`:0.0`** | The DISPLAY value for the local first screen |
| **3 / 5** | Text / graphical runlevels |
| **`/etc/X11/xorg.conf`** | The X server config file |
| **`~/.Xauthority`** | The file where magic cookies are stored |
| **MIT-MAGIC-COOKIE-1** | The authentication method of `xauth` |

| Abbreviation | Full name |
|-------|-------|
| **XCB** | X protocol C-language Binding |
| **GTK+** | GIMP Toolkit |
| **FLTK** | Fast Light Toolkit |
| **CDE** | Common Desktop Environment |
| **GDM / KDM / XDM** | GNOME / KDE / X Display Manager |

## Dissecting One Window by Layer

If you have memorized the name tags, this time take **one window on the screen** and point out who is responsible for which part. This is the case of launching `gedit` on GNOME and `Kate` on KDE.

| What you see on the screen | Layer responsible | In GNOME | In KDE |
|-----------------|--------|-------------|-----------|
| The login screen right after boot | **Display manager** | GDM | SDDM |
| The top panel, menus, settings windows | **Desktop environment** | GNOME | KDE Plasma |
| The window's title bar, borders, close button | **Window manager** | Mutter | KWin |
| The menus, buttons, and text boxes **inside** the window | **Toolkit** | GTK+ | Qt |
| The editor program itself | **Application (X client)** | gedit | Kate |
| Converting drawing requests into X protocol and sending them | **Low-level library** | Xlib · XCB | Xlib · XCB |
| Actually drawing on the screen and passing key input | **X server** | X.org Server | X.org Server |

- **The window's border and the window's interior are drawn by different parties.** The window manager draws the border and title bar, and the program draws the interior content using the toolkit. That is why, if you launch a Qt program on GNOME, the border has the GNOME look while only the buttons inside look different.
- **The bottom two lines are the same whether GNOME or KDE.** The camps split from the toolkit upward.
- So even if a program freezes and **its interior locks up, you can still grab the border and move the window.** That is because the window manager is a separate program and is still alive. At that point, click the window with `xkill` to close it.
- Among recent GNOME programs, some even draw the title bar themselves. What the exam asks is the **traditional division of roles** in the table above.

## From Power to Window — In Time Order

```text
   Boot        graphical.target (runlevel 5)        ← if multi-user.target (3), a text login happens here
     │
   Display manager starts (GDM · SDDM · LightDM)
     │           launches the X server (X.org Server) as display :0   ← config /etc/X11/xorg.conf
     │           draws the login screen
     │
   Session starts    desktop environment = window manager + panel + file manager …
     │
   Program      the X client looks at DISPLAY=:0 and connects to the X server
     │           toolkit (GTK+ · Qt) → Xlib · XCB → X protocol
     ▼
   Window on the screen
```

- If you booted into text, **a single `startx` line does the job of launching the X server and starting the session.** Since you have already logged in by text, you skip the login screen.
- This week's four days are one slot each of this picture — **Day 1 is the X server and client, Day 2 is libraries and toolkits, Day 3 is the three managers, and Day 4 is execution and `DISPLAY`.**

## Separating Names with the Same Initial

The people who make the choices **gather names that begin with the same letter.** Sort them out in advance.

| Starting with X | What it is |
|---------|------|
| **XFree86** | The old X server implementation |
| **X.org Server** | The current X server implementation |
| **X11** | The version of the X protocol |
| **Xlib** · **XCB** | Low-level **libraries** |
| **XDM** | **Display manager** |
| **Xfce** | **Desktop environment** |
| **Xfwm** | Xfce's **window manager** |
| **XWayland** | The **compatibility layer** that runs X programs on Wayland |
| `xterm` · `xclock` · `xeyes` | X **clients** (applications) |
| `xhost` · `xauth` · `xrandr` · `xkill` · `xdpyinfo` | X-related **commands** |

| Initial | Desktop environment | Window manager | Display manager | Toolkit | Other programs |
|---------|-------------|-----------|----------------|------|---------------|
| **G** | **GNOME** | (Mutter) | **GDM** | **GTK+** | GIMP, gedit |
| **K** | **KDE** | **KWin** | **KDM** (now SDDM) | (Qt) | Konsole, Kate |
| **L** | **LXDE**, LXQt | (Openbox) | **LXDM**, LightDM | — | — |
| **M** | **MATE** | Mutter, Metacity, Marco, Muffin | — | Motif | — |

- In the G row, **GNOME, GDM, GTK+, and GIMP are all different kinds** — environment, login, toolkit, and application. If asked to pick "the same kind as GNOME", you must look in the KDE and Xfce side, not among the names starting with G.
- In the M row, **only MATE is a desktop environment, Motif is a toolkit**, and the other four are window managers.

## Practice Identifying — Picking the Odd One Out

Cover the answer and first say "what the other three have in common". Once the commonality comes out in words, the odd one becomes visible on its own.

| Choices | The odd one | Commonality of the other three |
|------|---------|----------------|
| `GTK+ · Qt · Motif · Xlib` | **Xlib** | Toolkits |
| The one providing widgets among `XCB · Xlib · FLTK` | **FLTK** | (The other two are low-level libraries) |
| `Mutter · KWin · Xfwm · SDDM` | **SDDM** | Window managers |
| `GDM · KDM · XDM · twm` | **twm** | Display managers |
| `GNOME · Xfce · LXDE · KDE` (by toolkit) | **KDE** | GTK+-based |
| The one not Qt-based among `KDE · LXQt · Xfce` | **Xfce** | (The other two are Qt-based) |
| `Nautilus · Dolphin · Thunar · Evince` | **Evince** | File managers (Evince is a document viewer) |
| `XFree86 · X.org Server · Wayland · Xlib` | **Xlib** | On the server/protocol side that handles the screen (Xlib is a client library) |
| `xhost · xauth · ssh -X · xrandr` | **xrandr** | Access and connection for remote screens (xrandr is resolution) |
| `Windowmaker · Afterstep · Fluxbox · Cinnamon` | **Cinnamon** | Standalone window managers |

## Practice Identifying — Reading Values

| What is given | How to read it |
|----------|--------|
| `DISPLAY=:0` | Local, display 0, screen omitted (0) — same as `:0.0` |
| `DISPLAY=192.168.0.10:1.0` | The **second** X server of 192.168.0.10, first screen. TCP port 6001 |
| `DISPLAY=localhost:10.0` | A **session that came in with `ssh -X`**. The fake display made by sshd |
| `access control disabled, clients can connect from any host` | Someone ran **`xhost +`** — to close it, `xhost -` |
| `Error: Can't open display:` | `DISPLAY` is empty |
| `systemctl get-default` → `multi-user.target` | Boots into text (runlevel 3). For graphics, use `startx` |
| `id:5:initdefault:` | A line in the old `/etc/inittab` saying to **boot into graphical mode** |
| `Section "Device"` | The **graphics card** section of `xorg.conf` (not the keyboard or mouse) |

## The Old and the Current

| Area | Old | Current |
|------|------|--------|
| X server implementation | XFree86 | **X.org Server** (and the replacement protocol Wayland) |
| Low-level library | Xlib | **XCB** (Xlib is also used alongside) |
| X server config file | `XF86Config` | **`xorg.conf`** |
| GNOME's window manager | Metacity | **Mutter** |
| KDE's display manager | KDM | **SDDM** |
| Specifying the boot mode | Runlevel (`/etc/inittab`) | **Target** (`systemctl set-default`) |
| Remote display | `xhost` + `DISPLAY` | **`ssh -X`** |

- The exam **also uses the old names as they are.** The answer differs between when it asks for the "current standard" and when it asks for the "evolution order", so remember the two columns as a pair.

> Next week is network concepts. We cover the OSI 7 layers, TCP/IP, and IP addresses and subnets.

## 📖 Glossary

- **X server / X client**: The side with the screen and input devices / the program that requests that something be drawn on the screen.
- **XCB**: A low-level library thinner than Xlib and closer to the X server.
- **Toolkit**: A higher-level library that provides widgets such as buttons and menus. GTK+, Qt, etc.
- **Window manager / display manager / desktop environment**: Handles windows / handles the login screen / the overall integrated environment.
- **`DISPLAY`**: The environment variable that specifies the screen to output to.
- **X11 forwarding**: The feature that carries X traffic over SSH's encrypted connection. Used as `ssh -X`.
- **Compositor**: In Wayland, the program that handles both screen output and window management.
- **Wayland**: A display server protocol newly designed to replace X.

## 📝 Practice Questions

**Question 1.** Which of the following sits lowest in the layers of the X Window System and communicates directly with the X server?

A) GTK+  
B) Qt  
C) XCB  
D) GNOME  

**Answer: C**  
Explanation: The X Window System is stacked from the bottom in the order X server, low-level library, toolkit, application. XCB is a low-level library that thinly wraps the X protocol and is closer to the X server than Xlib. GTK+ and Qt are toolkits, and GNOME is a desktop environment.

---

**Question 2.** Which of the following is **not** a display manager?

A) KWin  
B) GDM  
C) XDM  
D) LightDM  

**Answer: A**  
Explanation: KWin is the window manager that handles window borders and moving in KDE. GDM, XDM, and LightDM are all display managers that provide the graphical login screen, and the names ending in DM are a common clue.

---

**Question 3.** Which window manager does the Xfce desktop environment use?

A) KWin  
B) Mutter  
C) Openbox  
D) Xfwm  

**Answer: D**  
Explanation: Xfce uses Xfwm as its window manager, and the similar names make it easy to confuse. Xfce is the desktop environment and Xfwm is the window manager inside it. KWin is used by KDE, Mutter by GNOME, and Openbox by LXDE.

---

**Question 4.** Which runlevel corresponds to text mode in the X Window context?

A) 1  
B) 3  
C) 5  
D) 6  

**Answer: B**  
Explanation: Runlevel 3 is the multi-user text mode including networking and corresponds to systemd's `multi-user.target`. Runlevel 5 is graphical mode and corresponds to `graphical.target`, 1 is single-user mode, and 6 is reboot.

---

**Question 5.** Which desktop environment was built on the Qt toolkit?

A) KDE  
B) GNOME  
C) Xfce  
D) MATE  

**Answer: A**  
Explanation: KDE is based on the Qt toolkit, written in C++, and uses KWin as its window manager and Dolphin as its file manager. GNOME, Xfce, and MATE are all based on the GTK+ toolkit, written in C.

---

**Question 6.** Which method safely displays a graphical program from a remote computer on my screen through encrypted communication?

A) Allow all access with xhost +  
B) Connect with ssh -X  
C) Set DISPLAY to 0:0  
D) Connect the session with xkill  

**Answer: B**  
Explanation: `ssh -X` uses the X11 forwarding feature to carry X traffic through SSH's encrypted tunnel and also sets `DISPLAY` automatically. `xhost +` opens the screen to every host and is therefore dangerous, and `xkill` is a command that force-kills a window.
