// Camera gestures operate on the same parameters that are saved and rendered.
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
export function dragCamera(camera,dx,dy,width,height,pan=false){
 const out={...camera,animate:false};
 if(pan){out.panX=clamp((camera.panX||0)+dx/width,-.6,.6);out.panY=clamp((camera.panY||0)+dy/height,-.6,.6)}
 else{out.yaw=clamp(camera.yaw-dx/width*110,-65,65);out.pitch=clamp(camera.pitch+dy/height*65,-25,40)}
 return out;
}
export function zoomCamera(camera,delta){return {...camera,animate:false,zoom:clamp(camera.zoom*Math.exp(-delta*.0012),.65,1.7)}}
