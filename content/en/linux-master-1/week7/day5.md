# Day 5 - Week 7 Comprehensive Review: The Big Picture of Backup and System Administration

## 📌 Key Takeaways

- Pattern ① running through the week: **almost every administration tool has a 2-tier structure of "low-level single tool ↔ high-level automation tool"**. rpm↔yum, dpkg↔apt, insmod↔modprobe.
- The low level handles a single target directly and cannot resolve dependencies, while the high level consults repositories and dependency maps to handle things automatically. **On the exam, the answer is usually the high level.**
- Pattern ②: backup tools split by **operating layer** — file level (`tar`, `rsync`, `cpio`), file system level (`dump`/`restore`, levels 0 to 9), block level (`dd`).
- `rsync` is the standard for incremental synchronization that **transfers only what changed** (`-a` preserve · `-v` verbose · `-z` compress · `--delete`).
- `dd` **wipes out your data entirely if you swap if/of.** `dump` is for the ext family only (for xfs, use `xfsdump`).

## Backup — tar·dump·restore·rsync·dd·cpio

- Backup means making copies to guard against data loss.
- **Each tool has a different operating layer and purpose** — this layer is the criterion for choosing a tool.

```bash
tar -czvf backup.tar.gz /home/user      # a directory into a compressed archive (most common)
tar -xzvf backup.tar.gz                  # restore (extract)
rsync -av /src/ /backup/                 # incremental sync (changed parts only)
rsync -avz /src/ user@host:/backup/      # compressed transfer to a remote host (z)
dd if=/dev/sda of=/backup/disk.img       # clone a disk whole, block by block
dump -0u -f /backup/full.dump /dev/sda1  # file system level 0 (full) backup
restore -rf /backup/full.dump            # restore a dump backup
find /home | cpio -ov > backup.cpio      # archive combined with find
```

| Tool | Layer | Characteristics | Use |
|------|------|------|------|
| `tar` | File/directory | Bundling + compression, most common | General backup and distribution |
| `rsync` | File/directory | **Incremental** (changed only), remote | Periodic synchronization |
| `dd` | **Block (device)** | Whole-disk clone, bit by bit | Disk images and cloning |
| `dump`/`restore` | **File system** | Levels 0 to 9 incremental, ext family | Whole file system backup |
| `cpio` | Files (stdin) | Combined with `find` | Selective archive |

> 💡 **Concept**: Backup tools must be understood by **operating layer**. `tar`/`rsync`/`cpio` work at the **file level**, picking files and directories to back up. `dump`/`restore` work at the **file system level** and support levels (0 = full, 1 to 9 = incremental). `dd` works at the lowest **block (device) level**, cloning the disk bit for bit including free space — which is why it is used for whole-disk images and cloning boot disks. A different layer means a different use.

The strength of `rsync` is **incremental transfer**. The first time it copies everything, but from then on it transfers only changed files and changed blocks, saving a great deal of time and bandwidth. `-a` (archive, preserves permissions, timestamps, links), `-v` (verbose), `-z` (compress during transfer), and `--delete` (also delete from the backup the files that no longer exist in the source) are the key options. It is the de facto standard for remote backup. Be careful: a trailing slash on a path (`/src/`) means "the contents inside the directory", which changes the result.

> ⚠️ **Trap**: `dd` is as dangerous as it is powerful. If you swap `if` (input file) and `of` (output file), it overwrites the disk you meant to back up with an empty image and destroys the data entirely — hence the nickname "data destroyer". Also, `dump` is specialized for ext2/3/4 and cannot be used on xfs and others (for xfs, use `xfsdump`). Each tool supports different file systems.

```bash
# Try it yourself — backup practice (in a safe directory)
mkdir -p /tmp/src /tmp/dst
echo "hello" > /tmp/src/a.txt
tar -czvf /tmp/backup.tar.gz /tmp/src      # tar backup
tar -tzvf /tmp/backup.tar.gz               # check contents (without extracting)
rsync -av /tmp/src/ /tmp/dst/              # rsync synchronization
echo "world" >> /tmp/src/a.txt
rsync -av /tmp/src/ /tmp/dst/              # second run: only what changed is transferred
```

## Tying the Week Together — Threading It with the 2-Tier Structure

- Gathering this week's key points into a single table makes the **"low-level ↔ high-level" pattern** vivid.

| Area | Low-level (single, manual) | High-level (automatic, dependencies) |
|------|---------------------|----------------------|
| RPM packages | `rpm -ivh` | `yum/dnf install` |
| DEB packages | `dpkg -i` | `apt install` |
| Kernel modules | `insmod` / `rmmod` | `modprobe` / `modprobe -r` |

All three rows share the same principle: "the low level handles a single file/target directly and cannot resolve dependencies automatically, while the high level consults repositories/dependency maps to handle things automatically". `rpm -ivh` stopping on a dependency error, `dpkg -i` leaving things in a "not configured" state, `insmod` failing with "Unknown symbol" — all have the same reason (manual dependencies). That's why the answer in real work and on the exam is usually a high-level tool.

## Source Install and Kernel Compile — Same make, Different Results

| Flow | Ordinary source install | Kernel compile |
|------|----------------|-------------|
| Configure | `./configure --prefix=` | `make menuconfig` (.config) |
| Build | `make` | `make` |
| Install | `make install` | `make modules_install` + `make install` |

Both build with `make`, but the configuration method differs. For ordinary source, `./configure` surveys the system and creates the Makefile, while for the kernel you select features yourself (`*`/`M`/excluded) with `make menuconfig` to create `.config`. The kernel's installation also has two branches — modules with `make modules_install` (→/lib/modules), and the kernel image with `make install` (→/boot + GRUB). Libraries split into dynamic (`.so`, managed with ldd/ldconfig) and static (`.a`).

## Where Devices Meet Backup — Why dd Handles Blocks

Day 4's "block device (`b`) vs character device (`c`)" ties directly to backup. The reason `dd` can clone a whole disk is that a disk is a **block device**, so random access in block units is possible. Character devices (terminals, keyboards) are streams and cannot be cloned into an image. So `dd if=/dev/sda` (a block device) works, but `dd if=/dev/tty0` (a character device) has no meaning as a disk image backup. Device type → possible backup method connect in a single line.

The age of the backup tools shows their design philosophy. `dump`/`restore` and `dd` are classics from 1970s Unix, handling file systems and devices directly. `tar` (tape archive) was originally built to back up to magnetic tape, which is why "tape" remains in its name. `cpio` is also a tape tool from the same era. `rsync` is a relative newcomer that appeared in 1996, and it made "transfer only the changed parts" its core, fitting the network era. The older the tool, the lower the layer it aims at (blocks, file systems, tape); the newer the tool, the more it aims at efficient network synchronization.

## 📖 Glossary

- **Low-level ↔ high-level 2-tier structure** : A pairing of a tool that handles a single target directly and a tool that handles dependencies and repositories automatically. The backbone running through this week.
- **Automatic dependency resolution** : The ability to find and install/load other required packages or modules first. Only high-level tools do it.
- **`tar`** : Short for "tape archive". The most common backup tool for bundling and compressing files and directories.
- **`rsync`** : An incremental sync tool that transfers only the changed parts. The de facto standard for remote backup.
- **Incremental backup** : A method that, instead of taking a full copy again, stores only what changed since the last backup. It saves time and space.
- **`dump` levels 0 to 9** : 0 is a full backup, and 1 to 9 are incremental stages that contain only the changes since a lower-level backup.
- **`dd`'s if / of** : Input file / output file. If swapped, the source is overwritten and the data disappears.
- **`cpio`** : A classic tool that takes the output of `find` and makes an archive. Used for selective backup.
- **Operating layer** : The unit a tool handles — file / file system / block (device). A different layer means a different use.
- **`--delete`** : An rsync option that also deletes from the destination the files that don't exist in the source, creating an exact mirror.

## 📝 Practice Questions

**Question 1.** On the RHEL family, which high-level tool installs packages from repositories while resolving dependencies automatically?

A) `rpm`

B) `dpkg`

C) `yum/dnf`

D) `insmod`

**Answer: C**

Explanation: The high-level package tool of the RHEL family is yum/dnf, which pulls in dependencies automatically from repositories and installs. The rpm in A is a low-level tool that handles a single .rpm file, the dpkg in B belongs to the Debian family, and the insmod in D is a kernel module load command.

---

**Question 2.** In a source compile installation, which step specifies the top-level installation path and generates a Makefile suited to the system?

A) `tar -xzvf`

B) `./configure --prefix=/usr/local/app`

C) `make`

D) `make install`

**Answer: B**

Explanation: `./configure` checks the system and creates the Makefile, and `--prefix` sets the installation path. A is unpacking, C is compile and link, and D is the step that copies build products to the system path. In the configure→build→install order, configure is the first build step.

---

**Question 3.** Which statement correctly describes the difference between static and dynamic libraries?

A) Static uses the `.so` extension and dynamic uses `.a`

B) Static is included in the executable at compile time, and dynamic is loaded at run time and shared by multiple programs

C) Static is loaded at run time and dynamic is always included

D) Neither affects the executable file size

**Answer: B**

Explanation: With static (`.a`), the code is copied into the executable at compile time, while with dynamic (`.so`), the dynamic linker loads it at run time and multiple programs share it. A swaps the extensions, C swaps the behaviors, and D contradicts the fact that static makes the executable larger.

---

**Question 4.** Which tool combination correctly checks the dynamic libraries an executable depends on and makes the system recognize a library in a non-standard path?

A) Check with `ldd`, register with `ldconfig` (+ /etc/ld.so.conf)

B) Check with `lsmod`, register with `modprobe`

C) Check with `rpm -ql`, register with `yum`

D) Check with `df`, register with `mount`

**Answer: A**

Explanation: Use `ldd` to check an executable's dynamic library dependencies, and make a new library path recognized by adding it to `/etc/ld.so.conf` (or ld.so.conf.d) and refreshing the cache with `ldconfig`. B is for kernel modules, C is for packages, and D is for mounting file systems, so none relate to library management.

---

**Question 5.** Which command loads a kernel module by name alone, resolving dependencies automatically?

A) `insmod /lib/modules/.../mod.ko`

B) `modprobe mod`

C) `rmmod mod`

D) `lsmod mod`

**Answer: B**

Explanation: `modprobe` consults `modules.dep`, loads the dependent modules first, and then loads the module by name alone. The insmod in A loads only a single module by full path and cannot resolve dependencies automatically, C is removal, and D is a command that lists loaded modules.

---

**Question 6.** What does the `make menuconfig` step do in kernel compilation?

A) It copies modules to `/lib/modules`

B) It selects among built-in (*), module (M), and excluded (blank) for features and generates `.config`

C) It installs the kernel image into `/boot`

D) It unpacks the compressed source

**Answer: B**

Explanation: `make menuconfig` is the configuration step that decides, via menus, the inclusion form of each feature (built-in, module, excluded) and creates `.config`. A is `make modules_install`, C is `make install`, and D is the job of `tar`.

---

**Question 7.** In `ls -l`, what is a device file whose first permission character is `c`?

A) A compressed file

B) A character device, a device accessed sequentially byte by byte like a keyboard or terminal

C) A block device, a device accessed in block units like a disk

D) A configuration file

**Answer: B**

Explanation: The first character `c` indicates a character device, a device accessed sequentially in byte units, like a terminal or keyboard. Block devices are shown as `b` and cover disk types (C is the block description). A and D are unrelated to device file types. Character devices hold no file system and so cannot be mounted.

---

**Question 8.** Which correctly pairs the command that cancels a print job in the System V family with the one in the BSD family?

A) System V: `lprm` / BSD: `cancel`

B) System V: `cancel` / BSD: `lprm`

C) System V: `lpq` / BSD: `lpstat`

D) System V: `lp` / BSD: `lpr`

**Answer: B**

Explanation: For cancelling a job, the System V family uses `cancel` and the BSD family uses `lprm`. A swaps the two families, C is the queue query commands (`lpstat`/`lpq`), and D is the printing commands (`lp`/`lpr`), so they differ from cancelling. You must memorize printing, queue viewing, and cancelling grouped by family.

---

**Question 9.** Which best describes the operating layer and use of the backup tool `dd`?

A) It works at the file level and transfers only changed files incrementally

B) It works at the block (device) level and clones a disk whole, bit for bit

C) It works at the file system level and supports level 0 to 9 incrementals

D) It works at the package level and backs up dependencies

**Answer: B**

Explanation: `dd` works at the lowest block (device) level, cloning a disk image bit for bit including free space, so it is used for disk cloning and boot images. A is a characteristic of rsync and C of dump/restore. D is unrelated to how backup tools work. Be careful, because swapping if/of with `dd` destroys data.

---

**Question 10.** You want to synchronize to a remote server by transferring only changed files incrementally, with compression applied. Which command is most appropriate?

A) `dd if=/src of=user@host:/backup`

B) `rsync -avz /src/ user@host:/backup/`

C) `tar -czvf /src user@host:/backup`

D) `cpio -o /src user@host`

**Answer: B**

Explanation: `rsync` is centered on incremental transfer, and with `-a` (preserve), `-v` (verbose), and `-z` (compress), it is best suited for remote synchronization. The dd in A does not use remote path syntax that way and is for block cloning, the tar in C does not accept a remote destination in that form, and the cpio in D is not remote synchronization syntax either.

---

**Question 11.** Which of the following is an incorrect "low-level single tool ↔ high-level automation tool" pairing?

A) `rpm -ivh` ↔ `yum install`

B) `dpkg -i` ↔ `apt install`

C) `insmod` ↔ `modprobe`

D) `tar` ↔ `ldconfig`

**Answer: D**

Explanation: tar (backup archive) and ldconfig (dynamic linker cache refresh) are tools from different areas and are not a low-level↔high-level pair. A (RPM packages), B (DEB packages), and C (kernel modules) are all correct 2-tier pairs of "handle a single target directly ↔ resolve dependencies automatically".

---

**Question 12.** Which best describes the difference between `dump`/`restore` and `tar`?

A) `dump` works at the file system level and supports level 0 to 9 incremental backups, while `tar` works at the file/directory level

B) `tar` clones a disk block by block, and `dump` backs up packages

C) Both are network-transfer-only tools

D) `dump` supports only compression, and `tar` supports only incrementals

**Answer: A**

Explanation: `dump`/`restore` work at the file system level, support level 0 (full) to 9 (incremental), and are specialized for the ext family. `tar` is an archive and compression tool at the file/directory level. B wrongly swaps the functions of the two, C is wrong because they are not network-only, and D is a wrong answer that scrambles the characteristics of the two tools.

---
