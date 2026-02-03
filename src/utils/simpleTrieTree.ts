/**
 * 简单 Trie 树节点
 */
class SimpleTrieNode {
    children: Map<string, SimpleTrieNode> = new Map();
    isEnd = false;
    word?: string;
}

/**
 * 匹配结果
 */
export interface SimpleMatch {
    word: string;
    start: number;
    end: number;
}

/**
 * 简单 Trie 树（字典树）
 * 用于高效的字符串匹配，时间复杂度 O(n)，n 为文本长度
 * 适用于人物名高亮等场景
 *
 * @example
 * ```typescript
 * const trie = new SimpleTrieTree();
 * trie.insertBatch(['张三', '张三丰', '李四']);
 * const matches = trie.search('张三丰和李四在聊天');
 * // [{ word: '张三丰', start: 0, end: 3 }, { word: '李四', start: 4, end: 6 }]
 * ```
 */
export class SimpleTrieTree {
    private root: SimpleTrieNode = new SimpleTrieNode();
    private wordCount = 0;

    /**
     * 插入单个词
     * @param word 词汇
     */
    insert(word: string): void {
        if (!word || word.length === 0) {
            return;
        }

        let node = this.root;

        for (const char of word) {
            if (!node.children.has(char)) {
                node.children.set(char, new SimpleTrieNode());
            }
            const next = node.children.get(char);
            if (next) {
                node = next;
            }
        }

        if (!node.isEnd) {
            this.wordCount++;
        }

        node.isEnd = true;
        node.word = word;
    }

    /**
     * 批量插入词汇
     * @param words 词汇数组
     */
    insertBatch(words: string[]): void {
        for (const word of words) {
            this.insert(word);
        }
    }

    /**
     * 检测文本中的匹配词
     * 使用滑动窗口算法，时间复杂度 O(n)
     * 当存在多个重叠匹配时，优先返回最长匹配
     *
     * @param text 要检测的文本
     * @returns 匹配结果数组
     */
    search(text: string): SimpleMatch[] {
        if (!text || text.length === 0) {
            return [];
        }

        const results: SimpleMatch[] = [];

        for (let i = 0; i < text.length; i++) {
            let node = this.root;
            let j = i;
            let lastMatch: SimpleMatch | null = null;

            // 从当前位置开始尝试匹配，记录最长匹配
            while (j < text.length && node.children.has(text[j])) {
                const next = node.children.get(text[j]);
                if (!next) break;
                node = next;
                j++;

                // 如果到达词的结尾，记录为候选匹配
                if (node.isEnd && node.word) {
                    lastMatch = {
                        word: node.word,
                        start: i,
                        end: j
                    };
                }
            }

            // 如果找到了匹配，添加最长的那个
            if (lastMatch) {
                results.push(lastMatch);
                // 跳过已匹配的部分
                i = lastMatch.end - 1;
            }
        }

        return results;
    }

    /**
     * 检查词是否存在
     */
    has(word: string): boolean {
        let node = this.root;

        for (const char of word) {
            const next = node.children.get(char);
            if (!next) {
                return false;
            }
            node = next;
        }

        return node.isEnd;
    }

    /**
     * 获取词数
     */
    getWordCount(): number {
        return this.wordCount;
    }

    /**
     * 清空树
     */
    clear(): void {
        this.root = new SimpleTrieNode();
        this.wordCount = 0;
    }
}
