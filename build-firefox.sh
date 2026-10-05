#!/bin/sh
# Builds the Firefox / LibreWolf version: a copy of extension/ with
# manifest.firefox.json as its manifest, zipped as intently-firefox.xpi.
set -e
cd "$(dirname "$0")"
rm -rf dist/firefox intently-firefox.xpi
mkdir -p dist
cp -R extension dist/firefox
mv dist/firefox/manifest.firefox.json dist/firefox/manifest.json
(cd dist/firefox && zip -qr ../../intently-firefox.xpi . -x '.*')
echo "Built dist/firefox and intently-firefox.xpi"
