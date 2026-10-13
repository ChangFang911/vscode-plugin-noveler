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
import { fileExists, documentIO } from '../utils/documentOperations';

/**
 * 分卷管理服务
 * 负责识别、解析和管理小说的分卷结构
 */
export class VolumeService {
    private static instance?: VolumeService;
    private volumes: VolumeInfo[] = [];
    private configService: ConfigService;
    private cacheTimestamp = 0;
    private fileWatcher?: vscode.FileSystemWatcher;
    private static readonly CACHE_TTL = 30 * 1000; // 缓存有效期：30 秒

    private constructor() {
        this.configService = ConfigService.getInstance();
        this.setupFileWatcher();
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
     * 设置文件监听器，当 chapters 目录变化时失效缓存
     */
    private setupFileWatcher(): void {
        const workspaceFolder = documentIO.workspaceFolder();
        if (!workspaceFolder) {
            return;
        }

        const pattern = new vscode.RelativePattern(workspaceFolder, 'chapters/**');
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        const invalidateCache = () => {
            this.cacheTimestamp = 0; // 失效缓存
            Logger.debug('VolumeService: 缓存已失效');
        };

        this.fileWatcher.onDidCreate(invalidateCache);
        this.fileWatcher.onDidDelete(invalidateCache);
        this.fileWatcher.onDidChange(invalidateCache);
    }

    /**
     * 扫描并识别所有卷
     * 根据配置的文件夹结构类型进行扫描
     * 使用缓存机制避免频繁扫描
     */
    public async scanVolumes(forceRefresh = false): Promise<VolumeInfo[]> {
        const now = Date.now();

        // 如果缓存有效且不强制刷新，直接返回缓存
        if (!forceRefresh && this.volumes.length > 0 && (now - this.cacheTimestamp) < VolumeService.CACHE_TTL) {
            return this.volumes;
        }

        const workspaceFolder = documentIO.workspaceFolder();
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

        // 更新缓存时间戳
        this.cacheTimestamp = Date.now();

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
     * 解析中文整数
     */
    private parseChineseNumber(chinese: string): number {
        if (!/^[零一二三四五六七八九十百千万亿兆]+$/.test(chinese)) { return 1; }
        for (const [unit, value] of [['兆', 1e12], ['亿', 1e8], ['万', 1e4]] as const) {
            const index = chinese.indexOf(unit);
            if (index !== -1) {
                const left = chinese.slice(0, index);
                const right = chinese.slice(index + 1);
                return (left ? this.parseChineseNumber(left) : 1) * value
                    + (right ? this.parseChineseNumber(right) : 0);
            }
        }
        const digits = '零一二三四五六七八九';
        const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
        let result = 0;
        let digit = 0;
        for (const char of chinese) {
            if (units[char]) {
                result += (digit || 1) * units[char];
                digit = 0;
            } else {
                digit = digits.indexOf(char);
            }
        }
        return result + digit;
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
     * 根据配置的章节编号模式（global/volume/mixed）读取最大章号并追加
     * @param targetVolume 目标卷（如果是在卷中创建章节）
     * @returns 下一个章节号
     */
    public async calculateNextChapterNumber(targetVolume?: VolumeInfo): Promise<number> {
        const config = this.configService.getVolumesConfig();
        if (!config.enabled || !targetVolume) {
            const root = documentIO.workspaceFolder()?.uri;
            return root ? this.nextNumberInFolders([vscode.Uri.joinPath(root, 'chapters')]) : 1;
        }
        await this.scanVolumes(true);
        const current = this.volumes.find(volume => volume.folderPath === targetVolume.folderPath);
        if (!current) { throw new Error('目标卷已不存在，请刷新后重试'); }
        let volumes = [current];
        if (config.chapterNumbering === 'global') {
            volumes = this.volumes;
        } else if (config.chapterNumbering === 'mixed' && current.volumeType === 'main') {
            volumes = this.volumes.filter(volume => volume.volumeType === 'main');
        }
        return this.nextNumberInFolders(volumes.map(volume => vscode.Uri.file(volume.folderPath)));
    }

    private async nextNumberInFolders(folders: vscode.Uri[]): Promise<number> {
        let maximum = 0;
        for (const folder of folders) {
            if (!await fileExists(folder)) { continue; }
            const files = await vscode.workspace.fs.readDirectory(folder);
            for (const [name, type] of files) {
                if (type !== vscode.FileType.File || !name.endsWith('.md')) { continue; }
                const match = name.match(/^第(.+?)章[-_]/) || name.match(/^(\d+)-/);
                const filenameNumber = match ? (/^[IVXLCDM]+$/.test(match[1])
                    ? this.parseRomanNumber(match[1]) : this.parseNumber(match[1])) : 0;
                const uri = vscode.Uri.joinPath(folder, name);
                const open = vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
                const text = open?.getText() ?? Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
                const chapter = parseFrontMatter(text).data.chapter;
                const metadataNumber = typeof chapter === 'number' && Number.isSafeInteger(chapter) && chapter > 0 ? chapter : 0;
                maximum = Math.max(maximum, filenameNumber, metadataNumber);
            }
        }
        if (!Number.isSafeInteger(maximum + 1)) { throw new Error('章节号超出安全范围'); }
        return maximum + 1;
    }

    /**
     * 失效缓存，强制下次扫描重新读取
     */
    public invalidateCache(): void {
        this.cacheTimestamp = 0;
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        this.fileWatcher?.dispose();
    }
}
