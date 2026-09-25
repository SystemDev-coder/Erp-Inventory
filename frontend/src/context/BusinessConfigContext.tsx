/**
 * Business Profile / Configuration (Phase 11) - resolved once per session
 * and shared everywhere via useBusinessConfig(), the same pattern
 * BranchContext already uses for "active branch." Every role needs this,
 * not just admins (a Cashier's product/sale forms still need to know
 * whether size/color/barcode are relevant) - it's fetched as soon as
 * there's a logged-in user, independent of any specific permission.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { settingsService, BusinessProfile } from '../services/settings.service';

const FALLBACK_PROFILE: BusinessProfile = {
  businessType: null,
  email: null,
  website: null,
  currency: null,
  country: null,
  timezone: null,
  productConfig: {
    barcode: true,
    variants: false,
    size: false,
    color: false,
    brand: true,
    batchTracking: false,
    expiryTracking: false,
    serialNumber: false,
    multipleUnits: true,
    genericName: false,
    strength: false,
  },
  salesConfig: {
    retail: true,
    wholesale: true,
    credit: true,
    creditDays: 30,
    discount: true,
    tax: true,
    pos: true,
    customerDisplay: false,
  },
  purchaseConfig: {
    supplierManagement: true,
    purchaseOrders: true,
    purchasePayments: true,
    creditPurchases: true,
    supplierCreditDays: 30,
  },
};

interface BusinessConfigContextType {
  profile: BusinessProfile;
  loading: boolean;
  refresh: () => Promise<void>;
}

const BusinessConfigContext = createContext<BusinessConfigContextType | undefined>(undefined);

export function BusinessConfigProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<BusinessProfile>(FALLBACK_PROFILE);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await settingsService.getBusinessProfile();
    if (res.success && res.data?.profile) {
      setProfile(res.data.profile);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user) {
      setProfile(FALLBACK_PROFILE);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id]);

  return (
    <BusinessConfigContext.Provider value={{ profile, loading, refresh: load }}>
      {children}
    </BusinessConfigContext.Provider>
  );
}

export function useBusinessConfig() {
  const context = useContext(BusinessConfigContext);
  if (context === undefined) {
    throw new Error('useBusinessConfig must be used within a BusinessConfigProvider');
  }
  return context;
}
