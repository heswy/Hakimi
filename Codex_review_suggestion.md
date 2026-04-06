# Codex Review Suggestion

## 审查范围

- 审查方式：只读审查，未改写现有源码；本次仅新增本说明文档。
- 审查对象：`src/` 下主流程、ACP 通信、Vault 工具、Skills、React UI，以及 `README.md`、`manifest.json`、构建配置。
- 验证动作：执行了 `npm run build`，构建通过；未发现项目自带的源码测试用例。

## 总结

这个项目当前可以完成构建，但存在几类更值得优先处理的问题：

1. AI 侧拿到的 Vault 写删权限过大，缺少确认和路径约束。
2. ACP 连接状态与 UI 状态机没有闭环，重连和完成态都可能表现错误。
3. 设置页、README 和实际实现存在多处不一致，会误导用户和后续维护者。

## Findings

### P1: Vault 工具暴露了无确认的任意 `TFile` 写入/删除能力

- 位置：`src/acp/client.ts:364-383`，`src/acp/client.ts:443-447`
- 现象：
  - `obsidian_vault_write` 会直接覆盖已有 `TFile`，否则直接 `create`。
  - `obsidian_vault_delete` 会直接删除任意 `TFile`。
  - 这里没有限制文件类型必须是 Markdown，也没有阻止对 `.obsidian/`、插件数据、附件等路径进行操作。
  - 这些能力是通过自然语言暴露给模型的，没有二次确认、预览或 allowlist。
- 风险：
  - 模型误判、提示注入或用户误操作都可能导致配置文件、附件文件、插件数据被覆盖或删除。
  - README 写的是“notes”，但实现实际上是“任意 `TFile`”。
- 建议：
  - 至少限制为 `.md` 文件，默认拒绝 `.obsidian/` 等敏感目录。
  - 对 `write`/`delete` 增加确认层、dry-run 或可配置的只读模式。
  - 将“覆盖已有文件”和“删除文件”拆成显式高风险操作。

### P2: 自动重连后 UI 不会恢复，手动重连还可能显示假在线

- 位置：`src/acp/client.ts:100-110`，`src/acp/client.ts:136`，`src/ui/components/ChatPanel.tsx:121-145`，`src/ui/components/ChatPanel.tsx:266-275`
- 现象：
  - ACP 进程断开后，`ACPClient` 会自动重连，并在成功后发出 `connected` 事件。
  - `ChatPanel` 只监听了 `stream`、`tool_call`、`tool_result`、`error`、`disconnected`，没有监听 `connected`。
  - 所以一旦断线，UI 会被置为 `isConnected=false`，但自动重连成功后不会切回在线状态。
  - 手动重连时，`handleReconnect()` 直接 `await acpClient.reconnect(); setIsConnected(true);`，没有检查返回值是否为 `false`。
- 风险：
  - 自动重连成功后，输入框仍可能保持禁用。
  - 手动重连失败时，UI 仍可能显示已连接，形成错误状态。
- 建议：
  - `ChatPanel` 订阅 `connected` 事件，统一恢复 `isConnected`、`error` 和交互状态。
  - `handleReconnect()` 必须检查 `reconnect()` 的布尔结果，不应无条件 `setIsConnected(true)`。

### P2: 消息完成态处理不完整，可能导致 Loading 卡住

- 位置：`src/acp/client.ts:298-299`，`src/ui/components/ChatPanel.tsx:67-103`
- 现象：
  - `ACPClient` 明确处理了 `agent/message_complete` 事件。
  - 但 `ChatPanel` 没有监听这个事件，`isLoading=false` 仅发生在 `stream` 数据里带 `finish_reason` 时。
- 风险：
  - 如果服务端把完成信号独立放在 `agent/message_complete`，而不是塞进最后一个 stream chunk，前端会一直处于 loading，发送按钮也会被锁住。
- 建议：
  - 在 UI 层补 `message_complete` 监听，并把“结束 streaming message / 清空 loading / 清理 tool panel”放到统一完成逻辑里。

### P2: 设置页状态检查与真实连接逻辑脱节，并且对 Windows 不兼容

- 位置：`src/main.ts:490-500`，对比 `src/acp/client.ts:54-56`
- 现象：
  - 真正连接 ACP 时，会读取 `settings.kimiPath` 和 `settings.workingDirectory`。
  - 但设置页状态检查硬编码执行 `kimi --version` 和 `kimi info --format json 2>/dev/null || echo "{}"`。
  - 这既忽略了用户自定义的 CLI 路径，也把 Unix shell 重定向写死了。
- 风险：
  - 用户明明通过自定义路径可以连上，设置页却仍显示 “Kimi CLI not found”。
  - Windows 下 `2>/dev/null` 不是可靠写法，状态检查很容易误报失败。
- 建议：
  - 状态检查改为复用 ACP 的配置来源。
  - 不要依赖 shell 拼接字符串，改用参数化 `spawn`/`execFile`。

### P2: Vault 搜索与上下文收集是全量扫描，Vault 稍大就会明显变慢

- 位置：`src/acp/client.ts:418-440`，`src/acp/client.ts:675-678`
- 现象：
  - `obsidian_vault_search` 会逐个读取所有 Markdown 文件内容，直到凑够 `limit` 或遍历结束。
  - 每次自动上下文注入也会重新获取全部 Markdown 文件并排序，再截取最近 5 个。
- 风险：
  - 对大 Vault，这会造成明显延迟。
  - 搜索命中很少或完全不命中时，成本接近全库扫描。
- 建议：
  - 优先复用 `metadataCache`、最近文件缓存或增量索引。
  - 对搜索增加硬上限、取消机制和更明确的性能兜底。

### P3: 输入框没有处理 IME 合成态，中文输入时按 Enter 容易误发

- 位置：`src/ui/components/InputBox.tsx:26-31`
- 现象：
  - 当前逻辑只要检测到 `Enter && !shiftKey` 就发送，没有判断 `isComposing`。
- 风险：
  - 中文、日文、韩文输入法在候选词确认时常用 Enter，这里会把“确认上屏”误判为“发送消息”。
- 建议：
  - 增加对 `nativeEvent.isComposing` 的判断，或在 composition 期间屏蔽发送逻辑。

### P3: 文档、设置项和实现存在多处失配

- 位置：
  - `src/main.ts:409-417`
  - `src/ui/components/ChatPanel.tsx:51`
  - `src/ui/components/InputBox.tsx:75-77`
  - `README.md:15`
  - `README.md:173`
- 现象：
  - `Show Token Count` 有设置项，但代码中没有实际展示 token 的逻辑。
  - 欢迎语写了 “Use @ to reference notes”，但项目里没有对应解析/选择逻辑。
  - README 写的是 “Attach current note or any note”，但 UI 实际只能附加当前活动笔记。
- 风险：
  - 用户会按 README 和设置项预期功能，但实际得不到结果。
  - 后续维护者会被过时文档误导。
- 建议：
  - 要么删掉这些承诺，要么把功能真正补齐。
  - 对 README 做一次“按代码回填”的收敛，而不是按愿景描述功能。

### P3: 发布元数据和支持链接仍是占位内容

- 位置：`manifest.json:7-9`，`README.md:62`，`README.md:229-230`
- 现象：
  - `author` 还是 `Your Name`。
  - 仓库地址、赞助地址、Issue/Discussions 链接仍然是 `yourusername` 占位。
- 风险：
  - 如果直接发版，插件元数据和支持入口都是失效的。
  - 这会影响安装信任感、问题反馈路径和后续上架。
- 建议：
  - 在任何公开发布前先替换为真实作者信息和仓库链接。

## 其他观察

- `src/mcp/vault-server.ts` 与 `src/acp/client.ts` 中存在一套重复的 Vault 工具定义与实现；当前运行时真正使用的是 `ACPClient` 内部实现，`VaultMCPServer` 更像是未接通的平行实现。这种重复代码会放大后续漂移风险。
- `src/skills/manager.ts` 维护了 `cachedSkills`，但 `getAllSkills()` 每次仍会重新加载文件，缓存目前没有真正带来收益。
- 项目没有自带针对 `src/` 的自动化测试，当前质量更多依赖手工验证和构建通过。

## 本次验证记录

- 已阅读：
  - `src/main.ts`
  - `src/acp/client.ts`
  - `src/mcp/vault-server.ts`
  - `src/skills/manager.ts`
  - `src/ui/components/*.tsx`
  - `README.md`
  - `manifest.json`
- 已执行：
  - `npm run build`
- 结果：
  - 构建通过
  - 未发现源码测试文件

## 第二轮复审补充

本轮基于“修复已完成”的版本进行了回归审查，并再次执行了 `npm run build`。构建仍然通过，且以下问题已经看到明确改进：

- `connected` 事件已接入 UI，断线重连状态比上一版完整。
- `message_complete` 已接入 UI，不再只依赖 stream 中的 `finish_reason`。
- 设置页状态检查已改用 `spawn()`，跨平台兼容性明显优于原实现。
- 输入框已处理 IME 合成态，中文输入误发送风险已下降。
- 设置代码中的 `Show Token Count` 开关已删除。

不过，修复后仍有以下残留问题：

### P1: 写入与删除仍然是“先执行，后告知”，并没有真正建立确认层

- 位置：`src/acp/client.ts:372-411`，`src/acp/client.ts:507-526`
- 现象：
  - `obsidian_vault_write` 仍然会直接 `modify()` 或 `create()`。
  - `obsidian_vault_delete` 仍然会直接 `delete()`。
  - `src/utils/security.ts` 虽然新增了 `isHighRiskOperation()` 与 `getConfirmationMessage()`，但运行路径里并没有消费这些能力。
  - 当前返回的 `warning: 'File was overwritten'` 发生在覆盖之后，不是覆盖之前。
- 风险：
  - “有安全工具函数”不等于“真正建立了防误删/误覆盖机制”。
  - 模型侧仍可以一步完成 destructive action，用户没有确认机会。
- 建议：
  - 在执行前引入确认协议、dry-run 或显式批准流程。
  - 如果当前 ACP 协议层暂不支持确认，至少要将高风险操作默认降级为拒绝执行。

### P2: 隐藏文件/目录黑名单规则写错，实际无法覆盖大多数隐藏路径

- 位置：`src/utils/security.ts:8-15`
- 现象：
  - 当前隐藏路径规则是 `^\\./`。
  - 这只会匹配以字面量 `./` 开头的路径，不会匹配 `.secret.md`、`.env`、`folder/.secret.md` 这类真实隐藏文件。
- 风险：
  - 文档和修复说明里说“禁止隐藏文件”，但实现并没有真正拦住大多数隐藏路径。
- 建议：
  - 至少补上“路径段以 `.` 开头”的判断，而不是仅匹配开头的 `./`。

### P2: `message_complete` 现在只清 Loading，没有把 streaming 消息真正收口

- 位置：`src/ui/components/ChatPanel.tsx:147-149`
- 现象：
  - 当前 `handleMessageComplete()` 只执行 `setIsLoading(false)` 和 `setCurrentToolCall(null)`。
  - 如果服务端以 `message_complete` 结束，而最后一个 stream chunk 没带 `finish_reason`，最后一条 assistant 消息仍会保持 `id === 'streaming'`。
- 风险：
  - 下一轮回复可能继续拼接到上一条 assistant 消息上，形成消息串联错误。
- 建议：
  - 在 `message_complete` 分支里也执行一次“将最后一条 `streaming` 消息转正”的逻辑。

### P2: 读取路径仍然绕过了扩展名白名单

- 位置：`src/acp/client.ts:351-369`
- 现象：
  - `obsidian_vault_read` 使用的是 `validateNotePath(args.path, false)`。
  - 这里显式关闭了扩展名约束，因此只要路径不在敏感目录中，任意非敏感 `TFile` 仍然可以被读取。
- 风险：
  - 这与“仅允许 `.md` / `.txt` / `.markdown`”的修复宣称不一致。
  - 插件仍可能读取非笔记类文件。
- 建议：
  - 如果目标是“只允许笔记类文本文件”，读取路径也应走同一套扩展名白名单。
  - 如果确实需要更宽松的读取能力，应在文档里明确说明“读权限”和“写删权限”不是同一安全级别。

### P3: README 还有残留失配，元数据占位链接也还没清理干净

- 位置：`README.md:173`，`README.md:62`，`README.md:229-230`，`manifest.json:8-9`
- 现象：
  - README 仍然写着 `Show Token Count`，但该设置已经从实现中删除。
  - README 和 `manifest.json` 中的 `yourusername` 占位链接仍然存在。
- 风险：
  - 用户看到的能力说明和支持入口仍不完全可信。
- 建议：
  - README 再做一轮按代码回填的清理。
  - 发布前替换全部占位仓库链接与赞助链接。
