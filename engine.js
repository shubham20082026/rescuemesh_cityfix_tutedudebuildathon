/* RescueMesh Stage 1: data-driven engine. Distances in metres. */
(function(root){
'use strict';
const fail=m=>{throw Error(m);};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const coord=p=>finite(p.lat)&&finite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
function validateData(d){
 const synthetic=d?.meta?.synthetic===true;
 if(!d||d.schema!=='rescuemesh-data/v2'||d.status!=='ready')fail('Real data is not loaded. Run build_data.py, or select its generated data.json.');
 if(typeof d.dataset_id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(d.dataset_id))fail('Invalid dataset identity.');
 for(const k of ['nodes','edges','hospitals','demand'])if(!Array.isArray(d[k]))fail('Missing '+k+' array.');
 if(d.nodes.length<2||d.nodes.length>400||!d.edges.length||d.edges.length>5000)fail('Expected 2–400 nodes and 1–5000 road segments.');
 if(d.hospitals.length<8||d.hospitals.length>15||d.demand.length<8||d.demand.length>12)fail('Expected 8–15 hospitals and 8–12 localities.');
 const ids=new Set();for(const n of d.nodes){if(typeof n.id!=='string'||ids.has(n.id)||!coord(n))fail('Invalid or duplicate junction.');ids.add(n.id);}
 for(let i=0;i<d.edges.length;i++){const e=d.edges[i];if(e.id!==i||!ids.has(e.a)||!ids.has(e.b)||!finite(e.weight)||e.weight<=0)fail('Invalid road endpoints, ID or metre length.');if(!Array.isArray(e.geometry)||e.geometry.length<2||e.geometry.length>50000||e.geometry.some(p=>!Array.isArray(p)||p.length!==2||!coord({lat:p[0],lon:p[1]})))fail('Invalid road geometry.');}
 for(const kind of ['hospitals','demand']){const seen=new Set();for(const p of d[kind]){if(typeof p.id!=='string'||seen.has(p.id)||!ids.has(p.node)||!coord(p)||typeof p.name!=='string'||!p.name.trim()||!finite(p.snap_m)||p.snap_m<0||typeof p.source_url!=='string'||(!synthetic&&!/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(p.source_url)))fail('Invalid '+kind+' feature or OSM source.');seen.add(p.id);if(kind==='demand'&&(!finite(p.population)||p.population<=0))fail('Invalid illustrative weight.');}}
 return d;
}
class Heap{
 constructor(){this.a=[];}
 push(item){let i=this.a.length;this.a.push(item);while(i){const p=(i-1)>>1;if(this.a[p][0]<=item[0])break;this.a[i]=this.a[p];i=p;}this.a[i]=item;}
 pop(){const first=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let c=i*2+1;if(c+1<this.a.length&&this.a[c+1][0]<this.a[c][0])c++;if(last[0]<=this.a[c][0])break;this.a[i]=this.a[c];i=c;}this.a[i]=last;}return first;}
 get size(){return this.a.length;}
}
function createEngine(raw){
 const data=validateData(raw),{nodes,edges,hospitals,demand}=data;
 const byId=Object.fromEntries(nodes.map(n=>[n.id,n])),adj=Object.create(null);
 nodes.forEach(n=>adj[n.id]=[]);edges.forEach(e=>{adj[e.a].push([e.b,e]);adj[e.b].push([e.a,e]);});
 function analyze(closed=new Set(),offline=new Set()){
  const dist=Object.create(null),next=Object.create(null),via=Object.create(null),hospital=Object.create(null),q=new Heap();
  nodes.forEach(n=>dist[n.id]=Infinity);
  for(const h of hospitals){if(!offline.has(h.id)&&dist[h.node]!==0){dist[h.node]=0;hospital[h.node]=h.id;q.push([0,h.node]);}}
  while(q.size){const [du,u]=q.pop();if(du!==dist[u])continue;for(const [v,e] of adj[u]){if(closed.has(e.id))continue;const candidate=du+e.weight;if(candidate<dist[v]){dist[v]=candidate;next[v]=u;via[v]=e.id;hospital[v]=hospital[u];q.push([candidate,v]);}}}
  const reachable=demand.filter(n=>Number.isFinite(dist[n.node]));
  return {dist,next,via,hospital,count:reachable.length,isolated:demand.length-reachable.length,population:reachable.reduce((s,n)=>s+n.population,0),avg:reachable.length?reachable.reduce((s,n)=>s+dist[n.node],0)/reachable.length:null};
 }
 function route(nodeId,a){if(!Number.isFinite(a.dist[nodeId]))return null;const path=[nodeId],roads=[];let u=nodeId;while(a.next[u]!==undefined){roads.push(a.via[u]);u=a.next[u];path.push(u);}return {nodes:path,edges:roads,hospital:a.hospital[nodeId],distance:a.dist[nodeId]};}
 function rankRepairs(closed,offline=new Set(),objective='areas'){
  const base=analyze(closed,offline);
  return [...closed].map(id=>{const test=new Set(closed);test.delete(id);const after=analyze(test,offline);const saving=demand.reduce((s,n)=>s+(Number.isFinite(base.dist[n.node])?Math.max(0,base.dist[n.node]-after.dist[n.node]):0),0);return {id,gain:after.count-base.count,people:after.population-base.population,saving,after};}).sort((a,b)=>(objective==='population'?b.people-a.people:b.gain-a.gain)||b.gain-a.gain||b.saving-a.saving||a.id-b.id);
 }
 function validateScenario(raw){
  if(!raw||raw.schema!=='rescuemesh-scenario/v2'||raw.dataset_id!==data.dataset_id)fail('Scenario belongs to another dataset/version. Export a new scenario for this OSM dataset.');
  if(!Array.isArray(raw.closed)||raw.closed.some(id=>!Number.isInteger(id)||!edges[id]))fail('Invalid closed road IDs.');
  if(!Array.isArray(raw.offline)||raw.offline.some(id=>!hospitals.some(h=>h.id===id)))fail('Invalid hospital IDs.');
  if(!['areas','population'].includes(raw.objective))fail('Invalid repair priority.');
  return {closed:[...new Set(raw.closed)],offline:[...new Set(raw.offline)],objective:raw.objective};
 }
 return {data,nodes,edges,hospitals,demand,byId,analyze,route,rankRepairs,validateScenario,totalPopulation:demand.reduce((s,n)=>s+n.population,0)};
}
const api={validateData,createEngine};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RescueDataEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
