import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';
import { NonAffiliationNotice } from '@/components/legal/NonAffiliationNotice';
import { infoAlternates } from '@/lib/infoAlternates';
import { CONTACT_EMAIL, SITE_NAME } from '@/lib/site';
import { withDefaultOgImage } from '@/lib/ogImages';

const TITLE = 'How we make this';
const DESCRIPTION = `How ${SITE_NAME} sets the exam scope, how notes and questions are produced, and how review and error reports are handled.`;
const PATH = '/en/about/how-we-make';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: infoAlternates(PATH),
  openGraph: withDefaultOgImage({ title: TITLE, description: DESCRIPTION, url: PATH, type: 'website' }),
};

const LINK = 'underline underline-offset-4 hover:text-fg';

export default function EnHowWeMakePage() {
  return (
    <LegalPage lang="en" title={`How ${SITE_NAME} is made`}>
      <LegalSection title="Scope">
        <p>
          We set the scope from each certification&rsquo;s official exam information. For AWS certifications that means the exam
          domains in the Exam Guide AWS publishes; for Linux Master it means the exam standards of the Korea Association for ICT
          Promotion (KAIT). We divide those domains into weeks and days to build the curriculum.
        </p>
        <p>
          The &ldquo;Based on&rdquo; line at the top of a note shows which exam&rsquo;s guidance the note was written against.
        </p>
      </LegalSection>

      <LegalSection title="Production">
        <p>
          Notes and questions are first drafted with AI tools, then reviewed and edited by the operator before they are
          published. Practice questions and mock exams are made the same way, and we do not copy real exam questions.
        </p>
      </LegalSection>

      <LegalSection title="Review">
        <p>
          In October 2026 we re-checked the notes and questions that were already published. We looked for factual errors,
          figures written differently within the same exam, and bias where correct answers cluster on one side of the options,
          and fixed what we found. What we fixed is published in the{' '}
          <Link href="/en/changelog" className={LINK}>changelog</Link>.
        </p>
        <p>
          Notes that have been reviewed show the year and month of the &ldquo;Last reviewed&rdquo; at the top. Notes with no
          review record show no date.
        </p>
      </LegalSection>

      <LegalSection title="Reporting errors">
        <p>
          If you find something wrong, please tell us through the <Link href="/en/contact" className={LINK}>contact page</Link> or
          at <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>{CONTACT_EMAIL}</a>. You can also send a report with the
          &ldquo;Report an error&rdquo; link at the top of a note. We check each report, fix the problem, and record the fix in
          the <Link href="/en/changelog" className={LINK}>changelog</Link>.
        </p>
      </LegalSection>

      <LegalSection title="Good to know">
        <NonAffiliationNotice lang="en" />
        <p>
          Exam scope and registration details are changed by the administering organizations from time to time. Please re-check
          figures such as exam fees, number of questions and passing criteria against the official announcement before you
          register.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
