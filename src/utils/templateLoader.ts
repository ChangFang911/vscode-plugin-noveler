/**
 * 模板加载工具
 */

import * as vscode from 'vscode';
import { Templates } from '../types/templates';

let cachedTemplates: Templates | null = null;
let extensionContext: vscode.ExtensionContext | null = null;

/**
 * 初始化模板加载器
 */
export function initTemplateLoader(context: vscode.ExtensionContext): void {
    extensionContext = context;
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
        console.error('Noveler: TemplateLoader 未初始化');
        return null;
    }

    try {
        const templatePath = vscode.Uri.joinPath(
            extensionContext.extensionUri,
            'templates',
            'default-templates.json'
        );
        const templateData = await vscode.workspace.fs.readFile(templatePath);
        const templateText = Buffer.from(templateData).toString('utf8');
        const templates = JSON.parse(templateText) as Templates;

        // 验证模板结构
        if (!validateTemplates(templates)) {
            throw new Error('模板配置格式无效');
        }

        cachedTemplates = templates;
        return templates;
    } catch (error) {
        console.error('Noveler: 无法读取模板配置文件', error);
        vscode.window.showErrorMessage(`Noveler: 无法加载模板配置 - ${error}`);
        return null;
    }
}

/**
 * 验证模板配置结构
 */
function validateTemplates(templates: any): templates is Templates {
    return (
        templates &&
        typeof templates === 'object' &&
        templates.chapter &&
        templates.character &&
        templates.outline &&
        templates.readme
    );
}

/**
 * 清除模板缓存（用于重新加载）
 */
export function clearTemplateCache(): void {
    cachedTemplates = null;
}
