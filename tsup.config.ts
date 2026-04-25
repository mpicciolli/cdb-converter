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
		sourcemap: false,
		minify: false,
	},
]);
