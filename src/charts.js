export function chartSVG(points,label,suffix=''){
 const clean=points.map(p=>({...p,value:Number(p.value)})).filter(p=>Number.isFinite(p.value));
 if(!clean.length)return '<p class="empty-state">Complete a set to start this chart.</p>';
 const vals=clean.map(p=>p.value),lo=Math.min(...vals),hi=Math.max(...vals),span=Math.max(hi-lo,1);
 const x=i=>clean.length===1?300:40+i/(clean.length-1)*520;
 const y=v=>174-(v-lo)/span*132;
 const xy=clean.map((p,i)=>x(i)+','+y(p.value)).join(' ');
 return '<svg class="progress-chart" viewBox="0 0 600 220" role="img" aria-label="'+String(label).replace(/[&<>"]/g,'')+' trend"><line x1="40" y1="174" x2="560" y2="174" stroke="currentColor" opacity=".15"/>'+(clean.length>1?'<polyline points="'+xy+'" fill="none" stroke="#247cf5" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>':'')+clean.map((p,i)=>'<circle cx="'+x(i)+'" cy="'+y(p.value)+'" r="5" fill="#247cf5"><title>'+p.date+': '+p.value+suffix+'</title></circle>').join('')+'<text x="40" y="205" fill="currentColor" font-size="12">'+clean[0].date+'</text><text x="560" y="205" text-anchor="end" fill="currentColor" font-size="12">'+clean[clean.length-1].date+'</text></svg>';
}
