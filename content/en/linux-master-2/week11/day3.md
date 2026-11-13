# Day 3 - Embedded Systems and Technology Trends

## 📌 Key Takeaways

- An **embedded system is a system built into a device for a specific function**. It is found inside refrigerators, routers, and cars.
- **Android is based on the Linux kernel.** **iOS is not** — this distinction gets asked.
- Operating systems that use the Linux kernel — **Android · Tizen · webOS · ChromeOS**.
- The three cloud service models — **IaaS (infrastructure) · PaaS (platform) · SaaS (software)**.
- The representative of big data distributed processing is **Hadoop**.

## Embedded Systems

| Item | Details |
|------|------|
| Definition | A computer system **built into a device to perform a specific function** |
| Characteristics | Does only fixed tasks · **limited** resources · stays on for a long time |
| Examples | **Routers, smart TVs, refrigerators, cars, medical devices, drones** |

- Unlike a general-purpose PC, **its job is fixed.** So it is made small, containing only the needed functions.
- **The reasons Linux is widely used in embedded systems** are clear.

| Reason | Explanation |
|------|------|
| **Free** | No license cost |
| **Open source** | You can pick only the parts you need and **trim them down** |
| **Portability** | Supports **many CPUs** such as ARM and MIPS |
| Stability | Holds up well even when left on for a long time |

- An **RTOS** (Real-Time Operating System) is an operating system for systems that **must respond within a fixed time**. It is used where lateness is not allowed, such as a car's braking system.

| Category | General-purpose computer (PC, server) | Embedded system |
|------|------------------|--------------|
| What it does | **Up to the user** | **Fixed at manufacture** |
| Resources | Plenty of CPU, memory, and storage | **Small and limited.** Saves power too |
| Storage | Hard disk, SSD | Mostly **flash memory** |
| Screen and keyboard | Yes | **Often none** |
| Software installation | Freely by the user | Only what the manufacturer put in (firmware) |
| CPU | Mostly x86 | **ARM**, MIPS, and others |

### What Embedded Linux Is Made Of

The week 2 boot sequence (bootloader → kernel → root file system) is there **as is, only smaller**.

| Component | Common in embedded | Job |
|------|----------------|--------|
| Bootloader | **U-Boot** | Loads the kernel into memory when power is applied (the PC's GRUB spot) |
| Kernel | A **Linux kernel** with only the needed features left | Built without drivers for devices the device does not have |
| Root file system | **BusyBox** | A tool that packs hundreds of basic commands like `ls`, `cp`, and `sh` into **a single executable** |

- This is where **why "open source" matters for embedded** shows up. The kernel has to be **trimmed and rebuilt yourself** to fit in a small device, which is impossible without the source.
- An embedded device is too weak to build programs on itself. So we use **cross-compilation: building executables for the target device (ARM) on a development PC (x86)**.

```text
   Development PC (host, x86)               Embedded board (target, ARM)
   ┌─────────────────────┐    transfer      ┌──────────────────────┐
   │ Builds an ARM       │ ───────────►     │ Runs the ARM         │
   │ executable with a   │                  │ executable (does not │
   │ cross compiler      │                  │ build here)          │
   └─────────────────────┘                  └──────────────────────┘
```

### Two Grades of Real-Time

| Category | If the deadline is missed | Examples |
|------|-----------|-----|
| **Hard real-time** | It is a **failure or an accident** | Airbags, braking systems, medical devices |
| **Soft real-time** | Quality merely drops | Video playback, voice calls |

- Real-time is **not "fast" but "a guarantee of not being late"**. Even if the average is slow, it is real-time as long as deadlines are not violated.
- Linux is originally a **general-purpose operating system**, so it prioritizes throughput. Where strict real-time is needed, a dedicated RTOS such as **VxWorks or QNX** is used, or a real-time patch is applied to Linux. VxWorks and QNX are **not based on the Linux kernel.**

## Operating Systems Based on the Linux Kernel

| Operating system | Made by | Used for |
|---------|--------|----------|
| **Android** | **Google** | **Smartphones, tablets** |
| **Tizen** | Samsung, Intel | Smartwatches, TVs |
| **webOS** | LG (originally Palm) | Smart TVs |
| **ChromeOS** | Google | Chromebooks |
| Raspberry Pi OS | Raspberry Pi Foundation | Small boards |

> ⚠️ **iOS and macOS do not use the Linux kernel.** They use Apple's Darwin (BSD family) kernel. **Windows is of course not either.** These names appear as wrong answers in questions like "which is not an operating system based on the Linux kernel".

- **Android is the Linux kernel with its own framework on top.** It shares the kernel but does not use the GNU toolset.

```text
   ┌──────────────────────────────────────────────┐
   │ Apps        Phone · camera · downloaded apps │
   ├──────────────────────────────────────────────┤
   │ Application framework   Java APIs apps call  │
   ├──────────────────────────────────────────────┤
   │ Native libraries · Android Runtime (ART)     │  ← layer made by Google
   ├──────────────────────────────────────────────┤
   │ Linux kernel   drivers · memory · processes  │  ← layer shared with Linux
   └──────────────────────────────────────────────┘
```

| Layer | Regular Linux distribution | Android |
|----|----------------|---------|
| Kernel | Linux kernel | **Linux kernel** (the same) |
| C library | GNU's glibc | Google's **Bionic** |
| Basic commands and tools | GNU toolset | Its own tools |
| How apps run | Executables run directly | Run on a **runtime (ART, formerly Dalvik)** |
| License | Mostly GPL | Kernel is GPL, **most of what is above it is Apache 2.0** |

- Android is the operating system of a company that Google **acquired in 2005**, and it was released together with the **OHA** (Open Handset Alliance), an alliance of manufacturers and carriers.
- The table above is the basis for saying in week 1 that "Android is not a Linux distribution". **Only the kernel layer is the same; the rest is different.**

Separate the names that get mixed into the choices into two boxes.

| **Is** based on the Linux kernel | **Is not** based on the Linux kernel |
|---------------------|------------------------|
| **Android** (Google) | **iOS · macOS** (Apple, Darwin) |
| **Tizen** (Samsung, Intel) | **Windows · Windows Mobile** (Microsoft) |
| **webOS** (Palm → LG) | **Symbian** (Nokia and others) |
| **ChromeOS** (Google) | QNX · VxWorks (RTOS) |
| MeeGo (Nokia, Intel) | FreeBSD · Solaris (Unix) |
| Firefox OS (Mozilla) | |

- What matters about the left box is that **the makers are all different**. Because the Linux kernel is released under the GPL, anyone can take it and use it as the foundation of their own operating system.
- **Tizen and webOS survived in TVs and home appliances** rather than smartphones. If a passage says "the operating system of a smart TV", it is one of these two.

## Cloud Computing

| Model | What it provides | Example |
|------|-----------|-----|
| **IaaS** | **Infrastructure** — servers, storage, networks | AWS EC2 |
| **PaaS** | **Platform** — runtime environment and development tools | App Engine |
| **SaaS** | **Software** — finished software | Web mail, web office |

```text
   IaaS  ─── Rent only the hardware.  I install from the OS up
   PaaS  ─── Runtime environment provided.  Just deploy the app
   SaaS  ─── Use the finished product.      Nothing to install
```

- **Tell them apart by the middle letter** — **I is Infrastructure, P is Platform, S is Software**.
- The further down you go, **the less there is for you to manage.**

Spreading "who manages it" out by layer shows the boundaries of the three models.

| Layer | Build it yourself | **IaaS** | **PaaS** | **SaaS** |
|----|---------|---------|---------|---------|
| Application | Me | Me | **Me** | Provider |
| Runtime environment (runtime, middleware) | Me | Me | Provider | Provider |
| Operating system | Me | **Me** | Provider | Provider |
| Servers, storage, network, virtualization | Me | Provider | Provider | Provider |

- **The boundary between IaaS and PaaS is the operating system.** If "the user installs from the operating system up", it is IaaS; if "just deploy the app", it is PaaS.
- **The boundary between PaaS and SaaS is the application.** If you deploy a program you made, it is PaaS; if you just use a finished product made by someone else, it is SaaS.
- Unfamiliar names like **DaaS** (Desktop as a Service — a service for renting a desktop screen) sometimes get mixed into the choices. Just knowing it is not one of the three basic models lets you filter it out.
- The cloud is a **service built on the virtualization** we learned yesterday. One physical server is split into several virtual machines and rented to several customers. That is why "virtualization" appears in the bottom row of IaaS.

| Characteristic | Meaning |
|------|-----|
| **On demand** | Users turn resources on and off themselves, without going through a person |
| **Pay as you go** | You pay according to usage instead of buying equipment |
| **Elasticity** | Scale up when traffic surges and scale down when it is quiet |

| Deployment type | Meaning |
|----------|-----|
| **Public cloud** | Shared, rented by anyone |
| **Private cloud** | Exclusive to an organization |
| **Hybrid** | A mix of the two |

- **OpenStack** is a representative **open-source platform** for building private clouds.
- OpenStack was started in 2010 by **NASA and Rackspace**. As a service model it is a tool for building **IaaS**, and it is installed on Linux servers.
- Similar open-source projects include **CloudStack** and **Eucalyptus**. All three are not services for "**renting** the cloud" but software for "**building** the cloud yourself".

| Easily confused pair | Deciding criterion |
|-----------|-----------|
| Public vs private | **Who uses it** — an unspecified crowd, or a single organization |
| IaaS vs PaaS vs SaaS | **What is rented** — infrastructure, a platform, or software |
| Cloud vs virtualization | Virtualization is a **technology**; the cloud is a **service form** built with that technology |
| Cloud vs grid | The cloud **is rented**; the grid **gathers scattered spare resources** |

## Big Data

| Technology | Job |
|------|--------|
| **Hadoop** | **Splits large volumes of data across several servers to store and process** |
| **HDFS** | Hadoop's **distributed file system** |
| **MapReduce** | A method of splitting up the processing (Map) and merging (Reduce) |
| **Spark** | **Faster, memory-based** processing than Hadoop |
| **NoSQL** | Databases for unstructured data (MongoDB and others) |

- The characteristics of big data are explained by the **3 Vs** — **Volume · Velocity · Variety**.
- Both Hadoop and Spark **run on Linux**.

Read Hadoop as two parts: **storage (HDFS)** and **processing (MapReduce)**.

```text
   HDFS — cuts big files into blocks and replicates them across several servers

     NameNode (remembers which block is where — holds only the listing)
        │
     ┌──┴─────────┬────────────┐
   DataNode 1   DataNode 2   DataNode 3      ← store the actual data
    Block A      Block A      Block A        same block, 3 copies by default
```

| Name | Role |
|------|------|
| **NameNode** | Manages which blocks a file is split into and **where they are** |
| **DataNode** | **Actually stores** the blocks |
| Replication | Keeps **3 copies by default** of the same block. The data survives even if one server breaks |

Following MapReduce through "word counting" makes the meaning of the name clear.

```text
   Input       Server 1: linux unix linux     Server 2: unix linux

   Map        (linux,1) (unix,1) (linux,1)   (unix,1) (linux,1)     ← each splits and marks
   Gather      linux → 1,1,1                  unix → 1,1             ← same words together
   Reduce     linux 3                        unix 2                 ← summed up
```

- **Map scatters and processes individually**, and **Reduce gathers and sums up**. Because the computation happens right on the server that holds the data, there is no need to move big data to one place.
- Hadoop is an **Apache Foundation open-source project** and is written in **Java**. In that it ties together several cheap servers, it shares its roots with the cluster from day 1.
- Hadoop and the HPC cluster both "split and process", but the target differs. **HPC is for big computation**, **Hadoop is for big data**.

| The Vs of big data | Meaning |
|-----------|-----|
| **Volume** | The amount is large |
| **Velocity** | Data is generated and processed quickly |
| **Variety** | The forms are diverse (text, photos, logs, and so on) |
| Veracity · Value | Accuracy · value — the Vs added as the fourth and fifth |

- The basic set is the **3 Vs** (volume, velocity, variety). Plausible-sounding Vs like Virtual and Visual get mixed into the choices.

## Where Linux Is Used

| Field | Details |
|------|------|
| **Servers** | Web, mail, DB, and file servers — the largest market |
| **Supercomputers** | **The world's top supercomputers are practically all Linux** |
| **Mobile** | **Android** |
| **Embedded** | Routers, TVs, cars |
| **Cloud** | Most cloud instances are Linux |
| Desktop | A small share, but steady |

- The fact that **Linux's share in the supercomputer field is overwhelming** falls within the exam scope. It is because the source can be modified to fit the hardware.
- On **TOP500**, the world supercomputer ranking, all 500 systems have been Linux since November 2017.
- The reasons Linux is chosen in each field boil down to two — **it costs nothing**, and **the source can be modified to fit**. Embedded picks it to trim down, supercomputers to tune to the hardware, and the cloud to eliminate the license cost of countless instances.

## Recent Technology Terms

| Term | Meaning |
|------|-----|
| **IoT** | Internet of Things |
| **5G** | Fifth-generation mobile communication. The standard is made by **3GPP** |
| **Edge computing** | Processing **close by** rather than at a center |
| **Container orchestration** | Automatically managing containers — **Kubernetes** |

- **IoT** is **things such as appliances, sensors, and cars connecting to the internet and exchanging data with each other**. What sits inside those things is the **embedded system** we learned about at the start of today.
- The characteristics of **5G** are summarized as three — **ultra-fast · ultra-low latency · massive connectivity**. The body that makes the standard is **3GPP**, exactly as covered in week 9.
- **Edge computing** is the opposite side of the cloud. Sending all data to a distant data center is slow, so it is **processed first, close to the device**.

| Category | Cloud computing | Edge computing |
|------|-------------|-----------|
| Where it processes | A **central data center** far away | **Close to** the device |
| Strength | Large capacity, large-scale analysis | **Low latency** |
| Suited to | Data storage and statistics | Things that need an immediate reaction, such as autonomous driving and factory control |

- **Kubernetes** is an open-source project started by Google. If yesterday's Docker is the tool that **starts one container**, Kubernetes is the tool that **places many containers across several servers and restarts them if they die**.

## Telling Them Apart from Passages

| Expression in the passage | Answer |
|---------------|-----|
| "Built into a device for a specific function" | Embedded system |
| "Guarantees a response within a fixed time" | RTOS |
| "A mobile operating system based on the Linux kernel" | Android |
| "Rent servers and storage, install the operating system yourself" | IaaS |
| "Provides even the development and runtime environment, just deploy the app" | PaaS |
| "Finished software used through a web browser" | SaaS |
| "Open source for building a private cloud" | OpenStack |
| "Distributed storage and processing of large volumes of data" | Hadoop |
| "Hadoop's distributed file system" | HDFS |
| "Faster processing based on memory" | Spark |
| "Automatically deploys and manages containers" | Kubernetes |
| "Things connected through the internet" | IoT |

## Commonly Missed Points

1. **iOS is also based on the Linux kernel** → No. It is Apple's **Darwin**. It only resembles Linux in being Unix-family.
2. **Android is a Linux distribution** → It **shares only the kernel**. It does not use GNU tools.
3. **Tizen and webOS have their own kernels** → Both are **based on the Linux kernel**.
4. **An embedded system is a type of cluster** → A completely different concept. It was a wrong choice in the day 1 question.
5. **An RTOS is the operating system with the fastest processing speed** → It is not about speed but a **guaranteed deadline**.
6. **With PaaS you install from the operating system up** → That is **IaaS**. PaaS gives you the runtime environment too.
7. **SaaS is the model that rents out infrastructure** → The order is reversed. **I is infrastructure, S is software.**
8. **OpenStack is a big data technology** → It is a **cloud-building** platform. Big data is **Hadoop**.
9. **HDFS processes the data** → HDFS is for **storage**; processing is **MapReduce**.
10. **Kubernetes is a tool for creating containers** → Docker does the creating; Kubernetes does the **management (orchestration)**.

## Expanding the Abbreviations

| Abbreviation | Full name |
|-------|-------|
| **RTOS** | Real-Time Operating System |
| **IoT** | Internet of Things |
| **IaaS** | Infrastructure as a Service |
| **PaaS** | Platform as a Service |
| **SaaS** | Software as a Service |
| **HDFS** | Hadoop Distributed File System |
| **OHA** | Open Handset Alliance |

> From tomorrow, we gather everything learned so far and work through comprehensive questions.

## 📖 Glossary

- **Embedded system** : A computer system built into a device for a specific function.
- **RTOS** : A real-time operating system that must respond within a fixed time.
- **Android** : A mobile operating system made by Google based on the Linux kernel.
- **IaaS / PaaS / SaaS** : Cloud service models that provide infrastructure / a platform / software.
- **OpenStack** : An open-source platform for building private clouds.
- **Hadoop** : A big data technology that splits large volumes of data across several servers to store and process.
- **HDFS** : Hadoop's distributed file system.
- **MapReduce** : A processing method in which data is split and processed on several servers (Map) and the results are gathered and merged (Reduce).
- **Cross-compilation** : Building, on a development PC, executables for a device with a different CPU architecture.
- **Kubernetes** : An orchestration tool that automatically deploys and manages containers.

## 📝 Practice Questions

**Question 1.** Which of the following is a mobile operating system built on the Linux kernel?

A) iOS  
B) Windows Mobile  
C) Symbian  
D) Android  

**Answer: D**  
Explanation: Android is a mobile operating system made by Google by putting its own framework on top of the Linux kernel. iOS is based on Apple's Darwin kernel and has a different lineage from the Linux kernel. Tizen and webOS are other systems based on the Linux kernel.

---

**Question 2.** Which of the following statements about embedded systems is correct?

A) It is a setup that ties several computers together to use as one  
B) It is a system built into a device to perform a specific function  
C) It is a service form that rents resources over the internet  
D) It is a technology that stores and processes large volumes of data in a distributed way  

**Answer: B**  
Explanation: An embedded system is a system mounted inside a device to perform a fixed function, such as a router, smart TV, or car. Because resources are limited, it is built small with only the needed features, and Linux, whose source can be trimmed down, is widely used.

---

**Question 3.** Which of the following is the operating system used in systems that must complete processing within a fixed time?

A) Distributed operating system  
B) Multi-user operating system  
C) Real-time operating system  
D) Batch processing operating system  

**Answer: C**  
Explanation: A real-time operating system (RTOS) guarantees a response to a request within a fixed time and is used in fields where delay is not tolerated, such as car braking systems and medical devices. It prioritizes predictability of response time over throughput.

---

**Question 4.** Which of the following is the representative big data technology that stores and processes large volumes of data distributed across several servers?

A) Hadoop  
B) OpenStack  
C) Kubernetes  
D) Docker  

**Answer: A**  
Explanation: Hadoop splits large volumes of data across several servers and processes them in parallel through the HDFS distributed file system and the MapReduce processing method. OpenStack is a cloud-building platform, and Kubernetes and Docker are container-related technologies.

---

**Question 5.** Which of the following is the cloud service model that rents out hardware resources such as servers and storage, with the user installing everything from the operating system up?

A) SaaS  
B) PaaS  
C) DaaS  
D) IaaS  

**Answer: D**  
Explanation: IaaS stands for Infrastructure as a Service and provides only infrastructure such as servers, storage, and networks, while the user configures the operating system and the software on top of it. PaaS provides up to the runtime environment, and SaaS provides up to the finished software.
