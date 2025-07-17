interface FileInfoDto {
    name: string;
    fullPath: string;
    size: number;
    isDirectory: boolean;
    isFile: boolean;
    extension: string;
    createdAt: Date;
    modifiedAt: Date;
    content?: string;
}