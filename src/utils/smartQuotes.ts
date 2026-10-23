import { Parser } from 'commonmark';

export const QUOTE_PAIRS: Readonly<Record<string, string>> = {
    '“': '”', '「': '」', '‘': '’', '『': '』', '《': '》', '〈': '〉', '"': '"', "'": "'"
};
const closingQuotes = new Set(Object.values(QUOTE_PAIRS));
export const QUOTE_CHARACTERS = new Set([...Object.keys(QUOTE_PAIRS), ...closingQuotes]);

function escaped(text: string, index: number): boolean {
    let count = 0;
    while (index > 0 && text[--index] === '\\') { count++; }
    return count % 2 === 1;
}

function word(char: string | undefined): boolean {
    return !!char && /[\p{L}\p{N}_]/u.test(char);
}

function latinWord(char: string | undefined): boolean {
    return !!char && /[\p{Script=Latin}\p{N}_]/u.test(char);
}

function scanQuotePairs(line: string, dialogueOnly = false) {
    const stack: { start: number; close: string }[] = [];
    const pairs: { start: number; end: number }[] = [];
    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        if (!QUOTE_CHARACTERS.has(char) || (dialogueOnly && '《》〈〉'.includes(char))) { continue; }
        if (escaped(line, index)) { continue; }
        if ((char === "'" || char === '’') && latinWord(line[index - 1]) && latinWord(line[index + 1])) { continue; }
        const top = stack[stack.length - 1];
        if (top?.close === char) {
            pairs.push({ start: stack.pop()!.start, end: index });
        } else if (QUOTE_PAIRS[char]) {
            if (char === "'" && latinWord(line[index - 1])) { continue; }
            stack.push({ start: index, close: QUOTE_PAIRS[char] });
        } else if (closingQuotes.has(char)) {
            if (!dialogueOnly) { return { pairs: [], stack, malformed: true }; }
            stack.length = 0;
        }
    }
    return { pairs, stack, malformed: false };
}

export function findDialogueRanges(text: string): { start: number; end: number }[] {
    const { pairs } = scanQuotePairs(text, true);
    const ranges: { start: number; end: number }[] = [];
    for (const pair of pairs.sort((a, b) => a.start - b.start)) {
        const previous = ranges[ranges.length - 1];
        if (previous && pair.start < previous.end) {
            previous.end = Math.max(previous.end, pair.end + 1);
        } else {
            ranges.push({ start: pair.start, end: pair.end + 1 });
        }
    }
    return ranges;
}

export function findQuoteExit(line: string, column: number): number | undefined {
    const { pairs, stack, malformed } = scanQuotePairs(line);
    if (malformed) { return undefined; }
    if (stack.some(pair => pair.start < column)) { return undefined; }
    return pairs.filter(pair => pair.start < column && column <= pair.end)
        .sort((a, b) => b.start - a.start)[0]?.end;
}

export function quoteInput(line: string, column: number, char: string): { text: string } {
    if (char.length !== 1 || escaped(line, column)) { return { text: char }; }
    const close = QUOTE_PAIRS[char];
    if (!close || (char === "'" && latinWord(line[column - 1]))) { return { text: char }; }
    if (line[column] === close || word(line[column])) { return { text: char }; }
    return { text: char + close };
}

export function proseQuoteLine(text: string, offset: number): { line: string; column: number } | undefined {
    let bodyStart = 0;
    if (/^\uFEFF?---[^\S\r\n]*(?:\r?\n|$)/.test(text)) {
        const header = /^\uFEFF?---[^\S\r\n]*\r?\n[\s\S]*?^---[^\S\r\n]*(?:\r?\n|$)/m.exec(text);
        if (!header || offset < header[0].length) { return undefined; }
        bodyStart = header[0].length;
    }
    const body = text.slice(bodyStart);
    const position = offset - bodyStart;
    const start = position > 0 ? body.lastIndexOf('\n', position - 1) + 1 : 0;
    const end = body.indexOf('\n', position);
    const lineEnd = end < 0 ? body.length : end;
    const lineNumber = body.slice(0, start).split('\n').length;
    const originalLine = body.slice(start, lineEnd).replace(/\r$/, '');
    if (/^\s*\|/.test(originalLine)) { return undefined; }
    // 用临时字符判断空行是否仍在未闭合的代码块、列表或 HTML 中。
    const source = originalLine.trim() ? body : body.slice(0, position) + '\uE000' + body.slice(position);
    const tree = new Parser().parse(source);
    let paragraph;
    for (let node = tree.firstChild; node; node = node.next) {
        if (node.type === 'paragraph' && node.sourcepos[0][0] <= lineNumber && lineNumber <= node.sourcepos[1][0]) {
            paragraph = node; break;
        }
    }
    if (!paragraph) {
        if (originalLine.trim()) { return undefined; }
        const walker = tree.walker();
        let event;
        while ((event = walker.next())) {
            if (event.entering && ['code_block', 'html_block', 'list', 'block_quote'].includes(event.node.type)
                && event.node.sourcepos[0][0] <= lineNumber && lineNumber <= event.node.sourcepos[1][0]) { return undefined; }
        }
    } else {
        const lines = body.split('\n').slice(paragraph.sourcepos[0][0] - 1, paragraph.sourcepos[1][0]);
        if (/^\s*\|?.+\|.+\n\s*\|?\s*:?-{3,}/m.test(lines.join('\n'))) { return undefined; }
    }
    let protectedCursor = false;
    const maskedLines = body.split('\n');
    const walker = tree.walker();
    let event;
    while ((event = walker.next())) {
        if (event.entering && event.node.type === 'code_block') {
            for (let index = event.node.sourcepos[0][0] - 1; index < event.node.sourcepos[1][0]; index++) {
                if (maskedLines[index] !== undefined) { maskedLines[index] = maskedLines[index].replace(/[^\r]/g, ' '); }
            }
        }
    }
    const raw = maskedLines.join('\n');
    const masked = raw.split('');
    for (let index = 0; index < raw.length;) {
        if (escaped(raw, index)) { index++; continue; }
        let end: number | undefined;
        let unclosedComment = false;
        if (raw.startsWith('<!--', index)) {
            const closing = raw.indexOf('-->', index + 4);
            unclosedComment = closing < 0;
            end = closing < 0 ? raw.length : closing + 3;
        } else if (raw[index] === '`') {
            const start = index;
            while (raw[index] === '`') { index++; }
            const runs = /`+/g;
            runs.lastIndex = index;
            let closing;
            while ((closing = runs.exec(raw))) {
                if (closing[0].length === index - start) { end = runs.lastIndex; break; }
            }
            if (end === undefined) { continue; }
            index = start;
        }
        if (end === undefined) { index++; continue; }
        if (position >= index && (position < end || (unclosedComment && position === end))) { protectedCursor = true; }
        for (let cursor = index; cursor < end; cursor++) {
            if (masked[cursor] !== '\n' && masked[cursor] !== '\r') { masked[cursor] = ' '; }
        }
        index = end;
    }
    let line = masked.slice(start, lineEnd).join('').replace(/\r$/, '');
    line = line.replace(/<\/?[a-zA-Z][^>]*>/g, (value, index: number) => {
        if (position - start >= index && position - start < index + value.length) { protectedCursor = true; }
        return ' '.repeat(value.length);
    });
    return protectedCursor ? undefined : { line, column: position - start };
}
