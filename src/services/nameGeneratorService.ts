import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 中文姓名风格
 */
export type ChineseNameStyle = 'modern' | 'classic' | 'fantasy';

/**
 * 性别选项
 */
export type Gender = 'male' | 'female' | 'random';

/**
 * 姓名生成服务
 * 支持多种风格的姓名生成：中文、英文、日文、西幻、玄幻
 */
export class NameGeneratorService {
    private static instance: NameGeneratorService;

    private chineseSurnames: {
        common: string[];
        classic: string[];
        fantasy: string[];
    } | null = null;

    private chineseGivenNames: {
        modern: { male: string[]; female: string[] };
        classic: { single: string[]; double: string[] };
        fantasy: { prefix: string[]; suffix: string[] };
    } | null = null;

    private englishNames: {
        firstNames: { male: string[]; female: string[] };
        lastNames: string[];
    } | null = null;

    private japaneseNames: {
        surnames: string[];
        givenNames: { male: string[]; female: string[] };
    } | null = null;

    private fantasySyllables: {
        consonants: string[];
        vowels: string[];
        patterns: string[];
    } | null = null;

    private westernFantasyNames: {
        firstNames: { male: string[]; female: string[] };
        lastNames: string[];
        titles: string[];
    } | null = null;

    private dataDir: string;

    private constructor(extensionContext: vscode.ExtensionContext) {
        this.dataDir = path.join(extensionContext.extensionPath, 'src', 'data');
    }

    /**
     * 初始化服务实例
     */
    public static initialize(context: vscode.ExtensionContext): NameGeneratorService {
        if (!NameGeneratorService.instance) {
            NameGeneratorService.instance = new NameGeneratorService(context);
        }
        return NameGeneratorService.instance;
    }

    /**
     * 获取服务实例
     */
    public static getInstance(): NameGeneratorService {
        if (!NameGeneratorService.instance) {
            throw new Error('NameGeneratorService not initialized');
        }
        return NameGeneratorService.instance;
    }

    /**
     * 懒加载中文姓氏库
     */
    private async loadChineseSurnames() {
        if (this.chineseSurnames) {
            return;
        }

        try {
            const filePath = path.join(this.dataDir, 'chinese-surnames.json');
            const content = await fs.promises.readFile(filePath, 'utf-8');
            this.chineseSurnames = JSON.parse(content);
        } catch (error) {
            throw new Error(`加载中文姓氏数据失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 懒加载中文名字库
     */
    private async loadChineseGivenNames() {
        if (this.chineseGivenNames) {
            return;
        }

        try {
            const filePath = path.join(this.dataDir, 'chinese-given-names.json');
            const content = await fs.promises.readFile(filePath, 'utf-8');
            this.chineseGivenNames = JSON.parse(content);
        } catch (error) {
            throw new Error(`加载中文名字数据失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 懒加载日文姓名库
     */
    private async loadJapaneseNames() {
        if (this.japaneseNames) {
            return;
        }

        try {
            const filePath = path.join(this.dataDir, 'japanese-names.json');
            const content = await fs.promises.readFile(filePath, 'utf-8');
            this.japaneseNames = JSON.parse(content);
        } catch (error) {
            throw new Error(`加载日文姓名数据失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 懒加载英文姓名库
     */
    private async loadEnglishNames() {
        if (this.englishNames) {
            return;
        }

        try {
            const filePath = path.join(this.dataDir, 'english-names.json');
            const content = await fs.promises.readFile(filePath, 'utf-8');
            this.englishNames = JSON.parse(content);
        } catch (error) {
            throw new Error(`加载英文姓名数据失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 懒加载玄幻音节库
     */
    private async loadFantasySyllables() {
        if (this.fantasySyllables) {
            return;
        }

        try {
            const filePath = path.join(this.dataDir, 'fantasy-syllables.json');
            const content = await fs.promises.readFile(filePath, 'utf-8');
            this.fantasySyllables = JSON.parse(content);
        } catch (error) {
            throw new Error(`加载玄幻音节数据失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 懒加载西幻姓名库
     */
    private async loadWesternFantasyNames() {
        if (this.westernFantasyNames) {
            return;
        }

        try {
            const filePath = path.join(this.dataDir, 'western-fantasy-names.json');
            const content = await fs.promises.readFile(filePath, 'utf-8');
            this.westernFantasyNames = JSON.parse(content);
        } catch (error) {
            throw new Error(`加载西幻姓名数据失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 从数组中随机选择一个元素
     */
    private randomPick<T>(array: T[]): T {
        return array[Math.floor(Math.random() * array.length)];
    }

    /**
     * 随机选择性别
     */
    private randomGender(): 'male' | 'female' {
        return Math.random() > 0.5 ? 'male' : 'female';
    }

    /**
     * 生成中文姓名
     * @param style 风格：modern | classic | fantasy
     * @param count 生成数量
     * @returns 姓名数组
     */
    public async generateChineseName(
        style: ChineseNameStyle,
        count: number = 10
    ): Promise<string[]> {
        await this.loadChineseSurnames();
        await this.loadChineseGivenNames();

        const names = new Set<string>();
        const maxAttempts = count * 20;
        let attempts = 0;

        while (names.size < count && attempts < maxAttempts) {
            attempts++;
            let name: string;

            switch (style) {
                case 'modern':
                    name = this.generateModernChineseName();
                    break;
                case 'classic':
                    name = this.generateClassicChineseName();
                    break;
                case 'fantasy':
                    name = this.generateFantasyChineseName();
                    break;
            }

            names.add(name);
        }

        return Array.from(names);
    }

    /**
     * 生成现代中文姓名
     */
    private generateModernChineseName(): string {
        const surname = this.randomPick(this.chineseSurnames!.common);
        const gender = this.randomGender();
        const givenName = this.randomPick(this.chineseGivenNames!.modern[gender]);
        return surname + givenName;
    }

    /**
     * 生成古典中文姓名
     */
    private generateClassicChineseName(): string {
        // 70% 常见姓氏, 30% 复姓
        const useCommon = Math.random() > 0.3;
        const surname = useCommon
            ? this.randomPick(this.chineseSurnames!.common)
            : this.randomPick(this.chineseSurnames!.classic);

        // 60% 双字名, 40% 单字名
        const useDouble = Math.random() > 0.4;
        const givenName = useDouble
            ? this.randomPick(this.chineseGivenNames!.classic.double)
            : this.randomPick(this.chineseGivenNames!.classic.single);

        return surname + givenName;
    }

    /**
     * 生成玄幻中文姓名
     */
    private generateFantasyChineseName(): string {
        // 混合使用玄幻姓氏和复姓
        const surnamePool = [
            ...this.chineseSurnames!.fantasy,
            ...this.chineseSurnames!.classic
        ];
        const surname = this.randomPick(surnamePool);

        // 70% 使用单个字（前缀或后缀），30% 使用前缀+后缀
        const useSingle = Math.random() > 0.3;

        if (useSingle) {
            // 随机选择使用前缀或后缀
            const usePrefix = Math.random() > 0.5;
            const givenName = usePrefix
                ? this.randomPick(this.chineseGivenNames!.fantasy.prefix)
                : this.randomPick(this.chineseGivenNames!.fantasy.suffix);
            return surname + givenName;
        } else {
            // 使用前缀+后缀
            const prefix = this.randomPick(this.chineseGivenNames!.fantasy.prefix);
            const suffix = this.randomPick(this.chineseGivenNames!.fantasy.suffix);
            return surname + prefix + suffix;
        }
    }

    /**
     * 生成英文姓名
     * @param gender 性别：male | female | random
     * @param count 生成数量
     * @returns 姓名数组
     */
    public async generateEnglishName(
        gender: Gender = 'random',
        count: number = 10
    ): Promise<string[]> {
        await this.loadEnglishNames();

        const names = new Set<string>();
        const maxAttempts = count * 20;
        let attempts = 0;

        while (names.size < count && attempts < maxAttempts) {
            attempts++;
            const selectedGender = gender === 'random' ? this.randomGender() : gender;

            const firstName = this.randomPick(this.englishNames!.firstNames[selectedGender]);
            const lastName = this.randomPick(this.englishNames!.lastNames);

            names.add(`${firstName} ${lastName}`);
        }

        return Array.from(names);
    }

    /**
     * 生成日文姓名
     * @param gender 性别：male | female | random
     * @param count 生成数量
     * @returns 姓名数组
     */
    public async generateJapaneseName(
        gender: Gender = 'random',
        count: number = 10
    ): Promise<string[]> {
        await this.loadJapaneseNames();

        const names = new Set<string>();
        const maxAttempts = count * 20;
        let attempts = 0;

        while (names.size < count && attempts < maxAttempts) {
            attempts++;
            const surname = this.randomPick(this.japaneseNames!.surnames);

            const selectedGender = gender === 'random' ? this.randomGender() : gender;
            const givenName = this.randomPick(this.japaneseNames!.givenNames[selectedGender]);

            names.add(surname + givenName);
        }

        return Array.from(names);
    }

    /**
     * 生成玄幻/虚构姓名
     * @param syllableCount 音节长度（2-4）
     * @param count 生成数量
     * @returns 姓名数组
     */
    public async generateFantasyName(
        syllableCount: number = 3,
        count: number = 10
    ): Promise<string[]> {
        await this.loadFantasySyllables();

        const names = new Set<string>();
        const maxAttempts = count * 20;
        let attempts = 0;

        // 限制音节数量在 2-4 之间
        const validSyllableCount = Math.max(2, Math.min(4, syllableCount));

        while (names.size < count && attempts < maxAttempts) {
            attempts++;
            const syllables: string[] = [];

            for (let i = 0; i < validSyllableCount; i++) {
                const pattern = this.randomPick(this.fantasySyllables!.patterns);

                // 使用全局替换确保所有占位符都被替换
                let syllable = pattern
                    .replace(/{consonant}/g, this.randomPick(this.fantasySyllables!.consonants))
                    .replace(/{vowel}/g, this.randomPick(this.fantasySyllables!.vowels));

                syllables.push(syllable);
            }

            // 首字母大写
            const name = syllables.join('');
            const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);

            names.add(capitalizedName);
        }

        return Array.from(names);
    }

    /**
     * 生成西幻姓名（翻译腔）
     * @param gender 性别：male | female | random
     * @param count 生成数量
     * @returns 姓名数组
     */
    public async generateWesternFantasyName(
        gender: Gender = 'random',
        count = 10
    ): Promise<string[]> {
        await this.loadWesternFantasyNames();

        const names = new Set<string>();
        const maxAttempts = count * 20;
        let attempts = 0;

        while (names.size < count && attempts < maxAttempts) {
            attempts++;
            const selectedGender = gender === 'random' ? this.randomGender() : gender;

            const firstName = this.randomPick(this.westernFantasyNames!.firstNames[selectedGender]);
            const lastName = this.randomPick(this.westernFantasyNames!.lastNames);

            names.add(`${firstName}·${lastName}`);
        }

        return Array.from(names);
    }
}
