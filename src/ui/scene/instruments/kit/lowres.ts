/**
 * P10e-e kit: a canvas at a quarter of the frame's resolution (`DS = 4`), stretched over its host by CSS; the browser's upscaling gives every
 * edge its softness (breath.html's three dark canvases, weight.html's shadow: `shC.width = Math.ceil(innerWidth / DS)`). The size is the
 * host's (the scene's frame), not the window's. Without a 2D context (a test page) the context is a stand-in that draws nothing.
 */
export const DS = 4;

export interface LowRes {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Fits the canvas to its host again (call it on a resize). */
  resize(): void;
}

/** A context that ignores every call (a page with no canvas support): an instrument still runs, it only draws nothing. */
export function nullContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const target: Record<string | symbol, unknown> = { canvas };
  return new Proxy(target, {
    get: (t, p) => (p in t ? t[p] : () => undefined),
    set: (t, p, v) => { t[p] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

export function lowres(host: HTMLElement, ds: number = DS): LowRes {
  const canvas = document.createElement('canvas');
  canvas.className = 'alius-lowres';
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  const resize = (): void => {
    const w = host.clientWidth || (typeof innerWidth === 'number' ? innerWidth : 0);
    const h = host.clientHeight || (typeof innerHeight === 'number' ? innerHeight : 0);
    canvas.width = Math.ceil(w / ds);
    canvas.height = Math.ceil(h / ds);
  };
  resize();
  return { canvas, ctx: ctx ?? nullContext(canvas), resize };
}
