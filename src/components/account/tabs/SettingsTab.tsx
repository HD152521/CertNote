'use client';

import { NotificationSettings } from '@/components/notifications/NotificationSettings';
import { AccountForms } from '@/app/account/AccountForms';

export function SettingsTab() {
  return (
    <div className="space-y-8">
      {/* Notification Settings */}
      <div>
        <NotificationSettings />
      </div>

      {/* Security & Account Management */}
      <div>
        <AccountForms />
      </div>
    </div>
  );
}
