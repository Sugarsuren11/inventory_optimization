import { RouterProvider } from 'react-router';
import { router } from './routes';
import { InsightsProvider } from './context/InsightsContext';

export default function App() {
  return (
    <InsightsProvider>
      <RouterProvider router={router} />
    </InsightsProvider>
  );
}