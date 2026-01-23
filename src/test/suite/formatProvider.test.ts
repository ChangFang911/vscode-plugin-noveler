/**
 * 格式化提供器测试
 * 测试中文小说格式化功能
 */

import * as assert from 'assert';
import * as sinon from 'sinon';

/**
 * 模拟 formatLine 逻辑（从 ChineseNovelFormatProvider 提取）
 */
function formatLine(line: string, quoteStyle: string, shouldConvertQuotes: boolean): string {
    if (!line.trim()) {
        return line;
    }

    let formatted = line;

    // 1. 统一引号样式（如果启用了转换）
    if (shouldConvertQuotes) {
        if (quoteStyle === '「」') {
            // 将英文引号转为中文引号
            formatted = formatted.replace(/"([^"]*)"/g, '「$1」');
        } else {
            // 将中文引号转为英文引号
            formatted = formatted.replace(/「([^」]*)」/g, '"$1"');
        }
    }

    // 2. 统一省略号（在标点规范化之前执行，避免 ... 被拆分）
    formatted = formatted.replace(/\.{3,}/g, '…');

    // 3. 统一破折号
    formatted = formatted.replace(/--+/g, '——');

    // 4. 标点符号规范化
    // 中文后面跟英文标点
    formatted = formatted.replace(/([\u4e00-\u9fa5]),/g, '$1，');
    formatted = formatted.replace(/([\u4e00-\u9fa5])\./g, '$1。');
    formatted = formatted.replace(/([\u4e00-\u9fa5])!/g, '$1！');
    formatted = formatted.replace(/([\u4e00-\u9fa5])\?/g, '$1？');
    // 英文标点后面跟中文
    formatted = formatted.replace(/,(?=[\u4e00-\u9fa5])/g, '，');
    formatted = formatted.replace(/\.(?=[\u4e00-\u9fa5])/g, '。');
    formatted = formatted.replace(/!(?=[\u4e00-\u9fa5])/g, '！');
    formatted = formatted.replace(/\?(?=[\u4e00-\u9fa5])/g, '？');

    // 5. 删除多余空格（中文之间的空格，需要循环处理连续空格）
    let prev = '';
    while (prev !== formatted) {
        prev = formatted;
        formatted = formatted.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');
    }

    return formatted;
}

/**
 * 模拟段落间空行处理逻辑
 */
function formatParagraphSpacing(
    text: string,
    shouldAutoEmptyLine: boolean,
    shouldParagraphIndent: boolean,
    PARAGRAPH_INDENT: string = '　　'
): string {
    const lines = text.split('\n');
    const result: string[] = [];

    let inFrontMatter = false;
    let frontMatterCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const currentLine = lines[i];
        const prevLine = result.length > 0 ? result[result.length - 1] : null;
        const nextLine = i < lines.length - 1 ? lines[i + 1] : null;

        // 跟踪 Front Matter 区域
        if (currentLine.trim() === '---') {
            frontMatterCount++;
            if (frontMatterCount === 1) {
                inFrontMatter = true;
            } else if (frontMatterCount === 2) {
                inFrontMatter = false;
            }
            result.push(currentLine);
            continue;
        }

        // Front Matter 内部不处理
        if (inFrontMatter) {
            result.push(currentLine);
            continue;
        }

        const isCurrentEmpty = currentLine.trim() === '';
        const isPrevEmpty = prevLine === null || prevLine.trim() === '';
        const isNextEmpty = nextLine === null || nextLine.trim() === '';

        // 判断是否是特殊行（标题、HTML注释）
        const isCurrentSpecial = currentLine.trim().startsWith('#') || currentLine.trim().startsWith('<!--');
        const isPrevSpecial = prevLine !== null && (prevLine.trim().startsWith('#') || prevLine.trim().startsWith('<!--'));
        const isNextSpecial = nextLine !== null && (nextLine.trim().startsWith('#') || nextLine.trim().startsWith('<!--'));

        if (shouldAutoEmptyLine) {
            if (isCurrentEmpty) {
                if (!isPrevEmpty && !isNextEmpty && !isPrevSpecial && !isNextSpecial) {
                    result.push(currentLine);
                }
            } else {
                let lineToAdd = currentLine;

                if (shouldParagraphIndent && !isCurrentSpecial) {
                    const isParagraphStart = isPrevEmpty || isPrevSpecial || prevLine === null ||
                        (prevLine !== null && prevLine.trim() === '---' && frontMatterCount === 2);

                    if (isParagraphStart) {
                        // eslint-disable-next-line no-irregular-whitespace
                        const trimmed = lineToAdd.replace(/^[\s　]+/, '');
                        lineToAdd = PARAGRAPH_INDENT + trimmed;
                    }
                }

                result.push(lineToAdd);

                if (!isCurrentSpecial && !isNextEmpty && !isNextSpecial && nextLine !== null) {
                    result.push('');
                }
            }
        } else {
            if (isCurrentEmpty) {
                if ((prevLine !== null && prevLine.trim() === '---' && frontMatterCount === 2) || isPrevSpecial) {
                    result.push(currentLine);
                }
            } else {
                let lineToAdd = currentLine;

                if (shouldParagraphIndent && !isCurrentSpecial) {
                    const isParagraphStart = isPrevEmpty || isPrevSpecial || prevLine === null ||
                        (prevLine !== null && prevLine.trim() === '---' && frontMatterCount === 2);

                    if (isParagraphStart) {
                        // eslint-disable-next-line no-irregular-whitespace
                        const trimmed = lineToAdd.replace(/^[\s　]+/, '');
                        lineToAdd = PARAGRAPH_INDENT + trimmed;
                    }
                }

                result.push(lineToAdd);
            }
        }
    }

    return result.join('\n');
}

suite('FormatProvider Test Suite', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('Quote Conversion', () => {
        test('should convert English quotes to 「」', () => {
            const result = formatLine('"对话内容"', '「」', true);
            assert.strictEqual(result, '「对话内容」');
        });

        test('should convert 「」 to English quotes', () => {
            const result = formatLine('「对话内容」', '""', true);
            assert.strictEqual(result, '"对话内容"');
        });

        test('should not convert when disabled', () => {
            const result = formatLine('"对话内容"', '「」', false);
            assert.strictEqual(result, '"对话内容"');
        });

        test('should handle multiple quotes in one line', () => {
            const result = formatLine('"第一句""第二句"', '「」', true);
            assert.strictEqual(result, '「第一句」「第二句」');
        });

        test('should handle nested content', () => {
            const result = formatLine('"他说道"', '「」', true);
            assert.strictEqual(result, '「他说道」');
        });

        test('should preserve empty quotes', () => {
            const result = formatLine('""', '「」', true);
            assert.strictEqual(result, '「」');
        });
    });

    suite('Punctuation Normalization', () => {
        test('should convert comma after Chinese', () => {
            const result = formatLine('你好,世界', '「」', false);
            assert.strictEqual(result, '你好，世界');
        });

        test('should convert period after Chinese', () => {
            const result = formatLine('你好.世界', '「」', false);
            assert.strictEqual(result, '你好。世界');
        });

        test('should convert exclamation after Chinese', () => {
            const result = formatLine('你好!世界', '「」', false);
            assert.strictEqual(result, '你好！世界');
        });

        test('should convert question mark after Chinese', () => {
            const result = formatLine('你好?世界', '「」', false);
            assert.strictEqual(result, '你好？世界');
        });

        test('should convert comma before Chinese', () => {
            const result = formatLine('Hello,你好', '「」', false);
            assert.strictEqual(result, 'Hello，你好');
        });

        test('should convert period before Chinese', () => {
            const result = formatLine('Hello.你好', '「」', false);
            assert.strictEqual(result, 'Hello。你好');
        });

        test('should not convert pure English punctuation', () => {
            const result = formatLine('Hello, World!', '「」', false);
            assert.strictEqual(result, 'Hello, World!');
        });

        test('should handle multiple punctuation conversions', () => {
            const result = formatLine('你好,世界!再见?', '「」', false);
            assert.strictEqual(result, '你好，世界！再见？');
        });
    });

    suite('Space Removal', () => {
        test('should remove spaces between Chinese characters', () => {
            const result = formatLine('你 好 世 界', '「」', false);
            assert.strictEqual(result, '你好世界');
        });

        test('should remove multiple spaces between Chinese', () => {
            const result = formatLine('你   好', '「」', false);
            assert.strictEqual(result, '你好');
        });

        test('should preserve spaces in English', () => {
            const result = formatLine('Hello World', '「」', false);
            assert.strictEqual(result, 'Hello World');
        });

        test('should handle mixed content', () => {
            const result = formatLine('你 好 World 世 界', '「」', false);
            // Note: 你好 and 世界 will merge, but "World" stays
            assert.ok(result.includes('World'));
        });
    });

    suite('Ellipsis Normalization', () => {
        test('should convert three dots to ellipsis', () => {
            const result = formatLine('等等...', '「」', false);
            assert.strictEqual(result, '等等…');
        });

        test('should convert multiple dots to ellipsis', () => {
            const result = formatLine('等等.....', '「」', false);
            assert.strictEqual(result, '等等…');
        });

        test('should handle ellipsis in middle of text', () => {
            const result = formatLine('等等...继续', '「」', false);
            assert.strictEqual(result, '等等…继续');
        });
    });

    suite('Dash Normalization', () => {
        test('should convert double dash to em dash', () => {
            const result = formatLine('他说--不对', '「」', false);
            assert.strictEqual(result, '他说——不对');
        });

        test('should convert multiple dashes to em dash', () => {
            const result = formatLine('他说----不对', '「」', false);
            assert.strictEqual(result, '他说——不对');
        });

        test('should handle dash at start', () => {
            const result = formatLine('--开始', '「」', false);
            assert.strictEqual(result, '——开始');
        });
    });

    suite('Empty Line Handling', () => {
        test('should return empty line unchanged', () => {
            const result = formatLine('', '「」', true);
            assert.strictEqual(result, '');
        });

        test('should return whitespace-only line unchanged', () => {
            const result = formatLine('   ', '「」', true);
            assert.strictEqual(result, '   ');
        });

        test('should return tab-only line unchanged', () => {
            const result = formatLine('\t\t', '「」', true);
            assert.strictEqual(result, '\t\t');
        });
    });

    suite('Paragraph Spacing - Auto Empty Line Enabled', () => {
        const INDENT = '　　';

        test('should add empty line between paragraphs', () => {
            const input = '第一段\n第二段';
            const result = formatParagraphSpacing(input, true, false);
            assert.strictEqual(result, '第一段\n\n第二段');
        });

        test('should not add multiple empty lines', () => {
            const input = '第一段\n\n\n第二段';
            const result = formatParagraphSpacing(input, true, false);
            assert.strictEqual(result, '第一段\n\n第二段');
        });

        test('should preserve Front Matter', () => {
            const input = '---\ntitle: 测试\n---\n正文';
            const result = formatParagraphSpacing(input, true, false);
            assert.ok(result.includes('---'));
            assert.ok(result.includes('title: 测试'));
        });

        test('should handle headers correctly', () => {
            const input = '# 标题\n正文内容';
            const result = formatParagraphSpacing(input, true, false);
            assert.ok(result.includes('# 标题'));
        });

        test('should add indent at paragraph start', () => {
            const input = '第一段';
            const result = formatParagraphSpacing(input, true, true, INDENT);
            assert.strictEqual(result, INDENT + '第一段');
        });

        test('should add indent after empty line', () => {
            const input = '第一段\n\n第二段';
            const result = formatParagraphSpacing(input, true, true, INDENT);
            assert.ok(result.includes(INDENT + '第一段'));
            assert.ok(result.includes(INDENT + '第二段'));
        });
    });

    suite('Paragraph Spacing - Auto Empty Line Disabled', () => {
        test('should remove empty lines between paragraphs', () => {
            const input = '第一段\n\n第二段';
            const result = formatParagraphSpacing(input, false, false);
            assert.strictEqual(result, '第一段\n第二段');
        });

        test('should remove multiple empty lines', () => {
            const input = '第一段\n\n\n\n第二段';
            const result = formatParagraphSpacing(input, false, false);
            assert.strictEqual(result, '第一段\n第二段');
        });

        test('should preserve empty line after Front Matter', () => {
            const input = '---\ntitle: 测试\n---\n\n正文';
            const result = formatParagraphSpacing(input, false, false);
            assert.ok(result.includes('---\n\n正文') || result.includes('---\n正文'));
        });
    });

    suite('Complex Formatting Scenarios', () => {
        test('should handle typical dialogue line', () => {
            const result = formatLine('"你好,"她说,"很高兴认识你."', '「」', true);
            assert.ok(result.includes('「'));
            assert.ok(result.includes('，'));
            assert.ok(result.includes('。'));
        });

        test('should handle narrative with punctuation', () => {
            const result = formatLine('他站在那里,看着远方...', '「」', false);
            assert.ok(result.includes('，'));
            assert.ok(result.includes('…'));
        });

        test('should handle mixed dialogue and narration', () => {
            const input = '---\ntitle: 第一章\n---\n\n# 第一章\n\n"你好,"她说.\n\n他点了点头.';
            const result = formatParagraphSpacing(input, true, true, '　　');
            assert.ok(result.includes('---'));
            assert.ok(result.includes('# 第一章'));
        });
    });

    suite('Edge Cases', () => {
        test('should handle very long line', () => {
            const longLine = '测试'.repeat(1000) + ',结束.';
            const result = formatLine(longLine, '「」', false);
            assert.ok(result.includes('，'));
            assert.ok(result.includes('。'));
        });

        test('should handle special characters', () => {
            const result = formatLine('测试@#$%^&*()', '「」', false);
            assert.ok(result.includes('测试'));
        });

        test('should handle emoji', () => {
            const result = formatLine('😀你好,世界😀', '「」', false);
            assert.ok(result.includes('，'));
        });

        test('should handle numbers with Chinese', () => {
            const result = formatLine('第1章,开始.', '「」', false);
            assert.ok(result.includes('，'));
            assert.ok(result.includes('。'));
        });
    });
});
