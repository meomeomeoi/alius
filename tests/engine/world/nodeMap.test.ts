import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { Rng, seedRng } from '../../../src/engine/rng';
import { generateNodeMap, mapRows, nextNodes, nodePlayType, visibleTypes } from '../../../src/engine/world/nodeMap';
import type { Mission, NodeMap } from '../../../src/engine/world/types';
import { loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const make = (regionId: string, seed: number, danger?: number): NodeMap =>
  generateNodeMap(reg, new Rng(seedRng(seed)), { regionId, danger: danger ?? (reg.regions.get(regionId)!.danger as number) });
const kindOf = (map: NodeMap, id: string): string => String(reg.nodeTypes.get(map.nodes[id].type)!.kind);
const REGIONS = ['quarantine_d7', 'kestrel_corridor', 'ashway', 'drowned_market', 'the_garden'];
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe('node map generation', () => {
  it('same seed and input give the same map', () => {
    for (const id of REGIONS) {
      expect(make(id, 17)).toEqual(make(id, 17));
      expect(JSON.stringify(make(id, 17))).not.toBe(JSON.stringify(make(id, 18)));
    }
  });

  it('3 to 5 layers of 2 to 3 nodes, with ids n<layer>_<i> and a single objective after the last layer', () => {
    for (const id of REGIONS) {
      const [lo, hi] = reg.regions.get(id)!.layers as [number, number];
      const seen = new Set<number>();
      for (const seed of SEEDS) {
        const map = make(id, seed);
        seen.add(map.layers.length);
        expect(map.layers.length, `${id} ${seed}`).toBeGreaterThanOrEqual(lo);
        expect(map.layers.length).toBeLessThanOrEqual(hi);
        expect(map.layers.length).toBeGreaterThanOrEqual(3);
        expect(map.layers.length).toBeLessThanOrEqual(5);
        map.layers.forEach((layer, l) => {
          expect(layer.length).toBeGreaterThanOrEqual(2);
          expect(layer.length).toBeLessThanOrEqual(3);
          layer.forEach((nid, i) => {
            expect(nid).toBe(`n${l}_${i}`);
            expect(map.nodes[nid]).toMatchObject({ id: nid, layer: l, visited: false });
          });
        });
        expect(map.objectiveId).toBe('obj');
        expect(map.nodes.obj).toMatchObject({ type: 'objective', layer: map.layers.length, edges: [], visited: false });
        expect(Object.keys(map.nodes).length).toBe(map.layers.flat().length + 1);
      }
      if (hi > lo) expect(seen.size, id).toBeGreaterThan(1);
    }
  });

  it('every node of a layer has 1 or 2 edges into the next layer and every node has an incoming edge', () => {
    for (const id of REGIONS) {
      for (const seed of SEEDS) {
        const map = make(id, seed);
        const incoming = new Map<string, number>();
        map.layers.forEach((layer, l) => {
          const next = l + 1 < map.layers.length ? map.layers[l + 1] : ['obj'];
          for (const nid of layer) {
            const edges = map.nodes[nid].edges;
            if (l + 1 < map.layers.length) {
              expect(edges.length, `${id} ${seed} ${nid}`).toBeGreaterThanOrEqual(1);
              expect(edges.length).toBeLessThanOrEqual(2);
            } else {
              expect(edges).toEqual(['obj']);
            }
            for (const e of edges) {
              expect(next).toContain(e);
              incoming.set(e, (incoming.get(e) ?? 0) + 1);
            }
          }
        });
        for (const nid of [...map.layers.slice(1).flat(), 'obj']) expect(incoming.get(nid), `${id} ${seed} ${nid}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('every path from the entrance reaches the objective', () => {
    for (const id of REGIONS) {
      for (const seed of SEEDS.slice(0, 100)) {
        const map = make(id, seed);
        const reach = (from: string): boolean => from === 'obj' || map.nodes[from].edges.some(reach);
        for (const start of nextNodes(map, null)) expect(reach(start), `${id} ${seed}`).toBe(true);
        // and every node is reachable from the entrance
        const seen = new Set<string>();
        const walk = (n: string) => { if (!seen.has(n)) { seen.add(n); map.nodes[n].edges.forEach(walk); } };
        nextNodes(map, null).forEach(walk);
        expect(seen.size).toBe(Object.keys(map.nodes).length);
      }
    }
  });

  it('no elite, rest or crisis in the first layer', () => {
    for (const id of REGIONS) {
      for (const seed of SEEDS) {
        const map = make(id, seed);
        for (const nid of map.layers[0]) expect(['elite', 'rest', 'crisis'], `${id} ${seed}`).not.toContain(map.nodes[nid].type);
      }
    }
  });

  it('at most one crisis and none below danger 3', () => {
    let crises = 0;
    for (const id of REGIONS) {
      for (const seed of SEEDS) {
        const crisisIn = (danger: number) => Object.values(make(id, seed, danger).nodes).filter((n) => n.type === 'crisis').length;
        expect(crisisIn(1), `${id} ${seed}`).toBe(0);
        expect(crisisIn(2)).toBe(0);
        const c = crisisIn(3);
        expect(c).toBeLessThanOrEqual(1);
        expect(crisisIn(5)).toBeLessThanOrEqual(1);
        crises += c;
      }
    }
    expect(crises).toBeGreaterThan(0); // the cap is not vacuous
  });

  it('every layer has a combat-kind node, and the objective is never drawn as a regular node', () => {
    for (const id of REGIONS) {
      for (const seed of SEEDS) {
        const map = make(id, seed);
        for (const layer of map.layers) {
          expect(layer.some((nid) => kindOf(map, nid) === 'combat'), `${id} ${seed}`).toBe(true);
          for (const nid of layer) expect(kindOf(map, nid)).not.toBe('objective');
        }
      }
    }
  });

  it('a region whose weights name only removed node types throws a readable error', () => {
    const regs = { ...reg, regions: new Map(reg.regions) } as Registries;
    regs.regions.set('broken', { ...reg.regions.get('ashway')!, id: 'broken', nodeWeights: { ghost: 1, objective: 2 } });
    expect(() => generateNodeMap(regs, new Rng(seedRng(1)), { regionId: 'broken', danger: 2 })).toThrow('No playable node type for region "broken"');
    expect(() => generateNodeMap(reg, new Rng(seedRng(1)), { regionId: 'nowhere', danger: 2 })).toThrow(/region/i);
  });
});

describe('fog and rows', () => {
  let map: NodeMap;
  beforeAll(() => {
    map = make('ashway', 3);
  });

  it('nextNodes from the entrance is the first layer; from a node its edges; none from the objective', () => {
    expect(nextNodes(map, null)).toEqual(map.layers[0]);
    expect(nextNodes(map, 'n0_0')).toEqual(map.nodes.n0_0.edges);
    expect(nextNodes(map, 'obj')).toEqual([]);
  });

  it('with reveal 1 only the options show their type, with reveal 2 one layer more', () => {
    expect([...visibleTypes(map, null, 1)].sort()).toEqual([...map.layers[0]].sort());
    expect([...visibleTypes(map, null, 2)].sort()).toEqual([...map.layers[0], ...map.layers[1]].sort());
    const at = 'n0_0';
    const one = visibleTypes({ ...map, nodes: { ...map.nodes, [at]: { ...map.nodes[at], visited: true } } }, at, 1);
    expect([...one].sort()).toEqual([at, ...map.nodes[at].edges].sort());
    const two = visibleTypes({ ...map, nodes: { ...map.nodes, [at]: { ...map.nodes[at], visited: true } } }, at, 2);
    const ahead = new Set<string>([at]);
    for (const e of map.nodes[at].edges) { ahead.add(e); map.nodes[e].edges.forEach((x) => ahead.add(x)); }
    expect([...two].sort()).toEqual([...ahead].sort());
  });

  it('visited nodes stay visible', () => {
    const m = structuredClone(map);
    m.nodes.n0_0.visited = true;
    m.nodes.n0_1.visited = true;
    const vis = visibleTypes(m, m.nodes.n0_1.edges[0], 1);
    expect(vis.has('n0_0')).toBe(true);
    expect(vis.has('n0_1')).toBe(true);
  });

  it('mapRows marks current, options and hidden nodes', () => {
    const m = structuredClone(map);
    m.nodes.n0_0.visited = true;
    const at = 'n0_0';
    const visible = visibleTypes(m, at, 1);
    const rows = mapRows(m, { at, visible, reg });
    expect(rows).toHaveLength(m.layers.length + 1); // one row per layer and the objective
    expect(rows[0].find((c) => c.nodeId === at)).toMatchObject({ state: 'current', text: `[${reg.nodeTypes.get(m.nodes[at].type)!.glyph}]` });
    for (const opt of m.nodes[at].edges) {
      const cell = rows[1].find((c) => c.nodeId === opt)!;
      expect(cell.state).toBe('option');
      expect(cell.text).toBe(`[${reg.nodeTypes.get(m.nodes[opt].type)!.glyph}]`);
    }
    for (const c of rows.flat().filter((c) => !visible.has(c.nodeId))) {
      expect(c.text).toBe('[ ]');
      expect(c.state).toBe('ahead');
    }
    expect(rows[rows.length - 1]).toEqual([{ nodeId: 'obj', text: '[ ]', state: 'ahead' }]);
    // the other first-layer node is neither current nor an option once we stand in the first layer
    const other = rows[0].find((c) => c.nodeId === 'n0_1')!;
    expect(other.state).toBe('ahead');
    // from the entrance every first-layer node is an option
    const entrance = mapRows(m, { at: null, visible: visibleTypes(m, null, 1), reg });
    expect(entrance[0].every((c) => c.state === 'option' || c.state === 'visited')).toBe(true);
  });

  it('a resolved unknown node shows its real glyph; an unresolved one shows ?', () => {
    const m = structuredClone(map);
    m.nodes.n0_0.type = 'unknown';
    const visible = new Set(['n0_0']);
    expect(mapRows(m, { at: null, visible, reg })[0][0].text).toBe('[?]');
    m.nodes.n0_0.resolvedType = 'cache';
    expect(mapRows(m, { at: null, visible, reg })[0][0].text).toBe('[≡]');
  });

  it('nodePlayType gives the mission objective for obj and the resolved type otherwise', () => {
    const mission = { objective: { node: 'elite', condition: 'win' } } as Mission;
    const m = structuredClone(map);
    m.nodes.n0_0.type = 'unknown';
    expect(nodePlayType(m, 'obj', mission)).toBe('elite');
    expect(nodePlayType(m, 'n0_0', mission)).toBe('unknown');
    m.nodes.n0_0.resolvedType = 'combat';
    expect(nodePlayType(m, 'n0_0', mission)).toBe('combat');
  });
});
