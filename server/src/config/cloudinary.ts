import { Request, Response, NextFunction } from 'express';
import type { File as MulterFile, FileFilterCallback } from 'multer';
import https from 'https';
import http from 'http';
import { URL } from 'url';

let cloudinary: any;
let CloudinaryStorage: any;
let multer: any;
const unsignedPresetEnv = process.env.CLOUDINARY_UNSIGNED_PRESET || 'erp_unsigned_default';

// Try to import Cloudinary packages (optional)
try {
  const cloudinaryModule = require('cloudinary');
  cloudinary = cloudinaryModule.v2;

  const multerModule = require('multer');
  multer = multerModule.default || multerModule;

  const storageModule = require('multer-storage-cloudinary');
  CloudinaryStorage = storageModule.CloudinaryStorage;

  // Cloudinary Configuration
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dac0jrcn3',
    api_key: process.env.CLOUDINARY_API_KEY || '989533525192336',
    api_secret: process.env.CLOUDINARY_API_SECRET || '9IjoFVXJZPebh5puWN8itycGfDg',
  });
} catch (error) {
  console.warn('⚠️  Cloudinary packages not installed. Image uploads will not work.');
  console.warn('   Run: npm install cloudinary multer multer-storage-cloudinary @types/multer');
}

// Verify Cloudinary connection
export const verifyCloudinaryConfig = () => {
  if (!cloudinary) {
    console.warn('⚠️  Cloudinary not available. Install packages to enable image uploads.');
    return false;
  }

  const { cloud_name, api_key, api_secret } = cloudinary.config();

  if (!cloud_name || !api_key || !api_secret) {
    console.warn('⚠️  Cloudinary credentials not configured. Image uploads will not work.');
    console.warn('   Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET to .env');
    return false;
  }

  console.log('✓ Cloudinary configured successfully');
  return true;
};

// Ensure an unsigned upload preset exists (avoids timestamp/signature issues)
let ensuredPreset = false;
const ensureUnsignedPreset = async (): Promise<string | null> => {
  if (!cloudinary) return null;
  if (ensuredPreset) return unsignedPresetEnv;

  try {
    await cloudinary.api.upload_preset(unsignedPresetEnv);
    ensuredPreset = true;
    return unsignedPresetEnv;
  } catch (_err: any) {
    try {
      await cloudinary.api.create_upload_preset({
        name: unsignedPresetEnv,
        unsigned: true,
        folder: 'erp-inventory',
        // keep transformations inside preset (unsigned upload cannot pass them)
        transformation: [
          { width: 1200, height: 1200, crop: 'limit' },
          { quality: 'auto' },
          { fetch_format: 'auto' },
        ],
      });
      ensuredPreset = true;
      console.warn(`Created unsigned upload preset '${unsignedPresetEnv}' automatically`);
      return unsignedPresetEnv;
    } catch (createErr) {
      console.error('Failed to ensure unsigned preset:', createErr);
      return null;
    }
  }
};

// Download a remote image into a Buffer (avoids fetch/timestamp issues)
const downloadToBuffer = (url: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    try {
      const parsed = new URL(url);
      const lib = parsed.protocol === 'http:' ? http : https;
      const req = lib.get(parsed, { timeout: 15000 }, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Download failed with status ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Download timed out')));
    } catch (err) {
      reject(err);
    }
  });

// Configure storage for different entity types
const createStorage = (folder: string) => {
  if (!CloudinaryStorage || !cloudinary) {
    throw new Error('Cloudinary not configured. Install packages and set credentials.');
  }

  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (_req: Request, file: MulterFile) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const filename = file.originalname.split('.')[0];

      return {
        folder: `erp-inventory/${folder}`,
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
        public_id: `${filename}-${uniqueSuffix}`,
        transformation: [
          { width: 1000, height: 1000, crop: 'limit' },
          { quality: 'auto' },
          { fetch_format: 'auto' },
        ],
      };
    },
  });
};

// Create a dummy middleware if multer not available
const createDummyUpload = () => ({
  single:
    (_field?: string) =>
      (_req: Request, _res: Response, next: NextFunction) => {
        next(new Error('Image upload not available. Install Cloudinary packages.'));
      },
});

// Multer middleware for different upload types
export const uploadSystemImage = (multer && cloudinary && CloudinaryStorage) ? multer({
  storage: createStorage('system'),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req: Request, file: MulterFile, cb: FileFilterCallback) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only image files are allowed (jpg, jpeg, png, gif, webp, svg)'));
  },
}) : createDummyUpload();

export const uploadProductImage = (multer && cloudinary && CloudinaryStorage) ? multer({
  storage: createStorage('products'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: Request, file: MulterFile, cb: FileFilterCallback) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
}) : createDummyUpload();

export const uploadSupplierImage = (multer && cloudinary && CloudinaryStorage) ? multer({
  storage: createStorage('suppliers'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req: Request, file: MulterFile, cb: FileFilterCallback) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
}) : createDummyUpload();

// Helper function to delete image from Cloudinary
export const deleteCloudinaryImage = async (imageUrl: string): Promise<boolean> => {
  if (!cloudinary) {
    console.warn('Cloudinary not configured. Cannot delete image.');
    return false;
  }
  try {
    const urlParts = imageUrl.split('/');
    const publicIdWithExtension = urlParts.slice(-2).join('/');
    const publicId = publicIdWithExtension.split('.')[0];
    await cloudinary.uploader.destroy(`erp-inventory/${publicId}`);
    console.log(`✓ Deleted image: ${publicId}`);
    return true;
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error);
    return false;
  }
};

// Upload an image from a remote URL to Cloudinary and return the hosted URL
export const uploadImageFromUrl = async (imageUrl: string, folder = 'system'): Promise<string | null> => {
  if (!cloudinary) {
    console.warn('Cloudinary not configured. Cannot upload image from URL.');
    return null;
  }

  const presetName = await ensureUnsignedPreset();

  // 1) unsigned upload by URL
  try {
    if (presetName) {
      const res = await cloudinary.uploader.upload(imageUrl, {
        upload_preset: presetName,
        unsigned: true,
        folder: `erp-inventory/${folder}`,
        resource_type: 'image',
      });
      return res?.secure_url || res?.url || null;
    }
  } catch (e) {
    console.error('Unsigned URL upload failed:', e);
  }

  // 2) unsigned upload by stream (download first)
  try {
    if (presetName) {
      const buffer = await downloadToBuffer(imageUrl);
      const streamResult = await new Promise<string | null>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            upload_preset: presetName,
            unsigned: true,
            folder: `erp-inventory/${folder}`,
            resource_type: 'image',
          },
          (err: any, res: any) => (err ? reject(err) : resolve(res?.secure_url || res?.url || null))
        );
        stream.end(buffer);
      });
      if (streamResult) {
        console.warn('Used download+stream unsigned upload fallback');
        return streamResult;
      }
    }
  } catch (e) {
    console.error('Unsigned stream upload failed:', e);
  }

  // 3) fetch delivery as last resort
  try {
    const fetchUrl = cloudinary.url(imageUrl, {
      type: 'fetch',
      secure: true,
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' },
      ],
    });
    console.warn('Falling back to Cloudinary fetch delivery for URL:', imageUrl, 'generated:', fetchUrl);
    return fetchUrl;
  } catch (fallbackErr) {
    console.error('Cloudinary fetch fallback failed:', fallbackErr);
    return null;
  }
};

export default cloudinary || {};
