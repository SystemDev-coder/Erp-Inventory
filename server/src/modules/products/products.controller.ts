import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { ApiError } from '../../utils/ApiError';
import { productsService } from './products.service';
import { categorySchema, productSchema } from './products.schemas';
import { AuthRequest } from '../../middlewares/requireAuth';

export const listProducts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const search = (req.query.search as string) || undefined;
  const products = await productsService.listProducts(search);
  return ApiResponse.success(res, { products });
});

export const getProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const product = await productsService.getProduct(id);
  if (!product) {
    throw ApiError.notFound('Product not found');
  }
  return ApiResponse.success(res, { product });
});

export const createProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = productSchema.parse(req.body);
  const product = await productsService.createProduct(input);
  return ApiResponse.created(res, { product }, 'Product created');
});

export const updateProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const input = productSchema.parse(req.body);
  const product = await productsService.updateProduct(id, input);
  if (!product) {
    throw ApiError.notFound('Product not found');
  }
  return ApiResponse.success(res, { product }, 'Product updated');
});

export const deleteProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  await productsService.deleteProduct(id);
  return ApiResponse.success(res, null, 'Product deleted');
});

export const listCategories = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const categories = await productsService.listCategories();
  return ApiResponse.success(res, { categories });
});

export const createCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const input = categorySchema.parse(req.body);
  const category = await productsService.createCategory(input);
  return ApiResponse.created(res, { category }, 'Category created');
});

export const updateCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const input = categorySchema.parse(req.body);
  const category = await productsService.updateCategory(id, input);
  if (!category) {
    throw ApiError.notFound('Category not found');
  }
  return ApiResponse.success(res, { category }, 'Category updated');
});

export const deleteCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  await productsService.deleteCategory(id);
  return ApiResponse.success(res, null, 'Category deleted');
});

// Upload product image
export const uploadProductImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  
  if (!req.file) {
    throw ApiError.badRequest('No file uploaded');
  }
  
  const productImageUrl = req.file.path;
  
  // Delete old image if exists
  const existing = await productsService.getProduct(id);
  if (existing?.product_image_url) {
    const { deleteCloudinaryImage } = await import('../../config/cloudinary');
    await deleteCloudinaryImage(existing.product_image_url);
  }
  
  const product = await productsService.updateProduct(id, { productImageUrl });
  
  return ApiResponse.success(res, { product_image_url: productImageUrl }, 'Product image uploaded successfully');
});

// Delete product image
export const deleteProductImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  
  const product = await productsService.getProduct(id);
  if (product?.product_image_url) {
    const { deleteCloudinaryImage } = await import('../../config/cloudinary');
    await deleteCloudinaryImage(product.product_image_url);
    await productsService.updateProduct(id, { productImageUrl: '' });
  }
  
  return ApiResponse.success(res, null, 'Product image deleted successfully');
});
