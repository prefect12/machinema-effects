const rad=n=>n*Math.PI/180;
export function projectLayer(points,camera,pivot,depth=0){
 if(camera.animate){depth=0;if(!(camera.yaw||camera.pitch||camera.roll||camera.panX||camera.panY)&&(camera.zoom??1)===1)return points;}
 const yaw=rad(camera.yaw||0),pitch=rad(camera.pitch||0),roll=rad(camera.roll||0),F=1600;
 const [cx,cy,cw]=pivot,base=F*cw,zoom=camera.zoom??1;
 return points.map(([x,y,w])=>{
  const X=(x-cx)*w,Y=-(y-cy)*w,Z=F*(cw-w)+depth;
  const a=X*Math.cos(yaw)+Z*Math.sin(yaw),b=-X*Math.sin(yaw)+Z*Math.cos(yaw);
  const c=Y*Math.cos(pitch)-b*Math.sin(pitch),d=Y*Math.sin(pitch)+b*Math.cos(pitch);
  const xx=a*Math.cos(roll)-c*Math.sin(roll),yy=a*Math.sin(roll)+c*Math.cos(roll),z=Math.max(F*.12,base-d);
  return [cx+F*xx/z*zoom+(camera.panX||0)*1920,cy-F*yy/z*zoom+(camera.panY||0)*1080,z/F];
 });
}
