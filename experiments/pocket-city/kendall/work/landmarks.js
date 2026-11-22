// Kendall Square in plot metres, x along Main, y towards the Marriott.
// Prep closes each member of a relation separately. Join the two divided kiosk
// outlines at their shared surveyed endpoints before geometry and routes are read.
const northStair = [[40.57,-31.75],[44.10,-31.77],[44.14,-25.46],[40.63,-25.44]];
const elevator = [[40.69,-45.68],[44.00,-45.70],[44.05,-40.58],[40.74,-40.56]];
const southEntry = 'w1307837143', roofId = 'r20779868';
const outboundId = 'w1524505563', liftId = 'w1524505564';
SCENE.buildings.find(b=>b.id==='r20779869').ring=elevator;
SCENE.buildings.find(b=>b.id==='r20779871.0').ring=northStair;
SCENE.buildings=SCENE.buildings.filter(b=>b.id!=='r20779871.1');

// No vehicle trip goes through the occupied hotel addition on Dock Street.
// The two curbside cycle paths are the mapped eastbound and westbound
// directions. Leave Broadway's through route on the street instead of the
// straight chord across the hotel drawn by the generic route generator.
// These short illustrative passenger trips terminate at the surveyed thresholds.
const approaches=[
  [[28.2,-20.8],[33.2,-22.4],[40,-23],[42.35,-25.02]],
  [[33.75,-57.1],[36.85,-62.2],[38.3,-71.1],[39.0,-73.4]],
  [[46.05,.76],[40.9,3.2],[34.75,4.72],[30.26,7.44]],
  [[31.7,7.40],[36.4,4.6],[41.6,3.55],[46.1,1.32]]
];
for(const p of approaches)SCENE.routes.push({kind:'ped',name:'Kendall/MIT',p});
const atGrade=SCENE.buildings.filter(b=>b.kind!=='roof'&&!b.min);
SCENE.routes=SCENE.routes.filter(route=>route.p.every((a,i,pts)=>{
  if(!i)return true;
  const b=pts[i-1],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.65);
  for(let j=0;j<=n;j++){
    const p=[a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n];
    if(atGrade.some(building=>inside(p,building.ring)))return false;
  }
  return true;
}));

// Custom elevations use the kit's canvas face projection. Floor bands, fins
// and small lettering can share one face instead of hundreds of tiny objects.
const kendallFaces=[];
const kitElevation=paintSingaporeElevation;
paintSingaporeElevation=function(g,id){
  if(id>=0)return kitElevation(g,id);
  const face=kendallFaces[-id-1],{a,b,lo,hi,len,n,paint}=face;
  const u=[(a[0]-b[0])/len,(a[1]-b[1])/len,0],h=hi-lo;
  const tint=c=>SEASON.night&&LIT.has(c)?c:nightCol(dot(n,SUN)>.14?c:mix(c,'#867e91',.15));
  g.save();g.transform(...Dv(...u),...Dv(0,0,-1),...P(...b,hi));
  g.beginPath();g.rect(0,0,len,h);g.clip();
  const box=(x,z,w,d,c)=>{g.fillStyle=tint(c);g.fillRect(x,h-z-d,w,d)};
  const poly=(xy,c)=>{g.fillStyle=tint(c);g.beginPath();xy.forEach(([x,z],i)=>i?g.lineTo(x,h-z):g.moveTo(x,h-z));g.closePath();g.fill()};
  const text=(str,x,z,width,size,c,weight=600)=>{
    g.save();g.translate(x,h-z);g.scale(size/32,size/32);g.fillStyle=tint(c);
    g.textAlign='center';g.textBaseline='middle';g.font=weight+' 32px Helvetica, Arial, sans-serif';
    wallText(g,str,0,0,width*32/size);g.restore();
  };
  paint({g,box,poly,text,l:len,h,n,lo,tint});
  g.restore();
};
const mapped=id=>ccw(findBuilding(id).ring);
const mid=(a,b,k=.5)=>a.map((v,i)=>v+(b[i]-v)*k);
function shell(ring,lo,hi,body,cap,paint,roofAt){
  const fp=ccw(ring),faces=fp.map((a,i)=>{
    const b=fp[(i+1)%fp.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=[(b[1]-a[1])/len,(a[0]-b[0])/len,0];
    const id=paint?-kendallFaces.push({a,b,lo,hi,len,n,paint}):0;
    return {a,b,n,id};
  });
  return {fp,z0:lo,z1:hi,draw:()=>{
    const facesInk=faces.filter(f=>vis(f.n)).sort((p,q)=>depthOf([...p.a,0])-depthOf([...q.a,0])).map(({a,b,n,id})=>
      {
        const top=p=>roofAt?roofAt(p):[...p,hi];
        const polygon=[[...a,lo],[...b,lo],top(b),top(a)];
        const layers=shape(polygon,tone(n,soft(body)),.53);
        const detail=id?'<elevation id="'+id+'"/>':'';
        return layers+(roofAt&&id?clipTo(polygon,detail):detail);
      }).join('');
    return facesInk+shape(roofAt?fp.map(roofAt):atZ(fp,hi),SEASON.snow?'#eeeae1':cap,.57);
  }};
}
function ordered(parts){
  return planOrder(parts.map(p=>({fp:p.fp,z0:p.z0||0,z1:p.z1,svg:p.draw()})));
}
function assembly(parts){
  return obj(hull(parts.flatMap(p=>p.fp)),Math.max(...parts.map(p=>p.z1)),()=>ordered(parts));
}
function railLine(a,b,z,height=1.08,colour='#616768',spacing=1.35){
  const n=Math.max(1,Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])/spacing));
  let s=edge([...a,z+height],[...b,z+height],colour,.10)+edge([...a,z+.25],[...b,z+.25],colour,.055);
  for(let i=0;i<=n;i++){
    const p=mid(a,b,i/n);s+=edge([...p,z],[...p,z+height],colour,.064);
  }
  return s;
}
function parapet(r,z,col,w){
  return r.map((p,i)=>edge([...p,z],[...r[(i+1)%r.length],z],col,w)).join('');
}
function roundel(x,y,z,ux,uy,onPole=true,r=.69){
  const fp=rect(x,y,r*2+.2,r*2+.2);
  return {fp,z0:typeof onPole==='number'?onPole:onPole?0:z-r,z1:z+r,draw:()=>{
    let s=onPole?stick([x,y,typeof onPole==='number'?onPole:0],[x,y,z],.10,'#555e60'):'';
    const sign=(off,k)=>Array.from({length:30},(_,i)=>{
      const a=i*Math.PI/15;return [x+ux*r*k*Math.cos(a)+uy*off,y+uy*r*k*Math.cos(a)-ux*off,z+r*k*Math.sin(a)];
    });
    const off=vis([uy,-ux,0])?.085:-.085;
    s+=shape(sign(-off,1.04),'#46494c',.4)+shape(sign(off,1),'#fcfaf0',.55);
    const p=(u,v)=>[x+ux*u+uy*off,y+uy*u-ux*off,z+v];
    return s+shape([p(-r*.64,r*.45),p(r*.64,r*.45),p(r*.64,r*.18),p(r*.16,r*.18),p(r*.16,-r*.51),p(-r*.16,-r*.51),p(-r*.16,r*.18),p(-r*.64,r*.18)],'#21292c',0);
  }};
}
function glassBars({box,l,h},spacing,glass='#85a3aa'){
  box(0,0,l,h,glass);
  for(let i=0;i<l-.01;i+=spacing){
    box(i,.05,.085,h-.1,'#687b7d');
    if(UPX<.45)box(i+.10,.05,.085,h-.1,'#c4d6d2');
  }
}
function redBoard(face,z,direction){
  const {box,text,l}=face;
  box(.02,z-.17,l-.04,.75,'#d7d8cd');box(.05,z+.08,l-.1,.5,'#b73335');
  text('KENDALL / MIT',l/2,z+.32,l*.93,.38,'#fff8e0',700);
  box(.15,z-.17,l-.3,.23,'#30383a');text(direction,l/2,z-.05,l-.35,.17,'#fff8e0');
}
function portal(ring,front,lift=false){
  const r=ccw(ring),lo=.14,hi=lift?5.10:3.55;
  const ys=r.map(p=>p[1]),xmin=Math.min(...r.map(p=>p[0])),xmax=Math.max(...r.map(p=>p[0]));
  const minY=Math.min(...ys),maxY=Math.max(...ys);
  const topAt=([x,y])=>{
    const depth=front>0?(maxY-y)/(maxY-minY):(y-minY)/(maxY-minY);
    return [x+((xmin+xmax)/2-x)*.085,y+front*.12,hi-(lift?.12:.90)*depth];
  };
  const body=shell(r,lo,hi,'#758c90','#a9b9b8',f=>{
    const {l,h,n,box,poly,text}=f;
    const isDoor=lift?n[0]>.72:n[1]*front>.72;
    if(isDoor && !lift){
      // The folded stainless portal frames an open flight. Parallel nosings
      // narrow into its dark lower landing. The two handrails follow the flight.
      box(0,0,l,h,'#343f43');
      poly([[.26,.08],[l-.26,.08],[l*.72,1.23],[l*.31,1.23]],'#78858a');
      for(let i=0;i<7;i++){
        const k=i/7,u=.28+k*l*.21,v=.06+k*1.12;
        box(u,v,l-2*u,.06,'#b2b8b2');
      }
      for(const u of [.16,.51,.86])poly([[l*u,.19],[l*u+.07,.22],[l*(.20+u*.61)+.06,1.67],[l*(.20+u*.61),1.65]],'#e5e3d4');
      poly([[0,0],[.23,0],[.38,h-.34],[0,h]],'#d5d8d1');
      poly([[l-.22,0],[l,0],[l,h],[l-.38,h-.34]],'#ccd0ca');
      redBoard(f,h-.73,'RED LINE  ·  ASHMONT / BRAINTREE');
    }else if(lift){
      glassBars(f,1.08,SEASON.night?'#8b9b91':'#718f99');
      for(const z of [.22,2.45,4.65])box(0,z,l,.12,'#48575b');
      if(isDoor){box(l*.18,.08,l*.64,2.18,'#aab6b4');box(l*.5,.08,.055,2.1,'#586b70');text('ELEVATOR',l*.5,2.67,l*.68,.26,'#f4eee1')}
      else poly([[0,.3],[.17,.32],[l-.2,h-.27],[l-.02,h-.26],[l-.02,h-.4],[.18,.12]],'#bcc7c3');
    }else{
      glassBars(f,1.65,SEASON.night?'#879a99':'#94b0b4');
      const sign=n[0]*front>0;
      poly(sign?[[0,.3],[l,2.47],[l,2.06],[0,.08]]:[[0,2.47],[l,.3],[l,.08],[0,2.06]],'#58686c');
      box(0,0,l,.26,'#596266');box(0,h-.27,l,.27,'#c9cfc9');
      for(let u=.12;u<l;u+=2.17)box(u,.25,.12,h-.42,'#c6cdca');
    }
  },topAt);
  return body;
}
function scanLine(r,y){
  const xs=[];
  r.forEach((a,i)=>{const b=r[(i+1)%r.length];if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]))});
  return xs.sort((a,b)=>a-b);
}
function inboundGateway(){
  const r=mapped(roofId),top=8.06,ceiling=7.68;
  const kiosks=[portal(northStair,1),portal(elevator,0,true),portal(mapped(southEntry),-1)];
  // The tips taper in opposite directions. A longitudinal crown pitches to the
  // two perimeter gutters. The crosswise joints follow the reflected ceiling plan.
  const ys=[...new Set(r.map(p=>p[1]).concat(Array.from({length:22},(_,i)=>-70+i*2.1)))].sort((a,b)=>a-b);
  const rows=ys.map(y=>{const yy=Math.min(-24.061,Math.max(-71.145,y)),xs=scanLine(r,yy);return xs.length>1?[[xs[0],yy],[xs[xs.length-1],yy]]:null}).filter(Boolean);
  const posts=[];
  for(let i=0;i<12;i++){
    const y=-69.8+i*3.97,[left,right]=scanLine(r,y),w=right-left;
    for(const t of [i%3===1?.29:.07,i%3===2?.72:.94]){
      const x=left+w*t;
      // A column which coincides with a pavilion is mounted by its glazed edge.
      const xx=kiosks.some(k=>inside([x,y],k.fp))?(t<.5?left-.08:right+.08):x;
      posts.push({fp:rect(xx,y,.17,.17),z1:ceiling,draw:()=>stick([xx,y,0],[xx,y,ceiling],.095,'#bdc6c2')});
    }
  }
  const canopy=()=>{
    let s=shape(atZ(r,ceiling),'#a7b5b4',.42);
    for(let i=1;i<rows.length;i++){
      const [a,b]=rows[i-1],[c,d]=rows[i],am=mid(a,b),cm=mid(c,d),ar=top+.07*(b[0]-a[0]),cr=top+.07*(d[0]-c[0]);
      const col=SEASON.snow?'#eeeae2':'#bbc2bd',other=SEASON.snow?'#f7f3e9':'#cdd2cb';
      s+=shape([[...a,top],[...am,ar],[...cm,cr],[...c,top]],col,0)+shape([[...am,ar],[...b,top],[...d,top],[...cm,cr]],other,0);
    }
    for(let i=0;i<r.length;i++){
      const a=r[i],b=r[(i+1)%r.length],n=norm([b[1]-a[1],a[0]-b[0],0]);
      if(vis(n))s+=shape([...atZ([a,b],ceiling),...atZ([b,a],top)],tone(n,soft('#9da9ad')),.35);
    }
    for(let y=-68;y<-25;y+=2.12){
      const [a,b]=scanLine(r,y),m=(a+b)/2,z=top+.07*(b-a);
      s+=edge([a,y,top],[m,y,z],SEASON.snow?'#deded5':'#abb5b2',.045)+edge([m,y,z],[b,y,top],SEASON.snow?'#deded5':'#b4bdb9',.045);
      if(SEASON.night)s+=edge([a,y,ceiling+.04],[a+.04,y,ceiling+.29],'#fff3c4',.13)+edge([b,y,ceiling+.04],[b-.04,y,ceiling+.29],'#fff3c4',.13);
    }
    if(SEASON.night){
      // The illuminated soffit is visible along each projecting lip.
      for(let i=0;i<r.length;i++){
        const a=r[i],b=r[(i+1)%r.length],n=[b[1]-a[1],a[0]-b[0],0];
        if(vis(n))s+=edge([...a,ceiling+.026],[...b,ceiling+.026],'#fff8e0',.075);
      }
    }
    return s+parapet(r,top,'#8d9a9d',.085);
  };
  const inner=kiosks.concat(posts);
  // Long eaves can sit in front of the feet of far columns only at a very low
  // view; the roof belongs above all three pavilions.
  return [obj(hull([...r,...northStair,...elevator]),8.85,()=>ordered(inner)+canopy()),
    assembly([roundel(45.8,-22.9,3.45,1,0)]),assembly([roundel(41.2,-65.5,3.45,1,0)])];
}

function roofPatio(){
  const roof=mapped(outboundId),cx=29.1,cy=18.0;
  const wall=roof.map(p=>[cx+(p[0]-cx)*.86,cy+(p[1]-cy)*.89]);
  const street=shell(wall,.04,3.68,'#80989b','#bfbdb0',f=>{
    const {box,poly,l,h,n}=f;glassBars(f,1.5,SEASON.night?'#d7be88':'#8fa5a5');
    box(0,0,l,.18,'#677278');box(0,h-.24,l,.24,'#647072');
    for(let i=0;i<l;i+=1.5)poly([[i+.16,1.05],[i+.32,1.05],[Math.min(i+1.23,l),2.89],[Math.min(i+1.02,l),2.89]],'#b3c7c2');
    if(n[1]<-.75||n[0]>.9){
      const opening=Math.min(4.4,l*.48),x=(l-opening)/2;
      box(x,.03,opening,2.62,'#394549');box(x+.14,.05,opening*.45,2.4,'#667c81');
      box(x+opening*.49,0,.13,2.65,'#b2bab6');box(x,2.62,opening,.55,'#bc3535');
      f.text('KENDALL / MIT',l/2,2.92,opening-.16,.32,'#fff8e0');
      f.text('RED LINE  ·  ALEWIFE',l/2,2.51,opening-.2,.21,'#fff8e0');
    }
  });
  const slab=shell(roof,3.65,4.88,'#bfac8b','#c8b897',({box,l,h})=>{
    box(0,0,l,.18,'#555956');box(0,h-.11,l,.11,'#e1d5bc');
    for(let z=.26;z<h-.12;z+=.12)box(0,z,l,.032,'#ae9f85');
    for(let x=2.8;x<l;x+=3.1)box(x,.19,.04,h-.26,'#938875');
  });
  const cab=mapped(liftId).map(p=>[25.1+(p[0]-25.1)*.63,12.6+(p[1]-12.6)*.62]);
  const upper=shell(cab,4.89,8.18,'#78939a','#a3aba7',f=>{
    glassBars(f,1.38,'#7c969d');f.box(0,.34,f.l,.13,'#46565c');f.box(0,f.h-.23,f.l,.19,'#4f5f63');
    if(f.n[1]>.8){f.box(f.l*.2,.08,f.l*.60,2.22,'#bbc1b6');f.box(f.l*.50,.08,.045,2.22,'#677474')}
  });
  const columns=[[22.1,8.42],[35.91,8.64],[35.7,17],[35.66,24.37],[22,26.98]].map(([x,y])=>shell(rect(x,y,.55,.62),0,3.66,'#535b5d','#797e78'));
  const front=roof.map((p,i)=>[p,roof[(i+1)%roof.length]]);
  const deck=()=>{
    let s=slab.draw();
    for(let y=8.6;y<27.9;y+=.52){
      const xs=scanLine(roof,y);
      if(xs.length>=2)s+=edge([xs[0]+.1,y,4.89],[xs[xs.length-1]-.1,y,4.89],SEASON.snow?'#deddd5':'#b9a886',.038);
    }
    const rails=front.filter(([a,b])=>Math.max(a[0],b[0])>22.2).map(([a,b])=>({fp:[a,b,mid(b,[cx,cy],.02)],z0:4.89,z1:6.0,draw:()=>railLine(a,b,4.9,1.04,'#626765',.97)}));
    const beds=[[34.8,14,.95,10],[29.25,24,5.2,1.02]].map(([x,y,w,d])=>shell(rect(x,y,w,d),4.91,5.35,'#897c69','#81935b'));
    const plants=beds.map(b=>{return {fp:b.fp,z0:5.35,z1:5.8,draw:()=>{
      let g='';for(let i=0;i<9;i++){const t=(i+.5)/9,pt=mid(b.fp[0],b.fp[2],t);g+=ball([pt[0],pt[1],5.51],.29,soft(SEASON.snow?'#d5d9c4':i%2?'#739354':'#879e59'))}return g;
    }}});
    const seats=[[31.12,18.71],[31.12,21.35],[26.6,22.5]].map(([x,y])=>({
      fp:rect(x,y,1.88,.62),z0:4.89,z1:5.7,draw:()=>{
        let ink=shape(atZ(rect(x,y,1.88,.62),5.34),'#a58664',.32);
        for(const dx of [-.72,.72])ink+=stick([x+dx,y,4.9],[x+dx,y,5.33],.055,'#606663');
        return ink+shape([[x-.94,y+.27,5.40],[x+.94,y+.27,5.40],[x+.94,y+.32,5.7],[x-.94,y+.32,5.7]],'#a88d6c',.35);
      }
    }));
    return s+ordered([...rails,...beds,...plants,...seats,upper,roundel(24.5,8.12,7.9,1,0,4.9,.76),roundel(21.81,11.55,7.9,0,1,4.9,.76)]);
  };
  const deckPart={fp:roof,z0:3.65,z1:8.7,draw:deck};
  // The exterior stair goes up from Main, then turns onto the porch.
  const steps=rect(19.6,15.28,3.15,13.25);
  const stair={fp:steps,z1:6.0,draw:()=>{
    const [a,b,c,d]=steps;let s=shape([[...a,.14],[...b,.14],[...c,4.89],[...d,4.89]],'#a39883',.55);
    for(const [p,q] of [[b,c],[a,d]])s+=shape([[...p,.08],[...q,.08],[...q,4.89],[...p,.14]],'#9f9689',.42);
    for(let i=0;i<=28;i++){
      const k=i/28,z=.14+4.75*k,p=mid(a,d,k),q=mid(b,c,k);
      s+=edge([...p,z],[...q,z],'#dcd4c4',.09);
      if(i%4===0)for(const pt of [p,q])s+=edge([...pt,z],[...pt,z+1.04],'#666b67',.065);
    }
    for(const [p,q] of [[a,d],[b,c]])s+=edge([...p,1.18],[...q,5.93],'#595f5e',.10);
    return s;
  }};
  const bridge=shell(rect(17.26,23.0,9.28,3.15),4.45,4.89,'#827a68','#c5b394');
  const bench=(x,y)=>({fp:rect(x,y,3,.55),z1:1.01,draw:()=>shape(atZ(rect(x,y,3,.55),.48),'#a88664',.45)+shape([[x-1.5,y+.23,.52],[x+1.5,y+.23,.52],[x+1.5,y+.28,.97],[x-1.5,y+.28,.97]],'#a2886d',.35)});
  const main={fp:roof,z1:8.78,draw:()=>ordered([street,...columns,bench(33.41,8.81)])+deckPart.draw()};
  // The street hall is entirely below the deck; an exterior pier stands proud
  // of its walls but can never occlude the rooftop floor or elevator.
  const bridgeInk=bridge.draw;
  bridge.draw=()=>bridgeInk()+railLine(bridge.fp[2],bridge.fp[3],4.89,1.04,'#696b62',.8);
  bridge.z1=5.93;
  return assembly([main,stair,bridge]);
}

// The elevations of 314 Main change their rhythm vertically. Long fins run
// through several floors, with horizontal reveals at the changes of material.
function museumGlass(mode){
  return f=>{
    const {box,poly,text,h,l,n,lo}=f;
    const podium=mode==='plinth',reveal=mode==='reveal';
    const step=podium?1.58:2.02,count=Math.max(1,Math.round(l/step)),bay=l/count;
    const floors=podium?3:reveal?1:13,floor=h/floors;
    const panes=['#91acb3','#9eb9bf','#7898a4','#a7bec0','#88a8b1'];
    for(let i=0;i<count;i++){
      const x=i*bay;
      for(let j=0;j<floors;j++){
        const seed=(i*7+j*5+Math.round(l))%17;
        const lit=SEASON.night && (podium&&j===0||seed<3);
        box(x,j*floor,bay+.03,floor+.01,lit?(seed%2?'#ffe7a8':'#fbefc8'):panes[(Math.floor(i/3)+Math.floor(j/3)+Math.round(l))%panes.length]);
        if(!lit&&seed===4)poly([[x,j*floor+.12],[x+bay*.21,j*floor+.12],[x+bay*.78,(j+1)*floor-.2],[x+bay*.57,(j+1)*floor-.2]],'#c2d0ce');
        box(x,j*floor,bay,.15,'#76888c');
      }
      const fin=(colour,z,d,width)=>{box(x,z,width,d,colour);box(x+width,z,.09,d,'#664e46')};
      if(podium){
        box(x,0,.10,h,'#56696c');fin(i%3===1?'#bb8066':'#aa6957',floor,2*floor,.53);
      }else if(reveal)box(x+.05,0,.12,h,'#627075');
      else{
        box(x,0,.10,h,'#697e85');
        for(let j=0;j<3;j++){
          const a=[0,4,8,13],colour=j===2?'#a88c78':i%3===0?'#bc8166':'#a76b56';
          fin(colour,a[j]*floor,(a[j+1]-a[j])*floor-.22,j===2?.16:j===1?.32:.47);
        }
      }
    }
    if(podium){
      box(0,floor-.26,l,.26,'#534d48');box(0,0,l,.20,'#686d68');
      if(n[0]>.84||n[1]>.84){
        const museum=n[0]>.8,center=l*(museum?.69:.47),w=museum?8.1:6.5;
        // Books and objects on display sit behind the divided shop windows.
        for(let pos=2.1,j=0;pos<l-1.5;pos+=3.18,j++){
          if(Math.abs(pos-center)<w*.65)continue;
          if(museum){
            box(pos-.64,.24,1.28,.83,'#cfc6b2');
            poly([[pos-.42,1.07],[pos+.39,1.07],[pos+.12,2.06]],j%2?'#9e765c':'#718f97');
          }else{
            box(pos-.99,.49,1.98,.17,'#aa987d');
            for(let k=0;k<7;k++)box(pos-.87+k*.24,.68,.16,.57+(j+k)%3*.10,['#a9a483','#ae755f','#ded1b3'][k%3]);
          }
        }
        box(center-w*.48,.12,w*.96,3.1,'#627a7a');
        box(center-.09,.12,.18,2.95,'#ced4c9');
        box(center-w*.5,3.20,w,.73,'#494e4b');
        text(museum?'MIT Museum':'MIT Press Bookstore',center,3.59,w-.24,museum?.57:.48,'#fff8e0');
      }
    }else if(reveal)box(0,0,l,.36,'#524e47');
    else{
      for(const j of [0,4,8])box(0,j*floor,l,.35,'#566168');
      // Fritted rooftop screen closes over the mechanical floor.
      for(let z=h-4.3;z<h-.25;z+=.36)box(0,z,l,.075,'#bec6bf');
    }
  };
}
function museum(){
  const base=mapped('w1254628670'),waist=mapped('w1254628671'),top=mapped('w823968937');
  const plinth=shell(base,0,16.5,'#aa806d','#c9c8bc',museumGlass('plinth'));
  const terrace=plinth.draw;plinth.draw=()=>terrace()+base.map((p,i)=>railLine(p,base[(i+1)%base.length],16.5,.92,'#a5b3b1',2.7)).join('');
  const middle=shell(waist,16.5,21,'#82989b','#b9bcb1',museumGlass('reveal'));
  const tower=shell(top,21,85.4,'#a7b6b9','#deded4',museumGlass('tower'));
  const roof=tower.draw;
  tower.draw=()=>{
    let s=roof()+parapet(top,85.4,'#bcc1b7',.33);
    const inset=top.map(p=>mid(p,[-1,-49],.075));s+=parapet(inset,85.42,'#b8b8ae',.14);
    for(const x of [-12,-3,6]){s+=shape(atZ(rect(x,-52,6.4,9.1),85.45),SEASON.snow?'#e3e2d8':'#afb6b4',.45);for(let y=-55.7;y<-47.9;y+=.92)s+=edge([x-2.65,y,85.46],[x+2.65,y,85.46],'#858f90',.15)}
    return s;
  };
  return assembly([plinth,middle,tower]);
}

function firehouse(){
  const perimeter=findBuilding('w29620676').ring;
  const rear=[perimeter[0],perimeter[1],perimeter[2],perimeter[15]];
  const old=perimeter.slice(3,15);
  const facade=f=>{
    const {box,poly,text,h,l,n}=f;
    box(0,0,l,h,'#ab6552');
    for(let y=.24;UPX<.28&&y<h;y+=.29)box(0,y,l,.024,'#bc8470');
    box(0,0,l,.55,'#a39b88');box(0,4.40,l,.23,'#c4ad8c');box(0,h-.39,l,.39,'#ba9f80');
    const front=n[1]>.88&&l>8,count=Math.max(1,Math.round(l/(front?4:2.65))),bay=l/count;
    for(let i=0;i<count;i++){
      const x=(i+.5)*bay,w=bay*(front?.75:.54),left=x-w/2;
      for(const z of [1.05,5.18]){
        const shoulder=front&&z<2?2.12:1.57,rr=Math.min(w*.5,.76);
        const arch=(d,c)=>{
          const pts=[[left-d,z],[x+w/2+d,z]];
          for(let k=0;k<=12;k++)pts.push([x+(w/2+d)*Math.cos(k*Math.PI/12),z+shoulder+(rr+d)*Math.sin(k*Math.PI/12)]);
          poly(pts,c);
        };
        arch(.16,'#c8a78a');arch(0,SEASON.night?'#ffe7a8':'#5d7779');
        box(x-.055,z,.11,shoulder+rr,'#6e665a');box(left,z+shoulder-.09,w,.10,'#ddd0aa');
      }
    }
    if(front){box(.28,3.77,l-.56,.91,'#605348');text('The KENDALL',l*.5,4.24,l*.81,.72,'#f8e4af',700)}
  };
  const body=shell(old,0,8.35,'#b06e57','#ac9d88',facade);
  const roof=roofOver({c:[-53.14,-31.52],ax:[0,1],L:17.3,W:12.5},8.35,{roof:'hipped',rise:3.72,eaves:.08,roofColour:'#727b79',roofTex:'slate'});
  const bodyInk=body.draw;body.draw=()=>bodyInk()+roof();body.z1=12.07;
  const rearBody=shell(rear,0,22.75,'#af7661','#aca59b',({box,l,h})=>{
    for(let j=0;j<6;j++)for(let i=1;i<l-1;i+=2.85){
      box(i,1.1+j*3.54,1.4,1.8,'#cbaa8d');box(i+.11,1.22+j*3.54,1.18,1.55,SEASON.night&&Math.round(i+j)%4===0?'#ffe7a8':'#687e84');
    }
    box(0,h-.5,l,.5,'#bba68c');
  });
  const rearRoof=roofOver({c:[-49.56,-49.63],ax:[1,0],L:28.6,W:18.25},22.75,{roof:'hipped',rise:3.75,roofColour:'#6d7778',roofTex:'slate',eaves:.14});
  const rearInk=rearBody.draw;rearBody.draw=()=>rearInk()+rearRoof();rearBody.z1=26.5;
  function cupola(x,y,z,w,h){
    const ring=rect(x,y,w,w);
    const shaft=shell(ring,z,z+h,'#bdada0','#d2c2a9',({box,l,h})=>{
      box(.18*l,.14*h,.64*l,.68*h,'#6e6e60');
      for(let j=0;j<5;j++)box(.18*l,.17*h+j*h*.125,.64*l,.07,'#c9bca6');
      box(0,h-.18,l,.18,'#dacbb0');
    });
    const shellInk=shaft.draw;
    shaft.draw=()=>shellInk()+peak(rect(x,y,w*1.15,w*1.15),z+h,[x,y,z+h+w*.68],'#6a7c77')+
      stick([x,y,z+h+w*.65],[x,y,z+h+w*.68+.43],.045,'#5d655e');
    shaft.z1+=w*.68+.46;return shaft;
  }
  const wings=[body,rearBody,cupola(-51.8,-32.0,11.1,2.7,2.50),cupola(-53.0,-38.1,10.65,1.42,1.25)];
  for(const [x,y] of [[-56.1,-26.2],[-50.4,-26.2]]){
    const dorm=shell(rect(x,y,1.7,1.68),9.26,10.52,'#a58871','#858782',({box,l})=>{box(l*.18,.08,l*.64,.93,'#66797c')});
    const base=dorm.draw;dorm.draw=()=>base()+peak(dorm.fp,10.52,[x,y,11.19],'#6f7674');dorm.z1=11.19;wings.push(dorm);
  }
  return assembly(wings);
}
function googleBuilding(){
  const r=mapped('w823968943'),c=[-16,24];
  const section=(k,dx)=>r.map(p=>[c[0]+(p[0]-c[0])*k+dx,c[1]+(p[1]-c[1])*k]);
  function curtain(f){
    const {box,l,h,lo,n,text}=f;
    const floors=Math.max(1,Math.round(h/4.1)),rh=h/floors;
    for(let j=0;j<floors;j++){
      for(let i=0;i<l;i+=2.25){
        const gap=(Math.round(i/2.25)+j*2)%9;
        const col=SEASON.night&&gap===3?'#ffe7a8':['#688993','#819f9f','#728c90','#8ca7a8'][Math.floor(i/11+j/4)%4];
        box(i,j*rh,2.25,rh,col);box(i,j*rh,.099,rh,'#516b70');
      }
      box(0,j*rh+.12,l,.29,'#63767b');
    }
    box(0,h-.25,l,.25,'#c5c1ac');
    if(lo===0&&n[1]<-.8&&l>20){box(l*.37,0,l*.22,4.6,'#6c655a');text('325 MAIN',l*.48,4.0,l*.17,.69,'#eae1ce')}
  }
  const segments=[[section(.93,-.18),0,9.1],[section(1,0),9.1,31.0],[section(.94,.7),31.0,35.1],[section(.99,.18),35.1,58.1],[section(.94,.8),58.1,62.25],[section(.98,0),62.25,81.7]];
  return assembly(segments.map(([fp,z,top])=>shell(fp,z,top,'#859ba0','#cdcec3',curtain)));
}
function marriott(){
  // Difference of the surveyed podium and its western garage/office parts.
  const base=[[56.87,41.99],[56.94,37.06],[52.76,37],[52.68,41.96],[40.36,41.78],
    [40.43,36.99],[36.37,36.93],[36.31,41.62],[11.68,43.2],[-41.73,42.92],[-41.93,82.89],
    [-22.05,83.32],[-22.28,95.09],[-1.92,95.37],[-1.85,90.22],[7.56,90.35],[7.62,85.1],
    [17.28,85.24],[17.39,76.9],[45.1,77.3],[77.29,62.08],[77.38,44.55],[77.17,42.32]];
  const tower=mapped('w824367467');
  const ground=shell(base,0,9.70,'#bda88f','#c1b9aa',({box,l,h,n,text})=>{
    for(let x=.65;x<l-.65;x+=2.7){box(x,.49,Math.min(2.48,l-x-.2),6.3,'#77959a');box(x,3.25,2.38,.12,'#c6bfa7')}
    box(0,h-.72,l,.72,'#baa68d');
    if(n[1]<-.88&&l>20){box(l*.34,5.3,l*.32,1.06,'#716862');text('Marriott',l*.50,5.85,l*.26,.89,'#f0e6cb')}
  });
  const rooms=shell(tower,9.7,83,'#ad7868','#beb8af',({box,l,h,n,text})=>{
    const count=Math.max(1,Math.round(l/3.4)),bay=l/count,storey=h/24;
    for(let i=0;i<count;i++){
      if(l<1.6)continue;
      const x=(i+.5)*bay,w=Math.min(1.56,bay*.55);
      if(i%3===1)box(x-w*.67,.6,w*1.34,h-3.6,'#935f55');
      for(let j=0;j<23;j++){
        box(x-w/2,j*storey+.72,w,1.56,SEASON.night&&(i+3*j)%7<2?'#ffe7a8':'#789399');
        box(x-w/2,j*storey+.72,w,.12,'#dac4aa');
      }
    }
    box(0,h-.38,l,.38,'#c4ac9c');
    if(n[1]<-.85&&l>30)text('Marriott',l*.5,h-1.6,l*.27,2.3,'#fff8e0');
  });
  // The outline also wraps two independently mapped, lower garage wings.
  // Keep those ground footprints out of the podium's paint order by using
  // the actual remaining podium polygon. All three levels have closed roofs.
  return [assembly([ground,rooms])];
}
function graduateTower(){
  const fp=mapped('w823968925');
  const body=shell(fp,12.5,102.1,'#ad9e85','#dcd8c9',({box,l,h})=>{
    const rows=27,rh=h/rows,count=Math.max(1,Math.round(l/3.15)),bw=l/count;
    for(let j=0;j<rows;j++)for(let i=0;i<count;i++){
      const k=(i+j%2),x=i*bw,y=j*rh;
      const colors=j>17?['#d5cbaf','#c5bfae','#c1b295']:j>8?['#baa78d','#ad9984','#c0b29a']:['#9d8c7f','#ab927e','#a99f94'];
      box(x,y,bw,rh,colors[k%3]);const wx=x+bw*(j%2?.03:.37);box(wx,y+.25,bw*.57,rh*.78,SEASON.night&&(i+j*3)%8===0?'#ffe7a8':'#627c85');
      box(wx+bw*.28,y+.25,.066,rh*.78,'#a3a49a');box(wx,y+rh*.54,bw*.57,.075,'#8f9da0');
      box(x,y,bw,.10,'#e0d8bf');
    }
    box(0,h-.37,l,.37,'#d9d4c3');
  });
  return assembly([body]);
}
function welcomeCenter(){
  const existing=mapped('w132601295');
  return assembly([shell(existing,0,25,'#c7c5b7','#cfcec4',({box,l,h,n,text})=>{
    const count=Math.max(1,Math.round(l/5.65)),bw=l/count,rh=h/6;
    for(let i=0;i<count;i++)for(let j=0;j<6;j++){
      const x=i*bw+.48,y=j*rh+.47,w=bw-.92,height=rh-1.01;
      box(x,y,w,height,SEASON.night&&(i+2*j)%5<2?'#ffe7a8':'#657e83');
      for(let k=1;k<4;k++)box(x+k*w/4,y,.075,height,'#3f5154');
      box(x,y+height*.56,w,.09,'#46585c');
    }
    if(n[0]<-.82 && l>15){box(l*.24,3.05,l*.52,.83,'#475151');text('MIT Welcome Center',l*.50,3.47,l*.48,.57,'#fff8e0')}
  })]);
}

// Pave the two different outdoor rooms using their actual boundaries. Keep
// the planted lawn and its mapped trees clear of the north plaza's buff slabs.
const stationPaving=[
  {ring:[[29.0,-24.15],[47.75,-24.02],[47.75,-52.7],[48.60,-74.43],[29.10,-74.40]],step:.67,base:'#d8d8cf',joint:'#b6b8b4',accent:'#bcc0be',north:false},
  {ring:[[18.92,3.86],[73.35,4.28],[73.70,41.91],[36.35,41.53],[15.85,35.2],[18.92,20.72]],step:1.58,base:'#ddcfb0',joint:'#bcac90',accent:'#bdac8d',north:true}
];
const mainAxis=[[-123,-11.11],[-85,-10.52],[-39.35,-9.72],[52.08,-9.97],[123,-11.34]];
const basePavement=paintSingaporeGround;
paintSingaporeGround=function(g){
  basePavement(g);
  g.save();g.transform(...Dv(1,0,0),...Dv(0,1,0),...P(0,0,.014));
  const lay=(x,y,w,h,c)=>{g.fillStyle=nightCol(c);g.fillRect(x,y,w,h)};
  const subpath=r=>{r.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath()};
  if(!SEASON.snow)for(const {ring,step,base,joint,accent,north} of stationPaving){
    g.save();g.beginPath();subpath(ring);
    // Clip the garden out after clipping to the perimeter so an outside
    // garden cannot become an additional painted island in the even-odd path.
    g.clip();g.beginPath();subpath(ring);
    if(north)subpath(SCENE.lawns[8].r[0]);g.clip('evenodd');
    const [left,right]=north?[15,74]:[28,49],[bottom,top]=north?[3,42]:[-75,-23];
    lay(left,bottom,right-left,top-bottom,base);
    for(let j=0,y=bottom;y<top;y+=step,j++){
      lay(left,y,right-left,.035,joint);
      const w=north?2.65:step*3.2;
      for(let x=left-(j%2)*w/2,i=0;x<right;x+=w,i++){
        lay(x,y,.038,step,joint);
        if((j*7+i*3)%13===0)lay(x+.04,y+.04,w-.07,step-.07,accent);
      }
      if(north&&j%5===0)lay(left,y,right-left,.17,accent);
    }
    g.restore();
  }
  const stroke=(points,col,width)=>{g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.lineWidth=width;g.strokeStyle=nightCol(col);g.stroke()};
  for(const side of [-1,1]){
    const along=off=>mainAxis.map(([x,y])=>[x,y+side*off]);
    stroke(along(8.04),SEASON.snow?'#e7e5dd':'#ebe6d8',.17);
    stroke(along(7.42),SEASON.snow?'#dfded8':'#e8e3d6',.12);
    for(const x of [-99,-60,-12,64,98]){
      const i=mainAxis.findIndex(([xx])=>xx>=x),a=mainAxis[i-1],b=mainAxis[i],y=mid(a,b,(x-a[0])/(b[0]-a[0]))[1]+side*9.30;
      g.save();g.translate(x,y);g.scale(-side,side);
      if(!SEASON.snow){
        lay(-2.0,-.80,4.1,1.6,'#7e9e86');
        for(const u of [-.64,.64]){g.beginPath();g.arc(u,0,.30,0,Math.PI*2);g.lineWidth=.075;g.strokeStyle='#eeeadd';g.stroke()}
        stroke([[-.64,0],[-.27,.35],[.08,0],[-.64,0]],'#eeeadd',.075);
        stroke([[.08,0],[.36,.38],[.64,0]],'#eeeadd',.075);stroke([[.25,.38],[.52,.38]],'#eeeadd',.08);
      }
      g.restore();
    }
  }
  g.restore();
};
// The kit slab is 4 m thick. Only the silhouettes of the two track sections
// appear in its cut ends; their horizontal positions are from the two OSM ways.
const kitGround=cityGround;
cityGround=function(){
  let s=kitGround();
  for(const side of [-1,1])if(vis([side,0,0])){
    const x=side*HALF,tracks=side<0?[-12.59,-8.93]:[-12.15,-8.35];
    const low=-3.86,high=-.83,left=tracks[0]-1.5,right=tracks[1]+1.5;
    s+=shape([[x,left,low],[x,right,low],[x,right,high],[x,left,high]],'#54575a',.40);
    for(const center of tracks){
      for(const rail of [-.7175,.7175])s+=shape([[x,center+rail-.095,low],[x,center+rail+.095,low],[x,center+rail+.065,low+.33],[x,center+rail-.065,low+.33]],'#c3c4ba',.24);
      s+=edge([x,center-.70,high-.11],[x,center+.70,high-.11],'#dcb380',.088);
    }
  }
  return s;
};
function plazaSeats(){
  return [[42.3,15.6],[43.4,10.1],[49.9,22.85],[57.1,21.9],[60.1,16.5]].filter(([x,y])=>standable(x,y)).map(([x,y],i)=>{
    const seat=rect(x,y,.53,.53),d=i%2?1:-1;
    return obj(seat,1.00,()=>{
      let s=shape(atZ(seat,.47),'#a2ac51',.4);
      for(const [xx,yy] of seat)s+=edge([xx,yy,.03],[xx,yy,.48],'#748444',.045);
      s+=shape([[x-.27,y+d*.25,.52],[x+.27,y+d*.25,.52],[x+.27,y+d*.32,.94],[x-.27,y+d*.32,.94]],'#a9b258',.4);
      return s;
    });
  });
}
const LANDMARKS=[
  {name:'Inbound gateway',ids:[roofId,southEntry,'r20779869','r20779871.0'],build:inboundGateway},
  {name:'Outbound headhouse and public patio',ids:[outboundId,liftId],build:roofPatio},
  {name:'MIT Museum at 314 Main',ids:['w1254628669'],build:museum},
  {name:'The Kendall Hotel at Engine 7',ids:['w29620676'],build:firehouse},
  {name:'325 Main Street',ids:['w823968943'],build:googleBuilding},
  {name:'Marriott and Kendall Plaza',ids:['w132600546','w824367467'],build:marriott},
  {name:'Graduate Tower at Site 4',ids:['w823968925'],build:graduateTower},
  {name:'InnovationHQ warehouse',ids:['w132601295'],build:welcomeCenter},
  {name:'Kendall Plaza seating',ids:[],build:plazaSeats}
];

let extrasSeason,extras;
function CITY_EXTRA(){
  if(extrasSeason===SEASON.id)return extras;
  extrasSeason=SEASON.id;extras=[];
  const room=(x,y)=>standable(x,y)&&!inRings([x,y],SCENE.roads)&&!SCENE.trees.some(t=>Math.hypot(t[0]-x,t[1]-y)<1.25);
  const visitor=(x,y,k,angle)=>{
    if(!room(x,y))return;
    const who={...pedDressed(k),p:[x,y],d:[Math.cos(angle),Math.sin(angle)],walked:k%3*.35};
    extras.push(obj(rect(x,y,.52,.52),2.2,()=>pedestrian(who,0).svg));
  };
  if(SEASON.id==='carnival'){
    for(const [i,[x,y]] of [[49,-90],[58,-95],[69,-93],[78,-99],[88,-98],[96,-110],[75,-111],[54,-114]].entries()){
      const fp=rect(x,y,3.3,3.1);
      if(!fp.every(p=>room(...p)))continue;
      const top=i%4===1?'#9cc3cb':'#eee8d5';
      extras.push(obj(fp,3.5,()=>{
        let s=fp.map(p=>stick([...p,.03],[...p,2.45],.045,'#78807c')).join('');
        const table=rect(x,y+.10,2.5,.87);
        for(const p of table)s+=edge([...p,0],[...p,.8],'#6e7472',.065);
        s+=shape(atZ(table,.82),'#b69b7b',.45);
        for(let j=0;j<2;j++){
          const xx=x-.52+j*.93;s+=shape(atZ(rect(xx,y,.38,.29),1.0),'#4f6a70',.45);
          for(const k of [-1,1])s+=ball([xx+.14*k,y-.15,.92],.10,soft('#555c5c'));
        }
        return s+peak(fp,2.48,[x,y,3.48],top)+parapet(fp,2.46,'#aaa99c',.12);
      }));
      visitor(x-.75,y-1.72,i*7+21,1.4);visitor(x+.56,y-2.13,i*11+30,1.9);visitor(x+.12,y+1.02,i*11+2,-1.7);
    }
  }
  if(SEASON.id==='afterdark'){
    for(const [i,[x,y]] of [[30.5,-56.6],[30.4,-55.4],[32,-58.1],[31.05,-59.4],[30.65,-60.4]].entries())visitor(x,y,i+60,3.05);
  }
  return extras;
}
