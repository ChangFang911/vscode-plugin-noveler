import { SensitiveLevel, SensitiveMatch } from '../types/sensitiveWord';

/**
 * Trie 树节点
 */
class TrieNode {
    children: Map<string, TrieNode> = new Map();
    isEnd = false;
    word?: string;
    level?: SensitiveLevel;
}

/**
 * Trie 树（字典树）
 * 用于高效的敏感词检测，时间复杂度 O(n)，n 为文本长度
 *
 * @example
 * ```typescript
 * const trie = new TrieTree();
 * trie.insert('敏感词', 'high');
 * const matches = trie.search('这是一个敏感词测试');
 * console.log(matches); // [{ word: '敏感词', start: 5, end: 8, level: 'high' }]
 * ```
 */
export class TrieTree {
    private root: TrieNode = new TrieNode();
    private wordCount = 0;

    /**
     * 插入单个词
     * @param word 词汇
     * @param level 级别
     */
    insert(word: string, level: SensitiveLevel): void {
        if (!word || word.length === 0) {
            return;
        }

        let node = this.root;

        for (const char of word) {
            if (!node.children.has(char)) {
                node.children.set(char, new TrieNode());
            }
            node = node.children.get(char)!;
        }

        // 如果这个词之前没有插入过，增加计数
        if (!node.isEnd) {
            this.wordCount++;
        }

        node.isEnd = true;
        node.word = word;
        node.level = level;
    }

    /**
     * 批量插入词汇
     * @param words 词汇数组
     * @param level 级别
     */
    insertBatch(words: string[], level: SensitiveLevel): void {
        for (const word of words) {
            this.insert(word, level);
        }
    }

    /**
     * 检测文本中的敏感词
     * 使用滑动窗口算法，时间复杂度 O(n)
     * 当存在多个重叠匹配时，优先返回最长匹配
     *
     * @param text 要检测的文本
     * @returns 匹配结果数组
     */
    search(text: string): SensitiveMatch[] {
        if (!text || text.length === 0) {
            return [];
        }

        const results: SensitiveMatch[] = [];

        // 滑动窗口检测
        for (let i = 0; i < text.length; i++) {
            let node = this.root;
            let j = i;
            let lastMatch: SensitiveMatch | null = null;

            // 从当前位置开始尝试匹配，记录最长匹配
            while (j < text.length && node.children.has(text[j])) {
                node = node.children.get(text[j])!;
                j++;

                // 如果到达词的结尾，记录为候选匹配（但继续寻找更长的匹配）
                if (node.isEnd && node.word && node.level) {
                    lastMatch = {
                        word: node.word,
                        start: i,
                        end: j,
                        level: node.level,
                        inWhitelist: false  // 将在 Service 层处理白名单
                    };
                }
            }

            // 如果找到了匹配，添加最长的那个
            if (lastMatch) {
                results.push(lastMatch);
                // 跳过已匹配的部分，避免重复检测
                i = lastMatch.end - 1; // -1 因为 for 循环会自动 +1
            }
        }

        return results;
    }

    /**
     * 检查词是否存在
     * @param word 词汇
     * @returns 是否存在
     */
    has(word: string): boolean {
        let node = this.root;

        for (const char of word) {
            if (!node.children.has(char)) {
                return false;
            }
            node = node.children.get(char)!;
        }

        return node.isEnd;
    }

    /**
     * 获取词数统计
     * @returns 词数
     */
    getWordCount(): number {
        return this.wordCount;
    }

    /**
     * 清空树
     */
    clear(): void {
        this.root = new TrieNode();
        this.wordCount = 0;
    }
}
