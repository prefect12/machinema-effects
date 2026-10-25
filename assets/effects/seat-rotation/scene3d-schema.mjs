// Shared validation for browser import and offline rendering. Reject invalid files;
// never silently replace the user's camera or animation settings.
export function validateConfig(c) {
  if(c?.schema !== 'xiaolin-seat-scene/1') throw Error('这不是席位场景的参数文件。');
  const number=(v,a,b,name)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<a||v>b)throw Error(`${name}须在 ${a}–${b} 之间。`)};
  number(c.duration,2,60,'动作时长');
  if(c.content){const x=c.content;for(const [k,min,max]of [['fixedCount',1,6],['seatCount',1,5],['columns',1,6]]){number(x[k],min,max,k);if(!Number.isInteger(x[k]))throw Error(k+'必须是整数');}if(!Array.isArray(x.items)||x.items.length<1||x.items.length>12)throw Error('下层对象须为1–12个');if(!Array.isArray(x.portraits)||x.portraits.length<x.fixedCount+x.seatCount+1+((x.chairIndex??0)>=x.fixedCount?1:0)||x.portraits.length>36)throw Error('图片不足以区分固定、轮换与候选对象');if(!Number.isInteger(x.chairIndex??0)||(x.chairIndex??0)<0||(x.chairIndex??0)>=x.portraits.length)throw Error('中心对象编号越界');for(const item of [...x.items,...x.portraits]){if(item.image&&typeof item.image.src!=='string')throw Error('图片路径无效');}number(x.spacing??2.76,1.5,3.1,'下层间距');}
  if(c.camera?.sway){for(const [k,a,b] of [['period',3,60],['yaw',0,15],['pitch',0,8],['roll',0,5],['zoom',0,.15]])number(c.camera.sway[k],a,b,'持续运镜 '+k);}
  for(const k of ['roll','endRoll'])if(c.camera?.[k]!==undefined)number(c.camera[k],-45,45,'画面倾斜');
  for(const k of ['panX','panY'])if(c.camera?.[k]!==undefined)number(c.camera[k],-.6,.6,'画面位置');
  if(c.layout?.driftY!==undefined)number(c.layout.driftY,-.5,.5,'全段下移');
  for(const k of ['outDuration','inDuration'])if(c.motion?.[k]!==undefined)number(c.motion[k],.0005,.5,'飞行占比');
  if(c.motion?.easing!==undefined&&!['linear','smooth'].includes(c.motion.easing))throw Error('未知的动作缓动方式。');
  for(const k of ['yaw','endYaw']) number(c.camera?.[k],-65,65,'水平视角');
  for(const k of ['pitch','endPitch']) number(c.camera?.[k],-25,40,'俯仰');
  for(const k of ['zoom','endZoom']) number(c.camera?.[k],.65,1.7,'缩放');
  number(c.layout?.depth,.2,3,'层间距离');number(c.motion?.arc,0,4,'轨迹弧度');number(c.motion?.travel,.4,2,'飞行时长');number(c.look?.glow,0,2,'光环亮度');
  for(const [k,a,b] of [['portraitBrightness',.5,1.4],['portraitMinimum',.65,1],['portraitScale',.8,1.5]])if(c.look?.[k]!==undefined)number(c.look[k],a,b,k);
  for(const k of ['portraitBackground','portraitBorder'])if(c.look?.[k]!==undefined&&!/^#[0-9a-f]{6}$/i.test(c.look[k]))throw Error('头像颜色须为六位十六进制颜色');
  for(const [o,k] of [[c.camera,'animate'],[c.look,'rings'],[c.look,'paths']])if(typeof o?.[k]!=='boolean')throw Error(`参数 ${k} 必须是开关。`);
  for(const k of ['title','subtitle','lower','chair'])if(typeof c.text?.[k]!=='string'||c.text[k].length>60)throw Error('文字须少于 60 字。');
  if(!Array.isArray(c.events)||c.events.length<1||c.events.length>60)throw Error('交接事件须为1–60次。');
  for(const e of c.events){for(const [k,max] of [['slot',(c.content?.seatCount??5)-1],['from',(c.content?.items.length??12)-1],['to',(c.content?.items.length??12)-1]])if(!Number.isInteger(e[k])||e[k]<0||e[k]>max)throw Error('席位或候选编号无效。');number(e.start,0,.98,'事件起点');number(e.arrival,e.start+.0005,1,'入席时间');}
  for(const e of c.events){if(e.start+(c.motion.outDuration??.1)*c.motion.travel>1)throw Error('离席飞行超出片尾，请提前离席时间或缩短飞行时长。');if(e.arrival-(c.motion.inDuration??.055)*c.motion.travel<0)throw Error('入席飞行早于片头，请推迟入席时间或缩短飞行时长。');}
  for(let i=0;i<c.events.length;i++)for(let j=i+1;j<c.events.length;j++){const a=c.events[i],b=c.events[j];if(a.slot===b.slot&&a.start<b.arrival&&b.start<a.arrival)throw Error('同一个席位的空缺时间不能重叠。');}
  if(c.sequence){for(const k of ['dimEnd','focusStart','focusEnd','relightStart','relightEnd'])number(c.sequence[k],0,1,'阶段时间');if(c.sequence.focusEnd<=c.sequence.focusStart||c.sequence.relightEnd<=c.sequence.relightStart)throw Error('阶段结束须晚于开始。');}
  if(c.castPolicy!==undefined&&!['cycle-costumes','bank-preference'].includes(c.castPolicy))throw Error('角色轮换策略无效。');
  const out=structuredClone(c);for(const k of ['roll','endRoll','panX','panY'])out.camera[k]??=0;out.layout.driftY??=0;return out;
}
