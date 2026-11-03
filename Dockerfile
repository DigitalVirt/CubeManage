# CubeManage 镜像：构建前端，再用 Node 服务提供页面和 /api。
# 构建：docker build -t cubemanage .
# 运行：docker run -d --name cubemanage -p 5080:5080 --restart unless-stopped cubemanage
# 服务端不保存任何用户信息、不写日志文件，容器不需要挂载数据卷。

# ---- 构建阶段：安装全部依赖并打包前端 ----
FROM node:22-slim AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
COPY server ./server
RUN pnpm run build

# ---- 运行阶段：只装运行依赖，带上打包好的前端和服务端 ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5080 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts && pnpm store prune && rm -rf /root/.cache /root/.local/share/pnpm
COPY server ./server
COPY --from=build /app/dist ./dist
USER node
EXPOSE 5080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5080)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
