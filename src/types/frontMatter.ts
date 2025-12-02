/**
 * Front Matter 类型定义
 */

/**
 * 章节 Front Matter 接口
 */
export interface ChapterFrontMatter {
    title: string;
    chapter: number;
    wordCount: number;
    targetWords: number;
    characters: string[];
    locations: string[];
    tags: string[];
    created: string;
    modified: string;
    status: string;
}

/**
 * 人物 Front Matter 接口
 */
export interface CharacterFrontMatter {
    gender: string;
    age: string;
    appearance: string;
    personality: string;
    background: string;
    relationships: string[];
    abilities: string[];
    importance: string;
    firstAppearance: string;
    tags: string[];
}

/**
 * 通用 Front Matter（用于未知类型）
 */
export type GenericFrontMatter = Record<string, any>;
