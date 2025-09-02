'use client';

import { useState, useEffect } from 'react';
import API from '../lib/api';

const FilePreview = ({ mediaId, onClose }) => {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadPreview = async () => {
      try {
        setLoading(true);
        const response = await API.get(`/media/${mediaId}/preview`);
        setPreview(response.data);
      } catch (err) {
        console.error('Error loading preview:', err);
        setError('Failed to load file preview');
      } finally {
        setLoading(false);
      }
    };

    if (mediaId) {
      loadPreview();
    }
  }, [mediaId]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Loading Preview...</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-red-600">Preview Error</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <div className="text-center py-8">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!preview) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">{preview.title}</h2>
            <p className="text-sm text-gray-500">
              {preview.type} • {Math.round(preview.size / 1024)}KB
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ✕
          </button>
        </div>
        
        <div className="border rounded-lg p-4 bg-gray-50 max-h-[70vh] overflow-y-auto">
          {preview.previewType === 'text' ? (
            <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800">
              {preview.content}
            </pre>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">{preview.content}</p>
              <p className="text-sm text-gray-500">
                This file type doesnt&apos;t support text preview.
              </p>
            </div>
          )}
        </div>
        
        <div className="mt-4 text-sm text-gray-500">
          <p>Uploaded by: {preview.uploaded_by_user_id}</p>
          <p>Created: {new Date(preview.created_at).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

export default FilePreview;
