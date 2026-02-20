/**
 * Notion API client for polling databases and fetching page content.
 * Uses @notionhq/client under the hood.
 */

import { Client } from "@notionhq/client";

export class NotionService {
  private client: Client;

  constructor(accessToken: string) {
    this.client = new Client({ auth: accessToken });
  }

  /** Query a Notion database for pages matching a status filter. */
  async getReadyPosts(databaseId: string, triggerStatus: string, limit = 1) {
    const response = await this.client.databases.query({
      database_id: databaseId,
      filter: {
        property: "Status",
        select: { equals: triggerStatus },
      },
      page_size: limit,
    });
    return response.results;
  }

  /** Get all blocks (content) from a Notion page. */
  async getPageBlocks(pageId: string) {
    const blocks: unknown[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.client.blocks.children.list({
        block_id: pageId,
        start_cursor: cursor,
        page_size: 100,
      });
      blocks.push(...response.results);
      cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (cursor);

    return blocks;
  }

  /** Update a Notion page's status property. */
  async updatePageStatus(pageId: string, status: string) {
    await this.client.pages.update({
      page_id: pageId,
      properties: {
        Status: { select: { name: status } },
      },
    });
  }

  /** Get a page's properties. */
  async getPageProperties(pageId: string) {
    return this.client.pages.retrieve({ page_id: pageId });
  }

  /** Update a Notion database's Category select and Tags multi-select options. */
  async syncDatabaseOptions(databaseId: string, categories: string[], tags: string[]) {
    const COLORS = ["blue", "green", "orange", "red", "purple", "pink", "yellow", "brown", "gray"] as const;

    // Fetch existing options so we don't try to change their colors (Notion API rejects that)
    const db = await this.client.databases.retrieve({ database_id: databaseId });
    const props = (db as { properties: Record<string, { select?: { options: Array<{ name: string }> }; multi_select?: { options: Array<{ name: string }> } }> }).properties;
    const existingCategories = new Set((props.Category?.select?.options ?? []).map((o) => o.name));
    const existingTags = new Set((props.Tags?.multi_select?.options ?? []).map((o) => o.name));

    const catOptions = categories.map((name, i) =>
      existingCategories.has(name) ? { name } : { name, color: COLORS[i % COLORS.length] },
    );
    const tagOptions = tags.map((name, i) =>
      existingTags.has(name) ? { name } : { name, color: COLORS[i % COLORS.length] },
    );

    await this.client.databases.update({
      database_id: databaseId,
      properties: {
        Category: { select: { options: catOptions } },
        Tags: { multi_select: { options: tagOptions } },
      },
    });
  }

  /** Get a page's Status select value (returns null if not set). */
  async getPageStatus(pageId: string): Promise<string | null> {
    const page = await this.getPageProperties(pageId);
    const props = (page as { properties?: Record<string, unknown> }).properties;
    const status = props?.["Status"] as { select?: { name?: string } } | undefined;
    return status?.select?.name ?? null;
  }
}
