import * as assert from 'assert';
import { convertToRomanNumber } from '../../utils/volumeHelper';

suite('VolumeHelper Test Suite', () => {

    suite('convertToRomanNumber', () => {

        suite('Basic Roman numerals (1-10)', () => {
            test('should convert 1 to I', () => {
                assert.strictEqual(convertToRomanNumber(1), 'I');
            });

            test('should convert 2 to II', () => {
                assert.strictEqual(convertToRomanNumber(2), 'II');
            });

            test('should convert 3 to III', () => {
                assert.strictEqual(convertToRomanNumber(3), 'III');
            });

            test('should convert 4 to IV', () => {
                assert.strictEqual(convertToRomanNumber(4), 'IV');
            });

            test('should convert 5 to V', () => {
                assert.strictEqual(convertToRomanNumber(5), 'V');
            });

            test('should convert 6 to VI', () => {
                assert.strictEqual(convertToRomanNumber(6), 'VI');
            });

            test('should convert 9 to IX', () => {
                assert.strictEqual(convertToRomanNumber(9), 'IX');
            });

            test('should convert 10 to X', () => {
                assert.strictEqual(convertToRomanNumber(10), 'X');
            });
        });

        suite('Roman numerals 11-50', () => {
            test('should convert 11 to XI', () => {
                assert.strictEqual(convertToRomanNumber(11), 'XI');
            });

            test('should convert 14 to XIV', () => {
                assert.strictEqual(convertToRomanNumber(14), 'XIV');
            });

            test('should convert 15 to XV', () => {
                assert.strictEqual(convertToRomanNumber(15), 'XV');
            });

            test('should convert 19 to XIX', () => {
                assert.strictEqual(convertToRomanNumber(19), 'XIX');
            });

            test('should convert 20 to XX', () => {
                assert.strictEqual(convertToRomanNumber(20), 'XX');
            });

            test('should convert 40 to XL', () => {
                assert.strictEqual(convertToRomanNumber(40), 'XL');
            });

            test('should convert 49 to XLIX', () => {
                assert.strictEqual(convertToRomanNumber(49), 'XLIX');
            });

            test('should convert 50 to L', () => {
                assert.strictEqual(convertToRomanNumber(50), 'L');
            });
        });

        suite('Out of range numbers', () => {
            test('should return padded Arabic for 0', () => {
                assert.strictEqual(convertToRomanNumber(0), '00');
            });

            test('should return padded Arabic for negative numbers', () => {
                assert.strictEqual(convertToRomanNumber(-1), '-1');
            });

            test('should return padded Arabic for 51', () => {
                assert.strictEqual(convertToRomanNumber(51), '51');
            });

            test('should return padded Arabic for 100', () => {
                assert.strictEqual(convertToRomanNumber(100), '100');
            });
        });

        suite('Common volume numbers in novels', () => {
            test('should handle volume I', () => {
                assert.strictEqual(convertToRomanNumber(1), 'I');
            });

            test('should handle volume V', () => {
                assert.strictEqual(convertToRomanNumber(5), 'V');
            });

            test('should handle volume X', () => {
                assert.strictEqual(convertToRomanNumber(10), 'X');
            });
        });
    });
});
