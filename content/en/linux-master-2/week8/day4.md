# Day 4 - Running X and Remote Displays

## 📌 Key Takeaways

- If you booted into text mode, launch X with **`startx`**. To boot into graphics, set **`graphical.target`** as the default.
- The **`DISPLAY` environment variable** decides "which screen to draw on". The format is **`host:display.screen`**.
- The local screen is usually **`:0.0`**.
- Access permission is handled by **`xhost` (per host)** and **`xauth` (per user)**.
- The safe way for a remote GUI is **`ssh -X`**. `xhost +` is **dangerous because it opens access to anyone**.

## Two Ways to Start X

| Method | Description |
|------|------|
| **Display manager** | When you boot, the **graphical login screen appears right away** |
| **`startx`** | **Log in by text** and then run X yourself |

```bash
startx                 # start an X session
```

| systemd target | Old runlevel | Meaning |
|-------------|-----------|-----|
| **`multi-user.target`** | **3** | **Text mode** |
| **`graphical.target`** | **5** | **Graphical mode** |

```bash
systemctl get-default                      # current default mode
systemctl set-default graphical.target     # boot into graphics
systemctl set-default multi-user.target    # boot into text
```

- The pairing **runlevel 3 is text and 5 is graphical** is still asked as is today.
- Servers are often **run in text mode** to save resources.

### What startx Actually Does

```text
   startx  ──►  xinit  ──►  runs the X server  +  runs ~/.xinitrc
                                                   (if absent, /etc/X11/xinit/xinitrc)
```

```text
   # example of ~/.xinitrc
   xterm &          launches a terminal in the background and
   exec twm         finally runs the window manager
```

- **`startx` is a script that calls `xinit` conveniently.** What actually launches the X server and the first client is `xinit`.
- In **`~/.xinitrc`** you write the programs to run after X comes up. If the user file is absent, the system file (`/etc/X11/xinit/xinitrc`) is used.
- **When the last program ends, X ends too.** So put the window manager or desktop environment on the last line, and send the earlier ones to the background with `&`.
- When you log in through a display manager, it is the display manager, not `.xinitrc`, that starts the session. **`.xinitrc` is `startx`'s partner.**

### Changing It Right Now vs. Changing It from the Next Boot

| What you want to do | systemd | Old way (SysV init) |
|------------|---------|-------------------|
| Check the **boot default** | `systemctl get-default` | The `initdefault` line in `/etc/inittab` |
| Check the **current** runlevel | `runlevel` (works on systemd too) | `runlevel` |
| Go to graphics **right now** | `systemctl isolate graphical.target` | `init 5` · `telinit 5` |
| Go to text **right now** | `systemctl isolate multi-user.target` | `init 3` |
| Graphics **from the next boot** | `systemctl set-default graphical.target` | `id:5:initdefault:` in `/etc/inittab` |

- **`set-default` only changes the default for the next boot**, and the current screen stays as it is. To switch now, use `isolate`.
- Of the seven runlevels in the Red Hat family, memorize the axis **0 shutdown · 1 single-user · 3 text · 5 graphical · 6 reboot**. Only 3 and 5 relate to X.
- Even on the graphical screen, you can switch to a text console with a combination like **`Ctrl`+`Alt`+`F3`** (which number is the text console differs by distribution). When X has frozen, log in there and clean up.

## DISPLAY — Which Screen to Draw On

```text
   DISPLAY = hostname : display-number . screen-number

      192.168.0.10 : 0 . 0
           │         │   │
           │         │   └── screen number (when there are multiple monitors)
           │         └────── display number (X server number)
           └──────────────── host where the X server is (omit for local)
```

| Value | Meaning |
|----|-----|
| **`:0.0`** | **The first screen of the local computer** |
| `:0` | Screen number omitted — same as `:0.0` |
| `192.168.0.10:0.0` | The screen of the computer at that address |
| `:1.0` | The second X server that was started |

```bash
echo $DISPLAY                          # :0
export DISPLAY=192.168.0.10:0.0        # I will display on that computer's screen
xclock &                               # the clock appears on the other screen
```

- **Omitting the host means local.** That is why you normally see just `:0`.
- To display on a remote screen, you must **set `DISPLAY` on the client side** and **grant access on the server side**. Both are needed.

### The Three Slots One by One

| Slot | Meaning | If omitted |
|----|-----|--------|
| **Host** | The computer where the X server runs | **Local**. It connects through a channel within the computer, not the network |
| **Display number** | **Which X server** on that computer it is. Counted from 0 | **Cannot be omitted** |
| **Screen number** | **Which screen** attached to that X server it is. Counted from 0 | 0 |

- **The colon (`:`) cannot be dropped, but what comes after the dot (`.`) may be.** So `:0` is a valid value, and `0.0` or `0:0` are invalid.
- The display number **ties to the port number.** The X server accepts network connections on **TCP 6000 + display number**. `:0` is port 6000 and `:1` is port 6001.
- Instead of the environment variable, you can also specify it just once with the **`-display` option** — `xclock -display 192.168.0.10:0.0`.

### What Do You Type on Which Computer

What is easy to confuse in remote display is **where you type the commands**. Assume my PC with the screen is 192.168.0.10 and the remote server running the program is 192.168.0.20.

| Place | Role | Command typed |
|------|------|----------|
| **My PC** (192.168.0.10) | **X server** — lends the screen | `xhost +192.168.0.20` |
| **Remote server** (192.168.0.20) | **X client** — runs the program | `export DISPLAY=192.168.0.10:0.0` then `xclock &` |

- In **`xhost`**, write the address of **"the party to let in"**, and in **`DISPLAY`**, write the address of **"where the screen is"**. The two addresses point to opposite sides.
- `DISPLAY` is set on the **side running the program**. It is not set on the side with the screen.

| Message on screen | Cause |
|-------------|------|
| `Error: Can't open display:` (nothing after it) | **`DISPLAY` is not set** — common on a text console or an SSH session without `-X` |
| `No protocol specified` followed by `Can't open display: 192.168.0.10:0.0` | The address is right but the **X server refused access** — no `xhost` or `xauth` permission |
| After a long wait, `Can't open display` | You **cannot reach the X server over the network** — the address is wrong or the X server does not accept network connections |

- For security, the X server on modern distributions is by default started so that it **does not accept network (TCP) connections at all**. Connecting directly with `DISPLAY` and `xhost` is something to **know as a principle, and in practice use the `ssh -X` below.**

## Access Control — xhost and xauth

The X server does not let just anyone open a window on its screen.

| Item | **`xhost`** | **`xauth`** |
|------|-----------|-----------|
| Unit | **Per host (IP)** | **Per user** |
| Method | Adds an address to an allow list | Only those with the **magic cookie** |
| Security | **Weak** | **Strong** |
| Storage | — | `~/.Xauthority` |

```bash
xhost                       # current allow list
xhost +192.168.0.20         # allow only that address
xhost -192.168.0.20         # block that address
xhost +                     # allow everyone  ← dangerous!
xhost -                     # block everyone
xauth list                  # list of magic cookies
```

> ⚠️ **`xhost +` opens your screen to every computer.** Others can peek at your screen or put up fake windows. **Do not use it except for testing.** It appears on the exam as a "security-risky command" too.

- The authentication method `xauth` uses is **MIT-MAGIC-COOKIE-1**. A connection works only if the cookie stored in the `~/.Xauthority` file matches.

### Reading xhost Output

```text
$ xhost
access control enabled, only authorized clients can connect
$ xhost +192.168.0.20
192.168.0.20 being added to access control list
$ xhost
access control enabled, only authorized clients can connect
INET:192.168.0.20
$ xhost +
access control disabled, clients can connect from any host
```

| Command | Access control | Result |
|------|---------|------|
| `xhost` | — | **Only views** the current state and allow list |
| `xhost +address` | Stays on | **Adds** that address to the list |
| `xhost -address` | Stays on | **Removes** that address from the list |
| **`xhost +`** | **Off (disabled)** | **Anyone** can connect |
| **`xhost -`** | **On (enabled)** | Only those in the list can connect |

- **`+` is "open" and `-` is "close".** It is confusing because the result of `xhost +` is `access control disabled`, but it means **"turn off access control = everything is open"**.
- What `xhost` opens is **that whole computer**. If you allow 192.168.0.20, **every user** logged in to that server can access my screen. That is the real content of the phrase "weak security because it is per host".
- `xhost` settings last **only while the X server is on**. They disappear when you log out.

### xauth — Only Those with the Cookie

```text
$ xauth list
mypc/unix:0  MIT-MAGIC-COOKIE-1  5e3c1a9f0b7d4c2e8a6f1d3b9c0e7a42
```

| Slot | Meaning |
|----|-----|
| `mypc/unix:0` | Which display the cookie is for |
| `MIT-MAGIC-COOKIE-1` | Authentication method |
| 32-digit hexadecimal | The **cookie value** — only clients that know this are accepted |

- The X server decides a cookie when it starts and accepts **only clients that present the same value**. The cookie is in `~/.Xauthority`, and this file is **readable only by its owner**, so other users cannot know the value. That is why it becomes **per-user** control.
- To use it from another computer, you must **move the cookie into the `~/.Xauthority` there**. Take it out with `xauth extract` and put it in with `xauth merge`, or write it directly with `xauth add`.
- To change the file to use, specify it with the **`XAUTHORITY`** environment variable.

| `xauth` subcommand | What it does |
|-----------------|--------|
| `list` | View the list of cookies |
| `add` | Add a cookie |
| `remove` | Delete a cookie |
| `extract` · `merge` | Take out to a file · merge in from a file |

## Remote GUI — ssh -X

```bash
ssh -X user@server-address # X11 forwarding
gedit                      # it is the server's program but appears on my screen
```

- SSH **carries the X traffic for you through an encrypted tunnel.** `DISPLAY` is also set automatically.
- **There is no need to open `xhost`**, so it is much safer. It is the standard method for a remote GUI.
- `-Y` is trusted mode and has looser restrictions.

| Method | Security |
|------|------|
| Specify `DISPLAY` after `xhost +` | **Dangerous** |
| **`ssh -X`** | **Safe (encrypted)** |

### What Happens Inside ssh -X

```text
$ ssh -X alice@192.168.0.20
$ echo $DISPLAY
localhost:10.0
$ xclock &
```

```text
   My PC (X server, :0)                         Remote server 192.168.0.20
        ▲                                            xclock
        │                                               │  DISPLAY=localhost:10.0
        │                                               ▼
     ssh client ◄═══ encrypted SSH connection ═══►  fake display :10 made by sshd
```

- The remote server's `DISPLAY` is set not to my PC's address but to **`localhost:10.0`**. This is because `sshd` creates a **fake display number 10 inside the remote server itself**, and passes the X traffic that comes into it to my PC's real X server over the SSH connection.
- Since the X traffic **rides on one SSH connection that is already open**, there is no need to open my PC's X server to the network or to use `xhost`. SSH also arranges the cookie on its own.
- **You must not set `DISPLAY` again by hand.** If you enter with `ssh -X` and then run `export DISPLAY=192.168.0.10:0.0`, you abandon the encrypted path and try a direct connection.

| Condition | Content |
|------|------|
| Remote server side | **`X11Forwarding yes`** in `/etc/ssh/sshd_config` |
| Remote server side | The `xauth` program must be installed |
| My PC side | **An X server must be running** — doing `ssh -X` from a text console leaves no screen to display on |

| Option | Meaning |
|------|-----|
| **`-X`** | Use X11 forwarding (uppercase) |
| `-Y` | Trusted-mode X11 forwarding — looser restrictions |
| `-x` | **Turn off** X11 forwarding (lowercase) |

### Comparing the Three Remote Display Methods

| Item | `DISPLAY` + `xhost` | `DISPLAY` + `xauth` | **`ssh -X`** |
|------|-------------------|-------------------|-------------|
| Unit of permission | Host | User (cookie) | The user who logged in via SSH |
| Traffic encryption | **No** | **No** | **Yes** |
| `DISPLAY` setting | By hand | By hand | **Automatic** |
| X server must allow TCP connections | Needed | Needed | **Not needed** |

- **`xauth` only screens "who connects" and does not hide the traffic.** Only `ssh -X` provides encryption as well.

## Config Files and Commands

### xorg.conf

```text
   /etc/X11/xorg.conf     X server config file

   Section "Files"         font and module paths
   Section "Module"        modules to load
   Section "InputDevice"   keyboard · mouse
   Section "Monitor"       monitor frequencies
   Section "Device"        graphics card
   Section "Screen"        Monitor + Device combination, resolution
   Section "ServerLayout"  overall layout
```

- Nowadays **auto-detection works well, so this file often does not exist at all.** You create it only when needed.
- You can generate a draft with `Xorg -configure`.

```text
   Section "Screen"
       Identifier   "Screen0"
       Device       "Card0"           ← points to the name of a Section "Device"
       Monitor      "Monitor0"        ← points to the name of a Section "Monitor"
       DefaultDepth 24
       SubSection "Display"
           Depth    24
           Modes    "1920x1080"
       EndSubSection
   EndSection
```

- Every section is **opened with `Section "name"` and closed with `EndSection`.** Each section is named with `Identifier`, and other sections point to that name to link up.

| What you want to change | Section to look at |
|-----------|--------|
| **Resolution · color depth** | **`Screen`** (its `Display` subsection) |
| **Graphics card driver** | **`Device`** |
| The monitor's horizontal and vertical **frequencies** | **`Monitor`** |
| **Keyboard · mouse** | **`InputDevice`** |
| Font paths | `Files` |
| **Tying together** the screen and input devices | `ServerLayout` |

- **`Device` is not "devices in general" but the graphics card.** Keyboard and mouse are separate under `InputDevice`. Choosing by the name alone gets it wrong.
- **`Screen` pairs one `Device` with one `Monitor`.** That is why the resolution is written in `Screen`, not in the graphics card section.

| File | What it is |
|------|------|
| **`/etc/X11/xorg.conf`** | The X.org server's config file |
| `/etc/X11/xorg.conf.d/` | A directory where settings are split into fragment files |
| `/etc/X11/XF86Config` | The config file name from the **XFree86 era** |
| `/var/log/Xorg.0.log` | The X server's **log** — the 0 in the middle is the display number (depending on the distribution, it may be left under the user's home) |

- When the graphical screen does not come up, look for **lines starting with `(EE)` in `Xorg.0.log`**. That marks an error (Error). `(WW)` is a warning.

### Frequently Used X Commands

| Command | What it does |
|------|--------|
| **`xdpyinfo`** | X server info (resolution, number of colors) |
| `xwininfo` | Window info — the size and position of the window you click |
| **`xkill`** | **Click an unresponsive window to force-kill it** |
| `xrandr` | Change resolution and monitor layout |
| `xclock`, `xterm`, `xeyes` | Basic X clients for checking operation |

- **After running `xkill`, the cursor turns into an X and it kills the window you click.** Use it to clean up a frozen program.

| Command | What it does |
|------|--------|
| `xset` | **User environment settings** such as keyboard repeat rate, screen saver, and power saving |
| `xsetroot` | Change the color and pattern of the background (root window) |
| `xlsclients` | **List of clients** currently attached to the X server |
| `xprop` | View the **properties** of the window you click |
| `xmodmap` | Change the **key layout** of the keyboard |

| What you want to know · do | Command |
|------------------------|------|
| Resolution and number of colors of the whole screen | **`xdpyinfo`** — the target is the **X server** |
| Size and position of one window | **`xwininfo`** — the target is a **window** |
| **Changing** the resolution, monitor layout | **`xrandr`** |
| Close a frozen window | **`xkill`** |
| Who can connect to my screen | `xhost` · `xauth list` |

- **Tell `xdpyinfo` and `xwininfo` apart by the middle letters of the name** — `dpy` is display (the whole screen), and `win` is window (one window).
- **`xdpyinfo` is for viewing, `xrandr` is for changing.** The word resolution appears on both sides, so look at whether it is "checking" or "changing".
- `xkill` is the X server **cutting off the connection to the client that owns the window**. Unlike `kill` from Week 6, which sends a signal by PID, you **do not need to know the PID**; just point at the window.

> Tomorrow we tie this week's X Window System together on a single sheet.

## 📖 Glossary

- **`startx`**: The command that starts an X session in text mode.
- **`DISPLAY`**: The environment variable that specifies the screen to output to. The format is host:display.screen.
- **`xhost`**: The command that allows or blocks access to the X server per host (IP).
- **`xauth`**: The command that controls access per user using magic cookies.
- **MIT-MAGIC-COOKIE-1**: The authentication method `xauth` uses. The cookie is stored in `~/.Xauthority`.
- **X11 forwarding**: The feature that safely carries X traffic through an SSH tunnel. Used with `ssh -X`.
- **`xorg.conf`**: The X server's config file. Located in `/etc/X11/`.
- **`xkill`**: The command that force-kills the program of the window you click.

## 📝 Practice Questions

**Question 1.** Which `DISPLAY` value specifies the first display and first screen of the local computer?

A) :0.0  
B) 0:0  
C) localhost.0  
D) 0.0.1  

**Answer: A**  
Explanation: `DISPLAY` has the format hostname:display-number.screen-number, and omitting the host means local. So the local first display and screen are written `:0.0`, and it is sometimes written `:0` with the screen number omitted.

---

**Question 2.** Which command starts an X Window session in text mode?

A) xinit -d  
B) xhost  
C) xdpyinfo  
D) startx  

**Answer: D**  
Explanation: `startx` runs an X session when you have logged in by text without a display manager. `xhost` is an access control command, and `xdpyinfo` is a command for checking X server info.

---

**Question 3.** Which of the following is a command to avoid because it is dangerous for security?

A) xhost -  
B) xhost +  
C) xauth list  
D) ssh -X  

**Answer: B**  
Explanation: `xhost +` allows every host to access the X server, so anyone can peek at the screen contents or put up fake windows. `xhost -`, on the contrary, blocks access, and if you need a remote GUI, using the encrypted `ssh -X` is safe.

---

**Question 4.** Which target designates booting into graphical mode in a systemd environment?

A) multi-user.target  
B) rescue.target  
C) graphical.target  
D) emergency.target  

**Answer: C**  
Explanation: `graphical.target` corresponds to the old runlevel 5 and comes up all the way to the graphical login screen. `multi-user.target` is the text mode corresponding to runlevel 3, and `rescue.target` and `emergency.target` are modes for recovery.

---

**Question 5.** Which X command force-kills an unresponsive window by clicking it?

A) xwininfo  
B) xrandr  
C) xdpyinfo  
D) xkill  

**Answer: D**  
Explanation: When you run `xkill`, the cursor changes to an X shape and the program of the window you click is force-killed. `xwininfo` shows window info, `xrandr` adjusts the resolution, and `xdpyinfo` shows X server info.
