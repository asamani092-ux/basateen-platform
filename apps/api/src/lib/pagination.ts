export const PAGE_SIZE_MAX = 20;

export type PageParams = {
  page: number;
  pageSize: number;
  offset: number;
};

export function parsePageParams(url: URL): PageParams {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const rawSize = Number(url.searchParams.get("page_size") ?? PAGE_SIZE_MAX) || PAGE_SIZE_MAX;
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, rawSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function pageMeta(total: number, params: PageParams) {
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  return {
    page: params.page,
    page_size: params.pageSize,
    total,
    total_pages: totalPages,
    has_prev: params.page > 1,
    has_next: params.page < totalPages,
  };
}
