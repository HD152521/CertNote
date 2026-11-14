// English text for the CLI labs. Ids, order, commands and grading (isDone) come from the Korean
// LABS untouched; only the human-readable strings are replaced here.
import { LABS, type Lab } from './labs';

interface StepText {
  title: string;
  task: string;
  hint: string;
  takeaway: string;
}

interface LabText {
  service?: string;
  title: string;
  source: string;
  steps: Record<string, StepText>;
}

const EN: Record<string, LabText> = {
  'regions-azs': {
    title: 'Map out Regions and Availability Zones',
    source: 'SAA-C03 Week 1 · Day 1',
    steps: {
      whoami: {
        title: 'Who am I connected as?',
        task: 'Before running anything else, check which account and user your requests are going out as.',
        hint: 'STS has a command that asks "who is the caller?".',
        takeaway:
          'When you hit a permissions error, run this first to see which IAM principal you are. If you assumed a role, the Arn shows assumed-role.',
      },
      'seoul-azs': {
        title: 'List the Seoul AZs as a table',
        task: 'Print the Availability Zones of the Seoul Region (ap-northeast-2) in table format.',
        hint: 'Add --output table to ec2 describe-availability-zones.',
        takeaway:
          'The Seoul Region has 4 AZs (a to d). The exam often tests that a Region is an isolated unit made of at least 3 AZs.',
      },
      'zone-id': {
        title: 'Pick out only ZoneName and ZoneId',
        task: 'Use --query to select just the ZoneName and ZoneId columns of each AZ.',
        hint: "Use JMESPath to pull two fields from each item in the list: 'AvailabilityZones[*].[ZoneName,ZoneId]'",
        takeaway:
          'ZoneName (ap-northeast-2a) is mapped differently per account, but ZoneId (apne2-az1) is the same in every account. To line up with the same AZ as another account, go by ZoneId.',
      },
      virginia: {
        title: 'Compare with N. Virginia',
        task: 'Run the same lookup in us-east-1 and find out what the ZoneId of us-east-1a is.',
        hint: 'Just change the previous command to --region us-east-1.',
        takeaway:
          'In this account, us-east-1a is use1-az6. You just saw first-hand that the letter in the name does not guarantee it is the first physical AZ.',
      },
    },
  },
  's3-first-bucket': {
    title: 'Create your first bucket in the Seoul Region',
    source: 'SAA-C03 Week 3 · S3 basics',
    steps: {
      create: {
        title: 'Create a bucket in Seoul with s3api',
        task: 'Use aws s3api create-bucket to create a bucket in the Seoul Region. The name must be globally unique.',
        hint: 'Running it as is will fail. Read the error message and add --create-bucket-configuration.',
        takeaway:
          'Outside us-east-1, LocationConstraint is required. High-level commands like aws s3 mb fill it in for you, so the difference is easy to miss.',
      },
      versioning: {
        title: 'Turn on versioning',
        task: 'Turn on Versioning for the bucket you just created.',
        hint: 'Pass --versioning-configuration Status=Enabled to put-bucket-versioning.',
        takeaway:
          'Once versioning is on you cannot turn it off, only suspend it. It is tested as a way to recover objects that were deleted or overwritten by mistake.',
      },
      upload: {
        title: 'Upload a file',
        task: 'Upload hello.txt from the working folder to the bucket. (You can see local files with ls.)',
        hint: 'aws s3 cp <local file> s3://<bucket>/',
        takeaway:
          'If the destination ends with /, the file name becomes the key as is. S3 has no folders, only key names that contain slashes.',
      },
      verify: {
        title: 'Verify the setting',
        task: 'Query the bucket versioning status and confirm it is Enabled.',
        hint: 'The counterpart of put is get.',
        takeaway: 'A bucket that was never configured prints nothing. There is no "Disabled" status value.',
      },
    },
  },
  'iam-least-privilege': {
    title: 'Create a read-only user and clean up',
    source: 'SAA-C03 Week 1 · Day 2',
    steps: {
      'create-user': {
        title: 'Create a user',
        task: 'Create a new IAM user.',
        hint: 'aws iam create-user --user-name <name>',
        takeaway: 'A new user has no permissions at all (implicit deny). Permissions only exist once you attach a policy.',
      },
      attach: {
        title: 'Attach a read-only policy',
        task: 'Attach the AWS managed policy ReadOnlyAccess to that user.',
        hint: 'An AWS managed policy ARN looks like arn:aws:iam::aws:policy/<policy name>. The account ID slot holds aws.',
        takeaway:
          'Both in practice and on the exam, attaching policies to a group is preferred over attaching them directly to a user. Here we attach directly just to see the flow.',
      },
      list: {
        title: 'Check the attached policies',
        task: 'Print only the names of the policies attached to that user, in text format.',
        hint: "Use list-attached-user-policies with --query 'AttachedPolicies[].PolicyName' --output text",
        takeaway:
          'The --query plus --output text combination is the most common pattern for capturing a value into a variable in shell scripts.',
      },
      cleanup: {
        title: 'Delete the user',
        task: 'The practice is over, so delete the user. If it is not deleted right away, read the error.',
        hint: 'A user with an attached policy cannot be deleted. Run detach-user-policy first.',
        takeaway:
          'To delete an IAM user you must first clean up policies, access keys, group memberships and so on. The console does this for you, but the CLI needs one step at a time.',
      },
    },
  },
};

export function cliLabsFor(lang: 'ko' | 'en' = 'ko'): Lab[] {
  if (lang !== 'en') return LABS;
  return LABS.map((lab) => {
    const text = EN[lab.id];
    if (!text) return lab;
    return {
      ...lab,
      service: text.service ?? lab.service,
      title: text.title,
      source: text.source,
      steps: lab.steps.map((s) => ({ ...s, ...(text.steps[s.id] ?? {}) })),
    };
  });
}

/** Exposed for tests. */
export const LABS_EN_TEXT = EN;
