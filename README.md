# 足踝解剖图谱

新版 Three.js 交互式解剖工作台，包含分组导航、部位搜索、原位高亮、独立隐藏、抽出与回位、透视、标准视角和画面导出。

本版本保留模型原有颜色与法线纹理，使用环境光照与接触阴影，并包含加大至 1.8 倍的分离距离。

## 本地运行

在仓库根目录执行：

```bash
python3 -m http.server 8097 --bind 127.0.0.1
```

访问 http://127.0.0.1:8097/ 。无需安装 npm 依赖或构建；浏览器需要联网加载 Three.js 与 Draco 解码器。

## 文件

- `index.html`：页面结构与依赖映射。
- `main.js`：模型加载、解剖信息和交互。
- `rendering.js`：材质、灯光和后处理。
- `style.css`：响应式布局与样式。
- `assets/`：GLB 模型、图标及第三方许可。

## 版本

本仓库保存新版。UI 与渲染优化之前的旧版单独保存在 `Air-Sage/foot-anatomy-classic`，两版独立维护与部署。

## 模型与许可

模型来自 AnatomyTOOL Open3DModel，采用 CC BY-SA 4.0；详见 [模型署名](assets/open3dmodel/ATTRIBUTION.md)。原始 GLB 未修改。Lucide 图标许可见 [lucide.LICENSE](assets/lucide.LICENSE)。

仅用于交互式学习展示，不用于医学诊断。
