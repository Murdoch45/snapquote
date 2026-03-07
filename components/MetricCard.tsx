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
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm text-gray-600">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-gray-900">{value}</p>
        {subtext ? <p className="text-xs text-gray-500">{subtext}</p> : null}
      </CardContent>
    </Card>
  );
}
