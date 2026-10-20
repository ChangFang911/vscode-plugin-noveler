import { VolumeType } from './volume';

export interface ManuscriptChapter {
    number: number;
    title: string;
    body: string;
    attributes: Record<string, unknown>;
    source: string;
}

export interface ManuscriptVolume {
    title?: string;
    number?: number;
    type?: VolumeType;
    chapters: ManuscriptChapter[];
}

export interface Manuscript {
    title: string;
    volumes: ManuscriptVolume[];
}

export interface ExportFile {
    name: string;
    content: string | Uint8Array;
}

export class ManuscriptError extends Error {
    constructor(message: string, public readonly source?: string) {
        super(message);
        this.name = 'ManuscriptError';
    }
}
