# Day 2 - The Birth of Linux: From Unix to Linus

## 📌 Key Takeaways

- **Unix was created in 1969 at Bell Labs** by Ken Thompson and Dennis Ritchie, and it gained portability when it was **rewritten in the C language** in 1973.
- Unix split into the **BSD family** (Berkeley) and the **System V family** (AT&T).
- The **GNU project (1983, Richard Stallman)** aimed at a free Unix-compatible OS and built all the tools, but its **kernel (HURD) was left unfinished**.
- The **Linux kernel (1991, Linus Torvalds)** began inspired by MINIX, and combined with the GNU tools it became a complete OS.
- **POSIX** is a **standard specification** created so that Unix-family systems are compatible with one another.

## Unix: The Starting Point of Everything

| Year | Event |
|------|------|
| 1969 | **Ken Thompson** starts developing Unix at Bell Labs |
| 1971 | Early Unix — written in assembly |
| 1973 | Unix is rewritten in the **C language** created by **Dennis Ritchie** |
| 1977 | Berkeley begins distributing **BSD** |
| 1983 | AT&T releases **System V** |

- Rewriting it in C was decisive. Assembly has to be rewritten for each CPU, but **C only needs to be recompiled to run on another machine.**
- This property is called **portability**, and it is the biggest reason Unix spread.

### Unix Splits into Two Branches

| Category | BSD family | System V family |
|------|----------|--------------|
| Origin | University of California, Berkeley | AT&T Bell Labs |
| Character | Academic and research-oriented, freely distributed | Commercially oriented |
| Descendants | FreeBSD, OpenBSD, NetBSD, macOS | AIX, HP-UX, Solaris |
| Boot scripts | `/etc/rc.d` style | `/etc/rc.d/init.d` + runlevels |

- Linux is **not** a descendant of either side. It is a kernel **built from scratch** without inheriting Unix code.
- However, its **behavior and command system were modeled on Unix.** That's why it is called "Unix-like."

### Before Unix: Lessons from Multics

- In the 1960s, MIT, General Electric (GE), and Bell Labs were building a huge time-sharing operating system called **Multics** together.
- It was too large and complex, progress was slow, and Bell Labs **pulled out of the project in 1969.**
- Ken Thompson, who had taken part, rebuilt it "small and simple" on a spare small computer, the **PDP-7**, and that became Unix.
- The name itself is a pun twisting the **Multi** (many) in Multics into **Uni** (one). The reflection on complexity is built into the name.

### The Unix Philosophy

The exam scope explicitly lists the "philosophy." The design principles Unix left behind live on in the Linux command system.

| Principle | How it shows up in Linux |
|------|---------------------|
| **Small programs that do one thing well** | `ls` only lists, `sort` only sorts, `wc` only counts |
| **Programs are chained together** | A pipe (`\|`) passes one command's output as the next command's input |
| **Text is the common language** | Command input/output and the config files under `/etc` are all human-readable text |
| **Everything is a file** | Devices like disks and terminals are also handled as files under `/dev` |

```bash
who | wc -l          # Passes the list of logged-in users (who) to line counting (wc -l)
ls /etc | grep release   # Picks only the names containing "release" from the /etc listing
```

```text
$ who | wc -l
3
$ ls /etc | grep release
lsb-release
os-release
```

- They didn't build a separate command to "tell you the number of current users." **Chaining two small tools does the job.** This is the essence of the Unix philosophy.

> 💡 **Concept**: The terms the exam uses for Unix features are **interactive system, multi-user, multi-tasking, high portability, and hierarchical file system**. The near overlap with yesterday's Linux features is because Linux was modeled on Unix.

### Traces of the Two Branches in Linux

Linux is a descendant of neither side, but it **adopted the conventions of both.** The `ps` command for viewing the process list is the classic example.

| Usage | Origin | Feature |
|---------|------|------|
| `ps aux` | **BSD** style | No `-` before the options |
| `ps -ef` | **System V** style | A `-` before the options |

- Both commands mean "show all processes." Linux's `ps` understands both notations.
- Booting traditionally followed System V's **runlevels** (covered in next week's boot lessons).

## The GNU Project: Everything but the Kernel

**Richard Stallman** started it in 1983.

- Goal: to build a **Unix-compatible operating system that anyone can freely use and modify**.
- The name is a recursive acronym for **"GNU is Not Unix."**
- 1985: the **Free Software Foundation (FSF)** is founded; 1989: the **GPL** is released.

By the early 1990s, GNU had completed almost everything an operating system needs.

- The compiler **GCC**, the shell **bash**, the editor **Emacs**, the core command collection **coreutils** (`ls` `cp` `mv` …)
- **Only one thing was missing: the kernel.** GNU's own kernel, **HURD**, dragged along in development.

## The Linux Kernel: A Student's Hobby Project

- In 1991, **Linus Torvalds** of the University of Helsinki in Finland started it.
- The trigger was **MINIX** — a small Unix-like OS that Professor **Andrew Tanenbaum** built for teaching. Its features were limited, so he decided to build his own.
- Version **0.01** was released in September 1991, and the following year the license was changed to the **GPL**, which drew developers from all over the world.
- The mascot is the penguin **Tux**.

![The process of GNU, which had only tools, and Linux, which had only a kernel, coming together to become GNU/Linux](/diagrams/en/gnu-linux-merge.svg)

> This one picture is the answer to "why is it called GNU/Linux?"

### Linux Kernel Timeline

| Period | Event |
|------|------|
| August 1991 | Linus announces on the MINIX newsgroup (`comp.os.minix`) that he is "making an operating system as a hobby" |
| September 1991 | Version **0.01** released |
| October 1991 | Version 0.02 — the first version officially announced on the newsgroup |
| 1992 | License changed to the **GPL** |
| March 1994 | Version **1.0** released |
| 1996 | Version **2.0** released — supports **SMP**, using multiple CPUs. The mascot **Tux** appears |
| December 2003 | Version 2.6 released — the point where the even/odd version rule disappeared |
| 2011 | Version 3.0 released |

- The numbers the exam asks about are usually **1991 (first release)** and **1994 (1.0)**.
- At its first release, it had its own **license that prohibited commercial distribution**. Only after switching to the GPL could companies and distributions take part.

> 📚 **Case**: In 1992, Tanenbaum posted "Linux is obsolete" to the newsgroup. The gist was that **a monolithic kernel is an outdated design and the microkernel is the right one**. Linus rebutted, citing practicality and performance. The "Linux = monolithic, MINIX = microkernel" distinction you learned yesterday is exactly the two sides of this debate.

## POSIX: A Standard That Lets Systems Interoperate

- **POSIX (Portable Operating System Interface)** is an **interface standard for Unix-family operating systems** created by the IEEE.
- Purpose: to make a program written on any Unix-family system **run on other Unix-family systems too**.
- It specifies how system calls, commands, the shell, and so on behave.
- Linux follows POSIX **mostly** but has not received official certification.

Besides POSIX, similarly named standards also appear as options together. Tell them apart by **who is trying to align what**.

| Standard | Created by | What it aims to align |
|------|---------|-----------|
| **POSIX** | IEEE (IEEE 1003) | The **programming interface** of Unix-family OSes — system calls, commands, shell |
| **SUS** (Single UNIX Specification) | The Open Group | The **conditions for using the "UNIX" trademark** |
| **LSB** (Linux Standard Base) | Linux Foundation | Compatibility **among Linux distributions** |
| **FHS** (Filesystem Hierarchy Standard) | Linux Foundation | The **directory structure** such as `/bin`, `/etc`, `/var` |

- "UNIX" is now a **registered trademark** held by The Open Group. Only products that pass certification may be called UNIX.
- So there are two reasons Linux is "Unix-**like**" rather than "Unix" — **it didn't inherit the code, and it didn't get trademark certification.**

## Commonly Mistaken Points

1. **"Unix was written in C from the start"** → It was **assembly** at first. It was rewritten in C in 1973.
2. **"The person who created C is Ken Thompson"** → It's **Dennis Ritchie**. Ken Thompson is the one who started developing Unix.
3. **"Linux was made by modifying MINIX"** → MINIX was only the **trigger**; the code was written anew.
4. **"GNU didn't build a kernel"** → It tried. That is **HURD**, and its completion was merely delayed.
5. **"BSD is a commercial Unix made by AT&T"** → BSD is from **Berkeley**; what AT&T made is **System V**.
6. **"POSIX is a license"** → It is a **standard specification**. Licenses are things like the GPL and BSD.

## The Lineage at a Glance

| Name | Year | Created by | Character |
|------|------|----------|------|
| Unix | 1969 | Ken Thompson, Dennis Ritchie | The original |
| BSD | 1977 | University of California, Berkeley | A Unix branch |
| GNU | 1983 | Richard Stallman | A collection of free software tools |
| MINIX | 1987 | Andrew Tanenbaum | An educational Unix-like |
| Linux kernel | 1991 | Linus Torvalds | A free kernel |

> Tomorrow we cover the ideas that underpinned this flow — free software and open-source licenses.

## 📖 Glossary

- **Unix (UNIX)** : An operating system created at Bell Labs in 1969. The prototype of countless OSes, including Linux.
- **Portability** : The property of being able to run a program on another machine without major changes.
- **BSD** : A Unix family developed at Berkeley. The root of FreeBSD and macOS.
- **System V** : A commercial Unix family created by AT&T. AIX and Solaris belong here.
- **GNU** : A recursive acronym for "GNU is Not Unix." A project aiming at a free Unix-compatible OS.
- **HURD** : The kernel GNU tried to build. Its completion was delayed, and the Linux kernel took its place.
- **MINIX** : An educational Unix-like OS created by Tanenbaum. It was the trigger for Linux development.
- **POSIX** : An IEEE standard specification for compatibility among Unix-family operating systems.
- **Tux** : Linux's penguin mascot.

## 📝 Practice Questions

**Question 1.** Which of the following is the biggest reason Unix was able to spread widely?

A) It was the first to introduce a graphical user interface  
B) Its kernel was designed with a microkernel structure  
C) Microsoft distributed Unix for free  
D) It was rewritten in C, which raised its portability  

**Answer: D**  
Explanation: When Unix was rewritten in Dennis Ritchie's C language in 1973, its portability rose greatly. A program written in assembly has to be rebuilt every time the CPU changes, but one written in C only needs to be recompiled to move to different machines.

---

**Question 2.** Which of the following is NOT a correct description of the GNU project?

A) It was started in 1983 by Richard Stallman  
B) It built tools such as GCC, bash, and Emacs  
C) It completed the HURD kernel and released its own operating system  
D) Its name comes from the recursive acronym "GNU is Not Unix"  

**Answer: C**  
Explanation: The GNU project completed most of the tools an operating system needs, such as the compiler, shell, and editor, but its kernel HURD was delayed in development and was effectively never completed. The Linux kernel, which appeared in 1991, filled that gap, creating the complete operating system GNU/Linux.

---

**Question 3.** Which of the following was the operating system that directly triggered the development of the Linux kernel?

A) MINIX  
B) Solaris  
C) FreeBSD  
D) Windows NT  

**Answer: A**  
Explanation: MINIX is a Unix-like operating system created by Professor Andrew Tanenbaum for teaching. Linus Torvalds used MINIX, felt its functional limits, and began building his own kernel, and the result was Linux kernel 0.01 in 1991.

---

**Question 4.** Which of the following is a System V family Unix?

A) FreeBSD  
B) OpenBSD  
C) Solaris  
D) NetBSD  

**Answer: C**  
Explanation: Unix is divided into Berkeley's BSD family and AT&T's System V family. FreeBSD, OpenBSD, and NetBSD are all BSD family; Solaris, along with AIX and HP-UX, belongs to the System V family.

---

**Question 5.** Which of the following best describes POSIX?

A) A document that specifies the distribution license of the Linux kernel  
B) An interface standard for compatibility among Unix-family operating systems  
C) The name of a non-profit foundation that manages Linux distributions  
D) A type of file system used in Unix  

**Answer: B**  
Explanation: POSIX is a standard established by the IEEE that specifies how system calls, commands, and the shell that Unix-family operating systems must provide should behave. Following this standard makes it easier to move a program written on one Unix family to another. The documents that specify licenses are things like the GPL.
