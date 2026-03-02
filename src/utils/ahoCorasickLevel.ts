/**
 * Aho-Corasick 自动机（支持敏感级别）
 * 用于高效的敏感词检测，时间复杂度 O(n + z)
 * n = 文本长度，z = 匹配总数
 */

import { SensitiveLevel, SensitiveMatch } from '../types/sensitiveWord';

interface ACState {
    next: Map<string, number>;
    fail: number;
    output: number;
    word?: string;
    level?: SensitiveLevel;
}

export class AhoCorasickLevel {
    private states: ACState[] = [];
    private wordCount = 0;

    constructor() {
        this.states.push({
            next: new Map(),
            fail: 0,
            output: 0
        });
    }

    /**
     * 插入单个词
     */
    insert(word: string, level: SensitiveLevel): void {
        if (!word || word.length === 0) return;

        let state = 0;
        for (const ch of word) {
            const chStr = ch;
            let nextState = this.states[state].next.get(chStr);
            if (nextState === undefined) {
                nextState = this.states.length;
                this.states.push({
                    next: new Map(),
                    fail: 0,
                    output: 0
                });
                this.states[state].next.set(chStr, nextState);
            }
            state = nextState;
        }

        if (!this.states[state].word) {
            this.wordCount++;
        }
        this.states[state].word = word;
        this.states[state].level = level;
    }

    /**
     * 批量插入词汇
     */
    insertBatch(words: string[], level: SensitiveLevel): void {
        for (const word of words) {
            this.insert(word, level);
        }
    }

    /**
     * 批量插入完成后构建失败链接
     */
    build(): void {
        const queue: number[] = [];
        
        // 初始化根节点的所有直接子节点的失败链接
        for (const [, nextState] of this.states[0].next) {
            this.states[nextState].fail = 0;
            queue.push(nextState);
        }

        // BFS
        while (queue.length > 0) {
            const current = queue.shift()!;
            
            for (const [ch, nextState] of this.states[current].next) {
                queue.push(nextState);
                
                // 计算失败链接
                let fail = this.states[current].fail;
                while (fail > 0 && !this.states[fail].next.has(ch)) {
                    fail = this.states[fail].fail;
                }
                
                const nextFail = this.states[fail].next.get(ch);
                this.states[nextState].fail = nextFail !== undefined ? nextFail : 0;
                
                // 设置输出链接
                if (this.states[nextState].word) {
                    this.states[nextState].output = nextState;
                } else if (this.states[fail].word) {
                    this.states[nextState].output = fail;
                } else {
                    this.states[nextState].output = this.states[fail].output;
                }
            }
        }
    }

    /**
     * 搜索敏感词
     */
    search(text: string): SensitiveMatch[] {
        if (!text || text.length === 0) return [];
        
        const results: SensitiveMatch[] = [];
        let state = 0;
        
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            
            // 找到下一个有效状态
            while (state > 0 && !this.states[state].next.has(ch)) {
                state = this.states[state].fail;
            }
            
            const nextState = this.states[state].next.get(ch);
            state = nextState !== undefined ? nextState : 0;
            
            // 输出所有匹配
            let outputState = state;
            while (outputState > 0) {
                const s = this.states[outputState];
                if (s.word) {
                    results.push({
                        word: s.word,
                        start: i - s.word.length + 1,
                        end: i + 1,
                        level: s.level || 'high',
                        inWhitelist: false
                    });
                }
                if (s.output === outputState) break;
                outputState = this.states[outputState].output;
            }
        }
        
        return results;
    }

    getWordCount(): number {
        return this.wordCount;
    }

    clear(): void {
        this.states = [{
            next: new Map(),
            fail: 0,
            output: 0
        }];
        this.wordCount = 0;
    }
}
