// Shared preview/export adapter. Retiming queries the original absolute-time scene.
(()=>{const raw=MV.config.bind(MV),scene=MV.scene.bind(MV),start=MV.start.bind(MV);let baseDuration=0,outputScale=1,settings={speed:1,view:{}};
const ready=fetch('./workbench-settings.json').then(r=>r.json()).then(v=>settings=v);
MV.config=c=>{baseDuration=c.duration;outputScale=settings.resolution===2160?2:1;return raw({...c,width:(c.width||1920)*outputScale,height:(c.height||1080)*outputScale,duration:c.duration/(settings.speed||1)})};
MV.scene=(id,a,b,draw)=>scene(id,a/(settings.speed||1),b/(settings.speed||1),o=>{const t=o.t*(settings.speed||1),q=Math.min(1,t/baseDuration),v=settings.view||{},f=k=>{let a=v[k]??(k==='zoom'?1:0),b=v['end'+k[0].toUpperCase()+k.slice(1)]??a;return a+(b-a)*(q*q*(3-2*q))};o.ctx.save();o.ctx.scale(outputScale,outputScale);o.ctx.translate(960+f('panX'),540+f('panY'));o.ctx.rotate(f('roll')*Math.PI/180);o.ctx.scale(f('zoom'),f('zoom'));o.ctx.translate(-960,-540);draw({...o,t});o.ctx.restore()});
// Module scripts may run before the fetch resolves. Block their config fetch until ready.
const orig=window.fetch.bind(window);window.fetch=async(...a)=>{if(String(a[0]).includes('config.json'))await ready;return orig(...a)};
MV.start=(...args)=>start(...args);
window.addEventListener('error',e=>{window.workbenchError=e.message});window.addEventListener('unhandledrejection',e=>{window.workbenchError=String(e.reason?.message||e.reason)});
})();
