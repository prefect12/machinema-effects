import {createEffectCamera} from './effect-camera.js';
import * as THREE from './vendor/three.module.js';
const C=await fetch('./config.json').then(r=>r.json()),W=1920,H=1080,T=C.timing;
const editCamera=createEffectCamera(C);
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>(x=clamp(x))*x*(3-2*x),cv=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
const load=src=>new Promise((ok,no)=>{let a=new Image;a.onload=()=>ok(a);a.onerror=no;a.src=src});const [city,host]=await Promise.all(['city','presenter'].map(n=>load(`./assets/${n}.svg`)));
await document.fonts.load('900 660px "PingFang SC"');
function heading(text,size,width){const a=cv(W,H),g=a.getContext('2d');g.translate(960,700);g.transform(1,0,-.08,1,0,0);g.font=`900 ${size}px "PingFang SC"`;g.textAlign='center';g.fillStyle='#fff';g.strokeStyle='#fff';g.lineWidth=9;g.lineJoin='bevel';g.strokeText([...text].join(' '),0,0,width);g.fillText([...text].join(' '),0,0,width);return a}
const textures={city:new THREE.Texture(city),cold:new THREE.CanvasTexture(heading(C.coldTitle,660,1460)),warm:new THREE.CanvasTexture(heading(C.warmTitle,330,1660))};for(const t of Object.values(textures)){t.needsUpdate=true;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter}
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:true});renderer.setSize(W,H);renderer.setPixelRatio(1);renderer.setClearColor(0,0);
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);camera.position.z=1;
const mat=new THREE.ShaderMaterial({transparent:true,uniforms:{time:{value:0},coldState:{value:0},fireAlpha:{value:1},pass:{value:0},city:{value:textures.city},cold:{value:textures.cold},warm:{value:textures.warm}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,fragmentShader:`precision highp float;
varying vec2 vUv;uniform sampler2D city,cold,warm;uniform float time,coldState,fireAlpha,pass;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(7.,3.);a*=.5;}return v;}
float ice(vec2 p){float g=fbm(p*vec2(85.,150.));float ridges=pow(.5+.5*sin(p.x*700.+p.y*1100.+g*22.),9.);float grains=noise(p*vec2(560.,380.));return g*.50+grains*.26+ridges*.24;}
void main(){vec2 uv=vUv;
if(pass>.5){float n=fbm(vec2(uv.x*7.,uv.y*4.-time*1.2));vec2 flow=vec2(uv.x*12.+(n-.5)*2.5,uv.y*8.-time*2.2);float turbulent=fbm(flow);float fine=fbm(flow*2.7+vec2(1.,time*.6));float field=turbulent*.7+fine*.3-uv.y*1.7;float density=smoothstep(.20,.53,field);float a=smoothstep(.19,.30,field)*fireAlpha;vec3 flame=mix(vec3(.45,.008,.001),vec3(1.,.14,.003),smoothstep(.0,.6,density));flame=mix(flame,vec3(1.,.85,.18),pow(density,3.));flame+=vec3(.4,.12,.0)*pow(max(0.,fine-.35),2.);gl_FragColor=vec4(flame,a);return;}
vec3 bg=texture2D(city,(uv-.5)/(1.+time*.0015)+.5).rgb;vec3 warmBg=bg*vec3(.94,.32,.25),coldBg=bg*vec3(.56,.60,.70);vec3 col=mix(warmBg,coldBg,coldState);
float mask=mix(texture2D(warm,uv).a,texture2D(cold,uv).a,coldState),shadow=texture2D(cold,uv+vec2(-6./1920.,7./1080.)).a*coldState;col*=1.-.40*shadow*(1.-mask);
if(mask>0.){float f=ice(uv),hx=ice(uv+vec2(1./1920.,0)),hy=ice(uv+vec2(0,1./1080.));vec3 normal=normalize(vec3((f-hx)*11.,(f-hy)*11.,1.));float light=max(0.,dot(normal,normalize(vec3(-.6,.7,.7))));float sparkle=pow(noise(uv*vec2(800.,460.)),12.);
vec3 material=vec3(.11,.18,.27)+vec3(.24,.28,.33)*f+vec3(.25,.28,.32)*light+sparkle*.45;
float dx=texture2D(cold,uv+vec2(5./1920.,0)).a-texture2D(cold,uv-vec2(5./1920.,0)).a;float dy=texture2D(cold,uv+vec2(0,5./1080.)).a-texture2D(cold,uv-vec2(0,5./1080.)).a;material+=vec3(.32,.42,.54)*max(0.,-dx+dy);material*=1.-.33*max(0.,dx-dy);
col=mix(col,mix(vec3(.70,.014,.007),material,coldState),mask);}
gl_FragColor=vec4(col,1.);}`});scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat));
let seed=19573;function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
const crystals=[];function segment(x,y,angle,len,width,birth){const x2=x+Math.cos(angle)*len,y2=y+Math.sin(angle)*len;crystals.push({x,y,x2,y2,width,birth,end:birth+len/500});return[x2,y2]}
// Dense branching needles, with a shared absolute-time growth front per crystal.
for(let i=0;i<240;i++){let edge=i%4,x,y,a;if(edge===0){x=rnd()*W;y=-20;a=.3+rnd()*2.5}else if(edge===1){x=W+20;y=rnd()*H;a=2+rnd()*2.3}else if(edge===2){x=rnd()*W;y=H+20;a=3.5+rnd()*2.5}else{x=-20;y=rnd()*H;a=-1.2+rnd()*2.4}
 const len=70+rnd()*260,birth=rnd()*.32,start=[x,y],end=segment(x,y,a,len,1+rnd()*1.8,birth);for(let j=1;j<14;j++){let p=j/14,xx=start[0]+(end[0]-start[0])*p,yy=start[1]+(end[1]-start[1])*p;for(const side of [-1,1]){const l=(1-p)*len*(.20+rnd()*.24),aa=a+side*(.30+rnd()*.32),b=birth+p*len/500;let e=segment(xx,yy,aa,l,.4+rnd()*.7,b);for(let k=1;k<5;k++){let q=k/5;segment(xx+(e[0]-xx)*q,yy+(e[1]-yy)*q,aa+side*.45,(1-q)*l*.30,.35,b+q*l/500)}}}}
for(let i=0;i<2100;i++){let edge=i%4,x,y,a;if(edge===0){x=rnd()*W;y=rnd()*150;a=rnd()*3.14}else if(edge===1){x=W-rnd()*170;y=rnd()*H;a=1.57+rnd()*3.14}else if(edge===2){x=rnd()*W;y=H-rnd()*180;a=3.14+rnd()*3.14}else{x=rnd()*170;y=rnd()*H;a=-1.57+rnd()*3.14}segment(x,y,a,50+rnd()*210,.25+rnd()*.5,rnd()*.6)}
function frost(g,t){let age=(t-T.frostStart)/(T.frostFull-T.frostStart);if(age<=0)return;g.save();g.lineCap='round';for(const s of crystals){let p=clamp((age-s.birth)/(s.end-s.birth));if(!p)continue;g.strokeStyle='rgba(183,202,216,.23)';g.lineWidth=s.width+1.1;g.beginPath();g.moveTo(s.x,s.y);g.lineTo(s.x+(s.x2-s.x)*p,s.y+(s.y2-s.y)*p);g.stroke();g.strokeStyle='rgba(229,239,242,.37)';g.lineWidth=s.width*.45;g.beginPath();g.moveTo(s.x,s.y-1);g.lineTo(s.x+(s.x2-s.x)*p,s.y+(s.y2-s.y)*p-1);g.stroke()}g.restore()}
MV.config({duration:C.duration,fps:30,bg:'#050a13'});MV.scene('frost-title',0,C.duration,({ctx,t})=>{mat.uniforms.time.value=t;mat.uniforms.coldState.value=t>=T.coldCut?1:0;mat.uniforms.pass.value=0;renderer.render(scene,camera);editCamera.paint(ctx,renderer.domElement,t);
let down=smooth((t-T.hostDownStart)/(T.hostDownEnd-T.hostDownStart));if(down<1){const cell=host.width/2;ctx.drawImage(host,0,cell,cell,cell,640,410+760*down,740,740)}
let flame=1-smooth((t-T.coldCut)/(T.fireOut-T.coldCut));if(flame>0){mat.uniforms.pass.value=1;mat.uniforms.fireAlpha.value=flame;renderer.render(scene,camera);editCamera.paint(ctx,renderer.domElement,t)}editCamera.layer(ctx,t,g=>frost(g,t),35)});MV.start();
