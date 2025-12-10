/**
 * 分卷相关的工具函数
 */

import { VolumeType } from '../types/volume';
import { ConfigService } from '../services/configService';
import { convertToChineseNumber } from './chineseNumber';
import { VOLUME_TYPE_OFFSETS, VOLUME_TYPE_NAMES } from '../constants';

/**
 * 生成卷文件夹名称
 *
 * @param volumeType 卷类型（main/prequel/sequel/extra）
 * @param volumeNumber 卷序号（内部编号，可能是负数或大于1000）
 * @param volumeTitle 卷标题
 * @returns 文件夹名称，如 "第01卷-崛起"、"前传01-起源"
 *
 * @example
 * ```typescript
 * generateVolumeFolderName('main', 1, '崛起'); // "第01卷-崛起"
 * generateVolumeFolderName('prequel', -1, '起源'); // "前传01-起源"
 * generateVolumeFolderName('sequel', 1001, '余波'); // "后传01-余波"
 * ```
 */
export function generateVolumeFolderName(
    volumeType: VolumeType,
    volumeNumber: number,
    volumeTitle: string
): string {
    const configService = ConfigService.getInstance();
    const volumesConfig = configService.getVolumesConfig();

    // 根据卷类型调整编号显示和前缀
    let displayNumber = volumeNumber;
    let prefix = '';

    switch (volumeType) {
        case 'prequel':
            prefix = VOLUME_TYPE_NAMES.prequel;
            // 前传使用负数编号，需要转换为正数显示
            displayNumber = Math.abs(volumeNumber);
            break;
        case 'sequel':
            prefix = VOLUME_TYPE_NAMES.sequel;
            // 后传使用 1000+ 编号，需要减去偏移量显示
            displayNumber = volumeNumber >= VOLUME_TYPE_OFFSETS.sequel
                ? volumeNumber - VOLUME_TYPE_OFFSETS.sequel
                : volumeNumber;
            break;
        case 'extra':
            prefix = VOLUME_TYPE_NAMES.extra;
            // 番外使用 2000+ 编号，需要减去偏移量显示
            displayNumber = volumeNumber >= VOLUME_TYPE_OFFSETS.extra
                ? volumeNumber - VOLUME_TYPE_OFFSETS.extra
                : volumeNumber;
            break;
        case 'main':
        default:
            prefix = '第';
            break;
    }

    // 根据配置的编号格式生成序号字符串
    let numberStr = '';
    if (volumesConfig.numberFormat === 'chinese') {
        numberStr = convertToChineseNumber(displayNumber);
    } else if (volumesConfig.numberFormat === 'roman') {
        numberStr = convertToRomanNumber(displayNumber);
    } else {
        // arabic (default)
        numberStr = String(displayNumber).padStart(2, '0');
    }

    // 组合文件夹名称
    if (volumeType === 'main') {
        return `${prefix}${numberStr}卷-${volumeTitle}`;
    } else {
        return `${prefix}${numberStr}-${volumeTitle}`;
    }
}

/**
 * 转换为罗马数字
 * 支持 1-50 的罗马数字，超出范围返回阿拉伯数字
 *
 * @param num 数字
 * @returns 罗马数字字符串，超出范围则返回补零的阿拉伯数字
 *
 * @example
 * ```typescript
 * convertToRomanNumber(1);  // "I"
 * convertToRomanNumber(4);  // "IV"
 * convertToRomanNumber(10); // "X"
 * convertToRomanNumber(49); // "XLIX"
 * convertToRomanNumber(51); // "51" (超出范围，返回阿拉伯数字)
 * ```
 */
export function convertToRomanNumber(num: number): string {
    // 超出支持范围，回退到阿拉伯数字
    if (num < 1 || num > 50) {
        return String(num).padStart(2, '0');
    }

    const romanNumerals: [number, string][] = [
        [50, 'L'], [40, 'XL'],
        [10, 'X'], [9, 'IX'],
        [5, 'V'], [4, 'IV'],
        [1, 'I']
    ];

    let result = '';
    for (const [value, numeral] of romanNumerals) {
        while (num >= value) {
            result += numeral;
            num -= value;
        }
    }
    return result;
}

/**
 * 获取卷状态的中文名称
 *
 * @param status 状态代码
 * @returns 中文状态名称
 */
export function getVolumeStatusName(status: string): string {
    const statusNames: Record<string, string> = {
        'planning': '计划中',
        'writing': '创作中',
        'completed': '已完成'
    };
    return statusNames[status] || status;
}

/**
 * 获取卷类型的中文名称
 *
 * @param type 类型代码
 * @returns 中文类型名称
 */
export function getVolumeTypeName(type: string): string {
    return VOLUME_TYPE_NAMES[type as VolumeType] || type;
}
