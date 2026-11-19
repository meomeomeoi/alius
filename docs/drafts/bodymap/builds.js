const fs=require('fs');
const src=fs.readFileSync('gen.js','utf8');
// reuse cr + base points from gen.js
eval(src.split('const L=')[0].replace(/\bconst /g,'var ').replace(/var fs=require\('fs'\);/,'').replace(/function cr/,'var cr=function'));
eval('var armR0='+src.match(/const armR=(\[\[.*?\]\]);/s)[1]);
const lerp=(k,y)=>{for(let i=0;i<k.length-1;i++){const[a,m]=k[i],[b,n]=k[i+1];if(y<=b){const t=Math.max(0,(y-a)/(b-a));return m+(n-m)*t;}}return k[k.length-1][1];};
const builds={
 slim:{w:[[0,1],[500,1]],arm:1,armOut:[[0,1],[500,1]],lines:''},
 athletic:{w:[[60,1],[92,1.05],[104,1.13],[130,1.1],[150,1.0],[205,1.07],[250,1.0],[300,1.06],[340,1.07],[392,1.0],[420,1.1],[470,1.05],[500,1]],arm:1.25,armOut:[[90,1.1],[200,1.08],[320,1.06]],
  lines:`<path d="M-9,180 v10 M9,180 v10 M-9,198 v10 M9,198 v10 M-9,216 v8 M9,216 v8" class="ln"/><path d="M0,172 V236" class="ln"/><path d="M-46,104 C-56,112 -58,124 -55,134 M46,104 C56,112 58,124 55,134" class="ln"/><path d="M-30,300 C-28,320 -26,336 -24,350 M30,300 C28,320 26,336 24,350" class="ln"/>`},
 curvy:{w:[[60,1],[104,1.02],[132,1.08],[150,1.18],[172,1.12],[208,1.05],[250,1.2],[272,1.22],[300,1.2],[340,1.15],[392,1.06],[420,1.08],[470,1.05],[500,1]],arm:1.15,armOut:[[90,1.03],[200,1.05],[250,1.12],[320,1.12]],lines:`<path d="M-26,236 C-14,244 14,244 26,236" class="ln" style="stroke-opacity:.18"/>`}
};
const armCenter=y=>lerp([[100,44],[200,57],[300,65],[320,64]],y);
function fig(b){
 const B=builds[b];
 const Rb=R.map(([x,y])=>[x*lerp(B.w,y),y]);
 const Lb=Rb.slice(0,-1).reverse().map(([x,y])=>[-x,y]);
 const body=cr([...Rb,...Lb],true);
 const arm=s=>cr(armR0.map(([x,y])=>{const c=armCenter(y);const nx=(c+(x-c)*B.arm)*lerp(B.armOut,y);return[nx*s,y];}),true);
 const head=`<ellipse cx="0" cy="38" rx="22" ry="29"/>`;
 const hair=`<path d="${cr([[-24,40],[-25,18],[-14,6],[0,3],[14,6],[25,18],[24,40],[26,62],[20,76],[-20,76],[-26,62]],true)}"/>`;
 const fringe=`<path d="${cr([[-22,30],[-20,14],[-8,8],[4,9],[16,13],[22,26],[12,20],[0,19],[-12,22]],true)}"/>`;
 const sh=`${hair}<path d="${body}"/><path d="${arm(1)}"/><path d="${arm(-1)}"/>${head}${fringe}`;
 const bw=lerp(B.w,150);
 const det=`<path d="M-30,100 C-18,106 -8,104 -3,101 M30,100 C18,106 8,104 3,101" class="ln"/>
 <path d="M${-38*bw},150 C${-30*bw},${166+ (bw-1)*20} ${-14*bw},${166+(bw-1)*20} -6,152 M${38*bw},150 C${30*bw},${166+(bw-1)*20} ${14*bw},${166+(bw-1)*20} 6,152" class="ln"/>
 <circle cx="0" cy="214" r="1.6" class="dot"/>
 <path d="M${-30*lerp(B.w,250)},250 C-20,262 -12,270 -6,276 M${30*lerp(B.w,250)},250 C20,262 12,270 6,276" class="ln"/>
 <path d="M-22,388 q4,6 8,0 M22,388 q-4,6 -8,0" class="ln"/>${B.lines}`;
 return `<g class="outline">${sh}</g><g class="fill">${sh}</g>${det}`;}
const W=960,H=700;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'IBM Plex Mono','DejaVu Sans Mono',monospace">
<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20,0 L0,0 0,20" fill="none" stroke="#1c252e"/></pattern>
<linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26323d"/><stop offset="1" stop-color="#1b242c"/></linearGradient></defs>
<style>.outline path,.outline ellipse{fill:none;stroke:#6fa9b5;stroke-width:2.6;stroke-linejoin:round}.fill path,.fill ellipse{fill:url(#skin)}.ln{fill:none;stroke:#6fa9b5;stroke-opacity:.35;stroke-width:1;stroke-linecap:round}.dot{fill:#6fa9b5;fill-opacity:.5}.tag{font-size:11px;letter-spacing:3px;fill:#6fa9b5;text-anchor:middle}.h1{font-size:15px;letter-spacing:3px;fill:#d7e2ea;font-weight:700}</style>
<rect width="${W}" height="${H}" fill="#0f1418"/><rect width="${W}" height="${H}" fill="url(#grid)"/>
<text x="36" y="48" class="h1">BUILD VARIANTS · ANTERIOR</text>
${['slim','athletic','curvy'].map((b,i)=>`<g transform="translate(${180+i*300},90)">${fig(b)}</g><text x="${180+i*300}" y="${640}" class="tag">${b.toUpperCase()}</text>`).join('')}
</svg>`;
fs.writeFileSync('builds.svg',svg);
