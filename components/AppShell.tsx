"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

type AppShellProps = {
  children: React.ReactNode;
  email?: string | null;
  orgId: string;
  businessName?: string | null;
};

export function AppShell({ children, email, orgId, businessName }: AppShellProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileNavOpen]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <Sidebar orgId={orgId} businessName={businessName} email={email} />
      <Sidebar
        orgId={orgId}
        businessName={businessName}
        email={email}
        mode="mobile"
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      <div className="flex min-h-screen min-w-0 w-full flex-1 flex-col md:pl-[220px]">
        <TopBar
          orgId={orgId}
          onOpenSidebar={() => setMobileNavOpen(true)}
        />
        <main className="min-w-0 max-w-full flex-1 space-y-6 bg-background p-4 sm:p-5 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
