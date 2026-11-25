export function chartSVG(points,label,suffix=''){
 if(points.length<2)return '<p class="empty-state">Log at least two entries to see a trend.</p>';
 const vals=points.map(p=>Number(p.value)).filter(Number.isFinite),lo=Math.min(...vals),hi=Math.max(...vals),span=Math.max(hi-lo,1);
 const xy=points.map((p,i)=>(40+i/(points.length-1)*520)+','+(174-(Number(p.value)-lo)/span*132)).join(' ');
 return '<svg class="progress-chart" viewBox="0 0 600 220" role="img" aria-label="'+String(label).replace(/[&<>"]/g,'')+' trend"><line x1="40" y1="174" x2="560" y2="174" stroke="currentColor" opacity=".15"/><polyline points="'+xy+'" fill="none" stroke="#247cf5" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'+points.map((p,i)=>'<circle cx="'+(40+i/(points.length-1)*520)+'" cy="'+(174-(Number(p.value)-lo)/span*132)+'" r="4" fill="#247cf5"><title>'+p.date+': '+p.value+suffix+'</title></circle>').join('')+'<text x="40" y="205" fill="currentColor" font-size="12">'+points[0].date+'</text><text x="560" y="205" text-anchor="end" fill="currentColor" font-size="12">'+points[points.length-1].date+'</text></svg>';
}
