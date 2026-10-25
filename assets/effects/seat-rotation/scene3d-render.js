import {createSeatScene} from './scene3d.js';
import {validateConfig} from './scene3d-schema.mjs';
const cfg=validateConfig(await fetch('./scene3d-config.json').then(r=>r.json()));
MV.config({duration:cfg.duration,fps:30,bg:'#05060d'});
const scene=await createSeatScene(document.createElement('canvas'),cfg);scene.resize(MV.W(),MV.H());
let lastState;
window.seatCamera={
 current:()=>({...structuredClone(cfg.camera),...(lastState?.camera||{}),animate:false}),
 update:camera=>{cfg.camera=structuredClone(camera);scene.setCamera(camera)}
};
MV.scene('editable-seat-scene',0,cfg.duration,({ctx,t})=>{lastState=scene.render(t);ctx.drawImage(scene.canvas,0,0,1920,1080)});MV.start();
