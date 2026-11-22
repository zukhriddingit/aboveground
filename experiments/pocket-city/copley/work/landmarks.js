// Copley Square. Coordinates are metres in the prepared, street-aligned plate.
// Stand-alone geometry is drawn with the Pocket City kit. See sources.md for plans and views.
const FP = id => ccw(findBuilding(id).ring);
const CM = {stone:'#c6b3a3', lintel:'#e0d0ba', iron:'#273e39', glass:'#99bbbc',
  tile:'#a75e46', ash:'#b6a18b', red:'#995d4d', cream:'#dfc49e', copper:'#68948c'};

// The OSM park area includes both grass and hardscape. The public landscape
// plan puts the event court on Dartmouth. Keep the surveyed tree positions.
const eventCourt=[[76.8,-93.6],[91.5,-93.6],[115.8,-85.0],[120,-83.4],
  [120,-61.7],[96.2,-61.7],[86.0,-53.8],[81.4,-43.2],[76.8,-45.4]];
SCENE.walk.push([eventCourt]);
// The extract also contains level -1 fare machines. Draw only the surface
// parking meters here; the station tickets are downstairs behind the doors.
const parkingMeters=SCENE.furniture.filter(f=>f.k==='vending' && f.y>30);
SCENE.furniture=SCENE.furniture.filter(f=>f.k!=='vending');
function along(a,b,t) { return a.map((v,i)=>v+(b[i]-v)*t); }
function ringScale(r,c,k) { return r.map(p=>along(c,p,k)); }
function trimRing(r,z,colour,width) {
  return r.map((p,i)=>edge([...p,z],[...r[(i+1)%r.length],z],colour,width)).join('');
}
// For each visible face the painter works in horizontal metres and height above ground.
function solid(r,base,top,colour,paint,cap=colour) {
  let ink='';
  for(let i=0;i<r.length;i++) {
    const a=r[i],b=r[(i+1)%r.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(len<.03) continue;
    const ux=(b[0]-a[0])/len,uy=(b[1]-a[1])/len,n=[uy,-ux,0];
    if(!vis(n)) continue;
    const at=(u,z)=>[a[0]+ux*u,a[1]+uy*u,z];
    ink+=shape([at(0,base),at(len,base),at(len,top),at(0,top)],tone(n,soft(colour)),.58);
    if(paint) ink+=paint(at,len,i,n);
  }
  return ink+shape(atZ(r,top),cap,.5);
}
function panel(at,x,z,w,h,col) {
  return shape([at(x,z),at(x+w,z),at(x+w,z+h),at(x,z+h)],col,0);
}
function archFace(at,x,bottom,shoulder,r,point,col) {
  const rise=point?r*1.53:r;
  const outline=[at(x-r,bottom),at(x+r,bottom)];
  for(let k=0;k<=12;k++) {
    const t=k*Math.PI/12;
    outline.push(at(x+r*Math.cos(t),shoulder+rise*(point?Math.sqrt(Math.max(0,4-(1+Math.abs(Math.cos(t)))**2)/3):Math.sin(t))));
  }
  return shape(outline,col,.28);
}
function windowArch(at,x,bottom,shoulder,r,point=false,glass='#61767a',stone=CM.lintel) {
  let s=archFace(at,x,bottom-.12,shoulder,r+.16,point,stone)+archFace(at,x,bottom,shoulder,r,point,glass);
  s+=edge(at(x,bottom),at(x,shoulder+r*(point?1.45:1)),stone,.105);
  s+=edge(at(x-r,shoulder),at(x+r,shoulder),stone,.10);
  if(UPX<.50) for(const k of [-.55,.55]) s+=edge(at(x+r*k,bottom),at(x+r*k,shoulder+r*.70),stone,.06);
  return s;
}
function discOn(at,x,z,r,c) {
  return shape(Array.from({length:16},(_,i)=>at(x+r*Math.cos(i*Math.PI/8),z+r*Math.sin(i*Math.PI/8))),c,.28);
}
function compound(parts) {
  const fp=hull(parts.flatMap(p=>p.fp));
  return obj(fp,Math.max(...parts.map(p=>p.h)),()=>planOrder(parts.map(p=>({fp:p.fp,z1:p.h,svg:p.draw()}))));
}
function boxModel(r,lo,hi,col,dec,cap) { return obj(r,hi,()=>solid(r,lo,hi,col,dec,cap)); }
function library() {
  // Dartmouth (east) is the first outside edge. Outer corners and court corners
  // are taken in corresponding order from relation 63755's surveyed roof parts.
  const outer=[[33.85,-107.35],[34.11,-38.07],[-36.13,-37.88],[-34.53,-108.07]];
  const court=[[8.53,-94.70],[7.66,-52.12],[-22.91,-52.60],[-22.04,-95.19]];
  const wings=outer.map((a,i)=>{
    const j=(i+1)%4,b=outer[j],p=court[i],q=court[j],fp=ccw([a,b,q,p]);
    // A hipped perimeter roof rises from the street and then falls much more steeply into the court.
    const r0=[a,b,q,p],ridge0=along(a,p,.65),ridge1=along(b,q,.65);
    return obj(fp,24,()=>{
      const front=(at,w,side)=>{
        if(side===1||side===3) return '';
        const exterior=side===0, count=exterior?13:Math.round(w/3.1);
        let s='';
        for(const z of (exterior?[.48,1.15,6.8,7.2,15.6,17.35]:[.42,5.4,12,17.5]))
          s+=panel(at,0,z,w,z===17.35?.44:.17,CM.lintel);
        for(let k=0;k<count;k++) {
          const step=w/count,x=(k+.5)*step;
          if(!exterior) {
            s+=windowArch(at,x,.38,3.23,step*.39,false,'#746f65');
            s+=panel(at,x-.64,8,1.28,2.2,'#647778');
            continue;
          }
          // Tall paired lights have stone tracery within a common round arch.
          s+=archFace(at,x,7.68,12.52,step*.382,false,CM.lintel);
          s+=archFace(at,x,7.8,12.50,step*.34,false,'#8e8277');
          for(const offset of [-.165,.165])
            s+=windowArch(at,x+step*offset,7.95,12.48,step*.15,false,'#758a8a','#c9bcaa');
          s+=discOn(at,x,13.82,.29,'#687d80');
          if(i===0 && k>=5 && k<=7) {
            s+=archFace(at,x,.64,3.84,step*.46,false,CM.lintel);
            s+=windowArch(at,x,.8,3.78,step*.385,false,'#504946','#a99680');
          } else {
            s+=panel(at,x-.78,2.1,1.56,1.93,'#928375');
            s+=panel(at,x-.60,2.2,1.20,1.62,'#6a7775');
          }
          if(k<count-1) s+=discOn(at,x+step/2,14.2,.42,'#b09b83');
        }
        if(exterior) {
          s+=panel(at,0,17.62,w,.38,'#78897e');
          for(let z=1.7;z<6.7;z+=1.06){
            s+=panel(at,0,z,w,.034,'#ac998a');
            if(UPX<.33) for(let u=(Math.round(z)%2)*1.42;u<w;u+=3.06)
              s+=panel(at,u,z,.035,.91,'#b29e8d');
          }
        }
        // Dentils below the wide projecting cornice.
        if(UPX<.44) for(let x=.35;x<w-.2;x+=.86) s+=panel(at,x,16.86,.31,.38,'#b19b85');
        return s;
      };
      let s=solid(r0,0,18,CM.stone,front,CM.lintel);
      for(const [lowA,lowB,highB,highA] of [[a,b,ridge1,ridge0],[q,p,ridge0,ridge1]]) {
        const pts=[[...lowA,18.1],[...lowB,18.1],[...highB,24],[...highA,24]];
        const normal=vNewell(pts);
        if(!vis(normal))continue;
        s+=shape(pts,SEASON.snow?'#e8e2d7':tone(normal,soft(CM.tile)),.54);
        if(!SEASON.snow) s+=sheetInk(pts,'pantile',norm(sub(pts[1],pts[0])),norm(sub(pts[3],pts[0])));
      }
      return s+edge([...ridge0,24],[...ridge1,24],SEASON.snow?'#e5dfd3':'#ba8061',.15);
    });
  });
  // The Johnson wing has a broad flat centre, pink granite piers and a glazed entrance.
  const modern=FP('w241925767'), west=[[-112.63,-107.83],[-43.97,-107.75],[-42.83,-37.79],[-112.5,-38.02]];
  const johnson=obj(west,24,()=>{
    let s=solid(west,0,21.4,'#b49c8e',(at,w)=>{
      let a=panel(at,0,.4,w,5.7,'#7e9598');
      for(let x=.3;x<w-.4;x+=w/7){
        a+=panel(at,x,.2,1.23,20.8,'#cab4a2');
        a+=panel(at,x+1.6,8.1,w/7-2.9,10.25,'#9c8d88');
        a+=panel(at,x+1.95,8.42,w/7-3.6,9.55,'#829397');
      }
      return a;
    });
    const up=modern.map(p=>[...p,24]);
    // The mapped flat top is slightly skewed relative to its four granite parapets.
    const inner=west.map(p=>up.reduce((a,b)=>Math.hypot(b[0]-p[0],b[1]-p[1])<Math.hypot(a[0]-p[0],a[1]-p[1])?b:a));
    s+=loft(atZ(west,21.4),inner,n=>tone(n,soft('#a59c91')))+shape(inner,SEASON.snow?'#e9e5dc':'#aeaaa0',.65);
    return s;
  });
  const connector=boxModel(FP('w241925748'),0,18,'#829a9c',null,'#aaaa9f');
  const stair=rect(36.45,-72.62,4.75,21.8);
  const steps=obj(stair,1.35,()=>{
    let s='';for(let i=0;i<7;i++) {
      const x=38.65-i*.65; s+=solid(rect(x,-72.62,.65,21.8),0,.18*(i+1),'#c1aea1');
    }
    return s;
  });
  const bronzes=[-84.9,-60.3].map(y=>{
    const x=35.5,r=rect(x,y,2.55,2.75);
    return obj(r,4.4,()=>{
      let g=solid(r,0,1.16,'#c4b2a1');
      const foot=rect(x+.15,y,1.45,1.32),lap=rect(x+.08,y,1.30,1.30),shoulders=rect(x-.35,y,.63,.96);
      g+=loft(atZ(foot,1.16),atZ(lap,2.29),n=>tone(n,soft('#5e6d60')))+shape(atZ(lap,2.29),'#70796b',.4);
      g+=loft(atZ(lap,2.29),atZ(shoulders,3.5),n=>tone(n,soft('#59695c')))+shape(atZ(shoulders,3.5),'#657665',.4);
      return g+ball([x-.28,y,3.79],.34,soft('#607263'));
    });
  });
  // Give each wing its own depth footprint: the surveyed courtyard trees
  // and pool must sort behind the near roof but in front of the far arcade.
  return [...wings,johnson,connector,steps,...bronzes];
}

function pitchedHall(x,y,l,w,eave,rise,col,axis=[1,0],paint,roof='#746761') {
  const at=(u,v)=>[x+u*axis[0]-v*axis[1],y+u*axis[1]+v*axis[0]];
  const r=ccw([at(-l/2,-w/2),at(l/2,-w/2),at(l/2,w/2),at(-l/2,w/2)]);
  const cap=roofOver({c:[x,y],ax:axis,L:l,W:w},eave,{roof:'gabled',rise,roofColour:roof,roofTex:'slate',wall:col,eaves:.18});
  return obj(r,eave+rise,()=>solid(r,0,eave,col,paint)+cap());
}
function lancets(at,w) {
  let s='';
  for(const h of [2.7,6.3,10.3,12.35]) s+=panel(at,0,h,w,.20,CM.cream);
  const n=Math.max(1,Math.round(w/4.3));
  for(let i=0;i<n;i++) {
    const x=(i+.5)*w/n,r=Math.min(1.36,w/n*.32);
    s+=windowArch(at,x,4.2,8.65,r,true,'#58636e',CM.cream);
    if(w/n>3) s+=discOn(at,x,9.18,r*.30,'#a88271');
  }
  return s;
}
function campanile() {
  const r=FP('w815753669'),c=findBuilding('w815753669').obb.c;
  const rim=ringScale(r,c,1.10), spire=ringScale(r,c,.92);
  return obj(rim,70.1,()=>{
    let s=solid(r,0,41,'#aa907c',(at,w)=>{
      let g='';
      for(const x of [.15,w-.61]) g+=panel(at,x,1,.46,39.9,'#baa28a');
      for(const z of [3,11.5,19.6,25.2,32.9,39.7])g+=panel(at,0,z,w,.32,CM.cream);
      for(const z of [11.9,25.8,34]) for(const x of [w*.40,w*.60]) g+=windowArch(at,x,z,z+3.7,.28,true,'#574c4e','#c2a986');
      return g;
    });
    s+=solid(rim,41,41.8,'#ccb398');
    // Open loggia: four corner piers and paired columns on every side.
    // Keep actual sky between them when the viewer looks through the belfry.
    const loggia=[];
    r.forEach((a,i)=>{
      const b=r[(i+1)%4],w=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const foot=rect(...a,.84,.84);
      loggia.push({fp:foot,z1:51.2,svg:solid(foot,41.8,51.2,'#a78c76')});
      for(const u of [1/3,2/3]){
        const p=along(a,b,u);
        loggia.push({fp:rect(...p,.48,.48),z1:51.2,svg:stick([...p,41.9],[...p,50.6],.20,'#b7a58e')+
          solid(rect(...p,.60,.60),49.7,50.3,'#c8b49d')});
      }
      const at=(u,z)=>[a[0]+(b[0]-a[0])*u/w,a[1]+(b[1]-a[1])*u/w,z];
      let head='';
      for(let j=0;j<3;j++){
        const half=w/6,x=(j+.5)*w/3;
        const soffit=Array.from({length:11},(_,k)=>{
          const u=k/5-1;
          return at(x+half*u,49.6+half*Math.sqrt(Math.max(0,4-(1+Math.abs(u))**2)));
        });
        head+=shape([...soffit,at(x+half,52.3),at(x-half,52.3)],'#b9a58c',.36);
      }
      loggia.push({fp:[a,b],z1:52.3,svg:head});
    });
    s+=planOrder(loggia)+solid(r,52.3,53.5,'#b79e82',(at,w)=>{
      let g=panel(at,0,52.55,w,.24,'#846c5c');
      for(let x=.23;x<w-.12;x+=.65)g+=panel(at,x,52.97,.31,.22,'#dbc8aa');return g;
    });
    s+=solid(rim,53.5,54.1,'#d4bda0');
    s+=solid(spire,54.1,55.2,'#a77d61');
    s+=peak(spire,55.2,[...c,69.35],SEASON.snow?'#dedbd3':'#798a84');
    for(const p of r) s+=peak(polygon(...p,.51,4,Math.PI/4),54.1,[...p,57.6],CM.cream);
    return s+stick([...c,69.1],[...c,70.1],.09,'#7c6a51');
  });
}
function crossingLantern() {
  const c=findBuilding('w241927144').obb.c;
  const circle=r=>polygon(...c,r,8,Math.PI/8), rim=circle(4.75);
  return obj(rim,41,()=>{
    let s=solid(rim,19.3,24.3,'#9b806b');
    s+=solid(circle(4.3),24.3,30.6,CM.copper,(at,w)=>windowArch(at,w/2,24.9,28.15,w*.31,true,'#616e68','#9cb1a0'));
    const radii=[[4.72,30.6],[4.38,31.8],[3.65,34.6],[2.42,36.3],[1.25,37.1]];
    for(let i=1;i<radii.length;i++){
      const [a,z]=radii[i-1],[b,h]=radii[i];
      const bottom=circle(a),top=circle(b);
      s+=loft(atZ(bottom,z),atZ(top,h),n=>tone(n,soft(CM.copper)));
      for(let j=0;j<8;j++)if(vis([bottom[j][0]-c[0],bottom[j][1]-c[1],0]))
        s+=edge([...bottom[j],z],[...top[j],h],'#8ba99c',.12);
    }
    s+=shape(atZ(circle(1.25),37.1),CM.copper,.4)+solid(circle(1.06),37.1,38.1,'#72968c');
    s+=peak(circle(1.25),38.1,[...c,39.5],CM.copper);
    for(const [x,y] of circle(2.45)){
      const petal=rect(x,y,.42,.42);
      s+=peak(petal,35.5,[x,y,38.2],'#82a295');
    }
    return s+stick([...c,39.4],[...c,40.9],.08,'#926f40');
  });
}
function oldSouth() {
  const parts=[campanile(),crossingLantern()];
  parts.push(pitchedHall(12.9,13.42,16.35,17.7,14,8,CM.ash,[1,0],lancets));
  function roseFront(at,w){
    let s='';
    // The Dartmouth gable has a wheel above grouped lancets. Its doors are
    // in the separate lower portico on the Boylston side.
    const cx=w/2,cz=11.30;
    for(const z of [.55,2.43,7.92,8.20,13.65])s+=panel(at,0,z,w,.18,CM.cream);
    for(const off of [-2.36,0,2.36]){
      s+=windowArch(at,cx+off,2.64,6.44,1.02,true,'#778587',CM.cream);
      s+=discOn(at,cx+off,6.6,.28,'#89989a');
    }
    s+=discOn(at,cx,cz,2.70,'#957b66')+discOn(at,cx,cz,2.43,CM.cream)+discOn(at,cx,cz,1.98,'#8c8d81');
    for(let k=0;k<7;k++){
      const a=k*Math.PI*2/7;s+=discOn(at,cx+1.18*Math.cos(a),cz+1.18*Math.sin(a),.62,'#617b80');
    }
    return s+discOn(at,cx,cz,.63,CM.cream)+discOn(at,cx,cz,.45,'#829295');
  }
  parts.push(pitchedHall(29.75,13.48,26.7,17.5,14.2,7.8,CM.ash,[0,1],
    (at,w,i)=>i===3||i===1?roseFront(at,w):lancets(at,w)));
  parts.push(pitchedHall(41.0,13.50,5.25,19.1,14.1,8.1,CM.ash,[1,0],
    (at,w,i)=>i===1?roseFront(at,w):lancets(at,w)));

  const porch=FP('w815753667');
  parts.push(boxModel(porch,0,8.25,CM.ash,(at,w)=>{
    const n=w>6?3:1,bay=w/n;
    let p=panel(at,0,5.53,w,.32,CM.cream);
    for(let i=0;i<n;i++){
      const x=(i+.5)*bay,r=bay*.385,shoulder=3.25;
      p+=archFace(at,x,.18,shoulder,r+.20,true,'#dfcaab');
      p+=archFace(at,x,.18,shoulder,r,true,'#645b50');
      // Alternating voussoirs and bands on the little paired stone columns.
      for(const side of [-1,1]){
        for(let k=0;k<4;k++)p+=panel(at,x+side*(r+.11)-.11,.42+.72*k,.22,.33,'#96725f');
        for(let j=0;j<5;j+=2){
          const pt=(u,rr)=>at(x+side*rr*u,shoulder+rr*Math.sqrt(4-(1+u)**2));
          const u0=j/5,u1=(j+1)/5;
          p+=shape([pt(u0,r),pt(u1,r),pt(u1,r+.20),pt(u0,r+.20)],'#90715f',0);
        }
      }
      p+=windowArch(at,x,5.91,6.98,Math.min(.7,r*.61),true,'#8e9c9b',CM.cream);
    }
    return p;
  },'#847a6d'));
  // Stone pinnacles frame the rose-window gable. Copper crockets punctuate
  // the lantern, separate from the taller, slate-coloured masonry campanile.
  for(const y of [4.45,22.55]){
    const x=43.36,r=rect(x,y,.76,.76);
    parts.push(obj(r,18.8,()=>solid(r,0,16.4,'#a38c77')+
      peak(r,16.4,[x,y,18.7],'#827d70')));
  }
  for(const id of ['w815753661','w815753662','w815753665']) {
    const r=FP(id),h=id==='w815753665'?16:13;
    const mass=block(r,0,h,{facade:'brick',floor:3.6,bay:3,wall:'#a67e69',top:'#77726a',trim:CM.cream});
    parts.push(obj(r,h,()=>mass.draw()));
  }
  return compound(parts);
}

// Small enameled signs and painted street lettering use single-line capitals.
// The glyph axes live in the face plane so letters stay upright when the plate turns.
const copleyLetters={
 A:[[[0,0],[.5,1],[1,0]],[[.2,.43],[.8,.43]]],B:[[[0,0],[0,1],[.70,1],[1,.8],[.70,.52],[0,.52]],[[.70,.52],[1,.3],[.7,0],[0,0]]],
 C:[[[1,.88],[.72,1],[.24,1],[0,.76],[0,.24],[.24,0],[.72,0],[1,.12]]],
 E:[[[1,1],[0,1],[0,0],[1,0]],[[0,.52],[.8,.52]]],F:[[[0,0],[0,1],[1,1]],[[0,.53],[.78,.53]]],
 H:[[[0,0],[0,1]],[[1,0],[1,1]],[[0,.5],[1,.5]]],I:[[[.5,0],[.5,1]]],
 L:[[[0,1],[0,0],[1,0]]],N:[[[0,0],[0,1],[1,0],[1,1]]],
 O:[[[.22,0],[0,.2],[0,.8],[.22,1],[.78,1],[1,.8],[1,.2],[.78,0],[.22,0]]],
 P:[[[0,0],[0,1],[.72,1],[1,.8],[.72,.55],[0,.55]]],
 S:[[[1,.9],[.74,1],[.18,1],[0,.8],[.15,.6],[.82,.41],[1,.22],[.82,0],[.18,0],[0,.13]]],
 T:[[[0,1],[1,1]],[[.5,1],[.5,0]]],U:[[[0,1],[0,.21],[.22,0],[.78,0],[1,.21],[1,1]]],
 Y:[[[0,1],[.5,.5],[1,1]],[[.5,.5],[.5,0]]]
};
function inscription(at,word,width,height,col) {
  const pitch=width/word.length;
  return Array.from(word,(letter,i)=>(copleyLetters[letter]||[]).map(stroke=>{
    const path=stroke.map(([x,y])=>at(-width/2+pitch*(i+.14+x*.72),y*height));
    return '<path d="'+pd(path,false)+'" fill="none" stroke="'+col+'" style="stroke-width:'+f(height*.11)+'" stroke-linecap="round"/>';
  }).join('')).join('');
}
function roundel(x,y,axis) {
  const w=.56, post='#47483e', fp=rect(x,y,1.23,1.23);
  return obj(fp,4.27,()=>{
    const at=(u,z)=>[x+axis[0]*u,y+axis[1]*u,z];
    let s=stick(at(0,.05),at(0,3.81),.084,post);
    s+=discOn(at,0,3.65,w+.055,post)+discOn(at,0,3.65,w,'#f3efdf');
    return s+panel(at,-.34,3.79,.68,.16,'#293332')+panel(at,-.085,3.28,.17,.55,'#293332');
  });
}
function stationEntry(id,ornate=false) {
  const b=findBuilding(id),r=FP(id),{c}=b.obb;
  // Subway thresholds 7490164250, 2446081560 and 2446081564 are centred
  // on the north, south and south short street-facing edges respectively.
  const ax=ornate?[0,1]:[0,-1],ay=[-ax[1],ax[0]];
  const L=ornate?b.obb.W:b.obb.L,W=ornate?b.obb.L:b.obb.W;
  const A=L/2,B=W/2;
  const at=(u,v,z)=>[c[0]+u*ax[0]+v*ay[0],c[1]+u*ax[1]+v*ay[1],z];
  const stroke=(points,col,width)=>'<path d="'+pd(points,false)+'" fill="none" stroke="'+col+'" style="stroke-width:'+f(width)+'" stroke-linejoin="round"/>';
  const beam=(a,b,k=.065,col=CM.iron)=>stick(a,b,k,col,.40);
  const frame=ornate?'#2e4037':'#45554e', height=ornate?3.64:3.38;
  const roofZ=v=>ornate?height+.48*(1-(v/B)**2):height+.10*(v/B);
  const outline=ccw([at(-A-.45,-B-.22,0),at(A+.72,-B-.22,0),at(A+.72,B+.22,0),at(-A-.45,B+.22,0)].map(p=>p.slice(0,2)));
  return obj(outline,ornate?5:4,()=>{
    let s=solid(r,0,.26,'#c4bdb0');
    const well=ccw([at(-A+.2,-B+.20,.27),at(A-.18,-B+.20,.27),at(A-.18,B-.20,.27),at(-A+.2,B-.20,.27)].map(p=>p.slice(0,2)));
    s+=shape(atZ(well,.27),'#585650',.45);
    for(let i=0;i<12;i++){
      const u=A-.28-i*(L-.68)/12, shade=mix('#ac9f8c','#57554e',i/12);
      s+=shape([at(u,-B+.25,.28),at(u,B-.25,.28),at(u-.16,B-.25,.28),at(u-.16,-B+.25,.28)],shade,0);
    }
    const walls=[];
    for(const v of [-B,B]){
      let p=beam(at(-A,v,.92),at(A,v,.92),.065,frame);
      if(!ornate) p+='<g opacity="0.38">'+shape([at(-A,v,.28),at(A,v,.28),at(A,v,height-.22),at(-A,v,height-.22)],'#9bbfc0',.35)+'</g>';
      const bays=ornate?4:5;
      for(let j=0;j<=bays;j++){
        const u=-A+j*L/bays;
        p+=beam(at(u,v,.27),at(u,v,height+.06),ornate?.084:.065,frame);
        if(!ornate||j===bays)continue;
        const step=L/bays,mid=u+step/2;
        if(UPX<.68)for(let k=1;k<5;k++) p+=beam(at(u+k*step/5,v,.48),at(u+k*step/5,v,3.07),.024,frame);
        p+=stroke([at(mid,v,.91),at(u+.12,v,1.71),at(mid,v,2.55),at(u+step-.12,v,1.71),at(mid,v,.91)],frame,.062);
        for(const side of [-1,1]) {
          const scroll=Array.from({length:15},(_,n)=>{
            const angle=n*.45,rad=.23*(1-.72*n/14);
            return at(mid+side*(.21+rad*Math.cos(angle)),v,2.87+rad*Math.sin(angle));
          });
          p+=stroke(scroll,frame,.063);
        }
      }
      p+=beam(at(-A,v,height-.15),at(A,v,height-.15),.11,frame);
      // Signs are plates attached to the ironwork, with original lettering.
      const face=(u,z)=>at(u,v,z);
      p+=panel(face,-L*.37,height-.38,L*.74,.38,'#247e60');
      const signDirection=vis([ay[0],ay[1],0])?-1:1;
      p+=inscription((u,z)=>at(u*signDirection,v,height-.31+z),'COPLEY',Math.min(2.7,L*.62),.215,'#f4ecda');
      walls.push({fp:[at(-A,v,0),at(A,v,0)],z1:height,svg:p});
    }
    const back=(u,z)=>at(-A,u,z);
    walls.push({fp:[at(-A,-B,0),at(-A,B,0)],z1:height,svg:panel(back,-B,.30,W,height-.56,ornate?'#c4ae8b':'#a4bec0')});
    s+=planSort(walls);
    const slices=ornate?8:1,over=ornate?.64:.39;
    for(let i=0;i<slices;i++){
      const a=-B-.13+i*(W+.26)/slices,b=a+(W+.26)/slices;
      s+='<g opacity="'+(ornate?'.92':'.62')+'">'+shape([at(-A-.23,a,roofZ(a)),at(A+over,a,roofZ(a)),at(A+over,b,roofZ(b)),at(-A-.23,b,roofZ(b))],ornate?'#56635b':'#bad3d0',.28)+'</g>';
    }
    for(let j=0;j<=4;j++){
      const u=-A-.23+j*(L+.23+over)/4;
      s+=stroke(Array.from({length:slices+1},(_,i)=>{const v=-B-.13+i*(W+.26)/slices;return at(u,v,roofZ(v)+.025)}),frame,.09);
    }
    if(ornate){
      for(const u of [-A,A]) for(const v of [-B,B]){
        s+=beam(at(u,v,height),at(u,v,4.66),.065,frame);
        s+=ball(at(u,v,4.72),.11,soft(frame));
        for(const sign of [-1,1]) s+=stroke([at(u,v,4.35),at(u+sign*.19,v,4.56),at(u+sign*.23,v,4.72),at(u+sign*.08,v,4.61)],frame,.065);
      }
      // Fanlight and projecting marquise above the stair, with side scroll brackets.
      for(const v of [-B,B]){
        s+=stroke([at(A-.32,v,2.74),at(A+.23,v,2.93),at(A+.54,v,3.18),at(A+.68,v,3.44)],frame,.10);
        for(let j=0;j<5;j++){
          const u=-A+.18+j*(L-.36)/4;
          s+=stroke(Array.from({length:15},(_,k)=>at(u+.21*Math.cos(k*Math.PI/7),v,3.85+.23*Math.sin(k*Math.PI/7))),frame,.06);
        }
      }
      const fr=(u,z)=>at(A+.03,u,z);
      s+=panel(fr,-B,2.87,W,.37,frame)+inscription((u,z)=>fr(u,2.95+z),'IN',.58,.22,'#cebd9e');
    }else{
      const fr=(u,z)=>at(A+.12,u,z);
      s+=panel(fr,-B,2.73,W,.46,'#39765a')+inscription((u,z)=>fr(u,2.84+z),'COPLEY',Math.min(W-.31,2.50),.24,'#f4edda');
    }
    return s;
  });
}

function bostix() {
  const b=findBuilding('w827790872'),c=b.obb.c,r=polygon(...c,3.12,16),e=polygon(...c,4.64,16);
  const collar=polygon(...c,3.36,16);
  return obj(e,6.25,()=>{
    let s=solid(r,0,2.95,'#8e5445',(at,w,i)=>{
      let p=panel(at,.13,.56,w-.26,1.92,i%3?'#6f9093':'#d7aa67');
      if(i%3!==0)p+=panel(at,.21,.65,w-.42,.84,i%2?'#b76150':'#547382');
      return p+panel(at,.06,2.55,w-.12,.18,'#dbc3a4');
    });
    s+=loft(atZ(r,2.94),atZ(collar,3.66),n=>tone(n,soft('#c5bda8')))+
      loft(atZ(collar,3.66),atZ(e,4.42),n=>tone(n,soft('#c5bda8')));
    for(let i=0;i<r.length;i++){
      const j=(i+1)%r.length;
      if(vis([r[i][0]-c[0],r[i][1]-c[1],0])){
        s+=edge([...r[i],2.94],[...e[j],4.42],'#715e4e',.077);
        s+=edge([...r[j],2.94],[...e[i],4.42],'#715e4e',.077);
      }
    }
    s+=shape(atZ(e,4.42),'#708a80',.48)+peak(e,4.42,[...c,6.04],SEASON.snow?'#e2dfd2':'#718d80');
    for(const h of [.32,.65,.98])s+=trimRing(ringScale(e,c,1-h/1.62),4.42+h,'#556e65',.07);
    return s+stick([...c,5.98],[...c,6.20],.07,'#927857');
  });
}
function exeter() {
  const c=findBuilding('w29605327').obb.c;
  const hall=pitchedHall(c[0],c[1]+1.65,32.5,22.5,10.25,8.8,'#a08875',[1,0],(at,w,i)=>{
    const n=i%2?3:5;
    let s=panel(at,0,3.56,w,.24,'#a26d59');
    for(let j=0;j<n;j++)s+=windowArch(at,(j+.5)*w/n,3.96,7.03,Math.min(1.44,w/n*.35),false,'#647477','#c09670');
    return s;
  },'#777b79');
  const front=pitchedHall(c[0],91.88,32.5,2.85,3.35,.92,'#995f4f',[1,0],(at,w)=> {
    let s='';for(let n=0;n<Math.floor(w/2);n++)s+=panel(at,.25+2*n,.55,1.6,2.45,'#9cb3af');return s;
  },'#72958c');
  const gables=[-8.7,8.7].map(dx=>pitchedHall(c[0]+dx,97.15,10.2,8.45,9.85,6.2,'#ae9079',[0,1],(at,w)=>windowArch(at,w/2,4.2,7,1.54,false,'#6c7876','#c7a480'),'#78796c'));
  return compound([hall,front,...gables]);
}
function rowHouse(b,corner=false) {
  const fp=ccw(b.ring),bounds=fp.reduce((v,p)=>[Math.min(v[0],p[0]),Math.max(v[1],p[0]),Math.min(v[2],p[1]),Math.max(v[3],p[1])],[Infinity,-Infinity,Infinity,-Infinity]);
  const [x0,x1,y0,y1]=bounds, north=b.obb.c[1]<75, streetY=north?y1:y0, out=north?1:-1;
  // 277 Dartmouth fronts Dartmouth. The narrow Newbury lots front the east-west street.
  const start=corner?[x0,(y0+y1)/2]:[(x0+x1)/2,streetY],right=corner?[0,-1]:[1,0],front=corner?[-1,0]:[0,out];
  const at=(u,v)=>[start[0]+u*right[0]+v*front[0],start[1]+u*right[1]+v*front[1]];
  const width=corner?y1-y0:x1-x0;
  const st=styleFor(b), levels=b.lv||4,wall=(levels-1)*st.floor,cl=pickOf(st.wall,b.id);
  const firstFace=facades.length;
  const facade=walls(fp,0,wall,{st,b,body:cl}),c=b.obb.c,top=wall+2.92;
  assignShops(firstFace,b,front);
  // Inset the perimeter a metre, keeping the crown flat and the outer slope steep.
  const crown=fp.map(([x,y])=>[x+(c[0]-x)*Math.min(.36,2.2/(x1-x0)),y+(c[1]-y)*Math.min(.32,2.2/(y1-y0))]);
  const core=obj(fp,top,()=>facade()+shape(atZ(fp,wall),CM.lintel,.4)+loft(atZ(fp,wall+.05),atZ(crown,top),n=>tone(n,soft(SEASON.snow?'#e4dfd7':'#657075')))+shape(atZ(crown,top),SEASON.snow?'#e9e2d9':'#8b8983',.5));
  const bw=width*.43,bc=-width*.17,round=hash(b.id)%2===0;
  const bay=ccw([at(bc-bw/2,-.035),...Array.from({length:round?7:4},(_,i)=>{
    const t=Math.PI*i/(round?6:3);return at(bc-bw*.5*Math.cos(t),1.05*Math.sin(t)+.08);
  }),at(bc+bw/2,-.035)]);
  const oriel=boxModel(bay,2.93,wall+.11,cl,(place,w)=>{
    let s='';if(w<.47)return s;
    for(let z=3.43;z<wall-1;z+=st.floor) {
      s+=panel(place,w*.13,z,w*.74,1.75,'#91a5a4')+panel(place,0,z-.16,w,.12,'#c6a38a');
      s+=panel(place,.13*w,z+.87,.74*w,.07,'#e0caac');
    }
    return s;
  },'#896e5e');
  const stepWidth=Math.min(1.7,width*.25),u=width*.27, treads=[];
  for(let i=0;i<5;i++){
    const d=(5-i)*.32;treads.push(boxModel(ccw([at(u-stepWidth/2,d),at(u+stepWidth/2,d),at(u+stepWidth/2,d-.32),at(u-stepWidth/2,d-.32)]),0,(i+1)*.18,'#aa8a72'));
  }
  const dormers=[-.22,.23].map(f=>{
    const p=at(f*width,-.55);
    return {fp:rect(...p,1.08,.92),h:top+.16,draw:()=>{
      const a=(x,z)=>[p[0]+right[0]*x,p[1]+right[1]*x,z];
      return panel(a,-.53,wall+.33,1.06,1.63,'#ccb296')+panel(a,-.40,wall+.45,.80,1.27,'#809598')+shape([a(-.70,wall+1.91),a(.70,wall+1.91),a(0,wall+2.47)],'#c1a58b',.4);
    }};
  });
  return compound([core,oriel,...treads,...dormers]);
}

// Set-back shops on Newbury can be more than seven metres from a mapped
// pavement. Put mapped shop signs on their street frontage, clear of party walls.
function assignShops(first,b,front){
  const shops=b.pois.filter(p=>!['hotel','library','school','artwork','attraction'].includes(p.kind));
  for(const f of facades.slice(first)){
    f.shop=false;
    if(!shops.length||f.cut||dot(f.n,[...front,0])<.84||f.len<3.5)continue;
    const mx=f.start[0]+f.along[0]*f.len/2,my=f.start[1]+f.along[1]*f.len/2;
    const closest=shops.reduce((a,p)=>Math.hypot(p.x-mx,p.y-my)<Math.hypot(a.x-mx,a.y-my)?p:a);
    f.street=true;f.shop=true;f.sign=closest.name;
  }
}
function boylstonShop(b){
  const first=facades.length,model=buildingModel(b);
  assignShops(first,b,[0,-1]);
  return model;
}
function busShelter(id) {
  const b=findBuilding(id),r=FP(id),{c,L,W}=b.obb;
  return obj(r,2.58,()=>{
    let s='';
    for(const p of r)s+=stick([...p,.04],[...p,2.50],.055,'#54615e');
    s+=solid(rect(c[0],c[1]-.19,L-.58,.42),.41,.53,'#aa825f');
    return s+shape(atZ(r,2.53),SEASON.snow?'#e9e4da':'#8da5a1',.55);
  });
}
function liftHouse() {
  const r=FP('w818619759');
  return boxModel(r,0,3.8,'#69847e',(at,w)=>{
    let s=panel(at,.14,.32,w-.28,3.0,'#a1bcc0');
    for(let x=.88;x<w-.25;x+=.85)s+=panel(at,x,.32,.074,3.05,'#52645d');
    return s+panel(at,0,2.83,w,.16,'#326d54');
  },'#7d8d83');
}
const brownstoneIDs=SCENE.buildings.filter(b=>!b.of && !b.cut && b.obb.c[0]<47 &&
  ((b.obb.c[1]>43 && b.obb.c[1]<57)||(b.obb.c[1]>94 && b.obb.c[1]<104)) &&
  b.obb.W>4.8 && b.obb.W<9.6 && !b.famous && b.type!=='construction' && (b.lv||4)<=4).map(b=>b.id);
const boylstonIDs=SCENE.buildings.filter(b=>/^w2419271/.test(b.id) && !b.of && b.obb.c[0]<0 && Math.abs(b.obb.c[1]-12)<5).map(b=>b.id);
const LANDMARKS=[
  ...boylstonIDs.map(id=>({name:'Boylston frontage '+id,ids:[id],build:()=>boylstonShop(findBuilding(id))})),
  {name:'McKim library and Johnson wing',ids:['r63755'],build:library},
  {name:'Old South Church',ids:['r11201377'],build:oldSouth},
  {name:'Copley iron headhouse',ids:['w817061700'],build:()=>[stationEntry('w817061700',true),roundel(2.42,-30.0,[1,0])]},
  {name:'Old South glass headhouse',ids:['w813505803'],build:()=>[stationEntry('w813505803'),roundel(51.8,-3.35,[1,0])]},
  {name:'Dartmouth glass entrance',ids:['w813505804'],build:()=>[stationEntry('w813505804'),roundel(66.60,5.6,[0,1])]},
  {name:'Newbury parking meters',ids:[],build:()=>parkingMeters.map(({x,y})=>{
    const r=rect(x,y,.40,.30);
    return obj(r,1.38,()=>stick([x,y,.04],[x,y,.61],.08,'#626b67')+
      solid(r,.53,1.37,'#63746f',(at,w)=>w>.32?panel(at,.08,.93,w-.16,.20,'#bac8bf'):''));
  })},
  {name:'Copley elevator',ids:['w818619759'],build:liftHouse},
  ...['w818619757','w818619758'].map(id=>({name:'Boylston bus shelter',ids:[id],build:()=>busShelter(id)})),
  {name:'BosTix pavilion',ids:['w827790872'],build:bostix},
  {name:'Exeter Street Theatre',ids:['w29605327'],build:exeter},
  {name:'277 Dartmouth',ids:['w1361403249'],build:()=>rowHouse(findBuilding('w1361403249'),true)},
  ...brownstoneIDs.map(id=>({name:'Newbury row house '+id,ids:[id],build:()=>rowHouse(findBuilding(id))}))
];

const finishPOI=SCENE.pois.find(p=>p.name==='Boston Marathon Finish Line');
const boylstonY=x=>finishPOI.y-(x-finishPOI.x)*.00455;
function finishPaint(){
  const {x,y}=finishPOI;
  const r=rect(x,y,2.3,15.8);
  return obj(r,.04,()=>{
    const faded=SEASON.snow?.68:0;
    const paper=c=>mix(c,'#e5dfd3',faded);
    let s=shape(atZ(r,.02),paper('#dfaf40'),0);
    s+=shape(atZ(rect(x,y,1.71,15.8),.025),paper('#2d5882'),0);
    return s+inscription((u,h)=>[x+.61-h,y+u,.035],'BOSTON',8.8,1.14,paper('#edc24f'));
  });
}
function raceRail(x,y) {
  const fp=rect(x,y,6.15,.72);
  return obj(fp,1.2,()=>{
    let s='';
    for(const xx of [x-2.98,x+2.98]){
      s+=stick([xx,y-.32,.07],[xx,y+.32,.07],.042,'#78847f');
      s+=stick([xx,y,.08],[xx,y,1.12],.038,'#8a9794');
    }
    for(const h of [.20,1.13]) s+=edge([x-3.05,y,h],[x+3.05,y,h],'#8b9691',.095);
    s+=shape([[x-2.90,y,.31],[x+2.90,y,.31],[x+2.90,y,1.02],[x-2.90,y,1.02]],'#466581',.27);
    return s+panel((u,z)=>[x+u,y,z],-2.91,.78,5.82,.12,'#eac15c');
  });
}
function marketStall(x,y,k) {
  const r=rect(x,y,3.75,3.75),t=rect(x,y,1.68,1.68),col=['#e9ddc6','#768b68','#aa6353'][k%3];
  return obj(r,3.15,()=>{
    let s='';for(const p of r)s+=stick([...p,.04],[...p,2.15],.04,'#6f746e');
    s+=solid(rect(x-.55,y,1.04,2.8),.51,.84,'#ac815a',null,'#cba97d');
    for(let i=0;i<4;i++){
      const box=rect(x-.55,y-1+i*.67,.78,.50);
      s+=solid(box,.83,1.05,'#b59369',null,['#a75d41','#a3a557','#c79642','#77915d'][i]);
    }
    s+=loft(atZ(r,2.16),atZ(t,2.97),n=>tone(n,soft(col)))+shape(atZ(t,2.97),col,.48);
    return s+trimRing(r,2.14,col,.16);
  });
}
// The kit builds a fresh street simulation on each season change. Replace the
// race-day feeds once, before their first frame, retaining all unaffected streets.
let raceTraffic, occasionParts, previousScene;
function raceFeeds(){
  return FEEDS.filter((feed,i)=>{
    const p=SCENE.routes[i].p;
    // Boylston runs the full width of this plate. Also omit everyday walking
    // routes that cross the reserved chute between its barricades.
    return p.every((a,j)=>!j||Math.max(a[1],p[j-1][1])< -27.6||Math.min(a[1],p[j-1][1])> -10.9);
  }).map(f=>({...f,walkSpeed:1.12}));
}
function CITY_EXTRA(t) {
  if(SEASON.id==='marathon' && TRAFFIC!==raceTraffic) {
    raceTraffic=streetSimulation(raceFeeds(),PHONE?75:110,210);
    TRAFFIC=raceTraffic;
  }
  if(previousScene!==SEASON){
    previousScene=SEASON;
    occasionParts=[finishPaint()];
    if(SEASON.id==='marathon'){
      for(let x=-113;x<116;x+=6.22) for(const side of [-1,1]){
        const y=boylstonY(x)+side*7.85;
        if(standable(x,y))occasionParts.push(raceRail(x,y));
      }
      for(let i=0;i<44;i++){
        const x=-86+rnd(i+21)*109,y=boylstonY(x)+(i%2?1:-1)*(8.75+rnd(i+72)*1.9);
        if(!standable(x,y))continue;
        const who={...pedDressed(509+i),d:[0,i%2?-1:1],p:[x,y],walked:0};
        occasionParts.push(obj(rect(x,y,.58,.58),2.04,()=>pedestrian(who,0).svg));
      }
    }
    if(SEASON.id==='market'){
      let k=0;
      for(const x of [80.05,96.15]) for(let y=-86;y<=-64;y+=6.85){
        const corners=rect(x,y,3.85,3.85);
        if(corners.every(([xx,yy])=>standable(xx,yy)&&!inRings([xx,yy],SCENE.roads)&&inside([xx,yy],eventCourt)&&!SCENE.trees.some(([tx,ty])=>Math.hypot(tx-xx,ty-yy)<2)))occasionParts.push(marketStall(x,y,k++));
      }
    }
  }
  const parts=occasionParts.map((p,i)=>({...p,draw:()=>stamp('copley-extra'+i,p.draw,p.fp,0,p.h+.2)}));
  if(SEASON.id==='marathon') for(let i=0;i<(PHONE?16:31);i++){
    const start=(i*83.12)%237,s=t*(2.36+rnd(14+i)*1.04)+start,x=-118.5+s%237;
    const y=boylstonY(x)+(rnd(32+i)-.5)*9.42;
    const p=[x,y],who={...pedDressed(i+340),p,d:[1,-.00455],walked:s*1.43};
    parts.push(obj(rect(x,y,.64,.45),2.12,()=>pedestrian(who,t).svg));
  }
  return parts;
}
