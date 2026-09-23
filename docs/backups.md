# Backups

Use **Settings & backups** to export or import a Vibe Learn JSON backup. Backups contain notes, bookmarks, reading positions, workspace/exercise references, flashcard review state and run summaries.

Imports merge saved data. Conflicting notes are appended, newer reading positions and flashcard reviews are retained, and repeated imports of the same file are ignored. A SQLite snapshot is saved before importing. Workspace folders must be reattached explicitly on the destination machine; their original paths remain in the exported file for reference.

Learner source files and full run artifacts stay in their own folders. Back those folders up separately. Notes can also be exported as Markdown.
