export interface Env {
  port: number;
  host: string;
  corsOrigins: string[];
}

export function loadEnv(): Env {
  return {
    port: Number(process.env.API_PORT ?? 3001),
    host: process.env.API_HOST ?? '0.0.0.0',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
