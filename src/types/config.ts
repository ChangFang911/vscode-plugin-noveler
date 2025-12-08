/**
 * 小说项目配置类型定义
 */

/**
 * 卷类型
 */
export type VolumeType = 'main' | 'prequel' | 'sequel' | 'extra';

/**
 * 章节编号模式
 */
export type ChapterNumberingMode = 'global' | 'volume' | 'mixed';

/**
 * 数字格式
 */
export type NumberFormat = 'chinese' | 'arabic' | 'roman';

/**
 * 小说配置接口
 */
export interface NovelConfig {
    version: string;
    novel: {
        title: string;
        author: string;
        description?: string;
        genre?: string;
        tags?: string[];
        created?: string;
        modified?: string;
    };
    structure: {
        useVolumeStructure: boolean;
        chapterNumberingMode: ChapterNumberingMode;
        numberFormat: NumberFormat;
    };
    defaults: {
        targetWords: number;
        autoEmptyLine: boolean;
        paragraphIndent: boolean;
    };
    output?: {
        outputDir?: string;
        formats?: string[];
    };
    noveler?: NovelerConfig;
}

/**
 * Noveler 扩展配置接口
 */
export interface NovelerConfig {
    targetWords?: number;
    highlight?: unknown;
    format?: unknown;
    wordCount?: unknown;
    autoUpdateReadmeOnCreate?: boolean;
    autoEmptyLine?: { value: boolean };
    paragraphIndent?: { value: boolean };
    autoSave?: unknown;
    sensitiveWords?: SensitiveWordsConfig;
    volumes?: VolumesConfig;
    characters?: unknown;
}

/**
 * 敏感词配置接口
 */
export interface SensitiveWordsConfig {
    enabled: boolean;
    builtInLibrary: {
        enabled: boolean;
        levels: {
            high: boolean;
            medium: boolean;
            low: boolean;
        };
    };
    customLibrary: {
        enabled: boolean;
        path: string;
    };
    whitelist: {
        enabled: boolean;
        path: string;
    };
    checkOnType: boolean;
    checkOnSave: boolean;
    display: {
        severity: string;
        showInProblems: boolean;
        showWordCount: boolean;
    };
}

/**
 * 分卷配置接口
 */
export interface VolumesConfig {
    enabled: boolean;
    folderStructure: 'flat' | 'nested';
    numberFormat: NumberFormat;
    chapterNumbering: ChapterNumberingMode;
}

/**
 * 部分配置类型（用于迁移过程中的配置更新）
 */
export type PartialNovelConfig = Partial<NovelConfig> & {
    version?: string;
    noveler?: Partial<NovelerConfig>;
};

/**
 * 卷信息接口
 */
export interface VolumeInfo {
    volume: number;
    volumeType: VolumeType;
    volumeTitle: string;
    folderName: string;
    chapterCount: number;
}

/**
 * 章节前置信息接口
 */
export interface ChapterFrontMatter {
    title: string;
    chapter: number;
    volume?: number;
    volumeType?: VolumeType;
    wordCount?: number;
    targetWords?: number;
    status?: string;
    created?: string;
    modified?: string;
    characters?: string[];
    locations?: string[];
    tags?: string[];
}

/**
 * 解析后的文件内容
 */
export interface ParsedFile {
    data: ChapterFrontMatter;
    content: string;
}

/**
 * 类型守卫：检查是否为有效的卷类型
 */
export function isValidVolumeType(type: unknown): type is VolumeType {
    return typeof type === 'string' && ['main', 'prequel', 'sequel', 'extra'].includes(type);
}

/**
 * 类型守卫：检查是否为有效的章节编号模式
 */
export function isValidChapterNumberingMode(mode: unknown): mode is ChapterNumberingMode {
    return typeof mode === 'string' && ['global', 'volume', 'mixed'].includes(mode);
}

/**
 * 类型守卫：检查是否为有效的数字格式
 */
export function isValidNumberFormat(format: unknown): format is NumberFormat {
    return typeof format === 'string' && ['chinese', 'arabic', 'roman'].includes(format);
}

/**
 * 类型守卫：检查是否为有效的小说配置
 */
export function isValidNovelConfig(config: unknown): config is NovelConfig {
    if (!config || typeof config !== 'object') {
        return false;
    }

    const c = config as Record<string, unknown>;

    // 检查必需字段
    if (!c.version || typeof c.version !== 'string') {
        return false;
    }

    if (!c.novel || typeof c.novel !== 'object') {
        return false;
    }

    const novel = c.novel as Record<string, unknown>;
    if (!novel.title || typeof novel.title !== 'string') {
        return false;
    }

    if (!novel.author || typeof novel.author !== 'string') {
        return false;
    }

    if (!c.structure || typeof c.structure !== 'object') {
        return false;
    }

    const structure = c.structure as Record<string, unknown>;
    if (typeof structure.useVolumeStructure !== 'boolean') {
        return false;
    }

    if (!isValidChapterNumberingMode(structure.chapterNumberingMode)) {
        return false;
    }

    if (!isValidNumberFormat(structure.numberFormat)) {
        return false;
    }

    if (!c.defaults || typeof c.defaults !== 'object') {
        return false;
    }

    const defaults = c.defaults as Record<string, unknown>;
    if (typeof defaults.targetWords !== 'number') {
        return false;
    }

    if (typeof defaults.autoEmptyLine !== 'boolean') {
        return false;
    }

    if (typeof defaults.paragraphIndent !== 'boolean') {
        return false;
    }

    return true;
}
