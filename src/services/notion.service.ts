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

  /** Get a page's Status select value (returns null if not set). */
  async getPageStatus(pageId: string): Promise<string | null> {
    const page = await this.getPageProperties(pageId);
    const props = (page as { properties?: Record<string, unknown> }).properties;
    const status = props?.["Status"] as { select?: { name?: string } } | undefined;
    return status?.select?.name ?? null;
  }
}
