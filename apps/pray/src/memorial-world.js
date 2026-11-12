import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export function createMemorialWorld(container,onStone){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#e9eddf');scene.fog=new THREE.Fog('#e9eddf',25,65);
 const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;container.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','三维纪念花园，照片和名字会显示在纪念碑上');
 const camera=new THREE.PerspectiveCamera(36,1,.1,100),controls=new OrbitControls(camera,renderer.domElement);camera.position.set(12,12,19);controls.target.set(0,1.2,0);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=6;controls.maxDistance=34;controls.minPolarAngle=.3;controls.maxPolarAngle=Math.PI/2-.12;
 scene.add(new THREE.HemisphereLight('#fff1db','#6c825d',2.8));const sun=new THREE.DirectionalLight('#ffdfaf',3.2);sun.position.set(-9,18,10);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-13,right:13,top:13,bottom:-13,far:60});sun.shadow.normalBias=.04;scene.add(sun);
 const palette={};function mat(color){return palette[color]??=new THREE.MeshStandardMaterial({color,roughness:.88});}
 function mesh(g,c,x=0,y=0,z=0,parent=scene){const o=new THREE.Mesh(g,typeof c==='string'?mat(c):c);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 const boxGeo=new THREE.BoxGeometry(1,1,1);function box(w,h,d,c,x,y,z,parent){const o=mesh(boxGeo,c,x,y,z,parent);o.scale.set(w,h,d);return o;}
 function ball(r,c,x,y,z,sx=1,sy=1,sz=1,parent){const o=mesh(new THREE.IcosahedronGeometry(r,1),c,x,y,z,parent);o.scale.set(sx,sy,sz);return o;}
 function cylinder(a,b,h,c,x,y,z,parent){return mesh(new THREE.CylinderGeometry(a,b,h,12),c,x,y,z,parent);}
 function beam(a,b,r,c,parent=scene){const d=new THREE.Vector3().subVectors(b,a),o=cylinder(r,r,d.length(),c,0,0,0,parent);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return o;}
 const ground=cylinder(9,8.7,.65,'#859574',0,-.47,0);ground.scale.z=.85;const turf=cylinder(9.1,9.1,.16,'#b0bf94',0,-.07,0);turf.scale.z=.85;
 const inner=cylinder(7.6,7.8,.06,'#bcc79f',0,.03,-.1);inner.scale.z=.79;
 const pathmat=mat('#ddd8bf');for(let i=0;i<10;i++){const z=6-i*.7,x=Math.sin(i*.55)*.45;const p=box(1.9,.07,.59,pathmat,x,.13,z);p.rotation.y=Math.sin(i*.6)*.1;}
 const pond=cylinder(2.1,2.1,.07,'#7c9f8e',-5,.09,1.3);pond.scale.z=.74;const edging=new THREE.Mesh(new THREE.TorusGeometry(2.1,.14,6,40),mat('#adb794'));edging.rotation.x=Math.PI/2;edging.position.set(-5,.12,1.3);edging.scale.y=.74;scene.add(edging);
 let seed=6;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 for(let i=0;i<7;i++){const x=-6.3+rand()*2.6,z=.4+rand()*1.7;cylinder(.17,.17,.025,'#6b8e69',x,.15,z);if(i%3===0)ball(.1,'#eedac1',x,.25,z,1,.7,1);}
 for(let i=0;i<18;i++){const a=i/18*Math.PI*2,x=Math.cos(a)*8.1,z=Math.sin(a)*6.8;if(z>5.5)continue;ball(.45+rand()*.4,i%2?'#a5b889':'#c6cba1',x,.2,z,1,.55,1);}
 function tree(x,z,scale,leaf){const g=new THREE.Group();scene.add(g);g.position.set(x,0,z);g.scale.setScalar(scale);beam(new THREE.Vector3(0,0,0),new THREE.Vector3(.1,3.7,0),.16,'#827653',g);for(let i=0;i<6;i++){const a=i*2.4,r=.7+rand()*.6,h=2.5+rand()*1.8;beam(new THREE.Vector3(.06,2,0),new THREE.Vector3(Math.cos(a)*r,h,Math.sin(a)*r),.065,'#827653',g);ball(1.15,leaf,Math.cos(a)*r,h,Math.sin(a)*r,1,.7,1,g);}ball(1.1,leaf,0,4.5,0,1,.7,1,g);return g;}
 tree(-4.4,-3.5,1.25,'#b7c29a');tree(4,-3.4,1.1,'#d1c294');tree(-7,-.8,.72,'#90a77b');tree(6,1.2,.7,'#9aaf83');
 function flower(x,z,c){const y=.22+rand()*.22;beam(new THREE.Vector3(x,.1,z),new THREE.Vector3(x,y+.2,z),.012,'#81936c');for(let j=0;j<5;j++){const a=j*Math.PI*2/5;ball(.09,c,x+Math.cos(a)*.09,y+.22,z+Math.sin(a)*.09,1,.55,1);}ball(.045,'#c8ac6b',x,y+.25,z);}
 for(let i=0;i<65;i++){const side=i%2?1:-1;flower(side*(2.3+rand()*4),-3+rand()*6,i%4?'#f1e8cc':'#ccad91');}
 function bench(x,z,rot){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;scene.add(g);for(const xx of [-.85,.85])box(.17,.65,.6,'#687a62',xx,.36,0,g);for(let i=0;i<3;i++)box(2.2,.09,.17,'#b7a27d',0,.73,-.21+i*.21,g);box(2.2,.4,.09,'#b7a27d',0,1.14,-.37,g);for(const xx of [-.8,.8])box(.07,.7,.08,'#687a62',xx,.88,-.37,g);}
 bench(4,2.7,-.6);bench(-3.6,4.4,.6);
 // One personal monument; an unselected garden never invents a deceased person.
 const stone=new THREE.Group();scene.add(stone);stone.position.z=-1.1;box(3.5,.2,2.5,'#b8b9a0',0,.2,0,stone);box(3.1,.13,2.2,'#ded9c1',0,.37,0,stone);box(2.2,.17,1,'#aaa992',0,.53,-.45,stone);
 const shape=new THREE.Shape();shape.moveTo(-.95,0);shape.lineTo(.95,0);shape.lineTo(.95,2.05);shape.absarc(0,2.05,.95,0,Math.PI,false);shape.lineTo(-.95,0);
 const slab=mesh(new THREE.ExtrudeGeometry(shape,{depth:.38,bevelEnabled:true,bevelThickness:.06,bevelSize:.06,bevelSegments:2,steps:1,curveSegments:24}),'#e2dcc7',0,.61,-.63,stone);
 const faceCanvas=document.createElement('canvas');faceCanvas.width=768;faceCanvas.height=1200;const cx=faceCanvas.getContext('2d'),texture=new THREE.CanvasTexture(faceCanvas);texture.colorSpace=THREE.SRGBColorSpace;
 const face=mesh(new THREE.PlaneGeometry(1.64,2.56),new THREE.MeshStandardMaterial({map:texture,transparent:true,roughness:.9,polygonOffset:true,polygonOffsetFactor:-1}),0,2.02,-.17,stone);face.castShadow=false;
 let renderSequence=0;async function setMemorial(record){const seq=++renderSequence;cx.clearRect(0,0,768,1200);cx.textAlign='center';cx.fillStyle='#78816b';cx.font='32px "Songti SC",serif';cx.fillText(record?'长 · 念':'念 · 念',384,125);
  if(record?.photo){const image=new Image();await new Promise(resolve=>{image.onload=resolve;image.onerror=resolve;image.src=record.photo;});if(seq!==renderSequence)return;if(image.naturalWidth){cx.save();cx.beginPath();cx.roundRect(184,205,400,430,12);cx.clip();const ratio=Math.max(400/image.width,430/image.height);cx.drawImage(image,384-image.width*ratio/2,420-image.height*ratio/2,image.width*ratio,image.height*ratio);cx.restore();}}
  else{cx.strokeStyle='#a5ae90';cx.lineWidth=3;cx.beginPath();cx.arc(384,390,105,0,Math.PI*2);cx.stroke();cx.font='100px "Songti SC",serif';cx.fillStyle='#a1a98b';cx.fillText('念',384,425);}
  cx.fillStyle='#5d6a56';const name=record?.name||'把爱留下';cx.font=`${Math.min(68,590/Math.max(name.length,1))}px "Songti SC",serif`;cx.fillText(name,384,760,650);cx.fillStyle='#9b9d85';cx.font='25px sans-serif';cx.fillText(record?[record.birthDate,record.deathDate].filter(Boolean).join(' — '):'让思念有处可去',384,834,650);
  cx.font='30px "Songti SC",serif';cx.fillStyle='#8a8c72';const words=Array.from(record?.epitaph||'山风有信，花开如常');const lines=[];for(let i=0;i<Math.min(words.length,42);i+=14)lines.push(words.slice(i,i+14).join(''));lines.forEach((line,i)=>cx.fillText(line,384,940+i*45,650));texture.needsUpdate=true;}
 setMemorial(null);
 for(const x of [-1.3,1.3]){cylinder(.18,.22,.4,'#b0ad96',x,.64,.25,stone);for(let i=0;i<5;i++){const a=i*2.4;const stem=beam(new THREE.Vector3(x,.7,.25),new THREE.Vector3(x+Math.cos(a)*.2,1.05+rand()*.25,.25+Math.sin(a)*.17),.015,'#839369',stone);ball(.13,'#f2e4c5',stem.position.x*2-x,stem.position.y*2-.7,stem.position.z*2-.25,1,.65,1,stone);}}
 const flame=ball(.07,'#e9bb6d',0,.78,.62,1,1.8,1,stone);cylinder(.095,.095,.2,'#e7dfc6',0,.56,.62,stone);
 // A little visitor stands on the path, facing the memorial.
 const visitor=new THREE.Group();visitor.position.set(1.25,0,2.6);visitor.rotation.y=-.25;scene.add(visitor);for(const x of [-.12,.12]){box(.15,.37,.18,'#6a796a',x,.3,0,visitor);box(.19,.1,.28,'#696d58',x,.1,-.04,visitor);}const torso=mesh(new THREE.CylinderGeometry(.18,.28,.53,8),'#c99c72',0,.75,0,visitor);ball(.23,'#e3bf92',0,1.22,0,1,1.12,1,visitor);ball(.24,'#534f3c',0,1.3,.025,1,.75,1,visitor);for(const x of [-.29,.29])beam(new THREE.Vector3(x,.94,0),new THREE.Vector3(x,.58,-.06),.07,'#c99c72',visitor);
 // Distant landscape remains low-poly and is rendered locally.
 for(let i=0;i<7;i++)ball(5+rand()*3,i%2?'#c9d3bd':'#b9c9b0',-19+i*6,-2,-16-rand()*5,1,.65,1);
 // Batch static flowers, foliage and furniture so mobile GPUs draw each material once.
 scene.updateMatrixWorld(true);const batches=new Map(),staticMeshes=[];scene.traverse(o=>{if(o.isMesh&&![slab,face,flame].includes(o))staticMeshes.push(o);});
 for(const o of staticMeshes){const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(o.matrixWorld);if(!batches.has(o.material))batches.set(o.material,[]);batches.get(o.material).push(geo);o.removeFromParent();}
 for(const [material,geometries] of batches){const merged=mergeGeometries(geometries);if(merged){const combined=new THREE.Mesh(merged,material);combined.castShadow=true;combined.receiveShadow=true;scene.add(combined);}geometries.forEach(g=>g.dispose());}
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down;renderer.domElement.addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY});renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>7)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);if(ray.intersectObject(slab).length)onStone();});
 const observer=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});observer.observe(container);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;let targetCamera=null,targetFocus=null,visible=true,last=0;new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;},{threshold:0}).observe(container);
 renderer.setAnimationLoop(time=>{if(document.hidden||!visible||time-last<32)return;last=time;if(targetCamera){camera.position.lerp(targetCamera,.1);controls.target.lerp(targetFocus,.1);if(camera.position.distanceTo(targetCamera)<.02)targetCamera=null;}if(!reduced)flame.scale.y=1.8+Math.sin(time*.004)*.15;controls.update();renderer.render(scene,camera);});
 return{setMemorial,stats(){return{drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};},focus(){targetCamera=new THREE.Vector3(2,3.7,6.8);targetFocus=new THREE.Vector3(0,1.75,-1.1);},reset(){targetCamera=new THREE.Vector3(12,12,19);targetFocus=new THREE.Vector3(0,1.2,0);}};
}
