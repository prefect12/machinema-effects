# 16种特效目录

| ID | 效果 | 可调范围 | 输出 |
|---|---|---|---|
| `seat-rotation` | 空间组织与对象交接 | 内容字段＋三维相机＋动作速度 | 1080p/4K |
| `table-row-depth` | 表格白行浮出 | 内容字段＋分层透视＋动作速度 | 1080p/4K |
| `table-row-perspective` | 透视表格双层强调 | 内容字段＋分层透视＋动作速度 | 1080p/4K |
| `paper-chart` | 曲面图纸展开 | 内容字段＋三维相机＋动作速度 | 1080p |
| `document-focus` | 弯曲纸页与原文焦点 | 内容字段＋三维相机＋动作速度 | 1080p |
| `coin-reveal` | 金属币与三牌揭示 | 内容字段＋图层透视＋动作速度 | 1080p |
| `capsule-material` | 透明胶囊 | 内容字段＋三维相机＋动作速度 | 1080p |
| `house-bubbles` | 玻璃气泡群 | 内容字段＋三维相机＋动作速度 | 1080p |
| `mechanical-title` | 悬浮机械零件 | 内容字段＋三维相机＋动作速度 | 1080p |
| `liquid-oil` | 黑色流体标题 | 内容字段＋三维相机＋动作速度 | 1080p |
| `iridescent-title` | 虹彩金属标题 | 内容字段＋图层透视＋动作速度 | 1080p |
| `gold-reveal` | 金色答案揭晓 | 内容字段＋三维相机＋动作速度 | 1080p |
| `frost-title` | 冰霜冷暖转换 | 内容字段＋图层透视＋动作速度 | 1080p |
| `particle-dissolve` | 粒子消散 | 内容字段＋图层透视＋动作速度 | 1080p |
| `map-routes` | 地形地图与路线 | 内容字段＋三维相机＋动作速度 | 1080p |
| `cycle-vortex` | 闭环粒子涡流 | 内容字段＋图层透视＋动作速度 | 1080p |

所有配置存于 `assets/effects/<ID>/config.json`；组织图默认从 `presets/team.json` 读取。实际字段、范围与样例可查 `/api/effects`，不要假定每个效果支持相同的替换。

历史参考来源保留于 `assets/effects/catalog.json` 的 reference 字段；这些只用于定位视觉研究，包内不含原片或原声。
