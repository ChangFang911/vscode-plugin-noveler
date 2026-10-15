import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import { NameGeneratorService, ChineseNameStyle } from '../../services/nameGeneratorService';

suite('NameGeneratorService actual generators', () => {
    let service: NameGeneratorService;
    let sandbox: sinon.SinonSandbox;
    setup(() => {
        sandbox = sinon.createSandbox();
        service = Object.create(NameGeneratorService.prototype) as NameGeneratorService;
        service['dataDir'] = path.resolve(__dirname, '../../../src/data');
        let seed = 42;
        sandbox.stub(Math, 'random').callsFake(() => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 0x100000000;
        });
    });
    teardown(() => sandbox.restore());

    for (const style of ['modern', 'classic', 'fantasy'] as ChineseNameStyle[]) {
        test(`${style} Chinese names load shipped libraries and return unique names`, async () => {
            const names = await service.generateChineseName(style);
            assert.strictEqual(names.length, 10);
            assert.strictEqual(new Set(names).size, names.length);
            assert.ok(names.every(name => /^[\p{Script=Han}·]+$/u.test(name) && name.length >= 2));
        });
    }
    for (const gender of ['male', 'female', 'random'] as const) {
        test(`${gender} names use the real English, Japanese and western fantasy libraries`, async () => {
            const english = await service.generateEnglishName(gender, 3);
            const japanese = await service.generateJapaneseName(gender, 3);
            const western = await service.generateWesternFantasyName(gender, 3);
            for (const names of [english, japanese, western]) {
                assert.strictEqual(names.length, 3);
                assert.strictEqual(new Set(names).size, 3);
            }
            for (const name of english) {
                const first = name.split(' ')[0];
                const data = service['englishNames']!;
                const allowed = gender === 'random' ? [...data.firstNames.male, ...data.firstNames.female] : data.firstNames[gender];
                assert.ok(allowed.includes(first));
                assert.ok(data.lastNames.some(last => name.endsWith(' ' + last)));
            }
            assert.ok(japanese.every(name => !/\s/.test(name)));
            assert.ok(western.every(name => name.includes('·')));
        });
    }
    for (const [length, expected] of [[1, 'Baba'], [2, 'Baba'], [3, 'Bababa'], [8, 'Babababa']] as const) {
        test(`fantasy syllable length ${length} is bounded using the real generator`, async () => {
            service['fantasySyllables'] = { consonants: ['b'], vowels: ['a'], patterns: ['{consonant}{vowel}'] };
            assert.deepStrictEqual(await service.generateFantasyName(length, 1), [expected]);
        });
    }
    test('repeated placeholders are replaced and exhausted uniqueness stops safely', async () => {
        service['fantasySyllables'] = { consonants: ['b'], vowels: ['a'], patterns: ['{consonant}{vowel}{consonant}{vowel}'] };
        assert.deepStrictEqual(await service.generateFantasyName(2, 10), ['Babababa']);
        assert.deepStrictEqual(await service.generateFantasyName(2, 0), []);
        service['englishNames'] = { firstNames: { male: ['John'], female: ['Jane'] }, lastNames: ['Smith'] };
        assert.deepStrictEqual(await service.generateEnglishName('male', 10), ['John Smith']);
    });
    test('missing library errors identify the failed source', async () => {
        service['dataDir'] = path.join(service['dataDir'], 'missing-test-directory');
        await assert.rejects(service.generateChineseName('modern'), /加载中文姓氏数据失败/);
        await assert.rejects(service.generateEnglishName(), /加载英文姓名数据失败/);
        await assert.rejects(service.generateJapaneseName(), /加载日文姓名数据失败/);
        await assert.rejects(service.generateFantasyName(), /加载玄幻音节数据失败/);
        await assert.rejects(service.generateWesternFantasyName(), /加载西幻姓名数据失败/);
    });
});
