type EnvironmentVariables = {
  PORT?: string;
  FRONTEND_URL?: string;
  JWT_SECRET?: string;
  DATABASE_URL?: string;
};

export function validate(config: EnvironmentVariables) {
  const port = Number(config.PORT ?? 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid integer between 1 and 65535.');
  }

  if (!config.JWT_SECRET?.trim()) {
    throw new Error('JWT_SECRET is required.');
  }

  if (!config.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required.');
  }

  return {
    PORT: String(port),
    FRONTEND_URL: config.FRONTEND_URL?.trim() || 'http://localhost:5173',
    JWT_SECRET: config.JWT_SECRET.trim(),
    DATABASE_URL: config.DATABASE_URL.trim(),
  };
}
