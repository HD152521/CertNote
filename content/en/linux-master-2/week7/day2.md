# Day 2 - Package Management (2): DEB, APT, and Source Installation

## 📌 Key Takeaways

- In the Debian family, the low-level tool is **`dpkg`** and the high-level tool is **`apt`**.
- **`apt update` refreshes the list, and `apt upgrade` does the actual upgrade.** The names are confusing, but they do different jobs.
- Source installation has four steps: **extract → `./configure` → `make` → `make install`**.
- **`tar` only bundles; it does not compress.** Compression is handled by the **`-z` (gzip) · `-j` (bzip2) · `-J` (xz)** options.
- Compression ratio is generally **`xz` > `bzip2` > `gzip`**, and speed is the reverse.

## dpkg — The Low-Level Tool

```bash
dpkg -i package.deb       # install
dpkg -r package-name      # remove (keeps config files)
dpkg -P package-name      # complete removal (purge — including config)
dpkg -l                   # list of installed packages
dpkg -L package-name      # list of files the package installed
dpkg -S /path/file        # which package owns this file
```

| Option | Meaning | rpm equivalent |
|------|-----|-----------|
| **`-i`** | Install | `-i` |
| **`-r`** | Remove (keeps config) | `-e` |
| **`-P`** | **Complete removal** | — |
| **`-l`** | List | `-qa` |
| `-L` | File list | `-ql` |
| `-S` | Find a file's owner | `-qf` |

- **Difference between `-r` and `-P`** — `-r` (remove) keeps config files, and `-P` (purge) deletes the config too.
- `dpkg` also **does not resolve dependencies.** This is a trait common to low-level tools.
- Just like `rpm`, you give **a `.deb` file for install (`-i`) and a package name for removal and queries**.

### The First Two Letters of `dpkg -l`

```text
$ dpkg -l | grep -E 'apache2-bin|vsftpd'
ii  apache2-bin    2.4.52-1ubuntu4    amd64    Apache HTTP Server (modules and other binary files)
rc  vsftpd         3.0.5-0ubuntu1     amd64    lightweight, efficient FTP server written for security
```

| Marker | Meaning |
|------|-----|
| **`ii`** | **Properly installed** state |
| **`rc`** | **Removed but config files remain** (removed, config-files) |
| No line | Never installed, or completely removed with `-P` |

- **`rc` is exactly where the difference between `-r` and `-P` becomes visible.** After `dpkg -r vsftpd` it remains as `rc`, and after `dpkg -P vsftpd` it disappears from the list.
- The reason for keeping config is **so the old settings can be reused as they were when you reinstall**. To start fresh and clean, purge.

### Package File Names — How They Differ from RPM

```text
   apache2 _ 2.4.52-1ubuntu4 _ amd64 . deb
      │            │             │
      │            │             └── architecture
      │            └──────────────── version-revision
      └───────────────────────────── package name
```

| Item | RPM | DEB |
|------|-----|-----|
| Separator | Hyphens and dots (`name-version-release.architecture`) | **Underscores** (`name_version_architecture`) |
| 64-bit Intel/AMD | `x86_64` | **`amd64`** |
| Architecture-independent | `noarch` | **`all`** |

- Even for the same program, **the package name can differ by distribution.** The Apache web server is `httpd` in the Red Hat family and **`apache2`** in the Debian family. The `httpd` in the `apt` examples below matches the name to yesterday's for easy comparison; on a real Ubuntu you install it with `apt install apache2`.

### When dpkg Is Blocked by Dependencies

| Method | Command |
|------|------|
| Clean up an install that stopped, using `apt` | `apt install -f` (`--fix-broken`) — fetches the missing dependency packages and finishes the job |
| Install the file with `apt` from the start | `apt install ./package.deb` — put **`./`** in front to signal that it is a file |

## apt — The High-Level Tool

```bash
apt update                 # refresh package list (does not install!)
apt upgrade                # upgrade installed packages
apt install httpd          # install
apt remove httpd           # remove
apt purge httpd            # remove including config
apt search keyword         # search
apt show httpd             # info
apt list --installed       # installed list
```

> ⚠️ **Always distinguish `update` from `upgrade`.**
> **`apt update`** only **fetches a fresh list of "which versions of which packages exist"** from the repository. It does not actually install or change anything.
> **`apt upgrade`** looks at that list and **actually upgrades**.
> So you always use the order **`apt update && apt upgrade`**.

| Command | What it does |
|------|--------|
| **`apt update`** | **Refreshes the list only** |
| **`apt upgrade`** | **Actual upgrade** |
| `apt-get` | The older apt command. It still works |
| `aptitude` | A management tool with a text screen |

- Repository addresses are in **`/etc/apt/sources.list`** and `/etc/apt/sources.list.d/`.
- It is the same place as `/etc/yum.repos.d/` in the RPM family.

### Why `apt update` Exists Separately

```text
   Repository server                    My computer
   package list  ── apt update ───────►  copy of the list (/var/lib/apt/lists/)
   package files ── apt upgrade ──────►  actual install · update
                    apt install
```

- `apt` works from the **copy of the list stored on my computer**. If the copy is stale, it does not know new versions have come out, and it fails trying to fetch old files that have already vanished from the repository.
- That is why you run **`apt update` first even before installing**. If `apt install` on a freshly installed Ubuntu says "package not found", you usually have never fetched the list.
- **`yum` has no separate step for this.** If the list is stale, `yum` fetches a fresh one on its own when it runs, and **`yum update` goes straight to the actual upgrade**. The same word `update` does **different things** in the two families.

| Command | Refreshes list | Changes packages |
|------|---------|-----------|
| `apt update` | **Yes** | No |
| `apt upgrade` | No | **Yes** |
| `yum check-update` | Automatically if needed | No |
| `yum update` | Automatically if needed | **Yes** |

### The Remaining apt Commands

| Command | What it does |
|------|--------|
| `apt full-upgrade` (`apt-get dist-upgrade`) | Upgrades, and if necessary even allows **removing existing packages** |
| `apt autoremove` | Cleans up **packages that came along as dependencies and are now useless** |
| `apt clean` | Empties the downloaded `.deb` cache (`/var/cache/apt/archives`) |
| `apt-cache search keyword` | Search — the older form of `apt search` |
| `apt-cache show package-name` | Info — the older form of `apt show` |

- In the past the commands were split: **`apt-get` for installing, `apt-cache` for searching**. `apt` **gathers the frequently used features into one command**.
- The difference between `apt remove` and `apt purge` is **exactly the same** as between `dpkg -r` and `-P` — whether config files are kept or deleted.

### Reading One sources.list Line

```text
   deb  http://archive.ubuntu.com/ubuntu  jammy  main restricted
    │                 │                     │         │
    │                 │                     │         └── components (areas)
    │                 │                     └──────────── codename of the distribution release
    │                 └────────────────────────────────── repository address
    └──────────────────────────────────────────────────── deb = binary, deb-src = source
```

- After editing a line, you must **run `apt update`** for the new repository's list to come in.
- Recent distributions sometimes put the same content in a file of a different format (`.sources` under `/etc/apt/sources.list.d/`). The location the exam asks about is **`/etc/apt/sources.list`**.

### Correspondence Table for the Two Families

| Task | **RPM family** | **DEB family** |
|--------|------------|------------|
| Low-level install | `rpm -i` | `dpkg -i` |
| Low-level removal | `rpm -e` | `dpkg -r` |
| Low-level list | `rpm -qa` | `dpkg -l` |
| High-level install | `yum install` | `apt install` |
| High-level removal | `yum remove` | `apt remove` |
| Repository settings | `/etc/yum.repos.d/` | `/etc/apt/sources.list` |

## Compression and Bundling

**Bundling (archive) and compressing (compress) are different jobs.**

| Command | What it does | Extension |
|------|--------|-------|
| **`tar`** | **Bundle multiple files into one** | `.tar` |
| **`gzip`** / `gunzip` | Compress / decompress | **`.gz`** |
| **`bzip2`** / `bunzip2` | Compress / decompress | **`.bz2`** |
| **`xz`** / `unxz` | Compress / decompress | **`.xz`** |
| `compress` | Old method | `.Z` |

```text
   ratio   xz  >  bzip2  >  gzip
   speed   gzip  >  bzip2  >  xz
```

- **`tar` itself does not compress.** It only bundles. That is why names that go through two steps, like `.tar.gz`, are common.

### Compression Tools Handle Only One File

```text
$ ls
access.log  error.log
$ gzip access.log
$ ls
access.log.gz  error.log
$ gunzip access.log.gz
$ ls
access.log  error.log
```

- **`gzip` deletes the original and replaces it with a `.gz`.** The original and the compressed file do not remain together. The same goes for `bzip2` and `xz`.
- All three tools compress **one file at a time** and cannot make multiple files into one lump. That is why to compress a whole directory you must **bundle it with `tar` first**.

| Task | gzip | bzip2 | xz |
|--------|------|-------|-----|
| Compress | `gzip file` | `bzip2 file` | `xz file` |
| Decompress | `gunzip` · `gzip -d` | `bunzip2` · `bzip2 -d` | `unxz` · `xz -d` |
| View contents without unpacking | `zcat` | `bzcat` | `xzcat` |
| `tar` option | `-z` | `-j` | `-J` |
| Common bundle extension | `.tar.gz` · **`.tgz`** | `.tar.bz2` | `.tar.xz` |

- **Decompression works with `-d` (decompress) for all three.** `gunzip` does the same job as `gzip -d`.
- **`zip` and `unzip`** are a different family. They do **bundling and compression in one go** and are used when exchanging files with Windows (`.zip`).

### tar Options

```bash
tar -cvf bundle.tar folder/        # bundle (create)
tar -xvf bundle.tar                # extract (extract)
tar -tvf bundle.tar                # list contents only (list)
tar -zcvf bundle.tar.gz folder/    # bundle and gzip-compress
tar -zxvf bundle.tar.gz            # gzip-decompress and extract
tar -jxvf bundle.tar.bz2           # bzip2
tar -Jxvf bundle.tar.xz            # xz
```

| Option | Meaning |
|------|-----|
| **`-c`** | **Bundle** (create) |
| **`-x`** | **Extract** (extract) |
| `-t` | **List only** the contents (list) |
| **`-f`** | **Specify the file name** — almost always needed |
| `-v` | Show progress (verbose) |
| **`-z`** | **gzip** |
| **`-j`** | **bzip2** |
| **`-J`** | **xz** (uppercase) |

> Mixing up **`-c` (bundle) and `-x` (extract)** can overwrite the original. The pairing **`-z` is lowercase gzip, `-j` is bzip2, `-J` is uppercase xz** also shows up as is.

### The Order for Reading Option Letters

```text
   tar  -z c v f  backup.tar.gz  /home/alice
         │ │ │ │        │             │
         │ │ │ │        │             └── what to bundle
         │ │ │ │        └──────────────── file name that -f takes
         │ │ │ └── f : what follows is the archive file name
         │ │ └──── v : show the files being processed on screen
         │ └────── c : action (exactly one of c · x · t)
         └──────── z : compression method (one of z · j · J)
```

- You pick **exactly one of `c`, `x`, `t`** as the action. To that you attach one compression method plus `v` and `f`.
- **Put `f` last.** The thing right after `f` is interpreted as the file name. Writing `tar -cfv a.tar dir` tries to create an archive named `v`.
- Writing without the hyphen, as `tar zxvf file`, means the same thing. Both notations appear in the choices.

| Option | Meaning |
|------|-----|
| **`-C directory`** | Specifies **where to extract** (uppercase). Without it, extracts into the current directory |
| `-p` | Extracts while **preserving the original permissions** |
| `-r` | **Appends** files to an existing archive (cannot be used on compressed archives) |

```bash
tar -zxvf backup.tar.gz -C /tmp        # extract under /tmp
tar -ztvf backup.tar.gz                # only see what is inside, without extracting
```

- Recent GNU `tar` can sometimes detect the compression format on its own **when extracting**. But **when bundling, nothing is compressed unless you give an option**, and on the exam you pick as the answer the one **with the option matching the extension**.
- The habit of **looking at the list first with `-t`** is safe. Extracting an archive bundled without a top-level directory dumps hundreds of files into the current directory.

## Installing from Source

When there is no package or you need to choose the options yourself, you compile the source.

```text
   1  tar -zxvf program-1.0.tar.gz     extract
   2  cd program-1.0
   3  ./configure                      check environment · generate Makefile
   4  make                             compile
   5  make install                     install (usually with root privileges)
```

| Step | What it does |
|------|--------|
| **`./configure`** | Checks the system and **creates the Makefile** |
| **`make`** | Reads the Makefile and **compiles** |
| **`make install`** | **Copies the built results into place** |
| `make clean` | Cleans up intermediate compile files |

- You can **specify the install location** as in `./configure --prefix=/opt/myapp`.
- With source installation, **you must also take care of dependencies yourself, and removal is hard.** Using packages whenever possible is recommended.
- If you do not give `--prefix`, it usually installs under **`/usr/local`**. That location keeps it from mixing with `/usr`, where packages install.
- The **`./` before `configure`** means "the one in the current directory". The current directory is not in `PATH`, so typing just `configure` will not find it. `make`, on the other hand, is a command installed on the system, so no `./` is attached.

### Where Each Step Gets Stuck

| Message on screen | Which step | Cause |
|-------------|---------|------|
| `configure: error: no acceptable C compiler found in $PATH` | `./configure` | **No compiler (`gcc`)** |
| `configure: error: … not found` | `./configure` | A needed **library or header is missing** — you must fill in the dependency yourself |
| `make: *** No targets specified and no makefile found.  Stop.` | `make` | **`./configure` was skipped, so there is no Makefile** |
| `Permission denied` | `make install` | Writing to system directories needs **root privileges** |

- The three steps form a chain in which **each step takes the output of the previous one**. `make` reads the **Makefile** that `./configure` made, and `make install` copies the **executable** that `make` built. That is why the order cannot be changed.
- By convention, **`./configure` and `make` are run as a regular user**, and **only `make install` as root**.

| Item | **Package install** | **Source install** |
|------|--------------|-------------|
| Time taken | Short — already compiled | Long — compiled on my computer |
| Dependencies | Resolved automatically by the high-level tool | Resolved **by hand** |
| Removal | One line: `rpm -e` · `apt remove` | Hard — there is no database tracking the installed files |
| Visible in lists? | Shows in `rpm -qa` · `dpkg -l` | **Does not show** |
| Reason to choose | Most cases | When there is no package, or you need the **latest version or specific compile options** |

> Tomorrow we cover device files and the `/dev` directory.

## 📖 Glossary

- **`dpkg`**: The low-level package tool of the Debian family. It does not resolve dependencies.
- **`apt`**: The high-level tool of the Debian family. It uses repositories and handles dependencies too.
- **`apt update`**: The command that only fetches a fresh package list from the repository.
- **`apt upgrade`**: The command that actually updates packages to their latest versions.
- **`tar`**: A command that bundles multiple files into one. It has no compression of its own.
- **`gzip` / `bzip2` / `xz`**: Compression tools. Their extensions are `.gz`, `.bz2`, and `.xz` respectively.
- **`./configure`**: The step in source installation that checks the system and generates the Makefile.
- **`make install`**: The step that installs the compiled results onto the system.

## 📝 Practice Questions

**Question 1.** Which of the following is the low-level management tool that handles `.deb` packages?

A) rpm  
B) yum  
C) zypper  
D) dpkg  

**Answer: D**  
Explanation: `dpkg` is the low-level tool in the Debian family that directly installs or removes a single `.deb` package file. It does not resolve dependencies, so if you need automatic handling, use the high-level tool `apt`. `rpm` is the low-level tool of the Red Hat family.

---

**Question 2.** Which of the following is what the `apt update` command does?

A) Refreshes the package list information from the repository  
B) Upgrades all installed packages to the latest version  
C) Removes unused packages  
D) Installs new packages  

**Answer: A**  
Explanation: `apt update` only fetches a fresh list of which versions of which packages exist in the repository. What actually updates packages is `apt upgrade`, so the two commands are usually run one after the other.

---

**Question 3.** Which of the following is the correct order when compiling and installing source code?

A) make → ./configure → make install  
B) ./configure → make install → make  
C) ./configure → make → make install  
D) make install → make → ./configure  

**Answer: C**  
Explanation: `./configure` checks the system environment and creates the Makefile, `make` compiles by following that Makefile, and `make install` copies the results onto the system. `make` can only run once a Makefile exists, so the order cannot be changed.

---

**Question 4.** Which of the following is the option used to bundle files with the `tar` command?

A) -x  
B) -c  
C) -t  
D) -f  

**Answer: B**  
Explanation: `-c` is short for create and makes a new archive. `-x` is extract, `-t` lists the contents, and `-f` is the option that specifies the target file name, so it is used together in most cases.

---

**Question 5.** Which of the following is the option to specify with the `tar` command when also using bzip2 compression?

A) -z  
B) -J  
C) -c  
D) -j  

**Answer: D**  
Explanation: `-j` means bzip2, lowercase `-z` means gzip, and uppercase `-J` means xz compression. `tar` itself has no compression feature, so these options call an external compression tool along with it.
