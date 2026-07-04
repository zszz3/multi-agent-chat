import type { InteractiveSession, InteractiveSessionContext } from "./runtime-driver";
import { ProcessLease } from "./process-lease";

interface InteractiveSessionManagerOptions {
  createSession: (context: InteractiveSessionContext) => InteractiveSession;
  now: () => number;
}

interface ManagedInteractiveSession {
  session: InteractiveSession;
  queue: Promise<void>;
  lease: ProcessLease;
}

export class InteractiveSessionManager {
  private readonly sessions = new Map<string, ManagedInteractiveSession>();

  constructor(private readonly options: InteractiveSessionManagerOptions) {}

  getOrCreate(chatId: string, context: InteractiveSessionContext): InteractiveSession {
    const existing = this.sessions.get(chatId);
    if (existing) {
      existing.session.reconfigure(context);
      return existing.session;
    }
    const session = this.options.createSession(context);
    this.sessions.set(chatId, {
      session,
      queue: Promise.resolve(),
      lease: new ProcessLease(session.snapshot().attachmentGeneration),
    });
    return session;
  }

  async dispatch(chatId: string, work: (session: InteractiveSession, lease: ProcessLease) => Promise<void>): Promise<void> {
    const managed = this.sessions.get(chatId);
    if (!managed) throw new Error(`Unknown interactive session: ${chatId}`);

    const run = managed.queue.catch(() => undefined).then(() => work(managed.session, managed.lease));
    managed.queue = run.then(
      () => undefined,
      () => undefined,
    );
    await run;
  }

  async interrupt(chatId: string): Promise<void> {
    const managed = this.sessions.get(chatId);
    if (!managed) return;
    await managed.session.interrupt();
  }

  async dispose(chatId: string, reason: "idle_timeout" | "app_shutdown" | "error"): Promise<void> {
    const managed = this.sessions.get(chatId);
    if (!managed) return;
    this.sessions.delete(chatId);
    const run = managed.queue.catch(() => undefined).then(() => managed.session.detach(reason));
    managed.queue = run.then(
      () => undefined,
      () => undefined,
    );
    await run;
  }

  async sweepExpiredSessions(now = this.options.now()): Promise<void> {
    for (const [chatId, managed] of this.sessions) {
      const snapshot = managed.session.snapshot();
      const lastMeaningfulActivityAt = snapshot.lastMeaningfulActivityAt;
      if (
        (snapshot.attachmentState === "idle" || snapshot.attachmentState === "interrupted") &&
        lastMeaningfulActivityAt !== undefined &&
        now - lastMeaningfulActivityAt > 60 * 60 * 1000
      ) {
        await this.dispatch(chatId, (session) =>
          session.detachIfStillExpired({
            expectedGeneration: snapshot.attachmentGeneration,
            expectedLastMeaningfulActivityAt: lastMeaningfulActivityAt,
            reason: "idle_timeout",
          }),
        );
      }
    }
  }
}
