// Harvard Square. Local dimensions are in metres and follow the supplied plot.
// OSM supplies the envelopes. The drawings and photographs behind each elevation are in sources.md.
const HS = {brick:'#a15945', stone:'#cfb79a', granite:'#918e83', slate:'#656a6c',
  trim:'#e5d9c3', sash:'#e2dccb', glass:'#788e93', iron:'#36403d', red:'#b73639', copper:'#759586'};
const burialGround = [[-32.11,17.69],[-77.34,-9.15],[-72.8,-17.58],[-89.71,-23.93],[-92.11,-17.93],
  [-116.66,-31.89],[-120,-28.3],[-120,62.28],[-56.35,52.83]];
SCENE.lawns.push({kind:'grass',r:[burialGround]});
// The 2018 existing-conditions sheet gives the pre-renovation island and stepped court.
const historicPlaza = [[9.1,-120],[11.1,-115.5],[14.24,-108.6],[16.25,-100.8],[16.9,-94.3],
  [17.48,-84.2],[18.75,-77.8],[20.1,-76.4],[25.4,-80.25],[30.8,-86.1],[34.1,-89.6],
  [39.3,-95.8],[45.6,-101.7],[50.3,-105.2],[55.2,-109.3],[56.2,-111.0],[55.5,-113.9],
  [53.5,-116.1],[51.3,-120]];
// Mapped paving-stone sidewalks sometimes lie inside the GIS street-width
// buffer. Trace the curb 1.6–2 m out from their surveyed centreline.
const squareSidewalks=[
  [[28.97,-62.9],[33.09,-71.4],[37.29,-76.9],[41.36,-81.4],[50.63,-90.34],
    [60.39,-96.82],[73.89,-102.35],[85.39,-103.07],[120,-102.07],[120,-94.3],[74,-94.3],[45.4,-77.0],[34.5,-61.5]],
  [[-8.91,-15.04],[-7.1,-18.1],[-.92,-36.2],[.61,-42.1],[1.49,-54.63],[-.05,-75.5],
    [-.53,-86.1],[-.76,-93.0],[-1.88,-108.6],[-3.13,-112.0],[-6.12,-114.7],[-10.2,-110.6],[-7.7,-77.0],[-6.3,-43.3],[-14.0,-16.5]]
];
// Three named squares include parkland. Prep treats place=square and
// area:highway=traffic_island as paved. The OSM grass and path rings underneath
// describe these lawns individually, including those in the Old Yard.
SCENE.walk=SCENE.walk.filter(rs=>!rs[0].some(([x,y])=>x>55||y>60||x<0));
SCENE.walk.push([historicPlaza]);

// Prep offsets the traffic lanes after clipping their street centrelines. End
// each visible trip inside the plate, leaving room for the body of the actor.
SCENE.routes=SCENE.routes.flatMap(route=>{
  const limit=SCENE.meta.half-({ped:.65,bike:1.20,car:2.7}[route.kind]||1);
  const pieces=[];
  let run=[];
  const finish=()=>{if(run.length>1)pieces.push({...route,p:run});run=[]};
  for(let i=1;i<route.p.length;i++){
    const a=route.p[i-1],b=route.p[i],d=[b[0]-a[0],b[1]-a[1]];
    let lo=0,hi=1;
    for(let k=0;k<2;k++){
      if(Math.abs(d[k])<1e-9){if(Math.abs(a[k])>limit)hi=-1;continue}
      const t1=(-limit-a[k])/d[k],t2=(limit-a[k])/d[k];
      lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));
    }
    if(hi-lo<=1e-8){finish();continue}
    const at=t=>[a[0]+d[0]*t,a[1]+d[1]*t];
    if(!run.length)run.push(at(lo));
    run.push(at(hi));
    if(hi<1)finish();
  }
  finish();return pieces;
});

// The reference views show twin opal globes on cast-iron brackets around the
// historical plaza. Retain the positions and night light pools of the kit.
const ordinaryLamp=lamp;
lamp=function(x,y){
  if(y>-78||x<10||x>53)return ordinaryLamp(x,y);
  LAMP_AT.push([x,y]);
  const F=localFrame([x,y],[.65,-.76]),iron='#38413c';
  streetFurniture.push(obj(F.ring(-1.05,-.28,1.05,.28),5.23,()=>{
    let s=flatSolid(F.ring(-.18,-.18,.18,.18),0,.28,iron)+stick(F.at(0,0,.25),F.at(0,0,4.52),.093,iron);
    for(const side of [-1,1]){
      const u=side*.76;
      s+=capLine([F.at(0,0,3.80),F.at(side*.31,0,3.91),F.at(u,0,4.26),F.at(u,0,4.44)],iron,.09);
      s+=capLine([F.at(0,0,4.25),F.at(u,0,4.25)],iron,.062);
      s+=stick(F.at(u,0,4.44),F.at(u,0,4.55),.15,iron);
      s+=ball(F.at(u,0,4.72),.235,SEASON.night?{l:'#fff3c4',m:'#fff3c4',d:'#ffd98a'}:soft('#eae2ca'));
      s+=stick(F.at(u,0,4.94),F.at(u,0,5.09),.049,iron);
    }
    return s;
  }));
};

// Keep the kit's running-bond finish on the plaza. Unified paving here also
// covers the pedestrian ribbons whose overlaps otherwise cancel under even/odd fill.
// Yard paths on the university site plan and in the OSM extract are asphalt.
const kitGroundInk=paintGroundInk;
paintGroundInk=function(g){
  kitGroundInk(g);
  const X=Dv(1,0,0),Y=Dv(0,1,0),o=P(0,0,0);
  const path=r=>{g.moveTo(...r[0]);for(const q of r.slice(1))g.lineTo(...q);g.closePath()};
  g.save();g.transform(...X,...Y,...o);g.beginPath();
  for(const rs of SCENE.roads)for(const r of rs)path(r);
  g.clip('evenodd');
  g.fillStyle=nightCol(SEASON.snow?'#eae5d9':'#b78b77');
  for(const r of squareSidewalks){g.beginPath();path(r);g.fill()}
  if(UPX<.63){
    g.beginPath();for(const r of squareSidewalks)path(r);g.clip('evenodd');
    pavingInk(g,squareSidewalks.map(r=>[r]),{...CITY.paving,stone:'#b78b77'},HALF+2);
  }
  g.restore();
  g.save();g.transform(...X,...Y,...o);g.beginPath();path(historicPlaza);g.clip();
  g.fillStyle=nightCol(SEASON.snow?'#ede8dc':'#b67d63');g.fillRect(8,-120,50,47);
  if(UPX<.60){
    pavingInk(g,[[historicPlaza]],{...CITY.paving,stone:'#b67d63'},HALF+2);
    g.strokeStyle=nightCol(SEASON.snow?'#ded8ca':'#9d705f');g.lineWidth=.047;
    // Circular brick bond at the court, concentric with the arc in the site plan.
    g.save();g.beginPath();g.ellipse(35.6,-114.6,11.1,11.1,0,0,Math.PI*2);g.clip();
    g.fillStyle=nightCol(SEASON.snow?'#eae4d8':'#ba836a');g.fillRect(24,-120,24,19);
    g.beginPath();
    for(let i=1;i<=36;i++){
      const r=i*.31,n=Math.max(9,Math.round(2*Math.PI*r/.76));
      g.moveTo(35.6+r,-114.6);g.arc(35.6,-114.6,r,0,Math.PI*2);
      if(UPX<.19)for(let j=0;j<n;j++){const a=(j+(i%2)*.5)*2*Math.PI/n,c=Math.cos(a),s=Math.sin(a);
        g.moveTo(35.6+(r-.31)*c,-114.6+(r-.31)*s);g.lineTo(35.6+r*c,-114.6+r*s)}
    }
    g.stroke();g.restore();
  }
  g.restore();
  // The western fence line and the oblique Mass Ave frontage delimit the Yard.
  g.save();g.transform(...X,...Y,...o);g.beginPath();path([[3,120],[17,33.7],[34,-53],[39,-72],[74,-96],[120,-109],[120,120]]);g.clip();
  g.fillStyle=nightCol(SEASON.snow?'#dad7cf':'#aca79b');
  g.beginPath();for(const rs of SCENE.paths)for(const r of rs)path(r);g.fill('evenodd');g.restore();
  if(SEASON.night){
    g.save();g.beginPath();
    for(const r of [historicPlaza,...squareSidewalks])path(r.map(([x,y])=>P(x,y,0)));
    g.clip('evenodd');
    for(const [x,y] of LAMP_AT)if(y<-63&&x>-12&&x<120)paintOps(g,compileInk(lightPool(x,y,3.4,'#ffcf7a',.55)));
    g.restore();
  }
};

function localFrame(c,axis){
  const [dx,dy]=axis, l=Math.hypot(dx,dy), ax=[dx/l,dy/l], ay=[-ax[1],ax[0]];
  const point=(u,v)=>[c[0]+ax[0]*u+ay[0]*v,c[1]+ax[1]*u+ay[1]*v];
  return {point,ax,ay,at:(u,v,z)=>[...point(u,v),z],
    ring:(u0,v0,u1,v1)=>ccw([point(u0,v0),point(u1,v0),point(u1,v1),point(u0,v1)])};
}
function buildingFrame(id,reverse=false){
  const {c,ax}=findBuilding(id).obb;
  return localFrame(c,reverse?ax.map(x=>-x):ax);
}
function groupParts(parts){
  return obj(hull(parts.flatMap(p=>p.fp)),Math.max(...parts.map(p=>p.h)),
    ()=>planOrder(parts.map(p=>({fp:p.fp,z1:p.h,svg:p.draw()}))));
}
function flatSolid(r,z0,z1,wall,top=wall){
  r=ccw(r);
  return loft(atZ(r,z0),atZ(r,z1),n=>tone(n,soft(wall)))+shape(atZ(r,z1),top,.4);
}
const lidColour=c=>SEASON.snow?snowy(c,.85):c;
function ledge(r,z0,z1,wall,top=wall){
  return obj(r,z1,()=>flatSolid(r,z0,z1,wall,lidColour(top)));
}
function capLine(p,col,width){
  return '<path d="'+pd(p,false)+'" fill="none" stroke="'+col+'" style="stroke-width:'+f(width)+'" stroke-linejoin="round"/>';
}
function solidFace(pts,colour,ink=.5){
  const n=vNewell(pts);
  return vis(n)?shape(pts,tone(n,soft(colour)),ink):'';
}

// Use the kit's own elevation operations and wallText. A painter works in metres
// above grade. Its x axis runs right-to-left, as on the generic shop elevations.
const baseElevation=paintSingaporeElevation;
paintSingaporeElevation=function(g,id){
  const F=facades[id];
  if(!F.harvardPaint)return baseElevation(g,id);
  const {start,along,n,len:w,z,h}=F;
  g.save(); g.transform(...Dv(...along,0),...Dv(0,0,-1),...P(...start,h));
  g.beginPath();g.rect(0,0,w,h-z);g.clip();
  const colour=c=>nightCol(LIT.has(c)||dot(n,SUN)>.14?c:mix(c,'#827b86',.16));
  const box=(x,b,dx,dz,c)=>{g.fillStyle=colour(c);g.fillRect(x,h-b-dz,dx,dz)};
  const poly=(ps,c)=>{g.fillStyle=colour(c);g.beginPath();ps.forEach(([x,b],i)=>i?g.lineTo(x,h-b):g.moveTo(x,h-b));g.closePath();g.fill()};
  const line=(ps,c,th)=>{g.strokeStyle=colour(c);g.lineWidth=th;g.beginPath();ps.forEach(([x,b],i)=>i?g.lineTo(x,h-b):g.moveTo(x,h-b));g.stroke()};
  const oval=(x,b,rx,rz,c)=>{g.fillStyle=colour(c);g.beginPath();g.ellipse(x,h-b,rx,rz,0,0,Math.PI*2);g.fill()};
  const label=(word,x,b,width,size,c,font='Arial')=>{g.fillStyle=colour(c);g.font='bold '+size+'px '+font;g.textAlign='center';g.textBaseline='middle';wallText(g,word,x,h-b,width)};
  F.harvardPaint({w,h,box,poly,line,oval,label,side:F.hsSide,normal:n,seed:F.seed});
  g.restore();
};
function painted(r,z0,z1,col,paint,top=col){
  r=ccw(r);
  const first=facades.length, body=block(r,z0,z1,{wall:col,top,shop:'none'});
  for(let i=first;i<facades.length;i++){facades[i].harvardPaint=paint;facades[i].hsSide=i-first}
  return obj(r,z1,()=>body.draw()+(SEASON.snow?shape(atZ(r,z1),lidColour(top),.32):''));
}
function brickwork(p,bottom,top,base){
  if(UPX>.27)return;
  const c=mix(base,'#d7c4ac',.39);
  for(let k=0;bottom+k*.23<top;k++){
    const z=bottom+k*.23;
    p.box(0,z,p.w,.018,c);
    if(UPX<.12)for(let x=(k%2)*.255;x<p.w;x+=.51)p.box(x,z,.018,Math.min(.22,top-z),c);
  }
}
function glassInk(seed){return SEASON.night&&rnd(seed)>.35?'#ffe7a8':HS.glass}
function sash(p,x,b,w,h,seed,frame=HS.sash){
  p.box(x-w/2-.11,b-.10,w+.22,h+.19,frame);
  p.box(x-w/2,b,w,h,glassInk(seed));
  p.box(x-w/2-.17,b-.15,w+.34,.12,HS.stone);
  p.box(x-w/2,b+h*.5,w,.083,frame);
  if(UPX<.64){for(let i=1;i<3;i++)p.box(x+w*(i/3-.5)-.027,b,.054,h,frame);
    if(UPX<.28)for(const v of [.25,.75])p.box(x-w/2,b+h*v,w,.045,frame)}
}
function arch(p,x,b,w,h,pointed=false,col=HS.sash){
  const r=w/2, spring=b+h-r*(pointed?1.52:1);
  const outline=(rad,z0)=>[[x-rad,z0],[x+rad,z0],...Array.from({length:17},(_,i)=>{
    const t=i*Math.PI/16,c=Math.cos(t);return [x+rad*c,spring+rad*(pointed?Math.sqrt(Math.max(0,4-(1+Math.abs(c))**2))*.88:Math.sin(t))]})];
  p.poly(outline(r+.14,b-.14),col);p.poly(outline(r,b),glassInk(p.seed+x));
  p.box(x-r,b+r*.9,w,.085,col);p.box(x-r,spring-.07,w,.085,col);
  for(const k of [-.5,0,.5]){const dx=k*r;p.box(x+dx-.04,b,.08,spring-b+r*(pointed?1.45:.95)*(1-Math.abs(k)*.48),col)}
  if(UPX<.46)for(let j=b+.4;j<spring;j+=.52)p.box(x-r,j,w,.04,col);
}
function clockDial(p,x,z,r){
  p.oval(x,z,r+.13,r+.13,HS.trim);p.oval(x,z,r,r,'#333f43');
  for(let i=0;i<12;i++){const a=i*Math.PI/6,dx=Math.sin(a),dz=Math.cos(a);p.line([[x+dx*r*.77,z+dz*r*.77],[x+dx*r*.92,z+dz*r*.92]],'#d5b877',.07)}
  p.line([[x-r*.43,z+r*.32],[x,z],[x+r*.24,z+r*.72]],'#ecd196',.085);
}
function roofPart(F,u,v,L,W,eave,rise,kind,col=HS.slate,wall=HS.brick){
  const fp=F.ring(u-L/2,v-W/2,u+L/2,v+W/2),cap=roofOver({c:F.point(u,v),ax:F.ax,L,W},eave,
    {roof:kind,rise,roofColour:col,wall,eaves:.22,roofTex:'slate'});
  return obj(fp,eave+rise,cap);
}
function chimney(F,u,v,z0,z1,w=1.1,d=.86){
  const r=F.ring(u-w/2,v-d/2,u+w/2,v+d/2),rim=F.ring(u-w/2-.10,v-d/2-.1,u+w/2+.1,v+d/2+.1);
  return obj(rim,z1,()=>flatSolid(r,z0,z1-.20,'#995944')+flatSolid(rim,z1-.20,z1,'#a66a51','#73665c'));
}

// The measured roof plan is a long shallow barrel intersected by a shorter
// transverse barrel. Cut both sets of roof sheets back to their valley line.
function newsKiosk(){
  const F=buildingFrame('w38415391'),{at}=F,A=6.8,B=4.55,base=3.69;
  const r=F.ring(-5.55,-2.70,5.55,2.70);
  const paintedBody=painted(r,0,3.65,'#955945',p=>{
    const {w,h,box,label,side}=p,mid=w/2,long=side%2===0;
    brickwork(p,0,h,'#955945');box(0,0,w,.53,'#928e81');box(.39,1.57,w-.78,1.94,'#343d39');
    const sills=long?[0,.47*w,w-.55]:[0,w-.50];
    for(const x of sills){box(x,.51,.5,h-.51,'#99583f');for(let z=.83;z<3.64;z+=.57)box(x,z,.50,.16,'#d6c8b3')}
    if(long){
      for(let i=0;i<6;i++){const x=.53+i*(w-1.06)/6;
        box(x,1.64,(w-1.06)/6-.07,1.74,SEASON.night?'#ffe7a8':i%2?'#a0b1a8':'#889d98');
        box(x,1.69,(w-1.06)/6-.09,.11,'#c9c6aa')}
      for(let j=0;j<5;j++){const x=.84+j*.73;box(x,1.79,.60,.62,j%2?'#d7cba9':'#ddd8c5');box(x+.06,2.06,.47,.23,j%2?'#886251':'#526772');box(x+.09,1.91,.39,.04,'#766e5d')}
      box(mid-.67,.04,1.34,3.43,'#303b38');box(mid-.55,.12,1.10,2.84,'#8fa29b');
      box(mid-.55,1.23,1.10,.07,'#3d4b42');box(mid-.04,.12,.06,2.84,'#3d4b42');
    }else{
      for(const x of [.49,w-1.55]){box(x,.07,1.08,2.80,'#35403d');box(x+.09,.23,.90,2.47,'#8da49f')}
      box(mid-.89,.68,1.78,.89,'#35413e');
      for(const x of [.65,w-1.40]){box(x,.78,.63,.80,'#d5bc86');box(x+.04,1.10,.55,.41,'#536e7c');box(x+.08,.93,.46,.085,'#8b5744')}
      box(mid-.85,1.70,1.70,.73,'#ad8860');label('NEWS',mid,2.04,1.42,.28,'#eee1ba','Georgia');
      if(UPX<.35)for(let z=.79;z<1.55;z+=.12)box(mid-.79,z,1.58,.027,'#a2a698');
      box(.47,2.55,w-.94,.43,'#c9b591');label('OUT OF TOWN NEWS',mid,2.76,w-1.08,.34,'#41392f','Georgia');
    }
    box(0,3.45,w,.20,'#453c31');
  });
  const arc=(q,half,rise)=>rise*Math.max(0,1-(q/half)**2);
  const height=(u,v)=>base+Math.max(arc(v,2.35,.96),arc(u,1.48,.63));
  const rounded=[];for(const [cx,cy,start] of [[A-.34,B-.34,0],[-A+.34,B-.34,90],[-A+.34,-B+.34,180],[A-.34,-B+.34,270]]){
    for(let i=0;i<=3;i++){const t=(start+i*30)*Math.PI/180;rounded.push([cx+.34*Math.cos(t),cy+.34*Math.sin(t)])}}
  const fp=ccw(rounded.map(q=>F.point(...q)));
  const roof=()=>{
    const roofCol=lidColour(HS.copper),seam=lidColour('#68877c');
    let s=flatSolid(fp,base-.20,base-.07,'#80694e','#aa9774')+flatSolid(fp,base-.07,base,'#b19a73',roofCol);
    const panels=[];
    // A transverse sheet ends where it meets the higher longitudinal vault.
    for(let i=0;i<12;i++){
      const v=-2.35+4.7*i/12,v1=v+4.7/12;
      const cut=y=>1.48*Math.sqrt(Math.max(0,1-arc(y,2.35,.96)/.63));
      for(const sign of [-1,1]){
        const ps=[at(sign*cut(v),v,base+arc(v,2.35,.96)),at(sign*A,v,height(A,v)),
          at(sign*A,v1,height(A,v1)),at(sign*cut(v1),v1,base+arc(v1,2.35,.96))];
        if(vNewell(ps)[2]<0)ps.reverse();
        panels.push({at:avg(ps),svg:solidFace(ps,lidColour(['#769989','#779889','#799b8d','#7ea190','#83a694','#87a899','#91ae9e','#93b0a1','#91afa0','#8cab9b','#86a595','#7f9f8e'][i]),0)});
      }
    }
    for(let i=0;i<10;i++){
      const u=-1.48+2.96*i/10,u1=u+2.96/10,cut=x=>2.35*Math.sqrt(1-arc(x,1.48,.63)/.96);
      for(const sign of [-1,1]){
        const ps=[at(u,sign*cut(u),base+arc(u,1.48,.63)),at(u,sign*B,height(u,B)),at(u1,sign*B,height(u1,B)),at(u1,sign*cut(u1),base+arc(u1,1.48,.63))];
        if(vNewell(ps)[2]<0)ps.reverse();
        panels.push({at:avg(ps),svg:solidFace(ps,lidColour(i<3?'#789c8e':i<7?'#91ac9b':'#80a393'),0)});
      }
    }
    s+=byDepth(panels);
    // Rolled eaves, standing seams and the four valley flashings in the copper.
    for(const d of [-1,1]){
      for(const v of [-2.36,2.36])s+=capLine([at(d*1.49,v,base+.024),at(d*A,v,base+.024)],seam,.058);
      for(const end of [-1,1]){
        const valley=Array.from({length:17},(_,i)=>{const u=d*1.48*i/16,v=end*2.35*Math.sqrt(1-arc(u,1.48,.63)/.96);return at(u,v,height(u,v)+.024)});
        s+=capLine(valley,seam,.056);
      }
    }
    const ribs=(u,side)=>Array.from({length:17},(_,k)=>{const v=-2.35+k*4.7/16;return at(u,v,height(u,v)+side)});
    if(UPX<.72)for(const u of [-5.6,-4.35,-3.10,-1.85,1.85,3.10,4.35,5.6])s+=capLine(ribs(u,.025),seam,.055);
    for(const side of [-1,1]){
      if(vis([F.ax[0]*side,F.ax[1]*side,0])){
        const arch=ribs(side*A,0);
        const insideArch=ribs(side*(A-.89),-.11);
        s+=shape([...insideArch,at(side*(A-.89),2.35,base-.17),at(side*(A-.89),-2.35,base-.17)],'#52605a',.3);
        for(let j=1;j<arch.length;j++){
          const v=-2.35+j*4.7/16;
          s+=shape([insideArch[j-1],insideArch[j],at(side*A,v,arch[j][2]-.11),at(side*A,v-4.7/16,arch[j-1][2]-.11)],j%2?'#766446':'#817052',0);
        }
        s+=shape([...arch,...arch.slice().reverse().map(([x,y,z])=>[x,y,z-.115])],'#ae9773',.3);
        s+=capLine(arch,'#cfb690',.079);
      }
      if(vis([F.ay[0]*side,F.ay[1]*side,0])){
        const span=Array.from({length:15},(_,k)=>{const u=-1.48+k*2.96/14;return at(u,side*B,height(u,B))});
        s+=shape([at(-1.48,side*B,base-.15),...span,at(1.48,side*B,base-.15)],'#9e8968',.35)+capLine(span,'#cbb58b',.10);
        s+=kioskSign[side===1?1:0].draw();
      }
    }
    return s;
  };
  // Low enamel nameplates sit inside the two bronze arch tympana.
  const kioskSign=[-1,1].map(side=>painted(F.ring(-1.07,side*B-.018,1.07,side*B+.018),base+.01,base+.30,'#967d5b',
    p=>{if(p.w>1)p.label('HARVARD STATION',p.w/2,base+.15,p.w-.06,.215,'#f0dbaf','Georgia')}));
  return obj(fp,4.70,()=>{
    let s=paintedBody.draw();
    for(const u of [-4.86,-2.20,2.20,4.86])for(const d of [-1,1]){
      s+=stick(at(u,d*2.58,3.17),at(u,d*3.96,3.57),.086,'#61503b');
      s+=stick(at(u,d*3.58,3.59),at(u,d*3.58,3.41),.037,HS.iron);
      s+=ball(at(u,d*3.58,3.35),.124,soft(SEASON.night?'#ffe7a8':'#e3cf9d'));
    }
    return s+roof();
  });
}

function mbtaRoundel(F,u,v){
  const {at}=F,fp=F.ring(u-.59,v-.59,u+.59,v+.59);
  return obj(fp,3.46,()=>{
    const x=u,z=2.9,disc=r=>Array.from({length:28},(_,k)=>at(x,v+r*Math.cos(k*Math.PI/14),z+r*Math.sin(k*Math.PI/14)));
    let s=stick(at(x,v,.03),at(x,v,2.9),.082,HS.iron);
    s+=shape(disc(.55),'#303831',.35)+shape(disc(.50),'#f4efdd',0);
    return s+capLine([at(x,v-.30,z+.17),at(x,v+.30,z+.17)],'#242b29',.14)+capLine([at(x,v,z+.17),at(x,v,z-.30)],'#242b29',.15);
  });
}
function harvardStation(){
  // OSM ways 1433190512–14 descend along +u. The middle flight has handrails,
  // with escalators to either side. The mouth of the stair is open across -u.
  const F=buildingFrame('w1366714342'),{at}=F,A=4.99,B=3.86;
  const fp=F.ring(-A,-B,A,B), metal='#36443f',sill='#9e7463';
  const brick=(p)=>{brickwork(p,0,p.h,'#994f43');p.box(0,p.h-.15,p.w,.15,'#b09c89')};
  const sides=[-1,1].map(side=>painted(F.ring(-A,side*B-.09,A,side*B+.09),0,1.06,'#995847',brick));
  const outerEnd=painted(F.ring(A-.08,-B,A+.08,B),0,1.36,'#995847',brick);
  const front=painted(F.ring(-A-.10,-B,-A+.13,B),2.89,3.45,metal,p=>{
    if(p.w<1)return;
    p.box(.12,2.94,p.w-.24,.43,'#f0eade');p.box(.12,3.15,p.w-.24,.22,HS.red);
    p.label('HARVARD',p.w/2,3.255,p.w*.55,.245,'#fff8e0');p.label('BUSES AND TRAINS',p.w/2,3.04,p.w*.59,.139,'#2c322f');
    for(const x of [p.w*.33,p.w*.67])p.box(x,2.93,.06,.45,metal);
  });
  const pitFascia=painted(F.ring(-A,B-.03,A,B+.13),1.03,1.65,'#bead91',p=>{
    if(p.w<1)return;
    p.box(.10,1.08,p.w-.20,.5,HS.red);p.label('HARVARD',p.w*.70,1.32,3.24,.40,'#fff8e0');
    p.label('RED LINE • ALL TRAINS',p.w*.29,1.32,p.w*.38,.20,'#fff8e0');
  });
  const outline=(v,z)=>Array.from({length:17},(_,i)=>{
    const u=-A+i*2*A/16;return at(u,v,z(u,v))
  });
  const roofZ=(u,v)=>{
    // Rolled shoulders turn the nearly flat smoked-glass roof down into the jambs.
    const d=Math.max(0,(Math.abs(v)-(B-.68))/.68);
    return 3.64-.50*(1-Math.sqrt(Math.max(0,1-d*d)))-.075*(u+A)/(2*A);
  };
  return [obj(fp,3.74,()=>{
    let s=shape(atZ(fp,.05),'#373e3e',.45),interior='';
    const floor=u=>-.01-(u+A)*.23;
    for(const side of [-1,1]){
      const v=side*(B-.12);
      interior+=shape([at(-A,v,0),at(A,v,0),at(A,v,floor(A)-.1),at(-A,v,-.1)],'#817b70',0);
      interior+=shape([at(-A,v,.62),at(A,v,-1.07),at(A,v,-1.36),at(-A,v,.35)],'#a4463b',0);
    }
    // The dark return and recessed treads are clipped to the grade-level aperture.
    interior+=shape([at(A,-B,.04),at(A,B,.04),at(A,B,floor(A)),at(A,-B,floor(A))],'#3b4140',0);
    // Draw from the lowest step back towards the top landing, so the nearer
    // tread and its nosing cover the portion of the riser directly behind it.
    for(let j=22;j>=0;j--){
      const u=-A+.14+j*(2*A-.22)/23,next=u+(2*A-.22)/23;
      const z=floor(u),tread=mix('#aca79a','#313834',.06+.94*j/22);
      for(const [lo,hi] of [[-B+.23,-1.39],[-1.20,1.20],[1.39,B-.23]]){
        interior+=shape([at(u,lo,z),at(next,lo,z),at(next,hi,z),at(u,hi,z)],tread,0);
        interior+=capLine([at(u,lo,z+.01),at(u,hi,z+.01)],mix(tread,'#dfd2b8',.45),.050);
      }
    }
    for(const v of [-1.31,1.31]){
      const skirt=[at(-A+.08,v,-.02),at(A-.18,v,floor(A)),at(A-.18,v,floor(A)+.85),at(-A+.75,v,.76),at(-A+.25,v,.83)];
      interior+=shape(skirt,'#92958b',.29)+capLine([at(-A+.25,v,.83),at(-A+.75,v,.76),at(A-.18,v,floor(A)+.85)],metal,.14);
    }
    s+=clipTo(atZ(fp,.065),interior);
    for(const v of [-1.31,1.31])s+=capLine([at(-A-.18,v,.23),at(-A+.04,v,.67),at(-A+.25,v,.83),at(-A+.75,v,.76),at(-A+3.40,v,0)],metal,.14);
    s+=planOrder([...sides,outerEnd].map(p=>({fp:p.fp,z1:p.h,svg:p.draw()})));
    const panes=[];
    for(const side of [-1,1]){
      const v=side*B;
      let g='<g opacity=".48">'+shape([at(-A,v,1.06),at(A,v,1.06),at(A,v,roofZ(A,v)),at(-A,v,roofZ(-A,v))],'#97b8b7',.25)+'</g>';
      for(let j=0;j<=4;j++){const u=-A+j*2*A/4;g+=stick(at(u,v,.15),at(u,v,roofZ(u,v)),.078,metal)}
      g+=capLine(outline(v,roofZ),metal,.13);
      if(side===1)g+=pitFascia.draw();
      panes.push({fp:[F.point(-A,v),F.point(A,v)],z1:3.65,svg:g});
    }
    panes.push({fp:[F.point(A,-B),F.point(A,B)],z1:3.64,svg:'<g opacity=".4">'+shape([at(A,-B,1.36),at(A,B,1.36),at(A,B,3.12),at(A,-B,3.12)],'#aec1b8',.4)+'</g>'});
    s+=planSort(panes);
    const strips=[-B,-B+.16,-B+.40,-B+.70,0,B-.70,B-.40,B-.16,B];
    for(let i=1;i<strips.length;i++){
      const a=strips[i-1],b=strips[i];
      s+='<g opacity="'+(SEASON.snow?.88:.56)+'">'+shape([at(-A,a,roofZ(-A,a)),at(A,a,roofZ(A,a)),at(A,b,roofZ(A,b)),at(-A,b,roofZ(-A,b))],lidColour(i%2?'#a2c0c0':'#a7bfbb'),0)+'</g>';
    }
    for(let j=0;j<=4;j++){const u=-A+2*A*j/4;
      s+=capLine(strips.map(v=>at(u,v,roofZ(u,v)+.025)),metal,j===0||j===4?.14:.094)}
    for(const v of [-B,0,B])s+=capLine([at(-A,v,roofZ(-A,v)),at(A,v,roofZ(A,v))],metal,.074);
    if(vis([-F.ax[0],-F.ax[1],0])){
      for(const v of [-B,B])s+=stick(at(-A,v,.03),at(-A,v,3.17),.155,metal);
      s+=front.draw();
    }
    return s;
  }),mbtaRoundel(F,-A-1.18,B+.40)];
}

// Steps are ground-height ribbons. The open ends are the approaches, and the
// split on the plaza side is the radial stair in the city's existing-condition plan.
function pitSteps(){
  const F=buildingFrame('w1366714342'),out=[];
  for(const [start,end] of [[-1,38],[49,157]]){
    const blocks=Math.ceil((end-start)/13);
    for(let block=0;block<blocks;block++){
      const a0=(start+(end-start)*block/blocks)*Math.PI/180,a1=(start+(end-start)*(block+1)/blocks)*Math.PI/180;
      const angles=[a0,(a0+a1)/2,a1],side=(t,d)=>F.point(Math.cos(t)*(7.0+d),Math.sin(t)*(8.6+d)+.30);
      const seats=[];
      for(let j=0;j<3;j++){
        const ring=ccw([...angles.map(t=>side(t,j*.70)),...angles.slice().reverse().map(t=>side(t,(j+1)*.70))]);
        const h=(j+1)*.32;
        seats.push(obj(ring,h,()=>flatSolid(ring,.015,h-.085,'#a7664d')+flatSolid(ring,h-.085,h,'#bdad97',lidColour('#b9ac99'))));
      }
      out.push(groupParts(seats));
    }
  }
  return out;
}
function visitorBooth(){
  const r=ccw(findBuilding('w653516582').ring),c=findBuilding('w653516582').obb.c;
  const lower=painted(r,0,2.23,'#686e64',p=>{
    p.box(.07,.55,p.w-.14,1.52,'#94a7a1');p.box(.12,.64,Math.max(.1,p.w-.24),.42,'#d2bd97');
  });
  const rings=[2.54,2.37,2.00,1.43,.70,.06].map(rad=>polygon(...c,rad,20));
  return obj(r,3.68,()=>{
    let s=lower.draw(),z=[2.23,2.74,3.10,3.39,3.58,3.66];
    for(let i=1;i<rings.length;i++)s+=loft(atZ(rings[i-1],z[i-1]),atZ(rings[i],z[i]),n=>tone(n,soft(lidColour('#898e76'))));
    return s+shape(atZ(rings.at(-1),3.66),lidColour('#929984'),.25);
  });
}

// The shoulders on Massachusetts Hall are breaks in a gambrel, with a timber
// balustrade along each break and paired interior chimneys. The shape is extruded
// along the surveyed ridge so its two brick end walls retain the full roof profile.
function gambrel(F,u,v,L,W,eave,lower,upper,roof,brick){
  const {at}=F,A=L/2,B=W/2,k=.66;
  const cross=[[-B,eave],[-B*k,eave+lower],[0,eave+lower+upper],[B*k,eave+lower],[B,eave]];
  const fp=F.ring(u-A,v-B,u+A,v+B);
  return obj(fp,eave+lower+upper,()=>{
    let s='';for(const sign of [-1,1]){
      let end=cross.map(([d,z])=>at(u+sign*A,v+d,z));if(sign>0)end.reverse();
      if(vis([F.ax[0]*sign,F.ax[1]*sign,0]))s+=shape(end,tone([F.ax[0]*sign,F.ax[1]*sign,0],soft(brick)),.46);
    }
    for(let i=1;i<cross.length;i++){
      const [a,z]=cross[i-1],[b,t]=cross[i],ps=[at(u-A-.08,v+a,z),at(u+A+.08,v+a,z),at(u+A+.08,v+b,t),at(u-A-.08,v+b,t)];
      if(vis(vNewell(ps))){
        s+=solidFace(ps,lidColour(roof),.34);
        if(!SEASON.snow)s+=sheetInk(ps,'slate',norm(sub(ps[1],ps[0])),norm(sub(ps[3],ps[0])));
      }
    }
    return s;
  });
}
function dormer(F,u,v,side,z,w,rise,roof=HS.slate){
  const d=.98, y=v+side*d/2;
  const r=F.ring(u-w/2,y-d/2,u+w/2,y+d/2);
  const body=painted(r,z-.52,z+rise,HS.trim,p=>{if(p.side===(side===1?2:0))sash(p,p.w/2,z,w*.64,rise*.80,u)});
  const frame=localFrame(F.point(u,y),F.ay);
  return groupParts([body,roofPart(frame,0,0,d,w,z+rise,w*.31,'gabled',roof,HS.trim)]);
}
function massHall(){
  const F=buildingFrame('w29938509'),A=15.45,B=6.79,eave=10.34;
  const r=F.ring(-A,-B,A,B);
  const body=painted(r,0,eave,'#a55a45',p=>{
    const {w,box,side}=p,n=side%2?4:12,step=w/n;
    brickwork(p,.28,eave,'#a55a45');box(0,0,w,.40,'#b39d84');
    for(let row=0;row<3;row++)for(let i=0;i<n;i++){
      const x=(i+.5)*step,z=.79+3.22*row;
      if(!row&&n===12&&(i===2||i===9)){
        box(x-.80,0,1.6,2.74,HS.trim);box(x-.60,.05,1.20,2.22,'#474e42');box(x-.62,2.30,1.24,.28,HS.glass);box(x-.98,2.69,1.96,.16,HS.trim);
      }else sash(p,x,z,(n===12&&(i===5||i===6))?.70:1.09,1.76,i+row*8);
    }
    for(const z of [3.17,6.42]){box(0,z,w,.18,'#924a3c');box(0,z+.16,w,.05,'#bb795c')}
    box(0,eave-.24,w,.24,HS.trim);
  });
  const cap=gambrel(F,0,0,2*A,2*B,eave,3.28,2.20,HS.slate,'#a55a45');
  const stacks=[];
  for(const u of [-A+.55,0,A-.55])for(const v of [-2.65,2.65])stacks.push(chimney(F,u,v,u===0?14.5:11,17.55,1.38,1.22));
  const dormers=[];for(const side of [-1,1])for(const u of [-10.2,-5.15,4.95,10.05])
    dormers.push({side,part:dormer(F,u,side*5.68,side,eave+.11,1.36,1.58)});
  const outer=crossParapets();
  function crossParapets(){
    return [-1,1].map(side=>{
      const r=F.ring(side*(A-.27)-.17,-3.13,side*(A-.27)+.17,3.13);
      return painted(r,11.03,15.8,'#a35d48',p=>{
        if(p.w<3)return;
        brickwork(p,11.03,15.8,'#a35d48');
        if(side===-1&&p.side===3)clockDial(p,p.w/2,13.41,1.18);
      });
    });
  }
  return obj(r,17.6,()=>{
    const trim=[];
    for(const side of [-1,1]){
      const v=side*B*.66,z=eave+3.28, pts=[F.at(-A+.58,v,z+.78),F.at(A-.58,v,z+.78)];
      let s=capLine(pts,HS.trim,.13)+capLine([F.at(-A+.58,v,z+.11),F.at(A-.58,v,z+.11)],HS.trim,.11);
      for(let u=-A+.65;u<A-.58;u+=.50)s+=stick(F.at(u,v,z+.07),F.at(u,v,z+.78),.049,HS.trim);
      trim.push({fp:F.ring(-A+.55,v-.06,A-.55,v+.06),z1:z+.78,svg:s});
    }
    const visibleDormers=dormers.filter(({side})=>vis([side*F.ay[0],side*F.ay[1],.56])).map(d=>d.part);
    const detail=[...stacks,...visibleDormers,...outer].map(p=>({fp:p.fp,z1:p.h,svg:p.draw()}));
    return body.draw()+cap.draw()+planOrder([...trim,...detail]);
  });
}

function harvardHall(){
  const F=buildingFrame('w29934296'), {at}=F, red='#a86650',trim='#c9bca6',stone='#ad8067';
  const cornice=(p,z)=>{p.box(0,z-.32,p.w,.32,trim);p.box(0,z-.48,p.w,.12,stone)};
  const wall=painted(F.ring(-17,-3.82,17,9.14),0,9.65,red,p=>{
    brickwork(p,.47,9.65,red);p.box(0,0,p.w,.61,'#a08d7b');
    const bays=p.side%2?3:9;
    for(let i=0;i<bays;i++)for(const z of [1.0,5.69])sash(p,(i+.5)*p.w/bays,z,1.40,2.58,p.side*10+i,trim);
    p.box(0,4.65,p.w,.21,stone);cornice(p,9.65);
  });
  const mainRoof=roofPart(F,0,2.66,34,12.96,9.65,3.82,'gabled','#727077',red);
  const appendages=[];
  for(const [a,b] of [[-16.39,-4.6],[5.94,16.75]]){
    const r=F.ring(a,-8.24,b,-3.82),wing=painted(r,0,5.36,red,p=>{
      brickwork(p,.4,5.36,red);p.box(0,0,p.w,.60,'#9e8d7c');
      const n=p.w>6?3:1;for(let i=0;i<n;i++)arch(p,(i+.5)*p.w/n,.81,1.63,3.76,false,trim);
      cornice(p,5.36);
    });
    appendages.push(obj(r,6.24,()=>{
      let s=wing.draw();const deck=lidColour('#797878');
      s+=shape(atZ(r,5.37),deck,.38);
      for(const [x,y] of [[a,-8.23],[b,-8.23]])s+=flatSolid(F.ring(x-.13,y-.13,x+.13,y+.13),5.38,6.16,trim);
      for(let x=a+.3;x<b-.12;x+=.48)s+=stick(at(x,-8.23,5.49),at(x,-8.23,6.12),.052,trim);
      for(const u of [a,b]){
        s+=capLine([at(u,-8.23,6.14),at(u,-3.83,6.14)],trim,.16);
        for(let v=-7.9;v<-3.84;v+=.48)s+=stick(at(u,v,5.42),at(u,v,6.11),.052,trim);
      }
      return s+capLine([at(a,-8.23,6.14),at(b,-8.23,6.14)],trim,.16)+capLine([at(a,-8.23,5.52),at(b,-8.23,5.52)],trim,.13);
    }));
  }
  const frontFrame=localFrame(F.point(.67,-6.43),F.ay);
  const front=painted(F.ring(-4.60,-9.04,5.94,-3.82),0,9.65,red,p=>{
    const n=p.side%2?1:3;
    brickwork(p,.4,9.65,red);
    for(let i=0;i<n;i++){
      const x=(i+.5)*p.w/n;
      if(p.side===0&&i===1){
        for(const d of [-.80,0,.80])sash(p,x+d,5.62,d===0?.84:.54,d===0?2.73:2.27,120+i,trim);
        for(const z of [1.10,2.85])sash(p,x,z,.99,1.30,i+z,trim);
      }else{
        sash(p,x,5.65,1.33,2.6,120+i,trim);
        p.box(x-.86,.7,1.72,2.88,trim);p.box(x-.68,.78,1.36,2.53,'#68665a');
        p.box(x-.64,2.76,1.28,.52,HS.glass);
      }
    }
    for(const x of [0,p.w-.46]){
      p.box(x,.6,.46,8.72,stone);
      for(let z=.58;z<9.2;z+=.65)p.box(x,z,.46,.030,'#966f5b');
    }
    cornice(p,9.65);
  });
  const crossRoof=roofPart(frontFrame,0,0,5.22,10.54,9.65,2.96,'gabled','#707274',red);
  const southGable=obj(front.fp,12.65,()=>{
    let s=front.draw()+crossRoof.draw();
    if(!vis([-F.ay[0],-F.ay[1],0]))return s;
    const v=-9.09,to=(u,z)=>at(.67+u,v,z),rim=r=>Array.from({length:15},(_,j)=>to(r*Math.cos(j*Math.PI/14),10.14+.65*r*Math.sin(j*Math.PI/14)));
    s+=capLine([to(-5.32,9.65),to(0,12.65),to(5.32,9.65)],trim,.19)+capLine([to(-5.28,9.70),to(5.28,9.70)],trim,.17);
    s+=shape(rim(1.22),stone,.28)+shape(rim(1.03),'#77817c',.28);
    for(let i=1;i<8;i++){const a=i*Math.PI/8;s+=capLine([to(0,10.14),to(Math.cos(a),10.14+.65*Math.sin(a))],trim,.055)}
    return s;
  });
  appendages.push(southGable);
  const stoop=F.ring(-3.43,-10.85,4.77,-9.02);
  appendages.push(obj(stoop,.78,()=>{
    let s='';
    for(let j=0;j<5;j++)s+=flatSolid(F.ring(-3.43,-10.85+j*.29,4.77,-9.02),j*.15,(j+1)*.15,'#a49f91','#c0b7a6');
    for(const u of [-3.43,4.77])s+=capLine([at(u,-10.76,.96),at(u,-9.14,1.72)],HS.iron,.075)+stick(at(u,-10.70,.14),at(u,-10.70,.99),.063,HS.iron);
    return s;
  }));
  const C=F.point(0,2.66), frame=localFrame(C,F.ax),oct=polygon(...C,1.42,8);
  const lantern=obj(frame.ring(-1.63,-1.63,1.63,1.63),21.18,()=>{
    let s=flatSolid(frame.ring(-1.52,-1.52,1.52,1.52),11.76,14.18,'#ada795',trim);
    s+=flatSolid(oct,14.18,15.12,trim)+shape(atZ(oct,15.12),'#78766b',.4);
    for(const p of oct)s+=stick([...p,15.08],[...p,17.12],.105,trim);
    s+=ball([...C,16.14],.48,soft('#796b51'));
    s+=flatSolid(polygon(...C,1.54,8),17.04,17.50,trim);
    const radii=[1.51,1.34,.96,.43,.12],zs=[17.5,17.85,18.18,18.46,18.56];
    for(let i=1;i<radii.length;i++)s+=loft(atZ(polygon(...C,radii[i-1],8),zs[i-1]),atZ(polygon(...C,radii[i],8),zs[i]),n=>tone(n,soft(lidColour('#869184'))));
    s+=shape(atZ(polygon(...C,.12,8),18.56),trim,.2)+stick([...C,18.55],[...C,20.92],.044,'#8c7c54');
    s+=capLine([frame.at(-.80,0,20.36),frame.at(.61,0,20.36)],'#9d8b59',.08);
    return s+shape([frame.at(-.82,0,20.11),frame.at(-.82,0,20.61),frame.at(-.41,0,20.36)],'#b99a57',.24);
  });
  const core=groupParts([wall,mainRoof,lantern]);
  return groupParts([core,...appendages]);
}

function holdenChapel(){
  const F=buildingFrame('w29684572',true),A=7.97,B=5.60,eave=6.85;
  const body=painted(F.ring(-A,-B,A,B),0,eave,'#a46047',p=>{
    brickwork(p,.25,eave,'#a46047');p.box(0,0,p.w,.39,'#b2a089');
    if(p.side%2===0){
      for(let i=0;i<3;i++)arch(p,(i+.5)*p.w/3,1.45,1.76,4.09,false,'#cfbea6');
    }else{
      const mid=p.w/2;
      for(const x of [.12,p.w-.62]){p.box(x,.38,.50,eave-.63,'#d4c3a8');p.box(x-.12,eave-.56,.74,.29,HS.trim)}
      p.box(mid-1.17,.36,2.34,3.4,'#d5c7ac');p.box(mid-.79,.40,1.58,2.93,'#425a51');
      p.box(mid-.035,.43,.07,2.98,'#9c9c87');p.box(mid-1.37,3.74,2.74,.23,HS.trim);
      p.poly([[mid-1.45,3.96],[mid+1.45,3.96],[mid,4.65]],HS.trim);
    }
    p.box(0,eave-.25,p.w,.25,HS.trim);
  });
  const cap=roofPart(F,0,0,2*A,2*B,eave,3.17,'gabled',HS.slate,'#8c715b');
  function pediment(side){
    const at=(x,z)=>F.at(side*(A+.10),x,z);
    let s=shape([at(-B,eave+.04),at(B,eave+.04),at(0,eave+3.13)],'#96765b',.36);
    s+=capLine([at(-B,eave+.04),at(0,eave+3.16),at(B,eave+.04)],HS.trim,.21)+capLine([at(-B,eave+.16),at(B,eave+.16)],HS.trim,.19);
    const cream='#e2d5bc',z=eave+.87;
    s+=shape([at(-.64,z+.83),at(.64,z+.83),at(.53,z+.05),at(0,z-.39),at(-.52,z+.05)],cream,.35);
    for(const d of [-1,1]){
      for(let i=0;i<3;i++){
        const x=d*(1.02+.86*i),h=.56-.13*i;
        const scroll=Array.from({length:16},(_,j)=>at(x+d*.51*(1-j/20)*Math.cos(j*.34),z-.22+.13*(2-i)+h*(1-j/21)*Math.sin(j*.34)));
        s+=capLine(scroll,cream,.14-i*.019);
      }
      s+=capLine([at(d*.30,z+1.05),at(d*.46,z+.78),at(d*.65,z+.94)],cream,.11);
    }
    return s;
  }
  return obj(body.fp,10.06,()=>body.draw()+cap.draw()+[-1,1].filter(d=>vis([d*F.ax[0],d*F.ax[1],0])).map(pediment).join(''));
}
function firstParish(){
  const F=buildingFrame('w427504032',true),cream='#e3d8bc',clap='#c6bda7',red='#9c4037',grey='#89938e';
  const hall=painted(F.ring(-5.25,-11.2,21.7,10.45),0,10.35,cream,p=>{
    for(let z=.65;z<10.2&&UPX<.41;z+=.28)p.box(0,z,p.w,.026,clap);
    p.box(0,0,p.w,.72,'#aaa493');
    if(p.side%2===0){
      for(let i=0;i<4;i++){const x=(i+.5)*p.w/4;
        arch(p,x,2.49,2.22,6.41,true,'#f1e7d2');p.box(x-1.41,1.87,2.82,.19,'#cbc6b2')}
    }else for(const x of [p.w*.14,p.w*.86])arch(p,x,2.39,1.90,6.56,true,HS.trim);
    p.box(0,10.06,p.w,.29,'#efe3ca');
  });
  // Parish house to the west: the Church Street masonry gable is separate from the clapboard nave.
  const house=painted(F.ring(-26.1,-10.95,-5.25,10.68),0,11.2,'#9c9282',p=>{
    for(let j=0;j<11;j++)p.box(0,j+.12,p.w,.048,'#b4aa99');
    const n=p.side%2?4:5;
    for(let i=0;i<n;i++){
      const x=(i+.5)*p.w/n;arch(p,x,5.82,1.38,3.81,true,'#bcb5a3');
      if(p.side===0&&i===2){arch(p,x,.3,1.95,3.95,true,'#b9b09b');p.box(x-.83,.29,1.66,2.44,red)}
      else sash(p,x,1.38,1.02,1.52,i,HS.stone);
    }
  });
  const parishCross=localFrame(F.point(-15.6,-.14),F.ay);
  const houseRoof=roofPart(parishCross,0,0,21.55,20.78,11.20,6.03,'gabled','#676e6c','#9c9282');
  const naveRoof=roofPart(F,8.23,-.375,26.95,21.65,10.35,3.95,'gabled','#727776',cream);
  // The tower occupies the projecting central bay. From the ridge up it is square,
  // then eight-sided at the foot of the slender spire. All setbacks have a lid.
  const tc=F.point(21.91,-.53),T=localFrame(tc,F.ax),base=T.ring(-4.43,-4.59,4.43,4.59);
  const lower=painted(base,0,13.52,cream,p=>{
    const m=p.w/2;
    for(let z=.57;z<13.4&&UPX<.45;z+=.29)p.box(0,z,p.w,.024,clap);
    for(const x of [.07,p.w-.57])p.box(x,.31,.50,12.97,'#efe4cb');
    if(p.side===1){
      arch(p,m,.60,3.66,7.12,true,'#f5ead2');p.box(m-1.56,.61,3.12,3.19,red);
      p.box(m-.055,.62,.11,3.14,'#b69b7e');p.box(m-1.88,3.82,3.76,.22,'#f3e7cb');
      clockDial(p,m,10.54,1.15);
    }else if(p.side!==3)arch(p,m,4.7,2.39,4.38,true,'#eee3cb');
  });
  const upper=painted(T.ring(-3.06,-3.06,3.06,3.06),13.52,21.12,cream,p=>{
    for(const x of [.11,p.w-.51])p.box(x,13.7,.40,7.07,'#eee3cb');
    const x=p.w/2;
    arch(p,x,14.19,2.60,5.74,true,'#f1e8d2');
    for(let z=14.34;z<18.74;z+=.24){const w=z<18?2.40:2.40-(z-18)*1.8;
      p.box(x-w/2,z,w,.115,'#aba593')}
    p.box(x-.055,14.23,.11,4.87,'#ded5bc');
    p.box(0,20.54,p.w,.23,'#c6baa1');p.box(0,20.89,p.w,.23,HS.trim);
  });
  const spire=obj(upper.fp,41.05,()=>{
    const baseRing=polygon(...tc,2.87,8,Math.atan2(F.ax[1],F.ax[0])+Math.PI/8),collar=polygon(...tc,2.33,8,Math.atan2(F.ax[1],F.ax[0])+Math.PI/8);
    let s=flatSolid(baseRing,21.12,21.70,grey)+loft(atZ(baseRing,21.70),atZ(collar,23.49),n=>tone(n,soft(grey)))+shape(atZ(collar,23.49),grey,.3);
    s+=peak(collar,23.49,[...tc,39.65],lidColour('#84928e'))+stick([...tc,39.52],[...tc,41.05],.047,'#8a7c54');
    for(const u of [-2.81,2.81])for(const v of [-2.81,2.81]){
      const pedestal=T.ring(u-.22,v-.22,u+.22,v+.22);
      s+=flatSolid(pedestal,21.12,22.12,cream)+peak(pedestal,22.12,T.at(u,v,23.26),HS.trim);
    }
    return s+stick(T.at(-.69,0,40.52),T.at(.63,0,40.52),.052,'#958454');
  });
  // Split the nave roof and tower in depth order where the tower rises through its front gable.
  const rear=groupParts([house,houseRoof]),sanctuary=groupParts([hall,naveRoof]);
  const tower=groupParts([lower,upper,spire]);
  return groupParts([rear,sanctuary,tower]);
}
function johnstonGate(){
  // The main east-west path (OSM 31090310) starts at this fence line.
  const F=localFrame([17.20,33.71],[-.19,.982]),iron='#303c37', granite='#b9ae98';
  const parts=[],fac=(u,z)=>F.at(u,0,z);
  for(const d of [-1,1]){
    const u=d*3.68,fp=F.ring(u-1.02,-.53,u+1.02,.53);
    const pier=painted(fp,.16,3.05,'#9c5843',p=>{
      brickwork(p,.16,3.05,'#9c5843');
      if(p.w>1.5){
        const m=p.w/2;p.box(m-.70,1.37,1.40,1.16,'#c3b397');p.poly([[m-.54,2.34],[m+.54,2.34],[m+.43,1.79],[m,1.51],[m-.43,1.79]],'#b5a283');
        p.label('1855',m,1.76,.77,.18,'#84735d','Georgia');
      }
    });
    const cap=F.ring(u-1.10,-.61,u+1.10,.61);
    parts.push(groupParts([ledge(cap,0,.19,granite),pier,ledge(cap,3.04,3.24,granite)]));
    for(const pos of [6.70,10.7,15.0,19.4]){
      const c=pos*d,w=pos===6.7?.86:.55,h=pos===6.7?2.56:1.8,ring=F.ring(c-w/2,-w/2,c+w/2,w/2);
      parts.push(ledge(ring,0,h,'#a4614c',granite));
      parts.push(ledge(F.ring(c-w*.59,-w*.59,c+w*.59,w*.59),h,h+.13,granite));
    }
    // Outside the two pedestrian openings the Memorial Fence follows the sidewalk.
    const span=F.ring(d*6.95,-.15,d*19.18,.15);
    parts.push(obj(span,1.74,()=>{
      let s=flatSolid(span,.02,.32,'#aa967c',granite);
      for(let u=7.19;u<19.12;u+=.29)s+=stick(fac(d*u,.31),fac(d*u,1.69),.032,iron);
      for(const z of [.56,1.48])s+=capLine([fac(d*6.95,z),fac(d*19.18,z)],iron,.084);return s;
    }));
  }
  const fp=F.ring(-2.78,-.26,2.78,.26),top=u=>3.32+.51*Math.cos(u*Math.PI/5.35);
  parts.push(obj(fp,5.31,()=>{
    let s='';
    const curve=Array.from({length:29},(_,i)=>{const u=-2.75+i*5.5/28;return fac(u,top(u))});
    s+=capLine(curve,iron,.135)+capLine(curve.map(([x,y,z])=>[x,y,z+.16]),iron,.074);
    for(const d of [-1,1]){
      const anchor=2.67*d;
      s+=stick(fac(anchor,.06),fac(anchor,3.71),.084,iron);
      for(let j=0;j<5;j++){
        const x=d*(.54+j*.46),z=top(x)+.3;
        s+=capLine(Array.from({length:23},(_,i)=>{const a=i*.27,r=.24*(1-i/29);return fac(x+d*r*Math.cos(a),z+r*Math.sin(a))}),iron,.064);
      }
      s+=capLine([fac(d*.37,4.63),fac(d*.80,4.50),fac(d*1.29,4.68),fac(d*1.64,4.25),fac(d*2.48,3.74)],iron,.073);
      // Open double leaves lie against the inside faces of their piers.
      for(let j=0;j<7;j++){const v=.17+j*.32;s+=stick(F.at(anchor,v,.12),F.at(anchor,v,2.46+.19*Math.sin(j*.5)),.031,iron)}
      for(const z of [.34,2.36])s+=capLine([F.at(anchor,.08,z),F.at(anchor,2.18,z)],iron,.08);
    }
    const crest=Array.from({length:25},(_,i)=>fac(.42*Math.cos(i*Math.PI/12),4.65+.48*Math.sin(i*Math.PI/12)));
    s+=capLine(crest,iron,.095)+capLine([fac(-.23,4.86),fac(.23,4.86),fac(.17,4.52),fac(0,4.36),fac(-.17,4.52),fac(-.23,4.86)],iron,.068);
    return s+stick(fac(0,5.11),fac(0,5.30),.042,iron);
  }));
  return parts;
}

function coop(){
  const r=ccw(findBuilding('w427501616').ring);
  const body=painted(r,0,13.52,'#a05b48',p=>{
    brickwork(p,4.45,13.52,'#a05b48');
    if(p.normal[0]>.96 && p.w>10){
      const m=p.w/2;
      p.box(0,0,p.w,4.5,'#ae9e85');p.box(.55,.13,p.w-1.1,3.63,'#56605a');
      for(let i=0;i<4;i++)sash(p,(i+.5)*p.w/4,.44,2.12,2.56,i,'#776c5d');
      for(const z of [5.28,9.24])for(const k of [-1,0,1]){
        const x=m+k*p.w*.337;
        if(k===0&&z<6)arch(p,x,z,2.21,3.05,false,HS.trim);else sash(p,x,z,1.65,2.36,k+10,HS.trim)}
      p.box(0,4.43,p.w,.34,HS.trim);p.box(0,8.87,p.w,.18,'#c9af8a');
    }else{
      const n=Math.max(1,Math.floor(p.w/4.4));
      for(let i=0;i<n;i++)for(const z of [1.18,5.31,9.23])sash(p,(i+.5)*p.w/n,z,Math.min(1.3,p.w/n*.56),2.04,i+z);
    }
    p.box(0,13.05,p.w,.47,HS.trim);
  },'#948b7f');
  const F=localFrame([-5.58,-99.4],[.015,1]);
  const por=F.ring(-6.52,-1.35,6.52,0);
  const architrave=painted(por,3.81,4.58,'#d5c6a9',p=>{if(p.w>3)p.label('THE HARVARD COOP',p.w/2,4.20,p.w-.60,.42,'#716655','Georgia')});
  const portico=obj(por,4.58,()=>{
    let s='';for(const u of [-5.93,-2.10,2.10,5.93]){
      const c=F.point(u,-.87),r=polygon(...c,.32,10);
      s+=flatSolid(polygon(...c,.43,10),0,.26,HS.trim)+flatSolid(r,.26,3.54,HS.stone)+flatSolid(polygon(...c,.43,10),3.54,3.82,HS.trim);
    }return s+architrave.draw();
  });
  const ped=F.ring(-6.50,.0,6.50,3.15),high=16.35;
  const gable=obj(ped,high,()=>{
    const at=(x,z)=>F.at(x,-.04,z);
    let s=shape([at(-6.50,13.5),at(6.50,13.5),at(0,high)],HS.trim,.4);
    s+=shape([at(-5.65,13.76),at(5.65,13.76),at(0,15.92)],'#aea18b',.25);
    s+=shape(Array.from({length:24},(_,i)=>at(.72*Math.cos(i*Math.PI/12),14.49+.72*Math.sin(i*Math.PI/12))),'#e9ddc6',.32);
    s+=capLine([at(-.33,14.84),at(0,14.49),at(.39,14.62)],'#6d6254',.084);
    const tris=[[-6.5,0],[6.5,0],[0,2.85]];
    if(!vis([-F.ay[0],-F.ay[1],0]))s=shape(tris.map(([u,z])=>F.at(u,3.15,13.5+z)),'#ae886f',.38);
    for(const side of [-1,1]){
      const pts=[F.at(side*6.5,0,13.5),F.at(side*6.5,3.15,13.5),F.at(0,3.15,high),F.at(0,0,high)];
      if(vNewell(pts)[2]<0)pts.reverse();s+=solidFace(pts,lidColour('#807b74'));
    }
    return s;
  });
  return groupParts([body,portico,gable]);
}
function lehmanHall(){
  const F=buildingFrame('w29633562'),A=19.9,B=8.32,height=13.43;
  const body=painted(F.ring(-A,-B,A,B),0,height,'#9b533e',p=>{
    const n=p.side%2?4:9;
    brickwork(p,.55,height,'#9b533e');
    p.box(0,0,p.w,1.0,HS.granite);
    for(let i=0;i<n;i++){
      const x=(i+.5)*p.w/n;
      if(n===9&&i>=2&&i<=6){arch(p,x,1.02,1.95,6.0,false,HS.stone);sash(p,x,8.35,1.5,2.8,i);p.box(i*p.w/n+.02,1.1,.53,10.96,'#b79571')}
      else for(const z of [1.46,5.81,9.26])sash(p,x,z,1.31,2.06,i);
    }
    p.box(0,12.16,p.w,.42,HS.stone);p.box(0,13.09,p.w,.34,HS.trim);
  },'#857d76');
  const parts=[body];
  for(const d of [-1,1]){
    const G=localFrame(F.point(0,d*(B-.65)),F.ay);
    parts.push(roofPart(G,0,0,2.0,23.0,height,3.2,'gabled','#717370','#c1ad8a'));
  }
  return groupParts(parts);
}
function wadsworth(){
  const F=buildingFrame('w29684617',true);
  const face=p=>{
    for(let z=.32;z<6.5&&UPX<.56;z+=.27)p.box(0,z,p.w,.028,'#b79a69');
    const n=Math.max(2,Math.round(p.w/3.25)),s=p.w/n;
    for(let k=0;k<n;k++)for(const z of [.67,3.78]){
      const x=(k+.5)*s;
      if(k===(n-1)/2&&z<1){p.box(x-.81,.05,1.62,2.68,HS.trim);p.box(x-.63,.10,1.26,2.32,'#4f5a45')}
      else{for(const d of [-1,1])p.box(x+d*.76-.19,z,.38,1.76,'#4e5e4c');sash(p,x,z,1.03,1.74,k)}
    }
    p.box(0,6.29,p.w,.22,HS.trim);
  };
  const main=localFrame(F.point(8.2,0),F.ay);
  const roof=gambrel(main,0,0,17.12,12.50,6.5,2.52,1.62,'#866c56','#dbbe7b');
  const parts=[painted(main.ring(-8.56,-6.25,8.56,6.25),0,6.50,'#e3c685',face),roof];
  for(const u of [-6,-3,0,3,6])parts.push(dormer(main,u,-5.40,-1,6.65,1.17,1.16,'#89745c'));
  // The rear service ell is narrower and meets the main block at a right angle.
  parts.push(painted(F.ring(-14.65,-6.94,1.95,3.45),0,5.75,'#d9b878',face),
    roofPart(F,-6.35,-1.745,16.60,10.39,5.75,2.75,'gabled','#86735e','#dbbe7b'));
  for(const u of [-5.12,5.15])parts.push(chimney(main,u,.42,9.92,11.72));
  return groupParts(parts);
}
function matthews(){
  const b=findBuilding('w29824107'),F=buildingFrame(b.id),model=buildingModel(b),parts=[model];
  for(const d of [-1,1]){
    for(const u of [-17,0,17]){
      const G=localFrame(F.point(u,d*5.2),F.ay),r=G.ring(-2.77,-3.3,2.77,3.3);
      const bay=painted(r,10.20,15.27,'#aa614d',p=>{for(const z of [10.92,13.46])for(const x of [.27,.73])sash(p,p.w*x,z,.96,1.26,z)});
      parts.push(groupParts([bay,roofPart(G,0,0,5.54,6.60,15.27,4.92,'gabled','#665b59','#aa614d')]));
    }
  }
  for(const u of [-21,-9,9,21])parts.push(chimney(F,u,1.5,16.88,20.10,1.35,.96));
  return groupParts(parts);
}

// Door-to-door tenant placement on the Massachusetts Avenue block. A single OSM
// footprint has several separate stores. Project their map nodes onto its exposed edges.
function massAveShops(id){
  const b=findBuilding(id),first=facades.length,m=buildingModel(b),edges=facades.slice(first);
  for(const f of edges){f.shop=false}
  const tenants=new Map();
  for(const poi of b.pois.filter(p=>['bank','fast_food','convenience','mobile_phone','books','clothes','ice_cream','jewelry','restaurant','nightclub','craft'].includes(p.kind))){
    let best=null,dist=Infinity;
    for(const f of edges){
      if(f.cut||f.len<2.2||!f.street)continue;
      const dx=poi.x-f.start[0],dy=poi.y-f.start[1],t=Math.max(0,Math.min(f.len,dx*f.along[0]+dy*f.along[1]));
      const d=Math.hypot(dx-f.along[0]*t,dy-f.along[1]*t);
      if(d<dist){best={f,t};dist=d}
    }
    if(best){if(!tenants.has(best.f))tenants.set(best.f,[]);tenants.get(best.f).push({x:best.t,name:poi.name})}
  }
  for(const [f,shops] of tenants){
    shops.sort((a,b)=>a.x-b.x);f.shop=true;f.sign=shops[0].name;
    f.harvardPaint=p=>{
      const {w,box}=p,pitch=p.h>8?3.39:3.05;
      brickwork(p,3.48,p.h,f.body);box(0,p.h-.27,w,.27,'#c0a888');
      for(let z=4.1;z<p.h-1.5;z+=pitch)for(let i=0,n=Math.max(1,Math.round(w/3.06));i<n;i++)sash(p,(i+.5)*w/n,z,1.17,1.67,i+z);
      for(let i=0;i<shops.length;i++){
        const x=i?(shops[i].x+shops[i-1].x)/2:0,q=i+1<shops.length?(shops[i].x+shops[i+1].x)/2:w,sw=q-x;
        const c=['#45514b','#6f4436','#466878','#753d40'][i%4];box(x,.16,sw,3.38,c);
        const n=Math.max(2,Math.round(sw/2.05));
        for(let j=0;j<n;j++)box(x+.13+j*sw/n,j===0?.24:.54,Math.max(.12,sw/n-.23),j===0?2.40:2.10,glassInk(i+j+33));
        box(x,2.73,sw,.80,c);p.label(shops[i].name,x+sw/2,3.13,sw-.36,.47,'#f6e5c4');
      }
    };
  }
  return m;
}
function headstones(){
  const out=[],slates=['#77796f','#929084','#a79a86','#88877c'];
  for(let row=0;row<10;row++)for(let j=0;j<17;j++){
    const x=-118+j*5.04+row*.68+rnd(j+30*row)*1.44,y=-22+row*7.8+j*1.07+rnd(21*j+row)*2.0;
    if(!inside([x,y],burialGround)||!standable(x,y)||inRings([x,y],SCENE.paths)||SCENE.trees.some(([u,v])=>Math.hypot(u-x,v-y)<1.25))continue;
    const F=localFrame([x,y],[.50,-.867]),w=.51+rnd(x)*.33,h=.62+rnd(y)*.61;
    const r=F.ring(-w/2,-.09,w/2,.09),col=slates[(j+2*row)%4];
    out.push(obj(r,h,()=>{
      const arc=[[-w/2,.03],[-w/2,h*.69],[-w*.35,h*.76],[-w*.25,h*.91],[0,h],[w*.25,h*.91],[w*.35,h*.76],[w/2,h*.69],[w/2,.03]];
      const side=vis([...F.ay,0])?1:-1;
      return shape(arc.map(([u,z])=>F.at(u,side*.09,z)),col,.32)+capLine(arc.slice(1,-1).map(([u,z])=>F.at(u,side*.09,z)),'#a49d8d',.065);
    }));
  }
  return out;
}
const LANDMARKS=[
  {name:'Cambridge KiOSK',ids:['w38415391','w1411992366'],build:newsKiosk},
  {name:'Harvard station',ids:['w1366714342'],build:harvardStation},
  {name:'The Pit',ids:[],build:pitSteps},
  {name:'Visitor information booth',ids:['w653516582'],build:visitorBooth},
  {name:'Johnston Gate',ids:[],build:johnstonGate},
  {name:'Massachusetts Hall',ids:['w29938509'],build:massHall},
  {name:'Harvard Hall',ids:['w29934296'],build:harvardHall},
  {name:'Holden Chapel',ids:['w29684572'],build:holdenChapel},
  {name:'First Parish',ids:['w427504032'],build:firstParish},
  {name:'Harvard Coop',ids:['w427501616'],build:coop},
  {name:'Lehman Hall',ids:['w29633562'],build:lehmanHall},
  {name:'Wadsworth House',ids:['w29684617'],build:wadsworth},
  {name:'Matthews Hall',ids:['w29824107'],build:matthews},
  {name:'Old Burying Ground',ids:[],build:headstones},
  ...SCENE.buildings.filter(b=>b.id!=='w427501616'&&b.id.startsWith('w42750')&&['yes','retail'].includes(b.type)).map(b=>({name:'Shopfront '+b.id,ids:[b.id],build:()=>massAveShops(b.id)}))
];

function squareFigure(x,y,dir,k,kind){
  const F=localFrame([x,y],dir),fp=F.ring(-.46,-.43,.52,.44),p={...pedDressed(k),p:[x,y],d:F.ax,walked:0};
  if(kind==='graduate')p.shirt=k%8?'#383a3b':'#963e43';
  return obj(fp,2.15,()=>{
    let s=pedestrian(p,0).svg;
    if(kind==='graduate'){
      const z=1.84*p.tall;
      s+=flatSolid(F.ring(-.20,-.21,.20,.21),z-.13,z-.035,p.shirt)+shape(atZ(F.ring(-.285,-.285,.285,.285),z),'#343738',.32);
      s+=capLine([F.at(0,0,z+.015),F.at(.25,.23,z+.015),F.at(.27,.27,z-.18)],'#bf945a',.027);
    }
    if(kind==='guitar'){
      const g=(u,z)=>F.at(.26,u,z),gold='#ce995d';
      const outline=[[-.40,.87],[-.43,.97],[-.36,1.09],[-.25,1.11],[-.17,1.06],[-.08,1.08],[0,1.05],[.04,.98],[-.02,.88],[-.11,.86],[-.18,.84],[-.23,.75],[-.33,.76]];
      s+=shape(outline.map(([u,z])=>g(u,z)),gold,.38)+capLine([g(-.11,.99),g(.43,1.28)],'#7e5b41',.10);
      s+=ball(g(-.20,.95),.053,soft('#5d4937'));
    }
    return s;
  });
}
function guitarCase(x,y){
  const F=localFrame([x,y],[.59,.81]),ring=[[-.59,-.13],[-.51,-.25],[-.19,-.27],[.03,-.15],[.51,-.13],[.60,-.09],[.60,.10],[.46,.15],[.03,.14],[-.21,.27],[-.53,.23],[-.60,.12]];
  const r=ccw(ring.map(([u,v])=>F.point(u,v)));
  return obj(r,.17,()=>flatSolid(r,.01,.115,'#45413a','#76504c')+shape(atZ(r.map(([u,v])=>[x+(u-x)*.90,y+(v-y)*.82]),.127),'#544749',.26));
}
let lastOccasion,streetScene=[];
function CITY_EXTRA(){
  if(lastOccasion!==SEASON){
    lastOccasion=SEASON;streetScene=[];
    const safe=(x,y)=>standable(x,y)&&!inRings([x,y],SCENE.roads);
    if(SEASON.id==='commencement'){
      // Clusters follow the mapped approach between Massachusetts and Harvard halls.
      for(let i=0;i<26;i++){
        const cluster=Math.floor(i/5),a=(i%5)*2.4+cluster*.65,r=.88+(i%3)*.29;
        const x=23.8+cluster*5.74+Math.cos(a)*r,y=35.0+(x-24)*.19+(cluster%2?1.21:-1.16)+Math.sin(a)*r;
        if(safe(x,y))streetScene.push(squareFigure(x,y,[-Math.cos(a),-Math.sin(a)],301+i,i%5?'graduate':'guest'));
      }
    }
    if(SEASON.id==='pit'||SEASON.id==='summer'){
      const gig=SEASON.id==='pit',centre=[40.0,-110.45],crowd=gig?15:4;
      if(safe(...centre))streetScene.push(squareFigure(...centre,[-.45,.89],88,'guitar'));
      if(safe(39.65,-109.68))streetScene.push(guitarCase(39.65,-109.68));
      if(gig&&safe(41.04,-110.16)){
        const amp=rect(41.04,-110.16,.58,.38);
        streetScene.push(obj(amp,.59,()=>flatSolid(amp,.02,.59,'#424741','#666456')));
      }
      for(let i=0;i<crowd;i++){
        const a=(31+i*(121/Math.max(1,crowd-1)))*Math.PI/180,r=(i%2?4.35:3.15);
        const x=centre[0]+Math.cos(a)*r,y=centre[1]+Math.sin(a)*r;
        if(safe(x,y))streetScene.push(squareFigure(x,y,[-Math.cos(a),-Math.sin(a)],600+i,'listener'));
      }
    }
  }
  return streetScene.map((p,i)=>({...p,draw:()=>stamp('harvard-event'+i,p.draw,p.fp,0,p.h+.10)}));
}
