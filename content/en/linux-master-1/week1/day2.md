# Day 2 - Free Software and Distributions: The Ecosystem Built by Licenses

## 📌 Key Takeaways

- Free software (FSF, 1985) emphasizes **ethical freedom**, while open source (OSI, 1998) emphasizes a **pragmatic development methodology**. The code is almost the same.
- **Copyleft** = turning copyright law around to enforce the preservation of freedom. Derivative works must be released under the same license (viral effect).
- The key exam point is the distinction between **GPL** (full disclosure required) / **LGPL** (the app can stay closed when dynamically linked) / **BSD, MIT, Apache 2.0** (no disclosure required).
- The three major distribution families: **Red Hat (RPM + dnf/yum)**, **Debian (DEB + apt)**, **SUSE (RPM, but zypper + YaST)**.
- Package tools come in pairs: **low-level (rpm, dpkg, dependencies handled manually) ↔ high-level (dnf/yum, apt, repository-based and automatic)**.

## Free Software vs. Open Source — Same Code, Different Philosophy

Licenses and distribution families are in scope for the Level 1 exam. The starting point is the fact that "free-of-charge software" and "open source" are two historically and philosophically different movements.

**Free Software**

- Started with the **Free Software Foundation (FSF)**, founded by Richard Stallman in 1985.
- Here "Free" means **freedom, not zero price** — Stallman's famous phrase: "free as in free speech, not as in free beer."
- Its core is four freedoms.
  - **Freedom 0**: The freedom to run the program for any purpose
  - **Freedom 1**: The freedom to study how the program works and modify it (requires access to the source code)
  - **Freedom 2**: The freedom to redistribute copies
  - **Freedom 3**: The freedom to distribute your modified versions

**Open Source**

- Led by the **Open Source Initiative (OSI)** in 1998.
- Eric Raymond and others felt the ideological and political overtones of "free" were keeping companies from participating, so they put forward the more pragmatic, business-friendly term "open source."
- Emphasis: technical excellence and the collaboration model.

What got Stallman started on the free software movement was a trivial incident. During his time at MIT, he wanted to add a feature to a Xerox printer that would notify users of paper jams, but the manufacturer refused to release the source code. The frustration of "I can't fix a tool that's in my own hands" led to a lifelong movement. One small printer became the seed of the huge free software movement.

## Copyleft — The Core Weapon of the GPL

- Ordinary copyright "reserves" rights to prevent copying and modification. **Copyleft** turns copyright law around to **enforce the preservation of freedom**.
- Core rule: **"You may use and modify it freely. But the derivative works you distribute must also guarantee the same freedoms."**
- Whoever receives the freedoms must pass them on to the next person → because of this **viral** nature, if you take and use copyleft code, you become obligated to release your result under the same license.
- The representative license that implements this is the **GPL (GNU General Public License)**.

"Copyleft" is a pun that plays on "Copyright." It flips Right (as in the right-hand side / a right) to Left, meaning that instead of monopolizing rights, it preserves freedom. The "All rights reversed" written on the FSF logo is the same joke.

## Comparing the Major Open Source Licenses

Licenses are broadly divided into the **copyleft family (GPL)** and the **permissive family (BSD, MIT, Apache)**. On the exam, the key is to correctly distinguish whether there is a "derivative work disclosure obligation."

| License | Family | Source disclosure of derivatives | Features |
|---------|------|----------------|------|
| GPL | Strong copyleft | Required (everything) | Forces GPL even onto linked code |
| LGPL | Weak copyleft | Library only | Can be combined with a closed-source app when dynamically linked |
| BSD | Permissive | Not required | Free to use as long as the copyright notice is kept |
| MIT | Permissive | Not required | The most concise; closed-source commercial use is possible |
| Apache 2.0 | Permissive | Not required | Includes a patent protection clause |

- **GPL**: The strongest copyleft. A program that includes or links GPL code must be released as a whole under the GPL. Because the Linux kernel adopted GPLv2, drivers and the like that are integrated into the kernel must in principle follow the GPL.
- **LGPL (Lesser GPL)**: A "weak copyleft" that softens the GPL. It is mainly applied to libraries, and allows closed-source programs to use an LGPL library by **dynamic linking**. However, if you modify the library itself, that part must be disclosed.
  - Why glibc (the C standard library) is LGPL: every program links glibc, so if the GPL were enforced, closed-source programs could not be built on Linux.
- **BSD/MIT**: The representative permissive licenses. "As long as you keep the copyright notice, you may do anything" → you may even turn a modified version into a closed-source commercial product. Companies prefer them. Part of the macOS kernel came from BSD, and countless commercial products contain BSD/MIT code.
- **Apache 2.0**: Permissive like MIT, but its explicit **patent license grant** clause protects users from patent lawsuits by contributors. Adopted by Android, Kubernetes, and others.

```bash
# Check the license information of installed packages
# RPM family
rpm -qi bash | grep License
# Debian family - location of the package copyright document
ls /usr/share/doc/bash/copyright
```

> ⚠️ **Pitfall**: The exam has a trap question: "Must a closed-source program that dynamically links an LGPL library disclose its source?" The answer is **it does not have to**. That is exactly the point of the LGPL. On the other hand, if you link a GPL library, you must disclose everything. Summed up: "dynamic linking + LGPL = can stay closed."

The GPL has versions. GPLv2 (1991) and GPLv3 (2007) are the main ones. GPLv3 prohibits "Tivoization" (using hardware to prevent modification of GPL software) and strengthens the patent clauses. Linus Torvalds objected to some provisions of GPLv3, so the Linux kernel is still tied to **GPLv2**. This is an important license characteristic of the Linux kernel.

## What Is a Distribution

In Day 1 we learned that "Linux is only the kernel." The Ubuntu and CentOS we install are **distributions (distros)**, finished products that bundle the following together.

- The Linux **kernel**
- GNU **system tools** (bash, coreutils, gcc, etc.)
- A **package management system** (install, update, dependency management)
- A **desktop environment** (GNOME, KDE, etc.; omitted in server editions)
- Default **applications** and configuration

- Each distribution has a different philosophy and target audience: servers that put stability first, desktops that quickly adopt the latest technology, learning, security-focused, and so on — hundreds of them.
- What matters on the exam is the **family**. Most distributions branched from three roots, and distributions in the same family have similar package management and directory structures.

## The Red Hat Family — The World of RPM

- A powerhouse in the enterprise server market. RHEL (Red Hat Enterprise Linux) from Red Hat, founded in 1994, is at the center.
- Features: the **RPM (Red Hat Package Manager)** package format + **YUM/DNF**, which resolve dependencies automatically.

| Distribution | Position | Description |
|--------|------|------|
| RHEL | Commercial | Red Hat's paid enterprise product, includes technical support |
| CentOS | Free clone | Free edition based on RHEL source (now moved to CentOS Stream) |
| Fedora | Upstream development | Testbed for the latest technology, RHEL's upstream |
| Rocky/AlmaLinux | Free clone | RHEL-compatible clones that appeared after CentOS changed direction |
| Amazon Linux | Cloud | AWS-optimized RHEL family |

- Package management has two levels.
  - Low-level `rpm`: installs individual `.rpm` files but **cannot resolve dependencies automatically**.
  - High-level `yum` (older) and `dnf` (newer): download packages and their dependencies together from a repository and install automatically.

```bash
# Low-level - install an individual package file (dependencies handled manually)
rpm -ivh package.rpm        # install, verbose, hash
rpm -qa                     # Query all installed packages
rpm -e package              # Remove a package

# High-level - automatic dependency resolution (repository-based)
dnf install httpd           # or yum install httpd
dnf update                  # Update everything
dnf remove httpd
dnf search keyword
```

The name "Fedora" comes from the red fedora hat in the Red Hat logo. Fedora serves as Red Hat's laboratory. Once the latest technology proven here stabilizes, it goes into RHEL. In other words, technology flows down in the order Fedora → RHEL → CentOS (clone).

## The Debian Family — The World of DEB and APT

- A community-driven family that follows the free software spirit most faithfully.
- Started in 1993 by Ian Murdock. The name combines his name with that of his then-girlfriend Debra (Deb + Ian).
- Format/tools: **DEB (.deb)** packages + **APT (Advanced Package Tool)**.

| Distribution | Position | Description |
|--------|------|------|
| Debian | Base | Maximizes stability, the root of every Debian-family distribution |
| Ubuntu | Desktop/server | The most popular distribution, made by Canonical |
| Linux Mint | Desktop | Ubuntu-based, emphasizes ease of use |
| Kali Linux | Security | Debian-based, specialized for penetration testing |
| Raspberry Pi OS | Embedded | Debian-based, for the Raspberry Pi |

- Low-level `dpkg`: handles individual `.deb` files but cannot resolve dependencies automatically.
- High-level `apt` (or `apt-get`): handles even dependencies automatically from a repository.

```bash
# Low-level - individual package files (dependencies handled manually)
dpkg -i package.deb         # Install
dpkg -l                     # List installed packages
dpkg -r package             # Remove
dpkg -L package             # List the files installed by a package

# High-level - automatic dependency resolution (repository-based)
apt update                  # Refresh the repository package list
apt install nginx           # Install
apt upgrade                 # Upgrade
apt remove nginx            # Remove
```

Memorizing the correspondence between the RPM family and the DEB family as a table is very useful for the exam. **Low-level**: `rpm` ↔ `dpkg`. **High-level (automatic dependencies)**: `dnf`/`yum` ↔ `apt`/`apt-get`. Package extension: `.rpm` ↔ `.deb`. Questions asking for this correspondence appear in almost every exam round.

## The SUSE Family — Europe's Powerhouse

- A Europe-centered distribution that started in Germany in 1992.
- It **uses the RPM package format**, sharing the format with the Red Hat family, but uses its own system administration tool **YaST (Yet another Setup Tool)** and its own package manager **zypper**.

| Distribution | Position | Description |
|--------|------|------|
| SLES | Commercial | SUSE Linux Enterprise Server, for enterprises |
| openSUSE | Free | Community edition (Leap: stable, Tumbleweed: rolling release) |

```bash
zypper install apache2      # Install a package on SUSE
zypper update               # Update
yast                        # Integrated text/GUI system configuration tool
```

SUSE uses RPM, but it is generally treated as an independent family rather than classified under Red Hat. This is because the package "format" (.rpm), the package "management tool" (zypper vs. dnf), and the system administration philosophy (YaST) are all different. If a trap question appears on the exam such as "Which package format does SUSE use?", the answer is **RPM**. The family is different, but the format is RPM.

## The Essence of Package Management — Solving Dependency Hell

- The reason low-level (`rpm`, `dpkg`) and high-level (`dnf`, `apt`) tools exist separately is **dependencies**.
- Program A → library B → then C … dependencies get tangled like a chain. If you install things one by one with low-level tools, you fall into **"dependency hell"**, where a person has to find each required dependency and install them in order.
- High-level tools solve this with a central package warehouse called a **repository** and its metadata. With a single `apt install nginx`, every library nginx needs is automatically found and installed together. This is the key reason modern Linux distributions are easy to use.

> ⚠️ **Pitfall**: Getting a "Failed dependencies" error while installing a package with `rpm -ivh` is normal, because low-level tools cannot resolve dependencies. Forcing the install with the `--nodeps` option can break the program, so the exam point is that when dependencies are needed you must use a high-level tool such as `dnf`/`yum`.

Next time, we'll cover the partition design you encounter when actually installing Linux, the GRUB2 bootloader, and the boot process in which the system comes alive from the moment you power it on.

## 📖 Glossary

- **Copyleft**: A device that uses copyright inside out. In exchange for granting freedom, it forces derivative works to pass on the same freedom.
- **GPL**: The strongest copyleft license. If you use this code, you must release your whole result under the GPL.
- **LGPL**: A relaxed version for libraries. If you only dynamically link, you don't have to disclose your app's source.
- **Permissive license**: A license like BSD or MIT under which, as long as you keep the copyright notice, you may turn the code into a closed-source commercial product.
- **Distribution**: A finished product that bundles the kernel + GNU tools + a package manager + applications so it can be installed.
- **RPM**: The package format (`.rpm`) used by Red Hat and SUSE, and also the low-level install command.
- **DEB / dpkg**: The Debian family's package format (`.deb`) and the low-level command that handles it.
- **Repository**: A central warehouse that gathers packages and dependency information. `apt` and `dnf` download from it.
- **Dependency hell**: A situation where a person has to find and install each required library by hand. High-level tools eliminated it.
- **YaST**: SUSE's own integrated system configuration tool. It supports both text mode and GUI.

## 📝 Practice Questions

**Question 1.** Which of the following is a correct description of copyleft and the GPL license?

A) A program that includes GPL code can be distributed as closed source with no obligation to disclose the source
B) The GPL is a strong copyleft license that forces derivative works to guarantee the same freedoms
C) Copyleft is a concept of giving up copyright so that anyone can monopolize rights
D) The GPL is a permissive license that allows any modification as long as the copyright notice is kept

**Answer: B**

Explanation: The GPL is the representative copyleft license, forcing derivative works to guarantee the same GPL freedoms (viral effect). A is wrong. If you include GPL code, you must release the whole thing under the GPL. C is wrong. Copyleft does not give up copyright; it is a concept that turns copyright law around to preserve freedom. D describes permissive licenses such as BSD/MIT, which is the exact opposite of the GPL.

---

**Question 2.** Which license allows a closed-source commercial program to dynamically link a library and still keep its own source code undisclosed?

A) GPL — strong copyleft, the whole linked work must be disclosed
B) LGPL — weak copyleft, the app may stay closed when dynamically linked
C) AGPL — a strengthened GPL that requires source disclosure even for network use
D) GPLv3 — a strengthened copyleft that prohibits Tivoization

**Answer: B**

Explanation: The LGPL (Lesser GPL) is a weak copyleft that allows a closed-source program to use an LGPL library by dynamic linking, and in this case the app's source does not have to be disclosed. glibc is the typical example. A: The GPL requires the whole linked work to be disclosed, so this is not possible. C: The AGPL is, if anything, a stronger license that requires disclosure even for network use. D: GPLv3 is also a strong copyleft, so it does not allow keeping the source closed.

---

**Question 3.** Which is the correct correspondence between the package management tools of the Red Hat family and the Debian family?

A) Low-level rpm ↔ apt, high-level dnf ↔ dpkg
B) Low-level dpkg ↔ dnf, high-level rpm ↔ apt
C) Low-level rpm ↔ dpkg, high-level dnf/yum ↔ apt/apt-get
D) Low-level yum ↔ apt, high-level rpm ↔ dpkg

**Answer: C**

Explanation: At the low level (individual packages, dependencies handled manually), Red Hat's rpm corresponds to Debian's dpkg, and at the high level (repository-based, automatic dependencies), Red Hat's dnf/yum corresponds to Debian's apt/apt-get. A mixes up low-level and high-level. B wrongly pairs dpkg (low-level) with dnf (high-level). D wrongly classifies yum (high-level) as low-level.

---

**Question 4.** Which of the following distribution-to-family pairings is NOT correct?

A) Ubuntu, Linux Mint, and Kali Linux are all Debian family
B) CentOS, Fedora, and Rocky Linux are all Red Hat family
C) openSUSE is SUSE family and uses zypper and YaST
D) Ubuntu uses RPM packages and the dnf package manager

**Answer: D**

Explanation: Ubuntu is Debian family and uses DEB (.deb) packages and the apt package manager. RPM and dnf belong to the Red Hat family, so D is wrong. A is correct. All three distributions are Debian-based. B is correct. All three distributions belong to the Red Hat family of the RHEL ecosystem. C is correct. openSUSE is SUSE family and uses zypper (packages) and YaST (system configuration).

---

**Question 5.** Which is a correct description of SUSE family distributions?

A) They use the DEB package format and manage packages with apt
B) They use the RPM package format but use their own tools, zypper and YaST
C) They have no package management system and can only be installed by compiling from source
D) They are completely identical to Red Hat and are not classified as a separate family

**Answer: B**

Explanation: The SUSE family uses the RPM package format but is an independent family that uses zypper as its package manager and YaST as its system configuration tool. A is wrong. DEB/apt belong to the Debian family. C is wrong. SUSE has a powerful package management system called zypper. D is wrong. They share the RPM format, but the management tools and philosophy differ, so it is treated as a separate family.

---

**Question 6.** Which is a correct description of the meaning of "Free" in the free software movement and its four freedoms?

A) "Free" means free of charge, and free software can never be sold for a fee
B) "Free" means freedom, and it guarantees four freedoms: to run, to study, to redistribute, and to distribute modified versions
C) Free software is a movement that prohibits access to source code to strengthen security
D) The free software movement was first started by the Open Source Initiative (OSI) in 1998

**Answer: B**

Explanation: The "Free" in free software means freedom, not zero price, and its core is four freedoms: running (Freedom 0), studying/modifying (Freedom 1), redistributing (Freedom 2), and distributing modified versions (Freedom 3). A is wrong. Free software can also be sold for a fee ("free speech, not free beer"). C is the exact opposite. Free software guarantees access to the source code. D is wrong. The free software movement was started in 1985 by the FSF (Stallman), and the OSI is a separate open source movement from 1998.

---

