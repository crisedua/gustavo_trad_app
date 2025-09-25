import { Response } from "express";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { ObjectNotFoundError } from "../objectStorage";

// Render-compatible file storage service
export class RenderStorageService {
  private uploadsDir: string;
  private publicObjectsDir: string;

  constructor() {
    // Use local filesystem directories
    this.uploadsDir = path.join(process.cwd(), 'uploads');
    this.publicObjectsDir = path.join(process.cwd(), 'public-objects');
    
    // Ensure directories exist
    this.ensureDirectoryExists(this.uploadsDir);
    this.ensureDirectoryExists(this.publicObjectsDir);
  }

  private ensureDirectoryExists(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);
    }
  }

  // Search for a public object (templates, etc.)
  async searchPublicObject(filePath: string): Promise<any | null> {
    const fullPath = path.join(this.publicObjectsDir, filePath);
    
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    // Create a pseudo-File object for local filesystem files
    return {
      name: filePath,
      bucket: { name: 'local-filesystem' },
      createReadStream: () => fs.createReadStream(fullPath),
      getMetadata: async () => {
        const stats = fs.statSync(fullPath);
        let contentType = 'application/octet-stream';
        const ext = path.extname(fullPath).toLowerCase();
        
        // Set appropriate content types
        if (ext === '.pdf') contentType = 'application/pdf';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.gif') contentType = 'image/gif';
        else if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (ext === '.html') contentType = 'text/html';
        
        return [{
          contentType,
          size: stats.size.toString(),
          timeCreated: stats.birthtime.toISOString(),
          updated: stats.mtime.toISOString()
        }];
      },
      exists: async () => [fs.existsSync(fullPath)]
    };
  }

  // Download object to response
  async downloadObject(file: any, res: Response, cacheTtlSec: number = 3600) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();
      
      // Set appropriate headers
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `public, max-age=${cacheTtlSec}`,
      });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Generate upload URL (for Render, we'll use a local endpoint)
  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || 'http://localhost:3000';
    
    // Return a local upload endpoint URL
    return `${baseUrl}/api/upload/${objectId}`;
  }

  // Get object entity file from path
  async getObjectEntityFile(objectPath: string): Promise<any> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    // Extract the file ID from the path
    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const fileId = parts.slice(1).join("/");
    const fullPath = path.join(this.uploadsDir, fileId);
    
    if (!fs.existsSync(fullPath)) {
      throw new ObjectNotFoundError();
    }

    // Return pseudo-File object
    return {
      name: fileId,
      bucket: { name: 'local-filesystem' },
      createReadStream: () => fs.createReadStream(fullPath),
      getMetadata: async () => {
        const stats = fs.statSync(fullPath);
        let contentType = 'application/octet-stream';
        const ext = path.extname(fullPath).toLowerCase();
        
        if (ext === '.pdf') contentType = 'application/pdf';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.gif') contentType = 'image/gif';
        else if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        
        return [{
          contentType,
          size: stats.size.toString(),
          timeCreated: stats.birthtime.toISOString(),
          updated: stats.mtime.toISOString()
        }];
      },
      exists: async () => [fs.existsSync(fullPath)]
    };
  }

  // Save uploaded file
  async saveUploadedFile(fileId: string, buffer: Buffer): Promise<string> {
    const filePath = path.join(this.uploadsDir, fileId);
    fs.writeFileSync(filePath, buffer);
    return `/objects/${fileId}`;
  }

  // Normalize object entity path
  normalizeObjectEntityPath(rawPath: string): string {
    // For local storage, just return the path as-is if it's already normalized
    if (rawPath.startsWith('/objects/')) {
      return rawPath;
    }
    
    // If it's a full URL, extract the path
    if (rawPath.startsWith('http')) {
      try {
        const url = new URL(rawPath);
        return url.pathname;
      } catch {
        return rawPath;
      }
    }
    
    return rawPath;
  }

  // Set ACL policy (no-op for local storage)
  async trySetObjectEntityAclPolicy(rawPath: string, aclPolicy: any): Promise<string> {
    return this.normalizeObjectEntityPath(rawPath);
  }

  // Check access (always allow for local storage)
  async canAccessObjectEntity(params: any): Promise<boolean> {
    return true;
  }
}
