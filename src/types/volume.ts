/**
 * 分卷相关类型定义
 */

/**
 * 卷类型
 */
export type VolumeType = 'main' | 'prequel' | 'sequel' | 'extra';

/**
 * 卷状态
 */
export type VolumeStatus = 'planning' | 'writing' | 'completed';

/**
 * 卷编号格式
 */
export type VolumeNumberFormat = 'arabic' | 'chinese' | 'roman';

/**
 * 文件夹结构类型
 */
export type FolderStructureType = 'flat' | 'nested';

/**
 * 章节编号模式
 */
export type ChapterNumberingMode = 'global' | 'volume' | 'mixed';

/**
 * 卷配置（在 novel.jsonc 中）
 */
export interface VolumesConfig {
    /** 是否启用分卷功能 */
    enabled: boolean;

    /** 文件夹结构类型 */
    folderStructure: FolderStructureType;

    /** 卷编号格式 */
    numberFormat: VolumeNumberFormat;

    /** 章节编号模式 */
    chapterNumbering: ChapterNumberingMode;
}

/**
 * 卷元数据（volume.json）
 */
export interface VolumeMetadata {
    /** 卷序号 */
    volume: number;

    /** 卷类型 */
    volumeType: VolumeType;

    /** 卷标题 */
    title: string;

    /** 副标题（可选） */
    subtitle?: string;

    /** 卷状态 */
    status: VolumeStatus;

    /** 目标字数（可选） */
    targetWords?: number;

    /** 卷简介（可选） */
    description?: string;

    /** 开始日期（可选） */
    startDate?: string;

    /** 结束日期（可选） */
    endDate?: string;

    /** 主题（可选） */
    theme?: string;

    /** 核心冲突（可选） */
    mainConflict?: string;
}

/**
 * 卷信息（运行时使用）
 */
export interface VolumeInfo {
    /** 卷序号 */
    volume: number;

    /** 卷类型 */
    volumeType: VolumeType;

    /** 卷标题 */
    title: string;

    /** 文件夹名称 */
    folderName: string;

    /** 文件夹路径 */
    folderPath: string;

    /** 卷状态 */
    status: VolumeStatus;

    /** 元数据（如果存在 volume.json） */
    metadata?: VolumeMetadata;

    /** 章节列表 */
    chapters: string[];

    /** 统计信息 */
    stats: {
        /** 总字数 */
        totalWords: number;

        /** 章节数量 */
        chapterCount: number;

        /** 完成章节数 */
        completedChapters: number;
    };
}
