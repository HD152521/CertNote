# Day 3 - The Kernel and Modules: Handling the Heart of the System and Its Pluggable Parts

## 📌 Key Takeaways

- The Linux kernel is **modular monolithic** — the core stays resident as a single block, while drivers and the like are split into **modules (.ko) that can be plugged in and out**.
- Locations: the kernel image is `/boot/vmlinuz-version`, and modules are in **`/lib/modules/$(uname -r)/`**. You check the current version with `uname -r`.
- Module queries use `lsmod` (loaded list, Used by) and `modinfo` (description, dependencies, parameters).
- Loading and removal split into **low-level `insmod`/`rmmod` (full path, manual dependencies)** and **high-level `modprobe`/`modprobe -r` (name only, automatic dependencies)**. It's the same pattern as rpm vs yum.
- The kernel compile order is **`make menuconfig` (configure, .config) → `make` (build) → `make modules_install` (/lib/modules) → `make install` (/boot + GRUB)**. During configuration: `*` (built-in) / `M` (module) / blank (excluded).

## Kernel Structure and Location

- The **kernel** is the core code at the innermost layer that directly controls the hardware. It handles CPU time allocation (scheduling), memory allocation, and file system, network, and device management.
- Shells, commands, and application programs all run on top of the kernel, and talk to the hardware indirectly by sending requests through **system calls**.
- When you plug in a new USB device, the corresponding driver module is loaded automatically and can be unloaded when not in use → you **extend functionality dynamically** without recompiling the whole kernel.
- The kernel itself is a **single compressed image file** loaded into memory at boot, and is usually located under `/boot`.

```bash
uname -r                    # currently running kernel version (e.g. 5.14.0-70.el9.x86_64)
uname -a                    # full information: kernel, hostname, architecture
ls /boot                    # vmlinuz-*, initramfs-*, config-*, etc.
```

| File/Path | Meaning |
|-----------|------|
| `/boot/vmlinuz-version` | Compressed kernel image (loaded at boot) |
| `/boot/initramfs-version.img` | Initial RAM disk (drivers for early boot) |
| `/boot/config-version` | Build configuration used when that kernel was made |
| `/lib/modules/version/` | Where the modules (.ko) for that kernel live |
| `/proc/sys/` | View and modify kernel parameters in real time |

The `z` in `vmlinuz` means compressed (zipped) — it is a compressed kernel image that gets decompressed into memory at boot. Modules are stored separately by kernel version under `/lib/modules/$(uname -r)/`. Because of this directory structure, modules don't get mixed up even if you install several kernel versions at the same time. The version that `uname -r` reports is exactly the name of the current module directory.

Kernel parameters are adjusted in real time through `/proc/sys/` (virtual files that are readable and writable) and the `sysctl` command. For example, you can check the IP forwarding state with `sysctl net.ipv4.ip_forward` and turn it on with `sysctl -w net.ipv4.ip_forward=1`. For permanent application, write it in `/etc/sysctl.conf`. This is another way to "change behavior without rebuilding the kernel".

## Querying Modules — lsmod and modinfo

- A module (kernel object, **`.ko` = kernel object**) is a part that is dynamically plugged into the kernel.
- The first step is to look at the **list of currently loaded modules** and **the information about each module**.

```bash
lsmod                       # list of all currently loaded modules (+ usage count, dependent modules)
modinfo e1000               # detailed information on a specific module (description, dependencies, parameters)
modinfo -d e1000            # module description only
```

- The output of `lsmod` has three columns.

```
Module          Size    Used by
e1000           159744  0
bluetooth       806912  9 btusb,...
```

| Column | Meaning |
|----|------|
| Module | Module name |
| Size | Memory footprint |
| Used by | Usage count + other modules that depend on this module |

If the "Used by" number in `lsmod` is greater than 0, it means **something else is using that module**, so you can't carelessly unload it. The names of the dependent modules are written alongside. `lsmod` is really just a nicely formatted view of `/proc/modules`. `modinfo` reads the metadata (author, license, parameters, dependencies) from the module file itself.

With `modinfo`, you can find out the **parameters** that the module accepts (the `parm:` lines). When loading a module you can adjust its behavior with `modprobe module parameter=value`, and to apply it automatically at boot, write `options module parameter=value` in `/etc/modprobe.d/*.conf`. To prevent a particular module from being loaded automatically, write `blacklist module-name` in the same directory.

## Loading and Removing Modules — insmod·rmmod vs modprobe

- There are two branches of commands for loading and unloading modules.
  - **Low-level** (`insmod`/`rmmod`) — handle a single module directly.
  - **High-level** (`modprobe`) — also handles dependencies automatically.
- This structure is **exactly the same as the rpm vs yum relationship** we learned yesterday.

```bash
insmod /lib/modules/.../e1000.ko   # load a module directly (full path, manual dependencies)
rmmod e1000                         # remove a module
modprobe e1000                      # load including dependent modules automatically (name only)
modprobe -r e1000                   # remove, taking dependencies into account (remove)
```

| Task | Low-level | High-level (recommended) |
|------|--------|--------------|
| Load | `insmod /path/mod.ko` | `modprobe mod` |
| Remove | `rmmod mod` | `modprobe -r mod` |
| Input | **Full path** | **Module name** |
| Dependencies | Manual (fails if unresolved) | **Resolved automatically** |

The biggest difference between `insmod` and `modprobe` is **automatic dependency resolution**. `insmod` loads only the single `.ko` you specify, so if that module needs other modules, it fails with an error such as "Unknown symbol". `modprobe` consults `/lib/modules/.../modules.dep` (the dependency map), loads the needed modules first, and then loads the target. Moreover, `insmod` requires the full path, whereas `modprobe` needs only the name. So in both real work and the exam, `modprobe` is the answer in most cases.

The `modules.dep` that `modprobe` consults is generated by the `depmod` command. After putting a new module in `/lib/modules/.../`, you must run `depmod -a` so the dependency map is refreshed and `modprobe` can find that module. If you skip this step when building and adding a kernel module yourself, modprobe reports "module not found".

> ⚠️ **Trap**: It is common for unloading a module with `rmmod` to fail with "Module is in use". This is because the "Used by" in `lsmod` is not 0. Using `rmmod -f` to force removal is dangerous and not recommended. The standard approach is to unload the higher-level modules that depend on it first, or to remove everything together with `modprobe -r`, which takes dependencies into account.

```bash
# Try it yourself — observing modules (safe: mostly queries)
lsmod | head                       # loaded modules
lsmod | wc -l                      # number of modules
modinfo loop                       # information on the loop module
cat /proc/modules | head           # the source of lsmod
ls /lib/modules/$(uname -r)/kernel | head   # module tree
```

## Kernel Compile Flow

- You sometimes compile the kernel source yourself to support new hardware, optimize features, apply patches, and so on.
- It resembles the source compilation we learned yesterday, but differs in that **the configuration (config) step is the key**.

```bash
cd /usr/src/linux-version            # kernel source directory
make menuconfig                      # menu-based kernel configuration (generates .config)
make                                  # compile kernel image + modules
make modules_install                 # install the compiled modules into /lib/modules/
make install                          # install the kernel image into /boot + update the bootloader
```

| Step | Command | What it does |
|------|------|---------|
| 1. Configure | `make menuconfig` | Choose which features/drivers to include, make modular, or exclude → `.config` |
| 2. Build | `make` | Compile the kernel image (vmlinuz) and modules (.ko) |
| 3. Install modules | `make modules_install` | Copy modules to `/lib/modules/version/` |
| 4. Install kernel | `make install` | Place vmlinuz and initramfs in `/boot` and update the bootloader (GRUB) |

In the kernel configuration step, each feature is set to one of three states — **`*` (built-in: included in the kernel)**, **`M` (module: built as a separate .ko and loaded when needed)**, **blank (excluded)**. The standard approach is to make frequently used core features built-in (`*`) and occasionally used device drivers modules (`M`). Making something a module shrinks the kernel image and also saves memory. This choice determines the list of modules that will be installed by `make modules_install`.

There are several configuration tools. `make config` (a primitive method that asks questions one by one), `make menuconfig` (a text menu based on ncurses, the most common), `make xconfig` (an X Window GUI), and `make oldconfig` (takes the existing `.config` and asks only about the items that changed for the new kernel). It is usually safe to copy the current kernel's `/boot/config-$(uname -r)` to `.config` and then start with `make oldconfig`.

> ⚠️ **Trap**: You must not change the order of the steps. Modules and the image are only created once `make` (build) finishes, so `make modules_install` and `make install` come after it. Also, `make modules_install` (modules to /lib/modules) and `make install` (kernel to /boot + GRUB update) are **separate steps with different destinations**. Answer choices that confuse the two as one appear on the exam. After installing a new kernel, you must choose the new kernel from the bootloader menu when booting for it to take effect.

The kernel that Linus Torvalds first released in 1991 was purely monolithic with no module concept — to support a new device you had to recompile the whole kernel. When loadable kernel modules (LKM) were introduced around 1995, it became possible to dynamically plug drivers into and out of a booted kernel. The fact that plugging in a USB stick is recognized immediately today, and that a distribution supports thousands of kinds of hardware with a single kernel, are both thanks to this module structure. "Modular monolithic", which compromises between the performance of a monolithic kernel and the flexibility of a microkernel, is Linux's design philosophy.

## 📖 Glossary

- **Kernel** : The heart of the operating system that directly controls the hardware. It handles scheduling, memory, file systems, and devices.
- **Modular monolithic** : Linux's compromise design, where the kernel's core stays resident as a single block but drivers and the like are separated out as dynamic modules.
- **`.ko` (kernel object)** : A kernel module file. A part that can be plugged into and out of the kernel.
- **`vmlinuz`** : A compressed (z = zipped) kernel image. It is decompressed into memory at boot.
- **initramfs** : An initial RAM disk holding the drivers needed in early boot.
- **`/lib/modules/$(uname -r)/`** : Where the modules dedicated to that kernel version live. They are split by version, so they don't get mixed up even when several kernels coexist.
- **"Used by" in `lsmod`** : The usage count and dependent modules of that module. If it is not 0, `rmmod` fails.
- **`modules.dep`** : The dependency map between modules. `depmod -a` creates it and `modprobe` consults it.
- **`insmod` vs `modprobe`** : Loading only a single module by full path vs automatically loading dependent modules too by name alone.
- **blacklist** : A setting written in `/etc/modprobe.d/*.conf` to prevent a particular module from being loaded automatically.
- **`sysctl` / `/proc/sys/`** : The command and virtual files for changing operating parameters in real time without rebuilding the kernel. For permanent application, use `/etc/sysctl.conf`.
- **`*` / `M` / blank** : The three choices in kernel configuration for making a feature built-in / separated as a module / excluded.

## 📝 Practice Questions

**Question 1.** Which command checks the version of the currently running kernel?

A) `uname -r`

B) `lsmod -v`

C) `modinfo kernel`

D) `cat /boot/vmlinuz`

**Answer: A**

Explanation: `uname -r` prints the release (version) string of the currently running kernel. The `lsmod` in B is a tool for listing loaded modules, the `modinfo` in C views the information of a specific module, and D is a wrong attempt to just print the compressed binary kernel image. `uname -a` shows more information together.

---

**Question 2.** Which best describes the difference between `insmod` and `modprobe`?

A) `insmod` loads dependent modules automatically, and `modprobe` loads only a single module

B) `modprobe` resolves dependencies automatically and loads by name alone, while `insmod` takes a full path and loads only a single module

C) Both are commands that remove modules

D) `insmod` shows module information and `modprobe` shows the list

**Answer: B**

Explanation: `modprobe` consults `modules.dep` to load dependent modules first and works with the module name alone. `insmod` loads only the one specified `.ko` by full path and fails if dependencies are missing. A swaps the two, C is a wrong answer that treats the load commands as removal, and D is an explanation confused with `modinfo`/`lsmod`.

---

**Question 3.** What does it mean when the "Used by" of a module in the `lsmod` output is not 0?

A) The module is corrupted

B) Another module or feature is using that module, so it is hard to remove right away

C) The module's version does not match the kernel

D) The module has been excluded from automatic loading

**Answer: B**

Explanation: The "Used by" value indicates the usage count and dependent modules that reference that module. If it is not 0, something is using it, so `rmmod` fails with "Module is in use". The standard approach is to unload the higher-level modules first or to remove with `modprobe -r`, which takes dependencies into account. A, C, and D are interpretations unrelated to the usage count.

---

**Question 4.** Which command shows detailed information such as the description, dependencies, and parameters of a specific module?

A) `lsmod module-name`

B) `modinfo module-name`

C) `rmmod module-name`

D) `depmod module-name`

**Answer: B**

Explanation: `modinfo` reads metadata such as author, license, dependencies, and parameters (`parm:`) from the module file and shows it. The `lsmod` in A is a tool for viewing the full list, not for giving a specific module's information as an argument, C is for removal, and D is a command that generates the dependency map (`modules.dep`).

---

**Question 5.** What is the role of the `make menuconfig` step in kernel compilation?

A) It copies the compiled modules to `/lib/modules`

B) It selects which features to make built-in (*), module (M), or excluded (blank), and creates the `.config` file

C) It installs the kernel image into `/boot` and updates the bootloader

D) It unpacks the source archive

**Answer: B**

Explanation: `make menuconfig` is the configuration step that decides, via menus, whether each feature is included (built-in, module, or excluded) and generates `.config`. A is `make modules_install`, C is `make install`, and D is the job of `tar`. Only after configuration is finished does `make` build according to its contents.

---

**Question 6.** What is the correct order of steps in a kernel compile?

A) make → make menuconfig → make install → make modules_install

B) make menuconfig → make → make modules_install → make install

C) make install → make → make menuconfig → make modules_install

D) make modules_install → make menuconfig → make → make install

**Answer: B**

Explanation: First configure with `make menuconfig` (.config), build the kernel image and modules with `make`, install the modules into `/lib/modules` with `make modules_install`, and finally place the kernel in `/boot` and update the bootloader with `make install`. The configure→build→install modules→install kernel order is the key, and the others have the order scrambled.

---

**Question 7.** Which is the most appropriate reason for calling the Linux kernel "modular monolithic"?

A) Because all functions run as independent processes in user space

B) Because the core functions stay resident in memory as a single block, while drivers and the like are separated into modules that can be plugged in and out when needed

C) Because the kernel is divided into several small microkernels

D) Because the kernel was fixed into a single file so that it cannot be compiled

**Answer: B**

Explanation: Linux is a compromise structure that keeps the core as a single block (monolithic) while separating device drivers, file systems, and so on into modules that can be dynamically loaded and removed. That is why functionality can be extended without rebuilding the whole kernel. A and C are closer to descriptions of a microkernel, and D contradicts the module structure itself.

---
