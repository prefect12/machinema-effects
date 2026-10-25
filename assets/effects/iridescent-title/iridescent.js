import {createEffectCamera} from './effect-camera.js';
import * as THREE from './vendor/three.module.js';
const C=await fetch('./config.json').then(r=>r.json()),W=1920,H=1080;
const editCamera=createEffectCamera(C);
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>(x=clamp(x))*x*(3-2*x);
const blockFont=new FontFace('MotionBlock','local("Phosphate-Solid")');await blockFont.load();document.fonts.add(blockFont);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(W,H);renderer.setPixelRatio(1);
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);camera.position.z=1;
const material=new THREE.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,fragmentShader:`precision highp float;
varying vec2 vUv;uniform float time;
float field(vec2 p){float r=length(p),a=atan(p.y,p.x);float bend=.22*sin(r*1.5-a*2.+time*.12)+.17*sin(r*2.8+a*3.-time*.12);return a*5.+bend+.42*sin(a*4.+r*.55)+.28*sin(a*9.-r*.6+time*.1)+.10*sin(a*13.+r*.5);}
vec3 sheet(vec2 p){float r=length(p),a=atan(p.y,p.x),f=field(p);
 float s=sin(f),fold=pow(abs(s),.42);float light=.5+.5*cos(f+.9);float broad=pow(light,4.5);
 float ridge=exp(-pow((s-.05)/.052,2.));
 vec3 fringe=vec3(exp(-pow((s+.10)/.12,2.)),exp(-pow((s-.04)/.095,2.)),exp(-pow((s-.17)/.1,2.)));
 float second=sin(f*2.+.5*sin(a*3.+r*.8));vec3 fine=vec3(exp(-pow((second+.12)/.046,2.)),exp(-pow(second/.05,2.)),exp(-pow((second-.12)/.045,2.)));
 vec3 col=mix(vec3(.006,.012,.014),vec3(.08,.12,.13),fold*.7+broad*.3);
 float variance=.3+.7*pow(.5+.5*sin(a*4.+r*3.1),2.);
 col+=vec3(.22,.24,.23)*broad+fringe*.45+ridge*vec3(.82,.94,.89)*variance+fine*.22;
 float h=sin(f),hx=sin(field(p+vec2(.003,0.))),hy=sin(field(p+vec2(0.,.003)));
 vec3 normal=normalize(vec3((h-hx)*70.,(h-hy)*70.,1.));vec3 reflected=reflect(vec3(0.,0.,-1.),normal);
 float softbox=exp(-pow((reflected.y-.36)/.22,2.))*exp(-pow((reflected.x+.35)/.64,2.));
 col+=softbox*vec3(.34,.38,.37);col=mix(col,col*.67,smoothstep(.4,1.3,r)*.3);
 float vignette=1.-.42*smoothstep(.3,1.8,r);col*=vignette;
 return col;}
void main(){vec2 p=(vUv-.5)*vec2(3.55,2.);p.y=-p.y;vec3 col=sheet(p);float core=exp(-length(p)*72.);col+=core*.24;gl_FragColor=vec4(col,1.);}`});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
const img=await new Promise((r,j)=>{let a=new Image;a.onload=()=>r(a);a.onerror=j;a.src='./assets/xiaohei-expressions.svg'});
function host(g,t){const p=1-smooth(t/C.timing.hostOut);if(!p)return;g.save();g.globalAlpha=p*.72;g.fillStyle='#17211f';g.fillRect(0,0,W,H);g.fillStyle='#293a36';g.fillRect(0,650,W,430);const cw=img.width/4,ch=img.height/3;g.drawImage(img,cw,0,cw,ch*.915,440,80,1040,975);g.restore();}
// Rasterize the static heading once: canvas text-shadow caches otherwise vary at partial alpha.
await document.fonts.load('400 205px "PingFang SC"');
const heading=document.createElement('canvas');heading.width=1500;heading.height=340;
{const g=heading.getContext('2d',{willReadFrequently:true});g.translate(750,250);g.transform(1,0,-.08,1,0,0);g.textAlign='center';g.font='400 205px "PingFang SC"';g.lineJoin='round';g.lineWidth=3;g.strokeStyle='#141515';g.shadowColor='#0009';g.shadowBlur=4;g.shadowOffsetX=7;g.shadowOffsetY=9;g.strokeText(C.subtitle,0,0,1300);g.fillStyle='#fffef3';g.fillText(C.subtitle,0,0,1300);}
function title(g,t){const p=clamp((t-C.timing.titleIn)/(C.timing.titleFull-C.timing.titleIn));if(p<=0)return;g.save();g.textAlign='center';g.textBaseline='alphabetic';g.font='96px MotionBlock';let width=Math.min(1040,g.measureText(C.title).width);g.beginPath();g.rect(960-width/2-8,640,(width+16)*p,114);g.clip();g.lineJoin='bevel';g.shadowColor='#ddcf8a55';g.shadowBlur=8;g.strokeStyle='#090d0e';g.lineWidth=11;g.strokeText(C.title,960,727,width);g.shadowBlur=0;g.lineWidth=6;g.strokeStyle='#f1eed6';g.strokeText(C.title,960,727,width);g.lineWidth=1;g.fillStyle='#10191b';g.fillText(C.title,960,727,width);g.strokeStyle='#9d9d8c';g.strokeText(C.title,960,727,width);g.restore();
 const q=smooth((t-C.timing.subtitleIn)/(C.timing.subtitleFull-C.timing.subtitleIn));g.save();g.globalAlpha=q;g.drawImage(heading,210,335+14*(1-q));g.restore();}

function caption(g){g.save();g.translate(960,972);g.transform(1,0,-.08,1,0,0);g.textAlign='center';g.font='800 69px "PingFang SC"';g.lineJoin='round';g.strokeStyle='#030507';g.lineWidth=9;g.strokeText(C.caption,0,0,1700);g.fillStyle='white';g.fillText(C.caption,0,0,1700);g.restore();}
MV.config({duration:C.duration,fps:30,bg:'#080808'});MV.scene('iridescent-title',0,C.duration,({ctx,t})=>{material.uniforms.time.value=t;renderer.render(scene,camera);ctx.drawImage(renderer.domElement,0,0);host(ctx,t);editCamera.layer(ctx,t,g=>title(g,t),50);caption(ctx)});window.iridescentDebug={renderer,material,config:C};MV.start();
