/** Central input manager: keyboard state, mouse deltas, pointer lock. */
export class Input {
  private keys = new Set<string>();
  private presses = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  mouse0 = false;
  mouse2 = false;
  mouse0Pressed = false;

  private locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  private el: HTMLElement;
  private disposers: (() => void)[] = [];

  constructor(el: HTMLElement) {
    this.el = el;

    // NOTE (42-social embed): every listener is tracked so destroy() can
    // remove it on React unmount — otherwise remounts stack listeners.
    const on = (
      target: Window | Document | HTMLElement,
      type: string,
      fn: (e: never) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() =>
        target.removeEventListener(type, fn as EventListener, opts),
      );
    };

    on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.presses.add(e.code);
      // Only swallow Space/Tab while the game owns the pointer — the host
      // page needs those keys the rest of the time.
      if (this.locked && ['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    on(window, 'blur', () => this.keys.clear());

    on(el, 'mousedown', (e: MouseEvent) => {
      if (!this.locked) return;
      if (e.button === 0) {
        this.mouse0 = true;
        this.mouse0Pressed = true;
      }
      if (e.button === 2) this.mouse2 = true;
    });
    on(window, 'mouseup', (e: MouseEvent) => {
      if (e.button === 0) this.mouse0 = false;
      if (e.button === 2) this.mouse2 = false;
    });
    on(el, 'contextmenu', (e: MouseEvent) => e.preventDefault());
    on(
      el,
      'wheel',
      (e: WheelEvent) => {
        if (this.locked) {
          this.wheel += Math.sign(e.deltaY);
          e.preventDefault();
        }
      },
      { passive: false },
    );
    on(document, 'mousemove', (e: MouseEvent) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      this.keys.clear();
      this.mouse0 = this.mouse2 = false;
      this.onLockChange?.(this.locked);
    });
  }

  /** Remove every listener added in the constructor. Idempotent. */
  destroy(): void {
    const run = this.disposers;
    this.disposers = [];
    for (const fn of run) {
      try {
        fn();
      } catch {
        /* already gone */
      }
    }
    this.keys.clear();
    this.presses.clear();
  }

  get isLocked(): boolean {
    return this.locked;
  }

  requestLock(): void {
    try {
      const p = this.el.requestPointerLock() as unknown;
      if (p instanceof Promise) p.catch(() => {});
    } catch {
      // lock refused (e.g. cooldown after Esc) — user can click again
    }
  }

  exitLock(): void {
    document.exitPointerLock();
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  /** True once per physical keypress (consumed on read). */
  pressed(code: string): boolean {
    if (this.presses.has(code)) {
      this.presses.delete(code);
      return true;
    }
    return false;
  }

  consumeMouse(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  consumeMouse0Pressed(): boolean {
    const p = this.mouse0Pressed;
    this.mouse0Pressed = false;
    return p;
  }

  endFrame(): void {
    this.presses.clear();
  }
}
