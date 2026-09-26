import { marked } from "marked";

// No sanitiser: the only input is this repo's own README.
export const renderMarkdown = (src: string): string => marked.parse(src, { async: false, gfm: true });
