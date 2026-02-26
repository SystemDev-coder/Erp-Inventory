import { inventoryReportsService } from './reports/inventoryReports.service';
import { purchaseReportsService } from './reports/purchaseReports.service';
import { salesReportsService } from './reports/salesReports.service';

export const reportsService = {
  ...salesReportsService,
  ...inventoryReportsService,
  ...purchaseReportsService,
};

export * from './reports/salesReports.service';
export * from './reports/inventoryReports.service';
export * from './reports/purchaseReports.service';
