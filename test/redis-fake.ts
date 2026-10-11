/**
 * Minimal in-memory Redis fake for e2e tests.
 *
 * Local Postgres is available on 5432 but there is no Redis server and no
 * Docker, so the real `AppModule` (which injects `REDIS_CLIENT`) cannot boot
 * against a live Redis. This fake implements just the surface the auth flow,
 * throttler storage, idempotency interceptor and distributed lock touch during
 * a request, and is injected in place of the real client by the e2e spec.
 */
export interface RedisFake {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ...rest: any[]) => Promise<'OK' | null>;
  del: (...keys: string[]) => Promise<number>;
  ttl: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  incr: (key: string) => Promise<number>;
  ping: () => Promise<string>;
  multi: () => {
    incr: (key: string) => any;
    ttl: (key: string) => any;
    set: (key: string, value: string, ...rest: any[]) => any;
    del: (key: string) => any;
    exec: () => Promise<Array<[Error | null, unknown]>>;
  };
  eval: (script: string, numKeys: number, ...args: any[]) => Promise<unknown>;
  quit: () => Promise<'OK'>;
  disconnect: () => void;
  on: () => RedisFake;
}

export function createRedisFake(): RedisFake {
  const store = new Map<string, string>();

  const fake: RedisFake = {
    async get(key) {
      return store.has(key) ? (store.get(key) as string) : null;
    },

    async set(key, value, ...rest) {
      // Support the common `SET key val EX <seconds>` form used for refresh
      // tokens and lock TTLs. Other modifiers (NX/XX) are treated as plain set.
      store.set(key, value);
      const exIndex = rest.findIndex(
        (r) => typeof r === 'string' && r.toUpperCase() === 'EX',
      );
      if (exIndex !== -1 && rest[exIndex + 1] != null) {
        const seconds = Number(rest[exIndex + 1]);
        if (Number.isFinite(seconds)) {
          setTimeout(() => store.delete(key), seconds * 1000).unref?.();
        }
      }
      return 'OK';
    },

    async del(...keys) {
      let removed = 0;
      for (const key of keys) {
        if (store.delete(key)) removed += 1;
      }
      return removed;
    },

    async ttl(key) {
      return store.has(key) ? -1 : -2;
    },

    async expire(key) {
      return store.has(key) ? 1 : 0;
    },

    async incr(key) {
      const next = (Number.parseInt(store.get(key) ?? '0', 10) || 0) + 1;
      store.set(key, String(next));
      return next;
    },

    async ping() {
      return 'PONG';
    },

    multi() {
      const ops: Array<() => Promise<unknown>> = [];
      const chain: any = {
        incr(key: string) {
          ops.push(() => fake.incr(key));
          return chain;
        },
        ttl(key: string) {
          ops.push(() => fake.ttl(key));
          return chain;
        },
        set(key: string, value: string, ...rest: any[]) {
          ops.push(() => fake.set(key, value, ...rest));
          return chain;
        },
        del(key: string) {
          ops.push(() => fake.del(key));
          return chain;
        },
        async exec() {
          const results: Array<[Error | null, unknown]> = [];
          for (const run of ops) {
            try {
              results.push([null, await run()]);
            } catch (err) {
              results.push([err as Error, null]);
            }
          }
          return results;
        },
      };
      return chain;
    },

    // Distributed-lock release path: treated as always succeeding.
    async eval() {
      return 1;
    },

    async quit() {
      return 'OK';
    },

    disconnect() {
      /* no-op */
    },

    on() {
      return fake;
    },
  };

  return fake;
}
