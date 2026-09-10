import "dotenv/config";
import { defineConfig } from "prisma/config";
import { sqliteDatasourceUrl } from "./scripts/lib/sqlite-path";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: sqliteDatasourceUrl(process.env.DATABASE_URL || "file:./dev.db"),
  },
});
