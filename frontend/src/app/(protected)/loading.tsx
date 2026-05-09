export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-48 rounded-md bg-gray-200/60" />
      <div className="space-y-4">
        <div className="h-32 rounded-xl bg-gray-200/40" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-24 rounded-xl bg-gray-200/40" />
          <div className="h-24 rounded-xl bg-gray-200/40" />
          <div className="h-24 rounded-xl bg-gray-200/40" />
        </div>
        <div className="h-64 rounded-xl bg-gray-200/40" />
      </div>
    </div>
  );
}
