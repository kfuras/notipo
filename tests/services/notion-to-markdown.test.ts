import { describe, it, expect } from "vitest";
import { convertNotionBlocksToMarkdown } from "../../src/services/notion-to-markdown.js";

const makeBlock = (type: string, data: Record<string, unknown>) => ({
  type,
  [type]: data,
});

const richText = (text: string, annotations: Record<string, boolean> = {}) => ({
  plain_text: text,
  annotations,
});

describe("convertNotionBlocksToMarkdown", () => {
  const defaultProps = {
    Name: { title: [{ plain_text: "Test Post" }] },
    Category: { select: { name: "Tech" } },
  };
  const pageId = "test-page-id";

  it("converts paragraphs", () => {
    const blocks = [makeBlock("paragraph", { rich_text: [richText("Hello world")] })];
    const result = convertNotionBlocksToMarkdown(blocks, defaultProps, pageId);
    expect(result.markdown).toBe("Hello world");
  });

  it("converts headings", () => {
    const blocks = [
      makeBlock("heading_1", { rich_text: [richText("H1")] }),
      makeBlock("heading_2", { rich_text: [richText("H2")] }),
      makeBlock("heading_3", { rich_text: [richText("H3")] }),
    ];
    const result = convertNotionBlocksToMarkdown(blocks, defaultProps, pageId);
    expect(result.markdown).toContain("# H1");
    expect(result.markdown).toContain("## H2");
    expect(result.markdown).toContain("### H3");
  });

  it("converts bulleted list items", () => {
    const blocks = [
      makeBlock("bulleted_list_item", { rich_text: [richText("Item 1")] }),
      makeBlock("bulleted_list_item", { rich_text: [richText("Item 2")] }),
    ];
    const result = convertNotionBlocksToMarkdown(blocks, defaultProps, pageId);
    expect(result.markdown).toContain("- Item 1");
    expect(result.markdown).toContain("- Item 2");
  });

  it("converts numbered list items", () => {
    const blocks = [
      makeBlock("numbered_list_item", { rich_text: [richText("First")] }),
      makeBlock("numbered_list_item", { rich_text: [richText("Second")] }),
    ];
    const result = convertNotionBlocksToMarkdown(blocks, defaultProps, pageId);
    expect(result.markdown).toContain("1. First");
    expect(result.markdown).toContain("1. Second");
  });

  it("converts code blocks with language", () => {
    const blocks = [
      makeBlock("code", { rich_text: [richText("const x = 1;")], language: "javascript" }),
    ];
    const result = convertNotionBlocksToMarkdown(blocks, defaultProps, pageId);
    expect(result.markdown).toContain("```javascript");
    expect(result.markdown).toContain("const x = 1;");
    expect(result.markdown).toContain("```");
  });

  it("converts images and extracts Notion S3 URLs", () => {
    const blocks = [
      makeBlock("image", {
        file: { url: "https://prod-files-secure.s3.us-west-2.amazonaws.com/image.png" },
        caption: [],
      }),
    ];
    const result = convertNotionBlocksToMarkdown(blocks, defaultProps, pageId);
    expect(result.markdown).toContain("![Image]");
    expect(result.images).toHaveLength(1);
    expect(result.images[0].url).toContain("prod-files-secure.s3");
  });

  it("does not extract non-Notion images", () => {
    const blocks = [
      makeBlock("image", {
        external: { url: "https://example.com/image.png" },
        caption: [],
      }),
    ];
    const result = convertNotionBlocksToMarkdown(blocks, defaultProps, pageId);
    expect(result.images).toHaveLength(0);
  });

  it("converts blockquotes", () => {
    const blocks = [makeBlock("quote", { rich_text: [richText("A wise quote")] })];
    const result = convertNotionBlocksToMarkdown(blocks, defaultProps, pageId);
    expect(result.markdown).toContain("> A wise quote");
  });

  it("converts dividers", () => {
    const blocks = [makeBlock("divider", {})];
    const result = convertNotionBlocksToMarkdown(blocks, defaultProps, pageId);
    expect(result.markdown).toContain("---");
  });

  it("handles bold annotations", () => {
    const blocks = [
      makeBlock("paragraph", { rich_text: [richText("bold text", { bold: true })] }),
    ];
    const result = convertNotionBlocksToMarkdown(blocks, defaultProps, pageId);
    expect(result.markdown).toContain("**bold text**");
  });

  it("handles italic annotations", () => {
    const blocks = [
      makeBlock("paragraph", { rich_text: [richText("italic", { italic: true })] }),
    ];
    const result = convertNotionBlocksToMarkdown(blocks, defaultProps, pageId);
    expect(result.markdown).toContain("*italic*");
  });

  it("handles inline code annotations", () => {
    const blocks = [
      makeBlock("paragraph", { rich_text: [richText("code", { code: true })] }),
    ];
    const result = convertNotionBlocksToMarkdown(blocks, defaultProps, pageId);
    expect(result.markdown).toContain("`code`");
  });

  it("extracts metadata from page properties", () => {
    const props = {
      Name: { title: [{ plain_text: "My Blog Post" }] },
      Category: { select: { name: "Automation" } },
      "Featured Image Title": { rich_text: [{ plain_text: "Custom Title" }] },
      "SEO Keyword": { rich_text: [{ plain_text: "automation tools" }] },
    };

    const result = convertNotionBlocksToMarkdown([], props, "page-123");
    expect(result.metadata.title).toBe("My Blog Post");
    expect(result.metadata.category).toBe("Automation");
    expect(result.metadata.featuredImageTitle).toBe("Custom Title");
    expect(result.metadata.seoKeyword).toBe("automation tools");
    expect(result.metadata.notionId).toBe("page-123");
  });
});
