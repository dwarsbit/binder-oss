# Changelog

## 0.7.0 (2026-11-26)

- The assistant is the same as in Polemic and Cursive. Press **Ask** at the top, or ⌘J, to ask in a bar at the bottom of the window, or choose a panel at the side under **Settings**, in **Assistant**. It answers from every source in your binder, and each quote in an answer is checked word for word against the source: click it to open the source at that passage. Select text in the reader and choose **Ask** to ask about it. The assistant can suggest properties, tags, highlights or a note, and finds papers to add, missing details and free PDFs; nothing changes until you accept its card. An item set to keep the assistant away stays away. Background reading now shows in the same bar or panel.
- With a Scholarkit account, the assistant answers from our model, hosted by Mistral in the EU, with Plus and Pro. Your own key or a model on your computer works on any plan; choose under **Settings**, in **Answers from**.

## 0.6.0 (2026-11-26)

- **Lists** in the sidebar show the items that pass the filters you choose: status, kind, tag, year, when they were added, whether they have a file, author and where they were published. Click **+** next to **Lists** to start one, click a filter to change it and **Filter** to add one. A binder starts with four lists: **Added this week**, **Ready to read**, **Missing a PDF** and **Books and chapters**; rename, duplicate or delete them from the **⋯** menu. Lists are kept in the binder, so they are the same on every computer and in the browser. See [the binder format](docs/format.md).
- **Notes** shows every note and thought, also a thought still in your inbox. A thought leaves the inbox with **Take out of inbox**, and stays in **Notes**.
- Dropdowns open Binder's own list instead of your system's, in the same style as the rest of Binder. **Status** shows each status's color, **Kind** each kind's icon and a highlight's category its color, in the list and once chosen.
- In a note, after `@`, type several words, such as an author, a word from the title and a year: `@stickgold sleep 2005`. The menu searches all of them and closes at a comma or a full stop, at a new line, or when nothing matches, so you can keep writing.
- **Find a paper** says right away when paper search needs Plus, Pro or your own OpenAlex key, instead of after your first search.
- When Binder finds no Zotero library, the **Zotero** tab says so in a roomier box, with a link to **Settings**.
- In **Find a paper**, the search button is now a magnifying glass inside the search field.
- Scroll bars are slim and rounded, in Binder's grays, and in dark mode too.

## 0.5.0 (2026-11-26)

- **Add to binder** has four tabs. **Reference** takes a link, a DOI, an ISBN, an arXiv or PubMed ID, or a PDF or EPUB you drop or choose. **Find a paper** is new: search OpenAlex's 480 million works by their title or authors as you type, and add one with its details, and its free PDF when there is one. Plus finds titles and authors; Pro also shows each paper's year, journal and free PDF as you choose. On any plan, add your own free OpenAlex key under **Settings**, in **Paper search**. **Zotero** adds works from your Zotero libraries, which **Add from Zotero…** opens too. **Note** keeps a thought in your inbox, or opens it as a note to write more.
- In a note, type `@` and a few words of a title, or an author's name, to cite a paper from OpenAlex, with Plus and Pro.
- When something goes wrong, Binder sends us an error report so we can fix it: what failed and where in its code, never your text, file names or email address. In the desktop app, turn it off under **Settings**, in **Error reports**.
- In the desktop app, your Zotero cloud key stays inside the app and goes only to zotero.org. A link that could run code instead of opening a page, mail or Zotero shows as plain text, in footnotes too. Links in the assistant's answers and in kept web pages follow the same rule.
- Binder's icon at the top left takes you back to your binders, as in Polemic and Cursive: in the browser to your Scholarkit home page, which lists everything in your account, from Binder, Polemic and Cursive, in one place; in the desktop app to the list of binders.
- Your avatar is at the top right, as in Polemic and Cursive. In the desktop app it moved there from the bottom of the sidebar. In the browser it is new, and opens **Manage your account** and **Sign out**.
- **Export…** shows an arrow pointing out, so it no longer looks like an import.
- While a binder opens, you see Binder's layout with a spinner where the binder appears, as in Polemic and Cursive.
- In the browser, your binders are at `app.scholarkit.app/binder/projects`. Links and bookmarks to the old address keep working, and the Binder Clipper follows.
- The menu under your avatar is the same in Binder, Polemic, Cursive and on your Scholarkit home page. It shows your plan, the storage you use, how much of today's cloud compile time you've used and your active review links, with **Upgrade to Plus** on Free and **Upgrade to Pro** on Plus. **Manage your account** is now **Manage account**.
- Starting a binder looks the same in Binder, Polemic and Cursive: one card with the name, your research question and **Create**. In the browser the page only makes binders; your binders are on your Scholarkit home page, where you can also rename and delete them. In the desktop app, your recent binders stay under the card.
- **Add to binder** looks up arXiv and PubMed IDs, as it does DOIs and ISBNs. Paste `arXiv:1706.03762`, `PMID: 31452104`, `PMC6744368` or a link to arxiv.org or PubMed, and Binder adds the work with its authors, year, journal and DOI. The item keeps its arXiv ID and PubMed ID, and BibTeX and CSL JSON exports carry them. A bare number stays a thought.
- Looking up a DOI, an ISBN, an arXiv or a PubMed ID now goes through your Scholarkit account, so it needs you to be signed in. The apps no longer contact Crossref, Open Library and the other sources themselves.
- Read e-books: an EPUB you add opens in the reader, one chapter at a time, with **Contents** to move between chapters. Highlight, find and quote as in a PDF; a highlight names its chapter, as `ch. 4`. A book from an EPUB gets its title, authors, year, publisher and ISBN from the book. Books locked with DRM can't be opened. See [the binder format](docs/format.md).
- Make a scanned PDF searchable: when a PDF's pages are pictures, the reader offers **Recognize the text**. Binder recognizes the text on your computer, in the language you pick, and writes it into the PDF, so you can find, select and highlight its words, in Binder and in other apps.
- When you add a work by its DOI, Binder also saves a free, legal PDF of it when there is one, so you can start reading right away. A work that has a DOI and no file yet gets **Find a free PDF**. Binder finds the PDF at Unpaywall through your Scholarkit account: Unpaywall gets the DOI, never who asked.

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
