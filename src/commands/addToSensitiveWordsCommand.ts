import * as vscode from 'vscode';
import { parse, ParseError, modify, applyEdits } from 'jsonc-parser';
import { SensitiveWordService } from '../services/sensitiveWordService';
import { applyDocumentChange, createDocument, documentIO, fileExists } from '../utils/documentOperations';
import { handleError, ErrorSeverity } from '../utils/errorHandler';

export async function addToCustomWords(): Promise<void> {
    await addWordToLibrary(undefined, false);
}

export async function addToWhitelist(word?: string): Promise<void> {
    await addWordToLibrary(word, true);
}

async function addWordToLibrary(word: string | undefined, whitelist: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const selection = typeof word === 'string' ? word : editor?.document.getText(editor.selection);
    if (!selection?.trim()) {
        vscode.window.showWarningMessage('请先选中要添加的文本');
        return;
    }
    const workspaceFolder = documentIO.workspaceFolder();
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('请先打开一个 Noveler 项目');
        return;
    }
    const label = whitelist ? '白名单' : '自定义敏感词库';
    try {
        const config = SensitiveWordService.getInstance().getConfig();
        const configuredPath = (whitelist ? config.whitelist?.path : config.customLibrary?.path)
            || `.noveler/sensitive-words/${whitelist ? 'whitelist' : 'custom-words'}.jsonc`;
        let uri = vscode.Uri.joinPath(workspaceFolder.uri, configuredPath);
        if (!await fileExists(uri)) {
            const fallbackPath = configuredPath.endsWith('.jsonc') ? configuredPath.replace(/\.jsonc$/, '.json')
                : configuredPath.endsWith('.json') ? configuredPath.replace(/\.json$/, '.jsonc') : undefined;
            if (fallbackPath) {
                const fallback = vscode.Uri.joinPath(workspaceFolder.uri, fallbackPath);
                if (await fileExists(fallback)) { uri = fallback; }
            }
        }
        if (!await fileExists(uri)) {
            await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
            await createDocument(uri, '{\n  "words": []\n}');
        }
        let added = false;
        await applyDocumentChange(uri, text => {
            const errors: ParseError[] = [];
            const library = parse(text, errors, { allowTrailingComma: true });
            if (errors.length || !library || typeof library !== 'object' || Array.isArray(library)
                || !Array.isArray(library.words) || library.words.some((value: unknown) => typeof value !== 'string')) {
                throw new Error(`${label}格式无效，原文件未修改`);
            }
            if (library.words.includes(selection)) { return text; }
            added = true;
            return applyEdits(text, modify(text, ['words', library.words.length], selection, {
                formattingOptions: { tabSize: 2, insertSpaces: true, eol: text.includes('\r\n') ? '\r\n' : '\n' }
            }));
        });
        const document = await vscode.workspace.openTextDocument(uri);
        if (!await documentIO.save(document) || document.isDirty) {
            throw new Error(`${label}未保存，请检查编辑器内容`);
        }
        await vscode.commands.executeCommand('noveler.reloadSensitiveWords');
        vscode.window.showInformationMessage(added ? `已将 "${selection}" 添加到${label}` : `"${selection}" 已在${label}中`);
    } catch (error) {
        handleError(`添加到${label}失败`, error, ErrorSeverity.Error);
    }
}
