# 📸 Cloudinary Image Upload Setup Guide

Complete guide for setting up Cloudinary image uploads in your ERP Inventory system.

## 🚀 Quick Start

### 1. Create Cloudinary Account

1. Go to [https://cloudinary.com/](https://cloudinary.com/)
2. Sign up for a free account
3. Navigate to your Dashboard

### 2. Get Your Credentials

From your Cloudinary Dashboard, copy:
- **Cloud Name**
- **API Key**
- **API Secret**

### 3. Configure Environment Variables

Add to your `server/.env` file:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 4. Install Dependencies

Backend:
```bash
cd server
npm install cloudinary multer multer-storage-cloudinary
```

Frontend:
```bash
cd frontend
npm install @mui/icons-material
```

### 5. Run Database Migration

```bash
# The migration will run automatically when you start the server
docker-compose up
```

## 📁 Folder Structure

Cloudinary images are organized as:
```
erp-inventory/
├── system/          # System logos and banners
├── products/        # Product images
└── suppliers/       # Supplier logos
```

## 🎯 API Endpoints

### System Information

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/system` | Get system info |
| PUT | `/api/system` | Update system info |
| POST | `/api/system/logo` | Upload logo |
| POST | `/api/system/banner` | Upload banner |
| DELETE | `/api/system/logo` | Delete logo |
| DELETE | `/api/system/banner` | Delete banner |

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/products/:id/image` | Upload product image |
| DELETE | `/api/products/:id/image` | Delete product image |

### Suppliers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/suppliers` | List suppliers |
| POST | `/api/suppliers` | Create supplier |
| PUT | `/api/suppliers/:id` | Update supplier |
| DELETE | `/api/suppliers/:id` | Delete supplier |
| POST | `/api/suppliers/:id/logo` | Upload supplier logo |
| DELETE | `/api/suppliers/:id/logo` | Delete supplier logo |

## 🎨 Frontend Usage

### Upload Example

```typescript
const handleImageUpload = async (file: File) => {
  const formData = new FormData();
  formData.append('image', file);
  
  const response = await fetch('/api/products/1/image', {
    method: 'POST',
    body: formData,
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  console.log('Image URL:', data.productImageUrl);
};
```

## 🔐 Security

- All uploads require authentication
- Permission-based access control
- File size limit: 5MB
- Allowed formats: JPG, PNG, GIF, WEBP, SVG
- Images are automatically optimized

## 🎭 Image Transformations

Cloudinary automatically applies:
- Max dimensions: 1000x1000px
- Quality: Auto (optimized)
- Format: Auto (best format for browser)

## 📊 Database Tables

### system_information
- `logo_url` - System logo URL
- `banner_image_url` - Banner image URL

### products
- `product_image_url` - Product image URL
- `description` - Product description

### suppliers
- `logo_url` - Supplier logo URL

### image_uploads (tracking)
- `entity_type` - Type of entity
- `entity_id` - ID of entity
- `cloudinary_public_id` - Cloudinary ID
- `image_url` - Full URL
- `uploaded_at` - Upload timestamp

## 🐛 Troubleshooting

### "Cloudinary credentials not configured"
- Check your `.env` file has all three Cloudinary variables
- Restart your Docker containers

### "No file uploaded"
- Ensure you're sending `multipart/form-data`
- Check the field name matches (`logo`, `banner`, `image`)

### "Only image files are allowed"
- Check file extension and MIME type
- Supported: JPG, JPEG, PNG, GIF, WEBP, SVG

### Images not displaying
- Check the URL is accessible
- Verify Cloudinary account is active
- Check browser console for CORS errors

## 🎯 Testing

### Test Upload with cURL

```bash
# Upload system logo
curl -X POST http://localhost:5000/api/system/logo \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "logo=@/path/to/image.jpg"

# Upload product image
curl -X POST http://localhost:5000/api/products/1/image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@/path/to/product.jpg"
```

## 📈 Best Practices

1. **Always delete old images** - Prevent storage bloat
2. **Use descriptive filenames** - Easy identification
3. **Optimize before upload** - Reduce upload time
4. **Handle errors gracefully** - Show user-friendly messages
5. **Show upload progress** - Better UX

## 🎁 Features

✅ Single system configuration (logo + banner)
✅ Multiple products with images
✅ Multiple suppliers with logos
✅ Automatic image optimization
✅ Old image cleanup
✅ Upload tracking
✅ Permission-based access
✅ Production-ready error handling

## 📞 Support

For issues or questions:
- Check Cloudinary Documentation: https://cloudinary.com/documentation
- Review server logs for detailed errors
- Test with Postman/cURL first
