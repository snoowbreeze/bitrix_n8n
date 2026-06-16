const { src, dest } = require('gulp');

function buildIcons() {
	return src('nodes/**/*.{png,svg}')
		.pipe(dest('dist/nodes'));
}

function copyAssets() {
	return src('nodes/**/*.json')
		.pipe(dest('dist/nodes'));
}

exports['build:icons'] = buildIcons;
exports['build:assets'] = copyAssets;
exports.build = require('gulp').series(buildIcons, copyAssets);
