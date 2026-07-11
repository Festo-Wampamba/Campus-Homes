import Pusher from 'pusher';

// RealtimeAdapter — Soketi speaks the Pusher protocol (brief §5). Backend only
// triggers events; clients subscribe via the frontend Soketi config.

export interface RealtimeAdapter {
  trigger(channel: string, event: string, payload: unknown): Promise<void>;
  /** Signs a private-channel subscription request. Local HMAC op, no network
   * call — pusher-js posts { socket_id, channel_name } here before it will
   * let a client subscribe to `private-*` channels. */
  authorizeChannel(socketId: string, channelName: string): { auth: string } | null;
}

export class SoketiRealtime implements RealtimeAdapter {
  private readonly pusher: Pusher;

  constructor(config: { host: string; port: number; appId: string; key: string; secret: string }) {
    this.pusher = new Pusher({
      host: config.host,
      port: String(config.port),
      appId: config.appId,
      key: config.key,
      secret: config.secret,
      useTLS: true,
    });
  }

  async trigger(channel: string, event: string, payload: unknown): Promise<void> {
    await this.pusher.trigger(channel, event, payload);
  }

  authorizeChannel(socketId: string, channelName: string): { auth: string } {
    const result = this.pusher.authorizeChannel(socketId, channelName);
    return { auth: result.auth };
  }
}

/** Used until a Soketi instance is provisioned (SOKETI_* env unset) — chat
 * still persists to the DB; clients just don't get live pushes. */
export class NoopRealtime implements RealtimeAdapter {
  trigger(): Promise<void> {
    return Promise.resolve();
  }

  authorizeChannel(): null {
    return null;
  }
}
