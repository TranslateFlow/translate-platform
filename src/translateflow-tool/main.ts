import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import extract from 'extract-zip';
import path from 'path';
import fs from 'fs/promises';

// Create an MCP server. It manages the communication with client and server
const server = new McpServer({
  name: "demo-server",
  version: "1.0.0"
});

const languagesList = ['de', 'es', 'fr', 'fr-ca', 'ja', 'ko', 'nl', 'pt', 'zh-cn', 'zh-hk',  'de', 'it'];

server.registerTool(
  "localization-translation-tool", 
  {
    title: "Get localization files and translate them",
    description: "Based on languages list, it will extract the localization files from a zip file and return them.",
     inputSchema: {
      languages: z.array(z.string()).default(languagesList),
      test: z.string().default('test')
    }
  },
  async ({ test, languages }) => {

    const zipPath = './files/localization-json-file.zip';
    const extractPath = './languages/en-US';
  
    // const files = await extractZipFile(zipPath, extractPath);
    const files = await iterateFiles(extractPath);

    return {
      content: [{
        type: "text",
        text: test,
        files: files
      }]
    }
  }
);


// listen to client connections
const transport = new StdioServerTransport();
await server.connect(transport);


async function extractZipFile(zipFilePath: string, extractToPath: string): Promise<FileInfoDto[]> {
  try {
    // Check if the ZIP file exists
    await fs.access(zipFilePath);
    
    // Create the destination folder if it doesn't exist
    await fs.mkdir(extractToPath, { recursive: true });
    
    // Extract the ZIP file
    await extract(zipFilePath, { dir: path.resolve(extractToPath) });
    
    console.log(`File extracted successfully to: ${extractToPath}`);

    const files = iterateFiles(extractToPath);

    console.log('Files found:', files);
    return files;
  } catch (error) {
    console.error('Error extracting file:', error);
    throw error;
  }
}

async function iterateFiles(directoryPath: string): Promise<FileInfoDto[]> {
  const files: FileInfoDto[] = [];
  
  async function scanDirectory(currentPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const fileInfo = await getFileInfo(fullPath);
        
        files.push(fileInfo);
        
        // If it's a directory, scan recursively
        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${currentPath}:`, error);
    }
  }
  await scanDirectory(directoryPath);
  return files;
}

async function getFileInfo(filePath: string): Promise<FileInfoDto> {
  const stats = await fs.stat(filePath);
  const parsedPath = path.parse(filePath);
  
  const fileInfo: FileInfoDto = {
    name: parsedPath.base,
    fullPath: path.resolve(filePath),
    size: stats.size,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    extension: parsedPath.ext,
    createdAt: stats.birthtime,
    modifiedAt: stats.mtime
  };
  
  // Read content only for files (not directories)
  if (stats.isFile()) {
    try {
      const content = await readFileContent(filePath);
      fileInfo.content = content;
    } catch (error) {
      console.error(`Error reading file content ${filePath}:`, error);
      fileInfo.content = undefined;
    }
  }
  
  return fileInfo;
}

async function readFileContent(filePath: string): Promise<string | undefined> {
  try {
    const stats = await fs.stat(filePath);
    
    // Check if it's a file
    if (!stats.isFile()) {
      return undefined;
    }
    
    // Get file extension
    const ext = path.extname(filePath).toLowerCase();
    
    // List of text extensions we want to read
    const textExtensions = [
      '.json'
    ];
    
    // Check if it's a known text file
    if (textExtensions.includes(ext)) {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    }
    
    // For files without extension, try to read as text
    if (ext === '') {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        // Check if it contains control characters indicating it's binary
        if (content.includes('\0') || /[\x00-\x08\x0E-\x1F\x7F]/.test(content)) {
          return '[Binary file]';
        }
        return content;
      } catch {
        return '[Error reading file]';
      }
    }
    
    return '[Binary file]';
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return '[Error reading file]';
  }
}



