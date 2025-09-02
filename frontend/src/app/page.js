'use client';

import { useAuth } from '../contexts/AuthContext';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  DocumentTextIcon, 
  UserGroupIcon, 
  ShieldCheckIcon,
  ArrowRightIcon,
  BuildingOfficeIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

export default function LandingPage() {
  const { isAuthenticated, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleGetStarted = () => {
    login();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100">
      {/* Navigation */}
      <nav className="relative z-10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">I</span>
            </div>
            <span className="text-xl font-bold text-gray-800 tracking-wide">InsightDocs</span>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative px-6 py-20">
        <div className="max-w-7xl mx-auto text-center">
          <div className="mb-8">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 tracking-tight">
              Welcome to{' '}
              <span className="bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
                InsightDocs
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Your comprehensive platform for document collaboration, user management, and role-based access control.
            </p>
          </div>

          {/* Get Started Button */}
          <div className="mb-16">
            <button
              onClick={handleGetStarted}
              className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl hover:from-blue-400 hover:to-blue-500 transition-all font-bold shadow-2xl hover:shadow-3xl hover:scale-105 transform duration-300 border border-blue-400 tracking-wider text-lg"
            >
              Get Started
              <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
            </button>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* User Registration */}
            <div className="p-8 bg-white/80 backdrop-blur-xl rounded-3xl border border-blue-200/50 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <UserGroupIcon className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-4">User Registration</h3>
              <p className="text-gray-600 leading-relaxed">
                Seamless user registration with automatic organization and client creation. New users get Owner role by default.
              </p>
            </div>

            {/* Role Management */}
            <div className="p-8 bg-white/80 backdrop-blur-xl rounded-3xl border border-blue-200/50 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <ShieldCheckIcon className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-4">Role Management</h3>
              <p className="text-gray-600 leading-relaxed">
                Powerful role-based access control with Owner and Reviewer roles. Manage permissions and access levels.
              </p>
            </div>

            {/* Organization Management */}
            <div className="p-8 bg-white/80 backdrop-blur-xl rounded-3xl border border-blue-200/50 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <BuildingOfficeIcon className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-4">Organization Management</h3>
              <p className="text-gray-600 leading-relaxed">
                Create and manage organizations with automatic client creation. Invite members and assign roles.
              </p>
            </div>

            {/* Document Collaboration */}
            <div className="p-8 bg-white/80 backdrop-blur-xl rounded-3xl border border-blue-200/50 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <DocumentTextIcon className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-4">Document Collaboration</h3>
              <p className="text-gray-600 leading-relaxed">
                Upload, share, and collaborate on documents with team members. Real-time updates and version control.
              </p>
            </div>

            {/* Analytics & Insights */}
            <div className="p-8 bg-white/80 backdrop-blur-xl rounded-3xl border border-blue-200/50 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <ChartBarIcon className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-4">Analytics & Insights</h3>
              <p className="text-gray-600 leading-relaxed">
                Track document usage, user activity, and organization performance with detailed analytics.
              </p>
            </div>

            {/* Secure Authentication */}
            <div className="p-8 bg-white/80 backdrop-blur-xl rounded-3xl border border-blue-200/50 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <ShieldCheckIcon className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-4">Secure Authentication</h3>
              <p className="text-gray-600 leading-relaxed">
                Enterprise-grade security with Keycloak integration. Single sign-on and multi-factor authentication.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-12 border-t border-blue-200/50">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-gray-600">
            © 2024 InsightDocs. Built with Next.js, Tailwind CSS, and Keycloak.
          </p>
        </div>
      </footer>
    </div>
  );
}
