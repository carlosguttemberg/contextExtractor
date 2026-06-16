import TurndownService from "turndown";

const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Remove macros e elementos específicos do Confluence
td.addRule("confluenceMacros", {
  filter: (node) =>
    node.nodeName === "DIV" &&
    typeof (node as Element).getAttribute === "function" &&
    ((node as Element).getAttribute("class") ?? "").includes("confluence"),
  replacement: (content) => content,
});

// Preserva blocos de código
td.addRule("codeBlock", {
  filter: ["pre"],
  replacement: (_content, node) => {
    const code = node.textContent ?? "";
    const lang = (node as Element).getAttribute("data-language") ?? "";
    return `\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n`;
  },
});

export function htmlToMarkdown(html: string): string {
  return td.turndown(html);
}
