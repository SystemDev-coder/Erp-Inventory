import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader } from 'lucide-react';
import { useToast } from '../ui/toast/Toast';

interface ImageUploadProps {
  currentImage?: string | null;
  onUpload: (file: File) => Promise<string>;
  onDelete?: () => Promise<void>;
  label?: string;
  aspectRatio?: 'square' | 'landscape' | 'portrait';
  maxSizeMB?: number;
  disabled?: boolean;
  maxWidthClass?: string; // allows parent to control rendered size
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  currentImage,
  onUpload,
  onDelete,
  label = 'Upload Image',
  aspectRatio = 'square',
  maxSizeMB = 5,
  disabled = false,
  maxWidthClass = 'max-w-2xl',
}) => {
  const { showToast } = useToast();
  const [preview, setPreview] = useState<string | null>(currentImage || null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aspectClasses = {
    square: 'aspect-square',
    landscape: 'aspect-video',
    portrait: 'aspect-[3/4]',
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('error', 'Invalid file', 'Please select an image file');
      return;
    }

    // Validate file size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      showToast('error', 'File too large', `Maximum size is ${maxSizeMB}MB`);
      return;
    }

    // Show preview immediately
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    try {
      setUploading(true);
      const imageUrl = await onUpload(file);
      setPreview(imageUrl);
      showToast('success', 'Uploaded', 'Image uploaded successfully');
    } catch (error: any) {
      showToast('error', 'Upload failed', error.message || 'Failed to upload image');
      setPreview(currentImage || null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    
    if (!confirm('Are you sure you want to delete this image?')) return;

    try {
      setDeleting(true);
      await onDelete();
      setPreview(null);
      showToast('success', 'Deleted', 'Image deleted successfully');
    } catch (error: any) {
      showToast('error', 'Delete failed', error.message || 'Failed to delete image');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>

      <div className={`relative ${aspectClasses[aspectRatio]} w-full ${maxWidthClass} mx-auto overflow-hidden rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 transition-all`}>
        {preview ? (
          <>
            {/* Image Preview */}
            <img
              src={preview}
              alt="Preview"
              className="w-full h-full object-cover"
            />
            
            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || uploading || deleting}
                className="px-4 py-2 bg-white text-slate-900 rounded-lg font-medium hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4 inline mr-2" />
                Change
              </button>
              {onDelete && (
                <button
                  onClick={handleDelete}
                  disabled={disabled || uploading || deleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X className="w-4 h-4 inline mr-2" />
                  Delete
                </button>
              )}
            </div>

            {/* Loading overlay */}
            {(uploading || deleting) && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                <Loader className="w-8 h-8 text-white animate-spin" />
              </div>
            )}
          </>
        ) : (
          /* Upload Area */
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            className="w-full h-full flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader className="w-12 h-12 text-slate-400 animate-spin" />
                <p className="text-sm text-slate-600 dark:text-slate-400">Uploading...</p>
              </>
            ) : (
              <>
                <ImageIcon className="w-12 h-12 text-slate-400" />
                <div className="text-center px-4">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Click to upload
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    PNG, JPG, GIF, WEBP up to {maxSizeMB}MB
                  </p>
                </div>
              </>
            )}
          </button>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          disabled={disabled || uploading || deleting}
          className="hidden"
        />
      </div>
    </div>
  );
};
