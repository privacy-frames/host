# File exports and browser download services

Downloads require an explicit trusted host confirmation. Approval releases the
app-supplied file from confinement; it does not authorize later exports or enable
application networking. The confirmation contains fixed host text, with no
application-supplied filename, URL or content before approval.

Application anchors have no native `href`. Their logical destination is untrusted
metadata retained across native DOM cloning. The host mediates fragment changes
and approved file exports. This prevents synthetic modifier-clicks from opening
HTTP tabs, including when the link points to a fragment. Programmatic clicks
finish their mediated default action before returning, preserving the usual
`a.click(); URL.revokeObjectURL(url)` pattern.

The export uses a detached host-owned download link. Guest code cannot access the
native `confirm` function. CSP permits host modals and downloads; app script
execution remains inside QuickJS. A rejected confirmation produces no download.
Window tests exercise denial, acceptance, connected and detached anchors,
immediate revocation, exact exported bytes and inaccessible guest confirmation.

## Why approval is required

Chromium can send a browser-owned download-protection request for a Blob or data
URL. The pinned implementation at
[a34805b3](https://github.com/chromium/chromium/tree/a34805b3ad5189e8b3f6bb94a9d6915f6e3bf777)
contains the relevant stages:

- [Blob/data eligibility and supported-file or sampled checks](https://github.com/chromium/chromium/blob/a34805b3ad5189e8b3f6bb94a9d6915f6e3bf777/chrome/browser/safe_browsing/download_protection/check_client_download_request.cc#L151).
- [Desktop profile and Safe Browsing conditions](https://github.com/chromium/chromium/blob/a34805b3ad5189e8b3f6bb94a9d6915f6e3bf777/chrome/browser/safe_browsing/download_protection/download_protection_delegate_desktop.cc#L48).
- [Request metadata, including the file digest and name](https://github.com/chromium/chromium/blob/a34805b3ad5189e8b3f6bb94a9d6915f6e3bf777/chrome/browser/safe_browsing/download_protection/download_request_maker.cc#L209).
- [The browser-service POST](https://github.com/chromium/chromium/blob/a34805b3ad5189e8b3f6bb94a9d6915f6e3bf777/chrome/browser/safe_browsing/download_protection/check_client_download_request_base.cc#L499).

File policy, profile settings and sampling affect whether a check occurs. Local
receiver tests do not measure these browser-service requests. No external
screening traffic was generated to investigate this behavior.
