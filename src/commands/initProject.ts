/**
 * 初始化项目命令
 */

import * as vscode from 'vscode';
import { loadTemplates } from '../utils/templateLoader';
import { formatDateTime } from '../utils/dateFormatter';
import { handleError, handleSuccess } from '../utils/errorHandler';
import { PROJECT_DIRECTORIES, CONFIG_FILE_NAME, DEFAULT_CONFIG_TEMPLATE_PATH } from '../constants';

/**
 * 初始化小说项目
 */
export async function initProject(context: vscode.ExtensionContext): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Noveler: 请先打开一个文件夹作为工作区');
        return;
    }

    // 询问小说名称
    const novelName = await vscode.window.showInputBox({
        prompt: '请输入小说名称',
        placeHolder: '例如：我的武侠小说'
    });

    if (!novelName) {
        return;
    }

    try {
        // 创建目录结构
        for (const dir of PROJECT_DIRECTORIES) {
            const dirUri = vscode.Uri.joinPath(workspaceFolder.uri, dir);
            try {
                await vscode.workspace.fs.stat(dirUri);
            } catch {
                await vscode.workspace.fs.createDirectory(dirUri);
            }
        }

        // 检查 novel.jsonc 是否已存在
        const configUri = vscode.Uri.joinPath(workspaceFolder.uri, CONFIG_FILE_NAME);
        let configExists = false;
        try {
            await vscode.workspace.fs.stat(configUri);
            configExists = true;
        } catch {
            // 文件不存在，继续
        }

        if (configExists) {
            const overwrite = await vscode.window.showWarningMessage(
                `检测到项目已初始化（novel.jsonc 已存在），是否要重新初始化？\n\n⚠️ 这将覆盖 novel.jsonc、README.md 和大纲.md`,
                { modal: true },
                '重新初始化', '取消'
            );

            if (overwrite !== '重新初始化') {
                return;
            }
        }

        // 读取默认配置模板
        const templatePath = vscode.Uri.joinPath(context.extensionUri, DEFAULT_CONFIG_TEMPLATE_PATH);
        let templateText: string;
        try {
            const templateData = await vscode.workspace.fs.readFile(templatePath);
            templateText = Buffer.from(templateData).toString('utf8');
        } catch (error) {
            vscode.window.showErrorMessage(`Noveler: 无法读取默认配置模板 - ${error}`);
            return;
        }

        // 创建 novel.jsonc 配置文件（保留注释）
        const now = formatDateTime(new Date());

        // 在模板开头插入项目元信息
        const projectMeta = `{
  // ==================== 项目基本信息 ====================
  "name": "${novelName}",
  "author": "",
  "description": "",
  "genre": "",
  "tags": [],
  "created": "${now}",
  "modified": "${now}",

  // ==================== Noveler 插件配置 ====================
  "noveler": {
`;

        // 提取 noveler 配置部分（去掉最外层的 { "noveler": { ... } }）
        const novelerConfigText = templateText
            .substring(templateText.indexOf('"noveler"'))
            .replace(/^\s*"noveler":\s*{/, '')  // 去掉 "noveler": {
            .replace(/}\s*$/, '');  // 去掉末尾的 }

        const novelConfigText = projectMeta + novelerConfigText + '\n  }\n}';

        // configUri 已在前面声明
        await vscode.workspace.fs.writeFile(
            configUri,
            Buffer.from(novelConfigText, 'utf8')
        );

        // 从模板配置读取 README 和大纲模板
        const templates = await loadTemplates();

        // 创建 README.md
        let readmeContent = templates?.readme?.content || `# {novelName}

## 项目说明

这是使用 Noveler 插件创建的中文小说写作项目。

## 目录结构

- \`chapters/\` - 正式章节
- \`characters/\` - 人物设定
- \`drafts/\` - 草稿和大纲
- \`references/\` - 参考资料和设定
- \`novel.jsonc\` - 小说配置文件

## 开始写作

使用命令 \`Noveler: 创建新章节\` 来创建新的章节。
`;
        readmeContent = readmeContent.replace(/{novelName}/g, novelName);

        const readmeUri = vscode.Uri.joinPath(workspaceFolder.uri, 'README.md');
        await vscode.workspace.fs.writeFile(
            readmeUri,
            Buffer.from(readmeContent, 'utf8')
        );

        // 在 drafts 目录创建一个示例大纲文件
        let outlineContent = templates?.outline?.content || `# {novelName} - 大纲

## 主要角色

-

## 主线剧情

1.

## 世界观设定

-
`;
        outlineContent = outlineContent.replace(/{novelName}/g, novelName);

        const outlineUri = vscode.Uri.joinPath(workspaceFolder.uri, 'drafts', '大纲.md');
        await vscode.workspace.fs.writeFile(
            outlineUri,
            Buffer.from(outlineContent, 'utf8')
        );

        // 在 references 目录创建一个示例参考资料文件
        const referenceContent = templates?.reference?.content || `# 参考资料

> 在这里收集你的灵感、参考图片、链接等素材
`;

        const referenceUri = vscode.Uri.joinPath(workspaceFolder.uri, 'references', '参考资料.md');
        await vscode.workspace.fs.writeFile(
            referenceUri,
            Buffer.from(referenceContent, 'utf8')
        );

        // 创建 .noveler/sensitive-words 目录并创建空的配置文件
        const sensitiveWordsDir = vscode.Uri.joinPath(workspaceFolder.uri, '.noveler', 'sensitive-words');
        try {
            await vscode.workspace.fs.stat(sensitiveWordsDir);
        } catch {
            await vscode.workspace.fs.createDirectory(sensitiveWordsDir);
        }

        // 创建空的敏感词配置文件（直接可用，无需复制重命名）
        const sensitiveWordFiles = [
            {
                name: 'custom-words.jsonc',
                content: `{
  // ==================== 自定义敏感词库 ====================
  //
  // 📖 使用说明：
  // 1. 在下方 "words" 数组中添加您想要检测的敏感词
  // 2. 支持的添加方式：
  //    - 手动编辑：直接在数组中添加，如 "词汇1", "词汇2"
  //    - 右键添加：选中文字 → 右键 → "Noveler: 添加到自定义敏感词库"
  // 3. 保存后立即生效，无需重启
  //
  // 💡 适用场景：
  // - 特定平台的禁用词汇（如某平台的审核标准）
  // - 您个人想要避免的词汇
  // - 您所在行业/题材的特殊敏感词
  //
  // ⚠️ 注意：自定义敏感词会被视为高危级别，请谨慎添加
  //
  "description": "我的自定义敏感词库",
  "words": [
    // 在这里添加您的敏感词，每行一个词汇，用逗号分隔
    // 示例：
    // "某平台禁词",
    // "我不想用的词"
  ]
}`
            },
            {
                name: 'whitelist.jsonc',
                content: `{
  // ==================== 白名单（排除误报） ====================
  //
  // 📖 使用说明：
  // 1. 在下方 "words" 数组中添加需要排除的词汇
  // 2. 支持的添加方式：
  //    - 手动编辑：直接在数组中添加，如 "词汇1", "词汇2"
  //    - 右键添加：选中文字 → 右键 → "Noveler: 添加到白名单"
  // 3. 保存后立即生效，无需重启
  //
  // 💡 适用场景：
  // - 小说中的人物名（如"希特勒"作为虚构角色名）
  // - 架空世界的地名（如"天安城"）
  // - 功法名、技能名等特殊术语
  // - 其他被内置词库误报的正常词汇
  //
  // ⚠️ 注意：白名单中的词汇将不会被检测为敏感词
  //
  "description": "我的白名单（排除误报）",
  "words": [
    // 在这里添加需要排除的词汇，每行一个，用逗号分隔
    // 示例：
    // "小说主角名",
    // "架空地名",
    // "功法名称"
  ]
}`
            }
        ];

        for (const file of sensitiveWordFiles) {
            const fileUri = vscode.Uri.joinPath(sensitiveWordsDir, file.name);
            try {
                await vscode.workspace.fs.writeFile(fileUri, Buffer.from(file.content, 'utf8'));
            } catch (error) {
                // 静默失败，不影响项目初始化
                console.warn(`创建敏感词配置文件失败: ${file.name}`, error);
            }
        }

        handleSuccess(`小说项目"${novelName}"初始化完成！已创建目录结构和配置文件`);

        // 刷新侧边栏视图
        vscode.commands.executeCommand('noveler.refreshView');

        // 打开 README.md
        const readmeDoc = await vscode.workspace.openTextDocument(readmeUri);
        await vscode.window.showTextDocument(readmeDoc);

    } catch (error) {
        handleError('初始化项目失败', error);
    }
}
