import { useQuery } from '@tanstack/react-query';
import type { User, PaginatedUserResponse } from '../api/user';
import { fetchWithAccessToken } from '@/lib/fetchWithAccessToken';
import { useSearchParams } from 'react-router-dom';

const DEFAULT_PAGE_SIZE = 20;

export interface UserFilters {
  page?: number;
  pageSize?: number;
  /** Substring match on name or email (query param: search). */
  username?: string;
  role?: string;
  /** Only users holding this permission (e.g. "dedup"). */
  permission?: string;
}

/**
 * Hook for fetching users list with optional filters; skip/limit derived from page & pageSize.
 */
export function useUsers(filters: UserFilters = {}) {
  const { pageSize = DEFAULT_PAGE_SIZE, username, role, permission } = filters;

  const search = username?.trim() || undefined;
  const [searchParams, setSearchParams] = useSearchParams();
  const page=searchParams.get('page') || '1';
  const safePage = Math.max(1, Number.parseInt(page, 10));
  const skip = (safePage - 1) * pageSize;
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<PaginatedUserResponse>({
    queryKey: ['users', { skip, limit: pageSize, search, role, permission }],
    queryFn: async () => {
      const params = new URLSearchParams({ skip: String(skip), limit: String(pageSize) });
      if (search) params.append('search', search);
      if (role) params.append('role', role);
      if (permission) params.append('permission', permission);
      const response = await fetchWithAccessToken(`/api/settings/users?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const hasNextPage = skip + pageSize < total;
  const hasPrevPage = safePage > 1;

  const handleNextPage=()=>{
    setSearchParams(params=>{
      params.set('page', String(safePage + 1));
      return params;
    });
  }
  const handlePrevPage=()=>{
    setSearchParams(params=>{
      params.set('page', String(safePage - 1));
      return params;
    });
  }



  return {
    users: items,
    total,
    isLoading,
    isFetching,
    error,
    refetch,
    page: safePage,
    pageSize,
    hasNextPage,
    hasPrevPage,
    handleNextPage,
    handlePrevPage,
  };
}

/**
 * Hook for fetching a single user by ID
 */
export function useUser(userId: string | undefined) {
  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = useQuery<User>({
    queryKey: ['user', userId],
    queryFn: async () => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      const response = await fetchWithAccessToken(`/api/settings/users/${userId}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch user');
      }
      return response.json();
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    user,
    isLoading,
    error,
    refetch,
  };
}
