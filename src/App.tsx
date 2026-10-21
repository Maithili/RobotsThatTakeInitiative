import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CompareTray } from './components/CompareTray.tsx';
import { PaperDrawer } from './components/PaperDrawer.tsx';
import { Shell } from './components/Shell.tsx';
import { EvaluationsPage } from './pages/evaluations/EvaluationsPage.tsx';
import { MethodsPage } from './pages/methods/MethodsPage.tsx';
import { SubproblemsPage } from './pages/subproblems/SubproblemsPage.tsx';

function Home() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/methods', search }} replace />;
}

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/methods" element={<MethodsPage />} />
        <Route path="/evaluations" element={<EvaluationsPage />} />
        <Route path="/subproblems" element={<SubproblemsPage />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <PaperDrawer />
      <CompareTray />
    </Shell>
  );
}
