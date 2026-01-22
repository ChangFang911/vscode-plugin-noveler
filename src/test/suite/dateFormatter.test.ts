import * as assert from 'assert';
import { formatDateTime } from '../../utils/dateFormatter';

suite('DateFormatter Test Suite', () => {

    suite('formatDateTime', () => {

        suite('Basic formatting', () => {
            test('should format date with all double digits', () => {
                const date = new Date(2024, 11, 25, 14, 30, 45); // Dec 25, 2024, 14:30:45
                assert.strictEqual(formatDateTime(date), '2024-12-25 14:30:45');
            });

            test('should pad single digit month', () => {
                const date = new Date(2024, 0, 15, 10, 20, 30); // Jan 15, 2024
                assert.strictEqual(formatDateTime(date), '2024-01-15 10:20:30');
            });

            test('should pad single digit day', () => {
                const date = new Date(2024, 5, 5, 10, 20, 30); // June 5, 2024
                assert.strictEqual(formatDateTime(date), '2024-06-05 10:20:30');
            });

            test('should pad single digit hour', () => {
                const date = new Date(2024, 5, 15, 9, 20, 30);
                assert.strictEqual(formatDateTime(date), '2024-06-15 09:20:30');
            });

            test('should pad single digit minute', () => {
                const date = new Date(2024, 5, 15, 10, 5, 30);
                assert.strictEqual(formatDateTime(date), '2024-06-15 10:05:30');
            });

            test('should pad single digit second', () => {
                const date = new Date(2024, 5, 15, 10, 20, 5);
                assert.strictEqual(formatDateTime(date), '2024-06-15 10:20:05');
            });
        });

        suite('Edge cases', () => {
            test('should handle midnight', () => {
                const date = new Date(2024, 0, 1, 0, 0, 0);
                assert.strictEqual(formatDateTime(date), '2024-01-01 00:00:00');
            });

            test('should handle end of day', () => {
                const date = new Date(2024, 11, 31, 23, 59, 59);
                assert.strictEqual(formatDateTime(date), '2024-12-31 23:59:59');
            });

            test('should handle leap year date', () => {
                const date = new Date(2024, 1, 29, 12, 0, 0); // Feb 29, 2024 (leap year)
                assert.strictEqual(formatDateTime(date), '2024-02-29 12:00:00');
            });

            test('should handle year 2000', () => {
                const date = new Date(2000, 0, 1, 0, 0, 0);
                assert.strictEqual(formatDateTime(date), '2000-01-01 00:00:00');
            });

            test('should handle future year', () => {
                const date = new Date(2050, 5, 15, 10, 30, 0);
                assert.strictEqual(formatDateTime(date), '2050-06-15 10:30:00');
            });
        });

        suite('Format consistency', () => {
            test('should always produce YYYY-MM-DD HH:mm:ss format', () => {
                const date = new Date(2024, 5, 15, 10, 30, 45);
                const result = formatDateTime(date);

                // Check format pattern
                const pattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
                assert.ok(pattern.test(result), `Expected format YYYY-MM-DD HH:mm:ss, got ${result}`);
            });

            test('should produce fixed length output', () => {
                const date1 = new Date(2024, 0, 1, 0, 0, 0);
                const date2 = new Date(2024, 11, 31, 23, 59, 59);

                assert.strictEqual(formatDateTime(date1).length, 19);
                assert.strictEqual(formatDateTime(date2).length, 19);
            });
        });
    });
});
