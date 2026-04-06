# Code Review Fixes

本文档记录对 Code Review 意见的修复。

## 第二轮修复（最新）

### P2: 修复读取白名单绕过问题 ✅

**问题**: `obsidian_vault_read` 已修复，但其他读取入口仍绕过白名单

**修复**:
1. **`obsidian_get_active_note`** (src/acp/client.ts:559): 添加扩展名检查，非白名单返回错误
2. **`getVaultContext`** (src/acp/client.ts:758): 
   - 自动上下文注入时检查扩展名
   - 非白名单文件跳过内容读取，记录跳过原因
   - `recentFiles` 也过滤为仅白名单扩展名
3. **`summarize-current-note`** (src/main.ts:142): 添加扩展名检查，不允许则显示 Notice
4. **`ask-kimi-about-note`** (src/main.ts:162): 同上

### P1: 写入/删除确认层 ✅

**问题**: 安全工具函数存在但未真正使用，高危操作仍是"先执行后告知"

**修复**:
1. **新增设置项** `allowDestructiveOperations`（默认 `false`）
2. **修改 `obsidian_vault_write`**: 当文件已存在且设置不允许时，返回错误：
   ```json
   {
     "success": false,
     "error": "Cannot overwrite existing file... Destructive operations are disabled",
     "requiresConfirmation": true,
     "operation": "overwrite"
   }
   ```
3. **修改 `obsidian_vault_delete`**: 当设置不允许时，返回类似错误
4. **设置面板**: 添加带 ⚠️ 警告的开关，切换时显示 Notice

### P2: 隐藏文件黑名单规则 ✅

**问题**: `/^\./` 只匹配 `./` 开头，不匹配 `.secret.md`

**修复** (`src/utils/security.ts`):
```typescript
const SENSITIVE_PATTERNS = [
  /^\.obsidian($|\/)/,        // Obsidian 配置目录
  /^\.git($|\/)/,             // Git 目录
  /^\.kimi($|\/)/,            // Kimi 配置
  /^node_modules($|\/)/,      // Node modules
  /\/\./,                     // 任何路径段以 . 开头 (如 folder/.secret)
  /^\./,                      // 文件/目录名以 . 开头 (如 .secret.md)
];
```

### P2: message_complete 转正 streaming 消息 ✅

**问题**: `handleMessageComplete` 只清 loading，没处理 id='streaming' 的消息

**修复** (`src/ui/components/ChatPanel.tsx`):
```typescript
const handleMessageComplete = () => {
  setIsLoading(false);
  setCurrentToolCall(null);
  
  // 确保最后一条 streaming 消息被转正
  setMessages(prev => {
    const lastMsg = prev[prev.length - 1];
    if (lastMsg && lastMsg.id === 'streaming') {
      const updated = [...prev];
      updated[updated.length - 1] = {
        ...lastMsg,
        id: `msg-${Date.now()}`
      };
      return updated;
    }
    return prev;
  });
};
```

### P2: 读取路径也走扩展名白名单 ✅

**问题**: `validateNotePath(args.path, false)` 跳过了扩展名检查

**修复** (`src/acp/client.ts`):
- `read` 操作改为 `validateNotePath(args.path, true)`
- 添加运行时扩展名二次检查（读取时检查 file.extension）

### P3: README 残留失配 ✅

**修复**:
- 删除重复的 Settings 区块
- 删除 "Show Token Count" 项
- 添加 "Allow Destructive Operations" 项
- 将占位符链接改为通用说明 + 发布前提醒

---

## 第一轮修复

### P1: Vault 安全限制 ✅
- 新增 `src/utils/security.ts` 验证路径和扩展名
- 限制只允许 `.md`, `.txt`, `.markdown`
- 禁止 `.obsidian/`, `.git/`, `.kimi/`, `node_modules/` 等敏感目录
- 搜索添加扫描上限（1000 文件）

### P2: 重连状态恢复 ✅
- `ChatPanel` 订阅 `connected` 事件
- 订阅 `message_complete` 事件
- `handleReconnect()` 检查返回值

### P2: 跨平台设置页 ✅
- 使用 `spawn()` 替代 `exec()`
- 使用配置的路径 `settings.kimiPath`

### P3: IME 合成态 ✅
- 添加 `isComposingRef`
- 处理 `compositionstart/end` 事件

### P3: 文档一致 ✅
- 移除 `Show Token Count` 设置
- 更新 README 描述

---

## 构建验证

```bash
npm run build
# ✅ 两轮修复后构建均通过
```

## 安全建议（后续版本考虑）

- [ ] 添加高危操作二次确认对话框（而非仅返回错误）
- [ ] 支持 dry-run 模式预览操作
- [ ] 添加操作日志/审计
- [ ] 支持路径白名单配置
