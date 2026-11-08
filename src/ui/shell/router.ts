import { h } from '../dom';

export type ScreenId = 'pda' | 'scene' | 'combat' | 'expedition' | 'setup';

type Render = (host: HTMLElement) => void;

export function stubText(name: string): string {
  const lines = [name, 'NO DATA // MODULE OFFLINE'];
  const inner = Math.max(...lines.map((l) => l.length)) + 4;
  const rule = `+${'-'.repeat(inner)}+`;
  return [rule, ...lines.map((l) => `|  ${l.padEnd(inner - 2)}|`), rule].join('\n');
}

/** Maps screens to renderers; screens nobody registered show an offline stub. */
export function createRouter() {
  const renderers = new Map<ScreenId, Render>();
  let current: ScreenId = 'pda';
  return {
    current: () => current,
    go(id: ScreenId): void {
      current = id;
    },
    register(id: ScreenId, render: Render): void {
      renderers.set(id, render);
    },
    render(host: HTMLElement): void {
      host.replaceChildren();
      const render = renderers.get(current);
      if (render) render(host);
      else host.append(h('pre', { class: 'alius-stub' }, stubText(current.toUpperCase())));
    },
  };
}
