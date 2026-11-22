// Disk-only fallback for hosts where Chrome's debugging port cannot open.
// Uses exactly the scripts embedded in the delivered HTML and the kit's renderFrame.
const fs=require('node:fs');
const path=require('node:path');
const { performance }=require('node:perf_hooks');
const { Canvas, Path2D }=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'../../../..');
const page=fs.readFileSync(path.join(root,'frontend/public/pocket/kenmore.html'),'utf8');
function script(id){
  const match=page.match(new RegExp('<script[^>]+id="'+id+'">([\\s\\S]*?)</script>'));
  if(!match)throw Error('Missing embedded script '+id);
  return match[1];
}
const kit=['projection','models','streetFigures','data','landmarks','city','foliage','painter'].map(script).join('\n');
const city=JSON.parse(script('cityData'));
const shots=path.resolve(__dirname,'../shots');
fs.mkdirSync(shots,{recursive:true});
function engine(phone){
  const strictConsole={...console,error:(...args)=>{throw new Error(args.join(' '))}};
  return new Function('self','OffscreenCanvas','Path2D','console',kit+
    '\nreturn {draw:renderFrame,counts:()=>[...models].length,extra:CITY_EXTRA,active:()=>SEASON.id,'+
    'traffic:t=>TRAFFIC.to(t),safe:standable,roadOpen:roadOpen};')(
      {PHONE_PROFILE:phone,PAGE_SEARCH:''},Canvas,Path2D,strictConsole);
}
const e=engine(false);
const iso=city.cameras.iso,bird={...iso,yaw:iso.yaw-5,pitch:72,zoom:iso.zoom*.95,x:0,y:0,z:4,...city.cameras.bird};
function draw(name,season,camera,output=true,t=13,renderer=e,phone=false) {
  const width=phone?390:1050,height=phone?494:705;
  const frame=renderer.draw({width,height,dpr:1,camera,time:t,season,wobble:0,finish:'wash'});
  if(output){
    const paper=new Canvas(width,height),g=paper.getContext('2d');
    g.fillStyle='#faf7ed';g.fillRect(0,0,width,height);g.drawImage(frame.bitmap,0,0);
    fs.writeFileSync(path.join(shots,name+'.png'),paper.toBuffer('image/png'));
  }
  if(renderer.active()!==season||renderer.traffic(t).some(a=>a.kind==='ped'&&!renderer.safe(...a.p)))throw Error('Street simulation '+name);
}
for(const season of [...city.seasons,...city.occasions])for(const [id,c] of Object.entries({iso,bird})){
  draw(season.id+'-'+id,season.id,c);
}
for(const yaw of [-150,-90,-30,30,90,150])draw('yaw'+yaw,'summer',{...iso,yaw});
for(const view of city.views)draw(view.id,'summer',view.camera);
const cam=id=>city.views.find(v=>v.id===id).camera;
draw('sign-night','night',cam('sign'));
draw('sign-reverse','summer',{...cam('sign'),yaw:35});
draw('canopy-overhead','summer',{...cam('busway'),pitch:70,yaw:119});
draw('hotel-reverse','summer',{...cam('hotel'),yaw:-72,pitch:37});
draw('chabad-house','summer',{yaw:-69,pitch:26,x:53,y:28,z:5.2,zoom:4.5});
draw('fan-walk','gameday',{...cam('hotel'),x:-76,y:-30,z:2,zoom:3.2});
draw('race-course','marathon',{yaw:64,pitch:34,x:-88,y:-15,z:1.4,zoom:3.15});
draw('mobile','spring',iso,true,6,engine(true),true);
const timings=[];
for(let n=0;n<12;n++){
  const start=performance.now();draw('orbit','summer',{...iso,yaw:iso.yaw+.65*n},false,15+n*.1);timings.push(performance.now()-start);
}
console.log('Rendered all seven scene states, six yaws, overheads, detail views and a mobile frame.');
console.log('Models:',e.counts(),'median uncached desktop orbit frame (ms):',timings.sort((a,b)=>a-b)[6].toFixed(1));
