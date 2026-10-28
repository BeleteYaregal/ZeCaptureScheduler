'use client';
import { useEffect, useState } from 'react';
import { BrandLogo, useBrand } from '@/lib/brand';
import { IconApple, IconCheck, IconPlusSquare, IconShare, IconSmartphone } from './Icons';
import { Notice, Sheet, useToast } from './ui';

let deferredPrompt: any = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });
}

export function InstallSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { brand } = useBrand();
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');
  const [isSafari, setIsSafari] = useState(true);
  const [isStandalone, setIsStandalone] = useState(false);
  const [canDirectInstall, setCanDirectInstall] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const standalone =
      (window.navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);

    const isIosDevice =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIosDevice) {
      setPlatform('ios');
      const isOtherBrowser = /crios|fxios|edgios|opt|opios|fban|instagram|telegram/i.test(ua);
      setIsSafari(!isOtherBrowser);
    } else if (/android/i.test(ua)) {
      setPlatform('android');
    } else {
      setPlatform('other');
    }

    if (deferredPrompt) {
      setCanDirectInstall(true);
    }
  }, []);

  async function triggerInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      toast('App installed!');
      onClose();
    }
    deferredPrompt = null;
    setCanDirectInstall(false);
  }

  function copyLink() {
    if (typeof window !== 'undefined') {
      navigator.clipboard?.writeText(window.location.origin);
      toast('Link copied to clipboard!');
    }
  }

  return (
    <Sheet
      title={platform === 'ios' ? `Install ${brand.name} on iPhone` : `Install ${brand.name}`}
      subtitle={
        isStandalone
          ? 'App is already installed'
          : platform === 'ios'
          ? 'Add to your Home Screen in 3 quick steps'
          : 'Get fast one-tap access on your home screen'
      }
      onClose={onClose}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 16,
          padding: '12px 14px',
          background: 'var(--paper)',
          borderRadius: 16,
        }}
      >
        <BrandLogo size={46} radius={13} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{brand.name}</div>
          <div className="muted small">Home screen app · Fast one-tap access</div>
        </div>
      </div>

      {isStandalone ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--green-wash)',
              color: 'var(--green)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <IconCheck style={{ width: 32, height: 32 }} />
          </div>
          <div className="h2" style={{ marginBottom: 6 }}>
            You are using the installed app!
          </div>
          <p className="muted small">
            Callsheet is already running in standalone mode on your home screen.
          </p>
        </div>
      ) : platform === 'ios' ? (
        <div>
          {!isSafari && (
            <Notice kind="warn">
              You appear to be using a browser other than Safari. Apple only supports adding apps to
              the Home Screen from <b>Safari</b>.
              <button
                type="button"
                className="btn btn-soft btn-block"
                style={{ marginTop: 8 }}
                onClick={copyLink}
              >
                Copy website address for Safari
              </button>
            </Notice>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                padding: '12px 14px',
                background: 'var(--paper)',
                borderRadius: 14,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'var(--surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand)',
                  flexShrink: 0,
                }}
              >
                <IconShare style={{ width: 22, height: 22 }} />
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>1. Tap the Share button</div>
                <div className="muted small">
                  At the bottom of your Safari screen (or top-right on iPad), tap the Share icon.
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                padding: '12px 14px',
                background: 'var(--paper)',
                borderRadius: 14,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'var(--surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand)',
                  flexShrink: 0,
                }}
              >
                <IconPlusSquare style={{ width: 22, height: 22 }} />
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>2. Tap &quot;Add to Home Screen&quot;</div>
                <div className="muted small">
                  Scroll down the share options list and choose <b>Add to Home Screen</b>.
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                padding: '12px 14px',
                background: 'var(--paper)',
                borderRadius: 14,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'var(--surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand)',
                  flexShrink: 0,
                }}
              >
                <IconCheck style={{ width: 22, height: 22 }} />
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>3. Tap &quot;Add&quot; in the top-right</div>
                <div className="muted small">
                  The app icon will immediately appear on your iPhone screen!
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'var(--indigo-wash)',
              color: 'var(--indigo-strong)',
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            ✨ <b>Benefits on Apple iOS:</b> Opens full screen without the Safari URL bar, saves your
            login, and runs smoothly offline with local caching.
          </div>
        </div>
      ) : (
        <div>
          {canDirectInstall ? (
            <div>
              <p className="muted" style={{ marginBottom: 14 }}>
                Install Callsheet directly onto your device for quick access from your home screen.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-block btn-lg"
                onClick={triggerInstall}
              >
                Install App Now
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px',
                  background: 'var(--paper)',
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'var(--surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <IconSmartphone style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Android / Chrome</div>
                  <div className="muted small">
                    Tap the <b>3 dots menu (⋮)</b> in Chrome, then select <b>Install app</b> or{' '}
                    <b>Add to Home screen</b>.
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px',
                  background: 'var(--paper)',
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'var(--surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <IconApple style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Apple iPhone & iPad</div>
                  <div className="muted small">
                    Open in Safari, tap the <b>Share button</b>, and select{' '}
                    <b>Add to Home Screen</b>.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <button type="button" className="btn btn-soft btn-block" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
