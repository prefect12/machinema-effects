#!/usr/bin/env python3
"""Portable entrypoint; generated projects stay outside the installed skill."""
import argparse, json, os, shutil, socket, subprocess, sys, tempfile, time
from pathlib import Path
from urllib.request import Request, urlopen
ROOT=Path(__file__).resolve().parents[1]
LIB=ROOT/'assets/effects'
def call(base,path,payload=None):
    data=None if payload is None else json.dumps(payload).encode()
    with urlopen(Request(base+path,data=data,headers={'Content-Type':'application/json'}),timeout=120) as r:return json.load(r)
def serve_command(port,work,out):
    return [sys.executable,str(LIB/'workbench/server.py'),'--port',str(port),'--work',str(work),'--outputs',str(out)]
def main():
    ap=argparse.ArgumentParser(description='机器马特效：选择、编辑、导出16种本地动画')
    sub=ap.add_subparsers(dest='command',required=True)
    sub.add_parser('list');sub.add_parser('doctor')
    p=sub.add_parser('serve');p.add_argument('--port',type=int,default=8881);p.add_argument('--work',type=Path,required=True);p.add_argument('--outputs',type=Path,required=True)
    p=sub.add_parser('render');p.add_argument('--effect',required=True);p.add_argument('--params',type=Path);p.add_argument('--out',type=Path,required=True);p.add_argument('--resolution',type=int,choices=[1080,2160],default=1080)
    a=ap.parse_args()
    if a.command=='list':
        print(json.dumps(json.loads((LIB/'catalog.json').read_text()),ensure_ascii=False,indent=2));return
    if a.command=='doctor':
        checks={x:shutil.which(x) for x in ['node','npm','ffmpeg']}
        try:import fontTools;checks['fontTools']=fontTools.__version__
        except ImportError:checks['fontTools']=None
        checks['playwright']=(ROOT/'node_modules/playwright/package.json').exists()
        checks['font']=(ROOT/'assets/fonts/NotoSansCJKsc-Regular.otf').is_file()
        print(json.dumps(checks,ensure_ascii=False,indent=2));print('Chrome/Chromium must also be installed; see references/setup.md.')
        if not all(checks.values()):sys.exit(1)
        return
    if a.command=='serve':os.execv(sys.executable,serve_command(a.port,a.work.resolve(),a.outputs.resolve()))
    ids={x['id'] for x in json.loads((LIB/'catalog.json').read_text())}
    if a.effect not in ids:ap.error('未知效果；先运行 list')
    out=a.out.resolve()
    if out.suffix.lower()!='.mp4' or out.exists():ap.error('输出须是尚不存在的 .mp4 文件')
    out.parent.mkdir(parents=True,exist_ok=True)
    project=out.with_suffix('');project=project.parent/(project.name+'-source')
    if project.exists():ap.error('对应的 -source 工程已存在；请选择新文件名')
    work=Path(tempfile.mkdtemp(prefix='effects-',dir=out.parent))
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    with (work/'server.log').open('w') as log:
        proc=subprocess.Popen(serve_command(port,work/'sessions',work/'exports'),stdout=log,stderr=subprocess.STDOUT)
        try:
            for _ in range(100):
                if proc.poll() is not None:raise RuntimeError('服务启动失败；查看 '+str(work/'server.log'))
                try:descs=call(base,'/api/effects');break
                except OSError:time.sleep(.1)
            else:raise TimeoutError('服务启动超时')
            d=next(x for x in descs if x['id']==a.effect)
            payload={'effect':a.effect,'config':d['config'],'resolution':a.resolution}
            if a.params:
                loaded=json.loads(a.params.read_text())
                if 'effect' in loaded:
                    if loaded['effect']!=a.effect:ap.error('参数文件与 --effect 不匹配')
                    payload.update(loaded)
                else:payload['config']=loaded
            job=call(base,'/api/render',payload)['job'];deadline=time.monotonic()+1900
            while time.monotonic()<deadline:
                state=call(base,'/api/jobs/'+job)
                if state['status']=='error':raise RuntimeError(state['error']+'；保留诊断：'+str(work))
                if state['status']=='done':
                    video=Path(state['path']);shutil.copy2(video,out);shutil.copytree(video.parent/'project',project)
                    print(json.dumps({'video':str(out),'project':str(project),'sha256':state['sha256'],'audio':False},ensure_ascii=False,indent=2));return
                time.sleep(1)
            raise TimeoutError('导出超时；保留诊断：'+str(work))
        finally:
            proc.terminate()
            try:proc.wait(timeout=5)
            except subprocess.TimeoutExpired:proc.kill();proc.wait()
if __name__=='__main__':main()
