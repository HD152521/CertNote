# Day 1 - Clustering

## 📌 Key Takeaways

- A cluster is a setup that **ties multiple computers together and uses them as if they were one**.
- By purpose, clusters fall into three types — **High Performance Computing (HPC), High Availability (HA), and Load Balancing (LB)**.
- **HPC computes fast**, **HA never stops**, and **load balancing splits the work**.
- In practice, web services usually combine **load balancing + high availability**.
- The classic Linux-built HPC cluster is the **Beowulf cluster**.

## What Is a Cluster

```text
   [ User ]
        │
        ▼
   ┌─────────────────────────────┐
   │  Several computers (nodes)  │
   │  are tied together and      │
   │  look like a single machine │
   │   ▢  ▢  ▢  ▢               │
   └─────────────────────────────┘
```

- There is a limit to boosting the performance of a single machine, and the cost rises sharply. **Tying several machines together is cheaper and easier to expand.**
- Each computer in the group is called a **node**.
- The nodes are **connected over a network**, and from the outside they must look like **a single system**. Ten servers placed side by side that know nothing about each other are not a cluster.

| Category | **Scale-up** | **Scale-out** |
|------|---------------------|------------------------|
| Method | Replace one machine with **better parts** | **Increase the number of machines** |
| Limit | Part performance has a ceiling and the price rises sharply | More machines means more to manage |
| Failure | If that one machine stops, everything stops | If one machine stops, the rest remain |
| Relation to clusters | — | **A cluster is this approach** |

- If you see the phrase "several cheap PCs" in a passage, it is talking about scale-out, that is, a cluster.

## The Three Types of Clusters

| Type | Purpose | Keywords |
|------|------|-------|
| **HPC cluster** (High Performance Computing) | **Fast computation** | Parallel processing, supercomputer |
| **HA cluster** (High Availability) | **A service that never stops** | Redundancy, failover |
| **LB cluster** (Load Balancing) | **Split requests and process them** | Traffic distribution |

> **Memorizing the definitions separately** is the whole point of this unit. Questions come in the form of picking which of the three is being described.

The quickest question for telling the three apart is **"what do the machines share?"**

| Question | HPC | HA | LB |
|------|-------------|------------|------------|
| What is split | **One big job**, broken into pieces | Nothing is split. They only **stand ready to do the same job** | **Many unrelated requests**, one at a time |
| Relationship between nodes | **Cooperate**, exchanging pieces | **Monitor** each other | Don't need to know each other |
| Criterion for success | Computation **finishes quickly** | The service **never gets cut off** | **Many requests** are handled |
| If one machine stops | The job slows down or must be rerun | **The standby node takes over** | The remaining nodes share the requests |
| Representative name | **Beowulf** | heartbeat | **LVS** |

- **High-computation, high-performance, HPC, parallel, and supercomputer** are all words for the same box. Even if a choice says "high-performance cluster", read it as the same as HPC.
- **"High performance" and "high availability" only look alike; they are on opposite sides.** The former is about speed, the latter about no downtime.

### HPC Cluster

| Item | Details |
|------|------|
| Full name | **High Performance Computing** |
| Purpose | Process **one big computation split up and run at the same time** |
| Used for | Weather forecasting, genome analysis, simulation |
| Representative | **Beowulf cluster** |

- **Several nodes split and solve a single problem.** That is why it is also called **parallel computing**.
- A **Beowulf cluster** is an HPC cluster built by tying cheap PCs together with Linux. The name itself gets asked.

```text
   User ──► Master node ──┬── Compute node 1   computes piece A
            (splits the   ├── Compute node 2   computes piece B
             job, hands   ├── Compute node 3   computes piece C
             out pieces,  └── Compute node 4   computes piece D
             collects            │
             results)    ▲       │
                    └── results merged into one answer ──┘
```

- Beowulf began in **1994 at NASA**, when several ordinary PCs were tied together with Ethernet. The idea was to do the same job with **common parts and open software** instead of an expensive dedicated supercomputer.
- The layout is **one master node + several compute nodes**. Users connect only to the master, and the compute nodes just do the computation they are told to do.
- The nodes need conventions for exchanging pieces and results. The parallel programming libraries used for this are **MPI** (Message Passing Interface) and **PVM** (Parallel Virtual Machine).
- Not every program gets faster. Only **programs written so that the work can be broken into pieces** benefit from adding nodes. That is why it does not suit services like web servers, where each request is small.

### HA Cluster

| Item | Details |
|------|------|
| Full name | **High Availability** |
| Purpose | Keep the service **running even when a failure occurs** |
| Method | Normally the **primary server** works, and when it dies the **standby server** takes over |
| Keywords | **Redundancy · failover · heartbeat** |

```text
   Primary server (Active) ──── serving
        │  heartbeat checks that each is alive
   Standby server (Standby) ── waiting

   If the primary dies  →  the standby takes over immediately (failover)
```

- **Availability** is "the percentage of time the service is up". It is used for **systems that must not stop**, such as banks and hospitals.
- The goal is **not to raise performance but to keep the service from being cut off**. This distinction is important.

The terms used in an HA setup follow one after another.

| Term | Meaning |
|------|-----|
| **Single point of failure (SPOF)** | A point where, if that one thing stops, **everything stops**. High availability is about eliminating these |
| **Redundancy** | Having **two or more** devices that play the same role |
| **Heartbeat** | The **"I'm alive" signal** that nodes exchange periodically |
| **Failover** | When the signal stops, the standby node **takes over the role** |
| **Failback** | After repairing the failed node, **returning to the original arrangement** |

- Read as a flow: **heartbeat stops → failover → (repair) → failback**. Choices that swap failover and failback are the trap.
- Users do not notice the server has changed, because the **standby node takes over the service address as is**.

| Setup | Normally | On failure | Characteristics |
|------|------|-----------|------|
| **Active-Standby** | Only one machine works and the other **stands by** | The standby server takes over | Simple. The standby machine sits idle normally |
| **Active-Active** | **Both work** | The remaining machine takes on everything | Uses all resources, but one machine must have enough headroom to carry the load alone |

Availability is "the percentage of time alive", so it is **promised as a number**. Each additional 9 cuts the allowed downtime to one tenth.

| Availability | Allowed downtime per year |
|-------|-------------------|
| 99% | About 3.65 days |
| 99.9% | About 8.76 hours |
| 99.99% | About 53 minutes |
| 99.999% | About 5 minutes |

- The calculation is **1 year (8,760 hours) × (1 − availability)**. For 99.9%, 8,760 × 0.001 = 8.76 hours.
- On Linux, HA clusters are built with open software such as **Heartbeat**, **Pacemaker**, and **Corosync**. At Level 2, the exam asks not how to build one but only for the link **"heartbeat = an HA term"**.

### LB Cluster

| Item | Details |
|------|------|
| Full name | **Load Balancing** |
| Purpose | **Distribute** incoming requests **across several servers** |
| Used for | **Web servers** and services with heavy traffic such as online shops |
| Representative | **LVS** (Linux Virtual Server) |

```text
              Requests
                │
          ┌─────┴─────┐
       Load balancer
       ┌────┬────┬────┐
     Web1 Web2 Web3 Web4
```

- Traffic that one machine cannot handle is **shared among several machines**.
- Even if one machine dies, the rest keep serving, so **availability goes up too.**

**LVS** (Linux Virtual Server) is a project that builds a load balancer with a feature of the Linux kernel.

| Name | Role |
|------|------|
| **Virtual IP (VIP)** | **One representative address** that users connect to. Users do not know how many servers are behind it |
| **Director** | The **load balancer** that receives requests and passes them back |
| **Real server** | The back-end servers that actually process the requests |
| `ipvsadm` | The **admin command** that configures LVS distribution rules |

- The "Virtual" in the name does not mean a virtual machine; it means **several machines look like a single server**. Don't confuse it with the virtualization we cover tomorrow.
- Three methods of forwarding requests are known: **NAT · DR (Direct Routing) · TUN (IP tunneling)**, and who gets each request is decided by a scheduling method.

| Scheduling | Selection criterion |
|---------|-----------|
| **Round Robin** | Takes turns, **rotating** one request at a time |
| Weighted Round Robin | **More often** to higher-performance servers |
| **Least Connection** | To the server with the **fewest connections** right now |
| Weighted Least Connection | Considers the server's performance weight as well as the connection count |

- What you need at Level 2 is the pair **"LVS = load balancing"**. For the method and scheduling names, it is enough that they do not look unfamiliar when you read a passage.

## In Practice They Are Used Together

> **Web services usually combine load balancing and high availability.** Splitting requests across several servers (load balancing) while the rest keep handling requests even if one dies (high availability) means the two goals fit together naturally.

- If the combination **"load balancing + high availability"** appears among the choices, it is usually the answer. Conversely, HPC has a different nature from web services.

```text
                  User requests
                      │
        ┌─────────────┴─────────────┐
   Balancer A (Active) ══heartbeat══ Balancer B (Standby)   ← high availability
        └─────────────┬─────────────┘
              ┌───────┼───────┐
             Web1    Web2    Web3                           ← load balancing
```

- If you only increase the number of web servers, **a single load balancer remains as a single point of failure**. So the load balancer itself is made redundant as Active-Standby. This diagram is what "load balancing + high availability" actually looks like.
- For combination questions, look first at **the nature of the service**.

| Situation | What is needed | Combination |
|------|---------|------|
| A busy online shop or portal | Request distribution + no downtime | **Load balancing + high availability** |
| Weather forecasting, genome analysis | Big computation, quickly | **HPC** |
| A bank ledger DB with few requests that must never stop | No downtime | **High availability** |

## Telling Them Apart from Passages

Passages leak **keywords** instead of the cluster name. Practice picking the box from the words.

| Expression in the passage | Answer |
|---------------|-----|
| "One big computation is split among several nodes and run in parallel" | HPC |
| "Supercomputer-class performance with cheap PCs" | HPC (Beowulf) |
| "Using parallel libraries such as MPI and PVM" | HPC |
| "So that the service does not stop even if a failure occurs" | HA |
| "Primary and standby servers, checking status with a heartbeat" | HA |
| "Redundancy", "failover" | HA |
| "Spread incoming requests evenly across several servers" | Load balancing |
| "Large volumes of web traffic", "round robin" | Load balancing |
| "LVS", "several servers behind a single virtual IP" | Load balancing |
| "Using the spare resources of geographically separated computers" | Not a cluster but a **grid** |

## Commonly Missed Points

1. **An HA cluster raises performance** → No. The purpose is **no downtime**. The standby server in an Active-Standby setup does not work normally.
2. **Load balancing and HPC are the same thing** → Both "split", but **load balancing splits different requests**, while **HPC splits the pieces of one job**.
3. **Beowulf is a load balancing cluster** → It is **HPC**. The representative load balancer is **LVS**.
4. **Heartbeat is a load balancing method** → It is the signal that confirms node liveness in **high availability**.
5. **Failback is the action of switching over to the standby server** → That is **failover**. Failback is the action of returning.
6. **Embedded systems and grids are also kinds of clusters** → No. There are **only three** cluster types.
7. **Doubling the nodes makes anything twice as fast** → It only helps for computations that can be broken into pieces.
8. **LVS is a virtual machine technology** → It is **load balancing**, not virtualization.

## Distinguishing Similar Concepts

| Concept | Meaning |
|------|-----|
| **Cluster** | Several computers tied together **as one** — same location, tightly connected |
| **Grid computing** | Gathers and uses the spare resources of computers that are **scattered** |
| **Cloud computing** | A service model where you **rent** resources |
| **Embedded system** | A system **built into a device** for a specific function |

- **An embedded system is not a cluster.** This name gets mixed into questions like "which of the following is not a type of cluster".

> Tomorrow we cover virtualization technologies and the features of each product.

## 📖 Glossary

- **Cluster** : A setup that ties several computers together so they act as one.
- **Node** : Each individual computer that makes up a cluster.
- **HPC cluster** : A cluster in which several nodes split and process one big computation.
- **Beowulf cluster** : The classic HPC cluster built by tying cheap PCs together with Linux.
- **HA cluster** : A cluster configured so the service does not stop even when a failure occurs.
- **Failover** : The action where the standby server takes over the role when the primary server stops.
- **Heartbeat** : The signal nodes exchange periodically to confirm that each other is alive.
- **LB cluster** : A cluster that distributes requests across several servers.
- **LVS** : Linux Virtual Server, which builds a load balancer with Linux. It has nothing to do with virtual machines.
- **Grid computing** : A method of gathering and using the idle resources of geographically scattered computers.

## 📝 Practice Questions

**Question 1.** Which of the following is the cluster configured so that the service does not stop even if a failure occurs in the system?

A) HPC cluster  
B) HA cluster  
C) Load balancing cluster  
D) Grid computing  

**Answer: B**  
Explanation: In an HA cluster, when a problem occurs on the primary server, the standby server immediately takes over its role so the service is not interrupted. Its purpose is no downtime rather than performance improvement, and redundancy and failover are the key concepts.

---

**Question 2.** Which of the following is hard to consider a type of cluster?

A) HPC cluster  
B) Load balancing cluster  
C) HA cluster  
D) Embedded system  

**Answer: D**  
Explanation: An embedded system is a system built into a device to perform a specific function, which is an entirely different concept from a cluster that ties several computers together. By purpose, clusters are divided into three types: HPC, high availability, and load balancing.

---

**Question 3.** Which of the following is the classic HPC cluster built by tying cheap PCs together with Linux?

A) Beowulf cluster  
B) LVS  
C) Heartbeat  
D) Grid  

**Answer: A**  
Explanation: A Beowulf cluster is an HPC cluster made by connecting ordinary PCs over a network and installing Linux to perform parallel computation. LVS is the Linux Virtual Server used for load balancing, and heartbeat is the method for checking node liveness in an HA setup.

---

**Question 4.** Which of the following is the cluster that distributes incoming requests across several servers to increase throughput?

A) HPC cluster  
B) HA cluster  
C) Load balancing cluster  
D) Embedded cluster  

**Answer: C**  
Explanation: In a load balancing cluster, a load balancer distributes requests across several servers to handle traffic that one machine would struggle with. It is mainly used for web services with heavy traffic, and LVS is a representative implementation.

---

**Question 5.** Which of the following is the combination of clusters generally applied together when building a web service with heavy traffic?

A) HPC and high availability  
B) Load balancing and high availability  
C) HPC and load balancing  
D) HPC and grid  

**Answer: B**  
Explanation: A web service has several servers share many requests, and if one of them fails the others must keep processing, so load balancing and high availability are configured together. An HPC cluster is for splitting and solving one big computation, so its nature is different.
