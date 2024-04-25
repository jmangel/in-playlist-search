import React from 'react';
import './App.css';
import Root from './routes/root';
import {
  RouteObject,
  RouterProvider,
  createBrowserRouter,
} from 'react-router-dom';
import ErrorPage from './pages/ErrorPage';
import HomePage, { loader as homePageLoader } from './pages/HomePage';

const App = () => {
  const routes: RouteObject[] = [
    {
      path: '/',
      element: <Root />,
      errorElement: <ErrorPage />,
      children: [
        ...['/', '/callback'].map((path) => ({
          path: path,
          element: <HomePage />,
          loader: homePageLoader,
        })),
      ],
    },
  ];

  return <RouterProvider router={createBrowserRouter(routes)} />;
};

export default App;
