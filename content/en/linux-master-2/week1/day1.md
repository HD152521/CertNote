# Day 1 - Operating Systems and the Kernel: What Linux Does

## 📌 Key Takeaways

- The **kernel** is the core that handles hardware directly, and the **shell** is the interpreter that passes the user's commands to the kernel.
- **"Linux" originally names the kernel.** The complete operating system we use is the kernel plus a collection of GNU tools.
- The kernel's five big jobs: managing **processes, memory, the file system, devices, and the network**.
- The Linux kernel has a **monolithic** structure, and it can attach and detach features as **modules** when needed.
- Check the kernel version with `uname -r`; under an old rule, **an even second number meant a stable version**.

## A Computer Has Four Layers

The fastest way to understand Linux is to draw the **layered structure**.

```text
┌─────────────────────────────────┐
│  Applications                    │  vi, web browser, compiler
├─────────────────────────────────┤
│  Shell                           │  bash, sh, csh — command interpreter
├─────────────────────────────────┤
│  Kernel                          │  Linux itself
├─────────────────────────────────┤
│  Hardware                        │  CPU, memory, disk, network card
└─────────────────────────────────┘
```

- An upper layer **cannot touch the layer below it directly.** If an application wants to write to disk, it has to ask the kernel.
- This request is called a **system call**.
- The reason for this barrier is **stability**. If one program goes wrong, the whole system doesn't collapse.

> Questions asking for "the difference between the kernel and the shell" come up repeatedly in the exam. Just be sure of this: **the shell only interprets and forwards commands; it does not handle hardware directly**.

## The Five Things the Kernel Actually Does

| Job | What it does | Examples |
|------|---------|-----|
| Process management | Decides which program gets the CPU and when | Scheduling, process creation and termination |
| Memory management | Hands out memory to each program and reclaims it | Virtual memory, swap |
| File system | Presents the 0s and 1s on disk as "files and directories" | Mounting ext4, xfs |
| Device management | Provides drivers that operate the hardware | Keyboard, printer, graphics card |
| Network | Handles the rules for sending and receiving packets | TCP/IP stack |

- All five share one thing in common: **"making resources shareable."**
- One-sentence definition of an operating system: **"software that manages hardware resources and provides an interface to users."**

## The Scope of the Name "Linux"

This is where beginners get confused the most.

- **Linux in the narrow sense** = the **kernel** created by Linus Torvalds.
- **Linux in the broad sense** = the **operating system** (= a distribution) that bundles the kernel, GNU tools, and assorted software.

That is why the free software camp argues we should call it **"GNU/Linux."** Commands we use every day like `ls`, `cp`, and `bash` were all made by the **GNU project**, not by the Linux kernel.

## Kernel Architecture: Monolithic vs. Microkernel

| Category | Monolithic kernel | Microkernel |
|------|--------------|-------------|
| Structure | Most functions live inside the kernel | Only minimal functions in the kernel, the rest outside |
| Speed | Fast (calls finish inside the kernel) | Relatively slow (communication overhead) |
| Stability | An error in one part can affect the whole | Problem parts can be isolated |
| Size | Large | Small |
| Examples | **Linux**, Unix | MINIX, Mach |

- **Linux is monolithic.** This single line is an exam point.
- It is not purely monolithic, though. With **loadable kernel modules (LKM)** it can attach and detach features when needed, borrowing some of the microkernel's advantages.
- That's why it is sometimes called a "modular monolithic kernel."

## Reading the Kernel Version

```text
$ uname -r
5.15.0-88-generic
│ │  │
│ │  └── Patch level
│ └───── Minor version within the major version
└─────── Major version
```

- In the old days (before 2.6), the rule was: **an even minor version meant a stable release, an odd one meant a development release**.
  - `2.4` → stable / `2.5` → development
- This rule **disappeared after 2.6.** Today, even/odd has nothing to do with stability.
- The exam still sometimes asks about the **old rule**, so it's worth remembering the sentence "even = stable" itself.

### How Kernels Are Classified Today

After the even/odd rule went away, the official kernel site (kernel.org) classifies versions by **nature**.

| Category | Meaning |
|------|-----|
| **mainline** | The main development line, maintained directly by Linus Torvalds. New features land here |
| **stable** | A stable version that takes a release from mainline and adds **only bug fixes** |
| **longterm** | A **long-term support** version that keeps getting fixes for several years. Distributions mostly pick this |

- The `-88-generic` part after `5.15.0` is a **label added by the distribution**. Even for the same 5.15 kernel, the trailing part differs by distribution.
- The kernel file itself sits under `/boot` with a name like `vmlinuz-version`.

## User Mode and Kernel Mode: The Door a System Call Passes Through

The rule that "an upper layer cannot touch the layer below it directly" is not a mere convention; it is a **distinction enforced by the CPU**.

| Category | User mode | Kernel mode |
|------|----------------------|----------------------|
| What runs here | Applications, the shell, ordinary commands | The kernel, device drivers (modules) |
| Direct hardware access | **Not allowed** | Allowed |
| Memory it can see | Only its own process area | Everything |
| If an error occurs | Only that program dies | The whole system can halt (**kernel panic**) |

Follow what happens when the single line `cat memo.txt` runs, and the layered structure shows up exactly as drawn.

```text
 Shell (bash)  Interprets "cat memo.txt" and launches the cat program
    │
 cat           User mode — asks to "open, read, and write to the screen"
    │            open()      read()        write()      ← system calls
    ▼
 Kernel        Kernel mode — finds the location in the file system and calls the disk driver
    │
 Disk          The actual data is read
```

- The shell only goes as far as **interpreting the command and launching the program**. Reading the disk is done entirely by the kernel, start to finish.
- The shell itself is also an **ordinary program** running in user mode. That's why you can swap bash for zsh and the kernel stays the same.

> ⚠️ **Trap**: "The shell controls the hardware" and "the kernel interprets commands" — both are wrong answer choices with the roles swapped. It is fixed: **interpretation is the shell, control is the kernel**.

## Features of Linux

This is the list that feeds questions in the "Understanding Linux" area asking you to pick "which is NOT a feature of Linux."

| Feature | Meaning |
|------|-----|
| **Multi-user** | Several people can log in and use one system **at the same time** |
| **Multi-tasking** | Runs several programs at once. CPU time is sliced finely and handed out in turn |
| **Excellent portability** | Most of the kernel is written in C, so it moves to PCs, servers, smartphones, even embedded devices |
| **Virtual memory** | When memory runs short, it borrows the disk's **swap** area and uses it like memory |
| **Hierarchical file system** | Every file sits in a tree that branches out from a single `/` (root) |
| **Shared libraries** | Multiple programs share the same library code, saving memory and disk |
| **Virtual consoles** | Switch between several login screens on one monitor (`Ctrl`+`Alt`+`F1`~`F6`) |
| **Strong networking** | The kernel supports TCP/IP out of the box. That's why it is so widely used as a server |
| **Open software** | The kernel source is released under the GPL, so anyone can modify and use it |

- **Multi-user and multi-tasking are different things.** The former means "many people," the latter "many programs."
- Weaknesses are asked about too — because it is open software, **official guarantees of problem resolution are hard to get** (paid support for commercial distributions is the exception), and some commercial programs and hardware don't support Linux.

## Seeing Kernel Modules with Your Own Eyes

The statement "modules are attached and detached" can be confirmed right away with a few commands.

| Command | What it does |
|------|--------|
| `lsmod` | Lists the modules currently loaded in the kernel |
| `modinfo module_name` | Shows a module's description, file location, and dependencies |
| `modprobe module_name` | Loads a module. It **automatically loads any modules it depends on** too |
| `insmod file_path` | Loads just one module file. It does not handle dependencies |
| `rmmod module_name` | Unloads a module |

```text
$ lsmod | head -4
Module                  Size  Used by
isofs                  49152  1
xfs                  1589248  2
e1000                 151552  0
```

- Module files live under `/lib/modules/kernel_version/` and have the extension **`.ko`** (kernel object).
- If `Used by` is not 0, someone is using it, so it can't be unloaded.

## Try It Yourself

```bash
uname -a          # Everything: kernel name, version, architecture
uname -r          # Kernel version only
cat /proc/version # Information the kernel reports about itself
echo $SHELL       # The shell you are using now
```

```text
$ uname -a
Linux ubuntu 5.15.0-88-generic #98-Ubuntu SMP Mon Oct 2 15:18:56 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux
```

With `uname`, each option corresponds to one piece of the output. `-a` simply strings them all together.

| Option | Output | In the example above |
|------|------|----------|
| `-s` | Kernel name | `Linux` |
| `-n` | Hostname (network node name) | `ubuntu` |
| `-r` | Kernel release (version) | `5.15.0-88-generic` |
| `-v` | Kernel build info (build number, date) | `#98-Ubuntu SMP …` |
| `-m` | Hardware architecture | `x86_64` |
| `-o` | Operating system name | `GNU/Linux` |

- The `GNU/Linux` at the very end stands out. The kernel name (`-s`) is `Linux` and the operating system name (`-o`) is `GNU/Linux` — the "narrow sense / broad sense" distinction we saw earlier is split right there in the command output.
- `uname` only tells you about the **kernel**. To see the distribution name and version, use `cat /etc/os-release`.

> Tomorrow we follow where this kernel came from — the lineage from Unix to Linux.

## 📖 Glossary

- **Kernel** : The core of the operating system that controls hardware directly. The original meaning of "Linux."
- **Shell** : A program that interprets the commands the user types and passes them to the kernel. bash is the best-known example.
- **System Call** : The official window through which an application asks the kernel to do work.
- **Monolithic kernel** : A structure where most functions live inside the kernel. Linux belongs here.
- **Microkernel** : A structure that keeps only minimal functions in the kernel and moves the rest outside. MINIX is the classic example.
- **Kernel module (LKM)** : A piece of kernel functionality that can be attached and detached at run time. Device drivers mostly take this form.
- **GNU/Linux** : The precise name for the operating system that combines the Linux kernel and GNU tools.
- **Virtual memory** : A kernel memory-management technique that makes it look as if you are using more space than the actual memory.
- **Kernel mode / user mode** : The execution state that can touch hardware directly, and the one that can't. Applications run in user mode.
- **Virtual console** : A feature for switching between several login screens on a single monitor.

## 📝 Practice Questions

**Question 1.** Which of the following correctly describes the structure of the Linux kernel?

A) It is a microkernel structure that keeps only minimal functions in the kernel  
B) A separate kernel is assigned to each application  
C) There is no kernel, and the shell controls the hardware directly  
D) It is a monolithic structure that includes most functions in the kernel  

**Answer: D**  
Explanation: Linux is a monolithic kernel. Most operating system functions are included inside the kernel, so calls are fast but the size is large. However, it supports loadable kernel modules (LKM), so needed features can be attached and detached at run time, which is why it is also called "modular monolithic." The classic microkernel example is MINIX.

---

**Question 2.** Which of the following best describes the shell?

A) The core of the operating system that controls hardware directly  
B) A command interpreter that interprets the user's commands and passes them to the kernel  
C) The name of a file system that stores files on disk  
D) A submodule of the kernel that handles network packets  

**Answer: B**  
Explanation: The shell is a command interpreter that sits between the user and the kernel, interpreting commands and passing them along. Controlling hardware directly is the kernel's role (A); the shell merely makes requests to the kernel through system calls. bash, sh, csh, ksh, zsh, and so on are shells.

---

**Question 3.** Which of the following is LEAST related to the kernel's main functions?

A) Editing a word processor document  
B) Allocating and reclaiming memory  
C) Process scheduling  
D) Controlling hardware through device drivers  

**Answer: A**  
Explanation: Document editing is the job of an application. The kernel handles resource management across five axes: process management, memory management, the file system, device management, and the network. Applications run on top of the kernel and request the resources they need through system calls.

---

**Question 4.** What is the official channel called that prevents applications from accessing hardware directly and is used to request work from the kernel?

A) Shell script  
B) System call  
C) Kernel module  
D) Daemon  

**Answer: B**  
Explanation: A system call is the interface through which an application requests kernel functionality. Thanks to this structure, even if one program goes wrong, the hardware and the system as a whole are not damaged. A kernel module is a piece of kernel functionality that can be loaded at run time, and a daemon is a process that runs continuously in the background.

---

**Question 5.** Which of the following correctly describes the name "Linux"?

A) It comes from the name of the kernel created by Linus Torvalds  
B) It comes from the name of a shell created by the GNU project  
C) It is a trademark of Bell Labs, which created Unix  
D) It is the name of a company that manages distributions  

**Answer: A**  
Explanation: Linux is the name of the kernel that Linus Torvalds announced in 1991. The complete operating system we use is this kernel plus the GNU project's tools (`ls`, `cp`, `bash`, etc.) and other software, which is why some argue it should be called "GNU/Linux."
