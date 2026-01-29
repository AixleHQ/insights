/**
 * API Client with authentication and organization context
 *
 * This module provides a configured fetch wrapper that automatically:
 * - Adds the Authorization header with the current access token
 * - Adds the X-Organization-ID header for org-scoped requests
 * - Handles common response scenarios (401, 403, etc.)
 */

import { getAccessToken } from './auth';

export interface ApiClientOptions {
  baseUrl?: string;
  organizationId?: string | null;
}

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  skipOrgHeader?: boolean;
}

const DEFAULT_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const IMPERSONATION_STORAGE_KEY = 'impersonation_token';

// Global state for current organization ID
let currentOrgId: string | null = null;

/**
 * Get the auth token - uses impersonation token if active, otherwise regular token
 */
async function getAuthToken(): Promise<string | null> {
  // Check for impersonation token first
  const impersonationToken = localStorage.getItem(IMPERSONATION_STORAGE_KEY);
  if (impersonationToken) {
    // Verify token isn't expired
    try {
      const parts = impersonationToken.split('.');
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

/**
 * Make an authenticated API request
 */
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipAuth = false, skipOrgHeader = false, headers = {}, ...fetchOptions } = options;

  const requestHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...headers,
  };

  // Add Authorization header
  if (!skipAuth) {
    const token = await getAuthToken();
    if (token) {
      (requestHeaders as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
  }

  // Add X-Organization-ID header
  if (!skipOrgHeader && currentOrgId) {
    (requestHeaders as Record<string, string>)['X-Organization-ID'] = currentOrgId;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${DEFAULT_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...fetchOptions,
    headers: requestHeaders,
  });

  // Handle common error responses
  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError('Unauthorized', response.status, await response.json().catch(() => null));
    }
    if (response.status === 403) {
      throw new ApiError('Forbidden', response.status, await response.json().catch(() => null));
    }
    if (response.status === 404) {
      throw new ApiError('Not found', response.status, await response.json().catch(() => null));
    }
    if (response.status === 422) {
      const data = await response.json().catch(() => null);
      throw new ApiError('Validation error', response.status, data);
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
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Convenience methods
export const api = {
  get: <T = unknown>(endpoint: string, options?: RequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = unknown>(endpoint: string, options?: RequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: 'DELETE' }),
};

export default api;
