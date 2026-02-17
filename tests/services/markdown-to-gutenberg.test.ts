import { describe, it, expect } from "vitest";
import { convertMarkdownToGutenberg } from "../../src/services/markdown-to-gutenberg.js";

describe("convertMarkdownToGutenberg", () => {
  it("converts a paragraph", () => {
    const result = convertMarkdownToGutenberg("Hello world");
    expect(result).toContain("<!-- wp:paragraph -->");
    expect(result).toContain("<p>Hello world</p>");
    expect(result).toContain("<!-- /wp:paragraph -->");
  });

  it("converts headings", () => {
    const md = "# Heading 1\n\n## Heading 2\n\n### Heading 3";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain('<h1>Heading 1</h1>');
    expect(result).toContain('<h2>Heading 2</h2>');
    expect(result).toContain('<h3>Heading 3</h3>');
  });

  it("converts code blocks with Prismatic format", () => {
    const md = "```javascript\nconst x = 1;\nconsole.log(x);\n```";
    const result = convertMarkdownToGutenberg(md, { highlighter: "PRISMATIC" });
    expect(result).toContain('<!-- wp:prismatic/blocks {"language":"javascript"} -->');
    expect(result).toContain('class="language-javascript"');
    expect(result).toContain("const x = 1;");
    expect(result).toContain("console.log(x);");
    expect(result).toContain("<!-- /wp:prismatic/blocks -->");
  });

  it("converts code blocks with WP_CODE format", () => {
    const md = "```python\nprint('hello')\n```";
    const result = convertMarkdownToGutenberg(md, { highlighter: "WP_CODE" });
    expect(result).toContain("<!-- wp:code -->");
    expect(result).toContain('class="language-python"');
    expect(result).toContain("<!-- /wp:code -->");
  });

  it("normalizes language shortcuts", () => {
    const md = "```js\nlet x = 1;\n```";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain('"language":"javascript"');
  });

  it("normalizes py to python", () => {
    const md = "```py\nx = 1\n```";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain('"language":"python"');
  });

  it("normalizes sh to bash", () => {
    const md = "```sh\necho hello\n```";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain('"language":"bash"');
  });

  it("normalizes ts to typescript", () => {
    const md = "```ts\nconst x: number = 1;\n```";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain('"language":"typescript"');
  });

  it("handles code blocks without language", () => {
    const md = "```\nsome code\n```";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain('"language":"text"');
  });

  it("escapes HTML in code blocks", () => {
    const md = "```html\n<div class=\"test\">&amp;</div>\n```";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain("&lt;div class=");
    expect(result).not.toContain("<div class=");
  });

  it("converts unordered lists", () => {
    const md = "- Item 1\n- Item 2\n- Item 3";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain("<!-- wp:list -->");
    expect(result).toContain("<li>Item 1</li>");
    expect(result).toContain("<li>Item 2</li>");
    expect(result).toContain("<li>Item 3</li>");
    expect(result).toContain("<ul>");
  });

  it("converts ordered lists", () => {
    const md = "1. First\n2. Second\n3. Third";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain('{"ordered":true}');
    expect(result).toContain("<ol>");
    expect(result).toContain("<li>First</li>");
  });

  it("converts blockquotes", () => {
    const md = "> This is a quote";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain("<!-- wp:quote -->");
    expect(result).toContain("This is a quote");
  });

  it("converts horizontal rules", () => {
    const md = "---";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain("<!-- wp:separator -->");
  });

  it("converts images", () => {
    const md = "![Alt text](https://example.com/image.png)";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain("<!-- wp:image -->");
    expect(result).toContain('src="https://example.com/image.png"');
    expect(result).toContain('alt="Alt text"');
  });

  it("converts inline bold", () => {
    const md = "This is **bold** text";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain("<strong>bold</strong>");
  });

  it("converts inline italic", () => {
    const md = "This is *italic* text";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain("<em>italic</em>");
  });

  it("converts inline code", () => {
    const md = "Use `console.log()` to debug";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain("<code>console.log()</code>");
  });

  it("converts inline links", () => {
    const md = "Visit [Example](https://example.com) for more";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain('<a href="https://example.com">Example</a>');
  });

  it("converts tables", () => {
    const md = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |";
    const result = convertMarkdownToGutenberg(md);
    expect(result).toContain("<!-- wp:table -->");
    expect(result).toContain("<th>Name</th>");
    expect(result).toContain("<td>Alice</td>");
    expect(result).toContain("<td>30</td>");
  });

  it("strips Category/Tags metadata", () => {
    const md = "**Category:** `Tech`\n**Tags:** `automation`\n\nActual content here.";
    const result = convertMarkdownToGutenberg(md);
    expect(result).not.toContain("Category:");
    expect(result).not.toContain("Tags:");
    expect(result).toContain("Actual content here.");
  });

  it("handles a complete technical blog post", () => {
    const md = `## Getting Started

Install the package:

\`\`\`bash
npm install blog-compiler
\`\`\`

Then configure your settings:

\`\`\`typescript
import { BlogCompiler } from 'blog-compiler';

const compiler = new BlogCompiler({
  notion: { token: process.env.NOTION_TOKEN },
  wordpress: { url: 'https://myblog.com' },
});
\`\`\`

Here's a summary:

| Feature | Status |
| --- | --- |
| Code blocks | Supported |
| Images | Supported |

> Note: This is still in beta.

---

That's all for now!`;

    const result = convertMarkdownToGutenberg(md);

    // Should have heading
    expect(result).toContain("<h2>Getting Started</h2>");
    // Should have two code blocks with correct languages
    expect(result).toContain('"language":"bash"');
    expect(result).toContain('"language":"typescript"');
    // Should have table
    expect(result).toContain("<th>Feature</th>");
    // Should have blockquote
    expect(result).toContain("wp:quote");
    // Should have separator
    expect(result).toContain("wp:separator");
    // Should have paragraphs
    expect(result).toContain("Install the package:");
    expect(result).toContain("That's all for now!");
  });
});
