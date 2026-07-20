/**
 * 初始化项目命令
 */

import * as vscode from 'vscode';
import { loadTemplates } from '../utils/templateLoader';
import { formatDateTime } from '../utils/dateFormatter';
import { ConfigService } from "../services/configService";
import { handleError, handleSuccess } from '../utils/errorHandler';
import { CONFIG_FILE_NAME, DEFAULT_CONFIG_TEMPLATE_PATH } from '../constants';
import { Logger } from '../utils/logger';

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

    // 询问是否启用分卷功能
    interface VolumeOption extends vscode.QuickPickItem {
        value: boolean;
    }

    const volumeOptions: VolumeOption[] = [
        {
            label: '$(folder) 启用分卷功能',
            description: '适合长篇小说，按卷组织章节',
            detail: '章节会被组织到不同的卷文件夹中（如：chapters/第一卷-崛起/第001章.md）',
            value: true
        },
        {
            label: '$(file) 不启用分卷',
            description: '适合短篇或中篇，扁平章节结构',
            detail: '所有章节直接放在 chapters/ 目录下（如：chapters/第001章.md）',
            value: false
        }
    ];

    const volumeChoice = await vscode.window.showQuickPick(volumeOptions, {
        placeHolder: '请选择章节组织方式',
        ignoreFocusOut: true
    });

    if (!volumeChoice) {
        return;
    }

    const enableVolumes = volumeChoice.value;
    let numberFormat: 'arabic' | 'chinese' | 'roman' = 'arabic';

    // 如果启用分卷，询问编号格式
    if (enableVolumes) {
        interface NumberFormatOption extends vscode.QuickPickItem {
            value: 'arabic' | 'chinese' | 'roman';
        }

        const formatOptions: NumberFormatOption[] = [
            {
                label: '$(symbol-number) 阿拉伯数字',
                description: '第01卷-崛起',
                detail: '现代、清晰、易于排序',
                value: 'arabic'
            },
            {
                label: '$(symbol-text) 中文数字',
                description: '第一卷-崛起',
                detail: '传统、符合中文习惯',
                value: 'chinese'
            },
            {
                label: '$(symbol-ruler) 罗马数字',
                description: '第I卷-崛起',
                detail: '西式、庄重、适合史诗题材',
                value: 'roman'
            }
        ];

        const formatChoice = await vscode.window.showQuickPick(formatOptions, {
            placeHolder: '请选择卷编号格式',
            ignoreFocusOut: true
        });

        if (!formatChoice) {
            return;
        }

        numberFormat = formatChoice.value;
    }

    try {
        // 创建目录结构
        for (const dir of ConfigService.getInstance().getProjectDirectories()) {
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

        // 提取模板中的版本号
        const versionMatch = templateText.match(/"version":\s*"([^"]+)"/);
        const version = versionMatch ? versionMatch[1] : '0.5.0';

        // 在模板开头插入版本号和项目元信息
        const projectMeta = `{
  // ==================== 配置版本 ====================
  // 自动管理，请勿手动修改
  "version": "${version}",

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

        // 提取 noveler 配置部分（去掉最外层的 { "version": "...", "noveler": { ... } }）
        let novelerConfigText = templateText
            .substring(templateText.indexOf('"noveler"'))
            .replace(/^\s*"noveler":\s*{/, '')  // 去掉 "noveler": {
            .replace(/}\s*}\s*$/, '');  // 去掉末尾的两个 } }（noveler 的 } 和整个 JSON 的 }）

        // 根据用户选择修改分卷配置
        if (enableVolumes) {
            // 启用分卷：设置 enabled: true, folderStructure: "nested"
            novelerConfigText = novelerConfigText
                .replace(/"enabled":\s*false/, '"enabled": true')
                .replace(/"folderStructure":\s*"flat"/, '"folderStructure": "nested"')
                .replace(/"numberFormat":\s*"arabic"/, `"numberFormat": "${numberFormat}"`);
        } else {
            // 不启用分卷：保持默认 enabled: false, folderStructure: "flat"
            // 无需修改，模板默认值已经是这样
        }

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

        // 创建 .vscode/settings.json（项目级 VSCode 配置）
        const vscodeDir = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode');
        try {
            await vscode.workspace.fs.stat(vscodeDir);
        } catch {
            await vscode.workspace.fs.createDirectory(vscodeDir);
        }

        const settingsUri = vscode.Uri.joinPath(vscodeDir, 'settings.json');
        let createSettings = false;

        try {
            await vscode.workspace.fs.stat(settingsUri);
            // settings.json 已存在，询问是否覆盖
            const overwriteSettings = await vscode.window.showInformationMessage(
                '检测到 .vscode/settings.json 已存在，是否要合并 Noveler 推荐配置？',
                '合并', '跳过'
            );
            createSettings = (overwriteSettings === '合并');
        } catch {
            // settings.json 不存在，直接创建
            createSettings = true;
        }

        if (createSettings) {
            // Noveler 推荐配置
            const novelerSettings = {
                // 自动保存配置（写作时防止意外丢失内容）
                "files.autoSave": "afterDelay",
                "files.autoSaveDelay": 2000,

                // 文件格式化配置
                "files.trimTrailingWhitespace": true,
                "files.insertFinalNewline": true,

                // Markdown 配置
                "markdown.preview.breaks": true,
                "markdown.preview.typographer": true,

                // 文件排除配置（隐藏不必要的文件）
                "files.exclude": {
                    "**/.DS_Store": true,
                    "**/.noveler": true
                },

                // 搜索排除配置
                "search.exclude": {
                    "**/.noveler": true
                }
            };

            // 尝试读取现有配置并合并
            let finalSettings = novelerSettings;
            try {
                const existingData = await vscode.workspace.fs.readFile(settingsUri);
                const existingSettings = JSON.parse(Buffer.from(existingData).toString('utf8'));

                // 深度合并配置（现有配置优先，Noveler 配置作为默认值）
                finalSettings = {
                    ...novelerSettings,
                    ...existingSettings,
                    // 特殊处理嵌套对象（files.exclude 和 search.exclude）
                    "files.exclude": {
                        ...novelerSettings["files.exclude"],
                        ...(existingSettings["files.exclude"] || {})
                    },
                    "search.exclude": {
                        ...novelerSettings["search.exclude"],
                        ...(existingSettings["search.exclude"] || {})
                    }
                };
                Logger.info('合并现有 VSCode 配置与 Noveler 推荐配置');
            } catch {
                // 文件不存在或解析失败，使用 Noveler 默认配置
                Logger.info('创建新的 VSCode 配置文件');
            }

            await vscode.workspace.fs.writeFile(
                settingsUri,
                Buffer.from(JSON.stringify(finalSettings, null, 2), 'utf8')
            );
            Logger.info('项目级 VSCode 配置已保存: .vscode/settings.json');
        }

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
                Logger.warn(`创建敏感词配置文件失败: ${file.name}`, error);
            }
        }

        handleSuccess(`小说项目"${novelName}"初始化完成！已创建目录结构和配置文件\n${enableVolumes ? `✅ 已启用分卷功能（${numberFormat === 'arabic' ? '阿拉伯数字' : numberFormat === 'chinese' ? '中文数字' : '罗马数字'}编号）` : '📄 使用扁平章节结构'}`);

        // 完整刷新（初始化项目后需要更新所有数据）
        await vscode.commands.executeCommand('noveler.refresh');

        // 打开 README.md
        const readmeDoc = await vscode.workspace.openTextDocument(readmeUri);
        await vscode.window.showTextDocument(readmeDoc);

    } catch (error) {
        handleError('初始化项目失败', error);
    }
}
