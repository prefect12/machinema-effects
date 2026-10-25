import * as THREE from './vendor/three.module.js';

// Shared by the standalone effect projects. Only the subject is transformed;
// a component chooses which layers remain anchored to the screen.
export const cameraDefaults = {yaw:0,pitch:0,zoom:1,roll:0,panX:0,panY:0,animate:true,endYaw:0,endPitch:0,endZoom:1,endRoll:0,endPanX:0,endPanY:0};
const W=1920,H=1080,rad=Math.PI/180;
export function createEffectCamera(config) {
  config.camera={...cameraDefaults,...config.camera};
  let lastTime=0,layerRenderer,layerScene,layerMaterial,layerTexture,buffer;
  const pose=t=>{
    lastTime=t;const p={...config.camera};
    if(p.animate){let q=Math.max(0,Math.min(1,t/config.duration));q=q*q*(3-2*q);
      for(const k of ['yaw','pitch','zoom','roll','panX','panY']){const e='end'+k[0].toUpperCase()+k.slice(1);p[k]+=(p[e]-p[k])*q;}}
    return p;
  };
  const identity=p=>!p.yaw&&!p.pitch&&!p.roll&&!p.panX&&!p.panY&&p.zoom===1;
  function run(camera,target,t,draw){
    const p=pose(t);if(identity(p))return draw();
    const old={position:camera.position.clone(),quaternion:camera.quaternion.clone(),up:camera.up.clone(),zoom:camera.zoom,projection:camera.projectionMatrix.clone(),inverse:camera.projectionMatrixInverse.clone()};
    const pivot=new THREE.Vector3(...target),rotation=new THREE.Euler(p.pitch*rad,p.yaw*rad,0,'YXZ');
    const offset=camera.position.clone().sub(pivot).applyEuler(rotation);
    if(camera.isPerspectiveCamera)offset.divideScalar(p.zoom);else camera.zoom*=p.zoom;
    camera.position.copy(pivot).add(offset);
    camera.up.set(0,1,0).applyQuaternion(old.quaternion).applyEuler(rotation);
    camera.lookAt(pivot);camera.rotateZ(-p.roll*rad);camera.updateProjectionMatrix();
    const m=camera.projectionMatrix.elements;
    if(camera.isPerspectiveCamera){m[8]-=2*p.panX;m[9]+=2*p.panY;}
    else {m[12]+=2*p.panX;m[13]-=2*p.panY;}
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();camera.updateMatrixWorld(true);
    try{return draw();}finally{
      camera.position.copy(old.position);camera.quaternion.copy(old.quaternion);camera.up.copy(old.up);camera.zoom=old.zoom;
      camera.projectionMatrix.copy(old.projection);camera.projectionMatrixInverse.copy(old.inverse);camera.updateMatrixWorld(true);
    }
  }
  function paint(ctx,source,t,depth=0){
    const p=pose(t);if(identity(p)){ctx.drawImage(source,0,0,W,H);return;}
    if(!layerRenderer){
      layerRenderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});layerRenderer.setPixelRatio(1);layerRenderer.setSize(W,H);layerRenderer.setClearColor(0,0);
      layerTexture=new THREE.CanvasTexture(source);layerTexture.colorSpace=THREE.SRGBColorSpace;layerTexture.minFilter=THREE.LinearFilter;layerTexture.magFilter=THREE.LinearFilter;
      layerMaterial=new THREE.ShaderMaterial({transparent:true,depthTest:false,uniforms:{image:{value:layerTexture},rotation:{value:new THREE.Matrix3()},zoom:{value:1},pan:{value:new THREE.Vector2()},layerDepth:{value:0}},
        vertexShader:`varying vec2 vUv;uniform mat3 rotation;uniform float zoom,layerDepth;uniform vec2 pan;void main(){vUv=uv;vec3 p=rotation*vec3(position.x*960.,position.y*540.,layerDepth);float w=max(160.,1600.-p.z);gl_Position=vec4(p.x*1600.*zoom/960.+2.*pan.x*w,p.y*1600.*zoom/540.-2.*pan.y*w,0.,w);}`,
        fragmentShader:`varying vec2 vUv;uniform sampler2D image;void main(){gl_FragColor=texture2D(image,vUv);\n#include <colorspace_fragment>\n}`});
      layerScene=new THREE.Scene();layerScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),layerMaterial));
    }
    layerTexture.image=source;layerTexture.needsUpdate=true;
    layerMaterial.uniforms.rotation.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-p.pitch*rad,-p.yaw*rad,-p.roll*rad,'YXZ')));
    layerMaterial.uniforms.zoom.value=p.zoom;layerMaterial.uniforms.pan.value.set(p.panX,p.panY);layerMaterial.uniforms.layerDepth.value=depth;
    layerRenderer.render(layerScene,new THREE.Camera());ctx.drawImage(layerRenderer.domElement,0,0,W,H);
  }
  function layer(ctx,t,draw,depth=0){
    if(identity(pose(t))){draw(ctx);return;}
    buffer??=Object.assign(document.createElement('canvas'),{width:W,height:H});const g=buffer.getContext('2d');
    g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,W,H);draw(g);paint(ctx,buffer,t,depth);
  }
  const api={current:()=>({...pose(lastTime),animate:false}),update:value=>{config.camera={...cameraDefaults,...value};},run,paint,layer};
  window.effectCamera=api;return api;
}
