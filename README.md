<p align="center">
  <a href="https://digitalvirt.com/opensource/cubemanage">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/digitalvirt-logo-light.svg">
      <img src=".github/assets/digitalvirt-logo.svg" alt="DigitalVirt" height="44">
    </picture>
  </a>
</p>

# CubeManage

> 由 **DigitalVirt** 开发并开源，基于 [MIT 许可证](LICENSE) 发布。项目介绍：[digitalvirt.com/opensource/cubemanage](https://digitalvirt.com/opensource/cubemanage)

CubeManage 是一个通过 **魔方云虚拟化平台 API** 管理云实例的控制台，用 Vite 8 + React 19 + HeroUI 开发。实例、用户、区域节点、网络、镜像和日志都能在一个界面里管理；前端只和本地 Node 服务通信，平台凭据和令牌不会发送到浏览器。

![控制台](.github/assets/cubemanage-home.png)

> 截图中的「星河云」是演示用的网站名称，实际显示魔方云后台网站配置里的名称。

## 特点

- **凭据不落盘**：密码只用来换取平台 token；会话用 AES-256-GCM 加密后保存在浏览器的 HttpOnly Cookie 里，服务端不保存任何凭据，也不需要数据库。
- **覆盖魔方云常用后台**：实例、用户、VPC 网络、磁盘、安全组、实例模板、SSH 密钥、区域节点、IPv4 / IPv6、ADSL、镜像 / ISO、日志与网站配置。
- **19 项批量操作**：重启、重装、迁移、替换 IP 等批量操作全部接入，提交前核对数量，结束后逐台汇总成功与失败。
- **全局搜索**：⌘K / Ctrl+K 同时搜索实例主机名、IP、编号和用户，回车直达详情。
- **一屏看清全局**：控制台汇总最近七天操作、区域分布地图、实例用量排行和最新创建的实例。
- **链接即现场**：页码、筛选、搜索和排序都写进网址，刷新、后退或分享链接都回到同一位置。

| 实例管理 | 实例详情 | 区域节点 |
| --- | --- | --- |
| ![实例管理](.github/assets/cubemanage-clouds.png) | ![实例详情](.github/assets/cubemanage-detail.png) | ![区域节点](.github/assets/cubemanage-nodes.png) |

## 技术栈

- 前端：Vite 8、React 19、HeroUI v3、Tailwind CSS 4、React Router 7、TypeScript
- 服务端：Node.js 22 + Express 5，代理请求魔方云 API 并管理加密会话

## 部署方式

| 方式 | 状态 |
| --- | --- |
| 自行安装（Node.js） | 已支持 |
| Docker | 已支持，镜像 [`digitalvirtllc/cubemanage`](https://hub.docker.com/r/digitalvirtllc/cubemanage) |
| macOS 客户端 | [下载](https://github.com/DigitalVirt/CubeManage/releases/latest)（Apple 芯片 / Intel） |
| Windows 客户端 | [下载](https://github.com/DigitalVirt/CubeManage/releases/latest)（64 位） |

### 自行安装

需要 Node.js 22.12 或更高版本。

```bash
npm install
npm run build
npm start        # 默认监听 127.0.0.1:5080
```

开发调试用 `npm run dev`，同时启动服务端和 Vite。可复制 `.env.example` 为 `.env` 修改监听地址、端口等非敏感设置。

### Docker

不想安装 Node 的话，用 Docker 一条命令就能运行。镜像已发布到 Docker Hub（[digitalvirtllc/cubemanage](https://hub.docker.com/r/digitalvirtllc/cubemanage)），包含 Node 和打包好的页面，支持 amd64 和 arm64：

```bash
docker run -d --name cubemanage -p 5080:5080 --restart unless-stopped digitalvirtllc/cubemanage:latest
```

或者下载仓库里的 [`docker-compose.yml`](docker-compose.yml) 后运行 `docker compose up -d`。想从源代码自己构建镜像：

```bash
docker compose up -d --build
# 或者
docker build -t cubemanage .
docker run -d --name cubemanage -p 5080:5080 --restart unless-stopped cubemanage
```

然后在浏览器打开 `http://服务器IP:5080`。

- 服务端不保存任何用户信息、不写日志文件，容器不需要挂载数据卷。重启容器后所有人需要重新登录（会话密钥只在内存里）。
- 对公网开放时，请在前面加 HTTPS 反向代理（Nginx、Caddy 等），不需要其他配置：程序会识别代理传来的 HTTPS 和原始域名，会话 Cookie 自动带上 Secure。
- 平台使用 JSON 请求体时，设置 `CUBE_BODY_ENCODING=json`。
- 如果平台的管理接口限制了来源 IP，需要把运行 CubeManage 的服务器 IP 加入白名单。
- 升级：`docker pull digitalvirtllc/cubemanage:latest` 后重新创建容器（Compose 用 `docker compose pull && docker compose up -d`）。也可以把 `latest` 换成版本号（如 `0.1.69`）固定版本。
- 依赖由 pnpm 管理（`pnpm-lock.yaml`），镜像构建时通过 corepack 使用 `package.json` 里指定的 pnpm 版本。
- **发布镜像**：推送 `v` 开头的标签，或在 Actions 页面手动运行 “Docker”，会构建 amd64 / arm64 镜像并推送到 Docker Hub（版本号和 `latest` 两个标签）。需要先在仓库 Secrets 里配置 `DOCKERHUB_USERNAME` 和 `DOCKERHUB_TOKEN`；镜像名默认 `digitalvirtllc/cubemanage`，可以用仓库变量 `DOCKERHUB_IMAGE` 修改。

### macOS / Windows 客户端

客户端基于 Electron，把页面和本机服务打包在一起：双击打开即可使用，不需要安装 Node，也不需要配置 HTTPS。服务只在本机 `127.0.0.1` 上运行，请求直接从你的电脑发往平台。安装包在 [Releases](https://github.com/DigitalVirt/CubeManage/releases) 页面下载，也可以自己打包：

**记住用户名和密码**：客户端登录页可以勾选“记住用户名和密码”，下次选择同一个平台地址时自动填入。密码用系统加密保存在本机（macOS 钥匙串、Windows 凭据保护 DPAPI），文件只有当前用户可读，不会上传；不勾选或“从列表中移除”平台地址时会删除已保存的账号。系统不支持加密时只记住用户名。网页版和 Docker 版不提供这个选项。

**更新提示**：客户端启动后和每隔 6 小时会检查 GitHub Releases，有新版本时弹窗显示版本号和更新内容，可以“下载更新”（用浏览器下载对应系统和芯片的安装包）、“查看更新内容”、“稍后提醒”或“跳过这个版本”。也可以手动检查：macOS 在菜单栏“CubeManage → 检查更新…”，Windows 在页面右上角个人菜单里点“检查更新”。下载后关闭客户端，安装新版本覆盖即可，登录页保存的平台地址会保留。因为安装包没有开发者证书签名，macOS 上无法后台自动安装，所以采用提示下载的方式。

安装包暂未使用 Apple 开发者证书签名。macOS 第一次打开时如果提示“无法验证开发者”，到“系统设置 → 隐私与安全性”点“仍要打开”；如果提示“已损坏，无法打开”，在终端运行 `xattr -cr /Applications/CubeManage.app` 后再打开。Windows 出现“Windows 已保护你的电脑”时，点“更多信息”→“仍要运行”。

```bash
pnpm desktop        # 构建页面并打开桌面窗口（调试用）
pnpm desktop:dist   # 打包安装包，输出到 release/（macOS 上生成 .dmg，Windows 上生成 .exe）
```

- **自动打包与发布**：推送 `v` 开头的标签（如 `git tag v0.1.69 && git push --tags`），或在 Actions 页面手动运行 “Desktop” 并勾选“发布 Release”，GitHub Actions 会在 macOS 和 Windows 上分别打包，然后按版本号创建 Release 并附上安装包。Release 正文取自 `.github/release-notes/v<版本号>.md`。只手动运行、不勾选时，安装包在本次运行的 Artifacts 里下载。
- **签名（可选）**：在仓库 Secrets 里配置证书后自动签名，macOS 还会公证，变量见 `.github/workflows/desktop.yml` 开头。未签名的安装包也能用，但 macOS 首次打开需要在“系统设置 → 隐私与安全性”里允许，Windows 会提示“未知发布者”。
- 图标在 `build/icon.png`（1024×1024），打包配置在 `electron-builder.yml`。

## 连接平台

打开页面，在登录页填写魔方云平台地址（包含实际的管理目录，无需添加 `/v1`）、用户名和密码。请求编码默认为表单，可在 `.env` 中用 `CUBE_BODY_ENCODING=json` 修改。

登录成功后，平台地址会保存在当前浏览器的 localStorage 里（只保存地址，不保存用户名、密码和令牌，最多 10 个）。下次登录时默认选中最近一次的地址，也可以从下拉框选择其他平台，或选“输入新的平台地址”；不再需要的地址可以“从列表中移除”。

### 凭据与会话

- **密码只用一次**：密码只用于向平台换取 access-token，换到后立即丢弃，不写入文件、环境变量、日志或 Cookie。
- **会话只在浏览器里**：平台地址、用户名、平台 token、有效期和 CSRF 令牌，用 AES-256-GCM 加密成一个 Cookie，只保存在登录者的浏览器里。这个 Cookie 是 HttpOnly 的，页面脚本读不到；设置了 SameSite=Strict；通过 HTTPS 访问（包括经反向代理）时自动带 Secure。内容加密且防篡改，即使 Cookie 被复制也看不到明文。
- **服务端不留会话**：服务端不保存任何会话或凭据。加密密钥只在服务进程的内存里，从不落盘，所以重启服务后所有人都要重新登录。
- **时效跟随平台 token**：Cookie 的有效期等于平台 token 的有效期（平台未返回时按文档的一天计算）。平台一旦返回 401，会话立即结束并清除 Cookie，页面回到登录。期间不会用密码静默重新登录。
- **退出即注销**：退出时调用平台 `v1/logout` 注销 token，并在服务端记住这个会话已退出，直到它原本的到期时间，所以复制出去的旧 Cookie 也会失效。
- **本机不记操作日志**：服务端不写任何操作记录文件，操作记录以平台自己的日志为准（日志菜单里的系统、登录、任务日志）。

## 验证

```bash
npm test
npm run build
```

实际平台的接口和字段可能因版本不同而异，使用写操作前请先在测试环境验证。

## 管理功能

顶栏左侧 LOGO 返回首页（控制台），LOGO 旁显示设置里的网站名称（网站配置 → 基本信息，平台字段 `company_name`；未设置时显示 CubeManage）。名称缓存在浏览器 localStorage 中，下次打开先显示缓存再向平台刷新，缓存只记平台地址的指纹；保存网站配置后立即更新。导航依次为业务管理（实例管理 / 用户管理）、区域节点、网络管理（管理 IPv4 / 管理 IPv6 / ADSL 维护）、镜像管理（镜像 / ISO）、日志菜单和设置；连接设置从顶栏右侧的连接状态图标进入。

设置页（`/system`）用横向 Tab 展示并编辑平台“网站配置”接口的内容：基本信息、实例与磁盘、安全、通知、IP、内网 IP、流量与节点流量、DDNS、VNC、功能开关、vGPU、疏散（只读）、升级源和调试。保存前确认改动，只提交修改过的字段；密码和密钥不会发送到浏览器，留空即保持原值。这些都是平台全局配置，修改端口或管理员路径前请确认影响。日志菜单提供系统、登录、任务、ADSL、日志清理及黑名单记录；独立任务中心入口已合并到日志菜单。

业务管理下拉除实例管理和用户管理外，还有：VPC 网络（接口名称、节点、出口 MAC、网段、网内主机、所属用户；改名、删除，不支持多选）、磁盘管理（只看列表和新建，没有勾选列和操作列；“回收站”按钮进入单独的磁盘回收站页面，可恢复、彻底删除）、安全组（新建、修改、删除、关联 / 解除关联实例，规则的增删改；不支持多选）、实例模板（从实例创建、删除；不支持多选）、密钥管理（自动生成或导入 SSH 密钥、绑定 / 解绑实例、删除；不支持多选）。自动生成的私钥只在创建后显示一次，不写入本机日志。

网络管理下拉包含三页，接口均来自 `digitalvirt-v1-api.md`：

- **管理 IPv4**（`/ipv4`）：首页为 IP 段列表（名称、节点、锁定 / 已用 / 空闲 / 总数各一列，最后是分组），点击名称进入该段的 IP 地址，新建按钮右侧的“分组”进入 IP 分组。IP 段可按区域 / 节点、状态、分组筛选，新建、编辑、批量修改（分组、可用节点、onlink）和删除（`v1/ipSegment`）；修改网关时先列出需要重启的实例（`need_reboot_host`），再选择手动或自动重启。IP 地址按 IP 段列出，可按起止地址批量添加、编辑 VLAN / MAC / 备注 / 锁定、批量修改和删除（`v1/ip`）。IP 分组管理名称、描述和包含的 IP 段（`v1/ip_groups`）。
- **管理 IPv6**（`/ipv6`）：结构同 IPv4，点击段名称查看地址，“分组”进入 IPv6 分组。IPv6 段按地址块或起止地址添加，可编辑网关、DNS、分组、可用节点并删除（`v1/ipv6_segments`）；IPv6 地址只读，列出分配给哪个实例（`v1/ipv6`）；IPv6 分组同 IPv4（`v1/ipv6_groups`）。
- **ADSL 维护**（`/adsl`）：拨号账号列表，可按区域 / 节点、使用状态、锁定筛选，新建、编辑、批量修改、批量导入（每行 `VLAN,账号,密码,节点ID…`，`POST v1/adsls`）和删除（`v1/adsl`）。账号密码不会发送到浏览器，编辑时留空即保留原密码。

删除时服务端核对所选数量，平台拒绝的记录（如仍在使用的 IP、账号）逐条列出原因。

镜像和 ISO 支持列表、搜索、状态筛选、新建、编辑和编号确认删除。用户支持账号及联系方式管理；初始密码仅在新建时提交。用户列表的“实例”数量可点击，打开只显示该用户实例的实例列表。日志清理先查询指定类型和截止时间对应的数量，再通过确认文字提交删除。

顶栏中间为全局搜索（macOS 按 ⌘K，其他系统按 Ctrl+K），输入时调用平台 `v1/global_search`，同时匹配实例（主机名、IP、编号）和用户。点击或回车打开结果：实例进入详情页，用户进入实例列表并只显示该用户的实例（平台 `v1/clouds` 的 `user` 参数），筛选栏的“用户”标签可一键移除；未选中结果时按回车，跳转到实例列表并带上关键字。

实例管理页右上角的“回收站”按钮进入回收站：可搜索已删除的实例，查看放入时间和到期删除时间，单个或批量恢复、彻底删除（平台 `v1/recycle_bin` 与 `v1/clouds/recycle_bin` 接口）。

实例列表的“新建实例”进入独立页面 `/clouds/new`：位置、镜像、规格、网络、登录、实例信息六个分区，右侧吸顶显示配置摘要和创建按钮（`v1/clouds/create_page`、`v1/node_images`、`POST v1/clouds`）。新建 / 编辑区域与节点使用左侧分组导航的宽弹窗。

实例列表的主 IP、配置、镜像、CPU、内存、实时带宽、本月流量可点击表头排序（平台 `v1/clouds` 的 `orderby` / `sort`，写入网址；本月流量平台不支持，只对当前页排序）。实例列表支持勾选后批量操作，菜单顺序与魔方云后台一致，19 项均已接入（取消迁移在迁移队列弹窗里）：重启、硬重启、开机、关机、硬关机、解除挂起、暂停、取消暂停和迁移逐个调用单实例接口（迁移每台单独发起 `POST v1/clouds/:id/migrate`，不走批量迁移队列）；重置密码、强制删除、删除、实例设置、重装、规则应用、添加 IPv6、替换 IP、一键重建实例调用平台的批量接口；导出下载平台生成的 CSV。弹窗列出所选实例，提交时服务端核对实例数量，防止列表已变化；结束后按实例汇总成功与失败，随机密码只显示一次。

实例详情页的操作区还有：设置（启动盘、启动顺序、ISO 挂载、CPU 模式与限制、CPU 拓扑 / CPUTune / NUMA、VNC 与串口控制台、ACPI、时钟、QEMU 版本、VirtIO-GPU、网卡多队列、跳过冷备份、查看 XML；APIC 平台不支持修改，只读；控制台密码只在点“显示”时读取）、快照、备份（创建、还原、删除、取消创建）、计划任务（定时快照 / 备份）。实例详情页提供电源操作、网页终端、救援系统、重装、修改密码 / 配置 / 带宽、流量设置与重置，以及网络（IPv4 / IPv6、主 IP、VPC、断网）、磁盘、监控图表和实例日志。界面规范见 `DESIGN.md`。

## 待办与规划

还没实现或需要确认的事项记录在 [ROADMAP.md](ROADMAP.md)，比如 iOS 版本评估、手机端其余页面的适配。

## 开源声明

CubeManage 由 DigitalVirt 开发，并以 [MIT 许可证](LICENSE) 开源：可以自由使用、修改和分发（包括商业用途），只需保留版权和许可声明。

- 欢迎通过 [Issues](https://github.com/DigitalVirt/CubeManage/issues) 反馈问题和建议，或提交 Pull Request。
- 本项目按“现状”提供，不附带任何担保。管理的是生产环境中的云资源，使用写操作（删除、重装、迁移等）前请先在测试环境验证。

## 版本号

版本号只在 `package.json` 里维护，登录页和页面底部显示的 `vX.Y.Z`、请求平台时的 User-Agent 都从这里读取。每个版本的改动记录在 [CHANGELOG.md](CHANGELOG.md)。
