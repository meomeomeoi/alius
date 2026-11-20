<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>__TITLE__</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&amp;display=swap">
<style>
body{margin:0}
.hub svg{display:block}
.hub .f{stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round}
.hub .thin{stroke-width:.7;stroke-linecap:round}
.hub .wall{stroke-width:2.2}
.hub .wall-thin{stroke-width:1.2}
.hub .outer{stroke-width:4}
.hub .doorcut{stroke-width:3.4}
.hub .baydoor{stroke-width:3;stroke-dasharray:6 3}
.hub .fence{stroke-width:1.1}
.hub .hatch{stroke-width:.5;opacity:.45}
.hub .grid{stroke-width:.4;opacity:.3}
.hub .grid-major{stroke-width:.7;opacity:.5}
.hub .dash{stroke-dasharray:4 3}
.hub .chip{stroke-width:.8}
.hub .marker{stroke-width:1.6}
.hub .road{stroke-width:0}
.hub .lab{font-family:"IBM Plex Mono",monospace;font-size:7.6px;letter-spacing:.12em;font-weight:600}
.hub .lab-cabin{font-family:"IBM Plex Mono",monospace;font-size:8px;letter-spacing:.12em;font-weight:600}
.hub .lab-mini{font-family:"IBM Plex Mono",monospace;font-size:5.6px;letter-spacing:.1em;font-weight:600}
.hub .lab-small{font-family:"IBM Plex Mono",monospace;font-size:7px;letter-spacing:.14em;font-weight:600}
.hub .mid{text-anchor:middle}
.hub .mk{font-family:"IBM Plex Mono",monospace;font-size:10px;font-weight:600;text-anchor:middle}
.hub .mk-tiny{font-family:"IBM Plex Mono",monospace;font-size:7px;font-weight:600;text-anchor:middle}
.hub .cap{font-family:"IBM Plex Mono",monospace;font-size:6.6px;letter-spacing:.2em;text-anchor:end}
.hub .bp-only{display:none}
.hub.look-blueprint .bp-only{display:inline}
.hub.look-blueprint .cut-only{display:none}
.hub .night-on{display:none}
.hub.slot-night .night-on{display:inline}
.hub .elight{animation:hubled 5s steps(1) infinite}
.hub .dusk-on{display:none}
.hub.slot-evening .dusk-on,.hub.slot-night .dusk-on{display:inline}
.hub .alarm-only{display:none}
.hub.is-alarm .alarm-only{display:inline}
.hub .alarm-frame{stroke-width:4}
.hub .f2,.hub .roofl{display:none}
.hub.on-2f .f1{opacity:.13}
.hub.on-2f .site,.hub.on-roof .site{opacity:.35}
.hub.on-2f .f2{display:inline}
.hub.on-roof .f1{opacity:.08}
.hub.on-roof .roofl{display:inline}
.hub .path{stroke-width:5;opacity:.3;stroke-linecap:round}
.hub .pulse{animation:hubpulse 1.6s ease-in-out infinite}
.hub .blink{animation:hubblink 2.4s steps(1) infinite}
.hub .led{animation:hubled 3.2s steps(1) infinite}
@keyframes hubpulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes hubblink{0%{opacity:1}50%{opacity:.15}}
@keyframes hubled{0%{opacity:1}40%{opacity:.3}70%{opacity:1}}
@media (prefers-reduced-motion: reduce){.hub .pulse,.hub .blink,.hub .led{animation:none}}
.hub .layers{position:absolute;top:14px;right:18px;display:flex;gap:6px}
.hub .layers button{font-family:"IBM Plex Mono",monospace;font-size:13px;font-weight:600;letter-spacing:.12em;padding:0 14px;height:44px;min-width:96px;background:transparent;cursor:pointer;border-width:1px;border-style:solid}
</style>
</helmet>
<div class="hub look-{{look}} slot-{{slot}} {{alarmClass}} {{layerClass}}" style="width: 1280px; height: 800px; position: relative; background: {{k.bg}}">
<svg width="1280" height="800" viewBox="0 0 1000 625" role="img" aria-label="Top-down plan of the outpost on two floors and its roofs: corridors, quarters, mess hall, medbay, comms, workshop, garage, the training yard, the fence and the gate">
<g class="site">
__SITE__
</g>
<g class="f1">
__F1__
</g>
<g class="f2">
__F2__
</g>
<g class="roofl">
__ROOF__
</g>
__ALARM__SVG
</svg>
<div class="layers">
<button type="button" aria-pressed="{{b1.pressed}}" onClick="{{b1.go}}" style="color: {{b1.text}}; background: {{b1.bg}}; border-color: {{k.fg}}">1F</button>
<button type="button" aria-pressed="{{b2.pressed}}" onClick="{{b2.go}}" style="color: {{b2.text}}; background: {{b2.bg}}; border-color: {{k.fg}}">2F</button>
<button type="button" aria-pressed="{{b3.pressed}}" onClick="{{b3.go}}" style="color: {{b3.text}}; background: {{b3.bg}}; border-color: {{k.fg}}">ROOF</button>
</div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='__PROPS__'>
class Component extends DCLogic {
  renderVals() {
    const PAL = {
      amber: { fg: '#ffb000', dim: '#d29200', bg: '#120c02', accent: '#ffd060' },
      green: { fg: '#33ff66', dim: '#2bcf55', bg: '#021208', accent: '#8dffaa' },
      white: { fg: '#e8e8e8', dim: '#b4b4b4', bg: '#0b0b0b', accent: '#ffffff' },
    };
    const DANGER = '#fc2200', BOND = '#fda4c9';
    const look = this.props.look ?? '__LOOK__';
    const slot = this.props.slot ?? '__SLOT__';
    const layer = (this.state && this.state.layer) || (this.props.layer ?? '__LAYER__');
    const p = PAL[this.props.palette ?? '__PALETTE__'] ?? PAL.amber;
    const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v * t + hex(b)[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
    const bp = look === 'blueprint';
    const night = slot === 'night', dusk = slot === 'evening';
    const light = night ? 0.45 : dusk ? 0.75 : 1;
    const m = (t) => mix(p.fg, p.bg, t * light);
    const k = {
      bg: p.bg, fg: p.fg, dim: p.dim, accent: p.accent,
      line: bp ? p.fg : m(0.62),
      grid: p.dim,
      outside: bp ? p.bg : mix(p.fg, p.bg, 0.02),
      compound: bp ? p.bg : m(0.045),
      speck: m(0.35),
      road: bp ? p.bg : m(0.11),
      roadLine: bp ? p.dim : m(0.4),
      yard: bp ? p.bg : m(0.07),
      tower: bp ? p.bg : m(0.16),
      fence: bp ? p.fg : m(0.55),
      fenceText: p.dim,
      corridor: bp ? p.bg : m(0.16),
      corrLine: bp ? p.dim : m(0.34),
      room: bp ? p.bg : m(0.085),
      roomLit: bp ? p.bg : night ? mix(p.fg, p.bg, 0.13) : m(0.1),
      closed: bp ? p.bg : mix(p.fg, p.bg, 0.035),
      furn: bp ? p.fg : m(0.55),
      furnFill: bp ? p.bg : m(0.17),
      bed: bp ? p.bg : m(0.3),
      rug: bp ? p.bg : m(0.24),
      screen: bp ? p.bg : mix(p.accent, p.bg, night ? 0.5 : 0.32),
      roofSlab: bp ? p.bg : m(0.15),
      roofLow: bp ? p.bg : m(0.08),
      canopy: bp ? p.bg : m(0.22),
      leaf: bp ? p.dim : m(0.45),
      winLit: night ? p.accent : m(0.4),
      glow: p.accent,
      glowA: night ? 0.09 : 0.05, glowB: night ? 0.1 : 0.05,
      cone: night ? 0.07 : 0.035,
      led: p.accent,
      warnLight: DANGER,
      danger: DANGER, bond: BOND,
      chip: bp ? p.bg : p.fg,
      chipClosed: p.bg,
      chipLine: p.fg,
      chipText: bp ? p.fg : p.bg,
      chipTextClosed: p.dim,
    };
    const btn = (id) => ({
      pressed: layer === id ? 'true' : 'false',
      bg: layer === id ? p.fg : p.bg,
      text: layer === id ? p.bg : p.fg,
      go: () => this.setState({ layer: id }),
    });
    return {
      k, look, slot,
      alarmClass: (this.props.alarm ?? __ALARM__) ? 'is-alarm' : '',
      layerClass: 'on-' + layer,
      b1: btn('1f'), b2: btn('2f'), b3: btn('roof'),
    };
  }
}
</script>
</body>
</html>
