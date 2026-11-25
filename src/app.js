import {openDB,all,get,put,del,replaceAll,STORES as stores} from './db.js';
import {chartSVG} from './charts.js';
let state={page:'home',programme:null,day:null,session:null,exercise:null,metric:'weight',range:'all',progressView:'overview'};
let preferences={units:'kg',theme:'system'};
const weightUnit=()=>preferences.units==='lb'?'lb':'kg', displayWeight=v=>v===''||v==null?'':Number(preferences.units==='lb'?Number(v)*2.2046226218:v).toFixed(1).replace(/\.0$/,''), applyTheme=()=>{const dark=preferences.theme==='dark'||(preferences.theme==='system'&&window.matchMedia?.('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light'};
const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID(), today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}, stamp=()=>new Date().toISOString();
const fileTimestamp=()=>{const d=new Date(),pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'_'+pad(d.getHours())+'-'+pad(d.getMinutes())+'-'+pad(d.getSeconds())};
const aiPlanPrompt=()=>`Create a workout plan that can be imported directly into my Gym Tracker app.

Return ONLY valid JSON. No Markdown fences, explanations, or comments.

Use this exact structure:
{
  "name": "Plan name",
  "phases": [
    {
      "name": "Phase 1 · Weeks 1–8",
      "weeks": "1–8",
      "days": [
        {
          "name": "Workout A",
          "exercises": [
            {"name":"Bench Press","sets":3,"min":8,"max":12,"rir":2,"tracking":"weight_reps"},
            {"name":"Treadmill","sets":1,"tracking":"time","unit":"seconds"}
          ]
        }
      ]
    }
  ]
}

Rules:
- Put distinct training phases in separate entries in the phases array. Put workout days inside the correct phase; do not turn phases into workout days.
- Every workout day must have a name and an exercises array.
- Every exercise must have a name and sets (positive integer).
- For resistance exercises use tracking="weight_reps", min and max rep targets, and rir (0–5).
- For cardio, holds, planks, or other time-based exercises use tracking="time" and unit="seconds" or "minutes". Do not invent a weight or rep range for timed exercises.
- Use realistic, unambiguous exercise names and targets. Preserve the supplied programme's actual split, phase order, exercise selection, and progression. Do not add exercises or phases that were not requested.
- Do not include commentary or extra properties. The app will create its own internal IDs when importing.`;
const main=$('#main'), modal=$('#modal');
function toast(s){const n=$('#toast');n.textContent=s;n.classList.add('is-visible');setTimeout(()=>n.classList.remove('is-visible'),2200)}
function btn(action,label,extra=''){const match=extra.match(/class="([^"]*)"/),classes=match?match[1]:'button primary',attrs=extra.replace(/class="[^"]*"/,'');return `<button class="${classes}" data-action="${action}" ${attrs}>${label}</button>`}
function heading(k,t,sub=''){return `<div class="page-heading"><div>${k?`<div class="eyebrow">${k}</div>`:''}<h1>${t}</h1><p>${sub}</p></div></div>`}
function show(html){modal.innerHTML=html;modal.showModal()}
function empty(title,copy,action,label){return '<div class="empty-state"><strong>'+esc(title)+'</strong><p>'+esc(copy)+'</p>'+(action?btn(action,label||'Get started'):'')+'</div>'}
async function active(){const ps=await all('programmes');return ps.find(p=>p.active)||ps[0]}
async function render(){
 document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('is-active',b.dataset.nav===(state.page==='body'?'progress':state.page==='plan'?'programmes':state.page)));
 try{
 if(state.page==='home')await home();
 if(state.page==='programmes')await plans();
 if(state.page==='plan')await plan();
 if(state.page==='dayDetail')await dayDetail();
 if(state.page==='workout')await workout();
 if(state.page==='progress')await progress();
 if(state.page==='body')await bodyProgress();
 if(state.page==='history')await history();
 if(state.page==='settings')settings();
 if(state.page==='export')exportDataPage();
 }catch(e){console.error(e);main.innerHTML=`<p class="empty-state">${esc(e.message)}</p>`}
}
async function plans(){
 const ps=await all('programmes');
 main.innerHTML=heading('PLAN LIBRARY','Your programmes','Keep different training plans separate.')+
 '<div class="toolbar-row">'+btn('new-plan','+ New programme')+btn('import-plan','Import JSON')+btn('copy-ai-prompt','Copy AI prompt','class="button secondary"')+'</div>'+
 '<div class="programme-grid">'+(ps.length?ps.map(p=>'<article class="programme-card"><span class="pill '+(p.active?'pill-active':'')+'">'+(p.active?'ACTIVE':'INACTIVE')+'</span><h2>'+esc(p.name)+'</h2><div class="toolbar-row">'+btn('view-plan','View','data-id="'+p.id+'"')+(p.active?'<button class="button secondary" disabled>Active</button>':btn('activate','Set active','data-id="'+p.id+'"'))+'<button class="button danger" data-action="delete-programme" data-id="'+p.id+'">Remove</button></div></article>').join(''):empty('No programmes yet','Import a JSON workout plan or create a programme.'))+'</div>';
}
async function workout(){
 const session=await get('sessions',state.session),rows=(await all('sets')).filter(x=>x.session===session?.id);
 if(!session){state.page='home';return home()}
 const grouped=[...new Set(rows.map(r=>r.exercise))],doneSessions=(await all('sessions')).filter(x=>x.status==='done').sort((a,b)=>b.started.localeCompare(a.started)),allSets=await all('sets');
 const recorded=rows.filter(x=>x.tracking==='time'?Number(x.duration)>0:(x.weight!==''&&x.reps!==''&&Number(x.reps)>0));
 const volume=recorded.filter(x=>x.tracking!=='time').reduce((n,x)=>n+Number(x.weight)*Number(x.reps),0),rirRows=recorded.filter(x=>x.rir!==null&&x.rir!=='');
 main.innerHTML='<div class="workout-topline"><button class="back-link" data-action="home">← Exit</button><span class="save-status" id="saveStatus">● Saved</span></div>'+heading('WORKOUT IN PROGRESS',esc(session.day),'Started '+session.date)+grouped.map(id=>{
  const ex=rows.filter(r=>r.exercise===id).sort((a,b)=>(a.order??0)-(b.order??0)),sample=ex[0],timed=sample.tracking==='time';
  const priorSession=doneSessions.find(ps=>allSets.some(x=>x.session===ps.id&&x.exercise===id&&x.status==='done')),prior=priorSession?allSets.filter(x=>x.session===priorSession.id&&x.exercise===id&&x.status==='done').sort((a,b)=>(a.order??0)-(b.order??0)):[];
  const target=Number(sample.targetSets||ex.length),top=prior.length>=target&&prior.slice(0,target).every(x=>Number(x.reps)>=Number(sample.repMax||12)),rirOk=prior.length>=target&&prior.slice(0,target).every(x=>x.rir!==null&&x.rir!==''&&Number(x.rir)>=Number(sample.rirTarget??2));
  const suggest=!timed&&top&&rirOk?'<p class="micro-hint">Consider increasing to '+displayWeight(Math.max(...prior.map(x=>Number(x.weight)||0))+2.5)+' '+weightUnit()+' next time.</p>':(prior.length?'<p class="micro-hint">Previous performance is shown as a suggestion only. Enter today’s results to record them.</p>':'');
  return '<section class="workout-exercise-card"><h2>'+esc(sample.name)+'</h2>'+suggest+'<div class="set-table-heading"><span>SET</span><span>'+(timed?'TIME (SEC)':weightUnit().toUpperCase())+'</span><span>'+(timed?'DISTANCE':'REPS')+'</span><span>RIR</span><span></span></div>'+
  ex.map((r,n)=>'<div class="set-row"><span>'+(n+1)+'</span>'+
  (timed?'<input type="number" min="0" step="1" placeholder="'+(r.suggestDuration?'prev '+r.suggestDuration+' sec':'sec')+'" value="'+(r.duration??'')+'" data-field="duration" data-id="'+r.id+'"><input type="number" min="0" step=".1" placeholder="'+(r.suggestDistance?'prev '+r.suggestDistance+' km':'km')+'" value="'+(r.distance??'')+'" data-field="distance" data-id="'+r.id+'">':
  '<input type="number" min="0" step=".5" placeholder="'+(r.suggestWeight?'prev '+displayWeight(r.suggestWeight):weightUnit())+'" value="'+displayWeight(r.weight)+'" data-field="weight" data-id="'+r.id+'"><input type="number" min="0" placeholder="'+(r.suggestReps?'prev '+r.suggestReps:'reps')+'" value="'+(r.reps??'')+'" data-field="reps" data-id="'+r.id+'">')+
  '<select data-field="rir" data-id="'+r.id+'"><option value="">—</option>'+[0,1,2,3,4,5].map(n=>'<option '+(r.rir===n?'selected':'')+' value="'+n+'">'+n+(n===5?'+':'')+'</option>').join('')+'</select><button class="mini-action danger-text" title="Delete set" aria-label="Delete set" data-action="delete-set" data-id="'+r.id+'">×</button></div>').join('')+
  btn('add-set','+ Add set','data-id="'+id+'"')+'</section>';
 }).join('')+'<section class="settings-card session-summary"><strong>Session summary</strong><p>'+recorded.length+' sets recorded · '+displayWeight(volume)+' '+weightUnit() volume · Avg RIR '+(rirRows.length?(rirRows.reduce((n,x)=>n+Number(x.rir),0)/rirRows.length).toFixed(1):'—')+'</p><label class="form-label session-notes">Workout notes<textarea id="sessionNotes" placeholder="How did the workout feel? Any notes for next time?">'+esc(session.notes||'')+'</textarea></label></section><div class="finish-workout-area">'+btn('finish','Finish workout')+'</div>';
}
async function progressDetail(){
 const sessions=(await all('sessions')).filter(x=>x.status==='done').sort((a,b)=>a.date.localeCompare(b.date)),sets=await all('sets'),by={};
 for(const session of sessions){for(const x of sets.filter(y=>y.session===session.id&&y.status==='done'&&((y.weight!==''&&y.reps>0)||Number(y.duration)>0))){(by[x.exercise]??={name:x.name,rows:[]}).rows.push({...x,date:session.date})}}
 const entries=Object.entries(by).sort((a,b)=>a[1].name.localeCompare(b[1].name));
 if(!state.exercise||!by[state.exercise])state.exercise=entries[0]?.[0]||null;
 const ex=by[state.exercise],range=state.range||'all',cut=range==='all'?'0000-00-00':new Date(Date.now()-Number(range)*86400000).toISOString().slice(0,10);
 const rows=(ex?.rows||[]).filter(x=>x.date>=cut),metric=state.metric||'weight';
 const timed=ex?.rows?.some(x=>Number(x.duration)>0),value=x=>timed?(metric==='distance'?Number(x.distance):Number(x.duration)):metric==='reps'?Number(x.reps):metric==='volume'?Number(x.weight)*Number(x.reps)*(preferences.units==='lb'?2.2046226218:1):metric==='rir'?Number(x.rir):Number(preferences.units==='lb'?Number(x.weight)*2.2046226218:Number(x.weight));
 const label=timed?(metric==='distance'?'Distance':'Duration'):metric==='reps'?'Reps':metric==='volume'?'Set volume':metric==='rir'?'RIR':'Top weight',unit=timed?(metric==='distance'?' km':' sec'):metric==='reps'?' reps':metric==='rir'?' RIR':metric==='volume'?' '+weightUnit()+'·reps':' '+weightUnit();
 const grouped={};for(const x of rows){const n=Number(value(x));if(Number.isFinite(n))grouped[x.date]=metric==='rir'?(grouped[x.date]===undefined?n:Math.min(grouped[x.date],n)):Math.max(grouped[x.date]||0,n)}
 const points=Object.entries(grouped).map(([date,value])=>({date,value}));
 const best=(ex?.rows||[]).reduce((m,x)=>metric==='rir'?Math.min(m,value(x)):Math.max(m,value(x)),metric==='rir'?Infinity:0),last=rows[rows.length-1],average=rows.length?rows.reduce((n,x)=>n+value(x),0)/rows.length:null;
 main.innerHTML='<div class="workout-topline"><button class="back-link" data-action="progress-overview">← Progress overview</button></div>'+heading('TRAINING ANALYTICS','Progress that you can measure.','Select an exercise first; its charts and history appear below.')+
 '<section class="analytics-panel"><div class="form-grid analytics-controls"><label class="form-label">Exercise<select id="progressExercise">'+entries.map(([id,x])=>'<option value="'+esc(id)+'" '+(id===state.exercise?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label><label class="form-label">Date range<select id="progressRange"><option value="all" '+(range==='all'?'selected':'')+'>All time</option><option value="30" '+(range==='30'?'selected':'')+'>30 days</option><option value="90" '+(range==='90'?'selected':'')+'>90 days</option><option value="180" '+(range==='180'?'selected':'')+'>6 months</option></select></label></div>'+
 (entries.length?'<div class="segmented-control">'+(timed?[['weight','Duration'],['distance','Distance']]:[['weight','Weight'],['reps','Reps'],['volume','Volume'],['rir','RIR']]).map(([v,t])=>'<button type="button" data-action="metric" data-value="'+v+'" class="'+(metric===v?'selected':'')+'">'+t+'</button>').join('')+'</div>'+
 '<div class="stat-grid"><div class="stat-card"><span>BEST '+label.toUpperCase()+'</span><strong>' +(Number.isFinite(best)?best.toFixed(1):'—')+unit+'</strong></div><div class="stat-card"><span>LATEST</span><strong>'+(last?value(last).toFixed(1)+unit:'—')+'</strong></div><div class="stat-card"><span>AVERAGE</span><strong>'+(average===null?'—':average.toFixed(1)+unit)+'</strong></div><div class="stat-card"><span>SETS IN RANGE</span><strong>'+rows.length+'</strong></div></div>'+
 '<section class="chart-panel"><h2>'+label+' over time</h2>'+chartSVG(points,label,unit)+'</section><section class="history-list"><h2>Set history</h2>'+rows.slice().reverse().map(x=>'<article class="history-session-card"><div><span class="eyebrow">'+esc(x.date)+'</span><strong>'+esc(x.name)+'</strong><p>'+(Number(x.duration)>0?x.duration+' sec':displayWeight(x.weight)+' '+weightUnit()+' × '+x.reps)+' · RIR '+(x.rir??'—')+'</p></div></article>').join('')+'</section>':'<p class="empty-state">Complete a workout to see exercise progress.</p>')+'</section>'+
 '<div class="toolbar-row"><button class="button primary" data-action="measurement">＋ Add body measurement</button><button class="button secondary" data-action="body">Body trends</button></div>';
}
async function history(){
 const ss=(await all('sessions')).sort((a,b)=>b.started.localeCompare(a.started)),sets=await all('sets'),programmes=await all('programmes'),selected=state.historyProgramme||'all',status=state.historyStatus||'all',dayFilter=state.historyDay||'all',exerciseFilter=state.historyExercise||'all',from=state.historyFrom||'',to=state.historyTo||'',exerciseNames=[...new Set(sets.map(x=>x.name).filter(Boolean))].sort();
 const filtered=ss.filter(x=>{const rows=sets.filter(y=>y.session===x.id);return(selected==='all'||x.programme===selected)&&(status==='all'||x.status===status)&&(dayFilter==='all'||x.day===dayFilter)&&(exerciseFilter==='all'||rows.some(y=>y.name===exerciseFilter))&&(!from||x.date>=from)&&(!to||x.date<=to)});
 main.innerHTML=heading('HISTORY','Your training log','Review sessions and revisit every recorded set')+
 '<div class="filter-row"><select id="historyProgramme"><option value="all">All programmes</option>'+programmes.map(p=>'<option value="'+p.id+'" '+(selected===p.id?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select><select id="historyStatus"><option value="all">All sessions</option><option value="done" '+(status==='done'?'selected':'')+'>Completed</option><option value="active" '+(status==='active'?'selected':'')+'>In progress</option></select><select id="historyDay"><option value="all">All workout days</option>'+[...new Set(ss.map(x=>x.day))].sort().map(d=>'<option value="'+esc(d)+'" '+(dayFilter===d?'selected':'')+'>'+esc(d)+'</option>').join('')+'</select><select id="historyExercise"><option value="all">All exercises</option>'+exerciseNames.map(n=>'<option value="'+esc(n)+'" '+(exerciseFilter===n?'selected':'')+'>'+esc(n)+'</option>').join('')+'</select><label class="form-label">From<input id="historyFrom" type="date" value="'+esc(from)+'"></label><label class="form-label">To<input id="historyTo" type="date" value="'+esc(to)+'"></label></div>'+
 (filtered.length?'<div class="history-list">'+filtered.map(x=>{const rows=sets.filter(y=>y.session===x.id),logged=x.status==='active'?rows.filter(y=>Number(y.duration)>0||(y.weight!==''&&y.weight!==null&&Number(y.reps)>0)):rows.filter(y=>y.status==='done');return '<article class="history-session-card"><div><span class="eyebrow">'+esc(x.date)+' · '+(x.status==='done'?'COMPLETED':'IN PROGRESS')+'</span><h3>'+esc(x.day)+'</h3><p>'+esc(programmes.find(p=>p.id===x.programme)?.name||'Programme deleted')+' · '+logged.length+' sets recorded · '+new Set(rows.map(y=>y.exercise)).size+' exercises</p></div><div class="inline-actions">'+(x.status==='active'?btn('resume','Resume','data-id="'+x.id+'"'):'')+'<button class="mini-action" data-action="session-detail" data-id="'+x.id+'">›</button></div></article>'}).join('')+'</div>':empty('No sessions found','Change the filters or finish a workout.'));
}
function form(title,fields,action){show(`<form class="modal-content" data-form="${action}"><div class="modal-head"><h2>${title}</h2><button type="button" data-action="close-modal">×</button></div>${fields}<div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button primary">Save</button></div></form>`)}
function field(label,name,placeholder='',type='text',value='',required=true){return `<label class="form-label">${label}<input name="${name}" type="${type}" value="${esc(value)}" placeholder="${placeholder}" ${required?'required':''}></label>`}
async function click(e){const b=e.target.closest('[data-action],[data-nav]');if(!b)return;if(b.matches('.brand'))e.preventDefault();if(b.dataset.nav){state.page=b.dataset.nav;return render()}const a=b.dataset.action,id=b.dataset.id;try{
 if(a==='clear-all-data'){show('<div class="modal-content"><div class="modal-head"><h2>Clear all data?</h2></div><p>This permanently deletes all programmes, sessions, sets, measurements and preferences on this device. Export a backup first if needed.</p><div class="modal-actions"><button class="button secondary" data-action="close-modal">Cancel</button><button class="button danger" data-action="confirm-clear-all">Clear all data</button></div></div>');return}
 else if(a==='confirm-clear-all'){await replaceAll(Object.fromEntries(stores.map(name=>[name,[]])));preferences={units:'kg',theme:'system'};applyTheme();modal.close();state={page:'home',programme:null,day:null,session:null,exercise:null,metric:'weight',range:'all',progressView:'overview'};toast('All local data cleared')}
 else if(a==='delete-programme'){const pid=id||state.programme,p=await get('programmes',pid);if(!p)return;if(!confirm('Remove "'+p.name+'" and permanently delete its workout days, sessions and set history? This cannot be undone.'))return;const sessions=(await all('sessions')).filter(s=>s.programme===pid),sessionIds=new Set(sessions.map(s=>s.id));for(const row of await all('sets'))if(sessionIds.has(row.session))await del('sets',row.id);for(const s of sessions)await del('sessions',s.id);for(const d of await all('days'))if(d.programme===pid)await del('days',d.id);await del('programmes',pid);const remaining=await all('programmes');if(!remaining.some(x=>x.active)&&remaining[0])await put('programmes',{...remaining[0],active:true});state.programme=null;state.page='programmes';state.programmeTab='days';toast('Programme removed')}
 if(a==='home'){state.page='home';state.progressView='overview'}
 else if(a==='history'){state.page='history'}
 else if(a==='progress'){state.page='progress';state.progressView='overview'}
 else if(a==='open-settings'){state.page='settings'}
 else if(a==='export-data'){state.page='export'}
 else if(a==='export-now'){const data={format:'workout-tracker-selected-export',version:1,exportedAt:stamp(),data:{}};for(const [id,names] of [['programmes',['programmes','days']],['sessions',['sessions','sets']],['measurements',['measurements']],['settings',['settings']]]){if($('#export-'+id)?.checked)for(const n of names)data.data[n]=await all(n)}download(data,'Gym-Tracker-Export-'+fileTimestamp()+'.json');toast('Export created')}
 else if(a==='body-progress'||a==='body'){state.page='body'}
 else if(a==='progress-overview'){state.progressView='overview';state.page='progress'}
 else if(a==='progress-overview'){state.progressView='overview';state.page='progress'}
 else if(a==='progress-exercises'){state.progressView='list';state.page='progress'}
 else if(a==='exercise-detail'){state.exercise=id;state.progressView='detail';state.page='progress'}
 else if(a==='body-metric'){state.bodyMetric=b.dataset.value;state.page='body'}
  else if(a==='metric'){state.metric=b.dataset.value}
 else if(a==='programme-tab'){state.programmeTab=b.dataset.value}
 else if(a==='progress-exercises'){state.progressView='list';state.page='progress'}
 else if(a==='exercise-detail'){state.exercise=id;state.progressView='detail';state.page='progress'}
 else if(a==='body-metric'){state.bodyMetric=b.dataset.value;state.page='body'}
 else if(a==='exercise-library'){state.libraryDay=id;await exerciseLibrary();return}
 else if(a==='choose-library-exercise'){const d=await get('days',state.libraryDay);d.exercises=d.exercises||[];const name=$('#libraryChoice').value;d.exercises.push({id:uid(),name,sets:3,min:8,max:12,rir:2,tracking:'weight_reps'});await put('days',d);modal.close();toast('Exercise added');state.page='plan'}
 else if(a==='custom-exercise'){modal.close();state.day=state.libraryDay;form('Create exercise',field('Exercise name','name','Exercise name')+field('Sets','sets','3','number')+'<div id="repTargets">'+field('Rep minimum','min','8','number')+field('Rep maximum','max','12','number')+'</div>'+field('Target RIR','rir','2','number',2,false)+'<label class="form-label">Tracking type<select name="tracking" id="trackingType"><option value="weight_reps">Weight and reps</option><option value="time">Time / cardio</option></select></label>','add-exercise')}
 else if(a==='measurement'){const prev=(await all('measurements')).sort((x,y)=>x.date.localeCompare(y.date)).at(-1)||{};show('<form class="modal-content" data-form="measurement"><div class="modal-head"><h2>Body measurements</h2><button type="button" data-action="close-modal">×</button></div>'+field('Date','date','','date',today())+field('Body weight ('+weightUnit()+')','weight','', 'number',displayWeight(prev.weight),false)+field('Waist (cm)','waist','','number',prev.waist??'',false)+field('Chest (cm)','chest','','number',prev.chest??'',false)+field('Upper arm (cm)','upperArm','','number',prev.upperArm??'',false)+field('Forearm (cm)','forearm','','number',prev.forearm??'',false)+field('Thigh (cm)','thigh','','number',prev.thigh??'',false)+field('Hips (cm)','hips','','number',prev.hips??'',false)+'<p class="micro-hint">Previous values are prefilled. Change only the measurements you are updating.</p><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button primary">Save</button></div></form>')}
 else if(a==='new-plan')form('New programme',field('Name','name','e.g. Upper / Lower'),'new-plan');
 else if(a==='open-plan'){state.page='plan';state.programme=id||state.programme;await render()}
 else if(a==='view-plan'){state.programme=id;state.page='plan';await render()}
 else if(a==='day-detail'){state.day=id;state.page='dayDetail'}
 else if(a==='programmes'){state.page='programmes';await render()}
 else if(a==='open-plan'||a==='open-programme'){state.page='plan';await render()}
 else if(a==='add-day')form('Add workout day',field('Day name','name','e.g. Upper body')+field('Training phase','phase','e.g. Phase 1 · Weeks 1–8','text','Workouts',false)+field('Phase weeks','phaseWeeks','e.g. 1–8','text','',false),'add-day');
  else if(a==='edit-day'){const d=await get('days',id);state.day=id;form('Edit workout day',field('Day name','name','', 'text',d.name)+field('Training phase','phase','e.g. Phase 1 · Weeks 1–8','text',d.phase||'Workouts',false)+field('Phase weeks','phaseWeeks','e.g. 1–8','text',d.phaseWeeks||'',false),'edit-day')}
  else if(a==='delete-day'){if(!confirm('Delete this workout day? Past workout records are retained.'))return;await del('days',id)}
  else if(a==='move-day-up'||a==='move-day-down'){const ds=(await all('days')).filter(d=>d.programme===state.programme).sort((x,y)=>x.order-y.order),i=ds.findIndex(d=>d.id===id),j=i+(a==='move-day-up'?-1:1);if(j>=0&&j<ds.length){[ds[i],ds[j]]=[ds[j],ds[i]];for(let k=0;k<ds.length;k++){ds[k].order=k;await put('days',ds[k])}}}
  else if(a==='move-ex-up'||a==='move-ex-down'){const d=await get('days',b.dataset.day),i=d.exercises.findIndex(x=>x.id===id),j=i+(a==='move-ex-up'?-1:1);if(j>=0&&j<d.exercises.length){[d.exercises[i],d.exercises[j]]=[d.exercises[j],d.exercises[i]];await put('days',d)}}

 else if(a==='add-exercise'){state.day=id;form('Add exercise',field('Exercise name','name','e.g. Chest press')+field('Sets','sets','3','number')+'<div id="repTargets">'+field('Rep minimum','min','8','number')+field('Rep maximum','max','12','number')+'</div>'+field('Target RIR','rir','2','number',2,false)+'<label class="form-label">Tracking type<select name="tracking" id="trackingType"><option value="weight_reps">Weight and reps</option><option value="time">Time / cardio</option></select></label>','add-exercise')}
 else if(a==='edit-exercise'){const ex=(await all('days')).flatMap(d=>d.exercises).find(x=>x.id===id);if(ex){state.edit=id;form('Edit exercise',field('Name','name','', 'text',ex.name)+field('Sets','sets','', 'number',ex.sets)+'<div id="repTargets">'+field('Rep minimum','min','', 'number',ex.min,ex.tracking!=='time')+field('Rep maximum','max','', 'number',ex.max,ex.tracking!=='time')+'</div>'+field('Target RIR','rir','', 'number',ex.rir,false)+'<label class="form-label">Tracking type<select name="tracking" id="trackingType"><option value="weight_reps" '+((ex.tracking||'weight_reps')==='weight_reps'?'selected':'')+'>Weight and reps</option><option value="time" '+(ex.tracking==='time'?'selected':'')+'>Time / cardio</option></select></label>','edit-exercise')}}
 else if(a==='remove-exercise'){for(const d of await all('days')){d.exercises=d.exercises.filter(x=>x.id!==id);await put('days',d)}toast('Exercise removed')}
 else if(a==='rename-plan'){const p=await get('programmes',state.programme);form('Rename programme',field('Name','name','', 'text',p.name),'rename-plan')}
 else if(a==='activate'){const current=await active();if(current?.id===id){toast('This programme is already active');return}for(const p of await all('programmes'))await put('programmes',{...p,active:p.id===id});toast('Active programme changed')}
 else if(a==='start-day'||a==='resume'){const s=a==='resume'?await get('sessions',id):null;if(s)state.session=s.id;else{const d=await get('days',id),p=await get('programmes',d.programme);const session={id:uid(),programme:p.id,day:d.name,date:today(),started:stamp(),status:'active'};await put('sessions',session);state.session=session.id;for(const ex of d.exercises){const prev=(await all('sets')).filter(x=>x.exercise===ex.id&&x.status==='done').sort((x,y)=>y.date.localeCompare(x.date));for(let i=0;i<ex.sets;i++){const prior=prev[i]||prev[0]||null;await put('sets',{id:uid(),session:session.id,exercise:ex.id,name:ex.name,order:i,tracking:ex.tracking||'weight_reps',weight:'',reps:'',duration:'',distance:'',rir:null,suggestWeight:prior?.weight??'',suggestReps:prior?.reps??'',suggestDuration:prior?.duration??'',suggestDistance:prior?.distance??'',suggestRir:prior?.rir??null,status:'active',targetSets:ex.sets,repMin:ex.min,repMax:ex.max,rirTarget:ex.rir})}}}state.page='workout'}
 else if(a==='add-set'){const rows=(await all('sets')).filter(x=>x.exercise===id&&x.session===state.session),sample=rows[0];if(!sample)throw Error('No exercise set found');await put('sets',{...sample,id:uid(),order:Math.max(...rows.map(x=>Number(x.order)||0))+1,weight:'',reps:'',duration:'',distance:'',rir:null,status:'active'})}
 else if(a==='delete-set'){const row=await get('sets',id);if(!row||row.session!==state.session)return;state.pendingDeleteSet=id;show('<div class="modal-content"><div class="modal-head"><h2>Delete set?</h2></div><p>Remove this set from the active workout?</p><div class="modal-actions"><button class="button secondary" data-action="close-modal">Cancel</button><button class="button danger" data-action="confirm-delete-set">Delete set</button></div></div>');return}
 else if(a==='confirm-delete-set'){const row=await get('sets',state.pendingDeleteSet);if(row?.session===state.session)await del('sets',row.id);modal.close();toast('Set removed')}
 else if(a==='finish'){await saveQueue;const notes=$('#sessionNotes');if(notes){const session=await get('sessions',state.session);if(session){session.notes=notes.value;await put('sessions',session)}}const rows=(await all('sets')).filter(x=>x.session===state.session),recorded=rows.filter(x=>x.tracking==='time'?Number(x.duration)>0:(x.weight!==''&&x.weight!==null&&x.reps!==''&&Number(x.reps)>0));if(!recorded.length){toast('Record at least one complete set first');return}if(recorded.some(x=>x.tracking!=='time'&&(x.rir===null||x.rir===''))){toast('RIR is required for every recorded strength set');return}if(rows.some(x=>x.tracking==='time'?!(Number(x.duration)>0):x.weight===''||x.weight==null||x.reps===''||x.reps==null)){show('<div class="modal-content"><div class="modal-head"><h2>Finish with incomplete sets?</h2></div><p>Incomplete sets will remain unrecorded and will not count in your progress.</p><div class="modal-actions"><button class="button secondary" data-action="close-modal">Keep working</button><button class="button primary" data-action="confirm-finish">Finish workout</button></div></div>');return}const session=await get('sessions',state.session);session.status='done';session.ended=stamp();await put('sessions',session);for(const row of rows){const valid=row.tracking==='time'?Number(row.duration)>0:(row.weight!==''&&row.weight!==null&&row.reps!==''&&row.reps!==null&&Number(row.reps)>0&&row.rir!==''&&row.rir!==null);row.status=valid?'done':'active';if(valid)row.date=session.date;await put('sets',row)}state.page='history';toast('Workout saved')}
 else if(a==='confirm-finish'){modal.close();const rows=(await all('sets')).filter(x=>x.session===state.session),session=await get('sessions',state.session);session.status='done';session.ended=stamp();await put('sessions',session);for(const row of rows){const valid=row.tracking==='time'?Number(row.duration)>0:(row.weight!==''&&row.weight!==null&&row.reps!==''&&row.reps!==null&&Number(row.reps)>0&&row.rir!==''&&row.rir!==null);row.status=valid?'done':'active';if(valid)row.date=session.date;await put('sets',row)}state.page='history';toast('Workout saved');await render();return}
 else if(a==='session-detail'){const session=await get('sessions',id),programme=await get('programmes',session?.programme),rows=(await all('sets')).filter(x=>x.session===id).sort((x,y)=>(x.name||'').localeCompare(y.name||'')||(x.order??0)-(y.order??0)),completed=rows.filter(x=>x.status==='done'),volume=completed.filter(x=>x.tracking!=='time').reduce((n,x)=>n+Number(x.weight||0)*Number(x.reps||0),0),rirRows=completed.filter(x=>x.rir!==null&&x.rir!==''),avgRir=rirRows.length?(rirRows.reduce((n,x)=>n+Number(x.rir),0)/rirRows.length).toFixed(1):'—';show('<div class="modal-content"><div class="modal-head"><h2>'+esc(session.day)+'</h2><button type="button" data-action="close-modal">×</button></div><p class="muted">'+esc(session.date)+' · '+(session.status==='done'?'Completed':'In progress')+' · '+esc(programme?.name||'Programme deleted')+'</p><p>'+completed.length+' sets · '+displayWeight(volume)+' '+weightUnit() volume · Average RIR '+avgRir+'</p>'+(session.notes?'<p><strong>Notes:</strong> '+esc(session.notes)+'</p>':'')+rows.map(x=>'<div class="detail-set-row"><strong>'+esc(x.name)+'</strong><span>'+(Number(x.duration)>0?esc(x.duration)+' sec'+(x.distance?' · '+esc(x.distance)+' km':''):x.weight!==''&&x.reps!==''?displayWeight(x.weight)+' '+weightUnit()+' × '+esc(x.reps)+' · RIR '+(x.rir??'—'):'Not recorded')+'</span></div>') .join('')+'</div><div class="modal-actions"><button class="button secondary" data-action="edit-session" data-id="'+id+'">Edit session</button><button class="button danger" data-action="delete-session" data-id="'+id+'">Delete</button></div>');return}
 else if(a==='backup'){const data={format:'workout-tracker-backup',version:1,exportedAt:stamp(),data:Object.fromEntries(await Promise.all(stores.map(async s=>[s,await all(s)])))};download(data,'Gym-Tracker-Backup-'+fileTimestamp()+'.json')}
 else if(a==='import-plan'){const picker=$('#filePicker');if(picker)picker.click()}
 else if(a==='import-backup'){const picker=$('#restore');if(!picker){toast('Import control not found. Reopen Settings and try again.');return}picker.click();return}
 else if(a==='copy-ai-prompt'){const text=aiPlanPrompt();try{await navigator.clipboard.writeText(text);toast('AI prompt copied. Paste it into ChatGPT, Gemini or Claude.')}catch{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.append(ta);ta.select();const ok=document.execCommand('copy');ta.remove();if(!ok)throw Error('Clipboard access was blocked.');toast('AI prompt copied.')}}

 else if(a==='exercise-progress'){const sets=(await all('sets')).filter(x=>x.exercise===id&&x.status==='done');show(`<div class="modal-content"><h2>${esc(sets[0]?.name||'Exercise history')}</h2>${sets.map(x=>`<p>${x.date||''} · ${x.weight} kg × ${x.reps} · RIR ${x.rir??'?'}</p>`).join('')}</div>`);return}
 else if(a==='edit-session'){const session=await get('sessions',id);state.editSession=id;form('Edit session',field('Workout day','day','', 'text',session.day)+field('Date','date','', 'date',session.date),'edit-session');return}
 else if(a==='delete-session'){state.pendingDeleteSession=id;show('<div class="modal-content"><div class="modal-head"><h2>Delete session?</h2></div><p>This will remove the session and its set records from your history.</p><div class="modal-actions"><button class="button secondary" data-action="close-modal">Cancel</button><button class="button primary danger" data-action="confirm-delete-session">Delete</button></div></div>');return}
 else if(a==='confirm-delete-session'){const sid=state.pendingDeleteSession;for(const row of await all('sets'))if(row.session===sid)await del('sets',row.id);await del('sessions',sid);modal.close();toast('Session deleted')}
 else if(a==='close-modal'){modal.close();return}
 await render();
 }catch(err){console.error(err);toast(err.message||'Action failed')}}
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function parsePlan(raw){
 let data;try{data=JSON.parse(raw)}catch{throw Error('The selected file is not valid JSON.')}
 if(!data||(!Array.isArray(data.days)&&!Array.isArray(data.phases)))throw Error('Invalid plan JSON: expected phases or days.');
 if(Array.isArray(data.phases)){const days=[];for(const phase of data.phases){if(!phase.name||!Array.isArray(phase.days))throw Error('Each phase needs a name and a days array.');for(const day of phase.days)days.push({...day,phase:phase.name,phaseWeeks:phase.weeks||''})}return {name:data.name||data.programme?.name||'Imported programme',days}}
 return {name:data.name||data.programme?.name||'Imported programme',days:data.days};
}
async function saveImportedPlan(json){
 if(!json||!Array.isArray(json.days)||!json.days.length)throw Error('Plan must contain at least one workout day');
 const ps=await all('programmes'),p={id:uid(),name:json.name||'Imported programme',active:ps.length===0};await put('programmes',p);
 for(let i=0;i<json.days.length;i++){const day=json.days[i];if(!day.name)throw Error('Every workout day needs a name');
 const exercises=(day.exercises||[]).map(e=>{const timed=e.tracking==='time'||e.mode==='time'||e.type==='cardio',min=Number(e.min??e.repMin??8),max=Number(e.max??e.repMax??12),sets=Number(e.sets||3),rir=Number(e.rir??e.rirTarget??2);if(!e.name||sets<1||(!timed&&(min<1||max<min))||rir<0||rir>5)throw Error('Invalid exercise prescription in '+day.name);return {id:uid(),name:String(e.name),sets,min,max,rir,tracking:timed?'time':'weight_reps',unit:timed?(e.unit||'seconds'):'kg'}});
 await put('days',{id:uid(),programme:p.id,name:String(day.name),phase:day.phase||((String(day.name).match(/^(Phase\s*[^·]+)/i)||[])[1])||'Workouts',phaseWeeks:day.phaseWeeks||'',order:i,exercises})}
 state.programme=p.id;
}
async function submit(e){const f=e.target.closest('form[data-form]');if(!f)return;e.preventDefault();const v=Object.fromEntries(new FormData(f));const a=f.dataset.form;try{
 if(a==='measurement'){const row={id:uid(),date:v.date||today(),created:stamp()};for(const k of ['weight','waist','chest','upperArm','forearm','thigh','hips'])row[k]=v[k]===''||v[k]==null?null:(k==='weight'&&preferences.units==='lb'?Number(v[k])/2.2046226218:Number(v[k]));if(!['weight','waist','chest','upperArm','forearm','thigh','hips'].some(k=>row[k]!==null))throw Error('Enter at least one measurement');await put('measurements',row);state.page='body'}
 if(a==='new-plan'){const p={id:uid(),name:v.name,active:(await all('programmes')).length===0};await put('programmes',p);state.programme=p.id;state.page='plan'}
 if(a==='add-day'){const days=(await all('days')).filter(d=>d.programme===state.programme);await put('days',{id:uid(),programme:state.programme,name:v.name,phase:v.phase||'Workouts',phaseWeeks:v.phaseWeeks||'',order:days.length,exercises:[]})}
  if(a==='edit-day'){const d=await get('days',state.day);d.name=v.name;d.phase=v.phase||'Workouts';d.phaseWeeks=v.phaseWeeks||'';await put('days',d)}
 if(a==='add-exercise'){const d=await get('days',state.day),timed=v.tracking==='time',sets=Number(v.sets),min=timed?null:Number(v.min),max=timed?null:Number(v.max);if(!Number.isInteger(sets)||sets<1||(!timed&&(!Number.isFinite(min)||!Number.isFinite(max)||min<1||max<min)))throw Error('Enter valid set and rep targets.');d.exercises=d.exercises||[];d.exercises.push({id:uid(),name:v.name,sets,min,max,rir:v.rir===''?null:Number(v.rir),tracking:timed?'time':'weight_reps'});await put('days',d)}
 if(a==='edit-exercise'){for(const d of await all('days')){const ex=d.exercises.find(x=>x.id===state.edit);if(ex){const timed=v.tracking==='time',sets=Number(v.sets),min=timed?null:Number(v.min),max=timed?null:Number(v.max);if(!Number.isInteger(sets)||sets<1||(!timed&&(!Number.isFinite(min)||!Number.isFinite(max)||min<1||max<min)))throw Error('Enter valid set and rep targets.');Object.assign(ex,{name:v.name,sets,min,max,rir:v.rir===''?null:Number(v.rir),tracking:timed?'time':'weight_reps'});await put('days',d)}}}
 if(a==='rename-plan'){const p=await get('programmes',state.programme);p.name=v.name;await put('programmes',p)}
 if(a==='edit-session'){const session=await get('sessions',state.editSession);session.day=v.day;session.date=v.date;await put('sessions',session);for(const row of await all('sets'))if(row.session===session.id){row.date=session.date;await put('sets',row)}}

 modal.close();await render();toast('Saved');
 }catch(err){toast(err.message)}}
document.addEventListener('click',click);document.addEventListener('submit',submit);
let saveQueue=Promise.resolve();
async function updateWorkoutSummary(){if(!state.session)return;const rows=(await all('sets')).filter(x=>x.session===state.session),recorded=rows.filter(x=>x.tracking==='time'?Number(x.duration)>0:(x.weight!==''&&x.weight!==null&&x.reps!==''&&x.reps!==null&&Number(x.reps)>0)),volume=recorded.filter(x=>x.tracking!=='time').reduce((n,x)=>n+Number(x.weight||0)*Number(x.reps||0),0),rirRows=recorded.filter(x=>x.rir!==null&&x.rir!==''),avg=rirRows.length?(rirRows.reduce((n,x)=>n+Number(x.rir),0)/rirRows.length).toFixed(1):'—',summary=$('.session-summary p');if(summary)summary.textContent=recorded.length+' sets recorded · '+displayWeight(volume)+' '+weightUnit()+' volume · Avg RIR '+avg}
async function persistWorkoutField(el){const id=el.dataset.id,field=el.dataset.field;if(!id||!field)return;const value=el.value;saveQueue=saveQueue.then(async()=>{const row=await get('sets',id);if(!row)return;const numeric=value===''?null:Number(value);row[field]=field==='weight'&&preferences.units==='lb'&&numeric!==null?numeric/2.2046226218:numeric;row.date=today();await put('sets',row);await updateWorkoutSummary();const status=$('#saveStatus');if(status)status.textContent='● Saved'}).catch(err=>{console.error(err);const status=$('#saveStatus');if(status)status.textContent='● Save failed'})}
document.addEventListener('input',e=>{if(e.target.dataset.field){const status=$('#saveStatus');if(status)status.textContent='● Saving…';persistWorkoutField(e.target)}if(e.target.id==='sessionNotes'){const note=e.target.value,sessionId=state.session;saveQueue=saveQueue.then(async()=>{const row=await get('sessions',sessionId);if(row){row.notes=note;await put('sessions',row)}}).catch(console.error)}});
document.addEventListener('change',e=>{if(e.target.id==='trackingType'){const wrap=$('#repTargets');if(wrap)wrap.querySelectorAll('input').forEach(input=>{input.required=e.target.value!=='time';input.disabled=e.target.value==='time'})}});
function validateRestoreCollections(data,names){
 for(const name of names){
  if(!Array.isArray(data[name]))throw new Error('The "'+name+'" collection is missing or is not an array.');
  const ids=new Set();
  for(let i=0;i<data[name].length;i++){
   const row=data[name][i];
   if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id.trim())throw new Error('Invalid record in "'+name+'" at item '+(i+1)+': every record must have a non-empty ID.');
   if(ids.has(row.id))throw new Error('Duplicate record ID "'+row.id+'" in "'+name+'".');
   ids.add(row.id);
  }
 }
}
document.addEventListener('change',async e=>{
 if(e.target.dataset.field&&e.target.tagName==='SELECT')await persistWorkoutField(e.target);
 if(e.target.id==='progressExercise'){state.exercise=e.target.value;state.progressView='detail';await render()}
 if(e.target.id==='historyProgramme'){state.historyProgramme=e.target.value;await render()}
 if(e.target.id==='historyStatus'){state.historyStatus=e.target.value;await render()}
 if(e.target.id==='progressRange'){state.range=e.target.value;await render()}
 if(e.target.id==='historyDay'){state.historyDay=e.target.value;await render()}
 if(e.target.id==='historyExercise'){state.historyExercise=e.target.value;await render()}
 if(e.target.id==='historyFrom'){state.historyFrom=e.target.value;await render()}
 if(e.target.id==='historyTo'){state.historyTo=e.target.value;await render()}
 if(e.target.id==='unitPreference'||e.target.id==='themePreference'){preferences[e.target.id==='unitPreference'?'units':'theme']=e.target.value;await put('settings',{id:'preferences',...preferences});applyTheme();await render()}
 if(e.target.id==='restore'){
  const input=e.target,file=input.files?.[0];
  if(!file)return;
  try{
   let data;
   try{data=JSON.parse(await file.text())}catch{throw new Error('This file is not valid JSON. Select a Gym Tracker backup/export JSON file.')}
   if(!data||data.version!==1||!data.data||typeof data.data!=='object'||Array.isArray(data.data))throw new Error('Unsupported backup structure. Expected a version 1 Gym Tracker export with a data object.');
   let restoreData,selected=false;
   if(data.format==='workout-tracker-backup'){
    validateRestoreCollections(data.data,stores);
    restoreData=data.data;
   }else if(data.format==='workout-tracker-selected-export'){
    const allowed=['programmes','days','sessions','sets','measurements','settings'];
    const keys=Object.keys(data.data);
    if(!keys.length||keys.some(k=>!allowed.includes(k)))throw new Error('The selected export contains an unknown or empty data category.');
    validateRestoreCollections(data.data,keys);
    const current=Object.fromEntries(await Promise.all(stores.map(async name=>[name,await all(name)])));
    restoreData={...current,...data.data};
    validateRestoreCollections(restoreData,stores);
    selected=true;
   }else throw new Error('Unsupported export format: '+String(data.format||'missing format')+'. Use Import data for a Gym Tracker backup/export, not Import plan.');
   const message=selected?'Import the selected categories from this file? Only categories present in the export will be replaced; all other local data will be kept.':'Restore this full backup? It will replace all local workout data on this device.';
   if(!confirm(message))return;
   await replaceAll(restoreData);
   state.programme=null;state.session=null;state.exercise=null;state.page='home';
   await render();
   toast(selected?'Selected data imported successfully':'Full backup restored successfully');
  }catch(err){
   console.error('Gym Tracker restore failed:',err);
   show('<div class="modal-content"><div class="modal-head"><h2>Import failed</h2><button type="button" data-action="close-modal">×</button></div><p>'+esc(err.message||'An unexpected error occurred while restoring the backup.')+'</p><p class="micro-hint">Your existing data has not been intentionally cleared. Do not delete browser data or uninstall the app. You can try again after checking the selected file.</p><div class="modal-actions"><button type="button" class="button primary" data-action="close-modal">Close</button></div></div>');
  }finally{input.value=''}
 }
});

async function init(){await openDB();const savedPreferences=await get('settings','preferences');if(savedPreferences)preferences={units:savedPreferences.units||'kg',theme:savedPreferences.theme||'system'};applyTheme();try{await navigator.storage?.persist?.()}catch(e){}if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(console.warn);const picker=document.createElement('input');picker.id='filePicker';picker.type='file';picker.accept='.json,application/json';picker.hidden=true;document.body.append(picker);picker.addEventListener('change',async()=>{try{const json=parsePlan(await picker.files[0].text());await saveImportedPlan(json);state.page='plan';await render();toast('Plan imported')}catch(err){toast(err.message)}picker.value=''});await render()}
init().catch(e=>{console.error(e);main.textContent='Could not open local database: '+e.message});


async function exerciseRows(){
 const sessions=(await all('sessions')).filter(x=>x.status==='done').sort((a,b)=>a.date.localeCompare(b.date)),sets=await all('sets'),by={};
 for(const session of sessions)for(const x of sets.filter(y=>y.session===session.id&&y.status==='done'&&((y.weight!==''&&y.reps!==''&&Number(y.reps)>0)||Number(y.duration)>0))){(by[x.exercise]??={name:x.name,rows:[]}).rows.push({...x,date:session.date})}
 return Object.entries(by).sort((a,b)=>a[1].name.localeCompare(b[1].name));
}
async function progress(){
 if(state.progressView==='detail')return progressDetail();
 if(state.progressView==='list'){const rows=await exerciseRows();main.innerHTML='<div class="workout-topline"><button class="back-link" data-action="progress-overview">← Progress overview</button></div>'+heading('EXERCISES','Exercise progress','Choose an exercise to open its detailed charts and history')+'<section class="recent-card">'+(rows.length?rows.map(([id,x])=>'<div class="progress-list-item" data-action="exercise-detail" data-id="'+esc(id)+'"><div class="exercise-order">↗</div><div class="exercise-detail"><strong>'+esc(x.name)+'</strong><p>'+x.rows.length+' recorded sets · Latest '+esc(x.rows.at(-1).date)+'</p></div><span>›</span></div>').join(''):empty('No exercise history','Complete a workout to populate this list.'))+'</section>';return}
 const entries=await exerciseRows(),sets=await all('sets'),sessions=(await all('sessions')).filter(x=>x.status==='done');
 const volume=sets.filter(x=>x.status==='done'&&x.weight!==''&&x.reps!=='').reduce((n,x)=>n+Number(x.weight)*Number(x.reps),0),rirs=sets.filter(x=>x.status==='done'&&x.rir!==null&&x.rir!==''),avg=rirs.length?(rirs.reduce((n,x)=>n+Number(x.rir),0)/rirs.length).toFixed(1):'—';
 const mini=rows=>{const vals=rows.map(x=>Number(x.duration||x.weight)).filter(Number.isFinite);if(vals.length<2)return '<small>Log more sessions to see a trend</small>';const lo=Math.min(...vals),span=Math.max(1,Math.max(...vals)-lo),pts=vals.map((v,i)=>(4+i/(vals.length-1)*92)+','+(28-(v-lo)/span*22)).join(' ');return '<svg class="progress-mini" viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="#247cf5" stroke-width="2" stroke-linecap="round"/></svg>'};
 main.innerHTML=heading('PROGRESS','Your training, over time','Track performance across exercises and body measurements')+
 '<div class="segmented-control"><button data-action="progress-overview" class="selected">Overview</button><button data-action="progress-exercises">Exercises</button><button data-action="body">Body</button></div>'+
 '<div class="section-heading"><h2>Overall progress</h2><span class="eyebrow">ALL TIME</span></div><div class="stat-grid"><div class="stat-card"><span>TOTAL VOLUME</span><strong>'+displayWeight(volume)+' '+weightUnit()</strong></div><div class="stat-card"><span>AVG RIR</span><strong>'+avg+'</strong></div><div class="stat-card"><span>SESSIONS</span><strong>'+sessions.length+'</strong></div><div class="stat-card"><span>EXERCISES</span><strong>'+entries.length+'</strong></div></div>'+
 '<div class="section-heading"><h2>Exercise progress</h2><button class="text-button" data-action="progress-exercises">See all</button></div>'+
 (entries.length?'<section class="recent-card">'+entries.map(([id,x])=>'<div class="progress-list-item" data-action="exercise-detail" data-id="'+esc(id)+'"><div class="exercise-order">↗</div><div class="exercise-detail"><strong>'+esc(x.name)+'</strong>'+mini(x.rows)+'</div><span class="pill">'+(x.rows.some(r=>r.tracking==='time')?Math.max(...x.rows.map(r=>Number(r.duration)||0))+' sec':Math.max(...x.rows.map(r=>Number(r.weight)||0))+' '+weightUnit())+'</span></div>').join('')+'</section>':empty('No exercise data yet','Complete a workout to see your progress.','programmes','Go to workouts'))+
 '<button class="button secondary full-button" data-action="body">Body progress and measurements</button>';
}

async function home(){
 const p=await active(),ss=await all('sessions'),days=p?(await all('days')).filter(d=>d.programme===p.id).sort((a,b)=>a.order-b.order):[],done=ss.filter(s=>s.status==='done'),activeSession=ss.find(s=>s.status==='active');
 if(!p){main.innerHTML=heading('GYM TRACKER','Your training space','Private workout tracking on this device')+'<div class="tile-grid"><button class="home-tile" data-action="programmes"><span class="tile-icon workouts"><svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><rect x="1" y="8" width="4" height="8" rx="1.2"/><rect x="5" y="6" width="4" height="12" rx="1.2"/><rect x="8" y="10.5" width="8" height="3" rx="1"/><rect x="15" y="6" width="4" height="12" rx="1.2"/><rect x="19" y="8" width="4" height="8" rx="1.2"/></g></svg></span><strong>Workouts</strong><small>Plans & sessions</small></button><button class="home-tile" data-action="progress"><span class="tile-icon progress"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="12" width="3.5" height="8" rx="1"/><rect x="10.2" y="8" width="3.5" height="12" rx="1"/><rect x="16.4" y="4" width="3.5" height="16" rx="1"/></svg></span><strong>Progress</strong><small>Charts & stats</small></button><button class="home-tile" data-action="history"><span class="tile-icon history"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16M8 14h2M14 14h2"/></svg></span><strong>History</strong><small>Past sessions</small></button><button class="home-tile" data-action="open-settings"><span class="tile-icon settings"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3.1"/><circle cx="16" cy="8" r="3.1"/><circle cx="8" cy="16" r="3.1"/><circle cx="16" cy="16" r="3.1"/></svg></span><strong>Settings</strong><small>Import / backup</small></button></div>'+empty('No active programme','Create a programme or import your workout plan.','new-plan','Create programme')+btn('import-plan','Import plan','class="button secondary full-button"');return}
 state.programme=p.id;
 const phaseGroups=new Map();for(const d of days){const phase=d.phase||((d.name.match(/^(Phase\s*[^·]+)/i)||[])[1])||'Workouts';if(!phaseGroups.has(phase))phaseGroups.set(phase,[]);phaseGroups.get(phase).push(d)}
 const phaseMarkup=[...phaseGroups.entries()].map(([phase,items])=>'<section class="phase-group"><div class="section-heading"><h3>'+esc(phase)+'</h3><span class="eyebrow">'+items.length+' WORKOUTS</span></div>'+items.map((d,i)=>'<article class="day-card"><div class="day-number">'+(i+1)+'</div><div class="day-info"><strong>'+esc(d.name.replace(/^Phase\s*[^·]+·\s*/i,''))+'</strong><p>'+(d.exercises||[]).length+' exercises</p></div>'+btn('start-day','Start','data-id="'+d.id+'"')+'</article>').join('')+'</section>').join('');
 main.innerHTML=heading('','Your training at a glance','Stay consistent. Track every set.')+btn('programmes','Start workout','class="button primary full-button"')+
 '<div class="tile-grid"><button class="home-tile" data-action="programmes"><span class="tile-icon workouts"><svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><rect x="1" y="8" width="4" height="8" rx="1.2"/><rect x="5" y="6" width="4" height="12" rx="1.2"/><rect x="8" y="10.5" width="8" height="3" rx="1"/><rect x="15" y="6" width="4" height="12" rx="1.2"/><rect x="19" y="8" width="4" height="8" rx="1.2"/></g></svg></span><strong>Workouts</strong><small>Plans & sessions</small></button><button class="home-tile" data-action="progress"><span class="tile-icon progress"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="12" width="3.5" height="8" rx="1"/><rect x="10.2" y="8" width="3.5" height="12" rx="1"/><rect x="16.4" y="4" width="3.5" height="16" rx="1"/></svg></span><strong>Progress</strong><small>Charts & stats</small></button><button class="home-tile" data-action="history"><span class="tile-icon history"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16M8 14h2M14 14h2"/></svg></span><strong>History</strong><small>Past sessions</small></button><button class="home-tile" data-action="open-settings"><span class="tile-icon settings"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3.1"/><circle cx="16" cy="8" r="3.1"/><circle cx="8" cy="16" r="3.1"/><circle cx="16" cy="16" r="3.1"/></svg></span><strong>Settings</strong><small>Import / backup</small></button></div>'+
 (activeSession?'<section class="resume-card"><div><span class="eyebrow">WORKOUT IN PROGRESS</span><h2>'+esc(activeSession.day)+'</h2><p>Continue where you left off</p></div>'+btn('resume','Resume','data-id="'+activeSession.id+'"')+'</section>':'')+
 '<div class="section-heading"><h2>Active programme</h2><span class="pill pill-active">Active</span></div><section class="recent-card"><strong>'+esc(p.name)+'</strong><p>'+days.length+' days · '+days.reduce((n,d)=>n+(d.exercises||[]).length,0)+' exercises</p>'+btn('open-plan','View programme','class="button secondary full-button"')+'</section>'+
 '<div class="section-heading"><h2>Start a workout</h2><button class="text-button" data-action="programmes">All plans</button></div>'+
 (days.length?phaseMarkup:empty('No workout days','Open your programme and add a workout day.','open-plan','Edit programme'))+
 '<div class="backup-reminder"><div><strong>Keep your data safe</strong><p>Export a backup regularly.</p></div>'+btn('backup','Export')+'</div>';
}

async function bodyProgress(){
 const keys={weight:'Body weight',waist:'Waist',chest:'Chest',upperArm:'Upper arm',forearm:'Forearm',thigh:'Thigh',hips:'Hips'},key=state.bodyMetric||'weight',allRows=(await all('measurements')).sort((a,b)=>a.date.localeCompare(b.date)),rows=allRows.filter(x=>x[key]!==null&&x[key]!==undefined).map(x=>({date:x.date,value:Number(x[key])})),unit=key==='weight'?weightUnit():'cm',latest=rows.at(-1),latestValue=key==='weight'?displayWeight(latest?.value):latest?.value;
 main.innerHTML='<div class="workout-topline"><button class="back-link" data-action="progress">← Progress</button></div>'+heading('BODY PROGRESS','Your body measurements','Track weight and measurements consistently')+
 '<div class="segmented-control">'+Object.entries(keys).map(([k,v])=>'<button type="button" data-action="body-metric" data-value="'+k+'" class="'+(key===k?'selected':'')+'">'+(k==='weight'?'Weight':v.replace('Body ',''))+'</button>').join('')+'</div>'+
 '<section class="chart-panel"><div class="section-heading"><h2>'+keys[key]+'</h2><span class="eyebrow">'+unit+'</span></div><h1>'+(latest?latestValue+' '+unit:'—')+'</h1>'+chartSVG(key==='weight'?rows.map(x=>({...x,value:Number(displayWeight(x.value))})):rows,'Body '+keys[key],' '+unit)+'</section>'+
 '<div class="section-heading"><h2>Measurement history</h2><button class="text-button" data-action="measurement">+ Add</button></div>'+
 (allRows.length?allRows.slice().reverse().map(x=>'<article class="history-session-card"><div><strong>'+esc(x.date)+'</strong><p>'+Object.keys(keys).filter(k=>x[k]!=null).map(k=>keys[k]+': '+(k==='weight'?displayWeight(x[k]):x[k])+' '+(k==='weight'?weightUnit():'cm')).join(' · ')+'</p></div></article>').join(''):empty('No measurements yet','Add your first entry to start tracking changes.','measurement','Add measurement'));
}
async function exerciseLibrary(){
 const names=['Bench Press','Incline Chest Press','Chest Press','Lat Pulldown','Seated Row','Cable Row','Squat','Leg Press','Leg Extension','Leg Curl','Romanian Deadlift','Deadlift','Overhead Press','Shoulder Press','Lateral Raise','Biceps Curl','Hammer Curl','Triceps Pushdown','Triceps Extension','Calf Raise','Plank','Crunch','Hip Thrust','Face Pull','Pull Up','Push Up'];
 show('<div class="modal-content"><div class="modal-head"><h2>Exercise library</h2><button type="button" data-action="close-modal">×</button></div><label class="form-label">Choose exercise<select id="libraryChoice">'+names.map(n=>'<option>'+n+'</option>').join('')+'</select></label><div class="modal-actions"><button class="button secondary" data-action="close-modal">Cancel</button><button class="button primary" data-action="choose-library-exercise">Add exercise</button></div><button class="button ghost full-button" data-action="custom-exercise">Create custom exercise</button></div>');
}

function settings(){main.innerHTML='<div class="workout-topline"><button class="back-link" data-action="home">← Home</button></div>'+heading('SETTINGS','Settings','Manage your data and app preferences')+
 '<section class="settings-card"><h3>Data management</h3><div class="settings-row"><div><strong>Export data</strong><p>Choose what to include in your backup</p></div><button class="button secondary" data-action="export-data">Open</button></div><div class="settings-row"><div><strong>Import plan</strong><p>Import a workout plan from a JSON file</p></div><button class="button secondary" data-action="import-plan">Import JSON</button></div><div class="settings-row"><div><strong>Generate a plan with AI</strong><p>Copy the prompt for ChatGPT, Gemini or Claude to create compatible JSON</p></div><button class="button secondary" data-action="copy-ai-prompt">Copy prompt</button></div><div class="settings-row"><div><strong>Import data</strong><p>Restore the app from a previously exported JSON backup. This replaces current local data.</p></div><button class="button secondary" data-action="import-backup">Import data</button></div><div class="settings-row"><div><strong>Clear all data</strong><p>Permanently delete all programmes, workouts, sets and measurements on this device</p></div><button class="button danger" data-action="clear-all-data">Clear</button></div></section>'+
 '<section class="settings-card"><h3>App settings</h3><div class="settings-row"><div><strong>Weight units</strong><p>Choose how weights are displayed</p></div><select id="unitPreference"><option value="kg" '+(preferences.units==='kg'?'selected':'')+'>Kilograms (kg)</option><option value="lb" '+(preferences.units==='lb'?'selected':'')+'>Pounds (lb)</option></select></div><div class="settings-row"><div><strong>Theme</strong><p>System, light or dark appearance</p></div><select id="themePreference"><option value="system" '+(preferences.theme==='system'?'selected':'')+'>System</option><option value="light" '+(preferences.theme==='light'?'selected':'')+'>Light</option><option value="dark" '+(preferences.theme==='dark'?'selected':'')+'>Dark</option></select></div><div class="settings-row"><div><strong>Storage</strong><p>IndexedDB · this browser only</p></div><span class="pill pill-active">Local</span></div></section>'+
 '<section class="settings-card"><h3>About</h3><p>Gym Tracker · Version 1.1</p><p>No account or cloud sync. Export backups regularly; clearing browser site data can permanently erase records.</p></section>'}
function exportDataPage(){main.innerHTML='<div class="workout-topline"><button class="back-link" data-action="open-settings">← Settings</button></div>'+heading('DATA MANAGEMENT','Export data','Choose the records to include in your JSON backup')+
 '<section class="settings-card"><h3>Choose what to export</h3>'+[['programmes','Workout plans'],['sessions','Workout history'],['measurements','Body measurements'],['settings','Settings']].map(([id,label])=>'<div class="settings-row"><strong>'+label+'</strong><input class="switch" id="export-'+id+'" type="checkbox" checked></div>').join('')+'</section>'+
 '<section class="settings-card"><h3>Format</h3><p>JSON backup · preserves IDs and relationships for restoring this app</p></section>'+
 btn('export-now','Export selected data','class="button primary full-button"')}

async function dayDetail(){const d=await get('days',state.day),p=d?await get('programmes',d.programme):null;if(!d){state.page='plan';return plan()}main.innerHTML='<div class="workout-topline"><button class="back-link" data-action="open-plan" data-id="'+d.programme+'">← Programme</button><button class="mini-action" data-action="edit-day" data-id="'+d.id+'">•••</button></div>'+heading('WORKOUT DAY',esc(d.name),(d.exercises||[]).length+' exercises · '+esc(p?.name||''))+
 '<section class="recent-card">'+(d.exercises||[]).map((x,i)=>'<div class="plan-exercise-row"><div class="exercise-order">'+(i+1)+'</div><div class="exercise-detail"><strong>'+esc(x.name)+'</strong><p>'+x.sets+' sets · '+(x.tracking==='time'?'Timed · '+(x.min||'')+'–'+(x.max||'')+' sec':x.min+'–'+x.max+' reps · '+x.rir+' RIR')+'</p></div></div>').join('')+'</section>'+
 ((d.exercises||[]).length?btn('start-day','Start workout','data-id="'+d.id+'" class="button primary full-button"'):empty('No exercises yet','Add exercises in the programme editor.','open-plan','Edit programme'))}

async function plan(){
 const p=await get('programmes',state.programme);if(!p){state.page='programmes';return plans()}
 const days=(await all('days')).filter(d=>d.programme===p.id).sort((a,b)=>a.order-b.order),tab=state.programmeTab||'days';
 const tabs='<div class="segmented-control"><button data-action="programme-tab" data-value="days" class="'+(tab==='days'?'selected':'')+'">Days</button><button data-action="programme-tab" data-value="stats" class="'+(tab==='stats'?'selected':'')+'">Stats</button><button data-action="programme-tab" data-value="settings" class="'+(tab==='settings'?'selected':'')+'">Settings</button></div>';
 let content='';
 if(tab==='days')content='<div class="toolbar-row">'+btn('rename-plan','Rename')+btn('add-day','+ Add workout day')+'</div>'+days.map((d,i)=>(i===0||d.phase!==days[i-1].phase?'<div class="section-heading"><h3>'+esc(d.phase||'Workouts')+'</h3></div>':'')+'<section class="day-editor-card"><div class="day-editor-heading"><div><span class="eyebrow">DAY '+(i+1)+'</span><h2>'+esc(d.name)+'</h2><button class="text-button" data-action="day-detail" data-id="'+d.id+'">View day</button></div><div class="inline-actions"><button class="mini-action" data-action="move-day-up" data-id="'+d.id+'" '+(i===0?'disabled':'')+'>↑</button><button class="mini-action" data-action="move-day-down" data-id="'+d.id+'" '+(i===days.length-1?'disabled':'')+'>↓</button><button class="mini-action" data-action="edit-day" data-id="'+d.id+'">Edit</button><button class="mini-action danger" data-action="delete-day" data-id="'+d.id+'">×</button></div></div>'+(d.exercises||[]).map((x,j)=>'<div class="plan-exercise-row"><div class="exercise-order">'+(j+1)+'</div><div class="exercise-detail"><strong>'+esc(x.name)+'</strong><p>'+x.sets+' sets · '+(x.tracking==='time'?'Timed exercise':' '+x.min+'–'+x.max+' reps · '+x.rir+' RIR')+'</p></div><div class="inline-actions"><button class="mini-action" data-action="move-ex-up" data-day="'+d.id+'" data-id="'+x.id+'" '+(j===0?'disabled':'')+'>↑</button><button class="mini-action" data-action="move-ex-down" data-day="'+d.id+'" data-id="'+x.id+'" '+(j===(d.exercises||[]).length-1?'disabled':'')+'>↓</button><button class="mini-action" data-action="edit-exercise" data-id="'+x.id+'">Edit</button><button class="mini-action danger" data-action="remove-exercise" data-id="'+x.id+'" data-day="'+d.id+'">×</button></div></div>').join('')+btn('add-exercise','+ Add exercise','data-id="'+d.id+'" class="button secondary full-button"')+'<button class="button ghost full-button" data-action="exercise-library" data-id="'+d.id+'">Browse exercise library</button></section>').join('')+(days.length?'':empty('No workout days yet','Add a day, then add exercises.','add-day','Add workout day'));
 if(tab==='stats'){const sessions=(await all('sessions')).filter(x=>x.programme===p.id&&x.status==='done'),ids=new Set(sessions.map(x=>x.id)),sets=(await all('sets')).filter(x=>ids.has(x.session)&&x.status==='done'),volume=sets.reduce((n,x)=>n+Number(x.weight||0)*Number(x.reps||0),0),rir=sets.filter(x=>x.rir!==null&&x.rir!=='');content='<div class="stat-grid"><div class="stat-card"><span>WORKOUTS</span><strong>'+sessions.length+'</strong></div><div class="stat-card"><span>WORKOUT DAYS</span><strong>'+days.length+'</strong></div><div class="stat-card"><span>TOTAL VOLUME</span><strong>'+displayWeight(volume)+' '+weightUnit()</strong></div><div class="stat-card"><span>AVG RIR</span><strong>'+(rir.length?(rir.reduce((n,x)=>n+Number(x.rir),0)/rir.length).toFixed(1):'—')+'</strong></div></div><p>Statistics are calculated from completed sessions in this programme.</p>'}
 if(tab==='settings')content='<section class="settings-card"><h3>Programme settings</h3><div class="settings-row"><div><strong>Programme name</strong><p>'+esc(p.name)+'</p></div>'+btn('rename-plan','Rename')+'</div><div class="settings-row"><div><strong>Active programme</strong><p>Choose which plan appears on Home</p></div>'+(p.active?'<button class="button secondary" disabled>Active</button>':btn('activate','Set active','data-id="'+p.id+'"'))+'</div><div class="settings-row"><div><strong>Days and exercises</strong><p>'+days.length+' days · '+days.reduce((n,d)=>n+(d.exercises||[]).length,0)+' exercises</p></div></div><div class="settings-row"><div><strong>Remove programme</strong><p>Delete this plan and its associated workout history</p></div><button class="button danger" data-action="delete-programme" data-id="'+p.id+'">Remove programme</button></div></section>';
 main.innerHTML='<div class="workout-topline"><button class="back-link" data-action="programmes">← Programmes</button><span class="pill '+(p.active?'pill-active':'')+'">'+(p.active?'Active':'Archived')+'</span></div>'+heading('PROGRAMME DETAILS',esc(p.name),days.length+' days · '+days.reduce((n,d)=>n+(d.exercises||[]).length,0)+' exercises')+tabs+content;
}
