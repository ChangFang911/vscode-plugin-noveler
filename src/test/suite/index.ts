import * as path from 'path';
import Mocha from 'mocha';
import { globSync } from 'glob';
import { existsSync } from 'fs';

export function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 10000
    });

    const testsRoot = path.resolve(__dirname, '.');

    return new Promise((resolve, reject) => {
        // Use glob to find test files
        const sourceRoot = path.resolve(testsRoot, '../../../src/test/suite');
        const testFiles = globSync('**/**.test.js', { cwd: testsRoot }).filter(file =>
            existsSync(path.join(sourceRoot, file.replace(/\.js$/, '.ts')))
        );

        // Add files to the test suite
        testFiles.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

        try {
            // Run the mocha test
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            console.error(err);
            reject(err);
        }
    });
}
