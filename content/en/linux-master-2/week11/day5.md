# Day 5 - Comprehensive Mock Exam 2: Linux Usage and Final Review

## 📌 Key Takeaways

- Part 2 of the exam has two subjects: **Operation and Management + Linux Usage**. Today we review **Linux Usage** — three items: **X Window · Internet usage · application fields**.
- The weights differ greatly — **Internet usage is well over half**, X Window comes next, and application fields are a handful of questions.
- Part 2 asks for **names and values rather than principles**. **Product names, protocols, ports, and records** are the core.
- Three things to keep until the very end are the **port numbers · subnet calculation · layer classification table**.
- The 10 questions below wrap up the entire Linux Usage scope.

## Where Today's Scope Sits in Part 2

| Subject | Weeks in this track | Day reviewed |
|------|-------------|---------|
| Linux Operation and Management | W4-W7 | Yesterday (Day 4) |
| **Linux Usage** | **W8-W11** | **Today** |

- Part 2 is **80 questions · 100 minutes**, the passing line is 60 points, and **a score below 40% in any subject is a fail**. Doing well only in Usage, or only in Operation and Management, will not get you a pass.
- Counting one past exam round, of the 80 questions, **Linux Usage had 32**, split within it as **X Window 8 · Internet usage 20 · application fields 4**. It will differ somewhat by round, but the direction is clear: **you should spend the most time on Internet usage (W9, W10)**.
- Application fields have few questions but a **narrow scope.** You only need to be sure of three chunks: the 3 cluster types, virtualization products, and Linux-kernel-based operating systems.

## Final Checklist — Linux Usage

```text
   W8 X Window     server = the side with the screen / client = the program
                   XFree86 → X.org → Wayland
                   layers  X server ← Xlib, XCB ← toolkit (GTK+ C, Qt C++, FLTK, Motif) ← app
                   window managers KWin, Mutter, Xfwm, Windowmaker, Afterstep
                   display managers XDM, GDM, KDM, SDDM, LightDM  (ends in DM)
                   desktop environments GNOME (GTK+), KDE (Qt), Xfce, LXDE, CDE (Motif)
                   DISPLAY :0.0 · startx · runlevel 3/5 · xhost (dangerous) vs ssh -X

   W9 Network      OSI Please Do Not Throw Sausage Pizza Away / hub 1 switch 2 router 3
                   bit, frame, packet, segment / MAC layer 2 IP layer 3 port layer 4
                   TCP reliable · UDP fast
                   circuit (PSTN) vs packet (PSDN) · CSMA/CD wired · CA wireless
                   X.25 → Frame Relay → ATM (53 bytes) · FDDI (optical dual-ring token)
                   IEEE 802.3/802.5/802.6/802.11 · IANA
                   classes A 1-126 B 128-191 C 192-223 D 224-239
                   private 10 / 172.16-31 / 192.168 · loopback 127.0.0.1
                   hosts = (256 − mask) − 2  →  254, 126, 62, 30, 14, 6, 2

   W10 Internet    HTTP 80 · HTTPS 443 · SSH 22 · TELNET 23
   services        SMTP 25 (sending, between servers) · POP3 110 (fetch and delete) · IMAP 143 (keep on server)
                   MUA → MTA → MDA · MIME
                   DNS 53 · A, AAAA, MX, CNAME, NS, PTR · BIND
                   FTP 21 control / 20 data · active vs passive · anonymous · bin/ascii
                   NFS (Unix, RPC, /etc/exports) vs Samba (Windows, SMB/CIFS/NetBIOS)
                   Gopher (menu search) · Usenet (NNTP) · Archie (FTP search) · IRC

   W11 Application HPC (high-computation) · HA (high availability) · LB (load balancing)
   fields          full virtualization (no modification) vs paravirtualization (modification needed)
                   Type 1 KVM, Xen, ESXi / Type 2 VirtualBox, Workstation
                   VirtualBox = Oracle · GPL · full virtualization · supports VMDK/VHD
                   Linux-kernel-based OS: Android, Tizen, webOS (not iOS)
                   IaaS/PaaS/SaaS · Hadoop (HDFS, MapReduce)
```

## Three Things to Carry to the End

```text
   ① Ports     21 FTP · 22 SSH · 23 TELNET · 25 SMTP · 53 DNS
               80 HTTP · 110 POP3 · 143 IMAP · 443 HTTPS · 631 CUPS

   ② Subnets   256 − mask = block,  block − 2 = hosts
               /24 254 · /25 126 · /26 62 · /27 30 · /28 14 · /29 6 · /30 2

   ③ Classification  Ends in DM → display manager
               Xfce is an environment · Xfwm is a window manager
               NFS is Unix · Samba is Windows
               TELNET is for logging in, not for transferring
```

## Three Weeks Overlap in a Single Connection

One scene, **showing a graphical program from a remote server on my own screen**, contains X Window (W8), networking (W9), and Internet services (W10) all at once.

```bash
ssh -X alice@www.example.com         # run on my PC
echo $DISPLAY                        # from here on, it is the remote server's shell
# localhost:10.0
gedit &                              # a program on the server, but the window appears on my screen
```

```text
   My PC (the side sitting in front of the screen)       Remote server www.example.com

   ① Name to IP         /etc/hosts → DNS (53)
   ② SSH client  ──── TCP port 22, encrypted ────►    SSH server (sshd)
   ③ X server          ◄─── drawing requests inside the tunnel ──  gedit (X client)
      screen, keyboard, mouse
```

| Step | What happens | Unit |
|------|----------|------|
| ① | The name is looked up in `/etc/hosts`, and if it is not there, the DNS server in `/etc/resolv.conf` is asked | W9, W10 |
| ② | A TCP connection is made on **port 22**, and an encrypted SSH session opens on top of it | W9, W10 |
| ③ | The program run on the server asks **my PC's X server** to "draw a window" | W8 |

- **Within one connection, server and client get crossed.** Seen from SSH, the remote machine is the server, but seen from X, **my PC with the screen is the server**. The "opposite of the web" from week 8 is exactly this scene.
- A `DISPLAY` of `localhost:10.0` is a value SSH **sets automatically**. The format is still **host:display.screen**, and it points to a relay display number that SSH created inside the server (usually numbered from 10). Drawing requests sent there travel through the encrypted tunnel and arrive at the real screen `:0` of my PC.
- You can do the same thing with `xhost +` and `export DISPLAY=MY_PC_ADDRESS:0.0`, but that is a method that is **not encrypted and opens the screen to anyone**. The exam asks about this contrast.
- If ② had been TELNET (port 23), even the password would flow in plain text. Pair them up as **remote login is SSH, remote GUI is `ssh -X`**.

## Who Is the Server and Who Is the Client

Gathering the "direction" questions that appeared once each week into a single table shows they are the same type.

| Scene | Server side (the one providing) | Client side (the one using) | Where people get caught |
|------|-----------------|-------------------|-----------|
| X Window | **The computer with the screen and input devices** | The program that wants to show a window | Mistaking the remote server for the X server |
| SSH config files | `/etc/ssh/sshd_config` | `/etc/ssh/ssh_config` | The side with `d` (daemon) is the server |
| DNS | `/etc/named.conf` — the side that **answers** | `/etc/resolv.conf` — the side that **asks** | Thinking the DNS server address is written in `hosts` |
| FTP data connection | **Active** mode: the server connects | **Passive** mode: the client connects | The names are given from the server's point of view |
| Mail | **SMTP** between MTAs | The MUA fetches with **POP3, IMAP** | When sending, the user also uses SMTP |
| NFS | `/etc/exports`, `exportfs` | `mount -t nfs`, `showmount -e` | The config file exists only on the providing side |
| Virtualization | Host | Guest | A full-virtualization guest does not know it is a guest |

## Separating Names with the Same Initial

Linux Usage is **an exam of putting names into boxes**. Names that could be told apart week by week look clumped together by initial on a single exam paper.

| Initial | Name → box it goes in |
|------|---------------|
| **X** | X11 (X Window version) · X.org (X server implementation) · Xlib, XCB (low-level libraries) · XDM (display manager) · Xfce (desktop environment) · Xfwm (window manager) / **X.25** (packet-switched WAN standard) / **Xen** (hypervisor) |
| **K** | KDE (desktop environment) · KWin (window manager) · KDM (old display manager) / **KVM** (hypervisor) |
| **G** | GNOME (desktop environment) · GTK+ (toolkit) · GDM (display manager) / **Gopher** (menu-based information retrieval) |
| **L** | LXDE (desktop environment) · LightDM, LXDM (display managers) / LDAP (account information) / **LVS** (load balancing) |
| **M** | Mutter, Metacity (window managers) · Motif (toolkit) / MUA, MTA, MDA (mail components) · MX (DNS record) · MIME (mail standard) / MapReduce (Hadoop processing) |
| **N** | NFS (file sharing) · NNTP (newsgroups) · NTP (time sync) · NetBIOS (Samba component) · NS (DNS record) |
| **S** | SMTP (sending mail) · SMB (Samba protocol) · SNMP (network management) · SSH (remote login) · SOA (DNS record) / SDDM (display manager) / SaaS (cloud model) |
| **F** | FTP (file transfer) / FDDI (optical dual ring) · Frame Relay (WAN) / FLTK (toolkit) |
| **C** | CSMA/CD (wired media access) / CIFS (Samba) · CNAME (DNS alias) / CDE (desktop environment) |
| **H** | HTTP (web) / HPC (high-computation) · HA (high availability) · HDFS (Hadoop storage) |
| **V** | VDI, VMDK, VHD (virtual disk formats) — VirtualBox, VMware, and Microsoft respectively |

- In particular, **not everything starting with X belongs to X Window.** X.25 is a communication standard, and Xen is virtualization.
- Groupings like **three Ks (KDE, KWin, KDM) and KVM**, or **three Gs (GNOME, GTK+, GDM) and Gopher**, where "three are from one family and one is left over", show up as the four choices exactly as they are.

## Picking the One Different from the Other Three

This is the typical question shape for this subject. **You must be able to state what the three have in common first** to see the one left over. Try solving them with the middle column covered.

| Four choices | The odd one | What the other three have in common |
|--------|---------|---------------|
| KWin · Xfce · Windowmaker · Afterstep | **Xfce** | Window managers (Xfce is a desktop environment) |
| GDM · SDDM · LightDM · KWin | **KWin** | Display managers |
| GTK+ · Qt · FLTK · XCB | **XCB** | Toolkits (XCB is a low-level library) |
| HTTP · FTP · SMTP · TCP | **TCP** | Application layer protocols (TCP is transport layer) |
| X.25 · Frame Relay · ATM · CSMA/CD | **CSMA/CD** | WAN transmission technologies (CSMA/CD is a media access method) |
| 10.1.1.1 · 172.20.1.1 · 192.168.1.1 · 172.32.1.1 | **172.32.1.1** | Private IPs (172 is private only for 16-31) |
| FTP · NFS · Samba · TELNET | **TELNET** | Services for exchanging files |
| SMB · CIFS · NetBIOS · RPC | **RPC** | Samba components (RPC belongs on the NFS side) |
| A · AAAA · MX · IMAP | **IMAP** | DNS records |
| Xen · KVM · ESXi · VirtualBox | **VirtualBox** | Type 1 hypervisors |
| Android · Tizen · webOS · iOS | **iOS** | Linux-kernel-based operating systems |
| HPC · HA · load balancing · embedded | **Embedded** | Types of clusters |

## Subnets — The Reversed Form

If "given the mask, find the host count" is the basic form, **"given the host count, find the mask"** is the reversed form. From the memorized line **254 · 126 · 62 · 30 · 14 · 6 · 2**, choose **the smallest box that is at least the required number**.

| Hosts needed | Mask to choose | Block | Hosts in that box | Reasoning |
|------------|------------|------|---------------|------|
| 100 | 255.255.255.128 (/25) | 128 | 126 | The next box, 62, is not enough |
| 50 | 255.255.255.192 (/26) | 64 | 62 | The next box, 30, is not enough |
| 30 | 255.255.255.224 (/27) | 32 | 30 | A perfect fit |
| **31** | 255.255.255.192 (/26) | 64 | 62 | 30 is **one short**, so go up one box |
| 10 | 255.255.255.240 (/28) | 16 | 14 | The next box, 6, is not enough |
| 2 | 255.255.255.252 (/30) | 4 | 2 | A link connecting two devices |

- The trap is the fourth row. **Seeing the block size of 32 and reading it as "up to 32 machines" is wrong.** The limit is 30, after subtracting the 2 network and broadcast addresses.
- If asked for the **number** of subnets, it is `256 ÷ block`. For /26, 256 ÷ 64 = 4; for /27, 8. The number of hosts and the number of subnets are **such that when one grows, the other shrinks.**

## Judging Right and Wrong

| Sentence | Verdict | Reason |
|------|------|------|
| When connected with `ssh -X`, the X server runs on the remote server | ✗ | **My PC**, which has the screen, is the X server |
| KDE's toolkit is Qt and its current display manager is SDDM | ○ | KDM was the older one |
| Wayland is the next version of X11 | ✗ | Not a version but a **replacement protocol** |
| A switch decides routes by looking at IP addresses | ✗ | A switch is layer 2, **MAC**. IP is the router |
| 172.20.1.1 is a private IP | ○ | Within the range 172.16-172.31 |
| One subnet with 255.255.255.224 can hold 32 hosts | ✗ | 32 − 2 = **30 hosts** |
| SMTP is used both when a user sends mail and when servers pass it on | ○ | POP3 and IMAP are only for fetching |
| IMAP leaves mail on the server so it can be viewed from several devices | ○ | The one that downloads and deletes is POP3 |
| A PTR record is used to find a name from an IP address | ○ | Reverse lookup |
| A DNS server's address is written in `/etc/hosts` | ✗ | `/etc/resolv.conf` |
| FTP's control connection uses port 20 | ✗ | **21 is control**; 20 is data in active mode |
| Samba shares files between Unix machines based on RPC | ✗ | That is NFS. Samba uses SMB/CIFS with Windows |
| Heartbeat is how a load balancing cluster distributes requests | ✗ | It is the signal for confirming liveness in **high availability** |
| KVM is a Type 2 hypervisor installed on top of an operating system | ✗ | It is **Type 1**, where the kernel becomes the hypervisor |
| VirtualBox can read Microsoft's VHD images | ○ | It supports VMDK too |
| Both Android and iOS are based on the Linux kernel | ✗ | iOS is Darwin |

## Pre-Exam Check

- [ ] I can state the ten ports (21, 22, 23, 25, 53, 80, 110, 143, 443, 631) in **both directions: number → service, service → number**
- [ ] From the last value of a mask I can immediately state **the block and host count**, and conversely choose the mask from a host count
- [ ] I can write the first-octet ranges of classes A, B, C, and D and the three private IP ranges
- [ ] I can write the 7 OSI layers in order and place hubs, switches, and routers on the layers
- [ ] I can put **three names each** into window manager, display manager, and desktop environment
- [ ] I have memorized the GNOME row (GTK+, Mutter, GDM) and the KDE row (Qt, KWin, SDDM) across
- [ ] I can state the direction and difference of SMTP, POP3, and IMAP in one sentence each
- [ ] I know what each DNS record A, AAAA, MX, CNAME, NS, and PTR points to
- [ ] I can contrast NFS and Samba in three boxes: **the other OS · protocol · configuration file**
- [ ] I know the 3 cluster types, full and paravirtualization, Type 1 and 2, and the four facts about VirtualBox (Oracle, GPL, full virtualization, VMDK/VHD)

After finishing the check, proceed like this.

- If you get stuck on even one item, go back to **that week's Day 5 (comprehensive review)**. Each weekly review gathered the tables for that area onto a single page.
- At the exam, solve **the questions that ask for values first**, quickly, and mark the ones that take effort, such as subnet calculations, to come back to. With 80 questions in 100 minutes, that is a little over a minute per question.

## 📖 Glossary

- **X server** : The side with the screen and input devices. It is the computer the user is sitting at.
- **Display manager** : The program that provides the graphical login screen. Its name ends in DM.
- **Subnet mask** : The value that separates the network part from the host part.
- **MX record** : A DNS record that specifies the server that receives a domain's mail.
- **Samba** : Software that shares files with Windows through SMB/CIFS.
- **HA cluster** : A cluster configured so the service does not stop even when a failure occurs.

## 📝 Practice Questions

**Question 1.** Which of the following is the desktop environment that uses the GTK+ toolkit in X Window?

A) KDE  
B) GNOME  
C) LXQt  
D) CDE  

**Answer: B**  
Explanation: GNOME is based on the GTK+ toolkit written in C, and Xfce and MATE also use the same toolkit. KDE and LXQt use Qt, written in C++, and CDE uses the traditional Motif toolkit.

---

**Question 2.** Which of the following differs in nature from the other three?

A) GDM  
B) SDDM  
C) LightDM  
D) Mutter  

**Answer: D**  
Explanation: GDM, SDDM, and LightDM are all display managers that provide the graphical login screen, and their names end in DM. Mutter is a window manager that handles window borders and movement in GNOME, so its role is different.

---

**Question 3.** Which of the following is the OSI layer that uses port numbers and handles end-to-end communication?

A) Transport layer  
B) Network layer  
C) Session layer  
D) Presentation layer  

**Answer: A**  
Explanation: The transport layer, layer 4, distinguishes applications by port number, and TCP and UDP belong here. The network layer, layer 3, decides routes by IP address, and layer 2 uses MAC addresses.

---

**Question 4.** In a Class C network, when the subnet mask is 255.255.255.240, which of the following is the number of hosts usable in one subnet?

A) 16  
B) 30  
C) 14  
D) 62  

**Answer: C**  
Explanation: Subtracting 240 from 256 gives a block size of 16, and excluding the two addresses for the network address and the broadcast address leaves 14. When the mask is 224, it is 30, and when it is 192, it is 62.

---

**Question 5.** Which of the following is the protocol used in common both when a user's composed mail is sent to their own mail server and when that server forwards it to the recipient's server?

A) IMAP  
B) POP3  
C) NNTP  
D) SMTP  

**Answer: D**  
Explanation: SMTP is used both when a user sends mail and when mail servers pass mail to each other. POP3 and IMAP are used only when a user fetches or reads mail that has arrived, and NNTP is the protocol for newsgroups.

---

**Question 6.** Which of the following is the DNS record that links a domain name to an IPv6 address?

A) AAAA  
B) A  
C) MX  
D) SOA  

**Answer: A**  
Explanation: A 128-bit IPv6 address is linked with an AAAA record, while a 32-bit IPv4 address uses an A record. MX points to the mail server, and SOA holds basic information about the zone such as the administrator and the refresh interval.

---

**Question 7.** Which of the following is the FTP mode in which the client opens the data connection itself and that is mainly used in firewall environments?

A) Active mode  
B) Passive mode  
C) Binary mode  
D) Anonymous mode  

**Answer: B**  
Explanation: In passive mode, the client opens even the data connection itself, so it is not blocked by the client-side firewall. In active mode, the server tries to connect to the client from port 20, so it easily fails in environments behind a firewall.

---

**Question 8.** Which of the following is the file that configures the behavior of a Samba server?

A) /etc/exports  
B) /etc/resolv.conf  
C) /etc/samba/smb.conf  
D) /etc/cups/cupsd.conf  

**Answer: C**  
Explanation: Samba configures the directories to share and their access permissions in `/etc/samba/smb.conf`, and two daemons, `smbd` and `nmbd`, run. `/etc/exports` is for NFS, `/etc/resolv.conf` is for DNS server addresses, and `cupsd.conf` is the configuration file of the printing system.

---

**Question 9.** Which of the following is the cluster configured so that several nodes split and process one big computation?

A) Load balancing cluster  
B) HPC cluster  
C) HA cluster  
D) Hybrid cluster  

**Answer: B**  
Explanation: In an HPC cluster, several nodes split a big computation, such as weather forecasting or genome analysis, and process it in parallel. Load balancing is about sharing requests, and high availability is a setup that keeps the service from being cut off even when a failure occurs, so their purposes are different.

---

**Question 10.** Which of the following is the virtualization method that lets a guest operating system run in a virtual machine without being modified?

A) Paravirtualization  
B) Container approach  
C) Emulation  
D) Full virtualization  

**Answer: D**  
Explanation: In full virtualization, the hypervisor imitates the hardware as is, so there is no need to modify the guest operating system, and performance is also secured with hardware support such as Intel VT-x and AMD-V. Paravirtualization performs well in exchange for requiring modification of the guest kernel.
