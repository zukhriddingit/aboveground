// Hynes at street level. Coordinates are plot metres. The OSM station outline
// includes two underground floors; only the photographed surface rooms are built.
const elevations = [];
const streetGlass = ['#86a4a6','#a9bcbb','#79959a','#b2bfba'];
const inkIron = '#41484a', limestone = '#d8c9b1', bronze = '#716b60';
const brick = '#a05e49', tin = '#848c8b';
const centreOf = ring => avg(ring.map(p=>[...p,0])).slice(0,2);
const shrinkTo = (ring, c, scale) => ring.map(p => [c[0]+(p[0]-c[0])*scale,c[1]+(p[1]-c[1])*scale]);
const roofInk = col => SEASON.snow ? mix(col,'#f6f0e6',.84) : col;
function faceAxes(a,b) {
  const len=Math.hypot(b[0]-a[0],b[1]-a[1]), ux=(b[0]-a[0])/len, uy=(b[1]-a[1])/len;
  return {a,b,len,n:[uy,-ux,0],at:(u,d,z)=>[a[0]+ux*u+uy*d,a[1]+uy*u-ux*d,z]};
}
function oriented(at,u0,u1,d0,d1) {
  return ccw([at(u0,d0,0),at(u1,d0,0),at(u1,d1,0),at(u0,d1,0)].map(p=>p.slice(0,2)));
}
function solid(ring,lo,hi,colour,paint,cap=colour) {
  const r=ccw(ring), faces=r.map((a,i)=>faceAxes(a,r[(i+1)%r.length])).filter(q=>q.len>.02);
  for(const q of faces) if(paint) q.key=elevations.push({q,lo,hi,paint})-1;
  return obj(r,hi,()=>{
    let svg='';
    for(const q of faces.filter(fa=>vis(fa.n)).sort((a,b)=>depthOf([...a.a,lo])-depthOf([...b.a,lo]))){
      svg+=shape([q.at(0,0,lo),q.at(q.len,0,lo),q.at(q.len,0,hi),q.at(0,0,hi)],tone(q.n,soft(colour)),.48);
      if(paint)svg+='<frontage key="'+q.key+'"/>';
    }
    return svg+shape(atZ(r,hi),roofInk(cap),.55);
  });
}
function together(parts) {
  const fp=hull(parts.flatMap(p=>p.fp));
  return obj(fp,Math.max(...parts.map(p=>p.h)),()=>planOrder(parts.map(p=>({fp:p.fp,z1:p.h,svg:p.draw()}))));
}
// Use the kit's frontage operation. A cached elevation costs one draw operation
// on rotation, even when the façade contains several hundred panes.
function paintFrontage(g,key) {
  const {q,lo,hi,paint}=elevations[key],L=q.len,H=hi-lo;
  const right=Dv((q.a[0]-q.b[0])/L,(q.a[1]-q.b[1])/L,0),down=Dv(0,0,-1);
  g.save();g.transform(...right,...down,...P(...q.b,hi));
  g.beginPath();g.rect(0,0,L,H);g.clip();
  const shade=c=>nightCol(dot(q.n,SUN)>.15?c:mix(c,'#807c91',.16));
  const box=(x,z,w,h,c)=>{g.fillStyle=shade(c);g.fillRect(x,hi-z-h,w,h)};
  const text=(str,x,z,h,w,c,serif=false)=>{
    // Lay out type in pixels, then scale the lettering to architectural metres.
    g.save();g.translate(x,hi-z);g.scale(h/48,h/48);
    g.font='600 48px '+(serif?'Georgia,serif':'Arial,sans-serif');g.fillStyle=shade(c);
    g.textAlign='center';g.textBaseline='middle';wallText(g,str,0,0,w*48/h);g.restore();
  };
  const win=(x,z,w,h,k=0,cols=2,frame='#655e55',glazing=streetGlass)=>{
    box(x-.08,z-.08,w+.16,h+.16,frame);box(x,z,w,h,glazing[Math.abs(k)%glazing.length]);
    if(w>.44 && UPX<.55){
      g.fillStyle=shade(mix(glazing[Math.abs(k)%glazing.length],'#e1e4d7',.27));
      g.beginPath();g.moveTo(x,hi-z-h);g.lineTo(x+w*.32,hi-z-h);g.lineTo(x+w*.12,hi-z);g.lineTo(x,hi-z);g.fill();
    }
    for(let j=1;j<cols;j++)box(x+w*j/cols-.034,z,.068,h,frame);
    box(x,z+h*.58,w,.074,frame);
  };
  paint({box,win,text,g,shade,L,H,lo,hi,q});
  g.restore();
}
function mainFront({box,win,text,L,q}) {
  if(L<2.5){box(0,0,L,28,limestone);return;}
  const primary=q.n[0]<-.9 || q.n[1]>.85;
  const bays=Math.max(1,Math.round(L/(primary?5.75:4.45))), bw=L/bays;
  box(0,0,L,28,primary?'#c4a77c':'#879594');
  for(let i=0;i<bays;i++){
    const x=bw*i;
    if(primary){
      box(x+.1,0,bw-.2,4.25,'#a48a78');
      win(x+.44,.24,bw-.88,3.18,i,2,inkIron);
      for(let j=0;j<6;j++){
        const z=4.9+j*3.78;
        win(x+.44,z,bw-.88,2.75,i*3+j,3,'#897f6a');
        box(x+.23,z-.22,bw-.46,.19,'#ded0b3');
        box(x+.22,z+2.86,bw-.44,.24,'#d5c1a0');
        box(x+.15,z+3.16,bw-.3,.09,'#ab9375');
      }
      box(x+.04,4.15,.20,23.4,'#e2cba1');
      box(x+bw-.25,4.15,.16,23.4,'#a98a63');
    }else{
      for(let j=0;j<8;j++){
        const z=.5+j*3.45;
        win(x+.24,z,bw-.48,2.67,i+j,2,'#788082',['#80979c','#9fb2b4','#91a6a7']);
      }
    }
  }
  if(q.n[0]<-.9){
    const station=(q.b[1]+19.70)*((q.b[1]-q.a[1]) / L);
    const x=station-2.65;
    for(const edge of [x-1.03,x+5.56]){
      box(edge,0,.81,4.23,'#a48a78');
      box(edge+.10,2.1,.63,.026,'#7b7167');
    }
    box(x+6.46,.08,2.9,3.13,'#c8c5b9');
    for(let j=0;j<4;j++)box(x+6.51,2.64+j*.15,2.8,.072,'#736f65');
    box(x-.25,0,5.8,4.06,'#6e6056');box(x,0,5.32,3.62,'#373d3d');
    for(let k=0;k<4;k++){
      const u=x+.16+k*1.25;box(u,.08,1.17,2.85,k===1?'#414646':'#857f70');
      box(u+.14,1.23,.89,1.43,'#54636a');box(u+.90,1.0,.065,.29,'#dad4c2');
    }
    for(let k=0;k<3;k++)box(x+.14,3.04+k*.14,5.02,.042,'#adab96');
    box(x,3.58,5.32,.49,'#888b7e');
    box(x+.16,3.66,.26,.16,'#ac5144');
    text('TJ MAXX',L*.73,3.88,.70,5.6,'#9a3838');
  }
  if(q.n[1]>.85){
    text('TJ MAXX',L*.79,3.88,.70,5.55,'#9a3838');
    box(4.55,.05,2.0,2.75,'#4b4941');
    for(let j=0;j<6;j++)box(4.67,.12+j*.19,1.75,.07,'#b7a995');
  }
  box(0,27.52,L,.5,primary?'#dec7a2':'#a0abaa');
}
function bladeT(at,u,d,z,r) {
  const point=(s,h)=>at(u,d+s,z+h);
  let v=shape(Array.from({length:26},(_,i)=>point(r*Math.cos(i*Math.PI/13),r*Math.sin(i*Math.PI/13))),inkIron,.5);
  v+=shape(Array.from({length:26},(_,i)=>point((r-.055)*Math.cos(i*Math.PI/13),(r-.055)*Math.sin(i*Math.PI/13))),'#f5f1e4',0);
  const bar=(x,y,w,h)=>shape([point(x,y),point(x+w,y),point(x+w,y+h),point(x,y+h)],'#292e2d',0);
  return v+bar(-r*.56,.05,r*1.12,r*.22)+bar(-r*.13,-r*.56,r*.26,r*.64);
}
function transitBuilding() {
  // The short return on the Pike and the longer Newbury frontage are part of
  // the surveyed trapezoid. Merge collinear doorway nodes into continuous walls.
  const r=ccw([[-.98,-27.94],[2.33,1.59],[36.84,-2.02],[33.31,-46.15],[8.13,-33.36],[7.92,-32.34]]);
  const c=[17.6,-19.4], pent=shrinkTo(r,c,.92), outer=shrinkTo(r,c,1.125);
  const body=solid(r,0,28.05,'#c6ac89',mainFront,'#999992');
  const glassTop=solid(pent,28.05,33.5,'#879393',({box,win,L})=>{
    const n=Math.max(1,Math.round(L/5.4));
    for(let i=0;i<n;i++)win(i*L/n+.25,28.64,L/n-.5,4.17,i,3,'#8f9791');
    box(0,33.1,L,.4,'#c0c2b7');
  },'#929693');
  const lips=[solid(outer,33.5,34.06,'#b0b5ab',null,'#a8aeab')];
  const chimney=[[29.5,-30.2],[33.1,-30.6],[34.2,-18.9],[30.6,-18.4]];
  lips.push(solid(chimney,34.06,36.4,'#96a4a0',null,'#bac2b9'));
  const awnings=[],braces=[],streetFixtures=[];
  for(let i=0;i<r.length;i++){
    const q=faceAxes(r[i],r[(i+1)%r.length]),{at,len:L,n}=q;
    if(L<9)continue;
    const count=Math.max(2,Math.round(L/5.4)), step=L/count;
    const primary=n[0]<-.9 || n[1]>.85;
    const fp=oriented(at,.05,L-.05,-1.55,2.58);
    braces.push(obj(fp,33.75,()=>{
      let v='';
      for(let j=0;j<count;j++){
        const u=(j+.5)*step;
        v+=edge(at(u,-1.15,28.15),at(u-step*.37,1.53,33.48),'#b8bbb2',.24);
        v+=edge(at(u,-1.15,28.15),at(u+step*.37,1.53,33.48),'#adb1a9',.24);
      }
      return v;
    }));
    if(!primary)continue;
    if(n[0]<-.9){
      const u=(-19.70-q.a[1])/(q.b[1]-q.a[1])*L;
      const bin=oriented(at,u+3.25,u+4.07,.75,1.35);
      streetFixtures.push(solid(bin,0,1.14,'#565956',({box,L})=>{
        box(.08,.92,L-.16,.14,'#343b39');box(.07,.12,.035,.70,'#74756e');
      },'#76786d'));
    }
    awnings.push(obj(fp,9.15,()=>{
      let v=shape([at(.2,0,4.52),at(L-.2,0,4.52),at(L-.2,2.58,4.34),at(.2,2.58,4.34)],roofInk('#a7c3bd'),.5);
      v+=edge(at(.2,2.58,4.34),at(L-.2,2.58,4.34),'#787f78',.22);
      for(let j=0;j<=count;j++){
        const u=Math.max(.25,Math.min(L-.25,j*step));
        v+=edge(at(u,0,8.72),at(u,2.53,4.4),'#a4a9a0',.24)+edge(at(u,0,4.51),at(u,2.55,4.35),'#7b857d',.12);
      }
      if(n[0]<-.9){
        const u=(-19.70-q.a[1])/(q.b[1]-q.a[1])*L;
        // Returns, louvers and an ajar metal door give the recessed threshold depth.
        for(const side of [-1,1]){
          const a=u+side*2.72;
          v+=shape([at(a,.01,0),at(a,.37,0),at(a,.37,3.71),at(a,.01,3.71)],'#796d5f',.34);
        }
        v+=shape([at(u-.86,.02,.07),at(u-.16,.48,.07),at(u-.16,.48,2.88),at(u-.86,.02,2.88)],'#77766c',.32);
        v+=shape([at(u-.75,.09,1.21),at(u-.25,.41,1.21),at(u-.25,.41,2.55),at(u-.75,.09,2.55)],'#586971',.23);
        v+=edge(at(u,0,3.67),at(u,1.16,3.67),inkIron,.11)+bladeT(at,u,1.02,3.63,.54);
      }
      return v;
    }));
  }
  // Keep each projecting bracket on its own face, so rear canopy ink cannot
  // cover the masonry. Stack the roof rim only after the upper struts.
  return obj(hull(outer.concat(awnings.flatMap(a=>a.fp))),36.4,()=>{
    const front=p=>{const m=centreOf(p.fp);return (m[0]-c[0])*CAM_V[0]+(m[1]-c[1])*CAM_V[1]>0};
    const ordered=(parts)=>planOrder(parts.map(p=>({fp:p.fp,z1:p.h,svg:p.draw()})));
    return ordered(streetFixtures.filter(p=>!front(p)))+ordered(awnings.filter(p=>!front(p)))+body.draw()+ordered(awnings.filter(front))+ordered(streetFixtures.filter(front))+
      ordered(braces.filter(p=>!front(p)))+glassTop.draw()+ordered(braces.filter(front))+ordered(lips);
  });
}
function boylstonHouse() {
  const r=ccw(SCENE.hynesEast),c=centreOf(r),rim=shrinkTo(r,c,1.04);
  const masonry=({box,L,q})=>{
    box(0,0,L,.28,'#a39582');
    for(let z=.28;z<3.56;z+=.109){
      box(0,z,L,.011,'#b67b62');
      if(UPX<.11)for(let x=(Math.floor(z/.109)%2)*.14;x<L;x+=.285)box(x,z,.011,.104,'#af765e');
    }
    if(q.n[0]>.7 && q.n[1]<-.25){
      box(.26,0,L-.52,3.4,'#884a3c');box(L*.18,0,L*.64,2.85,'#b39b7c');
      for(let i=0;i<3;i++){
        const x=L*.2+i*L*.2;box(x,.05,L*.18,2.35,'#726e56');box(x+.12,1,L*.18-.24,.97,'#4e5650');
      }
      box(L*.14,2.78,L*.72,.53,'#705f4b');box(L*.19,2.85,L*.62,.36,'#d9d3bb');
    }else if(L>5){
      for(let x=.5;x<L-2;x+=3.05)box(x,.43,2.56,2.4,'#aa5143');
    }
    box(0,3.17,L,.15,'#bd9375');
    for(let x=.1;x<L;x+=.35)box(x,3.28,.17,.16,'#d0b093');
  };
  const shell=solid(r,0,3.65,'#975842',masonry,'#898579'), wing=ccw(SCENE.hynesEastWing);
  const wc=centreOf(wing);
  const entranceParts=[shell,solid(rim,3.65,3.9,'#b29c81',null,'#837e71'),
    solid(wing,0,3.5,'#995b47',masonry,'#8c877b'),
    solid(shrinkTo(wing,wc,1.055),3.5,3.73,'#b09878',null,'#878274')];
  const street=[107.07,-67.43], end=[118,-72.66], dx=end[0]-street[0],dy=end[1]-street[1],len=Math.hypot(dx,dy);
  const at=(s,d,z)=>[street[0]+s*dx/len-d*dy/len,street[1]+s*dy/len+d*dx/len,z];
  // The approach continues off the plate: taper the cut at x=118 exactly.
  const bridge=oriented(at,0,len,-2.01,2.01).map(([x,y])=>[Math.min(x,118),y]);
  const walkway=obj(bridge,3.35,()=>{
    let v=shape(atZ(bridge,.14),roofInk('#ab745f'),.4);
    for(let s=.18;s<len;s+=.32){
      const across=Math.min(1.91,(118-at(s,0,0)[0])/(Math.abs(dy)/len));
      if(across>0)v+=edge(at(s,-1.91,.15),at(s,across,.15),'#bb8e73',.029);
    }
    for(const offset of [-1.95,1.95]){
      const n=Math.min(len,(118-at(0,offset,0)[0])/(dx/len));
      v+=edge(at(0,offset,1.24),at(n,offset,1.24),inkIron,.075)+edge(at(0,offset,.32),at(n,offset,.32),inkIron,.065);
      for(let s=.15;s<n;s+=.45)v+=edge(at(s,offset,.15),at(s,offset,1.24),inkIron,.045);
    }
    for(const d of [-1.79,1.79]){
      v+=stick(at(4.1,d,.17),at(4.1,d,.43),.21,'#a18a63')+
        stick(at(4.1,d,.45),at(4.1,d,2.76),.09,'#80795b')+
        ball(at(4.1,d,2.95),.22,soft('#dfd6b4'))+
        stick(at(4.1,d,3.14),at(4.1,d,3.25),.047,'#79745e');
    }
    return v;
  });
  return [together(entranceParts),walkway];
}
function westHouse() {
  const r=ccw(SCENE.hynesWest),c=centreOf(r);
  return together([solid(r,0,3.18,'#6f8483',({box,win,L})=>{
    const n=Math.max(1,Math.round(L/1.18));
    for(let i=0;i<n;i++)win(i*L/n+.06,.20,L/n-.12,2.66,i,1,'#626d6c',['#acc3c0','#a0b6b6']);
    box(0,2.83,L,.28,'#697373');
  }),solid(shrinkTo(r,c,1.07),3.18,3.44,'#888f85',null,'#b3b7ae')]);
}
function lyrikTower(id,hotel) {
  const b=findBuilding(id),r=ccw(b.outline), c=b.obb.c;
  const top=hotel?49.4:77.6, floors=hotel?13:20,base=5.2;
  // Wrap the rising ceramic fins around the real rounded ends. The glazing
  // bands share the elevations across the short facets of the surveyed curve.
  const body=solid(r,0,top,'#91acaa',({box,text,L,q})=>{
    const step=(top-base)/floors,n=Math.max(1,Math.round(L/(hotel?3.1:4.05)));
    const pane=L/n, pal=hotel?['#8ea9a6','#9bb5b2','#809f9e']:['#89a4a4','#9cb1ad','#829a9c'];
    const seed=Math.abs(Math.round(q.a[0]));
    box(0,0,L,base,'#708987');
    const largePanels=Math.max(1,Math.round(L/2.25));
    for(let i=0;i<largePanels;i++){
      const sw=L/largePanels;box(i*sw+.065,.22,Math.max(.1,sw-.13),base-.54,pal[(seed+i)%3]);
    }
    for(let j=0;j<floors;j++){
      const z=base+j*step;
      for(let i=0;i<n;i++)box(i*pane+.03,z+.08,pane-.04,step-.12,pal[(seed+i+Math.floor(j/4))%3]);
      box(0,z,L,j%3===0?.17:.065,j%3===0?'#c5cec8':'#6f8586');
    }
    if(L>1.8)for(let i=0;i<n;i++){
      box(i*pane+.025,base,.16,top-base,'#e0e1d6');
      if(!hotel)box(i*pane+.185,base,.105,top-base,'#79898a');
      box((i+.5)*pane,base,.048,top-base,'#6d8786');
    }
    box(0,top-.33,L,.3,'#d9dcd1');
    if(hotel && L>20 && q.n[1]>.45)text('citizenM',L*.36,top-2.05,1.4,8,'#f3eadb');
  },'#a7aaa4');
  const core=shrinkTo(r,c,hotel?.67:.77);
  return together([body,solid(core,top,top+(hotel?2.1:3.5),'#b3b8b1',({box,L})=>{
    for(let z=top+.32;z<top+3.1;z+=.4)box(0,z,L,.06,'#8f9995');
  },'#a3a7a0')]);
}
function lyrikPlaza() {
  const deckZ=4.4, result=SCENE.lyrikDeck.map(r=>solid(r,0,deckZ,'#c4bca8',({win,L})=>{
    const n=Math.max(1,Math.round(L/2.7));
    if(L>3)for(let i=0;i<n;i++)win(i*L/n+.14,.22,L/n-.28,3.83,i,1,'#718582');
  },'#d5c9ae'));
  const terrace=SCENE.lyrikDeck[0],features=[];
  for(const [i,[x,y]] of [[-92,3],[-87,10],[-87,-3],[-95,-10],[-86,-11],[-84,-4],[-79,3],[-88,-15]].entries()){
    const bed=polygon(x,y,2.05,10);
    if(!bed.every(p=>inside(p,terrace)))continue;
    const crown=polygon(x,y,1.42+i%3*.20,9);
    features.push(obj(bed,deckZ+4.0,()=>{
      let v=loft(atZ(bed,deckZ),atZ(bed,deckZ+.42),n=>tone(n,soft('#b49e82')))+shape(atZ(bed,deckZ+.42),roofInk('#7c925e'),.4);
      v+=edge([x,y,deckZ+.43],[x,y,deckZ+2.7],'#826b53',.14);
      if(SEASON.leaves==='bare'){
        for(let j=0;j<5;j++)v+=edge([x,y,deckZ+1.52],[...crown[j],deckZ+3.25],'#856f55',.09);
      }else{
        const col=SEASON.leaves==='autumn'?'#bd8848':SEASON.leaves==='spring'?'#92b86b':'#789b5a';
        v+=loft(atZ(shrinkTo(crown,[x,y],.48),deckZ+2.1),atZ(crown,deckZ+2.85),n=>tone(n,soft(col)))+
          peak(crown,deckZ+2.85,[x,y,deckZ+3.95],col);
      }
      return v;
    }));
  }
  const stair=faceAxes([-54.9,-8.8],[-63.3,-2.3]);
  const treads=[];
  for(let j=0;j<19;j++)treads.push(solid(oriented(stair.at,j*stair.len/19,(j+1)*stair.len/19,-2.3,2.3),0,(j+1)*deckZ/19,'#b9ae9a',null,'#d2c6b3'));
  const lift=solid(findBuilding('w1304549658').outline,0,6.9,'#97b4b3',null,'#b6c5c0');
  const showroom=solid(findBuilding('w1312242245').outline,0,3.8,'#ada58e',({win,L})=>{
    if(L>2)win(.15,.2,L-.3,3.3,1,Math.max(1,Math.round(L/1.65)),inkIron);
  },'#beb9a9');
  // Stairs, terrace and planting are one low model; each tower keeps its own
  // footprint for the street-level depth sort.
  return [together(result.concat(features,treads,[lift,showroom])),westHouse()];
}
function shopDoors(p,sign,colour) {
  const {L,box,win,text}=p,n=Math.max(1,Math.round(L/2.4)),w=L/n;
  box(0,0,L,3.65,colour);
  for(let i=0;i<n;i++){
    const door=i===Math.floor(n*.5);
    win(i*w+.13,door?.1:.47,w-.26,door?2.5:2.14,i,door?1:2,'#3f4948');
    if(door)box(i*w+.25,1.02,.045,.36,'#d3c4a6');
    else {
      const colours=['#b9a275','#746b63','#a16e52','#a7a58d'];
      box(i*w+.18,.65,w-.36,.09,'#837663');
      if((i+sign.length)%2){
        for(let j=0;j<3;j++)box(i*w+.27+j*(w-.55)/3,.75,.15+(j%2)*.12,.34+j*.07,colours[(j+i)%4]);
      }else{
        box(i*w+w*.28,.80,w*.46,.59,'#b39471');
        box(i*w+w*.32,.88,w*.38,.40,'#d7c8ad');
      }
    }
  }
  if(sign)text(sign,L/2,3.12,.66,L-.55,'#f5ebd2');
}
function newburyShop(b) {
  const r=ccw(b.outline),north=b.obb.c[1]>0, large=b.id==='w29718133';
  const southDepot=b.id==='w29805588';
  const n=large?5:north?3:southDepot?2:styleFor(b).levels;
  const h=n*(large?3.8:3.48)+.45, col=pickOf(styleFor(b).wall,b.id);
  const body=solid(r,0,h,col,p=>{
    const {q,L,box,win,text}=p, street=(north?q.n[1]<-.86:q.n[1]>.86) || (large&&q.n[0]<-.88);
    if(L<1)return;
    const bays=Math.max(1,Math.round(L/(large?4.45:3.1))),bw=L/bays;
    for(let j=street?1:0;j<n;j++)for(let i=0;i<bays;i++){
      const x=i*bw+.21*bw,z=j*h/n+.55;
      win(x,z,bw*.58,2.25,j+i,large?2:1,large?'#59635f':'#5c554e');
      box(x-.14,z-.19,bw*.58+.28,.16,'#cca68b');
      box(x-.08,z+2.32,bw*.58+.16,.11,'#ac826b');
      if(street && !large){
        box(x-.15,z+2.41,bw*.58+.30,.11,'#b19173');
        for(let k=0;k<6;k++)box(x-.08+(bw*.58+.12)*k/6,z+2.43,.046,.18,'#98664d');
      }
    }
    if(street){
      const poi=b.pois.filter(x=>!['massage','office','bicycle_rental','shelter'].includes(x.kind));
      const labels=large?(q.n[1]<-.86?['MUJI','Urban Outfitters']:['Urban Outfitters']):poi.map(x=>x.name);
      if(labels.length>1 && L>20){
        const w=L/labels.length;
        for(let i=0;i<labels.length;i++){
          const g=p.g;g.save();g.translate(i*w,0);shopDoors({...p,L:w},labels[i],i%2?'#434745':'#625551');g.restore();
        }
      }else shopDoors(p,labels[0]||'',pickOf(CITY.shops.fascias,b.id));
      if(labels.length){
        const titles=labels.slice(0,L>17?3:1), span=L/titles.length;
        for(const [i,name] of titles.entries()){
          box(i*span+.12,3.72,span-.24,.70,pickOf(CITY.shops.fascias,b.id+i));
          text(name,i*span+span*.5,4.06,.51,span-.74,'#f5edd7');
        }
      }
      if(southDepot){
        box(L*.08,.1,L*.37,3.25,'#6a675f');
        for(let k=0;k<9;k++)box(L*.09,.3+k*.3,L*.35,.032,'#a9a59a');
      }
    }
    box(0,h-.48,L,.18,'#815947');box(0,h-.24,L,.16,limestone);
    if(street&&!large)for(let x=.13;x<L;x+=.42)box(x,h-.63,.18,.17,'#c49472');
  },'#807e78');
  const seed=hash(b.id),c=b.obb.c, cap=solid(shrinkTo(r,c,1.012),h,h+.22,'#a7836d',null,pickOf(['#777b76','#8f8b7e','#7a7773','#858680'],b.id));
  const parts=[body,cap];
  for(let i=0;i<(large?4:1+seed%2);i++){
    const x=c[0]+(rnd(seed+i)-.5)*3.8,y=c[1]+(i<2?1:-1)*(1.1+rnd(seed+i+49)*6.6);
    const housing=oriented((u,d,z)=>[x+u*.994+d*.109,y-u*.109+d*.994,z],-1.0,1,-.65,.65);
    if(housing.every(p=>inside(p,r)))parts.push(solid(housing,h+.22,h+.78,'#989992',({box,L})=>{
      if(L>1)for(let x=.22;x<L-.16;x+=.16)box(x,h+.32,.06,.30,'#768084');
    },'#b2b0a5'));
  }
  if(!large){
    const x=c[0]+(rnd(seed+9)-.5)*2.2,y=c[1]-3.2-rnd(seed+53)*4.1, skylight=oriented((u,d,z)=>[x+u*.994+d*.109,y-u*.109+d*.994,z],-1.38,1.38,-.88,.88);
    if(skylight.every(p=>inside(p,r)))parts.push(obj(skylight,h+1.12,()=>{
      const top=h+.94,tilt=skylight.map((p,i)=>[...p,i<2?h+.52:top]);
      return loft(atZ(skylight,h+.22),tilt,n=>tone(n,soft('#807d70')))+shape(tilt,roofInk('#a5bab9'),.5)+
        edge(tilt[0],tilt[1],'#717b7a',.085);
    }));
  }
  const face=r.map((a,i)=>faceAxes(a,r[(i+1)%r.length])).find(q=>(north?q.n[1]<-.86:q.n[1]>.86)&&q.len>4);
  if(face && b.pois.length && !large && !southDepot){
    const {at,len}=face,awning=['#566750','#864f42','#53636a','#aa926c'][hash(b.id)%4];
    const fp=oriented(at,.22,len-.22,0,.97);
    if(hash(b.id)%3!==1)parts.push(obj(fp,3.92,()=>{
      const a=at(.22,.01,3.73),b=at(len-.22,.01,3.73),c=at(len-.22,.97,3.48),d=at(.22,.97,3.48);
      return shape([a,b,c,d],roofInk(awning),.42)+shape([d,c,at(len-.22,.97,3.29),at(.22,.97,3.29)],awning,.34);
    }));
    if(b.pois.some(p=>p.name==='Johnson Paint')){
      const blade=oriented(at,len*.24,len*.24+.14,.03,1.73);
      parts.push(solid(blade,3.9,6.4,'#dcccab',({text,L})=>{
        if(L>1){text('JOHNSON',L/2,5.63,.32,L-.15,'#7b4537');text('PAINT',L/2,4.89,.45,L-.15,'#384b53');}
      },'#6d6b60'));
    }
  }
  return together(parts);
}
function commonwealthHouse(b) {
  const r=ccw(b.outline),c=b.obb.c, col=pickOf(styleFor(b).wall,b.id);
  const h=10.7+rnd(hash(b.id))*.96, attic=shrinkTo(r,c,.79);
  const sides=block(r,0,h,{facade:'brick',wall:col,trim:'#b18d76',floor:3.5,bay:2.4,top:'#a18b79'});
  const model=obj(r,h+2.65,()=>sides.draw()+loft(atZ(r,h+.08),atZ(attic,h+2.65),n=>tone(n,soft(roofInk('#657176'))))+shape(atZ(attic,h+2.65),roofInk('#868581'),.42));
  const qs=r.map((a,i)=>faceAxes(a,r[(i+1)%r.length])).filter(q=>q.n[1]>.9);
  const fr=qs.sort((a,b)=>b.len-a.len)[0];
  if(!fr||fr.len<3.2)return model;
  const {at,len:L}=fr,bw=Math.min(2.66,L*.47),u=L*.66;
  const bay=ccw([[u-bw/2,0],[u-bw/2-.04,.55],[u-bw*.29,1.05],[u+bw*.29,1.05],[u+bw*.5,.55],[u+bw*.5,0]].map(([s,d])=>at(s,d,0).slice(0,2)));
  const projection=solid(bay,1.08,h-.33,col,({win,L,box})=>{
    for(let j=0;j<3;j++){const z=1.52+j*3.18;if(L>.48)win(.10,z,L-.20,1.93,j,1,'#67574a');box(0,z+2.25,L,.14,limestone);}
  },'#99836f');
  const parts=[model,projection];
  for(let i=0;i<4;i++)parts.push(solid(oriented(at,L*.12,L*.36,i*.26,(i+1)*.26),0,.96-i*.22,'#a38b75'));
  for(const off of [.3,.72]){
    const dd=oriented(at,L*off-.54,L*off+.54,-.47,-.06);
    parts.push(solid(dd,h+.2,h+1.83,'#b4a38d',({win,L})=>{if(L>.7)win(.13,h+.43,L-.26,1.07,0,1)},'#6e7473'));
  }
  return together(parts);
}
function clubHouse() {
  const r=ccw(findBuilding('w29942904').outline), h=16.75;
  const shell=solid(r,0,h,'#965641',p=>{
    const {box,win,L,q}=p,front=q.n[1]>.83 && q.n[0]>.28 && q.a[1]>100;
    const n=Math.max(1,Math.round(L/(front?3.55:4.4))),w=L/n;
    if(front)box(0,0,L,4.8,'#d8cbb4');
    for(let j=0;j<4;j++)for(let i=0;i<n;i++){
      const z=.85+j*4.0;win(i*w+w*.21,z,w*.58,2.70,i+j,2,front?'#d0bda4':'#846b57');
      box(i*w+w*.18,z-.18,w*.64,.14,limestone);
    }
    box(0,4.76,L,.22,limestone);box(0,h-.5,L,.32,'#ddceb4');
    if(front){box(L/2-1.48,0,2.96,3.8,'#816e59');win(L/2-1.22,.12,2.44,3.19,1,2,bronze);}
  },'#9d9181');
  const front=faceAxes([-34.97,105.15],[-63.17,117.53]),{at,len:L}=front;
  const port=oriented(at,L*.34,L*.66,0,1.0),column=obj(port,4.53,()=>{
    let v='';
    for(let i=0;i<4;i++){
      const x=L*.36+i*L*.094;v+=stick(at(x,.74,.22),at(x,.74,4.21),.245,'#e1d3b9');
      v+=edge(at(x-.37,.74,4.18),at(x+.37,.74,4.18),limestone,.29);
    }
    return v+shape(atZ(port,4.5),roofInk(limestone),.44);
  });
  const setback=oriented(at,1.35,L-1.35,-16.1,-10.05);
  return together([shell,solid(setback,h,h+3.25,'#a46c59',({win,L})=>{
    const n=Math.max(1,Math.round(L/3.3));for(let i=0;i<n;i++)win(i*L/n+.38,h+.40,L/n-.76,1.95,i);
  },'#898883'),column]);
}
function eliotHotel() {
  const r=ccw(findBuilding('w405398217').outline),c=[-29.4,86.0],h=25.5;
  const shell=solid(r,0,h,'#ac7958',({box,win,L,q})=>{
    box(0,0,L,4.3,'#c7b896');const n=Math.max(1,Math.round(L/2.61)),w=L/n;
    for(let j=0;j<8;j++)for(let i=0;i<n;i++){
      const z=.66+j*3.1;win(i*w+w*.23,z,w*.54,j?1.98:2.8,i+j,1,'#d5c8a6');
      box(i*w+w*.19,z-.14,w*.62,.13,limestone);
    }
    box(0,4.24,L,.24,limestone);box(0,20.35,L,.18,'#d4c0a0');box(0,h-.44,L,.3,'#79a199');
  },'#8a8e85');
  const upper=solid(shrinkTo(r,c,.87),h,h+2.75,'#84a09a',({win,L})=>{
    if(L>3)for(let x=1.3;x<L-1;x+=3.0)win(x,h+.4,1.1,1.65,1,1,'#b8bca7');
  },'#92998e');
  const door=faceAxes([-16.14,95.97],[-34.97,105.15]);
  return together([shell,upper,solid(oriented(door.at,7,13.7,0,2.35),3.21,3.62,'#486955',null,'#597a64')]);
}
function bookStore() {
  const b=findBuilding('w814009096'),r=b.outline;
  return solid(r,0,4.95,'#a05d47',p=>{
    if(p.q.n[1]>.85)shopDoors(p,'Berklee Bookstore','#9e3d3a');
    p.box(0,4.18,p.L,.33,'#c4a280');p.box(0,4.66,p.L,.18,'#985540');
  },'#898982');
}
function sherman() {
  const b=findBuilding('w405398155'),r=b.outline;
  return solid(r,0,16.3,'#ab6652',p=>{
    const {L,box,win,q}=p,n=Math.max(1,Math.round(L/3.65)),w=L/n;
    for(let i=0;i<n;i++){
      const glass=q.n[0]>.8 && (q.b[1]+(q.a[1]-q.b[1])*(i+.5)/n)>53.1;
      if(glass)box(i*w,0,w,16.3,'#597172');
      for(let j=0;j<4;j++)win(i*w+(glass?.06:.38),j*4.0+.36,w-(glass?.12:.76),glass?3.82:2.95,i,2,inkIron);
    }
    if(q.n[1]<-.6||q.n[0]>.8)shopDoors(p,'ROOM & BOARD','#494740');
    box(0,15.94,L,.27,'#8e7867');
  },'#969187');
}
function meterModel() {
  const p=streetMeter;
  if(!p)return [];
  const {x,y}=p,fp=rect(x,y,.52,.42);
  return together([solid(fp,0,1.18,'#494e4d'),solid(rect(x,y,.58,.47),1.18,1.64,'#565b5a',({box,L})=>{
    if(L>.48){box(.10,1.34,.34,.21,'#979e91');box(.15,1.38,.22,.12,'#63858a');}
  },'#7a8079')]);
}
// prep.py assigns the same vending symbol to ticket machines and parking
// meters. The only above-ground meter here gets its own slim street model.
const streetMeter=SCENE.furniture.find(f=>f.k==='vending');
SCENE.furniture=SCENE.furniture.filter(f=>f.k!=='vending');
const newburyLots=SCENE.buildings.filter(b=>b.address.endsWith(' Newbury Street')&&b.obb.c[0]>0&&b.id!=='w405398172'&&b.obb.W>1.7);
const domesticLots=SCENE.buildings.filter(b=>b.address.endsWith(' Commonwealth Avenue')&&!b.cut&& b.obb.c[0]>34 && !b.lv);
const boylstonLots=SCENE.buildings.filter(b=>b.address.endsWith(' Boylston Street') && b.obb.c[1]<-89 && b.id!=='w814009096');
function rearCourtCars(){
  // The Prudential Tower photograph shows nose-in parking behind the shops.
  const places=[[70,-39],[76,-43],[78.8,-43],[84.3,-44.6],[87.1,-45],[92.7,-45.5],[98.3,-46.6],[101.1,-46.9],[109.5,-47.8]];
  return places.map(([x,y],i)=>obj(rect(x,y,2.45,4.85),2.05,()=>{
    const v=carProps(50+i);
    return drawVehicle(v.mesh,{c:[x,y],d:[.11,.994],z:.045,mats:{paint:v.m}});
  }));
}
function smallShop(b){
  const r=b.outline,h=4.55+rnd(hash(b.id))*.6, c=pickOf(CITY.styles.default.wall,b.id);
  return solid(r,0,h,c,p=>{
    if(p.q.n[1]>.85)shopDoors(p,b.n||b.pois[0]?.name||'',pickOf(CITY.shops.fascias,b.id));
    p.box(0,h-.37,p.L,.13,limestone);p.box(0,h-.14,p.L,.12,'#93654f');
  },'#928b83');
}

const LANDMARKS=[
  {name:'Hynes station and the Boston Transit Building',ids:['w405398172'],build:transitBuilding},
  {name:'Boylston headhouse and bridge',build:boylstonHouse},
  {name:'Lyrik terraces and west headhouse',ids:['w1312517994','w1304549658','w1312242245'],build:lyrikPlaza},
  {name:'1001 Boylston',ids:['w1312517993'],build:()=>lyrikTower('w1312517993',false)},
  {name:'citizenM',ids:['r17575546'],build:()=>lyrikTower('r17575546',true)},
  {name:'Harvard Club clubhouse',ids:['w29942904'],build:clubHouse},
  {name:'Eliot Hotel',ids:['w405398217'],build:eliotHotel},
  {name:'Sherman Building',ids:['w405398155'],build:sherman},
  {name:'Berklee Bookstore',ids:['w814009096'],build:bookStore},
  {name:'Newbury stable block and corner shops',ids:newburyLots.map(b=>b.id),build:()=>newburyLots.map(newburyShop)},
  {name:'Commonwealth bay houses',ids:domesticLots.map(b=>b.id),build:()=>domesticLots.map(commonwealthHouse)},
  {name:'Boylston storefronts',ids:boylstonLots.map(b=>b.id),build:()=>boylstonLots.map(smallShop)},
  {name:'Newbury parking meter',build:meterModel},
  {name:'Station roof parking court',build:rearCourtCars}
];
function crowdFigure(x,y,dir,id,t=0,walked=0) {
  const who={...pedDressed(id),p:[x,y],d:dir,walked};
  return obj(rect(x,y,.57,.57),2.12,()=>pedestrian(who,t).svg);
}
const streetY=x=>x<37.93?17.93+(x+8.8)*(8.74-17.93)/46.73:8.74+(x-37.93)*(-9.54)/80.07;
function barricade(x,y){
  const a=faceAxes([x-.13,y-1.04],[x+.13,y+1.04]);
  return obj(oriented(a.at,0,a.len,-.3,.3),1.02,()=>{
    let svg='';
    for(const s of [.16,a.len-.16])for(const k of [-1,1])svg+=edge(a.at(s,k*.31,0),a.at(s,0,1.0),'#8c8371',.085);
    const board=(s,t,z,h,c)=>shape([a.at(s,0,z),a.at(t,0,z),a.at(t,0,z+h),a.at(s,0,z+h)],c,.3);
    svg+=board(0,a.len,.55,.23,'#e7ddc5')+board(0,a.len,.85,.18,'#f3e9d6');
    for(let i=.08;i<a.len-.27;i+=.49)svg+=board(i,i+.24,.56,.21,'#c17c4b');
    return svg;
  });
}
function displayTable(x,y,k) {
  const fp=rect(x,y,1.85,.88);
  return obj(fp,1.18,()=>{
    let svg='';
    for(const [a,b] of fp)svg+=edge([a,b,.03],[a,b,.73],inkIron,.064);
    svg+=shape(atZ(fp,.75),['#b79d76','#9d7860','#a47e69'][k%3],.4);
    for(let j=0;j<4;j++){
      const item=rect(x-.60+j*.37,y,.27,.39);
      svg+=shape(atZ(item,.82),['#b4894e','#566b65','#aa6660','#c9bba3'][(k+j)%4],.3);
    }
    return svg;
  });
}
function musicSet(x,y) {
  const v=[];
  for(const s of [-1,1]){
    const base=rect(x+s*1.85,y+.35,.64,.46);
    v.push(solid(base,.1,.92,'#464b49',({box,L})=>{box(.05,.2,L-.1,.59,'#565959')},'#666964'));
  }
  v.push(crowdFigure(x-.67,y,[0,1],813),crowdFigure(x+.77,y,[.07,1],815));
  const kit=rect(x-.05,y+.33,2.65,1.0);
  v.push(obj(kit,1.7,()=>{
    const keyboard=rect(x+.8,y+.35,1.21,.32);
    let out=shape(atZ(keyboard,.94),'#4d5150',.5)+shape(atZ(rect(x+.8,y+.48,1.05,.14),.946),'#eadfcb',.3);
    for(let i=0;i<10;i++)out+=edge([x+.32+i*.105,y+.47,.95],[x+.32+i*.105,y+.55,.95],inkIron,.028);
    out+=edge([x+.37,y+.36,0],[x+1.25,y+.36,.91],inkIron,.065)+edge([x+1.25,y+.36,0],[x+.37,y+.36,.91],inkIron,.065);
    const neck=[x-.18,y+.30,1.45],base=[x-.70,y+.30,.94];
    out+=ball(base,.21,soft('#b98450'))+edge(base,neck,bronze,.075);
    out+=edge([x-.9,y+.63,.03],[x-.9,y+.63,1.53],inkIron,.036)+edge([x-.9,y+.63,1.53],[x-.7,y+.35,1.53],inkIron,.04);
    return out;
  }));
  return v;
}
let lastSpecial=null, staticProps=[];
function CITY_EXTRA(t) {
  if(lastSpecial!==SEASON){
    lastSpecial=SEASON;staticProps=[];
    if(SEASON.id==='open-newbury'){
      const feeds=FEEDS.filter((_,i)=>!SCENE.routes[i].onNewbury).map(f=>({...f,walkSpeed:1.08,interval:f.interval/(f.kind==='ped'?1.45:1)}));
      TRAFFIC=streetSimulation(feeds,PHONE?82:130,360);
      for(const dy of [-2.35,1.1])staticProps.push(barricade(2.85,streetY(2.85)+dy));
      for(let i=0;i<7;i++){
        const x=20+i*13.3,y=streetY(x)+(i%2?3.10:-3.29);
        if(rect(x,y,1.85,.88).every(p=>standable(...p)))staticProps.push(displayTable(x,y,i));
      }
    }
    if(SEASON.id==='patio'){
      const x=-79.8,y=-89.85;
      if(rect(x,y,4.65,1.3).every(p=>standable(...p)))staticProps.push(...musicSet(x,y));
      for(let i=0;i<17;i++){
        const px=x+(rnd(i+375)-.5)*9.3,py=y+1.62+rnd(i+155)*1.85;
        if(standable(px,py) && !inRings([px,py],SCENE.roads))staticProps.push(crowdFigure(px,py,[.13,-.99],i+80));
      }
    }
  }
  const parts=staticProps.map((p,i)=>({...p,draw:()=>stamp('hynes-event'+i,p.draw,p.fp,0,p.h+.16)}));
  if(SEASON.id==='open-newbury'){
    for(let i=0;i<(PHONE?20:36);i++){
      const sign=i%2?-1:1,s=(t*(.66+rnd(i+43)*.46)+i*7.3)%108;
      const x=4+(sign>0?s:108-s),y=streetY(x)+(rnd(i+25)-.5)*4.23;
      if(standable(x,y))parts.push(crowdFigure(x,y,[sign*.994,-sign*.111],i+400,t,s));
    }
  }
  return parts;
}

// The highway and pedestrians use different vertical levels here. Render the
// visible cut through its surveyed openings; the mapped bridge pavement stays
// at sidewalk height. Clip the depressed lanes at each parapet in projection.
const streetGradeGround=cityGround;
const cutLanes=SCENE.pikeWays.map(p=>({path:p,lengths:p.slice(1).map((b,i)=>Math.hypot(b[0]-p[i][0],b[1]-p[i][1]))}));
function pikeSection(r) {
  const z=-3.8, bed=SEASON.snow?'#9a9894':SEASON.wet?'#737b7b':'#858686';
  // The ground-coloured paint is confined to the aperture. The far retaining
  // face is visible, the near wall hides the vehicles below its coping.
  let ink=shape(atZ(r,0),'#978f80',0)+shape(atZ(r,z),bed,0);
  for(const lane of cutLanes){
    for(let i=0;i<lane.lengths.length;i++){
      const f=faceAxes(lane.path[i],lane.path[i+1]),w=lane.lengths[i];
      for(const off of [-6.9,6.9])ink+=edge(f.at(0,off,z+.02),f.at(w,off,z+.02),'#cbbd91',.12);
      for(const off of [-3.3,0,3.3]){
        let marks='';
        for(let u=1.65;u<w-.2;u+=8.4)marks+=pd([f.at(u,off,z+.02),f.at(Math.min(u+3.2,w),off,z+.02)],false);
        ink+='<path d="'+marks+'" fill="none" stroke="#d3d2c6" style="stroke-width:0.12"/>';
      }
    }
  }
  const walls=r.map((p,i)=>faceAxes(p,r[(i+1)%r.length]));
  for(const f of walls){
    if(vis(f.n))continue;
    ink+=shape([f.at(0,0,z),f.at(f.len,0,z),f.at(f.len,0,0),f.at(0,0,0)],tone(f.n.map(x=>-x),soft('#b5a99a')),.32);
    for(let u=2;u<f.len;u+=5.5)ink+=edge(f.at(u,0,z),f.at(u,0,0),'#a39687',.06);
  }
  return clipTo(atZ(r,0),ink);
}
cityGround=function(){
  let s=streetGradeGround();
  const alley=[[51.5,-32.2],[83.3,-36.2],[96.2,-41.1],[117.8,-43.2],[117.8,-52.5],[98.3,-50.2],[75.1,-46.9],[58.3,-36.6]];
  s+=shape(atZ(alley,.01),roofInk('#ab8374'),.38);
  for(const rr of SCENE.pikeCut){
    const r=ccw(rr);
    s+=pikeSection(r);
    for(let j=0;j<r.length;j++){
      const f=faceAxes(r[j],r[(j+1)%r.length]);
      if(f.len<5||Math.abs(f.a[0])>117.95&&Math.abs(f.b[0])>117.95||Math.abs(f.a[1])>117.95&&Math.abs(f.b[1])>117.95)continue;
      s+=edge(f.at(0,0,.06),f.at(f.len,0,.06),'#b4aa95',.42)+edge(f.at(0,0,.74),f.at(f.len,0,.74),'#797d72',.09);
      for(let u=.35;u<f.len;u+=2.7)s+=edge(f.at(u,0,.05),f.at(u,0,.74),'#7f8175',.08);
    }
  }
  return s;
};
