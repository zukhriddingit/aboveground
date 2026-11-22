// Exercise the embedded worker exactly as the disk page does when headless Chrome
// is unavailable. Render named views, all seasons and events, and the orbit.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const canvasModule = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const {Canvas, Path2D, DOMMatrix} = require(canvasModule);
const source = fs.readFileSync(path.resolve(__dirname,'../../../../frontend/public/pocket/bu-central.html'),'utf8');
Object.assign(global,{self:{PHONE_PROFILE:false,PAGE_SEARCH:''},OffscreenCanvas:Canvas,Path2D,DOMMatrix});
const scripts=[...source.matchAll(/<script type="text\/plain" id="([^"]+)">([\s\S]*?)<\/script>/g)];
const errors=[];
const report=console.error;
console.error=(...args)=>{errors.push(args.join(' '));report(...args)};
const makeEngine=new Function(scripts.map(m=>m[2]).join('\n')+
 '\nreturn {renderFrame,city:CITY,scene:SCENE,models,props:()=>festivalParts.length,standable,inRings,carPosition};');
const engine=makeEngine();
assert.equal(errors.length,0);
assert.equal(engine.scene.boats.length,1);
assert.ok(engine.scene.boats.every(b=>engine.inRings([b.x,b.y],engine.scene.water)));
for(const k of [0,1]){
  assert.equal(engine.carPosition(1,k),engine.carPosition(3,k),'Dwell at the platform');
  assert.notEqual(engine.carPosition(1,k),engine.carPosition(26,k),'Depart from the platform');
}
const cameras={...engine.city.cameras,...Object.fromEntries(engine.city.views.map(v=>[v.id,v.camera]))};
cameras.seal={x:88.4,y:-59.9,z:2,yaw:-94,pitch:30,zoom:4.4};
cameras.stalls={x:-40.7,y:8.7,z:2.5,yaw:-64,pitch:30,zoom:3.6};
for(const yaw of [0,60,120,180,240,300])cameras['yaw'+yaw]={...cameras.iso,yaw};
const cases=process.argv.slice(2);
if(!cases.length){
  for(const s of [...engine.city.seasons,...engine.city.occasions])cases.push(s.id+'/iso',s.id+'/bird');
  for(const yaw of [0,60,120,180,240,300])cases.push('summer/yaw'+yaw);
  for(const v of engine.city.views)cases.push('summer/'+v.id);
  for(const v of ['platform','chapel','mugar','union'])cases.push('summer/'+v+'/4');
  cases.push('commencement/chapel','commencement/seal','market/union','market/stalls','winter/platform','spring/platform');
}
const shots=path.resolve(__dirname,'../shots');
fs.mkdirSync(shots,{recursive:true});
for(const test of cases){
  const [season,view,zoom]=test.split('/'),camera={...cameras[view]};
  if(zoom)camera.zoom=engine.city.cameras.iso.zoom*Number(zoom);
  const m={width:1320,height:875,dpr:1,time:4.7,finish:'wash',wobble:0,season,camera};
  const {bitmap}=engine.renderFrame(m);
  assert.equal(errors.length,0);
  const expectedParts=6+({market:24,commencement:17}[season]||0);
  assert.equal(engine.props(),expectedParts,test+' has the expected platform riders, event crowds and stalls');
  const out=new Canvas(m.width,m.height),ctx=out.getContext('2d');
  ctx.fillStyle='#f6f2e8';ctx.fillRect(0,0,m.width,m.height);ctx.drawImage(bitmap,0,0);
  fs.writeFileSync(path.join(shots,'bu-central-'+test.replaceAll('/','-')+'.png'),out.toBuffer('image/png'));
}
// Exercise a cached stationary view and a moving camera on both worker profiles.
for(const mobile of [false,true]){
  self.PHONE_PROFILE=mobile;
  const worker=mobile?makeEngine():engine;
  const m={width:mobile?390:940,height:mobile?650:620,dpr:1,finish:'wash',season:'summer',wobble:0};
  for(let frame=0;frame<10;frame++){
    const camera={...cameras.iso,yaw:cameras.iso.yaw+Math.max(0,frame-3)*1.2};
    const result=worker.renderFrame({...m,time:frame*.13,camera});
    assert.ok(Number.isFinite(result.angle)&&result.scale>0);
    assert.equal(result.bitmap.width,m.width);
  }
}
assert.equal(errors.length,0);
console.log('Rendered',cases.length,'inspection images and 20 animation frames;',engine.models.length,'static models;',errors.length,'renderer errors.');
