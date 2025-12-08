/**
 * 章节状态工具函数
 */

/**
 * 状态值映射表（英文 → 中文）
 */
const STATUS_MAP: { [key: string]: string } = {
    'draft': '草稿',
    'first-draft': '初稿',
    'revising': '修改中',
    'completed': '已完成',
    // 兼容旧数据（中文状态直接返回）
    '草稿': '草稿',
    '初稿': '初稿',
    '修改中': '修改中',
    '已完成': '已完成'
};

/**
 * 将状态值映射为中文显示名称
 * @param status 状态值（英文或中文）
 * @returns 中文显示名称
 */
export function getStatusDisplayName(status: string | undefined): string {
    if (!status) {
        return '草稿';
    }
    return STATUS_MAP[status] || status;
}

/**
 * 获取所有可用的状态选项（英文值）
 */
export function getStatusOptions(): string[] {
    return ['draft', 'first-draft', 'revising', 'completed'];
}

/**
 * 获取所有可用的状态选项（中文显示名称）
 */
export function getStatusDisplayOptions(): string[] {
    return ['草稿', '初稿', '修改中', '已完成'];
}
