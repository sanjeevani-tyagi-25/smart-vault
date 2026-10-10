export interface User {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface DocumentFields {
  number?: string | null;
  holder_name?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  issuer?: string | null;
  extra?: Record<string, any>;
}

export interface DocumentConfidence {
  doc_type?: number;
  number?: number;
  holder_name?: number;
  issue_date?: number;
  expiry_date?: number;
  [key: string]: number | undefined;
}

export interface DocumentItem {
  id: number;
  asset_id: number;
  user_id: number;
  doc_type: string;
  title: string;
  original_filename: string;
  mime_type: string;
  fields?: DocumentFields | null;
  raw_text?: string | null;
  confidence?: DocumentConfidence | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  is_emergency_shareable: boolean;
  created_at: string;
  asset_name?: string | null;
}

export interface DocumentUpdatePayload {
  title?: string;
  doc_type?: string;
  asset_id?: number;
  issue_date?: string | null;
  expiry_date?: string | null;
  is_emergency_shareable?: boolean;
  fields_json?: string;
  fields?: DocumentFields;
  raw_text?: string;
}

export interface ChecklistItem {
  doc_type: string;
  label: string;
  optional: boolean;
  note?: string | null;
  present: boolean;
}

export interface Asset {
  id: number;
  user_id: number;
  name: string;
  type: "vehicle" | "property" | "person" | "other";
  created_at: string;
  document_count: number;
  missing_count: number;
  documents?: DocumentItem[];
  checklist?: ChecklistItem[];
  missing_docs?: ChecklistItem[];
}

export interface ExpiryAlert {
  document_id: number;
  title: string;
  doc_type: string;
  asset_name: string;
  asset_id: number;
  expiry_date: string;
  days_left: number;
  severity: "expired" | "urgent" | "soon" | "healthy";
  label: string;
  color: "red" | "amber" | "green";
  renew_url?: string | null;
}

export interface NextAction {
  action: string;
  asset_id?: number | null;
  doc_type?: string | null;
  estimated_improvement: string;
}

export interface DashboardData {
  readiness_score: number;
  breakdown: {
    completeness: { score: number; max: number; percentage: number };
    expiry_health: { score: number; max: number; percentage: number };
    nominee_setup: { score: number; max: number };
  };
  next_actions: NextAction[];
  alerts: ExpiryAlert[];
  assets: Asset[];
  total_documents: number;
  total_assets: number;
  expiring_soon_count?: number;
  expired_count?: number;
  missing_count?: number;
  recent_activity?: AuditLogItem[];
}

export interface ExtractionResult {
  doc_type: string;
  title: string;
  fields: DocumentFields;
  confidence: DocumentConfidence;
  raw_text: string;
  language: string;
  temp_file_token?: string;
}

export interface SearchSource {
  document_id: number;
  title: string;
  field: string;
  value: string;
}

export interface SearchResponse {
  answer: string;
  sources: SearchSource[];
}

export interface Nominee {
  id: number;
  owner_id: number;
  name: string;
  email: string;
  relationship: string;
  status: "invited" | "active";
  created_at: string;
}

export interface AccessRequest {
  id: number;
  owner_id: number;
  nominee_id: number;
  nominee_name?: string | null;
  nominee_relationship?: string | null;
  status: "pending" | "vetoed" | "approved" | "expired";
  requested_at: string;
  unlocks_at: string;
  resolved_at?: string | null;
  seconds_remaining: number;
}

export interface AuditLogItem {
  id: number;
  owner_id: number;
  actor_name: string;
  action: string;
  target: string;
  timestamp: string;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  document_id?: number | null;
  asset_id?: number | null;
  title: string;
  message: string;
  severity: "upcoming" | "soon" | "urgent" | "expired" | "renewed";
  days_left: number;
  interval_days: number;
  state: "active" | "read" | "dismissed" | "renewed";
  is_read: boolean;
  is_dismissed: boolean;
  expiry_date?: string | null;
  created_at: string;
  read_at?: string | null;
  dismissed_at?: string | null;
  asset_name?: string | null;
  doc_type?: string | null;
}

export interface ReminderSettings {
  user_id: number;
  intervals: number[];
  email_enabled: boolean;
  custom_intervals?: number[];
}

