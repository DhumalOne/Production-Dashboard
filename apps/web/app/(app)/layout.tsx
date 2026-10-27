import { Suspense } from "react";
import { BottomNav, BottomNavView, SideNav, SideNavView } from "@/components/nav";
import { requireUser } from "@/lib/auth";

async function Guard({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <Suspense fallback={<SideNavView pathname="" />}>
        <SideNav />
      </Suspense>
      <div className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-8">
        <Suspense>
          <Guard>{children}</Guard>
        </Suspense>
      </div>
      <Suspense fallback={<BottomNavView pathname="" />}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
