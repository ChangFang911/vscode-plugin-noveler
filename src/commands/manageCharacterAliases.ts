import * as vscode from 'vscode';
import { CHARACTERS_FOLDER } from '../constants';
import { getCharacterAliases } from '../utils/characterAliases';
import { applyDocumentChange, patchFrontMatter, documentIO } from '../utils/documentOperations';
import { parseFrontMatter } from '../utils/frontMatterParser';
import { handleError } from '../utils/errorHandler';

interface AliasItem extends vscode.QuickPickItem {
    action?: 'add';
    alias?: string;
}

function validateAlias(text: string, alias: string, original?: string): string | undefined {
    if (!alias) { return '别名不能为空'; }
    if (alias === String(parseFrontMatter(text).data.name ?? '').trim()) { return '别名不能与人物本名相同'; }
    if (alias !== original && getCharacterAliases(text).includes(alias)) { return '该别名已存在'; }
    return undefined;
}

export async function manageCharacterAliases(target?: vscode.Uri | { resourceUri?: vscode.Uri }): Promise<void> {
    const uri = target instanceof vscode.Uri ? target : target ? target.resourceUri : vscode.window.activeTextEditor?.document.uri;
    const folder = documentIO.workspaceFolder();
    const prefix = folder && vscode.Uri.joinPath(folder.uri, CHARACTERS_FOLDER).toString() + '/';
    if (!uri || !prefix || !uri.toString().startsWith(prefix) || !uri.path.endsWith('.md')) {
        vscode.window.showWarningMessage('请从人物档案或侧边栏人物菜单管理别名');
        return;
    }
    try {
        const document = await vscode.workspace.openTextDocument(uri);
        const picker = vscode.window.createQuickPick<AliasItem>();
        const editButton = { iconPath: new vscode.ThemeIcon('edit'), tooltip: '修改别名' };
        const deleteButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: '删除别名' };
        picker.title = '管理人物别名';
        picker.placeholder = '输入新别名，回车添加；已有别名可点击右侧按钮修改或删除';
        picker.ignoreFocusOut = true;
        let busy = false;
        let editing = false;
        let closed = false;

        const updateItems = () => {
            const alias = picker.value.trim();
            const error = validateAlias(document.getText(), alias);
            const first: AliasItem = alias && !error
                ? { label: `添加别名“${alias}”`, action: 'add', alwaysShow: true }
                : { label: alias ? error! : '输入新别名，回车添加', alwaysShow: true };
            const aliases = getCharacterAliases(document.getText());
            picker.items = [first,
                ...(aliases.length ? [{ label: '已有别名', kind: vscode.QuickPickItemKind.Separator }] : []),
                ...aliases.map(value => ({
                    label: value, alias: value, buttons: [editButton, deleteButton]
                }))];
            picker.activeItems = [first];
        };
        const change = async (original?: string, alias?: string) => {
            await applyDocumentChange(uri, text => {
                const data = parseFrontMatter(text).data;
                if (data.aliases !== undefined && (!Array.isArray(data.aliases)
                    || data.aliases.some(value => typeof value !== 'string'))) {
                    throw new Error('aliases 应为字符串列表，请先修复人物档案中的别名格式');
                }
                const current = getCharacterAliases(text);
                if (original !== undefined && !current.includes(original)) {
                    throw new Error('该别名已变化，请重新选择');
                }
                if (alias !== undefined) {
                    const error = validateAlias(text, alias, original);
                    if (error) { throw new Error(error); }
                }
                const updated = original === undefined ? [...current, alias!]
                    : alias === undefined ? current.filter(value => value !== original)
                        : current.map(value => value === original ? alias : value);
                return patchFrontMatter(text, { aliases: updated });
            });
        };

        await new Promise<void>(resolve => {
            const subscriptions: vscode.Disposable[] = [];
            const finish = () => {
                if (closed) { return; }
                closed = true;
                subscriptions.forEach(subscription => subscription.dispose());
                picker.dispose();
                if (!busy) { resolve(); }
            };
            const run = async (operation: () => Promise<void>) => {
                if (busy || closed) { return; }
                busy = true;
                picker.busy = true;
                picker.enabled = false;
                try { await operation(); }
                catch (error) { handleError('管理人物别名失败', error); }
                finally {
                    busy = false;
                    if (closed) { resolve(); }
                    else {
                        picker.busy = false;
                        picker.enabled = true;
                        updateItems();
                        if (editing) { editing = false; picker.show(); }
                    }
                }
            };
            subscriptions.push(
                picker.onDidChangeValue(updateItems),
                picker.onDidAccept(() => {
                    if (picker.activeItems[0]?.action !== 'add') { return; }
                    const alias = picker.value.trim();
                    void run(async () => {
                        await change(undefined, alias);
                        if (!closed) { picker.value = ''; }
                    });
                }),
                picker.onDidTriggerItemButton(event => {
                    const original = event.item.alias;
                    if (original === undefined) { return; }
                    void run(async () => {
                        if (event.button === deleteButton) { await change(original); }
                        else if (event.button === editButton) {
                            editing = true;
                            const input = await vscode.window.showInputBox({
                                title: '修改别名', prompt: '请输入一个别名，支持中文和英文名', value: original,
                                validateInput: value => validateAlias(document.getText(), value.trim(), original)
                            });
                            if (input !== undefined) { await change(original, input.trim()); }
                        }
                    });
                }),
                picker.onDidHide(() => { if (!editing) { finish(); } }),
                vscode.workspace.onDidChangeTextDocument(event => {
                    if (!closed && !busy && event.document === document) { updateItems(); }
                })
            );
            updateItems();
            picker.show();
        });
    } catch (error) {
        handleError('管理人物别名失败', error);
    }
}
