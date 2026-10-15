import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { RobloxTestBroker, type BridgeStatus } from '../src/roblox-test/broker';
import { validateCommandInput } from '../src/roblox-test/protocol';

export const ROBLOX_TEST_BRIDGE_PORT = 43827;
const MAX_BODY_BYTES = 8 * 1024;

export class LocalRobloxTestBridge {
  readonly broker = new RobloxTestBroker(45_000, 5_000);
  private readonly token = randomBytes(32).toString('hex');
  private server: Server | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private boundPort = ROBLOX_TEST_BRIDGE_PORT;

  constructor(private readonly port = ROBLOX_TEST_BRIDGE_PORT) {}

  async start(): Promise<void> {
    if (this.server) return;
    const server = createServer((request, response) => { void this.handle(request, response); });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        this.boundPort = (server.address() as AddressInfo).port;
        resolve();
      });
    });
    this.broker.startListening();
    this.refreshTimer = setInterval(() => this.broker.refreshStatus(), 500);
  }

  getInfo(): { status: BridgeStatus; endpoint: string; pairingToken: string; error: string } {
    return {
      status: this.broker.getStatus(),
      endpoint: `http://127.0.0.1:${this.boundPort}`,
      pairingToken: this.token,
      error: this.broker.getError(),
    };
  }

  submit(input: unknown): Promise<{ id: string; ok: boolean; output: string }> {
    const validated = validateCommandInput(input);
    if (!validated.ok) return Promise.reject(new Error(validated.error));
    return this.broker.submit(validated.value, randomUUID());
  }

  subscribe(listener: (status: BridgeStatus) => void): () => void {
    return this.broker.subscribe(listener);
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    this.broker.shutdown();
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private isAuthorized(request: IncomingMessage): boolean {
    const presented = request.headers['x-aervyx-token'];
    if (typeof presented !== 'string') return false;
    const expectedBytes = Buffer.from(this.token);
    const presentedBytes = Buffer.from(presented);
    return expectedBytes.length === presentedBytes.length && timingSafeEqual(expectedBytes, presentedBytes);
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.socket.remoteAddress !== '127.0.0.1' && request.socket.remoteAddress !== '::ffff:127.0.0.1') {
      this.send(response, 403, { error: 'Loopback connections only.' });
      return;
    }
    if (request.method !== 'POST' || !['/v1/heartbeat', '/v1/next', '/v1/result'].includes(request.url ?? '')) {
      this.send(response, 404, { error: 'Unknown bridge endpoint.' });
      return;
    }
    if (!this.isAuthorized(request)) {
      this.send(response, 401, { error: 'Invalid Aervyx pairing token.' });
      return;
    }

    let body: unknown;
    try { body = await this.readJson(request); }
    catch (error) {
      this.send(response, 400, { error: error instanceof Error ? error.message : 'Malformed JSON body.' });
      return;
    }

    if (request.url === '/v1/heartbeat') {
      this.broker.heartbeat();
      this.send(response, 200, { status: this.broker.getStatus(), protocol: 1 });
      return;
    }
    if (request.url === '/v1/next') {
      this.broker.heartbeat();
      this.send(response, 200, { command: this.broker.takeNext() });
      return;
    }

    this.broker.heartbeat();
    const accepted = this.broker.complete(body);
    if (!accepted) {
      this.send(response, 400, { error: this.broker.getError() || 'Unknown, duplicate, or malformed response.' });
      return;
    }
    this.send(response, 200, { accepted: true });
  }

  private async readJson(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_BODY_BYTES) throw new Error('Request body is too large.');
      chunks.push(bytes);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
    catch { throw new Error('Request body must be valid JSON.'); }
  }

  private send(response: ServerResponse, status: number, body: unknown): void {
    const serialized = JSON.stringify(body);
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(serialized),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(serialized);
  }
}
