/**
 * 目录配置接口
 * 允许用户自定义小说项目的目录名称
 */
export interface DirectoriesConfig {
    /** 章节目录名，默认为 "chapters" */
    chapters?: string;
    /** 人物目录名，默认为 "characters" */
    characters?: string;
    /** 草稿目录名，默认为 "drafts" */
    drafts?: string;
    /** 参考资料目录名，默认为 "references" */
    references?: string;
}
