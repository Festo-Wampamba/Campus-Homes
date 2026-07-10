// MessagingAdapter — brief §10: Africa's Talking wrapped behind an interface
// so the provider is swappable. Consumed by AuthModule (OTP) now,
// NotificationsModule later.

export interface MessagingAdapter {
  sendSms(to: string, message: string): Promise<void>;
}

export class AfricasTalkingMessaging implements MessagingAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly username: string,
  ) {}

  async sendSms(to: string, message: string): Promise<void> {
    const host =
      this.username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
    const res = await fetch(`https://${host}/version1/messaging`, {
      method: 'POST',
      headers: {
        apiKey: this.apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ username: this.username, to, message }),
    });
    if (!res.ok) {
      throw new Error(`Africa's Talking SMS failed: HTTP ${res.status}`);
    }
  }
}

/** Dev/test fallback when no SMS key is configured. Never used in production —
 * AuthModule refuses to boot without a real adapter there. */
export class ConsoleMessaging implements MessagingAdapter {
  sendSms(to: string, message: string): Promise<void> {
    console.log(`[sms:dev] to=${to} message="${message}"`);
    return Promise.resolve();
  }
}
