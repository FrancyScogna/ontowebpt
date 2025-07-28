import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import Router from './router';

const root = document.getElementById('root')
createRoot(root).render(
    <HashRouter>
        <Router />
    </HashRouter>
)