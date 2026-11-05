<p align="center">
  <a href="https://digitalvirt.com/opensource/cubemanage">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/digitalvirt-logo-light.svg">
      <img src=".github/assets/digitalvirt-logo.svg" alt="DigitalVirt" height="44">
    </picture>
  </a>
</p>

<h1 align="center">CubeManage</h1>

<p align="center">基于魔方云 API 的开源云管控制台：实例、节点、网络、镜像和日志，一个界面管完。</p>

<p align="center">
  <a href="https://github.com/DigitalVirt/CubeManage/releases/latest"><img src="https://img.shields.io/github/v/release/DigitalVirt/CubeManage?label=%E7%89%88%E6%9C%AC&color=1d4ed8" alt="最新版本"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/DigitalVirt/CubeManage?label=%E8%AE%B8%E5%8F%AF%E8%AF%81&color=15803d" alt="MIT 许可证"></a>
  <a href="https://hub.docker.com/r/digitalvirtllc/cubemanage"><img src="https://img.shields.io/docker/pulls/digitalvirtllc/cubemanage?label=Docker%20%E6%8B%89%E5%8F%96&logo=docker&logoColor=white&color=2496ED" alt="Docker 拉取次数"></a>
  <a href="https://github.com/DigitalVirt/CubeManage/releases/latest"><img src="https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-macOS%20%7C%20Windows%20%7C%20Docker-71717a" alt="支持平台"></a>
  <a href="https://github.com/DigitalVirt/CubeManage/stargazers"><img src="https://img.shields.io/github/stars/DigitalVirt/CubeManage?style=flat&label=Star&color=f59e0b" alt="GitHub Star"></a>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="https://github.com/DigitalVirt/CubeManage/releases/latest">下载客户端</a> ·
  <a href="CHANGELOG.md">更新记录</a> ·
  <a href="DESIGN.md">设计规范</a> ·
  <a href="https://digitalvirt.com/opensource/cubemanage">项目主页</a>
</p>

![控制台](.github/assets/cubemanage-home.png)

<sub>截图中的「星河云」是演示用的网站名称，实际显示魔方云后台网站配置里的名称。</sub>

## 特点

- 🔐 **凭据不落盘**：密码只用来换取平台 token；会话加密后存在浏览器的 HttpOnly Cookie 里，服务端不存凭据、不需要数据库。
- 🧩 **覆盖常用后台**：实例、用户、VPC、磁盘、安全组、模板、SSH 密钥、区域节点、IPv4 / IPv6、ADSL、镜像 / ISO、日志与网站配置。
- ⚡ **19 项批量操作**：重启、重装、迁移、替换 IP 等，提交前核对数量，结束后逐台汇总结果。
- 🔍 **全局搜索**：⌘K / Ctrl+K 同时搜索实例主机名、IP、编号和用户。
- 🔗 **链接即现场**：页码、筛选、搜索和排序都写进网址，刷新或分享后回到同一位置。
- 📱 **多端可用**：网页、Docker、macOS 与 Windows 客户端，手机浏览器也能用。

| 实例管理 | 实例详情 | 区域节点 |
| :---: | :---: | :---: |
| ![实例管理](.github/assets/cubemanage-clouds.png) | ![实例详情](.github/assets/cubemanage-detail.png) | ![区域节点](.github/assets/cubemanage-nodes.png) |

## 快速开始

**Docker**（推荐，支持 amd64 / arm64）

```bash
docker run -d --name cubemanage -p 5080:5080 --restart unless-stopped digitalvirtllc/cubemanage:latest
```

浏览器打开 `http://服务器IP:5080`，填写魔方云平台地址（包含管理目录，不用加 `/v1`）、用户名和密码即可。也可以用仓库里的 [`docker-compose.yml`](docker-compose.yml)，飞牛、群晖等 NAS 直接粘贴就能用。

**桌面客户端**：到 [Releases](https://github.com/DigitalVirt/CubeManage/releases/latest) 下载 macOS（Apple 芯片 / Intel）或 Windows（64 位）安装包，双击打开，不需要安装 Node。

**从源代码运行**（Node.js ≥ 22.12）

```bash
npm install && npm run build
npm start          # 默认监听 127.0.0.1:5080；开发调试用 npm run dev
```

> [!TIP]
> 对公网开放时，请在前面加 HTTPS 反向代理（Nginx、Caddy 等），程序会自动识别 HTTPS 和原始域名，不需要其他配置。

## 技术栈

<p>
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite 8">
  <img src="https://img.shields.io/badge/HeroUI-v3-000000" alt="HeroUI v3">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5">
  <img src="https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white" alt="Node.js 22">
  <img src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white" alt="Express 5">
  <img src="https://img.shields.io/badge/Electron-45-47848F?logo=electron&logoColor=white" alt="Electron 45">
</p>

| 部分 | 说明 |
| --- | --- |
| 前端 | React 19 + Vite 8 + HeroUI v3 + Tailwind CSS 4 + React Router 7，TypeScript |
| 服务端 | Node.js 22 + Express 5，代理魔方云 API、管理加密会话；运行依赖只有 express 和 dotenv |
| 桌面端 | Electron，在本机启动服务并打开窗口，GitHub Actions 自动打包发布 |

## 更多说明

<details>
<summary><b>部署与升级</b></summary>

- 服务端不保存用户信息、不写日志文件，容器不需要挂载数据卷；重启后所有人需要重新登录（会话密钥只在内存里）。
- 平台使用 JSON 请求体时，设置 `CUBE_BODY_ENCODING=json`。其他非敏感设置（监听地址、端口）可复制 `.env.example` 为 `.env` 修改。
- 平台的管理接口限制了来源 IP 时，要把运行 CubeManage 的服务器 IP 加入白名单。
- 升级：Compose 部署运行 `docker compose pull && docker compose up -d`；`docker run` 部署先 `docker pull`，再删除并重新创建容器。也可以把 `latest` 换成版本号固定版本。
- 从源代码构建镜像：`docker build -t digitalvirtllc/cubemanage:latest .`，再 `docker compose up -d`。

</details>

<details>
<summary><b>桌面客户端</b></summary>

- 服务只在本机 `127.0.0.1` 上运行，请求直接从你的电脑发往平台。
- **记住密码**：登录页可勾选“记住用户名和密码”，密码用系统加密保存在本机（macOS 钥匙串、Windows DPAPI），不会上传。网页版和 Docker 版没有这个选项。
- **更新提示**：启动后和每 6 小时检查一次 GitHub Releases，有新版本时弹窗提示下载；也可以在菜单里手动“检查更新”。
- **首次打开**：安装包暂未签名。macOS 提示“无法验证开发者”时，到“系统设置 → 隐私与安全性”点“仍要打开”；提示“已损坏”时在终端运行 `xattr -cr /Applications/CubeManage.app`。Windows 提示“已保护你的电脑”时，点“更多信息 → 仍要运行”。
- 自己打包：`pnpm desktop`（调试窗口）、`pnpm desktop:dist`（安装包输出到 `release/`）。

</details>

<details>
<summary><b>凭据与会话</b></summary>

- **密码只用一次**：只用于向平台换取 access-token，之后立即丢弃，不写入文件、环境变量、日志或 Cookie。
- **会话只在浏览器里**：平台地址、用户名、token 和 CSRF 令牌用 AES-256-GCM 加密成一个 Cookie（HttpOnly、SameSite=Strict，经 HTTPS 访问时自动带 Secure），防篡改，复制出去也看不到明文。
- **服务端不留会话**：加密密钥只在服务进程内存里，不落盘。
- **时效跟随平台 token**：平台返回 401 时会话立即结束，不会用密码静默重新登录。
- **退出即注销**：退出时调用平台 `v1/logout`，旧 Cookie 同时失效。
- 登录页只在浏览器 localStorage 里记住平台地址（最多 10 个），不记用户名和密码。

</details>

<details>
<summary><b>功能一览</b></summary>

- **实例**：列表支持排序、筛选和 19 项批量操作；独立的新建实例页（区域与节点、镜像、指定 IP、密钥按用户筛选）；详情页提供电源、网页终端、救援、重装、改密码 / 配置 / 带宽、流量、网络、磁盘、快照、备份、计划任务、监控图表和日志；回收站可恢复或彻底删除。
- **业务管理**：用户、VPC 网络、磁盘与磁盘回收站、安全组与规则、实例模板、SSH 密钥（自动生成的私钥只显示一次）。
- **区域节点**：区域、节点列表（实时 CPU / 内存 / 磁盘 / 带宽、可用 IP、批量修改）、节点详情与监控图表。
- **网络管理**：IPv4 段 / 地址 / 分组、IPv6 段 / 地址 / 分组、ADSL 拨号账号（支持批量导入）。
- **镜像管理**：镜像和 ISO。
- **日志与设置**：系统、登录、任务、ADSL 日志，日志清理与黑名单；网站配置按 Tab 编辑，保存前确认改动、只提交修改过的字段。

界面规则见 [DESIGN.md](DESIGN.md)。

</details>

<details>
<summary><b>开发与发布</b></summary>

```bash
npm run dev      # 同时启动服务端和 Vite
npm test         # 服务端测试
npm run build    # 类型检查 + 打包页面
```

- 版本号只在 `package.json` 里维护，每个版本的改动见 [CHANGELOG.md](CHANGELOG.md)，规划见 [ROADMAP.md](ROADMAP.md)。
- 推送 `v` 开头的标签，或在 Actions 里手动运行 “Desktop”（勾选发布 Release）和 “Docker”，会自动打包客户端、发布 Release 并推送镜像。Release 正文取自 `.github/release-notes/v<版本号>.md`。
- Docker 发布需要在仓库 Secrets 配置 `DOCKERHUB_USERNAME`、`DOCKERHUB_TOKEN`；客户端签名的配置见 `.github/workflows/desktop.yml`。

</details>

## 开源与反馈

CubeManage 由 [DigitalVirt](https://digitalvirt.com/opensource/cubemanage) 开发，以 [MIT 许可证](LICENSE) 开源，可以自由使用、修改和分发（包括商业用途），只需保留版权和许可声明。

欢迎通过 [Issues](https://github.com/DigitalVirt/CubeManage/issues) 反馈问题，或提交 Pull Request。

> [!WARNING]
> 本项目按“现状”提供，不附带任何担保。管理的是生产环境的云资源，删除、重装、迁移等写操作请先在测试环境验证。
