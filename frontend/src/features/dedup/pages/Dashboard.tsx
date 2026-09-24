// Entry page for the dedup review tool. Placeholder until the batch list is
// wired to GET /api/v1/review/batches.
export default function Dashboard() {
  return (
    <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-xl font-semibold text-gray-900">Deduplicator</h1>
      <p className="mt-1 text-sm text-gray-600">
        Review whether two texts are copies of the same work.
      </p>
    </div>
  )
}
