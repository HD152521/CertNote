# Day 4 - Remote GUI: VNC and the Client-Server Reversal of the X Window System

## 📌 Key Takeaways

- **The client-server relationship in X Window is the exact opposite of common sense.** The **machine in front of the user, which has the screen, keyboard, and mouse, is the X server**, and the **application that requests drawing is the X client**.
- **VNC port = 5900 + display number** (`:1` → 5901). It transmits the screen wholesale as pixels, and since its encryption is weak, it is **paired with an SSH tunnel**.
- **`DISPLAY`** decides "which screen to send the picture to" — `:0` is local, `host:0` is remote, and with `ssh -X` it is usually `localhost:10.0`.
- Two access controls: **xhost (per host/IP, coarse)** vs **xauth (magic cookie, per user, precise)**.
- **`xhost +` with no argument allows everyone and is extremely dangerous.** A safe remote GUI is `ssh -X` (encrypted tunnel + automatic xauth).

## Remote Desktop — VNC, Which Transmits the Whole Screen

- **VNC (Virtual Network Computing)** : A screen-sharing technology that shows the remote computer's screen as-is on my screen and sends my keyboard and mouse input to the remote machine.

| Component | Role |
|----------|------|
| VNC server | Runs on the remote (target) computer and transmits its own screen |
| VNC viewer (client) | Runs on the computer in front of the user, displaying and operating the remote screen |
| RFB protocol | The protocol VNC uses to exchange screen and input |

- In VNC, **a port is assigned per display number.**

```text
VNC default port = 5900 + display number
  :0  → 5900
  :1  → 5901
  :2  → 5902
```

```bash
# Server side: install and run the TigerVNC server
dnf install tigervnc-server
vncserver :1                 # Start the server on display 1 (port 5901)
vncpasswd                    # Set the VNC connection password
vncserver -kill :1           # Stop the server

# Client side: connect with a viewer
vncviewer 192.168.1.10:1     # or 192.168.1.10:5901
```

> ⚠️ **Trap**: The VNC port is **5900 + display number**. `:1` is 5901 and `:2` is 5902. A choice stating "display 1 is 5900" is wrong (that's :0). This +number calculation is the key.

VNC is a "send the whole screen" approach like RDP (Windows). Because it compresses and sends the screen's pixels, it brings over the entire desktop as-is, unlike X forwarding, which sends only individual windows. However, VNC itself has weak encryption, so in practice it is usually **carried over an SSH tunnel** for safe use.

The reason VNC is paired with an SSH tunnel is that the RFB protocol's encryption is poor. If you open a tunnel with `ssh -L 5901:localhost:5901 user@host` and connect with `vncviewer localhost:5901`, the pixel data passes through the SSH encrypted tunnel and becomes safe. "VNC + SSH tunnel" is the standard combination in practice.

## The X Window System — The Foundation of the Linux GUI

- The Linux graphical environment is a structure in which a desktop environment such as GNOME or KDE sits on top of the **X Window System (X11)**.
- What's unique about X: it **abstracted "drawing" into a network protocol**.

| Component | Role |
|----------|------|
| X server | **Manages the hardware** such as screen, keyboard, and mouse, and receives drawing requests and actually draws |
| X client | An application (terminal, browser, etc.) that asks the X server "draw it like this" |
| Window manager | Manages windows: borders, moving, minimizing, etc. (a kind of client) |
| Display manager | Provides the graphical login screen (gdm, lightdm) |

### Client-Server Reversal — The Most Important Concept

```text
[Monitor and keyboard in front of the user = X server] ←─ drawing requests ─ [Application = X client]
        (the side with the screen is the server)                      (the side asking for the picture is the client)
```

- It is the exact opposite of common sense.
  - **X server** = the **machine in front of the user** that has the screen and input devices (hardware).
  - **X client** = an **application**, near or far, that requests "draw this window."

**Key distinction**: Why is it reversed? Because the X server is "the side providing the drawing service," and the application is "the side using (the client of) that service." It stays faithful to the general principle that whoever provides the service is the server — you just need to understand that "the service provided = drawing the screen." "The side with the screen = X server" is the signal for the correct answer.

> ⚠️ **Trap**: A choice saying "the program run on the remote server is the X server" is wrong. Even when running remotely, the application is always the **X client**, and the screen in front of me where its picture is displayed is the **X server**. A choice that flips this reversal is the trap.

## The DISPLAY Environment Variable — Specifying Where to Draw

- An X client knows **which X server (which screen) to draw to through the `DISPLAY` environment variable**.

```text
DISPLAY format = host:display_number.screen_number
  :0           → local display 0
  :0.0         → monitor 0 of local display 0
  192.168.1.5:0 → display 0 of remote host 192.168.1.5
```

```bash
# Check the current DISPLAY
echo $DISPLAY
# :0

# Direct output to a remote X server (draw on the remote display)
export DISPLAY=192.168.1.5:0
xclock                       # Now a clock appears on the screen of 192.168.1.5
```

DISPLAY is the address that tells an X client "which screen should I send that picture to." Specify `:0` for local, and `host:0` to put it on a remote screen. If you use SSH X11 forwarding (`ssh -X`), this DISPLAY is automatically set to a value like `localhost:10.0` and is delivered safely through the tunnel.

**Key distinction**: If DISPLAY is `:0` it is local, and if it is `hostname:0` it is remote. In SSH X11 forwarding, a display in the 10s such as `localhost:10.0` is usually assigned, because SSH creates a virtual X display at the end of the tunnel and connects to it. DISPLAY is the address of the screen to send the picture to.

## xhost and xauth — Access Control for the X Server

- It would be a problem if anyone could pop windows up on my screen, so the X server has an **access control mechanism**.
- You must **distinguish the two methods**.

| Tool | Method | Description |
|------|------|------|
| xhost | Host-based | Allows/blocks X server access per host (IP) |
| xauth | Cookie-based | Per-user authentication with a magic cookie (MIT-MAGIC-COOKIE) |

```bash
# xhost — per-host control
xhost +192.168.1.5      # Allow X access for this host
xhost -192.168.1.5      # Block this host
xhost +                 # Allow all hosts (dangerous! weak security)
xhost -                 # Return to default authentication
xhost                   # Show the current access list

# xauth — magic cookie-based control
xauth list              # List the currently registered authentication cookies
xauth add ...           # Add a cookie
```

`xhost +` (a + with no argument) is an extremely dangerous command that allows X access from all hosts. Anyone can capture my screen or intercept keystrokes. It shows up in the exam as an example of a "security-risky command." Conversely, `xhost -` turns off host-based permission and returns to default authentication.

**Key distinction**: xhost is **coarse control per host (IP)**, and xauth is **precise control per user with a magic cookie**. xhost permits every user on the same host, so its security is weak, while xauth permits only the specific user holding the cookie, so it is safer. That's why SSH X11 forwarding uses the xauth cookie method.

In practice, bringing up a GUI with the combination `export DISPLAY=remote:0` + `xhost +` can lead to a security incident. That's why today, instead of plaintext X forwarding, the standard is `ssh -X` (or `-Y` when trusted), which handles the encrypted tunnel + xauth cookie automatically. Summarize it as "safe remote GUI = ssh -X."

### Try It Yourself — Bringing Up a Remote GUI with X Forwarding

```bash
# Bring up a remote program on my screen via SSH X11 forwarding
ssh -X alice@192.168.1.10
echo $DISPLAY          # localhost:10.0 (set automatically by forwarding)
xclock                 # Runs remotely but is displayed on my screen
xeyes                  # Test another X client
```

## Pre-Exam Checklist

- VNC port = 5900 + display number (:1 → 5901)
- X server = the machine in front of the user with the screen and input devices, X client = the application (reversal)
- DISPLAY = the address of the screen to send the picture to (`:0` local, `host:0` remote)
- xhost = per host, xauth = per magic cookie
- `xhost +` (no argument) allows everything and is extremely dangerous
- Safe remote GUI = `ssh -X` (X11 forwarding, automatic xauth)

## 📖 Glossary

- **VNC** : A remote desktop technology that transmits the remote screen as-is, pixel by pixel, and sends input back.
- **RFB protocol** : The protocol VNC uses to exchange the screen and input. Its own encryption is weak.
- **Display number** : A screen identifier like `:0` or `:1`. The VNC port is determined by adding 5900 to it.
- **X Window System (X11)** : The foundation of the Linux GUI. It abstracted drawing into a network protocol.
- **X server** : The side that manages the screen, keyboard, and mouse and "provides the drawing service." It's the machine in front of the user.
- **X client** : An application that uses that service and requests "draw it like this." It's a client even when running remotely.
- **Window manager** : A kind of X client in charge of window borders, moving, and minimizing.
- **Display manager** : A program providing a graphical login screen, such as gdm or lightdm.
- **`DISPLAY`** : The address of the screen to which an X client sends its picture. The format is `host:display_number.screen_number`.
- **xhost** : Coarse control that opens and closes X access per host (IP). It permits every user on the same host.
- **xauth / MIT-MAGIC-COOKIE** : A precise authentication method that permits only the specific user holding the cookie.
- **`xhost +` (no argument)** : An extremely dangerous command that allows all hosts. It makes screen capture and keystroke interception possible.
- **X11 forwarding (`ssh -X`)** : A feature that displays a remote application's GUI on my screen through the SSH encrypted tunnel. It handles the xauth cookie automatically.

## 📝 Practice Questions

**Question 1.** Which correctly describes the roles of the X server and X client in the X Window System?

A) The X server is the application, and the X client is the machine in front of the user that has the screen

B) The X server is the machine in front of the user that manages the screen, keyboard, and mouse, and the X client is the application that requests drawing

C) The X server runs only on the remote host, and the X client runs only locally

D) The X server and X client always operate only on the same computer

**Answer: B**

Explanation: X Window has a reversed structure: the machine in front of the user that has the screen and input devices (hardware) is the X server, and the application that requests "draw this" is the X client. A describes the two exactly backwards, C fixes the locations wrongly, and D denies the key point that X can operate separated over a network. "The side with the screen = X server."

---

**Question 2.** What TCP port is used by default when a VNC server is run on display `:2`?

A) 5900

B) 5901

C) 5902

D) 5920

**Answer: C**

Explanation: The VNC port is 5900 + display number, so `:2` is 5902. A (5900) corresponds to `:0`, B (5901) to `:1`, and D (5920) doesn't fit the calculation rule. Applying the formula "5900 + display number" exactly is the key.

---

**Question 3.** Which environment variable specifies the target X server (screen) to which an X client outputs its picture?

A) `TERM`

B) `DISPLAY`

C) `PATH`

D) `XAUTHORITY`

**Answer: B**

Explanation: The `DISPLAY` environment variable tells an X client which X server (screen) to output to, in `host:display_number` format. A (TERM) is the terminal type, C (PATH) is the executable search path, and D (XAUTHORITY) is the path of the authentication cookie file, so none specify the output screen. "DISPLAY = the address of the screen to send the picture to" is the key.

---

**Question 4.** Which of the following X access control commands is extremely risky for security and not recommended?

A) `xhost +192.168.1.5` — allow only a specific host

B) `xhost +` — allow X access from all hosts

C) `xhost -192.168.1.5` — block a specific host

D) `xauth list` — list the authentication cookies

**Answer: B**

Explanation: `xhost +` with no argument allows X server access from all hosts, an extremely dangerous command that lets anyone capture the screen or intercept keystrokes. A allows only a specific host, so it is relatively safe, C is a block, and D is a simple listing and not dangerous. Remember "xhost + (no argument) = allow all, dangerous".

---

**Question 5.** Which remote access method transmits the entire desktop screen of a remote computer pixel by pixel so you can operate it as-is?

A) SSH text shell access

B) VNC remote desktop

C) FTP file transfer

D) Telnet

**Answer: B**

Explanation: VNC is a remote desktop method that uses the RFB protocol to transmit the remote screen pixel by pixel and send input back. A (SSH shell) and D (Telnet) are text-based remote access, and C (FTP) is file transfer, so none is GUI screen sharing. "Whole-screen transmission = VNC" is the key.

---

**Question 6.** Which correctly states the difference in X access control between xhost and xauth?

A) xhost is magic cookie-based, and xauth is host-based

B) xhost controls per host (IP), and xauth authenticates per user with a magic cookie

C) Both control only per host, with no difference

D) xhost controls file transfer, and xauth controls screen transmission

**Answer: B**

Explanation: xhost is coarse control per host (IP), while xauth does precise per-user authentication with MIT-MAGIC-COOKIE. A describes the two exactly backwards, C denies the difference between them, and D ignores that both are X access control tools. "xhost = host, xauth = cookie" is the key.

---

**Question 7.** Which correctly describes the behavior when a remote program is run using SSH X11 forwarding (`ssh -X`)?

A) The GUI window of the program run remotely is displayed on the screen in front of the user through the encrypted tunnel

B) The program is displayed only on the remote screen and can't be seen locally

C) DISPLAY is always fixed at `:0`, so only local programs run

D) X11 forwarding transmits only text and doesn't support a GUI

**Answer: A**

Explanation: `ssh -X` safely displays the GUI of the X client (program) run remotely on the X server (screen) in front of the user through the SSH encrypted tunnel and the xauth cookie. B is the opposite of forwarding's purpose, in C the DISPLAY is usually set to `localhost:10.0`, and D denies that X11 forwarding is a feature for GUIs. "ssh -X = safely put the remote GUI on my screen."

---
