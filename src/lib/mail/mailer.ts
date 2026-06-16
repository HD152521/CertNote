// 이메일 발송 추상화. RESEND_API_KEY가 있으면 Resend로 보내고, 없으면 콘솔에 출력(로컬 개발용).
// Resend는 SDK 없이 REST로 호출해 의존성을 늘리지 않는다.
export interface Mailer {
  send(to: string, subject: string, html: string): Promise<void>;
}

class ConsoleMailer implements Mailer {
  async send(to: string, subject: string, html: string): Promise<void> {
    console.log(`\n[mail:console] → ${to}\n  subject: ${subject}\n  ${html.replace(/\n/g, '\n  ')}\n`);
  }
}

class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string, private readonly from: string) {}

  async send(to: string, subject: string, html: string): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to, subject, html }),
    });
    if (!res.ok) {
      throw new Error(`Resend 발송 실패 (${res.status})`);
    }
  }
}

export function getMailer(): Mailer {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? 'CertNote <onboarding@resend.dev>';
  return apiKey ? new ResendMailer(apiKey, from) : new ConsoleMailer();
}

export function appUrl(): string {
  return process.env.APP_URL ?? 'http://localhost:3000';
}
