export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-48 rounded-md bg-ardoise-200/60" />
      <div className="space-y-4">
        <div className="h-12 rounded-xl bg-ardoise-200/40" />
        <div className="h-64 rounded-xl bg-ardoise-200/40" />
      </div>
    </div>
  );
}
