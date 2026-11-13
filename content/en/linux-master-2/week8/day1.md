# Day 1 - The Structure and Evolution of the X Window System

## 📌 Key Takeaways

- **The X Window System is the system that handles the graphical environment of Unix and Linux.** It began at **MIT** in 1984.
- **Server and client are reversed.** **The side with the screen, keyboard, and mouse is the X server**, and **the program is the X client**.
- Because it is **network-based**, you can display on your own computer the screen of a program running on another computer.
- The evolution order of X server implementations is **XFree86 → X.org Server → Wayland**.
- The X Window System **does not enforce a look or a way of operating.** That is why a separate **window manager** is needed.

## What Is the X Window System

| Item | Content |
|------|------|
| Origin | **MIT, 1984** (Project Athena) |
| Nature | Both a **system and a protocol** providing a graphical environment |
| Features | **Network-based · platform-independent · does not enforce policy** |

- The official name is the **X Window System**. It is not written in the plural as "X Windows".
- **It is not part of the operating system.** It is an **application** separate from the Linux kernel, so the system works without it. Servers are often run without X.

### Unpacking the Features One by One

A question that asks you to pick "the incorrect feature of the X Window System" flips one of the lines below into a choice.

| Feature | Meaning | Example of a flipped wrong answer |
|------|-----|------------------|
| **Network protocol-based** | Server and client talk through an agreement called the **X protocol**. The method is the same whether on the same computer or another | "It works only within the same computer" |
| **Client/server structure** | The drawing side (server) and the requesting side (client) are **separate programs** | "Programs draw directly to the screen" |
| **Platform-independent** | Not tied to a particular operating system or hardware. It works between **different kinds of machines** too | "It can be used only on Linux" |
| **Does not enforce policy** | It does not fix the look or operation of windows, providing **only the means** | "The window look is fixed as one" |
| **Separate from the kernel** | It is a user-space program | "It is included in the kernel" |
| **Open software** | The source is public so anyone can implement and distribute it | "Only a specific company can implement it" |

- Even if X dies, the kernel stays alive. Being able to **switch to a text console and recover** when the graphical screen freezes is thanks to its separation from the kernel.
- You can see what your current session runs on with **`echo $XDG_SESSION_TYPE`**. It prints `x11` or `wayland`.

## Server and Client Are Reversed

This is an especially confusing part of the X Window System, so it makes a good exam question.

```text
   [ The computer in front of me ]          [ A distant server ]

     X server                                 X client
     screen · keyboard · mouse                the actual program
     (the side with the hardware)             (xterm, gedit ...)
        │                                        │
        │◄──── request to draw on the screen ────┤
        ├───── passes keyboard/mouse input ─────►│
```

| Item | **X server** | **X client** |
|------|----------|----------------|
| What it is | **The side with the display and input devices** | **The application** |
| What it does | Draws on the screen and passes on input | Requests what to draw |
| Where it is | **In front of the user** | Anywhere (remote is possible) |
| Example | The screen of my laptop | `xterm`, `xclock`, a browser |

> It makes sense if you think **"the side that provides the resource (the screen) is the server"**. On the web, the side that holds the data is the server, but in X it is the **side that holds the screen** that is the server. So **the computer in front of me becomes the X server**.

- Thanks to this structure, **the window of a program running on a remote computer can appear on my screen**. This is called **network transparency**.
- Even when the program and the screen are on the same computer, it works in **exactly the same way**.

### The Four Things That Pass Between the Two

```text
   X client (xterm)                              X server (my screen)
        │                                             │
        ├── ① Request   "draw a window here" ────────►│
        │◄─ ② Reply     "that window's size is this" ─┤
        │◄─ ③ Event     "the A key was pressed" ──────┤
        │◄─ ④ Error     "there is no such window" ────┤
```

| Message | Direction | Content |
|--------|------|------|
| **Request** | Client → server | Creating windows, drawing lines and text, asking for info |
| **Reply** | Server → client | The answer to a request that asked for information |
| **Event** | Server → client | **Keyboard and mouse input**, a window being covered or uncovered, etc. |
| **Error** | Server → client | The request could not be processed |

- **Only requests are sent by the client, and the other three are sent by the server.** The keyboard and mouse are attached on the server side, so input always flows **from the server to the client**.
- A client **cannot touch the screen directly.** Even plotting a single dot must be asked of the server. That is why windows from many programs coexist on one screen without overwriting each other.

### Telling Who Is the Server

| Situation | X server | X client |
|------|-------|-------------|
| Run `gedit` on my laptop and display it on my screen | My laptop (its X server program) | `gedit` running on my laptop |
| From a home laptop, connect to the office server and run `gedit`, with the window appearing on the home laptop | **The home laptop** | **`gedit` running on the office server** |
| On a monitorless server, run a graphical installer, with the window appearing on the administrator's PC | **The administrator's PC** | The installer running on the server |
| Computer A's program window shows on computer B's monitor | **B** | A's program |

- There is one tip for telling — **"the side with the monitor where the window is seen" is the X server.** It is not the side with better performance, nor the side where the program runs, nor the machine called "the server".
- So it is common for **the "server computer" to be the X client (the side running it) and "my PC" to be the X server**. This reversal is the material for questions.
- **Multiple clients** attach to one X server at the same time. If ten windows are open, ten clients are connected.

## Evolution

```text
   1984  X Window System        started at MIT
     │
   1987  X11                    the version number still in use today
     │
   1992  XFree86                free implementation for PC Unix. The standard for a long time
     │                          split apart by a license change in 2004
     ▼
   2004  X.org Server           split off from XFree86. The current standard
     │
     ▼
   2008~ Wayland                the next-generation approach meant to replace X
```

| Name | Nature |
|------|------|
| **XFree86** | An X implementation for PCs that was the standard for a long time. It **lost leadership over a license issue** |
| **X.org Server** | An implementation **split off** from XFree86. **The current standard** |
| **Wayland** | A **next-generation display server protocol** that strips away X's complicated structure |

> Questions ask the **evolution order `XFree86 → X.org Server → Wayland`** as is. Memorize the order of the three names.

- **X11** is the **11th version**, released in 1987, and what is used today is still X11. That is why the notation `X11` remains in many places.
- **Wayland is not a new version of X but a replacement.** The structure itself is different, and existing X programs run through a compatibility layer called `XWayland`.

### Sorting the Kinds of Names

The names that appear mixed in the choices are **not the same kind.** First sort out what each name is a name of.

| Name | Kind | One-line description |
|------|------|-----------|
| **X Window System** | The whole system | The name for the protocol and its implementations together |
| **X11** | **Protocol version** | The 11th edition, released in 1987. The `R` in `X11R6` and `X11R7` is the release within it |
| **XFree86** | **X server implementation** (project) | A free implementation for PCs. The 86 in the name comes from the Intel x86 family |
| **X.org Server** | **X server implementation** | The current standard that split off from XFree86 |
| **Wayland** | **Protocol** (different from X) | A new protocol meant to replace X11 |
| **XWayland** | Compatibility layer | An X server that runs on top of Wayland |

- **XFree86 and X.org Server are both "programs that implement X11".** It is not that X11 ended and X.org arrived, but that **the program implementing the same X11 protocol changed**.
- The trigger for moving to X.org Server was XFree86's **license change** in 2004. The new terms were incompatible with the GPL, so the major distributions moved to the X.org side.
- The body managing X's standard has changed too — starting from MIT's X Consortium, it is now handled by the **X.Org Foundation**.

### X and Wayland — What Differs

```text
   X11                                      Wayland
   application (X client)                   application (Wayland client)
        │                                        │
     X server  ◄──►  window manager · compositor    compositor  (display server + window management)
        │                                        │
      kernel · graphics card                    kernel · graphics card
```

| Item | **X11** | **Wayland** |
|------|--------|------------|
| Appeared | 1987 | Started in 2008 |
| What handles the screen | **X server** + a separate window manager | **A single compositor** doubles as both |
| Network transparency | **Built into the protocol** | Not in the protocol itself |
| Existing X programs | Run as they are | Run through **XWayland** |
| Representative implementations | X.org Server | Weston (reference implementation), and the compositors of GNOME and KDE |

- In X, drawing a window goes a full circle: **client → X server → compositor → X server → screen**. Wayland strips out the X server in the middle so that **the client and compositor talk directly**. That is what "stripped away the complicated structure" means.
- In Wayland, **the distinction between display server and window manager disappears.** The compositor does both.
- GNOME on major distributions such as Fedora and Ubuntu uses a Wayland session by default, but **X.org is still used alongside it.** The "current standard X server" on the exam is X.org Server.

## It Does Not Enforce Policy

The X Window System **provides only "how to draw" and does not decide "how it will look".**

```text
   X Window System    provides only the basic functions for drawing windows
      │
      ├── window borders · minimize button · moving?   →  handled by the window manager
      ├── login screen?                                →  handled by the display manager
      └── panel · file manager · integrated environment? →  handled by the desktop environment
```

- That is why Linux has **several environments with different window looks**. This is a big difference from Windows and macOS.
- The distinction among these three (window manager · display manager · desktop environment) is covered **in detail three days from now**.

## Related Terms

| Term | Meaning |
|------|-----|
| **X11** | The 11th version of the X Window System. Still in use today |
| **Network transparency** | The property that a program is displayed on screen the same way whether it is local or remote |
| **XWayland** | A compatibility layer for running existing X programs in a Wayland environment |
| **Display server** | A program that manages screen output and input. X server and Wayland compositors fall under it |

> Tomorrow we cover the layers of libraries and toolkits used to build X clients.

## 📖 Glossary

- **X Window System**: The system that provides the graphical environment of Unix and Linux. Started at MIT in 1984.
- **X server**: The side with the screen, keyboard, and mouse. The computer the user sits at falls under it.
- **X client**: An application that requests that something be drawn on the screen.
- **Network transparency**: The property that the screen of a program run remotely can be displayed exactly like a local one.
- **XFree86**: The project that was the standard X implementation for PCs for a long time.
- **X.org Server**: The current standard X server implementation that split off from XFree86.
- **Wayland**: A next-generation display server protocol meant to replace X.
- **X11**: The 11th version of the X Window System, released in 1987. It is the version still in use today.

## 📝 Practice Questions

**Question 1.** Which of the following is the X server in the X Window System?

A) An application running remotely  
B) A program that wants to open a window on the screen  
C) The user-side computer that has the display and input devices  
D) The window manager that draws window borders and buttons  

**Answer: C**  
Explanation: In the X Window System, the side that provides resources such as the screen, keyboard, and mouse is the server. So the computer the user sits at becomes the X server, and the application that requests that something be drawn becomes the X client. It is the opposite of the usual web server concept, so it is easy to confuse.

---

**Question 2.** Which of the following lists the evolution order of X server implementations correctly?

A) XFree86 → X.org Server → Wayland  
B) X.org Server → XFree86 → Wayland  
C) Wayland → XFree86 → X.org Server  
D) XFree86 → Wayland → X.org Server  

**Answer: A**  
Explanation: XFree86, widely used as the X implementation for PCs, lost leadership over a license change, X.org Server split off and became the current standard, and afterward Wayland, with a newly designed structure, appeared as the next-generation approach.

---

**Question 3.** Which of the following is **not** a correct description of the X Window System?

A) It can display the screen of a remote program over the network  
B) Development began at MIT in 1984  
C) It does not enforce the look or operation of windows  
D) It is included in the Linux kernel and cannot be removed  

**Answer: D**  
Explanation: The X Window System is not part of the kernel but a separate application, so it can be left uninstalled or removed, and server systems are often run without X. Network-based operation and a design that does not enforce policy are typical features of the X Window System.

---

**Question 4.** Which of the following is the next-generation display server protocol designed to replace X?

A) XFree86  
B) Wayland  
C) X11  
D) XCB  

**Answer: B**  
Explanation: Wayland is a display server protocol newly designed by stripping away X's complicated structure. It is a replacement, not a new version of X, and existing X applications run through a compatibility layer called XWayland. X11 is the version number of the X Window System still in use today.

---

**Question 5.** Which property of the X Window System lets the screen of a program run on a remote computer be displayed in the same way as on the local computer?

A) Platform independence  
B) Module independence  
C) Network transparency  
D) Hardware acceleration  

**Answer: C**  
Explanation: Network transparency is the property of the X Window System that a program is displayed on screen with the same protocol whether it is local or remote. Thanks to this, the window of a graphical program run on a server can be shown on the user's computer screen.
