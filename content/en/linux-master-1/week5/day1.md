# Day 1 - Filesystem Types and Structure: ext2/3/4 · xfs · btrfs · Journaling · Inodes and Blocks

## 📌 Key Takeaways

- **A file's name is not part of the file.** The file itself lives in the inode; the name lives in the directory's "name → inode number" list.
- The unit of space allocation is the **block**, and the map of the whole filesystem is the **superblock** (backup copies exist in several places).
- What the default journaling mode (ordered) protects is **metadata consistency**, not user data.
- ext2 (no journal) → ext3 (journal) → ext4 (extents, max 1EB). xfs **cannot be shrunk**, and btrfs's weapons are CoW and snapshots.
- If there is free space but files cannot be created, it is **inode exhaustion**. Check it with **`df -i`**, not `df -h`.

## inode — The Metadata Structure That Holds a File's Substance

Even on the same physical disk, the maximum file size, recovery ability, and performance change completely depending on which filesystem you format it with. The starting point is how a file is actually represented.

- An inode (index node) is a **fixed-size structure that holds all the metadata for a single file or directory**.
- The number of inode table entries is fixed when the filesystem is created (`mkfs`), and each file consumes one inode.

| Item | Description |
|------|-------------|
| **File type** | Regular file / directory / symbolic link / device, etc. |
| **Permission mode** | rwxrwxrwx (12 bits, including SUID/SGID/Sticky) |
| **Owner UID / GID** | Whose file it is |
| **Link count** | Number of hard links pointing to this inode |
| **Size** | File size in bytes |
| **Timestamps** | atime (access), mtime (modification), ctime (inode change) |
| **Data block pointers** | Locations of the blocks where the actual content is stored |

- One crucial thing is missing here. **The file name is not in the inode.** The parent directory holds the name.

A directory is not "a folder that contains files"; it is **a special file whose content is a list of "file name → inode number" pairs**. All `ls` does is open the current directory file and read that list. That is why deleting a file from a directory (`unlink`) requires write permission on the directory, not permission on the file itself. The sticky bit (the `t` on `/tmp`) is the mechanism that closes this loophole.

The data block pointers in an inode traditionally used a structure of **12 direct blocks + single indirect + double indirect + triple indirect** (ext2/3). Small files are fine with the 12 direct pointers, but large files are represented by stacking up "pointers to blocks that hold pointers" in stages. Instead of this scheme, ext4 introduced **extents** — expressing a range at once as "start block + contiguous length" — so contiguous large files are handled with far less metadata. Performance improves significantly for large, low-fragmentation files.

> ⚠️ **Pitfall**: A situation where "there is free disk space but I can't create a file" is **inode exhaustion**. `df -h` shows block (capacity) usage, while `df -i` shows inode usage separately. When huge numbers of small files (mail queues, session files, etc.) pile up, capacity is fine but inodes hit 100% and `No space left on device` appears. On the exam, "free space available but file creation fails → cause?" The answer is inode exhaustion.

```bash
# Try it yourself — observing inodes
ls -i file.txt              # Print the file's inode number
stat file.txt               # Everything: inode, link count, timestamps
df -i                       # Inode usage per filesystem
ls -id /tmp                 # Inode number of a directory
```

The etymology of "inode" is not clear, but Dennis Ritchie recalled it as short for "index node". This design — managing file metadata by number, separate from the name, since the early 1970s Unix — has survived as the backbone of Linux filesystems to this day.

## Hard Links and Symbolic Links — The Difference from the Inode's Point of View

Once you understand inodes, the difference between the two kinds of links becomes obvious.

- **Hard link**: attaching **one more name** to the same inode number.
  - The inode's link count increases by 1. The two are completely equal "originals", and even if you delete one, the inode survives until the count reaches 0.
  - Possible **only within the same filesystem**, and normally cannot be made for directories.
- **Symbolic (soft) link**: **a separate small file whose content is the target's path string** (a separate inode).
  - If the original is deleted, the link breaks (dangling). It can cross filesystem boundaries and can point to directories.

| Aspect | Hard link | Symbolic link |
|--------|-----------|---------------|
| inode | **Same** as the original | **Separate** inode |
| Link count | Increases it | No effect |
| Filesystem boundary | Cannot cross | Can cross |
| Directory target | Not allowed (normally) | Allowed |
| When the original is deleted | Data kept | Broken link |

What `rm` does is not erase data but **detach the name from the directory and decrease the inode's link count by 1**. Only when the count reaches 0 and no process has the file open are the blocks reclaimed. That is why, if you `rm` a log file that a running process has open, the disk does not free up immediately — the inode stays alive until the process closes it.

```bash
# Try it yourself — links and link count
echo hello > a.txt
ln a.txt b.txt        # Hard link
ls -li a.txt b.txt    # Same inode number, link count 2
ln -s a.txt c.txt     # Symbolic link
ls -li c.txt          # Separate inode, shows '->'
```

## Journaling — How the Filesystem Survives a Power Failure

- Filesystems up to ext2 could **lose consistency** after a sudden power failure or crash.
- Example: "If the power goes out right after a block is allocated for a new file but just before that block is linked to the inode", you get a ghost block that is occupied but pointed to by nobody.
- To catch this at boot, `fsck` had to **scan the entire disk**, which took tens of minutes to hours on large disks.
- **Journaling** **first records what it is about to write (a transaction) in a dedicated area called the journal** before writing to the actual location.
- When the operation completes normally, the journal entry is cleared; if a crash happens midway, only the journal is replayed at boot to restore consistency. No full scan is needed, so recovery finishes in seconds.

The three journaling modes of ext3/ext4:

| Mode | What is recorded in the journal | Safety | Performance |
|------|---------------------------------|--------|-------------|
| **journal** | Both metadata **and data** | Highest | Slowest (writes twice) |
| **ordered** (default) | Metadata only, but data is written to disk first, then metadata is committed | High | Balanced |
| **writeback** | Metadata only, no guarantee on data ordering | Low | Fastest |

A common misconception is that "journaling protects data". The default mode (ordered) only guarantees **metadata consistency**; it does not guarantee that the user data being written at the very last moment is lost-free. Only the `journal` mode, which double-writes data to the journal as well, protects data. On the exam, "What does ext3's default journaling guarantee?" → **metadata consistency** is the answer.

ext4's journal lives in a separate small area, and you can check the "Journal inode" entry with `tune2fs -l`. `data=ordered` is adjusted through a mount option (`/etc/fstab` or `mount -o data=ordered`). btrfs and xfs take different approaches from ext — xfs uses metadata journaling, and btrfs uses **copy-on-write (CoW)**, always writing to a new location instead of using a journal and atomically swapping the pointer. That is why btrfs gets snapshots naturally for free.

ext3 came out (2001) by adding only journaling to ext2 while keeping **on-disk format compatibility**. So you could mount an ext3 partition as ext2 or vice versa. This "evolution that doesn't break existing assets" strategy is the secret behind the ext family's long reign as the default Linux filesystem.

## Filesystem Lineage: ext2 → ext3 → ext4 · xfs · btrfs

The evolution of the ext family at a glance:

| Item | ext2 | ext3 | ext4 |
|------|------|------|------|
| Journaling | None | Yes | Yes |
| Max file size | 2TB | 2TB | **16TB** |
| Max filesystem | 32TB | 32TB | **1EB (exabyte)** |
| Block allocation | Indirect blocks | Indirect blocks | **Extents** |
| Features | Simple, fast | ext2 + journal | Extents, delayed allocation, backward compatible |

Other major filesystems:

| Filesystem | Key characteristics | Strengths |
|------------|---------------------|-----------|
| **xfs** | Metadata journaling, extents, dynamic inodes | Strong with large files and parallel I/O. Default in RHEL 7+ |
| **btrfs** | Copy-on-Write, snapshots, built-in RAID, pooling | Integrates snapshots, checksums, and volume management |
| **swap** | Not a filesystem; swap area for virtual memory | (Covered on Day 3) |

xfs **cannot be shrunk**. It can only be grown (`xfs_growfs`). ext4 can be both grown and shrunk (after unmounting) with `resize2fs`. This asymmetry is easy to test together with LVM — "How do you shrink an LV formatted with xfs?" → The only way is to back up and recreate.

btrfs's Copy-on-Write never overwrites data; it always writes to new blocks and then atomically swaps the metadata pointer. Thanks to this, **snapshots are nearly free** (only changed blocks take extra space), and every block has a checksum, so silent corruption can be detected and repaired. However, in workloads like databases that constantly overwrite the same location, CoW fragmentation can slow things down, so the `nodatacow` attribute is sometimes applied to those files.

```bash
# Try it yourself — checking filesystem types
df -T                       # Mounted filesystems and their types
lsblk -f                    # FSTYPE, UUID per block device
blkid                       # UUID and TYPE per device
cat /proc/filesystems       # List of filesystems the kernel supports
tune2fs -l /dev/sda1 | head # ext-family superblock info (including journal)
```

## Blocks and the Superblock — The Filesystem's Basic Unit and Map

- A **block** is the smallest unit in which a filesystem allocates disk space. It is usually one of 1KB, 2KB, or 4KB, decided at `mkfs` time.
- Even a 1-byte file occupies at least one whole block (e.g., 4KB) — the reason actual usage (`du`) is larger than the nominal size (`ls -l`), i.e., **internal fragmentation**.
- The **superblock** is the "map" holding the metadata of the entire filesystem — block size, total block count, inode count, mount count, filesystem state, and so on.
- If this is damaged the whole filesystem becomes unreadable, so the filesystem **replicates backup copies of the superblock in several locations**.

> ⚠️ **Pitfall**: When the superblock is corrupted, recover by using a backup superblock with `fsck -b <backup block number> /dev/sdaX`. Find the backup locations with `dumpe2fs /dev/sdaX | grep -i superblock` or `mke2fs -n` (prints only the locations without actually formatting). It appears as a short-answer question on "what to do when the primary superblock is damaged".

The practice of choosing a 4KB block size is to match the memory page size of most CPUs (4KB). When filesystem blocks and memory pages are aligned, I/O between the page cache and disk maps cleanly 1:1, which is efficient.

Next, Day 2 covers the process of putting this filesystem onto an actual disk — partitions, mkfs, mount, fstab.

## 📖 Glossary

- **inode** : A structure holding a file's type, permissions, owner, size, timestamps, and data block locations. **The file name is not here**.
- **Directory** : A special file whose content is a "file name → inode number" list. It is an index table, not a folder.
- **Link count** : The number of names pointing to one inode. Blocks are reclaimed only when it reaches 0 and nobody has the file open.
- **Extent** : ext4's allocation method that expresses a range at once as "start block + contiguous length".
- **Inode exhaustion** : A state where inodes are used up so files cannot be created even though capacity remains. Check with `df -i`.
- **Hard link vs symbolic link** : Adding one more name to the same inode versus a separate file holding a path string.
- **Journaling** : A technique that writes "what is about to be written" to a dedicated area first, before actually writing, to speed up crash recovery.
- **ordered / journal / writeback** : ext's journaling modes. The default, ordered, guarantees **metadata only**.
- **`fsck`** : The command that checks and repairs filesystem consistency. Before journaling was introduced, it needed a full scan.
- **CoW (Copy-on-Write)** : Writing to a new block instead of overwriting, then switching the pointer. btrfs snapshots come from this.
- **Block** : The smallest unit in which a filesystem allocates space (usually 4KB). Even a small file uses a whole block.
- **Internal fragmentation** : The phenomenon where actual occupied space is larger than the file size because of block-unit allocation.
- **Superblock** : A map holding the settings and state of the whole filesystem. Backup copies exist in several places in case of damage.
- **`resize2fs` / `xfs_growfs`** : ext can be grown and shrunk, but xfs can **only be grown**.

## 📝 Practice Questions

**Question 1.** Which of the following correctly describes where a file's name (filename) is actually stored in Linux?

A) Inside the file's inode
B) Inside the data of the parent directory the file belongs to
C) Inside the superblock's file name table
D) Inside the header of the file's first data block

**Answer: B**

Explanation: The file name is not in the inode. The parent directory holds the "name → inode number" mapping as its content, and the name is stored there. The inode holds only metadata such as permissions, owner, size, and block pointers.

---

**Question 2.** `df -h` shows plenty of disk capacity, yet creating a new file fails with a "No space left on device" error. What is the most likely cause?

A) Superblock corruption
B) Journal area full
C) Inode exhaustion
D) Block size mismatch

**Answer: C**

Explanation: When huge numbers of small files pile up, capacity (blocks) may remain but inodes hit 100%, so new files cannot be created. Checking inode usage with `df -i` diagnoses it.

---

**Question 3.** Which best describes what ext3's default journaling mode, `ordered`, guarantees?

A) Lossless preservation of even the user data being written last
B) Consistency of the filesystem metadata
C) Physical integrity of the entire disk
D) Recoverability of deleted files

**Answer: B**

Explanation: The ordered mode journals metadata only, so it guarantees the consistency of the filesystem structure. To protect even the user data itself, you must use the `journal` mode, which double-writes data.

---

**Question 4.** Which of the following is NOT a key change ext4 introduced compared with ext3?

A) Introduced the extent method instead of indirect blocks
B) Expanded the maximum filesystem size to 1EB
C) Added journaling for the first time
D) Expanded the maximum single file size to 16TB

**Answer: C**

Explanation: Journaling was already added in ext3. The key points of ext4 are extents, expanded large-capacity limits (16TB file, 1EB FS), delayed allocation, and so on.

---

**Question 5.** Which statement about the difference between hard links and symbolic links is correct?

A) A hard link has a separate inode, and a symbolic link shares the same inode as the original
B) A hard link can cross filesystem boundaries, and a symbolic link cannot
C) A hard link shares the same inode as the original and increases the link count
D) With a symbolic link, the data is kept even if the original is deleted

**Answer: C**

Explanation: A hard link adds a name to the same inode, so the link count increases and the data remains even after the original is deleted. However, it is possible only within the same filesystem. A symbolic link holds a path string in a separate inode, can cross boundaries and point to directories, but breaks when the original is deleted.

---

**Question 6.** Which statement about the xfs filesystem is correct?

A) Its size can be reduced with `resize2fs`
B) Its size can only be increased, not reduced
C) It does not support journaling
D) Its on-disk format is compatible with ext2

**Answer: B**

Explanation: xfs can only be expanded with `xfs_growfs`; shrinking is impossible. To shrink it you must back up and recreate. `resize2fs` is a tool exclusive to the ext family.

---

**Question 7.** When the primary superblock is damaged and the filesystem cannot be mounted, which recovery method is correct?

A) Recreate the inode table
B) Replaying the journal recovers it automatically
C) Find the backup superblock location and recover with `fsck -b`
D) Changing the block size recovers it

**Answer: C**

Explanation: The filesystem keeps backup copies of the superblock in several locations. Find the backup locations with `dumpe2fs` or `mke2fs -n`, then recover with `fsck -b <backup number>`.

---
