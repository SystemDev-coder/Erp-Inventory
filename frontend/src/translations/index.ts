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
  nav_items: { en: 'Items', so: 'Alaabta' },
  nav_adjust_items: { en: 'Adjust Items', so: 'Hagaajinta Alaabta' },
  nav_returns: { en: 'Returns', so: 'Soo Celinta' },
  nav_purchases: { en: 'Purchases', so: 'Iibsiga' },
  nav_sales: { en: 'Sales', so: 'Iibka' },
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
  dashboard_cards_hint: {
    en: 'Cards are visible. Click Show to reveal numbers.',
    so: 'Kaardhadhku way muuqdaan. Guji Muuji si aad u aragto tirooyinka.',
  },
  dashboard_show: { en: 'Show', so: 'Muuji' },
  dashboard_hide: { en: 'Hide', so: 'Qari' },
  dashboard_loading: { en: 'Loading...', so: 'Waa la soo shubayaa...' },
  dashboard_hidden_until_show: { en: 'Hidden until Show', so: 'Waa qarsoon yahay ilaa Muuji' },

  card_today_income_title: { en: 'Today Income', so: 'Dakhliga Maanta' },
  card_today_income_subtitle: { en: 'Sales today', so: 'Iibka maanta' },
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
} as const;

export type TranslationKey = keyof typeof translations;
