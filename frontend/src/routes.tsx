import { RouteObject } from "react-router-dom";
import { Layout } from "./layout";
import Home from "./pages/Home";

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      {
        path: "/",
        element: <Home />,
      },
    ],
  },
];
