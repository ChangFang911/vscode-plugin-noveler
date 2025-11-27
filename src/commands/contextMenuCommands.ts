/**
 * 右键菜单命令实现
 */

import * as vscode from 'vscode';
import * as path from 'path';
import matter = require('gray-matter');
import { handleError, ErrorSeverity } from '../utils/errorHandler';
import { sanitizeFileName } from '../utils/inputValidator';
import { NovelerTreeItem } from '../views/novelerViewProvider';
import { COMPLETED_STATUS, IN_PROGRESS_STATUS } from '../constants';
import { handleReadmeAutoUpdate } from '../utils/readmeAutoUpdate';

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
        const content = await vscode.workspace.fs.readFile(item.resourceUri);
        const text = Buffer.from(content).toString('utf8');

        // 解析 Front Matter 获取当前标题
        const parsed = matter(text);
        const currentTitle = parsed.data.title || '未命名';

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

        // 更新 Front Matter 中的标题
        parsed.data.title = newTitle;

        // 同时更新正文中的第一个 # 标题行
        let bodyContent = parsed.content;
        const headingMatch = bodyContent.match(/^#\s+(.+)$/m);
        if (headingMatch) {
            // 找到第一个 # 标题，替换为新标题
            bodyContent = bodyContent.replace(/^#\s+.+$/m, `# ${newTitle}`);
        }

        const newContent = matter.stringify(bodyContent, parsed.data);

        // 生成新的文件名（保留编号前缀，更新名称部分）
        const oldFileName = path.basename(item.resourceUri.fsPath);
        const fileNumberMatch = oldFileName.match(/^(\d+-)/); // 提取 "02-" 这样的前缀

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

        // 写入新文件
        await vscode.workspace.fs.writeFile(newFileUri, Buffer.from(newContent, 'utf8'));

        // 如果文件名改变了，删除旧文件
        if (item.resourceUri.fsPath !== newFileUri.fsPath) {
            await vscode.workspace.fs.delete(item.resourceUri);
        }

        vscode.window.showInformationMessage(`章节已重命名为：${newTitle}`);
        vscode.commands.executeCommand('noveler.refreshView');

        // 根据配置自动更新 README
        await handleReadmeAutoUpdate();
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
 * 更新章节状态的通用方法
 */
async function updateChapterStatus(item: NovelerTreeItem, status: string): Promise<void> {
    if (!item.resourceUri) {
        vscode.window.showErrorMessage('无法获取章节文件路径');
        return;
    }

    try {
        // 读取当前文件内容
        const content = await vscode.workspace.fs.readFile(item.resourceUri);
        const text = Buffer.from(content).toString('utf8');

        // 解析并更新 Front Matter
        const parsed = matter(text);
        parsed.data.status = status;
        const newContent = matter.stringify(parsed.content, parsed.data);

        // 写回文件
        await vscode.workspace.fs.writeFile(item.resourceUri, Buffer.from(newContent, 'utf8'));

        vscode.window.showInformationMessage(`章节状态已更新为：${status}`);
        vscode.commands.executeCommand('noveler.refreshView');

        // 根据配置自动更新 README
        await handleReadmeAutoUpdate();
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
        vscode.commands.executeCommand('noveler.refreshView');

        // 根据配置自动更新 README
        await handleReadmeAutoUpdate();
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
        const content = await vscode.workspace.fs.readFile(item.resourceUri);
        const text = Buffer.from(content).toString('utf8');

        // 解析 Front Matter 获取当前名称
        const parsed = matter(text);
        const currentName = parsed.data.name || '未命名';

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

        // 更新 Front Matter 中的名称
        parsed.data.name = newName;
        const newContent = matter.stringify(parsed.content, parsed.data);

        // 生成新文件路径
        const oldPath = item.resourceUri;
        const dir = path.dirname(oldPath.fsPath);
        const newPath = vscode.Uri.file(path.join(dir, `${sanitizedName}.md`));

        // 写入新文件
        await vscode.workspace.fs.writeFile(newPath, Buffer.from(newContent, 'utf8'));

        // 如果文件路径改变，删除旧文件
        if (oldPath.fsPath !== newPath.fsPath) {
            await vscode.workspace.fs.delete(oldPath);
        }

        vscode.window.showInformationMessage(`人物名称已更新为：${newName}`);
        vscode.commands.executeCommand('noveler.refreshView');

        // 根据配置自动更新 README
        await handleReadmeAutoUpdate();
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
        vscode.commands.executeCommand('noveler.refreshView');

        // 根据配置自动更新 README
        await handleReadmeAutoUpdate();
    } catch (error) {
        handleError('删除人物失败', error, ErrorSeverity.Error);
    }
}
