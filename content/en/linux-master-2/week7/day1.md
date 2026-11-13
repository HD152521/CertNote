# Day 1 - Package Management (1): RPM and YUM

## 📌 Key Takeaways

- A package is **a single file that bundles a program together with its installation info**. The format differs by distribution.
- Linux packages split into the **RPM family (Red Hat, CentOS, Fedora, SUSE)** and the **DEB family (Debian, Ubuntu)**.
- The tools come in two layers: the **low-level tool (`rpm`) cannot resolve dependencies on its own**, while the **high-level tool (`yum`) can.**
- Memorize four `rpm` options: **`-i` install, `-U` upgrade, `-e` erase, `-q` query**.
- **DNF is the successor to YUM**, and the SUSE family uses **zypper**.

## What Is a Package

```text
   package = executables + config files + docs + install info (dependency list)
```

- In the past you had to download the source and compile it yourself. A package does that work in advance and **distributes the result as a bundle**.
- **Dependency** — for a program to run, other libraries must be present first. The package records this relationship.

| Problem | Meaning |
|------|-----|
| **Dependency problem** | Installation is blocked because a required package is missing |
| **Dependency hell** | To install A you need B, to install B you need C... and it goes on endlessly |

## The Two Families

| Item | **RPM family** | **DEB family** |
|------|------------|------------|
| Extension | **`.rpm`** | **`.deb`** |
| Distributions | **Red Hat, CentOS, Fedora, SUSE** | **Debian, Ubuntu, Mint** |
| Low-level tool | **`rpm`** | **`dpkg`** |
| High-level tool | **`yum`, `dnf`** | **`apt`, `apt-get`** |

- Questions ask **which distribution belongs to which family** directly. It is in scope that **Ubuntu is in the Debian family**, so it uses `.deb`.
- RPM originally stood for **Red Hat Package Manager**; today it is expanded as RPM Package Manager.

### Low-Level vs. High-Level

```text
   High-level (yum · dnf · apt)
      │  downloads from repositories and resolves dependencies automatically
      ▼
   Low-level (rpm · dpkg)
      │  just installs or removes the one file you give it
      ▼
   System
```

| Item | Low-level | High-level |
|------|-------|-------|
| Handles | **A single file** | **A repository** |
| **Dependencies** | **Cannot resolve them on its own** | **Resolves them automatically** |
| Examples | `rpm`, `dpkg` | `yum`, `dnf`, `apt` |

> **This distinction is the heart of this unit.** If asked "Which tool resolves dependencies automatically?", the answer is the **high-level tool (yum, apt)**.

## rpm — The Low-Level Tool

```bash
rpm -ivh package.rpm      # install (install, verbose, hash)
rpm -Uvh package.rpm      # upgrade (installs if not present)
rpm -e package-name       # erase (erase)
rpm -qa                   # all installed packages (query all)
rpm -q package-name       # is that package installed?
rpm -ql package-name      # list of files the package installed (list)
rpm -qi package-name      # package info (info)
rpm -qf /path/file        # which package owns this file (file)
rpm -V package-name       # tamper check (verify)
```

| Option | Meaning |
|------|-----|
| **`-i`** | **Install** (install) |
| **`-U`** | **Upgrade** — also installs if not present |
| `-F` | Upgrade — **only if already installed** (freshen) |
| **`-e`** | **Erase** (erase) |
| **`-q`** | **Query** (query) |
| `-v` / `-h` | Verbose / show progress (#) |
| `--nodeps` | Ignore dependencies and force ahead |

- **Difference between `-i` and `-U`** — `-U` installs fresh if the package is absent, but `-F` updates only if it is already present.
- **`rpm` does not resolve dependencies.** If a required package is missing, it prints an error and stops.
- **`-v` and `-h` only change how output is displayed**, not what the command does. It is customary to combine three letters, as in `-ivh` and `-Uvh`.
- **Kernel packages are customarily installed with `-i`, not `-U`.** `-U` removes the old version, so if the new kernel fails to boot, the old kernel you would fall back to is gone.

### What the Screen Looks Like When Dependencies Block You

```text
# rpm -ivh httpd-2.4.6-97.el7.x86_64.rpm
error: Failed dependencies:
        httpd-tools = 2.4.6-97.el7 is needed by httpd-2.4.6-97.el7.x86_64
        /etc/mime.types is needed by httpd-2.4.6-97.el7.x86_64
```

- `rpm` **only tells you what is missing** and does not fetch it. Above, the `httpd-tools` package and a package that provides the `/etc/mime.types` file must be present first.
- Removal is blocked the same way. Trying to remove something other packages rely on with `rpm -e` gives an `is needed by (installed) …` error.

| Response | Command | Assessment |
|------|------|------|
| Install the missing package first | `rpm -ivh httpd-tools-….rpm` | The orthodox way, but that package may require yet another one |
| **Leave it to the high-level tool** | `yum install httpd` | **Recommended** — it pulls the needed packages from the repository too |
| Ignore and force ahead | `rpm -ivh --nodeps file.rpm` | It installs, but **may not run** |

| Force option | Meaning |
|----------|-----|
| `--nodeps` | **Skips the dependency check** (for both install and erase) |
| `--force` | **Overwrites and installs** even if the package or files are already installed |
| `--test` | Does not actually install; **only checks whether there would be a problem** |

### Install Takes a File Name, Erase Takes a Package Name

```text
# rpm -q httpd
httpd-2.4.6-97.el7.x86_64
# rpm -e httpd-2.4.6-97.el7.x86_64.rpm
error: package httpd-2.4.6-97.el7.x86_64.rpm is not installed
# rpm -e httpd
# rpm -q httpd
package httpd is not installed
```

| Task | What you pass | Why |
|------|-------------|------|
| Install `-i` · upgrade `-U` `-F` | **Package file** (`….rpm`) | It is not on the system yet, so you must hand over the file |
| Erase `-e` · query `-q` · verify `-V` | **Package name** (`httpd`) | Refers to something already installed and registered in the RPM database |
| Query `-qp` | **Package file** | Looks inside a file **before** it is installed |

- Information about installed packages is recorded in the **RPM database (`/var/lib/rpm`)**. The `rpm -q` family reads this database.
- When `rpm -e` succeeds, it **prints nothing.** Silence means it worked.

### The Letters After `-q`

| Option | What it asks | Argument |
|------|--------|------|
| **`-qa`** | **All** installed packages (all) | None |
| **`-qi`** | Package **info** — version, description, install time (info) | Package name |
| **`-ql`** | **List of files** the package installed (list) | Package name |
| `-qc` | Only the **config files** among them (config) | Package name |
| `-qd` | Only the **doc files** among them (doc) | Package name |
| **`-qf`** | The **package that owns** this file (file) | File path |
| `-qR` | What the package **requires** (requires) | Package name |
| `-qp` | Targets a **file before installation** — combine as `-qpi`, `-qpl` | `.rpm` file |

```text
# rpm -qa | grep httpd
httpd-2.4.6-97.el7.x86_64
httpd-tools-2.4.6-97.el7.x86_64
# rpm -qf /etc/httpd/conf/httpd.conf
httpd-2.4.6-97.el7.x86_64
```

- **`-ql` and `-qf` point in opposite directions.** `-ql` goes **package → files**, and `-qf` goes **file → package**. Questions put the two side by side in the choices.
- `-qa` prints hundreds of lines, so you usually filter it with `grep`. With `-q` alone you must know the exact name, but `-qa | grep` finds a package from just part of the name.

### Reading `-V` Verification

```text
# rpm -V httpd
S.5....T.  c /etc/httpd/conf/httpd.conf
```

- It **compares the file now** against the values recorded at install time. **No output means nothing has changed.**
- A letter in a position marks the item that differs — **`S` size, `5` content (hash value), `T` modification time**, `M` permissions, `U` owner, `G` group. A dot (`.`) means unchanged.
- The `c` in the middle means the file is a **config file**. Admins are expected to edit config files, so the result above is not a problem. A `5` on an executable is something to suspect.

### Reading a Package File Name

```text
   httpd - 2.4.6 - 97 . el7 . x86_64 . rpm
     │       │      │     │      │      │
     │       │      │     │      │      └── extension
     │       │      │     │      └───────── architecture (x86_64, i386, noarch)
     │       │      │     └──────────────── distribution (el7 = RHEL 7)
     │       │      └────────────────────── release number
     │       └───────────────────────────── version
     └───────────────────────────────────── package name
```

- Questions ask about the **name-version-release.architecture.rpm** structure directly.
- **`noarch`** means a package independent of CPU architecture (docs, scripts).
- The **version is the edition number of the program itself**, and the **release is how many times the distribution has repackaged that same version**. If the program stays the same and only a security patch is added and reissued, only the release goes up.
- Some package names contain hyphens. `httpd-tools-2.4.6-97.el7.x86_64.rpm` is **read from the right** — strip the architecture, release (`97.el7`), and version (`2.4.6`), and what remains, `httpd-tools`, is the name.

| Architecture slot | Meaning |
|-------------|-----|
| `x86_64` | 64-bit Intel/AMD |
| `i386` · `i686` | 32-bit Intel family |
| **`noarch`** | Independent of architecture |
| `src` | **Source package** before compilation (`.src.rpm`) |

## yum — The High-Level Tool

```bash
yum install httpd          # install (dependencies automatic)
yum remove httpd           # remove
yum update                 # update everything
yum update httpd           # only a specific package
yum list installed         # installed list
yum search keyword         # search
yum info httpd             # info
yum repolist               # repository list
yum clean all              # clean cache
```

- It downloads what it needs from a **repository** on its own and **installs the dependency packages together**.
- Repository settings live in `.repo` files under **`/etc/yum.repos.d/`**.

### Reading a Repository Config File

```text
# /etc/yum.repos.d/CentOS-Base.repo
[base]
name=CentOS-$releasever - Base
baseurl=http://mirror.centos.org/centos/$releasever/os/$basearch/
enabled=1
gpgcheck=1
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-CentOS-7
```

| Entry | Meaning |
|------|-----|
| `[base]` | The **repository ID**. One bracketed block is one repository |
| `name` | Human-readable description |
| **`baseurl`** | The **repository address** to fetch packages from |
| **`enabled`** | **1 = in use, 0 = off** |
| **`gpgcheck`** | If 1, **checks the signature** of packages |
| `gpgkey` | Location of the public key used for the check |

| Location | Role |
|------|------|
| `/etc/yum.conf` | **Global** YUM settings |
| **`/etc/yum.repos.d/*.repo`** | **Per-repository** settings |
| `/var/cache/yum` | **Cache** of downloaded lists and packages — emptied by `yum clean all` |
| `/var/log/yum.log` | **Log** of installs and removals |

- The file name **must end in `.repo`** to be read. To turn a repository off temporarily, you do not need to delete the file; just change it to `enabled=0`.

### Other Subcommands

| Command | What it does |
|------|--------|
| `yum check-update` | **Only checks** whether there is anything to update |
| `yum localinstall file.rpm` | Installs a **file you already downloaded**, filling in dependencies from the repository |
| `yum provides /path/file` | Find the **package that provides** that file |
| `yum grouplist` · `groupinstall` | View · install a **bundle (group)** of packages |
| `yum erase` | Same as `remove` |
| `yum history` | History of operations so far |
| `yum -y install httpd` | Answers **yes to everything** — proceeds without confirmation |

### rpm and yum Side by Side

| Task | `rpm` | `yum` |
|--------|-------|-------|
| Install | `rpm -ivh file.rpm` | `yum install name` |
| Upgrade | `rpm -Uvh file.rpm` | `yum update name` |
| Remove | `rpm -e name` | `yum remove name` |
| Installed list | `rpm -qa` | `yum list installed` |
| Info | `rpm -qi name` | `yum info name` |
| Which package owns a file | `rpm -qf file` | `yum provides file` |
| Dependencies | **You handle them** | **Automatic** |
| Where the material comes from | The **file** I hand over | The **repository** |

- **`rpm` gives instructions with options (hyphen + letter), while `yum` uses English words.** In the choices, mixed notations such as `yum -i` or `rpm install` are wrong.
- `yum` also ends up installing RPM packages internally. That is why things installed with `yum` show up in `rpm -qa` as they are. **The two are not rivals but upper and lower layers.**

| Tool | Where it is used |
|------|--------|
| **`yum`** | CentOS 7, RHEL 7 and earlier |
| **`dnf`** | **Successor to YUM** — Fedora, RHEL 8 and later |
| **`zypper`** | **SUSE** family |

- **`dnf` has nearly the same command structure as `yum`.** You use it as in `dnf install`.
- A trap that appears: **SUSE is in the RPM family, but its tool is `zypper`**.
- DNF stands for **Dandified YUM**. On RHEL 8 and later the `yum` command still exists, but it is **really just a name that calls `dnf`**.
- `zypper` is used similarly — `zypper install`, `zypper remove`, `zypper update`.

| Symptom | Cause | Check / fix |
|------|------|----------|
| Install stops with `Failed dependencies` | Low-level tools cannot resolve dependencies | Install with `yum install` |
| `rpm -e file.rpm` says `is not installed` | Removal uses the **package name** | `rpm -e httpd` |
| `rpm -q` says `is not installed` though you definitely installed it | The name is not exact | Filter `rpm -qa` with `grep` |
| `yum install` cannot find the package | No repository holding that package exists or it is off | `yum repolist`, `enabled` in the `.repo` |
| You want to know if a config file was edited | — | `rpm -V package-name` |

> Tomorrow we cover the Debian family's `dpkg` and `apt`, and how to compile source yourself.

## 📖 Glossary

- **Package**: A distribution unit that bundles program files and installation info into one.
- **Dependency**: The relationship with other packages that a package needs in order to work.
- **RPM family**: The family of distributions that use `.rpm`. Red Hat, CentOS, Fedora, SUSE.
- **Low-level tool**: A tool that handles a single package file and does not resolve dependencies. `rpm`, `dpkg`.
- **High-level tool**: A tool that uses repositories and resolves dependencies automatically. `yum`, `dnf`, `apt`.
- **Repository**: A server that holds packages. Configured in `/etc/yum.repos.d/`.
- **`dnf`**: The next-generation package management tool that replaced YUM.
- **`zypper`**: The high-level package management tool used in the SUSE family.

## 📝 Practice Questions

**Question 1.** Which of the following distributions uses the `.rpm` package format?

A) Ubuntu  
B) CentOS  
C) Debian  
D) Linux Mint  

**Answer: B**  
Explanation: CentOS is in the Red Hat family, so it uses the `.rpm` format and manages packages with `rpm` and `yum`. Ubuntu and Linux Mint are derived from Debian, so they use the `.deb` format with `dpkg` and `apt`.

---

**Question 2.** Which option of the rpm command is used to remove a package?

A) -i  
B) -U  
C) -q  
D) -e  

**Answer: D**  
Explanation: `-e` is short for erase and removes an installed package. `-i` is install, `-U` is upgrade, and `-q` is the query option for checking whether something is installed or looking up information.

---

**Question 3.** Which of the following tools resolves dependency problems automatically and downloads and installs packages from a repository?

A) yum  
B) rpm  
C) dpkg  
D) tar  

**Answer: A**  
Explanation: `yum` is a high-level tool that uses repositories, so it downloads and installs the other packages needed for the installation as well. `rpm` and `dpkg` are low-level tools that handle only the single package file they are given, so they cannot resolve dependencies on their own.

---

**Question 4.** In `httpd-2.4.6-97.el7.x86_64.rpm`, what does `x86_64` represent?

A) Package version  
B) Release number  
C) Architecture  
D) Distribution name  

**Answer: C**  
Explanation: An RPM package name has the structure name-version-release.architecture.rpm, and `x86_64` indicates the CPU architecture the package targets. `2.4.6` is the version and `97` is the release number; packages independent of CPU architecture carry `noarch`.

---

**Question 5.** Which of the following is the high-level package management tool used on SUSE Linux?

A) apt  
B) zypper  
C) dpkg  
D) yum  

**Answer: B**  
Explanation: SUSE uses the `.rpm` format but uses `zypper` as its high-level tool. `yum` and `dnf` are used in the Red Hat family, and `apt` and `dpkg` are used in the Debian family.
