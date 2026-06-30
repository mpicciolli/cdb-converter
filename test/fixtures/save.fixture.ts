import { fileURLToPath } from "node:url";

const fixturePath = (year: number) =>
	fileURLToPath(
		new URL(`../fixtures/OfficialRelease-${year}.cdb`, import.meta.url),
	);

export const saveFixtures: Array<[string, string]> = [
	["Pro cycling manager 2014", fixturePath(2014)],
	["Pro cycling manager 2018", fixturePath(2018)],
	["Pro cycling manager 2019", fixturePath(2019)],
	["Pro cycling manager 2021", fixturePath(2021)],
	["Pro cycling manager 2025", fixturePath(2025)],
];
