import { PathValidator } from './pathValidator';
import * as path from 'path';
import * as fs from 'fs';

// Mock fs for testing
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('PathValidator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateAndSanitizePath', () => {
    it('should accept valid paths within allowed directories', () => {
      const result = PathValidator.validateAndSanitizePath('test/file.pdf', 'uploads');
      expect(result).toContain('uploads');
      expect(result).toContain('test');
      expect(result).toContain('file.pdf');
    });

    it('should reject paths with directory traversal attempts', () => {
      expect(() => {
        PathValidator.validateAndSanitizePath('../../../etc/passwd', 'uploads');
      }).toThrow('contains dangerous pattern');
    });

    it('should reject paths with .. components', () => {
      expect(() => {
        PathValidator.validateAndSanitizePath('test/../../../etc/passwd', 'uploads');
      }).toThrow('contains dangerous pattern');
    });

    it('should reject paths with null bytes', () => {
      expect(() => {
        PathValidator.validateAndSanitizePath('test\x00file.pdf', 'uploads');
      }).toThrow('contains dangerous pattern');
    });

    it('should reject paths with Windows reserved names', () => {
      expect(() => {
        PathValidator.validateAndSanitizePath('CON', 'uploads');
      }).toThrow('contains dangerous pattern');
      
      expect(() => {
        PathValidator.validateAndSanitizePath('aux.txt', 'uploads');
      }).toThrow('contains dangerous pattern');
    });

    it('should reject empty or non-string paths', () => {
      expect(() => {
        PathValidator.validateAndSanitizePath('', 'uploads');
      }).toThrow('path must be a non-empty string');

      expect(() => {
        PathValidator.validateAndSanitizePath(null as any, 'uploads');
      }).toThrow('path must be a non-empty string');
    });

    it('should reject paths that are too long', () => {
      const longPath = 'a'.repeat(300);
      expect(() => {
        PathValidator.validateAndSanitizePath(longPath, 'uploads');
      }).toThrow('path length exceeds');
    });

    it('should reject invalid root directories', () => {
      expect(() => {
        PathValidator.validateAndSanitizePath('test.pdf', 'invalid_root');
      }).toThrow('not allowed');
    });

    it('should reject paths with just dots as components', () => {
      expect(() => {
        PathValidator.validateAndSanitizePath('test/...', 'uploads');
      }).toThrow('Invalid path component');

      expect(() => {
        PathValidator.validateAndSanitizePath('..', 'uploads');
      }).toThrow('contains dangerous pattern');
    });

    it('should normalize slashes and remove leading slashes', () => {
      const result = PathValidator.validateAndSanitizePath('//test\\file.pdf', 'uploads');
      expect(result).toContain(path.join('uploads', 'test', 'file.pdf'));
    });

    it('should prevent path traversal to parent directories', () => {
      // This should fail because the resolved path would go outside the allowed root
      expect(() => {
        // Create a path that when joined and resolved would escape the allowed directory
        const maliciousPath = '../outside.txt';
        PathValidator.validateAndSanitizePath(maliciousPath, 'uploads');
      }).toThrow('contains dangerous pattern');
    });
  });

  describe('mapLocalhostUrlToPath', () => {
    it('should map public-objects URLs correctly', () => {
      const url = new URL('http://localhost:5000/public-objects/templates/test.pdf');
      const result = PathValidator.mapLocalhostUrlToPath(url);
      expect(result).toContain('public-objects');
      expect(result).toContain('templates');
      expect(result).toContain('test.pdf');
    });

    it('should map objects URLs to uploads directory', () => {
      const url = new URL('http://localhost:5000/objects/documents/file.pdf');
      const result = PathValidator.mapLocalhostUrlToPath(url);
      expect(result).toContain('uploads');
      expect(result).toContain('documents');
      expect(result).toContain('file.pdf');
    });

    it('should map attached_assets URLs correctly', () => {
      const url = new URL('http://localhost:5000/attached_assets/image.png');
      const result = PathValidator.mapLocalhostUrlToPath(url);
      expect(result).toContain('attached_assets');
      expect(result).toContain('image.png');
    });

    it('should reject URLs with path traversal attempts', () => {
      expect(() => {
        const url = new URL('http://localhost:5000/public-objects/../../../etc/passwd');
        PathValidator.mapLocalhostUrlToPath(url);
      }).toThrow('contains dangerous pattern');
    });

    it('should reject unsupported URL paths', () => {
      expect(() => {
        const url = new URL('http://localhost:5000/unsupported/path');
        PathValidator.mapLocalhostUrlToPath(url);
      }).toThrow('Unsupported localhost URL path');
    });

    it('should handle URL encoded paths securely', () => {
      expect(() => {
        // URL encoded "../" 
        const url = new URL('http://localhost:5000/public-objects/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd');
        PathValidator.mapLocalhostUrlToPath(url);
      }).toThrow('contains dangerous pattern');
    });
  });

  describe('validateFileExists', () => {
    it('should return true for existing files', () => {
      mockedFs.statSync.mockReturnValue({
        isFile: () => true,
        size: 1024
      } as any);

      const result = PathValidator.validateFileExists('/path/to/file.pdf');
      expect(result).toBe(true);
      expect(mockedFs.statSync).toHaveBeenCalledWith('/path/to/file.pdf');
    });

    it('should throw error for non-existent files', () => {
      mockedFs.statSync.mockImplementation(() => {
        const error = new Error('ENOENT') as any;
        error.code = 'ENOENT';
        throw error;
      });

      expect(() => {
        PathValidator.validateFileExists('/path/to/nonexistent.pdf');
      }).toThrow('File not found');
    });

    it('should throw error for directories', () => {
      mockedFs.statSync.mockReturnValue({
        isFile: () => false,
        size: 4096
      } as any);

      expect(() => {
        PathValidator.validateFileExists('/path/to/directory');
      }).toThrow('Path is not a file');
    });

    it('should handle other filesystem errors', () => {
      mockedFs.statSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => {
        PathValidator.validateFileExists('/path/to/file.pdf');
      }).toThrow('File access error');
    });
  });

  describe('validateFileSize', () => {
    it('should return file size for files within limits', () => {
      mockedFs.statSync.mockReturnValue({
        size: 1024
      } as any);

      const result = PathValidator.validateFileSize('/path/to/file.pdf', 2048);
      expect(result).toBe(1024);
    });

    it('should use default size limit if not provided', () => {
      mockedFs.statSync.mockReturnValue({
        size: 1024
      } as any);

      const result = PathValidator.validateFileSize('/path/to/file.pdf');
      expect(result).toBe(1024);
    });

    it('should throw error for files exceeding size limit', () => {
      mockedFs.statSync.mockReturnValue({
        size: 1024 * 1024 * 15 // 15MB
      } as any);

      expect(() => {
        PathValidator.validateFileSize('/path/to/largefile.pdf', 10 * 1024 * 1024); // 10MB limit
      }).toThrow('File too large');
    });
  });

  describe('Edge cases and security tests', () => {
    it('should handle various path injection attempts', () => {
      const maliciousPaths = [
        '../',
        '..\\',
        '....///',
        '%2e%2e%2f',
        '..%2f',
        '..%5c',
        '%2e%2e/',
        '.%2e/',
        'test/../test',
        'test\\..\\test',
      ];

      maliciousPaths.forEach(maliciousPath => {
        expect(() => {
          PathValidator.validateAndSanitizePath(maliciousPath, 'uploads');
        }).toThrow();
      });
    });

    it('should reject paths with invalid characters', () => {
      const invalidPaths = [
        'test<file.pdf',
        'test>file.pdf', 
        'test|file.pdf',
        'test?file.pdf',
        'test*file.pdf',
        'test"file.pdf',
        'test:file.pdf',
      ];

      invalidPaths.forEach(invalidPath => {
        expect(() => {
          PathValidator.validateAndSanitizePath(invalidPath, 'uploads');
        }).toThrow('contains dangerous pattern');
      });
    });
  });
});