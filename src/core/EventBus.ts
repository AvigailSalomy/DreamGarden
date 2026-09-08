/** Tiny typed pub/sub used to decouple scenes from game services. */
export type Listener<T> = (payload: T) => void;

export class Emitter<Events> {
  private map = new Map<keyof Events, Set<Listener<unknown>>>();

  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    let set = this.map.get(event);
    if (!set) {
      set = new Set();
      this.map.set(event, set);
    }
    set.add(fn as Listener<unknown>);
    return () => this.off(event, fn);
  }

  once<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    const off = this.on(event, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends keyof Events>(event: K, fn: Listener<Events[K]>): void {
    this.map.get(event)?.delete(fn as Listener<unknown>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.map.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as Listener<Events[K]>)(payload);
      } catch (err) {
        console.error(`[EventBus] listener for "${String(event)}" threw`, err);
      }
    }
  }

  clear(): void {
    this.map.clear();
  }
}
