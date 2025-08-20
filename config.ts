export const IMG_WEB_PORT = process.env.IMG_WEB_PORT || '3000';
export const IMG_API_PORT = process.env.IMG_API_PORT || '3001';

export const IMG_API_URL = `http://localhost:${IMG_API_PORT}/images-local/`;

export const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

export const DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
console.log("Database URL is set to:", DATABASE_URL);

export const TS_HOST = process.env.TS_HOST || 'localhost';
export const TS_QUERY_PORT = Number(process.env.TS_QUERY_PORT) || 10011;
export const TS_SERVER_PORT = Number(process.env.TS_SERVER_PORT) || 9987;
export const TS_USERNAME = process.env.TS_USERNAME || 'serveradmin';
export const TS_USERPASSWORD = process.env.TS_USERPASSWORD || 'password';