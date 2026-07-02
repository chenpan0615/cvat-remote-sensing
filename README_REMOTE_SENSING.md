# CVAT Remote Sensing Edition

本仓库是面向遥感影像标注、变化检测样本制作和语义分割掩膜导出的 CVAT 定制版。
它保留原版 CVAT 的任务、项目、用户、权限和 Docker Compose 架构，在此基础上补充
了遥感数据常用的双时相查看、影像增强、中文界面和语义 PNG 导出能力。

> 当前 GitHub 分支 `codex/cvat-103-custom` 是一次源码快照提交，用于保存当前可部署
> 版本。原服务器上的浅克隆历史已保留在本地分支
> `codex/cvat-103-custom-with-upstream-history`，但推送到 GitHub 的是完整源码快照。

## 新增设计

### 1. 双时相变化检测标注

新增工具：

```text
utils/change_detection/prepare_cvat_pairs.py
```

该工具把 `before` / `after` 两个目录中的同名影像配成 CVAT 可直接上传的 ZIP：

- 主时相作为可编辑帧；
- 另一时相作为 `related_images` 上下文影像；
- 按相对路径去掉扩展名匹配，如 `before/tile_001.tif` 匹配 `after/tile_001.png`；
- 默认检查两期影像尺寸一致，避免共享标注坐标错位。

前端上下文影像面板新增变化检测查看模式：

- `A/B`：查看主时相或上下文时相；
- `Side by side`：左右并排对比；
- `Swipe`：滑动卷帘对比；
- `Overlay`：双时相叠加对比。

### 2. 遥感影像显示增强

在标注页的图像设置中新增显示增强滤波器：

- 直方图均衡；
- Min-max 拉伸；
- 2% 线性百分位拉伸。

这些增强只影响前端显示，不修改原始影像和标注坐标，适合低对比度遥感图像、雾霾图像、
亮度差异较大的多时相图像。

### 3. 中文界面和动态文本翻译

新增中文语言系统：

```text
cvat-ui/src/components/language-provider/
cvat-ui/src/components/language-switcher/
cvat-ui/src/utils/i18n/
```

主要能力：

- 顶部导航栏中增加中英文切换按钮；
- Ant Design、Day.js 和 CVAT 常见页面文本同步切换；
- 对运行时拼接文本、快捷键提示、动态状态文本进行 DOM 级翻译；
- 覆盖任务、项目、过滤器、云存储、Webhook、导入导出、标注页控件等高频流程。

### 4. 遥感语义分割 PNG 导出

新增导出格式：

```text
cvat/apps/dataset_manager/formats/semantic_png.py
```

导出格式名称：

```text
Semantic PNG Masks
```

导出内容包括：

- `masks/`：单通道类别 ID 掩膜；
- `visualizations/`：按类别着色的 RGB 可视化；
- `overlays/`：选择保存图像时生成原图叠加可视化；
- `category_values.json`：类别名到像素值映射；
- `summary.json`：图像数、类别映射和像素统计；
- `samples.csv`：每张影像对应的掩膜、可视化、叠加图路径。

默认类别值面向遥感常用语义：

| 类别 | 像素值 |
| --- | ---: |
| background | 0 |
| building | 1 |
| road | 2 |
| water | 3 |
| forest | 4 |
| cropland | 5 |
| greenhouse | 6 |
| color_steel_house | 7 |

中文标签如 `建筑`、`道路`、`水体`、`林地`、`耕地`、`大棚`、`彩钢房`
会映射到对应英文语义类别。其他标签会自动分配未占用像素值。

### 5. 标注对象审计字段

后端和前端对象结构扩展了标注对象的创建/更新审计字段，便于追踪人工标注、模型辅助标注
和后续修订过程。相关文件包括：

```text
cvat/apps/engine/migrations/0107_labeledshape_audit_fields.py
cvat/apps/engine/models.py
cvat/apps/engine/serializers.py
cvat-core/src/object-state.ts
cvat-core/src/server-response-types.ts
```

### 6. SAM 服务配置适配

保留并调整了 `serverless/pytorch/facebookresearch/sam/nuclio/function-gpu.yaml`，用于
GPU 环境下部署 Segment Anything 交互式分割服务。该能力适合建筑物、道路、水体等目标
的半自动勾画。

## 快速开始：制作变化检测任务

准备两期影像目录：

```text
/data/change/before/
/data/change/after/
```

目录结构示例：

```text
before/
  region_001/tile_001.tif
  region_001/tile_002.tif
after/
  region_001/tile_001.tif
  region_001/tile_002.tif
```

生成 CVAT 上传包：

```bash
python3 -m pip install Pillow

python3 utils/change_detection/prepare_cvat_pairs.py \
  --before-dir /data/change/before \
  --after-dir /data/change/after \
  --output /data/change/cvat_change_detection.zip \
  --main after
```

先检查不写 ZIP：

```bash
python3 utils/change_detection/prepare_cvat_pairs.py \
  --before-dir /data/change/before \
  --after-dir /data/change/after \
  --output /data/change/cvat_change_detection.zip \
  --main after \
  --dry-run
```

上传方式：

1. 在 CVAT 新建 Task。
2. 数据源选择本地文件。
3. 上传 `cvat_change_detection.zip`。
4. 进入标注页，在上下文影像面板中使用 `A/B`、`Swipe` 或 `Overlay` 对比双时相。

## 安装部署教程

以下命令以 Ubuntu 22.04/24.04 + Docker Engine + Docker Compose Plugin 为例。

### 1. 系统依赖

```bash
sudo apt update
sudo apt install -y \
  git curl ca-certificates gnupg \
  python3 python3-pip \
  docker.io docker-compose-plugin

sudo usermod -aG docker "$USER"
newgrp docker
```

检查 Docker：

```bash
docker version
docker compose version
```

### 2. 拉取源码

私有仓库需要先配置 GitHub SSH key 或 HTTPS token。

```bash
git clone -b codex/cvat-103-custom \
  git@github.com:chenpan0615/cvat-remote-sensing.git \
  cvat-remote-sensing

cd cvat-remote-sensing
```

如果服务器只能走 443 端口 SSH，可使用：

```bash
git clone -b codex/cvat-103-custom \
  ssh://git@ssh.github.com:443/chenpan0615/cvat-remote-sensing.git \
  cvat-remote-sensing
```

### 3. 配置运行域名或 IP

创建 `.env`：

```bash
cat > .env <<'EOF'
CVAT_HOST=127.0.0.1
CVAT_VERSION=remote-sensing
ALLOWED_HOSTS=*
EOF
```

如果部署在服务器上，把 `CVAT_HOST` 改成服务器 IP 或域名，例如：

```bash
CVAT_HOST=10.10.17.103
```

### 4. 构建原版基础镜像

后端定制镜像基于原 CVAT 的 `cvat/server:dev`，先显式构建这个基底镜像。
这里临时覆盖 `CVAT_VERSION=dev`，避免 `.env` 中的 `remote-sensing` tag 影响基底镜像名：

```bash
CVAT_VERSION=dev docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  build cvat_server
```

### 5. 构建遥感后端镜像

```bash
docker build -t cvat/server:remote-sensing -f Dockerfile.semantic-png .
```

`Dockerfile.semantic-png` 会把遥感后端改动复制进 `cvat/server:dev`，包括
`Semantic PNG Masks` 导出格式、审计字段、后端序列化和模型服务相关改动。

### 6. 构建遥感前端镜像

前端定制包括中文界面、影像增强和双时相查看。冷启动部署推荐直接用
`Dockerfile.ui` 在容器内完成前端构建：

```bash
CVAT_VERSION=remote-sensing docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  build cvat_ui
```

如果你已经在宿主机上生成了 `cvat-ui/dist`，也可以使用轻量的静态文件镜像：

```bash
docker build -t cvat/ui:remote-sensing -f Dockerfile.ui-dist .
```

### 7. 启动服务

```bash
docker compose up -d
```

查看状态：

```bash
docker compose ps
```

首次启动后执行数据库迁移和创建管理员：

```bash
docker exec -it cvat_server python manage.py migrate
docker exec -it cvat_server python manage.py createsuperuser
```

访问：

```text
http://<CVAT_HOST>:8080/
```

例如：

```text
http://10.10.17.103:8080/
```

### 8. 验证部署是否是遥感定制版

检查容器镜像：

```bash
docker compose ps
```

预期 `cvat_server` 使用 `cvat/server:remote-sensing`，`cvat_ui` 使用
`cvat/ui:remote-sensing`。

检查前端：

- 页面右上角有中英文切换按钮；
- 标注页图像设置中有 `Histogram Equalization`、`Min-max`、`2% linear`；
- 上传双时相 ZIP 后，上下文影像面板可切换 `A/B`、`Swipe`、`Overlay`。

检查后端导出：

1. 新建一个包含建筑、道路、水体等标签的 Task。
2. 完成任意多边形或掩膜标注。
3. 导出格式选择 `Semantic PNG Masks`。
4. ZIP 内应包含 `masks/`、`visualizations/`、`category_values.json`、
   `summary.json`、`samples.csv`。

## 现有服务器更新流程

如果是在已经部署过 CVAT 的服务器上更新当前源码：

```bash
cd ~/code/tools/cvat
git fetch origin
git checkout codex/cvat-103-custom
git pull --ff-only
```

重新构建：

```bash
CVAT_VERSION=dev docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  build cvat_server
docker build -t cvat/server:remote-sensing -f Dockerfile.semantic-png .
CVAT_VERSION=remote-sensing docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  build cvat_ui
docker compose up -d
docker exec -it cvat_server python manage.py migrate
```

如果只是替换已经生成好的前端静态资源，可只重建 `cvat/ui:remote-sensing`
并重启 `cvat_ui`：

```bash
docker build -t cvat/ui:remote-sensing -f Dockerfile.ui-dist .
docker compose up -d cvat_ui
```

## 部署 SAM GPU 服务

准备 Nuclio 和 NVIDIA Docker Runtime 后，在 CVAT 项目根目录执行：

```bash
./serverless/deploy_gpu.sh serverless/pytorch/facebookresearch/sam
```

检查 Nuclio 函数状态：

```bash
nuctl get functions
```

如果服务器无法访问外网，需要提前准备 SAM 权重和镜像依赖，并按
`serverless/pytorch/facebookresearch/sam/nuclio/function-gpu.yaml` 中的路径调整挂载。

## 常见问题

### GitHub 上只有一个提交

这是预期行为。当前分支是源码快照提交，用于保存可部署版本。原工作副本来自浅克隆，
缺少完整上游历史，直接推到空仓库会被 GitHub 拒绝。

### Windows 共享路径显示 `helm-chart/analytics` 被删除

这是 Linux 符号链接在 Windows UNC 共享路径下的显示问题。不要从 Windows 侧提交这个
伪删除；需要提交代码时优先在 Linux 服务器本地执行 Git。

### `Semantic PNG Masks` 导出中类别值不是预期

优先使用上表中的英文标签名，或使用已支持的中文别名。未知标签会自动分配类别值，
但为了训练集长期稳定，建议项目模板中固定标签名称。

### 双时相影像无法匹配

检查两期目录中影像的相对路径是否一致，并确认去掉扩展名后键名相同。例如：

```text
before/a/b/tile_001.tif
after/a/b/tile_001.png
```

这是可以匹配的；如果一侧多了子目录或文件名不同，则会被跳过。

### 前端没有中文按钮或影像增强控件

通常是 `cvat-ui/dist` 没有重新构建，或 `cvat/ui:remote-sensing` 没有重新启动。
冷启动推荐重新构建前端镜像：

```bash
CVAT_VERSION=remote-sensing docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  build cvat_ui
docker compose up -d cvat_ui
```

如果你使用 `Dockerfile.ui-dist` 路径，则需要先确保宿主机上的 `cvat-ui/dist`
确实由当前源码生成。

## 代码维护建议

- 遥感相关说明优先更新本文档；
- 变化检测数据制作工具的说明同步维护 `utils/change_detection/README.md`；
- 后端导出格式改动后运行 `python -m py_compile` 检查相关 Python 文件；
- 前端 i18n 或影像增强改动后运行 `yarn workspace cvat-ui run lint` 和
  `yarn workspace cvat-ui run build`；
- 推送到 GitHub 时使用分支 `codex/cvat-103-custom`。
