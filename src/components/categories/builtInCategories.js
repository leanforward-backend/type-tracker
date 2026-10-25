export const BUILT_IN_CATEGORIES = [
  { name: "Artificial Intelligence", value: "ai" },
  { name: "Coding", value: "coding" },
  { name: "Programming Architecture", value: "architecture" },
  { name: "Math", value: "math" },
  { name: "Science", value: "science" },
  { name: "History", value: "history" },
  { name: "Geography", value: "geography" },
  { name: "Art", value: "art" },
  { name: "Music", value: "music" },
];

/** Not a category of its own: it draws from every built-in category's pool. */
export const RANDOM_CATEGORY = { name: "Random", value: "random" };

/** What the picker offers before any custom topics. */
export const TOPIC_OPTIONS = [RANDOM_CATEGORY, ...BUILT_IN_CATEGORIES];

/** The opening topic for someone who hasn't picked one. */
export const defaultCategoryFor = (paid) => (paid ? "ai" : RANDOM_CATEGORY.value);
