import type { Metadata } from 'next';
import { LabHubView } from '@/components/lab/LabHubView';
import { infoAlternates } from '@/lib/infoAlternates';

export const dynamic = 'error'; // static generation only

const TITLE = 'Labs: SQL (SQLD), Linux Shell and AWS CLI in your browser, no install';
const DESCRIPTION =
  'Run an Oracle-syntax SQL lab for SQLD and Linux Master and AWS CLI terminals right in your browser, with no installation. Results and error messages are matched to real Oracle and Rocky Linux output.';
const PATH = '/en/lab';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: infoAlternates(PATH),
  openGraph: { title: TITLE, description: DESCRIPTION, url: PATH, type: 'website' },
};

export default function EnLabHubPage() {
  return <LabHubView lang="en" />;
}
