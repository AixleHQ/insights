export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <p className="text-lg font-medium">{title}</p>
      <p className="text-sm">Coming soon</p>
    </div>
  );
}
