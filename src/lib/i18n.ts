/** Minimal i18n: a flat key dictionary per language + a substitution helper. */

export type Lang = 'en' | 'pl';

export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'pl', label: 'Polski' },
];

const en = {
  appName: 'jrjr-drive',
  signIn: 'Sign in',
  signingIn: 'Signing in…',
  signOut: 'Sign out',
  username: 'Username',
  password: 'Password',
  cancel: 'Cancel',
  done: 'Done',
  copy: 'Copy',
  copied: 'Copied',
  download: 'Download',
  delete: 'Delete',
  rename: 'Rename',
  share: 'Share',
  loading: 'Loading…',
  save: 'Save',
  saving: 'Saving…',
  edit: 'Edit',
  actions: 'Actions',
  optional: 'optional',

  loginSubtitle: 'Sign in to manage your files.',
  loginTagline: 'Lightweight self-hosted file portal',
  loginFailed: 'Login failed',
  networkError: 'Network error',

  navFiles: 'Files',
  navShared: 'Share links',
  navSettings: 'Settings',

  home: 'Home',
  newFolder: 'New folder',
  newFolderPrompt: 'New folder name:',
  renamePrompt: 'Rename to:',
  deleteConfirm: 'Delete "{name}"? This cannot be undone.',
  upload: 'Upload',
  uploadFiles: 'Upload files',
  dropToUpload: 'Drop files to upload',
  emptyTitle: 'This folder is empty',
  emptyHint: 'Drag files here or use the upload button.',
  folder: 'Folder',
  viewGrid: 'Grid',
  viewList: 'List',
  sortName: 'Name',
  sortDate: 'Modified',
  sortSize: 'Size',

  settingsTitle: 'Settings',
  appearance: 'Appearance',
  theme: 'Theme',
  themeLight: 'Light',
  themeDark: 'Dark',
  language: 'Language',
  defaultView: 'Default view',
  sorting: 'Sort files by',
  account: 'Account',
  accountName: 'Account',
  storageUsed: 'Storage used',
  activeLinks: 'Active share links',
  settingsSaved: 'Changes are saved automatically and kept in this browser.',

  shareFile: 'Share file',
  shareFolder: 'Share folder',
  passwordLabel: 'Password',
  expiresLabel: 'Expires',
  noPassword: 'No password',
  createLink: 'Create link',
  creating: 'Creating…',
  linkCreated: 'Public link created',
  permissions: 'Permissions',
  permViewOnly: 'View only',
  permDownload: 'View & download',
  permViewOnlyHint: 'Visitors can preview files but not download them.',
  permDownloadHint: 'Visitors can preview and download files.',
  updateLink: 'Update link',
  editShare: 'Edit share link',

  sharesEmptyTitle: 'No share links yet',
  sharesEmptyHint: 'Create one from the Share action on any file.',
  public: 'Public',
  passwordProtected: 'Password',
  viewOnly: 'View only',
  until: 'Until {date}',
  revoke: 'Revoke',
  revokeConfirm: 'Revoke this share link?',
  copyLink: 'Copy link',

  noPreview: 'No preview for this file type.',
  downloadFile: 'Download file',
  prevFile: 'Previous',
  nextFile: 'Next',

  protectedTitle: 'Protected share',
  protectedHint: 'Enter the password to view "{name}".',
  unlock: 'Unlock',
  wrongPassword: 'Password required or incorrect',
  downloadNotAllowed: 'Downloads are disabled for this link.',
};

type Key = keyof typeof en;

const pl: Record<Key, string> = {
  appName: 'jrjr-drive',
  signIn: 'Zaloguj się',
  signingIn: 'Logowanie…',
  signOut: 'Wyloguj',
  username: 'Nazwa użytkownika',
  password: 'Hasło',
  cancel: 'Anuluj',
  done: 'Gotowe',
  copy: 'Kopiuj',
  copied: 'Skopiowano',
  download: 'Pobierz',
  delete: 'Usuń',
  rename: 'Zmień nazwę',
  share: 'Udostępnij',
  loading: 'Ładowanie…',
  save: 'Zapisz',
  saving: 'Zapisywanie…',
  edit: 'Edytuj',
  actions: 'Akcje',
  optional: 'opcjonalne',

  loginSubtitle: 'Zaloguj się, aby zarządzać plikami.',
  loginTagline: 'Lekki, samodzielnie hostowany portal plików',
  loginFailed: 'Logowanie nie powiodło się',
  networkError: 'Błąd sieci',

  navFiles: 'Pliki',
  navShared: 'Linki',
  navSettings: 'Ustawienia',

  home: 'Początek',
  newFolder: 'Nowy folder',
  newFolderPrompt: 'Nazwa nowego folderu:',
  renamePrompt: 'Nowa nazwa:',
  deleteConfirm: 'Usunąć „{name}"? Tej operacji nie można cofnąć.',
  upload: 'Wyślij',
  uploadFiles: 'Wyślij pliki',
  dropToUpload: 'Upuść pliki, aby wysłać',
  emptyTitle: 'Ten folder jest pusty',
  emptyHint: 'Przeciągnij tu pliki lub użyj przycisku wysyłania.',
  folder: 'Folder',
  viewGrid: 'Siatka',
  viewList: 'Lista',
  sortName: 'Nazwa',
  sortDate: 'Data zmiany',
  sortSize: 'Rozmiar',

  settingsTitle: 'Ustawienia',
  appearance: 'Wygląd',
  theme: 'Motyw',
  themeLight: 'Jasny',
  themeDark: 'Ciemny',
  language: 'Język',
  defaultView: 'Domyślny widok',
  sorting: 'Sortuj pliki według',
  account: 'Konto',
  accountName: 'Konto',
  storageUsed: 'Wykorzystane miejsce',
  activeLinks: 'Aktywne linki',
  settingsSaved: 'Zmiany zapisują się automatycznie i są pamiętane w tej przeglądarce.',

  shareFile: 'Udostępnij plik',
  shareFolder: 'Udostępnij folder',
  passwordLabel: 'Hasło',
  expiresLabel: 'Wygasa',
  noPassword: 'Bez hasła',
  createLink: 'Utwórz link',
  creating: 'Tworzenie…',
  linkCreated: 'Link publiczny utworzony',
  permissions: 'Uprawnienia',
  permViewOnly: 'Tylko podgląd',
  permDownload: 'Podgląd i pobieranie',
  permViewOnlyHint: 'Odwiedzający mogą przeglądać pliki, ale nie mogą ich pobierać.',
  permDownloadHint: 'Odwiedzający mogą przeglądać i pobierać pliki.',
  updateLink: 'Zapisz zmiany',
  editShare: 'Edytuj link',

  sharesEmptyTitle: 'Brak linków',
  sharesEmptyHint: 'Utwórz link akcją Udostępnij na dowolnym pliku.',
  public: 'Publiczny',
  passwordProtected: 'Hasło',
  viewOnly: 'Tylko podgląd',
  until: 'Do {date}',
  revoke: 'Cofnij',
  revokeConfirm: 'Cofnąć ten link?',
  copyLink: 'Kopiuj link',

  noPreview: 'Brak podglądu dla tego typu pliku.',
  downloadFile: 'Pobierz plik',
  prevFile: 'Poprzedni',
  nextFile: 'Następny',

  protectedTitle: 'Chroniony link',
  protectedHint: 'Podaj hasło, aby zobaczyć „{name}".',
  unlock: 'Odblokuj',
  wrongPassword: 'Wymagane lub błędne hasło',
  downloadNotAllowed: 'Pobieranie jest wyłączone dla tego linku.',
};

const messages: Record<Lang, Record<Key, string>> = { en, pl };

export type TranslationKey = Key;

/** Look up a translation and substitute `{var}` placeholders. */
export function translate(
  lang: Lang,
  key: Key,
  vars?: Record<string, string | number>,
): string {
  let text = messages[lang]?.[key] ?? messages.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}
