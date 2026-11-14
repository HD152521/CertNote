import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';
import { NonAffiliationNotice } from '@/components/legal/NonAffiliationNotice';
import { infoAlternates } from '@/lib/infoAlternates';
import { CONTACT_EMAIL, OPERATOR_NAME_EN, SITE_NAME } from '@/lib/site';

const TITLE = 'About';
const DESCRIPTION = `${SITE_NAME} is a set of study notes for AWS and Linux Master certifications, run by ${OPERATOR_NAME_EN}. Here is what we offer and who runs it.`;
const PATH = '/en/about';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: infoAlternates(PATH),
  openGraph: { title: TITLE, description: DESCRIPTION, url: PATH, type: 'website' },
};

const LINK = 'underline underline-offset-4 hover:text-fg';

export default function EnAboutPage() {
  return (
    <LegalPage lang="en" title={`About ${SITE_NAME}`}>
      <LegalSection title="What this site is">
        <p>
          {SITE_NAME} is a set of study notes for people preparing for AWS certifications and the Linux Master exams. The exam
          scope is divided into weeks and days, so you read one note a day and work through practice questions on the spot.
        </p>
        <p>
          Every note is free to read without signing in. Full-length mock exams, review of missed questions, study records and
          AI explanations of wrong answers are available after a free sign-up.
        </p>
      </LegalSection>

      <LegalSection title="What we offer">
        <ul className="list-disc space-y-1 pl-5">
          <li>A week-by-week curriculum and daily study notes for each certification</li>
          <li>Practice questions with explanations attached to every note</li>
          <li>Mock exams we wrote ourselves, based on the exam domains in the official exam guides</li>
          <li>Spaced review that brings missed questions back after an interval</li>
          <li>
            A <Link href="/en/roadmap" className={LINK}>certification roadmap</Link> that lays out the order of preparation for each job role
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="How we make it">
        <p>
          The criteria we use to set the scope, how notes and questions are produced, and how review and error reports are handled
          are described in <Link href="/en/about/how-we-make" className={LINK}>How we make this</Link>. Errors fixed through
          reports and review are published in the <Link href="/en/changelog" className={LINK}>changelog</Link>.
        </p>
      </LegalSection>

      <LegalSection title="Who runs it">
        <p>
          {SITE_NAME} is operated by {OPERATOR_NAME_EN}. Please send questions and error reports through the{' '}
          <Link href="/en/contact" className={LINK}>contact page</Link>.
        </p>
      </LegalSection>

      <LegalSection title="Good to know">
        <NonAffiliationNotice lang="en" />
        <p>
          Exam scope and registration details are changed by the administering organizations from time to time. Please re-check
          figures such as exam fees, number of questions and passing criteria against the official announcement before you
          register. If you find something wrong in a note, let us know at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>{CONTACT_EMAIL}</a> and we will fix it.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
