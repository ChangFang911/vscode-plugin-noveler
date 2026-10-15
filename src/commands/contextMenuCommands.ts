/**
 * 右键菜单命令实现
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { parseFrontMatter } from '../utils/frontMatterParser';
import { handleError, ErrorSeverity } from '../utils/errorHandler';
import { sanitizeFileName } from '../utils/inputValidator';
import { NovelerTreeItem } from '../views/novelerViewProvider';
import { COMPLETED_STATUS, IN_PROGRESS_STATUS, CHARACTERS_FOLDER, CHARACTER_IMPORTANCE_OPTIONS } from '../constants';
import { applyDocumentChange, patchFrontMatter, documentIO } from '../utils/documentOperations';

/**
 * 重命名章节
 * 只修改 Front Matter 中的 title，保留文件名中的章节编号
 */
export async function renameChapter(item: NovelerTreeItem): Promise<void> {
    if (!item.resourceUri) {
        vscode.window.showErrorMessage('无法获取章节文件路径');
        return;
    }

    try {
        // 读取当前文件内容
        const document = await vscode.workspace.openTextDocument(item.resourceUri);
        const text = document.getText();

        // 解析 Front Matter 获取当前标题
        const parsed = parseFrontMatter(text);
        const data = parsed.data as Record<string, unknown>;
        const currentTitle = (data.title as string) || '未命名';

        // 尝试从标题中提取"第X章"前缀和章节名称
        const chapterPrefixMatch = currentTitle.match(/^(第.+?章)\s+(.+)$/);
        let chapterPrefix = '';
        let chapterNameOnly = currentTitle;

        if (chapterPrefixMatch) {
            chapterPrefix = chapterPrefixMatch[1];  // 例如："第二章"
            chapterNameOnly = chapterPrefixMatch[2]; // 例如："测试"
        }

        // 询问新标题（默认只显示章节名称部分，不包含"第X章"）
        const newChapterName = await vscode.window.showInputBox({
            prompt: chapterPrefix
                ? `请输入新的章节标题（将保留"${chapterPrefix}"前缀）`
                : '请输入新的章节标题（文件名中的章节编号将保留）',
            value: chapterNameOnly,
            placeHolder: '例如：陨落的天才'
        });

        if (!newChapterName) {
            return;
        }

        // 构建完整的新标题
        const newTitle = chapterPrefix ? `${chapterPrefix} ${newChapterName}` : newChapterName;

        if (newTitle === currentTitle) {
            return;
        }

        // 生成新的文件名（保留编号前缀，更新名称部分）
        const oldFileName = path.basename(item.resourceUri.fsPath);
        const fileNumberMatch = oldFileName.match(/^((?:第.+?章|\d+)-)/); // 提取 "02-" 这样的前缀

        let newFileName: string;
        if (fileNumberMatch) {
            // 有编号前缀，保留编号，更新名称
            const numberPrefix = fileNumberMatch[1]; // 例如 "02-"
            const sanitizedName = sanitizeFileName(newChapterName);
            newFileName = `${numberPrefix}${sanitizedName}.md`;
        } else {
            // 没有编号前缀，直接使用新名称
            const sanitizedName = sanitizeFileName(newChapterName);
            newFileName = `${sanitizedName}.md`;
        }

        const dir = path.dirname(item.resourceUri.fsPath);
        const newFileUri = vscode.Uri.file(path.join(dir, newFileName));

        await applyDocumentChange(item.resourceUri, latest => {
            const updated = patchFrontMatter(latest, { title: newTitle });
            const boundary = /^(?:\uFEFF)?---[^\S\r\n]*\r?\n[\s\S]*?^---[^\S\r\n]*(?:\r?\n|$)/m.exec(updated);
            const offset = boundary?.[0].length ?? 0;
            return updated.slice(0, offset) + updated.slice(offset).replace(/^#[^\S\r\n]+[^\r\n]+/m, () => `# ${newTitle}`);
        }, newFileUri);

        vscode.window.showInformationMessage(`章节已重命名为：${newTitle}`);
        await vscode.commands.executeCommand('noveler.refresh');
    } catch (error) {
        handleError('重命名章节失败', error, ErrorSeverity.Error);
    }
}

/**
 * 标记章节为完成
 */
export async function markChapterCompleted(item: NovelerTreeItem): Promise<void> {
    await updateChapterStatus(item, COMPLETED_STATUS);
}

/**
 * 标记章节为进行中
 */
export async function markChapterInProgress(item: NovelerTreeItem): Promise<void> {
    await updateChapterStatus(item, IN_PROGRESS_STATUS);
}

/**
 * 更新章节状态（通过对话框选择）
 * 用于右键菜单和 CodeLens 点击状态时调用
 * @param itemOrUri 可以是 NovelerTreeItem（右键菜单）或 vscode.Uri（CodeLens）
 */
export async function updateChapterStatusWithDialog(itemOrUri: NovelerTreeItem | vscode.Uri): Promise<void> {
    // 兼容两种调用方式
    const fileUri = itemOrUri instanceof vscode.Uri
        ? itemOrUri
        : (itemOrUri as NovelerTreeItem).resourceUri;

    if (!fileUri) {
        vscode.window.showWarningMessage('无法获取章节文件路径');
        return;
    }

    const statusOptions = [
        { label: '📝 草稿', value: '草稿' },
        { label: '✏️ 初稿', value: '初稿' },
        { label: '🔧 修改中', value: '修改中' },
        { label: '✅ 已完成', value: '已完成' },
    ];

    const selected = await vscode.window.showQuickPick(statusOptions, {
        placeHolder: '选择章节状态',
        title: '更新章节状态'
    });

    if (!selected) {
        return;
    }

    try {
        await applyDocumentChange(fileUri, text => patchFrontMatter(text, { status: selected.value }));

        vscode.window.showInformationMessage(`章节状态已更新为：${selected.value}`);
        await vscode.commands.executeCommand('noveler.refresh');
    } catch (error) {
        handleError('更新章节状态失败', error, ErrorSeverity.Error);
    }
}

/**
 * 更新章节状态的通用方法
 */
async function updateChapterStatus(item: NovelerTreeItem, status: string): Promise<void> {
    if (!item.resourceUri) {
        vscode.window.showErrorMessage('无法获取章节文件路径');
        return;
    }

    try {
        await applyDocumentChange(item.resourceUri, text => patchFrontMatter(text, { status }));

        vscode.window.showInformationMessage(`章节状态已更新为：${status}`);
        await vscode.commands.executeCommand('noveler.refresh');
    } catch (error) {
        handleError('更新章节状态失败', error, ErrorSeverity.Error);
    }
}

/**
 * 删除章节
 */
export async function deleteChapter(item: NovelerTreeItem): Promise<void> {
    if (!item.resourceUri) {
        vscode.window.showErrorMessage('无法获取章节文件路径');
        return;
    }

    try {
        const fileName = path.basename(item.resourceUri.fsPath);

        // 确认删除
        const result = await vscode.window.showWarningMessage(
            `确定要删除章节 "${fileName}" 吗？此操作不可恢复！`,
            { modal: true },
            '删除', '取消'
        );

        if (result !== '删除') {
            return;
        }

        // 删除文件
        await vscode.workspace.fs.delete(item.resourceUri);

        vscode.window.showInformationMessage(`已删除章节：${fileName}`);
        await vscode.commands.executeCommand('noveler.refresh');
    } catch (error) {
        handleError('删除章节失败', error, ErrorSeverity.Error);
    }
}

/**
 * 重命名人物
 */
export async function renameCharacter(item: NovelerTreeItem): Promise<void> {
    if (!item.resourceUri) {
        vscode.window.showErrorMessage('无法获取人物文件路径');
        return;
    }

    try {
        // 读取当前文件内容
        const document = await vscode.workspace.openTextDocument(item.resourceUri);
        const text = document.getText();

        // 解析 Front Matter 获取当前名称
        const parsed = parseFrontMatter(text);
        const data = parsed.data as Record<string, unknown>;
        const currentName = (data.name as string) || '未命名';

        // 询问新名称
        const newName = await vscode.window.showInputBox({
            prompt: '请输入新的人物名称',
            value: currentName,
            placeHolder: '例如：萧炎'
        });

        if (!newName || newName === currentName) {
            return;
        }

        const sanitizedName = sanitizeFileName(newName);
        if (sanitizedName === '未命名') {
            vscode.window.showErrorMessage('人物名称包含非法字符');
            return;
        }

        // 生成新文件路径
        const oldPath = item.resourceUri;
        const dir = path.dirname(oldPath.fsPath);
        const newPath = vscode.Uri.file(path.join(dir, `${sanitizedName}.md`));

        await applyDocumentChange(oldPath, text => patchFrontMatter(text, { name: newName }), newPath);

        vscode.window.showInformationMessage(`人物名称已更新为：${newName}`);
        await vscode.commands.executeCommand('noveler.refresh');
    } catch (error) {
        handleError('重命名人物失败', error, ErrorSeverity.Error);
    }
}

/**
 * 删除人物
 */
export async function deleteCharacter(item: NovelerTreeItem): Promise<void> {
    if (!item.resourceUri) {
        vscode.window.showErrorMessage('无法获取人物文件路径');
        return;
    }

    try {
        const fileName = path.basename(item.resourceUri.fsPath);

        // 确认删除
        const result = await vscode.window.showWarningMessage(
            `确定要删除人物 "${fileName}" 吗？此操作不可恢复！`,
            { modal: true },
            '删除', '取消'
        );

        if (result !== '删除') {
            return;
        }

        // 删除文件
        await vscode.workspace.fs.delete(item.resourceUri);

        vscode.window.showInformationMessage(`已删除人物：${fileName}`);
        await vscode.commands.executeCommand('noveler.refresh');
    } catch (error) {
        handleError('删除人物失败', error, ErrorSeverity.Error);
    }
}

export async function setCharacterImportance(
    target?: vscode.Uri | { resourceUri?: vscode.Uri },
    onChanged?: () => void
): Promise<void> {
    const uri = target instanceof vscode.Uri ? target : target ? target.resourceUri : vscode.window.activeTextEditor?.document.uri;
    const folder = documentIO.workspaceFolder();
    const prefix = folder && vscode.Uri.joinPath(folder.uri, CHARACTERS_FOLDER).toString() + '/';
    if (!uri || !prefix || !uri.toString().startsWith(prefix) || !uri.path.endsWith('.md')) {
        vscode.window.showWarningMessage('请从人物档案或侧边栏人物菜单设置定位');
        return;
    }
    try {
        const document = await vscode.workspace.openTextDocument(uri);
        const original = parseFrontMatter(document.getText()).data.importance;
        const selected = await vscode.window.showQuickPick(CHARACTER_IMPORTANCE_OPTIONS.map(value => ({
            label: value, value, picked: value === original
        })), { title: '设置人物定位', placeHolder: `当前：${typeof original === 'string' && original.trim() ? original : '未设置'}` });
        if (!selected || selected.value === original) { return; }
        let before = '';
        let after = '';
        await applyDocumentChange(uri, text => {
            if (JSON.stringify(parseFrontMatter(text).data.importance) !== JSON.stringify(original)) {
                throw new Error('人物定位已变化，请重新选择');
            }
            before = text;
            after = patchFrontMatter(text, { importance: selected.value });
            return after;
        });
        const version = document.version;
        onChanged?.();
        const name = String(parseFrontMatter(before).data.name ?? path.basename(uri.fsPath, '.md'));
        const action = await vscode.window.showInformationMessage(`“${name}”的定位已设为${selected.value}`, '撤销');
        if (action === '撤销') {
            try {
                await applyDocumentChange(uri, text => {
                    if (document.isClosed || document.version !== version || text !== after) {
                        throw new Error('人物档案已有新修改，未覆盖；可通过“编辑 → 撤销”逐步恢复');
                    }
                    return before;
                });
                onChanged?.();
            } catch (error) {
                handleError('撤销人物定位失败', error, ErrorSeverity.Warning);
            }
        }
    } catch (error) {
        handleError('设置人物定位失败', error, ErrorSeverity.Error);
    }
}
