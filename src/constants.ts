/**
 * 全局常量定义
 */

import type { VolumeType } from './types/config';

// ==================== 性能相关 ====================

/** 字数统计防抖延迟（毫秒） */
export const WORD_COUNT_DEBOUNCE_DELAY = 300;

/** 高亮更新防抖延迟（毫秒） */
export const HIGHLIGHT_DEBOUNCE_DELAY = 500;

/** README 更新防抖延迟（毫秒） */
export const README_UPDATE_DEBOUNCE_DELAY = 5000;

// ==================== 正则表达式 ====================

/** 对话引号匹配正则 */
export const DIALOGUE_REGEX = /「[^」]*」|"[^"]*"|"[^"]*"|'[^']*'|"[^"]*"|\u201c[^\u201d]*\u201d|\u2018[^\u2019]*\u2019/g;

/** 心理描写匹配正则（全角括号） */
export const THOUGHT_REGEX = /（[^）]*）/g;

/** 省略号匹配正则 */
export const ELLIPSIS_REGEX = /…+|\.{3,}/g;

/** HTML 注释匹配正则 */
export const HTML_COMMENT_REGEX = /<!--[\s\S]*?-->/g;

/** Markdown 标题标记匹配正则 */
export const MARKDOWN_HEADER_REGEX = /^#+\s+/gm;

/** 中文字符（含标点）匹配正则 */
export const CHINESE_CHARS_REGEX = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g;

/** 英文单词匹配正则 */
export const ENGLISH_WORD_REGEX = /\b[a-zA-Z]+\b/g;

// ==================== 文件路径 ====================

/** 配置文件名 */
export const CONFIG_FILE_NAME = 'novel.jsonc';

/** 默认配置模板路径 */
export const DEFAULT_CONFIG_TEMPLATE_PATH = 'templates/default-config.jsonc';

/** 章节目录名 */
export const CHAPTERS_FOLDER = 'chapters';

/** 人物目录名 */
export const CHARACTERS_FOLDER = 'characters';

/** 草稿目录名 */
export const DRAFTS_FOLDER = 'drafts';

/** 参考资料目录名 */
export const REFERENCES_FOLDER = 'references';

// ==================== 状态相关 ====================

/** 章节状态选项 */
export const CHAPTER_STATUS_OPTIONS = ['草稿', '初稿', '修改中', '已完成'] as const;

/** 人物重要性选项 */
export const CHARACTER_IMPORTANCE_OPTIONS = ['主角', '重要配角', '次要配角', '路人'] as const;

// ==================== 状态对应的 Emoji ====================

export const STATUS_EMOJI_MAP: Record<string, string> = {
    '草稿': '📝',
    '初稿': '✏️',
    '修改中': '🔧',
    '已完成': '✅',
    // 英文别名（兼容）
    'draft': '📝',
    'completed': '✅'
};

/** 重要性排序权重 */
export const IMPORTANCE_ORDER: Record<string, number> = {
    '主角': 1,
    '重要配角': 2,
    '次要配角': 3,
    '路人': 4
};

/** 完成状态的值（用于判断） */
export const COMPLETED_STATUS = '已完成';

/** 进行中状态的值 */
export const IN_PROGRESS_STATUS = '修改中';

// ==================== 项目目录结构 ====================

export const PROJECT_DIRECTORIES = [
    CHAPTERS_FOLDER,
    CHARACTERS_FOLDER,
    DRAFTS_FOLDER,
    REFERENCES_FOLDER
] as const;

// ==================== 文件命名和验证 ====================

/** 章节号填充位数（例如 01, 02, ...） */
export const CHAPTER_NUMBER_PADDING = 2;

/** 人物名称最大长度 */
export const MAX_CHARACTER_NAME_LENGTH = 50;

/** 章节名称最大长度 */
export const MAX_CHAPTER_NAME_LENGTH = 100;

// ==================== 自动保存配置 ====================

/** 自动保存延迟时间（毫秒） */
export const AUTO_SAVE_DELAY_MS = 1000;

// ==================== 分卷管理相关 ====================

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

/** 段落缩进字符（两个全角空格） */
export const PARAGRAPH_INDENT = '　　';

/** 配置版本 */
export const CURRENT_CONFIG_VERSION = '0.5.0';

/** 迁移相关常量 */
export const MIN_AVG_CHAPTERS_PER_VOLUME = 2;
export const MIN_VOLUME_COVERAGE_RATIO = 0.5; // 50% of chapters need volume info for smart migration

/** README 文件名 */
export const README_FILE_NAME = 'README.md';

/** 默认目标字数 */
export const DEFAULT_TARGET_WORDS = 2500;

/** 默认自动空行 */
export const DEFAULT_AUTO_EMPTY_LINE = true;

/** 默认段落缩进 */
export const DEFAULT_PARAGRAPH_INDENT = true;
