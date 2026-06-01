import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Controller from './Controller.jsx';
import './styles.css';

const path = window.location.pathname.replace(/\/+$/, '');
const isController = path === '/controller';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isController ? <Controller /> : <App />}
  </React.StrictMode>,
);
