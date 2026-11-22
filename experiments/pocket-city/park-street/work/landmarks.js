// Park and Tremont. Dimensions are in the rotated OSM plot's metres.
// The drawing kit supplies all projection, light, hatching, animation and compositing.
const psStone = '#b7aa99', psTrim = '#d3c6ad', psIron = '#394742', psSlate = '#646866';
const psCream = '#f2ead9', psBrick = '#a35745', psGlass = '#849d99';
const psRing = id => ccw(findBuilding(id).ring);
const psMix = (p,q,t) => p.map((v,i) => v+(q[i]-v)*t);
const psScale = (ring,c,k) => ring.map(p => psMix(c,p,k));
const psFrame = (c,u) => (x,y,z) => {
  const p=[c[0]+x*u[0]-y*u[1], c[1]+x*u[1]+y*u[0]];
  return z===undefined?p:[...p,z];
};
const psRect = (at,x0,x1,y0,y1) => ccw([at(x0,y0),at(x1,y0),at(x1,y1),at(x0,y1)]);
const psTop = (c) => SEASON.snow?snowy(c,.78):c;
function psGroup(parts) {
  return obj(hull(parts.flatMap(v=>v.fp)),Math.max(...parts.map(v=>v.h)),()=>
    planOrder(parts.map(p=>({fp:p.fp,z0:p.base||0,z1:p.h,svg:p.draw()}))));
}

// Each elevation is painted directly in local metres. Lettering uses the kit's
// wallText so a sign keeps the correct handedness when the reader turns the plate.
const psElevations=[];
const psKitElevation=paintSingaporeElevation;
paintSingaporeElevation=function(g,id) {
  if(id>=0)return psKitElevation(g,id);
  const {b,along,n,w,low,high,paint}=psElevations[-id-1];
  g.save();
  g.transform(...Dv(...along,0),...Dv(0,0,-1),...P(...b,high));
  g.beginPath();g.rect(0,0,w,high-low);g.clip();
  const colour=c=>nightCol(dot(n,SUN)>.14?c:mix(c,'#887e91',.15));
  // Local paint positions are heights above the street, including for tower stages.
  const rect=(x,z,width,height,c)=>{g.fillStyle=colour(c);g.fillRect(x,high-z-height,width,height)};
  const poly=(points,c)=>{g.fillStyle=colour(c);g.beginPath();points.forEach(([x,z],i)=>i?g.lineTo(x,high-z):g.moveTo(x,high-z));g.closePath();g.fill()};
  const line=(points,c,weight=.08)=>{g.strokeStyle=colour(c);g.lineWidth=weight;g.beginPath();points.forEach(([x,z],i)=>i?g.lineTo(x,high-z):g.moveTo(x,high-z));g.stroke()};
  const disc=(x,z,r,c)=>{g.fillStyle=colour(c);g.beginPath();g.arc(x,high-z,r,0,Math.PI*2);g.fill()};
  const text=(x,z,str,size,c,width,serif=false)=>{
    g.save();g.translate(x,high-z);g.scale(1/64,1/64);
    g.font='bold '+(size*64)+'px '+(serif?'Georgia, serif':'Arial, sans-serif');
    g.textAlign='center';g.fillStyle=colour(c);wallText(g,str,0,0,width*64);g.restore();
  };
  paint({w,n,rect,poly,line,disc,text,low,high});
  g.restore();
};
function psSolid(r,low,high,wall,paint,cap=wall) {
  const fp=ccw(r);
  const faces=fp.map((a,i)=>{
    const b=fp[(i+1)%fp.length],w=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const along=[(a[0]-b[0])/w,(a[1]-b[1])/w],n=[-along[1],along[0],0];
    const id=paint?-psElevations.push({b,along,n,w,low,high,paint}):0;
    return {n,id,quad:[...atZ([a,b],low),...atZ([b,a],high)]};
  });
  return {...obj(fp,high,()=>faces.filter(f=>vis(f.n)).map(f=>shape(f.quad,tone(f.n,soft(wall)),.44)+(f.id?'<elevation id="'+f.id+'"/>':'')).join('')+
    shape(atZ(fp,high),psTop(cap),.46)),base:low};
}
function psArch(p,x,z,w,h,col) {
  const r=w/2,shoulder=z+h-r,pts=[[x-r,z],[x+r,z]];
  for(let i=0;i<=16;i++)pts.push([x+r*Math.cos(i*Math.PI/16),shoulder+r*Math.sin(i*Math.PI/16)]);
  p.poly(pts,col);
}
function psSash(p,x,z,w,h,arched=false,glass='#778a87',trim=psCream) {
  const rectOrArch=(cx,b,width,height,c)=>arched?psArch(p,cx,b,width,height,c):p.rect(cx-width/2,b,width,height,c);
  rectOrArch(x,z-.1,w+.24,h+.22,trim);
  rectOrArch(x,z,w,h,glass);
  p.rect(x-w*.5-.18,z-.18,w+.36,.17,trim);
  if(UPX<.60) {
    for(const u of [-.22,.22])p.rect(x+u*w,z,.055,h-(arched?.18:0),trim);
    for(let v=.26;v<.9;v+=.23)p.rect(x-w*.49,z+h*v,w*.98,.055,trim);
  }
}
function psTSign(x,y,ax) {
  const r=rect(x,y,1.5,1.5),at=psFrame([x,y],ax);
  return obj(r,4.52,()=>{
    const disk=(rad,col)=>shape(Array.from({length:24},(_,i)=>at(rad*Math.cos(i*Math.PI/12),0,3.77+rad*Math.sin(i*Math.PI/12))),col,.32);
    const bar=(u0,u1,z0,z1)=>shape([at(u0,0,z0),at(u1,0,z0),at(u1,0,z1),at(u0,0,z1)],'#26312f',0);
    return stick(at(0,0,0),at(0,0,3.85),.082,psIron)+disk(.71,psIron)+disk(.642,'#faf5e8')+bar(-.40,.40,3.90,4.10)+bar(-.105,.105,3.41,3.97);
  });
}
// Hipped metal roofs carry their raised seams down the actual slopes, including the hips.
function psHip(at,L,W,eave,rise,metal,seamGap) {
  const a=L/2+.18,b=W/2+.18,d=Math.max(0,a-b*.93);
  const r=psRect(at,-a,a,-b,b),ridge=eave+rise;
  return {...obj(r,ridge,()=>{
    const faces=[[[ -a,-b],[a,-b],[d,0],[-d,0]],[ [a,-b],[a,b],[d,0] ],
      [[a,b],[-a,b],[-d,0],[d,0]],[[-a,b],[-a,-b],[-d,0]]];
    const roofZ=v=>eave+rise*Math.max(0,Math.min(1,(a-Math.abs(v[0]))/(a-d),(b-Math.abs(v[1]))/b));
    let svg='';
    faces.forEach((face,i)=>{
      const q=face.map(v=>at(...v,roofZ(v))),n=vNewell(q);
      if(!vis(n))return;
      svg+=shape(q,tone(n,soft(psTop(metal))),.46);
      if(UPX>=.68)return;
      const seam=SEASON.snow?'#a7aba7':'#48514e';
      if(i===0||i===2){
        const side=i===0?-1:1;
        for(let u=-a+.35;u<a;u+=seamGap){
          const v=side*b*Math.max(0,(Math.abs(u)-d)/(a-d));
          svg+=edge(at(u,side*b,eave+.025),at(u,v,roofZ([u,v])+.025),seam,.072);
        }
      }else{
        const end=i===1?1:-1;
        for(let v=-b+.4;v<b;v+=seamGap){
          const u=end*(d+Math.abs(v)/b*(a-d));
          svg+=edge(at(end*a,v,eave+.03),at(u,v,roofZ([u,v])+.03),seam,.07);
        }
      }
    });
    return svg+edge(at(-d,0,ridge+.04),at(d,0,ridge+.04),'#4e5653',.13);
  }),base:eave};
}
const psNorth=[-0.43545,0.90019];
function psStation(id,kind,door) {
  const b=findBuilding(id),{c,L,W}=b.obb,fp=psRing(id);
  const ax=kind==='lift'?[0.87223,0.48906]:psNorth,at=psFrame(c,ax);
  const front=door.map((v,i)=>v-c[i]),mag=Math.hypot(...front),dir=front.map(v=>v/mag);
  const granite=kind==='stone',lift=kind==='lift',h=granite?4.54:lift?4.43:3.19;
  const parts=[psSolid(fp,0,h,granite?'#b8aa99':'#a1b8b2',p=>{
    const {w,n,rect,line,disc,text}=p,entrance=dot(n,[...dir,0])>.89;
    if(granite){
      if(UPX<.60) {
        for(let x=.6;x<w-.48;x+=1.42)rect(x,.41,.026,2.04,'#a39685');
        for(let z=1.03;z<2.49;z+=.89)rect(.50,z,w-1.00,.032,'#a29484');
      }
      rect(0,.05,w,.26,'#92897c');rect(0,.32,w,.08,'#a19889');
      for(const x of [.17,w-.59]){rect(x,.42,.42,h-.76,'#c5b7a2');disc(x+.21,4.04,.12,'#ae9f8e')}
      rect(.53,2.50,w-1.06,.11,'#998978');rect(.55,3.77,w-1.1,.10,'#d2c4ad');
      const count=w>8?6:3,span=w-1.48,bay=span/count;
      for(let i=0;i<count;i++){
        const x=.74+i*bay+((count===6&&i%2===0)?.10:0),bw=bay-(i%2?.23:.12);
        rect(x-.045,2.65,bw+.09,1.05,'#776f60');rect(x,2.70,bw,.94,SEASON.night?'#ffe7a8':'#657873');
        if(UPX<.44){line([[x,2.71],[x+bw,3.63]],psIron,.043);line([[x,3.63],[x+bw,2.71]],psIron,.043);rect(x+bw/2-.026,2.70,.052,.94,psIron)}
      }
      if(entrance){
        const dw=w-1.28;rect(.64,0,dw,3.01,'#3d4640');
        for(let i=0;i<2;i++){const x=.72+dw*i/2;rect(x,.16,dw/2-.17,2.19,'#536461');rect(x+.08,.94,dw/2-.32,1.34,SEASON.night?'#ffe7a8':'#8ea6a0');rect(x+.08,.25,dw/2-.32,.56,'#515a55')}
        rect(.65,2.50,dw,.42,'#eee7d4');text(w/2,2.62,'PARK STREET',.27,'#383c36',dw-.25);
        rect(.72,2.51,dw*.47,.065,'#9d493d');rect(.72+dw*.47,2.51,dw*.47,.065,'#507953');
        for(const f of [.36,.64]){rect(w*f-.026,.83,.052,.38,'#d8d5bb');rect(w*f-.08,1.05,.16,.054,'#d8d5bb')}
      } else if(w>8){
        disc(w*.16,1.99,.158,'#758469');rect(w*.16-.14,2.00,.28,.095,'#b67049');
      }
      rect(0,4.12,w,.10,'#8e8172');rect(0,4.25,w,.17,'#d6c8ae');
      if(UPX<.5)for(let x=.1;x<w;x+=.22)rect(x,4.18,.08,.09,'#817565');
    }else{
      const base=lift?.45:.82,post=lift?.11:.16;
      rect(0,0,w,base,psStone);rect(0,base-.12,w,.12,psTrim);
      const bays=lift?2:Math.max(1,Math.round(w/1.78)),span=(w-.20)/bays;
      for(let i=0;i<bays;i++){
        const x=.1+i*span;
        rect(x,base,span-post,h-base-.2,SEASON.night?'#fbefc8':lift?'#a6c6c4':'#92ada4');
        if(UPX<.46) {
          if(lift){p.poly([[x+.04,base+.2],[x+.16,base+.2],[x+span*.8,h-.3],[x+span*.64,h-.3]],'#c5d9d1');}
          else {
            for(let u=x+.23;u<x+span-.12;u+=.23)rect(u,base,.026,h-base-.2,'#698a82');
            for(let z=base+.23;z<h-.2;z+=.23)rect(x,z,span-post,.025,'#d5dfc9');
          }
        }
        rect(x+span-post,base,post,h-base,psIron);
      }
      for(const x of [0,w-.11])rect(x,base,.11,h-base,psIron);
      rect(0,h-.21,w,.21,psIron);rect(0,lift?2.46:h-.53,w,.09,psIron);
      if(entrance){
        rect(.18,0,w-.36,2.30,'#424f4e');
        if(lift){rect(.34,.08,w-.68,2.07,'#879d9c');rect(w*.5-.025,.1,.05,2,'#454f4b');rect(.37,.93,w-.74,.08,'#b4c5ba')}
        else {for(let k=0;k<6;k++)rect(.29+k*.065,.15+k*.095,w-.58-.13*k,.025,'#a5a396')}
        rect(.16,2.4,w-.32,.42,'#eee8d9');text(w/2,2.56,lift?'ELEVATOR':'PARK STREET',.16,'#2a3432',w-.45);
        rect(.18,2.43,(w-.36)*.5,.07,'#a6453e');rect(w/2,2.43,(w-.36)*.5,.07,'#48735b');
      }
    }
  })];
  if(granite){
    parts.push(psSolid(psRect(at,-L/2-.11,L/2+.11,-W/2-.11,W/2+.11),h-.15,h,'#cabea8'));
  }
  parts.push(psHip(at,L,W,h,granite?.98:lift?.56:.46,granite?'#777c77':'#a0afa8',granite?.72:.62));
  const shaft=obj(hull(parts.flatMap(p=>p.fp)),Math.max(...parts.map(p=>p.h)),()=>parts.map(p=>p.draw()).join(''));
  return lift?psGroup([shaft,psSolid(psRing('w846047441'),2.65,2.82,psIron,null,'#91a49e')]):shaft;
}
function psClock(p) {
  const x=p.w/2,z=27.55,r=1.48;
  p.disc(x,z,r+.20,'#dfcfaa');p.disc(x,z,r,'#383936');
  for(let j=0;j<12;j++){const a=j*Math.PI/6;p.line([[x+r*.78*Math.cos(a),z+r*.78*Math.sin(a)],[x+r*.95*Math.cos(a),z+r*.95*Math.sin(a)]],'#e9dfbf',.09)}
  p.line([[x-.48,z+.55],[x,z],[x+.83,z+.66]],'#f2e5c1',.12);
}
function psChurch(){
  // Split the mass at the back of the tower, retaining the two shoulders that
  // flank its base. Each volume has an independent footprint in planOrder.
  const at=psFrame([-10.75,11.67],[0.97976,0.19987]),rear=-30.85,join=-4.48,end=2.13,B=11.64,T=5.4;
  const parts=[];
  const sash=p=>{
    const count=Math.max(1,Math.round(p.w/4.9));
    for(let i=0;i<count;i++){const x=(i+.5)*p.w/count;psSash(p,x,1.45,1.5,3.8);psSash(p,x,8.50,2.13,7.0,true,'#818f83')}
    p.rect(0,16.62,p.w,.42,psCream);p.rect(0,0,p.w,.65,'#ad9d88');
  };
  const main=psRect(at,rear,join,-B,B),center=at((rear+join)/2,0);
  const roof=roofOver({c:center,ax:[0.97976,0.19987],L:join-rear,W:2*B},17.1,{roof:'gabled',rise:6.3,wall:psBrick,roofTex:'slate',roofColour:'#6e726b',eaves:.24});
  const nave=psSolid(main,0,17.1,psBrick,sash);
  parts.push(obj(main,23.4,()=>nave.draw()+roof()));
  for(const side of [-1,1]){
    const ys=[side*T,side*B].sort((a,b)=>a-b),r=psRect(at,join,end,ys[0],ys[1]);
    const shoulder=psSolid(r,0,16.95,psBrick,sash);
    const inner=side*T,outer=side*B;
    const plane=[at(join,outer,17.0),at(end,outer,17.0),at(end,inner,20.48),at(join,inner,20.48)];
    parts.push(obj(r,20.48,()=>shoulder.draw()+shape([at(end,outer,16.95),at(end,inner,16.95),at(end,inner,20.48)],psBrick,.4)+shape(plane,psTop('#70736c'),.51)));
  }
  const base=psRing('w240706876'),baseC=findBuilding('w240706876').obb.c;
  const stages=[psSolid(base,0,31.30,psBrick,p=>{
    const x=p.w/2,front=dot(p.n,[0.97976,0.19987,0])>.8;
    if(front){for(const k of [-.26,0,.26]){psArch(p,x+k*p.w,.1,2.15,3.75,psCream);psArch(p,x+k*p.w,.15,1.77,3.52,'#56483b')}}
    psSash(p,x,11.0,2.21,7.7,true);psSash(p,x,20.1,1.65,3.33,true);psClock(p);p.rect(0,30.7,p.w,.40,psCream);
  })];
  stages.push(psSolid(psScale(base,baseC,1.085),31.30,31.93,psCream));
  for(const [x,y] of psScale(base,baseC,.90)){
    const post=rect(x,y,.32,.32);
    stages.push(obj(post,33.08,()=>stick([x,y,31.90],[x,y,32.70],.12,psCream)+peak(post,32.70,[x,y,33.08],psCream)));
  }
  for(const [id,z0,z1] of [['w240706869',31.93,40.0],['w240706878',40,46],['w240706868',46,51.65]]){
    const r=psRing(id),c=findBuilding(id).obb.c;
    stages.push(psSolid(r,z0,z1-.25,'#e6dfcb',p=>{
      if(p.w<1.55)return;
      const x=p.w/2,h=z1-z0,w=p.w*.59;
      psArch(p,x,z0+.46,w,h-.96,'#c6c0ad');
      psArch(p,x,z0+.58,w*.80,h-1.38,'#636e65');
      if(UPX<.65)for(let z=z0+.8;z<z1-.99;z+=.24)p.rect(x-w*.35,z,w*.7,.082,'#abb0a1');
      for(const u of [.06,p.w-.36])p.rect(u,z0+.18,.30,h-.54,psCream);
      p.rect(0,z1-.54,p.w,.24,psCream);
    }));
    stages.push(psSolid(psScale(r,c,1.10),z1-.25,z1,psCream));
  }
  const neck=psRing('w240706877'),tip=[-10.73,11.69];
  stages.push(psSolid(neck,51.65,52.10,psCream));
  stages.push(obj(neck,66.14,()=>peak(neck,52.10,[...tip,64.85],psTop('#e7e2d3'))+
    stick([...tip,64.65],[...tip,66.14],.072,'#756645')+edge([tip[0]-.65,tip[1],65.77],[tip[0]+.74,tip[1],65.77],'#776849',.11)));
  parts.push(psGroup(stages));
  return psGroup(parts);
}

function psColumn(c,r,z0,z1,col,ionic=false) {
  const disk=polygon(...c,r,12),low=polygon(...c,r*.79,12),up=polygon(...c,r*.68,12);
  return obj(disk,z1,()=>{
    const tint=n=>tone(n,soft(col));
    let s=loft(atZ(disk,z0),atZ(disk,z0+.17),tint)+shape(atZ(disk,z0+.17),col,.25)+
      loft(atZ(low,z0+.17),atZ(up,z1-.32),tint)+loft(atZ(up,z1-.32),atZ(disk,z1-.17),tint)+
      loft(atZ(disk,z1-.17),atZ(disk,z1),tint)+shape(atZ(disk,z1),col,.25);
    if(ionic&&UPX<.38)for(let j=0;j<14;j++){
      const a=2*Math.PI*j/14,dx=Math.cos(a),dy=Math.sin(a);
      if(vis([dx,dy,0]))s+=edge([c[0]+r*.79*dx,c[1]+r*.79*dy,z0+.34],[c[0]+r*.68*dx,c[1]+r*.68*dy,z1-.43],'#a79883',.038);
    }
    if(ionic)for(const side of [-1,1])s+=ball([c[0]-side*.476*r*.72,c[1]+side*.88*r*.72,z1-.26],r*.27,soft('#c5b69c'),.24);
    return s;
  });
}
function psCathedral(){
  const b=findBuilding('w178198643'),{c,ax,L,W}=b.obb,at=psFrame(c,ax),A=L/2,B=W/2;
  const wall=psRect(at,-A+5.50,A,-B+.13,B-.13);
  const body=psSolid(wall,0,12.52,'#b8b3a4',p=>{
    if(dot(p.n,[-ax[0],-ax[1],0])>.9){
      p.rect(.48,1.0,p.w-.96,8.22,'#536b67');
      for(let x=1.1;x<p.w-.6;x+=1.65)p.rect(x,1.0,.13,8.22,psTrim);
      for(let z=3.7;z<8.5;z+=2.25)p.rect(.48,z,p.w-.96,.12,psTrim);
    }else{
      for(let i=0,n=Math.max(2,Math.round(p.w/5.4));i<n;i++)psSash(p,(i+.5)*p.w/n,4.8,1.67,4.12,true,'#7e9590',psTrim);
    }
  });
  const ped=psRect(at,-A,-A+5.53,-B,B);
  const porch=[psSolid(ped,0,.62,psStone)];
  for(let i=0;i<6;i++)porch.push(psColumn(at(-A+.91,(-B+1.30)+i*(W-2.6)/5),.83,.62,10.84,'#bcac96',true));
  const ent=psSolid(ped,10.84,12.55,'#d3c9b8',p=>{
    p.rect(0,10.97,p.w,.15,psStone);p.rect(0,12.06,p.w,.21,psCream);
    if(dot(p.n,[-ax[0],-ax[1],0])>.9)p.text(p.w/2,11.38,'CHURCH OF ST PAUL',.37,'#797972',p.w*.65,true);
  });
  const full=psRect(at,-A,A,-B,B),height=15.9;
  const roof=roofOver({c,ax,L,W},12.55,{roof:'gabled',rise:height-12.55,roofColour:'#737974',roofTex:'slate',wall:'#d1c7af',eaves:.16});
  const front=at.bind(null,-A-.20);
  const crown=obj(full,height,()=>{
    let s=roof();
    if(vis([-ax[0],-ax[1],0])){
      s+=shape([front(-B+.63,12.80),front(B-.63,12.80),front(0,15.50)],'#376e90',.38);
      // Lipski's chambered shell is a cutaway, with curving septa radiating from the coil.
      const curve=t=>{const r=.135*Math.exp(.205*t);return [-1.10+r*Math.cos(t-.7),13.58+.64*r*Math.sin(t-.7)]};
      const outline=Array.from({length:82},(_,i)=>front(...curve(i*.171)));
      s+='<path d="'+pd(outline,false)+'" fill="none" stroke="#ecdca9" style="stroke-width:.17"/>';
      for(let t=5.35;t<13.86;t+=.61){
        const outer=curve(t),inner=curve(t-2*Math.PI);
        s+=edge(front(...outer),front(...psMix(outer,inner,.8)),'#eee1b8',.09);
      }
      s+=edge(front(-B+.17,12.62),front(0,15.72),psCream,.15)+edge(front(0,15.72),front(B-.17,12.62),psCream,.15);
    }
    return s;
  });
  // Draw the roof after the distinct portico and nave have sorted.
  const base=psGroup([body,psGroup([...porch,ent])]);
  return obj(full,height,()=>base.draw()+crown.draw());
}
function psStearns(){
  const b=findBuilding('w29605125'),r=psRing(b.id),{c,ax}=b.obb;
  const shell=psSolid(r,0,40.3,'#d0bfaa',p=>{
    const cols=Math.max(3,Math.round(p.w/4.55)),bw=p.w/cols,base=5.72;
    p.rect(0,0,p.w,base,'#b19e89');p.rect(0,base,p.w,.52,'#e4d7bc');
    for(let i=0;i<cols;i++){
      const x=(i+.5)*bw;
      p.rect(x-bw*.40,.31,bw*.80,4.7,'#586c65');
      for(let j=0;j<8;j++){
        const z=6.52+j*3.92,h=j===7?3.0:2.80;
        psSash(p,x,z,bw*.73,h,j===7,'#83918a','#e3d4b8');
        p.rect(x-.058,z,.116,h,'#b6ad9a');
      }
      if(UPX<.48)for(let j=0;j<5;j++)p.rect(i*bw+.15+j*(bw-.3)/5,39.04,.19,.37,'#9c8d7b');
    }
    for(const z of [6.12,10.29,32.93,37.39,39.59])p.rect(0,z,p.w,.22,'#eadac1');
    if(dot(p.n,[-ax[0],-ax[1],0])>.88){
      for(const [k,name] of [[.25,"LAMBERT’S"],[.75,'MOOYAH']]){p.rect(k*p.w-p.w*.22,3.55,p.w*.44,.85,'#435249');p.text(k*p.w,3.78,name,.47,'#eee5d1',p.w*.41)}
    }
  });
  const lip=psSolid(psScale(r,c,1.018),40.3,41,'#c6b69e',null,'#8f8981');
  const at=psFrame(c,ax),can=psRect(at,-27.9,-26.78,-4.1,4.1);
  return psGroup([shell,lip,psSolid(can,4.96,5.34,'#6b7267',p=>{if(p.w>5)p.text(p.w/2,5.04,'STEARNS COMPANY',.18,psCream,p.w-.58,true)})]);
}
function psSargent(){
  const b=findBuilding('w29553164'),r=psRing(b.id),{c}=b.obb,west=[-0.88520,-0.46329,0];
  const body=psSolid(r,0,24.25,'#d8cfbb',p=>{
    const front=dot(p.n,west)>.52,bays=Math.max(1,Math.round(p.w/(front?3.30:3.90))),w=p.w/bays;
    for(let i=0;i<bays;i++){
      const x=(i+.5)*w;
      if(front){
        p.rect(x-w*.37,.25,w*.74,7.66,'#536762');p.rect(x-w*.32,3.8,w*.64,.12,'#c0bcaa');
      }else {p.rect(x-w*.34,.68,w*.68,8.9,'#758883');p.rect(x-w*.34,4.55,w*.68,.40,psTrim)}
      for(let j=0;j<4;j++)psSash(p,x,9.0+3.49*j,w*.64,2.28,false,'#728684','#e3daca');
    }
    p.rect(0,8.25,p.w,.61,'#c1b8a7');p.rect(0,23.55,p.w,.55,'#e3dac8');
  });
  const top=psScale(r,c,.938),glass=psSolid(top,24.25,32.35,'#81928d',p=>{
    const n=Math.max(1,Math.round(p.w/2.27)),bay=p.w/n;
    for(let i=0;i<n;i++){p.rect(i*bay,24.25,.16,8.05,'#b6b5a7');p.rect(i*bay+.17,25.05,bay-.23,2.61,'#677d7b')}
    for(const z of [27.87,31.60])p.rect(0,z,p.w,.26,'#c9c5b7');
  });
  const roof=psSolid(psScale(r,c,.99),32.35,33,'#b9b8ac',null,'#989992');
  return psGroup([body,glass,roof]);
}
function psOrpheum(){
  const r=psRing('w29650688'),fac=psFrame([68.82,51.42],[0.45336,-0.89130]);
  const front=[-0.89130,-0.45336,0];
  const body=psSolid(r,0,23.84,'#9e6953',p=>{
    const show=dot(p.n,front)>.98&&p.w>19&&p.w<30;
    if(!show){
      if(p.w>5){p.rect(0,17.9,p.w,.31,'#b58669');p.rect(0,23.31,p.w,.37,'#b3957c')}
      return;
    }
    // Only the southern half faces the blind end of Hamilton Place. The
    // northern half shares a wall with Sargent Hall.
    const width=13.17,x=width/2;
    p.rect(0,0,width,23.68,'#d6cbb8');
    psArch(p,x,4.20,width*.74,13.25,'#ae9c83');psArch(p,x,4.62,width*.65,12.38,'#ede2ce');
    psArch(p,x,5.00,width*.55,11.35,'#b5b0a0');
    p.rect(x-3.35,7.05,6.70,4.85,'#dcd2bc');
    for(let j=0;j<9;j++){
      const a=j*Math.PI/8;
      p.line([[x+1.32*Math.cos(a),12.10+1.32*Math.sin(a)],[x+3.30*Math.cos(a),12.10+3.30*Math.sin(a)]],'#e7dbc5',.18);
    }
    p.disc(x,12.10,1.1,'#cfbfa8');p.disc(x,12.10,.76,'#e9deca');
    for(const u of [.62,width-1.43]){p.rect(u,1.0,.81,1.84,'#413f37');p.rect(u+.075,1.10,.66,1.61,'#ab7965');p.rect(u+.12,1.31,.57,.47,'#e0ccae')}
    for(let k=0;k<5;k++)p.rect(x-width*.34+k*width*.14,.32,width*.125,4.18,'#41524b');
    for(const f of [.07,.20,.80,.93]){p.rect(f*width-.28,4.3,.56,14.10,'#efe2cb');p.rect(f*width-.43,17.96,.86,.45,'#b3a58f')}
    p.rect(0,18.52,width,.46,'#b5a38c');p.rect(0,19.04,width,.34,'#f1e6d0');
    for(let u=.44;u<width;u+=.66)p.rect(u,19.46,.20,1.20,'#ab9c87');
    p.rect(0,21.02,width,.28,'#f0e2ce');
  },'#8f867b');
  const canopy=psRect(fac,-4.49,4.49,-2.75,-.06);
  return psGroup([body,psSolid(canopy,4.54,5.86,'#4a5147',p=>{
    p.rect(0,4.62,p.w,.13,'#c1a373');p.rect(0,5.57,p.w,.14,'#d8bc8a');
    if(p.w>5){
      p.rect(.18,4.86,p.w-.36,.61,'#efe7d3');p.text(p.w/2,4.97,'ORPHEUM THEATRE',.47,'#343b36',p.w*.90);
      if(UPX<.45)for(let u=.28;u<p.w;u+=.34)p.disc(u,5.70,.042,'#f4dfac');
    }
  })]);
}

// The city's 1840 gateway straddles the surveyed path leading through the Tremont fence.
const psGatePoint=[-38.72,79.41],psGateAxis=[-0.42550,0.90499],psGateAt=psFrame(psGatePoint,psGateAxis);
function psTaper(lower,upper,z0,z1,col){
  return {...obj(lower,z1,()=>loft(atZ(lower,z0),atZ(upper,z1),n=>tone(n,soft(col)))+shape(atZ(upper,z1),psTop(col),.38)),base:z0};
}
function psGate(){
  const at=psGateAt,parts=[];
  for(const side of [-1,1]){
    const k=side*2.09,base=psRect(at,k-.73,k+.73,-.86,.86),up=psRect(at,k-.55,k+.55,-.64,.64);
    parts.push(psSolid(base,0,.44,'#9f9889'),psTaper(base,up,.44,3.95,'#b1aa95'));
    for(const y of [-.69,.69]){const c=at(k,y);parts.push(psColumn(c,.37,.41,3.67,'#bfb69f'))}
  }
  const piers=psGroup(parts);
  const lintel=psSolid(psRect(at,-2.83,2.83,-.85,.85),3.90,4.32,'#b5ad97',p=>{
    if(p.w<4)return;
    const x=p.w/2;
    for(const side of [-1,1])p.poly([[x,4.13],[x+side*.42,4.27],[x+side*1.53,4.25],[x+side*.83,4.05]],'#8e8975');
    p.disc(x,4.15,.14,'#8d8063');
  });
  const cornice=psTaper(psRect(at,-2.8,2.8,-.83,.83),psRect(at,-3.00,3.00,-1.00,1.00),4.32,4.68,'#bdb59f');
  return obj(cornice.fp,4.68,()=>piers.draw()+lintel.draw()+cornice.draw());
}
function psFence(a,b) {
  const len=Math.hypot(b[0]-a[0],b[1]-a[1]),u=[(b[0]-a[0])/len,(b[1]-a[1])/len],at=psFrame(a,u);
  const r=psRect(at,0,len,-.23,.23),plinth=psSolid(r,0,.57,'#a9a08f',null,'#c9bdab');
  return obj(r,2.48,()=>{
    let s=plinth.draw();
    for(const z of [.78,1.84])s+=edge(at(0,0,z),at(len,0,z),psIron,.095);
    const n=Math.ceil(len/.38);
    for(let i=0;i<=n;i++){
      const x=i*len/n,h=i%8===0?2.38:2.12;
      s+=edge(at(x,0,.55),at(x,0,h),psIron,i%8===0?.11:.060);
      if(UPX<.4)s+=shape([at(x-.083,0,h-.11),at(x,0,h+.13),at(x+.083,0,h-.11)],psIron,0);
    }
    return s;
  });
}
function psStones(){
  const lawn=SCENE.lawns.find(v=>v.kind==='cemetery').r,groups=[];
  // Individual uninscribed markers are illustrative. The paths and the obelisk
  // have survey positions. Leave the walks and their borders open.
  for(let x=-116;x< -16;x+=10)for(let y=16;y<116;y+=10){
    const stones=[];
    for(let i=0;i<6;i++){
      const k=hash(x+'|'+y+'|'+i),px=x+(i%2)*4.10+rnd(k)*1.75,py=y+Math.floor(i/2)*2.96+rnd(k+9)*.75;
      if(!inRings([px,py],[lawn])||inRings([px,py],SCENE.paths.concat(SCENE.walk))||Math.hypot(px-(-74.37),py-(55.46))<3||!standable(px,py,.4))continue;
      stones.push([px,py,.44+rnd(k+3)*.78,.50+rnd(k+7)*.41,k%3]);
    }
    if(!stones.length)continue;
    for(const [x,y,h,w,k] of stones){
      const angle=1.91+.36*Math.sin(x*.051)+.17*Math.sin(y*.42);
      const at=psFrame([x,y],[Math.cos(angle),Math.sin(angle)]),col=['#7f7d70','#999185','#ada798'][k];
      const crown=[[0,0],[w,0],[w,h*.76],[w*.84,h*.79],[w*.72,h*.95],[w*.54,h],[w*.34,h*.96],[w*.2,h*.80],[0,h*.76]];
      const face=(v,dx)=>crown.map(([u,z])=>at(u-w/2+dx,v,z));
      const fp=psRect(at,-w/2,w/2,-.12,.12);
      groups.push(obj(fp,h,()=>{
      const front=vis([Math.sin(angle),-Math.cos(angle),0]);
      let s=shape(face(front?.12:-.12,.04),'#666a61',.25)+shape(face(front?-.12:.12,0),col,.30);
      if(UPX<.36)s+=edge(at(-w*.23,front?-.125:.125,h*.62),at(w*.23,front?-.125:.125,h*.62),'#777767',.04);
      return s;
      }));
    }
  }
  const cen=[-74.37,55.46],at=psFrame(cen,psGateAxis),square=r=>psRect(at,-r,r,-r,r);
  groups.push(psGroup([psSolid(square(1.58),0,.47,psStone),psSolid(square(1.18),.47,1.35,'#c3baaa'),psTaper(square(.81),square(.44),1.35,6.88,'#cfc6b4'),obj(square(.44),7.62,()=>peak(square(.44),6.88,[...cen,7.62],psTrim))]));
  const a=[-13.81,25.86],b=[-52.33,108.43];
  for(const [p,q] of [[a,psGateAt(-3.02,0)],[psGateAt(3.02,0),b]]){
    const n=Math.ceil(Math.hypot(q[0]-p[0],q[1]-p[1])/9);
    for(let i=0;i<n;i++)groups.push(psFence(psMix(p,q,i/n),psMix(p,q,(i+1)/n)));
  }
  return [psGate(),...groups];
}

// The ground basin retains its separate mapped water polygon for collision checks.
function psFountain(){
  const water=SCENE.water[0][0],c=[-1.95,-101.27],rim=psScale(ccw(water),c,1.16),inner=psScale(rim,c,.91);
  const bronze='#65776a',metal='#758473',high='#94977c';
  const band=(r,z)=>atZ(polygon(...c,r,24),z);
  const layer=(r1,z1,r2,z2,col)=>loft(band(r1,z1),band(r2,z2),n=>tone(n,soft(col)))+shape(band(r2,z2),col,.23);
  return obj(rim,6.72,()=>{
    let s=loft(atZ(rim,0),atZ(rim,.40),n=>tone(n,soft(psStone)))+shape(atZ(rim,.4),psTop(psTrim),.39)+
      shape(atZ(inner,.415),SEASON.snow?'#e4e4d9':'#8dafaa',.27);
    s+=layer(1.89,.43,1.74,.73,bronze)+layer(1.38,.72,.88,2.80,metal);
    // The four reclining figures turn outward from the socle. No inscriptions or portraits.
    const figures=[];
    for(let i=0;i<4;i++){
      const ang=.33+i*Math.PI/2,u=[Math.cos(ang),Math.sin(ang)],at=psFrame(c,u);
      figures.push({fp:rect(...at(1.43,0),.8,.8),z1:2.56,svg:
        stick(at(.93,-.21,1.39),at(1.47,-.13,1.83),.34,bronze)+
        stick(at(1.42,-.13,1.75),at(1.31,-.11,2.10),.26,metal)+
        ball(at(1.27,-.09,2.32),.20,soft(high),.24)+
        stick(at(1.16,0,1.39),at(1.70,.38,1.20),.23,bronze)+
        stick(at(1.70,.38,1.20),at(1.87,.82,.84),.15,bronze)+
        stick(at(1.35,-.28,1.94),at(1.66,-.45,1.50),.13,high)});
    }
    s+=planOrder(figures)+layer(.69,2.67,.62,3.09,bronze)+layer(.63,3.07,2.62,3.61,metal)+layer(2.62,3.61,2.67,3.77,high);
    s+=shape(band(2.53,3.79),SEASON.snow?psCream:'#94b6aa',.25);
    s+=layer(.52,3.80,.38,4.94,bronze);
    for(let i=0;i<4;i++){const a=i*Math.PI*.5;s+=ball([c[0]+.42*Math.cos(a),c[1]+.42*Math.sin(a),4.59],.15,soft(high),.18)}
    s+=layer(.39,4.93,1.40,5.39,metal)+layer(1.40,5.39,1.43,5.52,high)+layer(.27,5.54,.36,6.07,bronze)+layer(.36,6.07,.13,6.46,high)+ball([...c,6.55],.13,soft(metal),.22);
    if(!SEASON.snow&&UPX<.46)for(const [r,z,bottom] of [[2.62,3.71,.49],[1.42,5.48,3.83]]){
      for(let i=0;i<14;i++){const a=i*Math.PI/7,dx=Math.cos(a),dy=Math.sin(a);if(dx*CAM_V[0]+dy*CAM_V[1]<-.18)continue;
        s+=edge([c[0]+r*dx,c[1]+r*dy,z],[c[0]+(r+.21)*dx,c[1]+(r+.21)*dy,bottom],'#bfdbcf',.045)}
    }
    return s;
  });
}
// The walking relation includes monuments as well as streets. Only its six
// through-going footways contribute pavement. Splitting at the slab edge
// leaves out its long excursion to the State House, outside this view.
const psTrail=[[[10.38,-120.0],[-55.7,-104.75],[-120.0,-88.77]],[[-120.0,-43.34],[-8.53,-18.82],[-0.97,-16.91],[-5.16,0.56],[-4.01,3.66],[-3.74,6.06],[-4.31,11.58],[-5.65,15.12],[-39.16,84.12],[-55.39,120.0]]];
const psKitGround=paintGroundInk;
paintGroundInk=function(g) {
  psKitGround(g);
  g.save();g.transform(...Dv(1,0,0),...Dv(0,1,0),...P(0,0,0));
  g.lineJoin='round';g.lineCap='butt';
  for(const points of psTrail){
    g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));
    g.lineWidth=.51;g.strokeStyle=nightCol(SEASON.snow?'#cdb6a7':'#994e40');g.stroke();
    if(UPX<.37){
      g.lineWidth=.039;g.strokeStyle=nightCol(SEASON.snow?'#e2d2c4':'#d09976');g.stroke();
      g.beginPath();
      for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy);
        for(let u=.25;u<d;u+=.31){const x=a[0]+dx*u/d,y=a[1]+dy*u/d;g.moveTo(x-.25*dy/d,y+.25*dx/d);g.lineTo(x+.25*dy/d,y-.25*dx/d)}}
      g.lineWidth=.022;g.stroke();
    }
  }
  g.restore();
};
const LANDMARKS=[
  {name:'Common granite exit',ids:['w24677664'],build:()=>psStation('w24677664','stone',[-8.92,-44.01])},
  {name:'Common granite entrance',ids:['w24677688'],build:()=>[psStation('w24677688','stone',[10.07,-35.0]),psTSign(12.36,-32.9,[.90,.435])]},
  {name:'Common glass elevator',ids:['w846047438','w846047441'],build:()=>psStation('w846047438','lift',[-0.66,-63.64])},
  {name:'Tremont street glass-block stairs',ids:['w818470230','w818470232'],build:()=>[
    psStation('w818470230','glass',[16.89,-5.29]),psStation('w818470232','glass',[18.68,-8.47]),psTSign(18.78,-7.31,[.91,.415])]},
  {name:'Park Street Church',ids:['w240317867'],build:psChurch},
  {name:'Granary gate, slate markers and Franklin obelisk',ids:[],build:psStones},
  {name:'Brewer Fountain',ids:[],build:psFountain},
  {name:'Cathedral Church of St Paul',ids:['w178198643'],build:psCathedral},
  {name:'David J. Sargent Hall',ids:['w29553164'],build:psSargent},
  {name:'R. H. Stearns Building',ids:['w29605125'],build:psStearns},
  {name:'Hamilton Place Orpheum Theatre',ids:['w29650688'],build:psOrpheum}
];
function psVisitor(x,y,i,d,guide=false){
  const who={...pedDressed(372+i),p:[x,y],d,walked:0};
  return obj(rect(x,y,.68,.65),2.12,()=>{
    let s=pedestrian(who,0).svg;
    if(guide){
      const at=psFrame([x,y],d),cloak=polygon(x,y,.33,7);
      s+=loft(atZ(cloak,.48),atZ(psScale(cloak,[x,y],.67),1.45),n=>tone(n,soft('#424348')))+shape(atZ(psScale(cloak,[x,y],.67),1.45),'#424348',.22);
      const f=at(.30,.29,1.08);
      s+=stick(at(.04,.18,1.37),at(.30,.29,1.32),.072,'#45413c')+edge(at(.30,.29,1.34),at(.30,.29,1.12),'#655b49',.05)+
        shape(atZ(polygon(f[0],f[1],.17,6),.99),'#5c5545',.24)+ball(f,.18,{l:'#fff3c4',m:'#ffe7a8',d:'#ffd98a'},.23)+shape(atZ(polygon(f[0],f[1],.17,6),1.22),'#534b40',.24);
    }
    return s;
  });
}
function psPiano(x,y) {
  const at=psFrame([x,y],[.861,.508]),foot=psRect(at,-2.45,2.45,-2.15,2.15);
  const piano=ccw([at(-.76,-.66),at(.76,-.66),at(.76,-.1),at(.60,.29),at(.45,.40),at(.39,.90),at(.16,1.17),at(-.47,1.22),at(-.73,1.03)]);
  const body=psSolid(piano,.68,1.01,'#383e3a',null,'#464943');
  return obj(foot,3.42,()=>{
    let s='';
    for(const [u,v]of [[-.56,-.52],[.56,-.48],[-.2,.92]])s+=stick(at(u,v,.02),at(u,v,.72),.065,'#383b36');
    s+=body.draw()+shape([at(-.65,-.85,.75),at(.65,-.85,.75),at(.65,-.56,.75),at(-.65,-.56,.75)],psCream,.29);
    for(let k=0;k<24;k++)if(k%7!==2&&k%7!==6){const u=-.62+k*.052;s+=edge(at(u,-.58,.77),at(u,-.75,.77),'#333a37',.027)}
    s+=shape(atZ(psRect(at,-.34,.34,-1.32,-1.06),.48),'#56554c',.24);
    const seated=at(0,-1.21);s+=stick([...seated,.55],at(.03,-1.15,1.14),.15,'#687f89')+ball(at(.03,-1.13,1.34),.15,soft('#ae8368'),.24)+stick(at(.03,-1.15,1.07),at(.30,-.74,.83),.065,'#ae8368');
    for(const u of [-2.08,2.08])for(const v of [-1.79,1.79])s+=stick(at(u,v,0),at(u,v,2.56),.029,'#9b9887');
    const e=psRect(at,-2.24,2.24,-1.96,1.96);
    return s+peak(e,2.55,[x,y,3.42],'#dfb759')+loft(atZ(e,2.38),atZ(e,2.56),n=>tone(n,soft('#dbb759')));
  });
}
// The dated kiosk photograph records a wheeled souvenir cart under a red and
// green parasol. Its small rectangular hanging wares are suggested at close zoom.
function psVendor(c){
  const at=psFrame(c,psNorth),r=psRect(at,-1.48,1.48,-1.00,1.00);
  const counter=psSolid(psRect(at,-1.02,1.02,-.42,.42),.40,.99,'#a3865e',p=>{
    if(p.w<1.2)return;
    for(let j=0;j<7;j++)p.rect(.12+j*.25,.48,.16,.41,['#ca9a65','#848d76','#a76b56','#d2bf94'][j%4]);
  });
  return obj(r,2.94,()=>{
    let s=counter.draw();
    for(const u of [-.79,.79])for(const v of [-.45,.45])s+=ball(at(u,v,.29),.20,soft('#4c4c40'),.26);
    for(const u of [-.94,.94])s+=stick(at(u,0,.92),at(u,0,2.19),.037,'#686859');
    s+=stick(at(-1.09,0,2.10),at(1.09,0,2.10),.03,'#736b56');
    for(let j=0;j<9;j++){const u=-.93+j*.218,h=.22+rnd(j+10)*.38;
      s+=shape([at(u,.03,2.04),at(u+.16,.03,2.04),at(u+.15,.03,2.04-h),at(u-.035,.03,2.03-h)],['#d8c6a8','#907c6b','#b38268','#9f9b82'][j%4],.23)}
    s+=stick(at(0,0,.97),at(0,0,2.86),.034,'#c9bda2');
    const ring=polygon(...c,1.57,8,.15);
    for(let i=0;i<8;i++){const a=ring[i],b=ring[(i+1)%8],face=[[...a,2.31],[...b,2.31],[...c,2.91]],n=vNewell(face);
      if(vis(n))s+=shape(face,tone(n,soft(i<4?'#aa5c4e':'#467366')),.35)}
    return s;
  });
}
function psTable(x,y,umbrella) {
  const at=psFrame([x,y],[.95,.3122]),green='#426e63',r=polygon(x,y,1.32,8,.28);
  return obj(r,umbrella?2.55:1.05,()=>{
    let s=stick(at(0,0,.06),at(0,0,.76),.051,green)+shape(atZ(polygon(x,y,.49,14),.77),'#6f9a89',.35);
    for(const side of [-1,1]){
      const u=side*.79;
      s+=shape([at(u-.17,-.19,.43),at(u+.17,-.19,.43),at(u+.17,.18,.43),at(u-.17,.18,.43)],green,.22);
      for(const v of [-.17,.17])s+=edge(at(u-side*.14,v,.03),at(u+side*.21,v,.88),green,.045);
      for(const z of [.62,.76])s+=edge(at(u+side*.20,-.19,z),at(u+side*.20,.19,z),green,.075);
    }
    if(umbrella)s+=stick(at(0,0,.77),at(0,0,2.48),.035,'#b4a486')+peak(r,2.08,[x,y,2.55],'#c8b87f');
    return s;
  });
}
let psEventId,psProps=[];
function CITY_EXTRA(t){
  if(psEventId!==SEASON.id){
    psEventId=SEASON.id;psProps=[];
    if(!SEASON.snow&&!SEASON.night){
      const vendor=[8.51,-42.2];
      if(standable(...vendor))psProps.push(psVendor(vendor));
      for(const [x,y,umbrella] of [[-9.76,-99.72,1],[-7.22,-94.09,0],[3.8,-95.48,1],[5.59,-104.46,0],[-1.06,-108.73,0],[-6.46,-108.58,0]]){
        if(standable(x,y)&&inRings([x,y],SCENE.walk)&&Math.hypot(x-(-8.6),y-(-106.91))>3.1)psProps.push(psTable(x,y,umbrella&&!SEASON.wet));
      }
    }
    if(SEASON.id==='piano'){
      const c=[-8.6,-106.91];
      if(standable(...c))psProps.push(psPiano(...c));
      for(let i=0;i<14;i++){
        const a=-1.07+i*.19,r=3.5+(i%3)*1.18,x=c[0]+r*Math.cos(a),y=c[1]+r*Math.sin(a);
        if(standable(x,y)&&!inRings([x,y],SCENE.roads))psProps.push(psVisitor(x,y,i,[-Math.cos(a),-Math.sin(a)]));
      }
    }
    if(SEASON.id==='lantern'){
      const c=[-10.3,-19.47];
      for(let i=0;i<12;i++){
        const x=c[0]-(i?1.4+(i%4)*.96:0),y=c[1]+(i?(Math.floor(i/4)-1)*.93+rnd(i+3)*.35:0);
        if(standable(x,y)&&!inRings([x,y],SCENE.roads))psProps.push(psVisitor(x,y,i,i?[.98,.19]:[-.98,-.19],!i));
      }
    }
  }
  return psProps.map((p,i)=>({...p,draw:()=>stamp('park-event-'+i,p.draw,p.fp,0,p.h+.2)}));
}
