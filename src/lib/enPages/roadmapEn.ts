// 직무별 로드맵 영어판 문구(한국어 정본은 content/roadmaps.json). 숫자·자격증 이름·시험 사실은 여기 두지 않고
// 한국어판과 같은 데이터(cert 메타·exam-info)에서 온다 — 이 파일은 글로 된 항목만 담는다.
// 역할 slug·단계 순서가 roadmaps.json 과 어긋나지 않는지는 src/app/enInfoPages.test.ts 가 검사한다.
import type { FaqEntry } from '@/lib/structuredData';

export interface RoadmapRoleEn {
  title: string;
  tagline: string;
  description: string;
  why: string;
  seoTitle: string;
  // roadmaps.json 의 steps 와 같은 순서·같은 cert slug.
  stepNotes: ReadonlyArray<{ cert: string; note: string }>;
  studyTips: readonly string[];
  faq: readonly FaqEntry[];
}

export const ROADMAP_EN: Readonly<Record<string, RoadmapRoleEn>> = {
  'solutions-architect': {
    title: 'Solutions Architect',
    tagline: 'The role that designs cloud infrastructure',
    description:
      'You design scalable, secure systems on AWS. Build your foundation, then earn the core design certification (SAA) to strengthen your job prospects, and go deeper with the professional-level certification (SAP) for large-scale, complex architectures.',
    why: 'In a design role, you need to be able to explain not just “what to choose” but “why you chose it.” Without first learning the service landscape through CLF, all four options in an SAA scenario question can look plausible. SAA mostly covers design within a single account and a single Region; SAP adds multi-account design, hybrid connectivity and migration on top of that. If you skip SAA and go straight to SAP, there will be stretches where you cannot even read the premise of the question.',
    seoTitle: 'AWS Solutions Architect Certification Order and Study Tips — CLF, SAA, SAP Roadmap',
    stepNotes: [
      { cert: 'clf-c02', note: 'The starting point for core cloud concepts and the AWS service landscape.' },
      { cert: 'saa-c03', note: 'The standard certification for design roles — #1 in demand across job postings.' },
      { cert: 'sap-c02', note: 'The expert stage, covering large-scale, multi-account and complex requirements.' },
    ],
    studyTips: [
      'SAA is not an exam about memorizing service names; it asks you to pick the combination that fits a set of requirements. For each service, be able to say in one line whether you use it for cost, availability or performance.',
      'Foundational services such as VPC, IAM, S3, EC2 and RDS sit underneath most of the questions. If you skip the networking and storage weeks at the start, the architecture questions later on will all stall you.',
      'SAP extends the scope of SAA to multiple accounts and multiple Regions. It is more efficient to take it after passing SAA and gaining experience with Organizations, hybrid networking and migration.',
    ],
    faq: [
      {
        q: 'Do I need to start with CLF to become a solutions architect?',
        a: 'It is not required. If you already have hands-on AWS experience, you can start with SAA. If the cloud is new to you, learning the terminology and billing structure with CLF first will cut down your SAA study time.',
      },
      {
        q: 'What is the difference between SAA and SAP?',
        a: 'SAA tests whether you can design a single workload to fit its requirements; SAP tests whether you can make judgments across multiple accounts and organization-level design, migration and cost optimization. The question stems are long and every answer candidate looks plausible, so time management is the key.',
      },
      {
        q: 'Can someone without a related degree earn a solutions architect certification?',
        a: 'Yes. However, if your grasp of networking (subnets, routing) and security (IAM policies) is weak, your wrong answers will pile up there. Reading those weeks slowly and checking why you got a practice question wrong in its explanation works well.',
      },
    ],
  },
  developer: {
    title: 'Developer',
    tagline: 'The role that builds applications on the cloud',
    description:
      'This path verifies your ability to work with AWS services such as serverless, containers and APIs in code. Build your base with the developer certification (DVA), then extend to the DevOps professional (DOP), which also covers deployment and automation.',
    why: 'A developer-track certification checks whether you can work with AWS through code. DVA asks about what application code touches directly — SDK calls, execution role permissions, serverless and deployment — while DOP asks how that code rides a pipeline and settles into operation. If you reverse the order, the deployment strategy questions in DOP leave a blank where “what is being deployed” should be. CLF fills in the service vocabulary that both exams take for granted.',
    seoTitle: 'AWS Developer Certification Order and Study Tips — CLF, DVA, DOP Roadmap',
    stepNotes: [
      { cert: 'clf-c02', note: 'A foundation that gives you a quick overview of AWS services as a whole.' },
      { cert: 'dva-c02', note: 'A certification centered on hands-on development work: SDKs, serverless, deployment.' },
      { cert: 'dop-c02', note: 'The DevOps expert stage, covering CI/CD, monitoring and automation.' },
    ],
    studyTips: [
      'DVA asks how code calls serverless services such as Lambda, API Gateway, DynamoDB and SQS, and how it handles failure. If you experience SDK behavior (retries, pagination, permission errors) first-hand, the questions get easier.',
      'Deployment services (CodeBuild, CodeDeploy, CodePipeline) and deployment strategies (rolling, blue/green, canary) appear in both DVA and DOP. If you sort them out properly during DVA, you will have less to study again for DOP.',
      'IAM roles and the order of policy evaluation come up in the developer exam too. Always keep in mind “who is calling this API, and with what permissions.”',
    ],
    faq: [
      {
        q: 'Which AWS certification do you recommend first for a backend developer?',
        a: 'DVA (Developer – Associate). Its scope — serverless, databases, deployment — touches development work directly, so you can put what you study straight into practice.',
      },
      {
        q: 'Why DOP after DVA?',
        a: 'DOP covers the stage where the applications developers build are deployed and operated automatically. The deployment services and IAM you learned in DVA carry straight over, making it the most natural professional-level step for a developer.',
      },
      {
        q: 'Do I need to be good at coding to pass?',
        a: 'There are no questions where you write code. Instead, the exam asks whether you understand what happens when code calls AWS services (permissions, retries, limits), so running a few simple examples yourself helps.',
      },
    ],
  },
  'sysops-devops': {
    title: 'Operations · DevOps',
    tagline: 'The role that deploys systems and keeps them running reliably',
    description:
      'You deploy, monitor and automate AWS infrastructure and keep it running reliably. Build a practical base with the operations certification (SOA), then move on to the DevOps professional (DOP), which oversees pipelines and automation.',
    why: 'An operations role is verified on how to keep things running more than on how to build them. SOA covers working with a system that is already up — monitoring, backup, cost, incident response — and DOP covers that same operation raised to the level of automation and pipelines. If you have not done a task by hand in SOA, then even when it shows up as an automation target in DOP, you will not get a feel for what is being automated.',
    seoTitle: 'DevOps Engineer AWS Certification Order and Study Tips — SOA, DOP Roadmap',
    stepNotes: [
      { cert: 'clf-c02', note: 'A basic understanding of the AWS services that operations work relies on.' },
      { cert: 'soa-c02', note: 'A certification for hands-on operations: monitoring, deployment, troubleshooting.' },
      { cert: 'dop-c02', note: 'The expert stage covering automation, CI/CD and governance.' },
    ],
    studyTips: [
      'The DevOps engineer certification (DOP) asks about operations in an automated state. Before that, if you have done CloudWatch alarms and logs, backups, patching and incident response by hand once each — the SOA scope — you will see “what is being automated” in DOP questions.',
      'CloudFormation and Systems Manager come up again and again across the operations and DevOps exams. Study them together: rollback when a stack update fails, drift detection, and automation documents (runbooks).',
      'CI/CD questions pair deployment strategies (blue/green, canary, rolling) with how to revert on failure. It helps to make a table of how the default rollback behavior differs by service.',
    ],
    faq: [
      {
        q: 'Which AWS certification should a DevOps engineer earn?',
        a: 'The end goal is DOP (DevOps Engineer – Professional). If you have little operations experience, we recommend first building a base in monitoring, deployment and incident response with SOA, then moving on to DOP.',
      },
      {
        q: 'Can I go straight to DOP without SOA?',
        a: 'There is no eligibility requirement. However, DOP asks how to automate operational tasks, so if you have never done those tasks themselves (setting alarms, analyzing logs, restoring backups), studying the SOA scope first ends up faster.',
      },
      {
        q: 'Do certifications help when working as a DevOps engineer?',
        a: 'A certification alone does not prove hands-on ability, but it makes you survey the AWS operations and automation services without gaps, which is good for scoping what to study. If you build an actual pipeline while you study, you will also have something to explain in interviews.',
      },
    ],
  },
  'data-engineer': {
    title: 'Data Engineer',
    tagline: 'The role that designs and operates data pipelines',
    description:
      'You build data pipelines on AWS that run from collection through storage, transformation and analysis. After building a base, verify your practical ability with the certification dedicated to data engineering (DEA).',
    why: 'In a data role, the key is which services connect each stage of the pipeline. DEA asks about collection, transformation, storage and governance as one flow, so you need to be able to explain “why this service for this stage” rather than just know individual services. If you sort out the basic choices in storage, compute and networking in CLF, the combination questions in DEA become much simpler. Of the paths here, this one has the fewest steps.',
    seoTitle: 'Data Engineer AWS Certification Order and Study Tips — CLF, DEA Roadmap',
    stepNotes: [
      { cert: 'clf-c02', note: 'Cloud basics for understanding data services.' },
      { cert: 'dea-c01', note: 'Hands-on data engineering: collection, transformation, storage, governance.' },
    ],
    studyTips: [
      'DEA asks about one connected flow: collecting data (Kinesis, DMS), storing it (S3, Redshift), transforming it (Glue, EMR) and querying it (Athena). Organize by pipeline stage rather than by individual service.',
      'Many questions ask about cost and performance together. If you understand how partitioning, file formats (Parquet) and compression affect query cost, you can solve several questions at once.',
      'Questions about controlling data access with Lake Formation and IAM also come up steadily. Organize the permission model around “who can see which columns of which table.”',
    ],
    faq: [
      {
        q: 'Is one AWS certification enough for a data engineer?',
        a: 'The certification aimed directly at the data engineer role is DEA (Data Engineer – Associate). If the cloud is new to you, we recommend learning the basic services and billing structure with CLF first, then preparing for DEA.',
      },
      {
        q: 'Do I need to know SQL or Python?',
        a: 'There are no questions where you write code, but you need to know what SQL queries and data transformation jobs do in order to answer the service-selection questions. Having done ETL in practice is an advantage.',
      },
      {
        q: 'What should I study after DEA?',
        a: 'If you want to connect analysis results to machine learning, continue with the machine learning roadmap (MLA); if you want to broaden into data platform design, continue with the solutions architect roadmap (SAA). Their scopes overlap naturally.',
      },
    ],
  },
  'ml-ai': {
    title: 'Machine Learning · AI',
    tagline: 'The role that works with AI/ML workloads',
    description:
      'You develop, deploy and operate machine learning models on AWS. This path starts with AI fundamentals (AIF) for the concepts, then goes deeper with ML engineering (MLA) and the higher-level specialty certification (MLS).',
    why: 'The machine learning path connects concepts and engineering in a single line. AIF is the introductory stage that sorts out concepts and terminology, including generative AI; MLA takes the engineering view of actually training, deploying and operating models; MLS requires broader specialist knowledge across ML. If you skip the concept stage, you will spend your time just interpreting terms in MLA pipeline questions. It is the only path with four steps, so it also takes the longest to prepare.',
    seoTitle: 'AI and Machine Learning AWS Certification Order and Study Tips — AIF, MLA, MLS Roadmap',
    stepNotes: [
      { cert: 'clf-c02', note: 'Cloud basics across AWS services.' },
      { cert: 'aif-c01', note: 'An introductory certification for core generative AI and ML concepts.' },
      { cert: 'mla-c01', note: 'An associate-level certification verifying building and operating ML pipelines.' },
      { cert: 'mls-c01', note: 'A specialty certification covering modeling, tuning and operation.' },
    ],
    studyTips: [
      'AIF is an introductory exam that asks broadly about generative AI and machine learning concepts and responsible AI. Even if your role does not involve building models, start with AIF if you plan or adopt AI services.',
      'MLA and MLS ask about the stages of data preparation, training, deployment and monitoring, centered on SageMaker. If you sketch out the features used at each stage like a map, you can see right away where a question sits.',
      'Machine learning fundamentals such as evaluation metrics (precision, recall and so on) and how to deal with overfitting cannot be solved with service knowledge alone. Do not skip the concept explanations in those weeks.',
    ],
    faq: [
      {
        q: 'Which AI certification should I earn first, AIF or MLA?',
        a: 'AIF if you are in a planning or development role that uses AI; MLA if you are an engineer who trains and deploys models directly. If machine learning is new to you, the safe order is to learn the concepts with AIF and then move on to MLA.',
      },
      {
        q: 'Do I have to earn MLS (Machine Learning – Specialty)?',
        a: 'It is not required. It is a specialist stage that goes deep into machine learning theory and SageMaker operations, so we recommend taking it after MLA when you make machine learning your main focus.',
      },
      {
        q: 'Do I need to be good at math?',
        a: 'There are almost no questions where you calculate a formula. Instead, you need to understand concepts such as what an evaluation metric means and how to handle data imbalance or overfitting when they occur.',
      },
    ],
  },
  security: {
    title: 'Security',
    tagline: 'The role that handles cloud security',
    description:
      'You design and operate identity, network and data protection in AWS environments. Building on an understanding of architecture (SAA), you go deeper with the security specialty certification (SCS).',
    why: 'A security role knows how things are connected before it asks what to block. SCS comes as scenarios in which VPC boundaries, identity flows, key management and log collection interlock, so without SAA-level reading of architecture, half of each question reads as background. That is why the security path places a design certification one step ahead of the specialty certification.',
    seoTitle: 'AWS Security Certification Order and Study Tips — CLF, SAA, SCS Roadmap',
    stepNotes: [
      { cert: 'clf-c02', note: 'Cloud basics for understanding security.' },
      { cert: 'saa-c03', note: 'The architecture skills that form the foundation of security design.' },
      { cert: 'scs-c03', note: 'The security specialty certification: identity, detection, infrastructure protection and more.' },
    ],
    studyTips: [
      'The security specialty certification (SCS) starts from the premise that you understand architecture. Build the basic structure of VPC, IAM and encryption with SAA first, and the detection and response questions in SCS become readable.',
      'The logic of IAM policy evaluation (explicit deny, SCPs, permissions boundaries, resource policies) is the backbone of the security exam. Practice with examples of how the final result comes out when several policies overlap.',
      'If you organize detection (GuardDuty, Security Hub, CloudTrail) and response (isolation, revoking credentials, preserving forensic evidence) as pairs, you can solve incident response scenario questions quickly.',
    ],
    faq: [
      {
        q: 'Which AWS security certification should I start with?',
        a: 'Even if the security specialty certification (SCS) is your final goal, we recommend preparing for SAA first if you lack an architecture foundation. Most SCS questions are written on the premise that you know the structure of VPC, IAM and encryption.',
      },
      {
        q: 'Is SCS useful even if I am not in a security role?',
        a: 'It helps if your job involves cloud infrastructure. You can systematically organize what every AWS environment needs, such as permission design, log auditing and encryption key management.',
      },
      {
        q: 'What do people get wrong most often when studying for the security certification?',
        a: 'The IAM evaluation result when several policies overlap, and KMS key policies. When you read the explanations, it is effective to practice tracing which policy made the final decision.',
      },
    ],
  },
};

// 역할 FAQ 의 마지막 문답("얼마나 걸리나") 영어판. 한국어판 buildRoleFaq 와 같은 합계 값을 쓴다.
export function buildRoleDurationFaqEn(
  roleTitle: string,
  codes: string[],
  totals: { weeks: number; days: number; costUsd: number | null },
): FaqEntry {
  const cost = totals.costUsd !== null ? ` The exam fees add up to $${totals.costUsd.toLocaleString('en-US')} in total.` : '';
  return {
    q: `How long does it take to finish the ${roleTitle} roadmap?`,
    a: `In the order ${codes.join(' → ')}, that comes to ${totals.weeks} weeks (${totals.days} days in total) of the CertNote curriculum. We based this on reading one day's lesson per day; if you have hands-on experience, you can move quickly through the weeks you already know.${cost}`,
  };
}
