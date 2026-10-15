import * as vscode from 'vscode';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';

export async function createTestWorkspace(): Promise<vscode.Uri> {
    const root = vscode.Uri.file(await mkdtemp(path.join(process.env.NOVELER_TEST_WORKSPACE || tmpdir(), 'noveler-safety-')));
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, 'chapters'));
    await writeTestFile(vscode.Uri.joinPath(root, 'novel.jsonc'), '{\n // 原配置注释\n "noveler": {"volumes": {"enabled": true, "folderStructure": "nested"}, "eyeCareMode": {"enabled": false}}\n}');
    return root;
}

export async function writeTestFile(uri: vscode.Uri, text: string): Promise<void> {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(text));
}

export async function readTestFile(uri: vscode.Uri): Promise<string> {
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
}

export async function undoDocumentChange(document: vscode.TextDocument, expected: string): Promise<void> {
    await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: unknown) => {
            if (settled) { return; }
            settled = true;
            clearTimeout(timer);
            listener.dispose();
            if (error) { reject(error); } else { resolve(); }
        };
        const check = () => {
            if (document.getText() === expected) { finish(); }
        };
        const listener = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document === document) { check(); }
        });
        const timer = setTimeout(() => finish(new Error(`撤销未恢复预期文档内容，实际内容：${JSON.stringify(document.getText())}`)), 3000);
        vscode.commands.executeCommand('undo').then(check, finish);
    });
}

export async function removeTestWorkspace(root: vscode.Uri): Promise<void> {
    for (const document of vscode.workspace.textDocuments) {
        if (document.uri.toString().startsWith(root.toString() + '/') && document.isDirty) {
            await document.save();
        }
    }
    // 宿主中的文件由 runTest 在 VS Code 退出后统一清理，避免异步文件操作与删除竞争。
    if (!process.env.NOVELER_TEST_WORKSPACE) {
        await vscode.workspace.fs.delete(root, { recursive: true });
    }
}
