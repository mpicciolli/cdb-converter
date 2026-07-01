# Browser sample

This sample shows how to use `cdbToSql` in the browser with `sql.js`.

## What it does

- Load a `.cdb` file from an `<input type="file">`
- Convert it to a SQLite database in the browser
- Display the detected tables from `DB_STRUCTURE`
- Download the generated `.sqlite` file

## Run the sample

Serve this folder with any static HTTP server, then open `/samples/browser/` in your browser.

Example with VS Code Live Server or any equivalent local server:

1. Start a local server from the repository root
2. Open `http://127.0.0.1:4173/samples/browser/`
3. Select a `.cdb` file and click **Convert**

## Files

- `index.html` defines the UI
- `app.js` initializes `sql.js`, runs `cdbToSql`, and prepares the SQLite download
