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
      <CardContent>
        <p className="text-4xl font-bold leading-none text-foreground">{value}</p>
        {subtext ? <p className="mt-3 text-sm text-muted-foreground">{subtext}</p> : null}
      </CardContent>
    </Card>
  );
}
