import { inventoryReportsService } from './reports/inventoryReports.service';
import { financialReportsService } from './reports/financialReports.service';
import { hrReportsService } from './reports/hrReports.service';
import { purchaseReportsService } from './reports/purchaseReports.service';
import { salesReportsService } from './reports/salesReports.service';
import { customerReportsService } from './reports/customerReports.service';

export const reportsService = {
  ...salesReportsService,
  ...inventoryReportsService,
  ...purchaseReportsService,
  ...financialReportsService,
  ...hrReportsService,
  ...customerReportsService,
};

export * from './reports/salesReports.service';
export * from './reports/inventoryReports.service';
export * from './reports/purchaseReports.service';
export * from './reports/financialReports.service';
export * from './reports/hrReports.service';
export * from './reports/customerReports.service';
