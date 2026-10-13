import { parseFrontMatter } from './frontMatterParser';

export function getCharacterAliases(text: string): string[] {
    const data = parseFrontMatter(text).data;
    const name = String(data.name ?? '').trim();
    return Array.isArray(data.aliases)
        ? [...new Set(data.aliases.filter((alias): alias is string => typeof alias === 'string')
            .map(alias => alias.trim()).filter(alias => alias && alias !== name))]
        : [];
}
