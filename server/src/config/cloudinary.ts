import { Request } from 'express';

let cloudinary: any;
let CloudinaryStorage: any;
let multer: any;

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
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
    api_key: process.env.CLOUDINARY_API_KEY || '',
    api_secret: process.env.CLOUDINARY_API_SECRET || '',
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

// Configure storage for different entity types
const createStorage = (folder: string) => {
  if (!CloudinaryStorage || !cloudinary) {
    throw new Error('Cloudinary not configured. Install packages and set credentials.');
  }
  
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req: Request, file: Express.Multer.File) => {
      // Generate unique filename
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const filename = file.originalname.split('.')[0];
      
      return {
        folder: `erp-inventory/${folder}`,
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
        public_id: `${filename}-${uniqueSuffix}`,
        transformation: [
          { width: 1000, height: 1000, crop: 'limit' },
          { quality: 'auto' },
          { fetch_format: 'auto' }
        ]
      };
    },
  });
};

// Create a dummy middleware if multer not available
const createDummyUpload = () => ({
  single: () => (req: any, res: any, next: any) => {
    next(new Error('Image upload not available. Install Cloudinary packages.'));
  }
});

// Multer middleware for different upload types
export const uploadSystemImage = multer && cloudinary ? multer({
  storage: createStorage('system'),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed (jpg, jpeg, png, gif, webp, svg)'));
  },
}) : createDummyUpload();

export const uploadProductImage = multer && cloudinary ? multer({
  storage: createStorage('products'),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  },
}) : createDummyUpload();

export const uploadSupplierImage = multer && cloudinary ? multer({
  storage: createStorage('suppliers'),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype) {
      return cb(null, true);
    }
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
    // Extract public_id from Cloudinary URL
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

export default cloudinary || {};
