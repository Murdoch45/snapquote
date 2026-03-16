import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ success?: string }>;
};

export default async function DashboardRedirectPage({ searchParams }: Props) {
  const params = await searchParams;
  redirect(params.success ? "/app?success=true" : "/app");
}
