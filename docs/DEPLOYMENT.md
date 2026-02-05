# CCR UI 部署指南

本指南介绍如何在不同场景下部署和配置 Claude Code Router UI（CCR UI）以使用 `sec-claude-code-router`（CCR）。

## 方案概览

提供三种主要部署方式，适用于不同的使用场景：

| 方案 | 适用场景 | 复杂度 | 推荐度 |
|------|----------|--------|--------|
| 全局安装 | 生产环境、个人使用 | ⭐ 简单 | ⭐⭐⭐⭐⭐ 强烈推荐 |
| 相对路径 | 开发环境、同时开发两个项目 | ⭐⭐ 中等 | ⭐⭐⭐ 推荐 |
| 自定义路径 | 特殊部署场景 | ⭐⭐ 中等 | ⭐⭐ 可选 |

---

## 方案 1：全局安装（推荐）

**最简单、最标准的部署方式**，适合大多数用户。

### 步骤 1：全局安装 CCR

#### 选项 A：从本地源码安装（推荐）

适用于使用本地开发版本的 `sec-claude-code-router`：

**重要：** 为避免与已发布的 `@musistudio/claude-code-router` 冲突，我们将命令名称设为 `sec-ccr`。

```bash
cd D:\project\ai\sec-claude-code-router
npm install -g .
```

这将创建全局命令 `sec-ccr`。

#### 选项 B：从 npm 安装

如果 `@musistudio/claude-code-router` 已发布到 npm（使用 `ccr` 命令）：

```bash
npm install -g @musistudio/claude-code-router
```

### 步骤 2：验证安装

确认 CCR 已正确安装并可在终端中使用：

**如果使用本地安装（sec-ccr）：**
```bash
sec-ccr --version
```

**如果使用 npm 安装（ccr）：**
```bash
ccr --version
```

应该看到 CCR 的版本信息。

### 步骤 3：配置 CCR UI

在 `claude-code-router-ui` 项目根目录创建或编辑 `.env` 文件：

**如果使用本地安装（sec-ccr）：**
```env
# 使用本地全局安装的 sec-ccr 命令
CLAUDE_CLI_PATH=sec-ccr
CLAUDE_CLI_ARGS=code
CLAUDE_CHAT_MODE=cli
CLAUDE_SKIP_AUTH_CHECK=true
```

**如果使用 npm 安装（ccr）：**
```env
# 使用 npm 全局安装的 ccr 命令
CLAUDE_CLI_PATH=ccr
CLAUDE_CLI_ARGS=code
CLAUDE_CHAT_MODE=cli
CLAUDE_SKIP_AUTH_CHECK=true
```

> **说明：**
> - `CLAUDE_CLI_PATH=sec-ccr` - 使用本地安装的 sec-ccr 命令
> - `CLAUDE_CLI_ARGS=code` - 传递 'code' 参数（等同于 `sec-ccr code`）
> - `CLAUDE_CHAT_MODE=cli` - 强制使用 CLI 模式（而非 SDK）
> - `CLAUDE_SKIP_AUTH_CHECK=true` - 跳过 Claude 官方认证检查

### 步骤 4：启动服务

```bash
cd /path/to/claude-code-router-ui
npm install
npm run dev
```

服务启动后，访问 `http://localhost:5173`（开发模式）或 `http://localhost:3001`（生产模式）。

---

## 方案 2：相对路径（开发模式）

**适合同时开发两个项目的场景**，两个项目放在同一父目录下。

### 目录结构要求

```
project/ai/
├── claude-code-router-ui/    ← CCR UI 项目
└── sec-claude-code-router/   ← CCR 项目
```

### 步骤 1：确保 CCR 已构建

```bash
cd /path/to/sec-claude-code-router
npm install
npm run build
```

**Windows 示例：**
```powershell
cd D:\project\ai\sec-claude-code-router
npm install
npm run build
```

确认 `dist/cli.js` 文件存在。

### 步骤 2：配置 CCR UI

在 `claude-code-router-ui/.env` 文件中配置：

```env
# 使用相对路径指向 CCR
CLAUDE_CLI_COMMAND=node ../sec-claude-code-router/dist/cli.js code
CLAUDE_CHAT_MODE=cli
CLAUDE_SKIP_AUTH_CHECK=true
```

> **说明：**
> - `../sec-claude-code-router/dist/cli.js` 是相对路径，从 `claude-code-router-ui` 目录出发
> - 路径会在运行时自动解析为绝对路径
> - Windows 和 Unix 系统都使用 `/` 作为路径分隔符

### 步骤 3：启动服务

```bash
cd /path/to/claude-code-router-ui
npm run dev
```

---

## 方案 3：自定义路径

**适合 CCR 安装在非标准位置的场景**。

### 使用环境变量

#### 步骤 1：设置环境变量

**Linux / macOS:**
```bash
export CCR_PATH=/custom/path/to/sec-claude-code-router
```

**Windows PowerShell:**
```powershell
$env:CCR_PATH="D:\custom\path\to\sec-claude-code-router"
```

#### 步骤 2：配置 CCR UI

在 `.env` 文件中使用环境变量：

```env
CLAUDE_CLI_COMMAND=node ${CCR_PATH}/dist/cli.js code
CLAUDE_CHAT_MODE=cli
CLAUDE_SKIP_AUTH_CHECK=true
```

### 使用绝对路径（不推荐）

直接在 `.env` 中指定绝对路径（仅适用于特定机器）：

```env
# ⚠️ 不推荐：需要为每台机器单独配置
CLAUDE_CLI_COMMAND=node D:/project/ai/sec-claude-code-router/dist/cli.js code
CLAUDE_CHAT_MODE=cli
CLAUDE_SKIP_AUTH_CHECK=true
```

---

## 配置文件说明

### 环境变量优先级

CCR UI 支持多种配置方式，按以下优先级读取：

1. `CLAUDE_CLI_COMMAND` - 完整的命令行（优先级最高）
2. `CLAUDE_CLI_PATH` + `CLAUDE_CLI_ARGS` - 命令和参数分开配置
3. 默认值：`claude`（官方 Claude CLI）

### .env 文件示例

完整的 `.env` 配置示例（只需启用一个方案）：

```env
# =============================================================================
# SERVER CONFIGURATION
# =============================================================================
PORT=3001
VITE_PORT=5173
WORKSPACES_ROOT=D:\\project

# =============================================================================
# CCR (Claude Code Router) Configuration
# =============================================================================
# 选择以下方案之一：

# ── 方案 1：全局安装 ──
CLAUDE_CLI_PATH=ccr
CLAUDE_CLI_ARGS=code
CLAUDE_CHAT_MODE=cli
CLAUDE_SKIP_AUTH_CHECK=true

# ── 方案 2：相对路径 ──
# CLAUDE_CLI_COMMAND=node ../sec-claude-code-router/dist/cli.js code
# CLAUDE_CHAT_MODE=cli
# CLAUDE_SKIP_AUTH_CHECK=true

# ── 方案 3：环境变量 ──
# CLAUDE_CLI_COMMAND=node ${CCR_PATH}/dist/cli.js code
# CLAUDE_CHAT_MODE=cli
# CLAUDE_SKIP_AUTH_CHECK=true

# ── 方案 4：绝对路径（不推荐）──
# CLAUDE_CLI_COMMAND=node D:/project/ai/sec-claude-code-router/dist/cli.js code
# CLAUDE_CHAT_MODE=cli
# CLAUDE_SKIP_AUTH_CHECK=true

# =============================================================================
# DATABASE CONFIGURATION
# =============================================================================
VITE_CONTEXT_WINDOW=160000
CONTEXT_WINDOW=160000
```

---

## 自动发现功能

CCR UI 具有**智能自动发现**功能，会在以下位置自动查找 CCR：

1. ✅ 全局安装（通过 `which ccr` 或 `where ccr`）
2. ✅ 相对路径（同级目录 `../sec-claude-code-router/`）
3. ✅ `CCR_PATH` 环境变量

### 查看发现结果

启动服务时，查看控制台输出：

```
[INFO] Claude integration: CLI
[OK]   CCR automatically discovered at: ccr
[TIP]  Add to .env: CLAUDE_CLI_PATH=ccr
```

或者如果未找到：

```
[INFO] Claude integration: CLI
[WARN] CCR (Claude Code Router) not found
         • Install globally: npm install -g @musistudio/claude-code-router
         • Or add to .env: CLAUDE_CLI_PATH=ccr
         • For development: place sec-claude-code-router as sibling directory
```

---

## 故障排除

### 问题 1：`ccr: command not found`

**原因：** CCR 未正确安装或不在 PATH 中。

**解决方案：**
```bash
# 重新全局安装
npm install -g @musistudio/claude-code-router

# 或者使用相对路径（方案 2）
```

### 问题 2：`Error: Cannot find module '.../dist/cli.js'`

**原因：** CCR 项目未构建或路径不正确。

**解决方案：**
```bash
cd /path/to/sec-claude-code-router
npm run build

# 确认 dist/cli.js 存在
ls -l dist/cli.js
```

### 问题 3：服务启动但无法连接 CCR

**原因：** CCR 服务未启动或配置不正确。

**解决方案：**
1. 确认 CCR 可以独立运行：
   ```bash
   ccr code --help
   ```
2. 检查 `.env` 配置是否正确
3. 查看 CCR UI 服务器日志中的错误信息

### 问题 4：路径包含空格或特殊字符

**原因：** 路径中的空格或特殊字符未正确处理。

**解决方案：**

使用环境变量方式（方案 3）或将项目移动到无空格路径。

---

## 验证部署

### 1. 检查 CCR 版本

```bash
ccr --version
```

### 2. 检查 CCR UI 配置

```bash
cd /path/to/claude-code-router-ui
cloudcli status
```

应该看到类似输出：

```
CCR UI - Status
════════════════════════════════════════════════════════════

[INFO] Version: 1.0.0
[INFO] Installation Directory:
       /path/to/claude-code-router-ui
[INFO] Configuration:
       CLAUDE_CLI_PATH: ccr
       CLAUDE_CLI_ARGS: code
       CLAUDE_CHAT_MODE: cli
```

### 3. 测试聊天功能

1. 启动服务：`npm run dev`
2. 访问 `http://localhost:5173`
3. 创建或选择一个项目
4. 发送测试消息，确认 CCR 正常响应

---

## 生产部署建议

### 推荐配置

- ✅ 使用**全局安装**方式（方案 1）
- ✅ 设置固定的 `PORT` 和 `WORKSPACES_ROOT`
- ✅ 使用 `pm2` 或 `systemd` 管理服务进程

### 示例：使用 PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start npm --name "ccr-ui" -- run start

# 设置开机自启
pm2 startup
pm2 save
```

### 示例：使用 Docker 部署

创建 `Dockerfile`：

```dockerfile
FROM node:20

# 安装 CCR
RUN npm install -g @musistudio/claude-code-router

# 复制项目文件
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# 构建前端
RUN npm run build

# 设置环境变量
ENV CLAUDE_CLI_PATH=ccr
ENV CLAUDE_CLI_ARGS=code
ENV CLAUDE_CHAT_MODE=cli
ENV CLAUDE_SKIP_AUTH_CHECK=true

EXPOSE 3001
CMD ["npm", "run", "start"]
```

---

## 总结

| 场景 | 推荐方案 | 配置示例 |
|------|----------|----------|
| 个人使用/生产环境 | 全局安装 | `CLAUDE_CLI_PATH=ccr` |
| 开发/调试两个项目 | 相对路径 | `CLAUDE_CLI_COMMAND=node ../sec-claude-code-router/dist/cli.js code` |
| 自定义安装位置 | 环境变量 | `CLAUDE_CLI_COMMAND=node ${CCR_PATH}/dist/cli.js code` |
| 测试/临时使用 | 绝对路径 | `CLAUDE_CLI_COMMAND=node /full/path/to/cli.js code` |

**最佳实践：** 优先使用**全局安装**方式，这是最标准、最便于维护的部署方案。
