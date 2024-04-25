import React from 'react';
import './App.css';
import Root from './routes/root'
import { RouteObject, RouterProvider, createBrowserRouter } from 'react-router-dom';
import ErrorPage from './pages/ErrorPage';
import HomePage from './pages/HomePage';

const App = () => {
  const routes: RouteObject[] = [
    {
      path: '/',
      element: <Root />,
      errorElement: <ErrorPage />,
      children: [
        {
          index: true,
          element: <HomePage />,
        },
        {
          path: '/callback',
          element: <HomePage />,
        },
      ],
    },
  ];

  return <RouterProvider router={createBrowserRouter(routes)} />
}

export default App;
