import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { DisplayProvider } from '@/display/DisplayProvider';
import { router } from '@/router';
import { SessionProvider } from '@/session/SessionProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import '@/styles/globals.css';

const container = document.getElementById('root');
if (container === null) throw new Error('#root missing');

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <DisplayProvider>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </DisplayProvider>
    </ThemeProvider>
  </StrictMode>,
);
