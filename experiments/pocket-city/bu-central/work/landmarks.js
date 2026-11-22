// Campus coordinates: u follows Comm Ave east, v runs toward the Charles.
// The plate itself is rotated 17° to fit the GSU and chapel at opposite corners.
const buCos = Math.cos(-26*Math.PI/180), buSin = Math.sin(-26*Math.PI/180);
function campus(u,v,z) {
  const p=[u*buCos-v*buSin,u*buSin+v*buCos];
  return z===undefined?p:[...p,z];
}
function site(p) { return [p[0]*buCos+p[1]*buSin,-p[0]*buSin+p[1]*buCos]; }
function courtBox(a,b,c,d) { return [[a,b],[c,b],[c,d],[a,d]].map(p=>campus(...p)); }
function cutSite(r,axis,bound,keepAbove){
  const out=[],sign=keepAbove?1:-1;
  for(let i=0;i<r.length;i++){
    const p=r[i],q=r[(i+1)%r.length],s=sign*(p[axis]-bound),t=sign*(q[axis]-bound);
    if(s>=0)out.push(p);
    if((s<0)!==(t<0))out.push(p.map((v,j)=>v+(q[j]-v)*s/(s-t)));
  }
  return out;
}
function section(id,u0,u1,v0,v1){
  let r=findBuilding(id).ring.map(site);
  for(const [axis,bound,keep] of [[0,u0,true],[0,u1,false],[1,v0,true],[1,v1,false]])
    if(bound!=null)r=cutSite(r,axis,bound,keep);
  return ccw(r.map(p=>campus(...p)));
}
const material={stone:'#d2c7a9',carving:'#e6d9b8',joint:'#b3a68c',slate:'#66767b',
  concrete:'#beb8a6',light:'#dbd4c1',roof:'#a49e92',glass:'#668b90',dark:'#425557',
  scarlet:'#b8423c',green:'#337953',iron:'#3f514b',steel:'#cad4cc'};
function roofTone(c){return SEASON.snow?snowy(c,.86):c;}
function filledSolid(r,z,h,wall,cap=wall){
  const ring=ccw(r);
  return loft(atZ(ring,z),atZ(ring,h),n=>tone(n,soft(wall)))+shape(atZ(ring,h),cap,.48);
}
function combined(parts){
  return obj(hull(parts.flatMap(p=>p.fp)),Math.max(...parts.map(p=>p.h)),()=>
    planOrder(parts.map(p=>({fp:p.fp,z0:p.z0||0,z1:p.h,svg:p.draw()}))));
}
// Low parapets and seams on the flat campus roofs. Slip the seam print
// under the coping; no textures or screen-space shadows are needed.
function flatCap(r,z,colour){
  const base=shape(atZ(r,z),roofTone(colour),.52);
  if(areaOf(r)<100)return base;
  const bounds=r.map(site),us=bounds.map(p=>p[0]),vs=bounds.map(p=>p[1]);
  const v0=Math.min(...vs),v1=Math.max(...vs);
  let seams='';
  if(UPX<.81&&!SEASON.snow){
    for(let u=Math.ceil(Math.min(...us)/4)*4;u<Math.max(...us);u+=4)
      seams+=pd([campus(u,v0,z),campus(u,v1,z)],false);
  }
  const roofInk=seams?clipTo(atZ(r,z),'<path d="'+seams+'" fill="none" stroke="'+mix(colour,'#625e58',.20)+'" style="stroke-width:.047"/>'):'';
  let rim='';
  for(let i=0;i<r.length;i++){
    const a=r[i],b=r[(i+1)%r.length];
    rim+=shape([[...a,z],[...b,z],[...b,z+.23],[...a,z+.23]],'#bdb8aa',.2)+edge([...a,z+.23],[...b,z+.23],roofTone('#d6cfbd'),.115);
  }
  return base+roofInk+rim;
}
function sunBreakers(r,z,h,depth,spacing){
  let s='';
  for(let j=0;j<r.length;j++){
    const a=r[j],b=r[(j+1)%r.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(len<7)continue;
    const d=[(b[0]-a[0])/len,(b[1]-a[1])/len],n=[d[1],-d[0],0],local=site(n);
    if(!vis(n)||(local[1]>-.68&&local[0]<.69))continue;
    const count=Math.max(1,Math.round(len/spacing)),step=len/count;
    const at=(x,y)=>[a[0]+d[0]*x+n[0]*y,a[1]+d[1]*x+n[1]*y];
    // Each blade is a slender closed solid projecting out of the window wall.
    let cheek='',edgeFace='',tops='';
    for(let k=0;k<count;k++){
      const x=(k+.5)*step,side=vis([...d,0])?1:-1;
      const root=at(x+side*.11,0),tip=at(x+side*.11,depth),p=at(x-.11,depth),q=at(x+.11,depth);
      cheek+=pd([[...root,z],[...tip,z],[...tip,h],[...root,h]]);
      edgeFace+=pd([[...p,z],[...q,z],[...q,h],[...p,h]]);
      tops+=pd(atZ([at(x-.11,0),p,q,at(x+.11,0)],h));
    }
    s+=fill(cheek,tone([d[0],d[1],0],soft('#aaa99a')))+fill(edgeFace,'#d4d1bd')+fill(tops,roofTone('#dcd6c5'));
  }
  return s;
}
function body(r,z,h,wall,cap,finish,relief){
  // Reuse the kit's per-face visibility, clipping and projection for painted elevations.
  const start=facades.length,side=walls(ccw(r),z,h,{st:makeStyle({facade:'plain'}),body:wall});
  for(const f of facades.slice(start))f.buFinish=finish||(()=>{});
  return {...obj(r,h,()=>side()+(relief?relief():'')+flatCap(r,h,cap)),z0:z};
}
const kitElevation=paintSingaporeElevation;
paintSingaporeElevation=function(g,id){
  const f=facades[id];
  if(!f.buFinish)return kitElevation(g,id);
  if(f.len<.22)return;
  const H=f.h-f.z,p=P(...f.start,f.h),outside=site(f.n);
  g.save();g.transform(...Dv(...f.along,0),...Dv(0,0,-1),...p);
  g.beginPath();g.rect(0,0,f.len,H);g.clip();
  const tint=c=>dot(f.n,SUN)>.14?c:mix(c,'#83788b',.17);
  const paint=(x,z,w,h,c)=>{g.fillStyle=tint(c);g.fillRect(x,H-z-h,w,h)};
  const label=(str,x,z,w,size,c)=>{
    g.fillStyle=tint(c);g.font='bold '+size+'px Arial, sans-serif';g.textAlign='center';
    wallText(g,str,x,H-z,w);
  };
  f.buFinish({g,w:f.len,h:H,n:outside,paint,label,tint,origin:site(f.start),zbase:f.z});
  g.restore();
};
function gridFace({w,h,paint},floor,bay,glass,trim){
  const rows=Math.max(1,Math.round(h/floor)),cols=Math.max(1,Math.round(w/bay)),fw=w/cols,fh=h/rows;
  for(let i=0;i<rows;i++){
    paint(.28,i*fh+.48,w-.56,fh-.92,glass);
    paint(.28,i*fh+fh*.74,w-.56,.10,trim);
  }
  for(let j=1;j<cols;j++)paint(j*fw-.09,.3,.18,h-.55,trim);
}
function finField(F,kind){
  const {w,h,n,paint}=F,m=material;
  if(w<2.2)return;
  const bank=Math.max(1,Math.round(w/(kind==='tower'?2.5:3.1))),bay=w/bank;
  if(kind==='tower'&&w<9) {
    for(let x=1.3;x<w;x+=2.4)paint(x,1,.09,h-1.5,'#a49685');
    return;
  }
  const rows=kind==='tower'?17:Math.max(2,Math.round(h/3.8)),floor=h/rows;
  for(let j=0;j<rows;j++){
    const z=j*floor;
    paint(.4,z+.35,w-.8,floor-.73,j%6===0?'#82989a':'#677f81');
    if(kind==='tower'&&(j===7||j===13)){paint(.26,z+.16,w-.52,floor-.31,'#a7a59b');}
    else if(kind==='tower'&&j%5!==2)
      for(let k=(j+1)%3;k<bank;k+=3)paint(k*bay+.32,z+.52,bay*.43, floor*.50,(k+j)%4?'#8d5144':'#5a7568');
    paint(.25,z+.22,w-.5,.17,'#ddd3bc');
    if(UPX<.5)paint(.4,z+floor*.65,w-.8,.085,'#495b5b');
  }
  for(let i=0;i<=bank;i++){
    const x=Math.max(0,Math.min(w-.29,i*bay-.12));
    paint(x,.22,.27,h-.34,m.light);
    if(kind!=='tower'||n[0]>.5)paint(x+.27,.22,.20,h-.34,'#8e8b7e');
  }
  paint(0,h-.28,w,.28,'#e1d7c3');
}
function library(){
  const id='w130209089',parts=[],m=material;
  // BU's preservation survey: west stack block, stepped east wing, lower entrance.
  for(const [lo,hi,v0,v1,z,role] of [
    [null,null,null,22,8.0,'entry'],[null,-29.6,22,null,25.7,'stack'],
    [-29.6,null,22,42,13.6,'reading'],[-29.6,null,42,60,17.5,'reading'],
    [-29.6,null,60,75,21.6,'reading'],[-29.6,null,75,null,25.7,'stack']]){
    const r=section(id,lo,hi,v0,v1);
    parts.push(body(r,0,z,m.concrete,m.roof,F=>{
      const {w,h,n,paint,label}=F;
      if(role==='entry'){gridFace(F,4,2.3,m.glass,m.light);
        if(n[1]<-.7&&w>7){paint(0,3.37,w,.9,'#bcb6a7');label('MUGAR MEMORIAL LIBRARY',w/2,3.58,w*.87,.53,'#455654');}
        return;
      }
      finField(F,'library');
      if(w>6&&(n[0]>.65||n[1]<-.65)){
        const count=Math.max(2,Math.round(w/2.85));
        for(let k=0;k<count;k++){
          const x=k*w/count;
          paint(x,.35,.38,h-.55,'#e2d8bd');paint(x+.38,.35,.46,h-.55,'#918c7d');
        }
      }
      if(role==='stack'&&w>8)
        for(let x=.65;x<w-1;x+=3.35)paint(x,9,1.9,h-9.33,'#bbb9aa');
    },role==='entry'?null:()=>sunBreakers(r,3.8,z-.27,.94,3.25)));
  }
  const pent=courtBox(-45,67,-34,82);
  parts.push(body(pent,25.7,28.4,m.concrete,m.light,({w,paint})=>{for(let x=.6;x<w-.4;x+=1.2)paint(x,.45,.55,1.45,'#7f827a')}));
  return combined(parts);
}
function union(){
  const id='w130209090',m=material;
  const link=body(section(id,-72.4,null,null,null),0,5.0,m.concrete,m.roof,F=>{
    gridFace(F,4.6,2.2,'#82a2a1','#d0cbb8');
    if(F.n[1]<-.8&&F.w>10){
      F.paint(0,3.35,F.w,1.25,'#b6ad9e');
      F.label('GEORGE SHERMAN UNION',F.w/2,3.62,F.w*.80,.58,'#394d4f');
    }
  });
  const wings=[];
  for(const [v0,v1,z] of [[null,12,16.2],[12,35,15],[35,54.2,17.6],[54.2,null,6.5]]){
    wings.push(body(section(id,null,-72.4,v0,v1),0,z,m.concrete,'#a69e91',F=>{
      const {w,h,n,paint,label}=F;
      if(w<2.3)return;
      gridFace(F,h>10?4:3.3,2.6,'#789292','#495a59');
      const bays=Math.max(1,Math.round(w/6.0));
      for(let i=0;i<=bays;i++)paint(i*w/bays-.25,0,.54,h,'#d6ceba');
      if(v0==null&&n[1]<-.7){
        paint(.25,4.05,w-.5,4.2,'#b9b29f');
        if(w>25){paint(w*.12,5.4,2.5,9.6,'#bc3937');label('BU',w*.12+1.25,12.7,2,1,'#fff1d8');}
      }
      if(n[0]>.7&&w>11){
        for(let k=0;k<4;k++){const x=w*(.08+.22*k);paint(x,6.4,w*.12,3.7,m.scarlet);label('BU',x+w*.06,8.1,w*.10,.90,'#fff0dc');}
        label('GEORGE SHERMAN UNION',w/2,4.28,w*.86,.63,'#ede5ce');
      }
      paint(0,h-.5,w,.5,'#d9d0b8');
    }));
  }
  // Covered central light court. Glazing bars lie in each sloped pane.
  const glasshouse=courtBox(-119,16,-87,32);
  wings.push(obj(glasshouse,17.15,()=>{
    const low=atZ(glasshouse,15),top=atZ(courtBox(-116,18,-90,30),17.12);
    let s=loft(low,top,n=>tone(n,soft('#8aa5a3')))+shape(top,roofTone('#9eb7b2'),.45);
    for(let u=-115;u< -89;u+=2.2)s+=edge(campus(u,18,17.14),campus(u,30,17.14),'#6a7b77',.11);
    return s;
  }));
  return combined([...wings,link]);
}
function lawComplex(){
  const tower=section('w485223499'),m=material;
  const main=body(tower,0,73.3,m.concrete,m.roof,F=>finField(F,'tower'));
  const lift=body(courtBox(33,66.3,45.7,85.7),73.3,80.77,m.concrete,m.light,
    ({w,paint})=>{for(let x=1;x<w;x+=2.4)paint(x,1,.15,5.9,'#9d9789')});
  const stack=body(courtBox(49.0,48.1,53.4,55.9),73.3,76.7,'#bab4a8','#857e70');
  const redstone=body(section('w485223500'),0,21.1,'#d0c9b5','#ada99d',F=>{
    gridFace(F,4.25,3.3,'#88a5a7','#aeb4a9');
    for(let x=0;x<F.w;x+=6.4)F.paint(x,.3,2.15,F.h-.55,'#ded5bf');
    for(let z=3.2;z<F.h;z+=4.2)F.paint(0,z,F.w,.79,'#d1c7b4');
  });
  const pappas=section('w29936567'),base=body(pappas,0,12.4,'#bfb7a5','#a79c8e',F=>gridFace(F,4.1,3.7,'#798f90','#ccc3af'));
  const scoops=[];
  for(let k=0;k<4;k++){
    const lo=28.35+k*9.42,r=courtBox(54.3,lo,76.1,lo+8.9);
    scoops.push(obj(r,15.6,()=>{
      let s='';const z=v=>12.42+3.1*(1-Math.sqrt(Math.max(0,1-v*v)));
      for(let j=0;j<6;j++){const a=j/6,b=(j+1)/6;s+=shape([campus(54.3,lo+8.9*a,z(a)),campus(76.1,lo+8.9*a,z(a)),campus(76.1,lo+8.9*b,z(b)),campus(54.3,lo+8.9*b,z(b))],roofTone(mix('#c6c3ae','#a2a394',a*.45)),0);}
      if(vis([...campus(0,1),0]))s+=shape([campus(54.3,lo+8.9,12.4),campus(76.1,lo+8.9,12.4),campus(76.1,lo+8.9,15.52),campus(54.3,lo+8.9,15.52)],'#7d9897',.48);
      for(const u of [54.3,76.1])if(vis([...campus(u<60?-1:1,0),0]))s+=shape([campus(u,lo+8.9,12.4),...Array.from({length:7},(_,j)=>campus(u,lo+8.9*j/6,z(j/6)))],m.light,.4);
      return s;
    }));
  }
  return [combined([main,lift,stack]),redstone,combined([base,...scoops])];
}

function stoneCourses(F){
  const {w,h,paint}=F;
  for(let row=0,z=.16;z<h;z+=.57,row++){
    paint(0,z,w,.026,'#baaf97');
    if(UPX<.48)for(let x=.56+row%2*.63;x<w;x+=1.62)paint(x,z,.024,.55,'#b6aa93');
  }
}
function archOutline(F,cx,base,shoulder,r,rise,colour) {
  const {g,h,tint}=F;
  g.fillStyle=tint(colour);g.beginPath();g.moveTo(cx-r,h-base);g.lineTo(cx-r,h-shoulder);
  g.quadraticCurveTo(cx-r*.85,h-shoulder-rise*.53,cx,h-shoulder-rise);
  g.quadraticCurveTo(cx+r*.85,h-shoulder-rise*.53,cx+r,h-shoulder);
  g.lineTo(cx+r,h-base);g.closePath();g.fill();
}
function lancet(F,x,z,shoulder,r,rise){
  const {g,h,paint,tint}=F;
  archOutline(F,x,z-.18,shoulder,r+.26,rise+.35,'#a69881');
  archOutline(F,x,z,shoulder,r+.11,rise+.15,'#eadbb8');
  archOutline(F,x,z+.12,shoulder,r,rise,'#52646a');
  const count=r>3?5:r>1.4?3:2,step=r*2/count;
  for(let j=0;j<count;j++){
    const dx=(j+.5)*step-r,u=x+dx,half=step*.44;
    const head=shoulder+rise*(1-Math.abs(dx/r))*.54;
    archOutline(F,u,z+.22,head-.4,half,.52,'#73878a');
    if(UPX<.75&&r>1){
      // Diamond leading and small, irregular pieces of coloured glass.
      g.strokeStyle=tint('#586b6b');g.lineWidth=.045;g.beginPath();
      const widths=2,cell=half/widths,aspect=Math.min(.78,cell*1.65);
      for(let y=z+.32,i=0;y<head-.5;y+=aspect,i++){
        for(let k=0;k<widths*2;k++){
          const a=u-half+(k+.5)*cell,yy=h-y;
          g.moveTo(a-cell/2,yy);g.lineTo(a,yy-aspect*.48);g.lineTo(a+cell/2,yy);g.lineTo(a,yy+aspect*.48);g.closePath();
        }
      }
      g.stroke();
      for(let y=z+.64,i=0;y<head-.65;y+=.94,i++){
        const a=u+((i+j)%3-1)*half*.39,sz=Math.min(.29,half*.48);
        g.fillStyle=tint(['#a39671','#859fa0','#977f78','#92946f'][(i+j)%4]);g.beginPath();
        g.moveTo(a,h-y-sz*1.3);g.lineTo(a+sz,h-y);g.lineTo(a,h-y+sz*1.3);g.lineTo(a-sz,h-y);g.closePath();g.fill();
      }
    }
    if(j>0)paint(u-step/2-.047,z+.12,.094,head-z-.30,'#cfc2a7');
  }
  if(r>1.2){
    const radius=r*.16;
    for(const [f,v] of [[0,.69],[-.30,.32],[.30,.32]]){
      const xx=x+r*f,zz=shoulder+rise*v;
      g.strokeStyle=tint('#d4c7ab');g.lineWidth=r*.032;g.beginPath();
      for(let j=0;j<4;j++){const a=j*Math.PI/2,ox=xx+radius*.49*Math.cos(a),oy=h-zz+radius*.49*Math.sin(a);g.moveTo(ox+radius*.53,oy);g.arc(ox,oy,radius*.53,0,Math.PI*2);}
      g.stroke();
    }
  }
  paint(x-r,shoulder-.14,2*r,.09,'#b9ad92');
}
function chapel(){
  const m=material,id='w1007090937',nave=courtBox(98.7,14.65,113.8,47.55),cx=106.25;
  const base=body(nave,0,15.85,m.stone,m.slate,F=>{
    const {w,n,paint}=F;stoneCourses(F);
    paint(0,.48,w,.29,m.carving);paint(0,3.0,w,.19,m.carving);
    if(Math.abs(n[0])>.8){
      for(let i=0;i<4;i++)lancet(F,w*(i+.5)/4,5.1,10.4,2.18,3.66);
    }else if(n[1]>.7){
      const {g,h}=F;
      lancet(F,w/2,5.25,9.65,3.9,4.75);
      const disc=(x,z,r,col)=>{g.fillStyle=col;g.beginPath();g.arc(x,h-z,r,0,Math.PI*2);g.fill()};
      disc(w/2,11,3.15,'#d2c2a1');disc(w/2,11,2.82,'#687c82');
      for(let j=0;j<8;j++)disc(w/2+1.62*Math.cos(j*Math.PI/4),11+1.62*Math.sin(j*Math.PI/4),.70,j%2?'#b79c74':'#8c9b9a');
      disc(w/2,11,.64,'#d7c7aa');
    }
  });
  const cover=roofOver({c:campus(cx,31.10),ax:campus(0,1),L:32.93,W:15.18},15.85,
    {roof:'gabled',rise:6.15,eaves:.14,roofColour:m.slate,wall:m.stone,roofTex:'slate'});
  const hall=obj(nave,22.2,()=>base.draw()+cover());
  const front=courtBox(99.78,12.17,111.82,14.65);
  const portal=body(front,0,15.95,m.stone,m.carving,F=>{
    if(F.n[1]>-.7)return;
    const {w,paint}=F;const mid=w/2;stoneCourses(F);
    for(let j=0;j<3;j++){const x=mid+(j-1)*2.58;
      archOutline(F,x,1.05,3.60,1.30,1.03,m.carving);archOutline(F,x,1.08,3.48,1.11,.94,'#785742');
      for(let j=-2;j<=2;j++)paint(x+j*.31,1.10,.045,2.64,'#5c4834');
      paint(x-.05,1.08,.1,2.85,'#4a483e');paint(x-.84,1.36,1.68,.12,'#a0825c');}
    paint(.4,4.95,w-.8,.28,m.carving);for(let u=.13;u<w;u+=.52)paint(u,5.24,.17,.27,m.carving);lancet(F,mid,6.04,10.38,3.87,4.75);
    for(const i of [-1,1])lancet(F,mid+i*4.9,5.75,9.13,.40,1.24);
  });
  const gable=obj(front,22.91,()=>{
    let s=portal.draw();
    const a=campus(99.78,12.17,15.95),b=campus(111.82,12.17,15.95),tip=campus(cx,12.17,21.76);
    const back=p=>[p[0]+2.48*(-buSin),p[1]+2.48*buCos,p[2]];
    s+=shape([a,tip,back(tip),back(a)],roofTone(m.slate),.4)+shape([tip,b,back(b),back(tip)],roofTone(m.slate),.4);
    if(vis([...campus(0,-1),0]))s+=shape([a,b,tip],m.stone,.55)+edge(a,tip,m.carving,.20)+edge(tip,b,m.carving,.20);
    if(vis([...campus(0,-1),0])){
      for(let j=0;j<9;j++){
        const z=16.2+j*.54,hw=5.55*(1-(z-15.95)/5.82);
        s+=edge(campus(cx-hw,12.16,z),campus(cx+hw,12.16,z),'#b9ad92',.052);
      }
      for(const side of [-1,1])for(let j=1;j<6;j++){
        const z=16.05+j*.84,u=cx+side*5.7*(1-(z-15.95)/5.82);
        s+=shape([campus(u-.18,12.14,z),campus(u+.18,12.14,z),campus(u,12.14,z+.46)],m.carving,.24);
      }
    }
    return s+edge(campus(cx,12.3,21.6),campus(cx,12.3,22.9),'#aaa28c',.15)+edge(campus(cx-.36,12.3,22.44),campus(cx+.36,12.3,22.44),'#aaa28c',.15);
  });
  const parts=[hall,gable];
  for(const sign of [-1,1]){
    const u=sign<0?98.2:114.23;
    for(const v of [14.88,22.9,31.0,39.35,46.75]){
      const r=courtBox(u-.57,v-.61,u+.57,v+.61),p=courtBox(u-.41,v-.44,u+.41,v+.44);
      const pin=v<16||v>46,cap=pin?19.4:13.9;
      parts.push(obj(r,pin?23.15:14.85,()=>{
        let s=filledSolid(r,0,5.30,m.stone,m.carving)+loft(atZ(r,5.30),atZ(p,5.72),n=>tone(n,soft(m.carving)))+filledSolid(p,5.72,cap,m.stone,m.carving);
        const shoulder=pin?cap+.64:cap+.12;
        s+=filledSolid(r,cap,shoulder,m.carving);
        return s+peak(r,shoulder,campus(u,v,pin?23.1:14.8),m.stone);
      }));
    }
  }
  for(let j=0;j<6;j++){
    const back=12.17-(5-j)*.45,r=courtBox(100.0,back-.44,111.70,back);
    parts.push(obj(r,(j+1)*.18,()=>filledSolid(r,0,(j+1)*.18,m.stone,roofTone(m.carving))));
  }
  return combined(parts);
}
function cloister(id){
  const r=section(id),uv=r.map(site),lower=14.6,upper=18.95;
  const a=Math.min(...uv.map(q=>q[0])),b=Math.max(...uv.map(q=>q[0]));
  return obj(r,5.9,()=>{
    let s=filledSolid(r,4.42,5.62,material.stone,roofTone('#8e938c'));
    const cols=Math.max(2,Math.ceil((b-a)/5.8)),bay=(b-a)/cols,parts=[];
    for(const v of [lower+.27,upper-.27])for(let j=0;j<cols;j++){
      const x=a+j*bay+.18,w=bay-.32,post=courtBox(x,v-.22,x+.57,v+.22);
      if(!post.every(p=>inside(p,r)))continue;
      let svg=filledSolid(post,0,4.42,material.stone,material.carving);
      const arch=[campus(x,v,4.50),campus(x+w,v,4.50),campus(x+w,v,2.18)];
      for(let i=0;i<=12;i++){const t=i/12;arch.push(campus(x+w-w*t,v,2.18+1.93*Math.sqrt(Math.max(0,1-(2*t-1)**2))));}
      svg+=shape(arch,material.stone,.4);
      parts.push({fp:[campus(x,v),campus(x+w,v)],z1:4.5,svg});
    }
    return planSort(parts)+s;
  });
}
function theology(){
  const id='w1007090933',parts=[],m=material;
  for(const [lo,hi,h] of [[null,7.3,9.1],[7.3,null,25.3]]){
    parts.push(body(section(id,lo,hi,null,null),0,h,m.stone,'#a9a394',F=>{
      const {w,h,paint}=F;if(w<1.35)return;
      const bays=Math.max(1,Math.round(w/3.9)),bay=w/bays;stoneCourses(F);
      for(let j=0;j<bays;j++){
        const x=(j+.5)*bay,r=Math.min(1.17,bay*.37);
        if(h<12){lancet(F,x,1.3,5.98,r,1.08);continue;}
        const principal=(Math.abs(F.n[1])>.75);
        for(let f=0;f<6;f++){
          const z=1.22+3.94*f,sash=f===0||f===5?r*.70:r;
          paint(x-sash,z,2*sash,2.2,'#667e7d');
          paint(x-.06,z,.12,2.2,'#c0bda9');
          paint(x-sash,z+1.32,2*sash,.09,m.light);
          if(principal&&f>0&&f<5){
            paint(x-sash-.13,z-.83,2*sash+.26,.89,'#82928b');
            for(let k=-1;k<2;k++)paint(x+k*sash*.62-.08,z-.72,.16,.43,'#627e77');
          }
          if(UPX<.5)for(const side of [-1,1])paint(x+side*sash*.51,z,.055,2.20,m.light);
        }
        if(principal&&j%5===2){archOutline(F,x,.23,2.72,r+.46,1.23,m.carving);archOutline(F,x,.26,2.68,r+.10,1.02,'#715f49');}
      }
      paint(0,h-.31,w,.31,m.carving);
    }));
  }
  return combined(parts);
}

// Marsh Plaza is mapped as outdoor seating, which the base kit omits.
const marshPaving=[[80.8,11.1],[125.3,10.8],[132.3,10.9],[132.1,-19.8],[80.5,-19.6]].map(p=>campus(...p));
SCENE.walk.push([marshPaving]);
SCENE.furniture=SCENE.furniture.filter(f=>f.name!=='Free at Last');
// This stretch of the Charles has a path but no mooring in the survey.
SCENE.boats=SCENE.boats.filter(b=>b.anchor);
const railWays=SCENE.rails.filter(r=>r.kind==='light_rail').map(r=>r.p.map(site).sort((a,b)=>a[0]-b[0]));
function railV(k,u){
  const pts=railWays[k],i=pts.findIndex(p=>p[0]>=u),b=i<0?pts.at(-1):pts[Math.max(i,1)],a=i<0?pts.at(-2):pts[Math.max(0,i-1)];
  return a[1]+(u-a[0])*(b[1]-a[1])/(b[0]-a[0]);
}
// BU Lot R is a surface parking polygon (way 185784280); its internal
// service aisles are present in the kit, but its paved area is not.
const lotR=[[-33.7,-113.0],[-93.5,-93.4],[-100.6,-79.0],[-100.3,-66.8],[-33.3,-66.6]];
const availableParking=lotR.map(p=>campus(...p));
const highwayCenters=SCENE.centerlines.filter(l=>['Storrow Drive','Massachusetts Turnpike'].includes(l.name));
SCENE.routes=SCENE.routes.filter(r=>r.kind!=='bike'||r.name||!r.p.every(p=>highwayCenters.some(l=>l.p.some((q,i)=>{
  if(!i)return false;
  const a=l.p[i-1],dx=q[0]-a[0],dy=q[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<7.5;
}))));
// prep offsets sidewalks on both sides of each one-way carriageway. Four
// inferred walks occupy the rail reservation. Keep the actual mapped crossing
// ways and the outer sidewalks, and remove only those lengthwise median walks.
SCENE.routes=SCENE.routes.filter(r=>{
  if(r.kind!=='ped'||r.name!=='Commonwealth Avenue')return true;
  return !r.p.some(p=>{
    const [u,v]=site(p);
    return railWays.some((_,k)=>Math.abs(v-railV(k,u))<1.6);
  });
});
const kitGroundInk=paintGroundInk;
paintGroundInk=function(g){
  kitGroundInk(g);
  g.save();g.transform(...Dv(...campus(1,0),0),...Dv(...campus(0,1),0),...P(0,0,0));
  const trace=r=>{g.beginPath();r.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath()};
  const line=(a,b,col,w)=>{g.strokeStyle=col;g.lineWidth=w;g.beginPath();g.moveTo(...a);g.lineTo(...b);g.stroke()};
  const paving=(r,stone,mortar,wide,deep)=>{
    g.save();trace(r);g.clip();g.fillStyle=SEASON.snow?snowy(stone,.84):SEASON.wet?mix(stone,'#7a8186',.19):stone;
    const xs=r.map(p=>p[0]),ys=r.map(p=>p[1]),x0=Math.floor(Math.min(...xs)),x1=Math.ceil(Math.max(...xs)),y0=Math.floor(Math.min(...ys)),y1=Math.ceil(Math.max(...ys));
    g.fillRect(x0,y0,x1-x0+1,y1-y0+1);g.strokeStyle=SEASON.snow?'#dddacc':mortar;g.lineWidth=UPX>.5?.05:.04;g.beginPath();
    for(let i=0,y=y0;y<=y1;y+=deep,i++){
      g.moveTo(x0,y);g.lineTo(x1,y);
      if(UPX<.7)for(let x=x0+(i%2)*wide/2;x<x1;x+=wide){g.moveTo(x,y);g.lineTo(x,y+deep);}
    }
    g.stroke();g.restore();
  };
  trace(lotR);g.fillStyle=SEASON.snow?'#d5d2c7':SEASON.wet?'#9d9994':'#b4ada0';g.fill();
  g.save();g.clip();g.strokeStyle='#eee7d3';g.lineWidth=.12;g.beginPath();
  for(const v of [-69.9,-83.5,-98.0])for(let u=-99;u<-32;u+=2.85){g.moveTo(u,v-2.4);g.lineTo(u,v+2.4);}
  g.stroke();g.restore();
  // Planted margins beside the tracks become the two narrow platform decks.
  for(const v of [-37.75,-49.25]){
    g.fillStyle=SEASON.snow?'#e2e1d3':SEASON.leaves==='autumn'?'#a9ab79':'#b0be85';
    g.fillRect(-106,v-.7,117,1.55);
  }
  paving(marshPaving.map(site),'#d5cbb7','#b5aa97',1.45,.88);
  // Large planting beds at the sides of the portal, seen from Marsh Plaza.
  for(const [u,v,w,d] of [[82,3.9,15.7,6.4],[115.5,4.8,14,5.6]]){
    g.fillStyle=SEASON.snow?'#dce0cc':SEASON.leaves==='autumn'?'#aaad79':'#a0ba7c';
    g.fillRect(u,v,w,d);
  }
  // Brick forecourt, traced around the Mugar entry block and the two main tree rows.
  paving([[-63,12],[-65,-16.5],[-17,-16.5],[-19.4,15.8],[-30.2,16],[-30.6,2.1],[-49.25,2.1],[-48.75,12.9]],'#bd8b70','#a77760',.56,.29);
  // Granite border and black-and-bronze inlay in front of Castillo's sculpture.
  for(const [radius,col] of [[2.94,'#c8bc9e'],[2.75,'#5b584c'],[2.59,'#beaa75'],[2.48,'#44483e'],[2.02,'#c7b27c'],[1.88,'#565649']]){
    g.beginPath();g.fillStyle=SEASON.snow?mix(col,'#e3ded1',.52):col;g.arc(106.1,-14.75,radius,0,Math.PI*2);g.fill();
  }
  trace([[105.12,-13.83],[107.08,-13.83],[106.92,-15.38],[106.1,-15.95],[105.28,-15.38]]);
  g.fillStyle='#b4a275';g.fill();line([106.1,-13.86],[106.1,-15.52],'#595a48',.13);
  // Ballast, sleepers and rail flangeways follow the two actual OSM track axes.
  for(let k=0;k<2;k++){
    const pts=railWays[k];g.lineJoin='round';g.lineCap='butt';
    const stroke=(offset,col,width)=>{g.strokeStyle=col;g.lineWidth=width;g.beginPath();pts.forEach(([u,v],i)=>i?g.lineTo(u,v+offset):g.moveTo(u,v+offset));g.stroke()};
    stroke(0,SEASON.snow?'#ccc9bd':'#9c8d7a',3.34);
    g.strokeStyle=SEASON.snow?'#a69e92':'#796d5e';g.lineWidth=.18;g.beginPath();
    for(let u=Math.ceil(pts[0][0]);u<pts.at(-1)[0];u+=.72){
      if((u>90&&u<119)||(u> -112&&u< -106))continue;
      const v=railV(k,u);g.moveTo(u,v-1.20);g.lineTo(u,v+1.20);
    }
    g.stroke();
    for(const u of [-109,94.8,115.7]){const v=railV(k,u);g.fillStyle=SEASON.snow?'#c9c8be':'#888780';g.fillRect(u-1.6,v-1.8,3.2,3.6);}
    for(const off of [-.72,.72])stroke(off,'#6f665a',.20);
  }
  g.restore();
};
function memorial(){
  const u=106.2,v=-2.4,c=campus(u,v),base=courtBox(u-1.35,v-1.30,u+1.35,v+1.30);
  return obj(courtBox(u-2.8,v-2.0,u+2.8,v+2.0),7.1,()=>{
    let s=filledSolid(base,0,1.48,'#585b55','#848278');
    const blades=[];
    // Joined, folded steel birds rise from a single granite plinth.
    for(let i=0;i<50;i++){
      const t=i/49,side=i%2?1:-1,theta=i*2.39996;
      const rad=.17+1.35*t,dx=rad*Math.cos(theta)+.8*t*t,dy=rad*Math.sin(theta)*.62,z=1.40+4.75*t;
      const x=u+dx,y=v+dy,root=campus(x,y,z),l=.39+.33*t;
      const wing=[root,campus(x+side*l*.36,y+.25,z+.18),campus(x+side*l*1.80,y+.38,z+.98),campus(x+side*l*.59,y-.06,z+.70)];
      blades.push({at:root,svg:shape(wing,i%4?'#65716e':'#9a9f94',.24)+shape([root,wing[1],campus(x-side*l*.76,y-.24,z+.57)],'#aeb2a7',.22)});
    }
    return s+byDepth(blades);
  });
}
function shelter(u,v,side){
  const half=4.7,depth=.94,r=courtBox(u-half-.20,v-depth,u+half+.20,v+depth),m=material;
  return obj(r,3.52,()=>{
    const back=v+side*.70,near=v-side*.68,parts=[];
    for(const [a,b] of [[[u-half,back],[u+half,back]],[[u-half,near],[u-half,back]],[[u+half,back],[u+half,near]]]){
      const A=campus(...a),B=campus(...b),count=a[0]===b[0]?1:6;
      let s='<g opacity=".36">'+shape([[...A,.83],[...B,.83],[...B,2.50],[...A,2.50]],'#a1c1bd',.32)+'</g>';
      for(let i=0;i<=count;i++){const p=A.map((x,j)=>x+(B[j]-x)*i/count);s+=stick([...p,.40],[...p,2.90],.055,i===0||i===count?'#994d40':'#476557');}
      for(const h of [.82,1.53,2.49])s+=edge([...A,h],[...B,h],'#4a685a',.085);
      parts.push({fp:[A,B],z1:2.9,svg:s});
    }
    let s=planSort(parts);
    // Shallow arched standing-seam roof, red fascia, glass windscreens.
    const height=t=>2.92+.48*(1-t*t);
    for(let j=0;j<8;j++){
      const a=-1+j*.25,b=a+.25;
      s+=shape([campus(u-half-.18,v+a*depth,height(a)),campus(u+half+.18,v+a*depth,height(a)),campus(u+half+.18,v+b*depth,height(b)),campus(u-half-.18,v+b*depth,height(b))],roofTone(mix('#8ba3a8','#c4d1ca',1-Math.abs(a))),0);
    }
    for(const off of [-depth,depth])s+=edge(campus(u-half-.19,v+off,2.92),campus(u+half+.19,v+off,2.92),'#a15042',.13);
    for(let i=0;i<=8;i++){const x=u-half+i*(2*half/8);
      s+='<path d="'+pd(Array.from({length:9},(_,k)=>campus(x,v+(k/4-1)*depth,height(k/4-1)+.025)),false)+'" fill="none" stroke="#738b8f" style="stroke-width:.065"/>';}
    return s;
  });
}
function informationBoard(u,v){
  const r=courtBox(u-1.19,v-.065,u+1.19,v+.065),card=body(r,.72,2.62,'#62695b','#64776b',F=>{
    if(F.w<1)return;
    const {paint,label,w}=F;paint(.07,.05,w-.14,1.80,'#efe9d5');paint(.07,1.57,w-.14,.29,'#397957');
    label('BU CENTRAL',w/2,1.635,w*.86,.18,'#f8f0d9');
    for(let j=0;j<3;j++){paint(.18,.45+j*.25,.90,.045,'#a2a997');paint(1.30,.45+j*.21,.67,.04,j===1?'#9e814c':'#91a294');}
  });
  return obj(r,2.63,()=>[...r.slice(0,2).map(p=>stick([...p,.33],[...p,.82],.045,'#506254')),card.draw()].join(''));
}
const platformRings=[
  [[89.1,-38.2],[16,-38],[15.8,-40.1],[89.2,-40.2]],
  [[15.8,-48.9],[15.7,-46.7],[89.3,-47.2],[89.3,-49.0]]
];
function station(){
  const parts=[];
  platformRings.forEach((uv,k)=>{
    const r=ccw(uv.map(p=>campus(...p))),side=k?-1:1,edgeV=u=>k?-46.71-(u-16)*.5/73:-40.1-(u-16)*.1/73;
    // Low concrete sides, inscribed pavers and the yellow warning strip.
    parts.push(obj(r,.40,()=>{
      let s=filledSolid(r,0,.36,'#b9b2a2',roofTone('#c6c0ae'));
      s+=shape([campus(16.10,edgeV(16),.37),campus(89.03,edgeV(89),.37),campus(89.03,edgeV(89)+side*.51,.37),campus(16.10,edgeV(16)+side*.51,.37)],SEASON.snow?'#d8c27c':'#e9bc4e',0);
      for(let u=17;u<89;u+=1.5)s+=edge(campus(u,edgeV(u)+side*.53,.37),campus(u,edgeV(u)+side*1.75,.37),'#a69e90',.038);
      if(UPX<.16){
        let dots='';
        for(let u=16.25;u<89;u+=.27)for(const d of [.12,.34])dots+=pd([campus(u,edgeV(u)+side*d,.385),campus(u+.034,edgeV(u)+side*d,.385)],false);
        s+='<path d="'+dots+'" fill="none" stroke="#bc9847" style="stroke-width:.052"/>';
      }
      return s;
    }));
    const fenceV=k?-48.82:-38.12;
    for(let u=16.4;u<86;u+=7.1){
      const b=Math.min(u+7.1,86.5),fp=courtBox(u,fenceV-.08,b,fenceV+.08);
      parts.push(obj(fp,1.71,()=>{
        let s=filledSolid(fp,.28,.64,'#b2afa0');
        for(const z of [.76,1.56])s+=edge(campus(u,fenceV,z),campus(b,fenceV,z),'#43524a',.075);
        let bars='';for(let x=u;x<b;x+=.39)bars+=pd([campus(x,fenceV,.63),campus(x,fenceV,1.64)],false);
        return s+'<path d="'+bars+'" fill="none" stroke="#4a564e" style="stroke-width:.055"/>';
      }));
    }
    for(const x of (k?[33,66.4]:[38,70]))parts.push(shelter(x,edgeV(x)+side*1.22,side));
    for(const x of [23.5,58,83.0])parts.push(informationBoard(x,edgeV(x)+side*1.81));
  });
  // The two platforms ramp down at the St Mary's crossing. A picket fence
  // between tracks prevents a shortcut through the running rails.
  for(let k=0;k<2;k++){
    const v=k?-48.13:-39.16,r=courtBox(89.11,v-.96,93.05,v+.96);
    parts.push(obj(r,.38,()=>shape([campus(89.11,v-.96,.36),campus(93.05,v-.96,.035),campus(93.05,v+.96,.035),campus(89.11,v+.96,.36)],roofTone('#c5beab'),.42)));
    for(const u of [21,51.5,78]){const outer=k?-48.73:-38.22;
      const post=courtBox(u-.14,outer-.14,u+.14,outer+.14);
      parts.push(obj(post,4.35,()=>stick(campus(u,outer,.38),campus(u,outer,3.72),.069,'#414d46')+
        ball(campus(u,outer,3.96),.23,soft('#e9e0c2'),.42)+stick(campus(u,outer,4.13),campus(u,outer,4.30),.048,'#515a4d')));
    }
  }
  for(let start=16.0;start<89;start+=12){
    const end=Math.min(89,start+12),v=(railV(0,start)+railV(1,start))/2,
      fp=courtBox(start,v-.035,end,v+.035);
    parts.push(obj(fp,1.12,()=>{
      let bars='';for(let u=start;u<end;u+=.46)bars+=pd([campus(u,v,.1),campus(u,v,1.12)],false);
      return edge(campus(start,v,1.01),campus(end,v,1.01),'#536055',.069)+'<path d="'+bars+'" fill="none" stroke="#576257" style="stroke-width:.042"/>';
    }));
  }
  // Brown ballast, tracks and crossings are below these twin contact wires.
  for(let u=-99;u<=145;u+=27){
    const mid=(railV(0,u)+railV(1,u))/2,fp=courtBox(u-.25,mid-.23,u+.25,mid+.23);
    parts.push(obj(fp,6.65,()=>{
      let s=stick(campus(u,mid,0),campus(u,mid,6.60),.11,'#596b5d');
      s+=edge(campus(u,mid-2.9,5.90),campus(u,mid+2.9,5.90),'#64766a',.105);
      for(const sign of [-1,1])s+=edge(campus(u,mid,6.50),campus(u,mid+sign*2.7,5.9),'#67786e',.068);
      return s;
    }));
  }
  return parts;
}
function contactWires(){
  const parts=[];
  for(let k=0;k<2;k++){
    const start=Math.ceil(railWays[k][0][0])+1,end=Math.floor(railWays[k].at(-1)[0])-1;
    for(let a=start;a<end;a+=16){
      const b=Math.min(end,a+16),va=railV(k,a),vb=railV(k,b),A=campus(a,va),B=campus(b,vb);
      parts.push(obj([A,B],5.89,()=>edge([...A,5.75],[...B,5.75],'#69756b',.053)));
    }
  }
  return parts;
}
function trolley(k,u){
  const v=railV(k,u),dir=k?1:-1,type9=k===1,m=material;
  const at=(x,y,z)=>campus(u+x*dir,v+y*dir,z);
  const ring=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(p=>at(...p).slice(0,2));
  const length=type9?21.9:22.0,half=length/2,w=1.32,fp=ring(-half,-w,half,w);
  if(fp.some(p=>Math.abs(p[0])>125||Math.abs(p[1])>125)){
    if(fp.every(p=>Math.abs(p[0])>125||Math.abs(p[1])>125))return null;
  }
  return obj(fp,5.82,()=>{
    // The body, glazing and raised cab face are drawn in the car's own frame.
    const parts=[],stripe=type9?'#237349':'#367955',silver=type9?'#e4e1d4':'#b8bfbb';
    for(const [a,b] of [[-half,-3.97],[-3.63,3.63],[3.97,half]]){
      const front=b===half,back=a===-half,nose=type9?.88:1.13,ta=back?nose:0,tb=front?nose:0;
      const points=[[a+ta,-w],[b-tb,-w],[b,-w+tb*.54],[b,w-tb*.54],[b-tb,w],[a+ta,w],[a,w-ta*.54],[a,-w+ta*.54]]
        .filter((p,i,ps)=>!i||p[0]!==ps[i-1][0]||p[1]!==ps[i-1][1]);
      const r=ccw(points.map(p=>at(...p).slice(0,2)));
      const bogie=ring(a+.46,-1.14,b-.46,1.14);
      let wheels=filledSolid(bogie,.12,.62,'#404a45','#566159');
      for(const sy of [-1,1])if(vis([...campus(0,sy*dir),0])){
        for(const x of [a+1.10,b-1.10])for(const [rad,col] of [[.32,'#424942'],[.15,'#879088']]){
          wheels+=shape(Array.from({length:12},(_,j)=>at(x+rad*Math.cos(j*Math.PI/6),sy*1.18,.32+rad*Math.sin(j*Math.PI/6))),col,0);
        }
      }
      const roof=points.map(([x,y])=>at(x-(x===-half?-1:x===half?1:0)*(type9?.29:.57),y*.98,3.34));
      const sill=atZ(r,1.34);
      let s=wheels+filledSolid(r,.43,1.34,type9?stripe:silver,silver)+loft(sill,roof,n=>tone(n,soft(silver)))+shape(roof,'#c7c9bd',.4);
      const panels=[];
      for(const sy of [-1,1]){
        if(!vis([...campus(0,sy*dir),0]))continue;
        const A=a+ta,B=b-tb;
        const pane=(x0,z0,x1,z1,col)=>shape([at(x0,sy*w,z0),at(x1,sy*w,z0),at(x1,sy*w,z1),at(x0,sy*w,z1)],col,0);
        let p=pane(A,.32,B,.48,'#526057')+pane(A,.48,B,type9?1.21:.87,stripe)+pane(A,1.04,B,1.15,stripe)+pane(A,1.34,B,2.86,'#384c4c');
        const n=front||back?5:4,step=(B-A)/n;
        for(let j=0;j<n;j++){
          const x=A+j*step,d=type9?(j===1):(j===1||(!front&&!back&&j===2));
          p+=pane(x+.09,1.41,x+step-.09,2.70,j%3?'#718f8d':'#5f7d80');
          if(d){p+=pane(x+.06,.38,x+step-.06,2.94,'#c3c8bb')+pane(x+.16,1.42,x+step-.16,2.65,'#5e7c7e')+pane(x+step*.5-.055,.38,x+step*.5+.055,2.86,'#3d5351');}
        }
        const i=front?A+.68:B-.68;
        p+=shape(Array.from({length:14},(_,j)=>at(i+.22*Math.cos(j*Math.PI/7),sy*w,1.12+.22*Math.sin(j*Math.PI/7))),'#f3eddb',.2);
        p+=pane(i-.13,1.18,i+.13,1.23,'#2e403d')+pane(i-.035,.99,i+.035,1.19,'#2e403d');
        panels.push(p);
      }
      s+=panels.join('');
      for(const sx of [-1,1]){
        if(!(sx>0?front:back)||!vis([...campus(sx*dir,0),0]))continue;
        const x=sx*half;
        const cab=(y,z)=>at(x-sx*(type9?.29:.57)*Math.max(0,(z-1.34)/2),y,z);
        const cover=(y0,z0,y1,z1,color)=>shape([cab(y0,z0),cab(y1,z0),cab(y1,z1),cab(y0,z1)],color,0);
        s+=cover(-1.0,.43,1.0,1.34,stripe);
        for(const sy of [-1,1]){
          if(!vis([...campus(sx*dir*.42,sy*dir*.90),0]))continue;
          const x0=sx*(half-nose);
          s+=shape([at(x0,sy*w,1.43),cab(sy*.99,1.43),cab(sy*.87,2.91),at(x0,sy*w,2.82)],type9?'#475d60':'#546e73',.24);
          s+=shape([at(x0,sy*w,.48),cab(sy*.99,.48),cab(sy*.99,1.33),at(x0,sy*w,1.01)],stripe,0);
        }
        s+=shape([cab(-1.00,1.34),cab(1.00,1.34),cab(.91,3.08),cab(-.91,3.08)],'#344948',.30);
        s+=shape([cab(-.85,1.55),cab(.85,1.55),cab(.75,2.62),cab(-.72,2.62)],type9?'#658284':'#577475',0);
        s+=cover(-.61,2.63,.61,2.94,'#292f29')+cover(-.43,2.73,.39,2.82,'#ddaa50');
        for(const sy of [-1,1])s+=cover(sy*.80-.13,.95,sy*.80+.13,1.10,sx>0?'#f2dba4':'#ae5950');
      }
      const equip=ring(a+1.06,-.76,b-1.06,.76);
      s+=filledSolid(equip,3.35,3.67,'#858980','#b4b5a8');
      if(UPX<.5)for(let j=a+1.4;j<b-1.2;j+=.30)s+=edge(at(j,-.64,3.68),at(j,.64,3.68),'#777e77',.055);
      parts.push({fp:r,z1:3.7,svg:s});
    }
    for(const x of [-3.80,3.80]){const r=ring(x-.17,-1.20,x+.17,1.20);parts.push({fp:r,z1:3.34,svg:filledSolid(r,.47,3.30,'#53605a','#778178')});}
    let s=planOrder(parts);
    for(const side of [-.37,.37]){
      s+=stick(at(-5.30,side,3.63),at(-6.68,side,4.65),.052,'#48534b');
      s+=stick(at(-6.68,side,4.65),at(-5.15,side,5.74),.045,'#48534b');
    }
    s+=edge(at(-5.15,-.73,5.74),at(-5.15,.73,5.74),'#414d45',.115);
    // Clip the moving car only at the physical plate boundary.
    return fp.every(p=>Math.max(...p.map(Math.abs))<124.9)?s:clipTo(atZ(BASE_CORNERS,0),s);
  });
}
function carPosition(t,k){
  const from=k?-139:180,to=k?180:-139,stop=k?50:61;
  const approach=k?39:28,hold=k?18:20,leave=k?30:41,cycle=approach+hold+leave+8;
  const phase=(t+(k?44:40))%cycle;
  if(phase<approach){const q=phase/approach;return stop+(from-stop)*(1-q)*(1-q);}
  if(phase<approach+hold)return stop;
  const q=Math.min(1,(phase-approach-hold)/leave);return stop+(to-stop)*q*q;
}
let parkedMeshes;
function parkedCar(i,u,v,z){
  if(!parkedMeshes)parkedMeshes=['sedan','hatch'].map(kind=>makeCar(kind,{plate:'#e4e0d1'}));
  const col=['#819ca6','#607680','#ebe3d0','#9a6051','#667169'][i%5];
  return drawVehicle(parkedMeshes[+(i%4===0)],{c:campus(u,v),d:campus(0,i%2?1:-1),z,mats:{paint:soft(col)},w:.40});
}
function surfaceLot(){
  const rows=[];
  for(const [v,phase] of [[-69.9,0],[-83.5,1],[-98,2]]){
    const cars=[];
    for(let j=0,u=-97.6;u< -35;u+=2.85,j++){
      const fp=courtBox(u-1.26,v-2.34,u+1.26,v+2.34);
      if(j%4===phase||!fp.every(p=>inside(p,availableParking)&&!inRings(p,SCENE.roads)))continue;
      cars.push({fp,u,v,i:j+phase*9});
    }
    if(cars.length)rows.push(obj(hull(cars.flatMap(c=>c.fp)),1.65,()=>planSort(cars.map(c=>({fp:c.fp,z1:1.6,svg:parkedCar(c.i,c.u,c.v,0)})))));
  }
  return rows;
}
function parkingDeck(){
  const r=section('w468538536'),m=material,height=4.68;
  const lower=body(r,0,height,'#bdb5a0','#9c9c91',F=>{
    const {w,n,paint,label}=F;
    if(n[1]>.7&&w>12){
      gridFace(F,4.4,2.2,'#7b9695','#536564');
      paint(0,2.99,w,1.06,'#4e5c55');
      // POIs in the garage footprint; names stay with their actual storefronts.
      for(const p of SCENE.pois.filter(p=>['Nud Pob','Pavement Coffee House'].includes(p.name))){
        const [u]=site([p.x,p.y]);label(p.name.toUpperCase(),Math.abs(u-F.origin[0]),3.3,9.3,.49,'#f0e3c9');
      }
    }
  });
  const bays=[];
  for(const v of [-72.5,-90.7,-102.5])for(let u=10;u<=63;u+=2.85){
    const p=courtBox(u-1.29,v-2.23,u+1.29,v+2.23);
    if(!p.every(q=>inside(q,r)))continue;
    bays.push({u,v,p});
  }
  return obj(r,6.5,()=>{
    let s=lower.draw(),cars=[];
    for(let i=0;i<bays.length;i++){
      const {u,v,p}=bays[i];s+=edge([...p[0],height+.02],[...p[3],height+.02],'#e4dcc2',.095);
      if(i%4===1||i%7===4)continue;
      cars.push({fp:p,z1:height+1.6,svg:parkedCar(i,u,v,height+.03)});
    }
    for(let i=0;i<r.length;i++){
      const p=r[i],q=r[(i+1)%r.length];if(p.some((x,j)=>Math.abs(x)>124.9&&Math.abs(q[j]-x)<.1))continue;
      s+=shape([[...p,height],[...q,height],[...q,height+.59],[...p,height+.59]],'#c5c1ac',.32);
    }
    return s+planSort(cars);
  });
}
function stall(u,v,i){
  const r=courtBox(u-1.78,v-1.58,u+1.78,v+1.58),top=courtBox(u-.54,v-.40,u+.54,v+.40);
  return obj(r,3.15,()=>{
    let s='';for(const p of r)s+=stick([...p,0],[...p,2.25],.036,'#797c70');
    const table=courtBox(u-1.35,v-.85,u+1.35,v-.05);
    s+=filledSolid(table,.54,.84,'#a78b63','#c4a777');
    for(let j=0;j<4;j++)s+=filledSolid(courtBox(u-1.26+j*.64,v-.80,u-.70+j*.64,v-.12),.85,1.06,'#a48a61',['#bc694a','#8ea45a','#e3b552','#77935c'][j]);
    return s+loft(atZ(r,2.25),atZ(top,3.02),n=>tone(n,soft(['#ece3cb','#8d9c78','#b66f52'][i%3])))+
      shape(atZ(top,3.02),'#e9ddc3',.45);
  });
}
function figure(u,v,seed,graduate=false,base=0){
  const p=campus(u,v),r=rect(...p,.54,.57);
  if(!standable(...p))return null;
  return obj(r,2.38+base,()=>{
    const actor={...pedDressed(seed),d:campus(-.12,-.9928),p,walked:0};
    if(graduate)actor.shirt='#b94038';
    // A platform raises the whole small figure, including shoes, by its deck height.
    const shift=Dv(0,0,base);OX+=shift[0];OY+=shift[1];
    let s;
    try{
      s=pedestrian(actor,0).svg;
      if(graduate){
        const h=actor.tall;
        const wide=courtBox(u-.3,v-.20,u+.30,v+.20),narrow=courtBox(u-.20,v-.13,u+.20,v+.13);
        s+=loft(atZ(wide,.64*h),atZ(narrow,1.32*h),n=>tone(n,soft(actor.shirt)))+
          shape(atZ(courtBox(u-.25,v-.25,u+.25,v+.25),1.88*h),'#393f3d',.20)+edge(campus(u+.22,v+.18,1.88*h),campus(u+.27,v+.18,1.63*h),'#c6a164',.044);
      }
    }finally{OX-=shift[0];OY-=shift[1];}
    return s;
  });
}
function occasionProps(){
  if(SEASON.id==='commencement'){
    const grads=[[-1.2,-.50],[-.62,-.24],[0,-.12],[.63,-.12],[1.25,-.39],
      [-4.4,1.4],[-5.3,1.9],[-5.9,1.2],[6.0,1.3],[6.8,1.4],[7.4,.96]];
    return [...grads.map(([x,y],i)=>figure(106.1+x,-14.75+y,361+i,true)),
      ...[[0,-4.0],[.85,-3.8],[-3.2,-2.6],[3.0,-.2],[-6.6,2.7],[2.72,.8]].map(([x,y],i)=>figure(106.1+x,-14.75+y,491+i))].filter(Boolean);
  }
  if(SEASON.id==='market'){
    const parts=[];
    for(const [u,v] of [[-55,-12],[-47,-12],[-39,-12],[-31,-12],[-24,-8],[-24,-1]]){
      const booth=stall(u,v,parts.length);
      if(booth.fp.every(p=>standable(...p)&&!inRings(p,SCENE.roads))){parts.push(booth);
        for(let j=0;j<3;j++){const person=figure(u-1+j*.92,v-2.38-(j%2)*.54,215+parts.length);if(person)parts.push(person);}}
    }
    return parts;
  }
  return [];
}
let eventSeason,festivalParts=[],staticWires;
function CITY_EXTRA(t){
  if(SEASON!==eventSeason){
    eventSeason=SEASON;
    const waiting=[[28.6,-47.67],[41,-47.82],[75.4,-47.84],[64,-39.23],[84.6,-39.14],[47.6,-39.19]];
    festivalParts=[...waiting.map(([u,v],i)=>figure(u,v,90+i,false,.35)).filter(Boolean),...occasionProps()];
  }
  if(!staticWires)staticWires=contactWires();
  return [...staticWires.map((p,i)=>({...p,draw:()=>stamp('bu-wire'+i,p.draw,p.fp,5.72,p.h+.3)})),
    ...festivalParts.map((p,i)=>({...p,draw:()=>stamp('bu-event'+i,p.draw,p.fp,0,p.h+.3)})),
    ...[0,1].map(k=>trolley(k,carPosition(t,k))).filter(Boolean)];
}
function campusSign(){
  const r=courtBox(-81.5,-14.6,-78.45,-14.18);
  return body(r,0,3.35,'#a13b36','#b64b40',F=>{
    if(F.w<2)return;F.paint(.08,.05,F.w-.16,.73,'#6e6a60');
    F.label('BOSTON UNIVERSITY',F.w/2,2.83,F.w-.35,.28,'#fff0d9');
    F.label('George Sherman',F.w/2,2.00,F.w-.33,.30,'#fff0d9');F.label('Union',F.w/2,1.60,F.w-.33,.30,'#fff0d9');
    F.label('775',F.w/2,.99,F.w-.33,.35,'#fff0d9');
  });
}
const LANDMARKS=[
  {name:'BU Lot R',ids:[],build:surfaceLot},
  {name:'GSU plaza sign',ids:[],build:campusSign},
  {name:'BU Central platforms, shelters and overhead line',ids:[],build:station},
  {name:'Marsh Chapel',ids:['w1007090937'],build:chapel},
  ...['w1007090934','w1007090938'].map(id=>({name:'Marsh cloister '+id,ids:[id],build:()=>cloister(id)})),
  {name:'Free at Last',ids:[],build:memorial},
  {name:'School of Theology and Speare Hall',ids:['w1007090933'],build:theology},
  {name:'Mugar Memorial Library',ids:['w130209089'],build:library},
  {name:'George Sherman Union and Link',ids:['w130209090','w1408444687'],build:union},
  {name:'Law Tower, Redstone and Pappas Library',ids:['w485223499','w485223500','w29936567'],build:lawComplex},
  {name:'Commonwealth Avenue shops and parking deck',ids:['w468538536'],build:parkingDeck}
];
