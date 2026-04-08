import { RouteObject } from "react-router-dom";
import { Layout } from "./layout";
import Home from "./pages/Home";
import Services from "./pages/Services";
import Portfolio from "./pages/Portfolio";
import About from "./pages/About";
import Community from "./pages/Community";
import Contact from "./pages/Contact";
import Blog from "./pages/Blog";
import BlogDetail from "./pages/BlogDetail";

// Admin (注意大小写)
import AdminLayout from "./pages/Admin/AdminLayout";
import Dashboard from "./pages/Admin/pages/Dashboard";
import WorksList from "./pages/Admin/pages/WorksList";
import WorkForm from "./pages/Admin/pages/WorkForm";
import BlogList from "./pages/Admin/pages/BlogList";
import BlogForm from "./pages/Admin/pages/BlogForm";
import ContactsList from "./pages/Admin/pages/ContactsList";
import TeamList from "./pages/Admin/pages/TeamList";
import ServicesList from "./pages/Admin/pages/ServicesList";
import Settings from "./pages/Admin/pages/Settings";
import EventsList from "./pages/Admin/pages/EventsList";
import EventForm from "./pages/Admin/pages/EventForm";
import TestimonialsList from "./pages/Admin/pages/TestimonialsList";
import TestimonialForm from "./pages/Admin/pages/TestimonialForm";

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      {
        path: "/",
        element: <Home />,
      },
      {
        path: "/services",
        element: <Services />,
      },
      {
        path: "/portfolio",
        element: <Portfolio />,
      },
      {
        path: "/about",
        element: <About />,
      },
      {
        path: "/community",
        element: <Community />,
      },
      {
        path: "/contact",
        element: <Contact />,
      },
      {
        path: "/blog",
        element: <Blog />,
      },
      {
        path: "/blog/:id",
        element: <BlogDetail />,
      },
    ],
  },
  // Admin 路由
  {
    path: "/admin",
    element: <AdminLayout />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: "works",
        element: <WorksList />,
      },
      {
        path: "works/new",
        element: <WorkForm />,
      },
      {
        path: "works/edit/:id",
        element: <WorkForm />,
      },
      {
        path: "blog",
        element: <BlogList />,
      },
      {
        path: "blog/new",
        element: <BlogForm />,
      },
      {
        path: "blog/edit/:id",
        element: <BlogForm />,
      },
      {
        path: "contacts",
        element: <ContactsList />,
      },
      {
        path: "team",
        element: <TeamList />,
      },
      {
        path: "services",
        element: <ServicesList />,
      },
      {
        path: "events",
        element: <EventsList />,
      },
      {
        path: "events/new",
        element: <EventForm />,
      },
      {
        path: "events/edit/:id",
        element: <EventForm />,
      },
      {
        path: "testimonials",
        element: <TestimonialsList />,
      },
      {
        path: "testimonials/new",
        element: <TestimonialForm />,
      },
      {
        path: "testimonials/edit/:id",
        element: <TestimonialForm />,
      },
      {
        path: "settings",
        element: <Settings />,
      },
    ],
  },
];
