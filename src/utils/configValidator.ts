/**
 * 配置验证工具
 */

import { NovelConfig } from '../services/configService';

export interface ValidationError {
    field: string;
    message: string;
    severity: 'error' | 'warning';
}

/**
 * 验证配置对象
 * @param config 要验证的配置对象
 * @returns 验证错误数组，如果为空则表示验证通过
 */
export function validateConfig(config: NovelConfig): ValidationError[] {
    const errors: ValidationError[] = [];

    // 验证 targetWords
    if (config.targetWords?.default !== undefined) {
        const targetWords = config.targetWords.default;
        if (typeof targetWords !== 'number') {
            errors.push({
                field: 'targetWords.default',
                message: '目标字数必须是数字',
                severity: 'error'
            });
        } else if (targetWords <= 0) {
            errors.push({
                field: 'targetWords.default',
                message: '目标字数必须大于 0',
                severity: 'error'
            });
        } else if (targetWords > 50000) {
            errors.push({
                field: 'targetWords.default',
                message: '目标字数建议不超过 50000',
                severity: 'warning'
            });
        }
    }

    // 验证 highlight 样式
    if (config.highlight) {
        for (const [type, style] of Object.entries(config.highlight)) {
            if (style.color && !isValidColor(style.color)) {
                errors.push({
                    field: `highlight.${type}.color`,
                    message: `颜色值无效：${style.color}`,
                    severity: 'warning'
                });
            }
            if (style.backgroundColor && !isValidColor(style.backgroundColor)) {
                errors.push({
                    field: `highlight.${type}.backgroundColor`,
                    message: `背景颜色值无效：${style.backgroundColor}`,
                    severity: 'warning'
                });
            }
        }
    }

    // 验证 format.chineseQuoteStyle
    if (config.format?.chineseQuoteStyle) {
        const validStyles = ['「」', '""', '""'];
        if (!validStyles.includes(config.format.chineseQuoteStyle)) {
            errors.push({
                field: 'format.chineseQuoteStyle',
                message: `引号样式无效，支持: ${validStyles.join(', ')}`,
                severity: 'warning'
            });
        }
    }

    // 验证 autoUpdateReadmeOnCreate
    if (config.autoUpdateReadmeOnCreate?.value) {
        const validValues = ['always', 'ask', 'never'];
        if (!validValues.includes(config.autoUpdateReadmeOnCreate.value)) {
            errors.push({
                field: 'autoUpdateReadmeOnCreate.value',
                message: `README 自动更新值无效，支持: ${validValues.join(', ')}`,
                severity: 'error'
            });
        }
    }

    return errors;
}

/**
 * 验证颜色值是否有效
 * @param color 颜色字符串
 * @returns 是否有效
 */
function isValidColor(color: string): boolean {
    // 支持 hex (#fff, #ffffff), rgb, rgba
    const hexPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
    const rgbPattern = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/i;

    return hexPattern.test(color) || rgbPattern.test(color);
}

/**
 * 修复配置（尽可能自动修正）
 * @param config 配置对象
 * @returns 修复后的配置对象
 */
export function fixConfig(config: NovelConfig): NovelConfig {
    const fixed = { ...config };

    // 修复 targetWords
    if (fixed.targetWords?.default !== undefined) {
        if (typeof fixed.targetWords.default !== 'number' || fixed.targetWords.default <= 0) {
            fixed.targetWords.default = 2500; // 恢复默认值
        }
    }

    // 修复 autoUpdateReadmeOnCreate
    if (fixed.autoUpdateReadmeOnCreate?.value) {
        const validValues = ['always', 'ask', 'never'];
        if (!validValues.includes(fixed.autoUpdateReadmeOnCreate.value)) {
            fixed.autoUpdateReadmeOnCreate.value = 'always'; // 恢复默认值
        }
    }

    return fixed;
}
