// 模板配置类型定义

export interface ChapterFrontMatter {
    wordCount: number;
    targetWords: number;
    characters: string[];
    locations: string[];
    tags: string[];
    status: string;
}

export interface ChapterTemplate {
    frontMatter: ChapterFrontMatter;
    statusOptions: string[];
    content: string;
}

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

export interface CharacterTemplate {
    frontMatter: CharacterFrontMatter;
    importanceOptions: string[];
    content: string;
}

export interface OutlineTemplate {
    content: string;
}

export interface ReadmeTemplate {
    content: string;
}

export interface Templates {
    chapter: ChapterTemplate;
    character: CharacterTemplate;
    outline: OutlineTemplate;
    readme: ReadmeTemplate;
}
