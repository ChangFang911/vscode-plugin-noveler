/**
 * 敏感词检测相关类型定义
 */

/**
 * 敏感词级别
 */
export type SensitiveLevel = 'high' | 'medium' | 'low';

/**
 * 检测匹配结果
 */
export interface SensitiveMatch {
    /** 匹配到的词 */
    word: string;
    /** 起始位置 */
    start: number;
    /** 结束位置 */
    end: number;
    /** 敏感词级别 */
    level: SensitiveLevel;
    /** 是否在白名单中 */
    inWhitelist: boolean;
}

/**
 * 词库元数据
 */
export interface WordLibraryMetadata {
    /** 版本号 */
    version: string;
    /** 总词数 */
    totalWords: number;
    /** 最后更新时间 */
    lastUpdate: string;
    /** 各级别词数 */
    levels: Record<SensitiveLevel, number>;
    /** 描述 */
    description: string;
    /** 许可证 */
    license: string;
}

/**
 * 词库文件格式
 */
export interface WordLibraryFile {
    /** 级别 */
    level: SensitiveLevel;
    /** 描述 */
    description: string;
    /** 总词数 */
    totalWords: number;
    /** 词汇列表 */
    words: string[];
}

/**
 * 自定义词库文件格式（黑名单/白名单）
 */
export interface CustomWordLibrary {
    /** 描述 */
    description: string;
    /** 词汇列表 */
    words: string[];
}


/**
 * 敏感词配置
 */
export interface SensitiveWordConfig {
    /** 是否启用 */
    enabled: boolean;
    /** 内置词库配置 */
    builtInLibrary?: {
        /** 是否启用内置词库 */
        enabled: boolean;
        /** 级别配置 */
        levels: Record<SensitiveLevel, boolean>;
    };
    /** 自定义敏感词库配置 */
    customLibrary?: {
        /** 是否启用 */
        enabled: boolean;
        /** 文件路径 */
        path: string;
    };
    /** 白名单配置 */
    whitelist?: {
        /** 是否启用 */
        enabled: boolean;
        /** 文件路径 */
        path: string;
    };
    /** 输入时检测 */
    checkOnType?: boolean;
    /** 保存时检测 */
    checkOnSave?: boolean;
    /** 显示配置 */
    display?: {
        severity: 'Error' | 'Warning' | 'Information';
        showInProblems: boolean;
        showWordCount: boolean;
    };
    // 兼容旧版配置
    /** @deprecated 已废弃，使用 builtInLibrary.levels */
    levels?: Record<SensitiveLevel, boolean>;
    /** @deprecated 已废弃，使用 whitelist */
    customWords?: {
        enabled: boolean;
        blacklistPath: string;
        whitelistPath: string;
    };
}
