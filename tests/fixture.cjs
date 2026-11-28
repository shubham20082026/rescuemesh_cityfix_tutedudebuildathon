// Synthetic test fixture only; never used as Bengaluru data.
function fixture(){
 const nodes=Array.from({length:8},(_,i)=>({id:String(i),lat:0,lon:i/100,name:'Test junction',population:0}));
 const pairs=[[0,1],[1,2],[0,3],[3,4],[4,5],[5,6],[6,7],[2,7],[1,4]];
 return {schema:'rescuemesh-data/v2',status:'ready',dataset_id:'TEST-ONLY',nodes,
 edges:pairs.map(([a,b],id)=>({id,a:String(a),b:String(b),weight:100+id*13,geometry:[[0,a/100],[0,b/100]]})),
 hospitals:Array.from({length:8},(_,i)=>({id:'H'+i,node:i<4?'0':'7',name:'Test hospital '+i,lat:0,lon:0,snap_m:0,source_url:'https://www.openstreetmap.org/node/'+(i+1)})),
 demand:nodes.map((n,i)=>({id:'D'+i,node:n.id,name:'Test locality '+i,lat:n.lat,lon:n.lon,population:(i+1)*100,snap_m:0,source_url:'https://www.openstreetmap.org/node/'+(i+21)}))};
}
module.exports={fixture};
