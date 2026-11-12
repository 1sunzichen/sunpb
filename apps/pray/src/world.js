import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { START, SHRINE, findPath, moveStep, floorHeight, zoneAt } from './navigation.js';

export function createWorld(container, callbacks={}) {
  const scene=new THREE.Scene(); scene.background=new THREE.Color('#e9eddf');scene.fog=new THREE.FogExp2('#e9eddf',.013);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  renderer.domElement.setAttribute('aria-label','三维寺院场景');container.append(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(38,1,.1,160);camera.position.set(25,23,31);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,1,-.6);controls.enableDamping=true;controls.dampingFactor=.065;controls.enablePan=false;controls.minDistance=12;controls.maxDistance=61;controls.minPolarAngle=.22;controls.maxPolarAngle=Math.PI/2-.14;controls.autoRotate=false;controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_ROTATE;
  const hemi=new THREE.HemisphereLight('#fff2d7','#768776',2.6);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#ffe3aa',3.5);sun.position.set(-15,24,14);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-23;sun.shadow.camera.right=23;sun.shadow.camera.top=24;sun.shadow.camera.bottom=-23;sun.shadow.normalBias=.045;sun.shadow.bias=-.00015;sun.shadow.camera.far=80;sun.shadow.radius=3;scene.add(sun);
  const fill=new THREE.DirectionalLight('#b6d4c8',.6);fill.position.set(12,9,-14);scene.add(fill);
  const materials={};
  function mat(color,opts={}){const key=color+JSON.stringify(opts);return materials[key]??=new THREE.MeshStandardMaterial({color,roughness:.88,...opts});}
  const M={stone:mat('#c5c6ae'),stoneLight:mat('#dbd4bc'),stoneDark:mat('#969d87'),red:mat('#92503e'),redLight:mat('#b06a4c'),wood:mat('#654c35'),gold:mat('#b89a51',{metalness:.3,roughness:.48}),roof:mat('#3d6359'),roofRib:mat('#527166'),grass:mat('#aab795'),earth:mat('#8d997a'),dark:mat('#293d35'),cream:mat('#ead9ae'),water:mat('#809f91',{metalness:.45,roughness:.22}),leaf:mat('#bcad58'),leafLight:mat('#cbbb65')};
  const shadow=(mesh)=>{mesh.castShadow=true;mesh.receiveShadow=true;return mesh;};
  function mesh(geo,material,parent=scene,x=0,y=0,z=0){const o=shadow(new THREE.Mesh(geo,material));o.position.set(x,y,z);parent.add(o);return o;}
  const cubeGeo=new THREE.BoxGeometry(1,1,1);
  function box(w,h,d,material,parent=scene,x=0,y=0,z=0){const o=mesh(cubeGeo,material,parent,x,y,z);o.scale.set(w,h,d);return o;}
  function sphere(r,material,parent=scene,x=0,y=0,z=0,sx=1,sy=1,sz=1,detail=1){const o=mesh(new THREE.IcosahedronGeometry(r,detail),material,parent,x,y,z);o.scale.set(sx,sy,sz);return o;}
  function cyl(top,bottom,h,material,parent=scene,x=0,y=0,z=0,segments=12){return mesh(new THREE.CylinderGeometry(top,bottom,h,segments),material,parent,x,y,z);}
  function beam(a,b,r,material,parent=scene){const delta=new THREE.Vector3().subVectors(b,a);const o=cyl(r,r,delta.length(),material,parent);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return o;}
  let seed=15;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
  function textureText(text,width=512,height=128,color='#ebd19b',background='#35453c',size=72){const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,width,height);ctx.strokeStyle=color;ctx.lineWidth=3;ctx.strokeRect(12,12,width-24,height-24);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${size}px "Noto Serif SC", "Songti SC", serif`;ctx.fillText(text,width/2,height/2+4);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
  function sign(text,w,h,parent,x,y,z){const m=new THREE.MeshStandardMaterial({map:textureText(text),roughness:.9});return mesh(new THREE.BoxGeometry(w,h,.12),[M.wood,M.wood,M.wood,M.wood,m,M.wood],parent,x,y,z);}
  function roof(width,depth,y,height,parent,fade=false){
    const group=new THREE.Group();parent.add(group);const hw=width/2,hd=depth/2;
    const surface=(x,z)=>{const u=Math.max(Math.abs(z)/hd,Math.max(0,(Math.abs(x)-(hw-hd))/hd));return y+height*Math.pow(1-u,1.5)+.25*Math.pow(u,8)+.32*Math.pow(Math.abs(x)/hw,7)*Math.pow(Math.abs(z)/hd,7);};
    const geo=new THREE.PlaneGeometry(width,depth,32,22);geo.rotateX(-Math.PI/2);const p=geo.attributes.position;
    for(let i=0;i<p.count;i++)p.setY(i,surface(p.getX(i),p.getZ(i)));geo.computeVertexNormals();
    const roofMat=fade?M.roof.clone():M.roof;roofMat.side=THREE.DoubleSide;mesh(geo,roofMat,group);
    const ribs=[];
    for(let x=-hw+.12;x<=hw;x+=.36){const points=[];for(let n=0;n<=22;n++){const z=-hd+2*hd*n/22;points.push(new THREE.Vector3(x,surface(x,z)+.035,z));}ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,.035,5,false));}
    const ribMat=fade?M.roofRib.clone():M.roofRib;mesh(mergeGeometries(ribs),ribMat,group);ribs.forEach(g=>g.dispose());
    for(const z of [-hd,hd]){const pts=[];for(let i=0;i<=30;i++){const x=-hw+i*width/30;pts.push(new THREE.Vector3(x,surface(x,z)-.07,z));}mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),30,.075,6,false),fade?M.gold.clone():M.gold,group);}
    beam(new THREE.Vector3(-hw+hd-.3,y+height+.1,0),new THREE.Vector3(hw-hd+.3,y+height+.1,0),.12,fade?M.gold.clone():M.gold,group);
    for(const side of [-1,1]){const x=side*(hw-hd+.3);const finial=mesh(new THREE.TorusGeometry(.25,.065,6,16,Math.PI*1.4),fade?M.gold.clone():M.gold,group,x,y+height+.28,0);finial.rotation.y=Math.PI/2;}
    return group;
  }
  // A compact, sculpted landscape. Far hills blend into the same mist as the page.
  box(39,.8,43,M.earth,scene,0,-.55,0);box(38,.2,42,M.grass,scene,0,-.1,0);
  for(let i=0;i<22;i++){const angle=2*Math.PI*i/22;const x=Math.cos(angle)*27,z=Math.sin(angle)*27-7;if(z>9)continue;const r=6+rand()*5;sphere(r,mat(i%2?'#a5b7a0':'#b9c7af'),scene,x,-1,z,1,.7+rand()*.9,1,1);}
  for(let i=0;i<22;i++){const x=(rand()-.5)*35,z=(rand()-.5)*38;if(Math.abs(x)<12&&z>-12&&z<16)continue;sphere(1+rand()*2,M.stoneDark,scene,x,-.5,z,1,.5,1,0);}
  box(23,.14,27,M.stone,scene,0,-.02,1.5);
  const paving=[];for(let x=-10.6;x<11;x+=1.42)for(let z=-10.9;z<15;z+=1.42){if(Math.abs(x)>3.2&&rand()>.52)continue;const g=new THREE.BoxGeometry(1.36,.035,1.36);g.translate(x,.07,z);paving.push(g);}mesh(mergeGeometries(paving),M.stoneLight);paving.forEach(g=>g.dispose());
  for(let z=-1.3;z<14.9;z+=1.27){box(2.8,.07,1.17,M.stoneLight,scene,0,.11,z);box(.035,.08,1.17,M.stoneDark,scene,0,.11,z);}
  // Perimeter walls and a real open gate.
  function wall(w,x,z,rotate=false){const g=new THREE.Group();g.position.set(x,0,z);if(rotate)g.rotation.y=Math.PI/2;scene.add(g);box(w,1.6,.35,mat('#dbd9bc'),g,0,.8,0);box(w+.1,.2,.55,M.roof,g,0,1.65,0);box(w,.2,.46,M.stoneDark,g,0,.15,0);return g;}
  wall(7.8,-7.7,8.5);wall(7.8,7.7,8.5);wall(23,0,-11.7);wall(20,-11.6,-1.5,true);wall(20,11.6,-1.5,true);
  const gate=new THREE.Group();gate.position.z=8.5;scene.add(gate);
  for(const x of [-3.3,3.3]){cyl(.22,.27,3.8,M.red,gate,x,1.9,0);cyl(.4,.45,.35,M.stoneDark,gate,x,.17,0);box(.55,.3,.62,M.gold,gate,x,3.5,0);}
  box(7.5,.45,.6,M.red,gate,0,3.8,0);roof(8.7,3.2,4,1.15,gate);sign('云 栖 寺',2.35,.75,gate,0,3.38,.4);
  const lanterns=[];
  function lantern(x,y,z,parent=scene,scale=1){const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);parent.add(g);cyl(.025,.025,.45,M.wood,g,0,.55,0,6);const glow=mat('#c56741',{emissive:'#aa3b15',emissiveIntensity:.18});const b=mesh(new THREE.SphereGeometry(.37,12,8),glow,g);b.scale.set(1,1.25,1);cyl(.21,.21,.08,M.gold,g,0,.43,0);cyl(.18,.18,.09,M.gold,g,0,-.43,0);cyl(.035,.035,.4,M.redLight,g,0,-.65,0,6);lanterns.push(g);return g;}
  lantern(-2.55,2.65,.3,gate);lantern(2.55,2.65,.3,gate);
  // Main hall: doors stay open, the player walks up the steps and into the interior.
  const temple=new THREE.Group();temple.position.z=-7;scene.add(temple);
  box(13,.62,9.1,M.stoneDark,temple,0,.31,0);box(13.2,.16,9.3,M.stoneLight,temple,0,.7,0);
  for(let i=0;i<4;i++)box(5.2-i*.08,.18*(i+1),.4,M.stoneLight,scene,0,.09*(i+1),-1.95-i*.36);
  box(11.9,.08,8.1,mat('#b79b6e'),temple,0,.81,0);
  const wallmat=mat('#9e644b');box(12,3.7,.3,wallmat,temple,0,2.55,-4);box(.32,3.7,8,wallmat,temple,-6,2.55,0);box(.32,3.7,8,wallmat,temple,6,2.55,0);
  for(const x of [-5.65,-2.75,2.75,5.65]){cyl(.22,.28,3.9,M.red,temple,x,2.65,3.9);cyl(.34,.38,.3,M.stoneDark,temple,x,.92,3.9);cyl(.32,.3,.23,M.gold,temple,x,4.5,3.9);box(.8,.18,.8,M.redLight,temple,x,4.55,3.9);}
  box(12.5,.36,.4,M.red,temple,0,4.55,4);box(12.5,.3,.45,M.redLight,temple,0,4.15,4);
  for(const x of [-4.3,4.3]){box(2.7,2.9,.18,M.dark,temple,x,2.35,3.95);for(let k=0;k<7;k++)box(.055,2.75,.21,M.gold,temple,x-1.25+k*.42,2.4,4.08);for(let k=0;k<5;k++)box(2.65,.05,.23,M.wood,temple,x,1.1+k*.6,4.1);}
  const templeRoofs=[];templeRoofs.push(roof(14.8,10.7,4.7,2.1,temple,true));
  const upper=new THREE.Group();temple.add(upper);box(9.7,1.15,4.5,M.red,upper,0,6.5,-.1);
  for(let x=-4.5;x<5;x+=.8)box(.09,.7,4.6,M.gold,upper,x,6.65,-.1);
  templeRoofs.push(roof(11.6,6.7,7,1.5,temple,true));templeRoofs.push(upper);
  sign('祈 愿 殿',3.2,.78,temple,0,4.1,4.28);
  lantern(-1.95,3.28,4.5,temple,.9);lantern(1.95,3.28,4.5,temple,.9);
  for(const x of [-2.67,2.67]){const plaque=mesh(new THREE.BoxGeometry(.33,2.65,.08),new THREE.MeshStandardMaterial({map:textureText(x<0?'心 诚 即 至':'愿 有 所 成',128,768,'#ead4a0','#733f2e',55),roughness:1}),temple,x,2.6,4.15);plaque.userData.decorative=true;}
  // A calm seated figure, lotus pedestal, lamps, and a prayer cushion.
  const altar=new THREE.Group();altar.position.set(0,.84,-2.3);temple.add(altar);box(3.2,.65,1.6,M.red,altar,0,.32,0);box(3.4,.12,1.7,M.gold,altar,0,.7,0);
  const sacred=mat('#c6a253',{metalness:.42,roughness:.4});cyl(.73,.9,.3,sacred,altar,0,.9,-.15,24);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;const petal=sphere(.25,sacred,altar,Math.cos(a)*.7,1.05,Math.sin(a)*.55-.15,.7,.6,1.5,1);petal.rotation.y=-a;}
  sphere(.65,sacred,altar,0,1.3,-.15,1.15,.45,.8,2);sphere(.55,sacred,altar,0,1.78,-.25,.8,1.2,.65,2);sphere(.36,sacred,altar,0,2.55,-.22,1,1.12,.9,2);sphere(.28,mat('#705b36'),altar,0,2.8,-.25,1,.6,.9,2);sphere(.1,sacred,altar,0,3,-.25,1,1,1,1);
  for(const s of [-1,1]){const arm=sphere(.3,sacred,altar,s*.4,1.8,.03,.6,1.45,.6,1);arm.rotation.z=s*.45;sphere(.19,sacred,altar,s*.12,1.91,.26,.6,1.2,.7,1);}
  const halo=mesh(new THREE.TorusGeometry(1.03,.045,8,64),M.gold,altar,0,2.14,-.57);halo.rotation.y=0;
  for(const x of [-1.25,1.25]){cyl(.14,.2,.24,M.gold,altar,x,.85,.4);cyl(.08,.08,.34,mat('#e8d3a2'),altar,x,1.1,.4);sphere(.075,mat('#fff1b2',{emissive:'#ffb94a',emissiveIntensity:1.6}),altar,x,1.33,.4,.6,1.7,.6);}
  const hallLight=new THREE.PointLight('#ffd58b',14,9,2);hallLight.position.set(0,3,-7);scene.add(hallLight);
  const cushion=cyl(.7,.75,.2,mat('#9d6046'),scene,0,.85,-6.15,32);cyl(.57,.57,.025,M.gold,scene,0,.96,-6.15,32);
  // Incense burner in the courtyard.
  const burner=new THREE.Group();burner.position.set(0,0,.2);scene.add(burner);const bronze=mat('#6c7964',{metalness:.45,roughness:.6});
  for(const a of [0,2.094,4.188])cyl(.1,.16,.55,bronze,burner,Math.cos(a)*.45,.3,Math.sin(a)*.45);
  cyl(.7,.45,.65,bronze,burner,0,.82,0,24);cyl(.73,.73,.12,M.gold,burner,0,1.17,0,24);cyl(.62,.62,.035,mat('#7f745b'),burner,0,1.24,0,24);
  for(const x of [-.19,0,.19]){cyl(.018,.018,.7,M.red,burner,x,1.58,0,6);sphere(.026,mat('#efb764',{emissive:'#f1a142',emissiveIntensity:2}),burner,x,1.94,0);}
  for(const x of [-.8,.8]){const handle=mesh(new THREE.TorusGeometry(.23,.065,6,14),bronze,burner,x,1.03,0);handle.rotation.y=Math.PI/2;}
  const smoke=[];const smokeMat=new THREE.MeshBasicMaterial({color:'#e5e2cf',transparent:true,opacity:.13,depthWrite:false});for(let i=0;i<14;i++){const p=mesh(new THREE.SphereGeometry(.1,6,5),smokeMat,burner);p.castShadow=false;p.userData.phase=i/14;smoke.push(p);}
  // Water garden, stepping stones and tiny lotus leaves.
  box(5.7,.12,5.3,M.stoneDark,scene,-7.7,.1,1.1);box(5.3,.09,4.9,M.water,scene,-7.7,.18,1.1);
  for(let i=0;i<12;i++){const x=-10+rand()*4.5,z=-1+rand()*4;const leaf=cyl(.23,.23,.025,mat('#557b5b'),scene,x,.26,z,14);leaf.rotation.z=(rand()-.5)*.07;if(i%3===0){sphere(.12,mat('#d7a69a'),scene,x,.31,z,1,.65,1,1);}}
  for(let i=0;i<5;i++)sphere(.5,M.stoneDark,scene,-10+rand()*4.7,.22,-1.3+rand()*4.7,1,.4,1,0);
  // Small pavilion on the right of the courtyard.
  const pavilion=new THREE.Group();pavilion.position.set(8,0,1);scene.add(pavilion);box(3.3,.25,3.3,M.stoneLight,pavilion,0,.14,0);
  for(const x of [-1.25,1.25])for(const z of [-1.25,1.25])cyl(.11,.15,2.9,M.wood,pavilion,x,1.6,z);
  roof(4.2,4.2,3.1,1.2,pavilion);box(2.6,.15,.5,M.wood,pavilion,0,.8,-1.15);lantern(0,2.25,0,pavilion,.65);
  function pine(x,z,scale=1){const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);scene.add(g);cyl(.12,.28,3.9,M.wood,g,0,1.9,0,7);for(let j=0;j<3;j++){const a=j*2.5+.4;beam(new THREE.Vector3(0,2+j*.5,0),new THREE.Vector3(Math.cos(a)*1.2,3.2+j*.5,Math.sin(a)),.08,M.wood,g);sphere(1.2,mat(j%2?'#5e7b5e':'#708963'),g,Math.cos(a)*.7,3+j*.65,Math.sin(a)*.6,1.5,.45,1.1,1);}sphere(.9,mat('#81966d'),g,0,4.4,0,1,.6,1,1);}
  function ginkgo(x,z,scale=1){const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);scene.add(g);cyl(.15,.3,4.8,M.wood,g,0,2.4,0,7);for(let i=0;i<8;i++){const a=i*2.4,r=.5+rand()*1.3,y=3.5+rand()*2;beam(new THREE.Vector3(0,2.5,0),new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r),.07,M.wood,g);sphere(1.15,i%2?M.leaf:M.leafLight,g,Math.cos(a)*r,y,Math.sin(a)*r,1.2,.8,1,1);}cyl(1.8,1.8,.16,M.stoneDark,g,0,.12,0,16);cyl(1.65,1.65,.17,mat('#8d9972'),g,0,.15,0,16);return g;}
  const tree=ginkgo(-6.9,-6.9,1.25);pine(8.3,-8.4,1.2);pine(-13,-2,1.45);pine(13,-5,1.4);pine(13,11,1);pine(-13,12,1.2);pine(-13,-13,1.7);pine(13,-14,1.6);
  for(let i=0;i<12;i++){const x=(i%2?1:-1)*(12+rand()*4),z=-16+rand()*33;sphere(.5+rand()*.6,mat(i%2?'#83986c':'#9ba873'),scene,x,.3,z,1,.7,1,1);}
  const ribbons=[];for(let i=0;i<16;i++){const r=box(.13,.55+rand()*.4,.018,M.redLight,tree,(rand()-.5)*3.3,2.7+rand()*2.1,(rand()-.5)*2.6);r.rotation.z=(rand()-.5)*.3;ribbons.push(r);}
  function stoneLamp(x,z){const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);box(.8,.15,.8,M.stoneDark,g,0,.07,0);cyl(.18,.26,1.05,M.stone,g,0,.65,0);box(.65,.65,.65,mat('#ebdbaf',{emissive:'#d19d53',emissiveIntensity:.16}),g,0,1.4,0);for(const a of [-1,1])for(const b of [-1,1])box(.09,.7,.09,M.stoneDark,g,a*.29,1.4,b*.29);const top=mesh(new THREE.ConeGeometry(.65,.38,4),M.roof,g,0,1.94,0);top.rotation.y=Math.PI/4;sphere(.1,M.gold,g,0,2.2,0);}
  for(const z of [5.3,-1.6])for(const x of [-3.6,3.6])stoneLamp(x,z);
  // A tiny pilgrim with separate joints, cloth, shoes, hands and a full 3D face.
  const player=new THREE.Group();player.position.set(START.x,0,START.z);scene.add(player);
  const body=new THREE.Group();player.add(body);const skin=mat('#e7c49a'),cloth=mat('#e7d5b1'),hair=mat('#3b3c32'),trousers=mat('#61766c');
  const hips=new THREE.Group();hips.position.y=.55;body.add(hips);
  const legs=[];for(const s of [-1,1]){const leg=new THREE.Group();leg.position.set(s*.14,0,0);hips.add(leg);mesh(new THREE.CapsuleGeometry(.105,.31,4,8),trousers,leg,0,-.22,0);sphere(.135,M.wood,leg,0,-.46,.055,.83,.55,1.35,1);legs.push(leg);}
  cyl(.23,.34,.64,cloth,body,0,.91,0,12);cyl(.27,.27,.09,mat('#a67c58'),body,0,.66,0,12);
  const head=new THREE.Group();head.position.set(0,1.49,0);body.add(head);mesh(new THREE.SphereGeometry(.31,20,14),skin,head,0,0,0);
  const hairMesh=mesh(new THREE.SphereGeometry(.324,16,10,0,Math.PI*2,0,Math.PI*.55),hair,head,0,.025,0);hairMesh.rotation.x=-.1;
  sphere(.12,hair,head,0,.32,-.06,.8,.8,.8,1);
  for(const s of [-1,1]){sphere(.024,hair,head,s*.105,.008,.285,1,1.2,.5,1);sphere(.045,mat('#cf8d78'),head,s*.18,-.09,.245,1,.4,.35,1);sphere(.065,skin,head,s*.3,-.025,0,.5,1,.8,1);}
  const nose=sphere(.04,skin,head,0,-.055,.308,.65,.8,.7,1);
  const scarf=mat('#ad6346');cyl(.24,.26,.13,scarf,body,0,1.21,0,12);box(.14,.36,.045,scarf,body,.17,1.04,.27);
  const arms=[];for(const s of [-1,1]){const arm=new THREE.Group();arm.position.set(s*.26,1.12,0);body.add(arm);mesh(new THREE.CapsuleGeometry(.12,.24,4,8),cloth,arm,0,-.18,0);sphere(.09,skin,arm,0,-.4,0,1,1.1,1,1);arm.rotation.z=s*.1;arms.push(arm);}
  player.scale.setScalar(1.13);
  const playerRing=mesh(new THREE.RingGeometry(.43,.48,40),new THREE.MeshBasicMaterial({color:'#fff6d7',transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}),scene,START.x,.16,START.z);playerRing.rotation.x=-Math.PI/2;playerRing.castShadow=false;
  const targetRing=mesh(new THREE.RingGeometry(.3,.36,40),new THREE.MeshBasicMaterial({color:'#a54936',transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}),scene);targetRing.rotation.x=-Math.PI/2;targetRing.visible=false;targetRing.castShadow=false;
  const glowRing=mesh(new THREE.RingGeometry(.8,.85,64),new THREE.MeshBasicMaterial({color:'#e2b96b',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}),scene,0,1,-6.2);glowRing.rotation.x=-Math.PI/2;glowRing.castShadow=false;
  const particles=[];for(let i=0;i<46;i++){const o=mesh(new THREE.PlaneGeometry(.06,.1),new THREE.MeshBasicMaterial({color:i%3?'#c1b569':'#e5d99c',side:THREE.DoubleSide,transparent:true,opacity:.65,depthWrite:false}),scene);o.castShadow=false;o.userData={x:(rand()-.5)*25,z:(rand()-.5)*26,phase:rand(),speed:.03+rand()*.04};particles.push(o);}
  const prayerLights=[];for(let i=0;i<18;i++){const o=sphere(.035,mat('#fff0b0',{emissive:'#ffbb50',emissiveIntensity:2}),scene);o.visible=false;o.castShadow=false;prayerLights.push(o);}
  // The plane is only a raycast surface; collisions are handled by navigation.js.
  const plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),hit=new THREE.Vector3();
  let entered=false,praying=false,prayerTime=0,path=[],guided=false,lastZone='gate',overview=false,focusTween=null,disposed=false,lastTime=0,walkTime=0,manual={x:0,z:0};
  const keys=new Set();let pointerStart=null;
  function focus(position,target,duration=1.4){focusTween={from:camera.position.clone(),to:position,fromTarget:controls.target.clone(),target,t:0,duration};}
  function setDestination(dest,isGuided=false){path=findPath({x:player.position.x,z:player.position.z},dest);guided=isGuided;if(path.length){targetRing.visible=true;targetRing.position.set(dest.x,floorHeight(dest.x,dest.z)+.13,dest.z);return true;}return false;}
  function enter(){if(!entered){entered=true;callbacks.onEnter?.();focus(new THREE.Vector3(19,18,25),new THREE.Vector3(0,1,-1));}return entered;}
  function goToHall(){enter();setDestination(SHRINE,true);}
  function onDown(e){pointerStart={x:e.clientX,y:e.clientY,t:performance.now()};focusTween=null;}
  function onUp(e){if(!pointerStart||praying||document.querySelector('dialog[open]'))return;const dist=Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y);if(dist>7||performance.now()-pointerStart.t>500)return;const rect=renderer.domElement.getBoundingClientRect();ndc.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(ndc,camera);if(ray.ray.intersectPlane(plane,hit)){enter();setDestination({x:hit.x,z:hit.z});}}
  renderer.domElement.addEventListener('pointerdown',onDown);renderer.domElement.addEventListener('pointerup',onUp);
  function keyDown(e){if(document.querySelector('dialog[open]')||e.target.matches('input,textarea'))return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();enter();keys.add(e.code);path=[];guided=false;targetRing.visible=false;}if(e.code==='KeyE'&&zoneAt(player.position.x,player.position.z)==='hall')callbacks.onArrive?.();}
  function keyUp(e){keys.delete(e.code);}function blur(){keys.clear();manual={x:0,z:0};}
  addEventListener('keydown',keyDown);addEventListener('keyup',keyUp);addEventListener('blur',blur);
  const observer=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});observer.observe(container);
  function startPrayer(){praying=true;prayerTime=0;path=[];keys.clear();player.rotation.y=Math.PI;player.position.x=0;player.position.z=-6.2;focus(new THREE.Vector3(1.7,3.8,-.8),new THREE.Vector3(0,1.8,-7.5),1.3);}
  const roofMaterials=new Set();templeRoofs.forEach(group=>group.traverse(o=>{if(o.isMesh){if(!Array.isArray(o.material)){// Clone upper-storey materials so other buildings stay opaque.
    o.material=o.material.clone();roofMaterials.add(o.material);o.material.transparent=true;}
  }}));
  function frame(time){if(disposed)return;const t=time/1000,dt=Math.min(.045,(time-lastTime)/1000||.016);lastTime=time;
    const paused=!!document.querySelector('dialog[open]');
    let moving=false;
    if(!paused&&!praying){
      let ix=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+manual.x;
      let iz=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+manual.z;
      let dx=0,dz=0;
      if(Math.hypot(ix,iz)>.05){const cameraForward=new THREE.Vector3();camera.getWorldDirection(cameraForward);cameraForward.y=0;cameraForward.normalize();const right=new THREE.Vector3(-cameraForward.z,0,cameraForward.x);const l=Math.max(1,Math.hypot(ix,iz));dx=(right.x*ix-cameraForward.x*iz)/l*3.4*dt;dz=(right.z*ix-cameraForward.z*iz)/l*3.4*dt;path=[];guided=false;targetRing.visible=false;}
      else if(path.length){const n=path[0],dist=Math.hypot(n.x-player.position.x,n.z-player.position.z);if(dist<.14){path.shift();if(!path.length){targetRing.visible=false;if(guided){guided=false;callbacks.onArrive?.();}}}else{const step=Math.min(3.5*dt,dist);dx=(n.x-player.position.x)/dist*step;dz=(n.z-player.position.z)/dist*step;}}
      if(dx||dz){const next=moveStep({x:player.position.x,z:player.position.z},dx,dz);moving=Math.hypot(next.x-player.position.x,next.z-player.position.z)>.0001;if(moving){player.position.x=next.x;player.position.z=next.z;const angle=Math.atan2(dx,dz);let delta=Math.atan2(Math.sin(angle-player.rotation.y),Math.cos(angle-player.rotation.y));player.rotation.y+=delta*Math.min(1,dt*13);}else if(path.length){path=[];targetRing.visible=false;}}
    }
    const y=floorHeight(player.position.x,player.position.z);player.position.y=THREE.MathUtils.damp(player.position.y,y,15,dt);
    walkTime+=dt*(moving?10:2);legs.forEach((o,i)=>o.rotation.x=THREE.MathUtils.damp(o.rotation.x,moving?Math.sin(walkTime+i*Math.PI)*.6:0,12,dt));
    if(!praying){arms.forEach((o,i)=>{o.rotation.x=THREE.MathUtils.damp(o.rotation.x,moving?-Math.sin(walkTime+i*Math.PI)*.4:0,10,dt);o.rotation.z=THREE.MathUtils.damp(o.rotation.z,(i?1:-1)*.1,10,dt);});body.rotation.x=THREE.MathUtils.damp(body.rotation.x,0,8,dt);body.position.y=moving?Math.abs(Math.sin(walkTime))*.045:Math.sin(t*1.5)*.012;head.rotation.x=Math.sin(t*.8)*.025;}
    const zone=zoneAt(player.position.x,player.position.z);if(zone!==lastZone){lastZone=zone;renderer.domElement.dataset.zone=zone;callbacks.onZone?.(zone);if(zone==='hall'&&!overview)focus(new THREE.Vector3(8,8,4),new THREE.Vector3(0,1.6,-7),1.4);}
    const roofOpacity=zone==='hall'?.09:1;roofMaterials.forEach(m=>{m.opacity=THREE.MathUtils.damp(m.opacity,roofOpacity,4,dt);m.depthWrite=m.opacity>.8;});
    playerRing.position.set(player.position.x,y+.13,player.position.z);playerRing.material.opacity=.45+Math.sin(t*2)*.15;
    lanterns.forEach((o,i)=>o.rotation.z=Math.sin(t*.8+i)*.035);ribbons.forEach((o,i)=>o.rotation.z=Math.sin(t*1.4+i)*.18);
    particles.forEach((o,i)=>{const u=(t*o.userData.speed+o.userData.phase)%1;o.position.set(o.userData.x+Math.sin(t*.3+i),6-u*6,o.userData.z+Math.sin(u*4+i)*.5);o.rotation.set(t*.4+i,t*.3,Math.sin(t+i));});
    smoke.forEach((o,i)=>{const u=(t*.13+o.userData.phase)%1;o.position.set(Math.sin(u*7+i*.1)*u*.4,1.9+u*2.5,Math.cos(u*7+i)*u*.16);o.scale.setScalar(.4+u*1.5);});
    if(praying){prayerTime+=dt;const bow=Math.sin(Math.min(1,prayerTime/3.8)*Math.PI);body.rotation.x=-bow*.25;head.rotation.x=-bow*.16;arms.forEach((o,i)=>{o.rotation.x=THREE.MathUtils.damp(o.rotation.x,-1.15,8,dt);o.rotation.z=THREE.MathUtils.damp(o.rotation.z,(i?-1:1)*.6,8,dt);});glowRing.material.opacity=Math.sin(Math.min(1,prayerTime/4.6)*Math.PI)*.7;glowRing.scale.setScalar(1+prayerTime*.38);prayerLights.forEach((o,i)=>{o.visible=true;const a=i*2.399+prayerTime*.6,r=.5+prayerTime*.18;o.position.set(Math.cos(a)*r,1.1+(prayerTime*.4+i*.06)%2.8,-6.2+Math.sin(a)*r);});if(prayerTime>4.6){praying=false;glowRing.material.opacity=0;prayerLights.forEach(o=>o.visible=false);callbacks.onPrayerComplete?.();}}
    if(focusTween){focusTween.t+=dt;const u=Math.min(1,focusTween.t/focusTween.duration),e=u*u*(3-2*u);camera.position.lerpVectors(focusTween.from,focusTween.to,e);controls.target.lerpVectors(focusTween.fromTarget,focusTween.target,e);if(u===1)focusTween=null;}
    controls.update();renderer.render(scene,camera);
    if(callbacks.onProject){const v=new THREE.Vector3(0,3,-3.1).project(camera);callbacks.onProject((v.x*.5+.5)*container.clientWidth,(-v.y*.5+.5)*container.clientHeight,zone==='hall');}
    requestAnimationFrame(frame);
  }
  renderer.domElement.dataset.zone='gate';requestAnimationFrame(frame);
  const onContextLost=(e)=>{e.preventDefault();callbacks.onError?.('3D 画面暂时中断，请刷新页面重新进入。');};renderer.domElement.addEventListener('webglcontextlost',onContextLost);
  return {enter,goToHall,startPrayer,setManual(x,z){if(!praying){enter();manual={x,z};}},getZone:()=>zoneAt(player.position.x,player.position.z),getPosition:()=>({x:player.position.x,z:player.position.z}),resetView(){overview=false;focus(new THREE.Vector3(entered?19:25,entered?18:23,entered?25:31),new THREE.Vector3(0,1,-.6));},toggleOverview(){overview=!overview;focus(overview?new THREE.Vector3(3,39,20):new THREE.Vector3(19,18,25),new THREE.Vector3(0,0,-1));return overview;},dispose(){disposed=true;observer.disconnect();controls.dispose();renderer.dispose();removeEventListener('keydown',keyDown);removeEventListener('keyup',keyUp);removeEventListener('blur',blur);scene.traverse(o=>{if(o.geometry)o.geometry.dispose();});Object.values(materials).forEach(m=>m.dispose());}};
}
