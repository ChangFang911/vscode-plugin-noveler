/**
 * 卷相关常量定义
 */

import { VolumeType } from '../types/config';

/**
 * 卷类型到编号偏移的映射
 * - 正传 (main): 从 1 开始 (1, 2, 3...)
 * - 前传 (prequel): 使用负数 (-1, -2, -3...)
 * - 后传 (sequel): 从 1000 开始 (1001, 1002, 1003...)
 * - 番外 (extra): 从 2000 开始 (2001, 2002, 2003...)
 */
export const VOLUME_TYPE_OFFSETS: Record<VolumeType, number> = {
    main: 0,        // 主线从 1 开始，基础偏移为 0
    prequel: 0,     // 前传使用负数，基础偏移为 0
    sequel: 1000,   // 后传基础偏移
    extra: 2000     // 番外基础偏移
};

/**
 * 卷类型到中文显示名称的映射
 */
export const VOLUME_TYPE_NAMES: Record<VolumeType, string> = {
    main: '正传',
    prequel: '前传',
    sequel: '后传',
    extra: '番外'
};

/**
 * 卷类型图标
 */
export const VOLUME_TYPE_ICONS: Record<VolumeType, string> = {
    main: '📖',
    prequel: '⏪',
    sequel: '⏩',
    extra: '✨'
};

/**
 * 默认配置值
 */
export const DEFAULT_TARGET_WORDS = 2500;
export const DEFAULT_AUTO_EMPTY_LINE = true;
export const DEFAULT_PARAGRAPH_INDENT = true;

/**
 * 文件名模板
 */
export const CONFIG_FILE_NAME = 'novel.jsonc';
export const README_FILE_NAME = 'README.md';
export const CHAPTERS_FOLDER_NAME = 'chapters';

/**
 * 段落缩进字符（两个全角空格）
 */
export const PARAGRAPH_INDENT = '　　';

/**
 * 配置版本
 */
export const CURRENT_CONFIG_VERSION = '0.5.0';

/**
 * 迁移相关常量
 */
export const MIN_AVG_CHAPTERS_PER_VOLUME = 2;
export const MIN_VOLUME_COVERAGE_RATIO = 0.5; // 50% of chapters need volume info for smart migration
