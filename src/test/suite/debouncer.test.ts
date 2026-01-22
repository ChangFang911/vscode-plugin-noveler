import * as assert from 'assert';
import { Debouncer } from '../../utils/debouncer';

suite('Debouncer Test Suite', () => {

    suite('Constructor', () => {
        test('should create debouncer with specified delay', () => {
            const debouncer = new Debouncer(100);
            assert.ok(debouncer instanceof Debouncer);
            debouncer.dispose();
        });

        test('should create debouncer with zero delay', () => {
            const debouncer = new Debouncer(0);
            assert.ok(debouncer instanceof Debouncer);
            debouncer.dispose();
        });
    });

    suite('debounce', () => {
        test('should execute callback after delay', (done) => {
            const debouncer = new Debouncer(50);
            let executed = false;

            debouncer.debounce(() => {
                executed = true;
            });

            // Should not be executed immediately
            assert.strictEqual(executed, false);

            // Should be executed after delay
            setTimeout(() => {
                assert.strictEqual(executed, true);
                debouncer.dispose();
                done();
            }, 100);
        });

        test('should only execute last callback when called multiple times', (done) => {
            const debouncer = new Debouncer(50);
            let callCount = 0;
            let lastValue = '';

            debouncer.debounce(() => {
                callCount++;
                lastValue = 'first';
            });

            debouncer.debounce(() => {
                callCount++;
                lastValue = 'second';
            });

            debouncer.debounce(() => {
                callCount++;
                lastValue = 'third';
            });

            setTimeout(() => {
                assert.strictEqual(callCount, 1);
                assert.strictEqual(lastValue, 'third');
                debouncer.dispose();
                done();
            }, 100);
        });

        test('should reset timer on each call', (done) => {
            const debouncer = new Debouncer(50);
            let executed = false;

            debouncer.debounce(() => {
                executed = true;
            });

            // Reset at 30ms
            setTimeout(() => {
                debouncer.debounce(() => {
                    executed = true;
                });
            }, 30);

            // Check at 60ms - should not be executed yet (30 + 50 = 80ms)
            setTimeout(() => {
                assert.strictEqual(executed, false);
            }, 60);

            // Check at 100ms - should be executed
            setTimeout(() => {
                assert.strictEqual(executed, true);
                debouncer.dispose();
                done();
            }, 100);
        });
    });

    suite('immediate', () => {
        test('should execute callback immediately', () => {
            const debouncer = new Debouncer(1000);
            let executed = false;

            debouncer.immediate(() => {
                executed = true;
            });

            assert.strictEqual(executed, true);
            debouncer.dispose();
        });

        test('should cancel pending debounced callback', (done) => {
            const debouncer = new Debouncer(50);
            let debouncedExecuted = false;
            let immediateExecuted = false;

            debouncer.debounce(() => {
                debouncedExecuted = true;
            });

            debouncer.immediate(() => {
                immediateExecuted = true;
            });

            assert.strictEqual(immediateExecuted, true);

            // Wait to ensure debounced callback was cancelled
            setTimeout(() => {
                assert.strictEqual(debouncedExecuted, false);
                debouncer.dispose();
                done();
            }, 100);
        });
    });

    suite('dispose', () => {
        test('should cancel pending callback', (done) => {
            const debouncer = new Debouncer(50);
            let executed = false;

            debouncer.debounce(() => {
                executed = true;
            });

            debouncer.dispose();

            setTimeout(() => {
                assert.strictEqual(executed, false);
                done();
            }, 100);
        });

        test('should be safe to call multiple times', () => {
            const debouncer = new Debouncer(50);

            debouncer.dispose();
            debouncer.dispose();
            debouncer.dispose();

            // No error should be thrown
            assert.ok(true);
        });

        test('should be safe to call without pending callback', () => {
            const debouncer = new Debouncer(50);

            debouncer.dispose();

            // No error should be thrown
            assert.ok(true);
        });
    });

    suite('Integration', () => {
        test('should work correctly with rapid calls', (done) => {
            const debouncer = new Debouncer(30);
            let count = 0;

            // Simulate rapid calls
            for (let i = 0; i < 10; i++) {
                debouncer.debounce(() => {
                    count++;
                });
            }

            setTimeout(() => {
                assert.strictEqual(count, 1);
                debouncer.dispose();
                done();
            }, 100);
        });

        test('should allow new debounce after dispose', (done) => {
            const debouncer = new Debouncer(30);
            let count = 0;

            debouncer.debounce(() => {
                count++;
            });

            debouncer.dispose();

            debouncer.debounce(() => {
                count++;
            });

            setTimeout(() => {
                assert.strictEqual(count, 1);
                debouncer.dispose();
                done();
            }, 100);
        });

        test('should execute separate debouncers independently', (done) => {
            const debouncer1 = new Debouncer(30);
            const debouncer2 = new Debouncer(30);
            let count1 = 0;
            let count2 = 0;

            debouncer1.debounce(() => {
                count1++;
            });

            debouncer2.debounce(() => {
                count2++;
            });

            setTimeout(() => {
                assert.strictEqual(count1, 1);
                assert.strictEqual(count2, 1);
                debouncer1.dispose();
                debouncer2.dispose();
                done();
            }, 100);
        });
    });
});
