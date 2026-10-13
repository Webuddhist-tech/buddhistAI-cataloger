import { API_URL } from '@/config/api';
import { fetchWithAccessToken } from '@/lib/fetchWithAccessToken';

// ==================== Types ====================

export interface User {
  id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  created_at: string;
  role?: string | null;
  permissions?: string[] | null;
  /** Deduplicator role, apart from `role` (the Outliner's). Null = annotator. */
  dedup_role?: DedupRole | null;
}

export type DedupRole = 'annotator' | 'reviewer' | 'admin';

export interface PaginatedUserResponse {
  items: User[];
  total: number;
  skip: number;
  limit: number;
}

export interface UserUpdateRequest {
  email?: string;
  name?: string | null;
  picture?: string | null;
  role?: string | null;
  permissions?: string[] | null;
  dedup_role?: DedupRole;
}

/** Fields the users admin page changes on a user. */
export type UserRowUpdate = { role?: string; permissions?: string[]; dedup_role?: DedupRole };

// ==================== API Functions ====================

async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'An error occurred' }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export const listUsers = async (
  skip: number = 0,
  limit: number = 100,
  role?: string
): Promise<PaginatedUserResponse> => {
  const params = new URLSearchParams();
  params.append('skip', skip.toString());
  params.append('limit', limit.toString());
  if (role) params.append('role', role);

  const response = await fetchWithAccessToken(`${API_URL}/settings/users?${params.toString()}`);
  return handleApiResponse(response);
};

export interface SearchUsersOptions {
  limit?: number;
  role?: string;
  permission?: string;
}

export const searchUsers = async (
  search: string,
  options: SearchUsersOptions = {}
): Promise<PaginatedUserResponse> => {
  const params = new URLSearchParams();
  params.append('skip', '0');
  params.append('limit', String(options.limit ?? 20));
  if (options.role) params.append('role', options.role);
  if (options.permission) params.append('permission', options.permission);
  if (search.trim()) params.append('search', search.trim());

  const response = await fetchWithAccessToken(`${API_URL}/settings/users?${params.toString()}`);
  return handleApiResponse(response);
};

export const getUser = async (userId: string): Promise<User> => {
  const response = await fetchWithAccessToken(`${API_URL}/settings/users/${userId}`);
  return handleApiResponse(response);
};

export const updateUser = async (
  userId: string,
  userData: UserUpdateRequest
): Promise<User> => {
  const response = await fetchWithAccessToken(`${API_URL}/settings/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userData),
  });

  return handleApiResponse(response);
};

export const deleteUser = async (userId: string): Promise<void> => {
  const response = await fetchWithAccessToken(`${API_URL}/settings/users/${userId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    await handleApiResponse(response);
  }
};
