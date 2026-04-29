import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { config as loadDotenv } from 'dotenv';

// Load .env up-front so DATABASE_URL is populated before defineConfig reads it.
if (!process.env.DATABASE_URL) {
  loadDotenv({ path: path.resolve(__dirname, '..', '.env') });
}

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL || '',
  },
});
