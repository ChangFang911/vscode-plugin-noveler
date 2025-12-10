import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as jsoncParser from 'jsonc-parser';
import { Logger } from '../utils/logger';
import { CURRENT_CONFIG_VERSION } from '../constants';
import { PartialNovelConfig, NovelerConfig } from '../types/config';

/**
 * 迁移服务
 * 负责检查和升级项目配置及文件结构
 *
 * @example
 * ```typescript
 * // 在 extension.ts 中使用
 * await MigrationService.checkAndMigrate(context);
 * ```
 */
export class MigrationService {
    /**
     * 检查并执行必要的迁移
     *
     * @param _context 扩展上下文
     * @returns 是否执行了迁移
     */
    public static async checkAndMigrate(_context: vscode.ExtensionContext): Promise<boolean> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return false;
        }

        const configPath = path.join(workspaceFolder.uri.fsPath, 'novel.jsonc');

        // 检查配置文件是否存在
        if (!fs.existsSync(configPath)) {
            Logger.debug('配置文件不存在，跳过迁移');
            return false;
        }

        try {
            // 读取当前配置
            const configText = fs.readFileSync(configPath, 'utf-8');
            const config = jsoncParser.parse(configText) as PartialNovelConfig;

            // 获取当前配置版本
            const currentVersion = config.version || '0.0.0';

            // 检查是否需要升级
            if (this.compareVersions(currentVersion, CURRENT_CONFIG_VERSION) >= 0) {
                Logger.debug(`配置版本已是最新: ${currentVersion}`);
                return false;
            }

            Logger.info(`检测到配置版本过旧 (${currentVersion})，开始升级到 ${CURRENT_CONFIG_VERSION}`);

            // 执行迁移
            const migrated = await this.performMigration(
                workspaceFolder.uri.fsPath,
                currentVersion,
                CURRENT_CONFIG_VERSION,
                config,
                configText
            );

            if (migrated) {
                // 显示升级通知
                this.showMigrationNotification(currentVersion, CURRENT_CONFIG_VERSION);
            }

            return migrated;
        } catch (error) {
            Logger.error('配置迁移失败', error);
            vscode.window.showErrorMessage(`配置升级失败: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * 执行迁移
     *
     * @param workspaceRoot 工作区根目录
     * @param fromVersion 起始版本
     * @param toVersion 目标版本
     * @param config 当前配置对象
     * @param configText 当前配置文本
     * @returns 是否成功迁移
     */
    private static async performMigration(
        workspaceRoot: string,
        fromVersion: string,
        toVersion: string,
        config: PartialNovelConfig,
        configText: string
    ): Promise<boolean> {
        const configPath = path.join(workspaceRoot, 'novel.jsonc');
        let modified = false;

        // 执行各个版本的升级脚本
        // 注意：这里按顺序执行，支持增量升级

        // 升级到 0.3.4（敏感词功能）
        if (this.compareVersions(fromVersion, '0.3.4') < 0) {
            Logger.info('应用 0.3.4 升级：添加敏感词检测配置');
            const updates = this.getMigration_0_3_4(config);
            if (!config.noveler) {
                config.noveler = {};
            }
            this.deepMerge(config.noveler as Record<string, unknown>, updates as Record<string, unknown>);
            modified = true;
        }

        // 升级到 0.4.0（分卷功能 + 段落缩进）
        if (this.compareVersions(fromVersion, '0.4.0') < 0) {
            Logger.info('应用 0.4.0 升级：添加分卷和段落缩进配置');
            const updates = this.getMigration_0_4_0(config);
            if (!config.noveler) {
                config.noveler = {};
            }
            this.deepMerge(config.noveler as Record<string, unknown>, updates as Record<string, unknown>);
            modified = true;
        }

        // 升级到 0.5.0（无新配置项，仅版本号更新）
        if (this.compareVersions(fromVersion, '0.5.0') < 0) {
            Logger.info('应用 0.5.0 升级：更新版本号');
            // 0.5.0 版本主要是代码质量优化和 bug 修复，无新配置项
            modified = true;
        }

        // 如果有修改，保存配置文件
        if (modified) {
            // 更新版本号
            config.version = toVersion;

            // 保存配置（从模板注入缺失字段，保留注释格式）
            await this.saveConfigWithTemplate(configPath, config, configText);

            Logger.info(`配置已升级到 ${toVersion}`);
            return true;
        }

        return false;
    }

    /**
     * 深度合并对象（递归合并，不覆盖已有值）
     *
     * @param target 目标对象
     * @param source 源对象
     */
    private static deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): void {
        for (const key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                const sourceValue = source[key];
                const targetValue = target[key];

                if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
                    // 如果是对象，递归合并
                    if (!targetValue || typeof targetValue !== 'object') {
                        target[key] = {} as T[Extract<keyof T, string>];
                    }
                    this.deepMerge(
                        target[key] as Record<string, unknown>,
                        sourceValue as Record<string, unknown>
                    );
                } else {
                    // 如果目标对象没有这个 key，才添加
                    if (!(key in target)) {
                        target[key] = sourceValue as T[Extract<keyof T, string>];
                    }
                }
            }
        }
    }

    /**
     * 0.3.4 版本升级：添加敏感词检测配置
     */
    private static getMigration_0_3_4(config: PartialNovelConfig): Partial<NovelerConfig> {
        const updates: Partial<NovelerConfig> = {};

        // 确保 noveler 配置存在
        if (!config.noveler) {
            config.noveler = {};
        }

        // 如果没有敏感词配置，添加默认配置
        if (!config.noveler.sensitiveWords) {
            updates.sensitiveWords = {
                enabled: true,
                builtInLibrary: {
                    enabled: true,
                    levels: {
                        high: true,
                        medium: false,
                        low: false
                    }
                },
                customLibrary: {
                    enabled: true,
                    path: '.noveler/sensitive-words/custom-words.jsonc'
                },
                whitelist: {
                    enabled: true,
                    path: '.noveler/sensitive-words/whitelist.jsonc'
                },
                checkOnType: true,
                checkOnSave: true,
                display: {
                    severity: 'Warning',
                    showInProblems: true,
                    showWordCount: true
                }
            };
        }

        return updates;
    }

    /**
     * 0.4.0 版本升级：添加分卷和段落缩进配置
     */
    private static getMigration_0_4_0(config: PartialNovelConfig): Partial<NovelerConfig> {
        const updates: Partial<NovelerConfig> = {};

        // 确保 noveler 配置存在
        if (!config.noveler) {
            config.noveler = {};
        }

        // 如果没有分卷配置，添加默认配置
        if (!config.noveler.volumes) {
            updates.volumes = {
                enabled: false,
                folderStructure: 'flat',
                numberFormat: 'arabic',
                chapterNumbering: 'global'
            };
        }

        // 如果没有段落缩进配置，添加默认配置
        if (!config.noveler.paragraphIndent) {
            updates.paragraphIndent = {
                value: true  // 默认开启
            };
        }

        return updates;
    }

    /**
     * 保存配置文件（从模板注入缺失字段，保留注释）
     *
     * @param configPath 配置文件路径
     * @param config 配置对象
     * @param originalText 原始配置文本
     */
    private static async saveConfigWithTemplate(
        configPath: string,
        config: PartialNovelConfig,
        originalText: string
    ): Promise<void> {
        try {
            // 读取模板文件
            const templatePath = path.join(__dirname, '../../templates/default-config.jsonc');
            const templateText = fs.readFileSync(templatePath, 'utf-8');

            let updatedText = originalText;
            const originalConfig = jsoncParser.parse(originalText) as PartialNovelConfig;

            // 1. 添加或更新 version 字段
            if (!originalConfig.version) {
                // 从模板中提取 version 块（包含注释）
                const versionBlock = this.extractVersionBlock(templateText, config.version || CURRENT_CONFIG_VERSION);
                updatedText = updatedText.replace(/^\{/, '{' + versionBlock);
            } else if (originalConfig.version !== config.version) {
                // 只更新版本号值
                const versionEdit = jsoncParser.modify(
                    updatedText,
                    ['version'],
                    config.version,
                    { formattingOptions: { tabSize: 2, insertSpaces: true } }
                );
                updatedText = jsoncParser.applyEdits(updatedText, versionEdit);
            }

            // 2. 从模板中注入缺失的配置字段
            if (config.noveler) {
                updatedText = this.injectMissingFields(
                    updatedText,
                    templateText,
                    config.noveler,
                    originalConfig.noveler || {}
                );
            }

            // 写入文件
            fs.writeFileSync(configPath, updatedText, 'utf-8');
        } catch (error) {
            Logger.error('保存配置文件失败', error);
            throw error;
        }
    }

    /**
     * 从模板中提取 version 块
     */
    private static extractVersionBlock(templateText: string, version: string): string {
        const match = templateText.match(/\n\s*\/\/ ={10,}[^\n]*配置版本[^\n]*={10,}[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*"version":\s*"[^"]+",/);
        if (match) {
            return match[0].replace(/"version":\s*"[^"]+"/, `"version": "${version}"`);
        }
        return `\n  // ==================== 配置版本 ====================\n  // 自动管理，请勿手动修改\n  "version": "${version}",\n`;
    }

    /**
     * 从模板注入缺失字段
     */
    private static injectMissingFields(
        text: string,
        templateText: string,
        newConfig: Partial<NovelerConfig>,
        originalConfig: Partial<NovelerConfig>
    ): string {
        let updatedText = text;

        // 定义字段插入顺序（根据模板顺序）
        const fieldOrder = [
            'targetWords',
            'highlight',
            'format',
            'wordCount',
            'autoUpdateReadmeOnCreate',
            'autoEmptyLine',
            'paragraphIndent',
            'autoSave',
            'sensitiveWords',
            'volumes',
            'characters'
        ];

        for (const fieldName of fieldOrder) {
            // 检查是否需要添加此字段
            if (fieldName in newConfig && !(fieldName in originalConfig)) {
                Logger.debug(`从模板注入字段: noveler.${fieldName}`);

                // 从模板中提取字段块
                const fieldBlock = this.extractFieldBlock(templateText, fieldName);
                if (fieldBlock) {
                    // 找到合适的位置插入
                    updatedText = this.insertFieldBlock(updatedText, fieldName, fieldBlock, fieldOrder);
                }
            }
        }

        return updatedText;
    }

    /**
     * 从模板提取字段块（包含注释）
     */
    private static extractFieldBlock(templateText: string, fieldName: string): string | null {
        try {
            // 找到字段定义的起始位置（不带前导换行符）
            const fieldStartRegex = new RegExp(`"${fieldName}":\\s*\\{`);
            const fieldMatch = templateText.match(fieldStartRegex);

            if (!fieldMatch || typeof fieldMatch.index !== 'number') {
                return null;
            }

            const fieldStartPos = fieldMatch.index;

            // 向前查找最近的注释行（// ==== 开头的行）
            let commentStartPos = fieldStartPos;
            const textBeforeField = templateText.substring(0, fieldStartPos);
            const lines = textBeforeField.split('\n');

            // 从字段位置往前找，找到最近的 // ==== 注释行
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i].trim();

                // 空行继续向前找
                if (line === '') {
                    continue;
                }

                // 普通注释行继续向前找
                if (line.startsWith('//') && !line.match(/\/\/\s*={10,}/)) {
                    continue;
                }

                // 找到分隔线注释
                if (line.match(/\/\/\s*={10,}/)) {
                    // 计算这行的开始位置
                    const linesBeforeComment = lines.slice(0, i);
                    commentStartPos = linesBeforeComment.join('\n').length + (linesBeforeComment.length > 0 ? 1 : 0);
                    break;
                }

                // 遇到其他内容（非注释、非空行）则停止
                break;
            }

            // 从字段开始位置匹配嵌套的大括号
            const fieldDefStart = templateText.indexOf('{', fieldStartPos);
            if (fieldDefStart === -1) {
                return null;
            }

            // 使用栈来匹配括号
            let braceCount = 0;
            let i = fieldDefStart;
            let inString = false;
            let escapeNext = false;

            while (i < templateText.length) {
                const char = templateText[i];

                if (escapeNext) {
                    escapeNext = false;
                    i++;
                    continue;
                }

                if (char === '\\') {
                    escapeNext = true;
                    i++;
                    continue;
                }

                if (char === '"') {
                    inString = !inString;
                } else if (!inString) {
                    if (char === '{') {
                        braceCount++;
                    } else if (char === '}') {
                        braceCount--;
                        if (braceCount === 0) {
                            // 找到匹配的闭合括号
                            // 检查后面是否有逗号和换行
                            let endPos = i + 1;
                            while (endPos < templateText.length && /[\s,]/.test(templateText[endPos])) {
                                if (templateText[endPos] === ',') {
                                    endPos++;
                                    break;
                                }
                                endPos++;
                            }

                            // 提取从注释开始到字段结束的完整块
                            let extracted = templateText.substring(commentStartPos, endPos);

                            // 确保开头有换行符
                            if (!extracted.startsWith('\n')) {
                                extracted = '\n' + extracted;
                            }

                            return extracted;
                        }
                    }
                }

                i++;
            }

            return null;
        } catch (error) {
            Logger.error(`提取字段块失败: ${fieldName}`, error);
            return null;
        }
    }

    /**
     * 在正确位置插入字段块
     */
    private static insertFieldBlock(
        text: string,
        fieldName: string,
        fieldBlock: string,
        fieldOrder: string[]
    ): string {
        // 找到当前字段在顺序中的位置
        const currentIndex = fieldOrder.indexOf(fieldName);
        if (currentIndex === -1) {
            return text;
        }

        // 寻找前一个已存在的字段
        for (let i = currentIndex - 1; i >= 0; i--) {
            const prevField = fieldOrder[i];

            // 使用括号匹配算法找到完整的字段定义
            const fieldEndPos = this.findFieldEnd(text, prevField);
            if (fieldEndPos !== -1) {
                return text.slice(0, fieldEndPos) + fieldBlock + text.slice(fieldEndPos);
            }
        }

        // 如果找不到前置字段，插入到 noveler 对象开始位置
        const novelerStart = text.match(/"noveler":\s*\{/);
        if (novelerStart && typeof novelerStart.index === 'number') {
            const insertPos = novelerStart.index + novelerStart[0].length;
            return text.slice(0, insertPos) + fieldBlock + text.slice(insertPos);
        }

        return text;
    }

    /**
     * 找到字段定义的结束位置（使用括号匹配）
     */
    private static findFieldEnd(text: string, fieldName: string): number {
        const fieldStartRegex = new RegExp(`"${fieldName}":\\s*\\{`);
        const match = text.match(fieldStartRegex);

        if (!match || typeof match.index !== 'number') {
            return -1;
        }

        const fieldDefStart = text.indexOf('{', match.index);
        if (fieldDefStart === -1) {
            return -1;
        }

        // 使用栈来匹配括号
        let braceCount = 0;
        let i = fieldDefStart;
        let inString = false;
        let escapeNext = false;

        while (i < text.length) {
            const char = text[i];

            if (escapeNext) {
                escapeNext = false;
                i++;
                continue;
            }

            if (char === '\\') {
                escapeNext = true;
                i++;
                continue;
            }

            if (char === '"') {
                inString = !inString;
            } else if (!inString) {
                if (char === '{') {
                    braceCount++;
                } else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        // 找到匹配的闭合括号
                        // 检查后面是否有逗号
                        let endPos = i + 1;
                        while (endPos < text.length && /[\s,]/.test(text[endPos])) {
                            if (text[endPos] === ',') {
                                endPos++;
                                break;
                            }
                            endPos++;
                        }
                        return endPos;
                    }
                }
            }

            i++;
        }

        return -1;
    }

    /**
     * 显示迁移完���通知
     *
     * @param fromVersion 起始版本
     * @param toVersion 目标版本
     */
    private static showMigrationNotification(fromVersion: string, toVersion: string): void {
        const message = `✅ 配置已自动升级\\n\\n从 v${fromVersion} → v${toVersion}\\n\\n新功能已启用，请查看配置文件了解详情。`;

        vscode.window.showInformationMessage(
            `Noveler 配置已升级到 v${toVersion}`,
            '查看配置',
            '查看更新日志'
        ).then(selection => {
            if (selection === '查看配置') {
                vscode.commands.executeCommand('noveler.openConfig');
            } else if (selection === '查看更新日志') {
                this.showChangelog(toVersion);
            }
        });
    }

    /**
     * 显示更新日志
     *
     * @param version 版本号
     */
    private static showChangelog(version: string): void {
        const changelog: Record<string, string> = {
            '0.3.4': `# v0.3.4 新功能

## 敏感词检测
- 内置 900+ 敏感词库（高/中/低三个等级）
- 支持自定义敏感词和白名单
- 实时检测，在问题面板显示
- 一键添加到白名单`,

            '0.4.0': `# v0.4.0 新功能

## 分卷功能
- 支持多卷小说结构（正文/前传/后传/番外）
- 可视化卷管理（创建、重命名、删除）
- 章节在卷之间移动/复制
- 自动生成卷大纲

## 段落缩进
- 支持段落首行自动缩进（两个全角空格）
- 按回车自动缩进新段落
- 格式化时自动添加缩进

## 格式化增强
- 根据 autoEmptyLine 配置自动调整段落间空行
- 支持批量格式化现有文档`,

            '0.5.0': `# v0.5.0 更新

## 代码质量优化
- 修复卷编号计算 bug
- 扩展中文数字支持（1-99）
- 优化代码复用，消除重复代码
- 提升类型安全性

## Bug 修复
- 修复配置初始化时多余括号问题
- 修复角色名在 frontmatter 区域被高亮的问题
- 修复段落间空行格式化逻辑

## 配置自动迁移系统
- 插件更新时自动升级项目配置
- 非侵入式升级，保留用户自定义设置
- 升级完成后显示更新日志通知`
        };

        const content = changelog[version] || '未找到更新日志';

        // 创建一个新的文本文档显示更新日志
        vscode.workspace.openTextDocument({
            content,
            language: 'markdown'
        }).then(doc => {
            vscode.window.showTextDocument(doc, {
                preview: true,
                viewColumn: vscode.ViewColumn.Beside
            });
        });
    }

    /**
     * 比较版本号
     *
     * @param v1 版本1
     * @param v2 版本2
     * @returns 如果 v1 < v2 返回 -1，v1 === v2 返回 0，v1 > v2 返回 1
     */
    private static compareVersions(v1: string, v2: string): number {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);

        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;

            if (p1 < p2) {
                return -1;
            }
            if (p1 > p2) {
                return 1;
            }
        }

        return 0;
    }
}
