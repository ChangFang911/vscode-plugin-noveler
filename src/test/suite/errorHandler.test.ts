/**
 * 错误处理工具测试
 * 测试 ErrorSeverity 枚举和错误消息格式化
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ErrorSeverity } from '../../utils/errorHandler';

suite('ErrorHandler Test Suite', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('ErrorSeverity Enum', () => {
        test('should have Silent value', () => {
            assert.strictEqual(ErrorSeverity.Silent, 'silent');
        });

        test('should have Warning value', () => {
            assert.strictEqual(ErrorSeverity.Warning, 'warning');
        });

        test('should have Error value', () => {
            assert.strictEqual(ErrorSeverity.Error, 'error');
        });

        test('should have exactly 3 values', () => {
            const values = Object.values(ErrorSeverity);
            assert.strictEqual(values.length, 3);
        });

        test('all values should be strings', () => {
            const values = Object.values(ErrorSeverity);
            values.forEach(value => {
                assert.strictEqual(typeof value, 'string');
            });
        });
    });

    suite('Error Message Extraction', () => {
        function extractErrorMessage(error: unknown): string {
            return error instanceof Error ? error.message : String(error);
        }

        test('should extract message from Error object', () => {
            const error = new Error('Test error message');
            const message = extractErrorMessage(error);
            assert.strictEqual(message, 'Test error message');
        });

        test('should convert string to string', () => {
            const error = 'Simple string error';
            const message = extractErrorMessage(error);
            assert.strictEqual(message, 'Simple string error');
        });

        test('should convert number to string', () => {
            const error = 404;
            const message = extractErrorMessage(error);
            assert.strictEqual(message, '404');
        });

        test('should convert object to string', () => {
            const error = { code: 'ERR_TEST' };
            const message = extractErrorMessage(error);
            assert.strictEqual(message, '[object Object]');
        });

        test('should convert null to string', () => {
            const error = null;
            const message = extractErrorMessage(error);
            assert.strictEqual(message, 'null');
        });

        test('should convert undefined to string', () => {
            const error = undefined;
            const message = extractErrorMessage(error);
            assert.strictEqual(message, 'undefined');
        });

        test('should handle nested Error', () => {
            const innerError = new Error('Inner error');
            const outerError = new Error(`Outer: ${innerError.message}`);
            const message = extractErrorMessage(outerError);
            assert.strictEqual(message, 'Outer: Inner error');
        });
    });

    suite('Error Message Formatting', () => {
        function formatErrorMessage(operation: string, errorMsg: string): string {
            return `Noveler: ${operation} - ${errorMsg}`;
        }

        test('should format basic error message', () => {
            const result = formatErrorMessage('创建章节失败', '文件已存在');
            assert.strictEqual(result, 'Noveler: 创建章节失败 - 文件已存在');
        });

        test('should handle empty operation', () => {
            const result = formatErrorMessage('', '未知错误');
            assert.strictEqual(result, 'Noveler:  - 未知错误');
        });

        test('should handle empty error message', () => {
            const result = formatErrorMessage('操作失败', '');
            assert.strictEqual(result, 'Noveler: 操作失败 - ');
        });

        test('should handle Chinese characters', () => {
            const result = formatErrorMessage('保存配置失败', '权限不足');
            assert.ok(result.includes('保存配置失败'));
            assert.ok(result.includes('权限不足'));
        });

        test('should handle special characters', () => {
            const result = formatErrorMessage('读取文件失败', 'Path: /path/to/file.md');
            assert.ok(result.includes('/path/to/file.md'));
        });
    });

    suite('Severity Level Handling', () => {
        function getSeverityLevel(severity: ErrorSeverity): number {
            switch (severity) {
                case ErrorSeverity.Silent:
                    return 0;
                case ErrorSeverity.Warning:
                    return 1;
                case ErrorSeverity.Error:
                    return 2;
                default:
                    return -1;
            }
        }

        test('Silent should have lowest level', () => {
            assert.strictEqual(getSeverityLevel(ErrorSeverity.Silent), 0);
        });

        test('Warning should have medium level', () => {
            assert.strictEqual(getSeverityLevel(ErrorSeverity.Warning), 1);
        });

        test('Error should have highest level', () => {
            assert.strictEqual(getSeverityLevel(ErrorSeverity.Error), 2);
        });

        test('severity levels should be ordered', () => {
            assert.ok(getSeverityLevel(ErrorSeverity.Silent) < getSeverityLevel(ErrorSeverity.Warning));
            assert.ok(getSeverityLevel(ErrorSeverity.Warning) < getSeverityLevel(ErrorSeverity.Error));
        });
    });

    suite('Success Message Formatting', () => {
        function formatSuccessMessage(message: string): string {
            return `Noveler: ${message}`;
        }

        test('should format basic success message', () => {
            const result = formatSuccessMessage('章节创建成功');
            assert.strictEqual(result, 'Noveler: 章节创建成功');
        });

        test('should handle complex message', () => {
            const result = formatSuccessMessage('已创建 10 个章节文件');
            assert.strictEqual(result, 'Noveler: 已创建 10 个章节文件');
        });

        test('should handle emoji', () => {
            const result = formatSuccessMessage('✅ 操作完成');
            assert.ok(result.includes('✅'));
        });
    });

    suite('Error Type Detection', () => {
        function isSystemError(error: unknown): boolean {
            if (error instanceof Error) {
                const systemErrorCodes = ['ENOENT', 'EACCES', 'EPERM', 'EEXIST'];
                return systemErrorCodes.some(code => error.message.includes(code));
            }
            return false;
        }

        test('should detect ENOENT error', () => {
            const error = new Error('ENOENT: no such file or directory');
            assert.strictEqual(isSystemError(error), true);
        });

        test('should detect EACCES error', () => {
            const error = new Error('EACCES: permission denied');
            assert.strictEqual(isSystemError(error), true);
        });

        test('should detect EPERM error', () => {
            const error = new Error('EPERM: operation not permitted');
            assert.strictEqual(isSystemError(error), true);
        });

        test('should detect EEXIST error', () => {
            const error = new Error('EEXIST: file already exists');
            assert.strictEqual(isSystemError(error), true);
        });

        test('should return false for non-system error', () => {
            const error = new Error('Custom application error');
            assert.strictEqual(isSystemError(error), false);
        });

        test('should return false for non-Error', () => {
            const error = 'Simple string error';
            assert.strictEqual(isSystemError(error), false);
        });
    });

    suite('Error Stack Processing', () => {
        function getFirstStackLine(error: Error): string | null {
            if (!error.stack) {
                return null;
            }
            const lines = error.stack.split('\n');
            // Skip the first line (error message) and get the first stack frame
            return lines.length > 1 ? lines[1].trim() : null;
        }

        test('should extract first stack line', () => {
            const error = new Error('Test error');
            const stackLine = getFirstStackLine(error);
            assert.ok(stackLine === null || stackLine.startsWith('at '));
        });

        test('should handle error without stack', () => {
            const error = new Error('Test error');
            error.stack = undefined;
            const stackLine = getFirstStackLine(error);
            assert.strictEqual(stackLine, null);
        });

        test('should handle empty stack', () => {
            const error = new Error('Test error');
            error.stack = '';
            const stackLine = getFirstStackLine(error);
            assert.strictEqual(stackLine, null);
        });
    });

    suite('Operation Name Validation', () => {
        function isValidOperationName(name: string): boolean {
            // Operation name should not be empty and should be a reasonable length
            return name.length > 0 && name.length <= 100;
        }

        test('should accept valid operation name', () => {
            assert.strictEqual(isValidOperationName('创建章节'), true);
        });

        test('should accept long operation name', () => {
            const longName = '这是一个比较长的操作名称用于测试';
            assert.strictEqual(isValidOperationName(longName), true);
        });

        test('should reject empty operation name', () => {
            assert.strictEqual(isValidOperationName(''), false);
        });

        test('should reject overly long operation name', () => {
            const tooLong = '操作'.repeat(100);
            assert.strictEqual(isValidOperationName(tooLong), false);
        });
    });
});
