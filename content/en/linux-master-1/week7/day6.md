# Day 6 - Virtualization Management: Using One Server Like Many with Hypervisors, KVM, and Containers

## 📌 Key Takeaways

- The only branching point in virtualization is **whether you boot a new kernel (VM) or borrow one (container)**. A VM is heavy (several GB, tens of seconds) and can run other OSes too, while a container is light (tens of MB, 1 second) and runs **only on the Linux kernel**.
- **Full virtualization** does **not require** modifying the guest kernel (the hypervisor intercepts; KVM, ESXi), while **paravirtualization** modifies the kernel to make requests through **hypercalls** (Xen PV).
- **Type 1** sits directly on the hardware (Xen, ESXi, Hyper-V, **KVM**), and **Type 2** is an application on a host OS (VirtualBox, VMware Workstation).
- KVM hardware-accelerates **CPU and memory**, **QEMU** emulates the peripheral devices, and **libvirt/virsh** manages them. **`destroy` (forced shutdown) ≠ `undefine` (delete the definition).**
- Containers are built from just **namespaces (view isolation) + cgroups (resource limits)**. In Docker, the key distinctions are **`rm` (container) / `rmi` (image)**, **`-p host:container`**, and **`RUN` (build time) / `CMD` (run time)** in the Dockerfile.

## Full Virtualization and Paravirtualization

- The approaches split on **who receives the guest's request to access hardware, and how**.

| Category | Full virtualization | Paravirtualization |
|------|---------------|----------------|
| Guest OS modification | **Not required** (installed as is) | **Required** (kernel modified) |
| Hardware access | Hypervisor intercepts and handles it | Guest requests directly via **hypercalls** |
| Guest OS constraints | Even OSes that can't be modified, like Windows, are possible | Realistically only open-source kernels |
| Typical examples | KVM, VMware ESXi, Xen HVM | Xen PV |

Full virtualization "tricks" the guest. The guest kernel believes it is on real hardware and executes privileged instructions, but the hypervisor intercepts (traps) them and handles them on its behalf — which is why it can run OSes whose source cannot be touched, such as Windows. Paravirtualization modifies the guest kernel so that it asks through **hypercalls** instead of privileged instructions.

The performance problem of full virtualization was solved by Intel **VT-x** and AMD **AMD-V**. The CPU directly provides a guest mode, eliminating the interception cost, and so full virtualization became the standard. Paravirtualization remains only in the I/O area (virtio).

```bash
grep -E 'vmx|svm' /proc/cpuinfo     # supported if you see the flag: Intel=vmx, AMD=svm
grep -c -E 'vmx|svm' /proc/cpuinfo  # number of supporting logical cores (0 means unsupported or disabled in BIOS)
```

## Hypervisor Type 1 vs Type 2

- A **hypervisor (VMM)** is the layer that creates virtual machines and distributes physical resources.
- There is one classification criterion — **is it directly on the hardware, or on a host OS.**

| Category | **Type 1 (bare metal)** | **Type 2 (hosted)** |
|------|----------------------|----------------------|
| Position | **Directly on** the hardware | **An application on** a host OS |
| Host OS / Performance | Not needed / High | Needed / Low |
| Use | Servers, data centers, cloud | Desktop, development, learning |
| Typical examples | **Xen, VMware ESXi, Hyper-V, KVM** | **VirtualBox, VMware Workstation** |

```
[Type 1]                    [Type 2]
+------------------+        +------------------+
| VM  | VM  | VM   |        | VM  | VM         |
+------------------+        +------------------+
|    Hypervisor    |        | Hypervisor (app) |
+------------------+        +------------------+
|     Hardware     |        |     Host OS      |
+------------------+        +------------------+
                            |     Hardware     |
                            +------------------+
```

- Why Type 2 is slower: the guest's requests go through one more step, **hypervisor → host OS → hardware**.
- So the standard is Type 1 for the server room and Type 2 for my laptop.

> ⚠️ **Trap**: **How KVM is classified** is the confusing point. KVM is a kernel module, so it looks like it is "on a host OS", but the moment it is loaded, **the Linux kernel itself turns into a hypervisor**. So it is usually classified as **Type 1**, and the standard answer choice on the exam is "KVM = Type 1, VirtualBox = Type 2".

## KVM — The Linux Kernel Is the Hypervisor

- **KVM (Kernel-based Virtual Machine)** is Linux's standard virtualization, included in the mainline since kernel 2.6.20.
- The key point is that it is a **kernel module** — the module management commands we learned yesterday apply as they are.

```bash
lsmod | grep kvm       # you should see kvm and kvm_intel (or kvm_amd)
modprobe kvm_intel     # load the KVM module for Intel CPUs
ls -l /dev/kvm         # the character device KVM exposes (crw-rw----)
```

| Component | Role |
|-----------|------|
| **KVM** (kvm.ko, kvm_intel/kvm_amd.ko) | Kernel module. Handles CPU and memory virtualization via **hardware acceleration** |
| **QEMU** | User-space emulator. **Emulates peripheral devices** such as disk, NIC, graphics |
| **libvirt / libvirtd** | The virtualization management **abstraction layer** (API and daemon) |
| **virsh** / **virt-manager** | libvirt's **command-line** / **GUI** clients |

KVM and QEMU are not competitors but have a **division of labor**. KVM handles only CPU and memory with hardware acceleration, while peripheral devices like disk controllers, NICs, and VGA are emulated by QEMU. Memorize it as "KVM is the CPU, QEMU is the devices".

```bash
# RHEL/CentOS/Rocky family
dnf install qemu-kvm libvirt virt-install virt-manager
# Debian/Ubuntu family
apt install qemu-kvm libvirt-daemon-system virtinst virt-manager
systemctl enable --now libvirtd      # common: start the libvirt daemon
```

### virsh — Virtual Machine Management Commands

- `virsh` is the core of practical-exam short answers.
- Terminology note: in libvirt, a single virtual machine is called a **domain**.

```bash
virsh list                  # running domains only
virsh list --all            # everything, including stopped ones
virsh start vm1             # start
virsh shutdown vm1          # graceful shutdown (sends an ACPI signal)
virsh destroy vm1           # forced shutdown (pulling the power cord) — not deletion!
virsh undefine vm1          # delete the domain definition (removal)
virsh suspend vm1           # pause (memory retained)
virsh resume vm1            # resume from pause
virsh dominfo vm1           # status, CPU, memory information
virsh dumpxml vm1 > vm1.xml # export the configuration as XML (the reverse: virsh define vm1.xml)
virsh autostart vm1         # start automatically when the host boots
```

> ⚠️ **Trap**: Despite its name, `virsh destroy` **does not delete the virtual machine.** It forcibly turns it off like pulling the power cord; the disk and the definition remain, so you can turn it back on with `virsh start`. The command that removes the registration is `virsh undefine`.

The reason libvirt exists is **abstraction**. The `virsh` command works not only for KVM but also for Xen and LXC, by just changing the connection URI. The domain XML is in `/etc/libvirt/qemu/`, and the default storage for disk images is `/var/lib/libvirt/images/`.

- Create a new VM with **`virt-install`**, and disk images with **`qemu-img`**.
- **`raw`** : Simple and fast, but takes up the full capacity from the start.
- **`qcow2`** : Supports **thin provisioning**, which grows only as much as is actually written, and **snapshots**, making it the default choice.

```bash
qemu-img create -f qcow2 /var/lib/libvirt/images/vm1.qcow2 20G
qemu-img info /var/lib/libvirt/images/vm1.qcow2

virt-install --name vm1 --memory 2048 --vcpus 2 \
  --disk path=/var/lib/libvirt/images/vm1.qcow2,size=20 \
  --cdrom /iso/Rocky-9.iso --network bridge=br0 --graphics vnc
```

## Containers — Isolation While Sharing the Kernel

- A container **does not boot a guest OS.**
- It uses the host kernel as is, and confines processes with **two kernel features**.

| Kernel feature | What it does |
|-----------|---------|
| **namespace** | Isolates **what can be seen** (PID, network, mount, hostname, user, IPC) |
| **cgroup** (control group) | Limits **how much of a resource can be used** (CPU, memory, I/O) |

| Comparison | Virtual machine (VM) | Container |
|------|---------------|----------|
| Kernel | **A separate kernel** per guest | **Shares** the host kernel |
| Size / Boot | Several GB / tens of seconds | Tens to hundreds of MB / under 1 second |
| Isolation strength | **Strong** (hardware level) | Relatively weak (kernel shared) |
| Other OSes | Windows etc. possible | **Linux containers run only Linux** |
| Typical | KVM, VirtualBox | Docker, Podman, LXC |

- The two features in one line: **"view and limit"**.
  - **namespace is the view** — if you run `ps` inside a container, you see only its own processes, and `ip addr` shows only its own interfaces.
  - **cgroup is the limit** — it prevents one container from consuming the host's resources entirely.

The expression "a container is a lightweight virtual machine" is a **wrong answer** on the exam. A container has neither a guest kernel nor a hypervisor. That's why you can't run a Windows container on a Linux host, and if a kernel vulnerability is breached, the isolation is breached with it.

The roots of containers are Unix `chroot` from 1979. With cgroups and namespaces entering the Linux kernel the foundation was laid and LXC bundled them, and in 2013 Docker spread explosively by adding the distribution concepts of **images and registries** — the innovation was the "way of distribution" rather than the isolation technology.

## Docker — Images and Containers

- The key to understanding Docker is **the distinction between images and containers**.

| Concept | Definition |
|------|------|
| **Image** | A read-only template (layered structure). Does not run — equivalent to an installer |
| **Container** | A running instance made by placing a **writable layer** on top of an image |
| **Registry** | A repository that stores and distributes images (Docker Hub, etc.) |

```bash
docker pull nginx:1.25                       # download an image from a registry (with a tag)
docker images                                # list of local images
docker run -d -p 8080:80 --name web nginx    # create + run a container
docker ps                                    # running containers (all: docker ps -a)
docker exec -it web /bin/bash                # run a command in a running container (open a shell)
docker logs -f web                           # container standard output log (real time)
docker stop web                              # graceful stop
docker rm web                                # delete the container (must be stopped)
docker rmi nginx                             # delete the image
docker build -t myapp:1.0 .                  # build an image from a Dockerfile
```

| Option | Meaning |
|------|------|
| `-d` | detached, run in the background |
| `-it` | interactive (`-i` keep stdin open + `-t` pseudo-terminal) |
| `-p host:container` | Port mapping (publish) |
| `-v hostpath:containerpath` | Volume / bind mount |
| `--name` / `-e KEY=VALUE` / `--rm` | Specify a name / environment variable / auto-delete on exit |

There are questions that swap **`docker rm` (delete a container) and `docker rmi` (delete an image)** — with the `i` it is image. Also, in `-p 8080:80`, the **host port comes first and the container port second**, and a choice with the order reversed is wrong.

- When a container is deleted, **the writable layer disappears entirely.** So data to be preserved is kept outside, in **volumes**.
- If you connect a host directory like `-v /host/data:/var/lib/mysql` (a **bind mount**), the data remains even if you delete the container.

### Dockerfile — Defining an Image as Code

- A Dockerfile is a **text file that lists the procedure for building an image**, and each directive becomes one **layer** of the image.

```dockerfile
FROM ubuntu:22.04                 # base image (must be the first directive)
ENV APP_HOME=/app                 # environment variable
WORKDIR /app                      # working directory (created if absent)
COPY ./src /app                   # copy host files into the image
RUN apt-get update && apt-get install -y python3   # runs at build time
EXPOSE 8080                       # document the port to be used
CMD ["python3", "app.py"]         # default command to run when the container starts
```

| Directive | Role |
|--------|------|
| `FROM` | Specifies the base image (**always the first line**) |
| `RUN` | Runs a command at **build time** (the result remains in the image) |
| `COPY` / `ADD` | Copy files (`ADD` supports URLs and automatic extraction) |
| `WORKDIR` / `ENV` / `USER` | Working directory / environment variable / user to run as |
| `EXPOSE` | Documents the exposed port (actual opening is via `-p`) |
| `CMD` / `ENTRYPOINT` | Default command at **run time** (can be overridden) / fixed executable |

**`RUN` and `CMD` differ in timing.** `RUN` executes during `docker build` and its result is baked into the image, while `CMD` executes on `docker run`, and even if written several times, **only the last one** is effective. `EXPOSE` is **only documentation** and does not open external access.

- **Podman** is the default container engine replacing Docker since RHEL 8.
- There are two differences from Docker — **daemonless** (starts containers directly without a resident dockerd daemon), and **rootless** (runs with regular user privileges).
- The options are Docker-compatible, so `podman run -d -p 8080:80 nginx` works as is. Also know **LXC/LXD**, of the system container family.

```bash
# Try it yourself — observing virtualization support and isolation features (safe: mostly queries)
grep -c -E 'vmx|svm' /proc/cpuinfo    # number of cores supporting CPU virtualization (0 means unsupported)
lsmod | grep kvm                       # whether the KVM module is loaded
ls -l /dev/kvm 2>/dev/null || echo "KVM not in use"
lsns | head                            # list of namespaces on the system
ls /sys/fs/cgroup | head               # cgroup hierarchy
virsh list --all 2>/dev/null || echo "libvirt not installed"
docker ps -a 2>/dev/null || echo "Docker not installed"
```

## VirtualBox — The Representative of Type 2

- **VirtualBox** is a representative **Type 2** hypervisor distributed by Oracle.
- Besides the GUI, it provides the **`VBoxManage`** command-line tool, with a consistent `VBoxManage <subcommand> <VM name> [options]` structure.

```bash
VBoxManage list vms                          # list of registered VMs (running only: list runningvms)
VBoxManage showvminfo "vm1"                  # detailed VM information
VBoxManage startvm "vm1" --type headless     # start in the background without a GUI
VBoxManage controlvm "vm1" acpipowerbutton   # request graceful shutdown (forced: poweroff)
VBoxManage modifyvm "vm1" --memory 2048      # change settings (memory)
VBoxManage snapshot "vm1" take "before-update"   # create a snapshot
```

- **Guest Additions**, installed alongside, are helper drivers placed inside the guest. They enable automatic resolution adjustment, clipboard sharing, and shared folders (the same role as VMware Tools).

## Memorization Tips

- Virtualization questions come as choices that pair up **"commands of different tools that do the same job"** or swap similar names.
- Memorize the three tools by grouping the same tasks together.
  - **Full list** : `virsh list --all` / `docker ps -a` / `VBoxManage list vms`
  - **Forced shutdown** : `virsh destroy` / `docker kill` / `controlvm poweroff`
  - **Delete** : `virsh undefine` / `docker rm` / `unregistervm`

| Confusing pair | How to tell apart |
|-------------|--------|
| `docker rm` vs `docker rmi` | With the `i`, it deletes an **image** |
| `virsh destroy` vs `undefine` | destroy = **forced shutdown**, undefine = **delete definition** |
| `RUN` vs `CMD` | RUN = **build time**, CMD = **run time** |
| Type 1 vs Type 2 | **Hardware** below means 1, **host OS** below means 2 |
| Full vs paravirtualization | Guest kernel modification **not required** means full, **required** means para |
| VM vs container | A **separate** kernel means VM, **shared** means container |

## 📖 Glossary

- **Virtualization** : A technology that logically splits physical resources so that one server acts like several.
- **Hypervisor (VMM)** : The layer that creates virtual machines and distributes physical resources. Split into Type 1/Type 2 by position.
- **Full virtualization** : A method that "tricks" the guest so it runs as is without kernel modification. The hypervisor intercepts privileged instructions.
- **Paravirtualization** : A method that modifies the guest kernel so it requests directly through **hypercalls**. Fast, but requires kernel modification.
- **VT-x / AMD-V** : Hardware virtualization support provided by the CPU. Checked with the `vmx`/`svm` flags in `/proc/cpuinfo`.
- **KVM** : A kernel module that turns the Linux kernel itself into a hypervisor. Responsible for CPU and memory virtualization.
- **QEMU** : A user-space emulator that emulates peripheral devices such as disk, NIC, and VGA. Divides the work with KVM.
- **libvirt / virsh** : An abstraction layer for virtualization management and its command-line client. The same commands work for Xen and LXC.
- **Domain** : The name libvirt uses for a single virtual machine.
- **`virsh destroy` vs `undefine`** : Forced shutdown like pulling the power cord (can be turned back on) vs deleting the domain definition itself.
- **qcow2** : A QEMU disk image format that grows only as much as actually written and supports snapshots. raw takes up the full capacity from the start.
- **namespace** : A kernel feature that isolates **what a container can see** (PID, network, mount, etc.).
- **cgroup** : A kernel feature that limits **how much of a resource a container can use** (CPU, memory, I/O).
- **Image vs container** : A read-only template that does not run vs a running instance with a writable layer on top of it.
- **`docker rm` vs `rmi`** : Delete a container vs delete an image. The trailing `i` is image.
- **`RUN` vs `CMD`** : A directive executed at build time and baked into the image vs the default command executed when the container starts.
- **Podman** : A Docker-compatible container engine that runs without a daemon (daemonless) and with regular user privileges (rootless).

## 📝 Practice Questions

**Question 1.** Which best describes the difference between Full Virtualization and Para Virtualization?

A) Full virtualization requires modifying the guest OS kernel, and paravirtualization does not

B) Full virtualization uses the guest OS as is without modification, while paravirtualization modifies the guest kernel to make requests through hypercalls

C) Full virtualization is a container technology, and paravirtualization is a virtual machine technology

D) Both methods operate without a guest OS

**Answer: B**

Explanation: In full virtualization, the hypervisor intercepts privileged instructions and handles them on the guest's behalf, so the guest OS need not be modified, which is why even OSes whose source can't be altered, such as Windows, can run. In paravirtualization, the guest kernel is modified to request directly from the hypervisor through hypercalls, so the overhead is lower but kernel modification is needed. A swaps the two, and C and D are statements unrelated to virtualization methods.

---

**Question 2.** Which correctly pairs the classification of Type 1 (bare metal) and Type 2 (hosted) hypervisors?

A) Type 1: VirtualBox / Type 2: KVM

B) Type 1: KVM, Xen, VMware ESXi / Type 2: VirtualBox, VMware Workstation

C) Type 1: Docker / Type 2: Podman

D) Both Type 1 and Type 2 run on a host OS

**Answer: B**

Explanation: Type 1 is the bare-metal approach that runs directly on the hardware, covering KVM, Xen, VMware ESXi, and Hyper-V, while Type 2 is installed like an application on a host OS, covering VirtualBox and VMware Workstation. A swaps the two, the Docker and Podman in C are container engines, not hypervisors, and D contradicts the definition of Type 1.

---

**Question 3.** Which statement about KVM is NOT correct?

A) It operates as a Linux kernel module, and you can check whether it is loaded with `lsmod | grep kvm`

B) It handles CPU and memory virtualization, and QEMU takes charge of emulating peripheral devices such as disk and network

C) It makes use of the CPU's hardware virtualization support such as Intel VT-x or AMD-V

D) It is a container technology that shares the host kernel without a separate kernel per guest

**Answer: D**

Explanation: D is a description of containers (Docker, Podman, LXC). KVM is a virtual machine technology, so each guest boots a complete OS with its own kernel. A is correct in that KVM is a kernel module (kvm, kvm_intel/kvm_amd), B in the division of labor between KVM and QEMU, and C in using hardware virtualization support.

---

**Question 4.** Which virsh command forcibly shuts down (cuts the power of) a running virtual machine `vm1`?

A) `virsh undefine vm1`

B) `virsh destroy vm1`

C) `virsh suspend vm1`

D) `virsh dumpxml vm1`

**Answer: B**

Explanation: Despite its name, `virsh destroy` does not delete the domain; it forcibly shuts it down like pulling the power cord, and since the disk and definition remain, you can turn it back on with `virsh start`. The `undefine` in A deletes the domain definition, the `suspend` in C pauses while retaining memory, and the `dumpxml` in D exports the configuration as XML. A graceful shutdown is `virsh shutdown`.

---

**Question 5.** Which is the most appropriate description of the fundamental difference between a virtual machine (VM) and a container?

A) A VM shares the kernel and a container has a kernel per guest

B) A VM boots a separate kernel and OS per guest, but a container shares the host kernel and isolates with namespaces and cgroups

C) A VM works only on Linux and a container only on Windows

D) A container runs only on a hypervisor

**Answer: B**

Explanation: A VM boots a new guest kernel on a hypervisor, so it is heavy but strongly isolated and can run other OSes too. A container shares the host kernel while confining processes with namespaces (view isolation) and cgroups (resource limits), so it is light and fast. A swaps the two, C is contrary to fact, and D contradicts the fact that a container stands on kernel features alone without a hypervisor.

---

**Question 6.** In Docker, which is the correct command to run a container in the background while connecting the host's port 8080 to the container's port 80?

A) `docker run -d -p 80:8080 nginx`

B) `docker run -d -p 8080:80 nginx`

C) `docker run -it -v 8080:80 nginx`

D) `docker build -d -p 8080:80 nginx`

**Answer: B**

Explanation: The `-p` option is in the order `hostport:containerport`, so to connect host 8080 to container 80 it is `-p 8080:80`, and `-d` is background (detached) execution. A reverses the order, the `-v` in C is a volume mount option and `-it` is interactive execution, which differs from the requirement. The `docker build` in D is a command that builds an image and is not used to run containers.

---

**Question 7.** Which Docker command and role pairing is incorrect?

A) `docker images` — view the list of locally stored images

B) `docker exec -it web /bin/bash` — open a shell in a running container

C) `docker rmi nginx` — delete the container named nginx

D) `docker logs -f web` — view the container's output log in real time

**Answer: C**

Explanation: `docker rmi` is the command that deletes an **image**, and the command that deletes a container is `docker rm`. If you remember that the trailing `i` means image, you won't get confused. A is querying the image list, B is `exec`, which runs a command inside a running container (`-i` keep stdin open + `-t` pseudo-terminal), and D follows the standard output log with `-f`; all are correct.

---
