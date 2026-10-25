#!/usr/bin/env python3
"""Local effect workbench: versioned previews and real MP4 exports. No remote AI calls."""
import argparse,base64,hashlib,json,mimetypes,os,re,shutil,subprocess,sys,threading,time,uuid
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlsplit,unquote
ROOT=Path(__file__).resolve().parents[1]
AP=argparse.ArgumentParser();AP.add_argument('--port',type=int,default=8878);AP.add_argument('--work',type=Path,required=True);AP.add_argument('--outputs',type=Path,required=True);A=AP.parse_args()
WORK=A.work.resolve();OUT=A.outputs.resolve();WORK.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
ORDER=['seat-rotation','table-row-depth','table-row-perspective','paper-chart','document-focus','coin-reveal','capsule-material','house-bubbles','mechanical-title','liquid-oil','iridescent-title','gold-reveal','frost-title','particle-dissolve','map-routes','cycle-vortex']
NAMES=['空间组织与对象交接','表格白行浮出','透视表格双层强调','曲面图纸展开','弯曲纸页与原文焦点','金属币与三牌揭示','透明胶囊','玻璃气泡群','悬浮机械零件','黑色流体标题','虹彩金属标题','金色答案揭晓','冰霜冷暖转换','粒子消散','地形地图与路线','闭环粒子涡流']
KEYS=[['text','camera','layout','motion','look','content','events'],['headers','units','rows','primary_row','caption','motionTiming','camera'],['headers','units','rows','primary_row','caption','camera'],['title','subtitle','caption','unit','dataNote','values','range','xLabels','annotations','timing'],['title','subtitle','caption','translation','number','timing'],['titles','caption','timing','homography'],['shellColor','attenuationColor','attenuationDistance','ior','roughness','thickness','focus','aperture','hero','seed'],['colors','ior','thickness','roughness','focus','aperture','caption','captionStart','seed'],['title','subtitle','focusIn','seed'],['title','eyebrow','subtitle','speed','relief','brightness','foregroundOpacity','seed'],['title','subtitle','caption','timing'],['title','english','symbol','caption','timing'],['warmTitle','coldTitle','timing'],['cards','caption','particleStep'],['caption','english','timing','geography'],['labels','caption','timing']]
KEYS=[list(dict.fromkeys([*keys,'camera'])) for keys in KEYS]
NATIVE_CAMERA={'seat-rotation','paper-chart','document-focus','capsule-material','house-bubbles','mechanical-title','liquid-oil','gold-reveal','map-routes'}
HIGH_RES={'seat-rotation','table-row-depth','table-row-perspective'}
CAT={x['id']:x for x in json.load(open(ROOT/'catalog.json'))}
JOBS={};JOBLOCK=threading.Lock();RENDERLOCK=threading.Lock()
def read(p):return json.loads(p.read_text())
def descriptors():
 result=[]
 for i,eid in enumerate(ORDER):
  p=ROOT/eid;cf='scene3d-config.json' if eid=='seat-rotation' else 'config.json';c=read(p/cf)
  if eid=='seat-rotation':c=read(p/'presets/team.json')
  if eid=='table-row-depth':c.setdefault('motionTiming',{'start':.5333333,'full':.8666667})
  assets=[str(f.relative_to(p))for f in (p/'assets').glob('*')if f.suffix.lower() in ['.png','.jpg','.jpeg','.webp','.svg'] and f.stat().st_size<30*1024**2]
  entry={'id':eid,'name':NAMES[i],'configFile':cf,'entry':'render3d.html'if eid=='seat-rotation'else'index.html','config':c,'keys':[k for k in KEYS[i]if k in c],'assets':assets,'presets':read(p/'presets/index.json')if eid=='seat-rotation'else [],'extra':{'assets/document.json':read(p/'assets/document.json')}if eid=='document-focus'else {}}
  entry['cameraMode']='三维相机' if eid in NATIVE_CAMERA else '分层透视' if eid.startswith('table-') else '图层透视'
  entry['resolutions']=[1080,2160] if eid in HIGH_RES else [1080]
  result.append(entry)
 return result
DESC=descriptors();BYID={e['id']:e for e in DESC}
def validate(payload):
 eid=payload.get('effect');assert eid in BYID,'未知特效';d=BYID[eid];c=payload.get('config');assert isinstance(c,dict),'缺少配置'
 c={**d['config'],**{k:v for k,v in c.items()if k in d['keys']}}
 def scan(v):
  if isinstance(v,dict):
   for key,item in v.items():
    if key=='src':assert isinstance(item,str)and(item.startswith('data:image/')or(item.startswith('./assets/')and'..'not in item)),'仅支持本地素材或嵌入图片'
    scan(item)
  elif isinstance(v,list):
   assert len(v)<10000,'数据数组过长'
   for item in v:scan(item)
  elif isinstance(v,float):assert abs(v)<1e9,'参数范围无效'
 scan(c)
 if eid=='seat-rotation':
  proc=subprocess.run(['node','--input-type=module','-e',"import {validateConfig} from "+json.dumps(str(ROOT/eid/'scene3d-schema.mjs'))+";let s='';for await(const c of process.stdin)s+=c;validateConfig(JSON.parse(s));"],input=json.dumps(c),text=True,capture_output=True)
  if proc.returncode:raise ValueError(proc.stderr[-1200:])
 if eid.startswith('table-'):
  assert 1<=len(c['rows'])<=8,'表格当前支持1–8行';assert 0<=c['primary_row']<len(c['rows']),'重点行超出范围'
  camera=c['camera'];assert isinstance(camera,dict)and isinstance(camera.get('animate'),bool),'表格相机参数无效'
  for k,lo,hi in [('yaw',-65,65),('pitch',-25,40),('zoom',.65,1.7),('roll',-45,45),('panX',-.6,.6),('panY',-.6,.6),('anchorTime',0,c['duration'])]:
   assert lo<=float(camera.get(k,1 if k=='zoom' else 0))<=hi,'表格相机参数越界：'+k
 if eid!='seat-rotation' and not eid.startswith('table-'):
  camera=c['camera'];assert isinstance(camera,dict)and isinstance(camera.get('animate'),bool),'相机参数无效'
  for k,lo,hi in [('yaw',-65,65),('pitch',-25,40),('zoom',.65,1.7),('roll',-45,45),('panX',-.6,.6),('panY',-.6,.6)]:
   for name in [k,'end'+k[0].upper()+k[1:]]:
    assert lo<=float(camera.get(name,1 if k=='zoom' else 0))<=hi,'相机参数越界：'+name
 if eid=='particle-dissolve':assert len(c['cards'])==2 and 1<=c['particleStep']<=8,'粒子卡片须为2张，采样步长1–8'
 speed=float(payload.get('speed',1));assert .25<=speed<=3,'速度须为0.25–3倍'
 view=payload.get('view',{});limits={'zoom':(.5,2),'panX':(-700,700),'panY':(-400,400),'roll':(-30,30),'endZoom':(.5,2),'endPanX':(-700,700),'endPanY':(-400,400),'endRoll':(-30,30)}
 for k,(lo,hi)in limits.items():assert lo<=float(view.get(k,1 if 'Zoom'in k or k=='zoom' else 0))<=hi,'画面参数越界'
 assets=payload.get('assets',{});assert isinstance(assets,dict)
 for k,v in assets.items():assert k in d['assets']and isinstance(v,str)and v.startswith('data:image/')and len(v)<40*1024**2,'无效的素材替换'
 extra=payload.get('extra',{});assert isinstance(extra,dict)and all(k in d['extra'] for k in extra),'无效的文档'
 camera_effect=True
 high_resolution=eid in HIGH_RES
 resolution=int(payload.get('resolution',2160 if high_resolution else 1080))
 assert resolution in ([1080,2160] if high_resolution else [1080]),'此效果不支持该输出分辨率'
 result={'schema':'xiaolin-workbench/1','effect':eid,'config':c,'speed':speed,'view':view,'assets':assets,'extra':extra,'resolution':resolution}
 prior=payload.get('cameraBeforeManual')
 if camera_effect and prior is not None:
  assert isinstance(prior,dict),'原镜头参数无效'
  result['cameraBeforeManual']=prior
 return result
def make(payload):
 p=validate(payload);eid=p['effect'];key=hashlib.sha256((json.dumps(p,sort_keys=True)+str([(str(f.relative_to(ROOT/eid)),f.stat().st_mtime_ns,f.stat().st_size)for f in sorted((ROOT/eid).rglob('*')) if f.is_file() and '__pycache__' not in f.parts])+str((ROOT/'workbench/runtime.js').stat().st_mtime_ns)).encode()).hexdigest()[:20];target=WORK/key
 if not(target/'READY').exists():
  tmp=WORK/(key+'-'+uuid.uuid4().hex[:6]);shutil.copytree(ROOT/eid,tmp,ignore=shutil.ignore_patterns('review','*.mp4','*.mkv','__pycache__'))
  (tmp/'assets').mkdir(exist_ok=True)
  shutil.copy2(ROOT.parents[1]/'assets/fonts/NotoSansCJKsc-Regular.otf',tmp/'assets/edit-font.otf')
  (tmp/BYID[eid]['configFile']).write_text(json.dumps(p['config'],ensure_ascii=False,indent=2))
  for k,v in p['assets'].items():(tmp/k).write_bytes(base64.b64decode(v.split(',',1)[1],validate=True))
  for k,v in p['extra'].items():(tmp/k).write_text(json.dumps(v,ensure_ascii=False,indent=2))
  if eid in ['coin-reveal','mechanical-title','gold-reveal']:
   r=subprocess.run([sys.executable,str(tmp/'prepare.py')],capture_output=True,text=True)
   if r.returncode:raise ValueError('文字几何生成失败：'+r.stderr[-600:])
  shutil.copy2(ROOT/'workbench/runtime.js',tmp/'workbench-runtime.js')
  (tmp/'workbench-settings.json').write_text(json.dumps({'speed':p['speed'],'view':p['view'],'resolution':p['resolution']}))
  entry=BYID[eid]['entry'];html=(tmp/entry).read_text();html=html.replace('</head>','<style>@font-face{font-family: \"PingFang SC\";src:url(assets/edit-font.otf)}@font-face{font-family: \"Noto Sans CJK SC\";src:url(assets/edit-font.otf)}</style></head>');html=html.replace('<script type="module"','<script src="workbench-runtime.js"></script><script type="module"',1);(tmp/entry).write_text(html)
  (tmp/'workbench-edit.json').write_text(json.dumps(p,ensure_ascii=False,indent=2));(tmp/'READY').write_text('versioned preview')
  if target.exists():shutil.rmtree(tmp)
  else:tmp.rename(target)
 return {'id':key,'url':f'/sessions/{key}/{BYID[eid]["entry"]}?render=1','duration':p['config']['duration']/p['speed'],'entry':BYID[eid]['entry'],'effect':eid,'path':str(target)}
def render_job(job,preview):
 try:
  with RENDERLOCK:
   JOBS[job]['status']='rendering';dest=OUT/(preview['effect']+'-'+job);shutil.copytree(WORK/preview['id'],dest/'project');mp4=dest/'效果.mp4';node=shutil.which('node');script=ROOT.parents[1]/'scripts/render.mjs'
   with open(dest/'render.log','w')as log:
    r=subprocess.run([node,str(script),str(dest/'project'/preview['entry']),'--out',str(mp4),'--workers','2','--no-audio'],stdout=log,stderr=subprocess.STDOUT,timeout=1800)
   if r.returncode:raise RuntimeError('渲染失败，请查看本地 render.log')
   r=subprocess.run(['ffmpeg','-v','error','-i',str(mp4),'-f','null','-'],capture_output=True,text=True)
   if r.returncode:raise RuntimeError('成片解码失败')
   JOBS[job].update(status='done',path=str(mp4),url=f'/outputs/{dest.name}/效果.mp4',sha256=hashlib.sha256(mp4.read_bytes()).hexdigest(),note='无声画面导出；声音在整片剪辑中单独处理')
 except Exception as e:JOBS[job].update(status='error',error=str(e))
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
 def translate_path(self,path):
  path=unquote(urlsplit(path).path)
  if path.startswith('/sessions/'):root=WORK;relative=path[10:]
  elif path.startswith('/outputs/'):root=OUT;relative=path[9:]
  else:root=ROOT;relative='workbench/index.html'if path=='/'else path.lstrip('/')
  p=(root/relative).resolve();return str(p)if p.is_relative_to(root)else str(root/'FORBIDDEN')
 def end_headers(self):self.send_header('Cache-Control','no-store');super().end_headers()
 def answer(self,value,status=200):
  raw=json.dumps(value,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
 def do_GET(self):
  p=urlsplit(self.path).path
  if p=='/api/effects':return self.answer(DESC)
  if p.startswith('/api/jobs/'):return self.answer(JOBS.get(p.rsplit('/',1)[1],{'status':'missing'}))
  return super().do_GET()
 def do_POST(self):
  try:
   origin=self.headers.get('Origin');assert not origin or origin in[f'http://127.0.0.1:{A.port}',f'http://localhost:{A.port}'],'不接受外部网页请求'
   n=int(self.headers.get('Content-Length',0));assert 0<n<100*1024**2,'请求大小无效';payload=json.loads(self.rfile.read(n))
   if self.path=='/api/preview':return self.answer(make(payload))
   if self.path=='/api/render':
    pre=make(payload);job=time.strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:5];JOBS[job]={'status':'queued','effect':pre['effect']};threading.Thread(target=render_job,args=(job,pre),daemon=True).start();return self.answer({'job':job})
   self.answer({'error':'未知操作'},404)
  except Exception as e:self.answer({'error':str(e)},400)
if __name__=='__main__':
 print(f'Workbench http://127.0.0.1:{A.port} — {len(DESC)} effects',flush=True);ThreadingHTTPServer(('127.0.0.1',A.port),Handler).serve_forever()
