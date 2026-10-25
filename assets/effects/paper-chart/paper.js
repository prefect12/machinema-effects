import {createEffectCamera} from './effect-camera.js';
import * as THREE from './vendor/three.module.js';
const C=await fetch('./config.json').then(r=>r.json());
const editCamera=createEffectCamera(C);
const W=1920,H=1080,SW=1380,SH=783,NX=180,NY=18;
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const mix=(a,b,q)=>a+(b-a)*q;
const smooth=x=>(x=clamp(x))*x*(3-2*x);
const out=x=>1-Math.pow(1-clamp(x),3);
const cv=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
const tx=c=>{let t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t};
const img=await new Promise((r,j)=>{let a=new Image;a.onload=()=>r(a);a.onerror=j;a.src='./assets/xiaohei-expressions.svg'});
function text(g,s,x,y,size,col='#999',weight='400'){g.fillStyle=col;g.font=`${weight} ${size}px "PingFang SC"`;g.fillText(s,x,y)}
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setSize(W,H);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x000000,0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-960,960,540,-540,1,6000);camera.position.z=2200;camera.lookAt(0,0,0);
scene.add(new THREE.AmbientLight(0xffffff,.55));
const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(0,850,1800);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-1400,right:1400,top:1000,bottom:-1000,near:10,far:4000});key.shadow.bias=-.002;key.shadow.normalBias=1;key.shadow.radius=4;scene.add(key);
const fill=new THREE.DirectionalLight(0xe5e8f2,.3);fill.position.set(1200,-700,600);scene.add(fill);
// One continuous mesh retains chart UVs through every bend. Rounded corners are alpha, not a flat-card substitution.
const chart=cv(SW*2,SH*2),g=chart.getContext('2d');g.scale(2,2);g.beginPath();g.roundRect(0,0,SW,SH,22);g.clip();g.fillStyle='#ffffff';g.fillRect(0,0,SW,SH);
const pad={l:112,r:57,t:95,b:68},cw=SW-pad.l-pad.r,ch=SH-pad.t-pad.b;
g.textAlign='right';for(let i=0;i<=10;i++){let y=pad.t+i*ch/10;g.strokeStyle=i%2===0?'#d7d9da':'#eaebec';g.setLineDash([4,5]);g.lineWidth=1;g.beginPath();g.moveTo(pad.l,y);g.lineTo(SW-pad.r,y);g.stroke();text(g,String(Math.round(mix(C.range[1],C.range[0],i/10))),pad.l-18,y+5,16,'#aaa')}
g.setLineDash([]);g.textAlign='left';text(g,C.unit,53,35,15,'#aaa');g.textAlign='center';C.xLabels.forEach((s,i)=>text(g,s,pad.l+i*cw/(C.xLabels.length-1),SH-36,15,'#a3a5a6'));
const points=C.values.map((v,i)=>[pad.l+i*cw/(C.values.length-1),pad.t+(C.range[1]-v)/(C.range[1]-C.range[0])*ch]);g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.strokeStyle='#2b668b';g.lineWidth=3.3;g.lineJoin='round';g.stroke();for(const [x,y] of points){g.beginPath();g.arc(x,y,3.6,0,Math.PI*2);g.fillStyle='#2b668b';g.fill();g.strokeStyle='white';g.lineWidth=2;g.stroke()}
g.textAlign='right';text(g,C.dataNote,SW-32,SH-10,12,'#afb2b4');
const chartBase=cv(chart.width,chart.height);chartBase.getContext('2d').drawImage(chart,0,0);
const chartTexture=tx(chart);
function annotationFrame(t){g.save();g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,chart.width,chart.height);g.drawImage(chartBase,0,0);g.restore();for(const a of C.annotations||[]){const q=smooth((t-a.at)/.30);if(q<=0)continue;const [px,py]=points[a.index],lx=a.x,ly=a.y,bw=192,bh=58;g.save();g.strokeStyle=a.color;g.fillStyle=a.color;g.globalAlpha=q;g.lineWidth=2.3;g.beginPath();g.arc(px,py,6+6*(1-q),0,Math.PI*2);g.stroke();g.beginPath();g.moveTo(px,py);g.lineTo(mix(px,lx,Math.min(1,q*1.4)),mix(py,ly,Math.min(1,q*1.4)));g.stroke();g.globalAlpha=smooth((q-.35)/.65);g.shadowColor='#19213726';g.shadowBlur=12;g.shadowOffsetY=3;g.fillStyle='#ffffff';g.beginPath();g.roundRect(lx-16,ly-36,bw,bh,9);g.fill();g.shadowBlur=0;g.shadowOffsetY=0;g.strokeStyle=a.color+'88';g.stroke();g.textAlign='left';text(g,a.label,lx,ly,22,a.color,'600');g.textAlign='right';text(g,a.value,lx+bw-33,ly+1,26,a.color,'700');g.restore()}chartTexture.needsUpdate=true;}
const geom=new THREE.PlaneGeometry(SW,SH,NX,NY),base=Float32Array.from(geom.attributes.position.array);
const paperMat=new THREE.MeshStandardMaterial({map:chartTexture,color:0xffffff,side:THREE.DoubleSide,roughness:.8,metalness:0,transparent:true,alphaTest:.04});
const paper=new THREE.Mesh(geom,paperMat);paper.castShadow=true;paper.receiveShadow=true;
const group=new THREE.Group();group.add(paper);scene.add(group);
const shadow=new THREE.Mesh(new THREE.PlaneGeometry(4000,2400),new THREE.ShadowMaterial({opacity:.32}));shadow.position.z=-70;shadow.receiveShadow=true;shadow.visible=false;scene.add(shadow);
// One continuous surface with rounded, asymmetric side curls; centre chart coordinates remain stable.
function bend(q){
 const closing=1-q,inner=SW/6,wing=SW/2-inner;
 for(let iy=0;iy<=NY;iy++)for(let ix=0;ix<=NX;ix++){
  const k=(iy*(NX+1)+ix)*3,s=base[k],yy=base[k+1],sign=Math.sign(s),beyond=Math.max(0,Math.abs(s)-inner);
  const angle=closing*(s<0?3.18*(1+.37*(.5-yy/SH)):4.4);
  const radius=angle>.0001?wing/angle:1,theta=beyond/wing*angle;
  const xx=beyond&&angle>.0001?sign*(inner+radius*Math.sin(theta)):s;
  const zz=beyond&&angle>.0001?radius*(Math.cos(theta)-1):0;
  geom.attributes.position.setXYZ(iy*(NX+1)+ix,xx,yy,zz);
 }
 geom.attributes.position.needsUpdate=true;geom.computeVertexNormals();
}
const title=cv(700*2,190*2),tg=title.getContext('2d');tg.scale(2,2);tg.shadowColor='#0008';tg.shadowBlur=18;tg.shadowOffsetY=5;tg.beginPath();tg.roundRect(36,16,628,148,13);let gr=tg.createLinearGradient(36,16,664,164);gr.addColorStop(0,'#126a91');gr.addColorStop(.53,'#37355e');gr.addColorStop(1,'#511144');tg.fillStyle=gr;tg.fill();tg.shadowBlur=0;tg.lineWidth=3;tg.strokeStyle='#fff';tg.stroke();tg.save();tg.translate(350,90);tg.transform(1,0,-.08,1,0,0);tg.textAlign='center';tg.font='600 43px "PingFang SC"';tg.fillStyle='#fff';tg.fillText(C.title,0,0,564);tg.restore();tg.textAlign='center';text(tg,C.subtitle,350,133,18,'#b7a9c4','600');
const titleMesh=new THREE.Mesh(new THREE.PlaneGeometry(700,190),new THREE.MeshBasicMaterial({map:tx(title),transparent:true,depthTest:false,toneMapped:false}));titleMesh.renderOrder=10;scene.add(titleMesh);
function background(ctx,t){
 const a=ctx.createRadialGradient(940,300,60,960,550,1300);a.addColorStop(0,'#31484b');a.addColorStop(1,'#0b161a');ctx.fillStyle=a;ctx.fillRect(0,0,W,H);
 // Local approved character identity replaces the live presenter, without reusing her pixels.
 ctx.fillStyle='#102428';ctx.fillRect(90,600,1740,360);ctx.strokeStyle='#6d8877';ctx.lineWidth=4;ctx.strokeRect(90,600,1740,360);
 ctx.fillStyle='#79c55a';ctx.font='600 40px "PingFang SC"';ctx.fillText('机器马的动效工作台',80,100);
 const iw=img.width/4,ih=img.height/3;ctx.drawImage(img,iw,0,iw,ih*.915,480,80,960,900);
 const p=clamp((t-C.timing.wipeStart)/(C.timing.wipeEnd-C.timing.wipeStart));
 if(p>0){ctx.save();ctx.globalAlpha=.94+.06*p;ctx.fillStyle='#e5e5e5';ctx.beginPath();ctx.arc(960,540,1170*smooth(p),0,Math.PI*2);ctx.fill();ctx.restore()}
 if(p>.25){ctx.save();ctx.beginPath();ctx.arc(960,540,1170*smooth(p),0,Math.PI*2);ctx.clip();ctx.translate(960,540);const scale=.30+.70*smooth((t-.9)/.7);ctx.scale(scale,scale);ctx.rotate(t*.30);
  for(const [r,angle,len,col,width] of [[740,-1.1,1.45,'#fff',20],[900,1.12,1.2,'#787a9e',20],[760,2.12,.72,'#f3df25',10],[760,3.2,1.5,'#08c0d0',8],[740,1.95,.55,'#686b8c',4]]){ctx.strokeStyle=col;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.arc(0,0,r,angle,angle+len);ctx.stroke()}ctx.restore()}
}
function subtitle(ctx){ctx.save();ctx.translate(960,965);ctx.transform(1,0,-.11,1,0,0);ctx.textAlign='center';ctx.font='800 57px "PingFang SC"';ctx.lineJoin='round';ctx.shadowColor='#0004';ctx.shadowBlur=4;ctx.shadowOffsetY=4;ctx.strokeStyle='#181818';ctx.lineWidth=7;ctx.strokeText(C.caption,0,0);ctx.fillStyle='#fff';ctx.fillText(C.caption,0,0);ctx.restore()}
function at(t){const tm=C.timing;const arrived=clamp((t-tm.paperIn)/(tm.paperCentered-tm.paperIn));const opened=1-Math.pow(1-clamp((t-tm.unfoldStart)/(tm.unfoldEnd-tm.unfoldStart)),2);bend(opened);group.visible=t>=tm.paperIn;group.position.set(1000*(1-out(arrived))+30*(1-opened),36+12*(1-opened),0);group.rotation.set(0,0,-.12*(1-arrived));group.scale.setScalar(1+.08*(1-opened));titleMesh.visible=t>=1.26;titleMesh.position.set(1000*(1-out(arrived)),427,80);titleMesh.material.opacity=smooth((t-1.26)/.11);titleMesh.scale.setScalar(.94+.06*opened);return {arrived,opened}}
function presenter(ctx,t){const p=smooth((t-3.7)/.55);if(p<=0)return;ctx.save();ctx.globalAlpha=p;ctx.shadowColor='#0005';ctx.shadowBlur=18;ctx.fillStyle='#20372f';ctx.beginPath();ctx.roundRect(60,626,360,410,16);ctx.fill();ctx.shadowBlur=0;ctx.clip();const iw=img.width/4,ih=img.height/3;ctx.drawImage(img,iw,0,iw,ih*.915,15,627,450,420);ctx.restore()}
const shadowC=cv(W,H),sc=shadowC.getContext('2d');
MV.config({duration:C.duration,fps:30,bg:'#e5e5e5'});MV.scene('paper-chart',0,C.duration,({ctx,t})=>{background(ctx,t);annotationFrame(t);at(t);editCamera.run(camera,[0,0,0],t,()=>renderer.render(scene,camera));sc.clearRect(0,0,W,H);sc.drawImage(renderer.domElement,0,0);sc.globalCompositeOperation='source-in';sc.fillStyle='#000';sc.fillRect(0,0,W,H);sc.globalCompositeOperation='source-over';ctx.save();ctx.filter='blur(17px)';ctx.globalAlpha=.32;ctx.drawImage(shadowC,0,7);ctx.restore();ctx.drawImage(renderer.domElement,0,0);presenter(ctx,t);subtitle(ctx)});
window.paperDebug={renderer,scene,camera,group,paper,at,config:C};MV.start();
