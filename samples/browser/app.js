import { cdbToSql } from "../../dist/index.mjs";

const fileInput = document.querySelector("#cdb-file");
const convertButton = document.querySelector("#convert");
const downloadLink = document.querySelector("#download");
const status = document.querySelector("#status");
const tablesList = document.querySelector("#tables");

let downloadUrl;

function setStatus(message) {
	status.textContent = message;
}

function clearDownload() {
	if (downloadUrl) {
		URL.revokeObjectURL(downloadUrl);
		downloadUrl = undefined;
	}

	downloadLink.href = "#";
	downloadLink.setAttribute("aria-disabled", "true");
}

function renderTables(rows) {
	tablesList.replaceChildren();

	for (const [tableName, tableId] of rows) {
		const item = document.createElement("li");
		item.textContent = `${tableName} (#${tableId})`;
		tablesList.append(item);
	}

	if (rows.length === 0) {
		const item = document.createElement("li");
		item.textContent = "No tables detected";
		tablesList.append(item);
	}
}

async function convertFile() {
	const file = fileInput.files?.[0];
	if (!file) {
		setStatus("Select a .cdb file");
		return;
	}

	convertButton.disabled = true;
	clearDownload();
	setStatus(`Converting ${file.name}...`);

	try {
		const SQL = await initSqlJs({
			locateFile: (filename) =>
				`https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${filename}`,
		});
		const cdbBuffer = await file.arrayBuffer();
		const db = cdbToSql(new Uint8Array(cdbBuffer), SQL);
		const sqliteBytes = db.export();
		const tables = db.exec(
			"SELECT TableName, ID FROM DB_STRUCTURE ORDER BY ID",
		);
		const rows = tables[0]?.values || [];

		renderTables(rows);

		downloadUrl = URL.createObjectURL(
			new Blob([sqliteBytes], { type: "application/vnd.sqlite3" }),
		);
		downloadLink.href = downloadUrl;
		downloadLink.download = file.name.replace(/\.cdb$/i, "") || "converted";
		downloadLink.download += ".sqlite";
		downloadLink.setAttribute("aria-disabled", "false");

		setStatus(
			[
				`File: ${file.name}`,
				`SQLite size: ${sqliteBytes.length} bytes`,
				`Tables : ${rows.length}`,
			].join("\n"),
		);
	} catch (error) {
		renderTables([]);
		setStatus(error instanceof Error ? error.message : String(error));
	} finally {
		convertButton.disabled = false;
	}
}

convertButton.addEventListener("click", () => {
	void convertFile();
});

fileInput.addEventListener("change", () => {
	clearDownload();
	renderTables([]);
	setStatus("File ready. Click Convert.");
});

renderTables([]);
