import React, { createContext, useContext } from 'react'
import type { OutlineDetector } from '@/api/outliner'

interface ActionsContextValue {
  onFileUpload: (content: string) => void
  onFileUploadToBackend?: (file: File) => Promise<void>
  onSegmentClick: (segmentId: string, event?: React.MouseEvent) => void
  onActivate: (segmentId: string) => void
  onInput: (e: React.FormEvent<HTMLDivElement>) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
  onAttachParent: () => void
  onMergeWithPrevious: (segmentId: string) => void
  onSplitSegment: () => void
  onAIDetectTextEndings: (detector: OutlineDetector) => void
  onAITextEndingStop: () => void
  onUndoTextEndingDetection: () => void
  onLoadNewFile: () => void
  onSegmentStatusUpdate?: (segmentId: string, status: 'checked' | 'unchecked') => Promise<void>
  onResetSegments?: () => void
  onCheckSanity: () => void
  /** Selects a segment and scrolls the (virtualized) workspace list to it. */
  onNavigateToSegment?: (segmentId: string, range?: { start: number; end: number }) => void
  expandedSegmentIds: readonly string[]
  toggleSegmentExpanded: (segmentId: string) => void
  isAllSegmentsExpanded: boolean
  toggleExpandAllSegments: () => void
}

const ActionsContext = createContext<ActionsContextValue | null>(null)

export function useActions() {
  const context = useContext(ActionsContext)
  if (!context) {
    throw new Error('useActions must be used within ActionsProvider')
  }
  return context
}

/** Like `useActions`, but returns null outside a provider instead of throwing. */
export function useOptionalActions() {
  return useContext(ActionsContext)
}

interface ActionsProviderProps {
  children: React.ReactNode
  value: ActionsContextValue
}

export function ActionsProvider({ children, value }: ActionsProviderProps) {
  return <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>
}
