import {createEffectCamera} from './effect-camera.js';
import * as THREE from './vendor/three.module.js';
const C=await fetch('./config.json').then(r=>r.json()),W=1920,H=1080;
const editCamera=createEffectCamera(C);
await Promise.all([document.fonts.load('900 216px "PingFang SC"'),document.fonts.load('32px "Arial"')]);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(W,H);renderer.setPixelRatio(1);
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1.7777778,1.7777778,1,-1,.1,20);camera.position.z=5;
const noise=`
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float f=0.,a=.5;for(int i=0;i<3;i++){f+=a*noise(p);p=mat3(.8,.6,0,-.6,.8,0,0,0,1)*p*2.04+vec3(2.1,4.8,7.2);a*=.49;}return f;}
float heightAt(vec2 p,float t){float r=length(p+vec2(.1,.8)),a=atan(p.y+.8,p.x+.1);vec2 q=vec2(r*1.5,a*1.2);float warp=fbm(vec3(q*1.3,t*.5));return fbm(vec3(p*4.+vec2(warp*2.4,-t)+vec2(sin(a*5.+t),cos(r*5.-t))*.4,t*.4))+.18*fbm(vec3(p*9.+t*.3,t*.2));}
`;
const mat=new THREE.ShaderMaterial({uniforms:{eye:{value:new THREE.Vector3(0,0,5)},time:{value:0},relief:{value:C.relief},brightness:{value:C.brightness}},vertexShader:`uniform float time,relief;varying vec2 base;varying vec3 pos;${noise}void main(){base=position.xy;vec3 p=position;p.z=(heightAt(base,time)-.65)*relief;pos=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`precision highp float;uniform float time,relief,brightness;uniform vec3 eye;varying vec2 base;varying vec3 pos;${noise}
float softbox(vec3 r,vec3 center,float spread){return pow(max(0.,dot(r,normalize(center))),spread);}
void main(){float e=.004,h=heightAt(base,time);vec3 n=normalize(vec3((h-heightAt(base+vec2(e,0),time))/e*relief,(h-heightAt(base+vec2(0,e),time))/e*relief,1.));vec3 v=normalize(eye-pos),r=reflect(-v,n);float fres=.04+.96*pow(1.-max(dot(n,v),0.),5.);float studio=softbox(r,vec3(-.7,.8,1),16.)*.75+softbox(r,vec3(.6,.4,1),45.)*1.1+softbox(r,vec3(-1.,-.6,.7),25.)*.4;float env=.001+studio*(.4+fres);float dark=smoothstep(-1.,.4,base.y)*.65+.35;float glint=0.;vec3 c=vec3((env*dark+glint)*brightness);c*=.72+.28*smoothstep(2.,.2,length(base));gl_FragColor=vec4(c,1.);\n#include <colorspace_fragment>}`});
const mesh=new THREE.Mesh(new THREE.PlaneGeometry(4,2.3,384,216),mat);scene.add(mesh);
const mask=Object.assign(document.createElement('canvas'),{width:W,height:H}),mg=mask.getContext('2d'),letter=Object.assign(document.createElement('canvas'),{width:W,height:H}),lg=letter.getContext('2d'),drips=Object.assign(document.createElement('canvas'),{width:W,height:H}),dg=drips.getContext('2d');
let seed=C.seed;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
function titleCanvas(g,stroke=false){g.save();g.translate(960,590);g.transform(1,0,-.10,1,0,0);g.font='900 216px "PingFang SC"';g.textAlign='center';g.letterSpacing='20px';g.fillStyle='#fff';g.strokeStyle='#d9d9dc';g.lineWidth=1.4;if(stroke)g.strokeText(C.title,0,0);else g.fillText(C.title,0,0);g.restore()}
titleCanvas(mg);
// Irregular clipped polygons cut through the glyph interiors; the contours remain.
lg.drawImage(mask,0,0);lg.globalCompositeOperation='destination-out';
for(let i=0;i<85;i++){const x=470+rand()*1030,y=380+rand()*215,s=15+rand()*65;lg.beginPath();lg.moveTo(x,y);lg.lineTo(x+s,y+rand()*12);lg.lineTo(x+s*.8,y+s*(.7+rand()));lg.lineTo(x-s*.2,y+s*.8);lg.closePath();lg.fill()}
lg.globalCompositeOperation='source-over';titleCanvas(lg,true);
const drops=Array.from({length:12},(_,i)=>({x:i*W/11-35,w:45+rand()*75,y:-160-rand()*130,len:500+rand()*800,phase:rand()*6,speed:.12+rand()*.18}));
function drawDrips(t){dg.clearRect(0,0,W,H);dg.fillStyle='#97979c';
 for(const d of drops){const x=d.x+18*Math.sin(t*d.speed+d.phase),bottom=d.y+d.len+50*Math.sin(d.phase+t*.17);dg.beginPath();dg.moveTo(x-d.w,d.y);for(let y=d.y;y<bottom-d.w*.5;y+=26){const q=(y-d.y)/d.len,w=d.w*(.7+.22*Math.sin(q*17+t*.2+d.phase));dg.lineTo(x-w+17*Math.sin(q*8+d.phase+t*.14),y)}dg.quadraticCurveTo(x,bottom+d.w*.75,x+d.w*.4,bottom-d.w*.4);for(let y=bottom-d.w*.5;y>d.y;y-=26){const q=(y-d.y)/d.len,w=d.w*(.65+.27*Math.sin(q*19+t*.2+d.phase));dg.lineTo(x+w+17*Math.sin(q*8+d.phase+t*.14),y)}dg.closePath();dg.fill()}
 dg.globalCompositeOperation='destination-out';for(let i=0;i<19;i++){const x=(i*173+150)%W,y=80+(i*91)%450;dg.beginPath();dg.ellipse(x+8*Math.sin(t*.2+i),y,16+(i%3)*12,30+(i%4)*21,.1*Math.sin(i),0,Math.PI*2);dg.fill()}dg.globalCompositeOperation='source-over';}
MV.config({duration:C.duration,fps:C.fps,bg:'#050507'});MV.scene('liquid-oil',0,C.duration,({ctx,t})=>{mat.uniforms.time.value=t*C.speed;editCamera.run(camera,[0,0,0],t,()=>{mat.uniforms.eye.value.copy(camera.position);renderer.render(scene,camera)});ctx.save();ctx.filter="blur(2.2px)";ctx.drawImage(renderer.domElement,-4,-4,W+8,H+8);ctx.restore();drawDrips(t);ctx.save();ctx.globalAlpha=C.foregroundOpacity;ctx.drawImage(drips,0,0);ctx.restore();ctx.drawImage(letter,0,0);ctx.save();ctx.textAlign='center';ctx.font='300 32px Arial';ctx.fillStyle='#8b8b8d';ctx.fillText(C.eyebrow,960,320);ctx.font='28px "PingFang SC"';ctx.letterSpacing='8px';ctx.fillText(C.subtitle,960,854);ctx.restore()});window.oilDebug={scene,renderer,mesh,mat};MV.start();
