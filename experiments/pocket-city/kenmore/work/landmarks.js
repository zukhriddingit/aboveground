// Kenmore Square, in metres in the 6.17-degree plot. See sources.md for the survey,
// street photographs, building drawings and the historical position of the sign.
const kenRing = id => ccw(findBuilding(id).ring);
const lerpPoint = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
const xyOf = p => p.slice(0,2);
const kStone='#e1cdb5', kIron='#3d4447', kSteel='#8b9999';
const kGlass=['#73979e','#92afb0','#78969e','#a9bdba'];
const streetObstacles=[];
function kAxes(c,u) {
  return (s,v,z=0)=>[c[0]+u[0]*s-u[1]*v,c[1]+u[1]*s+u[0]*v,z];
}
function kRect(at,l,w) {
  return ccw([at(-l/2,-w/2),at(l/2,-w/2),at(l/2,w/2),at(-l/2,w/2)].map(xyOf));
}
function kWire(points,col,width,close=false) {
  return '<path d="'+pd(points,close)+'" fill="none" stroke="'+col+'" style="stroke-width:'+f(width)+'" stroke-linejoin="round"/>';
}
function kSides(r,bottom,top,col,cap) {
  const lo=atZ(r,bottom), hi=atZ(r,top);
  return loft(lo,hi,n=>tone(n,soft(col)))+shape(hi,cap||col,.55);
}
function kOrder(parts) {
  return planOrder(parts.map(p=>({fp:p.fp,z0:p.z0||0,z1:p.z1,svg:p.draw()})));
}
function kModel(part) { return obj(part.fp,part.z1,part.draw); }
function kVolume(id,z,h,style) { return block(kenRing(id),z,h,style); }
function kCap(c) { return SEASON.snow?snowy(c,.80):c; }

// Keep the kit's canvas elevation pipeline. Named faces receive a single measured
// local drawing in metres. Along the outside of a kit face x increases to the left.
const usualElevation=paintSingaporeElevation;
paintSingaporeElevation=function(g,id) {
  const F=facades[id], painter=F.st.kenmore;
  if(!painter || F.cut) return usualElevation(g,id);
  const X=Dv(...F.along,0), Y=Dv(0,0,-1), p=P(...F.start,F.h);
  g.save(); g.transform(...X,...Y,...p); g.beginPath(); g.rect(0,0,F.len,F.h-F.z);g.clip();
  const L=F.len,H=F.h-F.z;
  // All the following elevations use heights above the bottom, even on stepped volumes.
  const shade=c=>nightCol(dot(F.n,SUN)>.14?c:mix(c,'#877b85',.14));
  function fill(x,z,w,h,c) { g.fillStyle=c;g.fillRect(x,H-z-h,w,h); }
  function panel(x,z,w,h,c) { fill(x,z,w,h,shade(c)); }
  function poly(pts,c) {
    g.fillStyle=c;g.beginPath();pts.forEach(([x,z],i)=>i?g.lineTo(x,H-z):g.moveTo(x,H-z));g.closePath();g.fill();
  }
  function textAt(txt,x,z,width,height,c,weight='bold') {
    g.fillStyle=c;g.font=weight+' '+height+'px Arial, sans-serif';g.textAlign='center';
    wallText(g,txt,x,H-z,width);
  }
  function window(x,z,w,h,seed,frame='#e3d6c4') {
    panel(x-.09,z-.10,w+.18,h+.20,frame);
    const light=SEASON.night && rnd(seed+.23)<(SEASON.litShare||.62);
    fill(x,z,w,h,light?(seed%3?'#ffe7a8':'#ffd98a'):shade(kGlass[Math.abs(seed)%4]));
    panel(x,z+h*.52,w,.075,'#566364');
    if(w>1.65)panel(x+w*.5-.044,z,.088,h,'#59666a');
    panel(x-.14,z-.15,w+.28,.11,frame);
  }
  function arch(x,z,w,h,c) {
    const r=w/2, spring=z+h-Math.min(r,h*.28), rise=z+h-spring;
    const pts=[[x,z],[x+w,z]];
    for(let j=0;j<=14;j++)pts.push([x+r+r*Math.cos(Math.PI*j/14),spring+rise*Math.sin(Math.PI*j/14)]);
    poly(pts,c);
  }
  if(painter==='citgo') {
    if(L>10) {
      const lit=!!SEASON.night;
      fill(0,0,L,H,lit?'#fff8e0':'#f4eee2');
      // Three facets of the shallow pyramidal relief sit over the horizontal strips.
      if(UPX<.6)for(let z=.3;z<H;z+=.39)fill(.14,z,L-.28,.032,lit?'#f6e5cc':'#c6c7bd');
      const apex=[L*.50,H*.91],left=[L*.87,H*.36],right=[L*.13,H*.36],centre=[L*.50,H*.49];
      poly([left,apex,centre],lit?'#ff8a3d':'#ed5a31');
      poly([apex,right,centre],lit?'#f26a2e':'#db3c2a');
      poly([right,left,centre],lit?'#f65039':'#b82d2a');
      textAt('CITGO',L*.5,H*.105,L*.83,H*.246,lit?'#2749a0':'#214681','900');
      panel(0,H-.12,L,.12,'#a0a2a1');panel(0,0,L,.12,'#8b999b');
    }
  } else if(painter==='beacon') {
    // 660 Beacon: pale masonry piers and five tiers of grouped industrial sash.
    const facade=F.n[1]<-.65, bays=Math.max(1,Math.round(L/(facade?5.5:4.8))), w=L/bays;
    panel(0,0,L,4.5,facade?'#c8b498':'#b4a081');
    for(let i=0;i<bays;i++){
      if(facade){window(w*i+.25,.48,w-.5,3.05,i,'#776f5b');panel(w*i+.28,3.57,w-.56,.40,'#374641');}
      for(let j=0;j<5;j++){
        const z=4.85+j*3.1;
        window(w*i+.44,z,w-.88,2.10,31*i+j,'#b5a68c');
        if(UPX<.55)for(const frac of [.25,.75])panel(w*i+.44+(w-.88)*frac,z,.07,2.10,'#5e655f');
      }
      panel(i*w,4.54,.27,H-4.54,'#e3d0ac');
    }
    for(const z of [4.35,16.97,H-.68,H-.22])panel(0,z,L,.17,'#efdcba');
  } else if(painter==='hotel') {
    const front=F.n[1]>.72, bays=Math.max(1,Math.round(L/(front?5.0:4.25))), w=L/bays;
    panel(0,0,L,4.93,'#ddceb7');
    for(let i=0;i<bays;i++){
      const s=w*i;
      if(w>1.8){
        arch(s+.22,.28,w-.44,4.0,shade('#bfae94'));
        arch(s+.41,.36,w-.82,3.71,SEASON.night?'#ffe7a8':shade('#718988'));
        panel(s+w/2-.04,.37,.08,3.23,'#544f49');
      }
      const stone=front && (i%3===0 || L<30);
      if(stone) panel(s+.30,4.95,w-.60,H-4.95,'#dfd3bf');
      for(let j=0;j<3;j++){
        const z=5.52+j*3.52, frac=stone?.77:.53;
        const ww=w*frac;window(s+(w-ww)*.5,z,ww,2.40,7*i+j,'#e6d6bc');
        if(stone){panel(s+.25,z-.34,w-.50,.18,'#b8a994');panel(s+.25,z+2.52,w-.50,.12,'#f0e3cc');}
      }
    }
    for(const z of [4.62,H-.54,H-.19])panel(0,z,L,.16,'#f0debd');
    // Project mapped shop nodes onto only their own street face.
    if(front && L>8)for(const shop of SCENE.pois.filter(p=>['Blue Ribbon',"Hunt's Photo & Video"].includes(p.name))){
      const dx=shop.x-F.start[0],dy=shop.y-F.start[1],u=dx*F.along[0]+dy*F.along[1];
      if(u>2&&u<L-2 && Math.abs(dx*F.n[0]+dy*F.n[1])<12){
        const ww=Math.min(6,u*1.8,(L-u)*1.8);
        panel(u-ww/2,2.95,ww,.72,'#353f3d');textAt(shop.name,u,3.12,ww-.3,.49,'#f4e7d0');
      }
    }
  } else if(painter==='bay') {
    for(let j=0;j<3;j++) {
      const z=.61+j*3.52;
      window(.14,z,Math.max(.2,L-.28),2.34,j+Math.round(L),'#eee1c8');
      panel(0,z-.4,L,.20,'#b6a591');panel(0,z+2.53,L,.14,'#eee2ce');
    }
  } else if(painter==='board') {
    if(L>1.0) {
      fill(0,0,L,H,F.st.board);
      textAt(F.st.label,L*.5,H*.36,L*.92,H*.61,F.st.letters||'#fff3df');
      if(F.st.sub){fill(0,0,L,H*.24,'#e9ebd9');textAt(F.st.sub,L*.5,H*.035,L*.92,H*.185,'#343f3f');}
    }
  } else if(painter==='addition') {
    // Vertical white frames break up the blue-grey curtain wall above the garage screen.
    const bays=Math.max(1,Math.round(L/3.8)),w=L/bays;
    panel(0,0,L,6.0,'#696d6b');
    for(let z=.45;z<5.9;z+=.39)panel(0,z,L,.095,'#a1a7a0');
    for(let i=0;i<bays;i++){
      if(i%3===0)panel(i*w,0,.22,6,'#c7c3b6');
      for(let j=0;j<4;j++) window(i*w+.16,6.18+j*3.23,w-.32,2.98,19*i+j,'#d5d8cd');
      if(i%6===0)panel(i*w,6,.48,H-6,'#efeadc');
    }
  } else if(painter==='residence') {
    const bays=Math.max(1,Math.round(L/3.18)),w=L/bays;
    panel(0,0,L,6.55,'#d4c6ad');
    for(let i=0;i<bays;i++) {
      const x=w*(i+.19);
      for(let j=0;j<9;j++)window(x,.6+j*3.22,w*.62,1.99,11*i+j,'#d8c6af');
      if(w>2)panel(w*i,0,.18,6.4,'#b8a990');
    }
    for(const z of [3.25,6.46,25.82,H-.57,H-.19])panel(0,z,L,.17,'#ead8bb');
    if(F.n[1]<-.7&&L>70){
      const x=L*.56;arch(x-1.53,.03,3.06,4.0,shade('#ab9983'));arch(x-1.32,.03,2.64,3.78,shade('#515f60'));
      panel(x-1.15,2.72,2.3,.42,'#8b3936');textAt('610',x,2.78,1.45,.33,'#ffefda');
    }
  } else if(painter==='chabad') {
    const front=F.n[1]<-.65, bays=Math.max(1,Math.round(L/3.1)),w=L/bays;
    panel(0,0,L,3.74,'#ddcfbb');
    for(let i=0;i<bays;i++)for(let j=0;j<3;j++)window(i*w+w*.24,1.07+3.48*j,w*.53,2.09,7*i+j,'#d4bda9');
    if(front){
      panel(L*.62,.6,L*.25,2.37,'#464b46');panel(L*.64,.76,L*.21,1.99,'#7b8c8b');
      textAt('491  CHABAD HOUSE',L*.51,3.17,L*.88,.40,shade('#514940'));
    }
    panel(0,H-.47,L,.28,'#ba9b7b');panel(0,H-.13,L,.13,'#544e47');
  } else if(painter==='lift'||painter==='booth') {
    panel(.06,.36,L-.12,H-.91,'#79969a');
    for(let u=.08;u<L;u+=.85)panel(u,.34,.08,H-.83,'#4e5856');
    for(const z of [.42,1.65,H-.71])panel(0,z,L,.08,'#434847');
    if(F.n[1]>.6 && painter==='lift'){
      panel(L*.18,.05,L*.64,2.24,'#a9aaa4');panel(L*.5-.025,.06,.05,2.2,'#535954');
      panel(.04,2.48,L-.08,.45,'#227257'); textAt('KENMORE',L/2,2.58,L*.92,.31,'#fff2d8');
    }
  } else if(painter==='bus') {
    panel(0,.04,L,.47,'#e4aa3a');panel(0,.57,L,.28,'#39485e');
    if(L>4){
      for(let i=0;i<6;i++)window(.25+i*(L-.4)/6,1.1,(L-.55)/6-.12,1.30,i,'#394449');
      panel(.15,2.57,L-.3,.14,'#ddb34c');
      for(const u of [L*.78,L*.88])panel(u,.13,.072,2.27,'#414d4a');
    } else {panel(.14,1.18,L-.28,1.24,'#586e77');panel(.16,2.48,L-.32,.42,'#303b39');
      textAt('KENMORE',L*.5,2.56,L*.83,.22,'#ffcf7a');
      for(const u of [.14,L-.42])fill(u,.66,.26,.14,'#fff3c4');}
  }
  g.restore();
};

function beaconAndSign() {
  const base=kVolume('w29559484',0,20.95,{wall:'#d5bd94',kenmore:'beacon',top:'#8a8980'});
  const marker=SCENE.pois.find(p=>p.name==='Citgo Sign');
  // OSM faces 65/245 degrees true. Face normal in the rotated plate is +18.83°.
  const angle=(25-SCENE.meta.rotation)*Math.PI/180;
  const at=kAxes([marker.x,marker.y],[Math.sin(angle),-Math.cos(angle)]);
  const size=60*.3048, bottom=20.95+40*.3048, top=bottom+size;
  const frame=kRect(at,17.6,5.8), cabinet=kRect(at,size,1.12);
  const faces=block(cabinet,bottom,top,{wall:'#bab9b0',top:'#c2c4bc',kenmore:'citgo'});
  return obj(base.fp,top+.08,()=>{
    let lattice='';
    for(const v of [-2.8,2.8]){
      const columns=[-8.35,-2.79,2.79,8.35];
      for(const u of columns)lattice+=edge(at(u,v,20.95),at(u,v*.2,bottom),kIron,.21);
      for(let j=0;j<2;j++){
        const z=20.95+j*(bottom-20.95)/2, z2=z+(bottom-20.95)/2;
        const v1=v*(1-.4*j),v2=v*(1-.4*(j+1));
        lattice+=edge(at(-8.35,v1,z),at(8.35,v1,z),kIron,.16);
        for(let i=0;i<3;i++)lattice+=edge(at(columns[i],v1,z),at(columns[i+1],v2,z2),kIron,.105)
          +edge(at(columns[i+1],v1,z),at(columns[i],v2,z2),kIron,.105);
      }
    }
    for(const u of [-8.35,8.35])lattice+=edge(at(u,-2.8,20.95),at(u,.56,bottom),kIron,.17)
      +edge(at(u,2.8,20.95),at(u,-.56,bottom),kIron,.17);
    const roof=base.draw()+shape(atZ(base.fp,20.96),kCap('#8d8880'),.35)+kWire(atZ(base.fp,21.1),'#d5c29f',.31,true);
    return kOrder([{...base,draw:()=>roof},{fp:frame,z0:20.95,z1:bottom,draw:()=>lattice},{...faces,z0:bottom}]);
  });
}

function hotelFront() {
  const id='w29650741', r=kenRing(id), b=findBuilding(id), c=b.obb.c;
  const wall=16.8, top=20.6, body=block(r,0,wall,{wall:'#b37e5f',kenmore:'hotel',top:'#998d82'});
  // A steep slate apron around a flat deck. The source footprint steps forward
  // at the east pavilion. Inset each roof point in the hotel's own axes.
  const u=b.obb.ax,v=[-u[1],u[0]];
  const deck=r.map(([x,y])=>{
    const dx=x-c[0],dy=y-c[1],s=(dx*u[0]+dy*u[1])*.969,t=(dx*v[0]+dy*v[1])*.843;
    return [c[0]+u[0]*s+v[0]*t,c[1]+u[1]*s+v[1]*t];
  });
  const bays=[];
  for(let i=0;i<r.length;i++){
    const a=r[i],b=r[(i+1)%r.length],dx=b[0]-a[0],dy=b[1]-a[1],span=Math.hypot(dx,dy);
    if(-dx/span<.88 || span<17)continue;
    const count=Math.round(span/13);
    for(let k=0;k<count;k++){
      const center=lerpPoint(a,b,(k+.5)/count), at=kAxes(center,[dx/span,dy/span]);
      // Faceted oriel windows project from the masonry between the arched
      // ground floor and slate roof. Each three-window bay has its own cornice.
      const fp=ccw([at(-2.24,0),at(-2.24,-.39),at(-1.35,-1.02),at(1.35,-1.02),at(2.24,-.39),at(2.24,0)].map(xyOf));
      const bay=block(fp,4.94,16.31,{kenmore:'bay',wall:'#deceba',top:'#b9afa0'});
      bays.push({...bay,z0:4.94,normal:[dy/span,-dx/span,0]});
    }
  }
  const hc=kAxes([-30.3,-31.96],[.996,-.087]);
  const awning=kRect(kAxes(xyOf(hc(0,1.27)),[.996,-.087]),5.6,2.5);
  const crown=block(awning,3.16,3.83,{wall:'#3b4440',top:'#55584f',kenmore:'board',board:'#35413b',label:'HOTEL COMMONWEALTH',letters:'#e5cfa6'});
  const equipment=[[-88,-48,6.5,2.1],[-75,-50,4.7,2.2],[-31,-55,5.1,2.5]].map(([x,y,l,w])=>
    kRect(kAxes([x,y],[.996,-.082]),l,w));
  return obj(hull([ ...r,...awning,...bays.flatMap(p=>p.fp)]),top+1.5,()=>{
    let rafters='';
    for(let i=0;i<r.length;i++){
      const j=(i+1)%r.length,a=r[i],d=r[j],len=Math.hypot(d[0]-a[0],d[1]-a[1]);
      const ax=[(d[0]-a[0])/len,(d[1]-a[1])/len],normal=[ax[1],-ax[0],0];
      const plane=[[...a,wall],[...d,wall],[...deck[j],top],[...deck[i],top]];
      if(!vis(vNewell(plane))) continue;
      rafters+=shape(plane,kCap(tone(normal,soft('#566165'))),.4);
      if(UPX<.5 && len>3)rafters+=sheetInk(plane,'slate',[ax[0],ax[1],0],norm(sub(plane[3],plane[0])));
      if(len<6||normal[1]<.5||!vis(normal))continue;
      const bays=Math.max(1,Math.round(len/7.6));
      for(let k=0;k<bays;k++){
        const t=(k+.5)/bays,low=lerpPoint(a,d,t),hi=lerpPoint(deck[i],deck[j],t);
        const at=kAxes(lerpPoint(low,hi,.14),ax);
        const front=(s,z)=>at(s,0,z), peakZ=wall+3.24;
        const dormer=[front(-1.21,wall+.1),front(1.21,wall+.1),front(1.21,wall+2.25),
          front(.68,wall+2.92),front(0,peakZ),front(-.68,wall+2.92),front(-1.21,wall+2.25)];
        rafters+=shape(dormer,'#e4d7bd',.43)
          +shape([front(-.77,wall+.28),front(.77,wall+.28),front(.77,wall+2.04),front(-.77,wall+2.04)],
            SEASON.night&&k%3?'#ffe7a8':'#879fa5',.3)
          +edge(front(0,wall+.28),front(0,wall+2.04),'#e1d6bf',.09)
          +edge(front(-.78,wall+1.19),front(.78,wall+1.19),'#e1d6bf',.08);
      }
    }
    const roof=rafters+shape(atZ(deck,top),kCap('#81817a'),.65)+kWire(atZ(r,wall),'#d8c5a7',.26,true)
      +equipment.map(fp=>kSides(fp,top,top+.86,'#8c938c',kCap('#b0b2a8'))).join('');
    // The north façade has a deep step in plan. The convex hull used by the kit's
    // sorter encloses several oriels, so it cannot find their shared wall. Use
    // that wall's actual outward normal to hide those bays behind the hotel
    // from Newbury; plan-order the projections against one another on each side.
    const frontage=[...bays,{...crown,z0:3.16,normal:[.087,.996,0]}];
    return kOrder(frontage.filter(p=>!vis(p.normal)))+body.draw()+roof+kOrder(frontage.filter(p=>vis(p.normal)));
  });
}

function rearHotel() {
  const rear=kVolume('w93458629',0,19.8,{wall:'#dfd9c8',kenmore:'addition',top:'#a1a09a'});
  const bridge=kVolume('w822618764',3.8,17.4,{wall:'#d8d2bd',facade:'glass',glass:kGlass,top:'#98958a'});
  return [obj(rear.fp,rear.z1,()=>rear.draw()+shape(atZ(rear.fp,19.82),kCap('#9e9c92'),.5)),kModel(bridge)];
}
function residence() {
  const part=kVolume('w29557600',0,29.65,{kenmore:'residence',wall:'#a2614f',top:'#e4dfd0'});
  return obj(part.fp,29.93,()=>part.draw()+shape(atZ(part.fp,29.67),kCap('#e3dfd1'),.55)
    +kWire(atZ(part.fp,29.82),'#c9ad93',.29,true));
}
function rowHouse() {
  const p=kVolume('r9712516',0,11.15,{wall:'#9e5745',kenmore:'chabad',top:'#787c78'});
  const at=kAxes([52.93,26.87],[.996,-.086]);
  const stepFoot=ccw([at(-2.7,-.02),at(-.1,-.02),at(-.1,-1.6),at(-2.7,-1.6)].map(xyOf));
  return obj(hull([...p.fp,...stepFoot]),11.3,()=>{
    let entry='';
    for(let j=0;j<4;j++){
      const d=-1.6+.32*j,fp=ccw([at(-2.7,d),at(-.1,d),at(-.1,d+.32),at(-2.7,d+.32)].map(xyOf));
      entry+=kSides(fp,0,.16*(j+1),'#afa99b','#cdc3b0');
    }
    // The Pluralism Project's entrance photograph records the metal menorah.
    entry+=edge(at(2.0,-.85,.04),at(2.0,-.85,2.44),'#a8a89e',.073);
    for(let k=1;k<=4;k++)for(const sign of [-1,1]){
      const u=2.0+sign*k*.215;
      entry+=kWire([at(2,-.85,1.04+(4-k)*.17),at(u,-.85,1.7+(4-k)*.07),at(u,-.85,2.19)],'#a8a89e',.06);
    }
    return kOrder([{...p,draw:()=>p.draw()+shape(atZ(p.fp,11.16),kCap('#787c78'),.47)},
      {fp:stepFoot,z1:2.45,draw:()=>entry}]);
  });
}
function elevator(id,round) {
  const p=kVolume(id,0,round?4.42:3.36,{wall:round?'#797977':'#95afb0',kenmore:'lift',top:'#666a67'});
  return obj(p.fp,p.z1+.11,()=>p.draw()+kWire(atZ(p.fp,p.z1-.16),'#404944',.18,true)
    +shape(atZ(p.fp,p.z1+.07),kCap('#68716e'),.50));
}
function stair(at,len,width,sign) {
  const fp=kRect(at,len+.4,width+.45),rail='#505652';
  streetObstacles.push(fp);
  const x=len/2-.2, across=[at(x,1)[0]-at(x,0)[0],at(x,1)[1]-at(x,0)[1]];
  const face=kRect(kAxes(xyOf(at(x,0)),across),width+.18,.13);
  const panel=sign?block(face,2.66,3.28,{wall:'#427365',top:'#676e62',kenmore:'board',board:'#187453',label:'KENMORE',sub:'GREEN LINE · ALL TRAINS'}):null;
  return obj(fp,sign?3.6:1.17,()=>{
    let interior=shape(atZ(fp,.09),'#b3a38d',.4);
    const atDepth=(s,v,z)=>at(s-len/2,v,z);
    for(let i=0;i<12;i++){
      const s=i*len/12,x=(i+1)*len/12;
      interior+=shape([atDepth(s,-width/2,.11),atDepth(x,-width/2,.11),atDepth(x,width/2,.11),atDepth(s,width/2,.11)],
        mix('#d8cbbb','#343b38',i/12),0)+edge(atDepth(s,-width/2,.12),atDepth(s,width/2,.12),'#8c8981',.05);
    }
    const parts=[];
    for(const side of [-1,1]){
      const y=side*(width/2+.1);
      const ring=ccw([at(-len/2,y-.09),at(len/2,y-.09),at(len/2,y+.09),at(-len/2,y+.09)].map(xyOf));
      parts.push({fp:ring,z1:1.02,draw:()=>kSides(ring,.11,.89,'#565955','#777975')+edge(at(-len/2,y,.96),at(len/2,y,.96),rail,.125)});
    }
    if(sign){
      for(const v of [-width/2,width/2]) interior+=edge(at(x,v,.90),at(x,v,3.14),'#747d78',.09);
      interior+=panel.draw();
      const glass=at(x-.03,width*.41,1.40),far=at(x-.03,-width*.41,2.38);
      interior+=shape([glass,[far[0],far[1],1.4],far,[glass[0],glass[1],2.38]],'#384749',.32)
        +edge(at(x-.05,-width*.33,2.18),at(x-.05,width*.33,2.18),'#88ad9b',.17);
    }
    return interior+kOrder(parts);
  });
}
function kRoundel(at) {
  const fp=kRect(at,1.4,.45);
  return obj(fp,4.22,()=>{
    const disc=(r,c)=>shape(Array.from({length:22},(_,i)=>at(r*Math.cos(i*Math.PI/11),0,3.54+r*Math.sin(i*Math.PI/11))),c,.38);
    return edge(at(0,0,.04),at(0,0,3.7),kIron,.12)+disc(.68,kIron)+disc(.58,'#f4f1df')
      +edge(at(-.35,0,3.76),at(.35,0,3.76),'#303937',.147)+edge(at(0,0,3.75),at(0,0,3.21),'#303937',.14);
  });
}
function northEntry() {
  const at=kAxes([-48.82,37.46],[-.972,-.236]);
  return [stair(at,3.25,2.22,true),kRoundel(kAxes([-49.68,35.87],[.236,-.972]))];
}
function southDoor() {
  const at=kAxes([-53.20,-35.7],[.997,-.075]),fp=kRect(at,3.95,1.65);
  const roof=ccw([at(-2.04,-.1),at(2.04,-.1),at(2.04,1.18),at(-2.04,1.18)].map(xyOf));
  const fascia=block(roof,2.65,3.05,{wall:'#515950',top:'#71766d',kenmore:'board',board:'#1a7757',label:'KENMORE'});
  return obj(fp,3.42,()=>{
    const flat=(s,z)=>at(s,.12,z);
    if(!vis([.075,.997,0]))return '';
    return shape([flat(-1.8,.1),flat(1.8,.1),flat(1.8,2.75),flat(-1.8,2.75)],'#424845',.3)
      +fascia.draw();
  });
}
function busway() {
  // The footprint tapers westward. The nine transverse frames are cantilevered
  // from the platform side and reach out over the arriving bus, as in SGH's section.
  const r=kenRing('w308329579'), back0=[-85.83,-6.49],back1=[-44.22,-10.42];
  const tip0=[-85.10,-.77],tip1=[-43.23,1.71];
  function arc(t,q,lower=0) {
    const foot=lerpPoint(back0,back1,t),tip=lerpPoint(tip0,tip1,t),a=q*Math.PI/2;
    const f=.06+.94*(1-Math.cos(a)),height=4.65+t*2.23;
    const xy=lerpPoint(foot,tip,f);
    return [...xy,.23+height*Math.sin(a)-lower*.63*Math.sin(Math.PI*q)];
  }
  const platformStairs=[stair(kAxes([-58.30,-5.59],[-.996,.088]),5.0,2.15,false),
    stair(kAxes([-65.75,-4.89],[.996,-.084]),4.75,2.15,false)];
  const busAt=kAxes([-73.80,.98],[.9974,-.0716]);
  const busRing=kRect(busAt,12.1,2.52), coach=block(busRing,.47,3.08,{wall:'#f0ebdc',top:'#efeadf',kenmore:'bus'});
  streetObstacles.push(busRing);
  const stopAt=kAxes([-50.5,-7.58],[.996,-.084]);
  const stopSign=block(kRect(stopAt,3.1,.13),2.14,2.78,{wall:'#3c554b',top:'#535e57',kenmore:'board',
    board:'#217359',label:'KENMORE',sub:'GREEN LINE'});
  const drawnBus=()=>{
    let ink=coach.draw();
    for(const v of [-1.27,1.27]){
      if(!vis([.0716*Math.sign(v),.9974*Math.sign(v),0]))continue;
      for(const s of [-3.78,3.69]){
        const circle=(rad,col)=>shape(Array.from({length:16},(_,i)=>busAt(s+rad*Math.cos(i*Math.PI/8),v,.55+rad*Math.sin(i*Math.PI/8))),col,.28);
        ink+=circle(.55,'#3d4241')+circle(.25,'#9b9e96');
      }
    }
    return ink+shape(atZ(kRect(busAt,3.35,1.63),3.23),'#c6c9bf',.45);
  };
  return obj(hull([...r,...busRing]),7.4,()=>{
    let under=platformStairs.map(m=>m.draw()).join('');
    const bus={fp:busRing,z1:3.23,draw:drawnBus};
    const foundation=ccw([back0,back1,lerpPoint(back1,tip1,.55),lerpPoint(back0,tip0,.5)]);
    under=kSides(foundation,.03,.16,'#aaa59a','#c3aaa0')+under;
    for(const u of [-1.39,1.39])under+=edge(stopAt(u,0,.17),stopAt(u,0,2.72),'#68736c',.10);
    under+=stopSign.draw();
    const ribs=[],bays=[];
    for(let k=0;k<9;k++){
      const t=.032+.936*k/8;
      const top=[],bot=[];
      for(let j=0;j<=9;j++){top.push(arc(t,j/9));bot.push(arc(t,j/9,1));}
      let ink=kWire(top,'#859497',.19)+kWire(bot,'#586a6b',.15);
      for(let j=1;j<9;j++)ink+=edge(bot[j],top[j+1],'#67787b',.115);
      const base=arc(t,0);ink+=stick([base[0],base[1],.16],[base[0],base[1],.88],.17,'#808780');
      ribs.push({fp:[xyOf(top[0]),xyOf(top[9]),[top[9][0]+.14,top[9][1]]],z1:top[9][2],draw:()=>ink});
    }
    for(let j=1;j<=6;j++){
      // Glass covers the upper arcs. The lower stainless-steel legs remain open.
      const q0=.32+.68*(j-1)/6,q=.32+.68*j/6;
      let ink='<g opacity="'+(SEASON.snow?'.62':'.36')+'">'+shape([arc(.015,q0),arc(.985,q0),arc(.985,q),arc(.015,q)],SEASON.snow?'#efece0':j%2?'#a2cccc':'#b9d8d2',0)+'</g>';
      ink+=edge(arc(.015,q),arc(.985,q),'#829f9e',.085);
      bays.push(ink);
    }
    return under+kOrder([bus,...ribs])+bays.join('');
  });
}

// Kenmore Row is the hard-paved public forecourt visible in the hotel's entrance
// photograph. Preserve the OSM boundary and the other mapped lawns.
for(const l of SCENE.lawns) if(l.kind==='common')SCENE.walk.push(l.r);
SCENE.lawns=SCENE.lawns.filter(l=>l.kind!=='common');
SCENE.furniture=SCENE.furniture.filter(f=>f.k!=='bus_stop'); // the bespoke station replaces the kit shelter
// The mapped sidewalk passes the north stairs in front of Cornwall's. Bridge
// the narrow gaps between the kit's footway strokes and the building line.
SCENE.walk.push([[[-86,31.7],[-31.6,44.9],[-30.6,40.9],[-85,27.6]]]);
SCENE.walk.push([[[-70.3,6.1],[-62,6.2],[-62.1,10.3],[-70.5,9.8]]]);
// Restore the two uninterrupted one-way main-street journeys omitted by prep's
// fourteen-route cap. Vertices are from the supplied Commonwealth Avenue ways.
SCENE.routes.unshift({kind:'car',name:'Commonwealth Avenue',p:[[-120,-11.33],[1.8,-20.42],[120,-30.67]]},
  {kind:'car',name:'Commonwealth Avenue',p:[[120,5.37],[-3.72,16.24],[-24.96,17.93],[-65.72,21.25],[-74.74,20.98],[-90.3,18.98],[-106.02,16.9],[-120,15.72]]});
function squareLantern(f) {
  const {x,y}=f, fp=rect(x,y,4.35,4.35),c=(r,z)=>atZ(polygon(x,y,r,6),z);
  return obj(fp,5.53,()=>{
    let s=SEASON.night?lightPool(x,y,2.12,'#ffcf7a',.22):'';
    s+=stick([x,y,.05],[x,y,.59],.17,'#57605a')+stick([x,y,.45],[x,y,4.46],.083,'#424c46');
    const a=c(.16,4.48),b=c(.36,5.06),d=c(.12,5.31);
    s+=loft(a,b,()=>SEASON.night?'#ffe7a8':'#e5e5ce')+loft(b,d,n=>tone(n,soft('#535d54')))+shape(d,'#4a554e',.35);
    for(let i=0;i<6;i++)s+=edge(a[i],b[i],'#505952',.045);
    return s+edge([x,y,5.31],[x,y,5.51],'#505952',.094);
  });
}
const lampSites=SCENE.furniture.filter(f=>f.k==='lamp');
SCENE.furniture=SCENE.furniture.filter(f=>f.k!=='lamp');
const LANDMARKS=[
  {name:'660 Beacon and the CITGO sign',ids:['w29559484'],build:beaconAndSign},
  {name:'Hotel Commonwealth',ids:['w29650741','w93458629','w822618764'],build:()=>[hotelFront(),...rearHotel()]},
  {name:'Kenmore busway',ids:['w308329579','w822618765'],build:busway},
  {name:'Kenmore entrances',ids:['w832992981','w835548607','w835548605'],build:()=>[
    ...northEntry(),southDoor(),elevator('w832992981',true),elevator('w835548607',false),
    stair(kAxes([-66.50,8.63],[-.998,-.067]),4.97,2,false),
    kModel(kVolume('w835548605',0,2.63,{wall:'#a2a5a0',kenmore:'booth',top:'#68787b'}))
  ]},
  {name:'610 Beacon Street',ids:['w29557600'],build:residence},
  {name:'491 Commonwealth Avenue',ids:['r9712516'],build:rowHouse},
  {name:'Kenmore streetlamps',ids:[],build:()=>lampSites.map(squareLantern)}
];

// 822618756 is the eastbound carriageway used by OSM Boston Marathon relation 11680552.
function courseY(x) {
  return x<1.8 ? -11.33-(x+120)*9.09/121.8 : -20.42-(x-1.8)*10.25/118.2;
}
function railPanel(x,y) {
  const at=kAxes([x,y],[.997,-.079]), fp=kRect(at,4.18,.41);
  return obj(fp,1.11,()=>{
    let s=kWire([at(-1.98,0,.1),at(-1.98,0,.99),at(1.98,0,.99),at(1.98,0,.1)],'#7a817d',.075);
    s+=edge(at(-1.98,0,.26),at(1.98,0,.26),'#88928c',.065);
    for(let i=-1.6;i<1.9;i+=.40)s+=edge(at(i,0,.26),at(i,0,.98),'#89908c',.045);
    for(const i of [-1.81,1.81])s+=edge(at(i,-.2,.07),at(i,.2,.07),kIron,.08);
    return s;
  });
}
function roadOpen(route) {
  let before=null;
  for(const [x,y] of route.p) {
    const side=y-courseY(x);
    if(Math.abs(side)<5.7 || before!==null && before*side<0)return false;
    before=side;
  }
  return true;
}
let cheerPanels;
function raceScene() {
  const fixed=[];
  for(let i=0;i<32;i++){
    const x=-116+i*6.05;
    for(const side of [-1,1]){
      const y=courseY(x)+side*5.6;
      if(standable(x,y)) fixed.push(railPanel(x,y));
    }
  }
  for(let i=0;i<68;i++){
    const x=-112+rnd(i+32)*204,side=i%2?1:-1,y=courseY(x)+side*(6.2+1.45*rnd(i+91));
    if(!standable(x,y))continue;
    const a={...pedDressed(i+1120),p:[x,y],d:[0,-side],walked:0};
    fixed.push(obj(rect(x,y,.7,.6),2.1,()=>pedestrian(a,0).svg));
  }
  if(!cheerPanels)cheerPanels=[-100,-95.8,-91.6].map((x,i)=>{
    const y=courseY(x)+5.7, at=kAxes([x,y],[.997,-.075]);
    const p=block(kRect(at,3.95,.11),.29,.98,{wall:'#3d647e',top:'#b7bdb0',kenmore:'board',
      label:i===1?'1 MILE TO GO':'BOSTON',board:'#375d80',letters:'#f3d47d'});
    return kModel(p);
  });
  fixed.push(...cheerPanels);
  return fixed;
}
function movingPerson(x,y,dir,dist,id,t,pennant=false) {
  if(!kenmoreWalkable(x,y))return null;
  const who={...pedDressed(id),p:[x,y],d:dir,walked:dist};
  return obj(rect(x,y,.8,.78),pennant?2.3:1.99,()=>{
    let s=pedestrian(who,t).svg;
    if(pennant){
      const a=[x+.17,y,1.1],b=[x+.17,y,2.14];
      s+=edge(a,b,'#997c55',.037)+shape([b,[x-.56,y+.04,1.94],[x+.17,y,1.84]],id%2?'#b8443e':'#324765',.2);
    }
    return s;
  });
}
function kenmoreWalkable(x,y) {
  return standable(x,y)&&!streetObstacles.some(fp=>inside([x,y],fp));
}
let kenSeason, eventModels=[];
function CITY_EXTRA(t) {
  if(kenSeason!==SEASON){
    kenSeason=SEASON;
    eventModels=SEASON.id==='marathon'?raceScene():[];
    for(const [i,[x,y]] of [[-42.2,-5.32],[-41.3,-5.12],[-39.6,-5.43],[-38.7,-5.04],[-34.7,-5.6]].entries()){
      if(i>1 && SEASON.night || !kenmoreWalkable(x,y) || inRings([x,y],SCENE.roads))continue;
      const who={...pedDressed(841+i),p:[x,y],d:[-.98,.2],walked:0};
      eventModels.push(obj(rect(x,y,.63,.63),2.4,()=>pedestrian(who,0).svg));
    }
    const running=SEASON.id==='marathon', crowd=SEASON.crowd||1;
    const open=FEEDS.filter((_,i)=>!running||roadOpen(SCENE.routes[i])).map(f=>({...f,walkSpeed:1.12,
      interval:f.kind==='ped'?f.interval*2.8/crowd:f.interval}));
    TRAFFIC=streetSimulation(open,PHONE?92:145,220);
    // Normal traffic uses the kit's measured lanes. A few prepared paths run
    // through a mapped threshold or end past the plate edge. Hide those steps.
    const traffic=TRAFFIC;
    TRAFFIC={to:time=>traffic.to(time).filter(a=>a.kind!=='ped'||kenmoreWalkable(...a.p))};
  }
  const parts=eventModels.map((p,i)=>({...p,draw:()=>stamp('race-side'+i,p.draw,p.fp,0,p.h+.1)}));
  if(SEASON.id==='marathon')for(let i=0;i<(PHONE?22:43);i++){
    const d=(i*47.13+t*(2.62+.68*rnd(i+11)))%236,x=-118+d,y=courseY(x)+(rnd(i+60)-.5)*7.3;
    const m=movingPerson(x,y,[.997,-.079],1.65*d,740+i,t);
    if(m)parts.push(m);
  }
  if(SEASON.id==='gameday')for(let i=0;i<(PHONE?24:46);i++){
    // South entrance, then west on the hotel-side sidewalk toward the off-plate
    // turn into Brookline Avenue. The lift is north of this short entrance leg.
    const path=[[-53.1,-34.1],[-54.4,-29.5],[-61.2,-27.75],[-117.8,-23.30]];
    const lane=fanWalk || (fanWalk=measuredLane({p:path,junctions:[]}));
    const d=(t*(1.12+rnd(i+23)*.34)+Math.floor(i/3)*4.68+i%3*.42)%lane.len;
    const {p,d:dir}=tAt(lane,d),off=((i%3)-1)*.72+(rnd(i+32)-.5)*.40;
    const m=movingPerson(p[0]-dir[1]*off,p[1]+dir[0]*off,dir,d,951+i,t,i%7===0);
    if(m)parts.push(m);
  }
  return parts;
}
let fanWalk;
