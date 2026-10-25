# 安装与运行

将 `machinema-effects` 文件夹放到支持 Skill 的工具的技能目录。重新打开聊天后可按 `$machinema-effects` 调用；本会话也可直接按路径读取。不承诺所有工具自动加载相同安装路径。

在本 Skill 根目录安装依赖：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm ci
npx playwright install chromium
.venv/bin/python scripts/effects.py doctor
```

另需系统 PATH 中有 Node.js、FFmpeg。已有 Google Chrome 可直接使用，或通过 `CHROME_PATH` 指定浏览器可执行文件。Windows虚拟环境入口为 `.venv\Scripts\python.exe`；Windows/Linux尚未实际验证，不将这段命令说明算作平台兼容验收。

无需购买在线生成服务。首次安装 Python/npm依赖和浏览器需要联网；特效生成与素材替换均在本机运行。软件依赖不是安装 Skill 后自动获得，失败时报告缺失项，不换远程服务。

启动：

```bash
.venv/bin/python scripts/effects.py serve --port 8881 --work /绝对路径/work --outputs /绝对路径/outputs
```

打开 `http://127.0.0.1:8881/`。选择效果，修改右侧参数后点击应用；拖动旋转、滚轮缩放、Shift+拖动平移。保存参数用于迁移，导出按钮生成无声MP4和独立工程。编辑台“写一句话交给AI”只生成提示词，不会在后台调用模型。

CLI导出保存的参数：

```bash
.venv/bin/python scripts/effects.py render --effect table-row-depth --params /绝对路径/参数.json --out /绝对路径/表格-v1.mp4
```

导出旁的 `-source` 目录包含实际配置、素材和用于该次导出的字体。重新渲染：`node scripts/render.mjs /绝对路径/工程/index.html --out /绝对路径/新版.mp4 --no-audio`；组织图入口为 `render3d.html`。仍需本 Skill 的渲染器与安装依赖，不将单独HTML当作自带编码器。
