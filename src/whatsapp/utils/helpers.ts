export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Функция для замены кириллических символов на латиницу
export const replaceCyrillicWithLatin = (text: string): string => {
  const cyrillicToLatinMap: Record<string, string> = {
    а: "a",
    е: "e",
    о: "o",
    р: "p",
    с: "c",
    х: "x",
    у: "y",
    А: "A",
    Е: "E",
    О: "O",
    Р: "P",
    С: "C",
    Х: "X",
    У: "Y",
  };

  return text.replace(/[аеорсхуАЕОРСХУ]/g, (char) => {
    return Math.random() > 0.5 ? cyrillicToLatinMap[char] || char : char;
  });
};

export const insertInvisibleChar = (text: string): string => {
  const invisibleChar = "​"; // here is invisible char, don't delete it
  const addInvisibleChar = (word: string): string => {
    return word
      .split("")
      .map((char) =>
        Math.random() < 0.25 // Вероятность 25%
          ? char + invisibleChar
          : char
      )
      .join("");
  };

  return text
    .split(" ")
    .map((word) => addInvisibleChar(word))
    .join(" ");
};
