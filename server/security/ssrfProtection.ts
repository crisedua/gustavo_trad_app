import * as url from 'url';
import { promisify } from 'util';

/**
 * SSRF Protection utility for validating and safely handling external URLs
 */
export class SSRFProtection {
  // Allowed hostnames for external requests
  private static readonly ALLOWED_HOSTS = [
    'storage.googleapis.com',
    'storage.cloud.google.com',
    '*.storage.googleapis.com', // For bucket-specific subdomains
  ];

  // Blocked internal network ranges
  private static readonly BLOCKED_IP_RANGES = [
    /^127\./,                    // Loopback
    /^10\./,                     // Private Class A
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // Private Class B
    /^192\.168\./,               // Private Class C
    /^169\.254\./,               // Link-local
    /^::1$/,                     // IPv6 loopback
    /^fe80:/,                    // IPv6 link-local
    /^fc00:/,                    // IPv6 unique local
    /^fd00:/,                    // IPv6 unique local
  ];

  // Allowed content types for downloaded files
  private static readonly ALLOWED_CONTENT_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/tiff',
    'image/tif',
    'image/gif',
    'image/bmp',
    'image/webp',
    'application/octet-stream', // Some GCS files may use this
  ];

  // Security limits
  private static readonly MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly REQUEST_TIMEOUT = 10000; // 10 seconds
  private static readonly MAX_REDIRECTS = 3;

  /**
   * Validates if a URL is safe for external requests
   * @param targetUrl - The URL to validate
   * @returns true if URL is safe
   * @throws Error if URL is dangerous or not allowed
   */
  static async validateUrl(targetUrl: string): Promise<boolean> {
    if (!targetUrl || typeof targetUrl !== 'string') {
      throw new Error('Invalid URL: URL must be a non-empty string');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (error) {
      throw new Error(`Invalid URL format: ${targetUrl}`);
    }

    // Only allow HTTPS for external requests (except localhost for dev)
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new Error(`Unsupported protocol: ${parsedUrl.protocol}. Only HTTPS and HTTP are allowed.`);
    }

    // Special handling for localhost (dev environment)
    if (this.isLocalhostUrl(parsedUrl)) {
      return true; // Localhost is handled by PathValidator
    }

    // Validate hostname against allowlist
    if (!this.isHostAllowed(parsedUrl.hostname)) {
      throw new Error(`Host not allowed: ${parsedUrl.hostname}. Only Google Cloud Storage URLs are permitted.`);
    }

    // Check for blocked IP addresses
    if (this.isIpBlocked(parsedUrl.hostname)) {
      throw new Error(`Access to internal IP address blocked: ${parsedUrl.hostname}`);
    }

    // Resolve hostname to IP and check again
    try {
      const resolvedIps = await this.resolveHostname(parsedUrl.hostname);
      for (const ip of resolvedIps) {
        if (this.isIpBlocked(ip)) {
          throw new Error(`Resolved IP address is blocked: ${ip} for hostname ${parsedUrl.hostname}`);
        }
      }
    } catch (error) {
      // If we can't resolve, be conservative and block
      throw new Error(`Unable to resolve hostname for security validation: ${parsedUrl.hostname}`);
    }

    return true;
  }

  /**
   * Creates a secure HTTP request configuration
   * @param targetUrl - The target URL 
   * @returns Secure request configuration
   */
  static createSecureRequestConfig(targetUrl: string): any {
    return {
      timeout: this.REQUEST_TIMEOUT,
      maxRedirects: this.MAX_REDIRECTS,
      maxContentLength: this.MAX_DOWNLOAD_SIZE,
      validateStatus: (status: number) => status < 400,
      headers: {
        'User-Agent': 'Replit-DocumentProcessor/1.0',
        'Accept': this.ALLOWED_CONTENT_TYPES.join(', '),
      },
    };
  }

  /**
   * Validates response content type
   * @param contentType - The response content type
   * @returns true if content type is allowed
   * @throws Error if content type is not allowed
   */
  static validateContentType(contentType: string): boolean {
    if (!contentType) {
      throw new Error('No content type specified in response');
    }

    const normalizedType = contentType.toLowerCase().split(';')[0].trim();
    
    if (!this.ALLOWED_CONTENT_TYPES.includes(normalizedType)) {
      throw new Error(`Content type not allowed: ${normalizedType}. Allowed types: ${this.ALLOWED_CONTENT_TYPES.join(', ')}`);
    }

    return true;
  }

  /**
   * Validates response size
   * @param contentLength - The response content length
   * @returns true if size is within limits
   * @throws Error if size exceeds limits
   */
  static validateResponseSize(contentLength: number): boolean {
    if (contentLength > this.MAX_DOWNLOAD_SIZE) {
      throw new Error(`Response size ${contentLength} bytes exceeds maximum allowed size of ${this.MAX_DOWNLOAD_SIZE} bytes`);
    }
    return true;
  }

  /**
   * Checks if URL is localhost
   */
  private static isLocalhostUrl(parsedUrl: URL): boolean {
    return parsedUrl.hostname === 'localhost' || 
           parsedUrl.hostname === '127.0.0.1' ||
           parsedUrl.hostname === '::1';
  }

  /**
   * Checks if hostname is in allowlist
   */
  private static isHostAllowed(hostname: string): boolean {
    const normalizedHostname = hostname.toLowerCase();
    
    return this.ALLOWED_HOSTS.some(allowedHost => {
      if (allowedHost.startsWith('*.')) {
        const domain = allowedHost.substring(2);
        return normalizedHostname.endsWith('.' + domain) || normalizedHostname === domain;
      }
      return normalizedHostname === allowedHost;
    });
  }

  /**
   * Checks if IP address is blocked
   */
  private static isIpBlocked(ip: string): boolean {
    return this.BLOCKED_IP_RANGES.some(range => range.test(ip));
  }

  /**
   * Resolves hostname to IP addresses
   */
  private static async resolveHostname(hostname: string): Promise<string[]> {
    const dns = require('dns');
    const lookup = promisify(dns.lookup);
    
    try {
      // Try IPv4 first
      const result = await lookup(hostname, { family: 4, all: true });
      return Array.isArray(result) ? result.map(r => r.address) : [result.address];
    } catch (ipv4Error) {
      try {
        // Fallback to IPv6
        const result = await lookup(hostname, { family: 6, all: true });
        return Array.isArray(result) ? result.map(r => r.address) : [result.address];
      } catch (ipv6Error) {
        throw new Error(`Cannot resolve hostname: ${hostname}`);
      }
    }
  }

  /**
   * Creates a timeout promise for request abortion
   */
  static createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);
    });
  }
}