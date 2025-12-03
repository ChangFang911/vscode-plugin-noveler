/**
 * README 自动更新辅助工具
 */

import * as vscode from 'vscode';
import { updateReadme } from './readmeUpdater';
import { ConfigService } from '../services/configService';

/**
 * 根据配置处理 README 自动更新
 * 在创建章节或人物后调用
 */
export async function handleReadmeAutoUpdate(): Promise<void> {
    const configService = ConfigService.getInstance();
    await configService.waitForConfig(); // 等待配置加载完成
    const autoUpdate = configService.getReadmeAutoUpdateMode();

    if (autoUpdate === 'always') {
        // 总是自动更新（静默模式，不显示通知）
        await updateReadme(true);
    } else if (autoUpdate === 'ask') {
        // 询问用户
        const result = await vscode.window.showInformationMessage(
            '是否更新 README 统计信息？',
            '更新', '跳过'
        );
        if (result === '更新') {
            await updateReadme(false); // 用户主动选择，显示通知
        }
    }
    // autoUpdate === 'never' 时什么都不做
}
