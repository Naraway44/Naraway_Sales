export type Role = "FOUNDER" | "MANAGER" | "EXECUTIVE";

export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "MEETING_SCHEDULED"
  | "PROPOSAL_SENT"
  | "NEGOTIATION"
  | "WON"
  | "LOST"
  | "ON_HOLD";

export type Priority = "LOW" | "MEDIUM" | "HIGH";

export interface Team {
  id: string;
  name: string;
}

export interface Service {
  id: string;
  name: string;
}

export interface LeadSource {
  id: string;
  name: string;
  isOrganic: boolean;
}

export interface User {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: Role;
  teamId: string | null;
  team?: Team | null;
  isActive: boolean;
  mustChangePassword: boolean;
  leadCapacity: number;
  createdAt: string;
}

export interface Lead {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email?: string | null;
  website?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  notes?: string | null;
  serviceId?: string | null;
  service?: Service | null;
  sourceId?: string | null;
  source?: LeadSource | null;
  ownerId?: string | null;
  owner?: { id: string; name: string; employeeId: string } | null;
  priority: Priority;
  status: LeadStatus;
  expectedDealValue?: number | null;
  probability?: number | null;
  expectedClosingDate?: string | null;
  lostReason?: string | null;
  lastContactAt?: string | null;
  nextFollowUp?: string | null;
  ownerPinnedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  id: string;
  leadId: string;
  userId: string | null;
  user?: { id: string; name: string; employeeId: string } | null;
  action: string;
  notes?: string | null;
  timestamp: string;
}

export interface LeadComment {
  id: string;
  userId: string;
  userName: string;
  employeeId: string;
  body: string;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const LEAD_STATUSES: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "MEETING_SCHEDULED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
  "ON_HOLD",
];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  MEETING_SCHEDULED: "Meeting Scheduled",
  PROPOSAL_SENT: "Proposal Sent",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
  ON_HOLD: "On Hold",
};

export const STATUS_COLORS: Record<LeadStatus, string> = {
  NEW: "bg-blue-100 text-blue-700",
  CONTACTED: "bg-indigo-100 text-indigo-700",
  QUALIFIED: "bg-purple-100 text-purple-700",
  MEETING_SCHEDULED: "bg-amber-100 text-amber-700",
  PROPOSAL_SENT: "bg-orange-100 text-orange-700",
  NEGOTIATION: "bg-yellow-100 text-yellow-700",
  WON: "bg-green-100 text-green-700",
  LOST: "bg-red-100 text-red-700",
  ON_HOLD: "bg-gray-200 text-gray-700",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: "bg-gray-100 text-gray-600",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-red-100 text-red-700",
};
