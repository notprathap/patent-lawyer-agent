import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Read DATABASE_URL from environment — Prisma CLI should have .env loaded
// If not, set DATABASE_URL before running prisma commands
const url = process.env.DATABASE_URL;

if (!url) {
  // Try loading dotenv manually as fallback
  try {
    const dotenv = require('dotenv');
    dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
  } catch {
    // dotenv not available in this context
  }
}

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL || '',
  },
});
