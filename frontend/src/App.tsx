import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import Layout from "./components/Layout";
import OnboardingGate from "./components/OnboardingGate";
import SignUp from "./pages/SignUp";
import ConfirmSignUp from "./pages/ConfirmSignUp";
import Login from "./pages/Login";
import { mutedText } from "./components/ui";

const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Journal = lazy(() => import("./pages/Journal"));
const Medications = lazy(() => import("./pages/Medications"));
const Logs = lazy(() => import("./pages/Logs"));
const Cycle = lazy(() => import("./pages/Cycle"));
const BudgetPage = lazy(() => import("./pages/Budget"));
const Routines = lazy(() => import("./pages/Routines"));
const Insights = lazy(() => import("./pages/Insights"));
const Settings = lazy(() => import("./pages/Settings"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Help = lazy(() => import("./pages/Help"));
const Wishes = lazy(() => import("./pages/Wishes"));

function PageLoading() {
  return <p className={`mt-16 text-center ${mutedText}`}>Loading...</p>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/confirm" element={<ConfirmSignUp />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              }
            />
            <Route
              element={
                <ProtectedRoute>
                  <OnboardingGate>
                    <Layout />
                  </OnboardingGate>
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/medications" element={<Medications />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/cycle" element={<Cycle />} />
              <Route path="/budget" element={<BudgetPage />} />
              <Route path="/routines" element={<Routines />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/wishes" element={<Wishes />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/help" element={<Help />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
