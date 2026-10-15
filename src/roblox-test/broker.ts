import { validateCommand, validateResponse, type RobloxTestCommand, type RobloxTestCommandInput, type RobloxTestResponse } from './protocol';

export type BridgeStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

type PendingCommand = {
  command: RobloxTestCommand;
  resolve: (response: RobloxTestResponse) => void;
  promise: Promise<RobloxTestResponse>;
  timer: ReturnType<typeof setTimeout>;
};

/** In-memory single-plugin broker. It leases one request at a time and caches
 * completed IDs so retries can never execute a test command twice. */
export class RobloxTestBroker {
  private readonly pending = new Map<string, PendingCommand>();
  private readonly completed = new Map<string, RobloxTestResponse>();
  private readonly queue: string[] = [];
  private leaseId: string | null = null;
  private lastHeartbeat = 0;
  private connecting = true;
  private currentError = '';
  private statusCache: BridgeStatus = 'CONNECTING';
  private readonly statusListeners = new Set<(status: BridgeStatus) => void>();

  constructor(private readonly timeoutMs = 12_000, private readonly heartbeatTimeoutMs = 5_000) {}

  getStatus(now = Date.now()): BridgeStatus {
    if (this.currentError) return 'ERROR';
    if (this.connecting) return 'CONNECTING';
    return this.lastHeartbeat > 0 && now - this.lastHeartbeat <= this.heartbeatTimeoutMs ? 'CONNECTED' : 'DISCONNECTED';
  }

  startListening(): void {
    this.connecting = false;
    this.publishStatus();
  }

  heartbeat(): void {
    this.connecting = false;
    this.lastHeartbeat = Date.now();
    this.currentError = '';
    this.publishStatus();
  }

  markError(message: string): void {
    this.connecting = false;
    this.currentError = message.slice(0, 300) || 'Bridge protocol error.';
    this.publishStatus();
  }

  getError(): string { return this.currentError; }

  subscribe(listener: (status: BridgeStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => this.statusListeners.delete(listener);
  }

  refreshStatus(): BridgeStatus {
    this.publishStatus();
    return this.getStatus();
  }

  submit(input: RobloxTestCommandInput, id: string): Promise<RobloxTestResponse> {
    if (this.getStatus() !== 'CONNECTED') {
      return Promise.reject(new Error(this.currentError || 'Roblox Studio Test plugin is disconnected. Start the plugin in Roblox Studio and retry.'));
    }
    const validated = validateCommand({ ...input, id, version: 1 });
    if (!validated.ok) return Promise.reject(new Error(validated.error));
    const existing = this.pending.get(id);
    if (existing) return existing.promise;
    const completed = this.completed.get(id);
    if (completed) return Promise.resolve(completed);
    if (this.pending.size >= 20) return Promise.reject(new Error('The Roblox Studio Test queue is full.'));

    let resolve!: (response: RobloxTestResponse) => void;
    const promise = new Promise<RobloxTestResponse>((done) => { resolve = done; });
    const timer = setTimeout(() => {
      const response = { id, ok: false, output: 'Timed out waiting for Roblox Studio. Check that the test project is open and Play mode is available.' };
      this.finish(response);
      this.markError(response.output);
    }, this.timeoutMs);
    const command = validated.value;
    this.pending.set(id, { command, resolve, promise, timer });
    this.queue.push(id);
    return promise;
  }

  takeNext(): RobloxTestCommand | null {
    if (this.leaseId) {
      const leased = this.pending.get(this.leaseId);
      if (leased) return leased.command;
      this.leaseId = null;
    }
    while (this.queue.length > 0) {
      const id = this.queue.shift()!;
      const entry = this.pending.get(id);
      if (!entry) continue;
      this.leaseId = id;
      return entry.command;
    }
    return null;
  }

  complete(value: unknown): boolean {
    const validated = validateResponse(value);
    if (!validated.ok) {
      this.markError(validated.error);
      return false;
    }
    if (this.completed.has(validated.value.id)) return true;
    const entry = this.pending.get(validated.value.id);
    if (!entry) return false;
    this.finish(validated.value);
    return true;
  }

  shutdown(): void {
    for (const [id] of this.pending) {
      this.finish({ id, ok: false, output: 'Aervyx bridge shut down before Roblox Studio returned a response.' });
    }
    this.connecting = false;
    this.lastHeartbeat = 0;
    this.publishStatus();
  }

  private finish(response: RobloxTestResponse): void {
    const entry = this.pending.get(response.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(response.id);
    if (this.leaseId === response.id) this.leaseId = null;
    this.completed.set(response.id, response);
    while (this.completed.size > 100) this.completed.delete(this.completed.keys().next().value!);
    entry.resolve(response);
  }

  private publishStatus(): void {
    const next = this.getStatus();
    if (next === this.statusCache) return;
    this.statusCache = next;
    for (const listener of this.statusListeners) listener(next);
  }
}
