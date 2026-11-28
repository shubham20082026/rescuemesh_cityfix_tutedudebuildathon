/* Stage 1 UI adapter. Loads embedded OSM data or explicit local JSON. */
(function(){
'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=n=>n.toLocaleString('en-IN'),km=n=>Number.isFinite(n)?(n/1000).toFixed(2):'—';
let R=null,closed=new Set(),offline=new Set(),objective='areas',history=[],selected=null,state,ranking=[],zoom=1,log=[],timer,project;
const snapshot=()=>({schema:'rescuemesh-scenario/v2',dataset_id:R.data.dataset_id,closed:[...closed].sort((a,b)=>a-b),offline:[...offline].sort(),objective});
function notify(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(timer);timer=setTimeout(()=>$('toast').style.display='none',4500);}
function record(message){log.unshift({time:new Date().toLocaleTimeString(),message});log=log.slice(0,25);}
function persist(){try{localStorage.setItem('rescuemesh-v2-'+R.data.dataset_id,JSON.stringify(snapshot()));$('saveStatus').textContent='Scenario saved locally for this dataset.';}catch{$('saveStatus').textContent='Local storage unavailable; use JSON export.';}}
function assign(s){closed=new Set(s.closed);offline=new Set(s.offline);objective=s.objective;}
function change(message,fn){if(!R)return;history.push(snapshot());if(history.length>60)history.shift();fn();record(message);render();persist();notify(message);}
function reset(){change('Reset to all roads and hospitals available.',()=>{closed=new Set();offline=new Set();});}
const hospitalName=id=>R.hospitals.find(h=>h.id===id)?.name||'None reachable';
const roadName=id=>{const e=R.edges[id];return `R${id} · ${e.name||e.a+'–'+e.b}`;};
function loadData(raw){
 const candidate=RescueDataEngine.createEngine(raw); // validate completely before replacing a working dataset
 R=candidate;closed=new Set();offline=new Set();objective='areas';history=[];log=[];zoom=1;selected=R.demand[0].id;
 try{const saved=localStorage.getItem('rescuemesh-v2-'+R.data.dataset_id);if(saved)assign(R.validateScenario(JSON.parse(saved)));}catch{record('Stored scenario invalid/unavailable; baseline loaded.');}
 const all=R.nodes.concat(R.hospitals,R.demand),midLat=all.reduce((s,n)=>s+n.lat,0)/all.length,c=Math.cos(midLat*Math.PI/180);
 const coords=all.map(p=>[p.lon*c,-p.lat]),minX=Math.min(...coords.map(p=>p[0])),maxX=Math.max(...coords.map(p=>p[0])),minY=Math.min(...coords.map(p=>p[1])),maxY=Math.max(...coords.map(p=>p[1]));
 const scale=Math.min(640/Math.max(maxX-minX,1e-8),420/Math.max(maxY-minY,1e-8));
 project=(lat,lon)=>[380+(lon*c-(minX+maxX)/2)*scale,270+(-lat-(minY+maxY)/2)*scale];
 $('setup').hidden=true;$('workspace').hidden=false;$('setupError').textContent='';
 $('disclosure').innerHTML=R.data.meta?.synthetic?'<strong>SYNTHETIC TEST NETWORK.</strong> Fictional roads, hospitals, coordinates and weights. Not Bengaluru data; not emergency guidance.':'<strong>OSM-derived roads and named features.</strong> Illustrative demand weights; hypothetical closures; approximate locality centres and nearest-junction snaps. Roads treated as undirected. Not emergency navigation.';
 $('hospitalControls').innerHTML=R.hospitals.map(h=>`<label class="hospital-toggle"><span>✚ ${esc(h.id)}<small class="hint">${esc(h.name)} · snap ${Math.round(h.snap_m)} m</small></span><input type="checkbox" data-hospital="${esc(h.id)}" aria-label="${esc(h.name)} available"></label>`).join('');
 $('roadSelect').innerHTML=R.edges.map(e=>`<option value="${e.id}">${esc(roadName(e.id))} · ${km(e.weight)} km</option>`).join('');
 const meta=R.data.meta||{};
 $('dataAudit').innerHTML=`<p><strong>${R.nodes.length} junctions · ${R.edges.length} segments · ${R.hospitals.length} hospitals · ${R.demand.length} localities.</strong></p><p>Dataset: ${esc(R.data.dataset_id)}<br>Retrieved: ${esc(meta.retrieved_at||'Not specified')}<br>Length method: ${esc(meta.length_method||'Supplied metre lengths')}<br>Components: ${esc(meta.components??'Not specified')}</p>`;
 $('snapTable').innerHTML=[...R.hospitals.map(p=>({...p,type:'Hospital'})),...R.demand.map(p=>({...p,type:'Locality'}))].map(p=>`<tr><td>${esc(p.name)}</td><td>${p.type}</td><td>${Math.round(p.snap_m)} m</td><td><a href="${esc(p.source_url)}" target="_blank" rel="noopener">${esc(R.data.meta?.synthetic?'Synthetic — no OSM source':(p.osm_type||'OSM'))} ${esc(p.osm_id||p.id)}</a></td></tr>`).join('');
 record('Dataset loaded. Review source features and snap distances in Analysis.');render();$('mapEntryHint').textContent='Your road network is loaded. Open the map to inspect routes and closures.';showScreen('network');
}
function render(){
 state=R.analyze(closed,offline);ranking=R.rankRepairs(closed,offline,objective);const total=R.demand.length;
 $('metrics').innerHTML=`<article class="metric"><div class="metric-label">Reachable localities</div><strong>${state.count}</strong><span class="unit">/ ${total}</span><div class="metric-bottom">${state.isolated} disconnected</div></article><article class="metric ${state.isolated?'danger':''}"><div class="metric-label">Disconnected demand weight</div><strong>${fmt(R.totalPopulation-state.population)}</strong><div class="metric-bottom">Illustrative weight, not people counted</div></article><article class="metric"><div class="metric-label">Average road distance</div><strong>${state.avg===null?'—':km(state.avg)}</strong><span class="unit">km</span><div class="metric-bottom">Reachable localities only; snaps excluded</div></article><article class="metric"><div class="metric-label">Weight with hospital access</div><strong>${Math.round(state.population/R.totalPopulation*100)}%</strong><div class="metric-bottom">${fmt(state.population)} / ${fmt(R.totalPopulation)} illustrative weight</div></article>`;
 $('objective').value=objective;$('undo').disabled=!history.length;
 $('scenarioName').textContent=closed.size||offline.size?`${closed.size} closed · ${offline.size} hospitals off`:'Baseline';
 document.querySelectorAll('[data-hospital]').forEach(el=>el.checked=!offline.has(el.dataset.hospital));
 drawMap();renderRepairs();renderAreas();renderAlerts();renderHospitalCards();
 $('activityLog').innerHTML=log.map(entry=>`<li><time>${esc(entry.time)}</time>${esc(entry.message)}</li>`).join('');
}
function drawMap(){
 const d=R.demand.find(d=>d.id===selected),route=d?R.route(d.node,state):null,routeEdges=new Set(route?.edges||[]),best=ranking[0];
 $('mapScene').setAttribute('transform',`translate(${380*(1-zoom)} ${270*(1-zoom)}) scale(${zoom})`);
 $('zoomReset').textContent=Math.round(zoom*100)+'%';
 $('roads').innerHTML=R.edges.map(e=>{
  const css=closed.has(e.id)?(best?.id===e.id?'road-best':'road-closed'):routeEdges.has(e.id)?'road-route':'';
  const points=e.geometry.map(([lat,lon])=>project(lat,lon).join(',')).join(' ');
  return `<g class="road-group ${css}" role="button" tabindex="0" data-road="${e.id}" aria-label="${esc(roadName(e.id))}, ${closed.has(e.id)?'closed':'open'}, toggle closure"><title>${esc(roadName(e.id))} · ${km(e.weight)} km</title><polyline class="road-hit" fill="none" points="${points}"/><polyline class="road-visible" fill="none" points="${points}"/></g>`;
 }).join('');
 const features=[...R.hospitals.map(h=>({...h,isHospital:true})),...R.demand.map(d=>({...d,isHospital:false}))];
 $('nodes').innerHTML=features.map(p=>{
  const [x,y]=project(p.lat,p.lon),n=R.byId[p.node],[nx,ny]=project(n.lat,n.lon),lost=p.isHospital?offline.has(p.id):!Number.isFinite(state.dist[p.node]);
  return `<g class="node-group ${p.isHospital?(lost?'hospital-offline':''):lost?'isolated':''} ${selected===p.id?'selected':''}" role="button" tabindex="0" data-${p.isHospital?'facility':'locality'}="${esc(p.id)}" aria-label="${esc(p.name)}; ${p.isHospital?'inspect hospital':'inspect route'}"><title>${esc(p.name)} · snapped ${Math.round(p.snap_m)} m to junction ${esc(p.node)}</title><line class="snap-line" x1="${x}" y1="${y}" x2="${nx}" y2="${ny}"/><circle class="${p.isHospital?'hospital-circle':'node-circle'}" cx="${x}" cy="${y}" r="${p.isHospital?10:7}"/>${p.isHospital?`<text class="hospital-plus" style="font-size:14px" x="${x}" y="${y+5}">${lost?'×':'+'}</text>`:''}<text class="node-label" x="${x+11}" y="${y-10}">${esc(p.id)}</text></g>`;
 }).join('');
 if(!d)return;
 $('routeDetail').innerHTML=route?`<strong>${esc(d.name)} → ${esc(hospitalName(route.hospital))}</strong><div>${km(route.distance)} km on modeled roads · ${route.edges.length} segments.</div><p class="hint">Locality snap: ${Math.round(d.snap_m)} m. Hospital snap: ${Math.round(R.hospitals.find(h=>h.id===route.hospital).snap_m)} m. These access legs are not routed or included.</p>`:`<strong>${esc(d.name)} · disconnected</strong><div>No route to an enabled hospital on the selected road classes. Illustrative weight: ${fmt(d.population)}.</div>`;
}
function renderRepairs(){
 const best=ranking[0],helpful=best&&(best.gain>0||best.saving>1e-8);
 $('rankCount').textContent=ranking.length+' candidates';
 $('recommendation').innerHTML=best?`<span class="eyebrow">SINGLE-ROAD COUNTERFACTUAL</span><h3>R${best.id}</h3><p>${esc(roadName(best.id))}<br>+${best.gain} localities · +${fmt(best.people)} weight.<br>${km(best.saving)} aggregate km saved for already reachable localities.</p><button class="button primary wide" id="applyBest" ${helpful?'':'disabled'}>Restore this road</button>${helpful?'':'<p>No measurable single-road benefit. A multi-road combination may still help.</p>'}`:'<span class="eyebrow">NETWORK STATUS</span><h3>All roads open.</h3><p>Close a road to compare single-road repairs. Hospital availability is controlled separately.</p>';
 $('ranking').innerHTML=ranking.length?ranking.map((r,i)=>`<button class="rank-row" data-repair="${r.id}"><span class="rank-number">${i+1}</span><span class="rank-body">R${r.id}<small>+${fmt(r.people)} weight · ${km(r.saving)} km saved</small></span><span class="rank-gain">+${r.gain}</span></button>`).join(''):'<div class="empty">No closed roads to rank.</div>';
}
function renderAreas(){if(!R)return;const f=$('areaFilter').value;const rows=R.demand.filter(d=>f==='all'||(f==='isolated')===!Number.isFinite(state.dist[d.node]));$('areaTable').innerHTML=rows.map(d=>{const ok=Number.isFinite(state.dist[d.node]);return `<tr><td><button class="area-button" data-area="${esc(d.id)}">${esc(d.name)} ↗</button></td><td>${fmt(d.population)}</td><td>${ok?esc(hospitalName(state.hospital[d.node])):'—'}</td><td>${km(state.dist[d.node])}</td><td><span class="status ${ok?'':'bad'}">${ok?'Connected':'Disconnected'}</span></td></tr>`;}).join('')||'<tr><td colspan="5">No matching localities.</td></tr>';}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Downloaded '+name);}
function toggle(id){change(`Road R${id} ${closed.has(id)?'reopened':'closed'}.`,()=>closed.has(id)?closed.delete(id):closed.add(id));}
function restore(id){if(!closed.has(id))return;change(`Road R${id} restored.`,()=>closed.delete(id));}
$('loadData').onclick=()=>$('dataFile').click();
$('dataFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>15000000)throw Error('Dataset exceeds 15 MB.');loadData(JSON.parse(await f.text()));notify('Dataset loaded. Review the snap audit before use.');}catch(error){$('setupError').textContent=error.message;notify('Data rejected: '+error.message);}finally{e.target.value='';}};
$('baseline').onclick=reset;$('reset').onclick=reset;
$('undo').onclick=()=>{if(!history.length)return;assign(history.pop());record('Undo restored the prior scenario.');render();persist();};
$('objective').onchange=e=>change('Repair priority changed.',()=>objective=e.target.value);
$('hospitalControls').onchange=e=>{if(e.target.dataset.hospital){const id=e.target.dataset.hospital;change('Hospital '+id+(e.target.checked?' enabled.':' disabled.'),()=>e.target.checked?offline.delete(id):offline.add(id));}};
$('toggleRoad').onclick=()=>{if(R)toggle(Number($('roadSelect').value));};
$('recommendation').onclick=e=>{if(e.target.closest('#applyBest')&&ranking[0])restore(ranking[0].id);};
$('ranking').onclick=e=>{const el=e.target.closest('[data-repair]');if(el){const r=ranking.find(r=>r.id===Number(el.dataset.repair));$('routeDetail').innerHTML=`<strong>Preview: ${esc(roadName(r.id))}</strong><p>After this repair: ${r.after.count}/${R.demand.length} localities reachable; +${fmt(r.people)} illustrative weight.</p><button class="button primary" data-apply="${r.id}">Apply this repair</button>`;showScreen('network');}};
$('routeDetail').onclick=e=>{const el=e.target.closest('[data-apply]');if(el)restore(Number(el.dataset.apply));};
function mapAction(target){if(!R)return;const road=target.closest('[data-road]'),locality=target.closest('[data-locality]'),facility=target.closest('[data-facility]');if(road){const id=Number(road.dataset.road);toggle(id);document.querySelector(`[data-road="${id}"]`)?.focus({preventScroll:true});}else if(locality){selected=locality.dataset.locality;drawMap();}else if(facility){const h=R.hospitals.find(h=>h.id===facility.dataset.facility);notify(`${h.name}: ${offline.has(h.id)?'disabled':'enabled'}; nearest-junction snap ${Math.round(h.snap_m)} m.`);}}
$('network').onclick=e=>mapAction(e.target);$('network').onkeydown=e=>{if(['Enter',' '].includes(e.key)&&e.target.closest('[data-road],[data-locality],[data-facility]')){e.preventDefault();mapAction(e.target);}};
$('areaTable').onclick=e=>{const el=e.target.closest('[data-area]');if(el){selected=el.dataset.area;drawMap();}};$('areaFilter').onchange=renderAreas;
for(const [id,delta] of [['zoomIn',.25],['zoomOut',-.25],['zoomReset',0]])$(id).onclick=()=>{if(!R)return;zoom=delta?Math.min(2,Math.max(.75,zoom+delta)):1;drawMap();};
$('exportScenario').onclick=()=>{if(R)download('RescueMesh-scenario-v2.json',JSON.stringify(snapshot(),null,2),'application/json');};
$('importScenario').onclick=()=>$('scenarioFile').click();
$('scenarioFile').onchange=async e=>{const f=e.target.files[0];if(!f||!R)return;try{if(f.size>200000)throw Error('Scenario exceeds 200 KB.');const s=R.validateScenario(JSON.parse(await f.text()));change('Scenario imported.',()=>assign(s));}catch(err){notify('Import rejected: '+err.message);}finally{e.target.value='';}};
$('exportReport').onclick=()=>{if(!R)return;const md=s=>String(s).replace(/[|\r\n]/g,' ');const report=`# RescueMesh — Stage 1 impact report\n\nCreator: Shubham Parmar\nDataset: ${R.data.dataset_id}\nGenerated: ${new Date().toISOString()}\n\n## Disclosure\n${R.data.meta?.synthetic?"SYNTHETIC TEST NETWORK. All features and coordinates are fictional; no OSM provenance.":"OSM-derived geometry and names."} Locality centres and nearest-junction snaps are approximate. Weights are illustrative, not population counts. Hypothetical closures. Distances are road kilometres, excluding access legs. One-way restrictions ignored. No emergency accuracy claimed.\n\n## Results\nReachable localities: ${state.count}/${R.demand.length}\nReachable illustrative weight: ${state.population}/${R.totalPopulation}\nAverage road distance (reachable only): ${state.avg===null?'Not applicable':km(state.avg)+' km'}\nClosed roads: ${[...closed].map(id=>'R'+id).join(', ')||'None'}\nDisabled hospitals: ${[...offline].join(', ')||'None'}\n\n| Locality | Weight | Hospital | Road km |\n|---|---:|---|---:|\n${R.demand.map(d=>`| ${md(d.name)} | ${d.population} | ${md(hospitalName(state.hospital[d.node]))} | ${km(state.dist[d.node])} |`).join('\n')}\n\n## Single-road repair ranking\n| Road | Newly reachable localities | Newly reachable weight | Aggregate km saved* |\n|---|---:|---:|---:|\n${ranking.map(r=>`| R${r.id} | ${r.gain} | ${r.people} | ${km(r.saving)} |`).join('\n')}\n\n*Distance savings include only localities reachable before the repair.\n\n## Known missing capability\nThe single-step greedy chain-topology failure is NOT fixed in this Stage 1 handoff. Budgeted combination search is pending. Leaflet, sourced flood presets and full browser verification are also pending.\n\n## Sources\n© OpenStreetMap contributors, ODbL 1.0: https://www.openstreetmap.org/copyright\n${[...R.hospitals,...R.demand].map(p=>'- '+md(p.name)+': '+p.source_url).join('\n')}\n`;download('RescueMesh-impact-report.md',report,'text/markdown');};
// Responsive presentation layer. All cards are derived from the loaded scenario.
let alertFilter='all',alertLimit=9,currentScreen='alerts';
const ICONS={mesh:'M12 2v6M12 16v6M2 12h6M16 12h6M8 5H5v14h14v-3M8 8h5a4 4 0 0 1 0 8H8V8Zm5 8 5 6',bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',network:'M5 5h5l4 7h5M5 19h5l4-7M5 3v4M3 5h4M3 17h4v4H3zM18 10h4v4h-4z',hospital:'M8 3h8v18H8zM8 9H3v12h18V9h-5M10 7h4M12 5v4M11 17h2v4',repair:'m15 7-8 8M14 4a5 5 0 0 0-6 6L3 15a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-3-3 3-3Z',sliders:'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4',upload:'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-5',moon:'M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z',sun:'M12 3v2M12 19v2M3 12h2M19 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',search:'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',chart:'M4 3v18h17M8 16v-5M13 16V6M18 16V9',info:'M12 11v6M12 7v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',road:'m6 3-3 18M18 3l3 18M12 3v4M12 10v4M12 17v4',access:'M10 4a2 2 0 1 1 4 0 2 2 0 0 1-4 0ZM7 21l2-7-3-3 5-3 4 5h4M12 9l-1 7 5 5',check:'m5 12 4 4L19 6'};
function icon(name){return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]||ICONS.info}"/></svg>`;}
function hydrateIcons(){document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
function showScreen(screen){
 if(!['alerts','network','hospitals','repairs','settings','analysis','about'].includes(screen))return;
 currentScreen=screen;document.body.dataset.screen=screen;
 const titles={alerts:['Scenario alerts','Understand the disruption. Find the connection that matters.'],network:['Your access map','Explore road connections and trace a path to care.'],hospitals:['Hospital access','Explore care destinations in your current scenario.'],repairs:['Repair priorities','Find the single connection that makes a difference.'],settings:['Your workspace','Scenario controls, data sources and project notes.'],analysis:['Data & sources','Understand the features behind every result.'],about:['About RescueMesh','Transparent assumptions. Thoughtful decisions.']};
 $('screenTitle').textContent=titles[screen][0];$('screenSubtitle').textContent=titles[screen][1];
 document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==(screen==='analysis'||screen==='about'?screen:'overview'));
 document.querySelectorAll('[data-screen]').forEach(b=>{if(b.tagName==='BODY')return;const active=b.dataset.screen===screen||(b.dataset.screen==='settings'&&['analysis','about'].includes(screen));b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 window.scrollTo({top:0,behavior:'instant'});
}
function alertData(){
 if(!R)return [
  {category:'roads',tone:'amber',icon:'network',title:'Your network starts here',text:'Connect your generated Bengaluru road dataset to explore access to care.',badge:'Setup needed',action:'Load network',kind:'load'},
  {category:'access',tone:'purple',icon:'shield',title:'A safe space for what-ifs',text:'Close a road, inspect a route and see which localities lose hospital access.',badge:'Planning tool',action:'How it works',kind:'about'},
  {category:'hospitals',tone:'teal',icon:'hospital',title:'Care, connected',text:'Explore hospital availability in a scenario. No live hospital or flood feed is connected.',badge:'Simulation only',action:'Project notes',kind:'about'}
 ];
 const cards=[];
 for(const d of R.demand)if(!Number.isFinite(state.dist[d.node]))cards.push({category:'access',tone:'red',icon:'access',title:d.name,text:`No open route to an enabled hospital. Illustrative demand weight: ${fmt(d.population)}.`,badge:'Disconnected',action:'Inspect route',kind:'locality',id:d.id});
 for(const id of closed){const e=R.edges[id];cards.push({category:'roads',tone:'amber',icon:'road',title:e.name||`Road R${id}`,text:`R${id} is closed in your scenario. ${km(e.weight)} km of modeled road is unavailable.`,badge:'Manual closure',action:'Reopen road',kind:'road',id});}
 for(const h of R.hospitals)if(offline.has(h.id))cards.push({category:'hospitals',tone:'teal',icon:'hospital',title:h.name,text:'Excluded as a care destination in this scenario. This is not a real-world status report.',badge:'Scenario: off',action:'Enable',kind:'hospital',id:h.id});
 if(!cards.length){
  cards.push({category:'access',tone:'teal',icon:'check',title:'All localities connected',text:`${state.count} localities have a modeled road route to a hospital. Access legs and capacity are not verified.`,badge:'Baseline access',action:'Explore network',kind:'network'});
  cards.push({category:'roads',tone:'purple',icon:'road',title:'Explore a road closure',text:'Select a road on the map or use the road editor. Access and repair priorities update together.',badge:'Try a what-if',action:'Open controls',kind:'settings'});
  cards.push({category:'hospitals',tone:'teal',icon:'hospital',title:`${R.hospitals.length} care destinations`,text:'All hospital destinations are enabled in this scenario. Review sources and snap distances before interpreting routes.',badge:'Scenario: enabled',action:'View hospitals',kind:'hospitals'});
 }
 return cards;
}
function renderAlerts(){
 const all=alertData(),filtered=all.filter(a=>alertFilter==='all'||a.category===alertFilter);
 $('alertCount').textContent=R?`${closed.size+offline.size+state.isolated} scenario flags`:'Getting started';
 $('alertCaption').textContent=R?'Calculated from your settings. No live reports.':'Connect a network and start exploring.';
 $('alertSummary').hidden=!R;
 if(R)$('alertSummary').innerHTML=`<div class="summary-item"><strong>${closed.size}</strong><span>Closed roads</span></div><div class="summary-item"><strong>${state.isolated}</strong><span>Disconnected</span></div><div class="summary-item"><strong>${R.hospitals.length-offline.size}</strong><span>Hospitals on</span></div>`;
 $('alertCards').innerHTML=filtered.slice(0,alertLimit).map(a=>`<article class="alert-card ${a.tone}"><div class="alert-card-top"><span class="alert-symbol">${icon(a.icon)}</span><div class="alert-card-copy"><span class="alert-context">${R?'CURRENT SCENARIO':'RESCUEMESH / GET STARTED'}</span><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></div></div><div class="alert-card-bottom"><span class="alert-badge">${esc(a.badge)}</span><button class="card-action" data-alert-action="${a.kind}" data-id="${esc(a.id??'')}">${esc(a.action)} <span aria-hidden="true">↗</span></button></div></article>`).join('')||`<div class="empty-card">No ${esc(alertFilter)} alerts in the current scenario.</div>`;
 $('moreAlerts').hidden=filtered.length<=alertLimit;
 document.querySelectorAll('[data-filter]').forEach(b=>{const active=b.dataset.filter===alertFilter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
}
function renderHospitalCards(){
 if(!R){$('hospitalCards').innerHTML='<div class="empty-card">Your hospital destinations will appear after you load a generated dataset.</div>';return;}
 const query=$('hospitalSearch').value.toLocaleLowerCase(),list=R.hospitals.filter(h=>h.name.toLocaleLowerCase().includes(query));
 $('hospitalCount').textContent=`${R.hospitals.length-offline.size} / ${R.hospitals.length} enabled`;
 $('hospitalCards').innerHTML=list.map(h=>`<article class="hospital-card"><div class="hospital-card-top"><span class="hospital-symbol">${icon('hospital')}</span><div><h3>${esc(h.name)}</h3><p class="hint">${esc(h.id)} · ${Math.round(h.snap_m)} m to road junction</p><a href="${esc(h.source_url)}" target="_blank" rel="noopener">View OSM source ↗</a></div></div><label class="hospital-toggle"><span>${offline.has(h.id)?'Unavailable':'Available'} in scenario<small>Not a verified operating status</small></span><input type="checkbox" data-card-hospital="${esc(h.id)}" aria-label="Enable ${esc(h.name)} in scenario" ${offline.has(h.id)?'':'checked'}></label></article>`).join('')||'<div class="empty-card">No hospitals match your search.</div>';
}
function setTheme(theme){document.body.dataset.theme=theme;$('themeToggle').innerHTML=icon(theme==='dark'?'sun':'moon');$('themeToggle').setAttribute('aria-label',`Switch to ${theme==='dark'?'light':'dark'} theme`);try{localStorage.setItem('rescuemesh-theme',theme);}catch{}}
function initPresentation(){
 hydrateIcons();
 document.querySelectorAll('button[data-screen]').forEach(b=>b.onclick=()=>showScreen(b.dataset.screen));
 document.querySelectorAll('[data-load-data]').forEach(b=>b.onclick=()=>$('dataFile').click());
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{alertFilter=b.dataset.filter;alertLimit=9;renderAlerts();});
 $('moreAlerts').onclick=()=>{alertLimit+=9;renderAlerts();};
 $('alertCards').onclick=e=>{const b=e.target.closest('[data-alert-action]');if(!b)return;const kind=b.dataset.alertAction,id=b.dataset.id;if(kind==='load')$('dataFile').click();else if(kind==='road')restore(Number(id));else if(kind==='hospital')change('Hospital '+id+' enabled.',()=>offline.delete(id));else if(kind==='locality'){selected=id;drawMap();showScreen('network');}else showScreen(kind);};
 $('hospitalSearch').oninput=renderHospitalCards;
 $('hospitalCards').onchange=e=>{const id=e.target.dataset.cardHospital;if(id&&R)change(`Hospital ${id} ${e.target.checked?'enabled':'disabled'}.`,()=>e.target.checked?offline.delete(id):offline.add(id));};
 $('themeToggle').onclick=()=>setTheme(document.body.dataset.theme==='dark'?'light':'dark');
 try{setTheme(localStorage.getItem('rescuemesh-theme')==='dark'?'dark':'light');}catch{setTheme('light');}
 renderAlerts();renderHospitalCards();showScreen('alerts');
}

initPresentation();
try{const data=JSON.parse($('rescuemesh-data').textContent);if(data.status==='ready')loadData(data);}catch(error){$('setupError').textContent='Embedded data rejected: '+error.message;}
})();
