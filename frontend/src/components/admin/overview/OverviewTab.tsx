import { useMemo, useState, type ReactNode } from 'react'
import {
  FileText,
  Layers,
  Library,
  PenLine,
  BarChart3,
  Table2,
  AlertTriangle,
  ScatterChart,
} from 'lucide-react'
import { motion } from 'framer-motion'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  ScatterController,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import type { ChartOptions, TooltipItem } from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import type { DashboardChartSeries, DashboardStats } from '@/api/outliner'
import { useOutlinerGroups } from '@/hooks'
import { useUser } from '@/hooks/useUser'
import AnnotatorQualityScatter from './AnnotatorQualityScatter'
import AnnotatedPendingReviewDialog from './AnnotatedPendingReviewDialog'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  ScatterController,
  Title,
  Tooltip,
  Legend,
)

interface OverviewTabProps {
  readonly stats: DashboardStats | null
  readonly isLoading?: boolean
  /** HTML date inputs from the admin dashboard; shown in reviewer activity empty-state copy. */
  readonly dashboardDateRange?: { readonly start: string; readonly end: string }
  /**
   * Same annotator/date-range filters actually applied to `stats` (ISO dates), so the
   * "Annotated (pending review)" drill-down list matches the number that was clicked.
   */
  readonly dashboardFilters?: {
    readonly userId?: string
    readonly startDate?: string
    readonly endDate?: string
  }
}

/** Aligned with tailwind.css Tibetan-inspired admin tokens (burgundy / gold / teal). */
const INK = '#1c1917'
const MUTED = '#57534e'
const GRID = '#e7e5e4'
const PRIMARY = '#af2630'
const TEAL = '#14a5b2'
const GOLD = '#b45309'
const EMERALD = '#0f766e'
const VIOLET = '#6b21a8'
const RED = '#b91c1c'
const ORANGE = '#c2410c'
/** Dark blue for reviewed segment counts on the quality chart. */
const BLUE_DARK = '#1e3a8a'

/** Horizontal space per person on the quality & reviewer vertical bar charts (scroll when wider than the card). */
const ANNOTATOR_QUALITY_VBAR_PX_PER_USER = 56
const ANNOTATOR_QUALITY_VBAR_MIN_WIDTH = 640
const ANNOTATOR_QUALITY_VBAR_HEIGHT = 420

const REVIEWER_ACTIVITY_VBAR_PX_PER_USER = ANNOTATOR_QUALITY_VBAR_PX_PER_USER
const REVIEWER_ACTIVITY_VBAR_MIN_WIDTH = ANNOTATOR_QUALITY_VBAR_MIN_WIDTH
const REVIEWER_ACTIVITY_VBAR_HEIGHT = ANNOTATOR_QUALITY_VBAR_HEIGHT

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    title: { display: false },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { font: { size: 11 }, color: MUTED },
    },
    y: {
      beginAtZero: true,
      grid: { color: GRID },
      ticks: { font: { size: 11 }, color: MUTED },
    },
  },
} as const

const DOUGHNUT_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '62%',
  plugins: {
    legend: {
      display: true,
      position: 'bottom' as const,
      labels: {
        boxWidth: 10,
        boxHeight: 10,
        padding: 12,
        font: { size: 11 },
        color: MUTED,
      },
    },
  },
} as const

const HBAR_OPTIONS = {
  indexAxis: 'y' as const,
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: {
      beginAtZero: true,
      grid: { color: GRID },
      ticks: { font: { size: 11 }, color: MUTED },
    },
    y: {
      grid: { display: false },
      ticks: { font: { size: 11 }, color: INK },
    },
  },
} as const

/** Horizontal space reserved per annotator on the workload line chart (scrolls when wider than the card). */
const ANNOTATOR_LINE_PX_PER_LABEL = 108
const ANNOTATOR_LINE_CHART_WIDTH_FLOOR = 680

/** Per-user line chart: scales point size and tick density from annotator count and chart min width. */
function annotatorPerUserLineOptions(
  labelCount: number,
  chartMinWidthPx: number,
): ChartOptions<'line'> {
  const pxPerCategory = labelCount > 0 ? chartMinWidthPx / labelCount : ANNOTATOR_LINE_PX_PER_LABEL
  const roomy = pxPerCategory >= 84
  const crowded = labelCount > 10 && !roomy
  const dense = labelCount > 22
  const layoutBottomPad = roomy ? 10 : crowded ? 6 : 4

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    layout: {
      padding: {
        left: 4,
        right: 10,
        top: 6,
        bottom: layoutBottomPad,
      },
    },
    elements: {
      point: {
        radius: dense ? 0 : crowded ? 2 : 4,
        hoverRadius: 6,
        hitRadius: dense ? 14 : 10,
      },
      line: {
        borderWidth: dense ? 1.5 : 2,
      },
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          padding: dense ? 8 : 16,
          font: { size: dense ? 10 : 11 },
          color: MUTED,
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
      title: { display: false },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          font: { size: dense ? 9 : crowded ? 10 : 11 },
          color: INK,
          maxRotation: roomy ? 58 : crowded ? 72 : 45,
          minRotation: roomy ? 40 : crowded ? 32 : 0,
          autoSkip: !roomy,
          ...(crowded
            ? {
                maxTicksLimit: Math.max(10, Math.min(24, Math.ceil(labelCount * 0.55))),
              }
            : {}),
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: GRID },
        ticks: {
          font: { size: dense ? 10 : 11 },
          color: MUTED,
          padding: dense ? 4 : 8,
        },
      },
    },
  }
}

/** Grouped vertical bars: annotators on X, rates (left Y) and counts (right Y); scroll horizontally when many users. */
/**
 * Quadrant scatter options. The "average" crosshair is a heavier grid line at the mean of
 * each axis, which avoids pulling in an annotation plugin.
 */

const ANNOTATOR_QUALITY_SIGNALS_VBAR_OPTIONS: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  datasets: {
    bar: {
      categoryPercentage: 0.68,
      barPercentage: 0.72,
    },
  },
  plugins: {
    legend: {
      display: true,
      position: 'top',
      labels: {
        boxWidth: 10,
        boxHeight: 10,
        padding: 12,
        font: { size: 11 },
        color: MUTED,
      },
    },
    title: { display: false },
    tooltip: {
      callbacks: {
        label: (tooltipItem: TooltipItem<'bar'>) => {
          const i = tooltipItem.dataIndex
          const raw = tooltipItem.parsed.y
          const pct = typeof raw === 'number' ? raw.toFixed(1) : String(raw)
          if (tooltipItem.datasetIndex === 0) {
            const meta = (
              tooltipItem.dataset as { metaReject?: { events: number; approved: number }[] }
            ).metaReject?.[i]
            if (!meta) return `Rejection: ${pct}% of reviewed`
            return `${meta.events.toLocaleString()} rejections / ${meta.approved.toLocaleString()} reviewed (${pct}%)`
          }
          if (tooltipItem.datasetIndex === 1) {
            const meta = (
              tooltipItem.dataset as { metaEdits?: { edits: number; approved: number }[] }
            ).metaEdits?.[i]
            if (!meta) return `Corrections at review: ${pct}% of reviewed`
            return `${meta.edits.toLocaleString()} corrections / ${meta.approved.toLocaleString()} reviewed (${pct}%)`
          }
          const count = typeof raw === 'number' ? raw.toLocaleString() : String(raw)
          if (tooltipItem.datasetIndex === 2) {
            return `Total segments in range: ${count}`
          }
          return `Reviewed with title/author (in period): ${count}`
        },
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        font: { size: 10 },
        color: INK,
        maxRotation: 48,
        minRotation: 24,
        autoSkip: false,
      },
      title: {
        display: true,
        text: 'Annotator',
        color: MUTED,
        font: { size: 10 },
        padding: { top: 6 },
      },
    },
    y: {
      position: 'left',
      beginAtZero: true,
      grid: { color: GRID },
      ticks: {
        font: { size: 11 },
        color: MUTED,
        callback: (value) => `${value}%`,
      },
      title: {
        display: true,
        text: 'Rate (% of reviewed segments)',
        color: MUTED,
        font: { size: 10 },
        padding: { bottom: 4 },
      },
    },
    y1: {
      type: 'linear',
      position: 'right',
      beginAtZero: true,
      grid: { drawOnChartArea: false },
      ticks: {
        font: { size: 11 },
        color: MUTED,
        maxTicksLimit: 9,
      },
      title: {
        display: true,
        text: 'Segment counts',
        color: MUTED,
        font: { size: 10 },
        padding: { bottom: 4 },
      },
    },
  },
}

/** Grouped vertical bars: reviewers on X (names read horizontally along the bottom), counts on Y (same layout as annotator quality). */
const REVIEWER_ACTIVITY_VBAR_OPTIONS: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  datasets: {
    bar: {
      categoryPercentage: 0.68,
      barPercentage: 0.72,
    },
  },
  plugins: {
    legend: {
      display: true,
      position: 'top',
      labels: {
        boxWidth: 10,
        boxHeight: 10,
        padding: 12,
        font: { size: 11 },
        color: MUTED,
      },
    },
    title: { display: false },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        font: { size: 10 },
        color: INK,
        maxRotation: 48,
        minRotation: 24,
        autoSkip: false,
      },
      title: {
        display: true,
        text: 'Reviewer',
        color: MUTED,
        font: { size: 10 },
        padding: { top: 6 },
      },
    },
    y: {
      beginAtZero: true,
      grid: { color: GRID },
      ticks: {
        font: { size: 11 },
        color: MUTED,
      },
      title: {
        display: true,
        text: 'Count',
        color: MUTED,
        font: { size: 10 },
        padding: { bottom: 4 },
      },
    },
  },
}

const DOC_STATUS_COLORS: Record<string, string> = {
  active: TEAL,
  completed: EMERALD,
  approved: VIOLET,
  rejected: RED,
  skipped: GOLD,
  deleted: '#78716c',
  unknown: '#a8a29e',
}

const SEG_STATUS_COLORS: Record<string, string> = {
  unchecked: '#a8a29e',
  checked: GOLD,
  approved: EMERALD,
  rejected: RED,
}

const CHART_PALETTE = [PRIMARY, TEAL, VIOLET, GOLD, '#0369a1', '#86198f', '#3f6212', EMERALD]



const cardPanel =
  'rounded-2xl border border-border/70 bg-card/95 p-6 shadow-elegant backdrop-blur-[2px]'

function colorsForKeys(keys: string[], map: Record<string, string>, fallback: string[]): string[] {
  return keys.map((k, i) => map[k] ?? fallback[i % fallback.length])
}

function doughnutChartData(
  series: DashboardChartSeries | null | undefined,
  colorMap: Record<string, string>,
): { labels: string[]; datasets: { data: number[]; backgroundColor: string[]; borderWidth: number }[] } | null {
  if (!series || series.values.length === 0) return null
  const keys = series.keys ?? []
  return {
    labels: series.labels,
    datasets: [
      {
        data: series.values,
        backgroundColor: colorsForKeys(keys, colorMap, CHART_PALETTE),
        borderWidth: 0,
      },
    ],
  }
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  readonly eyebrow: string
  readonly title: string
  readonly description?: string
}) {
  return (
    <div className="mb-6 flex flex-col gap-3  ">
      <div className="min-w-0 border-l-[3px] border-primary pl-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
        <h3 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h3>
      </div>
      {description ? (
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground ">
          {description}
        </p>
      ) : null}
    </div>
  )
}


function formatReviewerActivityDateHint(
  range: { readonly start: string; readonly end: string } | undefined,
): string | undefined {
  if (range == null || range.start === '' || range.end === '') return undefined
  return ` ${range.start}–${range.end}`
}

function ReviewerActivityMetricCell({
  value,
  pct,
  barWidthPct,
  barColor,
  pctTitle,
}: {
  readonly value: number
  readonly pct: number
  readonly barWidthPct: number
  readonly barColor: string
  readonly pctTitle?: string
}) {
  return (
    <div className="ml-auto flex max-w-[11rem] flex-col items-end gap-1.5">
      <span className="tabular-nums text-foreground">
        {value.toLocaleString()}
        <span className="text-muted-foreground" title={pctTitle}>
          {' '}
          ({pct.toFixed(1)}%)
        </span>
      </span>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100/90"
        role="img"
        aria-label={`${value.toLocaleString()}, ${pct.toFixed(1)} percent`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.max(0, barWidthPct))}%`,
            backgroundColor: barColor,
          }}
        />
      </div>
    </div>
  )
}

const WORKLOAD_SERIES_STYLES: Record<
  string,
  { borderColor: string; backgroundColor: string; pointBackgroundColor: string }
> = {
  Segments: {
    borderColor: TEAL,
    backgroundColor: 'rgba(20, 165, 178, 0.12)',
    pointBackgroundColor: TEAL,
  },
  'Title / author': {
    borderColor: VIOLET,
    backgroundColor: 'rgba(107, 33, 168, 0.12)',
    pointBackgroundColor: VIOLET,
  },
  'Unresolved rejected': {
    borderColor: RED,
    backgroundColor: 'rgba(185, 28, 28, 0.12)',
    pointBackgroundColor: RED,
  },
  'Reviewed (as reviewer)': {
    borderColor: EMERALD,
    backgroundColor: 'rgba(15, 118, 110, 0.12)',
    pointBackgroundColor: EMERALD,
  },
  'Rejections logged': {
    borderColor: GOLD,
    backgroundColor: 'rgba(180, 83, 9, 0.12)',
    pointBackgroundColor: GOLD,
  },
  'Reviewer title/author edits': {
    borderColor: ORANGE,
    backgroundColor: 'rgba(194, 65, 12, 0.12)',
    pointBackgroundColor: ORANGE,
  },
}

function OverviewTab({
  stats,
  isLoading,
  dashboardDateRange,
  dashboardFilters,
}: OverviewTabProps) {
  const [annotatorQualityView, setAnnotatorQualityView] = useState<
    'chart' | 'scatter' | 'table'
  >('chart')
  const [reviewerActivityView, setReviewerActivityView] = useState<'chart' | 'table'>('chart')
  const [pendingReviewDialogOpen, setPendingReviewDialogOpen] = useState(false)
  const { user } = useUser()
  const showBatchGroups = user?.role === 'admin'
  const { groups } = useOutlinerGroups({ enabled: showBatchGroups })
  const groupNamesByBatch = useMemo(() => {
    const byBatch = new Map<string, string[]>()
    for (const g of groups) {
      if (g.batch_id) byBatch.set(g.batch_id, [...(byBatch.get(g.batch_id) ?? []), g.name])
    }
    return byBatch
  }, [groups])

  const presentation = stats?.presentation

const documentStatusChart = useMemo(
    () => doughnutChartData(presentation?.document_status_chart, DOC_STATUS_COLORS),
    [presentation?.document_status_chart],
  )

  const segmentStatusChart = useMemo(
    () => doughnutChartData(presentation?.segment_status_chart, SEG_STATUS_COLORS),
    [presentation?.segment_status_chart],
  )

  const segmentStatusFooterRows = presentation?.segment_status_footer ?? []

  // Total rejection events in the selected period — sum of per-annotator rows from annotator quality.
  // This is the same data source as the Annotator quality chart/table, so the two sections always agree.
  const totalRejectionEventsInPeriod = useMemo(
    () =>
      presentation?.annotator_quality?.table_rows?.reduce(
        (sum, r) => sum + r.rejection_events,
        0,
      ) ?? 0,
    [presentation?.annotator_quality?.table_rows],
  )

  // Total reviewer corrections in the period — same source as the annotator quality table.
  const totalReviewerCorrectionsInPeriod = useMemo(
    () =>
      presentation?.annotator_quality?.table_rows?.reduce(
        (sum, r) => sum + r.correction_edits,
        0,
      ) ?? 0,
    [presentation?.annotator_quality?.table_rows],
  )

  const labelBarData = useMemo(() => {
    const series = presentation?.segment_label_chart
    if (!series) return null
    return {
      labels: series.labels,
      datasets: [
        {
          label: 'Segments',
          data: series.values,
          backgroundColor: PRIMARY,
          borderRadius: 8,
        },
      ],
    }
  }, [presentation?.segment_label_chart])

  const annotatorCompareData = useMemo(() => {
    const workload = presentation?.annotator_workload
    if (!workload) return null
    return {
      labels: workload.labels,
      datasets: workload.series.map((s) => {
        const style = WORKLOAD_SERIES_STYLES[s.label] ?? {
          borderColor: PRIMARY,
          backgroundColor: 'rgba(175, 38, 48, 0.12)',
          pointBackgroundColor: PRIMARY,
        }
        return {
          label: s.label,
          data: s.values,
          borderColor: style.borderColor,
          backgroundColor: style.backgroundColor,
          borderWidth: 2,
          tension: 0.25,
          pointBackgroundColor: style.pointBackgroundColor,
        }
      }),
    }
  }, [presentation?.annotator_workload])

  const annotatorWorkloadLineLayout = useMemo(() => {
    if (!annotatorCompareData) return null
    const n = annotatorCompareData.labels.length
    const chartMinWidthPx = Math.max(
      ANNOTATOR_LINE_CHART_WIDTH_FLOOR,
      n * ANNOTATOR_LINE_PX_PER_LABEL,
    )
    return {
      options: annotatorPerUserLineOptions(n, chartMinWidthPx),
      chartMinWidthPx,
      height: Math.min(960, Math.max(400, 300 + n * 22)),
    }
  }, [annotatorCompareData])

  const annotatorQuality = presentation?.annotator_quality ?? null


  const annotatorQualityChartData = useMemo(() => {
    const chart = annotatorQuality?.chart
    if (!chart) return null
    return {
      labels: chart.labels,
      datasets: [
        {
          label: 'Rejection (% of reviewed)',
          yAxisID: 'y',
          data: chart.rejection_pct,
          metaReject: chart.rejection_meta,
          backgroundColor: RED,
          borderRadius: 6,
        },
        {
          label: 'Corrections at review (% of reviewed)',
          yAxisID: 'y',
          data: chart.edits_pct,
          metaEdits: chart.edits_meta,
          backgroundColor: INK,
          borderRadius: 6,
        },
        {
          label: 'Total segments (in range)',
          yAxisID: 'y1',
          data: chart.segment_counts,
          backgroundColor: TEAL,
          borderRadius: 6,
        },
        {
          label: 'Reviewed with title/author (in period)',
          yAxisID: 'y1',
          data: chart.approved_counts,
          backgroundColor: BLUE_DARK,
          borderRadius: 6,
        },
      ],
    }
  }, [annotatorQuality?.chart])


  const annotatorQualityVBarLayout = useMemo(() => {
    if (!annotatorQualityChartData) return null
    const n = annotatorQualityChartData.labels.length
    return {
      chartMinWidthPx: Math.max(
        ANNOTATOR_QUALITY_VBAR_MIN_WIDTH,
        n * ANNOTATOR_QUALITY_VBAR_PX_PER_USER,
      ),
      height: ANNOTATOR_QUALITY_VBAR_HEIGHT,
    }
  }, [annotatorQualityChartData])

  const reviewerActivity = presentation?.reviewer_activity
  const reviewerRosterCount = stats?.reviewer_segment_activity?.length ?? 0

  const reviewerActivityScopeHint = useMemo(
    () => formatReviewerActivityDateHint(dashboardDateRange),
    [dashboardDateRange],
  )

  const reviewerActivityEmptyRangeSuffix = useMemo(() => {
    if (
      dashboardDateRange == null ||
      dashboardDateRange.start === '' ||
      dashboardDateRange.end === ''
    ) {
      return ''
    }
    return ` (${dashboardDateRange.start}–${dashboardDateRange.end})`
  }, [dashboardDateRange])

  const reviewerActivityChartData = useMemo(() => {
    const chart = reviewerActivity?.chart
    if (!chart) return null
    return {
      labels: chart.labels,
      datasets: [
        {
          label: 'Segments reviewed',
          data: chart.segments_reviewed,
          backgroundColor: EMERALD,
          borderRadius: 6,
        },
        {
          label: 'With title/author',
          data: chart.with_title_author,
          backgroundColor: VIOLET,
          borderRadius: 6,
        },
        {
          label: 'Reviewer title/author edits',
          data: chart.title_author_edits,
          backgroundColor: ORANGE,
          borderRadius: 6,
        },
        {
          label: 'Rejections logged',
          data: chart.rejections,
          backgroundColor: RED,
          borderRadius: 6,
        },
      ],
    }
  }, [reviewerActivity?.chart])

  const reviewerActivityVBarLayout = useMemo(() => {
    if (!reviewerActivityChartData) return null
    const n = reviewerActivityChartData.labels.length
    return {
      chartMinWidthPx: Math.max(
        REVIEWER_ACTIVITY_VBAR_MIN_WIDTH,
        n * REVIEWER_ACTIVITY_VBAR_PX_PER_USER,
      ),
      height: REVIEWER_ACTIVITY_VBAR_HEIGHT,
    }
  }, [reviewerActivityChartData])



  if (!stats?.presentation) return null

  const view = stats.presentation
  const coverage = stats.annotation_coverage_pct
  const docBreakdown = view.document_status_breakdown

return (
    <div className="relative space-y-12">
      <div
        className="pointer-events-none absolute inset-0 -z-10 rounded-[2rem] opacity-[0.45]"
        style={{
          backgroundImage: `radial-gradient(ellipse 80% 50% at 10% -10%, hsl(var(--primary) / 0.12), transparent 55%),
            radial-gradient(ellipse 60% 40% at 100% 0%, hsl(var(--secondary) / 0.14), transparent 50%)`,
        }}
        aria-hidden
      />

    
      {/* ─── Pipeline Overview ─────────────────────────────────────────── */}
      <MotionSection>
        <SectionHeading
          eyebrow="Pipeline"
          title="Workflow overview"
          description="Live snapshot of where every document and segment sits in the annotation pipeline. Colour-coded stages let you spot bottlenecks at a glance."
        />
        <div className="grid gap-5 lg:grid-cols-3">

          {/* ── Tile 1: Document pipeline ── */}
          <div className="flex flex-col gap-4 rounded-xl border border-stone-200/80 bg-white/70 p-5">
            <div className="flex items-center gap-2.5">
              <FileText className="h-5 w-5 shrink-0 text-teal-600" strokeWidth={1.75} />
              <p className="text-sm font-semibold text-foreground">Documents</p>
              <span className="ml-auto text-2xl font-bold tabular-nums text-teal-700">
                {stats.document_count.toLocaleString()}
              </span>
            </div>
            {/* Stacked pipeline bar */}
            <PipelineBar
              total={stats.document_count}
              items={[
                { label: 'Annotating', value: docBreakdown.active, color: TEAL },
                { label: 'Annotated', value: docBreakdown.completed, color: EMERALD },
                { label: 'Reviewed', value: docBreakdown.approved, color: VIOLET },
                { label: 'Skipped', value: docBreakdown.skipped, color: GOLD },
              ]}
            />
            <div className="space-y-2 text-xs">
              <PipelineStatRow dot={TEAL}    label="Annotating"         value={docBreakdown.active}     total={stats.document_count} />
              <PipelineStatRow dot={EMERALD} label="Annotated"          value={docBreakdown.completed}  total={stats.document_count} hint="done by annotator, pending review" />
              <PipelineStatRow dot={VIOLET}  label="Reviewed"           value={docBreakdown.approved}   total={stats.document_count} hint="approved by reviewer" />
              <PipelineStatRow dot={GOLD}    label="Skipped"            value={docBreakdown.skipped}    total={stats.document_count} />
            </div>
          </div>

          {/* ── Tile 2: Annotation coverage ── */}
          <div className="flex flex-col gap-4 rounded-xl border border-stone-200/80 bg-white/70 p-5">
            <div className="flex items-center gap-2.5">
              <PenLine className="h-5 w-5 shrink-0 text-violet-600" strokeWidth={1.75} />
              <p className="text-sm font-semibold text-foreground">Annotation coverage</p>
              <span className="ml-auto text-2xl font-bold tabular-nums text-violet-700">
                {coverage}%
              </span>
            </div>
            {/* Coverage progress bar */}
            <div
              className="h-3 w-full overflow-hidden rounded-full bg-stone-100"
              role="progressbar"
              aria-valuenow={coverage}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-700"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.max(0, coverage))}%` }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.segments_with_title_or_author.toLocaleString()} of{' '}
              {stats.total_segments.toLocaleString()} segments have a title or author set.
            </p>
            {/* Stage breakdown — only segments that have a title/author */}
            <div className="space-y-2 border-t border-stone-100 pt-3 text-xs">
              <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Segments with title/author</p>
              <PipelineStatRow dot={TEAL}    label="Annotating"           value={stats.unchecked_segments_with_title_or_author ?? 0} total={stats.segments_with_title_or_author} />
              <PipelineStatRow
                dot={GOLD}
                label="Annotated (pending review)"
                value={stats.annotated_segments}
                total={stats.segments_with_title_or_author}
                hint="click to view documents"
                onClick={() => setPendingReviewDialogOpen(true)}
              />
              <PipelineStatRow dot={EMERALD} label="Reviewed (in period)" value={stats.reviewed_segments}                            total={stats.segments_with_title_or_author} hint="approved in selected date range" />
              <PipelineStatRow dot={RED}     label="In rejected state"    value={stats.rejected_segments_with_title_or_author ?? 0}  total={stats.segments_with_title_or_author} hint="current status, not date-filtered" />
            </div>
          </div>

          {/* ── Tile 3: Quality health ── */}
          <div className="flex flex-col gap-4 rounded-xl border border-stone-200/80 bg-white/70 p-5">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" strokeWidth={1.75} />
              <p className="text-sm font-semibold text-foreground">Quality health</p>
            </div>

            {/* Rejection events — same source as Annotator quality section */}
            <div className={`rounded-lg px-4 py-3 ${totalRejectionEventsInPeriod > 0 ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${totalRejectionEventsInPeriod > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                Rejection events (in period)
              </p>
              <p className={`mt-0.5 text-3xl font-bold tabular-nums ${totalRejectionEventsInPeriod > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                {totalRejectionEventsInPeriod.toLocaleString()}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {totalRejectionEventsInPeriod > 0
                  ? 'Total rejection events filed in the selected period.'
                  : 'No rejection events in this period — all clear.'}
              </p>
            </div>

            <div className="space-y-2.5 text-xs">
              {/* Unresolved rejections — actionable open items */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: RED }} />
                  <span className="text-muted-foreground" title="Segments currently in rejected state with an unresolved rejection record in this period — needs annotator re-work.">
                    Unresolved (open, needs re-work)
                  </span>
                </div>
                <span className="tabular-nums font-semibold text-foreground">
                  {stats.rejection_count.toLocaleString()}
                </span>
              </div>
              {/* Reviewer corrections — same source as annotator quality */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: ORANGE }} />
                  <span className="text-muted-foreground" title="Approved segments where the reviewer changed title or author — same count shown in Annotator quality below.">
                    Reviewer corrections (in period)
                  </span>
                </div>
                <span className="tabular-nums font-semibold text-foreground">
                  {totalReviewerCorrectionsInPeriod.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: '#0369a1' }} />
                  <span className="text-muted-foreground">BDRC-linked segments</span>
                </div>
                <span className="tabular-nums font-semibold text-foreground">
                  {stats.segments_with_bdrc_id.toLocaleString()}
                </span>
              </div>
            </div>

            <p className="mt-auto text-[10px] text-muted-foreground/70 leading-relaxed">
              "Rejection events" and "Reviewer corrections" match the totals in{' '}
              <em>Annotator quality</em> below. "Unresolved" counts segments still awaiting re-work.
            </p>
          </div>

        </div>
      </MotionSection>

      <MotionSection>
        <SectionHeading
          eyebrow="BEC Volume Batches"
          title="Available Batches"
          description="count status of volumes from bdrc ."
        />
        <div className="mt-5 overflow-x-auto rounded-lg border border-stone-200/80 bg-white/60">
          {view.volume_batches.state === 'unavailable' && (
            <div className="flex items-center gap-3 px-4 py-10 text-sm text-muted-foreground">
              <Library className="h-5 w-5 shrink-0 opacity-60" aria-hidden />
              <span>
                Volume batch stats are unavailable (cataloger could not reach BEC OT API, or the
                response was empty). Set BEC_OTAPI_BASE_URL if you use a non-default host.
              </span>
            </div>
          )}
          {view.volume_batches.state === 'empty' && (
            <div className="flex items-center gap-3 px-4 py-10 text-sm text-muted-foreground">
              <Library className="h-5 w-5 shrink-0 opacity-60" aria-hidden />
              <span>No volume batches returned for the configured max_batches limit.</span>
            </div>
          )}
          {view.volume_batches.state === 'rows' && (
              <>
                {view.volume_batches.show_low_batch_warning && (
                  <div className="mb-4 flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-yellow-900">
                    <span className="font-semibold animate-bounce">Warning:</span>
                    <span>
                      Please inform admin to add more batches of volume to be annotated to have a smooth workflow.
                    </span>
                  </div>
                )}
                <table className="w-full min-w-[32rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50/90 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">Batch ID</th>
                      {showBatchGroups && <th className="px-4 py-3">Groups</th>}
                      <th className="px-4 py-3 text-right tabular-nums">Available</th>
                      <th className="px-4 py-3 text-right tabular-nums">Annotating</th>
                      <th className="px-4 py-3 text-right tabular-nums">Skipped</th>
                      <th className="px-4 py-3 text-right tabular-nums">Annotated</th>
                      <th className="px-4 py-3 text-right tabular-nums">Reviewed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.volume_batches.rows.map((row) => {
                      const groupNames = groupNamesByBatch.get(row.batch_id) ?? []
                      return (
                        <tr
                          key={row.batch_id}
                          className="border-b border-stone-100 last:border-0 hover:bg-stone-50/80"
                        >
                          <td className="px-4 py-2.5 font-medium text-foreground">{row.batch_id}</td>
                          {showBatchGroups && (
                            <td className="px-4 py-2.5 text-foreground">
                              {groupNames.length ? groupNames.join(', ') : <span className="text-muted-foreground">—</span>}
                            </td>
                          )}
                          <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                            {row.active.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                            {row.in_progress.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                            {(row.skipped ?? 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                            {row.in_review.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                            {row.reviewed.toLocaleString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
          )}
        </div>
      </MotionSection>

      <MotionSection>
        <SectionHeading
          eyebrow="People"
          title="Reviewers & segment activity"
          description={reviewerActivityScopeHint}
        />
       
        <div className="mt-6 rounded-lg border border-stone-200/80 bg-white/60 px-3 pb-3 pt-2 sm:px-5">
          {reviewerRosterCount === 0 ? (
            <div className="flex items-center gap-3 px-2 py-10 text-sm text-muted-foreground">
              <BarChart3 className="h-5 w-5 shrink-0 opacity-60" aria-hidden />
              <span>No reviewer or admin accounts found in scope.</span>
            </div>
          ) : !reviewerActivity?.has_activity ? (
            <div className="flex items-center gap-3 px-2 py-10 text-sm text-muted-foreground">
              <BarChart3 className="h-5 w-5 shrink-0 opacity-60" aria-hidden />
              <span>
                No reviewer activity for the selected dashboard range
                {reviewerActivityEmptyRangeSuffix}: everyone has zero segments reviewed, zero
                segments with title/author, zero reviewer edits, and zero rejections logged.
              </span>
            </div>
          ) : (
            <>
              <div className="mb-2 flex justify-end">
                <div
                  className="flex shrink-0 rounded-lg border border-stone-200/90 bg-stone-50/90 p-0.5 shadow-sm"
                  role="tablist"
                  aria-label="Reviewer activity: chart or table"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={reviewerActivityView === 'chart'}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      reviewerActivityView === 'chart'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-stone-100/90 hover:text-foreground'
                    }`}
                    onClick={() => setReviewerActivityView('chart')}
                  >
                    <BarChart3 className="h-3.5 w-3.5 opacity-90" aria-hidden />
                    Chart
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={reviewerActivityView === 'table'}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      reviewerActivityView === 'table'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-stone-100/90 hover:text-foreground'
                    }`}
                    onClick={() => setReviewerActivityView('table')}
                  >
                    <Table2 className="h-3.5 w-3.5 opacity-90" aria-hidden />
                    Table
                  </button>
                </div>
              </div>
              {reviewerActivityView === 'chart' && reviewerActivityVBarLayout ? (
                <div className="w-full overflow-x-auto overflow-y-visible overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]">
                  <div
                    className="min-h-[22rem] w-full min-w-0"
                    style={{
                      height: reviewerActivityVBarLayout.height,
                      minWidth: `max(100%, ${reviewerActivityVBarLayout.chartMinWidthPx}px)`,
                    }}
                  >
                    <Bar
                      data={reviewerActivityChartData!}
                      options={REVIEWER_ACTIVITY_VBAR_OPTIONS}
                    />
                  </div>
                </div>
              ) : null}
              {reviewerActivityView === 'table' ? (
                <>
                  <p className="mb-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                    Each cell shows count (percent). Bars compare reviewers within the column
                    (widest bar = highest count). Segments reviewed % is share of the team total in
                    this range. With title/author, reviewer edits, and rejections % are rates among
                    that reviewer&apos;s reviewed segments (rejections count events in range).
                  </p>
                <div className="max-h-[min(720px,70vh)] overflow-y-auto overflow-x-auto rounded-lg border border-stone-200/80 bg-white/60">
                  <table className="w-full min-w-[52rem] border-collapse text-sm">
                    <caption className="sr-only">
                      Reviewer segment activity: count and percent per column, with inline bars.
                      Segments reviewed percent is share of team total; with title or author,
                      reviewer edits, and rejections percent are rates among that reviewer&apos;s
                      reviewed segments.
                      {reviewerActivityEmptyRangeSuffix
                        ? ` Period${reviewerActivityEmptyRangeSuffix}.`
                        : ''}
                    </caption>
                    <thead className="sticky top-0 z-[1] shadow-[0_1px_0_0_rgb(231_229_228)]">
                      <tr className="border-b border-stone-200 bg-stone-50/95 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                        <th className="px-4 py-3">Reviewer</th>
                        <th
                          className="px-4 py-3 text-right tabular-nums"
                          title="Count and % of all reviewers' segments reviewed in this range; bar scales to the highest reviewer"
                        >
                         Total Segments reviewed
                        </th>
                        <th
                          className="px-4 py-3 text-right tabular-nums"
                          style={{ color: VIOLET }}
                          title="Count and % of this reviewer's reviewed segments where annotator title or author is set"
                        >
                          With title/author
                        </th>
                        <th
                          className="px-4 py-3 text-right tabular-nums"
                          style={{ color: ORANGE }}
                          title="Count and % of this reviewer's reviewed segments where reviewer changed title or author at approval"
                        >
                          Reviewer edits
                        </th>
                        <th
                          className="px-4 py-3 text-right tabular-nums"
                          style={{ color: RED }}
                          title="Count and % of this reviewer's reviewed segments with a rejection logged in range"
                        >
                          Rejections
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reviewerActivity?.table_rows ?? []).map((row, idx) => (
                        <tr
                          key={`${row.user_id ?? '__none__'}-${idx}`}
                          className="border-b border-stone-100 last:border-0 hover:bg-stone-50/80"
                        >
                          <td className="max-w-[14rem] px-4 py-2.5 font-medium leading-snug text-foreground sm:max-w-none sm:whitespace-normal">
                            <span className="break-words">{row.name}</span>
                          </td>
                          <td className="px-4 py-2.5 align-middle">
                            <ReviewerActivityMetricCell
                              value={row.segments_reviewed}
                              pct={row.reviewed_share_pct}
                              barWidthPct={row.reviewed_bar_pct}
                              barColor={EMERALD}
                              pctTitle="Share of all segments reviewed by reviewers in this table"
                            />
                          </td>
                          <td className="px-4 py-2.5 align-middle">
                            <ReviewerActivityMetricCell
                              value={row.with_title_author}
                              pct={row.with_title_author_rate_pct}
                              barWidthPct={row.with_title_author_bar_pct}
                              barColor={VIOLET}
                              pctTitle="Percentage of segments reviewed with title/author"
                            />
                          </td>
                          <td className="px-4 py-2.5 align-middle">
                            <ReviewerActivityMetricCell
                              value={row.title_author_edits}
                              pct={row.edits_rate_pct}
                              barWidthPct={row.edits_bar_pct}
                              barColor={ORANGE}
                              pctTitle="Percentage of segments reviewed with reviewer edits"
                            />
                          </td>
                          <td className="px-4 py-2.5 align-middle">
                            <ReviewerActivityMetricCell
                              value={row.rejections}
                              pct={row.rejections_rate_pct}
                              barWidthPct={row.rejections_bar_pct}
                              barColor={RED}
                              pctTitle="Percentage of segments reviewed with rejections"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </MotionSection>

      {/* ─── Status distribution charts ────────────────────────────────── */}
      <MotionSection>
        <SectionHeading
          eyebrow="Distribution"
          title="Status & label breakdown"
          description="Doughnut charts show the proportion of documents and segments at each stage. The labels bar shows what types of segments exist."
        />
        <div className="grid gap-5 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Documents by stage
            </p>
            <p className="text-[11px] text-muted-foreground/70">Where are documents in the workflow?</p>
            <div className="flex h-64 items-center justify-center rounded-lg border border-stone-100 bg-white/60 p-2">
              {documentStatusChart ? (
                <Doughnut data={documentStatusChart} options={DOUGHNUT_OPTIONS} />
              ) : (
                <p className="text-sm text-muted-foreground">No documents in range.</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Segments by stage
            </p>
            <p className="text-[11px] text-muted-foreground/70">Annotating → annotated → reviewed → rejected.</p>
            <div className="flex h-64 items-center justify-center rounded-lg border border-stone-100 bg-white/60 p-2">
              {segmentStatusChart ? (
                <Doughnut data={segmentStatusChart} options={DOUGHNUT_OPTIONS} />
              ) : (
                <p className="text-sm text-muted-foreground">No segment status data.</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Segment labels
            </p>
            <p className="text-[11px] text-muted-foreground/70">Front matter, TOC, text body, back matter, etc.</p>
            <div className="h-64 rounded-lg border border-stone-100 bg-white/60 p-2">
              {labelBarData ? (
                <Bar data={labelBarData} options={HBAR_OPTIONS} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No label data.
                </div>
              )}
            </div>
          </div>
        </div>
      </MotionSection>

      <MotionSection>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              Annotator quality: rejections & reviewer corrections
            </p>
            {annotatorQuality && annotatorQuality.table_rows.length > 1 ? (
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                {(() => {
                  if (annotatorQualityView === 'scatter') {
                    return 'Volume against quality, one dot per annotator. Dots far from where the two average lines cross are the outliers; use the week slider to see how they move over time.'
                  }
                  if (annotatorQualityView === 'table') {
                    return 'Every annotator with their exact counts and rates. Rejection and correction rates are a percent of reviewed segments with title/author.'
                  }
                  return 'All annotators in one view; scroll sideways to compare. Left axis: rejection and correction rates as a percent of reviewed segments with title/author; right axis: segment counts.'
                })()}
              </p>
            ) : null}
          </div>
          {annotatorQuality ? (
            <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:items-end">
              <div
                className="flex shrink-0 rounded-lg border border-stone-200/90 bg-stone-50/90 p-0.5 shadow-sm"
                role="tablist"
                aria-label="Annotator quality: chart or table"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={annotatorQualityView === 'chart'}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    annotatorQualityView === 'chart'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-stone-100/90 hover:text-foreground'
                  }`}
                  onClick={() => setAnnotatorQualityView('chart')}
                >
                  <BarChart3 className="h-3.5 w-3.5 opacity-90" aria-hidden />
                  Chart
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={annotatorQualityView === 'scatter'}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    annotatorQualityView === 'scatter'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-stone-100/90 hover:text-foreground'
                  }`}
                  onClick={() => setAnnotatorQualityView('scatter')}
                >
                  <ScatterChart className="h-3.5 w-3.5 opacity-90" aria-hidden />
                  Scatter
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={annotatorQualityView === 'table'}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    annotatorQualityView === 'table'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-stone-100/90 hover:text-foreground'
                  }`}
                  onClick={() => setAnnotatorQualityView('table')}
                >
                  <Table2 className="h-3.5 w-3.5 opacity-90" aria-hidden />
                  Table
                </button>
              </div>
            </div>
          ) : null}
        </div>
        {annotatorQuality ? (
          annotatorQualityView === 'chart' && annotatorQualityVBarLayout ? (
            <div className="mt-5 w-full overflow-x-auto overflow-y-visible overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]">
              <div
                className="min-h-[22rem] w-full min-w-0"
                style={{
                  height: annotatorQualityVBarLayout.height,
                  minWidth: `max(100%, ${annotatorQualityVBarLayout.chartMinWidthPx}px)`,
                }}
              >
                <Bar
                  data={annotatorQualityChartData!}
                  options={ANNOTATOR_QUALITY_SIGNALS_VBAR_OPTIONS}
                />
              </div>
            </div>
          ) : annotatorQualityView === 'scatter' ? (
            <AnnotatorQualityScatter
              dateRange={dashboardDateRange}
              enabled={annotatorQualityView === 'scatter'}
            />
          ) : annotatorQualityView === 'table' ? (
            <div className="mt-5 max-h-[min(720px,70vh)] overflow-y-auto overflow-x-auto rounded-lg border border-stone-200/80 bg-white/60">
              <table className="w-full min-w-[36rem] border-collapse text-sm">
                <caption className="sr-only">
                  Annotator quality: Rejection % and Corrections % use reviewed segment count as
                  denominator. Full names and counts.
                </caption>
                <thead className="sticky top-0 z-[1] shadow-[0_1px_0_0_rgb(231_229_228)]">
                  <tr className="border-b border-stone-200 bg-stone-50/95 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                    <th className="px-4 py-3">Annotator</th>
                    <th className="px-4 py-3 text-right tabular-nums">Segments</th>
                    <th className="px-4 py-3 text-right tabular-nums" style={{ color: BLUE_DARK }}>
                      Reviewed with title/author (in period)
                    </th>
                    <th className="px-4 py-3 text-right tabular-nums">Rejection events</th>
                    <th
                      className="px-4 py-3 text-right tabular-nums"
                      title="Rejection events ÷ reviewed segments with title/author in period"
                    >
                      Rejection %
                    </th>
                    <th className="px-4 py-3 text-right tabular-nums">Corrections at review</th>
                    <th
                      className="px-4 py-3 text-right tabular-nums"
                      title="Corrections ÷ reviewed segments with title/author in period"
                    >
                      Corrections %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {annotatorQuality.table_rows.map((row, idx) => (
                    <tr
                      key={`${row.user_id ?? '__none__'}-${idx}`}
                      className="border-b border-stone-100 last:border-0 hover:bg-stone-50/80"
                    >
                      <td className="max-w-[14rem] px-4 py-2.5 font-medium leading-snug text-foreground sm:max-w-none sm:whitespace-normal">
                        <span className="break-words">{row.name}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                        {row.segments.toLocaleString()}
                      </td>
                      <td
                        className="px-4 py-2.5 text-right tabular-nums font-medium"
                        style={{ color: BLUE_DARK }}
                      >
                        {row.segments_approved.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                        {row.rejection_events.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                        {row.rejection_pct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                        {row.correction_edits.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                        {row.corrections_pct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null
        ) : (
          <div className="mt-5 flex min-h-48 items-center justify-center rounded-lg border border-dashed border-stone-200/80 bg-stone-50/40 text-sm text-muted-foreground">
            No annotator performance data in this date range.
          </div>
        )}
      </MotionSection>

      <MotionSection>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Per-user workload</p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          The plot is intentionally wider than one screen when there are many annotators: scroll
          sideways inside this area so each name has room. Tooltips still list every series at each
          person.
        </p>
        <div className="mt-5 w-full overflow-x-auto overflow-y-visible overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]">
          {annotatorCompareData && annotatorWorkloadLineLayout ? (
            <div
              className="min-h-[22rem] w-full min-w-0"
              style={{
                height: annotatorWorkloadLineLayout.height,
                minWidth: `max(100%, ${annotatorWorkloadLineLayout.chartMinWidthPx}px)`,
              }}
            >
              <Line
                data={annotatorCompareData}
                options={annotatorWorkloadLineLayout.options}
              />
            </div>
          ) : (
            <div className="flex min-h-48 items-center justify-center py-12 text-sm text-muted-foreground">
              No annotator activity in this date range.
            </div>
          )}
        </div>
      </MotionSection>

      <AnnotatedPendingReviewDialog
        open={pendingReviewDialogOpen}
        onOpenChange={setPendingReviewDialogOpen}
        userId={dashboardFilters?.userId}
        startDate={dashboardFilters?.startDate}
        endDate={dashboardFilters?.endDate}
      />
    </div>
  )
}

export default OverviewTab


function MotionSection({ children }: { children: ReactNode }) {
  return (
    <motion.section
    initial={{ opacity: 0, y: 14 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    className={cardPanel}
    >
      {children}
    </motion.section>
  )
}

/** Horizontal stacked bar — each item fills a proportion of total width. */
function PipelineBar({
  items,
  total,
}: {
  items: { label: string; value: number; color: string }[]
  total: number
}) {
  if (!total) return <div className="h-3 w-full rounded-full bg-stone-100" />
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full" title="Pipeline distribution">
      {items.map((item) =>
        item.value > 0 ? (
          <div
            key={item.label}
            className="h-full transition-all duration-700"
            style={{
              width: `${Math.max(1, (item.value / total) * 100)}%`,
              backgroundColor: item.color,
            }}
            title={`${item.label}: ${item.value.toLocaleString()} (${Math.round((item.value / total) * 100)}%)`}
          />
        ) : null,
      )}
    </div>
  )
}

/** Single row in a pipeline breakdown list. Clickable (button) when `onClick` is given. */
function PipelineStatRow({
  dot,
  label,
  value,
  total,
  hint,
  onClick,
}: {
  dot: string
  label: string
  value: number
  total: number
  hint?: string
  onClick?: () => void
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={`flex w-full items-center gap-2 ${
        onClick
          ? 'cursor-pointer rounded-md transition-colors hover:bg-stone-100/80'
          : ''
      }`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
      <span className="min-w-0 flex-1 truncate text-muted-foreground" title={hint}>
        {label}
        {hint ? <span className="ml-1 text-muted-foreground/60">({hint})</span> : null}
      </span>
      <span className="shrink-0 tabular-nums font-medium text-foreground">
        {value.toLocaleString()}
      </span>
      <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground/70">
        {pct}%
      </span>
    </div>
  )
}
