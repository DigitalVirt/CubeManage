# CubeManage

**魔方云虚拟化平台的开源管理控制台**，由 [DigitalVirt](https://digitalvirt.com/opensource/cubemanage) 开发并以 MIT 许可证开源。

通过魔方云平台 API 管理实例、用户、区域节点、网络、镜像和日志。平台地址和账号只在登录时填写，服务端不保存任何用户信息，容器不需要挂载数据卷。

- 项目介绍：https://digitalvirt.com/opensource/cubemanage
- 源代码：https://github.com/DigitalVirt/CubeManage
- macOS / Windows 客户端：https://github.com/DigitalVirt/CubeManage/releases

## 运行

```bash
docker run -d --name cubemanage -p 5080:5080 --restart unless-stopped digitalvirtllc/cubemanage:latest
```

然后在浏览器打开 `http://服务器IP:5080`。

使用 Docker Compose：

```yaml
services:
  cubemanage:
    image: digitalvirtllc/cubemanage:latest
    container_name: cubemanage
    restart: unless-stopped
    ports:
      - "5080:5080"
```

## 说明

- 对公网开放时，请在前面加 HTTPS 反向代理（Nginx、Caddy 等），不需要其他配置：程序会识别代理传来的 HTTPS 和原始域名。
- 平台使用 JSON 请求体时，加上环境变量 `CUBE_BODY_ENCODING=json`。
- 平台的管理接口限制了来源 IP 时，需要把运行容器的服务器 IP 加入白名单。
- 重启容器后所有人需要重新登录（会话密钥只在内存里）。

## 标签

- `latest`：最新版本
- `0.1.69` 等：对应版本号，可以固定在某个版本

镜像支持 `linux/amd64` 和 `linux/arm64`。
