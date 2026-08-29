import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles.css';

(window as Window & {EXCALIDRAW_ASSET_PATH?: string}).EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
