import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { CONFIG_FILE_NAME, CURRENT_CONFIG_VERSION } from '../constants';
import { applyDocumentChange, documentIO, fileExists } from '../utils/documentOperations';
import { mergeRecommendedSettings, parseJsoncObject, patchJsoncFields } from '../utils/settingsHelper';

export class MigrationService {
    public static async checkAndMigrate(context: vscode.ExtensionContext): Promise<boolean> {
        const workspaceFolder = documentIO.workspaceFolder();
        if (!workspaceFolder) { return false; }
        const uri = vscode.Uri.joinPath(workspaceFolder.uri, CONFIG_FILE_NAME);
        let before: string | undefined;
        let after: string | undefined;
        let editedVersion: number | undefined;
        try {
            if (!await fileExists(uri)) { return false; }
            const document = await vscode.workspace.openTextDocument(uri);
            if (!this.needsUpgrade(document.getText())) { return false; }
            const template = parseJsoncObject(Buffer.from(await documentIO.readFile(
                vscode.Uri.joinPath(context.extensionUri, 'templates', 'default-config.jsonc')
            )).toString('utf8'));
            if (!template.noveler || typeof template.noveler !== 'object' || Array.isArray(template.noveler)) {
                throw new Error('配置模板无效，原项目未修改');
            }
            await applyDocumentChange(uri, text => {
                if (!this.needsUpgrade(text)) { return text; }
                const current = parseJsoncObject(text);
                const defaults = JSON.parse(JSON.stringify(template.noveler)) as Record<string, unknown>;
                defaults.volumes = { enabled: false, folderStructure: 'flat', numberFormat: 'arabic', chapterNumbering: 'global' };
                const oldSettings = current.noveler as Record<string, unknown> | undefined;
                const oldSensitive = oldSettings?.sensitiveWords as { levels?: Record<string, boolean> } | undefined;
                if (oldSensitive?.levels && typeof oldSensitive.levels === 'object' && !Array.isArray(oldSensitive.levels)) {
                    const sensitive = defaults.sensitiveWords as { builtInLibrary: { levels: Record<string, boolean> } };
                    sensitive.builtInLibrary.levels = { ...sensitive.builtInLibrary.levels, ...oldSensitive.levels };
                }
                before = text;
                after = patchJsoncFields(mergeRecommendedSettings(text, { noveler: defaults }), { version: CURRENT_CONFIG_VERSION });
                return after;
            });
            if (after === undefined) { return false; }
            editedVersion = document.version;
            if (!await documentIO.save(document) || document.isDirty) {
                throw new Error('升级配置未保存，操作已停止');
            }
            Logger.info(`配置已升级到 ${CURRENT_CONFIG_VERSION}`);
            vscode.window.showInformationMessage('小说项目配置已更新，原有设置已保留。', '查看配置', '查看更新日志')
                .then(selection => {
                    if (selection === '查看配置') { return vscode.commands.executeCommand('noveler.openConfig'); }
                    if (selection === '查看更新日志') { return vscode.commands.executeCommand('noveler.showWelcome'); }
                }).then(undefined, error => Logger.warn('打开配置升级说明失败', error));
            return true;
        } catch (error) {
            if (before !== undefined && after !== undefined && editedVersion !== undefined) {
                try {
                    const document = await vscode.workspace.openTextDocument(uri);
                    if (document.version === editedVersion && document.getText() === after) {
                        const original = before;
                        await applyDocumentChange(uri, text => document.version === editedVersion && text === after ? original : text);
                    }
                } catch (restoreError) { Logger.error('恢复升级前的编辑内容失败', restoreError); }
            }
            Logger.error('配置迁移失败', error);
            vscode.window.showErrorMessage(`配置更新失败: ${error instanceof Error ? error.message : String(error)}`, '打开配置')
                .then(selection => {
                    if (selection === '打开配置') { return vscode.commands.executeCommand('vscode.open', uri); }
                }).then(undefined, openError => Logger.warn('打开配置失败', openError));
            return false;
        }
    }

    private static needsUpgrade(text: string): boolean {
        const config = parseJsoncObject(text);
        if (config.noveler !== undefined && (!config.noveler || typeof config.noveler !== 'object' || Array.isArray(config.noveler))) {
            throw new Error('noveler 配置必须为对象，原文件未修改');
        }
        const version = config.version === undefined ? '0.0.0' : config.version;
        if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
            throw new Error('配置版本号无效，原文件未修改');
        }
        const current = version.split('.').map(Number);
        const target = CURRENT_CONFIG_VERSION.split('.').map(Number);
        for (let index = 0; index < target.length; index++) {
            if (current[index] !== target[index]) { return current[index] < target[index]; }
        }
        return false;
    }
}
