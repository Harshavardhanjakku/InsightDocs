'use client';

import { useAuth } from '../contexts/AuthContext';
import Navbar from './Navbar';

export default function Layout({ children }) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-300 border-t-blue-500 rounded-full animate-spin mb-6 shadow-2xl"></div>
          <p className="text-gray-800 text-xl font-semibold tracking-wide">Loading InsightDocs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
      <Navbar />
      <main className="pt-20">
        {children}
      </main>
    </div>
  );
}
