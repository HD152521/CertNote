import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';
import { infoAlternates } from '@/lib/infoAlternates';
import { CONTACT_EMAIL, OPERATOR_NAME_EN, SITE_NAME } from '@/lib/site';

const TITLE = 'Contact';
const DESCRIPTION = `How to reach ${SITE_NAME} for questions about the service, content error reports, and privacy or copyright requests.`;
const PATH = '/en/contact';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: infoAlternates(PATH),
  openGraph: { title: TITLE, description: DESCRIPTION, url: PATH, type: 'website' },
};

export default function EnContactPage() {
  return (
    <LegalPage lang="en" title="Contact">
      <LegalSection title="Contact details">
        <p>
          Operator: {OPERATOR_NAME_EN}
          <br />
          Email:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4 hover:text-fg">{CONTACT_EMAIL}</a>
        </p>
      </LegalSection>

      <LegalSection title="What to send us">
        <ul className="list-disc space-y-1 pl-5">
          <li>Error reports for notes, questions or explanations (please include which certification, week and day)</li>
          <li>Questions about your account, login or study records</li>
          <li>Requests to view, correct or delete your personal information</li>
          <li>Copyright inquiries and takedown requests</li>
          <li>Partnership and advertising inquiries</li>
        </ul>
        <p>You can also leave feedback with the feedback button at the bottom right of the screen.</p>
      </LegalSection>
    </LegalPage>
  );
}
