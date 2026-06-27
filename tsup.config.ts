import { defineConfig } from "tsup";

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
			cli: "src/cli.ts",
		},
		format: ["esm"],
		dts: false,
		shims: true,
		clean: false,
		outExtension() {
			return { js: ".mjs" };
		},
		sourcemap: false,
		minify: false,
	},
]);
