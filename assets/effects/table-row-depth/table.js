import * as THREE from './vendor/three.module.js';
import {projectLayer} from './table-camera.mjs';
const C=await fetch('./config.json').then(r=>r.json());
C.camera={yaw:0,pitch:0,zoom:1,roll:0,panX:0,panY:0,animate:true,anchorTime:0,...C.camera};
MV.config({duration:C.duration,fps:C.fps,bg:'#101a21'});
let lastTime=0;
function cameraAt(t){
 const c=C.camera;if(!c.animate)return c;
 const u=Math.max(0,Math.min(1,t/C.duration)),p=u*u*(3-2*u),r={...c};
 for(const k of ['yaw','pitch','zoom','roll','panX','panY']){const a=c[k]??(k==='zoom'?1:0),b=c['end'+k[0].toUpperCase()+k.slice(1)]??a;r[k]=a+(b-a)*p;}
 return r;
}
window.effectCamera={current:()=>({...structuredClone(cameraAt(lastTime)),anchorTime:C.camera.animate?lastTime:C.camera.anchorTime,animate:false}),update:camera=>{C.camera=structuredClone(camera)}};
const W=1920,H=1080,TW=1000,TH=1240,RH=126,HEADER=156;
const cv=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
const clamp=v=>Math.min(1,Math.max(0,v)),smooth=v=>(v=clamp(v))*v*(3-2*v),mix=(a,b,t)=>a+(b-a)*t;
const range=(t,a,b)=>smooth((t-a)/(b-a));
const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src});
const [studio,presenter]=await Promise.all(['studio','presenter'].map(n=>load(`./assets/${n}.svg`)));
await Promise.all([document.fonts.load('600 44px "PingFang SC"'),document.fonts.load('800 44px "Avenir Next"')]);

function round(g,x,y,w,h,r){g.beginPath();g.roundRect(x,y,w,h,r)}
function text(g,s,x,y,n,color,opts={}){
 g.save();g.fillStyle=color;g.textAlign=opts.align||'left';g.translate(x,y);
 if(opts.italic)g.transform(1,0,-.1,1,0,0);if(opts.gradient){const q=g.createLinearGradient(-100,0,100,0);q.addColorStop(0,'#599da1');q.addColorStop(1,'#7750b9');g.fillStyle=q;}
 g.letterSpacing=opts.spacing||'0px';g.font=`${opts.weight||600} ${n}px "${opts.numeric?'Arial':'PingFang SC'}",sans-serif`;
 g.fillText(String(s),0,0,opts.width||900);g.restore();
}
function contents(g,row,y,color='#4e3c83',selected=false){
 const d=C.rows[row];
 text(g,row+1,95,y+64,40,selected?'#ddddE5':'#e6e5ec',{numeric:true,align:'center',weight:700});
 text(g,d.label,151,y+57,44,color,{italic:true,width:250,weight:400,spacing:'3px'});
 text(g,d.english,151,y+90,17,selected?'#a9b5ce':'#aebcd1',{numeric:true,weight:600,width:235});
 text(g,d.value,565,y+64,40,selected==='red'?'#faff20':'#7153ac',{numeric:true,align:'center',weight:700});
 text(g,d.extra,826,y+64,40,selected==='red'?'#b4ad69':'#555657',{numeric:true,align:'center',weight:700});
}
const board=cv(TW*2,TH*2),bg=board.getContext('2d');bg.scale(2,2);
round(bg,0,0,TW,TH,28);bg.clip();bg.fillStyle='#fff';bg.fillRect(0,0,TW,TH);
bg.fillStyle='#f0f0f0';bg.fillRect(410,HEADER,290,TH-HEADER);
text(bg,C.headers[0],150,121,28,'#747580',{italic:true,width:260});
let grad=bg.createLinearGradient(455,0,675,0);grad.addColorStop(0,'#579c9f');grad.addColorStop(1,'#7555bf');
text(bg,C.headers[1],565,91,40,grad,{italic:true,align:'center',width:240,gradient:true,weight:500});
text(bg,C.headers[2],826,91,39,'#66686a',{italic:true,align:'center'});
text(bg,C.units[1],565,125,20,'#adbed0',{align:'center',weight:400});
text(bg,C.units[2],826,125,20,'#aaa',{align:'center',weight:400});
bg.strokeStyle='#d5d5d5';bg.lineWidth=2.4;bg.beginPath();bg.moveTo(57,HEADER);bg.lineTo(937,HEADER);bg.stroke();
for(let i=0;i<C.rows.length;i++){
 contents(bg,i,HEADER+i*RH);
 bg.strokeStyle='#ededed';bg.lineWidth=1;bg.setLineDash([4,5]);bg.beginPath();bg.moveTo(58,HEADER+(i+1)*RH);bg.lineTo(938,HEADER+(i+1)*RH);bg.stroke();
}
const dim=cv(TW,TH),dg=dim.getContext('2d');dg.fillStyle='#000';round(dg,0,0,TW,TH,28);dg.fill();
function rowTexture(index,red=false,cell=false){
 const c=cv(2600,840),g=c.getContext('2d');g.scale(2,2);g.translate(150,150);
 if(!cell){g.shadowColor=red?'#c0d59866':'#0006';g.shadowBlur=red?15:40;g.shadowOffsetY=red?0:21;g.fillStyle=red?'#bc2338':'#fff';round(g,0,0,TW,120,12);g.fill();g.shadowBlur=0;g.shadowOffsetY=0;
  g.save();round(g,0,0,TW,120,12);g.clip();g.fillStyle=red?'#d13346':'#f0f0f0';g.fillRect(410,0,290,120);
  if(red){let q=g.createLinearGradient(0,0,TW,0);q.addColorStop(0,'#ffffff10');q.addColorStop(1,'#00000013');g.fillStyle=q;g.fillRect(0,0,TW,120)}
  contents(g,index,-4,red?'#fff0bd':'#4e3c83',red?'red':true);g.restore();
  if(red){g.strokeStyle='#9db47b99';g.lineWidth=1.4;round(g,0,0,TW,120,12);g.stroke()}
 }else{
  g.fillStyle='#a51a35';g.fillRect(700,0,230,120);
  g.shadowColor='#ffb9a9';g.shadowBlur=8;text(g,C.rows[index].extra,826,60,45,'#eec1b3',{numeric:true,weight:700,align:'center'});
 }
 return c;
}

// A measured planar projection keeps the same row, digits and column identity in every camera view.
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(MV.W(),MV.H());renderer.setPixelRatio(1);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene(),camera=new THREE.Camera();
function quad(canvas){
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,1,1,0],3));geo.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,1,0,0,1,0],2));geo.setIndex([0,2,1,1,2,3]);
 const mat=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,uniforms:{tex:{value:tex},opacity:{value:1},tl:{value:new THREE.Vector3()},tr:{value:new THREE.Vector3()},bl:{value:new THREE.Vector3()},br:{value:new THREE.Vector3()}},vertexShader:`varying vec2 vUv;uniform vec3 tl,tr,bl,br;void main(){vUv=uv;vec3 p=mix(mix(tl,tr,position.x),mix(bl,br,position.x),position.y);gl_Position=vec4((p.x/960.-1.)*p.z,(1.-p.y/540.)*p.z,0.,p.z);}`,fragmentShader:`varying vec2 vUv;uniform sampler2D tex;uniform float opacity;void main(){gl_FragColor=texture2D(tex,vUv);gl_FragColor.a*=opacity;\n#include <colorspace_fragment>\n}`});
 const mesh=new THREE.Mesh(geo,mat);mesh.frustumCulled=false;scene.add(mesh);
 return {mesh,mat,tex,set(points,alpha=1){mesh.visible=alpha>.0001;mat.uniforms.opacity.value=alpha;['tl','tr','bl','br'].forEach((key,i)=>mat.uniforms[key].value.set(...points[i]))}};
}
const base=quad(board),shade=quad(dim),second=quad(rowTexture(0)),cell=quad(rowTexture(0,false,true)),primary=quad(rowTexture(C.primary_row,C.variant==='swiss'));
const flagCanvas=cv(1300,420),flagG=flagCanvas.getContext('2d'),flag=quad(flagCanvas);
function updateFlag(t){
 const g=flagG;g.clearRect(0,0,1300,420);g.save();g.translate(150,150);
 g.strokeStyle='#263836';g.lineWidth=6;g.beginPath();g.moveTo(63,-87);g.lineTo(63,120);g.stroke();
 g.strokeStyle='#c5d2d0';g.lineWidth=1.8;g.beginPath();g.moveTo(61,-87);g.lineTo(61,120);g.stroke();
 for(let x=0;x<104;x++){
  const u=x/104,fold=Math.sin(u*7-t*1.6)*7*u,light=.78+.22*Math.cos(u*7-t*1.6);
  g.fillStyle=`rgb(${Math.round(164*light)},${Math.round(25*light)},${Math.round(39*light)})`;g.fillRect(65+x,-79+fold,1.2,70);
  // Own X insignia, projected together with the independent floating row.
  for(let y=10;y<60;y++)if(Math.abs((x-52)-(y-35))<6||Math.abs((x-52)+(y-35))<6){g.fillStyle=`rgb(${230*light},${239*light},${222*light})`;g.fillRect(65+x,-79+y+fold,1.2,1.2)}
 }
 g.restore();flag.tex.needsUpdate=true;
}
// Solve the homogeneous map of a rectangle to its observed quadrilateral.
function homography(q){
 const [a,b,c,d]=q,dx1=b[0]-d[0],dx2=c[0]-d[0],dx3=a[0]-b[0]-c[0]+d[0],dy1=b[1]-d[1],dy2=c[1]-d[1],dy3=a[1]-b[1]-c[1]+d[1],det=dx1*dy2-dx2*dy1;
 const g=(dx3*dy2-dx2*dy3)/det,h=(dx1*dy3-dx3*dy1)/det;
 return {point(x,y){const u=x/TW,v=y/TH,z=1+g*u+h*v;return [(a[0]+(b[0]*(1+g)-a[0])*u+(c[0]*(1+h)-a[0])*v)/z,(a[1]+(b[1]*(1+g)-a[1])*u+(c[1]*(1+h)-a[1])*v)/z,z]}};
}
function warp(H,x,y,w,h,scale=1,dy=0){
 const cx=x+w/2,cy=y+h/2;
 return [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([a,b])=>H.point(500+(a-500)*scale,cy+(b-cy)*scale+dy));
}
function layout(t){
 if(C.variant==='ireland'){
  const u=t/C.duration;
  return [[720-2*u,100-24*u],[1728+2*u,100-24*u],[720-2*u,1400-42*u],[1728+2*u,1400-42*u]];
 }
 const hardCut=t>=3.1;
 if(!hardCut){const u=t/3.1;return [[250.22-13*u,123.44-32*u],[1168.25-12*u,35.68-16*u],[917.99-22*u,1429.92-55*u],[1705.52-23*u,1221.14-24*u]]}
 const u=(t-3.1)/(C.duration-3.1);
 return [[168+2*Math.sin(u*5),32-15*u],[1800+6*Math.sin(u*3),32-15*u],[442+8*Math.sin(u*5),1170-35*u],[1452+8*Math.sin(u*3),1170-35*u]];
}
function state(t){
 if(C.motionTiming)return {primary:range(t,C.motionTiming.start,C.motionTiming.full),secondary:0,dim:0,cell:0};
 const source=C.reference.sourceStart+t;
 if(C.variant==='ireland')return {primary:range(source,1203.7666667,1204.1),secondary:0,dim:0,cell:0};
 const back=range(source,14.5333333,15);
 return {primary:range(source,11.5333333,11.8333333),secondary:range(source,12.2666667,12.6)*(1-back),dim:.84*range(source,12.2666667,12.6)*(1-back),cell:range(source,13.3,13.5)*(1-back)};
}

// Continuous fabric illumination, with an authored X emblem replacing the reference country flag.
const clothScene=new THREE.Scene(),clothCamera=new THREE.Camera();
const clothMat=new THREE.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,fragmentShader:`precision highp float;varying vec2 vUv;uniform float time;float wave(vec2 p){return .34*sin(6.7*p.x+8.3*p.y+time*.25)+.17*sin(13.1*p.x-11.0*p.y-time*.32)+.08*sin(21.3*p.x+4.1*p.y+time*.18);}void main(){vec2 p=vUv;float h=wave(p);vec2 d=vec2(wave(p+vec2(.003,0.))-h,wave(p+vec2(0.,.003))-h)/.003;vec3 n=normalize(vec3(-d*.33,1.));float light=.40+.49*max(0.,dot(n,normalize(vec3(-.5,.65,.9))));vec2 q=p-vec2(.48,.51);q=mat2(.97,-.24,.24,.97)*q;q.x+=h*.012;float emblem=1.-smoothstep(.070,.076,min(abs(q.x)*.72,abs(q.y)*1.12));emblem*=1.-smoothstep(.35,.37,max(abs(q.x),abs(q.y)*.78));vec3 c=mix(vec3(.38,.012,.052),vec3(.7),emblem);float edge=1.-.32*length(p-.5);gl_FragColor=vec4(c*light*edge+pow(max(0.,n.z),12.)*.045,1.);}`});
clothScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),clothMat));
function background(t,g){
 if(C.variant==='swiss'){clothMat.uniforms.time.value=t;renderer.render(clothScene,clothCamera);g.drawImage(renderer.domElement,0,0,W,H);return}
 g.save();g.filter='blur(24px) saturate(.55)';g.drawImage(studio,-50,-40,2020,1150);g.restore();g.fillStyle='#061218aa';g.fillRect(0,0,W,H);
}
function character(t,g){
 if(C.variant!=='ireland')return;
 const u=range(t,.48,.64),cell=presenter.width/2;
 function pose(i,a){if(a<=0)return;g.save();g.globalAlpha=a;g.translate(700,0);g.scale(-1,1);g.drawImage(presenter,i%2*cell,Math.floor(i/2)*cell,cell,cell,0,220,730,730);g.restore()}
 pose(0,1-u);pose(1,u);
}
function draw(t,g){
 background(t,g);character(t,g);
 lastTime=t;const S=state(t),M=homography(layout(C.camera.animate?t:C.camera.anchorTime)),pivot=M.point(TW/2,TH/2);
 const layer=(points,depth=0)=>projectLayer(points,cameraAt(t),pivot,depth);
 base.set(layer(warp(M,0,0,TW,TH)));shade.set(layer(warp(M,0,0,TW,TH)),S.dim);
 const rowY=HEADER+C.primary_row*RH;
 primary.set(layer(warp(M,-150,rowY-150,1300,420,1.14,C.variant==='ireland'?-15:12),90*S.primary),S.primary);
 if(C.variant==='swiss'){updateFlag(t);flag.set(layer(warp(M,-150,rowY-150,1300,420,1.14,12),90*S.primary),S.primary)}else flag.mesh.visible=false;
 second.set(layer(warp(M,-150,HEADER-150,1300,420,1.08,-17),55*S.secondary),S.secondary);
 cell.set(layer(warp(M,-150,HEADER-150,1300,420,1.08,-17),55*S.secondary+8),S.cell);
 renderer.render(scene,camera);g.drawImage(renderer.domElement,0,0,W,H);
 g.save();g.translate(960,966);g.transform(1,0,-.09,1,0,0);g.font='700 52px "PingFang SC"';g.textAlign='center';g.strokeStyle='#0a1118';g.lineWidth=5;g.lineJoin='round';g.strokeText(C.caption,0,0,1650);g.fillStyle='#fff';g.fillText(C.caption,0,0,1650);g.restore();
 g.fillStyle='#cbd2d0';g.font='18px "PingFang SC"';g.fillText('动作研究 / 示例参数',24,1048);
}
window.tableDebug={layout,state,cameraAt,config:C};
MV.scene('table-depth',0,C.duration,({ctx,t})=>draw(t,ctx));MV.start();
