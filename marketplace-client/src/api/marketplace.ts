import { api } from "./client";
import { CheckoutResult, MarketplaceFilters, PurchasedLead, SearchResult } from "./types";

export async function searchLeads(filters: MarketplaceFilters, quantity: number, page = 1) {
  const { data } = await api.get<SearchResult>("/marketplace/leads/search", { params: { ...filters, quantity, page } });
  return data;
}

export async function checkout(filters: MarketplaceFilters, quantity: number) {
  const { data } = await api.post<CheckoutResult>("/marketplace/checkout", { ...filters, quantity });
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
