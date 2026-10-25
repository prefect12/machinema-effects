#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {validateConfig} from './scene3d-schema.mjs';
const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1],root=path.dirname(fileURLToPath(import.meta.url));
if(!args.includes('--config')||!args.includes('--out')){console.error('node render-edit.mjs --config 参数.json --out 成片.mp4 [--prepare-only]');process.exit(2)}
const cfg=validateConfig(JSON.parse(fs.readFileSync(path.resolve(get('--config')),'utf8'))),out=path.resolve(get('--out'));
const project=out.replace(/\.mp4$/i,'')+'-project';if(project===out||fs.existsSync(project))throw Error('请选新的 .mp4 输出名称；不覆盖已有工程。');
fs.mkdirSync(project,{recursive:true});for(const name of ['vendor','assets','scene3d.js','scene3d-schema.mjs','scene3d-render.js'])fs.cpSync(path.join(root,name),path.join(project,name),{recursive:true});fs.copyFileSync(path.join(root,'render3d.html'),path.join(project,'index.html'));fs.writeFileSync(path.join(project,'scene3d-config.json'),JSON.stringify(cfg,null,2));
console.log('可重渲染工程：'+project);if(!args.includes('--prepare-only')){const render=path.resolve(root,'../../../scripts/render.mjs');const r=spawnSync(process.execPath,[render,path.join(project,'index.html'),'--out',out,'--workers','2','--no-audio'],{stdio:'inherit'});process.exit(r.status??1)}
