import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Enhanced startup with proper error handling for Autoscale deployments
(async () => {
  try {
    // Initialize server with error handling
    const server = await registerRoutes(app);

    // Enhanced error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      // Log error for debugging but don't throw to prevent crash
      console.error('Server error:', err);
      res.status(status).json({ message });
    });

    // Setup Vite or static serving with error handling
    try {
      if (app.get("env") === "development") {
        await setupVite(app, server);
        log("Vite development server initialized");
      } else {
        serveStatic(app);
        log("Static file serving initialized");
      }
    } catch (setupError) {
      console.error('Failed to setup Vite/static serving:', setupError);
      throw setupError;
    }

    // Enhanced PORT handling for Autoscale deployments
    const port = process.env.PORT 
      ? parseInt(process.env.PORT, 10)
      : process.env.REPL_SLUG 
        ? 5000  // Replit default
        : 3000; // Local development fallback

    // Validate port
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port: ${port}. PORT environment variable must be a valid port number.`);
    }

    // Start server with comprehensive error handling
    const serverInstance = server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`Server successfully started on port ${port}`);
      log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      log(`Host: 0.0.0.0:${port}`);
    });

    // Handle server startup errors
    serverInstance.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Trying alternative ports...`);
        
        // Try alternative ports for development
        if (app.get("env") === "development") {
          const altPorts = [5001, 5002, 3001, 3002];
          tryAlternativePort(server, altPorts, 0);
        } else {
          console.error('Port collision in production environment. Cannot start server.');
          process.exit(1);
        }
      } else {
        console.error('Server startup error:', error);
        process.exit(1);
      }
    });

    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      log('SIGTERM received, shutting down gracefully...');
      serverInstance.close(() => {
        log('Server closed successfully');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      log('SIGINT received, shutting down gracefully...');
      serverInstance.close(() => {
        log('Server closed successfully');
        process.exit(0);
      });
    });

  } catch (startupError) {
    console.error('Critical startup error:', startupError);
    console.error('Stack trace:', startupError instanceof Error ? startupError.stack : 'No stack trace available');
    
    // Provide helpful error context
    console.error('Environment variables:');
    console.error(`  NODE_ENV: ${process.env.NODE_ENV}`);
    console.error(`  PORT: ${process.env.PORT}`);
    console.error(`  REPL_SLUG: ${process.env.REPL_SLUG}`);
    
    process.exit(1);
  }
})();

// Helper function to try alternative ports in development
function tryAlternativePort(server: any, ports: number[], index: number) {
  if (index >= ports.length) {
    console.error('No available ports found. Please free up a port or set a custom PORT environment variable.');
    process.exit(1);
    return;
  }

  const port = ports[index];
  const serverInstance = server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`Server started on alternative port ${port}`);
  });

  serverInstance.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      log(`Port ${port} also in use, trying next...`);
      tryAlternativePort(server, ports, index + 1);
    } else {
      console.error('Server error on alternative port:', error);
      process.exit(1);
    }
  });
}
