import * as path from 'path';
import * as fs from 'fs';

/**
 * Security utility for validating file paths and preventing path traversal attacks
 */
export class PathValidator {
  private static readonly ALLOWED_DIRECTORIES = [
    'uploads',
    'public-objects',
    'attached_assets'
  ];

  private static readonly MAX_PATH_LENGTH = 255;
  private static readonly DANGEROUS_PATTERNS = [
    /\.\./,                    // Directory traversal attempts
    /[<>:"|?*]/,              // Invalid filename characters
    /[\x00-\x1f]/,            // Control characters
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, // Windows reserved names
  ];

  /**
   * Validates and sanitizes a file path to prevent traversal attacks
   * @param inputPath - The input path to validate
   * @param allowedRoot - The allowed root directory (e.g., 'uploads', 'public-objects')
   * @returns Validated and normalized path
   * @throws Error if path is invalid or dangerous
   */
  static validateAndSanitizePath(inputPath: string, allowedRoot: string): string {
    // Basic input validation
    if (!inputPath || typeof inputPath !== 'string') {
      throw new Error('Invalid path: path must be a non-empty string');
    }

    if (inputPath.length > this.MAX_PATH_LENGTH) {
      throw new Error(`Invalid path: path length exceeds ${this.MAX_PATH_LENGTH} characters`);
    }

    // Check for dangerous patterns
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(inputPath)) {
        throw new Error(`Invalid path: contains dangerous pattern - ${inputPath}`);
      }
    }

    // Validate allowed root directory
    if (!this.ALLOWED_DIRECTORIES.includes(allowedRoot)) {
      throw new Error(`Invalid root directory: ${allowedRoot} is not allowed`);
    }

    // Clean and normalize the input path
    const cleanPath = inputPath.replace(/[/\\]+/g, '/').replace(/^\/+/, '');
    
    // Split path components and validate each one
    const pathComponents = cleanPath.split('/').filter(component => component.length > 0);
    
    for (const component of pathComponents) {
      // Reject any component that's just dots
      if (/^\.+$/.test(component)) {
        throw new Error(`Invalid path component: ${component}`);
      }
      
      // Additional component validation
      if (component.length > 100) {
        throw new Error(`Invalid path component: component too long - ${component}`);
      }
    }

    // Build the safe path
    const rootDir = path.join(process.cwd(), allowedRoot);
    const fullPath = path.join(rootDir, ...pathComponents);
    
    // Ensure the resolved path stays within the allowed root
    const normalizedFullPath = path.resolve(fullPath);
    const normalizedRootDir = path.resolve(rootDir);
    
    if (!normalizedFullPath.startsWith(normalizedRootDir + path.sep) && normalizedFullPath !== normalizedRootDir) {
      throw new Error(`Path traversal detected: ${inputPath} resolves outside allowed directory ${allowedRoot}`);
    }

    return normalizedFullPath;
  }

  /**
   * Safely maps a localhost URL path to a filesystem path
   * @param url - The URL object to map
   * @returns Validated filesystem path
   * @throws Error if URL path is invalid or dangerous
   */
  static mapLocalhostUrlToPath(url: URL): string {
    const pathname = url.pathname;

    if (pathname.startsWith('/public-objects/')) {
      const relativePath = pathname.substring('/public-objects/'.length);
      return this.validateAndSanitizePath(relativePath, 'public-objects');
    } else if (pathname.startsWith('/objects/')) {
      const relativePath = pathname.substring('/objects/'.length);
      return this.validateAndSanitizePath(relativePath, 'uploads');
    } else if (pathname.startsWith('/attached_assets/')) {
      const relativePath = pathname.substring('/attached_assets/'.length);
      return this.validateAndSanitizePath(relativePath, 'attached_assets');
    } else {
      throw new Error(`Unsupported localhost URL path: ${pathname}`);
    }
  }

  /**
   * Validates that a file exists and is accessible
   * @param filePath - The file path to check
   * @returns true if file exists and is accessible
   * @throws Error if file doesn't exist or is not accessible
   */
  static validateFileExists(filePath: string): boolean {
    try {
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
      }
      return true;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(`File access error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets file size and validates it's within limits
   * @param filePath - The file path to check
   * @param maxSizeBytes - Maximum allowed file size in bytes
   * @returns File size in bytes
   * @throws Error if file is too large
   */
  static validateFileSize(filePath: string, maxSizeBytes: number = 10 * 1024 * 1024): number {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    
    if (fileSize > maxSizeBytes) {
      throw new Error(`File too large: ${fileSize} bytes exceeds limit of ${maxSizeBytes} bytes`);
    }
    
    return fileSize;
  }
}