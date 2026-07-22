import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AdminDashboard from "../features/admin/AdminDashboard";
import AdminLogin from "../features/admin/AdminLogin";

const AdminApp = () => (
  <Routes>
    <Route path="login" element={<AdminLogin />} />
    <Route path="bootstrap" element={<AdminLogin bootstrap />} />
    <Route index element={<AdminDashboard />} />
    <Route path="*" element={<Navigate to="/admin" replace />} />
  </Routes>
);

export default AdminApp;
