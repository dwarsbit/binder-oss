# The Binder Clipper

The Binder Clipper is a browser extension that saves web pages to your
binder without leaving the page: the page's article is kept, and the
passages you highlighted while reading go with it. Clips land in the
**Inbox** of a binder in your Scholarkit account, and sync to your desktop
app like anything else you add in the browser.

## Install

The extension isn't in a browser store yet. Build it from this repository
and load it unpacked:

```bash
pnpm --filter @scholarkit/binder build:clipper
```

The build writes two folders: `apps/binder/dist-clipper` for Chrome and
Edge, and `apps/binder/dist-clipper-firefox` for Firefox.

- **Chrome or Edge**: open `chrome://extensions`, turn on **Developer
  mode**, choose **Load unpacked** and pick `apps/binder/dist-clipper`.
- **Firefox** (128 or later): open `about:debugging`, choose **This
  Firefox**, **Load Temporary Add-on…** and pick
  `apps/binder/dist-clipper-firefox/manifest.json`.

The extension needs a Scholarkit account: a clip is saved through the
Binder web app at scholarkit.app/binder, so sign in there once. If no
binder tab is open, the clipper opens one; clips wait until it has loaded.

## Use it

- Choose the extension's toolbar icon and pick the **binder** clips go to,
  then **Save page** or **Save selection**.
- Or right-click a page and choose **Save page to Binder**, or select text
  and choose **Save selection to Binder**.

A saved page becomes a web page item with its article kept as an HTML file
next to it, so you can read and highlight it in Binder even offline. A
saved selection is added as a highlight on the page's item.

Clipping a page that is in the binder already adds to it instead of making
a second item: new highlights join its highlights file, and the kept page
is only written when the item has none.

## Highlight while you read

Turn on **Highlight on this page** in the extension's popup, then select
text on any page: a small toolbar offers the highlight categories, such as
**Claim** and **Quote**. The highlights are kept for that page and shown
again when you return to it, and they are saved with the page when you
clip it. The last category you picked is the one **Save selection** uses.

## A server of your own

By default clips go to scholarkit.app. For a self-hosted Scholarkit
server, open the extension's **Clipper settings** (right-click the toolbar
icon, **Options**), enter the server's address, such as
`https://scholarkit.example.com`, and choose **Save**. The browser asks
for permission to reach that address; without it, clips can't be delivered.

## What the extension can access

The extension asks for the minimum: it reads the page you clip when you
ask it to, keeps clips and highlights in the browser's own storage until
they are saved, and talks to the Scholarkit server you picked. It has no
access to other tabs unless you clip from them, and it never runs on
pages other than your Binder web app and the page you are clipping.

## Limits

- Clips go to binders in your account, not to binders that stay only on
  your computer.
- A page's HTML is kept as you saw it, up to 4 MB; larger pages are saved
  as a link without a kept copy.
- PDFs opened in the browser's viewer can't be clipped; add their link
  instead, and Binder downloads the PDF.
- In Firefox, highlights show as plain marks until Firefox 140, which adds
  the CSS Custom Highlight API.
