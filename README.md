# 机器马特效 · machinema-effects

16种可编辑动画，一个本地Skill：空间组织图、立体表格、曲面图纸、玻璃材质、金属标题、粒子、地图与闭环图解。

先看 [Skill入口](SKILL.md)、[16项目录](references/effects.md)、[安装与运行](references/setup.md)、[64个应用提示词](references/64-prompts.md)。

## 快速开始

Python 3.10+、Node.js 20+、FFmpeg与Chrome/Chromium需要先安装。在仓库根目录：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm ci
npx playwright install chromium
.venv/bin/python scripts/effects.py doctor
.venv/bin/python scripts/effects.py serve --port 8881 --work ./work --outputs ./outputs
```

打开 http://127.0.0.1:8881/ 。编辑文字、数据和图片，拖动视角，保存JSON，导出无声MP4。也可直接运行：

```sh
.venv/bin/python scripts/effects.py render --effect table-row-depth --params assets/examples/headphones.json --out outputs/headphones.mp4
```

作为Skill安装时，将整个仓库文件夹命名为 `machinema-effects`，放入工具支持的技能目录，再在新聊天中使用 `$machinema-effects`。不要求另装作者的私人工作区或其他Skill。

## 能力与范围

16种均有视角控制；9项三维相机、2项分层表格、5项图层透视。01组织图和02/03表格支持原生4K，其余1080p。输出无声；复杂玻璃模型有固定结构，不会凭一张图片生成任意3D物体。当前只在macOS实际验证，Linux/Windows尚待验证。

本仓库使用中性示例素材，保留全部特效代码。不是参考作者原工程；不包含其原片、原声或作者私有品牌人物。原创代码与中性SVG为MIT，第三方依赖、字体、地图保留各自许可，见 [来源与许可](references/distribution.md)。

验证记录见 [verification.json](references/verification.json)：16项默认预览、三个时间点查询及两个自定义示例完整导出；不等于全部参数组合均已测试。
