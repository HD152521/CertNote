'use client';

import { NotificationSettings } from '@/components/notifications/NotificationSettings';
import { AccountForms } from '@/app/account/AccountForms';

interface SettingsTabProps {
  hasPassword: boolean;
  userEmail: string;
}

export function SettingsTab({ hasPassword, userEmail }: SettingsTabProps) {
  return (
    <div className="space-y-8">
      {/* Notification Settings */}
      <div>
        <NotificationSettings />
      </div>

      {/* Security & Account Management */}
      <div>
        <AccountForms hasPassword={hasPassword} userEmail={userEmail} />
      </div>
    </div>
  );
}
