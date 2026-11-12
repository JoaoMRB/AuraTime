/**
 * Facts about the Windows app (app/ in this repository) that the website shows. Update them with each release:
 * the version is the <Version> of app/AuraTime.Desktop/AuraTime.Desktop.csproj, the size the installer's.
 */
export const DESKTOP_APP = {
  version: '0.1.0',
  sizeMb: 40,
  /**
   * Always the newest release. Works because every release has an asset with exactly this name
   * (app/build-installer.ps1 writes it next to the versioned file).
   */
  downloadUrl: 'https://github.com/JoaoMRB/AuraTime/releases/latest/download/AuraTime-Setup.exe',
  sourceUrl: 'https://github.com/JoaoMRB/AuraTime/tree/main/app',
  /** The driver the app needs, besides administrator rights, to read the CPU's own temperature. */
  pawnIoUrl: 'https://pawnio.eu/'
} as const;
