import * as vscode from 'vscode';
import { NameGeneratorService } from '../services/nameGeneratorService';
import { handleError, ErrorSeverity } from '../utils/errorHandler';
import { createCharacter } from './createCharacter';

/**
 * 姓名风格选项
 */
interface NameStyleOption extends vscode.QuickPickItem {
    id: string;
}

/**
 * 随机起名命令
 * 显示风格选择菜单，生成姓名，支持"再来一组"
 */
export async function generateRandomName(): Promise<void> {
    try {
        const nameGenerator = NameGeneratorService.getInstance();

        // 步骤1: 选择风格
        const styleOptions: NameStyleOption[] = [
            {
                id: 'chinese-modern',
                label: '$(symbol-misc) 中文姓名（现代）',
                description: '现代常见姓名',
                detail: '例如：李浩然、王雨萱'
            },
            {
                id: 'chinese-classic',
                label: '$(book) 中文姓名（古典）',
                description: '诗意雅致姓名',
                detail: '例如：司马青云、欧阳明月'
            },
            {
                id: 'chinese-fantasy',
                label: '$(wand) 中文姓名（玄幻）',
                description: '武侠仙侠风格',
                detail: '例如：独孤天辰、慕容星影'
            },
            {
                id: 'english',
                label: '$(globe) 英文姓名',
                description: '真实英文姓名',
                detail: '例如：John Smith、Jane Doe'
            },
            {
                id: 'japanese',
                label: '$(ruby) 日文姓名',
                description: '常见日本姓名',
                detail: '例如：佐藤健、山田美咲'
            },
            {
                id: 'western-fantasy',
                label: '$(shield) 西幻姓名',
                description: '西方奇幻翻译风格',
                detail: '例如：阿拉贡·刚铎、凯兰崔尔·洛丝萝林'
            },
            {
                id: 'fantasy',
                label: '$(sparkle) 虚构姓名',
                description: '音节组合生成',
                detail: '例如：Kaelor、Thranis'
            }
        ];

        const selectedStyle = await vscode.window.showQuickPick(styleOptions, {
            placeHolder: '请选择姓名风格',
            title: '随机起名'
        });

        if (!selectedStyle) {
            return; // 用户取消
        }

        // 步骤2: 显示生成结果，支持"再来一组"
        await showNameResults(nameGenerator, selectedStyle.id);

    } catch (error) {
        handleError('随机起名失败', error, ErrorSeverity.Error);
    }
}

/**
 * 显示姓名生成结果
 * 支持"再来一组"功能
 */
async function showNameResults(
    nameGenerator: NameGeneratorService,
    styleId: string
): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        // 生成姓名
        const names = await generateNamesByStyle(nameGenerator, styleId);

        // 创建 QuickPick 选项
        interface NameQuickPickItem extends vscode.QuickPickItem {
            isAction?: boolean;
        }

        const items: NameQuickPickItem[] = names.map(name => ({
            label: `$(person) ${name}`,
            description: '点击选择操作'
        }));

        // 添加"再来一组"按钮
        items.push({
            label: '$(refresh) 再来一组',
            description: '生成新的姓名',
            isAction: true
        });

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择一个姓名进行操作，或点击"再来一组"',
            title: '随机起名 - 生成结果'
        });

        if (!selected) {
            return; // 用户取消
        }

        // 如果是"再来一组"，继续循环
        if (selected.isAction) {
            continue;
        }

        // 提取姓名（去掉图标）
        const nameMatch = selected.label.match(/\$\(person\)\s+(.+)/);
        if (!nameMatch) {
            return;
        }

        const name = nameMatch[1];

        // 显示操作选择菜单
        const shouldContinue = await showActionMenu(name);
        if (!shouldContinue) {
            return;
        }
    }
}

/**
 * 显示操作选择菜单
 * @param name 选中的姓名
 * @returns true 表示返回重新选择，false 表示结束
 */
async function showActionMenu(name: string): Promise<boolean> {
    interface ActionQuickPickItem extends vscode.QuickPickItem {
        actionType: 'create' | 'copy' | 'insert' | 'back';
    }

    const actionItems: ActionQuickPickItem[] = [
        {
            label: '$(file-add) 创建人物文件',
            description: '在人物目录创建该人物的文件',
            actionType: 'create'
        },
        {
            label: '$(clippy) 复制到剪贴板',
            description: '将姓名复制到剪贴板',
            actionType: 'copy'
        },
        {
            label: '$(edit) 插入到光标位置',
            description: '在当前编辑器光标处插入姓名',
            actionType: 'insert'
        },
        {
            label: '$(arrow-left) 返回重新选择',
            description: '回到姓名列表',
            actionType: 'back'
        }
    ];

    const selectedAction = await vscode.window.showQuickPick(actionItems, {
        placeHolder: `你选择了："${name}"，请选择操作`,
        title: '随机起名 - 操作选择'
    });

    if (!selectedAction) {
        return false; // 用户取消
    }

    switch (selectedAction.actionType) {
        case 'create':
            await createCharacter(name);
            return false;

        case 'copy':
            await vscode.env.clipboard.writeText(name);
            vscode.window.showInformationMessage(`已复制: ${name}`);
            return false;

        case 'insert': {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                await editor.edit(editBuilder => {
                    editBuilder.insert(editor.selection.active, name);
                });
                vscode.window.showInformationMessage(`已插入: ${name}`);
            } else {
                vscode.window.showWarningMessage('没有打开的编辑器');
            }
            return false;
        }

        case 'back':
            return true; // 返回重新选择
    }
}

/**
 * 根据风格生成姓名
 */
async function generateNamesByStyle(
    nameGenerator: NameGeneratorService,
    styleId: string
): Promise<string[]> {
    switch (styleId) {
        case 'chinese-modern':
            return await nameGenerator.generateChineseName('modern', 10);

        case 'chinese-classic':
            return await nameGenerator.generateChineseName('classic', 10);

        case 'chinese-fantasy':
            return await nameGenerator.generateChineseName('fantasy', 10);

        case 'english':
            return await nameGenerator.generateEnglishName('random', 10);

        case 'japanese':
            return await nameGenerator.generateJapaneseName('random', 10);

        case 'western-fantasy':
            return await nameGenerator.generateWesternFantasyName('random', 10);

        case 'fantasy':
            return await nameGenerator.generateFantasyName(3, 10);

        default:
            throw new Error(`未知的风格: ${styleId}`);
    }
}
