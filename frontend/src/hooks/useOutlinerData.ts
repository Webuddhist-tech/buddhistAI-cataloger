import { useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { outlinerFetch } from '@/api/outliner';
import { OUTLINER_BASE_URL } from '@/config/api';
import type { Document, Segment, DocumentStats } from '@/features/outliner/types';
import { withResolvedSegmentTexts } from '@/lib/outlinerSegmentText';

/**
 * Calculate stats from documents array
 */
function calculateStats(documents: Document[]): DocumentStats {
  return documents.reduce((acc: DocumentStats, doc: Document) => {
    acc.total++;
    switch (doc.status) {
      case 'active':
        acc.active++;
        break;
      case 'completed':
        acc.completed++;
        break;
      case 'approved':
        acc.approved++;
        break;
      case 'rejected':
        acc.rejected++;
        break;
      default:
        acc.active++; // Default to active if no status
    }
    return acc;
  }, { total: 0, active: 0, completed: 0, approved: 0, rejected: 0 });
}

const DEFAULT_PAGE_SIZE = 20

export interface DocumentFilters {
  status?: string;
  userId?: string;
  reviewerId?: string;
  title?: string;
  page?: number;
  pageSize?: number;
  includeApproved?: boolean;
  includeSkipped?: boolean;
  /** Admin reviewer queue: omit documents assigned to the reviewer (document user_id). */
  excludeOwnAssignedDocuments?: boolean;
  /** TEMP: hide fully reviewed Tsenlek (mmBERT test) documents that have rejected segments. */
  hideTestRejected?: boolean;
  /** Only documents assigned from this work group. */
  groupId?: string;
}

/**
 * Hook for fetching documents list with optional filters
 */
export function useDocuments(filters: DocumentFilters = {}) {
  const { getAccessTokenSilently } = useAuth0();
  const {
    status,
    userId,
    reviewerId,
    title,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    includeApproved = false,
    includeSkipped = false,
    excludeOwnAssignedDocuments = false,
    hideTestRejected = false,
    groupId,
  } = filters;
  const skip = (page - 1) * pageSize;
  const [, setSearchParams] = useSearchParams();
  const {
    data: documents = [],
    isLoading,
    isFetching,
    error,
    refetch
  } = useQuery<Document[]>({
    queryKey: [
      'outliner-admin-documents',
      { status, userId, reviewerId, title, skip, limit: pageSize, includeApproved, includeSkipped, excludeOwnAssignedDocuments, hideTestRejected, groupId },
    ],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (userId) params.append('user_id', userId);
      if (reviewerId) params.append('reviewer_id', reviewerId);
      if (title?.trim()) params.append('title', title.trim());
      if (excludeOwnAssignedDocuments) params.append('exclude_own_assigned', 'true');
      params.append('include_approved', String(includeApproved));
      params.append('include_skipped', String(includeSkipped));
      if (hideTestRejected) params.append('hide_test_rejected', 'true');
      if (groupId) params.append('group_id', groupId);
      params.set('skip', String(skip));
      params.set('limit', String(pageSize));
      const url = `${OUTLINER_BASE_URL}/documents?${params.toString()}`;
      const response = await outlinerFetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const stats = useMemo(() => calculateStats(documents), [documents]);
  const hasNextPage = documents.length === pageSize;
  const hasPrevPage = page > 1;

  const handleNextPage=()=>{
    setSearchParams(params=>{
      params.set('page', String(page + 1));
      return params;
    });
  }
  const handlePrevPage=()=>{
    setSearchParams(params=>{
      params.set('page', String(page - 1));
      return params;
    });
  }

  return {
    documents,
    stats,
    isLoading,
    isFetching,
    error,
    refetch,
    page,
    pageSize,
    hasNextPage,
    hasPrevPage,
    handleNextPage,
    handlePrevPage,
  };
}

/**
 * Hook for fetching segments for a specific document
 */
export function useSegments(documentId: string | undefined) {
  const { getAccessTokenSilently } = useAuth0();

  const {
    data: segments = [],
    isLoading,
    error,
    refetch
  } = useQuery<Segment[]>({
    queryKey: ['outliner-admin-segments', documentId],
    queryFn: async () => {
      if (!documentId) {
        throw new Error('Document ID is required');
      }
      const token = await getAccessTokenSilently();
      const response = await outlinerFetch(`${OUTLINER_BASE_URL}/documents/${documentId}/segments`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch segments');
      }
      return response.json();
    },
    enabled: !!documentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    segments,
    isLoading,
    error,
    refetch
  };
}

/**
 * Hook for fetching a single document by ID
 */
export function useDocument(documentId: string | undefined) {
  const { getAccessTokenSilently } = useAuth0();

  const {
    data: document,
    isLoading,
    error,
    refetch
  } = useQuery<Document>({
    queryKey: ['outliner-admin-document', documentId],
    queryFn: async () => {
      if (!documentId) {
        throw new Error('Document ID is required');
      }
      const token = await getAccessTokenSilently();
      const response = await outlinerFetch(`${OUTLINER_BASE_URL}/documents/${documentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch document');
      }
      const doc = await response.json();
      return withResolvedSegmentTexts(doc);
    },
    enabled: !!documentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    document,
    isLoading,
    error,
    refetch
  };
}

/**
 * Legacy hook - kept for backward compatibility
 * Use useDocuments, useSegments, or useDocument instead
 * @deprecated Use individual hooks instead
 */
export function useOutlinerData() {
  const { documentId } = useParams<{ documentId?: string }>();
  const { documents, stats, isLoading: loadingDocuments } = useDocuments();
  const { segments, isLoading: loadingSegments } = useSegments(documentId);
  const { document: selectedDocument } = useDocument(documentId);

  return {
    documents,
    segments,
    selectedDocument: selectedDocument || null,
    stats,
    loading: loadingDocuments,
    loadingSegments,
    loadInitialData: async () => {}, // No-op for backward compatibility
    loadDocuments: async () => {}, // No-op for backward compatibility
    loadSegments: async () => {}, // No-op for backward compatibility
    loadStats: async () => {}, // No-op for backward compatibility
    handleDocumentSelect: () => {}, // No-op for backward compatibility
    setSelectedDocument: () => {}, // No-op for backward compatibility
    setSegments: () => {} // No-op for backward compatibility
  };
}
