export interface Buyer {
  id: string;
  name: string;
  company?: string | null;
  email: string;
  phone?: string | null;
}

export type CompanySize = "SIZE_1_10" | "SIZE_11_50" | "SIZE_51_200" | "SIZE_201_500" | "SIZE_501_1000" | "SIZE_1000_PLUS";

export interface MarketplaceFilters {
  service?: string;
  industry?: string;
  city?: string;
  state?: string;
  lostReason?: string;
  keyword?: string;
  companySize?: CompanySize;
  dealValueMin?: number;
  dealValueMax?: number;
  dateListedFrom?: string;
  dateListedTo?: string;
}

export interface TeaserLead {
  id: string;
  companyName: string;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  service?: string | null;
  lostReason?: string | null;
  companySize?: CompanySize | null;
  expectedDealValue?: string | null;
  listedAt: string;
}

export interface SearchResult {
  availableCount: number;
  requestedQuantity: number;
  deliverableQuantity: number;
  pricePerLead: number;
  estimatedTotal: number;
  items: TeaserLead[];
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CheckoutResult {
  razorpayOrderId: string;
  razorpayKeyId: string;
  amount: number;
  currency: string;
  leadCount: number;
}

export interface PurchasedLead {
  id: string;
  companyName: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  service?: string | null;
  pricePaid?: string | null;
  purchasedAt: string;
  exclusiveUntil: string;
}
