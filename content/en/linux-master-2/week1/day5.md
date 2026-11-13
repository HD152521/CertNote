# Day 5 - Week 1 Review: The Identity Behind the Name Linux

## 📌 Key Takeaways

- The three layers of **kernel / shell / applications** and the **system calls** between them are this week's backbone.
- Memorize the lineage in the order **Unix (1969) → GNU (1983) → MINIX (1987) → Linux kernel (1991)**.
- For licenses, first split into two branches: **copyleft (GPL)** or **permissive (BSD, MIT)**.
- Tell distribution families apart by the **high-level tool** — `dnf` = Red Hat, `apt` = Debian, `zypper` = SUSE.
- The first exam, "Understanding Linux," has many questions that **pair people, years, and names**. Memorizing the tables whole is the fastest way.

## Lineage Diagram

```text
     1969  Unix           Ken Thompson · Dennis Ritchie (Bell Labs)
       │                  Rewritten in C in 1973 → portability secured
       ├──────────────┬──────────────┐
       ▼              ▼              ▼
   BSD family    System V family   (influenced only)
   FreeBSD          AIX               │
   OpenBSD          HP-UX             │
   macOS            Solaris           │
                                      │
     1983  GNU project   Richard Stallman │  Tools done, kernel (HURD) unfinished
       │                              │
     1987  MINIX        Tanenbaum     │  Educational — inspired Linus
       │                              │
     1991  Linux kernel  Linus Torvalds ◄┘
       │
       └──► GNU + Linux kernel = GNU/Linux → distributions
```

## Pairing People and Years

| Person | What they did | Year |
|------|------|------|
| Ken Thompson | Developed Unix | 1969 |
| Dennis Ritchie | Developed the C language, rewrote Unix | 1972~1973 |
| Richard Stallman | Started the GNU project, founded the FSF, wrote the GPL | 1983 / 1985 / 1989 |
| Andrew Tanenbaum | Developed MINIX | 1987 |
| Linus Torvalds | Developed the Linux kernel | 1991 |

Some questions ask about the **order of years** rather than just the people. Lined up in a single column, the events look like this.

| Year | Event | One-line meaning |
|------|------|----------|
| 1969 | Unix development begins | Dropped Multics's complexity, rebuilt small |
| 1973 | Unix rewritten in C | Portability secured |
| 1977 | BSD distribution begins | Unix splits in two |
| 1983 | GNU project begins · System V released | Start of the free software movement |
| 1985 | FSF founded | The foundation backing GNU |
| 1987 | MINIX announced | An educational microkernel OS |
| 1989 | GPL released | The legal device of copyleft |
| 1991 | Linux kernel 0.01 released | The kernel GNU lacked appears |
| 1992 | Linux kernel adopts the GPL | Trigger for worldwide developer participation |
| 1994 | Linux kernel 1.0 | The first official version |
| 1998 | OSI founded | The term 'open source' appears |

- **GNU (1983) comes before the Linux kernel (1991).** Order-flipping options like "after Linux came out, GNU built the tools" are common.
- **The FSF (1985) and OSI (1998)** are 13 years apart. Free software came first, open source later.

## Kernel and Linux Features

| What's asked | Answer |
|---------|-----|
| The kernel's five big jobs | Managing processes · memory · file system · devices · network |
| The channel applications use to make requests to the kernel | System call |
| Structure of the Linux kernel | Monolithic + loadable modules (LKM) |
| List / load / unload modules | `lsmod` / `modprobe` / `rmmod` |
| The property of many people using it at once | Multi-user |
| The property of running many programs at once | Multi-tasking |
| Multiple login screens on one monitor | Virtual console |
| Borrowing disk when memory runs short | Virtual memory (swap) |

## Unix Philosophy and Standards

- Philosophy: **small programs · connected to each other (pipes) · text as the common language · everything is a file**.
- Tell standards apart by "who is trying to align what."

| Standard | One line |
|------|------|
| POSIX | The **interface** standard for Unix-family systems made by the IEEE |
| SUS | The **trademark certification** criteria for "UNIX" (The Open Group) |
| LSB | A compatibility standard **among Linux distributions** |
| FHS | The **directory structure** standard |

## Contrasting Confusing Pairs

| Category | A | B | Distinguishing criterion |
|------|---|---|-----------|
| Kernel vs shell | Kernel — hardware control | Shell — command interpretation | **Does it touch hardware directly?** |
| Monolithic vs microkernel | Linux, Unix | MINIX, Mach | **Are all the functions inside the kernel?** |
| BSD vs System V | FreeBSD, macOS | AIX, HP-UX, Solaris | **Berkeley or AT&T?** |
| Free software vs open source | FSF, emphasizes ethics | OSI, emphasizes practicality | **Emphasis** (the code lists are nearly the same) |
| Copyleft vs permissive | GPL, LGPL, AGPL | BSD, MIT, Apache | **Must derived works be released too?** |
| GPL vs LGPL | Release even if linked | Exempt if only linking | **Is there a library exception?** |
| RPM vs DEB | Red Hat and **SUSE** | Debian and Ubuntu | Format alone is not enough → **use the high-level tool** |
| Fedora vs RHEL | Testing ground, short cycle | Commercial, long-term support | **Before or after validation?** |

## Looking at Licenses and Distributions Together

Licenses can be lined up by a single question: **"Must you release the source when you modify and distribute?"**

| Strength | License | Scope of release |
|------|---------|----------|
| Strongest | AGPL | Release **even if you only offer a network service** without distributing |
| Strong | GPL | If you distribute, release the **entire combined work** |
| Weak | LGPL | Only the parts of the library you modified. **Your own code that links to it is exempt** |
| Weak | MPL | Only the **modified files** |
| None | BSD · MIT · Apache | No release obligation. Only the copyright notice (Apache includes a patent clause) |

- Also sort out the names divided by price and source availability — **freeware** (free, closed source) / **shareware** (paid after a trial) / **public domain** (no copyright) / **free and open source** (source published, license terms followed).

For distributions, recall in the order **family → format → tool → members**.

| Family | Format | Low-level · high-level | Members |
|------|------|---------------|------|
| Red Hat | `.rpm` | `rpm` · `yum`/`dnf` | Fedora, RHEL, CentOS, Rocky, Alma |
| Debian | `.deb` | `dpkg` · `apt` | Debian, Ubuntu, Mint, Kali |
| SUSE | `.rpm` | `rpm` · `zypper` | SLES, openSUSE (`YaST`) |
| Others | Each its own | `pacman` / `emerge` / `pkgtool` | Arch / Gentoo / Slackware |

- The flow in one line: **Fedora → CentOS Stream → RHEL → Rocky·Alma**, **Debian → Ubuntu → Mint**.

## Practice Judging Answer Choices

The exam demands the ability to tell whether a single sentence is right or wrong. Read the sentence below, judge it yourself first, then check the right-hand side.

| Statement | Verdict | Reason |
|------|------|------|
| The shell controls hardware directly | ✗ | Control is the kernel; the shell only interprets |
| The Linux kernel is a microkernel structure | ✗ | It is monolithic. The microkernel is MINIX |
| Unix was written in the C language from the start | ✗ | It started in assembly and was rewritten in C in 1973 |
| The C language was created by Dennis Ritchie | ○ | Beware of confusion with Ken Thompson |
| The GNU project failed to complete a kernel | ○ | HURD was delayed |
| Solaris is BSD family | ✗ | It's System V family |
| GPL software cannot be sold for money | ✗ | It can be sold. You just have to give the source |
| Freeware is a kind of free software | ✗ | It's only gratis, without the freedom to modify or redistribute |
| A program that only links an LGPL library doesn't have to release its source | ○ | The library exception |
| openSUSE uses RPM packages | ○ | Still, it's not the Red Hat family |
| Fedora is a distribution that rebuilds RHEL | ✗ | The order is reversed. The rebuilds are Rocky·Alma |
| You can learn the distribution name with `uname -r` | ✗ | It shows only the kernel version. Look at `/etc/os-release` |

## Commonly Mistaken Points

1. **"Free software = gratis"** → No. Selling it for a fee is possible. Freedom is about rights, not price.
2. **"If it's RPM, it's Red Hat"** → SUSE uses RPM too. You must tell by looking at `zypper`.
3. **"Linux is a kind of Unix"** → It didn't inherit the code. It is **Unix-like**, modeled only on the behavior.
4. **"GNU made Linux"** → GNU made the tools and Linus made the kernel. The two were combined.
5. **"Even kernel version = stable"** → An old rule from before 2.6. It's irrelevant now, but it still appears on the exam.
6. **"Android is a Linux distribution"** → It shares only the kernel and doesn't use the GNU tools.

## Command Summary

| Command | What it does |
|------|--------|
| `uname -a` | Everything: kernel name, version, architecture |
| `uname -r` | Kernel version only |
| `cat /proc/version` | Detailed information the kernel reports |
| `echo $SHELL` | The current login shell |
| `cat /etc/*-release` | Distribution name and version |

> Next week is about actually installing this operating system — we cover installation types, partitions, file systems, and boot managers.

## 📖 Glossary

- **Unix-like** : An operating system that didn't inherit Unix's code but whose behavior and command system resemble Unix.
- **Portability** : The property of making something run on other platforms without major changes. The reason Unix was rewritten in C.
- **Loadable kernel module (LKM)** : A piece of functionality that can be attached to and detached from the kernel while it runs.
- **Viral** : The property that a work using GPL code must also be released under the GPL.
- **Fixed release** : A distribution model that issues new versions on a set cycle.
- **Rolling release** : A distribution model that updates continuously with no version divisions.

## 📝 Practice Questions

**Question 1.** Which of the following correctly pairs the person who first developed the Linux kernel with the year?

A) Ken Thompson — 1969  
B) Richard Stallman — 1983  
C) Linus Torvalds — 1991  
D) Andrew Tanenbaum — 1987  

**Answer: C**  
Explanation: The Linux kernel was developed in 1991 by Linus Torvalds of the University of Helsinki in Finland. Ken Thompson created Unix in 1969, Richard Stallman started the GNU project in 1983, and Andrew Tanenbaum created MINIX in 1987.

---

**Question 2.** Which of the following best describes the relationship between Linux and Unix?

A) Linux is a derivative that inherited Unix's source code as-is  
B) Linux is a completely different system made with no relation to Unix  
C) Linux is a Unix-like system modeled on Unix's behavior, not its code  
D) Linux is a successor made directly by Bell Labs, which developed Unix  

**Answer: C**  
Explanation: The Linux kernel was written from scratch without inheriting Unix's source code. However, because its command system and behavior were modeled on Unix, it is called "Unix-like." It is not a direct descendant of the BSD family or the System V family.

---

**Question 3.** Which of the following most accurately describes the relationship between the GNU project and the Linux kernel?

A) GNU made the kernel and Linus made the tools  
B) GNU completed the tools but had no kernel, and the Linux kernel filled that place  
C) The Linux kernel is an improvement of HURD, the GNU project's official kernel  
D) The two projects were rivals and have never been combined  

**Answer: B**  
Explanation: The GNU project completed most of the tools an operating system needs, such as GCC, bash, and coreutils, but its kernel HURD was never completed. The Linux kernel, which appeared in 1991, filled that gap and made a complete operating system, which is why it is called GNU/Linux. The Linux kernel was developed independently, unrelated to HURD.

---

**Question 4.** Which of the following groups consists only of copyleft-type licenses?

A) BSD, MIT  
B) MIT, Apache  
C) GPL, LGPL  
D) BSD, Apache  

**Answer: C**  
Explanation: Copyleft is an approach that enforces the same freedoms on derived works, and the GPL family (GPL, LGPL, AGPL) and the MPL belong to it. The LGPL is a weak copyleft with an exception for linking libraries. BSD, MIT, and Apache are permissive licenses that demand little more than a copyright notice.

---

**Question 5.** Which of the following pairings of a distribution and its family is NOT correct?

A) openSUSE — Debian family  
B) Rocky Linux — Red Hat family  
C) Ubuntu — Debian family  
D) AlmaLinux — Red Hat family  

**Answer: A**  
Explanation: openSUSE is in the SUSE family. The SUSE family uses the same RPM package format as the Red Hat family but is distinguished by using `zypper` as its high-level management tool. Ubuntu is Debian-based, and Rocky Linux and AlmaLinux are Red Hat family distributions that aim for RHEL compatibility.

---

**Question 6.** Which of the following is the best way to check the name and version of the distribution installed on the current system?

A) `uname -r`  
B) `cat /proc/cpuinfo`  
C) `echo $SHELL`  
D) `cat /etc/*-release`  

**Answer: D**  
Explanation: Files such as `os-release` and `redhat-release` under `/etc` record the distribution name and version. `uname -r` shows only the kernel version, so it can't tell you the distribution; `echo $SHELL` shows the login shell, and `/proc/cpuinfo` shows CPU information.
