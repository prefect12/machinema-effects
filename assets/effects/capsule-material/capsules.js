import {createEffectCamera} from './effect-camera.js';
import * as THREE from './vendor/three.module.js';
const C=await fetch('./config.json').then(r=>r.json()),W=1920,H=1080,Z=1303.6766;
const editCamera=createEffectCamera(C);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(W,H);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.toneMappingExposure=1.1;
const scene=new THREE.Scene();scene.background=new THREE.Color('#ffffff');
const camera=new THREE.PerspectiveCamera(45,W/H,10,6500);camera.position.z=Z;
scene.add(new THREE.AmbientLight('#ffffff',.35));
for(const [x,y,z,p,c]of[[-500,900,1000,2.1,'#ffffff'],[1000,-100,500,.5,'#d7fbff'],[-900,-200,-400,.8,'#ffffff']]){const l=new THREE.DirectionalLight(c,p);l.position.set(x,y,z);scene.add(l)}
// Independently drawn studio reflection field: white light tents and black flags.
const ec=Object.assign(document.createElement('canvas'),{width:2048,height:1024}),eg=ec.getContext('2d');eg.fillStyle='#eceeeb';eg.fillRect(0,0,2048,1024);
for(const [x,y,w,h,c]of[[0,0,2048,190,'#fefefe'],[120,260,190,540,'#171c1d'],[420,100,210,680,'#ffffff'],[1000,450,650,95,'#292c2b'],[1680,130,80,680,'#111818'],[1800,200,220,630,'#ffffff']]){eg.fillStyle=c;eg.fillRect(x,y,w,h)}
const env=new THREE.CanvasTexture(ec);env.mapping=THREE.EquirectangularReflectionMapping;env.colorSpace=THREE.SRGBColorSpace;
scene.environment=new THREE.PMREMGenerator(renderer).fromEquirectangular(env).texture;
const shellMat=new THREE.MeshPhysicalMaterial({color:C.shellColor,roughness:C.roughness,metalness:0,transmission:1,thickness:C.thickness,ior:C.ior,attenuationColor:C.attenuationColor,attenuationDistance:C.attenuationDistance,envMapIntensity:.55,clearcoat:.1,clearcoatRoughness:.04,depthWrite:false});
const coreMat=new THREE.MeshPhysicalMaterial({color:'#052826',roughness:.27,metalness:.15,envMapIntensity:.15});
const stripeMat=new THREE.MeshPhysicalMaterial({color:'#007d78',roughness:.22,metalness:0,transparent:true,opacity:.28,depthWrite:false});
function profile(radius,length){const p=[];for(let i=0;i<=32;i++){const a=-Math.PI/2+i*Math.PI/64;p.push(new THREE.Vector2(radius*Math.cos(a),-length/2+radius*Math.sin(a)))}p.push(new THREE.Vector2(radius,length/2));for(let i=1;i<=32;i++){const a=i*Math.PI/64;p.push(new THREE.Vector2(radius*Math.cos(a),length/2+radius*Math.sin(a)))}return p}
function shellGeometry(r,l,wall){const p=profile(r,l),inside=profile(r-wall,l).reverse();return new THREE.LatheGeometry([...p,...inside,p[0]],96)}
function rod(a,b,r,mat){const d=b.clone().sub(a),m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),12),mat);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m}
function capsule(r,l,glass=true,color='#14c8c5'){
 const g=new THREE.Group(),inside=new THREE.Group();g.add(inside);
 if(glass){
  for(const a of[0,Math.PI]){const x=Math.cos(a)*r*.42,z=Math.sin(a)*r*.42;inside.add(rod(new THREE.Vector3(x,-l*.5-r*.57,z),new THREE.Vector3(x,l*.5+r*.57,z),.55,coreMat))}
  for(const s of[-1,1]){const m=new THREE.Mesh(new THREE.SphereGeometry(r*.25,24,16),coreMat);m.scale.set(1,.38,1);m.position.y=s*(l*.5+r*.52);inside.add(m)}
  for(const y of[-l*.23,l*.23]){inside.add(rod(new THREE.Vector3(-r*.44,y,0),new THREE.Vector3(r*.44,y,0),.45,coreMat))}
  const body=new THREE.Mesh(shellGeometry(r,l,C.hero.wall),shellMat);body.renderOrder=2;g.add(body);
  // Fine moulded ridges follow the curved surface, including the lower cap.
  for(let y=-l/2-r*.93;y<l/2+r*.93;y+=4.2){let rad=r;if(Math.abs(y)>l/2)rad=Math.sqrt(Math.max(0,r*r-(Math.abs(y)-l/2)**2));const ring=new THREE.Mesh(new THREE.TorusGeometry(rad+.07,.18,5,96),stripeMat);ring.rotation.x=Math.PI/2;ring.position.y=y;ring.renderOrder=3;g.add(ring)}
  const seam=new THREE.Mesh(new THREE.TorusGeometry(r+.1,.5,8,96),stripeMat);seam.rotation.x=Math.PI/2;g.add(seam);
 }else{
  const mat=new THREE.MeshPhysicalMaterial({color,roughness:.18,metalness:.02,clearcoat:.8,clearcoatRoughness:.15,envMapIntensity:.75});g.add(new THREE.Mesh(new THREE.LatheGeometry(profile(r,l),64),mat));
 }
 return g;
}
const hero=capsule(C.hero.radius,C.hero.length);scene.add(hero);
const objects=[];
function place(g,x,y,z,scale=1){const p=(Z-z)/Z;g.position.set((x-480)*2*p,(270-y)*2*p,z);g.scale.setScalar(scale*p)}
function tablet(x,y,z,r,color,rotation){const g=new THREE.Group(),mat=new THREE.MeshPhysicalMaterial({color,roughness:.24,metalness:0,clearcoat:.3,envMapIntensity:.16});const m=new THREE.Mesh(new THREE.SphereGeometry(r,64,32),mat);m.scale.y=.35;g.add(m);scene.add(g);objects.push({g,x,y,z,rotation});return g}
tablet(455,18,0,45,'#10170f',[1.2,.3,.3]);tablet(117,230,-25,43,'#45483e',[.8,.5,.25]);tablet(397,425,80,57,'#420032',[.8,.2,-.3]);tablet(866,255,420,53,'#070b05',[1.1,0,.3]);
const teal=capsule(20,68,false,'#00c5b9');scene.add(teal);objects.push({g:teal,x:628,y:423,z:560,rotation:[.1,.4,-.65]});
for(const [x,y,z,scale,rz]of[[219,20,640,1.2,1.1],[825,418,-10,.28,.75],[205,320,360,1.4,-1]]){
 const g=new THREE.Group();for(const [s,col]of[[-1,'#14120d'],[1,'#bc7229']]){const half=new THREE.Mesh(new THREE.CapsuleGeometry(15,21,12,32),new THREE.MeshPhysicalMaterial({color:col,roughness:.25,clearcoat:.4}));half.position.y=s*12;g.add(half)}scene.add(g);objects.push({g,x,y,z,scale,rotation:[.3,.2,rz]});
}
const colorTarget=new THREE.WebGLRenderTarget(W,H,{type:THREE.FloatType}),depthTarget=new THREE.WebGLRenderTarget(W,H);depthTarget.depthTexture=new THREE.DepthTexture(W,H);depthTarget.depthTexture.type=THREE.UnsignedIntType;
const depthMaterial=new THREE.MeshDepthMaterial(),postScene=new THREE.Scene(),postCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);postCamera.position.z=1;
const post=new THREE.ShaderMaterial({uniforms:{image:{value:colorTarget.texture},depth:{value:depthTarget.depthTexture},focus:{value:C.focus},aperture:{value:C.aperture}},vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`precision highp float;varying vec2 uv0;uniform sampler2D image,depth;uniform float focus,aperture;float zview(float d){return 2.*10.*6500./(6510.-(2.*d-1.)*6490.);}void main(){float z=zview(texture2D(depth,uv0).r);float coc=min(.023,abs(z-focus)/max(z,1.)*aperture);if(z>6000.)coc=0.;for(int k=0;k<12;k++){float a=float(k)*2.399963;vec2 q=vec2(cos(a)*.5625,sin(a))*.018;float zn=zview(texture2D(depth,uv0+q).r);if(zn<6000.){float cn=min(.023,abs(zn-focus)/max(zn,1.)*aperture);if(cn>.016)coc=max(coc,cn);}}vec3 c=texture2D(image,uv0).rgb;float count=1.;for(int i=0;i<128;i++){float a=float(i)*2.399963,r=sqrt((float(i)+.5)/128.)*coc;vec2 uv=uv0+vec2(cos(a)*.5625,sin(a))*r;c+=texture2D(image,uv).rgb;count+=1.;}gl_FragColor=vec4(c/count,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`});postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),post));
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const keys=[[0,365,50,1.83,.74],[.5,449,141,1.24,.28],[1,609,146,1.15,.45],[1.25,650,148,1.14,.58],[1.5,655,149,1.13,.65],[2,660,153,1.12,.80],[2.2666666667,663,156,1.12,.90]];
function heroAt(t){let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;const a=keys[i],b=keys[i+1],q=Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0])));return a.slice(1).map((v,j)=>v+(b[j+1]-v)*q)};
function render(t){
 // Fitted screen trajectory; hidden source geometry is explicitly unverified.
 const [x,y,sc,angle]=heroAt(t);
 place(hero,x,y,0,sc);hero.rotation.order='ZXY';hero.rotation.set(.05+.015*t,.15+.53*t,angle);
 for(let i=0;i<objects.length;i++){const o=objects[i],dx=(o.x-480)*(.64*Math.exp(-2*t)),dy=(o.y-270)*(.64*Math.exp(-2*t));place(o.g,i===7?205+150*smooth(t/1.2):o.x+dx-65*Math.exp(-1.2*t),i===7?320-90*smooth(t/1.2):o.y+dy,o.z,(o.scale||1)*(1+.5*Math.exp(-2*t)));o.g.rotation.set(o.rotation[0]+.09*t,o.rotation[1]+.24*t,o.rotation[2]+.07*t)}
 renderer.setRenderTarget(colorTarget);editCamera.run(camera,[0,0,0],t,()=>renderer.render(scene,camera));scene.overrideMaterial=depthMaterial;renderer.setRenderTarget(depthTarget);editCamera.run(camera,[0,0,0],t,()=>renderer.render(scene,camera));scene.overrideMaterial=null;renderer.setRenderTarget(null);renderer.render(postScene,postCamera);
}
MV.config({duration:C.duration,fps:C.fps,bg:'#fff'});MV.scene('capsule-material',0,C.duration,({ctx,t})=>{render(t);ctx.drawImage(renderer.domElement,0,0)});window.capsuleDebug={scene,camera,renderer,hero,objects,post,shellMat};MV.start();
