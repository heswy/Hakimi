import { ChildProcess, spawn } from 'child_process';
import { access, readFile } from 'fs/promises';
import { App, Notice } from 'obsidian';
import { EventEmitter } from 'events';
import { constants as fsConstants } from 'fs';
import { join } from 'path';
import ObsidianKimiPlugin from '../main';
import { getLocalizedStrings } from '../i18n';

// ACP Protocol v0.10.8 JSON-RPC 消息格式
interface JSONRPCMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// ACP Content Block
interface ACPContentBlock {
  type: 'text' | 'image' | 'thinking' | 'tool_call' | 'tool_result';
  text?: string;
  data?: string;
  mime_type?: string;
  tool_call_id?: string;
  name?: string;
  arguments?: Record<string, any>;
  result?: any;
}

interface ACPHttpHeader {
  name: string;
  value: string;
}

interface ACPHttpMCPServer {
  type: 'http' | 'sse';
  name: string;
  url: string;
  headers: ACPHttpHeader[];
}

interface ACPStdioEnvVariable {
  name: string;
  value: string;
}

interface ACPStdioMCPServer {
  type: 'stdio';
  name: string;
  command: string;
  args: string[];
  env: ACPStdioEnvVariable[];
}

type ACPSessionMCPServer = ACPHttpMCPServer | ACPStdioMCPServer;

const ACP_INTERRUPTED_ERROR = 'ACP_INTERRUPTED';
const ACP_DISCONNECTED_ERROR = 'ACP_DISCONNECTED';

export class ACPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
  private toolCallSnapshots = new Map<string, { name: string; argumentsText: string }>();
  private plugin: ObsidianKimiPlugin;
  private app: App;
  private buffer = '';
  private isConnecting = false;
  private connected = false;
  private sessionId: string | null = null;

  constructor(plugin: ObsidianKimiPlugin) {
    super();
    this.plugin = plugin;
    this.app = plugin.app;
  }

  /**
   * 连接到 Kimi ACP Server
   * ACP Protocol: initialize -> session/new
   */
  async connect(options?: { resumeSessionId?: string | null }): Promise<boolean> {
    if (this.process || this.isConnecting) {
      return this.connected;
    }

    this.isConnecting = true;
    
    const kimiPath = this.plugin.settings.kimiPath || 'kimi';
    const vaultBasePath = (this.app.vault.adapter as any).basePath || '.';
    const workDir = this.plugin.settings.workingDirectory || vaultBasePath;

    try {
      const kimiArgs: string[] = ['acp'];
      const sessionMcpServers = await this.buildSessionMcpServers();

      const env: any = {
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/Users/orange/.local/bin',
        HOME: process.env.HOME,
      };

      if (this.plugin.settings.apiKey) {
        env.KIMI_API_KEY = this.plugin.settings.apiKey;
        env.KIMI_BASE_URL = this.getApiBaseUrl(this.plugin.settings.apiProvider);
      }

      this.log('info', `Starting ${kimiPath} ${kimiArgs.join(' ')} in ${workDir}`);

      this.process = spawn(kimiPath, kimiArgs, {
        cwd: workDir,
        env,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleStdout(data.toString());
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const message = data.toString();
        this.log('error', `stderr: ${message}`);
      });

      this.process.on('close', (code) => {
        this.log('info', `Process exited with code ${code}`);
        this.cleanup();
        this.emit('disconnected', code);
      });

      this.process.on('error', (err) => {
        this.log('error', `Process error: ${err.message}`);
        this.isConnecting = false;
        this.emit('error', err);
        if (err.message?.includes('ENOENT')) {
          new Notice(getLocalizedStrings().notices.kimiCliNotFound);
        }
      });

      // ACP Protocol: Step 1 - Initialize
      const initResult = await this.sendRequest('initialize', {
        protocol_version: 1,
        client_capabilities: {
          auto_update: true,
          mcp_capabilities: { http: true, sse: false },
          session_capabilities: { list: true, resume: true },
        },
        client_info: {
          name: 'obsidian-kimi-plugin',
          version: '0.1.0',
        },
      });

      this.log('info', `Initialized with protocol version ${initResult.protocol_version}`);

      // ACP Protocol: Step 2 - Create or Resume Session
      const sessionRequest: Record<string, any> = {
        cwd: workDir,
        mcpServers: sessionMcpServers,
      };
      if (sessionMcpServers.length > 0) {
        sessionRequest.mcp_servers = sessionMcpServers;
        this.log('info', `Registering ${sessionMcpServers.length} MCP server(s) for ACP session`);
      }

      if (options?.resumeSessionId) {
        await this.sendRequest('session/resume', {
          ...sessionRequest,
          sessionId: options.resumeSessionId,
        });
        this.sessionId = options.resumeSessionId;
        this.log('info', `Session resumed: ${this.sessionId}`);
      } else {
        const sessionResult = await this.sendRequest('session/new', sessionRequest);
        this.sessionId = sessionResult.sessionId;
        this.log('info', `Session created: ${this.sessionId}`);
      }

      this.connected = true;
      this.isConnecting = false;
      this.emit('connected');
      
      return true;

    } catch (error: any) {
      this.log('error', `Connection failed: ${error.message || error}`);
      this.isConnecting = false;
      this.emit('error', error);
      
      if (error.message?.includes('AUTH_REQUIRED')) {
        new Notice(getLocalizedStrings().notices.kimiLoginFirst, 5000);
      }
      
      return false;
    }
  }

  private cleanup(): void {
    this.process = null;
    this.connected = false;
    this.isConnecting = false;
    this.sessionId = null;
    this.buffer = '';
    this.toolCallSnapshots.clear();
    this.pendingRequests.clear();
  }

  private rejectPendingRequests(reason: string): void {
    if (this.pendingRequests.size === 0) {
      return;
    }

    const error = new Error(reason);
    for (const { reject } of this.pendingRequests.values()) {
      reject(error);
    }
    this.pendingRequests.clear();
  }

  private log(level: string, message: string): void {
    if (this.plugin.settings.debugMode) {
      console.log(`[ACP ${level}] ${message}`);
    }
  }

  private async buildSessionMcpServers(): Promise<ACPSessionMCPServer[]> {
    const dedupedServers = new Map<string, ACPSessionMCPServer>();

    for (const configPath of await this.getExternalMcpConfigPaths()) {
      const externalServers = await this.loadSessionMcpServersFromConfig(configPath);
      for (const server of externalServers) {
        dedupedServers.set(server.name, server);
      }
    }

    if (this.plugin.settings.enableVaultMCP) {
      await this.plugin.vaultServer.ensureStarted();
      const vaultServer = this.plugin.vaultServer.getACPServerDefinition();
      dedupedServers.set(vaultServer.name, vaultServer);
    }

    return Array.from(dedupedServers.values());
  }

  private async getExternalMcpConfigPaths(): Promise<string[]> {
    const seen = new Set<string>();
    const paths: string[] = [];
    const candidates = [this.getGlobalMcpConfigPath(), this.plugin.settings.mcpConfigPath];

    for (const candidate of candidates) {
      if (!candidate || seen.has(candidate)) {
        continue;
      }

      try {
        await access(candidate, fsConstants.R_OK);
        paths.push(candidate);
        seen.add(candidate);
      } catch {
        // Ignore missing or unreadable MCP config files.
      }
    }

    return paths;
  }

  private getGlobalMcpConfigPath(): string {
    const shareDir = process.env.KIMI_SHARE_DIR || join(process.env.HOME || '', '.kimi');
    return join(shareDir, 'mcp.json');
  }

  private getApiBaseUrl(provider: string): string {
    switch (provider) {
      case 'hakimi-code':
        return 'https://api.kimi.com/coding/v1';
      case 'moonshot-ai':
        return 'https://api.moonshot.ai/v1';
      case 'moonshot-cn':
      default:
        return 'https://api.moonshot.cn/v1';
    }
  }

  private async loadSessionMcpServersFromConfig(configPath: string): Promise<ACPSessionMCPServer[]> {
    try {
      const raw = await readFile(configPath, 'utf8');
      const parsed = JSON.parse(raw);
      const mcpServers = parsed?.mcpServers;

      if (!mcpServers || typeof mcpServers !== 'object') {
        return [];
      }

      const sessionServers: ACPSessionMCPServer[] = [];
      for (const [name, config] of Object.entries(mcpServers)) {
        const normalized = this.normalizeConfigServer(name, config);
        if (normalized) {
          sessionServers.push(normalized);
        }
      }

      this.log('info', `Loaded ${sessionServers.length} MCP server(s) from ${configPath}`);
      return sessionServers;
    } catch (error: any) {
      this.log('error', `Failed to load MCP config ${configPath}: ${error?.message || error}`);
      new Notice(getLocalizedStrings().notices.mcpConfigLoadFailed(configPath), 5000);
      return [];
    }
  }

  private normalizeConfigServer(name: string, config: any): ACPSessionMCPServer | null {
    if (!config || typeof config !== 'object') {
      return null;
    }

    const transport = String(config.transport || '').toLowerCase();

    if (typeof config.url === 'string' && config.url.trim()) {
      return {
        type: transport === 'sse' ? 'sse' : 'http',
        name,
        url: config.url,
        headers: this.normalizeKeyValueEntries(config.headers),
      };
    }

    if (typeof config.command === 'string' && config.command.trim()) {
      return {
        type: 'stdio',
        name,
        command: config.command,
        args: Array.isArray(config.args)
          ? config.args.filter((value: unknown): value is string => typeof value === 'string')
          : [],
        env: this.normalizeKeyValueEntries(config.env),
      };
    }

    this.log('error', `Skipping unsupported MCP server config "${name}"`);
    return null;
  }

  private normalizeKeyValueEntries(input: any): Array<{ name: string; value: string }> {
    if (!input || typeof input !== 'object') {
      return [];
    }

    return Object.entries(input).flatMap(([name, value]) => {
      if (typeof value === 'undefined') {
        return [];
      }

      return [{ name, value: String(value) }];
    });
  }

  /**
   * 断开连接
   */
  disconnect(reason: string = ACP_DISCONNECTED_ERROR): void {
    this.rejectPendingRequests(reason);
    if (this.process) {
      try {
        this.process.kill();
      } catch (e) {
        // Ignore
      }
    }
    this.cleanup();
  }

  /**
   * 重新连接
   */
  async reconnect(): Promise<boolean> {
    const sessionId = this.sessionId;
    this.disconnect();
    await new Promise(resolve => setTimeout(resolve, 500));
    if (sessionId) {
      try {
        return await this.connect({ resumeSessionId: sessionId });
      } catch {
        return this.connect();
      }
    }

    return this.connect();
  }

  async interruptCurrentTurn(): Promise<boolean> {
    const sessionId = this.sessionId;
    this.disconnect(ACP_INTERRUPTED_ERROR);
    await new Promise(resolve => setTimeout(resolve, 350));
    if (sessionId) {
      try {
        return await this.connect({ resumeSessionId: sessionId });
      } catch {
        return this.connect();
      }
    }

    return this.connect();
  }

  async startNewSession(): Promise<boolean> {
    this.disconnect();
    await new Promise(resolve => setTimeout(resolve, 350));
    return this.connect();
  }

  async resumeSession(sessionId: string): Promise<boolean> {
    this.disconnect();
    await new Promise(resolve => setTimeout(resolve, 350));
    try {
      return await this.connect({ resumeSessionId: sessionId });
    } catch {
      return false;
    }
  }

  /**
   * 发送用户消息
   * ACP Protocol: session/prompt
   */
  async sendMessage(content: string, context?: any): Promise<void> {
    if (!this.connected || !this.sessionId) {
      const ok = await this.connect();
      if (!ok) {
        throw new Error('Failed to connect to Kimi ACP');
      }
    }

    // 构建 Vault 上下文
    let fullContent = content;
    if (this.plugin.settings.autoContext) {
      const vaultContext = await this.getVaultContext();
      if (vaultContext) {
        fullContent = this.injectContext(content, vaultContext);
      }
    }

    // Add system prompt about available vault tools
    const systemPrompt = this.plugin.settings.enableVaultMCP
      ? 'You are an AI assistant integrated with Obsidian. When the user asks to create, edit, search, or inspect notes, always prefer the available Obsidian tools whose names start with "obsidian_" instead of generic file, shell, or terminal tools. Use concise, plain formatting and avoid emoji unless the user explicitly asks for them.'
      : 'You are an AI assistant integrated with Obsidian. Use concise, plain formatting and avoid emoji unless the user explicitly asks for them.';

    // ACP Protocol: session/prompt with content blocks
    const prompt: ACPContentBlock[] = [
      { type: 'text', text: systemPrompt },
      { type: 'text', text: fullContent },
    ];

    try {
      const result = await this.sendRequest('session/prompt', {
        prompt,
        sessionId: this.sessionId,
      });
      this.consumePromptResponse(result);
    } catch (error: any) {
      const message = error?.message || getLocalizedStrings().notices.unknownError;
      if (message === ACP_INTERRUPTED_ERROR || message === ACP_DISCONNECTED_ERROR) {
        return;
      }

      this.emit('error', { message });
    }
  }

  /**
   * 处理 stdout 数据
   */
  private handleStdout(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message: JSONRPCMessage = JSON.parse(line);
          this.handleMessage(message);
        } catch (e) {
          this.log('warn', `Failed to parse: ${line.substring(0, 100)}`);
        }
      }
    }
  }

  /**
   * 处理 ACP 消息
   */
  private handleMessage(message: JSONRPCMessage): void {
    this.log('debug', `Received: ${message.method || `response id=${message.id}`}`);

    // Handle responses to pending requests
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        const err = new Error(message.error.message);
        (err as any).code = message.error.code;
        (err as any).data = message.error.data;
        reject(err);
      } else {
        resolve(message.result);
      }
      return;
    }

    // Handle server notifications
    if (message.method) {
      switch (message.method) {
        case 'session/update':
          // Streaming updates from the agent
          this.handleSessionUpdate(message.params);
          break;

        case 'session/request_permission':
          if (message.id !== undefined) {
            const options = message.params?.options || [];
            const allowOption = options.find((o: any) => o.kind === 'allow_once') || 
                               options.find((o: any) => o.kind === 'allow_always') ||
                               options[0];
            const toolTitle = message.params?.toolCall?.title || 'unknown tool';
            this.log(
              'info',
              `Permission requested for ${toolTitle}, auto-selecting ${allowOption?.optionId || 'approve'}`
            );
            
            this.sendRaw(JSON.stringify({
              jsonrpc: '2.0',
              id: message.id,
              result: {
                outcome: {
                  outcome: 'selected',
                  optionId: allowOption?.optionId || 'approve',
                },
              },
            }));
          }
          break;

        default:
          this.log('debug', `Unknown notification: ${message.method}`);
      }
    }
  }

  /**
   * 处理 session/update 通知
   */
  private handleSessionUpdate(params: any): void {
    if (!params) return;

    // Handle update wrapper (ACP protocol format)
    const update = params.update || params;
    const sessionUpdateType = update.sessionUpdate || params.sessionUpdate;

    if (sessionUpdateType === 'tool_call' || sessionUpdateType === 'tool_call_update') {
      this.handleToolSessionUpdate(update);
      return;
    }

    if (sessionUpdateType === 'agent_thought_chunk') {
      const thinkingText = this.extractContentText(update.content);
      if (thinkingText) {
        this.emit('stream', { thinking: thinkingText });
      }
      return;
    }

    // Handle content updates
    if (update.content) {
      // Content can be a single block or array
      const blocks = Array.isArray(update.content) ? update.content : [update.content];
      for (const block of blocks) {
        this.handleContentBlock(block);
      }
    }

    // Handle tool calls
    if (update.tool_calls) {
      const calls = Array.isArray(update.tool_calls) ? update.tool_calls : [update.tool_calls];
      for (const call of calls) {
        this.emitToolCall({
          id: call.id,
          name: call.name,
          arguments: call.arguments || call.args || {},
        });
      }
    }

    // Handle completion - check both params and update (ACP uses camelCase: stopReason)
    const stopReason = update.stopReason || params.stopReason;
    if (stopReason === 'stop' || stopReason === 'end_turn') {
      this.log('info', `Session update completed with stopReason: ${stopReason}`);
      console.log(`[ACP] handleSessionUpdate emitting message_complete with stop_reason: ${stopReason}`);
      this.emit('message_complete', { stop_reason: stopReason });
    }
  }

  private handleToolSessionUpdate(update: any): void {
    const toolCallId = update.toolCallId || update.tool_call_id;
    if (!toolCallId) {
      return;
    }

    const text = this.extractContentText(update.content);
    const currentSnapshot = this.toolCallSnapshots.get(toolCallId) || {
      name: update.title || 'Tool',
      argumentsText: '',
    };

    const nextSnapshot = {
      name: update.title || currentSnapshot.name || 'Tool',
      argumentsText: update.status === 'in_progress' && text ? text : currentSnapshot.argumentsText,
    };

    this.toolCallSnapshots.set(toolCallId, nextSnapshot);

    this.emitToolCall({
      id: toolCallId,
      name: nextSnapshot.name,
      arguments: this.parseToolArguments(nextSnapshot.argumentsText),
    });

    // 处理工具完成状态 - 支持多种状态值
    const status = update.status;
    const isCompleted = status === 'completed' || status === 'finished' || status === 'success' || status === 'done';
    const isFailed = status === 'failed' || status === 'error' || status === 'cancelled';

    if (isCompleted || isFailed) {
      this.log('info', `Tool ${toolCallId} ${isFailed ? 'failed' : 'completed'} with status: ${status}`);
      this.emit('tool_result', {
        id: toolCallId,
        result: isFailed ? { error: text || `Tool execution ${status}` } : this.parseToolPayload(text),
        error: isFailed,
      });
      this.toolCallSnapshots.delete(toolCallId);
    }
  }

  private extractContentText(content: any): string {
    if (!content) {
      return '';
    }

    if (typeof content.text === 'string') {
      return content.text;
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item?.content?.text === 'string') {
            return item.content.text;
          }

          if (typeof item?.text === 'string') {
            return item.text;
          }

          return '';
        })
        .join('');
    }

    if (typeof content?.content?.text === 'string') {
      return content.content.text;
    }

    return '';
  }

  private parseToolArguments(text: string): Record<string, any> {
    const payload = this.parseToolPayload(text);
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, any>;
    }

    if (typeof payload === 'string' && payload.trim()) {
      return { input: payload };
    }

    return {};
  }

  private parseToolPayload(text: string): any {
    const trimmed = text.trim();
    if (!trimmed) {
      return '';
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  /**
   * 处理内容块
   */
  private handleContentBlock(block: ACPContentBlock): void {
    if (!block) return;

    switch (block.type) {
      case 'text':
        if (block.text) {
          console.log('[ACP] Processing text block, length:', block.text.length);
          this.emit('stream', { delta: block.text });
        }
        break;

      case 'thinking':
        // Emit thinking content separately so UI can display it differently
        if (block.text) {
          this.emit('stream', { thinking: block.text });
        }
        break;

      case 'tool_call':
        void this.handleToolCall(block);
        break;

      case 'tool_result':
        this.emit('tool_result', {
          id: block.tool_call_id,
          result: block.result,
        });
        break;
    }
  }

  /**
   * 处理 Tool Call
   */
  private async handleToolCall(block: ACPContentBlock): Promise<void> {
    this.emitToolCall({
      id: block.tool_call_id || `tool_${Date.now()}`,
      name: block.name || '',
      arguments: block.arguments || {},
    });
  }

  private emitToolCall(toolCall: {
    id?: string;
    name?: string;
    arguments?: Record<string, any>;
  }): void {
    const normalizedToolCall = {
      id: toolCall.id || `tool_${Date.now()}`,
      name: toolCall.name || '',
      arguments: toolCall.arguments || {},
    };

    this.log('info', `Tool call: ${normalizedToolCall.name}`);
    this.emit('tool_call', normalizedToolCall);
  }

  private consumePromptResponse(result: any): void {
    if (result?.content) {
      const blocks = Array.isArray(result.content) ? result.content : [result.content];
      for (const block of blocks) {
        this.handleContentBlock(block);
      }
    }

    const stopReason = result?.stopReason;
    if (stopReason === 'stop' || stopReason === 'end_turn') {
      this.log('info', `Prompt completed with stopReason: ${stopReason}`);
      console.log(`[ACP] consumePromptResponse emitting message_complete with stopReason: ${stopReason}`);
      this.emit('message_complete', { stop_reason: stopReason });
    }
  }

  /**
   * 发送原始 JSON-RPC 消息（用于响应）
   */
  private sendRaw(json: string): void {
    if (!this.process?.stdin) {
      this.log('error', 'Cannot send: not connected');
      return;
    }
    this.process.stdin.write(json + '\n');
  }

  /**
   * 发送 JSON-RPC 请求
   */
  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error(getLocalizedStrings().notices.notConnected));
        return;
      }

      const id = ++this.messageId;
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });
      
      const json = JSON.stringify(message);
      this.log('debug', `Request: ${method} (id=${id})`);
      
      this.process.stdin.write(json + '\n');

      // 120 second timeout for LLM requests (may include tool execution)
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(getLocalizedStrings().notices.requestTimeout));
        }
      }, 120000);
    });
  }

  /**
   * 获取 Vault 上下文
   */
  private async getVaultContext(): Promise<any> {
    const { vault } = this.app;
    const activeFile = this.app.workspace.getActiveFile();
    
    const context: any = {
      vaultName: vault.getName(),
      totalNotes: vault.getMarkdownFiles().length,
    };

    if (activeFile && this.plugin.settings.includeActiveNote) {
      const ext = activeFile.extension.toLowerCase();
      if (['md', 'txt', 'markdown'].includes(ext)) {
        try {
          const content = await vault.read(activeFile);
          context.activeNote = activeFile.path;
          context.activeNoteContent = content.substring(0, this.plugin.settings.maxActiveNoteLength);
        } catch (e) {
          // Ignore
        }
      }
    }

    if (this.plugin.settings.includeRecentFiles) {
      context.recentFiles = vault.getMarkdownFiles()
        .sort((a, b) => b.stat.mtime - a.stat.mtime)
        .slice(0, this.plugin.settings.recentFilesCount)
        .map(f => ({ path: f.path, name: f.basename }));
    }

    return context;
  }

  /**
   * 注入上下文到消息
   */
  private injectContext(content: string, context: any): string {
    const parts: string[] = [];
    
    parts.push(`<context>`);
    parts.push(`Vault: ${context.vaultName}`);
    parts.push(`Total Notes: ${context.totalNotes}`);
    
    if (context.activeNote) {
      parts.push(`\nActive Note: ${context.activeNote}`);
      if (context.activeNoteContent) {
        parts.push(`\nContent:\n${context.activeNoteContent}`);
      }
    }
    
    if (context.recentFiles?.length) {
      parts.push(`\nRecent Files:`);
      context.recentFiles.forEach((f: any) => parts.push(`- ${f.path}`));
    }
    
    parts.push(`</context>`);
    parts.push(`\n\n${content}`);
    
    return parts.join('\n');
  }

  isConnected(): boolean {
    return this.connected;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}
