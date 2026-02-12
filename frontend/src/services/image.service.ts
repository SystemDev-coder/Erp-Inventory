import { apiClient, ApiResponse } from './api';

export const imageService = {
  // System Images
  async uploadSystemLogo(file: File): Promise<ApiResponse<{ logo_url: string }>> {
    const formData = new FormData();
    formData.append('logo', file);
    
    return apiClient.post('/system/logo', formData);
  },

  async uploadSystemBanner(file: File): Promise<ApiResponse<{ banner_image_url: string }>> {
    const formData = new FormData();
    formData.append('banner', file);
    
    return apiClient.post('/system/banner', formData);
  },

  async deleteSystemLogo(): Promise<ApiResponse> {
    return apiClient.delete('/system/logo');
  },

  async deleteSystemBanner(): Promise<ApiResponse> {
    return apiClient.delete('/system/banner');
  },

  // Product Images
  async uploadProductImage(productId: number, file: File): Promise<ApiResponse<{ product_image_url: string }>> {
    const formData = new FormData();
    formData.append('image', file);
    
    return apiClient.post(`/products/${productId}/image`, formData);
  },

  async deleteProductImage(productId: number): Promise<ApiResponse> {
    return apiClient.delete(`/products/${productId}/image`);
  },

};
