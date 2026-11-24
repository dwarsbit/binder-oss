# Getting started with Binder

Binder keeps the sources of one research project together, from the first
search to the moment you know what each source means for your project.
This guide walks through a binder for a thesis.

## Make a binder

When you open Binder, it shows your binders. Type a name, such as
“Thesis”, and your research question, if you have one yet, and choose
**Create**. The binder is a folder in the Binder folder in your home
folder. To use a folder you already have, choose **Open folder…**.

You can also use Binder in your browser, at scholarkit.app/binder. Sign in
with your free Scholarkit account. Your binders are kept in your account,
so you can open them on any computer. The browser can't reach the Zotero
app on your computer: add from your library at zotero.org instead.

## Sync a binder with your account

In the desktop app, choose **Sign in** at the foot of the sidebar and sign
in with your free Scholarkit account in your browser. Then choose your name
there, and **Sync this binder to your account**. The binder is then in
your account too: open it in your browser, or on another computer. A
binder only syncs when you choose this; the others stay on your computer
only.

While you work, Binder syncs every few seconds, and the status bar says
"Saved and synced". Without a connection, you keep working on your
computer, and Binder catches up when it can.

Your account has room for a limited amount of files. When it is full, your
items and notes still sync, and the files that don't fit, such as large
PDFs, stay on your computer. The status bar says how many. Files over
50 MB always stay on your computer.

To open a binder from your account on this computer, such as one you made
in the browser, find it under **In your account** in the list of binders
and choose **Open here**. It gets a folder in the Binder folder and syncs.

To stop syncing, choose your name, then **Stop syncing this binder**. The
binder stays on your computer and in your account, and the two no longer
change each other.

The research question stays at the top of the sidebar. Click it to change
it. Binder 0.3 will use it to tell you what a source means for your
project.

## Add sources

Choose **Add to binder** in the sidebar, or press Cmd/Ctrl + N. In the
field you can:

- **paste a DOI**, such as `10.1000/jher.2021.0042`: Binder looks up the
  work at Crossref and fills in its title, authors, year and journal
- **paste an ISBN**: Binder looks up the book at Open Library
- **paste a link**: Binder adds the web page and keeps its text, so you
  can read it in Binder. A link to a PDF adds the PDF.
- **write a thought**: a question for your supervisor, an idea for a
  chapter. Its first line is its title.

Under the field, **File…** adds files from your computer, **Note** adds a
note of your own and **Zotero…** adds works from Zotero. You can also drop
files on the window. Each file is copied into the binder, next to its
item, so the binder holds everything.

## Add from Zotero

Turn on Zotero in **Settings**, at the bottom of the sidebar: the Zotero
app on your computer, or your library at zotero.org with an API key.
Then choose **Add from Zotero…** in the inbox. Pick a collection and add
all of its works at once, or search for one work. Works that are in the
binder already are left out, so you can add a collection again after it
grew. An item from Zotero opens there with **Open in Zotero**.

## Clip from the web

With the Binder Clipper browser extension, you can save a page straight
into a binder: choose the extension's icon, pick the binder and choose
**Save page**, or right-click the page and choose **Save page to
Binder**. Turn on **Highlight on this page** first to mark passages as
you read; they arrive as highlights on the item. See
[the clipper](clipper.md). Clips need a binder in your Scholarkit account
and a sign-in at scholarkit.app/binder once.

## Go through your inbox

Everything new lands in the **Inbox**. Open an item, look at it, and
choose where it goes at the bottom:

- **To read**: worth reading
- **Reading**: you're reading it
- **Processed**: read, and what it means for your project is written down
- **Set aside**: not for this project, or not now

The next item opens, so you can go through the inbox in one go. A thought
goes to your notes with **Keep in notes**.

## Keep your reading list

The **Reading list** shows every source after the inbox, as a list or as
a board. On the board, drag a card to another column to change its
status. On an item, change its status, kind, authors and other details
in the fields under its title.

## Read and highlight

An item with a PDF or a kept web page has **Read** at the top. The source
opens with its highlights and your notes next to it. Zoom with the buttons
at the top, and find text in the source with Cmd/Ctrl + F.

Select text to highlight it. Pick what it is:

- **Claim**: what the authors argue
- **Definition**: how they define a term
- **Method**: how they did the work
- **Finding**: what they found
- **Quote**: words you may want to quote

The highlights are listed next to the source; click one to go back to it.
Drag a highlight into your notes, or choose **Add to notes**: it becomes
a quote with a link to its page. The link opens the source at that page,
also from any other note.

A web page you added before Binder kept pages has **Keep the page text**
under its details. Binder keeps the page's article, without the site's
menus and ads. Keeping pages and adding PDFs from links works in the
desktop app.

## Let the assistant read

The assistant reads a source for you: it proposes what the source is,
sums it up for your research question, says which parts to read closely,
outlines a long source and proposes highlights. It is off until you set
it up in **Settings**, under **Assistant**:

- **A model on your computer**: choose Ollama or LM Studio, and a model
  you have downloaded there. Nothing leaves your computer.
- **A provider**: choose Mistral, OpenAI or Anthropic, paste your own API
  key and choose a model. The text of the sources the assistant reads
  goes to that provider, and Settings names it. Your key is kept in your
  system's credential store. A provider works in the desktop app.
- **Other**: any service that speaks the OpenAI chat API, by its address.

With **Read new sources as they come in** on, the assistant reads each
PDF or web page you add. To have it read one you added before, choose
**Ask the assistant to read it** on the item. **Keep it away** keeps the
assistant from that item, and **Use the assistant in this binder** in
Settings keeps it out of the whole binder.

What the assistant wrote shows under the item's details, marked as the
assistant's and apart from your notes. Nothing in your item changes until
you say so:

- **Proposal**: the kind, title, authors, year and tags it proposes.
  Change what you like, then **Accept**, or **Dismiss** it. An item
  with a proposal has a mark in your inbox.
- **Summary**, **Read closely** and **Outline**: each sentence ends in a
  link to the passage it rests on, which opens the source there. Binder
  checks every passage against the source and leaves out what it can't
  find. **Take over** moves a part to your notes, where it is yours.
- **Proposed highlights**: they show in the reader, dashed, next to your
  own. Keep the ones you want.

A model can still misread a passage. Check what matters against the
source, as you would a note from a fellow student.

## Write notes

Under an item's details you write your notes on it, in blocks: type `/`
for a heading, a list, a quote, a callout, a table or an equation. Type
`@` to cite a work and `[[` to link to another item. Your own notes are
under **Notes** in the sidebar.

Give items tags in the **Tags** field, and find every item with a tag in
the sidebar.

## Find things

Press Cmd/Ctrl + K to search every item: titles, authors, journals, DOIs,
tags and notes, and the text of every PDF and kept page. A match in a
source opens it at its page. Press Cmd/Ctrl + F to find text in the open
item or source.

## Export your references

Choose **Export…** at the top of a list to save its sources as a file
for other tools. Pick a format:

- **BibTeX**, for LaTeX, and for reference managers such as Zotero and
  Mendeley.
- **RIS**, which Zotero, Mendeley, EndNote and most other reference
  managers import.
- **CSL JSON**, for Pandoc, and other tools that format citations in a
  CSL style.

Export the list you're in, such as your reading list or a tag, or the
whole binder. Every source goes in with its authors, year, journal or
publisher, volume, issue, pages, DOI, ISBN, address and tags. Notes and
thoughts are your own writing and stay out. Each source gets a citation
key from its first author and year, such as `okafor2021`.

**Save…** asks where to save the file. In a browser, **Download** saves
it to your downloads. **Copy** puts the references on the clipboard
instead.

## Your files

In the desktop app, a binder is a folder of Markdown files: `binder.md` with the research
question, and an `items` folder with one file for each item, the original
files next to them, and the highlights and what the assistant wrote each
in a file of their own. You can open the items in Cursive, Obsidian
or any text editor, and keep the folder in a synced folder or in Git.
[The binder format](format.md) says what is in each file.
