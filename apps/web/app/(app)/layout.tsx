import { Suspense } from "react";
import { AskBox } from "@/components/ask-box";
import { ModuleTheme } from "@/components/module-theme";
import { BottomNav, BottomNavView, SideNav, SideNavView } from "@/components/nav";
import { aiEnabled } from "@/lib/ai/switch";
import { requireUser } from "@/lib/auth";

async function Guard({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}

/** Hidden when the AI is turned off in Settings. */
async function Ask() {
  return (await aiEnabled()) ? <AskBox /> : null;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <Suspense fallback={<SideNavView pathname="" />}>
        <SideNav />
      </Suspense>
      {/* Bottom space: phone = bottom bar (3.5rem) + Ask bar (4rem); desktop = Ask bar. */}
      <div className="min-w-0 flex-1 pb-[calc(8rem+env(safe-area-inset-bottom))] md:pb-24">
        <Suspense>
          <Guard><ModuleTheme>{children}</ModuleTheme></Guard>
        </Suspense>
      </div>
      <Suspense>
        <Ask />
      </Suspense>
      <Suspense fallback={<BottomNavView pathname="" />}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
