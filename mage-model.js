/* 星屑女法师。脸部、衣料、手和法杖均由独立的三维曲面搭建。 */
const newSculptedMage = (() => {
  const T = THREE, tau = Math.PI * 2;
  const V = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
  const lerp = T.MathUtils.lerp;
  const palette = new Map();
  function pigment(hex) {
    if (!palette.has(hex)) palette.set(hex,new T.Color(hex).convertSRGBToLinear());
    return palette.get(hex);
  }
  const velvet = 0x694782, plum = 0x422c56, lilac = 0xad8ace, silk = 0xf8e8d8;
  const skin = 0xffd3be, gold = 0xe7b767, goldLight = 0xffdf9b, leather = 0x503750;
  const modes = [
    new T.MeshStandardMaterial({vertexColors:true,roughness:.76,metalness:.015}),
    new T.MeshStandardMaterial({vertexColors:true,roughness:.34,metalness:.30})
  ];
  modes[0].name='织物、肌肤与发丝'; modes[1].name='抛光金属与晶石';
  const studioBall = new T.SphereGeometry(1,20,14), battleBall = new T.SphereGeometry(1,8,6);
  const gemShape = new T.OctahedronGeometry(1);
  const matrix=new T.Matrix4(), q=new T.Quaternion(), euler=new T.Euler(), nullRotation=[0,0,0];
  const prototypes=new Map();

  function makeFigure(battle) {
    const unitBall=battle ? battleBall : studioBall;
    const batches=new Map();
    function joint(parent,name,x=0,y=0,z=0) {
      const obj=new T.Group(); obj.name=name; obj.position.set(x,y,z); parent.add(obj); return obj;
    }
    function add(parent,g,color,mode=0,transform=null) {
      if(parent.name==='发带' || parent.name==='星形发夹' || parent.name==='背披星扣') {
        parent.updateMatrix();
        const local=transform ? new T.Matrix4().multiplyMatrices(parent.matrix,transform) : parent.matrix;
        return add(parent.parent,g,color,mode,local);
      }
      if (!batches.has(parent)) batches.set(parent,[null,null]);
      const slots=batches.get(parent);
      const b=slots[mode] ??= {p:[],n:[],c:[],i:[]};
      const pos=g.attributes.position, norm=g.attributes.normal, shades=g.attributes.color;
      const base=b.p.length/3, tint=pigment(color);
      const normalMat=transform && new T.Matrix3().getNormalMatrix(transform), point=V(), normal=V();
      for(let i=0;i<pos.count;i++) {
        point.fromBufferAttribute(pos,i); normal.fromBufferAttribute(norm,i);
        if(transform){ point.applyMatrix4(transform); normal.applyNormalMatrix(normalMat); }
        b.p.push(point.x,point.y,point.z); b.n.push(normal.x,normal.y,normal.z);
        if(shades)b.c.push(shades.getX(i),shades.getY(i),shades.getZ(i));
        else b.c.push(tint.r,tint.g,tint.b);
      }
      if(g.index) for(const i of g.index.array)b.i.push(base+i);
      else for(let i=0;i<pos.count;i++)b.i.push(base+i);
    }
    function shape(parent,g,color,p,s,rotation=[0,0,0],mode=0) {
      matrix.compose(V(...p),q.setFromEuler(euler.set(...rotation)),V(...s));
      add(parent,g,color,mode,matrix);
    }
    function oval(parent,color,p,s,rotation,mode=0){shape(parent,unitBall,color,p,s,rotation,mode);}
    function gem(parent,color,p,s,rotation){shape(parent,gemShape,color,p,s,rotation,1);}
    function grid(m,n,sample,flip=false) {
      if(battle) {
        m=Math.max(7,Math.round(m*.49));
        if(n>=12)n=Math.max(8,Math.round(n*.48));
      }
      const p=[],c=[],idx=[];
      for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){
        const v=sample(j/m,i/n);p.push(v[0],v[1],v[2]);
        if(v[3]){const color=v[3];c.push(color.r,color.g,color.b);}
      }
      for(let i=0;i<n;i++)for(let j=0;j<m;j++){
        const a=i*(m+1)+j,b=a+1,d=a+m+1,f=d+1;
        if(flip)idx.push(a,d,b,b,d,f); else idx.push(a,b,d,b,f,d);
      }
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);
      if(c.length)g.setAttribute('color',new T.Float32BufferAttribute(c,3));
      g.computeVertexNormals();
      // 闭合环接缝两侧采用同一个法线，侧光下不留硬折线。
      if(p[0]===p[m*3] || Math.hypot(p[0]-p[m*3],p[1]-p[m*3+1],p[2]-p[m*3+2])<1e-5) {
        const attr=g.attributes.normal, v=V(),w=V();
        for(let i=0;i<=n;i++){
          const a=i*(m+1),b=a+m;
          if(Math.hypot(p[a*3]-p[b*3],p[a*3+1]-p[b*3+1],p[a*3+2]-p[b*3+2])>1e-5)continue;
          v.fromBufferAttribute(attr,a).add(w.fromBufferAttribute(attr,b)).normalize();
          attr.setXYZ(a,v.x,v.y,v.z);attr.setXYZ(b,v.x,v.y,v.z);
        }
      }
      return g;
    }
    function surface(parent,rows,color,segments=36,fold=null) {
      add(parent,grid(segments,rows.length-1,(u,v)=>{
        const [y,rx,rz,centerZ=0]=rows[Math.round(v*(rows.length-1))], a=u*tau;
        const f=fold?fold(a,v):1;
        return [Math.sin(a)*rx*f,y,Math.cos(a)*rz*f+centerZ];
      }),color);
    }
    function groove(parent,points,color,radius,mode=0) {
      const curve=new T.CatmullRomCurve3(points.map(p=>V(...p)));
      add(parent,new T.TubeGeometry(curve,Math.max(6,points.length*(battle?1.4:3))|0,radius,battle?5:6,false),color,mode);
    }
    function band(parent,center,rx,rz,radius,color,fold=null) {
      const points=Array.from({length:41},(_,i)=>{const a=i/40*tau, f=fold?fold(a):1;return V(center[0]+rx*f*Math.sin(a),center[1],center[2]+rz*f*Math.cos(a));});
      add(parent,new T.TubeGeometry(new T.CatmullRomCurve3(points,true),battle?24:48,radius,battle?5:6,true),color,1);
    }
    function strand(parent,coords,widths,depths,color,shine=null) {
      const path=new T.CatmullRomCurve3(coords.map(p=>V(...p)),false,'centripetal');
      const steps=(coords.length-1)*4;
      const g=grid(12,steps,(u,t)=>{
        const ci=t*(widths.length-1),i=Math.min(widths.length-2,Math.floor(ci)), f=ci-i;
        const width=lerp(widths[i],widths[i+1],f),depth=lerp(depths[i],depths[i+1],f);
        const tangent=path.getTangent(t), across=V().crossVectors(tangent,V(0,0,1)).normalize();
        const facing=V().crossVectors(across,tangent).normalize(),a=u*tau;
        const p=path.getPoint(t).addScaledVector(across,Math.cos(a)*width).addScaledVector(facing,Math.sin(a)*depth);
        const highlight=shine?Math.pow(Math.max(0,Math.cos(a-1.14)),3)*.64:0;
        return [p.x,p.y,p.z,shine?pigment(color).clone().lerp(pigment(shine),highlight):null];
      },true);
      add(parent,g,color);
    }
    function star(parent,x,y,z,r) {
      const pts=[];for(let i=0;i<8;i++){const a=Math.PI/2+i*Math.PI/4,k=i%2?r*.30:r;pts.push([x+Math.cos(a)*k,y+Math.sin(a)*k]);}
      const poly=new T.Shape(pts.map(p=>new T.Vector2(...p)));
      const g=new T.ExtrudeGeometry(poly,{depth:.014,bevelEnabled:true,bevelSegments:1,bevelSize:.004,bevelThickness:.005});
      g.translate(0,0,z);add(parent,g,goldLight,1);
    }
    const root=new T.Group();root.name='星屑女法师';
    const scale=joint(root,'原型坐标');scale.scale.setScalar(1/2.55);
    const torso=joint(scale,'腰骨',0,.84,0), clothes=joint(torso,'上身',0,-.84,0);
    const head=joint(clothes,'头部',0,1.99,.012);
    // 额头、颧骨、眼窝与下颌共用连续曲面；眼球、鼻翼和唇部顺着这条曲面生长。
    const skull=[[-.40,.015,.014,.035],[-.375,.118,.153,.036],[-.32,.235,.224,.025],[-.245,.325,.286,.018],[-.13,.397,.322,.012],[0,.425,.343,0],[.12,.43,.354,-.012],[.24,.39,.33,-.017],[.36,.28,.26,-.023],[.44,.09,.096,-.028],[.45,.008,.008,-.028]];
    function skullAt(y) {
      let i=0;while(i<skull.length-2 && y>skull[i+1][0])i++;
      const a=skull[i],b=skull[i+1],h=b[0]-a[0],t=T.MathUtils.clamp((y-a[0])/h,0,1);
      const t2=t*t,t3=t2*t,prev=skull[Math.max(0,i-1)],next=skull[Math.min(skull.length-1,i+2)];
      return [1,2,3].map(k=>{
        const m=(b[k]-a[k])/h, p=i?(a[k]-prev[k])/(a[0]-prev[0]):m;
        const n=i+2<skull.length?(next[k]-b[k])/(next[0]-b[0]):m;
        const slope=(x,z)=>x*z>0?2*x*z/(x+z):0;
        return (2*t3-3*t2+1)*a[k]+(t3-2*t2+t)*h*slope(p,m)+(-2*t3+3*t2)*b[k]+(t3-t2)*h*slope(m,n);
      });
    }
    function relief(x,y){
      const side=Math.abs(x);
      return .025*Math.exp(-((side-.235)**2/.012+(y+.125)**2/.006))
        -.029*Math.exp(-((side-.18)**2/.011+(y-.015)**2/.007))
        +.041*Math.exp(-(x*x/.00122+(y+.069)**2/.0091))
        +.049*Math.exp(-(x*x/.00160+(y+.131)**2/.00102))
        +.018*Math.exp(-((side-.036)**2/.00021+(y+.141)**2/.00043));
    }
    function faceZ(x,y){
      const [rx,rz,cz]=skullAt(y);
      const front=Math.sqrt(Math.max(0,1-(x/rx)**2));return cz+(rz+relief(x,y))*front;
    }
    add(head,grid(112,68,(u,v)=>{
      const y=lerp(-.40,.45,v),[rx,rz,cz]=skullAt(y),a=u*tau, x=Math.sin(a)*rx,f=Math.cos(a);
      const c=pigment(skin).clone().lerp(pigment(0xec9a9a),.36*Math.exp(-((Math.abs(x)-.268)**2/.0033+(y+.115)**2/.0017))*Math.max(0,f));
      return [x,y,cz+(rz+(f>0?relief(x,y):0))*f,c];
    }),skin);
    for(const side of [-1,1]){
      oval(head,skin,[side*.405,-.09,-.018],[.090,.131,.071],[0,0,-side*.19]);
      oval(head,0xe99e95,[side*.455,-.09,.028],[.029,.078,.030],[0,0,-side*.19]);
      gem(head,0x66d7d1,[side*.44,-.217,.002],[.022,.041,.021]);
      const cx=side*.175,cy=-.004,rx=.120,top=.103,bot=.111;
      function eyeEdge(t){const s=Math.sin(t),x=rx*Math.cos(t);return [cx+x,cy+s*(s>0?top:bot)*(.70+.30*s*s)+side*x*.13];}
      function eyeZ(x,y){const a=(x-cx)/rx,b=(y-cy-(x-cx)*side*.13)/(y>=cy?top:bot);return faceZ(x,y)+.012+.035*Math.max(0,1-a*a-b*b);}
      add(head,grid(40,8,(u,v)=>{const [ex,ey]=eyeEdge(u*tau),x=lerp(cx,ex,v),y=lerp(cy,ey,v);return [x,y,eyeZ(x,y)];},true),0xfff6eb);
      const irisX=cx-side*.007, irisY=cy+.001;
      add(head,grid(44,9,(u,v)=>{
        const a=u*tau, x=irisX+.077*v*Math.cos(a),y=irisY+.097*v*Math.sin(a);
        const c=pigment(0x65508b).clone().lerp(pigment(0xd6a5ef),(.5-.5*Math.sin(a)*v)**1.3);
        c.lerp(pigment(0x382942),Math.min(1,.90*T.MathUtils.smoothstep(v,.82,1)+.50*Math.max(0,Math.sin(a)*v)));
        return [x,y,eyeZ(x,y)+.004+.009*(1-v*v),c];
      },true),0x996ebc);
      const dot=(x,y,a,b,c,color)=>oval(head,color,[x,y,eyeZ(x,y)+.018],[a,b,c]);
      dot(irisX,irisY+.010,.035,.057,.009,0x342337);
      dot(irisX-.023,irisY+.047,.024,.025,.011,0xfffcf6);
      dot(irisX+.032,irisY-.031,.010,.011,.008,0xffeee0);
      const rim=(a,b,n,z)=>Array.from({length:n},(_,k)=>{const [x,y]=eyeEdge(lerp(a,b,k/(n-1)));return [x,y,eyeZ(x,y)+z];});
      groove(head,rim(0,Math.PI,13,.006),0x44314e,.0115);
      groove(head,rim(Math.PI,2*Math.PI,13,.003),0xbc817f,.004);
      const corner=cx+side*rx;
      for(let k=0;k<2;k++){
        const y=cy+.019+k*.021;
        strand(head,[[corner-side*.018,y,faceZ(corner,y)+.019],[corner+side*.007,y+.013,faceZ(corner,y)+.015],[corner+side*(.027-k*.009),y+.026,faceZ(corner,y)]],[.008,.008,.001],[.005,.004,.001],0x4a3049);
      }
      const brow=[[cx-side*.106,.133],[cx-side*.015,.159],[cx+side*.070,.158],[cx+side*.116,.139]].map(([x,y])=>[x,y,faceZ(x,y)+.013]);
      strand(head,brow,[.006,.015,.013,.002],[.005,.008,.006,.001],0x826183);
    }
    for(const side of [-1,1]) {
      const x=side*.031,y=-.150;
      oval(head,0xdca89b,[x,y,faceZ(x,y)],[.006,.0028,.0026]);
    }
    const lips=[[-.068,-.238],[-.039,-.248],[-.016,-.249],[0,-.245],[.018,-.248],[.042,-.246],[.068,-.235]];
    const lipCurve=(dy,dz)=>lips.map(([x,y])=>[x,y+dy,faceZ(x,y)+dz]);
    strand(head,lipCurve(.004,.008),[.001,.006,.008,.006,.008,.005,.001],[.001,.006,.008,.008,.008,.006,.001],0xe8a49f);
    groove(head,lipCurve(0,.013),0xb47478,.0034);
    oval(head,0xf0b4aa,[.002,-.255,faceZ(0,-.255)+.013],[.040,.010,.010]);
    // 发帽包过后脑；前额留出真实皮肤，刘海分成可从侧面绕看的厚发片。
    function hairCap(a,t){
      const front=T.MathUtils.smoothstep(Math.cos(a),-.37,.83);
      const low=lerp(-.307,.283+.040*Math.cos(3*a+.4),front);
      const y=lerp(low,.487,t),[rx,rz,cz]=skullAt(y-.037);
      const edge=Math.min(1,Math.max(0,(.487-y)/.030));
      const ridge=1+.014*Math.cos(13*a+(1-t)*1.7)*edge;
      return [(rx*1.078+.018*edge)*Math.sin(a)*ridge,y,cz+(rz*1.085+.020*edge)*Math.cos(a)*ridge];
    }
    add(head,grid(72,36,(u,t)=>{
      const a=u*tau, p=hairCap(a,t);
      const c=pigment(0x9580aa).clone().lerp(pigment(0xc9afd6),.48*(.5+.5*Math.cos(13*a+(1-t)*1.7))*(.30+.70*t));
      return [...p,c];
    }),lilac);
    for(let i=0;i<7;i++){
      const a=Math.PI*(.57+i*.145);
      const pts=[.93,.72,.54,.31,.095,.0].map((t,k)=>{const p=hairCap(a+.10*Math.sin(t*4+i*.4),t);
        p[0]+=Math.sin(a)*.009;p[2]+=Math.cos(a)*(k>=1 && k<=3 ? .017 : .011);return p;});
      strand(head,pts,[.003,.037,.051,.057,.041,.002],[.002,.013,.020,.023,.015,.001],0x9d83ae,0xc4a8d5);
    }
    const bang=(pts,ws,ds,color=0xa58ab9)=>strand(head,pts.map(([x,y,z])=>[x,y+.022*T.MathUtils.smoothstep(y,.20,.45),z+.039*T.MathUtils.smoothstep(z,.105,.30)]),ws,ds,color,0xe0c9eb);
    bang([[.035,.448,.035],[-.061,.37,.214],[-.126,.245,.331],[-.225,.115,.352],[-.365,.047,.262]],
      [.016,.098,.145,.105,.002],[.008,.038,.052,.043,.001]);
    bang([[.04,.448,.038],[.096,.36,.212],[.084,.244,.350],[.030,.148,.397],[-.066,.082,.385]],
      [.015,.079,.098,.070,.002],[.008,.036,.045,.035,.001],0xb197c3);
    bang([[.054,.446,.02],[.175,.365,.170],[.240,.259,.277],[.278,.158,.295],[.315,.095,.259]],
      [.010,.079,.089,.071,.002],[.005,.036,.048,.037,.001],0xa88fbd);
    for(const s of [-1,1]){
      const reflect=pts=>pts.map(([x,y,z])=>[s*x,y,z]);
      bang(reflect([[.178,.397,.028],[.345,.255,.15],[.399,.060,.118],[.385,-.132,.153],[.327,-.245,.222]]),
        [.017,.083,.091,.067,.002],[.008,.055,.058,.051,.001],0x9677aa);
      bang(reflect([[.22,.343,-.044],[.392,.181,-.019],[.434,-.036,-.030],[.407,-.222,.012],[.350,-.289,.093]]),
        [.014,.080,.092,.063,.002],[.008,.042,.056,.045,.001],0x8d729f);
      const tail=joint(head,s<0?'左发尾':'右发尾',s*.385,.240,-.155);
      oval(tail,0x8a729c,[s*.036,.030,-.024],[.128,.121,.111]);
      const hair=(pts,ws,ds,color,shine)=>strand(tail,reflect(pts),ws,ds,color,shine);
      hair([[.008,.055,-.008],[.121,-.049,-.086],[.207,-.214,-.141],[.216,-.409,-.153],[.156,-.576,-.186],[.224,-.725,-.139],[.298,-.818,-.075],[.255,-.891,-.028],[.200,-.887,-.012]],
        [.044,.120,.156,.154,.121,.097,.067,.038,.002],[.031,.095,.114,.116,.097,.076,.053,.033,.001],0x9074a7,0xd6bbdf);
      hair([[.021,.068,.038],[.105,-.017,.032],[.151,-.190,-.001],[.154,-.356,-.013],[.117,-.489,.002],[.175,-.580,.042],[.259,-.571,.058],[.287,-.507,.066]],
        [.039,.094,.111,.097,.067,.054,.030,.002],[.023,.065,.080,.072,.048,.038,.020,.001],0xad8fbc,0xe4cbed);
      hair([[.002,.038,-.049],[.087,-.065,-.174],[.137,-.258,-.219],[.102,-.452,-.250],[.103,-.630,-.210],[.154,-.738,-.148],[.130,-.819,-.117]],
        [.024,.088,.097,.093,.068,.041,.002],[.017,.070,.081,.073,.052,.033,.001],0x7d668f,0xb699c6);
      const bow=joint(tail,'发带',s*.019,.045,.040);
      for(const wing of [-1,1]){
        const bowPts=[[s*.024,.067,.108],[s*(.024+wing*.054),.109,.117],[s*(.024+wing*.105),.168,.104],[s*(.024+wing*.12),.178,.082]];
        strand(bow,bowPts,[.017,.054,.072,.004],[.012,.026,.040,.002],silk,0xfff8ef);
        groove(bow,[[s*.024,.067,.126],[s*(.024+wing*.055),.106,.145],[s*(.024+wing*.108),.161,.141]],0xd7bcb6,.005);
        strand(bow,[[s*.024,.066,.103],[s*(.024+wing*.047),.004,.110],[s*(.024+wing*.071),-.069,.093]],
          [.015,.030,.014],[.009,.010,.003],0xf1dcd4);
      }
      oval(bow,gold,[s*.024,.07,.139],[.026,.026,.024],nullRotation,1);
    }
    const clip=joint(head,'星形发夹',.278,.222,.335);
    clip.rotation.set(-.26,.54,-.14);
    star(clip,0,0,.021,.082);gem(clip,0x6de1d4,[0,0,.047],[.022,.025,.017]);
    oval(clothes,skin,[0,1.605,.008],[.122,.17,.110]);
    surface(clothes,[[.92,.20,.156],[.99,.225,.171],[1.13,.190,.150],[1.30,.214,.170],[1.45,.251,.174],[1.53,.208,.128],[1.55,.13,.095]],velvet);
    // 裙褶从腰头连续折到裙底，内衬、花边和金色滚边各有自己的厚度。
    const pleat=(a,t)=>1+(.065-.037*t)*Math.cos(12*a+.14)+.011*Math.cos(24*a);
    const skirtRows=[[.752,.42,.294],[.765,.445,.302],[.80,.448,.306],[.85,.422,.295],[.96,.337,.25],[1.09,.215,.173]];
    surface(clothes,skirtRows,0x5e3d74,72,pleat);
    const under=[];
    for(let j=0;j<6;j++)under.push([.727+j*.014,.405+j*.004,.276+j*.003]);
    const lace=(a,t)=>1+.065*Math.cos(18*a)+.018*Math.cos(36*a);
    surface(clothes,under,0xf2d8cf,90,lace);
    function skirtEdge(a,y,clearance) {
      const i=skirtRows.findIndex(row=>row[0]>=y),lo=skirtRows[i-1],hi=skirtRows[i];
      const t=(y-lo[0])/(hi[0]-lo[0]),f0=pleat(a,(i-1)/5),f1=pleat(a,i/5);
      return [Math.sin(a)*(lerp(lo[1]*f0,hi[1]*f1,t)+clearance),y,Math.cos(a)*(lerp(lo[2]*f0,hi[2]*f1,t)+clearance)];
    }
    function skirtTrim(y,pad,r,color) {
      const pts=Array.from({length:97},(_,i)=>V(...skirtEdge(i*tau/96,y,pad)));
      const path=new T.CatmullRomCurve3(pts.slice(0,-1),true);
      add(clothes,new T.TubeGeometry(path,96,r,battle?4:6,true),color,1);
    }
    // 滚边与腰带根据同一圈裙褶取样，再向外错开，转身时也保持连续。
    skirtTrim(.797,.015,.0065,goldLight);
    add(clothes,grid(96,3,(u,t)=>skirtEdge(u*tau,lerp(1.045,1.086,t),.013)),leather);
    skirtTrim(1.048,.020,.006,gold);skirtTrim(1.084,.020,.007,goldLight);
    for(const s of [-1,1]){
      groove(clothes,[[s*.17,1.43,.108],[s*.117,1.32,.154],[s*.094,1.16,.153],[s*.16,1.075,.128]],gold,.008,1);
      for(let j=0;j<3;j++)oval(clothes,goldLight,[s*.064,1.18+j*.056,.157],[.014,.014,.010],nullRotation,1);
    }
    const capeJoint=joint(clothes,'披风',0,1.54,-.038), cape=joint(capeJoint,'披风衣片',0,-1.54,.038);
    function capePoint(a,t,inner=false) {
      const back=(1-Math.cos(a))/2, flare=Math.sin(t*Math.PI*.46),ridge=Math.cos(9*a+t*.52);
      const pointed=.17*(.5+.5*Math.cos(3*a+.05))**3*back;
      const rx=lerp(.278,.559,flare)+(.021*ridge*t)-(inner?.014:0);
      const rz=lerp(.176,.337,flare)+(.019*ridge*t)-(inner?.018:0);
      return [Math.sin(a)*rx,1.51-t*(.64+.14*back+pointed),Math.cos(a)*rz-.024-.055*t*back];
    }
    function cloakAngle(u,t){const opening=lerp(.63,1.13,t);return lerp(opening,tau-opening,u);}
    for(const inside of [false,true]) add(cape,grid(60,14,(u,t)=>capePoint(cloakAngle(u,t),t,inside),!inside),inside?0x735780:0xa486ba);
    const hemPoints=Array.from({length:48},(_,i)=>capePoint(cloakAngle(i/47,1),1));
    groove(cape,hemPoints,gold,.012,1);
    for(const u of [0,1]){
      groove(cape,Array.from({length:11},(_,i)=>capePoint(cloakAngle(u,i/10),i/10)),goldLight,.010,1);
    }
    for(const a of [1.65,2.60,3.68,4.63]){
      const pts=[.32,.46,.64,.76,.89].map(t=>capePoint(a,t));groove(cape,pts,0xbba1c4,.006);
    }
    // 短肩披和大披风互相搭叠，后片的金边与倒尖分开，旋转时仍能看见两层衣料。
    function mantlePoint(u,t,inner=false) {
      const a=lerp(.60,tau-.60,u),back=(1-Math.cos(a))*.5;
      const scallop=(.5+.5*Math.cos(3*a+Math.PI))**2;
      const x=lerp(.155,.416,t)-(inner?.014:0),z=lerp(.118,.284,t)-(inner?.009:0);
      return [Math.sin(a)*x,1.56-t*(.146+back*(.070+.104*scallop)),Math.cos(a)*z-.033];
    }
    for(const inside of [false,true])add(cape,grid(48,5,(u,t)=>mantlePoint(u,t,inside),!inside),inside?plum:0x9373ac);
    groove(cape,Array.from({length:36},(_,i)=>mantlePoint(i/35,1)),gold,.011,1);
    const backPin=joint(cape,'背披星扣',0,1.39,-.288);backPin.rotation.y=Math.PI;
    star(backPin,0,0,0,.042);
    for(const s of [-1,1]){
      strand(clothes,[[s*.24,1.48,.019],[s*.22,1.48,.131],[s*.16,1.43,.193],[s*.084,1.34,.196],[s*.017,1.27,.180]],
        [.049,.087,.087,.046,.002],[.016,.034,.035,.018,.001],0xb292c2);
      groove(clothes,[[s*.22,1.50,.128],[s*.144,1.476,.191],[s*.067,1.391,.208],[s*.014,1.304,.193]],goldLight,.010,1);
    }
    for(let i=0;i<16;i++){
      const a=i*tau/16;oval(clothes,silk,[.144*Math.sin(a),1.571+.012*Math.cos(a*3),.104*Math.cos(a)],[.042,.046,.039]);
    }
    gem(clothes,gold,[0,1.443,.201],[.081,.095,.032]);
    gem(clothes,0x48cec5,[0,1.45,.235],[.050,.064,.033]);
    star(clothes,0,1.037,.185,.052);
    for(const s of [-1,1]){
      const leg=joint(scale,s<0?'左腿':'右腿',s*.128,.866,-.004);
      oval(leg,skin,[0,-.159,.003],[.097,.207,.094]);
      oval(leg,0xf7e5dc,[0,-.388,0],[.087,.180,.086]);
      band(leg,[0,-.292,0],.088,.087,.012,0xecd8cc);
      oval(leg,leather,[0,-.589,-.004],[.099,.177,.100]);
      oval(leg,0x593e58,[0,-.755,.048],[.111,.096,.162]);
      oval(leg,0x352738,[0,-.835,.052],[.117,.031,.170]);
      oval(leg,0x754d68,[0,-.769,.122],[.100,.056,.098]);
      band(leg,[0,-.511,-.003],.101,.101,.016,0x68495a);
      band(leg,[0,-.553,0],.102,.104,.011,leather);
      shape(leg,new T.TorusGeometry(.031,.006,6,12),gold,[s*.028,-.549,.099],[1,.90,.67],nullRotation,1);
      oval(leg,goldLight,[s*.028,-.546,.107],[.023,.004,.004],nullRotation,1);
    }
    const staff=joint(clothes,'法杖骨',0,1.275,.245);
    const axis=V(.70,.70,.125).normalize();
    const rod=joint(staff,'法杖本体');
    rod.quaternion.setFromUnitVectors(V(0,1,0),axis);
    surface(rod,[[-.672,.015,.015],[-.655,.033,.031],[-.59,.035,.033],[-.53,.021,.021],[-.16,.019,.019],[.34,.021,.021],[.48,.025,.025],[.536,.044,.042]],leather,16);
    for (const height of [-.61,-.53,-.19,.07,.38,.477,.519])band(rod,[0,height,0],height>.45?.032:.022,height>.45?.032:.022,.008,gold);
    for(let i=0;i<3;i++) {
      const phase=i*tau/3;
      groove(rod,Array.from({length:13},(_,k)=>{
        const t=k/12,a=phase+t*3.2;return [.023*Math.cos(a),.26+t*.20,.023*Math.sin(a)];
      }),gold,.0045,1);
    }
    gem(rod,0x54d4cf,[0,-.675,0],[.043,.067,.042]);
    shape(rod,new T.TorusGeometry(.157,.012,10,40),gold,[0,.689,0],[1,1,.96],[0,0,0],1);
    shape(rod,new T.TorusGeometry(.153,.0075,8,36),goldLight,[0,.689,0],[1,1,1],[0,.85,.12],1);
    gem(rod,0x53c9c6,[0,.689,0],[.084,.145,.071]);
    gem(rod,0x93ebe2,[-.013,.704,.032],[.042,.081,.047],[-.05,.16,.02]);
    for(const s of [-1,1])gem(rod,goldLight,[s*.157,.689,0],[.029,.048,.025],[0,0,-s*.46]);
    const muzzle=joint(rod,'杖尖',0,.752,0);
    for(const s of [-1,1]) {
      const arm=joint(clothes,s<0?'左上臂':'右上臂'), fore=joint(clothes,s<0?'左前臂':'右前臂');
      const hand=joint(clothes,s<0?'左手':'右手');
      // 手臂沿局部 Y 轴伸展，姿态更新时肩、肘、掌心共同解算。
      surface(arm,[[0,.043,.044],[.09,.083,.080],[.33,.103,.104],[.61,.091,.093],[.86,.074,.077],[1,.060,.061]],0xf4dfd1,22);
      surface(fore,[[0,.067,.070],[.22,.084,.087],[.55,.093,.094],[.80,.088,.090],[.91,.097,.096],[1,.077,.079]],silk,22);
      surface(fore,[[.88,.096,.096],[.91,.102,.100],[.98,.099,.100],[1,.082,.082]],0xdac2bb,24);
      oval(hand,skin,[0,0,.003],[.064,.056,.055],[0,0,s*.24]);
      for(let k=0;k<4;k++){
        const shift=(k-1.5)*.022;
        oval(hand,skin,[shift*.68,shift*.50,.040],[.019,.032-(k===3?.006:0),.025],[.42,0,-.51]);
        oval(hand,0xfad2bc,[shift*.68+.009,-.019+shift*.5,.038],[.014,.017,.016]);
      }
      oval(hand,skin,[s*.038,.018,.034],[.025,.041,.024],[.25,0,-s*.55]);
    }
    for (const [parent,slots] of batches) for(let mode=0;mode<slots.length;mode++) {
      const b=slots[mode];if(!b)continue;
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new T.Float32BufferAttribute(b.n,3));
      g.setAttribute('color',new T.Float32BufferAttribute(b.c,3));g.setIndex(b.i);g.computeBoundingSphere();
      const part=new T.Mesh(g,modes[mode]);part.name=parent.name+(mode?'·金工':'·造型');parent.add(part);
    }
    return root;
  }
  function attachRig(model) {
    const get=name=>model.getObjectByName(name);
    const rig={head:get('头部'),torso:get('腰骨'),cape:get('披风'),staff:get('法杖骨'),muzzle:get('杖尖'),
      legs:[get('左腿'),get('右腿')],tails:[get('左发尾'),get('右发尾')],hands:[get('左手'),get('右手')],
      upper:[get('左上臂'),get('右上臂')],fore:[get('左前臂'),get('右前臂')]};
    rig.grip=rig.staff;
    const up=V(0,1,0),elbow=V(),target=V(),shaftAxis=V(.70,.70,.125).normalize(),delta=V();
    const shoulders=[V(-.219,1.45,.05),V(.219,1.45,.05)];
    function segment(part,start,end) {
      delta.subVectors(end,start);part.scale.y=delta.length();
      part.quaternion.setFromUnitVectors(up,delta.normalize());part.position.copy(start);
    }
    Object.defineProperty(model.userData,'rig',{value:rig});
    function pose({time=0,stride=0,motion=0,dash=0,thrust=0,lift=0,sweep=0,ready=0}={}) {
      const t=time, wave=Math.sin(stride)*motion;
      rig.head.rotation.set(-.041+.028*motion+.022*thrust,.018*Math.sin(t*1.27),-.045*lift+.018*wave);
      rig.torso.rotation.set(.051*motion-.067*thrust-.042*lift,.072*sweep-.051*ready,-.076*lift+.035*sweep);
      rig.cape.rotation.x=-.036*motion-.092*dash-.022*Math.sin(t*2.5);
      for(let k=0;k<2;k++){const s=k===0?-1:1;
        rig.tails[k].rotation.set(-.07*motion-.12*dash+.045*Math.sin(t*2.7+s),
          s*.043*Math.sin(t*1.5),s*(.024*Math.sin(t*2.4+k)-.055*lift)+wave*.044);
        rig.legs[k].rotation.x=s*wave*.40;
      }
      rig.staff.position.set(.008,1.275+.059*lift-.036*thrust,.245+.137*thrust+.065*sweep-.039*ready);
      rig.staff.rotation.set(.32*thrust-.15*ready-.21*lift+.19*sweep,
        -.76*thrust+.15*ready+.25*lift-.77*sweep,-.18*thrust+.17*ready+.56*lift-.54*sweep,'YXZ');
      for(let k=0;k<2;k++) {
        const s=k===0?-1:1;
        target.copy(shaftAxis).multiplyScalar(s*(k===0?.12:.153)).applyQuaternion(rig.staff.quaternion).add(rig.staff.position);
        elbow.copy(shoulders[k]).lerp(target,.48);elbow.x+=s*(.102-.034*thrust);elbow.y-=.102;elbow.z+=.024;
        segment(rig.upper[k],shoulders[k],elbow);segment(rig.fore[k],elbow,target);
        rig.hands[k].position.copy(target);rig.hands[k].quaternion.copy(rig.staff.quaternion);
      }
    }
    Object.defineProperty(model.userData,'pose',{value:pose});pose();return model;
  }
  return (quality='studio') => {
    if(!prototypes.has(quality))prototypes.set(quality,makeFigure(quality==='battle'));
    return attachRig(prototypes.get(quality).clone(true));
  };
})();
