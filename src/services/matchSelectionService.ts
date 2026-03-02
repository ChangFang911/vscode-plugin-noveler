import { Logger } from '../utils/logger';

export type MatchKind = 'character' | 'sensitive';

export interface MatchCandidate {
    kind: MatchKind;
    word: string;
    start: number;
    end: number;
}

interface ManualSelection extends MatchCandidate {
    offset: number;
    updatedAt: number;
    removedAtOffset?: boolean;
    removeRangeStart?: number;
    removeRangeEnd?: number;
}

/**
 * 统一匹配选择服务
 * - 支持跨类型（人物名/敏感词）在同一位置手动选择
 * - 仅影响所选位置（offset）
 */
export class MatchSelectionService {
    private static instance?: MatchSelectionService;

    // Map<documentUri, Map<offset, selection>>
    private readonly selections: Map<string, Map<number, ManualSelection>> = new Map();

    public static getInstance(): MatchSelectionService {
        if (!MatchSelectionService.instance) {
            MatchSelectionService.instance = new MatchSelectionService();
        }
        return MatchSelectionService.instance;
    }

    public setSelection(documentUri: string, offset: number, candidate: MatchCandidate): void {
        const docSelections = this.selections.get(documentUri) ?? new Map<number, ManualSelection>();

        // 清理与当前选择冲突的“移除匹配”记录，支持先移除后恢复
        for (const [key, selection] of docSelections.entries()) {
            if (!selection.removedAtOffset) {
                continue;
            }

            const removeStart = selection.removeRangeStart ?? selection.offset;
            const removeEnd = selection.removeRangeEnd ?? (selection.offset + 1);
            const overlaps = candidate.start < removeEnd && candidate.end > removeStart;

            if (overlaps || (candidate.start <= selection.offset && selection.offset < candidate.end)) {
                docSelections.delete(key);
            }
        }

        docSelections.set(offset, {
            ...candidate,
            offset,
            updatedAt: Date.now()
        });
        this.selections.set(documentUri, docSelections);
        Logger.info(`[MatchSelection] 已设置手动匹配选择: ${candidate.kind}:${candidate.word} @${offset}`);
    }

    public setRemoveAtOffset(documentUri: string, offset: number): void {
        const docSelections = this.selections.get(documentUri) ?? new Map<number, ManualSelection>();
        // 使用哨兵值表示“该位置移除所有匹配”
        docSelections.set(offset, {
            kind: 'character',
            word: '__REMOVE__',
            start: offset,
            end: offset + 1,
            offset,
            updatedAt: Date.now(),
            removedAtOffset: true
        });
        this.selections.set(documentUri, docSelections);
        Logger.info(`[MatchSelection] 已设置移除该处匹配 @${offset}`);
    }

    public setRemoveInRange(documentUri: string, start: number, end: number): void {
        const docSelections = this.selections.get(documentUri) ?? new Map<number, ManualSelection>();
        const key = start;
        docSelections.set(key, {
            kind: 'character',
            word: '__REMOVE_RANGE__',
            start,
            end,
            offset: start,
            updatedAt: Date.now(),
            removedAtOffset: true,
            removeRangeStart: start,
            removeRangeEnd: end
        });
        this.selections.set(documentUri, docSelections);
        Logger.info(`[MatchSelection] 已设置移除范围匹配 [${start}, ${end})`);
    }

    /**
     * 按“仅影响当前位置”的规则过滤匹配
     */
    public filterMatches<T extends { word: string; start: number; end: number }>(
        documentUri: string,
        matches: T[],
        kind: MatchKind
    ): T[] {
        const docSelections = this.selections.get(documentUri);
        if (!docSelections || docSelections.size === 0 || matches.length === 0) {
            return matches;
        }

        let result = [...matches];

        for (const selection of docSelections.values()) {
            const coversOffset = (m: { start: number; end: number }) => m.start <= selection.offset && selection.offset < m.end;
            const overlapsRange = (m: { start: number; end: number }) => {
                if (selection.removeRangeStart === undefined || selection.removeRangeEnd === undefined) {
                    return false;
                }
                return m.start < selection.removeRangeEnd && m.end > selection.removeRangeStart;
            };

            if (selection.removedAtOffset) {
                result = result.filter(m => !(coversOffset(m) || overlapsRange(m)));
                continue;
            }

            if (selection.kind === kind) {
                // 同类型：当前位置只保留用户明确选中的那一个
                result = result.filter(m => {
                    if (!coversOffset(m)) return true;
                    return m.word === selection.word && m.start === selection.start && m.end === selection.end;
                });
            } else {
                // 跨类型：当前位置屏蔽本类型匹配
                result = result.filter(m => !coversOffset(m));
            }
        }

        return result;
    }
}

