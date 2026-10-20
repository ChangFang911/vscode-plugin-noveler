import * as assert from 'assert';
import {
    DIALOGUE_REGEX,
    THOUGHT_REGEX,
    ELLIPSIS_REGEX,
    HTML_COMMENT_REGEX,
    MARKDOWN_HEADER_REGEX,
    CHINESE_CHARS_REGEX,
    ENGLISH_WORD_REGEX,
    STATUS_EMOJI_MAP,
    IMPORTANCE_ORDER,
    CHAPTER_STATUS_OPTIONS,
    CHARACTER_IMPORTANCE_OPTIONS,
    PROJECT_DIRECTORIES,
    VOLUME_TYPE_OFFSETS,
    VOLUME_TYPE_NAMES,
    VOLUME_STATUS_NAMES,
    VOLUME_TYPE_ICONS,
    PARAGRAPH_INDENT,
    WORD_COUNT_DEBOUNCE_DELAY,
    HIGHLIGHT_DEBOUNCE_DELAY,
    README_UPDATE_DEBOUNCE_DELAY,
    CONFIG_FILE_NAME,
    CHAPTERS_FOLDER,
    CHARACTERS_FOLDER,
    DRAFTS_FOLDER,
    REFERENCES_FOLDER,
    CHAPTER_NUMBER_PADDING,
    MAX_CHARACTER_NAME_LENGTH,
    MAX_CHAPTER_NAME_LENGTH,
    COMPLETED_STATUS,
    IN_PROGRESS_STATUS,
    MIN_AVG_CHAPTERS_PER_VOLUME,
    MIN_VOLUME_COVERAGE_RATIO,
    README_FILE_NAME,
    DEFAULT_TARGET_WORDS
} from '../../constants';

suite('Constants Test Suite', () => {

    suite('DIALOGUE_REGEX', () => {

        test('should match 「」 quotes', () => {
            const text = '他说「你好」';
            const matches = text.match(DIALOGUE_REGEX);
            assert.deepStrictEqual(matches, ['「你好」']);
        });

        test('should match "" double quotes', () => {
            const text = '他说"你好"';
            const matches = text.match(DIALOGUE_REGEX);
            assert.deepStrictEqual(matches, ['"你好"']);
        });

        test('should match "" curly double quotes', () => {
            const text = '他说"你好"';
            const matches = text.match(DIALOGUE_REGEX);
            assert.deepStrictEqual(matches, ['"你好"']);
        });

        test('should match \'\' single quotes', () => {
            const text = "他说'你好'";
            const matches = text.match(DIALOGUE_REGEX);
            assert.deepStrictEqual(matches, ["'你好'"]);
        });

        test('should match multiple dialogues', () => {
            const text = '「第一句」他说完后，她回答"第二句"';
            const matches = text.match(DIALOGUE_REGEX);
            assert.strictEqual(matches?.length, 2);
        });

        test('should not match unclosed quotes', () => {
            const text = '他说「你好';
            const matches = text.match(DIALOGUE_REGEX);
            assert.strictEqual(matches, null);
        });

        test('should match empty dialogue', () => {
            const text = '他说「」';
            const matches = text.match(DIALOGUE_REGEX);
            assert.deepStrictEqual(matches, ['「」']);
        });

        test('should match dialogue with punctuation inside', () => {
            const text = '「你好！怎么了？」';
            const matches = text.match(DIALOGUE_REGEX);
            assert.deepStrictEqual(matches, ['「你好！怎么了？」']);
        });
    });

    suite('THOUGHT_REGEX', () => {

        test('should match full-width parentheses', () => {
            const text = '他心想（这是什么情况）';
            const matches = text.match(THOUGHT_REGEX);
            assert.deepStrictEqual(matches, ['（这是什么情况）']);
        });

        test('should not match half-width parentheses', () => {
            const text = '他心想(这是什么情况)';
            const matches = text.match(THOUGHT_REGEX);
            assert.strictEqual(matches, null);
        });

        test('should match multiple thoughts', () => {
            const text = '他想（第一个想法）然后又想（第二个想法）';
            const matches = text.match(THOUGHT_REGEX);
            assert.strictEqual(matches?.length, 2);
        });

        test('should match thought with punctuation inside', () => {
            const text = '（难道是他？不可能！）';
            const matches = text.match(THOUGHT_REGEX);
            assert.deepStrictEqual(matches, ['（难道是他？不可能！）']);
        });

        test('should match empty thought', () => {
            const text = '（）';
            const matches = text.match(THOUGHT_REGEX);
            assert.deepStrictEqual(matches, ['（）']);
        });
    });

    suite('ELLIPSIS_REGEX', () => {

        test('should match Chinese ellipsis', () => {
            const text = '他说…';
            const matches = text.match(ELLIPSIS_REGEX);
            assert.deepStrictEqual(matches, ['…']);
        });

        test('should match multiple Chinese ellipsis', () => {
            const text = '他说……';
            const matches = text.match(ELLIPSIS_REGEX);
            assert.deepStrictEqual(matches, ['……']);
        });

        test('should match three dots', () => {
            const text = '他说...';
            const matches = text.match(ELLIPSIS_REGEX);
            assert.deepStrictEqual(matches, ['...']);
        });

        test('should match more than three dots', () => {
            const text = '他说......';
            const matches = text.match(ELLIPSIS_REGEX);
            assert.deepStrictEqual(matches, ['......']);
        });

        test('should not match two dots', () => {
            const text = '他说..end';
            const matches = text.match(ELLIPSIS_REGEX);
            assert.strictEqual(matches, null);
        });

        test('should match multiple ellipsis in text', () => {
            const text = '他说……然后……';
            const matches = text.match(ELLIPSIS_REGEX);
            assert.strictEqual(matches?.length, 2);
        });
    });

    suite('HTML_COMMENT_REGEX', () => {

        test('should match single line comment', () => {
            const text = '<!-- comment -->';
            const matches = text.match(HTML_COMMENT_REGEX);
            assert.deepStrictEqual(matches, ['<!-- comment -->']);
        });

        test('should match multi-line comment', () => {
            const text = '<!--\nline1\nline2\n-->';
            const matches = text.match(HTML_COMMENT_REGEX);
            assert.deepStrictEqual(matches, ['<!--\nline1\nline2\n-->']);
        });

        test('should match empty comment', () => {
            const text = '<!---->';
            const matches = text.match(HTML_COMMENT_REGEX);
            assert.deepStrictEqual(matches, ['<!---->']);
        });

        test('should match multiple comments', () => {
            const text = '<!-- first --> content <!-- second -->';
            const matches = text.match(HTML_COMMENT_REGEX);
            assert.strictEqual(matches?.length, 2);
        });

        test('should not match unclosed comment', () => {
            const text = '<!-- unclosed';
            const matches = text.match(HTML_COMMENT_REGEX);
            assert.strictEqual(matches, null);
        });
    });

    suite('MARKDOWN_HEADER_REGEX', () => {

        test('should match h1', () => {
            const text = '# Title';
            const matches = text.match(MARKDOWN_HEADER_REGEX);
            assert.deepStrictEqual(matches, ['# ']);
        });

        test('should match h2', () => {
            const text = '## Subtitle';
            const matches = text.match(MARKDOWN_HEADER_REGEX);
            assert.deepStrictEqual(matches, ['## ']);
        });

        test('should match h6', () => {
            const text = '###### Deep header';
            const matches = text.match(MARKDOWN_HEADER_REGEX);
            assert.deepStrictEqual(matches, ['###### ']);
        });

        test('should match multiple headers', () => {
            const text = '# H1\n## H2\n### H3';
            const matches = text.match(MARKDOWN_HEADER_REGEX);
            assert.strictEqual(matches?.length, 3);
        });

        test('should not match # without space', () => {
            const text = '#NoSpace';
            const matches = text.match(MARKDOWN_HEADER_REGEX);
            assert.strictEqual(matches, null);
        });

        test('should not match # in middle of line', () => {
            const text = 'text # not header';
            const matches = text.match(MARKDOWN_HEADER_REGEX);
            assert.strictEqual(matches, null);
        });
    });

    suite('CHINESE_CHARS_REGEX', () => {

        test('should match Chinese characters', () => {
            const text = '你好世界';
            const matches = text.match(CHINESE_CHARS_REGEX);
            assert.strictEqual(matches?.length, 4);
        });

        test('should match Chinese punctuation', () => {
            const text = '，。！？';
            const matches = text.match(CHINESE_CHARS_REGEX);
            assert.ok(matches && matches.length > 0);
        });

        test('should match full-width characters', () => {
            const text = '（）「」';
            const matches = text.match(CHINESE_CHARS_REGEX);
            assert.ok(matches && matches.length > 0);
        });

        test('should not match English', () => {
            const text = 'Hello World';
            const matches = text.match(CHINESE_CHARS_REGEX);
            assert.strictEqual(matches, null);
        });

        test('should match mixed text (Chinese only)', () => {
            const text = '你好Hello世界';
            const matches = text.match(CHINESE_CHARS_REGEX);
            assert.strictEqual(matches?.length, 4); // 你好世界
        });
    });

    suite('ENGLISH_WORD_REGEX', () => {

        test('should match English words', () => {
            const text = 'Hello World';
            const matches = text.match(ENGLISH_WORD_REGEX);
            assert.deepStrictEqual(matches, ['Hello', 'World']);
        });

        test('should match single word', () => {
            const text = 'Test';
            const matches = text.match(ENGLISH_WORD_REGEX);
            assert.deepStrictEqual(matches, ['Test']);
        });

        test('should not match numbers', () => {
            const text = '123 456';
            const matches = text.match(ENGLISH_WORD_REGEX);
            assert.strictEqual(matches, null);
        });

        test('should not match when letters adjacent to numbers', () => {
            const text = 'test123 word456';
            const matches = text.match(ENGLISH_WORD_REGEX);
            // With word boundary \b, letters adjacent to numbers are NOT matched
            assert.strictEqual(matches, null);
        });

        test('should not match Chinese', () => {
            const text = '你好世界';
            const matches = text.match(ENGLISH_WORD_REGEX);
            assert.strictEqual(matches, null);
        });
    });

    suite('STATUS_EMOJI_MAP', () => {

        test('should have emoji for 草稿', () => {
            assert.strictEqual(STATUS_EMOJI_MAP['草稿'], '📝');
        });

        test('should have emoji for 初稿', () => {
            assert.strictEqual(STATUS_EMOJI_MAP['初稿'], '✏️');
        });

        test('should have emoji for 修改中', () => {
            assert.strictEqual(STATUS_EMOJI_MAP['修改中'], '🔧');
        });

        test('should have emoji for 已完成', () => {
            assert.strictEqual(STATUS_EMOJI_MAP['已完成'], '✅');
        });

        test('should have English aliases', () => {
            assert.strictEqual(STATUS_EMOJI_MAP['draft'], '📝');
            assert.strictEqual(STATUS_EMOJI_MAP['completed'], '✅');
        });

        test('should return undefined for unknown status', () => {
            assert.strictEqual(STATUS_EMOJI_MAP['unknown'], undefined);
        });
    });

    suite('IMPORTANCE_ORDER', () => {

        test('should have correct order for 主角', () => {
            assert.strictEqual(IMPORTANCE_ORDER['主角'], 1);
        });

        test('should have correct order for 重要配角', () => {
            assert.strictEqual(IMPORTANCE_ORDER['重要配角'], 2);
        });

        test('should have correct order for 次要配角', () => {
            assert.strictEqual(IMPORTANCE_ORDER['次要配角'], 3);
        });

        test('should have correct order for 路人', () => {
            assert.strictEqual(IMPORTANCE_ORDER['路人'], 4);
        });

        test('should have increasing order from protagonist to extra', () => {
            assert.ok(IMPORTANCE_ORDER['主角'] < IMPORTANCE_ORDER['重要配角']);
            assert.ok(IMPORTANCE_ORDER['重要配角'] < IMPORTANCE_ORDER['次要配角']);
            assert.ok(IMPORTANCE_ORDER['次要配角'] < IMPORTANCE_ORDER['路人']);
        });
    });

    suite('CHAPTER_STATUS_OPTIONS', () => {

        test('should have 4 options', () => {
            assert.strictEqual(CHAPTER_STATUS_OPTIONS.length, 4);
        });

        test('should include 草稿', () => {
            assert.ok(CHAPTER_STATUS_OPTIONS.includes('草稿'));
        });

        test('should include 已完成', () => {
            assert.ok(CHAPTER_STATUS_OPTIONS.includes('已完成'));
        });

        test('should be in correct order', () => {
            assert.deepStrictEqual([...CHAPTER_STATUS_OPTIONS], ['草稿', '初稿', '修改中', '已完成']);
        });
    });

    suite('CHARACTER_IMPORTANCE_OPTIONS', () => {

        test('should have 4 options', () => {
            assert.strictEqual(CHARACTER_IMPORTANCE_OPTIONS.length, 4);
        });

        test('should include 主角', () => {
            assert.ok(CHARACTER_IMPORTANCE_OPTIONS.includes('主角'));
        });

        test('should be in correct order', () => {
            assert.deepStrictEqual([...CHARACTER_IMPORTANCE_OPTIONS], ['主角', '重要配角', '次要配角', '路人']);
        });
    });

    suite('PROJECT_DIRECTORIES', () => {

        test('should have 4 directories', () => {
            assert.strictEqual(PROJECT_DIRECTORIES.length, 4);
        });

        test('should include chapters folder', () => {
            assert.ok(PROJECT_DIRECTORIES.includes('chapters'));
        });

        test('should include characters folder', () => {
            assert.ok(PROJECT_DIRECTORIES.includes('characters'));
        });

        test('should include drafts folder', () => {
            assert.ok(PROJECT_DIRECTORIES.includes('drafts'));
        });

        test('should include references folder', () => {
            assert.ok(PROJECT_DIRECTORIES.includes('references'));
        });
    });

    suite('VOLUME constants', () => {

        suite('VOLUME_TYPE_OFFSETS', () => {
            test('should have correct offset for main', () => {
                assert.strictEqual(VOLUME_TYPE_OFFSETS.main, 0);
            });

            test('should have correct offset for prequel', () => {
                assert.strictEqual(VOLUME_TYPE_OFFSETS.prequel, 0);
            });

            test('should have correct offset for sequel', () => {
                assert.strictEqual(VOLUME_TYPE_OFFSETS.sequel, 1000);
            });

            test('should have correct offset for extra', () => {
                assert.strictEqual(VOLUME_TYPE_OFFSETS.extra, 2000);
            });
        });

        suite('VOLUME_TYPE_NAMES', () => {
            test('should have correct name for main', () => {
                assert.strictEqual(VOLUME_TYPE_NAMES.main, '正文');
            });

            test('should have correct name for prequel', () => {
                assert.strictEqual(VOLUME_TYPE_NAMES.prequel, '前传');
            });

            test('should have correct name for sequel', () => {
                assert.strictEqual(VOLUME_TYPE_NAMES.sequel, '后传');
            });

            test('should have correct name for extra', () => {
                assert.strictEqual(VOLUME_TYPE_NAMES.extra, '番外');
            });
        });

        suite('VOLUME_STATUS_NAMES', () => {
            test('should have correct name for planning', () => {
                assert.strictEqual(VOLUME_STATUS_NAMES.planning, '计划中');
            });

            test('should have correct name for writing', () => {
                assert.strictEqual(VOLUME_STATUS_NAMES.writing, '创作中');
            });

            test('should have correct name for completed', () => {
                assert.strictEqual(VOLUME_STATUS_NAMES.completed, '已完成');
            });
        });

        suite('VOLUME_TYPE_ICONS', () => {
            test('should have icon for main', () => {
                assert.strictEqual(VOLUME_TYPE_ICONS.main, '📖');
            });

            test('should have icon for prequel', () => {
                assert.strictEqual(VOLUME_TYPE_ICONS.prequel, '⏪');
            });

            test('should have icon for sequel', () => {
                assert.strictEqual(VOLUME_TYPE_ICONS.sequel, '⏩');
            });

            test('should have icon for extra', () => {
                assert.strictEqual(VOLUME_TYPE_ICONS.extra, '✨');
            });
        });
    });

    suite('Debounce delays', () => {

        test('WORD_COUNT_DEBOUNCE_DELAY should be 300ms', () => {
            assert.strictEqual(WORD_COUNT_DEBOUNCE_DELAY, 300);
        });

        test('HIGHLIGHT_DEBOUNCE_DELAY should be 500ms', () => {
            assert.strictEqual(HIGHLIGHT_DEBOUNCE_DELAY, 500);
        });

        test('README_UPDATE_DEBOUNCE_DELAY should be 5000ms', () => {
            assert.strictEqual(README_UPDATE_DEBOUNCE_DELAY, 5000);
        });

        test('delays should be in increasing order', () => {
            assert.ok(WORD_COUNT_DEBOUNCE_DELAY < HIGHLIGHT_DEBOUNCE_DELAY);
            assert.ok(HIGHLIGHT_DEBOUNCE_DELAY < README_UPDATE_DEBOUNCE_DELAY);
        });
    });

    suite('File and folder constants', () => {

        test('CONFIG_FILE_NAME should be novel.jsonc', () => {
            assert.strictEqual(CONFIG_FILE_NAME, 'novel.jsonc');
        });

        test('README_FILE_NAME should be README.md', () => {
            assert.strictEqual(README_FILE_NAME, 'README.md');
        });

        test('CHAPTERS_FOLDER should be chapters', () => {
            assert.strictEqual(CHAPTERS_FOLDER, 'chapters');
        });

        test('CHARACTERS_FOLDER should be characters', () => {
            assert.strictEqual(CHARACTERS_FOLDER, 'characters');
        });

        test('DRAFTS_FOLDER should be drafts', () => {
            assert.strictEqual(DRAFTS_FOLDER, 'drafts');
        });

        test('REFERENCES_FOLDER should be references', () => {
            assert.strictEqual(REFERENCES_FOLDER, 'references');
        });
    });

    suite('Validation constants', () => {

        test('CHAPTER_NUMBER_PADDING should be 2', () => {
            assert.strictEqual(CHAPTER_NUMBER_PADDING, 2);
        });

        test('MAX_CHARACTER_NAME_LENGTH should be 50', () => {
            assert.strictEqual(MAX_CHARACTER_NAME_LENGTH, 50);
        });

        test('MAX_CHAPTER_NAME_LENGTH should be 100', () => {
            assert.strictEqual(MAX_CHAPTER_NAME_LENGTH, 100);
        });
    });

    suite('Status constants', () => {

        test('COMPLETED_STATUS should be 已完成', () => {
            assert.strictEqual(COMPLETED_STATUS, '已完成');
        });

        test('IN_PROGRESS_STATUS should be 修���中', () => {
            assert.strictEqual(IN_PROGRESS_STATUS, '修改中');
        });

        test('COMPLETED_STATUS should be in CHAPTER_STATUS_OPTIONS', () => {
            assert.ok(CHAPTER_STATUS_OPTIONS.includes(COMPLETED_STATUS as typeof CHAPTER_STATUS_OPTIONS[number]));
        });

        test('IN_PROGRESS_STATUS should be in CHAPTER_STATUS_OPTIONS', () => {
            assert.ok(CHAPTER_STATUS_OPTIONS.includes(IN_PROGRESS_STATUS as typeof CHAPTER_STATUS_OPTIONS[number]));
        });
    });

    suite('Migration constants', () => {

        test('MIN_AVG_CHAPTERS_PER_VOLUME should be 2', () => {
            assert.strictEqual(MIN_AVG_CHAPTERS_PER_VOLUME, 2);
        });

        test('MIN_VOLUME_COVERAGE_RATIO should be 0.5', () => {
            assert.strictEqual(MIN_VOLUME_COVERAGE_RATIO, 0.5);
        });
    });

    suite('Default values', () => {

        test('DEFAULT_TARGET_WORDS should be 2500', () => {
            assert.strictEqual(DEFAULT_TARGET_WORDS, 2500);
        });
    });

    suite('PARAGRAPH_INDENT', () => {

        test('should be two full-width spaces', () => {
            assert.strictEqual(PARAGRAPH_INDENT, '　　');
        });

        test('should have length of 2', () => {
            assert.strictEqual(PARAGRAPH_INDENT.length, 2);
        });

        test('should be full-width space characters', () => {
            // Full-width space is U+3000
            assert.strictEqual(PARAGRAPH_INDENT.charCodeAt(0), 0x3000);
            assert.strictEqual(PARAGRAPH_INDENT.charCodeAt(1), 0x3000);
        });
    });
});
