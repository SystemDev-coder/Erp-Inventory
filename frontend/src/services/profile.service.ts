import { apiClient } from './api';

export interface Profile {
  user_id: number;
  name: string;
  username: string;
  email?: string | null;
  phone?: string | null;
  role_id?: number | null;
  role_name?: string | null;
}

export const profileService = {
  async get() {
    return apiClient.get<{ profile: Profile }>('/api/profile');
  },
  async update(data: Partial<Profile>) {
    return apiClient.put<{ profile: Profile }>('/api/profile', data);
  },
  async updatePassword(data: { currentPassword: string; newPassword: string }) {
    return apiClient.put<{ message: string }>('/api/profile/password', data);
  },
};
