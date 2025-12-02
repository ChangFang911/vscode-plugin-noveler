/**
 * 模板加载工具
 */

import * as vscode from 'vscode';
import { Templates } from '../types/templates';
import { handleError, ErrorSeverity } from './errorHandler';

let cachedTemplates: Templates | null = null;
let extensionContext: vscode.ExtensionContext | null = null;

/**
 * 初始化模板加载器
 */
export function initTemplateLoader(context: vscode.ExtensionContext): void {
    extensionContext = context;
}

/**
 * 加载单个模板文件
 * @param filename 模板文件名
 * @returns 模板文件内容
 */
async function loadTemplateFile(filename: string): Promise<string> {
    if (!extensionContext) {
        throw new Error('Extension context not set');
    }

    const filePath = vscode.Uri.joinPath(
        extensionContext.extensionUri,
        'templates',
        filename
    );
    const fileData = await vscode.workspace.fs.readFile(filePath);
    return Buffer.from(fileData).toString('utf8');
}

/**
 * 加载模板配置
 * @returns 模板配置对象，失败返回 null
 */
export async function loadTemplates(): Promise<Templates | null> {
    // 如果已经缓存，直接返回
    if (cachedTemplates) {
        return cachedTemplates;
    }

    if (!extensionContext) {
        handleError('TemplateLoader 未初始化', new Error('Extension context not set'), ErrorSeverity.Error);
        return null;
    }

    try {
        // 读取 JSON 配置文件（包含 frontMatter 和 options）
        const configPath = vscode.Uri.joinPath(
            extensionContext.extensionUri,
            'templates',
            'default-templates.json'
        );
        const configData = await vscode.workspace.fs.readFile(configPath);
        const configText = Buffer.from(configData).toString('utf8');
        const config = JSON.parse(configText);

        // 读取独立的 Markdown 模板文件
        const chapterContent = await loadTemplateFile('chapter.md');
        const characterContent = await loadTemplateFile('character.md');
        const outlineContent = await loadTemplateFile('outline.md');
        const readmeContent = await loadTemplateFile('readme.md');
        const referenceContent = await loadTemplateFile('reference.md');

        // 合并配置和内容
        const templates: Templates = {
            chapter: {
                ...config.chapter,
                content: chapterContent
            },
            character: {
                ...config.character,
                content: characterContent
            },
            outline: {
                content: outlineContent
            },
            readme: {
                content: readmeContent
            },
            reference: {
                content: referenceContent
            }
        };

        // 验证模板结构
        if (!validateTemplates(templates)) {
            throw new Error('模板配置格式无效');
        }

        cachedTemplates = templates;
        return templates;
    } catch (error) {
        handleError('无法读取模板配置文件', error);
        return null;
    }
}

/**
 * 验证模板配置结构
 * @param templates 待验证的模板对象
 * @returns 是否为有效的 Templates 类型
 */
function validateTemplates(templates: unknown): templates is Templates {
    if (!templates || typeof templates !== 'object') {
        return false;
    }

    const t = templates as Record<string, unknown>;

    return !!(
        t.chapter &&
        t.character &&
        t.outline &&
        t.readme &&
        t.reference
    );
}

/**
 * 清除模板缓存（用于重新加载）
 */
export function clearTemplateCache(): void {
    cachedTemplates = null;
}
