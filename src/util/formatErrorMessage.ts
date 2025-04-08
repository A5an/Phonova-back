export function formatError(error) {
  const errorMessage =
    typeof error === "object" && error !== null
      ? JSON.stringify(error, null, 2) // Преобразуем объект в строку
      : String(error);

  return errorMessage;
}
