import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Custom font-size tokens from index.css, so merges drop the size they replace.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["body", "meta", "label", "title", "question", "question-sm"] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
