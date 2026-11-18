// 怪物造型共用几何和材质；每只怪物由独立的封闭部件合并为一次绘制。
(() => {
  'use strict';
  const models = new Map();
  const primitives = new Map();
  let skin;
  const tau = Math.PI * 2;
  const sides = [-1, 1];
  const ink = 0x322639, iron = 0x554652, gold = 0xd9a35d, lightGold = 0xffdd91;
  const horn = 0xf0d8ae, ivory = 0xffeadb, wine = 0x843e59, lilac = 0x9b74ac;
  const violet = 0x57416b, teal = 0x489e88, fresh = 0x9bcf78, fire = 0xff9a3e;
  function primitive(name) {
    if (!primitives.has(name)) {
      const geometry = name === 'ball' ? new THREE.SphereGeometry(1,12,8) :
        name === 'gem' ? new THREE.OctahedronGeometry(1,0) :
        name === 'block' ? new THREE.BoxGeometry(2,2,2) : new THREE.TorusGeometry(1,.12,5,22);
      primitives.set(name,geometry);
    }
    return primitives.get(name);
  }
  // 顶点先储存在部件局部空间，合并之后保留曲面法线和硬边。
  class Sculpture {
    constructor() {
      this.positions=[]; this.normals=[]; this.colors=[]; this.indices=[];
      this.tint=new THREE.Color(); this.vector=new THREE.Vector3();
      this.matrix=new THREE.Matrix4(); this.normalMatrix=new THREE.Matrix3();
      this.rotation=new THREE.Quaternion(); this.euler=new THREE.Euler();
    }
    add(geo, center, scale, rotation, color) {
      const offset=this.positions.length/3, coords=geo.attributes.position, normals=geo.attributes.normal;
      this.rotation.setFromEuler(this.euler.set(...rotation));
      this.matrix.compose(new THREE.Vector3(...center),this.rotation,new THREE.Vector3(...scale));
      this.normalMatrix.getNormalMatrix(this.matrix);
      // 色板取自原画的 sRGB 色值；顶点色和 GLB 的 COLOR_0 都使用线性空间。
      this.tint.setRGB(((color>>>16)&255)/255,((color>>>8)&255)/255,(color&255)/255).convertSRGBToLinear();
      for(let i=0;i<coords.count;i++){
        this.vector.fromBufferAttribute(coords,i).applyMatrix4(this.matrix);
        this.positions.push(this.vector.x,this.vector.y,this.vector.z);
        this.vector.fromBufferAttribute(normals,i).applyMatrix3(this.normalMatrix).normalize();
        this.normals.push(this.vector.x,this.vector.y,this.vector.z);
        this.colors.push(this.tint.r,this.tint.g,this.tint.b);
      }
      if(geo.index)for(const i of geo.index.array)this.indices.push(offset+i);
      else for(let i=0;i<coords.count;i++)this.indices.push(offset+i);
    }
    solid(name, center, scale, color, rot=[0,0,0]) {this.add(primitive(name),center,scale,rot,color);}
    ball(x,y,z,a,b,c,color,rot=[0,0,0]){this.solid('ball',[x,y,z],[a,b,c],color,rot);}
    gem(x,y,z,a,b,c,color,rot=[0,0,0]){this.solid('gem',[x,y,z],[a,b,c],color,rot);}
    block(x,y,z,a,b,c,color,rot=[0,0,0]){this.solid('block',[x,y,z],[a,b,c],color,rot);}
    ring(x,y,z,a,b,c,color,rot=[0,0,0]){this.solid('ring',[x,y,z],[a,b,c],color,rot);}
    // 同一截面里的两条尺度分别控制宽、厚，可用于带中脊的花瓣和弯角。
    tube(points,radii,color,count=7,depths=radii) {
      const vertices=[],faces=[],centers=points.map(p=>new THREE.Vector3(...p));
      let across;
      for(let j=0;j<centers.length;j++){
        const before=centers[Math.max(0,j-1)], after=centers[Math.min(centers.length-1,j+1)];
        const t=after.clone().sub(before).normalize();
        if(!across)across = Math.abs(t.y)<.9 ? new THREE.Vector3(t.z,0,-t.x).normalize() : new THREE.Vector3(1,0,0);
        across.addScaledVector(t,-across.dot(t)).normalize();
        const up=t.clone().cross(across);
        for(let i=0;i<count;i++){
          const a=tau*i/count;
          const v=centers[j].clone().addScaledVector(across,Math.cos(a)*Math.max(.001,radii[j]))
            .addScaledVector(up,Math.sin(a)*Math.max(.001,depths[j]));
          vertices.push(v.x,v.y,v.z);
          if(j>0){const k=(j-1)*count+i,next=(j-1)*count+(i+1)%count;faces.push(k,next,k+count,next,next+count,k+count);}
        }
      }
      for(let i=1;i<count-1;i++){
        faces.push(0,i+1,i);
        const last=(centers.length-1)*count;
        faces.push(last,last+i,last+i+1);
      }
      const segment=new THREE.BufferGeometry();
      segment.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));segment.setIndex(faces);segment.computeVertexNormals();
      this.add(segment,[0,0,0],[1,1,1],[0,0,0],color);
    }
    rod(a,b,r,color,r2=r){this.tube([a,b],[r,r2],color,8);}
    leaf(a,b,c,width,color){this.tube([a,b,c],[width*.23,width,.002],color,8,[width*.21,width*.36,.002]);}
    foot(x,y,z,size,body, claws=true) {
      this.ball(x,y,z,size*.90,size*.50,size*1.12,body);
      if(claws)for(const t of [-1,0,1])this.tube([[x+t*size*.44,y,z+size*.55],[x+t*size*.48,y*.64,z+size*1.14],[x+t*size*.52,y*.30,z+size*1.43]],[size*.20,size*.14,.003],horn,6);
    }
    // 甲壳、斗篷与灯罩使用封闭的截面，在背面仍有足够厚度。
    mantle(rows,color,sectors=16,fold=0,waves=7) {
      const vv=[],ii=[];
      for(let j=0;j<rows.length;j++){
        const [y,rx,rz,cx=0,cz=0]=rows[j];
        for(let i=0;i<sectors;i++){
          const a=tau*i/sectors,c=Math.cos(a),d=-Math.sin(a),w=1+fold*Math.cos(waves*a);
          vv.push(cx+c*rx*w,y+(j===0?fold*Math.cos(waves*a)*.22:0),cz+d*rz*w);
          if(j){const k=(j-1)*sectors+i,n=(j-1)*sectors+(i+1)%sectors;ii.push(k,n,k+sectors,n,n+sectors,k+sectors);}
        }
      }
      for(let i=1;i<sectors-1;i++){ii.push(0,i+1,i);const k=(rows.length-1)*sectors;ii.push(k,k+i,k+i+1);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vv,3));g.setIndex(ii);g.computeVertexNormals();
      this.add(g,[0,0,0],[1,1,1],[0,0,0],color);
    }
    eyes(y,z,span,r,color=lightGold,angle=.13) {
      for(const s of sides){
        const x=s*span,rZ=s*angle;
        this.ball(x,y,z,r,r*.71,r*.37,ink,[0,s*.16,rZ]);
        this.ball(x,y,z+r*.26,r*.79,r*.58,r*.27,color,[0,s*.16,rZ]);
        this.ball(x+s*r*.10,y+.005,z+r*.50,r*.25,r*.45,r*.13,ink);
        this.ball(x-r*.18,y+r*.23,z+r*.54,r*.13,r*.13,r*.085,ivory);
      }
    }
    finish(){
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(this.positions,3));
      geo.setAttribute('normal',new THREE.Float32BufferAttribute(this.normals,3));
      geo.setAttribute('color',new THREE.Float32BufferAttribute(this.colors,3));
      geo.setIndex(this.indices); geo.computeBoundingBox();
      const box=geo.boundingBox,k=1/(box.max.y-box.min.y);
      geo.translate(0,-box.min.y,0);geo.scale(k,k,k);geo.computeBoundingBox();geo.computeBoundingSphere();
      return geo;
    }
  }

  function crown(m,x,y,z,r,n=5,metal=gold){
    m.ring(x,y,z,r,r,.27*r,metal,[Math.PI/2,0,0]);
    for(let i=0;i<n;i++){
      const a=tau*i/n, dx=Math.sin(a),dz=Math.cos(a);
      m.tube([[x+dx*r*.91,y,z+dz*r*.91],[x+dx*r*1.07,y+r*.37,z+dz*r*1.07],[x+dx*r*1.20,y+r*.86,z+dz*r*1.20]],[r*.23,r*.13,.003],metal,5);
    }
  }
  function blades(m,x,y,z,r,col, n=4) {
    m.ring(x,y,z,r,r,r*.75,gold);
    for(let i=0;i<n;i++){const a=tau*i/n; m.gem(x+Math.sin(a)*r,y+Math.cos(a)*r,z,r*.14,r*.30,r*.11,col,[0,0,-a]);}
  }
  function bandedStaff(m,x,h,c=gold) {
    m.rod([x,.12,.10],[x,h-.10,.12],.027,c);
    m.ring(x,h,.12,.112,.13,.10,c);
    m.gem(x,h,.12,.045,.073,.035,lightGold);
    for(const s of sides)m.gem(x+s*.12,h+.01,.12,.032,.060,.027,c,[0,0,-s*.55]);
  }
  function quadruped(m,ice=false, ram=false){
    const hide=ice?0x93aacd:ram?0x803e55:0x9b5061;
    const mantle=ice?0xc1d3eb:ram?wine:0x713c4d, highlight=ice?0x88d9ff:ram?0xcb865d:0xce7476;
    m.ball(0,.38,-.085,ram?.34:.277,ram?.25:.205,.36,hide);
    m.ball(0,.40,-.265,.242,.21,.245,mantle);
    for(const s of sides){
      for(const z of [-.255,.14]){
        const x=s*(ram?.245:.206),knee=[x*1.10,.22,z+(z<0?-.045:.043)];
        m.ball(x,.31,z,.105,.145,.100,hide);
        m.tube([[x,.32,z],knee,[x,.093,z+.052]],[.084,.077,.052],mantle);
        m.foot(x,.065,z+.09,ram?.10:.084,ice?0xdfdfed:0x694455);
      }
    }
    m.ball(0,.47,.17,.25,.20,.225,mantle);
    m.ball(0,.48,.296,.232,.174,.168,hide);
    m.ball(0,.415,.415,.158,.088,.133,ice?0xd6dceb:0xe3aa9a);
    m.ball(0,.445,.516,.069,.037,.035,ink);
    m.ball(0,.368,.439,.110,.035,.076,ink);
    for(const s of sides){
      m.tube([[s*.094,.40,.473],[s*.097,.367,.482],[s*.091,.346,.483]],[.020,.014,.003],ivory,6);
      m.leaf([s*.142,.566,.21],[s*.206,.67,.12],[s*.245,.762,.099],.076,mantle);
      m.leaf([s*.145,.59,.235],[s*.198,.665,.159],[s*.229,.724,.14],.037,highlight);
      m.leaf([s*.176,.49,.28],[s*.259,.48,.22],[s*.31,.45,.153],.065,highlight);
    }
    m.eyes(.503,.433,.117,.066,ice?0x5dbcf1:0xffc363,-.21);
    for(const s of sides)m.leaf([s*.054,.545,.426],[s*.134,.568,.413],[s*.203,.585,.354],.033,ice?0xf0e5ce:highlight);
    if(ram){
      for(const s of sides){
        m.tube([[s*.097,.563,.415],[s*.141,.663,.484],[s*.184,.756,.504],[s*.194,.83,.467]],[.079,.069,.042,.003],horn,9);
        m.ball(s*.226,.497,-.047,.15,.179,.19,gold);
        m.ball(s*.236,.508,-.050,.148,.153,.16,wine);
        m.gem(s*.357,.53,-.035,.033,.055,.058,lightGold);
      }
      for(const z of [-.28,-.10,.04])m.ball(0,.535,z,.246,.134,.134,0xaf5866);
    }else{
      for(let i=0;i<4;i++){
        const z=.05-i*.128,y= .56+Math.sin(i*.9)*.024, top=ice? .76:.69;
        m.tube([[0,y,z],[0,top,z-.044],[0,top+(ice?.14:.075),z-.114]],[ice?.064:.071,.038,.003],ice?0x83d3fc:horn,6);
      }
      for(const s of sides)for(let i=0;i<3;i++)m.leaf([s*.15,.46,.01-i*.105],[s*.242,.54,.002-i*.105],[s*.287,.60,-.095-i*.105],.067,mantle);
      m.tube([[0,.41,-.35],[.06,.41,-.49],[.12,.50,-.58],[.14,.55,-.61]],[.09,.068,.038,.003],ice?0xdde6fe:highlight);
    }
  }
  function slime(m,egg){
    if(egg){
      m.mantle([[.045,.245,.21],[.22,.323,.294],[.40,.322,.298],[.6,.255,.242],[.76,.164,.158],[.83,.04,.039]],0x87a84a,16);
      for(let band=0;band<2;band++)for(let j=0;j<8;j++){
        const a=(j+band*.5)*tau/8, q=(band?.23:.29),x=Math.sin(a), z=Math.cos(a);
        m.gem(x*q,band?.567:.305,z*q,.14,.18,.082,(j+band)%2?0xc9cf72:0x76964d,[0,a,0]);
      }
      for(const s of sides){
        m.foot(s*.186,.064,.15,.083,0x698f50);
        m.ball(s*.224,.273,.246,.088,.143,.09,0xb8db76);
      }
      m.eyes(.293,.286,.102,.044,lightGold);
    }else{
      m.mantle([[.025,.325,.255],[.105,.35,.28],[.22,.285,.245],[.35,.194,.18],[.405,.068,.08]],0xa0cb50,18,.08,5);
      for(let i=0;i<5;i++){const a=i*tau/5;m.ball(Math.sin(a)*.252,.062,Math.cos(a)*.193,.12,.062,.112,0xa7cf56);}
      m.eyes(.202,.223,.112,.052,0xf4d66b,-.2);
      m.ball(0,.119,.266,.064,.045,.025,ink);m.ball(0,.097,.285,.035,.018,.012,0xdc8888);
      m.rod([0,.36,0],[.022,.50,0],.026,0x668f44,.013);
      m.leaf([.012,.494,0],[.122,.548,.02],[.186,.603,.015],.071,fresh);
      m.leaf([.018,.486,0],[-.073,.527,-.014],[-.136,.559,-.003],.055,0xa7cc66);
    }
  }
  function bomb(m){
    m.ball(0,.39,0,.315,.314,.31,0xc77547);
    for(let j=0;j<2;j++)for(let i=0;i<8;i++){
      const a=tau*(i+j*.5)/8, y=j?.54:.283;
      if(j===1&&Math.cos(a)>.78)continue;
      const x=Math.sin(a),z=Math.cos(a);
      m.tube([[x*.26,y,z*.26],[x*.317,y+(j?.037:-.015),z*.317],[x*.385,y+(j?.094:-.068),z*.385]],[.065,.047,.002],horn,7);
    }
    m.mantle([[.655,.101,.101],[.71,.092,.092],[.737,.062,.064]],gold,12);
    m.tube([[0,.729,0],[.017,.791,-.01],[.067,.83,0],[.11,.83,.015]],[.023,.024,.017,.011],wine);
    m.gem(.112,.83,.015,.045,.067,.04,fire,[0,0,-.65]);m.eyes(.423,.278,.117,.079,lightGold,-.26);
    for(const s of sides)m.foot(s*.134,.076,.038,.083,0x825148,false);
  }

  function visor(m,x,y,z,r,light=lightGold){
    m.ball(x,y,z,r,r*.91,r*.50,ink);
    m.ball(x,y,z+r*.38,r*.70,r*.70,r*.23,light);
    m.ball(x,y,z+r*.56,r*.18,r*.57,r*.12,ink);
    m.ball(x-r*.20,y+r*.27,z+r*.64,r*.14,r*.14,r*.08,ivory);
  }
  function hood(m,x,y,z,r,cloth,trim,mask=false) {
    m.ball(x,y,z,r*.98,r*1.04,r*.86,cloth);
    m.ball(x,y-r*.12,z+r*.52,r*.77,r*.75,r*.48,trim);
    m.ball(x,y-r*.16,z+r*.61,r*.66,r*.62,r*.46,mask?ivory:ink);
    if(mask){
      for(const s of sides)m.ball(x+s*r*.30,y-r*.12,z+r*.987,r*.15,r*.072,r*.064,ink,[0,0,s*.27]);
      m.gem(x,y-r*.25,z+r*1.04,r*.10,r*.14,r*.09,gold);
    }else{
      for(const s of sides)m.ball(x+s*r*.268,y-r*.125,z+r*1.014,r*.097,r*.17,r*.059,lightGold);
    }
    m.leaf([x,y+r*.64,z+r*.63],[x-r*.08,y+r*.41,z+r*.95],[x+r*.05,y+r*.18,z+r*1.04],r*.38,cloth);
  }
  function coat(m,color,trim,wide=.33){
    m.mantle([[.079,wide,.248],[.164,wide*.93,.216],[.365,.178,.143],[.565,.207,.165],[.64,.113,.103]],color,24,.065,6);
    for(let i=0;i<6;i++){
      const a=tau*i/6, x=Math.sin(a), z=Math.cos(a);
      m.leaf([x*.145,.54,z*.129],[x*wide*.74,.285,z*.205],[x*wide*1.05,.055,z*.265],.060,trim);
    }
    m.mantle([[.358,.187,.154],[.388,.18,.150]],trim,14);
  }
  function caster(m,kind){
    if(kind==='shooter'){
      m.mantle([[.035,.073,.071],[.128,.176,.108],[.43,.216,.137],[.692,.184,.122],[.764,.041,.07]],gold,6);
      m.mantle([[.082,.075,.064],[.179,.146,.1],[.435,.189,.150],[.657,.152,.121],[.718,.045,.065]],wine,6);
      m.ball(0,.442,.121,.119,.124,.071,ink);
      visor(m,0,.454,.178,.065);
      m.gem(0,.641,.124,.064,.065,.023,lightGold);
      m.gem(0,.444,-.112,.112,.213,.079,0x674861);
      for(const t of [-1,0,1])m.rod([t*.058,.31,-.139],[t*.064,.55,-.149],.011,gold);
      for(const s of sides){
        m.leaf([s*.14,.579,0],[s*.202,.345,-.048],[s*.255,.075,-.095],.086,lilac);
        m.gem(s*.276,.310,.023,.097,.089,.079,gold,[0,0,s*.6]);
        m.gem(s*.28,.318,.075,.068,.057,.06,iron);
      }
      blades(m,0,.698,-.115,.184,lightGold,4);
    }else if(kind==='hexer'||kind==='host'){
      const host=kind==='host', cloth=host?0x9c5077:violet,trim=host?0xf1b780:gold;
      coat(m,cloth,trim,.285);hood(m,0,.652,.008,.195,host?0x794968:0x79608e,trim,host);
      if(host){blades(m,0,.787,-.128,.13,lightGold);m.ball(0,.335,.171,.057,.082,.040,violet);}
      else {
        m.tube([[0,.757,-.026],[.105,.834,-.098],[.207,.810,-.124]],[.143,.093,.025],0x795591,10);
        bandedStaff(m,-.294,.795);
      }
      for(const s of sides){
        m.tube([[s*.145,.54,.0],[s*.239,.455,.062],[s*.304,.493,.112]],[.078,.068,.037],cloth);
        m.ball(s*.31,.51,.123,.048,.041,.047,host?ivory:horn);
        for(const f of [-1,1])m.rod([s*.307+f*.016,.515,.133],[s*.319+f*.028,.549,.147],.012,horn,.008);
      }
      if(host){
        m.rod([-.31,.49,.12],[-.31,.32,.12],.012,gold);m.mantle([[.175,.065,.055,-.31,.12],[.205,.084,.065,-.31,.12],[.305,.065,.051,-.31,.12]],gold,6);
        m.ball(-.31,.251,.157,.040,.044,.032,0xffcc6d);
      }
    }else{
      const mirror=kind==='reflection';
      if(mirror){
        coat(m,0x795e9c,0xc5b3df,.274);
        hood(m,0,.60,.023,.172,0x594c7c,0xbdb1bd);
        for(let i=0;i<6;i++){
          const a=(i-2.5)*.59;
          m.gem(Math.sin(a)*.352,.64+Math.cos(a)*.26,-.104,.051,.09,.044,0xd1baf1,[0,0,-a]);
        }
        for(const s of sides)m.leaf([s*.11,.45,0],[s*.243,.36,-.025],[s*.302,.15,.012],.077,0xd1bce1);
      }else{
        blades(m,0,.431,-.011,.268,lightGold);
        m.gem(0,.435,.01,.156,.234,.116,gold);
        visor(m,0,.43,.096,.095,fire);
        m.ball(0,.448,-.09,.085,.116,.109,wine);
        m.gem(0,.45,-.187,.047,.089,.046,gold);
        for(const s of sides){
          m.leaf([s*.069,.29,.002],[s*.113,.20,-.018],[s*.1,.057,-.033],.063,wine);
          m.leaf([s*.17,.361,0],[s*.278,.35,-.018],[s*.409,.316,-.029],.048,gold);
        }
        m.gem(0,.738,-.012,.058,.147,.053,lightGold);
        m.gem(0,.094,-.016,.035,.086,.03,gold);
      }
    }
  }
  function ringblade(m){
    m.ball(0,.432,0,.239,.253,.225,0xb1635f);
    m.ring(0,.57,0,.248,.235,.192,horn,[Math.PI*.47,0,-.08]);
    m.ring(0,.30,0,.295,.29,.185,gold,[Math.PI*.47,.12,.10]);
    for(let i=0;i<6;i++){
      const a=tau*i/6,dx=Math.sin(a),dz=Math.cos(a);
      m.leaf([dx*.207,.28,dz*.207],[dx*.30+dz*.035,.298,dz*.30-dx*.035],[dx*.38+dz*.15,.32,dz*.38-dx*.15],.05,ivory);
    }
    visor(m,0,.445,.203,.084);m.gem(0,.681,0,.092,.076,.088,gold);m.gem(0,.163,0,.082,.12,.082,gold);
  }
  function stoneguard(m){
    m.ball(0,.352,0,.269,.235,.263,0x8b8774);m.ball(0,.401,.145,.207,.17,.184,0xa8a18a);
    m.eyes(.428,.3,.1,.053,lightGold,-.20);
    for(let j=0;j<3;j++)for(const s of sides){
      m.gem(s*(.083+j*.034),.54-j*.044,.13-j*.145,.123,.171,.154,[0x9aab74,0xb9b4a0,0x77835d][j],[.32,s*.18,s*.23]);
    }
    for(const s of sides){m.foot(s*.161,.075,.087,.125,0x7a766c);m.ball(s*.204,.273,.087,.116,.169,.118,0x827768);}
    const shield=(w,y,z,col)=>m.tube([[.235,y-.189,z],[.235,y-.034,z+.007],[.235,y+.114,z],[.235,y+.178,z]],[w*.14,w,w*.95,w*.30],col,8,[.025,.050,.046,.022]);
    shield(.174,.334,.276,gold);shield(.145,.338,.303,0x706859);shield(.105,.338,.334,0x968c72);
    m.gem(.235,.338,.374,.073,.089,.025,lightGold);
  }
  function flower(m,royal=false){
    const y=royal?.58:.40, pink=royal?0xe995af:0xc7527e;
    m.ball(0,y,0,.226,.235,.218,pink);
    for(let tier=0;tier<(royal?3:2);tier++){
      const pieces=royal?8:6;
      for(let i=0;i<pieces;i++){
        const a=tau*(i+tier*.45)/pieces, dx=Math.sin(a),dz=Math.cos(a);
        const edge=(royal?.392:.304)-tier*.047;
        const low=y-.181+tier*.092-(royal?Math.max(0,dz)*(.11+tier*.035):0);
        m.leaf([dx*.108,low,dz*.108],[dx*edge,low+.129,dz*edge],[dx*(edge+.027),low+.264,dz*(edge+.027)],royal?.100:.105,tier%2?0xf5b0c6:pink);
        if(tier===0)m.leaf([dx*.083,.123,dz*.083],[dx*edge,.12,dz*edge],[dx*(edge+.049),.165,dz*(edge+.049)],.095,teal);
      }
    }
    if(royal){
      m.mantle([[.058,.212,.182],[.162,.159,.145],[.35,.111,.099],[.532,.143,.118]],0x7c9c77,12,.07,4);
      hood(m,0,.715,.17,.125,0xf3bec5,lightGold,true);
      crown(m,0,.812,.126,.113,6);
      for(const s of sides){
        m.tube([[s*.146,.386,.016],[s*.262,.434,.047],[s*.319,.531,.121]],[.045,.033,.018],teal);
        m.ball(s*.334,.545,.133,.047,.057,.044,0xf4afbd);
        for(let q=0;q<2;q++)m.ball(s*(.248+q*.051),.106,.155-q*.14,.084,.089,.077,0xe29fae);
      }
    }else{
      m.rod([0,.385,.121],[0,.395,.307],.085,0xae6478,.122);m.ring(0,.396,.317,.123,.101,.101,0xf3b2bf);
      m.ball(0,.395,.324,.088,.069,.021,0x693747);m.ball(0,.395,.345,.036,.028,.014,0xfcbb86);
      for(const s of sides)m.foot(s*.135,.065,.045,.076,0x628755,false);
    }
  }
  function vine(m){
    const knots=[[-.21,.093,.17],[.018,.105,.217],[.19,.127,.112],[.22,.18,-.102],[.06,.292,-.18],[-.076,.43,-.058],[-.04,.493,.10]];
    m.tube(knots,[.012,.055,.088,.115,.105,.078,.084],0x507b57,9);
    for(let i=1;i<6;i++){const [x,y,z]=knots[i];m.leaf([x,y,z],[x+(i%2?.098:-.095),y+.052,z-.032],[x+(i%2?.151:-.146),y+.119,z-.052],.062,i%2?0x7b9c58:teal);}
    m.ball(-.035,.52,.152,.132,.105,.149,0x779951);
    m.eyes(.536,.274,.067,.041,lightGold,-.26);
    for(const s of sides){
      m.tube([[s*.062-.035,.48,.251],[s*.065-.035,.42,.287],[s*.057-.035,.386,.29]],[.024,.017,.002],horn,6);
      m.leaf([s*.056-.035,.58,.118],[s*.125-.035,.698,.105],[s*.189-.035,.75,.057],.073,fresh);
    }
  }
  function jelly(m,bishop=false){
    const y=bishop?.66:.49,blue=bishop?0x6e91be:0x74bae0;
    m.mantle([[y-.028,.311,.278],[y+.036,.326,.296],[y+.137,.264,.247],[y+.202,.157,.149],[y+.227,.035,.045]],blue,24,.022,6);
    m.mantle([[y-.059,.292,.26],[y-.021,.332,.293],[y+.006,.32,.282]],0xbbe9f2,24,.060,6);
    for(let i=0;i<(bishop?10:8);i++){
      const a=tau*i/(bishop?10:8),x=Math.sin(a),z=Math.cos(a),ex=Math.sin(a+.46),ez=Math.cos(a+.46);
      m.tube([[x*.142,y-.02,z*.132],[x*.181,y-.151,z*.158],[ex*.115,y-.283,ez*.13],[ex*.218,y-.398-(i%2)*.059,ez*.17]],[.047,.052,.03,.006],i%2?0xc2dff3:0x84b5de,7);
      if(bishop)m.leaf([x*.12,y-.045,z*.12],[x*.23,y-.208,z*.22],[ex*.271,y-.292,ez*.243],.069,i%2?0x6884bc:0xc0d8f5);
    }
    m.ball(0,y-.09,.128,.109,.077,.068,0x465a86);
    m.eyes(y-.079,.179,.049,.023,lightGold);
    m.ring(0,y+.097,.253,.073,.061,.041,lightGold,[.12,0,0]);
    m.gem(0,y+.082,.289,.02,.034,.011,ivory);
    if(bishop){
      blades(m,0,y+.189,-.093,.171);bandedStaff(m,-.394,y+.09);m.gem(0,y+.223,0,.055,.102,.048,lightGold);
      for(const s of sides){
        m.leaf([s*.104,y-.023,.084],[s*.177,y-.175,.125],[s*.28,y-.324,.062],.081,0xb7cce8);
        m.tube([[s*.151,y-.079,-.088],[s*.248,y-.211,-.147],[s*.263,y-.312,-.194],[s*.339,y-.343,-.244]],[.067,.065,.041,.004],0x708bb3,7);
        m.tube([[s*.083,y+.191,0],[s*.159,y+.117,.131],[s*.206,y+.041,.183]],[.017,.011,.008],lightGold,6);
      }
      m.gem(0,y-.153,.178,.045,.077,.037,horn);
    }
  }
  function coral(m){
    m.ball(0,.158,0,.27,.15,.207,0xdebec2);
    for(let i=0;i<5;i++){const a=(i-2)*.29;m.leaf([0,.093,.046],[Math.sin(a)*.236,.17,.147],[Math.sin(a)*.337,.268,.114],.072,ivory);}
    for(const s of sides)for(let j=0;j<2;j++){
      const x=s*(.095+j*.078),z=-.075*j;
      m.tube([[x,.13,z],[x*1.42,.327,z-.012],[x*1.95,.446+j*.081,z+.015],[x*2.10,.523+j*.11,z+.042]],[.063,.052,.046,.026],j?0xce748f:0xe9939e,7);
      m.tube([[x*1.48,.344,z],[x*2.01,.366,z-.05],[x*2.31,.43,z-.051]],[.047,.036,.021],0xe395a0);
    }
    for(const t of [-1,0,1]){
      const x=t*.095,y=.287+(t===0?.038:0);
      m.rod([x,y-.051,.047],[x,y,.212],.063,gold,.07);
      m.ball(x,y,.215,.052,.049,.015,ink);
    }
  }
  function rivets(m,x,y,z,width,height,color=lightGold){
    for(const a of sides)for(const b of sides)m.ball(x+a*width,y+b*height,z,.019,.019,.015,color);
  }
  function boiler(m,kind){
    const foreman=kind==='foreman', flying=kind==='steamer';
    const plate=foreman?0xa34e55:flying?0x5b6178:0xb87a52, seat=foreman?0x613b49:iron;
    const width=foreman?.259:.205;
    m.ball(0,.472,-.028,width,.202,.168,seat);
    m.mantle([[.301,width*.70,.139],[.354,width,.175],[.585,width*.96,.17],[.64,width*.68,.14]],plate,10);
    m.mantle([[.321,width*.87,.159],[.354,width*1.015,.178]],gold,10);
    m.ball(0,.573,.071,.18,.135,.142,seat);
    m.mantle([[.545,.182,.145,0,.05],[.576,.188,.147,0,.05],[.687,.143,.125,0,.027],[.708,.065,.072,0,.027]],plate,12);
    m.block(0,.565,.195,.098,.034,.019,ink);m.eyes(.565,.21,.048,.032,fire);
    if(!flying){
      for(const s of sides){
        m.ball(s*.132,.24,-.012,.084,.108,.08,seat);m.ball(s*.134,.168,.02,.078,.064,.079,gold);
        m.block(s*.14,.106,.054,.107,.064,.107,plate);m.foot(s*.14,.057,.096,.105,gold,false);
        m.ball(s*.256,.504,-.01,.126,.131,.139,plate);
        m.ring(s*.286,.50,.097,.075,.077,.048,gold);
        m.tube([[s*.228,.482,-.006],[s*.324,.371,.027],[s*.352,.282,.091]],[.083,.068,.067],seat);
        m.block(s*.35,.262,.109,.079,.080,.088,plate);
        for(const f of [-1,0,1])m.ball(s*.35+f*.04,.225,.162,.022,.039,.033,gold);
      }
      for(const s of sides){
        const x=s*.103,h=foreman?(s===1?.783:.887):.749;
        m.rod([x,.55,-.10],[x,h,-.149],.051,seat,.047);m.ball(x,h-.018,-.149,.057,.035,.057,gold);
        m.ball(x,h+.005,-.15,.036,.012,.036,ink);
      }
      if(foreman){
        m.ball(0,.413,.155,.123,.119,.075,gold);m.ball(0,.411,.212,.095,.084,.026,fire);
        for(const d of [-1,0,1])m.block(d*.047,.414,.237,.011,.068,.014,iron);
        m.rod([-.33,.244,.114],[-.432,.36,.17],.034,gold);
        m.block(-.414,.319,.172,.136,.103,.093,seat,[0,.15,-.33]);
        m.block(-.433,.323,.239,.121,.087,.048,plate,[0,.15,-.33]);
        rivets(m,-.426,.325,.28,.069,.041);
      }else{
        m.block(-.308,.369,.154,.117,.148,.044,gold,[0,0,-.075]);
        m.block(-.307,.369,.196,.10,.128,.026,plate,[0,0,-.075]);rivets(m,-.307,.369,.224,.076,.101);
        m.gem(-.308,.372,.229,.056,.087,.023,lightGold);
        m.block(0,.424,.174,.107,.068,.027,gold);for(const t of [-1,0,1])m.block(t*.049,.424,.207,.012,.032,.006,ink);
      }
    }else{
      for(const s of sides){
        const x=s*.24;
        m.mantle([[.347,.061,.064,x,0],[.375,.097,.087,x,0],[.627,.092,.086,x,0],[.661,.060,.06,x,0]],gold,12);
        m.mantle([[.412,.098,.087,x,0],[.564,.095,.09,x,0]],0xe5a250,12);
        m.tube([[x,.623,0],[x,.738,-.027],[s*.129,.751,-.056],[s*.104,.638,-.076]],[.039,.040,.04,.036],seat);
      }
      m.rod([0,.427,.119],[0,.358,.323],.074,gold,.069);
      m.ball(0,.355,.329,.054,.043,.023,ink);
      m.ring(0,.275,-.025,.173,.141,.055,gold,[Math.PI/2,0,0]);m.gem(0,.208,-.012,.076,.105,.072,plate);
    }
  }
  function jesterHat(m,x,y,z,r,cloth){
    m.ball(x,y,z,r*.78,r*.48,r*.60,cloth);
    for(const s of sides){
      m.tube([[x+s*r*.26,y+r*.13,z],[x+s*r*.72,y+r*.50,z-.029],[x+s*r*1.04,y+r*.32,z-.055],[x+s*r*1.12,y+r*.002,z-.028]],
        [r*.37,r*.29,r*.16,.006],s===1?cloth:wine,9);
      m.ball(x+s*r*1.12,y-r*.025,z-.026,r*.125,r*.14,r*.123,lightGold);
    }
  }
  function puppet(m){
    const wood=0xd7a47e,coatCol=0x9d5268;
    m.gem(0,.447,0,.121,.136,.088,coatCol);m.ball(0,.303,0,.097,.068,.069,ink);
    for(const s of sides){
      const shoulder=[s*.123,.512,.006],elbow=[s*.208,.438,.001],wrist=[s*.253,.40,.06];
      m.ball(...shoulder,.043,.042,.041,gold);m.rod(shoulder,elbow,.027,wood);m.ball(...elbow,.038,.038,.038,gold);m.rod(elbow,wrist,.023,wood);m.ball(...wrist,.035,.047,.035,horn);
      for(const i of [-1,1])m.rod([wrist[0]+i*.012,.378,.074],[wrist[0]+i*.021,.343,.085],.011,horn,.008);
      const hip=[s*.067,.292,0],knee=[s*.118,.19,.042],ankle=[s*.143,.083,.012];
      m.rod(hip,knee,.033,coatCol);m.ball(...knee,.039,.037,.038,gold);m.rod(knee,ankle,.026,wood);
      m.tube([ankle,[s*.155,.055,.071],[s*.177,.074,.112]],[.034,.044,.009],wine);
      m.rod([s*.23,.44,-.019],[s*.205,.815,-.049],.007,gold,.005);
    }
    hood(m,0,.606,.002,.126,wood,wine,true);jesterHat(m,0,.687,-.010,.131,0x80517e);
    m.rod([-.207,.813,-.051],[.207,.813,-.051],.013,wood);
    m.gem(0,.467,.075,.036,.048,.022,lightGold);
  }
  function armoredLord(m){
    const steel=0x564b60, rust=0x905963;
    m.ball(0,.47,0,.266,.236,.196,steel);
    m.mantle([[.313,.193,.157],[.391,.241,.170],[.576,.256,.187],[.621,.165,.13]],rust,10);
    m.mantle([[.135,.224,.147],[.31,.195,.142],[.396,.172,.138]],wine,14,.089,5);
    for(const s of sides){
      m.ball(s*.148,.206,0,.093,.128,.085,steel);m.foot(s*.158,.077,.054,.123,steel,false);
      m.ball(s*.259,.536,.0,.153,.112,.15,gold);m.ball(s*.267,.557,0,.136,.102,.134,steel);
      m.tube([[s*.269,.51,0],[s*.311,.401,.026],[s*.344,.292,.106]],[.088,.071,.071],rust);
      for(let j=0;j<3;j++)m.ball(s*(.288+j*.019),.45-j*.065,.035+j*.024,.086,.047,.084,j===1?gold:steel);
      m.ball(s*.35,.254,.126,.091,.079,.09,steel);
      for(let j=0;j<3;j++)m.ball(s*.35+(j-1)*.042,.234,.180,.027,.042,.034,rust);
      m.tube([[s*.254,.614,-.01],[s*.303,.699,-.026],[s*.343,.746,-.033]],[.046,.033,.003],horn,7);
    }
    m.ball(0,.677,.023,.161,.135,.135,steel);
    m.block(0,.682,.139,.097,.044,.027,ink);m.eyes(.69,.16,.047,.031,0xff976b);
    for(const t of [-1,0,1])m.rod([t*.047,.663,.173],[t*.045,.604,.146],.011,gold,.012);
    crown(m,0,.775,0,.145,7);
    m.gem(0,.49,.173,.109,.123,.033,gold);m.gem(0,.49,.198,.070,.083,.022,rust);
    for(let j=0;j<7;j++)m.ring(.12+j*.031,.453-j*.034,.155+Math.sin(j*.44)*.03,.025,.029,.023,gold,[0,j*.75,0]);
    m.ring(.343,.224,.17,.041,.044,.033,gold);m.rod([.343,.198,.17],[.349,.081,.17],.022,lightGold);
    m.block(.369,.089,.169,.03,.013,.014,lightGold);m.block(.38,.111,.169,.018,.013,.014,lightGold);
  }
  function webWeaver(m){
    const emerald=0x549d72, bone=0xe2d3a9;
    m.ball(0,.442,-.146,.242,.243,.267,emerald);
    m.ball(0,.328,.125,.207,.155,.178,0x97896e);
    for(let i=0;i<7;i++){
      const a=tau*i/7,dx=Math.sin(a),dz=Math.cos(a);
      m.tube([[dx*.068,.678,-.145+dz*.077],[dx*.184,.610,-.145+dz*.199],[dx*.242,.483,-.145+dz*.264],[dx*.230,.361,-.145+dz*.252]],[.016,.013,.016,.008],bone,6);
      if(i%2===0)m.gem(dx*.154,.617,-.146+dz*.176,.04,.05,.04,0x8ece91);
    }
    for(const s of sides){
      for(let j=0;j<4;j++){
        const z=.185-j*.128,x=s*(.31+.034*Math.sin(j)),tip=s*(.41+.055*Math.sin(j));
        m.tube([[s*.126,.364,z],[x,.49+(j%2)*.036,z-.019],[tip,.28,z+.024],[s*(Math.abs(tip)+.03),.064,z+.101]],
          [.045,.046,.039,.004],bone,7);
        m.gem(x,.489+(j%2)*.036,z-.019,.05,.056,.054,0xb1ba95);
      }
      m.tube([[s*.091,.303,.227],[s*.101,.249,.284],[s*.075,.207,.32]],[.043,.029,.003],ivory,6);
    }
    m.gem(0,.372,.236,.103,.117,.07,bone);
    m.gem(0,.364,.29,.057,.073,.037,0x55b68b);
    m.eyes(.337,.28,.093,.041,0xfdcb5f);
  }
  function magmaLord(m){
    const rock=0x6e4553,hot=0xffae45, crust=0x946059;
    m.ball(0,.464,-.023,.263,.233,.195,hot);
    for(const s of sides){
      m.gem(s*.112,.524,.076,.166,.143,.155,rock,[.16,0,s*.23]);
      m.gem(s*.096,.378,.113,.100,.092,.124,crust);
      m.tube([[s*.217,.50,0],[s*.31,.407,.061],[s*.356,.234,.10]],[.119,.095,.117],hot);
      for(let j=0;j<3;j++)m.gem(s*(.281+j*.035),.472-j*.083,.059+j*.026,.139-j*.008,.118,.122,j===1?crust:rock,[.12,j*.26,s*.13]);
      m.ball(s*.37,.213,.126,.119,.103,.115,rock);
      for(const k of [-1,0,1])m.gem(s*.37+k*.054,.198,.20,.039,.049,.055,crust);
      m.ball(s*.123,.223,-.015,.105,.143,.103,rock);m.foot(s*.143,.077,.038,.127,crust);
      m.tube([[s*.115,.665,-.012],[s*.19,.739,-.032],[s*.219,.826,-.095]],[.060,.038,.003],rock,7);
    }
    m.ball(0,.639,.034,.161,.132,.137,rock);m.eyes(.64,.154,.075,.047,fire,-.26);
    m.gem(0,.574,.162,.069,.037,.026,hot);
    for(let i=0;i<8;i++){
      const a=tau*i/8,x=Math.sin(a)*.109,z=-.057+Math.cos(a)*.091,h=.82+.12*(1+Math.sin(i*2.4))*.5;
      m.tube([[x,.713,z],[x*1.34,.784,z-.028],[x*.64+.032,h,z-.101]],[.069,.042,.003],i%2?0xf37a3c:hot,7);
    }
    m.gem(0,.423,.189,.056,.076,.029,hot);
  }
  function theatreLord(m,finale){
    const fabric=finale?0x65466f:0x954767, contrast=finale?0xae6685:0xba666d;
    coat(m,fabric,gold,finale?.309:.282);
    m.mantle([[.07,finale?.36:.334,.245,0,-.046],[.22,.295,.20,0,-.056],[.498,.19,.154,0,-.068],[.622,.17,.079,0,-.056]],contrast,28,.10,7);
    for(const s of sides){
      m.tube([[s*.146,.552,-.015],[s*.252,.496,-.02],[s*.315,.47,.08]],[.066,.058,.038],gold);
      m.ball(s*.314,.479,.093,.055,.046,.046,ivory);
      m.leaf([s*.133,.567,-.017],[s*.277,.377,-.057],[s*.385,.17,.029],.10,fabric);
      m.leaf([s*.176,.521,-.067],[s*.298,.343,-.095],[s*.354,.201,-.104],.044,gold);
      if(!finale){
        m.rod([s*.312,.453,.107],[s*.310,.26,.118],.007,lightGold);
        m.ball(s*.310,.247,.116,.029,.027,.024,ivory);
        m.gem(s*.310,.216,.116,.028,.042,.025,wine);
        for(const k of sides)m.rod([s*.31+k*.014,.193,.116],[s*.31+k*.022,.161,.12],.008,gold);
      }else{
        m.leaf([s*.205,.531,-.023],[s*.329,.464,-.045],[s*.434,.335,-.072],.088,0xc6a6cf);
      }
    }
    hood(m,0,.664,.036,.139,finale?0xc084a1:0x6c415e,gold,true);
    for(let i=0;i<3;i++)m.gem(0,.52-i*.111,.160,.047+ i*.007,.063,.025,i%2?contrast:lightGold);
    if(finale){
      blades(m,0,.725,-.15,.229,lightGold,8);
      for(const s of sides)m.leaf([s*.054,.68,.102],[s*.109,.746,.079],[s*.146,.78,.012],.044,ivory);
      m.gem(0,.773,.092,.035,.061,.026,lightGold);
    }else{
      jesterHat(m,0,.763,-.024,.173,wine);
      m.tube([[.049,.76,-.041],[.132,.883,-.066],[.219,.924,-.108],[.278,.882,-.12]],[.029,.056,.038,.004],0xb95370,7);
      bandedStaff(m,-.37,.526);m.gem(0,.57,.104,.074,.065,.04,gold);
    }
  }
  function voidKing(m){
    coat(m,0x5e477c,0xbc924f,.262);
    for(let i=0;i<5;i++){const a=tau*i/5,x=Math.sin(a),z=Math.cos(a);
      m.leaf([x*.115,.36,z*.103],[x*.139,.19,z*.126],[x*.095+.029,.032,z*.103],.055,lilac);
    }
    hood(m,0,.667,0,.149,0x4d436b,gold);
    blades(m,0,.763,-.093,.165,lightGold,7);
    for(const s of sides){
      m.leaf([s*.107,.586,0],[s*.212,.608,-.01],[s*.293,.647,-.031],.078,lilac);
      m.ball(s*.267,.402,.023,.09,.103,.086,iron);
      for(let j=0;j<3;j++)m.tube([[s*(.224+j*.042),.392,.062],[s*(.233+j*.043),.337,.091],[s*(.217+j*.044),.308,.128]],[.024,.021,.008],j===1?lightGold:horn,6);
    }
    m.gem(0,.515,.169,.063,.084,.028,lightGold);m.gem(0,.51,.188,.037,.055,.018,lilac);
  }
  const creatures={
    stalker:m=>quadruped(m),shooter:m=>caster(m,'shooter'),charger:m=>quadruped(m,false,true),bomber:bomb,
    splitter:m=>slime(m,true),spawnling:m=>slime(m,false),leaper:m=>quadruped(m,true),hexer:m=>caster(m,'hexer'),
    warden:stoneguard,sniper:m=>caster(m,'sniper'),orbitter:ringblade,reflection:m=>caster(m,'reflection'),
    bloomer:m=>flower(m),vine_lurker:vine,jelly:m=>jelly(m),coral,mech:m=>boiler(m,'mech'),steamer:m=>boiler(m,'steamer'),
    puppet,host:m=>caster(m,'host')
  };
  const lords=[armoredLord,webWeaver,magmaLord,voidKing,m=>flower(m,true),m=>jelly(m,true),m=>boiler(m,'foreman'),m=>theatreLord(m,false),m=>theatreLord(m,true)];
  globalThis.newSculptedEnemy=function(kind,zoneIndex=0,finale=false){
    const boss=kind==='boss',key=boss?(finale?'bosses/finale':'bosses/zone'+zoneIndex):'mobs/'+kind;
    let geometry=models.get(key);
    if(!geometry){
      const model=new Sculpture(), sculpt=boss?lords[finale?8:zoneIndex]:creatures[kind];
      if(!sculpt)throw new Error('没有对应的怪物造型：'+key);
      sculpt(model);geometry=model.finish();geometry.name=key;models.set(key,geometry);
    }
    skin ??= new THREE.MeshStandardMaterial({vertexColors:true,roughness:.80,metalness:.08});
    const body=new THREE.Mesh(geometry,skin);body.name=key;
    const group=new THREE.Group();group.name=key;group.add(body);
    return group;
  };
})();
