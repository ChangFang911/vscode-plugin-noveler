/**
 * 随机起名功能测试脚本
 * 运行: node test-name-generator.js
 */

// 模拟 vscode 模块
const vscode = {
    Uri: class {
        static joinPath(base, ...paths) {
            return { fsPath: paths.join('/') };
        }
    }
};

// 模拟 extension context
const mockContext = {
    extensionPath: __dirname
};

// 导入服务
const path = require('path');
const fs = require('fs');

// 手动实现简化版服务测试
class TestNameGenerator {
    constructor() {
        this.dataDir = path.join(__dirname, 'src', 'data');
    }

    async loadData(filename) {
        const filePath = path.join(this.dataDir, filename);
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    }

    randomPick(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    async testChineseName() {
        console.log('\n=== 测试中文姓名生成 ===');

        const surnames = await this.loadData('chinese-surnames.json');
        const givenNames = await this.loadData('chinese-given-names.json');

        // 现代风格
        console.log('\n现代风格：');
        for (let i = 0; i < 5; i++) {
            const surname = this.randomPick(surnames.common);
            const gender = Math.random() > 0.5 ? 'male' : 'female';
            const givenName = this.randomPick(givenNames.modern[gender]);
            console.log(`  ${surname}${givenName}`);
        }

        // 古典风格
        console.log('\n古典风格：');
        for (let i = 0; i < 5; i++) {
            const surname = this.randomPick([...surnames.common, ...surnames.classic]);
            const givenName = Math.random() > 0.4
                ? this.randomPick(givenNames.classic.double)
                : this.randomPick(givenNames.classic.single);
            console.log(`  ${surname}${givenName}`);
        }

        // 奇幻风格
        console.log('\n玄幻风格：');
        for (let i = 0; i < 5; i++) {
            const surname = this.randomPick([...surnames.fantasy, ...surnames.classic]);
            const prefix = this.randomPick(givenNames.fantasy.prefix);
            const suffix = this.randomPick(givenNames.fantasy.suffix);
            console.log(`  ${surname}${prefix}${suffix}`);
        }
    }

    async testEnglishName() {
        console.log('\n=== 测试英文姓名生成 ===');

        const names = await this.loadData('english-names.json');

        console.log('\n随机英文姓名：');
        for (let i = 0; i < 10; i++) {
            const gender = Math.random() > 0.5 ? 'male' : 'female';
            const firstName = this.randomPick(names.firstNames[gender]);
            const lastName = this.randomPick(names.lastNames);
            console.log(`  ${firstName} ${lastName}`);
        }
    }

    async testJapaneseName() {
        console.log('\n=== 测试日文姓名生成 ===');

        const names = await this.loadData('japanese-names.json');

        console.log('\n日文姓名：');
        for (let i = 0; i < 10; i++) {
            const surname = this.randomPick(names.surnames);
            const gender = Math.random() > 0.5 ? 'male' : 'female';
            const givenName = this.randomPick(names.givenNames[gender]);
            console.log(`  ${surname}${givenName}`);
        }
    }

    async testFantasyName() {
        console.log('\n=== 测试玄幻姓名生成 ===');

        const syllables = await this.loadData('fantasy-syllables.json');

        console.log('\n玄幻姓名（3音节）：');
        for (let i = 0; i < 10; i++) {
            const parts = [];
            for (let j = 0; j < 3; j++) {
                const pattern = this.randomPick(syllables.patterns);
                const syllable = pattern
                    .replace(/{consonant}/g, this.randomPick(syllables.consonants))
                    .replace(/{vowel}/g, this.randomPick(syllables.vowels));
                parts.push(syllable);
            }
            const name = parts.join('');
            console.log(`  ${name.charAt(0).toUpperCase()}${name.slice(1)}`);
        }
    }

    async testWesternFantasyName() {
        console.log('\n=== 测试西幻姓名生成 ===');

        const names = await this.loadData('western-fantasy-names.json');

        console.log('\n西幻姓名：');
        for (let i = 0; i < 10; i++) {
            const gender = Math.random() > 0.5 ? 'male' : 'female';
            const firstName = this.randomPick(names.firstNames[gender]);
            const lastName = this.randomPick(names.lastNames);
            console.log(`  ${firstName}·${lastName}`);
        }
    }

    async runAllTests() {
        console.log('🎲 随机起名功能测试\n');
        console.log('='.repeat(50));

        try {
            await this.testChineseName();
            await this.testEnglishName();
            await this.testJapaneseName();
            await this.testWesternFantasyName();
            await this.testFantasyName();

            console.log('\n' + '='.repeat(50));
            console.log('\n✅ 所有测试完成！');
        } catch (error) {
            console.error('\n❌ 测试失败:', error.message);
            console.error(error.stack);
        }
    }
}

// 运行测试
const tester = new TestNameGenerator();
tester.runAllTests();
