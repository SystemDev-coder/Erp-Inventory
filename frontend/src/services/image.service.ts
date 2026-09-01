import { apiClient, ApiResponse } from './api';

export const imageService = {
  // System Images
  async uploadSystemLogo(file: File): Promise<ApiResponse<{ logo_url: string }>> {
    const formData = new FormData();
    formData.append('logo', file);
    
    return apiClient.post('/api/system/logo', formData);
  },

  async uploadSystemBanner(file: File): Promise<ApiResponse<{ banner_image_url: string }>> {
    const formData = new FormData();
    formData.append('banner', file);
    
    return apiClient.post('/api/system/banner', formData);
  },

  async deleteSystemLogo(reason: string): Promise<ApiResponse> {
    return apiClient.delete('/api/system/logo', reason);
  },

  async deleteSystemBanner(reason: string): Promise<ApiResponse> {
    return apiClient.delete('/api/system/banner', reason);
  },

  // Product Images
  async uploadProductImage(productId: number, file: File): Promise<ApiResponse<{ product_image_url: string }>> {
    const formData = new FormData();
    formData.append('image', file);
    
    return apiClient.post(`/api/products/${productId}/image`, formData);
  },

  async deleteProductImage(productId: number, reason: string): Promise<ApiResponse> {
    return apiClient.delete(`/api/products/${productId}/image`, reason);
  },

};
