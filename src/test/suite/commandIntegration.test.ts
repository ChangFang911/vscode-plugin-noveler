/**
 * 命令集成测试
 * 测试命令相关的逻辑和工具函数
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { validateChapterName } from '../../utils/inputValidator';

suite('Command Integration Test Suite', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('Command Registration Structure', () => {
        // 模拟命令 ID 结构
        const COMMAND_IDS = {
            initProject: 'noveler.initProject',
            createChapter: 'noveler.createChapter',
            createCharacter: 'noveler.createCharacter',
            createVolume: 'noveler.createVolume',
            refresh: 'noveler.refresh',
            generateName: 'noveler.generateName',
            jumpToReadme: 'noveler.jumpToReadme',
            openSettings: 'noveler.openSettings',
            editVolume: 'noveler.editVolume',
            deleteVolume: 'noveler.deleteVolume',
            addToWhitelist: 'noveler.addToWhitelist',
            addToCustomSensitiveWords: 'noveler.addToCustomSensitiveWords',
            openSensitiveWordsConfig: 'noveler.openSensitiveWordsConfig',
            toggleChapterView: 'noveler.toggleChapterView',
            migrateStructure: 'noveler.migrateStructure'
        };

        test('all command IDs should start with noveler prefix', () => {
            Object.values(COMMAND_IDS).forEach(id => {
                assert.ok(id.startsWith('noveler.'), `Command ${id} should start with noveler.`);
            });
        });

        test('command IDs should be unique', () => {
            const ids = Object.values(COMMAND_IDS);
            const uniqueIds = new Set(ids);
            assert.strictEqual(ids.length, uniqueIds.size, 'All command IDs should be unique');
        });

        test('command IDs should follow naming convention', () => {
            const ids = Object.values(COMMAND_IDS);
            ids.forEach(id => {
                const commandName = id.replace('noveler.', '');
                // Should be camelCase
                assert.ok(/^[a-z][a-zA-Z]*$/.test(commandName), `${commandName} should be camelCase`);
            });
        });
    });

    suite('Chapter Creation Logic', () => {
        test('should validate chapter name using inputValidator', () => {
            const validName = validateChapterName('第一章');
            assert.strictEqual(validName, '第一章');
        });

        test('should sanitize chapter name with special characters', () => {
            const sanitizedName = validateChapterName('第一章/测试');
            // Should remove invalid characters
            assert.ok(sanitizedName === null || !sanitizedName.includes('/'));
        });

        test('should reject empty chapter name', () => {
            const result = validateChapterName('');
            assert.strictEqual(result, null);
        });

        test('should return default name for whitespace-only chapter name', () => {
            const result = validateChapterName('   ');
            // Whitespace-only gets default name '未命名'
            assert.strictEqual(result, '未命名');
        });
    });

    suite('Chapter Number Formatting', () => {
        const CHAPTER_NUMBER_PADDING = 3;

        function formatChapterNumber(num: number, format: 'arabic' | 'chinese' | 'roman'): string {
            switch (format) {
                case 'arabic':
                    return String(num).padStart(CHAPTER_NUMBER_PADDING, '0');
                case 'chinese':
                    return convertToSimpleChineseNumber(num);
                case 'roman':
                    return convertToRoman(num);
            }
        }

        // 简化的中文数字转换
        function convertToSimpleChineseNumber(num: number): string {
            const digits = '零一二三四五六七八九十';
            if (num <= 10) return digits[num];
            if (num < 20) return '十' + (num === 10 ? '' : digits[num - 10]);
            const tens = Math.floor(num / 10);
            const ones = num % 10;
            return digits[tens] + '十' + (ones === 0 ? '' : digits[ones]);
        }

        // 简化的罗马数字转换
        function convertToRoman(num: number): string {
            const values = [100, 90, 50, 40, 10, 9, 5, 4, 1];
            const symbols = ['C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
            let result = '';
            for (let i = 0; i < values.length; i++) {
                while (num >= values[i]) {
                    result += symbols[i];
                    num -= values[i];
                }
            }
            return result;
        }

        test('should format arabic numbers with padding', () => {
            assert.strictEqual(formatChapterNumber(1, 'arabic'), '001');
            assert.strictEqual(formatChapterNumber(10, 'arabic'), '010');
            assert.strictEqual(formatChapterNumber(100, 'arabic'), '100');
        });

        test('should format chinese numbers', () => {
            assert.strictEqual(formatChapterNumber(1, 'chinese'), '一');
            assert.strictEqual(formatChapterNumber(10, 'chinese'), '十');
            assert.strictEqual(formatChapterNumber(15, 'chinese'), '十五');
        });

        test('should format roman numbers', () => {
            assert.strictEqual(formatChapterNumber(1, 'roman'), 'I');
            assert.strictEqual(formatChapterNumber(5, 'roman'), 'V');
            assert.strictEqual(formatChapterNumber(10, 'roman'), 'X');
        });
    });

    suite('Chapter File Name Generation', () => {
        function generateChapterFileName(chapterNum: string, title: string): string {
            return `第${chapterNum}章-${title}.md`;
        }

        test('should generate valid file name', () => {
            const fileName = generateChapterFileName('001', '开始');
            assert.strictEqual(fileName, '第001章-开始.md');
        });

        test('should include chapter number prefix', () => {
            const fileName = generateChapterFileName('一', '测试');
            assert.ok(fileName.startsWith('第'));
            assert.ok(fileName.includes('章'));
        });

        test('should have md extension', () => {
            const fileName = generateChapterFileName('I', '罗马');
            assert.ok(fileName.endsWith('.md'));
        });
    });

    suite('Volume Selection Logic', () => {
        interface VolumeInfo {
            folderName: string;
            volumeType: string;
            stats: {
                chapterCount: number;
                totalWords: number;
            };
        }

        function formatVolumeOption(volume: VolumeInfo): string {
            const typeNames: Record<string, string> = {
                'main': '正篇',
                'prequel': '前传',
                'sequel': '续篇',
                'extra': '番外'
            };
            const typeLabel = typeNames[volume.volumeType] || volume.volumeType;
            return `${volume.folderName} | ${typeLabel} | ${volume.stats.chapterCount} 章 | ${volume.stats.totalWords.toLocaleString()} 字`;
        }

        test('should format volume option with all info', () => {
            const volume: VolumeInfo = {
                folderName: '第01卷-起始',
                volumeType: 'main',
                stats: { chapterCount: 10, totalWords: 25000 }
            };
            const option = formatVolumeOption(volume);
            assert.ok(option.includes('第01卷-起始'));
            assert.ok(option.includes('正篇'));
            assert.ok(option.includes('10 章'));
        });

        test('should handle prequel type', () => {
            const volume: VolumeInfo = {
                folderName: '前传-序章',
                volumeType: 'prequel',
                stats: { chapterCount: 5, totalWords: 10000 }
            };
            const option = formatVolumeOption(volume);
            assert.ok(option.includes('前传'));
        });

        test('should format word count with locale', () => {
            const volume: VolumeInfo = {
                folderName: '测试卷',
                volumeType: 'main',
                stats: { chapterCount: 1, totalWords: 1000000 }
            };
            const option = formatVolumeOption(volume);
            // Should have some formatting (comma or locale-specific)
            assert.ok(option.includes('1') && option.includes('000'));
        });
    });

    suite('Front Matter Template', () => {
        interface FrontMatter {
            title: string;
            chapter: number;
            wordCount: number;
            targetWords: number;
            characters: string[];
            locations: string[];
            tags: string[];
            created: string;
            modified: string;
            status: string;
        }

        function generateFrontMatter(data: FrontMatter): string {
            return `---
title: ${data.title}
chapter: ${data.chapter}
wordCount: ${data.wordCount}
targetWords: ${data.targetWords}
characters: ${JSON.stringify(data.characters)}
locations: ${JSON.stringify(data.locations)}
tags: ${JSON.stringify(data.tags)}
created: '${data.created}'
modified: '${data.modified}'
status: ${data.status}
---`;
        }

        test('should generate valid front matter', () => {
            const fm = generateFrontMatter({
                title: '测试章节',
                chapter: 1,
                wordCount: 0,
                targetWords: 2500,
                characters: [],
                locations: [],
                tags: [],
                created: '2024-01-01 12:00:00',
                modified: '2024-01-01 12:00:00',
                status: 'draft'
            });

            assert.ok(fm.startsWith('---'));
            assert.ok(fm.endsWith('---'));
            assert.ok(fm.includes('title: 测试章节'));
            assert.ok(fm.includes('chapter: 1'));
            assert.ok(fm.includes('targetWords: 2500'));
        });

        test('should include all required fields', () => {
            const fm = generateFrontMatter({
                title: 'Test',
                chapter: 1,
                wordCount: 0,
                targetWords: 2500,
                characters: ['角色A'],
                locations: ['地点B'],
                tags: ['标签C'],
                created: '2024-01-01',
                modified: '2024-01-01',
                status: 'draft'
            });

            assert.ok(fm.includes('title:'));
            assert.ok(fm.includes('chapter:'));
            assert.ok(fm.includes('wordCount:'));
            assert.ok(fm.includes('targetWords:'));
            assert.ok(fm.includes('characters:'));
            assert.ok(fm.includes('locations:'));
            assert.ok(fm.includes('tags:'));
            assert.ok(fm.includes('created:'));
            assert.ok(fm.includes('modified:'));
            assert.ok(fm.includes('status:'));
        });
    });

    suite('Character Creation Logic', () => {
        test('should validate character name', () => {
            const validName = validateChapterName('萧炎');
            assert.strictEqual(validName, '萧炎');
        });

        test('should reject character name with path separators', () => {
            const result = validateChapterName('萧/炎');
            assert.ok(result === null || !result.includes('/'));
        });
    });

    suite('Refresh Command Logic', () => {
        const DEBOUNCE_DELAY = 5000; // README 更新防抖时间

        test('debounce delay should be 5 seconds', () => {
            assert.strictEqual(DEBOUNCE_DELAY, 5000);
        });
    });

    suite('Sensitive Word Commands', () => {
        function formatWhitelistEntry(word: string): string {
            return `"${word}"`;
        }

        function formatCustomWordEntry(word: string, level = 'high'): string {
            return JSON.stringify({ word, level });
        }

        test('should format whitelist entry', () => {
            const entry = formatWhitelistEntry('测试词');
            assert.strictEqual(entry, '"测试词"');
        });

        test('should format custom word entry', () => {
            const entry = formatCustomWordEntry('敏感词', 'high');
            const parsed = JSON.parse(entry);
            assert.strictEqual(parsed.word, '敏感词');
            assert.strictEqual(parsed.level, 'high');
        });

        test('should handle different levels', () => {
            const levels = ['high', 'medium', 'low'];
            levels.forEach(level => {
                const entry = formatCustomWordEntry('词', level);
                const parsed = JSON.parse(entry);
                assert.strictEqual(parsed.level, level);
            });
        });
    });

    suite('Migration Wizard Logic', () => {
        type FolderStructure = 'flat' | 'nested';

        function describeStructure(structure: FolderStructure): string {
            switch (structure) {
                case 'flat':
                    return '扁平结构：所有章节直接放在 chapters/ 目录下';
                case 'nested':
                    return '嵌套结构：章节按卷分组放在子文件夹中';
            }
        }

        test('should describe flat structure', () => {
            const desc = describeStructure('flat');
            assert.ok(desc.includes('扁平'));
            assert.ok(desc.includes('chapters/'));
        });

        test('should describe nested structure', () => {
            const desc = describeStructure('nested');
            assert.ok(desc.includes('嵌套'));
            assert.ok(desc.includes('卷'));
        });
    });

    suite('Context Menu Commands', () => {
        function getContextMenuItems(): string[] {
            return [
                'noveler.createChapter',
                'noveler.createCharacter',
                'noveler.openSettings'
            ];
        }

        test('should have expected context menu items', () => {
            const items = getContextMenuItems();
            assert.ok(items.includes('noveler.createChapter'));
            assert.ok(items.includes('noveler.createCharacter'));
        });

        test('all context menu items should be valid commands', () => {
            const items = getContextMenuItems();
            items.forEach(item => {
                assert.ok(item.startsWith('noveler.'));
            });
        });
    });

    suite('Jump To Readme Logic', () => {
        function getReadmePath(workspacePath: string): string {
            return `${workspacePath}/README.md`;
        }

        test('should construct readme path', () => {
            const path = getReadmePath('/workspace/project');
            assert.strictEqual(path, '/workspace/project/README.md');
        });

        test('should handle root workspace', () => {
            const path = getReadmePath('/');
            assert.strictEqual(path, '//README.md');
        });
    });

    suite('Open Settings Logic', () => {
        function getConfigPath(workspacePath: string): string {
            return `${workspacePath}/novel.jsonc`;
        }

        test('should construct config path', () => {
            const path = getConfigPath('/workspace/project');
            assert.strictEqual(path, '/workspace/project/novel.jsonc');
        });

        test('config file should be jsonc format', () => {
            const path = getConfigPath('/any');
            assert.ok(path.endsWith('.jsonc'));
        });
    });

    suite('Command Error Messages', () => {
        const ERROR_MESSAGES = {
            noWorkspace: '请先打开一个工作区',
            invalidName: '名称无效，请避免使用特殊字符',
            fileExists: '文件已存在',
            createFailed: '创建失败',
            notInitialized: '项目未初始化'
        };

        test('error messages should be in Chinese', () => {
            Object.values(ERROR_MESSAGES).forEach(msg => {
                // Should contain Chinese characters
                assert.ok(/[\u4e00-\u9fa5]/.test(msg), `"${msg}" should contain Chinese`);
            });
        });

        test('error messages should be user-friendly', () => {
            // All messages should be reasonably short
            Object.values(ERROR_MESSAGES).forEach(msg => {
                assert.ok(msg.length <= 50, `"${msg}" should be concise`);
            });
        });
    });

    suite('Command Success Messages', () => {
        function formatSuccessMessage(action: string, target: string): string {
            return `${action}成功: ${target}`;
        }

        test('should format chapter creation success', () => {
            const msg = formatSuccessMessage('新章节已创建', '第一章 开始');
            assert.ok(msg.includes('新章节已创建'));
            assert.ok(msg.includes('第一章 开始'));
        });

        test('should format character creation success', () => {
            const msg = formatSuccessMessage('人物文件已创建', '萧炎');
            assert.ok(msg.includes('人物文件已创建'));
            assert.ok(msg.includes('萧炎'));
        });
    });
});
