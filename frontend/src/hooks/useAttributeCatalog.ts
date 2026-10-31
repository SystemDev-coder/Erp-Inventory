import { useEffect, useState } from 'react';
import { AttributeDefinition, productService } from '../services/product.service';
import { useBranch } from '../context/BranchContext';

// Category Configuration Engine: loads the branch's live attribute catalog
// (labels/types/options for every attribute an admin has defined, built-in
// or custom) once per mount, keyed by attribute key - mirrors the
// resolveCategories/resolveUnits-on-mount pattern used throughout this app.
// Shared by every product picker that renders an attribute caption
// (Sales, Purchases, POS, Returns, Stock Adjustment, Transfers, Stores) so
// a brand-new attribute shows its real label everywhere, not a raw key.
export const useAttributeCatalog = (): Record<string, AttributeDefinition> => {
  const { activeBranchId } = useBranch();
  const [catalog, setCatalog] = useState<Record<string, AttributeDefinition>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await productService.listAttributes(activeBranchId ?? undefined);
      if (cancelled) return;
      if (res.success && res.data?.attributes) {
        const map: Record<string, AttributeDefinition> = {};
        for (const attribute of res.data.attributes) map[attribute.key] = attribute;
        setCatalog(map);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBranchId]);

  return catalog;
};
