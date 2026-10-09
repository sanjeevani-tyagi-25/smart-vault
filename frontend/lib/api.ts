import {
  AuthResponse,
  User,
  DashboardData,
  Asset,
  DocumentItem,
  DocumentUpdatePayload,
  ExtractionResult,
  SearchResponse,
  Nominee,
  AccessRequest,
  AuditLogItem,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// --- Token & Storage Management ---
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("smartvault_token");
}

export function setToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("smartvault_token", token);
  }
}

export function removeToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("smartvault_token");
    localStorage.removeItem("smartvault_user");
  }
}

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("smartvault_user");
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setUser(user: User): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("smartvault_user", JSON.stringify(user));
  }
}

export function logout(): void {
  removeToken();
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

// --- Fetch Wrapper ---
export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Set default JSON Content-Type if body is not FormData
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    removeToken();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new Error("Session expired. Please log in again.");
  }

  if (!res.ok) {
    let errorMsg = `Request failed (${res.status})`;
    try {
      const errJson = await res.json();
      errorMsg = errJson.detail || errJson.message || errorMsg;
    } catch {
      // fallback
    }
    throw new Error(errorMsg);
  }

  return res.json() as Promise<T>;
}

// --- Auth Endpoints ---
export async function registerUser(name: string, email: string, password: string): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  setToken(data.access_token);
  setUser(data.user);
  return data;
}

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.access_token);
  setUser(data.user);
  return data;
}

export async function getMe(): Promise<User> {
  return apiFetch<User>("/me");
}

// --- Dashboard ---
export async function getDashboard(): Promise<DashboardData> {
  return apiFetch<DashboardData>("/dashboard");
}

// --- Assets ---
export async function getAssets(): Promise<Asset[]> {
  return apiFetch<Asset[]>("/assets");
}

export async function getAsset(id: number): Promise<Asset> {
  return apiFetch<Asset>(`/assets/${id}`);
}

export async function createAsset(name: string, type: string): Promise<Asset> {
  return apiFetch<Asset>("/assets", {
    method: "POST",
    body: JSON.stringify({ name, type }),
  });
}

export async function deleteAsset(id: number): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>(`/assets/${id}`, {
    method: "DELETE",
  });
}

// --- Documents ---
export async function extractDocument(file: File): Promise<ExtractionResult> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<ExtractionResult>("/documents/extract", {
    method: "POST",
    body: formData,
  });
}

export async function saveDocument(formData: FormData): Promise<DocumentItem> {
  return apiFetch<DocumentItem>("/documents", {
    method: "POST",
    body: formData,
  });
}

export async function getDocument(id: number): Promise<DocumentItem> {
  return apiFetch<DocumentItem>(`/documents/${id}`);
}

export async function deleteDocument(id: number): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>(`/documents/${id}`, {
    method: "DELETE",
  });
}

export async function getDocuments(params?: { asset_id?: number; doc_type?: string }): Promise<DocumentItem[]> {
  const query = new URLSearchParams();
  if (params?.asset_id) query.append("asset_id", String(params.asset_id));
  if (params?.doc_type) query.append("doc_type", params.doc_type);
  const qStr = query.toString();
  return apiFetch<DocumentItem[]>(`/documents${qStr ? `?${qStr}` : ""}`);
}

export async function updateDocument(id: number, payload: DocumentUpdatePayload): Promise<DocumentItem> {
  return apiFetch<DocumentItem>(`/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function toggleShareable(id: number): Promise<DocumentItem> {
  return apiFetch<DocumentItem>(`/documents/${id}/toggle-shareable`, {
    method: "PATCH",
  });
}

export function getDocumentDownloadUrl(id: number): string {
  const token = getToken();
  return `${API_BASE}/documents/${id}/file?token=${encodeURIComponent(token || "")}`;
}

export async function downloadDecryptedDocument(id: number, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/documents/${id}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Could not decrypt and download document");
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// --- Search ---
export async function searchVault(query: string): Promise<SearchResponse> {
  return apiFetch<SearchResponse>("/search", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

// --- Nominees & Emergency Access ---
export async function getNominees(): Promise<Nominee[]> {
  return apiFetch<Nominee[]>("/nominees");
}

export async function addNominee(name: string, email: string, relationship: string): Promise<Nominee> {
  return apiFetch<Nominee>("/nominees", {
    method: "POST",
    body: JSON.stringify({ name, email, relationship }),
  });
}

export async function deleteNominee(id: number): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>(`/nominees/${id}`, {
    method: "DELETE",
  });
}

export async function getAccessRequests(): Promise<AccessRequest[]> {
  return apiFetch<AccessRequest[]>("/access-requests");
}

export async function getCurrentAccessRequest(): Promise<AccessRequest | null> {
  return apiFetch<AccessRequest | null>("/access-requests/current");
}

export async function requestEmergencyAccess(nominee_id: number): Promise<AccessRequest> {
  return apiFetch<AccessRequest>("/access-requests", {
    method: "POST",
    body: JSON.stringify({ nominee_id }),
  });
}

export async function vetoAccessRequest(requestId: number): Promise<AccessRequest> {
  return apiFetch<AccessRequest>(`/access-requests/${requestId}/veto`, {
    method: "POST",
  });
}

export async function approveAccessRequest(requestId: number): Promise<AccessRequest> {
  return apiFetch<AccessRequest>(`/access-requests/${requestId}/approve`, {
    method: "POST",
  });
}

export async function getNomineeDocuments(): Promise<DocumentItem[]> {
  return apiFetch<DocumentItem[]>("/nominee/documents");
}

// --- Audit Log ---
export async function getAuditLog(): Promise<AuditLogItem[]> {
  return apiFetch<AuditLogItem[]>("/audit-log");
}
