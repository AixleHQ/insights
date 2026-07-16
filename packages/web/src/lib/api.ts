/**
 * API Client with authentication and organization context
 *
 * This module provides a configured fetch wrapper that automatically:
 * - Adds the Authorization header with the current access token
 * - Adds the X-Organization-ID header for org-scoped requests
 * - Handles common response scenarios (401, 403, etc.)
 */

import { getAccessToken, silentRenew } from "./auth";

export interface ApiClientOptions {
  baseUrl?: string;
  organizationId?: string | null;
}

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  skipOrgHeader?: boolean;
}

const DEFAULT_BASE_URL = import.meta.env.VITE_API_URL || "/api/v1";
const IMPERSONATION_STORAGE_KEY = "impersonation_token";

// Global state for current organization ID
let currentOrgId: string | null = null;

/**
 * Get the auth token - uses impersonation token if active, otherwise regular token
 */
export async function getAuthToken(): Promise<string | null> {
  // Check for impersonation token first
  const impersonationToken = localStorage.getItem(IMPERSONATION_STORAGE_KEY);
  if (impersonationToken) {
    // Verify token isn't expired
    try {
      const parts = impersonationToken.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.exp && payload.exp > Date.now() / 1000) {
          return impersonationToken;
        }
        // Token expired, remove it
        localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
      }
    } catch {
      // Invalid token, remove it
      localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
    }
  }

  // Fall back to regular auth token
  return getAccessToken();
}

/**
 * Set the current organization ID for API requests
 */
export function setCurrentOrganizationId(orgId: string | null): void {
  currentOrgId = orgId;
}

/**
 * Get the current organization ID
 */
export function getCurrentOrganizationId(): string | null {
  return currentOrgId;
}

/** When set, OIDC silent renew + one retry on 401 is skipped (e.g. admin impersonation). */
function isImpersonating(): boolean {
  return !!localStorage.getItem(IMPERSONATION_STORAGE_KEY);
}

/**
 * On a 401, attempt a single OIDC silent renew and report whether the caller should
 * retry the request. Returns false (no retry) for non-401 responses, when skipped
 * (impersonation / skipAuth), or when the renew fails. Shared by apiRequest and
 * downloadBlob so the retry-once policy lives in one place.
 */
async function shouldRetryAfterRenew(status: number, skip: boolean): Promise<boolean> {
  if (status !== 401 || skip) return false;
  const renewed = await silentRenew();
  return !!renewed;
}

/**
 * Make an authenticated API request
 */
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipAuth = false, skipOrgHeader = false, headers = {}, ...fetchOptions } = options;

  const url = endpoint.startsWith("http") ? endpoint : `${DEFAULT_BASE_URL}${endpoint}`;
  const impersonating = isImpersonating();

  const buildHeaders = async (): Promise<HeadersInit> => {
    const requestHeaders: HeadersInit = {
      "Content-Type": "application/json",
      ...headers,
    };

    if (!skipAuth) {
      const token = await getAuthToken();
      if (token) {
        (requestHeaders as Record<string, string>)["Authorization"] = `Bearer ${token}`;
      }
    }

    if (!skipOrgHeader && currentOrgId) {
      (requestHeaders as Record<string, string>)["X-Organization-ID"] = currentOrgId;
    }

    return requestHeaders;
  };

  const doFetch = async () =>
    fetch(url, {
      ...fetchOptions,
      headers: await buildHeaders(),
    });

  let response = await doFetch();

  // Expired access token right after silent renew window: retry once after OIDC refresh.
  if (await shouldRetryAfterRenew(response.status, skipAuth || impersonating)) {
    response = await doFetch();
  }

  // Handle common error responses
  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError("Unauthorized", response.status, await response.json().catch(() => null));
    }
    if (response.status === 403) {
      throw new ApiError("Forbidden", response.status, await response.json().catch(() => null));
    }
    if (response.status === 404) {
      throw new ApiError("Not found", response.status, await response.json().catch(() => null));
    }
    if (response.status === 422) {
      const data = await response.json().catch(() => null);
      throw new ApiError("Validation error", response.status, data);
    }

    const errorData = await response.json().catch(() => null);
    throw new ApiError(
      errorData?.message || `Request failed with status ${response.status}`,
      response.status,
      errorData
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Fetch a binary resource with authentication and trigger a browser download.
 * Returns { queued: true, jobId } if the server responds 202 (large async export).
 *
 * @param organizationId Prefer the org in the URL path; falls back to {@link setCurrentOrganizationId}.
 */
export async function downloadBlob(
  endpoint: string,
  filename: string,
  accept = "text/csv",
  organizationId?: string | null
): Promise<{ queued: boolean; jobId?: string }> {
  const url = endpoint.startsWith("http") ? endpoint : `${DEFAULT_BASE_URL}${endpoint}`;
  const impersonating = isImpersonating();
  const orgForHeader = organizationId ?? currentOrgId;

  const buildHeaders = async (): Promise<Record<string, string>> => {
    const token = await getAuthToken();
    const requestHeaders: Record<string, string> = { Accept: accept };
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
    if (orgForHeader) requestHeaders["X-Organization-ID"] = orgForHeader;
    return requestHeaders;
  };

  const doFetch = async () => fetch(url, { method: "GET", headers: await buildHeaders() });

  let response = await doFetch();

  if (await shouldRetryAfterRenew(response.status, impersonating)) {
    response = await doFetch();
  }

  if (response.status === 202) {
    const body = (await response.json()) as { job_id: string };
    return { queued: true, jobId: body.job_id };
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(
      (data as { message?: string } | null)?.message ??
        `Request failed with status ${response.status}`,
      response.status,
      data
    );
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
  return { queued: false };
}

// Convenience methods
export const api = {
  get: <T = unknown>(endpoint: string, options?: RequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: "GET" }),

  post: <T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = unknown>(endpoint: string, options?: RequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: "DELETE" }),
};

export default api;
