import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { App, TFile, TFolder } from 'obsidian';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod';
import type { ObsidianKimiSettings } from '../settings';
import { ALLOWED_EXTENSIONS, validateNotePath, validateVaultPath } from '../utils/security';

type SettingsGetter = () => ObsidianKimiSettings;

interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export class VaultMCPServer {
  private httpServer: Server | null = null;
  private port: number | null = null;
  private configPath: string | null = null;
  private readonly configId = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

  constructor(
    private app: App,
    private getSettings: SettingsGetter
  ) {}

  async ensureStarted(): Promise<void> {
    if (this.httpServer && this.port) {
      if (!this.configPath) {
        await this.writeConfigFile();
      }
      return;
    }

    await this.start();
  }

  async start(): Promise<void> {
    if (this.httpServer) {
      return;
    }

    const server = createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('error', onError);
        reject(error);
      };

      server.once('error', onError);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', onError);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Failed to determine Vault MCP server port');
    }

    this.httpServer = server;
    this.port = address.port;
    await this.writeConfigFile();
  }

  async stop(): Promise<void> {
    if (this.httpServer) {
      const server = this.httpServer;
      this.httpServer = null;
      this.port = null;

      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }

    if (this.configPath) {
      try {
        await fs.unlink(this.configPath);
      } catch {
        // Ignore cleanup failures for temp files.
      }
      this.configPath = null;
    }
  }

  getConfigPath(): string | null {
    return this.configPath;
  }

  getACPServerDefinition(): {
    type: 'http';
    name: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
  } {
    return {
      type: 'http',
      name: 'obsidian_vault',
      url: this.getUrl(),
      headers: [],
    };
  }

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'obsidian_vault_read',
        description: 'Read the content of a note from the Obsidian vault',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the note, e.g., "Projects/Idea.md"',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'obsidian_vault_write',
        description: 'Create a new note or overwrite an existing note in the Obsidian vault',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path for the note, e.g., "Projects/New-Idea.md"',
            },
            content: {
              type: 'string',
              description: 'Markdown content to write',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'obsidian_vault_append',
        description: 'Append content to the end of an existing note',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the note',
            },
            content: {
              type: 'string',
              description: 'Content to append',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'obsidian_vault_list',
        description: 'List files and folders in a directory',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Folder path (default: vault root)',
            },
          },
        },
      },
      {
        name: 'obsidian_vault_search',
        description: 'Search for notes containing specific text',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query text',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'obsidian_vault_delete',
        description: 'Delete a note from the vault',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the note to delete',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'obsidian_get_active_note',
        description: 'Get the currently open note in Obsidian',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'obsidian_get_recent_files',
        description: 'Get recently modified notes',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of recent files to return',
            },
          },
        },
      },
      {
        name: 'obsidian_get_backlinks',
        description: 'Get all notes that link to a specific note',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the note',
            },
          },
          required: ['path'],
        },
      },
    ];
  }

  async executeTool(name: string, args: any): Promise<any> {
    switch (name) {
      case 'obsidian_vault_read':
        return this.vaultRead(args?.path);

      case 'obsidian_vault_write':
        return this.vaultWrite(args?.path, args?.content);

      case 'obsidian_vault_append':
        return this.vaultAppend(args?.path, args?.content);

      case 'obsidian_vault_list':
        return this.vaultList(args?.path || '/');

      case 'obsidian_vault_search':
        return this.vaultSearch(args?.query, args?.limit || 10);

      case 'obsidian_vault_delete':
        return this.vaultDelete(args?.path);

      case 'obsidian_get_active_note':
        return this.getActiveNote();

      case 'obsidian_get_recent_files':
        return this.getRecentFiles(args?.limit || 10);

      case 'obsidian_get_backlinks':
        return this.getBacklinks(args?.path);

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
      if (requestUrl.pathname !== '/mcp') {
        this.respondJson(res, 404, {
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Not found.',
          },
          id: null,
        });
        return;
      }

      if (req.method !== 'POST') {
        this.respondJson(res, 405, {
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Method not allowed.',
          },
          id: null,
        });
        return;
      }

      const parsedBody = await this.parseRequestBody(req);
      if (this.getSettings().debugMode) {
        const rpcMethod =
          parsedBody && typeof parsedBody === 'object' && 'method' in parsedBody
            ? String((parsedBody as { method?: unknown }).method ?? '')
            : '';
        console.log(`[VaultMCP] ${req.method || 'UNKNOWN'} ${requestUrl.pathname}${rpcMethod ? ` method=${rpcMethod}` : ''}`);
      }
      const mcpServer = this.createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      res.on('close', () => {
        void transport.close();
        void mcpServer.close();
      });

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
    } catch (error: any) {
      console.error('[VaultMCP] Request handling failed:', error);
      if (!res.headersSent) {
        this.respondJson(res, 500, {
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error?.message || 'Internal server error',
          },
          id: null,
        });
      }
    }
  }

  private async parseRequestBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];

    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (!chunks.length) {
      return undefined;
    }

    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) {
      return undefined;
    }

    return JSON.parse(raw);
  }

  private respondJson(res: ServerResponse, statusCode: number, body: unknown): void {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  }

  private createMcpServer(): McpServer {
    const server = new McpServer({
      name: 'obsidian-vault',
      version: '0.1.0',
    });

    const registerTool = (name: string, config: any, handler: any) => {
      (server as any).registerTool(name, config, handler);
    };

    registerTool('obsidian_vault_read', {
      description: 'Read the content of a note from the Obsidian vault',
      inputSchema: {
        path: z.string().describe('Path to the note, e.g., "Projects/Idea.md"'),
      },
    }, async ({ path }: any) => this.toMcpToolResult(await this.executeTool('obsidian_vault_read', { path })));

    registerTool('obsidian_vault_write', {
      description: 'Create a new note or overwrite an existing note in the Obsidian vault',
      inputSchema: {
        path: z.string().describe('Path for the note, e.g., "Projects/New-Idea.md"'),
        content: z.string().describe('Markdown content to write'),
      },
    }, async ({ path, content }: any) => this.toMcpToolResult(await this.executeTool('obsidian_vault_write', { path, content })));

    registerTool('obsidian_vault_append', {
      description: 'Append content to the end of an existing note',
      inputSchema: {
        path: z.string().describe('Path to the note'),
        content: z.string().describe('Content to append'),
      },
    }, async ({ path, content }: any) => this.toMcpToolResult(await this.executeTool('obsidian_vault_append', { path, content })));

    registerTool('obsidian_vault_list', {
      description: 'List files and folders in a directory',
      inputSchema: {
        path: z.string().default('/').describe('Folder path (default: vault root)'),
      },
    }, async ({ path }: any) => this.toMcpToolResult(await this.executeTool('obsidian_vault_list', { path })));

    registerTool('obsidian_vault_search', {
      description: 'Search for notes containing specific text',
      inputSchema: {
        query: z.string().describe('Search query text'),
        limit: z.number().int().min(1).max(100).default(10).describe('Maximum number of results'),
      },
    }, async ({ query, limit }: any) => this.toMcpToolResult(await this.executeTool('obsidian_vault_search', { query, limit })));

    registerTool('obsidian_vault_delete', {
      description: 'Delete a note from the vault',
      inputSchema: {
        path: z.string().describe('Path to the note to delete'),
      },
    }, async ({ path }: any) => this.toMcpToolResult(await this.executeTool('obsidian_vault_delete', { path })));

    registerTool('obsidian_get_active_note', {
      description: 'Get the currently open note in Obsidian',
    }, async () => this.toMcpToolResult(await this.executeTool('obsidian_get_active_note', {})));

    registerTool('obsidian_get_recent_files', {
      description: 'Get recently modified notes',
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(10).describe('Number of recent files to return'),
      },
    }, async ({ limit }: any) => this.toMcpToolResult(await this.executeTool('obsidian_get_recent_files', { limit })));

    registerTool('obsidian_get_backlinks', {
      description: 'Get all notes that link to a specific note',
      inputSchema: {
        path: z.string().describe('Path to the note'),
      },
    }, async ({ path }: any) => this.toMcpToolResult(await this.executeTool('obsidian_get_backlinks', { path })));

    return server;
  }

  private toMcpToolResult(result: any): {
    content: Array<{ type: 'text'; text: string }>;
    structuredContent?: Record<string, any>;
    isError?: boolean;
  } {
    const isObject = typeof result === 'object' && result !== null && !Array.isArray(result);
    const isError = Boolean(isObject && (result.success === false || result.error));
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

    const response: {
      content: Array<{ type: 'text'; text: string }>;
      structuredContent?: Record<string, any>;
      isError?: boolean;
    } = {
      content: [{ type: 'text', text }],
    };

    if (isObject) {
      response.structuredContent = result;
    }

    if (isError) {
      response.isError = true;
    }

    return response;
  }

  private async writeConfigFile(): Promise<void> {
    if (!this.port) {
      throw new Error('Vault MCP server has not started yet');
    }

    const configPath = join(tmpdir(), `obsidian-kimi-mcp-${this.configId}.json`);
    const config = {
      mcpServers: {
        obsidian_vault: {
          url: this.getUrl(),
          transport: 'http',
        },
      },
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    this.configPath = configPath;
  }

  private getUrl(): string {
    if (!this.port) {
      throw new Error('Vault MCP server has not started yet');
    }

    return `http://127.0.0.1:${this.port}/mcp`;
  }

  private async vaultRead(path: string): Promise<any> {
    const validation = validateNotePath(path, true);
    if (!validation.allowed) {
      return { success: false, error: validation.reason };
    }

    const file = this.app.vault.getAbstractFileByPath(validation.normalizedPath);
    if (!(file instanceof TFile)) {
      return { success: false, error: `File not found: ${validation.normalizedPath}` };
    }

    const ext = `.${file.extension.toLowerCase()}`;
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return { success: false, error: `File type "${ext}" not allowed` };
    }

    const content = await this.app.vault.read(file);
    return {
      success: true,
      path: validation.normalizedPath,
      content,
      name: file.basename,
    };
  }

  private async vaultWrite(path: string, content: string): Promise<any> {
    const validation = validateNotePath(path, true);
    if (!validation.allowed) {
      return { success: false, error: validation.reason };
    }

    const safePath = validation.normalizedPath;
    const existingFile = this.app.vault.getAbstractFileByPath(safePath);
    const isOverwrite = existingFile instanceof TFile;

    if (isOverwrite && !this.getSettings().allowDestructiveOperations) {
      return {
        success: false,
        error: `Cannot overwrite "${safePath}". Enable "Allow destructive operations" in settings.`,
      };
    }

    const folderPath = safePath.split('/').slice(0, -1).join('/');
    if (folderPath) {
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) {
        await this.app.vault.createFolder(folderPath);
      }
    }

    try {
      if (isOverwrite) {
        await this.app.vault.modify(existingFile, content);
      } else {
        await this.app.vault.create(safePath, content);
      }

      return {
        success: true,
        path: safePath,
        action: isOverwrite ? 'modified' : 'created',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Failed to write note',
      };
    }
  }

  private async vaultAppend(path: string, content: string): Promise<any> {
    const validation = validateNotePath(path, true);
    if (!validation.allowed) {
      return { success: false, error: validation.reason };
    }

    const file = this.app.vault.getAbstractFileByPath(validation.normalizedPath);
    if (!(file instanceof TFile)) {
      return { success: false, error: `File not found: ${validation.normalizedPath}` };
    }

    const existingContent = await this.app.vault.read(file);
    await this.app.vault.modify(file, `${existingContent}\n\n${content}`);
    return { success: true, path: validation.normalizedPath };
  }

  private vaultList(path: string): any {
    if (path !== '/' && path !== '') {
      const validation = validateVaultPath(path);
      if (!validation.allowed) {
        return { success: false, error: validation.reason };
      }

      const target = this.app.vault.getAbstractFileByPath(validation.normalizedPath);
      if (!(target instanceof TFolder)) {
        return { success: false, error: `Folder not found: ${validation.normalizedPath}` };
      }

      return {
        success: true,
        path: validation.normalizedPath,
        items: target.children.map((child) => ({
          name: child.name,
          path: child.path,
          type: child instanceof TFile ? 'file' : 'folder',
        })),
        count: target.children.length,
      };
    }

    const root = this.app.vault.getRoot();
    return {
      success: true,
      path: '/',
      items: root.children.map((child) => ({
        name: child.name,
        path: child.path,
        type: child instanceof TFile ? 'file' : 'folder',
      })),
      count: root.children.length,
    };
  }

  private async vaultSearch(query: string, limit: number): Promise<any> {
    const normalizedQuery = query?.trim().toLowerCase();
    if (!normalizedQuery || normalizedQuery.length < 2) {
      return { success: false, error: 'Query must be at least 2 characters' };
    }

    const files = this.app.vault.getMarkdownFiles().slice(0, this.getSettings().maxSearchFiles);
    const results: Array<{ path: string; name: string; snippet: string }> = [];

    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);
        const lowerContent = content.toLowerCase();
        if (!lowerContent.includes(normalizedQuery)) {
          continue;
        }

        const index = lowerContent.indexOf(normalizedQuery);
        results.push({
          path: file.path,
          name: file.basename,
          snippet: content
            .substring(Math.max(0, index - 50), index + normalizedQuery.length + 50)
            .replace(/\n/g, ' ')
            .trim(),
        });

        if (results.length >= limit) {
          break;
        }
      } catch {
        continue;
      }
    }

    return {
      success: true,
      query,
      results,
      count: results.length,
    };
  }

  private async vaultDelete(path: string): Promise<any> {
    const validation = validateNotePath(path, true);
    if (!validation.allowed) {
      return { success: false, error: validation.reason };
    }

    if (!this.getSettings().allowDestructiveOperations) {
      return {
        success: false,
        error: 'Cannot delete. Enable "Allow destructive operations" in settings.',
      };
    }

    const file = this.app.vault.getAbstractFileByPath(validation.normalizedPath);
    if (!(file instanceof TFile)) {
      return { success: false, error: `File not found: ${validation.normalizedPath}` };
    }

    await this.app.vault.delete(file);
    return { success: true, path: validation.normalizedPath };
  }

  private async getActiveNote(): Promise<any> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      return { success: false, error: 'No active note' };
    }

    const ext = `.${activeFile.extension.toLowerCase()}`;
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return { success: false, error: `File type "${ext}" not allowed` };
    }

    const content = await this.app.vault.read(activeFile);
    return {
      success: true,
      path: activeFile.path,
      name: activeFile.basename,
      content: content.substring(0, this.getSettings().maxActiveNoteLength),
    };
  }

  private getRecentFiles(limit: number): any {
    const files = this.app.vault.getMarkdownFiles()
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, limit)
      .map((file) => ({
        path: file.path,
        name: file.basename,
        mtime: file.stat.mtime,
      }));

    return { success: true, files };
  }

  private async getBacklinks(path: string): Promise<any> {
    const validation = validateNotePath(path, true);
    if (!validation.allowed) {
      return { success: false, error: validation.reason };
    }

    const file = this.app.vault.getAbstractFileByPath(validation.normalizedPath);
    if (!(file instanceof TFile)) {
      return { success: false, error: `File not found: ${validation.normalizedPath}` };
    }

    const resolvedLinks: Record<string, Record<string, number>> =
      (this.app.metadataCache as any).resolvedLinks || {};
    const backlinks: Array<{ path: string; name: string }> = [];

    for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
      if (!targets[file.path]) {
        continue;
      }

      const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
      if (sourceFile instanceof TFile) {
        backlinks.push({
          path: sourceFile.path,
          name: sourceFile.basename,
        });
      }
    }

    return {
      success: true,
      path: validation.normalizedPath,
      backlinks,
      count: backlinks.length,
    };
  }
}
