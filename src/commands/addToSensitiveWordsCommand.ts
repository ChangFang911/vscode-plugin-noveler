/**
 * 添加选中文本到自定义敏感词库
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as jsonc from 'jsonc-parser';
import { CustomWordLibrary } from '../types/sensitiveWord';

/**
 * 添加选中文本到自定义敏感词库
 */
export async function addToCustomWords(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('请先选中要添加的文本');
        return;
    }

    const selection = editor.document.getText(editor.selection);
    if (!selection || selection.trim() === '') {
        vscode.window.showWarningMessage('请先选中要添加的文本');
        return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('请先打开一个 Noveler 项目');
        return;
    }

    try {
        const customWordsPath = path.join(
            workspaceFolder.uri.fsPath,
            '.noveler',
            'sensitive-words',
            'custom-words.jsonc'
        );

        // 读取现有配置
        let content = '';
        let library: CustomWordLibrary;

        if (fs.existsSync(customWordsPath)) {
            content = fs.readFileSync(customWordsPath, 'utf-8');
            library = jsonc.parse(content) as CustomWordLibrary;
        } else {
            // 文件不存在，创建新的
            library = {
                description: '我的自定义敏感词库',
                words: []
            };
        }

        // 检查是否已存在
        if (library.words.includes(selection)) {
            vscode.window.showInformationMessage(`"${selection}" 已在自定义敏感词库中`);
            return;
        }

        // 添加新词
        library.words.push(selection);

        // 使用 jsonc-parser 保留注释地更新文件
        const edits = jsonc.modify(content, ['words'], library.words, {});
        const updatedContent = jsonc.applyEdits(content, edits);

        // 保存文件
        fs.writeFileSync(customWordsPath, updatedContent, 'utf-8');

        vscode.window.showInformationMessage(`✅ 已将 "${selection}" 添加到自定义敏感词库`);

        // 重新加载敏感词服务
        vscode.commands.executeCommand('noveler.reloadSensitiveWords');
    } catch (error) {
        console.error('[Noveler] 添加到自定义敏感词库失败', error);
        vscode.window.showErrorMessage('添加到自定义敏感词库失败');
    }
}

/**
 * 添加选中文本到白名单
 */
export async function addToWhitelist(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('请先选中要添加的文本');
        return;
    }

    const selection = editor.document.getText(editor.selection);
    if (!selection || selection.trim() === '') {
        vscode.window.showWarningMessage('请先选中要添加的文本');
        return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('请先打开一个 Noveler 项目');
        return;
    }

    try {
        const whitelistPath = path.join(
            workspaceFolder.uri.fsPath,
            '.noveler',
            'sensitive-words',
            'whitelist.jsonc'
        );

        // 读取现有配置
        let content = '';
        let library: CustomWordLibrary;

        if (fs.existsSync(whitelistPath)) {
            content = fs.readFileSync(whitelistPath, 'utf-8');
            library = jsonc.parse(content) as CustomWordLibrary;
        } else {
            // 文件不存在，创建新的
            library = {
                description: '我的白名单（排除误报）',
                words: []
            };
        }

        // 检查是否已存在
        if (library.words.includes(selection)) {
            vscode.window.showInformationMessage(`"${selection}" 已在白名单中`);
            return;
        }

        // 添加新词
        library.words.push(selection);

        // 使用 jsonc-parser 保留注释地更新文件
        const edits = jsonc.modify(content, ['words'], library.words, {});
        const updatedContent = jsonc.applyEdits(content, edits);

        // 保存文件
        fs.writeFileSync(whitelistPath, updatedContent, 'utf-8');

        vscode.window.showInformationMessage(`✅ 已将 "${selection}" 添加到白名单`);

        // 重新加载敏感词服务
        vscode.commands.executeCommand('noveler.reloadSensitiveWords');
    } catch (error) {
        console.error('[Noveler] 添加到白名单失败', error);
        vscode.window.showErrorMessage('添加到白名单失败');
    }
}
