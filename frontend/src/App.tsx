import { lazy, Suspense, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AppLayout } from "./components/Layout";
import { BlockSkeleton, Toaster } from "./components/ui/states";
import { AppDataProvider, ToastProvider, UiPrefsProvider } from "./hooks/AppContext";
import Landing from "./pages/Landing";

const ForYou = lazy(() => import("./pages/ForYou"));
const Discover = lazy(() => import("./pages/Discover"));
const CourseDetail = lazy(() => import("./pages/CourseDetail"));
const Compare = lazy(() => import("./pages/Compare"));
const MyLearning = lazy(() => import("./pages/MyLearning"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Roadmap = lazy(() => import("./pages/Roadmap"));
const Profile = lazy(() => import("./pages/Profile"));
const Insights = lazy(() => import("./pages/Insights"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const NotFound = lazy(() => import("./pages/NotFound"));

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<BlockSkeleton rows={4} />}>{children}</Suspense>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <AppDataProvider>
          <UiPrefsProvider>
            {children}
            <Toaster />
          </UiPrefsProvider>
        </AppDataProvider>
      </ToastProvider>
    </MotionConfig>
  );
}

export default function App() {
  return (
    <AppProviders>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<AppLayout />}>
          <Route path="/for-you" element={<Page><ForYou /></Page>} />
          <Route path="/discover" element={<Page><Discover /></Page>} />
          <Route path="/courses/:id" element={<Page><CourseDetail /></Page>} />
          <Route path="/compare" element={<Page><Compare /></Page>} />
          <Route path="/learning" element={<Page><MyLearning /></Page>} />
          <Route path="/analytics" element={<Page><Analytics /></Page>} />
          <Route path="/roadmap" element={<Page><Roadmap /></Page>} />
          <Route path="/profile" element={<Page><Profile /></Page>} />
          <Route path="/onboarding" element={<Page><Profile /></Page>} />
          <Route path="/insights" element={<Page><Insights /></Page>} />
          <Route path="/wishlist" element={<Page><Wishlist /></Page>} />
          <Route path="*" element={<Page><NotFound /></Page>} />
        </Route>
      </Routes>
    </AppProviders>
  );
}
