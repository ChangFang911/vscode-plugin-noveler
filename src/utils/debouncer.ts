/**
 * 通用防抖工具类
 * 用于延迟执行频繁触发的操作，避免性能问题
 */
export class Debouncer {
    private timer: NodeJS.Timeout | undefined;
    private readonly delay: number;

    constructor(delay: number) {
        this.delay = delay;
    }

    /**
     * 防抖执行回调函数
     * @param callback 要执行的回调函数
     */
    public debounce(callback: () => void): void {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            callback();
            this.timer = undefined;
        }, this.delay);
    }

    /**
     * 立即执行并清除防抖定时器
     * @param callback 要执行的回调函数
     */
    public immediate(callback: () => void): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        callback();
    }

    /**
     * 清理定时器，防止内存泄漏
     */
    public dispose(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }
}
