# Changelog

## 0.5.0 (unreleased)

- When something goes wrong, Binder sends us an error report so we can fix it: what failed and where in its code, never your text, file names or email address. In the desktop app, turn it off under **Settings**, in **Error reports**.
- In the desktop app, your Zotero cloud key stays inside the app and goes only to zotero.org. A link that could run code instead of opening a page, mail or Zotero shows as plain text, in footnotes too. Links in the assistant's answers and in kept web pages follow the same rule.

## 0.4.0 (2026-11-22)

- The desktop app keeps itself up to date. It checks for a new version when it starts and once a day, downloads it in the background and shows **Update ready**. Choose **Restart now** to install it; your work is saved first. **What’s new** lists the changes. Turn the check off, or check now, under **Settings**, in **Updates**. This version is the last one you download by hand.
- Use Binder in your browser at scholarkit.app/binder, with your free Scholarkit account. Your binders are kept in your account, so you can open them on any computer. Make a binder with its research question, rename it or delete it from the list of binders.
- In the browser, a link you add keeps the page's text or its PDF, as in the desktop app. The Zotero app on your computer can't be reached from the browser: add from your library at zotero.org instead.
- A binder open in two tabs stays in step: what you change in one shows in the other.
- Sign in to your Scholarkit account in the desktop app, at the foot of the sidebar, and sync a binder with it: choose your name, then **Sync this binder to your account**. A synced binder opens in your browser and on your other computers, and Binder syncs it every few seconds. Only the binders you choose sync.
- Open a binder from your account on this computer, such as one you made in the browser: choose **Open here** under **In your account** in the list of binders.
- When your account is full, items and notes keep syncing, and the files that don't fit stay on your computer. The status bar says how many.
- Export your references as BibTeX, RIS or CSL JSON: choose **Export…** at the top of a list. Export the list or the whole binder, save the file or copy it. Notes and thoughts stay out.
- Items have a volume, issue and pages. A work from Zotero or a DOI comes with them where they are known. See [the binder format](docs/format.md).
- Fixed: Binder reads and writes only the folders you open as binders, so a source can't make it touch any other folder on your computer.

## 0.3.0 (2026-11-14)

- Let an assistant read your sources, on your own provider (Mistral, OpenAI, Anthropic or any service with the OpenAI chat API) or a model on your computer (Ollama, LM Studio). Set it up in Settings, which names where the text goes. Your key is kept in your system's credential store.
- The assistant proposes the kind, title, authors, year and tags of each new source. Change what you like and accept it, or dismiss it. Items with a proposal have a mark in the inbox.
- It sums a source up for your research question and says which parts to read closely, and outlines a long source. Every sentence links to its passage, which opens the source there. Binder checks each passage against the source and leaves out what it can't find.
- It proposes highlights, shown dashed in the reader next to your own. Keep the ones you want.
- What the assistant wrote is marked as its own and kept apart from your notes, in a file next to the item. **Take over** moves a part to your notes. See [the binder format](docs/format.md).
- Keep the assistant away from one item, or out of a whole binder.
- Fixed: adding a highlight to empty notes left an empty line above the quote.
- Fixed: a link to a page of a file with parentheses in its name broke in notes.

## 0.2.0 (2026-11-13)

- Read a PDF or a web page in Binder: choose **Read** on its item. Zoom in and out, and find text in the source with Cmd/Ctrl + F.
- Highlight text in a source as a claim, definition, method, finding or quote. The highlights are listed next to the source, and a click goes back to each one.
- Take a highlight into your notes: drag it in, or choose **Add to notes**. It becomes a quote with a link to its page, and the link opens the source there.
- A link you add in the desktop app keeps the page's text, so you can read and highlight it without the site. A link to a PDF adds the PDF. For a web page you added before, choose **Keep the page text**.
- Search finds text inside every PDF and kept page, by page, and opens the source at the match.
- Highlights are kept in a Markdown file next to their item, and go along when the item gets a new name. See [the binder format](docs/format.md).

- Make a binder for a research project and write down your research question. A binder is a folder in the Binder folder in your home folder; open any other folder as a binder too.
- Add a link, a DOI, an ISBN or a thought with Cmd/Ctrl + N. A DOI is looked up at Crossref and an ISBN at Open Library, for the title, authors, year and journal.
- Add a file from Add to binder, or drop files on the window. Each file is copied into the binder, next to its item and under the same name.
- Add a whole collection from Zotero at once, or search your Zotero library for a work. Connect the Zotero app or a zotero.org library in Settings. Works already in the binder are left out, and an item opens in Zotero from its page.
- Go through your inbox: move each new item to your reading list or set it aside, and the next one opens.
- See your reading list as a list or as a board, with a column for each status: to read, reading, processed and set aside. Drag a card to change its status.
- Write notes on an item, or add a note of your own, in the blocks of Cursive. Cite with `@` and link items with `[[`.
- Tag items, and see each tag with its items in the sidebar.
- Search the titles, details, tags and notes of every item with Cmd/Ctrl + K, and find text in the open item with Cmd/Ctrl + F.
- Rename an item by its title: its file and its original file get the new name, and links to it follow.
- Every item is a Markdown file with its details in the front matter. See [the binder format](docs/format.md).
