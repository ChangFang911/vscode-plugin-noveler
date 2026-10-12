import { applyEdits, modify, parse, ParseError } from 'jsonc-parser';

export function mergeRecommendedSettings(text: string, defaults: Record<string, unknown>): string {
    let result = text.trim() ? text : '{}';
    const errors: ParseError[] = [];
    const settings = parse(result, errors, { allowTrailingComma: true });
    if (errors.length || !settings || typeof settings !== 'object' || Array.isArray(settings)) {
        throw new Error('settings.json 格式无效，原配置未修改');
    }
    const addMissing = (keys: string[], existing: Record<string, unknown>, recommended: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(recommended)) {
            if (!Object.prototype.hasOwnProperty.call(existing, key)) {
                result = applyEdits(result, modify(result, [...keys, key], value, {
                    formattingOptions: { tabSize: 2, insertSpaces: true, eol: text.includes('\r\n') ? '\r\n' : '\n' }
                }));
            } else if (value && typeof value === 'object' && !Array.isArray(value)) {
                const current = existing[key];
                if (current && typeof current === 'object' && !Array.isArray(current)) {
                    addMissing([...keys, key], current as Record<string, unknown>, value as Record<string, unknown>);
                }
            }
        }
    };
    addMissing([], settings, defaults);
    return result;
}
