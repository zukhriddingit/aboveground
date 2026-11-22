// Boylston. All horizontal dimensions are metres in the supplied plot frame.
// The two closed outer ways of relation 20345318 are the surface headhouses.
// prep skips the entire relation because the station is tagged level -1.
const entries = [
  {id:'w180102628', direction:'INBOUND', ring:[[9.62,-89.95],[15.33,-90.86],[17.16,-79.58],[11.46,-78.66]]},
  {id:'w180102629', direction:'OUTBOUND', ring:[[14.07,-8.19],[19.65,-9.06],[21.4,1.95],[15.82,2.81]]}
];
function distance(a,b) { return Math.hypot(b[0]-a[0], b[1]-a[1]); }
function between(a,b,fraction) { return a.map((v,i)=>v+(b[i]-v)*fraction); }
function localFrame(ring) {
  const [sw,se,ne,nw]=ring;
  const W=distance(sw,se), L=distance(sw,nw);
  const right=[(se[0]-sw[0])/W,(se[1]-sw[1])/W], back=[(nw[0]-sw[0])/L,(nw[1]-sw[1])/L];
  const xy=(x,y)=>between(between(sw,se,x/W),between(nw,ne,x/W),y/L);
  const pt=(x,y,z)=>[...xy(x,y),z];
  const footprint=(a,b,c,d)=>ccw([xy(a,b),xy(c,b),xy(c,d),xy(a,d)]);
  return {W,L,right,back,xy,pt,footprint};
}
const stone='#bba996', capstone='#d6c4aa', iron='#393d3b', bronze='#676957';
function masonry(r,lo,hi,wall,top=wall) {
  r=ccw(r);
  return loft(atZ(r,lo),atZ(r,hi),n=>tone(n,soft(wall)))+shape(atZ(r,hi),top,.38);
}
const scaled=(r,c,k)=>r.map(p=>between(c,p,k));
function finishParts(parts) {
  const fp=hull(parts.flatMap(p=>p.fp));
  return obj(fp,Math.max(...parts.map(p=>p.h)),()=>planOrder(parts.map(p=>({fp:p.fp,z1:p.h,svg:p.draw()}))));
}
// Use the kit's clipped elevation pass. Its horizontal axis runs right-to-left,
// which is why all lettering goes through wallText.
const baseElevation=paintSingaporeElevation;
paintSingaporeElevation=function(g,id){
  const face=facades[id];
  if(!face.boylstonPaint)return baseElevation(g,id);
  const {start,along,n,len:w,h,z}=face, H=h-z;
  g.save();
  g.transform(...Dv(...along,0),...Dv(0,0,-1),...P(...start,h));
  g.beginPath();g.rect(0,0,w,H);g.clip();
  const colour=c=>SEASON.night&&LIT.has(c)?c:nightCol(dot(n,SUN)>.14?c:mix(c,'#8e839a',.16));
  const box=(x,b,width,height,c)=>{g.fillStyle=colour(c);g.fillRect(x,h-b-height,width,height);};
  const line=(points,c,width)=>{
    g.beginPath();points.forEach(([x,b],i)=>i?g.lineTo(x,h-b):g.moveTo(x,h-b));
    g.strokeStyle=colour(c);g.lineWidth=width;g.stroke();
  };
  const arch=(x,b,r,shoulder,ry,c)=>{
    g.beginPath();g.moveTo(x-r,h-b);g.lineTo(x-r,h-shoulder);
    g.ellipse(x,h-shoulder,r,ry,0,Math.PI,2*Math.PI);g.lineTo(x+r,h-b);
    g.closePath();g.fillStyle=colour(c);g.fill();
  };
  const circle=(x,b,r,c)=>{g.beginPath();g.arc(x,h-b,r,0,Math.PI*2);g.fillStyle=colour(c);g.fill();};
  const label=(t,x,b,max,size,c,family='Arial, sans-serif')=>{
    g.fillStyle=colour(c);g.font='bold '+size+'px '+family;g.textAlign='center';g.textBaseline='middle';
    wallText(g,t,x,h-b,max);
  };
  face.boylstonPaint({box,line,arch,circle,label,w,n,start,along,seed:face.seed});
  g.restore();
};
function elevation(r,lo,hi,body,painter,top=body) {
  const first=facades.length,draw=walls(ccw(r),lo,hi,{st:makeStyle({shop:'none'}),body});
  for(const face of facades.slice(first))face.boylstonPaint=painter(face);
  return obj(r,hi,()=>draw()+shape(atZ(ccw(r),hi),top,.4));
}
function pilaster({box,circle},x,w,h) {
  box(x,0,w,h,'#bcad9a');box(x,0,.065,h,'#9f907e');
  box(x,.13,w,.11,'#cfc1ad');box(x,h-.52,w,.08,'#a49683');
  box(x,h-.47,w,.32,'#cebea6');circle(x+w/2,h-.30,.095,'#b9aa95');
}
function clerestory(p,paired,count) {
  const {w,box,line}=p, margin=paired?.63:.5, groups=paired?count/2:count;
  const bay=(w-2*margin)/groups, sill=2.64,head=3.76;
  box(.25,.1,w-.5,.15,'#968a79');box(.25,.26,w-.5,.095,'#c6b59d');
  box(margin*.7,sill-.22,w-margin*1.4,.075,'#cebea3');
  for(let j=0;j<groups;j++){
    const x=margin+j*bay+.085,bw=bay-.17,panes=paired?2:1, gap=.115;
    box(x-.04,sill-.07,bw+.08,head-sill+.19,'#cabb9f');
    box(x,sill,bw,head-sill,'#8c7e69');
    for(let k=0;k<panes;k++) {
      const width=(bw-gap*(panes+1))/panes,left=x+gap+k*(width+gap),bot=sill+.09,H=head-sill-.18;
      box(left-.045,bot-.04,width+.09,H+.08,iron);
      box(left,bot,width,H,SEASON.night?'#ffe7a8':['#929283','#a4a298','#8a958c'][(j+k)%3]);
      for(let l=0;l<3;l++){
        const start=left+l*width/3,end=start+width/3;
        box(start,bot,.038,H,iron);
        if(UPX<.38){
          line([[start,bot+H/2],[(start+end)/2,bot+H],[end,bot+H/2],[(start+end)/2,bot],[start,bot+H/2]],iron,.035);
        }
      }
      box(left,bot+.47*H,width,.043,iron);
    }
  }
}
function headhouse(entry) {
  const {pt,xy,footprint,W,L,right,back}=localFrame(entry.ring),th=.41,eave=4.47;
  const front=footprint(0,0,W,L),center=xy(W/2,L/2), opening=.69;
  // Four separate convex piers/walls allow the tiled interior to appear
  // through the doorway while the near exterior always hides the far wall.
  const wallPlans=[footprint(0,0,th,L),footprint(W-th,0,W,L),footprint(th,L-th,W-th,L),
    footprint(th,0,opening,th),footprint(W-opening,0,W-th,th)];
  const bodies=wallPlans.map(r=>elevation(r,0,eave,stone,face=>{
    const side=face.n[0]*right[0]+face.n[1]*right[1],rear=face.n[0]*back[0]+face.n[1]*back[1];
    const mid=between(face.start,[face.start[0]+face.along[0]*face.len,face.start[1]+face.along[1]*face.len],.5);
    const offset=(mid[0]-center[0])*right[0]+(mid[1]-center[1])*right[1];
    if((Math.abs(side)>.90 && side*offset>0 && Math.abs(offset)>W/2-.14 && face.len>5) || (rear>.94&&face.len>4)){
      return p=>{const {w,box}=p;clerestory(p,Math.abs(side)>.90,Math.abs(side)>.90?6:3);
        pilaster(p,0,.47,eave);pilaster(p,w-.47,.47,eave);
        for(const [z,t,c] of [[3.98,.07,'#a79983'],[4.08,.11,'#cfbda3'],[4.29,.10,'#a6957e']])box(0,z,w,t,c);
        if(UPX<.46)for(let i=.08;i<w-.07;i+=.16)box(i,4.19,.085,.10,'#968977');
      };
    }
    if(face.len<1) return p=>pilaster(p,0,p.w,eave);
    return ({w,box})=>{box(0,0,w,4.37,'#dbcbb3');
      if(UPX<.33)for(let z=.09,i=0;z<4.2;z+=.23,i++){
        box(0,z,w,.016,'#b8aa96');
        for(let x=.05+(i%2)*.21;x<w;x+=.43)box(x,z,.014,.23,'#c0b19d');
      }
      box(.52,1.0,Math.min(1.25,w-.60),1.46,'#4c5850');box(.58,1.08,Math.min(1.13,w-.72),1.27,'#c2bca7');
    };
  }));
  const transom=elevation(footprint(opening,.01,W-opening,.39),2.50,eave,stone,face=>{
    if(face.len<1 || face.n[1]>0) return ()=>{};
    return ({w,box,label,line})=>{
      box(0,2.50,w,1.64,iron);
      const pane=w/3;
      for(let i=0;i<3;i++){
        box(pane*i+.055,2.96,pane-.11,.83,['#755068','#738d87','#a27571'][i]);
        // Three abstract printed panels above the enamel direction strips.
        for(let k=0;k<3;k++)line([[i*pane+.14+k*.13,3.10],[i*pane+.35+k*.13,3.45],[i*pane+.55+k*.13,3.36]],'#c2a095',.04);
      }
      box(0,2.71,w,.21,'#166148');box(0,2.50,w,.21,'#eee7d3');
      label('BOYLSTON STREET',w/2,2.805,w-.14,.19,'#f6efdd');
      label(entry.direction,w/2,2.595,w-.18,.17,'#233d36');
      box(0,3.92,w,.09,'#c0af97');
    };
  });
  const doorParts=[];
  for(const x of [opening+.06,W*.51,W-opening-.08]){
    const leaf=ccw([xy(x,-.73),xy(x+.07,-.73),xy(x+.07,.04),xy(x,.04)]);
    doorParts.push(obj(leaf,2.48,()=>{
      let s=masonry(leaf,.055,.20,iron)+masonry(leaf,.86,1.09,iron)+masonry(leaf,2.33,2.47,iron);
      for(const y of [-.71,.019])s+=masonry(footprint(x,y-.026,x+.07,y+.026),.12,2.40,iron);
      return s+edge(pt(x+.06,-.60,1.0),pt(x+.06,-.10,1.0),'#b3b5a8',.047);
    }));
  }
  const roof=()=>{
    let s=masonry(scaled(front,center,1.018),eave,eave+.10,'#ae9c87');
    s+=masonry(scaled(front,center,1.038),eave+.10,eave+.25,capstone);
    const eaves=footprint(-.02,0,W+.02,L), top=footprint(W*.41,1.65,W*.59,L-1.65);
    const snow=SEASON.snow;
    for(let i=0;i<4;i++){
      const j=(i+1)%4, a=eaves[i],b=eaves[j],c=top[j],d=top[i];
      const pts=[[...a,4.72],[...b,4.72],[...c,5.68],[...d,5.68]],n=vNewell(pts);
      if(!vis(n))continue;
      s+=shape(pts,tone(n,soft(snow?'#e7e3d8':'#6b7770')),.5);
      const seam=snow?'#c1bfb2':'#4b514c';
      s+=edge([...a,4.75],[...d,5.71],seam,.06);
      const span=distance(a,b),lip=distance(d,c),inset=(span-lip)/2;
      for(let k=.58;k<span-.22;k+=.73){
        const rise=Math.min(1,k/inset,(span-k)/inset);
        const from=between(a,b,k/span),to=between(d,c,Math.max(0,Math.min(1,(k-inset)/lip)));
        const end=rise<1?(k<inset?between(a,d,rise):between(b,c,rise)):to;
        s+=edge([...from,4.75],[...end,4.75+.96*rise],seam,.058);
      }
    }
    s+=masonry(top,5.67,5.78,snow?'#e9e5dc':'#657168');
    return s+edge(pt(W*.50,1.68,5.79),pt(W*.50,L-1.68,5.79),snow?'#d5d1c4':'#545953',.07);
  };
  return obj(hull([...front,...doorParts.flatMap(d=>d.fp)]),6,()=>{
    let s=shape(atZ(footprint(th,.04,W-th,L-th),.025),'#464941',.15);
    for(let i=0;i<9;i++){
      const y=.65+i*.32,z=.04-i*.115;
      s+=shape([pt(th,y,z),pt(W-th,y,z),pt(W-th,y+.29,z),pt(th,y+.29,z)],
        mix('#bdac91','#69665c',i/9),.22);
      if(i<2)s+=edge(pt(th,y,z+.01),pt(W-th,y,z+.01),'#dcb74e',.092);
    }
    s+=edge(pt(W*.52,.64,.81),pt(W*.52,3.14,-.17),iron,.071);
    s=clipTo(atZ(front,.025),s);
    const parts=[...bodies,transom,...doorParts];
    return s+planOrder(parts.map(p=>({fp:p.fp,z1:p.h,svg:p.draw()})))+roof();
  });
}

// The park-side apron has a row of newspaper boxes in the 2016 inbound view.
// A low green storage bin stands against the outbound wall in the 2012 view.
function stationFurniture(entry) {
  const {footprint}=localFrame(entry.ring);
  if(entry.direction==='OUTBOUND'){
    const box=footprint(-.92,.96,-.18,2.27);
    return [obj(box,.88,()=>masonry(box,.03,.77,'#45764d')+
      masonry(box,.77,.88,'#57955e',SEASON.snow?'#e9e7da':'#69a572'))];
  }
  return ['#3d4343','#ac433e','#c2ad58'].map((col,i)=>{
    const y=.95+i*.71,fp=footprint(-.85,y,-.30,y+.60);
    return elevation(fp,.04,1.10,col,face=>({box,w})=>{
      if(face.n[0]>-.85)return;
      box(.035,.93,w-.07,.075,col);box(.07,.45,w-.14,.44,'#424642');
      box(.10,.52,w-.20,.29,'#b6bab0');box(.075,.26,w-.15,.09,col);
    },col);
  });
}

// Project flat dots into one filled path per bulb colour.
function lightString(points,colourList,radius) {
  const paths=colourList.map(()=>''),r=f(radius*Math.hypot(Dv(1,0,0)[0],Dv(0,1,0)[0]));
  for(const [i,p] of points.entries()){
    const [x,y]=P(...p);
    paths[i%paths.length]+='M'+f(x-r)+' '+f(y)+'q0 -'+r+' '+r+' -'+r+'t'+r+' '+r+'t-'+r+' '+r+'t-'+r+' -'+r+'z';
  }
  return paths.map((p,i)=>p?fill(p,colourList[i]):'').join('');
}
const holidayBulbs=['#ffe7a8','#ffe6ec','#a7dbca','#a7c8e9'];
function eaveLights(a,b,z) {
  const count=Math.max(2,Math.round(distance(a,b)/.42));
  return Array.from({length:count},(_,i)=>[...between(a,b,i/count),z]);
}

function bandstand() {
  const b=findBuilding('w29576185'),[x,y]=b.obb.c,base=ccw(b.ring);
  const circle=(r,n=32)=>polygon(x,y,r,n,Math.PI/16), ivory='#e2d7c2',rim='#c6bba6';
  const columns=polygon(x,y,3.48,8,Math.PI/8);
  const drum=obj(base,1.44,()=>masonry(base,0,1.26,'#a69685')+
    masonry(scaled(base,[x,y],1.026),1.26,1.44,'#c9bcaa',SEASON.snow?'#ede7db':'#c9bcaa'));
  const upright=columns.map(([cx,cy])=>{
    const disk=r=>polygon(cx,cy,r,10),fp=disk(.35);
    return obj(fp,4.67,()=>masonry(fp,1.44,1.57,ivory)+masonry(disk(.29),1.57,1.68,'#c8bea9')+
      loft(atZ(disk(.225),1.68),atZ(disk(.195),4.34),n=>tone(n,soft(ivory)))+
      masonry(disk(.25),4.34,4.47,'#c8bda9')+masonry(disk(.32),4.47,4.61,ivory)+
      masonry(rect(cx,cy,.6,.6),4.61,4.68,rim));
  });
  const rails=[];
  // The surveyed stair axis is due north. Leave the opening between the
  // two columns that face it and follow the round apron with the ironwork.
  for(let j=0;j<8;j++) {
    if(j===1)continue;
    const a=columns[j],b=columns[(j+1)%8],r=[a,b];
    rails.push(obj(r,2.28,()=>{
      let s=edge([...a,1.59],[...b,1.59],iron,.055)+edge([...a,2.23],[...b,2.23],iron,.072);
      for(let k=1;k<12;k++){const p=between(a,b,k/12);s+=edge([...p,1.61],[...p,2.21],iron,.043);}
      for(let k=1;k<=3;k++){
        const p=between(a,b,(k-.5)/3),l=between(a,b,(k-1)/3+.05),r=between(a,b,k/3-.05);
        s+=edge([...l,1.94],[...p,2.18],iron,.04)+edge([...p,2.18],[...r,1.94],iron,.04);
      }return s;
    }));
  }
  const stairs=[];
  for(let i=0;i<8;i++){
    const front=109.97-i*.265, fp=rect(x,front-.132,1.90,.264);
    stairs.push(obj(fp,.18*(i+1),()=>masonry(fp,0,.18*(i+1),'#bbac98')));
  }
  const pavilion=obj(circle(4.35),6.40,()=>{
    let s=drum.draw()+planOrder([...rails,...upright].map(p=>({fp:p.fp,z1:p.h,svg:p.draw()})));
    s+=masonry(circle(4.08),4.66,4.79,rim)+masonry(circle(4.05),4.79,5.13,ivory);
    s+=masonry(circle(4.25),5.13,5.24,rim)+masonry(circle(4.32),5.24,5.34,ivory);
    const sections=[[4.17,5.34],[3.95,5.56],[3.15,5.90],[1.72,6.19],[.32,6.29]];
    const roof=SEASON.snow?'#e9e6db':'#a4a697';
    for(let j=1;j<sections.length;j++){
      const [ra,za]=sections[j-1],[rb,zb]=sections[j];
      s+=loft(atZ(circle(ra),za),atZ(circle(rb),zb),n=>tone(n,soft(roof)));
    }
    if(UPX<.5)for(let i=0;i<16;i++){
      const t=i*Math.PI/8;
      for(let j=1;j<sections.length;j++){
        const [a,za]=sections[j-1],[b,zb]=sections[j];
        if(!vis([Math.cos(t)*.38,Math.sin(t)*.38,1]))continue;
        s+=edge([x+a*Math.cos(t),y+a*Math.sin(t),za+.014],[x+b*Math.cos(t),y+b*Math.sin(t),zb+.014],SEASON.snow?'#d1cec0':'#929684',.034);
      }
    }
    s+=masonry(circle(.34),6.28,6.35,roof);
    if(SEASON.id==='lights'){
      const bulbs=circle(4.32,74).filter(([px,py])=>vis([px-x,py-y,0])).map(p=>[...p,5.29]);
      s+=lightString(bulbs,holidayBulbs,.105);
    }
    return s;
  });
  return finishParts([pavilion,...stairs]);
}
function glazing(seed) {
  return SEASON.night && rnd(seed)<(SEASON.litShare??.55)?'#ffe7a8':
    ['#829393','#8f9e9b','#819298','#9ca9a2'][Math.floor(rnd(seed)*4)];
}
function dividedWindow(p,x,z,w,h,k) {
  const {box}=p;
  box(x-.09,z-.08,w+.18,h+.18,'#897e70');box(x,z,w,h,glazing(k));
  box(x+w*.49,z,.07,h,'#666c66');box(x,z+h*.55,w,.07,'#e1d4bd');
}
function mosaic(p,x,width,variant) {
  const {box,circle,line}=p,b=.72,h=2.76;
  box(x,b,width,h,'#736b57');box(x+.075,b+.075,width-.15,h-.15,'#ccab6e');
  box(x+.16,b+.16,width-.32,h-.32,'#526c79');
  const cx=x+width/2,cy=b+h*.52, gold='#d9b56c',cream='#ece0b3';
  if(variant===1){
    for(let i=0;i<16;i++){
      const t=i*Math.PI/8;
      line([[cx+.26*Math.cos(t),cy+.26*Math.sin(t)],[cx+width*.39*Math.cos(t),cy+1.02*Math.sin(t)]],gold,.045);
    }
    line([[cx-.46,cy+.04],[cx,cy+.64],[cx+.46,cy+.04]],cream,.09);
    line([[cx-.52,cy+.14],[cx,cy-.43],[cx+.52,cy+.14]],gold,.12);
  }else{
    box(cx-.13,cy-.60,.26,1.21,cream);box(cx-.26,cy-.69,.52,.12,gold);
    box(cx-.26,cy+.46,.52,.13,gold);circle(cx,cy+.68,.17,'#ceb988');
  }
}
function lodge() {
  const b=findBuilding('w29863869'),fp=ccw(b.ring),c=b.obb.c,H=b.h,grey='#c8c1b3',trim='#e1d7c3';
  const shell=elevation(fp,0,H-.72,grey,face=>{
    const onTremont=face.n[0]<-.88, onBoylston=face.n[1]<-.88;
    if(face.n[0]<-.45&&face.n[1]<-.45 && face.len<8)return p=>{
      const {w,box,arch,circle}=p;
      box(0,.18,w,.23,trim);
      for(let z=.45;z<10.8;z+=.68)box(0,z,w,.045,'#a89c89');
      arch(w/2,5.48,.8,8.18,.90,trim);arch(w/2,5.64,.69,8.14,.76,glazing(31));
      for(let j=0;j<5;j++)dividedWindow(p,w*.31,12.1+j*3.84,w*.38,2.55,130+j);
      circle(w/2,33.9,.72,trim);circle(w/2,33.9,.52,'#b9aa91');
      for(const [z,h] of [[4.27,.32],[10.85,.44],[11.42,.16],[30.87,.28],[31.40,.46],[35.84,.32],[36.60,.42]])box(0,z,w,h,trim);
    };
    if((!onTremont&&!onBoylston)||face.len<8)return p=>{
      const {box,w}=p;box(0,0,w,H,'#a49b91');
      if(w>7)for(let k=0;k<7;k++)for(let i=1;i<=Math.floor(w/5.4);i++)
        dividedWindow(p,i*w/(Math.floor(w/5.4)+1)-.61,5.6+k*4.2,1.22,2.06,k*8+i);
    };
    return p=>{
      const {w,box,arch,line,label}=p, count=onTremont?5:7, step=(w-1.44)/count;
      const corners='#d7ccba',joint='#a89f91';
      // Separate the rusticated base, arched piano nobile, middle storeys and attic.
      box(0,0,w,10.85,'#c3b9a9');
      for(let z=.36;z<10.8;z+=.68){
        box(0,z,w,.048,joint);
        if(UPX<.43)for(let k=(Math.round(z/.68)%2)*.98;k<w;k+=2.18)box(k,z,.038,.62,joint);
      }
      for(let j=0;j<count;j++){
        const x=.72+(j+.5)*step,W=step*.55,idx=j+(onTremont?0:10);
        if(onTremont&&j>0&&j<count-1)mosaic(p,x-step*.40,step*.8,j-1);
        else{
          box(x-step*.34,.13,step*.68,3.95,trim);box(x-step*.30,.13,step*.60,3.68,'#505f5b');
          box(x-step*.25,.37,step*.50,2.68,glazing(idx));box(x-.045,.13,.09,3.68,'#5c594d');
        }
        // Round-arched range and fanlights above the street-level portals.
        arch(x,5.37,W*.54,8.23,W*.54,trim);arch(x,5.56,W*.45,8.20,W*.45,glazing(idx+8));
        box(x-.046,5.55,.092,2.7+W*.43,'#716f65');
        box(x-W*.45,8.16,W*.9,.09,'#938777');
        for(const a of [.26,.50,.74]){
          const t=a*Math.PI;line([[x,8.20],[x+W*.44*Math.cos(t),8.20+W*.44*Math.sin(t)]],'#857c70',.065);
        }
        for(let row=0;row<5;row++){
          const z=12.10+row*3.84,h=2.55;
          box(x-W*.5-.18,z-.16,W+.36,h+.36,'#d7ccba');
          dividedWindow(p,x-W*.5,z,W,h,70+idx*7+row);
          box(x-W*.5-.27,z-.18,W+.54,.19,trim);
          if(row===0||row===4)box(x-W*.5-.23,z+h+.10,W+.46,.18,corners);
        }
        const half=W*.40;
        for(const off of [-.26,.26])dividedWindow(p,x+off*step*.78-half/2,33.10,half,2.24,idx+off);
      }
      for(const [z,h] of [[4.27,.32],[10.85,.44],[11.42,.16],[30.87,.28],[31.40,.46],[35.84,.32],[36.60,.42]])box(0,z,w,h,trim);
      if(UPX<.69)for(let x=.4;x<w-.30;x+=.67)box(x,36.11,.28,.36,'#a89c8a');
      if(onTremont)label('GRAND LODGE OF MASONS IN MASSACHUSETTS',w/2,4.57,w*.86,.36,'#746d5c','Georgia, serif');
      else label('MASONIC BUILDING',w/2,4.58,step*2.0,.48,'#776c5a','Georgia, serif');
    };
  });
  return obj(fp,H+.66,()=>{
    const roof=SEASON.snow?'#e5e2d7':'#a5a49c', cornice=scaled(fp,c,1.023);
    let s=shell.draw()+masonry(cornice,H-.72,H-.33,trim)+masonry(fp,H-.33,H,'#cfc6b4',roof);
    // Keep a legible parapet from the roofs across Tremont.
    s+=shape(atZ(scaled(fp,c,.94),H+.022),roof,.52);
    const small=rect(c[0]+4.5,c[1]+2.4,7.6,4.5);
    return s+masonry(small,H+.025,H+.66,'#b2ada0',roof);
  });
}
function parkside() {
  const b=findBuilding('w29650697'),r=ccw(b.ring),center=b.obb.c;
  // r begins at the southeast corner. The street wall is the edge facing west.
  const H=b.h,brick='#b27862', sand='#d9c2a3', dark='#58666b';
  const shell=elevation(r,0,H-.46,brick,F=>{
    const street=F.n[0]<-.85,side=Math.abs(F.n[1])>.85;
    return p=>{
      const {box,w,label,arch,line}=p,count=street?5:side?5:4,bay=w/count;
      box(0,0,w,5.55,'#bca48b');
      for(let j=0;j<count;j++){
        const c=bay*(j+.5);
        if(street){
          if(j===2){
            arch(c,.10,bay*.44,3.36,1.42,sand);arch(c,.12,bay*.35,3.36,1.10,'#526163');
            box(c-bay*.30,.12,bay*.60,3.18,'#8b9b99');box(c-.042,.12,.084,3.18,dark);
          }else{
            box(c-bay*.42,.22,bay*.84,3.69,'#625e55');box(c-bay*.39,.32,bay*.78,2.79,glazing(83+j));
            box(c-.055,.22,.11,2.91,dark);
          }
        }
        for(let row=0;row<16;row++){
          const y=6.06+row*2.70, ww=bay*(j%2===0?.77:.58);
          box(c-ww/2-.074,y-.09,ww+.148,2.0,'#d0ae93');
          dividedWindow(p,c-ww/2,y,ww,1.82,4+j+row*count);
          if(street && (j===0||j===4) && row>1 && row%2===0){
            box(c-ww*.55,y-.15,ww*1.10,.16,sand);
            line([[c-ww*.53,y+.45],[c+ww*.53,y+.45]],dark,.06);
            for(let k=0;k<6;k++)box(c-ww*.51+k*ww*.20,y,.045,.45,dark);
          }
        }
      }
      for(const z of [5.39,15.92,32.13,46.42])box(0,z,w,.17,sand);
      if(street){
        box(.16*w,3.38,.24*w,.44,'#343c39');label('CARBON SALON',.28*w,3.60,.22*w,.33,'#eee2cb');
      }
    };
  });
  const front=r.findIndex((a,i)=>{const n=r[(i+1)%4];return (n[1]-a[1])/distance(a,n)<-.85});
  const a=r[front],b1=r[(front+1)%4],u=[(b1[0]-a[0])/distance(a,b1),(b1[1]-a[1])/distance(a,b1)],v=[u[1],-u[0]];
  const mid=between(a,b1,.5),xy=(x,y)=>[mid[0]+u[0]*x+v[0]*y,mid[1]+u[1]*x+v[1]*y];
  const canopy=ccw([xy(-2.1,0),xy(2.1,0),xy(2.1,1.65),xy(-2.1,1.65)]);
  return obj(hull([...r,...canopy]),H+.60,()=>{
    const roof=SEASON.snow?'#e7e2d8':'#98978e';
    let s=shell.draw()+masonry(r,H-.46,H,'#c49f87',roof);
    s+=masonry(scaled(r,center,.79),H+.04,H+.60,'#a9917e',roof);
    if(vis([...v,0])){
      for(const k of [-1.87,1.87])s+=stick([...xy(k,1.46),0],[...xy(k,1.46),3.03],.042,'#a38b56');
      s+=masonry(canopy,2.99,3.25,'#5d655f');
      s+=loft(atZ(canopy,3.25),atZ(canopy.map(([x,y])=>[x-v[0]*.52,y-v[1]*.52]),3.78),n=>tone(n,soft('#68716a')));
      s+=shape(atZ(canopy.map(([x,y])=>[x-v[0]*.52,y-v[1]*.52]),3.78),'#72786d',.4);
    }
    return s;
  });
}

// Small pitched service cottage in the Deer Park yard. Split the mapped L at
// the re-entrant corner so each gable follows its own wing.
function deerPark() {
  const r=findBuilding('w212124578').ring;
  const junction=between(r[0],r[5],.59);
  const wings=[[r[0],r[1],r[2],junction],[junction,r[2],r[3],r[4],r[5]]];
  return finishParts(wings.map((outline,i)=>{
    const fp=ccw(outline), z=i?3.05:3.2,body=block(fp,0,z,{facade:'house',wall:'#b0a18d',trim:'#cabda5',frame:'#544e42',bay:2.2,floor:3.1,shop:'none'});
    const a=outline[0],b=i?r[3]:r[1], end=i?r[4]:r[2],corner=i?r[5]:junction;
    const left=between(a,corner,.5),right=between(b,end,.5);
    const ridgeA=i?left:between(a,b,.5),ridgeB=i?right:between(corner,end,.5);
    const roofRing=i?[a,b,end,corner]:[a,corner,end,b];
    const faces=[[roofRing[0],roofRing[1],ridgeB,ridgeA],[roofRing[2],roofRing[3],ridgeA,ridgeB]];
    return obj(fp,z+1.53,()=>{
      let s=body.draw();
      const col=SEASON.snow?'#e6e3d9':'#767971';
      for(const [p,q] of [[roofRing[0],roofRing[3]],[roofRing[1],roofRing[2]]]){
        const m=between(p,q,.5);s+=shape([[...p,z],[...q,z],[...m,z+1.53]],'#b4a48d',.36);
      }
      for(const face of faces){const pts=face.map((p,i)=>[...p,i<2?z:z+1.53]);
        let n=vNewell(pts);if(n[2]<0)n=n.map(v=>-v);if(vis(n))s+=shape(pts,tone(n,soft(col)),.42);
      }
      if(SEASON.id==='lights'){
        const rim=ccw(roofRing),points=[];
        for(let j=0;j<rim.length;j++){
          const a=rim[j],b=rim[(j+1)%rim.length];
          if(vis([b[1]-a[1],a[0]-b[0],0]))points.push(...eaveLights(a,b,z+.04));
        }
        s+=lightString(points,holidayBulbs,.09);
      }
      return s;
    });
  }));
}

function cinemaFront() {
  const b=findBuilding('w815970302'),first=facades.length,model=buildingModel(b);
  for(const F of facades.slice(first)){
    if(F.cut||F.n[0]>-.88||F.len<15)continue;
    F.shop=false;
    F.boylstonPaint=({w,box,label})=>{
      box(0,0,w,F.h,'#93a5a5');
      for(let i=0;i<10;i++){
        const x=i*w/10;box(x+.15,.6,w/10-.28,F.h-.95,glazing(140+i));
        box(x,0,.18,F.h,'#c1c4ba');
      }
      for(let z=3.2;z<F.h;z+=3.4)box(0,z,w,.13,'#b7c2bc');
      for(let x=1;x<w;x+=2.25){box(x,5,.27,F.h-5,'#d7d6c9');box(x+.27,5,.15,F.h-5,'#6b7d80');}
      box(.4,4.04,w-.8,1.27,'#c6c8bd');label('amc',w*.47,4.69,w*.42,1.52,'#aa3a37');
      // Tall blade visible above the northbound traffic and in the headhouse photographs.
      box(w-2.24,6.4,1.80,F.h-6.8,'#445f68');
      Array.from('THEATRES').forEach((c,i)=>label(c,w-1.34,F.h-1.65-i*1.58,1.37,1.27,'#b64b43'));
    };
  }
  return model;
}
function frontage(id,sign) {
  const b=findBuilding(id),first=facades.length,m=buildingModel(b);
  for(const f of facades.slice(first)){
    f.shop=false;
    if(!f.cut&&f.n[0]<-.86&&f.len>4){f.shop=true;f.street=true;f.sign=sign;}
  }
  return m;
}

const cemetery=SCENE.lawns.find(l=>l.kind==='cemetery').r[0];
function cemeteryModels(){
  const pieces=[];
  // The west side of the polygon is the plate cut, not an iron fence.
  for(let i=0;i<cemetery.length;i++){
    const a=cemetery[i],b=cemetery[(i+1)%cemetery.length];
    if(a[0]===-110&&b[0]===-110)continue;
    const count=Math.ceil(distance(a,b)/3.1);
    for(let j=0;j<count;j++){
      const p=between(a,b,j/count),q=between(a,b,(j+1)/count),fp=[p,q];
      pieces.push(obj(fp,1.26,()=>{
        let s=edge([...p,.19],[...q,.19],bronze,.065)+edge([...p,1.06],[...q,1.06],iron,.074);
        const bars=UPX<.4?13:7;
        for(let k=0;k<bars;k++){
          const t=between(p,q,k/bars);
          s+=edge([...t,.09],[...t,k===0?1.25:1.14],iron,k===0?.069:.035);
        }return s;
      }));
    }
  }
  // Uninscribed representative markers, constrained to the surveyed enclosure.
  // Keep tree roots and the mapped cemetery walks clear.
  const palette=['#86837c','#aaa294','#827f79','#b7ae9c'];
  for(let row=0;row<12;row++)for(let j=0;j<12;j++){
    const k=12*row+j,x=-108+j*4.95+rnd(k+24)*2.1,y=-85+row*5.84+rnd(k+17)*2.2;
    if(rnd(k+2)<.28||!inside([x,y],cemetery)||!standable(x,y)||
      inRings([x,y],SCENE.paths.concat(SCENE.walk))||SCENE.trees.some(t=>distance(t,[x,y])<1.5))continue;
    const w=.42+rnd(k+9)*.45,h=.48+rnd(k+5)*.53,c=palette[k%4],fp=rect(x,y,w,.15);
    pieces.push(obj(fp,h,()=>{
      const side=CAM_V[1]<0?-.075:.075,yf=y+side, z=h-w*.27;
      const profile=[[-w/2,0],[w/2,0],[w/2,z],[w*.34,z+.035],[w*.24,z+.12],[0,h],[-w*.24,z+.12],[-w*.34,z+.035],[-w/2,z]];
      const far=profile.map(([u,v])=>[x+u,y-side,v]),near=profile.map(([u,v])=>[x+u,yf,v]);
      let s=shape(far,c,.26);
      for(let i=2;i<8;i++)s+=shape([far[i],far[i+1],near[i+1],near[i]],SEASON.snow?'#eee8dc':mix(c,'#ddd5c3',.24),0);
      return s+shape(near,c,.28);
    }));
  }
  return pieces;
}
const landmarkById=(id,name,build)=>({ids:[id],name,build});
const LANDMARKS=[
  ...entries.map(e=>landmarkById(e.id,'Boylston '+e.direction.toLowerCase(),()=>[headhouse(e),...stationFurniture(e)])),
  landmarkById('w29576185','Parkman Bandstand',bandstand),
  landmarkById('w29863869','Grand Lodge of Massachusetts',lodge),
  landmarkById('w29650697','The Parkside',parkside),
  landmarkById('w212124578','Deer Park office',deerPark),
  landmarkById('w815970302','Tremont cinema frontage',cinemaFront),
  landmarkById('w408746610','JiangNan',()=>frontage('w408746610','JiangNan')),
  landmarkById('w815989024','Coffee on Tremont',()=>frontage('w815989024','Thinking Cup')),
  {ids:[],name:'Central Burying Ground',build:cemeteryModels}
];

// Three-metre paving-stone paths from the OSM wheel and spokes. The City's
// existing-conditions plan identifies this surface as brick.
const brickPaths=SCENE.brickPaths;
const commonGround=paintGroundInk;
paintGroundInk=function(g) {
  commonGround(g);
  if(SEASON.snow)return;
  g.save();g.transform(...Dv(1,0,0),...Dv(0,1,0),...P(0,0,0));
  g.beginPath();
  for(const group of brickPaths)for(const ring of group){
    ring.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();
  }
  g.clip('evenodd');g.fillStyle=SEASON.wet?'#a17a69':'#bd9079';g.fillRect(-110,-110,220,220);
  if(UPX<.55)pavingInk(g,brickPaths,{style:'slabs',size:.21,stone:SEASON.wet?'#a97d6b':'#bf947d',colour:'#a88775'},HALF);
  g.restore();
};
function picnicMat(x,y,i) {
  const dir=0.18*(rnd(i+131)-.5),fwd=[Math.sin(dir),Math.cos(dir)],lat=[fwd[1],-fwd[0]];
  const pos=(a,b,h)=>[x+a*lat[0]+b*fwd[0],y+a*lat[1]+b*fwd[1],h];
  const quad=(a,b,c,d,z)=>[pos(a,b,z),pos(c,b,z),pos(c,d,z),pos(a,d,z)];
  const mat=['#9d5d57','#657c91','#d2ad75','#89936c'][i%4],fp=quad(-1.02,-.80,1.02,.80,0).map(p=>p.slice(0,2));
  return obj(fp,1.03,()=>{
    let s=shape(quad(-1.02,-.80,1.02,.80,.03),mat,.34);
    for(const a of [-.91,-.83,.83,.91])s+=shape(quad(a,-.80,a+.028,.80,.035),'#e4cfad',0);
    for(let k=0;k<(i%3?2:1);k++){
      const a=-.44+.85*k,b=-.22,skin=SKINS[(i+k)%SKINS.length],shirt=CLOTHES[(i+2*k)%CLOTHES.length];
      const drawSeated=()=>{
        let figure='';
        for(const side of [-1,1]){
          const hip=pos(a+.09*side,b,.18),knee=pos(a+.15*side,b+.27,.36),foot=pos(a+.19*side,b+.53,.09);
          figure+=stick(hip,knee,.087,'#52606a')+stick(knee,foot,.07,'#52606a');
        }
        figure+=stick(pos(a,b,.18),pos(a,b-.055,.62),.15,shirt);
        figure+=ball(pos(a,b-.052,.817),.139,skin,.36)+ball(pos(a,b-.078,.881),.115,soft(HAIR[(i+k)%HAIR.length]),.32);
        return figure;
      };
      s+=drawSeated();
    }return s;
  });
}
function matinee() {
  const mats=[];
  for(let i=0;i<96;i++){
    const x=-101+rnd(i+61)*65,y=64+rnd(i*2+43)*40;
    if(!standable(x,y)||!inRings([x,y],SCENE.lawns.map(l=>l.r))||
        SCENE.trees.some(t=>distance(t,[x,y])<2.2)||mats.some(m=>distance(m.fp[0],[x,y])<3.4))continue;
    const m=picnicMat(x,y,i);
    if(m.fp.every(p=>standable(...p)&&!inRings(p,SCENE.paths.concat(SCENE.walk))))mats.push(m);
    if(mats.length===20)break;
  }return mats;
}
function decemberTrees() {
  for(const colour of holidayBulbs)LIT.add(colour);
  return TREES.filter(t=>t.x>0&&t.x<55&&t.y>-49&&t.y<105 && t.i%3!==1).map(t=>{
    const fp=polygon(t.x,t.y,t.ext,8), points=[];
    // Follow the bare tree's actual limbs and outer twigs.
    for(const [a,b] of t.geo.segs.slice(1).concat(t.geo.twigs.filter((_,i)=>i%2===0))){
      const count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])/.58);
      for(let i=0;i<count;i++)points.push(between(a,b,(i+.5)/count));
    }
    return obj(fp,t.zTop,()=>lightString(points,t.i%3===0?holidayBulbs:['#ffe7a8','#fff3c4'],UPX>.35?.145:.084));
  });
}
let occasionSeason=null,occasionModels=[];
function CITY_EXTRA() {
  if(occasionSeason!==SEASON){
    occasionSeason=SEASON;
    occasionModels=SEASON.id==='matinee'?matinee():SEASON.id==='lights'?decemberTrees():[];
  }
  return occasionModels.map((m,i)=>({fp:m.fp,h:m.h,draw:()=>stamp('boylston-occasion'+i,m.draw,m.fp,0,m.h+.2)}));
}
