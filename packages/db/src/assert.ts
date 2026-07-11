export function assertDatabaseUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl || databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is required for database operations");
  }
  return databaseUrl.trim();
}
