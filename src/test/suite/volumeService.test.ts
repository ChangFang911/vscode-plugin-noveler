import * as assert from 'assert';
import { VolumeService } from '../../services/volumeService';
import { VolumeInfo } from '../../types/volume';

suite('VolumeService actual parsing and lookup', () => {
    let service: VolumeService;
    setup(() => {
        service = Object.create(VolumeService.prototype) as VolumeService;
        service['volumes'] = [];
    });
    const folders: [string, number, string, string][] = [
        ['第一卷-起点', 1, 'main', '起点'], ['第12卷-中段', 12, 'main', '中段'],
        ['第IX卷-转折', 9, 'main', '转折'], ['VolumeIV-Rising', 4, 'main', 'Rising'],
        ['01-开篇', 1, 'main', '开篇'], ['前传二-往事', -2, 'prequel', '往事'],
        ['后传一-余波', 1001, 'sequel', '余波'], ['番外III-日常', 2003, 'extra', '日常']
    ];
    for (const [folder, volume, volumeType, title] of folders) {
        test(`parses shipped folder convention ${folder}`, () => {
            assert.deepStrictEqual(service['parseVolumeName'](folder), { volume, volumeType, title });
        });
    }
    test('unrelated folders are not treated as volumes', () => {
        for (const name of ['references', '', '大纲', '第一卷', '第1卷-']) {
            assert.strictEqual(service['parseVolumeName'](name), null);
        }
    });
    for (const [text, expected] of [['01', 1], ['IV', 4], ['IX', 9], ['二十一', 21], ['一百零一', 101], ['一万零三', 10003]] as const) {
        test(`parses chapter number ${text} through the production parser`, () => {
            assert.strictEqual(service['parseNumber'](text), expected);
        });
    }
    test('volume lookups resolve chapter membership and missing numbers', () => {
        const first = { volume: 1, folderPath: '/novel/chapters/第一卷', volumeType: 'main', chapters: ['A.md'] } as VolumeInfo;
        const second = { volume: 2, folderPath: '/novel/chapters/第一卷续', volumeType: 'main', chapters: ['B.md'] } as VolumeInfo;
        service['volumes'] = [first, second];
        assert.strictEqual(service.getVolumeByNumber(1), first);
        assert.strictEqual(service.getVolumeByNumber(3), undefined);
        assert.strictEqual(service.getVolumeForChapter('/novel/chapters/第一卷/A.md'), first);
        assert.strictEqual(service.getVolumeForChapter('/novel/chapters/第一卷续/B.md'), second);
        assert.strictEqual(service.getVolumeForChapter('/novel/chapters/无卷/C.md'), undefined);
    });
    test('same-name chapters in different volumes resolve by their actual parent folder', () => {
        const first = { volume: 1, folderPath: '/novel/chapters/第一卷', chapters: ['第01章.md'] } as VolumeInfo;
        const second = { volume: 2, folderPath: '/novel/chapters/第一卷续', chapters: ['第01章.md'] } as VolumeInfo;
        service['volumes'] = [first, second];
        assert.strictEqual(service.getVolumeForChapter('/novel/chapters/第一卷续/第01章.md'), second);
        assert.strictEqual(service.getVolumeForChapter('/novel/drafts/第01章.md'), undefined);
    });
});
