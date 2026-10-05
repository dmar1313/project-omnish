import { CharacterCreationPage } from "@/components/CharacterCreation";
import { Layout } from "@/components/Layout";
import { SignInScreen } from "@/components/SignInScreen";
import { Toaster } from "@/components/ui/sonner";
import { useUserRole } from "@/hooks/useBackend";
import { isTestSignInActive, subscribeTestSignIn } from "@/lib/testIdentity";
import AssetsPage from "@/pages/AssetsPage";
import CostsPage from "@/pages/CostsPage";
import DnaPage from "@/pages/DnaPage";
import GeneratedVideosPage from "@/pages/GeneratedVideosPage";
import LiveFeedPage from "@/pages/LiveFeedPage";
import LorePage from "@/pages/LorePage";
import OptimizationPage from "@/pages/OptimizationPage";
import SimulationPage from "@/pages/SimulationPage";
import VideoSettingsPage from "@/pages/VideoSettingsPage";
import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useSyncExternalStore } from "react";

function RootComponent() {
  const { isAuthenticated, isInitializing } = useInternetIdentity();
  const { role, isAdmin, isLoading } = useUserRole();
  // Test-only: the deterministic test identity stands in for a real Internet
  // Identity session once the tester activates the test path, so they can reach
  // the authenticated workspace. With the flag off this is exactly
  // `isAuthenticated`.
  const testSignInActive = useSyncExternalStore(
    subscribeTestSignIn,
    isTestSignInActive,
    () => false,
  );
  const authenticated = isAuthenticated || testSignInActive;

  if (isInitializing || (authenticated && isLoading)) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background"
        data-ocid="app.loading_state"
      >
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin text-primary" />
          <span className="font-mono text-xs uppercase tracking-wider">
            Establishing secure session
          </span>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <SignInScreen />;
  }

  return <Layout userRole={role} isAdmin={isAdmin} />;
}

const rootRoute = createRootRoute({ component: RootComponent });

const feedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LiveFeedPage,
});

const simulationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/simulation",
  validateSearch: (
    search: Record<string, unknown>,
  ): { runId?: string; stage?: string } => ({
    runId: typeof search.runId === "string" ? search.runId : undefined,
    stage: typeof search.stage === "string" ? search.stage : undefined,
  }),
  component: SimulationPage,
});

const videosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/videos",
  validateSearch: (
    search: Record<string, unknown>,
  ): { runId?: string; revision?: string } => ({
    runId: typeof search.runId === "string" ? search.runId : undefined,
    revision: typeof search.revision === "string" ? search.revision : undefined,
  }),
  component: GeneratedVideosPage,
});

const optimizationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/optimization",
  component: OptimizationPage,
});

const costsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/costs",
  component: CostsPage,
});

const dnaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dna",
  component: DnaPage,
});

const createCharacterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/create",
  component: CharacterCreationPage,
});

const loreRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/lore",
  component: LorePage,
});

const assetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assets",
  component: AssetsPage,
});

const videoSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/video",
  component: VideoSettingsPage,
});

const routeTree = rootRoute.addChildren([
  feedRoute,
  simulationRoute,
  videosRoute,
  optimizationRoute,
  costsRoute,
  dnaRoute,
  createCharacterRoute,
  loreRoute,
  assetsRoute,
  videoSettingsRoute,
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
}
