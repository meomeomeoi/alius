import type { Entry, Registries } from '../../content/types';
import type { Rng } from '../rng';
import type { MapNode, Mission, NodeMap } from './types';

export const OBJECTIVE_ID = 'obj';

interface Candidate { id: string; weight: number; kind: string; maxPerMap?: number }

/** Node types the region may draw for a layer: declared in its weights, not an objective, allowed at this danger and depth. */
function candidates(reg: Registries, region: Entry, layer: number, danger: number): Candidate[] {
  const out: Candidate[] = [];
  for (const [id, weight] of Object.entries(region.nodeWeights as Record<string, number>)) {
    const def = reg.nodeTypes.get(id);
    if (!def || def.kind === 'objective' || !(weight > 0)) continue;
    if (layer === 0 && def.firstLayer === false) continue;
    if (typeof def.minDanger === 'number' && danger < def.minDanger) continue;
    out.push({ id, weight, kind: String(def.kind), maxPerMap: def.maxPerMap as number | undefined });
  }
  return out;
}

function draw(rng: Rng, list: Candidate[], used: Map<string, number>, onlyKind?: string): string | null {
  const open = list.filter((c) => (c.maxPerMap === undefined || (used.get(c.id) ?? 0) < c.maxPerMap) && (onlyKind === undefined || c.kind === onlyKind));
  if (open.length === 0) return null;
  const total = open.reduce((s, c) => s + c.weight, 0);
  let r = rng.float() * total;
  const pick = open.find((c) => (r -= c.weight) < 0) ?? open[open.length - 1];
  return pick.id;
}

/**
 * A seeded node map: `region.layers` layers of 2–3 nodes, edges only into the next layer, one objective node `obj`
 * after the last layer. Every layer holds a combat-kind node (when the region can draw one); `maxPerMap`, `minDanger`
 * and `firstLayer` of the node types are respected.
 */
export function generateNodeMap(reg: Registries, rng: Rng, input: { regionId: string; danger: number }): NodeMap {
  const region = reg.regions.get(input.regionId);
  if (!region) throw new Error(`Unknown region "${input.regionId}"`);
  const [minLayers, maxLayers] = region.layers as [number, number];
  const layerCount = rng.int(minLayers, maxLayers);
  const nodes: Record<string, MapNode> = {};
  const layers: string[][] = [];
  const used = new Map<string, number>();
  const bump = (type: string, by: number) => used.set(type, (used.get(type) ?? 0) + by);
  const none = (): never => { throw new Error(`No playable node type for region "${input.regionId}"`); };

  for (let l = 0; l < layerCount; l++) {
    const list = candidates(reg, region, l, input.danger);
    const size = rng.int(2, 3);
    const ids: string[] = [];
    for (let i = 0; i < size; i++) {
      const type = draw(rng, list, used) ?? none();
      bump(type, 1);
      const id = `n${l}_${i}`;
      nodes[id] = { id, layer: l, type, edges: [], visited: false };
      ids.push(id);
    }
    if (!ids.some((id) => reg.nodeTypes.get(nodes[id].type)!.kind === 'combat')) {
      // re-draw the first node as a combat-kind one (when the region has any left)
      bump(nodes[ids[0]].type, -1);
      const type = draw(rng, list, used, 'combat');
      if (type === null) bump(nodes[ids[0]].type, 1);
      else {
        nodes[ids[0]].type = type;
        bump(type, 1);
      }
    }
    layers.push(ids);
  }

  // edges: every node gets its nearest next-layer node, uncovered nodes are picked up by the nearest node with room,
  // then a node may add a second edge to a neighbour (so every node has 1–2 edges and every next node an incoming one)
  for (let l = 0; l + 1 < layers.length; l++) {
    const from = layers[l];
    const to = layers[l + 1];
    const edges = from.map((_, i) => [Math.min(i, to.length - 1)]);
    for (let t = 0; t < to.length; t++) {
      if (edges.some((e) => e.includes(t))) continue;
      const order = from.map((_, i) => i).sort((a, b) => Math.abs(a - t) - Math.abs(b - t) || a - b);
      const donor = order.find((i) => edges[i].length < 2) ?? order[0];
      edges[donor].push(t);
    }
    from.forEach((_, i) => {
      if (edges[i].length >= 2 || !rng.chance(0.5)) return;
      const options = [edges[i][0] - 1, edges[i][0] + 1].filter((t) => t >= 0 && t < to.length && !edges[i].includes(t));
      if (options.length > 0) edges[i].push(options[rng.int(0, options.length - 1)]);
    });
    from.forEach((id, i) => { nodes[id].edges = [...edges[i]].sort((a, b) => a - b).map((t) => to[t]); });
  }
  for (const id of layers[layers.length - 1]) nodes[id].edges = [OBJECTIVE_ID];
  nodes[OBJECTIVE_ID] = { id: OBJECTIVE_ID, layer: layers.length, type: 'objective', edges: [], visited: false };
  return { layers, objectiveId: OBJECTIVE_ID, nodes };
}

/** The nodes the party may enter next: the first layer from the entrance, else the edges of where it stands. */
export function nextNodes(map: NodeMap, at: string | null): string[] {
  return at === null ? [...map.layers[0]] : [...(map.nodes[at]?.edges ?? [])];
}

/** Nodes whose type is shown: visited ones and everything within `reveal` edges ahead (from the entrance: the first `reveal` layers). */
export function visibleTypes(map: NodeMap, at: string | null, reveal: number): Set<string> {
  const seen = new Set<string>(Object.values(map.nodes).filter((n) => n.visited).map((n) => n.id));
  if (at !== null) seen.add(at);
  let frontier = nextNodes(map, at);
  for (let depth = 1; depth <= reveal && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      seen.add(id);
      next.push(...map.nodes[id].edges);
    }
    frontier = [...new Set(next)];
  }
  return seen;
}

export interface MapCell { nodeId: string; text: string; state: 'visited' | 'current' | 'option' | 'ahead' }

/** One row per layer plus a last row for the objective; hidden nodes read `[ ]`. The DOM view renders this model. */
export function mapRows(map: NodeMap, opts: { at: string | null; visible: Set<string>; reg: Registries }): MapCell[][] {
  const options = new Set(nextNodes(map, opts.at));
  const rows = [...map.layers, [map.objectiveId]];
  return rows.map((ids) => ids.map((nodeId): MapCell => {
    const node = map.nodes[nodeId];
    const glyph = opts.visible.has(nodeId) ? String(opts.reg.nodeTypes.get(node.resolvedType ?? node.type)?.glyph ?? '?') : ' ';
    const state: MapCell['state'] = nodeId === opts.at ? 'current' : node.visited ? 'visited' : options.has(nodeId) ? 'option' : 'ahead';
    return { nodeId, text: `[${glyph}]`, state };
  }));
}

/** What a node plays as: the mission's objective node for `obj`, the resolved type (for `unknown` nodes) otherwise. */
export function nodePlayType(map: NodeMap, nodeId: string, mission: Mission): string {
  if (nodeId === map.objectiveId) return mission.objective.node;
  const node = map.nodes[nodeId];
  return node.resolvedType ?? node.type;
}
