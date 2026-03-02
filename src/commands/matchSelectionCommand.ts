import * as vscode from 'vscode';
import { NovelHighlightProvider } from '../providers/highlightProvider';
import { SensitiveWordService } from '../services/sensitiveWordService';
import { MatchCandidate, MatchSelectionService } from '../services/matchSelectionService';
import { SensitiveWordDiagnosticProvider } from '../providers/sensitiveWordDiagnostic';

/**
 * 在当前位置选择匹配项（可跨类型：人物名 / 敏感词）
 */
export async function chooseMatchAtCursor(
    highlightProvider: NovelHighlightProvider,
    sensitiveWordService: SensitiveWordService,
    sensitiveWordDiagnostic?: SensitiveWordDiagnosticProvider | null
): Promise<void> {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'markdown') {
            vscode.window.showInformationMessage('请先在 Markdown 文档中使用该命令');
            return;
        }

        const offset = editor.document.offsetAt(editor.selection.active);
        const docUri = editor.document.uri.toString();
        const selectionService = MatchSelectionService.getInstance();

        // 候选1：敏感词（原始检测，不应用手动筛选，否则候选会被提前过滤掉）
        const sensitiveCandidates = sensitiveWordService
            .detect(editor.document, false)
            .filter(m => m.start <= offset && offset < m.end)
            .map<MatchCandidate>(m => ({
                kind: 'sensitive',
                word: m.word,
                start: m.start,
                end: m.end
            }));

        // 候选2：人物名（来自高亮提供器）
        const characterCandidates = (await highlightProvider.getCharacterMatchesAtOffset(editor, offset))
            .map<MatchCandidate>(m => ({
                kind: 'character',
                word: m.word,
                start: m.start,
                end: m.end
            }));

        const allCandidates = [...characterCandidates, ...sensitiveCandidates];

        // 即使当前位置没有候选，也要弹出选择框（至少提供“移除该处匹配”）
        const picked = await vscode.window.showQuickPick(
            [
                {
                    label: '$(close) 移除该处匹配',
                    description: '仅影响当前位置，清除该位置所有类型匹配',
                    action: 'remove' as const
                },
                ...allCandidates.map(c => ({
                    label: c.word,
                    description: `${c.kind === 'sensitive' ? '敏感词' : '人物名'} [${c.start}, ${c.end})`,
                    action: 'select' as const,
                    candidate: c
                }))
            ],
            {
                placeHolder: allCandidates.length > 0
                    ? '选择当前位置关键词匹配'
                    : '当前位置未检测到候选，可选择“移除该处匹配”'
            }
        );

        if (!picked) return;

        if (picked.action === 'remove') {
            // 优先按当前位置实际候选覆盖范围移除，避免仅移除单点导致诊断残留
            const removeStart = allCandidates.length > 0 ? Math.min(...allCandidates.map(c => c.start)) : offset;
            const removeEnd = allCandidates.length > 0 ? Math.max(...allCandidates.map(c => c.end)) : offset + 1;
            selectionService.setRemoveInRange(docUri, removeStart, removeEnd);
        } else {
            selectionService.setSelection(docUri, offset, picked.candidate);
        }

        // 刷新高亮与诊断
        await highlightProvider.updateHighlights(editor);
        const diagnosticProvider = sensitiveWordDiagnostic ?? SensitiveWordDiagnosticProvider.getInstance();
        diagnosticProvider?.updateDiagnostics(editor.document);

        if (picked.action === 'remove') {
            vscode.window.showInformationMessage('已移除该处匹配');
        } else {
            vscode.window.showInformationMessage(`已在当前位置采用：${picked.candidate.word}（${picked.candidate.kind === 'sensitive' ? '敏感词' : '人物名'}）`);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`选择当前位置关键词匹配失败：${message}`);
    }
}

