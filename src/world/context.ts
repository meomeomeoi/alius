import type { Registries } from '../content/types';
import type { CampaignState } from '../engine/state/types';
import type { ContextBuilder } from '../llm/context';

const EXPEDITION_DAYS = 3;
const MAX_SENTENCES = 3;
const MAX_CLOCKS = 2;

/**
 * The world line of the scene context: up to three sentences about the last expedition, one ongoing thread and the
 * visible clocks above half. Priority 50 sits below the promises (60), so a tight cap drops it first. Hidden clocks and
 * dynamic flags are never shown.
 */
export function registerWorldContext(builder: ContextBuilder, deps: { registries: () => Registries }): void {
  builder.register({
    id: 'world',
    priority: 50,
    render(s: CampaignState): string | null {
      if (!s.scene) return null;
      const sentences: string[] = [];

      const last = s.lastExpedition;
      if (last && s.day - last.day <= EXPEDITION_DAYS && s.day >= last.day) {
        const region = deps.registries().regions.get(last.regionId);
        const where = String(region?.name ?? last.regionId);
        const when = s.day === last.day ? 'today' : `${s.day - last.day} day(s) ago`;
        sentences.push(`World: the unit came back from ${where} ${when} (${last.outcome}).`);
      }

      const present = new Set(s.scene.participants);
      const open = s.world.threads.filter((t) => t.status === 'open');
      const own = open.find((t) => !t.id.startsWith('spine:') && t.relatedUnits.some((u) => present.has(u)));
      const proposed = s.world.spine?.proposed;
      const spine = proposed === undefined ? undefined : open.find((t) => t.id === `spine:${proposed}`);
      const thread = own ?? spine;
      if (thread) sentences.push(`Ongoing: ${thread.title}.`);

      const clocks = s.world.clocks
        .filter((c) => c.visibleToPlayer && c.filled * 2 > c.segments)
        .sort((a, b) => b.filled / b.segments - a.filled / a.segments)
        .slice(0, Math.min(MAX_CLOCKS, MAX_SENTENCES - sentences.length));
      for (const c of clocks) sentences.push(`Pressure: ${c.label} is at ${c.filled}/${c.segments}.`);

      return sentences.length === 0 ? null : sentences.join(' ');
    },
  });
}
