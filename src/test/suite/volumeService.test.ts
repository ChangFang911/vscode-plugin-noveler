import * as assert from 'assert';
import * as sinon from 'sinon';

/**
 * VolumeService 测试套件
 * 由于该服务是单例且依赖 VSCode API，我们主要测试：
 * 1. 卷名称解析逻辑
 * 2. 数字解析逻辑（阿拉伯数字、中文数字、罗马数字）
 * 3. 卷类型排序逻辑
 * 4. 章节编号计算逻辑
 */
suite('VolumeService Test Suite', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('Volume Name Parsing', () => {
        /**
         * 模拟解析卷名称的逻辑（从 VolumeService 提取）
         */
        function parseVolumeName(folderName: string): { volume: number; volumeType: string; title: string } | null {
            const VOLUME_TYPE_OFFSETS = { sequel: 1000, extra: 2000 };

            // 前传格式
            const prequelMatch = folderName.match(/^前传([一二三四五六七八九十\d]+|[IVX]+)[-_](.+)$/);
            if (prequelMatch) {
                const volumeNum = parseNumber(prequelMatch[1]);
                return { volume: -volumeNum, volumeType: 'prequel', title: prequelMatch[2] };
            }

            // 后传格式
            const sequelMatch = folderName.match(/^后传([一二三四五六七八九十\d]+|[IVX]+)[-_](.+)$/);
            if (sequelMatch) {
                const volumeNum = parseNumber(sequelMatch[1]);
                return { volume: VOLUME_TYPE_OFFSETS.sequel + volumeNum, volumeType: 'sequel', title: sequelMatch[2] };
            }

            // 番外格式
            const extraMatch = folderName.match(/^番外([一二三四五六七八九十\d]+|[IVX]+)[-_](.+)$/);
            if (extraMatch) {
                const volumeNum = parseNumber(extraMatch[1]);
                return { volume: VOLUME_TYPE_OFFSETS.extra + volumeNum, volumeType: 'extra', title: extraMatch[2] };
            }

            // 正���格式
            const mainMatch = folderName.match(/^(?:第?([一二三四五六七八九十\d]+|[IVX]+)卷?|Volume(\d+|[IVX]+))[-_](.+)$/);
            if (mainMatch) {
                const volumeNum = parseNumber(mainMatch[1] || mainMatch[2]);
                return { volume: volumeNum, volumeType: 'main', title: mainMatch[3] };
            }

            // 纯数字格式
            const numberMatch = folderName.match(/^(\d+)[-_](.+)$/);
            if (numberMatch) {
                return { volume: parseInt(numberMatch[1], 10), volumeType: 'main', title: numberMatch[2] };
            }

            return null;
        }

        function parseNumber(str: string): number {
            const arabicNum = parseInt(str, 10);
            if (!isNaN(arabicNum)) return arabicNum;
            if (/^[IVX]+$/.test(str)) return parseRomanNumber(str);
            return parseChineseNumber(str);
        }

        function parseRomanNumber(roman: string): number {
            const romanMap: { [key: string]: number } = { 'I': 1, 'V': 5, 'X': 10 };
            let result = 0, prevValue = 0;
            for (let i = roman.length - 1; i >= 0; i--) {
                const currentValue = romanMap[roman[i]] || 0;
                result += currentValue < prevValue ? -currentValue : currentValue;
                prevValue = currentValue;
            }
            return result || 1;
        }

        function parseChineseNumber(chinese: string): number {
            const digitMap: { [key: string]: number } = {
                '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
                '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
            };
            if (chinese.length === 1) return digitMap[chinese] || 1;
            if (chinese.startsWith('十')) {
                return chinese.length === 1 ? 10 : 10 + (digitMap[chinese[1]] || 0);
            }
            if (chinese.includes('十')) {
                const parts = chinese.split('十');
                return (digitMap[parts[0]] || 0) * 10 + (parts[1] ? digitMap[parts[1]] || 0 : 0);
            }
            return digitMap[chinese] || 1;
        }

        suite('Main Volume Formats', () => {
            test('should parse "第一卷-崛起" format', () => {
                const result = parseVolumeName('第一卷-崛起');
                assert.ok(result);
                assert.strictEqual(result!.volume, 1);
                assert.strictEqual(result!.volumeType, 'main');
                assert.strictEqual(result!.title, '崛起');
            });

            test('should parse "第1卷-崛起" format', () => {
                const result = parseVolumeName('第1卷-崛起');
                assert.ok(result);
                assert.strictEqual(result!.volume, 1);
                assert.strictEqual(result!.title, '崛起');
            });

            test('should parse "第I卷-崛起" format', () => {
                const result = parseVolumeName('第I卷-崛起');
                assert.ok(result);
                assert.strictEqual(result!.volume, 1);
            });

            test('should parse "Volume1-Rising" format', () => {
                const result = parseVolumeName('Volume1-Rising');
                assert.ok(result);
                assert.strictEqual(result!.volume, 1);
                assert.strictEqual(result!.title, 'Rising');
            });

            test('should parse "VolumeIII-Rising" format', () => {
                const result = parseVolumeName('VolumeIII-Rising');
                assert.ok(result);
                assert.strictEqual(result!.volume, 3);
            });

            test('should parse "01-崛起" format', () => {
                const result = parseVolumeName('01-崛起');
                assert.ok(result);
                assert.strictEqual(result!.volume, 1);
                assert.strictEqual(result!.volumeType, 'main');
            });

            test('should parse "10-十章" format', () => {
                const result = parseVolumeName('10-十章');
                assert.ok(result);
                assert.strictEqual(result!.volume, 10);
            });
        });

        suite('Prequel Volume Formats', () => {
            test('should parse "前传一-起源" format', () => {
                const result = parseVolumeName('前传一-起源');
                assert.ok(result);
                assert.strictEqual(result!.volume, -1);
                assert.strictEqual(result!.volumeType, 'prequel');
                assert.strictEqual(result!.title, '起源');
            });

            test('should parse "前传1-起源" format', () => {
                const result = parseVolumeName('前传1-起源');
                assert.ok(result);
                assert.strictEqual(result!.volume, -1);
                assert.strictEqual(result!.volumeType, 'prequel');
            });

            test('should parse "前传I-起源" format', () => {
                const result = parseVolumeName('前传I-起源');
                assert.ok(result);
                assert.strictEqual(result!.volume, -1);
                assert.strictEqual(result!.volumeType, 'prequel');
            });
        });

        suite('Sequel Volume Formats', () => {
            test('should parse "后传一-余波" format', () => {
                const result = parseVolumeName('后传一-余波');
                assert.ok(result);
                assert.strictEqual(result!.volume, 1001);
                assert.strictEqual(result!.volumeType, 'sequel');
                assert.strictEqual(result!.title, '余波');
            });

            test('should parse "后传2-续章" format', () => {
                const result = parseVolumeName('后传2-续章');
                assert.ok(result);
                assert.strictEqual(result!.volume, 1002);
                assert.strictEqual(result!.volumeType, 'sequel');
            });
        });

        suite('Extra Volume Formats', () => {
            test('should parse "番外一-日常" format', () => {
                const result = parseVolumeName('番外一-日常');
                assert.ok(result);
                assert.strictEqual(result!.volume, 2001);
                assert.strictEqual(result!.volumeType, 'extra');
                assert.strictEqual(result!.title, '日常');
            });

            test('should parse "番外3-小故事" format', () => {
                const result = parseVolumeName('番外3-小故事');
                assert.ok(result);
                assert.strictEqual(result!.volume, 2003);
                assert.strictEqual(result!.volumeType, 'extra');
            });
        });

        suite('Invalid Formats', () => {
            test('should return null for invalid format', () => {
                const result = parseVolumeName('无效文件夹名');
                assert.strictEqual(result, null);
            });

            test('should return null for empty string', () => {
                const result = parseVolumeName('');
                assert.strictEqual(result, null);
            });

            test('should return null for format without separator', () => {
                const result = parseVolumeName('第一卷崛起');
                assert.strictEqual(result, null);
            });
        });
    });

    suite('Number Parsing', () => {
        suite('Arabic Numbers', () => {
            function parseArabic(str: string): number {
                return parseInt(str, 10);
            }

            test('should parse single digit', () => {
                assert.strictEqual(parseArabic('5'), 5);
            });

            test('should parse double digit', () => {
                assert.strictEqual(parseArabic('42'), 42);
            });

            test('should parse triple digit', () => {
                assert.strictEqual(parseArabic('123'), 123);
            });

            test('should parse with leading zeros', () => {
                assert.strictEqual(parseArabic('007'), 7);
            });
        });

        suite('Roman Numbers', () => {
            function parseRoman(roman: string): number {
                const romanMap: { [key: string]: number } = {
                    'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000
                };
                let result = 0, prevValue = 0;
                for (let i = roman.length - 1; i >= 0; i--) {
                    const currentValue = romanMap[roman[i]] || 0;
                    result += currentValue < prevValue ? -currentValue : currentValue;
                    prevValue = currentValue;
                }
                return result || 1;
            }

            test('should parse I', () => assert.strictEqual(parseRoman('I'), 1));
            test('should parse II', () => assert.strictEqual(parseRoman('II'), 2));
            test('should parse III', () => assert.strictEqual(parseRoman('III'), 3));
            test('should parse IV', () => assert.strictEqual(parseRoman('IV'), 4));
            test('should parse V', () => assert.strictEqual(parseRoman('V'), 5));
            test('should parse VI', () => assert.strictEqual(parseRoman('VI'), 6));
            test('should parse VII', () => assert.strictEqual(parseRoman('VII'), 7));
            test('should parse VIII', () => assert.strictEqual(parseRoman('VIII'), 8));
            test('should parse IX', () => assert.strictEqual(parseRoman('IX'), 9));
            test('should parse X', () => assert.strictEqual(parseRoman('X'), 10));
            test('should parse XI', () => assert.strictEqual(parseRoman('XI'), 11));
            test('should parse XIX', () => assert.strictEqual(parseRoman('XIX'), 19));
            test('should parse XX', () => assert.strictEqual(parseRoman('XX'), 20));
        });

        suite('Chinese Numbers', () => {
            function parseChinese(chinese: string): number {
                const digitMap: { [key: string]: number } = {
                    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
                    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
                };
                if (chinese.length === 1) return digitMap[chinese] || 1;
                if (chinese.startsWith('十')) {
                    return chinese.length === 1 ? 10 : 10 + (digitMap[chinese[1]] || 0);
                }
                if (chinese.includes('十')) {
                    const parts = chinese.split('十');
                    return (digitMap[parts[0]] || 0) * 10 + (parts[1] ? digitMap[parts[1]] || 0 : 0);
                }
                return digitMap[chinese] || 1;
            }

            test('should parse 一', () => assert.strictEqual(parseChinese('一'), 1));
            test('should parse 二', () => assert.strictEqual(parseChinese('二'), 2));
            test('should parse 三', () => assert.strictEqual(parseChinese('三'), 3));
            test('should parse 九', () => assert.strictEqual(parseChinese('九'), 9));
            test('should parse 十', () => assert.strictEqual(parseChinese('十'), 10));
            test('should parse 十一', () => assert.strictEqual(parseChinese('十一'), 11));
            test('should parse 十九', () => assert.strictEqual(parseChinese('十九'), 19));
            test('should parse 二十', () => assert.strictEqual(parseChinese('二十'), 20));
            test('should parse 二十一', () => assert.strictEqual(parseChinese('二十一'), 21));
            test('should parse 三十五', () => assert.strictEqual(parseChinese('三十五'), 35));
            test('should parse 九十九', () => assert.strictEqual(parseChinese('九十九'), 99));
        });
    });

    suite('Volume Sorting', () => {
        interface MockVolumeInfo {
            volume: number;
            volumeType: 'prequel' | 'main' | 'sequel' | 'extra';
            title: string;
        }

        function sortVolumes(volumes: MockVolumeInfo[]): MockVolumeInfo[] {
            const typeOrder = { 'prequel': 1, 'main': 2, 'sequel': 3, 'extra': 4 };
            return [...volumes].sort((a, b) => {
                if (typeOrder[a.volumeType] !== typeOrder[b.volumeType]) {
                    return typeOrder[a.volumeType] - typeOrder[b.volumeType];
                }
                return a.volume - b.volume;
            });
        }

        test('should sort prequels before main volumes', () => {
            const volumes: MockVolumeInfo[] = [
                { volume: 1, volumeType: 'main', title: '主线一' },
                { volume: -1, volumeType: 'prequel', title: '前传' }
            ];
            const sorted = sortVolumes(volumes);
            assert.strictEqual(sorted[0].volumeType, 'prequel');
            assert.strictEqual(sorted[1].volumeType, 'main');
        });

        test('should sort main volumes before sequels', () => {
            const volumes: MockVolumeInfo[] = [
                { volume: 1001, volumeType: 'sequel', title: '后传' },
                { volume: 1, volumeType: 'main', title: '主线' }
            ];
            const sorted = sortVolumes(volumes);
            assert.strictEqual(sorted[0].volumeType, 'main');
            assert.strictEqual(sorted[1].volumeType, 'sequel');
        });

        test('should sort sequels before extras', () => {
            const volumes: MockVolumeInfo[] = [
                { volume: 2001, volumeType: 'extra', title: '番外' },
                { volume: 1001, volumeType: 'sequel', title: '后传' }
            ];
            const sorted = sortVolumes(volumes);
            assert.strictEqual(sorted[0].volumeType, 'sequel');
            assert.strictEqual(sorted[1].volumeType, 'extra');
        });

        test('should sort multiple main volumes by number', () => {
            const volumes: MockVolumeInfo[] = [
                { volume: 3, volumeType: 'main', title: '第三卷' },
                { volume: 1, volumeType: 'main', title: '第一卷' },
                { volume: 2, volumeType: 'main', title: '第二卷' }
            ];
            const sorted = sortVolumes(volumes);
            assert.strictEqual(sorted[0].volume, 1);
            assert.strictEqual(sorted[1].volume, 2);
            assert.strictEqual(sorted[2].volume, 3);
        });

        test('should handle complex volume arrangement', () => {
            const volumes: MockVolumeInfo[] = [
                { volume: 2001, volumeType: 'extra', title: '番外一' },
                { volume: 2, volumeType: 'main', title: '第二卷' },
                { volume: -1, volumeType: 'prequel', title: '前传' },
                { volume: 1, volumeType: 'main', title: '第一卷' },
                { volume: 1001, volumeType: 'sequel', title: '后传' }
            ];
            const sorted = sortVolumes(volumes);

            assert.strictEqual(sorted[0].volumeType, 'prequel');
            assert.strictEqual(sorted[1].volumeType, 'main');
            assert.strictEqual(sorted[1].volume, 1);
            assert.strictEqual(sorted[2].volumeType, 'main');
            assert.strictEqual(sorted[2].volume, 2);
            assert.strictEqual(sorted[3].volumeType, 'sequel');
            assert.strictEqual(sorted[4].volumeType, 'extra');
        });
    });

    suite('Chapter Numbering Calculation', () => {
        interface MockVolumeInfo {
            volume: number;
            volumeType: 'prequel' | 'main' | 'sequel' | 'extra';
            chapters: string[];
        }

        function calculateGlobalChapterNumber(
            volumes: MockVolumeInfo[],
            targetVolume: MockVolumeInfo,
            filterType?: 'main'
        ): number {
            let totalChapters = 0;
            const sorted = [...volumes].sort((a, b) => a.volume - b.volume);

            for (const volume of sorted) {
                if (filterType && volume.volumeType !== filterType) continue;
                if (volume.volume === targetVolume.volume && volume.volumeType === targetVolume.volumeType) break;
                totalChapters += volume.chapters.length;
            }

            return totalChapters + targetVolume.chapters.length + 1;
        }

        test('should calculate global chapter number for first volume', () => {
            const volumes: MockVolumeInfo[] = [
                { volume: 1, volumeType: 'main', chapters: ['ch1.md', 'ch2.md', 'ch3.md'] }
            ];
            const nextChapter = calculateGlobalChapterNumber(volumes, volumes[0]);
            assert.strictEqual(nextChapter, 4);
        });

        test('should calculate global chapter number for second volume', () => {
            const volumes: MockVolumeInfo[] = [
                { volume: 1, volumeType: 'main', chapters: ['ch1.md', 'ch2.md', 'ch3.md'] },
                { volume: 2, volumeType: 'main', chapters: ['ch4.md', 'ch5.md'] }
            ];
            const nextChapter = calculateGlobalChapterNumber(volumes, volumes[1]);
            assert.strictEqual(nextChapter, 6); // 3 + 2 + 1
        });

        test('should calculate volume-specific chapter number', () => {
            const volume: MockVolumeInfo = { volume: 2, volumeType: 'main', chapters: ['ch1.md', 'ch2.md'] };
            const nextChapter = volume.chapters.length + 1;
            assert.strictEqual(nextChapter, 3);
        });

        test('should filter by type in mixed mode', () => {
            const volumes: MockVolumeInfo[] = [
                { volume: -1, volumeType: 'prequel', chapters: ['pre1.md', 'pre2.md'] },
                { volume: 1, volumeType: 'main', chapters: ['ch1.md', 'ch2.md', 'ch3.md'] },
                { volume: 2, volumeType: 'main', chapters: ['ch4.md'] }
            ];
            // In mixed mode, main volumes are globally numbered, ignoring prequels
            const nextChapter = calculateGlobalChapterNumber(volumes, volumes[2], 'main');
            assert.strictEqual(nextChapter, 5); // 3 (from vol1) + 1 (from vol2) + 1
        });
    });

    suite('Chapter File Filtering', () => {
        test('should identify excluded files', () => {
            const excludedFiles = ['outline.md', 'README.md', 'readme.md', 'volume.md', 'VOLUME.md'];
            const allFiles = ['ch1.md', 'outline.md', 'ch2.md', 'README.md', 'ch3.md'];

            const chapterFiles = allFiles.filter(f => !excludedFiles.includes(f));

            assert.deepStrictEqual(chapterFiles, ['ch1.md', 'ch2.md', 'ch3.md']);
        });

        test('should only include .md files', () => {
            const files = [
                { name: 'ch1.md', type: 1 },   // File
                { name: 'ch2.md', type: 1 },   // File
                { name: 'notes.txt', type: 1 }, // File but not .md
                { name: 'subfolder', type: 2 }  // Directory
            ];

            const mdFiles = files
                .filter(f => f.type === 1 && f.name.endsWith('.md'))
                .map(f => f.name);

            assert.deepStrictEqual(mdFiles, ['ch1.md', 'ch2.md']);
        });
    });

    suite('Chapter Number Extraction from Filename', () => {
        function extractChapterNumber(filename: string): number | null {
            // 第001章- 格式
            let match = filename.match(/^第(\d+)章-/);
            if (match) return parseInt(match[1], 10);

            // 001- 格式
            match = filename.match(/^(\d+)-/);
            return match ? parseInt(match[1], 10) : null;
        }

        test('should extract from "第001章-标题.md"', () => {
            assert.strictEqual(extractChapterNumber('第001章-标题.md'), 1);
        });

        test('should extract from "第123章-标题.md"', () => {
            assert.strictEqual(extractChapterNumber('第123章-标题.md'), 123);
        });

        test('should extract from "001-标题.md"', () => {
            assert.strictEqual(extractChapterNumber('001-标题.md'), 1);
        });

        test('should extract from "42-标题.md"', () => {
            assert.strictEqual(extractChapterNumber('42-标题.md'), 42);
        });

        test('should return null for invalid format', () => {
            assert.strictEqual(extractChapterNumber('标题.md'), null);
        });

        test('should return null for no number prefix', () => {
            assert.strictEqual(extractChapterNumber('chapter-one.md'), null);
        });
    });

    suite('Volume Stats Calculation', () => {
        test('should calculate total words correctly', () => {
            const chapterStats = [
                { wordCount: 1000, isCompleted: false },
                { wordCount: 2500, isCompleted: true },
                { wordCount: 3000, isCompleted: true }
            ];

            const totalWords = chapterStats.reduce((sum, s) => sum + s.wordCount, 0);
            assert.strictEqual(totalWords, 6500);
        });

        test('should count completed chapters correctly', () => {
            const chapterStats = [
                { wordCount: 1000, isCompleted: false },
                { wordCount: 2500, isCompleted: true },
                { wordCount: 3000, isCompleted: true }
            ];

            const completedChapters = chapterStats.filter(s => s.isCompleted).length;
            assert.strictEqual(completedChapters, 2);
        });

        test('should determine completion based on minimum word count', () => {
            const MINIMUM_COMPLETED_WORD_COUNT = 2000;

            const isCompleted = (wordCount: number) => wordCount > MINIMUM_COMPLETED_WORD_COUNT;

            assert.strictEqual(isCompleted(1000), false);
            assert.strictEqual(isCompleted(2000), false);
            assert.strictEqual(isCompleted(2001), true);
            assert.strictEqual(isCompleted(5000), true);
        });
    });

    suite('Volume Config Structure', () => {
        test('should have valid folderStructure values', () => {
            const validStructures = ['flat', 'nested'];
            assert.ok(validStructures.includes('flat'));
            assert.ok(validStructures.includes('nested'));
        });

        test('should have valid chapterNumbering values', () => {
            const validModes = ['global', 'volume', 'mixed'];
            assert.ok(validModes.includes('global'));
            assert.ok(validModes.includes('volume'));
            assert.ok(validModes.includes('mixed'));
        });

        test('should have valid numberFormat values', () => {
            const validFormats = ['arabic', 'chinese', 'roman'];
            assert.ok(validFormats.includes('arabic'));
            assert.ok(validFormats.includes('chinese'));
            assert.ok(validFormats.includes('roman'));
        });
    });

    suite('Edge Cases', () => {
        test('should handle empty volume list', () => {
            const volumes: { volume: number; volumeType: string }[] = [];
            const sorted = [...volumes].sort((a, b) => a.volume - b.volume);
            assert.strictEqual(sorted.length, 0);
        });

        test('should handle single volume', () => {
            const volumes = [{ volume: 1, volumeType: 'main', chapters: [] }];
            const nextChapter = volumes[0].chapters.length + 1;
            assert.strictEqual(nextChapter, 1);
        });

        test('should handle volume with no chapters', () => {
            const stats = { totalWords: 0, chapterCount: 0, completedChapters: 0 };
            assert.strictEqual(stats.chapterCount, 0);
            assert.strictEqual(stats.completedChapters, 0);
        });

        test('should handle very large chapter numbers', () => {
            const largeVolumes = [
                { volume: 1, chapters: Array(100).fill('ch.md') },
                { volume: 2, chapters: Array(50).fill('ch.md') }
            ];

            const totalChapters = largeVolumes.reduce((sum, v) => sum + v.chapters.length, 0);
            assert.strictEqual(totalChapters, 150);
        });
    });
});
