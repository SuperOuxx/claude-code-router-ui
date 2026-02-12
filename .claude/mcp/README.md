# MCP 服务配置指南

本项目使用 Model Context Protocol (MCP) 服务来扩展 subagent 的能力。

## 📋 已配置的 MCP 服务

### 1. Database MCP (`database-mcp`)
**用途**: 数据库连接和测试数据管理

**配置文件**: `.claude/mcp/database-mcp.config.json`

**主要功能**:
- 执行数据库查询
- 生成测试数据
- 创建和管理测试表
- 验证数据完整性

**环境变量**:
```bash
# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/testdb

# MySQL
DATABASE_URL=mysql://user:password@localhost:3306/testdb

# SQLite
DATABASE_URL=sqlite:///path/to/database.db
```

**安装**:
```bash
# PostgreSQL
npm install -g @modelcontextprotocol/server-postgres

# MySQL
npm install -g @modelcontextprotocol/server-mysql

# SQLite
npm install -g @modelcontextprotocol/server-sqlite
```

### 2. Playwright MCP (`playwright-mcp`)
**用途**: 浏览器自动化和UI测试执行

**配置文件**: `.claude/mcp/playwright-mcp.config.json`

**主要功能**:
- 导航到指定URL
- 元素定位和交互
- 表单填写
- 截图和录屏
- JavaScript执行

**环境变量**:
```bash
HEADLESS=true              # 无头模式
BROWSER=chromium           # 浏览器选择: chromium/firefox/webkit
VIEWPORT_WIDTH=1280        # 视口宽度
VIEWPORT_HEIGHT=720        # 视口高度
```

**安装**:
```bash
npm install -g @executeautomation/playwright-mcp-server
npx playwright install     # 安装浏览器
```

## 🔧 Claude Code MCP 注册

### 方法1: 通过配置文件注册
编辑 `~/.claude/mcp.json`:
```json
{
  "mcpServers": {
    "database-mcp": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://localhost:5432/test"
      }
    },
    "playwright-mcp": {
      "command": "npx",
      "args": ["-y", "@executeautomation/playwright-mcp-server"],
      "env": {
        "HEADLESS": "true"
      }
    }
  }
}
```

### 方法2: 通过 Claude Code UI 注册
1. 打开 Claude Code
2. 进入 Settings → MCP Servers
3. 添加新的 MCP 服务配置
4. 保存并重启 Claude Code

## ✅ 验证 MCP 连接

### 检查 MCP 服务状态
```bash
# 列出已注册的 MCP 服务
claude-code mcp list

# 测试特定 MCP 服务
claude-code mcp test database-mcp
claude-code mcp test playwright-mcp
```

### 在 Subagent 中测试
```bash
# 测试数据库 MCP
@test-data-generator 连接数据库并生成10组测试数据

# 测试 Playwright MCP
@ui-test-runner 打开 https://example.com 并截图
```

## 🛠️ 常见问题

### 问题1: MCP 服务未找到
**症状**: Subagent 报错 "MCP server not found"

**解决方案**:
1. 检查 `~/.claude/mcp.json` 是否正确配置
2. 验证 MCP 包是否已安装
3. 重启 Claude Code

### 问题2: 数据库连接失败
**症状**: "Connection refused" 或 "Authentication failed"

**解决方案**:
1. 验证 `DATABASE_URL` 环境变量
2. 检查数据库服务是否运行
3. 确认用户名密码正确

### 问题3: Playwright 浏览器未安装
**症状**: "Executable doesn't exist"

**解决方案**:
```bash
npx playwright install
npx playwright install-deps  # Linux系统依赖
```

## 📊 MCP 权限级别

| 权限 | 说明 | 使用场景 |
|-----|------|---------|
| `read` | 只读访问 | 原型分析、需求解析 |
| `write` | 读写访问 | 测试数据生成、报告生成 |
| `execute` | 执行权限 | UI测试、脚本执行 |

**安全建议**:
- 只给 Subagent 必需的最低权限
- 测试数据生成使用 `read` 权限
- UI测试执行需要 `execute` 权限

## 🔗 相关文档
- [MCP 官方文档](https://modelcontextprotocol.io/)
- [项目 Subagent 配置](../agents/README.md)
- [测试工作流文档](../../docs/test-workflow.md)
