# Day 1 - Operating Systems and Linux: What the Kernel Does

## 📌 Key Takeaways

- Operating system = **resource management + abstraction**. Its four core functions are process, memory, file, and device (I/O) management.
- User-mode (Ring 3) programs cannot touch the hardware directly. They ask the kernel mode (Ring 0) to do it for them via a **system call**.
- **Linux is a monolithic kernel** — but with LKMs, drivers can be loaded and removed dynamically without recompiling.
- The shell is a command interpreter, and it runs commands in the order **fork() → exec() → wait()**. The default Linux shell is bash.
- Strictly speaking, "Linux" refers to **the kernel only**. Ubuntu and CentOS are **distributions** that bundle the kernel with GNU tools.

## What Is an Operating System — Resource Manager and Abstraction Layer

The Level 1 exam doesn't test command memorization; it asks "why does this command behave this way?" at the kernel level. The starting point is the definition of an operating system.

- Definition: **software that manages hardware resources and provides those resources to applications through abstraction**.
- **Resource management**: Resources are limited. A CPU core runs only one instruction at a time, memory capacity is fixed, and disk I/O speed has its limits. If hundreds of programs made demands at random, the system would freeze, so the operating system divides resources in time and space and allocates them fairly and efficiently.
- **Abstraction**: An application programmer doesn't need to know whether the SSD is SATA or NVMe, or whether the RAM is DDR4 or DDR5. Just call the standard interface `open()`, `read()`, `write()` and the operating system handles the real hardware.

| Resource | Managed by (kernel subsystem) | Key function |
|------|---------------------------|-----------|
| CPU | Process scheduler | Decides which process runs, when, and for how long |
| Memory | Memory manager (uses the MMU) | Virtual memory, paging, swap |
| Storage | Filesystem / block I/O layer | File and directory abstraction, disk scheduling |
| I/O devices | Device drivers | Control hardware such as keyboards, networks, and disks |
| Network | Network stack (TCP/IP) | Sending and receiving packets, socket interface |

> 💡 **Concept**: The four core functions of an operating system are **process management, memory management, file management, and device (I/O) management**. Adding the user interface (shell/GUI) and security/permission management makes six functions. The Level 1 exam often asks about each function together with the kernel subsystem responsible for it.

## Kernel Mode and User Mode — The Protection Boundary

- The **kernel** is the core code that sits closest to the hardware and holds final authority over all resources.
- If every program touched the hardware directly, a single malicious or buggy program could wipe the disk or corrupt another program's memory → modern CPUs provide **privilege levels** at the hardware level.
- x86 has protection rings Ring 0 through Ring 3, and **Linux uses only two of them**.

| Mode | Ring | Privileges | Who runs in it |
|------|----|------|-----------|
| Kernel mode (privileged mode) | Ring 0 | Can execute all CPU instructions and access all memory regions | Kernel code |
| User mode (unprivileged mode) | Ring 3 | Can execute only a restricted set of instructions | Ordinary applications |

- For a user-mode program to write to disk or send data over the network, it must ask the kernel to "do it for me" → this is a **system call**.

```bash
# Let's watch the system calls a program makes, using strace
strace -c ls /tmp
# Statistics for system calls such as write, read, openat, close, mmap are printed
```

- Even a simple command like `ls` makes dozens of system calls (openat, read, write, close, stat, etc.).
- The moment of switching from user mode to kernel mode is called a **mode switch** (a kind of context switch), and it incurs some overhead.

A system call is not a simple function call. It is a hardware event in which the CPU raises its privilege level from Ring 3 to Ring 0. In the past the `int 0x80` software interrupt was used, but modern x86-64 Linux uses the faster `syscall` instruction. Because of this switching cost, high-performance programs use buffering to reduce the number of system calls.

## Kinds of Kernels — Monolithic vs. Microkernel

There are two main philosophies of kernel design, and both are in scope for the Level 1 exam.

| Category | Monolithic kernel | Microkernel |
|------|--------------|-------------|
| Structure | Puts the filesystem, drivers, network stack, and scheduler all in one kernel space (a single address space) | The kernel keeps only the minimum (IPC, basic scheduling, memory management). Filesystems and drivers are separate services in user space |
| Communication | Function calls | Message passing between services (IPC) |
| Advantages | Fast | High stability and modularity |
| Disadvantages | A bug in one part can bring down the whole kernel; the code becomes huge | Can be slow due to IPC overhead |
| Typical examples | **Linux** | MINIX, GNU Hurd |

- Linux is monolithic, but it supports **Loadable Kernel Modules (LKMs)**, absorbing some of the modularity that is the microkernel's strength.
- Thanks to this, drivers can be dynamically inserted and removed without recompiling the kernel.

```bash
lsmod                    # List currently loaded kernel modules
modinfo e1000            # Show information about a specific module
sudo modprobe vfat       # Load a module (dependencies are resolved automatically)
sudo rmmod vfat          # Remove a module
uname -r                 # Show the running kernel version
```

In 1992, a famous debate (the Tanenbaum–Torvalds debate) took place on Usenet between Professor Andrew Tanenbaum, the author of MINIX, and Linus Torvalds, over "monolithic kernels are obsolete vs. microkernels are too slow." Tanenbaum criticized Linux as "an obsolete design," but in the end monolithic Linux came to dominate the world. It is often cited as a case where practicality beat academic elegance.

## The Shell — The Interpreter Between User and Kernel

- The **shell** is the interpreter that lets the user talk to the kernel, and it is a **command interpreter**.
- When you type `ls -l`, the shell interprets it → finds and runs the appropriate program → shows the result to the user.
- Origin of the name: it wraps around the kernel like a "shell."

| Shell | Developer / origin | Features |
|----|-----------|------|
| sh (Bourne Shell) | Stephen Bourne (1977) | The first standard Unix shell, the prototype of shell scripting |
| csh (C Shell) | Bill Joy | Borrowed C language syntax, introduced history and aliases |
| ksh (Korn Shell) | David Korn | sh-compatible plus csh features merged in |
| bash (Bourne Again Shell) | Brian Fox (GNU) | An extended version of sh, the default Linux shell |
| zsh | Paul Falstad | bash-compatible with powerful auto-completion |
| tcsh | Extension of csh | csh plus command-line editing |

- The default shell on Linux is almost always **bash**. "Bourne Again Shell" is a typical GNU pun on "born again" — the original Bourne Shell reborn.

```bash
echo $SHELL              # Show the current login shell
cat /etc/shells          # List of usable shells registered on the system
chsh -s /bin/zsh         # Change the login shell to zsh (updates /etc/passwd)
echo $0                  # Name of the shell currently running
```

- Each user's default shell is recorded in the **last field** of `/etc/passwd`.
- Example: `user:x:1000:1000:User:/home/user:/bin/bash` → the final `/bin/bash` is that user's login shell.

> ⚠️ **Pitfall**: The exam asks for `chsh` as "the command to change the default shell," and the new shell must be one registered in `/etc/shells`. Also, `chsh` does not take effect immediately; it applies **from the next login**. To use a different shell right away in the current session, simply type the shell name (`zsh`) to launch a subshell.

## How the Shell Works — fork and exec

When a user types `ls`, the shell goes through the following steps. This process shows the operating system's process creation mechanism exactly as it is.

1. **Parsing**: Splits the input string into the command and arguments, and expands wildcards (`*`), variables (`$HOME`), and quotes.
2. **fork()**: Clones itself to create a child process. At this point the parent (shell) and the child have identical code and data.
3. **exec()**: The child process replaces its own memory image with the `ls` program via the `execve()` system call.
4. **wait()**: The parent (shell) waits until the child finishes, then collects the child's exit status.

- The `fork-exec-wait` model is one of the most elegant designs in Unix — every program execution happens through two steps: "clone, then replace."

If you append `&` to a command (`sleep 100 &`), the shell does not `wait()` and returns the prompt immediately. This is background execution. Conversely, if the parent dies while it is waiting, the child becomes an **orphan process** and is adopted by init (PID 1). If the child dies but the parent does not collect its exit status, it becomes a **zombie process**.

## The Birth and Philosophy of Unix — The Root of Everything

- In **1969**, at Bell Labs in the United States, Ken Thompson and Dennis Ritchie created Unix on a PDP-7 minicomputer. It was originally written in assembly.
- In **1973**, Unix was rewritten in the **C language** created by Dennis Ritchie → writing it in a high-level language made porting to other hardware easy, and Unix spread rapidly across many platforms.

The biggest legacy Unix left behind is not code but **philosophy**.

- **"Do one thing and do it well"** — combine small tools to get big jobs done.
- **"Everything is a file"** — devices, process information, and even network sockets are treated like files.
- **"Connect programs with pipes"** — connect the output of one program to the input of another.

```bash
# Combine small tools with pipes (|) to perform a complex task
cat /etc/passwd | grep "/bin/bash" | wc -l
# passwd output → filter only bash shell users → count lines
```

- Each tool (`cat`, `grep`, `wc`) does only one thing, but chained with pipes they create a new task: "count the users who use the bash shell." This is the essence of the Unix philosophy.

The name Unix (UNIX) is a pun poking fun at its predecessor, MULTICS (Multiplexed Information and Computing Service). As a reaction to MULTICS being too complex and huge, they pursued simplicity and called it "UNICS (Uniplexed)," which became UNIX. The drive toward simplicity is engraved in the name.

## The Birth of Linux — Linus Torvalds and GNU

- 1980s: Unix became commercialized and expensive, and its source code was closed.
- **1983**: Richard Stallman started the **GNU Project** — aiming for a free, Unix-compatible operating system.
- GNU completed almost every component — the compiler (gcc), the shell (bash), the core utilities (coreutils) — but the heart, the **kernel (GNU Hurd)**, was never finished because of the complexity of the microkernel design.
- **1991**: Linus Torvalds, a 21-year-old student at the University of Helsinki in Finland, was not satisfied with MINIX, the operating system used for learning, and started building his own kernel as a hobby. The post he made to the comp.os.minix newsgroup on August 25 became legendary.

> "Hello everybody out there ... I'm doing a (free) operating system (just a hobby, won't be big and professional like gnu) ..."

- The hobby project that "wouldn't be big and professional" became the most widely used operating system kernel in the world.
- Linus's kernel + GNU's tools = **GNU/Linux**. This is why Stallman insists it should be called "GNU/Linux" rather than "Linux" — only the kernel is Linus's, and most of the rest of the system tools are products of GNU.

Strictly speaking, "Linux" refers to **the kernel only**. What we install and use, like Ubuntu or CentOS, is a **distribution** that bundles the Linux kernel + GNU tools + a package manager + applications. In exam blanks like "Linux is ( )", the answer is often "the kernel."

- The license change is also an important exam fact: in 1991 it was first released under its **own license**, not the GPL → **from version 0.99 in 1992 it switched to the GPL (GNU General Public License)**.
- Adopting the GPL triggered an explosion of participation by developers worldwide and built today's Linux. Licensing details are covered in Day 2.

Next time, we'll look at the licenses that made Linux free and the distribution families that split off as a result.

## 📖 Glossary

- **Kernel**: The heart of the operating system. The highest-privilege core code that handles hardware resources directly.
- **System call**: The gateway through which a user program asks the kernel to perform a privileged operation on its behalf.
- **Mode switch**: The moment the CPU privilege rises from user mode (Ring 3) to kernel mode (Ring 0). It has a cost.
- **Monolithic kernel**: A design that packs nearly all functions, such as the filesystem and drivers, into a single kernel. Linux belongs here.
- **Microkernel**: A design that keeps the kernel minimal and splits the rest into user-space services. Stable but can be slow.
- **LKM (Loadable Kernel Module)**: A component that can be inserted and removed without recompiling the kernel. Handled with `lsmod` and `modprobe`.
- **Shell**: A program that interprets and runs the commands the user types. The Linux default is bash.
- **fork()/exec()**: The call that clones a process, and the call that swaps the cloned process for a different program.
- **Zombie process**: A process that has finished but whose parent has not collected its exit status, so only its trace remains.
- **Distribution**: A package that bundles the Linux kernel with GNU tools, a package manager, and applications into something installable.

## 📝 Practice Questions

**Question 1.** In an operating system, what is the mechanism by which a user-mode program requests the kernel to perform privileged operations such as disk I/O or network communication?

A) Interrupt handler
B) System call
C) Device driver
D) Context switch

**Answer: B**

Explanation: A user-mode (Ring 3) program cannot control the hardware directly, so it asks the kernel (Ring 0) to perform privileged operations on its behalf through a system call. A: An interrupt handler is a kernel routine that runs when a hardware/software interrupt occurs; it is not the request mechanism itself. C: A device driver is kernel code that controls specific hardware, not a channel for user requests. D: A context switch is the CPU swapping out the running process, which is a different concept from requesting privileges.

---

**Question 2.** Which statement best describes the design approach of the Linux kernel and its characteristics?

A) It is a microkernel, and all drivers run in user space using message passing
B) It is a monolithic kernel, but supports dynamic extension through Loadable Kernel Modules (LKMs)
C) It is a hybrid kernel with a structure completely identical to Windows NT
D) It is an exokernel, and user applications implement all functions directly

**Answer: B**

Explanation: Linux is a monolithic kernel that keeps its core functions in a single address space, but through LKMs (Loadable Kernel Modules) drivers and the like can be loaded and removed dynamically without recompiling, so it also has modularity. A describes a microkernel such as GNU Hurd. C: Hybrid kernel is a classification for macOS (XNU) and Windows NT, and it is not identical to Linux. D: The exokernel is a research concept unrelated to Linux.

---

**Question 3.** Which is the correct order of the standard Unix process-creation model that the shell goes through when executing the command `ls` typed by the user?

A) exec() → fork() → wait(), replacing the child first and then cloning
B) wait() → fork() → exec(), waiting first and then cloning and replacing
C) fork() → exec() → wait(), cloning, then replacing the image, with the parent waiting for termination
D) fork() → wait() → exec(), cloning, then waiting, then replacing

**Answer: C**

Explanation: The shell clones itself with fork() to create a child process, the child replaces its own memory image with the ls program using exec() (execve), and then the parent shell waits for the child to finish with wait() and collects its exit status. A is impossible because the order is reversed — you cannot replace before cloning. B doesn't hold because there is nothing to wait for before cloning. D is logically inconsistent because if the parent waits for the child before exec, the child has not yet become ls.

---

**Question 4.** Which of the following is the default login shell on Linux, whose name is an abbreviation of "Bourne Again Shell"?

A) csh — a C-syntax-based shell created by Bill Joy
B) ksh — an sh-compatible extended shell created by David Korn
C) bash — an sh-extended shell created by Brian Fox of the GNU Project
D) zsh — a shell with powerful auto-completion created by Paul Falstad

**Answer: C**

Explanation: bash stands for "Bourne Again Shell"; it is GNU's shell extending the original Bourne Shell (sh), and it is used as the default login shell in most Linux distributions. A: csh stands for C Shell and was created by Bill Joy, but it is not a default shell. B: ksh is the Korn Shell, which combines features of sh and csh, but it is not the Linux default shell. D: zsh is powerful but often requires separate installation, and it is not an abbreviation of "Bourne Again."

---

**Question 5.** Which of the following is NOT a correct description of the Unix philosophy "Everything is a file"?

A) Devices can be accessed like files under /dev and controlled through a read/write interface
B) Process information can be read as files under /proc to check system state
C) Various resources can be handled through a consistent file interface (open/read/write/close), which simplifies design
D) It means that all data must be stored only as physical files on disk

**Answer: D**

Explanation: "Everything is a file" is an abstraction philosophy of handling various resources — devices, processes, sockets, and so on — through a consistent, file-like interface; it does not mean that all data is physically stored on disk. Virtual filesystems such as /proc and /sys exist only in memory. A is correct as a description of device files in /dev. B is correct as a description of the /proc virtual filesystem. C is correct, as simplifying design through a consistent interface is the heart of the philosophy.

---

**Question 6.** Which statement about the history of Linux is correct?

A) Linus Torvalds completed and released the GNU Hurd kernel in 1991
B) The Linux kernel was distributed only under the GPL license from the start and has never changed
C) The GNU Project completed most of the tools but its kernel was unfinished, so it was combined with the Linux kernel
D) Linux is an operating system made by copying the Unix source code as is

**Answer: C**

Explanation: Richard Stallman's GNU Project completed most of the tools — the compiler (gcc), the shell (bash), coreutils, and so on — but its kernel (Hurd) was unfinished, and Linus's Linux kernel filled that gap, giving birth to GNU/Linux. A is wrong. What Torvalds created was the Linux kernel, not Hurd. B is wrong. Linux switched from its early own license to the GPL in 1992. D is wrong. Linux did not copy the Unix source; it is a newly written Unix-compatible kernel.

---

