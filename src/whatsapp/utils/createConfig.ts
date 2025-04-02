import { URL } from "url";
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

export function getPostgreSQLConfigFromEnv() {
  const databaseUrl = process.env.DATABASE_URL;
  
  console.log('Environment loaded:', {
    databaseUrl: databaseUrl ? 'Present' : 'Missing',
    envPath,
    cwd: process.cwd()
  });

  if (!databaseUrl) {
    throw new Error("Переменная окружения DATABASE_URL не установлена");
  }

  // Разбираем URL подключения
  const url = new URL(databaseUrl);

  return {
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : 5432, // Устанавливаем порт по умолчанию 5432, если он не указан
    user: url.username,
    password: url.password,
    database: url.pathname.replace(/^\//, ""), // Убираем начальный символ '/'
    ssl:
      url.searchParams.get("sslmode") === "require"
        ? { rejectUnauthorized: false }
        : false,
  };
}
