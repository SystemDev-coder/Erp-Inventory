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
} as const;

export type TranslationKey = keyof typeof translations;
