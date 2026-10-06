import { defineConfig } from 'prisma/config';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

export default defineConfig({
  experimental: { adapter: true },
  schema: './schema.prisma',
  engine: 'js',
  adapter: async () => new PrismaLibSQL({ url: process.env.LOCAL_PRISMA_URL! }),
});
