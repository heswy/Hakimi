import { TFile } from 'obsidian';

/**
 * Vault 操作安全工具
 * 用于验证路径合法性、防止误操作
 */

// 敏感路径模式 - 默认禁止操作这些路径
const SENSITIVE_PATTERNS = [
  /^\.obsidian($|\/)/,        // Obsidian 配置目录
  /^\.git($|\/)/,             // Git 目录
  /^\.hakimi($|\/)/,            // Hakimi 配置
  /^node_modules($|\/)/,      // Node modules
  /\/\./,                     // 任何路径段以 . 开头 (如 folder/.secret)
  /^\./,                      // 文件/目录名以 . 开头 (如 .secret.md)
];

// 危险的文件扩展名
const DANGEROUS_EXTENSIONS = [
  '.js', '.ts', '.json', '.exe', '.dll', '.so', '.dylib',
  '.sh', '.bat', '.cmd', '.ps1', '.py', '.rb', '.pl'
];

// 允许的文件扩展名（用于 Vault 工具）
export const ALLOWED_EXTENSIONS = ['.md', '.txt', '.markdown'];

export interface PathValidationResult {
  allowed: boolean;
  reason?: string;
  normalizedPath: string;
}

/**
 * 验证路径是否允许操作
 */
export function validateVaultPath(path: string): PathValidationResult {
  // 标准化路径
  let normalized = path.replace(/\\/g, '/');
  
  // 移除开头的 /
  normalized = normalized.replace(/^\//, '');
  
  // 检查路径遍历攻击
  if (normalized.includes('..')) {
    return {
      allowed: false,
      reason: 'Path traversal detected (contains "..")',
      normalizedPath: normalized
    };
  }
  
  // 检查绝对路径
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return {
      allowed: false,
      reason: 'Absolute paths are not allowed',
      normalizedPath: normalized
    };
  }
  
  // 检查敏感路径
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        allowed: false,
        reason: `Access to sensitive path pattern "${pattern.source}" is not allowed`,
        normalizedPath: normalized
      };
    }
  }
  
  return {
    allowed: true,
    normalizedPath: normalized
  };
}

/**
 * 验证文件扩展名是否安全
 */
export function validateFileExtension(path: string): PathValidationResult {
  const ext = path.toLowerCase().substring(path.lastIndexOf('.'));
  
  // 检查是否是允许的类型
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      allowed: false,
      reason: `File extension "${ext}" is not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
      normalizedPath: path
    };
  }
  
  return {
    allowed: true,
    normalizedPath: path
  };
}

/**
 * 验证是否为安全的笔记操作路径
 */
export function validateNotePath(path: string, requireMarkdown = true): PathValidationResult {
  // 首先进行基础路径验证
  const pathValidation = validateVaultPath(path);
  if (!pathValidation.allowed) {
    return pathValidation;
  }
  
  const normalized = pathValidation.normalizedPath;
  
  // 如果要求 Markdown，验证扩展名
  if (requireMarkdown && !normalized.endsWith('.md')) {
    // 自动添加 .md 扩展名
    if (!normalized.includes('.')) {
      return {
        allowed: true,
        normalizedPath: normalized + '.md'
      };
    }
    
    const extValidation = validateFileExtension(normalized);
    if (!extValidation.allowed) {
      return extValidation;
    }
  }
  
  return {
    allowed: true,
    normalizedPath: normalized
  };
}

/**
 * 检查操作是否需要确认
 */
export function isHighRiskOperation(operation: string, path: string): boolean {
  // 删除操作总是高风险
  if (operation === 'delete') {
    return true;
  }
  
  // 覆盖已有文件
  if (operation === 'overwrite') {
    return true;
  }
  
  // 写入非 Markdown 文件
  if (operation === 'write' && !path.endsWith('.md')) {
    return true;
  }
  
  return false;
}

/**
 * 生成确认消息
 */
export function getConfirmationMessage(operation: string, path: string, isOverwrite = false): string {
  const actionMap: Record<string, string> = {
    'delete': 'delete',
    'write': isOverwrite ? 'overwrite' : 'create',
    'append': 'modify',
    'overwrite': 'overwrite'
  };
  
  const action = actionMap[operation] || operation;
  
  if (isOverwrite) {
    return `Confirm ${action}: "${path}" already exists and will be overwritten.\n\nThis action cannot be undone.`;
  }
  
  if (operation === 'delete') {
    return `Confirm deletion: "${path}"\n\nThis action cannot be undone.`;
  }
  
  return `Confirm ${action}: "${path}"?`;
}

/**
 * 确保路径有 .md 扩展名
 */
export function ensureMarkdownExtension(path: string): string {
  if (!path.includes('.')) {
    return path + '.md';
  }
  
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return path + '.md';
  }
  
  return path;
}
