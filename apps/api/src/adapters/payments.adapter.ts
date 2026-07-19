// PaymentsAdapter — brief §10: Flutterwave wrapped behind an interface so the
// provider is swappable (payment gateway decision is parked; see TECH.md).

export interface InitiatePaymentInput {
  txRef: string; // our payment id — comes back in the webhook as tx_ref
  amountUgx: number;
  phone: string | null;
  redirectUrl: string;
}

export interface InitiatePaymentResult {
  checkoutUrl: string;
}

export interface PaymentsAdapter {
  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  refund(providerTxnId: string, amountUgx: number): Promise<{ providerRefundId: string }>;
}

/** Flutterwave standard checkout (v3). */
export class FlutterwavePayments implements PaymentsAdapter {
  constructor(private readonly secretKey: string) {}

  private async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const res = await fetch(`https://api.flutterwave.com/v3${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok || json.status !== 'success') {
      throw new Error(`Flutterwave ${path} failed: HTTP ${res.status}`);
    }
    return json;
  }

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const json = await this.post('/payments', {
      tx_ref: input.txRef,
      amount: input.amountUgx,
      currency: 'UGX',
      redirect_url: input.redirectUrl,
      customer: { phone_number: input.phone ?? undefined },
    });
    const data = json.data as { link: string };
    return { checkoutUrl: data.link };
  }

  async refund(providerTxnId: string, amountUgx: number): Promise<{ providerRefundId: string }> {
    const json = await this.post(`/transactions/${providerTxnId}/refund`, { amount: amountUgx });
    const data = json.data as { id: number };
    return { providerRefundId: String(data.id) };
  }
}

/** Dev/test stand-in while the gateway account is pending (TECH.md). Points
 * at our own frontend's stub checkout page (a real, clickable route — not a
 * fake external domain that just 404s the DNS lookup) so the whole reserve
 * flow, including "paying", is actually testable end-to-end in a browser.
 * That page posts to POST /webhooks/dev-simulate, which reuses the exact
 * same applyPaymentWebhook() a real Flutterwave webhook would hit. */
export class StubPayments implements PaymentsAdapter {
  constructor(private readonly webOrigin: string) {}

  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const url = new URL(`/dev/checkout/${input.txRef}`, this.webOrigin);
    url.searchParams.set('amount', String(input.amountUgx));
    url.searchParams.set('redirect', input.redirectUrl);
    return Promise.resolve({ checkoutUrl: url.toString() });
  }

  refund(providerTxnId: string): Promise<{ providerRefundId: string }> {
    return Promise.resolve({ providerRefundId: `stub-refund-${providerTxnId}` });
  }
}
