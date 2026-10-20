
import type { Document } from '../shared/types';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';



import DocumentRow from './DocumentRow';
import { UserFilter } from './UserFilter';
import DocumentStatusFilter from './DocumentStatusFilter';
import { useDocuments, useOutlinerUsers, type DocumentFilters } from '@/hooks';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import TitleFilter from './TitleFilter';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useUser } from '@/hooks/useUser';
import { useAuth0 } from '@auth0/auth0-react';
import { outlinerFetch } from '@/api/outliner';
import { OUTLINER_BASE_URL } from '@/config/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import SelfRviewedToggle from './SelfRviewedToggle';
import HideTestRejectedToggle, { isHideTestRejected } from './HideTestRejectedToggle';
import { GroupFilter } from './GroupFilter';
import { PlusIcon } from 'lucide-react';



interface DocumentsTabProps {
  onDocumentSelect: (document: Document) => void;
}

function DocumentsTab({
  onDocumentSelect,
}: Readonly<DocumentsTabProps>) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useUser();
  const { getAccessTokenSilently } = useAuth0();
 
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') || undefined;
  const annotator = searchParams.get('annotator') || undefined;
  const group = searchParams.get('group') || undefined;
  const reviewer = searchParams.get('reviewer') || undefined;
  const debouncedTitle=searchParams.get('title') || undefined
  const includeApproved = searchParams.get('include_approved') === 'true';
  const includeSkipped = searchParams.get('include_skipped') === 'true';
  const hideTestRejected = isHideTestRejected(searchParams);
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);

  const [draftStatus, setDraftStatus] = useState(status ?? 'all');
  const [draftAnnotator, setDraftAnnotator] = useState(annotator ?? 'all');
  const [draftGroup, setDraftGroup] = useState(group ?? 'all');
  const [draftMyReviews, setDraftMyReviews] = useState(
    !!currentUser?.id && reviewer === currentUser.id
  );
  const [draftTitle, setDraftTitle] = useState(debouncedTitle ?? '');
  const [draftIncludeApproved, setDraftIncludeApproved] = useState(includeApproved);
  const [draftIncludeSkipped, setDraftIncludeSkipped] = useState(includeSkipped);

  const filters:DocumentFilters = useMemo(
    () => ({
      status,
      userId: annotator,
      reviewerId: reviewer,
      title: debouncedTitle || undefined,
      page,
      pageSize: 20,
      includeApproved,
      includeSkipped,
      excludeOwnAssignedDocuments: true,
      hideTestRejected,
      groupId: group,
    }),
    [status, annotator, reviewer, debouncedTitle, page, includeApproved, includeSkipped, hideTestRejected, group]
  );

  
  const {
    documents,
    isFetching,
  } = useDocuments(filters);

  const applyFilters = () => {
    setSearchParams((params) => {
      if (draftStatus === 'all') params.delete('status');
      else params.set('status', draftStatus);
      if (draftAnnotator === 'all') params.delete('annotator');
      else params.set('annotator', draftAnnotator);
      if (draftGroup === 'all') params.delete('group');
      else params.set('group', draftGroup);
      const trimmedTitle = draftTitle.trim();
      if (trimmedTitle) params.set('title', trimmedTitle);
      else params.delete('title');
      if (draftIncludeApproved) params.set('include_approved', 'true');
      else params.delete('include_approved');
      if (draftIncludeSkipped) params.set('include_skipped', 'true');
      else params.delete('include_skipped');

      params.set('page', '1');
      return params;
    });
  };
  const isApplyDisabled =
    draftStatus === (status ?? 'all') &&
    draftAnnotator === (annotator ?? 'all') &&
    draftGroup === (group ?? 'all') &&
    draftTitle.trim() === (debouncedTitle ?? '').trim() &&
    draftIncludeApproved === includeApproved &&
    draftIncludeSkipped === includeSkipped;

  const { users: outlinerUsers } = useOutlinerUsers();

  const assignReviewerMutation = useMutation({
    mutationFn: async () => {
      const token = await getAccessTokenSilently();
      const response = await outlinerFetch(`${OUTLINER_BASE_URL}/documents/assign_reviewr`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to assign reviewer');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outliner-admin-documents'] });
    },
  });

  const assignReviewer = () => assignReviewerMutation.mutate();

  const getAnnotator = (userId: string) => {
    return outlinerUsers.find((user) => user.id === userId);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0  pb-4 flex flex-wrap items-center justify-between gap-4">
        <div className='flex items-center gap-2'>
          <h3 className="text-xl font-semibold text-gray-900">Document Management </h3>
          <SelfRviewedToggle/>
          <HideTestRejectedToggle/>
          <Button disabled={assignReviewerMutation.isPending} variant='outline' size='sm' onClick={assignReviewer} className='hover:bg-primary/10 group hover:text-primary cursor-pointer'>
            {assignReviewerMutation.isPending ? 'Assigning...' : 'Assign me'}</Button>         
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <DocumentStatusFilter value={draftStatus} onChange={setDraftStatus} />
          </div>

          <div className="flex items-center gap-2">
            <UserFilter value={draftAnnotator} onChange={setDraftAnnotator} />
            
          </div>
          {currentUser?.role === 'admin' && (
            <div className="flex items-center gap-2">
              <GroupFilter value={draftGroup} onChange={setDraftGroup} />
            </div>
          )}

          <div className="relative w-full min-w-[200px] max-w-xs sm:w-64">
            <TitleFilter value={draftTitle} onChange={setDraftTitle} />
          </div>
          <div className="flex items-center gap-3 rounded-md border border-input bg-background px-3 py-2">
            <span className='text-sm text-gray-700 border-r border-gray-200 pr-2'>Status</span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label htmlFor="admin-include-approved" className="flex items-center gap-2 text-sm text-gray-700">
                  <span>Reviewed</span>
                  <Switch
                    id="admin-include-approved"
                    checked={draftIncludeApproved}
                    onCheckedChange={(checked) => setDraftIncludeApproved(checked === true)}
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="admin-include-skipped" className="flex items-center gap-2 text-sm text-gray-700">
                  <span>Skipped</span>
                  <Switch
                    id="admin-include-skipped"
                    checked={draftIncludeSkipped}
                    onCheckedChange={(checked) => setDraftIncludeSkipped(checked === true)}
                  />
                </label>
              </div>
            </div>
     
            
          </div>
          
          <Button disabled={isApplyDisabled} onClick={applyFilters}>Apply Filters</Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable] rounded-md border border-gray-200 bg-white">
        {isFetching && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px] transition-opacity">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        )}

        <Table
          wrapperClassName="min-w-0 overflow-visible"
          className="min-w-full divide-y divide-gray-200"
        >
          <TableHeader className="sticky top-0 z-1 bg-gray-50 shadow-sm">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Filename
              </TableHead>

              <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </TableHead>
              <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Checked / total
              </TableHead>

              <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="bg-white divide-y divide-gray-200">
            {documents.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                  {debouncedTitle?.trim()
                    ? 'No documents match your search.'
                    : 'No documents found for the selected filters.'}
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  document={doc}
                  annotator={getAnnotator(doc?.user_id ?? '')}
                  currentUserId={currentUser?.id}
                  onSelect={onDocumentSelect}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default DocumentsTab;

