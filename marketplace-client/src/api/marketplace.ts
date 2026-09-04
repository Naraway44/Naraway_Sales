import { api } from "./client";
import { CheckoutResult, MarketplaceFilters, PurchasedLead, SearchResult } from "./types";

export type SortBy = "listedAt" | "companyName" | "expectedDealValue";
export type SortDir = "asc" | "desc";

export async function searchLeads(
  filters: MarketplaceFilters,
  quantity: number,
  page = 1,
  sortBy: SortBy = "listedAt",
  sortDir: SortDir = "asc"
) {
  const { data } = await api.get<SearchResult>("/marketplace/leads/search", {
    params: { ...filters, quantity, page, sortBy, sortDir },
  });
  return data;
}

export async function checkout(filters: MarketplaceFilters, quantity: number) {
  const { data } = await api.post<CheckoutResult>("/marketplace/checkout", { ...filters, quantity });
  return data;
}

export interface MarketplaceStats {
  leadsInCatalog: number;
  leadsScoredLast30Days: number;
  leadsMatchedToBuyers: number;
  dailyLeadsScored: { date: string; count: number }[];
}

export async function getMarketplaceStats() {
  const { data } = await api.get<MarketplaceStats>("/marketplace/stats");
  return data;
}

/** Answers a visitor's spoken question via the model. `answered: false` means the model
 *  wasn't reachable or isn't configured — the caller then uses its own built-in answers,
 *  so the assistant never goes silent on a visitor. */
export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export async function askAssistant(question: string, history: AssistantTurn[] = []) {
  const { data } = await api.post<{ reply: string; answered: boolean }>("/assistant/ask", {
    question,
    history,
  });
  return data;
}

export async function myPurchases() {
  const { data } = await api.get<PurchasedLead[]>("/marketplace/my-leads");
  return data;
}

export async function exportPurchasesCsv() {
  const response = await api.get("/marketplace/my-leads/export", { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = "my-leads.csv";
  link.click();
  URL.revokeObjectURL(url);
}
