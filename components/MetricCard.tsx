import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MetricCard({
  title,
  value,
  subtext
}: {
  title: string;
  value: string;
  subtext?: string;
}) {
  return (
    <Card className="h-full shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0">
        <p className="truncate text-2xl font-bold leading-none tabular-nums text-foreground sm:text-3xl md:text-4xl">
          {value}
        </p>
        {subtext ? <p className="mt-3 text-sm text-muted-foreground">{subtext}</p> : null}
      </CardContent>
    </Card>
  );
}
