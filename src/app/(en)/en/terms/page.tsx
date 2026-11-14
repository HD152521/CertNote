import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';
import { infoAlternates } from '@/lib/infoAlternates';
import { CONTACT_EMAIL, OPERATOR_NAME_EN, SITE_NAME } from '@/lib/site';

const TITLE = 'Terms of Service';
const DESCRIPTION = `The conditions for using ${SITE_NAME}, member accounts, copyright in the content, and limits of liability.`;
const PATH = '/en/terms';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: infoAlternates(PATH),
  openGraph: { title: TITLE, description: DESCRIPTION, url: PATH, type: 'website' },
};

// 이 문서는 한국어 이용약관(/terms)의 영어 안내본이다. 한국 법률에 따라 해석되는 원문과 의미를 바꾸지 않도록
// 문장 구조를 그대로 따라 옮겼다 — 한국어 원문을 고치면 이 파일도 같은 방식으로 고친다.
const LINK = 'underline underline-offset-4 hover:text-fg';

export default function EnTermsPage() {
  return (
    <LegalPage lang="en" title="Terms of Service" updated="2026-10-13">
      <LegalSection title="1. Purpose">
        <p>
          These terms set out the conditions for using {SITE_NAME} (the &ldquo;Service&rdquo;), provided by {OPERATOR_NAME_EN}{' '}
          (the &ldquo;Operator&rdquo;), and the rights and obligations of the Operator and users.
        </p>
      </LegalSection>

      <LegalSection title="2. What the Service provides">
        <p>
          The Service provides certification study notes, practice questions, mock exams, review of missed questions, study
          records and AI explanations of wrong answers. Study notes can be read without signing up; the other features are
          available after signing up. The Service is currently provided free of charge.
        </p>
        <p>
          The Operator may change or discontinue all or part of the Service, and will give advance notice on the Service
          screens of any significant change that is unfavorable to users.
        </p>
      </LegalSection>

      <LegalSection title="3. Member accounts">
        <ul className="list-disc space-y-1 pl-5">
          <li>Users must sign up with accurate information and are responsible for managing their own account and password.</li>
          <li>Users may close their account at any time from My Account; when they do, their account information and study records are deleted.</li>
          <li>The Operator may restrict or delete accounts that violate these terms.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. AI explanations of wrong answers">
        <p>
          AI explanations of wrong answers are AI-generated answers provided for reference and may contain errors. There is a
          daily usage limit per account, and the limit and availability of this feature may change depending on operating
          circumstances.
        </p>
      </LegalSection>

      <LegalSection title="5. Prohibited conduct">
        <ul className="list-disc space-y-1 pl-5">
          <li>Collecting content in bulk by automated means, or placing excessive load on the Service</li>
          <li>Creating multiple accounts, or using another person&rsquo;s account, to avoid usage limits</li>
          <li>Copying, distributing or selling the content without the Operator&rsquo;s permission</li>
          <li>Posting false statements, advertising, or content that infringes the rights of others in review or other posting areas</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Copyright">
        <p>
          The Operator holds the copyright in the Service&rsquo;s study notes, questions, explanations and diagrams. Reading for
          personal study and quoting a portion with attribution are permitted. Copyright in reviews that users post belongs to
          the author, and the Operator may display them within the Service.
        </p>
        <p>
          AWS and the names of its services are trademarks of Amazon.com, Inc. or its affiliates, and other trademarks belong to
          their respective owners. The Service is not affiliated with or endorsed by any exam administrator.
        </p>
      </LegalSection>

      <LegalSection title="7. Advertising">
        <p>
          The Service may display advertisements provided by third parties. Responsibility for the content of an advertisement
          and for any dealings with the advertiser lies with that advertiser. The handling of information in connection with
          advertising follows the <Link href="/en/privacy" className={LINK}>Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection title="8. Limitation of liability">
        <p>
          The content of the Service is material to help you study and does not guarantee that you will pass an exam. For exam
          scope and registration information, the official announcement of the administering organization takes precedence.
          Unless there is intent or gross negligence, the Operator is not liable for damages arising from errors in the content
          or from interruption of the Service.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes to the terms and governing law">
        <p>
          The Operator may change these terms and will announce the effective date and the changes on the Service screens. These
          terms are interpreted in accordance with the laws of the Republic of Korea.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>
          Questions about these terms:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>{CONTACT_EMAIL}</a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
