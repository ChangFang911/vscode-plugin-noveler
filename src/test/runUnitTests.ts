import Module from 'module';
import * as path from 'path';
import { readdirSync } from 'fs';
import Mocha from 'mocha';
import { createVSCodeMock, MockRange } from './mocks/vscode';

type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const loader = Module as unknown as { _load: ModuleLoader };
const originalLoad = loader._load;
const vscode = Object.assign(createVSCodeMock(), {
    CodeLens: class {
        constructor(
            public range: MockRange,
            public command?: { title: string; command: string; arguments?: unknown[] }
        ) {}
    },
    TextEdit: { replace: (range: MockRange, newText: string) => ({ range, newText }) }
});
loader._load = function(request, parent, isMain) {
    return request === 'vscode' ? vscode : originalLoad.call(this, request, parent, isMain);
};

const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 10000 });
const sourceRoot = path.resolve(__dirname, '../../src/test/suite');
for (const file of readdirSync(sourceRoot)) {
    if (file.endsWith('.test.ts') && file !== 'extension.test.ts' && !file.endsWith('.integration.test.ts')) {
        mocha.addFile(path.join(__dirname, 'suite', file.replace(/\.ts$/, '.js')));
    }
}
mocha.run(failures => {
    loader._load = originalLoad;
    process.exitCode = failures ? 1 : 0;
});
