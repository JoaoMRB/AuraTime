import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class PipService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  isInPip = signal<boolean>(false);
  private pipWindow: any = null;

  isPipSupported(): boolean {
    if (!this.isBrowser) return false;
    return 'documentPictureInPicture' in window || 'pictureInPictureEnabled' in document;
  }

  async togglePip(getTime: () => { time: string; subtext: string; mode: string }): Promise<void> {
    if (!this.isBrowser) return;

    if (this.isInPip() && this.pipWindow) {
      try {
        this.pipWindow.close();
      } catch (e) {}
      this.isInPip.set(false);
      this.pipWindow = null;
      return;
    }

    // Document Picture-in-Picture (modern Chrome/Edge)
    if ('documentPictureInPicture' in window) {
      try {
        const dPip = (window as any).documentPictureInPicture;
        const pipWin = await dPip.requestWindow({
          width: 340,
          height: 190
        });

        this.pipWindow = pipWin;
        this.isInPip.set(true);

        // Inject minimal sleek styles
        const style = pipWin.document.createElement('style');
        style.textContent = `
          * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          body {
            background: #090a0f;
            color: #ffffff;
            height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            user-select: none;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .time-display {
            font-size: 42px;
            font-weight: 700;
            letter-spacing: -0.04em;
            background: linear-gradient(135deg, #ffffff 40%, #a0a5b5 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-variant-numeric: tabular-nums;
          }
          .badge {
            margin-top: 8px;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: #d4af37;
            background: rgba(212, 175, 55, 0.12);
            padding: 3px 10px;
            border-radius: 9999px;
            border: 1px solid rgba(212, 175, 55, 0.25);
          }
          .subtext {
            margin-top: 4px;
            font-size: 11px;
            color: #71717a;
          }
        `;
        pipWin.document.head.appendChild(style);

        const container = pipWin.document.createElement('div');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'center';

        const timeElem = pipWin.document.createElement('div');
        timeElem.className = 'time-display';

        const badgeElem = pipWin.document.createElement('div');
        badgeElem.className = 'badge';

        const subElem = pipWin.document.createElement('div');
        subElem.className = 'subtext';

        container.appendChild(timeElem);
        container.appendChild(badgeElem);
        container.appendChild(subElem);
        pipWin.document.body.appendChild(container);

        const interval = setInterval(() => {
          if (pipWin.closed) {
            clearInterval(interval);
            this.isInPip.set(false);
            this.pipWindow = null;
            return;
          }
          const data = getTime();
          timeElem.textContent = data.time;
          badgeElem.textContent = data.mode;
          subElem.textContent = data.subtext;
        }, 500);

        pipWin.addEventListener('pagehide', () => {
          clearInterval(interval);
          this.isInPip.set(false);
          this.pipWindow = null;
        });

        return;
      } catch (e) {
        console.warn('Document PiP request failed, attempting popout fallback', e);
      }
    }

    // Fallback: minimal popup window
    const popout = window.open(
      '',
      'AuraTime Mini',
      'width=340,height=180,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
    );
    if (popout) {
      this.pipWindow = popout;
      this.isInPip.set(true);
      popout.document.body.style.background = '#090a0f';
      popout.document.body.style.color = '#fff';
      popout.document.body.style.display = 'flex';
      popout.document.body.style.alignItems = 'center';
      popout.document.body.style.justifyContent = 'center';
      popout.document.body.style.fontFamily = 'sans-serif';

      const timeElem = popout.document.createElement('h1');
      timeElem.style.fontSize = '36px';
      popout.document.body.appendChild(timeElem);

      const interval = setInterval(() => {
        if (popout.closed) {
          clearInterval(interval);
          this.isInPip.set(false);
          this.pipWindow = null;
          return;
        }
        timeElem.textContent = getTime().time;
      }, 500);
    }
  }
}
