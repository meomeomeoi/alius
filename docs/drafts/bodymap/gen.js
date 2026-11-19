const fs=require('fs');
// Catmull-Rom -> cubic bezier path through points (open), tension 0.5
function cr(pts,closed){let d=`M${pts[0][0]},${pts[0][1]}`;const n=pts.length;
 const P=i=>closed?pts[(i+n)%n]:pts[Math.max(0,Math.min(n-1,i))];
 const last=closed?n:n-1;
 for(let i=0;i<last;i++){const p0=P(i-1),p1=P(i),p2=P(i+1),p3=P(i+2);
  const c1=[p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6],c2=[p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6];
  d+=` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;}
 return d+(closed?'Z':'');}
// right half of body (x>=0), from neck top down to crotch
const R=[[9,60],[10,80],[16,92],[30,96],[40,100],[45,114],[45,132],[47,150],[43,170],[34,192],[31,208],[36,228],[47,250],[50,272],[47,300],[42,335],[37,370],[34,392],[36,420],[33,448],[24,470],[26,484],[22,494],[12,495],[9,484],[10,468],[11,440],[10,410],[11,388],[9,360],[6,325],[3,300],[0,292]];
const L=R.slice(0,-1).reverse().map(([x,y])=>[-x,y]);
const body=cr([...R,...L],true);
const armR=[[34,97],[48,100],[57,108],[61,128],[62,165],[63,200],[66,240],[69,272],[73,292],[72,310],[66,322],[60,318],[58,300],[57,276],[54,245],[51,208],[49,172],[46,145],[40,124],[36,108]];
const arm=s=>cr(armR.map(([x,y])=>[x*s,y]),true);
const head=`<ellipse cx="0" cy="38" rx="22" ry="29"/>`;
const hairBack=`<path d="${cr([[-24,40],[-25,18],[-14,6],[0,3],[14,6],[25,18],[24,40],[26,62],[20,76],[-20,76],[-26,62]],true)}"/>`;
function figure(back){
 const fringe=`<path d="${cr([[-22,30],[-20,14],[-8,8],[4,9],[16,13],[22,26],[12,20],[0,19],[-12,22]],true)}"/>`;
 const shapes=back?`<path d="${body}"/><path d="${arm(1)}"/><path d="${arm(-1)}"/>${head}${hairBack}`
   :`${hairBack}<path d="${body}"/><path d="${arm(1)}"/><path d="${arm(-1)}"/>${head}${fringe}`;
 const detail=back?`
  <path d="M0,96 C1,140 -1,190 0,232" class="ln"/>
  <path d="M-30,118 C-24,132 -14,138 -8,136 M30,118 C24,132 14,138 8,136" class="ln"/>
  <path d="M-30,268 C-18,286 -6,284 0,272 C6,284 18,286 30,268" class="ln"/>
  <path d="M-24,40 C-22,60 -16,72 -12,76 M24,40 C22,60 16,72 12,76" class="ln"/>`
 :`
  <path d="M-30,100 C-18,106 -8,104 -3,101 M30,100 C18,106 8,104 3,101" class="ln"/>
  <path d="M-38,150 C-30,166 -14,166 -6,152 M38,150 C30,166 14,166 6,152" class="ln"/>
  <circle cx="0" cy="214" r="1.6" class="dot"/>
  <path d="M-30,250 C-20,262 -12,270 -6,276 M30,250 C20,262 12,270 6,276" class="ln"/>
  <path d="M-22,388 q4,6 8,0 M22,388 q-4,6 -8,0" class="ln"/>
  <path d="M-14,26 q4,-3 8,0 M14,26 q-4,-3 -8,0" class="ln"/>`;
 return `<g class="outline">${shapes}</g><g class="fill">${shapes}</g>${detail}`;}
// zones: [x,y,r,status,label,side,mastery,scent]
const front=[[0,24,0,'',''],
 [0,88,10,'enjoys','NECK','L',2,0],
 [-44,136,9,'craves','ARMPITS','L',3,2],
 [0,140,0,'',''],
 [24,152,13,'unknown','BREASTS','R',0,0,true],
 [-66,312,10,'indifferent','HANDS','L',1,0],
 [28,330,16,'enjoys','THIGHS','R',1,0],
 [-18,486,13,'craves','FEET · TOES','L',2,3],
 [0,34,0,'','']].filter(z=>z[2]);
const back=[[0,96,10,'enjoys','NAPE','R',1,0],
 [0,24,14,'dislikes','HAIR','L',0,0],
 [0,190,18,'unknown','BACK','R',0,0],
 [16,272,15,'unknown','BOTTOM','R',0,1,true],
 [-28,410,12,'indifferent','CALVES','L',0,0],
 [18,492,12,'craves','SOLES','R',3,3]];
const col={craves:'#e0a33a',enjoys:'#4fb8a6',indifferent:'#7b8794',dislikes:'#c2575b',unknown:'#5e6b78'};
function zones(list,cx,oy,colL,colR){let s='';
 for(const [x,y,r,st,lab,side,m,sc,expl] of list){
  const X=cx+x,Y=oy+y,c=col[st];
  s+=`<circle cx="${X}" cy="${Y}" r="${r}" fill="${st==='unknown'?'none':c}" fill-opacity="${st==='unknown'?0:0.28}" stroke="${c}" stroke-width="1.4" ${st==='unknown'?'stroke-dasharray="3 3"':''}/>`;
  if(sc>=2) s+=`<circle cx="${X}" cy="${Y}" r="${r}" fill="url(#hatch${sc})"/>`;
  if(st==='unknown') s+=`<text x="${X}" y="${Y+4}" class="q">?</text>`;
  const tx=side==='L'?colL:colR, anchor=side==='L'?'end':'start', ex=side==='L'?X-r:X+r;
  s+=`<path d="M${ex},${Y} L${tx+(side==='L'?8:-8)},${Y}" class="lead" stroke="${c}"/>`;
  s+=`<circle cx="${ex}" cy="${Y}" r="1.8" fill="${c}"/>`;
  s+=`<text x="${tx}" y="${Y-2}" text-anchor="${anchor}" class="lab" fill="${c==col.unknown?'#9aa6b2':c}">${lab}${expl?' <tspan class="ex">◇</tspan>':''}</text>`;
  const dots=[0,1,2,3,4].map(i=>i<m?'●':'○').join('');
  const sub=st==='unknown'?'NOT YET KNOWN':`${st.toUpperCase()}  ${dots}`;
  s+=`<text x="${tx}" y="${Y+11}" text-anchor="${anchor}" class="sub">${sub}</text>`;
  if(sc) s+=`<text x="${tx}" y="${Y+22}" text-anchor="${anchor}" class="sub" fill="#c99a4a">SCENT · ${['','FAINT','STRONG','OVERWHELMING'][sc]}</text>`;
 } return s;}
const W=960,H=760;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'IBM Plex Mono','DejaVu Sans Mono',monospace">
<defs>
 <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20,0 L0,0 0,20" fill="none" stroke="#1c252e" stroke-width="1"/></pattern>
 <pattern id="hatch2" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#e0a33a" stroke-opacity=".35" stroke-width="1.2"/></pattern>
 <pattern id="hatch3" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#e0a33a" stroke-opacity=".6" stroke-width="1.6"/></pattern>
 <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26323d"/><stop offset="1" stop-color="#1b242c"/></linearGradient>
 <radialGradient id="glow" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#4fb8a6" stop-opacity=".10"/><stop offset="1" stop-color="#4fb8a6" stop-opacity="0"/></radialGradient>
</defs>
<style>
 .outline path,.outline ellipse{fill:none;stroke:#6fa9b5;stroke-width:2.6;stroke-linejoin:round}
 .fill path,.fill ellipse{fill:url(#skin)}
 .ln{fill:none;stroke:#6fa9b5;stroke-opacity:.35;stroke-width:1;stroke-linecap:round}
 .dot{fill:#6fa9b5;fill-opacity:.5}
 .lead{fill:none;stroke-width:.8;stroke-opacity:.7}
 .lab{font-size:11.5px;letter-spacing:1.5px;font-weight:600}
 .sub{font-size:8.5px;letter-spacing:1px;fill:#8794a1}
 .q{font-size:11px;fill:#8a96a3;text-anchor:middle}
 .ex{font-size:9px;fill:#b07ab8}
 .h1{font-size:15px;letter-spacing:3px;fill:#d7e2ea;font-weight:700}
 .h2{font-size:9.5px;letter-spacing:2px;fill:#7f8d99}
 .tag{font-size:9px;letter-spacing:3px;fill:#6fa9b5}
 .leg{font-size:9px;letter-spacing:1px;fill:#9aa6b2}
</style>
<rect width="${W}" height="${H}" fill="#0f1418"/>
<rect width="${W}" height="${H}" fill="url(#grid)"/>
<rect x="14" y="14" width="${W-28}" height="${H-28}" fill="none" stroke="#2b3944" stroke-width="1"/>
<path d="M14,40 L14,14 40,14 M${W-40},14 L${W-14},14 ${W-14},40 M14,${H-40} L14,${H-14} 40,${H-14} M${W-40},${H-14} L${W-14},${H-14} ${W-14},${H-40}" stroke="#6fa9b5" stroke-width="2" fill="none"/>
<text x="36" y="48" class="h1">SOMATIC RESPONSE MAP</text>
<text x="36" y="66" class="h2">VESPER SOMATICS · CCP MEDICAL FILE · UNIT RHEA-07 · COMPILED FROM OBSERVATION</text>
<text x="${W-36}" y="48" text-anchor="end" class="tag">FORM VS-114 / REV 3</text>
<text x="${W-36}" y="66" text-anchor="end" class="h2">DAY 41 · 06:20</text>
<line x1="36" y1="80" x2="${W-36}" y2="80" stroke="#2b3944"/>
<ellipse cx="300" cy="370" rx="150" ry="300" fill="url(#glow)"/>
<ellipse cx="660" cy="370" rx="150" ry="300" fill="url(#glow)"/>
<g transform="translate(300,118)">${figure(false)}</g>
<g transform="translate(660,118)">${figure(true)}</g>
<text x="300" y="640" text-anchor="middle" class="tag">ANTERIOR</text>
<text x="660" y="640" text-anchor="middle" class="tag">POSTERIOR</text>
${zones(front,300,118,170,430)}
${zones(back,660,118,530,790)}
<line x1="36" y1="664" x2="${W-36}" y2="664" stroke="#2b3944"/>
${[['craves',col.craves],['enjoys',col.enjoys],['indifferent',col.indifferent],['dislikes',col.dislikes]].map(([t,c],i)=>`<circle cx="${46+i*118}" cy="690" r="6" fill="${c}" fill-opacity=".3" stroke="${c}"/><text x="${58+i*118}" y="693" class="leg">${t.toUpperCase()}</text>`).join('')}
<circle cx="518" cy="690" r="6" fill="none" stroke="${col.unknown}" stroke-dasharray="2 2"/><text x="530" y="693" class="leg">UNKNOWN</text>
<circle cx="626" cy="690" r="6" fill="url(#hatch3)" stroke="#e0a33a" stroke-opacity=".5"/><text x="638" y="693" class="leg">SCENT NOW</text>
<text x="752" y="693" class="leg">●○○○○ MASTERY</text>
<text x="46" y="718" class="leg"><tspan fill="#b07ab8">◇</tspan> SHOWN ONLY WITH EXPLICIT CONTENT ENABLED   ·   HOVER A ZONE FOR SOURCES (FACTS)   ·   NOTES BELOW THE FORM</text>
</svg>`;
fs.writeFileSync('bodymap.svg',svg);
