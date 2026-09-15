// English/Somali dictionary for the topbar and profile menu. Add a key here and reference it
// with useLanguage().t('key') anywhere else in the app that needs to grow bilingual coverage.
export const translations = {
  search_placeholder: { en: 'Search or type command...', so: 'Raadi ama qor amar...' },
  english: { en: 'English', so: 'Ingiriisi' },
  somali: { en: 'Somali', so: 'Soomaali' },
  language: { en: 'Language', so: 'Luuqadda' },

  view_profile: { en: 'View Profile', so: 'Fiiri Xogtayda' },
  edit_profile: { en: 'Edit Profile', so: 'Wax Ka Beddel Xogtayda' },
  account_settings: { en: 'Settings', so: 'Dejinta' },
  activity_logs: { en: 'Activity Logs', so: 'Diiwaanka Dhaqdhaqaaqa' },
  lock_screen: { en: 'Lock Screen', so: 'Xidh Shaashadda' },
  log_out: { en: 'Log Out', so: 'Ka Bax' },

  profile_title: { en: 'Profile', so: 'Xogta Shakhsiga' },
  personal_information: { en: 'Personal Information', so: 'Macluumaadka Shakhsiga' },
  full_name: { en: 'Full Name', so: 'Magaca Buuxa' },
  username: { en: 'Username', so: 'Magaca Isticmaalaha' },
  email: { en: 'Email', so: 'Iimaylka' },
  phone: { en: 'Phone', so: 'Telefoonka' },
  role: { en: 'Role', so: 'Doorka' },
  joined: { en: 'Joined', so: 'Ku Biiray' },
  change_password: { en: 'Change Password', so: 'Beddel Furaha Sirta ah' },
  current_password: { en: 'Current Password', so: 'Furaha Hadda' },
  new_password: { en: 'New Password', so: 'Furaha Cusub' },
  cancel: { en: 'Cancel', so: 'Jooji' },
  save_changes: { en: 'Save Changes', so: 'Kaydi Isbeddellada' },

  // Sidebar group titles
  sidebar_group_main: { en: 'Main', so: 'Guud' },
  sidebar_group_operations: { en: 'Operations', so: 'Hawlaha' },
  sidebar_group_finance: { en: 'Finance', so: 'Maaliyadda' },
  sidebar_group_people: { en: 'People', so: 'Shaqaalaha' },
  sidebar_group_system: { en: 'System', so: 'Nidaamka' },

  // Sidebar nav items
  nav_dashboard: { en: 'Dashboard', so: 'Guudmarka' },
  nav_customers: { en: 'Customers', so: 'Macaamiisha' },
  nav_stock_management: { en: 'Stock Management', so: 'Maaraynta Bakhaarka' },
  nav_items: { en: 'Products', so: 'Alaabta' },
  nav_adjust_items: { en: 'Adjust Products', so: 'Hagaajinta Alaabta' },
  nav_returns: { en: 'Returns', so: 'Soo Celinta' },
  nav_purchases: { en: 'Purchases', so: 'Iibsiga' },
  nav_sales: { en: 'Sales', so: 'Iibka' },
  nav_pos: { en: 'POS', so: 'POS' },
  nav_pos_orders: { en: 'POS Orders', so: 'Dalabyada POS' },
  nav_finance: { en: 'Finance', so: 'Maaliyadda' },
  nav_accounts: { en: 'Accounts', so: 'Xisaabaadka' },
  nav_receipts: { en: 'Receipts', so: 'Rasiidhada' },
  nav_expenses: { en: 'Expenses', so: 'Kharashaadka' },
  nav_payroll: { en: 'Payroll', so: 'Mushaharka' },
  nav_hr: { en: 'HR', so: 'Shaqaalaha' },
  nav_system: { en: 'System', so: 'Nidaamka' },
  nav_setting: { en: 'Setting', so: 'Dejinta' },
  nav_reports: { en: 'Reports', so: 'Warbixinnada' },
  nav_trash: { en: 'Trash', so: 'Qashinka' },
  sidebar_lock: { en: 'Lock', so: 'Xidh' },

  // Settings.tsx tabs
  tab_capital: { en: 'Capital', so: 'Raasumaal' },
  tab_accounting_cleanup: { en: 'Accounting Cleanup', so: 'Nadaafadda Xisaabaadka' },
  tab_closing_period: { en: 'Closing Period', so: 'Xilliga Xiritaanka' },
  tab_profit_sharing: { en: 'Profit Sharing', so: 'Qaybsiga Faa’iidada' },
  tab_assets: { en: 'Assets', so: 'Hantida' },

  // System.tsx tabs
  tab_company_info: { en: 'Company Info', so: 'Macluumaadka Shirkadda' },
  tab_users: { en: 'Users', so: 'Isticmaalayaasha' },
  tab_roles: { en: 'Roles', so: 'Doorarka' },
  tab_privileges: { en: 'Privileges', so: 'Awoodaha' },
  tab_role_privileges: { en: 'Role Privileges', so: 'Awoodaha Doorka' },
  tab_permissions: { en: 'Permissions', so: 'Ogolaanshaha' },

  // Reports.tsx category tabs
  report_tab_sales: { en: 'Sales', so: 'Iibka' },
  report_tab_inventory: { en: 'Inventory', so: 'Bakhaarka' },
  report_tab_purchases: { en: 'Purchases', so: 'Iibsiga' },
  report_tab_financial: { en: 'Financial', so: 'Maaliyadda' },
  report_tab_profit: { en: 'Profit', so: 'Faa’iidada' },
  report_tab_hr: { en: 'HR', so: 'Shaqaalaha' },
  report_tab_customers: { en: 'Customers', so: 'Macaamiisha' },
  report_tab_suppliers: { en: 'Suppliers', so: 'Alaab-bixiyeyaasha' },

  // Dashboard cards
  dashboard_loading_cards: { en: 'Loading dashboard cards...', so: 'Kaardhadhka guudmarka ayaa soo shubmaya...' },
  dashboard_live_metrics: { en: 'Live metrics visible', so: 'Xogta tooska ah ayaa muuqata' },

  card_today_sales_title: { en: "Today's Sales", so: 'Iibka Maanta' },
  card_today_sales_subtitle: { en: 'Sales today', so: 'Iibka la sameeyay maanta' },
  card_new_customers_today_title: { en: 'New Customers Today', so: 'Macaamiisha Cusub Maanta' },
  card_new_customers_today_subtitle: { en: 'Registered today', so: 'Diiwaangashan maanta' },
  card_today_expenses_title: { en: "Today's Expenses", so: 'Kharashaadka Maanta' },
  card_today_expenses_subtitle: { en: 'Expenses booked today', so: 'Kharashaadka maanta la diiwaangeliyay' },
  card_today_purchases_title: { en: "Today's Purchases", so: 'Iibsiga Maanta' },
  card_today_purchases_subtitle: { en: 'Received purchases today', so: 'Iibsiga maanta la helay' },
  card_week_sales_title: { en: "This Week's Sales", so: 'Iibka Toddobaadkan' },
  card_week_sales_subtitle: { en: 'Sales this week', so: 'Iibka toddobaadkan la sameeyay' },
  card_week_expenses_title: { en: "This Week's Expenses", so: 'Kharashaadka Toddobaadkan' },
  card_week_expenses_subtitle: {
    en: 'Expenses booked this week',
    so: 'Kharashaadka toddobaadkan la diiwaangeliyay',
  },
  card_loans_given_title: { en: 'Loans Given Today', so: 'Deymaha Bixiyay' },
  card_loans_given_subtitle: { en: 'Credit sales handed out today', so: 'Iibka deynta ee maanta la bixiyay' },
  card_debt_recovered_title: { en: 'Debt Recovered Today', so: 'Deynta Celiyay' },
  card_debt_recovered_subtitle: {
    en: 'Collected against customer balances today',
    so: 'Lacagta maanta laga soo ururiyay hadhaaga macaamiisha',
  },
  card_total_outstanding_title: { en: 'Total Outstanding Debt', so: 'Wadarta Deynta Hadhay' },
  card_total_outstanding_subtitle: {
    en: 'Sum of all customer balances owed',
    so: 'Isugeynta dhammaan hadhaaga macaamiisha',
  },

  // Dashboard charts
  chart_income_trend_title: { en: 'Income Trend (12 Months)', so: 'Isbeddelka Dakhliga (12 Bilood)' },
  chart_income_trend_subtitle: { en: 'Monthly income for the last 12 months', so: 'Dakhliga bishii u dhaxeeya 12-kii bilood ee la soo dhaafay' },
  chart_top_items_title: { en: 'Top Selling Products', so: 'Alaabta ugu Iibsan Badan' },
  chart_top_items_subtitle: { en: 'By quantity sold, last 30 days', so: 'Xagga tirada la iibiyay, 30-kii maalmood ee la soo dhaafay' },
  chart_debt_breakdown_title: { en: 'Customer Debt Breakdown', so: 'Kala Qaybsanaanta Deynta Macaamiisha' },
  chart_debt_breakdown_subtitle: { en: 'Top customers by outstanding balance', so: 'Macaamiisha ugu deynta badan' },
  chart_other_customers: { en: 'Other Customers', so: 'Macaamiisha Kale' },

  // Report card hints shared across multiple report categories (same English text reused
  // verbatim in several *ReportsTab.tsx files, so one key covers all of them)
  hint_between_two_dates: { en: 'Between two dates', so: 'Labada Taariikh Dhexdooda' },
  hint_dropdown_show_all: { en: 'Dropdown + Show / All', so: 'Liis + Muuji / Dhammaan' },
  hint_date_range_show_all: { en: 'Date range + Show / All', so: 'Xilli + Muuji / Dhammaan' },
  hint_between_dates_status: { en: 'Between two dates + status filter', so: 'Labada Taariikh + Xaaladda' },
  hint_single_action: { en: 'Single action report', so: 'Warbixin Hal-Tallaabo ah' },
  hint_between_dates_store: {
    en: 'Between two dates + Store dropdown + Show / All',
    so: 'Labada Taariikh + Bakhaarka + Muuji/Dhammaan',
  },
  hint_all_items_stock: { en: 'All products with stock', so: 'Dhammaan Alaabta Bakhaarka ku Jirta' },
  hint_below_threshold: { en: 'Only below threshold', so: 'Kuwa Hoosaysa Heerka la Dejiyay Oo Kaliya' },
  hint_fifo: { en: 'First-in, first-out costing', so: 'Qiimaynta Kii Hore u Baxay (FIFO)' },
  hint_lifo: { en: 'Last-in, first-out costing', so: 'Qiimaynta Kii Dambe u Baxay (LIFO)' },
  hint_average_cost: { en: 'Moving average cost', so: 'Celceliska Qiimaha' },
  hint_lost_damaged: { en: 'Lost/damaged adjustments', so: "Hagaajin La'aan/Khasaaray" },
  hint_found_stock: { en: 'Increase adjustments (found stock)', so: 'Kordhinta (Alaab la Helay)' },
  hint_selected_store_all: { en: 'Show selected store or all', so: 'Muuji Bakhaarka la Doortay ama Dhammaan' },
  hint_detailed_by_store: { en: 'Detailed by store', so: 'Faahfaahsan Bakhaar Kasta' },
  hint_store_movement_summary: {
    en: 'Between two dates + begin/purchase/sales qty',
    so: 'Labada Taariikh + Bilow/Iibsi/Iib Tirada',
  },
  hint_item_movement: {
    en: 'Product-wise movement between two dates',
    so: 'Dhaqdhaqaaqa Alaabta Labada Taariikh Dhexdooda',
  },
  hint_snapshot_to_date: {
    en: 'Between two dates (snapshot as of To Date)',
    so: 'Labada Taariikh (Xaaladda Ilaa Taariikhda Dhammaadka)',
  },
  hint_open_invoices: { en: 'Open invoices as of date', so: 'Rasiidhada Furan Ilaa Taariikhda' },
  hint_group_by: { en: 'Group by customer, item, or store', so: 'U Kala Saar Macmiil, Alaab, ama Bakhaar' },
  hint_closed_periods: { en: 'Closed periods within range', so: 'Xilliyada la Xiray ee Xadka ku Jira' },
  hint_payroll_detail: {
    en: 'Date range + employee salary breakdown',
    so: 'Xilli + Faahfaahinta Mushaharka Shaqaalaha',
  },
  hint_overdue_balance: {
    en: 'Due date passed with balance remaining',
    so: 'Taariikhda Dhammaadka way Dhaaftay, Hadhaana wali Jira',
  },
  hint_date_range_product_selection: {
    en: 'Date range + product selection',
    so: 'Xilli + Doorashada Alaabta',
  },

  // Sales report cards
  rcard_sales_summary_title: { en: 'Sales Summary', so: 'Isku-soo-koobka Iibka' },
  rcard_invoice_status_title: { en: 'Invoice Status', so: 'Xaaladda Rasiidhada' },
  rcard_daily_sales_title: { en: 'Daily Sales Report', so: 'Warbixinta Iibka Maalinlaha ah' },
  rcard_sales_by_customer_title: { en: 'Sales by Customer', so: 'Iibka Macmiil Kasta' },
  rcard_sales_by_product_title: { en: 'Sales by Product', so: 'Iibka Alaab Kasta' },
  rcard_sales_by_store_title: { en: 'Sales by Store', so: 'Iibka Bakhaar Kasta' },
  rcard_top_selling_items_title: { en: 'Most Sold Products', so: 'Alaabta ugu Iibsan Badan' },
  rcard_top_customers_title: { en: 'Top Customers', so: 'Macaamiisha ugu Sarreeya' },
  rcard_sales_returns_title: { en: 'Sales Returns Report', so: 'Warbixinta Soo Celinta Iibka' },
  rcard_payments_by_account_title: { en: 'Sales Payments by Account', so: 'Lacag-bixinta Iibka ee Xisaab Kasta' },
  rcard_quotations_title: { en: 'Quotations', so: 'Qiimaha la Bixiyay' },
  rcard_cashier_performance_title: { en: 'Cashier Performance', so: 'Waxqabadka Keeshegga' },

  // Inventory report cards
  rcard_current_stock_title: { en: 'Current Stock Levels', so: 'Heerka Bakhaarka Hadda' },
  rcard_low_stock_title: { en: 'Low Stock Alert', so: 'Digniinta Bakhaarka Yaraaday' },
  rcard_valuation_fifo_title: { en: 'Stock Value (FIFO)', so: 'Qiimaha Bakhaarka (FIFO)' },
  rcard_valuation_lifo_title: { en: 'Stock Value (LIFO)', so: 'Qiimaha Bakhaarka (LIFO)' },
  rcard_valuation_average_title: { en: 'Stock Value (Average)', so: 'Qiimaha Bakhaarka (Celcelis)' },
  rcard_adjustments_title: { en: 'Stock Adjustment Log', so: 'Diiwaanka Hagaajinta Bakhaarka' },
  rcard_inventory_loss_title: { en: 'Inventory Loss', so: 'Khasaaraha Bakhaarka' },
  rcard_inventory_found_title: { en: 'Inventory Found', so: 'Alaabta la Helay' },
  rcard_store_stock_title: { en: 'Store Stock Report', so: 'Warbixinta Bakhaarka Store-ka' },
  rcard_store_wise_title: { en: 'Store-wise Stock', so: 'Bakhaarka Store Kasta' },
  rcard_store_movement_title: { en: 'Store Movement Summary', so: 'Isku-soo-koobka Dhaqdhaqaaqa Store-ka' },
  rcard_store_movement_detail_title: { en: 'Store Movement Detail', so: 'Faahfaahinta Dhaqdhaqaaqa Store-ka' },

  // Purchase report cards
  rcard_orders_summary_title: { en: 'Purchase Orders Summary', so: 'Isku-soo-koobka Dalabaadka Iibsiga' },
  rcard_purchase_returns_title: { en: 'Purchase Returns', so: 'Soo Celinta Iibsiga' },
  rcard_purchase_payment_status_title: { en: 'Purchase Payment Status', so: 'Xaaladda Lacag-bixinta Iibsiga' },
  rcard_supplier_wise_title: { en: 'Supplier Wise Purchases', so: 'Iibsiga Alaab-bixiye Kasta' },
  rcard_best_suppliers_title: { en: 'Best Suppliers', so: 'Alaab-bixiyeyaasha ugu Fiican' },
  rcard_price_variance_title: { en: 'Purchase Price Variance', so: 'Kala Duwanaanta Qiimaha Iibsiga' },

  // Financial report cards
  rcard_balance_sheet_title: { en: 'Balance Sheet', so: 'Miisaaniyadda Hantida' },
  rcard_cash_flow_title: { en: 'Cash Flow Statement', so: 'Bayaanka Socodka Lacagta' },
  rcard_cogs_title: { en: 'COGS (Cost of Goods Sold)', so: 'Qiimaha Alaabta la Iibiyay (COGS)' },
  rcard_account_balances_title: { en: 'Account Balances', so: 'Hadhaaga Xisaabaadka' },
  rcard_expense_summary_title: { en: 'Expense Summary', so: 'Isku-soo-koobka Kharashaadka' },
  rcard_accounts_receivable_title: { en: 'Accounts Receivable', so: 'Lacagaha la Sugayo' },
  rcard_accounts_payable_title: { en: 'Accounts Payable', so: 'Lacagaha la Bixin Doono' },
  rcard_account_statement_title: { en: 'Account Statement', so: 'Bayaanka Xisaabta' },
  rcard_trial_balance_title: { en: 'Trial Balance', so: 'Miisaaniyadda Tijaabada' },
  rcard_general_ledger_title: { en: 'General Ledger', so: 'Diiwaanka Guud ee Xisaabaadka' },

  // Profit report cards
  rcard_income_statement_title: { en: 'Income Statement (Profit & Loss)', so: "Bayaanka Dakhliga (Faa'iido & Khasaare)" },
  rcard_profit_analysis_title: { en: 'Profit Analysis', so: "Falanqaynta Faa'iidada" },
  rcard_profit_by_period_title: { en: 'Profit by Closing Period', so: "Faa'iidada Xilliga Xiran" },

  // HR report cards
  rcard_employee_list_title: { en: 'Employee List', so: 'Liiska Shaqaalaha' },
  rcard_payroll_summary_title: { en: 'Payroll Summary', so: 'Isku-soo-koobka Mushaharka' },
  rcard_payroll_employee_detail_title: { en: 'Payroll Employee Detail', so: 'Faahfaahinta Mushaharka Shaqaale' },
  rcard_salary_payments_title: { en: 'Salary Payments', so: 'Lacag-bixinta Mushaharka' },
  rcard_payroll_by_month_title: { en: 'Payroll by Month', so: 'Mushaharka Bil Kasta' },

  // Customer report cards
  rcard_customer_list_title: { en: 'Customer List', so: 'Liiska Macaamiisha' },
  rcard_customer_ledger_title: { en: 'Customer Ledger', so: 'Diiwaanka Macmiilka' },
  rcard_outstanding_balances_title: { en: 'Outstanding Balances', so: 'Hadhaaga aan la Bixin' },
  rcard_customer_payment_history_title: { en: 'Customer Payment History', so: 'Taariikhda Lacag-bixinta Macmiilka' },
  rcard_credit_customers_title: { en: 'Credit Customers', so: 'Macaamiisha Deynta' },
  rcard_credit_overdue_sales_title: { en: 'Overdue Credit Sales', so: 'Iibka Deynta ee Dhaafay' },
  rcard_new_customers_title: { en: 'New Customers (by date)', so: 'Macaamiisha Cusub (Taariikh ahaan)' },
  rcard_customer_activity_title: { en: 'Customer Activity', so: 'Dhaqdhaqaaqa Macmiilka' },

  // Supplier report cards
  rcard_supplier_list_title: { en: 'Supplier List', so: 'Liiska Alaab-bixiyeyaasha' },
  rcard_supplier_ledger_title: { en: 'Supplier Ledger', so: 'Diiwaanka Alaab-bixiyaha' },
  rcard_supplier_payments_title: { en: 'Supplier Payments', so: 'Lacag-bixinta Alaab-bixiyaha' },
  rcard_supplier_outstanding_title: { en: 'Outstanding Purchases', so: 'Iibsiga aan la Bixin' },
  rcard_credit_overdue_purchases_title: { en: 'Overdue Credit Purchases', so: 'Iibsiga Deynta ee Dhaafay' },
} as const;

export type TranslationKey = keyof typeof translations;
