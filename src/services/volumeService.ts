import * as vscode from 'vscode';
import * as path from 'path';
import * as jsoncParser from 'jsonc-parser';
import { parseFrontMatter } from '../utils/frontMatterParser';
import { VolumeInfo, VolumeMetadata, VolumeType } from '../types/volume';
import { ConfigService } from './configService';
import { Logger } from '../utils/logger';
import { WordCountService } from './wordCountService';
import { getContentWithoutFrontMatter } from '../utils/frontMatterHelper';
import { VOLUME_TYPE_OFFSETS, MINIMUM_COMPLETED_WORD_COUNT } from '../constants';

/**
 * 分卷管理服务
 * 负责识别、解析和管理小说的分卷结构
 */
export class VolumeService {
    private static instance?: VolumeService;
    private volumes: VolumeInfo[] = [];
    private configService: ConfigService;

    private constructor() {
        this.configService = ConfigService.getInstance();
    }

    /**
     * 获取 VolumeService 单例实例
     */
    public static getInstance(): VolumeService {
        if (!VolumeService.instance) {
            VolumeService.instance = new VolumeService();
        }
        return VolumeService.instance;
    }

    /**
     * 扫描并识别所有卷
     * 根据配置的文件夹结构类型进行扫描
     */
    public async scanVolumes(): Promise<VolumeInfo[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const volumesConfig = this.configService.getVolumesConfig();

        // 如果未启用分卷功能，返回空数组
        if (!volumesConfig.enabled) {
            this.volumes = [];
            return [];
        }

        const chaptersPath = path.join(workspaceFolder.uri.fsPath, 'chapters');
        const chaptersUri = vscode.Uri.file(chaptersPath);

        // 检查 chapters 目录是否存在
        try {
            await vscode.workspace.fs.stat(chaptersUri);
        } catch {
            Logger.debug('chapters 目录不存在');
            return [];
        }

        // 根据文件夹结构类型扫描
        if (volumesConfig.folderStructure === 'nested') {
            this.volumes = await this.scanNestedVolumes(chaptersPath);
        } else {
            // flat 结构下，没有卷
            this.volumes = [];
        }

        // 对卷进行排序
        this.sortVolumes();

        Logger.debug(`扫描到 ${this.volumes.length} 个卷`);
        return this.volumes;
    }

    /**
     * 扫描嵌套结构的卷
     * chapters/ 下的每个子文件夹被视为一个卷
     */
    private async scanNestedVolumes(chaptersPath: string): Promise<VolumeInfo[]> {
        const volumes: VolumeInfo[] = [];

        try {
            const chaptersUri = vscode.Uri.file(chaptersPath);
            const entries = await vscode.workspace.fs.readDirectory(chaptersUri);

            for (const [name, type] of entries) {
                // 只处理文件夹
                if (type !== vscode.FileType.Directory) {
                    continue;
                }

                const folderPath = path.join(chaptersPath, name);
                const volumeInfo = await this.parseVolumeFolder(name, folderPath);

                if (volumeInfo) {
                    volumes.push(volumeInfo);
                }
            }
        } catch (error) {
            Logger.error('扫描卷文件夹失败', error);
        }

        // 按卷序号排序
        volumes.sort((a, b) => a.volume - b.volume);

        return volumes;
    }

    /**
     * 解析卷文件夹
     * 支持的命名格式：
     * - 第一卷-崛起
     * - 01-崛起
     * - Volume1-Rising
     * - 前传一-起源
     * - 后传一-余波
     * - 番外一-日常
     */
    private async parseVolumeFolder(folderName: string, folderPath: string): Promise<VolumeInfo | null> {
        // 解析卷序号和标题
        const parsed = this.parseVolumeName(folderName);
        if (!parsed) {
            Logger.warn(`无��解析卷文件夹名称: ${folderName}`);
            return null;
        }

        const { volume, volumeType, title } = parsed;

        // 读取卷元数据（如果存在）
        const metadata = await this.loadVolumeMetadata(folderPath);

        // 扫描章节文件
        const chapters = await this.scanChapters(folderPath);

        // 计算统计信息
        const stats = await this.calculateVolumeStats(folderPath, chapters);

        const volumeInfo: VolumeInfo = {
            volume,
            volumeType,
            title,
            folderName,
            folderPath,
            status: metadata?.status || 'writing',
            metadata,
            chapters,
            stats
        };

        return volumeInfo;
    }

    /**
     * 解析卷文件夹名称
     * 支持多种命名格式
     */
    private parseVolumeName(folderName: string): { volume: number; volumeType: VolumeType; title: string } | null {
        // 前传格式：前传一-起源, 前传1-起源, 前传I-起源
        const prequelMatch = folderName.match(/^前传([一二三四五六七八九十\d]+|[IVX]+)[-_](.+)$/);
        if (prequelMatch) {
            const volumeNum = this.parseNumber(prequelMatch[1]);
            return {
                volume: -volumeNum, // 前传使用负数编号
                volumeType: 'prequel',
                title: prequelMatch[2]
            };
        }

        // 后传格式：后传一-余波, 后传1-余波, 后传I-余波
        const sequelMatch = folderName.match(/^后传([一二三四五六七八九十\d]+|[IVX]+)[-_](.+)$/);
        if (sequelMatch) {
            const volumeNum = this.parseNumber(sequelMatch[1]);
            return {
                volume: VOLUME_TYPE_OFFSETS.sequel + volumeNum, // 后传使用 1000+ 编号
                volumeType: 'sequel',
                title: sequelMatch[2]
            };
        }

        // 番外格式：番外一-日常, 番外1-日常, 番外I-日常
        const extraMatch = folderName.match(/^番外([一二三四五六七八九十\d]+|[IVX]+)[-_](.+)$/);
        if (extraMatch) {
            const volumeNum = this.parseNumber(extraMatch[1]);
            return {
                volume: VOLUME_TYPE_OFFSETS.extra + volumeNum, // 番外使用 2000+ 编号
                volumeType: 'extra',
                title: extraMatch[2]
            };
        }

        // 正文格式：第一卷-崛起, 第1卷-崛起, 第I卷-崛起, Volume1-Rising, VolumeI-Rising
        const mainMatch = folderName.match(/^(?:第?([一二三四五六七八九十\d]+|[IVX]+)卷?|Volume(\d+|[IVX]+))[-_](.+)$/);
        if (mainMatch) {
            const volumeNum = this.parseNumber(mainMatch[1] || mainMatch[2]);
            return {
                volume: volumeNum,
                volumeType: 'main',
                title: mainMatch[3]
            };
        }

        // 纯数字格式：01-崛起, 1-崛起
        const numberMatch = folderName.match(/^(\d+)[-_](.+)$/);
        if (numberMatch) {
            return {
                volume: parseInt(numberMatch[1], 10),
                volumeType: 'main',
                title: numberMatch[2]
            };
        }

        return null;
    }

    /**
     * 解析数字（支持阿拉伯数字、中文数字、罗马数字）
     */
    private parseNumber(str: string): number {
        // 1. 尝试阿拉伯数字
        const arabicNum = parseInt(str, 10);
        if (!isNaN(arabicNum)) {
            return arabicNum;
        }

        // 2. 尝试罗马数字
        if (/^[IVX]+$/.test(str)) {
            return this.parseRomanNumber(str);
        }

        // 3. 尝试中文数字
        return this.parseChineseNumber(str);
    }

    /**
     * 解析罗马数字
     */
    private parseRomanNumber(roman: string): number {
        const romanMap: { [key: string]: number } = {
            'I': 1,
            'V': 5,
            'X': 10,
            'L': 50,
            'C': 100,
            'D': 500,
            'M': 1000
        };

        let result = 0;
        let prevValue = 0;

        // 从右往左遍历
        for (let i = roman.length - 1; i >= 0; i--) {
            const currentValue = romanMap[roman[i]] || 0;

            if (currentValue < prevValue) {
                // 减法规则：IV = 4, IX = 9
                result -= currentValue;
            } else {
                result += currentValue;
            }

            prevValue = currentValue;
        }

        return result || 1; // 默认返回 1
    }

    /**
     * 解析中文数字（支持 1-99）
     */
    private parseChineseNumber(chinese: string): number {
        // 基本数字映射
        const digitMap: { [key: string]: number } = {
            '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
            '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
            '十': 10
        };

        // 单个字符，直接返回
        if (chinese.length === 1) {
            return digitMap[chinese] || 1;
        }

        // 处理 "十" 开头的数字：十一 = 11, 十二 = 12
        if (chinese.startsWith('十')) {
            if (chinese.length === 1) {
                return 10;
            }
            const unit = digitMap[chinese[1]] || 0;
            return 10 + unit;
        }

        // 处理 "X十" 格式：二十 = 20, 三十 = 30
        if (chinese.includes('十')) {
            const parts = chinese.split('十');
            const tens = digitMap[parts[0]] || 0;
            const units = parts[1] ? (digitMap[parts[1]] || 0) : 0;
            return tens * 10 + units;
        }

        // 默认返回 1
        return digitMap[chinese] || 1;
    }

    /**
     * 加载卷元数据文件（volume.json）
     */
    private async loadVolumeMetadata(folderPath: string): Promise<VolumeMetadata | undefined> {
        const metadataPath = path.join(folderPath, 'volume.json');
        const metadataUri = vscode.Uri.file(metadataPath);

        try {
            await vscode.workspace.fs.stat(metadataUri);
        } catch {
            return undefined;
        }

        try {
            const contentBytes = await vscode.workspace.fs.readFile(metadataUri);
            const content = Buffer.from(contentBytes).toString('utf8');
            const metadata = jsoncParser.parse(content) as VolumeMetadata;
            return metadata;
        } catch (error) {
            Logger.warn(`读取卷元数据失败: ${metadataPath}`, error);
            return undefined;
        }
    }

    /**
     * 扫描卷文件夹中的章节文件
     */
    private async scanChapters(folderPath: string): Promise<string[]> {
        const chapters: string[] = [];

        try {
            const folderUri = vscode.Uri.file(folderPath);
            const entries = await vscode.workspace.fs.readDirectory(folderUri);

            for (const [name, type] of entries) {
                // 只处理 .md 文件，排除特殊文件
                if (type === vscode.FileType.File && name.endsWith('.md')) {
                    // 排除以下特殊文件：
                    // - outline.md (卷大纲)
                    // - README.md (说明文档)
                    // - volume.md (卷元信息)
                    const excludedFiles = ['outline.md', 'README.md', 'readme.md', 'volume.md', 'VOLUME.md'];

                    if (!excludedFiles.includes(name)) {
                        chapters.push(name);
                    }
                }
            }

            // 按章节号排序（从文件 frontmatter 中读取 chapter 字段）
            const chapterNumbers = await Promise.all(
                chapters.map(async (name) => ({
                    name,
                    number: await this.extractChapterNumber(path.join(folderPath, name))
                }))
            );

            chapterNumbers.sort((a, b) => {
                // 如果都有章节号，按章节号排序
                if (a.number && b.number) {
                    return a.number - b.number;
                }

                // 否则按文件名字母顺序排序
                return a.name.localeCompare(b.name);
            });

            return chapterNumbers.map(item => item.name);
        } catch (error) {
            Logger.error(`扫描章节文件失败: ${folderPath}`, error);
            return [];
        }
    }

    /**
     * 从章节文件中提取章节号（从 frontmatter 的 chapter 字段）
     */
    private async extractChapterNumber(chapterPath: string): Promise<number | null> {
        try {
            const chapterUri = vscode.Uri.file(chapterPath);
            const contentBytes = await vscode.workspace.fs.readFile(chapterUri);
            const content = Buffer.from(contentBytes).toString('utf8');
            const parsed = parseFrontMatter(content);
            const data = parsed.data as Record<string, unknown>;
            return data.chapter ? Number(data.chapter) : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * 计算卷的统计信息
     */
    private async calculateVolumeStats(folderPath: string, chapters: string[]): Promise<VolumeInfo['stats']> {
        let totalWords = 0;
        let completedChapters = 0;

        // 并行读取所有章节文件以提升性能
        const chapterStats = await Promise.all(
            chapters.map(async (chapter) => {
                const chapterPath = path.join(folderPath, chapter);
                try {
                    const chapterUri = vscode.Uri.file(chapterPath);
                    const contentBytes = await vscode.workspace.fs.readFile(chapterUri);
                    const content = Buffer.from(contentBytes).toString('utf8');

                    // 使用 WordCountService 统计字数（与侧边栏一致）
                    const contentWithoutFM = getContentWithoutFrontMatter({ getText: () => content } as vscode.TextDocument);
                    const wordCount = WordCountService.getSimpleWordCount(contentWithoutFM, true);

                    return { wordCount, isCompleted: wordCount > MINIMUM_COMPLETED_WORD_COUNT };
                } catch (error) {
                    Logger.warn(`读取章节文件失败: ${chapterPath}`, error);
                    return { wordCount: 0, isCompleted: false };
                }
            })
        );

        // 汇总统计数据
        for (const stat of chapterStats) {
            totalWords += stat.wordCount;
            if (stat.isCompleted) {
                completedChapters++;
            }
        }

        return {
            totalWords,
            chapterCount: chapters.length,
            completedChapters
        };
    }

    /**
     * 对卷进行排序
     * 排序规则：前传卷 → 正文卷 → 后传卷 → 番外卷
     * 同类型卷内部按序号排序
     */
    private sortVolumes(): void {
        this.volumes.sort((a, b) => {
            // 按卷类型分组权重
            const typeOrder: { [key in VolumeType]: number } = {
                'prequel': 1,
                'main': 2,
                'sequel': 3,
                'extra': 4
            };

            const typeOrderA = typeOrder[a.volumeType];
            const typeOrderB = typeOrder[b.volumeType];

            // 先按类型排序
            if (typeOrderA !== typeOrderB) {
                return typeOrderA - typeOrderB;
            }

            // 同类型内按序号排序
            return a.volume - b.volume;
        });
    }

    /**
     * 获取所有卷
     */
    public getVolumes(): VolumeInfo[] {
        return this.volumes;
    }

    /**
     * 根据卷序号��取卷信息
     */
    public getVolumeByNumber(volumeNumber: number): VolumeInfo | undefined {
        return this.volumes.find(v => v.volume === volumeNumber);
    }

    /**
     * 获取章节所属的卷
     */
    public getVolumeForChapter(chapterPath: string): VolumeInfo | undefined {
        for (const volume of this.volumes) {
            const chapterFileName = path.basename(chapterPath);
            if (volume.chapters.includes(chapterFileName)) {
                return volume;
            }
        }
        return undefined;
    }

    /**
     * 计算下一个章节号
     * 根据配置的章节编号模式（global/volume/hybrid）计算正确的章节号
     * @param targetVolume 目标卷（如果是在卷中创建章节）
     * @returns 下一个章节号
     */
    public async calculateNextChapterNumber(targetVolume?: VolumeInfo): Promise<number> {
        const volumesConfig = this.configService.getVolumesConfig();
        const chapterNumbering = volumesConfig.chapterNumbering || 'global';

        // 如果未启用分卷功能，使用扁平模式计算
        if (!volumesConfig.enabled || !targetVolume) {
            return this.calculateFlatChapterNumber();
        }

        switch (chapterNumbering) {
            case 'global':
                // 全局编号：统计所有卷的章节总数，按卷顺序累加
                return this.calculateGlobalChapterNumber(targetVolume);

            case 'volume':
                // 卷内编号：每卷独立编号，从 1 开始
                return targetVolume.chapters.length + 1;

            case 'mixed':
                // 混合编号：主线卷全局编号，其他卷独立编号
                if (targetVolume.volumeType === 'main') {
                    return this.calculateGlobalChapterNumber(targetVolume, 'main');
                } else {
                    return targetVolume.chapters.length + 1;
                }

            default:
                return targetVolume.chapters.length + 1;
        }
    }

    /**
     * 计算全局章节号
     * 统计目标卷之前所有卷的章节总数，加上当前卷的章节数 + 1
     * @param targetVolume 目标卷
     * @param filterType 可选的过滤类型（用于 hybrid 模式）
     */
    private calculateGlobalChapterNumber(targetVolume: VolumeInfo, filterType?: 'main'): number {
        let totalChapters = 0;

        // 按卷序号排序，统计目标卷之前的所有章节
        const sortedVolumes = [...this.volumes].sort((a, b) => a.volume - b.volume);

        for (const volume of sortedVolumes) {
            // 如果指定了过滤类型，只统计该类型的卷
            if (filterType && volume.volumeType !== filterType) {
                continue;
            }

            // 如果是目标卷，停止统计
            if (volume.volume === targetVolume.volume && volume.volumeType === targetVolume.volumeType) {
                break;
            }

            // 累加该卷的章节数
            totalChapters += volume.chapters.length;
        }

        // 返回总数 + 目标卷当前章节数 + 1
        return totalChapters + targetVolume.chapters.length + 1;
    }

    /**
     * 计算扁平模式下的章节号（未启用分卷时）
     * 扫描 chapters/ 目录中的所有 .md 文件，提取最大章节号
     */
    private async calculateFlatChapterNumber(): Promise<number> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return 1;
        }

        const chaptersPath = path.join(workspaceFolder.uri.fsPath, 'chapters');
        const chaptersUri = vscode.Uri.file(chaptersPath);

        // 检查 chapters 目录是否存在
        try {
            await vscode.workspace.fs.stat(chaptersUri);
        } catch {
            return 1;
        }

        try {
            const files = await vscode.workspace.fs.readDirectory(chaptersUri);
            const mdFiles = files
                .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'))
                .map(([name]) => name);

            // 从文件名中提取章节号（格式：第001章-xxx.md, 001-xxx.md）
            const chapterNumbers = mdFiles
                .map(name => {
                    // 尝试匹配 "第001章-" 格式
                    let match = name.match(/^第(\d+)章-/);
                    if (match) {
                        return parseInt(match[1], 10);
                    }
                    // 尝试匹配 "001-" 格式
                    match = name.match(/^(\d+)-/);
                    return match ? parseInt(match[1], 10) : 0;
                })
                .filter(num => num > 0);

            if (chapterNumbers.length > 0) {
                return Math.max(...chapterNumbers) + 1;
            }
        } catch (error) {
            Logger.warn('扫描扁平章节目录失败', error);
        }

        return 1;
    }
}
