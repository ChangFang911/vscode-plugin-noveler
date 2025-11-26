/**
 * 全局常量定义
 */

// ==================== 性能相关 ====================

/** 字数统计防抖延迟（毫秒） */
export const WORD_COUNT_DEBOUNCE_DELAY = 300;

/** 高亮更新防抖延迟（毫秒） */
export const HIGHLIGHT_DEBOUNCE_DELAY = 500;

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
export const CONFIG_FILE_NAME = 'novel.json';

/** 默认配置模板路径 */
export const DEFAULT_CONFIG_TEMPLATE_PATH = 'templates/default-config.json';

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
    '已完成': '✅'
};

// ==================== 项目目录结构 ====================

export const PROJECT_DIRECTORIES = [
    CHAPTERS_FOLDER,
    CHARACTERS_FOLDER,
    DRAFTS_FOLDER,
    REFERENCES_FOLDER
] as const;
