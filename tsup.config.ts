import { createRequire } from "node:module";
import { defineConfig } from "tsup";

const { version } = createRequire(import.meta.url)("./package.json") as {
	version: string;
};

export default defineConfig([
	{
		entry: {
			index: "src/index.ts",
		},
		format: ["esm", "cjs"],
		dts: true,
		shims: true,
		clean: true,
		outExtension({ format }) {
			return {
				js: format === "esm" ? ".mjs" : ".cjs",
			};
		},
		sourcemap: false,
		minify: false,
	},
	{
		entry: {
			"engines/better-sqlite3": "src/engines/better-sqlite3.ts",
			"engines/sql-js": "src/engines/sql-js.ts",
		},
		format: ["esm", "cjs"],
		dts: true,
		shims: true,
		clean: false,
		external: ["better-sqlite3", "sql.js"],
		outExtension({ format }) {
			return {
				js: format === "esm" ? ".mjs" : ".cjs",
			};
		},
		sourcemap: false,
		minify: false,
	},
	{
		entry: {
			cli: "src/cli.ts",
		},
		format: ["esm"],
		dts: false,
		shims: true,
		clean: false,
		external: ["better-sqlite3"],
		define: {
			CDB_CONVERTER_VERSION: JSON.stringify(version),
		},
		outExtension() {
			return { js: ".mjs" };
		},
		sourcemap: false,
		minify: false,
	},
]);
