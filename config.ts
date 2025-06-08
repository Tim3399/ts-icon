export const IMG_WEB_PORT = process.env.IMG_WEB_PORT || '3000';
export const IMG_API_PORT = process.env.IMG_API_PORT || '3001';

export const IMG_API_URL = `http://localhost:${IMG_API_PORT}/images-local/`;

export const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

  export const DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
  console.log("Database URL is set to:", DATABASE_URL);