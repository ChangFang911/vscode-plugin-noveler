/**
 * 文件操作辅助工具
 */

import * as vscode from 'vscode';
import * as path from 'path';
import matter from 'gray-matter';
import { ChapterFrontMatter, ParsedFile } from '../types/config';

/**
 * 文件操作错误
 */
export class FileOperationError extends Error {
    constructor(message: string, public readonly filePath: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'FileOperationError';
    }
}

/**
 * 安全读取文件内容
 * @param filePath 文件路径
 * @returns 文件内容字符串
 */
export async function readFileContent(filePath: string): Promise<string> {
    try {
        const uri = vscode.Uri.file(filePath);
        const content = await vscode.workspace.fs.readFile(uri);
        return Buffer.from(content).toString('utf-8');
    } catch (error) {
        throw new FileOperationError(`无法读取文件: ${filePath}`, filePath, error);
    }
}

/**
 * 安全写入文件内容
 * @param filePath 文件路径
 * @param content 文件内容
 */
export async function writeFileContent(filePath: string, content: string): Promise<void> {
    try {
        const uri = vscode.Uri.file(filePath);
        const buffer = Buffer.from(content, 'utf-8');
        await vscode.workspace.fs.writeFile(uri, buffer);
    } catch (error) {
        throw new FileOperationError(`无法写入文件: ${filePath}`, filePath, error);
    }
}

/**
 * 检查文件是否存在
 * @param filePath 文件路径
 * @returns 文件是否存在
 */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        const uri = vscode.Uri.file(filePath);
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

/**
 * 创建目录（递归）
 * @param dirPath 目录路径
 */
export async function createDirectory(dirPath: string): Promise<void> {
    try {
        const uri = vscode.Uri.file(dirPath);
        await vscode.workspace.fs.createDirectory(uri);
    } catch (error) {
        throw new FileOperationError(`无法创建目录: ${dirPath}`, dirPath, error);
    }
}

/**
 * 读取目录内容
 * @param dirPath 目录路径
 * @returns 文件和目录列表
 */
export async function readDirectory(dirPath: string): Promise<string[]> {
    try {
        const uri = vscode.Uri.file(dirPath);
        const entries = await vscode.workspace.fs.readDirectory(uri);
        return entries.map(([name]) => name);
    } catch (error) {
        throw new FileOperationError(`无法读取目录: ${dirPath}`, dirPath, error);
    }
}

/**
 * 移动/重命名文件
 * @param sourcePath 源路径
 * @param targetPath 目标路径
 * @param overwrite 是否覆盖
 */
export async function moveFile(sourcePath: string, targetPath: string, overwrite = false): Promise<void> {
    try {
        const sourceUri = vscode.Uri.file(sourcePath);
        const targetUri = vscode.Uri.file(targetPath);
        await vscode.workspace.fs.rename(sourceUri, targetUri, { overwrite });
    } catch (error) {
        throw new FileOperationError(`无法移动文件: ${sourcePath} -> ${targetPath}`, sourcePath, error);
    }
}

/**
 * 解析 Markdown 文件的 frontmatter
 * @param filePath 文件路径
 * @returns 解析后的文件内容
 */
export async function parseFrontMatter(filePath: string): Promise<ParsedFile> {
    try {
        const content = await readFileContent(filePath);
        const parsed = matter(content);

        return {
            data: parsed.data as ChapterFrontMatter,
            content: parsed.content
        };
    } catch (error) {
        if (error instanceof FileOperationError) {
            throw error;
        }
        throw new FileOperationError(`无法解析 frontmatter: ${filePath}`, filePath, error);
    }
}

/**
 * 更新 Markdown 文件的 frontmatter
 * @param filePath 文件路径
 * @param frontMatter 新的 frontmatter 数据
 */
export async function updateFrontMatter(filePath: string, frontMatter: Partial<ChapterFrontMatter>): Promise<void> {
    try {
        const parsed = await parseFrontMatter(filePath);
        const updatedData = { ...parsed.data, ...frontMatter };
        const updatedContent = matter.stringify(parsed.content, updatedData);
        await writeFileContent(filePath, updatedContent);
    } catch (error) {
        if (error instanceof FileOperationError) {
            throw error;
        }
        throw new FileOperationError(`无法更新 frontmatter: ${filePath}`, filePath, error);
    }
}

/**
 * 安全读取 JSON/JSONC 文件
 * @param filePath 文件路径
 * @returns 解析后的 JSON 对象
 */
export async function readJsonFile<T = unknown>(filePath: string): Promise<T> {
    try {
        const content = await readFileContent(filePath);
        // 移除注释（简单实现，仅处理 // 和 /* */ 注释）
        const cleanedContent = content
            .replace(/\/\*[\s\S]*?\*\//g, '') // 移除块注释
            .replace(/\/\/.*/g, ''); // 移除行注释

        return JSON.parse(cleanedContent) as T;
    } catch (error) {
        throw new FileOperationError(`无法解析 JSON 文件: ${filePath}`, filePath, error);
    }
}

/**
 * 写入 JSON 文件
 * @param filePath 文件路径
 * @param data 要写入的数据
 * @param indent 缩进空格数
 */
export async function writeJsonFile<T>(filePath: string, data: T, indent = 2): Promise<void> {
    try {
        const content = JSON.stringify(data, null, indent);
        await writeFileContent(filePath, content);
    } catch (error) {
        throw new FileOperationError(`无法写入 JSON 文件: ${filePath}`, filePath, error);
    }
}

/**
 * 获取目录中的所有 Markdown 文件
 * @param dirPath 目录路径
 * @param recursive 是否递归搜索
 * @returns Markdown 文件路径列表
 */
export async function getMarkdownFiles(dirPath: string, recursive = false): Promise<string[]> {
    try {
        const entries = await readDirectory(dirPath);
        const markdownFiles: string[] = [];

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry);

            if (entry.endsWith('.md')) {
                markdownFiles.push(fullPath);
            } else if (recursive) {
                try {
                    const subFiles = await getMarkdownFiles(fullPath, true);
                    markdownFiles.push(...subFiles);
                } catch {
                    // 如果不是目录，忽略错误
                }
            }
        }

        return markdownFiles;
    } catch (error) {
        throw new FileOperationError(`无法获取 Markdown 文件: ${dirPath}`, dirPath, error);
    }
}
