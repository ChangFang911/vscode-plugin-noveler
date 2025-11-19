/**
 * 中文数字转换工具
 */

/**
 * 转换数字为中文
 * @param num 要转换的数字
 * @returns 中文数字字符串
 */
export function convertToChineseNumber(num: number): string {
    const chineseNums = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const chineseUnits = ['', '十', '百', '千'];
    const bigUnits = ['', '万', '亿', '兆'];

    if (num === 0) {
        return chineseNums[0];
    }

    if (num < 0) {
        return '负' + convertToChineseNumber(-num);
    }

    // 处理特殊情况：10-19
    if (num === 10) {
        return '十';
    }
    if (num > 10 && num < 20) {
        return '十' + chineseNums[num % 10];
    }

    let result = '';
    let unitIndex = 0;

    while (num > 0) {
        const section = num % 10000;
        if (section !== 0) {
            const sectionStr = convertSection(section, chineseNums, chineseUnits);
            result = sectionStr + bigUnits[unitIndex] + result;
        } else if (result !== '' && num > 0) {
            // 添加零（如果后面还有数字）
            result = chineseNums[0] + result;
        }
        num = Math.floor(num / 10000);
        unitIndex++;
    }

    // 清理多余的零
    result = result.replace(/零+/g, '零');
    result = result.replace(/零+$/g, '');
    result = result.replace(/零([万亿兆])/g, '$1');

    return result;
}

/**
 * 转换0-9999之间的数字
 */
function convertSection(num: number, chineseNums: string[], chineseUnits: string[]): string {
    if (num === 0) {
        return '';
    }
    if (num < 10) {
        return chineseNums[num];
    }

    let result = '';
    let zeroFlag = false;

    for (let i = 3; i >= 0; i--) {
        const digit = Math.floor(num / Math.pow(10, i)) % 10;

        if (digit === 0) {
            if (!zeroFlag && result !== '') {
                zeroFlag = true;
            }
        } else {
            if (zeroFlag) {
                result += chineseNums[0];
                zeroFlag = false;
            }
            // 特殊处理：10-19 的情况
            if (i === 1 && digit === 1 && result === '') {
                result += chineseUnits[i];
            } else {
                result += chineseNums[digit] + chineseUnits[i];
            }
        }
    }

    return result;
}
