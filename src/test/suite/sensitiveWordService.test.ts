import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { SensitiveWordService } from '../../services/sensitiveWordService';
import { ConfigService, NovelConfig } from '../../services/configService';
import { TrieTree } from '../../utils/trieTree';
import { MockTextDocument } from '../mocks/vscode';

suite('SensitiveWordService actual detection', () => {
    let service: SensitiveWordService;
    let sandbox: sinon.SinonSandbox;
    let config: NovelConfig;
    setup(() => {
        sandbox = sinon.createSandbox();
        config = {};
        sandbox.stub(ConfigService, 'getInstance').returns({ getConfig: () => config } as ConfigService);
        service = Object.create(SensitiveWordService.prototype) as SensitiveWordService;
        service['trie'] = new TrieTree();
        service['whitelist'] = new Set();
        service['loadConfig']();
    });
    teardown(() => sandbox.restore());
    function detect(text: string, language = 'markdown') {
        return service.detect(MockTextDocument.create(text, language) as unknown as vscode.TextDocument);
    }
    test('default configuration and legacy level settings are loaded by the production merger', () => {
        assert.strictEqual(service.getConfig().enabled, true);
        assert.deepStrictEqual(service.getConfig().builtInLibrary?.levels, { high: true, medium: false, low: false });
        config = { sensitiveWords: { levels: { medium: true } } } as NovelConfig;
        service['loadConfig']();
        assert.deepStrictEqual(service.getConfig().builtInLibrary?.levels, { high: true, medium: true, low: false });
    });
    test('explicit disabled options and configured library paths survive merging', () => {
        config = { sensitiveWords: { enabled: false, checkOnType: false, checkOnSave: false,
            customLibrary: { enabled: false, path: 'references/custom.json' },
            whitelist: { enabled: false, path: 'references/white.json' },
            builtInLibrary: { enabled: false, levels: { low: true } },
            display: { severity: 'Error', showInProblems: false, showWordCount: false } } } as NovelConfig;
        service['loadConfig']();
        const actual = service.getConfig();
        assert.strictEqual(actual.enabled, false);
        assert.strictEqual(actual.checkOnType, false);
        assert.strictEqual(actual.checkOnSave, false);
        assert.deepStrictEqual(actual.customLibrary, { enabled: false, path: 'references/custom.json' });
        assert.deepStrictEqual(actual.whitelist, { enabled: false, path: 'references/white.json' });
        assert.deepStrictEqual(actual.display, { severity: 'Error', showInProblems: false, showWordCount: false });
        assert.deepStrictEqual(actual.builtInLibrary, { enabled: false, levels: { high: true, medium: false, low: true } });
    });
    test('detection filters the actual whitelist and preserves UTF-16 body offsets after YAML', () => {
        service['trie'].insert('𠮷野', 'high');
        service['trie'].insert('敏感词', 'medium');
        service['whitelist'].add('𠮷野');
        const text = '---\r\ntitle: 敏感词\r\n---\r\n\r\n𠮷野说敏感词，敏感词。';
        const matches = detect(text);
        assert.deepStrictEqual(matches.map(match => match.word), ['敏感词', '敏感词']);
        assert.deepStrictEqual(matches.map(match => [match.start, match.end]), [
            [text.indexOf('敏感词', text.indexOf('𠮷野')), text.indexOf('敏感词', text.indexOf('𠮷野')) + 3],
            [text.lastIndexOf('敏感词'), text.lastIndexOf('敏感词') + 3]
        ]);
        assert.ok(matches.every(match => match.level === 'medium' && match.inWhitelist === false));
    });
    test('disabled detection, non-Markdown and empty content produce no matches', () => {
        service['trie'].insert('敏感词', 'high');
        assert.deepStrictEqual(detect('敏感词', 'plaintext'), []);
        assert.deepStrictEqual(detect(''), []);
        assert.deepStrictEqual(detect('---\ntitle: 敏感词\n---'), []);
        service['config'].enabled = false;
        assert.deepStrictEqual(detect('敏感词'), []);
    });
    test('statistics reflect actual deduplicated words and whitelist entries', () => {
        service['trie'].insertBatch(['甲', '甲', '乙'], 'high');
        service['whitelist'].add('甲');
        assert.deepStrictEqual(service.getStatistics(), { totalWords: 2, whitelistSize: 1 });
    });
});
