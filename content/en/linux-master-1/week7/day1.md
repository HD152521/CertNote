# Day 1 - Package Management: RPM/YUM/DNF and DEB/APT, Both Families at a Glance

## 📌 Key Takeaways

- Installing a package is not just unpacking an archive — it means **recording in a database what was installed, where, and in which version**. The same file unpacked with `tar` is not an installation, but unpacked with `rpm -i` it is.
- The backbone is **2 layers × 2 families**. The low-level tools (rpm, dpkg) handle only a single package file and cannot resolve dependencies automatically, while the high-level tools (yum/dnf, apt) fetch dependencies automatically from repositories.
- Red Hat family = `.rpm` + rpm/yum/dnf, Debian family = `.deb` + dpkg/apt. The commands map 1:1 — `rpm -ivh ↔ dpkg -i`, `yum install ↔ apt install`, `rpm -qa ↔ dpkg -l`.
- The 3 big exam traps: `apt update` is not an installation but an **update of the package list (index)**; the direction of `rpm -qf` (file→package) versus `rpm -ql` (package→files); and the case of dpkg `-l` (installed list) versus `-L` (file list).
- Removal splits too — `dpkg -r` leaves the configuration files behind, while `dpkg -P` (Purge) removes the configuration as well. `rpm -e` makes no such distinction.

## RPM — The Low-Level Package Tool of the Red Hat Family

- The **Red Hat family** (RHEL, CentOS, Rocky, Fedora) uses `.rpm` packages and the `RPM`/`YUM`/`DNF` tools.
- `rpm` (Red Hat Package Manager) is the most basic tool for installing, removing, and querying a single `.rpm` file.
- The package file name itself carries information.

```bash
# httpd-2.4.6-97.el7.x86_64.rpm
#  └name  └version └release └distro └architecture
```

Install, remove, and upgrade are done with a **single option (-i/-U/-F/-e) + helper options (-v, -h)**.

```bash
rpm -ivh httpd-2.4.6-97.el7.x86_64.rpm   # install + verbose + hash progress bar
rpm -Uvh httpd-2.4.6-98.el7.x86_64.rpm   # upgrade (installs fresh if not present)
rpm -Fvh httpd-2.4.6-98.el7.x86_64.rpm   # Freshen (updates only what is already installed)
rpm -e httpd                              # erase (remove) — package name, not file name
```

The decisive difference between `-i` (install) and `-U` (Upgrade) is **how an existing version is handled**. `-i` stops with an "already installed" error if the package is already there, whereas `-U` removes the old version and replaces it with the new one. On top of that, `-U` installs the package fresh even if it was never installed. That is why `-Uvh` is the most common choice in practice. `-F` (Freshen) goes one step further: it updates **only packages that are already installed** and leaves uninstalled packages alone.

Queries start with `-q`. This is where people easily get confused.

```bash
rpm -qa                # list of all installed packages (all)
rpm -q httpd           # whether a specific package is installed + its version
rpm -qi httpd          # detailed information (information)
rpm -ql httpd          # list of files installed by that package (list)
rpm -qf /usr/sbin/httpd  # which package this file belongs to (file)
rpm -qc httpd          # configuration files only (config)
rpm -V httpd           # verify whether anything was altered since installation (Verify)
```

| Option | Meaning | Common form |
|------|------|----------------|
| `-i` | install | `rpm -ivh pkg.rpm` |
| `-U` | Upgrade (installs if absent) | `rpm -Uvh pkg.rpm` |
| `-F` | Freshen (installed only) | `rpm -Fvh pkg.rpm` |
| `-e` | erase (remove) | `rpm -e pkg` |
| `-v -h` | verbose + progress bar (#) | used together when installing |
| `-qa` | full list | `rpm -qa \| grep ...` |
| `-ql` | file list of a package | where was it installed? |
| `-qf` | trace file→package | `rpm -qf /path` |

`rpm -qf` (file→package) and `rpm -ql` (package→files) are **queries in opposite directions**. "Who installed this file?" is `-qf`; "What did this package install?" is `-ql`. An answer choice that swaps the two is wrong. Another trap: the `q` (query) must not be missing — `rpm -f` is not a valid combination.

> ⚠️ **Trap**: `rpm -ivh` **cannot resolve dependencies automatically**. If package A requires B, it stops with a "Failed dependencies: B is needed" error. You can force it to ignore this with `--nodeps`, but that may break the system and is not recommended. Automatic dependency resolution is exactly why YUM/DNF, covered next, exist.

```bash
# Try it yourself — rpm query practice (on a RHEL/CentOS family system)
rpm -qa | wc -l                # number of installed packages
rpm -qa | grep kernel          # kernel-related packages
rpm -qi bash                   # details of the bash package
rpm -ql coreutils | head       # files installed by coreutils
rpm -qf /bin/ls                # which package does ls belong to?
```

## YUM / DNF — High-Level Tools That Resolve Dependencies Automatically

- **YUM** (Yellowdog Updater Modified): appeared to solve `rpm`'s **dependency hell**. Its successor is **DNF** (Dandified YUM).
- The command set is nearly identical, so replacing `yum` with `dnf` works in most cases. From RHEL 8 on, the default is DNF, and `yum` is a symbolic link to dnf.
- The key difference is that it **pulls in dependencies automatically from a repository**. It downloads every needed package from the repository URLs defined in `/etc/yum.repos.d/*.repo` and installs them all at once.

```bash
yum install httpd          # install httpd + all required dependencies automatically
yum remove httpd           # remove (taking dependencies into account)
yum update                 # update all packages
yum update httpd           # update only a specific package
yum search keyword         # search names and descriptions
yum info httpd             # package information
yum list installed         # list of installed packages
yum repolist               # list of enabled repositories
yum clean all              # clean the cache
yum groupinstall "Development Tools"   # install a package group
```

| Task | RPM (low-level) | YUM/DNF (high-level) |
|------|-------------|------------------|
| Install | `rpm -ivh pkg.rpm` | `yum install pkg` |
| Remove | `rpm -e pkg` | `yum remove pkg` |
| Upgrade | `rpm -Uvh pkg.rpm` | `yum update pkg` |
| Dependencies | Manual (shows errors only) | **Resolved automatically** |
| Package source | Local .rpm file | Repository (internet) |
| Search | Not possible (installed only) | `yum search` |

The input differs between `rpm install` and `yum install`. `rpm` takes a **local .rpm file path**, but `yum` takes only a **package name** (`yum install httpd`, no file name or path). That is because yum finds and downloads it from the repository by itself. On the exam, the answer to "a command that installs from an internet repository including dependencies automatically" is always on the yum/dnf side.

`yum repolist` shows the currently enabled repositories. Repositories are defined in `.repo` files under `/etc/yum.repos.d/`, and each file contains entries such as `[repository ID]`, `baseurl=`, `enabled=1`, and `gpgcheck=1`. With `gpgcheck=1`, the package's GPG signature is verified, which guards against tampering and forgery. On internal networks, people sometimes build a local mirror repository and point to it with `baseurl=file:///path`.

> ⚠️ **Trap**: When you remove a package with `yum remove`, **other packages that depended on it may be removed as well**. Carelessly removing a core library can paralyze the system. Always check the "Removing" list that yum shows before you remove anything. Also, don't confuse `yum update` (everything) with `yum update package` (a single package).

```bash
# Try it yourself — yum/dnf
yum repolist                   # which repositories are enabled?
yum list installed | head      # some of the installed packages
yum info bash                  # information on the bash package
yum search editor              # search packages containing 'editor'
# works the same with dnf
dnf repolist
```

## DEB · dpkg — The Low-Level Package Tool of the Debian Family

- Packages of the **Debian family** (Debian, Ubuntu, Mint) have the `.deb` extension.
- The low-level tool that handles them directly is `dpkg` — the counterpart of `rpm` in the Red Hat family.
- `.deb` file names carry information too.

```bash
# nginx_1.18.0-6_amd64.deb
#  └name  └version     └architecture
```

```bash
dpkg -i nginx_1.18.0-6_amd64.deb   # install
dpkg -r nginx                       # remove — keeps configuration files
dpkg -P nginx                       # complete removal (Purge) — removes configuration too
dpkg -l                             # list of installed packages (list)
dpkg -l nginx                       # status of a specific package
dpkg -L nginx                       # list of files installed by that package (List files)
dpkg -S /usr/sbin/nginx             # which package this file belongs to (Search)
dpkg -s nginx                       # package status and information (status)
```

| Task | RPM command | dpkg command |
|------|----------|-----------|
| Install | `rpm -ivh pkg.rpm` | `dpkg -i pkg.deb` |
| Remove (keep configuration) | `rpm -e pkg` | `dpkg -r pkg` |
| Complete removal | (not applicable) | `dpkg -P pkg` |
| Full list | `rpm -qa` | `dpkg -l` |
| Files of a package | `rpm -ql pkg` | `dpkg -L pkg` |
| File→package | `rpm -qf file` | `dpkg -S file` |

dpkg distinguishes between `-r` (remove) and `-P` (Purge). `-r` removes only the program files and **keeps the configuration files (under /etc)** — so that your settings are preserved when you reinstall later. `-P` (Purge) removes even the configuration files completely. RPM has no such distinction (`rpm -e` removes the configuration too).

Watch the letter case. `dpkg -l` (lowercase L) is the **installed list**, and `dpkg -L` (uppercase L) is the **list of files installed by a specific package**. Where `rpm` separates `-ql` from `-qa`, dpkg separates `-L` from `-l` by case alone. The exam includes wrong answers with this case swapped.

Like `rpm -ivh`, `dpkg -i` also **cannot resolve dependencies automatically**. If a dependency is missing, the package is left in an "installed but not configured" state. In that case, the standard remedy is to fill in the dependencies with `apt-get install -f` (fix-broken), or to use `apt` from the start.

## APT — The High-Level Tool of the Debian Family

- `APT` (Advanced Package Tool) is the high-level tool corresponding to YUM/DNF, pulling in dependencies automatically from repositories.
- The `apt` command, which merges what used to be split into `apt-get`/`apt-cache`, is now the standard.

```bash
apt update                  # refresh the repository package list (not an install!)
apt upgrade                 # upgrade installed packages
apt install nginx           # install (dependencies automatic)
apt remove nginx            # remove (keeps configuration)
apt purge nginx             # complete removal (including configuration)
apt search keyword          # search
apt show nginx              # package information
apt list --installed        # installed list
apt autoremove              # clean up dependencies that are no longer needed
```

Don't confuse `apt update` with `apt upgrade`. **`apt update` does not install or update any package.** It only refreshes the list (index) of "which versions of which packages exist" from the repositories. The actual upgrade is done by `apt upgrade`. That's why you always use the order `apt update && apt upgrade`. YUM's `yum update` differs in that it does both steps at once.

| Task | YUM/DNF | APT |
|------|---------|-----|
| Refresh repository list | (automatic) | `apt update` |
| Upgrade | `yum update` | `apt upgrade` |
| Install | `yum install pkg` | `apt install pkg` |
| Remove | `yum remove pkg` | `apt remove pkg` |
| Search | `yum search` | `apt search` |
| Info | `yum info` | `apt show` |

APT's repository definitions live in `/etc/apt/sources.list` and `/etc/apt/sources.list.d/*.list`, and each line has the format `deb URL distribution component`. `apt update` downloads the index (`Packages.gz`) from the URLs in this list and stores it in the local cache (`/var/lib/apt/lists/`). So if you skip update, apt looks only at the old index and wrongly concludes "no newer version".

RPM and DEB appeared almost simultaneously in the mid-1990s. Both were notorious for "dependency hell" in the early days — to install A you needed B, to install B you needed C, and the user had to download each one by hand. Debian was first to show automatic dependency resolution with APT in 1998, and the Red Hat camp caught up with yum (adopted by Fedora around 2003). The fact that the commands of the two families mirror each other like a decalcomania today is the result of each solving the same problems (dependencies, repositories, verification) on its own. If you memorize this correspondence as a table, you get half of the exam right automatically.

## 📖 Glossary

- **Package** : A bundle that packs precompiled program files and installation information together.
- **Dependency** : Another package that must be installed together for a given package to work.
- **Dependency hell** : The situation where installing A needs B and B needs C, so the user has to download them one after another by hand.
- **Repository** : An internet (or internal) server where packages are gathered. High-level tools fetch from here.
- **/etc/yum.repos.d** : The directory where the repositories YUM/DNF will use are written as `.repo` files.
- **/etc/apt/sources.list** : The file where the repositories APT will use are written in the format `deb URL distribution component`.
- **gpgcheck** : A repository configuration entry. When `1`, the package's GPG signature is checked to block tampered or forged packages.
- **Index (package list)** : A list of which versions of which packages exist in a repository. `apt update` downloads it and stores it in `/var/lib/apt/lists/`.
- **Purge** : Complete removal that deletes not just the program but also the configuration files under `/etc`. `dpkg -P`, `apt purge`.
- **Freshen (`-F`)** : An rpm option that updates only already-installed packages to the new version and leaves packages that are not installed alone.

## 📝 Practice Questions

**Question 1.** Which command is most appropriate for installing an RPM package such that it replaces an older version of the same package if one is already installed, installs it fresh if not, and shows a progress bar?

A) `rpm -ivh pkg.rpm`

B) `rpm -Uvh pkg.rpm`

C) `rpm -Fvh pkg.rpm`

D) `rpm -qvh pkg.rpm`

**Answer: B**

Explanation: `-U` (Upgrade) replaces the old version if present and installs fresh if not, and `-v -h` show verbose output and a hash progress bar. The `-i` in A stops with an error if the package is already installed. The `-F` (Freshen) in C updates only already-installed packages and does not install ones that are missing. The `-q` in D is a query option and is not used for installation.

---

**Question 2.** Which command checks which RPM package installed the file `/usr/sbin/httpd`?

A) `rpm -ql /usr/sbin/httpd`

B) `rpm -qf /usr/sbin/httpd`

C) `rpm -qi /usr/sbin/httpd`

D) `rpm -qa /usr/sbin/httpd`

**Answer: B**

Explanation: `-qf` (query file) traces a specific file back to the package it belongs to. The `-ql` in A goes the opposite direction: given a package name, it shows the list of files that package installed. The `-qi` in C shows package information and the `-qa` in D lists all packages; neither takes a file path as an argument.

---

**Question 3.** What is the single most important advantage of YUM/DNF compared with RPM?

A) It unpacks packages faster

B) It automatically downloads and installs the required dependencies from repositories

C) It keeps installed files resident in memory

D) It converts the extensions of package files

**Answer: B**

Explanation: The reason YUM/DNF exist is automatic dependency resolution. It downloads and installs all the required dependent packages from the URLs defined in the repositories (`/etc/yum.repos.d/`), thereby avoiding "dependency hell". rpm just stops with an error when a dependency is missing. A, C, and D describe things unrelated to what a package manager does.

---

**Question 4.** Which statement correctly describes the difference between `dpkg -r` and `dpkg -P` on the Debian family?

A) `-r` removes everything including configuration files, and `-P` removes only the program

B) `-r` removes only the program and keeps the configuration files, while `-P` (Purge) removes even the configuration files completely

C) Both remove the package completely in the same way

D) `-r` is an install command and `-P` is a remove command

**Answer: B**

Explanation: `dpkg -r` (remove) removes only the program files and preserves the configuration files under `/etc` so that settings survive a reinstall. `dpkg -P` (Purge) removes even the configuration files completely. A swaps the two, C ignores the difference between them, and D is a wrong answer that mistakes `-r` for install (`-i` is install).

---

**Question 5.** Which best describes the role of the `apt update` command?

A) It upgrades all installed packages to the latest versions

B) It only refreshes the repository package list (index) and does not actually install or upgrade any package

C) It automatically removes dependency packages that are no longer needed

D) It automatically repairs broken dependencies

**Answer: B**

Explanation: `apt update` only downloads the index of "which versions of which packages exist" from the repositories and refreshes the local cache (`/var/lib/apt/lists/`). The actual upgrade is done by `apt upgrade`. A is `apt upgrade`, C is `apt autoremove`, and D is the job of `apt-get install -f`.

---

**Question 6.** Which Debian family command corresponds to the Red Hat family's `rpm -qa`?

A) `dpkg -L`

B) `dpkg -l`

C) `dpkg -S`

D) `dpkg -i`

**Answer: B**

Explanation: `rpm -qa` shows the full list of installed packages, and on the Debian family the lowercase `dpkg -l` plays the same role. The uppercase `dpkg -L` in A is the list of files installed by a specific package, the `-S` in C is file→package tracing, and the `-i` in D is the install command. The key is distinguishing the case of `-l` and `-L`.

---

**Question 7.** Which of the following correctly pairs high-level package tools (repository-based, automatic dependency resolution)?

A) rpm and dpkg

B) yum and apt

C) rpm and apt

D) dpkg and dnf

**Answer: B**

Explanation: The high-level tools, which pull in dependencies automatically from repositories, are yum/dnf (Red Hat) and apt (Debian). rpm and dpkg are low-level tools that handle a single package file directly. So A is both low-level, and C and D are wrong answers that mix a low-level tool with a high-level one.

---

